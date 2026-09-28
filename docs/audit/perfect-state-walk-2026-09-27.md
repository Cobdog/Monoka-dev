# Perfect-state walk 2026-09-27 — the mainline audit: every imperfection in the app as it exists today

> **Task:** Perfect-state walk 2026-09-27 (ff4m8ut) · **Epic:** Foundation remediation program (4lphxv8) · **Project:** Monoka-dev (r2lnrfw)
> **Commission:** the maintainer's 2026-09-27 directive — *"Mainline — let's get what we have currently working in a PERFECT state before we move on to adding more features."* No new features; only defects, friction, incoherence. Contrast/visual-taste items stay OUT (the blessed shibui rework owns those); functional-polish is IN.
> **Method:** the reality-audit discipline ([reality-audit-2026-09-25.md](reality-audit-2026-09-25.md) is the precedent). Phase 1 — a fresh blind walk of current main (`20d7ea4`, clean worktree) in a real browser (system Chromium 1920×1080, headless, HTTP-controlled driver) against the environment mirror (`e2e/mirror/` fake engine, **maintainer-instance profile**, then a mid-walk swap to **stock-h3** for the restart/refresh leg — the app NEVER touched `127.0.0.1:8188`). Phase 2 — claims diff against the 09-25 punch list + its 09-26 addenda + the wiring-check resolutions + PR claims for #52–#63. Phase 3 — the full local gate. Phase 4 — ranking. **No fixes in this pass.** *(While the audit ran, origin/main advanced by two docs-only commits — `426f76c`, `0cc4550`, all under `docs/` — zero code delta, so the walked build remains the current code truth; this report's commit lands on top of them.)*
> **Environment:** built server (dist-server) on 7360, fake engine on 7361 (three instances across the walk), isolated home `test-results/perfect-state/home`, driver on 7370. All PIDs torn down and ports verified closed at the end. Screenshots + a11y snapshots under `test-results/perfect-state/shots/` (gitignored; quoted inline). The walk driver itself lived at `test-results/perfect-state/driver.mjs` during Phase 1 — it has been moved OUT of the tree (see F-GATE-1: eslint red on it) to `/home/agent/tmp-gpu/perfect-state-tools/`.
> **Verdict up front:** the spine is real and the 09-25 punch list's fixes HELD under a fresh walk — zero hard regressions across the 68 commits since 2026-09-25. What "not perfect" means today is (a) a residue of never-fixed polish tail, (b) new seams on the NEW surfaces (the image stack's dialogs, refusals, and mode vocabulary), and (c) flake classes in the verification tooling itself. **31 findings** — 18 new from this walk (W1–W18), 9 standing or recurred from 2026-09-25 (F12, M3, C11, F14-family, V1, V3, card padding, mid-word truncation, naming), 3 gate-flake classes (F-GATE-1/2/3), 1 doc staleness (ROADMAP) — collapsed into the 22 ranked punch-list items of §4.

---

## 1. Phase 1 — the fresh blind walk

The journey as walked: boot with engine already up → wizard all four steps → first prompt → auto-rendered video chain (landing, takes, play/fork) → settings end-to-end (Setup/Defaults/Status, pack board, stack report, override set/save/reset) → chain inspector (tiers, VDN, turbo family, AR-first resolution, LoRA rail, references) → images workbench (Generate packet, T=1 via Fizgig machinery, Compose/R2I with a bound canvas reference, Edit/instruct, Inpaint, resolution tiers to 8MP, pin, start-frame exit) → canvas seeded image→video chain (idle, correctly labeled, honest generate) → engine killed mid-session and restarted on a DIFFERENT profile (stock-h3) → validation failure shape → turbo render (graph-verified LoRA wiring) → VDN refusal → Music 3 dock → trash cycle (confirm/restore/empty-gate) → timeline/library/diagnostics docks → canvas archive export → index ⌘K → datasets surface.

**What genuinely works (verified live this walk, not from records):**

