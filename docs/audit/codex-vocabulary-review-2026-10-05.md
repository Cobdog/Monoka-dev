# Codex review handoff — the component-vocabulary round (2026-10-05)

> The external audit gate for the 24-task component-vocabulary build on
> branch `component-vocabulary`. Every task shipped through the SDD loop
> (fresh implementer → blind task review → fix rounds where flagged →
> controller rulings); this review is the merge gate, the same role your
> audit played for the remediation program. Review the WORK and the
> PROCESS's honesty; the maintainer decides on your verdict.

## 1. What was built (one paragraph)

A shared component vocabulary for the whole app, built task-by-task from a
reviewed spec: the interaction foundation (layerRegistry + one-Escape
routing across dialogs, overlays, and popovers; reactive dock ranks + the
z-band; StudioDialogLayered/StudioDock/useOverlayBehavior shells), the
form/status tiers (Chip, Button, ProgressBar, ToastHost/NoticeBanner,
StudioSelect, PopoverMenu, Field, ConfirmDialog/PromptDialog,
EffectiveSettingRow with origin≠outcome, SaveStatus, Refusal, HandoffResult
with write≠refresh), and the gallery surface exhibiting the kit's 138-cell
state matrices as data. Along the way the round fixed real bugs the
migrations surfaced: the batch-cancel-runs-default-instruction silent loss,
the workbench's vanishing failure notices (silent patch loss), the
swallowed reload failure, the exit path's dropped regeneration notice, the
smart-insert Escape deselect leak, the emptyTrash bake-jobs FK 500, and a
Base UI portal-commit timing class that had killed imperative listeners in
three separate places.

## 2. The numbers

- 94 commits on the branch since main (d773fa9); the CODE surface is
  130 files, +17,301/−1,538 (the remainder is the GPU-batch program's
  docs-only commits — a separate effort, listed in §7, not this review's
  target unless you want the diversion).
- 24/24 tasks, each with an implementer report and a blind review verdict
  in `.superpowers/sdd/2026-10-03-component-vocabulary/` (progress.md is
  the running ledger; task-N-report.md ×24; review-N.diff packages ×24).
- Two tasks needed fix rounds (T1 enumeration, T16 unpinned claims +
  geometry), both re-reviewed to APPROVED; one regression fix (12R) for a
  T12-introduced listener bug T13's implementer root-caused.

## 3. The instruments (read in this order)

1. `docs/specs/component-vocabulary-v1.md` (r3) — the binding spec.
2. `docs/specs/component-vocabulary-manifest.md` — the scope instrument:
   retired-selector/retained-geometry/behavior-test columns per family;
   T24's sweep re-ran every column against the tree.
3. `docs/superpowers/plans/2026-10-03-component-vocabulary.md` (r3) — the
   24-task plan; each task's Review Focus items.
4. `.superpowers/sdd/2026-10-03-component-vocabulary/progress.md` — the
   controller's ledger: every dispatch, ruling, review verdict, fix round,
   and minor's disposition.
