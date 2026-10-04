# GPU batch — Set B results (calibration: the measured variance every later set depends on)

> Flux task: **THE GPU BATCH (ourbqum)** · executed 2026-10-04 on branch
> `component-vocabulary` · executor: Set B (calibration).
> **Attestation: 10 engine passes, all sampling** = 9 canary-class renders
> (~63 s mean each) + 1 foreign-model micro-load (21 s) + 3 sub-second
> cache-hit no-ops (pass 1, discarded) ≈ **10.7 min GPU**. No `/free` (the
> controller owns VRAM phases — final state left resident at 22679 MiB,
> reported). Artifacts: `test-results/experiments/gpu-batch-setB/{scripts,out}`
> (on-disk, gitignored per the runbook); the maintainer-review surface:
> `gpu-review/setB/` (committed). Ledger addendum: Amendment 3.

## The headline

**The batch's noise floors are ZERO — bit-level.** Nine identical-config
renders across four loading conditions produced byte-identical frame streams
(framemd5 equal) and byte-identical audio (stream md5 equal) on every pair;
all ten scripted metrics returned bit-identical values (SD = 0.0 exactly);
the review instrument's independent frame verifier confirms 0 L/R pixel
differences on all 8 blinded pairs. Any nonzero paired metric delta measured
by this battery on this stack is attributable to treatment, not render
noise, at the battery's resolution (§B3).

The community render-to-render figures (±0.039 ArcFace / ±0.38 face dE,
[COMM loopforge], cloud-API class) are demoted to priors in full — they
measure server-side infra nondeterminism, not a pinned self-hosted stack.
The Kreatine VRAM-nondeterminism magnitude (1.18% RMS latent, Krea 2
fp8+LoRA class) does **not transfer** to this stack's H3 int8-convrot path:
the post-model-reload canaries — including r5, whose sampling phase ran
with the base DiT streaming from disk mid-generation (sampling_s 63.6 s vs
the 54–57 s warm band) — are bit-identical to the cold render. The
**lowvram-line comparison rule stays binding** as cheap insurance (Kreatine
convention); its measured magnitude here is zero.

## B1 — identical-config canaries across loading conditions

**Board (one config, everywhere):** tranche-1 `PROMPT_A` verbatim (the
recorded board prompt whose chain produced `e3_plain_aud`, Set A's clean
render / calibration source — same character, scene, camera and audio
design) at the batch canary geometry **960×544×39f**, `res_multistep` +
`simple`, 20 steps, denoise 1.0, seed 421337, model-default shifts (12/3 —
`MiniMaxH3` class, `supported_models.py:968`, no shift node; knots = A1's
code-true simple/20 @ s12 array, `a3_boms.json` B-canary row). **Base stack
only: no turbo, no LoRA, no VDN, no adapters of any kind** — so the wall
clocks below are BASE-stack numbers. Models + SHAs in the machine manifest
(`out/b1_runs.json`, mirrored to `gpu-review/setB/runs/manifests.json`):
DiT `minimax_h3_fl2va_pruned_int8_convrot` (e889202c…), TE
`qwen3vl_32b_minimax_h3_int8_convrot` (bc2ced0f…), video VAE fp16 (7c1f1314…),
audio VAE fp32 (8e505d95…).

**The execution-cache find (pass 1; the set working as designed).** The
first driver pass submitted the identical graph per run and got 4.0 s
"renders": ComfyUI 0.37.4's cross-prompt **InputSignature outputs cache**
returns the cached sampler/decode outputs for identical input values — r2–r4
executed in 0.84 s with zero model lines and framemd5 equal to r1 (the
cache-copy diagnosis proven at wall-time, engine-log, and frame-hash
levels). No per-prompt nocache exists (`/prompt` offers nothing;
`partial_execution_targets` only filters output nodes; no stock node in the
chain carries `NOT_IDEMPOTENT` or a `UNIQUE_ID` hidden input; a shim would
need a controller-owned restart). The sanctioned bypass actually used —
**provably render-neutral value changes**:

1. **video-VAE loader name** alternated over three byte-identical files
   (sha256 `7c1f1314…e522` all three): `minimax_h3_video_vae_fp16`,
   `musubi_video_vae_fp16` (both pre-existing), and the `__setBalias`
   symlink created for the ninth signature. The video VAE feeds
   `MiniMaxH3ImageToVideo`, so this re-executes the ENTIRE pipeline (TE
   encode + latent canvas + sampling + both decodes) on identical weights.
