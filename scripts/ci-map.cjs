#!/usr/bin/env node
'use strict'

/**
 * THE CI MANIFEST — path globs → affected vitest suites (task eg6l3v5,
 * remediation-plan §6 A-CI; directive 96e1fe5b + the maintainer's ruling:
 * "Testing should be fast but also accurate — not all or nothing … CI
 * should be for obvious things." → local = depth, CI = breadth + speed).
 *
 * This file is REVIEWED DATA, not logic: the rules below are the contract
 * the fast PR leg executes. It is greppable on purpose — to answer "what
 * does CI run when X changes", grep the path here.
 *
 * HOW IT RESOLVES — first-match-wins per changed file, rules in order:
 *   1. every rule whose glob set contains the file, in array order, FIRST
 *      hit owns the file (one rule per file keeps fan-out deterministic
 *      and this file honest — seam files get their own early rules);
 *   2. a file matching NO rule falls back to the FULL run and is reported
 *      as `unmatched` — never a silent under-run;
 *   3. `src/lib/**` and `server/**` have their own loud catch-alls (see
 *      reasons there) instead of relying on the global fallback.
 *
 * HONEST FAN-OUT: seam files (src/lib/workflow.ts, server/core.ts, …)
 * legitimately map to near-full runs and SAY so below. Nothing silently
 * under-runs: suites' build needs (dist-booting suites force build-first —
 * the stale-dist rule), python/ffmpeg needs, and the e2e escalation all
 * ride the same data.
 *
 * SELF-TEST: tests/ci-map.test.js walks this manifest — every catalog
 * suite exists on disk, every tests/*.test.js is catalogued and reachable
 * from at least one glob, seam fan-outs match their declared sets, and the
 * fallback fires for unmapped src/lib files. Adding a suite without
 * mapping it FAILS CI (the ci-map suite runs on every PR by its own rule).
 *
 * Local gate semantics are UNCHANGED (scripts/run-gate.cjs stays the full
 * depth chain); only CI is path-scoped.
 */

const fs = require('node:fs')
const path = require('node:path')

const REPO = path.resolve(__dirname, '..')

/**
 * Suite catalog — every tests/*.test.js file. Fields:
 *   build   — what must be built BEFORE the suite runs (stale-dist rule):
 *             'server' = build:server, 'full' = web + server, null = none.
 *   windows — runs on the Engine CI (Windows) leg. DORMANT since the
 *             2026-09-21 demotion (scheduled-only leg): the flag stays as
 *             data for the weekly sweep + any future PR-path re-wiring.
 *   python  — needs python3 + numpy (benchmarks).
 *   ffmpeg  — needs ffmpeg on PATH (filmstrip, datasets synthetic ingest).
 * The ci-map self-test enforces this stays in lockstep with tests/.
 */
const SUITES = {
  'animation-assembly': { build: null, windows: false, python: false, ffmpeg: false },
  'animation-compiler': { build: null, windows: false, python: false, ffmpeg: false },
  'animation-rendering': { build: 'server', windows: false, python: false, ffmpeg: true },
  'animation-export': { build: 'full', windows: false, python: false, ffmpeg: true },
  'animation-routes': { build: 'full', windows: false, python: false, ffmpeg: true },
  'animation-store': { build: 'server', windows: false, python: false, ffmpeg: false },
  'animation-stage-breakpoint': { build: null, windows: false, python: false, ffmpeg: false },
  'animation-timeline-model': { build: null, windows: false, python: false, ffmpeg: false },
  'animation-types': { build: null, windows: false, python: false, ffmpeg: false },
  benchmarks: { build: 'server', windows: true, python: true, ffmpeg: false },
  'button-classes': { build: null, windows: false, python: false, ffmpeg: false },
  camera: { build: null, windows: false, python: false, ffmpeg: false },
  canvas: { build: null, windows: false, python: false, ffmpeg: false },
  'chip-classes': { build: null, windows: false, python: false, ffmpeg: false },
  'ci-map': { build: null, windows: false, python: false, ffmpeg: false },
  datasets: { build: 'full', windows: false, python: false, ffmpeg: true },
  'dockOrder': { build: null, windows: false, python: false, ffmpeg: false },
  'effective-row-classes': { build: null, windows: false, python: false, ffmpeg: false },
  documents: { build: 'full', windows: false, python: false, ffmpeg: false },
  'engine-process': { build: 'server', windows: true, python: false, ffmpeg: false },
  'engine-contract': { build: null, windows: false, python: false, ffmpeg: false },
  'engine-families': { build: null, windows: false, python: false, ffmpeg: false },
  enginewatch: { build: null, windows: false, python: false, ffmpeg: false },
  'field-classes': { build: null, windows: false, python: false, ffmpeg: false },
  fetcher: { build: 'full', windows: true, python: false, ffmpeg: false },
  'gallery-matrices': { build: null, windows: false, python: false, ffmpeg: false },
  filmstrip: { build: 'full', windows: false, python: false, ffmpeg: true },
  h3img: { build: null, windows: false, python: false, ffmpeg: false },
  'handoff-classes': { build: null, windows: false, python: false, ffmpeg: false },
  instance: { build: 'full', windows: true, python: false, ffmpeg: false },
  layerRegistry: { build: null, windows: false, python: false, ffmpeg: false },
  launcher: { build: 'full', windows: false, python: false, ffmpeg: false },
  llm: { build: 'full', windows: false, python: false, ffmpeg: false },
  'manager-install': { build: 'full', windows: false, python: false, ffmpeg: false },
  'notice-classes': { build: null, windows: false, python: false, ffmpeg: false },
  'overlay-behavior': { build: null, windows: false, python: false, ffmpeg: false },
  poserig: { build: null, windows: false, python: false, ffmpeg: false },
  'progressbar-classes': { build: null, windows: false, python: false, ffmpeg: false },
  realtime: { build: 'full', windows: false, python: false, ffmpeg: false },
  registry: { build: null, windows: false, python: false, ffmpeg: false },
  resync: { build: 'full', windows: false, python: false, ffmpeg: false },
  runtime: { build: 'full', windows: true, python: false, ffmpeg: false },
  'refusal-classes': { build: null, windows: false, python: false, ffmpeg: false },
  'save-status-classes': { build: null, windows: false, python: false, ffmpeg: false },
  storage: { build: 'full', windows: false, python: false, ffmpeg: false },
  statusToken: { build: null, windows: false, python: false, ffmpeg: false },
  'stylelint-guard': { build: null, windows: false, python: false, ffmpeg: false },
  vdn: { build: null, windows: false, python: false, ffmpeg: false },
  workflows: { build: null, windows: false, python: false, ffmpeg: false },
}

/** Every suite that boots dist-server/server/index.js directly (route-level
 *  integration): the honest fan-out for the server seams. */
const BOOTING = ['animation-export', 'animation-routes', 'datasets', 'documents', 'fetcher', 'filmstrip', 'instance', 'llm', 'manager-install', 'realtime', 'resync', 'runtime', 'storage']

/** Every suite drawing scratch ports through tests/lib/ports.cjs. */
const PORT_USERS = ['animation-export', 'animation-rendering', 'animation-routes', 'datasets', 'documents', 'engine-process', 'fetcher', 'filmstrip', 'instance', 'launcher', 'llm', 'manager-install', 'realtime', 'resync', 'runtime', 'storage']
/** Every kit suite reading src/styles.css through the shared sheet reader
 *  (tests/lib/styleSheet.cjs — the near-term-A parser consolidation). */
const SHEET_USERS = ['button-classes', 'chip-classes', 'effective-row-classes', 'field-classes', 'handoff-classes', 'notice-classes', 'progressbar-classes', 'refusal-classes', 'save-status-classes', 'statusToken']

