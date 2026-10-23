import type { ClassifiedVideo } from "./types";

export const STYLES = ["Animation", "Screen recording", "Talking head", "Slides / diagram", "Other"] as const;
export type VisualStyle = (typeof STYLES)[number];
export const TARGET_STYLE: VisualStyle = "Animation";

// Edit (or override with STYLE_ANIMATION_DESCRIPTION) to match what "Animation" means for you.
const DEFAULT_ANIMATION_DESC =
  "Cartoon / animated explainer look: a blurred warm beige-brown background, a centered vertical (portrait) panel showing an illustrated scene, an app/UI mock-up or a terminal-like screen, and a cartoon avatar character (e.g. a bearded professor) standing in a corner with a small caption label. It is a produced animation, not real camera footage or a plain screen capture.";

const DESCRIPTIONS: Record<VisualStyle, string> = {
  Animation: process.env.STYLE_ANIMATION_DESCRIPTION || DEFAULT_ANIMATION_DESC,
  "Screen recording": "A real screen capture of software, a browser, an editor or a terminal.",
  "Talking head": "A real person speaking to camera is the main subject.",
  "Slides / diagram": "Static slides, plain text cards or flat diagrams, without an animated illustrated look.",
  Other: "Anything that fits none of the above.",
};

const BATCH = 8;
const DEFAULT_PAUSE_MS = 6000; // stay under free-tier requests-per-minute limits
const DEFAULT_MODEL = "gemini-2.5-flash";

async function thumbnail(id: string): Promise<string | undefined> {
  for (const name of ["hqdefault", "mqdefault"]) {
    try {
      const res = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`);
      if (res.ok) return Buffer.from(await res.arrayBuffer()).toString("base64");
    } catch {
      /* try next */
    }
  }
  return undefined;
}

interface StyleResult {
  style: VisualStyle;
  confidence: number;
}

async function classifyBatch(images: { id: string; title: string; data: string }[], key: string, model: string): Promise<StyleResult[]> {
  const parts: unknown[] = [
    {
      text: [
        "Each image below is a YouTube thumbnail. Classify the VISUAL STYLE of each video into exactly one style:",
        ...STYLES.map((s) => `- ${s}: ${DESCRIPTIONS[s]}`),
        "Return a JSON array with one object {style, confidence} per image, in the same order. confidence is 0..1.",
      ].join("\n"),
    },
    ...images.flatMap((im, i) => [
      { text: `Image ${i + 1} (title: ${im.title})` },
      { inline_data: { mime_type: "image/jpeg", data: im.data } },
    ]),
  ];
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { style: { type: "STRING", enum: [...STYLES] }, confidence: { type: "NUMBER" } },
              required: ["style", "confidence"],
            },
          },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const out = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]") as StyleResult[];
  if (!Array.isArray(out) || out.length !== images.length) throw new Error("Gemini returned unexpected shape");
  return out.map((o) => ({
    style: (STYLES as readonly string[]).includes(o.style) ? o.style : "Other",
    confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0)),
  }));
}

/** Adds `style` + `styleConfidence` to each video by looking at its thumbnail with Gemini. */
export async function analyzeStyles(
  videos: ClassifiedVideo[],
  key: string,
  onProgress: (msg: string) => void = () => {},
): Promise<ClassifiedVideo[]> {
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const pause = Number(process.env.STYLE_PAUSE_MS) || DEFAULT_PAUSE_MS;
  const out = videos.map((v) => ({ ...v }));
  for (let i = 0; i < out.length; i += BATCH) {
    const slice = out.slice(i, i + BATCH);
    const thumbs = await Promise.all(slice.map((v) => thumbnail(v.id)));
    const ok = slice.map((v, j) => ({ v, data: thumbs[j] })).filter((x): x is { v: ClassifiedVideo; data: string } => !!x.data);
    if (ok.length) {
      try {
        const res = await classifyBatch(ok.map((x) => ({ id: x.v.id, title: x.v.title, data: x.data })), key, model);
        ok.forEach((x, j) => {
          x.v.style = res[j].style;
          x.v.styleConfidence = res[j].confidence;
        });
      } catch (e) {
        console.warn(`Style batch ${i / BATCH + 1} failed:`, e instanceof Error ? e.message : e);
      }
    }
    onProgress(`Analysed thumbnails ${Math.min(i + BATCH, out.length)}/${out.length}`);
    if (i + BATCH < out.length) await new Promise((r) => setTimeout(r, pause));
  }
  return out;
}
