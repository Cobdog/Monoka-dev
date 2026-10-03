# Anima — research packet

> Packet date: 2026-10-03 · Flux task: vcks4mb · METHOD: corpus
> ([per-model-prompt-doctrines.md](../per-model-prompt-doctrines.md) §1,
> harvested 2026-09-18) + the official model card fetched in full
> 2026-10-03 (huggingface.co/circlestone-labs/Anima). Tags: **[DOC]**,
> **[COMM]**, **[SPEC]**, **[UNK]**.
>
> **Weights (as run here):** `anima-base-v1.0.safetensors` (4.18 GB) + TE
> `qwen_3_06b_base.safetensors` (Qwen3-0.6B) + VAE `qwen_image_vae`
> (shared with Krea 2) [DOC — local MANIFEST; linked weights, anchored by
> manifest row]. **License:** CircleStone Labs Non-Commercial License —
> model and derivative WEIGHTS non-commercial; **generated images may be
> used commercially** (selling images, commissions, paid-product assets
> allowed; paid API hosting / monetized embedding disallowed without a
> license). Also a Derivative Model of Cosmos-Predict2-2B-Text2Image
> (NVIDIA Open Model License applies to derivatives) [DOC — card].

## 1. What the family is

The anime stills lane — the ONLY family in the stack where Danbooru tag
piles are the native prompt distribution. Hybrid prompting (tags + natural
language + mixes, thanks to random tag dropout in training) is the official
stance; Base ships unrefined with a plain default style unless artist/
quality tags steer it; an Aesthetic variant and a Turbo tier exist in the
family [DOC — card].

## 2. How the model reads

- **Trained on Danbooru tags, natural-language captions, AND mixes** —
  tags, prose, and interleaved mixes all work; this is the structural
  opposite of every other family here [DOC — card; COMM consensus].
- A small LLM text encoder (Qwen3-0.6B base) with a ~1k-token practical
  ceiling: NL mode is "at least 2 sentences", up to ~300 words — beyond
  that, adherence degrades [DOC].
- Tag dropout in training means not every relevant tag is required — the
  model interpolates within its tag space [DOC].
- **A real negative prompt exists** (unlike H3/Krea-turbo/Qwen-at-cfg-1) —
  it is a first-class mechanism here [DOC].

## 3. The prompting contract

**Quality prefix (verbatim default) [DOC]:**
```text
masterpiece, best quality, score_7, safe,
```
(Aesthetic variant: skip score tags; "masterpiece, best quality, " is safe
to keep.)

**Tag grammar [DOC — card + ComfyUI docs]:**
- Lowercase tags separated by SPACES (never underscores — underscored tags
  are out-of-distribution); score tags are the exception (score_7 etc).
- Order: `[quality/meta/year/safety tags] → [1girl/1boy/1other subject
  count] → [character] → [series] → [artist] → [general descriptors]`;
  arbitrary order within each section.
- Artist styles take an `@` prefix (`@big chungus`) — without it the effect
  is very weak.
- Prefer Gelbooru variants where the two boorus differ.
- Meta tags: `highres`, `absurdres`, `anime screenshot`, `jpeg artifacts`,
  `official art`; safety: `safe`/`sensitive`/`nsfw`/`explicit`; time:
  `newest/recent/mid/early/old` or a specific year.
