# InvokeAI 7 — the from-scratch canvas engine assessed (engine + H3 recipes + projects + perf CI + fit)

> No Flux task (assessment-only pass; the maintainer dropped the PR link 2026-10-02 —
> <https://github.com/invoke-ai/InvokeAI/pull/9613>; the coordinator places the
> follow-ups). Date: **2026-10-02**.
>
> **METHOD:** full code read of a shallow clone pinned at the v7 merge SHA
> **`8f7bd21983aaccfae915819ea465d8312acb4af2`** ("Version 7.0 Alpha Upgrade (#9613)",
> merged 2026-10-02T00:42:09Z; PR metadata via the GitHub API: 320+ PRs, 2,607 commits,
> 5,884 files changed, +880,117/−138,931; their own pie: ~508k of the added lines are
> the `webv2` frontend, 88k new Python test lines; four credited authors). Read in full
> or head-to-tail: `webv2/src/workbench/canvas-engine/ARCHITECTURE.md` (44 KB, their own
> engine doc — the primary source for §2), `canvas-engine/contracts.ts`,
> `render/raster.ts`, `history/history.ts`, `document/` + `document-model/` listings,
> `workbench/projects/README.md` + `invk/format.ts`, `performance/*.json` +
> `scripts/performance-budgets.mjs`, `.github/workflows/frontend-tests.yml`,
> `package.json` (both frontends), the six bundled MiniMax-H3 workflow JSONs with node
> types extracted, `backend/minimax_h3/{presets,packing,reference_conditioning,
> text_conditioning,sampling,pruned_adaln_lora}.py`, `architectures/defs/minimax_h3.py`,
> `features/video/core/videoPolicies.ts`, LICENSE/NOTICE, and targeted greps for konva /
> redux / WebGL across `webv2` (all three: absent from the engine). Cross-checked
> against our stakes: [image-workbench-v2.md](../specs/image-workbench-v2.md) (read in
> full), [image-workbench-prior-art.md](image-workbench-prior-art.md) (the v6.14.1
> code-read this supersedes in part), [vlo-assessment.md](vlo-assessment.md),
> `docs/research/h3-*.md` + `src/lib/graph/h3image.ts` (what we already hold on H3).
> Webv1 maintenance status checked via the GitHub commits API on the legacy path.
> **Nothing measured — no GPU, no engine, no installs, nothing built.** Evidence tags:
> **[DOC]** verified in shipped code / official source, **[COMM]** reputable community
> claim, **[SPEC]** plausible-unverified, **[UNK]** nobody knows. Their performance
> numbers are **[DOC-m]** — their measurements, not ours.

---

## 1. WHAT V7 IS

