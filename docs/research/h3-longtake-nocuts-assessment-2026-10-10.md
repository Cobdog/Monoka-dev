# H3 LongTakeNoCuts — intake assessment

**Provenance:** the maintainer's pick (2026-10-10,
github.com/xyzDist/H3-LongTakeNoCuts), assessed per the fresh-release
doctrine. The maintainer's framing question: "reached a similar conclusion
to our approach for handling degradation in long H3 videos?" — answer:
same diagnosis, one layer further on the remedy.

## What it is

A workflow + custom nodes built ON the native Motion Context example
(noted explicitly as minimal, low-level — "not a Director/Extender AIO
node"), by the author of the FL2VA-Continuation family. Target: the
degradation of long no-cut H3 shots.

## The diagnosis (matches ours — CONFIRM)

The **photocopy effect**: each segment loads the previous latent as ground
truth; every generation adds small drift and detail loss; the losses
accumulate. **Degradation onset ≈ segments 5–6**; with cuts there is no
degradation issue. This independently confirms our own measurements (Set
K's small measured wander across four continuations; the strategic
review's compounded-degradation acknowledgment; Motion Context's
maintainer bounding their own perceptual testing) — and adds a data point
BEYOND our tested range: Set L and the extension lane's legs ran 2–3
windows; this puts the wall at 5–6.

**Consequence for the lane:** v1 (session-scoped, a few windows) sits
inside the safe envelope; longer chains will hit the wall — this recipe
class is the named mitigation direction when they do.

## The remedy (one layer further than ours — ADOPT-candidate)

1. **Refine resample**: an additional sampling stage, a few steps at
   denoise 0.5–0.6 — "restores character details and fixes waxy / burnt
   look and degradation."
2. **Custom Frame Blend Latent node**: keyframe blending BY FRAMES in
   latent space — since Motion Context trims the first 22 frames, the
   current latent holds 0–22 and blends into the refined latent across
   22–44 (adjustable; their example mask `0:0, 22:0, 44:1`). The same
   22-frame geometry as our trimmed head.

## The honest limitation (matches our record — CONFIRM)

The high-denoise refine changes things: **background shift and dissolve
artifacts** at the blend when the two latents' backgrounds differ even
under the same prompt; fine character details may also change. Their
TODOs: a latent noise-mask to refine ONLY the character (the same
masked-refine direction our H3-Extender intake documented), and audio
artifact handling (unchecked).

This is the same trade the strategic review's color-drift finding named:
character restoration bought with background instability.

## The verdict menu

- **CONFIRM** — the drift model (photocopy effect), the cuts-sidestep-it
  fact, and the repair's known cost (background instability).
- **ADOPT-candidate** — the refine+blend RECIPE as the long-chain
  join/drift treatment, when chains exceed ~4 windows or if the §9
  acceptance judges join quality insufficient. Probes run through OUR
  harness (null-pair-gated); the registered-but-unrun X2 Detail VAE eval
  is the same detail-restoration family — one probe window could carry
  both if a refine probe ever runs.
- **ADJUST** — the lane's documented degradation envelope gains the
  5–6-segment onset as the expected wall (our tests were 2–3 windows).
- **NONE else** — no code to take today (their node is a small KJ-style
  blend; the RECIPE is the value; no license stated in the README — any
  future port checks first).

## Recorded into the lane's context

The extension lane's spec §13 (evidence constraints) gains no change —
v1 stays as approved; this assessment is the named forward reference for
the long-chain wall and its mitigation direction.
