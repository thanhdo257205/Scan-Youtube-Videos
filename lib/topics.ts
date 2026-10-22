import type { ClassifiedVideo, VideoItem } from "./types";

export interface TopicDef {
  name: string;
  /** Excel ARGB colour used for the tab, header and zebra rows. */
  color: string;
  light: string;
  keywords: RegExp[];
}

// Order matters: ties are broken by earlier topics.
export const TOPICS: TopicDef[] = [
  {
    name: "AI Agents",
    color: "FF6D28D9",
    light: "FFEDE9FE",
    keywords: [/\bagents?\b/i, /agentic/i, /multi-?agent/i, /\bmcp\b/i, /autonomous/i],
  },
  {
    name: "Digital Workers",
    color: "FF0F766E",
    light: "FFCCFBF1",
    keywords: [/digital[\s-]?workers?/i, /ai (employees?|workforce|staff)/i, /virtual (assistant|employee)s?/i],
  },
  {
    name: "Automation Workflows",
    color: "FFEA580C",
    light: "FFFFEDD5",
    keywords: [/automat/i, /\bn8n\b/i, /\bmake\.com\b/i, /zapier/i, /workflows?/i, /\bapi\b/i, /webhook/i, /\brpa\b/i],
  },
  {
    name: "AI Tools & Models",
    color: "FF2563EB",
    light: "FFDBEAFE",
    keywords: [/chat-?gpt/i, /\bgpt/i, /claude/i, /gemini/i, /\bllm/i, /copilot/i, /\bprompt/i, /openai/i, /\bai\b/i],
  },
  {
    name: "Business & Money",
    color: "FF15803D",
    light: "FFDCFCE7",
    keywords: [/business/i, /money/i, /income/i, /agency/i, /client/i, /\bsales?\b/i, /marketing/i, /startup/i, /\broi\b/i],
  },
];

export const OTHER_TOPIC: TopicDef = {
  name: "Other",
  color: "FF475569",
  light: "FFE2E8F0",
  keywords: [],
};

function haystack(v: VideoItem): { title: string; rest: string } {
  return { title: v.title, rest: `${v.tags.join(" ")} ${v.description}` };
}

/** Score = 3 per keyword hit in the title, 1 per hit in tags/description. */
export function classify(v: VideoItem): string {
  const { title, rest } = haystack(v);
  let best = OTHER_TOPIC.name;
  let bestScore = 0;
  for (const t of TOPICS) {
    let score = 0;
    for (const re of t.keywords) {
      if (re.test(title)) score += 3;
      if (re.test(rest)) score += 1;
    }
    if (score > bestScore) {
      best = t.name;
      bestScore = score;
    }
  }
  return best;
}

export function classifyAll(videos: VideoItem[]): ClassifiedVideo[] {
  return videos.map((v) => ({ ...v, topic: classify(v) }));
}

export const FOCUS_CONCEPTS: { label: string; re: RegExp }[] = [
  { label: "Agents", re: /\b(ai[\s-])?agents?\b|agentic/i },
  { label: "Automation", re: /automat/i },
  { label: "Digital Workers", re: /digital[\s-]?workers?/i },
];

/** Concepts from the "agents vs. automation vs. digital workers" theme mentioned by a video. */
export function focusConcepts(v: VideoItem): string[] {
  const text = `${v.title} ${v.tags.join(" ")} ${v.description}`;
  return FOCUS_CONCEPTS.filter((c) => c.re.test(text)).map((c) => c.label);
}
