"""tde_2 — TDE-2: caption verification, the falsifiable core.

Controlled scenes rendered programmatically (PIL, deterministic specs): the
ground truth is BY CONSTRUCTION (the spec IS the truth; no eyes, no
hand-labeling). Per scene: honest atomic facts (existence / color / count /
spatial relation), the SAME facts with ONE slot corrupted (invented object /
color swap / miscount / broken relation), and UNANSWERABLE facts (weight,
physical size, draw order) that must ABSTAIN, not guess.

Judge protocol: per-fact noul on the scene image, state empty (the photo-only
calibration regime — the assessment's noul(image, fact) shape), 4 rotations,
shipped calibration. P(true) separation honest-vs-corrupted per class, pooled
ROC, calibration buckets, abstention rates.

Stages:  prep -> key -> run -> analyze
  cd "<repo>/test-results/experiments/tde" && \
      /home/agent/comfyui/.venv/bin/python scripts/tde_2_captions.py <stages>
"""
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TDE = os.path.abspath(os.path.join(HERE, ".."))
OUT = os.path.join(TDE, "out")
SCENES_DIR = os.path.join(OUT, "scenes")

SHAPES = ["circle", "square", "triangle", "pentagon", "hexagon", "star"]  # drawable universe
PALETTE = {"red": (200, 40, 40), "blue": (40, 70, 200), "green": (40, 150, 60),
           "yellow": (210, 190, 40), "purple": (130, 50, 170), "orange": (230, 130, 30)}
BG = (240, 240, 240)
SIZE = 512
GRID = 3
SEEDS = [11, 22, 33, 44, 55, 66]


# ------------------------------------------------------------------ renderer
def _shape_bbox(kind, cx, cy, r):
    return (cx - r, cy - r, cx + r, cy + r)


def render_scene(spec):
    import math
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img)
    for obj in spec["objects"]:
        kind, (cx, cy), rad, color = obj["shape"], obj["center"], obj["radius"], obj["color"]
        fill = PALETTE[color]
        if kind == "circle":
            d.ellipse(_shape_bbox(kind, cx, cy, rad), fill=fill)
        elif kind == "square":
            d.rectangle(_shape_bbox(kind, cx, cy, rad), fill=fill)
        else:  # regular polygon: triangle/pentagon/hexagon/star, apex up
            if kind == "star":  # 5-point star as alternating radii
                pts = []
                for i in range(10):
                    r = rad if i % 2 == 0 else rad * 0.4
                    ang = -90.0 + i * 36.0
                    pts.append((cx + r * math.cos(math.radians(ang)),
                                cy + r * math.sin(math.radians(ang))))
            else:
                sides = {"triangle": 3, "pentagon": 5, "hexagon": 6}[kind]
                rot = -90.0
                pts = [(cx + rad * math.cos(math.radians(rot + i * 360.0 / sides)),
                        cy + rad * math.sin(math.radians(rot + i * 360.0 / sides)))
                       for i in range(sides)]
            d.polygon(pts, fill=fill)
    return img


def make_spec(seed):
    rng = random.Random(seed)
    n = rng.randint(3, 5)
    shapes = rng.sample(SHAPES, n)                       # unique per scene
    colors = rng.sample(list(PALETTE), n)                # unique per scene
    cells = rng.sample(range(GRID * GRID), n)            # unique grid cells -> no overlap
    objects = []
    for shape, color, cell in zip(shapes, colors, cells):
        gx, gy = cell % GRID, cell // GRID
        cx = int((gx + 0.5) * SIZE / GRID)
        cy = int((gy + 0.5) * SIZE / GRID)
        objects.append({"shape": shape, "color": color, "radius": rng.randint(36, 46),
                        "center": [cx, cy], "cell": [gx, gy]})
    return {"seed": seed, "n": n, "objects": objects}


