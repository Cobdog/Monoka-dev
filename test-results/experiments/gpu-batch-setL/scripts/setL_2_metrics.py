"""setL_2 — the Set L continuity + cost battery (CPU-only; the eye is the
decision layer — metrics are secondary context per the standing doctrine).

Run with the ENGINE VENV python (cv2 + insightface live there):
  /home/agent/comfyui/.venv/bin/python setL_2_metrics.py

The strategic review's #5 demand — test motion continuity, not only seam
appearance and identity — operationalized per DELIVERED 66f strip:

  advancement   optical-flow speed per frame (Farneback, 2x downscaled);
                per-22f-segment path length (sum of mean speeds), net
                displacement (norm of summed flow), mean speed profile
  frozen/dup    consecutive-frame dE < 0.35 (near-duplicate) count + longest
                frozen run; 12-frame-tail mean speed (does motion die?)
  on-twos       held-drawing signature: fraction of frames matching the
                frame two back better than the frame one back
                (dE(i,i-2) < 0.6*dE(i,i-1)); + the setA alternation metric
  boundary      at every internal seam (tween/setk 22+44, mctx 39, single
                none): speed ratio + circular direction delta across the
                seam vs each side's local mean, + setA's seam ratio
  color drift   per-frame mean L* and chroma; dE-to-frame-0 curve (stride 2)
  identity      first/last frame vs A_land and C_key (dE, PSNR, ArcFace)
  cost          per run: prompt wall, sampler-only (tqdm bars), peak VRAM,
                artifact bytes — the wall-time profile that settles the
                "~2x is a warning not a law" note (tween vs setk per window)

Writes out/setL_2_metrics.json.
"""
import json
import math
import os
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUTD = os.path.abspath(os.path.join(HERE, "..", "out"))
sys.path.insert(0, "/home/agent/work/VS Proj/MINIMAX-DESKTOP/test-results/experiments/gpu-batch-setA/scripts")
sys.path.insert(0, "/home/agent/work/VS Proj/MINIMAX-DESKTOP/test-results/experiments/gpu-batch-setC/scripts")
sys.path.insert(0, "/home/agent/work/VS Proj/MINIMAX-DESKTOP/test-results/experiments/gpu-batch-combined/scripts")

import batch_metrics as bm  # noqa: E402
from c2_metrics import hf_energy  # noqa: E402
from cmb_2_metrics import audio_six, BAND  # noqa: E402

ENGINE_OUT = "/home/agent/comfyui/output"
INPUT = "/home/agent/comfyui/input/setL"
A_LAND = "/home/agent/comfyui/input/setK/A_land.png"
DELIV = os.path.join(OUTD, "deliv")
SEAMS = {"tween": [22, 44], "setk": [22, 44], "mctx": [39], "single": []}
F_DELIVER = 66


def vfile(f):
    return os.path.join(ENGINE_OUT, f["subfolder"], f["filename"])


def load_rgb(path):
    return cv2.cvtColor(cv2.imread(path), cv2.COLOR_BGR2RGB)


def concat(files, out_path):
    """Frame-exact concat via the concat FILTER (the concat DEMUXER pads or
    duplicates at boundaries when mp4 container durations truncate - the
    grid-trim lesson; three 22f clips demuxed to 67)."""
    n = len(files)
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    for f in files:
        cmd += ["-i", f]
    cmd += ["-filter_complex",
            f"[0:v][1:v][2:v]concat=n={n}:v=1:a=0[out]" if n == 3 else
            f"[0:v][1:v]concat=n={n}:v=1:a=0[out]",
            "-map", "[out]", "-an", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "8", "-pix_fmt", "yuv420p", "-fps_mode", "cfr", out_path]
    subprocess.run(cmd, check=True)
    return out_path


def trim_to(src, dst, n):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-an",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "8",
                    "-pix_fmt", "yuv420p", "-fps_mode", "cfr", "-frames:v", str(n), dst],
                   check=True)
    return dst


# ------------------------------------------------------------ strip assembly
def build_strips(by_id):
    """The delivered 66f strip per arm x seed. Returns {arm_s<seed>: path}."""
    os.makedirs(DELIV, exist_ok=True)
    out = {}
    for seed in (421337, 421421, 421777):
        tw = [vfile(by_id[f"tween_s{seed}_w{k}"]["files"][0]) for k in (1, 2, 3)]
        out[f"tween_s{seed}"] = concat(tw, os.path.join(DELIV, f"tween_s{seed}.mp4"))
        sk = [vfile(by_id[f"setk_s{seed}"]["files"][i]) for i in range(3)]
        out[f"setk_s{seed}"] = concat(sk, os.path.join(DELIV, f"setk_s{seed}.mp4"))
        sg = vfile(by_id[f"single_s{seed}"]["files"][0])
        out[f"single_s{seed}"] = trim_to(sg, os.path.join(DELIV, f"single_s{seed}.mp4"), F_DELIVER)
        # mctx: files sorted by name = [w1 (39f), w2 (34f trimmed)]
        mf = sorted(by_id[f"mctx_s{seed}"]["files"], key=lambda f: f["filename"])
        full = concat([vfile(mf[0]), vfile(mf[1])], os.path.join(DELIV, f"mctx_full_s{seed}.mp4"))
        out[f"mctx_s{seed}"] = trim_to(full, os.path.join(DELIV, f"mctx_s{seed}.mp4"), F_DELIVER)
    for k, p in out.items():
        n = bm.frame_count(p)
        assert n == F_DELIVER, f"{k}: delivered {n} != {F_DELIVER}"
    return out


