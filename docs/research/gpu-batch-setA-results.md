# GPU batch — Set A results (static audits, decode/encode-only controls, null-cancellation)

> Flux task: **THE GPU BATCH (ourbqum)** · executed 2026-10-04 on branch
> `component-vocabulary` · executor: Set A (static/no-sampling).
> **Attestation: ZERO sampling generations.** Total engine use = 168 s of
> decode/encode-only work on the 8189 testbed (VAE loads + decodes + one
> 243-frame and one 124-frame VAE round-trip; no KSampler, no turbo sampler,
> no `/free` — the controller owns VRAM phases). All other work is CPU/console.
> Method: sigma grids recomputed by IMPORTING the canonical install's scheduler
> code (`/home/agent/comfyui`; `comfy.samplers.simple_scheduler /
> normal_scheduler(sgm=True) / beta_scheduler` over
> `ModelSamplingDiscreteFlow.set_parameters`); graphs validated OFFLINE by
> `execution.validate_prompt` — the same validator `POST /prompt` runs, with
> `nodes.init_extra_nodes()` loaded — nothing was queued. Artifacts:
> `test-results/experiments/gpu-batch-setA/{scripts,out}` (on-disk, gitignored
> per the runbook); the maintainer-review surface: `gpu-review/setA/`
> (committed). Ledger addendum: Amendment 2 (design changes only).

## A1 — the knot-array table, code-true

**Arms (σ′ schedules, descending, as the sampler executes them):**

| Arm | Grid (code-true) | Mid-band knots σ′∈[0.3,0.8] | Floor (last non-zero) |
|---|---|---|---|
| X1-a simple/20 @ s12 | 1.0000 0.9956 0.9908 0.9855 0.9796 0.9730 0.9655 0.9571 0.9474 0.9362 0.9231 0.9076 0.8889 0.8660 0.8372 0.8000 0.7500 0.6792 0.5714 0.3871 → 0 | 5 | 0.3871 |
| X1-b sgm_uniform/20 @ s12 | 1.0000 0.9957 0.9909 0.9857 0.9799 0.9734 0.9661 0.9578 0.9483 0.9374 0.9247 0.9097 0.8918 0.8698 0.8425 0.8074 0.7608 0.6958 0.5990 0.4392 → 0 | 4 | 0.4392 |
| X1-c sgm_uniform/24 @ s12 [MERGED OUT] | 1.0000 … 0.8074 0.7696 0.7201 0.6527 0.5552 0.4020 → 0 | 5 | 0.4020 |
| X1-d1 **beta(2,4)/20** @ s12 | 1.0000 0.9585 0.9440 0.9320 0.9205 0.9092 0.8979 0.8860 0.8739 0.8608 0.8460 0.8305 0.8130 0.7939 0.7709 0.7440 0.7093 0.6669 0.6045 0.5003 → 0 | **7** | 0.5003 |
| X1-d2 mixture w=0.5 [MERGED OUT] | 1.0000 0.9909 … 0.5923 0.4548 → 0 | 6 | 0.4548 |
| X1-d0 beta(0.8,3)/20 [RELABELED → X3 exploratory] | 1.0000 0.9453 0.9196 … 0.2774 0.1886 0.0983 → 0 | 10 | 0.0983 |
| X3 sgm/20 trunc σ′_end=0.05 | X1-b grid with terminal 0 → 0.05 | 4 | 0.05 |
| X3 sgm/20 trunc σ′_end=0.15 | X1-b grid with terminal 0 → 0.15 | 4 | 0.15 |
| X6 card grid beta(0.6,0.6)/8 @ s12 | 1.0000 0.9950 0.9825 0.9607 0.9234 0.8553 0.7207 0.4249 → 0 | 2 | 0.4249 |
| X6 simple/8 @ s12 (≡ sgm_uniform/8) | 1.0000 0.9882 0.9730 0.9524 0.9231 0.8780 0.8000 0.6316 → 0 | 2 | 0.6316 |
| X7 E-c base-20 (12/3) | = X1-a grid | 5 | 0.3871 |
| X7 E-a turbo-8 (6/3) | 1.0000 0.9767 0.9474 0.9091 0.8571 0.7826 0.6667 0.4615 → 0 | 3 | 0.4615 |
| X7 E-a′ turbo-11-segcut (6/3) | 1.0000 0.9947 0.9890 0.9831 0.9767 0.9474 0.9091 0.8571 0.7826 0.6667 0.4615 → 0 | 3 | 0.4615 |
| X7 E-b base leg t=0.75 (12/3) | 1.0000 0.9956 0.9908 0.9855 0.9796 0.9730 | 0 | 0.9730 |
| X7 E-b turbo leg t=0.75 (6/3) | 0.9474 0.9091 0.8571 0.7826 0.6667 0.4615 → 0 | 3 | 0.4615 |
| X7 E-b′ base leg t=0.5 (12/3) | 1.0000 … 0.9362 0.9231 (first 10 knots of X1-a) | 0 | 0.9231 |
| X7 E-b′ turbo leg t=0.5 (6/3) | 0.8571 0.7826 0.6667 0.4615 → 0 | 3 | 0.4615 |

