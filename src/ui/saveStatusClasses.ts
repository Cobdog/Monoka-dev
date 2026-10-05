/**
 * saveStatusClasses — SaveStatus's pure state→class/aria/copy math (component
 * vocabulary task 20, spec §2.2 the semantic five, Flux k2q0n9s). React-free
 * on purpose so the node suite (tests/save-status-classes.test.js) executes
 * the SAME mapping the component renders — the fieldClasses/buttonClasses
 * doctrine: one authority, tested where it lives.
 *
 * Contract:
 *   - STATE is the CLOSED four-state matrix of a save's fate:
 *     idle (nothing in flight since the last look — SILENT: no classes, no
 *     aria, no copy; the component renders nothing, exactly what the retired
 *     inspector instance's `saveState && …` gating did) · saving (the busy
 *     idiom) · saved (the confirmation) · failed (the danger tone + the
 *     server reason + the retry affordance). Unknown states throw.
 *   - CLASSES: `save-status [save-status--failed] [surface…]` — the state
 *     modifier exists only where it changes the recipe (failed's danger
 *     tone); saving and saved share the muted base, and the machine state
 *     rides the `data-save-state` hook for tests and skin work. The
 *     surface's geometry class composes last, deduped (P06, mergeTail).
 *   - ARIA: saving/saved are role=status + polite, failed is role=alert +
 *     assertive — the explicit aria-live always matches the role's implicit
 *     semantics (the noticeAria doctrine), ONE live mechanism per element.
 *   - COPY: the optional `label` names WHAT is saving ('draft', 'session',
 *     'caption', 'settings') so each surface keeps its established voice
 *     through one static prop — never a state-keyed ternary at the consumer
 *     (that ad-hoc markup is what this tier retired). The failed arm embeds
 *     `detail` — the SERVER REASON — VERBATIM, never swallowed, falling back
 *     to honest copy when no reason exists.
 *   - WARNS: onRetry/detail supplied while state is not failed dev-warn —
 *     the retry affordance renders only on failed, the reason surfaces only
 *     there; anything else would be silently dropped. Callers gate the props
 *     on the failed state (the EffectiveSettingRow onReset discipline).
 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

export const SAVE_STATES: readonly SaveState[] = ['idle', 'saving', 'saved', 'failed']

function assertState(state: SaveState, who: string): void {
  if (SAVE_STATES.indexOf(state) === -1) {
    throw new Error(`${who}: unknown save state "${String(state)}" (closed matrix: ${SAVE_STATES.join(', ')})`)
  }
}

/** Composed classes: `save-status [save-status--failed] [surface…]` —
 *  deduped, the surface geometry class last (the mergeTail doctrine). Idle
 *  emits the empty string (the component renders nothing). */
export function saveStatusClasses({ state, className }: { state: SaveState; className?: string }): string {
  assertState(state, 'saveStatusClasses')
  if (state === 'idle') return ''
  const parts: string[] = ['save-status']
  if (state === 'failed') parts.push('save-status--failed')
  if (className) {
    const tokens = className.split(/\s+/)
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!
      if (token && parts.indexOf(token) === -1) parts.push(token)
    }
  }
  return parts.join(' ')
}

/** The announcement semantics a state carries: saving/saved are polite
 *  statuses, failed is an assertive alert (a failed save announces — the
 *  A02 doctrine). The explicit aria-live matches the role's implicit
 *  semantics so the pair can never disagree. Idle carries nothing (it
 *  renders nothing). */
export function saveStatusAria(state: SaveState): { role: 'status' | 'alert'; 'aria-live': 'polite' | 'assertive' } | null {
  assertState(state, 'saveStatusAria')
  if (state === 'idle') return null
  return state === 'failed' ? { role: 'alert', 'aria-live': 'assertive' } : { role: 'status', 'aria-live': 'polite' }
}

function capitalize(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`
}

/** The state's copy: `Saving {label}…` · `{Label} saved.` ·
 *  `{Label} not saved — {detail}` (the server reason VERBATIM; the honest
 *  fallback when none exists). Idle has no copy. */
export function saveStatusText({ state, label, detail }: { state: SaveState; label?: string; detail?: string }): string | null {
  assertState(state, 'saveStatusText')
  if (state === 'idle') return null
  switch (state) {
    case 'saving':
      return label ? `Saving ${label}…` : 'Saving…'
    case 'saved':
      return label ? `${capitalize(label)} saved.` : 'Saved.'
    case 'failed':
      return `${label ? `${capitalize(label)} not saved` : 'Not saved'} — ${detail ?? 'the save failed'}`
  }
}

/** The retry affordance's accessible name — names WHAT retries. */
export function saveRetryLabel(label?: string): string {
  return label ? `Retry saving the ${label} now` : 'Retry the save now'
}

/** Dev-time misuse warning (the Field/Button/Row contract's sibling): props
 *  that cannot render on the given state would be silently dropped — the
 *  retry renders only on failed, the reason surfaces only there. Null when
 *  the pair is honest. */
export function saveStatusWarnFor({ state, detail, onRetry }: { state: SaveState; detail?: unknown; onRetry?: unknown }): string | null {
  assertState(state, 'saveStatusWarnFor')
  if (state === 'failed') return null
  const dropped: string[] = []
  if (onRetry !== undefined && onRetry !== null) dropped.push('onRetry (the retry affordance renders only on the failed state)')
  if (detail !== undefined && detail !== null && detail !== '') dropped.push('detail (the server reason surfaces only on the failed state — it would be swallowed here)')
  if (!dropped.length) return null
  return `SaveStatus: ${dropped.join(' and ')} supplied while state is "${state}".`
}
