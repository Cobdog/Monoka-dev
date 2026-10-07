/**
 * The animation rendering service (spec 2026-10-06-animation-authoring-module-
 * design.md §7.2 the editor-facing contract, §7.2.2 submission idempotency,
 * §8.1 frozen attempts, §10 the A-1 relationship, §11.4 restart recovery):
 * the server-owned execution surface both Task 10 (fake engine) and Task 15
 * (real engine) sit behind. Three pieces live here:
 *
 *   1. THE ENGINE PORT — the ONLY engine-aware seam (the ComfyUI HTTP
 *      implementation: /prompt with the hub's stable clientId, /history,
 *      /view, /interrupt, /upload/image). The engine request CARRIES the
 *      attempt id — the SaveVideo filename_prefix becomes
 *      `animation/<attemptId>/clip` and extra_data carries it verbatim — so
 *      an uncertain dispatch (the submit response lost) is resolvable by
 *      searching the engine's own records. Completed outputs are fetched
 *      through /view and REGISTERED AS BLOBS by the port (task 2's archive
 *      note: land a registered relPath or the project export reports the
 *      clip as a missing blob).
 *
 *   2. THE BLOB SINK + FRAME PREPARER — the document store's blob tree
 *      behind a two-method interface (registerBytes/readBlob), and the
 *      production prepareFrame the completion owner consumes: resolving the
 *      review asset for a proposed frame from the engine's output listing.
 *      HONEST LIMIT: the engine serves output FILES; for the video artifacts
 *      this lane produces, the frame asset IS the clip artifact and the
 *      frame INDEX rides as preparation metadata (an image-sequence engine
 *      output would resolve to the actual frame file). Frame-accurate image
 *      extraction (ffmpeg) belongs to the real-engine leg's review pipeline,
 *      not to the engine contract.
 *
 *   3. THE SERVICE — submit/getState/cancel/extractFrame + compileCaption.
 *      submit() resolves once the attempt is validated, persisted (durable
 *      dispatch intent), and ENQUEUED engine-side — never when the render
 *      completes (§7.2.2). Validation failures are structured errors with
 *      nothing persisted. Idempotency is §11.4's rule: same key + same input
 *      hash ⇒ the existing attempt (no second engine submission); same key +
 *      different input ⇒ a 409 conflict. The input hash is computed over the
 *      snapshot AS RECEIVED, while the persisted snapshot is the STAMPED
 *      copy (the binding version from the document — task 1's forward flag —
 *      and caller-provided reproducibility settings), so a lost-response
 *      retry of the same request still matches even if the document moved.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AnimationConflictError,
  AnimationRuleError,
  type AnimationStore,
} from './store'
import type { CompletionOwner } from './completion-owner'
import {
  ANIMATION_OPERATING_POINT,
  buildAnimationGraph,
  engineInputName,
  type AnimationGraph,
} from '../../shared/animation/graphs'
import { COMPILER_VERSION, compileHeroCaption, compileSequenceCaption, compileTweenCaption } from '../../shared/animation/compiler'
import type { CompiledCaption, HeroContext, SequenceContext, TweenContext } from '../../shared/animation/compiler'
import { animationInputHash, isUuid } from '../../shared/animation/types'
import type { AnimationTool, AssetReference, AttemptExecutionState, FrozenAttemptSnapshot } from '../../shared/animation/types'

// ---------------------------------------------------------------------------
// the service contract (§7.2)
// ---------------------------------------------------------------------------

export type AttemptInput = { documentId: string; tool: AnimationTool; targetId: string; snapshot: FrozenAttemptSnapshot }

/** The engine's history answer for one job. 'lost' means the engine was
 *  asked and has no trace of the job anywhere (history + queue) — the
 *  confirmed-lost row of §11.4. An UNREACHABLE engine throws; callers mark
 *  reconciliation pending. 'interrupted' joins the brief's union because the
 *  engine's own vocabulary has it (an interrupt the engine remembers) and
 *  the owner must distinguish a user cancel from a failure. */
export type EngineJobStatus = {
  status: 'running' | 'done' | 'error' | 'interrupted' | 'lost'
  outputs?: Array<{ relPath: string; frameCount: number }>
}

