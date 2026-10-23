import type { AboutLink } from "./about";

export const PLATFORMS = [
  { key: "x", label: "X / Twitter", re: /(?:^|\.)(?:x|twitter)\.com$/i },
  { key: "facebook", label: "Facebook", re: /(?:^|\.)(?:facebook|fb)\.com$|^fb\.me$/i },
  { key: "instagram", label: "Instagram", re: /(?:^|\.)instagram\.com$/i },
  { key: "linkedin", label: "LinkedIn", re: /(?:^|\.)linkedin\.com$/i },
  { key: "tiktok", label: "TikTok", re: /(?:^|\.)tiktok\.com$/i },
  { key: "threads", label: "Threads", re: /(?:^|\.)threads\.(?:net|com)$/i },
  { key: "discord", label: "Discord", re: /(?:^|\.)discord\.(?:gg|com)$/i },
  { key: "telegram", label: "Telegram", re: /^t\.me$|(?:^|\.)telegram\.(?:me|org)$/i },
  { key: "github", label: "GitHub", re: /(?:^|\.)github\.com$/i },
  { key: "skool", label: "Skool", re: /(?:^|\.)skool\.com$/i },
] as const;

export type SocialKey = (typeof PLATFORMS)[number]["key"];

export interface Socials {
  byPlatform: Partial<Record<SocialKey, string[]>>;
  /** Everything else: personal sites, newsletters, communities... */
  websites: string[];
  emails: string[];
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const YOUTUBE_HOST = /(?:^|\.)(?:youtube\.com|youtu\.be|google\.com)$/i;

function clean(url: string): string {
  return url.replace(/[.,;:!?]+$/, "");
}

/** Collect social/website links from the channel description and the About-page links. */
export function extractSocials(description: string, aboutLinks: AboutLink[]): Socials {
  const urls = new Set<string>();
  for (const m of description.match(URL_RE) ?? []) urls.add(clean(m));
  for (const l of aboutLinks) urls.add(clean(l.url));

  const out: Socials = { byPlatform: {}, websites: [], emails: [...new Set(description.match(EMAIL_RE) ?? [])] };
  for (const url of urls) {
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (YOUTUBE_HOST.test(host)) continue;
    const p = PLATFORMS.find((x) => x.re.test(host));
    if (p) (out.byPlatform[p.key] ??= []).push(url);
    else out.websites.push(url);
  }
  return out;
}
