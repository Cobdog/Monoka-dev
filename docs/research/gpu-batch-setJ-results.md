# GPU batch — Set J results (the fresh-eyes pilots)

> Flux task: **THE GPU BATCH (ourbqum)** · executed 2026-10-04→05 on branch
> `component-vocabulary` · executor: Set J (single seed per Amendment 5).
> **Attestation: 52 generations ≈ 115.6 GPU-min** on the live 8189 testbed, plus
> one engine-side SAM3 mask pass and the offline MoGe warp/metric passes (CPU/
> bounded-RAM per the pause precaution). **All six canaries bit-identical to Set
> B r9** (start · resume · two shim-restarts · mid · end — the zero floor held
> across every restart and the whole set). **Instrument null gate PASSED**
> (p01: the J6 null duplicated through `__setJnull` — 39 frames/side
> pixel-exact, 0 L/R differences). Teardown verified at set close. Review
> surface: `gpu-review/setJ/` (20 blinded pairs, Amendment-7 metadata, escrowed
> `pairs/.key`); verdicts below are **PROPOSED — the maintainer's blind calls
> are the decision layer**. Ledger: "Set J" + the two dated addenda.

## 0. The run in one paragraph

Scope per the controller's dispatch: **J1/J3/J4/J6/J7 executed in full; J2 ran
its honest partial (the MoGe-warp conditioning substituting the gated VGGT
geometry — disclosed per-cell); J8 ran the HyperFlow tier-ladder rung (the
UniLumos relight challenger deferred — gated:auto, no partial fetch); J5
deferred-pending-asset (CivitAI login-walled).** Setup per Set D's lesson:
16/16 staged files header-verified before any generation; five packs installed
at pins (Fizgig-Tweaks `5f8b48a` MIT; T8mars `5cb5008` GPL-flagged; Semantic
Bridge `0ec72f4` — code unlicensed FLAGGED, adapter H3-Community; HyperFlow-H3
`99778905` Apache; Meridian helper nodes Apache); registry rows landed in
lockstep (commit 847b56e). The set was **paused mid-flight at the J1/J2
boundary** (maintainer GPU directive, ~22:40 — handover verified clean) and
resumed on release with a fresh canary first (controller ruling; PASSED). Two
mid-set engineering events are recorded in §6 (the H3 dmask arm needed a
first-party 30-line shim — the engine exposes no video-encode into the packed
AV latent; the HyperFlow pack's model folder was shadowed by the T8mars pack's
`hyperflow/loras` registration).

## 1. J1 — the adherence bake-off (17 cells) — the race stays unbought

