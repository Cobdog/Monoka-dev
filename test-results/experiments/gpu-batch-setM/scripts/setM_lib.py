"""setM_lib — Set M shared machinery: constants, graph builders.

Set M — the Viggle-Animate swap battery (face/outfit from a single
repainted frame). Three graph families:

  g_drive_chain   the driving clip: character A via the setk-style latent
                  chain (setL_lib.g_latent_chain semantics VERBATIM —
                  Set L measured it the module's strongest advancer; the
                  tween lane's hold basin disqualifies it as a motion-rich
                  driver). 3x22f, refs A_land + setL/C_key fixed, beats
                  2-3 terminal-zero re-noised (sigma_s = 0.6316).
  g_t2i / g_edit  the H3 image lane (the studio's packet profile on the
                  hybrid b25-49): H3TextToImagePrepare authors character
                  B; H3ReferenceEditPrepare renders the repaints (control/
                  face/outfit) and the two sheet views. 'high quality |
                  13 frames' tier, res_multistep/simple 20 steps, no
                  turbo, no sigma shift (the packet pins); all 13 frames
                  published, the settled tail picked offline by Laplacian.
  g_viggle        the Viggle arms: LoadVideo -> GetVideoComponents ->
                  ViggleAnimateConditioning (video-first nested refs,
                  width/height 0 = the clip's own 1344x768, length 124 =
                  the max; a 66f input generates 73f on the 17k+5 grid) ->
                  UNET viggle pruned int8 + DMD r64 LoRA @1.0 ->
                  MiniMaxH3SigmaShift 3/3 -> BasicGuider/euler +
                  ManualSigmas (the pack's upstream 4-point baseline:
                  3 Euler updates) -> SCA on the conditioning latent ->
                  VAEDecode -> CreateVideo 24fps (silent - the pack
                  discards generated audio).

Operating points, all recorded in the results doc:
  driving   the Set-K point (ref2va pruned int8 + tween LoRA @1.0,
            euler/simple 30 steps, BasicGuider no CFG, shift 12/3,
            1344x768, untiled VAEs)
  image     hybrid b25-49 (fl2va+ref2va pruned int8), packet pins
            (res_multistep/simple 20, unshifted), video VAE fp16 decode
  viggle    the pack's documented defaults (pruned int8 + DMD r64 @1.0,
            shift 3/3, the upstream 4-point sigma list, euler,
            BasicGuider, 1.03 MP canvas from the driving clip)
"""
import os

# ------------------------------------------------------------------ constants
# SEED SWITCH (2026-10-08, recorded): the battery opened at Set L's two
# motion-bearing seeds {421337, 421777}; every Viggle arm at 421337
# COLLAPSED TO NEAR-BLACK (first-frame mean 16-26 vs 421777's ~235;
# bit-reproduced by the null + both canaries - a seed-locked total failure
# of the 4-point/3-update DMD baseline on this OOD line-art subject).
# Seed 421421 probed productive (mean 239.9) and replaces 421337; the
# collapsed runs stay in the manifest as the measured finding.
SEEDS = [421421, 421777]
DRIVE_SEED = 421337               # Set L's strongest advancing seed (the
#   driving chain is ref2va+tween, NOT the DMD path - unaffected)
W, H = 1344, 768
F_WIN = 22                        # 17+5: the driving chain's beat window
F_DELIVER = 66                    # 3x22 concatenated; the driving/delivered length
F_EXPECT_VIGGLE = 73              # _generation_frame_count(66) on the pack's grid
STEPS = 30                        # driving chain: the Set-K card floor
SHIFT_V, SHIFT_A = 12.0, 3.0      # driving chain (Set-K point)
LAT_STEPS, LAT_DENOISE = 30, 0.125  # the setk continuation slice (verbatim)

BW, BH = 832, 1216                # character B's portrait canvas (32-grid)
IMG_STEPS = 20                    # the packet profile's full-step pin

# driving chain (the Set-K point)
TE = "qwen3vl_32b_minimax_h3_int8_convrot.safetensors"
UNET_REF2VA = "minimax_h3_ref2va_pruned_int8_convrot.safetensors"
VAE_V = "minimax_h3_video_vae_fp16.safetensors"
VAE_A = "minimax_h3_audio_vae_fp32.safetensors"
LORA_TWEEN = "h3_tween_step12000.safetensors"

