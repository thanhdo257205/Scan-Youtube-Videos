// Step 1: pick channels from the channels workbook and list their latest videos (no API key needed).
// Usage: npx tsx tools/manual-style/prepare.mts [work/channels.xlsx] [work] [minSubs=1000]
import ExcelJSmod from "exceljs";
const ExcelJS: typeof ExcelJSmod = (ExcelJSmod as any).default ?? ExcelJSmod;
import { mkdirSync, writeFileSync } from "node:fs";

const [input = "work/channels.xlsx", dir = "work", minSubsArg = "1000"] = process.argv.slice(2);
const minSubs = Number(minSubsArg);
const KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"; // public key embedded in youtube.com pages
const CONTEXT = { client: { clientName: "WEB", clientVersion: "2.20250101.00.00", hl: "en", gl: "US" } };

async function innertube(endpoint: string, body: object): Promise<any> {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`https://youtubei.googleapis.com/youtubei/v1/${endpoint}?key=${KEY}&prettyPrint=false`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" },
        body: JSON.stringify({ context: CONTEXT, ...body }),
      });
      if (r.ok) return await r.json();
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500 * (a + 1)));
  }
}

async function latest(link: string, count = 5): Promise<{ id: string; title: string }[]> {
  const id = (await innertube("navigation/resolve_url", { url: link }))?.endpoint?.browseEndpoint?.browseId;
  if (!id) return [];
  const page = await innertube("browse", { browseId: id, params: "EgZ2aWRlb3PyBgQKAjoA" }); // Videos tab
  const found: { id: string; title: string }[] = [];
  (function walk(n: any) {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") {
      if (n.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" && n.contentId)
        found.push({ id: n.contentId, title: n.metadata?.lockupMetadataViewModel?.title?.content ?? "" });
      Object.values(n).forEach(walk);
    }
  })(page);
  const seen = new Set<string>();
  return found.filter((v) => !seen.has(v.id) && seen.add(v.id)).slice(0, count);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(input);
const ws = wb.getWorksheet("Channels") ?? wb.worksheets[0];
const col = new Map<string, number>();
ws.getRow(1).eachCell((c, n) => col.set(String(c.value), n));
const text = (c: ExcelJS.Cell) => {
  const v = c.value as any;
  return v && typeof v === "object" ? String(v.hyperlink ?? v.text ?? "") : String(v ?? "");
};

const picked: { row: number; name: string; link: string; subs: number }[] = [];
for (let n = 2; n <= ws.rowCount; n++) {
  const r = ws.getRow(n);
  const subs = Number(r.getCell(col.get("Subscribers")!).value);
  const concepts = text(r.getCell(col.get("Concepts")!)).trim();
  if (concepts && subs >= minSubs) picked.push({ row: n, name: text(r.getCell(col.get("Channel")!)), link: text(r.getCell(col.get("YouTube link")!)), subs });
}

const out: any[] = new Array(picked.length);
let next = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (next < picked.length) {
      const i = next++;
      out[i] = { ...picked[i], vids: await latest(picked[i].link) };
    }
  }),
);
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/vids.json`, JSON.stringify(out, null, 1));
console.log(`${out.length} channels, ${out.reduce((a, c) => a + c.vids.length, 0)} videos -> ${dir}/vids.json`);
