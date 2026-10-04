/** The layer-ownership registry (component vocabulary task 10, spec §0.2).
 *
 *  ONE mechanism for Escape across every layered surface — StudioDialog
 *  wrappers, hook overlays (task 14), popovers (task 16) — replacing the
 *  free-for-all where each surface's own window/document listener raced the
 *  others: an Escape over a stack of overlays used to close several at
 *  once, or the wrong one. The contract:
 *
 *    - layers register in open order; the LAST registered is the TOPMOST;
 *    - one Escape routes to the topmost registered layer ONLY;
 *    - removal is identity-keyed (two open layers may share an id string)
 *      and supports NON-TOP entries — a dialog closed from under a newer
 *      overlay must not corrupt the stack;
 *    - window-level Escape listeners participate through REGISTRATION, not
 *      independently (P05).
 *
 *  Double-Escape prevention: a ROUTED Escape is stopPropagation'd +
 *  preventDefault'd at window-CAPTURE, before any later listener can see
 *  it — Base UI's document-level dismissal (bubble phase on `document`)
 *  first among them. One keystroke takes exactly one dismissal path: the
 *  routed layer's onEscape. Un-routed paths are untouched: with an empty
 *  registry the event passes through (unregistered dialogs keep Base UI's
 *  own Escape handling), and outside-press never was this listener's
 *  business. Capture-at-window outruns every document/root/target listener
 *  regardless of attach order — that ordering proof is why the suppression
 *  lives here and not in each consumer.
 *
 *  Consequence: while a registered layer is topmost, Escape belongs to the
 *  registry alone. A surface nested INSIDE a registered layer that wants
 *  Escape for itself (a popover over a dialog) must register — that is the
 *  intended migration shape, not a regression.
 *
 *  `modal` is recorded for the layering consumers (task 11's z-band, task
 *  14's hook) — routing itself is always topmost, modal or not.
 *
 *  VM-harness discipline (tests/layerRegistry.test.js loads this module):
 *  no iterator spreads, no matchAll; `window` is touched only inside
 *  guarded functions or the probe gate below. */
export type LayerRegistration = {
  /** Debug/audit label. NOT a uniqueness key — removal is by registration identity. */
  id: string
  /** Layer metadata for the z-band/overlay consumers; routing ignores it. */
  modal?: boolean
  /** Invoked when the registry routes an Escape to this (topmost) layer.
   *  Declining (a busy guard) simply closes nothing — the event was still
   *  consumed by this layer. */
  onEscape(event: KeyboardEvent): void
}

/** The stack, bottom → top. Identity key = the registration object itself. */
const stack: LayerRegistration[] = []

/** The topmost registered layer, or null when none are registered. */
export function topmostLayer(): LayerRegistration | null {
  return stack.length > 0 ? stack[stack.length - 1] : null
}

/** Registration ids, bottom → top (probe/e2e visibility into the stack). */
export function layerIds(): string[] {
  return stack.map((entry) => entry.id)
}

/**
 * Registers a layer; returns its unregister function. Idempotent — a spent
 * handle never removes anyone else's entry.
 */
export function registerLayer(registration: LayerRegistration): () => void {
  stack.push(registration)
  ensureListener()
  let active = true
  return () => {
    if (!active) return
    active = false
    const index = stack.indexOf(registration)
    if (index !== -1) stack.splice(index, 1)
    if (stack.length === 0) releaseListener()
  }
}

/** Routes one keydown. Exported because it IS the global listener's
 *  handler — the node suite proves the wiring by dispatching through the
 *  attached listener and the contract by calling this directly. */
export function routeKeyDown(event: KeyboardEvent): void {
  if (!event || event.key !== 'Escape') return
  if (event.defaultPrevented) return // someone already owned this keystroke
  if (event.isComposing) return // IME composition owns Escape until it settles
  const topmost = topmostLayer()
  if (!topmost) return // no layers → no opinion; the event passes through untouched
  // Ownership transfer, before any handler can throw its way out of it:
  // stopping propagation here is what keeps Base UI's document-level Escape
  // dismissal (and every other later listener) from double-handling.
  event.stopPropagation()
  event.preventDefault()
  topmost.onEscape(event)
}

// ---- the ONE global listener ------------------------------------------------
// Lazy: attached on the first registration, detached when the stack drains.
// Exactly one listener no matter how many layers are open.

let listenerAttached = false

function ensureListener(): void {
  if (listenerAttached) return
  if (typeof window === 'undefined') return
  window.addEventListener('keydown', routeKeyDown, true)
  listenerAttached = true
}

function releaseListener(): void {
  if (!listenerAttached) return
  if (typeof window === 'undefined') return
  window.removeEventListener('keydown', routeKeyDown, true)
  listenerAttached = false
}

// ---- the e2e probe (?probe=layers) ------------------------------------------
// The TransientProbe compromise (src/state/transientProbe.ts): the e2e suite
// runs against the PRODUCTION build, so a dev-only handle could never be
// exercised there. Shipped but inert in every normal session — the query
// flag is the gate, zero cost when absent.

export const layerProbeEnabled =
  typeof window !== 'undefined'
  && typeof window.location !== 'undefined'
  && new URLSearchParams(window.location.search).get('probe') === 'layers'

if (layerProbeEnabled) {
  Object.defineProperty(window, '__studioLayerProbe', {
    configurable: true,
    value: { registerLayer, topmostLayer, layerIds },
  })
}
