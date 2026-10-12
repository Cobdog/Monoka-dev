# The dregs triage — Wave-4 dissolutions verified + the nits backlog closed

> **Task:** The closing triage (5vu57ue) · **Dated:** 2026-10-12 · **Project:** MINIMAX-DESKTOP (r2lnrfw)
> **Scope:** (a) a 2026-10-12 **verification pass** over the standing Wave-4 dissolvables re-triage recorded in Remediation Wave 4 (n3s86li, done 2026-09-22, PR #43 — commits f734ae4 + f1830ba + 49a19d9); (b) the item-by-item triage of the nits backlog (5vu57ue, "logged for a future polish pass"). Triage only — nothing here is implemented; still-real items land in §4 as the follow-up list.
> **METHOD:** every verdict below was checked against the CURRENT tree on 2026-10-12 (file:line cites are today's) — **[TREE]**; where the evidence is the landing commit rather than a surviving artifact, the commit is cited — **[GIT]**. Flux records are cited read-only. No finding is counted from memory: a verdict without a cite was not written down.
> **Headline:** all five of n3s86li's register verdicts **confirm against today's tree — zero contradictions**. The plan's §3 expectation ("R-32/R-33 expected to dissolve") was wrong for two rows; n3s86li already recorded that honestly (alive → fixed in place), and the register now carries a dated addendum saying so. Of the backlog's items: the large majority dissolved (most of both 2026-09-19 review waves were fixed in 834cde0, f734ae4, 33b66cb, and the phantom-seed/empty-jobs fixes); of 63 unique items, 20 remain still-real (plus the register's R-36) and are listed in §4.

---

## 1. The register rows R-32–R-36 — verification pass over n3s86li

n3s86li's rung 3 (2026-09-22) recorded: R-34/R-35 DISSOLVED (zero remnant), R-32/R-33 ALIVE → fixed small, R-36 skipped deliberately. Today's tree confirms each:

| Row | Plan's expectation (§3) | n3s86li's verdict (2026-09-22) | Tree today (2026-10-12) | Agreement |
|---|---|---|---|---|
| R-32 pack-board version vocabulary dense (C-F11) | likely dissolves into R-15/R-17 | ALIVE → fixed: featureGroup data + rows grouped by feature before version state | **[TREE]** `src/views/SettingsView.tsx:708-722` — `groupNodePacks`, comment names "(R-32, audit C F11) Board grouping: rows group by the FEATURE they serve (the registry's featureGroup) before any install/version state"; groups rendered at `:403-406` under `data-node-pack-group` headings; `featureGroup` on every registry row (`src/lib/nodePackRegistry.ts:78+`, typed `src/types.ts:156`). The per-row vocabulary is one install-state chip + one version string beside it (`:735-760`), not seven states inline. | CONFIRMED (fixed, not dissolved — exactly as recorded) |
| R-33 node-packs section: 7,857 chars of policy prose (A-m1) | dissolves into R-15/R-17 ("how installs work" popover) | ALIVE → fixed: the two policy walls collapsed behind a "How node-pack installs work" summary | **[TREE]** `src/views/SettingsView.tsx:458-466` — `<details className="settings-subsection" data-node-pack-policy>` with the summary "How node-pack installs work — targets, pins, licenses, what uninstall touches"; the in-file comment names it "the plan's 'how installs work' popover, on the section's own details-subsection idiom". The prose is out of the scroll (collapsed by default). | CONFIRMED (fixed, not dissolved — exactly as recorded) |
| R-34 FirstRunNotice wall of text (A-m3) | dissolves into R-16 (two sentences + two buttons) | DISSOLVED (zero remnant) | **[TREE]** `src/canvas/FirstRunNotice.tsx` (86 lines): the body is one headline + one sentence + buttons ("Resume setup" / "Get models" / "Engine settings"); the header comment says "two sentences, two buttons (m3's wall-of-text fix; the implementation detail moved into the wizard's steps where it's actionable)" — `src/canvas/FirstRunWizard.tsx` carries the detail now. The five lines of yaml/blob-path detail are gone. Note: three buttons landed (a secondary third), not two — within the expectation's shape. | CONFIRMED |
| R-35 Settings heading undersells the page (A-m4) | dissolves into R-15 | DISSOLVED (zero remnant) | **[TREE]** `src/views/SettingsView.tsx:281` — the heading copy is "Engine and connection, daily defaults, and diagnostics — the model library has its own surface." (names the three groups). **[GIT]** The old copy — "Point the studio at your existing local engine and model folders." (the underselling line, and false post-registry-only) — died with 834cde0 (R-15). | CONFIRMED |
| R-36 queue_status normalized but unconsumed (B notes) | optional PATCH | Skipped deliberately: "queue DEPTH now surfaces via R-31; per-job queue-position surfacing is not small and stays out" | **[TREE]** Both halves of the finding remain, exactly as the skip implied: `queue_status` is emitted (`server/realtime.ts:164`) and typed (`src/types.ts:705`) with **zero client consumers** — the client's job-channel handler handles nine event types and not this one (`src/lib/useLivePreview.ts:72-106`), and `job_done` likewise has no client consumer (terminal state still arrives via the poll). The R-31 narrowing is real: engine-level queue depth renders live on the external health card (`src/views/SettingsView.tsx:335`). | CONFIRMED — STILL-REAL as the logged optional (severity unchanged P3) |

**Register tally: 2 dissolved / 2 alive-fixed-in-place / 1 still-real (optional). 5/5 agreement with n3s86li; zero contradictions.** The one contradiction with the PLAN's expectation (R-32/R-33 did not dissolve into the Wave-3 redesigns — the redesigns landed but the two findings survived them and were fixed directly) is n3s86li's own recorded count; `docs/audit/remediation-plan.md` §3 Wave 4 now carries the dated addendum pointing here.

---

## 2. The nits backlog (5vu57ue) — item by item

### 2.1 The original log (comment f2ta9l4, 2026-09-17)

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | zip64 >4GiB archives get an opaque 500 | **DISSOLVED** (in substance) | **[TREE]** The only ZIP surface is the project archive: `server/core.ts:2391-2396` — "Archive problems are user-actionable (corrupt zip, unknown version, taken project id): loud 400s with the reason, never the generic structural 500." `server/documentArchive.ts:147-175` bounds the parse (≤2,000 entries, per-entry and total caps, lying headers refused outright) with readable refusals; a zip64 sentinel entry count (0xFFFF) trips the loud "declares too many entries" error. No datasets-side zip path exists. |
| 2 | realtime forces `ws://` — an https UI can never connect | **DISSOLVED** | **[GIT]** The Wave-1 realtime fabric (2cb4bfe) rewrote the transport. **[TREE]** `src/lib/useRealtime.ts:121-127` — `fabricUrl` derives `wss` when the page is https. |
| 3 | `blobAbsolutePath` couples correctness to the directory NAME 'canvas-blobs' | **STILL-REAL** | **[TREE]** `server/repo.ts:53-58` (blobRoot = `join(dirname(dbFile), 'canvas-blobs')`) + the literal re-checked at `server/documents.ts:714`, `:750`, `:1117`. The rename-trap refactor never landed. §4. |
| 4 | dead Electron-era exports (`resolveVideoSource`, `localMediaResponse`) | **STILL-REAL** | **[TREE]** Defined `server/core.ts:350` and `:1112`, exported at `:3883`/`:3891`; zero callers anywhere in `src/` or elsewhere in `server/` (repo-wide grep). Prime wire-or-remove candidates. §4. |
| 5 | jobs FTS trigger churn (up to 100 delete+inserts per flush) | **DISSOLVED** (pattern gone; residual noted) | **[TREE]** The persist path is per-job UPSERT — `server/core.ts:1717` → `server/repo.ts:275-281` (`upsertJobs` transaction over `upsertJob`'s `ON CONFLICT DO UPDATE`). SQLite fires only the UPDATE trigger on that path, so the delete+insert-per-flush churn no longer exists; the FTS update trigger still fires per changed row (the perf-seam watch, diminished). |
| 6 | `upsertAsset` doesn't clear `deleted_at` | **STILL-REAL** | **[TREE]** `server/repo.ts:91-99` — the `ON CONFLICT DO UPDATE` set omits `deleted_at`; the tombstone-consistent-but-surprising behavior stands. §4. |
| 7 | emptyTrash needs no confirm (doctrine inconsistency) | **DISSOLVED** | **[TREE]** Datasets: the empty runs behind a confirm-ask — `src/datasets/DatasetsApp.tsx:619` (`onEmpty={() => setConfirmAsk({ kind: 'empty-trash' })}`) with danger framing at `:634`. Canvas: the same gate at `src/canvas/IndexOverlay.tsx:433` (`confirming.kind === 'empty-trash'`). **[GIT]** PR #56's "double-gated empty" is the landing. |
| 8 | `submitPlanEpisode` skip-numbering on a skipped segment | **STILL-REAL** | **[TREE]** `src/canvas/store.ts:1198-1207` — clips number by RUN POSITION (`chainOption.index = index - fromIndex`); a segment skipped for missing context (`if (!context) continue`) leaves its clip number unused, and the next segment's N>0 convention loads clip N−1 — the skipped number. A real seam in the plan-episode path, low frequency. §4. |
| 9 | blob files served extension-less `application/octet-stream` | **STILL-REAL** | **[TREE]** Media serving derives content-type from the extension (`server/core.ts:70` map; applied at `:377` and `:1385`) — blob names are content hashes with no extension, so the fallback fires. The Safari-smell stands (Chrome sniffs). §4. |
| 10 | `prototypes.spec.ts` orphaned from every playwright testMatch | **STILL-REAL** | **[TREE]** `playwright.config.ts:124-125` — the e2e project's testMatch enumerates (app|poserig|canvas|datasets|images|settings|nodepacks|wave1|journey|gallery|animation); `e2e/prototypes.spec.ts` still exists, still unmatched. §4. |
| 11 | video tile pooling extended to the tile path | **DISSOLVED** (superseded by the wave-2d media architecture) | **[TREE]** `src/media/videoPool.ts:1-22` — the app-wide element pool (wave 2d, `VIDEO_POOL_SIZE = 4`, exclusive playback, idle auto-release); tiles render filmstrip SPRITE posters through the OPFS-cached loader, not paused `<video>` elements (`src/media/useFilmstrip.ts:1-8`, `src/canvas/Tile.tsx:20`, `:84`). The "93 unpooled paused videos" shape can no longer occur. |
| 12 | posters' 6-at-a-time origin-connection queue after zoom-outs | **DISSOLVED** (same supersession) | **[TREE]** Posters are single sprite-sheet fetches through the OPFS blob cache (`src/media/useFilmstrip.ts`), not Range-request-holding video elements; live elements are capped by the pool (item 11). |

### 2.2 The fetch-affordance proposal (comment idg8ui4, 2026-09-18)

| Item | Verdict | Evidence |
|---|---|---|
| One-click fetch affordance on unavailable option rows — the guidance reason deep-links into the FetchBrowser with the entry pre-selected | **STILL-REAL (narrowed)** | **[TREE]** The machinery landed at the RENDER ATTEMPT, not on the menu rows: the R-17 remediation surface carries exactly the proposed affordance — `src/canvas/RemediationDock.tsx:87-91` (`setLibraryDock(true, [catalogEntryId])`, license on the row, consent unchanged) — and the LibraryDock focus-id plumbing is everywhere (834cde0; `src/components/FetchBrowser.tsx:67-77` scrolls + outlines the focused entries). The typed-hole menu rows themselves still render disabled + reason text only, no deep-link (`src/canvas/EndpointMenu.tsx:92-104`; `src/canvas/options.ts:58-60`). The paired catalog-coverage audit (every referenced weight/node has a catalog entry or an honest not-fetchable reason) is doctrine where visible but not auditable as complete from the tree. §4 (low — the actual failure point is covered by R-17). |

### 2.3 The QOL-wave addendum (comment wpra6eg, 2026-09-18)

| Item | Verdict | Evidence |
|---|---|---|
| The launcher's `datasets` chip retired (implemented that wave) | **DISSOLVED** (done at the time; verified holding) | **[TREE]** `src/canvas/Launcher.tsx:113` cites "The datasets chip precedent applies: one [entry point per surface]" — the registry-driven switcher is the one way in; no datasets chip remains in the launcher. |
| Settings is unreachable from the datasets surface (spec-level proposal) | **DISSOLVED** (by R-21) | **[TREE]** `src/datasets/DatasetsApp.tsx:20,84` — SettingsDock mounted on the surface; `:443` the on-surface button ("R-21: opening it never leaves this surface"). Same on the workbench (`src/images/WorkbenchApp.tsx:114`, `:1083-1084`). **[GIT]** 834cde0. The spec-level surface-chrome question it raised is answered by the dock contract. |

### 2.4 The test-hygiene find (comment 7ypp8c2, 2026-09-18)

| Item | Verdict | Evidence |
|---|---|---|
| The datasets e2e caption test is cross-run state-coupled through the shared home (`.first()` opens an inherited layer) | **DISSOLVED** | **[GIT]** n3s86li's test-hygiene rung (f1830ba). **[TREE]** `e2e/datasets.spec.ts:69-90` — a beforeAll gives every run a clean dataset slate through the app's OWN API (trash the seeded sources, empty the trash), with the comment naming the dedupe mechanism and this spec's accumulation class; the caption test's reopened layer is deterministic (the in-test comment at `:296-303` documents the 16:9-first-save contract). The follow-up bug the fix exposed (the clean-slate regex silently matching nothing, `:79-84`) is also fixed. |

### 2.5 The two roadmapped ideas (comments mngtr3j and uytmxqn, 2026-09-18/19)

| Item | Verdict | Evidence |
|---|---|---|
| Camera-pan photostitch extension (the outpainting alternative) | **RECLASSIFIED** (left the backlog the proper way) | **[TREE]** `docs/research/pan-stitch-extension.md` (compiled 2026-09-18, Flux task 4akaet6): the full research packet — prior art, the rung-1 mosaic verdict, the anchor-stitch pattern, and the E-IW3 experiment spec. Not a nit; it rides the GPU-window queue as specced. |
| Temporal LoRA gating via masked deltas (the layer-2 follow-up) | **RECLASSIFIED-CONFIRMED** (parked exactly as its own premise requires) | **[TREE]** Layer 1 landed: `src/canvas/loraTimeline.ts:1-8` ("the LoRA timeline's pure layer (7twfk6o, layer 1 — segment granularity)"). Layer 2 (the forward-hook delta gate) remains a documented follow-up in the 5vu57ue record, gated on layer 1's E-experiment being justified, per its own text. No research packet exists yet — the freshness doctrine's capture obligation applies when that experiment opens. |

### 2.6 The shared-home hygiene addendum (comment 6xptk1m, 2026-09-19)

| Item | Verdict | Evidence |
|---|---|---|
| (a) a settings snapshot/restore helper — settings-mutating e2e restores in afterEach | **DISSOLVED** (in substance; residual noted) | **[TREE]** `e2e/nodepacks.spec.ts:44` (`restoreSettings`) wired in afterEach at `:216`; the same discipline cited at `e2e/journey.spec.ts:29` and `e2e/images.spec.ts:981` ("testing.md's shared-home discipline"). Residual: the helper is per-spec, not a shared fixture — duplication is the remaining seam. §4 (tiny). |
| (b) a gate-time stale-state detector for the shared home | **STILL-REAL** | **[TREE]** No detector exists — nothing in `scripts/`, `package.json`, or `.github/workflows/ci.yml` beyond the unrelated stale-dist rule. Local-vs-CI divergence with the shared-home signature is still diagnosed by hand. §4. |
| (c) the latent-fork test pins the outputDirectory it assumes | **DISSOLVED** | **[TREE]** `e2e/canvas.spec.ts:2477` — the test reads the EFFECTIVE persisted `outputDirectory` from the settings API instead of assuming a default; a stale value can no longer silently poison the assertion. |

### 2.7 The first-boot + settings review (comment i7u40j6, 2026-09-19 — review task g5x37k8)

Blockers and majors:

| Item | Verdict | Evidence |
|---|---|---|
| B1 node-pack list does not refresh after Save | **DISSOLVED** | **[TREE]** The event-shaped R-10 discipline: save dispatches `PACKS_CHANGED_EVENT` (`src/canvas/SettingsDock.tsx:101`) and the pack board re-resolves on it (`src/views/SettingsView.tsx:227-233`). **[GIT]** 834cde0. |
| B2 "Apply to Create" silently wipes tuned defaults | **DISSOLVED** | **[TREE]** `src/views/SettingsView.tsx:93-100` — the button is now an explicit reset that NAMES every delta it will change and refuses to run silently (shared ConfirmDialog, danger framing). The in-file comment cites this review. |
| M1 phantom "Imported workspace" on fresh install | **DISSOLVED** | **[TREE]** `server/documents.ts:1305-1313` — "Phantom-seed fix (review M1, g5x37k8 2026-09-19)": the seed requires actual legacy workspace content (jobs, or a workspace row with a key); the honest empty state can now appear. |
| M2 Settings unreachable from datasets AND images; the tooltip lies | **DISSOLVED** | R-21 on all three surfaces (§2.3's cites; `src/images/WorkbenchApp.tsx:1083-1084`), plus the honest tooltip: `src/canvas/Radar.tsx:124` — "docked as a floating panel on the canvas surface (other surfaces link here)". |
| M3 `ComfyStatus.error` never rendered | **DISSOLVED** | **[TREE]** `src/views/SettingsView.tsx:294` — `data-comfy-status-error` renders "Could not reach {url} — {status.error}". |
| M4 save-time path warnings computed then dropped | **DISSOLVED** | **[TREE]** `src/lib/apiClient.ts:114-119` — the wrapper returns the whole answer including `warnings` (comment cites M4); the dock surfaces them (`src/canvas/SettingsDock.tsx:91`). |
| M5 PathCheckNote validates a different string than model-roots save | **OBSOLETE** (the named surface was removed) | **[TREE]** The model-locations input rows no longer exist — R-12's registry-only doctrine replaced them with the "Model inventory" READOUT (`src/views/SettingsView.tsx:613`: "there is no local folder list and no manual pointing"), which has no path inputs and no PathCheckNote. The paste-with-newline trap has no surface. |
| M6 non-absolute path input gets zero inline guidance | **STILL-REAL** | **[TREE]** `src/views/SettingsView.tsx:36` — `if (!trimmed || !trimmed.startsWith('/')) { setState('idle') }` still idles silently on relative input; the only feedback remains the save-time toast. §4. |
| M7 LTX utilities run row is unreachable dead code | **OBSOLETE** (the family was excised) | **[GIT]** Phase-0 removals (z8bc21p, PR #33; manifest `docs/audit/removals-phase0.md`). **[TREE]** `src/lib/graph/ids.ts:20` records the removal date; the surviving `LTXVSeparateAVLatent`/`LTXVConcatAVLatent` class_types are H3's own AV-latent upscale mechanism (`src/lib/graph/upscale.ts:31-35`), not the LTX family surface. |
| M8 `llamaVisionModel` wired server-side, no UI | **DISSOLVED** | **[TREE]** `src/views/SettingsView.tsx:588-593` — the "Vision model (router)" field, with the comment citing "M8 (review 2026-09-19)". |
| M9 node-pack action buttons unreachable at dock min width | **DISSOLVED** (the second suggested remediation landed) | **[TREE]** The rows wrap now: `src/styles.css:858` (`.node-pack-row { flex-wrap: wrap }`) and `:861` (`.node-pack-title { flex-wrap: wrap }`) — at 420 px the actions flow instead of clipping behind `overflow: hidden`. |
| M10 dock default size not viewport-clamped; close button off-screen | **DISSOLVED** | **[TREE]** `src/canvas/dockGeometry.ts:1-10,23-26` — the header cites "review M10/M11, 2026-09-19"; width/height/x/y all clamp to the viewport (close button included). |
| M11 three docks, same z-index, no raise-on-open | **DISSOLVED** | **[TREE]** `src/canvas/dockGeometry.ts:12-20` — the (+180, +48) cascade contract (all three headers stay visible) + grab-to-raise via the reactive rank band, `src/ui/dockOrder.ts`. |
| M12 guidance text renders at 7–9px | **STILL-REAL** | **[TREE]** `src/styles.css:54-55` — `--text-xs: 8px; --text-sm: 9px` unchanged since the review. §4 (the one-line bump that keeps costing nothing). |
| M13 console 400 on every fresh boot (empty jobs persist) | **DISSOLVED** | **[TREE]** `src/hooks/useGenerationQueue.ts:108-110` — the empty-jobs guard, with the comment citing both review waves ("g5x37k8 M13 + d6iy68r m2"). |

Minors:

| Item | Verdict | Evidence |
|---|---|---|
| Raw error strings verbatim ("fetch failed", ENAMETOOLONG) | **STILL-REAL (narrowed)** | **[TREE]** The render-failure path classifies "fetch failed" (`src/lib/failureTaxonomy.ts:83`), and the engine test line now SHOWS the error with context (`:294`) — but the text itself is still raw on the settings surfaces (PathCheckNote renders `result.error` verbatim, `src/views/SettingsView.tsx:46`). §4 (low). |
| Uninstall deletes the pack folder with one click, no confirm | **DISSOLVED** (resolved on the doctrine side) | **[TREE]** Still one click, but the blast radius was narrowed to what the studio placed: the policy note at `src/views/SettingsView.tsx:464` (studio-marker installs only; pre-existing folders refused for install-over and never deleted; Manager uninstalls its own). The inconsistency the nit named is gone; no confirm was added. |
| Copy nits: "0 diffusion models files" pluralization | **DISSOLVED** | **[TREE]** The readout row renders proper singular/plural — "{n} file{s} on the engine" (`src/views/SettingsView.tsx:613`). |
| FirstRunNotice's "nothing lands in Documents" easy-to-misread | **OBSOLETE** | The notice was rewritten to two sentences (§1 R-34) and the model roots it contradicted no longer exist (R-12) — the I/O note's scoped claim (`src/views/SettingsView.tsx:474`) is now simply true. |
| `NumberField` label without htmlFor / id-less input | **DISSOLVED** | **[TREE]** `src/components/form.tsx:14-18` — "The id/htmlFor association (review minor 2026-09-19) is Field's job now." |
| Ollama "Refresh models" silent no-op with no server | **STILL-REAL** | **[TREE]** `src/hooks/useStudioSession.ts:141-148` — `catch { setOllamaModels([]) }`, no feedback path. §4. |
| `apple-mobile-web-app-capable` deprecation warning every boot | **STILL-REAL** | **[TREE]** `index.html:7`. §4 (trivial). |
| Dock position/size resets on close/reopen AND reload | **STILL-REAL** | **[TREE]** No persistence — the docks have no localStorage of position/size (`src/canvas/SettingsDock.tsx` has none). As-logged: acceptable at reload, gratuitous within a session. §4 (low). |
| Escape on the fetch-consent dialog drops focus to BODY | **DISSOLVED** | **[TREE]** The consent dialog migrated to the shared layered dialog (task 24, k2q0n9s): `src/components/FetchBrowser.tsx:217-227` (`layerId="fetch-consent"`, `initialFocus={checkboxRef}`), and `src/ui/StudioDialog.tsx:5` — Base UI owns "focus trapping + restore, Escape, outside". |
| Orphaned components (AceStepWorkspace, Music3Workspace, CharacterDialogueModal) | **DISSOLVED** | **[GIT]** Removed by the app-tour fix wave 33b66cb (zero references; the Phase-5 deletion-wave precedent); LicenseNotice went earlier in the wire-or-remove pass A (7b5a640). |
| Default-quality select masks turbo='4' as '8' | **STILL-REAL** | **[TREE]** `src/views/SettingsView.tsx:488` — the mask expression stands; the two controls still disagree about the same setting. §4. |
| Node-pack chip reads green "installed" with the engine OFFLINE | **STILL-REAL** | **[TREE]** `src/views/SettingsView.tsx:735-743` (`nodePackChip`) — an installed pack shows "installed @ pin" (status ok) whenever `instanceState !== 'absent'`; the honest "restart engine to activate" only appears for `absent`, so offline still reads as active. §4. |
| User-fetch install failure message is generic | **STILL-REAL** | **[TREE]** `server/engineNodes.ts:489` — the same one-size note text rides back regardless of why (nonexistent source / not a repo / wrong repo). §4 (low). |

### 2.8 The adversarial app-tour review (comment af185de1a8a61ee36, 2026-09-19 — review task d6iy68r)

The bulk of this review was fixed by its own dedicated wave, commit 33b66cb ("app-tour UX wave", task d6iy68r), which reproduced then fixed each named item:

| Item | Verdict | Evidence |
|---|---|---|
| M1 images workbench breaks the shared-chrome contract (no SurfaceSwitcher, Alt+1..9 dead) | **DISSOLVED** | **[GIT]** 33b66cb. **[TREE]** `src/images/WorkbenchApp.tsx:1083` mounts `<SurfaceSwitcher />`; the one-way back-link retired. |
| M2 datasets forever-poll (image sources never leave pending) | **DISSOLVED** (root cause, server-side) | **[GIT]** 33b66cb — every ingested source settles its probe state at construction (stills and refusals terminal at once; a construction-time sweep heals stranded rows); the client poll gates on video probes only. **[TREE]** `server/datasets/index.ts:96,104` region carries the video-only gate; the poll terminus has its own e2e wire proof. |
| M3 the poll wipes error banners within ~1.5s | **DISSOLVED** | **[GIT]** 33b66cb — "refresh() never clears the error banner on success"; errors dismiss explicitly or clear on user-initiated refresh/action starts. |
| M4 crop editor scroll-resize deadlocks under the 32px grid | **DISSOLVED** | **[GIT]** 33b66cb — every wheel tick now moves each dimension at least one 32-px grid step; the 256-deadlock case has its own e2e. |
| M5 virgin install shows an "Imported workspace" card | **DISSOLVED** | Same fix as §2.7 M1 (the phantom-seed gate in `server/documents.ts:1305-1313`). |
| M6 "refused at import" chip shows no reason | **DISSOLVED** | **[GIT]** 33b66cb — the chip's title carries the server's full reason. |
| M7 the workbench Generate button disabled with no reason | **DISSOLVED** | **[GIT]** 33b66cb — the button names its unavailability (missingModels/missingNodes — the refine-tap pattern). |
| m1 one Escape = two actions on the canvas | **DISSOLVED** | **[GIT]** 33b66cb — the overlay that ACTS owns the keypress (stopPropagation in the index/library/endpoint-menu handlers); one press, one action. |
| m2 console 400 on every boot with an empty job list | **DISSOLVED** | Same fix as §2.7 M13 (the empty-jobs guard). |
| m3 datasets overlays don't answer Escape | **DISSOLVED** | **[GIT]** 33b66cb — CropEditor and CaptionPanel answer Escape (the VLM modal owns the first press while open). |
| m4 export destination placeholder hardcodes a date | **DISSOLVED** | **[GIT]** 33b66cb — the placeholder derives today's date at render. |
| m5 caption panel header stays "uncaptioned" after a save | **STILL-REAL** | **[TREE]** `src/datasets/CaptionPanel.tsx:144-148` — the header reads the `layer` prop captured at open; `onChanged` refreshes the LIBRARY, not the panel's snapshot (`src/datasets/DatasetsApp.tsx:663-666`), so the chip stays stale until the panel reopens. §4. |
| m6 orphaned components (the three dead workspaces) | **DISSOLVED** | Same removal as §2.7's orphan row (33b66cb). |
| m7 visiting `/?images=1` silently materializes a cryptic "h3img 3" tile | **STILL-REAL (narrowed)** | **[TREE]** The naming half is now the deliberate app-wide convention — kind + ordinal, one vocabulary (the W9 perfect-state sweep, `src/canvas/derive.ts:245-266`, with the tried-and-reverted note on display names); the on-entry chain materialization (the write happens on entry, not on an explicit handoff) remains as designed-but-tour-hostile. §4 (low, product call). |
| m8 camera path editor claims "reconstructed from the box text" for a fresh default | **STILL-REAL** | **[TREE]** `src/components/CameraPathEditor.tsx:224` — the claim is gated on `!exactDoc` (an authored doc exists at `:69-71`), but a fresh chain has no authored doc, so the default path still shows it. §4 (wording). |
| m9 path imports use blocking `window.prompt` | **DISSOLVED** | **[TREE]** `src/ui/PromptDialog.tsx:3` — the shared dialog is the "window.prompt sites' replacement"; `src/datasets/DatasetsApp.tsx:36` — "window.confirm/window.prompt are gone — every ask-then-act flow opens the [dialog]." |
| m10 seed spinbuttons report aria-valuenow ≠ displayed text (+ the meta warning + form-field ids) | **SPLIT** | The spinbutton half is **obsolete in shape** — the fields are native `<input type="number">` now (`src/components/form.tsx:16`), no manual aria-valuenow to diverge; the form-id leg is **dissolved** (§2.7 NumberField); the `apple-mobile-web-app-capable` leg is **STILL-REAL** (§2.7). |

---

## 3. Verdict tally

**Register R-32–R-36 (verification pass over n3s86li):** 5/5 CONFIRMED, zero contradictions — 2 dissolved (R-34, R-35) / 2 alive-fixed-in-place (R-32, R-33) / 1 still-real optional (R-36). The plan's §3 "expected to dissolve" held for exactly the two rows it named most confidently (R-34, R-35) and missed the two it hedged on (R-32 "likely", R-33) — both were alive and were fixed directly. Recorded as a dated addendum in `docs/audit/remediation-plan.md` §3.

**The nits backlog (5vu57ue), by unique item across its seven substantive comments:**

| Verdict | Count | Items |
|---|---|---|
| DISSOLVED (fixed / superseded / done-at-time) | 36 | §2.1: zip64 refusal, ws:// forcing, FTS churn, emptyTrash confirm, tile pooling, poster queue. §2.3: datasets chip retired, Settings-from-datasets. §2.4: caption-test coupling. §2.6: restore helpers, latent-fork pin. §2.7 majors: B1, B2, M1, M2, M3, M4, M8, M9, M10, M11, M13. §2.7 minors: pluralization, NumberField, consent-Escape, orphaned components. §2.8: tour M1, M2, M3, M4, M6, M7, m1, m3, m4, m9 (the tour's M5/m2/m6 are the same fixes as §2.7's M1/M13/orphans — counted once each) |
| OBSOLETE (the named surface was removed) | 4 | M5's model-roots rows (R-12); M7's LTX run row (Phase 0); the "nothing lands in Documents" misread (R-12 + notice rewrite); m10's spinbutton half (native inputs) |
| RECLASSIFIED (left the backlog properly) | 2 | pan-stitch research packet; temporal-LoRA layer-2 (layer 1 landed) |
| RESOLVED-BY-DESIGN (the doctrine moved, not the code) | 1 | uninstall one-click (blast radius narrowed to studio-placed folders) |
| STILL-REAL | 20 | §2.1 items 3, 4, 6, 8, 9, 10; the option-row fetch deep-link (narrowed); the stale-state detector; M6; M12; raw error strings (narrowed); Ollama refresh silent; apple meta (§2.7 minor and m10's third leg — the same line, counted once); dock position reset; turbo mask; offline pack chip; user-fetch generic message; m5 caption header; m7 on-entry tile (narrowed); m8 camera wording |

That is 63 unique backlog items. The register's R-36 is the 21st still-real entry overall (tracked in §1, listed in §4). Every dissolvable and obsolete verdict above carries its cite; nothing was counted from the reviews' own claims without a tree check.

---

## 4. The follow-up list (still-real, worth fixing — NOT implemented here)

This is the triage's output, not a fix wave. Ordered by worth, with the source record:

1. **R-36 (register, optional P3):** per-job queue position (`queue_status` still has zero client consumers — `server/realtime.ts:164` emits, nothing listens) and terminal events driving tile state (`job_done` unconsumed client-side; the poll still owns completion). Take only with the same "is it small" gate n3s86li applied.
2. **M12 guidance text at 8–9px** (`src/styles.css:54-55`) — the onboarding text's readability bump (11–12px), still a structurally free change.
3. **Wire-or-remove candidates:** the dead `resolveVideoSource` / `localMediaResponse` exports (`server/core.ts:350,1112,3883,3891`, zero callers) — the exact discipline of pass A/B (7b5a640/b296dbb).
4. **`prototypes.spec.ts` orphan** (`playwright.config.ts:124`) — either match it or retire it through the removal discipline.
5. **The canvas-blobs rename-trap** (`server/repo.ts:53-58` + the literals at `server/documents.ts:714,750,1117`) — layout-constant-relative refactor, as logged.
6. **Gate-time stale-state detector for the shared e2e home** (6xptk1m b) — prints the remediation instead of failing mysteriously; pairs with promoting the per-spec `restoreSettings` helper to a shared fixture (6xptk1m a's residual).
7. **`upsertAsset` should clear `deleted_at` on conflict** (`server/repo.ts:91-99`) — one line; the tombstone surprise is the whole finding.
8. **Pack-chip honesty while the engine is offline** (`src/views/SettingsView.tsx:735-743`) — offline should not read as active/live; the `absent` branch's wording is the model.
9. **The plan-episode skip-numbering gap** (`src/canvas/store.ts:1198-1207`) — a skipped mid-run segment strands the next segment's N−1 conditioning reference.
10. **M6 relative-path inline guidance** (`src/views/SettingsView.tsx:36`) — the note should say "use an absolute path" at typing time.
11. **Turbo '4' masked as '8'** (`src/views/SettingsView.tsx:488`) — two controls disagreeing about one setting.
12. **The typed-hole option-row fetch deep-link** (idg8ui4, narrowed) — the R-17 machinery exists; wiring the menu rows' reasons to `setLibraryDock(true, [entryId])` is the remaining half, if the menus should carry it at all now that the render attempt owns remediation.
13. **Blob serve content-truth** (`server/core.ts:70,377,1385`) — serve registered blobs by their stored kind, not extension-sniffing (Safari).
14. **m5 caption header stale chip** (`src/datasets/CaptionPanel.tsx:144-148` + `src/datasets/DatasetsApp.tsx:663-666`) — refresh the panel's layer on `onChanged`.
15. **m8 camera wording** (`src/components/CameraPathEditor.tsx:224`) — "reconstructed" is wrong for a fresh default path; say "default path" when no box text exists.
16. **Small polish batch:** Ollama refresh feedback (`src/hooks/useStudioSession.ts:141-148`); user-fetch install failure specifics (`server/engineNodes.ts:489`); humanize the settings-surface raw error strings; dock position persistence within a session; `apple-mobile-web-app-capable` meta (m10's surviving leg); m7's on-entry tile materialization (product call — the naming half is settled convention).

---

*Verdicts verified 2026-10-12 against main HEAD `d2dc19b`. Corrections to this doc arrive as dated addenda, never silent rewrites.*
