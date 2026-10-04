/** StudioDialogLayered — StudioDialog's participation in the layer registry
 *  (component vocabulary task 10, spec §0.2).
 *
 *  The wrapper every registry-participating dialog uses: it registers the
 *  dialog as a layer while open and unregisters on close/unmount, so the
 *  ONE global window listener (src/ui/layerRegistry.ts) can route Escape to
 *  the topmost layer — this dialog when it IS the topmost, someone above it
 *  (a hook overlay, a popover) when it is not. Nested layers then unwind
 *  topmost-first instead of racing each other.
 *
 *  Double-Escape prevention: a ROUTED Escape is stopped at window-capture
 *  by the registry — Base UI's own document-level dismissal never sees that
 *  keystroke, so exactly one dismissal path runs (this layer's registered
 *  onEscape → onClose). The suppression is per-routed-event and lives in
 *  the registry because window-capture outruns document listeners whatever
 *  the attach order; a keystroke the registry does NOT route (no layers
 *  open) reaches Base UI untouched, and outside-press — never this
 *  listener's business — keeps Base UI's path as before. StudioDialog
 *  itself is unmodified.
 */
import { useEffect, useRef } from 'react'
import { StudioDialog, type StudioDialogProps } from './StudioDialog'
import { registerLayer } from './layerRegistry'

export type StudioDialogLayeredProps = StudioDialogProps & {
  /** Registry identity — a debug/audit label, NOT a uniqueness key (two
   *  open layers may share it; removal is by registration identity). */
  layerId: string
  /** Recorded on the registration for the layering consumers (task 11's
   *  z-band, task 14's overlay hook). StudioDialog is modal by nature, so
   *  the default is true. */
  modal?: boolean
}

export function StudioDialogLayered({ layerId, modal = true, open, onClose, ...dialog }: StudioDialogLayeredProps) {
  // The registration must not churn on parent re-renders: consumers pass
  // inline onClose closures (a fresh identity every render), and
  // re-registering on each one would hop the layer back to the TOP of the
  // stack mid-flight — wrong whenever something newer sits above. The
  // registered onEscape reads through a ref instead.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // Register on open, unregister on close/unmount. The unregister handle is
  // the effect's cleanup, so an open→false transition (or unmount while
  // open) takes the layer out of the stack — identity-keyed, non-top
  // removal included.
  useEffect(() => {
    if (!open) return undefined
    return registerLayer({ id: layerId, modal, onEscape: () => onCloseRef.current() })
  }, [open, layerId, modal])

  return <StudioDialog open={open} onClose={onClose} {...dialog} />
}
