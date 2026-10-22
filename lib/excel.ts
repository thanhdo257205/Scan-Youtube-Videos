import ExcelJS from "exceljs";
import type { ClassifiedVideo } from "./types";
import { focusConcepts, OTHER_TOPIC, TOPICS, type TopicDef } from "./topics";

const COLUMNS = [
  { header: "#", key: "n", width: 5 },
  { header: "Title", key: "title", width: 60 },
  { header: "Type", key: "type", width: 9 },
  { header: "Published", key: "published", width: 12 },
  { header: "Duration", key: "duration", width: 10 },
  { header: "Views", key: "views", width: 11 },
  { header: "Likes", key: "likes", width: 9 },
  { header: "Link", key: "link", width: 48 },
];

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function sheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);
}

function styleSheet(ws: ExcelJS.Worksheet, topic: TopicDef, extraCols: boolean) {
  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: topic.color } };
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.properties.tabColor = { argb: topic.color };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  ws.eachRow((row, i) => {
    if (i === 1) return;
    row.alignment = { vertical: "middle", wrapText: true };
    if (i % 2 === 0) {
      row.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: topic.light } };
      });
    }
  });
  void extraCols;
}

function addVideoRows(ws: ExcelJS.Worksheet, videos: ClassifiedVideo[], extra?: (v: ClassifiedVideo) => Record<string, string>) {
  videos.forEach((v, i) => {
    const row = ws.addRow({
      n: i + 1,
      title: v.title,
      type: v.isShort ? "Short" : "Video",
      published: v.publishedAt.slice(0, 10),
      duration: fmtDuration(v.durationSeconds),
      views: v.viewCount,
      likes: v.likeCount,
      link: { text: v.url, hyperlink: v.url },
      ...(extra?.(v) ?? {}),
    });
    row.getCell("link").font = { color: { argb: "FF0563C1" }, underline: true };
    row.getCell("views").numFmt = "#,##0";
    row.getCell("likes").numFmt = "#,##0";
  });
}

export async function buildWorkbook(videos: ClassifiedVideo[], channel: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Scan Youtube Videos";
  wb.created = new Date();

  // Summary sheet.
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Sheet", key: "sheet", width: 32 },
    { header: "Videos", key: "videos", width: 10 },
    { header: "Shorts", key: "shorts", width: 10 },
  ];
  summary.getRow(1).font = { bold: true };

  const topics = [...TOPICS, OTHER_TOPIC];
  const sorted = [...videos].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  for (const topic of topics) {
    const list = sorted.filter((v) => v.topic === topic.name);
    if (!list.length) continue;
    const ws = wb.addWorksheet(sheetName(topic.name));
    ws.columns = COLUMNS;
    addVideoRows(ws, list);
    styleSheet(ws, topic, false);
    summary.addRow({ sheet: topic.name, videos: list.filter((v) => !v.isShort).length, shorts: list.filter((v) => v.isShort).length });
  }

  // Focus sheet: agents vs. automation vs. digital workers.
  const focusTopic: TopicDef = { name: "focus", color: "FFBE123C", light: "FFFFE4E6", keywords: [] };
  const focus = sorted
    .map((v) => ({ v, concepts: focusConcepts(v) }))
    .filter((x) => x.concepts.length)
    .sort((a, b) => b.concepts.length - a.concepts.length || b.v.publishedAt.localeCompare(a.v.publishedAt));
  const fws = wb.addWorksheet("Agents vs Automation vs DW");
  fws.columns = [...COLUMNS, { header: "Topic", key: "topic", width: 22 }, { header: "Matched concepts", key: "concepts", width: 34 }];
  const conceptsByVideo = new Map(focus.map((x) => [x.v.id, x.concepts.join(" + ")]));
  addVideoRows(
    fws,
    focus.map((x) => x.v),
    (v) => ({ topic: v.topic, concepts: conceptsByVideo.get(v.id) ?? "" }),
  );
  styleSheet(fws, focusTopic, true);
  summary.addRow({ sheet: "Agents vs Automation vs DW", videos: focus.filter((x) => !x.v.isShort).length, shorts: focus.filter((x) => x.v.isShort).length });
  summary.addRow({});
  summary.addRow({ sheet: `Channel: ${channel}` });
  summary.addRow({ sheet: `Total: ${videos.length} (${videos.filter((v) => v.isShort).length} Shorts)` });

  return wb;
}
