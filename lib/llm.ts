// Key rotation, retry and provider fallback for the LLM calls (Gemini, Groq, OpenRouter).

const MAX_WAIT_MS = 65_000;

function readKeys(...envNames: string[]): string[] {
  const keys = envNames.flatMap((n) => (process.env[n] ?? "").split(/[,\s]+/)).filter(Boolean);
  return [...new Set(keys)];
}

class KeyPool {
  private blockedUntil = new Map<string, number>(); // Infinity = disabled for this run
  private cursor = 0;
  constructor(readonly keys: string[]) {}

  cool(key: string, ms: number) {
    this.blockedUntil.set(key, Date.now() + ms);
  }
  disable(key: string) {
    this.blockedUntil.set(key, Infinity);
  }

  /** Next usable key (round-robin); waits for the soonest cooldown to end if all keys are cooling. */
  async next(): Promise<string> {
    for (;;) {
      const now = Date.now();
      for (let i = 0; i < this.keys.length; i++) {
        const key = this.keys[(this.cursor + i) % this.keys.length];
        if ((this.blockedUntil.get(key) ?? 0) <= now) {
          this.cursor = (this.cursor + i + 1) % this.keys.length;
          return key;
        }
      }
      const soonest = Math.min(...this.keys.map((k) => this.blockedUntil.get(k) ?? 0));
      if (!Number.isFinite(soonest)) throw new Error("No usable keys left (all rejected or out of daily quota)");
      await new Promise((r) => setTimeout(r, Math.min(Math.max(soonest - now, 500), MAX_WAIT_MS)));
    }
  }
}

const pools = new Map<string, KeyPool>();
function pool(name: string, keys: string[]): KeyPool {
  let p = pools.get(name);
  if (!p) pools.set(name, (p = new KeyPool(keys)));
  return p;
}

/** Runs `send(key)`, rotating keys and retrying on rate limits / overload / rejected keys. */
async function withKeys(p: KeyPool, send: (key: string) => Promise<Response>): Promise<any> {
  const attempts = p.keys.length * 3 + 3;
  let last = "";
  for (let i = 0; i < attempts; i++) {
    const key = await p.next();
    let res: Response;
    try {
      res = await send(key);
    } catch (e) {
      // Network hiccup (e.g. "fetch failed"): back off and retry.
      last = e instanceof Error ? e.message : String(e);
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
      continue;
    }
    if (res.ok) return res.json();
    last = `${res.status}: ${(await res.text()).slice(0, 300)}`;
    if (res.status === 429) {
      if (/per ?day|daily/i.test(last)) p.disable(key);
      else p.cool(key, 60_000);
    } else if (res.status >= 500) {
      p.cool(key, 10_000);
    } else if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(last))) {
      p.disable(key);
    } else {
      throw new Error(last);
    }
  }
  throw new Error(`Gave up after ${attempts} attempts, last error ${last}`);
}

export const geminiKeys = () => readKeys("GEMINI_API_KEYS", "GEMINI_API_KEY");

export function geminiGenerate(model: string, body: unknown): Promise<any> {
  return withKeys(pool("gemini", geminiKeys()), (key) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    }),
  );
}

interface OpenAICompat {
  name: string;
  url: string;
  keys: string[];
  model: string;
}

function textProviders(): OpenAICompat[] {
  return [
    {
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      keys: readKeys("GROQ_API_KEYS", "GROQ_API_KEY"),
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    },
    {
      name: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      keys: readKeys("OPENROUTER_API_KEYS", "OPENROUTER_API_KEY"),
      model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
    },
  ].filter((p) => p.keys.length);
}

/** Names of the text providers that have at least one key, in fallback order. */
export function configuredTextProviders(): string[] {
  return [...(geminiKeys().length ? ["gemini"] : []), ...textProviders().map((p) => p.name)];
}

function extractArray(text: string): unknown[] {
  const start = text.search(/[[{]/);
  const parsed = JSON.parse(start >= 0 ? text.slice(start) : text);
  if (Array.isArray(parsed)) return parsed;
  const arr = Object.values(parsed as object).find(Array.isArray);
  if (!arr) throw new Error("No array in model output");
  return arr as unknown[];
}

/**
 * Ask one provider for a JSON array of strings (one per item). Throws on failure.
 * `allowed` constrains Gemini's output through a schema; other providers are validated by the caller.
 */
export async function askForArray(provider: string, prompt: string, allowed: string[]): Promise<unknown[]> {
  if (provider === "gemini") {
    const data = await geminiGenerate(process.env.GEMINI_MODEL || "gemini-3.8-flash", {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: { type: "ARRAY", items: { type: "STRING", enum: allowed } },
      },
    });
    return extractArray(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]");
  }
  const p = textProviders().find((x) => x.name === provider);
  if (!p) throw new Error(`Provider ${provider} not configured`);
  const data = await withKeys(pool(p.name, p.keys), (key) =>
    fetch(p.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: p.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: 'Reply with a JSON object of the form {"topics": [...]} and nothing else.' },
          { role: "user", content: prompt },
        ],
      }),
    }),
  );
  return extractArray(data.choices?.[0]?.message?.content ?? "{}");
}