# -------------------------------------------------------------------- facts
def facts_for(spec):
    """-> (honest, corrupted, unanswerable) fact lists; truth by construction."""
    objs = spec["objects"]
    by_shape = {o["shape"]: o for o in objs}
    honest, corrupted = [], []

    # existence (+ invented pairing): a shape type ABSENT from the scene
    present = objs[0]["shape"]
    absent = [s for s in SHAPES if s not in by_shape]
    invented = absent[spec["seed"] % len(absent)]
    honest.append({"cls": "existence", "text": f"There is a {present} in the image."})
    corrupted.append({"cls": "invented_object", "text": f"There is a {invented} in the image."})

    # color (+ swap pairing: another object's real color)
    target = objs[0]
    other = objs[1] if len(objs) > 1 else objs[0]
    honest.append({"cls": "color", "text": f"The {target['shape']} is {target['color']}."})
    corrupted.append({"cls": "color_swap",
                      "text": f"The {target['shape']} is {other['color']}."})

    # count (+ miscount pairing: n±1, alternating by seed parity)
    n = spec["n"]
    wrong = n + 1 if spec["seed"] % 2 else n - 1
    NUM = {2: "two", 3: "three", 4: "four", 5: "five", 6: "six"}
    honest.append({"cls": "count", "text": f"There are exactly {NUM[n]} shapes in the image."})
    corrupted.append({"cls": "miscount",
                      "text": f"There are exactly {NUM[wrong]} shapes in the image."})

    # spatial (+ broken-relation pairing): pick the clearest pair by cell distance.
    # Relation is VIEWER-relative: a is left of b iff a's column < b's column
    # (the first version of this had the sign inverted — the judge was right,
    # the instrument was wrong; caught by the scene_55 probe, re-run 2026-10-10).
    best = None
    for a in objs:
        for b in objs:
            if a is b: continue
            dx, dy = a["cell"][0] - b["cell"][0], a["cell"][1] - b["cell"][1]
            if dx == 0 and dy == 0: continue
            rel = "to the left of" if dx < 0 else ("to the right of" if dx > 0 else
                                                   ("above" if dy < 0 else "below"))
            flip = {"to the left of": "to the right of", "to the right of": "to the left of",
                    "above": "below", "below": "above"}[rel]
            strength = abs(dx) + abs(dy)
            if best is None or strength > best[0]:
                best = (strength, a, b, rel, flip)
    _, a, b, rel, flip = best
    base = f"The {a['color']} {a['shape']} is {{}} the {b['color']} {b['shape']}."
    honest.append({"cls": "spatial", "text": base.format(rel)})
    corrupted.append({"cls": "broken_relation", "text": base.format(flip)})

    # unanswerable (2 of 3, rotating)
    pool = [
        ("physical_weight", f"The {objs[0]['shape']} is heavier than the {objs[-1]['shape']}."),
        ("metric_size", f"The {objs[0]['shape']} is about ten centimeters wide."),
        ("draw_order", f"The {objs[0]['shape']} was drawn before the {objs[-1]['shape']}."),
    ]
    pick = [pool[spec["seed"] % 3], pool[(spec["seed"] + 1) % 3]]
    unanswerable = [{"cls": c, "text": t} for c, t in pick]
    return honest, corrupted, unanswerable


# -------------------------------------------------------------------- stages
def stage_prep():
    import io
    os.makedirs(SCENES_DIR, exist_ok=True)
    manifest = []
    for seed in SEEDS:
        spec = make_spec(seed)
        img = render_scene(spec)
        img2 = render_scene(spec)
        assert img.tobytes() == img2.tobytes(), "renderer not deterministic"
        honest, corrupted, unanswerable = facts_for(spec)
        # construction gates
        kinds = [o["shape"] for o in spec["objects"]]
        assert len(set(kinds)) == len(kinds), "shape not unique"
        cols = [o["color"] for o in spec["objects"]]
        assert len(set(cols)) == len(cols), "color not unique"
        assert abs(spec["n"] - len(spec["objects"])) == 0
        name = f"scene_{seed}"
        img.save(os.path.join(SCENES_DIR, name + ".png"))
        manifest.append({"id": name, "seed": seed, "spec": spec,
                         "honest": honest, "corrupted": corrupted, "unanswerable": unanswerable})
    json.dump(manifest, open(os.path.join(OUT, "tde2_scenes.json"), "w"), indent=1)
    print(f"[prep] {len(manifest)} scenes -> out/scenes/ + out/tde2_scenes.json "
          f"(renderer determinism asserted)")


