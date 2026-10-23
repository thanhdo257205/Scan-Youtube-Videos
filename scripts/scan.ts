import { scanChannel } from "../lib/scan";

// Usage: npm run scan [output.xlsx] [@handle] [--style]
const args = process.argv.slice(2);
const style = args.includes("--style");
const [out = "youtube-videos.xlsx", handle] = args.filter((a) => !a.startsWith("--"));

scanChannel(handle, { style, onProgress: console.log })
  .then(async ({ workbook, count }) => {
    await workbook.xlsx.writeFile(out);
    console.log(`Wrote ${count} videos to ${out}`);
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
