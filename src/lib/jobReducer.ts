import type { GenerationJob } from '../types'
import { sanitizeErrorMessage } from './logSanitize'
import { classifyFailure } from './failureTaxonomy'

export type PollObservation =
  | { kind: 'executionError'; node?: string; nodeType?: string; reason: string }
  | { kind: 'completed'; outputUrl: string; localOutputPath?: string }
  | { kind: 'completedNoLocalOutput' }
  | { kind: 'incomplete'; /** (ewtobuh) The engine's own /queue truth for this prompt, when the observer read it: a prompt still held as pending is QUEUED, never promoted to running without execution evidence. Callers without a queue read omit it and keep the promoted behavior. */ engineQueue?: 'pending' | 'running' | 'absent' }
  | { kind: 'pollFailed' }

export type PollReduction = {
  job: GenerationJob
  /** Present only when this call moved the job into a terminal state. Callers
   *  gate completion side effects (library recording, frame extraction) on it
   *  so they fire exactly once even when poll responses arrive out of order. */
  transitionedTo?: 'completed' | 'failed'
}

/** A finished render whose output file has not appeared yet gets this many
 *  extra 1-second polls before the job fails. ComfyUI writes output files
 *  before marking history completed, so this only covers slow disks. */
export const NO_OUTPUT_POLL_CAP = 30

/** Wall-clock cap on any single queued/running job, checked on every poll
 *  tick. Guards against a dead ComfyUI leaving jobs "running" forever. */
export const RUNNING_DEADLINE_MS = 60 * 60 * 1000

/** (R-26, audit B P2-2) Consecutive poll failures (the history fetch itself
 *  cannot reach the engine) that fail a job honestly "engine unreachable" —
 *  seconds-to-minutes at the 1 s poll cadence, far inside the wall-clock
 *  deadline above, which stays as the independent backstop. A single
 *  successful observation resets the streak, so transient blips during a
 *  healthy render never fail live work. */
export const POLL_FAILURE_STREAK_LIMIT = 15

/** (ewtobuh, ij878ap) The honest queue vocabulary. A merely-queued job says
 *  it is queued — never "Waiting for ComfyUI to start" (that lie read for
 *  ~50 minutes of pure queue contention in the review's repro). The
 *  unreachable wording is reserved for a genuinely unreachable engine and
 *  says what is actually wrong. */
export const QUEUED_LABEL = 'Queued — waiting for the engine'
export const ENGINE_UNREACHABLE_LABEL = 'The engine is unreachable — waiting for it to come back'

/** The live queue label from the engine's queue-depth broadcast: during
 *  contention the position is known and sayable ("Queued behind 1 job");
 *  anything unreadable falls back to the honest queued label. */
export function queuePositionLabel(queueRemaining?: number): string {
  if (typeof queueRemaining === 'number' && Number.isFinite(queueRemaining) && queueRemaining > 1) {
    const behind = queueRemaining - 1
    return `Queued behind ${behind} ${behind === 1 ? 'job' : 'jobs'}`
  }
  return QUEUED_LABEL
}

const TERMINAL_STATUSES: ReadonlySet<GenerationJob['status']> = new Set(['completed', 'failed', 'cancelled'])

export function isTerminalStatus(status: GenerationJob['status']): boolean {
  return TERMINAL_STATUSES.has(status)
}

export function isPastRunningDeadline(job: GenerationJob, now: number): boolean {
  return !TERMINAL_STATUSES.has(job.status) && now - job.createdAt > RUNNING_DEADLINE_MS
}

/** Pulls the structural failure out of a ComfyUI history entry: which node
 *  (id + class) failed and a SANITIZED reason. The raw exception_message is
 *  external text — engine exceptions can echo input values — so it passes
 *  through the pure sanitizer before it exists anywhere downstream (job
 *  records, notices, reports). Returns null when the entry has no
 *  execution_error message. */
export function extractExecutionError(history: Record<string, unknown>, promptId: string): { node: string; nodeType: string; reason: string } | null {
  const entry = history[promptId] as { status?: { messages?: unknown } } | undefined
  const messages = entry?.status?.messages
  if (!Array.isArray(messages)) return null
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (!Array.isArray(message) || message[0] !== 'execution_error') continue
    const data = message[1] as { node_id?: unknown; node_type?: unknown; exception_type?: unknown; exception_message?: unknown } | undefined
    if (!data || typeof data !== 'object') continue
    const node = typeof data.node_id === 'string' ? data.node_id : ''
    const nodeType = typeof data.node_type === 'string' ? data.node_type : ''
    const exceptionType = typeof data.exception_type === 'string' ? data.exception_type : ''
    const exceptionMessage = typeof data.exception_message === 'string' ? data.exception_message : ''
    const reason = sanitizeErrorMessage(`${exceptionType}${exceptionType && exceptionMessage ? ': ' : ''}${exceptionMessage}`)
    if (!node && !nodeType && !reason) return null
    return { node, nodeType, reason }
  }
  return null
}

/** (r3q1o49) The stock-preview crash signature: when ComfyUI's latent_preview
 *  constructs the stock TAEHV previewer from a broken/absent taeh3 decoder,
 *  the whole job dies at ~1% with 'NoneType' object has no attribute
 *  'show_progress_bar'. The auto-retry absorbs it (its resubmission carries
 *  no preview request) — this predicate lets the retry branch name the event
 *  for what it is instead of flashing a generic failure. Matches the
 *  SANITIZED reason (the observation never carries raw engine text); the
 *  snake_case token survives logSanitize, as does the constructing module's
 *  name in a traceback echo. */