Full arrays (incl. merged-out arms and the X2 rung graphs) in
`out/a1_sigma_grids.json`. **C1 mislabel table** (per-stage labels at the
handoff, code-true): t=0.75: σ′_base 0.9730 vs σ′_turbo 0.9474 (gap 0.0256) ·
t=0.5: 0.9231 vs 0.8571 (gap 0.0659) · t=0.25: 0.8000 vs 0.6667 (gap 0.1333) —
matches the ledger's C1 numbers exactly; the mislabel grows as the handoff
deepens, as designed.

**Dedup verdicts (pairwise max-|Δσ′| over normalized step progress; merge
rule < 0.05, pre-registered):**

| Pair | max-|Δσ′| | Verdict |
|---|---|---|
| X1-a simple/20 vs X7 E-c base-20 | 0.0000 | same construction (sanity) |
| **X6 simple/8 vs X6 sgm_uniform/8** | **0.0211** | **MERGE — one cell** |
| **X1-b sgm/20 vs X1-c sgm/24** | **0.0358** | **MERGE — X1-c DROPPED (−12 gens)** |
| **X1-d1 beta(2,4) vs X1-d2 mixture** | **0.0455** | **MERGE — X1-d2 DROPPED** |
| X1-b sgm/20 vs X1-d2 mixture | 0.0485 | (mixture already dropped) |
| X1-a simple/20 vs X1-b sgm/20 | 0.0521 | survives — RUNS |
| X1-d1 beta(2,4) vs X1-b sgm/20 | 0.0792 | survives — RUNS |
| X6 card-beta vs X6 simple | 0.2067 | survives — RUNS |

