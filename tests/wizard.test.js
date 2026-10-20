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

test('the row sentence is the registry description\'s first sentence — the essays stay on the board', () => {
  console.log('wizard: the packs step — the row sentence')
  const long = registry.findNodePack('h3-preview-override').description
  const sentence = walk.packRowSentence(long)
  ok(sentence.length < long.length && long.indexOf(sentence) === 0, 'the essay is cut to its first sentence')
  ok(sentence.charAt(sentence.length - 1) === '.', 'the sentence keeps its period')
  const plain = 'One sentence only.'
  ok(walk.packRowSentence(plain) === plain, 'a single-sentence description renders whole')
})

test('suite summary', () => {
  console.log(`  wizard: ${passed} assertions passed`)
})
