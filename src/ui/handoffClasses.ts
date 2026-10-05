/**
 * handoffClasses — HandoffResult's pure step→class/aria/copy math (component
 * vocabulary task 22, spec §0.5/C2 the semantic five, Flux k2q0n9s).
 * React-free on purpose so the node suite (tests/handoff-classes.test.js)
 * executes the SAME mapping the component renders — the
 * fieldClasses/saveStatusClasses doctrine: one authority, tested where it
 * lives.
 *
 * Contract:
 *   - THE TWO FACTS ARE INDEPENDENT (C2): `write` (did the server mutation
 *     land?) and `refresh` (does the local view reflect it?) are separate
 *     per-step truths. A FAILED REFRESH after a SUCCESSFUL WRITE renders
 *     done-with-stale-marker — never failed: the only thing that escalates a
 *     row to the danger tone, an alert, or a `failed` copy is a failed
 *     WRITE. The refresh fact's failed attempt paints the WARNING marker
 *     (the refusal ruling: a state, not a failure).
 *   - STATE MATRICES (closed, exactly the plan's pinned interface):
 *     write pending | done | failed · refresh pending | fresh | stale |
 *     failed. Unknown values throw. Semantics: 'pending' — the fact is
 *     unresolved (in flight or never attempted); 'stale' — the caller KNOWS
 *     the view does not reflect the landed write (a standing condition, no
 *     attempt error); 'failed' — the refresh ATTEMPT errored. The refresh
 *     fact is an ATTEMPT RECORD, not a live-view oracle: a later step's
 *     successful reload does not rewrite an earlier step's failed attempt —
 *     the retry re-runs the step's own refresh.
 *   - CLASSES: `handoff-step [handoff-step--failed] [surface…]` per row —
 *     the failed modifier exists only for a failed WRITE; the refresh fact
 *     adds NO class (its marker is a child element). The container composes
 *     `handoff-result [surface…]`. Surface geometry composes last, deduped
 *     (P06, mergeTail).
 *   - ARIA: a failed write is role=alert + assertive (a failed step
 *     announces); a done write is role=status + polite under EVERY refresh
 *     fact (the done-with-stale marker is a visual state inside a polite
 *     row, never an alert); pending carries nothing (the SaveStatus idle
 *     doctrine — nothing to say yet). The explicit aria-live always matches
 *     the role's implicit semantics (the noticeAria doctrine).
 *   - COPY: the write fact reads null (pending — the spinner is the idiom) /
 *     'landed' (done) / 'failed — {detail}' (the SERVER REASON verbatim,
 *     with the honest fallback). The marker reads null (fresh, pending, or
 *     the write not landed — the refresh is the WRITE's companion fact) /
 *     'view stale' / 'not refreshed', each carrying `detail` verbatim when
 *     present. ONE detail slot serves whichever fact failed — write and
 *     refresh failures are mutually exclusive at real states (the refresh
 *     only runs after its write lands).
 *   - RETRY: a step is retryable exactly when a fact FAILED (write failed —
 *     re-run the write; refresh failed — re-run the refresh alone, never
 *     the landed write). A standing 'stale' with no failed attempt offers
 *     no retry: the caller failed nothing. The label names WHICH act runs.
 *   - WARNS: blank ids (the React key and the onRetry(stepId) routing both
 *     depend on them), blank labels, duplicate ids, and a retryable step
 *     with no onRetry (a failed fact with no affordance dead-ends — R-19).
 *     The component never orchestrates: execution, server calls, and the
 *     retained identifiers that make retry safe all live with the caller
 *     (the never-shared list).
 */
export type HandoffWriteState = 'pending' | 'done' | 'failed'
export type HandoffRefreshState = 'pending' | 'fresh' | 'stale' | 'failed'

export type HandoffStep = {
  id: string
  label: string
  write: HandoffWriteState
  refresh: HandoffRefreshState
  detail?: string
}

export const HANDOFF_WRITE_STATES: readonly HandoffWriteState[] = ['pending', 'done', 'failed']
export const HANDOFF_REFRESH_STATES: readonly HandoffRefreshState[] = ['pending', 'fresh', 'stale', 'failed']

function assertWrite(write: HandoffWriteState, who: string): void {
  if (HANDOFF_WRITE_STATES.indexOf(write) === -1) {
    throw new Error(`${who}: unknown handoff write state "${String(write)}" (closed matrix: ${HANDOFF_WRITE_STATES.join(', ')})`)
  }
}

function assertRefresh(refresh: HandoffRefreshState, who: string): void {
  if (HANDOFF_REFRESH_STATES.indexOf(refresh) === -1) {
    throw new Error(`${who}: unknown handoff refresh state "${String(refresh)}" (closed matrix: ${HANDOFF_REFRESH_STATES.join(', ')})`)
  }
}