- Quality-tag families: human-based (`masterpiece` → `worst quality`) and/
  or PonyV7-based (`score_9` … `score_1`), any combination works. Quality
  tags are effective but optional — omitting risks style blending in small
  LoRAs [COMM — HF #96].

**Natural-language mode [DOC]:** at least 2 sentences, ≤ ~300 words,
English only. With multiple characters: name the character, then describe
appearance.

**Dataset-tag prompts [DOC]:** start with `ye-pop` or `deviantart` on line
1; optional alt-text/title on line 2.

**Weighting [DOC]:** `(term:weight)` works but needs higher values than
SDXL — e.g. `(chibi:2)` for a visible effect.

**Negative prompt (verbatim default) [DOC]:**
```text
worst quality, low quality, score_1, score_2, score_3, artist name, blurry, jpeg artifacts, chromatic aberration
```

## 4. Sampler settings, resolutions, frames

| Tier | Steps | CFG | Sampler | Resolution |
|---|---|---|---|---|
| Base / Aesthetic | 30–50 | 4–5 | `er_sde` (neutral default); `euler_a` (softer lines, higher CFG tolerance); `dpmpp_2m_sde_gpu` (more creative/varied); `euler` (good with Turbo/Aesthetic) | 512²–1536² |
| Turbo | 8–12 | **1** | euler-class | same |
| Scheduler note | `beta57` (RES4LYF pack) helps painterly textures [COMM] | | | |

## 5. LoRA / strength interactions

- Character LoRAs: trigger token + generic subject token (`<trigger>,
  1girl`); visible improvement within ~500 steps of training — caption
  errors compound fast, so caption QA matters more per-step here [COMM —
  HF #96].
- Appearance words never in training captions for character LoRAs (they
  re-enter at inference) — the H3-character-template rule, independently
  converged here [COMM].
- `(term:weight)` needs high values (§3) — LoRA/keyword emphasis via
  weighting is blunter than SDXL practice.

## 6. Task recipes (presets)

- **Character portrait (tag mode)** [DOC-derived preset]:
  `masterpiece, best quality, score_7, safe, 1girl, {character}, {series}, @{artist}, {hair}, {eyes}, {outfit}, {pose}, {background}, {lighting}`
  + the §3 negative. 30–50 steps @ CFG 4–5, er_sde, ~1024².
- **Mixed mode (the best of both, per the training mixture)**: 1–3 NL
  sentences carrying subject/action/setting + a tag tail for count/style/
  meta: `A knight rests against a mossy stone wall in the rain, her
  cloak soaked through. 1girl, solo, armor, standing, rain, night,
  @{artist}, masterpiece, best quality` [DOC card + COMM #96 mixture
  doctrine; composition [SPEC-derived]].
- **Style exploration**: `@artist` prefix is the dial; combine 2–3 artists
  for blends (community practice [COMM — general danbooru-model practice,
  not Anima-specific: treat as folklore until measured]).
- **Safe-output default**: keep `safe,` in the prefix; add `sensitive`/
  rating tags deliberately, never by omission under a vague prompt (short/
  vague prompts produce unwanted content — the card's own warning) [DOC].
- **Text in image**: weak by design — single words, sometimes short
  phrases [DOC]; route text-critical anime work through H3 stills or Qwen.

## 7. Fundamentals — the triangle

- **Adherence**: tag completeness within the danbooru order (subject count
  FIRST — `1girl` vs `2girls` changes everything); character+series tags
  pull trained priors hard; NL mode needs 2+ sentences to anchor.
- **Quality**: quality prefix + @artist steer the unrefined base; CFG 4–5
  band; resolution 512–1536². No realism capability — do not fight the
  base with photoreal vocabulary [DOC].
- **Speed**: Turbo CFG 1 @ 8–12 steps.
- Trade-offs: tag mode = maximum control/consistency; NL mode = freer
  composition, worse count/style lock; mixes get both at the cost of
  captioning discipline.

## 8. Community-verified tips

- "Caption the way the model is prompted… Danbo, natural, mixes of those
  all work" — the community's own statement that doubles as our captioning
  doctrine [COMM — HF discussion #96].
- The community captioning stack (brief VLM prompt + image + tagger output
  → mid-size LLM refinement) mirrors our harness chain [COMM #92/#96].
- Vague/short prompts → undesired content: mitigate with safety tags +
  detail [DOC card].

## 9. Failure modes

| # | Failure | Fix |
|---|---|---|
| 1 | Photorealism requests fight the base | Not a photoreal model — route to Krea/Qwen/H3 |
| 2 | Long NL past ~300 words drops details | Hard cap; move excess into tags |
| 3 | Underscored tags inert | Spaces, always |
| 4 | Artist style barely moves | `@` prefix required |
| 5 | Weighting ineffective | Higher values (`(chibi:2)`-class) |
| 6 | Unwanted content on vague prompts | Quality+detail+safety tags |
| 7 | Weak text rendering | Single words only; route elsewhere |

## 10. License pointer

CircleStone Labs Non-Commercial (weights + derivative weights); outputs
commercially usable; NVIDIA Open Model License applies via the
Cosmos-Predict2 derivative chain; paid hosting/embedding disallowed
without a license. Registry row pending the family's first fetch (weights
arrived as linked disk assets, manifest-anchored) [DOC — card + MANIFEST].

## 11. Sources

HF card circlestone-labs/Anima (fetched 2026-10-03 — tag grammar, prefix,
negative, samplers, limitations, license, all verbatim);
docs.comfy.org Anima tutorial (via doctrines harvest);
HF discussion #96 (captioning doctrine, fast-learner caution) [COMM];
[per-model-prompt-doctrines.md](../per-model-prompt-doctrines.md) §1 +
§7; local MANIFEST weight anchors.
