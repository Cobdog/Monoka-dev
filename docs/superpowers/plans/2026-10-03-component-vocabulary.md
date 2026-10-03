# Component Vocabulary Implementation Plan (r3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**r3 (2026-10-03):** r2 Codex re-review APPROVE-AFTER-CORRECTIONS — folded: StudioDialog integration + real consumer + double-Escape prevention moved INTO task 10 (which previously tested a hook that didn't exist yet); origin allows the no-override case (`auto`) with the attempted pick's origin distinguished from the effective fallback's; dead-CSS checks search normalized CLASS TOKENS (composed strings included) with dependency inspection before any death declaration; independent toggles are pressed buttons (`aria-pressed`), exclusive groups carry the radiogroup contract; per-suite build prerequisites (server suites need fresh server output); vision = `scripts/vision-e2e/scenarios.ts` + the JUDGE.md pass + `pnpm vision:report <bundle>`; token verification cross-checks CSS declarations, not a hand-maintained constant. **r2 (2026-10-03):** the REWORK round — 12 findings (P01–P12) + 2 contract gaps, folded as recorded in the r2 commit (33634e0).

**Goal:** Collapse the webui's hand-rolled UI duplication into one dependable shared component kit — in the current skin — per the locked spec (r3).

**Architecture:** Three packages in one round (spec §4): repair + atom normalization → interaction consolidation (ownership mechanism FIRST) → trust displays + the gallery. Absorption claims are enumerated by a revision-pinned manifest (task 1) whose verification columns distinguish retired selectors, retained geometry, and behavior tests.

**Tech Stack:** React 19 + TypeScript, Vite, `@base-ui/react` + `src/ui/StudioDialog.tsx`/`StudioTabs.tsx`, zustand, vitest (NODE environment — pure models only), Playwright (ALL browser behavior), stylelint. **No new dependencies.**

**Spec:** `docs/specs/component-vocabulary-v1.md` (r3). The manifest (task 1) is the scope instrument under the spec's §2.0 governance.

## Global Constraints

