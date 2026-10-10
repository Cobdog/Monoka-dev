# The Reference Pack — Design Spec (draft for maintainer review)

> **Status**: draft — the slim shape settled by the maintainer's direction
> and hands-on measurement (2026-10-09:
> docs/research/h3-refmods-lab-assessment-2026-10-09.md, the assessment +
> the measurement correction); the research map
> (.superpowers/sdd/2026-10-08-animation-extension-lane/unified-pack-research.md)
> supplies the territory states. Recommendations are marked; the review
> decides.

## 1. Purpose

One reusable artifact — the **pack** — holding a subject's reference
material as H3-VAE-encoded latents with descriptions and retention
metadata. Compiled on demand (the encode pass; the maintainer measured
~1–2 minutes for 30 images — minutes-class, GPU-light), activated on
demand per generation. Encode once, reuse everywhere references enter.

This unifies the project's threads: the Lab's verified pack pattern
(exact latents + lossy presentation copies + retention vocabulary), the
carved in-app seam (`H3ImgRefSlot.refmod`), and the artifact store's
standing carry pattern (exact bytes, digest, registered at production).

## 2. Architectural identity

An increment on the studio's reference surfaces over the standing
artifact store — no new subsystem. The pack is an artifact with a
manifest; compile is an engine-side encode job (the runbook's queue
discipline); activation is per-surface selection feeding the existing
conditioning seams. The modularity contract governs: a pack can be
deleted as easily as created; nothing welds to the Lab's format (we own
our manifest; the pattern is adopted, not the format).

## 3. Scope

**In (v1, recommendations):**
- **Images only** (the measured surface; the Lab's video/audio carry real
  caveats — RAM-before-trim, timing normalization, token growth — listed
  as named v1.x increments, not v1 scope).
- The pack format + manifest (§4); compile (§5); activation on the
  **image workbench's reference strip first** (the carved seam), with the
  canvas and animation surfaces as v1.x (the strip is where reference
  cost bites hardest today).
- Selection (per-source in/out) + the retention vocabulary; the token
  budget surfaced (the adopted math).

**Out (v1):** LoRA/training in any form (the deferred thread, untouched);
strengths (the Lab's own honesty: "experimental, not retention
percentages" — a v1.x dial at the earliest, measured first); video/audio
packs; cross-format compatibility with community refmod formats; sharing
/export beyond the project archive.

## 4. The pack format

A pack = a manifest + its blobs, all in the artifact store:

- **Per source**: the material blob ref (the original image), the
  **encoded latent blob** (exact H3-VAE latents — no pooling; the
  digest-verifiable bytes), a lossy **presentation copy** (JPEG bytes for
  the VLM — the presentation/conditioning split), and metadata:
  description (as authored), retention strategy (the adopted vocabulary:
  fully_preserved / partially_preserved / attribute_transfer /
  weak_reference), encoding params (max_edge, the 32-grid rounding
  recorded).
- **Subject grouping** by name (case/space-insensitive), descriptions
  start with his/her/its per the Lab's convention (adopted as-is — their
  measured shape).
- **The manifest**: versioned; the pack's digest; per-source digests;
  lineage (which compile produced it, from which material versions);
  the token accounting (each source's DiT tokens = (w/32)×(h/32); the
  budget front-loaded at selection, rejecting overflow BEFORE encoding).
- **Immutability**: a compiled pack is immutable; material edits produce
  the next compile (a new pack version, lineage-chained) — the frozen-
  attempt doctrine applied to artifacts.

## 5. Compile (the on-demand encode pass)

- The job: VAE-encode the bundle's material through the engine (the
  same engine discipline as everything — queue-aware, the runbook;
  minutes-class, schedulable beside generation more cheaply than
  diffusion).
- Deterministic outputs: the encoded blobs land at content-addressed
  paths; re-compiling identical material is a no-op (digest-equal).
- Incremental honesty: adding a source re-encodes only the new material
  (per-source blobs are independent); the manifest version advances.
- The UI: a compile action on the pack's surface with the honest
  progress + the measured time expectation ("about a minute or two for a
  few dozen images" — the maintainer's numbers as the default copy).

## 6. Activation

- Per-generation selection: sources in/out (the Lab's selector pattern);
  the selected set's retention metadata auto-assembles into the prompt's
  subject sections (the compiler-side integration — the vocabulary feeds
  the caption structure).
- The conditioning path: the exact latent blobs attach to the graph
  (the encode-once economics); the presentation copies feed the VLM. No
  per-generation re-encode of packed references.
- The budget: the selection's token total surfaces live against the
  surface's budget (the strip's hard slot limit gains the honest math).
- **The seam**: `H3ImgRefSlot.refmod` becomes a pack-reference slot — a
  slot may hold loose images (today's behavior, unchanged) or a pack
  selection. Loose images never silently convert; the pack is an
  explicit choice.

## 7. Store + document model

The pack is an artifact (the blob tree's `'latent'` kind exists; the
manifest extends it). Selection state is per-surface document state (the
workbench document records which pack sources a slot references —
expectedRevision-gated like every command). Project archive rides the
recursive relPath walk as-is (the whole-branch review verified the
pattern for the carry blob; packs are the same class).

## 8. Resolved decisions

| Decision | Ruling |
|---|---|
| The fast surface | The compile (VAE encode), per the maintainer's measurement — not training |
| Training/LoRA | Out of scope entirely; the deferred thread untouched |
| Format | Our own manifest; the Lab's PATTERN adopted, its format not depended on |
| Persistence | The artifact store's carry pattern (multi-blob + lineage are the gaps this spec closes) |
| v1 media | Images (recommended; video/audio = v1.x with the Lab's caveats named) |
| v1 surface | The workbench reference strip (recommended; canvas + animation = v1.x) |
| Strengths | Out of v1 (the Lab's own honesty; measure before any dial) |

## 9. Development strategy

The established discipline: subagent-driven, blind reviews, the
whole-branch gate. No GPU probes needed for the design itself (the
compile time is measured; the encode path is the engine's standing
machinery). **Any quality claim** — "packed references hold identity as
well as loose ones" — goes through the harness (null-pair-gated GPU
evidence; the top risk from the research map stands).

## 10. Evidence constraints

| Finding | Consequence |
|---|---|
| The Lab's encode-once pattern GPU-verified (latent byte-match + exact round-trip) | The pack's economics are real, not claimed |
| The maintainer's 30-image/1–2-min compile | The on-demand contract's time expectation |
| The carry pattern standing (the extension lane, whole-branch-approved) | The persistence layer needs composition + lineage, not invention |
| The token math (DiT (w/32)×(h/32); ~80/s audio) | The budget surfacing, front-loaded |
| Strengths "experimental, not retention percentages" (the Lab's own words) | Strengths out of v1 |
| The CFG-de-distillation washout invisible at low steps | Any quality claim = harness evidence only |
