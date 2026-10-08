# GPU batch — Set L results (the continuation comparison, 2026-10-08)

> The four-arm comparison the strategic review prescribed
> ([latent-continuation-strategic-review-2026-10-08.md](latent-continuation-strategic-review-2026-10-08.md)
> — "The recommended v1 decision" and "What the spec must not miss" #5).
> Registration: Flux task **ourbqum** comment 93u9b2m. Preceded by the
> feasibility audit
> ([latent-continuation-feasibility-audit-2026-10-08.md](latent-continuation-feasibility-audit-2026-10-08.md))
> and Set K ([gpu-batch-setK-results.md](gpu-batch-setK-results.md)).
> Executor: a108cf59ed4198235. Review surface: `gpu-review/setL/` (13 blind
> pairs — p01 null + the four arm-pair combos × three seeds; escrowed key,
> Amendment-7 metadata; the metadata quartet in git, media on disk).
> Artifacts: `test-results/experiments/gpu-batch-setL/` (on disk).

**22 renders / 22 ok / 158.8 min productive render wall (160.2 min
controller wall) / three seeds, matched across arms / ALL FOUR RUN-TIME
GATES PASS / teardown: engine exited, zero orphans of ours (see §5) /
every output's frame count equals its designed window.**

## 1. Gates + integrity (all PASS)

| Gate | Check | Result |
|---|---|---|
| G-NULL | tween w1 s1 duplicated through the `__setLnull` VAE alias | **PASS** — framemd5 AND audio md5 bit-identical at run time; **0 px through the instrument** (p01, 22 frames/side) |
| G-CAN2 | mid-set canary (tween w1 s1 via `__setLcan2`) | **PASS** — bit-identical |
| G-CAN3 | end canary (via `__setLcan3`) | **PASS** — bit-identical (Amendment 5 start/mid/end coverage complete; the null doubles as the start canary) |
| G-BEAT1 | the setk chain's beat-1 output vs tween w1 s1 (same seed/conditioning/schedule, different graph context) | **PASS** — bit-identical: the latent chain's beat-1 path is uncorrupted AND cross-graph-context determinism holds on 0.39.0 |
| G-KEYC | the hero-authored C key's distance from A (a broken far key stops the set before the burn) | **PASS** — dE(C, A_land) = 16.16 (floor 6) |
| G-LORA | zero "not loaded" LoRA keys in any run's log slice | **PASS** — 0 hits across all 22 runs |
| G-FRAME | decoded frame count == designed window per output | **PASS** — 22/22/22 (tween, setk beats), 73 (single), 39+34 (mctx windows) |

Offline (setL_0, before any burn): the sigma slice asserted on the engine's
own scheduler code (30 steps from σ_s = 0.6316); LoRA headers 400 tensors /
100 `qkv_proj` / 0 separate-qkv; the caption lint clean; **the mctx window
arithmetic asserted on the installed pack's own functions** (39f = 12
latent steps, the 22f tail = 7 steps starting at cycle position 5, 56f =
17 steps, 22 < 56 so the node accepts the context); the dotted-key
assembly gate 9/9 cond nodes; `validate_prompt` OK on all five graph
shapes. The Motion Context nodes registered on the shared 0.39.0 install
and **ran clean in-engine** (the pack's layout contract passed on first
use).

**Harness findings (load-bearing for future drivers):**

1. **The ffmpeg concat DEMUXER is not frame-exact on these outputs** —
   three 22f clips demuxed to 67 frames (mp4 container duration
   truncation, the same class as the grid-trim+2 training lesson). The
   delivered strips and any future exact-length assembly must use the
   concat FILTER (`[0:v][1:v][2:v]concat=n=3:v=1`), which is
   frame-count-exact. Found at strip assembly, before any metric shipped.
2. The teardown's "refused to die" was its own 180 s patience limit (the
   Set K precedent); the engine process exited and no GPU process of ours
   remained — verified by final process state, not absence of the message.
3. Mid-set, the box's desktop session returned (the user's
   electron/vesktop/chromium GPU processes, ~0.5 GiB) and a separate
   session launched its own idle 8189 engine — every gate stayed
   bit-identical through both events (the canary chain proves the render
   path was unaffected); the improved contention guard now checks FOREIGN
   VRAM residency per submit, not just queue state.

## 0. The set in one paragraph

