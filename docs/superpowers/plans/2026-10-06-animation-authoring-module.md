# Animation-Authoring Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Creation workstation's animation-authoring module: bind character references, author keyframed motion spans, render through the keyframe adapters, review candidates, and export an animated sequence.

**Architecture:** A Workbench subview (`/?images=1&view=animation`) over a new `animation_document` + `animation_attempt` schema in the existing SQLite store. A server-side rendering service owns job execution and completion landing; the browser observes. A caption compiler translates authored span intent into adapter-specific prompt text. Parallel UI and server tracks converge at a narrow vertical slice (bind → tween → review → continue).

**Tech Stack:** React + TypeScript (client), better-sqlite3 + zod (server), Playwright (e2e), vitest VM harness (unit).

**Spec:** `docs/superpowers/specs/2026-10-06-animation-authoring-module-design.md` — the binding authority this plan argues from.

## Global Constraints

- **Engine ports 8188/8189 off-limits** to all agent tests; fake/mock rendering only.
- **No new colors or font-size literals** — existing design tokens only (P02).
- **Components take props; adapters own stores** (P07; the never-shared list).
- **vitest = node-pure models only** (P04); ALL browser behavior in Playwright.
- **Every new unit suite registered in `scripts/ci-map.cjs`** in the same commit.
- **PATHSPEC commits** (`git commit -- paths`); new files staged back-to-back first.
- **Conventional commits** with the Flux id `(k2q0n9s)`.
- **The mock rendering service must exercise lifecycle failures** (delay, failure, cancellation races, duplicate completion, reconnect, frame-prep failure, late arrivals) — not just produce clips (§12.3).
- **Never auto-select a landed candidate** — the release gate includes selection integrity (§12.4).
- **Latent-chain continuation is deferred** — only the three adapters' image-reference contracts are in scope (§13).

## Review Focus

1. **Duplicate completion landing twice** — the server receives the engine's completion event twice (retry, reconnect); the attempt must gain exactly one candidate, not two.
2. **Selection change during an active render** — the user swaps a key's selected candidate while a tween render is in flight; the landed result must appear as "generated from an earlier version" and NOT replace the new selection.
3. **Idempotency-key collision with different inputs** — a retry sends the same key but the span intent was edited between attempts; the server must reject with a conflict, not silently accept different inputs under the same key.
4. **Rolling-reference staleness** — the user selects a different frame as the rolling reference for step N; steps N+1..M must be marked stale but their previous takes must remain accessible.
5. **Export with a stale or missing selection** — an export snapshot references a clip whose source attempt was cancelled or whose selected contribution was superseded; the export must fail loudly, not silently drop the segment.

---

## Phase A: Foundation

### Task 1: The animation domain types

**Files:**
- Create: `src/animation/types.ts`
- Test: `tests/animation-types.test.js`

**Interfaces:**
- Produces: all TypeScript types used by the server store, the rendering service, the caption compiler, and the UI. Later tasks import from this file.

- [ ] **Step 1: Write the failing type-validation test**

