// Minimal YouTube "Innertube" helpers (no API key; talks to youtubei.googleapis.com only).
const KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"; // public key embedded in youtube.com pages
const CONTEXT = { client: { clientName: "WEB", clientVersion: "2.20250101.00.00", hl: "en", gl: "US" } };

export async function innertube(endpoint: string, body: object): Promise<any> {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`https://youtubei.googleapis.com/youtubei/v1/${endpoint}?key=${KEY}&prettyPrint=false`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" },
        body: JSON.stringify({ context: CONTEXT, ...body }),
      });
      if (r.ok) return await r.json();
      if (r.status < 500 && r.status !== 429) return undefined;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 700 * 2 ** a));
  }
}

export function walk(node: any, visit: (o: any, path: string) => void, path = "") {
  if (Array.isArray(node)) for (const x of node) walk(x, visit, path);
  else if (node && typeof node === "object") {
    visit(node, path);
    for (const k of Object.keys(node)) walk(node[k], visit, `${path}>${k}`);
  }
}

export async function pool<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/** "3.56K subscribers" / "1,820 subscribers" / "2M" -> number */
export function parseCount(text?: string): number | undefined {
  const m = text?.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return undefined;
  return Math.round(Number(m[1]) * ({ K: 1e3, M: 1e6, B: 1e9 } as any)[(m[2] ?? "").toUpperCase()] || Number(m[1]));
}

/** "3 weeks ago" / "Streamed 2 days ago" -> age in days ("1 month" counts as 31). */
export function ageDays(text?: string): number | undefined {
  const m = text?.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!m) return undefined;
  return Number(m[1]) * ({ second: 0, minute: 0, hour: 0, day: 1, week: 7, month: 31, year: 365 } as any)[m[2].toLowerCase()];
}
