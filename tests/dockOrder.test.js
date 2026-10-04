// dockOrder (component vocabulary task 11, Flux k2q0n9s) — the reactive
// dock-rank model behind src/ui/dockOrder.ts (spec §0.1 layering: a bounded
// z-band where the raise discipline re-ranks participants instead of growing
// a counter). Node-appropriate by construction — the module is a pure rank
// model over an ordered id list plus a publish/subscribe fan:
//
//   (a) consecutive ranking — registration appends at the TOP (newest);
//       raiseDock moves the id to the top and, critically, RE-RANKS every
//       participant to consecutive values (0..n-1, bottom→top): no gaps, no
//       ties, no clamping and no modulo (both would invert ordering — the
//       r2 planning note).
//   (b) relative order preserved — a raise moves exactly the raised id;
//       everyone else keeps their relative position (monotone recency: the
//       z order always equals the interaction order).
//   (c) 50 raises — the band math: after EVERY raise the ranks are exactly
//       0..n-1 and the raised id is n-1. The old store counter grew without
//       bound (it crossed the bench panel's z-70 after ~10 raises and would
//       eventually cross ANY modal constant); renormalization makes the
//       band width = the participant count, forever bounded.
//   (d) unregistration — removal of a NON-TOP entry compresses the ranks
//       (consecutive maintained, survivors' order intact); unregistering an
//       absent id is a no-op; close→reopen (unregister→raise) re-lands the
//       dock at the top.
//   (e) dockRank of an unregistered id = order.length — the as-if-appended
//       slot, i.e. exactly where a raise lands it one tick later (a dock
//       rendering between mount and its raise-on-open effect never shows a
//       stale z).
//   (f) publish — every mutation notifies the subscribers (the reactivity:
//       the store PUBLISHES to every participant; consumers retain nothing
//       locally).
//   (g) the z formula + the token contract — dockZCss(rank) composes
//       `calc(var(--z-dock-base) + rank)` so the CSS token owns the band
//       floor, and the styles.css ladder is checked AT RUN TIME (the r3
//       "cross-check CSS declarations" rule): --z-dock-base defined and
//       integer; --z-modal above the ENTIRE dock band (base + 8 slots, the
//       manifest's 8-Rnd census); --z-consent above modal; the toast +
//       fetch-consent rules pinned to their tier tokens; the settings dock
//       class carries no z pin (the at-rest DOM-order tie died with the
//       reactive ranks).
//
// Browser behavior (the React hook subscribing + re-rendering every dock,
// registration riding each dock's open effect) is NOT this suite's business
// (vitest is node-env, P04): e2e/canvas.spec.ts owns it at the real docks.
import { test } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { loadTs } = require('../scripts/lib/ts-vm.cjs')

const ok = (condition, label) => assert.ok(condition, label)

function eq(actual, expected, label) {
  assert.deepEqual(actual, expected, label)
  console.log(`  ok - ${label}`)
}

const dockOrder = loadTs('src/ui/dockOrder.ts')
const { raiseDock, unregisterDock, dockRank, dockZCss, dockOrderSnapshot, subscribeDockOrder } = dockOrder

const ranksOf = (ids) => ids.map((id) => dockRank(id))
// The module runs in the VM harness's own context — its arrays carry that
// realm's Array.prototype, so node's deepStrictEqual (prototype-sensitive)
// would reject them despite equal contents. Compare JOINED STRINGS, the
// layerRegistry suite's idiom.
const orderIds = () => dockOrderSnapshot().join('|')
const isConsecutiveFromZero = (ranks) => {
  const sorted = ranks.slice().sort((a, b) => a - b)
  return sorted.every((rank, index) => rank === index)
}

// ---- (a) registration + consecutive ranking ----------------------------------

test('(a) registration appends at the top; ranks are consecutive bottom→top', () => {
  raiseDock('inspector')
  raiseDock('settings')
  raiseDock('audio')
  eq(orderIds(), 'inspector|settings|audio', 'the order reads bottom→top, newest last')
  eq(ranksOf(['inspector', 'settings', 'audio']), [0, 1, 2], 'ranks are the list indices — consecutive from zero')
  ok(isConsecutiveFromZero(ranksOf(['inspector', 'settings', 'audio'])), 'consecutive by construction, no gaps, no ties')
})

