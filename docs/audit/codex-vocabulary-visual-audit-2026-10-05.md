# Codex vocabulary audit — code, visuals and prior-design comparison — 2026-10-05

Verdict: **NEEDS-FIXES**. Supplemental visual review of revision
`706dd8e95919dd79bb9eaaf292f57e9ec3132633`. The earlier code-audit findings
remain open; this pass adds a confirmed stacking failure and a gallery
presentation defect.

## Evidence and limits

- Fresh `pnpm build`: passed.
- `MINIMAX_E2E_PORT=7943 pnpm exec playwright test --project=e2e e2e/gallery.spec.ts`:
  **16/16 passed**, 25.3 seconds.
- Fresh Chromium captures at **1920×1080, 1×**, using an isolated scratch
  app home. All **16 sections, 138 cells, 19 N/A cells** were present;
  capture browser recorded zero page errors.
- Personally inspected all 16 section captures, four open dialog variants,
  a standalone menu, both nested-layer demos, selected long options, and
  a changed radio selection. Suspected failures were captured and inspected
  again. Screenshots are in
  `test-results/codex-vocabulary-visual-2026-10-05/`.
- This is a supplemental Codex review, not a replacement verdict for the
existing 39-checkpoint pipeline bundle. Production migration screens,
  narrow viewports, screen readers, and real-engine generation were not
  exercised in this pass. Historical chat content is unavailable; comparison
  uses the audit and design records saved in this repository.

## Code-audit findings (consolidated implementer handoff)

These are the findings from the first audit in this conversation. They were
established by source tracing, not browser reproduction. Typecheck and seven
focused suites passed (73 tests): layerRegistry, overlay-behavior,
chip-classes, handoff-classes, effective-row-classes, save-status-classes,
and ci-map. The full gate and remote CI were not rerun by this auditor.

### C01 — High: failed reload allows the next settings write to erase a successful edit

Location: `src/images/WorkbenchApp.tsx:354`; supporting behavior in
`src/canvas/store.ts:504` and `server/documents.ts:1648`.

`flushSessionWrites` ignores the boolean returned by `reloadActiveDocument`
and reports saved. If the write succeeds but the reload fails, the cached
document remains unchanged. The next flush composes its full settings object
from that stale cache; the server replaces the settings object.

Failure scenario: change keepDial; its PUT succeeds, its reload GET fails.
Then change seed. The next PUT contains the old keepDial, reverting the
acknowledged edit despite both writes succeeding.

Required fix: preserve an acknowledged settings base after successful writes,
or prevent subsequent writes from composing against stale state until refresh
succeeds. Preserve the distinction between successful write and failed refresh;
do not blindly retry a landed mutation. Add fault injection for successful PUT
→ failed GET → unrelated edit, asserting both edits remain durable.

### C02 — Medium: focus containment fails with zero or one tabbable control

Location: `src/ui/overlayBehavior.ts:51`, consumed by
`src/ui/useOverlayBehavior.ts`.

`tabCycleTarget` returns null for count <= 1, leaving native Tab navigation
unrestricted. A hook-owned overlay with one enabled control can lose focus
to the background; an empty overlay can do the same. The unit test expects
this behavior despite the hook's stated containment contract.

Required fix: retain focus on the single control, and on the panel when no
controls are tabbable. Verify Tab and Shift+Tab in Playwright. This is a
shared-hook contract defect; the first audit did not reproduce a specific
production consumer with this cardinality.

### C03 — Medium: ChipGroup arrows select disabled chips

Location: `src/ui/Chip.tsx:135`.

Arrow traversal includes disabled chips and calls onChange before attempting
focus. ArrowRight from an enabled radio to a disabled neighbor changes the
selected value while focus cannot move onto that disabled button. Native
disabled click protection does not protect this programmatic selection path.

Required fix: exclude unavailable members from traversal and initial tab-stop
selection. Test selection and focus together. This is a primitive-level defect;
the first audit did not establish a currently affected production group.

### C04 — Low: handoff understates required fix rounds

Location: `docs/audit/codex-vocabulary-review-2026-10-05.md:37`.

The handoff lists only T1 and T16 as needing fix rounds. The controller ledger
also records T6 as NEEDS-FIXES followed by a fix round and re-review, including
a critical selected-paint regression. Correct the summary to at least three
tasks. The ledger discloses the issue; this is inaccurate summarization, not
evidence of concealment.

### Additional acceptance qualifications

- `src/canvas/Launcher.tsx:33`: the global slash-to-focus handler still lacks
  an anyModalLayer gate. Check slash from non-text controls in an open modal
  before declaring background keyboard ownership complete.
- `docs/specs/component-vocabulary-manifest.md:360`: the interactive-chip
  long tail is transparently documented, but its missing selection semantics
  remain an acceptance qualification. A durable annotation does not itself
  implement those semantics.
- Report/diff spot-checks of T6, T14 and T22 support substantive review:
  paint correction, registry migration and retained identifiers are real.
  Green checks and per-task approvals do not establish absolute composition
  guarantees; V01 below supplies a concrete counterexample.
