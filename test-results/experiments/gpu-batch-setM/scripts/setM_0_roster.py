"""setM_0 — Set M roster: pre-build + OFFLINE-validate every graph SHAPE
before any GPU burns. Run with the ENGINE VENV python:

  cd /home/agent/comfyui && ./.venv/bin/python \\
      "/home/agent/work/VS Proj/MINIMAX-DESKTOP/test-results/experiments/\\
gpu-batch-setM/scripts/setM_0_roster.py"

Gates at build time:
  - captions: the setM_captions lint (byte-uniform driving blocks, no
    negation/comparative, both pictures named in every edit instruction)
  - sigmas: the Viggle 4-point list parses to 4 monotone points ending at
    0.0 (3 Euler updates), asserted numerically; the driving chain's
    latent-continuation slice re-asserted on the engine's own scheduler
    code (30 steps from sigma_s ~0.6316, the setK recipe)
  - viggle frame math: _generation_frame_count(66) == 73 asserted on the
    INSTALLED PACK'S OWN function (imported from custom_nodes)
  - loras: tween + DMD r64 present, header stats recorded (qkv format,
    the zero-key silent no-op trap); the runtime G-LORA is the hard gate
  - models: every referenced file present in its model root
  - assembly: the V1-API dotted-key gate for every R2V cond node (the Set
    K harness finding)
  - validate_prompt on representative graphs of all five shapes (drive
    chain, B t2i, ref edit, viggle, viggle-null through the alias)

A placeholder 66f white clip is staged at input/setM_drive.mp4 so the
LoadVideo combo validates; the controller overwrites it with the real
driving render before any Viggle arm runs.
"""
import asyncio
import json
import os
import subprocess
import sys

sys.path.insert(0, "/home/agent/comfyui")
os.chdir("/home/agent/comfyui")

# CPU-only validation (the setL_0 pattern): no CUDA context, the pack code
# and prompt validation need no device.
import torch  # noqa: E402
torch.cuda.is_available = lambda: False

import utils.extra_config  # noqa: E402
utils.extra_config.load_extra_path_config("/home/agent/comfyui/extra_model_paths.yaml")
import nodes  # noqa: E402
import execution  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
OUT = os.path.abspath(os.path.join(HERE, "..", "out"))
GRAPH_DIR = os.path.join(OUT, "graphs")
os.makedirs(GRAPH_DIR, exist_ok=True)

import setM_lib as M  # noqa: E402
import setM_captions as C  # noqa: E402

PLACEHOLDER = "/home/agent/comfyui/input/setM_drive.mp4"


def _load_packs():
    import_failed = asyncio.run(nodes.init_extra_nodes())
    for m in import_failed:
        print(f"[setM_0] WARN custom node import failed: {m}")
    return import_failed


IMPORT_FAILED = _load_packs()


# ------------------------------------------------------------- gate: sigmas
def sigma_gate():
    import comfy.model_sampling as ms
    from comfy import samplers as S

    pts = [float(x) for x in M.SIGMAS_4PT.split(",")]
    four_ok = (len(pts) == 4 and abs(pts[0] - 1.0) < 1e-9 and pts[-1] == 0.0
               and all(pts[i] > pts[i + 1] for i in range(3)))

    class MSA(ms.ModelSamplingAV, ms.CONST):
        pass

    m = MSA(None)
    m.set_parameters(shift=M.SHIFT_V, audio_shift=M.SHIFT_A)
    total = int(M.LAT_STEPS / M.LAT_DENOISE)
    lat = S.calculate_sigmas(m, "simple", total).tolist()
    sliced = lat[-(M.LAT_STEPS + 1):]
    drive_ok = len(sliced) - 1 == M.LAT_STEPS and 0.60 <= sliced[0] <= 0.66
    res = {"viggle_4pt": [round(v, 6) for v in pts], "four_point_pass": four_ok,
           "latent_slice": {"steps": len(sliced) - 1, "sigma_first": round(sliced[0], 4)},
           "drive_slice_pass": drive_ok,
           "pass": four_ok and drive_ok}
    print(f"[setM_0] sigma gate: viggle 4pt pass={four_ok}; drive slice n={res['latent_slice']['steps']} "
          f"sigma_s={res['latent_slice']['sigma_first']} -> {'PASS' if res['pass'] else 'FAIL'}")
    return res


