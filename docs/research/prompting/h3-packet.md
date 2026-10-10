# MiniMax H3 — research packet

> Packet date: 2026-10-03 · Flux task: vcks4mb · METHOD: corpus-first — the
> two official prompt guides as held in the library captures (pinned sha
> `42ed227`), the official `h3-prompt-writing` SKILL.md (fetched 2026-10-03),
> the docs.comfy.org prompt-guide page (fetched 2026-10-03), plus this repo's
> measured research (tranches 1–3, E-ED1, E-MD1, E-FC1, sigma thesis — all
> cited by path). Web fills tagged with fetch dates. Tags: **[DOC]** official
> source/shipped code, **[COMM]** reputable community claim, **[SPEC]**
> plausible-unverified, **[UNK]** nobody knows, **[MEASURED]** our own
> testbed numbers.
>
> **Weights (as run here):** `minimax_h3_fl2va_pruned_int8_convrot` /
> `minimax_h3_ref2va_pruned_int8_convrot`, TE `qwen3vl_32b` (int8/convrot
> class — NEVER nvfp4 with hybrids, see §5), video+audio VAEs, LightX2V turbo
> LoRAs, smhfacct b25-49 hybrid via scottmudge loader, Fun Control union
> branch (pruned int8). **License:** MiniMax H3 Community License — outputs
> usable, local COMMERCIAL use needs a MiniMax license sold through Comfy;
> territory excludes EU/UK/KR/US (Canada clear per standing resolution).
> License note: [docs.comfy.org](https://docs.comfy.org/tutorials/video/minimax/minimax-h3) + our
> [../licenses/registry.md](../../licenses/registry.md) rows.

---

## 1. What the family is

One 33B omni-modal "Omni-Transformer" (~13B in AdaLN branches), text
conditioned by Qwen3-VL-32B hidden states (layer 50), joint video+stereo-
audio output [DOC — HF card, via [transitions doc](../h3-transitions-and-latent-continuity.md) §2].
Modes and variants Monoka runs:

| Variant | Job | Sampler regime (§4) |
|---|---|---|
| FL2VA (T2VA/I2VA/FL2VA/L2VA) | text/first-frame/first-last/last-frame → video+audio | 20 steps (25 for motion), turbo 8 |
| Ref2VA (R2V) | ≤9 images + ≤3 videos + ≤3 audios → video (identity/style/structure/edit/continuation) | 20 steps; turbo 4–8; renders softer than I2V [DOC — AMA] |
| b25-49 hybrid (FL2VA base + Ref2VA adaln overlay) | reference work at FL2VA quality | the measured reference/identity default ([E-ED1](../h3-instruction-based-editing.md): +3.4 dB, ~2.5× identity-through-edit, zero wall cost) |
| LightX2V turbo LoRAs | speed tier | per-checkpoint steps/shifts — §4 |
| Fun ControlNet Union | control-video conditioning + masked video regen | guidance 1.0, 40 steps |
| Still lanes (frame-packet / T=1) | image generation/edit through the video model | packet (5/9/13/20/39f) default; T=1 fast tier |

## 2. How the model reads

- **The TE consumes a structured document, and H3 was trained on structured
  documents.** The official contract is *labeled sections* —
  `integrated_multimodal_description:` / `overall_soundscape:` /
  `non_diegetic_music:` for base modes; the six-section format for
  full-reference mode (§3). The model's prompt-grammar training distribution
  is sectioned English prose with shot blocks, speaker tags and quoted
  dialogue — "plain language leads to broken video, especially in Ref2VA"
  [COMM — AtlasCloud/xhinker, via [sampler-shaping](../h3-sampler-shaping-and-motion-control.md) §1b].
- **References bind by WIRING ORDER, not prose.** `<Picture N>` / `<Video N>`
  / `<Audio N>` ordinals are assigned in connect order (images, then videos,
  then audios); the prompt must cite them in that same order — ordering
  mismatch is the #1 multi-character trap [DOC — docs.comfy.org native;
  COMM — r/comfyui multi-character thread].
  - **Addendum (2026-10-10, CHAR eval): declare each reserved label ONCE.**
    A bind line names every position (`<Picture 1> <Picture 2> <Picture 3>
    show X, the same character in every image.`); later refer-backs go in
    prose WITHOUT brackets ("Pictures 1 and 2 show X's face") — a repeated
    bracketed `<Picture N>` REPLAYS the reference on H3. Measured into the
    omnichar-sdk's pinned prompt goldens [DOC — third-party golden,
    packages/omnichar-sdk `prompt.py`]; our round-trip eval pins it
    ([omnichar-char-eval-results.md](../omnichar-char-eval-results.md)
    G-PROMPT). Same source, voice lane: the `<Audio N>` bind reads "`<Audio
    1>` is X's voice. X speaks in this voice, lips moving in sync with every
    word." and a stored voice is sent only when the prompt has dialogue
    (quoted line or speech verb) — noted for the future voice lane.
- **Reference images are seen by the TE at 2 fps + full-res latent rows**;
  every reference is scaled to a 2048 px short edge budget (`ref_image_size`
  `match` = downscale to canvas for speed, `max` = keep up to 2048 short edge
  for identity) [DOC — code + docs]. Guide images (AddGuide) ride the DiT
  only and are INVISIBLE to the text encoder unless also wired into
  `ref_images` [DOC — multiframe tutorial].
- **There is NO negative branch.** Native templates sample through
  `BasicGuider` at cfg 1 — a negative prompt is skipped entirely, and worse,
  bans backfire: "no subtitles and no on-screen text" registers *text* as
  content. Suppression = positive phrasing ("the sign above the door is
  blank") or, in R2V, retention markers (`weak_reference`) [DOC — docs.comfy.org
  prompt guide, fetched 2026-10-03].
- **Motion bias is by design**: the base guide says the model "focuses
  heavily on how the subject moves, how poses change, how objects are
  manipulated" [DOC — skills/h3-prompt-writing references/base-en.txt].
  Stills prompts must actively spend the motion budget on the camera or
  suppress it (§9).

## 3. The prompting contract

### 3.1 Base modes (T2VA / I2VA / FL2VA / L2VA) — verbatim skeleton [DOC — library capture]

```text
<alignment instruction>          ← I2VA/FL2VA/L2VA only, FIRST line, then a blank line

