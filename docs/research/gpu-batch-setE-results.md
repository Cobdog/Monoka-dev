# GPU batch — Set E results (X7, the staged base→turbo handoff)

> Flux task: **THE GPU BATCH (ourbqum)** · executed 2026-10-05 on branch
> `component-vocabulary` · executor: Set E (single seed per Amendment 5).
> **Attestation: 24 valid generations + 4 diagnostic/probe passes ≈ 24.4 GPU-min
> total** (24 valid runs 19.9 min + 3 superseded v1-machinery Ed gens + 1
> discarded Ee probe + 2 boundary micro-probes), all on the live 8189 testbed
> (PID 4086342, 0.37.4). `/free` posted at every phase boundary
> (executor-owned); **teardown verified to the 302 MiB baseline** (SIGINT →
> SIGTERM → exit → 0 orphan GPU processes). **Both canaries (start + mid, fresh
> `__setEalias`×`__setEalias2` signatures) bit-identical to Set B r9** — the
> zero floor held across the whole set; the canary-stop rule never fired.
> **Both cancellation gates PASSED** (below — after the machinery's v1 wiring
> was caught and fixed BY the gate, which is the control doing exactly its
> job). **Null gate PASSED**: the E-b P2 duplicate through `__setEnull` is
> bit-identical run-time and 0 px through the instrument. Artifacts:
> `test-results/experiments/gpu-batch-setE/{scripts,out}` (on-disk, gitignored
> per the runbook); review surface: `gpu-review/setE/` (untracked per the
> no-test-sets directive — results doc, pairs-metadata.js, pairs-frames.js,
> manifests.json and the escrowed `pairs/.key` carry in git). Verdicts below
> are **PROPOSED** — the maintainer's blind calls on the 19-pair surface are
> the decision layer. Ledger registration: "Set E — X7" + Amendments 2.5/7.

## 0. The run in one paragraph

Seven arms on one board (Set C's verbatim P1/P2/P3 + plans, 960×544×39f, seed
421337, audio on — the rebasing must be exercised), all on the **ref2va base**
(`minimax_h3_ref2va_pruned_int8_convrot`, text-only through
`MiniMaxH3ReferenceToVideo`): E-c pure base-20 (ceiling), E-d base→base split
5+15 (cancellation), E-a turbo-8 at its **native 6/3 manifest** (the economic
incumbent — first on-card run of this file in the batch), E-a′ turbo-11-segcut
(matched-NFE comparator), E-e turbo→turbo split 5+6 (in-family cancellation),
E-b staged base→turbo at t=0.75 (5+6=11 NFE, the primary), E-b′ staged at
t=0.5 (10+4=14 NFE, the stress arm). Every arm's knots re-derived at emission
from the canonical install's scheduler code and asserted digit-identical to
A1's frozen table AND to A3's compiled leg strings; the turbo-family sigma
arrays additionally verified in the engine log. The LoRA rode **stock
`LoraLoaderModelOnly` @ 1.0** (208 patches staged on every LoRA arm, zero
NOT-LOADED — the Set P trap guarded against by a driver-side STOP). Execution
order honored the controller's directive: **cancellation controls first**, the
treatment arms burned GPU only after both gates passed.

## 1. The model ruling and the board (one disclosure)

**Disclosure — the REF2VA substitution (A3's gap G-E1, executed at dispatch):**
the ledger's 6/3 turbo manifest is the LightX2V 768p line; locally we hold only
the REF2VA flavor. Ruling: run the WHOLE set on the ref2va base + the local
`minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16` (Set P's validated
attach path). No fetch, no new bytes. This keeps the staged handoff, its
ceiling (E-c), and both cancellations **in-family** (same packed-latent layout,
same conditioning space, same RoPE) — the coherent reading of "base→turbo" on
what we actually run in production. Consequence: E-c is the ref2va ceiling, not
the FL2VA Set C board's; the FL2VA **canary graphs stay FL2VA** (Set B r9
continuity — both canaries bit-identical). If the maintainer wants the FL2VA
pairing, the re-run surface is the 7-arm × 3-prompt board with the FL2VA turbo
fetched (~1.9 GB).

Board: Set C's prompts verbatim; plan-error on P1/P3 (n=2 plan cells), the
face/audio/shimmer endpoints on P2. Single seed (Amendment 5). NFE per arm
(structurally asserted at emission): E-a 8 · E-a′ 11 · E-b 5+6=11 · E-b′
10+4=14 · E-c 20 · E-d 5+15=20 · E-e 5+6=11.