One character (Set K's A references — the elf-girl bust drawing, clean line
on white), one arc designed NOT to complete in a 22f window: the head goes
screen-right → toward camera → screen-left → back toward camera (three
direction changes) while both arms rise overhead, then the left arm lowers.
Four mechanisms carried the SAME arc at matched DELIVERED duration (66f @
24fps = 2.75 s) with the SAME three seeds (421337 / 421421 / 421777) at the
Set-K operating point (ref2va pruned int8, tween LoRA @ 1.0, euler/simple 30
steps, BasicGuider no CFG, shift 12/3, 1344×768): the **tween**
image-reference chain (3×22f, promoted near refs), the **single** longer
generation (1×73f legal 17n+5 window, delivered-trimmed to 66f), the
**setk** terminal-zero re-noising chain (3×22f, the setK_lib recipe
VERBATIM — no m-scalar), and **mctx** Motion Context tail conditioning
(39f fresh + 56f window carrying the previous latent's 22f tail as pinned
never-denoised conditioning, head trimmed → 34f new). The maintainer's
blind eye-review decides on `gpu-review/setL/`; this doc records
methodology and measurements and does NOT pre-judge.

## 1. Gates + integrity

PENDING (the gate table: G-NULL / G-CAN2 / G-CAN3 / G-BEAT1 / G-LORA /
G-FRAME / G-KEYC, offline roster results, harness findings).

## 2. Methodology (every choice named)

### 2.1 References and the arc-end key

- **Reference 1 = `setK/A_land.png`** (the start key pre-composed on the
  1344×768 canvas), not the full-resolution portrait `A_key.png`: like-for-
  like geometry with the delivered strips and the metrics' anchor (Set K's
  own `concat_axes` used A_land for exactly this), and the ~193 s
  ref-encode class instead of the portrait's ~394 s. Disclosed as a
  deliberate deviation from Set K's tween01 (which used the portrait).
- **Reference 2 = the arc-end key C, authored ONCE by the hero adapter**
  from A_land with a whole-arc caption (the Set K key-authoring pattern),
  shared by every arm and every seed — C is conditioning material, not a
  per-seed variable; the hero render is counted once as shared setup cost.
  The **G-KEYC** gate (dE(C, A_land) ≥ 6, OpenCV Lab) stops the set before
  any arm burns if the extracted key is a near-copy of A. No mid-set vision
  checkpoint ran (the mission forbids subagent dispatch; the structural
  gate substitutes — disclosed).
- Tween arm windows 2-3 promote their near reference to the previous
  window's extracted last frame (`setL/tw_s<seed>_w<k>_last.png`) — the
  setK tween recipe verbatim. The setk/mctx/single arms keep references
  FIXED (A_land + C) per their recipes.

### 2.2 Window arithmetic (matched delivered duration)

| Arm | Rendered windows | Delivered | Notes |
|---|---|---|---|
| tween | 3 × 22f (separate prompts, promoted nears) | 66f exact | the incumbent chain |
| single | 1 × 73f | 73 → trim 66 | the cheap dark horse; the adapter's beyond-22f behavior IS the tested unknown |
| setk | 3 × 22f (one chained graph) | 66f exact | setK_lib latent recipe VERBATIM: beat 1 denoise 1.0; beats 2-3 latent_image = previous SCA output, fresh noise seed+100+k, steps 30/denoise 0.125 (σ_s = 0.6316) |
| mctx | 39f fresh + 56f conditioned | 39 + (56−22) = 73 → trim 66 | Motion Context: 22f tail context (< 56f target — the node refuses context ≥ generation), head trimmed by the pack's own Trim node |

- **Why mctx is 39+56 and not 56+56:** two conditioned 56f windows deliver
  68f new but need a ≥22f predecessor to pin, and a fresh 56f first window
  delivers 56f on its own — 56+34 = 90f rendered for 66f delivered wastes
  24f of arc. 39f (a legal 17n+5 point) + one conditioned window renders
  exactly 73f and trims 7f of settle — the minimal-waste composition of the
  node's grid. The 7f tail trim is disclosed: every arm delivers its FIRST
  66 frames of arc traversal.
- **The latent hand-off inside the mctx graph is wired directly** (window
  1's `SamplerCustomAdvanced` output → window 2's `context_latent`), not
  through the pack's Save/Load disk pair. The Save/Load nodes exist for
  interactive one-clip-per-run cycling; in a batch driver the direct wire
  hands the node the SAME latent object with no disk hop. Node semantics
  identical; disclosed.
