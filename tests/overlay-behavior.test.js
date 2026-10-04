// overlayBehavior (component vocabulary task 14, Flux k2q0n9s) — the pure
// key-derivation model behind src/ui/useOverlayBehavior.ts (spec §0.2
// keyboard ownership): which keydowns an open command surface keeps LOCAL,
// which belong to the app chrome above every layer, which belong to a text
// field inside the surface, and the Tab-cycle wrap math that keeps focus
// contained in the panel. Node-appropriate by construction — the model is
// predicate math over plain event-shaped seeds, no DOM anywhere:
//
//   (a) chrome chords — ⌘K's palette toggle, Alt+digit surface switching,
//       ⌘Z undo ride ABOVE every overlay: they pass through untouched.
//   (b) the typing guard — a key from a text-entry target is the FIELD's,
//       never the surface's (CanvasApp's own guard restated for the
//       surfaces' local keys, the flip family's V first among them).
//   (c) containment — every NON-chrome keydown from inside an open panel
//       stays local to the surface: the window chain (the canvas's
//       background shortcuts first among them) never sees it.
//   (d) the Tab-cycle wrap — Tab/Shift+Tab wrap INSIDE the panel at the
//       ends; the middle passes through the browser's own order; a focus
//       that escaped the tabbables is pulled back in.
//
// The React binding (ref-attach registration, focusOnOpen's DOM query, the
// panel onKeyDown composition) is NOT this suite's business (vitest is
// node-env, P04): e2e/canvas.spec.ts owns it at the real consumers — the
// index/library/timeline projections.
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

const { isChromeChord, isTypingTarget, keepsKeyLocal, tabCycleTarget } = loadTs('src/ui/overlayBehavior.ts')

const key = (over = {}) => ({ key: 'v', ...over })

// ---- (a) chrome chords --------------------------------------------------------

test('(a) chrome chords pass above every overlay', () => {
  eq(isChromeChord(key({ metaKey: true })), true, '⌘-modified keys are chrome\'s (⌘K toggles the palette itself)')
  eq(isChromeChord(key({ ctrlKey: true })), true, 'ctrl-modified keys are chrome\'s')
  eq(isChromeChord(key({ altKey: true })), true, 'alt-modified keys are chrome\'s (the surface switcher\'s Alt+digits)')
  eq(isChromeChord(key({ key: 'Escape' })), false, 'a bare Escape is NOT a chord — the registry owns it')
  eq(isChromeChord(key()), false, 'a plain key is not a chord')
})

// ---- (b) the typing guard -----------------------------------------------------

test('(b) keys from text-entry targets belong to the field, never the surface', () => {
  eq(isTypingTarget({ tagName: 'INPUT' }), true, 'an input\'s keys are the field\'s')
  eq(isTypingTarget({ tagName: 'TEXTAREA' }), true, 'a textarea\'s keys are the field\'s')
  eq(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true, 'a contentEditable\'s keys are the field\'s')
  eq(isTypingTarget({ tagName: 'BUTTON' }), false, 'a button\'s keys are the surface\'s to interpret')
  eq(isTypingTarget({ tagName: 'DIV' }), false, 'a plain container\'s keys are the surface\'s')
  eq(isTypingTarget(null), false, 'no target (window-level dispatch) is not typing')
})

// ---- (c) containment ----------------------------------------------------------

test('(c) non-chrome keydowns stay local to the open surface', () => {
  eq(keepsKeyLocal(key()), true, 'a plain key pressed inside the panel is the surface\'s own')
  eq(keepsKeyLocal(key({ key: 'ArrowDown' })), true, 'arrows are local (the palette\'s navigation)')
  eq(keepsKeyLocal(key({ key: 'Tab', shiftKey: true })), true, 'Tab is local (the panel\'s own cycle)')
  eq(keepsKeyLocal(key({ key: 'b' })), true, 'single-letter canvas keys die inside the surface — the background chain never sees them')
  eq(keepsKeyLocal(key({ metaKey: true })), false, 'a chrome chord passes through to the window chain')
  eq(keepsKeyLocal(key({ ctrlKey: true, key: 'k' })), false, '⌘K passes through — summoning the palette over a dialog is the supported stack')
})

// ---- (d) the Tab-cycle wrap ---------------------------------------------------

test('(d) Tab wraps inside the panel at the ends; the middle passes through', () => {
  eq(tabCycleTarget(0, -1, false), null, 'no tabbables — nothing to wrap (the panel itself holds focus)')
  eq(tabCycleTarget(1, 0, false), null, 'one tabbable cannot wrap')
  eq(tabCycleTarget(4, 0, true), 3, 'Shift+Tab at the first wraps to the last')
  eq(tabCycleTarget(4, 3, false), 0, 'Tab at the last wraps to the first')
  eq(tabCycleTarget(4, 1, false), null, 'Tab mid-list takes the browser\'s own order')
  eq(tabCycleTarget(4, 2, true), null, 'Shift+Tab mid-list takes the browser\'s own order')
  eq(tabCycleTarget(4, -1, false), 0, 'a focus outside the tabbables is pulled in from the front')
  eq(tabCycleTarget(4, -1, true), 3, 'a focus outside the tabbables is pulled in from the back on Shift+Tab')
})

// ---- module shape -------------------------------------------------------------

test('the pure model exports exactly the derivation surface', () => {
  ok(typeof isChromeChord === 'function', 'isChromeChord is exported as a function')
  ok(typeof isTypingTarget === 'function', 'isTypingTarget is exported as a function')
  ok(typeof keepsKeyLocal === 'function', 'keepsKeyLocal is exported as a function')
  ok(typeof tabCycleTarget === 'function', 'tabCycleTarget is exported as a function')
})
