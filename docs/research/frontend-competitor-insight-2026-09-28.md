# Frontend competitor-insight sweep — how others solved our pain classes, and the improvement set for the next remediation arc

> **Task:** Frontend competitor-insight sweep 2026-09-28 (zupter2) · **Epic:**
> Foundation remediation program (4lphxv8) · **Project:** Monoka-dev (r2lnrfw) ·
> Date: **2026-09-28**.
> **Commission:** the maintainer's 2026-09-28 directive — *"look at similar
> projects and other attempts that have come out, try and garner a set of
> improvements — our frontend is still woefully plagued with issues, better than
> before the remediation pass, but still a lot to go through."* The sweep is the
> input to the NEXT remediation arc, not a fix pass.
>
> **METHOD.** Grounded first in our own reality:
> [perfect-state-walk-2026-09-27.md](../audit/perfect-state-walk-2026-09-27.md)
> (all 31 findings + §6 sweep dispositions + the §7 surface-fitness verdicts)
> and the three held assessments
> ([vlo-assessment.md](vlo-assessment.md) @ `fc4d241`, read in full 2026-09-28;
> [fooocus-qwen-assessment.md](fooocus-qwen-assessment.md) @ `6621cd0;
> [image-workbench-prior-art.md](image-workbench-prior-art.md) — InvokeAI canvas
> @ v6.14.1 code-read). Fresh web research this pass (2026-09-28): the
> ComfyUI_frontend README release notes, the Krita-AI-Diffusion handbook
> (basics + common-issues pages) and repo README, the SwarmUI "Why Use Swarm"
> doc, ComfyUI-Manager missing-nodes/Try-Fix behavior (docs + issues), Invoke
> release notes (gallery pagination), Photoshop generative-fill UX (Adobe help +
> tutorials), Blender manual/status-bar/tooltips + devtalk, DaVinci Resolve
> Magic Mask/Relight integration (manual + forums), Figma's four-zone editor
> model (help center), Krea's 2026 canvas positioning. Repo grounding: our
> `src/canvas/` + `src/images/` + `src/ui/` read at HEAD (toast component,
> overlays, workbench) to pin "our current state" claims. **No GPU, no engine,
> no installs.** Evidence tags: **[DOC]** verified in shipped code / official
> source (incl. their docs/manuals), **[COMM]** reputable community claim,
> **[SPEC]** our reasoning, **[UNK]** nobody knows. Web-survey items carry their
> source inline; the three held assessments are cited as [DOC] since we read
> the code.

---

## 0. The frame: what "plagued" means AFTER the perfect-state sweep

The sweep (§6 of the walk) zeroed 28 of 31 findings — the *instances* are
mostly gone. What remains is three deeper layers, and this sweep judges
competitors against all three:

1. **The classes, not the instances.** Dialog semantics, refusal honesty,
   toast lifetimes, picker naming were fixed where found — but as *classes*
   they have no house contract (the walk itself notes the "other native
   confirms" — datasets ×3, settings reset, tile send, control-track — as a
   "future house-dialog sweep" that never got a task).
2. **The structural verdicts** (walk §7): the images workbench v1 is REWORK
   (v2 is the rework), the properties panel is REFACTOR (a 1,300-line
   per-family monolith leaking special cases), the settings dock is a
   placeholder awaiting the Control Center spec round.
3. **The not-yet-vocabulary**: things our audits never name because no walk
   ever saw them working (§4 below) — the largest untapped layer.

The sweep's ten targets were chosen for maximum coverage of the walk's pain
classes (dialogs, refusals/errors, mode confusion, pickers, naming, first-boot,
toasts/notifications, dense-panel legibility, undo communication, long-op
feedback) plus the three-surface destination (WIRING canvas / CONTROL center /
CREATION workbench) and the node-level-dials directive.

---

## 1. The survey (twelve projects, strongest-first for us)

### 1.1 Krita-AI-Diffusion (Acly; GPL-3.0 — pattern-only for us)

The maintainer's named UX north star; the interaction model is the takeaway.
Verified in their handbook + README [DOC]:

- **One docker, one prompt, one primary button that RELABELS with context.**
  The main action reads **Generate** → **Refine** (strength < 100%) → **Fill**
  (selection + 100% strength). Mode is not a tab you hunt for; it is derived
  state, announced. Their "workspaces" (Generate/Upscale/Live/Custom
  Graph/Animation) live behind ONE dropdown — the mode rail never churns.
- **Strength as the mode dial.** A single slider spans
  generate↔refine↔inpaint; the button label follows. Selections-as-masks,
  with **Grow and Feather sliders** for the mask expansion (the Krita
  selection is the mask; no separate mask-painter round trip for the common
  case).
- **Results land as a PREVIEW, not an edit.** Generated candidates appear on
  canvas as a preview layer; a history panel of thumbnails; **apply via
  per-result button or double-click; MULTIPLE results can be applied to mix
  and erase parts**. Nothing destructive happens until an explicit apply.
- **Queue and cancel while you keep painting**; history browsable "at any
  time" with prompts attached.
- **Live mode**: play button, quality traded for speed, **seed locked so the
  image changes only when the input changes** [DOC].
- **Error craft** (their common-issues page [DOC]): "Collect Diagnostics"
  (runs locally, anonymized, report to clipboard + review window), "View log
  files" link inside connection settings, **workflow.json export of the last
  generation** so a failed graph can be inspected in ComfyUI, Manage >
  Re-install/**Verify** (re-downloads corrupt models automatically), hover
  tooltips that carry error text (the disabled-plugin case). Also honest
  failure taxonomy: OOM "may produce no error at all, just extremely long
  generation"; Manager-reported success that didn't actually update.

### 1.2 ComfyUI new frontend (Comfy-Org/ComfyUI_frontend; Vue/PrimeVue; GPL-3.0 — pattern-only)

The React/Vue-rewrite-era frontend we never studied for its *component
craft*. From their README release notes [DOC]:

- **A real toast API with severity/summary/detail/life**, and
  `toast.addAlert` — alerts-as-toasts is a deliberate system, plus dialog
  replacements for Electron (`prompt`/`confirm` via `extensionManager.dialog`)
  — i.e. **native browser dialogs were explicitly designed out** [DOC].
- **Node finder**: double-click canvas → fuzzy search with node preview
  (v1.1.0). Search-first discovery instead of menu-diving.
- **Queue/History and Node-library sidebar tabs** (v1.2.x) — the two
  async-fabric surfaces are first-class navigation, not toasts.
- **Keybinding customization UI** with edit dialogs and reset (v1.3.7).
- **Selection Toolbox API** (v1.10.9): commands surface in a toolbox **when
  canvas items are selected** — a contextual command bar bound to selection
  [DOC].
- **Integrated server terminal** (Ctrl+`, v1.3.22); **native i18n**, 14
  locales (v1.5); **workflow templates gallery** as a first-run and anytime
  surface; **App Mode** — a workflow exposed as a simplified parameterized
  form (comfy.org) [DOC].

