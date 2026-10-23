import { DEFAULT_KEYWORDS, scanChannels } from "../lib/channels";
import { buildChannelsWorkbook } from "../lib/channels-excel";

// Usage: npm run channels [output.xlsx] ["keyword one" "keyword two" ...]
const [out = "youtube-channels.xlsx", ...kw] = process.argv.slice(2);
const keywords = kw.length ? kw : DEFAULT_KEYWORDS;
const key = process.env.YOUTUBE_API_KEY;
if (!key) {
  console.error("Missing YOUTUBE_API_KEY environment variable (see .env.example)");
  process.exit(1);
}

scanChannels({ key, keywords, pages: Number(process.env.SEARCH_PAGES) || 1, onProgress: console.log })
  .then(async (rows) => {
    await (await buildChannelsWorkbook(rows, keywords)).xlsx.writeFile(out);
    console.log(`Wrote ${rows.length} channels to ${out}`);
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