## 2. The machinery — the latent-link convention, probe-proven (the set's real discovery)

The A3 offline compile wired stage-2 as `DisableNoise` + stage-1 output as
`latent_image`. **Source-read before burn caught that this is underdetermined**
(`CONST.noise_scaling` mixes `x = σ·noise + (1−σ)·latent` at samplers.py:993),
and the first GATE A run **failed grossly** under the v1 correction
(PSNR 6–7 dB, HF 12–27×, fried noise output) — the control doing exactly its
job. Two micro-probes (exp_shims save/load + a micro-step whose printed x_rms
reveals the initial state) settled the engine's actual contract:

1. **The latent LINK carries `x_final/(1−σ_terminal)`** — `CONST.
   inverse_noise_scaling` (model_sampling.py:99) divides on the way out. A
   1-step probe at σ:1.0→0.99 printed sampler x_rms 0.9914 and a SAVED link
   rms of 99.14 = x/(1−0.99), exactly. (Terminal-0 runs divide by 1 — why
   every single-stage set was blind to this.)
2. **Exact state continuation needs ONE scalar on the link**:
   `m = (1−σ₁_last)/(1−σ₂_first)`. Equal-σ splits (E-d, E-e — the split sits
   on one knot of both grids) need **m = 1**: stage-1 wires straight into
   stage-2 (A3's wiring was right for them). The C1-mislabeled arms carry
   **E-b m=0.513509, E-b′ m=0.538462** (a single `LatentMultiply`, fp32-
   mirrored to the engine's arithmetic, reconstruction error < 1e-7) — the
   mislabel's ×1.95/×1.86 amplification undone. This scalar IS the C1
   state-coordinate transformation on this engine.
3. **C2/C3 audio rebasing is native and exact**: the (1−σ) factors cancel;
   the net audio factor across the boundary is exactly
   `audio_scale₂/audio_scale₁` (÷4 then ×2 for base→turbo) via
   `process_latent_out/in` — and σₐ continuity rides the shared base position
   per A3's construction. The mandatory audio sub-endpoint (§6) measures it.
4. **C5 stands as declared**: `res_multistep` at eta=0 runs first-order Euler
   after a history reset and indexes `sigmas[i−1]` — a split provably
   perturbs the trajectory (E-d is pixel-different from E-c); the gates
   measure the COST, and it is tiny (§3).

Superseded/discarded: the three v1-machinery E-d gens + one E-e probe gen
(recorded in `e1_runs.json.superseded_runs_v1_machinery`; renders remain on
disk under `setE/Ed_00001-3` as the failure record). **Repo-wide implication:
ANY latent-chaining work on this engine (Set I drift chains, seam joints,
re-anchor hops) must apply the ratio correction at every sampler boundary —
the link is not the state.**

## 3. The cancellation controls — both gates PASS (the set's integrity gate)

Tolerance operationalization (pre-registered, SD_B=0 so the practical floors
dominate): quality floors = plan RMSE ±10% per cell, HF ratio within
[0.90, 1.10], no tracker loss, audio not silent and within 6 dB/500 Hz;
PSNR reported with the A4 envelope (≲38 dB "invisible") and 20 dB gross line.
Bit-identity NOT expected (C5) — and not observed.

| Gate | Cell | PSNR | dE | HF ratio | plan rel Δ | audio RMS Δ | verdict |
|---|---|---|---|---|---|---|---|
| **A: E-d vs E-c** (base→base, 5+15 vs continuous 20) | P1 | **43.97 dB** | 0.95 | 0.992 | −2.5% | −0.8 dB | PASS |
| | P2 (face) | 28.54 dB | 4.76 | 0.992 | n/a | −0.8 dB | PASS |
| | P3 | **44.02 dB** | 0.83 | 1.006 | +0.1% | −0.8 dB | PASS |
| **B: E-e vs E-a′** (turbo→turbo, 5+6 vs unsplit segcut-11) | P1 | **46.12 dB** | 0.76 | 1.001 | −0.2% | +0.4 dB | PASS |
| | P2 (face) | 35.38 dB | 2.54 | 0.997 | n/a | +0.4 dB | PASS |
| | P3 | **45.34 dB** | 0.80 | 0.990 | −0.1% | +0.4 dB | PASS |

Reads: the split machinery reproduces the unsplit trajectory **to 44–46 dB on
the ball cells — above the 38 dB VAE round-trip envelope**, i.e. the C5
cache-reset + boundary rounding cost is at the "two decodes of the same latent"
level. The face cell diverges more (28.5/35.4 dB — face fine-structure is the
chaotic amplifier of any trajectory perturbation) while every quality endpoint
holds. Audio: E-d vs E-c centroid +8 Hz, RMS −0.8 dB; E-e vs E-a′ +1.2 Hz,
+0.4 dB — **the C2/C3 rebasing leaves no measurable audio seam**. The
machinery is valid; every staged number below is interpretable.

## 4. The primary contrasts

**PRIMARY 1 — E-b (staged, 11 NFE) vs E-a′ (turbo segcut, 11 NFE), matched cost:**

| Cell | plan RMSE (succ) | HF ratio | alt ratio | pixel | face arc (P2 only) |
|---|---|---|---|---|---|
| P1 low | 2.452 / **1.817** (T/T) | **1.304** | 1.444 | 21.2 dB | — |
| P2 med | n/a | 1.220 | **0.673** | 17.6 dB | 0.538 / 0.493 |
| P3 high | **11.545** / 12.259 (F/F) | 1.088 | 0.879 | 20.8 dB | — |

The staged arm **does not beat its matched-NFE control**: plan splits 1–1
(loses low motion by 26%, wins high motion by 6% — both under/over the 15%
floor in opposite directions), carries consistently MORE high-frequency energy
(HF 1.09–1.30 — sharpness or fry, the eye decides on p02–p04), is cleaner on
the face alternation (0.67×) and flicker-ier on the ball (1.44×). The renders
are materially different classes (17–21 dB) — genuine A/B choices.

**PRIMARY 2 — E-b vs E-c (the ceiling gap):** P1 plan +27% (2.452 vs 1.933 —
beyond the 10% floor, E-b IS below the ceiling at low motion), P3 −3% (11.545
vs 11.941, tie-class); HF 1.10/−10% split; P2 alternation **0.247 — the staged
arm is 4× cleaner than the base ceiling on the face cell** (the ref2va base
flickers there; E-b's turbo tail stabilizes it). Face ArcFace: 0.538 (E-b) vs
0.785 (E-c) — read as render-divergence only; the canonical reference IS
E-c P2, so E-c's number is a motion-dominated self-read, deltas carry meaning.

**Decision rule applied (PROPOSED):** E-b ≯ E-a′ at matched NFE (no plan win,
HF risk-axis up) AND E-b < E-c beyond floors at P1 → **the Krea 2 staged
pattern does not pay on H3 at this operating point — S7 parked with the
measured reason** (consistent with the thesis's guidance-1 prior: no real-CFG
stage-1 benefit to inherit). The eye's calls on p02–p07 are the decision
layer; the one path that could reopen S7 is a decisive E-b win on the
sharpness axis (the HF 1.2–1.3 ratios read as detail, not fry).

## 5. The stress and frontier arms (exploratory)

**E-b′ (deep handoff t=0.5, 14 NFE) vs E-b:** plan ties (2.285/2.452 P1 — deep
actually slightly better at low motion; 11.668/11.545 P3), but **alternation
2.4–4.5× worse** on P1/P2 (0.079 vs 0.033; 0.067 vs 0.015) and HF +4–8% —
the deeper mislabel (C1 gap 0.0659 vs 0.0256) costs temporal stability, not
plan fidelity. Handing off late is the right side of the trade.

**E-a (native turbo-8 @ 6/3) vs E-a′ (segcut-11):** segcut wins low motion
hard (plan 1.817 vs 4.278 — 2.4×), native-8 wins high motion hard (6.033 vs
12.259 — 2×, and succeeds where segcut fails) while carrying HALF the HF
(0.41–0.77 — much softer renders). The comparator is a genuinely different
operating point, and the matched-NFE control was therefore load-bearing:
E-b's "no win" is against the STRONG side of the turbo family at each cell.
Context note: at its native shift (this set), turbo-8 handles the high-motion
cell cleanly (plan 6.03, success) — Set P ran this same file off-card at 12/3
where its high-motion cell catastrophically failed; **the card recipe matters
more than the LoRA**, which is its own small verdict.

## 6. The audio sub-endpoint (C2/C3 validation, mandatory)

No degeneracy anywhere: no silent cells (E-b quietest −44.0 dBFS on P2 — its
"quiet room tone" prompt read), no garble (E-b vs E-c centroid +981 Hz,
treble +0.013 — brighter, not broken; the E-e gate shows pure-turbo splits
match unsplit within 1 Hz, so the boundary itself is seamless). **The turbo
family as a whole renders P2 ~14 dB quieter than the base family** (−40s vs
−26 dBFS) — a family trait, not a rebasing artifact; E-b sits inside the turbo
band. E-b's audio is also ~600–700 Hz brighter than its matched control
(1729–1885 vs 1263–1408 Hz centroid) — the base stage's early audio work
leaves a fingerprint through the handoff. Ear review on `pairs/p0*.mp4`
recommended before any recipe verdict (the strips are silent; the mp4s carry
audio).

## 7. Economics (measured; warm sampling, 39f, 960×544)

| Arm | NFE | warm sampling s | wall s | peak VRAM |
|---|---|---|---|---|
| E-c base-20 | 20 | 54.8 | 62.3 | 24153 |
| E-d split 5+15 | 20 | 54.8 | 58.2 | 24165 |
| E-a turbo-8 | 8 | 28.2 | 38.8 | 24153 |
| E-a′ segcut-11 | 11 | 34.3 | 39.8 | 24153 |
| E-e turbo split 5+6 | 11 | 34.8 | 39.8 | 24153 |
| **E-b staged 5+6** | 11 | **34.8** | 45.0 | 24165 |
| E-b′ staged 10+4 | 14 | 41.0 | 47.0 | 24165 |

The staged handoff costs the same sampling time as its matched comparator
(34.8 vs 34.3 s — the two-stage graph adds ~0.5 s of latent plumbing) and 64%
of base-20's sampling — the "quality at ~55% of base cost" arithmetic only
pays if the quality were there. VRAM flat ≈24.15 GB on every arm; the
two-model graph (shift12 + shift6+LoRA patch objects on one base) adds no
measurable peak.

## 8. Statistics layer (honest label)

Confirmatory family = the ledger's three primaries, Holm α=0.05; at
Amendment-5 single-seed n=2 plan cells the sign test cannot reach α (min p
0.25) — as pre-announced. The verdicts rest on the pre-registered practical
floors over the zero SD_B (every measured Δ is attributable to treatment).
Judge thresholds (≥9/12) unreachable at n=3 pairs per contrast — the
maintainer's calls on the 19-pair surface are the §1.4 human checkpoint.
Exploratory family (BH q=0.10): the stress and frontier reads, the HF axis
(sharpness-or-fry), the audio fingerprints.

## 9. The review surface (Amendments 1 + 4 + 7, delivered)

`gpu-review/setE/` — open **`review.html?set=E`**: **19 blinded pairs** (L/R
by sha256; `pairs/.key` escrowed with pre-registered expectations, sealed
until the calls are exported), `pairs-metadata.js` carrying the Amendment-7
block on **every** pair — the question in maintainer terms, the ONE judging
criterion, the side-randomization note, and the null wording on p01. p01 null
(E-b duplicate through the alias) **PASSED**: run-time framemd5+audio-md5
identical, instrument verifier 0/0 L/R pixel differences; all 18 treatment
pairs differ on 39/39 frames. Frames 96 MiB (inside the ~220 MiB guidance).
`runs/` carries all 24 valid runs + the machine manifest (knots, multipliers,
state-guard x_rms, patches-208, supersession record).

**The verdict scaffold (the maintainer's calls land here):**

| Pair | Contrast (blinded until key open) | Pre-registered expectation | Automated battery | Maintainer's call |
|---|---|---|---|---|
| p01 | **null: E-b duplicate through alias** | **TIE** | **bit-identical (0 px diff)** | _pending_ |
| p02–p04 | **E-b vs E-a′ × 3 (the economic question at matched 11 NFE)** | staged vs pure-turbo, same cost | plan 1–1; HF 1.09–1.30 (sharp-or-fry); face alt 0.67× | _pending_ |
| p05–p07 | E-b vs E-c × 3 (the ceiling gap) | what 55%-NFE gives up | P1 plan +27%; P3 tie; face alt 4× cleaner | _pending_ |
| p08–p10 | **E-d vs E-c × 3 (the machinery gate's eye check)** | near-tie; NOT identical by design; a real quality drop = machinery failing | 44/28.5/44 dB; HF 0.99–1.01; audio seamless | _pending_ |
| p11–p13 | E-e vs E-a′ × 3 (turbo in-family) | near-tie | 46/35.4/45.3 dB; HF ~1.00 | _pending_ |
| p14–p16 | E-b′ vs E-b × 3 (deep handoff) | deeper mislabel costs stability | alt 2.4–4.5×; plan ties | _pending_ |
| p17–p19 | E-a vs E-a′ × 3 (comparator validity) | segcut buys low motion, native-8 buys high | plan 2.4×/2× split; HF 0.41–0.77 | _pending_ |

**Eye-critical pairs:** p02–p04 (is the staged arm's extra HF detail or fry —
the primary's whole verdict), p08–p10 (the machinery through the maintainer's
eye — the automated gate passed at 44 dB, the eye should see ties), p19 (the
native-8 high-motion win, where the family's own economics flip).

## 10. Exit-criteria self-assessment

| Ledger exit criterion | Status |
|---|---|
| Machinery gate pass recorded | **MET** — both gates PASS at 44–46 dB class (§3), after the gate itself caught the v1 wiring (§2 — the falsifier falsified the first harness, which is the audit's design working) |
| Primary contrasts resolved | **MET (PROPOSED)** — E-b ≯ E-a′ at matched NFE; E-b < E-c at P1 beyond floor → S7 parked pending the eye |
| S7 verdict + state-transformation write-up amended with measured numbers | **MET** — §2 (the link convention + ratio scalar) + §4; ledger addendum follows |
| Mandatory audio sub-endpoint on E-b vs E-c | **MET** — §6; no degeneracy; rebasing seamless (E-e gate +1 Hz centroid); family-level quietness and the base-stage brightness fingerprint recorded |
| Fresh-material confirmation queued for any winning config | **MET with the honest note** — no winner to extend (S7 parked); the promotable artifact is the MACHINERY (the ratio correction), queued for Set I's chain re-runs and any seam work |
| Cancellation controls executed as registered (not simplified away) | **MET** — E-d and E-e ran as full-machinery splits and gated the treatment arms |

## 11. Deviations, disclosures, and notes

1. **The REF2VA substitution** (A3 gap G-E1) — §1; the set's one model ruling,
   flagged for the gate.
2. **The v1 machinery failure + probe-proven correction** — §2; three Ed gens
   + one Ee probe superseded and recorded; ~4.5 GPU-min of the 24.4 total.
3. **The gates ran BETWEEN phases as pre-registered** — treatment arms burned
   GPU only after both passed (the controller's "controls first" directive).
4. **Judge thresholds unreachable at n=3** — as in Sets C/P; the maintainer's
   calls decide; the automated side carries the floors.
5. **The stage-2 state guard** (driver-side, new): every staged arm's second
   sampler block must open at x_rms in the state's band — all nine staged
   cells logged 0.86–0.94 (the v1 bug would have read ~17.7); now a standing
   pattern for any chained-sampler work.
6. **Set C's X3 decoded output 1** — untouched here; all legs decode output 0
   at terminal σ=0 where the two coincide by construction.
7. **E-a ran on-card for the first time** (6/3 manifest) — its high-motion
   success (plan 6.03) vs Set P's off-card catastrophic cell (12/3, plan 26.2
   on the naive variant) is recorded as a card-recipe datapoint for the
   recipe ledger.
8. **GPU use:** 24.4 min total (24 valid + 4 diagnostic); contention guard
   clean at every submit (the maintainer's 8188 never busy); `/free` at three
   arm boundaries + set end; teardown verified to 302 MiB, zero orphans.

## Addendum — teardown + handoff state (2026-10-05)

`/free` posted → SIGINT 4086342 (absorbed) → SIGTERM → process exited →
**nvidia-smi verified at the 302 MiB baseline, no orphan processes.** Set J
follows; the controller relaunches per the sprint-wrap sequence. Canary state
for continuity: both setE canaries bit-identical to Set B r9 (the canonical at
`/home/agent/comfyui/output/setB/r9_canonical_00001_.mp4` survives on disk);
the next set's canary should keep using it plus a fresh alias pair
(`__setJalias` etc.). The `__setE*` aliases stay in `/home/agent/models/vae/`
as part of the signature-lever toolkit.

## Addendum — the maintainer's review is the remaining human step

The 19-pair surface is live (`gpu-review/setE/review.html?set=E`); the key
stays escrowed until the calls are exported. Per §1.4b, any disagreement
between the eye and the automated reads escalates as a protocol event. The
pre-registered tensions to watch: p02–p04 (the HF 1.2–1.3 axis — the primary's
verdict flips if the eye reads detail), and p08–p10 (the eye should call ties
where the metrics read 44 dB).
