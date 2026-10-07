/**
 * The shared completion owner (spec 2026-10-06-animation-authoring-module-
 * design.md §10 the A-1 relationship, §11.4 the restart-recovery policy):
 * the ONE server-side machinery that watches engine jobs, lands candidates,
 * prepares reference frames, and reconciles uncertain state after restarts.
 * The browser observes through the fabric; it never lands anything (§10.1 —
 * no shadow engine clients, no second job queue).
 *
 * ENGINE-AGNOSTIC BY CONSTRUCTION: every engine fact arrives through the
 * EnginePort seam (rendering.ts owns its ComfyUI implementation — pointing
 * that port at the fake engine is the entire test setup; Task 15 swaps in a
 * real one without touching this file). EVERY §11.4 recovery rule is code
 * here:
 *   - editor closes → nothing to do (state is durable rows, not watchers);
 *   - server restart, job queued/running → reconcile() re-attaches
 *     observation, never resubmits;
 *   - history holds completed output → land idempotently (the store's
 *     landCandidate is the one-candidate guarantee), resume preparation;
 *   - engine unreachable → execution 'reconciling' (pending), attempt
 *     preserved;
 *   - job/output confirmed lost → execution 'interrupted', explicit retry
 *     only (a user action creates a NEW linked attempt);
 *   - dispatch acknowledgment lost → the engine request carries the attempt
 *     id (the SaveVideo prefix / extra_data); findJobByAttempt resolves it
 *     through the engine's own history — never a blind resubmit;
 *   - reference preparation fails → the clip stays landed, bounded
 *     auto-retries, then the explicit retryPreparation — no re-render;
 *   - cancellation races completion → whatever the engine finished is
 *     preserved and never auto-selected (the store enforces the
 *     never-selects half).
 *
 * State ownership: execution/preparation rows are written only through the
 * store's setters (append-only discipline, §11.2). The in-memory watchers
 * are OBSERVATION only — losing them loses nothing durable.
 */
import type { AssetReference } from '../../shared/animation/types'
import { AnimationRuleError, type AnimationAttemptRow, type AnimationStore } from './store'
import type { EnginePort, EngineJobStatus } from './rendering'

/** Terminal execution states — no event, poll, or cancel moves them. */
const TERMINAL_STATES: ReadonlySet<string> = new Set(['ready', 'failed', 'cancelled', 'interrupted'])
/** States whose engine-side truth is not settled (the store's own set,
 *  mirrored so the owner never second-guesses attemptsInFlight()). */
const IN_FLIGHT_STATES: ReadonlySet<string> = new Set(['queued', 'rendering', 'preparing', 'reconciling'])

export type CompletionOwner = ReturnType<typeof createCompletionOwner>

