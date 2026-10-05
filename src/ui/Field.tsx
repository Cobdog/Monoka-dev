/**
 * Field — the studio's form-field association tier (component vocabulary
 * task 18, spec §2.1, Flux k2q0n9s): the label→control association
 * (htmlFor/id, the established convention form.tsx/PromptDialog already
 * follow) plus the ONE description slot with precedence —
 *
 *   error > hint > silent
 *
 * When an error is present it wins the description slot (and carries the
 * error tone); a hint shows only when no error is; neither shows when both
 * are absent — and in that silent state the control carries NO
 * aria-describedby at all (never a dangling id ref). The wiring is REAL:
 * Field clones the control (children) carrying the description element's
 * id in its aria-describedby, MERGED into any refs the consumer already
 * set (fieldDescribedBy — legal multi-ref ARIA, never clobbered), and the
 * label's htmlFor resolves to the control's id — the child's own id if it
 * has one, else htmlFor, else a useId derivation (in that order; the
 * child's id is ground truth, so a disagreeing htmlFor dev-warns).
 *
 * P06, the doctrine Button/Chip/StudioSelect set: the recipe carries the
 * field chrome — the wrapper IS the house `.field-group` form tier (grid
 * flow + label styling, unchanged) and the description's tone/type
 * (`.field-description`, muted; `--error`, danger). Widths, layouts, and
 * the surface's own control chrome stay with consumers: the geometry class
 * rides `className` alongside, and the control keeps whatever classes it
 * carried (`.ds-caption-textarea`, `.number-input`, …). The description
 * CONTENT is the consumer's ReactNode — hooks like the caption validation
 * list's data attributes ride it verbatim.
 *
 * children MUST be a single element (the control) — a DOM element, or a
 * component that spreads onto one (StudioSelect spreads id and
 * aria-describedby onto its native <select>). Fragments, arrays, and text
 * cannot carry the wiring; that shape dev-warns instead of silently
 * dropping it (fieldWarnFor, node-tested). Documented siblings a Field
 * used to wrap (e.g. a datalist) associate by attribute (list=) and belong
 * outside.
 *
 * Scope note (T15's agreement, kept): PromptDialog's minimal shape stays —
 * it associates its own label and surfaces no error/hint layer. Field is
 * the GENERAL form tier for consumers that need the description slots.
 */
import { Fragment, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { fieldClasses, fieldDescriptionClasses, fieldDescriptionId, fieldDescribedBy, fieldSlot, fieldWarnFor } from './fieldClasses'

export type FieldProps = {
  /** The control's label — associates via htmlFor/id. */
  label: ReactNode
  /** The failure description: present → it alone describes the control,
   *  in the danger tone. */
  error?: ReactNode
  /** The advisory/confirmation description: shows only when no error. */
  hint?: ReactNode
  /** The control's id, when the consumer owns it (test hooks, deep links).
   *  Must agree with an id the control itself carries. */
  htmlFor?: string
  /** The wrapper's surface geometry class (P06 — composes after the
   *  `.field-group` recipe, e.g. "grow" for the connection rows). */
  className?: string
  /** The control — a single element. Field clones it carrying
   *  id + aria-describedby; everything else passes through untouched. */
  children: ReactNode
}

export function Field({ label, error, hint, htmlFor, className, children }: FieldProps) {
  const derivedId = useId()
  const slot = fieldSlot({ error, hint })
  // isValidElement narrows to ReactElement<unknown>; the clone props are a
  // plain attribute bag on the control's own props shape.
  const element = isValidElement(children) ? children as ReactElement<Record<string, unknown>> : null
  const childProps = element ? (element.props as { id?: string; 'aria-describedby'?: string }) : {}
  const controlId = childProps.id ?? htmlFor ?? derivedId
  const wireable = element !== null && element.type !== Fragment
  if (import.meta.env.DEV) {
    const warning = fieldWarnFor({ wireable, htmlFor, childId: childProps.id })
    if (warning) console.warn(warning)
  }
  const control = element && wireable
    ? cloneElement(element, slot
      ? {
          id: controlId,
          'aria-describedby': fieldDescribedBy(childProps['aria-describedby'], fieldDescriptionId(controlId, slot.kind)),
        }
      : { id: controlId })
    : children
  return (
    <div className={fieldClasses({ className })}>
      <label htmlFor={controlId}>{label}</label>
      {control}
      {slot && (
        <div id={fieldDescriptionId(controlId, slot.kind)} className={fieldDescriptionClasses(slot.kind)}>
          {slot.content as ReactNode}
        </div>
      )}
    </div>
  )
}