# image lane (the hybrid + packet pins)
UNET_FL2VA = "minimax_h3_fl2va_pruned_int8_convrot.safetensors"
IMG_SAMPLER, IMG_SCHED = "res_multistep", "simple"
QP_13 = "high quality | 13 frames"
N_PUBLISH = 13                    # publish every packet frame; pick offline

# viggle (the pack's documented defaults)
UNET_VIGGLE = "minimax_h3_ref2va_viggle_pruned_int8_convrot.safetensors"
LORA_DMD_R64 = "viggle_animate_dmd_lora_r64.safetensors"
TEXT_COND = "fixed_embed_fwd_anyframe.safetensors"
SIGMAS_4PT = "1.0, 0.8571428571428571, 0.6, 0.0"   # upstream baseline: 3 updates
VIGGLE_SHIFT_V, VIGGLE_SHIFT_A = 3.0, 3.0

REF_A = "setK/A_land.png"         # the start key (canvas-composed, 1344x768)
REF_C = "setL/C_key.png"          # Set L's arc-end key (dE 16.16 from A, gated there)
DRIVE_MP4 = "setM_drive.mp4"      # input/ root (LoadVideo combo scans the root)
INPUT_DIR = "/home/agent/comfyui/input/setM"     # repaints/B/sheet land here
ENGINE_OUT = "/home/agent/comfyui/output"
VAE_DIR = "/home/agent/models/vae"

ALIASES = {
    "null": "minimax_h3_video_vae_fp16__setMnull.safetensors",
    "can2": "minimax_h3_video_vae_fp16__setMcan2.safetensors",
    "can3": "minimax_h3_video_vae_fp16__setMcan3.safetensors",
}


def ensure_aliases():
    base = os.path.join(VAE_DIR, VAE_V)
    made = []
    for key, alias in ALIASES.items():
        p = os.path.join(VAE_DIR, alias)
        if not os.path.exists(p):
            os.symlink(base, p)
            made.append(alias)
    return made


# ------------------------------------------------------------- driving chain
def _drive_loaders(vae_name=VAE_V):
    return {
        "clip": {"class_type": "CLIPLoader", "inputs": {"clip_name": TE, "type": "minimax", "device": "default"}},
        "vae_v": {"class_type": "VAELoader", "inputs": {"vae_name": vae_name}},
        "vae_a": {"class_type": "VAELoader", "inputs": {"vae_name": VAE_A}},
    }


def g_drive_chain(beats, prefix_tpl, near_img=REF_A, far_img=REF_C,
                  seed=DRIVE_SEED, steps=STEPS, w=W, h=H, f=F_WIN):
    """3-beat terminal-zero latent chain (setL_lib.g_latent_chain verbatim
    semantics): beat 1 fresh from the R2V latent; beats 2+ take the previous
    beat's clean latent as latent_image with FRESH noise (seed+100+k) and a
    denoise-sliced schedule — x = sigma_s*eps + (1-sigma_s)*x_prev composed
    natively at the SCA boundary. Refs FIXED; captions roll."""
    g = _drive_loaders()
    g["unet"] = {"class_type": "UNETLoader", "inputs": {"unet_name": UNET_REF2VA, "weight_dtype": "default"}}
    g["lora"] = {"class_type": "LoraLoaderModelOnly",
                 "inputs": {"model": ["unet", 0], "lora_name": LORA_TWEEN, "strength_model": 1.0}}
    g["shift"] = {"class_type": "MiniMaxH3SigmaShift",
                  "inputs": {"model": ["lora", 0], "shift_video": SHIFT_V, "shift_audio": SHIFT_A}}
    g["load_near"] = {"class_type": "LoadImage", "inputs": {"image": near_img}}
    g["load_far"] = {"class_type": "LoadImage", "inputs": {"image": far_img}}
    prev = None
    for k, prompt in enumerate(beats, 1):
        g[f"cond{k}"] = {"class_type": "MiniMaxH3ReferenceToVideo",
                         "inputs": {"clip": ["clip", 0], "vae": ["vae_v", 0], "prompt": prompt,
                                    "width": w, "height": h, "length": f, "ref_image_size": "max",
                                    "ref_images.ref_image_0": ["load_near", 0],
                                    "ref_images.ref_image_1": ["load_far", 0]}}
        g[f"noise{k}"] = {"class_type": "RandomNoise",
                          "inputs": {"noise_seed": seed if k == 1 else seed + 100 + k,
                                     "control_after_generate": "fixed"}}
        g[f"guider{k}"] = {"class_type": "BasicGuider",
                           "inputs": {"model": ["shift", 0], "conditioning": [f"cond{k}", 0]}}
        den = 1.0 if k == 1 else LAT_DENOISE
        nst = steps if k == 1 else LAT_STEPS
        g[f"sched{k}"] = {"class_type": "BasicScheduler",
                          "inputs": {"model": ["shift", 0], "scheduler": "simple", "steps": nst, "denoise": den}}
        g[f"samp{k}"] = {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}}
        lat_in = [f"cond{k}", 1] if k == 1 else [prev, 0]
        g[f"sca{k}"] = {"class_type": "SamplerCustomAdvanced",
                        "inputs": {"noise": [f"noise{k}", 0], "guider": [f"guider{k}", 0],
                                   "sampler": [f"samp{k}", 0], "sigmas": [f"sched{k}", 0],
                                   "latent_image": lat_in}}
        g[f"decv{k}"] = {"class_type": "VAEDecode", "inputs": {"samples": [f"sca{k}", 0], "vae": ["vae_v", 0]}}
        g[f"deca{k}"] = {"class_type": "VAEDecodeAudio", "inputs": {"samples": [f"sca{k}", 0], "vae": ["vae_a", 0]}}
        g[f"cvid{k}"] = {"class_type": "CreateVideo",
                         "inputs": {"images": [f"decv{k}", 0], "audio": [f"deca{k}", 0], "fps": 24.0}}
        g[f"save{k}"] = {"class_type": "SaveVideo",
                         "inputs": {"video": [f"cvid{k}", 0],
                                    "filename_prefix": prefix_tpl.format(k=k), "format": "auto"}}
        prev = f"sca{k}"
    return g


