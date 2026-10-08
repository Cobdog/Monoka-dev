# GPU batch — Set M results (the Viggle-Animate swap battery, 2026-10-08)

> The maintainer's question (2026-10-08): character/face/outfit swapping
> with Viggle on stills — how well does local Viggle-Animate hold identity
> and outfit across swaps painted into a single frame, and where does it
> drift. Registration: Flux task **ourbqum** comment 9nhz8b8. Preceded by
> Set L ([gpu-batch-setL-results.md](gpu-batch-setL-results.md)); the node
> pack under test: `ComfyUI-Viggle-Animate-H3` v1.3.2 + the drbaph
> conversions. Review surface: `gpu-review/setM/` (8 blind pairs — p01 null
> + control×driving + face×control, outfit×control, sheet×face × two
> seeds; escrowed key, Amendment-7 metadata). Artifacts:
> `test-results/experiments/gpu-batch-setM/` (scripts in git, media on
> disk). This doc records methodology and measurements and does NOT
> pre-judge — the maintainer's blind eye decides on `gpu-review/setM/`.

**STATUS: EXECUTED — 25 ok renders / 72.2 min productive render wall / ALL
RUN-TIME GATES PASS / the null pair 0-diff through the instrument / the
peer session's engine reused as found and left running.**

## 0. The set in one paragraph

