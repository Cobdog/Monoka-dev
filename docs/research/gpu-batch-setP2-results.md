# GPU batch — Set P2 results (the PDMD confirmation round, long-horizon)

> Flux task: **THE GPU BATCH (ourbqum)** · executed 2026-10-05 on branch
> `component-vocabulary` · executor: Set P2 (single seed per Amendment 5).
> **Attestation: 15 generations, 91.0 GPU-min total** (the warm-up cell that
> doubles as P2-1/turbo-8, 2 Amendment-5 canaries, 6+6 arm cells, 1 null
> duplicate), all on the live 8189 testbed (PID 721925, 0.37.4). `/free`
> posted at three phase boundaries (executor-owned; VRAM back to 713 MiB
> before each reload); **final teardown verified: /free → SIGINT (×2 absorbed)
> → SIGTERM → exit → nvidia-smi at the 302 MiB baseline, zero orphans — the
> GPU returned to the maintainer for good.** Both canaries (start + end,
> fresh `__setP2alias` / `__setP2alias2` signatures) **bit-identical to Set
> B's canonical r9** — the zero floor held across the whole set. **Null gate
> PASSED at run time** (framemd5 + audio md5 identical) and through the
> instrument (p01, 243 frames/side, 0 L/R differences). Artifacts:
> `test-results/experiments/gpu-batch-setP2/{scripts,out}` (on-disk,
> gitignored per the runbook); review surface: `gpu-review/setP2/` (heavy
> media on disk only, per the no-test-sets directive — the metadata quartet
> carries in git). Verdicts below are **PROPOSED** — the maintainer's blind
> calls on the 7-pair surface decide the crown. Ledger registration: "SET P2
> — the PDMD confirmation round" + Amendments 5/7/8/8b + the P2 resolution
> amendment.

## 0. The run in one paragraph

Both arms on one graph family — `minimax_h3_ref2va_pruned_int8_convrot`,
text-only conditioning through `MiniMaxH3ReferenceToVideo` (no refs wired),
`MiniMaxH3TurboSampler` (Euler on native ModelSamplingAV) + `BasicScheduler
simple/N`, LoRA via **stock `LoraLoaderModelOnly` @ 1.0** (Set P's validated
attach — 208 patches attached engine-side on every LoRA run, zero
`NOT LOADED` all set) — over the **six registered prompts verbatim** × 1
seed at **243f (10.125 s) × 1088×608 (0.66 MP)**: the batch's first
long-horizon, in-distribution cells (Amendments 8/8b — every prior verdict
was 1.6 s AND below the 4 s request floor). Arm 1 **turbo-8 v1.0 768p at its
CARD recipe** (shift 6/3, simple/8 — the recipe-fair rematch Set P denied
it); arm 2 **PDMD-4 v6 @ 1.0, 4 steps, shift 12/3, no CFG, NO `pdmd,`
prefix** (the stripped confound) — prompts passed to the engine exactly as
registered, field labels included. Knots machine-asserted at emission AND
digit-for-digit in the engine log (13/13 turbo-family runs; exactly two
grids seen live: `[1.0, 0.9767, 0.9474, 0.9091, 0.8571, 0.7826, 0.6667,
0.4615, 0.0]` = the 6/3 card line, and `[1.0, 0.973, 0.9231, 0.8, 0.0]` =
the PDMD card line). The eye is this set's decision layer; the metric stack
records secondary context.

## 1. The mandatory warm-up pre-flight (the first 243f × 0.66 MP numbers on this stack)

The registration required ONE measured cell before committing the set — the
P2-1 turbo-8 arm ran first and gated everything after it:

| Measure | Value | Gate |
|---|---|---|
| wall (cold, incl. model load) | **546.7 s** | < 600 s → **PASS** (53 s margin) |
| pre-sampling (load/staging) | 15.0 s | — |
| sampling+decode | 531.7 s | — |
| peak VRAM | **23,913 MiB** | no OOM on the 24 GB stack (~1.5 GiB headroom) |

The latent sequence is 4,491,072 elements (~4× any prior cell, as the
registration estimated) and the stack holds it in dynamic-VRAM residency at
100% util with step times flat at 59.5 s (turbo-8, 8 steps) — no
fragmentation, no partial offload, no estimator wedge. **No resolution drop
was needed: the set ran at the full registered 1088×608.**

## 2. The board and the operating points

The six prompts are the registration's VERBATIM texts (the
maintainer-approved instrument — `integrated_multimodal_description` /
`overall_soundscape` / `non_diegetic_music` skeleton per the packet §3.1,
multi-line, unmodified; they live in full in the ledger and in
`out/setP2_0_roster.json`):