# ---------------------------------------------------- gate: viggle frame math
def viggle_frame_gate():
    """66f input -> 73f generated, asserted on the installed pack's own
    _generation_frame_count (loaded as a private package, the setL_0 pattern)."""
    import importlib.util
    spec_dir = "/home/agent/comfyui/custom_nodes/ComfyUI-Viggle-Animate-H3"
    pkg_spec = importlib.util.spec_from_file_location(
        "setM_viggle_pkg", os.path.join(spec_dir, "__init__.py"),
        submodule_search_locations=[spec_dir])
    pkg = importlib.util.module_from_spec(pkg_spec)
    sys.modules["setM_viggle_pkg"] = pkg
    pkg_spec.loader.exec_module(pkg)
    mod_spec = importlib.util.spec_from_file_location(
        "setM_viggle_pkg.nodes", os.path.join(spec_dir, "nodes.py"))
    mod = importlib.util.module_from_spec(mod_spec)
    sys.modules["setM_viggle_pkg.nodes"] = mod
    mod_spec.loader.exec_module(mod)

    gen66 = mod._generation_frame_count(M.F_DELIVER)
    res = {"input_frames": M.F_DELIVER, "generated": gen66,
           "grid_17k5": (gen66 - 5) % 17 == 0,
           "beat_windows_17k5": all((f - 5) % 17 == 0 for f in (M.F_WIN,)),
           "pass": gen66 == M.F_EXPECT_VIGGLE and (gen66 - 5) % 17 == 0}
    print(f"[setM_0] viggle frame gate: {M.F_DELIVER}f in -> {gen66}f generated "
          f"-> {'PASS' if res['pass'] else 'FAIL'}")
    return res


# ------------------------------------------------------------- gate: LoRA files
def lora_gate():
    from safetensors import safe_open
    res = {}
    for name, path in ((M.LORA_TWEEN, os.path.join("/home/agent/models/loras", M.LORA_TWEEN)),
                       (M.LORA_DMD_R64, os.path.join("/home/agent/models/loras", M.LORA_DMD_R64))):
        ok = os.path.exists(path)
        keys = []
        if ok:
            with safe_open(path, framework="pt") as f:
                keys = list(f.keys())
        n_qkv = sum(1 for k in keys if "qkv_proj" in k)
        n_sep = sum(1 for k in keys if ".to_q" in k or ".to_k" in k or ".to_v" in k)
        res[name] = {"present": ok, "tensors": len(keys), "qkv_keys": n_qkv,
                     "separate_qkv_keys": n_sep,
                     "pass": ok and len(keys) > 0 and n_sep == 0}
        print(f"[setM_0] lora {name}: {'PASS' if res[name]['pass'] else 'FAIL'} "
              f"({len(keys)} tensors, {n_qkv} qkv, {n_sep} separate-qkv)")
    return res


# ------------------------------------------------------------ gate: models
def model_gate():
    import folder_paths
    checks = {
        "unet_ref2va": ("diffusion_models", M.UNET_REF2VA),
        "unet_fl2va": ("diffusion_models", M.UNET_FL2VA),
        "unet_viggle": ("diffusion_models", M.UNET_VIGGLE),
        "lora_tween": ("loras", M.LORA_TWEEN),
        "lora_dmd_r64": ("loras", M.LORA_DMD_R64),
        "text_cond": ("text_cond", M.TEXT_COND),
        "te": ("text_encoders", M.TE),
        "vae_v": ("vae", M.VAE_V),
        "vae_a": ("vae", M.VAE_A),
    }
    res = {}
    for k, (folder, fname) in checks.items():
        try:
            res[k] = folder_paths.get_full_path(folder, fname) is not None
        except Exception:
            res[k] = False
    res["ref_A"] = os.path.exists(os.path.join("/home/agent/comfyui/input", M.REF_A))
    res["ref_C"] = os.path.exists(os.path.join("/home/agent/comfyui/input", M.REF_C))
    res["pass"] = all(res.values())
    print(f"[setM_0] model gate: {'PASS' if res['pass'] else 'FAIL'} "
          f"(missing: {[k for k, v in res.items() if v is False and k != 'pass']})")
    return res