/** The suites that load client TS through the VM harness (scripts/lib/ts-vm.cjs). */
const VM_SUITES = ['camera', 'canvas', 'dockOrder', 'effective-row-classes', 'engine-families', 'enginewatch', 'gallery-matrices', 'h3img', 'handoff-classes', 'poserig', 'refusal-classes', 'registry', 'resync', 'save-status-classes', 'vdn', 'workflows']

/** Every vitest suite — the FULL fallback set. */
const ALL_SUITES = Object.keys(SUITES).sort()

/**
 * RULES — ordered, first-match-wins. Each: { match: [globs], suites, reason }.
 * Optional flags: forceE2e (run the Playwright e2e project on the PR leg
 * too), forceWindows (run the Windows leg's FULL set on PRs — the leg
 * verifying itself), lintAll (run the FULL lint instead of
 * changed-files-only).
 */
const RULES = [
  // ---------- CI + test infrastructure ---------------------------------
  {
    match: ['.github/workflows/engine-windows.yml'],
    suites: ['ci-map'],
    forceWindows: true,
    reason: 'DEMOTED TO SCHEDULED-ONLY (maintainer 2026-09-21: "Windows tests take the back seat … very low priority") — the leg no longer runs on PRs/main, so this escalation is DORMANT DATA: the windows flags + forceWindows machinery stay so the leg can be re-wired into the PR path without redesign if the posture reverses.',
  },
  {
    match: ['.github/**', 'scripts/ci-map.cjs', 'scripts/check-registry-append.cjs', 'tests/ci-map.test.js'],
    suites: ['ci-map'],
    reason: 'the CI contract tests itself — every PR touching CI or the manifest runs the manifest walk.',
  },
  {
    match: ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'tsconfig.server.json', 'vite.config.ts', 'vitest.config.ts'],
    suites: ALL_SUITES,
    reason: 'dependency / build / test infrastructure: anything can shift — full run (also on the Windows leg).',
  },
  {
    match: ['eslint.config.mjs', 'stylelint.config.mjs', 'src/styles.css', '.gitattributes', '.gitignore'],
    suites: ['stylelint-guard', 'statusToken', 'chip-classes', 'button-classes', 'progressbar-classes', 'notice-classes', 'dockOrder', 'field-classes', 'effective-row-classes', 'refusal-classes', 'save-status-classes', 'handoff-classes'],
    lintAll: true,
    reason: 'lint/config — the stylelint guard suite owns stylelint.config.mjs and the :root type ramp it parses out of src/styles.css (a ramp change can flip the guard); the statusToken suite contract IS that same :root block (the token type map — whole-branch review finding 1: it was absent from the fan-out); the chip-classes suite walks the same sheet\'s .chip recipe block (existence, tone-only properties, :root-defined tokens — task 6); the button-classes suite walks the sheet\'s .btn recipe block the same way (task 7); the progressbar-classes suite walks the sheet\'s .progressbar recipe block + the migrated fetch/tile dialect rules in styles.css and canvas.css (task 8); the notice-classes suite walks the sheet\'s .toast-host/.notice-banner recipe blocks + the §8 dead-CSS retirement pins (task 9); the dockOrder suite pins the §0.1 z-token ladder in the same :root block (--z-dock-base < --z-modal < --z-consent, toasts above modal) plus the toast/consent rule lockstep (task 11); the field-classes suite walks the sheet\'s .field-description recipe block the same way (tone/type-only properties per P06, :root-defined tokens — task 18); the effective-row-classes suite walks the sheet\'s .effective-setting recipe block the same way plus the SettingsView row geometry (flow/tone properties per P06, chip geometry on the row\'s own token, :root-defined tokens — task 19); the save-status-classes suite walks the sheet\'s .save-status recipe block the same way (tone/type/flow per P06 with the retry button\'s inheritance resets, :root-defined tokens — task 20); the refusal-classes suite walks the sheet\'s .refusal recipe block the same way (tone/type/flow per P06 with the satisfy button\'s inheritance resets, the warning-not-danger tone pin, :root-defined tokens — task 21); the handoff-classes suite walks the sheet\'s .handoff recipe block the same way (tone/type/flow per P06 with the retry button\'s inheritance resets, the danger-belongs-to-the-failed-write pin, :root-defined tokens — task 22); the full lint runs on any of these.',
  },
  {
    match: ['playwright.config.ts', 'e2e/**'],
    suites: [],
    forceE2e: true,
    reason: 'browser suites own their own verification — run e2e when they change (vision stays main-only).',
  },
  {
    match: ['e2e/mirror/**'],
    suites: ['resync'],
    forceE2e: true,
    reason: 'the environment-mirror fake engine + its profiles are ALSO the resync suite\'s standing engine — a mirror change must run the kill/restart inventory-freshness suite alongside the e2e leg.',
  },
  {
    match: ['start.sh'],
    suites: ['launcher'],
    reason: 'start.sh is the launcher suite\'s subject.',
  },
  {
    match: ['scripts/lib/ts-vm.cjs'],
    suites: VM_SUITES,
    reason: 'the VM harness executes inside every client-module suite.',
  },
  {
    match: ['scripts/lib/registry-matrix.cjs', 'scripts/lib/krea2edit-matrix.cjs', 'scripts/fixtures/registry-golden.json', 'scripts/fixtures/krea2edit-golden.json'],
    suites: ['registry'],
    reason: 'registry golden machinery + fixtures.',
  },
  {
    match: ['scripts/lib/h3img-matrix.cjs', 'scripts/fixtures/h3img-golden.json'],
    suites: ['h3img'],
    reason: 'h3img golden machinery + fixture.',
  },
  {
    match: ['scripts/experiments/**'],
    suites: ['h3img'],
    reason: 'experiment arm runners (the E-FS1 entry loads the h3image builder + engine-contract mirror through the VM harness; exercised by the h3img suite).',
  },
  {
    match: ['src/lib/engineContract.ts', 'src/lib/engineSemantics.ts', 'scripts/fixtures/engine-object-info.json', 'scripts/capture-engine-schemas.cjs'],
    suites: ['engine-contract'],
    reason: 'the engine-contract layer (8dga2dy): real captured object_info schemas + the execution.py validator mirror + the semantic-rules ledger — every builder graph validated against the engine\'s actual gate.',
  },
  {
    match: ['scripts/fixtures/camera-goldens.json', 'scripts/fixtures/camera-goldens.py'],
    suites: ['camera'],
    reason: 'camera golden fixture (+ its generator).',
  },
  {
    match: ['scripts/fixtures/poserig-goldens.json'],
    suites: ['poserig'],
    reason: 'poserig pose fingerprints.',
  },
  {
    match: ['scripts/fixtures/engine-child.cjs', 'scripts/fixtures/engine-child.py'],
    suites: ['engine-process'],
    reason: 'the supervised child the engine-process suite spawns.',
  },
  {
    match: ['scripts/fixtures/runtime-stub.cjs', 'scripts/fixtures/runtime-stub-crash.cjs'],
    suites: ['runtime'],
    reason: 'managed-runtime stub checkouts.',
  },
  {
    match: ['tests/lib/ports.cjs'],
    suites: PORT_USERS,
    reason: 'the port allocator draws ranges for every server-booting suite.',
  },
  {
    match: ['tests/lib/styleSheet.cjs'],
    suites: SHEET_USERS,
    reason: 'the shared styles.css :root parser + recipe walker every kit suite reads the sheet through.',
  },
  {
    match: ['scripts/copy-llm-families.cjs'],
    suites: ['llm'],
    reason: 'copies the LLM family manifests the llm suite infers against (into dist-server).',
  },
  {
    match: ['vendor/**'],
    suites: ['fetcher', 'instance', 'runtime'],
    reason: 'vendored node packs: every install/link flow + the license audit (inputs tracked separately).',
  },
  {
    match: ['custom-nodes/**'],
    suites: [],
    reason: 'first-party node-pack payloads (the form adapter): install flows exercise them via engineNodes/fetcher; the lora-form suite that tested them directly died with the local scan (Wave 2 R-12).',
  },
  {
    match: ['benchmarks/**'],
    suites: ['benchmarks'],
    reason: 'the benchmark harness tree.',
  },
  {
    match: ['scripts/run-gate.cjs', 'scripts/smoke-server.cjs', 'scripts/compress-dist.cjs', 'scripts/vision-e2e/**', 'scripts/css-shot-diff.cjs', 'scripts/css-token-audit.cjs', 'scripts/css-token-codemod.cjs', 'scripts/stylelint-raw-color-allowlist.json', 'scripts/perf-profile/**'],
    suites: [],
    reason: 'local-only tooling (gate chain, vision driver, css audits): exercised by the main gate, not unit suites.',
  },
  {
    match: ['scripts/**'],
    suites: [],
    reason: 'one-off scripts/codemods — no unit suite; add a precise rule above if a suite starts depending on one.',
  },

  // ---------- shared (server + client + compiler contracts) -------------
  {
    match: ['shared/animation/assembly.ts'],
    suites: ['animation-assembly', 'animation-export', 'animation-timeline-model'],
    reason: "the shared assembly-edge derivation (task 15a) — export's gate and the timeline preview both consume it.",
  },
  {
    match: ['shared/animation/types.ts'],
    suites: ['animation-types', 'animation-store', 'animation-compiler'],
    reason: 'the animation domain types + guards — the store suite drives parseAnimationDocumentBody + the candidate parser through every authoring command and landing; the compiler suite compiles through the closed vocabularies.',
  },
  {
    match: ['shared/animation/compiler.ts'],
    suites: ['animation-compiler', 'animation-rendering'],
    reason: 'the caption compiler — its suite compiles every tool template through the vocabularies; the rendering suite freezes compiler-produced captions into every submitted snapshot (task 4).',
  },
  {
    match: ['shared/animation/graphs.ts'],
    suites: ['animation-rendering', 'engine-contract'],
    reason: 'the three tool graph builders — the rendering suite submits them through the real fake engine, and every emission is validated against the REAL captured object_info (the contract-truth walk, testing.md\'s truth ladder).',
  },

  // ---------- server (behavioral map from each suite's imports) --------
  {
    match: ['server/index.ts', 'server/core.ts'],
    suites: BOOTING,
    reason: 'SEAM — the server composition root: every booting suite executes it. Near-full by design; do not narrow.',
  },
  {
    match: ['server/logger.ts', 'server/logSanitize.ts', 'server/requestGuard.ts', 'server/repo.ts'],
    suites: BOOTING,
    reason: 'shared server utilities in the index/core import closure — every booting suite loads them.',
  },
  { match: ['server/db.ts'], suites: ['datasets', 'documents', 'storage', 'animation-store'], reason: 'the sqlite layer: migrations (documents + animation-store via 006), dataset tables (datasets), jobs/library (storage).' },
  { match: ['server/animation/store.ts'], suites: ['animation-store', 'animation-rendering', 'animation-routes'], reason: 'the animation document store — its suite drives it directly off dist-server; the rendering suite composes the same store under the real fake engine; the routes suite drives every authoring command + landing through the mounted HTTP block (task 5 landed removeSpan + attemptsForDocument there).' },
  { match: ['server/animation/rendering.ts', 'server/animation/completion-owner.ts'], suites: ['animation-rendering', 'animation-routes'], reason: 'the rendering service + the shared completion owner — the rendering suite runs their dispatch/observation/landing/reconciliation paths for real against the fake engine; the routes suite reaches them through the real server process (submit/getState/cancel/extract-frame + boot reconcile).' },
  { match: ['server/animation/models.ts'], suites: ['animation-rendering', 'animation-routes'], reason: 'the registry-driven model resolver (wave 1, the live review #1) — the rendering suite pins the pure ladder truth (exact defaults, differing enumerations, overrides, dead slots) plus the submit-time preflight end to end; the routes suite pins the named 400 over HTTP and the resolved names on the received graph.' },
  { match: ['server/animation/export.ts'], suites: ['animation-assembly', 'animation-export'], reason: 'the export pipeline (task 14, spec §11.3) — its own suite owns it end to end: the pure gate + manifest derivations and the real assembly (server + fake engine + ffmpeg) over HTTP; task 15a added the assembly-agreement suite, which drives the same gate against the preview (the shared-edge pin).' },
  { match: ['server/animation/routes.ts'], suites: ['animation-routes'], reason: 'the animation HTTP block — a pure handler mounted by core.ts; its suite boots the real server against the fake engine.' },
  { match: ['server/documents.ts', 'server/documentArchive.ts'], suites: ['documents', 'animation-store'], reason: 'document store + zip archive — the animation round-trip (spec §11.3) rides the same archive, exercised by the animation-store suite.' },
  { match: ['server/realtime.ts'], suites: ['realtime', 'manager-install', 'animation-routes'], reason: 'the fabric — WS realtime framing/delivery; the Manager cm-queue event normalizer (0pktw5h) is exercised by the manager-install suite too, and the animation channel + emitAnimation + the engine-event tap (animation module task 5) are driven end-to-end by the animation-routes suite.' },
  { match: ['server/llm/**'], suites: ['llm'], reason: 'LLM family registry + providers.' },
  { match: ['server/datasets/**'], suites: ['datasets'], reason: 'dataset manager domain.' },
  { match: ['server/engineProcess.ts'], suites: ['engine-process', 'runtime'], reason: 'process supervision — its own suite + the runtime manager.' },
  { match: ['server/engineProfiles.ts'], suites: ['runtime'], reason: 'engine profile merge/resolve.' },
  { match: ['server/enginePatch.ts'], suites: ['runtime'], reason: 'engine patch application.' },
  { match: ['server/engineNodes.ts'], suites: ['fetcher', 'instance', 'runtime'], reason: 'the node-pack registry: every install/pack flow (also a license-audit input).' },
  { match: ['server/fetchCatalog.ts'], suites: ['benchmarks', 'fetcher'], reason: 'fetch catalog: the fetcher consumer + the benchmarks catalog bridge.' },
  { match: ['server/fetcher.ts'], suites: ['fetcher'], reason: 'fetch transport + tar extraction.' },
  { match: ['server/instanceInventory.ts', 'server/packVersioning.ts'], suites: ['instance'], reason: 'external-instance inventory + pack versioning.' },
  { match: ['server/objectInfoProbe.ts'], suites: ['fetcher', 'instance'], reason: 'the targeted object_info presence probe (Wave 2 A-8): executes on the engine/nodes + bootstrap routes the instance suite drives; fetcher exercises the pack-board flows that consume it.' },
  { match: ['server/managerClient.ts'], suites: ['instance', 'manager-install'], reason: 'the ComfyUI-Manager client (0pktw5h): the manager-install suite owns its arms; instance exercises the pack-board routes that consume the probe.' },
  { match: ['server/runtime.ts'], suites: ['runtime'], reason: 'managed ComfyUI runtime.' },
  {
    match: ['server/**'],
    suites: BOOTING,
    reason: 'LOUD CATCH-ALL — an unmapped server module is conservatively the booting closure (a new server file imported by core.ts executes in every booting suite). Map it precisely instead.',
  },

  // ---------- tests themselves ------------------------------------------
  {
    match: ['tests/*.test.js'],
    suites: null, // special: the file's own suite (basename minus .test.js)
    suiteFromFile: true,
    reason: 'a suite file always runs itself.',
  },
  {
    match: ['tests/**'],
    suites: [],
    reason: 'test helpers/fixtures — the load-bearing ones (ports.cjs, styleSheet.cjs, ci-map) have their own rules above.',
  },

  // ---------- src client (VM-harness module map) ------------------------
  {
    match: ['src/lib/workflow.ts'],
    suites: ['canvas', 'h3img', 'poserig', 'registry', 'workflows'],
    reason: 'SEAM — the graph builder every client suite loads. Near-full client fan-out by design; do not narrow.',
  },
  {
    match: ['src/canvas/store.ts'],
    suites: ['canvas'],
    forceE2e: true,
    reason: 'SEAM — the app kernel. HONEST LIMIT: no unit suite executes store.ts directly (the canvas VM modules are its projections); the PR leg forces e2e as the behavioral net, local depth + the main gate own the rest.',
  },
  {
    match: ['src/canvas/camera.ts', 'src/canvas/derive.ts', 'src/canvas/generation.ts', 'src/canvas/loraTimeline.ts', 'src/canvas/ops.ts', 'src/canvas/options.ts', 'src/canvas/plan.ts', 'src/canvas/stillIntent.ts'],
    suites: ['canvas'],
    reason: 'the canvas logic modules the canvas suite loads through the VM harness.',
  },
  { match: ['src/lib/camera/**'], suites: ['camera'], reason: 'camera path model + parity goldens.' },
  { match: ['src/poserig/**'], suites: ['poserig'], reason: 'pose rig domain (logic modules; PoseRigApp.tsx rides the dir).' },
  {
    match: ['src/animation/**'],
    suites: ['animation-assembly', 'animation-stage-breakpoint', 'animation-timeline-model'],
    forceE2e: true,
    reason: "animation browser modules (k2q0n9s) — e2e owns their behavior; the timeline model (task 8) is the node-tested pure core (deriveTimeline lane/badge derivation + the review position), every other module in the tree is browser-only. Task 15a: timelineModel.ts's assembled-sequence preview consumes the shared assembly-edge derivation, so the assembly-agreement suite rides the diff too. Wave 3 fix round: the stage-breakpoint suite pins the css/matchMedia literal pair, so it rides every src/animation diff (either home can drift). NOTE timelineModel.ts is deliberately not split into its own narrower rule: the whole tree forces the e2e leg either way, and the suite rides the same diff.",
  },
  { match: ['src/lib/graph/h3image.ts'], suites: ['canvas', 'h3img', 'registry', 'workflows'], reason: 'the H3 image graph factory — loaded by four suites.' },
  { match: ['src/lib/graph/engineFamilies.ts', 'tests/engine-families.test.js'], suites: ['canvas', 'engine-families', 'workflows'], reason: 'the engine-family registry (A-3): the canvas selector/panel seam + its own suite; workflows loads the graph barrel.' },
  { match: ['src/lib/preflightRemediation.ts'], suites: ['enginewatch'], reason: 'the R-17 remediation rows: pure data over the same registries preflight maps (enginewatch owns the preflight seams).' },
  { match: ['src/lib/graph/krea2edit.ts'], suites: ['h3img', 'registry'], reason: 'Krea-2 edit families (h3img directly; registry via graph/index re-export + golden).' },
  { match: ['src/lib/graph/**'], suites: ['registry'], reason: 'the optimization registry surface (graph/index re-exports the tree; the registry golden is the contract).' },
  { match: ['src/lib/serverStorage.ts'], suites: ['storage'], reason: 'the client storage layer the storage suite transpiles + drives against the server.' },
  { match: ['src/lib/workspace.ts'], suites: ['registry'], reason: 'workspace selection resolution.' },
  { match: ['src/lib/h3imageContract.ts', 'src/lib/h3imageOps.ts', 'src/lib/h3imageScorer.ts', 'src/lib/h3imageStaging.ts'], suites: ['h3img'], reason: 'H3 image contract/ops/scorer/staging.' },
  {
    match: ['src/lib/engineWatch.ts', 'src/lib/fabricWatch.ts', 'src/lib/dbg.ts', 'src/lib/preflight.ts'],
    suites: ['enginewatch', 'engine-contract', 'resync', 'animation-routes'],
    reason: 'Wave-1 pure decision modules (jpc96dp: re-check cadence, WS re-probe/resync, the A-DBG tagged logger, submit preflight) — the enginewatch suite drives them through the VM harness; preflight\'s STOCK_GRAPH_CLASSES is coverage-lockstep-checked by the engine-contract fixture; engineWatch\'s resync decisions also execute against the real mirror in resync. fabricWatch\'s reopen-resync contract gained the animation channel (animation module task 5), pinned by the animation-routes suite\'s fabric leg.',
  },
  {
    match: ['src/types.ts'],
    suites: ['animation-routes'],
    reason: 'the shared type surface: the RealtimeJsonChannel union gained the animation channel (animation module task 5) — the wire behavior (channel subscribe + envelope delivery) is what a suite can pin, and animation-routes drives it through the real fabric.',
  },
  {
    match: ['src/lib/engineRecovery.ts'],
    suites: ['enginewatch', 'resync'],
    reason: 'the engine-probe consequence flow (sweep #2, 68e9k17): recovery/drift resync with refresh semantics + honest resync bookkeeping — unit-driven in enginewatch (recording harness), mirror-driven in resync (real server + real fake engine over HTTP).',
  },
  {
    match: ['src/lib/h3Stack.ts'],
    suites: ['workflows', 'enginewatch'],
    reason: 'the H3 stack report — the workflows suite\'s override-verdict legs plus the enginewatch mirror-shaped basename-truth section (sweep #1, 68e9k17).',
  },
  {
    match: ['src/lib/nodePackRegistry.ts'],
    suites: ['enginewatch', 'fetcher', 'instance', 'runtime'],
    reason: 'the node-pack registry DATA (extracted from server/engineNodes, Wave 1 R-02 — one source of truth): every pack flow asserts it, preflight (enginewatch) reads it; also a license-audit input.',
  },
  {
    match: ['src/lib/promptError.ts'],
    suites: ['workflows'],
    reason: 'structural prompt-error classification — extracted pure (Wave 1) so the workflows suite drives it; server/core re-imports it.',
  },
  // (src/lib/aceStepSubmit.ts left this list with the engine, 2026-09-21 — nn5ld47.)
  { match: ['src/lib/cameraPath.ts', 'src/lib/h3Submit.ts', 'src/lib/music3Submit.ts', 'src/lib/structuredPrompt.ts'], suites: ['canvas'], reason: 'submit/structured-prompt modules the canvas suite loads.' },
  { match: ['src/images/submit.ts'], suites: ['canvas'], reason: 'image submit flow (canvas suite).' },
  { match: ['src/images/session.ts'], suites: ['h3img'], reason: 'image session model (h3img suite).' },
  {
    match: ['src/lib/modelSelection.ts'],
    suites: ['registry', 'workflows'],
    reason: 'selection inference — loaded directly by both suites.',
  },
  {
    match: ['src/ui/statusToken.ts'],
    suites: ['statusToken'],
    reason: 'the domain-qualified status→tone-token map (component vocabulary task 4): the statusToken suite parses styles.css :root at run time and checks every mapped token is DEFINED, plus the exhaustive divergence table.',
  },
  {
    match: ['src/ui/Chip.tsx', 'src/ui/chipClasses.ts'],
    suites: ['chip-classes'],
    reason: 'the chip system\'s pure tone/variant class + aria math (component vocabulary task 6): the chip-classes suite loads chipClasses.ts through the VM harness and walks the .chip recipe block in src/styles.css (recipe lockstep both directions, tone-only properties per P06, :root-defined tokens).',
  },
  {
    match: ['src/ui/Button.tsx', 'src/ui/buttonClasses.ts'],
    suites: ['button-classes'],
    reason: 'the Button API\'s pure variant/busy class + state math and its border-shorthand hazard net (component vocabulary task 7): the button-classes suite loads buttonClasses.ts through the VM harness, walks the .btn recipe block in src/styles.css (recipe lockstep both directions, tone-only properties per P06, :root-defined tokens), and re-runs the C1 net over every Button-composed surface class across all src sheets.',
  },
  {
    match: ['src/ui/ProgressBar.tsx', 'src/ui/progressClasses.ts', 'src/canvas/canvas.css'],
    suites: ['progressbar-classes', 'chip-classes', 'dockOrder', 'handoff-classes', 'notice-classes', 'save-status-classes'],
    reason: 'the scalar progress bar\'s pure tone/state class + width/aria math (component vocabulary task 8): the progressbar-classes suite loads progressClasses.ts through the VM harness, pins the determinate width math byte-identical to the retired fetch expression, and walks the .progressbar recipe block in src/styles.css plus the migrated fetch/tile dialect rules (recipe lockstep both directions, tone+mechanics-only properties per P06, :root-defined tokens, retirement pins — canvas.css carries the tile row). Whole-branch review finding 1: five sibling suites also read canvas.css (the canvas-chip canvas rows, the dock ladder sheet walk, the handoff footer dialect, the notice retained edge rows, the save-status tile pins) — a canvas.css diff runs them all now.',
  },
  {
    match: ['src/ui/ToastHost.tsx', 'src/ui/NoticeBanner.tsx', 'src/ui/noticeClasses.ts', 'src/canvas/toastAdapter.tsx', 'src/images/workbench.css', 'src/datasets/datasets.css'],
    suites: ['notice-classes', 'field-classes'],
    reason: 'the toast/notice family\'s pure placement/tone/aria class math + the P07 adapter\'s store-wiring pass-through (component vocabulary task 9): the notice-classes suite loads noticeClasses.ts through the VM harness, pins the retained canvas-toast item vocabulary byte-identical to the retired strip expression, walks the .toast-host/.notice-banner recipe blocks in src/styles.css (recipe lockstep both directions, property whitelists per P06, :root-defined tokens), re-runs the C1 net over every NoticeBanner-composed surface class, and pins the §7/§8 migrations (the workbench inline strip, the .iw-notice/.iw-toasts rules, the datasets banner tone rules, the manifest §8 dead-CSS families — workbench.css/datasets.css carry the retained edge rows). Task 18 review: the field-classes suite also walks datasets.css (the .ds-validation tone-retirement pins), so a datasets.css diff runs it too.',
  },
  {
    match: ['src/ui/dockOrder.ts', 'src/ui/useDockRank.ts', 'src/ui/StudioDock.tsx', 'src/canvas/SettingsDock.tsx', 'src/canvas/DiagnosticsDock.tsx', 'src/canvas/PoseRigDock.tsx', 'src/canvas/AudioDock.tsx', 'src/canvas/RemediationDock.tsx', 'src/canvas/PropertiesPanel.tsx', 'src/components/LibraryDock.tsx'],
    suites: ['dockOrder', 'effective-row-classes', 'save-status-classes'],
    forceE2e: true,
    reason: 'the reactive dock-rank model + the StudioDock shell + the eight dock consumers (component vocabulary tasks 11/17, spec §0.1 z-band + §2.1 thin shell): the dockOrder suite loads the module through the VM harness and proves the pure band math (consecutive renormalization on every raise, monotone recency, non-top unregister, publish) plus the z-token ladder against the real sheets at run time, and pins task 17\'s mechanical census against the tree (zero minWidth/minHeight literals at the surfaces, the ONE Rnd in the shell, the pose rig\'s distinct resizePolicy). HONEST LIMIT: the React binding — useDockRank subscribing every dock, the shell\'s registration/raise/close/resize chrome, the rendered calc(var(--z-dock-base) + rank) z — only executes in a browser, so these diffs force the e2e leg (e2e/canvas.spec.ts drives the 50-raise band, modal-over-docks, consent-over-modal, and the task-17 shell tests — raise/resize-per-policy/close-with-band-compression — at the real docks). Task 19: PropertiesPanel\'s model-override rows are EffectiveSettingRow consumers whose stay-retired pins live in the effective-row-classes suite, so its diffs run that suite too (the same spec owns the row\'s e2e leg). Task 20: PropertiesPanel\'s Generate row and SettingsDock\'s save footer are SaveStatus consumers whose migration pins live in the save-status-classes suite, so their diffs run that suite too (the same specs own the tier\'s e2e legs).',
  },
  {
    match: ['src/ui/layerRegistry.ts', 'src/ui/StudioDialogLayered.tsx', 'src/components/PromptLibraryBrowser.tsx', 'src/images/WorkbenchApp.tsx', 'src/datasets/CropEditor.tsx', 'src/datasets/CaptionPanel.tsx', 'src/ui/useOverlayBehavior.ts', 'src/ui/overlayBehavior.ts', 'src/canvas/IndexOverlay.tsx', 'src/canvas/LibraryOverlay.tsx', 'src/canvas/TimelineOverlay.tsx', 'src/canvas/CanvasApp.tsx', 'src/ui/ConfirmDialog.tsx', 'src/ui/PromptDialog.tsx', 'src/datasets/DatasetsApp.tsx', 'src/views/SettingsView.tsx', 'src/canvas/Tile.tsx', 'src/canvas/PropertiesPanel.tsx', 'src/ui/StudioSelect.tsx', 'src/ui/PopoverMenu.tsx', 'src/canvas/ForkMenu.tsx', 'src/canvas/EndpointMenu.tsx', 'src/canvas/OpEditor.tsx', 'src/components/form.tsx', 'src/components/CameraPathEditor.tsx', 'src/components/StructuredPromptEditor.tsx', 'src/components/SmartPromptEditor.tsx'],
    suites: ['layerRegistry', 'overlay-behavior', 'field-classes', 'effective-row-classes', 'refusal-classes', 'save-status-classes', 'handoff-classes'],
    forceE2e: true,
    reason: 'the layer-ownership registry + every registry-participating surface (component vocabulary tasks 10/14/15, spec §0.2): the layerRegistry suite loads the module through the VM harness and proves the pure mechanics (push order, identity-keyed NON-TOP removal, topmost-only routing, the ONE window-capture listener, the routed-Escape suppression contract, the anyModalLayer suspension derivation) against a fake window; the overlay-behavior suite loads the task-14 hook\'s pure key model (chrome chords, the typing guard, panel containment, the Tab-cycle wrap). HONEST LIMIT: the real bindings — StudioDialogLayered registering on open, Base UI suppression against the live Dialog, the overlay hook\'s ref-attach registration/focusOnOpen/local keys, CanvasApp\'s background-chain suspension — only execute in a browser, so these diffs force the e2e leg (e2e/app.spec.ts drives PromptLibraryBrowser + a registry-API stand-in overlay; task 12 made the workbench\'s three IwDialog sites StudioDialogLayered consumers, so e2e/images.spec.ts owns their leg; task 13 made the datasets overlays consumers too — the Caption→VLM pair is the app\'s genuine two-dialog stack — so e2e/datasets.spec.ts owns theirs, C1\'s uniform busy guard included; task 14 made the canvas command surfaces (index/library/timeline + their nested confirm/gap menu) hook consumers and suspended CanvasApp\'s background chain on anyModalLayer, so e2e/canvas.spec.ts owns their leg — the interim-hazard retirement included — with e2e/app.spec.ts\'s one-action-per-press riding along; task 15 added the shared ConfirmDialog/PromptDialog and their eleven migrated consumer surfaces (the datasets asks incl. the batch-instruction site whose cancel must send NO POST, the settings reset consent, the canvas tile send + control-track delete), so e2e/datasets.spec.ts, e2e/settings.spec.ts, and e2e/canvas.spec.ts own their legs — the §0.6 cancel-aborts pin, the danger-recipe + dismissal-ownership pins, and the reset-consent pin included); task 16 added StudioSelect (the styled native select — the manifest §9 census migrated across every listed surface) and PopoverMenu (the ONE dismissal idiom for anchored menus: registry Escape + Base UI outside-press + the local arrow walk over the pure arrowRowTarget model in overlayBehavior), so e2e/settings.spec.ts owns the select pin (chevron/overflow/focus-visible/eager capture) and e2e/canvas.spec.ts owns the popover pins (topmost-only Escape, outside-press, the fork menu gaining its first-ever Escape, the gap-menu stale-flag cleanup). Task 18 review: CaptionPanel carries Field consumers whose stay-retired pins live in the field-classes suite, so its diffs run that suite too. Task 19: SettingsView\'s global model-override rows are EffectiveSettingRow consumers whose stay-retired pins live in the effective-row-classes suite, so its diffs run that suite too. Task 20: WorkbenchApp\'s session writes and CaptionPanel\'s save foot are SaveStatus consumers whose migration pins live in the save-status-classes suite, so their diffs run that suite too (e2e/images.spec.ts + e2e/datasets.spec.ts own their e2e legs). Task 21: WorkbenchApp\'s Generate gate is a Refusal consumer whose migration pins live in the refusal-classes suite (the retired title-carried refusal, the kept disabled gate, the note block retained), so its diffs run that suite too (e2e/images.spec.ts owns the gate\'s e2e leg). Task 22: WorkbenchApp\'s start-frame exit is a HandoffResult consumer whose migration pins live in the handoff-classes suite (the retired A05 step notice, the retained-identifier write core, the boolean reloadActiveDocument seam), so its diffs run that suite too (e2e/images.spec.ts owns the exit\'s e2e legs: the request-counted retry and the done+stale render).',
  },
  {
    match: ['src/ui/Field.tsx', 'src/ui/fieldClasses.ts'],
    suites: ['field-classes'],
    forceE2e: true,
    reason: 'the form-field association tier\'s pure precedence/id/merge math + dev-warn contract (component vocabulary task 18, spec §2.1 error > hint > silent): the field-classes suite loads fieldClasses.ts through the VM harness and walks the .field-description recipe block in src/styles.css (recipe lockstep both directions, tone/type-only properties per P06, :root-defined tokens) plus the migration pins (the caption validation dialect\'s tone retired to the recipe, geometry retained in datasets.css). HONEST LIMIT: the wiring itself — cloneElement landing id/aria-describedby on the real control, the label association, the error↔hint↔silent toggling — only executes in a browser, so these diffs force the e2e leg (e2e/datasets.spec.ts owns both pins at the caption surface: the trigger\'s association moves and the VLM instruction\'s error-wins-over-standing-hint precedence).',
  },
  {
    match: ['src/ui/EffectiveSettingRow.tsx', 'src/ui/effectiveRowClasses.ts'],
    suites: ['effective-row-classes'],
    forceE2e: true,
    reason: 'the effective-setting row\'s pure origin/attempt display math + reset-ownership dev-warn (component vocabulary task 19, spec §0.4 / P08 origin ≠ outcome): the effective-row-classes suite loads effectiveRowClasses.ts through the VM harness, walks the .effective-setting* recipe block in src/styles.css (recipe lockstep both directions, flow/tone properties per P06 with the chip geometry on the row\'s OWN composed token — never a .chip-mentioning selector, :root-defined tokens), pins the resolver-side mapping (modelOverrides.ts\'s effectiveSlotSetting: value/origin/attempt derivation incl. the failed-pick-reveals-the-layer-beneath case and the never-fabricated level), and the migration pins (the retired level-attribution ternaries in PropertiesPanel/SettingsView, each surface\'s reset scoped to the level it owns). HONEST LIMIT: the rendered chips and the reset-reveals-global-without-deleting-it contract only execute in a browser, so these diffs force the e2e leg (e2e/canvas.spec.ts owns the Review-Focus-3 pin at the real chain-properties consumer incl. the settings-API assert; e2e/settings.spec.ts rides the Settings surface whose rows are the family\'s other consumer).',
  },
  {
    match: ['src/ui/SaveStatus.tsx', 'src/ui/saveStatusClasses.ts'],
    suites: ['save-status-classes'],
    forceE2e: true,
    reason: 'the save-state tier\'s pure state→class/aria/copy math + misuse dev-warns (component vocabulary task 20, spec §2.2 the semantic five — idle silent / saving busy / saved muted / failed danger+reason+retry): the save-status-classes suite loads saveStatusClasses.ts through the VM harness, walks the .save-status recipe block in src/styles.css (recipe lockstep both directions, tone/type/flow properties per P06 with the retry button\'s inheritance resets — the notice-banner × precedent, :root-defined tokens, no new keyframes), and pins the four migrations (the inspector\'s retired saveState ternary markup + the canvas-prefixed hook, the workbench\'s retired session-save notices, the caption\'s retired ds-status savedAt row, the settings dock\'s outcome states with the dirty line retained). HONEST LIMIT: the rendered states, the live-region announcements, and the retry wiring only execute in a browser, so these diffs force the e2e leg (e2e/canvas.spec.ts owns the inspector four-states/verbatim-reason/retry-loop pin incl. the A02 floor and the settings-dock failed→retry pin; e2e/images.spec.ts owns the workbench session-writes pin; e2e/datasets.spec.ts owns the caption pin).',
  },
  {
    match: ['src/ui/Refusal.tsx', 'src/ui/refusalClasses.ts'],
    suites: ['refusal-classes'],
    forceE2e: true,
    reason: 'the honest-no component\'s pure class/aria/warn math (component vocabulary task 21, spec §2.2 the semantic five — the precondition gate: title + reason + the satisfy escape hatch): the refusal-classes suite loads refusalClasses.ts through the VM harness and walks the .refusal recipe block in src/styles.css (recipe lockstep both directions, tone/type/flow properties per P06 with the satisfy button\'s inheritance resets — the save-status-retry precedent, the warning-NOT-danger tone pin — a refusal is a state, not a failure, :root-defined tokens) plus the migration pins at the image-lane gate (the retired Generate title-carried refusal, the kept disabled gate, the R-19 library satisfy, the retained .iw-unavailable-note block). HONEST LIMIT: the rendered announcement, the satisfy click, and the gate\'s reactivity to the lane\'s own satisfaction path only execute in a browser, so these diffs force the e2e leg (e2e/images.spec.ts owns the manifest §11 refusal pin: reason + satisfaction path at the image-lane gate).',
  },
  {
    match: ['src/ui/HandoffResult.tsx', 'src/ui/handoffClasses.ts'],
    suites: ['handoff-classes'],
    forceE2e: true,
    reason: 'the write ≠ refresh tier\'s pure step→class/aria/copy/warn math (component vocabulary task 22, spec §0.5/C2 the semantic five — write and refresh are INDEPENDENT per-step facts; a failed refresh after a successful write renders done-with-stale-marker, never failed; retry re-runs only the named step\'s failed fact): the handoff-classes suite loads handoffClasses.ts through the VM harness, walks the .handoff-* recipe block in src/styles.css (recipe lockstep both directions, tone/type/flow properties per P06 with the retry button\'s inheritance resets — the save-status-retry precedent, the danger-tone-belongs-to-the-failed-WRITE pin and the warning-tone marker pin, :root-defined tokens, no new keyframes), and pins the migration (the retired A05 step notice at the workbench exit, the retained-identifier write core, the store\'s boolean reloadActiveDocument seam). HONEST LIMIT: the rendered rows, the live-region announcements, the request-counted retry (the pin endpoint hit exactly once), and the done+stale render only execute in a browser, so these diffs force the e2e leg (e2e/images.spec.ts owns both manifest §11 pins at the real workbench-exit caller).',
  },
  {
    match: ['src/gallery/matrices.ts'],
    suites: ['gallery-matrices'],
    forceE2e: true,
    reason: 'the gallery\'s state-matrix DATA (component vocabulary task 23, Flux k2q0n9s): the kit\'s matrices as data with the JUSTIFIED N/A cells as first-class entries — the gallery-matrices suite loads matrices.ts through the VM harness and proves the cross-product completeness (no silently skipped cell), the non-empty N/A reasons, the closed-matrix lockstep against the kit\'s own class modules (buttonClasses/chipClasses/progressClasses/noticeClasses/saveStatusClasses/handoffClasses), the named component inventory, the T15 initial + T22 consumer-note homes, and the source pins (renderer arms, the registry append, the vision-scenario registration). HONEST LIMIT: the rendered cells, the real hover()/focus drivers, and the interactive demos only execute in a browser, so these diffs force the e2e leg (e2e/gallery.spec.ts owns the per-cell computed-style + DOM pins at ?gallery=1).',
  },
  {
    match: [
      'src/lib/imageCrop.ts', 'src/lib/promptPresets.ts', 'src/lib/modelOverrides.ts',
      'src/lib/manifest.ts', 'src/lib/music3Workflow.ts',
      'src/lib/jobReducer.ts', 'src/lib/logSanitize.ts', 'src/lib/libraryStorage.ts', 'src/lib/promptContracts.ts',
      'src/lib/promptComposer.ts', 'src/lib/promptPolicies.ts', 'src/lib/dialogPolicy.ts', 'src/lib/promptCorpus.ts',
      'src/lib/promptLibraryStorage.ts', 'src/lib/contactSheet.ts', 'src/lib/failureTaxonomy.ts',
      'src/lib/diagnosticReport.ts', 'src/lib/promptWatch.ts',
    ],
    suites: ['workflows', 'effective-row-classes'],
    reason: 'the workflows suite\'s module list (loaded through the VM harness); the effective-row-classes suite loads modelOverrides.ts the same way for the P08 resolver mapping (effectiveSlotSetting — task 19), so its diffs run that suite too.',
  },
  { match: ['src/lib/aspectResolutions.ts'], suites: ['canvas', 'workflows'], reason: 'AR-first resolution derivation — loaded by the canvas suite (generation sanitize + panel) and the workflows suite (the imageCrop reference-prep ruling block).' },
  {
    match: [
      'src/lib/accessoryLibrary.ts', 'src/lib/apiClient.ts', 'src/lib/characterLibrary.ts', 'src/lib/comfyInfo.ts',
      'src/lib/createId.ts', 'src/lib/doctor.ts', 'src/lib/format.ts', 'src/lib/h3Diagnostics.ts',
      'src/lib/hairLibrary.ts', 'src/lib/jobRecords.ts', 'src/lib/loafObserver.ts', 'src/lib/locationLibrary.ts',
      'src/lib/mediaUrls.ts', 'src/lib/useLivePreview.ts', 'src/lib/useLlmStream.ts', 'src/lib/useRealtime.ts',
      'src/lib/wardrobeLibrary.ts',
    ],
    suites: [],
    reason: 'UNTESTED CLIENT LIBS (explicit, reviewed 2026-09-20 walk): consumed only by UI code — typecheck + scoped lint on PRs, e2e/vision on the main gate. A NEW src/lib file must NOT silently land here: it hits the loud full-run rule below until mapped or added to this list by review.',
  },
  {
    match: ['src/lib/**'],
    suites: ALL_SUITES,
    reason: 'LOUD CATCH-ALL — an unmapped src/lib module is suspicious (this is the tested tree): full run until it gets a precise rule. Deliberately not silent.',
  },

  // ---------- UI surface (deliberately no unit coverage) ----------------
  {
    match: ['src/canvas/**', 'src/components/**', 'src/gallery/**', 'src/hooks/**', 'src/images/**', 'src/media/**', 'src/prototypes/**', 'src/state/**', 'src/surfaces/**', 'src/ui/**', 'src/views/**', 'src/datasets/**', 'src/*.tsx', 'src/*.ts', 'src/*.css', 'src/**/*.css', 'index.html', 'public/**'],
    suites: [],
    reason: 'UI surface — no unit suite executes components/views/state (deliberate: typecheck + scoped lint on PRs, e2e + vision on the main gate, local depth via pnpm gate).',
  },

  // ---------- docs / meta ------------------------------------------------
  {
    match: ['docs/**', '*.md', 'LICENSE', 'Readmescreenshots/**', '.flux/**', '.claude/**'],
    suites: [],
    reason: 'docs/meta only — nothing to run (the pre-A-CI gate ran 8 minutes on these diffs; that is dead).',
  },
]

