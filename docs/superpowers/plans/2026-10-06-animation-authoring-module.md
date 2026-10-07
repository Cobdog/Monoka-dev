# Animation-Authoring Module Implementation Plan (r3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**r3 (2026-10-06):** the five maintainer corrections — (1) inherited requirements inlined (this file is now self-contained; no "same as r1"); (2) test-harness references corrected: `tests/lib/styleSheet.cjs` is plain-Node CSS parsing, NOT a VM harness — TypeScript modules load in vitest through STANDARD imports (vitest's vite/esbuild transform handles `.ts` natively; no `scripts/lib/ts-vm.cjs`), scratch dirs are `TMPDIR=/tmp/anim-<task>` per task, and the zod decision is RESOLVED (hand-rolled guards — no new dependency); (3) Tasks 1–10 restored to executable detail (signatures, files, test behaviors, commands); (4) the mock boundary made explicit: NO mock service that lands candidates — the PRODUCTION completion owner runs against a FAKE ENGINE speaking the ComfyUI HTTP API (`e2e/mirror/fakeEngineServer.mjs`); (5) the shared compiler contract completed: dual-environment build verification, the three typed input contexts (rolling-reference = the ACTUAL current rolling reference, not the span's original endpoint), one return shape.

**Goal:** Build the Creation workstation's animation-authoring module: bind character references, author keyframed motion spans, render through the H3 keyframe adapters (hero/tween/sequence), review candidates, and export an animated sequence.

**Architecture:** A Workbench subview (`/?images=1&view=animation&project=<id>&document=<id>`) over a new `animation_document` + `animation_attempt` schema in the existing SQLite store (migration 006). A server-side rendering service owns job execution and completion landing — built in the foundation (Task 4), never deferred; the browser only observes via the existing realtime fabric (a new `animation` channel on the SAME WebSocket/SSE hub, no second socket). A shared module `shared/animation/` (types + caption compiler + graph builders) is imported by BOTH server (tsc/NodeNext) and client (vite).

**Tech Stack:** React 19 + TypeScript, Vite, zustand, the component-vocabulary kit (`src/ui/*`), better-sqlite3 (existing), the existing realtime hub (`server/realtime.ts` + `src/lib/useRealtime.ts`), vitest (node, pure models only), Playwright (ALL browser behavior). **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-10-06-animation-authoring-module-design.md` — the plan argues from the spec; executors read both. Dialect ground truth: `docs/research/h3-keyframe-animation-assessment.md` §2–3.

## Global Constraints

- **Engine discipline (SAFETY-CRITICAL):** the maintainer's ComfyUI at `127.0.0.1:8188` and the Kreatine testbed at `8189` are OFF LIMITS to every task in this plan. Tasks 1–14 touch NO engine at all — the only rendering counterpart is the FAKE ENGINE (`e2e/mirror/fakeEngineServer.mjs`), a plain node HTTP+ws server. Task 15 (real-engine leg) is engine-dependent work: read `docs/agent/runbook.md` first, bring up 8189 only with the maintainer's knowledge, health-check + VRAM-check before and after, `POST /free` between phases, tear down and verify baseline VRAM. Agents NEVER submit to 8188.
- **No new theming or colors (P02):** every color from an EXISTING token in `src/styles.css`; no new literal font-sizes; the `--text-*` ramp rules. The animation UI composes the component-vocabulary kit — no ad-hoc buttons/chips/dialogs.
- **Components take props, adapters own stores (P07):** `src/animation/*.tsx` components receive data + actions as props; store connections live in `src/animation/state.ts` (the adapter). Nothing in `src/animation/` resolves engine state or orchestrates operations — the server owns execution (spec §10.1).
- **Test placement (P04):** vitest runs `environment: 'node'` — unit suites test PURE models only (guards, store logic against scratch SQLite, compiler output, graph shapes, timeline derivations). EVERY browser-behavior assertion (rendering, focus, picker interaction, stale badges, review flow) is a Playwright test in `e2e/animation.spec.ts`. **Every new unit suite is registered in `scripts/ci-map.cjs` (SUITES + rules) in the SAME commit that creates it** — the ci-map self-test fails CI otherwise. Server-booting/port-drawing suites draw ports from `tests/lib/ports.cjs` (`makePortAllocator('<suite>')`, disjoint range registered in that file) and scratch homes from `tests/lib/scratch.cjs` (`makeScratchDir` + `afterAll(removeAllScratchDirs)`). TypeScript modules (e.g. `shared/animation/*`) load in tests through STANDARD vitest imports — vitest's vite transform compiles `.ts` natively; do NOT route these through `scripts/lib/ts-vm.cjs` (that harness is for legacy client modules and carries ES3 transpile pitfalls that do not apply here).
- **Verification per task:** `pnpm typecheck && pnpm lint && TMPDIR=/tmp/anim-<task-N> pnpm vitest run <suite>` plus the task's scoped Playwright leg (`npx playwright test e2e/animation.spec.ts -g "<test name>"`). Build-dependent suites need the fresh build first (`pnpm build:server` / `pnpm build` — the stale-dist rule). The round gate: `TMPDIR=/tmp/anim-gate pnpm gate`.
- **Commits:** conventional subject + the Flux id parenthetical + `Co-Authored-By: Claude Code <noreply@anthropic.com>` trailer; **commit by PATHSPEC** (`git commit -m "…" -- <paths>`) — never `git add -A` (concurrent agents share this index). Docs-only changes are their own commit. Example: `feat(animation): the domain types + hand-rolled guards (k2q0n9s)`.
- **No new dependencies:** zod is NOT in `package.json` and stays out — validation uses hand-rolled type guards following `server/documents.ts`'s established idiom (`parseJson<T>` + `str`/`num`/`intOrNull` narrowing, schema-version guard classes, `DocumentsRuleError`-style status errors). No lockfile/license-registry work is triggered by this plan. (Decision recorded in Task 1.)
- **The existing realtime fabric carries animation events:** ONE extension point — the channel union gains `'animation'` (`src/types.ts` `RealtimeJsonChannel`, `server/realtime.ts` `SubscribableChannel` + `SUBSCRIBABLE`, hub method `emitAnimation(type, payload)` following the `emitSystem` precedent, and `src/lib/fabricWatch.ts`'s resync list). No separate WebSocket, no second hub, no browser-side landing.
- **Frozen attempts (spec §8.1):** submission persists the full input snapshot (resolved references, binding version, exact caption, compiler version, settings, document revision) BEFORE engine dispatch; later edits become the next draft.
- **Read first:** `docs/agent/testing.md` (settle-or-poll convention — every e2e wait is a bounded wait for a NAMED condition; the shared-home accumulation note). Scratch roots per task: `TMPDIR=/tmp/anim-<task-N>`.

## Review Focus

1. **Duplicate completion lands exactly one candidate** — pinned in Task 4 (unit, fake engine history replay) and Task 10 (e2e).
2. **Selection change during an active render** — the landed result appears as "from an earlier version" (`earlierRevision` provenance), never replaces the new selection. Pinned in Tasks 2 and 4.
3. **Idempotency-key reuse with different inputs rejects with conflict** (409); with identical inputs returns the existing attempt. Pinned in Tasks 2 and 5.
4. **Rolling-reference staleness** — later steps marked stale, previous takes preserved; staleness covers binding, pose-description, intent, AND effective-settings changes, not just image replacement. Pinned in Task 2.
5. **Export with stale-but-usable selections succeeds after acknowledgment** and is recorded stale in the manifest; missing/incompatible media fails loudly; a frozen export is immune to later edits. Pinned in Task 14.

---

## Phase A: Foundation (schema + contracts + completion owner)

### Task 1: The animation domain types + hand-rolled validation guards

**Files:**
- Create: `shared/animation/types.ts` (the shared module's first file — pure TypeScript, no Node/browser APIs)
- Modify: `tsconfig.json` (`include: ["src", "shared"]`), `tsconfig.server.json` (`include` gains `"shared/**/*.ts"`)
- Test: `tests/animation-types.test.js`

**Interfaces (produces — every later task imports these):**