- **No new theming or colors**: every color comes from an EXISTING token at the pinned revision (P02). No new literal font-sizes; the `--text-*` ramp rules.
- **Test placement** (P04): vitest runs `environment: 'node'` — unit suites test PURE models (maps, class math, state reducers) only; EVERY browser-behavior assertion (focus, Tab, arrows, computed styles, roles) is a Playwright test in `e2e/*.spec.ts`. **Every new unit suite is registered in `scripts/ci-map.cjs`** in the same commit that creates it. **Build prerequisites are per-suite** (r3 correction): web-dist-dependent checks need a fresh `pnpm build:web`; server-output-dependent suites need a fresh server build — per docs/agent/testing.md's build-before-dependent-units doctrine.
- **Never-shared list** (spec §1.3, extended by P07): components receive data and actions as props; adapters own store connections. StatusRing visual; fat docks; combobox/palette merge; prototypes + the pose-rig AUTHORING surface; **domain resolution and operation orchestration**.
- **Selection contract** (spec §0.3): exclusive groups = radiogroup roles + aria-checked + roving tabindex + arrow-key selection + group-as-one Tab exit — verified in Playwright.
- **Keyboard ownership** (spec §0.2) — ONE mechanism spanning StudioDialog instances, hook overlays, and popovers (P05): a module-level layer registry keyed by identity with register/unregister supporting NON-TOP removal; one Escape closes exactly the topmost registered layer; window-level listeners participate through registration, not independently.
- **Layering** (spec §0.1): reactive keyed dock ranks (P03 — docks' z lives in LOCAL state fed by `raiseDock(): number` today); renormalization re-ranks and PUSHES updates to every participating dock; no clamping/modulo; modal band + consent topmost as tokens.
- **Reset ownership** (spec §0.4) with **origin/outcome separated** (P08).
- **Handoff states** (spec §0.5 + C2): `write` and `refresh` are INDEPENDENT per-step facts.
- **Crop dismissal** (C1): the busy guard governs Escape, outside-press, and Close UNIFORMLY during a protected save.
- **PromptDialog outcomes** (spec §0.6): cancel ≠ submitted-empty; batch-site cancel aborts.
- **Commits**: conventional + Flux id + Co-Authored-By; stage by path. **Verification per task**: `pnpm typecheck && pnpm lint && TMPDIR=/home/agent/tmp-gpu pnpm test` + scoped Playwright. The round gate is **`pnpm gate`** (canonical — license audit, builds, server smoke, suites, capture; P09).
- **Read first**: `docs/agent/testing.md`. Engine (8188/8189) off-limits; fake engines only.
- Executes on a branch cut from main after `audit-fixes-2026-10-02` merges; the manifest pins that revision.

## Review Focus

1. **Nested Escape ordering** — pinned in task 11 (the ownership registry's first consumer test).
2. **Arrow keys MOVE selection** in exclusive groups — Playwright, task 6.
3. **Reset deletes nothing upstream** — clearing a CHAIN override reveals global/auto without touching global settings — Playwright at the real consumer, task 19.
4. **Retry re-runs only the failed write** — request-counted at the real workbench exit caller, task 22.
5. **Prompt-cancel executes nothing** — no POST on batch cancel, task 15.

---

### Task 1: The migration manifest

**Files:** Create `docs/specs/component-vocabulary-manifest.md`.
**Interfaces:** Produces the enumeration every migration step uses + task 24's acceptance columns.

- [ ] **Step 1** — pin `git rev-parse main` post-remediation-merge at the top.
- [ ] **Step 2** — enumerate per spec §2.0 seeds, with THREE verification columns (P10): `retired selectors` (grep → target ZERO after absorption), `retained geometry selectors` (grep → target PRESENT; tone rules deleted, shape rules stay), `behavior tests` (test ids). Dead-CSS candidates get a **consumer-check column** (P01, r3-corrected): search NORMALIZED CLASS TOKENS, not dotted selector strings — CSS `.clip-modal` appears in JSX as the bare token `clip-modal`, including inside composed strings like `popupClassName="clip-modal fetch-consent-modal"`; tokenize `className`/`popupClassName`/template-literal values and match tokens. Zero direct token references makes a rule a **deletion CANDIDATE only** — then inspect the rule for selector dependencies (compound selectors, `:has()`, attribute selectors referencing it) before declaring it dead. **Known live (never a candidate): `clip-modal`** (FetchBrowser.tsx:212). The dead-list seeds: `.notice`, `.mode-tabs`, `.nav-button`/`.sidebar`/`.app-shell`/`.titlebar` grid, the mobile-sidebar block, consumerless `.progress` — each carrying its consumer-check result.
- [ ] **Step 3** — run every verification column; record actual hits.
- [ ] **Step 4** — commit.

### Task 2: PR-1a — the ghost token, aliasing an existing token

**Files:** Modify `src/styles.css`; Test: `e2e/app.spec.ts`.
**Interfaces:** Produces `--color-status-ok`.

- [ ] **Step 1 (failing Playwright test)** — assert BOTH definition AND rendering: `--color-status-ok` resolves non-empty AND the Radar engine-online dot/text computed color EQUALS the token's value; the offline/degraded states use their existing tokens. (Red today: definition empty.)
- [ ] **Step 2** — define the token as an ALIAS of an existing, evidence-backed current-skin value (P02): `--color-status-ok: var(--accent);` — the connection-health map's own intent per Radar's current rendering — with the dated ghost-token comment. NO new literal.
- [ ] **Step 3** — green + suites; commit `fix(ui): --color-status-ok — the ghost token aliased (a10wyw5)`.

### Task 3: PR-1b — the stranded docks join raiseDock (correct API)

**Files:** Modify `src/canvas/PropertiesPanel.tsx` (inspector Rnd), `src/canvas/AudioDock.tsx` (both branches), `src/canvas/PoseRigDock.tsx`; Test: `e2e/canvas.spec.ts`.
**Interfaces:** Consumes the REAL API (P03): `raiseDock(): number` — invoked inside each dock's pointer-capture callback; the returned z is retained in the dock's LOCAL state exactly as `SettingsDock.tsx:53-55,110-111` does. Copy that pattern verbatim.

- [ ] **Step 1 (failing Playwright)** — newest-interacted wins across: inspector↔settings, inspector↔audio (both branches), **pose-rig dock open + interact** (explicit: open via its entry point, pointerdown its header, assert it tops the inspector; then the reverse).
- [ ] **Step 2** — apply the pattern to the four stranded Rnds; remove the `.canvas-inspector` z-40 and PoseRigDock z-55 CSS pins.
- [ ] **Step 3** — green + suites; commit. NOTE in the commit body: task 11's reactive ranks supersede the local-state retention — this task is the stopgap repair, not the final mechanism.

### Task 4: statusToken — domain-qualified

**Files:** Create `src/ui/statusToken.ts`; modify the four map sites; Test: `tests/statusToken.test.js` (pure map — node-appropriate) + scoped Playwright for rendering.
**Interfaces:** `statusToken(status: DomainStatus): { fg: string; bg: string }` where `DomainStatus` is a DISCRIMINATED union per domain (P11): `TileStatus | ConnectionStatus | DoctorSeverity | InstallStatus` — no bare string union. Adapters normalize where domains share words; where current skins intentionally DIFFER (timeline running = accent vs tile ring = info), the adapter preserves the difference and a table in the file documents each intentional divergence (no forced equality).

- [ ] **Steps** — failing unit test (per-domain entries return token names **verified against actual CSS declarations** — the test parses `src/styles.css`'s `:root` block at run time, so membership proves the token is DEFINED, not merely listed in a hand-maintained constant; the divergence table is exhaustive) → implement → migrate the four sites (tile ring keeps its component; sources colors) → scoped Playwright: each domain's rendered states (browser-computed values as the final authority) → suites; commit.

### Task 5: The stylelint guard (scope recorded)

**Files:** Modify `stylelint.config.mjs`; Test: the guard's own fixture in `tests/` node-run via stylelint's programmatic API.
- [ ] Record the scope authorization in the config comment (P12): spec principle 5 bans the dead-fallback pattern; this rule ENFORCES it. Rule id: `component-vocab/no-dead-fallback` (stylelint plugin function in the config). Suppression: `/* stylelint-disable-line component-vocab/no-dead-fallback -- <reason> */`. Policy: in-scope consumers get the fallback REMOVED (manifest-verified), suppression is for exempt surfaces only (prototypes/pose) — the manifest's exemption column lists each permitted suppression.
- [ ] Failing fixture (the pattern errors) → implement → repo occurrences resolved per policy → `pnpm lint` green → commit.

### Task 6: The chip system + selection semantics

**Files:** Create `src/ui/Chip.tsx`; `src/styles.css` (tone/state recipe classes ONLY: `.chip--{tone}`, `.chip--selected`, `.chip--busy` — color, background, border-color via color-mix on tokens. **NO padding/radius/font in the shared classes** — P06: geometry (padding, radius, font-size) stays in the consuming surface's own class applied alongside); Test: `tests/chip-classes.test.js` (pure class-mapping, node) + `e2e/settings.spec.ts` + `e2e/canvas.spec.ts` extensions (ALL keyboard behavior).
**Interfaces:** `Chip({ tone, variant, selected, busy, className, children, id })` — className MERGES surface geometry; `<ChipGroup exclusive aria-label onChange>{children}</ChipGroup>` — controlled selection (`value` + `onChange(next)`), roving tabindex, Arrow keys move selection, Tab exits as one unit; icon-only chips require `aria-label`. **Toggle semantics (r3): independent toggles render as PRESSED BUTTONS** — `<button aria-pressed>` with Space/Enter activation — NOT aria-checked (which requires a checkbox/radio role); `aria-checked` + the radiogroup contract belong to EXCLUSIVE groups only.

- [ ] Steps — failing Playwright FIRST (BottomBar lanes post-migration: ArrowRight moves selection AND focus; Tab from any chip exits the group; non-exclusive toggles flip `aria-pressed` on Space/Enter) + failing node class-map test → implement → migrate manifest batch 1 (first row `canvas-chip` fully worked: tone rules deleted from canvas.css, geometry rule retained, classes composed) → mechanical transform for the rest → suites; commit.

### Task 7: The Button API

**Files:** Create `src/ui/Button.tsx`; Test: `tests/button-classes.test.js` + Playwright for busy/disabled/focus.
**Interfaces:** `Button({ variant: 'primary'|'secondary'|'ghost'|'danger'|'icon', size?, busy?, disabled?, icon?: ReactNode, 'aria-label'?, onClick?, type?, className?, children? })` — full consumer contract (P06): children render, handlers pass through, icon-only REQUIRES aria-label (dev-time warn), busy = LoaderCircle + `aria-busy` + disabled, className merges surface geometry.
- [ ] Steps — failing tests → implement → migrate the manifest batch → suites; commit.

### Task 8: ProgressBar

**Files:** Create `src/ui/ProgressBar.tsx`; migrate scalar-bar manifest rows (wizard/proto EXEMPT).
- [ ] Failing (determinate width math — node; indeterminate class) → implement → migrate → suites; commit.

### Task 9: ToastHost + NoticeBanner (adapter pattern)

**Files:** Create `src/ui/ToastHost.tsx`, `src/ui/NoticeBanner.tsx`, `src/canvas/toastAdapter.ts`; modify WorkbenchApp (delete inline strip), DatasetsApp (roles), delete verified-dead selectors.
**Interfaces (P07):** `ToastHost({ toasts, onDismiss, placement })` — PURE props; `toastAdapter` connects the existing canvas zustand store (timeouts: error 15s / other 4.2s; dismissal) and renders `<ToastHost {...}/>`. Canvas mounts the adapter (behavior unchanged); WorkbenchApp mounts the adapter with `placement="bottom-right"` (the inline copy dies). `NoticeBanner({ tone, role: 'status'|'alert', onDismiss? })` — the × owns its handler.
- [ ] Failing Playwright (roles, placement, × handler, datasets banners announce) → implement → migrate → dead-selector deletion (manifest's consumer-checked list ONLY) → suites; commit.

### Task 10: The layer-ownership registry + StudioDialog integration (before any dialog migration)

**Files:** Create `src/ui/layerRegistry.ts`, `src/ui/StudioDialogLayered.tsx` (the wrapper every registry-participating dialog uses); Modify `src/ui/StudioDialog.tsx` ONLY IF the wrapper cannot coordinate from outside (prefer the wrapper). Test: `tests/layerRegistry.test.js` (pure registry mechanics — node) + Playwright at a REAL consumer.
**Interfaces:** `registerLayer({ id, modal, onEscape }): () => unregister` — identity-keyed; removal of NON-top entries supported; `topmostLayer()`; ONE global window keydown listener routes Escape to the topmost registered layer only. **`StudioDialogLayered`** wraps StudioDialog: registers on open, unregisters on close, and **prevents double-Escape handling** (when the registry routes Escape to this layer, the wrapper suppresses Base UI's own outside-press/Escape dismissal for that event — one keystroke, one dismissal path; Base UI's dismissal remains for un-routed paths like outside-press). Real consumer for the tests: `PromptLibraryBrowser` (a current StudioDialog user) wrapped in `StudioDialogLayered`.

- [ ] Steps — failing node tests (ordering incl. non-top removal) → implement the registry → wrap PromptLibraryBrowser → failing Playwright AT THAT CONSUMER (open it; Escape closes it; open it over a hook-overlay stand-in div registered via the registry API directly in the test; Escape closes ONLY the topmost — the nested dialog/overlay ownership case, Review Focus #1's mechanism) → suites; commit. (Hook overlays themselves migrate at task 14 when the hook exists.)

### Task 11: Reactive dock ranks + the z-band (replaces local-state retention)

**Files:** Modify `src/canvas/store.ts` (or a new `dockOrder` store slice), the 8 dock consumers; `src/styles.css` (z tokens).
**Interfaces (P03):** a keyed reactive rank source: `useDockRank(id): number` + `raiseDock(id)` — renormalization re-ranks participants to consecutive values within `--z-dock-base + band` and PUBLISHES to every participant (no local retention); registration/unregistration on mount/unmount; the four task-3 docks migrate WITH the others (SettingsDock's local state deleted).
- [ ] Failing Playwright — 50 raises: every dock z within the band, relative order preserved (record the sequence, assert monotone recency), modal (a StudioDialog) above the top dock, consent above modal. → Implement → migrate all 8 (first worked: SettingsDock) → suites; commit.

### Task 12: IwDialog → StudioDialog

**Files:** Modify WorkbenchApp (delete IwDialog; 3 sites), workbench.css (geometry → popup/backdrop/center classes per StudioDialog's portal structure).
- [ ] Failing Playwright — trap/restore/Escape via the REGISTRY-integrated StudioDialog wrapper; the × owns its handler; nested canvas-ref picker unwinds topmost-first (Review Focus #1); scroll containment + long content. → Implement → suites; commit.

### Task 13: The datasets overlays

**Files:** CropEditor, CaptionPanel (+ caption backdrop), datasets.css.
- [ ] Failing Playwright — semantics via StudioDialog; VLM-Escape closes only VLM; focus restore; **C1: during a protected save, Escape + outside-press + Close ALL defer (uniform busy guard)**. → Implement → suites; commit.

### Task 14: The overlay hook (canvas command surfaces)

**Files:** Create `src/ui/useOverlayBehavior.ts`; migrate the manifest's canvas overlay rows.
**Interfaces:** `useOverlayBehavior({ id, onDismiss, modal? })` → `{ ref, onKeyDown, focusOnOpen }` — registers with task 10's registry.
- [ ] Failing Playwright (palette keeps local arrows; background shortcuts dead while overlay open) → implement → migrate (IndexOverlay first) → suites; commit.

### Task 15: ConfirmDialog + PromptDialog

**Files:** Create both on StudioDialog; migrate ×7 confirms + ×4 prompts.
**Interfaces:** `ConfirmDialog({ title, body, danger?, onResolve })`; `PromptDialog({ title, label, initial?, onResolve: (value: string | null) => void })` — null=cancel, ''=submitted-empty.
- [ ] Failing Playwright — Review Focus #5 (batch cancel: NO POST) + cancel≠empty + Enter/Escape. → Implement → migrate 11 sites (batch-instruction first) → suites; commit.

### Task 16: StudioSelect + PopoverMenu

**Files:** Create both; migrate manifest rows.
**Interfaces:** `StudioSelect` (styled native: chevron/overflow/focus; EAGER value capture documented); `PopoverMenu` registers with the registry; one dismissal idiom (outside-press via Base UI).
- [ ] Failing Playwright → implement → migrate → suites; commit.

### Task 17: The StudioDock thin shell

**Files:** Create `src/ui/StudioDock.tsx`; migrate 8 docks (content per-surface).
**Interfaces:** `<StudioDock id title onClose resizePolicy? errorBoundary?>` — uses task 11's `useDockRank`; `resizePolicy` defaults to the common literal, PoseRigDock passes its distinct policy.
- [ ] Failing Playwright (raise/resize/close via shell; inspector still raises) → implement → migrate → suites; commit.

### Task 18: Field

**Files:** Create `src/ui/Field.tsx`; first consumer the datasets trigger; manifest field rows follow.
**Interfaces:** `Field({ label, error?, hint?, htmlFor?, children })` — error > hint > silent; aria-describedby wiring.
- [ ] Failing Playwright (announcement association; precedence) → implement → migrate → suites; commit.

### Task 19: The effective-setting row (origin ≠ outcome)

**Files:** Create `src/ui/EffectiveSettingRow.tsx`; consumer the properties dial rows.
**Interfaces (P08, r3-corrected):** `EffectiveSettingRow({ label, value, origin, attempt?, onReset? })` where **`origin: { kind: 'override', level: 'node'|'chain'|'global' } | { kind: 'auto' }`** — `auto` is the resolver's no-override state ({state:'auto'} at modelOverrides.ts:354-358 maps here WITHOUT fabricating a level — the row shows "auto/default", no origin chip) — and **`attempt?: { level: 'node'|'chain'|'global'; outcome: 'refused'|'degraded' }`** carries the ATTEMPTED pick separately from the effective fallback (a refused global pick renders: effective = auto (or the surviving lower override), attempt = global/refused). The resolver supplies all fields; the row renders, never resolves. `onReset` present only when `origin.kind === 'override'` at the row's owned level.
- [ ] Failing Playwright — Review Focus #3 AT THE REAL CONSUMER: set a chain override over a global; reset the chain row; global value+origin revealed; the global SETTING unchanged (assert via the settings API). Refused/degraded origins render their outcome chips. → Implement → migrate → suites; commit.

### Task 20: SaveStatus

**Files:** Create `src/ui/SaveStatus.tsx`; consumers: inspector Generate + workbench session writes.
**Interfaces:** `SaveStatus({ state: 'idle'|'saving'|'saved'|'failed', detail?, onRetry? })`.
- [ ] Failing Playwright (states, retry, server reason) → implement → migrate both ad-hoc instances → suites; commit.

### Task 21: Refusal

**Files:** Create `src/ui/Refusal.tsx`; consumer the image-lane gate.
**Interfaces:** `Refusal({ title, reason, satisfy?: { label, action } })`.
- [ ] Failing Playwright → implement → migrate → suites; commit.

### Task 22: HandoffResult (write ≠ refresh)

**Files:** Create `src/ui/HandoffResult.tsx`; consumer the workbench exit.
**Interfaces (C2):** steps: `Array<{ id, label, write: 'done'|'failed'|'pending', refresh: 'fresh'|'stale'|'failed'|'pending', detail? }>` + `onRetry(stepId)` — independent facts; successful-write+stale-refresh renders done-with-stale-marker.
- [ ] Failing Playwright at the REAL caller — Review Focus #4: inject pin-success + chain-failure; retry; count requests (the pin endpoint hit EXACTLY once); inject write-success + reload-failure; assert done+stale (not failed). → Implement → migrate → suites; commit.

### Task 23: The gallery

**Files:** Create `src/gallery/GalleryApp.tsx` + registry append (`?gallery=1`).
- [ ] Component-specific state matrices (justified N/A cells) as data; REAL drivers (Playwright hover()/focus()); computed-style + DOM assertions per cell; register the gallery's capture scenarios in the vision pipeline (`e2e/vision-capture.spec.ts` scenario list). → Implement → suites; commit.

### Task 24: The acceptance sweep

- [ ] Manifest columns re-run: retired selectors → ZERO; retained geometry → PRESENT; behavior tests → green.
- [ ] `grep -rn "window.confirm\|window.prompt" src/` → zero.
- [ ] **`pnpm gate`** (canonical: license audit, fresh builds, server smoke, full suites, capture) — quote the tail. **The judged visual pass (r3 mechanics): scenarios live in `scripts/vision-e2e/scenarios.ts`; the judge executes the instructions at `scripts/vision-e2e/JUDGE.md`; the report lands via `pnpm vision:report <bundle>`** — capture success and visual judgment kept distinct (P09); the gallery's scenarios join `scenarios.ts` at task 23.
- [ ] CI both legs deliberately dispatched; run links recorded. Round closes through the maintainer's audit gate.

---

**Self-review (r2):** P01→task 1 consumer-check + task 9's verified list; P02→task 2 alias + rendering assertions; P03→tasks 3 (real API) + 11 (reactive ranks); P04→Global test-placement constraint + ci-map registration; P05→task 10 precedes 12-16, spans all layer kinds, non-top removal; P06→tasks 6-7 geometry-local interfaces with full consumer contracts; P07→task 9 adapter; P08→task 19 origin/outcome + the real-consumer reset test; P09→task 24 `pnpm gate` + judged pass; P10→three-column manifest; P11→task 4 discriminated unions + divergence table; P12→task 5 scope record + removal-first policy; C1→task 13; C2→task 22. Review Focus each pinned. Interfaces consistent (statusToken/DomainStatus, Chip/ChipGroup, Button, ToastHost+adapter, layerRegistry, useDockRank/raiseDock, useOverlayBehavior, Confirm/Prompt, StudioSelect/PopoverMenu, StudioDock, Field, EffectiveSettingRow origin/outcome, SaveStatus, Refusal, HandoffResult write/refresh). No placeholders: first consumers fully worked; manifest rows carry mechanical rules with defined columns.
