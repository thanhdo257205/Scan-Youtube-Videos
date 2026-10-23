# Scan Youtube Videos

Next.js project that scans every video and Short of a YouTube channel
(default: `@Professor-Glitch-automation`) and exports an Excel file:

- one sheet per topic (own tab/header colour, clickable video links, Shorts flagged)
- a dedicated sheet `Agents vs Automation vs DW` with videos about agents, automation or digital workers (most overlapping concepts first)
- a `Summary` sheet

Topics are assigned by Gemini when `GEMINI_API_KEY` is set (free key from Google AI Studio; model via `GEMINI_MODEL`), otherwise by keyword rules in `lib/topics.ts`. If a Gemini batch fails, those videos fall back to the keyword rules. Edit topics in `lib/topics.ts` and the hints in `lib/gemini.ts`.

## Setup

```bash
npm install
cp .env.example .env.local   # set YOUTUBE_API_KEY (YouTube Data API v3)
```

## Usage

```bash
npm run scan                     # writes youtube-videos.xlsx
npm run scan out.xlsx @handle    # custom output / channel
npm run dev                      # then GET http://localhost:3000/api/export
```

## Scan channels about agents / automation / digital workers

```bash
npm run channels                                   # writes youtube-channels.xlsx
npm run channels out.xlsx "AI agents" "n8n"        # custom keywords
SEARCH_PAGES=3 npm run channels                    # deeper search (more API quota)
```

or `GET /api/channels?q=AI%20agents&q=digital%20workers` with `npm run dev`.

Channels are found with the YouTube Data API (`search.list` on channels and videos, ~100 quota units per page per keyword) and nothing is filtered out; they are ranked by relevance. Social links (X, Facebook, Instagram, LinkedIn, TikTok, Threads, Discord, Telegram, GitHub, Skool), websites and emails come from the channel description and the About-page "Links" section (read best-effort through YouTube's internal API, so it may break if YouTube changes it).

## Visual style (thumbnail analysis)

```bash
npm run scan -- --style     # needs GEMINI_API_KEY
```

Gemini looks at each video's thumbnail and labels it Animation / Screen recording / Talking head / Slides / Other, adding `Visual style` and `Conf.` columns plus a separate `Animation style` sheet. A thumbnail is only a hint of the video, so check low-confidence rows. Describe what "Animation" means for you in `STYLE_ANIMATION_DESCRIPTION` (see `.env.example`). Free-tier rate limits are respected by pausing between batches, so a 500-video channel takes several minutes.

## Several API keys and fallback providers

- `GEMINI_API_KEYS=key1,key2` rotates Gemini keys when one hits a rate limit (429); a key that is rejected or out of daily quota is skipped for the rest of the run. Gemini quota is per Google Cloud project, so keys only help if they come from different projects.
- Topic classification falls back Gemini -> Groq (`GROQ_API_KEY`) -> OpenRouter (`OPENROUTER_API_KEY`) -> keyword rules. These fallbacks are text-only; `--style` (thumbnail analysis) uses Gemini keys only.
- Rate-limited and overloaded requests are retried automatically.