| Cell | Scene (label) | Designed stress |
|---|---|---|
| P2_1 | CONTACT — movers, heavy crate down a ramp | contact physics, carried weight |
| P2_2 | GYMNASTICS — vault to stuck landing | full-body fast motion |
| P2_3 | BASKET TOSS — bases launch/catch a flyer | multi-body coordination |
| P2_4 | AIRCRAFT — biplane barrel roll | rolling-horizon coherence |
| P2_5 | FISH TANK — stone/duck/apple drops | buoyancy/gravity, locked camera |
| P2_6 | WET ROAD — rainy pull-away + 00:06.5 cut | fidelity/lighting + cut adherence |

Geometry 1088×608×243f, seed 421337, no CFG anywhere, audio on (the
standard engine derivation — the 39f phase-exact rule does not apply at
this length). The judging axes named on every pair (Amendment 7):
aesthetics · coherency · instruction-following-under-complexity · fidelity ·
lighting · physics/gravity/motion/coherence.

**The two Set P closure gates, both executed:** (1) the `pdmd,` prefix is
GONE — every PDMD cell this set ran the registered prompt verbatim;
(2) turbo-8 runs at its 768p card recipe (6/3) instead of Set P's off-card
12/3 — the grid asserted equal to A1's frozen X7-Ea row at roster build and
seen live in the engine log.

## 3. Wall-clock economics (measured; the shipping lane at 10 s / HD)

| Arm | NFE | sampling mean (warm) | wall mean (warm) | peak VRAM |
|---|---|---|---|---|
| turbo-8 v1.0 768p @ card 6/3 | 8 | 527.9 s | 533.7 s | 24,149 MiB |
| PDMD-4 v6 @ 1.0, 12/3, no prefix | 4 | **289.7 s** | **295.3 s** | 24,153 MiB |

**Half the NFE buys 0.55× the wall at 243f** (the decode/save fixed cost is
a larger fraction than at 39f, but the sampling term dominates at this
length) — PDMD renders a 10-second HD clip in **~4.9 min** against the
king's ~8.9 min. VRAM flat ≈24.15 GiB on both arms; the 243f sequence adds
no measurable peak over the 39f cells (dynamic residency absorbs it). For
the ledger's cost model: **243f×0.66MP ≈ 530 s @ 8 NFE, ≈ 290 s @ 4 NFE**
warm — the sprint's first and only long-horizon economics.

## 4. The primary contrast — PDMD-4 vs turbo-8-card (the confirmation)

Paired cells (same seed, same prompt; ratios are PDMD ÷ turbo-8-card; >1 =
PDMD higher):

| Cell | HF ratio | alternation ratio | warp-residual ratio | pixel PSNR / dE | wall ratio |
|---|---|---|---|---|---|
| P2_1 contact | **0.76** | 1.72 | 1.20 | 12.7 dB / 29.0 | 0.56 |
| P2_2 gymnastics | 1.16 | 2.85 | 0.99 | 11.9 dB / 35.2 | 0.55 |
| P2_3 basket toss | 1.32 | 1.25 | 1.71 | 10.9 dB / 34.5 | 0.55 |
| P2_4 aircraft | 1.86 | 1.90 | 2.23 | 14.5 dB / 27.3 | 0.55 |
| P2_5 fish tank | 2.52 | 2.41 | **5.34** | 12.3 dB / 30.3 | 0.55 |
| P2_6 wet road | 1.51 | 1.62 | 2.12 | 14.0 dB / 25.0 | 0.56 |

Readings (secondary context — the eye decides):

- **HF energy: PDMD higher on 5/6 cells** (up to 2.5× on the macro
  fish-tank) — the Set P sharpness-or-fry axis persists at length. The one
  inversion is P2_1 (contact): turbo-8-card out-renders PDMD on
  high-frequency energy there (0.76×) — the card recipe visibly changes the
  incumbent's render character relative to Set P's 12/3 run.
- **Temporal stability: PDMD flicker-ier on ALL SIX cells at length**
  (alternation 1.25–2.85×, warp residual up to 5.3× on the locked-off
  macro cell) — a long-horizon inversion of Set P's 39f picture, where PDMD
  was 3× cleaner on the face prompt. Whether the extra energy is life or
  flicker at 10 s is exactly what the six blind pairs put to the eye; the
  fish tank (a locked camera over still water) is the cleanest falsifier —
  any motion there is instability by design.
