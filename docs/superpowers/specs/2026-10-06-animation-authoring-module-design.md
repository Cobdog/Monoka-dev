# Animation-Authoring Module — Design Spec

> **Status**: approved design, pre-implementation-plan.
> **Path**: architectural (the brainstorming skill's full path).
> **Derived from**: the 2026-10-06 brainstorming dialogue between the
> maintainer and the controller, grounded in Set K's measured findings
> (docs/research/gpu-batch-setK-results.md), the keyframe-animation
> assessment (docs/research/h3-keyframe-animation-assessment.md), and the
> project's standing architecture (the remediation plan's workshop
> directives, the modularity contract, the three-surface doctrine).
> **Next step**: the writing-plans skill produces the implementation plan.

---

## 1. Purpose

The animation-authoring module is the Creation workstation's first
animation surface. It lets a user author, render, review, revise, and
export a character-consistent animated sequence using the MiniMax-H3
keyframe-animation adapters (hero, tween, sequence).

**The prime-feature framing** (maintainer ruling 2026-10-05): this module
is a primary product feature. The keyframe adapters' core promise —
character identity held across every frame in a hand-drawn cadence — was
validated in Set K (zero identity breaks in 23 renders across three
methodologies).

## 2. Architectural identity

**A Workbench Creation-station submodule over shared server-owned
documents and jobs, reusing canvas contracts and design-system
components.** The initial route (which URL, which registry entry) is a
specification decision resolved separately (§11).

This is explicitly **not** a canvas mode. The canvas timeline operates on
chain outputs and segment gaps; this timeline authors the motion *within*
a sequence — a different editing object with different selection
semantics. The relationship is **shared objects, distinct views**: a
canvas tile can represent a sequence or its generating chain; opening the
animation editor authors the same artifact from a different perspective.

## 3. Scope

### 3.1 In scope (the first module)

| Capability | Rationale |
|---|---|
| Session binding (lightweight) | Establishes inputs; not a mandatory wizard |
| Key-slot management (unified model) | The timeline's atomic editing unit |
| Span authoring (hybrid inspector) | The core creative act |
| Three-tool rendering (hero/tween/sequence) | The adapters' three contracts |
| Review and candidate selection | The creative checkpoint |
| Surgical re-roll with stale-descendant marking | Revision without destroying prior work |
| Editorial timing (clip portions, held-frame duration) | Assembling the output |
| Export (one sequence with provenance) | A usable result |

### 3.2 Out of scope (shared Workbench capabilities)

Character construction, reference generation, face/body/wardrobe editing,
character-library CRUD, character LoRA training, `.char` native import
(future integration), text-to-initial-image generation (Workbench
handoff), multi-track editing, audio, transitions between scenes,
compositing, elaborate delivery settings.

### 3.3 The scope statement

> The first animation module consumes prepared character references, binds
> identity and medium to a persistent animation session, and lets the user
> author, render, review, revise, and export one animated sequence.
> Character construction and library management remain shared Workbench
> capabilities.

## 4. Session binding

### 4.1 The binding step

A compact session panel — not a wizard — that:
- Picks prepared reference images (from files or existing project assets)
  or receives a Workbench handoff.
- Confirms the locked character description (retained verbatim from the
  source; the session stores the exact version used).
- Chooses the medium string (from the adapter's fixed vocabulary; an
  animation-session setting, not a character attribute — a character can
  participate in multiple animation projects in different media).
- Binds the initial key pose (an explicit image selection).

A prepared handoff populates the panel and opens the timeline directly.
An empty session exposes the missing inputs in the same workspace without
blocking the rest of the UI.

### 4.2 Versioned binding

Once rendering starts, the session retains a versioned binding to its
reference assets and description. Editing the source character later does
not silently change an existing sequence. An explicit **"update character
binding"** action identifies affected poses and renders, preserves prior
takes, and marks dependent work stale.

### 4.3 The reference-subset contract

A character's reference collection is not automatically the adapter's
reference list:
- Hero consumes the current key (one reference).
- Tween consumes rolling-current plus fixed-far (two references, the far
  one held constant per span).
