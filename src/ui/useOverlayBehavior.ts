/** useOverlayBehavior — registry participation + focus/keyboard discipline
 *  for hand-rolled positioned surfaces (component vocabulary task 14, spec
 *  §0.2). The canvas command surfaces (index/library/timeline palettes and
 *  their nested menus) are NOT Base UI dialogs — StudioDialogLayered is the
 *  wrong shape for them — but they join the ONE Escape mechanism all the
 *  same: the hook registers the surface's panel with the layer registry
 *  (src/ui/layerRegistry.ts) while it is mounted, so a routed Escape closes
 *  exactly the topmost layer and every surface beneath survives the press.
 *
 *  The contract, per piece of the returned triple:
 *
 *    - `ref` goes on the overlay's PANEL element. The panel's mount IS the
 *      registration (open surfaces render their panel; closing unmounts it),
 *      mirroring StudioDialogLayered's mount-conditioned `open` pattern —
 *      identity-keyed, non-top removal included. The registered onDismiss
 *      reads through a ref, so parent re-renders (inline closures get fresh
 *      identities every render) never re-register the layer mid-stack.
 *    - `onKeyDown` goes on the same panel. Tab cycles INSIDE the panel
 *      (settled containment — focus cannot escape the surface by keyboard,
 *      including at the cardinality edges, C02: one tabbable cycles back to
 *      itself, zero keep focus on the panel), and every NON-chrome key stays
 *      local: the window chain — the canvas's background shortcuts first
 *      among them — never sees a key pressed inside an open overlay (§0.2
 *      "background canvas shortcuts cannot fire through a modal"). Chrome
 *      chords (⌘K's own toggle, Alt+digits, ⌘Z) pass through untouched.
 *      Compose the surface's OWN keys after this in the same handler — the
 *      palette's arrows stay the palette's, and the flip family's V calls
 *      cycleProjection locally (the registry owns Escape-class dismissal
 *      only, never navigation).
 *    - `focusOnOpen()` the consumer calls from its open effect: focus moves
 *      INTO the surface — the first text field when it has one, the panel
 *      itself otherwise (tabIndex -1). On close, focus returns to the
 *      layer's opener when it never legitimately left the panel (§0.2's
 *      restore target); a focus that moved elsewhere (the row activation
 *      that navigates, a click on the canvas) is never hijacked back.
 *
 *  `modal` (default true — command surfaces own the keyboard) is recorded on
 *  the registration for the layering consumers: task 11's z-band reads it,
 *  and CanvasApp's background chain suspends while anyModalLayer() holds.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { anyModalLayer, registerLayer } from './layerRegistry'
import { keepsKeyLocal, tabCycleTarget, type KeySeed } from './overlayBehavior'

export type UseOverlayBehaviorOptions = {
  /** Registry identity — a debug/audit label, NOT a uniqueness key (two open
   *  layers may share it; removal is by registration identity). Pass a
   *  STABLE value (a literal): the registration rides the panel's mount and
   *  a changed id re-keys it. */
  id: string
  /** The layer's dismissal. May DECLINE (a busy guard simply closes nothing)
   *  — the registry's documented contract (layerRegistry.ts). */
  onDismiss(): void
  /** Recorded for the layering consumers (the §0.1 z-band; CanvasApp's
   *  background-shortcut suspension). Command surfaces are modal by nature. */
  modal?: boolean
}

export type OverlayBehavior = {
  ref: (node: HTMLDivElement | null) => void
  onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void
  focusOnOpen(): void
  /** True while this surface registers ABOVE an already-registered MODAL
   *  layer (V01, the 2026-10-05 Codex audit): the consumer's paint must sit
   *  above that layer's --z-modal band — PopoverMenu's backdrop composes
   *  its over-modal modifier from this. Read at registration, before this
   *  layer joins the stack, so it names the layers BENEATH this one. */
  overModal: boolean
}

/** The panel's tabbables in DOM order (the Tab cycle's domain). */
const TABBABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** The entry field focusOnOpen targets — text entry first (a palette's
 *  search input is its primary interaction); layout surfaces fall back to
 *  the panel itself. */
