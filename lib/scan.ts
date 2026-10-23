import type { Workbook } from "exceljs";
import { buildWorkbook } from "./excel";
import { classifyWithLLM } from "./gemini";
import { configuredTextProviders, geminiKeys } from "./llm";
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
  let classified = configuredTextProviders().length ? await classifyWithLLM(videos) : classifyAll(videos);
  if (opts.style) {
    if (!geminiKeys().length) throw new Error("Style analysis needs GEMINI_API_KEY (or GEMINI_API_KEYS)");
    classified = await analyzeStyles(classified, opts.onProgress);
  }
  const workbook = await buildWorkbook(classified, handle);
  return { workbook, count: videos.length };
}
