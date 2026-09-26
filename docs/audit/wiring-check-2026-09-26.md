# Wiring check 2026-09-26 — feature-level dead-path inventory

> **Task:** Wiring check 2026-09-26 (shsl4kg) · **Epic:** Foundation remediation
> program (4lphxv8) · **Project:** Monoka-dev (r2lnrfw)
> **Maintainer ask (2026-09-26):** *"go through our code to do a wiring check —
> make sure we have no dead paths or features not wired in; if it finds
> something, #FIXME them so they are easy to find in a subsequent pass."*
> **Base:** main HEAD `00b15b8`. Every FIXME below is greppable as
> `FIXME(wiring)` and cites this document's section.

**Scope:** feature-level dead wiring — things BUILT but never REACHED from any
live user journey. Not style-level dead code: a private helper with one caller
is fine; an exported feature with zero live callers is a finding.

**Method.** Category-by-category sweeps (grep import graphs + the jcodemunch
index), then every candidate verified by tracing reachability from the real
entry points: app boot (`src/main.tsx` → surface registry → canvas / datasets
/ images; dev routes `?proto=`/`?poserig=1`), the server route table
(`server/core.ts`, 139 pathname routes), and the server boot
(`server/index.ts`). "Live" = reached without a test harness. Candidates that
survive verification get a `FIXME(wiring)` at their declaration; ruled or
intentional items get the tag WITH their ruling so the next pass does not
re-litigate; everything refuted is recorded under
[Negative evidence](#negative-evidence--do-not-chase) so it is never
re-chased.

**Classification legend.** **DEAD** = unreachable, period. **UNWIRED-FOR-USERS**
= reachable only from tests, or gated with no live path — the FIXME-worthy
class. **RULED** = unwired today under a recorded maintainer decision (the tag
points at the ruling).

**Tooling note.** The jcodemunch index was badly stale at audit start (697
deleted-file entries, including Phase-0-removed surfaces, plus stale worktree
copies — 57,920 symbols of bloat). It was repaired mid-audit with an
incremental reindex (now 15,363 symbols, current). The stale index produced
false candidates (e.g. `MobileApp.tsx`, `CharacterStudio.tsx`) — a reminder
that index verdicts were cross-checked by grep against the tree throughout.

## Resolutions — the wire-or-remove pass (2026-09-26, task bp6vyzq)

The maintainer's ruling on this inventory: *"either we wire them up, or we
scrap them; if it is stubbed for a future component or waiting on something
we have planned, mark it as a stub and document it."* Per-finding outcomes
(the FIXME/STUB tags at each site are the in-code record; this is the map):

| § | Outcome | Where it landed |
|---|---|---|
| 1.1 | **RESOLVED-WIRED** | promptWatch adopted as the queue sweep's loop engine — `9ddb11c` |
| 1.2 | **RESOLVED-STUB** | awaits the asset-authoring surface (remediation plan D1's re-attachment point) — `7f8f2fe` |
| 1.3 | **RESOLVED-STUB** | awaits the composer's contract-layer adoption (prompt-doctrine consolidation) — `7f8f2fe` |
| 1.4 | **RESOLVED-STUB** | FINISH stands, task 9up52mj, behind the centralization wave — tag restyled `7f8f2fe` |
| 1.5 | **RESOLVED-CUT** | registry row + fetch entry + retired license rows — `7f8f2fe` |
| 1.6 | **RESOLVED-STUB** | parked with the audio lane (silent-inference toggle, vzpyldn) — `7f8f2fe` |
| 1.7 | **RESOLVED-STUB** | parked with the long-form lane decision (TS test vs Motion-Context) — `7f8f2fe` |
| 1.8 | **REFUTED-KEPT** | `contractVerdict` HAS a live caller — `scripts/experiments/efs1-arms.cjs` (the E-FS1 bake-off arm runner) renders a failed arm's violations with it. The audit's "zero callers" was wrong; the export stays — `7f8f2fe` |
| 1.9 | **RESOLVED-CUT** | `fetchableNodePacks` removed — `7f8f2fe` |
| 1.10 | **RESOLVED-CUT** | `resetFamilyManifestCache` removed — `7f8f2fe` |
| 1.11 | **RESOLVED-CUT** | the two authoring exports removed; the spine stays (ruled KEEP, D1/R-14) — `7f8f2fe` |
| 2.1 | **RESOLVED-CUT** | route + `streamLanEvents` + the query-token entry removed — `7f8f2fe` |
| 2.2 | **RESOLVED-WIRED** | control-track delete affordance on the chain inspector (blast radius stated in the confirm) — `9ddb11c` |
| 2.3 | **RESOLVED-STUB** | awaits the maintenance/ops surface (Control Center diagnostics) — `7f8f2fe` |
| 2.4 | **RESOLVED-WIRED** | export affordance on the canvas index's project rows; import stays stubbed (the design rounds' project-home owns it) — `9ddb11c` |
| 2.5 | **RESOLVED-STUB** | awaits the maintenance/ops surface (Control Center diagnostics) — `7f8f2fe` |
| 2.6 | **RESOLVED-CUT** | the standalone exports listing removed — `7f8f2fe` |
| 2.7 | **RESOLVED-STUB** | awaits the LLM module surface — `7f8f2fe` |
| 2.8 | **RESOLVED-CUT** | `chooseDirectory` removed (client + type) — `7f8f2fe` |
| 3.1 | **RESOLVED-CUT** | maintainer ruling 2026-09-26: *"sounds like a neat feature but more hassle than it's worth to get right"* — key, picker, CSS, pointers, and the poison-test vehicle all removed — `7f8f2fe` |
| 4.1 | **RESOLVED-CUT** | `LicenseNotice.tsx` + `.license-notice` CSS removed (minimal-surface posture recorded) — `7f8f2fe` |
| 4.2 | **RESOLVED-CUT** | `components/media.tsx` removed — `7f8f2fe` |
| 5.1 | **RESOLVED-CUT** | the mock-job seam pair removed — `7f8f2fe` |
| 5.2 | **RESOLVED-STUB** | awaits the images workbench's expert surface — `7f8f2fe` |
| 5.3 | **RESOLVED-CUT** | `knownDivergenceIds` removed — `7f8f2fe` |
| 6.1–6.8 | **RESOLVED-CUT** | all orphaned artifacts removed — `7f8f2fe` |

Test disposition for the cuts (tests die with what they tested; coverage of
live machinery was re-vehicleed, not lost): the fetcher consent/stamp/remove
and runtime/instance foreign + Comfy-Registry flows moved from
krea2-controlnet to the h3-audio-t8 row; the camera/plan assertions that
used dead helpers as instruments now inline the transform or read GAP_MENU
directly. Same commit.

---

## §1 — Unwired machinery (built, no live journey reaches it)

| # | Finding | Where | Evidence | Class |
|---|---|---|---|---|
| 1.1 | **Prompt-watch polling kernel** — the shared poll loop that "replaces the previous per-workspace loops" | `src/lib/promptWatch.ts` | Zero live importers; only `tests/workflows.test.js:2018` loads it standalone. The submit paths (`h3Submit`, `music3Submit`, workbench) keep their own loops. | UNWIRED-FOR-USERS |
| 1.2 | **H3 Contact Sheet family** — full graph builder (five coordinated views, Turnaround LoRA, size clamps) | `src/lib/contactSheet.ts` | Submit path `lib/contactSheetSubmit.ts` deleted 2026-09-20 (recorded at `tests/canvas.test.js:1005`); no surface calls `buildContactSheetWorkflow`; `H3ContactSheet*` classes emitted nowhere else; tests assert topology only. | UNWIRED-FOR-USERS |
| 1.3 | **Official H3 prompt contracts** — the SKILL.md-derived builders/validators | `src/lib/promptContracts.ts` | Zero live importers; `promptComposer` resolves its contract layers elsewhere; only `tests/workflows.test.js:1229` exercises it. | UNWIRED-FOR-USERS |
| 1.4 | **VDN lane** — registry row + vendored tree + `vdn` engine profile + LongCache patch consent + stage-weight fetch rows; no builder emits `ApplyVDNH3` | `src/lib/nodePackRegistry.ts` (`vdn-h3`), `vendor/nodes/`, `server/engineProfiles.ts`, `server/enginePatch.ts`, `server/fetchCatalog.ts` | Code-verified by the node-inventory decision doc ([§3 note ³]). **RULED FINISH 2026-09-26** — adopted as our own entirely; graph lane is task 9up52mj, sequenced BEHIND the in-flight centralization wave. | RULED |
| 1.5 | **facok krea2-controlnet row** — `Krea2Control*` classes never emitted | `src/lib/nodePackRegistry.ts` (`krea2-controlnet`) | Row-only (installed on the shared instance, no builder). **RULED CUT 2026-09-26** (node-inventory ruling #4) — dead pending row removal. | RULED |
| 1.6 | **h3-audio-t8 row** — T8 audio-sidecar classes never emitted | `src/lib/nodePackRegistry.ts` (`h3-audio-t8`) | Pattern-adopted only; the audio-editing lane is parked (silent-inference toggle, vzpyldn). | RULED |
| 1.7 | **autocontext row** — AutoContext classes never emitted | `src/lib/nodePackRegistry.ts` (`autocontext`) | Row + deep-read only; the long-form lane decision (TS test vs Motion-Context) is named, not scheduled. | RULED |
| 1.8 | **`contractVerdict`** — the readable verdict formatter | `src/lib/engineContract.ts:267` | Zero callers anywhere — including the engine-contract suite it was written for. | DEAD |
| 1.9 | **`fetchableNodePacks`** — pack rows the fetcher can install | `server/fetchCatalog.ts:899` | "Surfaced for the integrity tests" per its own comment — but zero callers anywhere, integrity tests included. | DEAD |
| 1.10 | **`resetFamilyManifestCache`** — LLM family-manifest test hook | `server/llm/registry.ts:88` | "Test hook" per its own comment; zero callers, tests included. | DEAD |
| 1.11 | **Accessory authoring pair** — `saveAccessoryProjects` + `accessoryReference` | `src/lib/accessoryLibrary.ts:32,37` | Zero callers; the accessory studio UI left with the studios. The asset SPINE itself is ruled KEEP (remediation plan D1/R-14) and is live through `promptComposer`/`jobRecords` — only these two authoring exports are dead. | DEAD (spine RULED KEEP) |

## §2 — Routes without callers; client API without callers

Server route table: 139 pathname routes under `/api/lan/`. 13 have no client
reference; each was additionally checked for dynamic path construction,
e2e/scripts usage, and server-internal callers.

| # | Finding | Where | Evidence | Class |
|---|---|---|---|---|
| 2.1 | **`GET /api/lan/events`** — the wave-0 SSE bridge (one upstream ComfyUI WS per SSE client, `streamLanEvents`) | `server/core.ts:2506` (route), `:1341` (fn) | Zero consumers anywhere (src, tests, e2e, scripts). The comment's keep-justification ("existing remote clients") died with MobileApp's Phase-0 removal (2026-09-20); every live surface rides `/api/lan/realtime`. The retirement the comment names is now unblocked. | DEAD (legacy-keep rationale void) |
| 2.2 | **`POST /api/lan/documents/control-tracks/delete`** | `server/core.ts:2110` | The UI creates control tracks (PoseRigDock export) but no surface deletes one — an affordance gap, not just a dead route. | UNWIRED-FOR-USERS |
| 2.3 | **`POST /api/lan/documents/blobs/relink`** | `server/core.ts:2223` | Deliberate maintenance seam (`server/documents.ts:27`: "the UX around it is open") — but nothing fetches it. | UNWIRED-FOR-USERS (intentional seam) |
| 2.4 | **`GET /api/lan/documents/export`** — project archive (zip: manifest + rows + blobs) | `server/core.ts:2315` | Zero callers anywhere; the backup/migration affordance never got a surface. (Import below is at least test-covered.) | UNWIRED-FOR-USERS |
| 2.5 | **Tests-only document-store maintenance set** — `documents/projects/delete`, `documents/projects/restore`, `documents/import`, `documents/import/legacy`, `documents/prune`, `documents/gc`, `documents/jobs/state` | `server/core.ts:1865` (first of the set) | Only `tests/documents.test.js` fetches them. The client deletes projects via the non-documents `/api/lan/projects/delete`; the trash UI restores chains/assets, not projects; no prune/gc/import affordance exists. | UNWIRED-FOR-USERS |
| 2.6 | **`GET /api/lan/datasets/exports`** | `server/core.ts:2941` | The datasets bootstrap payload already carries the exports list; nothing fetches the standalone listing. | DEAD |
| 2.7 | **`GET/POST /api/lan/llm/fragments`** — user-editable composer fragment overrides | `server/core.ts:3093` | Tests-only (`tests/llm.test.js`); the fragment-override feature has no UI. | UNWIRED-FOR-USERS |
| 2.8 | **`window.minimax.chooseDirectory`** — Electron-era directory picker stub | `src/lib/apiClient.ts:123`, typed at `src/types.ts` | Returns `null` unconditionally on web; zero callers (the UI edits paths as text). | DEAD |

## §3 — Settings that do nothing

| # | Finding | Where | Evidence | Class |
|---|---|---|---|---|
| 3.1 | **`gpuTier`** — the Settings GPU-tier picker (8/16/24/blackwell) | `src/types.ts:407`, UI at `src/views/SettingsView.tsx:573` | Written and persisted, documented as "drives community quant/resolution guidance" — no effect site reads it anywhere (server or client); the only other reference is an e2e render-poison test. | DEAD (gates nothing) |

All other settings keys checked (`llamaVisionModel`, `llamaStickyModels`,
`llmThinkingDefault`, `promptContentLevel`, `testedComfyVersion`,
`lanHostAllowlist`, `inputDirectory`, `ffmpegPath`, `ollamaModel`,
`experimentalT1Decode`, …) have live read sites.

## §4 — UI affordances going nowhere

| # | Finding | Where | Evidence | Class |
|---|---|---|---|---|
| 4.1 | **`LicenseNotice`** — the one-time H3 community-license notice | `src/components/LicenseNotice.tsx` | Never rendered: zero importers (the "LicenseNotice precedent" in FirstRunNotice is a comment, not an import; the notice's host surface is gone). | DEAD |
| 4.2 | **`components/media.tsx`** — VideoPlayer, VideoContinuationControls, MediaDrop | `src/components/media.tsx` | Zero importers; `PooledVideoCard` + the video pool (`src/media/videoPool.ts`, `usePooledVideo`) replaced these widgets. | DEAD |

Everything else rendered from `CanvasApp` (docks, overlays, menus, wizard,
probe surface) traces to a live handler — the flagged-looking class methods
(`zoomToAttention`, `runDiagnostics`, `onRefusal`, …) are JSX-wired.

## §5 — Flags and seams prepared for features that never arrived

| # | Finding | Where | Evidence | Class |
|---|---|---|---|---|
| 5.1 | **Seed-tile mock-job seam** — `mockJobFor` + `isCanvasMockJob` ("Generation is Phase 2 — Phase 1 parks the job honestly") | `src/canvas/derive.ts:542,546` | Zero callers; the store builds its mock facts inline from `CANVAS_MOCK_JOB_PREFIX` (store.ts:2308/2324/2394), so the Phase-1 helper seam never got its caller. | DEAD |
| 5.2 | **Expert transport-override seam** — `effectiveTransport` + `hasTransportOverrides` ("surfaced in the UI + provenance") | `src/images/session.ts:171,177` | Zero callers; `slot.transport` / `TRANSPORT_FOR_ROLE` exist but no UI surfaces an override and no submit path consults it. | UNWIRED-FOR-USERS |
| 5.3 | **`knownDivergenceIds`** — "the exact-match signature for tests" | `src/lib/engineSemantics.ts:150` | The contract test reads `KNOWN_DIVERGENCES` directly; the accessor has zero callers. (The ledger itself is healthy — see negative evidence.) | DEAD |

## §6 — Orphaned artifacts

| # | Finding | Where | Evidence | Class |
|---|---|---|---|---|
| 6.1 | **10 orphaned CSS classes** in canvas.css — `.canvas-edge-arrows`, `.canvas-bar-stub`, `.canvas-inspector-mono`, `.canvas-inspector-note`, `.canvas-inspector-prompt`, `.canvas-menu-row-fetch`, `.canvas-audio-instrumental`, `.canvas-studios-body`, `.canvas-studios-fallback`, `.canvas-studios-tabs` | `src/canvas/canvas.css:53` (marker comment) | Zero TSX/TS references; dynamic class templates checked (`canvas-lora-seg…`, `canvas-wizard-…` produce other names). The `canvas-studios-*` trio is StudiosDock residue. datasets/workbench/surfaces/proto CSS: clean. | DEAD |
| 6.2 | **Camera helper trio** — `worldToScreen` (tests-only), `rectCenterPoint` (dead), `visibleTileIds` (tests-only) | `src/canvas/camera.ts:61,81,87` | The substrate's culling runs its own signature-gated path over ViewBlobs; `screenToWorld` (the inverse) IS live. | DEAD/tests-only |
| 6.3 | **Timeline helper pair** — `conformDurationSeconds` (tests-only), `snapBoundarySeconds` (dead) | `src/canvas/loraTimeline.ts:60,78` | The timeline paints through `conformFrames` directly. | DEAD/tests-only |
| 6.4 | **`opMetaFor`** | `src/canvas/ops.ts:52` | Superseded by direct `OP_META.find` in OpEditor. | DEAD |
| 6.5 | **Plan helpers** — `gapMenuEntry`, `formatTimelineDuration` | `src/canvas/plan.ts:103,424` | Tests-only. | tests-only |
| 6.6 | **Workbench landing helpers** — `workbenchTakeSummary`, `frameDescriptorsForJob` | `src/images/landing.ts:181`, `src/images/submit.ts:259` | Zero callers; the planned settings-echo and per-frame take attribution never landed. | DEAD |
| 6.7 | **Dataset server helpers** — `gridTargets`, `cropRectForRatio` | `server/datasets/model.ts:34,94` | Zero callers; the export wizard's grid target and the client-side CropEditor cover both concerns. | DEAD |
| 6.8 | **Probe helpers** — `extractPoster` ("for the gallery"), `listDir` ("helper for tests/scale fixtures") | `server/datasets/probe.ts:220,227` | Zero callers; gallery posters come from the client-side media pipeline; the scale fixtures are gone. | DEAD |

---

## Negative evidence — do NOT chase

Verified live / intentional / ruled. Recorded so the next pass does not
re-derive these.

- **`engineSemantics.ts` frame-math exports** (`h3NativeFrameCounts`,
  `isH3NativeFrameCount`, `h3TemporalSlices`) and **`engineContract.ts`
  `validateGraphAgainstSchemas`** — tests-only BY DESIGN: the file headers
  declare the ledger "exact-match enforced by
  tests/engine-contract.test.js"; the suite is the enforcement surface. (Only
  the two §1.8/§5.3 accessors inside them are dead.)
- **`jobMachine.sketch.ts`** — self-labeled "SKETCH ONLY … NOT WIRED" design
  artifact (the xstate migration's written-down state space). Intentional.
- **`?proto=` / `?poserig=1` dev routes** (`main.tsx`) — intentional dev
  surfaces, own lazy chunks, never titlebar-switchable by design. PoseRigDock
  IS wired into the canvas (control-track export).
- **`experimentalT1Decode` flag** — deliberately hand-set experiment control
  with no UI ("not a feature", per its types.ts doc); the E-FS0/E-FS1
  bake-off owns it.
- **Krea 2 stills family `queuedRefusal`** (`graph/engineFamilies.ts:137`) —
  an honest queued-state refusal (mf3wfq6), the opposite of dead wiring.
- **The five `*Library.ts` asset-spine modules** — RULED KEEP (remediation
  plan D1/R-14: "the natural re-attachment point for future asset
  authoring"); the spine is live through prompt composition and job-record
  write-backs. Only the two §1.11 authoring exports are dead.
- **`gitOrderRevision`** (`server/packVersioning.ts:207`) — used as the
  default-injection seam at :243. Live.
- **`/api/lan/realtime`, `/api/lan/media`, `documents/blobs/file`,
  `datasets/media`, `assets/filmstrip`** in the `queryTokenAllowed` list
  alongside `/api/lan/events` — all consumed by live client code; only the
  events entry is void (§2.1).
- **Scripts** (`canvas-budget`, `css-shot-diff`, `css-token-audit`,
  `css-token-codemod`, `capture-engine-schemas`, `check-registry-append`,
  `ci-map`, `perf-profile/`, `experiments/`) — all referenced from package.json
  / CI / docs / tests. `scripts/fixtures/*` — all referenced.
- **Class-method "no callers" flags from AST tooling** (JSX handler props,
  React lifecycle, context-provider methods) — false positives of the call
  graph, spot-checked and wired.
- **Settings path fields / local-scan machinery** — still live today; its
  removal is the ruled Wave-2 R-12 registry-only work (not this audit's
  class: it currently does something).

## Subsequent-pass runbook

One grep lists every site:

```sh
grep -rn "FIXME(wiring)" src server
```

32 sites across 25 files at the time of writing. Suggested order of attack:

1. **Ruled cuts first (zero decisions):** §1.5 krea2-controlnet row (ruled CUT)
   — one registry-row deletion; §2.1 `/api/lan/events` + `streamLanEvents` —
   the comment's own retirement trigger has arrived.
2. **Affordance gaps with user value:** §2.2 control-track delete (a
   control track, once created, can never be removed from the UI), §2.4
   documents export (the backup story), §2.7 llm fragments (the composer
   override feature needs either a UI or a cut decision).
3. **Dead modules wholesale:** §4.1 LicenseNotice, §4.2 media.tsx, §1.1
   promptWatch, §1.2 contactSheet, §1.3 promptContracts — each is a whole-file
   removal decision (contactSheet/promptContracts have test suites that go
   with them; tests die with what they tested — list in the commit).
4. **The VDN finish (§1.4)** — already sequenced: behind the centralization
   wave, task 9up52mj. The FIXME is the marker, not a new decision.
5. **Small helper residue (§5, §6)** — mechanical deletions, best batched
   into whichever wave next touches the owning file; §3.1 gpuTier wants a
   product call (wire the promised quant/resolution guidance, or drop the
   picker) before deletion.

When a FIXME is resolved (wired or removed), delete the tag in the same
commit — the grep is the tracking surface, this doc is the reasoning.
