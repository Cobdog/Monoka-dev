# Krea 2 — research packet

> Packet date: 2026-10-03 · Flux task: vcks4mb · METHOD: corpus-first — the
> local source of truth (`/home/agent/work/VS Proj/Kreatine`: node pack code,
> `core/edit_encode.py`, `core/weighting.py`, reference docs) via
> [per-model-prompt-doctrines.md](../per-model-prompt-doctrines.md) §3, plus
> [krea2-edit-mode.md](../krea2-edit-mode.md) (the 2026-09-14 fresh-eyes web
> sweep + its E-K1 measured addendum) and
> [cierpliwy-krea2-inpaint-edit.md](../cierpliwy-krea2-inpaint-edit.md).
> Tags: **[DOC]** (incl. [DOC-local] = Kreatine code), **[COMM]**,
> **[SPEC]**, **[UNK]**, **[MEASURED]** (ours).
>
> **Weights (as run here):** krea2 DiT int8-convrot (Raw 52-step / Turbo
> 8-step pair), TE `qwen3vl_4b_fp8_scaled` (the VL tower is REQUIRED for all
> edit paths), VAE `qwen_image_vae`; edit LoRAs: Identity Edit v1.2 (+_r64/
> _r128), AnyPaint rank-32, Cierpliwy ostris inpaint trio. **License:** Krea
> 2 Community License (weights + derivative LoRAs) — commercial under the
> revenue threshold with moderation + AI-disclosure duties; see
> [../licenses/registry.md](../../licenses/registry.md).

## 1. What the family is

A T2I diffusion family (no native edit mode — the technical report defers
"robust editing, image reference" to future work [DOC]) whose ENTIRE editing
surface is a community-built LoRA layer over one resident checkpoint:

