import type { Workbook } from "exceljs";
import { buildWorkbook } from "./excel";
import { classifyWithGemini } from "./gemini";
import { classifyAll } from "./topics";
import { fetchChannelVideos } from "./youtube";

export const DEFAULT_HANDLE = "@Professor-Glitch-automation";

export async function scanChannel(handle = process.env.YOUTUBE_CHANNEL_HANDLE || DEFAULT_HANDLE): Promise<{
  workbook: Workbook;
  count: number;
}> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("Missing YOUTUBE_API_KEY environment variable (see .env.example)");
  const videos = await fetchChannelVideos(handle, key);
  const geminiKey = process.env.GEMINI_API_KEY;
  const classified = geminiKey ? await classifyWithGemini(videos, geminiKey) : classifyAll(videos);
  const workbook = await buildWorkbook(classified, handle);
  return { workbook, count: videos.length };
}
