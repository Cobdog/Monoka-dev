"""setL_0 — Set L roster: pre-build + OFFLINE-validate every graph SHAPE
before any GPU burns. Run with the ENGINE VENV python (torch/comfy needed):

  cd /home/agent/comfyui && ./.venv/bin/python \\
      "/home/agent/work/VS Proj/MINIMAX-DESKTOP/test-results/experiments/\\
gpu-batch-setL/scripts/setL_0_roster.py"

Gates at build time:
  - sigma: the latent-continuation schedule asserted on the engine's own
    code (simple/240 @ denoise 0.125 -> 30 steps from sigma_s ~0.6316)
  - captions: the setL_captions lint (byte-uniform blocks, no negation or
    comparative, facing vocabulary)
  - loras: hero+tween present, converted qkv format (the zero-key silent
    no-op trap guarded BEFORE the burn)
  - assembly: the V1-API dotted-key gate for every R2V cond node (the
    Set K harness finding — flat ref keys validate then crash at execute)
  - mctx arithmetic: the Motion Context window math asserted on the PACK'S
    OWN CODE (imported from custom_nodes) — 39f=12 steps, 22f tail=7 steps
    starting at cycle position 5 (multiple of 5), 22 < 56 so the node
    accepts; plus the 17n+5 legality of every window length
  - validate_prompt on representative graphs of all five shapes (hero,
    tween window, single, latent chain, mctx chain)
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, "/home/agent/comfyui")
os.chdir("/home/agent/comfyui")

# CPU-only validation: graph-shape validation needs no device, and the
# maintainer's own runs may hold the card (the runbook's priority rule).
# Patching is_available before comfy imports steers model_management to
# its CPU branch without a CUDA context.
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

import setL_lib as L   # noqa: E402
import setL_captions as C  # noqa: E402


def _load_packs():
    import_failed = asyncio.run(nodes.init_extra_nodes())
    for m in import_failed:
        print(f"[setL_0] WARN custom node import failed: {m}")
    return import_failed


IMPORT_FAILED = _load_packs()


# ---------------------------------------------------------------- gate: sigmas
def sigma_gate():
    import comfy.model_sampling as ms
    from comfy import samplers as S

    class MSA(ms.ModelSamplingAV, ms.CONST):
        pass

    m = MSA(None)
    m.set_parameters(shift=L.SHIFT_V, audio_shift=L.SHIFT_A)
    full = S.calculate_sigmas(m, "simple", L.STEPS).tolist()
    total = int(L.LAT_STEPS / L.LAT_DENOISE)
    lat = S.calculate_sigmas(m, "simple", total).tolist()
    sliced = lat[-(L.LAT_STEPS + 1):]
    res = {
        "full_grid_simple30_shift12": [round(v, 4) for v in full],
        "latent_slice": {"steps": len(sliced) - 1, "sigma_first": round(sliced[0], 4)},
        "pass": len(sliced) - 1 == L.STEPS and 0.60 <= sliced[0] <= 0.66
                and abs(full[0] - 1.0) < 1e-6 and full[-1] == 0.0,
    }
    print(f"[setL_0] sigma gate: latent slice n={res['latent_slice']['steps']} "
          f"sigma_s={res['latent_slice']['sigma_first']} -> {'PASS' if res['pass'] else 'FAIL'}")
    return res


# ------------------------------------------------------------- gate: LoRA files
def lora_gate():
    from safetensors import safe_open
    res = {}
    for name in (L.LORA_HERO, L.LORA_TWEEN):
        p = os.path.join("/home/agent/models/loras", name)
        ok = os.path.exists(p)
        keys = []
        if ok:
            with safe_open(p, framework="pt") as f:
                keys = list(f.keys())
        n_qkv = sum(1 for k in keys if "qkv_proj" in k)
        n_sep = sum(1 for k in keys if ".to_q" in k or ".to_k" in k or ".to_v" in k)
        res[name] = {"present": ok, "tensors": len(keys), "qkv_keys": n_qkv,
                     "separate_qkv_keys": n_sep, "pass": ok and n_qkv > 0 and n_sep == 0}
        print(f"[setL_0] lora {name}: {'PASS' if res[name]['pass'] else 'FAIL'} "
              f"({len(keys)} tensors, {n_qkv} qkv, {n_sep} separate-qkv)")
    return res


# --------------------------------------------- gate: mctx window arithmetic
def mctx_gate():
    """Assert the arm-4 window math on the INSTALLED PACK'S OWN functions —
    the strongest available offline check that 39f/56f/22f-tail compose.
    Loaded as a private package (the dir name has dashes; the pack's
    nodes.py does `from .layout_contract import ...`) so ComfyUI's own
    top-level `nodes` module is untouched."""
    import importlib.util
    spec_dir = "/home/agent/comfyui/custom_nodes/ComfyUI-H3-Motion-Context"
    pkg_spec = importlib.util.spec_from_file_location(
        "setL_mctx_pkg", os.path.join(spec_dir, "__init__.py"),
        submodule_search_locations=[spec_dir])
    pkg = importlib.util.module_from_spec(pkg_spec)
    sys.modules["setL_mctx_pkg"] = pkg
    pkg_spec.loader.exec_module(pkg)
    mod_spec = importlib.util.spec_from_file_location(
        "setL_mctx_pkg.nodes", os.path.join(spec_dir, "nodes.py"))
    mod = importlib.util.module_from_spec(mod_spec)
    sys.modules["setL_mctx_pkg.nodes"] = mod
    mod_spec.loader.exec_module(mod)

    def steps_for(n):
        return mod._steps_for_frames(n)

    s1, s2, stail = steps_for(L.F_MCTX1), steps_for(L.F_MCTX2), steps_for(22)
    start = s1 - stail
    res = {
        "w1_frames": L.F_MCTX1, "w1_steps": s1,
        "w2_frames": L.F_MCTX2, "w2_steps": s2,
        "tail_frames": 22, "tail_steps": stail, "tail_start_cycle": start,
        "grid_all_17n5": all((f - 5) % 17 == 0 for f in (L.F_WIN, L.F_SINGLE, L.F_MCTX1, L.F_MCTX2)),
        "node_accepts_ctx": 22 < L.F_MCTX2 and 22 <= L.F_MCTX1,
        "delivered_mctx": {"w1": L.F_MCTX1, "w2_new": L.F_MCTX2 - 22, "sum": L.F_MCTX1 + L.F_MCTX2 - 22,
                           "trim_to": L.F_DELIVER},
    }
    res["pass"] = (s1 == 12 and s2 == 17 and stail == 7 and start % 5 == 0
                   and res["grid_all_17n5"] and res["node_accepts_ctx"]
                   and mod._pixel_frames(s1) == L.F_MCTX1 and mod._pixel_frames(s2) == L.F_MCTX2)
    print(f"[setL_0] mctx gate: w1 {L.F_MCTX1}f={s1} steps, w2 {L.F_MCTX2}f={s2} steps, "
          f"22f tail={stail} steps at cycle {start}; delivered {res['delivered_mctx']['sum']}f "
          f"-> {'PASS' if res['pass'] else 'FAIL'}")
    return res


# ------------------------------------------------------------------- the shapes
def build_roster():
    R = {}
    # 1. the hero key author (pre-buildable; single ref A)
    R["hero"] = L.g_r2v(C.HERO, L.LORA_HERO, L.REF_A, None, "setL/hero_gen", seed=L.SEEDS[0])
    # 2. a tween window (placeholder far = A until C exists; shape-only)
    R["_shape_tween"] = L.g_r2v(C.TWEEN[1], L.LORA_TWEEN, L.REF_A, L.REF_A,
                                "setL/_shape_tween", seed=L.SEEDS[0])
    # 3. the single window (73f)
    R["_shape_single"] = L.g_r2v(C.SINGLE, L.LORA_TWEEN, L.REF_A, L.REF_A,
                                 "setL/_shape_single", seed=L.SEEDS[0], f=L.F_SINGLE)
    # 4. the latent chain (3 beats, placeholder far)
    R["_shape_latent"] = L.g_latent_chain([C.TWEEN[k] for k in (1, 2, 3)],
                                          "setL/_shape_latent_b{k}", far_img=L.REF_A,
                                          seed=L.SEEDS[0])
    # 5. the mctx chain (39f fresh + 56f conditioned)
    R["_shape_mctx"] = L.g_mctx_chain(C.MCTX_W1, C.MCTX_W2, "setL/_shape_mctx_w1",
                                      "setL/_shape_mctx_w2", seed=L.SEEDS[0],
                                      far_img=L.REF_A)
    # 6. the null/canary shape (tween w1 through an alias)
    R["_shape_null"] = L.g_r2v(C.TWEEN[1], L.LORA_TWEEN, L.REF_A, L.REF_A,
                               "setL/_shape_null", seed=L.SEEDS[0], vae_name=L.ALIASES["null"])
    return R


async def assembly_gate(roster):
    """The V1-API dotted-key gate for every R2V cond node (Set K finding)."""
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
            print(f"[setL_0] assembly {name}:{nid} -> {'PASS' if ok else 'FAIL'} "
                  f"{sorted(refs) if isinstance(refs, dict) else refs}")
    return res


async def validate_all(roster):
    results = {}
    for name, graph in roster.items():
        with open(os.path.join(GRAPH_DIR, f"{name}.json"), "w") as fh:
            json.dump(graph, fh, indent=1)
        try:
            valid, err, good_outputs, node_errors = await execution.validate_prompt(
                f"setL-{name}", graph, None)
        except Exception as ex:
            valid, err, node_errors = False, {"type": "exception", "message": repr(ex)}, {"_": repr(ex)}
        results[name] = {"valid": bool(valid), "error": err,
                         "node_errors": {k: v for k, v in (node_errors or {}).items()}}
        print(f"[setL_0] {'OK  ' if valid else 'FAIL'} {name}"
              + ("" if valid else f"  err={json.dumps(err)[:300]} node={json.dumps(node_errors)[:300]}"))
    return results


def main():
    made = L.ensure_aliases()
    if made:
        print(f"[setL_0] created cache-bust aliases: {made}")
    from nodes import NODE_CLASS_MAPPINGS
    mctx_registered = all(n in NODE_CLASS_MAPPINGS for n in
                          ("MiniMaxH3MotionContext", "MiniMaxH3MotionContextTrim"))
    gates = {
        "sigmas": sigma_gate(),
        "loras": lora_gate(),
        "captions": C.lint(),
        "mctx_arithmetic": mctx_gate(),
        "assembly": asyncio.run(assembly_gate(build_roster())),
    }
    roster = build_roster()
    val = asyncio.run(validate_all(roster))
    summary = {
        "set": "L - the four-arm continuation comparison (tween / single / setk / mctx)",
        "question": "which mechanism best continues motion into NEW time - judged blind for "
                    "actual advancement, boundary continuity, drawing style, and identity - at "
                    "matched delivered 66f, three seeds, on an unsaturated 3-direction arc",
        "operating_point": {
            "base": L.UNET_REF2VA + " (pruned int8; the Set-K point)",
            "lora": "model-only @ 1.0 (hero authors the C key; tween rides every arm)",
            "sampler": "euler/simple, BasicGuider, NO CFG, shift 12/3, 30 steps",
            "canvas": [L.W, L.H], "delivered_frames": L.F_DELIVER, "seeds": L.SEEDS,
            "windows": {"tween": [22, 22, 22], "single": [73], "setk": [22, 22, 22],
                        "mctx": [39, 56]},
            "latent_continuation": "denoise-sliced simple/240 @ 0.125 = 30 steps from "
                                   "sigma_s=0.6316 (setK recipe VERBATIM; no m-scalar)",
            "mctx_conventions": "context 22 / audio 24 / context_latent from the previous "
                                "window's sampler output / Trim match_tail on; sampler at the "
                                "Set-K point (the pack prescribes none)",
        },
        "engine": {"mctx_pack_registered": mctx_registered, "import_failed": IMPORT_FAILED},
        "gates": gates,
        "validation": {k: v["valid"] for k, v in val.items()},
        "aliases": L.ALIASES,
    }
    all_ok = (gates["sigmas"]["pass"] and gates["captions"]["pass"]
              and gates["mctx_arithmetic"]["pass"]
              and all(v["pass"] for v in gates["loras"].values())
              and all(v["pass"] for v in gates["assembly"].values())
              and all(v["valid"] for v in val.values()) and mctx_registered)
    summary["ALL_GATES"] = bool(all_ok)
    with open(os.path.join(OUT, "setL_0_roster.json"), "w") as fh:
        json.dump(summary, fh, indent=1)
    print(f"[setL_0] ALL GATES: {'PASS' if all_ok else 'FAIL'}")


if __name__ == "__main__":
    main()
