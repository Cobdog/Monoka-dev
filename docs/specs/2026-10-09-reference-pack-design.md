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

---

## PRE-REVIEW PACKET (2026-10-12, task oacclqo) — the spec vs the tree, before the blessing

> **METHOD**: direct code reads at `main` @ 95f52cf — every mechanism the spec
> names was located and read in the tree; the two research inputs were
> cross-read (docs/research/h3-refmods-lab-assessment-2026-10-09.md; the design
> map .superpowers/sdd/2026-10-08-animation-extension-lane/unified-pack-research.md).
> No engine contact, no web. The spec body above is UNTOUCHED — this section is
> the review's evidence base. Tags: [DOC] verified in shipped code or the
> in-tree record · [SPEC] plausible-unverified · [UNK] nobody knows.

### The ask (one screen)

The blessing decision is over the slim v1 as specified: an images-only pack
(our own manifest + blobs in the artifact store), compile = an on-demand
VAE-encode through the engine (minutes-class, the maintainer's measurement),
activation first on the workbench reference strip via the `H3ImgRefSlot` seam.
**The tree verifies the spec's persistence story end-to-end** — the carry
pattern, the `'latent'` blob kind, content-addressed dedupe, the archive walk
all exist as described. **One load-bearing question is unnamed in the spec**
(open question 1 — which engine node carries exact latents into the
conditioning), and **three Lab-provenance details are not captured in-tree**
(§P.3). Blessing can proceed with open question 1 either ruled on now or
explicitly accepted as design-work-under-the-blessing; §P.3's three details
should be cited or dropped before the spec hardens.

### §P.1 Mechanism verification (spec claim → tree evidence)

| Spec names | Tree state | Tag |
|---|---|---|
| §1/§6 the carved seam `H3ImgRefSlot.refmod` | Real: type `H3ImgRefSlot` with `refmod?: { file: string }` — src/lib/graph/h3image.ts:395–407 ("RefMod-shaped from day one, decision 9"); the graph builder THROWS on a refmod slot (h3image.ts:1353, "the factory (H8) wires them into the conditioning"); the workbench drops refmod slots at submit (src/images/WorkbenchApp.tsx:607, "read-only in v1 — never submitted"); the session source kind `'refmod'` (src/images/session.ts:38,99). Note: today's slot content kinds are file/canvas/refmod/poserig (session.ts:35–39) — a pack is a NEW content kind on this seam, not a working path waiting. | [DOC] |
| §2/§7 the standing artifact-store carry pattern | Real and exactly as described: `registerBlobFile` is content-addressed — sha256, `relPath = blobRelativePath(hash)`, `blobRoot/<h2>/<hash>`, identical bytes dedupe to the identical path with a size+hash trustworthiness re-check (server/documents.ts:744–791); bytes land via a transient staging file (server/animation/rendering.ts:424–448); the carry artifact registers at production (`registerBytes('latent', …, carry-<attemptId>.safetensors)`, server/animation/completion-owner.ts:384) and its receipt is digest-validated (`validateContinuationArtifact`: UUID, 64-hex sha256, save-recipe version, producedAt; attempt-scoped — server/animation/store.ts:330–343, 1471–1478). | [DOC] |
| §7 the blob tree's `'latent'` kind exists | Real: the kind is produced by extension mapping (server/documents.ts:800), in production use by the canvas Motion Context chain (documents.ts:1761), and carried through the archive's kind mapping (server/documentArchive.ts:300). | [DOC] |
| §7 project archive rides the recursive relPath walk | Real: the collector walks every `relPath` string key inside document JSON (server/documentArchive.ts:32–56); the packing loop emits present blobs with hash/size and surfaces missing ones as an honest placeholder list (documentArchive.ts:282–325). | [DOC] |
| §5 re-compiling identical material is a no-op (digest-equal) | The substrate makes this fall out for the BLOBS: registration is idempotent on content (documents.ts:760–779). The manifest side (version advance vs no-op) is new logic on top. | [DOC] substrate |
| §4/§10 the token math `(w/32)×(h/32)`, ~80/s audio | NOT in code — in-app budget surfacing is absent today (only the 9-slot limit exists; map Territory 4). The math is the Lab's, adopted by the assessment (docs/research/h3-refmods-lab-assessment-2026-10-09.md:11–13). | [DOC] adopted / [SPEC] in-app |
| §4 encoding params (max_edge, 32-grid rounding recorded) | Both concepts are in-tree, elsewhere: the 32-grid is the H3 resolution rule (`H3IMG_RECIPE_PINS.canvasGrid: 32`, h3image.ts:306–308; the inpaint canvas pins to the source's 32-snapped dims, src/images/submit.ts:111–123, h3image.ts:488); max-edge downscaling exists as `reference_max_edge` (src/lib/graph/krea2edit.ts:487) and the datasets VLM's `maxEdge` (server/datasets/probe.ts:160–180). Recording them per source is new metadata. | [DOC] concept |
| §6 expectedRevision-gated document commands | The pattern is real, with a naming precision: the ANIMATION document API gates commands on `expectedRevision` (src/animation/client.ts:266–303); the workbench session rides the h3img chain's SETTINGS write, whose gate is the per-kind `settingsRevision` stale-arrival check (server/documents.ts:1659–1671). Pack selection state on the strip would ride the settingsRevision gate today, not an expectedRevision param. | [DOC] |
| §3/§6 the workbench reference strip + its hard limit | Real: the 9-slot strip (WorkbenchApp.tsx:5), enforced at append (WorkbenchApp.tsx:471,540), displayed as n/9 (:1341), refusing at validate (`H3IMG_RECIPE_PINS.refs.max: 9`, h3image.ts:306; submit.ts:108 — the refusal message already promises "RefMod bundling arrives with the RefMod factory"). | [DOC] |
| §5 compile = VAE-encode through the engine, queue-aware | The machinery is standing: stock `VAEEncode` is in the preflight class list (src/lib/preflight.ts:35) and used by the h3image and krea2edit builders (h3image.ts:1611–1638; krea2edit.ts:408–412); engine jobs queue through the engine's task-queue surface (server/managerClient.ts:22–25,145–168). No scheduler exists — v1 rides the engine's natural FIFO; the runbook's contention discipline is human/agent-facing, not app code. | [DOC] |
| §1/§8 compile minutes-class, GPU-light (the maintainer's ~1–2 min / 30 images) | Recorded provenance: the assessment's MEASUREMENT CORRECTION section (h3-refmods-lab-assessment-2026-10-09.md:58–68). A hands-on measurement, not CI-reproducible — the spec's honest-copy default rests on it. | [DOC] provenance |
| §10 the Lab's encode-once GPU verification (latent byte-match + exact round-trip) | Recorded provenance: the assessment (:17–18) — verified on the LAB's rig, not ours; our-side quality claims still route through the harness per §9. | [DOC] provenance |
| §8 multi-blob composition + lineage are the gaps | Confirmed gaps: no manifest/multi-blob artifact exists; `server/packVersioning.ts` is NODE-pack version detection — a namesake, not artifact versioning; the carry record is single-file and attempt-scoped (store.ts:330–343). | [DOC] gap confirmed |
| §2 "the runbook's queue discipline" | Naming precision: docs/agent/runbook.md is the 8189 testbed + GPU-contention discipline; the app-side queue surface is the engine task queue (managerClient.ts). The spec's intent (engine-disciplined submission) holds; the citation is loose. | [DOC] |

### §P.2 Spec-vs-source consistency (the spec against its own two inputs)

The slim shape (compile-not-training as the fast surface, images-only v1,
pattern-not-format adoption, strengths out of v1) is faithful to the
measurement correction and the assessment's verdict menu — no divergence
found. The spec also consciously NARROWS the map's unified direction: the
trained-modifier activation mode is ruled out of scope entirely (§8 row 2),
where the map held it as the direction's mode 2. That narrowing is recorded
IN the spec's resolved-decisions table, so it is a decision, not a silent
rewrite — noted here so the maintainer blesses the narrowed shape knowingly.

### §P.3 Provenance gaps — Lab details the in-tree record does not carry

Three spec claims attribute specifics to "the Lab" that appear NOWHERE in the
in-tree provenance (not in the assessment, not in the map, not in any library
capture — there is no RefMods Lab capture under docs/library/):

1. **"Descriptions start with his/her/its per the Lab's convention"** (§4) — no
   in-tree hit. [SPEC]
2. **The video/audio caveat list "RAM-before-trim, timing normalization,
   token growth"** (§3) — the phrase exists only in this spec. The map and
   assessment carry DIFFERENT audio/video cautions (audio RefMods don't
   transfer voice identity; audio cost is duration-only). [SPEC]
3. **"Subject grouping by name (case/space-insensitive)"** (§4) — no in-tree
   hit. [SPEC]

None is load-bearing for the blessing, but each would harden silently into a
blessed spec. Cheapest fix: cite or re-verify against
github.com/entert-ai/ComfyUI-H3-RefMods-Lab (v0.1.2) and land the capture, or
drop the specifics at blessing.

### §P.4 Open questions (the decision surface)

1. **The consume-side conditioning node — unnamed, load-bearing.** §6 says
   "the exact latent blobs attach to the graph" but names no engine node class.
   In-tree facts: the H3 reference path consumes IMAGES (`MiniMaxH3ReferenceToVideo`,
   preflight.ts:34); stock `ReferenceLatent` carries latents into conditioning
   on the Krea 2 path (krea2edit.ts:932–940) but its acceptance on the H3
   reference path is [UNK] (docs/research/h3-image-workbench.md:17 marks
   path-agnostic injection [inferred]); the Lab's own MIT nodes are real but
   NOT registered (no row in src/lib/nodePackRegistry.ts or
   docs/licenses/registry.md — adoption would need the registry row + fetch
   consent, and the registry-only directive governs). The three shapes: stock-class
   latent injection (needs one verified probe), the Lab's pack (registry row,
   MIT-clean), or our own minimal node pack (the map's "ours or
   Apache-compatible" rule). The blessing should name which, or explicitly
   defer with the probe as the first build step.
2. **Slot-vs-budget counting.** Does a pack selection occupy ONE of the 9
   strip slots (N sources folded inside) or N? §6's "the strip's hard slot
   limit gains the honest math" implies the token budget joins the count, but
   the rule is unstated — it changes the strip's UX contract.
3. **The manifest digest scheme.** Per-blob sha256 exists; "the pack's digest"
   over a blob SET needs a canonicalization rule (manifest bytes → digest).
   Small, but it is the immutability contract's foundation (§4).
4. **Scheduling honesty.** "Schedulable beside generation more cheaply than
   diffusion" (§5) is true per the measurement, but there is no scheduler —
   compiles and generations serialize on the engine's FIFO, and a 30-image
   compile ahead of a queued generation delays it. Fine for v1; say so.
5. **The namesake hazard.** "Pack" already means node-pack in this codebase
   (packVersioning.ts, the node-pack registry, "the h3-motion-context pack").
   A user-facing term ruling (e.g. "reference pack") avoids conversation and
   code-search collisions.
6. **The evidence bar stands.** Any "packed references hold identity as well
   as loose ones" claim goes through the null-pair-gated harness (§9); the
   stills-path A/B is the named first probe — RefMod-on-stills remains [UNK]
   (h3-image-workbench.md:17). The blessing is a DESIGN blessing; it does not
   pre-approve any quality claim.

### §P.5 Verdict table

| Area | Verdict | Basis |
|---|---|---|
| The carved seam (`H3ImgRefSlot.refmod`) | VERIFIED, as described | [DOC] h3image.ts:395–407,1353; WorkbenchApp.tsx:607; session.ts:38 |
| The artifact-store carry pattern | VERIFIED, as described | [DOC] documents.ts:744–791; rendering.ts:424–448; completion-owner.ts:384; store.ts:330–343 |
| The `'latent'` blob kind | VERIFIED, in production | [DOC] documents.ts:800,1761; documentArchive.ts:300 |
| Archive relPath walk | VERIFIED | [DOC] documentArchive.ts:32–56,282–325 |
| Token-budget math | ADOPTED, UNBUILT in-app | [DOC] assessment:11–13 + [SPEC] the in-app surface |
| Revision-gated document commands | VERIFIED, naming precision (settingsRevision on the h3img chain) | [DOC] documents.ts:1659–1671; animation/client.ts:266–303 |
| Compile machinery (VAEEncode + engine queue) | VERIFIED standing; producer lane new | [DOC] preflight.ts:35; h3image.ts:1611–1638; managerClient.ts:145–168 |
| Multi-blob + lineage gaps | CONFIRMED as the spec's named gaps | [DOC] packVersioning.ts namesake; store.ts attempt-scoping |
| Lab provenance details (pronouns, video caveats, grouping) | NOT CAPTURED in-tree | [SPEC] §P.3 — cite or drop before blessing |
| The consume-side conditioning node | OPEN — unnamed in the spec | [UNK] §P.4.1 — the blessing's load-bearing question |
| Spec vs its research inputs | CONSISTENT; the narrowing (no trained-modifier arm) is recorded, not silent | §P.2 |

*Packet ends. The spec body above stands as drafted; corrections arrive as
dated addenda per convention.*
