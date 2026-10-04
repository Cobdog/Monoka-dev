# Codex GPU-batch experimental-methodology audit — 2026-10-03 (verbatim report, external auditor)

> Provenance: the external Codex methodology audit of the consolidated GPU
> batch, run against the manifest (`docs/research/gpu-batch-manifest.md` at
> Amendment 1) + the sigma thesis + the Viggle addenda + the prompting
> corpus. Pasted verbatim by the triaging controller (claude); no edits.
> Verdict: **REDESIGN before spending GPU-hours.** Triage + the eight
> required changes live in the manifest's Amendment 2; the run-ready ledger
> built from this report is `docs/research/gpu-batch-ledger.md` (751b347).
> (This file landing late — after Amendments 2/3 and the ledger — is itself
> the dangling-reference fix; the ledger was built from the maintainer's
> pasted copy of this report, so no cross-check divergence exists.)

---

**Verdict: REDESIGN before spending GPU-hours.** The batch contains useful questions, but its present form cannot reliably distinguish small improvements, attribute several improvements to the claimed mechanism, or justify production prompting defaults.

The highest-priority defects are:

1. **The generation budget is understated.** X1–X3 alone require approximately **102 unique generations** at three prompts × two seeds, allowing for two shared baseline cells. That already exceeds the stated 40–60, before X4–X7.
2. **Several "mechanism" comparisons are actually workflow comparisons.** Matching prompts does not isolate engine effects when quantization, kernels, conditioning geometry, frame rate, and sampling recipes differ.
3. **The noise floors are not statistical estimates.** Two identical renders cannot establish a variance distribution or a reliable detection threshold.
4. **X7 lacks both a matched-compute comparator and a demonstrated latent-state transformation between different shifts.**
5. **The prompting corpus contains contradictions that would contaminate its own validation.**
6. **Most blocks lack a complete arm ledger:** exact configurations, replication counts, primary endpoints, practical-effect thresholds, and decision rules.

This audit used read-only document inspection and primary-source literature lookup. No tests, generations, GPU operations, or contact with either engine port were performed.

## 1. Per-block verdicts

| Block | Verdict | Required redesign |
|---|---|---|
| **1 — H3 quality mechanics** | **REDESIGN** | Separate scheduler density from shift; include the adherence boundary in X2; define X3's terminal estimator; factorialize X4; repair X7's state handoff and compute comparison; expand replication only for screened finalists. |
| **2 — Recast lane** | **REDESIGN** | Declare a shipping-pipeline bake-off rather than an intrinsic engine-quality experiment. Standardize inputs and presentation, calibrate captions separately, and evaluate native operating points plus cost. |
| **3 — Viggle frontier** | **REDESIGN** | Add unchanged-anchor, duplicated-reference, zero-LoRA, and uniform-mask controls. E2 jointly changes appearance and driving authority; it cannot isolate identity strength. |
| **4 — Long-form** | **REDESIGN** | Resolve the SCAIL/Saganaki attribution mismatch. Separate anchor provenance from stitch strategy, normalize output duration/rate, and calibrate shimmer against motion and blur controls. |
| **5 — Drift envelope** | **REDESIGN** | Publish executable definitions of A/B/C/F and frozen-prefix arms. Replicate entire chains; treat hops as repeated observations. Replace the selected "winner" extension with independent confirmation. |
| **6 — Fresh-eyes quality arms** | **REDESIGN** | Split into individually gated pilots with null controls and task-specific metrics. One clip or graph can establish feasibility, not quality superiority. |
| **7 — Prompting-corpus validation** | **REDESIGN** | Repair contradictory presets and overclaimed universals first. Validate recipe utility separately from documented syntax, using paired task boards and held-out confirmation. |

These verdicts concern the designs **as specified**, not whether the candidate techniques are promising.

Source anchors: batch manifest (docs/research/gpu-batch-manifest.md), sigma designs (docs/research/h3-sigma-schedule-thesis.md), Viggle assessment (docs/research/viggle-assessment.md), prompting guide (docs/research/prompting/guide.md).

## 2. Confound inventory: arm × confounder × normalization

### Block 1 — H3 mechanics

