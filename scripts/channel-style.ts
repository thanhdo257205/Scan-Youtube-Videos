import { addChannelStyles } from "../lib/channel-style";
import { geminiKeys } from "../lib/llm";

// Usage: npm run channels:style [input.xlsx] [output.xlsx]
const [input = "youtube-channels.xlsx", output = "youtube-channels-style.xlsx"] = process.argv.slice(2);
const key = process.env.YOUTUBE_API_KEY;
if (!key) {
  console.error("Missing YOUTUBE_API_KEY environment variable (see .env.example)");
  process.exit(1);
}
if (!geminiKeys().length) {
  console.error("Style analysis needs GEMINI_API_KEY (or GEMINI_API_KEYS)");
  process.exit(1);
}

addChannelStyles({ input, output, key, samples: Number(process.env.CHANNEL_STYLE_SAMPLES) || 5, onProgress: console.log })
  .then((r) => console.log(`Analysed ${r.channels} channels (${r.animation} mostly Animation) -> ${output}`))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