integrated_multimodal_description: [Shot 1] <style>, <composition…>. …
[Shot 2] At 00:03.500, the camera cuts to …

overall_soundscape: <1–4 sentences, ambience + physical + non-verbal human sound>

non_diegetic_music: <1–3 sentences, instrumentation/tempo/dynamics — or N/A>
```

The alignment lines, verbatim (replace `S.SS` with the exact duration to two
decimals; `N` = the last shot index):

- I2VA: `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.`
- FL2VA: `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video.`
- L2VA: `How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the S.SS-second mark of the target video.`

Per-mode body doctrine [DOC — base guide]:
- **T2VA**: build the whole timeline; you may add scene/character/action/
  sound detail consistent with intent.
- **I2VA**: *first-frame anchor → action onset → continuous development →
  result/reaction*; keep identity, clothing, colors, objects, spatial
  relationships consistent from Picture 1.
- **FL2VA**: *first-frame state → observable intermediate changes →
  progressively narrowing differences → last-frame state*; favors a SINGLE
  shot (interpolation wants motion, not cuts).
- **L2VA**: *plausible preceding state → explicit action/transition path →
  gradual convergence in the final shot → last-frame landing*.

Body rules (all [DOC — base guide unless noted]):
- Style word opens `[Shot 1]`: `Cinematic`, `live-action`, `2D-animated`,
  `3D CG`, `claymation`, `watercolor`, `vintage film` (for keyframe modes,
  derive the style from the reference image; for T2VA take it from the text).
- Shots: `[Shot 1]` never has a timestamp; later shots `[Shot N] At
  MM:SS.mmm,` with strictly increasing cut times inside the duration. Cut
  verbs: `the camera cuts to / the shot cuts to / transitions to / changes
  to / switches to`; cross-dissolve/fade/wipe only when the user explicitly
  asks. A cut should introduce new information; for small framing changes
  prefer camera motion.
- **Camera = Motion Type + Amplitude + Speed**, written as a natural English
  action inside the shot: types `Zoom In/Out`, `Push In/Pull Out`, `Pan
  Left/Right`, `Truck Left/Right`, `Tilt Up/Down`, `Pedestal Up/Down`, `Arc
  Shot`, `Tracking Shot`, `Static Shot`, `Shake Slightly/Strongly`, `POV`,
  `Roll Clockwise/Counterclockwise`; amplitude `with small/large amplitude`;
  speed `at slow/fast speed`. Medium amplitude and normal speed are usually
  OMITTED. Example: `The camera pushes in with small amplitude at slow speed
  toward the folded letter in her hands.`
- Speakers: stable `(S1)`, `(S2)` IDs (compound `(S1,S2)` for group lines);
  identity phrase + ID + delivery OUTSIDE `<d>`; inside `<d>` only
  `[Language]` + the verbatim words: `The young woman with a quiet, breathy
  voice (S1) says: <d>[English] I get off at the next station.</d>`
  Voiceover uses the exact phrase `says in an off-screen voiceover` and each
  voiceover block is immediately followed by "while his/her lips remain
  completely closed." Dialogue crossing a cut uses `<scenetrans>` at both
  connecting points + an explicit continuity phrase (`continues seamlessly
  across the cut`); speech truncated by the video end uses `<cutoff>`.
- On-screen text in English double quotes, verbatim, untranslated: `A red
  neon sign reading "营业中" glows above the doorway.`
- `overall_soundscape`: 1–4 sentences, ambience + physical action sound +
  non-verbal human sound (wind, rain, traffic, footsteps, fabric, impacts,
  breathing, laughter). Never repeat dialogue/diegetic music here. `N/A`
  ONLY for explicitly requested total silence.
- `non_diegetic_music`: 1–3 sentences, instrumentation/speed/rhythm/
  dynamics — no abstract mood words, no emotional-function explanations.
  `N/A` when there is none.
- Write everything in English except dialogue/lyrics and visible text [DOC].

The official SKILL.md adds the rewrite checklist (fetched 2026-10-03) [DOC]:
total duration must match the request (4–15 s); labels consistent throughout;
each shot covers composition, subjects, environment, actions, camera, sound,
and WHERE referenced content takes effect; prohibited are plot summaries,
unresolved reference labels, and timing that doesn't match the duration;
prefer concrete detail over words like "cinematic"/"beautiful".

### 3.2 Full-reference mode (R2V) — the six sections, in order [DOC — ref-guide capture]

```text
subject_definitions:
<Subject 1> is the young woman in <Picture 1>, with long dark hair, a blue cardigan, and a thin silver necklace.

