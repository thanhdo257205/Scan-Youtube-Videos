import { scanChannel } from "../lib/scan";

const out = process.argv[2] || "youtube-videos.xlsx";
const handle = process.argv[3];

scanChannel(handle)
  .then(async ({ workbook, count }) => {
    await workbook.xlsx.writeFile(out);
    console.log(`Wrote ${count} videos to ${out}`);
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