def stage_key():
    manifest = json.load(open(os.path.join(OUT, "tde2_scenes.json")))
    qs = []
    for m in manifest:
        for f in m["honest"]:
            qs.append({"id": f"{m['id']}|{f['cls']}|honest", "scene": m["id"],
                       "cls": f["cls"], "text": f["text"], "kind": "honest", "truth": True})
        for f in m["corrupted"]:
            qs.append({"id": f"{m['id']}|{f['cls']}|corrupt", "scene": m["id"],
                       "cls": f["cls"], "text": f["text"], "kind": "corrupted", "truth": False})
        for f in m["unanswerable"]:
            qs.append({"id": f"{m['id']}|{f['cls']}|unans", "scene": m["id"],
                       "cls": f["cls"], "text": f["text"], "kind": "unanswerable", "truth": None})
    doc = {"written": "BEFORE any judge call — expectations from the construction only",
           "expectations": {
               "honest_vs_corrupted": "P(true) on honest facts >> P(true) on the paired "
                                      "one-slot corruptions, per class and pooled; the size of "
                                      "the gap IS the result (verification-easier-than-generation "
                                      "is the hypothesis, not an assumption)",
               "classes_hard_to_easy_guess": "invented_object easiest (absent shape); miscount "
                                             "and color_swap medium (n<=5, distinct palette); "
                                             "broken_relation hardest (relation words on a grid)",
               "abstention_arm": "unanswerable facts (weight / physical size / draw order) "
                                 "must ABSTAIN or carry high P(unknown). UPSTREAM RISK, "
                                 "pre-registered: imajev-4b's RELEASE-SPEC discloses its own "
                                 "unknown-gold gate FAILED 11/14 (answered instead of abstained) "
                                 "— our arm may show the same; measured either way"},
           "questions": qs}
    json.dump(doc, open(os.path.join(OUT, "tde2_expected_key.json"), "w"), indent=1)
    print(f"[key] pre-registered {len(qs)} questions "
          f"({len(SEEDS)} scenes x (4 honest + 4 corrupted + 2 unanswerable))")


def stage_run():
    key = json.load(open(os.path.join(OUT, "tde2_expected_key.json")))
    from PIL import Image
    from tde_common import ImajevJudge
    judge = ImajevJudge()
    path = os.path.join(OUT, "tde2_answers.json")
    answers = json.load(open(path)) if os.path.exists(path) else []
    have = {a["id"] for a in answers}
    cache = {}
    for qi, q in enumerate(key["questions"]):
        if q["id"] in have:
            continue
        scene = q["scene"]
        if scene not in cache:
            cache[scene] = Image.open(os.path.join(SCENES_DIR, scene + ".png"))
        a = judge.decide([cache[scene]], q["text"])
        a.update(id=q["id"], kind=q["kind"], cls=q["cls"], truth=q["truth"])
        answers.append(a)
        json.dump(answers, open(path, "w"), indent=1)  # crash-safe: persist per question
        print(f"[run {qi+1}/{len(key['questions'])}] {q['id']}: p_true={a['p_true']:.3f} "
              f"unk={a['p_unknown']:.3f} abstain={a['abstained']} ({a['total_seconds']}s)",
              flush=True)
    print(f"[run] {len(answers)} answers -> out/tde2_answers.json")


def _auc(pos, neg):
    """Mann-Whitney rank AUC with tie handling."""
    if not pos or not neg:
        return None
    wins = ties = 0
    for p in pos:
        for n in neg:
            if p > n: wins += 1
            elif p == n: ties += 1
    return round((wins + 0.5 * ties) / (len(pos) * len(neg)), 4)


