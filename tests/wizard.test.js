// The walk's destination designations (wizard rework task 3p14abm — spec
// §2.2/§2.3, audit W-C1, ruling D7): the two engine-side destinations the
// walk's one-click actions require — the models root and the external
// custom-nodes folder — each existence-verified before acceptance, each
// prefillable ONLY from an honest source. The W-C1 anti-regression is the
// spine of the suite: the shipped studio-home default never prefills as
// engine-visible (fetched weights would land where an external engine never
// reads), and a nonexistent path never verifies.
//
// Pure-module suite: src/canvas/wizardWalk.ts through the VM harness, the
// existence oracle stubbed at window.monoka.checkPath (the same /api/lan/fs/check
// route the Settings surface stats through).
import { test } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const assert = require('node:assert/strict')

const { loadTs } = require('../scripts/lib/ts-vm.cjs')

let passed = 0
function ok(condition, label) {
  assert.ok(condition, label)
  passed += 1
  console.log(`  ok - ${label}`)
}

// The stubbed oracle lives OUTSIDE the module and is reassigned per section —
// loadTs caches by path (one context per file), so the module reads
// window.monoka.checkPath at call time and the stub mutates under it.
const oracle = { calls: 0, checkPath: async () => ({ exists: false }) }
const walk = loadTs('src/canvas/wizardWalk.ts', { window: { monoka: oracle } })
// Task 5 (the Models step): the row derivations + the one-verdict narrator —
// the stack report and the selection ladders load through the same harness
// (the chain is VM-proven in tests/workflows.test.js).
const h3 = loadTs('src/lib/h3Stack.ts', { window: { monoka: oracle } })
const selection = loadTs('src/lib/modelSelection.ts', { window: { monoka: oracle } })
const wizardModels = loadTs('src/canvas/wizardModels.ts', { window: { monoka: oracle } })

function stubCheckPath(answer) {
  oracle.calls = 0
  oracle.checkPath = async () => { oracle.calls += 1; return answer }
}

test('a designation verifies existence before acceptance', async () => {
  console.log('wizard: the verification gate')

  // The empty designation: nothing to stat — refused before the oracle.
  stubCheckPath({ exists: true, directory: true })
  const empty = await walk.verifyDesignation('   ')
  ok(empty.designated === false, 'an empty designation is refused (nothing designated)')
  ok(typeof empty.reason === 'string' && empty.reason.length > 0, `the empty refusal names its reason (got ${JSON.stringify(empty.reason)})`)
  ok(oracle.calls === 0, 'the empty refusal never asks the existence oracle')

  // The relative path: refused as not-absolute before the oracle — the same
  // absolute-only limit the Settings surface's path check holds.
  stubCheckPath({ exists: true, directory: true })
  const relative = await walk.verifyDesignation('models/diffusion_models')
  ok(relative.designated === false, 'a relative path is refused')
  ok(/absolute/i.test(relative.reason ?? ''), `the refusal says the path must be absolute (got ${JSON.stringify(relative.reason)})`)
  ok(oracle.calls === 0, 'the not-absolute refusal never asks the existence oracle')

  // The nonexistent path: the honest refusal — never a silent maybe.
  stubCheckPath({ exists: false })
  const missing = await walk.verifyDesignation('/engine/comfy/models')
  ok(missing.designated === false, 'a nonexistent path is refused')
  ok(missing.exists === false, 'the refusal records exists: false')
  ok(typeof missing.reason === 'string' && missing.reason.length > 0, `the refusal names its reason (got ${JSON.stringify(missing.reason)})`)
  ok(oracle.calls === 1, 'the existence oracle was asked exactly once')

  // The oracle's own failure: the error rides the refusal, never a throw
  // into the walk.
  stubCheckPath({ exists: false, error: 'permission denied' })
  const errored = await walk.verifyDesignation('/engine/comfy/models')
  ok(errored.designated === false, 'an oracle error refuses designation')
  ok(/permission denied/.test(errored.reason ?? ''), `the oracle's error is the reason (got ${JSON.stringify(errored.reason)})`)

  // A file where a directory belongs: exists, but not a usable destination.
  stubCheckPath({ exists: true, directory: false })
  const file = await walk.verifyDesignation('/engine/comfy/models')
  ok(file.designated === false, 'a file at the path is refused')
  ok(file.exists === true, 'the file verdict records exists: true (it is there — it is just not a directory)')

  // The acceptance: exists + directory = designated, no reason owed.
  stubCheckPath({ exists: true, directory: true })
  const good = await walk.verifyDesignation('/engine/comfy/models')
  ok(good.designated === true && good.exists === true, 'an existing directory is accepted')
  ok(good.reason === undefined, 'an accepted designation owes no reason')
  ok(oracle.calls === 1, 'the acceptance asked the oracle exactly once')
})