```javascript
// tests/animation-types.test.js
// The domain types are pure data shapes — validate them with zod schemas
// that the server will use for document and attempt validation.
import { test } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const path = require('node:path')
const vm = require(path.join(__dirname, 'lib', 'ts-vm.cjs'))

const types = vm.loadTs('src/animation/types.ts', {
  AnimationDocumentSchema: true,
  AnimationAttemptSchema: true,
  KeyCandidateSchema: true,
  KeySlotSchema: true,
  SpanSchema: true,
  TweenStepSlotSchema: true,
  EditorialContributionSchema: true,
  BindingVersionSchema: true,
})

test('a minimal animation document validates', () => {
  const doc = {
    id: 'doc-001',
    projectId: 'proj-001',
    schemaVersion: 1,
    revision: 0,
    name: 'Test animation',
    settings: { medium: 'clean line on white', outputWidth: 1344, outputHeight: 768 },
    bindingHistory: [{
      version: 1,
      referenceAssetIds: ['asset-1'],
      lockedDescription: 'A test character',
      boundAt: Date.now(),
    }],
    activeBindingVersion: 1,
    keys: [{
      id: 'key-001',
      candidates: [{
        id: 'cand-001',
        assetReference: { kind: 'asset', assetId: 'asset-1' },
        origin: 'import',
        provenance: { assetId: 'asset-1' },
        poseDescription: 'standing, facing camera',
        facing: 'toward-camera',
      }],
      selectedCandidateId: 'cand-001',
      lock: false,
    }],
    spans: [],
    editorialContributions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const result = types.AnimationDocumentSchema.safeParse(doc)
  if (!result.success) throw new Error(result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '))
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `TMPDIR=/home/agent/tmp-anim npx vitest run tests/animation-types.test.js`
Expected: FAIL — the file doesn't exist.

- [ ] **Step 3: Write the types with zod schemas**

Write `src/animation/types.ts` containing zod schemas for every entity in the spec's §11.2: `AnimationDocument`, `AnimationAttempt`, `KeyCandidate`, `KeySlot`, `Span`, `TweenStepSlot`, `EditorialContribution`, `BindingVersion`, plus the enums (`FacingTerm`, `MediumString`, `AttemptStatus`, `CandidateOrigin`). Export both the zod schemas and the inferred TypeScript types.

Key structural decisions from the spec:
- `KeyCandidate` carries per-candidate provenance, poseDescription, and facing (§5.1).
- `KeySlot` owns candidate membership, selectedCandidateId, order, and lock.
- `Span` connects two key slots and owns motionIntent (the user's authored text), overrides, and ordered `tweenStepSlots`.
- `TweenStepSlot` retains attemptAlternatives and a selectedRollingReference (explicit, not automatic).
- `EditorialContribution` references a selected clip or drawing with inFrame/outFrame/holdDuration (§11.3 conventions: start-inclusive, end-exclusive, integer frames).
- `BindingVersion` is immutable; the document points to `activeBindingVersion`.
- `AnimationAttempt` has: id, documentId, operationTarget (keyId or spanId or stepSlotId), tool ('hero' | 'tween' | 'sequence'), idempotencyKey, frozenInputSnapshot (the resolved references, binding version, dependencies, exact caption, compiler version, adapter/base identifiers, settings), sharedJobId, executionState, preparationState, resultReferences, and its own revision (separate from the document revision).

- [ ] **Step 4: Run tests to verify they pass**

Run: `TMPDIR=/home/agent/tmp-anim npx vitest run tests/animation-types.test.js`
Expected: PASS.

- [ ] **Step 5: Register in ci-map + commit**

```bash
git add src/animation/types.ts tests/animation-types.test.js scripts/ci-map.cjs
git commit -m "feat(animation): the domain types — zod schemas for the animation document and attempt records (k2q0n9s)" -- src/animation/types.ts tests/animation-types.test.js scripts/ci-map.cjs
```

---

### Task 2: The animation document store

**Files:**
- Create: `server/animation/store.ts`
- Modify: `server/documents.ts` (add the animation tables to the schema migration)
- Test: `tests/animation-store.test.js`

**Interfaces:**
- Consumes: the types from Task 1.
- Produces: `AnimationStore` with CRUD for documents and attempts, transactional selection commands, staleness propagation.

- [ ] **Step 1: Write the failing store test**

```javascript
// tests/animation-store.test.js
// Boots a real SQLite DB in a temp home; tests the CRUD, revision
// checking, selection commands, and staleness propagation.
import { test } from 'vitest'
// ... boot a server home, create the store, run assertions
// Key tests:
//   - createDocument / getDocument / updateDocument with revision check
//   - createAttempt / getAttempt / updateAttemptState (separate revision)
//   - selectKeyCandidate with expectedRevision (accept + reject stale)
//   - selectKeyCandidate on a locked key (reject)
//   - selectRollingReference (updates tween step slot, marks later steps stale)
//   - candidate landing is idempotent (landing twice adds one candidate)
//   - changing a selected key marks dependent spans stale
```

Write the full test file with ~12 test cases covering: document CRUD, attempt CRUD, the three selection commands with revision checks and lock enforcement, idempotent candidate landing, and staleness propagation.

- [ ] **Step 2: Run it to verify it fails**

Run: `TMPDIR=/home/agent/tmp-anim npx vitest run tests/animation-store.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the store**

`server/animation/store.ts` with:
- `upAnimationTables(db)` — creates `animation_document` and `animation_attempt` tables if absent.
- `AnimationStore` class wrapping the db with methods for each operation.
- All authoring commands (the three selection commands, key CRUD, span CRUD, binding updates) use `expectedRevision` and validate transactionally.
- Attempt state updates use the attempt's own revision, not the document's.
- Staleness propagation: changing a selected key candidate marks spans that reference that key as stale; changing a rolling reference marks later tween step slots stale. Previous takes are never deleted.

- [ ] **Step 4: Run tests**

