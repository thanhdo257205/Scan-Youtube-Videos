import type { Workbook } from "exceljs";
import { buildWorkbook } from "./excel";
import { classifyWithLLM } from "./gemini";
import { configuredTextProviders, geminiKeys } from "./llm";
import { analyzeStyles, StyleAbort } from "./style";
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
    try {
      classified = await analyzeStyles(classified, opts.onProgress);
    } catch (e) {
      if (!(e instanceof StyleAbort)) throw e;
      console.warn(`\nPARTIAL STYLE RESULT: ${e.message}\nVideos without a style were not analysed; run again later to finish them (progress is cached).`);
      classified = e.partial;
    }
  }
  const workbook = await buildWorkbook(classified, handle);
  return { workbook, count: videos.length };
}
