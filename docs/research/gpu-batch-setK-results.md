# GPU batch — Set K results (the keyframe-animation eval, 2026-10-06)

> The PRIME FEATURE's measurement round (the maintainer's 2026-10-05 ruling).
> Registration: ledger "SET K REGISTERED". Input assessment:
> [h3-keyframe-animation-assessment.md](h3-keyframe-animation-assessment.md).
> Executor: Flux eki4thg. Review surface: `gpu-review/setK/` (8 blind pairs,
> escrowed key, Amendment-7 metadata; the metadata quartet in git, media on
> disk). Artifacts: `test-results/experiments/gpu-batch-setK/` (on disk).

**23 renders / 19 prompts / 133.4 min productive render wall (193.4 min
engine-busy incl. one aborted arm — §7) / single seed 421337 / ALL FOUR
GATES PASS / teardown verified to the 305 MiB baseline, zero orphans.**

## 0. The set in one paragraph

One matched beat — the pack's own quickstart key (an elf-girl bust drawing;
vision-read at set start) turning from three-quarter screen-right to face
the camera — filled three ways at the card's operating point (ref2va pruned
int8, adapters @ 1.0, euler/simple 30 steps, BasicGuider no CFG, shift 12/3,
1344×768, 22f): the **tween-chain** (the adapter's reference-space
chaining), the **FL2VA-guide** fill (the Extender's lane: hard First/Last
endpoints + two spine guides via `MiniMaxH3AddGuide`, base fl2va unpruned,
no LoRA), and the **latent-chain** (the m-scalar lane: refs fixed, state
rolling through latents at σ_s = 0.6316, 30 NFE/beat). K2 measured the
chain-length drift (10 steps) and the step-size dial (⅕/¼/½/most). The set
produced **one adoption-grade positive and two load-bearing negative
results** — the negatives are exactly what the UI spec rounds must design
around.

## 1. Gates + integrity (all PASS)

| Gate | Check | Result |
|---|---|---|
| G-NULL | tween01 duplicated through the `__setKnull` VAE alias | **PASS** — framemd5 AND audio md5 bit-identical run-time; 0 px through the instrument (p01) |
| G-CAN2 | mid-set canary (tween01 via `__setKcan2`) | **PASS** — bit-identical |
| G-CAN3 | end canary (tween01 via `__setKcan3`) | **PASS** — bit-identical (Amendment 5 start/mid/end coverage complete) |
| G-BEAT1 | latent beat-1 vs tween01 (same seed/conditioning/schedule, different graph context) | **PASS** — bit-identical: the 5-beat chain graph's beat-1 path is uncorrupted, and cross-graph-context determinism holds |

Offline gates (setK_0, before any burn): sigma math asserted on the engine's
own scheduler code; LoRA headers 400 tensors / 100 `qkv_proj` / 0
separate-qkv (the zero-key silent no-op trap guarded, Set P class); caption
set lint-clean (no negations/comparatives per the CFG-distilled dialect),
SCENE/STATIC/TARGET byte-uniform across the chain; all four graph shapes
validated offline; the review surface's strips pixel-verified (8/8 pairs,
null 0-diff).

**ENGINE FINDING (harness-level, load-bearing for every future driver):**
the V1 `/prompt` API on ComfyUI 0.39.0 cannot pass
`MiniMaxH3ReferenceToVideo` autogrow refs as flat `ref_image_0` keys — they
*validate*, then crash at `execute()` (`unexpected keyword argument`; the
V1 path skips `build_nested_inputs`). The wire format is **dotted keys**
(`"ref_images.ref_image_0"`). Found on a 1.15 s failed hero dry-run (no GPU
burn); setK_0 now carries an offline **assembly gate** simulating
`get_finalized_class_inputs` + `build_nested_inputs` for every cond node of
every graph. Anything that drives R2V refs through the API hits this.

