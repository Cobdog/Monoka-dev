# openOutpaint — the core read (vision extraction for the workshop's creation surface)

> Compiled 2026-09-26. No Flux task yet — the coordinator places it; this doc is
> the deliverable either way. **METHOD:** full code-read of a shallow clone of
> `github.com/zero01101/openOutpaint` at HEAD of `main` (commit `32f38d9`, last
> upstream commit 2024-08-31 — the project is unarchived but dormant ~2 years;
> 530 stars / 46 forks / MIT / 951 commits over its life, era late-2022 →
> mid-2024). The whole codebase is ~6,900 lines of dependency-free vanilla JS
> and was read end-to-end — every claim below about its behavior is **[DOC]**
> (verified in the cloned code) unless tagged otherwise. Upstream repo facts
> (stars, archive state) are from the GitHub page fetched 2026-09-26. Nothing
> was run, installed, or committed from upstream; the clone lived in scratch
> under `~/.claude/jobs` and is removed.
>
> File citations are relative to the openOutpaint repo root (`js/…`, `css/…`).
>
> **Why this doc exists:** the maintainer's framing — "very very old and
> outdated, but the premise was really interesting. It was basically our
> infinite canvas, but you could stamp down an image, inpaint, outpaint,
> generate on an infinite canvas, you could anchor and define the context
> window and resolution dynamically." This is the honest extraction of what
> that premise actually was in code, what deserves to survive its era, and
> where our vision already passes it.

---

## 0. Verdict summary

| # | Question | Best-evidence answer | Confidence |
|---|----------|----------------------|------------|
| A | What was it, architecturally? | A **zero-build, zero-dependency vanilla-JS static page** (GitHub-Pages hostable, or an iframe inside A1111 as an extension) whose *only* backend is A1111's `--api`. Layer stack = absolutely-positioned DOM `<canvas>` elements composited by the browser; camera = a CSS transform on the container; document = an undoable **command log**; persistence = localStorage + IndexedDB. | **[DOC]** |
| B | How did the interaction model actually work? | One operation — **"dream into a rectangle"** — whose context is *derived from canvas state at click time*: flatten visible layers in the box, blank⇒txt2img, painted⇒img2img with a mask computed from (content silhouette ⊕ brushed mask ⊕ overmask dilation). The reticle carries **two planes** (world coverage px vs generation resolution px) as independent dials. | **[DOC]** |
| C | Was the canvas really infinite? | No — "effectively infinite": a growable rectangle (default 2048², manual edge-strip expand buttons, 1024 px steps) whose coordinates never appear to move because every 2D-context call is monkey-patched to add a live `ctx.origin` offset. | **[DOC]** |
| D | What's the gold worth carrying? | The **derived-mask single-op model**, the **two-plane reticle**, **ghost-preview-as-write-path**, **in-world chrome**, and **provenance-bearing history as the document** — all family-agnostic semantics, all portable. | **[DOC]**, our judgment on "gold" |
| E | What aged out? | The A1111 umbilical (global server-side model state, commit-tracked payload churn, string-matched extension probing, CORS), base64-PNG transport, DOM-composite rendering with no culling/LOD, single-generation-family assumptions, one shared global mask layer with no undo. | **[DOC]** |
| F | What does our vision add? | Real layers as generation context (region-anchored editing), Krita-class manual tools, multi-family models behind the registry (mask semantics become per-family capability negotiation), local llama.cpp auto-captioning generalizing its CLIP interrogate, and the substrate we already built (tiled/culled camera, typed op document, engine bridge, three surfaces). | Ours by design; the deltas are **[DOC]**-verified absences upstream. |

---

## 1. What it was