summary:
[reference generation + keyframe completion] one short paragraph, task-type prefix first

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 3]): fully_preserved - …
<Picture 2> ([Shot 1] first frame): fully_preserved - …
<Audio 1>: reference - …

detailed_description:
<style sentences before [Shot 1]>
[Shot 1] … <Subject 3> (S1) says, <d>[English] …</d> …

overall_soundscape: …
non_diegetic_music: …
```

Rules that gate quality [DOC — ref guide; COMM corroborated]:
- **Four label types**: `<Subject N>` (reusable visible content — people,
  scenes, clothing, styles, poses), `<Picture N>` (concrete frame/keyframe/
  composition anchor), `<Video N>` (edit source / continuation start /
  whole-video structure), `<Audio N>` (copied or referenced audio). One
  label keeps one meaning across ALL six sections.
- `<Subject N>` definitions absorb their source images ("is the woman whose
  appearance comes from `<Picture 1>` and whose walking motion comes from
  `<Video 1>`"); a standalone `<Picture N>` line exists only when the image
  IS a frame anchor. **Standalone picture lines lose attributes** — the
  First Date project's documented failure ("lost the character's coat")
  [COMM].
- Task-type prefixes (combine with ` + `, no repeats): `keyframe completion`,
  `reference generation`, `video editing`, `video continuation`,
  `audio reuse`, `audio reference`. Mere presence of a video doesn't make it
  `video editing`; a video that only supplies camera/rhythm is `reference
  generation`. Video edits begin the summary with `The target video is an
  edited version of <Video 1>.`
- Retention markers — visible: `fully_preserved`, `partially_preserved`,
  `attribute_transfer`, `weak_reference`; audio: `fully_copy`,
  `partially_copy`, `reference`, `weak_reference`. Markers must stay inside
  the role the label was given; don't count new plot as fidelity loss.
- `detailed_description` is 350–500 English words for generation tasks;
  style goes in 1–2 sentences BEFORE `[Shot 1]`; reference labels are cited
  at first appearance and wherever their role applies (`the shot begins from
  <Picture 1>`). A speaking subject keeps both labels: `<Subject 2> (S1)`.
  Audio-sourced verbal cues inside reused BGM use `<Audio N>` without
  inventing a speaker. `[unclear]` for unintelligible spans; standard
  punctuation only inside `<d>`.
- Speaker IDs are assigned once by order of actual vocal events and reused;
  never write `(Sx)` in retention_analysis.

### 3.3 Fun Control conditioning [DOC — fun-control-input-surface.md]

The control video is plain RGB frames (content selects the kind: DWPose
whole-body colored skeleton / depth / canny / HED / MLSD / anything custom);
the prompt stays a NORMAL H3 prompt describing the scene — control supplies
structure, text supplies content. `guidance_scale = 1.0` mandatory
(distilled; >1 double-applies guidance), 40 steps. Inpaint composes in the
same apply: `mask` (1 = regenerate, 0 = keep) + `source_video`.

### 3.4 The stills lanes (image gen/edit through the video model)

Frame-packet (default, reliable): generate 5/9/13/20/39 frames anchored on
the source, decode the packet, pick/score a frame. T=1 (fast): the T=1
latent + single-frame decode — decent with priors [MAINTAINER], ceiling =
softness. Edits are "a semantic regeneration of the source image, not pixel
inpainting" [COMM — ALLinONE]. The edit prompt shape is an **ownership
contract**: state the role of every connected picture, keep/change lists,
close with "Change nothing else" [DOC×3 — ethanfel/thaakeno/astropuzzo
READMEs, via [h3-image-workbench.md](../h3-image-workbench.md) §2.1].

## 4. Sampler settings, resolutions, frames

| Regime | Sampler + scheduler | Steps | Shifts (video/audio) | Notes |
|---|---|---|---|---|
| Base quality | `res_multistep` + `simple` | 20 (25 for better motion; simple shots hold at 12–16; high-freq detail benefits to ~50) | **12 / 3** | The canonical recipe — now a docs.comfy.org sentence [DOC — overview addendum 2026-10-02]. ≤576p authoring for adherence (§7) |
| FL2VA turbo (LightX2V) | `euler` + `simple` | 8 (v1.0 544p; 8-step also runs 4) | **12 / 3** (544p line) — the 768p line trains **6 / 3** | Per-checkpoint pairing is BINDING: never mix one profile's shifts with another's adapter [DOC — LightX2V README capture; COMM comfy.icu]. Our measured R2V turbo default: larryvrh v4_step600_ema, best at 8 steps [MEASURED — sampler-shaping addendum] |
| Ref2VA turbo | `euler` + `simple` | 4 (official) / 8 (larryvrh lineage — our winner) | 12 / 3 | Official 4-step NOT usable in merge mode at 4 steps on our stack (dark sepia collapse) [MEASURED] |
| PDMD-4-NFE (the pdmd2026 distill — Iwannapose v6 conversion @ strength 1.0) | `euler` + `simple` | 4 | **12 / 3** | No CFG; NO `pdmd, ` trigger prefix (confirmed unnecessary — the confirmation round ran the verbatim prompts and swept). 0.55× the turbo-8 wall at matched canvas; audio holds at 4 NFE. MEASURED-EYE-CONFIRMED the fast-lane default (Set P 6–0 at 39f; Set P2 6–0 at 243f recipe-fair) with the alternation caveat: metric-higher 6/6 at length but below the deciding eye's JND (salience caveat recorded) [MEASURED — [Set P](../gpu-batch-setP-results.md) / [Set P2](../gpu-batch-setP2-results.md) results] |
| Fun Control union | any + `simple` | 40 | 12 / 3 | guidance 1.0; strength 0.6–1.0 single, chained combined ≤1.0 [COMM RunComfy] |
| Still T=1 (astropuzzo recipe) | `er_sde`/`sgm_uniform` | 8 | 12 / 3 | hybrid b25-49 + turbo @0.75 + detail adapter @0.5 [COMM, shipped recipe] |
| Still T=1 (Fizgig recipe) | `er_sde` + `simple` | 20 (max-quality: 50, turbo strength 0) | — (no shift node in their graphs) | fl2va + larryvrh v4-600 @0.38; ≥3 MP best [COMM — fizgig addendum 2] |

- **Resolutions**: 32-px grid; native 768 px short edge = 1344×768 (0.98 MP)
  at 16:9 — skip the 1.0 MP preset (1376×768 exceeds the pixel-area cap)
  [DOC — docs.comfy.org overview capture]. **Adherence collapses above
  ~576p** (§7) — author low-res, re-render high-res through Ref2VA [COMM,
  five corroborating replies — HF discussion #65; **sourcing precision
  (2026-10-03): ONE discussion thread, several reporters — community
  evidence from a single venue, not independent studies, not yet measured
  by us**].
- **Durations**: 17k+5 frames at 24 fps (5/22/39/56…124…); `length` snaps
  down to the grid; ~15 s single-pass ceiling; 39 frames is the only
  phase-exact audio handoff length [DOC code + COMM — transitions doc §2].
  **The REQUEST range is 4–15 s (the base guide's own floor — §3.2's
  duration line): grid values below ~96f (4 s) are below the model's
  documented comfort floor.** They run (the transitions lane uses 39f),
  but sub-floor outputs are off the trained distribution — motion onset
  may be length-pressure, not model character. Screens wanting audio
  phase-exactness at ≥floor length must take the tradeoff explicitly
  (39f exact vs 107f+ standard derivation) [CORRECTED 2026-10-05 — the
  maintainer's catch; the batch's B/E/P cells ran at 39f — ledger
  Amendment 8b].
- **Sigmas**: shift maps σ′ = sσ/(1+(s−1)σ); the 12/3 pair is strongly
  high-noise-weighted (structure first, one long terminal texture hop);
  audio derives from the video schedule (audio_scale 4.0). Changing shift
  takes distilled checkpoints off-distribution; `sgm_uniform` is the
  shift-friendly scheduler when experimenting (`simple` floors early at high
  shift) [DOC — recomputed in [h3-sigma-schedule-thesis.md](../h3-sigma-schedule-thesis.md)].
- **Speed stack** (independent of prompting): SageAttention ~2×, `res_multistep`
  2.46× on denoise, Sol-Attn/EasyCache stack to ~70% cuts [COMM — ecosystem
  lane 2].

## 5. LoRA / strength interactions

- **Turbo adapters change the operating point** (steps/CFG/shift come
  along); concept/detail LoRAs scale a concept force; RefMod strength scales
  visual-memory sharpness (blur-latent blend, not noise) [COMM — malcolmrey].
- Stacking: two-LoRA stacks start ≈0.80–0.90, collapse ≈1.05+; working
  points turbo @1.00 + concept @0.52–0.60; the shipped T=1 recipe is turbo
  @0.75 + detail @0.5 [COMM, shipped].
- **Never mix FL2VA/REF2VA adapters or their shifts**; 8-step REF2VA uses
  video shift 12, not 6 [DOC/COMM]. Never merge distill LoRAs (three
  independent teams) [DOC ×3 — via viggle-assessment §3.4].
- **The hybrid loader trap**: nvfp4_awq TE + hybrid = "destroyed prompt
  adherence" that mimics a bad merge — root-caused to the TE, fixed by
  `qwen3vl_32b_minimax_h3_int8_convrot` [COMM — smhfacct discussion #1].
- Reference influence has NO shipped strength dial: control it with (a)
  subject-definition strength ("the stronger you describe `<Subject N>` the
  more stable the reference" [COMM]), (b) retention markers, (c) the native
  `visual_cond_noise_aug` payload key (default 0.999; <1.0 mixes seeded
  noise into conditioning rows) [DOC — model.py, via
  [h3-v2v-reanchor.md](../h3-v2v-reanchor.md) §3].
- **Pinned-row hazard**: turbo/few-step + step-skipping caches mispredict
  never-denoised conditioning rows — pinned-anchor/masked/chained work runs
  20+ steps, turbo OFF, caches OFF [DOC/COMM, measured house doctrine].

## 6. Task recipes (presets)

Recipes are the curated defaults; every one carries its regime from §4.
Where a recipe is constructed rather than sourced it says `[SPEC-derived]`.

### 6.1 Cinematic T2VA clip (the workhorse preset)
Settings: base, `res_multistep`+`simple`, 20–25 steps, shifts 12/3, ≤576p
authoring canvas, 124 f. Prompt skeleton (fill the slots):
```text
integrated_multimodal_description: [Shot 1] {style word}, {shot size} frames {subject} {action onset}. {environment + key props}. The camera {motion type} {amplitude} {speed} {target}. {continuing action / result}. {dialogue lines if any}
[Shot 2] At 00:0{N}.{mmm}, the camera cuts to {new information}…

