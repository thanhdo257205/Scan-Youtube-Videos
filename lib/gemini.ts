import { OTHER_TOPIC, TOPICS, classify } from "./topics";
import type { ClassifiedVideo, VideoItem } from "./types";

const BATCH = 40;
const DEFAULT_MODEL = "gemini-2.5-flash";

const TOPIC_HINTS: Record<string, string> = {
  "AI Agents": "AI agents, agentic systems, multi-agent, MCP, autonomous AI",
  "Digital Workers": "digital workers / AI employees / virtual staff replacing or assisting human roles",
  "Automation Workflows": "workflow automation with n8n, Make, Zapier, APIs, webhooks, RPA",
  "AI Tools & Models": "reviews and usage of ChatGPT, Claude, Gemini, LLMs, prompts, AI apps",
  "Business & Money": "making money, agencies, clients, sales, marketing, business use cases",
  [OTHER_TOPIC.name]: "anything that fits none of the above",
};

async function classifyBatch(batch: VideoItem[], key: string, model: string): Promise<string[]> {
  const names = [...TOPICS.map((t) => t.name), OTHER_TOPIC.name];
  const prompt = [
    "Classify each YouTube video into exactly one topic. Topics:",
    ...names.map((n) => `- ${n}: ${TOPIC_HINTS[n]}`),
    "",
    "Videos (JSON):",
    JSON.stringify(batch.map((v, i) => ({ i, title: v.title, description: v.description.slice(0, 300), tags: v.tags.slice(0, 10) }))),
    "",
    "Return a JSON array of topic names, one per video, in the same order.",
  ].join("\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: { type: "ARRAY", items: { type: "STRING", enum: names } },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const out = JSON.parse(text ?? "[]") as unknown;
  if (!Array.isArray(out) || out.length !== batch.length) throw new Error("Gemini returned unexpected shape");
  return out.map((t) => (names.includes(String(t)) ? String(t) : OTHER_TOPIC.name));
}

/** Classify with Gemini; any batch that fails falls back to keyword rules. */
export async function classifyWithGemini(videos: VideoItem[], key: string): Promise<ClassifiedVideo[]> {
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const result: ClassifiedVideo[] = [];
  for (let i = 0; i < videos.length; i += BATCH) {
    const batch = videos.slice(i, i + BATCH);
    let topics: string[];
    try {
      topics = await classifyBatch(batch, key, model);
    } catch (e) {
      console.warn(`Gemini failed for batch ${i / BATCH + 1}, using keyword rules:`, e instanceof Error ? e.message : e);
      topics = batch.map(classify);
    }
    batch.forEach((v, j) => result.push({ ...v, topic: topics[j] }));
  }
  return result;
}