# ------------------------------------------------------------------- the shapes
def stage_placeholder():
    """A 66f white 1344x768 clip + placeholder PNGs for every not-yet-authored
    image, so LoadVideo/LoadImage combos validate; the controller overwrites
    each with the real artifact before the corresponding phase runs."""
    made = False
    if os.path.exists(PLACEHOLDER):
        n = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                            "-count_frames", "-show_entries", "stream=nb_read_frames",
                            "-of", "csv=p=0", PLACEHOLDER], capture_output=True, text=True)
        if not (n.stdout.strip().isdigit() and int(n.stdout.strip()) == M.F_DELIVER):
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error",
                            "-f", "lavfi", "-i", f"color=c=white:s={M.W}x{M.H}:r=24",
                            "-frames:v", str(M.F_DELIVER), "-c:v", "libx264", "-pix_fmt", "yuv420p",
                            PLACEHOLDER], check=True)
            made = True
    else:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error",
                        "-f", "lavfi", "-i", f"color=c=white:s={M.W}x{M.H}:r=24",
                        "-frames:v", str(M.F_DELIVER), "-c:v", "libx264", "-pix_fmt", "yuv420p",
                        PLACEHOLDER], check=True)
        made = True
    os.makedirs(M.INPUT_DIR, exist_ok=True)
    for name, (w, h) in (("frame0.png", (M.W, M.H)), ("B_ref.png", (M.BW, M.BH)),
                         ("rep_control.png", (M.W, M.H)), ("rep_face.png", (M.W, M.H)),
                         ("rep_outfit.png", (M.W, M.H)), ("B_sheet.png", (3 * M.BW, M.BH))):
        p = os.path.join(M.INPUT_DIR, name)
        if not os.path.exists(p):
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error",
                            "-f", "lavfi", "-i", f"color=c=white:s={w}x{h}",
                            "-frames:v", "1", p], check=True)
            made = True
    return made


def build_roster():
    R = {}
    R["drive_chain"] = M.g_drive_chain([C.DRIVE[k] for k in (1, 2, 3)],
                                       "setM/drive_b{k}", seed=M.DRIVE_SEED)
    R["b_t2i"] = M.g_t2i(C.B_T2I, prefix="setM/b_t2i", seed=421337)
    R["ref_edit"] = M.g_ref_edit(C.REP_FACE, "setM/frame0.png", "setM/B_ref.png",
                                 prefix="setM/_shape_edit", seed=421337)
    R["viggle"] = M.g_viggle("setM/rep_face.png", M.SEEDS[0], "setM/_shape_viggle")
    R["viggle_null"] = M.g_viggle("setM/rep_control.png", M.SEEDS[0], "setM/_shape_null",
                                  vae_name=M.ALIASES["null"])
    return R


async def assembly_gate(roster):
    """The V1-API dotted-key gate for every R2V cond node (the Set K finding)."""
    import comfy_api.latest._io as _io
    from nodes import NODE_CLASS_MAPPINGS
    res = {}
    for name, graph in roster.items():
        for nid, node in graph.items():
            ct = node["class_type"]
            if ct != "MiniMaxH3ReferenceToVideo":
                continue
            live = {k: (v if not isinstance(v, list) or len(v) != 2 or not isinstance(v[0], str) else v)
                    for k, v in node["inputs"].items()}
            cls = NODE_CLASS_MAPPINGS[ct]
            _, _, v3 = _io.get_finalized_class_inputs(cls.INPUT_TYPES(), live)
            out = _io.build_nested_inputs({k: [v] for k, v in live.items()}, v3)
            refs = out.get("ref_images", {})
            n_live = sum(1 for k in live if k.startswith("ref_images."))
            ok = isinstance(refs, dict) and len(refs) == n_live and n_live > 0
            res[f"{name}:{nid}"] = {"refs_assembled": sorted(refs) if isinstance(refs, dict) else refs,
                                    "pass": ok}
            print(f"[setM_0] assembly {name}:{nid} -> {'PASS' if ok else 'FAIL'}")
    return res