### 1.3 ComfyUI-Manager (GPL-3.0 — pattern-only)

The most battle-tested *remedy* UX in the ecosystem [DOC + COMM]:

- Missing nodes render **red on the graph**; Manager's "Install Missing
  Custom Nodes" **scans the loaded workflow and lists candidate packs with
  Install buttons** — the error and the fix are one screen.
- **"Try Fix"** for installed-but-failed packs: re-install + forced pip
  deps, **explicitly security-level-gated** because it is risky [DOC — their
  issue trail]; **IMPORT FAILED buttons expose the traceback verbatim** [COMM
  verified against their js source].
- The honest failure lesson: their common mode is "Manager says success, the
  files didn't change" — external success claims need re-verification.

### 1.4 SwarmUI (mcmonkeyprojects; MIT — code-adoptable)

- **Three disclosure tiers with an educational bridge**: Simple (a workflow
  exposed as a friendly form, shareable by link), Standard (Generate tab:
  aspect-ratio *buttons* like "16:9" instead of memorizing 1344×768,
  refiner checkbox + upscale slider replacing multi-node hires-fix), Advanced
  (full graph) — and **"Import from Generate Tab" converts your friendly
  settings into the visible workflow**, framed explicitly as how you learn
  the graph [DOC].
- **Per-setting `?` documentation buttons** — every config field carries
  on-demand help instead of persistent helper text [DOC].
- **Model-aware defaults** (auto-detected preferred resolutions), fluid
  browsing of "tens of thousands" of models and thousands of images, the
  grid generator for parameter exploration [DOC].

### 1.5 InvokeAI (Apache-2.0 — code-adoptable; canvas code already assessed)

Beyond the canvas stack we hold ([image-workbench-prior-art.md]):

- **The staging area** — generated results land staged with next/prev through
  iterations, commit-to-layer/discard — is our takes lane as a first-class
  canvas surface [DOC, prior-art §1.5].
- **v5.15 added a PAGED gallery view** option to replace infinite scrolling
  — the perf answer for libraries of thousands [DOC — release notes]. Boards
  as the organization primitive; queue + history as a sidebar.
