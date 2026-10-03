# Qwen-Image-2.1 — research packet

> Packet date: 2026-10-03 · Flux task: vcks4mb · METHOD: corpus-first —
> [qwen-image-2.1-assessment.md](../qwen-image-2.1-assessment.md) (day-one
> card/code-level assessment + ratify addenda),
> [fooocus-qwen-assessment.md](../fooocus-qwen-assessment.md) (the
> measured operating doctrine, incl. its two CORRECTS to the family record),
> official QwenLM README re-fetched 2026-10-03. Tags: **[DOC]**,
> **[DOC-m]** (measured by the fooocus authors, not us), **[COMM]**,
> **[SPEC]**, **[UNK]**.
>
> **Weights:** `Qwen/Qwen-Image-2.1` DiT int8-convrot (7.26 GB) + `qwen3vl_8b`
> int8-convrot TE (9.35 GB) + 64-ch RGBA VAE — ~17.3 GB resident on 24 GB
> [DOC]. Fast tier: `Viggle/Qwen-Image-2.1-viggle-turbo` DMD LoRA (r256
> 1.3 GB / r128 0.68 GB). **License: Qwen RESEARCH LICENSE —
> non-commercial** ("research or evaluation purposes only"); every
> predecessor in the family was Apache-2.0 and this one is NOT. Flagged
> license class; weights link-never-copy.

## 1. What the family is

One 7.1B single-stream DiT unifying t2i + instruction editing + multi-ref
composition + RGBA transparent generation/editing + subject extraction;
Qwen3-VL 8B encodes text AND all condition images; 64-ch RGBA VAE; flow
matching with prefix-KV reuse; native 2K [DOC]. The committed Workbench
edit lane ("qwen edit, flux, klein, krea, anima" directive). Signature
strengths: text rendering ("improved typography"), ≤10-ref composition,
RGBA lane; no turbo of its own except the Viggle DMD distill.

## 2. How the model reads

- Edit = plain instruction text (`"Change the background to a sunset
  beach"`). References are auto-spliced as `<|vision_start|>…` blocks BEFORE
  the user turn; **`<imageN>` tags are the official multi-image protocol**
  — N≥2 → tags MANDATORY and natural-language references ("the first
  image") FORBIDDEN; N=1 → tags FORBIDDEN; each image's role stated
  explicitly (canvas vs material) [DOC — official edit/PE system prompt,
  via fooocus §3.6; corrects our day-one record].
- **Reference priority is copy-shaped**: with a skeleton pose-ref AND a
  style-exemplar ref, the model copies the exemplar's pose and ignores the
  skeleton; skeleton-only + style-in-words holds the pose [DOC-m]. Same
  failure family as H3's merge-to-one-subject — one concept per reference,
  described in words where it isn't the ref's job.
- Sizing: the latent is sized off the FIRST reference — "any other size
  shifts the edit"; pass explicit dimensions (the frame-shrink trap) [DOC —
  node; CONFIRM fooocus].
- One transformer token = 8×8 px (latents not patchified) — /32 canvas
  sizing is the natural grid [DOC-m].

## 3. The prompting contract

- **T2I**: natural-language description; short prompts are officially meant
  to be expanded by the PE rewriters (two Qwen3.5-VL 9B companions; we run
  OUR expansion layer instead — maintained call). Example register: `"A
  neon shop sign that reads "QWEN IMAGE 2.1", rainy night, reflections on
  wet pavement"` [DOC — README].
