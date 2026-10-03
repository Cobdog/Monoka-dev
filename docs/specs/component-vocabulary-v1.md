# Component vocabulary v1 — the dependable-primitives round

Status: **DRAFTED** (2026-10-03, brainstorm session a10wyw5 — awaiting maintainer
review; then writing-plans).

Provenance: the Codex audit's opinion pass ("a small shared vocabulary of
dependable components — dialog, field, effective-setting display, save
status, refusal, and handoff result — before further layout expansion"),
scope-expanded by maintainer ruling (2026-10-03: full batch, blind sweep
first), folded with the blind inventory sweep (2026-10-03, independent
code-only audit: 7 CSS files, ~40 TSX read; its evidence counts cited
below) and the design-language doc's L2 table. Sequencing locked:
**structure first, current skin** — the vocabulary ships in today's tokens
(pre-SHIBUI); the design round's token swap re-skins it in one commit.
**No new theming in this round.**

## 1. Principles

1. **Repair-then-componentize**: the two live bugs made of this round's
   material (the `--color-status-ok` ghost token; the inspector/dock
   raise discipline) land as the FIRST PR, before any component work.
2. **Behavior shared, chrome per-surface** (the modularity contract, both
   directions): StudioDialog/StudioDock own behavior; markup dialects ride
   `popupClassName`/children. Pulling a surface out must stay as easy as
   pulling a tool out.
3. **Never-shared list** (blind-sweep anti-abstraction rulings, binding):
   the StatusRing visual (canvas identity — token mapping only, never the
   component); a fat dock owning content layout; merging the prompt-editor
   combobox with the index palette (different data planes); prototypes
   (`proto.css`) and the pose-rig surface are **not migration targets**
   (direction-testing surfaces by design; their atoms may adopt shared
   chips/kbd, nothing more).
4. **Recipes over components where a component is over-abstraction**:
   EmptyState, disclosure markers, micro-labels, kbd are CSS recipes on
   the chip system, not React components.
5. **Tokens always**: no new literal colors/sizes; the fallback-drift bug
   class (`var(--text-2xs, 11px)` mapping to different literals per file)
   is eliminated by definition-with-tokens, not fallbacks.

## 2. Scope (locked)

**Foundations (L0/L1)**
- `statusToken(status)` helper + the status tone tokens — collapses the 4
  independent status→color maps; **defines `--color-status-ok`** (ghost
  today: canvas.css:267/268/482/483, undefined, no fallback — the
  engine-online color renders as nothing).
- **Chip system** — one tone × variant class set
  (default/accent/danger/warning/info/muted × static/toggle/empty)
  absorbing the ~28 existing families (canvas-chip, ds-chip, iw-family…,
  node-pack ×4, health-pill, proto-badge, …), plus the 6 kbd recipes
  (incl. the unstyled BottomBar kbd), ~10 micro-label recipes, the
  EmptyState recipe (15 dialects), and disclosure markers.
- **Button API** — variants primary/secondary/ghost/danger/icon; states
  disabled + busy (absorbs the ad-hoc LoaderCircle swap ×32 sites);
  ~25 existing recipes migrate at the API level, visuals unchanged.
- **ProgressBar** (+ indeterminate) — 6 dialects → 1.
- **StudioDialog consolidation** — migrate IwDialog's 3 dialogs (the
  hand-reimplemented contract; fix its bubbling-only × dismiss) and the 3
  datasets overlays (CropEditor, CaptionPanel ×2 — currently zero dialog
  semantics) via `popupClassName`; add the **overlay-behavior hook**
  (focus/Escape/dismiss) for the canvas command surfaces (8 overlays,
  focus-on-open in only 3); add **ConfirmDialog/PromptDialog** replacing
  `window.confirm` ×11 and `window.prompt` ×4 (which collects authoring
  text — the batch-VLM template — outside theme and a11y entirely).
- **StudioSelect + popover menu** — one styled native select (chevron,
  overflow, focus) absorbing ~12 select styles; one popover-menu behavior
  unifying the 4 dismissal idioms.
- **StudioDock thin shell** — drag/raise/resize/close/error-boundary slot
  only; absorbs the ×7 identical enableResizing literals and 3 close
  idioms; **brings the inspector, AudioDock, PoseRigDock into the
  raiseDock discipline** (live stacking bug: any raised dock permanently
  covers the z-40-pinned inspector).
