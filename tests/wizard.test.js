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
  // old wizard rode setSettings on every keystroke (one config save per
  // character — the journey spec's counting window measured it); the walk
  // holds the candidate in memory instead, and this module deliberately
  // offers no settings-writing seam at all (the e2e journey proves the
  // network half: zero POST /api/lan/settings across the keystrokes).
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

test('suite summary', () => {
  console.log(`  wizard: ${passed} assertions passed`)
})
