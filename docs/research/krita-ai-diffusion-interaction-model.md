# Krita-AI-Diffusion — the interaction-model capture (queue, layers, regions, the editor↔generation seam)

**Task:** bg0815k · **Date:** 2026-10-12 · **Purpose:** the f75885c8 feel
reference for the workbench reticle UX (the movable-context-window directive;
see docs/specs/image-workbench-v2.md D6 + §3's generation layer type) — HOW it
feels to drive generation from inside an image editor, not how to install or
configure it.

**METHOD:** web capture. Read this session: the plugin README
(github.com/Acly/krita-ai-diffusion, fetched via the searxng MCP fetch tier),
the official handbook pages (docs.interstice.cloud: /basics, /selections,
/regions, /control-layers, /prompts), and first-hand source reads of
`ai_diffusion/model/jobs.py` @ main (raw.githubusercontent.com). Tooling note:
searxng `fetch_url` served the GitHub + docs reads; the docs site's slugs were
resolved from the index page's own hrefs, and pages behind the docs host's 308
redirect were read via WebFetch (redirect-following) — the searxng raw tier
does not follow redirects. The searxng keyword search itself returned junk for
this plugin (generic Krita results only); discovery went through the README's
doc links instead. Tags: **[DOC]** official docs/README/source read this
session · **[COMM]** reputable community claim · **[SPEC]** plausible-unverified ·
**[UNK]** nobody knows. Plugin version context: README @ main, 2026-10-12
(flux 2 / z-image era; feature set per the README's own list).

## 1. The architecture of the feel: editor owns content, generation is a guest

The plugin's stated goal is to be "an unobtrusive tool that integrates and
synergizes with image editing workflows" — "draw, paint, edit and generate
seamlessly without worrying about resolution and technical details" [DOC,
README]. Concretely the model splits in two [DOC, /basics]:

- **The canvas** holds everything the user owns: the layer stack, selections,
  control-layer content, and (transiently) generation PREVIEWS.
- **The docker** ("AI Image Generation" panel) holds everything the
  generation wants: prompt field(s), strength slider, the action button,
  control-layer list, generation history, settings.

Nothing the generation produces becomes document content until the user says
so (§3). The editor's layer stack is never mutated by a running job.

## 2. Invocation: the action button morphs with context

One button, whose label and meaning derive from canvas state [DOC, /basics]:

| Canvas state | Action | Meaning |
|---|---|---|
| No selection, strength 100% | **Generate** | fresh image, canvas-size, ignores existing content |
| Strength < 100% | **Refine** | image-to-image on the current canvas |
| Selection active, 100% | **Fill** (dropdown) | inpaint; dropdown offers the other selection actions |

The selection actions are a vocabulary, not one mode [DOC, /selections]:
**Fill** (replace, biased to nearby colors), **Expand** (canvas growth in any
direction; "prefers to generate more of the same, rather than being overly
creative"), **Add Content** (prompt-driven, may deviate from surrounding
colors), **Remove Content** (ignore selected content, continue surroundings),
**Replace Background** (experimental; keep selected foreground).

**Feel point:** the user never picks a "tool" for generation — the SAME
gesture (make a selection, hit the button) means fill/expand/remove by
context. The reticle directive's "movable context window" [f75885c8] wants
this shape: the reticle IS the selection; the action vocabulary hangs off it.

## 3. The result lifecycle: preview → apply, never auto-land

- Results appear on canvas **as a preview only**. Applying is explicit:
  "click its Apply button, or double-click the thumbnail" — which "will add
  the generated result as a new layer on top of the layer stack, and remove
  the preview" [DOC, /basics].
- Applying is framed as the curation act: "apply as many results as you want
  in order to keep parts or mix them" — deliberately cheaper than
  discarding unwanted results [DOC, /basics].
- **History:** every result lands in a generation history (thumbnails with
  Apply affordances); the user "can quickly select and compare" previous
  generations and prompts at any time [DOC, /basics + README "History"].
- **Code shape:** each `Job` carries `results: ImageCollection` and an
  `in_use: dict[int, bool]` with `result_was_used(index)` — the plugin tracks
  WHICH results of a job were applied [DOC, ai_diffusion/model/jobs.py].
  Job params carry a `name` — "used eg. as name for new layers created from
  this job" — so a result layer is born named after its job/prompt [DOC,
  jobs.py `JobParams.name`].

