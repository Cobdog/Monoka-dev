# GPU batch — Set D results (the prompt/preset screens: D1 E-K3, D2 caption factorials, D3 X5, D4 preset ladder)

> Flux task: **THE GPU BATCH (ourbqum)** · executed 2026-10-04 on branch
> `component-vocabulary` · executor: Set D (single seed per cell, Amendment 5).
> **Attestation: 51 generations, 97.9 GPU-min** (16 H3-family incl. 3
> Amendment-5 canaries, 17 Krea2 image arms incl. 2 floor duplicates, 9
> SCAIL-2, 9 Wan-Animate-2), plus 2 recovered submissions after a staging
> repair (below). `/free` posted at every family change (executor-owned
> phases this set); **teardown verified: VRAM back at the 302 MiB baseline,
> no orphan processes**. All three canaries (start/mid/end, fresh
> `__setDalias` × control signatures) **bit-identical to Set B's canonical
> r9** — the zero floor held across the whole set INCLUDING the two new
> engines; the canary-stop rule never fired. Artifacts:
> `test-results/experiments/gpu-batch-setD/{scripts,out}` (on-disk,
> gitignored per the runbook); the review surface: `gpu-review/setD/`
> (committed). Verdicts below are PROPOSED — the maintainer's blind calls on
> the 26-pair surface are the decision layer.

## 0. The run in one paragraph

