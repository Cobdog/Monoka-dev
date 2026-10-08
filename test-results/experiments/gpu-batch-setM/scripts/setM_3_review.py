"""setM_3 — the Amendment-1/4/7 review surface for Set M (gpu-review/setM/).

Instrument contract (67bb129, verbatim — copy, never regenerate):
  - review.html = scripts/gpu-review/review-template.html copied unmodified;
  - pairs/ blinded L/R (side by sha256, the setA-K convention), native mp4
    fallbacks; the comparison pairs are the DELIVERED 66f strips (matched
    duration by construction); the null pair is the RAW 73f control s421337
    vs its __setMnull duplicate (bit-identity proven at run time);
  - pairs/.key escrowed BEFORE any judging;
  - pairs-metadata.js per PAIRS-METADATA-SPEC + AMENDMENT 7 on EVERY pair
    (question in maintainer terms, ONE judging criterion, side-swap
    disclosure, the null wording on p01);
  - frames via extract-review-frames.py + verify-frame-assets.py (the
    null pair must pass pixel identity through the instrument).

Pair board (the brief's judged axes x the seeds):
  p01   NULL      control sSEEDS[0] vs nullM (73f raw, bit-identical)
  p02   control x driving (the propagation pair, seed-1 strip)
  p03/p04  face x control      (the two battery seeds)
  p05/p06  outfit x control    (the two battery seeds)
  p07/p08  sheet x face        (the two battery seeds)
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys

HERE0 = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE0)
import setM_lib as M  # noqa: E402

SEEDS = tuple(M.SEEDS)

HERE = os.path.dirname(os.path.abspath(__file__))
OUTD = os.path.abspath(os.path.join(HERE, "..", "out"))
ROOT = "/home/agent/work/VS Proj/MINIMAX-DESKTOP"
REVIEW = os.path.join(ROOT, "gpu-review", "setM")
ENGINE_OUT = "/home/agent/comfyui/output"
DATE = "2026-10-08"
F_DELIVER = 66
F_RAW = 73

Q = ("The Viggle-Animate swap question: the same 2.75-second driving clip of the "
     "elf woman (head turns with direction changes, both arms rising overhead, "
     "the figure drifting screen-right then settling back) is re-rendered by "
     "local Viggle-Animate from ONE still per arm — the elf woman re-rendered "
     "from her own repaint (control), the black-bobbed woman's FACE painted onto "
     "the elf's outfit (face), the black-bobbed woman's mustard cardigan painted "
     "onto the elf's face (outfit), and the black-bobbed woman as a 3-view "
     "character sheet (sheet). Which arm holds its intended identity and outfit "
     "through the motion, and where does it drift?")

SIDES = "sides randomized per pair by sha256 - no consistent side carries either arm"
NULL_NOTE = ("identical content expected - flicker or divergence is a TOOLING BUG, "
             "report it")

JUDGE_OF = {
    "facexcontrol": ("ONE call per side: which 66-frame strip keeps the BLACK-BOBBED "
                     "woman's face (chin-length black bob, straight dark bangs) through "
                     "the WHOLE strip while the outfit stays the elf woman's turtleneck "
                     "and light blue overshirt — judge FACE HOLD first (watch for the "
                     "bob reverting to the cream high bun mid-motion), then motion "
                     "smoothness, then line quality."),
    "outfitxcontrol": ("ONE call per side: which 66-frame strip keeps the elf woman's "
                       "face (cream-blonde high bun, long pointed ears, gold hoop) while "
                       "the outfit becomes the mustard-yellow cardigan over the charcoal "
                       "tee — judge OUTFIT FIDELITY first (does the outfit hold, does it "
                       "bleed into the face?), then motion smoothness, then line quality."),
    "sheetxface": ("ONE call per side: BOTH sides target the same black-bobbed identity "
                   "by different inputs — one single repainted frame versus a 3-view "
                   "character sheet. Which holds her identity better through the motion "
                   "(face, bob, earring) and renders more cleanly — judge IDENTITY HOLD "
                   "first, then motion smoothness, then line quality."),
    "controlxdrive": ("ONE call per side: one side is the DRIVING CLIP ITSELF (the elf "
                      "woman as rendered by our animation stack), the other is Viggle's "
                      "propagation of her from her own repainted first frame. Judge "
                      "PROPAGATION QUALITY: is the motion reproduced (the head turns, "
                      "the arm raises, the drift and settle), the white ground and "
                      "framing held, the drawing clean — or does the propagation smear, "
                      "freeze, or redraw the character?"),
}

ARM_LABEL = {
    "control": "control (the elf woman re-rendered from her own repaint of frame 0)",
    "face": "face (B's face — black bob, bangs, silver stud — painted onto A's outfit/pose)",
    "outfit": "outfit (B's mustard cardigan + charcoal tee painted onto A's face/pose)",
    "sheet": "sheet (B as a 3-view character sheet fed directly as the Viggle reference)",
}


def side_for(pid):
    h = int(hashlib.sha256(("setM-" + pid).encode()).hexdigest(), 16)
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
    runs = json.load(open(os.path.join(OUTD, "setM_1_runs.json")))["runs"]
    by_id = {r["run_id"]: r for r in runs if r.get("ok")}

    DELIV = os.path.join(OUTD, "deliv")
    strips = {f"{arm}_s{seed}": os.path.join(DELIV, f"{arm}_s{seed}.mp4")
              for arm in ("control", "face", "outfit", "sheet")
              for seed in SEEDS}
    strips["drive"] = os.path.join("/home/agent/comfyui/input", "setM_drive.mp4")
    for k, p in strips.items():
        assert os.path.exists(p), f"missing strip {p} - run setM_2 first"
        assert nframes(p) == F_DELIVER, f"{k}: {nframes(p)} != {F_DELIVER}"

    def cost_of(rid):
        r = by_id[rid]
        return {"wall_s_total": r["wall_s"], "sampler_only_s_total": sampler_only(r),
                "vram_peak_mib_max": r["vram_peak_mib"], "renders": 1}

    BOARD = [("p02", f"control_s{SEEDS[0]}", "drive", "controlxdrive", SEEDS[0]),
             ("p03", f"face_s{SEEDS[0]}", f"control_s{SEEDS[0]}", "facexcontrol", SEEDS[0]),
             ("p04", f"face_s{SEEDS[1]}", f"control_s{SEEDS[1]}", "facexcontrol", SEEDS[1]),
             ("p05", f"outfit_s{SEEDS[0]}", f"control_s{SEEDS[0]}", "outfitxcontrol", SEEDS[0]),
             ("p06", f"outfit_s{SEEDS[1]}", f"control_s{SEEDS[1]}", "outfitxcontrol", SEEDS[1]),
             ("p07", f"sheet_s{SEEDS[0]}", f"face_s{SEEDS[0]}", "sheetxface", SEEDS[0]),
             ("p08", f"sheet_s{SEEDS[1]}", f"face_s{SEEDS[1]}", "sheetxface", SEEDS[1])]

    meta, key_rows = {}, {}
    for pid, a, b, kind, seed in BOARD:
        side = side_for(pid)
        left, right = (a, b) if side == "L" else (b, a)
        entries = {}
        for mat in (left, right):
            dst = os.path.join(REVIEW, "pairs", f"{pid}_{'L' if mat == left else 'R'}.mp4")
            shutil.copy2(strips[mat], dst)
            rid = mat if mat == "drive" else mat
            cost = ({"renders": 0, "note": "the driving clip (our animation stack, not Viggle)"}
                    if mat == "drive" else cost_of(f"vig_{mat}"))
            entries[mat] = {"staged": os.path.relpath(dst, REVIEW),
                            "sha256_16": sha16(dst), "frames": F_DELIVER, "cost": cost}
        shared = {
            "set": "M", "date": DATE, "kind": kind, "seed": seed, "question": Q,
            "judge": JUDGE_OF[kind], "sides": SIDES, "fps": 24, "frames": F_DELIVER,
            "canvas": "1344x768",
            "subject": "the elf woman's driving clip re-rendered by Viggle-Animate from "
                       "one still per arm; character B is the authored black-bobbed woman "
                       "(chin-length black bob, straight bangs, silver stud earring, "
                       "mustard cardigan over charcoal tee)",
            "model": "Viggle pruned int8 + DMD r64 @1.0, shift 3/3, the upstream 4-point "
                     "sigma list (3 Euler updates), euler, BasicGuider, frozen 362-token "
                     "text conditioning; every arm shares the same driving clip",
            "audio_note": "strips are silent (Viggle discards generated audio); the "
                          "driving clip's own audio is our stack's synthetic silence",
        }
        meta[pid] = {"shared": shared,
                     "L": entries[left], "R": entries[right],
                     "note": "contrast pair - arm identities in the escrowed key; "
                             "per-side cost reveals render only after your call"}
        key_rows[pid] = {"L": left, "R": right, "contrast": f"{kind} seed {seed}",
                         "kind": kind}

    # p01: the null pair (73f RAW outputs, bit-identical by G-NULL)
    side = side_for("p01")
    n_src = vfile(by_id[f"nullM_s{SEEDS[0]}"]["files"][0])
    t_src = vfile(by_id[f"vig_control_s{SEEDS[0]}"]["files"][0])
    if side == "R":
        n_src, t_src = t_src, n_src
    shutil.copy2(n_src, os.path.join(REVIEW, "pairs", "p01_L.mp4"))
    shutil.copy2(t_src, os.path.join(REVIEW, "pairs", "p01_R.mp4"))
    meta["p01"] = {
        "shared": {"set": "M", "date": DATE, "kind": "null", "seed": 421337,
                   "question": Q, "judge": NULL_NOTE, "sides": SIDES, "fps": 24,
                   "frames": F_RAW, "canvas": "1344x768",
                   "subject": "the null gate: one Viggle propagation duplicated through "
                              "a fresh VAE alias",
                   "model": "identical config both sides", "audio_note": ""},
        "L": {"staged": "pairs/p01_L.mp4", "sha256_16": sha16(n_src), "frames": F_RAW,
              "cost": cost_of(f"nullM_s{SEEDS[0]}")},
        "R": {"staged": "pairs/p01_R.mp4", "sha256_16": sha16(t_src), "frames": F_RAW,
              "cost": cost_of(f"vig_control_s{SEEDS[0]}")},
        "note": NULL_NOTE,
    }
    key_rows["p01"] = {"L": f"nullM_s{SEEDS[0]}" if side == "L" else f"vig_control_s{SEEDS[0]}",
                       "R": f"vig_control_s{SEEDS[0]}" if side == "L" else f"nullM_s{SEEDS[0]}",
                       "contrast": f"NULL GATE: control s{SEEDS[0]} duplicated through __setMnull",
                       "kind": "null"}

    with open(os.path.join(REVIEW, "pairs-metadata.js"), "w") as f:
        f.write("// gpu-review/setM - generation metadata (PAIRS-METADATA-SPEC + Amendment 7)\n")
        f.write("// question/judge/sides render always; per-side reveals post-call.\n")
        f.write("window.PAIR_META = " + json.dumps(meta, indent=1) + ";\n")

    with open(os.path.join(REVIEW, "pairs", ".key"), "w") as f:
        f.write("# Set M review-pair key - ESCROWED. Do not open until your calls are\n")
        f.write("# recorded (export review-responses.js from review.html?set=M first).\n\n")
        for pid in sorted(key_rows):
            r = key_rows[pid]
            f.write(f"- pair: {pid} [{r['kind']}]\n  L: {r['L']}  R: {r['R']}\n"
                    f"  contrast: {r['contrast']}\n\n")
        f.write("# arm key:\n")
        for a, label in ARM_LABEL.items():
            f.write(f"#   {a}: {label}\n")
        f.write("#   drive: the driving clip itself (the elf woman via our setk latent chain)\n")

    # browsable runs/ + slim manifest (every render incl. the image-lane packets)
    slim = []
    for r in runs:
        for f in r.get("files", []):
            src = vfile(f)
            if os.path.exists(src) and f["filename"].endswith(".mp4"):
                shutil.copy2(src, os.path.join(REVIEW, "runs", f["filename"]))
        slim.append({k: r.get(k) for k in ("run_id", "arm", "wall_s",
                                           "sampler_bars", "prompt_exec_s",
                                           "vram_peak_mib", "artifacts",
                                           "framemd5_n", "video_md5_full")})
    with open(os.path.join(REVIEW, "runs", "manifests.json"), "w") as f:
        json.dump({"config": json.load(open(os.path.join(OUTD, "setM_1_runs.json")))["config"],
                   "gates": [json.loads(l) for l in open(os.path.join(OUTD, "setM_gates.json"))]
                   if os.path.exists(os.path.join(OUTD, "setM_gates.json")) else [],
                   "runs": slim}, f, indent=1)

    print(f"[setM_3] {len(key_rows)} blinded pairs + escrowed key + pairs-metadata.js -> {REVIEW}")
    print("[setM_3] NEXT: extract-review-frames.py gpu-review/setM + verify-frame-assets.py")


if __name__ == "__main__":
    build()
