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
 *   - carry registration (extension lane §7): media landing and artifact
 *     registration are INDEPENDENT readiness halves — the registration is
 *     kicked detached after the standing ready transition (a carry failure
 *     never holds the playable clip hostage), retries bounded like frame
 *     preparation (file-present failures) or settles terminal
 *     not-produced (no file), and resumes idempotently after a crash or a
 *     restart through the boot sweep — never a re-render;
 *   - cancellation races completion → whatever the engine finished is
 *     preserved and never auto-selected (the store enforces the
 *     never-selects half).
 *
 * State ownership: execution/preparation rows are written only through the
 * store's setters (append-only discipline, §11.2). The in-memory watchers
 * are OBSERVATION only — losing them loses nothing durable.
 */
import { createHash, randomUUID } from 'node:crypto'
import type { AssetReference, ContinuationArtifactRecord } from '../../shared/animation/types'
import { readCarrySaveRecipe } from '../../shared/animation/types'
import { carryRequested } from '../../shared/animation/graphs'
import { AnimationRuleError, type AnimationAttemptRow, type AnimationStore } from './store'
import type { AnimationBlobSink, EnginePort, EngineJobStatus } from './rendering'

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
  /** The content-addressed blob sink the carry registration registers into
   *  (extension lane §7: the discovered engine file is digested and
   *  registered as the studio-owned continuation artifact — the engine-side
   *  file is a transient handoff from that moment on). */
  blobs: AnimationBlobSink
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
  /** Bounded auto-retries AFTER the first carry-registration try (default 2,
   *  the preparation bound's twin — a failing fetch/verify/register gets 3
   *  chances before the row stays `registering` with its error, the explicit
   *  retry the way forward). */
  maxAutoCarryRetries?: number
  /** The observation poll cadence in ms (default 500; tests tighten it). */
  pollMs?: number
  /** How many consecutive engine-unreachable polls before the watcher gives
   *  up and leaves the attempt reconciliation-pending (default 3). */
  maxPollErrors?: number
}) {
  const { store, engine, emit, prepareFrame, blobs } = deps
  const redispatch = deps.redispatch
  const maxAutoPrepRetries = deps.maxAutoPrepRetries ?? 2
  const maxAutoCarryRetries = deps.maxAutoCarryRetries ?? 2
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
      // proposing) → resume it; every other terminal state is final. The
      // carry registration resumes the same way (§7: a crash between landing
      // and the record re-drives idempotently — never a re-render).
      if (attempt.execution.state === 'ready' && attempt.result) {
        if (attempt.preparation.state === 'pending' || attempt.preparation.state === 'failed') {
          await prepareProposedFrame(attempt, attempt.result.candidate.frameCount)
        }
        if (continuationPending(attempt)) void registerCarryArtifact(attempt.id)
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
    // THE READINESS SPLIT (extension lane §7/§8): playable readiness is NOW
    // durable — the carry registration runs DETACHED, so a slow or failing
    // registration never holds the standing ready transition (or the ready
    // event) hostage. The synchronous prologue below writes `registering`
    // before the first await, which is what makes the split observable.
    if (carryRequested(attempt.snapshot)) void registerCarryArtifact(attempt.id)
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

  // ---- the carry registration (extension lane §7 — the readiness split's
  // continuation half; the frame-preparation pattern applied to the artifact)

  /** In-flight registrations (double-kick dedupe: the landing path, the
   *  terminal-resume branch, and the boot sweep can all reach for the same
   *  attempt; two concurrent registrations would mint two artifact ids for
   *  one digest). */
  const registeringCarry = new Set<string>()

  /** True when a LANDED attempt owes a carry registration: it froze the carry
   *  flag (the same strict snapshot read the tween builder gates on) and its
   *  continuation has not settled into one of the three settled states —
   *  registered, provably absent (no file), or observed-away (unavailable). */
  function continuationPending(attempt: AnimationAttemptRow): boolean {
    return attempt.result !== null
      && carryRequested(attempt.snapshot)
      && (attempt.continuation.state === 'absent' || attempt.continuation.state === 'registering')
  }

  /** §7's server-side registration: DISCOVER the saved file at the
   *  deterministic receipt path (the engine port's fetch — a 404 is the
   *  no-file verdict), VERIFY it (the safetensors metadata's save-recipe
   *  version, read FROM the file; the sha256 digest over the bytes), and
   *  REGISTER it content-addressed in the studio's blob store together with
   *  the ContinuationArtifactRecord. The two retry shapes (the brief's
   *  frame-preparation pattern):
   *    - file EXISTS but discovery/verification/registration fails → bounded
   *      auto-retries, then the row stays `registering` with its error —
   *      retryContinuationRegistration is the explicit way forward, and the
   *      engine is only ever READ (no re-render);
   *    - NO file at the path → `not-produced`, TERMINAL for this attempt:
   *      the in-graph Save never ran, a new alternative (an explicit
   *      re-roll) is the user's path, and the clip stays playable.
   *  Idempotent by construction (content addressing; the record write is
   *  wholesale) and re-entrant-safe through the registeringCarry set. The
   *  bookend STATE WRITES are contained with the loop body: an IO failure of
   *  either lands in the registration-failed event — never an unhandled
   *  rejection off a detached kick, never a leaked in-flight id. */
  async function registerCarryArtifact(attemptId: string): Promise<'ready' | 'not-produced' | 'failed'> {
    const attempt = store.getAttempt(attemptId)
    if (!attempt || !attempt.result) return 'failed' // nothing landed — not this function's row
    if (attempt.continuation.state !== 'absent' && attempt.continuation.state !== 'registering') return 'failed' // already settled (registered / not-produced / unavailable)
    if (registeringCarry.has(attemptId)) return 'failed' // already in flight — the kick converges there
    registeringCarry.add(attemptId)
    let lastError = 'carry artifact registration failed'
    try {
      // THE BOOKENDS LIVE INSIDE THE CONTAINED REGION (review M-1): the
      // registering write, the loop, and the exhausted write/emit. A bookend
      // STATE-WRITE failure (the IO class — disk-full; the payloads cannot
      // fail validation) lands in the catch's event instead of an unhandled
      // rejection off a detached kick, and the finally cleans the in-flight
      // set on EVERY path — so a later kick, the AWAITED explicit retry
      // included, always runs rather than silently no-opping at the guard.
      store.setAttemptContinuation(attemptId, { state: 'registering' })
      for (let tries = 0; tries <= maxAutoCarryRetries; tries += 1) {
        try {
          const bytes = await engine.fetchCarryArtifact(attemptId)
          if (bytes === null) {
            // No file at the receipt path: the pack's Save node never
            // completed inside the source render — §7's named condition,
            // terminal for THIS attempt, playable preserved.
            store.setAttemptContinuation(attemptId, { state: 'not-produced' })
            emit('animation.attempt.continuation-not-produced', { attemptId, documentId: attempt.documentId })
            return 'not-produced'
          }
          const saveRecipeVersion = readCarrySaveRecipe(bytes)
          if (saveRecipeVersion === null) {
            // The file exists but is not the pack's container: a verification
            // failure, the RETRYABLE class (bounded, then explicit) — never
            // registered on a guess.
            throw new Error('the saved carry file does not carry the pack\'s safetensors metadata (its save-recipe version is unreadable) — the artifact cannot be registered unverified')
          }
          const digest = createHash('sha256').update(bytes).digest('hex')
          const registered = blobs.registerBytes('latent', bytes, `carry-${attemptId}.safetensors`)
          const artifact: ContinuationArtifactRecord = {
            artifactId: randomUUID(),
            sourceAttemptId: attemptId,
            digest,
            saveRecipeVersion,
            producedAt: Date.now(),
          }
          store.setAttemptContinuation(attemptId, { state: 'ready', artifact, relPath: registered.relPath })
          emit('animation.attempt.continuation-ready', {
            attemptId,
            documentId: attempt.documentId,
            artifact: { artifactId: artifact.artifactId, digest: artifact.digest },
          })
          return 'ready'
        } catch (failure) {
          lastError = failure instanceof Error ? failure.message : String(failure)
        }
      }
      // Bounded retries exhausted with the file still unfetchable/unverifiable:
      // the row keeps the retryable `registering` state plus the reason — the
      // explicit action (or a later boot sweep) re-drives it. The clip above
      // stays landed and playable regardless.
      store.setAttemptContinuation(attemptId, { state: 'registering', error: lastError })
      emit('animation.attempt.continuation-registration-failed', { attemptId, documentId: attempt.documentId, error: lastError })
      return 'failed'
    } catch (bookend) {
      // A bookend failure (one of the two state writes itself — the IO
      // class): the row keeps whatever truth it holds for the sweep or the
      // explicit retry to re-drive; the event names the observed cause.
      emit('animation.attempt.continuation-registration-failed', { attemptId, documentId: attempt.documentId, error: bookend instanceof Error ? bookend.message : String(bookend) })
      return 'failed'
    } finally {
      registeringCarry.delete(attemptId)
    }
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
    // The §7 registration resume: a LANDED carry whose registration never
    // settled (a studio crash between the media landing and the record, or
    // a boot under an unreachable engine) re-drives here — idempotent
    // discovery/digest/registration against the engine's DISK-BACKED output
    // folder, never a re-render. Detached like the landing-path kick: a slow
    // or failing registration must never stall the boot sweep.
    for (const attempt of store.landedAttempts()) {
      if (continuationPending(attempt)) void registerCarryArtifact(attempt.id)
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

  /** The explicit carry-registration retry (extension lane §7 — the
   *  registering shape's way forward): re-drives the discovery/verification/
   *  registration WITHOUT re-rendering (the engine is READ at its receipt
   *  path, never submitted to). The named conditions refuse: `not-produced`
   *  is terminal for the attempt (the re-roll is the path), and
   *  `unavailable`'s recovery is §7's explicit list (re-land the source
   *  chain / the v1.1 behavior) — never a silent re-fetch. */
  async function retryContinuationRegistration(attemptId: string): Promise<void> {
    const attempt = attemptOrThrow(attemptId)
    if (!attempt.result) throw new AnimationRuleError('Only a landed clip can have its continuation artifact registration retried.', 400)
    if (!carryRequested(attempt.snapshot)) throw new AnimationRuleError('This attempt submitted no carry save tail — there is no continuation artifact to register.', 400)
    if (attempt.continuation.state === 'ready') return // idempotent: already registered
    if (attempt.continuation.state === 'not-produced') {
      throw new AnimationRuleError('No carry file was produced for this attempt — continuation readiness is unreachable for it (the in-graph save did not complete). The clip stays playable; a new alternative (an explicit re-roll) is the path forward.', 400)
    }
    if (attempt.continuation.state === 'unavailable') {
      throw new AnimationRuleError('The continuation artifact for this attempt was registered and has since become unavailable — recovery is the explicit re-land of the source chain (or the recovery behavior when it lands), never a re-fetch. The clip itself stays playable.', 400)
    }
    await registerCarryArtifact(attemptId)
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

  return { observe, reconcile, onAttemptEvent, cancel, retryPreparation, retryContinuationRegistration, stopObserving }
}
