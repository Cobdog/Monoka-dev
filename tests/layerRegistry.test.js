// layerRegistry (component vocabulary task 10, Flux k2q0n9s) — the pure
// mechanics of the layer-ownership registry behind src/ui/layerRegistry.ts
// (spec §0.2 keyboard ownership: ONE mechanism spanning StudioDialog
// wrappers, hook overlays, and popovers). Node-appropriate by construction —
// the registry is a module-level stack plus ONE window keydown listener, so
// the routing/attach mechanics are provable against a fake window with no
// browser anywhere:
//
//   (a) stack order — registration pushes onto the top; topmostLayer() and
//       layerIds() read it back bottom→top. Nothing attaches a global
//       listener before the first registration (lazy: zero cost when the
//       app opens no layers).
//   (b) NON-TOP removal — unregistering a middle entry keeps the remaining
//       order intact (the r2 contract: removal supports entries that are
//       not the topmost — a stacked dialog closed out from under a newer
//       one must never corrupt the stack).
//   (c) identity keying — the registry keys by REGISTRATION IDENTITY (the
//       entry object), not the id string: two open layers may share an id
//       (two prompts of the same kind) and each unregister removes exactly
//       its own; re-registration lands at the TOP (recency), never at a
//       remembered position.
//   (d) idempotent unregister — a spent handle is a no-op; calling it twice
//       cannot take someone else's entry out.
//   (e) routing — one Escape routes to the TOPMOST registered layer ONLY
//       (nobody else's onEscape fires); non-Escape keys, already-prevented
//       events, and IME-composing keys are never routed.
//   (f) the suppression contract (double-Escape prevention) — a ROUTED
//       Escape is stopPropagation'd AND preventDefault'd at window-capture:
//       every later listener — Base UI's document-level dismissal first
//       among them — never sees it, so one keystroke takes exactly one
//       dismissal path (the routed layer's onEscape). An UNROUTED Escape
//       (empty registry) is passed through untouched: plain dialogs keep
//       Base UI's own paths, and outside-press is not this listener's
//       business at all.
//   (g) the ONE global listener — first registration attaches exactly one
//       window keydown CAPTURE listener; further registrations attach
//       nothing; the last unregister detaches it. Dispatching a keydown
//       through the fake window routes to the topmost layer (the attached
//       listener IS the router).
//   (h) the probe gate — `?probe=layers` binds window.__studioLayerProbe
//       (registerLayer/topmostLayer/layerIds) for the e2e suite — the
//       TransientProbe compromise: shipped but inert in every normal
//       session.
//
// Browser behavior (the StudioDialogLayered wrapper registering on open,
// Base UI suppression against the real Dialog, focus restore) is NOT this
// suite's business (vitest is node-env, P04): e2e/app.spec.ts owns it at
// the real consumer (PromptLibraryBrowser).
import { test } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const assert = require('node:assert/strict')

const { loadTs } = require('../scripts/lib/ts-vm.cjs')

const ok = (condition, label) => assert.ok(condition, label)

function eq(actual, expected, label) {
  assert.equal(actual, expected, label)
  console.log(`  ok - ${label}`)
}

// ---- the fake window (attach/detach record + dispatch) -----------------------
//
// One instance for the whole suite: the VM harness caches the module after
// the first load, so the registry sees this window for its lifetime — the
// same relationship the real module has with the real window.

class FakeWindow {
  constructor(search = '') {
    this.location = { search }
    this.listeners = []
  }

  addEventListener(type, handler, capture) {
    this.listeners.push({ type, handler, capture: capture === true })
  }

  removeEventListener(type, handler, capture) {
    const normalized = capture === true
    this.listeners = this.listeners.filter(
      (entry) => !(entry.type === type && entry.handler === handler && entry.capture === normalized),
    )
  }

  keydownListenerCount() {
    return this.listeners.filter((entry) => entry.type === 'keydown').length
  }

  /** Dispatches a keydown through the recorded listeners (the browser's
   *  reachability order does not matter here — capture-vs-bubble is a
   *  separate assertion). Reports whether the event was stopped/prevented. */
  dispatchKey(key, options = {}) {
    const report = { stopped: false, prevented: false }
    const event = {
      key,
      defaultPrevented: Boolean(options.defaultPrevented),
      isComposing: Boolean(options.isComposing),
      stopPropagation() { report.stopped = true },
      preventDefault() { report.prevented = true },
    }
    for (const entry of this.listeners) {
      if (entry.type === 'keydown') entry.handler(event)
    }
    return report
  }
}

