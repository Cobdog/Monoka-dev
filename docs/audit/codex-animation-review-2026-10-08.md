# Codex review charter — the animation-authoring module and its post-review program

**Date:** 2026-10-08 · **Tree:** `e109bf1` on `main` (pushed) · **Round:** the
animation-authoring module (16 plan tasks + a controller fix task) and the
three-wave response to the live independent review.

## §1 — What this is and the scope of your pass

The animation-authoring module is the Creation workstation's first
animation surface: bind character references, author keyframed motion
spans, render through the MiniMax-H3 keyframe adapters (hero / tween /
sequence), review candidates, time the edit, and export one sequence with
provenance. The binding spec is
`docs/specs/2026-10-06-animation-authoring-module-design.md`; the plan is
`docs/superpowers/plans/2026-10-06-animation-authoring-module.md` (r3).

**Review range:** `451694c..e109bf1` — the module's every commit. You may
also weigh the vocabulary-round groundwork it composes, but findings
should concern this range.

**Your deliverable:** findings ranked Critical / Important / Minor, each
with `file:line` and a concrete failure scenario (inputs/state → wrong
behavior). Not a summary of the architecture — a defect hunt. Do not fix
anything; do not re-litigate §6's settled rulings (you may FLAG a ruling's
consequences, not the ruling).

## §2 — The build program and its review coverage

The module was built subagent-driven: **every task** got a fresh
implementer and a blind reviewer, fix rounds to APPROVED/ADDRESSED-ALL,
plus a foundation contract review, a whole-branch review, and three
post-live-review waves each with their own blind review + fix round. The
complete record — every verdict, ruling, and carried concern — is the SDD
ledger at `.superpowers/sdd/2026-10-06-animation-authoring-module/progress.md`
(per-task reviews, briefs, and reports sit beside it). What this means for
you: single-task correctness has been adversarially covered many times.
**Your highest value is where no reviewer has stood twice: the cross-wave
and cross-task seams, and anything the per-task reviews structurally could
not see** (the history-tuple mirror-universe bug and the React
duplicate-key reconciler bug were both exactly that class).

## §3 — The live independent review and the three-wave response

An independent live review (`/tmp/monoka-verification/review.md`, quoted
throughout the ledger) ran the module against the real 8189 engine and a
32-checkpoint UI pass. Its verdict: do not close the real-render release
gate (two pinned model names the install doesn't serve) plus two Highs and
six Mediums. The response, in the reviewer's own recommended order:

- **Wave 1** (`4f5fff1`, `8ed4715`, `977b71a`): registry-driven model
  resolution through the engine's own `/object_info` enumeration (explicit
  preference ladder; submit-time preflight 400 when reachable; durable
  named failure when not; NO new universal hardcode), the complete frozen
  execution config (dispatch/recovery build only from the frozen
  snapshot), durable sanitized `failureReason` with the failed/canceled
  split, and the §11.4 delivery-verdict narrowing (never-delivered may
  redispatch; uncertain returns to `interrupted`).
- **Wave 2a** (`a456d7c`, `faa4732`, `b666764`): image-bound pose/facing
  annotation for rolling references (explicit, inspectable, correctable —
  never inferred) and authored preservation compiled into the tween
  caption (COMPILER_VERSION 2; frozen attempts keep their frozen v1
  captions byte-identically).
- **Wave 2b** (`1f9621c`): the bound-session candidate strip (import rides
  add-candidate only — §5.3 structurally enforced), the explicit
  Update-binding surface, T7-M1 (confirm-only description + a labeled
  session-local override latch), T10-M4 (a re-roll landing preserves the
  review position; a dismissible new-result chip; selection stays
  explicit), and a real React duplicate-key reconciler bug fixed
  (three sibling panels shared one key — prod builds silently appended
  mounts every commit; the repo-wide sibling-key audit came back clean).
- **Wave 3** (`c377900`, `1c0a15e`, `58a3444`, `e109bf1`): the desktop
  stage layout per the live review's prescription (side-by-side
  review/inspector panes ≥1440px, timeline retained, one chosen tool,
  deliberate 1280×800 collapse), kit button geometry on all 23 primary
  actions, implementation prose folded into expandable diagnostics,
  one-key-per-import-batch semantics with an honest stop-on-first-failure
  partial, the landed-gated new chip, and the latch reset on re-pick.

## §4 — The real-engine gate (what is PROVEN, on the unmodified build)

The §12.4 release gate ran on tree `977b71a` against the canonical
ComfyUI 0.39.0 at 8189, all three lanes: tween step 1 and step 2 (the
promoted-frame near reference, submitted after a Studio restart
mid-render — reconciled and landed), hero (rendered + accepted), sequence
(rendered; document revision unmoved). Evidence (driver + JSON:
`/tmp/monoka-gate/`): model resolution proven at the engine (the flat
ref2va + the maintained clip rung, every lane's graph verified against the
live enumeration; the dead pins appear nowhere); the five-entry history
tuple with the attempt marker at `[3]`; frame extraction MD5-identical to
independent ffmpeg; exactly one engine execution marker per attempt
(1/1/1/1), restart included; H.264 1344×768 24fps 22-frame clips. Engine
torn down, GPU returned to baseline. **The live review's release blocker
is closed on the shipped build.**

## §5 — CI state