```ts
// shared/animation/types.ts
export type AnimationTool = 'hero' | 'tween' | 'sequence'
export type FacingTerm = 'toward camera' | 'back to camera' | 'screen-left' | 'screen-right'
export type MediumString = 'clean line on white' | 'flat black-and-white animatic' | 'flat cel colour on white'
export type AssetReference = { assetId: string; relPath: string | null; kind: 'image' | 'video' }
export type CandidateProvenance = {
  assetId: string                       // the stable image asset
  sourceTake?: string                   // when extracted from a clip
  sourceFrame?: number
  generatingOp?: string                 // the attempt id when generated
  inputRevisions?: Record<string, string>
}
export type KeyCandidate = {
  id: string                            // UUID
  assetReference: AssetReference
  origin: 'import' | 'hero' | 'frame-promotion' | 'project-asset'
  provenance: CandidateProvenance
  poseDescription: string | null        // follows the candidate (spec §5.1)
  facing: FacingTerm | null
}
export type KeySlot = { id: string; order: number; selectedCandidateId: string | null; candidates: KeyCandidate[]; lock: boolean }
export type TweenStepSlot = { id: string; attempts: string[]; selectedRollingReference: { attemptId: string; frameIndex: number } | null }
export type SessionOverrides = { medium?: MediumString; scene?: string; camera?: { description: string; reason: string } }
export type Span = {
  id: string; fromKeyId: string; toKeyId: string
  intent: { movement: string; preservation: string }
  overrides: SessionOverrides
  stepSlots: TweenStepSlot[]
  stale: boolean; staleReasons: string[]   // e.g. ['binding', 'pose', 'intent', 'settings']
}
export type BindingVersion = {
  version: number; characterDescription: string; referenceAssetIds: string[]
  medium: MediumString; initialKeyAssetId: string; boundAt: number
}
export type BindingInput = { characterDescription: string; referenceAssetIds: string[]; medium: MediumString; initialKeyAssetId: string }
export type EditorialContribution = { id: string; spanId: string; attemptId: string; inFrame: number; outFrame: number; holdDuration: number }
export type AnimationDocumentBody = {
  keys: KeySlot[]; spans: Span[]
  bindingHistory: BindingVersion[]; activeBindingVersion: number
  editorial: EditorialContribution[]
  settings: { outputWidth: number; outputHeight: number; fps: 24; steps: number }
}
export type FrozenAttemptSnapshot = {
  tool: AnimationTool; targetId: string
  references: Array<{ role: 'current-key' | 'rolling-near' | 'fixed-far' | 'window-start' | 'window-end'; assetReference: AssetReference; poseDescription: string | null; facing: FacingTerm | null }>
  caption: string; compilerVersion: string
  settings: Record<string, unknown>; documentRevision: number
}
export type AttemptExecutionState = 'queued' | 'rendering' | 'preparing' | 'ready' | 'failed' | 'cancelled' | 'interrupted' | 'reconciling'

// hand-rolled guards — the server/documents.ts parseJson/str/num idiom, exported for the store + routes + client
export const ANIMATION_MEDIA: readonly MediumString[]              // the fixed set, byte-identical strings
export const FACING_TERMS: readonly FacingTerm[]
export function isUuid(value: unknown): value is string
export function isFacingTerm(value: unknown): value is FacingTerm
export function isMediumString(value: unknown): value is MediumString
export function parseKeyCandidate(value: unknown): KeyCandidate | null
export function parseAnimationDocumentBody(value: unknown): AnimationDocumentBody | null   // null on any malformation — the caller decides 400 vs degrade
export function animationInputHash(snapshot: FrozenAttemptSnapshot): string                 // stable JSON hash for idempotency-key comparison
```

