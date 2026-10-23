import type { Workbook } from "exceljs";
import { buildWorkbook } from "./excel";
import { classifyWithGemini } from "./gemini";
import { analyzeStyles } from "./style";
import { classifyAll } from "./topics";
import { fetchChannelVideos } from "./youtube";

export const DEFAULT_HANDLE = "@Professor-Glitch-automation";

export async function scanChannel(
  handle = process.env.YOUTUBE_CHANNEL_HANDLE || DEFAULT_HANDLE,
  opts: { style?: boolean; onProgress?: (msg: string) => void } = {},
): Promise<{
  workbook: Workbook;
  count: number;
}> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("Missing YOUTUBE_API_KEY environment variable (see .env.example)");
  const videos = await fetchChannelVideos(handle, key);
  const geminiKey = process.env.GEMINI_API_KEY;
  let classified = geminiKey ? await classifyWithGemini(videos, geminiKey) : classifyAll(videos);
  if (opts.style) {
    if (!geminiKey) throw new Error("Style analysis needs GEMINI_API_KEY");
    classified = await analyzeStyles(classified, geminiKey, opts.onProgress);
  }
  const workbook = await buildWorkbook(classified, handle);
  return { workbook, count: videos.length };
}
