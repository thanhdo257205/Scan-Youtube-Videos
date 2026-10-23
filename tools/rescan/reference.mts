// Collect the reference channel's content (titles + description) used to rank other channels.
// Usage: npx tsx tools/rescan/reference.mts "@Professor-Glitch-automation" [work2]
import { writeFileSync } from "node:fs";
import { innertube, walk } from "./yt.mts";

const [handle = "@Professor-Glitch-automation", dir = "work2"] = process.argv.slice(2);
const id = (await innertube("navigation/resolve_url", { url: `https://www.youtube.com/${handle}` }))?.endpoint?.browseEndpoint?.browseId;
if (!id) throw new Error("channel not found");
const titles: string[] = [];
let page = await innertube("browse", { browseId: id, params: "EgZ2aWRlb3PyBgQKAjoA" });
for (let p = 0; p < 6 && page; p++) {
  let next: string | undefined;
  walk(page, (o) => {
    if (o.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") titles.push(o.metadata?.lockupMetadataViewModel?.title?.content ?? "");
    const t = o.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (t) next = t;
  });
  if (!next) break;
  page = await innertube("browse", { continuation: next });
}
const meta = (await innertube("browse", { browseId: id }))?.metadata?.channelMetadataRenderer;
const uniq = [...new Set(titles.filter(Boolean))];
writeFileSync(`${dir}/reference.json`, JSON.stringify({ id, name: meta?.title, description: meta?.description ?? "", titles: uniq }, null, 1));
console.log(`${meta?.title}: ${uniq.length} titles`);
