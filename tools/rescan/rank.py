"""Rank every active channel by similarity to the reference channel (default: Professor Glitch).
Usage: python3 tools/rescan/rank.py [work2]   -> work2/ranked.json
Score (0-100) = topic similarity 40 + concept fit 20 + teaching format 15 + visual style 20 + recent activity 5.
"""
import json, math, re, sys, glob, collections

W = sys.argv[1] if len(sys.argv) > 1 else "work2"
ref = json.load(open(f"{W}/reference.json"))
chans = json.load(open(f"{W}/channels.json"))
sel = json.load(open(f"{W}/vids.json"))

STOP = set("a an the and or of to for in on with your you my me i is are be it this that how what why from by at as we our can do does not no vs all new best top full free get make use using into more than just".split())
def tok(t):
    return [w for w in re.findall(r"[a-z0-9]+", t.lower()) if w not in STOP and len(w) > 1]

def doc(c):
    return tok(" ".join([c["name"], c.get("description", ""), " ".join(v["title"] for v in c["vids"])]))

ref_doc = tok(" ".join([ref["description"], " ".join(ref["titles"])]))
docs = {c["id"]: doc(c) for c in chans}
df = collections.Counter()
for d in list(docs.values()) + [ref_doc]:
    df.update(set(d))
N = len(docs) + 1
def vec(d):
    tf = collections.Counter(d)
    return {w: (1 + math.log(n)) * math.log(N / df[w]) for w, n in tf.items()}
def cos(a, b):
    num = sum(a[w] * b.get(w, 0) for w in a)
    den = math.sqrt(sum(x * x for x in a.values())) * math.sqrt(sum(x * x for x in b.values()))
    return num / den if den else 0
rv = vec(ref_doc)
sim = {cid: cos(vec(d), rv) for cid, d in docs.items()}
order = sorted(sim.values())
def pct(x):  # percentile rank 0..1
    lo, hi = 0, len(order)
    while lo < hi:
        m = (lo + hi) // 2
        if order[m] < x: lo = m + 1
        else: hi = m
    return lo / len(order)

CONCEPT = {
    "Agents": re.compile(r"\b(ai[\s-])?agents?\b|agentic|\bmcp\b", re.I),
    "Automation": re.compile(r"automat|\bn8n\b|zapier|make\.com|workflow", re.I),
    "Digital Workers": re.compile(r"digital[\s-]?workers?|ai[\s-](employees?|workforce|staff|team)|virtual (employees?|assistants?)|\bemployees?\b", re.I),
}
TEACH = re.compile(r"how to|step[- ]by[- ]step|start to finish|every step|tutorial|guide|learn|roadmap|build|create|set ?up|full course|from scratch|beginners?|explained|masterclass|walkthrough|click by click", re.I)

def age(text):
    m = re.search(r"(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago", text or "", re.I)
    if not m: return None
    return int(m.group(1)) * {"second": 0, "minute": 0, "hour": 0, "day": 1, "week": 7, "month": 31, "year": 365}[m.group(2).lower()]

judged = {}
for f in sorted(glob.glob(f"{W}/judgments/batch_*.json")):
    judged.update(json.load(open(f)))
style_of = {}
for s in sel:
    st = judged.get(str(s["row"]))
    if st: style_of[s["id"]] = st

out = []
for c in chans:
    titles = [v["title"] for v in c["vids"]]
    # 1) topic similarity, 40
    topic = 40 * pct(sim[c["id"]])
    # 2) concept fit, 20: each concept 4 pts if in the channel text, +2 more if in >=2 video titles
    concept = 0
    hit = []
    for name, rx in CONCEPT.items():
        in_title = sum(1 for t in titles if rx.search(t))
        in_text = rx.search(c["name"] + " " + c.get("description", ""))
        if in_title or in_text:
            hit.append(name)
            concept += 4 + (2 if in_title >= 2 else 0) + (1 if in_title >= 4 else 0)
    concept = min(20, concept + (1 if len(hit) == 3 else 0))
    # 3) teaching format, 15
    teach = 15 * (sum(1 for t in titles if TEACH.search(t)) / max(1, len(titles)))
    # 4) visual style, 20 (only when thumbnails were reviewed)
    st = style_of.get(c["id"])
    if st:
        anim = st.count("Animation") / len(st)
        gen = st.count("AI-generated visuals") / len(st)
        style = 15 * anim + 5 * min(1, gen + anim)
    else:
        anim = gen = None
        style = 0
    # 5) activity, 5
    a = age(c["vids"][0].get("publishedText")) if c["vids"] else None
    act = 5 if (a is not None and a <= 7) else 3 if (a is not None and a <= 14) else 1
    total = topic + concept + teach + style + act
    out.append({
        "id": c["id"], "rank": 0, "score": round(total, 1), "topic": round(topic, 1), "concept": round(concept, 1),
        "teach": round(teach, 1), "style": round(style, 1), "activity": act, "hit": hit,
        "similarity": round(sim[c["id"]], 3), "styles": st, "anim": anim, "gen": gen,
    })
out.sort(key=lambda r: (-r["score"], -next(c["subs"] for c in chans if c["id"] == r["id"])))
for i, r in enumerate(out, 1): r["rank"] = i
json.dump(out, open(f"{W}/ranked.json", "w"))
print(len(out), "ranked;", sum(1 for r in out if r["styles"]), "with style review")
names = {c["id"]: c["name"] for c in chans}
for r in out[:25]:
    print(r["rank"], names[r["id"]], r["score"], f"(topic {r['topic']}, concept {r['concept']}, teach {r['teach']}, style {r['style']})")
pg = next(r for r in out if "glitch" in names[r["id"]].lower())
print("PG own rank:", pg["rank"], pg["score"])
