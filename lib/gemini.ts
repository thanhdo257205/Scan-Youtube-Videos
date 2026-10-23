import { askForArray, configuredTextProviders } from "./llm";
import { OTHER_TOPIC, TOPICS, classify } from "./topics";
import type { ClassifiedVideo, VideoItem } from "./types";

const BATCH = 40;

const TOPIC_HINTS: Record<string, string> = {
  "AI Agents": "AI agents, agentic systems, multi-agent, MCP, autonomous AI",
  "Digital Workers": "digital workers / AI employees / virtual staff replacing or assisting human roles",
  "Automation Workflows": "workflow automation with n8n, Make, Zapier, APIs, webhooks, RPA",
  "AI Tools & Models": "reviews and usage of ChatGPT, Claude, Gemini, LLMs, prompts, AI apps",
  "Business & Money": "making money, agencies, clients, sales, marketing, business use cases",
  [OTHER_TOPIC.name]: "anything that fits none of the above",
};

function buildPrompt(batch: VideoItem[], names: string[]): string {
  return [
    "Classify each YouTube video into exactly one topic. Topics:",
    ...names.map((n) => `- ${n}: ${TOPIC_HINTS[n]}`),
    "",
    "Videos (JSON):",
    JSON.stringify(batch.map((v, i) => ({ i, title: v.title, description: v.description.slice(0, 300), tags: v.tags.slice(0, 10) }))),
    "",
    "Return a JSON array of topic names, one per video, in the same order.",
  ].join("\n");
}

/**
 * Classify with the configured LLM providers in order (Gemini keys -> Groq -> OpenRouter);
 * a batch that every provider fails falls back to the keyword rules.
 */
export async function classifyWithLLM(videos: VideoItem[]): Promise<ClassifiedVideo[]> {
  const names = [...TOPICS.map((t) => t.name), OTHER_TOPIC.name];
  const providers = configuredTextProviders();
  const dead = new Set<string>();
  const result: ClassifiedVideo[] = [];

  for (let i = 0; i < videos.length; i += BATCH) {
    const batch = videos.slice(i, i + BATCH);
    const prompt = buildPrompt(batch, names);
    let topics: string[] | undefined;
    for (const provider of providers) {
      if (dead.has(provider)) continue;
      try {
        const out = await askForArray(provider, prompt, names);
        if (out.length !== batch.length) throw new Error("unexpected number of results");
        topics = out.map((t) => (names.includes(String(t)) ? String(t) : OTHER_TOPIC.name));
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`${provider} failed for batch ${i / BATCH + 1}: ${msg}`);
        if (/No usable keys/.test(msg)) dead.add(provider);
      }
    }
    if (!topics) console.warn(`Batch ${i / BATCH + 1}: using keyword rules`);
    const final = topics ?? batch.map(classify);
    batch.forEach((v, j) => result.push({ ...v, topic: final[j] }));
  }
  return result;
}