const fakeWindow = new FakeWindow('?probe=layers')
const layerRegistry = loadTs('src/ui/layerRegistry.ts', { window: fakeWindow })
const { registerLayer, topmostLayer, layerIds, routeKeyDown, anyModalLayer } = layerRegistry

const ids = () => layerIds().join('|')
const topmostId = () => {
  const topmost = topmostLayer()
  return topmost ? topmost.id : '(none)'
}

/** A counting stand-in layer. */
const layer = (id, modal = false) => {
  const calls = []
  const unregister = registerLayer({ id, modal, onEscape: () => { calls.push(id) } })
  return { id, calls, unregister }
}

/** A routed-or-not fake keydown for direct routeKeyDown() calls. */
const keyEvent = (key, options = {}) => {
  const report = { stopped: false, prevented: false }
  return {
    key,
    defaultPrevented: Boolean(options.defaultPrevented),
    isComposing: Boolean(options.isComposing),
    stopPropagation() { report.stopped = true },
    preventDefault() { report.prevented = true },
    report,
  }
}

// ---- (a) stack order + lazy attach ------------------------------------------

test('(a) registration stacks bottom→top; nothing attaches before the first', () => {
  eq(fakeWindow.keydownListenerCount(), 0, 'no global keydown listener before any registration (lazy attach)')
  const a = layer('a')
  const b = layer('b', true)
  eq(ids(), 'a|b', 'layerIds reads the stack bottom→top')
  eq(topmostId(), 'b', 'topmostLayer is the LAST registered')
  eq(topmostLayer().modal, true, 'the registration is stored as given (modal flag included)')
  a.unregister()
  b.unregister()
  eq(ids(), '', 'unregister drains the stack')
  eq(topmostId(), '(none)', 'topmostLayer of an empty registry is null')
})

// ---- (b) NON-TOP removal ------------------------------------------------------

test('(b) removing a non-top entry keeps the remaining order intact', () => {
  const a = layer('a')
  const b = layer('b')
  const c = layer('c')
  b.unregister() // the middle entry — NOT the top
  eq(ids(), 'a|c', 'a middle unregister removes exactly its own entry')
  eq(topmostId(), 'c', 'the top is untouched by a non-top removal')
  c.unregister() // now the top
  eq(topmostId(), 'a', 'unregistering the top promotes the one below (nested layers unwind topmost-first)')
  a.unregister()
  eq(ids(), '', 'the stack is empty again')
})

// ---- (c) identity keying -------------------------------------------------------

test('(c) the key is registration identity, not the id string', () => {
  const first = layer('same-id')
  const second = layer('same-id')
  eq(ids(), 'same-id|same-id', 'two open layers may share an id (identity, not string uniqueness)')
  first.unregister()
  eq(ids(), 'same-id', 'the FIRST handle removed the FIRST registration only')
  eq(topmostId(), 'same-id', 'the second same-id registration survives as topmost')
  second.unregister()

  // Re-registration lands at the top (recency), never at a remembered slot.
  const a = layer('a')
  const b = layer('b')
  a.unregister()
  const aAgain = layer('a')
  eq(ids(), 'b|a', 'a re-registered layer becomes the topmost (recency order)')
  aAgain.unregister()
  b.unregister()
})

// ---- (d) idempotent unregister -------------------------------------------------

test('(d) a spent unregister handle is a no-op', () => {
  const a = layer('a')
  const b = layer('b')
  a.unregister()
  a.unregister() // double-spend must not reach into the live stack
  eq(ids(), 'b', 'a double unregister removes nothing beyond its own entry')
  b.unregister()
})

// ---- (e) routing: topmost only, Escape only -------------------------------------

test('(e) one Escape routes to the topmost layer ONLY', () => {
  const a = layer('a')
  const b = layer('b')
  routeKeyDown(keyEvent('Escape'))
  eq(b.calls.join('|'), 'b', 'the topmost layer received the Escape')
  eq(a.calls.join('|'), '', 'no other layer was invoked')
  routeKeyDown(keyEvent('Enter'))
  eq(b.calls.length, 1, 'non-Escape keys are never routed')
  const prevented = keyEvent('Escape', { defaultPrevented: true })
  routeKeyDown(prevented)
  eq(b.calls.length, 1, 'an already-prevented Escape is left to whoever prevented it')
  eq(prevented.report.stopped, false, '... and is not stopped by the registry')
  routeKeyDown(keyEvent('Escape', { isComposing: true }))
  eq(b.calls.length, 1, 'an IME-composing Escape is never routed (Base UI discipline)')
  a.unregister()
  b.unregister()
})

