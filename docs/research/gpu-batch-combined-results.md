# The combined eval — attention-kernel benchmark + DMAD-vs-PDMD bake-off (2026-10-06)

> Registration: ledger "THE COMBINED EVAL REGISTERED (2026-10-05)" + the DMAD
> intake ([dmad-assessment.md](dmad-assessment.md)). Executor addendum —
> verdicts PROPOSED, the maintainer's 13 blind calls at
> [gpu-review/combined/](../../gpu-review/combined/) decide.
>
> **READ §6 FIRST (2026-10-06): the Codex audit + the maintainer-directed
> reruns corrected the kernel table (sampler-only speedups: FA4 1.97×, Sage
> 1.48× — the original "sampling" column was decode/encode/polling-inclusive),
> ran the Flex arm to completion through the fixed shim (200/200 sparse,
> 1.58× sampler-only), and narrowed four claims (canary coverage, VRAM,
> scaling, the DMAD recipe).**

**35 gens / 66.9 GPU-min / single seed (Amendment 5) / knots 33/33
digit-for-digit / null gate PASSED (PDMD duplicate through `__setCMBnull`:
framemd5+audio bit-identical run-time) / canary bookends c1≡c2 BIT-IDENTICAL
(within the Part-2 launch; §6's fresh-launch rerun extends this to a second,
independent launch: c3≡c1≡c2) / teardown
verified per launch AND final — 305 MiB baseline, zero orphans, GPU returned
to the maintainer.** Everything on `minimax_h3_ref2va_pruned_int8_convrot`,
dense SDPA for Part 2, 1088×608, seed 421337, ComfyUI 0.39.0.

## 0. Deviations & defects (all disclosed, none silent)