- **Arm 4 follows the pack's documented conventions** — context_length 22,
  audio_context_length 24, `context_latent` path, Trim with `match_tail`
  on, references left alone (the node's reference-mode contract), no
  Spectrum, no turbo (the full 30-step tween adapter rides it — testing
  exactly the untested "keyframe-adapter cadence/identity under Motion
  Context" the review flagged). The pack prescribes no sampler, so the
  Set-K point holds — keeping base/adapter/sampler uniform across arms so
  only the continuation mechanism differs. Recorded per the brief.
- **Prompt-time convention (the node's documented budget rule):** window
  2's caption times refer to the SAMPLED 56f window — the pinned head
  occupies its first 0.92 s, and the phase-3 motion is authored "from the
  1.0-second mark". The single arm's caption paces the arc to complete by
  2.75 s of its 3.04 s sampled window (the last 7 sampled frames are the
  settle).

### 2.3 Captions (compiler-shaped, dialect-clean)

All captions follow `shared/animation/compiler.ts`'s tween template shape
(newline-joined SCENE / FIRST FRAME (Reference 1) / TARGET END FRAME
(Reference 2) / MOVEMENT / STATIC, the v2 STATIC = fixed hold + authored
preservation), the hero key-author rides the hero template. Byte-identical
SCENE and STATIC across every tween-shaped caption; byte-identical TARGET
(the C pose) everywhere. Positive tokens only; facing as closed-vocabulary
terms; no `landing <progress>` token (Set K measured the dial dead;
compiler v2 dropped it). The setk arm's beats ride the SAME caption
material as the tween arm's windows (matched caption-content by
construction — the setK rule). Full texts: `setL_captions.py` (the
authored artifact).

### 2.4 Seeds, null, canaries

Three seeds, identical across arms; continuation noise = seed+100+k (the
setK convention). **G-NULL**: tween w1 s1 duplicated through the
`__setLnull` VAE alias (a fresh cache-busting signature per Amendment 3 —
identical graphs are cache SERVES, not renders) must be bit-identical
(framemd5 AND audio md5). **G-CAN2/G-CAN3**: the same render through
`__setLcan2`/`__setLcan3` at mid-set and end (Amendment 5's start/mid/end
coverage; the start canary is the null itself). **G-BEAT1**: the setk
chain's beat-1 output must be bit-identical to tween w1 s1 (same seed,
conditioning, schedule; cross-graph-context determinism — Set K's G-BEAT1
pattern). **G-FRAME**: every output's decoded frame count equals its
designed window (the silent off-grid clamp trap). **G-LORA**: zero
"not loaded" LoRA keys in any run's log slice (the Set P silent no-op
trap).

### 2.5 Measurements

