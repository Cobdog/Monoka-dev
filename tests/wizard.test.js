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

test('suite summary', () => {
  console.log(`  wizard: ${passed} assertions passed`)
})