- Sequence consumes window endpoints (two references).

Character preparation supplies the identity material; the submission layer
resolves the appropriate reference subset for each operation.

## 5. Key-slot model

### 5.1 The unified key

Every key on the timeline is the same data structure regardless of how
its image was obtained:

```
KeySlot {
  id: string
  selectedImage: AssetReference | null
  alternatives: AssetReference[]       // retained; re-rolls append
  lock: boolean                         // protection against replacement
  origin: 'import' | 'hero' | 'frame-promotion' | 'project-asset'
  provenance: {
    assetId: string                     // the stable image asset
    sourceTake?: string                 // when extracted from a clip
    sourceFrame?: number
    generatingOp?: string               // when generated (attempt ID)
    inputRevisions?: Record<string, string>
  }
}
```

Origin, selection, and protection are **separate concepts**:
- Origin is a small label (where the image came from).
- Selection is the consistent timeline treatment (the chosen image).
- Protection is an explicit lock indicator.

No permanent, substantially different tile treatments for different
origins — they perform the same timeline role after selection.

### 5.2 The three sourcing paths

| Path | User action | Result |
|---|---|---|
| Prepared image | Import a file or pick a project asset | Bind the image to a key |
| Hero generation | Select the current key, describe the next movement, render | Choose a generated frame as the next key |
| Frame promotion | Select a frame from a rendered clip | Promote that frame to a key |

Hero returns a **22-frame clip candidate** (not a single still). The user
reviews the motion, selects a frame (the system can propose one, but the
selection must remain inspectable), and the accepted image becomes the key.
The accepted hero key then serves as the far reference for the tween span
leading into it, and the starting key for subsequent work.

### 5.3 Selection semantics

Re-rolling adds an alternative without replacing the current selection.
Only an explicit selection change affects downstream dependencies. When a
selected key changes, dependent spans become stale while their previous
takes remain available. When only an unselected candidate changes, the
accepted sequence is unaffected.

## 6. Span authoring

### 6.1 The hybrid inspector

The span inspector shows two selected key images alongside their pose
descriptions, then centers the movement:

| Part | Authoring treatment | Ownership |
|---|---|---|
| Start pose | Pose description + facing picker | Bound to selected key image |
| Destination pose | Absolute pose description + facing picker | Bound to selected destination image |
| Movement | Free text (action and path) | Span |
| What stays fixed | Free text + inherited identity constraints | Session defaults + span |
| Medium | Fixed chip choices; inherited by default | Animation session |
| Scene and camera | Framing/context; camera with reason clause | Session defaults + span overrides |

Pose descriptions are richer than facing alone — they include body
position, gaze, and expression. Facing is a picker (a closed vocabulary);
the rest is free text bound to the selected image.

### 6.2 The three caption templates

Each adapter compiles differently:

- **Hero**: describes a full action arc from the current key; no
  destination image (showing the destination would be showing the answer).
- **Tween**: describes the current rolling pose, the fixed destination,
  and the next movement step. FIRST FRAME and TARGET END FRAME sections,
  with facing per frame.
- **Sequence**: compiles the selected window into alignment, ordered
  action, and preservation language.

### 6.3 The compiler's enforcement boundary