Every D cell ran on the registered operating points (D2's SCAIL stack =
the official template's at 8 steps per the registered ruling; Wan = the
official distilled recipe verbatim; D1 = E-K1's Identity-Edit builder on the
canonical install; D3/D4 = Set C's g_base BOM). Two staging defects were
found and fixed at execution time, both recorded: **8 of 9 Set D model
symlinks were broken** (relative targets written against the wrong parent —
enumerable, hence invisible to the dispatch's enumeration check, but the
first actual load failed) and `clip_vision_h` was never linked into the
canonical tree at all; all repointed to absolute targets mid-run (no new
bytes, same sha-verified files). After the repair the D2 block ran clean to
completion. The image-tier noise floor was measured for the first time:
**the two duplicate Krea2 renders are pixel-identical (SD_image = 0.0)** —
the zero-noise finding now covers the image path too.

## 1. D1 — reduced E-K3 (Krea 2 dial × prompt-discipline): **keep-lists NEUTRAL (the guide's rule stands); Krea2T is a measured NO-OP on our runtime; the likeness dial (ref_boost) is the only mover**

Board: E-K1's src1 (synthetic portrait, identity-critical coat edit verbatim)
on the corner grid `grounding_px {384,768} × ref_boost {1,4}` × 3 prompt
arms, src2 (scene) at dial center — single seed (Amendment 5), 17 gens
incl. 2 floor duplicates. Operating point: Identity Edit v1.2 @ 1.0 on
`krea2_turbo_int8_convrot`, Turbo 8 steps / CFG 1 / euler / simple (E-K1's
instruct recipe).

| Cell (src1) | ArcFace | coat class | edit-landed | coat dE | outside PSNR | outside dE |
|---|---|---|---|---|---|---|
| g384/r1 bare | 0.93440 | green | YES | 26.1 | 26.07 dB | 4.92 |
| g384/r1 keep-list | 0.93593 | green | YES | 26.0 | 26.17 dB | 4.80 |
| g384/r1 krea2t | 0.93440 | green | YES | 26.1 | 26.07 dB | 4.92 |
| g384/r4 bare | 0.93993 | green | YES | 25.2 | 27.80 dB | 3.60 |
| g384/r4 keep-list | 0.93917 | green | YES | 25.3 | 27.82 dB | 3.58 |
| g384/r4 krea2t | 0.93993 | green | YES | 25.2 | 27.80 dB | 3.60 |
| g768/r1 bare | 0.93623 | green | YES | 25.9 | 26.45 dB | 4.78 |
| g768/r1 keep-list | 0.93941 | green | YES | 25.9 | 26.62 dB | 4.60 |
| g768/r1 krea2t | 0.93623 | green | YES | 25.9 | 26.45 dB | 4.78 |
| g768/r4 bare | 0.94211 | green | YES | 25.3 | 28.12 dB | 3.50 |
| g768/r4 keep-list | 0.94228 | green | YES | 25.2 | 28.19 dB | 3.44 |
| g768/r4 krea2t | 0.94211 | green | YES | 25.3 | 28.12 dB | 3.50 |

- **Primary contrast (keep-list vs bare at matched dials):** |ΔArcFace| =
  0.0015 / 0.0008 / 0.0032 / 0.0002 across the four corners — every one
  far below the 0.02 practical floor (and SD_image measured 0.0, so the
  floor formula collapses to the practical value). Edit-landed 12/12 in
  both arms (never degraded). **Keep-lists are neutral on identity AND on
  edit-landing — neither the predicted harm nor any benefit.** The guide's
  dialect-swap rule ("bare instructions on Krea 2") is CONFIRMED as-is;
  the WEB-FILLED tag converts to MEASURED with no correction needed.
- **The Krea2T arm is bit-identical to bare** (px-sha equal on all 4
  corners; the review instrument independently shows p07/p08 at 0 L/R
  pixel differences). The pinned pack (v1.x, model-patch form) attaches
  but its wrapper never engages on the int8-convrot runtime — it skips
  cleanly on the layout it sees. **Registry verdict: Krea2T-Enhancer =
  inert on our quantized Krea 2; do not ship it as an adherence adjunct
  for the edit surface.** (Substitution note: the pinned pack ships no
  weighted-phrases encode node — the arm measured the enhancer patch
  itself, per the design's intent to measure the pack's adherence
  mechanism.)
- **Secondary (dial dominance):** ref_boost 1→4 buys +0.0055..+0.0059
  ArcFace at BOTH groundings and BETTER outside-region preservation
  (+1.7 dB, dE −1.3) — the likeness dial dominates everything the prompt
  arms do, by 2–4× their largest effect. grounding 384↔768 moves ArcFace
  ≤ 0.0022 (tie-class on this subject). The leak axis reproduces E-K1:
  26–28 dB outside-region fidelity (semantic regeneration, not local
  edit) — unaffected by prompt discipline.
- **Scene subject (src2, dial center):** the scripted edit-landed proxy is
  FALSE on all three arms (region dE 5.3 ≈ outside dE 6.4–7.2) — the
  addition edit regenerated the whole frame rather than compositing
  locally, consistent with E-K1's "edits are semantic regeneration"
  finding; whether a bowl is present at all is the p09 eye call (the
  proxy measures localization, not presence).

## 2. D2 — caption factorials (SCAIL-2 × Wan-Animate-2): **long > bare on both engines (directionally consistent, dose-monotone where measurable); the bare arm is confirmed prompt-poverty**

Board: 3 clips × 3 captions × fixed seed per engine (9+9). Clips: the two
OFFICIAL template assets (girl_eats_apple + drive_doll_street_dance,
downloaded verbatim from the Comfy-Org workflow_templates repo — the
ledger's "3 fixed clips" board does not exist yet (Set G's 8-clip board is
post-D), so the engines' own canonical material + the batch's Set C board
render c1_canary_start form the board; substitution disclosed) × the
official reference images (asian_model_in_white_clothes for SCAIL,
ref_doll_realistic for Wan — each engine's official pairing). Captions are
content-equivalent triplets {bare = "", short = one line, long = the
official packet-recipe structure} describing the same output.

**SCAIL-2** (official stack, 8 steps; ArcFace output-face vs
reference-image face; n = sampled frames):

| clip | bare | short | long | read |
|---|---|---|---|---|
| girl_eats | 0.191 | 0.072 | 0.159 | noisy, long ≈ bare |
| dance | **−0.020** | 0.079 | **0.086** | bare FAILS identity; long rescues it |
| board_p2 | 0.106 | 0.036 | **0.257** | long +0.15 over bare |

The dance bare cell is the sharpest prompt-poverty datum: with an empty
caption the replacement's face matches the reference at −0.02 (chance
level) and the output keeps the driving video's color signature
(lab-dist 3.3 vs 14.1 for long) — the engine defaults to the driving
person's appearance when given nothing. long > bare on 2/3 clips
(girl_eats −0.033 the exception), short < both on every SCAIL clip (a
one-liner is WORSE than nothing here — the short caption names a person
without binding attributes).

**Wan-Animate-2** (official distilled recipe):