export function createCompletionOwner(deps: {
  store: AnimationStore
  engine: EnginePort
  emit: (type: string, payload: unknown) => void
  prepareFrame: (attemptId: string, frameIndex: number) => Promise<AssetReference>
  /** The rendering service's queue-semantic redispatch (wave 1): the sweep's
   *  PROVEN-never-landed arm dispatches the frozen attempt through it instead
   *  of stranding the user's submission as interrupted. Absent (older
   *  constructions) the arm keeps the pre-wave-1 interrupted verdict. */
  redispatch?: (attemptId: string) => Promise<'submitted' | 'failed' | 'uncertain' | null>
  /** Bounded auto-retries AFTER the first preparation try (default 2 — a
   *  rejecting preparer gets 3 chances before preparation is marked failed). */
  maxAutoPrepRetries?: number
  /** The observation poll cadence in ms (default 500; tests tighten it). */
  pollMs?: number
  /** How many consecutive engine-unreachable polls before the watcher gives
   *  up and leaves the attempt reconciliation-pending (default 3). */
  maxPollErrors?: number
}) {
  const { store, engine, emit, prepareFrame } = deps
  const redispatch = deps.redispatch
  const maxAutoPrepRetries = deps.maxAutoPrepRetries ?? 2
  const pollMs = deps.pollMs ?? 500
  const maxPollErrors = deps.maxPollErrors ?? 3

  /** attemptId → watcher. A watcher is a stoppable handle around one poll
   *  loop; observe() replaces any existing watcher for the attempt. */
  const watchers = new Map<string, { stopped: boolean; timer?: ReturnType<typeof setTimeout> }>()

  function attemptOrThrow(attemptId: string): AnimationAttemptRow {
    const attempt = store.getAttempt(attemptId)
    if (!attempt) throw new AnimationRuleError(`No attempt with id ${attemptId}.`, 404)
    return attempt
  }

  function setExecution(attempt: AnimationAttemptRow, state: AnimationAttemptRow['execution']['state'], extra?: { engineJobId?: string; failureReason?: string }): void {
    store.setAttemptExecution(attempt.id, { state, ...(extra?.engineJobId !== undefined ? { engineJobId: extra.engineJobId } : {}), ...(extra?.failureReason !== undefined ? { failureReason: extra.failureReason } : {}) })
    emit('animation.attempt.updated', { attemptId: attempt.id, documentId: attempt.documentId, execution: state })
  }

  /** The deterministic frame proposal — mid-clip. The proposal is a STARTING
   *  POINT for review (§7.2.2: the system proposes, the user selects); Set K
   *  measured approach-then-hold arcs, so the middle of the clip is past the
   *  approach and before the long hold. */
  function proposeFrameIndex(frameCount: number): number {
    return Math.max(0, Math.floor(frameCount / 2))
  }

  /** §8.2 landing + §11.4 preparation, from engine truth. Idempotent at
   *  every step: a landed attempt is returned untouched (duplicate
   *  completion), preparation resumes when it never finished. Returns the
   *  engine status observed (the caller decides whether to keep watching). */
  async function resolveFromEngine(attemptId: string): Promise<EngineJobStatus['status'] | 'untouched' | 'reconciling'> {
    let attempt = store.getAttempt(attemptId)
    if (!attempt) return 'untouched'
    if (TERMINAL_STATES.has(attempt.execution.state)) {
      // Ready but preparation never completed (a crash between landing and
      // proposing) → resume it; every other terminal state is final.
      if (attempt.execution.state === 'ready' && (attempt.preparation.state === 'pending' || attempt.preparation.state === 'failed') && attempt.result) {
        await prepareProposedFrame(attempt, attempt.result.candidate.frameCount)
      }
      return 'untouched'
    }
    if (!attempt.engineJobId) return 'untouched' // uncertain dispatch — reconcile() owns the search

    let status: EngineJobStatus
    try {
      status = await engine.history(attempt.engineJobId)
    } catch {
      setExecution(attempt, 'reconciling') // engine unreachable: pending, preserved (§11.4)
      return 'reconciling'
    }
    // The await above let concurrent resolutions run (a cancel, a duplicate
    // event, another watcher tick): re-read the row and never DOWNGRADE a
    // state that settled while we were asking the engine — a zombie tick's
    // stale snapshot must not overwrite the fresh truth.
    const fresh = store.getAttempt(attemptId)
    if (!fresh || TERMINAL_STATES.has(fresh.execution.state)) return 'untouched'
    attempt = fresh

    if (status.status === 'running') {
      setExecution(attempt, 'rendering')
      return 'running'
    }
    if (status.status === 'lost') {
      setExecution(attempt, 'interrupted') // confirmed lost — explicit retry only (§11.4)
      emit('animation.attempt.lost', { attemptId: attempt.id, documentId: attempt.documentId })
      return 'lost'
    }
    if (status.status === 'error') {
      // The durable failure detail (wave 1, the live review's #6): the
      // engine's own history carries no structured reason for an execution
      // error, so the named reason states exactly what was observed — never
      // invented detail, never raw engine output.
      setExecution(attempt, 'failed', { failureReason: 'The engine reported an execution error while rendering this attempt (the engine\'s history record holds the error status). A re-roll starts a fresh take.' })
      emit('animation.attempt.failed', { attemptId: attempt.id, documentId: attempt.documentId, reason: 'engine-error' })
      return 'error'
    }
    if (status.status === 'interrupted') {
      // The engine remembers an interrupt (ours, or a lost race): whatever
      // landed stays landed; nothing landed means cancelled.
      if (attempt.result) {
        setExecution(attempt, 'ready')
        return 'done'
      }
      setExecution(attempt, 'cancelled')
      emit('animation.attempt.cancelled', { attemptId: attempt.id, documentId: attempt.documentId })
      return 'interrupted'
    }

    // done — THE LANDING PATH.
    const outputs = status.outputs ?? []
    if (outputs.length === 0) {
      setExecution(attempt, 'failed', { failureReason: 'The engine reported the render finished but listed no output artifacts — nothing could land. A re-roll starts a fresh take.' })
      emit('animation.attempt.failed', { attemptId: attempt.id, documentId: attempt.documentId, reason: 'engine-reported-done-without-outputs' })
      return 'error'
    }
    setExecution(attempt, 'preparing')
    // The PRIMARY artifact (outputs[0]) is the clip the candidate lands from;
    // its kind rides the artifact itself (a video-first listing — the
    // animation lane's save tail — lands a video clip, task 11's kind-aware
    // outputs), never a hardcoded guess.
    const primary = outputs[0]
    const landed = store.landCandidate(attempt.id, {
      assetReference: { assetId: primary.relPath, relPath: primary.relPath, kind: primary.kind },
      frameCount: primary.frameCount,
      // The store computes the truth from the frozen revision vs the current
      // document (§8.2) — the owner never claims otherwise.
      earlierRevision: false,
    })
    await prepareProposedFrame(attempt, landed.attempt.result?.candidate.frameCount ?? primary.frameCount)
    setExecution(attempt, 'ready')
    emit('animation.attempt.ready', {
      attemptId: attempt.id,
      documentId: attempt.documentId,
      candidate: landed.attempt.result?.candidate ?? null,
    })
    return 'done'
  }

  /** The proposed-frame preparation with bounded auto-retry (§11.4): the
   *  first try plus maxAutoPrepRetries; a failure leaves preparation failed
   *  with the reason and the clip PRESERVED — retryPreparation is the
   *  explicit way forward. */
  async function prepareProposedFrame(attempt: AnimationAttemptRow, frameCount: number): Promise<void> {
    const frameIndex = proposeFrameIndex(frameCount)
    let lastError = 'frame preparation failed'
    for (let tries = 0; tries <= maxAutoPrepRetries; tries += 1) {
      try {
        const asset = await prepareFrame(attempt.id, frameIndex)
        store.setAttemptPreparation(attempt.id, { state: 'proposed', proposedFrameIndex: frameIndex })
        emit('animation.attempt.frame-prepared', { attemptId: attempt.id, frameIndex, assetReference: asset })
        return
      } catch (failure) {
        lastError = failure instanceof Error ? failure.message : String(failure)
      }
    }
    store.setAttemptPreparation(attempt.id, { state: 'failed', error: lastError })
    emit('animation.attempt.preparation-failed', { attemptId: attempt.id, error: lastError })
  }

  /** Events from the engine feed (the realtime hub's channel, or a test
   *  driving the same vocabulary). Progress/executing are direct state
   *  updates; done/error/interrupted are HINTS — the outputs come from the
   *  engine's history, so those events resolve through resolveFromEngine
   *  with a bounded settle-wait (an engine may broadcast success a beat
   *  before its history row exists). */
  function onAttemptEvent(attemptId: string, event: { type: 'progress' | 'executing' | 'done' | 'error' | 'interrupted'; value?: number; max?: number }): void {
    const attempt = store.getAttempt(attemptId)
    if (!attempt || TERMINAL_STATES.has(attempt.execution.state)) return
    if (event.type === 'progress' || event.type === 'executing') {
      const progress = event.type === 'progress' && typeof event.value === 'number' && typeof event.max === 'number' && event.max > 0
        ? { value: Math.max(0, Math.floor(event.value)), max: Math.floor(event.max) }
        : undefined
      // queued → rendering on the engine's first sign of life; the store
      // retains the last observed progress when an event carries none.
      const next = { state: 'rendering' as const, ...(progress !== undefined && progress.value <= progress.max ? { progress } : {}) }
      store.setAttemptExecution(attemptId, next)
      emit('animation.attempt.updated', { attemptId, documentId: attempt.documentId, execution: 'rendering', progress: next.progress })
      return
    }
    if (event.type === 'error' || event.type === 'interrupted') {
      void settleAndResolve(attemptId, event.type === 'error' ? ['error'] : ['interrupted', 'done'])
      return
    }
    void settleAndResolve(attemptId, ['done'])
  }

  /** Bounded wait for the engine's history to reflect the announced
   *  terminal status, then the history-driven resolution. The wait is the
   *  settle-or-poll convention: a genuine failure (the engine never records
   *  the completion) still resolves from whatever history DOES hold. */
  async function settleAndResolve(attemptId: string, wanted: ReadonlyArray<EngineJobStatus['status']>): Promise<void> {
    const deadline = Date.now() + 2000
    for (;;) {
      let status: EngineJobStatus | null = null
      try {
        const attempt = store.getAttempt(attemptId)
        if (!attempt || !attempt.engineJobId) return
        status = await engine.history(attempt.engineJobId)
      } catch {
        status = null // unreachable this tick — keep waiting within the bound
      }
      if (status !== null && (wanted.includes(status.status) || status.status === 'lost')) break
      if (Date.now() >= deadline) break
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    try {
      await resolveFromEngine(attemptId)
    } catch (failure) {
      // A landing failure is never a drop: the attempt stays in flight and
      // the next observation/reconciliation retries it (idempotently).
      const attempt = store.getAttempt(attemptId)
      if (attempt && IN_FLIGHT_STATES.has(attempt.execution.state)) setExecution(attempt, 'reconciling')
      emit('animation.attempt.landing-error', { attemptId, error: failure instanceof Error ? failure.message : String(failure) })
    }
  }

  /** Engine observation: the server watches, not the browser (§10.1). One
   *  bounded poll loop per attempt; terminal states and unreachable engines
   *  both stop it (the latter leaves the attempt reconciliation-pending). */
  function observe(attemptId: string): void {
    stopWatcher(attemptId)
    const watcher: { stopped: boolean; timer?: ReturnType<typeof setTimeout> } = { stopped: false }
    watchers.set(attemptId, watcher)
    let pollErrors = 0
    const tick = async () => {
      if (watcher.stopped) return
      try {
        const observed = await resolveFromEngine(attemptId)
        pollErrors = 0
        if (observed !== 'running') {
          // Everything but 'running' is settled or deferred: untouched = the
          // row went terminal (or vanished) under us; done/error/interrupted/
          // lost = resolved; reconciling = the engine is unreachable and the
          // sweep owns the retry.
          stopWatcher(attemptId)
          return
        }
      } catch {
        pollErrors += 1
        if (pollErrors >= maxPollErrors) {
          const attempt = store.getAttempt(attemptId)
          if (attempt && IN_FLIGHT_STATES.has(attempt.execution.state)) setExecution(attempt, 'reconciling')
          stopWatcher(attemptId)
          return
        }
      }
      if (!watcher.stopped) watcher.timer = setTimeout(() => { void tick() }, pollMs)
    }
    void tick()
  }

  function stopWatcher(attemptId: string): void {
    const watcher = watchers.get(attemptId)
    if (!watcher) return
    watcher.stopped = true
    if (watcher.timer !== undefined) clearTimeout(watcher.timer)
    watchers.delete(attemptId)
  }

  /** The boot/restart sweep (§11.4): every in-flight attempt resolves from
   *  engine truth — re-attached (running), landed idempotently (done),
   *  interrupted (confirmed lost) — and an attempt whose dispatch
   *  acknowledgment was lost resolves by ATTEMPT-IDENTIFIER SEARCH through
   *  the engine's own records (the engine request carries the id). The
   *  search walks BOTH sources: history records carry the request graph
   *  (the attempt marker), and while the queue is NON-empty the outcome is
   *  UNCERTAIN — bare queue ids cannot be correlated, so the attempt stays
   *  reconciliation-pending until the job completes into history (the next
   *  sweep lands it) or the engine quiets. NEVER a resubmit: only an
   *  reachable engine with an EMPTY queue and no history trace proves the
   *  dispatch never landed — interrupted + explicit-retry territory, not new
   *  GPU work. */
  async function reconcile(): Promise<void> {
    for (const attempt of store.attemptsInFlight()) {
      let engineJobId = attempt.engineJobId
      if (!engineJobId) {
        let found: string | null = null
        try {
          found = await engine.findJobByAttempt(attempt.id)
        } catch {
          found = null // unreachable: leave the attempt pending for the next sweep
        }
        if (found) {
          engineJobId = found
          setExecution(attempt, 'reconciling', { engineJobId: found })
        } else {
          const fresh = store.getAttempt(attempt.id)
          if (!fresh || !IN_FLIGHT_STATES.has(fresh.execution.state)) continue
          // The queue decides the miss (§11.4's "search queue/history"): the
          // queue fetch doubles as the reachability probe — a throw below is
          // an unreachable engine, which stays reconciliation-pending.
          let queue: string[] | null = null
          try {
            queue = await engine.queuedJobIds()
          } catch {
            queue = null
          }
          if (queue === null) {
            setExecution(fresh, 'reconciling') // unreachable — pending, preserved
            continue
          }
          if (queue.length > 0) {
            // Work is in flight that may be ours (bare ids cannot correlate):
            // UNCERTAIN, never 'dispatch-never-landed'. The next sweep
            // re-searches history, where the completed record carries the
            // attempt marker, and lands it — the orphan Important-1 closed.
            setExecution(fresh, 'reconciling')
            continue
          }
          // Reachable engine, empty queue, no history trace: the dispatch
          // never landed engine-side — PROOF, the §11.4 epistemics. Wave
          // 1's queue semantics: the user's submission dispatches NOW from
          // its FROZEN snapshot (the redispatch is not a resubmit — no
          // engine job ever existed, and the graph is the frozen config,
          // not a re-derivation). A dead model slot fails the attempt with
          // the NAMED reason there; an uncertain redispatch leaves the row
          // reconciliation-pending for the next sweep. Without the
          // redispatch dep the pre-wave-1 verdict stands: interrupted +
          // explicit retry only.
          if (redispatch) {
            const outcome = await redispatch(fresh.id)
            if (outcome !== null) continue // submitted, failed (named), or left pending
          }
          setExecution(fresh, 'interrupted')
          emit('animation.attempt.lost', { attemptId: fresh.id, documentId: fresh.documentId, reason: 'dispatch-never-landed' })
          continue
        }
      }
      try {
        const observed = await resolveFromEngine(attempt.id)
        if (observed === 'running') observe(attempt.id) // re-attach the watcher (§11.4)
      } catch {
        const fresh = store.getAttempt(attempt.id)
        if (fresh && IN_FLIGHT_STATES.has(fresh.execution.state)) setExecution(fresh, 'reconciling')
      }
    }
  }

  /** Cancellation racing completion (§11.4): interrupt the engine job, then
   *  resolve from history — whatever finished is PRESERVED (landed, never
   *  auto-selected, per the store's contract), what did not finish is
   *  cancelled. */
  async function cancel(attemptId: string): Promise<void> {
    const attempt = attemptOrThrow(attemptId)
    if (TERMINAL_STATES.has(attempt.execution.state)) return
    if (!attempt.engineJobId) {
      // No confirmed dispatch to interrupt. The user's intent is explicit, so
      // the attempt is cancelled outright; if the engine was secretly already
      // running it, the orphaned engine-side output never lands and never
      // selects — cancelled is terminal, the sweep skips it by design.
      setExecution(attempt, 'cancelled')
      emit('animation.attempt.cancelled', { attemptId, documentId: attempt.documentId })
      return
    }
    try {
      await engine.interrupt(attempt.engineJobId)
    } catch (failure) {
      // The interrupt itself failing (engine down) leaves the attempt
      // in flight — reconciliation settles it later; never a silent drop.
      setExecution(attempt, 'reconciling')
      emit('animation.attempt.cancel-error', { attemptId, error: failure instanceof Error ? failure.message : String(failure) })
      return
    }
    await settleAndResolve(attemptId, ['interrupted', 'done', 'error', 'lost'])
  }

  /** The explicit preparation retry (§11.4): re-prepares the proposed frame
   *  WITHOUT re-rendering — the engine is never touched. */
  async function retryPreparation(attemptId: string): Promise<void> {
    const attempt = attemptOrThrow(attemptId)
    if (!attempt.result) throw new AnimationRuleError('Only a landed clip can have its frame preparation retried.', 400)
    await prepareProposedFrame(attempt, attempt.result.candidate.frameCount)
  }

  /** Drops in-memory watchers (one attempt, or all — the restart shape for
   *  tests; production never needs the no-arg form, the process dying IS
   *  the drop). Rows keep their truth. */
  function stopObserving(attemptId?: string): void {
    if (attemptId === undefined) {
      for (const id of [...watchers.keys()]) stopWatcher(id)
      return
    }
    stopWatcher(attemptId)
  }

  return { observe, reconcile, onAttemptEvent, cancel, retryPreparation, stopObserving }
}