async def validate_all(roster):
    results = {}
    for name, graph in roster.items():
        with open(os.path.join(GRAPH_DIR, f"{name}.json"), "w") as fh:
            json.dump(graph, fh, indent=1)
        try:
            valid, err, good_outputs, node_errors = await execution.validate_prompt(
                f"setM-{name}", graph, None)
        except Exception as ex:
            valid, err, node_errors = False, {"type": "exception", "message": repr(ex)}, {"_": repr(ex)}
        results[name] = {"valid": bool(valid), "error": err,
                         "node_errors": {k: v for k, v in (node_errors or {}).items()}}
        print(f"[setM_0] {'OK  ' if valid else 'FAIL'} {name}"
              + ("" if valid else f"  err={json.dumps(err)[:300]} node={json.dumps(node_errors)[:300]}"))
    return results


def main():
    made = M.ensure_aliases()
    if made:
        print(f"[setM_0] created cache-bust aliases: {made}")
    staged = stage_placeholder()
    print(f"[setM_0] placeholder driving clip {'staged' if staged else 'already correct'} at {PLACEHOLDER}")
    from nodes import NODE_CLASS_MAPPINGS
    viggle_registered = all(n in NODE_CLASS_MAPPINGS for n in
                            ("ViggleTextCondLoader", "ViggleAnimateConditioning"))
    studio_registered = all(n in NODE_CLASS_MAPPINGS for n in
                            ("H3TextToImagePrepare", "H3ReferenceEditPrepare", "H3ImageDecode"))
    gates = {
        "sigmas": sigma_gate(),
        "viggle_frames": viggle_frame_gate(),
        "loras": lora_gate(),
        "models": model_gate(),
        "captions": C.lint(),
    }
    roster = build_roster()
    gates["assembly"] = asyncio.run(assembly_gate(roster))
    val = asyncio.run(validate_all(roster))
    summary = {
        "set": "M - the Viggle-Animate swap battery (control / face / outfit / sheet)",
        "question": "how well does local Viggle-Animate hold identity and outfit across "
                    "face/outfit swaps painted into a single frame - and where does it drift",
        "operating_point": {
            "driving": "the Set-K point (ref2va pruned int8 + tween LoRA @1.0, euler/simple 30, "
                       "shift 12/3, 1344x768) on the setk terminal-zero latent chain "
                       "(sigma_s=0.6316, 30 NFE/beat), seed 421337",
            "image_lane": "hybrid b25-49 (fl2va+ref2va pruned int8), packet pins "
                          "(res_multistep/simple 20, unshifted), video VAE fp16, 13-frame tier, "
                          "settled tail picked by Laplacian offline",
            "viggle": "the pack's documented defaults: pruned int8 + DMD r64 @1.0, shift 3/3, "
                      "the upstream 4-point sigma list (3 Euler updates), euler, BasicGuider, "
                      f"canvas from the driving clip ({M.W}x{M.H}, 1.03 MP)",
            "seeds": M.SEEDS,
            "delivered_frames": M.F_DELIVER,
            "premise_correction": "setK/B_key.png is the SAME elf-girl (pose-B key); character B "
                                  "is AUTHORED via the H3 image lane (in-family, palette-gated)",
        },
        "engine": {"viggle_pack_registered": viggle_registered,
                   "studio_pack_registered": studio_registered,
                   "import_failed": IMPORT_FAILED},
        "gates": gates,
        "validation": {k: v["valid"] for k, v in val.items()},
        "aliases": M.ALIASES,
    }
    all_ok = (gates["sigmas"]["pass"] and gates["viggle_frames"]["pass"]
              and gates["models"]["pass"] and gates["captions"]["pass"]
              and all(v["pass"] for v in gates["loras"].values())
              and all(v["pass"] for v in gates["assembly"].values())
              and all(v["valid"] for v in val.values())
              and viggle_registered and studio_registered)
    summary["ALL_GATES"] = bool(all_ok)
    with open(os.path.join(OUT, "setM_0_roster.json"), "w") as fh:
        json.dump(summary, fh, indent=1)
    print(f"[setM_0] ALL GATES: {'PASS' if all_ok else 'FAIL'}")


if __name__ == "__main__":
    main()
