// Step 4 (ranked): workbook of every active channel ordered by similarity to the reference channel.
// Usage: npx tsx tools/rescan/build-ranked.mts [work2] [out.xlsx]
import ExcelJSmod from "exceljs";
import { readFileSync } from "node:fs";
import { extractSocials, PLATFORMS } from "../../lib/socials.ts";

const ExcelJS: typeof ExcelJSmod = (ExcelJSmod as any).default ?? ExcelJSmod;
const [dir = "work2", output = "youtube-channels-ranked.xlsx"] = process.argv.slice(2);
const ref = JSON.parse(readFileSync(`${dir}/reference.json`, "utf8"));
const channels = new Map<string, any>(JSON.parse(readFileSync(`${dir}/channels.json`, "utf8")).map((c: any) => [c.id, c]));
const ranked: any[] = JSON.parse(readFileSync(`${dir}/ranked.json`, "utf8"));

const LINK = { color: { argb: "FF0563C1" }, underline: true } as const;
const linkCell = (urls?: string[]): ExcelJSmod.CellValue => (!urls?.length ? "" : { text: urls.join("\n"), hyperlink: urls[0] });
const dominant = (st?: string[]) => {
  if (!st) return "not reviewed";
  const n = new Map<string, number>();
  st.forEach((s) => n.set(s, (n.get(s) ?? 0) + 1));
  return [...n].sort((a, b) => b[1] - a[1])[0][0];
};
const breakdown = (st?: string[]) => {
  if (!st) return "";
  const n = new Map<string, number>();
  st.forEach((s) => n.set(s, (n.get(s) ?? 0) + 1));
  return [...n].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
};

const cols: { h: string; w: number; link?: boolean; fmt?: string }[] = [
  { h: "Rank", w: 6 }, { h: "Match score (0-100)", w: 11 }, { h: "Channel", w: 30 }, { h: "YouTube link", w: 44, link: true },
  { h: "Subscribers", w: 12, fmt: "#,##0" }, { h: "Last upload", w: 13 }, { h: "Topic match /40", w: 9 }, { h: "Concept fit /20", w: 9 },
  { h: "Teaching format /15", w: 10 }, { h: "Visual style /20", w: 9 }, { h: "Activity /5", w: 8 }, { h: "Dominant style", w: 20 },
  { h: "Style breakdown", w: 30 }, { h: "Concepts", w: 28 }, { h: "Found by keywords", w: 30 }, { h: "Country", w: 8 }, { h: "Joined", w: 13 },
  ...PLATFORMS.map((p) => ({ h: p.label, w: 30, link: true })), { h: "Websites", w: 36, link: true }, { h: "Email", w: 24 },
  { h: "Latest videos [style]", w: 70 }, { h: "Description", w: 60 },
];

function sheet(wb: ExcelJSmod.Workbook, name: string, rows: any[], color: string) {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: color } } });
  ws.columns = cols.map((c) => ({ width: c.w }));
  ws.addRow(cols.map((c) => c.h));
  for (const r of rows) {
    const c = channels.get(r.id);
    const soc = extractSocials(c.description ?? "", c.links ?? []);
    const row = ws.addRow([
      r.rank, r.score, c.name, { text: c.url, hyperlink: c.url }, c.subs, c.vids?.[0]?.publishedText ?? "", r.topic, r.concept, r.teach, r.style, r.activity,
      dominant(r.styles), breakdown(r.styles), r.hit.join(" + "), c.foundBy.join(", "), c.country ?? "", c.joined ?? "",
      ...PLATFORMS.map((p) => linkCell(soc.byPlatform[p.key])), linkCell(soc.websites), soc.emails.join(", "),
      c.vids.map((v: any, i: number) => `${v.title} [${r.styles?.[i] ?? "-"}]`).join("\n"), (c.description ?? "").slice(0, 400),
    ]);
    row.alignment = { vertical: "top", wrapText: true };
    cols.forEach((col, j) => {
      if (col.link) row.getCell(j + 1).font = LINK;
      if (col.fmt) row.getCell(j + 1).numFmt = col.fmt;
    });
    row.getCell(2).font = { bold: true };
  }
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  h.height = 34;
  h.alignment = { vertical: "middle", wrapText: true, horizontal: "center" };
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 3 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

const wb = new ExcelJS.Workbook();
wb.creator = "Scan Youtube Videos";
const info = wb.addWorksheet("How it is ranked", { properties: { tabColor: { argb: "FF475569" } } });
info.columns = [{ width: 26 }, { width: 110 }];
const put = (a: string, b = "", bold = false) => (info.addRow([a, b]).font = { bold });
put(`Reference channel: ${ref.name}`, `${ref.titles.length} video titles + channel description are used as the reference content.`, true);
put("");
put("Component", "How it is computed", true);
put("Topic match (0-40)", "TF-IDF cosine similarity between a channel's text (name, description, 5 latest video titles) and the reference text, converted to a percentile among all channels.");
put("Concept fit (0-20)", "Agents / Automation / Digital Workers: +4 per concept present in the channel text, +2 if it is in at least 2 of the 5 latest titles, +1 more if in 4+; +1 bonus if all three.");
put("Teaching format (0-15)", "Share of the 5 latest titles that are tutorial-like (how to, step by step, build, start to finish, guide, roadmap, full course...) x 15.");
put("Visual style (0-20)", "From thumbnail review of the 5 latest videos: Animation share x 15 + (Animation + AI-generated share) x 5. Channels not reviewed score 0 here, like talking-head channels.");
put("Activity (0-5)", "5 if the newest video is <= 7 days old, 3 if <= 14 days, otherwise 1 (all channels here posted in the last 30 days).");
put("");
put("Scope", `${ranked.length} channels with >= 1,000 subscribers and an upload in the last 30 days, found by 35 keyword searches.`);
put("Reviewed styles", `${ranked.filter((r) => r.styles).length} channels have a thumbnail review; the rest show 'not reviewed' and 0 style points, so their true rank may be a bit higher.`);
put("Caveat", "Scores are heuristics for ordering, not a quality judgement. Style labels come from reading thumbnails, not watching videos.");

sheet(wb, "Ranked (all)", ranked, "FF1F2937");
sheet(wb, "Top 100", ranked.slice(0, 100), "FFBE123C");
sheet(wb, "Same style (animation)", ranked.filter((r) => (r.anim ?? 0) >= 0.4), "FF0E7490");
await wb.xlsx.writeFile(output);
console.log(`${ranked.length} channels -> ${output}`);