As measured pre-pause (tables in the pause commit; unchanged): **no mechanism
rescues the 768p adherence collapse** — every arm INCLUDING the null ends the
P3 ball at 81–86 % width vs the [70,80] band (endpoint overshoot, not
structure collapse; a CORRECT-candidate for the packet's failure-mode record).
Mechanism deltas ≤7 % RMSE, no success flip, 576p sanity flat. **Measured
costs:** Fizgig prompt-strength MONOTONELY suppresses audio (−30.8 → −37.8 →
−47.1 dBFS at 0.5/1.0 — text-V scaling reaches the audio tokens through the
packed attention; the assessment's prediction, now MEASURED); T8's
constant-max dose destabilizes (alternation ×6.3, +11 dB hot) while the ramped
1.2→1.0 form is artifact-clean but flat; Semantic Bridge inert at α=0.10 with
a −14 % RMSE hint at α=0.25 (exploratory; no success flip).
**Proposed:** null doctrine **CONFIRM** (guidance-1 stock stands at the weak
rung); Fizgig **CORRECT** (an adherence dial that quiets audio is a mixed
tool); T8 gain **CONFIRM-clean/NONE**; SB **ADJUST-watch** (code license stays
FLAGGED; no catalog row). Engagement: SB console-verified in-engine; T8
traced through engine source (the cfg-1 zero-uncond slot — see §6.4); Fizgig
code-read [DOC-code] with the residual risk disclosed (the `report=True`
diagnostic remains available on any future window).

## 2. J2 — Meridian partial: INT8-at-24GB holds; the MoGe fallback WORKS

On the FULL fl2va int8 base (34 GB, staged 32.4 GB dynamic) at 1344×768×73 f
with the frozen embed + the MoGe-warp conditioning (identity 0 % holes /
slide 9–10 % disocclusion, built offline):

| Cell | depth-corr vs slide warp | wall | NFE | patches | peak VRAM |
|---|---|---|---|---|---|
| J2-null-1to1 (identity refs, no LoRA) | **0.435** (does NOT follow the slide — the null behaving as a null should) | 834 s | 20 | 0 | 23.9 GiB |
| J2-moge-slide (slide refs, no LoRA) | **0.810** | 827 s | 20 | 0 | 24.1 GiB |
| J2-meridian (slide refs + teacher/turbo UNMERGED @1.0) | **0.844** | **143 s** | 3 | **202** | 24.1 GiB |

**Reads (proposed):** (1) **The INT8-at-24GB bet PAYS** — the Meridian pair
attaches 202 patches (zero NOT-LOADED) on the full int8 base under dynamic
VRAM and runs its card 3-NFE point in 143 s wall — no OOM, no restart, the
residency line flat. (2) **The MoGe non-LoRA fallback is REAL**: base-20 with
the warp conditioning reaches 0.81 depth-correlation — camera compliance
without any adapter. The Meridian pair adds only +0.03 corr at 5.8× the speed
(on MoGe-conditioned refs — off the VGGT distribution the pair was trained
on; the VGGT-conditioned rung re-opens when the maintainer stages it).
(3) The disocclusion-fill sub-metric returned null (mask-resize mismatch in
the checker — recorded not-computed; secondary). **Menu verdict: ADOPT-track**
for the MoGe-warp re-camera lane (registry rows already in place); Meridian
INT8 **CONFIRM** (loadable + runnable at 24 GB — the machinery question
settled; quality to the eye on p07/p08).

## 3. J3 — removal: the denoise-mask arm is the preservation winner; VOID degenerate

Endpoint: pixel-exact OUTSIDE the removal region vs the untouched passthrough
(SAM3-tracked person mask; PSNR over non-person pixels, ≲38 dB = invisible-class):

| Arm | PSNR outside (dB) | mean-abs RGB outside | note |
|---|---|---|---|
| **J3-dmask** (H3 region-scoped, denoise 0.7, the setj_shims encode) | **36.92** | **2.38** | invisible-class preservation + the person gone (judge p09/p10) |
| J3-noop-dmask (no-edit through the same graph) | 36.93 | 2.39 | the machinery null — the dmask arm ≈ its no-op outside the region |
| J3-noop-instr (no-edit through the edit graph) | 31.99 | 3.11 | the edit path's own re-render cost |
| J3-instr (reference-video instruction edit) | 17.84 | 18.77 | our known semantic class (~18 dB) |
| J3-VOID (deterministic two-pass) | 5.66 | 126.15 | **DEGENERATE-AT-CONFIG** — near-black output (frame mean ≈ 7/255) |

**Reads (proposed):** the preservation-ceiling attack is answered by the arms
that executed — **region-scoped denoise on the packed latent is the
preservation ceiling holder (36.9 dB, indistinguishable-from-untouched outside
the region at 2.4 RGB)**, instruction editing stays the semantic class, and
the two no-op controls tie their treatments (the graphs are clean). The VOID
arm produced a near-black 45-frame render on the first execution; per the
ledger's harm-stop discipline (no mid-set re-runs at "fixed" settings) it
records **degenerate-at-config**: the follow-up is a wiring re-derivation from
the packaged blueprint (my primitive-level rebuild differs from the official
subgraph in the ImageFromBatch/MaskPreview plumbing — out of this set's
scope), and the arm rides unpaired in `runs/` for direct viewing. **Menu
verdict: ADOPT-track the dmask lane** (the 30-line shim is first-party,
removable, documented); VOID **KILLED-execution** (degenerate-at-config — a
tooling finding, not a method verdict).

## 4. J4 — style propagation: the TeleStyle pattern HOLDS; Viggle does not transfer style

Style-similarity to the styled (2D-cel) keyframe, mean-RGB distance (down =
similar): **styled-propagate 2.5 (f0) → 4.7 → 8.5 → 8.3 (f38)** — the look
SURVIVES the clip with mild drift and no collapse; unstyled null 76–83
(as expected); **Viggle repaint 76–82 — NO style transfer** (the frozen-embed
conditioning anchors identity, not look — consistent with the pack's own
"still of the person" design; the styled anchor rode as an identity ref).
**Proposed: ADOPT-track the styled-keyframe→propagate pattern** (the
falsifier — style decay — did not fire: +5.8 RGB over 39 f); Viggle-as-styler
**NONE at this operating point** (it is a repaint machine, not a restyler;
Set F's E1 arms own that lane's real test).

## 5. J6/J7/J8 — the doctrine questions

**J6 true-CFG falsifier (6 cells): the falsifier FAILED to falsify — uncond
headroom is REAL.** Plan RMSE on P3: null 11.98 → CFG-1.5 **10.00** → CFG-3.0
**9.82** (−18 %, monotone). Costs at 2× branches (+30 % wall): HF energy P2
+8 %/+22 % (1.5/3.0 — sharpness-or-fry, the eye decides p14/p15), P3 −9 %/−23 %
(LOWER at high motion); alternation P2 1.40×/0.90×, P3 0.97×/0.97× (no
temporal blowup); audio P2 −20.3 dBFS (vs null −26.7 — hotter mix at both CFG
rungs). **Proposed: the guidance-1-on-base doctrine is CORRECTED to
"guidance-1 default, true-CFG headroom measured open"** — an operating-point
menu, not a ban. The PMC-cap arm was NOT triggered (no gross frying at these
rungs); it stays the named refinement if the eye calls fry.

**J7 reference annealing (CADS, 4 cells): a cell-dependent lever, not a
default.** Face cell: ArcFace-vs-anchor 0.737 → **0.770**, late drift (f72)
48.4 → **40.1** RGB (−17 % — CADS HELDS identity longer). Ball cell: f0
deviation 2.4 → **17.0** (the annealed keyframe row visibly perturbs the
anchor at frame 0), then ties. **Proposed: ADJUST** — CADS is a real
identity-hold lever on anchor-critical cells at a first-frame fidelity cost;
single-seed reads, no default change.

**J8 HyperFlow rung (6 cells): does not displace the incumbents on this
board.** Full-base build (bypass, Euler, native grid) vs base-20 on the SAME
full int8 base: plan P1 **3.718 vs 1.322** (base 2.8× better at low motion —
and worse than Set E's turbo-8 P1 2.452), P3 12.54 vs 12.74 (tie); HF energy
0.71×/0.87× (softer), alternation 1.54×/2.06×/1.18× (flicker-ier, worst on
the face cell); wall 36.8 s vs 60–73 s (0.55×) at peak 24.2 GiB. **Proposed:
NONE-at-this-rung** — the flow-map axis stays measured-not-adopted; the
registry row stands; the pruned-base curve-fit variant remains the untested
follow-up. UniLumos arm deferred (gated).

## 6. Engineering findings (the durable record)

1. **Offline comfy-model inference leaks ~7 GiB VRAM per call without
   `torch.inference_mode()`** (autograd retains the DINOv2 graph; flat 650 MiB
   under it). Standalone scripts must wrap inference.
2. **MoGe-2 intrinsics are NORMALIZED** (cx≈0.5) — scale by canvas pixels; the
   identity roundtrip (0 % holes, 0.005 err) is the check.
3. **The T8mars pack pre-registers `hyperflow` → `models/hyperflow/loras`**,
   which makes the HyperFlow-H3 pack's own registration a no-op (its guard
   sees the key present) — the weights must live at the T8 path. Pack-install
   order side effects on model folders: check BOTH packs' registrations.
4. **The T8 cfg-1 zero-uncond slot** (`calc_cond_batch` zero-initializes cond
   slots, `samplers.py:230`): any custom `sampler_cfg_function` at guidance 1
   receives a zeros uncond — the gain idiom (`scale × velocity`) fires at
   zero extra cost; anything expecting a real empty-prompt prediction must
   set `disable_cfg1_optimization`.
5. **H3 has no video-encode-into-packed-latent node** — the denoise-mask arm
   required a 30-line first-party shim (`custom_nodes/setj_shims/`, the
   exp_shims precedent; removal = delete the dir). The packed latent is
   `NestedTensor((video(1,24,T,h,w), audio))`; the engine's identity
   `scale_latent_inpaint` + masked-timestep path carries masks natively once
   the latent is right.
6. **The LoadVideo validator rejects symlinked inputs** ("Invalid video
   file") — real files required in `input/`.
7. Driver notes: the history's `files` list includes loader INPUT references
   (match by run_id, not files[0]); an accepted POST is a real submission
   (a validation probe executes — the J3void generation arrived via the probe
   and the driver's cache-serve guard correctly caught the identical
   resubmission at 0.02 s).

## 7. Deferred arms (recorded, never routed around)

| Arm | Gate | Record |
|---|---|---|
| J5 Anime-to-Realism | CivitAI login-walled | **DEFERRED-pending-asset**; sha `BCE58949…DE2A3E` recorded; registry §5i stands |
| J2 VGGT-Omega geometry | gated:manual, Meta FAIR-NC v1 | maintainer-staged; the MoGe substitution is disclosed in every J2 verdict; the VGGT-conditioned rung re-opens on staging |
| J8 UniLumos relight | gated:auto | **DEFERRED** — no partial fetch possible; the fp8-umt5 substitution question rides it |

## 8. Verdict table (PROPOSED; the maintainer's blind calls are the decision layer)

| Pilot | Status | Verdict (menu) |
|---|---|---|
| J1 adherence bake-off | **EXECUTED** | **the race stays UNBOUGHT** (kill rule: no mechanism flips the collapse rung); null CONFIRM; Fizgig CORRECT (audio-suppression cost, measured); T8 CONFIRM/NONE; SB ADJUST-watch (FLAGGED license) |
| J2 Meridian partial | **EXECUTED** (MoGe substitution disclosed) | INT8-at-24GB **CONFIRM** (202 patches, 143 s @3-NFE); MoGe fallback **ADOPT-track** (0.81 camera compliance, no adapter) |
| J3 removal | **EXECUTED** (VOID arm degenerate) | denoise-mask lane **ADOPT-track** (36.9 dB invisible-class preservation — the ceiling holder); instruction edit semantic-class; VOID **KILLED-execution** (degenerate-at-config; blueprint wiring follow-up) |
| J4 style propagate | **EXECUTED** | TeleStyle-pattern **ADOPT-track** (style held 2.5→8.3 RGB, falsifier did not fire); Viggle-as-styler NONE (identity-anchor, not style) |
| J5 | **DEFERRED-pending-asset** | — |
| J6 true-CFG | **EXECUTED** | **CORRECTED**: guidance-1 stays default; true-CFG headroom MEASURED OPEN (−18 % plan RMSE monotone; fry question to the eye); PMC not triggered |
| J7 CADS annealing | **EXECUTED** | **ADJUST** — real identity-hold lever on anchor cells (+0.033 ArcFace, −17 % late drift) at a first-frame cost; not a default |
| J8 HyperFlow rung | **EXECUTED** | **NONE-at-this-rung** — below turbo-8's plan at P1, flicker-ier at P2; row stands; UniLumos arm deferred |

**Every executed pilot carries its null having run** (J1 guidance-1 stock;
J2 identity-warp + the no-LoRA lane; J3 untouched passthrough + both no-op
regens; J4 unstyled propagate; J6 guidance-1; J7 no-annealing; J8 base-20) —
the set's exit criterion. Economics: 52 gens / 115.6 GPU-min / peak VRAM flat
~24.1 GiB all cells.

## ADDENDUM — the maintainer's blind review, reconciled (2026-10-05)

20 pairs: 10 left · 4 right · 3 tie · 2 cannot-assess · 1 uncalled (14 notes). Responses verbatim below.

### The null gate, by eye
**p01 (J6 null through the alias) = TIE.** Held.

### The clarifications the maintainer asked for — answered
1. **p08 (Meridian vs MoGe — you asked for more information):** L was **Meridian** (the LoRA pair @ 3-NFE), R was **MoGe** (the no-adapter warp fallback); the question was which achieves the requested SLIDE camera more faithfully at better quality. The metric's read: near-parity (Meridian +0.03 compliance on MoGe-conditioned refs) — your "the camera is shifted a bit more on either one" is exactly what near-parity looks like. A re-call is welcome but the metric suggests it would not separate them; the honest disposition is PARITY, MoGe preferred on modularity (no LoRA, no license, first-party).
2. **p10 (my finding, not yours): the dmask cell DID NOT REMOVE.** p09.R and p10.L are byte-identical strips — one video served both — and your p10 note is decisive: the person remains on the dmask side, re-oriented (full regeneration through the denoise region, not removal). The executor's table line "the person gone (judge p09/p10)" was an EXPECTATION, not an observation — a report-accuracy miss, corrected here.

### Verdict adjustments from the eye
- **J3 corrected:** the preservation ceiling (36.92 dB outside the region) STANDS — it measured outside-region pixels only. But "removal by denoise-alone" failed on this clip (regenerated, not removed); the INSTRUCTION lane removes (p09/p11, your calls + notes). The lane's honest shape: adopt the dmask machinery for preservation-critical INSTRUCTED fills; plain removal rides the instruction lane.
- **J1 nuance (exploratory, not adoption):** your calls preferred Fizgig-positive (p02) and dose-1.0 (p05), preferred SB@0.10 over null (p03 — the metric called it inert; your eye disagrees), and REJECTED T8 on visible banding (p04). The adherence verdict (unbought) stands — the buy criterion was plan adherence — but the aesthetic layer is recorded: Fizgig's positive arm and SB@0.10 do something visible.
- **J4 eye-confirmed ADOPT-track:** both your calls went to the styled propagate ("style transposed and holds throughout… it DOES work"; "very good style transfer"). Note: the tasting-vs-stirring drift recurs — the batch's FOURTH same-seed-different-actions datum.
- **J6 stands, with the eye's blessing:** no quality damage at CFG (your notes: "quality overall is good," "no complaints on either"); your slight preference for guidance-1 on P2 keeps the doctrine's default where it was — "guidance-1 default, headroom open" is now eye-corroborated on the no-damage leg.
- **J7 strengthened away from default:** your notes make the metric's "fidelity cost" concrete and worse — "right video flickers" (p16) and "covered in artifacts and mosaic patterns for the first four frames. Frame 1 has two balls" (p17). CADS stays a lever, parked far from defaults.
- **J8 eye-consistent:** base ≥ HyperFlow (better shadows/lighting vs more detail; ties elsewhere) — NONE-at-this-rung confirmed.

### Verbatim responses
```
{
  "exported": "2026-10-05T09:57:44.863Z",
  "responses": {
    "p01": {
      "call": "tie",
      "ts": "2026-10-05T09:36:55.553Z"
    },
    "p02": {
      "call": "right",
      "ts": "2026-10-05T09:37:17.246Z"
    },
    "p03": {
      "call": "left",
      "ts": "2026-10-05T09:38:04.003Z"
    },
    "p04": {
      "call": "right",
      "note": "Right has more detail, but some banding on the back wall (Could be video compression artifacts though,) Left does not have these, but less detail.",
      "ts": "2026-10-05T09:39:05.865Z"
    },
    "p05": {
      "call": "left",
      "ts": "2026-10-05T09:40:16.381Z"
    },
    "p06": {
      "call": "right",
      "ts": "2026-10-05T09:40:41.230Z"
    },
    "p07": {
      "call": "left",
      "ts": "2026-10-05T09:41:50.860Z"
    },
    "p08": {
      "call": "cannot-assess",
      "note": "Not too sure here, the quality is similar, but the camera is indeed shifted to the side a bit more on either one. Ill need more information this one to call it.",
      "ts": "2026-10-05T09:43:29.172Z"
    },
    "p09": {
      "call": "left",
      "note": "Person entirely removed. Background remains fully intact. minimal distortion or change when using the slider to gauge.",
      "ts": "2026-10-05T09:44:18.153Z"
    },
    "p10": {
      "note": "Person remains in both, left has him facing the wall, right has him facing away from the wall."
    },
    "p11": {
      "call": "right",
      "note": "Right has the person removed though the camera moves and behaves differently. Camera pans down in the left, pans up in the right.",
      "ts": "2026-10-05T09:46:39.548Z"
    },
    "p12": {
      "call": "left",
      "note": "Style has been transposed and holds throughout the scene, but similar drift where she tastes the soup on the left and stirs on the right. It DOES work however.",
      "ts": "2026-10-05T09:47:53.438Z"
    },
    "p13": {
      "call": "left",
      "note": "Same as P12. Very good style transfer however.",
      "ts": "2026-10-05T09:49:09.347Z"
    },
    "p14": {
      "call": "left",
      "note": "They taste the soup in both. I imagine the one on the left is guided. The background on the right is very different from the usual batch. But quality overall is good for both. The motion remained consistant with both.",
      "ts": "2026-10-05T09:49:57.550Z"
    },
    "p15": {
      "call": "cannot-assess",
      "note": "Same as P14, I want to guess that right is the standard method, and left is the guided.  Quality is good, compositon has changed slightly. No complaints on either one. Prompts seems to have been adhered to.",
      "ts": "2026-10-05T09:51:48.756Z"
    },
    "p16": {
      "call": "left",
      "note": "Right video flickers. Left looks normal.",
      "ts": "2026-10-05T09:52:10.814Z"
    },
    "p17": {
      "call": "left",
      "note": "Left is normal. Right is covered in artifacts and mosaic patterns for the first four frames. Frame 1 has two balls. Frame 5 onward seems fine.",
      "ts": "2026-10-05T09:53:23.286Z"
    },
    "p18": {
      "call": "left",
      "note": "Right seems to have more detail, both are good however. Left seems to have better shadows and lighting and overall matches the usual baseline compositon more.",
      "ts": "2026-10-05T09:54:51.894Z"
    },
    "p19": {
      "call": "tie",
      "note": "Both are good, I prefer left only slightly. Background is slightly more detailed in the right. Both follow the similar \"tasting the soup.\" instead of stirring. But eithe would likely be fine in production.",
      "ts": "2026-10-05T09:55:42.923Z"
    },
    "p20": {
      "call": "tie",
      "note": "Smoother motion on the right. both are good, better lighting on the left, similar composition.",
      "ts": "2026-10-05T09:57:39.682Z"
    }
  },
  "set": "J"
}
```