export function isPreviewCrashSignature(observation: PollObservation): boolean {
  if (observation.kind !== 'executionError') return false
  return /show_progress_bar|latent_preview/i.test(`${observation.reason} ${observation.nodeType ?? ''}`)
}

/** The user-facing failure line for an execution error: node id + class +
 *  sanitized reason, plus the taxonomy's human-cause label when the class is
 *  known ("GPU memory exhausted", not a traceback). */
export function executionErrorMessage(observation: { node?: string; nodeType?: string; reason: string }): string {
  const structural = observation.nodeType || observation.node
    ? `ComfyUI failed at node ${observation.node || '?'}${observation.nodeType ? ` (${observation.nodeType})` : ''}${observation.reason ? `: ${observation.reason}` : ''}`
    : `ComfyUI reported an execution error${observation.reason ? `: ${observation.reason}` : '. The original may still be saved if upscaling failed.'}`
  const bucket = classifyFailure(`${observation.reason} ${observation.nodeType ?? ''}`)
  return bucket.id === 'unknown' ? structural : `${structural} · Likely cause: ${bucket.label}`
}

/** Pure transition for one job given one poll observation. A stale in-flight
 *  response for a job that already reached a terminal state is a no-op — it
 *  must neither resurrect the job nor repeat its completion side effects. */
export function reduceJobPoll(job: GenerationJob, observation: PollObservation, now: number): PollReduction {
  if (TERMINAL_STATUSES.has(job.status)) return { job }
  if (isPastRunningDeadline(job, now)) {
    return {
      job: { ...job, status: 'failed', failureKind: 'timeout', error: `Still rendering after ${Math.round(RUNNING_DEADLINE_MS / 60000)} minutes with no completion. ComfyUI may have stopped responding — check its queue before retrying.` },
      transitionedTo: 'failed',
    }
  }
  switch (observation.kind) {
    case 'executionError': {
      // (ewtobuh, vfhcu5r) The classification rides the record as a FIELD —
      // the same taxonomy the error line's "Likely cause" names — so
      // surfaces (Diagnostics' histogram, the canvas verdict) classify from
      // structure and never by re-parsing the sanitized prose.
      const bucket = classifyFailure(`${observation.reason} ${observation.nodeType ?? ''}`)
      return {
        job: {
          ...job,
          status: 'failed',
          error: executionErrorMessage(observation),
          failureKind: bucket.id,
          failureNodeType: observation.nodeType || undefined,
          failureNodeId: observation.node || undefined,
          pollFailureStreak: undefined,
        },
        transitionedTo: 'failed',
      }
    }
    case 'completed':
      return {
        job: { ...job, status: 'completed', progress: 100, outputUrl: observation.outputUrl, localOutputPath: observation.localOutputPath ?? job.localOutputPath, pollFailureStreak: undefined },
        transitionedTo: 'completed',
      }
    case 'completedNoLocalOutput': {
      const noOutputPolls = (job.noOutputPolls ?? 0) + 1
      if (noOutputPolls >= NO_OUTPUT_POLL_CAP) {
        return {
          job: { ...job, status: 'failed', failureKind: 'output-missing', error: 'The render finished, but its output file never appeared in the output directory.', pollFailureStreak: undefined },
          transitionedTo: 'failed',
        }
      }
      return { job: { ...job, status: 'running', progress: 98, noOutputPolls, pollFailureStreak: undefined } }
    }
    case 'incomplete': {
      // Same reference when nothing changes, so idle poll ticks do not churn
      // state — including when a poll-failure streak had accumulated: this
      // successful observation is the reset.
      if (job.status === 'running') return job.pollFailureStreak ? { job: { ...job, pollFailureStreak: undefined } } : { job }
      // (ewtobuh, ij878ap) QUEUE TRUTH: the engine's own /queue read, when
      // the observer has it, outranks the absence of a history entry. A
      // prompt still held as queue_pending is QUEUED — promoting it to
      // running here is the server-side half of the review's queue lie.
      // Execution evidence (the prompt is executing) or NO queue evidence
      // at all (legacy callers, engine-restart races) keeps the promotion.
      if (job.status === 'queued' && observation.engineQueue === 'pending') return { job }
      return { job: { ...job, status: 'running', pollFailureStreak: undefined } }
    }
    case 'pollFailed': {
      // (R-26) A poll that cannot even reach the engine is an observation:
      // the streak accumulates on the job and, at the limit, fails it
      // honestly long before the wall-clock deadline — never a 60-minute
      // "running" spin against a dead engine.
      const pollFailureStreak = (job.pollFailureStreak ?? 0) + 1
      if (pollFailureStreak >= POLL_FAILURE_STREAK_LIMIT) {
        return {
          job: {
            ...job,
            status: 'failed',
            failureKind: 'engine-unreachable',
            error: `The generation engine has been unreachable for ${pollFailureStreak} consecutive checks (~${pollFailureStreak} s at the 1 s poll cadence) — the render did not complete. Verify ComfyUI is running, then re-run this chain when the engine is back.`,
            pollFailureStreak: undefined,
          },
          transitionedTo: 'failed',
        }
      }
      return { job: { ...job, pollFailureStreak } }
    }
  }
}
