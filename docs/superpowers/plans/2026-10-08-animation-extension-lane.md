# The Animation Extension Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the animation extension lane per the approved spec r3 (docs/superpowers/specs/2026-10-08-animation-extension-lane-design.md): explicit Extend actions on landed tween-lane clips continue motion into new time through Motion Context tail conditioning, with an owned carry artifact, fail-closed compatibility, window-slot document semantics, and the v1 shipping gates.

**Architecture:** An increment on the animation module's standing architecture — the same store/rendering/routes/client seam, the same frozen-attempt and selection doctrines. New: a continuation artifact seam (in-graph Save → owner discovery/verification/registration → two-readiness landing), a typed continuation binding with window slots and source-attempt-edge traversal, content-identity compatibility, and the Extend interaction.

**Tech Stack:** unchanged — React 19 + TypeScript, Vite, zustand, the component-vocabulary kit, better-sqlite3 (migration 007), the existing realtime fabric, vitest + Playwright, the fake engine as the only test double. **No new dependencies.**

**Spec:** docs/superpowers/specs/2026-10-08-animation-extension-lane-design.md (r3, approved for planning 2026-10-08). The recipe values (§9) arrive from the running probes; the plan marks every probe-gated value.

## Global Constraints (inherited, binding)

- **Engine discipline:** 8188 off-limits always; 8189 per docs/agent/runbook.md (PID recorded, no --disable-dynamic-vram, /free between phases, teardown verified; the maintainer's runs win; a peer session's idle 8189 is used-as-found, never fought over). Tasks 1-7 touch NO engine — fake engine only. Task 8 runs the real-engine gates (controller-supervised).
- **P02/P07/P04 + ci-map + PATHSPEC commits + no-new-deps:** exactly as the module plan's Global Constraints (docs/superpowers/plans/2026-10-06-animation-authoring-module.md) — every new suite registered in scripts/ci-map.cjs same-commit; conventional subjects + `(k2q0n9s)` + the Co-Authored-By trailer; ports from tests/lib/ports.cjs; scratch from tests/lib/scratch.cjs.
- **The frozen-attempt contract is absolute:** rebind edits the document/draft and produces a NEW attempt; an existing attempt's frozen source, caption, recipe, or provenance never change (spec §5, the maintainer's clarification).
- **The mock boundary:** the production completion owner runs for real everywhere; the ONLY double is the fake engine (extended per Task 1 to model the save tail).

## Review Focus

1. **The carry handoff** — a separate-submission Extend works from the registered artifact; eviction between preflight and dispatch refuses by name with the clip playable; no path re-executes the source graph.
2. **Readiness independence** — a carry failure never delays or blocks playable landing; the two retry shapes are distinct (file-exists → register-retry; no-file → the named condition).
3. **The ancestry mismatch** — a reselected ancestor produces the named stale/mismatch state, never a silently assembled preview; alternatives never invalidate.
4. **Digest fail-closure** — weights replaced under an unchanged filename refuse; missing identity evidence refuses; the target's resolved configuration is compared against the binding's frozen identities.
5. **The coordinate chain** — a second extension from an extension carries the generated/trim/delivered mapping correctly; editorial trims never touch it.

---

## Phase A — the carry seam (the v1-gated contract)

### Task 1: The continuation artifact — the in-graph save tail, the deterministic receipt, and the fake-engine model

**Files:** shared/animation/types.ts (the artifact types), shared/animation/graphs.ts (the save tail), server/animation/rendering.ts (discovery/verification), e2e/mirror/fakeEngineServer.mjs + profiles/animation-h3.json (the save model), tests/animation-rendering.test.js.

**Interfaces (produces):**

```ts
// shared/animation/types.ts
export type ContinuationArtifactRecord = {
  artifactId: string                    // UUID
  sourceAttemptId: string
  digest: string                        // sha256 of the saved file bytes
  saveRecipeVersion: string             // the pack's save format version
  producedAt: number
}
// The deterministic receipt contract: the graph's Save node writes to a
// path DERIVED from the attempt id (engineOutputCarryPath(attemptId));
// the owner verifies the file at that path post-landing — the "receipt"
// is the deterministic path + the digest verification, not a history
// payload (the Save node returns no UI output; spec §7).
export function engineOutputCarryPath(attemptId: string): string
```

