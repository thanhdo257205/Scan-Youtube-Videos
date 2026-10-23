import ExcelJS from "exceljs";
import type { ChannelRow } from "./channels";
import { PLATFORMS } from "./socials";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const LINK_FONT: Partial<ExcelJS.Font> = { color: { argb: "FF0563C1" }, underline: true };

function linkCell(urls: string[] | undefined): ExcelJS.CellValue {
  if (!urls?.length) return "";
  // Several links in one cell can't all be clickable: link the first, list the rest as text.
  return urls.length === 1 ? { text: urls[0], hyperlink: urls[0] } : { text: urls.join("\n"), hyperlink: urls[0] };
}

export async function buildChannelsWorkbook(rows: ChannelRow[], keywords: string[]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Scan Youtube Videos";
  wb.created = new Date();

  const ws = wb.addWorksheet("Channels");
  const columns: { header: string; width: number; link?: boolean }[] = [
    { header: "#", width: 5 },
    { header: "Channel", width: 30 },
    { header: "YouTube link", width: 44, link: true },
    { header: "Subscribers", width: 12 },
    { header: "Videos", width: 8 },
    { header: "Total views", width: 13 },
    { header: "Country", width: 9 },
    { header: "Created", width: 12 },
    { header: "Channel ID", width: 26 },
    { header: "Concepts", width: 28 },
    { header: "Relevance", width: 10 },
    { header: "Found by keywords", width: 34 },
    ...PLATFORMS.map((p) => ({ header: p.label, width: 34, link: true })),
    { header: "Websites", width: 38, link: true },
    { header: "Email", width: 28 },
    { header: "Description", width: 70 },
  ];
  ws.columns = columns.map((c) => ({ width: c.width }));
  const header = ws.addRow(columns.map((c) => c.header));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = HEADER_FILL;
  header.height = 22;
  header.alignment = { vertical: "middle" };

  rows.forEach((r, i) => {
    const row = ws.addRow([
      i + 1,
      r.title,
      { text: r.url, hyperlink: r.url },
      r.subscribers ?? "hidden",
      r.videoCount,
      r.viewCount,
      r.country,
      r.createdAt,
      r.id,
      r.concepts.join(" + "),
      r.relevance,
      r.foundBy.join(", "),
      ...PLATFORMS.map((p) => linkCell(r.socials.byPlatform[p.key])),
      linkCell(r.socials.websites),
      r.socials.emails.join(", "),
      r.description.slice(0, 500),
    ]);
    row.alignment = { vertical: "top", wrapText: true };
    columns.forEach((c, j) => {
      if (c.link) row.getCell(j + 1).font = LINK_FONT;
    });
    for (const n of [4, 5, 6]) row.getCell(n).numFmt = "#,##0";
  });
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const s = wb.addWorksheet("Summary");
  s.columns = [{ width: 34 }, { width: 14 }];
  s.addRow(["Keywords searched", keywords.join(", ")]);
  s.addRow(["Channels found", rows.length]);
  s.addRow([]);
  s.addRow(["Channels with link on...", ""]).font = { bold: true };
  for (const p of PLATFORMS) s.addRow([p.label, rows.filter((r) => r.socials.byPlatform[p.key]?.length).length]);
  s.addRow(["Website", rows.filter((r) => r.socials.websites.length).length]);
  s.addRow(["Email", rows.filter((r) => r.socials.emails.length).length]);
  return wb;
}
