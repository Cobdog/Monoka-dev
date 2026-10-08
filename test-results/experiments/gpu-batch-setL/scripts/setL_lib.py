"""setL_lib — Set L shared machinery: constants, graph builders.

Set L — the four-arm continuation comparison (the strategic review's
prescribed set, docs/research/latent-continuation-strategic-review-
2026-10-08.md "The recommended v1 decision"):

  arm1 tween  : the Set K tween recipe extended to a 3-window arc —
                window 1 fresh, windows 2-3 chained with promoted near
                references (the rolling image-reference chain)
  arm2 single : ONE 73f generation (17*4+5), delivered-trimmed to 66f —
                the adapter's beyond-22f behavior is the tested unknown
  arm3 setk   : the setK_lib latent recipe VERBATIM at 3 beats — beat 1
                fresh, beats 2-3 terminal-zero re-noised continuations
                (no m-scalar; the engine composes x = sigma*eps +
                (1-sigma)*x_prev natively at the SCA boundary)
  arm4 mctx   : Motion Context tail conditioning — 39f fresh window +
                56f window carrying the previous latent's 22f tail as
                pinned never-denoised conditioning, head trimmed ->
                34f new; delivered 39+34=73f, tail-trimmed to 66f

Matched DELIVERED duration: 66f @ 24fps (2.75 s) for every arm. Same
three seeds across arms. Operating point: the Set-K point (ref2va pruned
int8, tween/hero LoRA @1.0, euler/simple 30 steps, BasicGuider no CFG,
shift 12/3, 1344x768, untiled VAEs); arm 4 adds the Motion Context
node's own documented conventions on top (context 22 / audio 24 /
context_latent / Trim with match_tail), recorded per setL-brief.

The motion battery (designed NOT to complete in one 22f window): head
screen-right -> toward camera -> screen-left -> back toward camera while
both arms rise overhead, then the left arm lowers — three direction
changes with body motion (setL_captions.py carries the texts).
"""
import os

SEEDS = [421337, 421421, 421777]      # s1 continues Set K's seed; same 3 across arms
W, H = 1344, 768
F_WIN = 22                  # 17+5: the on-twos cadence window (arms 1/3)
F_SINGLE = 73               # 17*4+5: the single arm's one legal long window
F_MCTX1 = 39                # 17*2+5: the mctx arm's fresh window
F_MCTX2 = 56                # 17*3+5: the mctx arm's conditioned window
F_DELIVER = 66              # the matched delivered length (2.75 s @ 24fps)
STEPS = 30                  # card floor; 30 executed NFE everywhere
SHIFT_V, SHIFT_A = 12.0, 3.0

TE = "qwen3vl_32b_minimax_h3_int8_convrot.safetensors"
UNET_REF2VA = "minimax_h3_ref2va_pruned_int8_convrot.safetensors"
VAE_V = "minimax_h3_video_vae_fp16.safetensors"
VAE_A = "minimax_h3_audio_vae_fp32.safetensors"
VAE_DIR = "/home/agent/models/vae"
LORA_HERO = "h3_hero_step12000.safetensors"
LORA_TWEEN = "h3_tween_step12000.safetensors"

# Set K's A references, reused verbatim (the brief): A_land is the start key
# pre-composed on the 1344x768 canvas (setK_2's metric anchor; the like-for-
# like geometry + the ~193 s ref-encode class vs the 394 s full-res portrait)
REF_A = "setK/A_land.png"
INPUT_DIR = "/home/agent/comfyui/input/setL"     # C + promoted nears land here
ENGINE_OUT = "/home/agent/comfyui/output"

