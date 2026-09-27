# Image-workbench prior art — InvokeAI's canvas stack (separability-verified), the manual-editing toolset, the generation-canvas lineage, and the licensing map

> Compiled 2026-09-27 for directive `b90ce8f6` on epic `4lphxv8` (the image-workbench
> vision; no Flux task per the dispatch instruction). Feeds the workbench spec round.
> The maintainer's frame, verbatim intent: openOutpaint's premise was "basically our
> infinite canvas, but you could stamp down an image, inpaint, outpaint, generate on
> an infinite canvas — anchor and define the context window and resolution
> dynamically"; the vision adds "editing features where you can anchor to a selected
> region and edit aspects… manual painting, liquify, hand edits, resizing,
> perspective, meshing and pinching. Layers. Essentially a full image editing app" —
> modular, potentially standalone later. InvokeAI tooling is wanted; their
> diffusers-based backend is explicitly not.
>
> **METHOD.** (1) **InvokeAI code-read at a pinned revision** — shallow clone of
> `invoke-ai/InvokeAI` at tag **v6.14.1** (commit `027be7e`, release bump 2026-09-06);
> every §1 claim marked **[DOC]** is read from that tree (file paths cited). (2) Three
> web-research passes (Krita/GIMP-GEGL/Photopea internals; the JS/TS math-library
> landscape; the openOutpaint lineage) run as subagent fan-out on 2026-09-26/27;
> their license claims are **[API-2026-09-26]** (GitHub API `license.spdx_id` /
> fetched LICENSE text) or **[DOC]** (fetched primary source) — sub-verified spot
> checks are noted where I re-checked load-bearing facts myself (npm registry for
> Invoke's frontend deps). (3) Repo grounding: our canvas substrate, workbench seed,
> and specs read at HEAD of `main` (e30fc71). No GPU, no engine work, no installs.
> The openOutpaint **core-vision extraction is a separate in-flight doc** (the vision
> agent); this survey covers it at lineage level only. Tags: **[COMM]** reputable
> community claim, **[SPEC]** plausible-unverified reasoning, **[UNK]** nobody knows.

---

## 0. Verdict summary

| # | Question | Verdict | Confidence |
|---|----------|---------|------------|
| A | **Is InvokeAI's canvas separable from their diffusers backend?** | **Yes — with a narrow, well-shaped port seam.** The whole canvas engine (renderer, document model, tools, compositing, staging) talks to their backend through four things: the image upload/fetch endpoints (`uploadImage`/`getImageDTOSafe` → `ImageDTO`), the socket event type, one model-config selector, and the Redux store shape. A `stateApi` indirection module already wraps store access. Apache-2.0 end-to-end (canvas tree has zero GPL strings; all canvas deps MIT/BSD). The part welded to their backend is exactly the part the maintainer dislikes: the params slice and the per-model graph builders. | **High [DOC]** |
| B | **Adopt Invoke as code or as pattern?** | **Both, split by layer.** As code (Apache-2.0 → our AGPLv3 is compatible): the Konva module skeleton (`CanvasManager`/`CanvasModuleBase`), the object/entity document model (zod), the math/util/pressure/filters modules, the bbox scaling machinery, the compositor+worker, tests. As pattern: the staging area, run-workflow-on-canvas, regional guidance compilation, SAM integration. Realistic mode: **vendor-the-core at a pinned revision + own-the-surfaces** — the full subsystem is 409 files / ~53.5k LOC and idiomatic to RTK+redux-undo; vendoring all of it would weld their store idioms into ours. The spec round decides the cut line. | **High [DOC]**; cut line is **[SPEC]** |
| C | **Do the Photoshop-class deformers exist anywhere adoptable?** | **The algorithms are fully mapped, the JS implementations mostly don't exist.** Krita/GIMP converge on the same three families (MLS point-pair warps; stroke-driven displacement with radial falloff; homography + coordinate-weight cages) — both GPL, so pattern-only. In JS: **no maintained MLS library exists** (verified three ways), TPS is ~50 lines over `ml-matrix`, glfx.js's MIT bulge/pinch shaders are liftable, OpenCV.js gives `remap`/`warpPerspective`/`findHomography`/`inpaint` under Apache-2.0. This is in-house math over permissive primitives — the workbench's genuine novel-tool territory. | **High [DOC/API]** |
| D | **The lineage: anything to take beyond Invoke?** | **openOutpaint (MIT, dormant 2024-08, no successor fork) is the interaction-model source** — reticle-as-region-contract, context-window snapshot, overmask seam control, workspace persistence. **AlekPet's PainterNode (MIT, active)** is the one maintained MIT brush-surface reference (incl. MyPaint brushlib.js). Krita-AI-Diffusion stays pattern (transport study already held). Everything else in the lineage is pattern-or-skip; nothing else clears both the license and maintenance bars. | **High [API]** |
| E | **The nobody-has-it list** | The **union** — anchor-bbox generative editing + liquify/mesh/perspective + layers in one open tool — exists nowhere. Invoke has the generative canvas but **affine-only transforms** (no skew/perspective/liquify/mesh — verified in `CanvasEntityTransformer`); Krita/GIMP have the deformers but no generative canvas; openOutpaint has neither deformers nor layers-as-editors. Plus: no engine-pluggable canvas document model (Invoke's is queue-welded), no video-handoff take model on any canvas, no region-anchored *edit families* (Invoke regions are prompt-only), no open TS raster editor with deform-ops-as-editable-parameters. See §6. | **High [DOC]** on absences |

---

## 1. InvokeAI's canvas stack (the primary study) — v6.14.1, commit `027be7e`

### 1.1 What it is, in one paragraph

The canvas (feature name `controlLayers`, shipped as the main canvas since v5/v6)
is a **layered generative image editor**: an infinite stage with pan/zoom, four
entity kinds (raster layers, control layers, regional-guidance regions, inpaint
masks) plus global reference images, a toolset (brush/eraser with pressure, shapes,
lasso, gradient, text, color picker, SAM points, move, bbox), an affine transform
mode, per-layer filters, undo/redo, a portable project format, and a staging area
for generated candidates — compiled at dispatch time into Invoke node graphs. The
document model is **vector-objects-in-layers, rasterized at the edges**: brush
strokes, shapes, and gradients are stored as geometry (zod-validated state), live-
rendered via Konva, and only baked to pixels when compositing for display of cached
results or when rasterizing the generation input.

### 1.2 Architecture (all [DOC], paths from `invokeai/frontend/web/src/features/controlLayers/`)

- **Scale**: 409 TS files, ~53.5k LOC; `konva/` subtree ≈ 63 files; store ≈ 21; components ≈ 262.
- **Renderer**: **raw Konva 9, no `react-konva`** — an imperative module tree, not a
  declarative scene. Root: `CanvasManager` (`konva/CanvasManager.ts`). Every module
  extends `CanvasModuleBase` (`konva/CanvasModuleBase.ts`): `type`/`id`/`path`/
  `parent`/`manager`/`log` + optional `initialize()`/`destroy()`/`repr()` and a
  chained logging context (roarr). The path string enables structured debug logs
  like `manager:x > raster_layer:y > entity_renderer:z > brush_line:w` — the same
  junction-transcript discipline our debug suite directive (c250ab36) asks for.
- **Modules**: `stage` (viewport: scale 0.1–20, snap points 0.25–5, wheel + ctrl+MMB
  zoom-drag — `konva/CanvasStageModule.ts`), `background`, `cache` (canvas-element /
  blob / uploaded-image caches keyed by content hash), `worker` (a Web Worker doing
  **one** job: alpha-channel bbox extents — `konva/worker.ts`), `entityRenderer`
  (z-order), `compositor` (§1.4), `stagingArea` (§1.5), `compositionGuide`
  (thirds/grids), `segmentAnything` (click points + bbox → backend SAM1/SAM2),
  `tool` (router).
- **Entity adapters** (`konva/CanvasEntity/`): one per entity kind — raster layer,
  control layer, regional guidance, inpaint mask — each owning a Konva layer, a
  per-object renderer map with incremental `update(objectState)` diffing
  (`CanvasEntityObjectRenderer.ts`), and a **buffer renderer** for in-progress
  strokes (live stroke renders outside the document until commit —
  `bufferRenderer.commitBuffer({ pushToState: false })` then explicit state push).
  Transform (`CanvasEntityTransformer.ts`) and filter (`CanvasEntityFilterer.ts`)
  are per-entity concerns behind `$isBusy` flags.
- **State**: Redux Toolkit + **redux-undo** for the document slice
  (`store/canvasSlice.ts`, 2,119 lines), **nanostores** atoms for ephemeral state
  (zoom attrs, busy flags — explicitly separated from undoable state), **zod v4**
  schemas for everything persisted, with a `_version` + `migrate()` chain whose
  comments record real rehydration-wipe bugs and their fixes — honest engineering
  artifacts worth reading before we design our own document migrations.
- **Deps of the canvas tree** [DOC, npm registry re-verified]: konva MIT,
  nanostores MIT, perfect-freehand MIT (stroke smoothing, used in `konva/util.ts`),
  zod MIT, es-toolkit MIT, roarr BSD-3-Clause, RTK MIT. **Nothing copyleft.**

### 1.3 The document model (`store/types.ts`, 1,276 lines) [DOC]

Objects (the atomic undoable units, zod discriminated union): `brush_line` /
`brush_line_with_pressure` (points `[x,y,(p)…]`, color, `clip` rect, composite
op), `eraser_line(±pressure)`, `rect`/`oval`/`polygon` (with compositeOperation
incl. `destination-out` = erase-shapes), `lasso` (closed contour), `gradient`
(linear/radial, with clip-to-gesture metadata), `image` (server image or dataURL,
`usePixelBbox` flag). Entities: `raster_layer` (objects + position + opacity +
blend mode from the full Canvas2D composite-op set + optional adjustments
[brightness/contrast/saturation/temperature/tint/sharpness + curves LUTs] +
`isTransparencyLocked` — Photoshop's lock-transparent-pixels), `control_layer`
(raster layer + a control-adapter config: ControlNet / T2I-Adapter / Control-LoRA
/ Z-Image control / Anima LLLite), `regional_guidance` (objects as the mask +
per-region positive/negative prompts + per-region IP-Adapter/FLUX-Redux refs +
`autoNegative`), `inpaint_mask` (objects + per-mask `noiseLevel` and
`denoiseLimit`). Global reference images carry model-specific configs
(IP-Adapter / FLUX-Redux / Kontext / FLUX.2 / Qwen / Wan). **What is deliberately
absent**: any bitmap-paint layer — raster state exists only as cached images and
the staging area; and any non-affine transform state (§2.4).

### 1.4 The bbox / context-window mechanism (the maintainer's named premise) [DOC]

`zBboxState` = integer `rect` + aspect-ratio lock + `scaleMethod`
(`none|auto|manual`) + `scaledSize` + `modelBase`. Semantics (their docs,
`docs/src/content/docs/features/Canvas/bounding-box.mdx`): *"the visible Canvas
content inside the bounding box is composited and sent through the generation
pipeline. Content outside the box is not included… Moving the box changes which
part of the image the model can use for the next generation."* So the bbox is both
the **generation footprint** and the **context window** — outpainting is just
"bbox placed beside existing content." Resolution dynamics:
`util/getScaledBoundingBoxDimensions.ts` does an **area-preserving upscale to the
model's optimal dimension on the model's grid** (SDXL training-dims special case),
i.e. bbox AR is user intent, actual generation size is model-aware — the same
shape as our AR-first resolution system (directive 1e363ec0 rulings 4–5), with the
"scale before processing, composite result back to the bbox footprint" behavior
our H3 resolution tiers already implement. The bbox tool (`CanvasBboxToolModule`)
is a Konva transformer with per-anchor drag-bound math, alt-center anchoring, and
model-driven AR constraints. **This whole mechanism is the mature form of
openOutpaint's reticle and is directly adoptable.**

### 1.5 The generative integration [DOC]

- **Graph compilation at dispatch** (`features/nodes/util/graph/generation/`):
  `addTextToImage` / `addImageToImage` / `addInpaint` / `addOutpaint` /
  `addRegions` compose per-model graphs (SD1/SDXL/SD3/FLUX/Ideogram/CogView/
  Ernie/Z-Image/Anima/Wan/Qwen/Krea2/external) reading the Redux state **and the
  live compositor**: `manager.compositor.getCompositeImageDTO(rasterAdapters,
  rect, …)` rasterizes visible layers to the bbox rect and uploads the result as
  the initial image. Masks composite to **grayscale images weighted by per-mask
  `noiseLevel`/`denoiseLimit`** (a mask is also a denoise map — nice primitive).
  Outpaint adds infill (five server-side methods: patchmatch / lama / cv2 /
  color / tile), a gradient mask, a coherence pass (Gaussian-blur edge modes),
  and an `img_blend` paste-back. Regions rasterize per-region masks →
  `alpha_mask_to_tensor` → per-region conditioning → collect nodes fanning
  into the denoiser.
- **Staging area** (`CanvasStagingAreaModule` + `store/canvasStagingAreaSlice`):
  generated results land staged (bbox-sized, or native dims via a flag for models
  that don't honor requested sizes), with **next/prev through iterations,
  commit-to-layer / discard** — this is our takes/candidates lane as a first-class
  canvas surface, down to "accept one of N onto the canvas."
- **Run-workflow-on-canvas** (docs `run-workflow.mdx`): right-click a raster
  layer → run any saved workflow with the layer as image input; results route to
  the staging area through an **explicit `Canvas Output` node** (they moved off
  heuristic output detection after it proved fragile). This is the
  workbench-as-orchestration-surface-over-the-registry pattern (our dbbc10fc)
  proven in production: arbitrary graph + explicit canvas seam + staged
  candidates. `services/api/run-graph.ts` is a clean DI'd promise wrapper
  (executor + event-handler injected) — a pattern worth copying for our ComfyUI
  submissions.
- **Tooling surfaces**: SAM click-to-mask (backend models), five drag-and-drop
  canvas targets (new raster/control layer, regional reference, inpaint mask,
  resized control layer), per-layer live filters via Konva custom ImageData
  filters (`konva/filters.ts`), a portable `.invk` project format
  (manifest + state + images, zod-validated, image-name remapping on import —
  `util/canvasProjectFile.ts`) and named snapshots.

### 1.6 Separability analysis (the mandate's core question) [DOC]

**Backend-coupling inventory of the whole `konva/` engine tree** — every import
from their `services/` layer:

| Seam | Symbols | Files | Replacement for us |
|---|---|---|---|
| Image I/O | `uploadImage`, `getImageDTOSafe`, `getImageDTO`, type `ImageDTO` | 14 | blob store / engine upload port |
| Events | type `AppSocket` | 1 | our SSE/WS hub types |
| Model configs | `modelConfigsAdapterSelectors`, `isControlLayerModelConfig` | 2 | our registry selectors |
| Graph runner | `runGraph` (filter previews only) | 1 | our submit path |
| Store | `AppStore` type + `stateApi.runSelector` indirection | 4 | a state adapter over our stores |

That is the entire coupling. The `CanvasStateApiModule` already wraps store
access behind selectors, which is the natural port seam: implement a Monoka
stateApi against our document store and the engine tree barely notices. The
**honest costs**: (a) their document slice is Redux+redux-undo shaped — we run
zustand; either we adopt their slice as a vendored island with an adapter, or we
port the engine against our stores (the module tree reads state only through
`stateApi`, so this is tractable but real work); (b) 53.5k LOC of surface area
(components especially) assumes their UI kit and app shell; (c) tests exist for
the math-y parts (`pressure.test.ts`, `util.test.ts`, `toolHotkeys.test.ts`,
`shapeCompositeOperation.test.ts`, `transparencyLocking.test.ts`) — vendoring the
engine without its tests would be malpractice, with them it's credible.

**What is NOT separable / NOT wanted** [DOC + maintainer directive]: the params
slice (`store/paramsSlice.ts` — a giant per-model surface: SDXL refiner, FLUX
dype, Ideogram presets, Qwen/Wan/Krea2 component pickers…; this is the
diffusers-backend face the maintainer explicitly dislikes), the per-model graph
builders (Invoke node vocabulary — pattern only), the SAM backend, the nodes/
workflow editor (we have our own), the whole Python side.

**License verification** [DOC]: root `LICENSE` = Apache-2.0; `pyproject.toml`
declares Apache; zero GPL/LGPL/AGPL strings in `controlLayers` or `common`;
the four `LICENSE-*.txt` files at root are **model-weights notices**
(OpenRAIL-M SD1/2, OpenRAIL++M SDXL, HiDiffusion, PiD) — irrelevant to code
adoption since we take no weights. Apache-2.0 code vendored into our AGPLv3
repo is license-compatible (notices preserved; Apache-2.0 §4(d) attribution
rides the vendored files — our existing `vendored` registry mode handles this).

### 1.7 Invoke verdict

**ADOPT-as-code (candidate set for the spec round's cut)**: `CanvasModuleBase`
skeleton + module composition pattern; the zod object/entity schemas (minus
model-specific adapter configs); `konva/util.ts` math helpers; `pressure.ts`;
`filters.ts`; `getScaledBoundingBoxDimensions` + the bbox state shape;
compositor + cache + worker; the staging-area interaction model.
**ADOPT-as-pattern**: document-compiles-to-graph at dispatch (our existing
discipline — now proven at 53k-LOC scale by someone else); staging = candidates;
explicit output-node routing for arbitrary workflows; per-mask denoise maps;
stateApi selector indirection; `.invk`-style portable project + snapshots.
**SKIP**: params slice, graph builders, backend, nodes editor.

---

## 2. The manual-editing toolset prior art

### 2.1 Krita — the brush-engine and transform architecture (pattern study) [API-2026-09-26, primary-source fetched]

**License: GPL-3.0 as a whole work** (krita.org license page verbatim: *"Krita is
licensed under the GNU General Public License (GPL), version 3"*; most source
files carry `SPDX-License-Identifier: GPL-2.0-or-later` headers). Nothing in
Krita is usable as code for us — pattern only, per our policy.

- **The engine contract is small**: `KisPaintOp` = `paintAt(KisPaintInformation,
  KisDistanceInformation*)` + `paintLine` + `paintBezierCurve`, with **spacing and
  timing as the load-bearing concept** (leftover drag distance carries across
  events — the same accumulator discipline our stroke code will need).
  `KisPaintOpRegistry` is a factory registry: factories create the engine, its
  settings object, its settings widget, and (for stateful engines like smudge) an
  **interstroke-data factory** — per-layer persistent engine state. Engines are
  always instantiated *from a preset*, never bare: settings-as-data,
  engine-as-plugin. Current engine set (repo truth, `plugins/paintops/`):
  default (pixel), colorsmudge, curvebrush, deform, experiment, filterop,
  gridbrush, hairy, hatching, mypaint, particle, roundmarker, sketch, spray,
  tangentnormal.
- **Separation of concerns**: the freehand *tool* never paints — it converts
  pointer events into `KisPaintInformation` (pos/pressure/rotation/tilt +
  per-stroke random sources) and hands them to an engine; a single compositor
  (`KisPainter`) owns composite-op/opacity/**selection masking** so engines never
  touch compositing. Selection = `KisSelection` (pixel component + shape
  component → read-only composited projection → painter mask, 8-bit degrees of
  selectedness).
- **Transforms — one tool, seven strategies** (`plugins/tools/tool_transform2/`):
  free (affine, with GSL least-squares fitting), **warp = MLS** (their
  `kis_warptransform_worker.h` cites Schaefer/McPhail/Warren 2006 verbatim;
  affine/similitude/rigid variants), **liquify = a deformation grid** the brush
  edits (grid control points, gaussian sigma falloff, flow, wash mode;
  translate/scale/rotate primitives), **cage** (point-set cage), **mesh** (grid
  subdivision mode), **perspective = a 3×3 homography** (QTransform, bilinear/NN
  sampling, incremental partial updates). Transform args are serializable —
  transform *masks* persist the geometry, non-destructively.
- **Pattern takeaways for us**: (1) stroke-plane / engine-registry / single-
  compositor split is the template for a TS brush system; (2) **every deformer
  is a worker over an editable geometry intermediate** (point pairs, grids,
  cages, a matrix) — store the geometry, never the pixel history; (3) presets
  are data with engine+dials, shareable/bundleable.

### 2.2 GIMP/GEGL — the op-graph discipline and the warp vocabulary [API-2026-09-26, primary-source fetched]

**Licenses, precisely**: GEGL = **LGPL-3.0-or-later** (the library + most ops),
**but** `operations/common-gpl3+/` is a directory of **GPL-3+** ops
(`whirl-pinch`, `lens-distortion`, `apply-lens`, `lens-flare`) — per-op license
checks are mandatory; GIMP app code (tools, `app/operations/*`) is GPL-3.0+.
All pattern-only for us; the GPL-3+ ops' math must be **re-derived, not ported**.

- **`gegl:warp`** (LGPL-3+, `operations/common-cxx/warp.cc`) is the reference
  liquify: a **stroke-driven displacement field** (not a mesh solve) with
  properties `strength/size/hardness/spacing` + a `GeglPath` stroke + behavior
  enum **move / grow / shrink / swirl-cw / swirl-ccw / erase / smooth**. The GIMP
  tool (`gimpwarptool.c`) is a thin controller streaming into the op at 20 fps
  with a NEAREST-sampler preview; undo is a `buffer-source`→`map-relative` graph.
  iWarp (the old dialog-era interactive warp) was retired in favor of this.
- **Unified/perspective transforms** are `GimpMatrix3` (3×3 projective) handle
  manipulation; resampling happens in GEGL's `transform-core.c` with the
  **sampler enum** (nearest/linear/cubic/**nohalo/lohalo** — Robidoux's EWA
  samplers) over a **mipmap pyramid** for cheap high-quality scaling.
- **Cage transform** = **barycentric coordinates**: per-pixel cage coefficients
  precomputed once for the source cage (`gimpoperationcagecoefcalc.c`), reused
  per vertex edit. **N-Point Deformation** = interactive MLS
  (as-rigid-as-possible), Krita's warp paper again.
- **Pattern takeaways**: interactive tools as thin controllers over
  parameterized ops (the op is the contract, the tool is UX); the deformation
  algorithm convergence (MLS / coordinate weights / homography + displacement
  strokes) gives us the exact spec vocabulary for §2.4.

### 2.3 Photopea (closed-source, pattern-only) [API-2026-09-26]

Proprietary, one developer, fully client-side (pure JS; WebGL observed in the
wild, WASM claimed but unverified; server costs ~$20/yr — the static-client
economics are the point). **Its document model is PSD's** — adopted wholesale
(smart objects, smart filters: Puppet-Warp parameters literally round-trip as a
PSD smart filter), which bought free interop with the incumbent's ecosystem;
format strategy = adopt, don't invent (PSD, then Sketch/XD/AI/Affinity/Figma/
Krita `.kra`/RAW/PDF…). Deformation surface: interactive Liquify (with history),
**Puppet Warp** (anchor points + adjustable triangular-mesh density + per-anchor
depth ordering), Vanishing Point. Embedding API is free (iframe + postMessage +
server-save POST), whitelabel paid. **Pattern takeaways**: PSD-semantics as the
interop surface; deform-ops-as-smart-filter-parameters (editable, not baked);
the Puppet-Warp UX (anchors + mesh density + depth) is the concrete bar for any
mesh surface we build.

### 2.4 The deformer math — what Invoke has vs. what the class needs

Invoke's `CanvasEntityTransformer` is **affine only** — scale (keepRatio),
rotate (45° snaps), flip, move; no skew, no perspective, no liquify, no mesh
[DOC]. The maintainer's list — liquify, meshing/pinching, perspective, resizing
— maps onto three algorithm families plus resampling, all pattern-licensed from
§2.1/2.2 and implementable over permissive JS primitives (§3):

| Tool | Algorithm | Prior-art home | License | Our implementation route |
|---|---|---|---|---|
| Liquify brush | stroke-driven displacement field, radial falloff (grow/shrink/swirl/push) | `gegl:warp`; Krita liquify grid | LGPL/GPL = pattern | GPU displacement (pixi `DisplacementFilter` or a lifted glfx shader) for preview; field-bake via OpenCV `remap` |
| Mesh/puppet warp | MLS (Schaefer 2006: affine/similitude/rigid) or TPS over control points | Krita warp worker; GIMP NPD | GPL = pattern; **no maintained JS lib exists [API-2026-09-26]** | in-house TS (~300 lines for MLS; ~50 for a TPS solve over `ml-matrix`), evaluated through `remap` |
| Perspective | 4-point homography (3×3 solve, RANSAC if estimating from features) | GIMP unified transform; Krita perspective worker | GPL/LGPL = pattern | OpenCV `getPerspectiveTransform`/`findHomography` + `warpPerspective`; pure-JS fallback `ml-matrix` DLT |
| Cage/region warp | barycentric/mean-value coordinate weights, precomputed | GIMP cage | GPL = pattern | in-house over `ml-matrix` + `remap` |
| Resizing | sampler-aware resample (lanczos/cubic equivalents, EWA for downscale) | GEGL transform-core | LGPL = pattern | OpenCV `resize` INTER_*; `pica`-class JS only if wasm is undesirable |
| Pinch/bulge/swirl | radial map functions | glfx.js shaders; `gegl:whirl-pinch` | **MIT (glfx) / GPL (op)** | lift glfx's MIT shaders; whirl-pinch math re-derive |

---

## 3. Library candidates (the toolbox bar: ≥2 concerns or it's not in)

All licenses [API-2026-09-26] verified against LICENSE files / registry metadata;
sizes measured, not quoted. This is the *candidate* list for the spec round —
per the adoption epistemology (426ab190), nothing here is a commitment, and any
adoption lands with its registry row in the same commit.

| Library | License | Status / size | Covers | Lean |
|---|---|---|---|---|
| **konva** (+optional react-konva) | MIT | 10.7.0 (2026-09-23), 57 KB gz, zero deps | scene graph, interaction, Transformer handles, caching, CPU filters; React binding via react-konva | **ADOPT** — the substrate Invoke already proved at scale; note Invoke uses raw Konva 9 imperatively, not react-konva |
| **@techstark/opencv-js** | Apache-2.0 | 5.0.0 (2026-06), 13.3 MB wasm-embedded, lazy-loadable, TS types | `warpPerspective`, `remap` (arbitrary mesh maps = the MLS/liquify evaluator), `findHomography`/`getPerspectiveTransform`, `resize` INTER_*, `inpaint` (Telea + Navier-Stokes — free pre-fill machinery), morphology, `solve` | **ADOPT (lazy module)** — ~6 concerns in one Apache slot; must stay out of the main bundle (modularity contract: one raster-engine module, deletable) |
| **transformation-matrix** | MIT | 3.1.0 (2025-08), 6.5 KB | affine decompose/compose/apply/invert (the SVG ecosystem's) | **ADOPT** — tiny; kills a class of hand-rolled matrix bugs |
| **ml-matrix** | MIT | 6.15.0 (2026-08), 17 KB | least-squares/SVD/solve — DLT homography, TPS, MLS internals; synchronous, vitest-testable without wasm | **ADOPT** |
| **pixi.js** | MIT | 8.21.0 (2026-09), 234 KB gz, WebGL+WebGPU | GPU compositing (RenderTexture), filter pipeline, **DisplacementFilter = live liquify preview** | **OPTIONAL, separable perf layer** — pull only when CPU canvas measurably chokes; heaviest pure-render dep, zero editor logic |
| **glfx.js** | MIT | dead 12+ yrs | bulge/pinch/swirl/displacement WebGL1 shaders | **SKIP as dep; code-donor** — lift the ~40-line shaders |
| fabric.js | MIT | 7.4.0 (2026-05), 92 KB gz | object model, brushes, JSON scene serialization, handles | **SKIP unless konva loses** — 70% overlap with konva; pick one substrate |
| image-js | MIT | 1.7.0 (2026-07) | pure-JS raster ops + best-in-class decode/encode matrix | **SKIP if opencv adopted** (duplicate slot); keep as the no-wasm fallback arm |
| Eric-Canas/Homography.js | MIT | 1.8.1 (2023), 114 KB | pure-JS RANSAC homography + Delaunay | **optional** — pre-wasm arm only |
| paper.js / opencv-wasm / perspective-transform / TPS pkgs | MIT/BSD/MIT/MIT | dormant or frozen | fragments | **SKIP** |
| **MLS in JS** | — | **does not exist maintained** [API-2026-09-26, verified 3 ways] | — | **in-house slot** (~300 lines, Schaefer 2006 as spec) — the one piece of deformer math nobody shipped as a library |

**Brush-side code donor**: AlekPet's ComfyUI PainterNode (MIT, active 2026-09) —
pencil/shapes/eraser/symmetry, transform mode, crop, image piping, and **MyPaint
brush-pack support via brushlib.js** — the only maintained MIT brush surface in
the lineage; a reference implementation for our stroke plane, not necessarily a
dependency.

**Open-source web editors as prior art**: miniPaint (MIT, v4.14.3 2026-04,
vanilla JS — layer-data/render-loop separation, tool registry; code-donor
friendly), **Graphite (dual MIT OR Apache-2.0** — relicensed from GPLv3;
27.4k★, alpha, Rust+WASM node-graph editor — pattern for node-graph UX and the
Rust-math-behind-wasm discipline, not direct code), Pixelorama (MIT, Godot —
pattern only), jspaint (MIT — state/undo discipline, format breadth).

---

## 4. The canvas-generation lineage (one paragraph each, with the call)

- **openOutpaint** (`zero01101/openOutpaint`) — **MIT** [API-2026-09-26];
  dormant since 2024-08; **no maintained successor fork exists** (searched —
  "openOutpaint-lts" etc. return nothing; the community's de-facto successors
  are Krita-AI-Diffusion and Invoke). Vanilla JS, no framework, no build step;
  camera + layer stack + grid snapping; **reticle-driven generation** (size a
  "dream" reticle anywhere, it snapshots surrounding context and fires masked
  img2img at A1111's API with an adjustable **overmask** margin to hide seams);
  workspaces/layers/history persist to localStorage; generation queue.
  **ADOPT-as-pattern** — MIT makes code legally adoptable but it's framework-free
  vanilla JS welded to the A1111 API; the asset is the interaction model (the
  maintainer's named premise; the in-flight vision doc extracts it).
- **lkwq007/stablediffusion-infinity** — Apache-2.0 [API], dead since 2023; the
  2022 origin (Gradio + embedded `InfCanvas`). **ADOPT-as-pattern** (lineage
  credit only).
- **jtydhr88/sd-canvas-editor** — **no LICENSE at all** [API] (all-rights-
  reserved) + built on Polotno (commercial canvas lib); masks delegated to the
  webui's own tabs. **SKIP** (license-contaminated; thin).
- **Acly/krita-ai-diffusion** — GPL-3.0 [API], very active (pushed 2026-09-26).
  Canvas integration = Krita document as single source of truth (selections →
  masks, results → ordinary layers, live partial paint-ins while generating).
  **ADOPT-as-pattern** — the transport/bridge study is already held
  (`docs/research/node-pack-registry.md` §4.3).
- **ComfyUI-side authoring** — native MaskEditor/Painter (GPL-3.0 frontend):
  pattern only, our in-app mask painter already mirrors it. **AlekPet
  PainterNode** (MIT, active): the brush donor (§3). **chflb163
  ComfyUI_LayerStyle** (MIT, active): layer/mask compositing node kit —
  pattern/code mine for compositing internals. **KJNodes** (GPL-3.0): no
  interactive canvas surface at all (post-2026-rewrite it's QoL graph nodes) —
  **SKIP**. **mixlab "Edit Mask"** (MIT, semi-active): draw-a-mask-where-you-
  need-it UX — pattern. A catalogued "MEC Paint Suite" has **unlocatable
  provenance** [UNK] — do not rely on it.
- **Newer open-source that clears the bar**: **SD.Next "Kanvas"** (Apache-2.0,
  very active) — a full editing surface replacing the img2img/inpaint tabs;
  pattern-mine the interaction design out of a huge codebase.
  **SwarmUI** (MIT, active) — modal expand-canvas→mask→generate→apply outpaint
  choreography; pattern (C#). **Toonflow** (MIT via a license history
  AGPL→Apache-terms→MIT — non-retroactive; 16k★, active) — agents + visual
  workflows living on the canvas itself, MCP connectors, backend-agnostic
  generation incl. local ComfyUI; Vue-not-React; **pattern** for the
  agents-on-canvas + extensibility architecture. **basketikun/infinite-canvas**
  (MIT, 2026, hot) — React, but it's a *node graph*, not a pixel surface;
  pattern. **jaaz** — dual-licensed free/paid, **not open source**; the
  point-to-instruct gesture is worth copying, the code is not.
  **gimp_comfyui** (MIT, dormant) — small readable thin-client-over-ComfyUI
  transport reference. **fal-ai/infinite-kanvas** — README says MIT but **no
  LICENSE file exists** [API: license null] — pattern only until that lands;
  architecturally the closest modern TS/React+Konva dry-run of our own stack
  (viewport culling, IndexedDB autosave, tRPC streaming previews) and notably
  **lacking masks/inpaint/outpaint — our differentiation**.
- **Commercial pattern refs** (one line each): Krea — selection-on-canvas as the
  entire UI; Weavy/Figma-Weave — image ops as re-runnable recipes; Flora —
  non-destructive branching experiments; Photoshop generative fill — selection
  as region contract + variants picker on a separate generative layer; tldraw —
  the React infinite-canvas SDK benchmark, **license moved off MIT — verify
  before any SDK use** [UNK].

---

## 5. The licensing map (per prior-art item, composed with our AGPLv3 policy)

Our side is AGPLv3; our registry's usage modes are vendored / fetch-consent /
API / replicated / referenced-only, and the mandate's stance governs:
Apache/MIT/ISC = adoptable as code; LGPL = pattern + careful linking; GPL =
pattern-only, runtime-separate at most. (Nuance for the record: FSF's matrix
does allow GPLv3+AGPLv3 combining, but our policy line is deliberately more
conservative — GPL stays pattern-only; nothing below depends on relaxing it.)

| Item | License [verified] | Mode it can take here |
|---|---|---|
| InvokeAI (canvas code) | Apache-2.0 [DOC: root LICENSE at v6.14.1] | **vendored** (pinned rev, provenance headers, Apache notices preserved) or **replicated** (port) |
| InvokeAI model-weights notices (LICENSE-*.txt) | OpenRAIL-M / ++M / HiDiffusion / PiD | N/A — we take no weights |
| konva, react-konva, fabric, pixi, perfect-freehand, nanostores, zod, RTK, es-toolkit, react-colorful, transformation-matrix, ml-matrix, image-js, glfx.js, miniPaint, Pixelorama, jspaint, Graphite (dual), openOutpaint, stablediffusion-infinity, AlekPet PainterNode, ComfyUI_LayerStyle, mixlab, SD.Next, SwarmUI, Toonflow, basketik, gimp_comfyui | MIT / Apache-2.0 / BSD (roarr) [API-2026-09-26] | vendored / dependency / code-donor — all code-adoptable |
| opencv.js (@techstark packaging) | Apache-2.0 [API] | dependency (lazy module) |
| GEGL (library + transform/warp ops) | LGPL-3.0-or-later [API: COPYING.LESSER + file headers] | pattern only (JS bundling = static linking; LGPL obligations awkward — not worth it) |
| GEGL `common-gpl3+` ops (whirl-pinch, lens-distortion, apply-lens, lens-flare) | GPL-3.0+ [API: file headers] | pattern only; math **re-derived**, never ported |
| GIMP (tools, app/operations) | GPL-3.0+ [API] | pattern only |
| Krita (whole work) | GPL-3.0 (files mostly GPL-2.0-or-later) [API: krita.org + SPDX headers] | pattern only |
| Photopea | proprietary [API] | referenced-only (UX/API patterns; no internals exist to take) |
| Acly/krita-ai-diffusion, ComfyUI frontend (MaskEditor), KJNodes | GPL-3.0 [API] | pattern only; runtime-separate (the bridge study's GPL boundary discipline) |
| jtydhr88/sd-canvas-editor | **none** (all-rights-reserved) [API] | skip entirely |
| jaaz | proprietary dual (community/commercial) [API: LICENSE read] | pattern only |
| fal-ai/infinite-kanvas | claimed MIT, **no LICENSE file** [API: null] | pattern only until a license lands |
| TPSjs | GPL-3.0 [API] | skip (flagged) |
| Piskel | Apache-2.0 [API] | pattern only (dormant) |

Registry consequence: **no adoption happens in this doc** — every ADOPT above is
a spec-round input; the winning picks land with their `docs/licenses/registry.md`
rows in the same commit per the lockstep rule.

---

## 6. The honest gaps — what NOBODY has built (the novel-tool territory)

1. **The union itself.** Anchor-bbox generative editing (Invoke, openOutpaint) +
   Photoshop-class deformers (Krita, GIMP, Photopea) + layers, in one open tool:
   does not exist. Invoke's transform is affine-only [DOC]; Krita/GIMP have no
   generative canvas; openOutpaint has no deformers and no editor-grade layers.
   The only shipped union is Photoshop (closed). **This workbench's core claim
   is exactly this union — every ingredient is prior-arted, the combination is
   novel.**
2. **A maintained JS MLS/mesh-warp library.** Verified absent [API-2026-09-26].
   The Schaefer-2006 implementation (~300 lines TS) is ours to own — and worth
   owning: it is the math under liquify-adjacent mesh/puppet warp, Krita's warp
   tool, and GIMP's NPD.
3. **An engine-pluggable canvas document model.** Invoke's is the closest but
   welded to their queue/graph/API; ours compiles the same document shape to
   ComfyUI graphs behind our submit path — nobody has published that separation
   (ours would also satisfy the standalone-later mandate by construction).
4. **Region-anchored edit families.** Invoke's regional guidance is prompting
   only (per-region text + refs). "Anchor to a selected region and edit aspects"
   — regions routing to edit *families* (identity/outfit/lighting/pose, our
   `KREA2_EDIT_FAMILIES` / H3 edit taxonomy) with preservation contracts — is
   unbuilt anywhere.
5. **Video-grade handoff from an editing canvas.** No canvas prior art carries a
   take/hop/drift model or a start-frame/Ref2VA exit; our takes machinery +
   workbench output contract is unique surface.
6. **Open deform-ops-as-parameters in a TS raster editor.** Photopea does it
   closed (PSD smart filters); Graphite is node/vector-first. An open TS layered
   raster editor where liquify/perspective/mesh live as editable layer params
   (Krita's transform-mask pattern, browser-native) — unbuilt.

Gaps we do NOT claim: infinite canvas + generative stamping (openOutpaint/Invoke/
Krea own it), layers/masks/regions (Invoke owns it), brush engines (Krita/
MyPaint own the patterns), the graph-compile discipline (Invoke + our own wiring
canvas). The novelty is the union, the engine-pluggable separation, and the
edit-family anchoring — no more, and that is enough.

---

## 7. Homes for the existing workbench lanes (spec-coverage check)

Directive b90ce8f6: "the existing spec's lanes — generate/edit/refine/candidates/
burst — must all have homes in the canvas shape." Mapping against
`docs/specs/image-workbench-v1.md`'s families:

| v1 lane | Canvas home (prior-art-backed) |
|---|---|
| Generate-packet / Generate-T=1 | bbox generation with context-window compositing (Invoke §1.4 + openOutpaint reticle); AR-locked, model-grid-scaled — composes with our AR-first resolution tiers |
| Compose (≤9 refs, roles, transports) | stays our reference-strip surface (canvas spatial placement of refs is a spec-round question — no prior art does spatially-placed multi-ref conditioning; open question, flag it) |
| Edit-* families | region/mask objects on canvas routing to edit families (gap #4 — ours to design); inpaint masks with per-mask denoise maps (Invoke primitive, adoptable) |
| Refine | staging area + op-stack ops (tone-lock frequency blend is already our app-side op); filter previews via DI'd runGraph pattern |
| Candidates / burst | staging area next/prev/commit (Invoke) + ContactSheet/takes (ours) — the two compose cleanly |
| Exit (start-frame) | unchanged — ours, no prior art to cite |

**Sequencing note for the spec round**: this survey + the in-flight openOutpaint
vision doc are the two research inputs; the cut line on Invoke vendored-vs-ported
(§1.6/§1.7) and the Konva-substrate-vs-existing-wiring-canvas question (our
wiring canvas is DOM-tiles + d3-zoom — a different substrate class; the
workbench wants a raster document surface, which argues for the Konva engine as
a separable module per the modularity contract) are the two decisions the spec
round must make first.

---

## Verdict table (the one-screen answer)

| Prior-art item | Verdict |
|---|---|
| **InvokeAI canvas engine** (v6.14.1, Apache-2.0) | **ADOPT-as-code, vendored-core/owned-surfaces**: module skeleton + zod document model + math/pressure/filters + bbox machinery + compositor/worker; **ADOPT-as-pattern**: staging, run-workflow-on-canvas, mask→denoise maps, stateApi seam; **SKIP**: params slice, graph builders, backend |
| **openOutpaint** (MIT, dormant) | **ADOPT-as-pattern** (interaction model; vision extraction = the other in-flight doc) |
| **Krita** (GPL-3.0) | **ADOPT-as-pattern** (brush-engine split; deformers-as-editable-geometry) |
| **GIMP/GEGL** (LGPL-3+/GPL-3+) | **ADOPT-as-pattern** (op-as-contract; warp vocabulary; per-op license discipline) |
| **Photopea** (proprietary) | **ADOPT-as-pattern** (PSD-semantics interop; deform-as-smart-filter; Puppet-Warp UX bar) |
| **konva** (MIT) | **library candidate — ADOPT** |
| **@techstark/opencv-js** (Apache-2.0, lazy) | **library candidate — ADOPT** (the raster engine slot) |
| **transformation-matrix + ml-matrix** (MIT) | **library candidates — ADOPT** (the math floor) |
| **pixi.js** (MIT) | **optional separable GPU layer** (live liquify preview) |
| **glfx.js** (MIT, dead) | **shader donor, not a dependency** |
| **AlekPet PainterNode** (MIT) | **code-donor** (brush surface + MyPaint brushlib) |
| fabric / image-js / Graphite / miniPaint / SD.Next / SwarmUI / Toonflow / basketik / infinite-kanvas | pattern-or-skip per §3/§4 (each licensed fine except infinite-kanvas's missing LICENSE file — pattern until fixed) |
| jtydhr88/sd-canvas-editor (no license), jaaz (proprietary), TPSjs (GPL) | **SKIP** |
| MLS-for-JS | **nobody's built it — ours to own (~300 lines)** |

*Corrections to this survey land as dated addenda, never silent edits (the
library protocol). The web-survey claims carry their verification method inline
([API-2026-09-26] / [DOC]); anything load-bearing that a future pass re-checks
should upgrade its tag, not overwrite the claim.*