**Feel point vs our directive:** Krita's default is preview-then-choose; the
f75885c8 directive is auto-land ("the result is returned and placed EXACTLY
WHERE IT GOT LIFTED FROM, ON A NEW LAYER" — "10 generations in a single area,
then crop out, blend, keep what you want"). The blessed spec already resolved
this — layer-per-result IS the takes system (image-workbench-v2 §3). What the
Krita model contributes to OUR takes UX is the bookkeeping:
per-result used/kept tracking (`in_use`), results named from their job, and
the always-open compare strip. Those are the affordances that make
ten-sibling-layers survivable.

## 4. The queue: per-document, cancelable, orthogonal to editing

- README feature list: "**Job Queue**: Queue and cancel generation jobs while
  working on your image" [DOC, README].
- Code: `JobQueue` — "Queue of waiting, ongoing and finished jobs for one
  document" (a deque; per-DOCUMENT, not per-tool-panel) [DOC, jobs.py].
- Job states: `queued → executing → finished | cancelled` [DOC, jobs.py
  `JobState`]. Job kinds span the whole feature surface:
  `diffusion, control_layer, upscaling, live_preview, animation_batch,
  animation_frame, animation` [DOC, jobs.py `JobKind`] — one queue serves
  every generation-shaped feature, including control-layer derivation.
- Jobs are first-class persisted params (`JobParams`: bounds, name, regions,
  ref_layers as "layer name -> prompt image id", seed, has_mask,
  inpaint_mode, metadata incl. style/sampler/strength) — a job is replayable
  provenance, with explicit backward-compat migration for pre-1.26 documents
  [DOC, jobs.py].

**Feel point:** editing never blocks on generating and vice versa; the queue
is the document's, so history and queue survive panel focus changes. Ours is
the same split one level down (client intent vs engine queue) — the Krita
data point is that the CLIENT-side queue is per-document and carries the
full replayable param set, which is what lets "browse previous generations
AND PROMPTS" work [DOC, README History bullet].

## 5. Regions: prompts bound to layer coverage

The core region model [DOC, /regions]:

- A region = a text prompt attached to the **pixel opacity of a linked
  layer** ("coverage is defined by the pixel opacity of the layer it is
  linked to"). Paint is the steering interface — no separate mask editor.
- One layer links to at most one region; one region may link MULTIPLE layers
  (repeated objects sharing attributes).
- Creation is one click ("Add Region" next to the text input), auto-linking
  the active layer (creating one if needed). Focus follows: selecting a
  region's text field activates its layer, and vice versa.
- The bottom input is the **Root prompt** — composition/style/quality —
  "appended to the text of all other regions"; uncovered canvas follows the
  Root prompt.
- Coverage composes by normal layer stacking (upper regions occlude lower).
- Constraints stated honestly: keep to ~5 regions; "regions don't enforce
  composition — use Control layers for that"; per-region control linking
  only pays off for Reference/Composition/Style/Face.
- Region-aware economics: fills apply only regions with sufficient coverage
  and "only affected regions get result layers"; live mode regenerates "only
  the active region plus padding"; upscaling tiles use only intersecting
  regions [DOC, /regions].

**Feel point:** our Region object (image-workbench-v2 §3: "a saved marquee —
named, persistent, addressable — world geometry + optional per-region
prompt") is the same interaction grain with a different substrate: Krita
derives coverage from painted pixels (the editor's own medium), ours stores
world geometry (the reticle's). Krita's region↔layer focus-linking (select
the prompt, the layer highlights; select the layer, its prompt focuses) is
the affordance that makes N regions navigable — a direct candidate for our
region↔layer relationship. Their "only affected regions get result layers"
is the provenance-scope answer for our reticle's per-area generations.

## 6. Control layers: the layer stack as conditioning

- "Add control layer" attaches a TYPE to a layer: reference-class (Reference,
  Style, Composition, Face) or structural-class (Scribble, Line Art, Soft
  Edge, Canny, Depth, Normal, Pose, Segmentation, Unblur, Stencil) [DOC,
  /control-layers].
- Derivation is one click ("From image") — a new layer with the derived
  content, made active. Generation is "always based on the current canvas
  (all visible layers)" [DOC, /control-layers].
- Two dials per control layer: **Strength** and — notably — **Range** (the
  sampling-step window the control applies during: "start 0.2 / end 0.7 means
  the first 20% of steps run unguided"), with the diffusion-stage reasoning
  stated in the UI copy ("broad composition forms early, details late") [DOC,
  /control-layers].
- A control layer works "if the layer is hidden" — conditioning reads hidden
  layers; visibility is presentation, not participation [DOC,
  /control-layers].

**Feel point:** conditioning is a LAYER ROLE, not an import dialog. Our
reticle's reference/ref bindings (the Region's "ref bindings, Keep dial") map
here; the Range dial (which STAGE of sampling a binding governs) is the
notable affordance our Keep dial doesn't have an analog for yet.

## 7. The prompt box as a reference surface

The text input itself carries interaction weight [DOC, /prompts]:

- Inline emphasis `(word:1.3)` with Ctrl+Up/Down to retune the word under the
  cursor; `#` comments; seed-stable `{a|b|c}` wildcards with the resolved
  choice shown in the result tooltip.
- **`<layer:your layer name>`** attaches a layer as a reference image inline
  — "equivalent to adding a Control layer and choosing the Reference mode" —
  with auto-complete, and mid-sentence placement for edit models ("Put the
  cat in <layer:cat photo> next to the dog").
- Inline LoRA directives, negative-prompt toggle, optional translation with
  per-segment `lang:XX` directives.

**Feel point:** our contract generator wires references by ORDER (`<Picture
N>`, generated, never hand-written) — the opposite trade. Krita's
name-the-layer-in-prose is what makes single-prompt editing feel fluid; ours
is what makes contracts auditable. No change proposed — recording the
contrast as the feel reference it is.

## 8. The seam machinery (what makes it feel like one tool)

- **Mask derivation is automatic and visualized**: from one selection the
  plugin builds the denoise mask (full-strength core + offset ring + graded
  falloff) and a separate blend mask (alpha composition of result onto the
  image), with two user dials — **Selection Feather** (falloff, % of
  selection size) and **Selection Blend** (blend width, px) — and honest
  scaling rules ("50% strength → half the falloff size") [DOC, /selections].
- **Context-area economics are stated, not hidden**: "you always pay for the
  entire context even if it isn't touched"; the context is configurable
  (Selection Bounds / Entire Image / Custom Layer via a reusable Selection
  Mask) [DOC, /selections].
- Fill results "extend beyond the selection area somewhat" for smoother
  transitions, tunable via Grow/Feather [DOC, /basics + /selections].
- **Live mode**: real-time reinterpretation at reduced quality, seed "kept
  constant, so the image only changes when your input does" — a draft loop,
  not a production path [DOC, /basics + README].
- Cancel is a first-class state (`cancelled`), not an error path [DOC,
  jobs.py].

**Feel point:** the seam's feel is bought with MASK MATH the user never sees
— feather/blend/grow defaults tuned so results land without halo surgery.
Our D5 (mask computed client-side from document truth, consumption
family-declared) is the same division of labor; the Krita numbers (feather
as % of selection size, blend in absolute px, strength-scaled transitions)
are the tuned-defaults starting set our reticle lacks.

## 9. Mapping to the workbench reticle (the f75885c8 frame)

| Krita pattern | Our directive (image-workbench-v2) | Take |
|---|---|---|
| Preview → explicit Apply, per-result `in_use` tracking | Layer-per-result auto-lands (the takes system, f75885c8) | Landing policy: ours, settled. ADOPT the bookkeeping: per-take kept/used flags + job-named results + always-visible compare |
| Action button morphs by canvas state (Generate/Refine/Fill) | Reticle + family selection | ADOPT the vocabulary shape: the reticle's affordances should read the context (selection → the family actions), not ask the user to pick a tool first |
| Region = prompt on LAYER COVERAGE (paint is the interface) | Region = saved marquee, world geometry | ADOPT the focus-linking (region↔layer selection follows) + per-region result scoping ("only affected regions get result layers"); substrate stays ours |
| Control layers = layer roles (incl. hidden layers; Strength + Range dials) | Region ref bindings + Keep dial | ADOPT the Range idea as an open question for the Keep-dial surface (which sampling STAGE a binding governs) |
| `<layer:name>` inline references | Generated `<Picture N>` order-wired contract | CONTRAST recorded, no change — auditability vs fluidity is a real fork; the contract generator's shape is a settled decision |
| Per-document job queue, full replayable JobParams, prompt-browsing history | Engine-queue + take strip | CONFIRM our split (client intent vs engine queue) matches the mature shape; JobParams' replay completeness is the bar for our take provenance |
| Feather/Blend/Grow tuned defaults + strength-scaled transitions | D5 client-side mask computation | ADOPT as the tuned-defaults starting set for the reticle's soft-edge handling |
| Live mode (fixed seed, region+padding only) | (no analog yet) | Record as the draft-loop pattern if the reticle ever grows a live arm [SPEC — no current workbench plan] |

## Verdict table

| Area | Verdict | Basis |
|---|---|---|
| Preview→apply result lifecycle + per-result used tracking | ADOPT (the bookkeeping; not the landing policy) | [DOC] /basics + jobs.py `in_use` |
| Context-morphing action vocabulary | ADOPT as reticle UX direction | [DOC] /basics /selections |
| Region↔layer focus-linking + affected-region result scoping | ADOPT as Region-object affordances | [DOC] /regions |
| Mask feather/blend/grow tuned defaults | ADOPT as D5's starting numbers | [DOC] /selections |
| Range dial (sampling-stage window per binding) | OPEN QUESTION for the Keep-dial surface | [DOC] /control-layers |
| Inline `<layer:>` prompt references | CORRECT (ours: order-wired generated contracts — a deliberate different trade) | [DOC] /prompts vs h3image.ts contract |
| Per-document client queue with replayable params | CONFIRM (matches our client/engine split) | [DOC] jobs.py |
| Auto-land vs preview-land as the result default | CONFIRM OURS (f75885c8 is explicit; Krita's apply-act is the curation layer on top) | [DOC] README + directive |

**Honesty notes:** version skew — the handbook and README @ main move fast
(the README already lists Flux 2 / Z-Image; facts captured 2026-10-12);
re-verify before treating any specific default as stable. The queue's
progress/cancel UI specifics beyond the state machine are documented only at
the README-bullet level [UNK for pixel-level UI]. No Krita-side QUALITY
claims are imported — this capture is interaction-model only.

## Sources (read 2026-10-12)

- README — github.com/Acly/krita-ai-diffusion (fetched via searxng GitHub path)
- Handbook — docs.interstice.cloud: /basics, /selections, /regions,
  /control-layers, /prompts (plus the index for slug resolution)
- Source — ai_diffusion/model/jobs.py @ main
  (raw.githubusercontent.com/Acly/krita-ai-diffusion)
- In-repo anchors: docs/specs/image-workbench-v2.md (D5, D6, §3 Region +
  generation layer), the f75885c8 directive (epic 4lphxv8)