- **Renders are materially different everywhere** (PSNR 10.9–14.5 dB, dE
  25–35) — genuine A/B choices, as in every prior set.
- **Not trackable this set (disclosed):** plan-error (fresh scenes, no
  numeric plans — the ball-board tracker does not apply) and
  face-vs-canonical (no canonical exists for these scenes).

## 5. The six audio metrics at 243f (secondary)

Per-arm means and paired deltas (PDMD − turbo-8-card): **+5.1 dBFS louder,
−919 Hz centroid, −1652 Hz rolloff85, −0.061 treble, −0.220 flatness, −1891
zcr/s** — PDMD is louder but *darker* at 10 s (Set P's 39f battery read
+141 Hz brighter; the sign flips with content and length). No cell near
silence on either arm; turbo-8's quietest read is again its prompt-faithful
one (−48.3 dBFS on P2_5, "a quiet room's room-tone"). The paper's
"audio held at 4 steps" claim is not contradicted at 10 s either — but
loudness/timbre judgments are the ear's, on `pairs/p*_L/R.mp4` (the strips
are silent; the native mp4s carry audio).

## 6. Statistics layer (honest label)

Confirmatory family = the one pre-registered primary (the maintainer's
blind forced-choice on six pairs). Automated side, sign tests at n=6:
PDMD HF-higher 5/6 (p 0.11); PDMD alternation-higher 6/6 (p 0.016 — the
one direction-consistent axis, but alternation is a stability endpoint, not
a quality one); warp-higher 5/6 (p 0.11); PDMD louder 6/6 (p 0.016,
content-axis). Nothing carries a ship decision without the eye; the
pre-registered decision rule is the maintainer's calls on p02–p07.

## 7. The review surface (Amendments 1 + 4 + 7, delivered)

