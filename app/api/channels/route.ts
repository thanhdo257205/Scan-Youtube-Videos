import { DEFAULT_KEYWORDS, scanChannels } from "../../../lib/channels";
import { buildChannelsWorkbook } from "../../../lib/channels-excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/channels?q=keyword&q=another   (defaults to the built-in keyword list)
export async function GET(req: Request) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return Response.json({ error: "Missing YOUTUBE_API_KEY" }, { status: 500 });
  const q = new URL(req.url).searchParams.getAll("q").filter(Boolean);
  const keywords = q.length ? q : DEFAULT_KEYWORDS;
  try {
    const rows = await scanChannels({ key, keywords });
    const buf = await (await buildChannelsWorkbook(rows, keywords)).xlsx.writeBuffer();
    return new Response(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="youtube-channels.xlsx"',
      },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