| Arm | Confound or validity defect | Normalization or restructuring |
|---|---|---|
| **X1: simple/12, sgm/12, sgm/24, beta/12** | Scheduler and shift co-vary. Grid endpoints, interval sizes, terminal jump, and mid-band visitation differ simultaneously. | First compare scheduler families at **shift 12**, fixed sampler, actual NFE, endpoints, canvas, duration, and audio schedule. Then cross the surviving scheduler families with shifts 12/24. Describe results as effects of the complete grid unless a single grid property is independently manipulated. |
| **X1 beta arm** | Beta(0.8,3) is not an interior-peaked density: its mode is at the boundary. "Mid-peak" is therefore an incorrect treatment label. Sigma/base-position orientation also matters. | Specify the actual knots and density orientation. If an interior motion band is the hypothesis, use an explicit interior-peaked density or manually allocate knots there. Compare against a control that redistributes the same number of knots outside that band. |
| **X2 resolution × shift** | Resolution changes latent tokens, numerical allocation, perceived sharpness, and potentially the realized schedule. It also changes how identical integer seeds map onto spatial noise. | Keep aspect and duration fixed; record actual grids and token counts; compare adherence at a common evaluation size. Estimate **resolution × shift interaction**, not just a winner at each resolution. Record residency partitions. Treat resolution's token-count effect as part of the treatment, rather than pretending it can be removed. |
| **X2 canvas choices** | 352/768/1088p do not locate the claimed ≈576p boundary. A three-point curve cannot establish a cliff. | Screen at 544/576/768p; add 640p if the transition appears. Reserve 1088p for a supported-envelope or extrapolation question. Add duration × shift on finalists to distinguish resolution-specific behavior from total-token behavior. |
| **X3 terminal truncation** | Removing a final hop changes NFE; redistributing knots changes the whole trajectory. Decoding at nonzero noise can trade apparent "less fry" for blur or residual noise. | State whether the output is the noisy latent or an estimated clean latent. Compare shared-prefix trajectories with separate controls for omitted-final-hop, same-NFE rescheduling, and clean-state estimation. Add texture-retention and residual-noise gates. |
| **X4 shift pairs** | The four pairs are not a complete factorial. Video shift changes visual generation and packed audio scaling while audio shift changes timing. Audio metrics alone cannot separate these effects. | Use a **2×2** video/audio shift design, e.g. video {12,24} × audio {3,6}; retain 12/4 as an optional intermediate calibration. Record physical audio knots, scaling, onset timing, and video/audio synchronization. |
| **X5 naive / handwritten / compiled** | Formatting, semantic specificity, length, reference roles, and compiler hallucinations change together. | Use the same intent checklist and three treatments: naive expression, **content-equivalent structured prompt**, and compiler-expanded prompt. Score added or omitted instructions separately. Pin compiler version and output. |
| **X6 manifest / sgm / simple** | Manifest and simple may be identical. A solver change would confound trajectory with integration. | Compare actual knot arrays; collapse duplicates. Hold solver and actual NFE fixed. Add a small controlled knot perturbation to test sensitivity before comparing radically different trajectories. |
| **X7 staged handoff** | ≈11 evaluations are compared with turbo-8 and called matched NFE. Same base position with different shifted sigma labels does **not by itself** make a latent state valid for both stages. | Establish the state-coordinate transformation first. Audit video latent noise level, audio scale, timestep convention, and solver history. Compare staged ≈11 NFE against a declared ≈11-NFE control, and separately report native turbo-8 on a quality/cost frontier. |
| **X7 handoff controls** | Improvements could come from extra compute, switching models, restarting a multistep solver, or rebasing rather than base-stage structure. | Include **base→base** and **turbo→turbo** split controls, plus same-shift switching where supported. A split with no effective model change must reproduce the unsplit trajectory within its measured numerical tolerance. |

**X7's key requirement:** a latent representing x(σ_base) cannot simply be relabeled x(σ_turbo). Sharing the unshifted grid position establishes index alignment, not necessarily physical state alignment. The source's proposed audio rebasing addresses only one component of this problem.

### Blocks 2–5

| Arm | Confounder | Normalization or restructuring |
|---|---|---|
| **VG-1 engine comparison** | Quantization/pruning, kernels, captions, masks, canvas, fps, duration, steps, and reference geometry all differ. | Define the estimand as **quality and cost of the deployed pipeline on this hardware**. Use identical source clips and canonical targets, common presentation rate/size, and pinned engine-native recipes. Report native and common-canvas results separately. |
| **VG-1 incumbent R2V** | Character-sheet references versus repainted own-frame references disadvantage one conditioning geometry. | Feed the same canonical appearance target where supported; add the already-designed sheet-versus-own-frame comparison as a separate within-H3 ablation. |
| **VG-1 prompt control** | Bare versus tuned combines caption length, detail, compliance, and tuning effort. Empty Wan captions violate its required contract. | Calibrate caption factors within engine; freeze recipes before the bake-off. Give engines equal tuning budgets. Keep invalid bare cases as failure controls, never as a fair quality baseline. |
| **DMD strength sweep** | Lower DMD strength moves toward the undistilled finetune, whose step requirement differs. | For a strength-only experiment hold steps fixed and call it sensitivity. For useful operating points, cross strength with step budget and compare cost/quality. |
| **ref_image_size match/max** | Reference token count, encoded detail, layout, runtime, and allocation change. | Hold source reference and output fixed; record effective encoded dimensions and rows. Call the result a reference-budget effect, not pure "identity strength." |
| **E1 repaint/reverse direction** | Upstream repaint quality and geometry change with medium. Reverse transfer is neither free nor symmetric. | Freeze prepared anchors; include unchanged-anchor and character-only/background-only/full-frame repaint controls. Score each direction separately. |
| **E2 noise augmentation** | One knob weakens both anchor and driving authority. It is not a pure identity-control dial. | Report a **joint identity–motion response curve**. If the payload supports separate channels, use anchor-noise × driving-noise; otherwise narrow the causal claim. |
| **E3 front+back anchors** | View coverage, reference count, token count, and off-distribution multi-reference behavior change together. | Compare single-front, front+duplicate-front, and front+back. Match preprocessing and reference budgets; do not infer view benefit from single-versus-dual alone. |
| **E4 regional mask** | Background 0.15 still regenerates; mask boundaries and segmentation accuracy affect seams. | Include unmasked, uniform-denoise, background-0, and background-0.15 controls. Measure core background and boundary bands separately. |
| **E5 style LoRA** | Strength, checkpoint compatibility, DMD interaction, and attachment mechanism can all affect output. | Add strength 0 and a verified attachment/no-op control. Pin the DMD regime. Run a compatibility smoke gate before measuring style quality. |
| **VIG-SEAM S1/S2/S3** | Anchor chaining, overlap, blending, and total generated coverage change simultaneously. | Cross **anchor provenance {previous tail, canonical} × stitch {hard join, blend}** first. Compare double coverage against the same canonical baseline with its extra compute disclosed. |
| **VIG-FPS** | Temporal sampling, generated-frame count, RIFE, and source timing vary. | Use the same final timestamps, duration, and presentation fps. Evaluate rate conversion on the original footage first; then evaluate the additional propagation error. |
| **VIG-CHUNK** | Longer sequences may switch attention kernels and memory paths. | Check declared API/frame contracts by static inspection first. Separate length-limit verification from **length × kernel** quality tests. |
| **A/B/C/F; frozen prefix** | Arm definitions are absent from the inspected manifest; causal contrasts cannot be reconstructed. | Supply exact conditioning, handoff, audio, grid, prompt, and anchor definitions before scheduling. |
| **R1/R2/R3** | R2 adds refs and identity instructions; R3 changes duration, beat prompt, number of boundaries, and caching. | Separate reference presence from identity wording; separate window length from beat-specific prompting. Apply both to the same frozen draft chain. |
| **Guide soundtrack; S seam pass** | Audio conditioning versus post-mux differs; seam repair may overlap assembly/postprocessing changes. | Compare clean audio pin, reference conditioning, and original-track mux explicitly. Freeze stitch first, then compare seam pass off/on on the identical stitched input. |
| **16-segment winner extension** | Winner selection biases the extended result; hops are not independent replications. | Confirm the selected recipe using new chain seeds and scenes, with its baseline also extended. |