- [ ] **Step 1: Write the failing test** — `tests/animation-types.test.js` (standard vitest imports: `import { … } from '../shared/animation/types'` — vitest compiles the TS natively; no build, no ts-vm). Assertions: (a) `parseAnimationDocumentBody` accepts a fully-populated valid body (UUID strings via `crypto.randomUUID()`) and round-trips every field; (b) it returns `null` for: a non-object, a body whose `keys` is not an array, a candidate with `origin: 'magic'`, a facing outside `FACING_TERMS`, a span referencing a missing key id, a negative `holdDuration`; (c) `isUuid` accepts canonical UUIDv4 and rejects `''`, `42`, `'not-a-uuid'`; (d) `animationInputHash` is stable across key-order permutations of the same snapshot and differs when the caption, a reference assetId, or settings change.
- [ ] **Step 2: Run to verify it fails** — `TMPDIR=/tmp/anim-1 pnpm vitest run animation-types`. Expected: FAIL (module `../shared/animation/types` cannot be resolved).
- [ ] **Step 3: Implement** `shared/animation/types.ts` — the types verbatim above; guards written with the `server/documents.ts` narrowing style (`typeof` checks, no `any`, no casts without a preceding check); `animationInputHash` = sha-256 over a canonical JSON serialization (sorted keys) — implemented with pure string building, NO `node:crypto` import (the module must stay environment-neutral for Task 3's dual-build rule; a tiny local hex-sha256 or a stable non-crypto digest is acceptable — determinism is the contract, not cryptographic strength).
- [ ] **Step 4: Register the tsconfigs + suite in the same breath** — `tsconfig.json` include gains `"shared"`; `tsconfig.server.json` include gains `"shared/**/*.ts"`; `scripts/ci-map.cjs` SUITES gains `'animation-types': { build: null, windows: false, python: false, ffmpeg: false }` plus the rule `{ match: ['shared/animation/types.ts'], suites: ['animation-types'], reason: 'the animation domain types + guards.' }`.
- [ ] **Step 5: Verify pass + both compilers see the module** — `TMPDIR=/tmp/anim-1 pnpm vitest run animation-types` PASS; `pnpm typecheck` (runs BOTH `tsc --noEmit` and `tsc -p tsconfig.server.json --noEmit` — proves the module type-checks under Bundler+DOM AND NodeNext resolution); `pnpm build:server && test -f dist-server/shared/animation/types.js`.
- [ ] **Step 6: Commit** — `git commit -m "feat(animation): the domain types + hand-rolled guards — the shared module's first file (k2q0n9s)" -- shared/animation/types.ts tsconfig.json tsconfig.server.json scripts/ci-map.cjs tests/animation-types.test.js` (message ends with the Co-Authored-By trailer).

**Completion criteria:** the suite green; `pnpm typecheck` green; `dist-server/shared/animation/types.js` emitted; ci-map self-test (`TMPDIR=/tmp/anim-1 pnpm vitest run ci-map`) green.

### Task 2: The animation document store (full lifecycle)

**Files:**
- Create: `server/animation/store.ts`
- Modify: `server/db.ts` (append migration id 6, name `'006-animation-documents'`, `up: upAnimationTables` — the append-only list discipline)
- Modify: `server/documentArchive.ts` (project export/import round-trips animation records + referenced blobs)
- Test: `tests/animation-store.test.js`

**Interfaces (produces):**

```ts
// server/animation/store.ts — imports the domain types + BindingInput from shared/animation/types
export const ANIMATION_SCHEMA_VERSION = 1
export type AnimationDocumentRow = { id: string; projectId: string; name: string; schemaVersion: number; revision: number; body: AnimationDocumentBody; updatedAt: number }
export type AnimationAttemptRow = { id: string; documentId: string; tool: AnimationTool; targetId: string; idempotencyKey: string; inputHash: string; snapshot: FrozenAttemptSnapshot; engineJobId: string | null; execution: { state: AttemptExecutionState; progress?: { value: number; max: number } }; preparation: { state: 'pending' | 'proposed' | 'failed' | 'done'; proposedFrameIndex?: number; error?: string }; result: { candidate: { assetReference: AssetReference; frameCount: number; earlierRevision: boolean } } | null; ownRevision: number }
export class AnimationConflictError extends Error { status = 409 }   // expectedRevision mismatch — carries currentRevision + current document
export class AnimationRuleError extends Error { constructor(message: string, status: 400 | 404) }  // the DocumentsRuleError idiom
export function upAnimationTables(db: Database.Database): void      // migration 006 DDL (below)
export function createAnimationStore(db: Database.Database, options: { appVersion?: string }): {
  createDocument(input: { projectId: string; name: string; binding: { characterDescription: string; referenceAssetIds: string[]; medium: MediumString; initialKeyAssetId: string } }): AnimationDocumentRow
  listDocuments(projectId: string): Array<{ id: string; name: string; updatedAt: number }>
  getDocument(id: string): AnimationDocumentRow | null              // throws CanvasSchemaVersionError on newer (reused from documents.ts)
  // authoring commands — every one transactional, expectedRevision-gated (AnimationConflictError on mismatch), staleness-propagating:
  updateBinding(documentId: string, binding: BindingInput, expectedRevision: number): AnimationDocumentRow       // appends an immutable BindingVersion; marks all spans stale ('binding')
  addKeyCandidate(documentId: string, keyId: string, candidate: KeyCandidate, expectedRevision: number): AnimationDocumentRow
  selectKeyCandidate(documentId: string, keyId: string, candidateId: string, expectedRevision: number): AnimationDocumentRow   // spec §7.2.1 command 1 — refuses locked slots (AnimationRuleError 400)
  setKeyLock(documentId: string, keyId: string, locked: boolean, expectedRevision: number): AnimationDocumentRow
  insertSpan(documentId: string, span: { fromKeyId: string; toKeyId: string; intent: { movement: string; preservation: string }; overrides?: SessionOverrides }, expectedRevision: number): AnimationDocumentRow
  updateSpanIntent(documentId: string, spanId: string, intent: { movement: string; preservation: string }, expectedRevision: number): AnimationDocumentRow  // marks the span + descendants stale ('intent')
  updateDocumentSettings(documentId: string, settings: Partial<AnimationDocumentBody['settings']>, expectedRevision: number): AnimationDocumentRow // marks ALL spans stale ('settings')
  selectRollingReference(documentId: string, spanId: string, attemptId: string, frameIndex: number, expectedRevision: number): AnimationDocumentRow  // §7.2.1 command 2
  selectClipContribution(documentId: string, spanId: string, attemptId: string, inFrame: number, outFrame: number, holdDuration: number, expectedRevision: number): AnimationDocumentRow  // §7.2.1 command 3
  // attempts — separate rows, their OWN revision; completion events are not user edits (spec §11.2):
  recordAttempt(input: { id: string; documentId: string; tool: AnimationTool; targetId: string; idempotencyKey: string; inputHash: string; snapshot: FrozenAttemptSnapshot }): { attempt: AnimationAttemptRow; created: boolean }
  getAttempt(attemptId: string): AnimationAttemptRow | null
  attemptByIdempotencyKey(key: string): AnimationAttemptRow | null
  landCandidate(attemptId: string, candidate: { assetReference: AssetReference; frameCount: number; earlierRevision: boolean }): { attempt: AnimationAttemptRow }  // IDEMPOTENT: a second call for the same attempt is a no-op returning the landed row — exactly one candidate ever (Review Focus #1)
  setAttemptExecution(attemptId: string, execution: { state: AttemptExecutionState; engineJobId?: string; progress?: { value: number; max: number } }): void
  setAttemptPreparation(attemptId: string, preparation: { state: 'pending' | 'proposed' | 'failed' | 'done'; proposedFrameIndex?: number; error?: string }): void
  attemptsInFlight(): AnimationAttemptRow[]                          // recovery sweep input (Task 4)
  attemptByEngineJobId(engineJobId: string): AnimationAttemptRow | null
}
```

Migration 006 DDL (in `upAnimationTables`, the `canvas_*` naming precedent): `animation_document (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, schema_version INTEGER NOT NULL, authored_revision INTEGER NOT NULL, body_json TEXT NOT NULL, app_version TEXT NOT NULL DEFAULT 'unknown', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)` + `animation_attempt (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES animation_document(id), tool TEXT NOT NULL, target_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, input_hash TEXT NOT NULL, snapshot_json TEXT NOT NULL, engine_job_id TEXT, execution_json TEXT NOT NULL, preparation_json TEXT NOT NULL, result_json TEXT, own_revision INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)` + `CREATE UNIQUE INDEX animation_attempt_idem ON animation_attempt(idempotency_key)` + `CREATE INDEX animation_attempt_document ON animation_attempt(document_id)` + `CREATE INDEX animation_attempt_engine_job ON animation_attempt(engine_job_id)`. **Attempts are append-mostly:** the sole UPDATEs are execution/preparation/own_revision/result — enforced by a `BEFORE UPDATE` trigger (the `canvas_take` append-only precedent) that aborts if `id`, `idempotency_key`, `input_hash`, or `snapshot_json` change.

**Landing vs authoring concurrency (the r2 correction, concrete):** `landCandidate` mutates ONLY the attempt row + inserts into the document's `body_json` candidate list WITHOUT touching `authored_revision` — it adds `earlierRevision: true` provenance when the attempt's frozen `documentRevision` is behind the current `authored_revision` (Review Focus #2), and never changes any `selectedCandidateId`.

- [ ] **Step 1: Write the failing test** — `tests/animation-store.test.js` (the `tests/documents.test.js` pattern: `createRequire` shim, `makeScratchDir` home, import `dist-server/server/db.js` + `dist-server/server/animation/store.js` — needs `pnpm build:server` first). Test sections, one `test()` each: **(a)** migration — fresh `migrateDatabase` boot applies id 6; both tables + trigger + indexes exist; the append-only trigger aborts a `snapshot_json` UPDATE. **(b)** CRUD + revision gate — create/list/get round-trip; a command with stale `expectedRevision` throws `AnimationConflictError` carrying the CURRENT document; `selectKeyCandidate` on a locked slot throws `AnimationRuleError` (400) and unlocking then selecting succeeds. **(c)** idempotency — `recordAttempt` twice with the same key + same `inputHash` returns `{ created: false }` and ONE row; (the different-inputs conflict is enforced at Task 5's route — here assert `attemptByIdempotencyKey` exposes the stored hash so the route can compare). **(d)** duplicate landing — `landCandidate` twice ⇒ still exactly ONE candidate in the attempt result and the document body (Review Focus #1). **(e)** concurrency — author a span bump `authored_revision` to N+3 while an attempt frozen at N lands ⇒ candidate present, `earlierRevision: true`, `selectedCandidateId` unchanged, `authored_revision` still N+3 (Review Focus #2). **(f)** staleness — each of `updateBinding`, pose-description change (via `addKeyCandidate` + `selectKeyCandidate` swap), `updateSpanIntent`, `updateDocumentSettings` marks the affected spans `stale` with the matching `staleReasons` entry; previous takes/candidates remain in the body (Review Focus #4). **(g)** the three selection commands mutate exactly their own structures (`selectRollingReference` sets the step slot's pointer; it never creates a key).
- [ ] **Step 2: Verify fail** — `pnpm build:server && TMPDIR=/tmp/anim-2 pnpm vitest run animation-store` ⇒ FAIL (`dist-server/server/animation/store.js` missing).
- [ ] **Step 3: Implement** `server/animation/store.ts` + the `server/db.ts` migration append + the `server/documentArchive.ts` extension (export packs `animation_document`/`animation_attempt` rows + every blob `relPath` referenced by `body_json`/`snapshot_json`/`result_json`; import restores both tables and refuses id collisions loudly — the existing archive idiom).
- [ ] **Step 4: ci-map** — SUITES `'animation-store': { build: 'server', windows: false, python: false, ffmpeg: false }`; rules: `{ match: ['server/animation/store.ts'], suites: ['animation-store', 'animation-rendering', 'animation-routes'], reason: 'the animation store — the rendering/routes suites boot it.' }` and `{ match: ['server/db.ts'], suites: [...existing 'datasets','documents','storage', +'animation-store'], reason: '…migration 006 rides the same list.' }` (edit the existing db.ts rule in place).
- [ ] **Step 5: Verify pass** — `pnpm build:server && TMPDIR=/tmp/anim-2 pnpm vitest run animation-store animation-types ci-map` ⇒ PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(animation): the document store — migration 006, full lifecycle, archive round-trip (k2q0n9s)" -- server/animation/store.ts server/db.ts server/documentArchive.ts scripts/ci-map.cjs tests/animation-store.test.js`.

**Completion criteria:** sections (a)–(g) green; `TMPDIR=/tmp/anim-2 pnpm vitest run documents` still green (migration list append broke nothing); ci-map self-test green.

### Task 3: The shared caption compiler

**Files:**
- Create: `shared/animation/compiler.ts`
- Test: `tests/animation-compiler.test.js`

**Interfaces (produces — consumed by Task 4's server-side authoritative compile, Task 9's client-side live preview):**

```ts
// shared/animation/compiler.ts
import type { FacingTerm, MediumString, AssetReference } from './types'
export const COMPILER_VERSION = '1'
export type PoseRef = { poseDescription: string | null; facing: FacingTerm | null }
export type SessionOverrideInput = { medium: MediumString; scene?: string; camera?: { description: string; reason: string } }
export type CaptionHint = { kind: 'comparative-destination' | 'missing-facing' | 'contradictory-facing' | 'negation'; message: string }

// HERO — one reference: the current key. Movement is a full ARC (start, path, end). No destination image.
export type HeroContext = { currentKey: { assetReference: AssetReference; pose: PoseRef }; movementArc: string; overrides: SessionOverrideInput }
// TWEEN — the ACTUAL current rolling reference (a promoted frame from the LAST landed step — NOT the span's original start endpoint),
// plus the fixed far reference, plus ONE movement step. Both poses carry facing.
export type TweenContext = { rollingReference: { assetReference: AssetReference; pose: PoseRef }; farReference: { assetReference: AssetReference; pose: PoseRef }; movementStep: string; overrides: SessionOverrideInput }
// SEQUENCE — the selected key window's start/end images + poses + the ordered action list + the preservation constraints.
export type SequenceContext = { windowStart: { assetReference: AssetReference; pose: PoseRef }; windowEnd: { assetReference: AssetReference; pose: PoseRef }; orderedActions: string[]; preservation: string; overrides: SessionOverrideInput }

export type CompiledCaption = { caption: string; hints: CaptionHint[]; compilerVersion: string }   // the ONE return shape — both environments, both consumers
export function compileHeroCaption(ctx: HeroContext): CompiledCaption
export function compileTweenCaption(ctx: TweenContext): CompiledCaption
export function compileSequenceCaption(ctx: SequenceContext): CompiledCaption
```

Section order is MECHANICAL (spec §6.3 enforced list): hero = `SCENE` / `MOVEMENT` / `STATIC`; tween = `SCENE` / `FIRST FRAME` / `TARGET END FRAME` / `MOVEMENT` / `STATIC`; sequence = alignment line / `Subject` ("animated on twos") / Action (beat order) / `Preserve`. Medium is always one of the three byte-identical `ANIMATION_MEDIA` strings; `Camera` always carries its reason clause; references are numbered (`Reference 1`, `Reference 2`). The compiler emits NO `landing <progress>` token — Set K measured the lever dead and spec §6.5 bans controls implying generation-time timing. Hints are flagged, NEVER rewritten: comparative destination language in the far pose ("than", "farther", "more than"), missing facing on either frame, facing contradiction between FIRST/TARGET or against the movement's named direction, negation words ("not", "no ", "never", "without") in movement/preservation text.

- [ ] **Step 1: Write the failing test** — `tests/animation-compiler.test.js` (standard vitest import of `../shared/animation/compiler`). One `test()` per behavior: hero caption contains the three sections IN ORDER with the medium string verbatim and `Reference 1` numbering; tween caption contains all five sections in order, FIRST FRAME from `rollingReference.pose` and TARGET END FRAME from `farReference.pose` (assert the ROLLING pose text appears — the anti-original-endpoint guarantee), facing terms rendered per frame; sequence caption renders the alignment line first, actions in the given order, `Preserve` last; hints — a far pose "turned farther than the first frame" yields `{ kind: 'comparative-destination' }` and the caption STILL contains the offending text (flagged, not rewritten); null facing yields `missing-facing`; FIRST `screen-left` + TARGET `screen-left` + movement "turns to face screen-right" yields `contradictory-facing`; "does not look away" yields `negation`; every return has `compilerVersion: '1'`; an unsupported medium string is impossible by type AND rejected at runtime (defensive guard returns a thrown `Error` — the fixed vocabulary is mechanical).
- [ ] **Step 2: Verify fail** — `TMPDIR=/tmp/anim-3 pnpm vitest run animation-compiler` ⇒ FAIL (module missing).
- [ ] **Step 3: Implement** — pure string assembly, zero imports beyond `./types`, zero environment APIs (the dual-build contract).
- [ ] **Step 4 (build verification — BOTH environments, correction #5a):** server leg — `pnpm build:server && test -f dist-server/shared/animation/compiler.js`; type leg — `pnpm typecheck` proves the module passes BOTH `moduleResolution: Bundler` + DOM libs (browser) AND `NodeNext` (server); browser-transform leg — `TMPDIR=/tmp/anim-3 pnpm vitest run animation-compiler` itself runs the module through vite's esbuild transform (the same pipeline `vite build` applies); the full `vite build` bundle proof lands with Task 9 (the first client importer) and the round gate. Record the four checks in the task's commit body.
- [ ] **Step 5: ci-map** — `'animation-compiler': { build: null, windows: false, python: false, ffmpeg: false }`; rule `{ match: ['shared/animation/compiler.ts'], suites: ['animation-compiler', 'animation-rendering'], reason: 'the caption compiler — the rendering suite compiles authoritative captions through it.' }` (amend the Task 1 `shared/animation/types.ts` rule's suites to `['animation-types', 'animation-compiler']` — types feed the compiler).
- [ ] **Step 6: Verify + commit** — `TMPDIR=/tmp/anim-3 pnpm vitest run animation-compiler ci-map` PASS; `git commit -m "feat(animation): the shared caption compiler — hero/tween/sequence, one return shape (k2q0n9s)" -- shared/animation/compiler.ts scripts/ci-map.cjs tests/animation-compiler.test.js`.

**Completion criteria:** suite green; `dist-server/shared/animation/compiler.js` emitted; `pnpm typecheck` green; ci-map green.

### Task 4: The rendering service + the completion owner — production code, proven against the FAKE ENGINE

**The mock boundary (correction #4, explicit):** there is NO mock rendering service and NO test double that "lands candidates" directly. The production completion owner's dispatch, observation, landing, reconciliation, and recovery code paths RUN FOR REAL in every test; the ONLY faked thing is the ENGINE — `e2e/mirror/fakeEngineServer.mjs`, the standing profile-driven stand-in ComfyUI that speaks the real HTTP contract (`/prompt`, `/queue`, `/history`, `/view`, `/interrupt`, `/ws` events, `/__control` failure injection). Task 10's slice and Task 15's real-engine leg swap WHICH engine answers, never WHICH code lands.

**Files:**
- Create: `server/animation/rendering.ts` (the service contract + the ComfyUI-backed implementation)
- Create: `server/animation/completion-owner.ts` (the shared completion infrastructure — engine-agnostic)
- Create: `shared/animation/graphs.ts` (the three tool graph builders — pure, node-and-browser safe)
- Create: `e2e/mirror/profiles/animation-h3.json` (start from `stock-h3.json`; add the keyframe node classes the builders emit as `objectInfoExtras` if the stock capture lacks any — verify against the capture, don't assume)
- Test: `tests/animation-rendering.test.js`

**Interfaces (produces):**

```ts
// server/animation/rendering.ts — spec §7.2's contract, the seam both Task 10 (fake engine) and Task 15 (real engine) sit behind
export type AttemptInput = { documentId: string; tool: AnimationTool; targetId: string; snapshot: FrozenAttemptSnapshot }
export type EnginePort = {
  submitGraph(graph: unknown, attemptId: string): Promise<{ engineJobId: string }>   // the engine request CARRIES the attempt id — reconciliation's search key (spec §11.4)
  interrupt(engineJobId: string): Promise<void>
  history(engineJobId: string): Promise<{ status: 'running' | 'done' | 'error' | 'lost'; outputs?: Array<{ relPath: string; frameCount: number }> } | null>
  view(engineJobId: string, frameIndex: number): Promise<Buffer>                      // the ComfyUI /view implementation; the fake engine answers the same route
}
export type AttemptStateView = { attemptId: string; execution: AttemptExecutionState; progress?: { value: number; max: number }; preparation: { state: 'pending' | 'proposed' | 'failed' | 'done'; proposedFrameIndex?: number }; candidate: { assetReference: AssetReference; frameCount: number; earlierRevision: boolean } | null }
export type AnimationRenderingService = {
  submit(input: AttemptInput, idempotencyKey: string): Promise<{ attemptId: string; created: boolean }>   // resolves when validated + persisted + dispatch intent recorded + enqueued — NOT when the render completes. Same key + same inputHash ⇒ the existing attempt; same key + different inputHash ⇒ AnimationConflictError (409). Validation failure ⇒ structured error, nothing persisted.
  getState(attemptId: string): Promise<AttemptStateView>
  cancel(attemptId: string): Promise<void>
  extractFrame(attemptId: string, frameIndex: number): Promise<AssetReference>   // on-demand path; idempotent by (take, frame, extractionVersion) — spec §11.4
}
export function createAnimationRenderingService(deps: {
  store: ReturnType<typeof createAnimationStore>
  engine: EnginePort
  compile: { hero: typeof compileHeroCaption; tween: typeof compileTweenCaption; sequence: typeof compileSequenceCaption }  // the authoritative server-side compile seam (the shared module)
  emit: (type: string, payload: unknown) => void   // the fabric seam (wired in Task 5; a no-op logger here)
  now?: () => number
}): AnimationRenderingService

// server/animation/completion-owner.ts — the shared landing/recovery machinery (spec §10, §11.4). EVERY recovery rule from §11.4 is code here:
export function createCompletionOwner(deps: { store: ReturnType<typeof createAnimationStore>; engine: EnginePort; emit: (type: string, payload: unknown) => void; prepareFrame: (attemptId: string, frameIndex: number) => Promise<AssetReference>; maxAutoPrepRetries?: number }): {
  observe(attemptId: string): void                                   // engine observation: the server watches history/events, not the browser
  reconcile(): Promise<void>                                         // boot/restart sweep over attemptsInFlight(): reattach (running), land idempotently (done in history), mark interrupted (confirmed lost), NEVER blindly resubmit — uncertain dispatch resolves by attempt identifier search (the engine request carries attemptId; attemptByEngineJobId is the lookup)
  onAttemptEvent(attemptId: string, event: { type: 'progress' | 'executing' | 'done' | 'error' | 'interrupted'; value?: number; max?: number }): void   // drives execution state + landing
  cancel(attemptId: string): Promise<void>                           // races completion: if output already landed it is PRESERVED, never auto-selected
  retryPreparation(attemptId: string): Promise<void>                 // re-prepares the frame WITHOUT re-rendering; bounded auto-retries then explicit action
}

// shared/animation/graphs.ts — pure builders; node classes + operating point from docs/research/h3-keyframe-animation-assessment.md §3
export function buildHeroGraph(snapshot: FrozenAttemptSnapshot, settings: { width: number; height: number; steps: number }): unknown    // MiniMaxH3ImageToVideo — ONE reference (the current key)
export function buildTweenGraph(snapshot: FrozenAttemptSnapshot, settings: …): unknown                                                  // MiniMaxH3ReferenceToVideo — rolling-near + fixed-far
export function buildSequenceGraph(snapshot: FrozenAttemptSnapshot, settings: …): unknown                                                // MiniMaxH3ReferenceToVideo — window endpoints
```

Engine-facing defaults pinned in the builders (from the assessment's operating point): euler/simple, BasicGuider without CFG, shift 12/3, 1344×768, 22 frames (17n+5, n=1), 24 fps, steps 30–50 (the attempt's frozen settings override within these bounds). The `engine` dependency is the ONLY engine-aware seam; its ComfyUI implementation (`/prompt` with the hub's stable clientId, `/history`, `/view`, `/interrupt`) lives in `rendering.ts` and is constructed from a base URL — pointing it at the fake engine's port is the whole test setup.

- [ ] **Step 1: Write the failing test** — `tests/animation-rendering.test.js`: scratch home + `makePortAllocator('animation-rendering')` port; spawn `node e2e/mirror/fakeEngineServer.mjs --port <port> --profile e2e/mirror/profiles/animation-h3.json` (the `e2e/journey.spec.ts` spawn pattern; kill + assert child-exit in `afterAll`); build the store + service + completion owner directly from `dist-server` imports against a scratch SQLite db. Test sections: **(a)** happy path — `submit` resolves immediately with an attemptId; the fake engine received a `/prompt` whose graph uses the right node class for the tool; progress events advance execution state to `rendering`; completion lands ONE candidate with `preparation.state: 'proposed'` and a proposed frame index; **(b)** duplicate completion (Review Focus #1) — drive `onAttemptEvent('done')` twice AND re-run `observe()` after history already holds the output ⇒ still exactly one candidate in the store; **(c)** selection-change race (Review Focus #2) — bump the document's `authored_revision` mid-render, let the attempt land ⇒ candidate carries `earlierRevision: true`, selection untouched; **(d)** idempotent submit — same key + same input ⇒ `{ created: false }`, one engine submission total (count fake-engine `/prompt` receipts); **(e)** failure — `/__control {"failMode":"error"}` ⇒ attempt `failed`, prior candidates preserved; **(f)** cancel race — cancel while the fake engine still completes ⇒ landed output preserved, never selected; **(g)** uncertain dispatch — kill the observation (drop the in-memory watcher, keep rows), call `reconcile()` ⇒ the attempt resolves via `history`/`attemptByEngineJobId` search and lands ONCE — assert the engine's `/prompt` count did NOT increase; **(h)** frame-preparation failure — make `prepareFrame` reject twice then succeed ⇒ bounded auto-retry then success without any new engine submission; **(i)** graph contract-truth — run each builder's output through `validateGraphAgainstSchemas(graph, REAL_INFO)` (import `src/lib/engineContract.ts` + `scripts/fixtures/engine-object-info.json` directly — standard vitest TS import): every emitted input passes the captured engine gate; add any newly emitted node class to the capture list per `docs/agent/testing.md`'s truth-ladder rule.
- [ ] **Step 2: Verify fail** — `pnpm build:server && TMPDIR=/tmp/anim-4 pnpm vitest run animation-rendering` ⇒ FAIL (modules missing).
- [ ] **Step 3: Implement** the three modules; add the profile file if the emitted classes need extras over stock.
- [ ] **Step 4: ci-map + ports** — SUITES `'animation-rendering': { build: 'server', windows: false, python: false, ffmpeg: false }`; append `'animation-rendering'` to `PORT_USERS`; rules `{ match: ['server/animation/rendering.ts', 'server/animation/completion-owner.ts'], suites: ['animation-rendering', 'animation-routes'], reason: 'the rendering service + completion owner.' }` and `{ match: ['shared/animation/graphs.ts'], suites: ['animation-rendering', 'engine-contract'], reason: 'the three tool graph builders — contract-truth walk.' }`.
- [ ] **Step 5: Verify pass** — `pnpm build:server && TMPDIR=/tmp/anim-4 pnpm vitest run animation-rendering animation-store animation-compiler ci-map` ⇒ PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(animation): the rendering service + completion owner, proven against the fake engine — no mock landing path exists (k2q0n9s)" -- server/animation/rendering.ts server/animation/completion-owner.ts shared/animation/graphs.ts e2e/mirror/profiles/animation-h3.json scripts/ci-map.cjs tests/lib/ports.cjs tests/animation-rendering.test.js`.

**Completion criteria:** sections (a)–(i) green; zero engine traffic beyond the spawned fake engine (no 8188/8189 contact — the service only ever sees the injected base URL); ci-map green.

### Task 5: The HTTP routes + the fabric's animation channel

**Files:**
- Create: `server/animation/routes.ts` (a pure handler module — `core.ts` stays the dispatcher)
- Modify: `server/core.ts` (mount the `/api/lan/animation` block beside the documents block, same literal-pathname style; construct the rendering service + completion owner with the live hub as `emit`; run `reconcile()` on boot)
- Modify: `server/realtime.ts` (`SubscribableChannel` + `SUBSCRIBABLE` gain `'animation'`; add `emitAnimation(type: string, payload: unknown)` — the `emitSystem` precedent, one `pushChannel('animation', …)` line)
- Modify: `src/types.ts` (`RealtimeJsonChannel` gains `'animation'`), `src/lib/fabricWatch.ts` (the resync channel list gains `'animation'` — reopen ⇒ animation consumers re-fetch, the R-08 contract)
- Test: `tests/animation-routes.test.js`

**Interfaces (produces — Task 6's client wraps these 1:1):** all under `/api/lan/animation`, the core.ts literal-path style, `sendJson`, and the failure mapping (`AnimationConflictError` → 409 with the current document; `AnimationRuleError` → 400/404 with the reason; `CanvasSchemaVersionError` → 400 loud refusal):

- `GET /api/lan/animation/bootstrap` → `{ schemaVersion, compilerVersion, media, facingTerms, defaults }`
- `POST /api/lan/animation/documents` (create; binding in body) → the document row
- `GET /api/lan/animation/documents?project=<id>` → listing
- `GET /api/lan/animation/document?id=<id>` → the full document + its attempts (the recovery read — durable, not callback-chained)
- `POST /api/lan/animation/binding` — versioned binding update
- `POST /api/lan/animation/keys` — `{ op: 'add-candidate' | 'select' | 'lock' | 'unlock', … , expectedRevision }` (one key-command route, discriminated by `op`, every branch revision-gated)
- `POST /api/lan/animation/spans` — `{ op: 'insert' | 'update-intent' | 'remove', …, expectedRevision }`
- `POST /api/lan/animation/select/key-candidate`, `…/select/rolling-reference`, `…/select/clip-contribution` — the THREE selection commands as distinct routes (spec §7.2.1), each `expectedRevision`-enforced, each emitting `document-changed`
- `POST /api/lan/animation/attempts` — submit; body = attempt input + `idempotencyKey`; the authoritative server-side compile happens HERE (the shared compiler; the compiled caption + compilerVersion go into the frozen snapshot); 200 `{ attemptId, created }` or 409 on key/inputs mismatch (Review Focus #3)
- `GET /api/lan/animation/attempt?id=<id>` → `AttemptStateView`
- `POST /api/lan/animation/attempt/cancel`, `POST /api/lan/animation/attempt/extract-frame`

Fabric events (`emitAnimation`): `attempt-state` `{ documentId, attemptId, execution, progress? }`, `attempt-ready` `{ documentId, attemptId, candidateId }`, `document-changed` `{ documentId, revision, reason }`, `reconciliation` `{ attemptId, outcome }`.

- [ ] **Step 1: Write the failing test** — `tests/animation-routes.test.js` (the `tests/documents.test.js` BOOT pattern: `pnpm build` first, spawn `dist-server/server/index.js` on a `makePortAllocator('animation-routes')` port with a scratch home, drive HTTP + open the fabric WebSocket and collect `animation`-channel envelopes). Sections: **(a)** bootstrap/documents/document round-trip over HTTP; **(b)** revision-gated commands — a stale `expectedRevision` answers 409 WITH the current document; a locked-key select answers 400; **(c)** submit → `attempt-state` envelopes arrive on the `animation` channel (subscribe first, then submit; bounded `expect.poll`-style wait in node via a promise raced with a timeout — the settle-or-poll rule adapted); **(d)** idempotency at the ROUTE — same key + different inputs ⇒ 409 (Review Focus #3), same key + same inputs ⇒ `{ created: false }`; **(e)** the unknown-newer schema version refuses loudly (write a `schema_version: 99` row directly into scratch SQLite, GET the document ⇒ 400 naming the versions); **(f)** boot reconcile — with an in-flight attempt row from a previous "server life" persisted, a fresh boot runs `reconcile()` and the attempt resolves without a second engine submission (fake engine `/prompt` count asserted).
- [ ] **Step 2: Verify fail** — `pnpm build && TMPDIR=/tmp/anim-5 pnpm vitest run animation-routes` ⇒ FAIL (404s — the block is not mounted).
- [ ] **Step 3: Implement** `routes.ts`, the `core.ts` mount, the channel extension in all four files.
- [ ] **Step 4: ci-map** — `'animation-routes': { build: 'full', windows: false, python: false, ffmpeg: false }`; append to `BOOTING` and `PORT_USERS`; rules `{ match: ['server/animation/routes.ts'], suites: ['animation-routes'], reason: 'the animation HTTP block.' }`, `{ match: ['server/realtime.ts'], suites: ['realtime', 'manager-install', 'animation-routes'], reason: 'the fabric — animation channel rides it (extend the existing rule).' }`, `{ match: ['src/types.ts', 'src/lib/fabricWatch.ts'], suites: ['animation-routes'], reason: 'the shared channel union + resync list gained animation.' }`, and `server/core.ts`'s existing seam rule gains `'animation-routes'` in its fan-out.
- [ ] **Step 5: Verify pass** — `pnpm build && TMPDIR=/tmp/anim-5 pnpm vitest run animation-routes realtime ci-map` ⇒ PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(animation): HTTP routes + the fabric's animation channel (k2q0n9s)" -- server/animation/routes.ts server/core.ts server/realtime.ts src/types.ts src/lib/fabricWatch.ts scripts/ci-map.cjs tests/lib/ports.cjs tests/animation-routes.test.js`.

**Completion criteria:** (a)–(f) green; the `realtime` suite still green (channel addition broke no existing subscriber); ci-map green.

### Task 6: The client integration boundary

**Files:**
- Create: `src/animation/client.ts` (the typed HTTP client — thin `fetch` wrappers, one method per route)
- Create: `src/animation/fabric.ts` (the realtime subscription adapter)
- Create: `src/animation/AnimationApp.tsx` (the module shell: document load, the recoverable document-selection state for missing/invalid ids — spec §11.1)
- Modify: `src/images/WorkbenchApp.tsx` (the Workbench host branch — the registry itself is NOT touched: spec §11.1 keeps the `images` id; NO fifth registry entry)
- Test: `e2e/animation.spec.ts`

**Interfaces (produces — every Phase B component consumes these):**

```ts
// src/animation/client.ts
export type AnimationDocumentView = { id: string; name: string; projectId: string; revision: number; body: AnimationDocumentBody; attempts: AttemptStateView[] }
export type AnimationBootstrap = { schemaVersion: number; compilerVersion: string; media: MediumString[]; facingTerms: FacingTerm[]; defaults: { outputWidth: number; outputHeight: number; fps: 24; steps: number } }
// the EDITABLE draft (span intent + resolved references + overrides) — the SERVER compiles + freezes it into a FrozenAttemptSnapshot; drafts never rewrite a running attempt (spec §8.1)
export type DraftInput =
  | { tool: 'hero'; targetKeyId: string; movementArc: string; overrides: SessionOverrideInput }
  | { tool: 'tween'; targetStepSlotId: string; movementStep: string; overrides: SessionOverrideInput }
  | { tool: 'sequence'; windowStartKeyId: string; windowEndKeyId: string; orderedActions: string[]; preservation: string; overrides: SessionOverrideInput }
export const animationApi: {
  bootstrap(): Promise<AnimationBootstrap>
  createDocument(input: { projectId: string; name: string; binding: BindingInput }): Promise<AnimationDocumentView>
  listDocuments(projectId: string): Promise<Array<{ id: string; name: string; updatedAt: number }>>
  getDocument(id: string): Promise<AnimationDocumentView>            // document + attempts, the recovery read
  updateBinding(documentId: string, binding: BindingInput, expectedRevision: number): Promise<AnimationDocumentView>
  keyCommand(documentId: string, op: 'add-candidate' | 'select' | 'lock' | 'unlock', payload: Record<string, unknown>, expectedRevision: number): Promise<AnimationDocumentView>
  spanCommand(documentId: string, op: 'insert' | 'update-intent' | 'remove', payload: Record<string, unknown>, expectedRevision: number): Promise<AnimationDocumentView>
  selectKeyCandidate(documentId: string, keyId: string, candidateId: string, expectedRevision: number): Promise<AnimationDocumentView>
  selectRollingReference(documentId: string, spanId: string, attemptId: string, frameIndex: number, expectedRevision: number): Promise<AnimationDocumentView>
  selectClipContribution(documentId: string, spanId: string, attemptId: string, inFrame: number, outFrame: number, holdDuration: number, expectedRevision: number): Promise<AnimationDocumentView>
  submit(input: { documentId: string; tool: AnimationTool; targetId: string; draft: DraftInput }, idempotencyKey: string): Promise<{ attemptId: string; created: boolean }>  // draft ≠ snapshot: the server compiles + freezes
  attemptState(attemptId: string): Promise<AttemptStateView>
  cancel(attemptId: string): Promise<void>
  extractFrame(attemptId: string, frameIndex: number): Promise<AssetReference>
}   // every mutating method surfaces 409s as a typed AnimationConflict (the client re-reads and rebases — never a silent lost update)

// src/animation/fabric.ts
export type AnimationEvent =
  | { type: 'attempt-state'; documentId: string; attemptId: string; execution: AttemptExecutionState; progress?: { value: number; max: number } }
  | { type: 'attempt-ready'; documentId: string; attemptId: string; candidateId: string }
  | { type: 'document-changed'; documentId: string; revision: number; reason: string }
  | { type: 'reconciliation'; attemptId: string; outcome: string }
  | { type: 'resync'; ch: 'animation' }
export function subscribeAnimationEvents(handler: (event: AnimationEvent) => void): () => void   // delegates to subscribe('animation', …) from src/lib/useRealtime — the EXISTING fabric; no new socket
```

Workbench host branch (exact shape): at the top of `WorkbenchApp`, read `new URLSearchParams(window.location.search)`; when `params.get('view') === 'animation'`, render `<AnimationApp />` (lazy) and return — the image editor never mounts, so its browser queue never loads beside the animation module (spec §11.1). The durable handoff IS a document: the Workbench's exit action calls `animationApi.createDocument` with the prepared binding and navigates to `/?images=1&view=animation&project=<id>&document=<id>` — handoff payloads live in the shared store, never localStorage.

- [ ] **Step 1: Write the failing Playwright test** — `e2e/animation.spec.ts` (built web + server, the `e2e/images.spec.ts` harness pattern): **(a)** navigating `/?images=1&view=animation&project=<id>&document=<missing-id>` renders the recoverable document-selection state (a named heading + a back-to-workbench link — no crash, no blank); **(b)** creating a document through the API then navigating renders the animation shell with the document name; **(c)** `?images=1` WITHOUT `view` still mounts the image editor unchanged (the host branch is inert for the default view — assert an image-editor landmark is visible); **(d)** the fabric adapter — with a submitted attempt in flight (created via API against the booted server's own fake-engine-free path: use a stubbed engine URL to keep it queued), an `animation` envelope flips a data attribute on the shell (`data-attempt-state="<state>"`).
- [ ] **Step 2: Verify fail** — `pnpm build && npx playwright test e2e/animation.spec.ts` ⇒ FAIL.
- [ ] **Step 3: Implement** the three modules + the host branch; `src/animation/state.ts` is NOT yet needed (Phase B introduces it with the first consumer).
- [ ] **Step 4: ci-map** — rule `{ match: ['src/animation/**'], suites: ['animation-timeline-model'], forceE2e: true, reason: 'animation browser modules — e2e owns their behavior; the timeline model is the node-tested pure core.' }` (the rule lands now with its first paths; the timeline-model suite arrives in Task 8 — register the rule then if ci-map's self-test ordering requires the suite to exist first).
- [ ] **Step 5: Verify + commit** — `pnpm typecheck && pnpm lint && TMPDIR=/tmp/anim-6 pnpm vitest run ci-map && npx playwright test e2e/animation.spec.ts` ⇒ PASS; `git commit -m "feat(animation): the client boundary — Workbench view host, typed API, fabric adapter (k2q0n9s)" -- src/animation/client.ts src/animation/fabric.ts src/animation/AnimationApp.tsx src/images/WorkbenchApp.tsx scripts/ci-map.cjs e2e/animation.spec.ts`.

**Completion criteria:** the four e2e tests green; the existing `e2e/images.spec.ts` still green (the host branch changed nothing for `?images=1` alone).

---

## Phase B: The vertical slice (tween lifecycle)

### Task 7: Session binding UI

**Files:**
- Create: `src/animation/BindingPanel.tsx` (props-only component), `src/animation/state.ts` (the zustand document store + adapter — P07: the ONLY module in `src/animation/` that calls `animationApi`/`subscribeAnimationEvents`)
- Test: `e2e/animation.spec.ts` (extend)

**Interfaces (produces):** `BindingPanel({ document, onSubmitBinding, busy, errors })` — reference-image picker (files + project assets via the existing asset surfaces), the character description shown VERBATIM with its bound version, medium as fixed chips (`ANIMATION_MEDIA` — a `ChipGroup` exclusive radiogroup, the kit's selection contract), initial key as an explicit image selection. `state.ts` produces `useAnimationDocument(documentId)` → `{ document, revision, conflict, commands: { updateBinding, … } }` — every command carries the current revision; a 409 sets `conflict` and re-reads (the rebase surface, visible in the UI as a reload notice — never silent).

- [ ] **Step 1 (failing e2e)** — an empty session exposes the missing inputs inline without blocking the rest of the shell; filling the four fields + submit creates the binding (assert the bound version renders); a prepared handoff (document created with binding via API) opens DIRECTLY into the timeline placeholder (Task 8's landmark asserted as present); medium chips behave as an exclusive radiogroup (arrow keys move selection — the kit contract, Playwright-verified).
- [ ] **Step 2/3/4** — verify fail ⇒ implement (kit components only, tokens only) ⇒ `pnpm build && npx playwright test e2e/animation.spec.ts -g "binding"` green.
- [ ] **Step 5: Commit** — `git commit -m "feat(animation): the session binding panel (k2q0n9s)" -- src/animation/BindingPanel.tsx src/animation/state.ts e2e/animation.spec.ts`.

### Task 8: The timeline

**Files:**
- Create: `src/animation/Timeline.tsx`, `src/animation/timelineModel.ts` (pure derivation — the node-testable core)
- Test: `tests/animation-timeline-model.test.js` (node) + `e2e/animation.spec.ts` (extend)

**Interfaces:** `timelineModel.ts` exports `deriveTimeline(body: AnimationDocumentBody): { keys: Array<KeySlot & { candidate: KeyCandidate | null; badge: 'import' | 'hero' | 'frame-promotion' | 'project-asset' | null }>; spans: Array<Span & { fromOrder: number; toOrder: number; nesting: number }> }` — span connectivity (from/to key order), tween-step-slot nesting depth, badge derivation from the SELECTED candidate's origin (origin is per-candidate — the badge follows selection), lock indicator input. `Timeline({ timeline, onSelectKey, onSelectSpan, selectedId })` — image-backed key cards with lock indicators + origin badges, span bars, nested step slots. No permanent differing tile treatments by origin (spec §5.1).

- [ ] **Step 1 (failing unit)** — `tests/animation-timeline-model.test.js`: span ordering follows key `order` (a span from key 3 to key 1 renders `nesting` accordingly); an empty slot (no selected candidate) yields `candidate: null, badge: null`; swapping the selected candidate swaps the badge; step slots nest under their span with stable depth.
- [ ] **Step 2 (failing e2e)** — keys render as image cards (real asset URLs from the seeded document); the lock chip reflects server lock state; selecting a span highlights it and its two endpoint keys; step slots appear inside the span bar.
- [ ] **Step 3/4** — verify both fail ⇒ implement ⇒ `TMPDIR=/tmp/anim-8 pnpm vitest run animation-timeline-model` + `npx playwright test e2e/animation.spec.ts -g "timeline"` green.
- [ ] **Step 5: ci-map** — `'animation-timeline-model': { build: null, windows: false, python: false, ffmpeg: false }` + the Task 6 `src/animation/**` rule (suite now exists).
- [ ] **Step 6: Commit** — `git commit -m "feat(animation): the timeline — unified keys, spans, nested step slots (k2q0n9s)" -- src/animation/Timeline.tsx src/animation/timelineModel.ts scripts/ci-map.cjs tests/animation-timeline-model.test.js e2e/animation.spec.ts`.

### Task 9: The span inspector (tween) — the compiler's client home

**Files:**
- Create: `src/animation/SpanInspector.tsx`
- Modify: `src/animation/state.ts` (span-intent commands + the live preview selector)
- Test: `e2e/animation.spec.ts` (extend)

**Interfaces:** `SpanInspector({ span, fromKey, toKey, rollingReference, onIntentChange, onSubmit, busy })`. The two key images + their pose descriptions (bound to the SELECTED candidates — pose follows the image, spec §5.1), facing pickers (`ChipGroup` over `FACING_TERMS`), free-text movement + preservation, inherited medium/scene/camera with override chips, and the collapsed **"View caption"** preview compiled CLIENT-SIDE through `compileTweenCaption` (the shared module's first browser import). The preview shows EXACTLY what submission freezes: rolling-near pose = the CURRENT rolling reference's pose (the last landed step's promoted frame — the anti-frozen-endpoint guarantee, spec §6.4), far pose = the fixed far reference. Hints render as advisory rows — never rewrites. Raw caption editing is OUT (spec §6.3).

- [ ] **Step 1 (failing e2e)** — editing movement text updates the caption preview within a bounded named-condition wait (debounced recompute); selecting a different rolling reference changes the FIRST FRAME section text (assert the new pose string appears in the preview — the rolling-reference contract); a comparative far-pose description surfaces the hint row without altering the preview text; submitting freezes the caption (the attempt view from the API contains the previewed caption verbatim + `compilerVersion`).
- [ ] **Step 2 (browser bundle proof — completes Task 3's dual-build)** — `pnpm build:web` succeeds with the shared module in the client graph (the vite chunk containing the compiler is emitted; note the chunk in the commit body).
- [ ] **Step 3/4** — verify fail ⇒ implement ⇒ `pnpm build && npx playwright test e2e/animation.spec.ts -g "inspector"` green.
- [ ] **Step 5: Commit** — `git commit -m "feat(animation): the span inspector with live compiled caption preview (k2q0n9s)" -- src/animation/SpanInspector.tsx src/animation/state.ts e2e/animation.spec.ts`.

### Task 10: The review panel + the wired vertical slice

**The mock boundary, again (correction #4):** this slice runs the PRODUCTION completion owner end to end; the ONLY test double is the FAKE ENGINE (`fakeEngineServer.mjs` spawned by the spec on an allocated port, the server's `comfyUrl` pointed at it via the scratch home's settings — the `e2e/journey.spec.ts` pattern). No route, service, or landing path is stubbed.

**Files:**
- Create: `src/animation/ReviewPanel.tsx`
- Modify: `src/animation/state.ts` (attempt observation: `subscribeAnimationEvents` drives the status vocabulary; recovery on mount via `attemptState` — durable, not callback-chained)
- Test: `e2e/animation.spec.ts` (extend — the slice)

**Interfaces:** `ReviewPanel({ attempt, onSelectFrame, onContinue, onRetryPreparation })` — the §7.3 status vocabulary (Queued / Rendering / Preparing review / Ready to review / Failed or canceled — mapped from `AttemptStateView`), clip display, the PROPOSED frame preselected but inspectable, explicit frame selection (the on-demand extraction path), and the explicit Continue action (dependent advancement is always a user action — spec §7.1).

- [ ] **Step 1 (failing e2e — THE slice, spec §12.2):** bind two keys → author one tween span → submit → the timeline keeps the selected sequence visible with the running attempt attached → LEAVE the surface (navigate to the canvas) → the fake engine completes while the user is away (bounded wait on the attempt row via the API — the server landed it with NO browser attached) → RETURN → the session restores and highlights "Ready to review" → review the clip → select a reference frame (explicit) → Continue is enabled only after selection. Assert throughout: the landed candidate never changed any selection by itself.
- [ ] **Step 2 (failing e2e — duplicate completion at the surface):** force a duplicate `attempt-ready` (submit again with the same idempotency key + inputs from a second tab context) ⇒ the review panel still shows exactly ONE candidate (Review Focus #1 at the UI).
- [ ] **Step 3/4** — verify fail ⇒ implement ⇒ `pnpm build && npx playwright test e2e/animation.spec.ts -g "review|slice"` green; teardown asserts the fake-engine child exited (never orphaned).
- [ ] **Step 5: Commit** — `git commit -m "feat(animation): the review panel + the wired vertical slice, fake-engine backed (k2q0n9s)" -- src/animation/ReviewPanel.tsx src/animation/state.ts e2e/animation.spec.ts`.

**Integration gate:** the vertical slice must be green here before ANY Phase C task starts. Task 15 may begin in parallel with Phase C, but only after this gate.

---

## Phase C: Broadening (interface/dependency/acceptance summaries)

### Task 11: The hero tool
**Dependencies:** Tasks 7–10. **Interfaces:** reuses `submit` with `tool: 'hero'`; the hero review selects a frame (the ReviewPanel contract); acceptance via `selectKeyCandidate` + the far-reference binding for the incoming span. **Acceptance:** hero generates a candidate clip from the current key (fake engine, production path); the user selects a frame; the accepted key becomes the far reference for the incoming span; the hero caption (3 sections, one reference, full arc) round-trips through the frozen snapshot.

### Task 12: The sequence tool
**Dependencies:** Tasks 7–10. **Acceptance:** sequence renders a selected key window (window-start/window-end references, `orderedActions`, `preservation`) with the alignment/ordered-action/preservation caption; window selection is explicit; the attempt targets the window snapshot.

### Task 13: Editorial timing
**Dependencies:** Tasks 7–10. **Acceptance:** clip-portion selection (start-inclusive/end-exclusive integer frames via `selectClipContribution`), held-frame duration, contribution reordering (an editorial-list command, revision-gated), assembled-sequence preview. These are assembly decisions — no generation-time promises (spec §9).

### Task 14: Export
**Dependencies:** Task 13. **Acceptance:** the export snapshot freezes BEFORE assembly; stale-but-usable selections export after explicit acknowledgment and are recorded stale in `manifest.json`; missing or incompatible selected media fails LOUDLY (named media in the error, never a silent drop); a frozen export is immune to later selection changes (re-export compares bytes). Deliverable: a ZIP with `sequence.mp4` (silent H.264, constant 24 fps, document dimensions) + `manifest.json` (versioned assembly recipe, source ids + hashes, frame ranges, holds, binding history, contributing attempt snapshots + lineage) — spec §11.3. Review Focus #5's tests land here.

### Task 15: The real-engine leg
**Dependencies:** Task 4 (the completion owner), Task 10's gate. **Scope:** the real engine answers behind the SAME `AnimationRenderingService` — swap the engine base URL, never the landing code. Work: (a) contract-truth hardening — the three graph builders already pass `validateGraphAgainstSchemas` (Task 4); ledger-or-fix any divergence; (b) execution truth — engine-dependent verification on the 8189 testbed per `docs/agent/runbook.md` (health-check + VRAM baseline before/after, `POST /free` between arms, teardown verified; the maintainer's workload wins the GPU); (c) recovery — engine-restart reconciliation (reattach, land from history, mark interrupted on confirmed loss), uncertain-submission resolution by attempt-ID search; (d) the §12.4 release gate's integrity conditions. **Acceptance:** real renders land through the completion owner exactly as fake-engine renders did; recovery from restart reconciles without duplicate candidates or resubmissions; the release gate holds.

### Task 16: The acceptance sweep
**Dependencies:** all prior tasks. **Acceptance:** mechanical greps (no new color/font-size literals in `src/animation/**`; no `localStorage` handoffs; no second WebSocket); `TMPDIR=/tmp/anim-gate pnpm gate` (license audit, fresh builds, server smoke, full unit suite, e2e, vision capture) with the tail quoted; the animation surface registered in the vision scenario list (`scripts/vision-e2e/scenarios.ts`) with rubric; both CI legs deliberately dispatched (run links recorded); Flux closure through the done-gate with the evidence summary.

---

**Self-review (r3):** Correction 1 → Global Constraints fully inlined (engine ports, P02, P07, P04 + ci-map, PATHSPEC/conventional commits with `(k2q0n9s)`, per-task verification commands, no-new-deps) and concrete store/route/compiler requirements restored (Task 2's full method surface + migration 006 DDL; Task 5's complete route + event list; Task 3's full contract) — no "same as r1" anywhere. Correction 2 → styleSheet.cjs reference removed; standard vitest imports stated per suite with rationale; `TMPDIR=/tmp/anim-<task>` throughout; zod DECIDED (absent from package.json → hand-rolled guards per `server/documents.ts`'s `parseJson`/`str`/`num` idiom, Task 1, zero lockfile/license work). Correction 3 → Tasks 1–10 carry signatures, exact file paths, per-test behavior descriptions, exact commands, completion criteria, commit messages; 11–16 stay summaries. Correction 4 → the mock boundary stated twice by name (Tasks 4 and 10): production completion owner + fake engine (`e2e/mirror/fakeEngineServer.mjs`, the journey.spec precedent); no mock landing service exists in any file list. Correction 5 → Task 3's Step 4 is the dual-build verification (tsc emit + both tsconfig resolutions + vite-transform via vitest + Task 9's bundle completion); the three typed contexts match the correction exactly (TweenContext.rollingReference = the ACTUAL current rolling reference); the single return shape `{ caption, hints, compilerVersion }`. Review Focus #1→Tasks 4(d)/(b), 2, 10; #2→Tasks 2(e), 4(c); #3→Tasks 2(c), 5(d); #4→Task 2(f); #5→Task 14. Type consistency: `AnimationDocumentRow`/`AnimationAttemptRow` (store) vs `AnimationDocumentView` (client) named distinctly; `FrozenAttemptSnapshot` flows Task 1→2→4→5; `CompiledCaption` flows Task 3→4(compile seam)→5(authoritative compile)→9(preview); `AttemptStateView` flows 4→5→6→10. Every suite created has a same-commit ci-map row. No placeholders: each step names its assertions or commands.
