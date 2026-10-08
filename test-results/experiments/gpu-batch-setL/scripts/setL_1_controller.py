"""setL_1 — the Set L controller (resume-safe; done run_ids skip).

Program (one invocation; every step gated + recorded in out/setL_1_runs.json):
  bring-up (dense routing, PID recorded, baseline VRAM recorded)
  -> hero (the C key author, single-ref contract) [GATE: C differs from A by
     a real pose distance - a broken far key stops the set before the burn]
  -> per seed s in {421337, 421421, 421777}:
       tween w1..w3 (w1 fresh; w2/w3 chained on promoted near refs)
       [s1 only: nullL duplicate through __setLnull -> G-NULL bit-identity]
       setk chain (3 beats, one graph) [s1 only: G-BEAT1 beat1 == tween w1]
       single (73f)
       mctx chain (39f fresh + 56f conditioned, one graph)
       [after s1: can2 -> G-CAN2; after s3: can3 -> G-CAN3]
  -> teardown (/free -> SIGINT the recorded PID -> baseline verify)

Gates (blocking; a failure stops the set for review):
  G-NULL   nullL bit-identical to tween w1 s1 (framemd5 AND audio md5)
  G-CANx   can2/can3 bit-identical to tween w1 s1 (environment-stop rule)
  G-BEAT1  setk beat-1 bit-identical to tween w1 s1 (cross-graph-context
           determinism; the chain graph's beat-1 path is uncorrupted)
  G-LORA   zero "not loaded" lora keys in every run's log slice
  G-FRAME  every output's frame count == its designed window (22 / 22x3 /
           73 / 39 / 34) - the silent off-grid clamp trap
  G-KEYC   the extracted C key sits a real pose distance from A (dE floor)

OOM policy (runbook): restart the engine before the next measurement; a
twice-OOMing run is recorded failed-to-run and the set continues.
Timing: per run, prompt wall + tqdm sampler bars (sampler-only, the sprint's
timing-boundary lesson) + "Prompt executed in" + peak VRAM + artifact bytes.
"""
import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
OUTD = os.path.abspath(os.path.join(HERE, "..", "out"))
LOG = "/home/agent/comfyui/setL-8189.log"
ENGINE_OUT = "/home/agent/comfyui/output"
INPUT = "/home/agent/comfyui/input/setL"
BASE = "http://127.0.0.1:8189"
CLIENT = str(uuid.uuid4())
FLAGS = ["--use-pytorch-cross-attention"]
BOOT_LINE = "Using pytorch attention"
RUNAWAY = {22: 900.0, 39: 1200.0, 56: 1500.0, 73: 2400.0}
RUNAWAY_CHAIN = 2700.0
KEYC_DE_FLOOR = 6.0

import setL_lib as L   # noqa: E402
import setL_captions as C  # noqa: E402

MPATH = os.path.join(OUTD, "setL_1_runs.json")
os.makedirs(INPUT, exist_ok=True)


def _get(path, timeout=30):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
        return json.loads(r.read().decode())


def _post(path, payload, timeout=180):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read().decode()
        return json.loads(body) if body.strip() else {"ok": True}


def gpu_state():
    q = subprocess.run(["nvidia-smi", "--query-gpu=memory.used,utilization.gpu",
                        "--format=csv,noheader,nounits"], capture_output=True, text=True)
    mem, util = [int(x.strip()) for x in q.stdout.strip().split("\n")[0].split(",")]
    return mem, util


ENGINE_PID = {"v": None}


def foreign_vram_mib():
    """VRAM held by compute apps OTHER than our own engine (the maintainer's
    engine mid-reload would OOM our ~24 GiB stack rather than pause it — the
    guard must see residency, not just queue state)."""
    q = subprocess.run(["nvidia-smi", "--query-compute-apps=pid,used_memory",
                        "--format=csv,noheader,nounits"], capture_output=True, text=True)
    tot = 0
    for ln in q.stdout.strip().splitlines():
        parts = [p.strip() for p in ln.split(",")]
        if len(parts) != 2:
            continue
        try:
            p, m = int(parts[0]), int(parts[1])
        except ValueError:
            continue
        if ENGINE_PID["v"] is not None and p == ENGINE_PID["v"]:
            continue
        tot += m
    return tot


