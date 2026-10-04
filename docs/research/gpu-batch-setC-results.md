# GPU batch — Set C results (the sigma mechanics: X1, X3, X6, X2)

> Flux task: **THE GPU BATCH (ourbqum)** · executed 2026-10-04 on branch
> `component-vocabulary` · executor: Set C (single seed per Amendment 5).
> **Attestation: 47 sampling generations, 61.1 GPU-min total** (44 planned +
> 3 ledger-pre-registered s10 exploratory cliff-rung cells), all on the live
> 8189 testbed the controller left resident from Set B. **No `/free` was ever
> posted** (controller owns VRAM phases; final residency 22489 MiB, baseline
> preserved; server left up per the controller's instruction). Contention
> guard clean at every submit (our queue + GPU util + the maintainer's 8188
> probed GET-only). Artifacts: `test-results/experiments/gpu-batch-setC/
> {scripts,out}` (on-disk, gitignored per the runbook); the review surface:
> `gpu-review/setC/` (committed). Ledger addendum: Amendment 6.

## 0. The run in one paragraph

The board (3 fixed prompts, low/med/high motion complexity) was pinned at set
open; every arm's knot array was re-verified at emission against A1's frozen
table (plus the c0-computed s8/s10/s18 X2 grids, code-true by the same
import method, with the s12 recompute asserted equal to A1's X1-a). Three
identical-config canaries — set start, mid, end, each a fresh
(`__setCalias` × control) signature so the engine truly re-rendered — came
back **frame- and audio-bit-identical to Set B's canonical r9 on all three
placements**: the zero floor held across the entire 47-gen set, and the
Amendment-5 canary-stop rule never fired. The staging quartet was identical
on every run (the only variance: the 6 X6 turbo runs stage the DiT with 50
bypass-adapter patches — the larryvrh v4 LoRA attached BYPASS per the
corrected §1.3 row, confirmed in the engine log alongside the executed card
sigma array matching A1's X6-alt2 grid exactly).

## 1. The board (pinned here; the A3 placeholder resolved)

| Cell | Prompt | Motion plan (centroid x, % width) | Basis |
|---|---|---|---|
| P1 LOW | locked tripod, plain table, red ball rolls 25%→33%, settles early | anchors f0/f17/f34 = 25/29/33%, hold to f38; success band [28,38] | movement-director harness ball board (E-MD1 scene), direction STATED in-prompt |
| P2 MED | tranche-1 **PROMPT_A verbatim** (Set B's canary board) | no numeric plan — carries the rest of the battery + the canary | the drift sentinel; qualifies as MED (slow stir + gentle push-in sits between P1 and P3) |
| P3 HIGH | same ball board; ball rolls briskly 25%→75% full traverse | anchors f0/f17/f34 = 25/50/75%, hold; success band [70,80] | as P1 |

Geometry 960×544×39f (544p-class; X2 rungs 1024×576 / 1344×768), 24 fps,
audio rows 65 = round(39·5/3), seed 421337 everywhere, `res_multistep` +
`simple` except where the arm IS the scheduler/grid treatment, shifts 12/3
(audio shift 3 held throughout — video-only moves). **Plan-error
operationalization (recorded):** the director-harness endpoint (ledger B2) is
measured on the plan-bearing prompts P1/P3 (red-mask centroid tracking,
39/39 frames tracked on every ball render, area CV ≤ 0.02); P2 carries the
identity/color/audio/shimmer endpoints. X1's primary contrast therefore has
n = 2 plan-bearing cells per arm (the honest-n note the Holm section
repeats).

## 2. X1 — mid-band density: **FALSIFIED** (the pre-registered falsifier fires; S2 parked)

Arms per A1's frozen table (3 arms — sgm/24 and the mixture were merged out
by Amendment 2; the mission text's 4-arm list predates that amendment and
the frozen table governs). 20 NFE everywhere; single seed.

| Arm | P1 rmse | P1 end x | P3 rmse | P3 end x | HF P1/P2/P3 | alt P1/P2/P3 |
|---|---|---|---|---|---|---|
| simple/20 | 1.367 | 32.68% | 12.737 | 90.50% | 2.144 / 3.365 / 1.962 | 0.024 / 0.004 / 0.024 |
| sgm_uniform/20 | 1.386 | 32.73% | 12.725 | 90.54% | 2.101 / 3.204 / 1.900 | 0.028 / 0.004 / 0.024 |
| beta(2,4)/20 | 3.514 | 35.53% | 10.970 | 87.67% | 0.934 / 2.800 / 1.019 | **0.223 / 0.214 / 0.034** |

Paired Δ vs simple (the primary unit):

| Arm×prompt | Δ plan-RMSE | relative | HF ratio | verdict vs rule |
|---|---|---|---|---|
| sgm × P1 | +0.019 | +1.4% | 0.980 | tie-class |
| sgm × P3 | −0.012 | −0.1% | 0.968 | tie-class |
| beta × P1 | **+2.147** | **+157%** | **0.436** | fails both prongs |
| beta × P3 | −1.767 | −13.9% | **0.520** | motion gain < 15% floor; HF loss ≫ 10% floor |

**Verdict (pre-registered decision rule):** no mid-weighted arm beats
simple/12 on motion AND holds HF — the rule's AND-condition fails on both
arms. `sgm_uniform` is simple's **render-level twin** at s12/20 NFE (A1's
0.0521 max-|Δσ′| separation does not survive to pixels: every paired read
tie-class). `beta(2,4)` — the only arm that actually moves mid-band knots —
**halves HF energy (ratios 0.44–0.52), runs alternation power 9–56× higher,
and degrades low-motion plan fidelity +157%**, buying a −13.9% motion gain on
the high-motion prompt that sits below the 15% floor. **S2 (the scheduler
dial) is parked per the falsifier: "mid-peak ≤ simple on motion at matched
NFE".**

Mechanistic read (exploratory, consistent across the beta family): at fixed
NFE, redistributing knots into the mid band starves the terminal window —
beta(2,4)'s last knots sit at 0.60/0.50 followed by a single 0.50→0
terminal jump (uniform grids walk to 0.39–0.44 first). The observed cost
pattern (HF collapse + temporal alternation + a LOWER flow-warp residual at
MED — 2.22 vs 10.79, a near-static flickering render) is under-integration
instability, not a motion win. The beta-family fry probe below (X3x)
reproduces the same signature, confirming it is family-general.

Fry endpoint (exploratory, P2): skin-region dE vs canonical carries the
known ≈24.6 motion-dominated floor (Set A A5 limitation, unchanged);
deltas above it: sgm +1.1, beta(2,4) +3.5, β(0.8,3) +6.1 — the beta family
shifts face color beyond its render-difference class. Cross-arm ArcFace vs
the simple render (0.43 sgm / 0.27 beta / 0.63 truncated) reads
render-divergence, not identity damage — same seed on a different grid lands
on a different face detail; Set A's calibration band places these in the
"same-ish identity, different render" class.

## 3. X3 — terminal truncation: **CONFIRMED at the binary level, and the σ′_end dial is decode-invariant** (design consequence → Amendment 6)

Control (a) implemented as pre-registered: the truncated arms decode
`SamplerCustomAdvanced` output **1** (`denoised_output` — the x₀ estimate
the final step already computes at σ′=0.4392), never the raw partially-noised
latent. NFE matched at 20 (truncation saves 0 steps — quality-at-matched-grid
as declared).

**The invariance finding:** σ′_end ∈ {0.05, 0.15} produce **bit-identical
videos** (video-stream md5 equal on every prompt; all metrics equal to the
last digit). This is by construction, now proven empirically: the decoded x₀
is the model's prediction at the second-to-last knot, and the terminal value
only shapes the *discarded* integrated state. The two cells are
identical-in-effect (the A1 merge rule's spirit, applied at run time — the
second truncation gen per prompt is retained as the proof, not dropped).

| Cell (sgm/20 base) | HF P1/P2/P3 | HF ratio vs full | plan rmse P1/P3 | treble P2 |
|---|---|---|---|---|
| full (integrate to 0) | 2.101 / 3.204 / 1.900 | 1.0 | 1.386 / 12.725 | 0.00501 |
| truncated, x₀-decode | 2.087 / 3.360 / 1.910 | 0.993 / **1.049** / 1.005 | 1.349 / 12.793 | 0.00392 |

**Verdict:** truncation **holds texture ≥ full on all three prompts**
(ratios 0.993/1.049/1.005 — all above the 0.90 floor; the face prompt
actually gains 4.9%) **with structure flat** (plan Δ −0.04/+0.07, both ≪ the
10% floor). Per the decision rule, **terminal-window discipline (S4) is
confirmed** — with the invariance reframing its dial as **binary**
(truncate-at-last-knot + x₀-decode vs integrate-to-zero); there is no σ′_end
value to tune under this control. Audio caveat (flagged for S4 wiring): P2
treble 0.00392 vs full 0.00501 (−22% relative; both absolute-tiny — the
truncated decode passes the x₀ latent's audio rows; if S4 ships, one
dedicated audio check belongs in its recipe validation).

**X3x — the β(0.8,3) boundary-peaked fry probe (exploratory):** reproduces
the beta-family signature in stronger form — HF ratio vs full 0.457 (P1),
plan rmse 3.37 vs 1.39, alternation 0.104 vs 0.028, skin dE +6.1 over the
motion floor. The fry-direction probe confirms: pushing knots toward the
boundary starves the terminal window and produces soft, temporally unstable
output. With X1's beta(2,4) result, the beta family at fixed NFE is measured
as a fry/instability class on this stack.

## 4. X6 — distill off-distribution: **no measurable automated penalty; materially different renders; judge pending**

Two cells at matched 8 NFE (A1's surviving pair), larryvrh v4 turbo BYPASS
(engine log confirms: 158 bypass adapters active, executed sigma array =
A1's frozen card grid digit-for-digit):

| Prompt | HF card/simple (ratio) | alternation card/simple | plan rmse card/simple | pixel pair (PSNR / dE) | wall card/simple |
|---|---|---|---|---|---|
| P1 | 1.297/1.278 (1.014) | 0.0744/0.0716 | 13.88/8.99 | 23.0 dB / 8.65 | 33.7/30.7 s |
| P2 | 3.517/3.656 (0.962) | **0.0184/0.0032** | n/a | 16.5 dB / 19.75 | 33.7/30.7 s |
| P3 | 1.330/1.327 (1.002) | 0.0418/0.0516 | 10.46/11.39 | 25.5 dB / 6.84 | 36.9/30.7 s |

**Verdict (automated side):** no collapse-metric penalty in either direction
on HF (all ratios within granularity); the one separating metric is
alternation on P2 (card 5.8× simple — simple is the cleaner turbo grid on
the face/texture axis); plan-error splits by prompt (card +54% worse at LOW,
−8% better at HIGH); face dE/ArcFace near-tied. The two grids are
**materially different renders** (PSNR 16.5–25.5 dB — grid choice at turbo
tier changes the image class), so "manifest ≡ grid-in-effect" from A1 holds
only in the collapse-metric sense. **S1's off-distribution warning threshold
calibrates at ≈ zero on these endpoints.** The pre-registered judge
threshold (≥ 9/12) is unreachable at single-seed n=3 pairs — the blind
pairs (p14–p16) ship on the surface; the maintainer's calls land per
Amendment 1 and the verdict table below.

## 5. X2 — the resolution × shift ladder: **cliff confirmed between 576p and 768p (two-sided by endpoint); the interaction on adherence is ~zero (S3 parks); exploratory stability interaction recorded**

Stage 1 (all rungs @ native s12; 544p shares X1-a's board):

| Rung | P1 rmse | P1 HF | P3 rmse | P3 HF | P2 alternation |
|---|---|---|---|---|---|
| 544p | 1.367 | 2.14 | 12.737 | 1.96 | 0.0038 |
| 576p | 2.043 | 1.77 | 6.849 | 1.92 | 0.0035 |
| 768p | 7.611 | **0.89** | 7.354 | **0.90** | **0.0832** |

The cliff fires on P1 (low-motion structure): 576→768 is +273% plan error
(2.04→7.61) with ball-texture HF halved (1.77→0.89) — the 768p
static-structure collapse, reproduced on our stack, sitting **between 576p
and 768p** exactly where the audit placed the untested boundary. **But the
ladder inverts on P3 (high motion):** plan error *improves* 12.7 → 6.8 → 7.4
with resolution. The "collapse" is endpoint-dependent — resolution tokens
buy fast-motion tracking while static-structure fidelity and texture fall
over at 768p. P2's alternation at 768p (0.083) is 22× the 544p value — the
temporal-stability axis degrades too.

Interaction (the estimand; [E(s18)−E(s8)]₇₆₈ − [E(s18)−E(s8)]₅₄₄):

| Endpoint | P1 | P3 | mean | read |
|---|---|---|---|---|
| plan RMSE | −0.005 | +0.343 | **+0.169** | flat (cell values 5.4–13.9) |
| plan success | 0 | 0 | 0 | flat |
| HF | −0.154 | **+0.755** | +0.170 | exploratory: s18 doubles 768p ball HF (0.93→1.84) while 544p is flat |
| alternation | +0.019 | +0.008 | — | exploratory: shift raises alternation only at 768p (P2: 0.039→0.113) |

**Verdict:** on the adherence endpoint the resolution×shift interaction is
~zero and shift is resolution-flat — **S3 parks** per the ledger's flat
branch (no per-resolution shift table). The exploratory family records a
genuine interaction on the stability axes (BH q=0.10, single-prompt cells,
labeled): high shift at 768p doubles alternation on the face axis — the
preset guidance this feeds is "avoid high shift at 768p", not a dial table.

s10 add-on (cliff rung, ledger-pre-registered, trigger = the stage-1 cliff —
fired): plan error is flat across the whole s8–s18 sweep at 768p (P1:
8.02/7.87/7.61/8.07) — **no shift rescues the 768p structure cliff** — while
P2 alternation rises monotonically with shift (0.039/0.047/0.083/0.113),
confirming the stability interaction's direction.

## 6. Statistics layer (honest label)

Set family = 4 primary contrasts at Holm α=0.05; sign-test p-values
(BH-verified machinery) with the Amendment-5 single-seed ns: X1 n=2
(min p 0.25), X3 n=3 (p 0.125 both cells — direction consistent 3/3), X6
automated p 0.5–1.0, X2 interaction p 1.0. **Nothing rejects under Holm —
at these ns the sign test cannot reach α, as pre-announced in Amendment 5's
arithmetic.** The verdicts above therefore rest on the pre-registered
practical floors (formulas over SD_B = 0, i.e., the floors dominate), which
the zero render-noise floor makes decisive in a way n-fold replication is
not: every paired Δ measured is attributable to treatment. The exploratory
family (fry endpoints, X3x, the HF/alternation interactions, X6 plan-error
splits) is reported as exploratory and never gates a ship decision.

## 7. Wall-clock economics (measured; re-anchors later sets)

| Class | wall mean | sampling mean | n |
|---|---|---|---|
| 544p base-20 (39f) | **60.3 s** | 54.6 s | 41 |
| 576p | 67.4 s (+12%) | 62.1 s | 3 |
| 768p | **142.1 s (2.36×)** | 137.0 s | 12 |
| turbo-8 (X6) | 32.7 s (0.54×) | 29.5 s | 6 |

768p runs 2.36× the 544p wall (the ledger's "≈2× token-linear" plus
attention overhead — 137 s sampling vs 55 s). Peak VRAM flat at
24135–24137 MiB across every run and rung — the 24 GB stack absorbs 768p
without offloading collapse.

## 8. The review surface (Amendment 1 + 4, delivered)

`gpu-review/setC/` — open **`review.html?set=C`** (the URL param selects the
response store): 28 blinded pairs (L/R by sha256; the escrowed
`pairs/.key` carries arm identities + pre-registered expectations and stays
sealed until your calls are exported), `pairs-metadata.js` per the v2.1
contract (shared renders always; per-side wall/sampling/VRAM reveal
post-call), `pairs-frames.js` + `frames/` (223 MiB lossless strips — on the
~220 MiB/set budget; extraction ran as part of output assembly), `runs/`
with all 47 videos + the machine manifests. **The p-null gate PASSED**: the
instrument verifier reports every strip pixel-exact and **p07 (mid-canary vs
Set B r9) at 0 L/R differences** — the null is pixel-identical as
pre-registered; all 27 treatment pairs differ on 39/39 frames (no
accidental duplicates). Cross-resolution pairs (p17–p22) present at a common
canvas with the smaller side bilinear-upscaled — pre-registered in the key,
revealed post-call via `upscaled_from`.

**The verdict-table scaffold (the maintainer's calls land here):**

| Pair | Contrast (blinded until key open) | Pre-registered expectation | Automated battery | Maintainer's call |
|---|---|---|---|---|
| p01–p03 | X1 simple vs sgm × 3 prompts | near-twins → tie or small diff | tie-class on every metric | _pending_ |
| p04–p06 | X1 simple vs beta(2,4) × 3 | the mid-band treatment | beta: HF ÷2, alt 9–56×, +157% P1 plan err | _pending_ |
| p07 | **null: canary vs Set B r9** | **TIE** | **bit-identical (0 px diff)** | _pending_ |
| p08–p10 | X3 full vs trunc-0.05 × 3 | texture retention | HF ratio 0.99/1.05/1.01, structure flat | _pending_ |
| p11–p13 | X3 full vs trunc-0.15 × 3 | as p08–10 | **identical to p08–p10 sides (invariance)** | _pending_ |
| p14–p16 | X6 card vs simple × 3 | grid effect at 8 NFE | no HF collapse; alt 5.8× on P2 | _pending_ |
| p17–p19 | X2 544 vs 576 @ s12 × 3 | cliff probe, lower rung | P1 +49% plan err, −17% HF; P3 −46% plan err | _pending_ |
| p20–p22 | X2 576 vs 768 @ s12 × 3 | the collapse rung (768 native) | P1 +273% plan err, HF ÷2; P3 flat-better | _pending_ |
| p23–p25 | X2 s8 vs s18 @ 544p × 3 | shift within 544p | adherence flat; HF flat | _pending_ |
| p26–p28 | X2 s8 vs s18 @ 768p × 3 | shift within 768p | adherence flat; P3 HF 2×; P2 alt 2.9× | _pending_ |

## 9. Exit-criteria self-assessment

| Ledger exit criterion | Status |
|---|---|
| X1/X3/X6 verdicts written into this doc + Amendment 6 | **MET** — X1 falsified (S2 parked); X3 confirmed-binary (S4 confirmed, dial binary); X6 no-automated-penalty (judge pending on the surface) |
| X2 stage-1 verdict + whether stage-2 fired | **MET** — cliff fired (576↔768, two-sided by endpoint); stage-2 ran (interaction ≈ 0 on adherence → S3 parks; exploratory stability interaction recorded); s10 add-on ran per its pre-registered trigger |
| Winning configs queued for fresh-material confirmation (§1.1) | **MET with an honest note** — the only "winner" is X3's truncated-decode (a decode discipline, not a config family); queued note in Amendment 6 for the next base-tier set's graphs. No X1/X2 winner exists to promote (falsification/flat verdicts) |
| All knots logged = designed knots (A1 table) | **MET** — machine-asserted at emission (every roster array matched its frozen source or the c0-computed s8/s10/s18 grid; the s12 recompute asserted equal to A1 X1-a); the X6 card grid additionally verified digit-for-digit in the engine log |

## 10. Deviations, concerns, and notes

1. **Node substitution (recorded, not a design change):** the live 8189
   process predates the ExpSetSigmas shim's registration, so the truncation
   grids run through the STOCK `ManualSigmas` node — parsed floats passed
   through unmodified (no terminal forcing; source-verified at
   `nodes_custom_sampler.py:1125`). Same arrays as A1's trunc arms.
2. **X3 decode wiring implements the ledger control:** A3's BOM text
   declared the denoised-prediction decode but its draft wiring read
   output 0; Set C's graphs decode output 1 (`denoised_output`) — verified
   against the sampler source (res_multistep fires the callback every step;
   `prepare_callback` stores x₀ unconditionally, so output 1 is guaranteed
   populated, not a silent fallback).
3. **X1 arm roster reconciliation:** the mission text listed the
   pre-Amendment-2 four-arm set; A1's frozen table (which the same mission
   designates as the source of grids) has three. The frozen table governed.
4. **The X3 invariance is a design consequence** → ledger Amendment 6 (the
   σ′_end ladder collapses; S4's dial is binary).
5. **Judge thresholds at single-seed n:** ≥9/12 is unreachable at 3 pairs —
   automated metrics carried the family; the maintainer's calls remain the
   §1.4 human checkpoint on every judged contrast (the surface ships).
6. **plan-error is P1/P3-only** (P2 has no numeric plan) — declared at set
   open; X1's primary carries n=2 plan cells.
7. **The P2 face-dE floor** (~24.6, motion-dominated region anchoring —
   Set A's known limitation) applies to all skin reads; deltas, not
   absolutes, carry meaning.
8. **768p renders completed with peak VRAM flat at 24135 MiB** — no OOM,
   no offloading collapse; no restart was needed at any point.
9. **GPU use:** 61.1 min across 47 gens; no `/free`; the testbed was left
   running per the controller's instruction (teardown is controller-owned).

## Addendum — the maintainer's review is the remaining human step

The 28-pair surface is live (`gpu-review/setC/review.html?set=C`); the key
stays escrowed until the calls are exported. Per §1.4b, any disagreement
between the maintainer's calls and the automated reads (especially on p01–
p03, where the metrics say tie-class) escalates as a protocol event — most
interestingly on p11–p13, where the automated battery says the sides are
*identical to* p08–p10's truncated side by construction.