function assertStep(step: HandoffStep, who: string): void {
  assertWrite(step.write, who)
  assertRefresh(step.refresh, who)
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

/** The list container's classes: `handoff-result [surface…]` — deduped, the
 *  surface geometry class last (the mergeTail doctrine). */
export function handoffResultClasses({ className }: { className?: string }): string {
  return mergeTail(['handoff-result'], className)
}

/** A row's classes: `handoff-step [handoff-step--failed] [surface…]`. The
 *  failed tone modifier belongs to the WRITE alone — this function takes no
 *  refresh on purpose: a failed refresh is a marker, never a failure tone
 *  (C2 in the math itself). */
export function handoffStepClasses({ write, className }: { write: HandoffWriteState; className?: string }): string {
  assertWrite(write, 'handoffStepClasses')
  const parts: string[] = ['handoff-step']
  if (write === 'failed') parts.push('handoff-step--failed')
  return mergeTail(parts, className)
}

/** TRUE exactly on (write done, refresh stale|failed): a landed write whose
 *  view did not refresh — the done-with-stale-marker state. A pending
 *  refresh claims nothing (unresolved, not known-stale); a failed or
 *  pending write has no stale claim to make (its refresh never ran). */
export function handoffStepStale(step: HandoffStep): boolean {
  assertStep(step, 'handoffStepStale')
  return step.write === 'done' && (step.refresh === 'stale' || step.refresh === 'failed')
}

/** The announcement semantics a step carries: a failed write is an alert
 *  (a failed step announces — the A02 doctrine); a done write is a polite
 *  status under EVERY refresh fact (the marker is a visual state, not an
 *  alert); pending carries nothing. The explicit aria-live matches the
 *  role's implicit semantics so the pair can never disagree. */
export function handoffStepAria(step: HandoffStep): { role: 'status' | 'alert'; 'aria-live': 'polite' | 'assertive' } | null {
  assertStep(step, 'handoffStepAria')
  if (step.write === 'pending') return null
  return step.write === 'failed' ? { role: 'alert', 'aria-live': 'assertive' } : { role: 'status', 'aria-live': 'polite' }
}

/** The WRITE fact's copy: null while pending (the spinner is the idiom),
 *  'landed' when done (this repo's own vocabulary for a write that stuck),
 *  'failed — {detail}' with the SERVER REASON verbatim and the honest
 *  fallback when no reason exists. */
export function handoffStepText(step: HandoffStep): string | null {
  assertStep(step, 'handoffStepText')
  if (step.write === 'pending') return null
  if (step.write === 'done') return 'landed'
  return `failed — ${step.detail ?? 'the step did not land'}`
}

/** The REFRESH fact's marker copy: null on fresh (the quiet default),
 *  pending (unresolved), or any write that has not landed (the refresh is
 *  the WRITE's companion fact — it renders only beside a landed write).
 *  'view stale' — the standing condition; 'not refreshed' — the failed
 *  ATTEMPT. Both carry `detail` verbatim when present. */
export function handoffRefreshText(step: HandoffStep): string | null {
  assertStep(step, 'handoffRefreshText')
  if (step.write !== 'done') return null
  if (step.refresh === 'stale') return step.detail ? `view stale — ${step.detail}` : 'view stale'
  if (step.refresh === 'failed') return step.detail ? `not refreshed — ${step.detail}` : 'not refreshed'
  return null
}

/** A step is retryable exactly when a fact FAILED: write failed — re-run
 *  the write; refresh failed — re-run the refresh alone. A standing 'stale'
 *  without a failed attempt offers no retry (the caller failed nothing);
 *  what retry MEANS (the retained identifiers that keep it safe) is the
 *  caller's discipline — spec §0.5. */
export function handoffStepRetryable(step: HandoffStep): boolean {
  assertStep(step, 'handoffStepRetryable')
  return step.write === 'failed' || step.refresh === 'failed'
}

/** The retry affordance's accessible name — it names WHICH act runs: a
 *  failed write RETRIES, a failed refresh REFRESHES (the cheaper act that
 *  never re-runs the landed write). */
export function handoffRetryLabel(step: HandoffStep): string {
  assertStep(step, 'handoffRetryLabel')
  return step.write === 'failed' ? `Retry "${step.label}" now` : `Refresh "${step.label}" now`
}

/** Dev-time misuse warning (the Field/Button/SaveStatus contract's sibling):
 *  shapes the pinned interface cannot police through types alone — blank
 *  ids (the React key and the onRetry(stepId) routing), blank labels,
 *  duplicate ids, and a retryable step with no onRetry (a failed fact with
 *  no affordance dead-ends — R-19). Null when the pair is honest. */
export function handoffWarnFor({ steps, onRetry }: { steps: HandoffStep[]; onRetry?: unknown }): string | null {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const step of steps) {
    assertStep(step, 'handoffWarnFor')
    if (!step.id || !step.id.trim()) problems.push('a blank step id (the React key and the onRetry routing both depend on it)')
    else if (seen.has(step.id)) problems.push(`a duplicate step id "${step.id}"`)
    else seen.add(step.id)
    if (!step.label || !step.label.trim()) problems.push(`a blank label on step "${step.id}"`)
    if (onRetry === undefined && handoffStepRetryable(step)) problems.push(`a retryable step ("${step.label || step.id}") with no onRetry — the failed fact would dead-end (R-19)`)
  }
  if (!problems.length) return null
  return `HandoffResult: ${problems.join('; ')}.`
}