# cache-bust aliases (Amendment 3 signature lever; fresh names this set)
ALIASES = {
    "null": "minimax_h3_video_vae_fp16__setLnull.safetensors",
    "can2": "minimax_h3_video_vae_fp16__setLcan2.safetensors",
    "can3": "minimax_h3_video_vae_fp16__setLcan3.safetensors",
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


# ----------------------------------------------------------------- builders
def loaders(vae_name=VAE_V):
    return {
        "clip": {"class_type": "CLIPLoader", "inputs": {"clip_name": TE, "type": "minimax", "device": "default"}},
        "vae_v": {"class_type": "VAELoader", "inputs": {"vae_name": vae_name}},
        "vae_a": {"class_type": "VAELoader", "inputs": {"vae_name": VAE_A}},
    }


def model_chain(g, unet=UNET_REF2VA, lora=None):
    """UNET -> (LoRA) -> SigmaShift, per the author's graph order (lora into
    shift). Returns the node key holding the shifted MODEL."""
    g["unet"] = {"class_type": "UNETLoader", "inputs": {"unet_name": unet, "weight_dtype": "default"}}
    src = "unet"
    if lora is not None:
        g["lora"] = {"class_type": "LoraLoaderModelOnly",
                     "inputs": {"model": [src, 0], "lora_name": lora, "strength_model": 1.0}}
        src = "lora"
    g["shift"] = {"class_type": "MiniMaxH3SigmaShift",
                  "inputs": {"model": [src, 0], "shift_video": SHIFT_V, "shift_audio": SHIFT_A}}
    return "shift"


def decode_save(g, samples_key, prefix):
    g["dec_v"] = {"class_type": "VAEDecode", "inputs": {"samples": [samples_key, 0], "vae": ["vae_v", 0]}}
    g["dec_a"] = {"class_type": "VAEDecodeAudio", "inputs": {"samples": [samples_key, 0], "vae": ["vae_a", 0]}}
    g["cvid"] = {"class_type": "CreateVideo", "inputs": {"images": ["dec_v", 0], "audio": ["dec_a", 0], "fps": 24.0}}
    g["save"] = {"class_type": "SaveVideo", "inputs": {"video": ["cvid", 0], "filename_prefix": prefix, "format": "auto"}}


def g_r2v(prompt, lora, near_img, far_img, prefix, seed, steps=STEPS,
          w=W, h=H, f=F_WIN, vae_name=VAE_V):
    """One ref2va gen: 2 refs (near slot0, far slot1); far=None -> the hero
    single-ref contract. Every tween window, the single window, the hero key
    author, and the null/canaries ride this builder."""
    g = loaders(vae_name)
    model = model_chain(g, lora=lora)
    g["load_near"] = {"class_type": "LoadImage", "inputs": {"image": near_img}}
    cond_in = {"clip": ["clip", 0], "vae": ["vae_v", 0], "prompt": prompt,
               "width": w, "height": h, "length": f, "ref_image_size": "max",
               "ref_images.ref_image_0": ["load_near", 0]}
    if far_img is not None:
        g["load_far"] = {"class_type": "LoadImage", "inputs": {"image": far_img}}
        cond_in["ref_images.ref_image_1"] = ["load_far", 0]
    g["cond"] = {"class_type": "MiniMaxH3ReferenceToVideo", "inputs": cond_in}
    g["noise"] = {"class_type": "RandomNoise", "inputs": {"noise_seed": seed, "control_after_generate": "fixed"}}
    g["guider"] = {"class_type": "BasicGuider", "inputs": {"model": [model, 0], "conditioning": ["cond", 0]}}
    g["sched"] = {"class_type": "BasicScheduler", "inputs": {"model": [model, 0], "scheduler": "simple",
                                                             "steps": steps, "denoise": 1.0}}
    g["samp"] = {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}}
    g["sca"] = {"class_type": "SamplerCustomAdvanced",
                "inputs": {"noise": ["noise", 0], "guider": ["guider", 0], "sampler": ["samp", 0],
                           "sigmas": ["sched", 0], "latent_image": ["cond", 1]}}
    decode_save(g, "sca", prefix)
    return g


# the latent-continuation schedule, VERBATIM from setK_lib: 30 EXECUTED steps
# on the residual sigma range from sigma_s = 0.6316 (BasicScheduler: steps is
# the executed count; denoise<1 densifies to int(steps/denoise) then slices
# the LAST steps+1 entries)
LAT_STEPS, LAT_DENOISE = 30, 0.125


def g_latent_chain(beats, prefix_tpl, lora=LORA_TWEEN, near_img=REF_A,
                   far_img="setL/C_key.png", seed=SEEDS[0], steps=STEPS,
                   w=W, h=H, f=F_WIN, vae_name=VAE_V):
    """The setk arm: ONE graph, N beats chained through SCA latent outputs.
    Beat 1 denoise 1.0 from the R2V latent; beats 2+ take the previous beat's
    clean terminal-zero latent as latent_image with FRESH noise and a
    denoise-sliced schedule — the engine's noise_scaling composes
    x = sigma_s*eps + (1-sigma_s)*x_prev natively (Set E's boundary rule; no
    m-scalar across terminal-0 exits). Refs FIXED all beats; captions roll."""
    g = loaders(vae_name)
    model = model_chain(g, lora=lora)
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
                           "inputs": {"model": [model, 0], "conditioning": [f"cond{k}", 0]}}
        den = 1.0 if k == 1 else LAT_DENOISE
        nst = steps if k == 1 else LAT_STEPS   # beats 2+: 30 executed steps
        g[f"sched{k}"] = {"class_type": "BasicScheduler",
                          "inputs": {"model": [model, 0], "scheduler": "simple", "steps": nst, "denoise": den}}
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


