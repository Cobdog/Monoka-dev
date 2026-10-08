"""setL_3 — the Amendment-1/4/7 review surface for Set L (gpu-review/setL/).

Instrument contract (67bb129, verbatim — copy, never regenerate):
  - review.html = scripts/gpu-review/review-template.html copied unmodified;
  - pairs/ blinded L/R (side by sha256, the setA-K convention), native mp4
    fallbacks; the comparison pairs are the DELIVERED 66f strips (matched
    duration by construction); the null pair is the 22f tween w1 s1 vs its
    __setLnull duplicate;
  - pairs/.key escrowed BEFORE any judging;
  - pairs-metadata.js per PAIRS-METADATA-SPEC + AMENDMENT 7 on EVERY pair
    (question in maintainer terms, ONE judging criterion, side-swap
    disclosure, the null wording on p01);
  - frames via extract-review-frames.py + verify-frame-assets.py (the
    null pair must pass pixel identity through the instrument).

Pair board (the brief's minimum pairs key — pairwise arm-vs-arm on the
judged axes x the seeds):
  p01        NULL     tween w1 s1 vs nullL (bit-identity proven at run time)
  p02..p04   seed 1   tween x mctx · mctx x setk · single x tween · single x mctx
  p05..p08   seed 2   (same four combos)
  p09..p12   seed 3   (same four combos)
"""
import hashlib
import json
import os
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUTD = os.path.abspath(os.path.join(HERE, "..", "out"))
ROOT = "/home/agent/work/VS Proj/MINIMAX-DESKTOP"
REVIEW = os.path.join(ROOT, "gpu-review", "setL")
ENGINE_OUT = "/home/agent/comfyui/output"
DATE = "2026-10-08"
F_DELIVER = 66

Q = ("The continuation question: to carry a character's motion into NEW time — "
     "the same 2.75-second arc with three direction changes (her head screen-right "
     "→ toward camera → screen-left → back toward camera while both arms rise "
     "overhead, then the left arm lowers) — which mechanism should earn the "
     "animation module's continuation spec: the tween image-reference chain, one "
     "longer single generation, Set K-style latent re-noising, or Motion Context "
     "tail conditioning?")
JUDGE = ("ONE call per side: which 66-frame strip advances the arc better — real "
         "motion through ALL THREE phases (watch for early freezes and held "
         "stills), direction and speed carrying smoothly across the internal "
         "cut(s), the clean hand-drawn line held, and the same elf woman "
         "throughout. Judge MOTION ADVANCEMENT first, then boundary continuity, "
         "then drawing style, then identity.")
SIDES = "sides randomized per pair by sha256 - no consistent side carries either arm"
NULL_NOTE = ("identical content expected - flicker or divergence is a TOOLING BUG, "
             "report it")

ARM_LABEL = {
    "tween": "arm1 tween (3x22f chained image references)",
    "single": "arm2 single (one 73f gen, trimmed to 66f)",
    "setk": "arm3 setk (3x22f terminal-zero latent re-noise chain)",
    "mctx": "arm4 mctx (39f fresh + 56f Motion-Context window, 22f tail pinned)",
}


def side_for(pid):
    h = int(hashlib.sha256(("setL-" + pid).encode()).hexdigest(), 16)
    return "L" if h % 2 == 0 else "R"


def sha16(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def vfile(f):
    return os.path.join(ENGINE_OUT, f["subfolder"], f["filename"])


def nframes(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-count_frames", "-show_entries", "stream=nb_read_frames",
                        "-of", "csv=p=0", path], capture_output=True, text=True)
    return int(r.stdout.strip())


def sampler_only(rec):
    return round(sum(b["sampler_elapsed_s"] for b in rec.get("sampler_bars", [])), 1)