/** License-audit inputs, evaluated independently of the rules (the audit is
 *  cheap but its inputs are exactly these — deps, vendored packs, the
 *  node-pack registry, the recorded decisions). */
const LICENSE_INPUTS = ['package.json', 'pnpm-lock.yaml', 'vendor/**', 'server/engineNodes.ts', 'src/lib/nodePackRegistry.ts', 'docs/LICENSES.md', 'scripts/audit-licenses.cjs']

/** Extensions eslint lints (flat config lints js/ts across the repo). */
const ESLINT_EXT = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx'])
const STYLELINT_EXT = new Set(['.css'])

// ---------------------------------------------------------------- helper

/** Minimal glob → RegExp: '**' segment = anything (with /), '*' inside a
 *  segment = no /, everything else literal. Covers every shape this
 *  manifest uses; no deps on purpose. */
function globToRegExp(glob) {
  const escaped = glob.split('/').map((segment) => {
    if (segment === '**') return '(?:[^/]+/)*[^/]+'
    return segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
  })
  return new RegExp(`^${escaped.join('/')}$`)
}

const COMPILED = RULES.map((rule) => ({ ...rule, regexes: rule.match.map(globToRegExp) }))
const LICENSE_REGEXES = LICENSE_INPUTS.map(globToRegExp)