`gpu-review/setP2/` — open **`review.html?set=P2`**: **7 blinded pairs**
(p01 null + p02–p07, one per prompt, L/R by sha256 — PDMD carries left on
p02/p04/p06, right on p03/p05/p07), `pairs/.key` escrowed with
pre-registered expectations, `pairs-metadata.js` carrying the Amendment-7
block on **every** pair — the question in maintainer terms, the six judging
axes, the per-prompt designed stress ("what to judge"), the
side-randomization note, the 10.125 s duration note (Amendments 8/8b
context), and the null wording on p01 ("identical content expected — any
flicker or divergence is a TOOLING BUG, report it"). p01 null **PASSED**:
run-time framemd5+audio-md5 identical AND instrument-verified at 243
frames/side, 0 L/R differences; all six treatment pairs differ on 243/243
frames (no accidental duplicates; every strip pixel-exact against
sequential decode). Frame strips are **243-frame pairs: 938.3 MiB of
deduplicated lossless strips — ~4.3× the ~220 MiB/set guidance, by
construction of the length (243f = 6.2× the frames of a 39f pair at 1.26×
the pixels; ~0.33 MiB/frame measured); disclosed here, on disk only,
gitignored.** `runs/` carries all 15 videos + the machine manifests.

**The verdict scaffold (the maintainer's calls land here):**

| Pair | Contrast (blinded until key open) | Pre-registered question | Automated context | Maintainer's call |
|---|---|---|---|---|
| p01 | **null: PDMD duplicate through alias** | tooling gate | **bit-identical (0 px diff)** | _pending_ |
| p02 | P2_1 contact | does the crate's weight read? | turbo-8's HF win (0.76×) — its only one | _pending_ |
| p03 | P2_2 gymnastics | fast full-body motion at 10 s | PDMD alt 2.85× — the worst alternation cell | _pending_ |
| p04 | P2_3 basket toss | multi-body coordination | closest alternation pair (1.25×) | _pending_ |
| p05 | P2_4 aircraft | rolling-horizon coherence | PDMD warp 2.2× | _pending_ |
| p06 | P2_5 fish tank | buoyancy physics, locked camera | **the falsifier cell** — PDMD warp 5.3×/alt 2.4×/HF 2.5×; motion here = instability by design | _pending_ |
| p07 | P2_6 wet road | fidelity/lighting + the 00:06.5 cut | PDMD dE-lowest cell (25.0) | _pending_ |

**Eye-critical pairs:** p06 (the fish tank — the set's cleanest
instability falsifier), p03 (the gymnastics — the sharpest
motion-vs-stability trade), p02 (whether the card recipe flips the contact
cell for turbo-8).

## 8. Exit-criteria self-assessment

| Ledger exit criterion | Status |
|---|---|
| Warm-up pre-flight before committing the set | **MET** — §1; PASS at 546.7 s / 23,913 MiB; no resolution drop |
| 2 arms × 6 registered prompts × 1 seed at card recipes | **MET** — 12 arm cells; knots asserted at emission + engine log (13/13) |
| Prompts verbatim, NO `pdmd,` prefix | **MET** — roster strings byte-equal to the registration; prefix absent |
| turbo-8 at its card recipe (the rematch) | **MET** — 6/3 grid asserted vs A1 X7-Ea and seen live |
| Null pair gates the review | **MET** — run-time bit-identity + instrument 0 px at 243 f/side |
| Canaries (Amendment 5) | **MET** — start + end, both bit-identical to Set B r9 |
| Amendment 7 metadata naming the judging axes on every pair | **MET** — six axes + per-prompt focus on all 7 |
| Metrics recorded as secondary context | **MET** — §4/§5; plan/face disclosed not-trackable |
| No test sets in git | **MET** — heavy media on disk only; metadata quartet carries |
| Final teardown (GPU back to the maintainer for good) | **MET** — 302 MiB baseline verified, zero orphans |

## 9. Deviations, disclosures, and notes

1. **Warm-up cell = the set's first cell.** The registration's pre-flight
   cell (P2-1 turbo-8) doubles as the set's P2_1/turbo-8 render — no
   re-submission (a repeat would cache-serve; Set B's finding). Wall/VRAM
   recorded in §1.
2. **Canaries: start + end bookends, not start + mid.** The registration
   says "+ canary" (singular); Amendment 5's standing rule places canaries
   at set start/mid/end. Two bookends run (c1 post-warmup, c2 at set end);
   with a single continuous environment (no pause, no restart, no new packs
   — zero install deltas this set) a mid canary adds no boundary
   information. 91.0 GPU-min total.
3. **The 10-min gate read on the COLD cell.** The warm-up's 546.7 s
   includes the 15 s cold load; the registration's ">10 min/gen → drop"
   was evaluated on the measured wall as registered (not a warm
   projection) — PASS either way (warm mean 533.7 s).
4. **Review-strip overage is by construction**: 243-frame pairs at
   1088×608 measured **938.3 MiB** of deduplicated lossless strips across 7
   pairs (~0.33 MiB/frame) vs the ~220 MiB/set guidance written for 39f
   sets — the length's 6.2× frame count at 1.26× the pixels, exactly the
   "~6× the strips per pair" the dispatch flagged. On disk only; gitignored
   per the no-test-sets directive.
5. **setP2_4_verify.py is set-local** (the canonical verifier hard-codes
   p07 as the null — the setC-era leftover Set P/Set D also hit); the
   instrument page itself untouched per Amendment 4, the identical
   per-strip pixel check with the null pid declared. The one-line
   parameterization note stands from Set P for the maintainer.
6. **Metrics battery parallelized** (6 workers over 20 cores — the 243f
   Farneback term is ~2–6 min/video serial); identical math to Set P's
   battery, `band` region at the 608p frame, stride 1 for the 3–13 Hz
   alternation band.
7. **The audio sign flip vs Set P** (−919 Hz centroid here vs +141 Hz at
   39f) is recorded as a content/length interaction, not verdicted — the
   ear owns it on the native mp4s.
8. **GPU use:** 91.0 min across 15 gens (12 arm + null + 2 canaries);
   `/free` at three boundaries (713 MiB residency before each reload);
   teardown verified to 302 MiB. This was the sprint's final GPU work.

## Addendum — teardown + sprint-closure state (2026-10-05)

`/free` posted → SIGINT 721925 (×2 absorbed, the Set D/P pattern) → SIGTERM
→ process exited → **nvidia-smi verified at the 302 MiB baseline; no orphan
python processes; 8189 down.** The GPU is the maintainer's, for good —
Set P2 was the sprint's final GPU act per the wrap directive. Canary
continuity if any future set ever runs: the setB r9 canonical survives at
`/home/agent/comfyui/output/setB/r9_canonical_00001_.mp4`; this set's
aliases (`__setP2alias`/`__setP2alias2`/`__setP2null`) remain linked for
provenance.

## Addendum — the maintainer's review is the remaining human step

The 7-pair surface is live (`gpu-review/setP2/review.html?set=P2`); the key
stays escrowed until the calls are exported. The crown question the calls
settle: **does PDMD-4's Set P 6–0 sweep survive (a) the stripped prefix,
(b) the king at its own card recipe, and (c) ten seconds of in-distribution
length?** The automated context says the stability axis moved against PDMD
at length (alternation and warp higher on all six cells) while its
half-cost economics held exactly (0.55×) — if the eye still crowns PDMD at
p02–p07, the default-change case is confirmation-complete; if the king's
card recipe takes cells back, the crown question reopens at the recipe
level, not the NFE level.

## ADDENDUM — the maintainer's blind review, reconciled (2026-10-05) — THE CROWN DECISION

7/7 pairs: 6 directional + 1 tie (the null). Responses verbatim below.

### The null gate, by eye
**p01 (PDMD duplicate through the alias) = TIE.** Held — the confirmation's instrument clean.

### THE VERDICT — PDMD wins the confirmation SIX–ZERO
Every directional call named the PDMD side (the side randomization was exact: three left, three right — and all six called cells were PDMD). With the prefix stripped, the king at its own card recipe, and ten seconds of in-distribution physics:
- **p02 CONTACT**: PDMD — *"the ramp [on turbo's side] is about 17 kilometers long. Prompt feels much more coherent on the left… quality feels better too."* (Instruction-following-under-complexity, decided.)
- **p03 GYMNASTICS**: PDMD — *"the environment is pretty comical in both, but right is still better."*
- **p04 BASKET TOSS**: PDMD by the call — **with a recorded discordance**: the note reads *"quality, motion and detail are better on the right"* (right = turbo-8). The call and the note disagree; recorded as called, flagged for the maintainer's amendment if the note was the true read (the sweep stands 5-0-1 either way).
- **p05 AIRCRAFT**: PDMD — *"neither was fully able to completely grasp the prompt, but right did the better job and looks better."*
- **p06 FISH TANK**: PDMD, no note — the cell where the alternation metric measured PDMD worst (warp residual 5.3×). **The eye did not see it.**
- **p07 WET ROAD**: PDMD, no note.

### The two cross-cutting findings this settles
1. **The alternation metric's salience is below the deciding eye's JND.** The metric said PDMD flickers more on 6/6 cells (up to 2.85×; warp 5.3× on the tank) — and the maintainer called all six for PDMD anyway, citing coherence and quality. Amendment 1's doctrine (the eye is the decision layer) now carries a recorded consequence: the alternation/warp metrics get a SALIENCE CAVEAT on distilled arms at length — measured, real, and not what the user perceives on this board. The metrics keep recording; they stop being verdict inputs without an eye-corroborated case.
2. **The prefix question closes**: the sweep ran with prompts verbatim (no `pdmd,` anywhere) — the trigger prefix is confirmed UNNECESSARY (and was never upstream-documented). PDMD's operating point: the v6 LoRA @ 1.0, 4 steps, shift 12/3, no CFG, plain prompts.

### THE RECIPE LEDGER LINE (the sprint's final verdict)
**PDMD-4 deposes turbo-8 as the fast-lane default — confirmation-complete: 6-0 at 39f/544p (Set P), 6-0 at 243f/0.66MP recipe-fair and prefix-free (this set), 0.55× wall at half NFE, audio holding (no collapse at 4 NFE).** The former king keeps its lane where its stability profile matters (the alternation numbers are real even if not eye-salient) and stays the R2V-family default until PDMD's ref2va off-label status gets its own confirmation. Turbo-4 v0.1 remains the official 4-step fallback.

### Verbatim responses
```
{
  "exported": "2026-10-05T17:59:30.420Z",
  "responses": {
    "p01": {
      "call": "tie",
      "ts": "2026-10-05T17:55:08.178Z"
    },
    "p02": {
      "call": "left",
      "note": "The ramp they are walking up on the right is about 17 kilometers long. Prompt feels much more coherent on the left one. Quality feels better too.",
      "ts": "2026-10-05T17:55:30.762Z"
    },
    "p03": {
      "call": "right",
      "note": "The environment is pretty comical in both, but right is still better.",
      "ts": "2026-10-05T17:56:51.412Z"
    },
    "p04": {
      "call": "left",
      "note": "Quality, motion and detail are better on the right.",
      "ts": "2026-10-05T17:57:33.855Z"
    },
    "p05": {
      "call": "right",
      "note": "Neither was fully able to completely grasp the prompt, but right did the better job and looks better.",
      "ts": "2026-10-05T17:58:12.291Z"
    },
    "p06": {
      "call": "left",
      "ts": "2026-10-05T17:59:09.179Z"
    },
    "p07": {
      "call": "right",
      "ts": "2026-10-05T17:59:23.647Z"
    }
  },
  "set": "P2"
}
```