def maintainer_busy():
    try:
        with urllib.request.urlopen("http://127.0.0.1:8188/queue", timeout=3) as r:
            q = json.loads(r.read().decode())
        return bool(q.get("queue_running")) or bool(q.get("queue_pending"))
    except Exception:
        return False


def contention_guard(tag):
    for attempt in range(240):     # up to 2 h of patience - their runs win
        mem, util = gpu_state()
        fv = foreign_vram_mib()
        try:
            running = _get("/queue")
        except Exception:
            raise SystemExit(f"[guard:{tag}] testbed unreachable")
        qbusy = bool(running.get("queue_running")) or bool(running.get("queue_pending"))
        mbusy = maintainer_busy()
        busy = qbusy or mbusy or util > 50 or fv > 1200
        if attempt % 4 == 0 or not busy:
            print(f"[guard:{tag}] VRAM {mem} MiB (foreign {fv}), util {util}%, "
                  f"our_q={'busy' if qbusy else 'clear'}, 8188={'busy' if mbusy else 'clear'}"
                  f"{' -> PAUSE' if busy else ' -> clear'}", flush=True)
        if not busy:
            return
        time.sleep(30)
    raise SystemExit(f"CONTENTION persists at {tag}; stopping for review")


def free_phase(tag):
    _post("/free", {"unload_models": True, "free_memory": True})
    time.sleep(3)
    mem, util = gpu_state()
    print(f"[free:{tag}] posted; VRAM now {mem} MiB, util {util}%", flush=True)


# ------------------------------------------------------------- engine lifecycle
def sigint_pid(pid, tag):
    if pid is None or not os.path.exists(f"/proc/{pid}"):
        print(f"[engine:{tag}] pid {pid} already gone", flush=True)
        return
    for sig in (signal.SIGINT, signal.SIGINT, signal.SIGTERM):
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            return
        for _ in range(60):
            if not os.path.exists(f"/proc/{pid}"):
                return
            time.sleep(1)
    raise SystemExit(f"[engine:{tag}] pid {pid} refused to die")