Run: `TMPDIR=/home/agent/tmp-anim npx vitest run tests/animation-store.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

---

### Task 3: The caption compiler

**Files:**
- Create: `server/animation/compiler.ts`
- Test: `tests/animation-compiler.test.js`

**Interfaces:**
- Consumes: the span's motionIntent, the session settings, the key candidates' pose descriptions and facing values.
- Produces: `compileCaption(tool, spanContext, sessionSettings): string` — the exact text submitted to the adapter.

- [ ] **Step 1: Write the failing compiler test**

```javascript
// tests/animation-compiler.test.js
// Pure-model tests for the three adapter caption templates.
// Key behaviors to test:
//   - hero template: 3 sections (SCENE/MOVEMENT/STATIC), no destination
//   - tween template: 5 sections (SCENE/FIRST FRAME/TARGET END FRAME/MOVEMENT/STATIC)
//   - sequence template: alignment line + Subject/Action/Camera/Preserve
//   - medium string is byte-identical from the fixed vocabulary
//   - facing terms use the closed vocabulary
//   - MOVEMENT text passes through verbatim (free-text)
//   - comparative language in TARGET is FLAGGED (not rewritten)
//   - negation in MOVEMENT is FLAGGED (not rewritten)
//   - camera includes its reason clause
```

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement the compiler**

`server/animation/compiler.ts` with:
- Three template functions (one per tool).
- A `CaptionHints` type for the advisory flags (comparative language, missing facing, contradiction, negation).
- The fixed medium vocabulary and facing terms.
- The compiled output is a plain string; the hints are returned alongside for the UI.

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

---

### Task 4: The rendering service contract + mock

**Files:**
- Create: `server/animation/rendering.ts` (the interface + real implementation stub)
- Create: `server/animation/mock-rendering.ts` (the lifecycle-failure mock)
- Test: `tests/animation-rendering.test.js`

**Interfaces:**
- Consumes: the attempt types from Task 1, the store from Task 2.
- Produces: `AnimationRenderingService` (the interface) and `MockRenderingService` (the test implementation).

- [ ] **Step 1: Write the failing service test**

```javascript
// tests/animation-rendering.test.js
// Tests the MOCK implementation against the service contract.
// Key behaviors (from §12.3):
//   - submit returns a durable AttemptId (async, after validation)
//   - idempotency: same key + same inputs → same attempt; different inputs → conflict
//   - delayed completion resolves the attempt
//   - failure marks the attempt failed; previous selections unaffected
//   - cancellation during rendering marks cancelled; landed output preserved
//   - duplicate completion events land exactly one candidate
//   - reconnect: getState returns the same truth without the original subscription
//   - frame extraction is idempotent by (attemptId, frameIndex, version)
//   - never auto-selects a landed candidate
```

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement the interface + mock**

`server/animation/rendering.ts` defines the `AnimationRenderingService` interface (the async contract from §7.2, including the idempotency-key semantics). `server/animation/mock-rendering.ts` implements it with configurable behaviors: `setDelay(ms)`, `setFailureMode('timeout'|'engine-error'|'prep-failure')`, `fireDuplicateCompletion()`, `simulateReconnect()`.

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

---

### Task 5: The HTTP routes

**Files:**
- Create: `server/animation/routes.ts`
- Modify: `server/core.ts` (mount the animation routes)
- Test: `tests/animation-routes.test.js`

**Interfaces:**
- Consumes: the store (Task 2) and the rendering service (Task 4).
- Produces: REST endpoints for the animation module.

- [ ] **Step 1: Write the failing route test**

Test the HTTP surface: document CRUD, attempt submission with idempotency, state polling, the three selection commands with revision checking, frame extraction, and the WebSocket subscription channel.

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement the routes**

REST endpoints:
- `GET /api/lan/animation/documents/:id`
- `PUT /api/lan/animation/documents/:id` (with expectedRevision)
- `POST /api/lan/animation/documents/:id/attempts` (submit with idempotencyKey)
- `GET /api/lan/animation/attempts/:id`
- `POST /api/lan/animation/attempts/:id/cancel`
- `POST /api/lan/animation/attempts/:id/frames/:index` (extract)
- `POST /api/lan/animation/documents/:id/select-key-candidate`
- `POST /api/lan/animation/documents/:id/select-rolling-reference`
- `POST /api/lan/animation/documents/:id/select-clip-contribution`
- WebSocket channel: `animation` (events for attempt state changes and document updates)

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

---

## Phase B: The vertical slice

### Task 6: The session binding UI

**Files:**
- Create: `src/animation/SessionBinding.tsx`
- Create: `src/animation/AnimationApp.tsx` (the workspace shell)
- Modify: `src/surfaces/registry.ts` (the `view=animation` routing)
- Test: `e2e/animation.spec.ts`

- [ ] **Step 1: Write the failing e2e test** — navigating to `/?images=1&view=animation` shows the binding panel with missing-inputs states; a prepared handoff populates it.

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement the binding panel + workspace shell**

The `AnimationApp` component: a lightweight host that shows the session binding panel when no document is open, and the timeline workspace when a document exists. The binding panel uses the shared UI kit (Field, Button, Chip for the medium picker, Refusal for missing-input states).

- [ ] **Step 4: Run e2e to verify it passes**

- [ ] **Step 5: Commit**

---

### Task 7: The timeline

**Files:**
- Create: `src/animation/Timeline.tsx`
- Modify: `src/animation/AnimationApp.tsx`
- Test: `e2e/animation.spec.ts` (extend)

- [ ] **Step 1: Write the failing e2e test** — the timeline shows key slots (with the selected candidate's image) connected by spans; clicking a span selects it; the playhead is visible.

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement the timeline**

A horizontal timeline: key slots as image-backed cards with lock indicators and origin badges; spans as connecting bars between adjacent keys; tween step slots nested within spans. Selection highlights the active span. The playhead indicates the review position.

- [ ] **Step 4: Run e2e**

- [ ] **Step 5: Commit**

---

### Task 8: The span inspector (tween only)

**Files:**
- Create: `src/animation/SpanInspector.tsx`
- Modify: `src/animation/AnimationApp.tsx`
- Test: `e2e/animation.spec.ts` (extend)

- [ ] **Step 1: Write the failing e2e test** — selecting a span shows the inspector with both key images, the facing pickers, the pose descriptions, the movement and preservation text areas, the inherited medium chip, and the "View caption" preview (collapsed by default).

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement the inspector**

Uses the shared Field component for the text inputs, Chip for the medium, a custom facing picker (the closed vocabulary), and the compiled caption preview. The compiler runs client-side for preview; the server-side compiler is authoritative at submission.

- [ ] **Step 4: Run e2e**

- [ ] **Step 5: Commit**

---

### Task 9: The review panel + frame selection

**Files:**
- Create: `src/animation/ReviewPanel.tsx`
- Modify: `src/animation/AnimationApp.tsx`
- Test: `e2e/animation.spec.ts` (extend)

- [ ] **Step 1: Write the failing e2e test** — after a mock render completes: the status transitions to "Ready to review"; the panel shows the candidate clip; frame selection is explicit; "Generate next step" is the continuation action; re-rolling adds an alternative without replacing the selection.

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement the review panel**

Shows the attempt's status (the vocabulary from §7.3), the candidate clip (a video player or frame strip), the proposed frame, explicit frame selection, and the continuation/re-roll actions. Never auto-selects.

- [ ] **Step 4: Run e2e**

- [ ] **Step 5: Commit**

---

### Task 10: Wire the vertical slice end to end

**Files:**
- Modify: several (connect the store, the rendering service, the UI)
- Test: `e2e/animation.spec.ts` (the full lifecycle test)

- [ ] **Step 1: Write the full lifecycle e2e test**

The spec's §12.2 slice: bind two keys → submit one tween attempt → leave the editor (navigate away) → completion lands (server-side) → return → review → select a reference frame → explicitly continue.

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Wire everything together**

Connect the client store to the HTTP routes, the rendering service to the engine (via the mock for now), and the UI components into the lifecycle flow.

- [ ] **Step 4: Run e2e**

- [ ] **Step 5: Commit**

---

## Phase C: Broadening

### Task 11: The hero tool
Extends the span inspector and rendering service for the hero contract: select the current key, describe the next movement, generate a candidate clip, review and select a frame as the next key. The accepted hero key becomes the far reference for the tween span leading into it.

### Task 12: The sequence tool
Implements the sequence contract: select a key window (two endpoints), compile the window caption (alignment + ordered action + preservation), render, review the held sequence.

### Task 13: Editorial timing
Implements the editorial contribution model: selecting clip portions (inFrame/outFrame), setting held-frame duration, reordering contributions, and the assembled-sequence preview.

### Task 14: Export
Implements the export pipeline: freeze the export snapshot, assemble the video (H.264, 24fps, at the document's dimensions), generate the manifest.json with provenance, package as a ZIP, and deliver via HTTP.

### Task 15: The real rendering path
Connects the animation rendering service to the actual engine (the ComfyUI testbed via the existing engine lane), replacing the mock. This task lands last and requires the A-1 completion-owner infrastructure.

### Task 16: The acceptance sweep
Re-runs the manifest's mechanical acceptance greps, the full e2e suite, the vision capture with the animation surface registered, and both CI legs. The release gate from §12.4.
