// Reads a channel's About panel (custom links, description) through YouTube's internal "Innertube" API.
// Best-effort: it is unofficial, so every failure just yields an empty result.

const API_BASE = "https://youtubei.googleapis.com/youtubei/v1";
// Public key embedded in every YouTube web page (not a private credential).
const API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const CONTEXT = { client: { clientName: "WEB", clientVersion: "2.20250101.00.00", hl: "en", gl: "US" } };

export interface AboutLink {
  title: string;
  url: string;
}

type Json = any;

async function browse(body: Record<string, unknown>): Promise<Json> {
  const res = await fetch(`${API_BASE}/browse?key=${API_KEY}&prettyPrint=false`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" },
    body: JSON.stringify({ context: CONTEXT, ...body }),
  });
  if (!res.ok) throw new Error(`browse ${res.status}`);
  return res.json();
}

function walk(node: Json, visit: (obj: Json, path: string) => void, path = "") {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit, path);
  } else if (node && typeof node === "object") {
    visit(node, path);
    for (const key of Object.keys(node)) walk(node[key], visit, `${path}>${key}`);
  }
}

function realUrl(link: Json): string {
  const redirect: string | undefined = link?.commandRuns?.[0]?.onTap?.innertubeCommand?.urlEndpoint?.url;
  if (redirect) {
    try {
      const q = new URL(redirect).searchParams.get("q");
      if (q) return q;
    } catch {
      /* fall through */
    }
  }
  const text: string = link?.content ?? "";
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

export async function fetchAboutLinks(channelId: string): Promise<AboutLink[]> {
  try {
    const page = await browse({ browseId: channelId });
    // The About panel is a continuation inside an itemSectionRenderer.
    let token: string | undefined;
    walk(page, (o, path) => {
      const t = o.continuationCommand?.token;
      if (t && /itemSectionRenderer>contents>continuationItemRenderer/.test(path)) token = t;
    });
    if (!token) return [];
    const about = await browse({ continuation: token });
    const links: AboutLink[] = [];
    walk(about, (o) => {
      const l = o.channelExternalLinkViewModel;
      if (l?.link?.content) links.push({ title: l.title?.content ?? "", url: realUrl(l.link) });
    });
    return links;
  } catch {
    return [];
  }
}
