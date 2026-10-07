/**
 * The animation module's review vocabulary (task 10, k2q0n9s; extracted to
 * its own module in task 11 when the hero review became the second
 * consumer): the user-facing status mapping and the in-flight set, ONE
 * table — every surface that renders an attempt's status renders the same
 * word.
 *
 * Wave 1 of the post-review program split the old shared "Failed or
 * canceled" word (the live review's #6: a genuinely failed attempt showed
 * the neutral stopped line while the engine held a precise refusal):
 * FAILED is its own word and renders the attempt's durable failureReason;
 * CANCELLED and INTERRUPTED share the neutral "Stopped" line — a user
 * action or a lost job is not a failure and never shows a reason.
 */
import type { AttemptExecutionState } from '../../shared/animation/types'

/** The user-facing vocabulary, keyed for the DOM. */
export type ReviewStatusKey = 'queued' | 'rendering' | 'preparing-review' | 'ready' | 'failed' | 'stopped'

/** The one status mapping (execution → user-facing): `reconciling` reads as
 *  Queued with a note (the §11.4 pending outcome), `failed` carries its own
 *  word (the named reason renders beside it), `cancelled`/`interrupted` read
 *  as Stopped (the neutral line — never a failure reason). */
export const REVIEW_STATUS: Record<AttemptExecutionState, { key: ReviewStatusKey; label: string; meaning: string }> = {
  queued: { key: 'queued', label: 'Queued', meaning: 'Waiting for the engine.' },
  reconciling: { key: 'queued', label: 'Queued', meaning: 'Waiting for the engine — the server is re-checking this attempt against it.' },
  rendering: { key: 'rendering', label: 'Rendering', meaning: 'Generation in progress.' },
  preparing: { key: 'preparing-review', label: 'Preparing review', meaning: 'Render finished; the preview and reference assets are being prepared.' },
  ready: { key: 'ready', label: 'Ready to review', meaning: 'A new candidate is available; selection unchanged.' },
  failed: { key: 'failed', label: 'Failed', meaning: 'This attempt failed — the reason is shown with it. Previous selections remain.' },
  cancelled: { key: 'stopped', label: 'Stopped', meaning: 'This attempt was stopped; previous selections remain.' },
  interrupted: { key: 'stopped', label: 'Stopped', meaning: 'This attempt was interrupted before the engine finished it; previous selections remain — a re-roll starts a fresh take.' },
}

/** The states whose outcome is not settled — the re-roll waits for them
 *  (both review panels gate their re-roll actions the same way). */
export const IN_FLIGHT: ReadonlySet<AttemptExecutionState> = new Set(['queued', 'rendering', 'preparing', 'reconciling'])