export type EnginePort = {
  /** The engine request CARRIES the attempt id — reconciliation's search key
   *  (§11.4). Throws AnimationEngineValidationError on a definitive engine
   *  refusal (a 4xx from /prompt); any other throw is an UNCERTAIN outcome. */
  submitGraph(graph: unknown, attemptId: string): Promise<{ engineJobId: string }>
  interrupt(engineJobId: string): Promise<void>
  history(engineJobId: string): Promise<EngineJobStatus>
  /** The bytes the engine serves for a frame of the job's output — the
   *  output artifact at frameIndex's position in the output listing. */
  view(engineJobId: string, frameIndex: number): Promise<Buffer>
  /** The uncertain-dispatch search: the engine's records walked for the
   *  attempt identifier the request carried. Null = the engine was asked and
   *  has no such job; an unreachable engine throws. */
  findJobByAttempt(attemptId: string): Promise<string | null>
  /** The engine's queued+running job ids — BARE prompt ids (the queue cannot
   *  correlate a job to an attempt; only completed history records carry the
   *  request graph with its attempt marker). The §11.4 uncertain-dispatch
   *  discriminator: a NON-empty queue means work is in flight that may be
   *  ours, so a missing history trace is UNCERTAIN, not absent. Throws when
   *  unreachable. */
  queuedJobIds(): Promise<string[]>
  /** Uploads a reference asset into the engine's input folder under the
   *  shared deterministic name (graphs.ts' engineInputName). */
  uploadReference(assetId: string, bytes: Buffer): Promise<void>
}

export type AttemptStateView = {
  attemptId: string
  execution: AttemptExecutionState
  progress?: { value: number; max: number }
  preparation: { state: 'pending' | 'proposed' | 'failed' | 'done'; proposedFrameIndex?: number }
  /** Mirrors the store's result candidate: `id` is the MINTED document
   *  candidate id (hero landings — the correlation key against the document
   *  body's slot candidates); null when the tool mints nothing (tween
   *  attaches by attempt id, sequence surfaces through editorial selection). */
  candidate: { id: string | null; assetReference: AssetReference; frameCount: number; earlierRevision: boolean } | null
}

export type AnimationRenderingService = {
  submit(input: AttemptInput, idempotencyKey: string): Promise<{ attemptId: string; created: boolean }>
  getState(attemptId: string): AttemptStateView
  cancel(attemptId: string): Promise<void>
  extractFrame(attemptId: string, frameIndex: number): Promise<AssetReference>
  /** The authoritative server-side compile dispatch (the shared module
   *  through the injected seam) — Task 5's route builds frozen captions
   *  here, so the compiler has exactly one server-side import site. */
  compileCaption(input: { tool: 'hero'; context: HeroContext } | { tool: 'tween'; context: TweenContext } | { tool: 'sequence'; context: SequenceContext }): CompiledCaption
}

/** The definitive engine refusal (a 400 from /prompt): the attempt stays
 *  persisted but is failed outright — distinct from an uncertain dispatch,
 *  which leaves the attempt reconciliation-pending. */
export class AnimationEngineValidationError extends Error {
  readonly engineDetail: string
  constructor(engineDetail: string) {
    super('The engine refused the submitted graph.')
    this.name = 'AnimationEngineValidationError'
    this.engineDetail = engineDetail
  }
}

// ---------------------------------------------------------------------------
// the blob sink (the document store's blob tree behind a narrow interface)
// ---------------------------------------------------------------------------

export type AnimationBlobSink = {
  registerBytes(kind: 'image' | 'video', bytes: Buffer, name: string): { relPath: string; present: boolean }
  readBlob(relPath: string): Buffer | null
}

/** Adapts the shared document store: bytes land in a staging file inside the
 *  studio home (registerBlobFile only accepts in-home sources) and are
 *  registered content-addressed — identical bytes dedupe to the identical
 *  relPath, which is what makes frame extraction idempotent by
 *  (take, frame, extraction version). */
export function makeDocumentStoreBlobSink(documentStore: { registerBlobFile(kind: string, path: string): { relPath: string; present: boolean }; readBlob(relPath: string): Buffer | null }, stagingDir: string): AnimationBlobSink {
  return {
    registerBytes: (kind, bytes, name) => {
      mkdirSync(stagingDir, { recursive: true })
      const staged = join(stagingDir, `${randomUUID().slice(0, 8)}-${name}`)
      writeFileSync(staged, bytes)
      return documentStore.registerBlobFile(kind, staged)
    },
    readBlob: (relPath) => documentStore.readBlob(relPath),
  }
}