- **Cost (per render):** prompt wall (submit → history success), the tqdm
  sampler bars parsed from the engine log (SAMPLER-ONLY elapsed — the
  sprint's timing-boundary lesson: not decode/encode/polling), "Prompt
  executed in" totals, peak VRAM (1 Hz nvidia-smi polling thread), decoded
  artifact bytes. The wall-time profile settles the review's "~2× is a
  warning not a law" note: the tween arm's per-window totals include a
  model reload between prompts (the /free discipline) while the setk/mctx
  chains run their windows inside one prompt — the sampler-only column is
  the like-for-like number, and both are published.
- **Continuity (per delivered 66f strip, scripted offline —
  `setL_2_metrics.py`):** optical-flow speed per frame (Farneback, 2×
  downscale) and summed-flow direction; per-22f-segment path length (pose
  advancement per window); frozen/duplicate frame count (consecutive dE <
  0.35) and longest frozen run; tail-12 mean speed (does motion die?); the
  held-drawing on-twos signature (fraction of frames matching the frame
  two back better than the frame one back) + the setA alternation metric;
  boundary continuity at every internal seam (tween/setk at 22+44, mctx at
  39, single has none — its "boundary" is the 73→66 delivery trim):
  speed ratio and circular direction delta across the seam plus setA's
  seam ratio; color drift (per-frame L* and chroma series; dE-to-frame-0
  curve); landmark identity (first/last frame vs A_land and C_key — dE,
  PSNR, ArcFace). The battery is validated against ground truth: on Set
  K's fl2va fill it reproduces the recorded alternation 0.041 exactly.
- **The review surface:** the 67bb129 instrument verbatim
  (`review.html` = the template copy; `pairs/` blinded L/R by sha256;
  `pairs/.key` escrowed; Amendment-7 metadata on every pair — question in
  maintainer terms, ONE judging criterion naming the review's axis order
  (advancement → continuity → style → identity), side-swap disclosure,
  the null wording on p01). Frame extraction at assembly (ffmpeg
  sequential, lossless WebP strips); the null pair must pass pixel
  identity through the instrument before the set counts.

#### 2.6 The pairs key

p01 null · p02-p05 seed 421337: tween×mctx, mctx×setk, single×tween,
single×mctx · p06-p09 seed 421421 (same four combos) · p10-p13 seed
421777 (same four) — the brief's minimum pair set × the seeds. The verdict
questions frame the review's decision rule: **tail conditioning wins → the
extension lane earns the spec; setk wins-at-variations → ship it under
that meaning; neither beats the existing workflows → defer continuation.**

## 3. Measurements

### 3.1 Cost (the cost column; means over the three seeds, per delivered 66f strip)

| Arm | Renders | Prompt wall (sum) | Sampler-only (sum) | s/step by window | Peak VRAM | Bytes |
|---|---|---|---|---|---|---|
| tween | 3 prompts | 589.0 s | 488.3 s | 5.3-5.7 (22f) | ≤ 24.1 GiB | ~0.6 MB |
| setk | 1 prompt | 571.8 s | 494.0 s | 5.3 / 5.8 / 5.8 (22f beats) | ≤ 24.1 GiB | ~0.8 MB |
| single | 1 prompt | 686.9 s | 635.3 s | 22.7 (73f) | ≤ 24.1 GiB | ~0.9 MB |
| mctx | 1 prompt | 1079.4 s | 1006.7 s | 10.3 (39f) / 25.8 (56f + 22f ctx) | ≤ 24.1 GiB | ~0.8 MB |

Shared setup: the C-key hero render (154.2 s wall / 118.0 s sampler),
once for the whole set. Per-step scaling is token-linear where the
conditioning is unchanged (73f/22f = 22.7/5.3 = 4.3 ≈ the 27/7 latent-step
ratio); the mctx 56f window's +7 pinned context rows cost ~+78% per step
over an unconditioned window of the same length's trend.

**THE "~2×" NOTE IS SETTLED (the review's warning was right):** at
matched references (A_land, 1.03 MP at `ref_image_size max`) the setk
chain samples at 5.3-5.8 s/step — IDENTICAL to the tween arm's windows.
Set K's recorded ~2× (339 vs ~159 s/beat) tracked its LATENT arm's
full-resolution PORTRAIT references (A_key, 3.6 MP), not the mechanism.
The 2× was ref pixel count; at matched refs the re-noising chain costs
the same as the tween chain per beat, and one chained prompt per seed
makes its wall LOWER than the tween arm's three prompts (572 vs 589 s).

### 3.2 Advancement (the strategic review's #5 axes, per delivered strip)

Mean flow speed per 22f segment (px/frame, Farneback at 2× downscale — a
relative axis across identical subject/framing, not an absolute pose
measure; the eye owns pose reading):

| Arm | s421337 segs | s421421 segs | s421777 segs | Total path (3 seeds) | Frozen frames | tail-12 speed |
|---|---|---|---|---|---|---|
| tween | 0.691 / 0.088 / 0.074 | 0.090 / 0.057 / 0.051 | 0.192 / 0.007 / 0.237 | 19.8 / 5.7 / 14.2 | 6 / 5 / 16 | 0.035 / 0.041 / 0.009 |
| setk | 0.691 / 0.648 / 0.669 | 0.090 / 0.104 / 0.103 | 0.192 / 0.195 / 0.184 | 53.0 / 8.6 / 15.0 | 3 / 0 / 1 | 0.227 / 0.080 / 0.319 |
| single | 0.667 / 0.735 / 0.594 | 0.839 / 0.253 / 0.111 | 0.690 / 0.499 / 0.050 | 45.2 / 25.3 / 26.1 | 0 / 6 / 7 | 0.610 / 0.188 / 0.007 |
| mctx | 0.365 / 0.502 / 0.656 | 0.974 / 0.215 / 0.452 | 0.619 / 0.919 / 0.556 | 32.1 / 34.6 / 44.1 | 3 / 7 / 2 | 0.496 / 0.710 / 0.147 |

(The tween and setk columns share their FIRST segment by construction —
G-BEAT1's bit-identity.)

### 3.3 Boundary continuity (each arm's internal seams; single has none)

| Arm@seam | speed before→after (ratio) | direction Δ (rad) | seam dE | reading |
|---|---|---|---|---|
| tween s1@22 / @44 | 0.16→0.09 (×0.60) / 0.17→0.11 (×0.64) | 0.59 / 0.36 | 6.2 / 6.4 | visible cut, motion decays |
| tween s2 | ×0.41 / ×0.39 | 0.70 / 0.56 | 4.7 / 4.5 | visible cut |
| tween s3 | ×0.008 / ×2.89 | 1.75 / 1.11 | 18.6 / 9.3 | hard break on the fast seed |
| setk s1 | ×1.41 / ×1.51 | 1.86 / 1.70 | 18.6 / 18.3 | visible cut, motion CONTINUES through it |
| setk s2 | ×0.60 / ×0.57 | 0.76 / 1.07 | 6.3 / 6.4 | visible cut |
| setk s3 | ×0.008 / ×0.007 | 1.16 / 0.80 | 9.9 / 9.8 | motion stops at the last seam |
| mctx s1@39 | 0.267→0.016 (×0.06) | 0.77 | **1.66** | INVISIBLE cut — but motion pauses just after |
| mctx s2@39 | ×0.10 | 0.56 | **1.63** | same signature |
| mctx s3@39 | ×0.02 | 0.23 | **1.76** | same signature |

The mctx seam dE (~1.7, at the re-encode floor class) is an order below
the 22f-window chains' cuts (4.5-18.6): the pinned-head mechanism
reproduces the previous window's tail pixels essentially exactly — and
then the first NEW frames slow nearly to a stop before motion recovers
(each mctx strip's third segment carries the strongest sustained speed of
the set on 2/3 seeds).

### 3.4 Style / identity landmarks (dE; ArcFace does not embed on this line-art subject — recorded as None everywhere, honestly)

| Arm | first-vs-A (3 seeds) | last-vs-C | last-vs-A | notes |
|---|---|---|---|---|
| tween | 2.75 / 14.47 / 2.50 | 2.53 / 17.45 / 16.61 | 19.1 / 15.4 / 18.5 | s1 ARRIVES at C (2.53); s2 opens 14.5 off A |
| setk | ≡ tween (bit-identical beat 1) | 3.23 / 17.10 / 18.13 | 18.5 / 14.6 / 10.3 | s1 arrives at C (3.23) |
| single | 2.65 / 2.90 / 2.88 | 85.0 / 8.68 / 2.12 | 87.7 / 18.0 / 18.7 | s3 arrives at C (2.12); **s1's ending DEGENERATES** — PSNR 1.2-1.5 dB vs both keys, oscillating tail (speed spikes 1.9-2.0 alternating with ~0.05), L* stable ~84 |
| mctx | 2.60 / 2.89 / 2.63 | 17.18 / 18.29 / 16.01 | 14.6 / 16.7 / 15.0 | ends mid-arc-ish from BOTH keys' perspective — moved away from A without landing on C |

A_vs_C baseline: dE 18.40 / PSNR 33.9. Color drift curves (dE-to-frame-0,
L*, chroma per frame) are in `out/setL_2_metrics.json` — no arm shows a
runaway drift profile; the single arm's s1 tail is the outlier event.

### 3.5 Cadence

The explicit held-drawing signature (frame matches two-back better than
one-back) fires on ZERO frames for every arm — this arc renders
continuously rather than on-twos; the alternation metric reads 0.07-0.32
across strips (highest: setk s1 0.250, mctx s3 0.322). The standing
caveat applies: the 3-13 Hz band mixes cadence with flicker — the eye
judges the pairs.

## 4. Proposed reads (for the maintainer's eye — NOT verdicts)

1. **The tween chain still does not chain** — window 1 moves, windows 2-3
   collapse to holds on every seed (segments 0.007-0.088 after strong
   first windows; 5-16 frozen frames). Set K's hold basin reproduces on
   the unsaturated three-phase arc: the promoted near reference does not
   hold the chain back at an intermediate pose.
2. **The setk re-noising chain DID advance into new time on 2/3 seeds** —
   s421337 sustains ~0.65 px/f through all three windows and lands at C
   (dE 3.2); s421777 sustains ~0.19 and moves away from A (10.3) without
   arriving at C (18.1). Its cuts are visible (dE 6-19) and s3's motion
   stops at the final seam. A seed lottery exists: s421421 renders
   near-stills under EVERY mechanism (identical conditioning, different
   noise) — motion itself is seed-sensitive at this operating point.
3. **The single 73f generation is the even-advancement dark horse with a
   tail-risk**: two seeds traverse smoothly (s3 arrives at C, dE 2.1);
   s421337's ending degenerates (PSNR ~1.2 dB vs both keys, oscillating
   tail) — the adapter's beyond-22f behavior, the arm's designed unknown,
   measured as a real instability mode at length on one of three seeds.
4. **mctx delivers invisible seams and late strength, at a pause and a
   price**: seam dE ~1.7 (an order below the 22f chains), the strongest
   sustained late-window motion on 2/3 seeds, but a near-stop immediately
   after each join (×0.02-0.10 speed) and 1.8-1.9× the tween/setk wall
   per delivered frame. It never lands on C (17-18 dE) — it continues
   motion more than it steers to a destination.
5. **Cost per delivered 66f**: tween 589 s / setk 572 s / single 687 s /
   mctx 1079 s (+ the shared 154 s C-key authoring once). At matched
   references the latent chain is not more expensive than the tween chain
   — Set K's 2× was the portrait references' pixel count.

The decision rule (the brief's framing, decided by the eye on
`gpu-review/setL/`): tail conditioning wins → the extension lane; setk
wins-at-variations → ship under that meaning; neither → defer.

## 5. Wall-clock + deviations

- 160.2 min controller wall / 158.8 min productive render wall (22 runs,
  zero failures, zero OOMs, zero re-runs). One engine launch (PID
  1304253, dense routing, no `--disable-dynamic-vram`), `/free` between
  every run. GPU minutes used: **158.8**, within the ~3 h estimate
  registered in Flux (comment 93u9b2m).
- Start was deferred ~1.5 h behind the mission start: the maintainer's
  own workload held the card (their runs win — the runbook's priority
  rule; the controller polled and launched at the 305 MiB baseline).
- Teardown: `/free` posted, SIGINT ladder exhausted its 180 s patience
  with the "refused to die" print, the engine exited on its own
  immediately after; the residual ~1.8 GiB on the card at close belongs
  to the returning desktop session plus a separate session's idle 8189
  engine — no process of ours remains (verified by process listing). The
  mid-set desktop return and the foreign idle engine are disclosed above;
  the canary chain stayed bit-identical through both.
- Harness bugs found + fixed mid-set (before any shipped number): the
  concat-demuxer frame duplication (§1 finding 1, fixed with the filter
  concat); a metrics worker keying bug that collapsed per-seed records
  (found on the first aggregation pass — no shipped artifact carried it);
  the metrics smoke-test reproduced Set K's recorded alternation 0.041 on
  the fl2va fill exactly (ground-truth validation of the battery).
- Deviations from the brief, all disclosed in §2: A_land as Reference 1;
  the C key authored once and shared; mctx at 39+56 (not 56+56) with the
  7f tail trim; the direct latent wire inside the mctx graph; arm 4 at
  the Set-K sampler point (the pack prescribes none). The on-twos
  signature metric fires zero everywhere (recorded honestly in §3.5).

## The eye verdict (the maintainer's blind calls, 2026-10-08 22:47–23:00; key reconciled)

- **p01 NULL: tie** — the instrument held.
- **Motion Context wins EVERY pair it appears in: 9/9 across all three seeds** (p02, p03, p05, p06, p07, p09, p10, p11, p13), judged on motion advancement first — the decision criterion. The p02 note names the pattern: "Left follows the prompt of the arm lowering. Her arms remain frozen in the air on the right clip" (mctx vs tween).
- **tween: 1 win / 5 losses** — the hold basin eye-confirmed ("frozen in the air"; "does not follow the prompt past the arm lowering"); its sole win is over single on seed 421777.
- **single: 2 wins / 4 losses** — beats tween on 2/3 seeds for MOTION, but the ending degeneration is eye-confirmed: "the background turns black however. If this is intentional this is fine" (p04, called single anyway) — and it loses to tween on 421777. Real value, unreliable ending.
- **setk: 0 wins / 3 losses** — dominated by mctx on every appearance. As a CONTINUATION mechanism it loses; per the strategic review's rule, its residual meaning is the variation/refinement recipe (state-preserving re-noising), not temporal extension.

**DECISION (the strategic review's rule, tail conditioning wins): the continuation lane gets spec'd on Motion Context tail conditioning** — narrow, explicit-review, one validated overlap recipe, immutable checkpoints. The measured caveats become the spec's engineering targets: the near-stop just after each join (tunable via the pack's continuation modes — spec must investigate), 1.9× cost per delivered frame, conditioning-collision surfacing, overlap budgeting in generated AND delivered time. The single-generation lane records as a cheap-motion finding with a known ending-degeneration limitation (unfixed, unexplained — a follow-up question, not a lane). Set K re-noising records as the variation recipe it is.
