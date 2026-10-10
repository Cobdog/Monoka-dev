# TDE results — the TypedDecision caption-verifier eval (imajev-4b on CPU, 2026-10-10)

> The registered eval for the caption-verifier pipeline
> ([typed-decision-assessment.md](typed-decision-assessment.md) §3; ledger
> "THE TDE REGISTERED"). **CPU-ONLY by hard constraint** (the maintainer's
> card was in use): plain python-transformers inference, no GPU of any kind,
> no contact with the maintainer's llama.cpp router. Scripts:
> `test-results/experiments/tde/scripts/` (tracked); raw outputs on disk in
> `test-results/experiments/tde/out/`. Flux: TDE (7tn1tvp).

## 0. What ran, and the three deviations (stated first)

| Arm | Status | One line |
| --- | --- | --- |
| TDE-1 judge calibration | **RAN** (14/14 questions) | imajev-4b discriminates the ladder's structural/identity corruptions (AUC 0.82 overall) but is **blind to +2 L\* photometric drift** and below its own floor on single-frame temporal events — probabilities usable only for the classes it can see |
| TDE-2 caption verification | **RAN** (60/60 + a 12-question corrected re-run) | all four one-fact corruption classes separate (per-class AUC 0.89–1.00, pooled 0.96, zero-false-accept point at t=0.5); abstention 12/12 on unanswerable facts; one instrument bug (spatial label sign) caught by the probe, fixed, re-run — disclosed §4.3 |
| TDE-3 dataset triage | **DEFERRED** | no hand-labels or honest derived ground truth exists for a real slice of the datasets pipeline; producing them needs human/vision labeling this CPU-only executor run cannot do honestly — fabricating labels is forbidden by the registration |

Deviations from the registration, all disclosed:

1. **"Qwen3.5-4B int8 from HF" became the official bf16 checkpoint + local
   torch dynamic int8.** The pack's README names the artifact the
   registration meant (`nomadoor/Qwen3.5` → `qwen3.5_4b_int8_convrot.safetensors`,
   5.76 GB) — a Comfy single-file convrot text-encoder build that only loads
   through the ComfyUI runtime. The eval runs the official torch serving path
   (the one the shipped benchmarks were measured on), which needs the HF repo
   layout; third-party int8 forks risk breaking the adapter/readout binding
   and the calibration the eval is supposed to measure. So: fetch the pinned
   official checkpoint (fp32 merge of the LoRA, exactly as upstream's
   `merge_adapter` specifies) then weight-only int8 on the language model's
   Linears (`torch.ao.quantization.quantize_dynamic`). Vision tower, final
   norm and the decision readout stay fp32.
2. **TDE-1's c1 rung (H3 video-VAE re-encode) deferred** — its construction is
   GPU-bound (the 8189 lane); a CPU VAE encode of 124 frames is out of the
   eval's budget. The ladder's other five corruptions (c2–c6) regenerated
   bit-faithfully from the tranche1 source clip via setA's own construction
   code, imported (not re-ported): the c5 donor crop reproduced setA's donor
   exactly (box (1375,2404,1474,2500), cos-to-clean 0.021, 124/124 frames).
3. **Cross-implementation drift caveat (the drift doctrine):** shipped numbers
   were measured on bf16 torch (H100 pod) / MLX; this eval is CPU int8. Within
   the eval every comparison is internally consistent (one model instance, one
   process, same batching). Cross-references to the model card's absolute
   scores carry this caveat. Within-eval determinism was verified: a mid-run
   crash forced a re-run of 10 of the 14 TDE-1 questions and every value
   reproduced bit-identically.

## 1. The instrument

**Model path (the official one, not a re-implementation).** The fetched
`mohit67890/imajev` repo (Apache-2.0) ships the canonical torch decision path;
the eval imports its scoring/calibration modules verbatim
(`vision_decision.scoring`, `vision_decision.calibration`) and reproduces its
`serving configuration` per RELEASE-SPEC.md: direct option scoring, **4 cyclic
rotations averaged**, shipped calibration applied, single pass, no reasoning
tokens. The readout is the trained 256-code `decision_readout.safetensors`,
tokenizer-bound (binding verified at load). Calibration =
`calibration-rot4-modality.json` (schema 1.2, version
`p3-r2-s000291-authored+photo-only-v1`): single temperature 1.305 general /
**1.028 photo-only** (images present, empty state — the regime every TDE
question runs in), no unknown offsets.

Per noul question the runner reports: calibrated `P(true)`, `P(unknown)`,
abstention (argmax of the rotation-averaged raw logits lands on the unknown
code), per-rotation winners, and the rotation agreement.

