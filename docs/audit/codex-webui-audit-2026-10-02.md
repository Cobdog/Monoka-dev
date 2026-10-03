# Codex webui adversarial audit — 2026-10-02 (verbatim report, external auditor)

> Provenance: the external Codex audit run against the charter
> (`docs/audit/webui-adversarial-audit-charter.md`, eb2bd7e). Pasted verbatim
> below by the triaging agent (claude); no edits. Triage outcome: **all 11
> findings verified mechanically against the code** before tasking. Fix tasks:
> inspector save discipline (9cip2tm, A02+A04) · workbench write discipline +
> handoff (3tu6ei6, A03+A11+A05) · datasets dead-ends (k8y5hzk, A06+A07) ·
> e2e gate + build warning (3dvcjxr, A01) · type floor + a11y (beo7ts6,
> A10+A08+A09 incl. the walk's V3-claim correction).
>
> ⚠ Safety note for the record: the auditor reported its audit home reset
> mid-run and the app booted once with the default engine URL (8188) before it
> pinned the fake engine; it states a **read-only server-side heartbeat may
> have occurred** and certifies no generation was submitted. Flagged to the
> maintainer 2026-10-02.

---

Verdict: FAIL. The application's core architecture and many previously repaired flows hold, but save races, failed-save submission, and silent handoff loss violate the contract. The full E2E gate also fails.

Audited revision: eb2bd7e. No source or dependency changes; final git status --short was empty. Build/test commands generated their normal artifacts. Audit-owned servers have been stopped.

The UI/UX recommendations at the end are a separate opinion pass, explicitly requested by you. They are not counted as contract violations.

## 1. Executive verdict by surface

"PASS" means the exercised cases held, not proof that every possible interaction works.

| Surface | Verdict | Strongest evidence |
|---|---|---|
| Canvas + substrate | FAIL | Drafts disappear on immediate surface navigation; Generate submits the previous prompt after the new settings fail to save. Core take, recovery, and document tests otherwise passed. |
| Launcher | PASS | Lane/gate tests passed, including the explicit Mamad8 refusal. No evidence of a forbidden fallback masquerading as success. |
| Radar | PASS | Absent at calm rest; active-state checks passed. |
| Settings dock | PASS | Three-group organization present, model-class labels present, footer clearance held. Its size remains an opinion-pass concern. |
| Properties panel | FAIL | Failed settings persistence does not stop submission; debounce cleanup discards edits. Override precedence and graph assertions passed. |
| Images workbench v1 | FAIL | Concurrent edits overwrite one another; exit failure escapes without a useful UI error; pose references disappear during handoff. |
| Images workbench v2 | PASS | Absence is correct. No premature v2 implementation identified. |
| Datasets | FAIL | A valid 730 KB image fails before upload; a fresh dataset cannot configure the trigger needed to export through the UI. Crop keyboard/focus gaps remain. |
| Setup wizard | PASS | Four-step/reopen coverage passed. Probe copy and explicit-port choice inspected without invoking the off-limits port probe. |
| Pose rig | FAIL | Palette/export tests pass, but "Send to image workbench" returns with zero references. Reproduced twice. |
| Surface switcher | PASS-WITH-FINDINGS | Registry navigation and keyboard coverage passed; switching surfaces exposes the inspector's draft-loss defect. |
| Trash/export index | PASS | Tombstone → restore → gated empty and archive-export tests passed. |
| Structured-prompt editor | PASS-WITH-FINDINGS | Parsing, round trips, and graph-byte tests passed. Its inspector-hosted edits remain vulnerable to the save defects. |
| Camera editor | PASS-WITH-FINDINGS | Create/edit/preset/apply/reopen/graph coverage passed. Keyboard users cannot complete keyframe authoring; dialog lacks an accessible name. |
| Music 3 / audio dock | PASS-WITH-FINDINGS | Paused UI gate is honest; H3 joint-AV coverage remains live. Audio mock reload test fails with populated test history, but the fresh-home probe passes. |

### Cross-cutting invariants

| Charter invariant | Result |
|---|---|
| §5.1 — all health commands green | Failed: 116/117 E2E tests passed. |
| §5.2 — UI actions truthfully reach/persist through server routes | Failed: findings A02–A07 and A11. |
| §5.3 — model truth, attribution, recovery inventory | Held in exercised cases: override/graph assertions and guards passed. Restarting the fake engine with a different inventory replaced the old TE option without a page reload. |
| §5.4 — honest gates | Held in exercised cases: launcher, missing machinery, refinement, and paused audio explain their refusals. Dataset's trigger refusal is accurate, but the UI offers no way to satisfy it. |
| §5.5 — recovery and scrubbed diagnostics | Held within test coverage: recovery and diagnostic-sanitation suites passed. Live fake-engine loss did not blank the UI. |
| §5.6 — isolation | Partially held: datasets remained usable during engine loss. Cross-surface persistence and handoff boundaries fail. |
| §5.7 — console hygiene | Happy paths examined were clean; injected exit failure produced an unhandled rejection, A05. |

Method limitation: all generation submissions used fake engines. On resuming after interruption, the temporary app home had reset; I opened the app before discovering its default engine URL was again 8188. I immediately pinned it to the fake engine before submitting anything. A server-side read-only heartbeat may have occurred during that boot, so I cannot certify zero contact with the prohibited port. No real-engine generation was submitted.

## 2. Findings

| ID | Severity | Class | Surface / claim attacked | Evidence | Violated clause |
|---|---|---|---|---|---|
| A01 | S2 | NEW | Health: full E2E gate is green | Full run: 116 passed, 1 failed. Focused rerun fails identically: audio ring expected queued-gpu, received idle, at e2e/canvas.spec.ts:1736. Populated-history fixture explanation below. | Charter §5.1 |
| A02 | S1 | NEW | Inspector: failed save prevents unintended generation | Injected settings-update HTTP 500. UI showed both a save error and queue success; fake-engine graph contained the previous prompt. src/canvas/PropertiesPanel.tsx:569; swallowed rejection at src/canvas/store.ts:1856. | Charter §5.2; structured-prompt submission contract |
| A03 | S1 | NEW | Workbench: independent edits persist together | Delayed settings requests; changed intent, then Keep. Both requests succeeded, but the second contained the old intent and erased the new one. src/images/WorkbenchApp.tsx:239. | Charter §5.2; image-workbench-v1 §2 |
| A04 | S1 | NEW | Inspector: authored changes are autosaved | Edit prompt, immediately switch to Images, return: old prompt restored without warning. Debounce cleanup cancels rather than flushes pending commit. src/canvas/PropertiesPanel.tsx:72. | canvas-ui-v1 §2.2.10; charter §7.2 |
| A05 | S1 | NEW | Workbench exit: failure is reported to the user | Injected failure creating the continuation chain. Frame pin succeeded; dialog remained unchanged; browser emitted unhandled rejection. runExit has finally but no catch. src/images/WorkbenchApp.tsx:636. | Charter §5.2; image-workbench-v1 §9, §11.7 |
| A06 | S2 | NEW | Datasets: LAN upload accepts valid media | Valid 512×512 PNG, 730,183 bytes, yielded Upload ingest: 0 imported. Refusals: 1 and Maximum call stack size exceeded. No ingest request reached the server. src/datasets/DatasetsApp.tsx:200. | dataset-manager-v1 §2.1 |
| A07 | S2 | NEW | Datasets: fresh-user export cycle is available | Trigger is a static (unset) display. No UI caller for datasetsApi.saveSettings. Export refused: No trigger token is set. src/datasets/DatasetsApp.tsx:343; src/datasets/api.ts:153. | dataset-manager-v1 §4, §9, §12.8 |
| A08 | S3 | NEW | Camera: primary editing flow is keyboard accessible | Tab traversal never reaches keyframe controls. Rail/keyframe SVG interaction is pointer-only; dialog accessible name absent. src/components/CameraPathEditor.tsx:181, :243. | Charter §7.2; canvas-ui-v1 §3, §5.3 |
| A09 | S3 | STANDING | Dataset crop: modal contains keyboard interaction | No dialog role; Tab travels through background controls. Crop geometry is pointer-only. src/datasets/CropEditor.tsx:234. Prior: design-language C2/C10. Escape now works. | Charter §7.2; dataset-manager-v1 §3, §11 |
| A10 | S3 | STANDING | Workbench: claimed 11px helper floor holds | Computed warning/staging text is 7px. var(--text-2xs, 11px) uses the defined 7px token; fallback is not a minimum. src/styles.css:47; src/images/workbench.css:68, :115, :165. Prior V3, claimed zeroed in the perfect-state sweep. | Charter §6; walk §6, V3 floor claim |
| A11 | S1 | NEW | Pose rig → workbench: render becomes a pose reference | Twice: Send ingested the blob and navigated to Images, but references remained 0/9. Inbox was gone; no chain-update request occurred. Consumer removes inbox before session readiness, then patchSettings returns early. src/images/WorkbenchApp.tsx:239, :344. | Charter §3 pose-rig handoff, §5.2; image-workbench-v1 reference contract |

### Reproduction details for the highest-impact failures

**A02 — failed save still generates the wrong content.** (1) Open an existing generator's properties with saved prompt "Audit test shot". (2) Make /api/lan/documents/chains/update return HTTP 500 with "AUDIT save unavailable". (3) Change the prompt to "NEW PROMPT MUST NOT RUN OLD PROMPT". (4) Click Generate. Observed: UI showed both "The chain setting could not be saved: AUDIT save unavailable" AND "Generation added to the local ComfyUI queue." The fake engine's recorded graph contained "Audit test shot". setChainSettings catches the error and resolves; the caller then proceeds to submit.

**A03 — successful requests silently lose the new intent.** (1) Save "Baseline saved prompt". (2) Delay chain-update requests by 900 ms. (3) Change intent to "DO NOT LOSE THIS NEW INTENT". (4) Immediately set Keep to 0.73. (5) Wait. Final state: intent returned to baseline; Keep remained 0.73. The second request carried the old intent because each update builds a complete settings object from the same stale session snapshot. No failure notice appeared.

**A04 — switching surfaces discards a pending draft.** Fill the chain prompt with "UNSAVED NAVIGATION SENTINEL", immediately click Images, return to Canvas, reopen the inspector: the old prompt returns. The 500 ms save timer is cancelled on unmount.

**A11 — pose handoff is consumed before it can be saved.** Open "from pose rig", click "Send to image workbench". On both attempts: blob-ingest request occurred, navigation completed, inbox disappeared — but no chain-update request followed and no pose reference appeared.

### A01: scope of the E2E failure

The retained test home contained 129 jobs. The audio probe appends its mock job to the end of the loaded list (src/canvas/store.ts:2435). Persistence keeps only the first 100 (src/hooks/useGenerationQueue.ts:105, `jobsRef.current.slice(0, 100)`). The failed probe jobs were absent from persisted history. Running the same seed/reload probe in a fresh audit home produced queued-gpu correctly. That supports a populated-history fixture/persistence-boundary failure; it does not establish that the paused Music 3 product flow has regressed. Nevertheless, the requested full gate is not green.

### Ghost check

Searches found Phase-0 names in comments, historical compatibility descriptions, and legitimate H3 upscale node identifiers such as LTXVSeparateAVLatent. No surviving retired-lane/studio/mobile UI entry points found. The surface registry excludes prototypes and pose rig. The workbench's pose bridge opens a destination explicitly labelled DEV SURFACE; treated as an authorized bridge distinct from unframed retired navigation. Existing rename and palette-transition debt was not relabelled as a new regression.

## 3. Health-command results

- `pnpm typecheck` — exit 0.
- `pnpm lint` — exit 0, zero warnings.
- `pnpm test` — exit 0: 25 files passed, 314 passed | 2 skipped (36.77s).
- `pnpm test:e2e` — exit 1: 116 passed, 1 failed (9.1m) —
  `[e2e] › e2e/canvas.spec.ts:1718:5 › audio jobs relink after a mid-render reload through the canvas manifest (M1)`:
  expected tile ring "queued-gpu", received "idle" (timeout 10s). Focused rerun failed identically. Failure artifacts under test-results/pw/.
- Build warning: Rollup circular-chunk warning — `turboFetchPlan` re-exported through `src/lib/graph/index.ts` while both modules depend on each other; suggests pointing `src/canvas/PropertiesPanel.tsx` directly at the exporting module or configuring manualChunks. Chunk-size warnings also present.

## 4. Standing-tail status

- 14/M3 cross-class model options unmarked — **HELD** (picker labels distinguish classes; guards + override graph tests passed).
- 15/F12 raw JSON Manager note — **HELD** (readable message rendered).
- 17/W9 competing naming vocabularies — **HELD within examined views**.
- 18/C11 "17n+5" user copy — **HELD** (user-facing wording uses "engine frame grid").
- 19/W18 start-frame PreviewOverride — **HELD** (journey suite assertion passed).
- 21/W17 calm radar, probe honesty, seed maximum — **HELD**.
- Other sweep claims: workbench dialog semantics, settings footer clearance, trash cycle held. **V3's claimed helper-text floor did NOT hold (A10).** Dataset overlay focus handling remains C2/C10 (A09).

## 5. Three findings I would fix first

1. **A02** — submission after a failed save: the app executes content different from the user's instruction — the most dangerous trust failure.
2. **A03** — concurrent workbench writes erase intent under ordinary latency.
3. **A11** — pose handoff silently disappears: a primary cross-surface workflow completes its visible transition while losing the delivered reference.
(A04 belongs immediately behind: navigation should not be a data-loss boundary.)

## 6. Separate UI/UX critique and recommendations (opinion pass, not findings)

The workstation architecture is coherent; hierarchy inside workstations is less coherent — too much of the interface asks the user to understand engine machinery before their next creative decision. Highlights:

- **Workbench layout**: at 1920px the preview consumes most of the screen while intent/inputs crowd a narrow column; let the task panel grow; before the first result give intent more space, after generation emphasize selection/comparison.
- **Control vocabulary**: lead with outcome (generate/compose/edit/refine), disclose machinery where it affects the choice; preserve explicit refusal reasons.
- **Properties**: keep a compact effective-value + source + reset-to-inherit summary visible; group model choices by compatibility; filenames as secondary info.
- **Settings**: ~7,903px scroll, 84 controls, 15 sections — give each group a focused view, stable footer, contextual links; stay within interim scope.
- **Datasets**: organize around Import → Layers → Caption → Validate → Export with prerequisites up front and errors linking to the control.
- **Camera/crop**: pair visual editors with synchronized labelled numeric controls; a compact keyframe table for camera paths.
- **Status/errors**: persistent status beside the initiating action (saving/saved/failed/retry); multi-step handoffs identify which step completed/failed.
- **Type**: decision-bearing text 12–14px; the concrete contract failure is the ineffective 11px floor (A10). Keep SHIBUI; apply the token plan as one coordinated change; a new palette or component kit would not fix hierarchy/persistence.
- **Libraries**: extend existing @base-ui/react + StudioDialog consistently (the failures are often inconsistent use of available behavior); keep d3-zoom + react-rnd; consider @tanstack/react-virtual for measured large-list problems; evaluate dockview-react at the Control-Center round; yet-another-react-lightbox only if the review experience needs it. Prioritize a small shared component vocabulary — dialog, field, effective-setting display, save status, refusal, handoff result — before further layout expansion.
