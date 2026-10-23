# Manual style review (no Gemini needed)

Lets a Claude model look at thumbnail contact sheets and judge each channel's visual style.

1. `npx tsx tools/manual-style/prepare.mts work/channels.xlsx work 1000 30` — pick channels (with concepts, >= 1000 subs, newest video within 30 days) and list their 5 latest videos.
2. `python3 tools/manual-style/montage.py work` — download thumbnails, build `work/montages/batch_NN.jpg` (8 channels per image, row label `ROW <excel row> | <channel>`).
3. View each montage and write `work/judgments/batch_NN.json`: `{ "<excel row>": ["Animation", "Talking head", ...] }` with one style per thumbnail, left to right.
4. `npx tsx tools/manual-style/write.mts work/channels.xlsx work youtube-channels-style.xlsx`.

Allowed styles: Animation, Screen recording, Talking head, Slides / diagram, Other. `work/` is git-ignored.