**Call budget.** 113 s wall per two-image ladder question, ~29 s mean per
single-image scene question (20-core CPU, int8): 14 + 60 + 12 (the §4.3
re-run) + 4 (probe) + 3 (text-only smoke) = 91 questions, ~1.6 h productive
compute — inside the registration's "dozens of calls" budget.

## 2. TDE-1 — judge calibration vs the corruption ladder

Pre-registration held: `out/tde1_expected_key.json` written from the
corruption definitions before any judge call; construction checks assert the
physics (c2 mean ΔL\* = **1.994** on the +2.0 construction; c3 swap verified
array-equal; c4 blend mean-abs 28.26 at the 50 % site; c6 HF ratio 0.208
pre-codec; c5 donor identical to setA's).

| Question | Rung / site | Truth | P(true) | P(unk) | Call | Correct | Pre-registered expectation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| clean_ident_00 | identical pair | T | **0.836** | 0.03 | true | ✓ | easy |
| clean_ident_30 | motion pair | F | 0.411 | 0.06 | false | ✓ | easy-medium |
| c2_bright_fwd | +2 L\* | T | **0.058** | 0.14 | false | **✗** | medium — MISSED, direction inverted |
| c2_bright_rev | order probe | F | 0.190 | 0.19 | false | ✓ | order probe |
| c3_ident_61 | 1-frame jitter | F | 0.525 | 0.09 | true | **✗** | **below floor (pre-registered)** |
| c3_ident_ctrl | identical pair | T | 0.685 | 0.04 | true | ✓ | easy |
| c4_blend_70 | 50 % double exposure | T | **0.811** | 0.05 | true | ✓ | easy |
| c4_blend_65 | 19 % double exposure | T | 0.562 | 0.18 | true | ✓ | medium-hard (weaker site, weaker answer) |
| c4_blend_ctrl | two clean moments | F | 0.328 | 0.26 | false | ✓ | medium |
| c5_person_00 | identity swap | F | 0.177 | **0.631** | **abstain** | ✗/honest | easy-medium — caught as NOT-same-person |
| c5_person_60 | identity swap | F | 0.270 | 0.18 | false | ✓ | second site |
| c5_person_ctrl | same person | T | **0.904** | 0.06 | true | ✓ | easy |
| c6_soft_fwd | ½ resolution | T | 0.395 | 0.38 | true | ✓(weak) | easy — direction right, confidence low |
| c6_soft_rev | order probe | F | 0.345 | 0.27 | false | ✓ | order probe |

**Aggregate:** 11/14 correct calls, 1 abstention, rank AUC (TRUE vs FALSE
claims) **0.816** over 49 pairs, separation gap 0.29 (mean P(true) 0.607 on
TRUE claims vs 0.321 on FALSE).

**Calibration read (n=14, coarse by design):** bucketed predicted-vs-realized
is monotone at the extremes and noisy in the middle — [0.7,1.0): predicted
0.85, realized 1.0 (n=3); [0.5,0.7): 0.59 vs 0.67 (n=3); [0.3,0.5): 0.37 vs
0.25 (n=4); [0.0,0.3): 0.17 vs 0.25 (n=4). The judge is **underconfident when
right** and the middle band is not trustworthy at this n — consistent with
the calibration-transfer risk the assessment pre-registered (their
photo-only temperature was fitted on their distribution; our classes are
anime/walkthrough frames).

**What the ladder says the judge is and is not:**

- **Sees:** double exposures (0.811/0.562 vs control 0.328, monotone in blend
  strength — the site gradient reads through), identity swaps (0.904 control
  vs 0.177/0.270 corrupted — the widest margin on the ladder, mirroring
  setA's ArcFace endpoint being the cleanest discriminator), identical-vs-
  different frame pairs (0.836/0.685 vs 0.411).
- **Cannot see:** +2 L\* uniform brightness drift — answered 0.058 the *wrong
  way* (asserts "not brighter" about a +2 L\* frame while rot-agreement was
  1.00, i.e. consistently wrong, not noisy). Single-frame temporal reversal —
  0.525, a coin flip, exactly the pre-registered below-floor call (the delta
  is one frame of natural motion, within-video PSNR 17–18 dB per setA).
- **Sees weakly:** ½-resolution softening — right direction both ways but
  P(true) 0.395 with P(unk) 0.38 (high uncertainty, low conviction).
- **Abstention fired once, correctly:** on the hardest identity item the
  unknown mass hit 0.631 and the engine abstained rather than guess. n=1 — a
  signal, not a rate.

**TDE-1 verdict (the gate the other arms inherit):** the probabilities are
usable *per class* — structural/identity facts yes, photometric-subtle and
temporal-micro facts no. Anything downstream must gate on the corruption
class, not on a blanket "the judge is calibrated."

## 3. TDE-2 — caption verification on controlled scenes (design)

Six deterministic scenes (PIL, 512×512, unique shapes × unique palette colors
on a 3×3 grid; renderer determinism asserted at prep; specs =
`out/tde2_scenes.json`). Ground truth **by construction** — the spec is the
truth; no eyes, no hand-labeling, nothing fabricated. Per scene: 4 honest
atomic facts (existence / color / count / spatial relation), the same four
facts with **one slot corrupted** (invented object / color swap / miscount /
broken relation — each differs from its honest pair by a single token), and 2
unanswerable facts (physical weight / metric size in cm / draw order —
rotated 2-of-3 per scene) that must ABSTAIN. 60 questions, one image each,
photo-only calibration regime, 4 rotations.

Pre-registered risk carried from upstream: imajev-4b's own RELEASE-SPEC
discloses its unknown-gold gate **FAILED 11/14** (answered instead of
abstained; owner override) — the abstention arm may show the same and is
measured, not assumed.

## 4. TDE-2 — results

All 60 questions ran (mean ~29 s each; the twelve spatial questions twice —
see §4.3). Full tables in `out/tde2_summary.json`; every row carries
calibrated P(true), P(unknown), abstention and rotation agreement (mean
0.82 — the debias rotations agree on four of five questions).

### 4.1 Per-class separation (the falsifiable core)

| Corruption class | Honest mean P(true) | Corrupted mean P(true) | Gap | AUC (n=6 pairs) | Read |
| --- | --- | --- | --- | --- | --- |
| invented_object | 0.765 | 0.058 | **0.708** | **1.000** | perfect — an absent shape is always caught |
| color_swap | 0.799 | 0.059 | **0.739** | **1.000** | perfect — a wrong color is always caught |
| miscount (n±1) | 0.606 | 0.330 | 0.276 | 0.889 | separated, underconfident; one crossover at n=5 objects (scene_33) |
| broken_relation | 0.480 | 0.086 | 0.394 | **0.917** | separated; the weakest honest mean (the judge is half-sure on true relations; one scene both-rejected) |
| **pooled (24 pairs)** | **0.662** | **0.133** | **0.529** | **0.960** | — |

ROC (accept a claim when P(true) ≥ t, pooled): t=0.4 → TPR 0.875 / FPR
0.083; **t=0.5 → TPR 0.792 / FPR 0.000** (a zero-false-accept operating
point exists); t=0.6 → 0.708 / 0.000; t=0.3 → 0.917 / 0.208.

### 4.2 The abstention arm — PASSED, against the upstream risk

**12/12 unanswerable facts ABSTAINED.** Mean P(unknown) 0.561 on
unanswerable vs 0.117 on verifiable facts; zero confident guesses in either
direction. This is the arm the upstream RELEASE-SPEC itself flags as the
model's weak surface (their own unknown-gold gate: 11/14 answered-instead-
of-abstained, owner-overridden) — on OUR unanswerable classes (physical
weight, metric size, draw order — properties no image can decide) the
trained can't-tell fires cleanly. n=12, unanimous; the pre-registered risk
did not materialize on this distribution.

### 4.3 Instrument bug caught, corrected, re-run (recorded in full)

The first spatial pass read as a **systematic inversion** (AUC 0.083 — the
judge scored "A left of B" claims above "A right of B" regardless of
truth). A post-hoc four-question probe on scene_55
(`out/tde2_spatial_probe.log`) falsified the obvious "the judge's frame of
reference is flipped" reading and exposed the real cause: **the scene
generator's relation sign was inverted — the instrument was wrong, the
judge was right.** (Probe: "red square right of blue star" 0.022 and "blue
star left of red square" 0.021 — both correctly rejected; the square at
grid column 1 IS left of the star at column 2.) The relation logic was
fixed (viewer-relative: A left of B iff A's column < B's column — now
verified against the scene specs by inspection), the twelve spatial
questions re-run under corrected labels, and the other 48 rows are
untouched (their logic had no directional term; the miscount crossover and
all class means are unchanged). Disclosure: the re-run's statement texts
are the same twelve sentences with corrected honest/corrupted pairing, and
their scores were known to the evaluator before the re-run — the analysis
is mechanical (no pairing or threshold discretion), so the exposure is to
interpretation bias only. The bug and its catch are themselves a result:
the eval harness's falsifier worked on its own instrument, which is the
discipline the whole TDE exists to test.

### 4.4 Calibration

Bucketed over the 48 verifiable items: predicted 0.056 → realized 0.053
(n=19), 0.323 → 0.333 (n=6), 0.483 → 0.667 (n=6), 0.729 → 1.000 (n=11),
0.863 → 1.000 (n=6). Pooled ECE 0.105. The shape: **underconfident when
right** (the top two buckets never contain a false claim), **decisive in
the safe direction** (corrupted claims sit at mean 0.13). For a verifier
this is the good failure direction — an underconfident judge flags honest
facts for review; it does not silently pass corrupted ones. The shipped
photo-only temperature (1.028, fitted on their distribution) transfers
imperfectly (the 0.73→1.00 and 0.48→0.67 gaps); a one-scalar domain
recalibration is cheap if the lane is adopted, and the harness to fit it
now exists.

## 5. The honest verdict

**The hypothesis — verification is easier than generation — is SUPPORTED on
the measured distribution, and the support is bounded exactly where the
assessment said the risk lives.**

What is measured true:

1. A 4B judge separates **every** one-fact corruption class on controlled
   scenes (AUC 1.0 / 1.0 / 0.89 / 0.92, pooled 0.96), with a zero-false-
   accept operating point (t=0.5: 79 % honest accepted, 0 % corrupted).
2. The abstention contract holds on our unanswerable classes (12/12, zero
   confident guesses) — against the upstream-disclosed weak surface.
3. TDE-1's ladder independently confirms the class structure: identity and
   structural corruptions separate hard (0.90 vs 0.18–0.27; 0.81 vs 0.33).

What bounds it (carried visibly, per the assessment §4):

1. **The 4B-verifying-a-bigger-captioner risk is UNMEASURED.** The
   corruptions here are mechanical one-token edits authored from the spec;
   a fluent confabulation from an N-B captioner is a different adversary
   (plausible, self-consistent, styled). The eval's scenes are also
   synthetic geometric renders — in-domain for neither the judge nor our
   anime/video corpus. The next round, if the lane is adopted, must feed
   facts extracted from a REAL captioner's output on REAL corpus frames and
   let the captioner's own errors be the corruptions — that round needs the
   engine/router lane and is a maintainer call, not a CPU follow-up.
2. **The judge's blind classes are known and must gate the pipeline.**
   +2 L\* photometric drift is invisible (TDE-1: 0.058 the wrong way);
   single-frame temporal events are below its floor (0.525, coin flip —
   pre-registered); resolution softening is direction-right but
   low-conviction. A caption fact about subtle tone, flicker, or sharpness
   must NOT route through this verifier as-is.
3. **Calibration transfers imperfectly** (underconfident at the top,
   ECE 0.105 on the working classes' items) — fixable with one scalar; the
   CPU-int8 arithmetic is a further drift layer (determinism within the
   eval verified; absolutes vs the model card carry the caveat).
4. Small n: six pairs per class, one scene generator, fourteen ladder
   questions. The directions are unanimous or near-unanimous, but the
   margins are first measurements, not settled numbers.

Lane consequence (proposed, for the spec round the assessment already
frames): the typed-decision verifier is a REAL primitive for the fact
classes {existence, color, count, object identity, spatial relation} —
gate per class, recalibrate one scalar on-domain, keep the abstention
seam, and stage the real-captioner adversarial round before anything
bakes captions into the datasets lane or locks a `.char` description on
verified facts alone. TDE-3 (triage vs hand-labels) stays open pending a
labeled slice.

## 6. Cost profile (the TDE-3 deferral's honest remainder)

Measured on this run (CPU int8, 20 cores, 4 rotations per question):
two-image ladder questions 113 s wall; single-image scene questions 23–51 s
(mean 29); model load 53 s once per process.
At the in-graph lane (GPU or the router) the pack's README class of latency is
~1 s on a Mac Studio — the CPU numbers are the floor, not the lane's ceiling.
What TDE-3 would have added (throughput on a real slice vs hand-labels) stays
open until a labeled slice exists.

## 7. Fetch record (licenses verified at fetch; rows in the registry §5j)

| Artifact | Pin | License | Verification |
| --- | --- | --- | --- |
| `Qwen/Qwen3.5-4B` (backbone) | `851bf6e8` (frozen in imajev's adapter_config + RELEASE-SPEC) | **Apache-2.0** (tag + LICENSE read) | LFS sha256 vs etag (both shards); small files vs git-blob oid + size |
| `mohit67890/imajev-4b` (adapter + readout + calibration) | `f8d8234c` (main; schema-1.2 calibration files) | **Apache-2.0** (model card; no separate LICENSE file in repo — recorded as stated) | LFS sha256 vs etag + upstream `SHA256SUMS` 8/8 |
| `mohit67890/imajev` (code — the torch scoring path) | GitHub main tarball 2026-10-10 | **Apache-2.0** (LICENSE read) | imported verbatim by the eval; not vendored |
| `nomadoor/ComfyUI-TypedDecision` (the pack) | GitHub main 2026-10-10 | **MIT** (LICENSE read) | reference copy; its ComfyUI port was cross-read against the official path |

Staged at `/home/agent/models/tde-dl/` (fetch script
`/home/agent/models/tde-fetch.sh`, log `tde-fetch.log`).
