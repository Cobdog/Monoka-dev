# R3 — The Critic: information architecture, surface boundaries, modularity

Blind adversarial UX review, leg 3 of 3. Driven personally in chromium (Playwright) against a
fresh-home instance at http://127.0.0.1:17690 (home `ux-home-3`), real engine at 127.0.0.1:17651
connected as a user would. A second throwaway fresh-home instance (port 17693) was used to re-test
true-first-run behavior, then shut down. Screenshots and aria/text dumps cited below live in
`/home/agent/tmp-gpu/ux-review/r3-shots/` (filenames given inline). Render budget: exactly one real
render was submitted (by the first-run wizard, not by choice — see P0-2); it sat queued ~50 min and
failed engine-side. No other renders were spent. Wall times are recorded where they are UX data.

The product's own stated shape (from the charter): infinite canvas as the working surface;
canvas / datasets / images / gallery as surfaces; tools snap in and out; bar = fresh clone →
connected engine → first generation → chained second generation, in minutes, without reading.

---

## Ranked punch list

### P0-1 — The fourth nav surface, "gallery", is a developer component gallery, not a gallery of anything a user made
**What's wrong.** The Surfaces nav offers canvas · datasets · images · `gallery` (Alt+4, tooltip
"Component gallery"). The gallery surface is a design-system storybook: a 6-column specimen grid of
Button variants × states, Chip tones, ProgressBar recipes, ToastHost placements, StudioDock drag
demos, focus-trap demos — "16 components · 122 cells · 21 justified N/A". Its captions are code
review notes: "buttonWarnFor, dev-time", "(C03, Codex code audit 2026-10-05)", "aria-pressed …
never aria-checked (the r3 correction)", "(P07: the adapter owns the store, the timeouts, the
window)", "T15 shipped it interface-faithful with no production consumer". There is no imagery, no
user content, and no thumbnail grid anywhere (visual pass on `32-gallery.png`).
**Why it matters.** "Gallery" is the word a creator reads as "my stuff." This surface can never
contain their stuff; it's the team's regression harness shipped in the main nav. It also occupies
the mental slot where an outputs surface belongs, which is instead a canvas overlay named "library"
(see P1-4). A first-run user who clicks all four tabs concludes one of four surfaces isn't for
them — an org-chart nav, not a product nav.
**Evidence.** `32-gallery.txt` (full text dump), `32-gallery.png` (visual pass), nav tooltip in
`01-firstrun.aria.yml`.
**The simple version.** Move the component gallery behind a dev flag or `/dev/gallery` route, out
of the user nav and out of Alt+4. If the nav should keep four destinations, give the slot to the
outputs library (and name it "gallery" or "outputs").

### P0-2 — The first-run wizard's last step silently submits a real GPU job while its own copy says generation is a separate, deliberate act
**What's wrong.** Wizard step 4 ("First prompt") says: *"Describe one shot. The chain lands on the
canvas; generate when you're ready — a refused engine says so honestly."* Clicking its only exit,
**Create the first chain**, immediately submits: toasts "Uploading inputs and preparing the
ComfyUI graph…" and "Generation added to the local ComfyUI queue." appear, the top bar shows
"1 running", and the engine's `/queue` contains the job (verified: my prompt pending as job
`6e912afc`). The copy promises the opposite of the behavior.
**Why it matters.** The very first action the app teaches is "the words on screen don't match what
happens." On a shared/owned GPU it also spends compute the user didn't knowingly authorize — my
review copy's "one deliberate render" budget was consumed this way.
**Evidence.** Step-4 copy in `05-wizard-step4.aria.yml`; post-click state in
`08-canvas-with-chain.aria.yml` (toasts, "1 running", "4% Waiting…"); `curl /queue` on the engine
during s6.
**The simple version.** Either the button is honest ("Create the first chain **and render it**") or
the action creates the chain and leaves generation to the chain's own generate button, as the copy
already claims.