function suiteFromFile(testPath) {
  const base = path.basename(testPath)
  const m = /^(.+)\.test\.js$/.exec(base)
  return m ? m[1] : null
}

// --------------------------------------------------------------- resolve

/**
 * resolve(changedPaths) → the fast-leg plan. Pure data in, plan out:
 *   suites         sorted vitest filter args (empty = nothing to run)
 *   fullRun        true when a rule (or the fallback) selected everything
 *   buildTier      null | 'server' | 'full' — max of selected suites' needs
 *   runE2e         Playwright e2e on the PR leg (forced files or fullRun)
 *   lintFiles      changed files eslint should lint (existing files only)
 *   stylelintFiles changed css files
 *   lintAll        run the FULL lint (config-file changes)
 *   licenseAudit   any license-audit input changed
 *   python/ffmpeg  selected suites need python3+numpy / ffmpeg
 *   windowsSuites  resolved ∩ the Windows leg's set (all of it on fullRun
 *                  or when the Windows workflow itself changed)
 *   windowsPython  the Windows leg needs python+numpy (from ITS suites)
 *   matched        [{ file, suites, reason }] per changed file (audit trail)
 *   unmatched      files that hit the global fallback (loud in CI logs)
 */
function resolve(changed) {
  const suites = new Set()
  const matched = []
  const unmatched = []
  let fullRun = false
  let runE2e = false
  let forceWindows = false
  let lintAll = false
  const lintFiles = []
  const stylelintFiles = []

  for (const file of changed) {
    const clean = String(file).replace(/\\/g, '/').trim()
    if (!clean) continue
    let hit = null
    let ruleSuites = null
    for (const rule of COMPILED) {
      if (rule.regexes.some((re) => re.test(clean))) {
        hit = rule
        ruleSuites = rule.suiteFromFile ? [suiteFromFile(clean)] : rule.suites
        break
      }
    }
    if (!hit) {
      unmatched.push(clean)
      fullRun = true
      matched.push({ file: clean, suites: ALL_SUITES, reason: 'NO RULE MATCHED — global fallback: full run. Map the file in scripts/ci-map.cjs.' })
      continue
    }
    if (hit.suiteFromFile && !SUITES[ruleSuites[0]]) {
      // tests/<name>.test.js whose name is not a catalogued suite — the
      // self-test forbids this state; resolve defensively to full.
      fullRun = true
      matched.push({ file: clean, suites: ALL_SUITES, reason: `test file "${clean}" is not in the ci-map catalog — catalog it in scripts/ci-map.cjs SUITES (tests/ci-map.test.js enforces this).` })
      continue
    }
    matched.push({ file: clean, suites: ruleSuites, reason: hit.reason })
    if (hit.forceE2e) runE2e = true
    if (hit.forceWindows) forceWindows = true
    if (hit.lintAll) lintAll = true
    if (ruleSuites === ALL_SUITES || (ruleSuites.length === ALL_SUITES.length && ruleSuites.every((s) => ALL_SUITES.includes(s)))) fullRun = true
    for (const s of ruleSuites) suites.add(s)
  }

  if (fullRun) for (const s of ALL_SUITES) suites.add(s)
  if (fullRun) runE2e = true

  const selected = [...suites].filter((s) => SUITES[s]).sort()
  const buildTier = selected.reduce((tier, s) => {
    const need = SUITES[s].build
    if (need === 'full') return 'full'
    if (need === 'server' && tier !== 'full') return 'server'
    return tier
  }, null)
  const windowsSuites = forceWindows
    ? Object.keys(SUITES).filter((s) => SUITES[s].windows).sort()
    : selected.filter((s) => SUITES[s].windows).sort()
  // The Windows leg's OWN tool flags — derived from its suite set, not from
  // the ubuntu selection (forceWindows can escalate one without the other).
  const windowsPython = windowsSuites.some((s) => SUITES[s].python)

  for (const file of changed) {
    const clean = String(file).replace(/\\/g, '/').trim()
    if (!clean) continue
    const ext = path.posix.extname(clean)
    if (!fs.existsSync(path.join(REPO, clean))) continue // deleted files have nothing to lint
    if (ESLINT_EXT.has(ext)) lintFiles.push(clean)
    if (STYLELINT_EXT.has(ext)) stylelintFiles.push(clean)
  }

  const licenseAudit = changed.some((file) => {
    const clean = String(file).replace(/\\/g, '/').trim()
    return LICENSE_REGEXES.some((re) => re.test(clean))
  })

  return {
    suites: selected,
    fullRun,
    buildTier,
    runE2e,
    lintFiles,
    stylelintFiles,
    lintAll,
    licenseAudit,
    python: selected.some((s) => SUITES[s].python),
    // The forced e2e battery includes the ffmpeg-dependent specs (datasets,
    // filmstrip, the canvas gap-menu splice) — a plan that forces e2e needs
    // ffmpeg installed even when NO mapped unit suite flags it (PR #40's
    // lesson: e2e forced by an e2e/** diff reds on spawn-ffmpeg-ENOENT
    // otherwise). Same coupling as the full run below it.
    ffmpeg: selected.some((s) => SUITES[s].ffmpeg) || runE2e,
    windowsSuites,
    windowsPython,
    matched,
    unmatched,
  }
}