2. **`RandomNoise.control_after_generate`** cycled fixed/increment/decrement
   — a frontend-only widget key (`execute()` takes `noise_seed` only,
   `nodes_custom_sampler.py:1014`); present in the submitted inputs, so it
   changes the cache signature with zero server-side effect.

3 names × 3 values = 9 fresh signatures for r2–r9 (r1 = first execution of
its own). A **structural hash** (node ids normalized, cosmetic levers
neutralized) is asserted identical across all runs — config identity is
machine-checked, and the bit-identical outputs are themselves the final
empirical proof that the levers were neutral.

**The loading conditions (as executed — pass-1 recovery documented):**

| Run | Condition | wall_s | load+encode_s | sampling_s | peak VRAM | Staging lines (all runs, all conditions — IDENTICAL) |
|---|---|---|---|---|---|---|
| r1 | cold-start (n=1) | 69.5 | 15.0 | 54.4 | 24071 | TE 25882 MB / p0 · DiT 19995 MB / p0 · aVAE 576 MB / p0 · vVAE 4965 MB / p0 |
| r5 | post-model-reload | 69.6 | 6.0 | **63.6** | 24165 | idem (DiT re-staged after the probe's 32427 MB foreign DiT) |
| r6 | post-model-reload | 60.3 | 6.0 | 54.2 | 23991 | idem |
| r3 | warm | 60.3 | 5.0 | 55.2 | 24001 | idem |
| r4 | warm | 60.3 | 5.0 | 55.2 | 23899 | idem |
| r2 | warm (recovered slot) | 60.2 | 5.0 | 55.2 | 23899 | idem |
| r7 | repeat-warm | 63.3 | 6.0 | 57.3 | 24165 | idem |
| r8 | repeat-warm | 63.4 | 6.0 | 57.3 | 24165 | idem |
| r9 | canonical (reference) | 61.3 | 6.0 | 55.3 | 23895 | idem |

- **Cold-start honesty:** the session's actual state was recorded — Set A's
  decode work left both VAEs resident (5715 MiB), DiT+TE cold. r1 is the
  only genuinely cold sampling pass this server session; the cold pair's
  second slot was consumed by the cache bug and re-run as a warm canary
  (`r2`, honestly labeled). The pooled SD is condition-count-insensitive;
  the cold-vs-warm OFFSET is still measured (r1 vs the warm band, below).
- **Post-/free + post-foreign-residency analogue (the no-`/free`
  adaptation):** the foreign-model operation loaded the UNPRUNED sibling
  `minimax_h3_fl2va_int8_convrot` (a different model, same arch family —
  the canary node stack runs it unchanged) through a 64×64×5f 1-step
  micro-pass; the engine staged 32427 MB of foreign DiT, evicting the base
  stack. r5/r6 then re-loaded the base stack from disk under foreign
  residency — r5's sampling phase visibly ran with disk-streaming in it
  (63.6 s). That perturbed execution still produced the bit-identical
  render: the strongest single datum in the set.
- **Kernel pin:** stock attention routing; SageAttention ABSENT from the
  venv (import fails) — off by absence, recorded per §1.2 item 3.
- **The exit-criterion check "canary lowvram lines stable": PASS.** Every
  run in every condition produced the identical staging quartet (same MB,
  same 0 patches, same force-preloaded counts) — this stack's dynamic-VRAM
  preparation is condition-invariant. No attachment/load bug found (the
  cache find was an API-tooling bug, not a load bug — see Deviations).

**Wall-clock economics (the coordinator's ask; base stack, no
turbo/LoRA/VDN):** mean **63.1 s/gen** over the 9 renders (60.2–69.6 s;
load+encode 5–6 s warm vs 15 s cold). The ledger's cost anchor "base-20 @
544p-class 39f ≈ 5–7 min warm [EST]" was ~6× pessimistic — **measured:
~1 min/gen**. Later sets' window arithmetic should re-anchor on this (e.g.
Set C's 48–54-gen window-1 estimate drops from 5–7 h to ~1 h of sampling,
plus loads/metrics).

## B2 — the metric battery over the canaries (vs-canonical + pairwise)