- **ToastHost + NoticeBanner** — one ToastHost with placement prop
  (deletes WorkbenchApp's inline copy-paste of the strip); roles +
  aria-live on the datasets banners; one dismiss contract; **deletes the
  dead `.notice` CSS** and the rest of the ~150 dead shell-era lines
  (never absorbed).

**The audit's six (semantic components)**
- **Field** — label + control + error/hint slots, keyboard-first, eager
  event capture (the T2 bug class eliminated at the source). Scope
  boundary: this primitive only; the 6-system form-family consolidation
  defers to workbench-v2/Control-Center.
- **Effective-setting row** — value + origin chip (node › chain › global)
  + reset-to-inherit; one row shape everywhere dials appear.
- **Save status** — persistent saving/saved/failed+retry beside the
  initiating action; absorbs the T1/T2 ad-hoc instances.
- **Refusal** — what's refused, the true reason, the satisfaction path
  (linked when actionable); the launcher's Mamad8 gate is the reference
  implementation.
- **Handoff result** — per-step landed/failed, retry-failed-step-only.
- (**Dialog** is the consolidation above, not a new component.)

**Living documentation**
- The `?gallery=1` surface (registry append pattern): every component
  against live tokens, states matrix
  (default/hover/focus-visible/disabled/busy/empty/error), severity and
  tone swatches, the icon vocabulary table (per the design-language glyph
  guide). No Storybook (single-maintainer workshop; the gallery is
  e2e-assertable by the existing vision-capture pipeline).

## 3. Non-goals (deferred, with owners)

Form-family system (v2/Control-Center) · Skeleton (design round) ·
Lightbox (v2 review experience) · dock rack layout (Control Center) ·
combobox/palette merge (never — different planes) · full type-ramp
redesign (design round; this round only fixes the fallback drift) ·
IndexOverlay virtualization (standalone small perf task, not this round) ·
prototypes/pose-rig migration (never in this round).

## 4. Migration order

1. **PR-1 (repair)**: define `--color-status-ok`; inspector + AudioDock +
   PoseRigDock into raiseDock. Small, live-bug-fixing, no API changes.
2. Foundations: statusToken → chips (+recipes) → buttons → progress →
   toasts/notices (+dead-CSS deletion).
3. Dialog consolidation (IwDialog → datasets overlays → canvas overlay
   hook → Confirm/Prompt replacing native).
4. Select/popover · StudioDock shell.
5. The semantic six (Field, Effective-setting row, Save status, Refusal,
   Handoff result) — each lands with its first consumer migration
   (properties panel dials; workbench refs; the gates).
6. The gallery surface + vision-capture scenarios last (documents the
   finished kit).

Each step migrates its consumers opportunistically but the kit never
ships unused: a component lands together with at least one real consumer,
and no surface is left half-migrated at a step boundary.

## 5. Testing

- TDD per house discipline (docs/agent/testing.md; vitest under the
  port-allocator; e2e in e2e/*.spec.ts).
- A11y contracts get keyboard-path e2e assertions (dialog trap/restore,
  popover dismiss idioms, field error announcement, confirm via keyboard).
- Migration equivalence: the vision-capture pipeline diffs before/after
  per migrated surface (visual drift beyond token-identical = failure);
  the gallery's state matrix becomes the permanent regression surface.
- The bug fixes (PR-1) get failing-first tests: the ghost token (computed
  color resolves non-empty), the raise discipline (raised dock never
  covers the inspector — z-order assertion).

## 6. Acceptance criteria

1. PR-1 merged: both live bugs fixed with failing-first tests.
2. The ~28 chip families, ~25 button recipes, 6 progress dialects, 6 kbd
   recipes, the notice/banner systems, 5 dialog systems, 4 status maps,
   and 4 popover idioms are absorbed (grep-verified: the retired class
   families stop appearing in src/; dead CSS lines deleted, count ≈150).
3. `window.confirm`/`window.prompt`: zero remaining in src/.
4. The six semantic components each have ≥1 real consumer and a
   gallery entry with the full state matrix.
5. Full gate green (typecheck/lint/vitest/e2e incl. the remediation
   regression tests); both CI legs green on merge.
6. No new literal colors or font-sizes beyond the existing token ramp;
   no SHIBUI changes; prototypes/pose-rig untouched beyond atom adoption.

## 7. Risks

- **Migration regressions in working surfaces** — mitigated by
  popupClassName preserving visuals + vision-capture diffs + per-step
  e2e.
- **Chip-system over-generalization** — mitigated by the tone × variant
  matrix being closed (no free-form props) and the recipes staying CSS.
- **The round growing past its value** — the locked scope is the ceiling;
  anything new the migrations surface goes to the follow-up ledger, not
  into this round.
