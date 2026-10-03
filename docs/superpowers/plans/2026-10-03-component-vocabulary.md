# Component Vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the webui's hand-rolled UI duplication into one dependable shared component kit — in the current skin — per the locked spec.

**Architecture:** Three delivery packages in one round (spec §4): repair + atom normalization → interaction consolidation → trust displays + the gallery. Foundations are CSS/token systems and thin behavior hooks; semantic components display caller-supplied truth and invoke caller-supplied actions, never more (spec §0). Every absorption claim is enumerated by a revision-pinned manifest (task 1) which is also the acceptance instrument.

**Tech Stack:** React 19 + TypeScript, Vite, existing `@base-ui/react` + `src/ui/StudioDialog.tsx`/`StudioTabs.tsx` primitives, zustand stores, vitest (`tests/*.test.js`, port-allocator discipline), Playwright (`e2e/*.spec.ts`), stylelint. No new dependencies.

**Spec:** `docs/specs/component-vocabulary-v1.md` (r3) — the plan argues from it; executors read both. The manifest (task 1) is the scope instrument under the spec's §2.0 governance.

## Global Constraints

- **No new theming**: current tokens only; SHIBUI belongs to the design round. No new literal colors or font-sizes; sizes come from the `--text-*` ramp (styles.css:47-54).
- **Never-shared list** (spec §1.3): StatusRing visual; fat dock owning content layout; combobox/palette merge; prototypes (`proto.css`) and the pose-rig AUTHORING surface as migration targets; **domain resolution and operation orchestration** (components display supplied truth, invoke supplied actions).
- **Exempt families** (spec §2.0): prototype/pose CSS families; wizard step indicators; prototype progress bars. Exemptions valid only where the spec names them; other scope changes need a recorded maintainer ruling BEFORE entering the manifest.
- **Selection contract** (spec §0.3): exclusive groups = `role="radiogroup"`/`role="radio"` + `aria-checked` + **roving tabindex, arrow-key selection, Tab exits the group as one unit**.
- **Keyboard ownership** (spec §0.2): one Escape closes exactly the topmost layer; command surfaces keep local navigation; background shortcuts cannot fire through a modal; focus restores to the opener.
- **Layering** (spec §0.1): modal band above ALL docks; raises renormalize within the dock band preserving relative order (no clamping/modulo); consent overrides topmost.
- **Reset ownership** (spec §0.4): caller-supplied, scoped to the row's owned override level; reveals inheritance without deleting upstream overrides; hidden/disabled when the row owns none.
- **Handoff retry** (spec §0.5): caller-owned per-step state + retained successful identifiers; failed-refresh-after-successful-write displays success + stale marker, never failure.
- **PromptDialog outcomes** (spec §0.6): cancel ≠ submitted-empty at every site; the batch-instruction site's cancel ABORTS (decided default), tested.
- **Commits**: conventional subject + Flux task id parenthetical + `Co-Authored-By: Claude Code <noreply@anthropic.com>`; stage by path; never `git add -A`.
- **Verification per task**: `pnpm typecheck && pnpm lint && TMPDIR=/home/agent/tmp-gpu pnpm test` green + the task's scoped e2e. Full `pnpm test:e2e` is the controller's gate. CI both legs deliberately dispatched at round end (docs/agent/testing.md) — never assumed.
- **Read first**: `docs/agent/testing.md` before writing any test. The engine (8188 AND 8189) is off-limits — fake-engine fixtures only.
- This plan executes on a branch cut from main **after the remediation branch `audit-fixes-2026-10-02` merges** (the manifest pins that merge revision).

## Review Focus

1. **Nested Escape ordering** (Caption → VLM dialogs): Escape must close only the VLM (topmost), leaving Caption open — pinned in task 12's test.
2. **Radio-group keyboard completeness**: arrow keys must MOVE selection (not just focus) in exclusive groups; Tab from inside the group must skip to outside (one unit) — pinned in task 5's ChipGroup tests.
3. **Reset deleting an upstream override**: resetting a row-level override while a chain override exists must reveal the chain value, not the global default — pinned in task 18.
4. **Handoff retry duplicating a successful write**: retry after "pin succeeded, chain failed" must NOT re-pin — pinned in task 21's fault-injection arm.
5. **PromptDialog cancel executing a default**: cancel at the batch-instruction site must abort, not run the empty-template batch — pinned in task 14.

