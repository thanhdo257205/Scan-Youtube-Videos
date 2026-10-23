// Step 2: for each candidate read subscribers + 5 latest videos, drop small/inactive channels, then read the About panel.
// Usage: npx tsx tools/rescan/enrich.mts [work2] [minSubs=1000] [activeDays=30]
import { readFileSync, writeFileSync } from "node:fs";
import { ageDays, innertube, parseCount, pool, walk } from "./yt.mts";

const [dir = "work2", minSubsArg = "1000", activeArg = "30"] = process.argv.slice(2);
const minSubs = Number(minSubsArg);
const activeDays = Number(activeArg);
const VIDEOS_TAB = "EgZ2aWRlb3PyBgQKAjoA";

const CONCEPTS = [
  { label: "Agents", re: /\b(ai[\s-])?agents?\b|agentic|\bmcp\b/i },
  { label: "Automation", re: /automat|\bn8n\b|zapier|make\.com|workflow/i },
  { label: "Digital Workers", re: /digital[\s-]?workers?|ai[\s-](employees?|workforce|staff|team)|virtual (employees?|assistants?)|\bemployees?\b/i },
];

type Cand = { id: string; name: string; subsText?: string; foundBy: string[] };
const cands: Cand[] = JSON.parse(readFileSync(`${dir}/candidates.json`, "utf8"));

function subsFrom(page: any): number | undefined {
  let found: string | undefined;
  walk(page, (o) => {
    for (const v of Object.values(o)) if (!found && typeof v === "string" && /^[\d.,]+\s*[KMB]?\s+subscribers?$/i.test(v.trim())) found = v;
  });
  return parseCount(found);
}

function videosFrom(page: any, count = 5) {
  const found: { id: string; title: string; publishedText?: string; viewsText?: string }[] = [];
  walk(page, (o) => {
    if (o.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" && o.contentId) {
      const parts = o.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts ?? [];
      found.push({ id: o.contentId, title: o.metadata?.lockupMetadataViewModel?.title?.content ?? "", viewsText: parts[0]?.text?.content, publishedText: parts[1]?.text?.content });
    } else if (o.videoId && o.lengthText && (o.title?.runs || o.title?.simpleText)) {
      found.push({ id: o.videoId, title: o.title.simpleText ?? o.title.runs.map((r: any) => r.text).join(""), viewsText: o.viewCountText?.simpleText, publishedText: o.publishedTimeText?.simpleText });
    }
  });
  const seen = new Set<string>();
  return found.filter((v) => !seen.has(v.id) && seen.add(v.id)).slice(0, count);
}

async function about(id: string) {
  const page = await innertube("browse", { browseId: id });
  let token: string | undefined;
  walk(page, (o, p) => {
    const t = o.continuationCommand?.token;
    if (t && /itemSectionRenderer>contents>continuationItemRenderer/.test(p)) token = t;
  });
  const meta = page?.metadata?.channelMetadataRenderer;
  const out: any = { handle: (meta?.vanityChannelUrl ?? "").split("/").pop() || "", description: meta?.description ?? "", links: [] as { title: string; url: string }[] };
  if (!token) return out;
  const a = await innertube("browse", { continuation: token });
  walk(a, (o) => {
    const v = o.aboutChannelViewModel;
    if (v) {
      out.description = v.description ?? out.description;
      out.subsText = v.subscriberCountText;
      out.viewCount = parseCount(v.viewCountText);
      out.videoCount = parseCount(v.videoCountText);
      out.joined = (v.joinedDateText?.content ?? "").replace(/^Joined\s+/, "");
      out.country = v.country ?? "";
    }
    const l = o.channelExternalLinkViewModel;
    if (l?.link?.content) {
      let url = /^https?:\/\//i.test(l.link.content) ? l.link.content : `https://${l.link.content}`;
      const redirect = l.link.commandRuns?.[0]?.onTap?.innertubeCommand?.urlEndpoint?.url;
      try {
        const q = redirect && new URL(redirect).searchParams.get("q");
        if (q) url = q;
      } catch {
        /* keep url */
      }
      out.links.push({ title: l.title?.content ?? "", url });
    }
  });
  return out;
}

// Cheap drop first: search results often already show the subscriber count.
const todo = cands.filter((c) => !(parseCount(c.subsText) !== undefined && parseCount(c.subsText)! < minSubs));
console.log(`${cands.length} candidates, ${todo.length} after dropping known-small channels`);

const stats = { small: 0, inactive: 0, kept: 0, failed: 0 };
let done = 0;
const kept: any[] = [];
await pool(todo, 8, async (c) => {
  const page = await innertube("browse", { browseId: c.id, params: VIDEOS_TAB });
  if (!page) stats.failed++;
  else {
    const subs = subsFrom(page) ?? parseCount(c.subsText);
    const vids = videosFrom(page);
    const age = ageDays(vids[0]?.publishedText);
    if (subs === undefined || subs < minSubs) stats.small++;
    else if (!vids.length || age === undefined || age > activeDays) stats.inactive++;
    else {
      stats.kept++;
      kept.push({ id: c.id, name: c.name, foundBy: c.foundBy, subs, vids, newestAge: age });
    }
  }
  if (++done % 200 === 0) console.log(`checked ${done}/${todo.length}`, JSON.stringify(stats));
});
console.log("stage 1 done", JSON.stringify(stats));

await pool(kept, 6, async (k) => {
  const a = await about(k.id);
  Object.assign(k, a);
  k.url = k.handle ? `https://www.youtube.com/${k.handle}` : `https://www.youtube.com/channel/${k.id}`;
  const text = `${k.name} ${k.description} ${k.vids.map((v: any) => v.title).join(" ")}`;
  k.concepts = CONCEPTS.filter((c) => c.re.test(text)).map((c) => c.label);
  k.relevance = k.concepts.length * 2 + k.foundBy.length;
});
kept.sort((a, b) => b.relevance - a.relevance || b.subs - a.subs);
writeFileSync(`${dir}/channels.json`, JSON.stringify(kept, null, 1));
console.log(`${kept.length} active channels >= ${minSubs} subs -> ${dir}/channels.json`);