def engine_relaunch():
    """Launch 8189 per the runbook: dense routing flag, log file, PID
    recorded, NO --disable-dynamic-vram. Reuses an already-correct standing
    instance (idempotent)."""
    try:
        stats = _get("/system_stats", timeout=5)
        if os.path.exists(LOG):
            with open(LOG) as fh:
                if BOOT_LINE in fh.read():
                    q = subprocess.run(["pgrep", "-f", "main.py --port 8189"],
                                       capture_output=True, text=True)
                    pids = [int(p) for p in q.stdout.split()]
                    if pids:
                        print(f"[engine] reusing dense instance pid {pids[-1]} "
                              f"(v{stats['system']['comfyui_version']})", flush=True)
                        ENGINE_PID["v"] = pids[-1]
                        return pids[-1]
        # a standing instance WITHOUT the dense routing: clean stop, relaunch
        # with the flag (the setK pattern; kill by the pgrep'd PID, never pkill)
        q = subprocess.run(["pgrep", "-f", "main.py --port 8189"], capture_output=True, text=True)
        pids = [int(p) for p in q.stdout.split()]
        print(f"[engine] standing instance v{stats['system']['comfyui_version']} lacks the dense "
              f"boot line -> clean stop of pid(s) {pids}, relaunch dense", flush=True)
        try:
            _post("/free", {"unload_models": True, "free_memory": True}, timeout=60)
        except Exception as ex:
            print(f"[engine] /free on standing: {ex}", flush=True)
        for sp in pids:
            sigint_pid(sp, "standing")
    except SystemExit:
        raise
    except Exception:
        pass
    mem, util = gpu_state()
    print(f"[engine] pre-launch GPU: {mem} MiB, {util}%", flush=True)
    env = dict(os.environ)
    logfile = open(LOG, "w")
    proc = subprocess.Popen(
        ["/home/agent/comfyui/.venv/bin/python", "main.py",
         "--port", "8189", "--listen", "127.0.0.1"] + FLAGS,
        cwd="/home/agent/comfyui", stdout=logfile, stderr=subprocess.STDOUT, env=env)
    pid = proc.pid
    print(f"[engine] launched PID {pid} flags={FLAGS}", flush=True)
    t0 = time.time()
    while time.time() - t0 < 300:
        try:
            stats = _get("/system_stats", timeout=5)
            print(f"[engine] UP in {time.time()-t0:.0f}s - ComfyUI "
                  f"{stats['system']['comfyui_version']}", flush=True)
            break
        except Exception:
            if proc.poll() is not None:
                raise SystemExit(f"[engine] died at boot (exit {proc.returncode}) - see {LOG}")
            time.sleep(3)
    else:
        raise SystemExit("[engine] health timeout")
    with open(LOG) as fh:
        boot = fh.read()
    if BOOT_LINE not in boot:
        raise SystemExit(f"[engine] boot line missing ('{BOOT_LINE}') - refusing to run")
    print("[engine] boot line PRESENT", flush=True)
    ENGINE_PID["v"] = pid
    return pid


def engine_teardown(pid, baseline_mib):
    try:
        _post("/free", {"unload_models": True, "free_memory": True}, timeout=60)
    except Exception as ex:
        print(f"[engine] /free at teardown: {ex}", flush=True)
    sigint_pid(pid, "teardown")
    time.sleep(3)
    mem, util = gpu_state()
    print(f"[engine] DOWN; VRAM {mem} MiB, util {util}% (pre-launch baseline {baseline_mib} MiB)", flush=True)
    limit = max(1000, baseline_mib + 200)
    if mem > limit:
        raise SystemExit(f"[engine] teardown verification FAILED: {mem} MiB > {limit}")
    print("[engine] teardown verified to baseline", flush=True)


def engine_restart_after_oom(pid):
    print("[engine] OOM recovery: restart before next measurement (runbook)", flush=True)
    sigint_pid(pid, "oom")
    time.sleep(5)
    return engine_relaunch()


# ------------------------------------------------------------------- the runner
def read_log_slice(start, end):
    with open(LOG, "rb") as fh:
        fh.seek(start)
        return fh.read(max(0, end - start)).decode("utf-8", errors="replace")


BAR_RE = re.compile(r"(\d+)%\|[^|]*\|\s*(\d+)/(\d+) \[(\d+):([\d.]+)<")


def sampler_bars(log_slice):
    """Parse tqdm sampler bars (lines carry whole bar histories separated by
    \\r). Returns one record per bar: total steps, sampler-only elapsed at
    the last observed step, s/step."""
    text = log_slice.replace("\r", "\n")
    bars, cur = [], None
    for m in BAR_RE.finditer(text):
        pct, step, total = int(m.group(1)), int(m.group(2)), int(m.group(3))
        el = int(m.group(4)) * 60 + float(m.group(5))
        if cur is None:
            cur = {"step": step, "total": total, "elapsed": el}
        elif total != cur["total"] or step < cur["step"]:
            bars.append(cur)
            cur = {"step": step, "total": total, "elapsed": el}
        else:
            cur.update(step=step, elapsed=el)
    if cur:
        bars.append(cur)
    return [{"total": b["total"], "last_step": b["step"],
             "sampler_elapsed_s": round(b["elapsed"], 1),
             "s_per_step": round(b["elapsed"] / max(b["step"], 1), 2)} for b in bars]