### Block 6

| Arm | Confounder | Required control |
|---|---|---|
| **Q1 adherence mechanisms** | Different strengths, intervention locations, and tuning effort; loosen changes intent. | Baseline plus zero-effect control for each mechanism; common tuning budget; fixed intent; resolution × mechanism. Score adherence and natural motion separately. |
| **Q4 Meridian / MoGe** | Geometry estimator and generative refinement differ. | Identity-path/no-retime control; inspect rendered geometry first. Use common geometry if isolating refinement; otherwise call it a pipeline comparison. |
| **Q5 VOID** | Masks, second pass, and source compositing can determine preservation. | Same removal target and mask; identify generated versus composited pixels. Compare completion quality and preservation separately. |
| **Q7 TeleStyle / repaint** | Anchor editor and propagation engine change together. | Share the styled anchor to isolate propagation, or label the end-to-end comparison. Include unstyled-anchor control. |
| **Q8 Anime→Realism** | LoRA, trigger, per-cut caption, and retention all change. | LoRA off/on × generic/per-cut caption, with fixed retention and inputs. |
| **Q9 true CFG** | Branch references, CFG, negative wording, and PMC cap can co-vary. | Verify the actual unconditioned branch; same references on branches; CFG=1 null; ordinary CFG versus capped CFG at matched scale. |
| **Q10 reference annealing** | Noise amplitude, schedule, and reference channel vary. | Zero-noise wrapper null; static versus annealed noise at matched budget; separate guides from identity refs. |
| **Q11 relight / HyperFlow** | Two unrelated questions; steps and trajectory differ across rungs. | Separate protocols. Relight: fixed lighting target and preservation gates. HyperFlow: native-recipe cost frontier plus attachment-off null. |

## 3. Statistical adequacy

### What the recorded floors establish

The ±0.039 ArcFace and ±0.38 face-dE figures are **community render-to-render observations**, not established standard deviations, confidence intervals, or universal hardware floors. The Kreatine finding additionally identifies a **configuration-dependent numeric path** selected by residency. That is systematic confounding, not noise that extra seeds automatically average away.

The previously observed 12-versus-8 difference was also confounded by approximately 50% more stage-2 evaluations. It cannot support a grid-quality claim.

Measure three distinct sources of variation:

- **Execution repeatability:** same input, seed, and configuration, repeated after reload.
- **Seed sensitivity:** different seeds on the same task.
- **Task sensitivity:** different clips, subjects, prompts, or chains.

Use **6–8 identical-config repeat renders**, distributed across the relevant loading/order conditions, for a small number of representative canaries. This is a pilot variance estimate, not a precise characterization of tails.

### Illustrative detectability

For a paired continuous endpoint, a planning approximation is

MDE ≈ (1.96+0.84) s_Δ/√n

for 80% power at unadjusted two-sided 5%. Here s_Δ is the measured standard deviation of paired differences, and n is the number of independent pairs.

**Only for illustration**, if the quoted floors were single-render SDs and renders were independent, s_Δ would be approximately 0.055 ArcFace or 0.537 dE:

| Independent pairs | Illustrative ArcFace MDE | Illustrative dE MDE |
|---:|---:|---:|
| 2 | 0.109 | 1.06 |
| 6 | 0.063 | 0.61 |
| 12 | 0.045 | 0.43 |
| 24 | 0.032 | 0.31 |

These are optimistic large-sample planning values; small-sample uncertainty and multiplicity worsen them. Actual paired covariance can improve or worsen precision. **Do not use these numbers as measured power.**

