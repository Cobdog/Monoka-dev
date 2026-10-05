# GPU batch — Set P results (the PDMD 4-NFE turbo-king bake-off)

> Flux task: **THE GPU BATCH (ourbqum)** · executed 2026-10-04 on branch
> `component-vocabulary` · executor: Set P (single seed per Amendment 5).
> **Attestation: 21 generations, 12.1 GPU-min total** (2 Amendment-5 canaries,
> 6+6+6 arm cells, 1 null duplicate), all on the live 8189 testbed (PID
> 3937245, 0.37.4). `/free` posted at every phase boundary (executor-owned this
> set); teardown at set end verified to the 302 MiB baseline (below). **Both
> canaries (start + mid, fresh `__setPalias` × control signatures)
> bit-identical to Set B's canonical r9** — the zero floor held across the whole
> set; the canary-stop rule never fired. **Null gate PASSED**: the PDMD-4
> duplicate through the fresh `__setPnull` VAE alias is bit-identical to its
> original (framemd5 + audio md5), and the instrument verifier reports p01 at
> **0 L/R pixel differences**. Artifacts: `test-results/experiments/
> gpu-batch-setP/{scripts,out}` (on-disk, gitignored per the runbook); review
> surface: `gpu-review/setP/` (untracked per the no-test-sets directive —
> results doc, pairs-metadata.js, pairs-frames.js, manifests.json and the
> escrowed `pairs/.key` carry in git). Verdicts below are **PROPOSED** — the
> maintainer's blind calls on the 19-pair surface are the decision layer.
> Ledger registration: "THE PDMD SET (letter P)".

## 0. The run in one paragraph

