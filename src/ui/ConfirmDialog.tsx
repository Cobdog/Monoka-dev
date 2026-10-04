/** ConfirmDialog — the studio's shared consent surface (component vocabulary
 *  task 15, spec §2.1/§0.6, Flux k2q0n9s): the ×7 native window.confirm
 *  sites' replacement. Behavior is entirely the shared dialog stack's —
 *  StudioDialogLayered (Base UI focus trap/restore + outside-press, the §0.2
 *  registry routing Escape topmost-only) — and the one contract this
 *  component adds is the RESOLVE: onResolve(true) fires only from the
 *  confirm action; Escape, outside-press and Cancel all resolve false. No
 *  dismissal path bypasses the callback (the manifest's "×-handler
 *  ownership": the close handler IS the resolve contract).
 *
 *  P06 fully (a shared component): tone rides the Button recipes — `danger`
 *  swaps the confirm action to the danger variant, nothing else — and this
 *  module owns no state; the consumer holds the ask and unmounts on resolve
 *  (mount-conditioned, the CaptionPanel/CropEditor idiom).
 */
import type { ReactNode } from 'react'
import { StudioDialogLayered } from './StudioDialogLayered'
import { Button } from './Button'

export type ConfirmDialogProps = {
  /** Registry identity — distinct per consumer site (§0.2); also names the
   *  title/body ids so stacked dialogs never collide on them. */
  layerId: string
  title: string
  /** The blast radius / consent copy. Strings render pre-line (newlines
   *  carry, the native confirm's formatting). */
  body: ReactNode
  /** Destructive framing: the confirm action renders the danger recipe. */
  danger?: boolean
  /** The one resolution: true only from the confirm action. */
  onResolve(ok: boolean): void
}

export function ConfirmDialog({ layerId, title, body, danger = false, onResolve }: ConfirmDialogProps) {
  return (
    <StudioDialogLayered
      layerId={layerId}
      open
      onClose={() => onResolve(false)}
      popupClassName="confirm-dialog"
      labelledBy={`${layerId}-title`}
      describedBy={`${layerId}-body`}
    >
      <h2 id={`${layerId}-title`} className="confirm-dialog-title">{title}</h2>
      <div id={`${layerId}-body`} className="confirm-dialog-body">{body}</div>
      <div className="confirm-dialog-actions">
        <Button variant="secondary" className="confirm-dialog-btn" onClick={() => onResolve(false)}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} className="confirm-dialog-btn" onClick={() => onResolve(true)}>Confirm</Button>
      </div>
    </StudioDialogLayered>
  )
}