// ---------------------------------------------------------------------------
// the ComfyUI engine port (constructed from a base URL — pointing it at the
// fake engine's port is the whole test setup)
// ---------------------------------------------------------------------------

type EngineOutputFile = { filename: string; subfolder: string; type: string }

type MaterializedJob = {
  files: Array<EngineOutputFile & { relPath: string }>
  frameCount: number
}

/** The per-attempt output prefix — the durable attempt identifier the engine
 *  request carries. A pure exported helper so the shape is one definition. */
export function attemptOutputPrefix(attemptId: string): string {
  return `animation/${attemptId}/`
}

export function createComfyEnginePort(options: { baseUrl: string; clientId?: string; blobs: AnimationBlobSink; /** How long a queue-empty + history-absent verdict must PERSIST before the port answers 'lost' — the completion transition (queue slot emptied, history record not yet visible) must not be misread as a lost job. Default 300 ms. */
lostSettleMs?: number }): EnginePort {
  const base = options.baseUrl.replace(/\/$/, '')
  const lostSettleMs = options.lostSettleMs ?? 300
  // F6 Option A's stable id: the one clientId whose WebSocket session the
  // engine actually finds (the realtime hub's). Tests default to the same
  // constant; Task 5's wiring passes realtimeHub.clientId().
  const clientId = options.clientId ?? 'studio-realtime'
  const blobs = options.blobs
  const materialized = new Map<string, MaterializedJob>()

  /** Generic engine GET/POST: throws on unreachable (the uncertain signal)
   *  and on any non-ok answer (plain errors stay uncertain-class; only
   *  /prompt's own 4xx is a definitive validation refusal). */
  const fetchJson = async <T>(pathname: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${base}${pathname}`, init)
    if (!response.ok) throw new Error(`the engine answered ${response.status} on ${pathname}`)
    return (await response.json()) as T
  }

  // ---- history record parsing (the ComfyUI /history shape) ----------------

  function recordStatus(record: Record<string, unknown>): EngineJobStatus['status'] {
    const status = record.status
    const statusStr = typeof (status as { status_str?: unknown })?.status_str === 'string' ? (status as { status_str: string }).status_str : ''
    if (statusStr === 'success') return 'done'
    if (statusStr === 'error') return 'error'
    if (statusStr === 'interrupted') return 'interrupted'
    return 'running'
  }

  function recordFiles(record: Record<string, unknown>): EngineOutputFile[] {
    const outputs = record.outputs
    const files: EngineOutputFile[] = []
    if (!outputs || typeof outputs !== 'object') return files
    for (const nodeOutput of Object.values(outputs as Record<string, unknown>)) {
      const images = (nodeOutput as { images?: unknown })?.images
      if (!Array.isArray(images)) continue
      for (const image of images) {
        if (!image || typeof image !== 'object') continue
        const entry = image as Record<string, unknown>
        if (typeof entry.filename !== 'string') continue
        files.push({ filename: entry.filename, subfolder: typeof entry.subfolder === 'string' ? entry.subfolder : '', type: typeof entry.type === 'string' ? entry.type : 'output' })
      }
    }
    return files
  }

  /** The clip's frame count from the graph the engine stored in the history
   *  record — the conditioning node's `length` input (the fake and real
   *  engines both store the full graph with the record). */
  function frameCountOf(record: Record<string, unknown>): number {
    const prompt = record.prompt
    if (Array.isArray(prompt) && prompt[0] && typeof prompt[0] === 'object') {
      for (const node of Object.values(prompt[0] as Record<string, unknown>)) {
        const entry = node as { class_type?: unknown; inputs?: Record<string, unknown> } | null
        if (!entry || typeof entry !== 'object') continue
        if (entry.class_type === 'MiniMaxH3ImageToVideo' || entry.class_type === 'MiniMaxH3ReferenceToVideo') {
          const length = entry.inputs?.length
          if (typeof length === 'number' && Number.isInteger(length) && length > 0) return length
        }
      }
    }
    return ANIMATION_OPERATING_POINT.length
  }

  async function fetchOutputBytes(file: EngineOutputFile): Promise<Buffer> {
    const params = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder, type: file.type })
    const response = await fetch(`${base}/view?${params.toString()}`)
    if (!response.ok) throw new Error(`the engine's /view answered ${response.status} for ${file.filename}`)
    return Buffer.from(await response.arrayBuffer())
  }

  function kindForFilename(filename: string): 'image' | 'video' {
    return /\.(png|jpe?g|webp|bmp)$/i.test(filename) ? 'image' : 'video'
  }

  /** Fetch + register a completed job's outputs ONCE per port instance (the
   *  content-addressed blob tree makes any repeat a no-op anyway). */
  async function materialize(engineJobId: string, record: Record<string, unknown>): Promise<MaterializedJob> {
    const cached = materialized.get(engineJobId)
    if (cached) return cached
    const frameCount = frameCountOf(record)
    const files: MaterializedJob['files'] = []
    for (const file of recordFiles(record)) {
      const bytes = await fetchOutputBytes(file)
      const registered = blobs.registerBytes(kindForFilename(file.filename), bytes, file.filename)
      files.push({ ...file, relPath: registered.relPath })
    }
    const job: MaterializedJob = { files, frameCount }
    materialized.set(engineJobId, job)
    return job
  }

  const queueIds = async (): Promise<Set<string>> => {
    const queue = await fetchJson<Record<string, unknown>>('/queue')
    const ids = new Set<string>()
    for (const key of ['queue_running', 'queue_pending']) {
      const entries = queue[key]
      if (!Array.isArray(entries)) continue
      for (const entry of entries) {
        // Both serving shapes: bare prompt ids (v0.34+) and the older
        // [number, prompt_id, …] tuples.
        if (typeof entry === 'string') ids.add(entry)
        else if (Array.isArray(entry) && typeof entry[1] === 'string') ids.add(entry[1])
      }
    }
    return ids
  }

  return {
    async submitGraph(graph, attemptId) {
      // Stamp the attempt id in BOTH carriers: the graph's save tail (the
      // per-attempt output directory engines actually write) and extra_data
      // (the verbatim field). Either survives to history; the search reads both.
      const stamped = stampAttemptOnGraph(graph, attemptId)
      const body = {
        prompt: stamped,
        client_id: clientId,
        extra_data: { attempt_id: attemptId },
      }
      const response = await fetch(`${base}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }) // an unreachable engine throws — the uncertain outcome (§11.4)
      if (!response.ok) {
        // A 4xx from /prompt is the engine's own validation gate refusing
        // the graph — definitive, never retried as-is.
        throw new AnimationEngineValidationError(`${response.status} ${(await response.text()).slice(0, 400)}`)
      }
      const result = (await response.json()) as { prompt_id?: string }
      if (typeof result.prompt_id !== 'string' || !result.prompt_id) {
        throw new AnimationEngineValidationError('the engine accepted the prompt without a prompt_id')
      }
      return { engineJobId: result.prompt_id }
    },

    async interrupt(engineJobId) {
      await fetchJson<unknown>('/interrupt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Modern engines interrupt the named prompt; older ones interrupt
        // whatever is running (the fake ignores the body entirely).
        body: JSON.stringify({ prompt_id: engineJobId }),
      })
    },

    async history(engineJobId) {
      const readRecord = async (): Promise<Record<string, unknown> | null> => {
        const history = await fetchJson<Record<string, Record<string, unknown>>>(`/history/${encodeURIComponent(engineJobId)}`)
        if (history && typeof history === 'object' && engineJobId in history) return history[engineJobId]
        return null
      }
      let record = await readRecord()
      if (!record) {
        // Not in history — is it queued? A job PRESENT in the queue is
        // definitively running regardless of history. A queue miss plus a
        // history miss is torn-read sensitive: the completion transition
        // (queue slot emptied, history record not yet visible — real engines
        // may write it after dequeue, the mirror can force it with
        // historyLagMs) must not be misread as 'lost', and a FAILED queue
        // read is an unreachable-class answer (never a silent "not queued").
        // The absence must therefore PERSIST across lostSettleMs before the
        // port answers 'lost'; a genuinely lost job is absent from both
        // sources indefinitely, so the settle only delays the verdict.
        const queue = await queueIds()
        if (queue.has(engineJobId)) return { status: 'running' }
        if (lostSettleMs > 0) await new Promise((resolve) => setTimeout(resolve, lostSettleMs))
        record = await readRecord()
        if (!record) return { status: 'lost' }
      }
      const status = recordStatus(record)
      if (status !== 'done') return { status }
      const job = await materialize(engineJobId, record)
      return {
        status: 'done',
        outputs: job.files.map((file) => ({ relPath: file.relPath, frameCount: job.frameCount })),
      }
    },

    async view(engineJobId, frameIndex) {
      const history = await fetchJson<Record<string, Record<string, unknown>>>(`/history/${encodeURIComponent(engineJobId)}`)
      const record = history?.[engineJobId]
      if (!record) throw new Error(`the engine holds no history record for ${engineJobId}`)
      const job = await materialize(engineJobId, record)
      if (job.files.length === 0) throw new Error(`the job ${engineJobId} holds no output files`)
      // A frame beyond the listing resolves to the final artifact — for a
      // single-video output every index is the clip; for an image sequence
      // the listing IS frame-addressed.
      const file = job.files[Math.max(0, Math.min(frameIndex, job.files.length - 1))]
      return fetchOutputBytes(file)
    },

    async findJobByAttempt(attemptId) {
      const history = await fetchJson<Record<string, Record<string, unknown>>>('/history')
      const prefix = attemptOutputPrefix(attemptId)
      for (const [jobId, record] of Object.entries(history ?? {})) {
        const extra = Array.isArray(record.prompt) && record.prompt[2] && typeof record.prompt[2] === 'object'
          ? (record.prompt[2] as Record<string, unknown>)
          : null
        if (extra !== null && extra.attempt_id === attemptId) return jobId
        const graph = Array.isArray(record.prompt) && record.prompt[0] && typeof record.prompt[0] === 'object'
          ? (record.prompt[0] as Record<string, unknown>)
          : null
        if (graph !== null && graphCarriesPrefix(graph, prefix)) return jobId
      }
      return null
    },

    async queuedJobIds() {
      return Array.from(await queueIds())
    },

    async uploadReference(assetId, bytes) {
      const name = engineInputName({ assetId, relPath: null, kind: 'image' })
      const form = new FormData()
      form.append('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), name)
      form.append('type', 'input')
      form.append('overwrite', 'true')
      const response = await fetch(`${base}/upload/image`, { method: 'POST', body: form }) // throws on unreachable
      if (!response.ok) throw new Error(`the engine's /upload/image answered ${response.status}`)
    },
  }
}

/** Rewrites every save-tail node's filename_prefix under the attempt's own
 *  directory: `animation/<attemptId>/clip`. Pure + defensive — unknown graph
 *  shapes pass through unchanged (the extra_data carrier still rides). */
function stampAttemptOnGraph(graph: unknown, attemptId: string): unknown {
  if (!graph || typeof graph !== 'object') return graph
  const clone: Record<string, unknown> = {}
  for (const [id, node] of Object.entries(graph as Record<string, unknown>)) {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const entry = node as { class_type?: unknown; inputs?: Record<string, unknown> }
      if (entry.class_type === 'SaveVideo' || entry.class_type === 'SaveImage') {
        const inputs = { ...(entry.inputs ?? {}) }
        const existing = typeof inputs.filename_prefix === 'string' ? inputs.filename_prefix : 'output'
        const tail = existing.split('/').filter(Boolean).pop() ?? 'clip'
        inputs.filename_prefix = `${attemptOutputPrefix(attemptId)}${tail}`
        clone[id] = { ...entry, inputs }
        continue
      }
    }
    clone[id] = node
  }
  return clone
}

