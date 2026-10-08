"""setM_2 — the Set M swap battery (CPU-only; the eye is the decision layer
— metrics are secondary context per the standing doctrine).

Run with the ENGINE VENV python (cv2 lives there):
  /home/agent/comfyui/.venv/bin/python setM_2_metrics.py

Per DELIVERED 66f strip (every Viggle arm trimmed 73 -> 66, matching the
driving clip's length):

  motion fidelity     flow speed per frame (Farneback 2x down); Pearson
                      correlation of the arm's speed series vs the driving
                      clip's; path-length ratio; frozen-frame count
  identity hold       dE(frame_k, the arm's OWN input ref) sampled every 6
                      frames — the hold curve; first/last/mid vs the ref
                      (dE + PSNR)
  swap discrimination the cross matrix: each arm's first/mid/last frame vs
                      EVERY arm's ref (dE) — does the face arm stay closest
                      to rep_face, the outfit arm to rep_outfit?
  region hold         head/torso region dE of arm frame 0 vs the arm's ref
                      (the swap landed where it was asked); head/torso
                      region drift within the strip (frame 66 vs frame 0)
  background          4 corner patches (140x140) mean dE vs the driving
                      clip's corners per sampled frame — ground/edge hold
  drift probe         dE(frame_k, ref) vs the driving clip's own
                      dE(frame_k, frame0_drive) — does identity distance
                      grow with pose displacement? (the re-entry surrogate)
  cost                per run: prompt wall, sampler-only (tqdm), peak VRAM,
                      artifact bytes

Writes out/setM_2_metrics.json.
"""
import json
import math
import os
import subprocess
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUTD = os.path.abspath(os.path.join(HERE, "..", "out"))
ENGINE_OUT = "/home/agent/comfyui/output"
INPUT = "/home/agent/comfyui/input/setM"
INPUT_ROOT = "/home/agent/comfyui/input"
DRIVE_MP4 = os.path.join(INPUT_ROOT, "setM_drive.mp4")
DELIV = os.path.join(OUTD, "deliv")
F_DELIVER = 66
SEAMS = [22, 44]

sys.path.insert(0, "/home/agent/work/VS Proj/MINIMAX-DESKTOP/test-results/experiments/gpu-batch-setA/scripts")
import batch_metrics as bm  # noqa: E402

ARMS = ("control", "face", "outfit", "sheet")
import setM_lib as _ML
SEEDS = tuple(_ML.SEEDS)
REF_OF = {"control": "rep_control.png", "face": "rep_face.png",
          "outfit": "rep_outfit.png", "sheet": "B_sheet.png"}
HEAD_BOX = (0.32, 0.04, 0.68, 0.42)
TORSO_BOX = (0.30, 0.45, 0.70, 0.95)


def vfile(f):
    return os.path.join(ENGINE_OUT, f["subfolder"], f["filename"])


def load_rgb(path):
    return cv2.cvtColor(cv2.imread(path), cv2.COLOR_BGR2RGB)


def trim_to(src, dst, n):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-an",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "8",
                    "-pix_fmt", "yuv420p", "-fps_mode", "cfr", "-frames:v", str(n), dst],
                   check=True)
    return dst


def extract_frames(path):
    frames = []
    cap = cv2.VideoCapture(path)
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        frames.append(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))
    cap.release()
    return frames


