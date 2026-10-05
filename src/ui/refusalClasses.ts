/**
 * refusalClasses — Refusal's pure class/aria/warn math (component vocabulary
 * task 21, spec §2.2 the semantic five, Flux k2q0n9s). React-free on purpose
 * so the node suite (tests/refusal-classes.test.js) executes the SAME
 * mapping the component renders — the fieldClasses/saveStatusClasses
 * doctrine: one authority, tested where it lives.
 *
 * Contract:
 *   - WHAT A REFUSAL IS: the honest-no component for PRECONDITION gates —
 *     the thing you asked for cannot run because X, and here is how to
 *     satisfy X. It is NOT an error banner (SaveStatus's failed tier owns
 *     save failures; NoticeBanner owns notices) and never a dead end: the
 *     optional `satisfy` pair is the escape hatch, rendered as a real
 *     button. The copy is facts plainly (the maintainer-values doctrine —
 *     no moralizing prose), and it is all CALLER-supplied: the component
 *     states the refusal, it never resolves it (the never-shared list —
 *     detection and remediation live with the caller).
 *   - CLASSES: `refusal [surface…]` — ONE recipe, no state modifiers: a
 *     refusal is a state, not a matrix (contrast SaveStatus's four-state
 *     machine). The surface's geometry class composes last, deduped (P06,
 *     mergeTail).
 *   - ARIA: the alert pair — role=alert + aria-live=assertive, ALWAYS. A
 *     refusal blocks the primary action and names its remedy, so it
 *     announces; there is no polite variant to choose wrong. The explicit
 *     aria-live matches the role's implicit semantics (the noticeAria
 *     doctrine) — ONE live mechanism per element.
 *   - TONE: the recipe paints the EXISTING warning token, never danger —
 *     a refusal is a state, not a failure (the plan's ruling; danger
 *     belongs to SaveStatus's failed arm). Pinned in the node suite
 *     against the sheet.
 *   - WARNS: refusalWarnFor flags the dead-end shapes the pinned interface
 *     cannot police through types alone — a blank title (WHAT is refused
 *     goes unnamed), a blank reason (the WHY is the component's whole
 *     reason for existing), and a malformed satisfy (a blank label or a
 *     non-function action: an affordance that names nothing, or one that
 *     does nothing, is worse than no affordance). A satisfy-LESS refusal is
 *     legitimate and stays silent — no remedy existing is the caller's
 *     honest call, never a forced escape hatch.
 */
export type RefusalSatisfy = {
  /** The affordance's visible label (the caller's established voice). */
  label: string
  /** Fires on click — the action that would resolve the refusal. */
  action: () => void
}

function mergeTail(parts: string[], className?: string): string {
  if (className) {
    const tokens = className.split(/\s+/)
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!
      if (token && parts.indexOf(token) === -1) parts.push(token)
    }
  }
  return parts.join(' ')
}

/** Composed classes: `refusal [surface…]` — deduped, the surface geometry
 *  class last (the mergeTail doctrine). */
export function refusalClasses({ className }: { className?: string }): string {
  return mergeTail(['refusal'], className)
}

/** The announcement semantics every refusal carries: the alert pair. */
export function refusalAria(): { role: 'alert'; 'aria-live': 'assertive' } {
  return { role: 'alert', 'aria-live': 'assertive' }
}

/** Dev-time misuse warning (the Field/Button/SaveStatus contract's
 *  sibling): the shapes that would render a dead end. Null when the props
 *  are honest. */
export function refusalWarnFor({ title, reason, satisfy }: { title?: unknown; reason?: unknown; satisfy?: { label?: unknown; action?: unknown } }): string | null {
  const dropped: string[] = []
  if (typeof title !== 'string' || !title.trim()) dropped.push('title (a refusal with no title cannot name WHAT is refused)')
  if (typeof reason !== 'string' || !reason.trim()) dropped.push('reason (the WHY is the component\'s whole reason for existing — never blank)')
  if (satisfy !== undefined && satisfy !== null) {
    if (typeof satisfy.label !== 'string' || !satisfy.label.trim()) dropped.push('satisfy.label (an unnamed affordance)')
    if (typeof satisfy.action !== 'function') dropped.push('satisfy.action (an affordance that does nothing is worse than none)')
  }
  if (!dropped.length) return null
  return `Refusal: ${dropped.join(' and ')}.`
}