### P0-3 — First-run engine address: the field is pre-filled with a port its own placeholder calls wrong
**What's wrong.** On a genuinely fresh home (verified twice: the assigned fresh home, and a second
throwaway fresh home on :17693), the wizard's Engine address field **pre-fills
`http://127.0.0.1:8189`** while its placeholder reads **"http://127.0.0.1:8188 — ComfyUI's default
port"**. One field, two defaults, and the pre-typed one is wrong for every stock-ComfyUI user —
they must notice and delete a digit before Test can pass. (8189 is this project's own testbed
port; that's an internal convention leaking into the default.)
**Why it matters.** This is the single field that gates the entire "connected engine in minutes"
bar, and it ships pre-broken for the world-default install.
**Evidence.** `01-firstrun.aria.yml` (value `8189`, placeholder `8188`), re-verified on the second
fresh home (s19: prefill `"http://127.0.0.1:8189"`, placeholder `…8188 — ComfyUI's default port`).
**The simple version.** Pre-fill 8188 (or pre-fill nothing and let the placeholder teach); probe
and Test remain the fallbacks.

### P0-4 — The progress label lies about the machine state: "Waiting for ComfyUI to start" while the job is merely queued — then the failure arrives as raw engine internals
**What's wrong.** My wizard-submitted render sat at **"4% Waiting for ComfyUI to start" for ~50
minutes** while: the engine's `/queue` reported my job *pending* behind another (the app's own
settings status line simultaneously said "Live · 9 ms · ComfyUI 0.41.0 · **queue 2 jobs**" — the
app knows the queue depth). ComfyUI was never down. When the job finally ran, it failed and the
canvas surfaced: *"ComfyUI failed at node 15 (SamplerCustomAdvanced): AttributeError [redacted]
NoneType [redacted] show_progress_bar [redacted]"* — a graph node ID, a Python exception, and
literal scrubber markers, on the working surface. Diagnostics repeats it with an internal build id
("monoka/text · **studio-2026-09/fnv1a-03f3a95f**") under "Unclassified". Two honesty wrinkles
compounding it: Settings claims "Graphs verified against this engine: 0.41.0 / verified: 0.41.0"
yet the graph failed on 0.41.0, and the failure text appears twice simultaneously (inline on the
node card + a red toast — visual pass of `71-still-chain-spawned.png`).
**Why it matters.** The first render is the trust-setting moment. A number addressed to the machine
(4%) plus a wrong sentence ("waiting to start") plus a Python traceback teaches the user that
progress copy is noise. Queue position is known and sayable: "queued behind 1 job."
**Evidence.** `20-render-running.aria.yml` (4% at t=0 through t+420s), `/queue` dumps during s6
(pending=1), settings line in `40-settings-panel.aria.yml`, failure alert + diagnostics record in
`71/72-*.aria.yml`, `73-diagnostics-failure` capture. (Latency feel itself is R1/R2's lane; the
mislabeled state and the machine-addressed failure copy are the IA/vocabulary finding here.)
**The simple version.** Node status: "Queued behind N jobs → Sampling (step x/y)" from the events
already available; failure copy: one human sentence + "see diagnostics for the technical record,"
and stop printing `[redacted]` markers and node ids on the canvas.

### P1-5 — "Library" means three different things in three places
**What's wrong.** (a) Top-bar **library** button (tooltip: "The library projection — every
completed output across the session") opens the outputs overlay ("Completed outputs appear here —
every take is a canvas object"). (b) Settings → Setup → **"Open the library"** opens the model/pack
*fetch catalog* ("Library — get models … fetched from the network ONLY when you ask"). (c) The
datasets surface has its own **library** text button. The settings header even says "the model
library has its own surface" — but it is not a surface, it's a second overlay reached only from
Settings, and it shares its name with the outputs panel.
**Why it matters.** Same word, three destinations; the user can't build a model of where things
live. Searching "library" in their head returns the wrong place every time.
**Evidence.** `42-library-panel.aria.yml` (outputs overlay), `57-model-library.aria.yml` (fetch
catalog overlay), `30-datasets.txt` (library button).
**The simple version.** Outputs = "gallery" or "takes"; the fetch catalog = "model library" (or
"get models"), and both deserve one consistent name used everywhere, including the datasets bar.

