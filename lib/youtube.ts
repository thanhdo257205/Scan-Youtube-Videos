import type { VideoItem } from "./types";

const API = "https://www.googleapis.com/youtube/v3";
// YouTube Shorts can be up to 3 minutes long.
const SHORT_MAX_SECONDS = 180;

async function api<T>(path: string, params: Record<string, string>, key: string): Promise<T> {
  const qs = new URLSearchParams({ ...params, key });
  const res = await fetch(`${API}/${path}?${qs}`);
  if (!res.ok) {
    throw new Error(`YouTube API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

function parseDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export async function fetchChannelVideos(handle: string, key: string): Promise<VideoItem[]> {
  const ch = await api<{ items?: { id: string; contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(
    "channels",
    { part: "contentDetails", forHandle: handle.startsWith("@") ? handle : `@${handle}` },
    key,
  );
  const uploads = ch.items?.[0]?.contentDetails.relatedPlaylists.uploads;
  if (!uploads) throw new Error(`Channel ${handle} not found`);

  const ids: string[] = [];
  let pageToken = "";
  do {
    const page = await api<{
      nextPageToken?: string;
      items: { contentDetails: { videoId: string } }[];
    }>(
      "playlistItems",
      { part: "contentDetails", playlistId: uploads, maxResults: "50", ...(pageToken && { pageToken }) },
      key,
    );
    ids.push(...page.items.map((i) => i.contentDetails.videoId));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);

  const videos: VideoItem[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = await api<{
      items: {
        id: string;
        snippet: { title: string; description: string; tags?: string[]; publishedAt: string };
        contentDetails: { duration: string };
        statistics: { viewCount?: string; likeCount?: string };
      }[];
    }>("videos", { part: "snippet,contentDetails,statistics", id: ids.slice(i, i + 50).join(",") }, key);
    for (const v of batch.items) {
      const durationSeconds = parseDuration(v.contentDetails.duration);
      const isShort = durationSeconds <= SHORT_MAX_SECONDS || /#shorts?\b/i.test(v.snippet.title);
      videos.push({
        id: v.id,
        title: v.snippet.title,
        description: v.snippet.description,
        tags: v.snippet.tags ?? [],
        publishedAt: v.snippet.publishedAt,
        durationSeconds,
        isShort,
        viewCount: Number(v.statistics.viewCount ?? 0),
        likeCount: Number(v.statistics.likeCount ?? 0),
        url: isShort ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
      });
    }
  }
  return videos;
}
