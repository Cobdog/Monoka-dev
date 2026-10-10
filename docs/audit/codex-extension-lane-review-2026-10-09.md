# Codex review charter — the animation extension lane

**Date:** 2026-10-09 · **Tree:** `1d9ef33` on `main` (pushed) · **Round:** the
extension lane (7 tasks + fix rounds + the whole-branch review) on top of
the shipped animation-authoring module.

## §1 — Scope and range

The extension lane adds motion continuation into new time to the animation
module: explicit Extend actions on landed tween-lane clips through Motion
Context tail conditioning, with an owned carry artifact (in-graph save →
digest-verified registration → stage-back consumption), fail-closed
content-identity compatibility, window-slot document semantics with
source-attempt-edge traversal, and the two-readiness lifecycle.

**Review range:** `f944591..1d9ef33` — the lane's every commit, including
the controller incident (a broken one-liner committed through a
pipe-poisoned verification chain at `c5c53fa`, reverted at `e475572`,
correctly redone at `1d9ef33` — recorded honestly in the ledger; the
incident is context, not a finding target, though its LESSON — verification
honesty — is fair game to probe). Docs riders in the range that are not
the lane's: the roadmap refresh, the refmods-lab assessment pair.

## §2 — The binding documents

- The spec (r3, three maintainer review rounds):
  `docs/superpowers/specs/2026-10-08-animation-extension-lane-design.md`
- The plan: `docs/superpowers/plans/2026-10-08-animation-extension-lane.md`
- The evidence base: Set L's results + eye verdict
  (`docs/research/gpu-batch-setL-results.md`), the feasibility audit and
  strategic review (`docs/research/latent-continuation-*.md`).

## §3 — The build program and its review coverage

Subagent-driven, the standing discipline: **every task** got a fresh
implementer and a blind reviewer; five of seven needed fix rounds (all
ADDRESSED-ALL/APPROVED, most red-verified against pre-fix builds); a
whole-branch review (`.superpowers/sdd/2026-10-08-animation-extension-lane/final-review.md`)
APPROVED all five surfaces (end-to-end behaviors, cross-task seams, the
silent-class sweep CLEAN, modularity resolved-contracts-not-welds). The
complete record — every verdict, ruling, and carried concern — is the
lane's ledger at
`.superpowers/sdd/2026-10-08-animation-extension-lane/progress.md`
(per-task reviews, briefs, and reports beside it).

## §4 — What is proven, and what is PENDING

**Proven (fake engine, production code paths):** the full carry handoff
(author-carry toggle → land with playable independent of registration →
digest-verified registration → Extend preflight → dispatch → the window
take); the two-readiness lifecycle across every failure shape; the
ancestry discipline end to end; the two-extension coordinate chain; every
§10 refusal before the attempt row; the stage-back mechanics (fake-engine
legs z6/z7/z8, `server.py`-verified line-for-line).

**PENDING — the real-engine acceptance session (NOT yet run; the maintainer's
card):** the §9 probes re-run (join tuning + the single-ending chase — the
2026-10-08 set died mid-flight; the recipe constants are probe-pending
fallbacks by their own naming); then the five gate legs (Save/Load parity,
receipt discovery, restart-after-completed-source, engine-copy eviction
with the stage-back's first live proof, the second-extension handoff) via
the turnkey driver at `test-results/experiments/extension-gate/`; then the
maintainer's explicit §9 recipe acceptance. **Your audit runs pre-gates by
design — findings can fix before the live session.**

## §5 — Settled rulings (do not re-litigate)

1. The digest contract: the engine has NO digest API (verified against the
   canonical install + the capture) — identities digest through the
   locally-configured model roots, named-refused when unconfigured.
2. Playable-landing over refuse-the-render for identity-gapped carrying
   sources (§7's never-hostage; the named event + the named extend refusal).
3. Rebind produces the binding SOURCE; the attempt mints at next submission
   (no sweep zombies); the mismatch banner stands until the new take.
4. Alternatives never invalidate; only selected-ancestry or authored-input
   changes mark descendants.
5. The tween/extend peek's compiler-independent narrowing (ruled twice).
6. Review-surface re-rolls submit plain (the gate copy names the condition;
   the toggle is the one-action alternative).
7. The identity-discontinuity advisory is spec'd non-refusing
   (mathematically unable).
8. The consumer graph's engine-copy read is stage-back-corrected at
   dispatch (the binding precondition the gates prove live).

## §6 — The accepted-residue ledger

M-3(c) the recomputed plain-root preview length (display-only, route
authoritative); the never-cleaned fake-engine output dir (tmpfs, by
design); the three documented homes of the ancestry walk (the derivation
itself shared); the peek narrowing; the re-roll-plain residue; the
e2e fixture accumulation under ignored test-home.

## §7 — Where to look hardest

1. **The mirror-universe class, one more time** — this round's two worst
   pre-review bugs were the mirror hiding real shapes. The stage-back and
   the receipt contract are `server.py`-verified but LIVE-unproven; probe
   the fake engine's model of `/upload/image type=output`, the output-dir
   layout, and the save-node's file shape against the canonical install's
   actual behavior for divergences no test can see.
2. **The one-artifact/four-hands seam** (builder save-tail → owner
   discovery → digest gate → consumer graph): walk it as a system; the
   per-task reviews each held one hand.
3. **The coordinate mapping under adversarial trims** — the frozen
   generated/trim/delivered mapping vs editorial trims that move delivered
   time; construct the cases the tests didn't.
4. **The fabric envelope + reconcile machinery** (three fix rounds touched
   it — T6's ledger, T7's monotonicity): the lost-envelope corners, the
   resync interleavings, the boot-sweep resume.
5. **Verification honesty** (the incident's lesson): any place a failure
   can present as success — not only in the lane's code but in its test
   harness shape (the suites' own pipe/exit discipline is fair game).

## §8 — Evidence map

The lane's ledger + per-task artifacts
(`.superpowers/sdd/2026-10-08-animation-extension-lane/`); the whole-branch
review (`final-review.md`); the gate driver + plan
(`test-results/experiments/extension-gate/`); the fake engine
(`e2e/mirror/fakeEngineServer.mjs`); the canonical install (read-only:
`/home/agent/comfyui`); the standing module beneath
(`server/animation/`, `shared/animation/`, `src/animation/`).

## §9 — Verification you can run

`pnpm typecheck && pnpm lint` · `pnpm build:server && pnpm test` ·
`pnpm build && npx playwright test e2e/animation.spec.ts`. The engine is
NOT available (8188 absolutely off-limits — the maintainer's; 8189 down);
everything engine-shaped is the fake engine's province — your engine-side
findings come from source-reading the canonical install, which the prior
reviews demonstrate is tractable and load-bearing.

## §10 — The deliverable

A defect hunt over `f944591..1d9ef33`, weighted by §7, honest about §6,
respectful of §5, explicit that §4's gates remain the live word. Findings
ranked Critical / Important / Minor with file:line + concrete failure
scenarios. Named clean passes are evidence too.