### P1-6 — Visiting the images workbench silently welds a machine-named object onto the canvas
**What's wrong.** Between two snapshots taken with **no clicks other than surface navigation**, a
second node appeared on my canvas: `h3img 2`, labeled **"text → video"**, empty prompt, no
explanation. Timeline of evidence: absent in `20/21-*.aria.yml` (s6), present in
`33-back-to-canvas.aria.yml` after s7 (first-ever visit to `/?images=1`, then gallery, then back).
Code verification (permitted to confirm observed behavior): `src/images/session.ts` — the
workbench persists its session state as a canvas chain of **kind `'h3img'`**. So the *images*
workbench's session is a *video* chain with an internal kind-id as its user-visible name, created
by navigation alone.
**Why it matters.** The canvas is supposed to be the user's sheet of paper; another surface
scribbles on it invisibly, in machine vocabulary ("h3img"), with the wrong modality label
("text → video" for an image tool), and no narration or cleanup story. It also breaks the
"pull a tool out" promise in reverse: you can't *unvisit* — the object stays.
**Evidence.** Snapshot sequence above; `52-h3img-inspector.aria.yml` (inspector shows
"text → video", empty Chain prompt).
**The simple version.** Either the workbench session is invisible state (not a canvas object), or
it's a named, explained canvas object ("Images workbench — this card holds your stills session")
that is removed/annotated when the session ends. And never name user-visible objects with kind ids.

### P1-7 — Internal tracker ids and design-decision notes leak into user-facing labels on six surfaces, including the first screen
**What's wrong.** Census from the captured surfaces (excluding the dev gallery, which is its own
finding): `(R-23)` rides the tooltip of the **first-run prompt bar's** video-prompt chip
(`01-firstrun.txt`); `(R-21: opening it never leaves this surface)` on the workbench settings
tooltip; "the settings exit, R-15" in Settings' Krea section; `(A1 final)` in the datasets
interpolation label; "(demoted per decision 4)" on the workbench's semantic-overflow control;
"projections inherit the no-silent-failure contract" in the timeline and library footers; plus the
gallery's C02/C03/T15/P07/"Codex code audit 2026-10-05"/"the r3 correction", and
`studio-2026-09/fnv1a-…` in diagnostics.
**Why it matters.** These are sentences addressed to the build team, printed on the product. They
cost trust exactly where the app is otherwise well-written (much of the copy is genuinely good),
and they signal that nobody has drawn the line between spec and UI.
**Evidence.** grep census across `*.txt`/`*.aria.yml` in r3-shots (counts in transcript); examples
inline above.
**The simple version.** A lint pass over aria-labels/tooltips for `/\(([RCPT]\d+|A\d+ final|decision
\d)/` and friends; the rationale belongs in code comments or docs, not tooltips.