### Arm-level adequacy table

"Unknown" means the design supplies neither variance nor a defensible expected effect.

| Arms | Current replication / floor | Detectable effects and prescribed design |
|---|---|---|
| **X1** | Three prompts × two seeds; plan-error/fry variance unknown | Suitable for catastrophic failures and screening. Small texture or motion improvements remain unpowered. Screen with paired seeds; confirm finalists on 6–8 tasks × 4 seeds, expanding from measured variance. |
| **X2** | Apparently six outputs/cell; no adherence floor | Estimate interactions on per-instruction success, not selected best shifts. Start around the boundary; confirm on held-out prompts with ≥4 seeds/task. |
| **X3** | Six outputs/cell; fry metric uncalibrated | Small dE changes ≤0.38 and subtle texture changes are unresolved. Require paired texture-retention and structure noninferiority endpoints. |
| **X4** | Seed allocation unclear; no timing/audio floor | Use clips with known impulses, speech onsets, and AV events. Pair seeds; calibrate timing/join metrics using no-sampling audio round trips. |
| **X5** | Three intents, seed count unclear | Formatting benefit may be large; compiler improvements can be small. Use ≥6 diverse intents × 4 paired seeds for confirmation; hold semantic content fixed. |
| **X6** | Count unclear | Cheap screen for collapse; no power for mild penalties. Deduplicate trajectories, then replicate surviving contrasts. |
| **X7** | Source says three seeds; manifest's common plan says two | Small adherence benefits are especially vulnerable. Resolve replication and compute mismatch; screen, then confirm at least 6 tasks × 4 seeds. |
| **VG-1** | Eight clips; per-clip seed count unspecified | Eight clips do not independently replicate two nonhuman classes or one re-entry case. Use 2 seeds/clip to screen, 4 for finalists; expand subject/clip diversity before broad claims. |
| **DMD / ref-size** | Counts unspecified; identity noise applicable only after calibration | Minor strength benefits may sit at the ArcFace floor. Paired within-engine comparisons; record load partitions and report Pareto trade-offs. |
| **E1 / reverse** | Counts unspecified | Large style propagation failures are screenable. Subtle preference or decay requires replicated clips and temporal scoring. |
| **E2** | Four levels; ArcFace floor borrowed; pose variance unknown | Adjacent levels may be indistinguishable. Screen endpoints, add intermediate levels only if the curve changes materially. |
| **E3** | Single-versus-dual; counts unspecified | Small identity gain is plausibly at/below floor. Duplicate-reference null is mandatory; use view-specific identity/outfit metrics. |
| **E4** | Counts unspecified | Large background changes are detectable; small leakage needs decode-floor controls and boundary stratification. |
| **E5** | Two strengths; no zero; counts unspecified | A smoke test can establish compatibility only. No winner claim from it. |
| **VIG-SEAM** | Long-board replication unspecified | Seams within one video are correlated. Replicate complete videos; compare seam and interior changes separately. |
| **VIG-FPS** | At least one fast-motion clip; shimmer floor unknown | One clip supports feasibility only. Use static-texture, slow-motion, fast-motion, occlusion/re-entry strata and ≥3 paired seeds for screening. |
| **VIG-CHUNK** | Boundary checks | Valid for shape acceptance/truncation, not quality superiority. Repeat only for unstable boundary failures. |
| **A/B/C/F** | Eight hops; chain count unspecified | Hops do not count as eight seeds. A ≈0.06/hop trend may be visible over several hops; small mitigation differences remain unresolved. Start 4 independent chain seeds × ≥3 scenes for finalists. |
| **Frozen audio / soundtrack / S** | Counts unspecified | Audio-floor unknown; local seam gains may be small. Pair complete chains and use round-trip/mux nulls. |
| **R1/R2/R3** | Proposed cheap R1/R2 probe: one seed | One failed run cannot kill the strong-form claim. Use 2 seeds × 2 degraded scenes as a screening gate; confirm on frozen draft chains. |
| **Q1/Q9/Q10** | Counts unspecified | Small adherence/identity benefits likely floor-sensitive. Paired task boards with zero-effect controls; confirm shortlisted settings. |
| **Q4/Q5/Q7/Q8/Q11** | Pilot/one-clip language | Detects compatibility or large task failure. General quality claims need ≥4 task cases with multiple seeds, then held-out confirmation. |
| **E-K3** | 27 cells × two seeds; subject multiplication unclear | Two seeds/cell cannot establish neutral-to-harmful equivalence or interactions. Reduce dial cells, increase task diversity and paired replication. |
| **Preset/grammar tests** | Not specified | Power against task-completion and preference thresholds. Use exploratory boards, then independent task/seed confirmation; do not infer goodness from one attractive output. |

No source supplies reliable expected effect sizes for every arm. Flagging an effect as "likely small" is a risk assessment, not a measured prediction.

### Multiple comparisons and winner selection

With 60 independent null tests at 5%, the probability of at least one false positive is approximately **95%**. Shared boards introduce correlation but do not remove the problem.

Before arm 1:

