/**
 * StudioSelect — the studio's one styled NATIVE select (component vocabulary
 * task 16, spec §2.1 "one styled select"). NOT a custom listbox: the native
 * <select> keeps every platform semantic — the dropdown, typeahead, option
 * groups, form participation, and the EAGER value capture below. What the
 * component adds is the affordance each surface was missing alone:
 *
 *   - CHEVRON — the platform arrow is retired (appearance: none) and one
 *     chevron overlays the control's right slot; the recipe reserves the
 *     icon's room (.studio-select-input's padding-right outranks the
 *     surfaces' own paddings by specificity, so no migrated select's text
 *     runs under its chevron).
 *   - OVERFLOW — long option text truncates with an ellipsis
 *     (text-overflow), never spills the control.
 *   - FOCUS — visible through the global :focus-visible ring (styles.css);
 *     the form tier swaps it for its border+ring treatment
 *     (.field-group select:focus), as before.
 *
 * P06, the doctrine Button/Chip set: geometry (heights, widths, the other
 * paddings, borders, backgrounds) stays with the SURFACE select rules
 * (.canvas-properties-row select, .camera-path-field select, …) or the
 * retained .select-wrap house form rows — pass wrapClassName="select-wrap"
 * for those (the 38px form look; the wrap turns block-level like the div it
 * replaces). The wrap is a <span> so phrasing contexts (labels) stay valid
 * HTML; the surface's own class rides the select via `className` as before.
 *
 * EAGER VALUE CAPTURE (spec §0.2, the T2 bug class — pinned in
 * e2e/settings.spec.ts): the native select commits its value on EVERY
 * selection gesture — each arrow-key press on the closed control and each
 * option pick fires `change` immediately; there is no deferred commit
 * waiting for blur or Enter. Consumers therefore read the value AT DISPATCH
 * (`const value = event.target.value`) and never dereference the event
 * inside a deferred callback — a functional setState at flush time reads
 * the restored controlled DOM otherwise (the live idiom: WorkbenchApp.tsx's
 * reference-role selects, whose eager capture predates this component).
 */
import { ChevronDown } from 'lucide-react'
import type { SelectHTMLAttributes } from 'react'

export type StudioSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** The chevron's pixel size — the surface's icon scale (the house form
   *  rows use 15, the compact canvas rows the default). Defaults to 13. */
  chevronSize?: number
  /** Class for the WRAP (P06: the surface's box geometry). Pass
   *  "select-wrap" for the house form rows (38px height, the form paddings,
   *  block-level fill — the div those rows used). */
  wrapClassName?: string
}

export function StudioSelect({ chevronSize = 13, wrapClassName = '', className, children, ...select }: StudioSelectProps) {
  return (
    <span className={`studio-select${wrapClassName ? ` ${wrapClassName}` : ''}`}>
      <select className={className ? `studio-select-input ${className}` : 'studio-select-input'} {...select}>
        {children}
      </select>
      <ChevronDown size={chevronSize} aria-hidden="true" />
    </span>
  )
}
