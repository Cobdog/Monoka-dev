# GPU batch — Set DPC results (the corrected-rules DMAD-vs-PDMD comparison)

> Flux task: **GPU set DPC (m2sxmxx)** · executed 2026-10-06 on branch
> `component-vocabulary` · executor: this session, per the maintainer's
> corrected-rules dispatch (the sampler-rule verdict's consequence #3).
> **Attestation: 12 generations, 31.6 GPU-min gen-phase** (3 canaries + 8
> treatment arms + 1 null), all on the live 8189 testbed (dense SDPA,
> ComfyUI 0.39.0). **Canary gates 9/9 PASSED** and — stronger — all three
> canaries **bit-identical to the sampler-ab set's persisted renders from
> 40 hours earlier** (cross-launch continuity: the shim loads, engages, and
> reproduces exactly). **Null gate PASSED** (A_null_pdmdeu ≡ A_gym_pdmdeu,
> framemd5 + audio md5, through the `__setDPCnull` cache-bust alias).
> **Teardown verified: /free → SIGINT ×2 → SIGTERM → exit → nvidia-smi at
> the 305 MiB baseline, zero orphans.** Artifacts:
> `test-results/experiments/gpu-batch-dpc/{scripts,out}` (on disk, gitignored
> per the runbook); review surface: `gpu-review/dmad-pdmd-corrected/`
> (unblinded per the maintainer's ask — heavy media on disk only, the
> metadata quartet carries in git). Verdicts below are **PROPOSED** — the
> maintainer's own-eyes read on the 4 labeled pairs decides. Ledger
> registration: "SET DPC — the corrected-rules DMAD-vs-PDMD comparison".

## 0. The run in one paragraph

The void comparison rerun with the sampler rule corrected — each distill
under its OWN trained inference rule, same seed per pair, same graph family
except sampler + LoRA, on the ref2va int8 base at dense SDPA: **DMAD-rn**
(DMAD-4 full-critic @ 1.0, `SABDMDReNoiseSampler` — the sab_shims re-noise
rule, shifts 12/2) vs **PDMD-eu** (PDMD-4 v6 @ 1.0, no prefix, the stock
`MiniMaxH3TurboSampler` Euler, shifts 12/3). Four prompt surfaces: the two
P2 originals **verbatim** at 124f (GYMNASTICS P2_2, BASKET TOSS P2_3) and
two **new pressure prompts** at 243f (PB_2, PB_3 — close-up single-character
studies of the same scenes, two-shot with precise cut timing, authored this
set §2 below). Knots asserted at emission and in the engine log (12/12);
LoRA headers 208/208 both files. The eye is the decision layer; the metric
stack records secondary context, with the face-region battery riding the B
prompts' designed surface.

## 1. The arms (the sampler-rule column is now mandatory — verdict #5)

| Arm | Model / LoRA | Sampler rule | Frames | Shifts | Wall (each) | Peak VRAM |
|---|---|---|---|---|---|---|
| DMAD-rn | DMAD-4 full-critic @ 1.0 | **Re-noise** (`SABDMDReNoiseSampler`: x0 = x + s·v; x′ = (1−s_n)·x0 + s_n·FRESH noise) | 124f (A) / 243f (B) | 12/2 | 114.4 s / 299.2 s | 23,907 MiB |
| PDMD-eu | PDMD-4 v6 @ 1.0, no prefix | **Euler/simple** (`MiniMaxH3TurboSampler` — stock) | 124f (A) / 243f (B) | 12/3 | 114.4 s / 299.2 s | 23,899 MiB |

Both arms: seed 421337 per pair, 4 NFE, simple schedule (knot-identical to
DMAD's own `sigma_grid(4,12)`), no CFG, 1088×608, audio on. The two rules'
walls are IDENTICAL per geometry — same NFE, same graph — so this
comparison is pure quality per GPU-second (unlike turbo-8, PDMD's economics
match DMAD's exactly).

## 2. The B (pressure) prompts — authored this set, packet §3.1/§6.1 skeleton

**PB_2 GYMNASTICS-B** — `integrated_multimodal_description: [Shot 1]
Cinematic character study, extreme close-up: a gymnast in a red leotard,
chalk dust on her cheek and her eyes narrowed down the runway, exhales
slowly through her nose. The camera holds tight on her face for two
breaths, then pulls back and tracks alongside at sprint speed as she drives
down the diagonal, arms punching, the runway markers strobing past her
shoulder.
[Shot 2] At 00:04.2, the camera cuts to a slow-motion close-up of her palms
slamming the vault table, the impact rippling through her fingers and
whitening her knuckles, then drops to floor level in real time as she
sticks the landing — her face swinging into frame, jaw tight, the floodlit
crowd reflected in her eyes.
overall_soundscape: A hushed arena held on her breathing: two slow inhales,
a swallow, then sharp accelerating footfalls, the deep stretched thud of
palms on the table under the slow motion, one crisp mat impact, and the
crowd breaking into a roar as her arms snap up.
non_diegetic_music: N/A`

**PB_3 BASKET TOSS-B** — `integrated_multimodal_description: [Shot 1]
Intimate live-event coverage, close-up: a flyer in a white uniform locks
eyes with her three bases, their lips moving through the final count as she
sets her jaw and grips their shoulders. The camera rises with her at the
launch — ponytail lifting, poms trailing, the gymnasium's ceiling lights
sweeping past the lens — then settles with her into one held beat of
stillness at apex, her face calm against the bright upper void.
[Shot 2] At 00:05.0, the camera cuts to a low angle inside the cradle
looking up: the bases' upturned faces rush into frame as they catch her at
the waist, knees absorbing, and her expression shifts from tight
concentration to open triumph as she snaps her poms overhead.
overall_soundscape: A packed gymnasium: the bases' low chanted count,
squeaking sneakers, a sharp group effort-call on the launch, wind rush and
pom rustle through the rise, one near-silent beat at apex, then the solid
double-thud of the catch and the crowd breaking in under her celebration.
non_diegetic_music: N/A`

Same wardrobe/subjects as the A originals (the red-leotard gymnast, the
white-uniform flyer + three bases) — the B variant is the same scene read
as a character study. The cuts sit inside the 10.125 s render (00:04.2 /
00:05.0), unlike P2_6's sampler-ab note where the Shot-2 cut fell past a
5.17 s render.

## 3. The primary contrast — DMAD-rn vs PDMD-eu (automated side)

Paired cells (same seed, same prompt; ratios are DMAD-rn ÷ PDMD-eu; <1 on
warp/alternation = DMAD-rn stabler):

| Pair | warp ratio | alternation ratio | HF ratio | pixel PSNR / dE | audio Δ (dBFS / Hz centroid) |
|---|---|---|---|---|---|
| A_gym (124f) | **0.77** | **0.76** | 1.33 | 12.1 dB / 32.7 | +3.1 / −328 |
| A_bsk (124f) | **0.70** | **0.73** | 0.67 | 12.3 dB / 30.8 | +4.6 / +173 |
| B_gym (243f) | **0.38** | **0.83** | 0.49 | 11.0 dB / 38.0 | −4.4 / −305 |
| B_bsk (243f) | **0.78** | **0.52** | 0.73 | 12.1 dB / 30.7 | +5.3 / −271 |

Readings (secondary context — the eye decides):

- **Temporal stability: DMAD-rn stabler on BOTH axes, 4/4 pairs** — warp
  ×0.38–0.78 and alternation ×0.52–0.83. Under Euler (the void comparison)
  DMAD also led warp 6/6 but lost alternation 4/6; under its own rule it
  leads both, decisively on the 10-second close-up (B_gym warp ×0.38). The
  maintainer's "dramatically better" eye-read now has metric company
  (with Set P2's standing caveat: these axes measured below the deciding
  eye's JND on distilled arms — they record, they don't decide).
- **HF mixed** (softer on 3/4, sharper on A_gym ×1.33); **renders
  materially different everywhere** (PSNR 11.0–12.3 dB, dE 30.7–38.0).
- **B_gym exposure split flag for the eye:** DMAD-rn's mean L* is 13.6 vs
  PDMD-eu's 29.6 — a much darker read of the hushed-arena prompt (the
  same direction as its −4.4 dBFS quieter audio there). Whether that is
  moody-faithful or under-lit is an eye call, flagged.
- **Audio:** DMAD-rn louder on 3/4 (up to +5.3 dBFS) and darker on 3/4
  (centroid −271 to −328 Hz) — the shift-2 family signature persists
  under the corrected rule. No near-silence anywhere (quietest −25.2 dBFS).

## 4. The face-region battery (the B prompts' designed surface) [MEASURED]

Per-frame dual-scale largest-face tracking (insightface buffalo_l, native +
half scale) over every frame, metrics inside the tracked bbox; ArcFace
identity is cosine vs the video's own frame-0 face (internal consistency —
pose change mechanically depresses it; comparative, not absolute):

| Render | coverage | face area (frame frac) | face-region HF | face-region alternation | ArcFace mean |
|---|---|---|---|---|---|
| B_gym DMAD-rn | 0.753 | **0.162** | 4.42 | 0.00795 | **0.652** |
| B_gym PDMD-eu | 0.922 | 0.121 | 6.06 | 0.00259 | **0.680** |
| B_bsk DMAD-rn | 0.975 | 0.021 | 8.25 | 0.00439 | 0.106 |
| B_bsk PDMD-eu | 0.983 | 0.020 | 9.15 | 0.00575 | 0.268 |

- **The B design worked**: faces track at 75–98% coverage and the GYM close-
  up reads 12–16% of frame (a real face study). A-prompt faces also
  register (~100% coverage) but at ~0.1% of frame — full-figure framing,
  ~20 px faces; their numbers are recorded in the manifest and **caveated
  as marginal-quality tracking** (not a designed surface).
- **Face identity holds comparably on B_gym** (0.652 vs 0.680 — no
  separator), and **degrades on B_bsk for both arms** (0.106/0.268) — the
  flyer's face sweeps through extreme poses on launch/apex/catch; identity-
  vs-frame-0 is mechanically hostile there. Disclosed: no eye-check of
  whether either arm's B_bsk face is actually coherent.
- **Face-region flicker splits**: PDMD-eu cleaner on B_gym (×3.07 against
  DMAD-rn, absolute values tiny), DMAD-rn cleaner on B_bsk (×0.76) — no
  direction-consistent face-stability story; the whole-frame axes (§3) are
  the stabler read.

## 5. Economics (matched by construction)

Wall-identical per geometry (114.4 s @ 124f, 299.2 s @ 243f, both arms —
4 NFE each, same graph family), VRAM flat ≈23.9 GiB. The corrected
comparison costs nothing over the void one: the DMAD-vs-PDMD question is
decided purely on render quality at identical GPU spend.

## 6. Gates, health, and honesty ledger

- Canaries (9/9): ENGAGED (can_R ≠ can_E bit-wise), DETERMINISTIC (can_R2 ≡
  can_R through `__setDPCr2`), knots == card grid both rules, 4 steps each,
  RMS finite, audio non-silent; PLUS cross-launch bit-identity with the
  sampler-ab set's canaries (all three) — the zero floor holds across days.
- Null: PASS (bit-identical duplicate at treatment geometry).
- 12/12 runs healthy (frames, knots, steps, files); LoRA headers 208/208.
- **Budget deviation, disclosed:** the dispatch estimated ~12–15 GPU-min;
  the design's 8 arms measure **31.6 min** on this stack (124f 4-NFE ≈
  114 s and 243f 4-NFE ≈ 299 s warm — both consistent with the combined
  eval and Set P2 measurements; the estimate's per-gen arithmetic was ~2.5×
  optimistic). The design was executed as specified; the extra time is the
  B arms' true cost.