// ---- (b) a raise re-ranks: the raised id to the top, everyone else in place --

test('(b) raiseDock moves only the raised id; relative order of the rest is preserved', () => {
  raiseDock('inspector') // bottom of the current three
  eq(orderIds(), 'settings|audio|inspector', 'the raised id lands at the top')
  eq(ranksOf(['settings', 'audio']), [0, 1], 'the others keep their relative order (monotone recency)')
  ok(isConsecutiveFromZero(ranksOf(['settings', 'audio', 'inspector'])), 'still consecutive 0..n-1 after the raise')
})

// ---- (c) 50 raises: the band math ---------------------------------------------

test('(c) 50 raises keep the ranks consecutive and bounded (renormalization, not a counter)', () => {
  // A fixed deterministic sequence (no randomness in a suite). 7 ≡ 1 (mod 3),
  // so the cycle raises the ids in rotation — and because each raise tops
  // its target, the next id in the rotation is always the CURRENT BOTTOM at
  // its turn: every one of the 50 is a bottom raise (the full re-rank, the
  // maximum-churn case). The idempotent re-top is deliberately NOT exercised
  // here — it is a no-op by construction, and the e2e closing move grabs the
  // bottom for the same discriminating reason.
  const ids = ['inspector', 'settings', 'audio']
  const sequence = []
  for (let index = 0; index < 50; index += 1) sequence.push(ids[(index * 7) % 3])
  for (const id of sequence) {
    const before = dockOrderSnapshot()
    raiseDock(id)
    const after = dockOrderSnapshot()
    const join = (list) => list.join('|')
    eq(after.length, before.length, 'a raise never adds or drops participants (all registered here)')
    eq(join(after.slice(0, -1)), join(before.filter((entry) => entry !== id)), `the rest keep their exact order when ${id} is raised`)
    ok(isConsecutiveFromZero(ranksOf(ids)), `ranks re-normalized to exactly 0..n-1 after raising ${id}`)
    eq(after[after.length - 1], id, `${id} is the top after being raised`)

  }
  // The whole 50-raise history never left the band: top rank = n-1, not 50.
  eq(dockRank('inspector') <= 2 && dockRank('settings') <= 2 && dockRank('audio') <= 2, true, 'after 50 raises the top rank is still participant-count-1 (the counter would read 50+)')
})

// ---- (d) unregistration: non-top removal, no-ops, close→reopen ----------------

test('(d) unregistering a NON-TOP dock compresses the ranks; absent ids are a no-op', () => {
  // Re-establish a known order first (the suite is one stateful module):
  // inspector bottom, settings middle, audio top.
  raiseDock('inspector')
  raiseDock('settings')
  raiseDock('audio')
  eq(orderIds(), 'inspector|settings|audio', 'known starting order, bottom→top')
  unregisterDock('settings') // the MIDDLE entry — non-top removal
  eq(orderIds(), 'inspector|audio', 'a non-top removal takes exactly its own entry')
  eq(ranksOf(['inspector', 'audio']), [0, 1], 'survivors compress to consecutive ranks')
  unregisterDock('pose-rig') // never registered
  eq(orderIds(), 'inspector|audio', 'unregistering an absent id changes nothing')
  unregisterDock('settings') // already gone
  eq(orderIds(), 'inspector|audio', 'a spent unregister is a no-op')
  // Close→reopen: the dock re-lands at the TOP (raise-on-open).
  raiseDock('settings')
  eq(orderIds(), 'inspector|audio|settings', 'a reopened dock re-registers at the top')
})

// ---- (e) the unregistered rank is the as-if-appended slot ---------------------

test('(e) dockRank of an unregistered id = order.length (where its raise would land it)', () => {
  const count = dockOrderSnapshot().length
  eq(dockRank('diagnostics'), count, 'the as-if-appended top slot — never a stale or negative rank')
  raiseDock('diagnostics')
  eq(dockRank('diagnostics'), dockOrderSnapshot().length - 1, 'and the raise lands it exactly there')
  unregisterDock('diagnostics')
})

