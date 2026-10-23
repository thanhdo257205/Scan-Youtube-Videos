import { addChannelStyles } from "../lib/channel-style";
import { geminiKeys } from "../lib/llm";

// Usage: npm run channels:style [input.xlsx] [output.xlsx] [--min-subs=1000] [--with-concepts] [--limit=50]
const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const num = (name: string) => {
  const v = flag(name)?.split("=")[1];
  return v ? Number(v) : undefined;
};
const [input = "youtube-channels.xlsx", output = "youtube-channels-style.xlsx"] = args.filter((a) => !a.startsWith("--"));

const key = process.env.YOUTUBE_API_KEY;
if (!key) {
  console.error("Missing YOUTUBE_API_KEY environment variable (see .env.example)");
  process.exit(1);
}
if (!geminiKeys().length) {
  console.error("Style analysis needs GEMINI_API_KEY (or GEMINI_API_KEYS)");
  process.exit(1);
}

addChannelStyles({
  input,
  output,
  key,
  samples: Number(process.env.CHANNEL_STYLE_SAMPLES) || 5,
  minSubs: num("min-subs"),
  withConcepts: !!flag("with-concepts"),
  limit: num("limit"),
  onProgress: console.log,
})
  .then((r) => {
    console.log(`Analysed ${r.channels} channels (${r.animation} mostly Animation) -> ${output}`);
    if (r.incomplete) {
      console.warn(`\nPARTIAL RESULT: ${r.incomplete}`);
      console.warn("Channels without a style were not analysed. Run the same command again later to finish them (progress is cached).");
    }
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    console.error("Results analysed so far are cached in .style-cache.json; run the same command again to resume.");
    process.exit(1);
  });
