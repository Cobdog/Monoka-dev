/**
 * The walk's designation row (wizard rework spec §2.2/§2.3, audit W-C1,
 * ruling D7): one engine-side destination — label, the absolute path, a
 * Verify button, and the existence verdict inline. Consumed by the Models
 * step (models root) and the Packs step (external custom-nodes folder).
 *
 * Deliberately wizard-local and NOT shared with Settings: Settings keeps its
 * own save-with-warning path rows (a different contract — the field there
 * still saves a missing path with a note; here the walk gates on verified
 * existence). No forced coupling; smallest change (modularity contract).
 *
 * The verdict text is honest about the studio's limit: `verifyDesignation`
 * stats the disk the studio runs on (same machine / shared storage) — the
 * component renders that limit as part of the refusal, never hides it.
 */
import { useState } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { Button } from '../ui/Button'
import { setDestinationValue, verifyDestination, type DestinationState } from './wizardWalk'

export type DesignationFieldProps = {
  /** Stable id for the label/input association and the data hook. */
  id: string
  label: string
  /** The "why" — the question the designation answers (D7: shown at the
   *  point of use, e.g. "Where should fetched weights land so your engine
   *  sees them?"). */
  question: string
  /** The prefill hint line (what was prefilled and from where, or why the
   *  prefill is empty — honesty at the point of use). */
  hint?: string
  placeholder?: string
  state: DestinationState
  onChange(next: DestinationState): void
}

export function DesignationField({ id, label, question, hint, placeholder, state, onChange }: DesignationFieldProps) {
  const [busy, setBusy] = useState(false)
  const verdict = state.verdict

  const verify = async () => {
    setBusy(true)
    try {
      onChange(await verifyDestination(state))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="canvas-wizard-row canvas-wizard-designation" data-wizard-designation={id}>
      <label htmlFor={id}>{label}</label>
      <p className="canvas-wizard-lede">{question}</p>
      <div className="canvas-wizard-designation-controls">
        <input
          id={id}
          data-wizard-designation-input={id}
          value={state.value}
          placeholder={placeholder ?? '/absolute/path/to/directory — or C:\\path\\to\\directory'}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onChange(setDestinationValue(state, event.target.value))}
        />
        <Button variant="ghost" className="chip canvas-chip" size={12} busy={busy} data-wizard-designation-verify={id} onClick={() => void verify()}>
          Verify
        </Button>
      </div>
      {hint && <span className="canvas-wizard-hint">{hint}</span>}
      {verdict && (verdict.designated
        ? <p className="canvas-wizard-ok" data-wizard-designation-verdict={id} data-verdict="exists"><Check size={13} /> Directory found — actions on this step can use it.</p>
        : <p className="canvas-wizard-warn" data-wizard-designation-verdict={id} data-verdict="refused"><AlertCircle size={13} /> {verdict.reason}</p>)}
      {!verdict && !busy && <p className="canvas-wizard-hint" data-wizard-designation-unverified={id}>Not verified yet — rows that need this destination stay refused until it verifies.</p>}
    </div>
  )
}