- **Edit**: instruction prose; role steering = `<imageN>` tags + explicit
  role sentences ("`<image1>` is the canvas; insert only the hat from
  `<image2>`"). Aspect inheritance via `ratio_follow: "<image1>"`
  semantics; the output-sizing canvas is picked by edit type (face-swap →
  body image; style transfer → content image; compositing → target scene)
  [DOC — official system prompt rules].
- **RGBA formula (verbatim, recommended)** [DOC]:
  `"This is an RGBA image with transparency. <desc>. The image has alpha channel and the background is transparent."`
- **First-class negative prompt** (encoded against the same refs) — new for
  the family. BUT at cfg 1.0 it is INERT: "at `true_cfg_scale=1.0` style
  negatives never reach the model — the UI must say this, else the silence
  looks like a malfunction" [DOC — fooocus; template default cfg 1].
- **Masked-edit protocol (measured)** [DOC-m]:
  - The model gets a BINARIZED mask (pure white edit / pure black keep,
    sharp edges); the COMPOSITE gets the feathered one. One mask, two
    representations, two consumers.
  - **Words about the mask make it worse** — naming `<image2>` as a mask
    doubled out-of-mask spread (99.2% vs 46.9% pixels touched). Bare user
    prompt is the protocol; "explain the mask in words" is closed.
  - **Any transparency vocabulary — even negated — triggers transparency**
    ("must be fully opaque" collapsed opacity to 13–51%). No
    transparency/alpha/background-cutting words in edit prompts. A cfg>1
    negative against transparency DOES work (99.9% opaque) at 2× transformer
    cost — emergency lever.
  - **Hole-in-alpha** (source as one RGBA image with the edit area
    transparent) is the strongest interior-edit encoding (outside-Δ 3.43,
    1.8% stray) — but HARMFUL for outpaint (a transparent border is the
    sticker signature).
  - **Outpaint prompts describe the finished scene, not the operation** —
    "continue the scene naturally" produced 0% opacity (subject cut out as
    a sticker) on every encoding; a scene description gave 100% [DOC-m].
- Color annotation mode: circle several areas in different colors, refer to
  them by color in ONE prompt → several independent edits in a single pass
  (the card's drawn-annotation capability productized) [DOC card + DOC-m
  shell].

## 4. Sampler settings, resolutions, frames

| Tier | Steps | CFG | Resolution ladder | Notes |
|---|---|---|---|---|
| Official t2i/edit (Diffusers) | 40 | 1 (template/SGLang `--guidance-scale 1`) | default 2048²; 7 canonical ratios: 1:1 2048², 4:3 2400×1792, 3:4 1792×2400, 3:2 2528×1696, 2:3 1696×2528, 16:9 2752×1536, 9:16 1536×2752 [DOC — README] | ai-toolkit trains at guidance 3 |
| ComfyUI template | 25 | 1 | first-reference-sized latent; `resolution` dial = ref resize | ≥ v0.37.0 native nodes |
| Preset ladder (fooocus, measured on 3090) | 16 @1024² / 28 @1536² / 40 @2048² | 1 | quality dial fuses res × steps | edit at 1536 source scale OOMs 24 GB — use the reference-scale ladder below |
| **Reference-scale ladder** (the 24 GB operating point) | — | — | condition images scaled: ≥4 → 512 px, 2–3 → 768, 1 → 1024; FRAME stays at preset size (explicit dims) | 5 refs at preset scale = 13 min/frame vs 38 s at 512 [DOC-m] |
| Viggle turbo | 6 | 1 (no CFG, no negative) | **scoped to ~1024²** | raw sigmas `[1.0, 0.9375, 0.875, 0.75, 0.5, 0.25]` (change steps only at the high-noise end), shipped scheduler (base `shift_terminal: 0.02`), never merged, lazy 1.3 GB attach; above 1024² the distill emits an 8-px-period latent grid [DOC + DOC-m] |

Turbo workflow pattern: TurboDraft at 768² (~5 s) for prompt/seed iteration
→ re-run the keeper at a full preset, same seed [DOC-m].

## 5. LoRA / strength interactions

- Day-0 ai-toolkit LoRA training (alpha-channel training, LoKR, refmod/
  LoRA stacking) at guidance 3 [DOC].
- The turbo adapter is NEVER merged (bf16 merge irreversibly damages the
  distill) — the three-team doctrine [DOC].
- LoRA × turbo interaction on 2.1: [UNK] — nothing published.

## 6. Task recipes (presets)

- **Instruction edit (whole frame)**: 25–40 steps cfg 1; single ref (no
  tags); instruction prose; negative left empty (inert at cfg 1).
- **Multi-ref composition** (≤10 refs): tags on; role sentence per image;
  reference-scale ladder set by count; explicit frame dims. Group-photo /
  full-outfit-from-parts are the showcase classes [DOC].
- **Local edit (mask)**: binary mask to model / feathered to composite;
  hole-in-alpha as the interior-edit option; no mask words, no transparency
  words; measure `clipped_share` and warn on seams at edit time [DOC-m
  pattern].
- **Outpaint**: same mask scenario with new area as mask, `BORDER_REPLICATE`
  prefill, canvas rounded UP to /32 on growing axes; prompt = the finished
  scene description [DOC-m].
- **RGBA / subject extraction**: the §3 RGBA formula verbatim; subject
  extraction is a supported edit class [DOC].
- **Text-heavy designs**: the family's signature; quote the exact strings
  (text rendering inherited); still verify — typography benchmarks live in
  the uncaptured blog [UNK on numbers].
- **Pose transfer**: skeleton ref ONLY + style in words (copy-shaped
  priority, §2).
- **Fast iteration**: turbo @ 6 steps ≤1024², then full preset at the same
  seed.

## 7. Fundamentals — the triangle

- **Adherence**: tag protocol + role sentences (official); explicit frame
  dims (the size-derivation hazard); one concept per reference.
- **Quality**: steps×resolution move together (the preset ladder); dense
  text is the family edge; condition-image scale is the 24 GB reality dial.
- **Speed**: turbo 6-step (~5× but 1024²-scoped); reference-scale ladder
  (38 s vs 13 min); prefix-KV reuse is automatic.
- Trade-offs: the license gates commercial use (the family gate); refine-
  lane viability exists only via turbo and only ≤1024²; multi-ref beyond 3
  costs conditioning scale, not quality, if the ladder is honored.

## 8. Community-verified tips

- "Qwen-Image-2.1 understands the mask semantically" — no SDXL-era
  inpaint machinery needed [DOC — fooocus design note].
- The 8-px turbo grid is a property of the DISTILL, identical across
  bf16/INT8/Sage and present in the author's own reference pipeline —
  budget a full-model finishing pass if it appears [DOC-m].
- PNG round-trip / parameter restore UX patterns (dual-chunk metadata) —
  UX doctrine, not prompting [DOC-m].

## 9. Failure modes

| # | Failure | Fix |
|---|---|---|
| 1 | Frame shrinks to a scaled reference | Explicit dimensions everywhere |
| 2 | Transparency triggers unintentionally | Zero transparency vocabulary; cfg>1 negative as the emergency lever |
| 3 | Mask words poison the edit | Bare prompt; binarized mask to model |
| 4 | Pose copied from the wrong ref | One concept per ref; style in words |
| 5 | Turbo grid above 1024² | Scope turbo; finish at full preset |
| 6 | OOM on multi-ref edits | The reference-scale ladder |
| 7 | Multi-ref merge-to-one-subject | Role partition + tags (H3-class hazard) |
| 8 | Negative prompt silently inert at cfg 1 | Surface the notice; don't sell negatives |

## 10. License pointer

Qwen RESEARCH LICENSE AGREEMENT (release 2026-09-20): non-commercial =
"research or evaluation purposes only"; commercial needs a separate Tongyi
license; "Built with Qwen" attribution for derivatives used to train
distributed AI; no primary-name use; Chinese law/Hangzhou courts. Not
gated (open download). The viggle-turbo adapter carries the same license.
Any commercial posture flips the family verdict [DOC — full text read in
the assessment].

## 11. Sources

[qwen-image-2.1-assessment.md](../qwen-image-2.1-assessment.md) (HF API +
README + ComfyUI code reads 2026-09-20, addenda 09-21/09-27);
[fooocus-qwen-assessment.md](../fooocus-qwen-assessment.md) (full clone
code-read 2026-09-27, measured items tagged [DOC-m]); QwenLM/Qwen-Image-2.1
README (re-fetched 2026-10-03: ratios table, RGBA formula, PE pair, steps);
Viggle/Qwen-Image-2.1-viggle-turbo card (via viggle-assessment +
fooocus).
