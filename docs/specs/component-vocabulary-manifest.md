# Component-vocabulary migration manifest (k2q0n9s)

**Pin:** `main` @ `d773fa9a3d97534a6cab7ea713d16a64eaaf6016` (the post-remediation-merge revision; `component-vocabulary` branches from it). Generated at planning time, 2026-10-04. Every count below was re-verified against this tree, not copied from the spec — divergences are recorded in §14.

**Governance (spec §2.0, R2-04 — binding):** this manifest ENUMERATES the already-locked scope. Planning may not add targets. Exemptions are valid only where the spec names them (§3 non-goals, the never-shared list, the exempt families in §2.0's baseline). Any other scope change requires a **recorded maintainer ruling BEFORE entering this manifest** — §13 lists sweep discoveries parked pending exactly that ruling. The manifest's diff is retained across rebases; regeneration is itself a reviewable change.

**Scope note:** the remediation branch owns A05–A10 and their regression gates. Where this round's rows touch remediation-owned code (the CropEditor focus trap, §3.3), the manifest claims only the component-vocabulary migration, never the bug fix.

---

## 0. Columns and how to re-run (task 24 executes this section)

Every family row carries up to three verification columns plus (dead-CSS rows) a consumer-check column:

| Column | Meaning | Post-round target |
|---|---|---|
| **retired selectors** | grep pattern (runnable from repo root at the pin) | **ZERO** hits after absorption |
| **retained geometry** | grep pattern for shape rules / class tokens that MUST survive (tone rules deleted, shape rules stay — spec §2.1 chip system, CV02) | **PRESENT** (≥1 hit) |
| **behavior tests** | test id (file › describe) the round creates; anchors to the plan's task number | **green** |
| **consumer-check** (dead-CSS only) | normalized-token search result at planning time | see §8 |

**The consumer-check method (r3-corrected, P01):** search NORMALIZED CLASS TOKENS, never dotted selector strings. CSS `.clip-modal` appears in JSX as the bare token `clip-modal`, including inside composed strings such as `popupClassName="clip-modal fetch-consent-modal"` (FetchBrowser.tsx:212). Tokenize every `className` / `popupClassName` / template-literal class value and match whole tokens — a hit inside `ds-bucket-badge` does not count for `badge`, and a hit inside prose strings or comments does not count at all. Zero **class-position** token references makes a rule a deletion **CANDIDATE only**; the rule is then inspected for selector dependencies (compound selectors, `:has()`, attribute selectors referencing it, keyframes it alone references) before it is declared dead. **Known live, never a candidate: `clip-modal`** (FetchBrowser.tsx:212).

Runnable token check for any candidate (delimiters are the class-name charset, so `bench-take-chip` does not match `bench-take-chip-copy`):

```sh
grep -rnE "(^|[^a-zA-Z0-9_-])<TOKEN>([^a-zA-Z0-9_-]|$)" src/ --include='*.tsx' --include='*.ts'
```

…then manually strike prose hits (string literals that are sentences, comments, JSDoc examples) and template-composition hits (`${…}` suffix/prefix families — see §8's live-composition list).

---

## 1. Native confirms and prompts → ConfirmDialog / PromptDialog (task 15)

Actuals at pin: `window.confirm(` **×7**, `window.prompt(` **×4** — matches spec §2.0 exactly.

| # | Site | Kind | Replacement / notes |
|---|---|---|---|
| 1 | `src/views/SettingsView.tsx:97` | confirm | Reset generation defaults. Danger framing (destructive reset with delta summary). |
| 2 | `src/canvas/Tile.tsx:37` | confirm | Send tile to dataset manager. |
| 3 | `src/canvas/PropertiesPanel.tsx:865` | confirm | Delete control track (blast-radius body). |
| 4 | `src/datasets/DatasetsApp.tsx:268` | confirm | Enable CLIP embeddings (download consent). |
| 5 | `src/datasets/DatasetsApp.tsx:459` | confirm | PySceneDetect accept-all split (capture in a var, then branch — note it is NOT a guard-return form). |
| 6 | `src/datasets/DatasetsApp.tsx:473` | confirm | Trash this source (blast radius). |
| 7 | `src/datasets/DatasetsApp.tsx:525` | confirm | Empty the trash — the one real delete; danger. |
| 8 | `src/datasets/DatasetsApp.tsx:223` | prompt | Reference media by absolute path. |
| 9 | `src/datasets/DatasetsApp.tsx:238` | prompt | Send canvas take/media to dataset manager. |
| 10 | `src/datasets/DatasetsApp.tsx:300` | prompt | **The batch-instruction site** — currently `?? ''` (cancel executes the default batch). §0.6 decision: cancel ABORTS; migrate FIRST (plan task 15). |
| 11 | `src/datasets/DatasetsApp.tsx:482` | prompt | Re-path a missing (hash-matched) file. |

- **retired selectors:** `grep -rn "window\.confirm(" src/` → currently **7**; `grep -rn "window\.prompt(" src/` → currently **4**; target **0** for both (comment mentions in `SettingsView.tsx:91`, `IndexOverlay.tsx:206`, `canvas.css:506` are prose, not calls — the call-pattern grep already excludes them; leave the prose alone or reword at migration, no quota).
- **retained geometry:** none (native dialogs carry no CSS).
- **behavior tests:** `e2e/datasets.spec.ts › prompt dialog: batch cancel executes nothing (no POST)` (Review Focus #5); `e2e/datasets.spec.ts › confirm dialog: danger framing and ×-handler ownership`; `e2e/settings.spec.ts › confirm dialog: reset-defaults consent`.

## 2. Button busy — the LoaderCircle subset (task 7)

Actuals at pin: `<LoaderCircle` JSX sites **×32** (matches the ×32 baseline). **Button-busy subset = 27**; the other **5 are non-button busy/boot indicators** and stay. The spec's "not all 32 are button swaps" is confirmed by enumeration:

**In scope (27 button sites → `Button busy`, visuals unchanged):**

`src/components/PromptLibraryBrowser.tsx:134` · `src/components/StructuredPromptEditor.tsx:129,138,522` · `src/components/FetchBrowser.tsx:193,251` · `src/views/DiagnosticsView.tsx:303` · `src/views/SettingsView.tsx:281,362,376,417,521,572,580,583` · `src/canvas/FirstRunWizard.tsx:210,219,265` · `src/canvas/RemediationDock.tsx:106` · `src/datasets/CaptionPanel.tsx:154,177` · `src/canvas/PropertiesPanel.tsx:1065,1068,1073,1332` · `src/images/WorkbenchApp.tsx:1164` · `src/datasets/DatasetsApp.tsx:810`

**Out of the button subset (5, remain as-is):** `src/main.tsx:50` (boot fallback), `src/canvas/PoseRigDock.tsx:23` (rig-loading fallback), `src/images/WorkbenchApp.tsx:754,757` (workbench boot), `src/datasets/DatasetsApp.tsx:406` (ds-busy panel strip).

- **retired selectors:** the conditional-icon-in-button idiom — `grep -rnE "\? <LoaderCircle" src/ | grep -v "ds-busy"` → currently **27**; target **0** (the ds-busy panel strip is not a ternary; the `grep -v` is belt-and-braces, its line is listed above as out-of-scope). *(Task-7 annotation, 2026-10-04: the mechanism itself — `src/ui/Button.tsx`'s internal busy ternary — now owns ONE occurrence of this shape; the re-run pattern is `grep -rnE "\? <LoaderCircle" src/ | grep -v "ds-busy" | grep -v "src/ui/Button.tsx"` → target 0. No scope change — the 27 consumer idiom sites are gone; the component IS the replacement.)*
- **retained geometry:** `grep -rn "<LoaderCircle" src/ | wc -l` → currently **32**; target **exactly 5** (the enumerated non-button sites). *(Task-7 annotation, 2026-10-04: post-migration the count is **6 = the 5 enumerated non-button sites + `src/ui/Button.tsx`'s single internal spinner** — the busy mechanism the 27 sites were replaced BY. Same rationale as above; no scope change.)*
- **behavior tests:** `tests/button-classes.test.js` (node, class map) + `e2e/settings.spec.ts › button: busy = LoaderCircle + aria-busy + disabled` and `› button: icon-only requires aria-label (dev warn)`. *(Task-7 annotation, 2026-10-04: the icon-only test lives in `e2e/datasets.spec.ts` (the trash-source action — the batch's real migrated icon-only Button; the settings surface has no migrated icon-only site, and the dev warn itself is node-covered in button-classes.test.js (g) since e2e runs the production build where `import.meta.env.DEV` is false).)*

## 3. Dialogs

### 3.1 StudioDialog consumers (×4) — registry integration (task 10)

Actuals: exactly **4** consumers. These are the migration's stable base (and task 10's real-consumer test bed: PromptLibraryBrowser).

| Consumer | Site | popupClassName (geometry rides here) |
|---|---|---|
| FetchBrowser consent | `src/components/FetchBrowser.tsx:207` | `"clip-modal fetch-consent-modal"` (**known live**, §0) |
| CameraPathEditor | `src/components/CameraPathEditor.tsx:207` | `"camera-path-modal"` (`:211`) |
| PromptLibraryBrowser | `src/components/PromptLibraryBrowser.tsx:118` | `"prompt-library-modal"` |
| OpEditor | `src/canvas/OpEditor.tsx:223` | `"canvas-opmodal"` (`:227`) |

- **retired selectors:** none new (these already use StudioDialog). The extra window-level Escape listener `src/canvas/OpEditor.tsx:100` retires into the registry — `grep -n "addEventListener('keydown'" src/canvas/OpEditor.tsx` → currently **1**; target **0**.
- **retained geometry:** `grep -rn "popupClassName=" src/components/ src/canvas/OpEditor.tsx` → currently **4**; target **4** hits, PRESENT (geometry classes keep their names).
- **behavior tests:** `tests/layerRegistry.test.js` (node: ordering, non-top removal) + `e2e/canvas.spec.ts › layer registry: Escape closes only the topmost layer` (open PromptLibraryBrowser over a registry-registered stand-in overlay — Review Focus #1's mechanism).

### 3.2 IwDialog → StudioDialog (task 12)

Actuals: exactly **3** dialogs at the spec's verbatim lines; the local component itself lives at `src/images/WorkbenchApp.tsx:1538`.

| # | Site | Dialog |
|---|---|---|
| 1 | `src/images/WorkbenchApp.tsx:1254` | Start-frame exit (also HandoffResult's first consumer, §11). |
| 2 | `src/images/WorkbenchApp.tsx:1329` | Canvas-ref picker (the nested case — unwinds topmost-first under Caption→VLM-style nesting). |
| 3 | `src/images/WorkbenchApp.tsx:1496` | Mask painter (`dialogClassName="iw-mask-dialog"`). |

- **retired selectors:** `grep -n "IwDialog" src/images/WorkbenchApp.tsx` → currently **7** (the 3 open/close pairs + the component definition at `:1538`); target **0** (the bubbling-only × dies with the component; StudioDialog owns Escape/× semantics).
- **retained geometry:** `grep -n "iw-mask-dialog\|iw-exit-choices" src/images/workbench.css` → PRESENT (geometry migrates to popup/backdrop/center classes per StudioDialog's portal structure — CV13's ancestry-sensitive selectors).
- **behavior tests:** `e2e/images.spec.ts › iw dialogs: trap/restore/Escape via the registry wrapper; × owns its handler; nested picker unwinds topmost-first; scroll containment + long content`.

### 3.3 The datasets overlays (×3) → StudioDialog semantics (task 13)

Actuals: **3** overlays. **Baseline correction (§14):** the crop editor is no longer roleless — the A09 remediation (Codex audit 2026-10-02) gave it `role="dialog"` + `aria-modal` + `aria-labelledby` + a hand-rolled focus trap. Caption and the nested VLM remain genuinely roleless. All three still use **window-level** keydown listeners, which spec §2.1 acknowledges and supersedes.

| # | Site | Semantics today |
|---|---|---|
| 1 | Crop editor — `src/datasets/CropEditor.tsx:289` (`.ds-editor-overlay` → `.ds-editor`) | roles present (`:292-296`), hand-rolled trap (`:170-198`), window-Escape with busy guard (`:161-165`) |
| 2 | Caption panel — `src/datasets/CaptionPanel.tsx:124` (`.ds-caption-panel`) | no role, no trap; window-Escape (`:48-58`) with VLM-first ownership |
| 3 | Nested VLM — `src/datasets/CaptionPanel.tsx:165` (`.ds-vlm-modal` → `.ds-vlm-box`) | no role, no trap; owned by caption's handler |

- **retired selectors:** `grep -rn "addEventListener('keydown'" src/datasets/` → currently **3** (CropEditor.tsx:164 window-Escape, `:193` the Tab-trap panel listener, CaptionPanel.tsx:57 window-Escape); target **0** (both window listeners superseded by the registry; the trap at CropEditor:170-198 is superseded by StudioDialog's real trap — remediation gets the credit, this round gets the consolidation).
- **retained geometry:** `grep -n "ds-editor\b\|ds-caption-panel\|ds-vlm-box" src/datasets/datasets.css` → PRESENT.
- **behavior tests:** `e2e/datasets.spec.ts › datasets overlays: VLM-Escape closes only VLM; focus restore; busy guard defers Escape + outside-press + Close uniformly (C1)`.

## 4. Docks — resize literals and the raise discipline (tasks 3, 11, 17)

Actuals at pin: **7 common-policy resize sites across 6 components**, plus PoseRigDock's distinct policy — reconciling the spec's "×7 across 6" exactly (AudioDock's two branches are two of the seven sites in one component).

| # | Site | min sizes | Policy |
|---|---|---|---|
| 1 | `src/canvas/DiagnosticsDock.tsx:35-36` | 460×300 | common |
| 2 | `src/components/LibraryDock.tsx:60-61` | 460×300 | common |
| 3 | `src/canvas/RemediationDock.tsx:68-69` | 420×240 | common |
| 4 | `src/canvas/SettingsDock.tsx:113-114` | 420×280 | common |
| 5 | `src/canvas/AudioDock.tsx:89-90` (branch A) | 320×300 | common |
| 6 | `src/canvas/AudioDock.tsx:112-113` (branch B) | 320×300 | common |
| 7 | `src/canvas/PropertiesPanel.tsx:980-981` (inspector Rnd) | 300×240 | common |
| — | `src/canvas/PoseRigDock.tsx:66-67` | **720×420** | **distinct** (no `enableResizing` literal at all — full-edge default) — preserved per spec §2.0 |

All 8 Rnd instances in the tree are enumerated above (verified: `grep -rn "<Rnd" src/ --include='*.tsx'` → 8).

- **retired selectors:** `grep -rnE "minWidth=\{[0-9]+\}|minHeight=\{[0-9]+\}" src/canvas/ src/components/LibraryDock.tsx` → currently **16 lines** (the 8 pairs above); target **0** (the literal moves into `StudioDock`'s `resizePolicy` default; PoseRigDock passes its distinct policy). Also retired at task 3: the CSS z pins — `grep -nE "^\.canvas-inspector \{ z-index: 40|^\.canvas-poserig-dock \{ z-index: 55|^\.canvas-audio-dock \{ z-index: 55" src/canvas/canvas.css` → currently **3** (`:163` inspector, `:590` pose-rig — the two the spec names — plus `:605` audio, same family, both AudioDock branches migrate at task 3); target **0**.
- **retained geometry:** PoseRigDock's 720/420 values remain expressible — `grep -n "720" src/canvas/PoseRigDock.tsx` → PRESENT (as the `resizePolicy` argument), never coerced to the common default.
- **behavior tests:** `e2e/canvas.spec.ts › raise discipline: newest-interacted wins (inspector↔settings, inspector↔audio both branches, pose-rig dock both directions)` (task 3, Review Focus adjacent) and `› reactive ranks: 50 raises stay in-band with relative order preserved; modal above top dock; consent above modal` (task 11); `› studio dock shell: raise/resize/close via shell; inspector still raises` (task 17).

## 5. Chip / badge / pill taxonomy (task 6)

Actuals: **29 class tokens** (≥25 confirmed) — 26 member tokens + 3 container tokens. Taxonomy with membership and consumer counts (tsx token refs at pin):

| Token | Refs | Consumers | Exemption |
|---|---|---|---|
| `canvas-chip` | 62 | Launcher, FirstRunWizard, OpEditor, IndexOverlay, LibraryOverlay, BottomBar, RemediationDock, TimelineOverlay, PropertiesPanel, WorkbenchApp | — (first row fully worked, plan task 6) |
| `canvas-engine-chip` | 1 | Radar.tsx | — |
| `canvas-take-chip` / `-empty` | 6 / 1 | Tile.tsx | — |
| `canvas-op-chip` / `-empty` | 2 / 1 | Tile.tsx | — |
| `canvas-bar-chip-tile` | 1 | BottomBar.tsx | — |
| `canvas-tile-stale-badge` | 1 | Tile.tsx | — |
| `canvas-properties-ref-tag` | 3 | PropertiesPanel.tsx | — |
| `ds-chip` | 4 | DatasetsApp.tsx | — |
| `ds-aspect-chip` | 1 | CropEditor.tsx | dashed-custom geometry preserved (CV02 names it) |
| `ds-bucket-badge` (+`wall-warn`/`wall-stop` composed) | 1 | DatasetsApp.tsx:630 | — |
| `ds-cluster-badge` | 1 | DatasetsApp.tsx | — |
| `ds-stale-badge` | 1 | DatasetsApp.tsx | — |
| `ds-interp-badge` | 1 | DatasetsApp.tsx | — |
| `ds-review-badge` | 1 | DatasetsApp.tsx | — |
| `health-pill` (+`online`) | 10 | DiagnosticsView, SettingsView | — |
| `structured-pin-badge` | 1 | StructuredPromptEditor.tsx | — |
| `prompt-library-technique-badge` | 1 | PromptLibraryBrowser.tsx | — |
| `llm-family-badge` | 1 | SettingsView.tsx | — |
| `iw-canvas-tag` / `iw-poserig-tag` / `iw-refmod-tag` | 1 each | WorkbenchApp.tsx | — (iw-family rectangles, CV02; the tags label references — the pose-rig AUTHORING surface is the exempt thing, not this workbench tag) |
| `canvas-launcher-chips` (container) | 1 | Launcher.tsx | — |
| `structured-chips` (container) | 1 | StructuredPromptEditor.tsx | — |
| `proto-badge` | 3 | PrototypeShell, Stage | **EXEMPT** (prototype family, spec §3/§2.0) |
| `bench-take-chip` / `-copy` | 1 / 1 | ShotBench.tsx | **EXEMPT** (prototype) |
| `score-graph-chips` (container) | 1 | Score.tsx | **EXEMPT** (prototype) |

Selection-contract sites (spec §0.3) enumerated — roles declared, roving tabindex/arrows NOT implemented anywhere (verified):

- BottomBar lanes — `src/canvas/BottomBar.tsx:131-133` (`role="radiogroup"` + `role="radio"` + `aria-checked`)
- Speed-tier chips — `src/canvas/PropertiesPanel.tsx:1117-1123`
- VDN-rung chips — `src/canvas/PropertiesPanel.tsx:1141-1147`
- Prompt-mode radios — `src/canvas/PropertiesPanel.tsx:1006-1008`
- Independent toggles (render as pressed buttons post-migration): tier-selected buttons `src/views/SettingsView.tsx:303-304,599`; library-filter chips (IndexOverlay/LibraryOverlay); ~~mode toggles in StructuredPromptEditor~~ (**no target at HEAD** — task 6 fix round 1: the structured editor's chips row is insert ACTIONS and its box headers are `aria-expanded` disclosures; no mode-toggle exists there. Planning-time approximation, annotated rather than silently dropped.)

- **retired selectors (tone rules):** `grep -nE "\.canvas-chip\.(active|danger|primary)|\.canvas-chip:(hover|disabled)" src/canvas/canvas.css` → currently **8** (`:145,146,499-501,749-751`); target **0** (→ `.chip--{tone}` recipes). Same shape per family: `.ds-btn.(primary|danger|ghost)`, `.health-pill.online`, etc.
- **retained geometry (shape rules):** `grep -n "^\.canvas-chip {" src/canvas/canvas.css` → PRESENT (the pill's padding/radius/gap), plus `.canvas-properties-tiers .canvas-chip` (canvas.css:326) and `.canvas-library-filters .canvas-chip` (canvas.css:627); `.ds-aspect-chip`'s dashed border treatment stays; iw tags keep rectangle geometry. **NO padding/radius/font in the shared chip classes** (P06).
- **behavior tests:** `tests/chip-classes.test.js` (node class map) + `e2e/canvas.spec.ts › chip group: ArrowRight moves selection AND focus; Tab exits the group as one unit; independent toggles flip aria-pressed on Space/Enter` (Review Focus #2).

## 6. statusToken domains (task 4)

Four map sites enumerated (spec §2.1):

| Domain | Sites today |
|---|---|
| Tile state | `src/canvas/Tile.tsx:131` (`data-canvas-live={job.status}` + tone classes), `:195` (failure, `role="alert"`); tone rules in `src/canvas/canvas.css` |
| Connection health | `health-pill … online` — `src/views/DiagnosticsView.tsx:233,252,293`; `src/views/SettingsView.tsx:300,517,560`; `src/canvas/Radar.tsx:109` (`status-dot`) |
| Doctor severity | `doctor-check ${…}` — `src/views/DiagnosticsView.tsx:235,275,305`; `src/views/SettingsView.tsx:584,592` (ok/warn/fail) |
| Install state | node-pack rows — `src/views/SettingsView.tsx:405` (`node-pack-license ${…}`) + the pack folderState/availability conditionals in the `node-pack-row` render (`:403-421`) |

- **retired selectors:** the four hand-rolled maps' color branches collapse into `statusToken()` — per-domain grep examples: `grep -n "health-pill .*online" src/views/DiagnosticsView.tsx` → target **0** inline conditionals (the tone token comes from the map).
- **retained geometry:** `grep -n "\.health-pill {" src/styles.css` → PRESENT (shape untouched; tone only).
- **behavior tests:** `tests/statusToken.test.js` (node — membership verified against `src/styles.css` `:root` parsed at run time; exhaustive divergence table) + scoped Playwright per domain (browser-computed values as final authority).

## 7. ToastHost + NoticeBanner (task 9)

| Site | Family | Notes |
|---|---|---|
| `src/canvas/CanvasToasts.tsx:11-19` | ToastHost | the shared canvas strip; zustand store supplies toasts/timeouts; adapter pattern (P07) keeps it PURE |
| `src/images/WorkbenchApp.tsx:1273-1279` (`iw-notice`) | ToastHost | **the Workbench inline copy dies**; WorkbenchApp mounts the adapter with `placement="bottom-right"` |
| `src/datasets/DatasetsApp.tsx:356` (`ds-notice`) | NoticeBanner | roleless today → `role` + aria-live |
| `src/datasets/DatasetsApp.tsx:357` (`ds-error-banner`) | NoticeBanner | roleless today → `role="alert"` + aria-live |

- **retired selectors:** `grep -n "iw-notice" src/images/WorkbenchApp.tsx` → target **0** (the inline strip; workbench.css `.iw-notice` rules retire with it).
- **retained geometry:** `grep -n "canvas-toasts\|canvas-toast " src/canvas/canvas.css` → PRESENT (canvas placement unchanged).
- **behavior tests:** `e2e/canvas.spec.ts › toast host: roles, placement prop, × handler` and `› datasets banners announce (role + aria-live)`.

## 8. Dead CSS — the selector-level deletion list (task 9)

Consumer-check method per §0. Each family below: **zero class-position token references** (verified — the only string hits are prose/comments/other tokens), and the dependency inspection result.

**Provenance (fix round 1, 2026-10-04):** the spec §2.0 baseline names four dead families (`.notice`, shell/nav, mobile-sidebar, consumerless `.progress`); `.mode-tabs` is the fifth, authorized by the plan-r3 task-1 seed (the reviewed plan enumerates it in its dead-list alongside the spec's four — the manifest, as the plan's own Task 1 deliverable, carries it in that chain). Recorded here so the deletion set's authorization is traceable to a named artifact either way.

| Family | Rules (file:line at pin) | Consumer-check result | Dependency inspection |
|---|---|---|---|
| `.notice` | `src/styles.css:242-246` (sticky base, `.success`, `.error`, `span`, `button`), `:519-520` (fixed variant + `@keyframes notice-enter`) | ZERO — token hits are only `iw-notice` / `ds-notice` / `node-pack-managed-notice` (different tokens) and prose strings | all compound selectors are `.notice`-internal; the keyframes is referenced only by the dead `:519` rule. **DEAD — confirmed** |
| `.mode-tabs` | `src/styles.css:145-152`, `:458-461` (spectrum `:nth-child` variants), `:394` (900px block) | ZERO | `:nth-child()` compounds are `.mode-tabs`-internal. **DEAD — confirmed** |
| Shell/nav grid | `.app-shell` `src/styles.css:118`; `.titlebar` `:119`; `.sidebar` `:122`; `.sidebar nav` `:125`; `.nav-button` family `:126-135`; `.nav-button` spectrum `:448-452`; 900px block `:391-393` | ZERO (each token) | attribute selectors (`[data-item-type]`) hang off `.nav-button` itself; `--sidebar` (`:20`) is consumed only by `:118`/`:391` → orphaned with the family (remove together). **DEAD — confirmed** |
| Mobile-sidebar block | the 680px block's dead lines `src/styles.css:399-405` (`.app-shell`/`.titlebar`×2/`.sidebar` fixed/`.sidebar nav`/`.sidebar .nav-button`×2) | ZERO | the block's REMAINING lines (`:406-422`) are live settings-page responsiveness (`.standard-page`, `.diagnostic-action`, `.smart-insert-menu`, …) — **delete lines, keep the block**. **DEAD — confirmed** |
| Consumerless `.progress` | `src/styles.css:238-240` (`.progress`, `.progress i`, `.progress.compact`) | ZERO — live bars are different tokens: `fetch-progress` (FetchBrowser.tsx:182), `canvas-tile-progress` (Tile.tsx:192), `proto-queue-progress` (exempt) | no external compounds. **DEAD — confirmed** |

Interleaved LIVE rules inside the dead region — do **not** delete: `.status-dot` (`styles.css:120`, live at `src/canvas/Radar.tsx:109`), `.icon-button` (`:123-124`, 5 consumers), everything at `:406-422` in the 680px block, `.generation-defaults-grid` (`:395`, live in SettingsView). Provenance note: this family is the canvas-ui-v1 §8 Phase-5 view retirement — the old app shell whose views were deleted; the CSS was kept as a "git-visible design record" (comment at `styles.css:689-694`) with e2e absence assertions already pinning it dead.

**Live via template composition — never candidates** (the naive token search calls these zero; they are not): `kind-black`/`kind-flf` (TimelineOverlay.tsx:218), `verdict-fits`/`verdict-near-wall`/`verdict-over-wall` (DatasetsApp.tsx:669,674), `tier-refuse`/`tier-warn` (DatasetsApp.tsx:828), `wall-warn`/`wall-stop` (DatasetsApp.tsx:630), `health-missing` (DatasetsApp.tsx:578).

- **retired selectors (verification):** `grep -nE "^[[:space:]]*(--sidebar:|\.(notice|mode-tabs|app-shell|titlebar|sidebar|nav-button|progress)\b)" src/styles.css` → currently **52 rule lines** (enumerated above; the selector-position anchor keeps comment mentions such as `styles.css:693` out of the count); target **0**. The `@keyframes notice-enter` (`:520`) rides with `:519`.
- **retained geometry:** n/a (pure deletion; no line-count quotas — spec §2.0).
- **behavior tests:** the absence anchors already exist and must stay green — `e2e/app.spec.ts › boots to the canvas app by default — no param, no old shell (§8 Phase 5)` and `› the 7 greyed views are deleted: no nav, no markers, no surfaces (§8 Phase 5)` (`.app-shell`/`.sidebar`/`.nav-button`/`.retired-affordance` → `toHaveCount(0)`, app.spec.ts:65-69); plus the full local gate at task 24.

## 9. StudioSelect + PopoverMenu (task 16)

Native `<select>` sites at pin: `grep -rn "<select" src/ --include='*.tsx'` → **36 total = 35 in-scope + 1 exempt** (exempt: `src/poserig/PoseRigApp.tsx:424` — pose-rig authoring surface). Full enumeration:

`src/components/form.tsx:7` (the shared form select) · `src/components/PromptLibraryBrowser.tsx:131` (sort) · `src/components/StructuredPromptEditor.tsx:325,433` · `src/components/CameraPathEditor.tsx:333,346,353,359,391` · `src/views/SettingsView.tsx:335,491,564` · `src/canvas/OpEditor.tsx:353,426` · `src/canvas/TimelineOverlay.tsx:182` · `src/datasets/DatasetsApp.tsx:643` · `src/canvas/PropertiesPanel.tsx:322,379,1185,1230,1255,1278,1284,1355` (ref-character binding)`,1371` (ref-location)`,1390` (ref-asset)`,1413` (clothing) · `src/images/WorkbenchApp.tsx:1002,1016` (ref slot role/transport)`,1063` (lora name)`,1083` (tier)`,1097` (resolution-locked, disabled)`,1134` (machinery)`,1363,1367` (ratio, resolution)

Popover/menu dismissal idioms to unify: ForkMenu (`src/canvas/ForkMenu.tsx:35` — backdrop-click only, **no Escape**), EndpointMenu (`src/canvas/EndpointMenu.tsx:78,88` — backdrop + inline Escape with `stopPropagation`), IndexOverlay (`:297` — inline Escape + `stopPropagation`), LibraryOverlay (`:134` — same idiom), the smart-insert menu (`src/components/SmartPromptEditor.tsx:84`, own keydown handling).

- **retired selectors (count acceptance):** `grep -rn "<select" src/ --include='*.tsx' | grep -v 'src/ui/StudioSelect.tsx'` → currently **36** (35 in-scope + the exempt pose-rig site); target **1** — the exempt `src/poserig/PoseRigApp.tsx:424` ONLY (the one shared native element inside StudioSelect itself is excluded so the count tracks consumer sites, not the component's own implementation). The sweep owns the count: a re-run that reports more than the exempt site is a miss, never a false-green.
- **retired selectors (dismissal idioms):** the divergent dismissal idioms — `grep -rnE 'canvas-menu-backdrop" onClick' src/canvas/` → currently **2** (ForkMenu.tsx:35, EndpointMenu.tsx:78); target **0** (PopoverMenu/registry owns dismissal; one idiom). The inline `stopPropagation` Escape handlers (EndpointMenu.tsx:88, IndexOverlay.tsx:297, LibraryOverlay.tsx:134) retire with them.
- **retained geometry:** `grep -n "select-wrap" src/styles.css` → PRESENT (the wrap geometry stays; StudioSelect styles the inside).
- **behavior tests:** `e2e/settings.spec.ts › studio select: chevron/overflow/focus-visible; eager value capture` + `e2e/canvas.spec.ts › popover menu: one Escape closes topmost only; outside-press via Base UI`.

## 10. Recipes on the chip system (spec §1.4; tasks 6–8)

| Recipe | Members at pin | Exemptions |
|---|---|---|
| kbd | `src/styles.css:177` (smart-insert), `src/canvas/canvas.css:35` (index button), `:585` (opmodal footer); unstyled `<kbd>` in BottomBar (BottomBar.tsx:126,176,178,179,198), Radar (:114,117,126), OpEditor (:450), SmartPromptEditor (:84) | `.proto-kbd` (proto.css:26,144), poserig.css:47 — **EXEMPT** |
| Micro-labels | 16 `-label` classes: `canvas-index-row-label`, `canvas-lora-gap-label`, `canvas-lora-rail-label`, `canvas-menu-group-label`, `canvas-menu-row-label`, `canvas-op-label`, `canvas-prompt-suggestion-label`, `canvas-properties-dial-label`, `canvas-properties-ref-label`, `canvas-tile-live-label`, `structured-audio-label`, `camera-orbit-label`, `camera-path-presets-label` (in scope); `bench-outline-label`, `bench-take-label`, `proto-queue-label` (**EXEMPT**) | as listed |
| EmptyState | in-scope: `canvas-tile-poster-empty`, `canvas-index-empty`, `canvas-op-empty`, `canvas-opmodal-empty`, `canvas-properties-empty`, `canvas-timeline-empty`, `ds-empty`, `filmstrip-poster-empty`, `iw-empty-frame`, `iw-preview-empty`, `iw-takes-empty`, `prompt-library-empty`, `smart-insert-empty`, `stage-panel-empty`, `canvas-take-chip-empty`, `canvas-op-chip-empty` | **EXEMPT:** `proto-poster-empty`, `bench-diff-empty` |
| Disclosure markers | `src/views/SettingsView.tsx:471` (native `<details>`/`<summary>` + ChevronDown — the canonical one), `:501`; `src/components/StructuredPromptEditor.tsx:161` (ChevronRight/Down collapse pairs); `src/components/form.tsx:7` (select chevron) | prototypes' Score.tsx:109 — **EXEMPT** |
| Scalar progress bars | `fetch-progress`/`fetch-progress-bar` (FetchBrowser.tsx:182-183, `role="status"`), `canvas-tile-progress` (Tile.tsx:192, indeterminate) | **EXEMPT:** `proto-queue-progress` (prototype queue bars), `canvas-wizard-progress` (FirstRunWizard.tsx:148 — wizard step indicators), spec §2.1 narrowing |

- **retired selectors (kbd):** `grep -n "kbd" src/styles.css src/canvas/canvas.css` → currently **3** (styles.css:177, canvas.css:35,585); target **0** (the kbd recipe on the chip system carries border/background/font tokens centrally).
- **retained geometry:** per-surface geometry stays (P06) where a surface needs non-recipe dimensions — verified per site at migration; the recipe owns tone.
- **behavior tests:** `tests/chip-classes.test.js` covers recipe composition; gallery state matrices (task 23) render every recipe against live tokens.

## 11. The semantic five — first consumers and membership (tasks 18–22)

| Component | Named first consumer | Additional enumerated membership |
|---|---|---|
| Field | the datasets trigger control — `src/datasets/CaptionPanel.tsx:138-150` (textarea, placeholder-as-label, validation list with NO `aria-describedby` wiring) | `src/components/form.tsx` field-group pattern; settings field-groups (`SettingsView.tsx:564` region) |
| Effective-setting row | the properties dial rows — `src/canvas/PropertiesPanel.tsx:1439-1451` (identity-strength dial: stiff/drift labels + value) and the model-override selects `:1230`; resolver = `src/lib/modelOverrides.ts` (`OverrideSlotOutcome`, the `{ state: 'auto' }` variant at `:354-358`) | `src/views/SettingsView.tsx:491` (global slot selects) |
| Save status | the inspector's Generate — `src/canvas/PropertiesPanel.tsx:455,597-602,1561-1563` (`saveState: 'saving'\|'saved'\|'failed'`) | `src/canvas/SettingsDock.tsx:163` (settings-dirty-state, `role="status"`); `src/datasets/CaptionPanel.tsx:152` (ds-status savedAt) |
| Refusal | the image-lane gate — `src/images/WorkbenchApp.tsx:1156-1163` (Generate disabled + `title` carrying missingModels/missingNodes; honest refusal, not dimming) | reference pattern: the launcher gate (`src/canvas/Launcher.tsx:91` region — refused engine surfaces honestly) |
| Handoff result | the workbench exit — `src/images/WorkbenchApp.tsx:1254-1270` (Start-frame exit; per-step pin/chain outcomes in `runExit`) | — |

- **retired selectors:** per-instance ad-hoc state markup — e.g. `grep -n "saveState === 'saving'" src/canvas/PropertiesPanel.tsx` → target **0** (SaveStatus renders it).
- **retained geometry:** `grep -n "settings-dirty-state" src/canvas/canvas.css` → PRESENT (per-surface geometry).
- **behavior tests:** Review Focus #3 `e2e/canvas.spec.ts › effective row: chain reset reveals global without deleting it (settings API assert)`; #4 `e2e/images.spec.ts › handoff: retry re-runs only the failed write (pin endpoint hit exactly once); write-success+refresh-failure renders done+stale`; plus `e2e/datasets.spec.ts › field: error announcement association, error > hint precedence`; `e2e/images.spec.ts › refusal: reason + satisfaction path at the image-lane gate`.

## 12. Exempt families (spec §3 / §2.0 — absorbed at their owners' discretion, never mandatory)

| Family | Sites | Spec ref |
|---|---|---|
| Prototypes (`proto-*`, bench, score) | `src/prototypes/*` — `proto-badge`, `proto-kbd`, `proto-queue-progress`, `proto-queue-label`, `bench-take-chip(-copy)`, `bench-diff-empty`, `bench-outline-label`, `bench-take-label`, `score-graph-chips`, `score-bar` | §3 "prototype/pose-rig migration (exempt)"; §2.0 chip baseline |
| Pose-rig authoring surface | `src/poserig/*` (incl. poserig.css kbd `:47`, its selects); the pose-rig DOCK (`PoseRigDock.tsx`) is canvas chrome and IS in scope (§2.1 scope note — two different things, both named) | §1.3 never-shared list |
| Wizard step indicators | `.canvas-wizard-progress` (`src/canvas/FirstRunWizard.tsx:148`, styles in canvas.css) | §2.1 ProgressBar narrowing |
| Prototype progress | `.proto-queue-progress` (`src/prototypes/PrototypeShell.tsx:215`) | §2.1 |
| Never-shared (structural, not sites) | StatusRing visual (token mapping only); fat docks; combobox/palette merge; domain resolution & operation orchestration | §1.3 |

Stylelint-guard suppressions (task 5) are permitted **only** on rows in this section — the exemption column above is the authoritative list.

## 13. Sweep findings beyond the locked scope — maintainer ruling required BEFORE any enters this manifest

The full normalized-token sweep (every class token in all 7 stylesheets vs every TSX/TS token reference) surfaced additional zero-consumer rules. **Governance (R2-04) forbids adding them as deletion rows without a recorded ruling.** Parked:

| Candidate | Rules | Evidence at pin |
|---|---|---|
| `.source-media-modal` | `src/styles.css:481-493` + media blocks `:494-501` | only reference is the JSDoc *example* at `src/ui/StudioDialog.tsx:28` — not a consumer |
| `.video-continuation` | `src/styles.css:504-511` + `:512-516` | zero class-position refs |
| `.crop-editor` | `src/styles.css:86-87` | datasets CropEditor uses `ds-editor*`; zero refs |
| `.live-preview` | `src/styles.css:94-97` | refs are lib comments only (workflow.ts:188 etc.) |
| `.media-drop`, `.media-drop-content`, `.remove-media`, `.upload-icon` | `src/styles.css:206-214` | zero refs |
| `.frame-grid` | `src/styles.css:204`, `:409` | refs are prose (engineSemantics.ts:25) |
| `.path-input` | `src/styles.css:323`, `:414` | zero refs |
| `.playback-error` | `src/styles.css:230` | zero refs |
| `.timeline-guides` | `src/styles.css:566` | ref is a comment (structuredPrompt.ts:489) |
| `.retired-affordance` | `src/styles.css:695` | zero refs — NOTE: deliberately kept as the Phase-5 design record, with e2e absence assertions (app.spec.ts:69); a ruling to delete it would also retire those assertions |
| `.iw-lora-add` (class form) | `src/images/workbench.css:108` | the live element uses the `data-iw-lora-add` **attribute** (WorkbenchApp.tsx:1076); the class selector is unreferenced |

Sweep false-positives recorded for the re-run: `.Root` and `.cjs` matched only inside CSS comments (styles.css:25, :141 — `Tabs.Root` prose, codemod name); the live-composition list in §8.

## 14. Baseline corrections vs spec §2.0 (actuals recorded, scope unchanged)

1. **"roleless datasets overlays ×3"** — the count holds; "roleless" does not (for one of three). CropEditor gained `role="dialog"` + `aria-modal` + a hand-rolled focus trap in the A09 remediation (CropEditor.tsx:292, 170-198). Caption and nested VLM remain roleless. Migration targets unchanged; §3.3 records the corrected semantics column.
2. **LoaderCircle ×32** — correct as JSX sites; the button-busy subset is **27** (enumerated in §2), non-button **5**.
3. **Resize literals ×7 across 6** — reconciles exactly as the 7 common-policy sites across 6 components (AudioDock contributes 2 sites), with PoseRigDock the distinct-policy 7th dock (§4). No discrepancy.
4. **Chip/badge/pill ≥25** — **29** tokens enumerated (§5), of which 4 token kinds are exempt (prototype family).
5. All other baselines verified exact: `window.confirm` ×7, `window.prompt` ×4 (batch site at DatasetsApp.tsx:300 with its `?? ''`), StudioDialog consumers ×4, IwDialog ×3 at WorkbenchApp.tsx:1254/1329/1496.

---

*Re-run contract (task 24): execute every §0-pattern grep at the round's head — retired → ZERO, retained → PRESENT, tests → green; then `grep -rn "window.confirm\|window.prompt" src/` → zero; then `pnpm gate` and the judged visual pass per plan task 24.*
