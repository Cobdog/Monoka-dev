/**
 * fieldClasses — Field's pure precedence/id/merge math (component vocabulary
 * task 18, Flux k2q0n9s). React-free on purpose so the node suite
 * (tests/field-classes.test.js) executes the SAME mapping the component
 * renders — the statusToken/chipClasses/buttonClasses doctrine: one
 * authority, tested where it lives.
 *
 * Contract:
 *   - PRECEDENCE (the spec's field tier): error > hint > silent. fieldSlot()
 *     picks the ONE description slot — the error whenever it is present (its
 *     tone carries the failure), the hint only when no error is, nothing
 *     when both are absent. "Absent" is the empty-ReactNode set
 *     (undefined/null/false/''): a caller passing '' must not get an empty
 *     description element — a dangling node that announces nothing. 0 and
 *     real nodes ARE content.
 *   - IDS: fieldDescriptionId() names the description off the CONTROL's id
 *     (`{id}-{error|hint}`) — the association is greppable, stable per
 *     control, and the error→hint toggle is observable as the referenced id
 *     MOVING. fieldDescribedBy() MERGES into an existing aria-describedby
 *     (multiple id refs are legal ARIA) with dedupe — a consumer's own
 *     description wiring is never clobbered.
 *   - CLASSES: fieldClasses() composes `field-group [surface…]` — the house
 *     form tier class IS the recipe (grid flow + label styling already live
 *     in src/styles.css); the surface's geometry class lands last, deduped
 *     (P06 — the mergeTail doctrine). fieldDescriptionClasses() composes
 *     `field-description [--error]`: tone through the muted/danger tokens.
 *   - DEV WARNS: fieldWarnFor() flags the two misuse shapes the component
 *     cannot fix itself — children that cannot carry the wiring (fragments,
 *     arrays, plain text) and a htmlFor that disagrees with the control's
 *     own id (the label would point nowhere).
 */

export type FieldSlotKind = 'error' | 'hint'

/** The one showing description slot: which kind, and its content. */
export type FieldSlot = { kind: FieldSlotKind; content: unknown } | null

/** The empty-ReactNode set — renders nothing, so never a description.
 *  (0 is NOT in it: it renders "0".) */
function isAbsent(node: unknown): boolean {
  return node === undefined || node === null || node === false || node === ''
}

/** The precedence contract as one call: error > hint > silent. */
export function fieldSlot({ error, hint }: { error?: unknown; hint?: unknown }): FieldSlot {
  if (!isAbsent(error)) return { kind: 'error', content: error }
  if (!isAbsent(hint)) return { kind: 'hint', content: hint }
  return null
}

/** The description element's id, derived off the CONTROL's id — greppable,
 *  stable, and the error↔hint toggle observable as the id moving. */
export function fieldDescriptionId(controlId: string, kind: FieldSlotKind): string {
  return `${controlId}-${kind}`
}

/** aria-describedby merge: appends the description ref to any existing refs
 *  (legal ARIA, space-separated), deduped — never clobbers consumer wiring. */
export function fieldDescribedBy(existing: string | undefined, id: string): string {
  const tokens = (existing ?? '').split(/\s+/).filter(Boolean)
  if (tokens.indexOf(id) === -1) tokens.push(id)
  return tokens.join(' ')
}

/** Composed wrapper classes: `field-group [surface…]` — deduped, the
 *  surface's geometry class last (cascade-friendly, the mergeTail doctrine). */
export function fieldClasses({ className }: { className?: string }): string {
  const parts = ['field-group']
  if (className) {
    const tokens = className.split(/\s+/)
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!
      if (token && parts.indexOf(token) === -1) parts.push(token)
    }
  }
  return parts.join(' ')
}

/** The description element's tone classes: the base recipe (muted hint
 *  tone), plus the error modifier when the error slot is showing. */
export function fieldDescriptionClasses(kind: FieldSlotKind): string {
  return kind === 'error' ? 'field-description field-description--error' : 'field-description'
}

/** Dev-time misuse warnings (the Button icon-only contract's sibling):
 *   - children that cannot carry id/aria-describedby (fragments, arrays,
 *     plain text) — the wiring would silently drop;
 *   - htmlFor disagreeing with the control's own id — the label would point
 *     at nothing (the child's id is ground truth and wins).
 *  Returns null on the honest pairs. */
export function fieldWarnFor({ wireable, htmlFor, childId }: { wireable: boolean; htmlFor?: string; childId?: string }): string | null {
  if (!wireable) {
    return 'Field: children must be a single element (the control) so the label association and aria-describedby wiring can land on it — fragments, arrays, and text cannot carry them. Move siblings outside the Field (a datalist associates via list=, wherever it lives).'
  }
  if (htmlFor !== undefined && childId !== undefined && htmlFor !== childId) {
    return `Field: htmlFor "${htmlFor}" disagrees with the control's own id "${childId}" — the label would point at nothing. The control's id wins; drop htmlFor or align it.`
  }
  return null
}
