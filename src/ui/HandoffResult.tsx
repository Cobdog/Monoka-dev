/**
 * HandoffResult — the write ≠ refresh tier (component vocabulary task 22,
 * spec §0.5/C2 the semantic five, Flux k2q0n9s): a multi-step handoff's
 * per-step fate, each step carrying TWO INDEPENDENT facts —
 *
 *   [spinner] {label} {landed|failed — reason} [view stale|not refreshed] [retry|refresh]
 *
 *   - write 'done'|'failed'|'pending' — did the server mutation land.
 *   - refresh 'fresh'|'stale'|'failed'|'pending' — does the local view
 *     reflect it. A failed refresh after a successful write renders
 *     DONE-WITH-STALE-MARKER, never failed: the danger tone, the alert,
 *     and the failed copy belong to a failed WRITE alone.
 *
 * The component renders caller-owned state and invokes a caller-supplied
 * `onRetry(stepId)` — it never orchestrates (the never-shared list: the
 * execution, the server calls, and the RETAINED IDENTIFIERS that make retry
 * safe all live with the caller, spec §0.5). Retry re-runs exactly the
 * named step's failed fact; that the succeeded writes are never re-POSTed
 * is the caller's retained-identifier discipline.
 *
 * P06, the doctrine every kit component carries: the recipe owns tone/type
 * and the row's internal flow; the consuming surface's `className` carries
 * placement geometry, composed last. The announce family: a failed step
 * announces (role=alert, assertive); the done-with-stale marker is a visual
 * state inside a polite row — never an alert. The busy arm is the Button
 * busy idiom verbatim (LoaderCircle + the shared `.spin`, never a new
 * animation). Machine hooks: `data-handoff-result` / per row
 * `data-handoff-step` / `data-handoff-write` / `data-handoff-refresh`, the
 * stale marker `data-handoff-stale`, the affordance `data-handoff-retry`
 * (shared-component-owned, the data-save-state doctrine). An empty steps
 * array renders nothing (the SaveStatus idle doctrine).
 *
 * The recipes live in src/styles.css; the class/aria/copy/warn math lives
 * in ./handoffClasses.ts (react-free, node-tested).
 */
import { LoaderCircle } from 'lucide-react'
import {
  handoffRefreshText, handoffResultClasses, handoffRetryLabel, handoffStepAria, handoffStepClasses,
  handoffStepRetryable, handoffStepText, handoffWarnFor, type HandoffStep,
} from './handoffClasses'

export type { HandoffStep, HandoffWriteState, HandoffRefreshState } from './handoffClasses'

export type HandoffResultProps = {
  /** The handoff's steps, each carrying its INDEPENDENT write + refresh facts. */
  steps: HandoffStep[]
  /** Present to render the per-step retry — re-runs exactly the named step's
   *  failed fact (the write, or the refresh alone). Supply when any step is
   *  retryable (dev-warns otherwise — a failed fact with no affordance
   *  dead-ends). */
  onRetry?: (stepId: string) => void
  /** The surface's geometry class (P06 — composes after the recipe). */
  className?: string
}

export function HandoffResult({ steps, onRetry, className }: HandoffResultProps) {
  if (import.meta.env.DEV) {
    const warning = handoffWarnFor({ steps, onRetry })
    if (warning) console.warn(warning)
  }
  if (!steps.length) return null
  return (
    <ul className={handoffResultClasses({ className })} data-handoff-result>
      {steps.map((step) => {
        const aria = handoffStepAria(step)
        const stateText = handoffStepText(step)
        const markerText = handoffRefreshText(step)
        const retryable = onRetry !== undefined && handoffStepRetryable(step)
        return (
          // key carries the composed state so each live-region row
          // fresh-mounts on a fact change (the T20 announce precedent).
          <li
            key={`${step.id}:${step.write}:${step.refresh}`}
            className={handoffStepClasses({ write: step.write })}
            data-handoff-step={step.id}
            data-handoff-write={step.write}
            data-handoff-refresh={step.refresh}
            {...aria}
          >
            {step.write === 'pending' ? <LoaderCircle size={12} className="spin" /> : null}
            <span>{step.label}</span>
            {stateText !== null ? <span>{stateText}</span> : null}
            {markerText !== null ? <span className="handoff-step-marker" data-handoff-stale>{markerText}</span> : null}
            {retryable ? (
              <button
                type="button"
                className="handoff-step-retry"
                data-handoff-retry
                aria-label={handoffRetryLabel(step)}
                title={handoffRetryLabel(step)}
                onClick={() => onRetry?.(step.id)}
              >
                {step.write === 'failed' ? 'retry' : 'refresh'}
              </button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
