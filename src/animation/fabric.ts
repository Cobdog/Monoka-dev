/**
 * The animation module's realtime subscription adapter (task 6, k2q0n9s —
 * spec §10.1 "no shadow engine client", the fabric contract): the
 * `animation` channel of the EXISTING realtime fabric (src/lib/useRealtime)
 * — one WebSocket the whole app already shares, subscribe('animation', …),
 * never a second socket. The server side (routes.ts' animationFabricEmitter
 * + the routes' own document-changed emissions) defines the envelope
 * vocabulary this adapter narrows 1:1.
 *
 * Malformed envelopes DROP (return null → no handler call): a lying or
 * partial event is worse than a missing one — the durable read is the truth
 * a consumer falls back to (the resync envelope exists exactly for that).
 */
import { subscribe } from '../lib/useRealtime'
import type { RealtimeEnvelope } from '../types'
import type { AttemptContinuationView, AttemptExecutionState } from '../../shared/animation/types'

/** The attempt execution vocabulary (§7.3) — the wire's closed set; an
 *  envelope carrying anything else is malformed and drops. */
const EXECUTION_STATES: ReadonlySet<string> = new Set(['queued', 'rendering', 'preparing', 'ready', 'failed', 'cancelled', 'interrupted', 'reconciling'])

function isExecutionState(value: unknown): value is AttemptExecutionState {
  return typeof value === 'string' && EXECUTION_STATES.has(value)
}

/** The continuation readiness vocabulary (the extension lane §8) — the
 *  registration envelope's closed set: the three states registration can
 *  settle into (the retryable registering, ready, not-produced). */
const CONTINUATION_STATES: ReadonlySet<string> = new Set(['registering', 'ready', 'not-produced'])

export type AnimationEvent =
  | { type: 'attempt-state'; documentId: string; attemptId: string; execution: AttemptExecutionState; progress?: { value: number; max: number } }
  /** candidateId is the MINTED document candidate id (hero landings — the
   *  correlation key against the key slot's candidates) or null when the
   *  tool mints nothing (tween correlates by attemptId, sequence surfaces
   *  through editorial selection) — never the engine artifact path. */
  | { type: 'attempt-ready'; documentId: string; attemptId: string; candidateId: string | null }
  /** The extension lane's two-readiness landing (§7/§8, Task 2's envelope
   *  decision — wired by Task 6): the DETACHED carry registration settled.
   *  `continuation` is the attempt row's own continuation view shape (state
   *  + artifact?/error?), patched in place exactly like attempt-state
   *  patches execution — without this envelope the Extend gate would wait
   *  on a refresh nothing triggers (registration completes AFTER
   *  attempt-ready, which already re-read once). */
  | { type: 'continuation-state'; documentId: string; attemptId: string; continuation: AttemptContinuationView }
  | { type: 'document-changed'; documentId: string; revision: number; reason: string }
  | { type: 'reconciliation'; attemptId: string; outcome: string }
  /** The fabric's synthetic drop/reconnect notice (per-channel seq gap or a
   *  transport reopen): re-fetch authoritative state — the durable read. */
  | { type: 'resync'; ch: 'animation' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0

/** Envelope → event, checked (the hand-rolled narrowing idiom); null drops. */
function parseAnimationEvent(envelope: RealtimeEnvelope): AnimationEvent | null {
  if (envelope.ch !== 'animation') return null
  if (envelope.type === 'resync') return { type: 'resync', ch: 'animation' }
  if (!isRecord(envelope.payload)) return null
  const payload = envelope.payload
  switch (envelope.type) {
    case 'attempt-state': {
      const { documentId, attemptId, execution, progress } = payload
      if (!isId(documentId) || !isId(attemptId)) return null
      if (!isExecutionState(execution)) return null
      const event: AnimationEvent = { type: 'attempt-state', documentId, attemptId, execution }
      if (isRecord(progress) && typeof progress.value === 'number' && typeof progress.max === 'number') {
        event.progress = { value: progress.value, max: progress.max }
      }
      return event
    }
    case 'attempt-ready': {
      const { documentId, attemptId, candidateId } = payload
      if (!isId(documentId) || !isId(attemptId)) return null
      if (candidateId !== null && !isId(candidateId)) return null
      return { type: 'attempt-ready', documentId, attemptId, candidateId }
    }
    case 'continuation-state': {
      const { documentId, attemptId, state, artifact, error, stamp } = payload
      if (!isId(documentId) || !isId(attemptId)) return null
      if (typeof state !== 'string' || !CONTINUATION_STATES.has(state)) return null
      const continuation: AttemptContinuationView = { state: state as AttemptContinuationView['state'] }
      if (isRecord(artifact) && isId(artifact.artifactId) && isId(artifact.digest)) {
        continuation.artifact = { artifactId: artifact.artifactId, digest: artifact.digest }
      }
      if (typeof error === 'string') continuation.error = error
      // The settlement generation (M-7): an envelope-stamped ordering key —
      // absent on pre-stamp envelopes (older builds), and a non-number is
      // malformed, never a guessed zero.
      if (typeof stamp === 'number') continuation.stamp = stamp
      return { type: 'continuation-state', documentId, attemptId, continuation }
    }
    case 'document-changed': {
      const { documentId, revision, reason } = payload
      if (!isId(documentId) || typeof revision !== 'number' || typeof reason !== 'string') return null
      return { type: 'document-changed', documentId, revision, reason }
    }
    case 'reconciliation': {
      const { attemptId, outcome } = payload
      if (!isId(attemptId) || typeof outcome !== 'string') return null
      return { type: 'reconciliation', attemptId, outcome }
    }
    default:
      // Server-internal detail types never ride this channel; unknown
      // vocabulary drops rather than guessing a meaning.
      return null
  }
}

/** Subscribes a handler to the fabric's animation channel. Returns the
 *  unsubscribe function (the fabric drops the channel when the last handler
 *  leaves — mounting/unmounting the module owns its subscription). */
export function subscribeAnimationEvents(handler: (event: AnimationEvent) => void): () => void {
  return subscribe('animation', (envelope) => {
    const event = parseAnimationEvent(envelope)
    if (event) handler(event)
  })
}