| clip | bare | short | long | appearance: lab-dist to ref (lower=closer) |
|---|---|---|---|---|
| dance | 0.485 | 0.524 | **0.530** | ref 1.65–1.82 vs driving 31.1–31.3 |
| girl_eats | (no face detected) | — | — | ref 20.05–21.27 vs driving 73.8–74.7 |
| board_p2 | (no face) | (no face) | 0.004 | ref 3.22 (long) vs 23.4–23.9 (bare/short) |

**Motion-exclusion check PASSES on every Wan cell** — the output's
appearance follows the reference image (lab-dist 1.6–23) not the driving
video (31–75): no driving-appearance leak. The dance dose-response is
monotone (bare 0.485 < short 0.524 < long 0.530; long−bare = +0.045 ≈ +9.3%
relative — at the 10% floor). On girl_eats the doll's face is too small for
the detector (framing mismatch — the documented #1 Wan failure mode; the
clip is a medium close-up against a full-body reference), and on board_p2
the long caption is the only arm where the doll renders large enough to
detect at all — the caption materially moved shot scale.

**Verdict (proposed):** long > bare on BOTH engines on the identity
endpoint (2/3 + 1/3-strong cells; the third SCAIL clip noisy-negative);
the "≥ 9/12 consistent wins" threshold is unreachable at this n (the Set C
arithmetic note applies) — the direction is consistent, the size is
engine- and clip-dependent, and the maintainer's blind calls on p10–p17
carry the decision. **The WEB-FILLED caption contracts convert to
MEASURED with the official packet-recipe structure as both engines' VG-1
caption arm** (pending the eye's corroboration).

**Economics (the first published 24 GB wall numbers on our stack):**
SCAIL 81f @896×512: 350.7 s cold / **311.5–312.7 s warm**; 37f: 98–104 s.
Wan 81f @482×854: 303.3 s cold / **292.1 s warm**; 37f: 99–102 s. Peak
VRAM 23451–24165 (SCAIL) / 24159 (Wan) MiB — both fit the 24 GB stack
with no offloading collapse. SCAIL staging: engine 15881 MB staged, 1059
LoRA patches (lightx2v + DPO) attached every run.

## 3. D3 — X5, prompt-structure arms (naive / hand-written six-section / LLM-compiled): **structure matters MOST where the naive prompt fails (high motion: compiled −64% plan error); careful prose still beats all three structured arms at low motion; the compiler drifts set-dressing**

3 board prompts × 3 arms, single seed, X1 board/grid (960×544×39f,
res_multistep/simple/20, s12/3, seed 421337). All three arms
content-equivalent by construction (same shot content per cell); compiler
= GLM-5.3-flash (DeepSeek-class) given ONLY the naive line + the official
six-section contract, output pinned verbatim in
`d0_prompts.py`.

| prompt | arm | plan RMSE (%w) | end-x | HF | alternation | L* | ArcFace vs canonical |
|---|---|---|---|---|---|---|---|
| P1 low | naive | 6.385 | 28.6 | 0.632 | 0.070 | 55.7 | — |
| P1 low | hand6 | **4.658** | 30.8 | 0.865 | 0.031 | 75.2 | — |
| P1 low | compiled | 6.286 | 29.5 | 0.556 | 0.086 | 54.2 | — |
| P2 med | naive | n/a | n/a | 4.063 | 0.023 | 36.6 | **no face detected** |
| P2 med | hand6 | n/a | n/a | 3.394 | 0.012 | 36.1 | 0.232 |
| P2 med | compiled | n/a | n/a | 3.799 | 0.115 | 31.8 | 0.067 |
| P3 high | naive | **27.339** | 71.2 | 0.613 | 0.059 | 63.6 | — |
| P3 high | hand6 | 9.964 | 76.9 | 0.501 | **0.373** | 73.7 | — |
| P3 high | compiled | **9.832** | 80.3 | 0.447 | 0.155 | 70.6 | — |
| (board prose baseline, Set C X1-a) | | P1 1.367 / P3 12.737 | 32.7 / 90.5 | 2.14 / 1.96 | 0.024 / 0.024 | — | 0.771 (P2) |

- **Primary (compiled vs naive):** the decisive cell is P3 high motion —
  compiled 9.83 vs naive 27.34 plan RMSE (**−64%**, far beyond the 10%
  floor): a one-liner cannot carry a numeric traverse plan, the compiled
  contract can. P1 is tie-class (6.29 vs 6.39); P2 compiled −6.4% HF
  (sub-floor). **Compiled ≥ naive everywhere measured, decisively at high
  motion.** The ≥9/12 judge threshold again needs the eye (p18–p20).
- **The naive P2 render has NO detectable face** — the one-liner
  under-specifies shot design and the model chose a WIDE kitchen shot
  (the woman ~1/8 frame height). The structured arms' "medium shot,
  waist-up" language held the framing. **Prompt structure's largest
  single effect in this set is SHOT DESIGN, not texture** — a dimension
  the plan/HF endpoints only partially capture and the eye sees
  instantly.
- **Hand-written vs compiled:** near-tied on the adherence endpoints
  (P3: 9.96 vs 9.83) — the structure benefit is mostly the STRUCTURE,
  not the compiler's wording. But the two differ in drift: the compiler
  invented set-dressing ("rubber-like finish", "grey background wall",
  chestnut hair for P2 — it never saw the board's appearance spec) and
  its P1/P3 renders sit 18–20 L* darker than the board baseline; the
  hand-written arm held board content (P1 L* 75.2 vs board 73.6).
  **S5's value target: the compiler is worth its cost exactly where a
  naive user would under-specify (motion plans, shot design); a
  content-anchored compiler (one that sees the user's material) is the
  obvious next iteration — this set's compiler saw only the one-liner.**
- **Exploratory caution:** the structured arms did NOT beat the board's
  careful prose at LOW motion (hand6 4.66 vs prose 1.37) — at 544p, on
  this board, a well-written paragraph remains the adherence optimum;
  alternation is mixed (hand6 P3 0.373 = 13× board — the most verbose
  P3 render flickers).

## 4. D4 — H3 preset-ladder (T2VA preset vs stripped prose at 544p/768p): **no adherence rescue at the collapse rung; a large stability crossover — the preset cuts 768p face-flicker 26× but TRIPLES 544p/768p-ball alternation**

2 board prompts (P1 = the collapse sentinel, P2 = the identity/texture
sentinel — the two weakest axes at 768p per X2; P3 excluded because X2
measured 768p IMPROVING it) × preset (the h3-packet §6.1 workhorse
skeleton: style word + camera triplet + labeled soundscape) vs stripped
(the board prose verbatim) × {544p, 768p}, single seed. The stripped cells
REUSE Set C's renders (identical configs by construction — re-submission
would cache-serve; 4 new gens + 12 reused).

| rung | prompt | metric | stripped | preset | read |
|---|---|---|---|---|---|
| 544p | P1 | plan RMSE | 1.367 | 1.485 | +8.6% (sub-floor → tie) |
| 544p | P1 | HF | 2.144 | 1.880 | −12% (preset softer) |
| 544p | P2 | ArcFace vs canon | 0.771 | 0.178 | preset changes the render class |
| 544p | P2 | alternation | 0.00246 | 0.00811 | 3.3× worse (tiny absolutes) |
| **768p** | P1 | plan RMSE | 7.611 | 7.769 | +2.1% — **the preset does NOT rescue the 768p structure cliff** (confirms X2: no prompt curation buys back what resolution takes) |
| 768p | P1 | HF | 0.894 | 1.316 | **+47% texture** at the soft rung |
| 768p | P1 | alternation | 0.064 | **0.291** | 4.5× worse |
| **768p** | P2 | alternation | **0.190** | **0.0073** | **26× BETTER — the face-flicker collapse is prompt-curable** |
| 768p | P2 | HF | 3.865 | 3.179 | −18% |
| 768p | P2 | ArcFace vs canon | 0.182 | 0.205 | tie (both far off 544p's 0.77) |

- **Primary (preset vs stripped at 768p):** the adherence endpoint says NO
  rescue (P1 +2.1%, tie); the stability endpoint says a real, large,
  prompt-dependent effect: the labeled-section preset collapsed the P2
  face alternation from 0.19 to 0.0073 (26×; back to 544p-class) while
  TRIPLE-to-QUINTUPLE-ing the P1 ball-scene alternation. **Verdict
  (proposed): presets are NOT a collapse-rung rescue on adherence — S5's
  preset cell tags MEASURED-conditional: worth shipping for
  face/identity shots at 768p (the stability axis), harmful for
  static-object scenes. The 9/12 judge threshold rides on p23–p26.**
- The 544p P2 ArcFace drop (0.77 → 0.18) is render-class change, not
  identity damage (same calibration caveat as Set C: a different prompt =
  a different render of the board woman; the canonical reference is one
  render of many).

## 5. Statistics layer (honest label)

Four primary contrasts (D1 keep-list, D2 long-vs-bare per engine, D3
compiled-vs-naive, D4 preset-vs-stripped at 768p) at Holm α=0.05; sign
tests at Amendment-5 single-seed ns cannot reach α (pre-announced). The
zero floors now cover BOTH paths (video: three canaries bit-identical;
image: duplicates pixel-identical) — measured deltas are attributable to
treatment at battery granularity. Practical floors (10%/0.02 ArcFace)
carried the decision language above; every verdict is PROPOSED pending the
maintainer's blind calls, and D2/D4's ≥9/12 thresholds are eye-gated by
design.

## 6. Wall-clock economics (measured)

| family | n | mean wall | range | peak VRAM |
|---|---|---|---|---|
| H3 544p base-20 | 14 | 60.3 s | 60.2–60.3 | 24153 MiB |
| H3 768p base-20 | 2 | 143.5 s | 141.9–145.0 | (matches Set C's 142.1 s) |
| Krea2 identity-edit (1024², 8 st) | 17 | 23.1 s | 21.4–33.7 | 23827 MiB |
| SCAIL-2 81f/37f | 6/3 | 311.5 s / 100 s | 98–350 | 24165 MiB |
| Wan-A2 81f/37f | 6/3 | 292.1 s / 100 s | 99–303 | 24159 MiB |

Total 97.9 GPU-min sampling-side (wall incl. loads). D2's engines cost
~5 min/clip at 81f — the recast bake-off (Set G) should budget ~45 min
per 9-gen engine block on this stack.

## 7. The review surface (Amendments 1 + 4, delivered)

`gpu-review/setD/` — open **`review.html?set=D`**: 26 blinded pairs
(L/R by sha256; escrowed `pairs/.key` carries arm identities +
pre-registered expectations — sealed until your calls are exported),
`pairs-metadata.js` per the v2.1 contract, `pairs-frames.js` + `frames/`
(581 MiB lossless strips — larger than the ~220 MiB/set guidance because
D2's 81-frame pairs carry 2× the frames of the 39-frame boards;
content-deduped to 186 strips), `runs/` with all 51 outputs + the machine
manifest. **The p-null gate PASSED**: p01 (canary mid vs start) at 0 L/R
pixel differences — and p02 (the image-floor duplicates) also 0 — the
instrument itself shows both zero floors. All 22 treatment pairs differ
on every frame EXCEPT p07/p08 (the Krea2T no-op pairs — expected-tie by
measurement, pre-registered as the registry question). D1 stills present
as 48-frame loops (blink-comparable); every pair is same-geometry (no
cross-res handling needed this set).

**The verdict-table scaffold (the maintainer's calls land here):**

| Pair | Contrast (blinded until key open) | Pre-registered expectation | Automated battery | Maintainer's call |
|---|---|---|---|---|
| p01 | NULL: canary pair | TIE | bit-identical | _pending_ |
| p02 | D1 image floor duplicates | TIE | pixel-identical | _pending_ |
| p03–p06 | D1 keep-list vs bare × 4 dial corners | neutral (guide's rule) | all tie-class (Δ≤0.0032) | _pending_ |
| p07–p08 | D1 Krea2T vs bare | UNK (registry question) | **bit-identical (no-op)** | _pending_ |
| p09 | D1 scene keep-list vs bare | keep-list on no-face subject | proxy: global regen | _pending_ |
| p10–p12 | D2 SCAIL long vs bare × 3 clips | long > bare | 2/3 long wins, 1 noisy | _pending_ |
| p13 | D2 SCAIL short vs long (dose) | dose-response | short < long | _pending_ |
| p14–p16 | D2 Wan long vs bare × 3 clips | long > bare | monotone on dance | _pending_ |
| p17 | D2 Wan short vs long (dose) | dose-response | short ≈ long | _pending_ |
| p18–p20 | D3 compiled vs naive × 3 prompts | compiled > naive | P3 −64% plan err; P1 tie | _pending_ |
| p21–p22 | D3 hand6 vs naive / compiled (P2) | structure split | near-tie adherence; framing differs | _pending_ |
| p23–p24 | D4 stripped vs preset @768p (P1, P2) | preset buys headroom? | adherence: NO; P2 stability: 26× YES | _pending_ |
| p25–p26 | D4 stripped vs preset @544p (P1, P2) | preset at the easy rung | ties + render-class change | _pending_ |

## 8. Exit-criteria self-assessment

| Ledger exit criterion | Status |
|---|---|
| D1–D4 verdicts written | **MET (proposed)** — D1 keep-list neutral + Krea2T no-op; D2 long>bare both engines; D3 compiled>naive at high motion, structure≠prose at low; D4 no adherence rescue, conditional stability win — all eye-gated |
| Caption recipes frozen for Set G | **MET (proposed)** — the official packet-recipe structure is both engines' VG-1 caption arm, pending the eye |
| The guide's dialect-swap and preset cells re-tagged MEASURED or corrected | **MET (proposed)** — dialect-swap rule CONFIRMED (bare on Krea 2); T2VA preset cell MEASURED-CONDITIONAL (768p identity shots yes, static scenes no) |

## 9. Deviations, concerns, and notes

1. **The staging repair (material, recorded):** 8/9 Set D model links were
   broken relative symlinks (targets written against `/home/agent/models`
   while living in kind-subdirs) + `clip_vision_h` unlinked — all
   "enumerable" (scandir lists broken links) but not loadable; found at
   the first SCAIL load, fixed with absolute targets, run resumed. Two
   failed submissions are in the engine history; no generation counted
   them. **Lesson for the checklist: enumeration is not loadability —
   future installs verify with `os.path.isfile` or a first-load probe.**
2. **Amendment 5 applied throughout** (the D-spec's 2-seed cells ran at
   1 seed; gen counts 51 vs the ~84 two-seed plan, inside the ~34-video
   budget).
3. **D2 board substitution (disclosed):** Set G's 8-clip board does not
   exist; the board = the two official template assets (the engines'
   canonical material) + the batch's own c1_canary_start render. The
   Wan landscape clips run at 854×482 (orientation-matched swap of the
   official 482×854); per-clip geometry in the manifest.
4. **D1 arm-3 substitution (disclosed):** the pinned Krea2T pack ships no
   weighted-phrases node; the arm measured the enhancer patch — which
   proved inert. The weighted-phrases question itself remains unmeasured
   (a newer pack version would be needed).
5. **D1 scene instruction (disclosed):** derived from E-K1's established
   AnyPaint content for the same region (the design's scene-with-logo
   subject was never generated; src2 is the closest established scene).
6. **D4 stripped cells reuse Set C renders** (identical configs;
   re-submission would be a cache serve — the InputSignature ruling).
7. **naive P2 face-absence** is a detector-side fact (insightface at
   640 px on a wide shot), reported as such; the render itself is
   coherent (p19 shows it).
8. **GPU use:** 97.9 min across 51 gens; /free at every family change;
   teardown verified to the 302 MiB baseline (SIGTERM after two absorbed
   SIGINTs — the server had finished its queue cleanly; process exit +
   VRAM verified).
9. **The compiler's outputs are pinned verbatim** in
   `d0_prompts.py` (drift included) — reproducible to the token.

## Addendum — the maintainer's review is the remaining human step

The 26-pair surface is live (`gpu-review/setD/review.html?set=D`); the key
stays escrowed until the calls are exported. The contrasts the eye is
best placed to settle: D2's replacement/appearance quality (the scripted
proxies are coarse), D4's p23/p24 (does the preset LOOK better at 768p
where the metrics split adherence vs stability), and D3's p19/p21 (the
shot-design effect the endpoints miss). Per §1.4b, eye-vs-metric
disagreements escalate as protocol events — most interesting here would
be p03–p06 (if the eye sees keep-list differences where the metrics say
tie-class, that is a display-pipeline or subtlety question worth
recording).