// ---- (f) publish: every mutation notifies the subscribers ----------------------

test('(f) raise/unregister PUBLISH — each mutation notifies exactly once', () => {
  let notifications = 0
  const unsubscribe = subscribeDockOrder(() => { notifications += 1 })
  raiseDock('settings')
  eq(notifications, 1, 'a raise publishes once')
  eq(dockOrderSnapshot().slice(-1)[0], 'settings', 'the raise landed settings on top')
  unregisterDock('settings')
  eq(notifications, 2, 'an unregister publishes once')
  ok(dockOrderSnapshot().indexOf('settings') === -1, 'the unregister took settings back out')
  unsubscribe()
  raiseDock('inspector')
  eq(notifications, 2, 'an unsubscribed listener hears nothing more')
})

// ---- (g) the z formula + the styles.css token contract -------------------------

test('(g) dockZCss composes the token formula; the band ceiling stays under modal, consent above', () => {
  eq(dockZCss(0), 'calc(var(--z-dock-base) + 0)', 'rank 0 rides the token floor itself')
  eq(dockZCss(3), 'calc(var(--z-dock-base) + 3)', 'the formula is the token plus the rank — the CSS owns the floor')
  // The published ladder, checked against the real sheet (never a
  // hand-maintained constant — a token that vanished from styles.css must
  // fail here, not in a screenshot diff).
  const sheet = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'styles.css'), 'utf8')
  const canvasSheet = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'canvas', 'canvas.css'), 'utf8')
  const token = (name) => {
    const match = sheet.match(new RegExp(`--${name}:\\s*(\\d+)`))
    return match ? Number(match[1]) : NaN
  }
  ok(Number.isFinite(token('z-dock-base')), '--z-dock-base is defined in :root (the band floor token)')
  ok(Number.isFinite(token('z-modal')), '--z-modal is defined in :root')
  ok(Number.isFinite(token('z-consent')), '--z-consent is defined in :root (the topmost tier)')
  ok(token('z-modal') > token('z-dock-base') + 8, `modal (${token('z-modal')}) sits above the ENTIRE dock band (${token('z-dock-base')}..${token('z-dock-base') + 7}, the 8-Rnd census + headroom)`)
  ok(token('z-consent') > token('z-modal'), `consent (${token('z-consent')}) sits above modal (${token('z-modal')})`)
  ok(token('z-toast') > token('z-modal'), `toasts (${token('z-toast')}) stay above the modal band (the pre-contract order, kept)`)
  // The rules ride the tokens (lockstep both directions — grep the sheet,
  // the manifest's verification-column style).
  ok(/\.toast-host\s*\{[^}]*z-index:\s*var\(--z-toast\)/.test(sheet), '.toast-host rides var(--z-toast)')
  ok(/\.canvas-toasts\s*\{[^}]*z-index:\s*var\(--z-toast\)/.test(canvasSheet), '.canvas-toasts rides var(--z-toast)')
  ok(/\.modal-backdrop\.fetch-consent-backdrop\s*\{[^}]*z-index:\s*var\(--z-consent\)/.test(sheet), 'the fetch-consent backdrop rides var(--z-consent)')
  ok(/\.ui-dialog-center\.fetch-consent-center\s*\{[^}]*z-index:\s*var\(--z-consent\)/.test(sheet), 'the fetch-consent center rides var(--z-consent)')
  // The at-rest tie died: the settings-dock class pin is gone (every dock
  // carries its reactive rank inline; a class z would reintroduce DOM-order
  // ties at rest).
  const settingsRule = canvasSheet.match(/\.canvas-settings-dock\s*\{[^}]*\}/)
  ok(settingsRule !== null, 'the .canvas-settings-dock rule exists')
  ok(!/z-index/.test(settingsRule[0]), '.canvas-settings-dock carries no z-index pin (the reactive rank owns stacking)')
})
