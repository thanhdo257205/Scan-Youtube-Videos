// Step 3: build the final workbook from work2/channels.json + work2/vids.json + work2/judgments/*.json.
// Usage: npx tsx tools/rescan/build.mts [work2] [out.xlsx]
import ExcelJSmod from "exceljs";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extractSocials, PLATFORMS } from "../../lib/socials.ts";
import { STYLES } from "../../lib/style.ts";

const ExcelJS: typeof ExcelJSmod = (ExcelJSmod as any).default ?? ExcelJSmod;
const [dir = "work2", output = "youtube-channels-rescan.xlsx"] = process.argv.slice(2);

const channels: any[] = JSON.parse(readFileSync(`${dir}/channels.json`, "utf8"));
const sel: any[] = JSON.parse(readFileSync(`${dir}/vids.json`, "utf8"));
const judged: Record<string, string[]> = {};
for (const f of readdirSync(`${dir}/judgments`).filter((f) => f.endsWith(".json")).sort())
  Object.assign(judged, JSON.parse(readFileSync(`${dir}/judgments/${f}`, "utf8")));
const byId = new Map(channels.map((c) => [c.id, c]));

const AI_STYLES = ["Animation", "AI-generated visuals"];
type Row = { c: any; styles: string[]; counts: Map<string, number>; dominant: string; animation: number; ai: number; breakdown: string };
const rows: Row[] = [];
for (const s of sel) {
  const c = byId.get(s.id);
  const styles = (judged[String(s.row)] ?? []).filter((x) => (STYLES as readonly string[]).includes(x));
  if (!c || !styles.length) continue;
  const counts = new Map<string, number>();
  for (const x of styles) counts.set(x, (counts.get(x) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  rows.push({
    c,
    styles,
    counts,
    dominant: ranked[0][0],
    animation: (counts.get("Animation") ?? 0) / styles.length,
    ai: AI_STYLES.reduce((a, k) => a + (counts.get(k) ?? 0), 0) / styles.length,
    breakdown: ranked.map(([k, n]) => `${k} ${n}`).join(", "),
  });
}
rows.sort((a, b) => b.ai - a.ai || b.c.relevance - a.c.relevance || b.c.subs - a.c.subs);

const HEADER: ExcelJSmod.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const LINK = { color: { argb: "FF0563C1" }, underline: true } as const;
const linkCell = (urls?: string[]): ExcelJSmod.CellValue => (!urls?.length ? "" : { text: urls.join("\n"), hyperlink: urls[0] });
const headerStyle = (ws: ExcelJSmod.Worksheet, color = "FF1F2937") => {
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  r.height = 22;
  r.alignment = { vertical: "middle", wrapText: true };
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
};

const wb = new ExcelJS.Workbook();
wb.creator = "Scan Youtube Videos";

const cols = [
  { h: "#", w: 5 }, { h: "Channel", w: 30 }, { h: "YouTube link", w: 44, link: true }, { h: "Subscribers", w: 12 },
  { h: "Videos", w: 8 }, { h: "Total views", w: 13 }, { h: "Country", w: 8 }, { h: "Joined", w: 13 },
  { h: "Last upload", w: 14 }, { h: "Dominant style", w: 20 }, { h: "Animation share", w: 11 }, { h: "AI-made share", w: 11 },
  { h: "Style breakdown", w: 32 }, { h: "Concepts", w: 30 }, { h: "Relevance", w: 9 }, { h: "Found by keywords", w: 34 },
  ...PLATFORMS.map((p) => ({ h: p.label, w: 32, link: true })), { h: "Websites", w: 38, link: true }, { h: "Email", w: 26 },
  { h: "Sampled videos [style]", w: 70 }, { h: "Description", w: 70 },
];
function addChannelSheet(name: string, list: Row[], color: string) {
  const ws = wb.addWorksheet(name);
  ws.columns = cols.map((c) => ({ width: c.w }));
  ws.addRow(cols.map((c) => c.h));
  list.forEach((r, i) => {
    const c = r.c;
    const soc = extractSocials(c.description ?? "", c.links ?? []);
    const vids = (sel.find((s) => s.id === c.id)?.vids ?? []) as { title: string }[];
    const newest = c.vids?.[0]?.publishedText ?? "";
    const row = ws.addRow([
      i + 1, c.name, { text: c.url, hyperlink: c.url }, c.subs, c.videoCount ?? "", c.viewCount ?? "", c.country ?? "", c.joined ?? "",
      newest, r.dominant, r.animation, r.ai, r.breakdown, c.concepts.join(" + "), c.relevance, c.foundBy.join(", "),
      ...PLATFORMS.map((p) => linkCell(soc.byPlatform[p.key])), linkCell(soc.websites), soc.emails.join(", "),
      vids.map((v, k) => `${v.title} [${r.styles[k] ?? "?"}]`).join("\n"), (c.description ?? "").slice(0, 500),
    ]);
    row.alignment = { vertical: "top", wrapText: true };
    cols.forEach((col, j) => { if ((col as any).link) row.getCell(j + 1).font = LINK; });
    for (const n of [4, 5, 6]) row.getCell(n).numFmt = "#,##0";
    row.getCell(11).numFmt = "0%";
    row.getCell(12).numFmt = "0%";
  });
  headerStyle(ws, color);
}

addChannelSheet("All channels", rows, "FF1F2937");
addChannelSheet("AI-made (>=50%)", rows.filter((r) => r.ai >= 0.5), "FFBE123C");
addChannelSheet("Animation (>=40%)", rows.filter((r) => r.animation >= 0.4), "FF0E7490");
addChannelSheet("AI-made (>=20%)", rows.filter((r) => r.ai >= 0.2 && r.ai < 0.5), "FFB45309");

const s = wb.addWorksheet("Summary", { properties: { tabColor: { argb: "FF475569" } } });
s.columns = [{ width: 46 }, { width: 14 }];
const add = (a: string, b?: string | number, bold = false) => { const r = s.addRow([a, b ?? ""]); if (bold) r.font = { bold: true }; };
add("Scan: channels found by keyword search", 4278);
add("Kept: >= 1,000 subscribers", 2812 - 1440);
add("Kept: uploaded in the last 30 days", channels.length);
add("Kept: mention >= 2 of Agents / Automation / Digital Workers", sel.length);
add("Style analysed (5 latest thumbnails each)", rows.length);
s.addRow([]);
add("Dominant style", "Channels", true);
for (const st of STYLES) add(st, rows.filter((r) => r.dominant === st).length);
s.addRow([]);
add("Mostly AI / animation made", "Channels", true);
add("AI-made share >= 50%", rows.filter((r) => r.ai >= 0.5).length);
add("Animation share >= 40%", rows.filter((r) => r.animation >= 0.4).length);
add("AI-made share 20-49%", rows.filter((r) => r.ai >= 0.2 && r.ai < 0.5).length);
s.addRow([]);
add("Links found", "Channels", true);
for (const p of PLATFORMS) add(p.label, rows.filter((r) => extractSocials(r.c.description ?? "", r.c.links ?? []).byPlatform[p.key]?.length).length);
add("Website", rows.filter((r) => extractSocials(r.c.description ?? "", r.c.links ?? []).websites.length).length);
wb.worksheets.unshift(wb.worksheets.pop()!);
await wb.xlsx.writeFile(output);
console.log(`${rows.length} channels -> ${output}`);
console.log("AI>=50%:", rows.filter((r) => r.ai >= 0.5).length, "Anim>=40%:", rows.filter((r) => r.animation >= 0.4).length);