A **single-page, no-build, no-dependency vanilla JS/HTML app** ("no external
dependencies, extremely boring vanilla" — README's stated design goal) that
runs as static files and talks to exactly one thing: a local AUTOMATIC1111
webUI launched with `--api` and `--cors-allow-origins`. It could also be
loaded as an iframe by a companion A1111 extension, bridging via
`postMessage` with a `key.json` trust file (`js/webui.js`).

The load-bearing pieces:

- **Layer engine (`js/lib/layers.js`)** — a "collection" is a positioned div
  holding N stacked `<canvas>` elements (one per layer). The browser does the
  compositing; z-order is DOM order; visibility is `display:none`. Layers
  carry a `bb` (world bounding box), a `resolution` (backing-store size, so
  CSS size ≠ pixel size is supported), and a `category`
  (`background` / `image` / `mask` / `display` / `user`) that later governs
  what counts as "visible content."
- **The origin monkey-patch (same file, lines 12–160, self-labeled "the old
  magic / black magic")** — `drawImage`, `getImageData`, `putImageData`,
  `moveTo`, `lineTo`, `arc`, `fillRect`, `clearRect` are redefined on
  `CanvasRenderingContext2D.prototype` to transparently add a per-context
  `ctx.origin` offset (live getters bound to the collection origin).
  Application code therefore draws in **world coordinates forever**, while the
  backing canvases are reallocated and shifted underneath on every expansion.
  This patch is the single trick that made the whole coordinate model work.
- **Camera (`Viewport` class, `js/initalize/layers.populate.js`)** — cx/cy
  (world coords of viewport center) + zoom; `v2c`/`c2v` are `DOMMatrix`s;
  `transform(el)` writes the inverse matrix as a CSS transform on the
  collection div. Zoom is cursor-anchored (compute the cursor's world position
  before/after zoom, shift center by the delta). Input: **CTRL+wheel zoom,
  CTRL+drag pan** (introduced v0.0.10 — before that, no camera at all; the
  page scrolled). Pan is clamped to canvas bounds.
- **Input system (`js/lib/input.js`)** — a hand-rolled gesture classifier:
  click = <10 px radius AND <500 ms; otherwise dragstart/drag/dragend; plus a
  parallel **paint** channel (onpaintstart/onpaint/onpaintend) that fires from
  the first move with no delay — brushes never wait for the click
  classification. Multiple named coordinate "contexts" (`window`, `world`
  (inverse-camera-transformed, rounded), `camera`) fan out every raw event.
- **Tools (`js/lib/toolbar.js`, `js/ui/tool/*.js`)** — a tool is a
  registration of enable/disable functions that subscribe/unsubscribe
  observer handlers on the mouse/keyboard contexts, plus a `state` bag and a
  context menu populated from localStorage-backed sliders/checkboxes. Tools:
  Dream (D), Img2Img (I), Mask Brush (M), Color Brush (B), Select/Transform
  (S), Stamp (U), Interrogate (N).
- **Commands (`js/lib/commands.js`)** — command-pattern undo/redo. Each
  command (`drawImage`, `eraseImage`, `addLayer`, `deleteLayer`, `moveLayer`,
  `mergeLayer`) runs with a `state` object that captures its own inverse
  (e.g. `drawImage` stores the destination cutout it overwrote). Commands are
  exportable/importable as JSON — **the workspace document IS the command
  history** (see §3.6).
- **Persistence** — localStorage for every setting (host, sliders, checkbox
  states, prompts); IndexedDB v2 with two stores (`resources` = stamp
  library, `workspaces` = saved command logs) (`js/lib/db.js`).
- **A1111 client (`js/index.js`, `js/ui/tool/dream.js`, `js/extensions.js`)** —
  plain `fetch` against `/sdapi/v1/{txt2img,img2img,progress,interrupt,options,
  samplers,schedulers,sd-models,loras,prompt-styles,upscalers,
  extra-single-image,interrogate,scripts}` plus `/controlnet/*` extension
  routes. A connection state machine polls options every 5–60 s and
  distinguishes offline / CORS / API-disabled / server-error.

**What it assumed about its era (all [DOC]):** A1111 is the world and owns
global model state — "changing the model" is a `POST /options
{sd_model_checkpoint}` that swaps the checkpoint for the whole server, and
the UI nudges you toward SD1.5 *inpainting* checkpoints (first-run dialog
green-highlights filenames containing "inpainting"). Everything moves as
base64 PNG data-URL strings in JSON bodies, including per-step progress
previews and history exports. Payload-schema churn was tracked commit-by-
commit in code comments (the HRfix rework at A1111 `ef27a18` has a
compatibility shim and a "liar mode"; the removal of `sd_model_checkpoint`
from options is patched around at `js/index.js:1232`). Extensions are
detected by fuzzy substring match on `/sdapi/v1/scripts` names
("seriously >:( why put version in the name"). Resolutions are squares in
64-px multiples (the `Resolution` slider sets `width = height`,
128–2048 step 128). One user, one localhost GPU, one generation at a time.

---

## 2. The core interaction model — precise enough to re-implement the semantics

### 2.1 The reticle: two planes, one cursor

The Dream tool's cursor is a **square reticle** of `cursorSize` px
(128–2048; wheel adjusts in 128-px ticks, SHIFT+wheel in 2-px finesse;
`_dream_onwheel`, `js/ui/tool/dream.js:1636`), centered on the pointer,
optionally **snapped to a 64-px world grid** (`snap()`, `getBoundingBox()`,
`basePixelCount = 64` — "ALWAYS 64 PX", `js/index.js:145`). Alternatively you
**drag out an arbitrary rectangle** (the `_draggable_selection` helper,
`js/ui/tool/generic.js:143`), which takes precedence while it exists.

The reticle renders **two independent dimension pairs** (`_reticle_draw`,
`js/ui/tool/generic.js:21`):

- the **world coverage** — `bb.w × bb.h` canvas pixels, bold, on the box
  edges;
- the **generation resolution** — `request.width × request.height`, smaller,
  drawn *only when different*, i.e. only when the two planes are decoupled;
- the text is **color-coded by ratio**: orange when the cursor covers more
  than the model will generate (downsampling the world into the request),
  blue when the cursor covers less (the model generates more than the area —
  supersampling). A `syncCursorSize` toggle pins the two together.

So "anchor and define the context window and resolution dynamically" decodes
as: **the context window is the reticle position/extent in world space; the
resolution is a separate per-click dial; the ratio between them is displayed
live and is the user's fidelity control.** With a dragged selection, the
selection's own bb becomes both the window and (by default) the resolution,
with the model-side resolution shown scaled by `cursorSize` ratio.

### 2.2 Reading the canvas: the derived mask

On click, `dream_generate_callback(bb, resolution, state)`
(`js/ui/tool/dream.js:1023`) computes everything from canvas state:

1. `uil.getVisible(bb)` flattens all visible `user`+`image`-category layers
   into one offscreen canvas (`js/ui/floating/layers.js:321`) — the layer
   stack exists for editing, but generation always sees the flattened view.
2. **Blank check**: `isCanvasBlank()` scans the alpha channel. Blank ⇒
   txt2img (pure generation, no init image). Painted ⇒ img2img with init
   image + mask. *Outpainting and inpainting are the same operation; only the
   mask differs.*
3. The **init image** is the flattened view composited on black
   (`#000F` fill then drawImage), scaled to `request.width/height`.
4. The **mask** is built by canvas composite algebra (the img2img branch,
   `dream.js:1257ff`), with final semantics **white = regenerate,
   black = keep**:
   - start black; `destination-in` the visible content ⇒ a black silhouette
     exactly where content exists, transparent where blank;
   - **overmask** (`applyOvermask`, `dream.js:1399`): if `overMaskPx > 0`,
     paint white blotches — circles with an atan-curved, small-biased random
     radius distribution (`atan(rand*10-10)/|atan(-10)|+1`, then
     `^ (px/8)`) — over the content boundary so the seam region joins the
     regenerate set. The comment is candid: "look it might be all placebo but
     i like overmask lol."
   - `destination-out` the **brushed mask** (`maskPaintLayer`) — brushed
     strokes punch holes that the subsequent white fill covers, i.e. the
     brush *adds* regenerate-regions on top of existing content (this is
     inpainting);
   - final `destination-atop` white fill completes the mask: transparent
     (blank/overmasked/brushed) ⇒ white, content ⇒ stays black.
   - **Invert mode** flips the algebra (brushed ∩ visible is *kept*,
     everything else regenerates) — README: "red masks get mutated, blue
     masks stay the same, but you can't take both pills at once."
5. The brushed-mask layer itself is plain black strokes with size/blur/
   opacity (`js/ui/tool/maskbrush.js`), and its *display color* is a CSS
   filter reinterpretation of that one black-painted canvas — `.clear` =
   red (mutate), `.hold` = blue (keep) (`css/index.css:198-220`,
   `setMask()` in maskbrush.js). One storage format, two displayed
   meanings, chosen by the active tool's inversion mode.

### 2.3 Writing back

Results land through the history system, never by raw canvas writes:

- The winning image is scaled to bb, optionally composited with
  **keepUnmasked** — the pre-generation unmasked content, re-pasted with a
  configurable blur so the regenerated seam blends (`keepUnmaskCanvas`
  machinery, `dream.js:276-362`);
- optionally **background-carved**: a per-pixel diff against the
  pre-generation snapshot with blur + threshold keeps only changed pixels
  (`subtractBackground`, `js/lib/util.js:486`) — "Remove Identical/BG
  Pixels," an early extract-the-edit;
- optionally routed to a fresh layer (`autolayer` setting);
- then `commands.runCommand("drawImage", …)` paints it at bb on the active
  layer, **with a provenance log string attached to the history entry** —
  seed, steps, CFG, sampler, model, both prompts, styles (`dream.js:571-607`);
- the brushed mask in the bb is cleared unless `preserveMasks`.

### 2.4 The generation flow as the user felt it

- **Queue with pre-dispatch cancel**: dreams are serialized through a
  promise-chain semaphore (A1111 serves one at a time). A queued dream shows
  *blue* marching ants plus a Cancel button *before* any request is sent;
  re-clicking the same area while one is pending is ignored
  (`generationAreas` Set keyed on `x-y-w-h`). In-flight dreams show an
  **Interrupt** button (`POST /interrupt`).
- **Progress in world space**: a green progress bar + %/ETA is drawn *into a
  canvas layer at the bb* (it zooms and pans with the canvas), polling
  `/progress` ≥1 Hz; every 20% of an iteration the partial
  `current_image` is fetched and **previewed in place** on a temporary
  display layer (`_monitorProgress`, `dream.js:12-79`).
- **Candidate browser docked under the bb** (also world-space HTML): `<`/`>`
  or wheel navigates, `+` generates more, `-` removes, `Y`/Enter/click
  applies, `N`/Esc discards, `R` saves to stamp resources, `S` downloads,
  `U` adopts the seed, `*` marks favorites (shift+arrows jump between
  marks). **Generate-ahead** (`eagerGenerateCount`) keeps producing
  candidates while you browse so there are always N unviewed ones
  (`makeMore`, `dream.js:689`).
- **Interrogate** (N): reticle over any region → `POST /interrogate`
  (CLIP) → the caption arrives in an editable prompt dialog → accepting it
  fills the prompt box and switches to the Dream tool
  (`js/ui/tool/interrogate.js:114`). Caption→prompt→generate in two clicks.

### 2.5 Stamping

The Stamp tool (U) is the manual-placement path: a **resource library**
(uploads, drag-drop, paste, or any generated candidate saved via `R`)
persisted in IndexedDB; the selected image is drawn as a **live ghost on the
overlay layer** following the cursor; wheel scales (0.01–10×), dragging
rotates around the initial anchor (SHIFT snaps to 45° multiples), `-`/`=`
flip/mirror. **The write path crops the ghost itself**: `cropCanvas(ovCanvas,
{border: 10})` screenshots the overlay (content-bounded, alpha-scanned) and
runs the `drawImage` command at that bb (`js/ui/tool/stamp.js:463-519`).
The preview is the source of truth — no separate apply-time transform math,
so what you saw is pixel-exactly what lands. Temporary resources (paste
handoffs) draw once and evaporate, with a `back` callback returning control
to the calling tool under a toolbar lock — an early tool-handoff protocol.

### 2.6 The "infinite" canvas and the document

- Growable, not infinite: default 2048², four 64-px edge-strip buttons
  expand by N px (default 1024; CTRL-click skips the size prompt). Expansion
  reallocs every full layer (copy → resize → redraw at offset → move) and
  shifts the collection `origin`; the input overlay div is 9× the canvas so
  pointer events keep working outside the painted area
  (`js/initalize/layers.populate.js:71-161`).
- **HTML in world space**: `makeElement()` positions real buttons/menus
  inside the camera-transformed overlay (`js/lib/util.js:458`) — cancel
  buttons, candidate browsers, and dream docks are world objects that zoom
  and pan with the art.
- **The document is the command log**: `exportWorkspaceState()` = default
  layer id/name + canvas bb + the serialized command history; import clears
  and replays it; workspaces live in IndexedDB (`js/index.js:1048-1129`).
  Undo/redo IS document time travel, and the floating history panel clicks
  any entry to jump there (`js/ui/floating/history.js`). Because every
  `drawImage` export carries both the applied image *and* the overwritten
  original as data-URLs, a workspace file is a complete, replayable,
  self-inverting edit history — at a size cost.

---

## 3. The clever bits — concepts to carry (with receipts)

1. **The origin-patched 2D context** (`js/lib/layers.js:12-160`). World-
   coordinates-forever with grow-on-demand reallocation, achieved by
   intercepting eight context methods. The *lesson* (all drawing APIs speak
   world space; storage layout is an implementation detail) outlives the
   *mechanism* (monkey-patching prototypes is not something to copy).
2. **The derived-mask single-op model** (`dream.js:1023-1384`). One
   operation — dream-into-a-rectangle — where outpaint, inpaint, and
   txt2img are distinguished *only* by what the canvas-derived mask
   computes. No mode switch, no separate dialogs; the blank check picks the
   endpoint. The mask algebra (content silhouette ⊕ overmask dilation ⊕
   brush additions, composable) is family-agnostic semantics.
3. **The two-plane reticle** (`generic.js:21-100`, `dream.js:1835-1905`).
   World coverage and generation resolution as independent, live-displayed,
   color-coded-by-ratio dials. This is the cleanest UI decomposition of
   "context window vs output resolution" we've seen anywhere, and it predates
   every modern take on it.
4. **Ghost-preview-as-write-path** (`stamp.js:463`, `select.js:812`). Both
   the stamp tool and the transform-apply crop their own live preview layer
   as the pixels they commit. Zero divergence between preview and result by
   construction.
5. **In-world chrome** (`dream.js:12-79`, `util.js:458`). Progress bars,
   marching-ants states (white=running, blue=queued, red=hover-to-apply),
   cancel/interrupt buttons, and the candidate browser are world-space
   objects anchored to the rectangle they concern. Feedback lives where the
   work is.
6. **Provenance-bearing history as the document** (`commands.js`,
   `dream.js:571-607`, `index.js:1048`). Every applied generation records
   its full recipe beside its inverse; the workspace replays. The exportable
   log (`history.js`) is a human-readable audit trail of everything done.
7. **Queue semantics as UX**: cancel-before-dispatch, same-area dedupe,
   interrupt-in-place, generate-ahead prefetch, candidate marking
   (`dream.js:202-1015`).
8. **Write-back hygiene**: keepUnmasked blur-paste and the pixel-diff
   background carve (`util.js:486`) — the first "preserve what existed,
   extract what changed" discipline, client-side.
9. **Interrogate→prompt→tool-switch** (`interrogate.js`) — captioning wired
   directly into the generation loop as a two-click flow.
10. **Minor but tidy**: the dual-step slider (coarse drag step + fine typed
    step, `js/lib/ui.js:79`); snap-to-grid as a *returns-an-offset* function
    (`snap()` returns the delta to add, composable at call sites).

---

## 4. What aged out — the don't-carry list

1. **The A1111 umbilical.** Global server-side model state (checkpoint
   switching mutates the world), payload churn patched commit-by-commit,
   extension detection by substring match, CORS flag ceremonies,
   `--gradio-debug` breakage, first-run dialogs about *inpainting
   checkpoints*. The app is a thin, tightly-coupled client over one volatile
   backend; its most fragile code is exactly its integration surface
   (`js/index.js` generally; `js/extensions.js` entirely).
2. **base64 PNG strings as transport** — requests, progress previews, and
   the history/document format all inline data-URLs. Memory-heavy, no
   streaming, no shared blobs.
3. **DOM-composite rendering.** N stacked `<canvas>` elements scaled by a
   CSS transform: no culling, no tiling, no level-of-detail, no DPR story;
   zooming out rasterizes everything; "infinite" is bounded by realloc cost
   and the 9× input overlay. (Our substrate already solves precisely this.)
4. **Flattened generation context.** `getVisible()` always flattens —
   layers matter for editing but never condition generation; there is no
   per-layer or per-region generation, no region-anchored anything.
5. **One shared global mask layer**, written by one brush, cleared per op,
   not part of the command history (mask strokes are not undoable), one
   mask for the whole document.
6. **Global mutable state everywhere** — `stableDiffusionData` read live
   from DOM inputs mid-flight, `toolbar._current_tool`, cross-module
   singletons; no reactivity, no serialization boundary beyond the command
   log.
7. **Single model family, SD-era inpainting assumptions** — mask+init-image
   img2img as the only edit mechanism; ControlNet/reference wedged in as
   `alwayson_scripts` arg tuples; square 64-multiple resolutions; CLIP-only
   interrogate through the same backend.

---

## 5. The gap analysis — what the maintainer's vision adds

Read as a straight delta over what openOutpaint demonstrably had:

- **Layers as generation context / region-anchored editing.** Upstream
  flattens; we want regions that own their prompt, model family, and dials —
  the reticle's context window becoming a *persistent, addressable object*
  rather than an ephemeral per-click computation. None of that exists
  upstream (the closest artifact is the drawn selection, which evaporates
  after one op).
- **Krita-class manual tools.** Upstream's manual surface is one crude
  color brush and a marquee-transform. The vision's painting/selection/
  layer-manipulation depth is absent upstream by an order of magnitude.
- **Multi-family models behind the registry.** Upstream hardcodes one
  backend's payload. Under our settled registry-only directive, the derived
  context (flattened view, mask, resolution) becomes *inputs each family
  declares it can consume* — Krea-2 edit lanes, H3 instruct-edit, inpaint
  lanes with pre-fill/restore pairs — instead of one img2img shape. Modern
  families have no inpainting checkpoints; mask semantics must be
  negotiated per family, not assumed.
- **Local llama.cpp auto-captioning.** Upstream proves the UX value of
  interrogate (caption→prompt→generate, two clicks) but delivers it as
  CLIP-through-A1111, one region at a time, via a `prompt()` dialog. The
  vision generalizes: app-owned captioner, no engine dependency,
  region-scoped, feeding per-region prompt slots.
- **Substrate we already built**: tiled/culled camera with zoom fidelity
  (vs DOM-composite), typed op document (vs JSON command log), engine
  bridge with job queueing/progress (vs fetch+poll), the three-surface
  workshop with the modularity contract (vs one monolithic page), video/
  temporal media (upstream is stills-only), per-model prompt doctrines,
  resolution tiers (video-locked / image-focus / starter-frame / custom)
  vs the one square slider.

---

## 6. The seed sketch — its semantics on our substrate

Ideas only; nothing locked ("we don't lock anything in until we have the
facts"). Maps openOutpaint semantics onto what exists at HEAD of `main`:

- **Reticle → a placement intent affordance on the wiring surface.**
  `src/canvas/stillIntent.ts` / `generation.ts` already carry placement
  intents; the two-plane display slots in as intent chrome — world coverage
  vs request resolution, ratio color-coded — with the *resolution ladder
  chosen per family* (the H3 image-stack tiers replace the 128-square
  slider). Drag-out selections already exist as selection state in
  `store.ts`; the grid-snap discipline (offset-returning snap at the intent
  boundary) ports directly.
- **Derived mask → family capability negotiation.** Keep the exact input
  computation (flattened visible content in the box, blank-vs-content,
  brushed additions, overmask/keepUnmasked as knobs) but emit it into the
  family's declared graph ports (`src/lib/graph/*` builders) instead of an
  A1111 img2img payload. Where a family *can't* consume a mask, the
  client-side fallbacks (keepUnmasked paste, pre-fill/restore composite
  pairs from the inpaint lane) are the capability's complement — the
  modularity test applies: a family that lacks the port simply receives the
  composite instead.
- **Stamping → library + ghost placement op.** LibraryOverlay/IndexOverlay
  are the resource racks; the ghost-follows-cursor preview and
  crop-the-ghost write path become a placement op in the typed op document
  (`src/canvas/ops.ts`), with the provenance-string idea landing as op/
  generation metadata (jobsStore already tracks seeds/params — the lesson
  is to keep recipe-with-result as a first-class, queryable pairing).
- **In-world chrome → substrate overlays.** Progress-at-the-rectangle,
  marching state colors, and the candidate browser become overlay
  components anchored to op/tile ids (they inherit the camera for free —
  the thing upstream needed the whole input-overlay hack for). Candidate
  browsing + generate-ahead map onto jobsStore policies; cancel-before-
  dispatch and same-area dedupe are queue policies, not UI code.
- **History-as-document → already ours, plus the provenance lesson.** The
  typed op store is the modern descendant; the piece worth importing is the
  per-edit recipe log and the click-any-entry time travel (both exist
  upstream and both read as workshop-table stakes).
- **Coordinate discipline → the origin-patch's real lesson.** Our world
  space is already unbounded with culling; the rule to keep enforced at
  every API boundary (ops, graph inputs, overlays) is that *all* consumer
  math happens in world space and nothing outside the tile layer ever sees
  tile-local coordinates.
- **Explicitly not carried**: the DOM-composite camera, base64 transport,
  server-global model switching, string-matched extension probing, the
  single shared mask layer, and the prototype monkey-patch itself.

---

*Corrections to this doc arrive as dated addenda, never silent rewrites.
The clone directory used for this read was outside the repo and removed
afterwards; nothing from upstream entered our tree (no vendor, no port —
this is a semantics extraction, so no registry row is due).*