Set A's battery (`batch_metrics.py`, A5-null-verified, external-canonical
fix) over all 9 outputs: **vs-canonical** (identity/color against the
canonical r9's reference frame — an independent draw) + per-video scalars +
the full 36-pair matrix. Region: canonical frame-0 face bbox ×1.5 (fixed
across runs). Frame contracts verified per output (39 f, 960×544, 24 fps,
audio present — all ok).

**The SD table (the noise floors; 8 condition canaries):**

| Endpoint | Mean (the board's reference reading) | SD | Range |
|---|---|---|---|
| seam ratio @ f20 | 1.0236 | **0.0** | [1.0236, 1.0236] |
| shimmer grad ratio (region/global) | 0.84643 | **0.0** | constant |
| flow-warp residual (median, region) | 7.4566 | **0.0** | constant |
| alternation FFT peak power (3–13 Hz) | 0.01094 (peak 3.158 Hz) | **0.0** | constant |
| ArcFace vs canonical | 0.77072 | **0.0** | constant |
| face dE vs canonical | 24.6346 | **0.0** | constant |
| face L* (region) | 8.684 | **0.0** | constant |
| global L* mean | 31.240 | **0.0** | constant |
| treble ratio | 0.003507 | **0.0** | constant |
| audio join corr @ mid | −0.08432 | **0.0** | constant |
| PSNR vs canonical (context) | **∞ (inf on all 8)** | 0 | pixel-identical |
| global dE vs canonical (context) | 0.0000 | 0 | pixel-identical |

Per-condition offsets vs the grand mean: **0.0 on every endpoint, every
condition** (the condition means are the same numbers). The 36-pair matrix:
PSNR inf / dE 0.0 throughout. Bit-level cross-checkes independent of the
battery: framemd5 equal and audio-stream md5 equal across r1/r3/r5/r9; the
review instrument's `verify-frame-assets.py` reports 0 L/R pixel
differences on all 8 pairs.

Readings recorded as context, not floors: face dE ≈ 24.6 is the
motion-dominated region baseline (Set A's known A5 limitation — per-frame
tracked boxes remain the refinement IF face dE becomes load-bearing); the
board renders low-key (global L* ≈ 31) — color-endpoint headroom on later
boards is a prompt-lighting factor, not a floor issue. **plan-error: NOT
MEASURED** — the canary board carries no director-harness plan (Set A
already flagged it Set-C material); null by construction for identical
inputs, floor to be measured on the plan-bearing board at Set C open.

## B3 — the detectability table

MDE = 2.8·SD_B·√(2/n) per endpoint for the later sets' typical cell counts:

| Endpoint | SD_B | MDE n=4 | n=6 | n=12 | n=24 |
|---|---|---|---|---|---|
| all ten scripted endpoints | **0.0** | **0** | 0 | 0 | 0 |

With SD_B = 0, the MDE collapses to the **battery's measurement
granularity** — the honest operational floor per endpoint (the rounding
the scripts apply): ArcFace 1e-5 · face dE 1e-4 · L* 1e-3 · seam ratio 1e-4 ·
grad ratio 1e-5 · warp residual 1e-4 · alternation power 1e-5 · treble 1e-6 ·
join corr 1e-5 · plus the h264 container's frame-exactness (framemd5-stable;
container-level md5 differs on metadata — **use framemd5, not file md5, for
any bit-comparison in later sets**). Practical reading for every set gate:
a paired Δ at or above these granularities is measurable at ANY n; the
pre-registered practical floors (10–15% relative [EST]) now dominate every
threshold formula, with SD_B contributing nothing.

## The Amendment-1 surface (gpu-review/setB/)

- `pairs/p01..p08_{L,R}.mp4` — 8 blinded canary-vs-canary pairs (4
  within-condition: reload/warm/warm2/recovered-slot; 4 cross-condition:
  cold-vs-warm, cold-vs-reload, reload-vs-warm2, canonical-vs-cold), sides
  assigned by sha256, **expected TIE on every pair — pre-registered in the
  escrowed `pairs/.key`** (do not open until your calls are recorded). The
  surface ships anyway so the maintainer sees what "identical config"
  looks like: every pair is two copies of the same frames.
- `pairs-metadata.js` — the v2.1 contract (`scripts/gpu-review/
  PAIRS-METADATA-SPEC.md`): `shared` = the full canary config (one config,
  so shared carries nearly everything; the condition for within-condition
  pairs); `L`/`R` = per-side `wall_s` + `load_encode_s` + `sampling_s` +
  peak VRAM (+ per-side condition on cross pairs) — reveals only after the
  call is recorded.
- `pairs-frames.js` + `frames/` — the frame-strip assets per
  FRAME-ASSETS-SPEC (the extractor deduped 8 pairs into 4 unique strips,
  8.7 MiB — the zero floor made visible in the file system itself).
- `runs/` — all 9 canaries with `manifests.json` (per-run walls, residency
  lines, cache-bust levers, graph + structural hashes).
- `review.html` — the staged v2.x template (used as-is; **open as
  `review.html?set=B`** — the URL param selects the response store so
  setB calls don't collide with setA's in localStorage).

**The verdict-table scaffold (the maintainer's calls land here):**

| Pair | Contrast (blinded until key open) | Expected | Maintainer's call | Automated battery |
|---|---|---|---|---|
| p01 | reload r5 vs r6 | tie | _pending_ | tie (bit-identical) |
| p02 | warm r3 vs r4 | tie | _pending_ | tie (bit-identical) |
| p03 | repeat-warm r7 vs r8 | tie | _pending_ | tie (bit-identical) |
| p04 | warm r2 vs r3 | tie | _pending_ | tie (bit-identical) |
| p05 | cold r1 vs warm r3 | tie | _pending_ | tie (bit-identical) |
| p06 | cold r1 vs reload r5 | tie | _pending_ | tie (bit-identical) |
| p07 | reload r6 vs repeat-warm r7 | tie | _pending_ | tie (bit-identical) |
| p08 | canonical r9 vs cold r1 | tie | _pending_ | tie (bit-identical) |

Disagreement handling per §1.4b: any non-tie call vs the bit-identical
automated read escalates as a protocol event (it would mean a visible
difference where none exists — position-bias or display-pipeline artifact),
never resolved by tool authority alone.

## Exit-criteria self-assessment

| Ledger exit criterion | Status |
|---|---|
| SD table committed to this ledger as a dated addendum | **MET** — Amendment 3 (all zeros, bit-level); raw JSON in `out/b2_metrics.json` + `gpu-review/setB/runs/manifests.json` |
| MDE table published alongside | **MET** — §B3 (all zeros; per-endpoint granularity floors listed as the operational MDE) |
| Judge passes its calibration set | **MET (carried)** — Set A's ladder + the maintainer's zero-wrong-call own-eye pass; Set B's judge session = the 8 expected-tie pairs above (a second null: a judge calling non-ties here is miscalibrated or the display pipeline differs) |
| Canary lowvram lines stable | **MET** — identical staging quartet on all 9 runs, all conditions; no attachment/load bug found (the pass-1 find was API-tooling, not loading — see Deviations) |

## Deviations, concerns, and notes

1. **The execution-cache deviation (material, documented in full above):**
   r2–r4 as originally submitted were cache copies, not renders —
   discarded; the cache-bust design replaced them. Side finding worth the
   ledger's attention: **on this engine, re-submitting an identical graph
   is a cache serve, not a re-render** — later sets' "replicate" cells and
   Set I's chain re-runs MUST vary a signature (the vae-alias/control
   levers are the proven-neutral toolkit) or they measure nothing. The
   `__setBalias` symlink in `/home/agent/models/vae/` is part of this
   toolkit and should stay (same inode as the recorded file; no new bytes,
   no registry question).
2. **Cold condition n=1** (slot consumed by the cache bug). The cold
   offset is still measured: r1's metrics are bit-equal to every warm run,
   so the cold-vs-warm offset is 0 like every other — n=1 costs nothing
   here, but it is recorded as executed.
3. **Conditions collapse toward one another on this stack:** the modern
   dynamic-VRAM staging re-prepares all four models on EVERY prompt
   (warm runs included) — the old cold/warm load-state distinction shows
   only in load+encode time (5–6 s vs 15 s) and r5's disk-streaming
   sampling phase, not in staging lines or outputs.
4. **Not sampled (honest caveats):** concurrent foreign GPU load DURING
   sampling (the box was quiet; the maintainer's 8188 running concurrently
   would flip residency decisions — a perturbation class r5's evidence
   covers, but untested directly); a mid-set server restart; multi-day
   thermal/driver states. The §1.1 environment-stop canary rule already
   covers these for the batch.
5. **plan-error deferred** to Set C (no plan on the canary board; null by
   construction).
6. **Zero-floor consequence for later sets (the gate recommendation, the
   maintainer's call):** with render noise measured at zero, replicate
   SAME-CELL renders add no information — the pre-registered 2-seed cells
   in Sets C/E/F could drop to 1 seed with the §1.1 fresh-material
   selection rule carrying all generalization (≈ −25–40% planned gens),
   OR replication stays as insurance against stack changes (driver/torch
   bumps, the 8188-concurrency case). Amendment 3 records the option; no
   design is changed unilaterally.
7. **GPU use:** 10.7 min total (9 renders ~63 s mean, 1 probe 21 s, 3
   cache no-ops); contention guard clean at every submit; final residency
   22679 MiB left for the controller's phasing.