const ENTRY_FIELD_SELECTOR = 'input:not([disabled]), textarea:not([disabled])'

export function useOverlayBehavior({ id, onDismiss, modal = true }: UseOverlayBehaviorOptions): OverlayBehavior {
  // The imperative view (always fresh, read inside stable callbacks) plus
  // the STATE view whose null→node transition drives the registration
  // effect's lifecycle. Both are set by the same callback ref, which must
  // keep a stable identity: React re-invokes a CHANGED callback ref
  // (detach+attach), which would unregister/re-register the layer and hop it
  // back to the top of the stack mid-flight. The OPENER is captured in the
  // same callback (mutation phase) — before any effect runs — because the
  // consumer's open effect (focusOnOpen) runs on an EARLIER commit than this
  // hook's [node] effect; capturing in the effect would record the overlay's
  // own freshly-focused field as the "opener".
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  // Paint-order ownership (V01): whether modal layers sit BENEATH this one in
  // the registry stack — computed at registration, before this layer pushes.
  const [overModal, setOverModal] = useState(false)

  // The dismissal reads through a ref — inline closures churn identity every
  // render, and re-registering on each would reorder the stack (the
  // StudioDialogLayered idiom, same reason).
  const onDismissRef = useRef(onDismiss)
  useEffect(() => { onDismissRef.current = onDismiss })

  const ref = useCallback((next: HTMLDivElement | null) => {
    if (next) openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    nodeRef.current = next
    setNode(next)
  }, [])

  // Register on panel mount, unregister on unmount.
  useEffect(() => {
    if (!node) return undefined
    // Read BEFORE this registration pushes: the flag names the modal layers
    // already beneath this one (the dialog this surface opened over).
    setOverModal(anyModalLayer())
    const unregister = registerLayer({ id, modal, onEscape: () => onDismissRef.current() })
    return () => {
      unregister()
      // Restore target = the layer's opener (§0.2) — but only when focus
      // never legitimately left the closing panel. Unmount order: the
      // focused child dies BEFORE this cleanup runs, so activeElement falls
      // to <body> — that is focus dying WITH the panel, the restore case. A
      // focus that moved to some other element (a click that navigated, a
      // programmatic move) is legitimate and never hijacked back.
      const active = document.activeElement
      const diedWithPanel = active === null || active === document.body
      const stillInside = active instanceof HTMLElement && (active === node || node.contains(active))
      const opener = openerRef.current
      if (opener && opener.isConnected && (diedWithPanel || stillInside)) {
        opener.focus()
      }
    }
  }, [node, id, modal])

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    // Chrome chords pass through untouched (isChromeChord via keepsKeyLocal).
    const seed: KeySeed = event
    if (!keepsKeyLocal(seed)) return
    const panel = nodeRef.current
    if (event.key === 'Tab' && panel) {
      const tabbables = Array.from(panel.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR))
      const activeIndex = tabbables.indexOf(document.activeElement as HTMLElement)
      const target = tabCycleTarget(tabbables.length, activeIndex, event.shiftKey)
      if (target !== null) {
        event.preventDefault()
        if (target >= 0) {
          tabbables[target].focus()
        } else {
          // -1 (C02): no tabbables — the panel itself holds the keystroke.
          panel.tabIndex = -1
          panel.focus()
        }
      }
    }
    // Local keys stay local — the window chain never sees them.
    event.stopPropagation()
  }, [])

  const focusOnOpen = useCallback(() => {
    const panel = nodeRef.current
    if (!panel) return
    const field = panel.querySelector<HTMLElement>(ENTRY_FIELD_SELECTOR)
    if (field) {
      field.focus()
      return
    }
    // No entry field: the panel itself holds focus (tabIndex -1 — focusable,
    // not tabbable; the Tab cycle pulls out of it into the first tabbable).
    panel.tabIndex = -1
    panel.focus()
  }, [])

  return { ref, onKeyDown, focusOnOpen, overModal }
}