# ------------------------------------------------------------- strip metrics
def gray_down(fr):
    g = cv2.cvtColor(fr, cv2.COLOR_RGB2GRAY)
    return cv2.resize(g, (g.shape[1] // 2, g.shape[0] // 2), interpolation=cv2.INTER_AREA)


def strip_metrics(path, arm):
    frames = bm.extract_frames(path)          # RGB, uint8
    n = len(frames)
    rec = {"arm": arm, "file": os.path.basename(path), "frames": n}

    # flow: speed + summed direction per consecutive pair
    speeds, dirs = [], []
    for i in range(1, n):
        a, b = gray_down(frames[i - 1]), gray_down(frames[i])
        fl = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 3, 21, 3, 5, 1.2, 0)
        mag = np.linalg.norm(fl, axis=2)
        speeds.append(round(float(mag.mean()), 4))
        sx, sy = float(fl[..., 0].sum()), float(fl[..., 1].sum())
        dirs.append(round(math.atan2(sy, sx), 4))
    rec["flow_speed_per_frame"] = speeds
    rec["flow_dir_per_frame_rad"] = dirs

    # advancement per 22f segment
    segs = []
    for s in range(0, n, 22):
        chunk = speeds[s:min(s + 21, n - 1)]
        segs.append({"from": s, "path_len": round(sum(chunk), 3),
                     "mean_speed": round(float(np.mean(chunk)), 4) if chunk else None,
                     "tail12_mean": round(float(np.mean(chunk[-12:])), 4) if len(chunk) >= 12 else None})
    rec["segments_22f"] = segs
    rec["total_path_len"] = round(sum(speeds), 3)
    rec["tail12_mean_speed"] = round(float(np.mean(speeds[-12:])), 4)
    rec["first12_mean_speed"] = round(float(np.mean(speeds[:12])), 4)

    # frozen / duplicate frames (consecutive dE)
    des = []
    for i in range(1, n):
        des.append(float(bm.dE_cie76(frames[i - 1], frames[i])))
    rec["consec_dE"] = [round(d, 3) for d in des]
    frozen = [i for i, d in enumerate(des) if d < 0.35]
    rec["frozen_frame_count"] = len(frozen)
    rec["frozen_frames"] = frozen[:40]
    longest = cur = 0
    for d in des:
        cur = cur + 1 if d < 0.35 else 0
        longest = max(longest, cur)
    rec["longest_frozen_run"] = longest

    # on-twos held-drawing signature
    hits = 0
    for i in range(2, n):
        d1 = des[i - 1]
        d2 = float(bm.dE_cie76(frames[i - 2], frames[i]))
        if d2 < 0.6 * d1:
            hits += 1
    rec["on_twos_fraction"] = round(hits / (n - 2), 4)

    # color drift: per-frame L* + chroma; dE to frame 0
    labs = [cv2.cvtColor(fr, cv2.COLOR_RGB2LAB).astype(np.float32) for fr in frames]
    rec["L_star_series"] = [round(float(l[..., 0].mean()), 2) for l in labs]
    rec["chroma_series"] = [round(float(np.linalg.norm(l[..., 1:], axis=2).mean()), 2) for l in labs]
    rec["dE_to_frame0_stride2"] = [round(float(bm.dE_cie76(frames[0], frames[i])), 3)
                                   for i in range(0, n, 2)]

    # boundary continuity at each internal seam
    seams = SEAMS[arm]
    bnd = {}
    for s in seams:
        pre = speeds[max(0, s - 6):s]
        post = speeds[s:min(n - 1, s + 6)]
        pm, qm = float(np.mean(pre)) if pre else 0.0, float(np.mean(post)) if post else 0.0
        dpre = dirs[max(0, s - 6):s]
        dpost = dirs[s:min(n - 1, s + 6)]
        def circ(a, b):
            return abs(math.atan2(math.sin(a - b), math.cos(a - b)))
        dd = (circ(float(np.mean(dpost)) if dpost else 0.0,
                   float(np.mean(dpre)) if dpre else 0.0) if (dpre and dpost) else None)
        bnd[str(s)] = {
            "speed_before": round(pm, 4), "speed_after": round(qm, 4),
            "speed_ratio": round(qm / pm, 4) if pm > 1e-4 else None,
            "dir_delta_rad": round(dd, 4) if dd is not None else None,
            "seam_dE": round(des[s - 1], 3),
            "seam_ratio": {k: (round(v, 4) if isinstance(v, float) else v)
                           for k, v in bm.seam_metrics(path, s).items()},
        }
    rec["boundaries"] = bnd

    # standard battery (shimmer/alternation + HF + L*; audio guarded - the
    # delivered strips are silent concats by construction)
    sh = bm.shimmer_metrics(path, region=BAND)
    rec.update({f"band_{k}": v for k, v in sh.items()})
    rec.update(hf_energy(path))
    try:
        rec.update(audio_six(path))
    except Exception as ex:
        rec["audio_six"] = f"n/a (silent concat): {type(ex).__name__}"
    rec["global_L_mean"] = round(bm.L_star(frames[0]), 3)
    return rec


def _strip_worker(args):
    key, path = args            # strips.items() yields (key, path)
    return key, strip_metrics(path, key.rsplit("_s", 1)[0])


# ------------------------------------------------------- landmark identity
def img_pair(a, b):
    h = min(a.shape[0], b.shape[0]); w = min(a.shape[1], b.shape[1])
    a2 = cv2.resize(a, (w, h), interpolation=cv2.INTER_AREA)
    b2 = cv2.resize(b, (w, h), interpolation=cv2.INTER_AREA)
    return {"psnr_db": round(bm.psnr(a2, b2), 3),
            "dE_mean": round(float(bm.dE_cie76(a2, b2)), 3)}


def arc_cos(app, img_a, img_b):
    da, db = bm.largest_face(img_a), bm.largest_face(img_b)
    if da is None or db is None or da.embedding is None or db.embedding is None:
        return None
    ea = da.embedding / np.linalg.norm(da.embedding)
    eb = db.embedding / np.linalg.norm(db.embedding)
    return round(float(np.dot(ea, eb)), 5)


def landmarks(strips):
    A = load_rgb(A_LAND)
    Cp = os.path.join(INPUT, "C_key.png")
    C = load_rgb(Cp) if os.path.exists(Cp) else None
    app = bm.arcface_app()
    out = {"A_vs_C": img_pair(A, C) | {"arcface_cos": arc_cos(app, A, C)} if C is not None else None}
    for key, path in strips.items():
        fr = bm.extract_frames(path)
        first, last = fr[0], fr[-1]
        out[key] = {
            "first_vs_A": img_pair(A, first) | {"arcface_cos": arc_cos(app, A, first)},
            "last_vs_A": img_pair(A, last) | {"arcface_cos": arc_cos(app, A, last)},
            "last_vs_C": (img_pair(C, last) | {"arcface_cos": arc_cos(app, C, last)}) if C is not None else None,
        }
    return out


# ------------------------------------------------------------------- the cost
def cost_table(runs):
    rows = {}
    for r in runs:
        if not r.get("ok"):
            continue
        rid = r["run_id"]
        rows[rid] = {
            "arm": r["arm"], "wall_s": r.get("wall_s"),
            "prompt_exec_s": r.get("prompt_exec_s"),
            "sampler_bars": r.get("sampler_bars"),
            "sampler_only_s": round(sum(b["sampler_elapsed_s"] for b in r.get("sampler_bars", [])), 1),
            "vram_peak_mib": r.get("vram_peak_mib"),
            "artifact_bytes": sum(a["bytes"] for a in r.get("artifacts", {}).values()),
            "frames": [a["frames"] for a in r.get("artifacts", {}).values()],
        }
    return rows


def main():
    runs = json.load(open(os.path.join(OUTD, "setL_1_runs.json")))["runs"]
    by_id = {r["run_id"]: r for r in runs if r.get("ok")}
    strips = build_strips(by_id)
    print(f"[setL_2] {len(strips)} delivered strips built (all {F_DELIVER}f)", flush=True)

    metrics = {}
    with ProcessPoolExecutor(max_workers=4) as ex:
        for key, res in ex.map(_strip_worker, list(strips.items())):
            metrics[key] = res
            print(f"[setL_2] {key}: path {res['total_path_len']} frozen {res['frozen_frame_count']} "
                  f"on-twos {res['on_twos_fraction']} alt {res.get('band_alternation_peak_power_ratio')}",
                  flush=True)

    lm = landmarks(strips)
    cost = cost_table(runs)
    result = {"strips": metrics, "landmarks": lm, "cost": cost}
    with open(os.path.join(OUTD, "setL_2_metrics.json"), "w") as fh:
        json.dump(result, fh, indent=1)
    print(f"[setL_2] wrote setL_2_metrics.json ({len(metrics)} strips, "
          f"{len(lm) - 1} landmark sets, {len(cost)} cost rows)")


if __name__ == "__main__":
    main()