// ---- (f) the suppression contract ------------------------------------------------

test('(f) a routed Escape is stopped+prevented; an unrouted one passes through', () => {
  // Empty registry: the registry has NO opinion — plain (unregistered)
  // dialogs keep Base UI's own Escape path.
  const unrouted = keyEvent('Escape')
  routeKeyDown(unrouted)
  eq(`${unrouted.report.stopped}|${unrouted.report.prevented}`, 'false|false', 'no layers → nothing routed, event untouched')

  // Routed: the keystroke now belongs to the topmost layer ALONE. The
  // window-capture stop is what keeps Base UI's document-level dismissal
  // from ALSO firing — the double-Escape prevention, one keystroke → one
  // dismissal path.
  const a = layer('a')
  const routed = keyEvent('Escape')
  routeKeyDown(routed)
  eq(`${routed.report.stopped}|${routed.report.prevented}`, 'true|true', 'a routed Escape is stopPropagation\'d AND preventDefault\'d')
  eq(a.calls.length, 1, '... and was delivered to the topmost layer')
  a.unregister()
})

// ---- (g) the ONE global listener ---------------------------------------------------

test('(g) exactly one window keydown CAPTURE listener, attached on first register', () => {
  const a = layer('a')
  const b = layer('b')
  const c = layer('c')
  eq(fakeWindow.keydownListenerCount(), 1, 'one global listener regardless of layer count')
  const attached = fakeWindow.listeners.find((entry) => entry.type === 'keydown')
  ok(attached, 'the keydown listener exists')
  eq(String(attached.capture), 'true', 'the listener is CAPTURE phase (window-capture outruns document listeners — the suppression mechanism)')

  // The attached listener IS the router: dispatch through the window.
  const report = fakeWindow.dispatchKey('Escape')
  eq(c.calls.length, 1, 'a window-dispatched Escape reaches the topmost layer through the attached listener')
  eq(a.calls.length, 0, '... and nobody below it')
  eq(`${report.stopped}|${report.prevented}`, 'true|true', '... with the suppression contract intact')

  a.unregister()
  b.unregister()
  c.unregister()
  eq(fakeWindow.keydownListenerCount(), 0, 'the last unregister detaches the global listener (zero standing cost)')
})

// ---- (h) the probe gate -------------------------------------------------------------

test('(h) ?probe=layers binds the e2e probe; the gate stays a query flag', () => {
  const probe = fakeWindow.__studioLayerProbe
  ok(probe, 'window.__studioLayerProbe is bound under ?probe=layers')
  eq(typeof probe.registerLayer, 'function', 'the probe exposes registerLayer')
  eq(typeof probe.topmostLayer, 'function', 'the probe exposes topmostLayer')
  eq(typeof probe.layerIds, 'function', 'the probe exposes layerIds')
  const a = layer('a')
  eq(probe.layerIds().join('|'), 'a', 'the probe reads the SAME registry the app uses')
  a.unregister()
})

// ---- (i) the modal suspension derivation (task 14) ---------------------------------

test('(i) anyModalLayer — the background-shortcut suspension derivation (§0.2)', () => {
  eq(anyModalLayer(), false, 'no modal layer while the stack is empty — the canvas background chain is live')
  const plain = layer('plain')
  eq(anyModalLayer(), false, 'a non-modal layer alone does not suspend the background chain')
  const nested = layer('nested')
  const modal = layer('modal', true)
  eq(anyModalLayer(), true, 'a modal layer anywhere in the stack suspends it (the command overlays carry the flag)')
  nested.unregister()
  eq(anyModalLayer(), true, 'a non-top modal layer keeps the suspension (any-modal, not topmost-modal)')
  modal.unregister()
  eq(anyModalLayer(), false, 'unregistering the modal layer releases the suspension')
  plain.unregister()
  eq(anyModalLayer(), false, 'the stack is quiet again')
})
