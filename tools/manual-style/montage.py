"""Step 2: download thumbnails and build contact sheets, 8 channels per image (5 latest videos per row).
Usage: python3 tools/manual-style/montage.py [work]   -> work/montages/batch_00.jpg ...
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw

work = sys.argv[1] if len(sys.argv) > 1 else "work"
chans = json.load(open(f"{work}/vids.json"))
os.makedirs(f"{work}/thumbs", exist_ok=True)
os.makedirs(f"{work}/montages", exist_ok=True)
W, H, LABEL, PER = 256, 144, 18, 8

for c in chans:
    for v in c["vids"]:
        p = f"{work}/thumbs/{v['id']}.jpg"
        if not os.path.exists(p):
            subprocess.run(["curl", "-sS", "-m", "20", "-f", "-o", p, f"https://i.ytimg.com/vi/{v['id']}/mqdefault.jpg"])

for b in range(0, len(chans), PER):
    group = chans[b:b + PER]
    im = Image.new("RGB", (W * 5, (H + LABEL) * len(group)), "white")
    d = ImageDraw.Draw(im)
    for r, c in enumerate(group):
        y = r * (H + LABEL)
        d.rectangle([0, y, W * 5, y + LABEL - 1], fill=(30, 30, 30))
        d.text((6, y + 3), f"ROW {c['row']}  |  {c['name'][:70]}", fill="white")
        for x, v in enumerate(c["vids"]):
            p = f"{work}/thumbs/{v['id']}.jpg"
            if os.path.exists(p):
                im.paste(Image.open(p).convert("RGB").resize((W, H)), (x * W, y + LABEL))
    im.save(f"{work}/montages/batch_{b // PER:02d}.jpg", quality=85)
print(f"{len(chans)} channels -> {(len(chans) + PER - 1) // PER} montages in {work}/montages")