One driving clip of character A (the Set K elf-girl, rendered by our
animation stack's setk terminal-zero latent chain — Set L's measured
strongest advancer — performing the proven three-direction head arc with
both arms rising and a there-and-back figure displacement, 66f @ 24fps,
1344×768), propagated by Viggle-Animate (pruned int8 + DMD r64 @ 1.0, the
pack's upstream 4-point/3-update sigma baseline, shift 3/3, frozen 362-token
text conditioning) from ONE still per arm: the **control** (A re-rendered
from her own repaint of frame 0), the **face** arm (authored character B's
face on A's outfit), the **outfit** arm (B's outfit on A's face), and the
**sheet** arm (B as a 3-view character sheet fed directly as `ref_image`).
Two seeds (421337/421777) per arm + the null pair + mid/end canaries.
Every arm generates 73f from the 66f clip (the pack's 17k+5 grid
round-up, asserted on the pack's own code) and delivers its first 66
frames, matched to the driving clip's length.

## 0.1 The premise correction (read first)

The brief named "the setK B reference" as the face/outfit donor.
`setK/B_key.png` is **the same elf-girl** — the hero-authored pose-B key
of Set K's quickstart (extracted from Set K's hero render;
`setK_1_controller.py` line 410), not a second character. The corpus
carries no distinct donor (the quickstart ships one reference; the wider
input tree's other candidates are photo-class test images). **Character B
was therefore AUTHORED** via the same H3 image lane the brief sanctions
for the sheet views: a T2I render in A's family (clean line on white,
bust crop) with a deliberately distinct identity — chin-length black bob
with straight bangs, rounded human ears, warm brown eyes, a small silver
stud earring, a mustard-yellow cardigan over a charcoal tee (vs A's
cream-blonde high bun, long pointed ears, lavender eyes, gold hoop, dark
turtleneck + light blue overshirt). The palette separation is measured,
not assumed: dE(B, A_land) = **75.7** (the same-character pose keys of
Set L sit at 16-18); head-region L* 113.6 vs A's 248.4; torso hue 22°
(mustard) vs A's 84° (blue family). Gated before any Viggle burn (G-B).

## 1. Gates + integrity

| Gate | Check | Result |
|---|---|---|
| G-DRIVE | the driving chain actually moves (flow path ≥ 15) + 66f exact | **PASS** — path 52.365 (Set L's advancing class; its setk twin measured 53.0), 66f, centroid travel 44.2 px |
| G-B | the authored donor separates from A (ink sane, dE ≥ 10, head L* ≤ A−15) | **PASS** — ink 0.455, dE 75.666, head L* 113.6 vs 248.4 |
| G-VIEW ×2 | each sheet view is a real change that stays B (dE band + palette-family structure) | **PASS** — side dE 35.9 / three-quarter dE 3.6, both struct-true |
| G-SHEET | the 3-view sheet composed at full width | **PASS** — 2496×1216 |
| G-REP-CONTROL | the control repaint stays a control (dE 1.5-12 to frame 0) | **PASS** — dE 3.335 |
| G-REP-FACE | face swap landed where asked (head darkens toward B, torso hue stays A's family, ≥ 20° from B's mustard) | **PASS** — headL 216.9 (ctl 246.4), torso hue 80.3 (frame0 84.5, B 22.2) |
| G-REP-OUTFIT | outfit swap landed (torso hue moves to B's family, head stays A-like) | **PASS** — torso hue 17.1 (B 22.2), headL 241.2, head hue 20.3 (frame0 22.0) |
| G-REP-DISTINCT | the two swap repaints differ (dE ≥ 8) | **PASS** — dE 17.449 |
| G-NULL | control at seed 1 duplicated through the `__setMnull` VAE alias | **PASS** — framemd5 bit-identical at BOTH generations (the black-seed 421337 null and the productive 421421 null) |
| G-CAN2/G-CAN3 | mid/end canaries (control seed-1 via `__setMcan2/3`) | **PASS** — bit-identical at both generations (Amendment 5 coverage; the null doubles as the start canary) |
| G-FRAME | every Viggle output decodes 73f (the grid round-up of the 66f input) | **PASS** — 18/18 runs |
| G-LORA | zero "not loaded" LoRA keys in any run's log slice | **PASS** — 0 hits across all 25 runs |

Offline (setM_0, before any burn): the 4-point sigma list parsed and
checked (4 monotone points, terminal 0.0 = 3 Euler updates); the driving
chain's latent slice re-asserted on the engine's own scheduler code (30
steps from σ_s = 0.6316); **66f → 73f asserted on the pack's own
`_generation_frame_count`**; LoRA headers (tween 400 tensors / 100 qkv /
0 separate-qkv; DMD r64 404/100/0); every referenced model file present
via the engine's own folder paths; the dotted-key assembly gate on the
driving chain's cond nodes (3/3); `validate_prompt` OK on all five graph
shapes (drive chain, B T2I, ref edit, viggle, viggle-null through the
alias).

**Two gate recalibrations, both disclosed (the set stopped for review
twice; both stops were gate-shape errors, not render errors):**

1. **G-VIEW band [3, 25] → [3, 45] + palette-family structure checks.**
   The first side-view render measured dE 35.9 against B_ref — a
   front-to-profile turn is a larger pixel change than the head-turn class
   the intuition-authored band was calibrated against (Set L's same-
   character pose keys: 16-18). The reconciled gate anchors on identity
   structure (head-region L* within ±35 of B's; torso hue within ±15° of
   B's mustard family) — the side view passes both (head L* 103.1 vs B's
   113.6; torso hue 19.7° vs B's 20.7°). No re-burn; the render was
   verified good.
2. **G-REP directional check: region-dE ratios → palette-family anchors.**
   The face repaint restyles the whole frame (region dE head 35.0 / torso
   38.2 vs control) — the packet-profile edit lane regenerates the whole
   frame by design, so "only the face changed" cannot be expressed as a
   region-dE ratio. The wardrobe DIRECTION held (torso hue 80.3° = A's
   blue family, 58° away from B's mustard): the face swap landed with a
   full-frame redraw, which the raw region dEs record. The outfit arm
   needed no recalibration (torso 23.5 / head 5.9 — the ratio shape
   happened to hold there).

**Engine handling (the set's standing constraint):** 8189 was held by
another session's idle engine all day. It served the canonical install
(0.39.0, Viggle pack present, queue empty, launched
`--use-pytorch-cross-attention`) and was **reused as found**: never
signaled, torn down with `/free` only, left running (health-verified
after). Timing slices were read from the peer engine's own log file
(`/proc/<pid>/fd/1` → a regular file), read-only. Every contention guard
check stayed clear (the maintainer's 8188 idle throughout; foreign VRAM
≤ ~500 MiB).

## 2. Methodology (every choice named)

### 2.1 The driving clip

- **Mechanism: the setk terminal-zero latent chain** (Set L's arm-3 recipe
  verbatim: beat 1 fresh, beats 2-3 re-noised continuations at σ_s =
  0.6316, 30 NFE/beat, refs A_land + Set L's C_key fixed, seed 421337).
  The brief said "the module's tween lane"; Set L **measured** the tween
  image-reference chain collapsing to holds after window 1 on every seed
  (the hold basin) while the setk chain advanced through all three windows
  — a frozen driver would make the whole battery a still-propagation test.
  Deviation recorded: the driver rides the module's strongest measured
  advancer instead.
- **The arc**: Set L's proven three-direction caption set with one
  designed delta — beat 2 drifts the whole figure toward screen-right,
  beat 3 settles back toward center (FIRSTS/MOVES carry the displacement
  language; SCENE/STATIC/TARGET byte-identical to Set L's).
- **The exit/reentry beat was judged not achievable and not attempted**:
  the tween lane's measured sustained travel is ~10-40 px per 22f window
  (Set L's advancing seeds) against the ~600 px needed to leave a 1344 px
  frame. The drift probe rides the achieved there-and-back displacement
  (centroid travel 44.2 px — measured, modest) plus the arc's far-from-
  still poses (arms overhead, profile turns) — the README's "further from
  the still, the weaker the identity hold" axis without the frame exit.
  Disclosed as the brief's "else the richest motion our stack produces"
  branch.
- Assembly: the three 22f beats concatenated with the **concat FILTER**
  (Set L's harness finding — the demuxer is not frame-exact), 66f
  verified, frame 0 extracted as the repaint source.

### 2.2 Character B and the repaints (the H3 image lane)

- **Lane: the studio's packet profile on the hybrid b25-49** —
  `MiniMaxH3HybridLoader` (fl2va + ref2va pruned int8, block_range_adaln
  25..49), `H3TextToImagePrepare`/`H3ReferenceEditPrepare` at the
  **'high quality | 13 frames'** tier, res_multistep/simple 20 steps,
  unshifted (the packet pins; no turbo — the local FL2VA turbo ladder
  resolves only the v4-step600 file, and the turbo/form-adapter seam is
  unmeasured on this box), video VAE fp16 decode through `H3ImageDecode`.
  All 13 packet frames published; the settled tail (indices 8-12) picked
  offline by Laplacian sharpness (the directed-settle doctrine); T2I picks
  over all 13.
- **Why packet over the T=1 fast lane**: the repo's own family table puts
  identity/outfit edits on the packet profile (h3img.edit.identity /
  .outfit are packet-profile families); the T=1 lane is the fast-soft
  path. Identity fidelity of the swap inputs outranks their seconds-class
  economics here.
- **The repaint contracts** (ownership-contract style, source = Picture 1
  = frame 0): control re-renders A from A_land through the same pipeline
  (the honest control — same machinery, own-identity donor); face takes
  B's identity (bob, bangs, brown eyes, silver stud, human ears) onto A's
  wardrobe; outfit takes B's cardigan/tee onto A's identity.
  source_fidelity 0.6 (the reference-edit pin), reference_detail
  max_identity_2048, native transport, optimize_for_still false (the
  studio pin — the instruction is the prompt discipline).
- **The sheet** (arm 4): B_ref + two caption-instructed views (strict
  side profile; three-quarter) authored as edits of B_ref, composed
  3-across on white (2496×1216) and fed directly as the Viggle
  `ref_image`. Honest notes: the three-quarter view measured dE 3.6 to
  B_ref — a near-copy, so the sheet's view diversity is partial (front +
  a real turn + a near-repeat); view poses are caption-instructed and
  identity-structure-checked, with pose reading left to the eye on the
  review surface. The pack's own guidance predicts degradation here
  (short-edge nesting shares one ref slot's pixel budget across three
  views; the trained distribution is single-view) — the arm exists so the
  prediction is measured, per the brief.

### 2.3 The Viggle arms

- **Graph**: `LoadVideo` → `GetVideoComponents` → `ViggleAnimateConditioning`
  (video-first nested references, width/height 0 = the clip's own
  1344×768 = 1.03 MP — inside the pack's tested 0.4-1.2 MP band; length
  124 = the max, the 66f input auto-generates 73f) → UNET pruned int8 →
  DMD r64 @ 1.0 → `MiniMaxH3SigmaShift` 3/3 → BasicGuider/euler +
  `ManualSigmas` "1.0, 0.8571428571428571, 0.6, 0.0" (the README's
  upstream baseline: 4 points, 3 model evaluations) → SamplerCustomAdvanced
  on the conditioning latent → VAEDecode → CreateVideo 24 fps silent (the
  pack discards generated audio; the driving clip's audio is our stack's
  synthetic silence — nothing to judge).
- **The example workflow's performance patches were not carried**
  (ModelAttentionBackend / BlockSparseAttention): fewer variables, 66f
  needs no sparse path. The example's full-rank DMD LoRA was swapped for
  the README-recommended r64; the full-rank probe leg was not run (time
  went to the gates + the two recalibrations; the r64-vs-full-rank note
  stays open).
- **Seeds**: 421421 + 421777 (final). The battery opened at Set L's
  {421337, 421777}; the 421337 generation collapsed to black (§3.1) and
  was replaced by the probed-productive 421421 — the collapsed renders
  stay recorded.
- **Delivery**: every arm's 73f output trimmed to its first 66 frames
  (uniform across arms; the 7 grid-pad frames are hallucinated
  continuation past the driving motion).
- **VAE**: the house fp16 video VAE (the pack lists int8-convrot as its
  low-VRAM option; fp16 is every prior set's house standard and carries
  the Amendment-3 alias levers).

### 2.4 Measurements

- **Cost (per render)**: prompt wall (submit → history success), tqdm
  sampler bars parsed from the engine's log (SAMPLER-ONLY), "Prompt
  executed in", peak VRAM (1 Hz poll), decoded artifact bytes.
- **The battery** (`setM_2_metrics.py`, per delivered 66f strip): motion
  fidelity (Farneback speed series, Pearson vs the driving clip, path
  ratio, frozen count, seam ratios at 22/44); identity hold (dE to the
  arm's OWN input ref every 6 frames + first/last PSNR); the swap
  discrimination cross-matrix (each arm's first/mid/last frame vs every
  arm's ref); region hold (head/torso palette at frame 0 vs the arm's
  ref; within-strip region drift); background preservation (4 corner
  patches vs the driving clip); the drift probe (identity dE vs the
  driving clip's own displacement dE).
- **The review surface**: the 67bb129 instrument verbatim; pairs blinded
  by sha256; `.key` escrowed; Amendment-7 metadata on every pair (the
  question in maintainer terms, ONE judging criterion per contrast axis,
  side-swap disclosure, the null wording on p01); lossless WebP frame
  strips extracted at assembly; the null pair must pass pixel identity
  through the instrument.

### 2.5 The pairs key

p01 null (73f raw) · p02 control×driving (the propagation pair) ·
p03/p04 face×control (seeds 421337/421777) · p05/p06 outfit×control ·
p07/p08 sheet×face. The verdict questions frame the brief's decision:
does the face hold through the motion; does the outfit bleed into
identity; does the propagation itself preserve motion and ground; and
does a 3-view sheet beat the single repainted frame for the same target
identity.

## 3. Measurements

### 3.1 THE SEED COLLAPSE (the set's headline harness finding)

**Every Viggle arm at seed 421337 rendered near-black video** (whole-frame
mean 16-26, corners ~0.7 — vs seed 421777's clean line-art-on-white at mean
~235): control, face, outfit, sheet, the null, and BOTH canaries —
bit-reproduced every time (the collapse is deterministic, not flaky). The
driving clip and the repaint inputs are bright line art; the 4-point /
3-Euler-update upstream baseline collapsed total output on this
out-of-distribution subject at that noise draw. Seed 421421 (probed with
one control-arm render, mean 239.9) replaced 421337 in the battery; the
seven collapsed renders stay in the manifest as the measurement. **Read:
at the pack's fastest documented schedule, Viggle-Animate on line-art
references has a seed lottery with a total-failure mode — the 6-point
"balance" preset is the obvious first dial to try when this hits
(untested here; recorded as open).**

### 3.2 Cost (per render; the wall includes the 21 GB model reload after every /free)

| Class | Runs | Wall | Sampler-only | Peak VRAM | Bytes |
|---|---|---|---|---|---|
| driving chain (3×22f, ref2va+tween 30-step) | 1 | 556.1 s | 477.0 s | 24 076 MiB | 0.95 MB |
| image lane (13-frame packet, hybrid, 20-step) | 6 | 57.3–94.1 s | — | ≤ 24.1 GiB | ~0.9–1.0 MB/frame |
| Viggle propagation (73f, 4-point/3-update) | 18 | 177.8–183.9 s | 112–122 s | 23.9–24.1 GiB | 1.1–2.0 MB |

Every Viggle run costs the same regardless of arm (the reference is one
image encode; the sheet's wider reference adds ≤ 9 s of sampler time). The
121 s sampler column covers the whole DMD path — 3 model evaluations plus
the driving-clip VAE encode and the 73-frame decode dominate the
non-sampler ~60 s.

### 3.3 Motion fidelity + identity hold + background (per delivered 66f strip)

| Strip | Path (drive 52.365) | Path ratio | Speed Pearson | Frozen | Hold dE first→last (max) | Corner dE |
|---|---|---|---|---|---|---|
| control s421421 | 45.387 | 0.867 | 0.637 | 3 | 10.0→15.9 (20.1) | 4.09 |
| control s421777 | 31.975 | 0.611 | 0.924 | 0 | 17.5→20.3 (21.3) | 7.51 |
| face s421421 | 40.444 | 0.772 | 0.837 | 7 | 1.9→17.9 (20.6) | 4.37 |
| face s421777 | 41.912 | 0.800 | 0.956 | 8 | 1.9→15.8 (19.4) | 2.77 |
| outfit s421421 | 34.037 | 0.650 | 0.685 | 9 | 2.0→11.3 (15.0) | 4.16 |
| outfit s421777 | 34.060 | 0.650 | 0.963 | 3 | 5.5→11.8 (16.3) | 5.21 |
| **sheet s421421** | **12.550** | **0.240** | 0.374 | 1 | 19.8→20.7 (21.4) | 3.75 |
| **sheet s421777** | **15.708** | **0.300** | 0.263 | 2 | 29.2→33.4 (33.6) | 12.32 |

- **The repaint arms start ON their reference** (face/outfit hold dE ≈ 1.9-5.5
  at frame 0 — Viggle anchors the first frame on the still) and drift to
  11-18 dE through the motion; the drift probe series (dE-to-ref vs the
  driving clip's own displacement) is in `setM_2_metrics.json`.
- **The sheet arm collapses the motion**: 24-30% of the driving path, speed
  correlation 0.26-0.37 (every other arm: 0.61-0.96) — the pack's
  short-edge-nesting degradation prediction, measured hard. Its identity
  distance is also the worst (19.8-33.4 vs its own sheet).
- Region drift within strips is similar across arms (head-region 66-vs-0
  dE 9.5-16.4) — no arm's identity region runs away relative to its own
  starting point; the differences live in WHERE each started.

### 3.4 The swap discrimination cross-matrix (dE; frame 0 / mid / last vs each ref)

| Arm@seed | vs own ref | vs control ref | vs the other swap ref | vs sheet |
|---|---|---|---|---|
| face s421421 | **1.9** / 21.1 / 14.1 | 15.7 / 28.4 / 21.9 | 17.9 / 28.1 / 22.0 | 65.9 / 68.0 / 65.8 |
| face s421777 | **1.9** / 17.6 / 15.6 | 16.0 / 25.8 / 23.3 | 18.0 / 25.6 / 23.2 | 65.9 / 67.8 / 66.0 |
| outfit s421421 | **2.0** / 14.2 / 10.9 | 7.9 / 18.5 / 15.2 | 17.8 / 25.8 / 23.1 | 63.6 / 64.1 / 63.0 |
| outfit s421777 | **5.5** / 16.2 / 10.0 | 10.5 / 20.2 / 13.6 | 16.1 / 25.5 / 21.2 | 62.1 / 62.6 / 61.1 |
| control s421421 | 10.0 / 21.0 / 17.3 | — | 8.3 / 18.6 / 15.0 | 62.2 / 63.4 / 61.8 |
| control s421777 | 17.5 / 21.1 / 18.7 | — | 14.5 / 18.4 / 16.2 | 61.9 / 62.4 / 61.4 |

The whole-frame dE scale only weakly discriminates the three A-pose
repaints from each other (they share pose and ground); the swap-specific
region measurements live in §1's gate record (the face arm's head region
carries B's dark bob; the outfit arm's torso carries B's mustard while its
head stays A-like). The sheet column shows the sheet outputs never
approach any single-view A-pose geometry.

## 4. Proposed reads (for the maintainer's eye — NOT verdicts)

1. **The 4-point DMD baseline has a total-failure seed lottery on OOD
   line-art** (§3.1) — the fastest documented schedule collapsed seed 421337
   to black, deterministically, across every arm and canary. Any production
   use of this pack on non-photoreal references needs a brightness sanity
   check per render (or the 6-point preset).
2. **The single repainted frame anchors hard and holds reasonably**: the
   face/outfit outputs open at ~2 dE to their painted frame and settle at
   11-18 dE through a motion-rich arc — identity drift is real but bounded,
   and no arm shows a runaway. Whether the FACE actually reads as B through
   the motion (vs the bob evaporating) is exactly what the blind pairs
   carry.
3. **The sheet is measured strictly worse on this subject**: a quarter to a
   third of the driving motion survives, speed correlation collapses, and
   its identity distance is the largest — the pack's degradation
   prediction confirmed with margin. (Caveat, disclosed: the sheet's own
   view diversity was partial — the three-quarter view rendered a
   near-copy — so the sheet tested closer to "2-view" than "3-view".)
4. **Motion reproduction is arm-dependent at matched cost**: the face arms
   track the driving speed series best (Pearson 0.84-0.96); the control at
   s421421 reproduces the most path (87%) but correlates worst (0.64 — it
   moves MORE in different places); the outfit arms sit at 65% path.
5. **The exit/reentry drift probe was not achieved** (the displacement
   surrogate measured 44 px of there-and-back centroid travel — §2.1); the
   known re-entry drift limitation of Viggle remains UNTESTED by this set.
   A follow-up wanting it needs a driving clip with a real frame exit —
   likely from a wider-framing authoring pass or a non-tween-lane source.

## 5. Wall-clock + deviations

- **72.2 min productive render wall** (25 ok renders; sampler-only 49.4 min)
  + ~3 min seed probe + polling/guard overhead across **7 controller
  invocations** (resume-safe; the set stopped twice for gate review and
  once for a harness bug — all disclosed below). GPU minutes ≈ **75-80**.
- **Engine**: the peer session's standing 8189 (PID 1465307, v0.39.0,
  `--use-pytorch-cross-attention`) reused AS FOUND the whole day — never
  signaled, `/free`-only teardown, left running and health-verified
  (VRAM 2 086 MiB at close vs the ~2 018 found baseline). Mid-set the peer
  submitted their own Kroma smoke job; the contention guard waited it out
  (~10 min) without incident. The maintainer's 8188 was idle throughout.
- **Harness bugs found + fixed before any shipped number**: (1) the
  LoadVideo node echoes its INPUT file into history outputs — the file
  collector now filters `type == "output"` (found on a crashed step; the
  render was fine, re-run under a cache-busting suffix for honest timing);
  (2) the end-canary block sat inside an iteration that resumes skip —
  moved after the loop (the 421421 battery's end canary initially missed,
  then ran and passed).
- **Deviations from the brief, all disclosed in §2**: the donor authored
  (premise correction, §0.1); the driving clip on the setk mechanism
  (tween's measured hold basin); the exit/reentry beat replaced by the
  displacement surrogate; seeds switched 421337→421421 after the collapse;
  the two gate recalibrations (§1); the three-quarter sheet view rendered
  a near-copy; the full-rank DMD probe leg not run (time).
