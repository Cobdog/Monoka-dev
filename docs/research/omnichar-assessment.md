# Omnichar intake — the .char format, Inline Studio, and the mirror question (2026-10-05)

> Sources: omnichar/ComfyUI-Omnichar (the node, GPL-3.0), omnichar/OmniChar
> (Inline/Omnichar Studio, GPLv3), omnichar/Inline-Core (the engine, **NO
> LICENSE FILE**), omnichar/Inline-Studio-Extension-Guide + Inline-Registry.
> Studio created 2026-07, renamed twice (Inline → OpenChar → Omnichar; the
> CLAUDE.md's rename-incompleteness table is itself a lesson in migration
> honesty). **Maintainer rulings: "likely solves a huge design chunk for
> creating references"; "we might mirror their surfaces if better
> structured"; "we adopt if it looks useful."**

## Verdict

**ADOPT the `.char` format** (via the Apache-2.0 SDK — integration-eligible
without touching GPL). **CONFIRM — our architecture, independently reached**:
no mirroring; we are convergent, and their arrival at our model is evidence
for it. **Pattern-adopt selectively** (the engine ideas below → the workshop
spec-round inputs). Three license tiers, three postures:

| Tier | License | Our posture |
|---|---|---|
| The `.char` format + omnichar-sdk | **Apache-2.0** (deliberately: "so closed-source tools can read .char files") | full integration — native read/write in Monoka |
| Omnichar Studio (the app) + the ComfyUI node | **GPLv3** | surfaces/workflows as PATTERNS at arm's length; the node enters the testbed via fetch-consent (flagged row) |
| Inline-Core (the engine repo) | **NO LICENSE FILE** — all-rights-reserved by default | ideas only; zero bytes, ever |

## 1. The `.char` format (the reference-creation chunk, solved)

A portable character container:
- **Role-sorted references**: face / body / wardrobe, three slots each; role
  order IS the prompt numbering (the node's "positions kept" rule — a prompt
  addresses images by number, so resolution order is stable by contract).
- **A locked description** (the character's canonical caption fragment).
- **Optionally a trained LoRA** (applied to MODEL and CLIP when present).
- **Per-architecture decode**: numbered slots for H3 (our `<Picture N>`
  addressing), reference-as-latent for FLUX.2's edit path, one batch for
  Krea — one resolved set, three wirings.
- Build anywhere (Studio local, Studio Cloud, the Encode Character node),
  use everywhere; `INLINE_CHARACTERS_DIR` shares one folder between apps.

Our mapping is nearly one-to-one: the reference strip's roles → the .char's
face/body/wardrobe; the prompt library's character fragments → the locked
description; our fetch-consent catalog gains a *character* file class (the
user's own files, user-owned — the cleanest class there is).

## 2. The mirror question: no — convergence, not superiority

Their mental model, from their own engineering guide:
**Project → Sequence → Frame → Take[]**, where *"a Frame is a slot with a
history of takes, never a single file"* and *"the take history is the core
value Comfy lacks"*; a `heroTakeId` flows downstream; the same frame surfaces
on the canvas moodboard OR the timeline. That is our document-store take
model and our surfaces-as-views doctrine, reached independently. Their
engine table restates our remediation's engine-lane directives point for
point: typed graphs (vs `widgets_values` dying mid-graph), orchestration
decoupled from a batched sampler, one device/memory policy owning
dtype/placement/offload (the same graph runs a 4090, a 6 GB laptop, or pure
CPU), custom nodes **out-of-process in per-pack venvs behind a semver SDK**
(vs "any node can break the core"), durable runs, immutable takes
("regenerating adds a take, never overwrites"), a typed model catalog
feeding node descriptors the UI renders generically (our registry-only
doctrine). Two teams, one complaint list, one answer.

**The CONFIRM is worth recording formally**: the workshop's A-1/A-2
decisions (server-side job truth; surfaces as stateless views over it) and
the take model now have an existence proof in a shipping third-party app.

## 3. Pattern-adopts into the spec-round inputs (not mirrors)

1. **The frozen wire protocol**: `src/shared/ipc.ts` — one contract module
   both sides honor, changed in lockstep. Our engine-lane API design wants
   exactly this shape (the devdocs-capture discipline, productized).
2. **Out-of-process custom nodes** (per-pack venv, semver SDK) — the
   modularity contract's engine-side endgame; note for the managed-runtime
   spec round.
3. **The device policy as single owner** — no node hardcodes a device.
4. **The extension registry** (the Available tab + a published index + a
   copy-to-build reference extension) — our node-pack registry productized;
   the guide repo is the pattern source.
5. **Their rename-migration table** — on-disk/env compatibility treated as
   load-bearing and deliberately incomplete: the lesson for any future
   Monoka rename.

## 4. Capabilities we lack that they have

- **H3 LoRA training on 16 GB** (~12.7 GB peak, TE offloaded to CPU, wants
  64 GB system RAM — our exact box). Their TRAINING.md carries the measured
  benchmark matrix. Relevant to the character-consistency lane AND to any
  future adapter work of our own (the keyframe-animation adapters' trainer
  was Modal-sponsored; a local trainer changes that calculus).
- A working ComfyUI workflow importer (their best-effort one) — the
  migration path for any user arriving from ComfyUI graphs.

## 5. The program (the eval first)

1. **The CHAR eval** (registered in the GPU ledger; CPU-first): round-trip
   a `.char` built from OUR reference assets via the Apache SDK — encode
   (roles → slots), decode (the H3 numbered-slot wiring + the batch form),
   verify role order, the locked description, and the prompt-numbering
   stability against our own `<Picture N>` conventions. One optional testbed
   render through the node (fetch-consent install, flagged row) to confirm
   the decode produces model-ready references on our stack.
2. **Native format support** on eval success: the SDK as a dependency
   (license row + lockstep per policy) or a first-party reader if the
   format spec proves small (check `packages/omnichar-sdk` before deciding
   — build on the spec, not the code, if GPL proximity matters).
3. **The character file class** in the fetch-consent catalog + the
   reference-strip import path — the UI round follows the workshop's spec
   sequencing.
4. **The engine pattern-notes** → the spec-round inputs (§3 above).
