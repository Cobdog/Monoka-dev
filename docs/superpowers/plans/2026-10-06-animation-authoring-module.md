# Animation-Authoring Module Implementation Plan (r2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Creation workstation's animation-authoring module: bind character references, author keyframed motion spans, render through the keyframe adapters, review candidates, and export an animated sequence.

**Architecture:** A Workbench subview over a new `animation_document` + `animation_attempt` schema in the existing SQLite store. A server-side rendering service owns job execution and completion landing (built in the foundation, not deferred); the browser observes via the existing realtime fabric. A shared caption compiler module is imported by both server and client.

**Spec:** `docs/superpowers/specs/2026-10-06-animation-authoring-module-design.md`

## Global Constraints

Same as r1, plus:
- **The shared completion owner is foundation work** — the server-side rendering path (dispatch, observation, landing, reconciliation, recovery) is built alongside the mock, not deferred to a late task.
- **The caption compiler lives in a shared module** importable by both server and client; one return shape `{ caption, hints, compilerVersion }`.
- **Stale selections export with acknowledgment** (not rejection); missing or incompatible media fails. A frozen export survives later changes.
- **The existing realtime fabric carries animation events** — no separate WebSocket owner.
- **Zod adoption is a dependency decision** requiring lockfile and license work before Task 1.
- **Test harness**: use `tests/lib/styleSheet.cjs` as the VM-loading precedent; valid UUID fixtures; `TMPDIR=/home/agent/tmp-anim` for scratch.

## Review Focus

1. **Duplicate completion landing twice** — the attempt must gain exactly one candidate.
2. **Selection change during an active render** — the landed result appears as "from an earlier version," never replaces the new selection.
3. **Idempotency-key collision with different inputs** — reject with conflict.
4. **Rolling-reference staleness** — later steps marked stale; previous takes preserved. Staleness covers binding, pose-description, intent, and settings changes too, not just image replacement.
5. **Export with stale but usable selections** — exports successfully after acknowledgment, recorded as stale in the manifest. Missing/incompatible media fails loudly. A frozen export is immune to later edits.

---

## Phase A: Foundation (schema + contracts + completion owner + mock)

### Task 1: Dependency decision + the animation domain types

**Files:** Create `src/animation/types.ts`; Test `tests/animation-types.test.js`

The zod dependency decision: assess whether to add zod or use the repo's existing validation patterns (the store already validates JSON structures). If zod is adopted, the lockfile and license-registry row land in this commit. If not, use hand-rolled type guards following the existing server validation conventions.

Types cover all entities from spec §11.2. IDs are UUIDs. Test uses the repo's VM harness (`tests/lib/styleSheet.cjs` precedent).

### Task 2: The animation document store (full lifecycle)

**Files:** Create `server/animation/store.ts`; Modify `server/documents.ts`; Test `tests/animation-store.test.js`

Beyond r1's CRUD: registered migration with schema-version guards; project archive round-trips (export/import includes animation records and referenced blobs); staleness propagation covers binding, pose-description, intent, AND effective-settings changes; concurrent-authoring rules (landed results attach without overwriting concurrent authoring changes — attempt updates use the attempt's own revision, not the document's).

### Task 3: The shared caption compiler

**Files:** Create `shared/animation/compiler.ts` (importable by both server and client); Test `tests/animation-compiler.test.js`

Return shape: `{ caption: string, hints: CaptionHint[], compilerVersion: string }`. Three templates (hero/tween/sequence). Mechanical constraints enforced; language issues flagged as hints, never rewritten. The client imports this module for live preview; the server imports it for authoritative compilation at submission.

### Task 4: The rendering service contract + completion owner + mock

**Files:** Create `server/animation/rendering.ts` (interface + real implementation), `server/animation/completion-owner.ts` (the shared completion infrastructure), `server/animation/mock-rendering.ts`; Test `tests/animation-rendering.test.js`