PROMPT_EXEC_RE = re.compile(r"Prompt executed in (\d+):(\d+):(\d+)")


def prompt_exec_s(log_slice):
    vals = []
    for m in PROMPT_EXEC_RE.finditer(log_slice):
        vals.append(int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3)))
    return vals


def framemd5(path):
    r = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-map", "0:v",
                        "-f", "framemd5", "-"], capture_output=True, text=True)
    return [ln.split(",")[-1].strip() for ln in r.stdout.splitlines()
            if ln and not ln.startswith("#") and "," in ln]


def audio_md5(path):
    r = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-map", "0:a",
                        "-f", "md5", "-"], capture_output=True, text=True)
    return r.stdout.strip().replace("MD5=", "")


def md5_of_list(md5_list):
    return hashlib.md5("|".join(md5_list).encode()).hexdigest()


def nframes(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-count_frames", "-show_entries", "stream=nb_read_frames",
                        "-of", "csv=p=0", path], capture_output=True, text=True)
    return int(r.stdout.strip())


def extract_last_frame(path, png_out):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-sseof", "-0.05", "-i", path,
                    "-frames:v", "1", "-update", "1", png_out], check=True)
    assert os.path.exists(png_out) and os.path.getsize(png_out) > 1000, f"extract failed: {png_out}"
    return png_out


def dE_mean(path_a, path_b):
    """CIE76 dE between two images (engine-venv cv2; the G-KEYC floor)."""
    import cv2
    import numpy as np
    a = cv2.cvtColor(cv2.imread(path_a), cv2.COLOR_BGR2LAB).astype(np.float32)
    b = cv2.cvtColor(cv2.imread(path_b), cv2.COLOR_BGR2LAB).astype(np.float32)
    h = min(a.shape[0], b.shape[0]); w = min(a.shape[1], b.shape[1])
    a, b = a[:h, :w], b[:h, :w]
    return round(float(np.mean(np.linalg.norm(a - b, axis=2))), 3)


def submit(graph, tag, cap_s):
    contention_guard(tag)
    log_start = os.path.getsize(LOG)
    vram_before, _ = gpu_state()
    peak = {"v": vram_before, "done": False}

    def poll_vram():
        while not peak["done"]:
            try:
                m, _ = gpu_state()
                peak["v"] = max(peak["v"], m)
            except Exception:
                pass
            time.sleep(1.0)

    th = threading.Thread(target=poll_vram, daemon=True)
    th.start()
    t0 = time.time()
    r = _post("/prompt", {"prompt": graph, "client_id": CLIENT}, timeout=300)
    if "prompt_id" not in r:
        peak["done"] = True
        raise RuntimeError(f"submit rejected: {r}")
    pid = r["prompt_id"]
    print(f"[{tag}] submitted prompt_id={pid}", flush=True)
    oom = False
    while True:
        time.sleep(3)
        try:
            h = _get(f"/history/{pid}")
        except Exception as ex:
            print(f"[{tag}] history poll: {ex}", flush=True)
            h = {}
        if pid in h:
            status = h[pid].get("status", {})
            if status.get("completed") or status.get("status_str") == "success":
                break
            if status.get("status_str") in ("error", "failed"):
                peak["done"] = True
                print(json.dumps(h[pid], indent=1)[:3000])
                slice_ = read_log_slice(log_start, os.path.getsize(LOG))
                oom = "out of memory" in slice_.lower() or "OOM" in slice_
                raise RuntimeError(f"{tag} FAILED (engine error{' - OOM' if oom else ''})")
        elapsed = time.time() - t0
        print(f"\r[{tag}] {elapsed:6.1f}s peak={peak['v']} MiB   ", end="", flush=True)
        if elapsed > cap_s:
            peak["done"] = True
            raise RuntimeError(f"{tag}: runaway cap exceeded - stopping")
    peak["done"] = True
    th.join(timeout=5)
    wall = time.time() - t0
    slice_ = read_log_slice(log_start, os.path.getsize(LOG))
    outputs = h[pid].get("outputs", {})
    files = []
    for node_out in outputs.values():
        for key in ("videos", "images"):
            for f in node_out.get(key, []) or []:
                if f.get("filename", "").endswith(".mp4"):
                    files.append({"filename": f["filename"], "subfolder": f.get("subfolder", "")})
    print(f"\n[{tag}] DONE wall={wall:.1f}s peak={peak['v']} MiB files={[f['filename'] for f in files]}",
          flush=True)
    return {"wall_s": round(wall, 1), "vram_peak_mib": peak["v"], "files": files,
            "log_slice": slice_, "sampler_bars": sampler_bars(slice_),
            "prompt_exec_s": prompt_exec_s(slice_)}