def gray_down(fr):
    g = cv2.cvtColor(fr, cv2.COLOR_RGB2GRAY)
    return cv2.resize(g, (g.shape[1] // 2, g.shape[0] // 2), interpolation=cv2.INTER_AREA)


def speed_series(frames):
    speeds = []
    prev = None
    for fr in frames:
        g = gray_down(fr)
        if prev is not None:
            fl = cv2.calcOpticalFlowFarneback(prev, g, None, 0.5, 3, 21, 3, 5, 1.2, 0)
            speeds.append(float(np.linalg.norm(fl, axis=2).mean()))
        prev = g
    return speeds


def dE_img(a, b):
    la = cv2.cvtColor(a, cv2.COLOR_RGB2LAB).astype(np.float32)
    lb = cv2.cvtColor(b, cv2.COLOR_RGB2LAB).astype(np.float32)
    if la.shape != lb.shape:      # the sheet ref is 3-view wide; compare at a
        h, w = 384, 672           # fixed working res (uniform across arms)
        la = cv2.resize(la, (w, h), interpolation=cv2.INTER_AREA)
        lb = cv2.resize(lb, (w, h), interpolation=cv2.INTER_AREA)
    return float(np.mean(np.linalg.norm(la - lb, axis=2)))


def fit(a, b):
    h, w = min(a.shape[0], b.shape[0]), min(a.shape[1], b.shape[1])
    return a[:h, :w], b[:h, :w]


def psnr(a, b):
    a2, b2 = fit(np.asarray(a, np.float32), np.asarray(b, np.float32))
    mse = float(np.mean((a2 - b2) ** 2))
    return 99.0 if mse < 1e-9 else 10.0 * math.log10(255.0 ** 2 / mse)


def region(img, box):
    x0, y0, x1, y1 = box
    h, w = img.shape[:2]
    return img[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]


def corners(img):
    h, w = img.shape[:2]
    s = 140
    return [img[0:s, 0:s], img[0:s, w - s:w], img[h - s:h, 0:s], img[h - s:h, w - s:w]]


def build_strips(by_id):
    os.makedirs(DELIV, exist_ok=True)
    out = {"drive": DRIVE_MP4}
    for arm in ARMS:
        for seed in SEEDS:
            src = vfile(by_id[f"vig_{arm}_s{seed}"]["files"][0])
            out[f"{arm}_s{seed}"] = trim_to(src, os.path.join(DELIV, f"{arm}_s{seed}.mp4"), F_DELIVER)
    for k, p in out.items():
        n = bm.frame_count(p)
        assert n == F_DELIVER, f"{k}: delivered {n} != {F_DELIVER}"
    return out


def strip_metrics(path, drive_frames, drive_speeds):
    frames = extract_frames(path)
    n = len(frames)
    rec = {"file": os.path.basename(path), "frames": n}
    speeds = speed_series(frames)
    rec["flow_speed_per_frame"] = [round(s, 4) for s in speeds]
    rec["total_path"] = round(float(np.sum(speeds)), 3)
    # frozen frames
    des = []
    for i in range(1, n):
        des.append(dE_img(frames[i - 1], frames[i]))
    rec["frozen_frame_count"] = int(sum(1 for d in des if d < 0.35))
    # motion fidelity vs the driving clip
    ds = drive_speeds[:len(speeds)]
    if len(ds) == len(speeds) and np.std(ds) > 1e-6 and np.std(speeds) > 1e-6:
        rec["speed_pearson_vs_drive"] = round(float(np.corrcoef(speeds, ds)[0, 1]), 4)
    else:
        rec["speed_pearson_vs_drive"] = None
    rec["path_ratio_vs_drive"] = round(float(np.sum(speeds)) / max(float(np.sum(drive_speeds)), 1e-6), 4)
    # seams (the driving chain's beats carry through propagation)
    seam = {}
    for s in SEAMS:
        pre = speeds[max(0, s - 6):s]
        post = speeds[s:min(n - 1, s + 6)]
        pm = float(np.mean(pre)) if pre else 0.0
        qm = float(np.mean(post)) if post else 0.0
        seam[str(s)] = {"speed_ratio": round(qm / pm, 4) if pm > 1e-4 else None,
                        "seam_dE": round(des[s - 1], 3)}
    rec["seams"] = seam
    return rec, frames


def main():
    runs = json.load(open(os.path.join(OUTD, "setM_1_runs.json")))["runs"]
    by_id = {r["run_id"]: r for r in runs if r.get("ok")}
    strips = build_strips(by_id)
    print(f"[setM_2] {len(strips)} delivered strips (all {F_DELIVER}f)", flush=True)

    drive_frames = extract_frames(strips["drive"])
    drive_speeds = speed_series(drive_frames)
    drive_des = [dE_img(drive_frames[i - 1], drive_frames[i]) for i in range(1, len(drive_frames))]

    refs = {arm: load_rgb(os.path.join(INPUT, REF_OF[arm])) for arm in ARMS}

    metrics = {"drive": {"total_path": round(float(np.sum(drive_speeds)), 3),
                         "frozen_frame_count": int(sum(1 for d in drive_des if d < 0.35)),
                         "file": os.path.basename(strips["drive"])}}
    for key, path in strips.items():
        if key == "drive":
            continue
        arm = key.rsplit("_s", 1)[0]
        rec, frames = strip_metrics(path, drive_frames, drive_speeds)
        rec["arm"] = arm

        # identity hold curve + drift probe (sampled every 6 frames)
        hold, driftx, drift_drive = [], [], []
        for i in range(0, len(frames), 6):
            hold.append(round(dE_img(refs[arm], frames[i]), 3))
            drift_drive.append(round(dE_img(drive_frames[0], drive_frames[i]), 3))
        rec["dE_to_own_ref_stride6"] = hold
        rec["drive_dE_to_frame0_stride6"] = drift_drive
        rec["hold_first"] = hold[0]
        rec["hold_last"] = hold[-1]
        rec["hold_max"] = max(hold)
        rec["psnr_first_vs_ref"] = round(psnr(refs[arm], frames[0]), 3)
        rec["psnr_last_vs_ref"] = round(psnr(refs[arm], frames[-1]), 3)

        # region hold at frame 0 (the swap landed) + within-strip region drift
        rec["head_region_dE_frame0_vs_ref"] = round(dE_img(region(refs[arm], HEAD_BOX),
                                                           region(frames[0], HEAD_BOX)), 3)
        rec["torso_region_dE_frame0_vs_ref"] = round(dE_img(region(refs[arm], TORSO_BOX),
                                                             region(frames[0], TORSO_BOX)), 3)
        rec["head_region_drift_66_vs_0"] = round(dE_img(region(frames[0], HEAD_BOX),
                                                        region(frames[-1], HEAD_BOX)), 3)
        rec["torso_region_drift_66_vs_0"] = round(dE_img(region(frames[0], TORSO_BOX),
                                                         region(frames[-1], TORSO_BOX)), 3)

        # background: corners vs the driving clip's corners (sampled)
        bg = []
        for i in range(0, len(frames), 6):
            ca, cb = corners(frames[i]), corners(drive_frames[i])
            bg.append(round(float(np.mean([dE_img(x, y) for x, y in zip(ca, cb)])), 3))
        rec["corner_dE_vs_drive_stride6"] = bg
        rec["corner_dE_mean"] = round(float(np.mean(bg)), 3)

        metrics[key] = rec
        print(f"[setM_2] {key}: path {rec['total_path']} (ratio {rec['path_ratio_vs_drive']}) "
              f"hold {rec['hold_first']}->{rec['hold_last']} (max {rec['hold_max']}) "
              f"corners {rec['corner_dE_mean']}", flush=True)

    # the cross matrix: each arm's frames vs every arm's ref (dE)
    cross = {}
    for arm in ARMS:
        for seed in SEEDS:
            frames = extract_frames(strips[f"{arm}_s{seed}"])
            row = {}
            for ref_arm in ARMS:
                picks = [0, len(frames) // 2, len(frames) - 1]
                row[ref_arm] = [round(dE_img(refs[ref_arm], frames[i]), 3) for i in picks]
            cross[f"{arm}_s{seed}"] = row
    print(f"[setM_2] cross matrix: {json.dumps(cross, indent=1)[:400]}", flush=True)

    cost = {}
    for r in runs:
        if not r.get("ok"):
            continue
        cost[r["run_id"]] = {
            "arm": r["arm"], "wall_s": r.get("wall_s"),
            "prompt_exec_s": r.get("prompt_exec_s"),
            "sampler_bars": r.get("sampler_bars"),
            "sampler_only_s": round(sum(b["sampler_elapsed_s"] for b in r.get("sampler_bars", [])), 1),
            "vram_peak_mib": r.get("vram_peak_mib"),
            "artifact_bytes": sum(a.get("bytes", 0) for a in r.get("artifacts", {}).values()),
        }

    result = {"strips": metrics, "cross_matrix": cross, "cost": cost}
    with open(os.path.join(OUTD, "setM_2_metrics.json"), "w") as fh:
        json.dump(result, fh, indent=1)
    print(f"[setM_2] wrote setM_2_metrics.json ({len(metrics)} strips, {len(cross)} cross rows, "
          f"{len(cost)} cost rows)")


if __name__ == "__main__":
    main()
