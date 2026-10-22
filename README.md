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
