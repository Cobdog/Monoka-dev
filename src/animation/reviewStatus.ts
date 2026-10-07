/**
 * The animation module's review vocabulary (task 10, k2q0n9s; extracted to
 * its own module in task 11 when the hero review became the second
 * consumer): §7.3's FIVE-WORD user-facing status mapping and the in-flight
 * set, ONE table — every surface that renders an attempt's status renders
 * the same word.
 */
import type { AttemptExecutionState } from '../../shared/animation/types'

/** §7.3's five-word user-facing vocabulary, keyed for the DOM. */
export type ReviewStatusKey = 'queued' | 'rendering' | 'preparing-review' | 'ready' | 'failed-or-canceled'

/** The one status mapping (execution → §7.3): `reconciling` reads as Queued
 *  with a note (the §11.4 pending outcome), `interrupted` as Failed or
 *  canceled (confirmed lost — explicit retry only). */
export const REVIEW_STATUS: Record<AttemptExecutionState, { key: ReviewStatusKey; label: string; meaning: string }> = {
  queued: { key: 'queued', label: 'Queued', meaning: 'Waiting for the engine.' },
  reconciling: { key: 'queued', label: 'Queued', meaning: 'Waiting for the engine — the server is re-checking this attempt against it.' },
  rendering: { key: 'rendering', label: 'Rendering', meaning: 'Generation in progress.' },
  preparing: { key: 'preparing-review', label: 'Preparing review', meaning: 'Render finished; the preview and reference assets are being prepared.' },
  ready: { key: 'ready', label: 'Ready to review', meaning: 'A new candidate is available; selection unchanged.' },
  failed: { key: 'failed-or-canceled', label: 'Failed or canceled', meaning: 'This attempt stopped; previous selections remain.' },
  cancelled: { key: 'failed-or-canceled', label: 'Failed or canceled', meaning: 'This attempt stopped; previous selections remain.' },
  interrupted: { key: 'failed-or-canceled', label: 'Failed or canceled', meaning: 'This attempt stopped; previous selections remain.' },
}

/** The states whose outcome is not settled — the re-roll waits for them
 *  (both review panels gate their re-roll actions the same way). */
export const IN_FLIGHT: ReadonlySet<AttemptExecutionState> = new Set(['queued', 'rendering', 'preparing', 'reconciling'])