def build():
    os.makedirs(os.path.join(REVIEW, "pairs"), exist_ok=True)
    os.makedirs(os.path.join(REVIEW, "runs"), exist_ok=True)
    shutil.copy2(os.path.join(ROOT, "scripts", "gpu-review", "review-template.html"),
                 os.path.join(REVIEW, "review.html"))
    runs = json.load(open(os.path.join(OUTD, "setL_1_runs.json")))["runs"]
    by_id = {r["run_id"]: r for r in runs if r.get("ok")}

    # the delivered strips (setL_2 built them; assert present)
    DELIV = os.path.join(OUTD, "deliv")
    strips = {f"{arm}_s{seed}": os.path.join(DELIV, f"{arm}_s{seed}.mp4")
              for arm in ("tween", "single", "setk", "mctx")
              for seed in (421337, 421421, 421777)}
    for k, p in strips.items():
        assert os.path.exists(p), f"missing strip {p} - run setL_2 first"
        assert nframes(p) == F_DELIVER, f"{k}: {nframes(p)} != {F_DELIVER}"

    def cost_of(arm, seed):
        if arm == "tween":
            rids = [f"tween_s{seed}_w{k}" for k in (1, 2, 3)]
        elif arm == "setk":
            rids = [f"setk_s{seed}"]
        elif arm == "single":
            rids = [f"single_s{seed}"]
        else:
            rids = [f"mctx_s{seed}"]
        wall = sum(by_id[r]["wall_s"] for r in rids)
        samp = sum(sampler_only(by_id[r]) for r in rids)
        vram = max(by_id[r]["vram_peak_mib"] for r in rids)
        return {"wall_s_total": round(wall, 1), "sampler_only_s_total": samp,
                "vram_peak_mib_max": vram, "renders": len(rids)}

    COMBOS = [("tween", "mctx"), ("mctx", "setk"), ("single", "tween"), ("single", "mctx")]
    PAIRS = []
    pnum = 2
    for seed in (421337, 421421, 421777):
        for a, b in COMBOS:
            PAIRS.append((f"p{pnum:02d}", f"{a}_s{seed}", f"{b}_s{seed}",
                          f"seed {seed}: {a} vs {b}", f"{a}x{b}", seed))
            pnum += 1

    meta, key_rows = {}, {}
    for pid, a, b, contrast, kind, seed in PAIRS:
        side = side_for(pid)
        left, right = (a, b) if side == "L" else (b, a)
        entries = {}
        for mat in (left, right):
            arm = mat.rsplit("_s", 1)[0]
            dst = os.path.join(REVIEW, "pairs", f"{pid}_{'L' if mat == left else 'R'}.mp4")
            shutil.copy2(strips[mat], dst)
            entries[mat] = {"staged": os.path.relpath(dst, REVIEW),
                            "sha256_16": sha16(dst), "frames": F_DELIVER,
                            "cost": cost_of(arm, seed)}
        shared = {
            "set": "L", "date": DATE, "kind": kind, "seed": seed, "question": Q,
            "judge": JUDGE, "sides": SIDES, "fps": 24, "frames": F_DELIVER,
            "canvas": "1344x768",
            "subject": "Set K's A reference (the elf-girl bust drawing, clean line "
                       "on white) carrying the 3-direction arc: head screen-right -> "
                       "camera -> screen-left -> back toward camera, arms rising "
                       "overhead then the left arm lowering",
            "model": "the Set-K point on every arm: ref2va pruned int8 + tween LoRA "
                     "@1.0, euler/simple 30 steps, no CFG, shift 12/3; arm 4 adds "
                     "Motion Context tail conditioning (22f context, 24f audio) per "
                     "its pack's documented conventions",
            "audio_note": "strips are silent concats (silent line-art subject); "
                          "per-window originals with audio auditionable in runs/",
        }
        meta[pid] = {"shared": shared,
                     "L": entries[left], "R": entries[right],
                     "note": "contrast pair - arm identities in the escrowed key; "
                             "per-side cost reveals render only after your call"}
        key_rows[pid] = {"L": left, "R": right, "contrast": contrast, "kind": kind}

    # p01: the null pair (22f clips, kind null)
    null_dst = os.path.join(REVIEW, "pairs", "p01_L.mp4")
    tw_dst = os.path.join(REVIEW, "pairs", "p01_R.mp4")
    side = side_for("p01")
    n_src, t_src = vfile(by_id["nullL"]["files"][0]), vfile(by_id["tween_s421337_w1"]["files"][0])
    if side == "R":
        n_src, t_src = t_src, n_src
    shutil.copy2(n_src, null_dst)
    shutil.copy2(t_src, tw_dst)
    meta["p01"] = {
        "shared": {"set": "L", "date": DATE, "kind": "null", "seed": 421337,
                   "question": Q, "judge": NULL_NOTE, "sides": SIDES, "fps": 24,
                   "frames": 22, "canvas": "1344x768",
                   "subject": "the null gate: one 22f render duplicated through a "
                              "fresh VAE alias",
                   "model": "identical config both sides", "audio_note": ""},
        "L": {"staged": "pairs/p01_L.mp4", "sha256_16": sha16(null_dst), "frames": 22,
              "cost": {"wall_s_total": by_id["nullL"]["wall_s"],
                       "sampler_only_s_total": sampler_only(by_id["nullL"]),
                       "vram_peak_mib_max": by_id["nullL"]["vram_peak_mib"], "renders": 1}},
        "R": {"staged": "pairs/p01_R.mp4", "sha256_16": sha16(tw_dst), "frames": 22,
              "cost": {"wall_s_total": by_id["tween_s421337_w1"]["wall_s"],
                       "sampler_only_s_total": sampler_only(by_id["tween_s421337_w1"]),
                       "vram_peak_mib_max": by_id["tween_s421337_w1"]["vram_peak_mib"],
                       "renders": 1}},
        "note": NULL_NOTE,
    }
    key_rows["p01"] = {"L": "nullL" if side == "L" else "tween_w1_s1",
                       "R": "tween_w1_s1" if side == "L" else "nullL",
                       "contrast": "NULL GATE: tween w1 s1 duplicated through __setLnull",
                       "kind": "null"}

    with open(os.path.join(REVIEW, "pairs-metadata.js"), "w") as f:
        f.write("// gpu-review/setL - generation metadata (PAIRS-METADATA-SPEC + Amendment 7)\n")
        f.write("// question/judge/sides render always; per-side reveals post-call.\n")
        f.write("window.PAIR_META = " + json.dumps(meta, indent=1) + ";\n")

    with open(os.path.join(REVIEW, "pairs", ".key"), "w") as f:
        f.write("# Set L review-pair key - ESCROWED. Do not open until your calls are\n")
        f.write("# recorded (export review-responses.js from review.html?set=L first).\n\n")
        for pid in sorted(key_rows):
            r = key_rows[pid]
            f.write(f"- pair: {pid} [{r['kind']}] seed "
                    f"{(meta[pid]['shared'].get('seed'))}\n  L: {r['L']}  R: {r['R']}\n"
                    f"  contrast: {r['contrast']}\n\n")
        f.write("# arm key:\n")
        for a, label in ARM_LABEL.items():
            f.write(f"#   {a}: {label}\n")

    # browsable runs/ + slim manifest (every render, incl. every latent beat)
    slim = []
    for r in runs:
        for f in r.get("files", []):
            src = vfile(f)
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(REVIEW, "runs", f["filename"]))
        slim.append({k: r.get(k) for k in ("run_id", "arm", "tags", "wall_s",
                                           "sampler_bars", "prompt_exec_s",
                                           "vram_peak_mib", "artifacts",
                                           "framemd5_n", "video_md5_full", "audio_md5")})
    with open(os.path.join(REVIEW, "runs", "manifests.json"), "w") as f:
        json.dump({"config": json.load(open(os.path.join(OUTD, "setL_1_runs.json")))["config"],
                   "gates": [json.loads(l) for l in open(os.path.join(OUTD, "setL_gates.json"))]
                   if os.path.exists(os.path.join(OUTD, "setL_gates.json")) else [],
                   "runs": slim}, f, indent=1)

    print(f"[setL_3] {len(key_rows)} blinded pairs + escrowed key + pairs-metadata.js -> {REVIEW}")
    print("[setL_3] NEXT: extract-review-frames.py gpu-review/setL + verify-frame-assets.py")


if __name__ == "__main__":
    build()
