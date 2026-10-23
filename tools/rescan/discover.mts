// Step 1: find candidate channels with many keyword searches (channel search + "this month" video search).
// Usage: npx tsx tools/rescan/discover.mts [work2] [pages=5]
import { mkdirSync, writeFileSync } from "node:fs";
import { innertube, pool, walk } from "./yt.mts";

const [dir = "work2", pagesArg = "5"] = process.argv.slice(2);
const PAGES = Number(pagesArg);
const KEYWORDS = [
  "AI agents", "AI agents tutorial", "AI agents for beginners", "AI agents vs automation", "AI agents explained",
  "AI automation", "AI automation tutorial", "AI automation agency", "AI business automation", "AI automation for small business",
  "digital workers", "AI digital workers", "AI employees", "build AI employee", "AI workforce", "AI virtual assistant for business",
  "agentic AI", "agentic workflows", "no-code AI agents", "AI agent builder", "AI sales agent", "AI operator",
  "n8n AI agents", "n8n automation", "Make.com automation", "Zapier AI automation",
  "Claude Code automation", "Claude agents", "MCP AI agents", "Hermes agent", "OpenClaw agent",
  "automate your job with AI", "AI second brain", "agent vs workflow", "AI automation step by step",
];
const CHANNEL_FILTER = "EgIQAg%3D%3D"; // type = channel
const MONTH_VIDEO_FILTER = "EgQIBBAB"; // uploaded this month + type = video

type Cand = { id: string; name: string; subsText?: string; foundBy: Set<string> };
const cands = new Map<string, Cand>();
const add = (id: string | undefined, name: string | undefined, kw: string, subsText?: string) => {
  if (!id || !id.startsWith("UC")) return;
  const c = cands.get(id) ?? { id, name: name ?? "", foundBy: new Set<string>() };
  c.foundBy.add(kw);
  if (subsText && /subscriber/i.test(subsText)) c.subsText = subsText;
  cands.set(id, c);
};

async function search(kw: string, params: string, kind: "channel" | "video") {
  let page = await innertube("search", { query: kw, params });
  for (let p = 0; p < PAGES && page; p++) {
    let next: string | undefined;
    walk(page, (o) => {
      if (kind === "channel" && o.channelRenderer) add(o.channelRenderer.channelId, o.channelRenderer.title?.simpleText, kw, o.channelRenderer.videoCountText?.simpleText ?? o.channelRenderer.subscriberCountText?.simpleText);
      if (kind === "channel" && o.channelRenderer?.subscriberCountText?.simpleText) add(o.channelRenderer.channelId, undefined, kw, o.channelRenderer.subscriberCountText.simpleText);
      if (kind === "video" && o.videoRenderer) {
        const run = o.videoRenderer.ownerText?.runs?.[0];
        add(run?.navigationEndpoint?.browseEndpoint?.browseId, run?.text, kw);
      }
      const t = o.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
      if (t) next = t;
    });
    if (!next) break;
    page = await innertube("search", { continuation: next });
  }
}

const jobs = KEYWORDS.flatMap((kw) => [
  { kw, params: CHANNEL_FILTER, kind: "channel" as const },
  { kw, params: MONTH_VIDEO_FILTER, kind: "video" as const },
]);
let done = 0;
await pool(jobs, 6, async (j) => {
  await search(j.kw, j.params, j.kind);
  if (++done % 10 === 0) console.log(`searches ${done}/${jobs.length}, candidates ${cands.size}`);
});

mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/candidates.json`, JSON.stringify([...cands.values()].map((c) => ({ ...c, foundBy: [...c.foundBy] })), null, 1));
console.log(`${cands.size} candidate channels -> ${dir}/candidates.json`);