// ------------------------------------------------------------------ CLI

function printHuman(plan) {
  console.log(`CI-MAP — ${plan.matched.length} changed file(s)`)
  for (const m of plan.matched) {
    console.log(`  ${m.file}`)
    console.log(`      → ${m.suites.length ? m.suites.join(' ') : '(no unit suites)'}${m.reason ? ` — ${m.reason}` : ''}`)
  }
  if (plan.unmatched.length) console.log(`  UNMATCHED (full-run fallback): ${plan.unmatched.join(', ')}`)
  console.log('')
  console.log(`  suites:        ${plan.suites.length ? plan.suites.join(' ') : '(none)'}`)
  console.log(`  build:         ${plan.buildTier ?? 'none'}`)
  console.log(`  e2e on PR leg: ${plan.runE2e}`)
  console.log(`  lint:          ${plan.lintAll ? 'FULL' : plan.lintFiles.length ? plan.lintFiles.join(' ') : '(no lintable changes)'}`)
  console.log(`  stylelint:     ${plan.stylelintFiles.length ? plan.stylelintFiles.join(' ') : '(none)'}`)
  console.log(`  license:audit: ${plan.licenseAudit}`)
  console.log(`  python/numpy:  ${plan.python}   ffmpeg: ${plan.ffmpeg}`)
  console.log(`  windows leg:   ${plan.windowsSuites.length ? plan.windowsSuites.join(' ') : '(skipped — no OS-sensitive surface touched)'}`)
}