**Scheduler-semantics find (cost one arm run):** `BasicScheduler`'s `steps`
input is the EXECUTED step count; `denoise<1` densifies the grid to
`int(steps/denoise)` and slices the LAST `steps+1` entries. The first
latent-arm run passed `steps=240, denoise=0.125` = **240 executed steps per
beat** (~46 min/beat) instead of the intended 30; caught at beat 3, the
prompt interrupted, beats 1–2 archived as evidence, the arm re-run correctly
at `steps=30, denoise=0.125` (= grid(240)[-31:] = 30 steps from σ_s 0.6316
— verified on the engine's own node code before the re-burn).

## 2. K1 — the three-way methodology comparison (PROPOSED; the eye decides on gpu-review/setK/)

The beat collapsed differently under each methodology — the vision
disclosure read (23 frames, sonnet-tier, poses as %-of-arc):

| | **tween-chain** | **FL2VA-guide** | **latent-chain** |
|---|---|---|---|
| Opens at the start key? | **No — opens ~30% into the turn**, A-pose never shown; completes by f7/22 then holds | **Yes — frame 0 is the true A pose** (hard endpoint) | ≡ tween01 (beat 1 bit-identical) |
| The turn | 30%→100% inside f0–f7, then a 15-frame hold | 0→100% across f0–43 (40% of the 107f timeline), then holds to the end | beat 1 as tween01; beats 2–5 HOLD (no restart despite mid-arc captions) |
| Cadence | **on twos** — stepped holds, drawings held 2f (the alternation metric 0.17–0.47 IS the 12 Hz stepping) | **smooth continuous re-render** with line boil (~0.9 MAD in holds; 21/21 unique consecutive-frame hashes) — NOT on twos | beat 1 on twos (≡ tween01) |
| Style hold | hand-drawn sienna line throughout, zero medium drift | hand-drawn line holds (line-weight wobble, no photoreal drift) | intact across all 5 beats |
| Identity | intact every frame (23-frame audit: earring side, ear count, wardrobe, face — zero breaks) | intact | intact through 4 continuation beats |
| Anchoring cost | near ref is a LEAN: each clip's first frame deviates ~8.3 dE from its near-ref image (steps 2–4) | hard anchors PIN: first frame at the re-encode floor (~2.0 dE) | latent state pins: beats 2–5 first-vs-A stable ~22.7–22.9 dE (pose at B), last-vs-B creeps 2.5→3.9 across beats (micro-wander ~0.3 dE/beat) |
| Cost per beat-fill | 5×22f = ~16 min (at ~193 s/step-gen) | 1×107f = ~21 min (plus the guides, which the tween chain supplied) | 1 prompt, 5 beats, ~32 min |

**Reads (proposed):**
1. **The tween adapter's reference-space chaining did NOT chain the beat as
   designed.** The far ref's gravity dominated every step: step 1's last
   frame is already ~100% at B (a near-clone of the far key, dE-to-B 2.54);
   steps 2–10 are stable near-stills of the arrived pose. The rolling
   near-ref never held the chain back at an intermediate pose.
2. **The FL2VA hard-anchor lane is the only methodology that reproduced the
   beat as authored** — opens on A, traverses the full arc, lands on B — but
   it fills with the BASE model's smooth cadence (line boil, no on-twos
   stepping) because no keyframe adapter rides that lane (by design: the
   adapters are ref-conditioning contracts).
3. **The latent continuation is SAFE and STABLE but inert as a driver.** An
   arrived latent state dominates its caption: beats 2–5 held the frontal
   pose without restart, drift, or deformation (identity intact; dE-to-B
   creep 2.5→3.9 over four beats). Latents carry state; they do not re-pose
   it.
4. **Identity hold is a solved axis** on all three lanes — zero identity or
   medium breaks anywhere in the set (the adapters' core promise held under
   every chaining methodology we threw at it).

## 3. K2 — the limits map (what was measurable this set)

1. **Chain-length drift (measured at 5 and 10): NOT drift-limited.** Across
   10 steps: last-vs-B dE stays 2.36–3.00 (PSNR 35.2–36.5); the
   post-arrival steps 6–10 hold with micro line shimmer only; the drift
   curve dE-to-A flat at ~16.2–16.8 across both halves. The chain's
   practical limit is not drift — it is that **the chain stops moving**
   (arrival at step 1; everything after is a hold). "How far does a tween
   chain hold?" — at least 10 steps with zero measurable degradation; the
   real ceiling is the hold basin, and the 20-step extension would have
   measured more of the same (not run — clock, disclosed).
