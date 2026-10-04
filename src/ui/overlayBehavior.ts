/** overlayBehavior — the pure key-derivation model behind
 *  src/ui/useOverlayBehavior.ts (component vocabulary task 14, spec §0.2
 *  keyboard ownership). Which keydowns an open command surface keeps LOCAL,
 *  which belong to the app chrome above every layer, and the Tab-cycle wrap
 *  math that keeps focus contained in the panel — predicate math over plain
 *  event-shaped seeds, no DOM and no React (node-testable per P04:
 *  tests/overlay-behavior.test.js loads this module through the VM harness;
 *  the DOM behavior lives in the hook and is e2e-owned). */

export type KeySeed = {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}

/** Chrome chords belong to the app chrome ABOVE every overlay and pass
 *  through an open surface untouched: ⌘K toggles the palette itself (over a
 *  dialog — the supported stack since task 14 retired the interim hazard),
 *  Alt+digits switch surfaces, ⌘Z is per-surface undo. A bare Escape is NOT
 *  a chord — the layer registry owns Escape-class dismissal. */
export function isChromeChord(seed: KeySeed): boolean {
  return Boolean(seed.metaKey || seed.ctrlKey || seed.altKey)
}

/** The typing guard: a key from a text-entry target is the FIELD's, never
 *  the surface's — the same rule CanvasApp's background chain applies,
 *  restated where a surface's own local keys (the flip family's V first
 *  among them) must not fire while the user types. */
export function isTypingTarget(target: unknown): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null
  if (!element) return false
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || Boolean(element.isContentEditable)
}

/** Containment: a non-chrome keydown from inside an open panel is the
 *  SURFACE's own — it must not reach the window chain. The canvas's
 *  background shortcuts (first among the listeners there) never see a key
 *  pressed inside an open overlay; the surface's own handlers (the palette's
 *  arrows, the flip family's V) compose AFTER the hook's onKeyDown in the
 *  same handler and keep working. */
export function keepsKeyLocal(seed: KeySeed): boolean {
  return !isChromeChord(seed)
}

/** The Tab-cycle wrap target, or null when the browser's own Tab order
 *  should stand. `activeIndex` is the current focus's position among the
 *  panel's tabbables, -1 when focus sits outside them (on the panel itself
 *  or escaped) — then Tab pulls it back in from the matching end. */
export function tabCycleTarget(count: number, activeIndex: number, backwards: boolean): number | null {
  if (count <= 1) return null
  if (activeIndex < 0) return backwards ? count - 1 : 0
  if (backwards) return activeIndex === 0 ? count - 1 : null
  return activeIndex === count - 1 ? 0 : null
}
