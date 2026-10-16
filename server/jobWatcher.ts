/**
 * The server-owned job watcher (Flux gfv5h0g — the R2 fix of the 2026-10-15
 * blind UX review): the SERVER observes ComfyUI completion and lands the
 * take itself, so a render that outlives its browser tab is never silently
 * lost. Until this module, output delivery was driven by a live surface —
 * whichever surface had a queue open wrote the take, and a render completing
 * with no surface open produced no take at all (the review's reproduced
 * defect: engine history held the mp4, jobs/canvas_output held zero rows).
 *
 * Ownership shape (the direction audit's A-1 ruling):
 *   observation  the SAME jobReducer the client poll ran drives every
 *                transition server-side — the terminal guards, the
 *                poll-failure streak, the 60-min deadline and the
 *                no-output cap all keep their reviewed semantics verbatim.
 *   landing      takes land through the document store's own appendTake
 *                (idempotent by jobId, blob-registering, supersession-safe)
 *                with the same metrics shape the client landing wrote — the
 *                SAME document-store paths, never a parallel mechanism.
 *   fabric       a `landing` envelope on the job channel announces each
 *                settled job (outcome + ids + the settled record) so
 *                surfaces become pure readers.
 *
 * The two observation feeds (both off the request path — nothing here runs
 * long synchronous work on the main loop, A-7):
 *   - the realtime hub's shared upstream WS tap: a `job_done` event
 *     schedules an immediate sweep (sub-second landing while a surface is
 *     attached and the fabric's engine socket is up);
 *   - a 1.5 s history-poll sweep over the server's own active jobs — the
 *     authoritative loop that needs NO subscriber, NO browser, and covers
 *     every WS gap (reconnects, server restarts, targeted-event misses).
 *
 * Workbench packets (manifest.h3img) keep their live-session scoring lane:
 * the watcher defers the packet landing for a grace window so an attached
 * surface lands the SCORED take; once the window passes with no taker, this
 * backstop lands it unscored (scorer:null — pick-by-eye, never a fabricated
 * verdict). appendTake's jobId idempotence means the two writers can never
 * double-land.
 */
import type { JobLifecycleEvent } from '../src/types'
import type { GenerationJob } from '../src/types'
import { extractExecutionError, isPastRunningDeadline, isTerminalStatus, reduceJobPoll, type PollObservation } from '../src/lib/jobReducer'
import { extractAllOutputFiles, extractOutputFile, extractOutputUrl } from '../src/lib/workflow'
import { webMediaUrl } from '../src/lib/mediaUrls'
import { activeLorasOf } from '../src/canvas/loraTimeline'
import type { EngineOutputDescriptor } from './engineOutputs'
import type { StudioRepository } from './repo'

const SWEEP_INTERVAL_MS = 1500

/** The live surface's head start on packet landing (scoring runs there).
 * Overridable for tests via MONOKA_JOBWATCH_PACKET_GRACE_MS. */
const PACKET_GRACE_MS = Math.max(0, Number(process.env.MONOKA_JOBWATCH_PACKET_GRACE_MS ?? 8000) || 0)

/** (ewtobuh round 2) How long a prompt must be absent from BOTH the
 *  engine's history and its queue before the restart-orphan verdict lands
 *  (two sweeps at the 1.5 s cadence — one absent read can be the torn
 *  completion window: queue drained, history not yet written; that is a
 *  blip, never a verdict). Overridable for tests via
 *  MONOKA_JOBWATCH_RESTART_CONFIRM_MS. */
const RESTART_ORPHAN_CONFIRM_MS = Math.max(0, Number(process.env.MONOKA_JOBWATCH_RESTART_CONFIRM_MS ?? 3000) || 0)

/** Bounded landing retries (m6 discipline, mirrored from the retired client
 * loop): after this many attempts the failure parks VISIBLY — an errored
 * take carrying the reason, never a silent idle tile. */
const MAX_LANDING_ATTEMPTS = 3

/** The latent slot a take records for a saved clip — byte-aligned with
 *  src/canvas/generation.ts latentPathFor (the pack's ACTUAL on-disk slot:
 *  `<folder>_<1-based %05d>.safetensors` under the engine output dir).
 *  Local here because importing the canvas generation closure server-side
 *  would drag the whole graph builder for three lines of path math. */