5. The gate evidence (T24's report): `pnpm gate` tail, the judged visual
   pass verdict, both CI legs' run links.

## 4. The standing rules everything was judged against

- **P06**: shared component recipes carry tone/state ONLY
  (color/background/border-color/opacity/cursor); geometry lives in
  surface classes; border-longhand discipline (shorthand resets
  border-color to currentcolor — the T6 C1 lesson, now a standing hazard
  net).
- **§0.2 keyboard ownership**: ONE window-capture registry routes Escape
  topmost-only; consumers decline (busy guards) rather than intercept.
- **P04 test placement**: vitest is node-pure (VM harness); ALL browser
  behavior is Playwright; every suite ci-mapped in `scripts/ci-map.cjs`
  the same commit it appears (a self-tested manifest).
- **P07**: components take props; adapters own stores.
- **Report accuracy**: claiming an unpinned behavior is itself a review
  finding (T16's lesson — enforced twice since).

## 5. What to review (the charter's questions)

1. **Spec fidelity at the edges**: pick any three components and verify
   the shipped interface against spec §2.1 and the plan's Interfaces
   blocks — especially the discriminated unions (EffectiveSettingRow's
   origin/attempt; HandoffResult's write/refresh independence).
2. **The doctrine holds under composition**: the gallery composes the
   whole kit — does anything there (or in the T12-T17 migrations) leak
   geometry into shared recipes, bypass the registry, or double-announce?
3. **The one-Escape invariant, end to end**: dialogs (Base UI), overlays
   (the hook), popovers (PopoverMenu), and the nested cases (Caption→VLM,
   ⌘K-over-dialog, the gap menu) — is there ANY path where two layers
   close on one press, or zero do?
4. **The silent-loss class**: the round fixed five instances of it
   (§1) — audit the fix sites' neighborhoods for a sixth. The house rule:
   an operation that reports success while doing nothing is worse than a
   crash.
5. **The review process itself**: spot-check three task reports against
   their diffs (task-N-report.md vs review-*.diff). The controller's
   rulings are in progress.md — was any ruling a rubber stamp?
6. **The residuals** (§6) — do you agree each is safe to defer?

## 6. Known residuals (deliberately not fixed, with reasons)

- The stuck-resize overlay (react-rnd + rig surface): pre-existing,
  keyboard-trap class, e2e tripwired (`expectResizeSettled`).
- PopoverMenu's non-backdrop branch renders unpositioned (no consumer
  passes it; docblock warns).
- The clamp oscillation near the fold (verbatim parity with the retired
  EndpointMenu).
- The refresh-failure REASON seam (HandoffResult carries no detail until
  the store surfaces one — hazards-ledgered).
- The Kit's ChipGroup onChange String() cast (type wart, next touch).
- Open maintainer ratifications: Button `size` vs `spinnerSize` rename;
  the T8 height-floor precedent; IndexConfirm's non-modal absorption;
  the OK-tone recipe question (muted vs a --color-status-ok tier).

## 7. The parallel program on this branch (context, not target)

The GPU experiment batch's commits (docs/research/*, docs/licenses/*, the
ledger + amendments) share the branch. Its own review loop is the
maintainer's blinded A/B eyes + the instrument's null gates — out of scope
here beyond "they touched no code."

## 8. The ask

Verdict from your menu: **APPROVED / APPROVED-WITH-FINDINGS /
NEEDS-FIXES** — findings ranked, each with file:line and the failure
scenario. The maintainer holds the merge.

## 9. T24's gate evidence (the sweep's close-out, appended 2026-10-05)

- **`pnpm gate`: GREEN — all 8 executed suites passed in 14.5m** (after three disclosed red legs, each root-caused in the T24 report: test-scoping strictness, the A09 wrap-sentinel sampling race — instrumented proof, contract unchanged — and F02's teardown-time CI-only route rejection).
- **Judged visual pass: 39/39 checkpoints PASS** (`pnpm vision:report`, exit 0; two capture-side deficiencies found and fixed by the judged runs themselves; no rubric clause weakened; the judge was the pipeline's documented sonnet-tier dispatch — the round's one deliberate subagent deviation, reasoned in the report).
- **CI both legs, deliberately dispatched, green:** Linux https://github.com/Cobdog/Monoka-dev/actions/runs/37305232256 (first dispatch red on F02, disclosed, re-run green) · Windows https://github.com/Cobdog/Monoka-dev/actions/runs/37299100083
- **The sweep's own finds beyond the checklist:** the §10 kbd recipe row was never executed by any task of the round (closed by the sweep); the manifest's OpEditor "Escape listener" was actually ⌘Z per-op undo (column corrected, feature kept); the workbench auto-create silently replaced the session on failed loads — the T23 incident's mechanism — closed with an honest failure state.
- **Standing caveat for your review:** the fleet's slow-boot flake family (A09/F02/M13) is load-shaped; three members were fixed in the sweep but CI runners will surface new ones until a fleet-wide settle-or-poll pass happens (recommended post-merge follow-up). The judge's nine non-issue notes (task-24-report.md §Vision) merit the maintainer's glance — flag anything you consider load-bearing.
