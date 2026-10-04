/** PromptDialog — the studio's shared ask-for-a-string surface (component
 *  vocabulary task 15, spec §2.1/§0.6, Flux k2q0n9s): the ×4 native
 *  window.prompt sites' replacement, on the same shared dialog stack as
 *  ConfirmDialog (StudioDialogLayered: Base UI focus trap/restore +
 *  outside-press, §0.2 registry Escape).
 *
 *  The outcome contract (CV12, the spec's §0.6 distinction) is HARD:
 *  onResolve(null) = cancelled (Escape, outside-press, Cancel — the caller
 *  ABORTS, state untouched); onResolve('') = submitted-empty (the user
 *  pressed Enter/OK on an empty field — the caller APPLIES the empty value,
 *  e.g. the batch site's default-batch run). Never coalesce the two: the
 *  retired `?? ''` at the batch site silently executed the default batch on
 *  cancel — the silent-loss class this distinction exists to prevent.
 *
 *  The input contract agrees with Field (label→control association via
 *  htmlFor; no error/hint layer here — callers surface refusals). Enter
 *  submits through the form; the field is the first tabbable so Base UI's
 *  initial focus lands in it.
 */
import { useState, type ReactNode } from 'react'
import { StudioDialogLayered } from './StudioDialogLayered'
import { Button } from './Button'

export type PromptDialogProps = {
  /** Registry identity — distinct per consumer site (§0.2); also names the
   *  title/input ids so stacked dialogs never collide on them. */
  layerId: string
  title: string
  /** The field's label (what the string IS, including any guidance). */
  label: ReactNode
  /** Prefills the field. */
  initial?: string
  /** The one resolution: null = cancelled, '' = submitted-empty. */
  onResolve(value: string | null): void
}

export function PromptDialog({ layerId, title, label, initial = '', onResolve }: PromptDialogProps) {
  const [value, setValue] = useState(initial)
  return (
    <StudioDialogLayered
      layerId={layerId}
      open
      onClose={() => onResolve(null)}
      popupClassName="prompt-dialog"
      labelledBy={`${layerId}-title`}
    >
      <h2 id={`${layerId}-title`} className="confirm-dialog-title">{title}</h2>
      <form
        className="prompt-dialog-form"
        onSubmit={(event) => {
          event.preventDefault()
          onResolve(value)
        }}
      >
        <label className="prompt-dialog-label" htmlFor={`${layerId}-input`}>{label}</label>
        <input
          id={`${layerId}-input`}
          className="prompt-dialog-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
        />
        <div className="confirm-dialog-actions">
          <Button variant="secondary" className="confirm-dialog-btn" type="button" onClick={() => onResolve(null)}>Cancel</Button>
          <Button variant="primary" className="confirm-dialog-btn" type="submit">OK</Button>
        </div>
      </form>
    </StudioDialogLayered>
  )
}
