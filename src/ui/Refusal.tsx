/**
 * Refusal — the studio's honest-no component (component vocabulary task 21,
 * spec §2.2 the semantic five, Flux k2q0n9s): ONE element stating a
 * PRECONDITION gate —
 *
 *   {title}
 *   {reason}
 *   [satisfy]
 *
 * The thing you asked for cannot run because {reason}, and — never a dead
 * end — the optional `satisfy` pair is the action that would resolve it
 * ("enable the engine", "connect a model", "get the missing pieces"),
 * rendered as a real button. Not an error banner: SaveStatus's failed tier
 * owns save failures and NoticeBanner owns notices; Refusal owns gates that
 * block BEFORE anything runs. The copy is facts plainly, caller-supplied
 * (the maintainer-values doctrine: no moralizing prose) — the component
 * states the refusal, it never resolves it (the never-shared list:
 * detection and remediation live with the caller).
 *
 * It announces as the alert pair (role=alert, assertive — a refusal blocks
 * the primary action and names its remedy) and paints the WARNING tone, not
 * danger: a refusal is a state, not a failure (the plan's ruling).
 *
 * P06, the doctrine every kit component carries: the recipe owns tone/type
 * and the block's internal flow; the consuming surface's `className`
 * carries placement geometry, composed last. The recipes live in
 * src/styles.css; the class/aria/warn math lives in ./refusalClasses.ts
 * (react-free, node-tested).
 */
import { refusalAria, refusalClasses, refusalWarnFor, type RefusalSatisfy } from './refusalClasses'

export type { RefusalSatisfy }

export type RefusalProps = {
  /** WHAT is refused — the gate's own name ('Generate (T=1 Fast) is not
   *  available'). */
  title: string
  /** WHY, plainly — the missing precondition, named verbatim from the
   *  caller's own detection. */
  reason: string
  /** The escape hatch: the action that would satisfy the precondition.
   *  Absent when no remedy exists (the refusal then stands on its reason;
   *  never a forced or fabricated affordance). */
  satisfy?: RefusalSatisfy
  /** The surface's geometry class (P06 — composes after the recipe). */
  className?: string
}

export function Refusal({ title, reason, satisfy, className }: RefusalProps) {
  if (import.meta.env.DEV) {
    const warning = refusalWarnFor({ title, reason, satisfy })
    if (warning) console.warn(warning)
  }
  return (
    <div className={refusalClasses({ className })} data-refusal {...refusalAria()}>
      <p className="refusal-title" data-refusal-title>{title}</p>
      <p className="refusal-reason" data-refusal-reason>{reason}</p>
      {satisfy ? (
        <button type="button" className="refusal-satisfy" data-refusal-satisfy onClick={satisfy.action}>
          {satisfy.label}
        </button>
      ) : null}
    </div>
  )
}