function latentSlotFor(facts: { folder: string; clipIndex: number }): string {
  return `${facts.folder}_${String(facts.clipIndex + 1).padStart(5, '0')}.safetensors`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** The engine's per-prompt queue membership, parsed from GET /queue's real
 *  shape: both lists carry item tuples with the prompt_id at index 1
 *  (docs/devdocs/comfyui-api §2). A null answer — no dep wired, fetch
 *  failed, malformed body — means "no queue evidence", never a guess. */
function parseQueueMembership(raw: unknown): { running: Set<string>; pending: Set<string> } | null {
  if (!isRecord(raw)) return null
  const ids = (value: unknown): Set<string> => {
    const out = new Set<string>()
    if (!Array.isArray(value)) return out
    for (const item of value) {
      if (Array.isArray(item) && typeof item[1] === 'string') out.add(item[1])
      else if (isRecord(item) && typeof item.promptId === 'string') out.add(item.promptId)
    }
    return out
  }
  return { running: ids(raw.queue_running), pending: ids(raw.queue_pending) }
}

/** The playable URL for a landed local output — the same media-route form
 *  the client landing recorded on its takes and job rows. */
function localMediaUrl(path: string): string {
  return `/api/lan/media?source=output&path=${encodeURIComponent(path)}`
}

export type JobWatcherLandingResult = {
  takeId?: string
  chainId?: string
  projectId?: string | null
  /** The packet grace is still open — a live surface gets the first chance. */
  deferred?: boolean
  /** A structural non-landing (no canvas link / chain gone) — logged, never silent. */
  note?: 'no-chain' | 'chain-gone'
  /** A retryable landing failure (bounded; parks visibly after the cap). */
  error?: string
}

export type JobWatcher = {
  /** The engine-event feed from the realtime hub's shared upstream (fast path). */
  tap(event: JobLifecycleEvent): void
  start(): void
  stop(): void
}

export function createJobWatcher(deps: {
  repo: () => StudioRepository | null
  /** Re-resolved per use: settings changes apply without a restart. */
  settings: () => { comfyUrl: string; outputDirectory: string } | null
  /** One prompt's engine history (the same /history/<id> the client polled). */
  history(promptId: string): Promise<Record<string, unknown>>
  /** (ewtobuh) The engine's whole queue (GET /queue) — the per-prompt truth
   *  that separates merely-queued from executing. Optional: without it the
   *  sweep keeps the promoted behavior for queued rows. */
  queue?(): Promise<unknown>
  resolveOutput(file: EngineOutputDescriptor): string | null
  ingest(file: EngineOutputDescriptor, kind: 'image' | 'video' | 'audio'): Promise<{ path: string }>
  emit(type: string, payload: unknown): void
  /** Hub demand signal: while jobs are active the shared upstream should be
   *  connected even with zero subscribers (the WS fast path). */
  setWatchDemand?(wanted: boolean): void
  logEvent(event: Record<string, unknown>): void
  logFailure(scope: string, error: unknown, context?: Record<string, string | number | boolean>, level?: 'debug' | 'warn' | 'error'): void
}): JobWatcher {
  let timer: ReturnType<typeof setInterval> | null = null
  let sweeping = false
  let soon: ReturnType<typeof setTimeout> | null = null
  let recoveredOnce = false
  /** Completion first-seen timestamps for packet jobs (the grace clock). */
  const packetSeenAt = new Map<string, number>()
  // (ewtobuh round 2) First-absent timestamps for the restart-orphan
  // confirmation: a prompt marked absent-both keeps its clock here until a
  // sign of life refutes the orphan or the confirm window elapses.
  const restartOrphanSeenAt = new Map<string, number>()
  /** Retryable landing failures: jobId -> { record, promptId, attempts }. */
  const pendingLandings = new Map<string, { record: GenerationJob; promptId: string; attempts: number }>

  const activeCount = () => pendingLandings.size + packetSeenAt.size

  function tick() {
    if (sweeping) return
    sweeping = true
    void (async () => {
      try {
        await sweep()
        await drainPendingLandings()
      } finally {
        sweeping = false
        deps.setWatchDemand?.(activeCount() > 0)
      }
    })()
  }

  /** The shared post-landing handling for every landing attempt (the
   *  observation path and the boot recovery): a landed/structural outcome
   *  emits; a retryable or deferred one enters the bounded retry map. */
  function settleLanding(record: GenerationJob, promptId: string, landing: JobWatcherLandingResult, envelopeExtra: Record<string, unknown> = {}) {
    if (landing.takeId) packetSeenAt.delete(record.id)
    if ((landing.error || landing.deferred) && !landing.takeId && !landing.note) {
      pendingLandings.set(record.id, { record, promptId, attempts: landing.deferred ? 0 : 1 })
    }
    deps.emit('landing', {
      outcome: 'completed',
      jobId: record.id,
      promptId,
      chainId: landing.chainId ?? null,
      projectId: landing.projectId ?? null,
      takeId: landing.takeId ?? null,
      deferred: landing.deferred === true,
      job: record,
      ...envelopeExtra,
    })
  }

  /** (Fix round 1, finding 2) One pass over SETTLED-but-unlanded jobs: a
   *  completed row with a canvas link whose take never landed (the process
   *  died mid-retry — pendingLandings is in-memory) gets its landing now.
   *  Tombstoned/absent chains stay unlanded (landJob's own guard), and a
   *  take that DOES exist (the live surface won the packet race) is
   *  skipped without a single engine fetch. */
  async function recoverUnlandedJobs(repo: StudioRepository) {
    const records = repo.listJobs(100) as Array<Record<string, unknown>>
    for (const raw of records) {
      if (!isRecord(raw)) continue
      const record = raw as unknown as GenerationJob
      const promptId = typeof record.promptId === 'string' ? record.promptId : ''
      if (record.status !== 'completed' || !promptId) continue
      const manifest = isRecord(record.manifest) ? record.manifest : null
      const canvas = manifest && isRecord(manifest.canvas) ? manifest.canvas : null
      if (!canvas || typeof canvas.chainId !== 'string' || !canvas.chainId) continue
      if (repo.documents.takeByJob(record.id)) continue
      const history = await (async () => {
        try { return await deps.history(promptId) } catch { return {} as Record<string, unknown> }
      })()
      const landing = await landJob(record, history)
      if (landing.takeId) deps.logEvent({ kind: 'jobwatch.recovered', jobId: record.id, promptId })
      settleLanding(record, promptId, landing, { recovered: true })
    }
  }

  async function sweep() {
    const repo = deps.repo()
    if (!repo) return
    // The boot recovery pass (fix round 1, finding 2) rides the FIRST
    // serialized sweep: a job this watcher (or its predecessor process)
    // settled whose landing never completed — the landing was retrying
    // when the process died, and the retry maps are in-memory — would
    // otherwise be skipped forever, because the observation loop below
    // ignores terminal rows. A narrow cousin of the R2 repro; the pass
    // closes it.
    if (!recoveredOnce) {
      recoveredOnce = true
      await recoverUnlandedJobs(repo)
    }
    const records = repo.listJobs(100) as Array<Record<string, unknown>>
    // (ewtobuh) The queue read happens at most ONCE per sweep and only when
    // a queued row actually needs the truth — idle and all-running sweeps
    // never touch the endpoint.
    const needsQueueTruth = records.some((raw) => isRecord(raw)
      && !isTerminalStatus((raw as unknown as GenerationJob).status)
      && (raw as unknown as GenerationJob).status === 'queued')
    const queueMembership = needsQueueTruth && deps.queue
      ? parseQueueMembership(await deps.queue().catch(() => null))
      : null
    for (const raw of records) {
      if (!isRecord(raw)) continue
      const record = raw as unknown as GenerationJob
      if (typeof record.id !== 'string' || !record.id || isTerminalStatus(record.status)) continue
      const promptId = typeof record.promptId === 'string' ? record.promptId : ''
      if (!promptId) {
        // Never submitted (or the tab died mid-upload): only the wall-clock
        // deadline applies — reduceJobPoll's deadline arm writes the exact
        // failure the client's retired sweep wrote.
        if (isPastRunningDeadline(record, Date.now())) {
          const reduction = reduceJobPoll(record, { kind: 'incomplete' }, Date.now())
          if (reduction.job !== record) repo.upsertJobs([reduction.job as unknown as Record<string, unknown>])
        }
        continue
      }
      await observe(repo, record, promptId, queueMembership)
    }
  }

  async function observe(repo: StudioRepository, record: GenerationJob, promptId: string, queueMembership: ReturnType<typeof parseQueueMembership> = null) {
    let history: Record<string, unknown> | null = null
    try {
      history = await deps.history(promptId)
    } catch {
      history = null
    }
    const entry = history && isRecord(history[promptId])
      ? history[promptId] as { status?: { status_str?: string; completed?: boolean } }
      : null
    const mediaType = record.mediaType === 'audio' || record.mediaType === 'image' ? record.mediaType : 'video'
    let observation: PollObservation
    if (!history) {
      observation = { kind: 'pollFailed' }
    } else if (entry?.status?.status_str === 'error') {
      // Structural failure capture: node/class + a SANITIZED reason — never
      // the raw exception text, which can echo input values.
      const detail = extractExecutionError(history, promptId)
      observation = detail
        ? { kind: 'executionError', node: detail.node, nodeType: detail.nodeType, reason: detail.reason }
        : { kind: 'executionError', reason: '' }
    } else if (entry?.status?.completed) {
      // Attribute the output by the exact filename the engine reported —
      // never by the newest file on disk. A descriptor that resolves
      // remotely but not locally still completes the job (fetched + streamed
      // through the ingest seam below, exactly like the client landing).
      const file = extractOutputFile(history, promptId, mediaType)
      if (file) {
        const local = deps.resolveOutput(file)
        if (local) {
          observation = { kind: 'completed', outputUrl: localMediaUrl(local), localOutputPath: local }
        } else {
          try {
            const ingested = await deps.ingest(file, mediaType)
            observation = { kind: 'completed', outputUrl: localMediaUrl(ingested.path), localOutputPath: ingested.path }
          } catch {
            // The fetch can fail transiently (engine restarting): complete
            // against the REMOTE descriptor (the landing retries + parks
            // visibly if it never resolves) — never spin "running" on a
            // render the engine already finished.
            const settings = deps.settings()
            const remote = settings ? extractOutputUrl(history, promptId, settings.comfyUrl, mediaType) : undefined
            // The same playable translation the client landing applied
            // (webMediaUrl — pure): the stored row stays servable, never a
            // bare monoka-media:// descriptor.
            observation = { kind: 'completed', outputUrl: webMediaUrl(remote) ?? remote ?? '', localOutputPath: record.localOutputPath }
          }
        }
      } else {
        observation = { kind: 'completedNoLocalOutput' }
      }
    } else {
      // (ewtobuh) History is silent for a queued prompt — the engine's
      // /queue answer is what says whether it is pending (stay queued) or
      // executing (promote); no queue evidence keeps the promoted behavior.
      const engineQueue = queueMembership
        ? queueMembership.pending.has(promptId)
          ? 'pending'
          : queueMembership.running.has(promptId)
            ? 'running'
            : 'absent'
        : undefined
      // (ewtobuh round 2) THE RESTART ORPHAN: a REACHABLE engine that knows
      // the prompt nowhere — no history entry, no queue slot — has lost the
      // work (ComfyUI never resumes across a restart). Confirmed across
      // sweeps before the verdict; the young window reads as a held
      // 'absent' observation, never a phantom promote.
      if (!entry && engineQueue === 'absent') {
        const firstAbsent = restartOrphanSeenAt.get(promptId)
        if (firstAbsent !== undefined && Date.now() - firstAbsent >= RESTART_ORPHAN_CONFIRM_MS) {
          restartOrphanSeenAt.delete(promptId)
          observation = { kind: 'restartOrphan' }
        } else {
          restartOrphanSeenAt.set(promptId, firstAbsent ?? Date.now())
          observation = { kind: 'incomplete', engineQueue: 'absent' }
        }
      } else {
        // Any sign of life — a history entry or a queue slot — refutes the
        // orphan; the confirmation clock restarts.
        restartOrphanSeenAt.delete(promptId)
        observation = { kind: 'incomplete', ...(engineQueue !== undefined ? { engineQueue } : {}) }
      }
    }
    const reduction = reduceJobPoll(record, observation, Date.now())
    if (reduction.job !== record) repo.upsertJobs([reduction.job as unknown as Record<string, unknown>])
    if (reduction.transitionedTo === 'completed') {
      const landing = await landJob(reduction.job, history ?? {})
      // A retryable landing (engine output fetch failed, output row
      // unreachable, or the packet grace still open) enters the bounded
      // retry map — parked visibly at the cap, the m6 discipline.
      settleLanding(reduction.job, promptId, landing)
    } else if (reduction.transitionedTo === 'failed') {
      deps.logEvent({ kind: 'jobwatch.failed', jobId: reduction.job.id, promptId, reason: (reduction.job.error ?? '').slice(0, 160) })
      // `failureKind` rides the envelope so a live surface can tell an
      // execution error (its one crash retry applies, r3q1o49) from an
      // engine/deadline failure (the settled reason stands).
      deps.emit('landing', { outcome: 'failed', jobId: reduction.job.id, promptId, failureKind: observation.kind, job: reduction.job })
    }
  }

  /** Lands one completed job's take. Returns a retryable { error } shape for
   *  transient failures — the caller parks them visibly after the cap. */
  async function landJob(record: GenerationJob, history: Record<string, unknown>): Promise<JobWatcherLandingResult> {
    const repo = deps.repo()
    if (!repo) return { error: 'the studio database is unavailable' }
    const documents = repo.documents
    const manifest = isRecord(record.manifest) ? record.manifest : null
    const canvas = manifest && isRecord(manifest.canvas) ? manifest.canvas : null
    const chainId = canvas && typeof canvas.chainId === 'string' ? canvas.chainId : null
    const projectId = canvas && typeof canvas.projectId === 'string' ? canvas.projectId : null
    if (!chainId) {
      // A completed render with no canvas link (a workbench-session job, a
      // character/location project, a movie link): the settled job row with
      // its outputUrl IS the durable record. Logged — never a silent drop.
      deps.logEvent({ kind: 'jobwatch.landing-skipped', jobId: record.id, reason: 'no-canvas-link' })
      return { note: 'no-chain' }
    }
    const chain = documents.getChain(chainId)
    if (!chain || chain.deletedAt !== null) {
      deps.logEvent({ kind: 'jobwatch.landing-skipped', jobId: record.id, reason: 'chain-missing', chainId })
      return { note: 'chain-gone', chainId, projectId }
    }
    const mediaType = record.mediaType === 'audio' || record.mediaType === 'image' ? record.mediaType : 'video'
    // The packet lane keeps its live-session scoring: grace first, then the
    // unscored backstop (appendTake's jobId idempotence arbitrates the race).
    if (manifest && isRecord(manifest.h3img)) {
      const seenAt = packetSeenAt.get(record.id) ?? Date.now()
      packetSeenAt.set(record.id, seenAt)
      if (Date.now() - seenAt < PACKET_GRACE_MS) return { deferred: true, chainId, projectId }
      const landed = await landPacket(documents, record, chain.id, history, manifest.h3img)
      return { ...landed, chainId, projectId }
    }
    const landed = await landSingle(documents, record, chain.id, history, mediaType, manifest)
    return { ...landed, chainId, projectId }
  }

  /** The single-artifact landing (video / audio / T=1 stills): the metrics
   *  shape the retired client loop wrote, byte-for-byte in intent — kind,
   *  geometry, source path, remote provenance, motion context, LoRA truth,
   *  and the visible landingError when a fetch could not land bytes. */
  async function landSingle(documents: StudioRepository['documents'], record: GenerationJob, chainId: string, history: Record<string, unknown>, mediaType: 'video' | 'audio' | 'image', manifest: Record<string, unknown> | null): Promise<JobWatcherLandingResult> {
    const promptId = record.promptId ?? ''
    const descriptor = promptId ? extractOutputFile(history, promptId, mediaType) : undefined
    let sourcePath: string | null = record.localOutputPath ?? null
    let remoteFetched = false
    let failureReason: string | null = sourcePath ? null : 'the render finished without a local output file'
    if (!sourcePath && descriptor) {
      try {
        const ingested = await deps.ingest(descriptor, mediaType)
        sourcePath = ingested.path
        remoteFetched = true
        failureReason = null
      } catch (error) {
        return { error: `the engine output could not be fetched: ${error instanceof Error ? error.message : String(error)}` }
      }
    }
    if (failureReason && !sourcePath) return { error: failureReason }
    const settings = deps.settings()
    const motionFacts = manifest && isRecord(manifest.motionContext)
      && typeof manifest.motionContext.folder === 'string' && typeof manifest.motionContext.clipIndex === 'number'
      ? manifest.motionContext as { folder: string; clipIndex: number }
      : null
    const latentPath = motionFacts && settings?.outputDirectory
      ? `${settings.outputDirectory.replace(/\/+$/, '')}/${latentSlotFor(motionFacts)}`
      : null
    const metrics: Record<string, unknown> = {
      kind: mediaType,
      duration: record.duration,
      width: record.width,
      height: record.height,
      sourcePath,
      outputUrl: record.outputUrl ?? null,
      ...(remoteFetched && descriptor ? { remoteProvenance: { fetched: true, filename: descriptor.filename, subfolder: descriptor.subfolder ?? null, type: descriptor.type ?? null } } : {}),
      ...(motionFacts ? { motionContext: motionFacts } : {}),
      ...activeLorasOf(manifest),
    }
    const take = appendWithOutput(documents, chainId, record.id, sourcePath ? [sourcePath] : [], { ...(latentPath ? { latentPath } : {}), metrics })
    registerVideoAsset(record, sourcePath, mediaType)
    return { takeId: take.id }
  }

  /** The packet backstop: every frame descriptor, in frame order, landed as
   *  ONE take whose artifacts are the N frame paths — scorer:null (the
   *  scoring lane belongs to the live surface; this is the orphan rescue). */
  async function landPacket(documents: StudioRepository['documents'], record: GenerationJob, chainId: string, history: Record<string, unknown>, provenance: Record<string, unknown>): Promise<JobWatcherLandingResult> {
    const promptId = record.promptId ?? ''
    // The live surface won the race — its SCORED take stands.
    const existing = documents.takeByJob(record.id)
    if (existing) return { takeId: existing.id }
    const descriptors = promptId ? extractAllOutputFiles(history, promptId, 'image') : []
    const artifacts: string[] = []
    let failure: string | null = null
    for (const descriptor of descriptors) {
      try {
        const ingested = await deps.ingest(descriptor, 'image')
        artifacts.push(ingested.path)
      } catch (error) {
        failure = `frame ${artifacts.length + 1} could not be fetched: ${error instanceof Error ? error.message : String(error)}`
        break
      }
    }
    if (!artifacts.length) return { error: failure ?? 'the render finished without image outputs' }
    const metrics: Record<string, unknown> = {
      kind: 'image',
      duration: 0,
      width: record.width,
      height: record.height,
      sourcePath: artifacts[0],
      outputUrl: record.outputUrl ?? null,
      ...(failure ? { landingError: failure, framesLanded: artifacts.length } : {}),
      h3img: {
        ...provenance,
        frames: artifacts.length,
        canonicalFrameIndex: 0,
        scorer: null,
      },
    }
    const take = appendWithOutput(documents, chainId, record.id, artifacts, { metrics })
    return { takeId: take.id, ...(failure ? { error: failure } : {}) }
  }

  function appendWithOutput(documents: StudioRepository['documents'], chainId: string, jobId: string, artifacts: string[], extra: { latentPath?: string; metrics: Record<string, unknown> }) {
    let outputId = documents.listOutputs(chainId)[0]?.id ?? null
    if (!outputId) outputId = documents.createOutput({ chainId, substrates: ['decoded'] }).id
    return documents.appendTake({
      outputId,
      jobId,
      artifacts,
      ...(extra.latentPath ? { latentPath: extra.latentPath } : {}),
      metrics: extra.metrics,
    })
  }

  /** The frame-indexed asset record the client's landing registered (the
   *  filmstrip sheet generates lazily on first view — nothing to warm here).
   *  Best-effort: a registration failure never fails the landing. */
  function registerVideoAsset(record: GenerationJob, sourcePath: string | null, mediaType: 'video' | 'audio' | 'image') {
    const repo = deps.repo()
    if (!repo || !sourcePath || mediaType !== 'video') return
    try {
      repo.upsertAsset({
        id: sourcePath,
        kind: 'video',
        path: sourcePath,
        durationMs: Math.round((Number.isFinite(record.duration) ? record.duration : 0) * 1000),
        width: record.width,
        height: record.height,
      })
    } catch (error) {
      deps.logFailure('jobwatch/asset-register', error, undefined, 'debug')
    }
  }

  /** Bounded retry drain (the m6 discipline): a transient landing failure
   *  retries on later ticks; a deferred packet waits out its grace window
   *  (the live surface's scoring lane); past the cap the failure parks
   *  VISIBLY as an errored take carrying the reason (never a silent idle). */
  async function drainPendingLandings() {
    const repo = deps.repo()
    if (!repo || pendingLandings.size === 0) return
    for (const [jobId, pending] of Array.from(pendingLandings.entries())) {
      pendingLandings.delete(jobId)
      const history = await (async () => {
        try { return await deps.history(pending.promptId) } catch { return {} as Record<string, unknown> }
      })()
      const landing = await landJob(pending.record, history)
      if (landing.deferred && !landing.takeId) {
        // The grace window is still open — a live surface may land the
        // scored packet; this entry requeues untouched until the window
        // passes, then the backstop lands it.
        pendingLandings.set(jobId, pending)
        continue
      }
      if (landing.takeId || landing.note) {
        if (landing.takeId) packetSeenAt.delete(jobId)
        deps.emit('landing', {
          outcome: 'completed',
          jobId,
          promptId: pending.promptId,
          chainId: landing.chainId ?? null,
          projectId: landing.projectId ?? null,
          takeId: landing.takeId ?? null,
          job: pending.record,
        })
        continue
      }
      pending.attempts += 1
      if (pending.attempts >= MAX_LANDING_ATTEMPTS) {
        parkLandingFailure(repo.documents, pending, history, landing.error ?? 'the landing failed')
        deps.emit('landing', {
          outcome: 'completed',
          jobId,
          promptId: pending.promptId,
          chainId: landing.chainId ?? null,
          projectId: landing.projectId ?? null,
          takeId: null,
          job: pending.record,
        })
        continue
      }
      pendingLandings.set(jobId, pending)
    }
  }

  /** The visible park: an errored take (artifacts empty, the reason + the
   *  preserved descriptor in metrics) on the chain the render belonged to. */
  function parkLandingFailure(documents: StudioRepository['documents'], pending: { record: GenerationJob; promptId: string; attempts: number }, history: Record<string, unknown>, reason: string) {
    const manifest = isRecord(pending.record.manifest) ? pending.record.manifest : null
    const canvas = manifest && isRecord(manifest.canvas) ? manifest.canvas : null
    const chainId = canvas && typeof canvas.chainId === 'string' ? canvas.chainId : null
    deps.logFailure('jobwatch/landing', new Error(reason), { jobId: pending.record.id, attempts: pending.attempts }, 'warn')
    if (!chainId) return
    try {
      const chain = documents.getChain(chainId)
      if (!chain || chain.deletedAt !== null) return
      const mediaType = pending.record.mediaType === 'audio' || pending.record.mediaType === 'image' ? pending.record.mediaType : 'video'
      const descriptor = extractOutputFile(history, pending.promptId, mediaType)
      appendWithOutput(documents, chainId, pending.record.id, [], {
        metrics: {
          kind: mediaType,
          duration: pending.record.duration,
          width: pending.record.width,
          height: pending.record.height,
          sourcePath: pending.record.localOutputPath ?? null,
          outputUrl: pending.record.outputUrl ?? null,
          landingError: reason,
          ...(descriptor ? { outputFile: descriptor } : {}),
        },
      })
    } catch (error) {
      deps.logFailure('jobwatch/landing-park', error, { jobId: pending.record.id }, 'warn')
    }
  }

  return {
    tap(event) {
      // The fast path: engine terminal events schedule an immediate sweep.
      // Everything else arrives on the poll cadence.
      if (event.type !== 'job_done') return
      if (soon) return
      soon = setTimeout(() => {
        soon = null
        tick()
      }, 50)
    },
    start() {
      if (timer) return
      timer = setInterval(tick, SWEEP_INTERVAL_MS)
      tick()
    },
    stop() {
      if (timer) clearInterval(timer)
      if (soon) clearTimeout(soon)
      timer = null
      soon = null
      packetSeenAt.clear()
      pendingLandings.clear()
      deps.setWatchDemand?.(false)
    },
  }
}
