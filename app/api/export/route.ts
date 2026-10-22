import { scanChannel } from "../../../lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const handle = new URL(req.url).searchParams.get("handle") ?? undefined;
  try {
    const { workbook } = await scanChannel(handle);
    const buf = await workbook.xlsx.writeBuffer();
    return new Response(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="youtube-videos.xlsx"',
      },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