The completion owner (spec §10): durable dispatch intent (persisted before engine submission), engine observation (the server watches, not the browser), idempotent landing (duplicate completion events produce one candidate), uncertain-submission reconciliation (search by attempt identifier, never blindly resubmit), cancellation-race handling (preserve landed output, never auto-select), and preparation retries (bounded automatic, then explicit user action). This is the A-1 scoped work, built here — not deferred.

The mock exercises every lifecycle failure from §12.3.

### Task 5: The HTTP routes + realtime events

**Files:** Create `server/animation/routes.ts`; Modify `server/core.ts`; Test `tests/animation-routes.test.js`

Beyond r1's endpoints: document creation and listing, binding mutations, key/span CRUD, candidate insertion, lock toggling. Animation events ride the existing realtime fabric (fabric events with an `animation` channel prefix), not a separate WebSocket.

### Task 6: The client integration boundary

**Files:** Create `src/animation/client.ts` (the HTTP client + document adapter), `src/animation/fabric.ts` (the realtime subscription adapter); Modify `src/surfaces/registry.ts` (the `view=animation` routing); Test `e2e/animation.spec.ts`

The HTTP client wraps the routes with typed methods. The fabric adapter subscribes to animation events through the existing fabric, not a new connection. The Workbench host (the `view=animation` route in the images surface) lazy-loads either the image editor or the animation module. The durable handoff (Workbench → animation) lives in the shared store.

---

## Phase B: The vertical slice (tween lifecycle)

### Task 7: Session binding UI
The binding panel using the shared UI kit. A prepared handoff opens directly into the timeline.

### Task 8: The timeline
Key slots as image-backed cards with lock indicators and origin badges; spans as connecting bars; tween step slots nested within spans.

### Task 9: The span inspector (tween)
The hybrid inspector with facing pickers, pose descriptions (bound to candidates), free-text movement/preservation, inherited medium/scene/camera, and the compiled caption preview (using the shared compiler module, client-side).

### Task 10: The review panel + wired vertical slice
The candidate review workflow (status vocabulary, clip display, explicit frame selection, continuation). The full lifecycle e2e test: bind → submit tween → leave → completion lands (via the completion owner, mock-backed) → return → review → select → continue.

**Integration gate**: the vertical slice must work end to end with the mock before Phase C starts. The real engine connection (Task 15) can begin in parallel with Phase C but the mock-backed slice must be green first.

---

## Phase C: Broadening

### Task 11: The hero tool
**Dependencies**: Tasks 7–10 (the timeline, inspector, review). **Acceptance**: hero generates a candidate clip from the current key; the user selects a frame; the accepted key becomes the far reference for the incoming span.

### Task 12: The sequence tool
**Dependencies**: Tasks 7–10. **Acceptance**: sequence renders a selected key window with the alignment/ordered-action/preservation caption.

### Task 13: Editorial timing
**Dependencies**: Tasks 7–10. **Acceptance**: clip-portion selection (start-inclusive/end-exclusive), held-frame duration, contribution reordering, assembled-sequence preview.

### Task 14: Export
**Dependencies**: Task 13 (editorial contributions must be complete). **Acceptance**: the export snapshot is frozen before assembly; stale-but-usable selections export with acknowledgment and manifest annotation; missing/incompatible media fails loudly; a frozen export survives later selection changes. Deliverable: a ZIP with `sequence.mp4` + `manifest.json`.

### Task 15: Real rendering path
**Dependencies**: Task 4 (the completion owner), Task 10 (the vertical slice proven with mock). **Acceptance**: the real engine connection replaces the mock behind the same service interface; recovery from engine restart reconciles state; uncertain submissions resolve by attempt-ID search; the release gate's integrity conditions hold (§12.4). **Begins in parallel with Phase C after Task 10 gates green.**

### Task 16: The acceptance sweep
**Dependencies**: all prior tasks. **Acceptance**: the manifest's mechanical greps, full e2e, vision capture with the animation surface registered, both CI legs, and the §12.4 release gate.
