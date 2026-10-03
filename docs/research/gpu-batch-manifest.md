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
VIG-SEAM: three seam strategies on a long board — S1 five-frame chained
anchors (CORRECTED 2026-10-03: the evidence is Saganaki's VIGGLE pack,
`five_frame_anchor` — NOT a SCAIL mechanism; SCAIL-2's README documents no
chaining and its own continuation surface is the node schema's
`previous_frames`/`previous_frame_count`, a separate mechanism needing its
own arm if tested) vs S2 independent-hop blend (Addendum 3) vs S3
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

## Amendment 1 — the prompting-guide corrections reach the bake-off (2026-10-03)

The packets' correction: the "zero-prompt engines" grouping was wrong 2-of-3 — **SCAIL-2 wants long detailed captions** ("short or empty can run but detailed usually produce better results" [DOC card]); **Wan-Animate-2 REQUIRES an appearance caption with motion excluded** [DOC]; only Viggle-Animate is text-free (frozen embed, Addendum 6). CONSEQUENCE: VG-1's bake-off must **control prompt quality per engine** — each engine's arm runs with its packet's caption recipe (a shared-baseline "bare default" arm + a "packet-tuned" arm per engine), or the bake-off measures prompt poverty, not engine quality. Add the E-K3 Krea dialect-swap arm (the guide's one [SPEC] prediction → measured; already top of the packet build's GPU queue). Also flagged: BFL docs drift (docs.bfl.ai showing FLUX 3-era content) — any Klein-arm settings verified against the packet's dated quotes, not the live site.

## Amendment 2 — the methodology audit verdict: DESIGNED-NOT-RUN (2026-10-03)

The Codex experimental-methodology audit (preserved at docs/audit/codex-gpu-methodology-audit-2026-10-03.md) returned **REDESIGN before spending GPU-hours** — all seven blocks need redesign as specified. The batch does NOT open until: (1) the arm ledger is frozen (exact configs, replication, primary endpoints, practical-effect thresholds, decision rules) and the budget recalculated honestly (X1–X3 alone ≈102 gens at the stated 3×2 — the 40–60 figure was wrong); (2) the attachment/pinned-row/kernel/frame-contract contradictions are resolved (NOTABLY: the runbook's turbo-MERGE-on-quantized convention vs the Viggle-adjacent adapters' merging-is-lossy prohibition — per-adapter attachment policy, pinned); (3) the prompting corpus's 17 named defects are repaired (silence/ambience modes, subject-role typing, preservation claims, the SCAIL five-frame attribution ERROR — the evidence is Saganaki's VIGGLE pack, not SCAIL's contract — ordering conflicts, grammar scoping); (4) X7's latent handoff gets the state-coordinate transformation + base→base/turbo→turbo cancellation controls (a shared unshifted grid position is index alignment, NOT physical state validity); (5) endpoints/thresholds/multiplicity/selection/stopping rules are pre-registered (60 tests at 5% ≈ 95% false-positive risk; Holm for confirmatory, FDR for exploratory; noise floors become MEASURED via 6–8 identical-config canaries — the ±0.039/±0.38 figures are community observations, not SDs, and the Kreatine 12v8 finding was +50%-compute confounded); (6) local noise + metric calibration precedes asset generation; (7) the reduced E-K3 + caption factorials run BEFORE defaults freeze; (8) broad sweeps → paired short probes, long boards reserved for finalists. The audit's §7 alternative ranking applies (static audit first, decode-only controls second, null-cancellation third). Full per-arm confound/statistics tables live in the preserved audit.

**Controller triage of the audit's highest-value catches** (the full report lives with the maintainer; the load-bearing corrections recorded here so the redesign task carries them): the X1 beta(0.8,3) arm is boundary-peaked not mid-peaked (wrong treatment label); X2's 352/768/1088p misses the ≈576p boundary entirely (screen at 544/576/768); X4 needs the 2×2 video×audio factorial; X6's manifest/simple may be IDENTICAL (dedupe by knot array before running); VG-1 is a shipping-pipeline comparison, not intrinsic-engine quality (declare the estimand); E2's one knob moves anchor AND driving authority jointly (report the joint curve, narrow the causal claim); E3 needs the duplicate-front control; E4 needs uniform-mask + background-0 controls; the shimmer metric needs flow-warp residuals + alternation-frequency spectral peaks, not just gradient ratios; hops-are-not-seeds (drift chains replicate as WHOLE chains); the 16-segment winner extension is selection-biased (confirm on new seeds/scenes); the judge needs a protocol not a model name (pin version/rubric/sampling, randomize AB, calibrate on known corruptions, sentinel pairs for drift); FVD skipped (distribution-level, wrong for paired small batches); VBench dimensions used individually.
