# Component vocabulary v1 — the dependable-primitives round

Status: **DRAFTED r2** (2026-10-03, brainstorm a10wyw5). r1 reviewed
adversarially by Codex (2026-10-03): verdict BLESS-AFTER-FINDINGS, 15
findings (CV01–CV15) — all folded here. Counts corrected to the review's
verified values; approximate inventories replaced by the manifest
requirement (§2.0). Pending maintainer blessing, then writing-plans.

Provenance: the Codex UI audit's opinion pass (the six dependable
components "before further layout expansion"), scope-expanded by
maintainer ruling (full batch, blind sweep first), folded with the blind
inventory sweep and the design-language L2 table. Sequencing locked:
**structure first, current skin** (pre-SHIBUI; the design round's token
swap re-skins later). **No new theming in this round.** The remediation
branch (audit-fixes-2026-10-02) owns the A05–A10 bug fixes and their
regression gates; this round builds on, and never claims, that work.

## 0. Behavioral contracts (binding, resolved per CV02/03/05/06/07/08/11/12)

1. **Layering** (CV05): a bounded layering contract precedes any dialog
   migration — modal surfaces sit above ALL docks (raiseDock's counter is
   unbounded; a lone modal constant eventually loses). Contract: dock
   z-order = the raise discipline (newest-interacted wins, the inspector
   included — CV03: NOT inspector-always-on-top); modal = a defined band
   above the dock ceiling; consent overrides stay topmost. Written as
   named z tokens, tested by z-order assertions.
2. **Keyboard ownership & nesting** (CV06): one Escape closes exactly the
   topmost layer; command controls (palette, library, timeline) retain
   their local navigation keys; background canvas shortcuts cannot fire
   through a modal; restore target = the layer's opener. Nested layers
   (Caption → VLM) unwind topmost-first. "Eager event capture" (Field)
   means: event values read into locals at dispatch, never dereferenced
   inside deferred callbacks — the T2 bug class.
3. **Selection semantics** (CV11): the chip/button kit carries an explicit
   choice contract — independent toggle vs exclusive group (exclusive
   groups use radiogroup semantics with accessible selected state, as
   BottomBar's lanes already do correctly and the tier chips don't);
   unavailable choices render honest refusal, not visual dimming alone.
4. **Effective-setting provenance** (CV08): the row DISPLAYS value +
   provenance supplied by the existing resolver (modelOverrides.ts) —
   including auto/inference, migration provenance, refusal, and degraded
   fallback; it never resolves anything itself. Reset targets the nearest
   applicable override level; a read-only variant (no reset) exists for
   Control-center-style views; direct authoring controls do not inherit
   the row.
5. **Handoff retry ownership** (CV07): the component renders caller-owned
   operation state — per-step landed/failed with RETAINED successful
   identifiers so retry re-runs only the failed mutation (a failed
   refresh after a successful write is displayed as success + stale
   marker, not failure). Execution and server calls live with the caller;
   the component never orchestrates.
6. **PromptDialog outcomes** (CV12): cancel ≠ submitted-empty at every
   migrated call site. The batch-instruction site's current `?? ''`
   behavior (cancel executes the default batch) is explicitly decided at
   migration — default: cancel aborts, matching the trash-cycle consent
   pattern — and tested.

## 1. Principles

1. **Repair-then-componentize**: the two live bugs made of this round's
   material (the `--color-status-ok` ghost token; the dock raise
   discipline) land as PR-1, standalone, before any component work.
2. **Behavior shared, chrome per-surface** (modularity, both directions):
   StudioDialog/StudioDock own behavior; markup rides
   `popupClassName`/children/geometry classes.
3. **Never-shared list** (binding; extended per review): the StatusRing
   visual (token mapping only); a fat dock owning content layout; the
   combobox/palette merge (different data planes); prototypes and pose
   rig as migration targets; **domain resolution and operation
   orchestration** (shared components display supplied truth and invoke
   supplied actions — they never import canvas persistence, resolve
   models, or own media handoff execution).
4. **Recipes over components**: EmptyState, disclosure markers,
   micro-labels, kbd are CSS recipes on the chip system.