# --------------------------------------------------------------- image lane
def _img_model_chain(g):
    """The hybrid b25-49 loader (fl2va base + ref2va adaln overlay) — the
    studio's image-lane profile. No turbo, no sigma shift (packet pins)."""
    g["clip"] = {"class_type": "CLIPLoader", "inputs": {"clip_name": TE, "type": "minimax", "device": "default"}}
    g["vae_v"] = {"class_type": "VAELoader", "inputs": {"vae_name": VAE_V}}
    g["hybrid"] = {"class_type": "MiniMaxH3HybridLoader",
                   "inputs": {"base_model": UNET_FL2VA, "overlay_model": UNET_REF2VA,
                              "overlay_preset": "block_range_adaln", "block_range_start": 25,
                              "block_range_end": 49, "final_adaln_from_overlay": False,
                              "custom_overlays": "", "custom_base": "", "weight_dtype": "default"}}
    return "hybrid"


def _img_tail(g, cond_key, model_key, seed, prefix):
    g["noise"] = {"class_type": "RandomNoise", "inputs": {"noise_seed": seed, "control_after_generate": "fixed"}}
    g["guider"] = {"class_type": "BasicGuider", "inputs": {"model": [model_key, 0], "conditioning": [cond_key, 0]}}
    g["samp"] = {"class_type": "KSamplerSelect", "inputs": {"sampler_name": IMG_SAMPLER}}
    g["sched"] = {"class_type": "BasicScheduler",
                  "inputs": {"model": [model_key, 0], "scheduler": IMG_SCHED, "steps": IMG_STEPS, "denoise": 1.0}}
    g["sca"] = {"class_type": "SamplerCustomAdvanced",
                "inputs": {"noise": ["noise", 0], "guider": ["guider", 0], "sampler": ["samp", 0],
                           "sigmas": ["sched", 0], "latent_image": [cond_key, 1]}}
    g["dec"] = {"class_type": "H3ImageDecode",
                "inputs": {"samples": ["sca", 0], "vae": ["vae_v", 0], "decode_mode": "temporal"}}
    for i in range(N_PUBLISH):
        g[f"sel{i}"] = {"class_type": "ImageFromBatch",
                        "inputs": {"image": ["dec", 0], "batch_index": i, "length": 1}}
        g[f"save{i}"] = {"class_type": "SaveImage",
                         "inputs": {"images": [f"sel{i}", 0], "filename_prefix": f"{prefix}_{i:02d}"}}
    return g