2. **Step-size vocabulary (the UI's core dial): NO BITE at this arc
   scale — saturation.** From the same near ref A with the same far ref B:
   landing "a fifth" (chain step 1), "a quarter", "half", and "most" ALL
   produce final frames at the same distance from B (dE 2.53/2.53/2.60/2.58;
   PSNR 35.5/35.6/35.2/35.2) — every fraction completes the whole turn
   (vision-confirmed: all four finals are the full B pose). The
   `landing <progress>` clause did not restrain the step on a single
   head-turn beat. Honest caveat: the author's corpus chains multi-action
   beats; the dial may bite on larger arcs — untested, and now THE open
   question for the spec rounds.
3. **Cadence character (adjacent to #2, measured):** the adapter lanes
   step on twos (hero/tween alternation 0.33–0.47 = 12 Hz held-drawing
   stepping; motion completes ~60–70% into the clip, then a static hold —
   the held-drawing aesthetic); the base fl2va lane renders smooth with
   constant line boil. Metric-reading caveat (standing doctrine): the
   alternation band 3–13 Hz MIXES cadence with flicker on this subject
   class — the eye is the decision layer on p02–p04.
4. **Not measured this set (disclosed):** style breadth beyond the
   one-artist corpus (#3 — one style, the pack's own); live-action/3D
   source keys (#4); the 544p/39f envelope (#5 — the optional probe was
   dropped on clock); sequence-window bounds (#6 — the seq adapter never
   ran: it surfaced as the FL2VA-arm's caption shape only); pruned-vs-
   unpruned base (#7 — the unpruned ref2va fetch was never done; the whole
   set ran pruned per the card's "they also run on pruned repacks");
   step-count floor below 30 (#8 — 30 IS the card's floor; the cost datum
   below substitutes).

## 4. Cost (measured, the interactive-UI datum)

9.5 s/step steady-state on the 3090 (dense SDPA) at 1344×768×22f with refs
at `ref_image_size max`: **~193 s per 22f tween step (30 NFE)**, ~394 s
when the near ref is the full-resolution portrait A ("max" keeps its
3.6 MP), **~21 min for the 107f guide fill**, **~6.5 min per beat** in the
latent chain (30 NFE each), peak VRAM 24.0 GiB throughout (fits the 24 GB
stack, no offloading). The card's operating point is ~3–6 min per
22-frame clip — a real-time interactive UI cannot run it synchronously;
queue-and-review (the Extender's pattern) is the right shape.

## 5. Verdicts proposed (pending the maintainer's eye on gpu-review/setK/)

- **K1:** if the eye concurs with the metrics+vision read, the
  feature's default fill should be **hard-anchored** (the fl2va-guide
  lane's endpoint fidelity) for beat traversal, with the tween adapter as
  the **cadence/style holder** — the two lanes compose (guides from keys,
  adapter cadence on the clip), and the pure reference-space tween chain
  is NOT the primary fill for short beats (far-ref gravity saturates it).
  The latent lane is the safe continuity carrier (holds state, no
  deformation) but cannot re-pose.
- **K2:** the step-size dial as specified (caption fractions) is a no-op
  on short beats — the UI must not ship it as the primary motion control
  without a larger-arc validation; the chain-length ceiling is ≥10 steps
  with zero drift (the hold basin, not degradation, is the limit).
- **The prime-feature program's next measurement** (if called): the dial
  on a multi-action arc (the corpus's regime), the seq adapter's window
  bounds, and the tween chain on a beat large enough that one clip cannot
  span it.

## 6. Review surface

`gpu-review/setK/` — review.html (the 67bb129 instrument, verbatim), 8
blind pairs (side by sha256; key escrowed in `pairs/.key`), Amendment-7
metadata on every pair (question/judge/sides; the null wording on p01):
p01 null · p02–p04 the K1 methodology pairs (107f matched trims) ·
p05–p06 the dial pairs · p07 the drift pair (approach vs post-arrival) ·
p08 the hero-vs-tween context pair. Strips pixel-verified 8/8; the null
0-diff through the instrument. CONCAT/trim pairs carry no audio (silent
line-art subject; per-clip audio auditionable in `runs/`).

## 7. Wall-clock + deviations disclosed

- Productive render wall 133.4 min (23 renders) + one aborted arm (the
  240-step latent misconfig, ~60 min incl. its interrupt) = 193.4 min
  engine-busy; teardown verified to the 305 MiB baseline, zero orphans
  (the teardown verifier's "refused to die" prints were its own 150 s
  patience limit — every engine exit was confirmed clean by final state).
- Budget: the registration estimated 60–90 GPU-min; measured ~2× (the
  estimate's per-gen arithmetic was ~2.5–3× optimistic — same class as the
  dpc disclosure). Design executed as registered; the 20-step chain
  extension and the 544p envelope probe were the two clock-dropped items.
- Two controller bugs found+fixed mid-set (builder-kwarg misuse crashing
  at graph build; a finally-block SystemExit swallowing the first
  traceback — hardened to record in-flight exceptions before teardown).
  The latent run-1 partial (240-step beats 1–2) is archived at
  `out/latent_run1_partial/` as the misconfig's evidence.

## ADDENDUM — the maintainer's blind review, reconciled (2026-10-06)

8/8 called: 5 tie · 3 right · 0 cannot-assess · 0 notes (clean calls throughout). The null gate held by eye.

### K1 verdicts — the eye OVERTURNS the metrics' methodology ranking

The automated side said FL2VA-guide was "the only methodology that reproduced the beat as authored." The eye disagrees:

| Pair | Call | Meaning |
|---|---|---|
| p02 (tween vs FL2VA) | **tween wins** | the tween's saturated-but-hand-drawn fill beats the FL2VA's correct-but-smooth fill |
| p03 (tween vs latent) | **tie** | the tween and latent fills are indistinguishable by eye |
| p04 (FL2VA vs latent) | **latent wins** | the latent chain's fill beats the FL2VA guide's fill |

**The eye's methodology ranking: tween ≈ latent > FL2VA** — the inverse of the automated arc-fidelity metric. The hand-drawn on-twos character (which only the adapter lanes carry) matters more to the deciding eye than arc correctness. The FL2VA guide's "correct" arc is smooth and base-model-flavored; the tween's "incorrect" arc is saturated but has the hand-drawn look. **Style trumps structure for the eye.**

### K2 — the dial is dead, confirmed by eye

Both dial pairs (p05: quarter vs half, p06: half vs most) are **ties** — the eye cannot distinguish the landing-progress fractions. The step-size dial's no-bite finding is now eye-confirmed, not just metric-confirmed. The UI spec must not treat `landing <progress>` as a functional lever.

### K2 — the drift curve has an aesthetic direction

p07 (approach vs hold): the **approach phase** (chain steps 1–5, where the tween is still nominally advancing) is preferred over the **hold phase** (steps 6–10, post-arrival). The transition is more visually interesting than the destination. This is a UI insight: the timeline's chain segments should show the approach, not skip to the hold.

### The context arm

p08 (hero one-shot vs tween step 1): tie — the hero adapter's whole-beat bridge is indistinguishable from the tween's (saturated) first step. Consistent with the saturation finding.

### Verbatim responses
```
{
  "exported": "2026-10-06T18:59:15.089Z",
  "responses": {
    "p01": {
      "call": "tie",
      "ts": "2026-10-06T18:51:20.663Z"
    },
    "p02": {
      "call": "right",
      "ts": "2026-10-06T18:54:03.514Z"
    },
    "p03": {
      "call": "tie",
      "ts": "2026-10-06T18:54:25.012Z"
    },
    "p04": {
      "call": "right",
      "ts": "2026-10-06T18:54:40.091Z"
    },
    "p05": {
      "call": "tie",
      "ts": "2026-10-06T18:54:51.597Z"
    },
    "p06": {
      "call": "tie",
      "ts": "2026-10-06T18:55:00.220Z"
    },
    "p07": {
      "call": "right",
      "ts": "2026-10-06T18:59:04.851Z"
    },
    "p08": {
      "call": "tie",
      "ts": "2026-10-06T18:59:12.503Z"
    }
  },
  "set": "K"
}
```