5. **Tokens always**: no new literal colors/sizes; the fallback-drift
   pattern is eliminated by token definitions. Note (CV14): fallback
   removal does NOT retire A10 — the remediation branch (T5) owns the
   readable helper floor; this round only removes the disagreeing
   fallback layer and adds computed-size assertions to the gallery.

## 2. Scope

### 2.0 The migration manifest (CV01 — the round's first planning artifact)

All absorption claims live in a **manifest generated at planning time,
pinned to the post-remediation merge revision**: per family — name,
consumer sites (file:line), replacement, exemption (if any), verification
(grep pattern or test). Grep acceptance runs against manifest targets
only. Review-corrected baselines: `window.confirm` **×7**,
`window.prompt` ×4, LoaderCircle ×32 (button-busy subset to be enumerated
by the manifest — not all 32 are button swaps), StudioDialog consumers
×4, IwDialog dialogs ×3, roleless datasets overlays ×3, resize literals
×7 across 6 components (PoseRigDock's distinct policy preserved),
chip/badge/pill class names ≥25 (taxonomy + membership enumerated in the
manifest; excluded prototype/pose families listed as EXEMPT, absorbed at
their owners' discretion). Dead-CSS deletion is a selector-level list in
the manifest (the `.notice`, shell/nav, mobile-sidebar, and consumerless
`.progress` rules are confirmed dead); no line-count quotas.

### 2.1 Foundations

- `statusToken(status)` + tone tokens — collapses the status→color maps
  (domains enumerated in the manifest: tile state, connection health,
  doctor severity, install state); **defines `--color-status-ok`**
  (ghost today: canvas.css refs confirmed by review; invalid var falls
  back through inheritance — the color is wrong, not empty — CV04).
- **Chip system** — shared tone/state recipes; **surface geometry stays
  in named per-surface recipes** (CV02: op-chip pills, iw-family
  rectangles, ds-aspect dashed-custom keep their dimensions/borders/
  treatments; what unifies is tone, state, and the selection contract
  §0.3). Absorbs kbd (the unstyled BottomBar kbd included), micro-labels,
  EmptyState and disclosure-marker recipes.
- **Button API** — primary/secondary/ghost/danger/icon; disabled + busy
  (the button-busy LoaderCircle subset); visuals unchanged at migration.
- **ProgressBar** (+indeterminate) — scalar bars only (fetch, tile,
  queue); wizard step indicators and prototype queue bars are EXEMPT
  (CV-review narrowing).
- **StudioDialog consolidation** — IwDialog's 3 dialogs (fixing the
  bubbling-only ×), the datasets overlays (crop, caption, nested VLM —
  "zero semantics" means no dialog ROLE; their window-keyboard Escape
  handlers are acknowledged and superseded), the canvas command surfaces
  via the overlay-behavior hook (§0.2); **ConfirmDialog/PromptDialog**
  replace the ×7 confirms and ×4 prompts. Migration covers backdrop and
  center geometry + ancestry-sensitive selectors (StudioDialog portals
  siblings — its own doc notes the geometry difference; CV13), incl. the
  nested Caption→VLM case, scroll containment, long content, narrow
  viewports.
- **StudioSelect + popover menu** — one styled select; one popover
  behavior unifying the dismissal idioms. PromptDialog's input contract
  agrees with Field BEFORE either lands (review: no incompatible
  conventions).
- **StudioDock thin shell** — drag/raise/resize/close/error-boundary
  slot; brings the inspector and both AudioDock branches into the raise
  discipline (CV03).
- **ToastHost + NoticeBanner** — one placement-prop host (deletes the
  Workbench inline copy); roles + aria-live on datasets banners; one
  dismiss contract; deletes the dead-CSS selectors from the manifest.

### 2.2 The audit's six (semantic components)

Field (primitive only; form-family consolidation defers) ·
Effective-setting row (§0.4) · Save status (absorbs the T1/T2 instances)
· Refusal (reason + satisfaction path; launcher gate as reference) ·
Handoff result (§0.5) · Dialog = the §2.1 consolidation (counted once).
**Named first consumers** (CV10): Field → the datasets trigger control;
Effective-setting row → the properties dial rows; Save status → the
inspector's Generate; Refusal → the image-lane gate; Handoff result →
the workbench exit.

### 2.3 Living documentation

The `?gallery=1` surface (registry append): every component against live
tokens, **component-specific state matrices with justified N/A cells**
(CV10), tone/severity swatches, the icon vocabulary table. Hover and
focus-visible states are rendered by real drivers (scripted hover/focus,
not class simulation — review note); the gallery asserts DOM semantics
and computed styles. No Storybook.

## 3. Non-goals (deferred / exempt)

Form-family system (v2/Control-Center) · Skeleton (design round) ·
Lightbox (v2 review) · dock rack layout (Control Center) · combobox/palette
merge (never) · full type-ramp redesign (design round) · IndexOverlay
virtualization (standalone perf task) · prototype/pose-rig migration
(exempt) · wizard step indicators and prototype progress (exempt) ·
**remediation-owned findings A06–A10** (this round displays truth about
them via Refusal/Handoff/Save-status; the bugs themselves belong to the
remediation branch's owners and gates).

## 4. Migration order (three delivery packages, one round — review §5)

1. **Package A — repair + atom normalization**: PR-1 (ghost token with
   the corrected assertion §5; raise discipline with the
   newest-interacted-wins contract, both AudioDock branches verified) →
   statusToken → chip/button/progress recipes → toasts/notices →
   dead-selector deletion.
2. **Package B — interaction consolidation**: the layering contract (§0.1)
   FIRST, then dialog migration (IwDialog → datasets → canvas hook →
   Confirm/Prompt with §0.6 outcomes) → select/popover → dock shell.
3. **Package C — trust displays + documentation**: the semantic five with
   their named first consumers, fault-injection coverage on Handoff
   (mutation-failure vs refresh-failure arms), the completed gallery.

Completion unit = **a manifest family or consumer batch** (CV10): each
batch lands whole (component + its listed consumers + tests); retained
adapters or named legacy recipes may bridge functioning consumers between
batches — "no half-migrated surface" applies at batch boundaries, not to
whole surfaces atomically.

## 5. Testing (real assertions only — CV09/CV04)

- **PR-1 ghost token**: assert the custom property IS DEFINED
  (getComputedStyle on a probe element resolves to the intended
  current-skin color for online/offline/degraded) — not "computed color
  non-empty", which inheritance defeats.
- **PR-1 raise discipline**: z-order assertions — newest-interacted dock
  wins, including over the inspector; both AudioDock branches; open and
  pointer-capture paths.
- **A11y/keyboard**: Playwright keyboard-path e2e (trap/restore, the §0.2
  ownership rules, field error announcement). Screen-reader announcement
  is NOT proven by traversal — we assert accessible associations and
  live-region mutations, and state that evidence limit honestly.
- **Migration verification**: per-batch DOM/class assertions + computed
  styles against the manifest; the existing capture-judge rubric (a
  separate judged pass, never a pixel-equivalence gate — that mechanism
  does not exist in the pipeline and is not claimed). An optional
  deterministic pixel-diff harness is a named follow-up tool, not a
  dependency of this round.
- **Gallery**: computed-style and DOM assertions per state matrix cell;
  real hover/focus drivers.

## 6. Acceptance criteria

1. PR-1 merged with both corrected failing-first tests.
2. Every manifest family absorbed or explicitly exempted; grep acceptance
   green against manifest targets; dead-selector list deleted
   (selector-verified, no quotas).
3. `window.confirm`/`window.prompt`: zero in src/; the batch site's
   cancel semantics decided and tested per §0.6.
4. The semantic five each have their named first consumer, a
   component-specific state matrix, and fault-injection coverage where
   applicable (Handoff at minimum).
5. Full local gate green (typecheck/lint/vitest/e2e incl. remediation
   regressions); **deliberately dispatched** CI runs for both legs green
   with run links recorded (CV15 — CI is on-demand by standing rule).
6. No new literal colors/sizes; no SHIBUI changes; exempt surfaces
   untouched; never-shared list intact.

## 7. Risks

Migration regressions (mitigated: geometry classes, per-batch DOM
assertions, judged rubric) · chip over-generalization (closed tone/state
matrix; geometry stays local) · round growth (manifest is the ceiling
artifact; new discoveries → follow-up ledger) · **the manifest drifting
from the tree** (pinned to revision at planning; regenerated on rebase).