**Enforced (mechanical guarantees)**:
- Fixed medium strings (from the adapter's supported vocabulary).
- Section order per adapter template.
- Reference numbering.
- Facing vocabulary terms.

**Guided (assistance, not rewrites)**:
- Comparative destination language ("turned farther than…") → flagged
  with a hint ("describe the destination directly: 'head facing
  screen-left'").
- Missing facing → noted.
- Contradictory facing between sections → flagged.
- Negation in the movement text → noted (the checkpoints are
  CFG-distilled; every token is positive).

A collapsed **"View caption"** preview shows exactly what will be
submitted. Raw caption text editing is not a first-module requirement.

**Caption overrides** (medium, camera, scene) must preserve the dialect's
constraints: medium overrides use supported values and compile
consistently within each attempt; camera authoring includes its reason
clause.

### 6.4 The rolling-reference problem

The start-pose description cannot remain frozen to the span's original
key while successive tween steps consume new images. The document
distinguishes:

1. **Span-level motion intent** (the user's authored description).
2. **Current step's reference state** (the actual near-reference image
   and its pose description, which changes per step).
3. **The compiled caption** (what was actually submitted, frozen in the
   attempt).

Pose descriptions follow the selected image candidate. Automatic
captioning can suggest updated descriptions when the near reference
changes, but its output remains inspectable and correctable.

### 6.5 What is NOT in the inspector

No step-size dial, progress lever, easing control, or intensity control.
Set K confirmed (both by metric and by eye) that the `landing <progress>`
vocabulary has no effect. No control should imply validated
generation-time timing.

## 7. Rendering workflow

### 7.1 The advancement model

**User-driven stepping with server-owned execution.** One generated step
at a time; explicit review; explicit continuation. The user can draft
ahead while a render runs, but dependent steps require an explicit user
action before submission.

A **step** is one generated render within the current tool's contract:
- Hero: one candidate clip from the current key.
- Tween: one step of the rolling chain (near ref → next output).
- Sequence: one window render.

All three share the frozen-attempt and explicit-selection lifecycle.

### 7.2 The editor-facing service contract

```
AnimationRenderingService {
  submit(frozenAttempt: AttemptInput): AttemptId
  getState(attemptId): AttemptState
  subscribe(attemptId, callback): Unsubscribe
  cancel(attemptId): void
  extractFrame(attemptId, frameIndex): AssetReference
  selectCandidate(documentId, keyId, attemptId, frameIndex): void  // document command
}
```

Events notify the UI that persisted state changed. Reloading recovers the
same truth without needing the original notification — **the contract is
durable, not callback-chained**.

Frame extraction has two paths:
1. **Proposed frame**: prepared automatically when the clip lands (the
   system proposes a frame, but selection remains user-driven).
2. **On-demand extraction**: the user chooses a different frame during
   review.

### 7.3 The status vocabulary

| State | User-facing meaning |
|---|---|
| Queued | Waiting for the engine |
| Rendering | Generation in progress |
| Preparing review | Render finished; preview/reference assets being prepared |
| Ready to review | A new candidate is available; selection unchanged |
| Failed or canceled | This attempt stopped; previous selections remain |

Progress comes from actual engine observations. Estimated durations use
comparable completed runs; no fixed countdowns.

### 7.4 During the wait

The timeline keeps the selected sequence visible and attaches the running
attempt to the relevant span. Rendering a replacement does not remove the
currently selected take. Users can edit future motion drafts, inspect
other results, or switch workstations. Drafting does not reserve GPU work.

On return, the editor restores the session and highlights "Ready to
review." Completion never automatically changes the chosen key, advances
the playhead, or starts the next dependent render.

### 7.5 Independent renders

Independent renders (those with fully resolved references) may be queued
in parallel. The approval checkpoint applies to **dependent advancement**
only — steps whose near reference comes from a previous result — not to
every render globally.

## 8. Data-model invariants

### 8.1 Frozen attempts

Submission freezes the attempt's inputs:
- Reference asset/take/frame identifiers.
- Compiled caption (the exact text submitted).
- Compiler version.
- Settings (steps, shifts, sampler, base model revision).
- Document revision.

Subsequent edits become the next draft; they do not rewrite what the
running job means.

**Compiled captions belong to frozen attempts.** Editable spans own
motion intent; a caption preview is derived from that intent. Storing
both as independently editable span truth would invite divergence.

### 8.2 Candidate landing

Completion adds a candidate; it never silently:
- Replaces a selection.
- Starts dependent work.
- Duplicates a candidate (duplicate-completion is idempotent).

If the user changes the span during rendering, the result still lands
with its original provenance and appears as "generated from an earlier
version."

### 8.3 Dependency staleness

Changing a selected reference marks affected descendants stale while
preserving their previous takes. A local replacement is not automatically
a local consequence — the stale-marking rule identifies the affected
chain.

## 9. Editorial timing and export

**Editorial timing** (in scope): selecting clip portions (which part of
a generated clip contributes to the sequence) and setting held-frame
duration (how long a drawing holds). These are assembly decisions, not
generation promises. Set K showed that generated clips contain approach
phase (visually interesting) and hold phase (stable but less engaging);
the user chooses which portions contribute.

**Export** (in scope): the selected sequence, with timing and held frames
preserved, plus provenance (the session's binding history and attempt
lineage). Export packaging details are a specification decision (§11).

Multi-track editing, audio, transitions between scenes, and compositing
are later Video Editor work.

## 10. A-1 relationship and the server track

### 10.1 The shared completion owner

The server work establishes the shared completion owner with an
animation-specific handler for candidate landing and reference-frame
preparation. Animation is its **first consumer**, not a separate system.

The Workbench isolation contract prohibits shadow engine clients and
second job queues. For each animation job, ownership is unambiguous: the
server lands it; browser views observe it. Existing browser landing code
must not also process that job.

### 10.2 Recovery and reconciliation

Persisted session state alone does not guarantee resumed execution. The
server track must handle:
- Return without the original subscription → recover persisted state.
- Server or engine restart → an explicit reconciliation contract.
- Results arriving after document changes → provenance preserved.

## 11. Open specification decisions

These must be resolved before the implementation plan:

| Decision | Status |
|---|---|
| Initial route (which URL, which registry entry) | Open |
| Exact document schema (field names, nesting, IDs) | Open |
| Export packaging (format, metadata, delivery) | Open |
| Restart-recovery policy (what auto-resumes, what requires user action) | Open |

## 12. Development strategy

### 12.1 Parallel tracks over one shared contract

**Track A (UI)**: the document model, timeline, inspector, caption
compiler, and review workflow — validated against a mock rendering
service.

**Track B (server)**: the shared completion owner, the animation-specific
job handler, reference-frame preparation, and the durable contract.

Both tracks share the service contract (§7.2) as the interface
specification.

### 12.2 The vertical slice

Before broadening either track, prove:

> Bind two keys → submit one tween attempt → leave the editor →
> completion lands → return → review → select a reference frame →
> explicitly continue.

The UI demonstrates this with deterministic fixtures immediately. The
server track proves the same lifecycle independently. Connect the slice
before completing every tool and export feature.

### 12.3 The mock's behavior requirements

The mock rendering service must exercise:
- Delayed completion.
- Failure.
- Cancellation races.
- Duplicate completion.
- Reconnect (subscription lost and restored).
- Frame-preparation failure.
- Results arriving after the document has changed.
- **Never auto-selecting a landed candidate.**
- **Preserving submitted input snapshots.**

Shared contract checks run against both mock and real implementations.
The mock stays available for development and UI verification, clearly
identified as simulated rendering.

### 12.4 Release gate

Real rendering, server-owned landing, return-and-review, reference
extraction, and explicit dependent continuation must work together
before the module ships. The gate includes:
- Recovery without the original subscription.
- Duplicate completion cannot duplicate candidates.
- Cancellation races and outdated results cannot silently replace
  selections.

Mock-backed previews can be visible much earlier.

## 13. Constraints from the evidence base

| Finding (Set K / assessment) | Design consequence |
|---|---|
| Tween chain saturates to the full arc | No step-size dial; no controls implying gradual stepping |
| The dial is dead (both metric and eye) | No `landing <progress>` lever |
| Approach phase preferred over hold phase | Editorial timing lets users select the approach portions |
| Identity holds across all methodologies | The core promise is reliable; no identity-failure UI needed |
| Tween ≈ latent > FL2VA (eye's ranking) | Tween/latent are the fill mechanisms; FL2VA is not the primary lane |
| 22-frame clips at the card operating point | Hero returns a clip; frame selection is required |
| ~3 minutes per render at 30–50 steps | "Leave and come back" is a foundation requirement |
| Caption dialect has mechanical constraints | The compiler enforces them; the UI surfaces them as pickers/chips |
| The rolling near-reference changes per step | The document distinguishes intent, current state, and frozen caption |
