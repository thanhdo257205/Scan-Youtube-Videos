import { fetchAboutLinks } from "./about";
import { extractSocials, type Socials } from "./socials";
import { api } from "./youtube";

export const DEFAULT_KEYWORDS = [
  "AI agents vs automation",
  "AI agents",
  "digital workers",
  "AI digital employees",
  "AI automation",
  "agentic AI",
  "n8n AI agents",
  "AI workforce",
];

const CONCEPTS = [
  { label: "Agents", re: /\b(ai[\s-])?agents?\b|agentic/i },
  { label: "Automation", re: /automat/i },
  { label: "Digital Workers", re: /digital[\s-]?workers?|ai (employees?|workforce|staff)|virtual (employees?|assistants?)/i },
];

export interface ChannelRow {
  id: string;
  title: string;
  handle: string;
  url: string;
  description: string;
  country: string;
  createdAt: string;
  subscribers: number | null;
  videoCount: number;
  viewCount: number;
  foundBy: string[];
  concepts: string[];
  relevance: number;
  socials: Socials;
}

interface SearchResp {
  items: { id: { channelId?: string }; snippet: { channelId: string } }[];
}

/** Returns channelId -> search keywords that surfaced it (channel search + video search). */
async function discover(keywords: string[], key: string, pages: number): Promise<Map<string, Set<string>>> {
  const found = new Map<string, Set<string>>();
  const add = (id: string | undefined, kw: string) => {
    if (id) (found.get(id) ?? found.set(id, new Set()).get(id)!).add(kw);
  };
  for (const kw of keywords) {
    for (const type of ["channel", "video"] as const) {
      let pageToken = "";
      for (let p = 0; p < pages; p++) {
        const r = await api<SearchResp & { nextPageToken?: string }>(
          "search",
          { part: "snippet", type, q: kw, maxResults: "50", relevanceLanguage: "en", ...(pageToken && { pageToken }) },
          key,
        );
        for (const it of r.items) add(type === "channel" ? it.id.channelId : it.snippet.channelId, kw);
        pageToken = r.nextPageToken ?? "";
        if (!pageToken) break;
      }
    }
  }
  return found;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export async function scanChannels(opts: {
  key: string;
  keywords?: string[];
  pages?: number;
  onProgress?: (msg: string) => void;
}): Promise<ChannelRow[]> {
  const { key, keywords = DEFAULT_KEYWORDS, pages = 1, onProgress = () => {} } = opts;
  onProgress(`Searching ${keywords.length} keywords...`);
  const found = await discover(keywords, key, pages);
  const ids = [...found.keys()];
  onProgress(`Found ${ids.length} channels, loading details...`);

  const rows: ChannelRow[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await api<{
      items: {
        id: string;
        snippet: { title: string; description: string; customUrl?: string; country?: string; publishedAt: string };
        statistics: { subscriberCount?: string; videoCount?: string; viewCount?: string; hiddenSubscriberCount?: boolean };
      }[];
    }>("channels", { part: "snippet,statistics", id: ids.slice(i, i + 50).join(",") }, key);
    for (const c of r.items) {
      const text = `${c.snippet.title} ${c.snippet.description}`;
      const concepts = CONCEPTS.filter((x) => x.re.test(text)).map((x) => x.label);
      const foundBy = [...(found.get(c.id) ?? [])];
      rows.push({
        id: c.id,
        title: c.snippet.title,
        handle: c.snippet.customUrl ?? "",
        url: c.snippet.customUrl ? `https://www.youtube.com/${c.snippet.customUrl}` : `https://www.youtube.com/channel/${c.id}`,
        description: c.snippet.description,
        country: c.snippet.country ?? "",
        createdAt: c.snippet.publishedAt.slice(0, 10),
        subscribers: c.statistics.hiddenSubscriberCount ? null : Number(c.statistics.subscriberCount ?? 0),
        videoCount: Number(c.statistics.videoCount ?? 0),
        viewCount: Number(c.statistics.viewCount ?? 0),
        foundBy,
        concepts,
        // Matches in the channel text count double; each search keyword that surfaced it counts once.
        relevance: concepts.length * 2 + foundBy.length,
        socials: { byPlatform: {}, websites: [], emails: [] },
      });
    }
  }

  let done = 0;
  await mapPool(rows, 5, async (row) => {
    const links = await fetchAboutLinks(row.id);
    row.socials = extractSocials(row.description, links);
    if (++done % 20 === 0) onProgress(`Read About page of ${done}/${rows.length} channels`);
  });

  return rows.sort((a, b) => b.relevance - a.relevance || (b.subscribers ?? 0) - (a.subscribers ?? 0));
}
