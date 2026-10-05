# The GPU batch ledger — the run-ready arm ledger (the audit's REDESIGN, converted)

> Flux task: **s1ss3xm** (GPU batch redesign) · compiled 2026-10-04 from
> [gpu-batch-manifest.md](gpu-batch-manifest.md) + Amendments 1–2 (the
> methodology-audit verdict), the experiment designs in
> [h3-sigma-schedule-thesis.md](h3-sigma-schedule-thesis.md) §6–7,
> [viggle-assessment.md](viggle-assessment.md) Addenda 1–6,
> [fresh-eyes-pass-2026-10-02.md](fresh-eyes-pass-2026-10-02.md) §6,
> [krea2-edit-mode.md](krea2-edit-mode.md) §4, and
> [h3-overlap-concept.md](h3-overlap-concept.md) §4. Status:
> **RUN-READY-DESIGNED** — nothing here has touched a GPU; the batch opens
> on the maintainer's word, on the 8189 testbed, per
> [docs/agent/runbook.md](../agent/runbook.md). This ledger SUPERSEDES the
> manifest's block-level arm sketches wherever they conflict (Amendment 3
> records the landing state).

## 0. The execution directive and how to read this ledger

**THE DIRECTIVE (maintainer, 2026-10-03): GPU testing proceeds ONE SET AT A
TIME.** A set is an ordered bundle of arms sharing a board and a gate. A set
opens ONLY when the previous set's exit criteria have been checked and its
measured numbers folded forward (Set B's variance numbers feed every later
set's thresholds; Set D's caption results feed Set G's recipes). Re-planning
happens BETWEEN sets, recorded as dated amendments to this file — never
inside a running set. A set may span more than one GPU window (marked
1W/2W); the invariant is the gate, not the calendar.

**Set order (the audit's §7 ranking — cheap information first):**

| Set | Contents | Sampling? | Size |
|---|---|---|---|
| **A** | Static audits, decode/encode-only controls, null-cancellation controls | **NO** | 0 gens |
| **B** | Calibration: identical-config canaries → MEASURED variance; metric + judge calibration | yes (identical configs only) | ~10 gens · ½W |
| **C** | Sigma mechanics: X1, X3, X6-survivors, X2 (redesigned) | yes | ~84 gens · 2W |
| **D** | Prompt/preset screens: reduced E-K3, caption factorials, X5, preset-ladder | yes | ~80 units · 1–2W |
| **E** | X7 staged base→turbo (state-transformation design + cancellation controls written in §3.E first) | yes | ~44 gens · 1W |
| **F** | Viggle frontier E1–E5 with the audit's controls | yes | ~36 gens · 1W |
| **G** | VG-1 recast bake-off (estimand: shipping-pipeline quality) | yes | ~52 gens · 1–2W |
| **H** | Long-form: two-window seam probe FIRST, then gated long boards; VIG-FPS; VIG-CHUNK | yes | ~15 + gated · 1W+ |
| **I** | Drift suite: replicated whole chains, independent confirmation | yes | ~150–200 · 2–3W |
| **J** | Fresh-eyes pilots, each individually gated with a null control | yes | ~50–70 · 1–2W |

**Number provenance (invariant for the whole ledger):** every number is
either **[MEASURED, source]** — from our corpus, cited — or **[EST]** — a
planning estimate with its anchor stated. Community figures that we have not
measured are tagged **[COMM]** and are NEVER used as decision thresholds,
only as priors (the audit's noise-floor ruling).

**No arm appears without:** pinned config, replication, one primary
contrast + endpoint, a practical-effect threshold, and a decision rule.
Thresholds are formulas over Set B's measured SDs plus a practical floor;
the floors are judgment calls and are tagged [EST] so the maintainer can
override them at the set gate.

## 1. Cross-cutting registrations (pre-registered before ANY sampling)

### 1.1 Pre-registration — families, multiplicity, stopping, selection, ties

- **Confirmatory families.** Each set carries ONE family = the set's
  pre-declared primary contrasts (listed per set below). Within a family:
  **Holm–Bonferroni at α = 0.05** across that set's primary contrasts.
  Cross-set claims carry only their own set's α; because sets are sequential
  and gated, no global batch-wise α is claimable — and the ledger says so
  rather than pretending otherwise.
- **Exploratory family.** Everything else (secondary metrics, cell-level
  reads inside a sweep, post-hoc subgroup looks): **Benjamini–Hochberg FDR
  at q = 0.10**, reported as exploratory, never as a ship decision. Rationale:
  the audit's 60-tests-at-5% ≈ 95% false-positive risk arithmetic.
- **Paired-by-construction rule.** Every contrast pairs arms on (seed,
  prompt, clip, board cell); the paired Δ is the unit. Unpaired reads are
  exploratory by definition.
- **Judge-based endpoints:** sign test over judged pairs (§1.4); an arm
  "wins" a judged primary contrast at ≥ 9/12 consistent wins (one-sided
  binomial p ≤ 0.073 before Holm — i.e., must survive Holm to confirm) AND
  cannot-assess rate < 30%.
- **Stopping rules (pre-registered, generic + per-set):**
  1. *Harm stop:* an arm producing degenerate output (unwatchable fry /
     broken audio / NaN) on ≥ 2 of its 6 cells stops that arm's remaining
     cells; the cells run so far are recorded, the arm marked
     degenerate-at-config. No re-run at "fixed" settings inside the set.
  2. *Futility:* where a set declares an extension clause (X2 stage-2, H's
     long boards, G stage-2), the clause fires ONLY on its pre-registered
     trigger; otherwise the set closes with the null/flat verdict recorded.
  3. *Budget stop:* window exhausted mid-set → resume only at an arm
     boundary with identical config; never redesign mid-set.
  4. *Environment stop:* mid-window testbed/ComfyUI/model-file change, or
     the maintainer claiming the GPU → pause; a fresh canary pair
     (§1.2 item 4) must run clean before any further confirmatory readout.
- **Selection rule (the winner-extension ban):** NO winning arm is extended,
  promoted, or wired on the material it won on. Confirmation = re-run on
  fresh seeds/scenes/clips: X-family winners → 2 fresh prompts × 2 seeds
  before any default changes; VG-1 winner → the held half-board + 2 fresh
  clips; drift winner → new seeds/scenes; seam finalist → the long board.
  (Generalizes the audit's 16-segment-winner correction to every set.)
- **Tie / Pareto rule:** if the primary-endpoint Δ is below
  max(MDE from Set B, practical floor) and no pre-registered secondary
  endpoint separates the arms, report the **Pareto set** over (primary
  endpoint, cost); the **default candidate is the cheapest arm in the
  Pareto set**, explicitly labeled a tie-default pending the maintainer
  checkpoint (§1.4). Ties are results, not failures to find one.

### 1.2 The pre-flight checklist (audit §5) — runs before every window

1. **Attachment policy PER ADAPTER (the resolved contradiction — see §1.3
   for the full table).** Every run's manifest records adapter × mode
   (merged / unmerged-runtime) × strength. The runbook's blanket "turbo
   LoRAs run MERGE mode on the quantized base" is RESCOPED to the H3
   turbo/VDN lineage only; DMD-class distillation deltas ride unmerged.
2. **Pinned-row scoping.** Any arm whose graph pins conditioning rows
   (anchors, chain tails, handoffs, seam flunks, X7 stage-1 output, drift
   chains, VIG-SEAM joints) on an **H3-family** sampler stage runs **≥ 20
   steps, turbo OFF, step-skipping caches OFF** (speed doc §1.6; sampler
   doc §3 constraint 2; wan2gp third confirmation). Scope note (deviation,
   reason): Viggle-Animate's own ref rows are pinned BY TRAINING on its
   3-forward DMD — the hazard class is skip-caches + foreign few-step
   stages mispredicting never-denoised rows, not a model running its own
   trained contract; the rule binds H3 stages, and Viggle runs its card
   recipe with caches off.
3. **Kernel pinning.** Record per run: attention-kernel routing (Viggle:
   sol ≤ 124f, dense > 124f, quantized-attention ghosting > 124f noted —
   Addendum 6); SageAttention OFF for all quality-measurement arms (the
   temporal-flicker bug report) or pinned + recorded if a speed arm needs
   it; the ComfyUI `denoise_mask` grid-artifact check (issue #15981) on our
   pinned version for every masked arm; sparse-attention nodes absent at
   our 0.34.0 pin — any long-sequence arm wanting BlockSparseAttention is
   out of batch scope (version-bump decision, maintainer).
4. **Canary placement.** Set B's canaries precede all sampling sets. Every
   later set's first window opens with ONE identical-config canary re-run
   (drift sentinel for metrics + judge); any environment change mid-batch
   forces a fresh canary pair before further confirmatory readout.
5. **Per-run manifest fields (machine-written, no exceptions):** run id ·
   timestamp · graph hash/BOM · model files + SHAs · adapter × mode ×
   strength · sampler/scheduler/steps/shift pair · **the full executed
   sigma knot array** · seeds · prompt text + packet-recipe id · board/clip
   ids · frame contract check (17n+5, latent-geometry verified — the
   56f→39f silent-clamp lesson) · audio row count (round(frames×5/3)) ·
   kernel routing · the ComfyUI VRAM line ("loaded partially; X MB loaded,
   Y offloaded, lowvram patches: N") · peak VRAM · cold/warm wall times ·
   /free state · ComfyUI version · nvidia-smi baseline before/after ·
   deviations from this ledger ("task text wins, recorded").
6. **Between-arms teardown verification.** `POST /free
   {"unload_models":true,"free_memory":true}` between ARMS (not just
   phases); nvidia-smi to baseline; the lowvram console line captured and
   COMPARED — differing X/Y/N between two arms invalidates their
   comparison regardless of what else changed (Kreatine's measured rule);
   post-OOM or wedged-estimator → restart before the next measurement;
   launch with log + recorded PID, kill by PID only.

### 1.3 The per-adapter attachment policy (audit item 2, resolved and pinned)

| Adapter class | Examples in this batch | Attachment | Why |
|---|---|---|---|
| H3 turbo / VDN speed LoRAs | official Lightning turbo, larryvrh-lineage, VDN dmd-step-250 | **MERGE on quantized base** (runbook tranche rule) | Validated merged on this exact 24 GB stack, measured [MEASURED, tranche 1] |
| DMD distillation deltas | Viggle r64/r128 DMD LoRA, Meridian teacher+turbo pair, Qwen viggle-turbo, HyperFlow | **NEVER MERGE — runtime-attach, strength recorded** | Three independent vendor confirmations: delta ~2 orders below bf16 rounding step; merge is fatal [DOC ×3, viggle-assessment §3.4] |
| Task/style LoRAs on a finetune | E5's style LoRA on the Viggle finetune | **unmerged, adaln-free** | Stacking-on-finetune is [UNK]; unmerged is the only doctrine-clean form |
| Krea 2 edit adapters | Identity Edit v1.2, AnyPaint, ostris | **pack nodes carry the recipe — encode-carrier × transport × LoRA triple must match** | The t=0-vs-index carrier mismatch silently destroys the reference region (meanAD 8.18 vs 50.06, measured ×2) [MEASURED, E-K1] |

Deviation note: this table narrows the runbook's blanket merge rule; the
runbook's own rationale ("judge candidates on the shipping path") is
preserved — the shipping path for the DMD class IS unmerged.

### 1.4 The judge protocol (audit item: "a protocol, not a model name")

- **Pinned judge:** sonnet-class VLM (the house blind-judge convention;
  dispatched sonnet-tier for vision per the standing tier rule), **version
  + sampling params pinned per judging session and recorded in the
  manifest** (temperature 0 or vendor minimum; no system-prompt drift — the
  rubric text is versioned in this repo and referenced by hash).
- **Rubric:** dated, versioned, task-scoped (one rubric per endpoint class:
  motion fidelity, texture/fry, seam visibility, style hold, adherence).
  Each rubric forces an explicit ordering decision per pair plus a
  **"cannot assess"** option.
- **A/B randomization + reversal:** every judged pair is presented twice
  with presentation order reversed and arm labels hidden; randomization by
  run-id hash. Position bias is measured as the reversal-disagreement rate
  and reported per session; a pair scoring contradictory verdicts is a
  tie, not a coin-flip.
- **Ties + cannot-assess:** ties recorded as ties. Cannot-assess rates are
  reported per arm — a high rate is itself an endpoint (degenerate-output
  signal), not missing data to be imputed.
- **Known-corruption calibration set (built in Set A/B, reused all batch):**
  graded corruptions of one clean board render — VAE re-encode, +2 L* gain
  shift, 1-frame temporal jitter, cross-blended seam, identity-swapped
  face crop, ½-resolution downsample. The judge must rank these correctly
  against clean at their known effect sizes before the session's verdicts
  count; the judge's per-effect sensitivity floor is recorded once per
  session.
- **Sentinel pairs for drift:** a fixed 6-pair subset of the calibration
  set is re-judged in EVERY session; sentinel accuracy below the
  calibration floor quarantines the session (model/API drift) and forces a
  re-run under the re-pinned version.
- **Human-review checkpoints (the maintainer, blind, unlabeled
  candidates):** required before (a) any tie-default becomes a wired
  default, (b) any metric-contradicts-blind-read conflict is resolved,
  (c) the X7 and VG-1 verdicts are acted on, (d) any set's exit criteria
  declare a "degenerate" arm class. The judge ranks; the maintainer rules.
- **Banned endpoints, stated:** no FVD (distribution-level, wrong for
  paired small batches — audit ruling); VBench dimensions used
  individually, never as a composite score, and only as exploratory
  corroboration.

### 1.5 The measured-priors register (what later sets may lean on, and what they may not)

| Prior | Value | Class / source |
|---|---|---|
| Render-to-render identity floor | ±0.039 ArcFace / ±0.38 face dE | [COMM, loopforge single-source] — **superseded by Set B before any confirmatory use** |
| Chain-hop drift | ~0.06 ArcFace/hop; ~4% contrast/join; ~⅓ treble/join | [COMM, loopforge] — direction prior only |
| VRAM nondeterminism | 1 MB held VRAM → 1.18% RMS latent change, 100% elements | [MEASURED, Kreatine `krea2-lora-vram-nondeterminism.md`, Krea 2 fp8+LoRA class] — the lowvram-line rule is binding |
| The 12-vs-8 cautionary tale | 12-step arm also ran +50% NFE; delta within nondeterminism range | [MEASURED-but-confounded, Kreatine two-stage §5.2] — hence: **every contrast declares per-arm NFE; NFE-asymmetric comparisons are labeled economic, not quality** |
| Dynamic VRAM vs static | ~2.4× per-step, 9/9 gens clean | [MEASURED, tranche 1] — never pass `--disable-dynamic-vram` |
| VDN-8 wall times (3090, 0.4 MP) | 5s 1:05–1:09 · 10s 2:05 · 15s 3:21 · 20s 4:20; 10s@0.8MP 5:18 | [MEASURED, maintainer VALIDATION_RESULTS] — the cost-model anchor |
| Dense turbo-8 | 28.7 s/step; 10s@0.4MP ≈ 282–306 s | [MEASURED, tranche 1] |
| Viggle wall time | 26 s/clip on B200; ours [UNK] | [DOC card] → Set G measures |
| Handoff/join dB | latent 20.2 vs pixel 18.7; FLF 36.2/34.3; hard cut 9.8 | [MEASURED, tranche 1] |
| Hybrid-adaln identity-through-edit | +3.4 dB | [MEASURED, E-ED1] |
| Seg-cut sampling | 4→6 via first-segment subdivision strictly better | [DOC, Qwen-turbo card] — the X7 matched-NFE comparator's precedent |
| Drift thresholds (pre-set, Block 5) | identity floor 0.25 first-crossing · dE > 5 sustained · plan-error > 2× first-hop · treble −6 dB | design values; floors re-expressed vs Set B SDs at the Set I gate |

**Cost anchors for every [EST] below:** base-20 @ 544p-class 39f ≈ 5–7 min
warm [EST from VDN-8 table × 2.5 step ratio]; turbo-8 ≈ 2–3 min [EST];
image-tier Krea 2 ≈ 1 min @ 2 MP [DOC packet]; per-arm model-load/encode
overhead 2–10 min (TE-cache discipline applies — conditioning cached to
disk, the 12.3-min evicted-reload trap).

## 2. Sets A–J

### Set A — static audits, decode/encode-only, null-cancellation (NO sampling)

**Gate chain:** opens first; needs only the shared install healthy. **All
CPU/console work; zero generations.**

| # | Item | Deliverable | Primary check |
|---|---|---|---|
| A1 | **Knot-array dedup + mid-band density table.** Recompute every candidate sigma grid from the code-true formula (thesis §2–§3) offline: X1's {simple/12, sgm/12, sgm/24, corrected-beta/12}, X6's {turbo manifest grid, sgm_uniform, simple at its NFE}, X7's per-stage grids at t ∈ {0.75, 0.5}. | A table of knot arrays with (a) pairwise max-|Δσ′| — arms closer than 0.05 at ≥ all knots are IDENTICAL-in-effect and merged/dropped; (b) knots inside mid band σ′∈[0.3,0.8] per arm — proving the X1 arms actually span the treatment dimension (at fixed s=12, scheduler choice moves the floor, not the mid band — thesis §3.1/§4a.4). | X6's manifest-vs-simple cells collapse or survive HERE, before any GPU spend (audit's dedupe ruling). Expected [EST]: at 8 NFE the manifest grid and simple/8 differ materially in floor — verified, not assumed. |
| A2 | **The beta-arm relabel (audit triage #1).** Beta(0.8,3) has α<1 ⇒ boundary-peaked at b→0 (terminal/low-noise end) — it is NOT a mid-low peak; it weights the fry direction. | The corrected X1 arm-4: Beta(2,4) (interior mode at b=0.25 — the true mid-low treatment) or the w=0.5 uniform mixture, whichever A1's separation test prefers. Beta(0.8,3) is RELABELED "boundary-peaked (fry-direction probe)" and offered to X3 as an optional exploratory cell, not to X1. | No X1 GPU arm runs under a wrong treatment label. |
| A3 | **Contract/shape checks.** Frame contracts (17n+5; every board clip ffprobe'd + latent-geometry verified per the grid-trim+2 lesson); audio row math (round(frames×5/3); 39f phase-exact); ref-token budgets; graph-BOM compile of EVERY set's graphs (dry-run, manifest emitted, knots logged = designed knots); the per-adapter attachment inventory (§1.3) verified against actual files+SHAs. | A compiled graph per arm with a manifest diff vs this ledger — mismatches fixed in the ledger or the graph before Set B. | Zero "it ran a different grid than designed" surprises; the X7 stage-2 relabel and audio rescale verified by construction in the BOM. |
| A4 | **Decode/encode-only controls.** VAE round-trip dE/PSNR distribution on board frames (the metric pipeline's own floor); latent-hold decode stability (same latent, two decodes across load states); E4-class decode checks already measured (tranche 1) — extended only if Set B's canaries demand it. | The metric-pipeline null table (what "zero" looks like per metric). | Every metric's null response is 0-or-known before it is trusted on arms. |
| A5 | **Null-cancellation controls (metric side).** Identical-input runs through every scripted metric (seam ratio, shimmer gradient ratio + flow-warp residual + alternation-frequency FFT peak, ArcFace, face dE, L*, treble, plan-error) → exact-zero or documented jitter; **known-corruption calibration set built** (§1.4) from one clean tranche-1 render + the graded corruptions, with expected orderings written BEFORE the judge ever sees arms. | The judge calibration set + its expected ranking key (blinded). | The judge's sensitivity floor exists before the first judged pair. |
| A6 | **Environment inventory.** insightface present (tranche-1 lesson: absent → install); pyiqa NIQE/MUSIQ importable; ffmpeg/frozen-audio tooling; fetch-gap list for Sets D–J (SCAIL-2 int8 16.7 GB + Wan-Animate-2 needed BEFORE Set D; Viggle pruned-int8 + r64 LoRA + frozen embed + int8 video VAE before Set F; Meridian 34 GB, VOID, Anime-to-Realism 296 MB, UniLumos, HyperFlow pack before Set J; Fun-Control 6.8 GB branch before Set G) with consent/registry rows to land per licenses policy at fetch time. | The fetch schedule wired to set gates. | No set discovers mid-window that its model is missing. |

**Confound normalizations applied:** the audit's rank-1/2/3 substitutes
(knot dedup, beta relabel, contract checks) + decode-only-first (audit §7).
**Compute:** 0 gens; ~0.5–1 day CPU/console [EST]. **Exit criteria:** knot
table frozen (X6 arm count fixed; X1 arm-4 chosen); all graphs compile with
manifest-verified knots; metric nulls + judge calibration set recorded;
fetch schedule accepted by the maintainer. **Deviation:** none — this is the
audit's list verbatim.

### Set B — calibration (the measured variance every later set depends on)

**Gate chain:** opens after A exits. One board, ONE config, repeated.

- **B1 — identical-config canaries (the audit's 6–8, across loading
  conditions):** 8 renders, identical seed/prompt/config/everything,
  across 4 loading conditions × 2: cold start · warm · post-`/free` ·
  post-foreign-residency (a different model loaded and freed first).
  Manifest captures the lowvram line per run (§1.2 item 6).
  **Endpoint:** per-metric SD (ArcFace, face dE, L*, seam ratio, shimmer
  gradient ratio, flow-warp residual, alternation FFT peak, treble, join
  correlation, plan-error) + per-condition offsets. **These SDs ARE the
  batch's noise floors** — the community ±0.039/±0.38 figures are demoted
  to priors (§1.5). If our floors are WIDER than the community figures,
  every downstream threshold widens automatically (they are formulas, not
  constants).
- **B2 — metric operationalization with controls** (each metric gets its
  null from A4/A5 and its known-effect response from A5's corruptions):
  *seam* = frame-delta at splice ÷ median local motion [COMM loopforge
  convention, now measured]; *shimmer* = temporal-gradient ratio on the
  character mask **+ flow-warp residuals + alternation-frequency spectral
  peaks** (the audit's upgrade — gradient ratio alone is not the metric);
  *identity* = ArcFace vs canonical reference (per-hop where chains);
  *color* = face dE + L* trajectory; *audio* = treble retention, join
  cross-correlation; *motion* = plan-following error (director harness).
- **B3 — detectability table:** for each later set's designs, MDE =
  2.8·SD_B·√(2/n) (paired, n = cell count) per endpoint — published with
  B1's numbers so every set gate can check "was the threshold even
  measurable at this n?" before spend.
- **Compute:** 8–10 gens ≈ ½ window + CPU metric work [EST ~1–2 h GPU].
- **Exit criteria:** SD table + MDE table committed to this ledger as a
  dated addendum; judge passes its calibration set; canary lowvram lines
  stable (else: attachment/load policy bug found cheaply — fix and re-run
  B1 before anything else).
- **Confound normalizations:** audit items 5+6 (measured floors; calibration
  precedes assets). **Deviation:** none.

### Set C — the sigma mechanics (X1, X3, X6-survivors, X2)

**Gate chain:** opens after B exits (thresholds re-expressed vs measured
SDs first). Turbo OFF unless a row says otherwise; pinned rows: none in
C except as noted; every arm logs its knot array (verified vs A1).
Board: 3 fixed prompts (low/med/high motion complexity, from the
movement-director harness) × 2 seeds, 544p-class, 39f, `res_multistep` +
`simple` unless the arm IS the scheduler treatment.

**Primary contrasts (the set's confirmatory family, Holm α=0.05):**

1. **X1 — mid-band density buys motion without fry.** Arms: {simple/12,
   sgm_uniform/12, sgm_uniform/24, corrected-beta(2,4)/12} × 20 NFE ×
   3p × 2s = 24 gens. Primary contrast: sgm/24 and beta/24-class vs
   simple/12 on **motion plan-following error** (paired). Threshold:
   Δ ≥ max(2×SD_B(planErr), 15% relative [EST floor]). Decision: any
   mid-weighted arm beats simple/12 on motion AND does not lose
   high-frequency-energy ratio beyond max(2×SD_B, 10% [EST]) → mid-band
   density confirmed → feeds S2's scheduler dial. Falsifier (thesis):
   mid-peak ≤ simple on motion at matched NFE → S2 parked. Fry endpoint
   (exploratory): skin-patch dE + HF-energy ratio.
2. **X3 — terminal truncation.** σ′_end ∈ {0, 0.05, 0.15} × sgm/12/20 ×
   3p × 2s = 18 gens (the σ′=0 cell shares X1's sgm/12 board → 12 new).
   Terminal-truncation controls: (a) decode uses the sampler's denoised
   prediction at the final truncated knot (the x₀ estimate the step
   already computes) — never a raw partially-noised latent decode;
   (b) NFE bookkeeping declared (truncation saves ≤ 1 NFE — the contrast
   is quality-at-matched-grid, not speed); (c) the β(0.8,3) boundary-
   peaked grid offered as an exploratory fry-direction cell. Primary
   contrast: truncation vs full on **HF-energy/texture retention** with
   no structure loss (plan-error within max(2×SD_B, 10%)). Threshold as
   X1. Decision: σ′=0.05 or 0.15 holds texture ≥ full AND structure flat
   → terminal-window discipline (S4) confirmed at that value; else S4
   defaults to σ′=0.
3. **X6 — distill off-distribution penalty (surviving arms only).** After
   A1's dedup: turbo-8 at its manifest grid vs each SURVIVING alternative
   grid at matched NFE × 3p × 2s ≈ ≤ 12 gens (turbo tier). Primary
   contrast: manifest vs worst alternative on **blind judge + collapse
   metrics**; threshold: judge separation ≥ 9/12 consistent wins. Decision:
   the measured penalty calibrates S1's off-distribution warning
   threshold; no surviving alternative ≈ X6 closes at A1 with "manifest ≡
   grid-in-effect" recorded.
4. **X2 — resolution × shift, the boundary ladder (audit triage #2).**
   Resolutions {544p, 576p, 768p} (the ladder the audit demands — 352/
   1088 dropped; 576p is the untested boundary between the turbo-trained
   lines). Stage 1 (confirmatory): all three @ s=12 × 3p × 2s = 18 gens
   (544p cell shares X1's board). Primary contrast: quality endpoint
   (blind judge + adherence/structure metrics) vs resolution at native
   shift — is there a cliff, and on which side of 576p? Threshold: judge
   Δ ≥ 9/12 between adjacent rungs or metric Δ ≥ max(2×SD_B, 10% [EST]).
   Stage 2 (EXTENSION CLAUSE, fires only if stage 1 shows a cliff or a
   res×quality trend ≥ threshold): {544p, 768p} × s ∈ {8, 18} × 3p × 2s =
   24 gens; interaction declared present if the optimal shift moves
   across resolution by Holm-surviving contrast. s=10 (FastH3's
   deviation) is an exploratory add-on cell on the cliff rung only.
   Decision: flat → H3's shift is resolution-flat in this envelope, S3
   parks; trend → S3's per-resolution table gets the measured knots.
   **Deviation (stated):** the thesis's full 4-shift × 3-res grid (72
   gens) is reduced to a gated 18+24 per the audit's gate-8
   (paired-probe) doctrine and window honesty.

**Confound normalizations:** shift-12-first scheduler families (the
families compared where they actually separate); audio-shift held at 3
throughout C so X2/X1/Y move video-only (X4 owns the audio axis); NFE
declared per arm everywhere (the Kreatine 12v8 lesson, §1.5).
**Compute:** window 1 = X1+X3+X6 ≈ 48–54 gens ≈ 5–7 h [EST]; internal
gate; window 2 = X2 ≈ 18–42 gens ≈ 3–5 h [EST] (768p cells ≈ 2× the 544p
step time, token-linear). **Exit criteria:** X1/X3/X6 verdicts written
into this ledger; X2 stage-1 verdict + whether stage-2 fired; winning
configs queued for fresh-material confirmation (§1.1 selection rule);
all knots logged = designed knots (A1 table).

### Set D — the prompt/preset screens (BEFORE any defaults freeze — audit gate 7)

**Gate chain:** opens after B (needs C's boards? No — D is independent of
C except shared harness; may run in either order after B, but its VERDICT
gates the defaults, so it must land before any preset wiring). Needs
SCAIL-2 + Wan-Animate-2 fetched (A6) with consent rows.

1. **D1 — reduced E-K3 (Krea 2 dial × prompt-discipline).** Original
   3×3×3×2 ≈ 54 (krea2-edit-mode §4) REDUCED: `grounding_px` {384, 768}
   (corners bracket 512) × `ref_boost` {1, 4} (corners bracket 2) ×
   prompt {bare instruction, +H3-style keep-list, +Krea2T weighted
   phrases} × 2 seeds on the synthetic-portrait subject = 24 images, +
   scene-with-logo subject at dial center × 3 prompt arms × 2 seeds = 6.
   Total 30 images ≈ ½–1 h [EST, ~1 min/image]. Primary contrast (the
   confirmatory one): keep-list vs bare at matched dials on
   **identity-through-edit (ArcFace) + edit-landed**; threshold: |Δ| ≥
   max(2×SD_B(ArcFace-on-stills… measured on video canaries — image-tier
   floor measured in-set from 2 duplicate cells), 0.02 ArcFace [EST]) +
   edit-landed not degraded. Decision: keep-lists neutral-to-harmful →
   the guide's dialect-swap rule stays "bare instructions on Krea 2";
   keep-lists help → rule corrected before defaults freeze. Secondary
   (exploratory): dial dominance (corner spread), Krea2T composition.
2. **D2 — caption factorials (SCAIL-2 × Wan-Animate-2).** Per engine:
   caption ∈ {bare/empty, short, long packet-recipe} × 3 fixed clips ×
   fixed seed = 9 gens/engine, 18 total (Viggle EXCLUDED — text-free by
   frozen embed, Amendment 1). Primary contrast per engine: long vs bare
   on **blind judge + task metric** (SCAIL: replacement fidelity;
   Wan: appearance fidelity + motion exclusion check); threshold ≥ 9/12
   consistent wins. Decision: converts both WEB-FILLED contracts to
   MEASURED; the winning recipe becomes that engine's VG-1 caption arm.
   The bare arm is the prompt-poverty control the bake-off needs.
3. **D3 — X5, the IR-gap with content-equivalent arms (audit's
   phrasing).** Prompt arms {naive one-liner, six-section hand-written,
   LLM-compiled (DeepSeek-class compiler)} — all three describing the
   SAME shot content per board cell (content-equivalent by construction:
   the contrast isolates STRUCTURE, not content) × 3 prompts × 2 seeds =
   18 gens on the X1 board/grid. Primary contrast: compiled vs naive on
   adherence metrics + blind judge; threshold ≥ 9/12 + metric Δ ≥
   max(2×SD_B, 10% [EST]). Decision: sets S5's value target; hand-written
   vs compiled splits the structure benefit from the compiler's.
4. **D4 — H3 preset-ladder A/B.** Curated T2VA/I2VA presets vs stripped
   prompts at {544p, 768p} × 2 prompts × 2 seeds = 16 gens. Primary
   contrast: preset vs stripped at 768p specifically (the collapse rung —
   does curation buy headroom where the model is weakest); threshold ≥
   9/12. Decision: presets validated/trimmed before the prefill layer
   freezes.

**Confound normalizations:** reduced per gate-7; caption control per
Amendment 1; BFL-drift caution applies to any Klein arm (none in D).
**Compute:** ~30 images + 34 video gens ≈ 1–2 windows [EST].
**Exit criteria:** D1–D4 verdicts written; caption recipes frozen for
Set G; the guide's dialect-swap and preset cells re-tagged MEASURED or
corrected.

### Set E — X7, the staged base→turbo handoff (design FIRST, arms second)

**X7's redesign — the state-coordinate transformation, written out.**

*The question:* at handoff time t, the latent x_t produced by the base
stage must serve as a valid state for the turbo stage's solver at label
σ′_turbo(t). "Shared base position n/20 = m/8" is **index alignment, not
physical state validity** (audit item 4). What validity actually requires,
component by component:

1. **Noise-content vs label (C1).** Under H3's flow convention a state at
   knot σ is the mixture (1−σ)x₀ + σε. The base stage's integration
   leaves the state at ITS knot value σ′_base(t); the turbo stage labels
   the same state σ′_turbo(t) — the labels differ by construction
   (t=0.75: 0.973 vs 0.947; t=0.5: 0.923 vs 0.857; t=0.25: 0.800 vs
   0.667 [MEASURED-formula, thesis §2/§6-S7]). The mislabel grows as the
   handoff deepens — which is WHY t=0.75 is the primary arm and t=0.5 the
   stress arm, and why the per-stage-label design (each stage stamps its
   own σ′) is the coherent choice rather than forcing one label.
2. **Audio-row rebasing (C2).** The sampler carries the packed audio rows
   scaled by audio_scale = s_v/s_a (4.0 on 12/3, 2.0 on 6/3): crossing
   stages rescales the audio rows by the scale ratio (unpack → rescale →
   repack). Getting it wrong garbles audio SILENTLY — hence the audio
   sub-endpoint below is mandatory, not decorative.
3. **DiT-side audio remap (C3).** The DiT derives the audio stream's true
   timestep per step by inverting the incoming video sigma and re-applying
   the audio shift (σ_a = shift(3, unshift(s_v, σ_v)) — thesis §2.2). With
   per-stage (s_v) differing, the audio rows' effective timestep differs
   per stage even for the same physical state; the rebasing must cover
   BOTH the sampler-side scale and this DiT-side remap (the MiniMaxH3
   SigmaShift patcher must be re-applied per stage — two model patches,
   one per stage, both native nodes).
4. **Distillate interval semantics (C4).** The turbo student predicts
   interval-averaged velocity for ITS OWN trained grid (Krea 2 measured:
   16 steps worse than 8 at identical sigmas — interval mis-integration).
   Therefore the turbo stage runs its OWN manifest step count and grid —
   never a foreign subdivision — and the handoff lands ON a knot of both
   grids (the n/k formula: shared t ∈ {0.75, 0.5} for base-20 × turbo-8),
   never mid-interval.
5. **Solver-history reset (C5).** A multistep solver's state includes its
   cached previous denoised output; the turbo stage starts with an EMPTY
   cache — its first step degrades to first order. Pinned by design (not
   fixed, declared): base stage `res_multistep`/simple/20; turbo stage its
   card sampler at manifest grid. Stochastic samplers on the base stage
   (seeds_2 class) are excluded — the handed-off state must be a clean
   ODE point, and seeds_2's intermediate-σ evaluation is already in the
   avoid class for distilled stages.
6. **Conditioning-row invariance (C6).** Ref/keyframe rows are
   never-denoised and cross unchanged; the packed latent object is handed
   over AS the object (never decoded/re-encoded); audio rows per C2/C3.
   Frame contract and RoPE layout identical by BOM (A3).

*What the cancellation controls measure:* base→base through the IDENTICAL
machinery (split, per-stage relabel, audio noop-rescale ×1.0, cache reset)
must reproduce continuous base-20 within Set B's floors — else the
machinery itself is invalid and every staged number is uninterpretable.
turbo→turbo likewise isolates the index-vs-state cost inside the distilled
family, where C4 bites hardest. These two controls are the audit's
requirement and Set E's precondition — if base→base fails, Set E stops at
the gate (machinery redesign is a between-sets amendment).

**Arms (fixed 3 prompts × 3 seeds; 544p; audio on — the rebasing must be
exercised; per-arm NFE declared):**

| Arm | Config | NFE | Role |
|---|---|---|---|
| E-a | pure turbo-8, manifest grid (6/3), unmerged if DMD-class | 8 | the economic incumbent |
| E-a′ | **turbo-11-segcut** — manifest 8-grid with the highest-noise segment subdivided into 4 (Qwen seg-cut precedent, §1.5) | 11 | **the matched-≈11-NFE comparator** — kills the compute confound |
| E-b | staged: base-20 (12/3) → handoff t=0.75 → turbo manifest from knot 6/8 (6/3) + audio rebasing | 5+6 = 11 | the primary staged arm |
| E-b′ | staged at t=0.5 (10+4 = 14 NFE) | 14 | the deep-handoff stress arm (C1 grows) |
| E-c | pure base-20 (12/3) | 20 | the quality ceiling |
| E-d | **base→base cancellation**: base-20 split at t=0.75 (5+15), full machinery | 20 | machinery validity |
| E-e | **turbo→turbo cancellation**: turbo-11-segcut split 5+6 | 11 | index-vs-state cost in-family |

24 cells... arms 7 × 3p × 3 seeds = 63 gens — OVER window; trim: E-b′ and
E-e at 2 seeds (−6) and E-d at 2 seeds (−3) → **54 gens ≈ 1 long window
[EST 6–8 h]** (turbo arms are ~2.5× cheaper; effective ≈ 46 base-equiv).

**Primary contrasts (Holm family):** (1) E-b vs E-a′ at matched 11 NFE on
adherence + blind judge — the economic question WITH the confound removed;
threshold ≥ 9/12 + metric Δ ≥ max(2×SD_B, 10% [EST]). (2) E-b vs E-c on
judge quality — the ceiling gap. (3) E-d vs E-c within Set-B floors — the
machinery gate (must NOT separate; a separation here is a STOP, not a
finding). **Mandatory sub-endpoint:** audio join correlation + timbre
(treble) on E-b vs E-c — validates the C2/C3 rebasing math; audio
degeneration on E-b with clean E-d ⇒ rebasing bug ⇒ arm STOPPED and the
defect written up (silent-garble is exactly the failure the audio endpoint
exists to catch). **Decision rule:** E-b > E-a′ at matched NFE on
adherence AND E-b ≱ E-c beyond floors → S7 is a product path (quality at
~55% of base cost); E-b ≤ E-a′ AND E-b < E-c → the Krea 2 pattern does
not pay on H3 (guidance-1 base has no real-CFG stage-1 benefit — the
thesis's prior) → S7 parked with the measured reason.
**Confound normalizations:** audit item 4 in full; NFE declared per arm
(§1.5); turbo attachment per §1.3. **Deviation:** E-a′ (segcut) is added
beyond the audit's literal "matched comparator" — the only shipped-recipe-
precedent way to reach ≈11 NFE on a fixed-ladder turbo; stated here so the
maintainer can veto it at the gate. **Exit criteria:** machinery gate pass
recorded; primary contrasts resolved; S7 verdict + the state-transformation
write-up amended with measured numbers; fresh-material confirmation queued
for any winning config.

### Set F — the Viggle frontier (E1–E5, with the audit's controls)

**Gate chain:** opens after B and D (D2's recipes don't apply — Viggle is
text-free — but D's board material is shared); needs the Viggle fetch set
(A6). All arms: pruned-int8 finetune + r64 DMD LoRA **unmerged** (§1.3),
frozen embed, card recipe (euler-class, 3 forwards, sigma preset 4),
`ref_image_size: match`, kernel routing recorded (sol ≤ 124f), 2 clips ×
2 seeds per cell unless noted; caches off (§1.2 item 2 scope note).

| # | Arms | Primary contrast → endpoint | Controls (the audit's list) | Decision rule |
|---|---|---|---|---|
| F1 (=E-A) | full-frame stylized repaint: {2D-cel, clay} anchor repaints; + the reverse direction (anime driving + photoreal anchor) | styled vs source-driving on **style-hold (blind judge, whole clip) + motion fidelity (DWPose/flow to driving)** | **unchanged-anchor control** (same clips, anchor repainted with NO style change — any metric movement under the null anchor is pipeline noise, not treatment); threshold floors from Set B | whole-scene restyler confirmed if styled arms hold style ≥ 9/12 AND motion within max(2×SD_B, 10%) of the unchanged-anchor null; reverse direction reported as its own exploratory verdict [UNK→measured] |
| F2 (=E-C) | `visual_cond_noise_aug` ∈ {0.999, 0.95, 0.85, 0.70} | the **joint curve**: ArcFace-to-anchor AND DWPose-to-driving reported TOGETHER across the sweep (the audit's ruling — one knob moves BOTH authorities; no single-authority causal claim) | unchanged-anchor cell as the 0.999-adjacent null; claim narrowed to "the adherence/identity-blend interpolation" | the curve's knee locates the operating point for Addendum-4 appearance work; monotonicity checked, non-monotonic reported as-is |
| F3 (=E-B) | dual anchor (front+back) vs single-front | dual vs single on **identity hold + back-view fidelity** | **duplicate-front control** (two copies of the SAME front frame in both slots — isolates slot-count/multi-ref off-distribution cost from actual back-view information; trained-with-2 slots per Addendum 6) | dual wins only if it beats single AND the duplicate-front null shows the gain is not slot-count artifact |
| F4 (=E-D) | denoise-mask scoping: character m=1 / background m=0.15 | scoped vs controls on **background lock (dE outside character) + replacement quality** | **uniform-mask control (m=1 everywhere)** + **background-0 control (m=0)** — the two boundaries of the dial; #15981 grid-artifact check per §1.2 | region-scoped replacement confirmed if scoped arm holds background beyond uniform-mask by ≥ threshold AND does not lose replacement vs uniform |
| F5 (=E-E) | style-LoRA-on-finetune smoke: strength {0.5, 1.0} | styled vs plain on **style transfer + identity hold** | **zero-LoRA control** (the same board, LoRA absent — the baseline any LoRA effect is measured against); unmerged, adaln-free (§1.3) | gates the own-adapter track (license-clean per Addendum 6): smoke passes → the medium-transfer-LoRA follow-on is schedulable; fails → own-adapter track re-planned |

**Compute:** ~36 gens × 2–6 min [EST] + fetch/load ≈ 1 window.
**Confound normalizations:** audit triage #6–#9 (E2 joint curve, E3
duplicate-front, E4 uniform+bg-0, per-adapter attachment). **Deviation:**
none. **Exit criteria:** E1–E5 verdicts + the joint F2 curve written into
viggle-assessment as a dated addendum; own-adapter gate resolved; any
winning knob queued for fresh-clip confirmation.

### Set G — VG-1, the recast bake-off (estimand declared)

**THE ESTIMAND (audit triage #5): shipping-pipeline quality** — each
engine as we would SHIP it on our stack: its packet-tuned caption recipe
(D2's winner), its shipped quant/config on 24 GB, our graph factory. This
is NOT intrinsic-engine quality; engines-with-bad-defaults that shine when
tuned are exactly what a shipping comparison must surface. Declared once,
here, so no post-hoc reinterpretation.

- **Board:** the fixed 8-clip board (4 human incl. one fast-motion + one
  re-entry case, 2 non-human, 1 multi-character, 1 prop/scene swap),
  split **half-board screen / held half-board confirmation** (§1.1
  selection rule).
- **Stage 1 (screen, half-board, 4 clips):** engines {Viggle pruned-int8
  (+r64 unmerged), SCAIL-2 int8-convrot, Wan-Animate-2 distilled} ×
  packet-tuned captions + incumbents {Fun-Control DWPose (6.8 GB branch
  fetched, consent row), H3 R2V character-sheet refs} = 5 arms × 4 clips ×
  1 seed = 20 gens; **+ per-engine caption control**: the 3 engines ×
  bare-default caption × 4 clips = 12 gens (Amendment 1's prompt-poverty
  control — the tuned-vs-bare delta is reported PER ENGINE as its own
  exploratory endpoint). Total 32.
- **Stage 2 (gated on stage-1 ranking, fires for finalists only):**
  held half-board + 2 fresh clips × finalist engines at tuned captions ×
  2 seeds; **control-surface arms**: DMD-LoRA strength {0.5, 1.0} +
  **zero-LoRA** × 4 clips = 12; `ref_image_size` {match, max} × 4 = 8.
  ≈ 20–28 gens.
- **Endpoints:** per-clip DWPose keypoint error vs driving (human clips) —
  primary motion endpoint; ArcFace/DINO to painted ref — primary identity
  endpoint; both vs Set B floors. **Published columns: peak VRAM + wall
  s/clip — the first published 24 GB numbers for Viggle and Wan-A2**
  (fresh-eyes §5's honest not-found).
- **Primary contrasts (Holm):** each engine vs the Fun-Control incumbent
  on the motion endpoint at matched clips; identity endpoint reported as
  the paired second family. Threshold: Δ ≥ max(2×SD_B, 10% [EST]) + judge
  corroboration ≥ 9/12. **Decision rule:** an engine ships as a recast
  lane only if it beats the incumbent on motion AND is not-worse on
  identity at a wall-time the maintainer accepts; Pareto/tie rule §1.1
  otherwise (a slower-but-nonhuman-capable engine is a lane ADDITION, not
  a winner — the complementarity frame, viggle §4.1).
- **Confound normalizations:** estimand declared; caption controlled per
  engine; NFE/steps per engine manifest-declared (SCAIL 40-step card
  recipe vs Viggle 3-forward vs Wan 10-step — cross-engine wall-time
  comparisons are ECONOMIC columns, never quality ones, §1.5).
- **Compute:** stage 1 ≈ 32 gens minutes-class ≈ ½–1 window; stage 2
  gated ≈ 1 window [EST]. **Exit criteria:** stage-1 table + wall-time
  table committed; finalists confirmed or killed on held material; the
  lane decision recorded for the registry/app wiring follow-on.

### Set H — long-form (the two-window seam probe BEFORE long boards)

**Gate chain:** opens after F (needs a winning recast engine or runs on
Viggle pending G — order fixed: after G so the seam strategy is tested on
the engine that will carry it; deviation allowed only by maintainer).

1. **H1 — the two-window seam probe (audit gate 8: long boards are for
   finalists; the probe is cheap).** One source board → 2 windows
   (≤ 124f, cut-aligned). The **anchor-provenance × stitch factorial**:
   provenance {canonical reference (Addendum-3 independent hops), chained
   previous-tail (the Saganaki `five_frame_anchor` pattern — correctly
   attributed to the VIGGLE pack, not SCAIL)} × stitch {pixel blend
   (17–22f), blend + S-class seam re-denoise} = 4 cells + the staggered
   double-coverage arm (S3) = 5 seam treatments × 1 seam each + 2 source
   windows ≈ 7–9 chunk gens + CPU stitching. **Endpoints:** seam ratio +
   flow-warp residual + alternation FFT peak (the Set-B shimmer metric)
   per seam; per-chunk ArcFace vs canonical reference (flat = the
   Addendum-3 prediction; chained predicted to walk). Primary contrast:
   canonical+blend vs chained+blend on per-chunk identity flatness;
   threshold: slope vs chunk index beyond max(2×SD_B, 0.02 ArcFace/chunk
   [EST]). The +S cells test whether re-denoise buys anything blend
   doesn't (predicted overkill for same-reference re-renders — Addendum
   3 §3). **Decision:** the winning treatment (and ONLY it) proceeds to
   the long board; if chained ≈ canonical within floors, the simpler
   community pattern wins the default slot and independent-hops stays the
   drift-doctrine exception.
2. **H2 — long-board confirmation (GATED on H1):** 1 board × 6–8 chunks
   on the winning treatment, per-chunk drift check, source-audio mux
   (never generated, never joined — Addendum 3 §4). ≈ 6–8 gens.
3. **H3 — VIG-FPS with matched timestamps.** {native-24, conform-16 +
   RIFE, N=2 interleave} × 1–2 clips (N=4 ONLY if N=2 shimmer clean —
   pre-registered). **Matched-timestamps control:** every variant is
   evaluated at the SAME output timestamps against the same source-frame
   ground truth (the interleave reassembles source frames, RIFE
   synthesizes — comparing at unmatched timestamps measures resampling,
   not shimmer). Endpoint: the Set-B shimmer metric on the character
   mask, interleaved vs coherent native baseline. Decision: fills the
   rate-plan table's decision cells (Addendum 5); native-24 tolerance
   answered BEFORE any N=4 spend (Addendum 5's sequencing note).
4. **H4 — VIG-CHUNK limit re-verification.** CPU/API doc check of the
   124f (Viggle) and 81f/76f (SCAIL) ceilings against CURRENT cards/APIs
   + one probe gen per engine at the claimed ceiling. The envelope was
   recorded 2026-09-14 and Viggle iterates — re-verify, don't inherit.

**Compute:** H1+H3+H4 ≈ 12–15 gens ≈ 1 window; H2 gated ≈ 1 window.
**Confound normalizations:** seam-before-boards (gate 8); attribution
corrected (Saganaki not SCAIL — the manifest's Block-4 correction carried
into the arm name); matched timestamps (audit). **Deviation:** none.
**Exit criteria:** seam strategy chosen on measured numbers; rate-plan
cells filled; ceilings re-verified with dates; long-board verdict written.

### Set I — the drift envelope (replicated whole chains; the audit's replication ruling)

**Gate chain:** opens after C (harness + floors) — the suite's material
and metrics are H3-side. **The unit of replication is the WHOLE CHAIN**
(audit: hops-are-not-seeds — hop-level observations are correlated within
a chain; chain replicates, not hop re-rolls, carry the error term).

- **I0 — falsifier-first cheap probe (before the matrix):** one degraded
  124f segment (from the suite's own baseline chain or the tranche-2 E5
  tail — zero extra gens for source) → R1 vs R2 (refs-alongside) ≈ 4–6
  gens. The identity-in vs identity-out readout (reanchor §5.1) decides
  whether the R-family matrix is worth its cost: R2's claim falsified
  here → the matrix shrinks to the drift arms proper.
- **I1 — arms v1, replicated:** A (plain 22f continuation) · B (+identity
  payload) · C (+payload +re-anchor@4) · F (combined-best) — 8 segments
  each × **2 whole-chain replicates** (different base seeds) = 64
  segment-gens; frozen-audio-prefix arm (1 chain × 2 reps = 16);
  guide-soundtrack anchor 39f (2 gens); S seam re-denoise (strip-class,
  ~⅛-window passes ≈ 8–12 strip-gens). Metrics per hop with
  hops-as-repeated-observations inside the chain replicate; thresholds =
  Block 5's pre-set values re-expressed against Set B's floors
  (identity 0.25 first-crossing · dE > 5 sustained · plan-error > 2×
  first-hop · treble −6 dB).
- **I2 — the R-family (gated on I0):** R1/R2/R3 × 8 windows × 2
  replicates = 48 re-render passes (~1× chain cost each — the honest
  priciest-mitigation framing, reanchor §5.2).
- **I3 — independent confirmation REPLACES winner-extension (audit):**
  the winning arm re-run on **new seeds/scenes** (1–2 fresh chains ≈
  16–32 gens) — never a 16-segment extension of the chain that won.
- **Primary contrasts (Holm):** each mitigation arm vs A on
  identity-runway (first-crossing segment index, chain-replicate pairs);
  C vs B isolates re-anchor; F vs best-single tests composition.
  Thresholds above. **Decision:** runway-per-axis ÷ cost table → the
  chain-manager policy inputs (soft joints for long takes, re-anchor for
  identity-critical chains — overlap-concept §4.2), not a universal
  default.
- **Confound normalizations:** whole-chain replication; winner-extension
  ban; joint-vs-interior drift split for S; texture over-smoothing check
  vs floors for repeated SDEdit-class passes.
- **Compute:** I0 ≈ 4–6; I1 ≈ 90–95; I2 gated ≈ 48; I3 ≈ 16–32 →
  **~110–180 segment-gens ≈ 2–3 windows [EST]** — the batch's biggest
  line item, priced honestly, and the reason I0 exists.
- **Exit criteria:** runway table committed; winner independently
  confirmed or demoted; chain-manager policy inputs written.

### Set J — the fresh-eyes pilots (each individually gated, each with its null)

**Gate chain:** each pilot opens independently after B; fetch rows per
A6. Common shape: 1–2 clips × 2 seeds, null control, blind judge, one
primary contrast, kill-or-promote rule; all exploratory EXCEPT the
pre-declared primary per pilot (Holm within the set).

| Pilot | Arms | Null control | Primary contrast → decision |
|---|---|---|---|
| J1 = Q1/E-G1 | adherence bake-off: Fizgig Prompt Strength vs T8mars shift-aware gain vs Semantic Bridge; 576p sanity + 768p collapse + loosen arm | **guidance-1 stock, no mechanism** | mechanism vs null on adherence+judge at 768p (the weak rung) → at most one mechanism promoted to a defaults candidate; none beats null → the adherence race stays unbought |
| J2 = Q4/E-G2 | Meridian INT8 camera/retime: 3 graphs (slide 0.12 / freeze-orbit 0.03 / 1to1) + MoGe-warp comparator; adapters unmerged, summed 1.0 | **base render, same prompts, no camera LoRA** | camera-compliance vs null (blind + geometry metric) → INT8-at-24GB verdict; MoGe arm decides the non-LoRA fallback |
| J3 = Q5 | VOID deterministic removal vs instruction edit vs denoise-mask (E-ED4's fourth arm) | **untouched input passthrough** (deterministic method's trivial null) + no-edit regenerate for the generative arms | pixel-exact-outside-region (PSNR/LPIPS) vs each generative arm → the preservation-ceiling attack verdict |
| J4 = Q7 | TeleStyle-on-H3 styled-keyframe→propagate + Viggle style-repaint | **unstyled propagate on the same keyframes** | style hold over length vs null (style decay = the falsifier) → pattern-ADOPT stays or upgrades |
| J5 = Q8 | Anime-to-Realism LoRA grounding pilot (VLM-caption cuts + LoRA + retention clauses) | **no-LoRA same prompts** | conversion quality vs null across cuts (tails-converted check) → matrix placement |
| J6 = Q9/E-G5 | base-model true-CFG falsifier (empty-negative + reference-wiring + PMC cap) | **guidance-1 stock** (the design IS falsifier-vs-null) | adherence vs null without quality loss → doctrine settled (guidance-1-on-base stays or true-CFG headroom opens) |
| J7 = Q10/E-G3 | reference-annealing (CADS equation, ~60-line wrapper) vs guide-freeze vs pin-drag | **no-annealing baseline** | anchor-drift failure modes vs null → the reference-staleness lever verdict |
| J8 = Q11 | UniLumos relight vs H3 instruction relight; HyperFlow-H3 tier-ladder rung | incumbent lanes (H3 relight / base sampler rung) | challenger vs incumbent on task metric + cost → registry rows |

**Compute:** ~50–70 gens across tiers ≈ 1–2 windows + fetches [EST].
**Confound normalizations:** every pilot carries a null (the audit's
per-pilot gating); license rows land with fetches (Meridian's VGGT-FAIR-NC
flag surfaces at consent; Anime-to-Realism is CivitAI user-fetch class).
**Exit criteria:** per-pilot verdicts from the ADOPT/ADJUST/CORRECT/
CONFIRM menu written into fresh-eyes-pass as a dated addendum; nothing
promotes without its null having run.

## 3. The honest total budget

| Set | Gens (planning) | Windows [EST] |
|---|---|---|
| A | 0 | — (CPU) |
| B | 8–10 | ½ |
| C | 66–96 (after dedup/sharing, X2 extension gated) | 2 |
| D | ~64 + 30 images | 1–2 |
| E | 54 | 1 (long) |
| F | ~36 | 1 |
| G | 32 + gated 20–28 | 1–2 |
| H | 12–15 + gated 6–8 | 1 + gated |
| I | ~110–180 (I0 gates I2) | 2–3 |
| J | ~50–70 | 1–2 |
| **Total** | **≈ 430–520 gens + 30 images** | **≈ 10–14 windows** |

The manifest's original "one window" framing for Block 1 was wrong by an
order of magnitude (audit item 1); this is the honest shape, and the
one-SET-at-a-time directive is what makes it executable. Every gated
clause above is a place the total can and should shrink on evidence.

## 4. Amendment log for this ledger

- Amendments record dated verdicts and design changes, one per set gate, per §1.1's between-sets re-planning rule.

## Amendment 1 — the maintainer-review surface (standing rule, 2026-10-04: "my own eyes on test results... validate A/B testing as well as automated tools")

Every set that produces judged outputs ships, alongside its metrics doc:

1. **The review directory** — `gpu-review/<set>/<arm>/<run>/` carrying the raw outputs with their per-run manifests (the config that made them), organized so any video can be traced to its arm in one glance.
2. **Blinded A/B pairs** — for every contrast the set judges, a `pairs/` folder of randomized-order pairs (L/R or 1/2, blind filenames, same timestamps/trims), with the arm key escrowed in `pairs/.key` (yaml, not opened until after the maintainer's calls are recorded).
3. **The review page** — `gpu-review/<set>/review.html`: a static page of side-by-side looping players, one row per pair, with per-pair response capture (left/right/tie/cannot-assess + optional note) that writes a local JSON the set's results doc consumes. No framework, no server — opens from the filesystem.
4. **The recorded verdict table** — the maintainer's calls and the automated metrics side-by-side in the set's results doc; disagreements are the protocol's escalation trigger (§1.4b), never resolved by tool authority alone.

This extends §1.4's human-checkpoint list from "before verdicts are acted on" to "every judged set, by default" — the maintainer is a first-class judge, not a final approver. Set A's calibration set ships under the same surface (the corruption ladder must pass the maintainer's eye before the automated judge's floor counts).

## Amendment 2 — Set A verdicts (dated 2026-10-04; the static/no-sampling set, executed per [gpu-batch-setA-results.md](gpu-batch-setA-results.md))

**Design changes landed by A1's dedup + A2's relabel (the pre-registered
< 0.05 max-|Δσ′| merge rule, code-true grids from the canonical install):**

1. **X1 arm set 4 → 3.** `sgm_uniform/24` (X1-c) MERGES INTO `sgm_uniform/20`
   (max-|Δσ′| = 0.0358 — identical-in-effect; 24 steps buys knot density the
   rule counts as no treatment difference) → X1-c is DROPPED (−12 gens). The
   w=0.5 uniform mixture MERGES INTO `Beta(2,4)/20` (0.0455) → **X1 arm-4 =
   Beta(2,4)/20** (the simpler representative; directly expressible as the
   stock `beta_scheduler(α=2, β=4)` quantile grid). Surviving separations:
   simple/20 vs sgm/20 = 0.0521 (runs); beta(2,4) vs sgm/20 = 0.0792 (runs).
   Mid-band (σ′∈[0.3,0.8]) knot counts: simple 5 · sgm 4 · beta(2,4) 7 — the
   treatment dimension is spanned by the beta arm, confirming thesis §3.1's
   "scheduler choice moves the floor, not the mid band" at s=12 in stronger
   form (even steps 20→24 barely moves the grid).
2. **Beta(0.8,3) RELABELED** boundary-peaked (fry-direction probe; α<1 ⇒ peak
   at b→0, 8/20 knots below σ′=0.5, floor 0.098) — X3's optional exploratory
   cell ONLY, never an X1 "mid-low" arm (audit triage #1 executed).
3. **X6 verdict (manifest-vs-simple): the cells PARTIALLY collapse.**
   `simple/8 ≡ sgm_uniform/8` (0.0211 → merged, one cell). The larryvrh-lineage
   v4 CARD recipe is **Euler + Beta(0.6,0.6), 6–8 steps** (thesis §5.2 [DOC]) —
   materially different from simple/8 (0.2067; floor 0.4249 vs 0.6316). X6 =
   2 cells: {card-beta grid} vs {simple ≡ sgm}. FINDING: tranche-1's turbo
   arms ran simple/8 — OFF the card recipe (its numbers remain valid as
   shipping-path measurements; the batch's "manifest grid" cells mean the card
   recipe).
4. **§1.3 H3-turbo attachment row CORRECTED.** The row cited "[MEASURED,
   tranche 1]" for MERGE, but tranche-1's graphs ran `MiniMaxH3TurboLoRA`
   with `low_vram: False` = **BYPASS (runtime)**; the installed pack's own
   doctrine says bypass is correct on quantized bases ("merge … softer on
   quantized bases — the delta is partly rounded away", pack tooltip + issue
   trail) — the same rationale as the DMD never-merge class. Corrected row:
   **H3 turbo lineage attaches BYPASS (runtime, strength recorded); MERGE is
   the OOM fallback only.** BOMs record mode per run either way.
5. **Set E machinery note (not a design change — a construction finding):**
   C2's audio rebasing is satisfied NATIVELY at the `SamplerCustomAdvanced`
   output→input boundary: stage-1 leaves through `process_latent_out`
   (audio ÷ audio_scale₁), stage-2 enters through `process_latent_in` (audio ×
   audio_scale₂) — the scale-ratio rescale IS the boundary; σ_a is continuous
   across the handoff by construction (both stages derive it from the shared
   base position t via s_a=3). No custom audio-rescale node is needed; the
   E-graphs compile with existing nodes + the new `ExpSetSigmas` local shim
   (exact sigma passthrough — KJNodes CustomSigmas force-zeroes the terminal
   value, which would corrupt truncation grids and stage legs). The mandatory
   audio sub-endpoint on E-b stands unchanged as the measurement that catches
   any residual error.
6. **Fetch-schedule correction (A6):** the Viggle fetch set (pruned-int8
   finetune, DMD r64/r128 LoRAs, frozen embed) and Fun-Control Union 6.8 GB
   are ALREADY LOCAL (SHAs in the Set A results §A6); Set F needs no fetch
   (one card check: int8 video VAE vs the local fp16/fp32). NEW gap found by
   the A3 compile: Set E's 6/3 turbo stage wants the LightX2V **FL2VA**
   768p-line turbo, of which only the REF2VA flavor is local — fetch-or-
   substitute ruling at the Set E gate. Full schedule: results doc §A6.

Thesis errata recorded by A1 (does not change any ledger design): the §3.1
printed `sgm_uniform` row shifted endpoints — the code's grid INCLUDES the
leading σ′=1.0 and floors at 0.6527 (N=8@s12) / 0.4392 (N=20) / 0.4020 (N=24);
the printed 0.1260 floor was the dropped-endpoint variant, and §3.2's s=32
sgm floor is ≈0.85 code-true (claimed 0.506). Qualitative claims (sgm floors
deeper than simple; separation grows with shift) hold; magnitudes corrected.

## Amendment 3 — Set B verdicts (dated 2026-10-04; the calibration set, executed per [gpu-batch-setB-results.md](gpu-batch-setB-results.md))

**The batch's noise floors are ZERO — bit-level.** 9 identical-config renders
across cold-start / warm / post-model-reload-under-foreign-residency /
repeat-warm: byte-identical frames (framemd5) and audio on every pair, all
ten scripted metrics SD = 0.0 exactly, the review instrument's verifier 0/8
pairs with any L/R pixel difference. Full tables + evidence:
results doc §B1–B3.

1. **§1.5 register updates (binding):** the community render-to-render floor
   (±0.039 ArcFace / ±0.38 dE) is demoted to prior-in-full — cloud-API
   infra noise, not a pinned stack. The Kreatine VRAM-nondeterminism
   magnitude (1.18% RMS latent) does NOT transfer to the H3 int8-convrot
   path (the reload canary with disk-streaming-during-sampling is
   bit-identical); the lowvram-line comparison rule stays as cheap
   insurance. **MDE for every endpoint and every n is the battery's
   measurement granularity** (ArcFace 1e-5 · dE 1e-4 · … per results doc
   §B3) — the pre-registered practical floors (10–15% [EST]) now dominate
   every threshold formula.
2. **Cost anchor corrected:** base-20 @ 544p-class 39f ≈ **63 s/gen
   measured** (60–70 s; load+encode 5–6 s warm, 15 s cold) vs the 5–7 min
   [EST] — later sets' window arithmetic re-anchors on this.
3. **Engine-behavior ruling for every later set:** re-submitting an
   identical graph to 8189 is an InputSignature CACHE SERVE, not a
   re-render (found the cheap way: pass-1 "renders" executed in 0.84 s).
   Replicate cells and Set I re-runs MUST vary a proven-neutral signature
   lever — the sanctioned toolkit: the video-VAE name aliases
   (byte-identical files, sha 7c1f1314…) and RandomNoise
   `control_after_generate` cycling (frontend-only key). Recorded in every
   manifest; the `__setBalias` symlink stays in `/home/agent/models/vae/`.
4. **Gate option recorded (maintainer's call, no unilateral change):** with
   render noise at zero, replicate same-cell renders add no information —
   Sets C/E/F could drop 2-seed cells to 1 seed (≈ −25–40% planned gens)
   with §1.1's fresh-material rule carrying generalization; or replication
   stays as stack-change insurance (driver/torch bump, 8188-concurrency).
5. **Board pinned:** Set B's canary board (PROMPT_A verbatim @ 960×544×39f,
   base-20, seed 421337) is the batch's drift-sentinel config — §1.2
   item 4's per-set canary re-runs use it plus the signature levers.

## Amendment 4 — the review instrument contract is now the rebuilt Codex version (maintainer directive, 2026-10-04: "ensure this is used across all reviews from now on")

Standing rules for EVERY set executor from Set C onward:
1. **The instrument is `scripts/gpu-review/` as rebuilt at 67bb129** — one canvas, one clock, matched lossless frame strips; the three modes (sbs/slider/blink), manual blink, exact stepping, safe metadata reveal, persistent calls, JS export. Do NOT regenerate or modify the page; reuse it verbatim and populate per the contract (frames/, pairs-frames.js, pairs-metadata.js, pairs/ for the native fallbacks).
2. **Frame extraction is a generator obligation**: ffmpeg sequential extraction (`-vsync 0`, matched presentation indices, lossless WebP strips) runs as part of every set's output assembly — new or replaced videos require re-extraction. Budget ~220 MiB/set. The offline contract + limitations live in scripts/gpu-review/ (VERIFICATION.md + the spec).
3. **The p-null check ships with every set**: each set's expected-tie or null pair (canaries, controls) must pass the pixel-identity verification before the set's review counts — the instrument's own calibration rides every delivery.
4. The setA/setB retrofits are the reference implementations of the contract.

## Amendment 5 — the 3.4 ruling: SINGLE-SEED with the canary-stop rule (maintainer's "Go", 2026-10-04)

Set C onward runs one seed per cell. The insurance: the environment-stop canary rule stays intact in force — a canary placed at set start, mid, and end; if a canary ever diffs (pixel-identity check per the instrument contract), the affected block re-runs at FULL replication and the zero-floor finding is re-examined. Savings ~25–40% of planned gens. Basis: Set B's dual-track zero (SD=0.0 × 8/8 maintainer ties).

## Amendment 6 — Set C verdicts (dated 2026-10-04; executed per [gpu-batch-setC-results.md](gpu-batch-setC-results.md))

47 gens, 61.1 GPU-min, single seed (Amendment 5), all three canaries
(start/mid/end) **bit-identical to Set B's canonical** — the zero floor held
across the whole set; the canary-stop rule never fired.

1. **X1 FALSIFIED — S2 parked.** `sgm_uniform` is simple's render-level twin
   at s12/20 NFE (every paired read tie-class — A1's 0.052 knot separation
   does not survive to pixels). `beta(2,4)` — the only true mid-band
   treatment — halves HF (ratios 0.44–0.52), runs alternation 9–56×, and
   costs +157% low-motion plan error for a sub-floor (−13.9%) high-motion
   gain. Mechanistic note (exploratory): at fixed NFE, mid-band knot density
   is zero-sum against the terminal window (beta's last knots 0.60/0.50 then
   one 0.50→0 jump); the beta family at fixed NFE is measured as a
   fry/instability class on this stack (the β(0.8,3) probe reproduces it).
2. **X3 CONFIRMED — and the σ′_end dial collapses (DESIGN CHANGE).** Under
   the pre-registered x₀-decode control, σ′_end ∈ {0.05, 0.15} produce
   BIT-IDENTICAL videos (proven by construction AND on the outputs): the
   decoded x₀ is the last step's prediction, independent of the terminal
   value that only shapes the discarded state. Truncation holds texture ≥
   full (HF ratios 0.99/1.05/1.00 — the face prompt GAINS 4.9%) with
   structure flat. **S4's terminal-window discipline is confirmed as a
   BINARY choice (truncate-at-last-knot + x₀-decode vs integrate-to-zero);
   no σ′_end value exists to tune.** Audio caveat for S4 wiring: truncated
   decode shifts P2 treble −22% relative (absolute-tiny) — one dedicated
   audio check belongs in the recipe validation.
3. **X6: no measurable off-distribution penalty (automated side).** Card-beta
   vs simple at matched 8 NFE: HF within granularity both directions; the
   one separating metric is alternation on the face prompt (5.8× — simple
   cleaner); plan-error splits by prompt; the grids produce materially
   different renders (PSNR 16.5–25.5 dB). **S1's off-distribution warning
   calibrates at ≈ zero on these endpoints.** Judge threshold (≥9/12)
   unreachable at n=3 pairs — the maintainer's calls remain pending on the
   surface.
4. **X2: cliff CONFIRMED between 576p and 768p — two-sided by endpoint; S3
   parks.** Low-motion structure collapses at 768p (plan error 2.04→7.61
   from 576p, ball HF halved, P2 alternation 22×) while HIGH-motion plan
   fidelity IMPROVES with resolution (12.7→6.8→7.4) — resolution tokens buy
   fast-motion tracking and cost static-structure fidelity. The
   resolution×shift interaction on adherence is ~zero (mean +0.169 on
   5.4–13.9 cell values; s10 sweep flat 7.87–8.07) → H3's shift is
   resolution-flat in this envelope; no per-resolution shift table.
   EXPLORATORY (recorded for preset guidance, BH family): shift interacts
   with resolution on the stability axes — s18 at 768p doubles ball HF on
   the high-motion prompt (0.93→1.84, 544p flat) and raises P2 alternation
   monotonically (s8→s18: 0.039→0.113); direction: avoid high shift at 768p.
5. **Economics re-anchored (measured):** 544p base-20 ≈ 60.3 s; 576p 67.4 s
   (+12%); 768p **142.1 s (2.36×)**; turbo-8 32.7 s (0.54×). Peak VRAM flat
   24135 MiB at every rung — 768p fits the 24 GB stack without offloading
   collapse. Board pinned: P2 = PROMPT_A (Set B canary), P1/P3 = the
   director-harness ball board (plans declared; plan-error is P1/P3-only).
6. **Fresh-material queue (§1.1):** the only promotable finding is X3's
   truncated-decode discipline — queued as a graph-factory default candidate
   for the next base-tier set's graphs (decode output 1 at matched grids),
   pending the maintainer's checkpoint and the surface calls. X1/X2 produced
   no winners to extend (falsification and flat verdicts are the results).


## COMPACT-HANDOFF NOTE (2026-10-04, maintainer taking GPU)
- Testbed 8189 DOWN (POST /free → SIGINT → 302 MiB baseline verified). GPU is the maintainer's.
- Set D downloads RUNNING in background: SCAIL-2 int8 (→/home/agent/models/scail2-dl/) + Wan-Animate-2 int8 (→/home/agent/models/wan-animate2-dl/). VERIFY SIZES (~16.7GB + engine model) + consent/license rows BEFORE Set D dispatch. D1/D3/D4 run local already.
- Set D staged: D1 (30 imgs, Krea falsifier), D2 (18 gens, needs the downloads), D3 (18, IR-gap), D4 (16, preset ladder). ~30-36 review pairs. Dispatch per ledger Set D spec on the maintainer's return.
- Set C CLOSED (46f00d9): X1 falsified (beta eye-preference counter-signal recorded), X3 binary, X6 simple/8, X2 cliff+inversion human-confirmed. Sets A/B/C complete; D-J queued.
- CORRECTION: the first download attempt got 15-byte stubs (wrong resolve URLs) — killed + cleaned. The Set D dispatch must fetch via verified paths (check the Comfy-Org repo file trees first: Comfy-Org/SCAIL-2 and Comfy-Org/Wan-Animate-2 split_files layouts) with license consent rows.

## SET D FETCH LOG + WAN-LORA RULING (2026-10-04, downloads re-run while GPU is the maintainer's)

**The verified-path correction, resolved:** the split_files layouts live on HF under the `Comfy-Org` org (NOT GitHub — the org's GitHub carries tooling only; the first attempt's GitHub-derived URLs were the stub source). Verified trees + sha256-against-LFS-etag fetches running per `setD-fetch*.sh` (log: /home/agent/models/setD-fetch.log), all staged in engine dirs (`scail2-dl/`, `wan-animate2-dl/`), install to canonical subdirs at graph-build.

**The complete Set D fetch manifest (9 files, ~46 GB):**
1. `wan2.1_14B_SCAIL_2_int8_convrot` (16.65 GB, MIT) — SCAIL-2 arm engine
2. `wan_animate_2_distill_int8_convrot` (16.65 GB, Apache-2.0) — Wan-Animate-2 arm engine, DISTILL variant (the official distilled workflow template is the native fast path; base non-distill is fetch-on-demand)
3. `lightx2v_I2V_14B_480p_cfg_step_distill_rank64` (0.70 GB) — the official SCAIL template's speed LoRA @ 0.8 AND the Wan-Animate-2 distilled template's LoRA (both templates stack it)
4. `wan2.1_SCAIL_2_DPO_lora` (1.14 GB, MIT) @ 1.0 — hands/lip/eye sync
5. `wan2.1_SCAIL_2_relight_lora` (1.14 GB, MIT) — replacement-mode lighting blend (optional arm)
6. `umt5_xxl_fp8_e4m3fn_scaled` (6.74 GB) — shared TE (the repackage and Wan-Animate-2 copies are IDENTICAL sizes; same files mirrored — one copy serves both arms)
7. `clip_vision_h` (1.26 GB) — same mirror identity
8. `Wan2_1_VAE_bf16` (0.25 GB) — same
9. `sam3.1_multiplex_fp16` (1.75 GB, **SAM License — flagged row**) — the replacement workflow's tracker (SAM3_VideoTrack)

**WAN-LORA ANSWER (maintainer question 2026-10-04, recorded for the recipe ledger):** YES, by design. SCAIL-2 is a Wan2.1-14B finetune whose additions (in-context conditioning, masking channels, RoPE) live in input/positional wiring — the attn+MLP blocks LoRAs target are unchanged, and the OFFICIAL ComfyUI template itself stacks two LoraLoaderModelOnly nodes: a stock ecosystem lightx2v (generic Wan 14B I2V distill) @ 0.8 + SCAIL's own DPO @ 1.0. zai's README adds relight + documents the native-repo equivalent (rank-128 lightx2v @ alpha 1.0, 8 steps). Verified-on-SCAIL trio: lightx2v / DPO / relight. Generic Wan2.1-14B LoRAs ATTACH but their deltas were trained against stock weights — expect attenuation + strength retuning; control-type LoRAs (conditioning-wiring-dependent) transfer worse than aesthetic deltas; anything beyond the trio is attach-yes-effect-unmeasured (our harness's question).

**D2 DESIGN RULING (pending maintainer override at dispatch):** the SCAIL arm runs the OFFICIAL stack — int8 + lightx2v@0.8 + DPO@1.0 at 8 steps (zai's native default is 40 steps; the official Comfy recipe IS the distill stack, and 40-step × 9 gens on 14B is the expensive way to run a caption factorial). The caption contract is the treatment; the operating point stays pinned per-arm either way.

**ENGINE FACTS (verified locally):** the pinned shared install 0.37.4 ALREADY ships `nodes_scail.py` (WanSCAILToVideo, SCAIL2ColoredMask) + `nodes_sam3.py` (SAM3_VideoTrack) + `nodes_sam3d_body.py` (the zero-shot SAM3D-Body mesh control) — no custom node pack, no engine update, no cache-continuity rupture. The template's "update ComfyUI first" note targets older installs.

**INSTALL NOTE:** both arms pin same-named assets (umt5/clip_vision/VAE are byte-identical mirrors — no collision; the lightx2v LoRA is one file). Install = symlink from the staging dirs; the two ENGINE checkpoints land in diffusion_models/ side by side (distinct names, no conflict).

## SET D DISPATCHED (2026-10-04 14:17, maintainer go: "D is good to go")
Testbed UP (PID 3556633, 0.37.4, 24.75 GB free at boot; GPU verified free at 302 MiB baseline before launch). All 9 staged models installed (symlinked to canonical subdirs; the testbed's checkpoints/ is a REAL dir — sam3.1 linked at file level) and verified enumerable; WanSCAILToVideo + SAM3_VideoTrack registered. Executor dispatched (opus) with the full contract: ledger D1-D4 verbatim, the instrument (67bb129 verbatim, extraction-at-assembly, null-pair gate), the cache ruling, Amendment 5, the D2 official-stack operating point, GPU-priority etiquette (maintainer's runs preempt; teardown-on-request), and the parallel-agent push discipline (T14 owns src/e2e concurrently). Official graph templates preserved at gpu-review/setD/official-templates/. Review surface: gpu-review/setD/ per the setA/B/C layout.

## SET D EXECUTED (2026-10-04 16:45, executor addendum — verdicts PROPOSED, maintainer review pending)
51 gens / 97.9 GPU-min / single seed (Amendment 5) / all 3 canaries bit-identical to Set B r9 (zero floor held across BOTH new engines) / image-tier floor measured ZERO (duplicate Krea2 renders pixel-identical) / teardown verified to the 302 MiB baseline. Full tables: [gpu-batch-setD-results.md](gpu-batch-setD-results.md); review surface gpu-review/setD/ (26 pairs, p-null + p02 both 0-diff, gate PASSED).
1. **D1 keep-lists NEUTRAL** (|ΔArcFace| ≤ 0.0032 ≪ 0.02 floor; edit-landed 12/12) — the dialect-swap rule ("bare on Krea 2") stands, tag → MEASURED. **Krea2T = measured NO-OP on int8-convrot** (bit-identical outputs; the pinned pack's wrapper never engages) — do not ship as an edit adjunct. ref_boost dominates (+0.006 ArcFace, +1.7 dB outside-region).
2. **D2 long > bare on BOTH engines** (SCAIL dance −0.02→+0.09, board_p2 +0.15; Wan dance monotone 0.485→0.530); Wan motion-exclusion PASSES everywhere (appearance tracks the reference, never the driving video); bare-SCAIL on dance collapses to the driving person's appearance (lab-dist 3.3) — the prompt-poverty control bites. Caption contracts → MEASURED with the official packet recipe as the VG-1 arm (eye-gated).
3. **D3 structure wins where naive fails** (P3 plan error 27.3 → 9.8, −64%) but **careful prose still wins at low motion** (board 1.37 vs all structured arms ≥ 4.6); the naive P2 render loses shot design entirely (wide shot, no detectable face) — structure's biggest effect is FRAMING; compiler drift recorded (set-dressing inventions, −18..20 L*).
4. **D4 no adherence rescue at the 768p cliff** (P1 plan +2.1% tie — confirms X2 that no prompt buys back what resolution takes) but a **prompt-dependent stability crossover: the preset cuts 768p face alternation 26×** (0.190→0.0073) while tripling-to-quintupling ball-scene alternation — preset cell → MEASURED-CONDITIONAL (identity shots at 768p yes; static scenes no).
5. **Staging defect found+fixed at execution:** 8/9 Set D model links were broken relative symlinks + clip_vision_h unlinked (enumerable ≠ loadable — checklist lesson); repointed absolute, no new bytes. First published 24 GB wall numbers: SCAIL 311.5 s/81f warm, Wan-A2 292.1 s/81f warm, peaks ≤ 24165 MiB.

## MAINTAINER DIRECTIVE — no test sets in git (2026-10-04)
"We should not be pushing the test sets, they take up a ton of space, after D is done, make sure to gitignore and remove them from git."
Measured tracked footprint at directive time: setA 152 files/242 MiB · setB 35/14 MiB · setC 277/237 MiB · setD 296/620 MiB (committed mid-flight; the executor has been messaged to untrack the heavy assets in its final commit — everything stays on disk for the local file:// review).
**Execution (immediately after Set D completes):** .gitignore gains `gpu-review/set*/`; `git rm -r --cached` the four set dirs (untrack only — nothing deleted from disk, the trash-backed policy never fires); one docs-type commit + push. Provenance home stays the results docs (verbatim responses quoted there per the setC convention); scripts/gpu-review/ (the instrument) stays tracked.
**Surfaced, not decided:** the blobs remain in HISTORY (local + origin) after untracking. A `git filter-repo` purge reclaims ~1.1 GB but rewrites the branch — every SHA reference in the ledger/docs/memory goes stale (mechanical re-mapping possible from filter-repo's commit map). Maintainer's call: untrack-only (zero churn) vs purge (space back, SHAs re-mapped). The future public-repo curation never carries these blobs either way (policy §2b).

## AMENDMENT 7 — the review instrument's shared-context obligation (from the maintainer's setD review, 2026-10-04)
The maintainer's own words: "I had a hard time with this one, since I have no idea what each pass was supposed to represent." Every set's pairs-metadata MUST carry, in the `shared` block ABOVE the calls: (1) the EXPERIMENTAL QUESTION in maintainer terms (not arm codes); (2) WHAT TO JUDGE on this pair (identity vs edit-success vs motion vs stability — one judging criterion, named); (3) whether the pair is side-swapped; (4) for expected-tie/null pairs, the words "identical content expected — flicker or divergence is a TOOLING BUG, report it." A pair whose question cannot be stated plainly is a pair the set generator does not understand well enough to have built. Amendment 4's instrument contract extends; the null-pair gate is unchanged.

## THE PDMD SET (letter P, registered 2026-10-04 on the maintainer's go — "get both going")
**The question:** does the PDMD 4-NFE distillation (arXiv 2609.35768; the critic-error-projection fix for DMD at low NFE) displace the turbo king on OUR stack — at half the NFE? Registered as P (not E — the ledger's E is X7, which runs immediately after P in the sprint wrap).

**Arms (all on minimax_h3_ref2va_pruned_int8_convrot, text-only conditioning, same graph — only LoRA + steps vary):**
1. turbo-8 v1.0 (the former king, incumbent) — 8 steps, its pinned recipe (X6's simple/8)
2. turbo-4 v0.1 (the official 4-step) — matched-NFE control: isolates PDMD-the-method from 4-steps-the-regime
3. PDMD-4 (v6 LoRA @ strength 1.0 ONLY, 4 steps, shift 12/3, no CFG, `pdmd` trigger prefix per the card — the prefix rides the PDMD arms only; it is part of that arm's operating point)

6 board prompts × 3 arms × 1 seed (Amendment 5) ≈ 18 gens + null + canary. **Off-label caveat recorded:** the student was distilled from full-precision T2VA; the conversion verified keys against the ref2va layout but behavior on the int8 ref2va base is unproven — if arm 3 misbehaves (artifacts/collapse), an optional arm 3b (PDMD on its native-base operating point) isolates base-dependence before any verdict.

**Primary contrast (pre-registered):** PDMD-4 vs turbo-8, the maintainer's blind forced-choice — the eye is the decision layer (Amendment 7 metadata on every pair). **Secondary/exploratory:** PDMD-4 vs turbo-4 (attribution); the six audio metrics at 4 NFE (the paper's strongest H3 claim — audio held at 4 steps; our 39-frame phase-exactness doctrine applies); wall-clock per gen.

**Standing terms:** the 67bb129 instrument verbatim; extraction at assembly; the null pair (PDMD-4 duplicate through a fresh VAE alias) gates the review; the cache ruling (any replicate varies a neutral signature lever); canary-stop insurance; GPU-priority etiquette (the maintainer preempts; teardown on request). **Asset:** minimax_h3_pdmd_4nfe_comfyui_v6.safetensors (1.96 GB, sha-verified at fetch; Apache-2.0; registry row lands with the fetch).

## SET P EXECUTED (2026-10-04, executor addendum — verdicts PROPOSED, maintainer review pending)
21 gens / 12.1 GPU-min / single seed (Amendment 5) / both canaries (start+mid) bit-identical to Set B r9 / **null gate PASSED** (PDMD duplicate through `__setPnull` alias: framemd5+audio identical run-time, 0 px through the instrument) / arm-3b NOT triggered (harm screen clean) / teardown verified to the 302 MiB baseline. Full tables: [gpu-batch-setP-results.md](gpu-batch-setP-results.md); review surface gpu-review/setP/ (on-disk; metadata files in git per the mission list).
1. **PRIMARY (PDMD-4 vs turbo-8), automated side: PDMD wins motion at half the NFE** — plan RMSE 3/4 cells (B1 1.90 vs 5.11 · B3 5.09 vs 12.87 · **B6 4.92 vs 26.16 — the incumbent's catastrophic cell**, both its 4-step counterparts succeed there; B4 loses 7% at the boundary). Alternation splits by prompt class: PDMD 3× CLEANER on the rich face prompt (B2 0.33×), 1.6× cleaner on B6, 3–4× flicker-ier on the ball cells; HF energy 1.9–2.7× (sharpness-or-fry — the eye decides on p02–p07). Face ArcFace-vs-canonical 0.176 (most render-divergent) with the LOWEST face dE — mixed signal, escalated. The eye is the decision layer; calls pending on the 19-pair surface.
2. **SECONDARY (attribution, matched 4 NFE): the gains are PDMD-the-method** — plan 4/4 over the official turbo-4 (margins 14–47%), same alternation split (face cleaner, ball flicker-ier). CONTEXT arm: turbo-4 holds HF within ±14% of turbo-8 and beats its parent on both high-motion ball cells — the incumbent line's 8-step advantage at this board is thin.
3. **Audio at 4 NFE (six-metric battery, operationalized this set): no collapse.** PDMD vs turbo-8 paired means +7.2 dBFS louder / +141 Hz centroid; vs turbo-4 the level gap vanishes and +327 Hz brightness remains. turbo-8's quietest cell (B1 −53 dB) is its "silence" prompt read — arguably correct. Ear review on the audio-bearing pairs/ mp4s recommended before any recipe verdict.
4. **Economics: half-NFE buys 0.65× wall, not 0.5×** (4 NFE 18.5 s warm sampling vs 8 NFE 28.3 s; TE+VAE fixed costs dominate at 39f). VRAM flat 24150 MiB all arms.
5. **DISCLOSED discrepancies (both executed as registered, flagged for the gate):** (a) the `pdmd` trigger prefix exists in NO upstream artifact (conversion card, upstream card, inference code, job JSON, project data, arXiv all checked — prompts pass verbatim upstream); it rode every PDMD cell as registered and is the first confound to strip in any confirmation; (b) the "6 board prompts" resolved to Set C's board verbatim + D3/X5's NAIVE one-liners verbatim (the X-family corpus's six established texts — zero invention, matches the registered 6×3×1 arithmetic); (c) arm 1 is the 768p-line LoRA run at 544p/shift-12 per the registration (its native card shift is 6/3).
6. **TOOLING FINDING (repo-wide): the custom `MiniMaxH3TurboLoRA` node SILENTLY NO-OPS on conversion-format LoRAs** — its key map double-prefixes `diffusion_model.` for files whose keys already carry it → zero adapters applied, run "succeeds" unLoRA'd. All LightXV/PDMD-conversion-format files must ride stock `LoraLoaderModelOnly` (the conversion card's own instruction; weight-function path applies the delta in fp32 over the dequantized int8 weight). Engine-side proof adopted for this set: 208 patches staged per arm + zero NOT-LOADED warnings (now a driver-side stop guard). Set P's arm graphs + driver carry the reusable pattern.

## SPRINT WRAP SEQUENCE (maintainer directive 2026-10-04: "get both going and wrap the GPU sprint up")
Set P (PDMD) DISPATCHED (17:57, opus; testbed PID 3937245; all three LoRAs sha-verified/enumerable). **Set E (X7 staged handoff) queues immediately after P** — one GPU owner at a time; P's executor tears down at completion and the controller relaunches for X7 (clean-state discipline; P's final canary recorded for continuity). After E and J: the sprint CLOSES — consolidated verdicts across all executed sets, the X-suite's final status (X1-X6 + X7), final teardown, Flux closure. Sets F/J stay queued-not-run unless the maintainer expands the wrap (F's Viggle models are already on disk; J needs the big downloads — Meridian 34 GB, VOID, Anime-to-Realism, UniLumos, HyperFlow). The PDMD fetch's one-line awk defect (quote-splitting on an unquoted header) fixed at the source — sizes now compared with default FS.

## SPRINT WRAP EXPANDED (maintainer 2026-10-04: "Do J too")
Set J joins the wrap: P (running) → E (X7) → J (the eight fresh-eyes pilots, each independently null-gated) → closure. J's fetch-prep agent DISPATCHED (network-parallel — downloads run during P/E's GPU ownership; staging-only, no symlinks until J dispatch). J's known license surfaces: Meridian's VGGT-FAIR-NC (confirm at fetch, flagged row) and Anime-to-Realism's CivitAI class (anonymous-fetch attempted; if gated, maintainer-staged — never routed around). Sets F/G/H/I stay queued-not-run.

## SET J FETCH COMPLETE (2026-10-04 — network-parallel during P/E's GPU ownership)

Set D's discipline verbatim, independently re-verified after download (HF API
sizes + LFS-etag sha256s re-pulled; 51/51 files PASS, 0 FAIL, 38.13 GiB
staged). **Staging only — nothing symlinked into the shared install** (J
dispatch owns installation). Log `/home/agent/models/setJ-fetch.log`, manifest
`/home/agent/models/setJ-fetch-manifest.json`, registry rows §5a/§5g/§5i +
the §4 pack row.

**Fetched + verified:**
- **VOID** (J3): pass1 + pass2 (11.14 GB each) + cogvideox VAE + RAFT-large +
  t5xxl_fp16 from Comfy-Org/void-model (Apache-2.0) — the official blueprint's
  own URLs; sam3.1 (the blueprint's tracker) already local from Set D. **VOID
  and MoGe are core ComfyUI at the shared install** (`nodes_void.py`,
  `nodes_moge.py` + blueprints) — weights only, no node packs to install.
- **MoGe-2 ViT-L fp16** (J2's non-LoRA comparator): Comfy-Org/MoGe, MIT both
  mirror and upstream weights repo; the core blueprint's own default file
  (662 MB).
- **Meridian** (J2): the ComfyUI-flavor LoRA pair (1.88 GB × 2, the flavor the
  testbed workflow loads) + frozen embeds + silence audio + recam code + the
  geometry node/workflows + example clips. Weights = **MiniMax H3 Community
  License** (read at fetch — §5a family, territory/AUP/$20M terms); code
  Apache-2.0. **The A6 "Meridian INT8 34 GB" row was already satisfied** — the
  adapters ride `minimax_h3_fl2va_int8_convrot.safetensors` (34.0 GB, on disk
  since 09-16); not re-fetched. The diffusers-flavor pair (2.67 GB × 2) NOT
  fetched — that path needs the 62 GiB bf16 base + ≥96 GB VRAM
  (docs/installation.md), unreachable on this rig.
- **HyperFlow** (J8's tier-ladder rung): the full-base converted build
  `custom_node_hyperflow_8step_v1.0_comfyui.safetensors` (3.94 GB, drbaph;
  MiniMax H3 Community License per the card's license_name; sha triple-checked
  — HF etag = the node pack's own pin `b10b1a78…cd71`) + the node pack
  **Adudeguyman/ComfyUI-HyperFlow-H3 @ `99778905` (v1.4.0, Apache-2.0)**
  cloned to staging. The pack is the **official continuation of
  Saganaki22/ComfyUI-Hyperflow** (deleted upstream — resolves fresh-eyes'
  "Saganaki22 revival (still 404)" not-found) and ships curve-fits for our
  exact local pruned int8 bases at no extra download; our full int8 bases are
  "fully supported" per its README.

**Maintainer-staged (gated — surfaced, never routed around):**
1. **VGGT-Omega** (facebook/VGGT-Omega, gated:manual + Meta FAIR
   Noncommercial Research License v1) — REQUIRED by Meridian's geometry
   subprocess (`comfyui/meridian_geometry.py` shells out to
   `inference/sample.py --preview-only`, which loads it); the ledger's
   "VGGT-FAIR-NC surfaces at consent" is CONFIRMED — the NC gate rides this
   dependency, not the Meridian weights. File to stage after access:
   `vggt_omega_1b_512.pt` (4.58 GB) + the facebookresearch/vggt-omega code
   checkout. **J2's MoGe comparator arm is VGGT-free by design and can run
   before it lands.**
2. **Anime-to-Realism** (CivitAI 2783657, version "Minimax H3 ref2v v1.0" id
   3356617, `Anime2Realsim__H3.safetensors` 296 MB, trigger "LumiReal"):
   metadata anonymously readable (200) but the download is login-walled (401)
   — the CivitAI user-fetch class; API sha256 recorded in the manifest for
   post-download verification. Staging hint: `/home/agent/models/loras/`.
3. **UniLumos** (Alibaba-DAMO-Academy/UniLumos, gated:auto): weights Apache-
   2.0, code repo (Lumos-Custom) unlicensed — the own-glue plan stands. 11.4
   GB of the repo is a bf16 umt5-xxl we may already cover with the local fp8
   copy (unproven — J8 tests; if it substitutes, the stage burden drops to
   unilumos.pt + vae.pth, 3.6 GB).

**J1 mechanism-pack check (A6's last row):** NONE of the three adherence
mechanisms is installed at the shared install (verified by git-remote listing
+ content grep of `/home/agent/comfyui/custom_nodes/`): Fizgig-Tweaks
(shootthesound, MIT, pin `5f8b48a` per the assessment) absent; T8mars
(`h3-audio-t8`, GPL-3.0-or-later, registry row exists) absent; **Semantic
Bridge located this pass** at github.com/Speach1sdef178/MiniMax-H3-Semantic-
Bridge (11 MB conditioning-space adapter weights, license "other" — the
fresh-eyes "unstated — check before any catalog row" flag stands; NOT
fetched). J1 dispatch installs/ports Fizgig + T8mars and resolves Semantic
Bridge's license or drops to the two-mechanism bake-off (both null-gated
either way).
