"""tde_1 — TDE-1: imajev-4b judge calibration vs the setA corruption ladder.

The ladder regenerates on CPU from the tranche1 source clip via setA's OWN
construction code (imported, not re-ported — no drift): c2 +2 L*, c3 1-frame
jitter, c4 cross-blended seam, c5 identity swap, c6 half-resolution. c1 (H3
video-VAE re-encode) is DEFERRED: its construction is GPU-bound (the 8189
lane) and out of reach under the TDE's CPU-only constraint — the rung is
recorded, not silently dropped.

Judge protocol (pairwise, the shape imajev is trained for): reference frame +
target frame, one noul claim per question, truth known BY CONSTRUCTION, the
expected outcome PRE-REGISTERED before any judge call (setA's discipline —
stage `key` writes the file, stage `run` refuses to start without it).

Stages:  prep -> key -> run -> analyze
  cd "<repo>/test-results/experiments/tde" && ./.venv/bin/python scripts/tde_1_ladder.py <stages>
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TDE = os.path.abspath(os.path.join(HERE, ".."))
OUT = os.path.join(TDE, "out")
SETA = os.path.abspath(os.path.join(TDE, "..", "gpu-batch-setA", "scripts"))
REPO = os.path.abspath(os.path.join(TDE, "..", "..", ".."))
CLEAN_MP4 = os.path.join(REPO, "test-results", "experiments", "tranche1", "media",
                         "videos", "e3_plain_aud_00001_.mp4")
sys.path.insert(0, SETA)
sys.path.insert(0, HERE)

LADDER = os.path.join(OUT, "ladder")
SITES = [0, 30, 60, 61, 65, 70, 108]  # clean sites sampled for the judge

# claim texts (shared per family)
Q_IDENT = "The second frame is identical to the first frame."
Q_BRIGHT = "The second frame is noticeably brighter than the first frame."
Q_BLEND = ("The second frame is a double exposure: two different moments of the "
           "video blended together into a single frame.")
Q_PERSON = "Both frames show the same person."
Q_SOFT = "The second frame is a lower-resolution, less detailed version of the first frame."


def _save(arr, path):
    from PIL import Image
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(path)


# ------------------------------------------------------------------- prep
def stage_prep():
    import batch_metrics as bm
    import a5_run  # setA's own corruption constructors (CPU-only pieces)
    os.makedirs(LADDER, exist_ok=True)
    clean = bm.extract_frames(CLEAN_MP4)  # [124,H,W,3] float32 — identical decode to setA
    assert clean.shape[0] == 124, clean.shape

    c2 = a5_run._shift_L(clean, 2.0)                       # +2 L*, exact by construction
    c3 = clean.copy(); c3[61], c3[62] = clean[62].copy(), clean[61].copy()
    c4 = clean.copy()
    for k in range(17):
        a = k / 16.0
        c4[62 + k] = (1 - a) * clean[62 + k] + a * clean[100 + k]
    c5 = a5_run._identity_swap(clean)                      # donor face, feathered, all frames
    from PIL import Image
    c6 = []
    for f in clean:
        im = Image.fromarray(f.astype(np.uint8))
        c6.append(np.asarray(im.resize((im.width // 2, im.height // 2), Image.BOX)
                             .resize((im.width, im.height), Image.BILINEAR), dtype=np.float32))
    c6 = np.stack(c6)

    # construction sanity (the pre-registered physical facts)
    checks = {}
    checks["c2_mean_L_delta"] = round(float(np.mean(bm._rgb2lab(c2[30])[..., 0]
                                                    - bm._rgb2lab(clean[30])[..., 0])), 3)
    checks["c3_pair_equal"] = bool(np.array_equal(c3[61], clean[62]))
    checks["c4_70_blend_mean_abs_vs_clean"] = round(float(np.mean(np.abs(c4[70] - clean[70]))), 2)
    checks["c6_downscale_hf_ratio"] = None
    import cv2
    def hf(f):
        return cv2.Laplacian(cv2.cvtColor(f.astype(np.uint8), cv2.COLOR_RGB2GRAY), cv2.CV_64F).var()
    checks["c6_downscale_hf_ratio"] = round(hf(c6[0]) / hf(clean[0]), 3)
    dE_c5 = float(np.mean(np.abs(c5[0] - clean[0])))
    checks["c5_frame0_mean_abs_delta"] = round(dE_c5, 2)
    json.dump(checks, open(os.path.join(OUT, "tde1_construction_checks.json"), "w"), indent=1)
    print("[prep]", json.dumps(checks))

    for i in SITES:
        _save(clean[i], os.path.join(LADDER, f"clean_{i:03d}.png"))
    _save(c2[30], os.path.join(LADDER, "c2_030.png"))
    _save(c3[61], os.path.join(LADDER, "c3_061.png"))
    _save(c4[65], os.path.join(LADDER, "c4_065.png"))
    _save(c4[70], os.path.join(LADDER, "c4_070.png"))
    _save(c5[0], os.path.join(LADDER, "c5_000.png"))
    _save(c5[60], os.path.join(LADDER, "c5_060.png"))
    _save(c6[0], os.path.join(LADDER, "c6_000.png"))
    print(f"[prep] wrote {len(os.listdir(LADDER))} ladder frames -> {LADDER}")


# ------------------------------------------------------- key (pre-registration)
def _questions():
    F = lambda name: os.path.join(LADDER, name)  # noqa: E731
    return [
        # id, [ref, target], claim, truth, expected (from CONSTRUCTION only)
        ("clean_ident_00",   ["clean_000.png", "clean_000.png"], Q_IDENT,  True,  "easy — identical pair, high P(true)"),
        ("clean_ident_30",   ["clean_000.png", "clean_030.png"], Q_IDENT,  False, "easy-medium — natural motion differs the frames"),
        ("c2_bright_fwd",    ["clean_030.png", "c2_030.png"],    Q_BRIGHT, True,  "medium — +2 L* is subtle (setA: +1.77 mean face L*)"),
        ("c2_bright_rev",    ["c2_030.png",    "clean_030.png"], Q_BRIGHT, False, "medium — order probe; low if no position bias"),
        ("c3_ident_61",      ["clean_061.png", "c3_061.png"],    Q_IDENT,  False, "BELOW-FLOOR expected — the delta is ONE frame of natural motion (within-video PSNR ~17-18 dB per setA)"),
        ("c3_ident_ctrl",    ["clean_061.png", "clean_061.png"], Q_IDENT,  True,  "easy — identical pair"),
        ("c4_blend_70",      ["clean_070.png", "c4_070.png"],    Q_BLEND,  True,  "easy — 50% double exposure at the strongest site"),
        ("c4_blend_65",      ["clean_065.png", "c4_065.png"],    Q_BLEND,  True,  "medium-hard — 19% blend (site gradient)"),
        ("c4_blend_ctrl",    ["clean_070.png", "clean_108.png"], Q_BLEND,  False, "medium — two clean moments, no blend in either frame"),
        ("c5_person_00",     ["clean_000.png", "c5_000.png"],    Q_PERSON, False, "easy-medium — donor identity pasted (setA ArcFace 0.074 vs 0.53 band)"),
        ("c5_person_60",     ["clean_060.png", "c5_060.png"],    Q_PERSON, False, "easy-medium — second site; motion may weaken the paste's visibility"),
        ("c5_person_ctrl",   ["clean_000.png", "clean_030.png"], Q_PERSON, True,  "easy — same person, different moments"),
        ("c6_soft_fwd",      ["clean_000.png", "c6_000.png"],    Q_SOFT,   True,  "easy — HF energy halved by construction"),
        ("c6_soft_rev",      ["c6_000.png",    "clean_000.png"], Q_SOFT,   False, "easy-medium — order probe"),
    ]


def stage_key():
    qs = [{"id": i, "images": imgs, "claim": q, "truth": t, "expected": e}
          for i, imgs, q, t, e in _questions()]
    doc = {"written": "BEFORE any judge call (pre-registration; expectations from "
                      "corruption definitions + setA's own measurements only)",
           "deferred_rungs": {"c1_vaereencode": "DEFERRED — construction requires the H3 "
                               "video VAE on the GPU lane (8189); CPU-only constraint"},
           "questions": qs}
    json.dump(doc, open(os.path.join(OUT, "tde1_expected_key.json"), "w"), indent=1)
    print(f"[key] pre-registered {len(qs)} questions (no judge output seen yet)")


# ------------------------------------------------------------------- run
def stage_run():
    key = json.load(open(os.path.join(OUT, "tde1_expected_key.json")))
    from PIL import Image
    from tde_common import ImajevJudge
    judge = ImajevJudge()
    path = os.path.join(OUT, "tde1_answers.json")
    answers = json.load(open(path)) if os.path.exists(path) else []
    have = {a["id"] for a in answers}
    for qi, q in enumerate(key["questions"]):
        if q["id"] in have:
            continue
        imgs = [Image.open(os.path.join(LADDER, f)) for f in q["images"]]
        a = judge.decide(imgs, q["claim"])
        a.update(id=q["id"], truth=q["truth"])
        answers.append(a)
        json.dump(answers, open(path, "w"), indent=1)  # crash-safe: persist per question
        print(f"[run {qi+1}/{len(key['questions'])}] {q['id']}: truth={q['truth']} "
              f"p_true={a['p_true']:.3f} abstained={a['abstained']} "
              f"rot_agree={a['rotation_agreement']:.2f} ({a['total_seconds']}s)", flush=True)
    print(f"[run] {len(answers)} answers -> out/tde1_answers.json")


# --------------------------------------------------------------- analyze
def stage_analyze():
    answers = json.load(open(os.path.join(OUT, "tde1_answers.json")))
    rows = []
    for a in answers:
        called_true = (not a["abstained"]) and a["value"] is True
        called_false = (not a["abstained"]) and a["value"] is False
        rows.append({
            "id": a["id"], "truth": a["truth"], "p_true": round(a["p_true"], 4),
            "p_unknown": round(a["p_unknown"], 4), "abstained": a["abstained"],
            "raw_logits": {k: round(v, 3) for k, v in a["raw_logits"].items()},
            "call": "abstain" if a["abstained"] else ("true" if a["value"] else "false"),
            "correct": (called_true if a["truth"] else called_false) if not a["abstained"] else False,
            "rot_agreement": a["rotation_agreement"],
        })
    n = len(rows)
    n_correct = sum(r["correct"] for r in rows)
    n_abstain = sum(r["abstained"] for r in rows)
    # calibration: predicted p_true vs realized truth frequency, 2 buckets
    trues = [r for r in rows if r["truth"]]
    falses = [r for r in rows if not r["truth"]]
    cal = {
        "mean_p_true_on_TRUE_claims": round(np.mean([r["p_true"] for r in trues]), 4),
        "mean_p_true_on_FALSE_claims": round(np.mean([r["p_true"] for r in falses]), 4),
        "separation_gap": round(np.mean([r["p_true"] for r in trues])
                                - np.mean([r["p_true"] for r in falses]), 4),
        "calibration_buckets": {},
        "n": n, "n_correct_calls": n_correct, "n_abstained": n_abstain,
    }
    for lo in (0.0, 0.3, 0.5, 0.7):
        hi = {0.0: 0.3, 0.3: 0.5, 0.5: 0.7, 0.7: 1.01}[lo]
        b = [r for r in rows if lo <= r["p_true"] < hi]
        if b:
            cal["calibration_buckets"][f"[{lo},{hi})"] = {
                "n": len(b), "mean_p_true": round(float(np.mean([r["p_true"] for r in b])), 3),
                "realized_true_freq": round(sum(r["truth"] for r in b) / len(b), 3)}
    # rank separation (does p_true order true claims above false ones?)
    from itertools import product
    pairs = [(t, f) for t in trues for f in falses]
    concordant = sum(t["p_true"] > f["p_true"] for t, f in pairs)
    ties = sum(t["p_true"] == f["p_true"] for t, f in pairs)
    cal["rank_auc_true_vs_false"] = round((concordant + 0.5 * ties) / len(pairs), 4)
    cal["rank_pairs"] = len(pairs)
    json.dump({"rows": rows, "summary": cal},
              open(os.path.join(OUT, "tde1_summary.json"), "w"), indent=1)
    print(json.dumps(cal, indent=1))
    for r in rows:
        print(f"  {r['id']:<20} truth={str(r['truth']):<5} p_true={r['p_true']:.3f} "
              f"unk={r['p_unknown']:.3f} call={r['call']:<6} correct={r['correct']} "
              f"rot={r['rot_agreement']:.2f}")


if __name__ == "__main__":
    stages = sys.argv[1:] or ["prep", "key", "run", "analyze"]
    for s in stages:
        {"prep": stage_prep, "key": stage_key, "run": stage_run,
         "analyze": stage_analyze}[s]()