1. Register **one primary contrast and endpoint per headline question**, plus practical-effect and preservation thresholds.
2. Classify all other comparisons as exploratory.
3. Use **Holm familywise correction** for the predefined confirmatory family. Exploratory findings may use false-discovery-rate control, clearly labeled.
4. Confirm selected recipes on **new tasks and seeds**. Reusing a selected board is not confirmation.
5. Use predefined interim looks and stopping rules; ordinary confidence intervals are invalid under arbitrary repeated peeking.
6. Report ties and Pareto frontiers. Require a practically meaningful benefit with preservation gates satisfied before declaring a winner.

For paired preference, six unanimous independent outcomes yield only p=0.03125 in a two-sided sign test—insufficient for a large comparison family. More judge votes on the same render do not create more generation replications.

## 4. Metric fidelity and substitutions

| Existing metric | What it actually measures / failure mode | Better or complementary readout |
|---|---|---|
| **ArcFace** | Face embedding similarity; sensitive to visibility, pose, crop, image quality, and domain. It misses outfit/body identity and is inappropriate as the sole nonhuman/anime metric. | Visibility-stratified face scores with detection coverage; canonical multi-view references; masked DINO-style appearance similarity; outfit attributes; blinded human identity checks. Never silently discard missing faces. |
| **ArcFace <0.25** | A borrowed verification threshold, not a universal identity boundary. | Calibrate same/different identities on this board and domain. Use change from baseline plus calibrated verification operating points. |
| **Identity-in > identity-out** | Similarities to clean refs and degraded drafts are not directly comparable causal evidence. | Compare R2 versus R1 against the **same canonical target**, using the same frames/crops; preserve draft motion independently. |
| **Motion plan-error** | Obedience to a prescribed trajectory. Low error can coexist with stiff acting, bad contacts, anatomy failures, or frozen detail. | Trajectory/onset error plus dynamic degree, acceleration/jerk, contact events, anatomy integrity, and blinded motion-naturalness preference. |
| **DWPose error** | Detector-estimated human pose; detector failure varies with style and anatomy. | Confidence/coverage reporting, body-normalized error, manual landmark subset, object tracks or flow for nonhumans. |
| **HF energy / Laplacian variance** | Noise, oversharpening, and shimmer can score as detail. | Texture-band retention, ringing/noise measures, region-specific quality, and human texture preference. Treat NR-IQ as secondary. |
| **Skin dE / L*** | Color differences mix drift with lighting, pose, occlusion, and segmentation changes. | Registered stable material patches; separate face/background; exposure and chroma trajectories; signed L* drift; intentional-lighting controls. |
| **Shimmer temporal-gradient ratio** | Genuine motion increases it; blur and freezing reduce it. A near-zero baseline makes ratios unstable. | Occlusion-masked flow-warp residuals, static-region flicker, temporal spectral peaks at pass alternation frequency, dynamic-degree/blur gates, and short-loop human review. Report absolute residuals alongside ratios. |
| **Seam frame-delta ratio** | Confounded by motion, cuts, and near-zero denominators. Crossfades may hide jumps while creating ghosts. | Compare seam residual to matched interior residual; flow/contact continuity; double-image detection; blind seam-localization. Separate hard cuts from continuous shots. |
| **Treble −6 dB** | Spectral brightness, not general audio identity or drift. Natural instrumentation changes can exceed it. | Matched-window log-spectral distance, loudness, bandwidth, clicks, clipping, speaker/timbre similarity, ASR accuracy for speech, and listening checks. |
| **Audio join correlation** | Useful for intended waveform reuse; inappropriate for independently generated but semantically correct audio. | Align lag and loudness first. Use waveform metrics for copy/pin claims; event timing, AV sync, intelligibility, and timbre metrics for regeneration. |
| **PSNR/dB "quality"** | Fidelity only when a meaningful aligned target exists. A successful restyle should differ from the original. | Apply to preserved regions or reconstruction controls; use task completion and style/identity judgments for transformed regions. |