/** --gha: emit the plan as GitHub Actions outputs (multi-line safe). */
function writeGha(plan) {
  const out = process.env.GITHUB_OUTPUT
  const pairs = [
    ['suites', plan.suites.join(' ')],
    ['suites_json', JSON.stringify(plan.suites)],
    ['full_run', String(plan.fullRun)],
    ['build_tier', plan.buildTier ?? 'none'],
    ['run_e2e', String(plan.runE2e)],
    ['lint_all', String(plan.lintAll)],
    ['lint_files', plan.lintFiles.join(' ')],
    ['stylelint_files', plan.stylelintFiles.join(' ')],
    ['license_audit', String(plan.licenseAudit)],
    ['python', String(plan.python)],
    ['ffmpeg', String(plan.ffmpeg)],
    ['windows_suites', plan.windowsSuites.join(' ')],
    ['windows_python', String(plan.windowsPython)],
    ['unmatched', plan.unmatched.join(' ')],
  ]
  const body = pairs.map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
  if (out) fs.appendFileSync(out, body)
  else process.stdout.write(body)
}

function main() {
  const argv = process.argv.slice(2)
  const gha = argv.includes('--gha')
  const json = argv.includes('--json')
  const files = argv.filter((a) => !a.startsWith('--'))
  let changed = files
  if (files.length === 0 && !process.stdin.isTTY) {
    changed = fs.readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean)
  }
  if (changed.length === 0) {
    console.error('usage: node scripts/ci-map.cjs [--gha|--json] [file ...]  (or file list on stdin)')
    process.exit(2)
  }
  const plan = resolve(changed)
  if (json) console.log(JSON.stringify(plan, null, 2))
  else if (gha) writeGha(plan)
  else printHuman(plan)
}

if (require.main === module) main()

module.exports = { SUITES, RULES, LICENSE_INPUTS, ALL_SUITES, BOOTING, PORT_USERS, SHEET_USERS, VM_SUITES, resolve, globToRegExp, suiteFromFile }
