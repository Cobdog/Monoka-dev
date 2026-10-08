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
   *  of stranding the user's submission as interrupted. 'aborted' (I1's
   *  gate) means the row went terminal mid-redispatch — nothing to do.
   *  Absent (older constructions) the arm keeps the pre-wave-1 interrupted
   *  verdict. */
  redispatch?: (attemptId: string) => Promise<'submitted' | 'failed' | 'uncertain' | 'aborted' | null>
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

  /** The lost-with-known-causality settle (review M-2): the engine neither
   *  queues nor remembers the job AND a user cancel is in the causal chain
   *  — the post-depose read, or the settle losing the record mid-cancel.
   *  Whatever already landed stays landed (ready); a job that never
   *  rendered settles CANCELLED — the user's own Stop is the whole truth —
   *  never the interrupted + explicit-retry vocabulary a recovery-time loss
   *  (no user action in the causal chain) earns. */
  function settleCancelLost(attemptId: string): void {
    const fresh = store.getAttempt(attemptId)
    if (!fresh || TERMINAL_STATES.has(fresh.execution.state)) return
    if (fresh.result) {
      // The output landed before the engine forgot the job — preserved.
      setExecution(fresh, 'ready')
      return
    }
    setExecution(fresh, 'cancelled')
    emit('animation.attempt.cancelled', { attemptId, documentId: fresh.documentId })
  }

  /** §8.2 landing + §11.4 preparation, from engine truth. Idempotent at
   *  every step: a landed attempt is returned untouched (duplicate
   *  completion), preparation resumes when it never finished. Returns the
   *  engine status observed (the caller decides whether to keep watching).
   *  `cause: 'cancel'` re-reads a LOST verdict through the user's Stop
   *  (settleCancelLost) instead of the recovery-time interrupted fence. */
  async function resolveFromEngine(attemptId: string, cause?: 'cancel'): Promise<EngineJobStatus['status'] | 'untouched' | 'reconciling'> {
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
      if (cause === 'cancel') {
        // The record vanished under a USER CANCEL (the known-causality
        // world — review M-2's consistency with the post-depose branch).
        settleCancelLost(attemptId)
        return 'lost'
      }
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
   *  the completion) still resolves from whatever history DOES hold.
   *  `cause: 'cancel'` (the cancel path only) settles a LOST verdict as the
   *  user's Stop, not the recovery-time interrupted fence (M-2). */
  async function settleAndResolve(attemptId: string, wanted: ReadonlyArray<EngineJobStatus['status']>, cause?: 'cancel'): Promise<void> {
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
      await resolveFromEngine(attemptId, cause)
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
          // Reachable engine, empty queue, no history trace. That evidence
          // proves "no trace exists NOW" — NOT "no engine job ever
          // existed": after an engine restart, an empty history is equally
          // consistent with ran-and-wiped, and this sweep cannot tell the
          // worlds apart. The DELIVERY VERDICT the dispatch path persisted
          // at failure time is the discriminator (fix round I-1):
          //   - 'never-delivered' — the /prompt provably never left the
          //     studio (the failure preceded the send: an offline submit).
          //     Re-driving the persisted intent repeats no GPU work, so the
          //     queue semantics apply: REDISPATCH from the frozen snapshot
          //     (the graph is the frozen config, not a re-derivation; a
          //     dead model slot fails the attempt with the NAMED reason
          //     there; an uncertain redispatch leaves the row pending).
          //   - 'uncertain' or absent — the send happened and its outcome
          //     is the engine's to know: §11.4's "engine restarted;
          //     job/output confirmed lost" world. Interrupted + explicit
          //     retry only (a user action creates a new linked attempt) —
          //     NEVER an automatic repeat of work that may already have
          //     run. Also the pre-verdict default (rows from before the
          //     verdict existed), which is the pre-wave-1 verdict exactly.
          if (redispatch && fresh.execution.dispatchVerdict === 'never-delivered') {
            const outcome = await redispatch(fresh.id)
            if (outcome !== null) continue // submitted, failed (named), aborted (went terminal mid-redispatch), or left pending
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

  /** Cancellation racing completion (§11.4): depose the engine job, then
   *  resolve from history — whatever finished is PRESERVED (landed, never
   *  auto-selected, per the store's contract), what did not finish is
   *  cancelled.
   *
   *  THE DEPOSE (Codex I3): the real /interrupt deliberately no-ops a
   *  PENDING id (server.py:1176-1192 — it only interrupts currently-running
   *  prompts), so interrupt alone cannot stop a queued job; it would render
   *  and land despite the user's Stop. While the engine still lists the job,
   *  the interrupt covers the running case and dequeue (the captured API's
   *  queue-deletion op) removes the pending entry — a job that moves
   *  pending→running between the calls is caught by the next round's
   *  interrupt, so whichever side of the queue the job is on, one of the two
   *  calls deposes it and the loop terminates. The bound only guards a
   *  wedged engine: falling through leaves the attempt to the settle below
   *  and the watcher/reconcile behind it — never a silent drop. */
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
    const engineJobId = attempt.engineJobId
    try {
      for (let round = 0; round < 5; round += 1) {
        await engine.interrupt(engineJobId)
        if (!(await engine.queuedJobIds()).includes(engineJobId)) break
        await engine.dequeue(engineJobId)
        if (!(await engine.queuedJobIds()).includes(engineJobId)) break
      }
      // The job is deposed from the queue. What the engine REMEMBERS decides
      // the settle: a history record means the job genuinely ran — resolve
      // from it (whatever finished preserved, §11.4); NO record anywhere
      // means it never rendered — a pending id just dequeued, an interrupt
      // the engine recorded before any output, or a job lost to a restart.
      // The last is 'lost' by the port's settle-window convention; here it
      // follows the CANCEL the user just issued, not the dispatch-outcome
      // vocabulary: whatever already landed stays landed, the execution
      // settles cancelled.
      let remembered: EngineJobStatus
      try {
        remembered = await engine.history(engineJobId)
      } catch (failure) {
        // The engine went unreachable mid-cancel (history's own queue read
        // is the reachability probe) — the reconciling branch below
        // applies, carrying the real transport error.
        throw new Error(`the engine became unreachable while the cancellation resolved the job (${failure instanceof Error ? failure.message : String(failure)})`)
      }
      if (remembered.status === 'lost') {
        settleCancelLost(attemptId)
        return
      }
    } catch (failure) {
      // The depose itself failing (engine down) leaves the attempt
      // in flight — reconciliation settles it later; never a silent drop.
      setExecution(attempt, 'reconciling')
      emit('animation.attempt.cancel-error', { attemptId, error: failure instanceof Error ? failure.message : String(failure) })
      return
    }
    // The cause rides the settle too (M-2): if the engine loses the record
    // between the direct read above and this poll, the settle's lost arm
    // settles the SAME cancel-time truth — cancelled, never interrupted.
    await settleAndResolve(attemptId, ['interrupted', 'done', 'error', 'lost'], 'cancel')
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