**X6's manifest-vs-simple verdict:** the cells do NOT fully collapse. The two
"alternative grids" collapse into each other (simple ≡ sgm at 8 NFE, s=12),
but the manifest question flips on what "manifest" means: the larryvrh-lineage
v4 card recipe is **Euler + Beta(0.6,0.6), 6–8 steps** (thesis §5.2 [DOC]) —
materially different from simple/8 (0.2067; floor 0.4249 vs 0.6316). **X6 = 2
cells: {card-beta grid} vs {simple ≡ sgm}.** Corollary finding: tranche-1's
turbo arms ran simple/8 — off the card recipe (valid as shipping-path
measurements; the batch's "manifest grid" cells mean the card recipe).

**Thesis errata (recorded; no ledger design change):** the thesis §3.1 printed
`sgm_uniform` row shifted endpoints — code-true the grid INCLUDES the leading
σ′=1.0 and floors at 0.6527 (N=8@s12) / 0.4392 (N=20); the printed 0.1260
floor was the dropped-endpoint variant. §3.2's s=32 sgm floor is ≈0.85
code-true, not 0.506. Qualitative claims (sgm floors deeper than simple;
scheduler separation grows with shift) hold; magnitudes corrected. Also
confirmed: at s=12 the schedulers are near-twins (simple vs sgm = 0.0521 at
N=20) — the Krea 2 §4a.4 "functional twin" observation extends to H3 at
native shift; separation lives at high shift and in the beta family.

## A2 — the beta-arm relabel

**X1 arm-4 = Beta(2,4)/20.** The separation test: the w=0.5 uniform mixture
merges into Beta(2,4) (0.0455 < 0.05), so the SIMPLER representative wins —
pure Beta(2,4) is the stock `beta_scheduler(α=2, β=4)` quantile grid (interior
mode at b=0.25, the true mid-low treatment; 7 mid-band knots vs the uniforms'
4–5). **Beta(0.8,3) is RELABELED** boundary-peaked / fry-direction probe (α<1
⇒ peak at b→0: 10 mid-band knots, 8/20 knots below σ′=0.5, floor 0.0983) and
offered to X3 as the optional exploratory cell — never an X1 "mid-low" arm.
Numerically verified; no X1 GPU arm will run under a wrong treatment label.

## A3 — graph BOMs, contract checks, attachment inventory

**Compile: 23/23 graphs validate clean** against the live node inventory
(`execution.validate_prompt`, offline; the two initial FAILs were my own wiring
bugs, fixed — not inventory gaps). Per-graph API-format JSONs + BOM manifests:
`out/graphs/*.json` + `out/a3_boms.json`. Sets covered: B (canary), C (X1 ×4
incl. merged-out, X3 ×3, X6 ×3, X2 rungs ×3), E (all 7 arms incl. the staged
E-b/E-b′/E-d/E-e), F (representative F1 via the local Viggle pack).

- **Frame contract:** 39 f = 17·2+5 ✓; audio rows 65 = round(39·5/3) ✓ — by
  construction (`MiniMaxH3ImageToVideo length=39`); X2 rung canvases 960×544 /
  1024×576 / 1344×768 (all /32). The batch's board clips (Set G/H) do not exist
  yet — their ffprobe+latent-geometry check lands with their prep (flagged in
  §A6 exit notes).
- **Custom grids:** KJNodes `CustomSigmas` FORCE-ZEROES the terminal value
  (`sigmas_tensor[-1] = 0`) — it would silently corrupt every truncation grid
  and staged-handoff leg. Fixed by a new local-tier shim **`ExpSetSigmas`**
  (exact sigma passthrough, non-increasing check, registration-only; added to
  `exp_shims`, recorded in the canonical install's CLAUDE.md PART 2 History;
  picked up by 8189 on its next restart). Grids ending in 0 (beta arms, X6
  card, segcut) use stock `CustomSigmas`.
- **X7 machinery (C1–C6 verified by construction in the BOM):** stage legs via
  `ExpSetSigmas` (A1 arrays); handoff = stage-1 `output` → stage-2
  `latent_image` with `DisableNoise` (deterministic samplers never re-noise);
  per-stage DiT remap via two native `MiniMaxH3SigmaShift` patches (C3). **C2
  finding: the audio rebasing is NATIVE at the SamplerCustomAdvanced
  boundary** — stage-1 leaves through `process_latent_out` (audio ÷
  audio_scale₁; samplers.py:1238 via model_base.py:2167) and stage-2 enters
  through `process_latent_in` (audio × audio_scale₂; samplers.py:1224) — the
  scale-ratio rescale IS the boundary, and σ_a is continuous across the handoff
  because both stages derive it from the same base position t through s_a=3.
  No custom audio-rescale node is needed (the ledger's "unpack→rescale→repack"
  concern is dissolved by the clean-latent boundary); E-d's noop-rescale ×1.0
  is noop by construction, and the mandatory audio sub-endpoint on E-b stands
  as the measurement that catches any residual error.
- **E-d/E-e cancellation arms compile** (base→base 5+15; turbo→turbo segcut
  5+6) — Set E's precondition gate is constructible today.
- **Set E model ruling needed (found by the compile):** the 6/3 turbo manifest
  is the LightX2V 768p line; locally we hold only the **REF2VA** flavor
  (`minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16`). Either fetch the
  FL2VA 768p turbo (≈1.9 GB) or rule the ref2v substitution at the Set E gate
  (§A6 gap G-E1).

**Attachment inventory (files present, sha256, policy):**

| Adapter | File (all under /home/agent/models) | sha256 (first 12) | §1.3 class → attachment |
|---|---|---|---|
| H3 turbo (larryvrh v4) | `loras/minimax_h3_turbo_v4_step600_ema.safetensors` (780 MB) | 5f3a626cd72c | H3-turbo lineage → **BYPASS runtime** (see correction below); MERGE = OOM fallback |
| H3 turbo (LightX2V Ref2VA 8-step v1.0 768p) | `loras/minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors` (1.96 GB) | 6a56f41ab422 | as above; manifest 6/3 |
| H3 turbo (LightX2V Ref2VA 4-step v0.1) | `loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors` (1.96 GB) | 5b9ab5ade15d | as above; manifest 12/3 |
| VDN dmd-step-250 | `vdn/stage-dmd-step-250/adapters/{default,turbo}` | 58558fef506f / 24fc93c82fe8 | H3-turbo lineage → bypass (per corrected row) |
| Viggle DMD r64 | `loras/viggle_animate_dmd_lora_r64.safetensors` (rank 64 verified from tensors; 942 MB) | 8dc50f293c50 | DMD class → **NEVER MERGE** — satisfied natively: stock `LoraLoaderModelOnly` is runtime/bypass injection |
| Viggle DMD r128 | `loras/viggle_animate_dmd_lora.safetensors` (rank 128 verified; 3.77 GB) | 71361eb8c331 | as above |
| Viggle finetune | `diffusion_models/minimax_h3_ref2va_viggle_pruned_int8_convrot.safetensors` | c16db9a45346 | base finetune (n/a) |
| Viggle frozen embed | `text_cond/fixed_embed_fwd_anyframe.safetensors` | 86ae5987dda8 | n/a (text-free doctrine) |
| Fun-Control Union | `controlnet/MiniMax-H3-Fun-Controlnet-Union.safetensors` (6.8 GB, in models MANIFEST since 09-17) | (models MANIFEST) | Set G incumbent — present; branch identity re-verified at the G gate |
| Krea 2 Identity Edit v1.2 | `loras/krea2_identity_edit_v1_2.safetensors` | 6adf9a69cc95 | Krea 2 edit pack nodes carry the recipe (§1.3 row 4) |
| Krea 2 AnyPaint rank32 | `loras/krea2_anypaint_rank32.safetensors` | 3a7d09f6b27f | as above |

**§1.3 correction (recorded as ledger Amendment 2.4):** the H3-turbo MERGE
row's "[MEASURED, tranche 1]" citation is wrong — tranche-1's graphs ran
`MiniMaxH3TurboLoRA` with `low_vram: False` = **bypass (runtime)**, and the
installed pack's own doctrine says bypass is correct on quantized bases
("merge … softer on quantized bases — the delta is partly rounded away"),
the same rationale as the DMD never-merge class. Corrected: H3 turbo lineage
attaches BYPASS; MERGE is the OOM fallback only. The runbook's
"turbo runs use merge-mode" line inherits this correction.

**Sets D–J requirement BOMs (models missing → §A6 schedule):** D1 (Krea 2
E-K3: local ✓ — krea2 raw/turbo int8 + VAE + identity-edit + anypaint +
`Krea2EditModelPatch`/`Krea2EditGroundedEncode` nodes installed); D2 (SCAIL-2
+ Wan-Animate-2: MISSING); D3/D4 (H3-side: compile-equivalent to the C
graphs ✓); F (all local ✓ — pack nodes `ViggleTextCondLoader`,
`ViggleAnimateConditioningWindowed`, `ViggleChunkedSampler` compile; one card
check at F open: int8 video VAE vs the local fp16/fp32); G (Fun-Control ✓,
SCAIL-2/Wan-A2 shared with D2); H (RIFE MISSING for VIG-FPS; ceilings
re-verification is a doc/API check); J (Meridian/VOID/Anime-to-Realism/
UniLumos/HyperFlow/MoGe MISSING — packs + weights per §A6).

## A4 — decode/encode-only controls (the metric pipeline's null table)

Run ON 8189 (decode/encode only; contention-guarded; no `/free`):

1. **VAE round-trip (243 f clean render, item0_genA, 864×480):**
   PSNR mean **37.83 dB** (median 38.14, p05 36.66, min 36.39, max 39.39);
   dE(CIE76) mean **1.97** (median 1.92, p95 2.20, max 2.27); MAD mean 2.40/255;
   global PSNR 37.75 dB. NOTE: this is an UPPER bound on the VAE-only floor —
   the comparison path includes one h264 decode of the source (the reference
   frames were themselves extracted through ffmpeg), so ~0.3–1 dB of this is
   codec. **Downstream rule: any arm-vs-arm pixel delta in the ≲38 dB / ≲2 dE
   class is inside the VAE round-trip envelope and is NOT evidence of a
   treatment effect on its own.**
2. **Latent-hold decode stability:** the same saved latent
   (`crossfade_39f_linear`) decoded at two load states (video-VAE fresh @
   5453 MiB, vs after a 243-frame round-trip + audio-VAE decode @ 6131 MiB) →
   **byte-identical, 39/39 frames, max-abs-diff 0.0, PSNR ∞.** Decode is
   deterministic across residency states on this stack — the Kreatine-era
   lowvram-line worry does not touch the decode path.
3. E4-class decode checks (tranche 1) already measured — not extended (Set B's
   canaries would demand it; they won't, per 2).

Outputs viewable in `gpu-review/setA/a4_decode_nulls/` (holddecode pair +
original-vs-roundtrip, muxed) — per Amendment 1 the maintainer can eyeball the
VAE floor alongside the automated numbers.

## A5 — null-cancellation + the known-corruption calibration set

**Metric nulls (identical input, double run — exact-equality contract):**

| Metric | Null result |
|---|---|
| seam ratio / seam PSNR / seam MAD (t1 convention) | exact-equal ✓ |
| shimmer: temporal-gradient ratio + flow-warp residual (Farneback) + alternation FFT peak | exact-equal ✓ |
| ArcFace identity (insightface buffalo_l, CPU) | exact-equal ✓ |
| face dE + L* (tracked region) | exact-equal ✓ |
| audio join correlation + RMS step | exact-equal ✓ |
| treble ratio | exact-equal ✓ |
| PSNR/dE two-input (frame vs itself) | inf / 0.0 exactly ✓ |
| plan-error (director harness) | NOT scriptable in Set A — harness is Set C material; null by construction for identical inputs; floor measured at Set B |

Within-video motion context (frame-0 vs frame-30/60 of the clean render):
PSNR 17.95 / 15.07 dB — the natural-motion scale the seam/shimmer metrics
divide against (labeled here so nobody mistakes it for a null).

**The judge calibration set (ledger §1.4):** one clean tranche-1 render
(e3_plain_aud, 124 f = 17·7+5, 864×480, h264 + original audio muxed into every
variant) + six graded corruptions:

| ID | Construction |
|---|---|
| c1 | VAE re-encode (H3 video VAE fp16 encode→decode ON 8189 — the A4 machinery, zero sampling) |
| c2 | +2 L* uniform gain (Lab L channel, exact by construction) |
| c3 | 1-frame temporal jitter (adjacent frames 61↔62 swapped) |
| c4 | cross-blended seam (frames 62..78 linear-ramp blended with frames 100..116; hard edge back to clean at 79) |
| c5 | identity-swapped face crop (donor = different identity from the efc1 contact sheet, cos-to-clean 0.021, 99×96 px, feathered paste, applied 124/124 frames) |
| c6 | ½-resolution downsample (864×480→432×240 area → up bilinear) |

**Pre-registration discipline held:** the blinded expected-ranking key
(`out/a5_expected_key.json`, mirrored in `gpu-review/setA/pairs/.key`) was
written from the corruption DEFINITIONS before any measurement ran (script
stage order enforces it). The key encodes per-effect expectations (c5 ≪ others
on ArcFace; c2 = +2 L* exactly; c3 spike + c4 window on the temporal metrics;
c6 on HF/PSNR; c1 near-floor; ALL identical on treble — the audio-null check)
and the expected TIE on the A4 holddecode pair.

**Calibration measurement (all 7 variants through the full battery; the
a-priori key was CONFIRMED on every endpoint):**

| Variant | global PSNR vs clean | global dE | HF ratio | ArcFace vs CLEAN ref | face L* (mean) | seam ratio @61 | seam ratio @79 | warp resid (med) | alternation peak power | treble ratio |
|---|---|---|---|---|---|---|---|---|---|---|
| clean (re-encode baseline) | 42.0 | 1.44 | 1.00 | 0.547 | 12.04 | 1.08 | 1.11 | 6.96 | 0.0018 | 0.002553 |
| c1 VAE re-encode | 36.5 | 2.25 | 0.99 | 0.528 | 11.24 | 1.07 | 1.11 | 6.93 | 0.0018 | 0.002553 |
| c2 +2 L* | 36.1 | 1.85 | 1.02 | 0.536 | **13.81 (+1.77)** | 1.07 | 1.11 | 6.95 | 0.0018 | 0.002553 |
| c3 1-frame jitter | 39.2 | 1.72 | 1.00 | 0.545 | 12.04 | **1.69** | 1.11 | 7.15 | 0.0019 | 0.002553 |
| c4 cross-blended seam | **23.0** | **8.20** | 0.92 | 0.559 | 11.69 | 0.86 (soft start) | **4.98** | 7.67 | **0.0112 (6.3×)** | 0.002553 |
| c5 identity swap | 24.4 | 7.05 | 1.04 | **0.074** | 24.38 (donor) | 1.01 | 1.12 | 7.91 | 0.0019 | 0.002553 |
| c6 ½-resolution | 40.6 | 1.55 | **0.45** | 0.537 | 12.21 | 1.06 | 1.11 | 6.62 | 0.0017 | 0.002553 |

Reads: the identity endpoint (external-canonical ArcFace) catches c5 alone
(0.074 vs the 0.53–0.56 band — donor selection measured cos 0.021, paste
tracking lands at 0.074); the color endpoint resolves the +2 L* construction
at +1.77 mean (frame-mean dilution of a +2 exact shift); the temporal
endpoints isolate c3 (1.69 at the swapped pair) and c4 (4.98 at the
blend→clean edge, alternation power 6.3×) exactly where the key placed them;
the texture endpoint isolates c6 (HF 0.45); c1 sits near-floor everywhere;
**treble is byte-identical across all seven (0.002553) — the audio-null check
passes exactly** (audio muxed unchanged; any audio-metric movement on a
video-only treatment is pipeline error, by construction).

**Calibration-spawned metric fix (the set working as designed):** the first
pass self-referenced each variant's own frame 0 for ArcFace/face-color — c5
then read 0.831 ("more internally consistent than clean": a static pasted
donor beats a moving real face) — a metric-operationalization flaw the
corruption set exists to catch. Fixed in `batch_metrics.py`
(`arcface_identity`/`face_color` now take an external canonical reference —
the ledger B2 "vs canonical reference" reading; self-reference remains the
default for within-video reads). Residual known limitation: region-anchored
face dE is motion-dominated on walkthrough material (≈22 baseline) — per-frame
tracked boxes are the Set B refinement if face dE becomes load-bearing.

**The review surface (Amendment 1):** `gpu-review/setA/` carries the browsable
ladder (`corruption_ladder/`), the A4 decode nulls (`a4_decode_nulls/`), eight
blinded randomized pairs with the key escrowed (`pairs/.key` — do not open
until your calls are recorded), and `review.html` — a static, no-framework,
no-server page (side-by-side looping players, per-pair left/right/tie/cannot-
assess + note, responses persist in localStorage and export as
`review-responses.json` via download — file:// pages cannot write arbitrary
paths). **The maintainer eyeballs the corruption ladder BEFORE the automated
judge's sensitivity floor counts.** The surface is a standing deliverable for
every later set that produces judged outputs (noted in the exit criteria
below).

## A6 — environment inventory + the fetch schedule

**Environment:**

| Item | Status |
|---|---|
| insightface | **PRESENT and functional** (2.0; buffalo_l detection+recognition load; ArcFace embeddings verified live) — the tranche-1 absence lesson is stale; no install needed |
| pyiqa (NIQE/MUSIQ) | **ABSENT** — install decision at first use; recommend an ISOLATED uv venv (pyiqa pins its own torch-family versions; do not disturb the canonical venv's pinned stack) |
| cv2 / onnxruntime / scipy / skimage | present (flow-warp residual + Lab + FFT all CPU-runnable) |
| librosa / soundfile | absent — audio metrics run ffmpeg→numpy (t1 convention; sufficient) |
| ffmpeg n9.0.2 | libx264 + aac + flac ✓; frozen-audio tooling precedent: `tranche3b/scripts/diffsynth_inject_audio.py` |
| 8189 testbed | healthy (ComfyUI 0.37.4, torch 2.12.1+cu130); one shim added (ExpSetSigmas — PART 2 History updated; picked up on next restart) |

**Fetch schedule (gated per set; NO fetches executed — every row lands with
its consent surface + registry row at fetch time per the licenses policy;
weights never enter the repo):**

| Gate | Item | Source | Size | License class to surface |
|---|---|---|---|---|
| BEFORE Set D (D2) / Set G | SCAIL-2 int8-convrot | HF zai-org/SCAIL-2 (+Comfy-Org repack) | ~16.7 GB | MIT per fresh-eyes §11 — still user-fetch (weights) |
| BEFORE Set D (D2) / Set G | Wan-Animate-2 distilled | HF Wan-AI/Wan2.2-Animate-2-14B | ~14 B class | Apache-2.0 |
| Set E gate (NEW, from A3) | **FL2VA turbo 8-step v1.0 768p (ComfyUI flavor)** — or the ruling to substitute the local REF2VA flavor | HF lightx2v/Minimax-h3-Turbo | ~1.9 GB | per card |
| Set F open | (no fetch anticipated) card check: int8 video VAE vs local fp16/fp32 | Viggle card | — | — |
| Set H (VIG-FPS) | RIFE interpolation weights | community RIFE (ComfyUI Frame-Interpolation class) | ~50 MB | permissive-class weights |
| Set J | Meridian INT8 (camera/retime pair) | HF Viggle/Meridian | 34 GB | Viggle license; **VGGT-FAIR-NC component flag surfaces at consent** |
| Set J | VOID | HF Comfy-Org/void-model | TBD | per repo |
| Set J | Anime-to-Realism LoRA | CivitAI 2783657 | 296 MB | CivitAI user-fetch class |
| Set J | UniLumos relight | HF (per fresh-eyes §11) | TBD | at consent |
| Set J | HyperFlow-H3 pack | GitHub Adudeguyman/ComfyUI-HyperFlow-H3 + drbaph card | pack | per repo |
| Set J (J2 comparator) | MoGe geometry weights | HF (per fresh-eyes) | TBD | at consent |
| Set J (J1) | adherence mechanisms (Fizgig / T8mars / Semantic Bridge) | T8mars repo lineage (fresh-eyes §11) | code/packs | per repo |

Already local (fetch rows retired): the Viggle set (finetune pruned-int8 +
DMD r64 + DMD r128 + frozen embed — SHAs above), Fun-Control Union 6.8 GB
(branch identity re-checked at the G gate).

## Exit-criteria self-assessment

| Ledger exit criterion | Status |
|---|---|
| Knot table frozen (X6 arm count fixed; X1 arm-4 chosen) | **MET** — X1 = 3 arms (X1-c dropped, arm-4 = Beta(2,4)); X6 = 2 cells (simple≡sgm merged); Beta(0.8,3) relabeled to X3-exploratory; ledger Amendment 2 records the changes |
| All graphs compile with manifest-verified knots | **MET for Sets B/C/E/F-representative (23/23 offline-validated, knots = A1 arrays)**; D2/G/H/J graphs are BOM'd with explicit model gaps (the gaps ARE the deliverable — no set discovers mid-window that a node is missing; model arrivals close their rows) |
| Metric nulls recorded | **MET** — every scripted metric exact-zero on identical input; decode-nulls byte-identical across load states; VAE round-trip floor quantified (37.8 dB / dE 1.97 upper bound) |
| Judge calibration set + expected ranking key (blinded) | **MET** — 7-file ladder + 8 blinded pairs + escrowed pre-registered key; **the maintainer's own-eye pass over the ladder (Amendment 1) is the remaining human step before Set B's judge session** |
| Fetch schedule accepted by the maintainer | **PENDING MAINTAINER** — schedule delivered (§A6); acceptance + the Set E turbo-file ruling are the two open maintainer calls |

**Standing Amendment-1 note for later sets:** every set producing judged
outputs ships the review surface (review dir + blinded pairs + escrowed key +
review.html + the verdict table in that set's results doc). Set A's surface is
the template.

## Deviations, concerns, and notes

1. **GPU use:** 168 s decode/encode-only (VAE loads/decodes + two round-trips);
   zero sampling; no `/free` (controller-owned); contention guard clean at
   every submit; VRAM trace 563→6131 MiB across the four phases (left
   resident deliberately — the controller phases it).
2. **The thesis's printed sgm grids carried an endpoint bug** (details §A1) —
   the thesis's own §2.1 tables were exact, so no Reddit-derived number
   changed; only the thesis's §3.1/§3.2 sgm rows correct.
3. **Tranche-1's turbo path ran off-card** (simple/8 vs the card's Beta) — no
   past conclusion is invalidated (they were shipping-path measurements), but
   X6's "manifest" cells now mean the card recipe.
4. **The A4 round-trip floor includes the reference path's h264 decode** —
   treat 37.8 dB as the working envelope, not a pure-VAE constant (Set B's
   canaries can tighten it if ever needed).
5. **calibration c5's donor face is 99×96 px** (contact-sheet cell) — adequate
   at 864×480 target scale, but the pasted face is softer than a native render;
  the expected key accounts for it (identity endpoint, not texture).
6. **pyiqa absent** — isolated-venv install recommended at first NIQE/MUSIQ
   use; not blocking any set before J.
7. **Two shims/pins touched the canonical install:** `ExpSetSigmas` added to
   exp_shims (local tier, PART 2 History line appended; server picks it up on
   restart). Nothing else changed; no core/pack updates.