**InvokeAI 7 alpha is a ground-up second frontend (`webv2`, ~497k LOC TS/TSX, 868 test
files) with a from-scratch Canvas2D canvas engine, a project-scoped document model
with browser write-ahead autosave, a one-page widget shell, and MiniMax H3 + LTX-2.5
video-with-audio as headline families.** The old frontend survives as `webv1`, served
only behind `--web-legacy` (`webv1/README.md`: "This is the legacy frontend… Build it
with `make frontend-legacy-build`"), and its CI gates were retired in the merge window
("ci(frontend): retire legacy gates and share contract tooling", 2026-09-30) [DOC].
License posture is unchanged: root **Apache-2.0**, `NOTICE` = "Copyright 2022-2026
InvokeAI Contributors" (one line), and the webv2 dependency set is permissive
end-to-end (React 19, Chakra 3, TanStack router/query/virtual, xyflow, ag-psd, fflate,
idb, perfect-freehand, zod, socket.io-client, lucide, plotly.js-gl2d — **no konva, no
pixi, no WebGL/WebGPU in the engine**; the only WebGL in webv2 is plotly for the
gallery Image Map) [DOC].

## 2. THE NEW CANVAS ENGINE — the load-bearing read

### 2a. Rendering tech: pure Canvas2D, no scene-graph library

`canvas-engine/render/raster.ts` defines an injected `RasterBackend` whose surfaces are
`OffscreenCanvas` (preferred) or `HTMLCanvasElement`, always with a **2D context**
(`willReadFrequently` opt-in for brush-history caches); `resizePreserving` blits the old
backing store into a fresh canvas to avoid readback. The factory is injectable "allowing
node tests to use recording surfaces instead of browser globals" — the entire engine
runs headless in vitest against fake surfaces, with a separate `*.browser.test.ts` lane
(headless Chromium via Playwright) for the real-Canvas2D facts: transformed
composition, clipping, alpha/blend modes, text metrics, PNG encoding,
`createImageBitmap`, pixel undo/redo, PSD round-trip [DOC]. There is no Konva, no
react-konva, no pixi, no WebGL anywhere in the engine (`package.json` + repo grep)
[DOC]. The engine's scale: **163 source files / 35,150 LOC + 143 test files / 55,438
LOC** — the tests outweigh the engine 1.6:1. `engine.ts` (2,897 lines) is the
composition root and document-event router; behavior lives in extracted controllers
(`Raster`, `RasterMemoryBudget`, `Render`, `History`, `Persistence`, `Editing`,
`Interaction`, `Layer`, `RasterExport`, `PsdExport`, `StagedResult`, …), each with an
idempotent `dispose()` [DOC — their ARCHITECTURE.md, read in full].

### 2b. The layer/document model underneath

`CanvasDocumentContractV3/V4`: four **stack forests** — `raster`, `control`,
`regional_guidance`, `inpaint_mask` — each a top-first tree of leaves and pass-through
**groups** (nesting ≤ 10, document ≤ 10,000 nodes; groups carry no opacity/blend/
transform/raster surface, they only organize and gate descendant state). The `bbox` is
document state. Layer sources are a discriminated union: `paint` (a
content-hash-addressed **sparse bitmap covering only content, with a possibly-negative
layer-local offset** — v6's document-sized bitmaps are the legacy case), `image`,
`text` (custom-font refs by content hash + explicit OpenType variation coordinates),
`shape` (parametric + polygon), `gradient` (with preserved extent/center/span). Leaf
state: opacity, **16 blend modes** (separable + HSL set), an ordered non-destructive
**adjustment stack** (brightness-contrast, exposure in linear-light stops, levels with
channel targeting, per-channel curves, HSL saturation, hue rotation, invert — richer
than v6's flat set), `isTransparencyLocked`, Photoshop color labels, and a
`transform: {x, y, scaleX, scaleY, rotation}` — **still affine-with-rotation only**; no
skew, perspective, liquify, or mesh anywhere [DOC]. So v7 keeps v6's
objects-rasterized-at-the-edges discipline and *adds* the sparse paint-bitmap layer —
the prior-art survey's "deliberately absent: any bitmap-paint layer" claim is now
historical. One new primitive worth naming: `CanvasLayerRegionContract` — a singleton
**regenerate region on a raster layer whose coverage is the layer's live alpha** ("it
follows strokes, erasure and transforms, contributes while the layer does, and stores
only overlay fill") — region-as-alpha rather than our region-as-marquee [DOC].

### 2c. State substrate and undo

Redux is gone entirely — no RTK, no redux-undo, no zustand, no nanostores in webv2.
`platform/state` is a hand-rolled external-store core (`useSyncExternalStore` +
selector memoization + single-flight + compare-and-swap rollback), and the ownership
split is explicit: **the workbench reducer owns the serializable canvas contract; the
per-project engine owns pixels, rendering, interaction, history, and transient editing
state.** All canvas mutations are project-addressed through one envelope
(`applyCanvasProjectMutation` with a `projectId` and `user|system` origin) delivered to
a **`CanvasProjectMutationPort` bound to an immutable projectId** — project switches
and colliding layer ids cannot redirect a delayed engine mutation [DOC].

Undo is now **engine-owned and admission-controlled** (`history/history.ts`): entries
are typed (`label`, `bytes`, `heldAssetRefs`, `dispose`, `undo()`, `redo()`), capped at
**64 entries / 256 MiB across both stacks**; an edit is *admitted before it mutates
anything* — admission reserves the undo entry's bytes without clearing redo or evicting
older steps, and "an edit whose entry could never be kept is refused as `over-budget`
while the document, pixels and history are untouched." Live strokes grow their
admission before the stroke's footprint does; a floating selection holds its admission
from lift to landing and never shrinks it. Replay is asynchronous and failure-atomic
(an entry moves stacks only after its callback completes; a throw leaves it in place
and is reported). `heldAssetRefs` retains media names an entry can restore after they
leave the live document — cleanup keeps them while the entry is on either stack: **the
blob-GC-vs-undo problem our spec §3.2 solves with a mark pass, they solve inside the
history object itself** [DOC]. Project-level undo (layout, settings, workflows) is a
separate reducer snapshot stack: 40 entries, 1,500 ms same-key merge window [DOC].

### 2d. Compositing, damage, and memory

- **Frame demand before allocation**: each frame is described once by a
  `CompositePreparation` (leaves bottom-first, effective matrices, isolated group
  scopes, document-space bounds); a pure pre-allocation pass intersects bounds with the
  viewport, and *only demanded layers are rasterized* — offscreen layers stay
  unallocated and LRU-evictable [DOC].
- **Explicit damage**: `FrameDamage` is full / none / layer-local regions; the
  scheduler widens to full on untracked invalidation, resolves regions through the
  frame's matrices into one padded screen rect, and culls every leaf/group scope whose
  screen bounds miss it [DOC].
- **Byte-accounted raster memory**: one `RasterController` owns base caches, derived
  and adjusted surfaces, group composites, decoded bitmaps, and detached snapshots —
  every store keeps a running byte total updated at each allocation ("nothing
  resynchronizes totals by rescanning"), under a **512 MiB soft limit** with a fixed
  eviction order and a reported overage class; background work (thumbnails, exports,
  PSD) *reserves* bytes before allocating and returns typed `over-budget` outcomes
  [DOC].
- **Raster read leases**: async pixel reads return a `RasterReadLease` (pixels, extent,
  freshness guard, idempotent release) that pins its source layer from before
  rasterization until release — eviction and paint-trimming cannot reshape pixels an
  operation is still reading [DOC].
- `DecodedBitmapPool` replaces permanent decoded-image caching (short-lived coalesced
  leases); staged candidates use a compressed-Blob LRU (24 entries / 64 MiB, ≤2
  full-res prefetches in flight) [DOC].
- Group isolation: filter previews and floating selections compose *inside* the group's
  isolated surface under its opacity/blend/adjustments; the group cache refreshes
  damage regions in place (union of member damage padded by one source pixel for
  bilinear reach) [DOC].

### 2e. How the generative round-trip survived (got stronger)

The bbox→composite→generate→staging spine survived as a **snapshot transaction**:
invocation first crosses a paint-flush barrier, captures the post-flush document
snapshot, plans every raster/control/regional composite, and **detaches exactly the
contributing layers into caller-owned immutable surfaces** (`CanvasRasterSnapshot`,
released in `finally`, valid through engine cooldown). Composites dedupe two ways —
plan-key → last result, and **pixel SHA-256 → uploaded image** (a changed plan with
identical pixels reuses the upload); dedupe entries publish to the persistent cache
only after all compositing/upload/compile/dispatch complete. `enqueueCompiledSnapshot`
reads bbox, dimensions, and a monotonic `documentRevision` **from the snapshot, not
the live project**; generated candidates are placed from
`queueItem.snapshot.canvas.document.bbox`, so later bbox edits do not move the result;
wholesale canvas replacement bumps `documentRevision` and **completed results from a
replaced session are dropped** [DOC]. Staging survives with next/prev, commit, and a
continue variant that **banks a candidate as a disabled raster layer while keeping the
staged preview and selection** — takes-banking, engine-guarded; staged acceptance is
one admitted history entry whose undo removes the accepted layer and redo restores it
identically ("undo intentionally does not return the accepted candidate to staging")
[DOC].

### 2f. What the performance claims rest on

Their claims are pinned by deterministic tests, not benchmarks: allocation counts and
byte totals asserted in CI ("wall-clock timing is informational only") —
`documentModel.budget.test.ts` pins the 10,000-node document (a leaf edit constructs
`depth+1` index entries, never materializes the node list; the document index is a
structurally-shared derivation chain flattened every eight steps), and
`layersPanel.budget.test.ts` + a Chromium test on a real 2,001-node document pin the
layers panel (row identity across selection, one node visit per build, linear drop
projection; above 2,000 nodes the panel **degrades explicitly** — thumbnails and drag
reorder switch off, every command stays). The committed browser baseline measures the
canvas route at **~1.13–1.16 s semantic-ready median, ~128 ms load, 160–199 ms longest
task** against a 50 ms long-task target that is currently *not enforced* (their
`timingPolicy.enforce: false`, honestly gated on "an explicitly identified stable
runner" with 20 stable runs) [DOC-m — their measurements]. Notably absent: no
liquify/mesh/perspective deformers ship, so the one place OUR spec expects CPU
compositing to measurably choke (§4.3's live deformer preview at 8MP) is untested by
their engine.

### 2g. The legacy Konva subtree: frozen

`webv1` still builds (`--web-legacy`) with konva 9.3.22 in its package.json, but the
last feature commits under the old `controlLayers` path predate the rename
(2026-09-24, upstream merges); the rename and "retire legacy gates" commits are
mechanical, and the README labels it legacy outright. **The subtree is frozen, not
maintained** — vendoring at the pinned v6.14.1 tag stays legal (Apache-2.0) but buys
no upstream fixes from here on [DOC + commits API].

## 3. THEIR H3 RECIPES (the bundled MiniMax-H3 code)

### 3a. Graph shapes

Six bundled workflows (`invokeai/app/services/workflow_records/default_workflows/*-
MiniMax H3.json`): Text/First-Frame/Last-Frame/First-and-Last/Reference/Extend. All
share one spine — `minimax_h3_model_loader` + **`minimax_h3_lora_loader` (the turbo
LoRA loader is wired in every bundled graph)** + `minimax_h3_ideal_dimensions` +
`minimax_h3_text_encoder` → `minimax_h3_denoise` → `minimax_h3_latents_to_video` +
`core_metadata` (recall) + seed/steps primitives. Ref2V adds
`minimax_h3_{video,image}_reference` → `minimax_h3_reference_conditioning`; frame
modes add `image` → `minimax_h3_frame_conditioning`; Extend composes
`extract_video_range` → `video_frame_extract` → frame conditioning, with `video_concat`
stitching the extension onto the source clip. `minimax_h3_ideal_dimensions` derives
the canvas from the keyframe's aspect ratio (768 short edge, 768×1344 soft cap, 32-px
grid, 1:4–4:1) and its docstring states the wiring law: prompt, frame conditioning,
and denoise "all three must share the same canvas" [DOC].

### 3b. Ref2VA reference handling — how the badges map to conditioning

`text_conditioning.py`'s `build_ref2va_presentation` [DOC]: every reference is
tokenized in packed request order with **per-modality numbering** — `<Picture i>: ` +
a vision pad run for images, `<Audio j>: ` *alone* for audio ("a waveform never
reaches the conditioner" — audio conditions through the audio-VAE path, not the text
encoder), `<Video k>: ` + one **timestamped** vision block per merged frame group
(`<0.2 seconds>` + a `<|video_pad|>` run) for videos, with an audio-carrying video
labelled `<Audio j>:` *before* `<Video k>:`. The user prompt follows verbatim, no chat
template. The webv2 Video panel **badges each reference card with the labels it earns
here** (`referencePromptLabels` mirrors the numbering and "must change with it"), and
the docstring is honest about the failure mode: "a badge that names a label the prompt
cannot resolve fails silently — the model simply ignores the mention." Caps:
`references: {maxImages: 9, maxVideos: 3, extend: true}`; reference extension derives a
linked tail reference from Initial Video rather than frame-conditioning [DOC]. This is
the same wiring-order-addressing doctrine our `h3-transitions` doc and `h3image.ts`
already implement (`<Picture N>` numbered by wiring order) — **CONFIRM, not new**.

### 3c. Turbo operating points

`videoPolicies.ts` [DOC]: FL2VA **Turbo = 6 steps, cfg 1**; **Ref2VA Turbo = 4 steps,
cfg 1**; LightX2V releases resolve to **8** via a name-pattern override. LoRA discovery
is by delimited-name pattern (`turbo`, `lightx2v`,
`minimax_h3_(fl2v|ref2v)_turbo_\d{1,2}step_v\d`), and **Ref2V Turbo is variant-scoped:
it must never auto-apply to FL2VA**. Base defaults: 50 steps, 1344×768, guidance-
distilled — no negative prompt, no CFG, **no scheduler to choose** (`minimax_h3_denoise`
"steps video and audio down two hardcoded flow schedules": video shift 12.0, audio
shift 3.0). Resolution options: `768 highres` (native) and **`768 lowres`** — a
first-party fast-preview canvas family that pins the LONG edge to 768 (~half the
pixels for non-square ratios, honestly documented as below training resolution)
[DOC]. The pruned-checkpoint LoRA problem is solved exactly the way our
`h3-lora-form-compatibility.md` deep-read described larryvrh's node: `pruned_adaln_lora.py`
re-injects the AdaLN delta at runtime — `delta(t) = up @ (down @ silu(t_emb(t)))` with
`silu(t_emb)` lerped from the [1025, 2688] grid published with the Turbo LoRA's
ComfyUI node (**pinned to `Larryvrh/ComfyUI-MiniMax-H3-Turbo@e7ad532`, fetched and
cached like any model file**), applied by forward pre-hooks + per-linear hooks under a
context manager — "hooks leave the module tree and its weights untouched," i.e. **the
adapter is never merged**, the same doctrine our Qwen turbo lane pins [DOC].

### 3d. Conditioning-media mechanics (the fine print)

`reference_conditioning.py` + `sampling.py` [DOC]: image references normalize
LANCZOS to a **2048-px short edge** (`detail: "max"`), or `"match"` — "mirrors
ComfyUI's cheaper option," scaling the reference to roughly the generation's pixel
area, "cutting the rows the reference contributes to every denoising step by an order
of magnitude" (we already hold this dial as `ref_image_size` / our
`reference_detail: 'max_identity_2048'`). Video references resample onto the 24 fps
grid by whole-frame drop/dup (ffmpeg `fps`-filter arithmetic), truncate to the
generated frame count, and snap DOWN to `17n+5`; the text conditioner samples them at
**2 fps**. Audio truncates at native rate to the generated duration and resamples
**once** to the audio VAE's 32 kHz with a torchaudio-parity windowed-sinc pass; the
audio posterior **mean is taken, never sampled**; stereo is two batch items. Visual
reference rows encode with the keyframe recipe (ImageNet norm, **seed-42 posterior
sample**, fp16 round-trip, mean/std normalization) and are returned CLEAN — the denoise
state noise-augments them to **t = 0.999** with the request generator's leading draws;
audio rows are never noised. Reproducibility contract: one generator per request, fixed
draw order (keyframe noise → video noise → audio noise), CPU-seeded so draws are
identical across CUDA/ROCm/MPS. Frame grid: `17n+5` at 24 fps, video floor 90 frames
(3.75 s, accepted for fast tests), ceiling 15 s, still-image path = the single 5-frame
block (offered for frame extraction only) — the **17k+5 grid's third independent
production sighting** (ours, vlo's, now Invoke's; their `MINIMAX_H3_VIDEO_FRAME_CHOICES`
makes the nodes a choice list "so a request can never miss the grid" — the same
picker-snapping UX vlo ships). The vendored-from-diffusers `packing.py` is kept
byte-identical to upstream for clean re-syncs, with first-party policy split into
`presets.py` — the same vendoring hygiene our conventions enforce [DOC].

### 3e. What they solve that we haven't (and what we already hold)

Held by us already (CONFIRM): the 17k+5 grid and 32-px/768-short-edge canvas contract;
`max|match` reference detail; `<Picture>/<Video>/<Audio>` wiring-order addressing;
turbo-never-mixed/never-merged + the larryvrh re-injection mechanism (our
h3-lora-form-compatibility deep-read); R2V-softer-than-I2V; the AR→ideal-dimensions
composition (our AR-first tiers). **New to us, adoptable as facts/patterns**:
(1) the audio-reference conditioning mechanics above (posterior mean, single 32 kHz
resample, label-only text presence, never-noised rows) — implementation-grade detail
for our pending audio-lane ruling; (2) **FL2VA-6 / Ref2VA-4 / LightX2V-8** as shipped
step defaults with variant-scoped LoRA discovery (our ecosystem doc holds Comfy's
8-step T2V/I2V + 4-step R2V; their 6 is a refinement of the FL2VA default); (3) the
`768 lowres` fast-preview canvas tier (a cheap preview arm our tier ladder lacks);
(4) **generation metadata embedded in the MP4** for cross-install recall plus an
external `/recall/video` API (ours is PNG-side; the video-exit story needs this
pattern); (5) upload normalization (.mov/HEVC/ProRes → H.264 MP4, audio files →
waveform videos); (6) the trimming UX — `TrimBoundThumb` live-frame thumbnails on trim
bounds, `PlayClipSpanButton` previewing the trimmed window, keyboard reorder of
references — the conditioning-media ergonomics our v1 reference strip doesn't have
[DOC].

## 4. THE PROJECTS MODEL

`workbench/projects/README.md` (read in full) + code [DOC]:

- **Server-authoritative with optimistic concurrency**: writes carry
  `expected_revision`; a divergent revision or remotely deleted project "requires an
  explicit user decision" while **editing continues**; saving a copy reuses one
  reserved identity even after a lost response. Documents cap at **32 MiB UTF-8 JSON
  both sides of the API**; the server answers **412** to clients too old to open a
  project; 21 one-way migrations each in their own transaction, with a timestamped DB
  backup before migrating (no downgrade path — older builds refuse the DB).
- **Browser-first is a write-ahead draft store, not a mirror**: account-owned
  IndexedDB holds *only unacknowledged project drafts, active queue runs, receipt
  acknowledgements, and bounded recall values* — "clean server documents are not
  mirrored." Draft generations fence acknowledgements; draft-writer ownership +
  cross-tab notifications prevent one editor overwriting another's unacknowledged
  work; **Web Locks** own queue ownership; journal writes precede submission and
  backend receipts make retries safe after lost responses. Completed runs keep exact
  recall values in an LRU (500 entries / 32 MiB). Browser-storage failures degrade
  local durability without blocking server persistence, and conflicted drafts are
  retained "until explicitly resolved or deleted; never silently evicted."
- **`.invk` v2**: a ZIP (`application/zip`) with fixed entries — `manifest.json`,
  `project.json`, optional `board.json`, `images/` + `videos/` folders; readers
  tolerate unknown entries; v1 archives (the old canvas-project format) get a *named*
  refusal (`legacy-canvas-project`), not a silent failure; import clears library
  source references ("a portable file never names a library write target"). Font
  dependencies are content-hash records — export defaults to references, "include font
  files" embeds once per hash after authenticated download + checksum verification,
  and a failed required download fails the export rather than shipping silently
  incomplete.
- **Per-project workflow ownership**: a project owns an ordered workflow collection +
  active selection + per-workflow session histories (40 entries per project across all
  of them, structurally shared); the shared library changes only through explicit
  publication, and a stale revision is a 409 the user resolves. Undoing an edit never
  undoes a save (source metadata sits beside the document, outside graph history).
  An **intermediates manager** shows per-project temporary-file footprint and cleans
  it "without touching anything an open project still needs."

## 5. THE PERFORMANCE-BUDGET CI (the gate they're "a little smug about")

Two legs, both failing PRs [DOC]:

1. **Build leg** (`vite build` → `check-architecture-performance.mjs` over a custom
   `chunk-source-manifest.mjs` plugin that maps every emitted chunk to its owning
   source directories): per **route** (currently `launchpad`, `editor`), walk the
   static-import graph and measure initial assets — raw/gzip/brotli bytes, CSS, fonts,
   images, largest asset, owned bytes, request count, script request count. Committed
   baseline (`performance/architecture-baseline.json`, capturedAt 2026-09-29):
   launchpad **893,586 B brotli / 36 requests / 20 scripts**; editor **1,243,382 B
   brotli / 74 requests / 58 scripts**.
2. **Browser leg** (`measure-architecture-performance.mjs`, Playwright): per route ×
   state profile, resource metrics for initial AND activated (widget-opened) sets plus
   timing medians (DOMContentLoaded, load, a semantic route-ready mark, layout-switch
   and project-switch medians, longest-task max). Committed baseline: editor-canvas
   ~1.13–1.16 s ready / ~128 ms load / 160–199 ms longest task.

The stealable mechanics: **(a) limit derivation** — byte metrics get
`min(max(reference, committed) + max(1%, 4 KB), committed + max(10%, 32 KB))`: a small
living allowance over the worse of base-branch reference vs committed, capped by a
hard ceiling over committed; **request counts get no allowance** (exact min of the
two). **(b) reference vs committed** — every push to main records its own measurements
to a actions/cache key; PRs restore the *base commit's* reference and compare against
it, so the gate catches relative growth even below the committed ceiling, and
reductions must be re-recorded too ("to protect the savings"). **(c) structural
rules** — each route's initial **source-owner graph must match the baseline exactly**
(added/removed owner directories fail the build, catching accidental initial-bundle
pollution that bytes alone would hide), plus explicit forbidden-initial-source lists
(e.g. `_agpsd` must not be in launchpad's initial graph) and barrel-import budgets
(`@platform/ui` ≤ 160 direct importers; the retired `@workbench/types` hub pinned at
0). **(d) accountability** — every budget row carries `owner` and `remediationTicket`,
so a failure names who owns it and where to fix. **(e) honesty gates** — timing
enforcement is present but disabled until a stable runner is identified (needs 20
stable runs), and a schema/metric drift in the reference falls back to the committed
baseline rather than failing. The whole gate runs inside `pnpm check:release` in
`frontend-tests.yml`, gated on webv2-path changes.

## 6. FIT FOR US — the verdict menu

**CONFIRM (the load-bearing one).** Our Phase C decision — *share the camera, own the
content engine* — now has a production-scale, from-scratch, **Canvas2D-only** existence
proof from the very codebase our spec cited as the Konva proof. v7 validates: CPU
Canvas2D compositing is sufficient for a layered generative editor at 10k-node/2k-panel
scale *when* paired with frame-demand culling, explicit damage regions, byte-accounted
memory, and admission-controlled history; and the module-ownership discipline
(`canvas-engine/` "must not import React, widgets, application canvas operations,
generation graphs, socket infrastructure, or backend networking —
`importBoundaries.test.ts` enforces that rule") is our §2.1/§13.1 lint-enforced port
boundary, shipped by someone else at 35k LOC. Also CONFIRM, independently arrived at:
takes-banking (their continue-staging = our §9 takes-as-layers), the history-owns-
asset-retention answer to our §3.2 blob-GC mark pass (`heldAssetRefs`), the
snapshot-frozen generative round-trip, AR→canvas dimension derivation, 17k+5 (third
sighting), `max|match`, wiring-order addressing, turbo-never-merged, and the
Konva-free headless-test seam (their `RasterBackend` injection is our §2.3
headless-harness proof, one level deeper — the renderer itself is mockable).

**ADJUST (spec §4.2 + D2's why-line, and §12 ruling 2's escalation door).** The
citation "konva… the substrate Invoke already proved at scale" is now v6-historical:
Invoke no longer runs Konva, and the current proof is a hand-rolled engine. The
recommendation itself (adopt konva as the library candidate) still stands — v7 is
evidence that *someone with four engineers and three months* can write the engine, not
that we should — but the honest framing flips: the choice at Phase C is now
**konva-the-library (buy: scene graph, transformer, caching, 57 KB) vs
v7-pattern-the-blueprint (build: their ARCHITECTURE.md is the best public spec of the
damage/memory/history discipline any raster editor needs)**. Either way, the
discipline patterns below are Phase C inputs *regardless of substrate* — konva gives
us none of them. The Q2 escalation-door note changes identity twice over: the v6
skeleton subtree is **frozen** (webv1 legacy'd, gates retired — the door is now a
pinned-tag door you carry alone), and a **new living Apache-2.0 vendor/port candidate
exists** (the v7 engine core: React-free by enforced boundary, port-shaped
`CanvasProjectMutationPort`, 55k LOC of tests, and its own architecture doc) — the
middle arm of the three-way line is no longer the v6 Konva subtree.

**CORRECT (prior-art §1.3's "deliberately absent" list).** Two v6 facts are now
historical: "any bitmap-paint layer" is absent no longer (v7's `paint` source is a
first-class sparse content-addressed bitmap with layer-local offsets — the exact shape
our D3 raster-chunks decision names, now with a production precedent), and the
"stateApi indirection makes a partial vendor tractable" seam died with the RTK store
(replaced by a cleaner port). The affine-only transform claim SURVIVES v7 unchanged
(rotation included, no skew/perspective/liquify/mesh) — our prior-art §6 gap #1 (the
union) stands.

**ADOPT (patterns — Apache-2.0, so this is prior-art ADOPT territory like the v6
read, not the siblings' reimplement-at-arm's-length ledger):**
1. **Admission-controlled history** (§3.3 candidate): reserve the undo entry's bytes
   *before* the edit mutates; refuse the edit rather than evict history mid-gesture;
   grow-not-shrink admissions for live strokes and floats. Pairs with our §3.2 mark
   set; note their history is in-memory undo (trimmed on cooldown) while OURS doubles
   as persisted provenance (D4) — adopt the admission discipline, not the
   non-persistence.
2. **The snapshot transaction for generation** (§5.2): paint-flush barrier → frozen
   document snapshot + detached surfaces → compile/enqueue from the snapshot →
   candidates placed from the snapshot's bbox. Steal wholesale; keep our
   land-and-mark-diverged arrival choice (they *drop* replaced-session results — a
   stricter rule that suits their staging model, not our takes model), but their
   `documentRevision` guard is the right tool for wholesale-replacement staleness.
3. **Frame demand before allocation + explicit damage + byte-accounted working sets**
   (Phase C): none of this comes with konva; their formulations (CompositePreparation,
   FrameDamage, the fixed eviction order, RasterReadLease pins) are the reference
   design.
4. **Content-hash composite dedupe** (§5.2/§6): plan-key and pixel-SHA dual cache for
   generation inputs — the same discipline our blob store uses, applied to the
   composite step.
5. **Sparse content-sized paint bitmaps with offsets** (D3's raster chunks): now
   proven at production scale, including the migration concern (legacy document-sized
   bitmaps as the offset-absent case).
6. **The perf-budget CI shape** (§5 above) for our repo: route-level build-manifest
   measurement + source-owner structural graph + browser leg + the reference/committed
   limit derivation + owner/ticket rows. Our canvas budget harness (§13.5) and the
   frontend remediation arc both want this skeleton; we are vite + surfaces-registry
   shaped already.
7. **Projects-model patterns for Phase B** (§3.2 + audit defect 9's deliberately-unset
   concurrency policy): expected_revision optimistic concurrency with
   edit-continues-during-conflict, Web Locks for cross-tab, write-ahead IndexedDB
   drafts that mirror *only unacknowledged* work, journal-before-submit queue
   receipts, 32 MiB document caps, 412 for too-old clients, per-migration
   transactions + pre-migrate backup, and the `.invk`-v2 ZIP shape (versioned
   manifest, named legacy refusals, checksum-verified optional embedding) as the
   candidate form for our top-level-document export/archive (ruling 5).
8. **H3 fact set** (§3e): audio-reference mechanics, FL2VA-6/Ref2VA-4/LightX2V-8
   defaults + variant-scoped turbo discovery, the `768 lowres` preview tier, MP4
   metadata recall + `/recall/video`, upload normalization, the trim-UX vocabulary —
   into the family record/library as dated enrichments, re-measured on 8189 before
   anything hardens (house rule).

**NONE / skip:** the widget shell and command palette (their app shell, not ours);
Image Map + semantic search (gallery-side, plotly-WebGL — noted, not our lane);
LTX-2.5 specifics (we hold ltx-vs-h3); the backend quantization/VRAM work (engine-
side, ComfyUI is our engine); workflow `For` loops (our wiring surface's scope).

## 7. LICENSE + HEALTH

- **Apache-2.0 end-to-end for the new code** (root LICENSE + NOTICE + pyproject), all
  webv2 deps permissive, the H3 backend's vendored diffusers pieces kept
  byte-identical with first-party policy split out. Under our policy this is
  **vendorable/portable code**, not pattern-only — the only InvokeAI assessment so
  far where ADOPT-as-code is on the table for the engine itself. The silu-temb grid
  they fetch is Apache-2.0 (larryvrh's repo), pinned to a commit [DOC].
- **Health signals, unusually strong for an alpha**: 55k LOC of engine tests with
  deterministic allocation/byte assertions; an architecture-governance layer
  (dependency policy with owners and expiring migration exceptions, workbench/canvas
  ownership manifests, generated import/caller matrices, axe journeys, secure-context
  API checks) that *is* the modularity contract as CI; an honest perf gate whose
  timing enforcement is off pending a stable runner; a 44 KB engine ARCHITECTURE.md
  that matches the code. Risks to record: **4 people, 3 months, 2,607 commits** — a
  rewrite-paced project whose alpha just merged; the one-way DB migrations + legacy
  freeze mean the v6 escape hatch rots; bus-factor concentration (four credited
  authors) [DOC + SPEC].

## 8. VERDICT

**CONFIRM (Phase C's own-the-engine choice, Canvas2D adequacy, the ports discipline,
takes-banking, history-owns-retention) + ADJUST (spec §4.2/D2's proof citation — now
v6-historical; §12 ruling 2's escalation door — the v6 subtree frozen, the v7 engine
the new living Apache-2.0 candidate) + CORRECT (prior-art §1.3: bitmap-paint layers
now exist; the stateApi seam is gone) + ADOPT (eight pattern sets: admission-
controlled history, the snapshot generation transaction, frame-demand/damage/memory
budgeting, composite dedupe, sparse paint bitmaps, the perf-budget CI shape, the
projects-model concurrency patterns, the H3 fact set) — the single most consequential
external release for the workbench v2 program since the spec was blessed, and the
first where the code itself is license-clean to port.**

| Question (the dispatch's five) | Answer (one line) |
|---|---|
| What replaced Konva? | A from-scratch, React-free, Canvas2D-only engine (35k src + 55k test LOC): four-forest grouped document, engine-owned admission-controlled history, frame-demand/damage/byte-budget rendering, snapshot-frozen generation round-trip — no WebGL, no scene-graph library |
| Phase C impact? | CONFIRM own-the-engine + Canvas2D; konva stays our library candidate, but the "proved at scale" citation needs a dated addendum and the v7 ARCHITECTURE.md becomes the discipline blueprint either way |
| Escalation door? | v6 Konva subtree frozen (legacy'd, gates retired) — pinned-tag door only; new living door: the v7 engine (Apache-2.0, port-shaped, test-rich) |
| Their H3 recipes? | Six bundled graphs on one spine; per-modality `<Picture>/<Video>/<Audio>` badge→token mapping; turbo FL2VA-6/Ref2VA-4/LightX2V-8 cfg-1 no-scheduler; audio-conditioning mechanics + MP4 recall + lowres tier are the new-to-us items |
| Steal the perf CI? | Yes — build-manifest route budgets + source-owner structural graphs + browser leg + reference-vs-committed limit derivation + owner/ticket rows; ports to our vite + surfaces shape directly |

## Sources (retrieved 2026-10-02)

- `invoke-ai/InvokeAI` @ `8f7bd21983aaccfae915819ea465d8312acb4af2` (shallow clone;
  full read per METHOD): PR #9613 metadata (GitHub API) ·
  `invokeai/frontend/webv2/src/workbench/canvas-engine/` (ARCHITECTURE.md, contracts.ts,
  engine.ts headers, history/, document/, render/, tools/ listings) ·
  `workbench/{projects,canvas-operations}` · `performance/*.json` ·
  `scripts/performance-budgets.mjs` · `.github/workflows/frontend-tests.yml` ·
  `features/video/core/{videoPolicies,settings}.ts` ·
  `backend/minimax_h3/{presets,packing,reference_conditioning,text_conditioning,sampling,pruned_adaln_lora}.py` ·
  `architectures/defs/minimax_h3.py` ·
  `app/services/workflow_records/default_workflows/*MiniMax H3.json` (6 graphs,
  node types extracted) · `webv1/README.md` + webv1/webv2 package.json · LICENSE /
  NOTICE / AGENTS.md.
- GitHub commits API: `invokeai/frontend/webv1` + legacy `web/src/features/controlLayers`
  activity (freeze verification).
- In-repo: [image-workbench-v2.md](../specs/image-workbench-v2.md) (the blessed spec) ·
  [image-workbench-prior-art.md](image-workbench-prior-art.md) (the v6.14.1 read) ·
  [vlo-assessment.md](vlo-assessment.md) (house format + the sibling ledger this is
  deliberately NOT part of) · `docs/research/h3-{transitions-and-latent-continuity,
  image-workbench,lora-form-compatibility}.md` · `src/lib/graph/h3image.ts` ·
  `docs/research/ecosystem-2026-09.md` (what we already hold on H3).

---

## Addendum — the named follow-ups (for the coordinator; no doc was edited this pass)

Per the dispatch ("name the specific sections"), the dated addenda this assessment
argues for, none applied here:

1. **`docs/specs/image-workbench-v2.md` §4.2 (+ D2 why-line)** — dated addendum: the
   "Invoke proves raw imperative Konva at 53.5k-LOC scale" citation is v6-historical
   (v7 replaced Konva with a from-scratch Canvas2D engine, read at `8f7bd21`); konva
   remains the adopted library candidate; the v7 discipline patterns
   (frame-demand/damage/byte-budget/history-admission) become Phase C inputs
   regardless of substrate; §4.3's pixi escalation trigger is unaffected (v7 ships no
   deformers — the 8MP live-preview risk stands untested by them).
2. **`docs/specs/image-workbench-v2.md` §12 ruling 2 + D7** — escalation-door update:
   the v6 skeleton subtree is frozen (webv1 legacy'd `--web-legacy`, CI gates retired
   2026-09-30) — the stateApi vendor door is now a pinned-tag option with no upstream
   maintenance; a new living Apache-2.0 vendor/port candidate exists (the v7 engine
   core, React-free by enforced import boundary, `CanvasProjectMutationPort`-shaped,
   55k LOC of tests). Selective-for-surfaces remains the default.
3. **`docs/specs/image-workbench-v2.md` §3.3** — candidate discipline note:
   admission-controlled byte budgets on undo entries (refuse the edit, never evict
   mid-gesture); our persisted-provenance goal (D4) unchanged.
4. **`docs/specs/image-workbench-v2.md` §3.2 + the audit's defect-9 policy line** —
   Phase B input: the v7 projects-model concurrency shape (expected_revision +
   edit-continues, Web Locks, unacknowledged-only drafts, journal-before-receipts) as
   the reference for the two-tabs policy due at Phase B.
5. **`docs/specs/image-workbench-v2.md` §5.2** — dated note: steal the snapshot
   transaction + snapshot-bbox candidate placement + `documentRevision`
   wholesale-replacement guard; keep our land-and-mark-diverged arrival semantics
   (v7 drops replaced-session results — stricter than our takes model wants).
6. **`docs/specs/image-workbench-v2.md` §9** — CONFIRM note: v7's continue-staging
   (bank candidates as disabled raster layers, keep comparing) is the strongest
   external kinship yet for takes-as-layers.
7. **`docs/research/image-workbench-prior-art.md`** — dated addendum: three v6 facts
   superseded (Konva no longer their substrate; bitmap-paint layers now exist as
   sparse content-addressed sources; the stateApi seam replaced by the mutation port);
   affine-only survives.
8. **Family record / H3 docs + `docs/library/`** — the §3e fact set (audio-reference
   mechanics; turbo step defaults + variant scoping; lowres tier; MP4 metadata recall;
   trim-UX vocabulary), 8189 re-measure before hardening.
9. **Frontend remediation arc (the `frontend-competitor-insight-2026-09-28` follow-up
   set)** — the §5 perf-budget CI shape as a steal candidate for our repo's next arc.