### P1-8 — The modularity storefront is buried in Settings behind an invisible gate, while every Install/Fetch button is disabled
**What's wrong.** The stated value is "pulling a tool out should be as easy as buying a new one."
The machinery to honor it exists and is good — a consent-gated catalog with license verdicts and
pinned revisions (`57-model-library.aria.yml`), a pack board grouped by feature with install state
(`40-settings-panel.aria.yml`), per-feature "pack not served by the engine — install X from the
Packs board" notes right where the feature lives (chain inspector, workbench lanes). But: (a) the
catalog is reachable only via Settings → Setup → "Open the library" (plus one wizard button) —
two levels deep, no nav slot, while the dev gallery gets Alt+4; (b) on the default external-engine
setup, **every Install and Fetch button is disabled**, with the reason — "an install target is
required first (a managed checkout, or the external custom nodes folder in engine settings)" —
repeated in fine print on all ~14 pack rows and all catalog rows, while the actual fix (set
"External custom nodes folder") sits in a paragraph further up the same scroll. The one thing
modularity promises — snap a tool in — is inert out of the box, and the unlock is a scavenger
hunt. (c) Pack cards lead with authorship and implementation, not capability: "Larryvrh's
turbo-LoRA loader node (the pack the optimization registry detects as larryvrhTurbo) plus the
h3_silu_temb_grid fix…" — the "what breaks without it / what you gain" one-liner is buried in
150-word essays.
**Why it matters.** The modularity contract is the product's stated differentiator; its UX is a
locked cabinet with the key taped under a different shelf.
**Evidence.** `40-settings-panel.aria.yml` (all Install/Uninstall `[disabled]`, per-row fine
print), `57-model-library.aria.yml` (every row "not fetched" + target sentence),
`31-images.txt` (unavailable lanes with pack names — the good part).
**The simple version.** Disabled buttons state their unlock inline ("Set an install target to
enable — 1 click"); a "Get tools" entry point in the main nav or the empty states that need packs;
pack cards lead with one capability line, details collapsed.

### P1-9 — Settings is the everything-drawer, and it exposes the engine's raw filesystem as first-class choices
**What's wrong.** One docked panel (a 53,000-character text dump) hosts: engine connection, managed
engine, the 14-row pack board, the library link, input/output paths, FFmpeg, generation defaults,
**model overrides**, LLM router + Ollama, model inventory, H3 stack verdict, a quality test, a
setup doctor, graph compatibility, Krea availability, and About/license. The Model overrides
comboboxes enumerate the engine's entire model directory verbatim: 45 VAE files including ~30
near-duplicate `minimax_h3_video_vae_fp16__setCMBalias2`-style variants; and the **"MiniMax H3
video — FL2VA checkpoint"** picker offers `Flux2-Klein-9B-True-fp8.safetensors`, `krea2_raw_bf16`,
`wan2.1_14B_SCAIL_2` — other families' checkpoints as legal choices for the H3 lane. Copy leaks
graph internals ("the video and audio VAE picks load the graph's two decoders **(nodes 3/4)**").
The footer shows "All changes saved" **and** a "Save settings" button simultaneously.
**Why it matters.** "Everything it can see, nothing it can't" is the right *engine* policy but the
wrong *settings UI*: the registry's mess becomes the app's face, and the wrong-file footgun is one
distracted pick away. The drawer shape guarantees nobody finds the thing they came for.
**Evidence.** `40-settings-panel.aria.yml` lines 306–680 (overrides), 88–190 (setup), 763–830
(LLM/status).
**The simple version.** Filter override pickers to plausible candidates (family + role), with
"show all files" behind a toggle; split Setup-time concerns (engine/packs/library/paths) from
daily defaults; kill the dual save message.

### P2-10 — The wizard's middle steps are status pages with split verdicts, and "Skip for now" doesn't stick
**What's wrong.** Step 2 (Models) says "The H3 stack is incomplete — make the missing components
visible…" without naming *which* component (that lives in Settings → Status, which names "Turbo 8 —
Not found"), while the bottom-left chip simultaneously says "H3 ready" and my Quality-tier render
submitted fine despite the "Video renders refuse until every slot resolves" warning. Steps 2–3
require no action (both end at "Next") — they're read-only status dressed as setup. "Skip for now"
suppresses the wizard only for the session: a fresh browser session gets it again (s19: 0 dialogs
after in-session reload; s20 fresh context: wizard back at step 1). "Probe common ports" produced
no visible result within 4 s on a box with no engine on common ports — no "nothing found" row.
**Why it matters.** The first-run path's length is the product's stated bar; steps that neither
act nor decide are friction, and contradictory verdicts ("incomplete" vs "ready") teach users to
ignore the app's statuses.
**Evidence.** `03/04-wizard-step*.aria.yml`, s19/s20 runs, s21 probe run.
**The simple version.** Two steps: connect → prompt; models/packs become inline availability notes
the first time a choice is actually unavailable. Probe always reports its result. Skip persists.

### P2-11 — Timeline and library are blocking takeovers, not docked projections
**What's wrong.** Both render as full-viewport overlays (`canvas-index-overlay`, role=dialog) that
intercept the top bar — with Library open, the timeline button is unclickable (Playwright: "div
role=dialog aria-label=Library intercepts pointer events"); the footer hints "V cycles · timeline
→ library → canvas". You cannot compare the timeline with the library, or see either against the
canvas.
**Why it matters.** "Projection" implies a lens over the same workspace; a takeover is a different
place. The V-cycle becomes a hidden modal dance.
**Evidence.** s8 click error log, `55-timeline-panel.aria.yml`, `42-library-panel.aria.yml`.
**The simple version.** Dock them (the StudioDock machinery already exists — it's demoed in the
component gallery) or at least keep the top bar live.

### P2-12 — Canvas switching is invisible; the only visible canvas control is a dead-looking button
**What's wrong.** With canvases existing, the top bar shows a single tab "Canvas 10/15/2026" (+
a close ×). Single-click does nothing; double-click turns it into an inline rename (undiscoverable;
verified via DOM + dblclick). No canvas list anywhere in the chrome — the ⌘K index is the only
switcher. Default canvas name is a date. The empty state's "Resume / new canvas" strip disappears
once a canvas exists.
**Why it matters.** Multi-canvas is a core promise of an infinite-canvas studio ("fork a take,"
"try variations") — arguably the whole point — and its management surface is a hidden palette
command.
**Evidence.** s23/s24 runs, DOM dump (`canvas-tab-name` button), `41-index-palette.aria.yml`.
**The simple version.** A visible canvas list (tab strip overflow or a canvases popover on the
tab), and default names from the first prompt, not the date.

### P2-13 — The images workbench's boundary with the canvas is unexplained, and its way out is mislabeled
**What's wrong.** The canvas has its own image lane (footer "image" radio → "Describe a still —
Enter spawns it at the bar"; spawned chain shows "text → image" with packet-tier/T=1 machinery in
its inspector — visual pass of `71` shows "ENGINE — H3 (T=1 FAST)" and an amber missing-pack
warning). The workbench offers Generate/Compose/Edit/Refine/Burst for the same domain. Nothing
anywhere says when to use which; the still-chain inspector carries workbench vocabulary (packet,
T=1, Fast-sharp slice). "Exit" in the mode nav does not exit — URL stays `/?images=1` (s22); the
actual exit is the Surfaces nav. Further destinations (pose rig, animation document) exist only as
small links inside the workbench rail. Mode-specific jargon rides tooltips ("Staging: Generate →
free → Refine/Burst → free → Exit (24 GB discipline — stages never run concurrently)" — "free" is
a ComfyUI endpoint, "24 GB discipline" is infra talk).
**Why it matters.** Two doors into the same room with no signage; the workbench rail's fine print
is the densest text on any surface (visual pass: "at the edge of legibility" at 1600×1000).
**Evidence.** `31-images.txt`, s16/s17 runs (image lane), `86-workbench-exit` (URL unchanged),
`71-still-chain-spawned.png` + inspector dump.
**The simple version.** One canonical stills entry (canvas chain or workbench, not both with
different vocabulary); "Exit" renamed ("Back to canvas") or made to actually exit; staging policy
as a footnote, not a tooltip slogan.