- Face-region analysis on the A prompts is marginal-quality (tiny faces) —
  recorded, caveated; plan-error not applicable (no numeric plans).

## 7. The review surface

`gpu-review/dmad-pdmd-corrected/review.html` — **4 unblinded labeled pairs**
(LEFT = DMAD-rn, RIGHT = PDMD-eu on every pair, per the maintainer's want
to see which is which): the two A originals at 124f and the two B pressure
prompts at 243f, each with sync-playback, the full metric table (whole-frame
+ face-region), the verbatim PB prompt in a collapsed block, and the
gates/rules meta. `runs/manifest.json` carries walls, VRAM, sha256s, gate
records. The null and canaries are run-time gates recorded in the manifest
(this set is unblinded by design — sampler-ab precedent — so the blinded
instrument's on-page null pair does not apply).

**Eye-critical pairs:** B_gym (the closest thing to the maintainer's
"dramatically better" cell — warp ×0.38 AND the L* exposure split to
adjudicate), B_bsk (the identity-degradation cell), A_gym (the only
HF-sharper DMAD cell, and its 0.59 face coverage).

## 8. Exit-criteria self-assessment

| Dispatch requirement | Status |
|---|---|
| Two prompts × two variants × two models = 8 gens | **MET** — 8 arms, A prompts verbatim (byte-asserted), B authored per spec |
| B prompts in the P2 format, ~10 s (243f), character-pressure design | **MET** — §2; two-shot, precise cuts at 00:04.2/00:05.0 |
| Same base / seed per pair / graph family; only sampler + LoRA differ | **MET** — knot-identical schedules asserted 12/12 |
| Re-noise shim verified loading + engaging | **MET** — 9/9 canary gates + cross-launch bit-identity |
| Null pair | **MET** — bit-identical through the alias |
| Warp / alternation / HF / audio battery | **MET** — §3 |
| Face-region analysis if trackable | **MET on B** (75–98% coverage); A caveated marginal |
| Review surface, unblinded, labeled, standard comparison page | **MET** — §7 |
| Budget ~12–15 GPU-min | **DEVIATED (over)** — 31.6 min, design unchanged, disclosed §6 |
| Teardown verified | **MET** — 305 MiB, zero orphans |

## 9. Proposed verdict (the maintainer's 4-pair read decides)

The corrected-rules comparison is delivered. The automated context says the
sampler-rule correction was not cosmetic: **DMAD under re-noise leads both
temporal-stability axes on all four pairs** (the void comparison had DMAD
losing alternation 4/6 under Euler), at identical wall and VRAM — the
motion-coherence case the maintainer's eye already made on the sampler-ab
pairs now extends across four new surfaces including two 10-second
character studies. PDMD-eu keeps HF sharpness on 3/4 cells and face-region
identity/flicker edges on B_gym. If the maintainer's read of the 4 pairs
concurs with the stability picture, the DMAD-vs-PDMD question inverts the
combined eval's tainted crown at matched cost — with PDMD's P2 crown vs
turbo-8 unaffected (that comparison never involved DMAD). The recipe-ledger
line this would settle: DMAD-full-critic's operating point is re-noise
12/2, PDMD-4's is Euler 12/3 — the sampler-rule column rides every future
registration.