Three arms on one graph shape — `minimax_h3_ref2va_pruned_int8_convrot`,
text-only conditioning through `MiniMaxH3ReferenceToVideo` (no refs wired),
shift 12/3 pinned via `MiniMaxH3SigmaShift`, `MiniMaxH3TurboSampler` (Euler on
native ModelSamplingAV — X6's pinned recipe), `BasicScheduler simple/N`,
LoRA via **stock `LoraLoaderModelOnly` @ 1.0** — over a 6-prompt board × 1
seed. Arm 1 turbo-8 v1.0 (the incumbent king recipe: simple/8), arm 2 turbo-4
v0.1 (matched-NFE control: simple/4 — the LightX2V card's own 4-step grid,
asserted equal at roster build), arm 3 PDMD-4 (v6 @ 1.0 only, simple/4, the
registered `pdmd, ` trigger prefix). Every arm's knots were verified
digit-for-digit in the engine log (`[H3TURBO sampler] sigmas=…`), the staging
lines are IDENTICAL across arms (TE 25882 MB/p0 · DiT 19995 MB/**208 patches
attached** · aVAE 576 MB/p0 — the 208 = the LoRA's full module count, engine-
side proof of complete attachment; zero `NOT LOADED` warnings all set), and the
harm screen for arm 3 came back clean (no collapse, no silent audio, no
tracker loss) — so the pre-registered arm-3b contingency (native-base
operating point) was **not triggered**.

## 1. The board and the operating points (with the two disclosures)

| Cell | Prompt (all verbatim-established) | Basis |
|---|---|---|
| B1 low | Set C P1 verbatim (ball, slow short roll) | the batch's board |
| B2 med | Set C P2 = tranche-1 PROMPT_A verbatim (woman stirring, push-in) | Set B canary board |
| B3 high | Set C P3 verbatim (ball, brisk full traverse) | the batch's board |
| B4 naive-low | D3/X5 NAIVE P1 verbatim (one-liner) | X5's established bare arm |
| B5 naive-med | D3/X5 NAIVE P2 verbatim | as B4 |
| B6 naive-high | D3/X5 NAIVE P3 verbatim | as B4 |

Geometry 960×544×39f (audio rows 65 = round(39·5/3) — the phase-exact class),
seed 421337, no CFG anywhere, plan-error on the four ball cells (Set C's
operationalization, plans declared in the roster).

**Disclosure 1 — the board resolution.** The registration says "6 board
prompts (the batch's established X-board prompts — the same board Set C ran;
do not invent new ones)". Set C's board is 3 prompts; the X-family corpus's
six established texts are Set C's board (B1–B3) plus X5/D3's NAIVE one-liners
on the same board content (B4–B6, `d0_prompts.py` verbatim). Six established
texts, zero invention, matching the registered 6×3×1 arithmetic — and the
rich/bare split is a real axis for a shipping-lane decision. If the maintainer
reads the registration differently, the re-run surface is 3 prompts × 3 arms.

**Disclosure 2 — the `pdmd` trigger prefix.** The registration and dispatch
both pin "…`pdmd` trigger prefix prepended to the prompt (per the card)". The
prefix could **not be found in any upstream artifact**: not the Iwannapose
conversion README, not the pdmd2026 upstream card, not the ZeamoxWang/pdmd
inference code or job JSON (prompts pass verbatim, `prompt=job.prompt`), not
the project-page gallery data (prompts start `[Shot 1] Live-action…`), not the
arXiv HTML. Executed as registered (`"pdmd, " + prompt` — "execute, do not
re-derive"), with this flag: if the prefix is a no-op token it is mild noise
on every PDMD cell; if PDMD underperforms, this is the first confound to strip
in any confirmation run.

**Operating-point note (recorded, not changed):** arm 1's file is the 768p-line
LoRA (`…_v1.0_768p_…`) whose training shift is 6/3 per the LightX2V card (Set A
BOM recorded the same); the registration pins 12/3 for all arms, so the
incumbent runs off its native schedule at a 544p canvas. Registered design
executed; disclosed so the eye can weigh it.

## 2. The primary contrast — PDMD-4 vs turbo-8 (the displacement question)

Paired cells (same seed, same prompt; PDMD numbers first):

| Cell | plan RMSE PDMD / turbo-8 (success) | HF ratio | alternation ratio | pixel PSNR / dE |
|---|---|---|---|---|
| B1 low | **1.90 / 5.11** (T/T) | 2.68 | 3.74 | 19.6 dB / 12.5 |
| B2 med | n/a (no plan) | 1.02 | **0.33** | 15.3 dB / 21.6 |
| B3 high | **5.09 / 12.87** (F/F) | 1.87 | 1.28 | 20.8 dB / 11.4 |
| B4 naive-low | 8.35 / **7.82** (F/T) | 1.98 | 3.12 | 17.4 dB / 15.5 |
| B5 naive-med | n/a | 1.49 | 1.23 | 15.2 dB / 23.7 |
| B6 naive-high | **4.92 / 26.16** (T/**F**) | 2.41 | 0.63 | 12.8 dB / 27.8 |

- **Motion-following at half the NFE: PDMD wins 3 of 4 plan cells**, including
  two cells where the incumbent outright fails (B3 both fail success but PDMD
  halves the error; **B6 — the incumbent's catastrophic cell at 26.2 RMSE —
  PDMD lands at 4.9 with a clean success**). The one loss (B4) is a 7% margin
  at the success boundary, not a collapse.
- **Temporal stability splits by prompt class**: PDMD is 3× cleaner than
  turbo-8 on the rich face prompt (B2 alternation 0.33×) and 1.6× cleaner on
  B6, but 3-4× flicker-ier on the ball cells (B1/B4) — the HF ratios (1.9–2.7×)
  say PDMD renders much more high-frequency energy on static scenes, and the
  alternation pairing says some of that energy is temporal. **Sharpness or
  fry — the metric cannot tell; this is exactly what p02–p07 put to the eye.**
- **Face/identity (B2, vs the base-20 canonical render):** ArcFace 0.176 (PDMD)
  vs 0.427 (turbo-8) vs 0.360 (turbo-4) — PDMD's face render is the most
  divergent from the canonical class (Set A's calibration band put 0.27–0.63 in
  the "same-ish identity, different render" class; 0.176 sits below it), while
  its face-color dE is the *closest* (27.4 vs 30.2). Mixed metric signal,
  escalated to the eye, not verdicted here.
- **Renders are materially different everywhere** (PSNR 12.8–20.8 dB) — as with
  X6's grid finding, same seed + different LoRA = different image class; the
  pairs are genuine A/B choices, not spot-the-difference.

## 3. Attribution — PDMD-4 vs turbo-4 at matched 4 NFE (secondary), and the incumbent-line context

| Cell | plan RMSE PDMD / turbo-4 (success) | HF ratio | alternation ratio |
|---|---|---|---|
| B1 low | **1.90 / 2.38** (T/T) | 2.35 | 1.60 |
| B2 med | n/a | 1.08 | **0.25** |
| B3 high | **5.09 / 5.66** (F/F) | 1.79 | 1.10 |
| B4 naive-low | **8.35 / 10.99** (F/T) | 2.08 | 2.29 |
| B6 naive-high | **4.92 / 9.28** (T/T) | 2.72 | 1.85 |

**At matched NFE the PDMD method beats the official 4-step turbo on motion in
4/4 plan cells** (margins 14–47%) — the displacement question's gains are
PDMD-the-method, not 4-steps-the-regime. The alternation picture repeats:
cleaner on the face prompt (0.25×), flicker-ier on the ball cells.

Context arm (turbo-4 vs turbo-8): the official 4-step holds HF within ±14%
(0.89–1.14) and beats its own parent on the two high-motion ball cells the
parent fails (B6: 9.28 vs 26.16) while losing small elsewhere — the incumbent
line's 8-step advantage at this board is thin, which is itself a finding about
the king's crown.

## 4. The six audio metrics at 4 NFE (pre-registered secondary)

Operationalization (disclosed): the batch's prior stack carried treble +
join-correlation; join is splice-specific (no splices here), so the six-metric
battery is treble_ratio, spectral_centroid, rolloff85, RMS-dBFS, spectral
flatness, zero-crossing rate (16 kHz mono, numpy, deterministic; A5-null
convention). Per-arm means:

| Arm | rms dBFS | centroid Hz | rolloff85 Hz | treble | flatness | zcr /s |
|---|---|---|---|---|---|---|
| turbo-8 | −38.1 (wide: −53.1…−16.4) | 843 | 494 | 0.0079 | 0.166 | 815 |
| turbo-4 | −31.5 | 657 | 398 | 0.0092 | 0.110 | 672 |
| PDMD-4 | −30.9 | 984 | 579 | 0.0111 | 0.188 | 933 |

Paired PDMD−turbo-8 means: **+7.2 dBFS louder**, +141 Hz centroid, +85 Hz
rolloff, +0.0032 treble, +0.021 flatness, +119 zcr/s. Against turbo-4 the
level gap vanishes (+0.6 dB) and what remains is timbre: PDMD is brighter
(+327 Hz centroid, +180 Hz rolloff, +262 zcr/s). Reading, proposed: **no
4-NFE audio collapse on any arm** (nothing near silence except where the
prompt asks for it — turbo-8's −53 dB on B1 is its "quiet room tone… then
silence" cell, arguably the *correct* read), and PDMD's audio is
audibly hotter/brighter rather than degraded — the paper's "audio held at 4
steps" claim is **not contradicted** on our stack, with the caveat that
loudness/brightness differences are content judgments the ear should make on
`pairs/p*_L/R.mp4` (the strips are silent; the native mp4s carry audio).

## 5. Wall-clock economics (measured; the shipping-lane column)

| Arm | NFE | sampling mean (warm) | wall mean | peak VRAM |
|---|---|---|---|---|
| turbo-8 v1.0 | 8 | 28.3 s | 35.8 s | 24153 MiB |
| turbo-4 v0.1 | 4 | 18.9 s | 28.1 s | 24149 MiB |
| PDMD-4 v6 | 4 | **18.5 s** | **27.1 s** | 24153 MiB |

Half the NFE buys **0.65× the wall** (TE-encode + VAE-decode fixed costs
dominate at 39f), not 0.5×. VRAM flat at ≈24.15 GB on every arm — the
weight-function LoRA attach adds no measurable peak. For the ledger's cost
model: 544p-class 39f at 4 NFE ≈ 18.5 s sampling warm; at 8 NFE ≈ 28.3 s
(turbo path; Set C's X6 turbo-8 measured 29.5 s — consistent).

## 6. Statistics layer (honest label)

Confirmatory family = the one pre-registered primary (PDMD-4 vs turbo-8, the
maintainer's blind forced-choice — the eye is the decision layer). Automated
side, sign tests at n=6 cells (n=4 plan): PDMD plan-wins 3/4 (p 0.31);
PDMD HF-higher 6/6 (p 0.016 — direction consistent, but HF is
sharpness-or-fry, not a quality endpoint); alternation splits 2/4 cleaner
(p 1.0); audio louder 6/6 (p 0.016, content-axis). Nothing carries a ship
decision without the eye; the pre-registered decision rule is the
maintainer's calls on p02–p07.

## 7. The review surface (Amendments 1 + 4 + 7, delivered)

`gpu-review/setP/` — open **`review.html?set=P`**: **19 blinded pairs** (L/R
by sha256; `pairs/.key` escrowed with pre-registered expectations, sealed
until the maintainer's calls are exported), `pairs-metadata.js` carrying the
Amendment-7 block on **every** pair — the question in maintainer terms, the
ONE judging criterion, the side-randomization note, and the null wording on
p01 ("identical content expected — any flicker or divergence is a TOOLING BUG,
report it"). p01 null (PDMD duplicate through the alias) **PASSED**: run-time
framemd5+audio-md5 identical, instrument verifier 0/0 L/R differences; all 18
treatment pairs differ on 39/39 frames (no accidental duplicates; every strip
pixel-exact against sequential decode). Frames 84 MiB (inside the ~220 MiB
guidance — 39-frame pairs, no setD-style overage). `runs/` carries all 21
videos + the machine manifests.

**The verdict scaffold (the maintainer's calls land here):**

| Pair | Contrast (blinded until key open) | Pre-registered expectation | Automated battery | Maintainer's call |
|---|---|---|---|---|
| p01 | **null: PDMD duplicate through alias** | **TIE** | **bit-identical (0 px diff)** | _pending_ |
| p02–p07 | **PDMD-4 vs turbo-8 × 6 cells** | the displacement question | plan 3/4 PDMD; B2 alternation 0.33×; ball HF 1.9–2.7× (sharp-or-fry) | _pending_ |
| p08–p13 | PDMD-4 vs turbo-4 (matched NFE) × 6 | attribution | PDMD plan 4/4; face cells cleaner, ball cells flicker-ier | _pending_ |
| p14–p19 | turbo-4 vs turbo-8 × 6 | the regime's cost on the incumbent line | HF ±14%; B6 the incumbent's failure cell | _pending_ |

**Eye-critical pairs:** p04 (B2, the face cell where metrics say PDMD is 3×
cleaner AND most identity-divergent — the sharpest metric tension in the set),
p07 (B6, the incumbent's catastrophic ball cell), p01 (the tooling gate).

## 8. Exit-criteria self-assessment

| Ledger exit criterion | Status |
|---|---|
| 3 arms × 6-prompt board × 1 seed executed on the registered operating points | **MET** — 18 arm gens + null + 2 canaries; knots machine-asserted at emission AND in the engine log (19/19 turbo-family runs digit-for-digit) |
| Null pair gates the review | **MET** — bit-identical run-time + 0 px through the instrument |
| Arm-3b contingency (misbehavior) | **NOT TRIGGERED** — harm screen clean (no collapse/silence/tracker loss); lowest HF ratio vs turbo-8 = 1.02 |
| The six audio metrics at 4 NFE | **MET** — §4; no collapse; loudness/brightness differences flagged for the ear |
| Wall-clock per gen | **MET** — §5 (18.5 s warm sampling @ 4 NFE vs 28.3 @ 8) |
| Amendment 7 metadata on every pair | **MET** — question/judge/sides on all 19; null wording on p01 |
| No test sets in git | **MET** — heavy media on disk only; git carries doc + metadata + key |

## 9. Deviations, disclosures, and notes

1. **Board resolution** (6 prompts from the X-family corpus) — §1 disclosure 1.
2. **The `pdmd` prefix is not in any upstream artifact** — §1 disclosure 2;
   executed as registered. First confound to strip in any confirmation.
3. **LoRA attach node:** stock `LoraLoaderModelOnly`, not
   `MiniMaxH3TurboLoRA`. Found at graph-build: the custom node's key map
   double-prefixes `diffusion_model.` for conversion-format files (their keys
   already carry it) → **silent zero-adapter no-op**; the stock node is the
   conversion card's prescribed loader and its `add_patches` weight-function
   path applies the delta in fp32 over the dequantized int8 weight (fc2
   included). Engine-side proof of full attachment: 208 patches staged on
   every arm, zero `NOT LOADED` warnings, and a driver-side guard now scans
   for them. **Repo-wide implication:** any LightX2V/PDMD-conversion-format H3
   LoRA must ride the stock loader; the custom node remains correct for the
   larryvrh PEFT-format files (Set C X6 lineage).
4. **Six-audio-metric battery operationalized here** (prior stack: treble +
   join only) — §4.
5. **Arm 1 runs the 768p-line LoRA at 544p/shift-12** per the registration
   (its native card shift is 6/3) — §1 operating-point note.
6. **The canonical verifier hard-codes p07 as the null** (setC-era layout);
   Set P's null is p01 (and Set D's were p01/p02 — the same friction). Ran the
   identical checks through a set-local runner with the null pid declared
   (`scripts/p4_verify.py`); the instrument page itself untouched per
   Amendment 4. A one-line parameterization of the shared verifier would
   retire this friction — noted for the maintainer, not done unilaterally.
7. **plan-success semantics:** B3's success band is strict (end-x within
   [70,80] plus >5% travel); both 8-NFE and 4-NFE arms miss it at high motion —
   RMSE deltas, not the binary, carry the contrast there (declared, as in
   Set C).
8. **GPU use:** 12.1 min across 21 gens; `/free` at three phase boundaries
   (post-arm1, post-arm2, post-canary-mid; VRAM back to 715/711 MiB
   residency before each reload); final teardown below.

## Addendum — teardown + handoff state (2026-10-04)

`/free` posted → SIGINT 3937245 (two absorbed, as in Set D's teardown) →
SIGTERM → process exited → **nvidia-smi verified at the 302 MiB baseline, no
orphan processes.** A second set (X7) follows; the
controller relaunches the testbed per the clean-state discipline. Canary
state for continuity: both setP canaries bit-identical to Set B r9 (the
canonical at `/home/agent/comfyui/output/setB/r9_canonical_00001_.mp4`
survives on disk); the next set's canary should keep using it plus a fresh
alias pair (`__setX7alias` etc.).

## Addendum — the maintainer's review is the remaining human step

The 19-pair surface is live (`gpu-review/setP/review.html?set=P`); the key
stays escrowed until the calls are exported. Per §1.4b, any disagreement
between the eye and the automated reads escalates as a protocol event — the
pre-registered tension to watch is p04 (metrics: cleaner-but-more-divergent
face) and the HF axis overall (is PDMD's 2× high-frequency energy sharpness
or fry?).
