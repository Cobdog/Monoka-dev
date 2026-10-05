/** Labeled form primitives shared by the Create and Settings views.
 * Component vocabulary task 18 (k2q0n9s): both ride Field — the form tier
 * that owns the label association (htmlFor/id) and the error > hint >
 * silent description slot. Field derives the control id (useId) and clones
 * it onto the control; these wrappers now contribute only the control
 * wiring that is specific to each input type. */
import { StudioSelect } from '../ui/StudioSelect'
import { Field } from '../ui/Field'

export function SelectField({ label, value, options, onChange, disabled }: { label: string; value: string; options: string[][]; onChange(value: string): void; disabled?: boolean }) {
  return <Field label={label}><StudioSelect wrapClassName="select-wrap" chevronSize={15} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, text]) => <option value={optionValue} key={optionValue}>{text}</option>)}</StudioSelect></Field>
}

export function NumberField({ label, value, min, max, step, onChange, disabled }: { label: string; value: number; min: number; max: number; step?: number; onChange(value: number): void; disabled?: boolean }) {
  // The id/htmlFor association (review minor 2026-09-19) is Field's job now
  // — an id-less input fed the console's "form field without id/name" noise
  // and left the field unreachable by label for tests and assistive tech.
  return <Field label={label}><input className="number-input" type="number" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></Field>
}