overall_soundscape: {ambience sentence(s) covering the whole clip}. {one or two physical-action sounds}.
non_diegetic_music: {instrumentation, tempo, dynamic arc}. (or N/A)
```
Rules honored: audio budget FILLED every second (§9); one camera behavior
per shot; ≥124 f when camera motion must read [COMM — loopforge].

### 6.2 I2VA from a start frame
Same skeleton + the I2VA alignment line first; body = anchor description
(appearance/clothing/objects/spatial relationships preserved) → action →
development → result. Use the start frame's actual content as Shot 1's
opening description [DOC — base guide §3.1].

### 6.3 FL2VA (first+last) motion bridge
Single shot; alignment line with both marks; body = first state →
intermediate observable changes → narrowing differences → landing on the
last frame. This is also our measured best JOIN mechanism (36 dB class
splices) [DOC + MEASURED — transitions tranche 1 E1].

### 6.4 Multi-reference composition (R2V, identity-critical)
Six-section contract; identity refs wired FIRST (order = numbering);
`ref_image_size: max` (2048 short edge) when identity matters; hybrid
b25-49 base [MEASURED E-ED1]. `<Subject N>` definitions carry appearance;
ONE subject per definition; roles partitioned per ref (identity / outfit /
lighting / background). Failure mode to design against: refs of the SAME
subject merge into a hybrid — split roles across DIFFERENT subjects or use
one canonical ref [COMM — h3-image-workbench §2.2].

### 6.5 Video instruction edit (replace / restyle / relight / wardrobe)
Source clip as `<Video 1>` (frames only locally); summary prefix
`[video editing]` (`+ audio reuse` if its soundtrack stays); instruction in
`detailed_description` phrased as change + KEEP-LIST; retention markers on
everything preserved. The #1 failure is under-specification — "the model
helpfully redesigns the entire shot"; a short keep-list beats a long change
description; stacked edits get numbered and closed with one "keep everything
else the same" clause [DOC — Runware]. DomoAI's production framing:
**Change / Keep / Avoid** blocks [COMM]. Set width/height to the source's
aspect to hold framing [DOC — Runware]. Audio: native audio is re-generated
— direct it with the `Sound:`/soundscape fields, or wire `audio_mode:
preserve` / Audio1 clean-pinned (t=1.0) to keep it [DOC — LongMedia; DOC —
Viggle pin technique]. Weak spots (official): small on-screen text, exact
logos, frame-for-frame busy crowds; one change per call; shorter sources
preserve better [DOC — Runware].

### 6.6 Object removal / insertion (video)
Instruction lane: "Remove X, the space fills with Y" + keep-list (describe
what fills the space — never leave a void) [DOC — fal examples]. Deterministic
lane (when untouched regions must survive bit-exactly): Fun Control inpaint
(mask 1 = regenerate + `source_video`), SAM3-tracked masks for moving
regions; 40 steps, guidance 1.0; watch the mask-value silhouette trap
(constant 1.0 at strength 1.0 can collapse to silhouette) [COMM — wyzborrero].
Per-token `denoise_mask` (0 preserve / 1 regenerate) is the native
alternative — check the grid-artifact bug (#15981) per ComfyUI version [DOC].

### 6.7 Camera retargeting / re-camera
Prompt lane: camera line FIRST and explicit, exactly ONE named behavior;
strip words implying reveals/handheld/distance changes; "locked-off shot" /
"tripod shot" reportedly beat "stationary camera" [COMM — camera threads,
sampler-shaping §1c]. Geometry lane: Meridian-pattern (explicit geometry
render + generative refine) — see [propagation-packet.md](propagation-packet.md).
Zero-extra-weights lane (measured): AddGuide composites at frames 0/17/34
(the fidelity peaks) with direction UNSTATED in the prompt — guides own the
direction; beat the Fun Control sprite ceiling in E-MD1 [MEASURED].

### 6.8 Inpaint/outpaint (stills)
Stills outpaint: outpaint-geometry trick — paste the pose/source into the
canvas, outpaint the rest, describe by position ("her pose and movements
are the same as the man at left side") [COMM — bbaudio2024]. Stills masked
edit: masked refine composite (SolidMask → prefill composite pre-encode →
restore composite post-decode) — the restore IS the pixel preservation H3
lacks a sampling mechanism for [DOC-local — fizgig addendum 2, our lane].

### 6.9 Dialogue / voice
Speaker ID + `<d>[Language] …</d>` verbatim; identity phrase outside `<d>`;
voiceover formula + closed-lips clause; `<scenetrans>`/`<cutoff>`
continuity. Voice cloning rides `<Audio N>` as a timbre reference
(`<Audio 1> is the voice-timbre reference for <Subject 1> (S1)`) [DOC — ref
guide §2.4]. **Voice does not persist between generations — re-attach the
audio reference everywhere the character speaks** [COMM — First Date].
Lip-sync failures: drop `shift_audio` 4.00 → 3.00 [COMM — javawock7618].

### 6.10 Style / medium transfer
Style word opens the shot (or 1–2 sentences before `[Shot 1]` in R2V); a
style ref becomes a `<Subject N>` definition ("is the visual style of
`<Picture 2>`, its palette and brush texture") with retention
`attribute_transfer`. Community style embeddings (`embedding:name` — 10
official-folder triggers: `bullet_time`, `truman_show`, `four_seasons`,
`blooming_flowers`, `dark_magic`, `fire_breath`, `kiss_camera`,
`spiral_ascent`, `storm_magic`, `art_is_explosion`) are model-space style
presets [DOC — docs.comfy.org prompt guide, fetched 2026-10-03; unofficial
community assets by silveroxides].

### 6.11 Quality refinement / enhance (V2V re-render)
Per-window V2V re-render of a degraded chain: draft as `<Video 1>`
(+ canonical character refs in the same conditioning for identity — R2
geometry), instruction "re-render at full quality, no content change",
structure `fully_preserved`; hybrid base; ≤15 s windows (ref truncates to
target length); windows independent, never conditioned on each other's
output [DOC mechanism + SPEC arms — h3-v2v-reanchor]. Ceiling: R2V-class
soft; plan a stills-model detail stage above it.

### 6.12 Long-form / chaining prompt discipline
12–15 s sweet spot per segment; restate `subject_definitions` in full and
repeat camera/lighting/character wording VERBATIM every shot ("text pins
the category, pixels pin the instance"); contradictions render as UNIONS
(both people appear) [COMM — Motion Context/loopforge/joeygambino]. Hard
cuts + post for assembly; FLF-stills splice for invisible joins [MEASURED].
Re-attach voice refs per clip; score in post (`non_diegetic_music: N/A`
per clip is the loopforge production pattern).

## 7. Fundamentals — the triangle and the structure

**Adherence levers (what actually moves it):**
1. **Resolution is the strongest knob** — structure following collapses
   above ~576p (ignored cameras, moved characters, duplicated subjects);
   more steps do NOT repair structure; author low, re-render high via
   Ref2VA [COMM — single thread (HF #65) with several corroborating
   replies; not independent studies, not yet measured by us].
2. Sectioned structure + the official vocabulary beats length ("prompt
   structure beats prompt length"; six-block formula) [COMM].
3. Reference discipline: wiring order = citation order; per-ref roles;
   `<Subject N>` description strength scales stability [DOC + COMM].
4. Retention markers/keep-lists scope edits (§6.5) [DOC/COMM].
5. H3-Context-IR (the official hosted prompt compiler) is the sanctioned
   external adherence lever — API-only, never released as weights [DOC].

**Quality levers:** specificity where it counts (positions, light, text —
"only what's visible"); steps are AESTHETIC not structural (25 for motion,
up to ~50 for high-frequency detail); turbo costs motion + audio quality,
officially [DOC]; reference material quality is load-bearing ("feed it the
highest-quality reference material you have" — R2V renders softer than I2V)
[DOC — AMA].

**Speed levers:** turbo tiers (8/4 steps at the cost above);
`ref_image_size: match` instead of `max` (max is several-times-slower class
with many refs); SageAttention/res_multistep/caches. **The trade is
explicit: adherence-lean = low-res + full structure + base 20-step;
quality-lean = 768p + hybrid + detail stage; speed-lean = turbo with
pinned-row exceptions.** You rarely get all three — e.g. turbo suppresses
camera motion (sometimes a feature, §6.7).

**Structure principles:** camera line placement gates camera adherence;
specificity gradient = global (style/scene) → subject → detail; contradictions
become unions (never describe two states of one thing); every reference
label resolved; timing consistent with duration [DOC + COMM, per section].

## 8. Community-verified tips (tagged)

- Fill the audio budget or get gibberish: unspecified seconds get filled
  with mutter/speech; script ambience per second + `non_diegetic_music:
  N/A` is "the official way" to silence [COMM, multi-source — sampler-shaping §1c(a)].
- "Too high prompt adherence" → wooden acting; a loosen modifier preset is
  the community answer [COMM — r/StableDiffusion].
- Trademark-adjacent prompts bleed training priors (panda → Kung Fu Panda
  Po) — reword the subject [COMM].
- Grade references toward what the model renders (a 16–21 L*-too-bright ref
  underperforms); identity is not gradeable [COMM — loopforge, measured].
- Batch stills variance is expected — "5 images, one good"; selection is
  part of the pipeline [COMM].
- Style embeddings via `embedding:name` [DOC — PR #15697 mechanism;
  embedding assets COMM].
- Inline negative phrasing in the POSITIVE prompt does work where the guide
  corpus uses it ("No soft dissolves…", "Do not introduce garbled text")
  [COMM — fal 44-example corpus] — but see §9's burn-in caveat: naming a
  thing also teaches the thing. Prefer positive phrasing of the absence.

## 9. Failure modes (ranked by bite)

| # | Failure | Fix |
|---|---|---|
| 1 | Gibberish speech / unwanted dialogue | Fill every second with ambience; `non_diegetic_music: N/A`; explicit "No dialogue…" block as belt-and-braces; "locked camera, no head turns while speaking" |
| 2 | Under-specified edits redesign the shot | Keep-list + retention markers; one change per call; shorter sources |
| 3 | Adherence collapse at 768p | Author ≤576p; re-render through Ref2VA |
| 4 | Statue poses / no motion | Name micro-actions per subject; ≥124 f; avoid turbo when motion is the point |
| 5 | Unwanted camera motion | Camera line first, one named behavior, "locked-off shot"; background plates halve residual motion; 4-step turbo as last resort |
| 6 | Object morph/duplication | Six-block structure; restate the scene after naming a replacement; avoid contradictions; mask the region if persistent |
| 7 | Shot looping past ~20–25 s | Segment to 5–15 s; hard-cut in post; detect-and-cut |
| 8 | Text burn-in | Never quote text you don't want rendered; keep shot labels plain; append "No subtitles, no watermarks" (community) — and prefer positive phrasing |
| 9 | Same-subject ref merge (hybrid faces) | One canonical ref; contrasting anchors; role partition |
| 10 | Small faces mush | Medium/close framing; FaceRefine post-pass (see [supporting-cast-packet.md](supporting-cast-packet.md)) |
| 11 | Audio joins/cover-band at chain links | Pin audio clean (t=1.0) or `preserve`; 39 f phase-exact handoffs; de-click in post |
| 12 | Drift per chain hop (~0.06 ArcFace/hop; ~4% contrast/join) | Fresh last-frame anchors; self-reference frames; R2V re-anchor pass; color stabilize |

## 10. License pointer

MiniMax H3 Community License (weights): outputs usable; local commercial use
requires a MiniMax license sold through Comfy; territory excludes
EU/UK/KR/US; attribution + AUP duties; derivatives must improve
H3-family models only (relevant to our trainers). Viggle-Animate (H3
finetune) inherits the same class. Full text + verdicts:
[../licenses/registry.md](../../licenses/registry.md) rows; the qwen TE is
Apache-lineage; turbo LoRAs Apache-2.0 [DOC — LightX2V].

## 11. Sources

**Official [DOC]:** library captures
[minimax-h3-prompt-guide-base.md](../../library/minimax-h3-prompt-guide-base.md) /
[-ref.md](../../library/minimax-h3-prompt-guide-ref.md) (pinned sha
42ed227, fetched 2026-09-16); skills/h3-prompt-writing SKILL.md
(raw.githubusercontent.com, fetched 2026-10-03);
docs.comfy.org H3 prompt guide + native + multiframe + fun-controlnet
(fetched 2026-10-03); MiniMax platform API docs (H3-Context-IR); LightX2V
turbo README (library capture, 2026-10-02).

**Internal (measured/compiled):**
[h3-sampler-shaping-and-motion-control.md](../h3-sampler-shaping-and-motion-control.md)
(its E-MD1 + turbo bake-off addenda),
[h3-sigma-schedule-thesis.md](../h3-sigma-schedule-thesis.md),
[h3-instruction-based-editing.md](../h3-instruction-based-editing.md) (E-ED1),
[h3-transitions-and-latent-continuity.md](../h3-transitions-and-latent-continuity.md)
(tranches 1–2),
[h3-image-workbench.md](../h3-image-workbench.md),
[h3-v2v-reanchor.md](../h3-v2v-reanchor.md),
[fun-control-input-surface.md](../fun-control-input-surface.md) (E-FC1),
[ecosystem-2026-09.md](../ecosystem-2026-09.md),
[fizgig-h3-still-assessment.md](../fizgig-h3-still-assessment.md).

**Community [COMM]:** Runware editing guide (re-verified live 2026-09-25);
fal 44-example prompting guide; DomoAI editing guide; HF discussion #65;
loopforge.cc project pages + how-it-works; Motion Context README + issues;
malcolmrey h3-center guides (WTFPL); First Date project; r/StableDiffusion +
r/comfyui threads as cited in the internal docs above.