| Lane | Mechanism | Prompt contract |
|---|---|---|
| **Instruct** (Identity Edit v1.2) | dual conditioning: source as in-context latents (RoPE frame 1) + grounded Qwen3-VL text encode; dials `grounding_px` 384–768, `ref_boost` | bare plain-language instruction (trained on instructions, not descriptions) |
| **Refine (masked)** (AnyPaint) | mask-aware encode; per-step latent restoration; 32-px boundary blend band | **scene-style** (describe the whole scene's look, not just the masked object) [MEASURED E-K1] |
| **Ostris inpaint** (Cierpliwy trio) | ostris t=0 carrier, kv_cache ON | **region-scoped** ("describe what should appear in the masked region — style, colors, content") [DOC — card] |
| T2I / style-reference | base + official style-reference LoRA | flowing descriptive prose (§3) |

The two masked lanes have OPPOSITE prompt contracts — the reference channel
does the preservation on each's own terms. Getting this backwards is a
quality bug, not a preference.

## 2. How the model reads

- **The TE is literally prompted as a captioner.** ComfyUI core's
  `KREA2_TEMPLATE` wraps every prompt: *"Describe the image by detailing the
  color, shape, size, texture, quantity, text, spatial relationships of the
  objects and background:"* — the Qwen3-VL-4B encoder consumes
  image-description-shaped prose BY CONSTRUCTION [DOC-local]. Flowing
  descriptive prose at length is the native distribution; keyword piles are
  out-of-distribution (the Anima exception does not extend here).
- **Two-stage sampler asymmetry** (Kreatine): stage 1 **Raw** (cfg 4.0–4.5 ↔
  Krea guidance 3–3.5, classical negative authority, weighting DISABLED —
  `disable_weights=True`) decides composition/framing/subject count/broad
  style in the top ~8% of sigma; stage 2 **turbo** (cfg exactly 1.0, no
  uncond branch) carries per-token weighting via `(term:-n)` sign-flip
  attention scaling [DOC-local].
- References encode as `Picture {i}: <|vision_start|>…` marker blocks (VL
  budget 384×384 per image to the TE; reference latents ≤1024×1024) — the
  same indexed-reference spine as H3's `<Picture N>` and Klein's `Image N`
  [DOC-local].
- **Open-release prompt adherence is weaker than the API version**
  (official-adjacent confirmed in the Krea AMA; Krea2T-Enhancer exists to
  compensate) [COMM] — prompt-side over-specification underperforms dials
  here (§7).

## 3. The prompting contract

- **Format**: flowing English prose in the captioner's own enumeration —
  color, shape, size, texture, quantity, text (quoted), spatial
  relationships, of objects AND background [DOC-local]. For stills T2I our
  `OF_KREA2` row is the prose superset: subject, action, composition,
  environment, lighting, materials, mood — at length.
- **Length**: ≤ ~1k tokens (the Raw prompt budget — captions/prompts longer
  than the constraining channel are wasted); Turbo 1k–2k [DOC-local].
- **Syntax** (inference-side only — NEVER in captions): `(term:weight)`
  parsed in stage 2 only; `#` starts a comment (stripped before encode)
  except `\#` escapes and `#rrggbb` hex literals, which ARE legitimate color
  vocabulary [DOC-local].
- **Negatives**: stage 1 has real negative authority — FLATTEN negatives
  (comma-merge, no syntax); stage 2 SAFETYNET-wraps them. At CFG 1.0 the
  negative is mathematically unused [DOC-local; DOC — cierpliwy workflows].
- **Two-reference mode**: scene = image 1, person = image 2, FIXED order,
  one simultaneous pass beats chaining for two-person work [DOC — identity
  edit card].
- **Edit instructions are instructions**: the Identity Edit LoRA was trained
  on plain-language instructions with instruction captions, not
  scene descriptions — bare "Change the jacket to red" is on-contract;
  H3-style keep-lists are neutral-to-harmful off-contract (dials own
  preservation) [DOC + MEASURED-pending E-K3 prediction].

## 4. Sampler settings, resolutions, frames

| Lane | Steps | CFG/guidance | Sampler | Notes |
|---|---|---|---|---|
| T2I Turbo | 8 | 1.0 (guidance 0 in AnyPaint's recipe) | euler + `simple` | dims %16; turbo fixed shift mu=1.15 (use the Turbo Reference Sigmas node whenever denoise < 1.0) |
| T2I Raw | 28–52 | 4.0–4.5 (Krea guidance 3–3.5; ComfyUI cfg = guidance + 1) | euler + `simple` | TRAIN on Raw, RUN on Turbo |
| Instruct | 8–12 | 1.0 | euler/simple | ≤2 MP; two-person at 1–1.5 MP; at CFG>1 ground the negative with an empty-prompt encode of the same image (documented requirement) |
| Removal sub-recipe | ~20 | **3.0** | — | on **RAW** (Turbo's CFG-1 path unreliable for large deletions); `ref_boost > 10` breaks removals — cap UI ~6 |
| Refine (AnyPaint) | 8 | **0.0** | euler/simple | LoRA @1.0; VLM reference + K/V cache ON; white = generate, black = preserve; canvas %16; NO post-hoc source composite |
| Ostris inpaint | 8 | 1.0 | euler_ancestral + simple | LoRA @1.0, kv_cache ON (README-normative); negative = `ConditioningZeroOut`; black-fill the mask region BEFORE encode |

Preservation semantics that ARE the settings: AnyPaint restores known tokens
every step at matched noise (`known_at_sigma = σ·noise + (1−σ)·known`) with
the 32-px band as the blend — measured at the VAE floor (40–47 dB) on our
int8 stack [MEASURED E-K1]. Denoise-dial bands (generic paths): 0.2–0.3
subtle / 0.3–0.6 texture refresh / 0.7–1.0 regenerate; never ask low denoise
to erase (ghosting) [COMM Kombitz + DOC-local Kreatine]. Identity Edit is
NOT region-preserving — leak measured at 26.5 dB outside the edit region
[MEASURED E-K1]; the mask lane is the deterministic one.

## 5. LoRA / strength interactions

- Identity Edit dials are semantic, not strengths: `grounding_px` (384–768;
  lower = stronger edit, higher = stronger identity), `ref_boost` (1.0
  default; ~4 strong likeness; >10 breaks removals), `fit_mode`.
- **The recipe triple is correctness-critical**: encode carrier × transport
  × LoRA must match. Identity LoRA needs the real-timestep `index` carrier;
  pairing it with the t=0 carrier SILENTLY DESTROYS the reference region
  (meanAD 8.18 vs 50.06 measured; replicated 5.30 vs 40.06 via core nodes
  on our int8 stack) — plausible-looking output, no error [MEASURED ×2].
  Emit `reference_latents_method=index` with identity LoRAs (validation
  rule t8u00uu).
- Whole-pipeline patchers (identity/anypaint/ostris model patches) are
  mutually exclusive — one owner of `diffusion_model.forward` per graph
  [DOC-local D3 lesson].
- AnyPaint is a functional adapter, not a plain LoRA — stock importers
  break; quantized runtimes "may differ at pixel level" (measured CLEAN on
  our convrot) [DOC card + MEASURED].
- Pin `krea2_identity_edit_v1_2` by sha; a from-scratch v2 retrain was in
  progress at survey time [COMM].

## 6. Task recipes (presets)

- **Identity edit** ("change the outfit, keep the person"): Turbo 8/CFG 1,
  grounding_px 768, ref_boost 1.0, prompt = the bare instruction. Identity
  held 0.94–0.98 on-recipe [MEASURED]. Strong likeness: ref_boost → ~4.
  Semantic-interaction edits ("pick up X with Y") and full background
  replacement are the documented WEAK classes — route to Klein/Qwen
  [COMM A/B].
- **Object removal**: RAW @ CFG 3.0, ~20 steps, instruction "Remove the
  {object}"; cleaner far-field than Turbo [MEASURED E-K1]; or the mask lane
  (AnyPaint with an removal-shaped scene description).
- **Masked refine / detail repair**: AnyPaint @ defaults; prompt = the
  whole-scene style description ("a crisp 2-megapixel photograph of a
  sunlit kitchen, clean natural light, shallow depth of field") — the
  scene-style contract, NOT "fix this" [MEASURED E-K1 templating
  correction].
- **Masked content insertion** (something NEW goes in the region): ostris
  inpaint trio — black-fill region pre-encode; prompt describes what should
  appear in the masked region (style, colors, content); variant pick:
  default → mild (mask covers main focus) → strong (outpaint-leaning)
  [DOC — card].
- **Outpaint / canvas growth**: AnyPaint padding (any side) or Identity
  Edit's trained outpaint; canvas %16; padding = generated.
- **Person-into-scene composite**: two-ref mode (scene first, person
  second), one pass.
- **Pose re-staging**: thedeoxen pose controlnet (DWPose as image 1 through
  the ostris encode path; LoRA 0.8–1.0, drop to 0.6–0.8 if rigid, ~10 steps
  CFG ~1) [COMM card].
- **Adherence rescue**: Krea2T-Enhancer `strength` 1.0 + attention-weighted
  `(phrase:weight)` — registry-tier adjunct, interaction with edit LoRAs
  [UNK → E-K3].

## 7. Fundamentals — the triangle

- **Adherence**: dials dominate prose. grounding_px/ref_boost move
  edit-vs-identity far more than prompt structure; the model's open-release
  adherence gap is real — write the captioner's prose for CONTENT, use
  dials for behavior. Stage-1 weights don't exist: flatten syntax or accept
  it is inert there.
- **Quality**: prose density in the captioner enumeration (texture/
  quantity/spatial relationships); ≤2 MP working size (Raw direct caps
  ~1.2 MP on 24 GB; AnyPaint quant caveat measured clean). Style reference
  LoRA steers mood with trained-against content leakage.
- **Speed**: Turbo 8-step is ~1 min @2 MP; Raw costs a model swap (removal
  recipe only); LanPaint costs ~NumSteps× — deferred (GPL + distilled-model
  caveat + the strongest community testimony says it under-uses surrounding
  pixels).
- Trade-offs stated: identity-critical → Instruct on-recipe (fast, leaky
  outside intent); pixel-exact outside a region → AnyPaint (slower encode,
  scene-contract prompts); big deletions → RAW removal (model-swap cost).

## 8. Community-verified tips

- "Krea 2 isn't natively an edit model, so precision differs from Flux.2
  Klein or Qwen Image Edit" [COMM — detail-enhancer thread] — the honest
  per-lane framing users should see.
- Image-grounded `Text Encode (Krea2)` beats a plain prompt for
  inpaint-context fidelity [COMM — Gremlation, LanPaint thread].
- Identity-Edit likeness is "texture-faithful, proportion-conservative";
  distinctive facial geometry regresses; two-person faces drift together;
  local edits "can occasionally leak outside the target region" [DOC —
  card honesty lines; leak since measured].
- Pre-compute: `target_latent` wiring avoids per-step CPU VAE streaming
  [DOC — nodes].

## 9. Failure modes

| # | Failure | Fix |
|---|---|---|
| 1 | Recipe triple mismatch (identity LoRA on t=0 carrier) | Emit `reference_latents_method=index`; audit rule; silent-destruction class |
| 2 | Wrong prompt contract on masked lanes | AnyPaint = scene-style; ostris = region-content; per-lane templating |
| 3 | Edit leaks outside intent (Instruct) | Honesty label + mask lane when deterministic preservation is required |
| 4 | Removal fails on Turbo | RAW @ CFG 3 / 20 steps |
| 5 | ref_boost > 10 | Cap UI at ~6 |
| 6 | Post-hoc source composite over AnyPaint | Forbidden — the encode's boundary IS the blend mechanism |
| 7 | Text-only TE install | Gate on the VL tower (`qwen3vl_4b_fp8_scaled`) explicitly |
| 8 | VLM-weighted syntax in stage 1 / captions | Stage-2 only; lint captions for `(term:weight)` and `#` |

## 10. License pointer

Krea 2 Community License: derivative LoRAs inherit it; commercial use under
the revenue threshold with moderation + AI-disclosure duties (user duties,
surfaced at consent). Raw weights gated on the same license; nodes Apache/
MIT per pack. SFW-only training on Identity Edit; author disallows
non-consensual use of real people [DOC — card]. Registry rows in
[../licenses/registry.md](../../licenses/registry.md).

## 11. Sources

Internal: [krea2-edit-mode.md](../krea2-edit-mode.md) (+ E-K1 addendum),
[per-model-prompt-doctrines.md](../per-model-prompt-doctrines.md) §3,
[cierpliwy-krea2-inpaint-edit.md](../cierpliwy-krea2-inpaint-edit.md).
External (via those docs, all dated/tagged there): krea-2 technical report;
docs.comfy.org Krea 2 tutorial; conradlocke/krea2-identity-edit +
lbouaraba/comfyui-krea2edit; yijunwang2/krea2-anypaint + nodes;
ostris/ComfyUI-Krea2-Ostris-Edit + Krea2OstrisEdit; thedeoxen pose
controlnet; capitan01R/ComfyUI-Krea2T-Enhancer; Kombitz GGUF recipe;
myaiforce Krea-2-vs-Klein A/B; Krea AMA. Kreatine local code:
`core/edit_encode.py` (KREA2_TEMPLATE, Picture markers, budgets),
`core/weighting.py`, reference docs.