---

### Task 1: The migration manifest (the scope instrument)

**Files:**
- Create: `docs/specs/component-vocabulary-manifest.md`
- Test: none (artifact review task — the verification IS the manifest's grep columns)

**Interfaces:**
- Consumes: the spec §2.0 baselines; the merged remediation revision.
- Produces: the manifest every later task's migration steps enumerate from; the grep acceptance list for task 23.

- [ ] **Step 1: Pin the revision** — after the remediation branch merges, record `git rev-parse main` at the top of the manifest: `Pinned revision: <sha> (post-remediation merge)`.

- [ ] **Step 2: Enumerate every family** — one table per spec category, columns exactly: `family | consumer sites (file:line at the pinned revision) | replacement (task N) | exemption (spec §ref or —) | verification (grep pattern or test id)`. Categories and seeds (verify + complete each by grepping the pinned tree — the counts below are baselines, not ceilings): chips/badges/pills (≥25 class names; EXEMPT: `proto-*`, `poserig-*`), buttons (~25 recipes), dialogs (StudioDialog consumers ×4; IwDialog ×3 at WorkbenchApp.tsx:1254/1329/1496; datasets roleless ×3; canvas overlay family ×8; `window.confirm` ×7; `window.prompt` ×4), toasts/notices (CanvasToasts store + the WorkbenchApp inline copy at :1279-1286; iw-notice; ds-notice/ds-error-banner; dead `.notice` styles.css:242/519), status maps (4: tile ring, connection health, doctor severity, install state), progress (scalar bars only; EXEMPT wizard steps + proto), kbd (5 styled + 1 unstyled BottomBar), micro-labels (~10), selects (~12 styles + 4 popover idioms), docks (8 sites; resize literal ×7 across 6 components; PoseRigDock's distinct policy noted), dead CSS (selector-level list: `.notice`, `.mode-tabs`, `.nav-button`/`.sidebar`/`.app-shell`/`.titlebar` grid, `.clip-modal`, mobile-sidebar block, consumerless `.progress`).

- [ ] **Step 3: Grep-verify every row** — run each row's verification pattern against the pinned tree; the hit count goes in the row. A row whose pattern returns zero hits is WRONG (fix the pattern or drop the row).

- [ ] **Step 4: Commit**

```bash
git add docs/specs/component-vocabulary-manifest.md
git commit -m "docs(specs): the component-vocabulary migration manifest, pinned to <sha> (a10wyw5)"
```

### Task 2: PR-1a — define the ghost token, failing-first

**Files:**
- Modify: `src/styles.css` (the token block, after `--color-cyan-glow`)
- Test: `tests/storage.test.js` is NOT the home — this is a UI token; test lands in e2e. Add to: `e2e/app.spec.ts`

**Interfaces:**
- Produces: `--color-status-ok` (the current-skin "online" green; use the value the connection-health map already intends — `#8db8ff` is info; online is the lime accent family → `var(--accent)` is WRONG for status; the map's intent per Radar is a green; use `--color-status-ok: #7ce38b` — a readable green on `--surface`).

- [ ] **Step 1: Write the failing test** (in `e2e/app.spec.ts`, alongside the existing radar tests):

```ts
test('the engine-online status color resolves to a defined token (PR-1a)', async ({ page }) => {
  await page.goto('/')
  const color = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    return cs.getPropertyValue('--color-status-ok').trim()
  })
  expect(color).not.toBe('')            // defined (the ghost: '' today)
  expect(color).not.toBe('unset')
})
```

- [ ] **Step 2: Run it red** — `pnpm exec playwright test --project=e2e --grep 'engine-online status color'`; expect FAIL (`''` received).

- [ ] **Step 3: Define the token** in `src/styles.css` after `--color-cyan-glow`:
  `--color-status-ok: #7ce38b;` with the dated comment: `/* PR-1a: was referenced 4× undefined (canvas.css status dots) — the ghost-token fix, companion to the --lime precedent above. */`

- [ ] **Step 4: Run green + suites** — the scoped test passes; `pnpm typecheck && pnpm lint && pnpm test` green.

- [ ] **Step 5: Commit** — `fix(ui): define --color-status-ok — the ghost token (a10wyw5)`

### Task 3: PR-1b — the raise discipline for the four stranded docks

**Files:**
- Modify: `src/canvas/PropertiesPanel.tsx` (the inspector's Rnd, ~:781), `src/canvas/AudioDock.tsx` (both branches, ~:83/:107), `src/canvas/PoseRigDock.tsx` (~:62)
- Test: `e2e/canvas.spec.ts` (new test)

**Interfaces:**
- Consumes: the existing `raiseDock` store action + `dockZ` (the pattern SettingsDock/LibraryDock/DiagnosticsDock/RemediationDock already use — copy their props verbatim).
- Produces: all eight docks in one discipline (the precondition task 16's shell formalizes).

- [ ] **Step 1: Write the failing test** (e2e/canvas.spec.ts): open the inspector + settings dock; pointerdown on the settings dock header; assert via `getComputedStyle(...).zIndex` that the interacted dock's z exceeds the inspector's; then pointerdown the inspector's header; assert the order flips (newest-interacted wins, including the inspector). Both AudioDock branches: repeat with the audio dock in its two modes.

- [ ] **Step 2: Run red** — expect FAIL (the inspector stays z-40 below the raised settings dock; audio/pose-rig never raise).

- [ ] **Step 3: Apply the discipline** — add to each stranded Rnd exactly the four props the raising docks use (`onMouseDown={raiseDock('<id>')}` or the store's equivalent at the pinned revision — copy from `SettingsDock.tsx:107` verbatim), and REMOVE the `.canvas-inspector` z-40 CSS pin (canvas.css:163) and the PoseRigDock z-55 pin (canvas.css:590) so the store owns ordering.

- [ ] **Step 4: Run green + suites; Commit** — `fix(canvas): inspector, audio, pose-rig docks join the raise discipline (a10wyw5)`

### Task 4: statusToken(status) + the tone tokens

**Files:**
- Create: `src/ui/statusToken.ts`
- Modify: `src/styles.css` (severity token set if incomplete), the four map sites (manifest-enumerated: TimelineOverlay STATUS_TONE, Radar/BottomBar engine chips, doctor severity, node-pack installed)
- Test: `tests/statusToken.test.js`

**Interfaces:**
- Produces: `statusToken(status: TileStatus | ConnectionStatus | DoctorSeverity | InstallStatus): { fg: string; bg: string; label?: string }` — tokens are CSS var names, not literals.

- [ ] **Step 1: Failing test** — `tests/statusToken.test.js`: for each status in each domain, assert the returned vars are DEFINED token names (regexp `^--`) and that the four domains agree where statuses coincide (queued/stale/done tones identical across domains). Run red (`Cannot find module`).

- [ ] **Step 2: Implement** — the map table in `src/ui/statusToken.ts`, one row per status, values = existing tokens (`--color-info`, `--warning`, `--danger`, `--color-status-ok`, `--muted`…); `STATUS_LABEL` stays where it is.

- [ ] **Step 3: Migrate the four sites** (manifest rows): replace each local tone map with `statusToken(...)`; the tile ring KEEPS its own component (never-shared) but sources colors from the helper.

- [ ] **Step 4: Green + suites; Commit** — `refactor(ui): statusToken — one status→tone map (a10wyw5)`

### Task 5: The chip system + selection semantics

**Files:**
- Create: `src/ui/Chip.tsx` (`Chip`, `ChipGroup`), `src/styles.css` additions (`.chip` tone/state recipes + `.kbd` + `.micro-label` + `.empty-state` + disclosure-marker recipes)
- Modify: manifest's chip batch-1 consumers (work through every non-exempt row)
- Test: `tests/chip.test.js` + `e2e/settings.spec.ts` extension for keyboard

**Interfaces:**
- Produces: `<Chip tone="default|accent|danger|warning|info|muted" variant="static|toggle" selected? busy? />`; `<ChipGroup exclusive? aria-label>…children</ChipGroup>` (exclusive → the §0.3 contract: roving tabindex, Arrow keys move selection, Tab exits as one unit).

- [ ] **Step 1: Failing tests** — unit: tone/variant class mapping; exclusive group keyboard model (simulate ArrowRight → next chip `aria-checked` true + focus follows; Tab from any chip lands outside the group). e2e: the BottomBar lane group (post-migration) moves selection with arrows.
- [ ] **Step 2: Implement** `Chip.tsx` + the CSS recipes: `.chip` carries tone/state ONLY (padding, radius 999px, font from ramp, tone colors via color-mix on tokens); GEOMETRY stays in the consuming surface's own class added alongside (spec CV02: `.canvas-op-chip` keeps its shape; tone comes from `.chip`). `.kbd` = the proto-kbd recipe on tokens. `.empty-state` = centered muted text + optional dashed border. Disclosure markers: two utility classes (`+`/`−` and chevron).
- [ ] **Step 3: Migrate batch 1** — per manifest row: add the tone classes, delete the per-family tone declarations, keep geometry rules. Fully work the first row (`canvas-chip`) as the pattern; apply the same mechanical transform to the rest.
- [ ] **Step 4: Green + suites; Commit** — `feat(ui): the chip system + selection semantics; manifest batch 1 migrated (a10wyw5)`

### Task 6: The Button API

**Files:**
- Create: `src/ui/Button.tsx`
- Modify: manifest button-batch consumers; `src/components/form.tsx` if it owns shared button styles
- Test: `tests/button.test.js`

**Interfaces:**
- Produces: `<Button variant="primary|secondary|ghost|danger" size="sm|md" busy? disabled? icon? />` — busy renders the LoaderCircle + disables + `aria-busy`; className merges surface geometry.

- [ ] **Step 1: Failing test** — variant→class map; busy sets `aria-busy="true"` + `disabled`; danger exists (today only ds-btn has it).
- [ ] **Step 2: Implement** on the existing `primary/secondary-button` token styling; `busy` absorbs the manifest's button-loader subset (NOT the 5 non-button loaders — manifest-marked).
- [ ] **Step 3: Migrate the batch** (first row fully worked: `ds-btn` family; mechanical transform for the rest).
- [ ] **Step 4: Green + suites; Commit** — `feat(ui): the Button API; manifest button batch migrated (a10wyw5)`

### Task 7: ProgressBar

**Files:** Create `src/ui/ProgressBar.tsx`; modify manifest rows. **Interfaces:** `<ProgressBar value? indeterminate? compact? tone? />`.
- [ ] Failing test (determinate width math; indeterminate class) → implement (absorb `.progress`/`.fetch-progress-bar`/`canvas-tile-progress`; EXEMPT wizard + proto rows) → migrate batch → green → commit `feat(ui): ProgressBar (a10wyw5)`.

### Task 8: ToastHost + NoticeBanner + dead-CSS deletion

**Files:** Create `src/ui/ToastHost.tsx`, `src/ui/NoticeBanner.tsx`; modify `src/images/WorkbenchApp.tsx` (delete the inline strip :1279-1286 → `<ToastHost placement="bottom-right" />`), `src/datasets/DatasetsApp.tsx` (roles on banners), delete the manifest's dead selectors from `src/styles.css`.
**Interfaces:** `ToastHost` reads the existing zustand toast store (auto-dismiss contract unchanged: error 15s / other 4.2s, `aria-live=polite`); `NoticeBanner` = `role="status"|"alert"` + tone + one dismiss contract (× button with its own handler; banner-click dismissal DIES with iw-notice's copy).
- [ ] Failing tests (roles present; × owns its handler; placement prop positions) → implement → migrate (workbench + datasets first-consumers; canvas already mounts CanvasToasts → becomes `<ToastHost/>`) → delete dead selectors → green → commit `feat(ui): ToastHost + NoticeBanner; dead CSS deleted (a10wyw5)`.

### Task 9: The stylelint guard

**Files:** Modify `stylelint.config.mjs`; test: a fixture asserting the rule fires.
- [ ] Failing check (run stylelint on a temp file containing `font-size: var(--text-2xs, 11px);` — expect no error today) → add the rule banning `var(--text-<token>, <fallback-larger-than-token>)` (custom rule via stylelint's `declarationPropertyvalueAllowed`-shaped check or a plugin function comparing against the ramp map) → the fixture now errors; the repo's remaining occurrences (the manifest's exempt control chrome) get `/* stylelint-disable-line component-vocab/exempt-fallback */` with the reason inline → `pnpm lint` green → commit `chore(stylelint): ban the dead-fallback var pattern (a10wyw5)`.

### Task 10: The layering contract

**Files:** Modify `src/styles.css` (z tokens: `--z-dock-base`, `--z-dock-band`, `--z-modal`, `--z-consent`), `src/canvas/store.ts` (raiseDock renormalization), the consent overrides if literal.
- [ ] Failing tests: (a) 50 raises keep every dock z within `[--z-dock-base, --z-dock-base + band)` while preserving relative order (no clamping collisions, no modulo inversions); (b) a StudioDialog's z exceeds the top dock's after arbitrary raises; (c) consent override exceeds modal.
- [ ] Implement renormalization: on raise, re-rank participating docks to consecutive values from `--z-dock-base` (insertion order = recency); modals/consent are constant tokens above the band.
- [ ] Green + suites; commit `fix(ui): the bounded layering contract — renormalizing raises, modal band, consent topmost (a10wyw5)`.

### Task 11: IwDialog → StudioDialog (geometry-faithful)

**Files:** Modify `src/images/WorkbenchApp.tsx` (delete IwDialog :1538-1585; its 3 call sites :1254/:1329/:1496), `src/images/workbench.css` (geometry classes become `popupClassName` + backdrop/center classes per StudioDialog's exposed props — its own header doc notes the portal-sibling geometry).
- [ ] Failing tests first: the exit dialog's focus trap + Escape + restore via StudioDialog semantics; the × button gets its OWN handler (the bubbling dependency dies); the nested canvas-ref picker inside the picker dialog unwinds topmost-first.
- [ ] Implement per CV13: migrate backdrop + center geometry; ancestry-sensitive selectors rewritten to the portal structure; scroll containment + long-content checks in the spec's e2e.
- [ ] Green + suites; commit `refactor(images): IwDialog retired — three dialogs on StudioDialog (a10wyw5)`.

### Task 12: The datasets overlays get semantics

**Files:** Modify `src/datasets/CropEditor.tsx`, `src/datasets/CaptionPanel.tsx` (+ DatasetsApp's caption backdrop), `src/datasets/datasets.css`.
- [ ] Failing tests: crop + caption + nested VLM each have `role=dialog`/`aria-modal`/labelled names via StudioDialog; **the Review-Focus case: Escape inside VLM closes ONLY VLM**; focus restores to each opener.
- [ ] Implement (StudioDialog with ds- geometry classes; the busy-guarded crop Escape listener is superseded by the dialog's own, preserving the busy guard).
- [ ] Green + suites; commit `fix(datasets): overlays carry dialog semantics on StudioDialog (a10wyw5)`.

### Task 13: The overlay-behavior hook (canvas command surfaces)

**Files:** Create `src/ui/useOverlayBehavior.ts`; modify the manifest's canvas overlay rows (IndexOverlay, LibraryOverlay, TimelineOverlay, EndpointMenu, ForkMenu, gap menu, op menu, FirstRunWizard per manifest).
**Interfaces:** `useOverlayBehavior({ id, onDismiss, modal?: boolean })` → `{ ref, onKeyDown, focusOnOpen }` implementing §0.2 (topmost-escape via a shared layer stack; focus trap only when `modal`).
- [ ] Failing tests: one Escape = topmost only (two overlays open); palette keeps its local arrow keys; a background canvas shortcut does not fire while an overlay is open.
- [ ] Implement the layer stack (module-level array, push/pop in effect) + migrate the batch (first: IndexOverlay, fully worked).
- [ ] Green + suites; commit `feat(canvas): the overlay-behavior hook; command surfaces migrate (a10wyw5)`.

### Task 14: ConfirmDialog + PromptDialog

**Files:** Create `src/ui/ConfirmDialog.tsx`, `src/ui/PromptDialog.tsx`; modify the ×7 confirm sites + ×4 prompt sites (manifest).
**Interfaces:** `ConfirmDialog({ title, body, danger?, onResolve(ok) })`; `PromptDialog({ title, label, initial?, placeholder?, onResolve(value | null) })` — `null` = cancel, `''` = submitted-empty (distinct, §0.6). Both on StudioDialog.
- [ ] Failing tests: cancel ≠ empty (returns null vs ''); the batch site: cancel ABORTS the batch (no POST) — the Review-Focus case; keyboard: Enter confirms, Escape cancels.
- [ ] Implement + migrate all 11 sites (first worked: the datasets batch-instruction prompt).
- [ ] Green + suites; commit `feat(ui): ConfirmDialog + PromptDialog; window.confirm/prompt retired (a10wyw5)`.

### Task 15: StudioSelect + popover menu

**Files:** Create `src/ui/StudioSelect.tsx` (styled native select: chevron, overflow, focus ring, eager value), `src/ui/PopoverMenu.tsx` (behavior: Base UI outside-press dismiss + the §0.2 stack; chrome per surface).
- [ ] Failing tests (chevron/keyboard/overflow; popover dismiss idioms unify to one) → implement → migrate manifest batches → green → commit `feat(ui): StudioSelect + PopoverMenu (a10wyw5)`.

### Task 16: The StudioDock thin shell

**Files:** Create `src/ui/StudioDock.tsx`; modify the 8 dock sites.
**Interfaces:** `<StudioDock id title onClose errorBoundary?>{children}</StudioDock>` — owns drag (react-rnd), raise (task 3's discipline + task 10's band), resize (the ×7 literal becomes the shell's default; PoseRigDock's distinct policy is a prop), close (one idiom). Content layout stays per-surface (never-shared).
- [ ] Failing tests (raise/resize/close via the shell; the inspector still raises — task 3 regression) → implement → migrate all 8 (first worked: SettingsDock) → green → commit `feat(ui): the StudioDock shell; eight docks migrated (a10wyw5)`.

### Task 17: Field

**Files:** Create `src/ui/Field.tsx`; first consumer: `src/datasets/DatasetsApp.tsx` (the trigger control, A07's fix becomes the pattern); manifest's field-adjacent rows follow opportunistically.
**Interfaces:** `<Field label error? hint? htmlFor? children />` — error > hint > silent; eager event capture lives in the consuming control pattern (documented in the file header).
- [ ] Failing tests (error/hint precedence + announcement via aria-describedby; label association) → implement → migrate the trigger + the manifest rows → green → commit `feat(ui): the Field primitive (a10wyw5)`.

### Task 18: The effective-setting row

**Files:** Create `src/ui/EffectiveSettingRow.tsx`; first consumer: `src/canvas/PropertiesPanel.tsx` dial rows.
**Interfaces:** `<EffectiveSettingRow label value provenance onReset? />` where `provenance: 'node'|'chain'|'global'|'auto'|'migration'|'refused'|'degraded'` comes from the existing resolver (`modelOverrides.ts`) — the row NEVER resolves. `onReset` absent → read-only rendering (reset hidden).
- [ ] Failing tests: provenance chip reflects the resolver's value incl. auto/refused/degraded; **reset with a chain override present reveals the chain value (Review Focus #3)**; no onReset → no reset affordance.
- [ ] Implement → migrate the dial rows → green → commit `feat(ui): the effective-setting row (a10wyw5)`.

### Task 19: Save status

**Files:** Create `src/ui/SaveStatus.tsx`; first consumer: the inspector's Generate (absorbing T1's ad-hoc instance); the workbench session writes follow.
**Interfaces:** `<SaveStatus state="idle|saving|saved|failed" detail? onRetry? />` — persistent, beside the action.
- [ ] Failing tests (the four states render; retry invokes; failed shows the server reason) → implement → migrate both ad-hoc instances → green → commit `feat(ui): SaveStatus; the ad-hoc instances absorbed (a10wyw5)`.

### Task 20: Refusal

**Files:** Create `src/ui/Refusal.tsx`; first consumer: the image-lane gate (Launcher).
**Interfaces:** `<Refusal title reason satisfy?: { label, action } />` — satisfy renders the actionable path (link/button), never decoration.
- [ ] Failing tests (title/reason/satisfy rendering; satisfy action invokes) → implement → migrate the gate + manifest rows (the honest gates the audit praised become instances) → green → commit `feat(ui): the Refusal component (a10wyw5)`.

### Task 21: Handoff result

**Files:** Create `src/ui/HandoffResult.tsx`; first consumer: the workbench exit (absorbing A05's fix shape).
**Interfaces:** `steps: Array<{ id, label, state: 'done'|'failed'|'stale', detail? }>` + `onRetryFailed(stepId)` — caller owns state and identifiers; **retry re-invokes only the failed step's action** (Review Focus #4: the pin is NOT re-run).
- [ ] Failing tests incl. the fault-injection arm: simulate pin-success + chain-failure → retry calls ONLY the chain action; failed-refresh-after-write renders `'stale'` on the done step, not failure.
- [ ] Implement → migrate the exit flow → green → commit `feat(ui): the HandoffResult component (a10wyw5)`.

### Task 22: The gallery

**Files:** Create: `src/gallery/GalleryApp.tsx` + `src/surfaces` registry append (`?gallery=1`, the append-one-entry pattern at registry.ts).
- [ ] Failing tests: every vocabulary component appears with its state matrix (component-specific, justified-N/A cells — the matrices live in the gallery source as data); real drivers (scripted hover/focus via Playwright's `hover()`/`focus()`, not class simulation); computed-style assertions per state cell.
- [ ] Implement (each section = one component + its matrix + tone/severity swatches + the icon vocabulary table per the design-language glyph guide) → green → commit `feat(ui): the ?gallery=1 living documentation surface (a10wyw5)`.

### Task 23: The acceptance sweep

- [ ] Run every manifest verification pattern; record hits-per-row (target: zero for non-exempt absorbed families).
- [ ] `grep -rn "window.confirm\|window.prompt" src/` → zero.
- [ ] Full gate first-hand (`pnpm typecheck && pnpm lint && TMPDIR=/home/agent/tmp-gpu pnpm test && pnpm test:e2e`) — quote the tail.
- [ ] Dispatch both CI legs deliberately; record run links.
- [ ] Commit any residue + update the manifest's post-run state column. The round closes through the maintainer's audit gate.

---

**Self-review done:** spec sections §0 (contracts) → tasks 5/10/13/14/17-21; §2.0 manifest → task 1 + every migration step; §2.1 foundations → tasks 2-9, 10-16; §2.2 six → 11(dialog)+17-21; §2.3 gallery → 22; §3 non-goals enforced via Global Constraints + manifest exemptions; §4 order = task order (A: 2-9, B: 10-16, C: 17-22); §5 testing = each task's TDD + task 23; §6 ACs → tasks 2/23 + per-task gates. Review Focus lines each carry their pinning task. No placeholders: every migration task names its first consumer fully and gives the mechanical rule for manifest rows (the manifest itself is task 1's enumerated artifact, not a forward reference). Type consistency: `statusToken`, `Chip/ChipGroup`, `Button`, `ToastHost`, `useOverlayBehavior`, `ConfirmDialog/PromptDialog`, `StudioSelect/PopoverMenu`, `StudioDock`, `Field`, `EffectiveSettingRow`, `SaveStatus`, `Refusal`, `HandoffResult` — signatures defined once in their Interfaces blocks and consumed by those names thereafter.