**VBench:** use relevant dimensions individually—subject/background consistency, motion smoothness, dynamic degree, temporal flicker, appearance style, action, color, and spatial relationships. Do not call custom-board scores the official aggregate benchmark. (https://github.com/Vchitect/VBench)

**FVD:** skip it for this small batch. It is a distribution-level statistic, poorly suited to a few paired clips or localized edits, and its features can underweight substantial temporal corruption. (https://openaccess.thecvf.com/content/CVPR2024/papers/Ge_On_the_Content_Bias_in_Frechet_Video_Distance_CVPR_2024_paper.pdf)

**VLM/LLM judging:** the "blind Sonnet judge" convention needs a protocol, not merely a model name:

- Pin judge version, rubric, frame sampling, playback information, and inference settings.
- Give task intent and canonical references, but hide treatment prompts, engine identities, and filenames.
- Randomize A/B positions; reverse a subset; allow ties and "cannot assess."
- Score adherence, preservation, motion, and aesthetics separately.
- Calibrate on known corruptions: frame shuffle, freeze, identity swap, blur, audio lag.
- Include repeated sentinel pairs throughout sessions to detect drift.
- Human-review finalists, disagreements, seams, and audio.
- Calibrate again for anime/nonhuman domains; sparse screenshots cannot establish temporal quality.

Learned scorers are useful candidates, but reported human correlation does not guarantee transfer to this board. (VideoScore: https://arxiv.org/abs/2406.15252; VMBench: https://openaccess.thecvf.com/content/ICCV2025/papers/Ling_VMBench_A_Benchmark_for_Perception-Aligned_Video_Motion_Generation_ICCV_2025_paper.pdf)

**Worth single-GPU cost:** selected feature/flow/quality passes over frozen outputs, amortized across blocks. Run them after generation with the generator unloaded. Skip full FVD, redundant giant judges, and evaluation whose calibration costs more than the screened experiment.

## 5. Run-protocol hardening: pre-flight before arm 1

### Mandatory pre-flight

- Freeze the complete arm ledger: graph, inputs, expected shapes, actual grids/NFE, repetitions, metrics, failure handling, and decisions.
- Resolve **merge-policy conflict**: the runbook says turbo MERGE on quantized bases; the packets and Viggle sources prohibit merging particular distillation adapters. Specify attachment per adapter and precision. Do not merge tiny distilled deltas solely to obtain reproducibility.
- Resolve **pinned-row scope**: ordinary H3 chain/guide/mask experiments require 20+ steps, turbo and step-skipping caches off. Native Viggle/SCAIL distilled conditioning recipes require their own scoped compatibility evidence; blanket conversion to 20 steps would itself change the model's operating point.
- Pin transformer, TE, VAE, LoRA, frozen embedding, software/node revisions, and numeric precision.
- Pin the **actual attention kernel** per arm; prohibit undocumented automatic switching.
- Verify input hashes, mask semantics, reference order, effective dimensions, decoded frame counts, timestamps, and audio offsets.
- Verify metrics exist and have domain-appropriate calibration before generating assets intended for them.
- Register canaries, balanced order, warm-up policy, stopping rules, and invalid-run criteria.
- Confirm authorization, runtime ownership, idle queue, GPU baseline, and absence of competing jobs through the approved coordination procedure. Do not resolve coordination by probing the prohibited personal instance.

### Ordering and warm-up

Use randomized, balanced mini-blocks of task × seed, with AB/BA ordering where feasible. Model-loading economics may justify grouped runs, but balance order across groups and repeat baseline canaries at the beginning, middle, and end.

Separate:

- **Cold end-to-end latency**, including load/encode;
- **Warm steady-state latency**, after a fixed declared warm-up.

Budget warm-ups as runs. Verify measured jobs actually execute rather than return graph-cache outputs. Log GPU temperature, clocks, power, memory, and throttling; use a standardized warm state instead of making arm order a thermal treatment.

### Per-run manifest

Record:

- Input/prompt/compiler hashes and reference wiring;
- Exact model, TE, VAE, LoRA identities and strengths;
- Attachment mode and patch owners;
- Actual scheduler array, sampler, model-call count, shift/scaling and handoff;
- Canvas, latent/reference/audio row counts, duration, fps, mask settings;
- Seed and noise-generation algorithm; initial latent hash where available;
- Kernel names, cache settings, precision, dynamic-VRAM configuration;
- Loaded/offloaded MB, low-VRAM patch count, memory peaks;
- Prompt/job ID, start/end times, runtime log span, output hashes;
- Warm-up/cache status and any deviation.

Matched seeds are useful **within a stable geometry and implementation**. Across engines they identify paired tasks, not equivalent initial noise.

### Between arms and teardown

`/free` and a return to baseline are necessary, but insufficient to establish clean state.

Verify queue empty, previous driver exited, no orphan child/accelerate workers, no unresolved generation, and no persistent model patch or embedding cache from another arm. Use fresh runtime boundaries when patch ownership changes. Restart after OOM, wedged estimator, unexpected residency partition, or failed canary.

At final teardown, verify recorded process exit, no owned descendants or queued work, and VRAM returned to baseline. If the canary changes materially, quarantine the affected block and repeat it after diagnosis.

The reported leaked-job hazard should be treated as a concrete pre-flight failure mode. Its exact incident record was not located in the inspected source files.

## 6. Missing influential variables

1. **Prompt contract × schedule × resolution:** essential for X1/X2/X5 and Q1; a scheduler ranking under one prompt dialect may not transfer.
2. **Duration/token count × shift:** needed before claiming resolution-aware defaults.
3. **Seed sensitivity itself:** report median, tails, failure probability, and between-seed dispersion—not just mean quality.
4. **Reference visibility and quality:** front/back/profile, occlusion, anchor-frame selection, grading, small faces, geometry mismatch.
5. **Subject diversity:** the recast board already includes nonhumans and multiple characters, but its small strata need expansion for general claims; add body types, skin tones, outfits, scale, re-entry, and lighting.
6. **Camera motion versus subject motion:** pose error alone does not cover the former.
7. **Mask size, topology, boundary contact, and tracking errors:** essential for E4/VOID/removal.
8. **Audio content class:** speech, silence, music, percussive events, and sustained tones expose different failures.
9. **Kernel × sequence length and attachment × residency:** hidden numeric interventions.
10. **Prompt/encoder budgets:** truncation, reference vision budget, template expansion, and prompt-compiler variability.
11. **Judge drift and domain bias:** monitor across long sessions and across realistic/stylized boards.
12. **Postprocessing:** color stabilization, RIFE, compositing, and face repair must be explicit treatments.
13. **Failure cost:** retries, OOMs, load time, and unsuccessful attempts belong in information/GPU-hour and deployment-cost estimates.

## 7. Alternative designs ranked by information per GPU-hour

| Rank | Substitute | Blocks | Why it improves information/GPU-hour |
|---:|---|---|---|
| **1** | Static contract, knot, shape, and graph audit | All | Removes duplicate/impossible arms, incorrect captions, beta mislabeling, and merge conflicts without sampling. Substitute immediately. |
| **2** | Decode/encode-only and assembly-only controls | 3–6 | Establish VAE preservation, audio round-trip, mask/composite, resampling, and seam floors before expensive sampling. Substitute for premature quality arms. |
| **3** | Pre-registered null-cancellation controls | 1/6/7 | Zero-effect gain/bridge/CADS, CFG=1, same-model split, and adapter-off controls detect broken wrappers cheaply. |
| **4** | Reduced E-K3 and caption screens | 2/7 | Directly gates product defaults. Reduce factorial breadth and increase replication. |
| **5** | R1/R2 paired falsifier on frozen degraded drafts | 5 | Reuses existing material; tests canonical re-anchor directly. Replace the one-seed rejection rule with replicated screening. |
| **6** | Boundary-focused resolution ladder | 1 | 544/576/768p × selected shifts answers adherence collapse more faithfully than 352/768/1088p. |
| **7** | Unchanged-anchor then style propagation ladder | 3/6 | Separates basic pipeline failure from style failure before full frontier sweeps. |
| **8** | Independent two-window seam probe | 4 | Tests canonical versus tail anchors and blend effects before generating long boards. |
| **9** | Geometry-preview gate before Meridian sampling | 6 | Rejects incorrect paths/depth without spending generative passes. |
| **10** | Paired-seed adaptive operating-point ladders | All | Screen 2 seeds/task, advance only practical-effect candidates, confirm with new seeds/tasks under registered stopping rules. |
| **11** | Full long-chain/fps boards only for finalists | 4/5 | Retains realistic stress tests after cheap nulls and short-window gates pass. |

## 8. Prompting-corpus validation program

### Evidence tags: what needs GPU validation?

**Do not remeasure documented mechanics:** frozen Viggle text embedding, declared fields, reference addressing, supported input shapes, negative-branch mathematical inactivity at CFG=1, mask polarity, template syntax, or documented parameter availability. Verify these through pinned source/graph inspection.

**Do measure behavioral claims:** "usually better," "neutral-to-harmful," "more stable," "best," "contradictions become unions," "camera first improves obedience," "quality words harm," and adherence/resolution interactions. A `[DOC]` tag on an upstream recommendation does not establish its effect size on this quantized shipping implementation.

**Priority confirmations despite `[DOC]` or `[DOC-m]`:** Klein's generation-ambiguous BFL guidance and transfer to community True-V1; SCAIL/Wan caption recommendations on the exact deployed quantized recipes; Qwen mask/transparency/outpaint behavior measured elsewhere; Anima mixed-mode superiority, which is not entailed by training on mixed captions.

Music 3's unknown steps/CFG surface needs interface inspection first. Do not invent a GPU sweep for controls the implementation may not expose.

### Repair the corpus before GPU validation

| Defect | Required rewrite |
|---|---|
| **3.9 "deliberate silence" scripts ambience and footsteps** | Rename to "no speech/no music." Total silence is a distinct contract. Remove the automatic speech-negation block pending testing against positive ambience. |
| **3.4 permits Subject 2 = outfit/environment, then makes it act** | Use typed slots: actors act; outfit/style/environment roles transfer attributes. |
| **3.5 audio reuse wording lacks mandatory wiring** | State that prose alone does not guarantee reuse. Make pin/copy/mux configuration explicit; silence on mouth motion requires separate checking. |
| **3.6 "deterministic" preservation** | Distinguish latent preservation, VAE reconstruction, and exact source composite. |
| **3.14 offers "Restage…" despite weak pose/background interactions** | Keep wardrobe edits as the default; label or route restaging according to the packet's weak-task findings. |
| **3.21 allows one NL sentence** | Use two or more where asserting compliance with the packet's NL recommendation. |
| **3.23 "long" SCAIL template is one compact sentence** | Provide an actual caption expansion schema. Wan remains appearance/background only. |
| **3.24 combines Music 3 and YuE2** | Split product entries. |
| **Grammar says four blocks compose freely in every family** | Restrict by task and family. |
| **Style/subject/camera ordering conflicts across sections** | Separate documented formatting requirements from testable placement preferences. |
| **B-AUDIO-AMBIENCE "mandatory unless silence," while silence includes ambience** | Define mutually coherent modes. |
| **Undefined B-MOOD/B-MOOD-music in worked compositions** | Define them or remove the references. |
| **"One role per reference" and retain/refrole exclusions** | Replace blanket bans with explicit compatible/incompatible role examples. |
| **"Universals" include community findings and explicit exceptions** | Retitle as scoped defaults/hypotheses. |
| **Resolution "multi-reporter" certainty** | Preserve the single-venue sourcing fact. |
| **Long-form flat identity and free motion continuity "by construction"** | Independence prevents recursive input drift; it does not guarantee flat identity or error-free motion at boundaries. |
| **SCAIL-native five-frame anchors** | Correct attribution: the inspected five-frame chaining evidence concerns the Saganaki Viggle pack. |

### What makes a preset "good"?

A preset is good when it increases task completion under the user's intent, preserves specified invariants, does not materially raise failures, and earns its cost.

Two experiments: (1) Prompt-form A/B — same engine/settings/intent; preset versus a competent concise baseline with identical requested facts. (2) Product-workflow A/B — preset package versus a realistic naive attempt collected before seeing the preset.

Screen with 4 task cases × 2 paired seeds per selected recipe. Confirm product defaults on 6–8 held-out cases × 4 seeds. Primary measures: weighted per-instruction completion; preservation gates; failure/invalid rate; blind preference with ties; wall time. Predeclare practical benefit and noninferiority margins.

### All 24 presets: run, inherit, rewrite, or defer

| Preset | Disposition |
|---|---|
| 3.1 H3 T2VA | Run preset versus content-equivalent prose; share with X5 and boundary X2. |
| 3.2 H3 I2VA | Run a small utility screen. |
| 3.3 H3 FL2VA | Inherit contract and existing measured join evidence. |
| 3.4 H3 multi-ref | Rewrite, then run. |
| 3.5 H3 video edit | Rewrite, then run. |
| 3.6 H3 removal | Rewrite preservation claim; run. |
| 3.7 H3 camera | Run content-equivalent first-versus-later camera line. |
| 3.8 H3 dialogue | Inherit syntax; screen timing only if production defaults claimed. |
| 3.9 H3 silence | Drop current wording; rewrite and run. |
| 3.10 Qwen edit | Inherit instruction contract; small transfer confirmation. |
| 3.11 Qwen multi-ref | Inherit tag contract; validate role separation. |
| 3.12 Qwen outpaint | Run one focused transfer screen. |
| 3.13 Qwen RGBA | Inherit formula; integration confirmation. |
| 3.14 Krea identity edit | Rewrite restaging; run E-K3. |
| 3.15 AnyPaint | Inherit E-K1 measured contract. |
| 3.16 Ostris insertion | Inherit card contract; small runtime transfer screen. |
| 3.17 Klein edit | Run focused dated-source/True-V1 confirmation. |
| 3.18 Klein multi-ref | Run role-binding and relevant-reference tests. |
| 3.19 Klein exact recolor | Run target accuracy and retention; rewrite "exact." |
| 3.20 Anima portrait | Inherit documented syntax/defaults. |
| 3.21 Anima mixed | Rewrite and run equal-content comparisons. |
| 3.22 Viggle recast | Inherit no-text contract; run pipeline utility through VG-1. |
| 3.23 SCAIL/Wan | Split/rewrite and run caption factorial. |
| 3.24 Music 3/YuE2 | Split entries; inherit documented fields; defer broad validation. |

### Block-grammar probe

For each uncertain pair, a 2×2 design (neither, A, B, A+B) measuring both requested attributes and their interaction. Priority probes: Krea instruction + retain clause; H3 dialogue + silence language; compatible versus incompatible roles on one reference; H3 camera + style/light composition; quoted unwanted text versus positive blank-surface wording. Screen 3 cases × 2 seeds; confirm only default-changing outcomes.

**Decidable without GPU:** nonexistent channels, inactive negatives, unresolved references, unsupported block/task combinations, contradictory audio-mode configuration.

### E-K3 falsifier audit

Replace the full 3×3×3 × two-seed design with: two dial operating points (edit-leaning, identity-leaning); bare instruction; instruction + named keep-list; instruction + length-matched nonconflicting description control; four edit cases × four paired seeds. Test Krea2T separately (enhancer off/on × plain/weighted wording at one fixed dial). Use edit success, calibrated identity, outside-region drift, and failure rate jointly; "neutral" requires an equivalence margin. The current "MEASURED-pending" label should become **prediction, unmeasured**.

### Caption-contract factorial verdict

**Yes: use a small factorial before the bake-off.** For SCAIL and Wan separately: Length {short, long} × grounded detail {low, high}; four representative clips × two paired seeds; length-only expansion must avoid new requested behavior; all primary Wan captions exclude motion; motion-contaminated Wan caption on a diagnostic subset; empty caption only as an explicit failure control. Freeze caption recipes from calibration clips; evaluate on held-out clips.

### Fundamentals: ranked confirmation shortlist

1. Krea retain-clause stripping (reduced E-K3).
2. H3 resolution/adherence collapse (boundary ladder × shift).
3. SCAIL/Wan caption correction (small within-engine factorial).
4. No-speech versus negative speech language.
5. Camera-line-first (identical words, position swapped).
6. Contradictions become unions.
7. Klein retention/role/hex guidance transfers.
8. Specificity gradient.

General aesthetic folklore remains scoped community advice — not compiler rules or default-routing guarantees.

## 9. Changes required before a single generation

1. Freeze the arm ledger and recalculate the budget, including warm-ups, nulls, repeats, failed runs, caption calibration, and independent confirmation.
2. Resolve attachment, pinned-row, kernel, and frame-contract contradictions.
3. Repair the prompting corpus's silence, role typing, preservation, ordering, and SCAIL attribution errors.
4. Redesign X7's latent handoff and add cancellation/matched-compute controls.
5. Pre-register endpoints, practical thresholds, multiplicity, selection, and stopping rules.
6. Calibrate execution noise and metrics locally, with repeated canaries and domain-specific controls.
7. Run reduced E-K3 and caption screens before freezing product defaults or engine comparisons.
8. Replace broad sweeps with paired short probes; reserve long boards for confirmed finalists.

Until these changes are explicit, the batch should remain designed-not-run.