def stage_analyze():
    answers = json.load(open(os.path.join(OUT, "tde2_answers.json")))
    by = {"honest": [], "corrupted": [], "unanswerable": []}
    for a in answers:
        by[a["kind"]].append(a)

    def pt(a): return a["p_true"]
    def pu(a): return a["p_unknown"]

    # per-class separation (honest vs its paired corruption class)
    classes = ["existence", "invented_object", "color", "color_swap",
               "count", "miscount", "spatial", "broken_relation"]
    pair_map = {"existence": "invented_object", "color": "color_swap",
                "count": "miscount", "spatial": "broken_relation"}
    per_class = {}
    for honest_cls, corrupt_cls in pair_map.items():
        h = [pt(a) for a in by["honest"] if a["cls"] == honest_cls]
        c = [pt(a) for a in by["corrupted"] if a["cls"] == corrupt_cls]
        per_class[corrupt_cls] = {
            "honest_mean": round(sum(h) / len(h), 4) if h else None,
            "corrupted_mean": round(sum(c) / len(c), 4) if c else None,
            "gap": round(sum(h) / len(h) - sum(c) / len(c), 4) if h and c else None,
            "auc": _auc(h, c),
            "honest_n": len(h), "corrupted_n": len(c),
        }

    # pooled honest-vs-corrupted
    Hp = [pt(a) for a in by["honest"]]
    Cp = [pt(a) for a in by["corrupted"]]
    pooled = {
        "honest_mean": round(sum(Hp) / len(Hp), 4),
        "corrupted_mean": round(sum(Cp) / len(Cp), 4),
        "auc": _auc(Hp, Cp),
        "n_honest": len(Hp), "n_corrupted": len(Cp),
    }
    # ROC over thresholds (claim accepted when p_true >= t AND not abstained)
    roc = []
    for t in [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]:
        tpr = sum((pt(a) >= t and not a["abstained"]) for a in by["honest"]) / len(by["honest"])
        fpr = sum((pt(a) >= t and not a["abstained"]) for a in by["corrupted"]) / len(by["corrupted"])
        roc.append({"t": t, "TPR_accept_honest": round(tpr, 4), "FPR_accept_corrupted": round(fpr, 4)})
    # calibration buckets over the verifiable items
    verif = by["honest"] + by["corrupted"]
    buckets = {}
    ece = 0.0
    for lo, hi in [(0.0, 0.2), (0.2, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 1.01)]:
        b = [a for a in verif if lo <= pt(a) < hi]
        if b:
            mp = sum(pt(a) for a in b) / len(b)
            freq = sum(1 for a in b if a["truth"]) / len(b)
            lab = f"[{lo:.1f},{hi:.2f})"
            buckets[lab] = {"n": len(b), "mean_p_true": round(mp, 3), "realized_true_freq": round(freq, 3)}
            ece += len(b) / len(verif) * abs(mp - freq)
    calibration = {"buckets": buckets, "ECE": round(ece, 4), "n": len(verif)}
    # abstention arm
    un = by["unanswerable"]
    abst = {
        "n": len(un),
        "abstained": sum(a["abstained"] for a in un),
        "mean_p_unknown_unanswerable": round(sum(pu(a) for a in un) / len(un), 4),
        "mean_p_unknown_verifiable": round(sum(pu(a) for a in verif) / len(verif), 4),
        "confident_true_on_unanswerable": sum((not a["abstained"]) and pt(a) >= 0.7 for a in un),
        "confident_false_on_unanswerable": sum((not a["abstained"]) and pt(a) <= 0.3 for a in un),
    }
    # rotation health
    rot = [a["rotation_agreement"] for a in answers]
    summary = {
        "per_class": per_class, "pooled": pooled, "roc": roc, "calibration": calibration,
        "abstention": abst,
        "rotation_agreement_mean": round(sum(rot) / len(rot), 4),
        "mean_seconds_per_question": round(sum(a["total_seconds"] for a in answers) / len(answers), 2),
        "mean_forward_seconds": round(sum(a["forward_seconds"] for a in answers) / len(answers), 2),
    }
    json.dump({"summary": summary,
               "rows": [{"id": a["id"], "kind": a["kind"], "cls": a["cls"],
                         "p_true": round(a["p_true"], 4), "p_unknown": round(a["p_unknown"], 4),
                         "abstained": a["abstained"], "value": str(a["value"]),
                         "rot_agree": a["rotation_agreement"]} for a in answers]},
              open(os.path.join(OUT, "tde2_summary.json"), "w"), indent=1)
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    stages = sys.argv[1:] or ["prep", "key", "run", "analyze"]
    for s in stages:
        {"prep": stage_prep, "key": stage_key, "run": stage_run,
         "analyze": stage_analyze}[s]()