- **The wizard is whole.** All four steps reachable with a connected engine (F1 fix held): Engine (prefilled, honest probe-consent copy) → Models (live counts, "Custom stack detected — every component the graphs load is present") → Node packs (11 of 14 active) → First prompt (spawns + renders). Shots 01–05.
- **The render loop end-to-end**, five times across three lanes: text→video (5.0s decoded), image→video (seeded, idle, never auto-submitted — as promised), T=1 Fizgig still (engine-received graph: `FizgigH3StillLatent` + `FizgigH3StillDecode`), R2I with a bound canvas reference (`LoadImage` + `MiniMaxH3ReferenceToVideo` in the engine's own `/history`), and the turbo arm (`LoraLoaderModelOnly` → official 8-step LoRA at strength 1).
- **The stack report rework is honest** (tsw02y1): every row resolves through the submission path with its layer (`Inferred`), registry-name verbatim, canonical names as display guidance only, readiness narrated ("Every component resolves — generation works. Some differ from the canonical official artifacts"). Shots 08.
- **Engine-restart inventory refresh works** (the M1 fix, verified live for the first time): engine killed mid-session, restarted on the **stock-h3** profile — the model pickers re-synced to the NEW inventory with no manual refresh (the stock-only `qwen3vl_32b_minimax_h3_nvfp4_awq` TE resolves; the maintainer-only int8 TE left the lists; the fake engine's `refreshHits` shows the recovery fetch). Badge arc: ready → `engine offline` within one probe cycle with the assertive "Start ComfyUI…" alert → ready again.
- **Override attribution end-to-end** (F4/F5 fixes held): chip reads `global pick` with a pick in force, `auto (inferred)` after reset — no stale slot labels (`auto — global: <file>` → `auto — <inferred>`).
- **The image stack's gates are honest**: T=1 tab refuses leading with the actually-missing Mamad8 VAE; switching the T=1 machinery to Fizgig (installed on the mirror) UNLOCKS the lane; Refine/Burst disabled with reasons; the inpaint panel narrates the mask-edge and black-content truths; the exit dialog narrates the hybrid-loader tradeoff.
- **Trash is a real cycle** (PR #56): confirm states the blast radius ("Its 1 take ride it and come back with the restore") → trash view (restorable, "Empty trash (the one real delete)" gated on occupancy) → restore lands whole ("Scene restored to its canvas whole — takes included") and the take reappears in the outputs library.
- **Canvas archive export fires** (PR #61's wire): `GET /api/lan/documents/export?id=…` from the index row.
- **`[redacted]` never reached a user** (F11 fix held): the validation toast reads `Graph validation failed — node sampler: MiniMaxH3ImageToVideo value_smaller_than_min 17 5` — structured, clean; the server LOG keeps its markers (by design, the redaction evidence).
- **Music 3 is authorable with an honest gate**: dock opens from the Produce menu ("author now · render needs Music 3 DAV VAE"), empty-caption guarded.

### The findings (W#), as encountered

**W1 — the images workbench's dialogs are invisible to assistive tech (and to any semantics-driven tooling).** The canvas-ref picker (`div.iw-dialog`, "Use a canvas image as a reference") and the start-frame exit dialog (`div.iw-dialog-backdrop` + `div.iw-dialog`) carry **no `role="dialog"`, no `aria-modal`, no accessible name, no focus trap**: they never appear in the accessibility tree (my aria snapshots were empty while the dialog was open — that is how the walk first "lost" the picker), and the wizard on canvas proves the app knows better (`dialog "First-run setup wizard"`). Evidence: 36/38/40 (dialog open, absent from tree); `src/images/WorkbenchApp.tsx:1019-1055`. **Code fix** (dialog semantics + focus handling on `.iw-dialog`).

**W2 — Music 3's generate refusal over-claims the missing set.** With the maintainer's inventory (music3 DIT + text encoder PRESENT, only the DAV VAE absent — the settings row says exactly that), the dock's refusal reads *"The Music 3 diffusion model, text encoder, and DAV VAE are required. Install them, then rescan in Settings."* — three files named missing when one is. Evidence: 59; settings row (09-defaults) says the DAV alone. **Code fix**: compose the alert from the resolved rows (the stack-report machinery), not a family-ready predicate.

**W3 — the VDN refusal is generic where every sibling names its files.** Selecting "VDN · 8-step stage-dmd" and generating yields *"One or more required MiniMax H3 model components are missing."* — no file named, no pointer to the adjacent "fetch stages (2)" affordance, while the TE guard and Music 3's settings row both name exact files. The missing piece is the VDN stage weights (absent on the mirror; `vdn` models root). Evidence: 55. **Code fix**: same composition as W2 (name the stage-weight rows; the fetch affordance exists).

**W4 — the settings footer slices body text mid-sentence.** Defaults → "MiniMax H3 video" paragraph is cut mid-glyph by the sticky "All changes saved / Save settings" footer: "…and the Mimad8 T→I decoder is▌" — the sentence continues UNDER the footer and is lost. This is the exact paragraph the maintainer reads to understand model slots. Evidence: 09/10 (vision pass, finding 6). **CSS fix** (scroll padding / sticky-footer offset).

**W5 — the workbench mode navigation churns between states.** One session saw three different mode sets: boot — `Generate / Generate (frame packet) / Directed edit (39-frame settle) / T=1 Fast (unavailable) / fast-sharp (unavailable) / Compose / Edit / Refine / Burst / Exit`; after a T=1 take — `Generate / Compose / Edit / Edit — instruct / Inpaint / Edit — identity|background|outfit|lighting|pose|freeform / Refine / Burst / Exit`; then — `Generate / Compose / Reference → image / Compose (9 references) / Edit / Refine / Burst / Exit`. Contextual lanes appearing/disappearing is defensible, but three shapes in one session with overlapping names is disorientation on the newest flagship surface — pre-landing, the plain "Edit" tab opens the DIRECTED-EDIT panel (39-frame, video-settle) while a later sibling is literally named "Edit — instruct (single frame)": the same word "Edit" spans a video lane and a still lane, and "Directed edit" is never called that on its own tab. The walk's own tooling twice landed on Directed edit while aiming for instruct-edit — exactly the confusion a tab named "Edit" invites. Evidence: 20/23/34/42/43. **Design-round adjacent, but a code-fix slice exists** (stable top-level modes + a stable sub-lane row; consistent labels).

**W6 — "unavailable" tabs contain their own remedy.** The T=1 tab reads `unavailable` (badge) with the Image Studio default machinery selected (needs the Mamad8 VAE) — while the machinery combobox INSIDE the unavailable panel offers Fizgig, which is installed and unlocks the lane. The user who never opens an "unavailable" tab never learns a working path exists. Evidence: 21→27 (badge clears after selecting Fizgig). **Code fix** (badge reflects best-available machinery: "T=1 · 2 of 3 machineries ready") or copy pointer.

**W7 — single-frame flows speak packet language.** A T=1 (one frame) landing toasts *"The image packet landed — the take strip holds its frames"*, and the take caption awards *"scorer pick: 1 — sharpest of the pool (Laplacian 0.3)"* — a pool of one. Same for the R2I lane. Evidence: 28/43. **Code fix** (lane-aware landing copy; suppress pool-superlatives under N=1).

**W8 — the anchored/masked source has no in-app picker.** Inpaint/Edit lanes' "Choose the source image" opens ONLY the OS file dialog (hidden `input[type=file]`), while References on the same panel offer `add image / from canvas / from pose rig`. The natural source (a canvas take — the pinned frame from five minutes ago) is unreachable from the lane that needs it most. Evidence: 34/36. **Code fix** (reuse the CanvasRefPicker for sources).

**W9 — naming vocabularies ×3 for the same objects.** The pinned T=1 frame is `h3img 2` on the canvas, `image 3`/`image 4` for its successors (kind+ordinal), and `media 9f95fa6b` / `h3img c0997eae` (kind+hash8) in the index and outputs library — three conventions for one concept, adjacent in one screen. Recorded deferral since 09-26 (settings.name = ingest filename; display-name is its own seam) — still true, still user-visible. Evidence: 31/45/60/70. **Design-round item** (display-name field) with a code-fix fallback (one convention: kind+ordinal everywhere, hashes only on demand).

**W10 — the T=1 refusal paragraph echoes its own filename.** "…the Mamad8 T=1 image VAE (minimax_h3_t1_image_vae_step1597.safetensors) — the Fast profile decodes single frames through it — Needs the Mamad8 T=1 image VAE (minimax_h3_t1_image_vae_step1597.safetensors), an FL2VA turbo LoRA…" — the same file twice in one sentence (structural join of piece-label + needs-list). Evidence: 21 (a11y) + vision finding 11. **Code fix** (join once).

**W11 — the canvas-ref picker's visible labels are raw 64-char hashes, and they overlap.** The picker's two thumbnails caption themselves `f3d863fe2bc201af…c8650_0.png` — colliding across the gap between cards (unreadable superimposed text), the left caption overflowing its card. Evidence: 36/38/40 (vision finding 8). **Code fix** (label = take ordinal + kind; hash as title tooltip).

**W12 — spacing/legibility tail on the new surfaces** (vision pass): the "Choose the source image" button butts flush against the wrapped heading above it (zero gap, and its placement differs between states 34 vs 35); the "Refresh from engine" pill wraps its label onto three lines (08); the Local-model select truncates its value mid-word with no ellipsis ("No local text models detecte▌", 08); engine-mode card descriptions clamp mid-sentence (07); an occluded canvas text sliver peeks from behind the inspector panel in every inspector shot (~x1525, "Te/re/la" fragments). **CSS fixes, one sweep.**

**W13 — `window.confirm` gates the trash** — the one native browser dialog in an app that otherwise speaks its own styled-dialog language (the workbench needs the opposite fix per W1; here the in-app dialog should REPLACE the native one). Also the confirm's grammar: "Its 1 take ride it" (singular). Evidence: dialogs log; `src/canvas/IndexOverlay.tsx:203`. **Code fix.**

**W14 — validation-failure toasts dismiss too fast to be read.** The graph-validation toast (three lines of structured reason) is gone between t+2.5s and t+7s. A failure the user must ACT on should outlive a success toast. Evidence: 50 (gone at +7s) vs 52 (present at +2.5s). **Code fix** (duration by severity).

**W15 — every external-engine render logs a console 404.** `GET /api/lan/outputs/resolve?filename=ComfyUI_0000N_…` → 404, by design ("no local copy" probe; the poll kernel completes from the remote descriptor — the handler is correct, apiClient.ts:254-270 documents it). But a demanding user with devtools open sees a 404 per render on the maintainer's exact setup (external engine). **Code fix** (200 + `{path:null}` shape, or a HEAD probe) — cheap, kills a standing "is something broken?" signal.

**W16 — the "Graphs verified against this engine" line starts in a confusing state.** Fresh boot, engine connected and serving: "No verification recorded yet; it is captured on the next successful connection." — which already happened. Evidence: 08. **Code fix** (record on the boot connection).

**W17 — the `calm` button is present with nothing to calm** (empty queue at boot); clicking toasts "Nothing needs attention — the queue is calm." Harmless but puzzling-at-rest. Evidence: 01; `src/canvas/Radar.tsx`. **Code fix** (hide at rest) or design-round.

**W18 — the image→video (start-frame) render did not wire the preview-override pack node.** The one graph sampled from that lane (`LoadImage + MiniMaxH3ImageToVideo + PreviewImage`, no `MiniMaxH3PreviewOverrideCS`) — while the resolver (`h3Submit.ts:132`) requires `livePreview.enabled` AND pack class AND previewVae, and the standing e2e (journey.spec.ts) proves the node appears on the reference→video lane at boot-connect. Not reproduced as a failure; recorded as a sweep check for the start-frame lane's preview wiring. Evidence: turbo render graph (engine /history, this walk). **Sweep check, CPU-only.**

**Vision-confirmed recurrences from the 09-25 audit** (see its §F/V list): the "Fast · 8-step turbo LoRA" third-tier radio wraps alone under the segmented control and reads as a stray duplicate chip (05–10 — V1 recurs); ~9–10px low-contrast helper text throughout, worst on the images workbench's red explanation paragraphs (V3 recurs); ~55–90px dead bottom padding on media cards (recurs); card titles ellipsize mid-word ("…at dusk, sl…"). The clipped bottom-right toast (V2) does NOT recur — toasts land fully inside the viewport now.

**Persisting from the 09-25 punch list, unfixed by design or deferral:** F12 raw JSON in the Manager-presence note (`({"error":"fake engine has no /features"})` embedded in settings prose — 07); M3 cross-class files offered unmarked in every picker (the 4B TE in H3 slots, image VAEs in video slots — now caught at validate by the TE-dimension guard, but the choice point still gives no class signal); C11 "17n+5 grid" jargon hints (LoRA rail); the wizard's "Probe common ports" still lists 8188 first-class among common ports (consent-gated by click; the off-limits-instance hygiene note stands — F14); seed spinbutton a11y (`min=0`, no max — PropertiesPanel.tsx:994) unverified this walk.

**Environment notes, not app findings:** two headless-renderer deaths during the walk (both around index-overlay interactions; non-deterministic, swiftshader headless Chromium — did not reproduce; flagged for awareness only). A stray `/home/agent/work/VS%20Proj` directory was created by my own tooling on its first run (URL-pathname encoding bug in MY driver, not the app) — deletion is policy-gated, left in place for the maintainer to remove.

---

## 2. Phase 2 — the claims diff

Claims sources: the 09-25 audit's punch list + its 09-26 addenda (journey sweep c4fifi5, stack-report rework tsw02y1), the wiring check (shsl4kg) + its wire-or-remove resolutions (bp6vyzq), PR claims #52–#63, and docs/ROADMAP.md.

| # | Claim (source) | Observed this walk | Verdict |
|---|---|---|---|
| P1 | F1 wizard "skippable, resumable, steps 2–4 reachable" (journey sweep #9) | All four steps walked on a connected engine; completion spawns + renders | **Holds** |
| P2 | Stack report derives from submission resolution (tsw02y1 / PR #55) | Every row resolved + layer + canonical-as-hint; readiness narrated | **Holds** |
| P3 | Inventory refresh on engine recovery (PR #52 "restarts-between-probes split-brain root-corrected") | Verified live for the first time: profile-swap restart re-synced pickers with no manual refresh | **Holds (new live evidence)** |
| P4 | MODELS chip attributes per-slot (PR #52) | `global pick` chip + `auto — global: <file>` slot; resets clean (no F5 stale) | **Holds** |
| P5 | Music 3 DAV identified distinct, ladder honest (PR #52) | Settings row names the DAV requirement; but the DOCK refusal over-claims (W2) | **Half — new seam on top** |
| P6 | TE-dimension guard refuses wrong-class TEs at validate (PR #53) | Not re-exercised this walk (validate-time); pickers still offer cross-class unmarked (M3 stands) | **Holds at its seam; M3 open** |
| P7 | Fizgig T=1 lane behind flag → selectable (PR #54/#63) | Machinery row present; Fizgig + max-quality selectable; Fizgig lane renders end-to-end (graph-verified) | **Holds** |
| P8 | The image stack: 3 lanes + tiered resolutions (PR #63) | R2I walked end-to-end with a bound reference; instruct-edit + inpaint panels honest; resolution tiers to 3744×2112; mask painter present (panel walked; mask painting not exercised pixel-wise) | **Holds with new seams (W1/W5/W6/W8/W11)** |
| P9 | VDN emitted as `vdn.apply`, honest gating (PR #62) | VDN radio present, XOR with turbo; refusal honest-but-generic (W3) | **Half — refusal seam** |
| P10 | Review trio: trash semantics / AR-first resolution / reference prep never-cropped (PR #56) | Trash cycle verified whole; AR-first picker verified (ratio drives list, optimal marked); reference prep not re-measured (e2e holds it) | **Holds** |
| P11 | Wire-or-remove: 20 cut, 9 stub-marked (bp6vyzq) | 0 `FIXME(wiring)` remain; 8 `STUB(wiring)` markers stand as documented deferrals | **Holds** |
| P12 | Wave-1 bar: "`[redacted]` never reaches a user" | Validation toast clean (52) | **Holds** |
| P13 | "fetch missing" affordances honest (journey sweep #7) | Turbo-family note states the catalog truth verbatim (05-first-chain tree) | **Holds** |
| P14 | PreviewOverride pack owns preview decoding when present (PR #48 + journey sweep #3 RCA) | Reference→video lane covered by standing e2e; the start-frame lane's one sampled graph lacked the node (W18) — one sweep check | **Mostly holds; one lane to check** |
| P15 | docs/ROADMAP.md as "state of play" | Last refreshed 09-20/21: says "33 PRs merged, waves in flight, no dispatch until approval" — main is at 63+ PRs with the waves done and the image stack shipped. The doc defers to Flux by its own header, but a 2026-09-27 reader is three weeks stale | **Doc lie by staleness — refresh owed** |

**Regression count vs 2026-09-25: ZERO hard regressions.** No previously-working-and-claimed-fixed behavior misbehaved. The residue is: never-fixed tail (F12, M3, C11, V1, V3, card padding, truncations, naming), recorded deferrals (naming seam, STUB(wiring) set, Mamad8/T=1-Image-Studio product decision), and NEW seams on NEW surfaces (W1–W16).

---

## 3. Phase 3 — the machine truth (the full gate)

`TMPDIR=/home/agent/tmp-gpu pnpm gate` on the clean worktree at `20d7ea4` — run TWICE (the second run doubles as flake detection):

| leg | run 1 | run 2 (clean tree) |
|---|---|---|
| typecheck | PASS 16.8s | PASS 16.0s |
| lint | **FAIL 12.5s** (F-GATE-1 — the audit's own driver file, since moved out) | **PASS 12.8s** |
| license:audit | PASS 0.7s | PASS 0.8s |
| build | PASS 17.5s | PASS 17.8s |
| unit (all 20 vitest suites) | PASS 37.6s | PASS 37.3s |
| smoke:server | PASS 1.9s | PASS 1.6s |
| e2e (Playwright, fake engines) | PASS 518.6s | PASS 518.6s |
| vision-capture | PASS 81.1s | PASS 79.5s |
| **TOTAL** | 7/8 | **8/8 GREEN, 11.4m** |

**Machine-truth verdict: the full chain is GREEN on a clean tree, deterministic across two back-to-back runs** (per-leg wall times identical to within ~2s). Zero test flakes, zero skips beyond the documented conditional NOTE-skip pattern, zero warnings surfaced past the benign filter.

**The flake census** (every non-green or noise class, with root cause):

- **F-GATE-1 — eslint reds on files dropped under `test-results/`.** `eslint.config.mjs` ignores `dist*`, `release`, `node_modules`, `.claude/worktrees` — but NOT `test-results` (gitignored scratch where the gate itself writes vision bundles, and where any agent's tooling lands). This walk's own driver (a `.mjs` with browser globals) turned the lint leg red on an otherwise-clean tree — run 1's only failure. Root cause: the ignore list predates the vitest migration's `test-results/` convention. Fix shape: add `'test-results'` to `ignores` (one line). Verified: after moving the file out, lint passes standalone AND in the full chain (run 2).
- **F-GATE-2 — the per-render `outputs/resolve` 404 console noise** (W15 above): a designed probe that reads as breakage. Not a test flake; a runtime-noise class that fails "perfect" on the maintainer's external-engine setup.
- **The documented local-only classes** (TMPDIR/EDQUOT, shared-home e2e accumulation — both carry standing fixes in testing.md) did not fire in either run: the gate ran with `TMPDIR=/home/agent/tmp-gpu` and the datasets spec's `beforeAll` API-clean held.
- **F-GATE-3 — the vision capture's scroll anchors drifted with the pack board's growth.** The judge leg (sonnet-tier dispatch per the three-phase protocol, bundle `20260928-024529-4128712-uafk`) returned **34/36 checkpoints PASS**; the two fails (`settings-engine-packs`, `settings-engine-packs-outdated`) are the CAPTURE driver, not the UI: the pack list grew past the scenarios' authored scroll anchors when the H3-image packs landed, so the "installed on instance" badge the rubrics expect sits below the fold in both frames — the judge confirmed every VISIBLE badge renders correctly. `pnpm vision:report` on the bundle exits 1 on exactly those two. Fix shape: retarget the two anchors (HybridLoader row) in `scripts/vision-e2e/scenarios.ts`, recapture, re-judge — the documented fixture/rubric-drift class (testing.md's known-scenario-quirks list). The zoom-sweep crispness gates (100/200/400%) all PASS — the blur fix holds at camera maximum.

---

## 4. Phase 4 — the punch list, ranked by journey damage

Fix shapes name the seam; CPU-only = the mirror + unit/e2e verify it without a GPU. Classification: **CODE** (a code fix lands it) vs **DESIGN** (needs a ruling/design round — the shibui visual rework's territory is excluded by commission).

1. **W2+W3 — refusals that misstate or understate the missing set (Music 3 dock, VDN generate).** New features whose failure copy erodes trust in the inventory itself. Fix: compose refusals from the same resolved-rows machinery as the stack report (R5's per-row presence as data). CODE, CPU-only, two files + fixtures.
2. **W1 — workbench dialogs with no dialog semantics.** Exclusion-class defect on the flagship surface; also the root of the walk's own "lost picker" confusion. Fix: `role=dialog` + `aria-modal` + label + focus trap on `.iw-dialog` (backport the wizard's pattern). CODE, CPU-only.
3. **W4 — settings footer slices the Model overrides paragraph mid-sentence.** The model-truth surface, physically unreadable. CSS. CODE, CPU-only.
4. **W6 — "unavailable" tab hides a working machinery.** The maintainer's box HAS Fizgig; the badge says unavailable. Fix: availability = best-available machinery, badge says so. CODE, CPU-only.
5. **W5 — mode-nav churn + Edit/instruct/Directed-edit label overlap.** One stable top-level row + one stable sub-lane row; consistent vocabulary. DESIGN-lite (information architecture), then CODE.
6. **W8 — anchored source has no in-app picker while references do.** Reuse CanvasRefPicker for sources (it already returns outputId/takeId). CODE, CPU-only.
7. **W7 — single-frame lanes speak packet copy ("packet landed", "sharpest of the pool" at pool=1).** Lane-aware landing text; suppress superlatives under N=1. CODE, CPU-only.
8. **W15 / F-GATE-2 — the per-render 404 console noise.** 200-with-null or HEAD probe. CODE, CPU-only.
9. **W10 — the T=1 refusal echo (same filename twice).** Join once. CODE, CPU-only.
10. **W11 — picker hash captions (raw 64-char, overlapping).** Kind+ordinal label, hash as tooltip. CODE, CPU-only.
11. **W14 — failure toasts outlive their usefulness too fast.** Severity-scaled duration (failures sticky until dismissed or 15s). CODE, CPU-only.
12. **W13 — native `window.confirm` for trash + "1 take ride it" grammar.** In-app confirm (the app already has the dialog component); fix the pluralization. CODE, CPU-only.
13. **W12 — spacing/legibility sweep on new surfaces** (source-button spacing/placement, 3-line Refresh pill, select truncation, clamped card descriptions, occluded canvas sliver). CSS sweep. CODE (functional legibility, not taste).
14. **M3 (standing) — cross-class options unmarked in pickers.** The validate-time guard exists (TE guard, VAE class refusals); the choice point still gives no signal. Minimum: group or glyph by decoder class in VAE/TE pickers. CODE, CPU-only.
15. **F12 (standing) — raw JSON in the Manager-presence note.** Render the error's message field, not the body. CODE, CPU-only.
16. **W16 — "Graphs verified" not recorded on the boot connection.** CODE, CPU-only.
17. **W9 (standing deferral) — naming vocabularies ×3.** Display-name seam is the clean fix; interim: one convention (kind+ordinal) everywhere, hashes on demand. DESIGN, then CODE.
18. **C11 (standing) — "17n+5 grid" jargon hints.** Humanized vocabulary was R-22's promise. CODE (copy), CPU-only.
19. **W18 — start-frame lane preview-override wiring check.** One graph assertion in the sweep's e2e. CODE, CPU-only.
20. **V1/V3/padding/truncation tail (standing visual-functional):** the wrapped third tier radio reading as a stray chip (segmented-control width), ~9-10px helper floors on the workbench panels, 55–90px dead card padding, mid-word title cuts. CSS sweep; legibility floors are functional-polish IN scope, the aesthetic layer stays with shibui.
21. **W17 — `calm` at rest; F14-adjacent — probe list includes 8188 first-class; seed spinbutton max.** Minor tail, one sweep.
22. **P15 — docs/ROADMAP.md refresh owed** (three weeks stale; Flux wins by its own header, but the human-readable layer misleads). DOCS.

**The single worst journey-blocker:** none blocks the core journeys — the honest headline is that the spine (boot → wizard → render, all five lanes' graphs, crash recovery, trash, overrides) WORKS on the maintainer's inventory shape. The worst *trust* damage is #1: two new-feature refusals that misreport the inventory (Music 3 naming three missing files when one is; VDN naming none) — exactly the class the 09-25 audit called "the surfaces above the selection code misreport it."

**Proposed sweep order** (dependency-aware, CPU-only throughout):
1. The truth-surface sweep (items 1, 8, 9, 16 — refusals + noise + recording) — one seam: compose from resolved rows.
2. The dialog sweep (2, 12 — semantics for workbench dialogs, in-app confirm for trash).
3. The workbench coherence sweep (4, 5-lite, 6, 7, 10, 11 — badges, labels, copy, captions).
4. The CSS legibility sweep (3, 13, 20 — footer slice, spacing, wrap floors).
5. The standing tail (14, 15, 17, 18, 19, 21) + the ROADMAP refresh (22).
6. The tooling repairs so the gate can police the sweep: F-GATE-1 (`'test-results'` into eslint ignores — one line) and F-GATE-3 (retarget the two vision scroll anchors, recapture, re-judge). Both CPU-only, both before the sweep's first PR so every subsequent gate is trustworthy.

---

## 5. Reproduction & teardown record

- Studio: `MINIMAX_STUDIO_HOME=test-results/perfect-state/home MINIMAX_LAN_PORT=7360 MINIMAX_NO_HTTPS=1 node dist-server/server/index.js` (worktree build at `20d7ea4`), PID recorded, torn down.
- Fake engine: `node e2e/mirror/fakeEngineServer.mjs --port 7361 --profile e2e/mirror/profiles/{maintainer-instance,stock-h3}.json` — three instances (maintainer → killed mid-session → stock for the refresh leg → maintainer restored for failure-mode legs), all torn down; `failMode` exercised (`validation`) and cleared.
- Driver: HTTP-controlled headless Chromium (1920×1080) on 7370, screenshots + aria snapshots to `test-results/perfect-state/shots/` (55 PNGs + 52 tree dumps); torn down. The driver script itself now lives OUTSIDE the repo (`/home/agent/tmp-gpu/perfect-state-tools/driver.mjs`) after F-GATE-1.
- Ports 7360/7361/7370 probe-verified closed at the end; zero `minimax-` scratch strays from this walk (the studio home is the audit's own evidence dir).
- Never touched: `127.0.0.1:8188`, the GPU, any real engine. The wizard's "Probe common ports" was never clicked.