def lora_guard(log_slice, run_id):
    hits = [ln.strip() for ln in log_slice.splitlines()
            if "not loaded" in ln.lower() and "lora" in ln.lower()]
    if hits:
        with open(os.path.join(OUTD, "setL_lora_stop.json"), "w") as fh:
            json.dump({"run_id": run_id, "hits": hits[:40]}, fh, indent=1)
        raise SystemExit(f"LORA ACTIVITY STOP at {run_id}: {len(hits)} lora keys not loaded - "
                         "silent partial application (the Set P trap); see setL_lora_stop.json")


def vfile(f):
    return os.path.join(ENGINE_OUT, f["subfolder"], f["filename"])


def run_one(run, manifest):
    rid = run["run_id"]
    done = {m["run_id"]: m for m in manifest["runs"]}
    if rid in done and done[rid].get("ok"):
        print(f"[setL_1] {rid} already done - skip", flush=True)
        return done[rid]
    rec = {"run_id": rid, "arm": run["arm"], "tags": run.get("tags", []),
           "graph_note": run.get("note", "")}
    try:
        res = submit(run["graph"], rid, cap_s=run.get("cap", RUNAWAY[22]))
        lora_guard(res["log_slice"], rid)
        rec.update(wall_s=res["wall_s"], vram_peak_mib=res["vram_peak_mib"],
                   sampler_bars=res["sampler_bars"], prompt_exec_s=res["prompt_exec_s"],
                   files=sorted(res["files"], key=lambda f: f["filename"]))
        fcounts = {}
        for f in rec["files"]:
            p = vfile(f)
            fcounts[f["filename"]] = {"frames": nframes(p), "bytes": os.path.getsize(p)}
        rec["artifacts"] = fcounts
        expect = run.get("expect_frames")
        if expect is not None:
            got = [fcounts[f["filename"]]["frames"] for f in rec["files"]]
            if got != expect:
                raise RuntimeError(f"{rid}: frame counts {got} != designed {expect} "
                                   "(the silent off-grid clamp trap)")
        p0 = vfile(rec["files"][0])
        fm = framemd5(p0)
        rec.update(framemd5_n=len(fm), video_md5_full=md5_of_list(fm),
                   audio_md5=audio_md5(p0), ok=True)
        for extra in run.get("post", []):
            extra(rec)
    except RuntimeError as ex:
        rec.update(ok=False, error=str(ex)[:500])
        print(f"[setL_1] {rid} FAILED: {ex}", flush=True)
    manifest["runs"].append(rec)
    with open(MPATH, "w") as fh:
        json.dump(manifest, fh, indent=1)
    free_phase(rid)
    return rec


def bit_identical(a, b):
    return a.get("video_md5_full") == b.get("video_md5_full") and a.get("audio_md5") == b.get("audio_md5")


