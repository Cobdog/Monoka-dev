# Scumble — the ComfyUI-native AI inpainting editor assessed (the missing Poisson, an agent-consent engine, and independent confirmation of the workbench substrate)

> No Flux task (assessment-only pass; the maintainer's ask, 2026-09-28: *"another
> one for you"* — <https://github.com/DenRakEiw/scumble>). Date: **2026-09-28**.
>
> **METHOD:** code read of a shallow clone at pinned HEAD
> `76fbae1d5c9dd6a4988883c340ff11e4a8a12943` (2026-09-28, *"CLAUDE.md: 0.1.32
> released, the dev blog post live"* — 0.1.32 published the same day, so the
> fresh-release doctrine applies: community metrics omitted as noise; mechanism,
> code, and honest claims only). Read: README, `CLAUDE.md` (full — the dev
> hand-over file), `docs/BRIEF.md` (full), `docs/ASSISTANT.md` (full),
> `docs/MCP.md` (full), `docs/RECIPES.md` (head: the two recipe kinds, the slot
> map, the import paths), `docs/PLAN_TILES.md` (head: the measurements and the
> architecture case), `docs/BUGS.md` + `docs/TESTING.md` (heads),
> `CHANGELOG.md` (release ledger). Code: `crates/px/src/poisson.rs` (the solver
> header and structure, in full), `renderer/editor/stitch.js` (the colour-match
> kernel and the stitch), `electron/main/assistant/policy.js` (full),
> `renderer/commands.js` (head), `electron/main/onnx/lama_process.js` (head),
> `renderer/editor/inpaint_canvas.js` (the content-aware move block),
> `package.json`, `LICENSE`, file inventory + LOC counts. **Nothing measured — no
> GPU, no engine, no installs, nothing run.** Our side read for fit:
> [image-workbench-v2.md](../specs/image-workbench-v2.md) (§0 decision record),
> [seamless-blending-survey.md](seamless-blending-survey.md) (§0 verdicts),
> [frontend-competitor-insight-2026-09-28.md](frontend-competitor-insight-2026-09-28.md)
> (head), [vlo-assessment.md](vlo-assessment.md) (DNA baseline, house format),
> `docs/architecture.md` (our ComfyUI-proxy seam). Evidence tags: **[DOC]**
> verified in shipped code / official source, **[COMM]** reputable community
> claim, **[SPEC]** plausible-unverified, **[UNK]** nobody knows.

---

## 1. WHAT IT IS

**Scumble is a free, GPL-3.0 desktop image editor for AI inpainting — "feels
like a painting program, not like a node graph" — where generation runs on the
user's own ComfyUI (local or remote) or through ~20 API providers, and the
editor itself is the same source tree as the ComfyUI custom node
`ComfyUI-InpaintCanvas`.** Electron 44 + vanilla-JS renderer + Rust pixel
kernels compiled to WASM; ~168k LOC of JS plus the Rust crate. Open an image,
select by brush/shape/magic-wand/object-hover (SAM2 in-app, ONNX)/text (SAM3 via
a ComfyUI helper prompt), prompt, generate; the result lands **as a layer over
the selection**, colour-matchable with one slider, and stacks against a full
layer system (paint/image/text/filter layers, masks, blend modes, clone/heal/
smudge, transform, PSD/ORA export). Around the editor: a **command core** (63+
documented commands), an **MCP server** (`Scumble --mcp`, stdio; headless mode
in the same process), **JavaScript plugins** on the command core, and an
**in-app chat assistant** that drives the editor through the *same* MCP tool
surface external agents get. [DOC]

The problem it actually solves: inpainting-without-graph-plumbing for people
who already run ComfyUI, and a real editor around API models — the app is "the
editor, the workflow and the agent interface, never the model host"
(`docs/BRIEF.md` §1). [DOC]

**Maturity signals — the strongest process discipline we have read in one of
these assessments.** 32 releases in 19 days (0.1.0 2026-09-09 → 0.1.32
2026-09-28), each with a dated CHANGELOG section that a CI workflow **checks
against the code and the commits** (0.1.32's check: "32 of 34 findings
applied"). 100+ test tools under `tools/` with a written **risk-tiered testing
doctrine** (Full: both tile/canvas backends + a mutation round + a 15k
measurement, only for what can lose pixels; Normal: one gate per feature;
Light: plain-Node request-shape tests) — the maintainer explicitly ordered
*"weniger tests"* (fewer tests) and the tiers are the compromise.
`docs/BUGS.md` requires "what has to be measured before anyone writes code" per
bug. The dev hand-over chain (`CLAUDE.md` → `docs/HISTORY.md` → per-package
PLAN files) is itself agent-driven development with context-budget rules ("at
most two build steps per session"). Honesty is structural, not decorative: the
README's verification paragraph separates what was verified (local ComfyUI
rendering, helpers, tile engine, auto-update) from what was not ("the API
providers and the assistant's model calls are untested against the live
services"), and `CLAUDE.md` carries an explicit **Unverified** list (ToAPIs/
ModelArk live, the Qwen Image Edit 2.1 local recipe "models not downloaded",
the Linux build "built by CI, never run"). [DOC]

## 2. HOW IT WORKS — the load-bearing decisions

**a. One editor, two hosts — the node IS the app.** `renderer/editor/` is the
single source of the editor; `python tools/build_node.py` builds it into the
ComfyUI node's `js/`. The seam is a `host` interface (`host.js` per host:
`api`/`host` members — fetch, queuePrompt, generate, autosave, export), and
**`build_node.py --check` fails when the editor calls a member either host
lacks** — interface parity is machine-checked, not aspirational. This is the
closest thing we have read to our modularity contract enforced at a build gate:
the editor can be pulled out of either host tomorrow because a tool verifies
the seam daily. [DOC]

**b. The command core is the whole surface.** Every operation is a plain
`(name, args) → JSON` function with a params schema; `commands.describe()`
generates the MCP tool list *and* the docs (`docs/COMMANDS.md` is generated
from the running app) *and* the plugin API *and* the test harness. One source
of truth, four consumers. The MCP server maps one tool per command (73 tools
with plugins), errors return as command messages with `isError` (never protocol
errors) so an agent can act on "no layer X (layers: …)", read-only commands
carry `readOnlyHint`, and plugin reloads emit `tools/list_changed`. [DOC]

**c. The assistant is a client of its own product, and consent lives in the
host.** The in-app assistant connects to the **same MCP server** external
agents get, over an `InMemoryTransport` pair inside the main process (tool
surface proven byte-identical when `createServer` was split out), minus a
six-command exclusion set. The policy engine (`assistant/policy.js`) is the
load-bearing piece: *"The host decides, never a rule in the prompt: anything
the model reads can talk it into anything."* A per-command table decides
**auto / ask / refuse** with a reason and a preview card; the decision runs on
the **canonical call** — `doc` filled, every layer reference resolved to an id,
arguments clamped — "so the card shows exactly what will be sent, and a layer
the user clicks while the card is open cannot move the call onto another
layer" (consent without TOCTOU). Ownership is tracked: layers the assistant
created itself edit freely, user-made layers ask; `generate`-class calls ask
with a card naming the recipe *and the current ComfyUI queue depth*; a call
that failed twice is refused ("change it or ask the user"); a busy document
refuses renders; neither ask-button is ever the default, and Enter never
answers a consent card. [DOC]

**d. Agent undo is engineered, and it couples to storage.** Every assistant
step lands on Ctrl+Z — for commands the editor records no step for (a new
layer, `set_layer`'s soft fields), the shell **synthesizes the editor's own
undo step kind** before the call (`policy.undoStep()` maps command+args → step
kind). "Undo this turn" restores every document the turn touched to its
pre-turn state — pixels, selection, prompt, generation settings — via a
snapshot held *outside* the 30-step stack, so it works even when the turn ran
longer than the stack; it is only offered on the **tile engine** backend
(copy-on-write makes the snapshot cheap) and refuses-with-warning if the user
edited mid-turn. Notably, **external agents get none of this** — their layers
land without undo steps. [DOC]

**e. The tile engine (the Krita/Photoshop answer, measured into existence).**
Every layer, mask and the selection live in tiles in system RAM inside a
`SharedArrayBuffer` arena; the GPU holds only visible tiles of a mipmapped
projection (target: ≤ 300 MB VRAM per document regardless of size, vs the
measured 4.3 GB GPU-process footprint of the old every-layer-a-canvas design
at 15,000 × 10,000 — two such documents hit 17 GB); pixel kernels (mip, EDT,
flood, resample, composite, smudge, colour match, PNG/PSD, **Poisson**) are
Rust → WASM SIMD128 in workers, each with a **byte-identical JS twin** tested
against an f64 reference (`px_test.js`); undo steps hold only touched tiles
(copy-on-write, version-stamped jobs); images beyond Chromium's 65,535-px
canvas limit stream in bands. Tiles are the default backend; the old canvas
backend survives as an escape hatch and every pixel change runs gates on both.
[DOC]

**f. Recipes, not graphs.** A recipe is an **API-format prompt JSON with a
fixed canvas-node id** plus a `settings[]` slot map (`{index, node, input,
label}`) — the app injects editor state into the canvas node, writes
settings-panel values directly into the named nodes, and queues with its own
client id; control types come from the live server's `/object_info` when
connected. Users import their own ComfyUI workflow (UI format with subgraph
flattening, or API format) as a recipe if it contains an Inpaint Canvas node;
every settings row needs its own slot 1–8, machine-checked
(`recipes_test.js`). Provider recipes are one model with one variant per
provider; crop/stitch/colour-match happen client-side. [DOC]

**g. ComfyUI integration details worth stealing.** A custom `scumble://` scheme
serves the renderer and proxies `/comfy/*` to the ComfyUI server (auth headers
live in the main process; websocket forwarded over IPC) — **same-origin, so
`<img>` from `/view` never taints a canvas**. A local file mirror
(`%APPDATA%/Scumble/files/`, mirroring ComfyUI's `input/`/`output/`) holds
every byte the app uploaded or received; `ensureOnServer` re-uploads what the
server lacks before a run, so a restarted RunPod box or a fresh ComfyUI works
without reloading the document, and the session restores with no server at
all. [DOC]

**h. The blend stack — the part our survey cares about.** The heal brush and
the content-aware move run a **gradient-domain (Poisson) blend**: `f = src +
u` where `u` is a harmonic membrane inside the stroke and `u = dst − src` on
the boundary ring — the source's texture, the destination's colour and light —
solved by **geometric multigrid** (full-multigrid start; V-cycles of red-black
Gauss-Seidel, 2 pre + 2 post sweeps, 40 on the coarsest; residual restriction
by child-sum; bilinear 9-3-3-1 interpolation; a per-channel energy-minimizing
step α = r·c / c·A c clamped to 0..4; tolerance 1/32 level, ≤ 30 cycles;
measured 4–8 cycles against an f64 reference). The failure modes are *engineered
around in the constants*: coarsening is UNKNOWN-first so the Dirichlet boundary
survives (the naive order diverged 18× the error); a FREE cell class quarantines
singular regions (unknowns walled off from any boundary) so they keep the start
instead of poisoning the solve; boundary pixels need α ≥ 8 in both images or
they are Neumann, not Dirichlet. The **content-aware move band-limits it**: the
moved piece's core "lands byte for byte" and only *a band inside its edge* is
Poisson-blended into the new place (LaMa, in an Electron utility process that
owns its ONNX session, fills the old location). Colour match is a weighted
per-channel mean/std transfer (std-ratio clamped 0.5..2) computed over a window
around the region, and — the clever bit — a colour-matched layer carries its
match as **ten floats** evaluated inside the tile compositor, so the match is
non-destructive, live under the user's Match slider (default 40%), and costs
nothing at paint time. [DOC]

**Fragile bits.** Single maintainer + Claude sessions (bus factor 1, and the
scope — editor, tile engine, 22 provider adapters, assistant, plugins, MCP,
store packaging — is enormous for it); `inpaint_canvas.js` is a deliberate
16.8k-line monolith ("split only where a subject is reworked anyway"); Windows
is the only platform the author runs (Linux CI-built and never executed, macOS
unplanned); the assistant has never completed a task against a live model API
(wiring proven against real hosts, no model closed the loop); SAM3 text
selection and some helpers round-trip through the user's ComfyUI, so editor
features carry engine dependencies. None of these are hidden — each is written
down in their own docs. [DOC]

## 3. FIT FOR US

**ADOPT (mechanism, reimplemented — GPL, patterns-not-code): the band-limited
multigrid Poisson, for the blend-back stack.** Our survey's verdict B held that
"no production-grade JS Poisson exists … the classical blend stack is ours to
own — and most of it is small," and verdict D **deferred Poisson** (solver
cost, bleeding/ghosting). Scumble removes both grounds: it ships an
interactive-cost Poisson running in a worker, and the **band form** (solve only
a band at the seam; the patch core lands byte-for-byte) directly mitigates the
bleeding failure mode our survey cited — the same "ring not whole-patch"
thinking as our graph-cut-seam-in-the-grown-ring idea, but with a shipped
solver. What we take is not the bytes: the convergence recipe (UNKNOWN-first
coarsening so the boundary survives; the FREE-class quarantine for singular
regions; the energy-minimizing interpolation scale; the α-threshold for
boundary pixels), the **band-not-patch application geometry**, and the
determinism discipline (f32 store / f64 compute, fixed op order, no FMA, a
byte-identical JS twin tested against an f64 reference) which is exactly our
kind of test contract. This upgrades the survey's tier ordering — see ADJUST
below.

**ADOPT (pattern): per-layer non-destructive colour match as compositor
constants.** The survey's ranked stack step 2 is "annulus color match"; Scumble
ships it in production as weighted mean/std statistics precomputed to ten
floats and applied inside the composite, with the user-facing form being *a
strength slider* (0–100%, default 40% — "the model's own tone is worth
keeping") rather than a boolean. For our blend-back op-stack: the match should
be a parameterized layer property evaluated at composite time, not a bake pass
on the returned patch. [DOC]

**ADOPT (pattern, conductor-grade): the consent engine and the one-surface
doctrine.** For the conductor (`373fa62e`) and the Invoke selective-for-
surfaces ruling, Scumble is the most engineered agent-control-of-a-creative-
surface implementation we have read — more concrete than vlo's feeding seam:
1. **one command core** generating MCP tools, docs, plugin API and tests from
   one schema; 2. **the internal assistant as a client of the same MCP server**
   external agents use (InMemoryTransport, byte-identical tool surface,
   small exclusion set) — no privileged internal path; 3. **host-side policy,
   never prompt-side** ("anything the model reads can talk it into anything"),
   decided on the *canonical* call so consent has no TOCTOU, with ownership
   tracking, busy/failed-twice refusals, queue-depth disclosure on render
   cards, and no-default-buttons; 4. **undo-step synthesis** so every agent
   action is Ctrl+Z-able, and turn-spanning undo via a snapshot outside the
   history stack. Scumble's own gap marks the better substrate for us: their
   *external* agents get no undo at all because their history is step-based —
   our D4 typed command log with inverses covers internal and external agents
   uniformly by construction. Their coupling lesson stands: agent-spanning undo
   was only affordable on copy-on-write storage — budget for that in the
   document model. [DOC]

**ADJUST: the blend-back tier ordering — promote the Poisson band from
"deferred" to a testable v2 arm.** The survey deferred Poisson on solver-cost
and whole-patch-bleeding grounds; Scumble production-refutes both at once
(multigrid at retouch-interaction cost; band-limited application). The arm
order "grow-at-generation → annulus colour match → masked multi-band blend →
grain match" gains a fifth candidate: **band-limited gradient-domain** as a
quality tier between multi-band and the SDEdit seam-band re-denoise. The
ranking logic is unchanged; one entry moves. [SPEC — from their shipped
mechanism, our arm order remains a testable prediction]

**CONFIRM ×4 — independent validation of decisions we had already made:**
1. **The workbench substrate (D2/D3/D4).** A second shop, independently, moved
   from every-layer-a-canvas (openOutpaint's aged-out shape) to tiles-in-RAM +
   GPU-visible-only + copy-on-write history *after measuring* 4.3 GB GPU at
   150 MP — with Krita and Photoshop named as the reference answer. Their
   `PERFORMANCE.md`/`PLAN_TILES.md` also hand us hard Chromium numbers for our
   browser-side canvas work (the 65,535-px canvas limit, the ~33 MP WebGL
   drawing-buffer cap, the 100-`getImageData` software-canvas heuristic, the
   2-level `drawImage`-with-`copy` drift). Their hybrid backend (tiles default,
   canvas escape hatch, gates on both) is a survivable shape for our own
   substrate risk. 2. **Recipes-not-graphs** is the same move as our
   node-level model dials: the workflow is *data with named slots*, control
   types come from `/object_info`, user workflows import if they contain the
   canvas node — the engine stays the authority, the surface never interprets
   families (our D5/central-model law in their idiom). 3. **The
   never-the-model-host doctrine** — local-first, rendering on the user's
   engine, providers as adapters — is Monoka's posture stated almost verbatim
   in their brief §1. The `scumble://` same-origin proxy (canvas never tainted
   by `/view`) and the file mirror + `ensureOnServer` re-upload (never assume
   the engine holds your bytes; a restarted RunPod box just works) confirm
   what our `server/core.ts` proxy already does and add the mirror discipline
   as a candidate for our document store. 4. **The Qwen-2.1 `<imageN>`
   addressing** — their `qwen_image_edit_2_1_local` recipe routes the crop as
   `<image1>` and reference pictures as `<image2>`/`<image3>` with
   `ImageFromBatch` splitting — a third independent sighting of the addressing
   scheme our fooocus-qwen assessment measured. [DOC]

**Where it does not slot.** Scumble is a sibling *product*, not a component:
no H3/video surface (nothing for the drift-envelope chain, VDN/turbo/HyperFlow
axes, or the video program), and you do not embed one workshop in another.
The tile engine itself is not ours to take (wrong substrate — we are
browser-side konva-class per D2, and GPL besides); the film pack, GLB layers,
retail filters and store packaging are not our slots. Its assistant loop
(four provider families, streaming, cost display) is parallel engineering, not
a gap we hold — our conductor questions are policy and surface, which is
exactly what their `policy.js` answers. [SPEC]

## 4. LICENSE + HEALTH

- **GPL-3.0** (`LICENSE`, `package.json`) — deliberate: the app is a derivative
  of the GPL-3.0 ComfyUI node and the same licence "keeps the two repos
  exchangeable"; no CLA, no dual licensing; only MIT/Apache/BSD/OFL
  dependencies (MCP SDK, `onnxruntime-node`, `ws`, `electron-updater` — all
  MIT; fonts OFL/Apache). Against our policy table: **never vendored, never
  ported — patterns-not-code**, same ruling as vlo's AGPL core. The
  user-fetch doctrine does not really apply (nothing here is a model or node
  pack we would fetch); the relationship is reading, and the techniques above
  are reimplementation candidates with their convergence constants as cited
  knowledge. [DOC — LICENSE read; policy cross-checked]
- **Health:** 32 releases in 19 days, each CHANGELOG section CI-checked against
  the code before the tag builds; risk-tiered tests with written flakes
  doctrine; a BUGS.md that gates fixes on measurements; generated docs;
  unsigned installers with a written code-signing path (Microsoft Store first,
  then SignPath Foundation) and a published code-signing policy. Bus factor 1
  and a 16.8k-line editor monolith are the real risks, both known and managed
  in-tree. Claims are honest to a degree that itself signals: the README
  video's sample photo disclaimer ("nothing in it was generated with Scumble")
  is the culture in one line. [DOC]

## 5. VERDICT

**ADJUST + selective ADOPT (the band-limited multigrid Poisson, the compositor-
constants colour match, and the host-side consent engine — all reimplemented,
GPL) + CONFIRM ×4 (the workbench substrate, recipes-not-graphs, the
never-model-host doctrine, the Qwen-2.1 addressing) — the strongest agent-
surface engineering we have read, and the exact implementation of the one
blend-back tier our survey deferred; a sibling image workshop, not an
integration target.**

| Question | Answer |
|---|---|
| What is it? | GPL-3.0 Electron image editor for AI inpainting; generation on the user's ComfyUI or 20 API providers; the editor source is shared with a ComfyUI custom node; MCP + in-app assistant drive one command core |
| The load-bearing decisions | Node↔app shared editor behind a machine-checked host interface; one `(name,args)→JSON` command core generating tools/docs/plugins/tests; host-side consent on canonical calls; copy-on-write tile engine (Rust/WASM kernels, JS twins); recipes as slot-mapped API prompts; same-origin ComfyUI proxy + file mirror |
| Cleverest bit | The multigrid Poisson's engineered-around failure modes (UNKNOWN-first coarsening, FREE-cell quarantine, energy-scaled interpolation) *and* its band-limited application in the content-aware move; the ten-floats colour match in the compositor |
| Fragile bits | Bus factor 1; 16.8k-line editor monolith; Windows-only in practice; assistant never run against a live API; external agents get no undo |
| Fit for us | ADJUST: promote band-limited Poisson in the blend-back tier order. ADOPT (reimplement): the Poisson convergence recipe + band geometry; colour-match-as-compositor-constants with a strength slider; the consent-engine pattern (canonical-call policy, ownership tracking, queue disclosure, undo synthesis) for the conductor. CONFIRM ×4: D2/D3/D4 substrate (+ their Chromium measurements), recipes-not-graphs/model dials, never-model-host + mirror/ensureOnServer, Qwen-2.1 `<imageN>` (third sighting) |
| License | GPL-3.0 — patterns-not-code per policy; nothing vendored or ported |
| Integration target? | No — sibling product, wrong license, no video/H3 surface |

## Sources (retrieved 2026-09-28)

- `DenRakEiw/scumble` @ `76fbae1d5c9dd6a4988883c340ff11e4a8a12943` (shallow
  clone, read per METHOD): README · `CLAUDE.md` · `docs/{BRIEF,ASSISTANT,MCP,
  RECIPES,PLAN_TILES,BUGS,TESTING}.md` · `CHANGELOG.md` ·
  `crates/px/src/poisson.rs` · `renderer/editor/stitch.js` ·
  `renderer/editor/inpaint_canvas.js` (move block) ·
  `electron/main/assistant/policy.js` · `electron/main/onnx/lama_process.js` ·
  `renderer/commands.js` · `package.json` · `LICENSE`.
- Web: the repo's release page for the 0.1.32 date; nothing else relied on.
- In-repo: [image-workbench-v2.md](../specs/image-workbench-v2.md) §0 ·
  [seamless-blending-survey.md](seamless-blending-survey.md) §0 ·
  [fooocus-qwen-assessment.md](fooocus-qwen-assessment.md) (the `<imageN>`
  doctrine) · [vlo-assessment.md](vlo-assessment.md) (house format, DNA
  baseline) · `docs/architecture.md` (our proxy seam) ·
  [licenses/policy.md](../licenses/policy.md).

---

## Fold-in record (2026-09-28 — the findings rolled into the governing docs)

This assessment's findings landed the same day, folded in with vlo's per the
maintainer's direction: the **ADOPT-reimplement items** (the Poisson recipe +
band geometry, the compositor-floats colour match, the consent engine) are
consolidated with vlo's three into the **sibling reimplement ledger** —
[vlo-assessment.md §6](vlo-assessment.md), the one home for the
reimplementation queue — and the **ADJUST** (band-limited Poisson promoted
from DEFER to a testable v2 arm, with the B4 falsifier design) landed as
[seamless-blending-survey.md Addendum 1](seamless-blending-survey.md). The
workbench v2 spec gained three dated enrichments (§6 stage 6
available-implementations note; §3.3 agent-undo note; §9 consent-engine
vocabulary — no ruled change); the correctness trail (`<imageN>` third
sighting, 17k+5 corroboration, D2/D3/D4 confirmation) is the dated line in
the assumption register (2026-09-28).
