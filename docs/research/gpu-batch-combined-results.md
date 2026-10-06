# The combined eval — attention-kernel benchmark + DMAD-vs-PDMD bake-off (2026-10-06)

> Registration: ledger "THE COMBINED EVAL REGISTERED (2026-10-05)" + the DMAD
> intake ([dmad-assessment.md](dmad-assessment.md)). Executor addendum —
> verdicts PROPOSED, the maintainer's 13 blind calls at
> [gpu-review/combined/](../../gpu-review/combined/) decide.

**35 gens / 66.9 GPU-min / single seed (Amendment 5) / knots 33/33
digit-for-digit / null gate PASSED (PDMD duplicate through `__setCMBnull`:
framemd5+audio bit-identical run-time) / canary bookends c1≡c2 BIT-IDENTICAL
(within-set zero floor held across all five engine launches) / teardown
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
4. **The flex arm failed to run** (Part 1 §1.4) — recorded, not retried.

## 1. Part 1 — the attention-kernel benchmark

One generation (P2_2 gymnastics, PDMD-4 recipe 12/3 simple/4), warm + timed
gen per kernel (timed through fresh VAE aliases — the Set B cache-bust
lever). The sparse arms ride the Veda selection at its trained 90%/90% with
the T2VA-8NFE predictor — off-label on ref2va+PDMD (the veda-gate Family-B
label), but **124f@16:9 sits ON the trained 5.2 s plan grid** (unlike the
gate's 39f).

| kernel | timed wall | sampling | per-step | VRAM peak | attn computed | vs dense (sampling) | pixel vs dense |
|---|---|---|---|---|---|---|---|
| Dense SDPA (stock) | 105.2 s | 100.2 s | 17.75 s | 23,897 MiB | 100% | — | — |
| SageAttention 1.0.6 (`--use-sage-attention`) | 81.7 s | 76.7 s | 12.00 s | 24,057 MiB | 100% (dense INT8) | **1.31×** | PSNR 17.2 dB, dE 18.7 |
| **FA4-patched (our tuned kernel)** | **72.5 s** | **66.5 s** | **9.00 s** | 23,867 MiB | **16.6%** | **1.51×** | PSNR 11.6 dB, dE 36.5 |
| FlexAttention/Triton | — FAILED — | (101.2 s†) | (18.0†) | 23,577† | 98.8%† | — | (14.8 dB†) |

† the flex numbers are the node's dense-fallback execution, NOT flex
measurements — see §1.4. Warm walls: dense 117.5, sage 97.0, fa4 96.0
(CuTe JIT absorbed), flex 105.2.

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
**1.31× sampling speedup for one engine flag.** Audio md5 differs (the
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
- **9.00 s/step — 1.51× dense sampling, 1.33× over sage.** Veda-pipeline
  time (gather+score+select+kernel+scatter) 16.21 s = 4.05 s per model call
  × 4 — the selection overhead is included in the win.
- **VRAM peak LOWER than dense** (23,867 vs 23,897 MiB) — the skip pays
  memory-neutral at this geometry.
- Renders materially different from dense (PSNR 11.6 dB) — the veda-gate's
  finding repeats at 5 s on-grid: sparsity is a render-changing kernel, and
  the no-penalty question belongs to the eye, not to pixel-diff.
- One-time cost: the CuTe JIT compile absorbed entirely in the warm gen
  (96.0 → 72.5 s).

### 1.4 FlexAttention — the fallback arm that did not survive the engine
The shim (torch.compile'd flex_attention + BlockMask.from_kv_blocks over
the kept-tile lists, padding-aware mask_mod) passed the self-test and ran
**3 sparse calls in-engine**, then `torch.OutOfMemoryError` at the compiled
call (flex.py:74). The node's designed fallback took over (197/200 calls
dense, honestly logged "fell back to full attention") — the generation
completed as a dense render, which is why the † numbers exist at all.
Best-guess cause (full handoff in Flux comment ao4aon4): torch.compile /
Triton autotune + kernel workspace under the ~0.5 GiB the engine leaves
free at 23.9 GiB residency; contributing: the shim omitted the bench's
`compute_q_blocks=False`, and the veda head-chunker sizes for steady-state
tensors, not compile-time transients. The kernel-level bench (empty GPU)
had flex healthy at eff 0.85–0.96 — engine residency is the difference.
**Fix candidates** for the harness-review agent: `compute_q_blocks=False`,
pre-warm at node-apply time, autotune off, a compile-workspace reserve in
the chunker, or flex stays kernel-level-only.

### 1.5 Part-1 verdict (proposed)
- **FA4-patched is the fastest kernel measured through the engine**
  (1.51× dense, 1.33× sage) with the deepest VRAM profile — and it is the
  only SPARSE arm: its win grows with sequence length (kernel-level:
  9.7× at H3 geometry, 19.4× at 0.05 density), so this 124f number is the
  FLOOR of its advantage.
- **SageAttention is the free dense win** — one flag, 1.31×, zero code;
  ships as the default dense baseline candidate pending the eye's quality
  read.
- Quality gate: no arm is pixel-close to dense (11.6–17.2 dB) — "no
  visible penalty" is an EYE verdict; the review pairs carry it.

## 2. Part 2 — the DMAD-vs-PDMD bake-off (the crown contest)

The P2 six verbatim, 124f, 1088×608, dense SDPA, single seed. Arms:
turbo-8 @ card 6/3 (context) · PDMD-4 v6 @ 12/3 (the king) · DMAD-4
lora-critic @ 12/2 · DMAD-4 full-critic @ 12/2. 208/208 LoRA modules
attached every arm gen, zero NOT-LOADED; knots 33/33.

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