def gate(name, rec_a, rec_b):
    same = bit_identical(rec_a, rec_b)
    print(f"[GATE {name}] {'PASS' if same else 'FAIL'} "
          f"(video {'==' if rec_a.get('video_md5_full') == rec_b.get('video_md5_full') else '!='}, "
          f"audio {'==' if rec_a.get('audio_md5') == rec_b.get('audio_md5') else '!='})", flush=True)
    with open(os.path.join(OUTD, "setL_gates.json"), "a") as fh:
        fh.write(json.dumps({"gate": name, "ok": bool(same), "t": time.strftime("%H:%M:%S")}) + "\n")
    if not same:
        raise SystemExit(f"GATE {name} FAILED - stopping for review")
    return same


# ------------------------------------------------------------------ the program
def load_manifest():
    if os.path.exists(MPATH):
        return json.load(open(MPATH))
    return {"config": {
        "set": "L - the four-arm continuation comparison",
        "seeds": L.SEEDS, "flags": FLAGS,
        "operating_point": "the Set-K point: ref2va pruned int8, tween/hero LoRA @1.0, "
                           "euler/simple 30 steps, BasicGuider no CFG, shift 12/3, 1344x768",
        "delivered": "66f @ 24fps matched across arms",
        "windows": {"tween": "3x22f chained on promoted near refs",
                    "single": "1x73f trimmed to 66f",
                    "setk": "3x22f latent chain, sigma_s=0.6316, 30 NFE/beat (setK verbatim)",
                    "mctx": "39f fresh + 56f Motion-Context-conditioned (22f tail, "
                            "head trimmed -> 34f new), 73f -> 66f"},
    }, "runs": []}


def ok_rec(manifest, rid):
    recs = [m for m in manifest["runs"] if m["run_id"] == rid and m.get("ok")]
    return recs[0] if recs else None


def last_rec(manifest, rid):
    recs = [m for m in manifest["runs"] if m["run_id"] == rid]
    return recs[-1] if recs else None


def needs_oom_restart(rec):
    return rec is not None and not rec.get("ok") and "OOM" in rec.get("error", "")


def wait_for_card(tag, max_wait_s=7200):
    """The runbook's priority rule, pre-launch form: the engine's own CUDA
    context needs headroom, so the card must clear before 8189 boots. The
    maintainer's runs win - poll (up to 2 h), then report back."""
    t0 = time.time()
    while time.time() - t0 < max_wait_s:
        mem, util = gpu_state()
        mbusy = maintainer_busy()
        if mem < 2000 and util < 30 and not mbusy:
            print(f"[card:{tag}] clear ({mem} MiB, {util}%)", flush=True)
            return
        if int(time.time() - t0) % 60 < 31:
            print(f"[card:{tag}] waiting - VRAM {mem} MiB, util {util}%, "
                  f"8188={'busy' if mbusy else 'clear'}", flush=True)
        time.sleep(30)
    raise SystemExit(f"[card:{tag}] the card never cleared in {max_wait_s/3600:.0f} h - "
                     "the maintainer's workload holds it; report back instead of forcing")


