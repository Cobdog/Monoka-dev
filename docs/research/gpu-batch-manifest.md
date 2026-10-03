# The GPU batch manifest — the consolidated experiment window

> Flux task: **THE GPU BATCH (ourbqum)** · compiled 2026-10-03 from the
> research corpus. Opens on the maintainer's word post-remediation-merge;
> all runs on the 8189 testbed per docs/agent/runbook.md (health-check
> before, POST /free + VRAM-to-baseline between phases, teardown verified).
> Sequencing: cheap-information-first, wall-times early, long boards last.
> Boards shared wherever physics allows.

## Block 1 — H3 quality mechanics (docs/research/h3-sigma-schedule-thesis.md §7)
X1 grid-shape (simple/12, sgm/12, sgm/24, beta-mid/12 @ 20 NFE) · X2
resolution×shift (352/768/1088p × s∈{8,10,12,18}) · X3 terminal truncation
(σ′∈{0,0.05,0.15}) · X4 audio-retiming pairs (12,3/12,4/24,3/24,6) · X7
staged base→turbo handoff (t=0.75 + t=0.5, audio rebasing, grid-native
handoff) · X5 IR-gap prompt arms · X6 distill off-distribution.
Fixed-seed prompt set: 3 prompts (low/med/high motion complexity), 2 seeds;
every arm logs its full sigma grid. ~40–60 gens cheap tier.

## Block 2 — The recast lane (viggle-assessment Addenda 1–6; task ul1l4j7)
VG-1 three-way bake-off: Viggle pruned-int8 vs SCAIL-2 int8-convrot vs
Wan-Animate-2 distilled + incumbents (Fun-Control DWPose, H3 R2V refs) on
the fixed 8-clip board; first published 24 GB wall-times. Control-surface
arms: DMD-LoRA strength sweep; ref_image_size match-vs-max. (The prompt-
sensitivity probe is DROPPED — Addendum 6's frozen-embed finding.)

## Block 3 — The Viggle capability frontier
E1 full-frame stylized repaint (2D-cel + clay arms) = whole-scene restyler
test + the reverse direction on the same board (anime driving + photoreal
anchor) · E2 visual_cond_noise_aug sweep 0.999/0.95/0.85/0.70 (ArcFace-to-
anchor vs DWPose-to-driving curve) · E3 dual anchor (front+back) vs single ·
E4 denoise-mask region scoping (character m=1 / background m=0.15) · E5
style-LoRA-on-finetune smoke (0.5/1.0, adaln-free) — gates the own-adapter
track (license-clean per Addendum 6).

## Block 4 — Long-form
VIG-SEAM: three seam strategies on a long board — S1 SCAIL-native
five-frame chained anchors vs S2 independent-hop blend (Addendum 3) vs S3
staggered double-coverage; per-chunk ArcFace-vs-canonical-reference +
seam-visibility metric · VIG-FPS: native-24 vs conform-16+RIFE vs N=2
interleave (+ N=4 only if N=2 shimmer clean); cross-pass micro-shimmer
ratio; ≥1 fast-motion clip · VIG-CHUNK: 124f + SCAIL 81f/76f limit
re-verification against current APIs.

## Block 5 — The drift envelope (task 5nfy24y)
Arms v1 (A/B/C/F, 8 segments each + 16-segment winner + 39f spot-check) +
frozen-audio-prefix + R1/R2/R3 family + guide-soundtrack anchor (39f) + the
S seam-re-denoise arm. Metrics: per-hop ArcFace, dE + L* trajectory,
motion plan-error, audio treble/join correlation; thresholds pre-set
(identity <0.25, dE>5 sustained, plan-error >2× first-hop, treble −6dB);
noise floor = two identical renders (the loopforge convention, ±0.039
ArcFace / ±0.38 dE).

## Block 6 — Fresh-eyes quality arms (fresh-eyes-pass-2026-10-02.md §6)
Q1=E-G1 adherence bake-off (Fizgig / shift-aware gain / Semantic Bridge;
576p sanity + 768p collapse + loosen arm) · Q4=E-G2 Meridian INT8
camera/retime pilot (3 graphs + MoGe comparator) · Q5 VOID arm in E-ED4 ·
Q7 TeleStyle-on-H3 + Viggle style-repaint · Q8 Anime-to-Realism grounding
pilot · Q9=E-G5 base-model true-CFG falsifier · Q10=E-G3 reference-
annealing vs guide-freeze/pin-drag · Q11 UniLumos relight + HyperFlow
ladder.

## House experimental doctrine (from the corpus)
Turbo/pinned-row incompatibility: pinned-anchor experiments at 20 steps
(Motion Context finding) · VRAM nondeterminism bounds results (Kreatine
§7: 12-vs-8-step deltas were within it) — identical-config repeats bound
the floor per board · blind sonnet-judge convention for quality calls ·
fixed seeds + the full-config manifest per run · /free between arms ·
the engine's workload preempts ours — check before submitting.