test('a Windows drive path verifies — the absolute-shape gate names the class both platforms accept (j63snid, review 2026-10-20)', async () => {
  console.log('wizard: the Windows drive-path gate')

  // The settings POST's shape check (node path.isAbsolute) already accepts
  // drive paths; the walk's client gate must answer the same class — a
  // C:\ designation is absolute on the engine's disk and verifies.
  stubCheckPath({ exists: true, directory: true })
  const drive = await walk.verifyDesignation('C:\\ComfyUI\\models')
  ok(drive.designated === true && drive.exists === true, `a Windows drive designation verifies (got ${JSON.stringify(drive)})`)
  ok(oracle.calls === 1, 'the drive path reached the existence oracle exactly once')

  stubCheckPath({ exists: true, directory: true })
  const driveSlash = await walk.verifyDesignation('d:/models')
  ok(driveSlash.designated === true, 'a lowercase drive path with forward slashes verifies too')

  // Genuinely relative paths stay refused — with copy true on BOTH
  // platforms (the baked "starting with /" named POSIX only).
  stubCheckPath({ exists: true, directory: true })
  const relative = await walk.verifyDesignation('models\\diffusion_models')
  ok(relative.designated === false, 'a relative Windows-style path is still refused')
  ok(/absolute/i.test(relative.reason ?? ''), 'the refusal says the path must be absolute')
  ok(/C:\\models/i.test(relative.reason ?? ''), `the refusal names the drive shape so a Windows user recognizes their case (got ${JSON.stringify(relative.reason)})`)
  ok(!/starting with \//i.test(relative.reason ?? ''), `the POSIX-only "starting with /" wording is gone (got ${JSON.stringify(relative.reason)})`)
  ok(oracle.calls === 0, 'the not-absolute refusal never asks the oracle')
})

test('the designation state walks empty → value → verified, and an edit clears a stale verdict', async () => {
  console.log('wizard: the state machine')
  const empty = walk.emptyDestination()
  ok(empty.value === '' && empty.verdict === null, 'the walk starts each destination empty and unverified')
  ok(walk.isDesignated(empty) === false, 'an unverified destination is not designated')

  // A value edit clears the old verdict: a verdict about the previous path
  // must never survive the edit (it would be a lie on the new one).
  const typed = walk.setDestinationValue(empty, '/engine/comfy/models')
  ok(typed.value === '/engine/comfy/models' && typed.verdict === null, 'typing a value clears the stale verdict')

  stubCheckPath({ exists: true, directory: true })
  const verified = await walk.verifyDestination(typed)
  ok(walk.isDesignated(verified) === true, 'verifyDestination flips the state to designated')
  // The honest refusal on a nonexistent path, through the state seam too.
  stubCheckPath({ exists: false })
  const refusedState = await walk.verifyDestination(walk.setDestinationValue(verified, '/gone/models'))
  ok(walk.isDesignated(refusedState) === false && typeof refusedState.verdict?.reason === 'string', 'a nonexistent path leaves the state refused with its reason')
})

test('the models-root prefill prefers the managed checkout in managed mode and prefills EMPTY on the shipped default in external mode', () => {
  console.log('wizard: the models-root prefill (W-C1)')
  // Managed mode: fetches land where the managed engine reads — the
  // checkout's own models dir.
  const managed = { modelRoot: '/studio/home/ComfyUI/models', engine: { mode: 'managed', checkoutPath: '/opt/ComfyUI', externalCustomNodesDir: '' } }
  ok(walk.modelsRootPrefill(managed, true) === '/opt/ComfyUI/models', 'managed mode prefills <checkoutPath>/models')

  // Managed without a discoverable checkout: honest empty, never '/models'.
  const managedBlind = { modelRoot: '/studio/home/ComfyUI/models', engine: { mode: 'managed', checkoutPath: '', externalCustomNodesDir: '' } }
  ok(walk.modelsRootPrefill(managedBlind, true) === '', 'managed mode without a checkout prefills EMPTY (nothing discoverable)')

  // THE W-C1 ANTI-REGRESSION: external mode + the shipped studio-home
  // default → EMPTY. The default points where an external engine never
  // reads; offering it as engine-visible is the dead end the audit named.
  const freshExternal = { modelRoot: '/studio/home/ComfyUI/models', engine: { mode: 'external', checkoutPath: '', externalCustomNodesDir: '' } }
  ok(walk.modelsRootPrefill(freshExternal, true) === '', 'external mode prefills EMPTY when the setting is the shipped default (modelRootIsDefault: true)')

  // A user-set path survives even when the engine is external and the flag
  // is somehow stale-true — no, the flag is the whole truth: EMPTY. (The
  // flag is the server's word; the client never guesses.)
  ok(walk.modelsRootPrefill(freshExternal, false) === '/studio/home/ComfyUI/models', 'external mode prefills the current modelRoot once it is user-set (flag false)')
})

test('an existing user-set modelRoot prefills itself (re-running --setup never blanks a working designation)', () => {
  console.log('wizard: the re-setup prefill')
  const working = { modelRoot: '/data/comfy/models', engine: { mode: 'external', checkoutPath: '', externalCustomNodesDir: '' } }
  ok(walk.modelsRootPrefill(working, false) === '/data/comfy/models', 'a user-set modelRoot prefills itself')
  // The managed arm keeps its own answer even over a user-set root — mode
  // decides the destination (the checkout is where the managed engine reads).
  ok(walk.modelsRootPrefill({ ...working, engine: { mode: 'managed', checkoutPath: '/opt/ComfyUI', externalCustomNodesDir: '' } }, false) === '/opt/ComfyUI/models', 'managed mode still prefills the checkout over a user-set root')
})

test('the managed-checkout prefill joins a drive checkout with its own separator (j63snid)', () => {
  console.log('wizard: the managed prefill on a Windows checkout')
  const managedWin = { modelRoot: '', engine: { mode: 'managed', checkoutPath: 'C:\\ComfyUI', externalCustomNodesDir: '' } }
  ok(walk.modelsRootPrefill(managedWin, true) === 'C:\\ComfyUI\\models', `managed mode joins the checkout with its own separator (got ${JSON.stringify(walk.modelsRootPrefill(managedWin, true))})`)
  const managedWinFwd = { modelRoot: '', engine: { mode: 'managed', checkoutPath: 'C:/ComfyUI', externalCustomNodesDir: '' } }
  ok(walk.modelsRootPrefill(managedWinFwd, true) === 'C:/ComfyUI/models', 'a forward-slashed drive checkout joins with /')
})

test('the custom-nodes prefill offers the configured folder or nothing (resolveNodePackTarget answers none without it)', () => {
  console.log('wizard: the custom-nodes prefill')
  ok(walk.customNodesPrefill({ modelRoot: '/m', engine: { mode: 'external', checkoutPath: '', externalCustomNodesDir: '/engine/comfy/custom_nodes' } }) === '/engine/comfy/custom_nodes', 'a configured external custom-nodes folder prefills itself')
  ok(walk.customNodesPrefill({ modelRoot: '/m', engine: { mode: 'external', checkoutPath: '', externalCustomNodesDir: '' } }) === '', 'an unconfigured folder prefills EMPTY — the install rows refuse honestly until it is designated')
  ok(walk.customNodesPrefill({ modelRoot: '/m', engine: { mode: 'external', checkoutPath: '', externalCustomNodesDir: '   ' } }) === '', 'a whitespace-only folder prefills EMPTY (never a padded path)')
})

test('typing in the address field never writes configuration — the candidate update is pure', () => {
  console.log('wizard: the candidate spine (the per-keystroke saves die here, spec §3)')

  // The walk starts from the settings prefill (W-I5: the field is born
  // agreeing with its placeholder) with NOTHING verified.
  const fresh = walk.emptyWalkCandidate('http://127.0.0.1:8188')
  ok(fresh.comfyUrl === 'http://127.0.0.1:8188', 'the candidate starts from the settings prefill')
  ok(fresh.verifiedUrl === null, 'a fresh candidate is unverified (nothing has answered yet)')

  // THE ANTI-REGRESSION: a URL edit is a pure candidate-state change. The
  // old wizard rode setSettings on every keystroke — a pure STORE write
  // (no network), but one that re-armed EngineHost's probe loop against
  // each half-typed url; the walk holds the candidate in memory instead,
  // and this module deliberately offers no settings-writing seam at all
  // (the kill is structural: no setSettings subscription exists; the e2e
  // journey window pins the NETWORK half: zero settings POSTs and zero
  // engine probes aimed at the typed host across the keystrokes).
  stubCheckPath({ exists: true, directory: true })
  const typed = walk.setCandidateUrl(fresh, 'http://127.0.0.1:8190')
  ok(typed !== fresh, 'the edit returns a NEW candidate (never mutates the walk state)')
  ok(typed.comfyUrl === 'http://127.0.0.1:8190', 'the candidate carries the typed URL verbatim')
  ok(fresh.comfyUrl === 'http://127.0.0.1:8188', 'the previous candidate is untouched (no shared-state write)')
  ok(typed.modelsRoot === fresh.modelsRoot && typed.customNodesDir === fresh.customNodesDir, 'the designation slots ride unchanged (a URL edit is not a designation edit)')
  ok(typed.verifiedUrl === null, 'the edit carries no verification (nothing answered for the new URL)')
  ok(oracle.calls === 0, 'a URL edit consults no verification oracle (pure state update — nothing else it could touch)')

  // Referential stability on a no-op edit: no spurious state churn.
  ok(walk.setCandidateUrl(typed, 'http://127.0.0.1:8190') === typed, 'a no-op edit returns the same candidate')
})

test('shouldPresent ignores done/skipped while the server requests setup', () => {
  console.log('wizard: the present gate (--setup overrides the local latch, spec §4 — feeds task 9)')

  ok(walk.shouldPresent({ latchDone: false, latchSkipped: false, serverSetupRequested: false }) === true, 'a fresh latch presents')
  ok(walk.shouldPresent({ latchDone: true, latchSkipped: false, serverSetupRequested: false }) === false, 'done keeps it closed')
  ok(walk.shouldPresent({ latchDone: false, latchSkipped: true, serverSetupRequested: false }) === false, 'skipped keeps it closed (never a nag)')

  // THE --setup OVERRIDE: the reset is server-owned — it must work from any
  // terminal, any browser, any profile, so the flag overrides the LOCAL
  // latch (a shell flag cannot reach into localStorage).
  ok(walk.shouldPresent({ latchDone: true, latchSkipped: false, serverSetupRequested: true }) === true, 'the server setup request re-opens over a done latch')
  ok(walk.shouldPresent({ latchDone: false, latchSkipped: true, serverSetupRequested: true }) === true, 'the server setup request re-opens over a skip latch')
})

test('owesSetupAck: the ack fires on EVERY terminal walk state while the server requests setup (task 9, spec §4)', () => {
  console.log('wizard: the setup-ack debt')
  // The flag is the server's in-memory request; the ack is the app saying
  // "the reopened walk reached a terminal state — the request is satisfied."
  // Both terminals count (done AND skip — once the user acted, the request
  // is honored; `--setup` re-arms), and NOTHING owes while the flag is down.
  ok(walk.owesSetupAck({ done: true, skipped: false, serverSetupRequested: true }) === true, 'a done walk owes the ack while the flag stands')
  ok(walk.owesSetupAck({ done: false, skipped: true, serverSetupRequested: true }) === true, 'a skipped walk owes the ack too (the ack-on-skip arm)')
  ok(walk.owesSetupAck({ done: false, skipped: false, serverSetupRequested: true }) === false, 'an open walk owes NOTHING — only a terminal action consumes the request (a background tab that merely shows the walk must not eat it)')
  ok(walk.owesSetupAck({ done: false, skipped: false, serverSetupRequested: false }) === false, 'no flag, no debt')
  ok(walk.owesSetupAck({ done: true, skipped: false, serverSetupRequested: false }) === false, 'a done walk without the request acks nothing (the zero-terminal paths stay silent)')
  ok(walk.owesSetupAck({ done: false, skipped: true, serverSetupRequested: false }) === false, 'a skipped walk without the request acks nothing')
})

test('a gate with no verified engine answers unverified, never a verdict (§2.1)', () => {
  console.log('wizard: the honest gates')

  const fresh = walk.emptyWalkCandidate('http://127.0.0.1:8188')

  // The Engine step's own gate: an untested candidate is unverified — the
  // honest refusal, never a verdict.
  const engine = walk.engineGate(fresh)
  ok(engine.verdict === 'unverified-engine', `an untested candidate is unverified (got ${engine.verdict})`)
  ok(/nothing to check against/i.test(engine.reason ?? ''), `the refusal carries the §2.1 copy (got ${JSON.stringify(engine.reason)})`)

  // An empty address: refused with a reason — still never verified.
  const blank = walk.engineGate(walk.emptyWalkCandidate('   '))
  ok(blank.verdict === 'refused' && typeof blank.reason === 'string' && blank.reason.length > 0, 'an empty address refuses with a reason (nothing designated)')

  // THE §2.1 HONESTY over the later steps: a walk that continued without a
  // verified engine gets the honest "unverified engine — nothing to check
  // against" from EVERY engine-dependent gate — never an invented stack,
  // pack, or prompt verdict.
  const gates = [
    ['models', walk.modelsGate(fresh)],
    ['packs', walk.packsGate(fresh)],
    ['prompt', walk.promptGate(fresh)],
  ]
  for (let i = 0; i < gates.length; i += 1) {
    const name = gates[i][0]
    const gate = gates[i][1]
    ok(gate.verdict === 'unverified-engine', `the ${name} gate with no verified engine answers unverified (got ${gate.verdict})`)
    ok(/nothing to check against/i.test(gate.reason ?? ''), `the ${name} gate's refusal carries the §2.1 copy`)
  }

  // Only a live Test answered REACHABLE against exactly the candidate flips
  // the gates.
  const tested = walk.markEngineVerified(fresh, 'http://127.0.0.1:8188', true)
  ok(walk.engineGate(tested).verdict === 'verified', 'a reachable answer verifies the candidate')
  ok(walk.modelsGate(tested).verdict === 'verified', 'the models gate opens on a verified engine')
  ok(walk.packsGate(tested).verdict === 'verified', 'the packs gate opens on a verified engine')

  // An unreachable answer is honest readout data but earns NO verification.
  const dead = walk.markEngineVerified(fresh, 'http://127.0.0.1:8188', false)
  ok(walk.engineGate(dead).verdict === 'unverified-engine', 'an unreachable answer leaves the gate unverified')

  // Editing away from the verified URL re-opens the gate honestly: the
  // verification belonged to THAT URL, not to the walk (earned per-URL).
  const edited = walk.setCandidateUrl(tested, 'http://127.0.0.1:8190')
  ok(walk.engineGate(edited).verdict === 'unverified-engine', 'a candidate edit re-opens the engine gate')
  ok(walk.modelsGate(edited).verdict === 'unverified-engine', 'the models gate follows the candidate, not the last verdict')
})

// ---------------------------------------------------------------------------
// TASK 5 — the Models step (spec §2.2): named per-component truth, ONE
// verdict in one voice, one-click fetch rows, the closed identity vocabulary,
// the picked/ambiguous narration. The step's VIEW BUILDER is pure
// (src/canvas/wizardModels.ts) so these pin the exact output the JSX renders.
// ---------------------------------------------------------------------------

const M = (name, kind) => ({ name, kind, bytes: 4096 })
// The stock core render classes — an engine that serves them (weights are
// the only question; the verdict's node-class arm stays green).
const STOCK_CLASSES = {
  MiniMaxH3ImageToVideo: { input: { required: {} } },
  MiniMaxH3ReferenceToVideo: { input: { required: {} } },
  KSamplerSelect: { input: { required: {} } },
  SamplerCustomAdvanced: { input: { required: {} } },
}
// The official four-file text lane — NO turbo LoRA. The R1 fixture: the old
// step's count + verdict pair read "incomplete" beside a stack the graph
// could actually run.
const LANE_FILES = [
  M('H3/ssd/minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'diffusion_models'),
  M('qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', 'text_encoders'),
  M('minimax_h3_video_vae_fp16.safetensors', 'vae'),
  M('minimax_h3_audio_vae_fp32.safetensors', 'vae'),
]
// The catalog row D9 landed (server/fetchCatalog.ts, commit c9cc631) — the
// view builder reads this SHAPE from the served catalog (FetchEntryStatus).
const CATALOG_TURBO_8 = {
  id: 'lightx2v-fl2v-turbo-8',
  name: 'lightx2v FL2V turbo 8-step LoRA',
  licenseSpdx: 'Apache-2.0',
  licenseNote: 'upstream ModelTC lightx2v; repackaged for the H3 FL2V lane',
  sizeClass: 'medium',
  destination: { kind: 'model-root', root: 'loras' },
  state: 'absent',
  inFlight: false,
}

test('every component renders named truth — counts alone never render (§2.2)', () => {
  console.log('wizard: the Models step — named truth')
  const report = h3.h3StackReport(LANE_FILES, undefined, STOCK_CLASSES)
  const rows = wizardModels.modelsStepRows(LANE_FILES, report, [], { designated: true })

  ok(rows.length === 5, `five component rows render (got ${rows.length})`)
  ok(rows.map((row) => row.label).join('|') === 'FL2VA|Text encoder|Video VAE|Audio VAE|Turbo 8', 'the rows carry the five component labels in stack order')

  // A present row names the RESOLVED file — registry subpath verbatim, the
  // exact string the graph loader accepts — with its source layer.
  const fl2va = rows[0]
  ok(fl2va.name === 'H3/ssd/minimax_h3_fl2va_pruned_int8_convrot.safetensors', `a present row names the resolved file verbatim (got ${JSON.stringify(fl2va.name)})`)
  ok(fl2va.present === true, 'the present row states presence truth')
  ok(fl2va.source === 'inferred', `the row attributes its layer (got ${JSON.stringify(fl2va.source)})`)
  ok(fl2va.isCanonical === true, 'the official artifact is named as canonical (display guidance, not a gate)')

  // A missing row states absence + ONE truthful remediation (what naming
  // makes it visible) — never a bare count.
  const turbo = rows[4]
  ok(turbo.name === '' && turbo.present === false, 'the missing row states its absence')
  ok(/turbo/i.test(turbo.makeVisible), `the missing row carries its make-visible guidance (got ${JSON.stringify(turbo.makeVisible)})`)
  ok(turbo.refusal === '', 'an absent component owes no refusal (absence is not a refusal)')
  ok(rows.every((row) => typeof row.name === 'string'), 'every row carries string truth (name or empty) — the bare-count shape is dead')
})

test('ONE verdict in one voice — a text-lane-complete stack reads Ready to render with no incomplete wording (R1)', () => {
  console.log('wizard: the one verdict')
  const report = h3.h3StackReport(LANE_FILES, undefined, STOCK_CLASSES)

  // The report's own `ready` stays turbo-8-gated — that verdict belongs to
  // the engine pill's vocabulary. The STEP verdict must NOT reuse it.
  ok(report.ready === false, 'the report ready stays turbo-8-gated (the pill vocabulary)')
  const verdict = h3.stackVerdictText(report)
  ok(verdict.ready === true, 'the step verdict derives from the SAME predicate at the text lane — ready without the turbo LoRA')
  ok(/ready to render/i.test(verdict.text), `the verdict says so plainly (got ${JSON.stringify(verdict.text)})`)

  // No "incomplete" wording anywhere in the step output for a ready stack.
  const rows = wizardModels.modelsStepRows(LANE_FILES, report, [], {})
  const stepText = verdict.text + '|' + rows.map((row) => [row.name, row.refusal, row.makeVisible, row.narration].join('|')).join('|')
  ok(!/incomplete/i.test(stepText), 'no incomplete wording anywhere in the step output (the R1 contradiction, dead at the seam)')

  // The honest inverse: a genuinely missing member is NAMED in the verdict.
  const partial = h3.h3StackReport(LANE_FILES.slice(0, 3), undefined, STOCK_CLASSES)
  const blocked = h3.stackVerdictText(partial)
  ok(blocked.ready === false && /Audio VAE/.test(blocked.text), `a missing member is named by the verdict (got ${JSON.stringify(blocked.text)})`)
})

test('a missing component with a catalog row offers a one-click fetch carrying the license verdict; without one, publisher-direct (W-I6/R-19)', () => {
  console.log('wizard: the fetch rows')
  const fresh = [] // the fresh-clone engine: nothing listed
  const report = h3.h3StackReport(fresh, undefined, STOCK_CLASSES)

  // The map lives in the walk's spine module (walk configuration, like the
  // designation rules).
  ok(walk.COMPONENT_FETCH_ROWS['Turbo 8'] === 'lightx2v-fl2v-turbo-8', 'the component→catalog map is the spine’s (Turbo 8 → lightx2v-fl2v-turbo-8)')
  ok(walk.COMPONENT_FETCH_ROWS['FL2VA'] === undefined, 'publisher-direct components map to nothing')

  // With the served catalog row: the turbo row offers THE fetch, license on
  // the row (the click IS the consent — W-I6).
  const offered = wizardModels.modelsStepRows(fresh, report, [CATALOG_TURBO_8], { designated: true })
  const turbo = offered[4]
  ok(turbo.fetch !== null, 'the mapped component carries a fetch view')
  ok(turbo.fetch.entryId === 'lightx2v-fl2v-turbo-8', `the fetch view names the catalog entry (got ${JSON.stringify(turbo.fetch && turbo.fetch.entryId)})`)
  ok(turbo.fetch.licenseSpdx === 'Apache-2.0', 'the license verdict rides the row')
  ok(/ModelTC/.test(turbo.fetch.licenseNote ?? ''), 'the provenance note rides the row')
  ok(turbo.fetch.destRoot === 'loras', 'the placement root rides the row (model-root destination)')
  ok(turbo.fetch.gated === false, 'with a verified destination the fetch is offered ungated')

  // A component with no catalog row carries NO fetch view — the remediation
  // stays publisher-direct + makeVisible (never a fetch promise, R-19/F10).
  ok(offered[0].fetch === null, 'a component with no catalog row carries no fetch view (publisher-direct)')

  // The R-19 pin survives inverted: a mapped id absent from the SERVED
  // catalog promises no fetch either.
  const bare = wizardModels.modelsStepRows(fresh, report, [], { designated: true })
  ok(bare[4].fetch === null, 'a mapped component with the entry absent from the served catalog promises no fetch')

  // D7's honest downgrade: before the models root verifies, the fetch stays
  // gated — the row says why, never fake remediation.
  const gated = wizardModels.modelsStepRows(fresh, report, [CATALOG_TURBO_8], { designated: false })
  ok(gated[4].fetch.gated === true, 'before the destination verifies the fetch stays gated')
})

test('identity labels come from the closed vocabulary; the interim word renders only when a digest is in flight (to7xpa7)', () => {
  console.log('wizard: the identity vocabulary')
  ok(wizardModels.IDENTITY_LABELS.join('|') === 'hash-confirmed|name-suspected|unknown', 'the vocabulary is CLOSED — three labels, fixed order')
  ok(wizardModels.DIGEST_INTERIM_COPY === 'verifying bytes — identified by name for now', 'the reserved interim word is the spec’s, verbatim')

  const report = h3.h3StackReport(LANE_FILES, undefined, STOCK_CLASSES)
  const rows = wizardModels.modelsStepRows(LANE_FILES, report, [], {})
  const presentRows = rows.filter((row) => row.present)
  ok(presentRows.length === 4, `the fixture has four present rows (got ${presentRows.length})`)
  for (const row of presentRows) {
    ok(row.identity === 'name-suspected', `today's honest fallback labels every present row name-suspected (got ${JSON.stringify(row.identity)} on ${row.label})`)
    ok(row.interim === false, 'no interim word while no digest is in flight (the catalog wave drives this; today always false)')
  }
  ok(rows[4].identity === '', 'an absent component carries no identity label (nothing to identify)')

  const digest = wizardModels.modelsStepRows(LANE_FILES, report, [], { digestInFlight: true })
  ok(digest[0].identity === 'name-suspected' && digest[0].interim === true, 'a digest in flight adds the interim word beside the name-suspected label')
})

test('multi-candidate narration: picked names the others; ambiguous names the candidates (slotCandidates)', () => {
  console.log('wizard: the candidate narration')

  // THREE anchored candidates: the official artifact wins the first tier;
  // the enumeration carries the other two for the picked narration.
  const quartet = [
    M('H3/ssd/minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'diffusion_models'),
    M('H3/ssd/minimax_h3_fl2va_fp8.safetensors', 'diffusion_models'),
    M('H3/ssd/minimax_h3_fl2va_lite_experimental.safetensors', 'diffusion_models'),
    M('H3/ssd/minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'diffusion_models'),
    M('qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', 'text_encoders'),
    M('minimax_h3_video_vae_fp16.safetensors', 'vae'),
    M('minimax_h3_audio_vae_fp32.safetensors', 'vae'),
  ]
  const set = selection.slotCandidates(quartet, 'fl2va')
  ok(set.picked === 'H3/ssd/minimax_h3_fl2va_pruned_int8_convrot.safetensors', `the enumeration's pick is the ladder's pick (got ${JSON.stringify(set.picked)})`)
  ok(set.basis === 'anchored', 'the anchored tier earned the pick')
  ok(set.names.length === 3, `every fl2va-shaped file enumerates (got ${set.names.length})`)

  const report = h3.h3StackReport(quartet, undefined, STOCK_CLASSES)
  const rows = wizardModels.modelsStepRows(quartet, report, [], {})
  const fl2va = rows[0]
  ok(fl2va.narration === 'picked', `three anchored candidates narrate as picked (got ${JSON.stringify(fl2va.narration)})`)
  ok(fl2va.candidates.others.length === 2, `the narration carries the others (got ${fl2va.candidates.others.length})`)

  // AMBIGUOUS: the anchored tiers miss; the fallback needle picks loosely
  // — and the dimension guard refuses the loose pick. The row names its
  // candidates and exposes the override seam the one-click designate rides.
  const smallTes = [
    M('qwen3vl_4b_small.safetensors', 'text_encoders'),
    M('qwen3vl_8b_awesome.safetensors', 'text_encoders'),
  ]
  const teSet = selection.slotCandidates(smallTes, 'textEncoder')
  ok(teSet.basis === 'fallback', 'the anchored tiers missed; the fallback needle earned the pick')
  ok(teSet.names.length === 2, 'the loose candidates enumerate')

  const ambFiles = smallTes.concat([
    M('H3/ssd/minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'diffusion_models'),
    M('minimax_h3_video_vae_fp16.safetensors', 'vae'),
    M('minimax_h3_audio_vae_fp32.safetensors', 'vae'),
  ])
  const ambReport = h3.h3StackReport(ambFiles, undefined, STOCK_CLASSES)
  const ambRows = wizardModels.modelsStepRows(ambFiles, ambReport, [], {})
  const teRow = ambRows[1]
  ok(teRow.narration === 'ambiguous', `a fallback-needle pick narrates as ambiguous (got ${JSON.stringify(teRow.narration)})`)
  ok(teRow.candidates.names.length === 2, 'the ambiguous row names its candidates')
  ok(teRow.refusal !== '' && /32B/.test(teRow.refusal), `the loose pick still refuses through the dimension guard (got ${JSON.stringify(teRow.refusal)})`)
  ok(teRow.overrideSlot === 'textEncoder', 'the ambiguous row exposes the override seam the one-click designate rides')

  // A single clean candidate narrates clean (no narration noise).
  ok(rows[3].narration === 'clean', `a single-candidate row narrates clean (got ${JSON.stringify(rows[3].narration)})`)
})

test('fetchLanded derives from the catalog state, not component memory — placed/present landed, cached/absent not (review F1)', () => {
  console.log('wizard: fetchLanded (the catalog-derived landed state)')
  const view = (state) => ({
    entryId: 'lightx2v-fl2v-turbo-8',
    licenseSpdx: 'Apache-2.0',
    catalogState: state,
    inFlight: false,
    destRoot: 'loras',
    gated: false,
  })

  ok(typeof wizardModels.fetchLanded === 'function', 'fetchLanded exists on the view-builder module')
  ok(wizardModels.fetchLanded(view('placed')) === true, "state 'placed' (the fetcher's own install record) has landed")
  ok(wizardModels.fetchLanded(view('present')) === true, "state 'present' (matching files already at the destination) has landed")
  ok(wizardModels.fetchLanded(view('cached')) === false, "state 'cached' (bytes in the cache, not yet placed) has NOT landed")
  ok(wizardModels.fetchLanded(view('absent')) === false, "state 'absent' (nothing on disk) has NOT landed")

  // The rows' views pass straight through: the same view the builder emits
  // answers fetchLanded — the JSX derives from THIS, never component-local
  // started memory (which a mid-walk scan remount destroys).
  const report = h3.h3StackReport([], undefined, STOCK_CLASSES)
  const landed = wizardModels.modelsStepRows([], report, [{ ...CATALOG_TURBO_8, state: 'placed' }], { designated: true })
  ok(wizardModels.fetchLanded(landed[4].fetch) === true, 'a builder-emitted view with a placed entry reads as landed')
})

// ---------------------------------------------------------------------------
// TASK 6 — the Node packs step (spec §2.3): can-I-generate from the ONE
// predicate, the curated rows (the long tail never renders), the designation
// gate on every install, the via stated, and the honest between-state. The
// pack-side pure block lives in the spine (wizardWalk.ts) beside the gates;
// the can-I-generate narrator lives in h3Stack beside the predicate.
// ---------------------------------------------------------------------------

const registry = loadTs('src/lib/nodePackRegistry.ts', { window: { monoka: oracle } })

// The live board's listing shape (NodePackStatus): the registry's 14 rows
// decorated the way server/engineNodes.withAvailability does — nothing
// installed, nothing active, user-fetch packs needing their network source.
// `firstPartyShips` stands in for the payload truth the server reads off
// the repo's custom-nodes/ root (firstPartyPayloadDir).
function boardStatuses(firstPartyShips) {
  return registry.ENGINE_NODE_PACKS.map((pack) => ({
    ...pack,
    vendored: pack.installMode === 'vendor' || (pack.installMode === 'first-party' && firstPartyShips === true),
    installed: false,
    availability: pack.installMode === 'user-fetch'
      ? 'needs-source'
      : (pack.installMode === 'vendor' || firstPartyShips === true ? 'ready' : 'unavailable'),
    instanceState: 'absent',
    ...(pack.installMode === 'user-fetch' ? { hasNetworkSource: true } : {}),
    managerInstallable: false,
    fetchConsented: false,
  }))
}

test('the packs step answers can-I-generate from the ONE predicate (§2.3)', () => {
  console.log('wizard: the packs step — can-I-generate')

  ok(typeof h3.canGenerateAnswer === 'function', 'canGenerateAnswer exists beside the one predicate (one voice, h3Stack)')

  // The yes arm: the text-lane weights resolve AND the engine serves the
  // core classes.
  const complete = h3.h3StackReport(LANE_FILES, undefined, STOCK_CLASSES)
  const yes = h3.canGenerateAnswer(complete.selection, STOCK_CLASSES)
  ok(yes.ready === true, `a complete stack on a core-serving engine reads yes (got ${yes.ready})`)
  ok(/nothing to do here/i.test(yes.text), `the yes says nothing to do here (got ${JSON.stringify(yes.text)})`)

  // The core-class arm: weights fine, KSamplerSelect not served → No, the
  // class NAMED (weights cannot fix a node class).
  const noSampler = {
    MiniMaxH3ImageToVideo: STOCK_CLASSES.MiniMaxH3ImageToVideo,
    MiniMaxH3ReferenceToVideo: STOCK_CLASSES.MiniMaxH3ReferenceToVideo,
    SamplerCustomAdvanced: STOCK_CLASSES.SamplerCustomAdvanced,
  }
  const classBlocked = h3.canGenerateAnswer(complete.selection, noSampler)
  ok(classBlocked.ready === false, 'a missing core class reads no')
  ok(/KSamplerSelect/.test(classBlocked.text), `the no names the missing class (got ${JSON.stringify(classBlocked.text)})`)
  ok(!/rows below/.test(classBlocked.text), 'a stock-only miss never points at the rows — no curated row can serve a core class (CLASS_TO_PACK maps pack instanceNodeClasses only)')
  ok(/update ComfyUI/i.test(classBlocked.text), 'a stock-only miss routes to the update-ComfyUI advice — one voice with stackVerdictText above it')
  ok(classBlocked.missingClasses.join('|') === 'KSamplerSelect', 'the answer carries the missing class names for the step')

  // The weights arm: classes fine, weights unresolved → No, pointing at the
  // Models step (this step never re-derives file membership).
  const fresh = h3.h3StackReport([], undefined, STOCK_CLASSES)
  const weightBlocked = h3.canGenerateAnswer(fresh.selection, STOCK_CLASSES)
  ok(weightBlocked.ready === false, 'unresolved weights read no')
  ok(/Models step/.test(weightBlocked.text), `the no points at the Models step (got ${JSON.stringify(weightBlocked.text)})`)
  ok(weightBlocked.missingClasses.length === 0, 'a weights-only no carries no class names')

  // ONE PREDICATE: the answer's ready IS h3StackReady at the text lane for
  // the same inputs — on every combo, never a second encoding beside it.
  const combos = [
    [complete.selection, STOCK_CLASSES],
    [complete.selection, noSampler],
    [fresh.selection, STOCK_CLASSES],
    [fresh.selection, null],
  ]
  for (const combo of combos) {
    const answer = h3.canGenerateAnswer(combo[0], combo[1])
    ok(answer.ready === h3.h3StackReady({ selection: combo[0], mode: 'text', info: combo[1] ?? undefined }), 'the answer tracks the one predicate on every combo')
  }
})

test('curation = preflight-mapped + fast-tier + preview families; the long tail does not render (§2.3)', () => {
  console.log('wizard: the packs step — curation')

  // The submit-preflight SHAPE (MissingNodeClass): one miss whose packId
  // maps OUTSIDE the two families — autocontext. A graph diff feeds this
  // arm; the core-class diff the step holds is stock-only, so the families
  // carry the rest. The fixture's first-party payload does NOT ship — the
  // studio-tooling arm is this test's separate block below.
  const miss = { className: 'Minimax_H3_AutoContext_parameter', packId: 'autocontext', stock: false }

  const rows = walk.curatedWizardPacks({ packs: boardStatuses(false), missingClasses: [miss], info: null })
  ok(rows.map((row) => row.packId).join('|') === 'autocontext|minimax-h3-turbo|h3-preview-override', `exactly the mapped pack + the two families render, in that order (got ${JSON.stringify(rows.map((row) => row.packId))})`)

  // THE LONG TAIL: none of the other eleven renders — the board is the
  // board's home (spec §2.3).
  const ids = rows.map((row) => row.packId)
  for (const tail of ['vdn-h3', 'lora-form-adapter', 'h3-hybrid-loader', 'h3-audio-t8', 'krea2edit', 'krea2-anypaint', 'krea2-ostris-edit', 'h3-image-studio', 'h3-motion-context', 'lbh-latent-upscaler', 'fizgig-h3-still']) {
    ok(!ids.includes(tail), `the long tail never renders in the walk (${tail} stays on the board)`)
  }

  // The rows carry the registry's truth and state why they are curated.
  const turbo = rows.find((row) => row.packId === 'minimax-h3-turbo')
  ok(turbo.name === registry.findNodePack('minimax-h3-turbo').name, 'the row names the pack from the registry')
  ok(turbo.licenseSpdx === 'Apache-2.0', 'the license verdict rides the row')
  ok(typeof turbo.sentence === 'string' && turbo.sentence.length > 0 && turbo.sentence.indexOf('\n') === -1, 'the row carries one human sentence')
  ok(rows[0].reason === 'preflight' && turbo.reason === 'family', 'the rows state why they are curated')
  ok(turbo.status !== null && turbo.status.id === 'minimax-h3-turbo', 'the live board row rides the curated row')

  // An active pack renders its ACTIVE row — the spec's flip is the install's
  // verification payoff. The fallback reads the ONE presence rule
  // (packPresence): a partial turbo checkout is NOT the usable feature and
  // stays missing.
  const partialInfo = { MiniMaxH3TurboLoRA: { input: { required: {} } } }
  ok(registry.packPresence(partialInfo, 'minimax-h3-turbo') === false, 'fixture sanity: the one presence rule reads a partial checkout absent')
  const partial = walk.curatedWizardPacks({ packs: boardStatuses(false), missingClasses: [], info: partialInfo })
  ok(partial.find((row) => row.packId === 'minimax-h3-turbo').state === 'missing', 'a partial turbo checkout stays missing (the pack\'s own presenceRule, never a re-encoded any-match)')

  // The board could not ask (unknown) but a served snapshot answers: fully
  // served → the ACTIVE row.
  const fullInfo = { MiniMaxH3TurboLoRA: { input: { required: {} } }, MiniMaxH3TurboSampler: { input: { required: {} } } }
  const unknownBoard = boardStatuses(false).map((status) => ({ ...status, instanceState: 'unknown' }))
  const cured = walk.curatedWizardPacks({ packs: unknownBoard, missingClasses: [], info: fullInfo })
  ok(cured.find((row) => row.packId === 'minimax-h3-turbo').state === 'active', 'a served snapshot answers an unasking board through the one presence rule — the row reads active')

  // The studio-tooling arm: the first-party pack renders ONLY when the
  // board proves its payload ships (vendored) — the one install that needs
  // neither network nor Manager (the journey installs exactly this row).
  const tooling = walk.curatedWizardPacks({ packs: boardStatuses(true), missingClasses: [], info: null })
  ok(tooling.map((row) => row.packId).join('|') === 'minimax-h3-turbo|h3-preview-override|lora-form-adapter', `the shipping payload curates the studio's own tooling pack beside the families (got ${JSON.stringify(tooling.map((row) => row.packId))})`)
  const bare = walk.curatedWizardPacks({ packs: boardStatuses(false), missingClasses: [], info: null })
  ok(bare.map((row) => row.packId).join('|') === 'minimax-h3-turbo|h3-preview-override', `without the payload the tooling pack does not render — only the families (got ${JSON.stringify(bare.map((row) => row.packId))})`)
})

test('installed-but-not-restarted renders awaiting-restart, never active (the honest between-state, §2.3)', () => {
  console.log('wizard: the packs step — the between-state')

  // The plan's verbatim interim copy lives once, in the spine.
  ok(walk.PACKS_AWAITING_RESTART_COPY === 'installed — restart the engine to activate; this row verifies when it serves the classes.', 'the interim copy is the plan\'s, verbatim, in the spine')

  // The arm that names the state: installed on disk (studio marker) but the
  // instance does not serve the classes yet.
  const installed = boardStatuses(true).map((status) => (status.id === 'lora-form-adapter' ? { ...status, installed: true, instanceState: 'absent' } : status))
  const rows = walk.curatedWizardPacks({ packs: installed, missingClasses: [], info: null })
  const adapter = rows.find((row) => row.packId === 'lora-form-adapter')
  ok(adapter && adapter.state === 'awaiting-restart', `folder-present + not served reads awaiting-restart (got ${adapter && adapter.state})`)

  // The flip: a fresh active verdict renders the row ACTIVE — spec §2.3's
  // "the row flips to active only after the pack's claimed node classes
  // appear in a fresh targeted object_info read"; installed, verified,
  // nothing left to click.
  const flipped = boardStatuses(true).map((status) => (status.id === 'lora-form-adapter' ? { ...status, installed: true, instanceState: 'active' } : status))
  const activeRows = walk.curatedWizardPacks({ packs: flipped, missingClasses: [], info: null })
  ok(activeRows.find((row) => row.packId === 'lora-form-adapter').state === 'active', 'a fresh active verdict flips the row ACTIVE (verified in place)')

  // A foreign folder (present WITHOUT our marker) is on-disk truth too —
  // the classes may still arrive on restart; the refusal is the Settings
  // board's story, not the walk's.
  const foreign = boardStatuses(true).map((status) => (status.id === 'lora-form-adapter' ? { ...status, installed: false, folderState: 'foreign', instanceState: 'absent' } : status))
  const foreignRows = walk.curatedWizardPacks({ packs: foreign, missingClasses: [], info: null })
  ok(foreignRows.find((row) => row.packId === 'lora-form-adapter').state === 'awaiting-restart', 'a foreign folder reads awaiting-restart too')

  // A FRESH board absent-verdict outranks a stale served snapshot: the
  // board asked last, and the between-state stays honest.
  const snapshot = { MiniMaxH3LoraFormLoader: { input: { required: {} } } }
  const staleRows = walk.curatedWizardPacks({ packs: installed, missingClasses: [], info: snapshot })
  ok(staleRows.find((row) => row.packId === 'lora-form-adapter').state === 'awaiting-restart', 'a fresh board verdict outranks a stale snapshot')

  // An unreachable instance (unknown) with no folder truth reads unknown —
  // never missing, never active.
  const unknownRows = walk.curatedWizardPacks({ packs: boardStatuses(true).map((status) => ({ ...status, instanceState: 'unknown' })), missingClasses: [], info: null })
  ok(unknownRows.length > 0 && unknownRows.every((row) => row.state === 'unknown'), `an unasking board with no snapshot reads unknown rows (got ${JSON.stringify(unknownRows.map((row) => row.state))})`)

  // Nothing on disk, nothing served: missing — the installable state.
  const missingRows = walk.curatedWizardPacks({ packs: boardStatuses(true), missingClasses: [], info: null })
  ok(missingRows.every((row) => row.state === 'missing'), 'a clean board reads missing rows — the installable state')
})

test('install rows refuse until the custom-nodes folder is designated and existence-verified (W-C1/R3 P1-8)', async () => {
  console.log('wizard: the packs step — the designation gate')

  ok(typeof walk.packsInstallRefusal === 'function', 'the refusal seam exists in the spine')

  // Undesignated: the reason string — the same one the JSX renders beside
  // the disabled button (D7: say why, never a dead end).
  const refused = walk.packsInstallRefusal(walk.emptyDestination())
  ok(typeof refused === 'string' && refused.length > 0, 'an undesignated folder answers a reason string')
  ok(refused === walk.PACKS_INSTALL_REFUSAL, 'the refusal is the spine\'s one refusal copy')

  // A typed-but-unverified value is NOT designated — existence is the gate.
  const typed = walk.setDestinationValue(walk.emptyDestination(), '/engine/comfy/custom_nodes')
  ok(walk.isDesignated(typed) === false && walk.packsInstallRefusal(typed) !== null, 'a typed-but-unverified value keeps the refusal')

  // Designated (existence-verified): no refusal — the clicks open.
  stubCheckPath({ exists: true, directory: true })
  const designated = await walk.verifyDestination(typed)
  ok(walk.packsInstallRefusal(designated) === null, 'a verified designation lifts the refusal')
})

test('an install\'s via is stated on the row — manager, studio, never silent', () => {
  console.log('wizard: the packs step — the via label')

  ok(walk.packViaLabel('manager') === 'installed through ComfyUI-Manager', 'the manager via names the Manager')
  ok(walk.packViaLabel('studio') === 'installed through the studio', 'the studio via names the studio')
  ok(walk.packViaLabel(undefined) === '', 'no via renders no label (never an invented one)')

  // The route a click takes, derived from the board row's own decorations —
  // the server's Manager-first verdict, then the payload, then the fetcher.
  // The JSX renders exactly this decision.
  ok(walk.packInstallPath({ managerInstallable: true, availability: 'ready', hasNetworkSource: true }) === 'route-manager', 'a Manager-eligible pack routes through Manager first')
  ok(walk.packInstallPath({ managerInstallable: false, availability: 'ready', hasNetworkSource: true }) === 'route-studio', 'a ready payload routes through the studio')
  ok(walk.packInstallPath({ managerInstallable: false, availability: 'needs-source', hasNetworkSource: true }) === 'fetcher', 'a network-source pack routes through the consented fetcher')
  ok(walk.packInstallPath({ managerInstallable: false, availability: 'unavailable', hasNetworkSource: false }) === null, 'no path answers null — the row offers the manual way instead')
  ok(walk.packInstallPath(null) === null, 'no board row answers null (nothing to install from)')
})

test('the review round: a fetch admits it is underway, a foreign folder owns its words, a target-less install stays dark', () => {
  console.log('wizard: the packs step — the review round')

  // THE FETCHER ARM (review F2): startFetch only ENQUEUES — the answer is
  // {started}, the job runs in the background, and its failure lands in the
  // fetch ledger, never in that promise. The row's post-click phase derives
  // from the ledger (the Models step's rule) — 'underway' is everything
  // between the enqueue and a verdict, and it NEVER reads "installed".
  ok(typeof walk.packFetchPhase === 'function', 'the fetch-phase seam exists in the spine')
  ok(walk.packFetchPhase({ landed: false, inFlight: false, started: true, failure: '' }) === 'underway', 'an enqueued fetch reads underway')
  ok(walk.packFetchPhase({ landed: false, inFlight: true, started: false, failure: '' }) === 'underway', 'a catalog-in-flight fetch reads underway too')
  ok(walk.packFetchPhase({ landed: true, inFlight: false, started: false, failure: '' }) === 'landed', 'a catalog placement reads landed')
  ok(walk.packFetchPhase({ landed: false, inFlight: false, started: false, failure: '' }) === 'idle', 'no enqueue and no ledger truth reads idle')
  ok(walk.packFetchPhase({ landed: true, inFlight: false, started: true, failure: '' }) === 'landed', 'landed outranks the underway signals')
  ok(walk.packFetchPhase({ landed: true, inFlight: false, started: true, failure: 'the download failed' }) === 'landed', 'landed outranks a not-yet-swept failure (the success clears it within a poll)')
  ok(walk.packFetchPhase({ landed: false, inFlight: true, started: false, failure: 'the download failed' }) === 'underway', 'an in-flight retry outranks the stale failure it answers')
  ok(walk.packFetchPhase({ landed: false, inFlight: false, started: true, failure: 'the download failed' }) === 'failed', 'the failure outranks the click\'s started bridge')

  // The underway words: "fetch started", never "installed" — the board has
  // not confirmed the folder yet.
  ok(/fetch started/i.test(walk.PACKS_FETCH_UNDERWAY_COPY) && !/installed/i.test(walk.PACKS_FETCH_UNDERWAY_COPY), 'the underway copy admits the fetch, never claims installed')

  // THE FOREIGN FOLDER (review minor): the studio did not install it —
  // "installed — restart" is false advice there. The foreign copy owns its
  // words.
  ok(typeof walk.packAwaitingCopy === 'function', 'the awaiting-copy seam exists in the spine')
  ok(walk.packAwaitingCopy(null) === walk.PACKS_AWAITING_RESTART_COPY, 'no board row reads the plan\'s verbatim interim')
  const foreignCopy = walk.packAwaitingCopy({ folderState: 'foreign' })
  ok(foreignCopy !== walk.PACKS_AWAITING_RESTART_COPY, 'a foreign folder does not read the studio-install interim')
  ok(!/^installed/i.test(foreignCopy), 'the foreign copy never opens with "installed"')
  ok(/restart/i.test(foreignCopy) && /may not/i.test(foreignCopy), 'the foreign copy names the restart honesty — a restart may not fix it')

  // THE TARGET-LESS GATE (review minor): the walk-designated folder is not
  // the configured target — with nothing configured the click would fail
  // server-side (or land in a fallback the walk never designated), so the
  // button pre-disables and the reason renders beside it.
  ok(typeof walk.PACKS_NO_TARGET_COPY === 'string' && /no install target is configured/i.test(walk.PACKS_NO_TARGET_COPY), 'the no-target reason exists and says what is missing')
})

test('the row sentence is the registry description\'s first sentence — the essays stay on the board', () => {
  console.log('wizard: the packs step — the row sentence')
  const long = registry.findNodePack('h3-preview-override').description
  const sentence = walk.packRowSentence(long)
  ok(sentence.length < long.length && long.indexOf(sentence) === 0, 'the essay is cut to its first sentence')
  ok(sentence.charAt(sentence.length - 1) === '.', 'the sentence keeps its period')
  const plain = 'One sentence only.'
  ok(walk.packRowSentence(plain) === plain, 'a single-sentence description renders whole')
})

// ---------------------------------------------------------------------------
// TASK 7 — the LAN prep step (spec §2.4, W-I1, D8): the posture becomes a
// designation. Keep-current is the DEFAULT (§3's named pass — the fresh
// clone is one click); a designated host:port refuses until the bind probe
// answers claimable for EXACTLY it (verification earned per host:port, the
// same discipline as per-URL); the D8 default offers token enforcement ON
// when keep-LAN is chosen, OFF on loopback. The exit seam (lanKeysForExit)
// is what task 8's one-motion write reads.
// ---------------------------------------------------------------------------

test('the LAN designation: keep-current passes in one click; a bind designation refuses until the probe answers claimable for exactly it', () => {
  console.log('wizard: the LAN step — the designation gate')

  // KEEP-CURRENT IS THE DEFAULT (§2.4/§3): the fresh-clone path is one click
  // — nothing designated, nothing written, gate verified.
  const fresh = walk.emptyWalkCandidate('http://127.0.0.1:8188')
  ok(fresh.lanKeys.host === undefined && fresh.lanKeys.port === undefined && fresh.lanKeys.token === undefined, 'a fresh candidate designates no LAN keys')
  ok(fresh.lanProbe === null, 'a fresh candidate holds no probe verdict')
  ok(walk.lanGate(fresh).verdict === 'verified', 'keep-current passes in one click (§3\'s named pass)')

  // A host choice designates — and the gate refuses until the bind probe
  // answers for exactly that host:port (claimability BEFORE acceptance).
  const lan = walk.setLanHost(fresh, '0.0.0.0')
  ok(lan.lanKeys.host === '0.0.0.0', 'the keep-LAN choice designates the network bind')
  const gated = walk.lanGate(lan)
  ok(gated.verdict === 'refused', `a designated bind refuses before any probe (got ${gated.verdict})`)
  ok(gated.reason === walk.LAN_PROBE_FIRST_COPY, 'the refusal is the probe-first copy')

  // The probe verdict earns the gate — for EXACTLY the designated host:port.
  const probed = walk.recordLanProbe(lan, '0.0.0.0', 4178, { claimable: true })
  ok(probed.lanProbe !== null && probed.lanProbe.claimable === true, 'a claimable verdict is recorded')
  ok(walk.lanGate(probed).verdict === 'verified', 'a claimable verdict for exactly the designated host:port verifies')

  // Not claimable: the honest refusal carries the probe's own reason.
  const busy = walk.recordLanProbe(lan, '0.0.0.0', 4178, { claimable: false, reason: 'EADDRINUSE' })
  const busyGate = walk.lanGate(busy)
  ok(busyGate.verdict === 'refused', `a not-claimable verdict refuses (got ${busyGate.verdict})`)
  ok(/EADDRINUSE/.test(busyGate.reason ?? ''), `the refusal carries the probe's reason (got ${JSON.stringify(busyGate.reason)})`)

  // Verification is earned per host:port — an edit re-opens the gate, the
  // stale verdict never follows (the per-URL discipline, now per-bind).
  const moved = walk.setLanPort(probed, 5000)
  ok(moved.lanKeys.port === 5000 && moved.lanProbe === null, 'a port edit clears the stale probe verdict')
  ok(walk.lanGate(moved).verdict === 'refused', 'a stale verdict does not follow a port edit')
  const rehost = walk.setLanHost(probed, '127.0.0.1')
  ok(rehost.lanProbe === null, 'a host edit clears the stale probe verdict too')
  // A token edit is NOT a bind edit — the verdict survives it.
  const retoken = walk.setLanToken(probed, false)
  ok(retoken.lanProbe !== null && retoken.lanProbe.claimable === true, 'a token edit leaves the probe verdict alone (the bind did not change)')
  ok(walk.lanGate(retoken).verdict === 'verified', 'the gate stays verified across a token edit')

  // The port rule: integer 1024–65535, the launcher's own validation —
  // refused by name before any probe is even possible.
  const low = walk.setLanPort(lan, 80)
  const lowGate = walk.lanGate(low)
  ok(lowGate.verdict === 'refused' && /1024|65535/.test(lowGate.reason ?? ''), `an out-of-range port refuses naming the rule (got ${JSON.stringify(lowGate.reason)})`)

  // A token-only designation changes no bind — no probe owed, key still written.
  const tokenOnly = walk.setLanToken(fresh, true)
  ok(walk.lanGate(tokenOnly).verdict === 'verified', 'a token-only designation needs no bind probe (no bind changed)')

  // Keep-current is reachable from anywhere — the one-click undo.
  const kept = walk.keepLanPosture(probed)
  ok(kept.lanKeys.host === undefined && kept.lanKeys.token === undefined && kept.lanKeys.port === undefined && kept.lanProbe === null, 'keep-current clears every designated key and the verdict')
  ok(walk.lanGate(kept).verdict === 'verified', 'keep-current passes again after backing out')
})

test('the D8 default: keeping the network open offers token enforcement ON; narrowing to loopback offers it OFF', () => {
  console.log('wizard: the LAN step — the D8 default')

  ok(walk.lanTokenEnforcementDefault('0.0.0.0') === true, 'the network bind offers enforcement ON (protection that asks the host nothing)')
  ok(walk.lanTokenEnforcementDefault('127.0.0.1') === false, 'the loopback bind offers enforcement OFF (nothing can reach it anyway)')

  // The default RIDES the host choice — the offer is the toggle's state.
  const lan = walk.setLanHost(walk.emptyWalkCandidate('http://127.0.0.1:8188'), '0.0.0.0')
  ok(lan.lanKeys.token === true, 'choosing keep-LAN designates the token offer ON')
  const local = walk.setLanHost(walk.emptyWalkCandidate('http://127.0.0.1:8188'), '127.0.0.1')
  ok(local.lanKeys.token === false, 'narrowing to loopback designates the token offer OFF')
  // And the host's own click re-derives the offer — switching addresses
  // re-derives the default rather than dragging the old answer along.
  const flipped = walk.setLanHost(lan, '127.0.0.1')
  ok(flipped.lanKeys.token === false, 'switching the bind re-derives the offer (the old default does not survive the switch)')
})

test('the live equivalence: designating exactly the live posture verifies WITHOUT a probe (the wizard is served by the listener itself)', () => {
  console.log('wizard: the LAN step — the live equivalence')
  const live = { host: '0.0.0.0', port: 4178 }
  const fresh = walk.emptyWalkCandidate('http://127.0.0.1:8188')
  // The prefilled designation (the step prefills the LIVE port) probes the
  // studio's own listener and would always answer EADDRINUSE — the holder
  // is the wizard's own server. Confirming the status quo needs no probe:
  // no claimability question exists for a bind that already holds.
  const same = walk.setLanHost(walk.setLanPort(fresh, 4178), '0.0.0.0')
  ok(same.lanProbe === null, 'no probe has run')
  ok(walk.lanGate(same, live).verdict === 'verified', 'designating exactly the live posture verifies without a probe (the status quo confirms itself)')
  const exitKeys = walk.lanKeysForExit(same, live)
  ok(exitKeys !== null && exitKeys.host === '0.0.0.0' && exitKeys.port === 4178 && exitKeys.token === true, 'the status-quo designation still carries its keys to the exit (the D8 token offer is a real change; the bind is not)')

  // A port that differs from the live posture is NOT the status quo — the
  // probe is still owed before that bind is accepted.
  ok(walk.lanGate(walk.setLanPort(same, 5000), live).verdict === 'refused', 'a designation that differs from the live posture still owes the probe')

  // EADDRINUSE on the OWN port (the host narrowed, the live listener holds
  // the port): the refusal is translated honestly — this is the studio's
  // own server, and it frees at the next start.
  const narrowed = walk.recordLanProbe(walk.setLanHost(walk.setLanPort(fresh, 4178), '127.0.0.1'), '127.0.0.1', 4178, { claimable: false, reason: 'EADDRINUSE' })
  const ownPort = walk.lanGate(narrowed, live)
  ok(ownPort.verdict === 'refused', `the narrowed bind still refuses (got ${ownPort.verdict})`)
  ok(/this studio/.test(ownPort.reason ?? '') && /next start/.test(ownPort.reason ?? ''), `EADDRINUSE on the live port names the studio's own listener (got ${JSON.stringify(ownPort.reason)})`)

  // The same errno on a FOREIGN port keeps the generic reason — no false
  // comfort that the next start frees a stranger's listener.
  const foreign = walk.recordLanProbe(walk.setLanHost(fresh, '0.0.0.0'), '0.0.0.0', 5000, { claimable: false, reason: 'EADDRINUSE' })
  const foreignGate = walk.lanGate(foreign, live)
  ok(/not claimable/.test(foreignGate.reason ?? '') && !/this studio/.test(foreignGate.reason ?? ''), `a foreign port's EADDRINUSE keeps the generic refusal (got ${JSON.stringify(foreignGate.reason)})`)

  // Without a live posture (the read never answered), nothing changes: the
  // probe stays owed and the refusals keep their plain shapes.
  ok(walk.lanGate(same).verdict === 'refused', 'no live posture — the equivalence arm does not fire')
})

test('the exit seam: only a verified designation carries keys — keep-current and refusals carry none (task 8 reads this)', () => {
  console.log('wizard: the LAN step — the exit seam')

  const fresh = walk.emptyWalkCandidate('http://127.0.0.1:8188')
  ok(walk.lanKeysForExit(fresh) === null, 'keep-current carries nothing to the exit (nothing written)')

  const lan = walk.setLanHost(fresh, '0.0.0.0')
  ok(walk.lanKeysForExit(lan) === null, 'a refused designation carries nothing to the exit (the probe never answered)')

  const probed = walk.recordLanProbe(lan, '0.0.0.0', 4178, { claimable: true })
  const keys = walk.lanKeysForExit(probed)
  ok(keys !== null && keys.host === '0.0.0.0' && keys.port === 4178 && keys.token === true, 'a verified designation carries its keys — host, port, and the D8 token offer — to the exit')

  const tokenOnly = walk.setLanToken(fresh, true)
  const tokenKeys = walk.lanKeysForExit(tokenOnly)
  ok(tokenKeys !== null && tokenKeys.token === true && tokenKeys.host === undefined && tokenKeys.port === undefined, 'a token-only designation carries just its key')
})

test('the LAN copy speaks in world terms and states the truths plainly (D8, restart honesty)', () => {
  console.log('wizard: the LAN step — the copy')

  ok(/any device on this network/i.test(walk.LAN_HOST_LAN_COPY), 'the keep-LAN choice speaks in world terms')
  ok(/this machine only/i.test(walk.LAN_HOST_LOCAL_COPY), 'the loopback choice speaks in world terms')
  ok(/needs no token/.test(walk.LAN_TOKEN_TRUTH_COPY), 'the token truth states today\'s exposure plainly (the URL invites a phone onto a tokenless studio)')
  ok(/next time the studio starts/i.test(walk.LAN_RESTART_COPY) && /never restarts/i.test(walk.LAN_RESTART_COPY), 'the restart honesty: applies next start, the wizard never restarts the server')
  ok(/1024|65535/.test(walk.LAN_PORT_RANGE_COPY), 'the port rule copy names the range')
  ok(/you set yourself/.test(walk.LAN_OVERRIDES_COPY) && /saved choices apply/.test(walk.LAN_OVERRIDES_COPY), `the override honesty states the real precedence (got ${JSON.stringify(walk.LAN_OVERRIDES_COPY)})`)
  ok(!/win over anything this step writes/.test(walk.LAN_OVERRIDES_COPY), 'the override honesty no longer claims the launcher env always beats the write (the marker fix, 3p14abm)')
})

// ---------------------------------------------------------------------------
// Task 8 — the exit contract (spec §3): the one-motion write's pure block.
// buildExitWrite derives the whole exit from VERIFIED state only;
// applyExitWrite merges it over saved settings; exitWriteSummary speaks the
// silent-drop surface (T7's carried review) and the unverified-walk voice
// (T5's); placementDisclosure names where pre-exit fetches landed.
// ---------------------------------------------------------------------------

// The rich walk-state fixture: engine verified by a live Test, both
// destinations designated and existence-verified, an ambiguous pick named,
// and a probed LAN designation.
function richWalk() {
  let candidate = walk.setCandidateUrl(walk.emptyWalkCandidate('http://127.0.0.1:9'), 'http://127.0.0.1:8188')
  candidate = walk.markEngineVerified(candidate, 'http://127.0.0.1:8188', true)
  candidate = { ...candidate, modelsRoot: { value: '/engine/comfy/models', verdict: { designated: true, exists: true } } }
  candidate = { ...candidate, customNodesDir: { value: '/engine/comfy/custom_nodes', verdict: { designated: true, exists: true } } }
  candidate = { ...candidate, overrides: { diffusion_models: 'H3/ssd/minimax_h3_fl2va_pruned_int8_convrot.safetensors' } }
  candidate = walk.recordLanProbe(walk.setLanHost(candidate, '0.0.0.0'), '0.0.0.0', 4178, { claimable: true })
  return candidate
}

const BOTH_TIERS = { '4': { available: true }, '8': { available: true } }
const NO_TIERS = { '4': { available: false }, '8': { available: false } }

test('buildExitWrite carries every verified designation in one motion and nothing else', () => {
  console.log('wizard: the exit write — the one motion')

  const write = walk.buildExitWrite(richWalk(), BOTH_TIERS)
  assert.deepEqual(
    Object.keys(write.settingsPatch).sort(),
    ['comfyUrl', 'engine', 'generationDefaults', 'modelOverrides', 'modelRoot'],
    `the patch keys are exactly the five (got ${JSON.stringify(Object.keys(write.settingsPatch).sort())})`,
  )
  ok(write.settingsPatch.comfyUrl === 'http://127.0.0.1:8188', 'the verified engine url rides')
  ok(write.settingsPatch.modelRoot === '/engine/comfy/models', 'the designated models root rides')
  assert.deepEqual(
    Object.keys(write.settingsPatch.engine ?? {}),
    ['externalCustomNodesDir'],
    `the engine patch carries ONLY the custom-nodes folder (got ${JSON.stringify(write.settingsPatch.engine)})`,
  )
  ok(write.settingsPatch.engine?.externalCustomNodesDir === '/engine/comfy/custom_nodes', 'the designated custom-nodes folder rides')
  assert.deepEqual(
    JSON.parse(JSON.stringify(write.settingsPatch.modelOverrides)),
    { monoka: { diffusion_models: 'H3/ssd/minimax_h3_fl2va_pruned_int8_convrot.safetensors' } },
    `the walk's overrides ride under the monoka family (got ${JSON.stringify(write.settingsPatch.modelOverrides)})`,
  )
  assert.deepEqual(
    Object.keys(write.settingsPatch.generationDefaults ?? {}),
    ['turbo'],
    `the generationDefaults patch carries ONLY the tier (got ${JSON.stringify(write.settingsPatch.generationDefaults)})`,
  )
  ok(write.settingsPatch.generationDefaults?.turbo === '8', 'the ruling: both tiers verified → the 8-step default')
  ok(write.tierFallback === false, 'no fallback flag when a tier verified')

  // The second store: the probed LAN designation rides as its own keys —
  // never inside app settings (W-I1/W-M3).
  ok(write.launcherKeys !== null
    && write.launcherKeys.host === '0.0.0.0'
    && write.launcherKeys.port === 4178
    && write.launcherKeys.token === true,
  `the verified LAN designation carries its keys to the second store (got ${JSON.stringify(write.launcherKeys)})`)

  // NOTHING ELSE: a sparse walk (nothing verified, nothing designated) puts
  // only the derived tier in the patch — no partial designations, no extras.
  const sparse = walk.buildExitWrite(walk.emptyWalkCandidate('http://127.0.0.1:8188'), NO_TIERS)
  assert.deepEqual(
    Object.keys(sparse.settingsPatch),
    ['generationDefaults'],
    `nothing verified → only the tier rides (got ${JSON.stringify(Object.keys(sparse.settingsPatch))})`,
  )
  ok(sparse.launcherKeys === null, 'keep-current carries no launcher keys')
})

test('the default tier writes only when verified — never a tier that would refuse', () => {
  console.log('wizard: the exit write — the tier rule')

  const verified = walk.markEngineVerified(walk.emptyWalkCandidate('http://127.0.0.1:8188'), 'http://127.0.0.1:8188', true)
  const tierOf = (tiers) => {
    const write = walk.buildExitWrite(verified, tiers)
    return { turbo: write.settingsPatch.generationDefaults?.turbo, fallback: write.tierFallback }
  }

  ok(tierOf(NO_TIERS).turbo === 'off', 'no verified tier → off (the exit never writes a tier that would refuse)')
  ok(tierOf(NO_TIERS).fallback === true, 'the none arm sets the honest fallback flag')
  ok(tierOf({ '4': { available: false }, '8': { available: true } }).turbo === '8', 'only the 8-step verified → 8')
  ok(tierOf({ '4': { available: true }, '8': { available: false } }).turbo === '4', 'only the 4-step verified → 4')
  ok(tierOf({ '4': { available: true }, '8': { available: true } }).turbo === '8', 'both verified → 8 (the quality-leaning ruling, asserted)')
  ok(tierOf({ '4': { available: true }, '8': { available: true } }).fallback === false, 'no fallback flag when any tier verified')

  // The REAL seam (one derivation — turboTierStates is what the properties
  // panel and the submit refusal read; the exit reads the same ladder).
  const eightOnly = h3.turboTierStates([M('minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', 'loras')], 'text')
  ok(eightOnly['8'].available === true && eightOnly['4'].available === false, 'the real seam resolves the 8-step LoRA alone')
  ok(tierOf(eightOnly).turbo === '8', 'the exit write derives from the same seam (8 available → 8)')
  const none = h3.turboTierStates([], 'text')
  ok(none['4'].available === false && none['8'].available === false, 'the real seam answers both-unavailable on an empty inventory')
  ok(tierOf(none).turbo === 'off' && tierOf(none).fallback === true, 'the real seam empty → off + fallback')
})

test('skip persists nothing: no settings patch and no launcher keys (D3)', () => {
  console.log('wizard: the exit write — skip persists nothing')

  // Skip's terminal state is the latch — the candidate is dropped whole. The
  // most a skip-shaped exit COULD say is the untouched candidate's write:
  // only the derived tier, nothing designated, no launcher keys.
  const skipShaped = walk.buildExitWrite(walk.emptyWalkCandidate('http://127.0.0.1:8188'), BOTH_TIERS)
  assert.deepEqual(Object.keys(skipShaped.settingsPatch), ['generationDefaults'], 'the untouched candidate writes only the derived tier')
  ok(skipShaped.launcherKeys === null, 'the untouched candidate writes no launcher keys')
  ok(walk.shouldPresent({ latchDone: false, latchSkipped: true, serverSetupRequested: false }) === false, 'the skipped latch ends the presentation')
  ok(walk.shouldPresent({ latchDone: false, latchSkipped: false, serverSetupRequested: false }) === true, 'the un-latched walk keeps presenting')
})

test('applyExitWrite merges over saved settings without dropping unrelated keys', () => {
  console.log('wizard: the exit write — the pure merge')

  const saved = {
    comfyUrl: 'http://old:1',
    modelRoot: '/old/root',
    engine: { mode: 'external', checkoutPath: '/old/checkout', externalCustomNodesDir: '/old/nodes', portPreference: 8191 },
    modelOverrides: { monoka: { text_encoders: 'old.t5' }, other: { vae: 'keep.vae' } },
    generationDefaults: { turbo: 'off', steps: 30, resolution: '1344x768', duration: 6 },
  }
  const next = walk.applyExitWrite(saved, walk.buildExitWrite(richWalk(), BOTH_TIERS))
  ok(next.comfyUrl === 'http://127.0.0.1:8188', 'the verified url replaces the saved one')
  ok(next.modelRoot === '/engine/comfy/models', 'the designated root replaces the saved one')
  ok(next.engine.externalCustomNodesDir === '/engine/comfy/custom_nodes'
    && next.engine.mode === 'external' && next.engine.portPreference === 8191,
  'the engine merge preserves every unrelated engine key')
  ok(next.modelOverrides.monoka.diffusion_models === 'H3/ssd/minimax_h3_fl2va_pruned_int8_convrot.safetensors'
    && next.modelOverrides.monoka.text_encoders === 'old.t5'
    && next.modelOverrides.other.vae === 'keep.vae',
  'the overrides merge per-family: the walk pick lands, the rest survives')
  ok(next.generationDefaults.turbo === '8' && next.generationDefaults.steps === 30 && next.generationDefaults.resolution === '1344x768',
  'the tier merges into the saved defaults; the rest of the defaults stays')
  ok(saved.generationDefaults.turbo === 'off' && saved.comfyUrl === 'http://old:1', 'the saved object is untouched (a pure merge, no mutation)')

  // Sparse write over saved settings: only the tier changes.
  const sparseNext = walk.applyExitWrite(saved, walk.buildExitWrite(walk.emptyWalkCandidate('http://old:1'), NO_TIERS))
  ok(sparseNext.comfyUrl === 'http://old:1' && sparseNext.modelRoot === '/old/root', 'nothing verified → the saved designations stay')
  ok(sparseNext.generationDefaults.turbo === 'off', 'the tier rule still resolves (off when nothing verified)')
})

test('the exit summary speaks: what will and will not be written, the silent drop named (T7 review, T5 voice)', () => {
  console.log('wizard: the exit write — the summary voice')

  // The rich walk: every item carried, no "nothing" headline.
  const richSummary = walk.exitWriteSummary(walk.buildExitWrite(richWalk(), BOTH_TIERS))
  ok(Array.isArray(richSummary.items) && richSummary.items.length === 6, `six items — the five patch keys + the LAN keys (got ${richSummary.items?.length})`)
  ok(richSummary.items.every((item) => item.carried === true), 'a fully verified walk carries every item')
  ok(!/nothing you designated/i.test(richSummary.headline), `the carried headline does not say nothing (got ${JSON.stringify(richSummary.headline)})`)

  // The UNVERIFIED WALK voice (T5): the unverified engine's item says the
  // saved address stays — no invented verdict, no silent drop.
  const unverifiedWrite = walk.buildExitWrite(walk.emptyWalkCandidate('http://127.0.0.1:8188'), BOTH_TIERS)
  const urlItem = unverifiedWrite.items.find((item) => item.key === 'comfyUrl')
  ok(urlItem.carried === false, 'the unverified url item is not carried')
  ok(/saved address|saved/i.test(urlItem.reason ?? ''), `the unverified url item names what stays (got ${JSON.stringify(urlItem.reason)})`)
  // T5's voice: an unverified walk's summary says what WILL and WON'T be
  // written — and when NOTHING was verified, the headline names it.
  const unverifiedSummary = walk.exitWriteSummary(unverifiedWrite)
  ok(/nothing you designated will be written/i.test(unverifiedSummary.headline),
  `the all-dropped headline names the nothing (got ${JSON.stringify(unverifiedSummary.headline)})`)

  // THE SILENT DROP SURFACE (T7's carried review): a designation the gate
  // refused (host designated, the probe never answered) is DROPPED at the
  // exit — the summary must say so, never vanish.
  const refused = walk.setLanHost(richWalk(), '0.0.0.0')
  const refusedWrite = walk.buildExitWrite(refused, BOTH_TIERS)
  ok(refusedWrite.launcherKeys === null, 'the refused designation carries no launcher keys (the existing seam)')
  const refusedItem = refusedWrite.items.find((item) => item.key === 'lanKeys')
  ok(refusedItem.carried === false, 'the refused LAN item is marked not-carried')
  ok(/probe|not verified/i.test(refusedItem.reason ?? ''), `the refused item names its drop (got ${JSON.stringify(refusedItem.reason)})`)

  // Keep-current is NOT a drop — its reason says so (chosen nothing).
  const keptWrite = walk.buildExitWrite(walk.keepLanPosture(richWalk()), BOTH_TIERS)
  const keptItem = keptWrite.items.find((item) => item.key === 'lanKeys')
  ok(keptItem.carried === false && /keep|nothing is written/i.test(keptItem.reason ?? ''),
  `keep-current says so by name (got ${JSON.stringify(keptItem.reason)})`)

  // The tier item rides every summary with its honest value.
  const fallbackWrite = walk.buildExitWrite(richWalk(), NO_TIERS)
  const tierItem = fallbackWrite.items.find((item) => item.key === 'tier')
  ok(tierItem.carried === true && /quality|30 steps/i.test(`${tierItem.value ?? ''} ${tierItem.note ?? ''}`),
  `the fallback tier item speaks its truth (got ${JSON.stringify(tierItem)})`)
})

test('the placement disclosure: pre-exit fetches landed in the CONFIGURED root — the exit names the folder when the designation differs', () => {
  console.log('wizard: the exit write — the placement seam')

  const disclosure = walk.placementDisclosure({
    placedPaths: ['/configured/loras/turbo.safetensors', '/configured/loras/other.safetensors', '/elsewhere/x.safetensors'],
    configuredRoot: '/configured',
    designatedRoot: '/engine/comfy/models',
  })
  ok(disclosure !== null && disclosure.folder === '/configured', `the disclosure names the configured folder (got ${JSON.stringify(disclosure)})`)
  assert.deepEqual(
    disclosure?.files,
    ['/configured/loras/turbo.safetensors', '/configured/loras/other.safetensors'],
    'only the files under the configured root, paths verbatim',
  )

  ok(walk.placementDisclosure({ placedPaths: ['/configured/loras/t.safetensors'], configuredRoot: '/configured', designatedRoot: '/configured' }) === null,
  'the designation equals the configured root — nothing to disclose')
  ok(walk.placementDisclosure({ placedPaths: ['/configured/loras/t.safetensors'], configuredRoot: '/configured', designatedRoot: '' }) === null,
  'no designation — the configured root remains the root; nothing to disclose')
  ok(walk.placementDisclosure({ placedPaths: [], configuredRoot: '/configured', designatedRoot: '/engine/comfy/models' }) === null,
  'nothing was placed pre-exit — nothing to disclose')
  // Trailing-slash tolerance: roots arrive from settings and designations
  // that may carry a trailing slash; the membership test must not care.
  const slashed = walk.placementDisclosure({ placedPaths: ['/configured/loras/t.safetensors'], configuredRoot: '/configured/', designatedRoot: '/engine/comfy/models' })
  ok(slashed !== null && slashed.files.length === 1, 'a trailing slash on the configured root does not hide the files')
})

test('the placement disclosure under drive roots — the prefix match is separator-aware (j63snid)', () => {
  console.log('wizard: the placement seam on Windows roots')

  const disclosure = walk.placementDisclosure({
    placedPaths: ['C:\\models\\loras\\t.safetensors', 'D:\\elsewhere\\x.safetensors'],
    configuredRoot: 'C:\\models',
    designatedRoot: 'D:\\engine\\models',
  })
  ok(disclosure !== null && disclosure.folder === 'C:\\models', `the drive-root disclosure names the configured folder (got ${JSON.stringify(disclosure)})`)
  assert.deepEqual(disclosure?.files, ['C:\\models\\loras\\t.safetensors'], 'only the files under the drive root, paths verbatim')

  // The same root spelled the other way round hides too — a drive root
  // compares separator-blind (the ledger may normalize slashes).
  ok(walk.placementDisclosure({ placedPaths: ['C:\\models\\loras\\t.safetensors'], configuredRoot: 'C:\\models', designatedRoot: 'C:/models' }) === null,
  'the same drive root in the other spelling — nothing to disclose')
  // Trailing-slash tolerance, same as the POSIX arm: the drive root's own
  // trailing separator must not hide the files.
  const slashedFire = walk.placementDisclosure({ placedPaths: ['C:\\models\\loras\\t.safetensors'], configuredRoot: 'C:\\models\\', designatedRoot: 'D:\\engine\\models' })
  ok(slashedFire !== null && slashedFire.files.length === 1, 'a trailing backslash on the configured drive root does not hide the files')
})

test('the cost preview speaks the seam the submit runs — tier, steps, the wait as a class', () => {
  console.log('wizard: the first prompt — the cost preview')

  const fast = walk.promptCostPreview({ turbo: '8', steps: 8, resolution: '1344x768', duration: 6 })
  ok(/8-step/.test(fast) && /1344x768/.test(fast) && /6s/.test(fast), `the fast preview names tier, steps, resolution, duration (got ${JSON.stringify(fast)})`)
  ok(/minutes-class/.test(fast), 'the fast wait is stated as a class')

  const four = walk.promptCostPreview({ turbo: '4', steps: 4, resolution: '768x1344', duration: 8 })
  ok(/4-step/.test(four) && /768x1344/.test(four), 'the 4-step preview names its own tier and shape')

  const fallback = walk.promptCostPreview({ turbo: 'off', steps: 30, resolution: '1344x768', duration: 6 })
  ok(/quality/i.test(fallback) && /30 steps/.test(fallback), `the fallback names quality and the full step count (got ${JSON.stringify(fallback)})`)
  ok(/20-minute/.test(fallback), 'the quality wait names its class — never an invented minute count')
  ok(!/minutes-class/.test(fallback), 'the fallback does not claim the fast class')
})

// (3je6o48, the bridge half) The scanModels bridge the walk's Refresh rides:
// the §5.2 candidate url lands ON THE QUERY — refresh semantics AND the url
// together — and a call without a candidate stays byte-parity (no url param).
// The server half (bootstrap?url= reads the candidate engine) is the resync
// suite's (d3); this pins the renderer's bridge so the wiring cannot drop
// the param silently — and it runs without a dist build (resync (d3) needs
// one).
test('the scanModels bridge carries refresh + the candidate url on the bootstrap query', async () => {
  console.log('wizard: the refresh bridge — the candidate url on the query')
  const calls = []
  const client = loadTs('src/lib/apiClient.ts', {
    window: { location: { search: '' } },
    fetch: async (path) => { calls.push(String(path)); return { ok: true, json: async () => ({ models: [] }) } },
    Headers: globalThis.Headers,
  }).createWebApiClient()
  await client.scanModels({ comfyUrl: 'http://saved.local' }, { refresh: true, url: 'http://127.0.0.1:8189' })
  ok(calls[calls.length - 1] === '/api/lan/bootstrap?refresh=1&url=' + encodeURIComponent('http://127.0.0.1:8189'), 'the refresh rides refresh semantics + the candidate url')
  await client.scanModels({ comfyUrl: 'http://saved.local' }, { refresh: true })
  ok(calls[calls.length - 1] === '/api/lan/bootstrap?refresh=1', 'no candidate → byte-parity (no url param)')
})

test('suite summary', () => {
  console.log(`  wizard: ${passed} assertions passed`)
})
