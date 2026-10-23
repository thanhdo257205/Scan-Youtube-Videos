import ExcelJS from "exceljs";
import { mapPool } from "./channels";
import { analyzeStyles, StyleAbort, TARGET_STYLE } from "./style";
import type { ClassifiedVideo } from "./types";
import { api } from "./youtube";

interface Sample {
  id: string;
  title: string;
  publishedAt?: string;
  style?: string;
  confidence?: number;
}

export interface ChannelStyle {
  samples: Sample[];
  analysed: number;
  dominant: string;
  breakdown: string;
  targetShare: number | null;
  /** Share of videos that are Animation or AI-generated visuals (i.e. made with AI/animation tools). */
  aiShare?: number | null;
  /** Date (yyyy-mm-dd) of the newest sampled video. */
  lastUpload?: string;
  inactive?: boolean;
}

type ChannelRef = { id: string } | { handle: string };

function cellText(c: ExcelJS.Cell): string {
  const v = c.value as any;
  if (v && typeof v === "object") return String(v.hyperlink ?? v.text ?? "");
  return String(v ?? "");
}

export function parseRef(idCell: string, link: string): ChannelRef | undefined {
  if (/^UC[\w-]{22}$/.test(idCell.trim())) return { id: idCell.trim() };
  const id = link.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
  if (id) return { id: id[1] };
  const handle = link.match(/youtube\.com\/(@[^/?#]+)/);
  if (handle) return { handle: decodeURIComponent(handle[1]) };
  return undefined;
}

async function latestVideos(ref: ChannelRef, count: number, key: string): Promise<Sample[]> {
  const ch = await api<{ items?: { contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(
    "channels",
    { part: "contentDetails", ...("id" in ref ? { id: ref.id } : { forHandle: ref.handle }) },
    key,
  );
  const uploads = ch.items?.[0]?.contentDetails.relatedPlaylists.uploads;
  if (!uploads) return [];
  let pl: { items: { contentDetails: { videoId: string; videoPublishedAt?: string }; snippet: { title: string } }[] };
  try {
    pl = await api("playlistItems", { part: "snippet,contentDetails", playlistId: uploads, maxResults: String(count) }, key);
  } catch (e) {
    // Deleted, hidden or video-less channels: nothing to sample.
    if (e instanceof Error && /playlistNotFound/.test(e.message)) return [];
    throw e;
  }
  return pl.items.map((i) => ({ id: i.contentDetails.videoId, title: i.snippet.title, publishedAt: i.contentDetails.videoPublishedAt }));
}

export function summarise(samples: Sample[]): ChannelStyle {
  const done = samples.filter((s) => s.style);
  const counts = new Map<string, number>();
  for (const s of done) counts.set(s.style!, (counts.get(s.style!) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    samples,
    analysed: done.length,
    dominant: ranked[0]?.[0] ?? "n/a",
    breakdown: ranked.map(([s, n]) => `${s} ${n}`).join(", "),
    targetShare: done.length ? (counts.get(TARGET_STYLE) ?? 0) / done.length : null,
    aiShare: done.length ? ((counts.get(TARGET_STYLE) ?? 0) + (counts.get("AI-generated visuals") ?? 0)) / done.length : null,
    lastUpload: samples.map((s) => s.publishedAt).filter(Boolean).sort().at(-1)?.slice(0, 10),
  };
}

export interface Options {
  input: string;
  output: string;
  key: string;
  samples: number;
  /** Only analyse channels with at least this many subscribers. */
  minSubs?: number;
  /** Only analyse channels that matched Agents / Automation / Digital Workers. */
  withConcepts?: boolean;
  /** Analyse at most this many channels (in file order). */
  limit?: number;
  /** Drop channels whose newest video is older than this many days (or that have no videos). */
  activeDays?: number;
  onProgress?: (msg: string) => void;
}

export interface Outcome {
  channels: number;
  animation: number;
  /** Channels skipped because they have not uploaded recently. */
  inactive: number;
  /** Set when Gemini stopped working; the file then holds partial results. */
  incomplete?: string;
}

export async function addChannelStyles(o: Options): Promise<Outcome> {
  const log = o.onProgress ?? (() => {});
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(o.input);
  const ws = wb.getWorksheet("Channels") ?? wb.worksheets[0];

  const col = new Map<string, number>();
  ws.getRow(1).eachCell((c, n) => col.set(String(c.value), n));
  const linkCol = col.get("YouTube link");
  if (!linkCol) throw new Error('Column "YouTube link" not found; is this a file made by `npm run channels`?');
  const idCol = col.get("Channel ID");

  const subsCol = col.get("Subscribers");
  const conceptsCol = col.get("Concepts");
  const rows: { n: number; ref: ChannelRef }[] = [];
  for (let n = 2; n <= ws.rowCount; n++) {
    const row = ws.getRow(n);
    const ref = parseRef(idCol ? cellText(row.getCell(idCol)) : "", cellText(row.getCell(linkCol)));
    if (!ref) continue;
    if (o.minSubs && subsCol) {
      const subs = Number(row.getCell(subsCol).value);
      if (!(subs >= o.minSubs)) continue; // also skips hidden subscriber counts
    }
    if (o.withConcepts && conceptsCol && !cellText(row.getCell(conceptsCol)).trim()) continue;
    rows.push({ n, ref });
  }
  if (o.limit) rows.length = Math.min(rows.length, o.limit);
  log(`Reading latest ${o.samples} videos of ${rows.length} channels (of ${ws.rowCount - 1} in the file)...`);

  const byRow = new Map<number, Sample[]>();
  await mapPool(rows, 5, async ({ n, ref }) => {
    try {
      byRow.set(n, await latestVideos(ref, o.samples, o.key));
    } catch (e) {
      console.warn(`Row ${n}: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`);
      byRow.set(n, []);
    }
  });

  // Drop channels with no recent upload before spending any Gemini quota on them.
  const inactive = new Map<number, ChannelStyle>();
  if (o.activeDays) {
    const cutoff = Date.now() - o.activeDays * 86_400_000;
    for (const [n, samples] of [...byRow]) {
      const newest = samples.map((x) => x.publishedAt).filter(Boolean).sort().at(-1);
      if (samples.length && !newest) continue; // dates unavailable: keep the channel
      if (!newest || Date.parse(newest) < cutoff) {
        const last = newest?.slice(0, 10);
        inactive.set(n, { samples: [], analysed: 0, dominant: "Inactive", breakdown: last ? `No upload in ${o.activeDays} days` : "No videos", targetShare: null, lastUpload: last, inactive: true });
        byRow.delete(n);
      }
    }
    if (inactive.size) log(`Skipping ${inactive.size} channels without an upload in the last ${o.activeDays} days`);
  }

  // One shared run so thumbnails are batched across channels.
  const all: ClassifiedVideo[] = [...byRow.values()].flat().map((s) => ({
    id: s.id,
    title: s.title,
    description: "",
    tags: [],
    publishedAt: "",
    durationSeconds: 0,
    isShort: false,
    viewCount: 0,
    likeCount: 0,
    url: `https://www.youtube.com/watch?v=${s.id}`,
    topic: "",
  }));
  let incomplete: string | undefined;
  let styled = all;
  try {
    styled = await analyzeStyles(all, log);
  } catch (e) {
    if (!(e instanceof StyleAbort)) throw e;
    incomplete = e.message;
    styled = e.partial; // keep what was analysed so far
  }
  const analysed = new Map(styled.map((v) => [v.id, v]));
  for (const samples of byRow.values()) {
    for (const s of samples) {
      s.style = analysed.get(s.id)?.style;
      s.confidence = analysed.get(s.id)?.styleConfidence;
    }
  }

  const results = new Map<number, ChannelStyle>([...byRow].map(([n, samples]) => [n, summarise(samples)] as [number, ChannelStyle]));
  for (const [n, r] of inactive) results.set(n, r);
  const written = await writeResults(wb, ws, results, o.output);
  return { ...written, inactive: inactive.size, incomplete };
}

export async function writeResults(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  results: Map<number, ChannelStyle>,
  output: string,
): Promise<{ channels: number; animation: number }> {
  const base = ws.columnCount;
  const heads = ["Dominant style", `${TARGET_STYLE} share`, "AI-made share", "Videos analysed", "Style breakdown", "Last upload", "Sampled videos"];
  const headRow = ws.getRow(1);
  heads.forEach((h, i) => {
    const c = headRow.getCell(base + 1 + i);
    c.value = h;
    c.style = { ...headRow.getCell(1).style };
  });
  [18, 14, 14, 10, 34, 13, 70].forEach((w, i) => (ws.getColumn(base + 1 + i).width = w));

  let animation = 0;
  for (const [n, r] of results) {
    const row = ws.getRow(n);
    row.getCell(base + 1).value = r.dominant;
    row.getCell(base + 2).value = r.targetShare ?? "";
    row.getCell(base + 2).numFmt = "0%";
    row.getCell(base + 3).value = r.aiShare ?? "";
    row.getCell(base + 3).numFmt = "0%";
    row.getCell(base + 4).value = r.analysed;
    row.getCell(base + 5).value = r.breakdown;
    row.getCell(base + 6).value = r.lastUpload ?? "";
    row.getCell(base + 7).value = r.samples.map((s) => `${s.title} [${s.style ?? "?"}]`).join("\n");
    row.getCell(base + 7).alignment = { wrapText: true, vertical: "top" };
    if ((r.targetShare ?? 0) >= 0.5) animation++;
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: base + heads.length } };

  // Separate sheet with the channels that mostly use the target style.
  const name = `${TARGET_STYLE} channels`;
  const out = wb.addWorksheet(name);
  const colOf = new Map<string, number>();
  headRow.eachCell((c, n) => colOf.set(String(c.value), n));
  const pick = ["Channel", "YouTube link", "Subscribers"].filter((h) => colOf.has(h));
  out.columns = [...pick, `${TARGET_STYLE} share`, "Breakdown"].map((h) => ({ header: h, width: h === "YouTube link" ? 46 : 26 }));
  out.getRow(1).font = { bold: true };
  const winners = [...results].filter(([, r]) => (r.targetShare ?? 0) >= 0.5).sort((a, b) => b[1].targetShare! - a[1].targetShare!);
  for (const [n, r] of winners) {
    const src = ws.getRow(n);
    out.addRow([...pick.map((h) => src.getCell(colOf.get(h)!).value), r.targetShare, r.breakdown]);
    out.lastRow!.getCell(pick.length + 1).numFmt = "0%";
  }
  // Channels whose videos are mostly made with animation / generative-AI visuals.
  const ai = wb.addWorksheet("AI-made channels");
  ai.columns = [...pick, "AI-made share", `${TARGET_STYLE} share`, "Breakdown"].map((h) => ({ header: h, width: h === "YouTube link" ? 46 : 26 }));
  ai.getRow(1).font = { bold: true };
  const aiWinners = [...results].filter(([, r]) => (r.aiShare ?? 0) >= 0.5).sort((a, b) => b[1].aiShare! - a[1].aiShare! || (b[1].targetShare ?? 0) - (a[1].targetShare ?? 0));
  for (const [n, r] of aiWinners) {
    const src = ws.getRow(n);
    ai.addRow([...pick.map((h) => src.getCell(colOf.get(h)!).value), r.aiShare, r.targetShare, r.breakdown]);
    ai.lastRow!.getCell(pick.length + 1).numFmt = "0%";
    ai.lastRow!.getCell(pick.length + 2).numFmt = "0%";
  }
  await wb.xlsx.writeFile(output);
  return { channels: results.size, animation };
}