def g_t2i(prompt, w=BW, h=BH, prefix="setM/b_t2i", seed=421337):
    """Character B authoring: T2I on the hybrid, 13-frame packet tier."""
    g = {}
    model = _img_model_chain(g)
    g["cond"] = {"class_type": "H3TextToImagePrepare",
                 "inputs": {"clip": ["clip", 0], "prompt": prompt, "width": w, "height": h,
                            "quality_profile": QP_13, "optimize_for_still": False}}
    return _img_tail(g, "cond", model, seed, prefix)


def g_ref_edit(instruction, source_img, ref_img, w=W, h=H, prefix="setM/edit",
               seed=421337, source_fidelity=0.6):
    """The repaints and sheet views: source = <Picture 1> (pose/framing
    anchor), donor = <Picture 2>, the studio's reference-edit wiring
    (reference_detail max_identity_2048, native transport, crop_center —
    a no-op on an already-fitted source)."""
    g = {}
    model = _img_model_chain(g)
    g["load_src"] = {"class_type": "LoadImage", "inputs": {"image": source_img}}
    g["load_ref"] = {"class_type": "LoadImage", "inputs": {"image": ref_img}}
    g["cond"] = {"class_type": "H3ReferenceEditPrepare",
                 "inputs": {"clip": ["clip", 0], "vae": ["vae_v", 0],
                            "source_image": ["load_src", 0], "edit_instruction": instruction,
                            "width": w, "height": h, "quality_profile": QP_13,
                            "source_fidelity": source_fidelity, "source_fit": "crop_center",
                            "reference_detail": "max_identity_2048", "optimize_for_still": False,
                            "reference_image_2": ["load_ref", 0], "reference_transport": "native"}}
    return _img_tail(g, "cond", model, seed, prefix)


# ------------------------------------------------------------------- viggle
def g_viggle(ref_image, seed, prefix, video_file=DRIVE_MP4, vae_name=VAE_V):
    """One Viggle propagation: the driving clip + ONE still -> video, the
    pack's single-shot path (short input: 66f -> 73f generated, trimmed to
    66f at delivery). Upstream 4-point baseline (3 Euler updates), shift
    3/3, DMD r64 @1.0. Audio discarded (CreateVideo silent)."""
    g = {
        "load_video": {"class_type": "LoadVideo", "inputs": {"file": video_file}},
        "gvc": {"class_type": "GetVideoComponents", "inputs": {"video": ["load_video", 0]}},
        "load_ref": {"class_type": "LoadImage", "inputs": {"image": ref_image}},
        "textcond": {"class_type": "ViggleTextCondLoader", "inputs": {"text_cond": TEXT_COND}},
        "vae_v": {"class_type": "VAELoader", "inputs": {"vae_name": vae_name}},
        "unet": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET_VIGGLE, "weight_dtype": "default"}},
        "lora": {"class_type": "LoraLoaderModelOnly",
                 "inputs": {"model": ["unet", 0], "lora_name": LORA_DMD_R64, "strength_model": 1.0}},
        "shift": {"class_type": "MiniMaxH3SigmaShift",
                  "inputs": {"model": ["lora", 0], "shift_video": VIGGLE_SHIFT_V, "shift_audio": VIGGLE_SHIFT_A}},
        "cond": {"class_type": "ViggleAnimateConditioning",
                 "inputs": {"cond_video": ["gvc", 0], "ref_image": ["load_ref", 0],
                            "text_cond": ["textcond", 0], "vae": ["vae_v", 0],
                            "width": 0, "height": 0, "length": 124}},
        "noise": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed, "control_after_generate": "fixed"}},
        "guider": {"class_type": "BasicGuider", "inputs": {"model": ["shift", 0], "conditioning": ["cond", 0]}},
        "samp": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "sigmas": {"class_type": "ManualSigmas", "inputs": {"sigmas": SIGMAS_4PT}},
        "sca": {"class_type": "SamplerCustomAdvanced",
                "inputs": {"noise": ["noise", 0], "guider": ["guider", 0], "sampler": ["samp", 0],
                           "sigmas": ["sigmas", 0], "latent_image": ["cond", 1]}},
        "dec_v": {"class_type": "VAEDecode", "inputs": {"samples": ["sca", 0], "vae": ["vae_v", 0]}},
        "cvid": {"class_type": "CreateVideo", "inputs": {"images": ["dec_v", 0], "fps": 24.0}},
        "save": {"class_type": "SaveVideo", "inputs": {"video": ["cvid", 0],
                                                       "filename_prefix": prefix, "format": "auto"}},
    }
    return g