function graphCarriesPrefix(graph: Record<string, unknown>, prefix: string): boolean {
  for (const node of Object.values(graph)) {
    if (!node || typeof node !== 'object') continue
    const entry = node as { class_type?: unknown; inputs?: Record<string, unknown> }
    if (entry.class_type === 'SaveVideo' || entry.class_type === 'SaveImage') {
      if (typeof entry.inputs?.filename_prefix === 'string' && entry.inputs.filename_prefix.startsWith(prefix)) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// the production frame preparer (the completion owner's prepareFrame dep)
// ---------------------------------------------------------------------------

/** Resolves the review asset for a frame from the engine's output listing:
 *  the artifact at the frame's position, registered as a blob by the port
 *  (registration is content-addressed, so this is idempotent by
 *  (take, frame, extraction version)). Throws when the engine cannot be
 *  asked — that IS a preparation failure, and the owner's bounded retry +
 *  preserve-the-clip policy takes over (§11.4). */
export function makeFramePreparer(deps: { engine: EnginePort; store: AnimationStore }): (attemptId: string, frameIndex: number) => Promise<AssetReference> {
  return async (attemptId, frameIndex) => {
    const attempt = deps.store.getAttempt(attemptId)
    if (!attempt || !attempt.engineJobId || !attempt.result) {
      throw new Error(`Attempt ${attemptId} has no landed clip to prepare a frame from.`)
    }
    const status = await deps.engine.history(attempt.engineJobId)
    const outputs = status.outputs ?? []
    if (outputs.length === 0) throw new Error(`The engine holds no outputs for attempt ${attemptId}.`)
    const artifact = outputs[Math.max(0, Math.min(frameIndex, outputs.length - 1))]
    return { assetId: artifact.relPath, relPath: artifact.relPath, kind: 'video' }
  }
}

// ---------------------------------------------------------------------------
// the service
// ---------------------------------------------------------------------------

/** The reference contract per tool (§4.3) — validation + the role order the
 *  compiler numbers references in. */
const TOOL_REFERENCE_ROLES: Record<AnimationTool, ReadonlyArray<FrozenAttemptSnapshot['references'][number]['role']>> = {
  hero: ['current-key'],
  tween: ['rolling-near', 'fixed-far'],
  sequence: ['window-start', 'window-end'],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function createAnimationRenderingService(deps: {
  store: AnimationStore
  engine: EnginePort
  /** The shared completion owner (one per server — the service delegates
   *  observation/cancel/recovery to it; the composition root wires the same
   *  instance into both). */
  owner: CompletionOwner
  blobs: AnimationBlobSink
  compile: { hero: typeof compileHeroCaption; tween: typeof compileTweenCaption; sequence: typeof compileSequenceCaption }
  emit: (type: string, payload: unknown) => void
  now?: () => number
}): AnimationRenderingService {
  const { store, engine, owner, blobs, compile, emit } = deps
  const now = deps.now ?? Date.now

  /** §7.2.2 validation — everything checked BEFORE anything is persisted. */
  function validate(input: AttemptInput, idempotencyKey: string): void {
    if (!isNonEmptyString(idempotencyKey)) throw new AnimationRuleError('The submission needs an idempotency key.', 400)
    if (!isUuid(input?.documentId)) throw new AnimationRuleError(`No animation document with id ${String(input?.documentId)}.`, 404)
    const document = store.getDocument(input.documentId)
    if (!document) throw new AnimationRuleError(`No animation document with id ${input.documentId}.`, 404)
    if (input.tool !== 'hero' && input.tool !== 'tween' && input.tool !== 'sequence') {
      throw new AnimationRuleError(`Unknown animation tool ${String(input?.tool)}.`, 400)
    }
    const snapshot = input.snapshot
    if (!isRecord(snapshot)) throw new AnimationRuleError('The submission needs a frozen attempt snapshot.', 400)
    if (snapshot.tool !== input.tool) {
      throw new AnimationRuleError(`The snapshot's tool (${String(snapshot.tool)}) does not match the submission's tool (${input.tool}).`, 400)
    }
    if (!isNonEmptyString(input.targetId)) throw new AnimationRuleError('The attempt needs a target id.', 400)
    if (typeof snapshot.caption !== 'string' || snapshot.caption.trim().length === 0 || snapshot.caption.length > 20_000) {
      throw new AnimationRuleError('The frozen caption must be non-empty text (at most 20,000 characters).', 400)
    }
    if (snapshot.compilerVersion !== COMPILER_VERSION) {
      throw new AnimationRuleError(`The snapshot was compiled by ${String(snapshot.compilerVersion)} — this build submits compiler ${COMPILER_VERSION} captions; recompile and resubmit.`, 400)
    }
    if (typeof snapshot.documentRevision !== 'number' || !Number.isInteger(snapshot.documentRevision) || snapshot.documentRevision < 0) {
      throw new AnimationRuleError('The frozen snapshot must carry a non-negative integer documentRevision.', 400)
    }
    if (!Array.isArray(snapshot.references)) throw new AnimationRuleError('The frozen snapshot needs its reference list.', 400)
    const roles: string[] = []
    for (const reference of snapshot.references) {
      if (!isRecord(reference)) throw new AnimationRuleError('A frozen reference entry is malformed.', 400)
      roles.push(String(reference.role))
      const asset = reference.assetReference
      if (!isRecord(asset) || !isNonEmptyString(asset.assetId) || (asset.relPath !== null && typeof asset.relPath !== 'string') || (asset.kind !== 'image' && asset.kind !== 'video')) {
        throw new AnimationRuleError('A frozen reference needs a well-formed asset reference.', 400)
      }
      if (asset.kind !== 'image') {
        throw new AnimationRuleError(`The ${String(reference.role)} reference must be an image asset — the keyframe adapters' reference slots consume images.`)
      }
      if (typeof asset.relPath !== 'string') {
        throw new AnimationRuleError(`The ${String(reference.role)} reference has no materialized asset (a null relPath) — bind the image before submitting.`, 400)
      }
    }
    const expected = TOOL_REFERENCE_ROLES[input.tool]
    const actualSorted = [...roles].sort().join(',')
    const expectedSorted = [...expected].sort().join(',')
    if (actualSorted !== expectedSorted) {
      throw new AnimationRuleError(`A ${input.tool} attempt freezes exactly these references: ${expected.join(' + ')} (got ${roles.join(' + ') || 'none'}).`, 400)
    }
    if (isRecord(snapshot.settings)) {
      for (const key of ['width', 'height', 'steps', 'seed'] as const) {
        const value = snapshot.settings[key]
        if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < 0)) {
          throw new AnimationRuleError(`The frozen setting "${key}" must be a non-negative integer.`, 400)
        }
      }
    } else if (snapshot.settings !== undefined) {
      throw new AnimationRuleError('The frozen snapshot settings must be an object.', 400)
    }
    // Reference assets must be readable NOW (§7.2.2 "exist and are
    // accessible") — the engine upload reads these bytes right after this.
    for (const reference of snapshot.references) {
      const relPath = (reference.assetReference as { relPath: string }).relPath
      if (!blobs.readBlob(relPath)) {
        throw new AnimationRuleError(`The ${String(reference.role)} reference asset (${relPath}) is not present in the store.`, 400)
      }
    }
  }

  /** The frozen snapshot AS PERSISTED: the received snapshot stamped with the
   *  document's active binding version (task 1's forward flag — §11.2 frozen
   *  snapshots carry the binding version). The input hash stays over the
   *  RECEIVED snapshot so a lost-response retry of the same request matches
   *  even if the document has moved since. */
  function stampedSnapshot(input: AttemptInput): FrozenAttemptSnapshot {
    const document = store.getDocument(input.documentId)
    const bindingVersion = document?.body.activeBindingVersion ?? 0
    return { ...input.snapshot, settings: { ...input.snapshot.settings, bindingVersion } }
  }

  function resolveBuildSettings(input: AttemptInput): { width: number; height: number; steps: number } {
    const document = store.getDocument(input.documentId)
    const body = document?.body
    const overrides = isRecord(input.snapshot.settings) ? input.snapshot.settings : {}
    const width = typeof overrides.width === 'number' ? overrides.width : body?.settings.outputWidth ?? ANIMATION_OPERATING_POINT.width
    const height = typeof overrides.height === 'number' ? overrides.height : body?.settings.outputHeight ?? ANIMATION_OPERATING_POINT.height
    const steps = typeof overrides.steps === 'number' ? overrides.steps : body?.settings.steps ?? ANIMATION_OPERATING_POINT.stepsDefault
    return { width, height, steps }
  }

  return {
    async submit(input, idempotencyKey) {
      validate(input, idempotencyKey)

      // §11.4 idempotency: the hash over the RECEIVED input; a same-key
      // retry with different inputs is a conflict, never a second render.
      const inputHash = animationInputHash(input.snapshot)
      const existing = store.attemptByIdempotencyKey(idempotencyKey)
      if (existing) {
        if (existing.inputHash !== inputHash) {
          const document = store.getDocument(existing.documentId)
          throw new AnimationConflictError(
            document ? document.revision : 0,
            document,
            `This idempotency key was already used for attempt ${existing.id} with different inputs — a retry must carry the same frozen snapshot (spec §11.4).`,
          )
        }
        return { attemptId: existing.id, created: false }
      }

      const snapshot = stampedSnapshot(input)
      const attemptId = randomUUID()
      const recorded = store.recordAttempt({
        id: attemptId,
        documentId: input.documentId,
        tool: input.tool,
        targetId: input.targetId,
        idempotencyKey,
        inputHash,
        snapshot,
      })
      if (!recorded.created) {
        // A concurrent same-key insert won the race — the store's
        // return-existing contract is exactly §11.4's answer.
        return { attemptId: recorded.attempt.id, created: false }
      }
      emit('animation.attempt.persisted', { attemptId, documentId: input.documentId, tool: input.tool })

      // Dispatch: reference bytes reach the engine's input folder first (the
      // shared deterministic naming rule), then the graph. The attempt row is
      // the durable dispatch intent — an outcome that cannot be confirmed
      // leaves it reconciliation-pending, never dropped (§11.4).
      try {
        for (const reference of snapshot.references) {
          const bytes = blobs.readBlob((reference.assetReference as { relPath: string }).relPath)
          if (!bytes) throw new AnimationRuleError(`The ${String(reference.role)} reference asset is no longer readable.`, 400)
          await engine.uploadReference(reference.assetReference.assetId, bytes)
        }
        const graph: AnimationGraph = buildAnimationGraph(snapshot, resolveBuildSettings(input))
        const { engineJobId } = await engine.submitGraph(graph, attemptId)
        store.setAttemptExecution(attemptId, { state: 'queued', engineJobId })
        owner.observe(attemptId)
        emit('animation.attempt.submitted', { attemptId, documentId: input.documentId, engineJobId, tool: input.tool })
        return { attemptId, created: true }
      } catch (failure) {
        if (failure instanceof AnimationEngineValidationError) {
          // Definitive refusal (the engine answered and said no): failed.
          store.setAttemptExecution(attemptId, { state: 'failed' })
          emit('animation.attempt.failed', { attemptId, documentId: input.documentId, reason: 'engine-validation', detail: failure.engineDetail })
          return { attemptId, created: true }
        }
        // Uncertain dispatch (§11.4): the request may or may not have
        // reached the engine — reconciliation pending, the attempt preserved.
        store.setAttemptExecution(attemptId, { state: 'reconciling' })
        emit('animation.attempt.uncertain', { attemptId, documentId: input.documentId, error: failure instanceof Error ? failure.message : String(failure), at: now() })
        return { attemptId, created: true }
      }
    },

    getState(attemptId) {
      const attempt = store.getAttempt(attemptId)
      if (!attempt) throw new AnimationRuleError(`No attempt with id ${attemptId}.`, 404)
      const view: AttemptStateView = {
        attemptId: attempt.id,
        execution: attempt.execution.state,
        preparation: { state: attempt.preparation.state, ...(attempt.preparation.proposedFrameIndex !== undefined ? { proposedFrameIndex: attempt.preparation.proposedFrameIndex } : {}) },
        candidate: attempt.result ? attempt.result.candidate : null,
      }
      if (attempt.execution.progress !== undefined) view.progress = attempt.execution.progress
      return view
    },

    cancel(attemptId) {
      return owner.cancel(attemptId)
    },

    async extractFrame(attemptId, frameIndex) {
      const attempt = store.getAttempt(attemptId)
      if (!attempt) throw new AnimationRuleError(`No attempt with id ${attemptId}.`, 404)
      if (!attempt.result) throw new AnimationRuleError('Only a landed clip can have a frame extracted.', 400)
      if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= attempt.result.candidate.frameCount) {
        throw new AnimationRuleError(`frameIndex must be an integer within the clip (0..${attempt.result.candidate.frameCount - 1}).`, 400)
      }
      if (!attempt.engineJobId) throw new AnimationRuleError('The attempt has no engine job to extract from.', 400)
      // On-demand extraction (§7.2.2 path 2): the same artifact resolution
      // the preparer performs — content addressing makes it idempotent per
      // (take, frame, extraction version).
      const status = await engine.history(attempt.engineJobId)
      const outputs = status.outputs ?? []
      if (outputs.length === 0) throw new AnimationRuleError('The engine holds no outputs for this attempt.', 400)
      const artifact = outputs[Math.min(frameIndex, outputs.length - 1)]
      return { assetId: artifact.relPath, relPath: artifact.relPath, kind: 'video' }
    },

    compileCaption(input) {
      if (input.tool === 'hero') return compile.hero(input.context)
      if (input.tool === 'tween') return compile.tween(input.context)
      return compile.sequence(input.context)
    },
  }
}
