/**
 * SaveStatus — the studio's save-state tier (component vocabulary task 20,
 * spec §2.2 the semantic five, Flux k2q0n9s): ONE element reporting a save
 * attempt's fate beside the action that caused it —
 *
 *   [spinner] {copy} [retry]
 *
 * The four states and their established idioms:
 *   - idle: SILENT — renders nothing (the retired inspector instance's null
 *     state; mount the component unconditionally and it disappears at rest).
 *   - saving: the busy idiom — LoaderCircle + the shared `.spin` animation
 *     (the Button busy precedent verbatim, never a new animation), polite.
 *   - saved: the confirmation — the MUTED tone (T18's landed ruling: the
 *     accent-ok dialect died; the OK-tone question stays open with the
 *     maintainer), polite.
 *   - failed: the danger tone at the decision-prose floor (--text-md, the
 *     A02/A10 >=11px class) with `detail` — the SERVER REASON — rendered
 *     VERBATIM, never swallowed, and the retry affordance when `onRetry` is
 *     supplied. A failed save announces: role=alert, assertive.
 *
 * The component renders caller-owned state and invokes a caller-supplied
 * retry — it never orchestrates the save itself (the never-shared list:
 * execution lives with the caller). Retry re-runs the CALLER's seam; what
 * that means (the freshest draft, the retained write) is the caller's
 * discipline.
 *
 * P06, the doctrine every kit component carries: the recipe owns tone/type
 * and the line's internal flow; the consuming surface's `className` carries
 * placement geometry, composed last. The optional `label` names WHAT is
 * saving so each surface keeps its established voice ('Saving draft…',
 * 'Draft saved.') through one STATIC prop — the state-keyed copy ternaries
 * at consumers are exactly what this tier retired. `size` is the spinner's
 * pixel scale (the Button precedent: geometry stays with the surface).
 *
 * The recipes live in src/styles.css; the class/aria/copy math lives in
 * ./saveStatusClasses.ts (react-free, node-tested).
 */
import { LoaderCircle } from 'lucide-react'
import { saveRetryLabel, saveStatusAria, saveStatusClasses, saveStatusText, saveStatusWarnFor, type SaveState } from './saveStatusClasses'

export type { SaveState }

export type SaveStatusProps = {
  /** The save attempt's fate (closed matrix — see saveStatusClasses.ts). */
  state: SaveState
  /** The failed state's SERVER REASON, surfaced verbatim. */
  detail?: string
  /** Present to render the retry affordance on the failed state — re-runs
   *  the caller's save seam. Supply only on failed (dev-warn otherwise). */
  onRetry?: () => void
  /** What is saving ('draft', 'session', …) — the surface's established
   *  voice through one static prop. */
  label?: string
  /** The spinner's pixel size — the surface's icon scale (Button precedent;
   *  the status line's dense chrome reads well at 12). */
  size?: number
  /** The surface's geometry class (P06 — composes after the recipe). */
  className?: string
}

export function SaveStatus({ state, detail, onRetry, label, size = 12, className }: SaveStatusProps) {
  if (import.meta.env.DEV) {
    const warning = saveStatusWarnFor({ state, detail, onRetry })
    if (warning) console.warn(warning)
  }
  const aria = saveStatusAria(state)
  const text = saveStatusText({ state, label, detail })
  if (!aria || text === null) return null
  return (
    <p className={saveStatusClasses({ state, className })} data-save-state={state} {...aria}>
      {state === 'saving' ? <LoaderCircle size={size} className="spin" /> : null}
      {text}
      {state === 'failed' && onRetry ? (
        <button
          type="button"
          className="save-status-retry"
          data-save-retry
          aria-label={saveRetryLabel(label)}
          title={saveRetryLabel(label)}
          onClick={onRetry}
        >
          retry
        </button>
      ) : null}
    </p>
  )
}