def g_mctx_chain(prompt_w1, prompt_w2, prefix_w1, prefix_w2, seed,
                 lora=LORA_TWEEN, near_img=REF_A, far_img="setL/C_key.png",
                 steps=STEPS, w=W, h=H, f1=F_MCTX1, f2=F_MCTX2,
                 ctx="22", audio_ctx=24, vae_name=VAE_V):
    """The mctx arm: ONE graph, two windows. Window 1 is a fresh f1-frame
    R2V gen (plain Set-K point). Window 2 is an f2-frame R2V gen whose
    conditioning passes through MiniMaxH3MotionContext with window 1's
    SAMPLER OUTPUT latent wired as context_latent — the pack's documented
    tail-conditioning path (the pinned head is sliced straight out of the
    previous latent; picture AND sound; never-denoised rows). The delivered
    head is trimmed by the pack's own Trim node (picture+sound together,
    match_tail on) using the Motion Context node's trim_frames output.

    Window arithmetic (asserted offline in setL_0 via the pack's own code):
    39f = 12 latent steps; the 22f tail = 7 steps starting at cycle
    position 5 (a multiple of 5 — clip lengths make it so); 22 < 56 so the
    node accepts the context. Delivered: 39 + (56-22) = 73f -> 66 at
    assembly. The batch driver wires sca1 -> context_latent directly
    (acyclic in one graph) instead of the Save/Load disk pair — same node,
    same latent object, no disk hop; disclosed in the results doc."""
    g = loaders(vae_name)
    model = model_chain(g, lora=lora)
    g["load_near"] = {"class_type": "LoadImage", "inputs": {"image": near_img}}
    g["load_far"] = {"class_type": "LoadImage", "inputs": {"image": far_img}}

    def cond(key, prompt, f):
        g[key] = {"class_type": "MiniMaxH3ReferenceToVideo",
                  "inputs": {"clip": ["clip", 0], "vae": ["vae_v", 0], "prompt": prompt,
                             "width": w, "height": h, "length": f, "ref_image_size": "max",
                             "ref_images.ref_image_0": ["load_near", 0],
                             "ref_images.ref_image_1": ["load_far", 0]}}

    # window 1: fresh
    cond("cond1", prompt_w1, f1)
    g["noise1"] = {"class_type": "RandomNoise", "inputs": {"noise_seed": seed, "control_after_generate": "fixed"}}
    g["guider1"] = {"class_type": "BasicGuider", "inputs": {"model": [model, 0], "conditioning": ["cond1", 0]}}
    g["sched1"] = {"class_type": "BasicScheduler", "inputs": {"model": [model, 0], "scheduler": "simple",
                                                              "steps": steps, "denoise": 1.0}}
    g["samp1"] = {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}}
    g["sca1"] = {"class_type": "SamplerCustomAdvanced",
                 "inputs": {"noise": ["noise1", 0], "guider": ["guider1", 0], "sampler": ["samp1", 0],
                            "sigmas": ["sched1", 0], "latent_image": ["cond1", 1]}}
    g["decv1"] = {"class_type": "VAEDecode", "inputs": {"samples": ["sca1", 0], "vae": ["vae_v", 0]}}
    g["deca1"] = {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["sca1", 0], "vae": ["vae_a", 0]}}
    g["cvid1"] = {"class_type": "CreateVideo",
                  "inputs": {"images": ["decv1", 0], "audio": ["deca1", 0], "fps": 24.0}}
    g["save1"] = {"class_type": "SaveVideo",
                  "inputs": {"video": ["cvid1", 0], "filename_prefix": prefix_w1, "format": "auto"}}

    # window 2: Motion Context tail conditioning on window 1's latent
    cond("cond2", prompt_w2, f2)
    g["mctx"] = {"class_type": "MiniMaxH3MotionContext",
                 "inputs": {"conditioning": ["cond2", 0], "vae": ["vae_v", 0], "latent": ["cond2", 1],
                            "context_length": ctx, "audio_context_length": audio_ctx,
                            "context_latent": ["sca1", 0]}}
    g["noise2"] = {"class_type": "RandomNoise",
                   "inputs": {"noise_seed": seed + 100 + 2, "control_after_generate": "fixed"}}
    g["guider2"] = {"class_type": "BasicGuider", "inputs": {"model": [model, 0], "conditioning": ["mctx", 0]}}
    g["sched2"] = {"class_type": "BasicScheduler", "inputs": {"model": [model, 0], "scheduler": "simple",
                                                              "steps": steps, "denoise": 1.0}}
    g["samp2"] = {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}}
    g["sca2"] = {"class_type": "SamplerCustomAdvanced",
                 "inputs": {"noise": ["noise2", 0], "guider": ["guider2", 0], "sampler": ["samp2", 0],
                            "sigmas": ["sched2", 0], "latent_image": ["cond2", 1]}}
    g["decv2"] = {"class_type": "VAEDecode", "inputs": {"samples": ["sca2", 0], "vae": ["vae_v", 0]}}
    g["deca2"] = {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["sca2", 0], "vae": ["vae_a", 0]}}
    g["trim2"] = {"class_type": "MiniMaxH3MotionContextTrim",
                  "inputs": {"images": ["decv2", 0], "audio": ["deca2", 0],
                             "trim_frames": ["mctx", 1], "fps": 24.0, "match_tail": True}}
    g["cvid2"] = {"class_type": "CreateVideo",
                  "inputs": {"images": ["trim2", 0], "audio": ["trim2", 1], "fps": 24.0}}
    g["save2"] = {"class_type": "SaveVideo",
                  "inputs": {"video": ["cvid2", 0], "filename_prefix": prefix_w2, "format": "auto"}}
    return g