def main():
    manifest = load_manifest()
    done = {m["run_id"]: m for m in manifest["runs"]}

    wait_for_card("pre-launch")
    pid = engine_relaunch()
    baseline_mib, _ = gpu_state()
    with open(os.path.join(OUTD, "setL_engine.json"), "w") as fh:
        json.dump({"pid": pid, "flags": FLAGS, "log": LOG, "baseline_mib": baseline_mib}, fh)
    t_gpu0 = time.time()

    def A(name):
        return os.path.join(INPUT, name)

    try:
        # --- the C key author (shared far ref for every arm; counted once)
        if not (done.get("hero", {}).get("ok")):
            gh = L.g_r2v(C.HERO, L.LORA_HERO, L.REF_A, None, "setL/hero_gen", seed=L.SEEDS[0])

            def post_hero(rec):
                v = vfile(rec["files"][0])
                extract_last_frame(v, A("C_key.png"))
                de = dE_mean("/home/agent/comfyui/input/setK/A_land.png", A("C_key.png"))
                rec["C_key_dE_to_A"] = de
                print(f"[hero] C extracted; dE(C,A_land)={de}", flush=True)
                if de < KEYC_DE_FLOOR:
                    raise RuntimeError(f"G-KEYC: the extracted C key is too close to A "
                                       f"(dE {de} < {KEYC_DE_FLOOR}) - the far key looks broken; "
                                       "stopping before the burn")

            run_one({"run_id": "hero", "arm": "key author - hero adapter from A_land (the arc-end key C)",
                     "tags": ["hero"], "graph": gh, "expect_frames": [22],
                     "post": [post_hero]}, manifest)
            done = {m["run_id"]: m for m in manifest["runs"]}
        assert ok_rec(manifest, "hero"), "hero missing/failed - cannot condition the arms"

        for si, seed in enumerate(L.SEEDS, 1):
            near_extract = lambda k: (lambda rec: extract_last_frame(
                vfile(rec["files"][0]), A(f"tw_s{seed}_w{k}_last.png")))

            # --- arm 1: the tween chain (w1 fresh; w2/w3 promoted near refs)
            for k in range(1, 4):
                rid = f"tween_s{seed}_w{k}"
                if not (done.get(rid, {}).get("ok")):
                    near = L.REF_A if k == 1 else f"setL/tw_s{seed}_w{k-1}_last.png"
                    g = L.g_r2v(C.TWEEN[k], L.LORA_TWEEN, near, "setL/C_key.png",
                                f"setL/{rid}", seed=seed)
                    posts = [near_extract(k)] if k < 3 else []
                    run_one({"run_id": rid, "arm": f"arm1 tween window {k}/3 seed {seed} "
                             f"(near {'A_land' if k == 1 else 'promoted'}, far C fixed)",
                             "tags": ["tween"], "graph": g, "expect_frames": [22],
                             "post": posts}, manifest)
                    done = {m["run_id"]: m for m in manifest["runs"]}
            r_tw1 = ok_rec(manifest, f"tween_s{seed}_w1")

            # --- the null + beat-1 gates ride seed 1 (the setK pattern)
            if si == 1:
                if not (done.get("nullL", {}).get("ok")):
                    gn = L.g_r2v(C.TWEEN[1], L.LORA_TWEEN, L.REF_A, "setL/C_key.png",
                                 "setL/nullL", seed=seed, vae_name=L.ALIASES["null"])
                    run_one({"run_id": "nullL", "arm": "NULL - tween w1 s1 through __setLnull",
                             "tags": ["null"], "graph": gn, "expect_frames": [22]}, manifest)
                    done = {m["run_id"]: m for m in manifest["runs"]}
                gate("G-NULL", ok_rec(manifest, "nullL"), r_tw1)

            # --- arm 3: the setk latent chain (3 beats, ONE graph)
            rid = f"setk_s{seed}"
            if not (done.get(rid, {}).get("ok")):
                gl = L.g_latent_chain([C.TWEEN[k] for k in (1, 2, 3)],
                                      f"setL/setk_s{seed}_b{{k}}", seed=seed)
                run_one({"run_id": rid, "arm": f"arm3 setk latent chain seed {seed} "
                         "(3 beats, refs fixed, terminal-zero re-noise sigma_s=0.6316)",
                         "tags": ["setk"], "graph": gl, "cap": RUNAWAY_CHAIN,
                         "expect_frames": [22, 22, 22],
                         "note": "one prompt, three chained SCAs; files sorted by name = beats 1..3"},
                        manifest)
                if needs_oom_restart(last_rec(manifest, rid)):
                    pid = engine_restart_after_oom(pid)
                done = {m["run_id"]: m for m in manifest["runs"]}
            if si == 1:
                rl = ok_rec(manifest, rid)
                if rl:
                    gate("G-BEAT1", rl, r_tw1)

            # --- arm 2: the single 73f window
            rid = f"single_s{seed}"
            if not (done.get(rid, {}).get("ok")):
                gs = L.g_r2v(C.SINGLE, L.LORA_TWEEN, L.REF_A, "setL/C_key.png",
                             f"setL/{rid}", seed=seed, f=L.F_SINGLE)
                run_one({"run_id": rid, "arm": f"arm2 single window seed {seed} "
                         "(73f, delivered-trimmed to 66f)",
                         "tags": ["single"], "graph": gs, "cap": RUNAWAY[73],
                         "expect_frames": [73]}, manifest)
                if needs_oom_restart(last_rec(manifest, rid)):
                    pid = engine_restart_after_oom(pid)
                done = {m["run_id"]: m for m in manifest["runs"]}

            # --- arm 4: the mctx chain (39f fresh + 56f conditioned, ONE graph)
            rid = f"mctx_s{seed}"
            if not (done.get(rid, {}).get("ok")):
                gm = L.g_mctx_chain(C.MCTX_W1, C.MCTX_W2, f"setL/mctx_s{seed}_w1",
                                    f"setL/mctx_s{seed}_w2", seed=seed)
                run_one({"run_id": rid, "arm": f"arm4 mctx chain seed {seed} "
                         "(39f fresh + 56f Motion-Context window, 22f tail pinned, "
                         "head trimmed -> 34f new)",
                         "tags": ["mctx"], "graph": gm, "cap": RUNAWAY_CHAIN,
                         "expect_frames": [39, 34],
                         "note": "files sorted by name = w1 (39f) then w2 (34f, trimmed); "
                                 "expect_frames lists that order"},
                        manifest)
                if needs_oom_restart(last_rec(manifest, rid)):
                    pid = engine_restart_after_oom(pid)
                done = {m["run_id"]: m for m in manifest["runs"]}

            # --- canaries (mid after s1, end after s3; Amendment 5)
            if si == 1:
                if not (done.get("can2", {}).get("ok")):
                    gc = L.g_r2v(C.TWEEN[1], L.LORA_TWEEN, L.REF_A, "setL/C_key.png",
                                 "setL/can2", seed=L.SEEDS[0], vae_name=L.ALIASES["can2"])
                    run_one({"run_id": "can2", "arm": "CANARY mid - tween w1 s1 via __setLcan2",
                             "tags": ["canary"], "graph": gc, "expect_frames": [22]}, manifest)
                    done = {m["run_id"]: m for m in manifest["runs"]}
                gate("G-CAN2", ok_rec(manifest, "can2"), ok_rec(manifest, "tween_s421337_w1"))
            if si == 3:
                if not (done.get("can3", {}).get("ok")):
                    gc = L.g_r2v(C.TWEEN[1], L.LORA_TWEEN, L.REF_A, "setL/C_key.png",
                                 "setL/can3", seed=L.SEEDS[0], vae_name=L.ALIASES["can3"])
                    run_one({"run_id": "can3", "arm": "CANARY end - tween w1 s1 via __setLcan3",
                             "tags": ["canary"], "graph": gc, "expect_frames": [22]}, manifest)
                    done = {m["run_id"]: m for m in manifest["runs"]}
                gate("G-CAN3", ok_rec(manifest, "can3"), ok_rec(manifest, "tween_s421337_w1"))
    finally:
        import sys as _sys, traceback as _tb
        _exc = _sys.exc_info()[1]
        if _exc is not None:
            print(f"[setL_1] IN-FLIGHT EXCEPTION (recorded before teardown): "
                  f"{type(_exc).__name__}: {_exc}", flush=True)
            _tb.print_exc()
        gpu_min = (time.time() - t_gpu0) / 60.0
        print(f"[setL_1] program complete - {gpu_min:.1f} min wall this invocation", flush=True)
        engine_teardown(pid, baseline_mib)
        manifest["gpu_min_this_invocation"] = round(gpu_min, 1)
        with open(MPATH, "w") as fh:
            json.dump(manifest, fh, indent=1)
    print("[setL_1] DONE - all gates + teardown recorded", flush=True)


if __name__ == "__main__":
    main()