1. **The registration's "121f" is off-grid.** 121 is not a 17k+5 value;
   the engine's `align_frame_count` snaps 121 → **124**. Executed explicitly
   at **124f = 5+17·7 = 5.167 s** — the grid value the ~5 s design ask maps
   to. (Set P2's 243f convention: nearest grid value ≥ the ask.)
2. **The staged DMAD conversions were broken** — caught by the roster's
   offline header assert BEFORE any GPU: (a) keys double-prefixed
   `diffusion_model.model.diffusion_model.*` → 0/208 modules would attach
   (the MiniMaxH3TurboLoRA silent-no-op failure class Set P documented);
   (b) the converter iterated `blocks | refiners`, so refiner idx 0,1
   swallowed transformer blocks 0,1 → only 200/208 modules emitted. Both
   fixed in `convert_dmad.py` (+ the refiners' `lora_A/B` naming variant
   handled); regenerated: 416 keys, **208/208 modules**, sha
   lora `3a5f1e40…`, full `a93f045d…`. Without this the bake-off would have
   judged un-LoRA'd renders as "DMAD loses".
3. **Canary vs setB r9: numeric drift, not a render change** — the engine
   upgraded 0.37.4 → 0.39.0 between Set P2 and this set. c1/c2 vs r9:
   PSNR **41.24 dB** (above the ~38 dB VAE round-trip envelope), mean abs
   diff 1.28/255, 0/39 frames identical — same scene, nudged floats. The
   registered adapted protocol: cross-version identity recorded + disclosed;
   the within-set gates carry the floor (c1≡c2 bit-identical + the N1 null;
   0.39.0-internal determinism was already proven by the veda-gate's
   bit-identical p0_null). **Caveat this licenses: cross-set absolute
   comparisons against pre-0.39.0 runs carry ~41 dB of engine-version
   drift; within-set and within-version comparisons are exact.**
4. **The flex arm failed to run** (Part 1 §1.4) — recorded, not retried
   AT EXECUTION TIME; the Codex audit later root-caused it and §6's rerun
   (2 more generations) runs it to completion through the fixed shim.

## 1. Part 1 — the attention-kernel benchmark

One generation (P2_2 gymnastics, PDMD-4 recipe 12/3 simple/4), warm + timed
gen per kernel (timed through fresh VAE aliases — the Set B cache-bust
lever). The sparse arms ride the Veda selection at its trained 90%/90% with
the T2VA-8NFE predictor — off-label on ref2va+PDMD (the veda-gate Family-B
label), but **124f@16:9 sits ON the trained 5.2 s plan grid** (unlike the
gate's 39f).

| kernel | timed wall | sampling‡ | per-step | VRAM peak | attn computed | vs dense (sampling)‡ | pixel vs dense |
|---|---|---|---|---|---|---|---|
| Dense SDPA (stock) | 105.2 s | 100.2 s | 17.75 s | 23,897 MiB | 100% | — | — |
| SageAttention 1.0.6 (`--use-sage-attention`) | 81.7 s | 76.7 s | 12.00 s | 24,057 MiB | 100% (dense INT8) | **1.31×**‡ | PSNR 17.2 dB, dE 18.7 |
| **FA4-patched (our tuned kernel)** | **72.5 s** | **66.5 s** | **9.00 s** | 23,867 MiB | **16.6%** | **1.51×**‡ | PSNR 11.6 dB, dE 36.5 |
| FlexAttention/Triton | — FAILED — | (101.2 s†) | (18.0†) | 23,577† | 98.8%† | — | (14.8 dB†) |

‡ **superseded by §6**: this "sampling" column is the first-progress→
completion pipeline span (VAE decode + audio encode + polling included),
not sampler time — the sampler-only clock (tqdm) gives **Sage 1.48× /
FA4 1.97×**, and the fixed-Flex rerun adds a **1.58×** arm. The per-step
column was always tqdm-derived and stands.
† the flex numbers are the node's dense-fallback execution, NOT flex
measurements — see §1.4 and §6 (the arm now runs; the OOM'd generation
was a HYBRID render: 3 sparse + 197 dense calls). Warm walls: dense 117.5,
sage 97.0, fa4 96.0 (CuTe JIT absorbed), flex 105.2.

### 1.1 Dense SDPA — the baseline
The sprint's shipping configuration (every set B–P2 ran this routing).
100.2 s sampling / 17.75 s per step at 124f×0.66 MP on the 4-NFE recipe;
VRAM peak 23.9 GiB under dynamic residency.

### 1.2 SageAttention — the shipped dense drop-in
`sageattention 1.0.6` (PyPI, BSD-3) installed into the engine venv
(torch pinned 2.12.1+cu130); engine launched with
`--use-sage-attention` (mutually exclusive with
`--use-pytorch-cross-attention` at 0.39.0's argparse). Boot line verified,
**zero fallback lines** in any run slice, and the renders differ from dense
(PSNR 17.2 dB) — the INT8 arithmetic engaged, not a silent SDPA fallback.
**1.48× sampler-only for one engine flag** (1.31× on the pipeline clock —
§6's correction). Audio md5 differs (the
quantization reaches everything). Quality: the eye's call on the pairs —
17.2 dB is inside the method-vs-method band (setP2's arm contrasts ran
10.9–14.5 dB; the veda-gate's simple-board veda-vs-dense sat at 21–23 dB).

### 1.3 FA4-patched — our tuned kernel, the winner
The Veda selection + the vendored SM8x patch over flash-attn-4 4.0.0b32
(task jyf2ld2's wheels; miowtion wrapper; `fa4.py` backend shim +
`VEDA_FORCE_BACKEND=fa4` — testbed-local, durable copies at
`test-results/experiments/gpu-batch-combined/scripts/shims/`). Both shims
passed the node's built-in self-test (fp32 cross-check + the
not-silently-dense check) before the run.

- **Engagement: 16.6% of full attention computed** — the trained sparsity
  running ON-grid (the veda-gate's off-grid 39f measured 22.4–28.7%;
  on-grid is deeper, as the predictor's training distribution predicts).
- **9.00 s/step — 1.97× dense sampler-only, 1.33× over sage** (§6's
  corrected clocks; the execution-time "1.51× dense sampling" was the
  pipeline span). Veda-pipeline
  time (gather+score+select+kernel+scatter) 16.21 s = 4.05 s per model call
  × 4 — the selection overhead is included in the win.
- **VRAM peak similar to dense** (23,867 vs 23,897 MiB observed — §6
  narrows this: the 30 MiB delta is inside the 1 s polling instrument's
  resolution; "similar observed peaks", not an advantage).
- Renders materially different from dense (PSNR 11.6 dB) — the veda-gate's
  finding repeats at 5 s on-grid: sparsity is a render-changing kernel, and
  the no-penalty question belongs to the eye, not to pixel-diff.
- One-time cost: the CuTe JIT compile absorbed entirely in the warm gen
  (96.0 → 72.5 s).

### 1.4 FlexAttention — the fallback arm that did not survive the engine (NOW RUNS — see §6)
The shim (torch.compile'd flex_attention + BlockMask.from_kv_blocks over
the kept-tile lists, padding-aware mask_mod) passed the self-test and ran
**3 sparse calls in-engine**, then `torch.OutOfMemoryError` at the compiled
call (flex.py:74). The node's designed fallback took over (197/200 calls
dense, honestly logged "fell back to full attention") — **the generation
completed as a HYBRID render (3 sparse + 197 dense calls), not a pure dense
render**, which is why the † numbers exist at all but match neither arm.
**Root cause (the Codex audit superseded the original autotune-workspace
guess — full chain in the audit doc + Flux ao4aon4):** torch.compile's
default recompile budget (8) exhausted by Veda's changing
`(N, H', tiles)` signatures under `dynamic=False` → Dynamo fell back to
UNFUSED flex_attention → the full `[33280, 33280]` fp32 scores matrix =
132.03 GiB → OOM. The audit demonstrated the fix (`recompile_limit=256`
on that one compile call, `fullgraph=True` so future exhaustion fails
loudly, `compute_q_blocks=False` as the independent forward optimization);
§6's rerun drives the arm to completion: **200/200 sparse calls, zero
fallback, 1.58× dense sampler-only**.

### 1.5 Part-1 verdict (proposed)
- **FA4-patched is the fastest kernel measured through the engine**
  (sampler-only **1.97× dense, 1.33× sage** per §6's corrected clocks) —
  and it is the only SPARSE arm in the original four. Kernel-level scaling
  suggests its win grows with sequence length (9.7× at H3 geometry, 19.4×
  at 0.05 density in isolation), but **the engine measurement is one
  geometry** (124f on-grid at 1088×608) — a single point, not a
  demonstrated floor.
- **SageAttention is the free dense win** — one flag, 1.48× sampler-only,
  zero code;
  ships as the default dense baseline candidate pending the eye's quality
  read.
- Quality gate: no arm is pixel-close to dense (11.6–17.2 dB) — "no
  visible penalty" is an EYE verdict; the review pairs carry it.

## 2. Part 2 — the DMAD-vs-PDMD bake-off (the crown contest)

The P2 six verbatim, 124f, 1088×608, dense SDPA, single seed. Arms:
turbo-8 @ card 6/3 (context) · PDMD-4 v6 @ 12/3 (the king) · DMAD-4
lora-critic @ 12/2 · DMAD-4 full-critic @ 12/2. 208/208 LoRA modules
attached every arm gen, zero NOT-LOADED; knots 33/33.

**Recipe adaptation disclosed (§6, Codex finding 4):** the DMAD arms ran
the **T2VA-trained DMAD checkpoints on the `ref2va_pruned_int8` base with
our deterministic Euler solve — NOT the paper's stochastic re-noise rule**.
The bake-off measures DMAD-as-adapted-to-our-stack, not the paper's exact
method; any "DMAD loses" verdict would be against the adaptation.
**Measured 2026-10-06** (the ledger's "THE SAMPLER-RULE A/B"): the
adaptation is not silent — Euler-vs-re-noise is a 14–15 dB render change on
P2_6, with the stability metrics slightly WORSE under the correct rule; the
eye's labeled pairs at gpu-review/sampler-ab/ decide the quality question.

### 2.1 Economics (warm means)
| arm | warm sampling | wall ratio vs turbo-8 | VRAM peak |
|---|---|---|---|
| turbo-8 (8 NFE) | 169.4 s | 1.00 | 24,061 MiB |
| PDMD-4 (4 NFE) | 98.3 s | 0.58 | 24,061 MiB |
| DMAD-4 lora (4 NFE) | 98.7 s | 0.58 | 24,061 MiB |
| DMAD-4 full (4 NFE) | 98.7 s | 0.58 | 24,061 MiB |

All three 4-NFE arms are wall-identical (±0.4 s) — the crown contest is
pure quality per GPU-second. VRAM flat across the whole set.

### 2.2 PRIMARY — DMAD-full-critic vs PDMD-4 (the eye's six pairs, p02–p07)
Automated side (context, not the decision):
- **Warp residual lower 6/6** (0.59–0.82×) — DMAD-full is the more
  temporally stable arm on optical-flow at 5 s (P2 measured PDMD's
  alternation inversion at 243f; at 5 s the picture flips back on warp).
- **Alternation cleaner 4/6** (0.56–0.72×) — inversions on AIRCRAFT (2.96×)
  and FISH TANK (1.56×), the rolling-horizon and locked-off cells.
- HF mixed (0.63–1.28×): softer on 4/6, sharper on GYMNASTICS.
- Renders materially different everywhere (PSNR ~11–13 dB) — a genuine
  method-vs-method A/B, same class as setP2's primary contrasts.
- **Audio battery (shift 2 vs 3):** DMAD-full +3.2 dBFS louder, −150 Hz
  darker (centroid), −170 Hz rolloff, paired-mean over the six. Family
  means: turbo −31.8 dBFS/2044 Hz · PDMD −25.5/1510 · DMAD-lora
  −20.8/1484 · DMAD-full −22.4/1360. The shift-2 arms are the loudest and
  darkest family; DMAD-full is quieter than its lora sibling.
- Harm screen: no silent cells, no HF collapse (min ratio 0.63) — no
  degenerate-output signal; the eye verifies.

### 2.3 SECONDARY — lora-critic vs full-critic (p08–p13)
**The full-critic is cleaner on alternation 6/6** (the lora arm runs
1.03–4.35× higher) — the paper's "fully-trained critic scores higher"
claim shows up as temporal stability on our board. HF mixed (0.85–1.28×),
warp ~parity (0.92–1.18×), audio: lora +1.6 dBFS louder and +124 Hz
brighter than full. Wall identical. **The eye decides whether the stability
margin buys quality.**

### 2.4 CONTEXT — PDMD-4 vs turbo-8-card at 5 s
PDMD: HF higher 6/6 (1.04–2.32×, the sharpness-or-fry direction P2
measured at 243f), warp higher 6/6, alternation higher on 4/6 (consistent
with the 243f stability inversion; the 5 s horizon is mid-transition),
louder (+6.2 dBFS) and darker (−535 Hz), 0.58× wall. The P2 verdict stands
unperturbed at this length; this row anchors the board.

### 2.5 Proposed verdict (the 13 blind calls decide)
- If the eye crowns DMAD-full on the primaries, the fast-lane crown changes
  hands at equal wall (4 NFE) with a measured warp-stability edge and a
  louder/darker audio signature.
- If PDMD holds, the challenger is measured-and-not-adopted at the cheapest
  possible price (one window), and the full-vs-lora critic finding stands
  on its own as engineering evidence.
- Either way: **the DMAD conversion defects were the load-bearing catch**
  — the unverifiable version of this set would have crowned PDMD on
  un-LoRA'd renders.

## 3. The review surface (Amendment 1/4/7)

`gpu-review/combined/` — 13 blinded pairs: p01 null (expected tie,
bit-identity proven at run time) + p02–p07 PRIMARY + p08–p13 SECONDARY;
Amendment-7 metadata on every pair (question + judging axes + sides + the
null wording); escrowed `pairs/.key`; 124-frame lossless strips per side
(~900 MiB on disk — over the ~220 MiB guidance, the length's by-construction
cost, disclosed; metadata quartet in git only). Eye-critical pairs:
**p06 (fish tank — the stability falsifier), p03 (gymnastics — motion),
p09 (the critics on the contact cell where alternation splits widest).**

## 4. Verdict scaffold (maintainer)

| pair | question | call |
|---|---|---|
| p01 | null gate — identical content expected | tie (forced) |
| p02–p07 | the crown: DMAD-full vs PDMD per scene | ___ |
| p08–p13 | the critics: lora vs full per scene | ___ |

## 5. Artifacts

- Runs/metrics: `test-results/experiments/gpu-batch-combined/` (on-disk;
  roster/controller/metrics/review scripts + out/*.json manifests)
- Review: `gpu-review/combined/` (quartet tracked; media on disk)
- Registry rows: veda-sparse-attention pack, the engine-side kernel deps
  (sageattention/flash-attn-4/miowtion/cutlass-dsl), the DMAD §5a weights
  row, the Veda predictor row — landed with this doc.
- Flux task ourbqum: the execution log incl. the OOM handoff (ao4aon4).

## 6. CORRECTIONS + RERUNS (2026-10-06 — the Codex-audit follow-up)

The Codex audit
([codex-combined-eval-gpu-tests-2026-10-06.md](../audit/codex-combined-eval-gpu-tests-2026-10-06.md))
found the Flex OOM's true cause, a timing-boundary error, and four
overclaims; the maintainer directed "rerun the failed portions and rerun
any portions that might provide false readings." Three reruns, **3
generations / 4.7 GPU-min across two fresh 8189 launches** (boots and
teardowns excluded, same accounting as the 66.9 figure), teardown verified
per launch, GPU returned to 305 MiB (the second launch needed the
controller's SIGTERM escalation after absorbed SIGINTs — designed path,
verified clean after).

### 6.1 The corrected kernel table (Rerun B — re-extracted, no GPU)

The controller's `sampling_s` was the first-progress→completion pipeline
span: VAE decode + audio encode + poll interval included. The sampler's
own clock (the tqdm bar's elapsed time at 100%, 1 s granularity) was in
the logs all along — re-extracted from the existing run manifest. The
controller now records both (`sampler_only_s` + `wall_s`), never conflated.

| kernel (timed gen) | wall | sampler-only | per-step | vs dense (sampler-only) | VRAM peak |
|---|---|---|---|---|---|
| Dense SDPA | 105.2 s | 71 s | 17.75 s | — | 23,897 MiB |
| SageAttention | 81.7 s | 48 s | 12.00 s | **1.48×** (was 1.31×) | 24,057 MiB |
| **FA4-patched** | 72.5 s | 36 s | 9.00 s | **1.97×** (was 1.51×) | 23,867 MiB |
| **FlexAttention (FIXED — §6.2)** | 78.6 s | 45 s | 11.25 s | **1.58×** | 24,051 MiB |

Ranking unchanged; magnitudes corrected UP (the decode/encode tail was
constant across arms, so it diluted every speedup). FA4-over-sage holds at
1.33×. Warm-gen sampler-only: dense 72, sage 49, fa4 51 (CuTe JIT absorbed
in-gen), flex-fixed 83 (Triton compiles; see §6.2). The Flex row is the
only one not same-launch-cohort with Part 1 — it is a fresh pair of
generations through the fixed shim, compared against Part 1's timed gens
(same graph, seed, geometry, tqdm clock, warm→timed order, back-to-back
within one launch, /free after the pair).

### 6.2 The Flex arm runs (Rerun A — the fixed shim, gate PASSED)

The audit's demonstrated fix is applied to the shim (durable copy
`scripts/shims/flex.py` + the live testbed copy, kept identical):
`recompile_limit=256` on that single `torch.compile` call (global stays 8),
`fullgraph=True` so budget exhaustion raises instead of silently running
unfused, and `compute_q_blocks=False` as the independent forward
optimization. Two full generations (P1_flex_warm + P1_flex_timed graphs
verbatim, PDMD-4 recipe, P2_2, seed 421337, 124f @ 1088×608):

- **200/200 sparse model-layer calls, ZERO fallback** — engine summary
  "Attention calls: 200 sparse" with no full-attention reasons, headline
  "Veda done | FlexAttention (Triton)" (not "fell back"), **16.6% of full
  attention computed** (identical selection share to FA4), no OOM, no
  recompile-limit failure.
- Sampler-only 83 s (compile-warm gen) → 45 s (second gen); walls 129.7 /
  78.6 s; VRAM peaks 23,887 / 24,051 MiB — **similar observed peaks to
  dense, no advantage** (the audit's chunker follow-ups — the 128 MiB
  chunk floor and the retained previous output — remain open
  memory-efficiency items).
- Honesty on the 45 s: the Triton/inductor disk cache was already warm
  from the audit's runs, and the audit observed some signatures first
  appearing in a second generation (memory-dependent chunking changes head
  counts). 45 s is therefore between cold and guaranteed-steady-state; no
  cold-cache or steady-state claim is made from it. The audit's
  instrumented pair (239/61 s sampler) carried per-call host-side probes;
  this uninstrumented pair is the cleaner number.
- **Flex-fixed lands BETWEEN sage and FA4** (45 vs 48 vs 36 s
  sampler-only): second-fastest kernel through the engine, and the
  Triton-native route (no CuTe wheel) — but the harness rule stands: the
  arm fails if any sparse call falls back, even when the node would still
  complete the user's render.

### 6.3 The canary, narrowed and re-covered (Rerun C)

The original header claimed the within-set zero floor "held across all
five engine launches" — **overbroad**: both canaries (c1, c2) ran in
Part-2's launch only; nothing canary-based covered the other four. Rerun:
the start-canary graph in a FRESH stock-dense launch (Part-2's exact
config) → **c3 ≡ c1 ≡ c2 bit-identical (39 frames + audio)** — 0.39.0
determinism now demonstrated within-launch AND across two independent
launches. c3 vs setB r9 differs, as recorded (0.37.4→0.39.0 drift);
ffmpeg-PSNR 44.25 dB here vs the 41.24 dB recorded at execution — the
same pair by content (c3≡c1 bit-identical makes the relation exact), the
dB delta is PSNR-instrument settings only; both readings sit above the
~38 dB VAE round-trip envelope, same drift class. Cross-set absolute
comparisons against pre-0.39.0 runs keep the §0.3 caveat.

### 6.4 The narrowed claims (Codex findings 4–6, applied above)

- **DMAD recipe adaptation** (§2 disclosure): T2VA-trained checkpoints on
  the ref2va base, deterministic Euler — not the paper's re-noise rule.
  (Follow-up measured same day: the ledger's "THE SAMPLER-RULE A/B" —
  the rule difference measured on P2_6, unblinded pairs at
  gpu-review/sampler-ab/.)
- **Canary coverage**: Part-2's launch + the §6.3 fresh launch; never
  "all five launches."
- **VRAM**: "similar observed peaks" (1 s polling; the 30–190 MiB
  spread across arms is instrument-level); no lower-VRAM claim for any
  kernel.
- **Scaling**: one geometry (124f on-grid); the kernel-level 9.7×/19.4×
  are isolation numbers, not an engine-measured floor.
- **The OOM'd flex generation was a hybrid render** (3 sparse + 197 dense
  calls), not a pure dense render — its † row matched neither arm.

Rerun artifacts: `test-results/experiments/gpu-batch-combined/out/cmb_5_rerun.json`
(manifest: both clocks, gates, lineage checks),
`out/cmb_5_driver.log` + per-launch engine logs, `scripts/cmb_5_rerun.py`,
renders under `setCMBrerun/`.
