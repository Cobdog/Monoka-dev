# Attention-steering for prompt adherence — the Anemoi inversion (registered 2026-10-05)

> Flux task rm2mjlp. Source inspiration: anemoi-project/anemoi (Apache-2.0)
> — their 2D ragged block routing and prefix/video layout design. **The
> speedup is NOT our interest** (SM86-incompatible; 1.26-1.30× is modest).
> The premise we keep: spatially structured attention can be *steered*, not
> just pruned.

## The hypothesis

H3 injects text as a **prefix in the same sequence** video tokens attend
over. Prompt binding *is* video-token-to-prefix-token attention. If
attention can be biased toward prompt-relevant regions (instead of Anemoi's
drop-the-bottom-80%), adherence might be *rescued* at resolutions where it
currently collapses — our measured X2 cliff (adherence degrades above
~576p; plausibly attention dilution as token count grows while the prompt
stays fixed).

## The two-step eval (both run dense on our 3090 — no Anemoi kernels needed)

1. **The localization probe**: extract prefix-attention maps per concept
   on our board. Measure spatial concentration — does "the ball" own a
   region? If H3's attention already localizes concepts, biasing is
   mechanical. If not, association must come from prompt parsing.
2. **The bias arm** (if concentration exists): steered vs unsteered at the
   768p cliff rung. Plan-error + the eye instrument + per-claim
   verification via the caption-verifier pipeline (TypedDecision).

## Why the timing insight matters

Anemoi's dense-first schedule + our sigma findings agree: **binding happens
early, texture late**. Attention steering should concentrate on early
steps. Late steps can stay dense-or-sparse without adherence impact.

## What we keep from Anemoi (the documentation value)

The `VisualLayout` prefix/video separation; the block-scoring router
(mean/max-pool blend); the dense-first schedule; the precision-cell
concept. Their repo: github.com/anemoi-project/anemoi (master branch).
Paper: arXiv 2609.32628.

## Honest risks

- The idea family exists (training-free layout control in diffusion,
  mostly T2I-era cross-attention work). H3's prefix-attention variant
  would be new ground but not the first in the family.
- H3's CFG-distilled checkpoints remove the classic cross-attention
  guidance lever; direct attention biasing is the remaining path.
- Attention readout gives the *model's belief* about where things are —
  amplifying a wrong belief compounds. Hence the probe comes first.
