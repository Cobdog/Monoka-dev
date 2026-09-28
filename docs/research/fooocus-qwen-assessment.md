# Fooocus-Qwen-Image-2.1 — a Fooocus-style shell built on our exact model (fresh-release assessment)

> Maintainer-requested look, 2026-09-27 ("another cool project just dropped"):
> [ogoun/fooocus-qwen-image-2.1](https://github.com/ogoun/fooocus-qwen-image-2.1).
> Revision read: **main @ `6621cd0` (2026-09-27)** — 103 commits, single
> author (ogoun), first commit 2026-09-21, i.e. a **six-day-old** project.
> No Flux task at capture time (maintainer places those). Sibling research:
> [qwen-image-2.1-assessment.md](qwen-image-2.1-assessment.md) — the family
> record; **two of its findings are corrected by this pass** (dated addendum
> appended there), [image-workbench-prior-art.md](image-workbench-prior-art.md),
> [seamless-blending-survey.md](seamless-blending-survey.md) (the VAE-tile
> finding below lands in its lane), [per-model-prompt-doctrines.md](per-model-prompt-doctrines.md).
>
> METHOD: full clone code-read — every `engine/`, `imaging/`, `prompting/`
> module, `fetch.py`/`residency`/`vae_tiling`, the UI layer structure, the
> tests inventory (49 files), `tools/experiments/mask_protocol.py` +
> `mask_local.py` + `pose_tile.py`, all 11 of their research notes,
> `docs/BENCHMARK.md`, README + README.ru + USAGE protocol sections,
> CHANGELOG entry-level. Web fetches: the official
> [QwenLM/Qwen-Image-2.1](https://github.com/QwenLM/Qwen-Image-2.1) README,
> the [Viggle/Qwen-Image-2.1-viggle-turbo](https://huggingface.co/Viggle/Qwen-Image-2.1-viggle-turbo)
> HF card, the lllyasviel/Fooocus license page. **No GPU/engine/installs**
> per the brief — every performance number below is *theirs* (RTX 3090,
> Windows, written methodology, first-run-discarded medians) and is tagged
> **[DOC-m]** (measured by them, not by us; our harness remains the judge of
> quality claims). Other tags: **[DOC]** verifiable in their
> code/README or the official sources; **[COMM]** community claim;
> **[SPEC]** our reasoning; **[UNK]** not stated anywhere fetched.

## 0. What it is

**Not a Fooocus fork.** A clean-room, MIT-licensed, single-file-package
Gradio app written from a spec (commit 1: "Fooocus-Qwen-Image-2.1 shell
specification", commit 2: a fifteen-task implementation plan) to be
*Fooocus-style*: one prompt line, one Generate button, everything else
behind Advanced **[DOC]**. Zero Fooocus code lineage — no `ldm_patched`, no
`args_manager`, none of Fooocus's SDXL inpaint machinery. The Fooocus
inheritance is exactly two things, both credited in their Acknowledgements:
the **interface philosophy** and the **style catalogue** (277 styles as
`resources/styles/sdxl_styles_*.json` copied from Fooocus) **[DOC]**.
Fooocus's own inpaint stack is deliberately *not* ported — "it existed for
SDXL, which does not understand masks; Qwen-Image-2.1 understands the mask
semantically" **[DOC — masking.py docstring]**.

| | |
| --- | --- |
| Author / age | ogoun, solo; spec 2026-09-21 → HEAD 2026-09-27, 103 commits **[DOC]** |
| Stack | Python, **Gradio 6.5.1**, diffusers **git-main pinned** at `cc8644b4` (QwenImage21Pipeline is in no PyPI release yet — same fact that forced our ComfyUI ≥ v0.37.0 gate), `transformers>=5.17` (Qwen3-VL TE), torchao 0.18.0, peft, onnxruntime (DWPose), opencv-headless **[DOC]** |
| Engine | **diffusers `QwenImage21Pipeline`**, subclassed with one override + an upstream-signature contract assert; NOT ComfyUI, not a node graph **[DOC]** |
| Feature set (works, code-read) | t2i (7 canonical ratios, 1–8 images/run), instruction edit in **four region modes** (mask / colour annotation / exact-region crop / whole frame), outpaint (any sides), up to 10 references with `<imageN>` tag addressing, per-cell **pose** (46-pose openposes.com catalogue + DWPose-from-photo, CPU, ONNX) and **sketch** tools, 277 Fooocus styles, AI-boost prompt rewriting (external OpenAI-compatible LLM), PNG-parameterised gallery + restore-from-any-PNG, EN/RU UI **[DOC]** |
| LoRA support | **None user-facing.** The only LoRA in the codebase is the Viggle turbo adapter; no content-LoRA slots **[DOC — absence, grep-verified]** |
| Tests / hygiene | 800+ GPU-less unit tests, ruff, Playwright `ui_check` (fake generator, six window sizes, brush latency, token-never-on-page), real-model smoke test, README screenshots rebuilt from live runs; research docs record honest retractions (the "turbo ×3.8 at comparable quality" claim is withdrawn in-doc for large frames) **[DOC]** |
| Community metrics | None cited — none can exist at six days (doctrine); solo-author but spec-first with measured justifications for nearly every constant |

**"Two-time conditioning"?** It does not exist here, and the question's
Fooocus frame resolves cleanly: Qwen-Image-2.1 is single-pass flow matching
with prefix-KV reuse; the Fooocus GPT-2-prompt-expansion *analog* is the
**AI boost** — the official Qwen PE-T2I/PE-I2I system prompts (shipped as
editable files) run against an ordinary external LLM (llama.cpp / vLLM /
LM Studio), not the 9B PE checkpoints **[DOC]**. That is exactly the
"keep our own expansion layer, skip staging two 9B models" call our family
record made **[CONFIRM]** — with working code and two measured prompt-side
findings (§3).

### License (this repo, verified file-level)

- **Code: MIT** (Copyright 2026 Ogoun) — permissive, port-clean for us
  under [docs/licenses/policy.md](../licenses/policy.md) **[DOC]**.
- **Model weights: Qwen Research License (non-commercial)** — and their
  README says so explicitly: "The MIT license on this code does not lift
  those terms" **[DOC]**. Honest posture; matches our family verdict.
- **Two provenance cautions inside the MIT claim.** (1) The 277-style
  catalogue is data copied from lllyasviel/Fooocus — **Fooocus today is
  GPL-3.0** (repo license verified 2026-09-27; the brief's "historically
  MIT" premise does not match the current repo) — so the JSONs are
  GPL-repo data redistributed under an MIT banner: a tension in *their*
  repo, and for us a **do-not-vendor-as-is** marker **[DOC]**.
  (2) `resources/prompts/*.txt` are taken verbatim from the official
  QwenLM/Qwen-Image-2.1 repo, which is itself under the **Qwen Research
  License** (repo LICENSE, verified 2026-09-27) — treat the prompt files
  like model assets: link/derive, never copy into our tree **[DOC]**.
- The openposes.com pose tiles ship in-repo with **no declared licence at
  the source site** (their own research note flags it) — irrelevant to us
  (we take no tiles) but it completes the provenance picture **[DOC]**.

## 1. The UX patterns worth stealing

The thesis — Fooocus's radical simplification transplanted onto an
*editing* model — survives the transplant, and the places where they had to
invent past Fooocus are the interesting parts for the workbench:

- **Presets are the only quality surface.** Quality = a single dial fusing
  resolution × steps (`LowQuality 1024²/16`, `MiddleQuality 1536²/28`
  default, `MaxQuality 2048²/40` from the model card, plus the two turbo
  tiers). No sampler/CFG/scheduler widgets at all; the negative prompt sits
  inside Advanced next to the honesty note that **at `true_cfg_scale=1.0`
  style negatives never reach the model** — "the UI must say this, else the
  silence looks like a malfunction" **[DOC]**. That note is a workbench
  copy-line verbatim.
- **Reference cells carry their tag as a live label.** Cells are labelled
  `<image1>`… following *filled-cell order* (cells 1, 3, 7 filled → tags
  1, 2, 3); a single reference is labelled "tag not needed" with the
  official rule quoted in the tooltip; in edit modes the labels renumber
  live as the region mode changes what counts as a condition image
  (source → mask → refs), and the status line tells you where the tags
  moved when a mask turns out empty **[DOC]**. This is the correct UX for
  the tag protocol (§3) and directly transfers to the workbench's refs
  strip.
- **Four region modes as one table**: painted mask (outside stays
  byte-exact — app-side composite), colour annotation (circle several areas
  in different colours, refer to them by colour in one prompt → several
  independent edits in a single pass), exact region (edit a padded crop at
  full detail, paste back), no region (whole frame) **[DOC]**. The
  annotation mode is the app-side productisation of Qwen-2.1's
  drawn-annotation capability — a lane our workbench spec's local-edit
  family doesn't yet name.
- **The seam warning.** After every masked edit the app measures how much
  of the frame *outside* the mask the model changed and the composite
  discarded (`clipped_share`, threshold Δ>16), and when that share is high
  it tells the user why there is a seam and names the escape hatch (turn
  off keep-outside) at the moment it happens, "not from the documentation
  after the fact" **[DOC]**. An honesty surface of exactly the shape our
  failure-mode doctrine asks for — measured, surfaced, actionable.
- **Reviewable AI boost.** "Rewrite now" renders the rewritten prompt
  *before* generation; the rewritten box is authoritative (whatever is in
  it is what the model receives); a text-only LLM gets a measured
  blind-note so it does not hallucinate image contents (51% → 4%
  hallucination rate on qwen3.8-27b, 80 answers/variant **[DOC-m]**).
- **Round-trip buttons everywhere**: result → editor (mask brush) /
  result → first free reference cell, from both tabs; full-size viewer
  with 100%/fit/pan/arrow-keys; PNG metadata as dual chunks (app JSON as
  source of truth + A1111-style `parameters` for third-party viewers);
  restore parameters from any PNG **[DOC]**.
- **Prompt-doctrine coaching in the status line**, not in docs: outpaint
  tells you to "describe the whole picture, not the operation" right after
  you extend the canvas — because "continue the scene" measurably produces
  transparency (§3) **[DOC]**.

## 2. The pipeline patterns (recipes, evidence-cited)

Backend is diffusers — its value to us is the recipes and the measured
operating points, not the plumbing. The plumbing lessons that generalise:

- **Subclass discipline**: one protected-method override
  (`_get_qwen_prompt_embeds`) + an `inspect.signature` contract assert that
  hard-fails if upstream diffusers changes shape, instead of copying the
  200-line denoise loop **[DOC]**. The embeds cache hooks the
  *pre-expansion* encode point, so a cache hit skips the whole
  text-encoder residency cycle.
- **Embeds cache keyed on prompt + pixel fingerprints** of the *scaled*
  condition images: seed/steps/image-count iteration is free on t2i; a
  preset change is a miss whenever condition images exist (the scaling
  changes the pixels, and embeddings from 1024 px refs are simply wrong for
  1536 px) — they document rather than hide the invalidation **[DOC]**.
- **Single-flight generation lock** with the three races written out
  (interrupt-flag reset, mid-denoise transformer eviction via
  `tensor.data` reassignment, plain VRAM overflow) — and the rule that the
  Gradio queue layer must not be load-bearing for the invariant **[DOC]**.
  Same shape as our runtime's contention guard; the write-up is the best
  short statement of *why* we have one.
- **Precision on a 3090-class card**: Unsloth's INT8 transformer is W8A8 —
  activation quantization makes it *slower* than bf16 (33.9 s vs 20.5 s at
  1024²); they strip activation quant (weights INT8, math bf16) → 21.6 s at
  6.8 GiB instead of 13.3 GiB **[DOC-m]**. INT8 is a VRAM lever, not a
  speed lever on this silicon (their microbench: `torch._int_mm` 59–65
  TOPS vs 71 TFLOPS bf16 **[DOC-m]**). Note their quant class differs from
  our convrot lane's — same conclusion though: official quant pair, no
  third-party dependency.
- **SageAttention**: −15…25% per full generation at ≥1536 px, attention
  microbench ×2.3 (cosine 0.99993), switchable at runtime; caveat — no
  `attn_mask` support, so the causal first text pass stays on the stock
  kernel **[DOC-m]**.
- **Turbo = the Viggle DMD LoRA done by the author's rules**: 6 steps, raw
  sigmas `[1.0, 0.9375, 0.875, 0.75, 0.5, 0.25]` (change steps only at the
  high-noise end), the shipped scheduler (base `shift_terminal: 0.02`
  "wrecks the last step"), `true_cfg_scale=1`, no negative, adapter loaded
  at runtime and **never merged** (bf16 merge irreversibly damages
  precision), lazy 1.3 GiB attach **[DOC + card, rule-for-rule]**.
- **The turbo grid, measured**: above the 1024² training area the distill
  emits an 8 px-period grid — one latent cell per token (Qwen-2.1 latents
  are not patchified) — spectral energy 1.2 at 1024² (≈ full model), 1.8–2.2
  at 1888×1280, up to 2.8 at 2528×1696, identical on bf16/INT8/Sage **and
  in the author's own reference pipeline** (1.23/1.48/2.14) — a property of
  the distill, not the shell; full-model finishing from low noise weakens
  (2.11→1.64) but does not remove it; Turbo-at-1024 + full-model hires
  (noise 0.45, 6 steps) gets grid to background level at the cost of
  softness **[DOC-m]**. Their answer: Turbo is *scoped to 1024²*,
  TurboDraft (768², 5.4 s) for prompt/seed iteration, then re-run the
  keeper on a full preset at the same seed **[DOC]**.
- **The reference-scale ladder** — their headline operating-point
  contribution. The pipeline's `output_resolution` does two things (frame
  size *if* h/w unset; condition-image scale *always*) — separable by
  passing explicit dimensions, which also dodges the frame-shrink trap and
  the 2720-vs-2752 drift from the card table at 16:9 **[DOC]**. Measured
  ladder, keyed on **condition-image count (source + mask + refs)**:
  ≥4 → 512 px, 2–3 → 768, 1 → 1024; frame stays at preset resolution
  throughout. Without it: edit at 1536 source scale **OOMs** a 24 GB card;
  5 refs at preset scale = 13 min/frame vs 38 s at 512 **[DOC-m]**. This is
  the community-validated setting for the exact dial our ComfyUI
  `TextEncodeQwenImage21` `resolution` knob exposes.
- **Tiled VAE decode with edge discard**: diffusers' `tiled_decode` blends
  across the whole overlap, folding the tile *edge* into the frame — the
  decoder lies by 7.1/255 levels in the last tile column and 9.1 in the
  penultimate row (left/top clean: causal convolutions) → thin coloured
  lines at `stride·k−10` on smooth gradients. Fix: discard (not blend) the
  corrupted edge — trim 64 px right/bottom, partition-of-unity
  accumulation **[DOC-m]**. Feeds our seamless-blending survey's
  decoder-edge lane directly.
- **Outpaint plumbing**: same mask-edit scenario with the new area as mask;
  new area pre-filled with `BORDER_REPLICATE` edge continuation ("an empty
  canvas makes the model draw the image border inside the frame"); canvas
  rounded *up* to /32 on growing axes only, slack given to growing sides
  **[DOC]**.

## 3. What they measured about the MODEL (the part that outlives the app)

Their research notes are small controlled experiments on Qwen-Image-2.1
behaviour, each with a falsifying metric — the most transferable content in
the repo. All **[DOC-m]** (their measurements; seed-pinned, small-N, but
with control arms):

1. **A black-and-white second condition image is read as an alpha matting
   by default.** The decoder's "nothing here" fill is purple — identical to
   the native-transparent showcase case. A *feathered* mask reliably makes
   the model render the white area transparent. **Rule: the model gets a
   binarised mask (pure white edit / pure black keep, sharp edges — the
   official Qwen recommendation); the composite gets the feathered one.**
   One mask, two representations, two consumers.
2. **Words about the mask make it worse.** Naming `<image2>` as a mask in
   the prompt *doubled* the out-of-mask spread (99.2% vs 46.9% of pixels
   touched) and crashed opacity to 80.6% — "keep the black" was read as
   "make the black alpha". The bare user prompt is the best protocol. The
   "explain the mask in words" direction is closed, measured.
3. **Any mention of transparency — even negated — triggers transparency.**
   "The result must be fully opaque" collapsed opacity to 13–51%. Rule:
   the edit prompt must contain no transparency/alpha/background-cutting
   vocabulary at all. (A *negative* prompt against transparency does work —
   99.9% opaque — but `true_cfg>1` doubles transformer passes: an
   emergency lever, not a default.)
4. **Hole-in-alpha is the strongest interior-edit encoding** (source as one
   RGBA image with the edit area transparent: outside-Δ 3.43 vs 3.53 for
   source+binary-mask, 1.8% stray) — and is *harmful for outpaint*: a
   transparent border is the sticker signature in training data.
5. **Outpaint prompts must describe the scene, not the operation.**
   "Continue the scene naturally" → 0% opacity (subject cut out as a
   sticker) on *every* encoding; a description of the desired finished
   picture → 100% opacity, same code, same seed class. Prompt-side fix,
   zero-cost.
6. **`<imageN>` is the official reference protocol.** From the official
   edit system prompt (shipped verbatim by the app, and consistent with the
   official README's `ratio_follow: "<image1>"`): N≥2 → tags
   **mandatory**, natural-language references ("the first image")
   forbidden; N=1 → tags forbidden; state each image's role explicitly
   (canvas vs material); output sizing picks the canvas by edit type
   (face-swap → body image, style transfer → content image, compositing →
   target scene). **This corrects our family record** (§4).
7. **Reference priority is copy-shaped**: for pose transfer, a skeleton
   *plus* a style-exemplar reference fails — the model copies the
   exemplar's pose and ignores the skeleton; skeleton-only with the style
   described in words holds the pose (DWPose error 0.7–2.6% of figure
   size). Same failure family as our REF2VA merge-to-one-subject hazard.
8. **One transformer token = 8×8 px** (latents not patchified) — explains
   both the turbo grid period and why /32 sizing is the natural grid.

## 4. Fit under our architecture

Our engine path is ComfyUI-native; this is a diffusers app — its value is
doctrine, recipes, and a few small MIT-clean algorithms. Menu calls:

**ADOPT**

- **The §3 mask/edit protocol as the workbench's Qwen operating doctrine**
  — binary-mask-to-model vs feathered-to-composite split, no mask words in
  prompts, no transparency vocabulary, scene-description outpaint prompts,
  hole-in-alpha as an interior-edit encoding option. All of it is
  app-side/graph-side translatable to our ComfyUI graphs today
  (condition-image slots + our own composite stage per the blending
  survey) **[SPEC]**.
- **The reference-scale ladder as the default for the `resolution` dial**
  (512/768/1024 keyed on condition count, frame at preset size) and the
  **preset ladder** (1024/16 · 1536/28 · 2048/40) as the Qwen lane's
  quality presets **[SPEC]**.
- **Port candidates (MIT, small, algorithmic)**: `imaging/masking.py`
  (refine/blend/region_box/paste_region/stitch/clipped_share) and the
  PNG dual-chunk parameters schema. Python→TS ports per our port
  convention (provenance headers, LICENSES row); no upstream bytes.
  `clipped_share` doubles as the workbench's seam-warning metric.
- **The turbo rule set** for whenever a fast lane is wanted on 24 GB:
  Viggle DMD adapter, 6-step sigmas verbatim, shipped scheduler, no merge,
  scoped to 1024², TurboDraft-style 768² draft tier for prompt/seed
  iteration feeding a full-preset re-run at the same seed **[SPEC]**.

**ADJUST**

- Workbench Qwen UX: tag-labelled reference cells (filled-cell order,
  live renumbering, "no tag needed" single-ref state), the four-region
  mode table (incl. colour-annotation multi-edit as a lane), the
  cfg-1-negative-inert notice, reviewable prompt expansion ("rewrite now"
  pattern) on our planner, clipped-share seam warnings, send-to-editor /
  send-to-references round-trips, canonical-dims table with explicit
  sizing (never derive frame size from a scaled reference) **[SPEC]**.

**CORRECT** (both appended to
[qwen-image-2.1-assessment.md](qwen-image-2.1-assessment.md) as a dated
addendum)

1. **The `<imageN>` finding.** Our family record inferred "no user-facing
   placeholder syntax; ref-role steering must be prose [SPEC — untested]".
   Wrong in mechanism: `<imageN>` tags are the *official, mandatory*
   multi-image protocol (N≥2), documented in the official PE/edit system
   prompt and present in the official README's `ratio_follow` field; role
   steering is tags + explicit role sentences. Day-one absence was real
   (the ComfyUI node exposes no tag UX) but the capability is native.
2. **The turbo absence.** "No turbo/Lightning variant [DOC — absence]"
   held on 2026-09-20; our own revisit trigger ("a Lightning/turbo
   distill") has since fired: **Viggle/Qwen-Image-2.1-viggle-turbo**
   exists (DMD LoRA, 6 steps, t2i + instruction edit with 1–3 refs,
   Qwen Research license) with an independent shell already shipping it.
3. Minor, for the record: the brief's "Fooocus historically MIT" premise —
   the Fooocus repo today is GPL-3.0; nothing rests on it for us, but the
   style-catalogue provenance marker above does.

**CONFIRM**

- "PE rewriters optional; keep our own expansion layer" — they run the
  official PE prompts on ordinary text LLMs with a measured blind-note
  patch for the no-vision case; no 9B staging **[CONFIRM of our SPEC]**.
- The size-derivation hazard ("any other size shifts the edit") — their
  explicit-dims guard exists because a scaled condition image otherwise
  shrinks the frame; the ComfyUI first-reference sizing is the same
  hazard class **[CONFIRM]**.
- The 10-reference ceiling is a card number, not a 24 GB operating point
  (1 ref @1536 = 21 GiB; 5 refs = paging) — the ladder is the honest
  envelope **[CONFIRM of our "2K-on-24GB unproven" caution, extended]**.

**NONE** — the diffusers/Gradio backend, the residency manager (our engine
owns residency), installers, i18n machinery. Also NONE on their style
catalogue as data: GPL-repo provenance, and styles are an SDXL-era idiom
being applied to a model whose negative channel is inert at cfg 1.

## 5. Verdict

| Axis | Call |
| --- | --- |
| **Verdict** | **ADOPT** — the measured Qwen-Image-2.1 operating doctrine (mask protocol, reference-scale ladder, preset ladder, turbo rules, tag UX) enters the workbench's Qwen-first wave as its defaults file; plus selective MIT ports (masking/composite math, PNG params). Bundled **CORRECT ×2** to the family record (tag protocol; turbo existence). |
| Why | It is six days of the most disciplined shell work we have seen on our exact committed family — every constant measured, every retraction recorded — and it solves app-side exactly the problems the workbench's Qwen lanes face first: how to mask, how to scale references on 24 GB, how fast each tier runs, how to address references, what the model does with transparency vocabulary |
| The gate | Unchanged from the family: **Qwen Research License** governs weights, turbo adapter, and the official prompt files (link/derive, never vendor). Style catalogue: GPL-3.0-repo data — not vendorable as-is under our permissive-only gate. Their numbers are RTX-3090/Windows/diffusers measurements — our 8189 testbed re-measures the load-bearing ones (mask protocol deltas, turbo grid, ladder thresholds) before they harden into graph factories |
| Revisit triggers | First diffusers release carrying `QwenImage21Pipeline` (un-pins their build; watch for protocol drift in the mask path); a turbo revision covering >1024² cleanly; our own harness runs on the Qwen lanes; any license change in the family |

Sources (retrieved 2026-09-27): repo clone `ogoun/fooocus-qwen-image-2.1`
main @ 6621cd0 (code, tests, `docs/BENCHMARK.md`, all `docs/research/*.md`,
README/README.ru/USAGE/CHANGELOG, `resources/prompts/*`);
github.com/QwenLM/Qwen-Image-2.1 README + LICENSE (Qwen Research);
huggingface.co/Viggle/Qwen-Image-2.1-viggle-turbo model card;
github.com/lllyasviel/Fooocus (license page, GPL-3.0).