- The tween builder (and only the tween builder, per the adapter scope) emits the pack's Save node writing to the deterministic path when a `carry: true` build flag is set (the source render carries; a plain render doesn't).
- The fake engine's save model: when the submitted graph contains the save node, the engine writes a synthetic carry file at the deterministic path under its output dir (profile-driven size/shape) — the real engine's behavior modeled, never assumed elsewhere.
- **Tests:** (a) the builder's save tail validates through the contract-truth walk; (b) a landed carry render leaves the file at the deterministic path and the owner's digest verifies; (c) a render without the flag writes nothing.

### Task 2: The readiness split — discovery, registration, and the two retry shapes

**Files:** server/animation/rendering.ts, server/animation/completion-owner.ts, server/animation/store.ts (the artifact record + readiness fields), src/animation/client.ts (the view mirror), tests/animation-rendering.test.js + tests/animation-store.test.js.

**Interfaces:** `AttemptStateView` gains `continuation: { state: 'absent' | 'registering' | 'ready' | 'unavailable' | 'not-produced'; artifact?: { artifactId: string; digest: string } }`. The owner, after media landing: discovers the deterministic path → digests → registers the blob + the ContinuationArtifactRecord → `continuation-ready`. **Playable lands FIRST and independently** (spec §7): a carry failure never blocks the standing ready transition. Retry shapes: file-exists-but-registration-failed → `registering` retries (no re-render, the frame-preparation pattern, bounded then explicit); no-file-produced → `not-produced` (terminal for that attempt; the named condition; playable preserved). `unavailable` = the registered artifact later fails to resolve (digest miss at preflight/dispatch).

**Tests:** (a) the happy split (media ready while registering; then continuation-ready); (b) registration failure with the file present → bounded retries → explicit action; (c) the no-file case → `not-produced`, playable, no re-render ever; (d) the eviction case — the artifact removed post-registration → preflight AND dispatch refuse by name with the clip playable.

### Task 3: Content identities — the digesting seam and fail-closed compatibility

**Files:** server/animation/models.ts (digesting + the identity cache), server/animation/rendering.ts (the checks), shared/animation/types.ts (the identity types), tests/animation-rendering.test.js.

**Interfaces:**

```ts
// server/animation/models.ts
export type ModelContentIdentity = { name: string; digest: string; bytes: number }
export async function resolvedIdentities(enumerations, overrides): Promise<ModelContentIdentity[]>  // digest the RESOLVED weights (cache by name+mtime; missing-evidence ⇒ the named refusal)
```

The source fingerprint (spec §6): layout/geometry/length + the identities + the state convention + adapter identity. The **target-execution comparison** at dispatch: the target's freshly resolved identities vs the binding's frozen identities — drift refuses naming the artifact. The fake engine's enumeration serves digests (or withholds them — the missing-evidence refusal leg).

**Tests:** (a) identical identities pass; (b) same-name-different-digest refuses by name (the aliased-weights case); (c) missing digest evidence refuses (never a name-only pass); (d) the target-vs-binding comparison fires at dispatch, not just source-vs-record.

## Phase B — the document model

### Task 4: Windows, bindings, selection, staleness, and rebind-as-new-attempt