Both legs green at `75fb88f` and `bb40043` during the round; the closing
runs on `e109bf1` are recorded in the ledger (full + Windows engine).
If a leg is red at review time, that is a finding — the tree claimed
green.

## §6 — Settled rulings (do not re-litigate)

1. **§11.4 redispatch**: provably-never-delivered dispatches redispatch
   from the frozen config; uncertain ones return to `interrupted`
   (adjudicated by the whole-branch review; the delivery verdict is
   persisted at the send boundary).
2. **The model-resolution ladder**: override > pinned default >
   documented preferences (incl. the maintainer's clip rung) >
   deterministic pattern ladders > the named refusal. Enumeration is
   preference, never proof; no readability probing (a deliberate scope
   cut).
3. **Maintainer verdicts, 2026-10-07**: T10-M4 preserve-review-position
   (adopted); T7-M1 confirm-only + labeled override (adopted); authored
   preservation APPENDS to the tween STATIC (compiler v2, frozen v1 rows
   replay byte-identically); the real-engine gate covers all three lanes
   (done, §4).
4. **Span-level (not slot-level) annotation staleness**: the schema's only
   surface; the UI reads it honestly with takes preserved.
5. **The export gate/preview share one edge derivation**
   (`shared/animation/assembly.ts`); the unlanded class is deliberately
   unshared.
6. **Hard-stop batch import** (stop at first failure, name the partial):
   upheld as the minimal honest surface over continue-collecting.

## §7 — The accepted-residue ledger (known, judged, not fixed)

None load-bearing; each has a ruling in the SDD ledger: the preview/gate
totals divergence on refused/unlanded entries (strictly conservative,
display-only); server-sourced `§` citations riding failureReason/commandError
(client-side stripped); the dispatchVerdict dropped by unrelated
reconciling writes (always conservative — never a GPU repeat); the
crash-window stale verdict; connect-refusal-at-send classified uncertain
(merely conservative); the reconciliation fabric envelope emitted+parsed
but unconsumed; the vitest direct-import chain loading better-sqlite3's
native binary (verified side-effect-free); the M-4 parked-settle race
unpinned; rule-0 position permanence until reload; the hero-1080p vision
capture scrolled past its tool bar and no capture showing the populated
creative loop (no engine in the vision project — DOM pins + the sequence
capture carry the proof); the prepared-character strip's one-button-per-asset
growth; the vision judge phase unrun on the animation checkpoints.

## §8 — Where to look hardest

1. **The cross-wave seams**: wave 1 froze execution config; wave 2a
   widened the rolling-reference pointer and bumped the compiler; wave 2b
   added the position rule; wave 3 reworked the layout. Each junction was
   reviewed only from its own side. Example probes: does the frozen-config
   replay stay byte-stable across the compiler bump; does the stage layout
   preserve the §7.4 return-and-highlight behavior at the 1439/1440
   boundary; does the batch import's stop-on-failure interact correctly
   with the idempotency peek.
2. **The no-silent-drop doctrine** across every multi-step surface: batch
   import (just fixed — verify the class has no siblings), editorial
   assembly, export media resolution, blob registration, the archive
   round-trip with the widened pointer.
3. **Concurrency at the seams the e2e can't drive**: two surfaces writing
   the same document through the new commands (annotate vs re-select vs
   binding update); the parked-settle race class.
4. **The export pipeline's integrity under the new shapes**: spanless
   contributions from sequence attempts whose near references are now
   annotated promoted frames; the manifest's lineage with the widened
   pointer.
5. **Anything the mirror cannot catch** (the wave-1 lesson): places where
   the fake engine's shape and the real engine's could still diverge —
   the enumeration cache's TTL vs a live model-folder change, the
   `/free`-style empty-body endpoints, the history eviction windows.

## §9 — Evidence map

- The SDD ledger (the program's complete record):
  `.superpowers/sdd/2026-10-06-animation-authoring-module/progress.md`
  — every brief, report, review, and fix-round verdict beside it.
- The live independent review: `/tmp/monoka-verification/review.md`
  (+ live-results.json, first-history.json, visual/).
- The real-engine gate: `/tmp/monoka-gate/` (gate-check.cjs,
  gate-results.json, first-run + resume logs).
- The spec and plan: `docs/specs/2026-10-06-animation-authoring-module-design.md`,
  `docs/superpowers/plans/2026-10-06-animation-authoring-module.md`.
- Test homes: `tests/animation-*.test.js` (the unit family),
  `e2e/animation.spec.ts`, `e2e/mirror/fakeEngineServer.mjs` (the only
  test double — the production completion owner runs for real everywhere).

## §10 — Verification you can run

`pnpm typecheck && pnpm lint` · `pnpm build:server && pnpm test` (full
unit family) · `pnpm build && npx playwright test e2e/animation.spec.ts`
· `npx playwright test --project=vision -g "animation"`. The engine is
NOT available for your pass — 8188 is the maintainer's (absolutely
off-limits) and 8189 is down by policy; everything engine-shaped is the
fake engine's province.

## §11 — What this charter asks of you

A defect hunt over `451694c..e109bf1`, weighted by §8, honest about §7,
respectful of §6. Findings with file:line and concrete failure scenarios,
ranked. If you find nothing in a §8 area, say so explicitly — a named
clean pass is evidence too.
