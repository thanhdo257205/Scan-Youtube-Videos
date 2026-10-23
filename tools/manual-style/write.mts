// Step 4: merge judgments (work/judgments/*.json) into a copy of the channels workbook.
// Usage: npx tsx tools/manual-style/write.mts [work/channels.xlsx] [work] [youtube-channels-style.xlsx]
import ExcelJSmod from "exceljs";
const ExcelJS: typeof ExcelJSmod = (ExcelJSmod as any).default ?? ExcelJSmod;
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { summarise, writeResults } from "../../lib/channel-style.ts";
import { STYLES } from "../../lib/style.ts";

const [input = "work/channels.xlsx", dir = "work", output = "youtube-channels-style.xlsx"] = process.argv.slice(2);
const chans: { row: number; vids: { id: string; title: string }[] }[] = JSON.parse(readFileSync(`${dir}/vids.json`, "utf8"));
const judged: Record<string, string[]> = {};
const jdir = `${dir}/judgments`;
if (existsSync(jdir))
  for (const f of readdirSync(jdir).filter((f) => f.endsWith(".json")).sort()) Object.assign(judged, JSON.parse(readFileSync(`${jdir}/${f}`, "utf8")));

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(input);
const ws = wb.getWorksheet("Channels") ?? wb.worksheets[0];
const results = new Map();
let bad = 0;
for (const c of chans) {
  const styles = judged[String(c.row)];
  if (!styles) continue; // not judged yet -> stays empty
  results.set(
    c.row,
    summarise(
      c.vids.map((v, i) => {
        const s = styles[i];
        if (s && !(STYLES as readonly string[]).includes(s)) bad++;
        return { id: v.id, title: v.title, style: s && (STYLES as readonly string[]).includes(s) ? s : undefined, confidence: 0.8 };
      }),
    ),
  );
}
console.log(`${results.size}/${chans.length} channels judged, ${bad} invalid style names ignored`);
console.log(await writeResults(wb, ws, results, output));

// Keep only the judged channels in the "Channels" sheet (the filtered list), renumber "#".
const wb2 = new ExcelJS.Workbook();
await wb2.xlsx.readFile(output);
const ws2 = wb2.getWorksheet("Channels") ?? wb2.worksheets[0];
for (let n = ws2.rowCount; n >= 2; n--) if (!results.has(n)) ws2.spliceRows(n, 1);
for (let n = 2; n <= ws2.rowCount; n++) ws2.getRow(n).getCell(1).value = n - 1;
ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws2.columnCount } };
await wb2.xlsx.writeFile(output);
console.log(`Kept ${ws2.rowCount - 1} channels in the Channels sheet`);