**Files:** shared/animation/types.ts, server/animation/store.ts (+ migration 007's additive columns/tables), server/animation/routes.ts (the command routes), tests/animation-store.test.js + tests/animation-routes.test.js.

**Interfaces:**

```ts
export type WindowSlot = { id: string; order: number; attempts: string[]; selectedCandidateId: string | null; lock: boolean }
export type ExtensionChain = { rootAttemptId: string; windows: WindowSlot[] }   // the chain record, owned by the document
export type ContinuationBinding = {                    // the frozen record (spec §5, verbatim fields)
  sourceAttemptId: string
  windowCoordinates: { generatedStart: number; generatedEnd: number; phase: string }
  headTrim: number
  deliveredRange: { start: number; end: number }       // + the explicit d ↔ g = d + trim mapping
  artifact: { artifactId: string; digest: string }
  recipe: { mode: string; contextLength: number; schedule: unknown; steps: number; seed: number; recipeVersion: string }
  modelIdentities: ModelContentIdentity[]
  conditioning: { caption: string; compilerVersion: string; referenceAssetIds: string[] }
}
```

Store commands (all transactional, expectedRevision-gated): `createWindowSlot`, `selectWindowCandidate` (the lock-guarded selection family), `rebindContinuation` (an explicit document mutation producing the NEXT attempt's binding — never editing a frozen attempt), and the staleness rules: **alternatives never invalidate; selected-ancestry changes and authored-input changes mark affected descendants stale** (reason `ancestry` / `intent`), takes preserved. The mismatch derivation: `chainMismatch(chain)` walks source-attempt edges (Task 6 consumes it).

**Tests:** (a) the slot lifecycle + selection truth; (b) adding an unselected alternative marks NOTHING stale; (c) an ancestor reselection marks descendants stale without rebinding; (d) rebind produces a new attempt with the old ones byte-unchanged; (e) the archive round-trip carries chains + bindings + artifacts.

### Task 5: The Extend submission — the route, the frozen record, the coordinate mapping, and the time-shifted caption

**Files:** server/animation/routes.ts, shared/animation/compiler.ts (the extension context — COMPILER_VERSION '3' if the caption shape changes, else a parameterized tween context), shared/animation/graphs.ts (the conditioning build), tests/animation-routes.test.js + tests/animation-compiler.test.js.

**Interfaces:** `POST /api/lan/animation/extend` — body: the source attempt, the target window length (validated against the OVERLAP RECIPE, never the source's length — spec §6), the motion draft, the idempotency key. The route: preflight (compatibility Task 3 + collisions + carry availability) → freeze the full ContinuationBinding incl. both coordinate systems and the mapping → dispatch. Collision preflight: anchors that would be dropped in the pinned region refuse NAMING the anchor. The compiled caption carries the prompt-time shift (the sampled window's time base).

**Tests:** (a) the happy freeze (every §5 field present; both counts frozen); (b) target-length freedom (22→56 legal; recipe violations refused); (c) the collision refusal naming the anchor; (d) the second-extension coordinate chain (an extension OF an extension freezes the correct generated-coordinates reference); (e) the probe-gated recipe values marked PROBE in the constants with their fallbacks.

## Phase C — the surfaces and the gates

### Task 6: The client — the Extend interaction, the carry preview, the mismatch state, retry vs new-alternative

**Files:** src/animation/ReviewPanel.tsx (or a new ExtendPanel.tsx), src/animation/state.ts, src/animation/timelineModel.ts (the chain traversal), src/animation/client.ts, e2e/animation.spec.ts.

**Interfaces:** the Extend action on landed tween takes (disabled with named reasons when not continuation-ready); the carry preview (generated vs delivered counts, the pinned tail's frame range in source coordinates, the prompt-time shift disclosure); the preflight verdicts inline; the chain surface on the timeline (window slots in order, per-slot selection, the takes strip per window); **the assembled-preview traversal follows source-attempt edges** — `chainMismatch` non-null ⇒ the named stale/mismatch banner with the two explicit resolutions (reselect compatible ancestry / explicitly rebind), never a silent assembly; re-roll split: Retry (identical) vs New alternative (the explicitly-changed-seed command).

**Tests (e2e):** (a) the full interaction (preview math → preflight → submit → review on the window slot); (b) the mismatch case (reselect the ancestor, the banner, both resolutions); (c) retry vs new-alternative on the wire; (d) the assembled preview honors one selected path.

### Task 7: The acceptance sweep + the real-engine gates

**Files:** scripts/ci-map.cjs (registrations), e2e/animation.spec.ts (the sweep), the gate driver under test-results/experiments/extension-gate/.

The mechanical sweep (greps, the full pnpm gate, vision registration if a new capture is warranted, both CI legs) — the module's Task-16 pattern. **The real-engine gates (controller-supervised, per spec §7's v1 acceptance):** (1) Save/Load parity — the saved artifact reloaded into a second submission reproduces the in-graph carry within the probe's tolerance; (2) receipt discovery — the studio registers the saved file through the deterministic-path contract on the real engine; (3) continuation after a completed-source restart — engine + studio restarted between landing and Extend, the carry works; (4) the eviction case live; (5) **the second-extension handoff** on the real engine. Plus the maintainer's §9 acceptance of the tuned recipe (the probes' numbers presented for the explicit decision) — shipping gated on all of it.

---

**Self-review:** every spec section maps to a task (§4→6, §5→4/5, §6→3/5, §7→1/2/7, §8→2, §9→5/7+probes, §10→5, §11→the constraints, §12→this plan's method, §13→the Review Focus). The v1 shipping gates are Task 7's real-engine legs + the recipe acceptance. Probe-gated values appear only as marked constants with fallbacks. The inherited constraints are restated, not re-derived. No placeholders: every task names its files, interfaces, and test behaviors.