### P2-14 — Datasets is a trainer's tool wearing a nav slot, with no on-ramp
**What's wrong.** The surface's own vocabulary: "Dataset trigger token: trigger: (unset)", "FTS
over captions + provenance" (the search box's aria-label), "Batch VLM (skip hand)", "Dedup pass",
"Batch draft → review queue", dashboard's "Per-trainer VRAM preflight (worst-case item binds the
dataset)", the interpolation pill "rife-ncnn-vulkan absent — minterpolate fallback (A1 final)" —
which visually truncates to something misread as "masterpolate" (visual pass of `30-datasets.png`).
Nothing on the surface says why a generation-first creator would want it (identity LoRA training?
reference curation?).
**Why it matters.** For the stated user (solo technical creator generating video), one of four
surfaces reads as a different product; the empty state is otherwise well-written ("The source is
sacred: nothing you do here ever modifies an imported file").
**Evidence.** `30-datasets.txt`, `65-datasets-dashboard` capture, visual pass.
**The simple version.** One sentence of purpose in the header ("Build training/reference sets from
your takes — train identity LoRAs, curate references"), plain-language labels (search: "Search
captions", not "FTS"), and consider hiding the surface until a first dataset exists.

### P2-15 — Assorted vocabulary and label leaks (one-liners)
- Node chips "no ops" visually reads as "no qps" at size (visual pass of `71`); insider shorthand
  on every node card.
- The ⌘K job row names my render "…slow pan **Motion d** job" — a policy-suffix fragment ("Motion
  direction…") leaking into the title (`41-index-palette.aria.yml`).
- "turbo family" options name community authors and lineage: "drbaph 4-step (larryvrh lineage)",
  "alibaba-pai PDD FL2VA 8-step" (`08-canvas-with-chain.aria.yml`) — filenames-by-author as UX.
- The workbench references fine print: "9 native references is the v1 budget (the engine's REF2VA
  cap). More requires RefMod bundling, which arrives with the RefMod factory" — roadmap leak.
- A bare `<input type="file">` exposes as a visible-in-aria "Choose File" button at the end of
  every screen-reader tree (0×0, opacity 0 — a11y noise, not visual).
- Gallery/workbench lane tooltips cite upstream issues ("ComfyUI issue #15644") and community
  handles ("Mamad8 T=1 image VAE … step1597.safetensors") as user-facing explanations.

---

## First-run IA verdict

What the app chooses to tell you first: **infrastructure, in the codebase's own order.** The
wizard's four steps — Engine → Models → Node packs → First prompt — mirror the stack's layers
(connection → registry → modules → graph), and two of the four (Models, Node packs) require no
action at all; they are status pages. The user's order — *say a shot, see it move* — appears only
at step 4, and even then the first thing that actually happens is an unrequested GPU submission
(P0-2). Behind the modal, the canvas is already alive and well-copywritten ("Describe a shot, or
drop anything — the canvas is already the app") — the app knows its right first screen and covers
it with an infra checklist.

The shape that matches the stated bar (minutes, no reading): **one step** — point at the engine
(prefill 8188, probe as backup) — then drop the user on the canvas with the prompt bar focused;
surface model/pack gaps lazily, inline, at the exact moment a choice is unavailable, which the
app already does well on the chain inspector and the workbench lanes. Everything the wizard's
steps 2–3 say belongs in those inline notes or in Settings → Status, not on the critical path.

Notable first-run details that are right: the canvas-first empty state copy; the honest "nothing
probes on its own" consent framing; "The source is sacred"; the pack unavailability notes naming
the exact fix path; diagnostics' scrubbed, cause-mapped failure records. The vocabulary is the
failure mode, not the philosophy.

---

## Surface map verdict (one line each)

- **canvas** — earns its place; it is the app (its cross-surface hygiene fails it: silent h3img
  mutation P1-6, raw failure copy P0-4).
- **datasets** — earns a place *for the training workflow it serves*, but as shipped it's a
  different product's surface (P2-14): on-ramp or demotion until a dataset need exists.
- **images (workbench)** — earns its place (real capability, honest unavailability), but its
  boundary with canvas still-chains is unsigned and it leaks session objects onto the canvas
  (P2-13, P1-6).
- **gallery** — does not earn a nav slot: it's the dev component gallery (P0-1); merge behind a
  dev route, and give the slot to the outputs collection.
- **outputs "library" overlay** — missing from the map under its right name: the de-facto user
  gallery lives as a modal with a colliding name (P1-5).
- **model library / get models** — missing from the map as a destination: the modularity
  storefront is buried two levels deep in Settings (P1-8).
- **settings** — over-grown into the everything-drawer; keep it docked but split Setup-time from
  daily defaults and stop printing the raw registry (P1-9).
- **diagnostics** — earns its place; the best-behaved surface in the app (honest, scrubbed,
  cause-mapped — only its build-id leak and shared raw text with the canvas mar it).
- **timeline / library panels** — fine as *projections*, but they are takeovers, not surfaces or
  docks (P2-11); they shouldn't silently share the top bar's taxonomy with four nav "Surfaces."

---

## Recorded wall times (UX data)

- Wizard "Test" (engine localhost): ~1.3 s round trip incl. render.
- First render (wizard-submitted, Quality/30-step, 1344×768, 5 s clip): queued ~50 min at a flat
  "4%", then failed at engine node 15 (shared GPU had one long job ahead; failure root cause not
  determined — possibly shared-engine state or a graph/kwargs mismatch vs the "verified 0.41.0"
  claim).
- "Probe common ports": no visible result within 4 s (nothing to find — but also no "nothing
  found").

## Method notes

Surfaces driven directly: first-run wizard (2 fresh homes), canvas (spawn video + still chains,
inspector, index palette, timeline, library, diagnostics, settings), datasets (+dashboard, trash),
images workbench (Generate/Compose/Edit), gallery, settings (all three groups), model library
overlay, engine queue inspected via ComfyUI API to verify app-reported states. Code was read once
(`src/images/session.ts`) solely to confirm the observed h3img mutation. Blind constraints
respected: no project docs/history were read.
