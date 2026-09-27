# Image workbench v2 — the layered canvas (spec DRAFT r2)

**Status:** DRAFT r2 — r1 passed the blind adversarial audit (2026-09-27, task
5rmqvk4, appended in full below) and this **dated fix pass (2026-09-27, task
wzm5vv8)** applies its eight FIX dispositions to the body, rewords Q8, and
records the Q2 material update; next stop is the maintainer's blessing (the
house method, directive `c965023f`). **From scratch by mandate** — this
is not an amendment of `docs/specs/image-workbench-v1.md`; that spec is BLESSED+BUILT
reference material whose lanes are **mapped in** (§8), not inherited. Flux: mnz1ood
(epic 4lphxv8); the r2 pass: wzm5vv8 (same epic). Directive lineage: `c965023f`
(the commencement) on `b90ce8f6` (the
founding vision), `8dce5967` (the marquee-composite workflow), `f75885c8` (the
movable context window); architecture laws honored throughout: `5c93040f` (the
central-model law), `373fa62e` (the conductor), the modularity contract
(docs/agent/conventions.md; remediation-plan §6).

**Inputs (read in full before drafting):** docs/research/openoutpaint-core-vision.md
(**[oO-core]** — every openOutpaint behavioral claim below is [DOC]-verified there),
docs/research/image-workbench-prior-art.md (**[prior-art]** — InvokeAI v6.14.1
code-read, the deformer map, the library floor, the licensing map),
docs/research/seamless-blending-survey.md (**[blend-survey]** — the ranked
blend-back stack, the JS-availability truth, the `toneLockBlend` kinship;
landed at 919a790 AFTER r1's 7151a66 and folded into §6/§5.3 at r2),
docs/research/ui-systems-design-language.md (**[ui-systems]**),
docs/specs/canvas-ui-v1.md (**[canvas-ui]**), docs/specs/canvas-document-model.md
(**[doc-model]**), docs/specs/image-workbench-v1.md (**[iw-v1]**),
docs/audit/remediation-plan.md (**[remediation]**),
docs/research/fizgig-h3-still-assessment.md (**[fizgig]** — the 8MP evidence),
docs/research/agentic-captioning-harness-tech.md + video-dataset-prep-tools.md
(**[caption]** — the llama.cpp VLM mechanics). Directives quoted verbatim where
load-bearing; file anchors to our tree are at HEAD `e9b1dd3`.

**Format:** decision record, not marketing. Where this spec chooses, the rejected
alternative and the reason are recorded inline and consolidated in §0. Where it cannot
choose, the item is enumerated in §12 for the maintainer.

---

## 0. The decision record (one screen)

| # | Decision | Rejected alternative | Why (one line) |
|---|---|---|---|
| D1 | The image document is a **new document type in the shared server store** (§3) | Extending the chain/project document; client-only localStorage | Chain invariants are generation-shaped (settings-results separation), not edit-shaped; localStorage is per-browser and dies with the session [remediation DA-6] |
| D2 | **Shared camera + own content engine**: the d3-zoom camera module is extracted and shared; the raster scene graph is a konva-class engine owned by the module (§4) | Extending the DOM-tile substrate with raster tiles; react-konva | DOM-composited N-stacked-canvases with no culling/LOD is exactly openOutpaint's aged-out piece [oO-core §4.3]; Invoke proves raw imperative Konva at 53.5k-LOC scale [prior-art §1.2/§1.6] |
| D3 | Layer content is **hybrid**: geometry objects where cheap, baked raster chunks for pixel-native work (§3.1) | Invoke's all-geometry model (no bitmap layer at all) | Krita-class engines (smudge, liquify) are pixel-native; forcing geometry serializes every stroke [prior-art §2.1] |
| D4 | History = **typed command log with inverses, blobs referenced by content hash** (§3.3) | openOutpaint's data-URL-inlined commands; snapshot-only undo | Provenance-bearing command history is the gold [oO-core §3.6]; inline pixels are the memory cost that kills it [oO-core §4.2] |
| D5 | The derived mask is **computed client-side from document truth; mask *consumption* is a family-declared capability** with client-side complements (§5.3, §7) | Assuming one img2img mask shape (openOutpaint's era); server-side mask baking | Modern families have no inpainting checkpoints — mask semantics are per-family negotiation, not a constant [oO-core §5]; central-model law forbids a workbench-side family interpretation [5c93040f] |
| D6 | The marquee is a **free-transform reticle** (scale + rotation + placement) | Invoke's axis-aligned AR-locked bbox | The maintainer's semantics are explicit: "scale it up/down, ANGLE it, place it however you want" [f75885c8] |
| D7 | Invoke adoption is **selective** (module skeleton, math, bbox-scaling, staging pattern; vendored code only where clean and tested) | Vendoring the 53.5k-LOC canvas subsystem | The honest costs are recorded [prior-art §1.6]: RTK+redux-undo store idioms weld their app into ours; the cut line is a blessing-time ratification (§12 Q2) |
| D8 | Deformers ship **last, as editable layer parameters** (deform-ops), never baked tool passes | Bake-on-apply deform tools | Krita transform-masks + Photopea smart filters prove the parameter shape [prior-art §2.1/2.3]; the maintainer's agreed synthesis says deformers-last additivity [c965023f] |
| D9 | Engine access is a **port** (EnginePort) over the shared submit core today, the conductor module when it lands (§2.1) | The workbench talking to ComfyUI directly; workbench-owned engine management | The conductor is the single layer between external systems and the app [373fa62e]; engine management is Control/Conductor scope, never creation-surface scope |

---

## 1. Vision & scope

**What this is.** A full image editing app on an infinite canvas where generation is a
tool. The founding frame [`b90ce8f6`]: openOutpaint's premise was "basically our
infinite canvas, but you could stamp down an image, inpaint, outpaint, generate on an
infinite canvas — anchor and define the context window and resolution dynamically";
the maintainer's addition: "editing features where you can anchor to a selected region
and edit aspects. This would be a very novel tool," with tools "like Krita or Photoshop
— manual painting, liquify, hand edits, resizing, perspective, meshing and pinching,"
and LAYERS — "essentially a full image editing app."

**The novel-tool claim, stated honestly** [prior-art §6]: the union — anchor-bbox
generative editing + Photoshop-class deformers + layers in one open tool — exists
nowhere. Invoke's transform is affine-only (verified in `CanvasEntityTransformer`
[prior-art §2.4]); Krita/GIMP have no generative canvas; openOutpaint has neither
deformers nor editor-grade layers. Every ingredient is prior-arted; the combination,
the engine-pluggable document model, and the region-anchored edit families are the
novel surface. We claim no more, and that is enough.

**What it is NOT (yet):**
- **Not video.** "The video side is likely approached differently — we start with
  image" [`b90ce8f6`]. The video relationship in v2 is exactly two handoffs that
  already exist: the start-frame exit (unchanged, [iw-v1] §9) and export-to-canvas as
  a media object. A video-grade handoff (takes/hop/drift from an editing canvas) is
  named prior-art gap #5 [prior-art §6] and is deliberately out of scope.
- **Not a node graph.** Orchestration, chains, forks, and the wiring canvas's typed
  holes are the WIRING surface's job [ui-systems §architecture]. The workbench is
  document-shaped: it owns a layered spatial document and calls engines through a
  port; it never owns job graphs.
- **Not the Control Center, not the dataset manager.** Monitoring, engine health,
  installs, and dataset wrangling stay in their surfaces; the workbench hands off
  (start-frame, export, caption-to-dataset later).

**The scope-gravity guardrail (a standing norm, restated in §11):** the workbench
builds document-editing capability. Any pull to absorb the wiring canvas's
orchestration, the Control Center's monitoring, or the dataset manager's wrangling
inside the creation surface is design drift — route it to a handoff instead. The
three-surface workshop [ui-systems, directives `dbbc10fc`/`a6eeb426`] is the frame
this module must strengthen, not flatten.

---

## 2. The modular isolation architecture

The central mandate [`c965023f`]: "FROM SCRATCH, MODULAR, and easy to work on in
isolation from the rest of the app, but must still feel part of it," with the
standalone exit honored in the design ("if in the future this portion takes off I may
want to make this a standalone app" [`b90ce8f6`]).

### 2.1 The ports (the module's ONLY doors to the outside)

The module lives behind a lint-enforced import boundary (the same enforcement pattern
as the UI wrapper rule [ui-systems §5.1]: eslint restricted-imports declaring what
the module may import). Five ports; everything else is inside.

| Port | Provides | Implementation today | Implementation later |
|---|---|---|---|
| **EnginePort** | submit(job) → jobId; progress/cancel events; image upload/fetch | the **shared submit core** the canvas image intent and the v1 surface both route through (the `h3img` family core; [canvas-ui] Phase-3 addendum names the seam) | the **conductor** [`373fa62e`] — the port interface is written so the conductor module becomes the implementation with zero workbench diffs |
| **DocumentStorePort** | open/save/list/delete image documents; versioned migrations; blob put/get by content hash | the server document store (better-sqlite3 + WAL, the [doc-model] substrate) extended with the §3 tables | unchanged in shape; a standalone build swaps in a local store implementing the same port |
| **FamilyPort** | the family list + per-family capability declarations (§7): resolution ceiling/grid, aspect policy, mask semantics, ref support, edit taxonomy | the optimization/family registry entries (the insert-only `OptimizationEntry` pattern, [remediation] A-3) extended with declaration data | the conductor serves the same declarations as part of its rich API [`373fa62e`] |
| **CameraPort + design system** | the d3-zoom camera module (gestures, rAF transforms, snap); shibui tokens, `Studio*` wrappers, `DockShell`, surfaces-registry entry | extracted shared camera module (from `src/canvas/camera.ts` + `cameraDom.ts`); [ui-systems] L0–L2 | ships with the module on extraction (small, ours, MIT-clean) |
| **CaptionPort** | VLM describe(image|region, template) → text | the llama.cpp server route (mtmd path; capability discovery via `/v1/models` [caption]) | conductor-tracked llama.cpp [`373fa62e` lineage: the LLM router tracking] |

**The rule that makes this the central-model law compliant** [`5c93040f`]: the
workbench maintains **no interpretation of any shared domain**. Models, families,
node packs, engine state — all read through ports from the ONE central resolution.
The workbench's own truth is exactly one domain: **the layered document and its
history** (§3), which nothing else in the app interprets. There is no mini-system
inside: no parallel model list, no shadow engine client, no second job queue — jobs
are submitted through EnginePort and land as document commands, and the wiring
canvas's job/radar machinery keeps owning execution visibility.

### 2.2 What lives INSIDE

- The layered document model + its command history (and the co-designed store
  tables — the store *extension*, landed through the DocumentStorePort's migration
  discipline, not a parallel database).
- The raster rendering engine (konva-class scene graph, compositor, LOD/culling,
  caches — §4).
- The tool system: marquee, brush/eraser, selection/move/transform, stamp/import,
  shapes/text, the deformer tools (§11 Phase D).
- The marquee machinery: two-plane math, lift round-trip, derived-mask algebra (§5).
- The composite pipeline ops (§6) as document commands.
- The assessment surface: takes-as-layers, blind selection, the grading seam (§9).
- The negotiation **consumer**: reads FamilyPort declarations and renders capability
  into the reticle's affordances (§7). It contains zero family names in code.

### 2.3 The STANDALONE-EXIT section (the modularity contract's proof)

Extraction as a standalone product = re-implementing five ports + shipping three
shared assets. Nothing inside the module reaches outward except through §2.1.

| To extract | Swap with | Effort class |
|---|---|---|
| EnginePort | any ComfyUI-endpoint client (the port is honestly ComfyUI-shaped today — prompt/graph submission, WS progress; recorded, not hidden) | one adapter |
| DocumentStorePort | a local SQLite (or even IndexedDB) store implementing the same schema + migrations (the schema ships in §3) | one adapter |
| FamilyPort | a config file of family declarations (the declaration schema is data) | one loader |
| CameraPort | the camera module travels with it (it is small, ours, dependency-light: d3-zoom) | copy |
| Design system | the token file + the thin `Studio*` wrappers travel (they are hand-CSS + base-ui bindings, no app coupling [ui-systems §5.1]) | copy |
| Shared assets/takes (read-only imports) | the standalone product ships without the global asset store; import-from-file covers it | graceful degradation |

**The verification shape** (an acceptance gate, §13.1): a headless harness boots the
module against port mocks — no engine, no server — and the document model + marquee
math + tool logic all run. If that harness ever needs a real app service, the boundary
has leaked. This is the proof the contract demands: pulling the tool out is
repackaging, not rewriting.

**What deliberately does NOT travel:** the chain/take machinery (video world), the
wiring canvas, the Control Center. The module's value survives extraction precisely
because it never welded to them.

---

## 3. The document model

The layered spatial document — the module's own domain truth. **D1**: a new document
type in the shared server store ([doc-model] substrate: SQLite via better-sqlite3 +
WAL, versioned migrations, copy-never-destroy), designed as a store extension through
the DocumentStorePort. It is NOT a chain document variant: chains carry
settings-results separation and append-only takes because they are generation
pipelines [canvas-ui §2]; an edit document carries a command log because it is a
workspace. The two share blobs, jobs, and assets; they do not share invariants.

### 3.1 Entities

- **ImageDocument**: id, name, `schemaVersion`, camera (x/y/zoom — autosaved always,
  the [canvas-ui] lock-6 doctrine), background state, created/deleted (tombstone).
  World space is **truly unbounded** — culling discipline, not openOutpaint's
  growable-realloc rectangle [oO-core §2.6/§4.3]. (The background field, named:
  a flat color or transparent — the composite floor beneath layer zero.)
- **Layer**: id, documentId, name, z-order, opacity, blend mode (the full Canvas2D
  composite-op set — Invoke's proven shape [prior-art §1.3]), `transform` (the
  affine placement as data — the paragraph below), visible, locked,
  optional adjustments (brightness/contrast/saturation/temperature/tint/sharpness —
  Invoke's raster-layer set, adoptable as code), `isTransparencyLocked` (the
  Photoshop lock-transparent-pixels primitive Invoke ships).
- **Layer kinds** (**D3**, hybrid content):
  - `raster` — pixel content as content-hash-addressed blobs in the shared blob
    store; brush strokes accumulate into tile chunks (Krita's engines are pixel-native
    [prior-art §2.1] — smudge/liquify-class tools write pixels, not geometry).
  - `vector-objects` — shapes/text as geometry, **rasterized at the edges** (at
    composite/dispatch time) — Invoke's proven discipline [prior-art §1.1/§1.3];
    strokes that stay geometry where cheap (perfect-freehand rendering).
  - `deform` — **a deform-op as an editable layer parameter** (**D8**): typed
    geometry (displacement field | MLS point pairs | 3×3 homography | cage) + dials,
    evaluated at render, baked only on explicit flatten. Krita's transform-mask
    pattern + Photopea's smart-filter round-trip [prior-art §2.1/§2.3]; open TS
    territory (nobody-has-it #6 [prior-art §6]).
  - `generation` — a lift-round-trip result (§5.2): pixels + **provenance** (family,
    prompts, seed, full dial set, source geometry, mask provenance, job ref).
    **Layer-per-result IS the takes system** [`f75885c8`]: "10 generations in a
    single area" = 10 sibling layers to crop/blend/keep among.
- **Region** — a saved marquee (named, persistent, addressable): world geometry +
    optional per-region prompt, family binding, ref bindings, Keep dial. This is the
    "anchor to a selected region and edit aspects" object [`b90ce8f6`] — the
    persistent form of openOutpaint's ephemeral per-click reticle (the closest
    upstream artifact "evaporates after one op" [oO-core §5]) and the home of
    region-anchored **edit families** (prior-art gap #4 — ours to design).
- **Command** — one entry in the document's history (§3.3).

**Transform-as-data (r2, the audit's defect 4).** A layer's placement — a 2D
affine (translation, rotation, scale; stored as a 3×2 matrix about a declared
anchor), identity by default — is LAYER STATE, never baked pixels: the content
blob stays at native resolution and the transform applies at composite/render
time (and at lift/consolidate, which read through it). One field, three
consumers: §5.2's RETURN (the result raster's `transform` = the reticle's
world transform), §6 stage 3's collage transforms, Phase D's move/transform
tools. **The resample budget, stated:** a marquee round-trip costs exactly ONE
effective resample — the lift's inverse-transform sample; the returned raster
is stored once at model resolution and placement is data application at
composite (the same cost every transformed layer pays at render), so
rotation-in = rotation-out with no bake-on-apply second resample. Baking
happens only on explicit flatten — the D8 deform discipline, applied to the
affine too.

### 3.2 Store seam (the honest design)

New tables through the [doc-model] migration discipline (F9: every write carries
`schemaVersion`; unknown-newer refuses loudly; one-way migrations tested against
golden fixtures of real documents):

- `image_document` (id, name, schema_version, camera json, settings json,
  created_at, deleted_at) — tombstoned like `project`.
- `image_layer` (id, document_id, kind, name, z, opacity, blend,
  transform json (identity default — §3.1's transform-as-data), params json,
  content_blob_hash nullable, provenance json nullable, created_at, deleted_at) —
  **normalized, not a document JSON blob**: layers are row-level because search,
  partial persistence, and blob GC need per-layer addressing. *Alternative rejected:*
  one JSON per document — cheaper today, unsearchable and all-or-nothing at scale.
- `image_command` (id, document_id, ordinal, kind, payload json, inverse_ref json,
  provenance json, created_at) — the append-only history; ordinal-UPDATE only for
  truncation at undo-cursor (the [doc-model] `op` table's discipline).
- **Regions** ride `image_layer`-adjacent as their own table (`image_region`) — they
  are addressable document objects, not layer params.
- **Blobs & GC (r2, the audit's defect 1 — r1's "no new machinery" was
  wrong).** The blob table itself is shared and unchanged; the GC's MARK SET
  is not. [doc-model §3]'s sweep marks fork edges + canonical/locked takes +
  un-emptied-trash entities — a mark set that knows nothing of image
  documents, so as r1 stood the sweeper would reclaim blobs the command log
  still needs and undo would silently break (the silent-data-loss class the
  house bans). The machinery addition, landed through the
  DocumentStorePort's migration discipline: **the sweep gains an
  image-document mark pass.** Liveness for an image document = **live
  layers' `content_blob_hash` ∪ every blob ref reachable from the command
  rows currently in its log** (payloads, `inverse_ref` cutouts, generation
  provenance — commands past the undo cursor included, since the redo tail
  must stay live until the next NEW edit truncates it) **∪ the same for
  tombstoned documents until their trash is emptied** (restore must work —
  the [doc-model] tombstone doctrine). The log IS the provenance (D4), so
  log-reachable blobs are tier-1 resident for their document: no evictable
  tier exists inside a live edit document.

Autosave always (camera included); trash = tombstone + restore, matching the
project semantics [doc-model §3]. FTS: document names + region names join the
existing index surface (scope rides the L6-adjacent palette question — not new
machinery).

**Color posture (r2, the audit's SPEC-CHOICE note):** **sRGB-only, end-to-end**
— document blobs, compositing, and engine handoff are all sRGB; no ICC profile
management in v2. A recorded assumption, reopened only if a family declares a
non-sRGB pipeline (a §7 declaration could carry it).

### 3.3 History — the command log with inverse (**D4**)

openOutpaint's gold, on our substrate [oO-core §3.6]: **the document is its
provenance-bearing history**. Every edit — brush stroke, layer add/remove/reorder,
opacity/blend change, deform-param edit, region save, generation round-trip — is a
typed command carrying (a) its payload, (b) its inverse (the overwritten cutout as a
blob ref, the pre-change params, the removed layer row), and (c) provenance (for
generation commands: the full recipe — family, prompts, seed, resolution, mask
derivation, ref set).

- *Alternative rejected:* openOutpaint's inline data-URL commands — a complete
  replayable history at a size cost that aged out [oO-core §4.2]; we reference blobs
  by content hash instead of embedding pixels.
- *Alternative rejected:* snapshot-per-save undo only — loses per-edit provenance,
  which the assessment surface (§9) and the recipe-log lesson [oO-core §6] both need.

**Undo semantics across manual + generative edits:** ONE history. ⌘Z walks back
through brush strokes and generation round-trips identically; undoing a generation
removes exactly its result layer (source layers untouched beneath — the round-trip
is non-destructive by construction, §5.2); the history panel clicks any entry to
time-travel (openOutpaint's floating history, read as workshop-table stakes
[oO-core §6]).

**Undo/redo mechanics, made precise (r2, the audit's defect 2):** undo moves a
cursor over an INTACT log (inverse commands replay against state); **redo
lives until the next NEW edit** — a new edit lands at the cursor and truncates
the redo tail with it (the [doc-model] `op`-table discipline, stated for image
documents). An async generation arrival is a new edit like any other and
clears redo; the full arrival semantics are §5.2's.

**The bridge to the chain/video world (one-way in v2):** export-to-canvas (a result
as a canvas media object), the start-frame exit (consent-gated, unchanged [iw-v1]
§9), import from library/assets/takes. Image documents do NOT join the chain
input-spec recursion in v2 — that integration shape (a chain consuming an image
document as a live substrate) is a recorded later question, not a silent commitment.

---

## 4. The rendering substrate decision

**The decision (D2, the maintainer-agreed synthesis [`c965023f`]): share the camera,
own the content model.**

### 4.1 The shared half — the camera

The camera discipline that the wiring canvas proved at scale ([canvas-ui] §3: d3-zoom
as the sole gesture writer, store-outside-React camera applied via rAF, viewport +
margin culling; measured ≥43 fps interactive at 2000 objects on software rendering,
L33) is **extracted into a shared module** (`src/canvas/camera.ts` +
`cameraDom.ts` → a shared camera module both surfaces import). The workbench mounts
its own stage and subscribes to the same camera contract: identical pan/zoom feel,
identical modifiers, identical cursor-anchored zoom, snap points in the same
places. **This — plus the design system — is what "must still feel part of it"
means in code.** The camera is not re-implemented, not forked: one module, two
consumers.

### 4.2 The owned half — the content engine

A konva-class raster scene graph, owned by the module. **konva (MIT)** is the
adopted library candidate [prior-art §3]: the substrate Invoke already proved at
scale, 57 KB gz, zero deps. Usage shape follows Invoke: **raw imperative Konva, no
react-konva** — a module tree (`CanvasManager`/`CanvasModuleBase`-class skeleton is
an ADOPT-as-code candidate [prior-art §1.2/§1.7]), per-entity renderers with
incremental `update(state)` diffing, a buffer renderer for in-progress strokes
(committed to state on stroke end), a compositor that rasterizes the visible stack
to an arbitrary rect (the lift input, §5.2), and a worker for alpha-bbox extents.

*Alternative rejected:* extending the DOM-tile substrate with raster tiles. The tile
substrate is chain-object-shaped (posters, metadata strips, op chips); raster layers
need pixel compositing, per-layer transforms and filters, and hit-testing DOM tiles
do not provide — and DOM-compositing N stacked canvases under a CSS transform with
no culling/LOD is precisely openOutpaint's aged-out rendering piece [oO-core §4.3].
The prior art died on that hill; we don't re-fight it.

**What carries over from the DOM substrate:** the culling/margin discipline
(applied to konva nodes), the transient-store discipline (ephemeral tool state
never enters React render — nanostores-class atoms, Invoke's own split between
undoable state and ephemeral state [prior-art §1.2]), react-rnd docks for the
workbench's panels, the z-canon [ui-systems §3], and semantic zoom reinterpreted
for raster: **LOD by zoom band** — downsampled proxies at far zoom, full resolution
at near (the cache keyed by content hash, Invoke's cache module pattern).

### 4.3 The 8MP reality and the WebGL escalation path

The image-focus resolution tier runs to the **8MP author-demonstrated ceiling**
(Fizgig README: 3872×2176, 50 steps, `er_sde`; the maintainer's correction
"Fizgig tested on 8MP as shown in his README.md" [fizgig]; schema ceiling 4096/dim
in 32-px multiples). 8MP RGBA is ~32 MB per layer frame: CPU compositing of a
handful of layers is fine; **live deformer preview over 8MP is the one place CPU
will measurably choke**. The escalation path is fixed now and used only on
measurement (**D2's discipline, the L33 precedent**):

- **pixi.js (MIT)** as a *separable GPU layer* — `DisplacementFilter` = live liquify
  preview; RenderTexture compositing for the deform evaluation [prior-art §2.4/§3].
- **Trigger:** measured interactive-fps breach of the live deformer preview at the
  8MP tier on target hardware (the canvas budget harness discipline — numbers, not
  anticipation). Until then pixi is not in `package.json` (no shelf-ware deps,
  [ui-systems] §7 step 5's rule).
- The renderer sits behind an internal content-renderer interface so the GPU arm is
  a module-internal swap, not an architecture change.

---

## 5. The marquee / movable context window — the primitive spec

The heart of the workbench, per the completed semantics [`f75885c8`]: "basically a
movable context window — you can scale it up/down, ANGLE it, place it however you
want. The image gets LIFTED and scaled to a resolution the model can actually work
with, the result is returned and placed EXACTLY WHERE IT GOT LIFTED FROM, ON A NEW
LAYER."

### 5.1 The reticle — free transform, two planes

- **The feel reference (r2, the audit's defect 10 — the directive's UX north
  star, restored):** [`f75885c8`] — "A lot like how the workflow feels inside
  of Krita when using Acly's Krita Diffusion plugin"; the directive's
  interaction-model study "now also feeds the design round." The repo holds
  only the transport study today ([node-pack-registry §4.3] — the
  ComfyUI↔Krita communication layers), so the **Krita-AI-Diffusion
  interaction-model capture is queued** (research pass, Flux bg0815k) with a
  hard gate: it lands before the reticle UX hardens (Phase C entry, §11).
  What it must answer: the selection→generate→placed-in-place feel, queue/
  error visibility, and where the document stays live around a generation.
- **Shape (D6):** a free-transform region — scale, **rotation**, placement; not
  axis-aligned. Drag out a rectangle, then transform it (handles + rotation; 45°
  snap on shift, the stock transform-discipline). *Invoke's bbox tool is the mature
  axis-aligned form (per-anchor drag-bound math, model-driven AR constraints —
  adoptable machinery [prior-art §1.4]); the rotation generalization is ours and is
  what the lift round-trip's inverse transform requires.*
- **The two planes (openOutpaint's cleanest decomposition [oO-core §2.1], kept
  verbatim in semantics):**
  - **World coverage** — the reticle's extent in document space (the context
    window). This is what the model gets to SEE.
  - **Model resolution** — the pixel dimensions shipped. This is what the model
    gets to WORK AT.
  - Both display live on the reticle; the second shows only when decoupled; the
    **ratio is color-coded** (orange = the cursor covers more than the model will
    generate — downsampling; blue = supersampling). The ratio display is the user's
    fidelity control, live, before any commit — **and it reads per-axis** (r2:
    the axes can differ by up to one grid step under the pad policy below).
- **Resolution selection composes three things:** (1) the family's declared
  ceiling + grid (§7) — e.g. H3-still: 32-px multiples, ≤4096/dim, 8MP demonstrated
  [fizgig]; (2) the tiered resolution system already shipped with the H3 image stack
  (video-locked / image-focus to the 8MP ceiling with decode-leg-aware optimals /
  starter-frame / custom); (3) Invoke's area-preserving scale-to-model-optimal
  behavior (`getScaledBoundingBoxDimensions` pattern — AR is user intent, actual
  generation size is model-aware, result composited back to the bbox footprint
  [prior-art §1.4]). Net semantics: the user dials intent (tier + AR + the
  coverage/resolution ratio); the engine computes actual dims on the family's
  grid — and nothing silently rescales, with the policy that makes it true
  (r2, the audit's defect 5): **AR-preserving pad-into-grid.** Per-axis grid
  snapping (32-px multiples) perturbs AR; the snap is absorbed in PAD, never
  in content stretch — the AR-preserving scale computes first, each axis
  rounds UP to the grid, and the WORLD rect grows to match the padded
  raster's aspect (a margin ring beyond the reticle). Lift and RETURN are
  then pure isotropic scales of that one padded rect — content mapping is
  exact, no anisotropic stretch exists anywhere in the round trip — and the
  pad ring (engine-rendered margin) is cropped at return (§5.2), leaving
  footprint exactness (±0 px) untouched. The ratio display reads per-axis
  where the axes' effective ratios differ, so the pad is visible before
  commit, never silent.

### 5.2 The lift round-trip (non-destructive, geometry-exact)

1. **CONSOLIDATE** — flatten visible layers within the reticle to a scratch buffer
   at world coverage ("consolidate everything beneath it" [`8dce5967`]). A read of
   document state; layers are never written. (openOutpaint's `getVisible` semantics,
   on a real compositor [oO-core §2.2].)
2. **LIFT** — sample the consolidated region through the reticle's **inverse
   transform** (rotation-aware resample) into the model-resolution raster.
3. **DERIVE** — compute the derived mask (§5.3) from the same document truth.
4. **GENERATE** — submit through EnginePort: family (from the region binding or the
   active pick), prompt (region prompt if a region, else document prompt), refs,
   dials, resolution from §5.1 — **and the derived mask grown by the mask-grow
   dial** (r2, [blend-survey §4.1] step 1: growth happens at the SUBMIT seam, a
   lane-graph parameter, so the eventual seam sits inside engine-re-rendered
   content; the blend-back at RETURN composites at the ORIGINAL, ungrown mask
   and the grown ring is cropped). The **batch dial N** below may queue N of
   these.
5. **RETURN** — the result is placed as a **NEW `generation` layer at the exact
   source geometry**: the raster is stored once at model resolution with the
   layer's `transform` (§3.1) = the reticle's world transform, so footprint =
   the reticle footprint, ±0 px, the grid-snap pad cropped (§5.1), and NO
   second resample (the transform applies at composite). Originals untouched
   beneath. **Layer-per-result = takes** [`f75885c8`]: N passes in one area,
   N sibling layers; crop, blend, keep (§9).
   **The batch dial (r2, the audit's defect 6 — "10 generations in a single
   area" gets its mechanism):** the reticle/region carries **N** (default 1);
   submitting queues N round-trips as N independent jobs — same request
   recipe, independent seeds — each returning as its own layer. The N
   siblings form one takes set (§9) grouped by source geometry in the
   in-world takes browser, and each arrival is its own command (undo removes
   exactly one take). Upstream's candidate-browser `+` is this dial.

**Queue semantics as UX** (openOutpaint gold #7 [oO-core §2.4], on our jobs
machinery): cancel-before-dispatch (a queued round-trip shows state + Cancel before
any request leaves), request-keyed dedupe (re-submitting a still-pending
IDENTICAL request — family + recipe + geometry + batch slot — is ignored; a
different recipe or batch slot over the same area is NOT; r2, defect 6),
interrupt-in-place, optional generate-ahead later. **In-world chrome** (gold #5):
progress, partial previews, and the takes browser render AT the reticle, anchored to
its world geometry — overlay components that inherit the camera for free (the thing
upstream needed its 9× input-overlay hack for [oO-core §2.6]).

**The ghost rule (gold #4):** placement-type interactions (stamp, import, transform
apply) commit **the live preview itself** — crop-the-ghost as the write path — so
what you saw is pixel-exactly what lands [oO-core §2.5]. The marquee's lift follows
the same law: the two-plane display IS the contract; the shipped pixels match it by
construction, verified by the §13.4 geometry test.

**Arrival semantics vs the undo cursor (r2, the audit's defect 2 — guaranteed
to fire in Phase A).** GENERATE is async; RETURN appends. The rule: **a
returning generation ALWAYS lands as a NEW layer appended as a new edit at
the CURRENT undo cursor — never inserted at its dispatch point, never
mutating or resurrecting history.** A generation result is self-contained
(pixels + provenance); it does not need its dispatch-time document state to
land. Explicitly:

- **In-flight state is not document state.** The marquee's in-flight chrome
  (progress, partial previews, Cancel, the pending-takes row) is ephemeral
  tool state anchored to the dispatch-time world geometry; nothing about a
  round-trip is a document command until RETURN, so undo never disturbs it
  and it never disturbs undo. The returning command carries its dispatch
  documentId — it lands in ITS document, wherever the user has navigated.
- **Undo while in flight** (the common case: an unrelated later edit undone):
  the result still lands, after current state. If the user undoes PAST the
  dispatch and makes a new edit (truncating the dispatch-era log), the result
  STILL lands — its provenance keeps the dispatch-time refs and the takes
  chrome marks it "returned into a diverged document." Cancel is available
  until the moment of return; nothing is silently dropped and no cancel is
  forced.
- **Redo (§3.3):** the redo tail lives until the next NEW edit; an async
  arrival IS a new edit and clears it, like any other.
- The history panel's time-travel is cursor movement; only a NEW edit
  truncates (§3.2/§3.3) — an arrival truncates exactly as any new edit
  would, no more.

### 5.3 The derived-mask single-op model (the crown jewel)

One operation — **generate-into-region** — and outpaint, inpaint, edit, and fresh
generation are distinguished ONLY by what the canvas-derived mask computes
[openOutpaint gold #2, oO-core §2.2]. No mode switch, no separate dialogs:

- **Blank check** (alpha scan of the consolidated region): blank ⇒ pure generation
  (the txt2img-shaped lanes). Painted ⇒ edit. Blank is defined: every pixel
  α < 8/255 — a named constant, so compositing specks below it don't flip the
  lane (exercised in the §13.4 algebra tests).
- **Mask algebra** (white = regenerate, black = keep): start black →
  `destination-in` the visible content (the content silhouette) → **dilation**
  (the overmask — the seam-control knob, kept as a user dial; upstream's own
  comment concedes it may be placebo and users still love it [oO-core §2.2];
  named at r2 for what [blend-survey §4.1] proves it is: the
  **grow-at-generation** parameter, shipped with the request at the submit
  seam [§5.2 step 4] while the blend-back composites at the original, ungrown
  mask) →
  brushed additions punch the regenerate set (the in-app mask painter's strokes are
  this input — the v1 inpaint lane's painter becomes a brush over the document
  truth, no longer a one-shot dialog) → white fill completes. Invert mode flips
  keep/regenerate.
- **Outpaint = the reticle placed beside existing content** (Invoke's framing
  [prior-art §1.4]) — the blank-check edge of the mask does the work; no separate
  outpaint mode exists.
- **Family capability complement (D5):** where the family declares it cannot
  consume a mask natively, the client-side fallbacks ARE the capability's
  complement [oO-core §6]: the **pre-fill/restore composite pair** already shipped
  in the v1 inpaint lane (masked source in the alpha channel, graph-side prefill +
  restore composites — `src/images/submit.ts`'s masked-source machinery),
  keepUnmasked-class blur-paste on return [oO-core §2.3], and OpenCV
  Telea/Navier-Stokes inpaint as pre-fill (opencv-js, Apache-2.0 [prior-art §3]).
  **A family that lacks the mask port receives the composite instead** — the
  modularity test applied to model families.

**The marquee-as-region promotion:** any reticle state saves as a named **Region**
(§3.1) — the persistent, addressable context window, re-runnable, carrying its
prompt/family/refs. This is the close of openOutpaint's biggest gap (regions that
own their conditioning [oO-core §5]).

---

## 6. The composite pipeline

The marquee-composite workflow's named pipeline, in order [`8dce5967`]. Each stage
is a document command (provenance-bearing, undoable) unless marked otherwise:

1. **Import** — library / assets / takes / paste / drag-drop → the placement op.
   Ghost-follows-cursor preview; crop-the-ghost write path (§5.2's ghost rule).
2. **Background extraction** — per-image op. v2 scope: threshold/luma-chroma +
   manual eraser touch-up + alpha-edge cleanup. *Deliberately light:* ML matting
   (rembg-class) is a registry/family question for later, not a v2 build item.
3. **Collage** — placement + free transforms (the §3.1 `transform` field;
   transform edits are undoable commands with the pre-change params as
   inverse) + deform-ops-as-parameters (§3.1):
   "take this thing, place it there."
4. **The low-level harmonize denoise** — a whole-reticle pass at low denoise to
   fuse the collage into one image. Implemented as a standard lift round-trip with
   the family's low-denoise recipe: **an op recipe, not new machinery** — the same
   single-op model, one saved region preset ("harmonize").
5. **Marquee passes** — the generation proper (§5).
6. **Blend-back + color match (r2, the audit's defect 8 — rewritten against the
   survey that HAS landed).** The result composites back over the source
   geometry at the ORIGINAL, ungrown mask (the mask-grow ring is cropped —
   §5.2/§5.3). r1 left the algorithm open "to that survey when it lands"; it
   landed (919a790) and **its ranked stack is adopted as the design**
   [blend-survey §4.1]: **grow-at-generation** (the §5.3 dial, applied at the
   submit seam — the eventual seam then sits inside engine-re-rendered
   content; both sides come from the same decode) → **annulus color match**
   (Reinhard-on-ring first, MKL as the dial-up, matched against the
   surrounding ring rather than the whole canvas; kills color drift) →
   **masked multi-band blend** (Laplacian-pyramid blend with a feathered mask
   pyramid, per-band crossover widths pinned; kills the frequency seam) →
   **grain/acutance match** as an optional dial; **SDEdit seam-band
   re-denoise** (re-noise the band at σ≈20–35%, flanks pinned, refs
   attached) as the **opt-in engine-side quality tier** behind the
   refine-always-opt-in doctrine; native latent denoise-mask with feathered
   ramps as the generation-time preventer, gated on the #15981
   grid-artifact check; Poisson DEFERRED (absent from the candidate opencv-js
   build — below). The falsifier-first battery B1–B3 [blend-survey §4.3]
   owns every verdict before any step is load-bearing.
   **The JS-availability truth, corrected:** r1's "histogram/Reinhard-class
   transfer as an app-side op (opencv-js)" was wrong — no maintained JS
   color-transfer package exists (the npm name is a HEX format utility), the
   candidate @techstark opencv-js build hosts no such op and lacks
   `seamlessClone` outright (its own `cvKeys.json`), and Reinhard is ~60
   lines ours-to-own [blend-survey §1.5/§5]. **The classical blend stack is
   in-house — like MLS.**
   **The module consequence** (the survey's §4.2 insight): the blend-back is
   the masked, multi-band generalization of `toneLockBlend`, the tone-lock op
   we already ship (`src/lib/h3imageOps.ts`) — **one frequency-blend module,
   two entries** (`blendGlobal`/`blendMasked`) sharing the band core; extend
   `h3imageOps.ts`, don't add a dependency. The op stays the swappable
   implementation slot §13.6 gates — declared inputs (result raster,
   surrounding consolidated context, the derived mask, the reticle geometry),
   deterministic, pure, vitest-covered, never-worse fallback; a better
   algorithm lands into the slot without pipeline changes.

The stance that governs all six [`8dce5967`]: "we find novel solutions to the
limitations models might present" — seams, color drift, and resolution mismatch are
engineered around at the canvas layer (the client-side complements), never accepted
as model facts.

---

## 7. The family negotiation layer

**The canvas asks; the registry answers.** The workbench consumes capability
declarations; it never interprets a family (the central-model law [`5c93040f`] —
no consumer surface maintains its own interpretation of a shared domain).

**The declaration schema (per family, data in the registry entry):**

| Question | Field | Example (H3-still today) |
|---|---|---|
| Resolution ceiling + grid | `maxDimension`, `gridStep`, `demonstratedCeiling` | 4096/dim, 32-px multiples, 8MP demonstrated [fizgig] |
| Aspect policy | `aspectPolicy` | AR-preserving area-preserving scale-to-grid (Invoke pattern) composing the tier system |
| Mask semantics | `maskMode: native | instruct | composite-pair` + the complement's name | composite-pair (prefill/restore) today; instruct-edit lanes declare `instruct` |
| Ref support | `refSlots` (count, roles, transports) | the v1 reference model's 9 ordered slots [iw-v1] §3 |
| Edit taxonomy | `editFamilies[]` | identity/background/outfit/lighting/pose/freeform [iw-v1] §1 |
| Denoise range | `denoiseRange` | the harmonize pass needs the low end declared |

- **Wired via the registry NOW:** the declarations land as data on the family
  entries (the insert-only `OptimizationEntry` pattern [remediation] A-3). The
  test of the layer (§13.2): **a registry-fixture family with declarations appears
  in the reticle's menus with zero workbench diffs.** Qwen Image arriving
  first-class next [`b90ce8f6`] must be a registry row + declaration block, not a
  workbench patch.
- **Conductor-native LATER:** when the conductor lands [`373fa62e`], FamilyPort's
  implementation redirects to it — the declarations become part of its rich API
  surface. The workbench's consumer code does not change; that is the port's whole
  point.

---

## 8. The v1-lane homes (coverage, not inheritance)

Directive `b90ce8f6`: "we ensure full coverage for the rest of the workbench
features." Every [iw-v1] lane and every lane the built v1 surface gained since (the
H3 image stack's R2I / instruct-edit / inpaint additions) maps to a canvas home.
The prior-art survey started this table (§7 there); this finishes it:

| Lane (source) | v2 canvas home |
|---|---|
| Generate-packet / Generate-T=1 [iw-v1] §1 | reticle generation, two-plane resolution; the packet/T=1 path profiles ride the family declaration + region preset; takes = result layers |
| Compose (≤9 refs, roles, transports) [iw-v1] §3 | **stays the reference-strip surface in v2's first cut** — refs bind to the region through the v1 reference model. **OPEN (§12 Q3):** spatially-placed refs as canvas conditioning objects (no prior art anywhere [prior-art §7]) — a later, deliberate design round if wanted |
| Edit-* families [iw-v1] §1 | region routing: a saved Region binds family + Keep dial + refs; the derived mask + per-family preservation contracts (generated, never hand-written [iw-v1] §5) |
| Refine-Krea2/klein [iw-v1] §8 | an op on a layer (or a re-run of the source region at the refine family); always opt-in, availability-gated, engine pairing surfaced at the affordance — unchanged semantics, new home |
| Candidates / burst [iw-v1] §7 | takes-as-layers (§9) replaces the take strip as the pick surface; the first-party scorer's verdict rides result-layer provenance; burst-fuse = an op across selected sibling layers (never-worse fallback intact) |
| Exit (start-frame) [iw-v1] §9 | unchanged — the FL2VA frame-latent exit, consent-gated |
| R2I refs→still (new, shipped) | reticle with the region's refs bound (FamilyPort refSlots) |
| Instruct-edit (new, shipped) | region + prompt; maskMode `instruct` — the derived mask degenerates to the full reticle, the instruction carries the edit |
| Inpaint w/ pre-fill/restore + mask painter (new, shipped) | the derived mask + composite-pair complement (§5.3); the in-app mask painter becomes the brushed-mask input over document truth |

**The v1 surface's fate:** superseded when parity lands — the mapping above is the
coverage proof; the retirement timing is the maintainer's call (§12 Q4). Nothing
orphaned: at retirement every lane above has a walked home (§13.7).

---

## 9. The assessment-surface fusion — the canvas as judgment room

The maintainer's agreed synthesis names the fusion [`c965023f`]; the prior art
supplies the interaction vocabulary (Invoke's staging area next/prev/commit
[prior-art §1.5]; openOutpaint's candidate browser with favorites/seed-adoption
[oO-core §2.4]; Photoshop's variants-on-generative-layer [prior-art §4]).

- **Takes-as-layers.** Sibling result layers from one source geometry form a
  comparison set — one §5.2 batch dial produces the set in a single gesture
  (r2): solo/mute cycling (the take-strip pattern re-expressed spatially),
  opacity blend between takes, the §5 "crop out, blend, keep what you want" ending.
- **Blind selection mode.** A toggle that anonymizes result layers (generated names,
  provenance chrome hidden) until a pick is made — the honest-comparison gesture;
  the reveal is part of the pick event. Design-light: a layer-chrome mode, not a new
  surface.
- **The RLHF grading seam (the hook, not the surface).** The document emits grading
  events — `pick-made` (incl. blind), `discard`, an explicit grade affordance on a
  result layer — each carrying the layer's full provenance refs (family, params,
  seed, mask derivation). One event schema, one emitter, **local-only store,
  exportable**. Surfaces that consume it (a Control Center view, a trainer feedback
  loop) come later and elsewhere; the workbench's obligation is only that the events
  are complete and stable.

---

## 10. The auto-caption hook (light)

openOutpaint proved the UX (interrogate → prompt → generate, two clicks) and
delivered it as CLIP-through-the-engine [oO-core §2.4/§5]; we generalize it as an
app-owned captioner with no engine dependency:

- **The seam:** CaptionPort → the local llama.cpp server's VLM route (the mtmd
  path; capability discovery via `/v1/models`; vision token budgets per family
  [caption]). App-owned, region-scoped: describe a reticle/region's content on
  demand.
- **The use:** automated outpaint contexts — before an outpaint pass, optionally
  caption the surrounding content to auto-seed the region prompt. The
  [`8dce5967`] pipeline's context builder.
- **The prompt contract (versioned, honest, small):** one template per context
  kind; the first is `outpaint-surroundings` — "describe the style, lighting,
  subject, and composition of the image surrounding this region so a continuation
  can match it; stay within the family's vision-token budget; no preamble."
  Output lands in the region prompt as an
  **editable suggestion, never auto-submitted**; the caption text is stored with
  provenance (model, template id/version) — and the token cap is a NUMBER
  pinned by each template version (from the family's declared vision budget
  [caption]), never a runtime placeholder (r2 nit).

---

## 11. Phasing

The synthesis ordering, reconciled explicitly: **document-model-first is where
DESIGN effort lands (§3 is complete before any build); the marquee round-trip is
the first BUILD (the vertical slice).** The slice runs on a stub of the document
model; the model proper follows immediately and the slice re-mounts onto it. Both
halves of the agreed synthesis hold — neither is sacrificed to the other.

- **Phase A — the marquee round-trip vertical slice. FIRST, ugly, end-to-end, on
  the current substrate.** A minimal raster host — a fixed two-layer DOM-canvas
  stack under the shared camera module, no konva yet, no persistence beyond the
  session — plus the reticle (rectangle + rotation), consolidate → lift → derive →
  submit through the existing shared submit core — **exactly ONE family, wired
  through its FamilyPort declaration from day one** (r2, the audit's defect 3:
  r1's "one family hardcoded" contradicted §2.2's zero-family-names-in-code and
  the §13.2 gate; one family ≠ one hardcoded name) — → return as a new layer at
  exact source geometry → simple paste-back blend. **The de-risk list:** the
  two-plane math, the rotation round-trip (rotation in = rotation out), the
  derived-mask algebra, the family negotiation calls, the blend-back seam, the
  undo-during-flight arrival race (§5.2 — guaranteed to fire here first). Exit
  evidence: a lifted region generates and lands geometry-exact with originals
  byte-identical; the §13.2 registry-fixture test passes (a fixture family
  appears in the reticle with zero workbench diffs); an undo issued while the
  job is in flight lands the result per §5.2's arrival semantics — walked +
  captured.
- **Phase B — the document model proper.** Tables, migrations, command history,
  persistence, versioning (§3); the slice re-mounts onto real documents.
- **Phase C — the raster engine.** The konva module tree, compositor, LOD/culling,
  caches (§4.2); the DOM-canvas host retires.
- **Phase D — tools accrete.** Brush/eraser (perfect-freehand), selection,
  move/transform, stamp/import, shapes/text; background extraction; the color-match
  op; region save/promote.
- **Phase D-last — the deformers** (the additive tail): liquify (stroke-driven
  displacement), mesh/puppet (**MLS in-house, ~300 lines, Schaefer 2006 — nobody
  has shipped it in JS** [prior-art §3/§6]), perspective (homography via opencv-js),
  pinch/bulge (glfx MIT shader lift) — all as deform-ops-as-editable-parameters
  (§3.1); the pixi escalation decision point lives here, on measurement (§4.3).
- **Phase E — the fusion surfaces.** Assessment (solo/mute/blind), the grading
  seam, the auto-caption hook, v1-surface phase-out at parity.

**The scope-gravity guardrail as a phase norm:** every phase review asks — *did this
pull capability that belongs to the wiring canvas, the Control Center, or the
dataset manager into the creation surface?* If yes, the pull is routed back out
through a handoff (export, start-frame, port). The workbench accretes
document-editing depth; it does not accrete the app.

---

## 12. Open questions for the maintainer

The decisions this spec cannot make (everything else is decided above or in the
directives):

1. **Naming.** The module's user-facing name and directory (the three-surface
   doctrine calls CREATION "the workbench"; v1's surface already answers to
   "workbench" — one name should retire at phase-out). Surface-registry entry
   id/label/icon.
2. **The Invoke cut line (ratify D7 — materially sharpened by the audit at
   r2).** r1's binary (selective adoption vs vendored-core at a pinned
   revision, the 53.5k-LOC route [prior-art §1.6/§1.7]) was too coarse. The
   live choice is a three-way line: **selective-for-surfaces** (D7's default —
   skeleton pattern, math, bbox-scaling, staging, adopt-as-code where clean
   and tested) / **vendor-candidate-for-the-skeleton-subtree** — the
   `CanvasManager`/`CanvasModuleBase`/compositor/extents-worker subtree WITH
   its tests ([prior-art §1.6]: vendoring the engine without its tests would
   be malpractice; the `stateApi` indirection makes a partial vendor
   tractable; the RTK-idiom cost is real but concentrated in the store slice)
   / **never the 53.5k-LOC whole** (the rejected pole stands). Ratify where
   on the line — the default remains selective unless the maintainer pulls
   the skeleton subtree forward.
3. **Compose-lane spatial refs.** Do reference images ever become canvas-placeable
   conditioning objects (novel, unbuilt anywhere), or permanently the
   reference-strip? (Recommendation: strip for v2; revisit only with a concrete
   workflow need.)
4. **v1-surface phase-out timing.** At lane parity, or at assessment parity (§9)?
5. **Image-document lifetime.** Top-level documents with own trash/export/archive
   (this spec's shape, §3.2) vs nested under projects — confirm the top-level
   reading.
6. **The RLHF grade store.** Local-only + exportable (this spec's shape) — confirm;
   any opt-in collection teeing beyond local.
7. **Standalone-exit depth.** "Technically separable" (ports + swap table — this
   spec) vs a maintained extractable-product build target. The latter is a
   commitment to make only if/when the module takes off [`b90ce8f6`].
8. **Qwen Image arrival (reworded at r2 — the r1 premise carried defect 3's
   contradiction and is gone).** No longer in question: Phase A's single
   family is wired through its FamilyPort declaration (declarative from day
   one, §11), the §13.2 registry-fixture test is a Phase A exit criterion —
   and Qwen Image arriving first-class [`b90ce8f6`] must be a registry row +
   declaration block, not a workbench patch. Open for the maintainer: scope
   timing only — does Qwen land inside v2's build phases (doubling as the
   second-family proof of the §13.2 gate), or after v1 phase-out?

---

## 13. Acceptance criteria (the build gates)

These gate the BUILDS cut from this spec (the spec round's own gate is: blind audit
findings applied + maintainer blessing). House pattern per [iw-v1] §11 /
[canvas-ui] §10:

1. **Modularity gate:** the module compiles against port interfaces only
   (lint-enforced boundary); the headless harness boots document model + marquee
   math + tools against port mocks (§2.3); the standalone-exit swap table matches
   the actual import graph (automated check).
2. **Central-model gate:** zero family/model interpretation in workbench code; the
   capability matrix is registry data — a registry-fixture family with declarations
   appears in the reticle menus with zero workbench diffs (failing-test-first).
3. **Document gate:** layered documents round-trip save/load/migrate against golden
   fixtures; every command class inverts (undo of a generation removes exactly its
   result layer); unknown-newer schema refuses loudly; camera autosaves; the
   **GC/undo interplay test** (r2, defect 1): after a sweep, undo of a stroke
   and of a layer-delete still resolves every `inverse_ref` blob and every
   generation-provenance ref (the sweeper's mark set is live layers ∪
   log-reachable ∪ tombstoned-until-emptied, §3.2); emptying trash then
   sweeping reclaims them.
4. **Marquee gate:** the lift round-trip is geometry-exact (rotation in = rotation
   out; result footprint = reticle footprint ±0 px, automated); originals
   byte-identical after N round-trips; the derived-mask algebra covers
   blank/content/brushed/outpaint-beside/invert cases (unit tests of the algebra);
   the two-plane ratio display matches the shipped pixels (the ghost rule);
   the **arrival race** holds (r2, defect 2: a return after cursor movement
   lands as a new layer at the current cursor, never mutating history; redo
   cleared by the next new edit); N-batch queues N siblings with
   request-keyed dedupe (defect 6); the grid-snap policy returns content
   mapping exact — isotropic scale only, pad cropped, per-axis ratio display
   matching the padded dims (defect 5).
5. **Rendering gate:** interactive pan/zoom and tool latency at the 8MP tier with
   the layer matrix, measured (the budget-harness discipline); the pixi escalation
   decided on that measurement only. The Phase A DOM-canvas host RETIRES at
   Phase C — a dead-code check (no DOM-canvas-host import remains once Phase C
   lands) makes the retirement a gate, not a promise (r2; the audit's
   SPEC-CHOICE ask).
6. **Pipeline gate:** the §6 stages chain as provenance-bearing commands; the
   blend-back op's implementation slot is swappable ([blend-survey]'s ranked
   stack is its first implementation; a better algorithm still lands into it
   without pipeline changes); the harmonize pass is a region preset, not special
   machinery.
7. **Lane-coverage gate:** every §8 row walked end-to-end on the canvas surface; no
   orphaned v1 capability at phase-out (enumerated proof, the coverage discipline).
8. **Assessment gate:** takes-as-layers solo/mute + blind selection work; grading
   events emit complete provenance; the grade store is local-only + exportable.
9. **House standard:** full gate + e2e + vision + both CI legs on every build;
   licensing lockstep — konva / opencv-js / ml-matrix / transformation-matrix (and
   pixi if escalated) land with `docs/licenses/registry.md` rows in the same commit
   as their adoption. **Nothing is adopted by this spec document itself.**

---

## Blind audit — 2026-09-27

The house method's pre-blessing pass (task 5rmqvk4, directive `c965023f`'s
spec-draft → blind-adversarial-audit → blessing sequence). Method: the spec was
read COLD first, as a skeptical reviewer who has built editors; the cited
sources (the four directives verbatim from epic 4lphxv8, [oO-core], [prior-art],
the blending survey, [iw-v1], [doc-model], [canvas-ui], [ui-systems],
[remediation], [fizzig], [caption], and the file anchors `src/images/submit.ts`
/ `src/canvas/camera.ts` / `src/lib/h3imageOps.ts` / `src/lib/graph/h3image.ts`)
were verified SECOND. Every verbatim directive quote checks out; every checked
number is grounded in its cited source (43 fps / 2000 objects is the measured
L33 floor; 3872×2176 / 50 steps / `er_sde` / ≤4096 step 32 / the 8MP correction
are [fizgig]-verbatim; konva 57 KB gz and "raw Konva, no react-konva at
v6.14.1" are [prior-art §1.2/§3] code-read facts). The defects below are what
did NOT survive. Dispositions: **FIX** = change the text before blessing
(r2 or addendum); **NOTE** = record and proceed.

### CONFIRMED-DEFECT list (ranked by damage-if-shipped)

1. **[FIX] Blob GC vs the command log — the silent-undo hole.** §3.2 says blobs
   are "the shared blob table, content-hashed, no new machinery," but [doc-model
   §3]'s GC is mark-and-sweep over fork edges + canonical/locked takes + un-emptied
   trash — a mark set that knows nothing of image-document layer content,
   command-log `inverse_ref` blobs, or generation provenance. As written, either
   the sweeper reclaims blobs the history needs (undo of a stroke/layer-delete
   silently breaks — exactly the silent-data-loss class the house bans) or "no
   new machinery" is false. r2 must define blob liveness = live layers ∪
   command-log-reachable inverses ∪ tombstoned-documents-until-trash-emptied,
   and §13.3 gains a GC/undo interplay test.
   **r2 disposition:** applied — §3.2's blob bullet now states the machinery
   addition r1 denied (the sweep gains an image-document mark pass; liveness
   = live layers ∪ command-log-reachable payloads/inverses/provenance,
   redo tail included, ∪ tombstoned-until-trash-emptied) and §13.3 gates the
   GC/undo interplay test.
2. **[FIX] Async generation return vs the undo cursor.** §5.2's GENERATE is
   async through EnginePort; RETURN appends a command. If the user undoes or
   edits while a job is in flight, the returning command meets a moved cursor —
   with §3.2's "truncation at undo-cursor" semantics the result either clobbers
   divergent history or lands orphaned. Redo is also unspecified (truncation-at-
   undo reads as destructive undo; "clicks any entry to time-travel" is
   consistent with either). This race is guaranteed to fire in Phase A. r2 must
   define arrival semantics (append-at-end with cursor guard, or cancel-on-
   undo-past-dispatch) and redo retention (standard: redo lives until the next
   NEW edit).
   **r2 disposition:** applied — §5.2 "Arrival semantics vs the undo cursor"
   (append-as-new-edit at the current cursor, never insert/mutate/resurrect;
   in-flight chrome is ephemeral tool state that survives undo; cancel until
   return; diverged-document marking; dispatch documentId carried) + §3.3's
   redo mechanics (redo lives until the next NEW edit; an arrival clears it)
   + §13.4's race test + Phase A de-risk/exit evidence. The audit's first
   option (append-at-end with cursor guard) is the chosen semantics.
3. **[FIX] Phase A contradicts its own exit criterion.** §11 Phase A: "one
   family hardcoded"; §12 Q8: "the registry-fixture test is a Phase A exit
   criterion"; §2.2: the negotiation consumer "contains zero family names in
   code." An implementer following §11 verbatim welds a family name in and fails
   gate §13.2. The readable intent — one family, wired THROUGH the FamilyPort
   declaration — must be the written text.
   **r2 disposition:** applied — §11 Phase A now reads "exactly ONE family,
   wired through its FamilyPort declaration from day one"; the §13.2
   registry-fixture test is Phase A exit evidence; Q8 is reworded off the
   dead premise.
4. **[FIX] The Layer schema has no transform/placement, but §5.2/§6/Phase D all
   require one.** §3.1's Layer entity and §3.2's `image_layer` table carry no
   transform; yet RETURN places a result at rotated source geometry, §6 stage 3
   has free transforms as placement ops, and Phase D ships move/transform tools.
   Either transforms are layer state (schema gap) or they bake into pixels on
   apply (then every non-90° rotation double-resamples the generated content —
   a fidelity loss the two-plane display does not show — and baked move/scale
   contradicts the D8 deform-ops-as-parameters philosophy). r2 must add the
   transform to the entity/table and state the resample budget: lift samples
   once, the layer transform applies at composite, rotation-in = rotation-out
   with ONE effective resample.
   **r2 disposition:** applied — §3.1 Layer gains `transform` (2D affine,
   identity default) + the transform-as-data paragraph (one effective
   resample; composite-time application; bake only on explicit flatten);
   §3.2's `image_layer` carries the column; §5.2 RETURN and §6 stage 3
   consume it.
5. **[FIX] "Nothing silently rescales" vs grid-snap AR drift.** §5.1 composes
   the family grid (32-px multiples per axis) with area-preserving
   scale-to-optimal; per-axis snapping perturbs AR (bounded, but real), so the
   returned raster's AR ≠ the reticle's world AR and returning it to the exact
   footprint requires a small anisotropic stretch — which IS a silent rescale,
   and which the scalar orange/blue ratio display cannot express. Footprint
   exactness (±0 px) survives; content-mapping exactness does not, undefined.
   r2 must pick the policy (snap-within-tolerance + display the per-axis
   effective ratio; or AR-preserving pad-into-grid with the pad masked).
   **r2 disposition:** applied — §5.1 picks AR-preserving pad-into-grid,
   sharpened: the WORLD rect grows to the padded raster's aspect so lift and
   return are pure isotropic scales (no anisotropic stretch exists at all);
   pad cropped at return; the ratio display reads per-axis; §13.4 gates it.
6. **[FIX] "10 generations in a single area" has no mechanism, and same-area
   dedupe blocks the naive path.** The directive's headline semantics
   [`f75885c8`] and §3.1/§9's takes-as-layers presume N siblings from one area;
   §5.2 imports upstream's "re-clicking a pending area is ignored" and defers
   generate-ahead "later." Upstream produced multiples via the candidate
   browser's `+` — this spec has no batch/N-times affordance anywhere. r2 must
   define it (an N dial queueing N round-trips as N pending siblings; dedupe
   keys on the unique request, not the area).
   **r2 disposition:** applied — §5.2's batch dial N (N independent jobs,
   N sibling layers, one takes set, per-arrival commands), dedupe re-keyed
   on family + recipe + geometry + batch slot, takes grouping in the
   in-world browser (§9), §13.4 gates it.
7. **[NOTE→one sentence] The Compose lane's home is ambiguous and the v1
   reference model is unported.** §8's "stays the reference-strip surface in
   v2's first cut — refs bind to the region through the v1 reference model"
   reads as either a strip panel INSIDE the workbench (fine) or the v1 app
   surface (which §8 itself schedules for phase-out — gate §13.7 then never
   closes for Compose). The reference-binding schema is neither one of the five
   ports nor listed inside (§2.2), and the standalone-exit table has no row for
   it. Fix at r2: the strip is a workbench panel; the binding schema rides the
   Region entity; FamilyPort declares refSlots.
   **r2 acknowledgment (NOTE — recorded, proceeding):** the disposition
   recorded here is the reading the build takes (the strip is a workbench
   panel; the binding schema rides the Region entity; FamilyPort declares
   refSlots); it enters the body with the Compose-lane build round (§12 Q3),
   not as an r2 edit — gate §13.7 closes against that reading.
8. **[FIX] §6 is stale against the landed blending survey, and one attribution
   is wrong.** §6 leaves the algorithm "to that survey when it lands" — it
   landed (commit 919a790, after this spec's 7151a66). Worse, "color match =
   histogram/Reinhard-class transfer as an app-side op (opencv-js)" is
   contradicted by the survey's §1.5/§5: no maintained JS color-transfer exists
   (the npm name is a HEX format utility); Reinhard is ~60 lines ours-to-own;
   the candidate opencv-js build hosts no such op (and lacks `seamlessClone`
   outright). The survey also supplies a mechanic §5.3/§7 lack:
   grow-at-generation is a SUBMIT-seam parameter (mask-grow on the lane graphs)
   with blend-back at the original mask. r2 must ingest: point §6 at the ranked
   stack (grow-at-generation → annulus color match → masked multi-band → grain
   match; SDEdit band as the opt-in engine tier), correct the opencv-js
   attribution, and add the mask-grow parameter to the round-trip spec.
   **r2 disposition:** applied — §6 stage 6 rewritten onto the ranked stack
   (grow-at-generation → annulus color match → masked multi-band → grain
   dial; SDEdit band as the opt-in engine tier; latent-ramp preventer gated
   on #15981; Poisson deferred); the opencv-js color-match attribution
   corrected (no maintained JS color-transfer; the candidate build lacks
   `seamlessClone` — the stack is in-house); the `toneLockBlend`
   generalization named (one frequency-blend module, two entries); the
   mask-grow submit-seam parameter added to §5.2/§5.3.
9. **[NOTE→policy line] No concurrency policy for server-hosted documents.**
   The store is a server store; two tabs on one image document is one
   middle-click away, and the command log is ordinal-append — WAL serializes
   writes but two editors interleave ordinals and diverge silently (camera json
   is last-writer-wins). r2 needs one policy line (per-document session lock or
   last-writer-wins + reload prompt) and a §13.3 check — or an explicit open
   question if the maintainer wants to choose.
   **r2 acknowledgment (NOTE — recorded, proceeding):** the policy line is
   deliberately NOT set by this pass; it lands with the Phase B store seam
   (per-document session lock vs last-writer-wins + reload prompt) with its
   §13.3 check — or becomes Q9 now if the maintainer prefers to choose at
   blessing time.
10. **[FIX] The f75885c8 reference anchor is dropped.** The directive names the
    Krita-AI-Diffusion workflow FEEL as the UX north star ("A lot like how the
    workflow feels inside of Krita when using Acly's Krita Diffusion plugin")
    and says its interaction-model study "now also feeds the design round."
    This spec never mentions it, and no such interaction-model capture exists
    in the repo (only the transport study, node-pack-registry §4.3). Fidelity
    gap, not a contradiction: r2 adds it to §5.1's inputs and queues the
    capture before the reticle UX hardens.
    **r2 disposition:** applied — §5.1 opens with the feel reference
    (verbatim from `f75885c8`) and the interaction-model capture is queued
    as Flux bg0815k, gated before Phase C entry (the reticle-UX hardening
    point).
11. **[NOTE] The 8MP perf analysis covers the renderer, not the pipeline ops.**
    §4.3 analyzes live deformer preview only; consolidate (full-stack composite
    through deform evaluation), lift (rotation resample), mask derivation (alpha
    scan + dilation morphology), and blend-back (the survey's multi-band,
    ~5–15 ms/MP class) are all 8MP-tier CPU costs unaddressed, and "CPU
    compositing of a handful of layers is fine" is asserted without the
    damage-region caveat. Extend §13.5 with pipeline-op budgets, measured at
    Phase A per the budget-harness discipline.
    **r2 acknowledgment (NOTE — recorded, proceeding):** rides the build
    gates — §13.5's measured-budget discipline extends to the pipeline ops
    (consolidate, the lift resample, mask morphology, blend-back at the
    ~5–15 ms/MP class [blend-survey §4.1]) at Phase A, per the harness
    discipline; no r2 body edit.
12. **[NOTE] §13.9 lists ml-matrix and transformation-matrix, which the body
    never places.** The gate forward-references [prior-art §3]'s candidate
    floor; the body should say where they land (marquee two-plane math →
    transformation-matrix; MLS/homography solves → ml-matrix) or drop them.
    **r2 acknowledgment (NOTE — recorded, proceeding):** the placement the
    gate assumes (marquee two-plane math → transformation-matrix;
    MLS/homography solves → ml-matrix [prior-art §3]) enters the body when
    the §5.1/Phase D math is cut from them — or the gate drops the names;
    no r2 body edit.

### SPEC-CHOICE calls that survive audit (risk recorded, not counted)

- **Phase A on a DOM-canvas stack while §4.2 rejects DOM substrates** —
  deliberate and labeled temporary; the known risk is the slice-that-never-dies,
  mitigated only if Phase C's "the DOM-canvas host retires" is enforced as a
  gate. Make retirement explicit in §13.
  **r2:** made explicit — §13.5 now carries the dead-code retirement check.
- **D7's narrow default vs both the directive and the survey's lean.**
  `b90ce8f6` says "take a lot of their tooling, canvas infrastructure";
  [prior-art §0.B]'s "realistic mode" is vendor-the-core + own-the-surfaces.
  D7 chooses selective-with-tests and frames vendor-core as the rejected pole —
  honest (Q2 ratifies it), but the audit stresses what Q2 asks: the answer is
  selective-for-surfaces, vendor-candidate-for-the-skeleton-subtree
  (`CanvasManager`/`CanvasModuleBase`/compositor/worker WITH their tests, per
  §1.6's "vendoring the engine without its tests would be malpractice"), never
  the 53.5k-LOC whole. The `stateApi` indirection makes a partial vendor
  tractable; the RTK-idiom cost is real but concentrated in the store slice.
  **r2:** Q2 rewritten onto exactly this three-way line (§12).
- **EnginePort honestly ComfyUI-shaped** — recorded, not hidden; the swap-table
  "one adapter" is optimistic for a non-ComfyUI engine but the shape is
  declared. Unchanged color-management posture is NOT recorded though: the spec
  is silent on sRGB-only vs ICC; add the one-line sRGB assumption at r2.
  **r2:** the sRGB posture line added at §3.2 (sRGB-only end-to-end, a
  recorded assumption).

### The verdicts elsewhere

- **The mask-authority split is clean** (D5/§5.3/§7): complements route through
  FamilyPort declarations; the one leak was Phase A's hardcode (defect 3).
- **The standalone-exit table is honest** — the harness gate (§2.3/§13.1) and
  the swap-table-vs-import-graph automated check are real proofs; the one gap is
  the reference-model row (defect 7).
- **The eight open questions all survive** — none is answered wrongly or
  orphaned by audit. Q8 needs REWORDING (its premise contains defect 3's
  contradiction); Q2's answer is materially informed by the D7 note above;
  recommend a Q9 only if the maintainer prefers choosing the concurrency policy
  (defect 9) over the spec setting it. **r2:** Q8 reworded and Q2 materially
  updated (§12); Q9 left un-created — the concurrency policy rides Phase B
  unless the maintainer pulls it forward at blessing.
- Minor text nits for r2: "53k-LOC" (D2) vs "53.5k-LOC" (D7/Q2); the §10
  template's "≤ N tokens" placeholder; §5.3's blank-check alpha threshold; the
  "same area" dedupe key; §3.1's "background state" field is vague.
  **r2:** all five fixed inline (D2 unified to 53.5k-LOC; the §10 cap pinned
  per template version; §5.3's threshold named at 8/255; the dedupe key
  defined in §5.2; §3.1's background field specified).

*Audit posted in full as the Flux comment on task 5rmqvk4 (epic 4lphxv8);
findings land here as this dated addendum per the house protocol — never silent
rewrites. The r2 pass applies the FIX items; the NOTE items may ride the build
gates.*

**r2 fix pass record (2026-09-27, task wzm5vv8):** all eight FIX dispositions
applied to the body (per-item r2 notes above); Q8 reworded and Q2 materially
updated in §12; the four NOTE dispositions stand as acknowledged here, with no
body change beyond the SPEC-CHOICE one-liners the audit itself assigned to r2
(§3.2's sRGB posture line; §13.5's DOM-host retirement check) and the five
minor nits. The spec stands as DRAFT r2, awaiting the maintainer's blessing.