- Their UI redesign history is itself a lesson: the boards/gallery redesign
  shipped and the community pushed back hard [COMM] — reorganizations of the
  library surface are the highest-backlash class of frontend change.

### 1.6 vlo (AGPL-3.0 — pattern-only; we hold the full assessment)

From [vlo-assessment.md]: fail-closed fulfillment (a partially-applied
postprocess hands everything back WITH A WARNING rather than silently
shipping wrong output), the GenerationPlan snapshot/prepare split, and the
**timeline frame-picker that SNAPS selections to the valid frame grid so
users cannot request an invalid length** — invalid states prevented at the
control, not refused at validate [DOC]. (Plus the TTM two-knob exposure of
sampler internals — lock-in/release — as the model for exposing depth
safely.)

### 1.7 fooocus-qwen (MIT code / Qwen-Research assets — we hold the assessment)

From [fooocus-qwen-assessment.md], the frontend-craft subset: **presets as
the only quality surface** (no sampler/CFG/scheduler widgets), the **cfg-1
negative-inert honesty note inline** ("the UI must say this, else the
silence looks like a malfunction"), **tag-labelled reference cells with live
renumbering**, the **measured seam warning at the moment it happens** (not
in docs), reviewable prompt rewriting, **status-line prompt coaching**
(outpaint tells you to describe the scene, not the operation) [DOC].

### 1.8 Photoshop generative suite (closed — the union benchmark, pattern-only)

- **Contextual Task Bar**: a floating bar that appears with selection and
  offers the right verbs (Generative Fill among them) — announced as
  "the right tool at the right moment" [DOC — Adobe].
- **On-canvas prompt entry**: select → click Generative Fill → type the
  prompt in a box ON the canvas over the selection; blue progress in the
  task bar with cancel [DOC].
- **The generative layer**: every generation is a non-destructive layer;
  **variants live in the Properties panel** when that layer is selected;
  **Generate Similar** (2025) iterates from a near-miss without re-prompting
  [DOC].
- The lesson in their own UX: the variants panel is below the fold on small
  displays and users lose results [COMM] — discoverability of the variants
  surface is the known weak point of an otherwise settled pattern.

### 1.9 Blender (GPL — pattern-only, the pro-tool canon)

- **Tooltips that teach**: every tooltip carries name, the keyboard
  shortcut, current value, and (extended) the full Python path — the UI
  itself is the shortcut teacher [DOC — manual + projects.blender.org
  tooltip-improvement task].
- **The status bar** (2.8 redesign): a footer that displays **contextual
  keyboard-shortcut hints, results, and warning messages** — mode-aware,
  always in the same place [DOC — Blender manual, Status Bar].
- Progressive disclosure stack: toolbar (few tools) → sidebar panels per
  mode → F3 operator search (everything) → pie menus for gesture-speed
  access; keymaps fully customizable but defaults curated [DOC].

### 1.10 DaVinci Resolve (closed — pattern-only)

- **AI as data generators inside the traditional workflow, never a separate
  mode**: Magic Mask strokes produce a tracked matte you then use exactly
  like a Power Window; Relight is a node sitting on the Neural Engine's
  depth map; both compose with qualifiers, nodes, and tracking the colorist
  already uses [DOC — manual/tutorials]. The AI op's OUTPUT is a first-class
  object consumable by non-AI tools.
- Honest gating: Neural Engine features are Studio-only and labeled as such
  where they appear in the free version [COMM].

### 1.11 Figma (closed — pattern-only)

- **The four-zone discipline**: toolbar (top), layers/assets (left),
  properties/inspect (right, selection-driven), canvas (center) — a decade
  of constraint: panels don't duplicate the toolbar; the inspector shows
  what's SELECTED, nothing else [DOC — help center].
- Toasts are rare and carry actions; the notification surface (mentions,
  comments) is a separate persistent inbox — ephemeral feedback and durable
  notifications are different systems [COMM — observation of the shipped
  app].

### 1.12 Krea (closed/commercial — pattern-only, the 2026-fresh benchmark)

- The **real-time canvas as exploration**: sub-50ms iterate loops where the
  image follows your prompt/sketch edits continuously; reviewers describe
  the value as "speed of exploration before committing" [COMM — 2026
  reviews]. Krea 2's evolution adds style references/moodboards as the
  pro-creative direction layer [COMM]. The pattern: continuous feedback
  lanes for the explore phase, discrete takes for the commit phase.

---

## 2. The pain-class matrix (their best answer → our state → the gap)

| Pain class (walk ref) | Best-in-field answer (who) | Our current state | The gap → improvement # |
|---|---|---|---|
| Dialog semantics (W1 + the un-swept native confirms) | ComfyUI frontend designed native dialogs OUT system-wide (`dialog` API, v1.6.13) | IwDialog semantics fixed on workbench; datasets/settings/tile/control-track still use `window.confirm` | A house dialog contract + finishing the sweep → **I-3, I-16** |
| Refusal honesty (W2/W3/W10/F12 zeroed) | ComfyUI-Manager: error + remedy one screen (Install next to the missing thing); KAD Verify/Reinstall | Refusals name exact missing rows; remedy is described, not actionable | Refusals carry inline ACTIONS (fetch/switch/verify buttons) → **I-2** |
| Mode confusion / nav churn (W5, W6) | KAD: mode is derived state; the primary button RELABELS (Generate→Refine→Fill); workspaces behind one dropdown | Stable sub-rail landed (stopgap); vocabulary fixed at nav; lanes still discrete tabs | Derived-context action labels now; strength-continuum study for v2 → **I-1, I-14** |
| Pickers (W11, M3 zeroed-min) | SwarmUI: ratio buttons + `?` docs per setting; fooocus-qwen: live-labelled reference cells | Kind+ordinal labels + class hints at choice point; optgroups deferred | Preset-chip pickers + on-demand depth instead of persistent helper text → **I-6, I-5** |
| Naming (W9 interim) | Photoshop: named, re-enterable objects (generative layers with prompt attached); KAD history: prompts attached to thumbnails | ONE kind+ordinal convention; display-name seam is design-round | Display names (standing seam) + per-take prompt provenance surfaced → **I-10** |
| First-boot (wizard walked clean; W16 zeroed) | ComfyUI: templates gallery as first-run AND anytime surface; SwarmUI: shareable Simple forms | Wizard → first prompt (free text only) | A proven-examples gallery behind the first prompt → **I-12** |
| Toasts/notifications (W14 zeroed) | ComfyUI: severity+life toast API; Figma: actions on toasts + separate durable inbox | Severity-scaled durations + dismiss; no actions, no durable home | Toast actions + a notification ledger in Radar/diagnostics → **I-3, I-4** |
| Dense-panel legibility (V3 floors; properties REFACTOR) | SwarmUI `?`-per-setting; Blender tooltips carrying values+paths | 11px floors landed; panels carry persistent prose | On-demand depth pattern to cut persistent text mass → **I-5, I-6** |
| Undo communication (barely in our vocabulary) | KAD: preview+apply (undo = discard preview); Gmail/Photoshop: named undo steps + undo affordance on action | Trash confirm/restore is the one real cycle; canvas undo silent; no undo affordance on mutating ops | Apply-to-commit semantics + undo-action toasts → **I-8, I-9** |
| Long-op feedback | KAD: queue/cancel while working; Invoke: queue sidebar; ComfyUI: queue/history tab | Radar appears when work exists; takes poll; engine console only in logs | A queue surface with cancel + engine-log tail → **I-11, I-7** |
| Invalid-state prevention (outside walk vocab) | vlo: grid-snapping picker; KAD: strength bounds the mode | H3 grid conformed in code, some hints | Snap the length/resolution controls to valid values → **I-13** |

---

## 3. THE IMPROVEMENT SET (prioritized; S/M/L; surfaces named)

Ordered by (journey damage left × how many walk classes it retires × cheapness).
Effort is frontend-only CPU work unless noted. Every item is a *pattern*
adoption — code-bearing sources (Invoke Apache-2.0, SwarmUI MIT) noted where
a port is possible.

1. **I-1 — The relabeling primary action** (KAD proves it). One primary
   button whose label names the action the current context will perform
   ("Generate video", "Settle edit · 39 frames", "Fill selection"); context
   (lane, selection, strength) drives the label — mode as derived state, not
   a tab hunt. *Adaptation:* the workbench rail's active lane + panel state
   already know the verb; derive the button label in the same store
   derivation. **S.** Surfaces: images workbench v1 (and carries into v2),
   launcher.
2. **I-2 — Refusals carry their remedy as an action** (ComfyUI-Manager proves
   it). Every missing-component refusal renders the fix as an inline button —
   "fetch stage weights" next to the VDN refusal, "open stack report" next to
   membership refusals, "switch machinery" already proved by W6's zero. Text
   names it; the button does it. *Adaptation:* the composed-refusal machinery
   (W2/W3 fix) already returns rows; rows are actions waiting for a dispatch
   map. **M.** Surfaces: workbench gates, settings stack/pack board,
   launcher, Music 3's paused notice.
3. **I-3 — Toast actions + the alert demotion** (ComfyUI frontend + Figma
   prove it). The toast strip gains action buttons (Undo / Open / Fetch /
   See why) and `addAlert`-style severity semantics as a typed contract
   (severity, summary, detail, life, actions?). *Adaptation:* the toast store
   already carries tone; extend the model + component (verified today: text +
   dismiss only — `src/canvas/CanvasToasts.tsx`). **S.** Surfaces: every
   surface that mounts the strip.
4. **I-4 — A durable notification ledger** (Figma inbox + ComfyUI
   queue/history tab prove it). Failures and attention-worthy events land in
   a persistent, reviewable list (Radar/diagnostics), not only an ephemeral
   toast; dismissed failures stay inspectable. *Adaptation:* the Radar's
   "work/attention" derivation is the read side; add an events append-log
   with severities. **M.** Surfaces: Radar, diagnostics dock.
5. **I-5 — Per-setting `?` on-demand depth** (SwarmUI proves it). Every
   control in settings + properties carries a `?` that opens one paragraph
   of what-it-does + the model truth; persistent helper prose shrinks to
   one line. *Adaptation:* the biggest lever on the properties-panel REFACTOR
   — moves the monolith's prose out of layout; the stack report already owns
   the deep truth to link. **S-M.** Surfaces: settings dock, properties
   panel, workbench machinery rows.
6. **I-6 — The teaching tooltip contract** (Blender proves it). A house
   tooltip spec: label, why-unavailable reason (disabled controls), current
   value/units, keyboard shortcut where one exists, hash/filename for
   identity cases — one component, used everywhere. *Adaptation:* W11/W12
   zeroed instances; make the contract so the class stops regenerating.
   **S.** Surfaces: all pickers, disabled tabs/badges, radar, docks.
7. **I-7 — Engine-log tail in diagnostics** (ComfyUI's integrated terminal
   proves the demand; KAD's "View log files" proves the placement). A live
   tail of the engine's recent log lines behind the diagnostics surface,
   with the validation-failure markers already used by tests. **S.**
   Surfaces: diagnostics dock.
8. **I-8 — Results-as-preview + explicit apply (and apply-many)** (KAD
   + Invoke staging prove it; Invoke is Apache-2.0 = code-adoptable).
   Generated takes preview; commit is explicit; multiple takes can be
   composited/kept side by side before any destructive landing. *Adaptation:*
   the v2 staging pattern is already blessed; KAD's delta is apply-MANY to
   mix/erase — name it in the v2 spec's staging module. **M (v2 spec +
   build).** Surfaces: images workbench v2 canvas, take strip.
9. **I-9 — Named-undo communication** (Gmail/Photoshop prove the pattern;
   KAD's preview-discard is the non-destructive half). Mutating actions
   (trash, archive, pin, take-merge) toast WITH an Undo action and a named
   step ("Restored Scene — 1 take"); canvas undo gets a visible name/step
   surface, not just Ctrl+Z silence. *Adaptation:* the trash cycle is
   90% there; generalize its restore semantics to an undo-action toast
   (I-3) + a step label in the bottom bar. **S-M.** Surfaces: index overlay,
   canvas bottom bar, workbench.
10. **I-10 — Prompt provenance on every take** (KAD history + Photoshop's
    generative layer prove it). Each take thumbnail carries (or opens) the
    prompt + settings that made it, first-class — the outputs library and
    take strip. *Adaptation:* provenance is already in the chain records;
    surface it at the thumbnail (tooltip → detail). **S.** Surfaces: take
    strip, outputs library, index.
11. **I-11 — A queue surface with cancel** (KAD "queue and cancel while
    working"; Invoke/ComfyUI queue tabs prove the placement). In-flight and
    pending submissions visible as a list with per-item cancel — generation
    stops being a watch-the-toast activity. *Adaptation:* the poll kernel
    already tracks in-flight renders; render its state as a list. **M.**
    Surfaces: Radar/diagnostics, launcher.
12. **I-12 — A proven-examples gallery at the first prompt** (ComfyUI
    templates gallery proves it). The wizard's step 4 offers 4–6 seeded,
    known-good prompt+setting examples ("a drone shot over neon rain",
    camera-move + prompt pairs) — first success becomes a choice, not
    authorship. *Adaptation:* static curated set; the landing prompt bar can
    offer the same gallery anytime. **M.** Surfaces: wizard, landing.
13. **I-13 — Validity-snapping controls** (vlo proves it). Length/duration
    and resolution controls snap/quantize to the H3 grid and AR tiers AT the
    control (drag or type → nearest legal value, shown), so "engine frame
    grid (5/22/39…)" becomes something the slider does, not a note the user
    reads. *Adaptation:* `h3AlignFrameCount` is the authority; expose it as
    the control's step function. **S-M.** Surfaces: properties panel,
    workbench, camera editor.
14. **I-14 — Strength-continuum IA study for v2** (KAD proves the whole
    continuum; Fooocus proves the hiding). A v2 design-round question: do
    Edit/Refine/Inpaint need to be distinct lanes, or one
    anchored-region surface where strength + relabel (I-1) spans them?
    KAD's one-slider-spanning-modes is the existence proof that lane-count
    can collapse without capability loss. **M (design study → v2 spec).**
    Surfaces: workbench v2 IA (not v1 — v1 is scheduled demolition).
15. **I-15 — Status-bar contract** (Blender proves it). The bottom bar
    becomes the contextual-hints surface: current mode's 3–5 key shortcuts +
    the last operation result/warning line — a fixed place users learn to
    check, absorbing the "calm/attention" vocabulary. *Adaptation:* BottomBar
    exists; the keymap is small (Alt+N, ⌘K, play/fork, undo); derive hints
    per surface. **M.** Surfaces: bottom bar, all surfaces feeding it.
16. **I-16 — Finish the house-dialog sweep** (ComfyUI's dialog API proves
    the systematization). One `StudioDialog`/alertdialog contract (role,
    focus trap, Escape, backdrop, in-house language) replaces the remaining
    native confirms (datasets ×3, settings reset, tile send, control-track).
    *Adaptation:* `src/ui/StudioDialog.tsx` + the W13 pattern exist; it's a
    completion sweep, not new design. **S.** Surfaces: datasets, settings,
    canvas tile actions, control-track.
17. **I-17 — Command palette over actions** (ComfyUI node-finder + Blender
    F3 prove it). Extend the ⌘K index beyond documents to verbs ("fork
    latest take", "open stack report", "export archive") — fuzzy,
    keyboard-first, the escape hatch for everything not worth a button.
    **S-M.** Surfaces: index overlay (all surfaces).
18. **I-18 — Selection-driven contextual commands** (ComfyUI Selection
    Toolbox API proves it; Photoshop's task bar is the closed-source twin).
    Selecting a tile/take/chain surfaces the 3–4 verbs that selection makes
    meaningful (fork, pin, send-to, export) as a small floating row, not a
    right-click hunt. **S-M.** Surfaces: canvas tiles, take strip.
19. **I-19 — Generate Similar** (Photoshop 2025 proves it). From any take:
    "more like this" — same prompt, seed nudged near the source, tier
    unchanged — without re-opening any panel. *Adaptation:* fork already
    captures state; add a seed-neighborhood preset to the fork menu.
    **S.** Surfaces: take strip, fork menu, outputs library.
20. **I-20 — Paged navigation for the outputs library** (Invoke v5.15
    proves the need). Page-by-page browsing (with a page-size preference)
    instead of growing scroll — adopted BEFORE the thousands-of-takes
    problem arrives. **S.** Surfaces: outputs library, timeline overlay.
21. **I-21 — External-claim verification pass** (ComfyUI-Manager's
    success-that-didn't-happen proves the hazard; our W16 is the same
    family). Engine/pack operations that report success get a re-check
    (inventory re-read, pack probe) before the UI claims ready — trust
    surfaces verify, never relay. *Adaptation:* the graphs-verified-on-boot
    pattern generalized to pack installs + inventory refreshes. **S-M.**
    Surfaces: settings pack board, engine badge.

Deferred-honored: the **live-iterate lane** (KAD Live / Krea real-time —
seed-locked continuous preview) is real and proven, but it is a new lane
with engine-load implications (8189 territory) — recorded here as a v2+
candidate, not scheduled. **L** when it comes.

---

## 4. The "we haven't even identified this" list

Outside our current problem vocabulary — none of these appears in any walk
or punch list:

1. **The status bar as a contract** (Blender): a fixed footer carrying
   contextual keymap hints + the last result/warning. We have no footer
   contract at all; toasts and hints float unanchored. (→ I-15)
2. **On-demand depth vs persistent prose** (SwarmUI `?`): our legibility
   war (V3/W12) is fought by making persistent text BIGGER; their answer is
   making most of it ON DEMAND. A different axis entirely. (→ I-5)
3. **The teaching tooltip** (Blender): tooltips as the shortcut/identity
   teacher (shortcut + value + path/filename). We treat tooltips as
   captions. (→ I-6)
4. **Validity-snapping controls** (vlo): invalid states prevented at the
   control by construction. We conform in code and explain in prose. (→ I-13)
5. **Error-and-remedy as one screen** (ComfyUI-Manager): our refusals are
   honest text; theirs are honest text WITH the install button. The remedy
   being actionable is a distinct concept from the refusal being accurate.
   (→ I-2)
6. **Diagnostics as a one-click artifact** (KAD Collect Diagnostics): an
   anonymized, clipboard-ready bug report + last-graph export. Our
   diagnostics dock reports STATE; theirs packages an EXPLANATION for a
   human. (→ I-7, adjacent)
7. **The educational bridge** (SwarmUI Import-from-Generate-Tab): settings
   converted INTO the visible graph as a teaching device. Our chain
   inspector exists for inspection; nobody taught with it. (v2 candidate)
8. **Apply-many result mixing** (KAD): applying MULTIPLE candidate results
   to mix/erase parts — candidates as composable layers, not
   pick-one-and-discard. (→ I-8)
9. **Preview-before-apply as the default landing semantic** (KAD/Invoke
   staging): our takes land committed; theirs land proposed. Undo
   communication starts at landing semantics, not at an undo button. (→ I-8,
   I-9)
10. **Queue visibility with cancel** (KAD/Invoke/ComfyUI): a generation
    queue as a navigable surface. We watch toasts. (→ I-11)
11. **External-claim verification** (Manager's false-success case): the
    concept that a SUCCESS report from an external system is a claim to
    re-verify, not a fact to relay. (→ I-21)
12. **The backlog/attention ledger** (Figma inbox): durable notifications
    distinct from ephemeral toasts — two systems, not one with longer
    timeouts. (→ I-4)

---

## 5. The non-adopt list (deliberately, with reasons)

1. **Embedding ComfyUI's own UI** (vlo's iframe bridge; anything like it).
   Our three-surface architecture deliberately owns its surfaces; embedding
   the node UI re-imports the complexity the registry + typed graphs
   removed. (Standing from the vlo assessment.)
2. **Full keymap customizability** (Blender's 100%-custom keymaps; ComfyUI's
   keybinding editor). We are a curated workshop, not a general DCC; a small
   curated keymap + ⌘K discovery (I-17) + status-bar teaching (I-15) gets
   the benefit without the settings surface and test matrix. Revisit only if
   a maintainer/user actually hits the wall.
3. **Native i18n now** (ComfyUI's 14 locales). Real cost, no current
   audience; our copy discipline (honest, plain) is still stabilizing in one
   language. A copy SYSTEM worth translating comes first.
4. **Cloud/account/credit surfaces** (Photoshop's generative-credit model).
   Local-first, no accounts, engine-at-arm's-length — the generative-LAYER
   pattern is adoptable; the service model is not ours.
5. **Auto-install-everything and forced dependency repair** (SwarmUI's
   auto-installs; Manager's Try-Fix forced-pip variant). Our registry +
   fetch-consent discipline is deliberately stricter; consent-gated fetch
   rows (I-2) give the remedy UX without the blast radius. (Also why
   "Try Fix" specifically stays pattern-only.)
6. **Free-floating dockable-everything panels** (Krita/Blender's full dock
   model). Our dock-geometry system + surface registry is the settled,
   simpler contract at our scale; full dockability is churn we'd have to
   test.
7. **Infinite scroll as the library default** (pre-5.15 Invoke). Invoke
   themselves retreated to paged; we should arrive paged (I-20).
8. **Real-time-as-the-center** (Krea's sub-50ms canvas as the app's core).
   Continuous iteration is one lane (the deferred live-iterate item), not
   the workshop's shape — our generations are long-op, batch, chain-based;
   the conductor owns pacing.
9. **Pie menus** (Blender). Pay off in hotkey-heavy expert flows; our
   pointer+palette model plus a young keymap doesn't earn the custom widget
   class yet. Revisit after I-15 lands and IF keymap usage grows.
10. **Photoshop's variants-in-properties-panel placement** specifically.
    Adopt the generative-layer + variants pattern, but the below-the-fold
    variants panel is their documented weakness — variants belong in the
    take/staging surface where the eye already is (I-8/I-19).

**License floor for the whole set:** patterns are free. Code-bearing adoptions
possible ONLY from InvokeAI (Apache-2.0) and SwarmUI (MIT) — I-8's staging
module is the one with a real code-donor. ComfyUI frontend, Manager,
Krita-AI-Diffusion, Blender: GPL family — pattern-only. vlo: AGPL —
pattern-only. Photoshop/Resolve/Figma/Krea: closed — observation only. Any
adoption lands with its registry row in the same commit per
[licenses/policy.md](../licenses/policy.md).

---

## Verdict table

| Axis | Call |
|---|---|
| **The sweep** | **12 projects surveyed** — 3 from held assessments (vlo, fooocus-qwen, InvokeAI) pushed beyond capture into frontend craft; 9 fresh (KAD, ComfyUI frontend, Manager, SwarmUI, Photoshop, Blender, Resolve, Figma, Krea). Every pain class in the walk's vocabulary has a proven answer somewhere; none requires abandoning an architecture directive. |
| **The improvement set** | **21 items + 1 deferred (live-iterate)** — 8 × S, 6 × M, 6 × S-M, 1 × M-study, 1 × L-deferred. Top five by leverage: I-2 actionable refusals, I-3 toast actions, I-1 relabeling action, I-5 on-demand depth, I-8 preview-apply semantics. Twelve "never-identified" concepts enter the vocabulary (§4). |
| **Fit with directives** | Everything lands INSIDE the settled architecture: node-level dials (Resolve's AI-as-data-generator CONFIRMS it), three surfaces (Figma's four-zone CONFIRMS the discipline), registry-gated fetches (Manager CONFIRMS the remedy UX while its forced-pip variant CONFIRMS our refusal of auto-repair), modularity contract untouched (every item is a surface-level pattern). |
| **The honest caveats** | Web-surveyed UX (Photoshop/Resolve/Figma/Krea) is judged from documentation and community description, not measured use — their patterns are directionally solid but details (exact toast behavior, progress affordances) are [COMM]-grade. The three code-read sources (vlo, fooocus-qwen, Invoke) are [DOC]. Nothing here was GPU-verified; nothing needs to be. |
| **Next step proposed** | This doc feeds the next remediation arc's scoping: items I-3, I-16, I-6, I-1, I-2 are one coherent "communication-contract sweep" (toasts/dialogs/tooltips/labels/refusal-actions) that could be dispatched as a wave the way the perfect-state sweep was. |

## Sources (retrieved 2026-09-28)

- Krita-AI-Diffusion: [handbook — basics](https://docs.interstice.cloud/basics/)
  · [common issues](https://docs.interstice.cloud/common-issues/) ·
  [repo README](https://github.com/Acly/krita-ai-diffusion) [DOC]
- ComfyUI frontend:
  [README release notes](https://github.com/Comfy-Org/ComfyUI_frontend) ·
  [docs.comfy.org changelog](https://docs.comfy.org) ·
  [workflow templates](https://docs.comfy.org/interface/features/template) ·
  comfy.org (App Mode) [DOC]
- ComfyUI-Manager: missing-nodes/Try-Fix via docs.comfy.org legacy-manager
  docs, GitHub issues (security-level gating, 3D-Pack #404, #1761, #2156)
  [DOC + COMM]
- SwarmUI: [Why Use Swarm](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Why%20Use%20Swarm.md) [DOC]
- InvokeAI: [releases v5.15.0+](https://invoke.ai/releases/version/v5-15-0...latest)
  (paged gallery) · canvas stack per our held code-read at v6.14.1 [DOC]
- vlo @ `fc4d241` and fooocus-qwen @ `6621cd0` — our held assessments
  ([vlo-assessment.md](vlo-assessment.md),
  [fooocus-qwen-assessment.md](fooocus-qwen-assessment.md)) [DOC]
- Photoshop: Adobe community (contextual task bar announcement) ·
  PhotoshopEssentials/CreativePro/Peachpit (generative layer, variants,
  Generate Similar) · helpx (prompt-to-edit) [DOC + COMM]
- Blender: [manual — Status Bar](https://docs.blender.org) ·
  projects.blender.org tooltip-improvements task · code.blender.org UI
  workshop · blenderartists (tooltips show hotkeys) [DOC + COMM]
- DaVinci Resolve: cined (Relight), Blackmagic forums (Relight nodes +
  depth), note.com Resolve 19 color-page overview, app-store listing
  (Magic Mask) [COMM + DOC]
- Figma: help center (right sidebar/Properties), LearnFigma four-zone
  breakdown, forum (UI3) [DOC + COMM]
- Krea: krea.ai, SaaSInspector/gstory/Rundown 2026 reviews [COMM]
- In-repo grounding: [perfect-state-walk-2026-09-27.md](../audit/perfect-state-walk-2026-09-27.md)
  · `src/canvas/CanvasToasts.tsx` (toast capability check) ·
  `src/ui/StudioDialog.tsx` · `src/canvas/BottomBar.tsx` · grep for
  workflow-export/graph-inspection (absent, grounding I-7/I-18).
