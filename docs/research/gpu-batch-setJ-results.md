# GPU batch — Set J results (the fresh-eyes pilots)

> Flux task: **THE GPU BATCH (ourbqum)** · branch `component-vocabulary` ·
> executor: Set J (single seed per Amendment 5). **STATUS: PAUSED MID-SET at the
> J1/J2 boundary (maintainer GPU directive, 2026-10-05 ~22:40) — J1 + the opening
> canary are complete and measured below; J2–J8 + the closing gates await the
> resume window.** The pause handover was verified clean (/free → SIGINT → exit;
> the GPU carried only the maintainer's own instance afterward). On resume: fresh
> canary first (controller ruling, ledger §1.2.4), then J2 in ledger order — the
> roster and driver are resume-safe (`test-results/experiments/gpu-batch-setJ/`).

## 0. The run so far in one paragraph

Scope per the controller's dispatch: **J1/J3/J4/J6/J7 full; J2 partial (MoGe
comparator + null; the Meridian pair still runs — the VGGT-Omega *geometry* is
the gated part, substituted and disclosed); J5 DEFERRED (CivitAI login-walled,
maintainer-staged); J8 partial (HyperFlow rung; UniLumos relight deferred —
gated:auto, no partial fetch possible).** Setup (Set D's lesson, executed):
16/16 staged files opened and header-verified before any generation; the three
J1 mechanism packs fetched and installed at pins (Fizgig-Tweaks `5f8b48a` MIT;
T8mars `5cb5008` GPL-3.0-or-later, fetch-consent flagged; Semantic Bridge
`0ec72f4` — code asserts NO permissive license, FLAGGED, adapter weights under
the H3 Community License, §5a family); HyperFlow pack `99778905` (Apache-2.0) +
the full-base converted build; Meridian's two Apache-2.0 helper nodes; MoGe-2
weights. The J2 conditioning warp was built offline (own-glue, ~120 lines):
MoGe-2 point maps + intrinsics → camera slide (0.12×Z_median) → z-buffer
4-tap splat — **identity warp 0.0% holes (the machinery null), slide warp
9–10% disocclusion**, exactly the grey-hole conditioning the Meridian prompt
describes. Two engineering findings are recorded in §5 (the inference_mode
VRAM leak; the normalized-intrinsics projection).

**Attestation so far: 18 generations ≈ 36.9 GPU-min** (c1 canary 78.7 s + 17
J1 cells at 66–145 s), all on the live 8189 testbed (restarted once mid-setup
to register the packs; PID 110533 at run time). `/free` posted at the pause;
teardown verified (VRAM to the maintainer's own instance only; zero orphans).
**Canary start: PASSED** — bit-identical to Set B r9 (frames + audio md5) with
all five packs installed: the zero floor holds across the new machinery.

## 1. J1 — the adherence bake-off (COMPLETE; verdicts PROPOSED, eye-gated)

**Design (ledger J1 verbatim):** FL2VA pruned int8, base-20 simple 12/3,
guidance 1 (the "guidance-1 stock, no mechanism" null), 39 f, seed 421337;
the Set C P2 (face) + P3 (ball) cells at **576p (1024×576, sanity) and 768p
(1344×768, the d98kth3-1b collapse rung)**. Mechanisms: **Fizgig Prompt
Strength** (attention text-V scaling; +0.5 main, +1.0 dose, −0.3 loosen),
**T8mars shift-aware gain** (single-condition gain, early 1.2→late 1.0 ramp;
1.2/1.2 dose, 0.9/0.9 loosen; clamp ±20%), **Semantic Bridge** (conditioning-
space MLP at encode, α=0.10; 0.25 dose; FL2VA T2V path per the pack's v1
scope — Ref2VA unsupported, disclosed). 17 cells.

**Engagement evidence (the Set P silent-no-op lesson, checked per arm):**
- **Semantic Bridge**: engine console line `[MiniMax H3 Semantic Bridge] Loaded
  adapter` on every SB cell — the bridge provably applies at encode time.
- **T8mars gain**: traced through engine source — at guidance 1 the cfg-1
  optimization hands the custom CFG function a **zero-filled uncond slot**
  (`calc_cond_batch` zero-initializes every cond position, `samplers.py:230`),
  so `uncond + (cond−uncond)·scale` collapses to `scale × velocity` — the gain
  provably fires at ~zero extra cost (also why the arm did NOT crash on the
  tensor-type check). [DOC-code]
- **Fizgig**: the pack prints nothing with `report=False`; engagement is
  established by **code-read** [DOC-code]: the model-type guard passed at run
  time (it raises on non-H3 models), the dispatcher installs on all 50 blocks,
  the prompt tweak's window is "all steps" and its attention swap engages at
  scale≠1 through the v0.37.4 `attention=` hook. **Residual risk disclosed:**
  a `report=True` duplicate (one 66 s gen) would settle it on the GPU — queued
  as an optional resume-phase diagnostic, per the controller's ruling.

**The measured readout (plan endpoint, P3 = "rests at the right quarter",
success band end [70, 80] % width):**

| Cell | plan RMSE %w | end x % | audio RMS dBFS | alternation |
|---|---|---|---|---|
| null @768p | 7.35 | 83.1 | −30.8 | 0.0231 |
| null @576p (sanity) | 6.85 | 81.3 | −25.6 | 0.0240 |
| SB α.10 @768p | 7.34 | 83.0 | −30.3 | 0.0250 |
| SB α.25 dose | **6.33** | 82.9 | −31.2 | 0.0248 |
| Fizgig +0.5 @768p | 6.97 | 85.0 | −37.8 | 0.0294 |
| Fizgig +1.0 dose | 7.57 | 86.0 | **−47.1** | 0.0183 |
| Fizgig −0.3 loosen (P2 cell) | — | — | −39.4* | 0.0304* |
| T8 1.2→1.0 @768p | 6.87 | 83.7 | −19.5 | 0.0354 |
| T8 1.2/1.2 dose | 6.65 | 83.2 | −12.2 | **0.2215** |
| (576p sanity rung: every arm within ±1% of the null — flat) | | | | |

\* loosen cell ran on the P2 board (its audio/alternation rows are the P2 cell's).

**Reads (all single-seed, Amendment 5; paired-by-construction):**
1. **PRIMARY — no mechanism rescues the collapse rung.** Every arm INCLUDING
   the null ends the ball at 81–86 % width: the 768p failure mode is endpoint
   OVERSHOOT past the band, present in the null and unmoved by any dial (deltas
   ≤7 % RMSE, no success flip, sanity rung flat). Under the ledger's
   pre-registered kill rule ("none beats null → the adherence race stays
   unbought"), **J1 proposes: the adherence race stays unbought** — the
   three-mechanism class (attention-V scaling, conditioning-space bridges,
   shift-aware gain) does not buy adherence at the weak rung on this board.
2. **The collapse is not what d98kth3-1b described at this prompt** — the
   model still tracks the plan (RMSE ~7 %w) but lands long. A different
   failure signature than "structure collapses above 576p"; recorded as a
   CORRECT-candidate for the packet (the endpoint-overshoot mode), pending the
   eye.
3. **Mechanism costs are real and characteristic:** Fizgig's dial MONOTONELY
   suppresses audio (−30.8 → −37.8 → −47.1 dBFS at 0.5/1.0 on P3; the loosen
   arm also quiet) — text-V scaling demonstrably reaches the audio tokens
   through H3's packed attention (the assessment's prediction, now MEASURED);
   at +1.0 the render is effectively silent. T8's constant-max dose
   destabilizes: alternation ×6.3 (0.035→0.221) and audio +11 dB hot; the
   ramped 1.2→1.0 form is artifact-clean but buys −6.5 % RMSE. Semantic Bridge
   is inert on artifacts and the largest single RMSE mover at dose (−14 %,
   exploratory only — no success flip).
4. **Blind pairs for the eye** (resume-phase surface): mechanism-vs-null at
   768p ×3, the dose pair, the loosen pair — the plan metric is one endpoint;
   fidelity/artifact calls belong to the maintainer per Amendment 7.

**Proposed menu verdicts (J1):** null doctrine **CONFIRM** (guidance-1 stock
stands at the weak rung); Fizgig prompt-strength **CORRECT** for the audio lane
(a prompt-adherence dial that quiets audio is a mixed tool at best; the
reaches-audio property is the finding); T8mars gain **CONFIRM-clean / NONE** at
this operating point (the ramped form is safe, buys nothing on adherence);
Semantic Bridge **ADJUST-watch** (inert at α=0.10, the α=0.25 dose hint needs
fresh material before any catalog row — and the code license stays FLAGGED).

## 2. J2 — Meridian partial (PENDING RESUME; design + staging complete)

Cells staged: **J2-null-1to1** (identity-warp refs, base-20, no LoRA — the
machinery null), **J2-moge-slide** (slide-warp refs, base-20, no LoRA — the
non-LoRA fallback candidate), **J2-meridian** (slide-warp refs + the
teacher/turbo pair UNMERGED @1.0 summed, the card's 3-NFE euler/simple point,
shift 3/3 — the INT8-at-24GB verdict) on the FULL fl2va int8 base (34 GB) at
1344×768×73 f with the frozen embed 73 + the bouldering clip. **Disclosed
deviation:** VGGT-Omega (gated:manual FAIR-NC, maintainer-staged) is replaced
by the MoGe warp for the conditioning — the Meridian adapters were trained on
VGGT warps, so the J2-meridian cell reads as "the pair on slightly
off-distribution conditioning"; the geometry metric (MoGe depth correlation
output-vs-warp + disocclusion-fill) is VGGT-free by design. The metric code is
staged and CPU-bounded (§5 precautions).

## 3. J3 — VOID removal (PENDING RESUME)

Graphs staged and live-validated: the official two-pass blueprint rebuilt from
primitives (pass1/pass2 30-step simple, cfg 6, 672×384×45 f, SAM3 video-tracked
person quadmask, RAFT warped noise) + the two H3 generative arms (reference-
video instruction edit; latent denoise-mask at 0.7 with the #15981 grid-artifact
check recorded) + the two no-edit regenerates + the driver-side untouched
passthrough (zero gens). Endpoint: PSNR/mean-abs-RGB OUTSIDE the removal region
vs the passthrough at each canvas (masks via one cheap engine SAM3 pass,
`j2_masks.py` staged).

## 4. J4/J6/J7/J8 (PENDING RESUME)

J4 (style propagate: Krea2 styled keyframe → FL2VA propagate vs unstyled null
+ Viggle repaint arm — driving clip wired at runtime), J6 (true-CFG 1.5/3.0
with empty-negative matched wiring vs guidance-1 null; the PMC-cap arm is
CONDITIONAL on frying), J7 (CADS annealing node vs null, keyframe-anchored 73 f,
drift endpoints), J8 (HyperFlow full-base build vs base-20 on the same FULL
int8 base, Set C board). All graphs live-validated pre-pause; the J4/J7
keyframes are extracted (setE ceiling f0s); the Viggle frozen embed + DMD LoRA
verified local.

## 5. Engineering findings + precautions (the pause-time record)

1. **MoGe offline inference leaks ~7 GiB VRAM per call WITHOUT
   `torch.inference_mode()`** (autograd retains the DINOv2 feature graph;
   measured: 7.3 GiB resident after one infer, 14.0 after two, OOM by chunk
   ~10 on the shared GPU). Under inference_mode the residency is a flat 650
   MiB. Any offline comfy-model scripting on this box must wrap inference in
   `inference_mode()` — the engine always does; standalone scripts must too.
2. **MoGe-2 intrinsics are NORMALIZED** (cx≈0.5): projection must scale by
   canvas pixels (`u·W`), not assume pixel-unit focal lengths. The identity
   roundtrip is the check (0.0% holes, mean abs err 0.005 on covered pixels).
3. **RAM precaution adopted (controller, 2026-10-05):** while the maintainer
   works on this box, CPU-side metric work runs serialized with one model
   resident at a time, <8 GB RSS steady (measured ~1.5 GB peak for the metrics
   battery). The J2 camera metric's MoGe passes over outputs defer to the
   resume window if they would exceed the bound.
4. **The T8mars cfg-1 zero-uncond mechanism** (§1 engagement) is worth a line
   in the drift-envelope context: any custom `sampler_cfg_function` on this
   engine sees a zeros uncond at guidance 1 — handy for gain-style patches,
   a silent trap for anything expecting a real empty-prompt prediction.

## 6. Deferred arms (recorded, never routed around)

| Arm | Gate | Record |
|---|---|---|
| J5 Anime-to-Realism | CivitAI login-walled | **DEFERRED-pending-asset**; sha `BCE58949…DE2A3E` recorded for post-download verification; registry §5i row stands |
| J2 VGGT-Omega geometry | gated:manual, Meta FAIR-NC v1 | **maintainer-staged**; the MoGe substitution is disclosed in every J2 verdict; the VGGT-conditioned rung re-opens when the maintainer stages it |
| J8 UniLumos relight | gated:auto | **DEFERRED** — no partial fetch possible without the gate (the fp8-umt5 substitution question rides the deferred arm) |

## 7. Verdict table (PROPOSED; the maintainer's blind calls are the decision layer)

| Pilot | Status | Verdict (menu) |
|---|---|---|
| J1 adherence bake-off | **COMPLETE** (17 cells) | **CONFIRM** the null doctrine — the race stays unbought; per-mechanism: Fizgig **CORRECT** (audio-suppression cost measured), T8 **CONFIRM**/NONE (clean, buys nothing), SB **ADJUST-watch** (dose hint; code license FLAGGED) |
| J2 Meridian partial | staged, awaiting GPU | — |
| J3 VOID | staged, awaiting GPU | — |
| J4 style propagate | staged, awaiting GPU | — |
| J5 | **DEFERRED-pending-asset** | — |
| J6 true-CFG | staged, awaiting GPU | — |
| J7 CADS | staged, awaiting GPU | — |
| J8 HyperFlow rung | staged, awaiting GPU | — |

*(The table completes as the resume window allows; every verdict above carries
its null having run — the set's exit criterion.)*