- The unused PopoverMenu branch, refresh-reason seam, naming questions and
  documented clamp parity can remain deferred under their recorded reasons.

## V01 — High: menu-over-dialog owns input while hidden behind the dialog

Locations: `src/ui/PopoverMenu.tsx:156`, `src/canvas/canvas.css:304`,
`src/styles.css:391`, `src/styles.css:396`.

Reproduce: open `?gallery=1`, scroll to the layer demos, open the
popover-over-dialog ask, then click “open a menu over this ask…”. The
Transport menu mounts and registers but is obscured by the parent's modal
layers. It receives topmost Escape ownership without being visually topmost.

Confirmed after waiting for the menu to mount and settle: menu rectangle
`x=737, y=590, width=250, height=95`; ancestor `.canvas-menu-backdrop`
has **z-index 60**. Parent dialog backdrop and centering wrapper use
`--z-modal`, **70**. `document.elementFromPoint()` at the menu's center
returns the parent's `section.confirm-dialog`, not a menu descendant.
Both captures show the lower ask alone, with no visible Transport menu.

Evidence: `popover-over-dialog.png`. The ordinary `popover-open.png`
shows that the same menu mechanism renders correctly without a modal above it.

Fix: make paint order agree with registered ownership for supported nested
layers while preserving the consent tier. Add a browser assertion for actual
hit testing/clickability of a menu row over the parent, plus a visual capture
of this open state. `toBeVisible()` and Escape-only assertions do not prove
that a surface is unobscured. Re-evaluate the handoff's claim that all four
ownership layers compose without a strandable layer.

## V02 — Low: radio-group exhibit omits its surface geometry and obscures selection

Location: `src/gallery/GalleryApp.tsx:84`.

The three radio Chips lack `className="gallery-chip"`; they render as
browser-style rectangular buttons with larger text instead of the rounded,
padded gallery chips beside them. Video is permanently accent-toned even
when no radio is selected. When image or audio is selected, two choices
look highlighted. The ARIA selection is correct, but the visual example
is a poor demonstration of exclusive selection.

Evidence: `chip-group.png`, rechecked after selecting audio in
`chip-group-audio-selected.png`.

Fix: supply the gallery's geometry class to each radio, and give peer
choices a consistent rest tone so selection has a clear visual signal.
Keep geometry in the surface recipe. Assert the displayed shape and capture
at least two different selections.

## Comparison with earlier audits and design suggestions

Sources: `docs/audit/codex-webui-audit-2026-10-02.md` (§2 and §6),
`docs/research/ui-systems-design-language.md` (C2, C5, C7, C10 and z canon),
and the binding `docs/specs/component-vocabulary-v1.md`.

| Earlier recommendation | Current assessment |
|---|---|
| Establish dialog, field, effective-setting, save-status, refusal and handoff primitives before expanding layout | Delivered as functioning gallery components; all have real exhibits and interactive checks where appropriate. |
| Persistent save failures and per-step handoff outcomes | Visual vocabulary works: failed writes are red, stale/failed refresh markers amber, retries and satisfaction actions visible. The earlier code audit's successful-write/failed-refresh/stale-next-write path still blocks persistence approval; it is another route to the A03 silent-loss class. |
| Unify modal behavior and layering | Substantial improvement in routing and dialog reuse, but V01 shows keyboard order and paint order still disagree. Earlier C2/C10 concerns are not fully closed by a central registry alone. |
| Effective value + source + scoped reset; filenames secondary | The row presents provenance and reset, and long filenames wrap without escaping their cards. The gallery demonstrates the mechanism; it does not prove every resolver-backed production state is accurate. |
| Overflow discipline | Selected long StudioSelect options ellipsize within both bare and form controls. Inspected status prose wraps without overlap. This does not establish narrow-viewport conformance. |
| Decision-bearing type at 12–14px, clearer hierarchy | Still a design follow-up. The compact current skin remains visibly dense and small. The round explicitly preserves that skin; passing its 11px floor does not satisfy the stronger prior typography recommendation. |
| Workbench task-panel balance, focused Settings groups, dataset workflow hierarchy, numeric camera/crop controls | Not established by this gallery review; component availability is groundwork for those surface changes, not evidence they shipped. |
| Coordinated SHIBUI token/font change | Deferred by the vocabulary spec. Current green accent and current fonts should not be reported as delivery of the proposed vermillion/warm-neutral treatment. |

Open confirms/prompts, standalone menu, status matrices, and dock examples
showed no additional blocking overlap or text-clipping defect in the states
inspected. Deliberate dock overlap and offscreen continuation of the scrolling
gallery were treated as intended behavior.

The kit is ready for visual review now. Fix V01 and the existing code-audit
blockers, then repeat the nested-layer captures and targeted fault-injection
checks before merge. V02 is a small gallery correction. Production surface
judging remains a separate follow-up.
