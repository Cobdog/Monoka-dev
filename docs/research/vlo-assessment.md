# Vlo — the ComfyUI-native AI video editor assessed (mechanism + H3 techniques + fit)

> No Flux task (assessment-only pass; the maintainer's ask, 2026-09-28: *"tell me
> what you think of this"* — <https://github.com/PxTicks/vlo>). Date: **2026-09-28**.
>
> **METHOD:** full code read of a shallow clone at pinned HEAD
> `fc4d241de6348ca0c09faa04af287e9602a939be` (2026-09-28, *"update README for vlo
> 0.3.0"* — v0.3.0 announced the same day, so the fresh-release doctrine applies:
> community metrics omitted as noise; mechanism, code, and honest claims only).
> Read in full: README, the 1,326-line `HOW_TO_WRITE_WORKFLOW_RULES.md`,
> `services/gen_pipeline/README.md`, the sidecars + howtos of all **seven MiniMax-H3
> workflows** (incl. the `vlo_minimax_h3_i2v.rules.json` in full), node-class
> inventories extracted from all seven H3 graph JSONs, `services/comfyui/
> local_runtime.py` + `comfyui_proxy.py` + `comfyui_compat.py` +
> `frontend_settings.py`, `services/model_registry.py`, the `model_work` coordinator
> surface, `AGENTS.md`, both CI workflows, `pyproject.toml`, the extension-surface
> CI gate + `extensions/extension-development/SKILL.md`, `bridge-core.mjs` head.
> Web: `PxTicks/ComfyUI-vlo` README. **Nothing measured — no GPU, no engine, no
> installs, nothing downloaded.** Our side read for fit:
> [licenses/policy.md](../licenses/policy.md), `src/lib/workflow.ts` (our frame-grid
> authority), `src/lib/engineSemantics.ts`. Evidence tags: **[DOC]** verified in
> shipped code / official source, **[SPEC]** plausible-unverified, **[UNK]** nobody
> knows.

---

## 1. WHAT VLO IS

**Vlo is a free, local-first, open-source (AGPL-3.0-or-later) nonlinear video editor
with AI generation built in as a timeline operation, using ComfyUI as its generation
engine.** Browser-hosted (Chromium-only — File System Access API for on-disk projects
+ WebCodecs via mediabunny for frame-accurate media), React 19 / PixiJS 8 frontend
served by a FastAPI backend; the backend also hosts its own non-ComfyUI models
(SAM2 rotoscoping, stem separation). ~388k LOC TypeScript + ~69k LOC Python
(incl. tests), 2,342 files. [DOC]

The problem it actually solves: **making "any ComfyUI workflow" usable as an editor
operation** — timeline selections, masks, and assets flow *into* arbitrary workflow
graphs, and generated media flows *back* onto the timeline — without the user ever
editing a node graph. It ships 18 packaged workflows (plus a high-VRAM variant set)
with working sidecars: **seven MiniMax-H3 workflows** (i2v/Base, r2v/reference,
ttm/time-to-move, inpaint, inpaint-flf2va, fun-controlnet-union, masked-guide),
LTX-2.5 (incl. ic-edit, clean-plate), Krea-2 turbo, Qwen-Image-2.1-edit, SeedVR2,
GIMM-VFI, FLUX.2-klein-multi. [DOC]

Maturity signals — unusually strong for a day-old 0.3.0: **684 frontend test files
(vitest + Playwright, incl. media-parity and export-throughput measure suites) + 71
backend pytest modules**, seven of them H3-workflow-specific; CI on every push/PR
(lint, unit, plus a **git-attribute-classified "extension contract impact" catalogue**
gating SDK-surface changes) and a Playwright lane (smoke on PRs, full nightly); an
honest README that states limitations flatly (Chromium-only and *why*; WSL
"only partly supported"; masked-guide nodes "experimental… tied to the ComfyUI
version it was forked from"); and install engineering that handles real traps
(Windows CPU-torch wheels, pip `--progress-bar raw` version gating, launch flags
dropped when the checkout's argparse doesn't advertise them). One doc-rot instance:
the README links `docs/todos/known_issues.md`, which does not exist in the tree.
[DOC]

## 2. HOW IT WORKS — the load-bearing decisions

### 2a. The sidecar rules system (the centerpiece)

Each workflow JSON gets a `<stem>.rules.json` **declarative overlay** (V3) that
controls how the graph is presented and transformed — the graph itself is never
hand-edited for the editor [DOC — `HOW_TO_WRITE_WORKFLOW_RULES.md`, read in full]:

- **Widget autodiscovery from `object_info.json`**, with three authoring regimes
  (fully automatic / selective overlay / expose-then-subtract) and cross-node
  grouping (`group_id`/`group_order` bands) so controls from many nodes render as
  one coherent panel.
- A shared **`ConditionExpression` tree** (`input_presence`, `compare` against
  `workflow_param` / `pipeline_control` / `frontend_control` / `derived_widget`,
  `all_of`/`any_of`/`not`) driving widget visibility, conditional defaults, and
  submission-time **graph rewrites** (cascading node `ignore`, ComfyUI `bypass`
  lists, `set_widgets`).
- **Pipeline stages** — `mask_processing` (auto crop-to-mask-bbox with dilation, or
  full-frame), `aspect_ratio` (stride-quantized resolution search over a ladder,
  then a `stretch_exact` postprocess *moved into the graph* so ComfyUI emits the
  requested size directly and the browser never re-encodes), `output_assembly`
  (stitch frames+audio backend-side). Fulfillment is explicitly **fail-closed**: a
  partially-applied postprocess hands everything back to the frontend with a
  warning, because un-stretched outputs would silently ship at the strided size.
- **Typed envelopes** between frontend and backend (`pipeline_inputs` /
  `pipeline_outputs` per stage), and a **`GenerationPlan` snapshot split from
  prepare** so queued batches re-resolve `"randomize"` seeds per dequeue rather
  than sharing one realized seed. [DOC]

The rules system is powerful and honestly documented as complex — the guide's own
"four distinct kinds of hiding" table and the warning that widget-visibility
conditions can't see frontend-control state are bug-surface admissions. Sidecars
key everything by **raw ComfyUI node ids** ("774", "141"), which is brittle to
re-imported/re-arranged graphs. There is a companion "custom GPT" for generating
rules files — a complexity signal in itself. [DOC]

### 2b. The H3 node set — where the real H3 craft lives

The default H3 graphs run `SamplerCustomAdvanced` + `SpectrumApplyMiniMaxH3`
(toggleable "MiniMax Spectrum" patch) + LoRA slots (`LoraLoaderModelOnly`, bypassed
by default), fed by a bespoke GPL-3.0 node pack (`PxTicks/ComfyUI-vlo`) [DOC]:

- **Memory loaders** (`vloMemoryLoadVideo/Image/Audio` + batch variants): media
  handed to ComfyUI **by in-memory registry id — no throwaway files written into
  `ComfyUI/input`**; a `disable_in_memory` toggle falls back to disk. The batch
  loaders output true ordered lists, and `vloMiniMaxH3ReferenceToVideoBatch` wraps
  the native H3 reference-conditioning node, converting reference video to 24 fps
  and expanding into a real native node so ComfyUI's caching lifecycle applies.
- **Audio-latent masking for H3 inpainting** (`vloSetAudioLatentBinaryMasks`,
  `vloFeatherAudioLatentMask`, used with `LTXVConcatAVLatent`,
  `vloLatentCompositeMasked`): H3's joint audio-video latents get **binary temporal
  noise masks (~25 ms/step for H3, 40 ms for LTX) and genuine per-step denoise
  feathering** (`outer`/`centered`/`inner`) at the regenerated region's seams —
  audio-aware inpainting, not video-only.
- **`vloTimeToMove` (TTM, "dual-clock denoising")** — the standout creative
  pattern: animate a crudely cut-out object along a draggable editor motion path,
  then let H3 re-render the composite with two step controls — a *lock-in step*
  (how much noise seeds the whole animation, foreground + background) and a
  *release step* (when the moving object stops being held to the authored path).
  Generation as a timeline effect; the howto even documents the failure mode
  ("if the object looks pasted on, try an earlier lock-in or release step").
- **Masked guides** (`vloMiniMaxH3AddMaskedGuidesFromVideo` / `PatchMaskedGuides`):
  a **fork of ComfyUI's H3 forward pass**, self-declared experimental and
  version-tied — the most fragile piece of the stack. Plus
  `MiniMaxH3FunControlNetApply` (fun-control-union inpainting) and
  H3 frame-grid knowledge baked into the sidecars: **length slider min 22, max 719,
  step 17, default 124** — the visible-frame grid 17k+5 (5, 22, 39 … 124 … 719),
  with the timeline frame-picker snapping selections to `frame_step * n +
  frame_offset` so users cannot request an invalid frame count. [DOC]

### 2c. Managed engine lifecycle + GPU admission (their "conductor")

`local_runtime.py` discovers/verifies ComfyUI checkouts by **source markers**
(argparse import, PromptServer, execution engine — not just `main.py` presence),
creates a dedicated venv, repairs CPU-torch on Windows from the CUDA index, clones
a pinned custom-node set, launches with `--enable-manager
--preview-method latent2rgb` — **each flag only if the checkout's parser advertises
it** — and seeds ComfyUI frontend settings (VHS latent preview) atomically, never
overwriting user-chosen keys. A separate `model_work` coordinator
(`leases`/`ledger`/`vram`/`locality`/`comfyui_admission`) multiplexes GPU occupancy
between vlo's own models (SAM2, sam-audio) and ComfyUI prompts, with a proxy header
distinguishing "definitely not delivered" from "unknown" 502s for admission
decisions, and persisted occupancy restored on restart. The model registry
enforces an **allow-list download policy** (HF/Civitai/localhost +
safetensors-family suffixes) because "workflow graphs are untrusted input". [DOC]

### 2d. Live bridge into ComfyUI's own frontend

ComfyUI's UI runs in an iframe under `/comfyui-frame/`, with the backend proxying
HTTP+WS and injecting `vlo-bridge.js` into ComfyUI's index.html. The bridge (v4)
negotiates capabilities (read-active, inject-workflow, resolve-prompt, drop-asset,
client-id…), and — the clever bit — tags the workflow with a **nonce and then
verifies `graphToPrompt` serialized *that* graph**, because "some frontend
extensions monkey-patch graphToPrompt; a wrapper that drops its arguments otherwise
falls back to `app.rootGraph` and returns a valid-looking prompt for the wrong
graph." That is a defensive pattern worth remembering wherever a host drives
ComfyUI's frontend programmatically. [DOC]

### 2e. Frame-graph renderer parity

Live preview and export share one render plan (`framePlanning/`:
`BatchFrameGraphExecutor`, `FrameResolutionGraph`, `LiveFrameGraphCoordinator`,
composite bake policy `automatic | force-live | force-baked`), with e2e suites
named `export-parity`, `composite-parity`, `glitch-consistency`. Monoka's
preview/export parity doctrine, independently arrived at and e2e-tested, in a
browser NLE. [DOC]

## 3. FIT FOR US — the verdict menu

**CONFIRM (strongest signal yet on posture).** Vlo is an AGPL, local-first,
ComfyUI-native, registry-gated, agent-conventioned (its `AGENTS.md` is a style +
contract guide; extensions get a `SKILL.md`) AI video workshop that treats
generation as an editing operation. That is Monoka's shape at production scale,
built by someone else, shipped the same week. Independently reinforces: local-first
files, engine-at-arm's-length, registry-gated model fetches (their untrusted-graph
allow-list is stricter than most), preview/export parity, and the modularity
contract — their extension surface is *CI-gated by classification*
(exact-API-consumer / shared-host-seam / conformance-only), the most engineered
take on "pulling a tool out must be easy" we have read. [DOC]

**CONFIRM (technical fact).** Their sidecars encode the H3 visible-frame grid as
**17k+5, min 5, max 719** — the same arithmetic our one grid authority
(`h3AlignFrameCount`, `src/lib/workflow.ts`) implements. Independent third-party
production use of the grid, including the picker-snapping UX we lack. [DOC]

**ADOPT (patterns and techniques — at arm's length; see §4 for why not code):**

1. **The memory-load feeding pattern** — media by registry id, zero throwaway
   writes into `ComfyUI/input`. Where our conductor feeds assets to the engine,
   this is the clean seam; we can implement our own registry nodes (the *pattern*
   is not copyrightable; their GPL pack is also installable into the user's engine
   under our fetch-consent shape if we ever want theirs).
2. **Audio-latent masking + feathering for H3 inpainting** (~25 ms/step temporal
   masks; per-step denoise ramps at seams; `original_audio_latent` for centered
   ramps). We hold no equivalent technique for H3's audio latents; either
   fetch-consent their pack's nodes into the user's ComfyUI for our inpaint family,
   or port the *technique* into our own graph. Concrete, novel-to-us H3 craft.
3. **TTM "dual-clock denoising" as a workbench tool idea** — crude authored motion
   (path/keyframes) → H3 re-render with lock-in/release steps. This is a
   generation-as-effect primitive that would slot naturally into the blessed video
   workbench's tool surface; the two-knob exposure (vs raw sampler plumbing) is
   the UX lesson.
4. **The sidecar seam as reference for the properties-panel REFACTOR** — the
   separation of *graph* (machine) from *presentation overlay* (declarative,
   conditional, grouped) is exactly the seam our remediation plan's properties
   panel wants. We do not need arbitrary-workflow interop (our families build
   typed graphs in TS), so we should not adopt the machinery — but the
   fail-closed fulfillment reporting and the snapshot-vs-prepare (per-dequeue
   seed re-resolution) patterns apply to our generation queue directly.
5. **The `graphToPrompt` nonce verification** — if anything of ours ever drives
   ComfyUI's frontend programmatically, steal this defense verbatim (as a pattern).

**CORRECT (assumption check).** If we have been treating H3 inpainting as
video-latent-only (audio regenerated wholesale or untouched), the audio-latent
mask technique corrects that: H3's AV latents can be *selectively* re-denoised in
time, with feathered seams. Our library captures (`comfyui-minimax-h3-native.md`,
`comfyui-minimax-h3-overview.md`) should gain this fact — vlo is now the second
implementation of H3 audio-latent surgery we have on file, after none.

**Where it slots / where it does not.** *Slots:* the H3 video program (techniques
2–3; facts into the library captures), the properties-panel refactor (pattern 4),
the conductor's VRAM-admission vocabulary (§2c — leases/ledger/locality is good
naming for problems our contention guard solves), and — optionally — a
fetch-consent row for `PxTicks/ComfyUI-vlo` in the node-pack registry if we adopt
its H3 nodes. *Does not slot:* vlo itself is a sibling *product* (a timeline NLE),
not a family entry, workbench tool, or library — you do not embed one workshop in
another; and its live ComfyUI-frontend bridge solves a problem (embedding
ComfyUI's UI) our three-surface architecture deliberately does not have. Nothing
for the drift-envelope research (no measurement machinery of that kind). The NLE
timeline itself is vlo's moat and not our mission — our overlap is the generation
seam, not the editor.

## 4. LICENSE + HEALTH

- **Main repo: AGPL-3.0-or-later** + an Individual CLA for contributions; **node
  pack `ComfyUI-vlo`: GPL-3.0**; `bridge-core.mjs` ships with typed declarations
  inside the AGPL tree. Against our policy table: **never vendored into this
  repo** (third-party copyleft couples our releases to a contributor set we do
  not control — the engineering bar, not the law). Sanctioned shapes both apply:
  (a) fetch-consent — the node pack installed into the *user's* ComfyUI engine;
  (b) runtime-separate-process — vlo the app running beside us, which is moot
  since we would not integrate it. Patterns/techniques above are
  reimplementations, not ports. [DOC — LICENSE read; policy cross-checked]
- **Dependencies:** clean and boring — FastAPI/uvicorn/httpx/pydantic + torch/av/
  `beat-this` backend; React 19/Pixi 8/mediabunny/zustand/MUI frontend;
  Playwright/vitest test stack. Nothing exotic, nothing we would flag. [DOC]
- **Maintenance posture:** single-maintainer project (first-person README,
  CLA-INDIVIDUAL, one contributor) carrying an enormous scope — a frame-accurate
  browser NLE, a managed-engine lifecycle, a GPU coordinator, a workflow-rules
  DSL, and an extension SDK, ~457k LOC total. Bus factor 1; v0.4.0 plans (graph
  data model, node-based shader color page, per-clip workspace) are ambitious.
  CI green-gating is designed but unverifiable from a day-old release; treat the
  harness, not the badge, as the signal. [DOC + SPEC]

## 5. VERDICT

**CONFIRM (posture and facts) + selective ADOPT (four techniques at arm's length)
— the closest architectural sibling assessed to date, and a source of concrete H3
craft we do not have; not an integration target.** Vlo independently validates
Monoka's entire stance — local-first, AGPL, ComfyUI-native, registry-gated,
parity-tested, agent-conventioned — while contributing three things worth taking:
audio-latent masking/feathering for H3 inpainting, the TTM dual-clock
generation-as-effect pattern, and the memory-load feeding seam; plus one fact
corroboration (the 17k+5 grid) our ledger can cite. Its code stays out of our
tree per the license policy; its techniques are ours to reimplement.

## Sources (retrieved 2026-09-28)

- `PxTicks/vlo` @ `fc4d241de6348ca0c09faa04af287e9602a939be` (shallow clone,
  full read per METHOD): README · `backend/assets/workflows/HOW_TO_WRITE_WORKFLOW_RULES.md`
  · `backend/assets/.config/default_workflows/vlo_minimax_h3_*` (7 workflows +
  sidecars + howtos) · `backend/services/{comfyui,gen_pipeline,workflow_rules,model_work,model_registry.py}`
  · `backend/assets/comfyui_bridge/` · `AGENTS.md` · `.github/workflows/{ci,playwright}.yml`
  · `backend/pyproject.toml` · `extensions/extension-development/SKILL.md` ·
  `scripts/check-extension-surface.mjs`.
- `PxTicks/ComfyUI-vlo` README (web).
- In-repo: [licenses/policy.md](../licenses/policy.md) · `src/lib/workflow.ts` ·
  `src/lib/engineSemantics.ts` · house-format precedents
  ([viggle-assessment.md](viggle-assessment.md), [hyperflow-assessment.md](hyperflow-assessment.md)).
