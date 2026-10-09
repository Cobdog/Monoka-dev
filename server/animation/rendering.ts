/**
 * The animation rendering service (spec 2026-10-06-animation-authoring-module-
 * design.md §7.2 the editor-facing contract, §7.2.2 submission idempotency,
 * §8.1 frozen attempts, §10 the A-1 relationship, §11.4 restart recovery):
 * the server-owned execution surface both Task 10 (fake engine) and Task 15
 * (real engine) sit behind. Three pieces live here:
 *
 *   1. THE ENGINE PORT — the ONLY engine-aware seam (the ComfyUI HTTP
 *      implementation: /prompt with the hub's stable clientId, /history,
 *      /view, /interrupt, /queue's deletion op, /upload/image). The engine
 *      request CARRIES the
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
 *      review asset for a frame from the engine's output listing — or, when
 *      the engine's VOLATILE history holds nothing usable for a landed
 *      attempt (a restart/eviction emptied it long after the output landed),
 *      from the DURABLE registered clip itself (the final review's F1: frame
 *      resolution is durable, not engine-coupled). Two
 *      listing shapes, both real: an image-sequence listing (the fake
 *      engine's animation lane, an engine that saves decoded frames beside
 *      the clip) resolves the frame-addressed IMAGE directly; a VIDEO-ONLY
 *      listing (the real engine's save tail) frame-accurately decodes the
 *      requested frame from the registered clip through ffmpeg and registers
 *      the PNG — the tween chain's rolling reference and the hero frame
 *      selection consume IMAGE assets either way. Registration is
 *      content-addressed, so the whole resolution is idempotent by
 *      (attempt, frame, extraction recipe) — §11.4's extraction identity.
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
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AnimationConflictError,
  AnimationRuleError,
  type AnimationDocumentRow,
  type AnimationStore,
} from './store'
import type { CompletionOwner } from './completion-owner'
import {
  AnimationModelResolutionError,
  type ModelEnumerations,
  modelOverrides,
  modelsFromSnapshotSettings,
  resolveAnimationModels,
  type ResolvedAnimationModels,
} from './models'
import { sanitizeForUser } from '../logSanitize'
import {
  ANIMATION_OPERATING_POINT,
  buildAnimationGraph,
  engineInputName,
  MOTION_CONTEXT_SAVE_CLASS,
  type AnimationGraph,
  type GraphBuildSettings,
} from '../../shared/animation/graphs'
import { COMPILER_VERSION, compileHeroCaption, compileSequenceCaption, compileTweenCaption } from '../../shared/animation/compiler'
import type { CompiledCaption, HeroContext, SequenceContext, TweenContext } from '../../shared/animation/compiler'
import { animationInputHash } from '../../shared/animation/types'
import type { AnimationTool, AssetReference, AttemptExecutionState, FrozenAttemptSnapshot, MediumString } from '../../shared/animation/types'
import { runTool } from '../datasets/probe'

// ---------------------------------------------------------------------------
// the service contract (§7.2)
// ---------------------------------------------------------------------------

export type AttemptInput = {
  documentId: string
  tool: AnimationTool
  targetId: string
  snapshot: FrozenAttemptSnapshot
  /** THE FROZEN DOCUMENT (Codex I5 — freeze-before-submission, the export
   *  module's own doctrine applied to this boundary): the document row the
   *  submission freezes against, read ONCE synchronously at the caller's
   *  entry BEFORE any await (the route's read; a direct-service caller's
   *  read happens synchronously at submit's own entry instead). Everything
   *  the freeze stamps — the bindingVersion, the dimensions, the steps —
   *  comes from THIS row, so an authoring write that lands behind the
   *  model-enumeration (or promoted-frame extraction) await cannot splice
   *  the moved document's stamps onto the references/caption/revision the
   *  entry row resolved. `store.getDocument` after an await is BANNED on
   *  the freeze path (the conflict-error surface's fresh-document read is
   *  the one deliberate exception — a 409's rebase payload wants the
   *  CURRENT document, not the frozen one). */
  document?: AnimationDocumentRow
}

/** The engine's history answer for one job. 'lost' means the engine was
 *  asked and has no trace of the job anywhere (history + queue) — the
 *  confirmed-lost row of §11.4. An UNREACHABLE engine throws; callers mark
 *  reconciliation pending. 'interrupted' is the PORT's derivation, not a
 *  status_str the engine writes: a real interruption lands in history as
 *  `status_str:"error"` + `completed:false` with an `execution_interrupted`
 *  message appended (main.py:375-379, execution.py:693-699) — the parser
 *  reads the message so a user Stop is never classified a render failure. */
export type EngineJobStatus = {
  status: 'running' | 'done' | 'error' | 'interrupted' | 'lost'
  /** Output artifacts with their registered KIND (task 11): an
   *  image-sequence listing resolves per-frame IMAGE assets through the
   *  frame preparer/extractor contract below, while outputs[0] stays the
   *  primary artifact the candidate lands from. */
  outputs?: Array<{ relPath: string; frameCount: number; kind: 'image' | 'video' }>
}

export type EnginePort = {
  /** The engine request CARRIES the attempt id — reconciliation's search key
   *  (§11.4). Throws AnimationEngineValidationError on a definitive engine
   *  refusal (a 4xx from /prompt); any other throw is an UNCERTAIN outcome. */
  submitGraph(graph: unknown, attemptId: string): Promise<{ engineJobId: string }>
  interrupt(engineJobId: string): Promise<void>
  /** Dequeues a PENDING job by id — the captured API's queue-deletion op
   *  (POST /queue {"delete":[id]}, server.py:1146-1158; the answer is an
   *  EMPTY 200). The real /interrupt deliberately no-ops a pending id
   *  (server.py:1176-1192 checks only currently-running prompts), so this
   *  is the pending half of cancellation; deleting an id that is running
   *  or already gone is the engine's own documented no-op
   *  (delete_queue_item walks the pending heap only). */
  dequeue(engineJobId: string): Promise<void>
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
  /** The engine's OWN enumeration of what its loader nodes accept — THE
   *  registry the animation lane resolves its model slots against (wave 1,
   *  the live review's #1: never a pinned filename, never another
   *  installation-specific hardcode). Cached per port instance with a short
   *  TTL; `force` refetches (the submit preflight, dispatch resolution, and
   *  the boot reconcile's redispatch all resolve against fresh truth).
   *  Throws when the engine is unreachable — the caller defers. */
  modelEnumerations(options?: { force?: boolean }): Promise<ModelEnumerations>
}

export type AttemptStateView = {
  attemptId: string
  /** The persisted attempt row, surfaced read-only (the foundation contract
   *  review's F2): the timeline attaches a running attempt to its span
   *  after a reload (tool + targetId — a tween's target IS its step slot),
   *  and the review panel shows what was actually submitted (§6.4's
   *  "compiled caption ... frozen in the attempt" + the compiler that
   *  built it). No behavioral change — the fields were always persisted. */
  tool: AnimationTool
  targetId: string
  /** HERO rows (task 11, §5.2): the key the movement arc describes FROM —
   *  `targetId` is the PROPOSED slot the clip lands into. The playhead's
   *  in-flight rule and the span-into-the-accepted-key action key off it;
   *  tween/sequence rows leave it unset. */
  sourceKeyId?: string
  /** HERO rows: the authored movement arc frozen verbatim (§8.1) — the
   *  re-roll resubmits it and the span creation seeds its intent from it. */
  movementArc?: string
  /** HERO rows: the resolved overrides the frozen caption compiled with —
   *  the re-roll's byte-identical resubmission input. */
  heroOverrides?: { medium: MediumString; scene?: string; camera?: { description: string; reason: string } }
  /** SEQUENCE rows (task 12, §5.2/§8.1): the key whose selected drawing is
   *  the window's own natural end — `targetId` IS the window start (§11.2
   *  "sequence attempts capture a selected key window"). The review names
   *  the frozen window and the re-roll keys off the pair. */
  windowEndKeyId?: string
  /** SEQUENCE rows: the ordered action beats frozen verbatim + the
   *  preservation text — the re-roll's byte-identical resubmission input. */
  sequenceActions?: string[]
  sequencePreservation?: string
  /** SEQUENCE rows: the resolved overrides the frozen caption compiled with. */
  sequenceOverrides?: { medium: MediumString; scene?: string; camera?: { description: string; reason: string } }
  caption: string
  compilerVersion: string
  execution: AttemptExecutionState
  progress?: { value: number; max: number }
  /** The durable, sanitized reason a FAILED attempt carries (wave 1, the
   *  live review's #6): composed at the failure site — model resolution,
   *  engine validation, execution error — never raw engine output. Absent
   *  on every non-failed state (a cancellation or a lost job is not a
   *  failure and renders its own neutral copy). */
  failureReason?: string
  preparation: { state: 'pending' | 'proposed' | 'failed' | 'done'; proposedFrameIndex?: number; error?: string }
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
  /** The boot reconcile's redispatch arm (wave 1's queue semantics): a
   *  persisted attempt whose dispatch PROVABLY never landed dispatches from
   *  its frozen snapshot — the service the owner calls. 'uncertain' leaves
   *  the attempt reconciliation-pending; 'aborted' means the row went
   *  terminal (cancelled/failed) while the redispatch was in flight (I1's
   *  gate — nothing was submitted for it); null means the row was not the
   *  sweep's to redispatch. */
  redispatchAttempt(attemptId: string): Promise<'submitted' | 'failed' | 'uncertain' | 'aborted' | null>
  /** §11.4's explicit preparation retry (the foundation contract review's
   *  F3) — the owner's recovery action behind the service facade (the
   *  cancel idiom): re-prepare the proposed frame of a LANDED clip without
   *  re-rendering. */
  retryPreparation(attemptId: string): Promise<void>
  /** The authoritative server-side compile dispatch (the shared module
   *  through the injected seam) — Task 5's route builds frozen captions
   *  here, so the compiler has exactly one server-side import site. */
  compileCaption(input: { tool: 'hero'; context: HeroContext } | { tool: 'tween'; context: TweenContext } | { tool: 'sequence'; context: SequenceContext }): CompiledCaption
}

/** The definitive engine refusal (a 400 from /prompt): the attempt stays
 *  persisted but is failed outright — distinct from an uncertain dispatch,
 *  which leaves the attempt reconciliation-pending. `reason` is the
 *  sanitized, durable text (Fix C: composed from the engine's structured
 *  node_errors — the failing node class, input, and value — through the
 *  logSanitize discipline, never raw engine output); `engineDetail` keeps
 *  the raw answer for the server-side log. */
export class AnimationEngineValidationError extends Error {
  readonly engineDetail: string
  readonly reason: string
  constructor(engineDetail: string, reason?: string) {
    super('The engine refused the submitted graph.')
    this.name = 'AnimationEngineValidationError'
    this.engineDetail = engineDetail
    this.reason = reason ?? sanitizeForUser(engineDetail)
  }
}

/** Composes the sanitized failure reason for an engine /prompt refusal from
 *  the structured node_errors ComfyUI answers with (the fake and real
 *  engines share the shape): the failing node's class, the input it
 *  rejected, and the value. Field NAMES and class names are technical by
 *  nature (capped, verbatim — sanitizeForUser would collapse a bare name
 *  like "length" to nothing); VALUES and free-text messages go through
 *  sanitizeForUser, so whatever the engine echoed collapses to technical
 *  signal. Falls back to the sanitized raw body when the answer does not
 *  parse. */
function engineValidationReason(bodyText: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    return sanitizeForUser(bodyText)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return sanitizeForUser(bodyText)
  const nodeErrors = (parsed as Record<string, unknown>).node_errors
  if (typeof nodeErrors !== 'object' || nodeErrors === null || Array.isArray(nodeErrors)) return sanitizeForUser(bodyText)
  const parts: string[] = []
  for (const node of Object.values(nodeErrors as Record<string, unknown>)) {
    if (typeof node !== 'object' || node === null) continue
    const entry = node as { class_type?: unknown; errors?: unknown }
    if (typeof entry.class_type !== 'string') continue
    const inputBits: string[] = []
    if (Array.isArray(entry.errors)) {
      for (const failure of entry.errors) {
        if (typeof failure !== 'object' || failure === null) continue
        const extra = (failure as { extra_info?: unknown }).extra_info
        const inputName = typeof extra === 'object' && extra !== null && Array.isArray((extra as { input_name?: unknown }).input_name)
          ? (extra as { input_name: unknown[] }).input_name
          : null
        if (inputName !== null) {
          inputBits.push(`input "${String(inputName[0]).slice(0, 80)}" (value ${sanitizeForUser(String(inputName[1]))})`)
        } else {
          const message = (failure as { message?: unknown }).message
          if (typeof message === 'string') inputBits.push(sanitizeForUser(message))
        }
      }
    }
    parts.push(`${entry.class_type.slice(0, 120)}${inputBits.length > 0 ? ` — ${inputBits.join('; ')}` : ''}`)
  }
  if (parts.length === 0) return sanitizeForUser(bodyText)
  return `The engine refused the graph at validation: ${parts.join(' | ')}`.slice(0, 2000)
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
 *  (take, frame, extraction version). The staging file is TRANSIENT (Codex
 *  M1): registerBlobFile copies/dedupes into the canonical blob tree and the
 *  blob store owns that copy, so the source is removed on BOTH outcomes —
 *  the staging directory holds only in-flight files, never one permanent
 *  copy per registration (three identical extractions left three staging
 *  files behind one blob row before; preparation retries and large video
 *  artifacts grew the disk without bound). Export's mkdtemp cleanup is the
 *  same discipline. */
export function makeDocumentStoreBlobSink(documentStore: { registerBlobFile(kind: string, path: string): { relPath: string; present: boolean }; readBlob(relPath: string): Buffer | null }, stagingDir: string): AnimationBlobSink {
  return {
    registerBytes: (kind, bytes, name) => {
      mkdirSync(stagingDir, { recursive: true })
      const staged = join(stagingDir, `${randomUUID().slice(0, 8)}-${name}`)
      writeFileSync(staged, bytes)
      try {
        return documentStore.registerBlobFile(kind, staged)
      } finally {
        // Removed on success AND failure — a registration that threw leaves
        // no orphan either. The registered blob (or the refusal) is the
        // outcome; the staging file is never it.
        rmSync(staged, { force: true })
      }
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
  files: Array<EngineOutputFile & { relPath: string; kind: 'image' | 'video' }>
  frameCount: number
}

/** The per-attempt output prefix — the durable attempt identifier the engine
 *  request carries. A pure exported helper so the shape is one definition. */
export function attemptOutputPrefix(attemptId: string): string {
  return `animation/${attemptId}/`
}

export function createComfyEnginePort(options: { baseUrl: string; clientId?: string; blobs: AnimationBlobSink; /** How long a queue-empty + history-absent verdict must PERSIST before the port answers 'lost' — the completion transition (queue slot emptied, history record not yet visible) must not be misread as a lost job. Default 300 ms. */
lostSettleMs?: number; /** How long the port's model-enumeration cache stands. Default 30 s; correctness-critical callers (submit preflight, dispatch resolution) pass `force` and never read the cache. */
enumerationTtlMs?: number }): EnginePort {
  const base = options.baseUrl.replace(/\/$/, '')
  const lostSettleMs = options.lostSettleMs ?? 300
  const enumerationTtlMs = options.enumerationTtlMs ?? 30_000
  // F6 Option A's stable id: the one clientId whose WebSocket session the
  // engine actually finds (the realtime hub's). Tests default to the same
  // constant; Task 5's wiring passes realtimeHub.clientId().
  const clientId = options.clientId ?? 'studio-realtime'
  const blobs = options.blobs
  const materialized = new Map<string, MaterializedJob>()

  // ---- the model-enumeration registry (wave 1, the live review's #1) ------

  /** The per-instance enumeration cache: short TTL, force-refresh path.
   *  Correctness-critical resolutions always force; the cache serves the
   *  TTL window so repeated read-style consumers do not refetch. */
  let enumerationCache: { at: number; value: ModelEnumerations } | null = null

  /** One loader class's combo list from the engine's own /object_info —
   *  the targeted per-class form (small answers, the same shape the capture
   *  fixtures pin). A class the engine does not know answers empty (a
   *  resolution against it will name the empty enumeration); an unreachable
   *  engine THROWS (the defer signal). The fetch is TIME-BOUNDED: a hung
   *  engine (connections accepted, never answered) must not stall the
   *  submit path ahead of persistence — the preflight defers and the
   *  queue semantics stand. */
  async function loaderEnumeration(className: string, inputName: string): Promise<string[]> {
    const response = await fetch(`${base}/object_info/${encodeURIComponent(className)}`, { signal: AbortSignal.timeout(3000) })
    if (!response.ok) return []
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    const entry = body !== null ? body[className] : null
    if (typeof entry !== 'object' || entry === null) return []
    const input = (entry as { input?: unknown }).input
    if (typeof input !== 'object' || input === null) return []
    const required = (input as { required?: unknown }).required
    if (typeof required !== 'object' || required === null) return []
    const field = (required as Record<string, unknown>)[inputName]
    if (!Array.isArray(field) || !Array.isArray(field[0])) return []
    return field[0].filter((name): name is string => typeof name === 'string' && name.length > 0)
  }

  async function fetchModelEnumerations(): Promise<ModelEnumerations> {
    const [unet, loraModelOnly, lora, clip, vae] = await Promise.all([
      loaderEnumeration('UNETLoader', 'unet_name'),
      loaderEnumeration('LoraLoaderModelOnly', 'lora_name'),
      loaderEnumeration('LoraLoader', 'lora_name'),
      loaderEnumeration('CLIPLoader', 'clip_name'),
      loaderEnumeration('VAELoader', 'vae_name'),
    ])
    return {
      unet,
      lora: [...new Set([...loraModelOnly, ...lora])].sort(),
      clip,
      vae,
    }
  }

  /** Generic engine GET/POST: throws on unreachable (the uncertain signal)
   *  and on any non-ok answer (plain errors stay uncertain-class; only
   *  /prompt's own 4xx is a definitive validation refusal). */
  const fetchJson = async <T>(pathname: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${base}${pathname}`, init)
    if (!response.ok) throw new Error(`the engine answered ${response.status} on ${pathname}`)
    return (await response.json()) as T
  }

  // ---- history record parsing (the ComfyUI /history shape) ----------------

  /** True when the record's status messages carry the engine's own
   *  interruption marker: add_message appends (event, data) TUPLES
   *  (execution.py:682), so JSON serves them as 2-arrays whose first
   *  element is the event name. */
  function hasInterruptMessage(messages: unknown): boolean {
    if (!Array.isArray(messages)) return false
    for (const entry of messages) {
      if (Array.isArray(entry) && entry.length > 0 && entry[0] === 'execution_interrupted') return true
    }
    return false
  }

  /** The engine's history status → the port's vocabulary. The canonical
   *  engine writes only 'success' | 'error' (main.py:375-379 — there is NO
   *  'interrupted' status_str); a REAL interruption is error + completed
   *  false + the execution_interrupted message (execution.py:693-699), so
   *  the message is what distinguishes a user Stop from a render failure —
   *  read it, never guess from status_str alone. */
  function recordStatus(record: Record<string, unknown>): EngineJobStatus['status'] {
    const status = record.status
    const statusObject = typeof status === 'object' && status !== null ? (status as { status_str?: unknown; messages?: unknown }) : {}
    const statusStr = typeof statusObject.status_str === 'string' ? statusObject.status_str : ''
    if (statusStr === 'success') return 'done'
    if (statusStr === 'error') return hasInterruptMessage(statusObject.messages) ? 'interrupted' : 'error'
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
   *  engines both store the full graph with the record). The history tuple
   *  is [number, prompt_id, prompt_graph, extra_data, outputs_to_execute]
   *  (docs/devdocs/comfyui-api §3): the GRAPH lives at index 2. */
  function frameCountOf(record: Record<string, unknown>): number {
    const prompt = record.prompt
    if (Array.isArray(prompt) && isRecord(prompt[2])) {
      for (const node of Object.values(prompt[2] as Record<string, unknown>)) {
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
      const kind = kindForFilename(file.filename)
      const bytes = await fetchOutputBytes(file)
      const registered = blobs.registerBytes(kind, bytes, file.filename)
      files.push({ ...file, relPath: registered.relPath, kind })
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
        // The canonical (and, at the pinned revision, ONLY) serving shape:
        // the item tuple [number, prompt_id, prompt, extra_data,
        // outputs_to_execute] (server.py:1072-1078, devdocs §2) — the id
        // lives at index 1. The same tuple-only reading core.ts's own
        // queue check makes; the mirror serves the same tuples, so this
        // branch is exercised on every suite run (review I-A — a
        // flattened-id tolerance here once left the real branch CI-dead).
        if (Array.isArray(entry) && typeof entry[1] === 'string') ids.add(entry[1])
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
        // the graph — definitive, never retried as-is. The sanitized reason
        // (Fix C) parses the FULL answer; the raw excerpt stays in
        // engineDetail for the log.
        const text = await response.text()
        throw new AnimationEngineValidationError(`${response.status} ${text.slice(0, 400)}`, engineValidationReason(text))
      }
      const result = (await response.json()) as { prompt_id?: string }
      if (typeof result.prompt_id !== 'string' || !result.prompt_id) {
        throw new AnimationEngineValidationError('the engine accepted the prompt without a prompt_id')
      }
      return { engineJobId: result.prompt_id }
    },

    async interrupt(engineJobId) {
      // The canonical engine answers /interrupt with a 200 and an EMPTY
      // body (server.py:1198) — never parsed as JSON (Codex I2: the
      // unconditional response.json() turned every real success into a
      // transport failure). Any 2xx — empty or not — is success; only a
      // non-2xx answer or a genuine transport failure throws.
      const response = await fetch(`${base}/interrupt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Modern engines interrupt the named prompt — but ONLY while it is
        // currently RUNNING (server.py:1176-1192 deliberately no-ops a
        // pending id); dequeue() is the pending half of cancellation.
        body: JSON.stringify({ prompt_id: engineJobId }),
      })
      if (!response.ok) throw new Error(`the engine answered ${response.status} on /interrupt`)
    },

    async dequeue(engineJobId) {
      // The captured API's queue-deletion op (server.py:1146-1158): an
      // EMPTY 200 always — never parsed (the same empty-body contract
      // /interrupt serves).
      const response = await fetch(`${base}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete: [engineJobId] }),
      })
      if (!response.ok) throw new Error(`the engine answered ${response.status} on /queue`)
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
        outputs: job.files.map((file) => ({ relPath: file.relPath, frameCount: job.frameCount, kind: file.kind })),
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
        // The history tuple (docs/devdocs/comfyui-api §3):
        // [number, prompt_id, prompt_graph, extra_data, outputs_to_execute]
        // — extra_data at [3], the graph at [2]. The search reads BOTH
        // carriers the request stamped (extra_data verbatim, the save-tail
        // prefix inside the graph).
        const prompt = record.prompt
        const extra = Array.isArray(prompt) && isRecord(prompt[3]) ? prompt[3] : null
        if (extra !== null && extra.attempt_id === attemptId) return jobId
        const graph = Array.isArray(prompt) && isRecord(prompt[2]) ? prompt[2] : null
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

    async modelEnumerations(force) {
      if (!force?.force && enumerationCache !== null && Date.now() - enumerationCache.at < enumerationTtlMs) {
        return enumerationCache.value
      }
      const value = await fetchModelEnumerations()
      enumerationCache = { at: Date.now(), value }
      return value
    },
  }
}

/** Rewrites every save-tail node's filename_prefix under the attempt's own
 *  directory: `animation/<attemptId>/clip`. The pack's carry Save node
 *  (extension lane, spec §7) joins the stamped set — its `animation/carry`
 *  marker becomes `animation/<attemptId>/carry`, so the engine writes the
 *  carry file at engineOutputCarryPath(attemptId), the deterministic
 *  receipt. Pure + defensive — unknown graph shapes pass through unchanged
 *  (the extra_data carrier still rides). */
function stampAttemptOnGraph(graph: unknown, attemptId: string): unknown {
  if (!graph || typeof graph !== 'object') return graph
  const clone: Record<string, unknown> = {}
  for (const [id, node] of Object.entries(graph as Record<string, unknown>)) {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const entry = node as { class_type?: unknown; inputs?: Record<string, unknown> }
      if (entry.class_type === 'SaveVideo' || entry.class_type === 'SaveImage' || entry.class_type === MOTION_CONTEXT_SAVE_CLASS) {
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
    if (entry.class_type === 'SaveVideo' || entry.class_type === 'SaveImage' || entry.class_type === MOTION_CONTEXT_SAVE_CLASS) {
      if (typeof entry.inputs?.filename_prefix === 'string' && entry.inputs.filename_prefix.startsWith(prefix)) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// the production frame preparer (the completion owner's prepareFrame dep)
// ---------------------------------------------------------------------------

/** The frame-addressed artifact of a landed job's output listing (the
 *  preparer/extractor contract, task 11): a listing that carries IMAGE
 *  artifacts resolves frame N to the Nth image — an image-sequence engine
 *  output IS the frame-addressed form (the fake engine's animation lane
 *  lists the decoded frames beside the clip). A frame index beyond the
 *  image listing refuses BY NAME (the final review's M2) — a listing that
 *  under-delivers versus the row's frameCount must never silently resolve a
 *  neighbouring frame, the same reject-don't-drop discipline the video-only
 *  branch's decode refusal enforces. A listing without images (the real
 *  engine's video-only output) names the clip itself — one clip artifact IS
 *  every frame's resolution source, so the positional branch clamps to it
 *  and decodeClipFrame owns the range check. */
function frameArtifactOf(outputs: NonNullable<EngineJobStatus['outputs']>, frameIndex: number): { relPath: string; kind: 'image' | 'video' } {
  const images = outputs.filter((artifact) => artifact.kind === 'image')
  if (images.length > 0) {
    if (frameIndex < 0 || frameIndex >= images.length) {
      throw new Error(`The engine's image listing holds no frame at index ${frameIndex} (it lists ${images.length}).`)
    }
    return images[frameIndex]
  }
  const positional = outputs[Math.max(0, Math.min(frameIndex, outputs.length - 1))]
  return { relPath: positional.relPath, kind: positional.kind }
}

/** Decodes ONE frame of a clip into PNG bytes — the frame-accurate form:
 *  the trim filter passes exactly [frameIndex, frameIndex+1) with no
 *  keyframe seeking and no timestamp rounding, so frame N is frame N (the
 *  export module's own length discipline, applied to a single frame). */
export async function decodeClipFrame(ffmpegPath: string, clipBytes: Buffer, frameIndex: number): Promise<Buffer> {
  const work = await mkdtemp(join(tmpdir(), 'minimax-animation-frame-'))
  try {
    // ffmpeg probes container content, not the extension — the staged input
    // carries no format claim.
    const input = join(work, 'clip')
    const output = join(work, 'frame.png')
    await writeFile(input, clipBytes)
    await runTool(ffmpegPath, ['-y', '-v', 'error', '-i', input, '-vf', `trim=start_frame=${frameIndex}:end_frame=${frameIndex + 1}`, '-frames:v', '1', '-an', output], 120_000)
    return await readFile(output).catch(() => {
      throw new Error(`The clip holds no decodable frame at index ${frameIndex} (the decoder produced no output).`)
    })
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** The frame-resolution seam's dependencies: the engine (its output
 *  listing), the store (the landed attempt), the blob sink (the registered
 *  clip + the extracted frame's registration), and the ffmpeg binary
 *  (re-resolved per call — settings changes apply without a restart). */
export type FrameResolutionDeps = {
  engine: EnginePort
  store: AnimationStore
  blobs: AnimationBlobSink
  ffmpegPath: () => string
}

/** The shared decode tail of the frame-resolution seam: read a registered
 *  clip, frame-accurately decode the requested frame through ffmpeg, and
 *  register the PNG content-addressed as an IMAGE asset — idempotent by
 *  (attempt, frame, extraction recipe), the §11.4 extraction identity. */
async function decodeFrameFromRegisteredClip(deps: FrameResolutionDeps, attemptId: string, clipRelPath: string, frameIndex: number): Promise<AssetReference> {
  const clip = deps.blobs.readBlob(clipRelPath)
  if (clip === null) {
    throw new Error(`The clip artifact (${clipRelPath}) is not readable from the store — its frames cannot be extracted.`)
  }
  const png = await decodeClipFrame(deps.ffmpegPath(), clip, frameIndex)
  const registered = deps.blobs.registerBytes('image', png, `frame-${attemptId.slice(0, 8)}-${frameIndex}.png`)
  return { assetId: registered.relPath, relPath: registered.relPath, kind: 'image' }
}

/** Resolves the review asset for a frame of a LANDED attempt — §7.2.2's two
 *  paths (the proposed frame's automatic preparation and on-demand
 *  extraction) share this resolution: an image-sequence listing resolves the
 *  frame-addressed IMAGE directly; a video-only listing (the real engine's
 *  save tail) decodes the frame from the registered clip through ffmpeg and
 *  registers the PNG as an IMAGE asset. Content addressing makes the whole
 *  resolution idempotent by (attempt, frame, extraction recipe). The engine
 *  is asked FIRST (the cheap listing path for the hot case), but its history
 *  is VOLATILE — a RAM dict with oldest-eviction and no persistence (the
 *  canonical execution.py `self.history = {}`), so a routine restart empties
 *  it for attempts whose output landed long ago; when it holds no record (or
 *  no usable outputs) the DURABLE registered clip answers instead (the final
 *  review's F1 — §7.2.1/§10.2's "durable, not callback-chained" contract,
 *  applied to frame resolution: the tween chain's promoted-near submits and
 *  the hero frame acceptance keep working across an engine restart — and,
 *  since a restart is also the UNREACHABLE window, across the engine being
 *  DOWN entirely: the transport failure falls to the same durable path
 *  (Codex I9), so nothing in the review chain waits on engine
 *  reachability). Throws when the frame cannot be resolved anywhere — a
 *  NAMED refusal (naming BOTH causes when both paths are dead), never a
 *  silently wrong frame — and that IS a preparation failure the owner's
 *  bounded retry + preserve-the-clip policy handles (§11.4). */
async function resolveFrameAsset(deps: FrameResolutionDeps, attemptId: string, frameIndex: number): Promise<AssetReference> {
  const attempt = deps.store.getAttempt(attemptId)
  if (!attempt || !attempt.engineJobId || !attempt.result) {
    throw new Error(`Attempt ${attemptId} has no landed clip to resolve a frame from.`)
  }
  // The engine is asked FIRST (the cheap listing path for the hot case) —
  // but for RESOLUTION purposes an engine that cannot SERVE its history —
  // unreachable or refusing — is indistinguishable-from-empty (Codex I9):
  // its history is volatile anyway, the DURABLE registered clip holds
  // every needed byte, and the history failure must not fail extraction,
  // hero acceptance, retry-preparation, or dependent submissions that need
  // no engine fact. Only the queue/history OBSERVATION paths keep their
  // unreachable semantics (reconciling) — resolution changes and nothing
  // else.
  let outputs: NonNullable<EngineJobStatus['outputs']> | null = null
  let historyFailure = ''
  try {
    const status = await deps.engine.history(attempt.engineJobId)
    outputs = status.outputs ?? []
  } catch (failure) {
    historyFailure = failure instanceof Error ? failure.message : String(failure)
  }
  if (outputs === null || outputs.length === 0) {
    // The engine's history holds nothing usable — the restart/eviction
    // shape, or an engine that cannot be reached at all. The landed
    // candidate's clip is DURABLE in the app's own blob store whether or
    // not the engine remembers producing it: decode the frame from it
    // through the same content-addressed registration the video-only
    // branch performs (same asset for the same (attempt, frame) — content
    // addressing proves the path equivalence), same named beyond-range
    // refusal from the decoder. Refusing needs BOTH paths dead, and the
    // refusal then names both causes in separate sentences — the engine
    // sentence states the honest class ("could not serve", the raw message
    // naming which), never "unreachable" for a refused/5xx answer.
    const clipRelPath = attempt.result.candidate.assetReference.relPath
    const listingFailedSentence = outputs === null
      ? `The animation engine could not serve its output listing for this attempt (${historyFailure}), so the durable clip was consulted instead.`
      : null
    if (clipRelPath === null) {
      throw new Error([
        ...(listingFailedSentence !== null ? [listingFailedSentence] : []),
        `The engine holds no outputs for attempt ${attemptId} and its landed candidate carries no registered clip path — the frame cannot be resolved.`,
      ].join(' '))
    }
    try {
      return await decodeFrameFromRegisteredClip(deps, attemptId, clipRelPath, frameIndex)
    } catch (failure) {
      if (listingFailedSentence !== null) {
        throw new Error(`${listingFailedSentence} ${failure instanceof Error ? failure.message : String(failure)}`)
      }
      throw failure
    }
  }
  const artifact = frameArtifactOf(outputs, frameIndex)
  if (artifact.kind === 'image') {
    return { assetId: artifact.relPath, relPath: artifact.relPath, kind: 'image' }
  }
  // The video-only listing (the real engine's shape): the clip is already a
  // registered blob (the port registered it when the job materialized) —
  // decode the frame, register the PNG, hand back an IMAGE asset.
  return decodeFrameFromRegisteredClip(deps, attemptId, artifact.relPath, frameIndex)
}

/** The completion owner's prepareFrame: the frame-resolution seam over the
 *  engine's output listing (see resolveFrameAsset). */
export function makeFramePreparer(deps: FrameResolutionDeps): (attemptId: string, frameIndex: number) => Promise<AssetReference> {
  return (attemptId, frameIndex) => resolveFrameAsset(deps, attemptId, frameIndex)
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

/** Terminal execution states (the owner's own set, mirrored so the
 *  dispatch path never second-guesses it): a dispatch that re-reads one of
 *  these after an await ABORTS — a terminal row is never resurrected into
 *  engine work (Codex I1: the cancelled-before-dispatch attempt must not
 *  render just because its reference upload finished). */
const TERMINAL_EXECUTION_STATES: ReadonlySet<string> = new Set(['ready', 'failed', 'cancelled', 'interrupted'])

export function createAnimationRenderingService(deps: {
  store: AnimationStore
  engine: EnginePort
  /** The shared completion owner (one per server — the service delegates
   *  observation/cancel/recovery to it; the composition root wires the same
   *  instance into both). */
  owner: CompletionOwner
  blobs: AnimationBlobSink
  /** The frame-extraction binary (the same re-resolved-per-call seam the
   *  exporter uses): on-demand extraction of a video-only listing's frame. */
  ffmpegPath: () => string
  compile: { hero: typeof compileHeroCaption; tween: typeof compileTweenCaption; sequence: typeof compileSequenceCaption }
  emit: (type: string, payload: unknown) => void
  now?: () => number
}): AnimationRenderingService {
  const { store, engine, owner, blobs, compile, emit, ffmpegPath } = deps
  const now = deps.now ?? Date.now

  /** §7.2.2 validation — everything checked BEFORE anything is persisted.
   *  The document row arrives as the submit path's ONE frozen read (I5). */
  function validate(input: AttemptInput, idempotencyKey: string, document: AnimationDocumentRow | null): void {
    if (!isNonEmptyString(idempotencyKey)) throw new AnimationRuleError('The submission needs an idempotency key.', 400)
    if (!document) throw new AnimationRuleError(`No animation document with id ${String(input?.documentId)}.`, 404)
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

  /** I1's gate: re-reads the row's TERMINAL truth — true when the attempt
   *  is gone or settled (ready/failed/cancelled/interrupted), the states no
   *  dispatch may resurrect. */
  function abortIfTerminal(attemptId: string): boolean {
    const row = store.getAttempt(attemptId)
    return !row || TERMINAL_EXECUTION_STATES.has(row.execution.state)
  }

  /** The frozen snapshot AS PERSISTED (wave 1's Fix B): the received
   *  snapshot stamped with the document's active binding version (task 1's
   *  forward flag) AND the COMPLETE resolved execution configuration —
   *  width/height/steps resolved at PERSIST time (snapshot override >
   *  document settings > operating point — today's dispatch-time
   *  resolveBuildSettings read the LIVE document, so a document that moved
   *  between submit and dispatch/recovery changed the graph), the
   *  sampler/scheduler/shift/fps values in force, the graph-level extras
   *  (length, refImageSize, denoise, loraStrength — fix round M-6), and
   *  the RESOLVED model
   *  ids whenever the submit-time preflight resolved them (an engine
   *  unreachable at submit defers that one piece to dispatch — the only
   *  thing the enumeration gates). The input hash stays over the RECEIVED
   *  snapshot (computed before this stamping) so same-key retries keep
   *  matching even when the document or the engine's enumeration moved:
   *  the ROW's frozen config is what a retry or a recovery replays.
   *
   *  FREEZE-BEFORE-SUBMISSION (Codex I5): every stamp below reads the
   *  PASSED frozen document row — never the live store. The route reads the
   *  document once, synchronously, before any await (its reference
   *  resolution and caption come from that same row); a `store.getDocument`
   *  here would run behind the enumeration/extraction awaits and stamp the
   *  MOVED document's bindingVersion/dimensions/steps onto the OLD
   *  references/caption/revision — one frozen attempt combining two
   *  document revisions, faithfully replayed by dispatch forever after. A
   *  document that moves mid-submission leaves the freeze CONSISTENT at the
   *  entry revision; an honest same-key retry after the move resolves
   *  different references and hash-conflicts (the existing 409). */
  function stampedSnapshot(input: AttemptInput, models: ResolvedAnimationModels | null, document: AnimationDocumentRow | null): FrozenAttemptSnapshot {
    const body = document?.body
    const overrides = isRecord(input.snapshot.settings) ? input.snapshot.settings : {}
    const width = typeof overrides.width === 'number' ? overrides.width : body?.settings.outputWidth ?? ANIMATION_OPERATING_POINT.width
    const height = typeof overrides.height === 'number' ? overrides.height : body?.settings.outputHeight ?? ANIMATION_OPERATING_POINT.height
    const steps = typeof overrides.steps === 'number' ? overrides.steps : body?.settings.steps ?? ANIMATION_OPERATING_POINT.stepsDefault
    const asString = (value: unknown, fallback: string): string => (typeof value === 'string' && value.length > 0 ? value : fallback)
    const asInt = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback)
    const asFloat = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback)
    return {
      ...input.snapshot,
      settings: {
        ...input.snapshot.settings,
        bindingVersion: document?.body.activeBindingVersion ?? 0,
        width,
        height,
        steps,
        sampler: asString(overrides.sampler, ANIMATION_OPERATING_POINT.sampler),
        scheduler: asString(overrides.scheduler, ANIMATION_OPERATING_POINT.scheduler),
        shiftVideo: asInt(overrides.shiftVideo, ANIMATION_OPERATING_POINT.shiftVideo),
        shiftAudio: asInt(overrides.shiftAudio, ANIMATION_OPERATING_POINT.shiftAudio),
        fps: asInt(overrides.fps, ANIMATION_OPERATING_POINT.fps),
        // The graph-level extras the live review's #2 named ("the graph has
        // additional defaults" — fix round M-6): clip length, reference
        // sizing, denoise, and the adapter strength freeze with everything
        // else; no execution-relevant value stays a code constant the
        // snapshot does not carry.
        length: asInt(overrides.length, ANIMATION_OPERATING_POINT.length),
        refImageSize: asString(overrides.refImageSize, ANIMATION_OPERATING_POINT.refImageSize),
        denoise: asFloat(overrides.denoise, ANIMATION_OPERATING_POINT.denoise),
        loraStrength: asFloat(overrides.loraStrength, ANIMATION_OPERATING_POINT.loraStrength),
        ...(models !== null ? models : {}),
      },
    }
  }

  /** The build settings consumed at dispatch — ONLY the frozen snapshot
   *  (plus the resolver's output when the frozen config deferred models):
   *  never the live document, never a code constant the snapshot already
   *  froze. Replay and recovery therefore cannot drift when the document
   *  moves (the reviewer's named test). */
  function frozenBuildSettings(snapshot: FrozenAttemptSnapshot, models: ResolvedAnimationModels): GraphBuildSettings {
    const settings = isRecord(snapshot.settings) ? snapshot.settings : {}
    const positiveIntOr = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback)
    return {
      width: positiveIntOr(settings.width, ANIMATION_OPERATING_POINT.width),
      height: positiveIntOr(settings.height, ANIMATION_OPERATING_POINT.height),
      steps: typeof settings.steps === 'number' && Number.isInteger(settings.steps) && settings.steps > 0 ? settings.steps : ANIMATION_OPERATING_POINT.stepsDefault,
      ...models,
    }
  }

  /** The dispatch core submit and the boot reconcile's redispatch share:
   *  upload the reference bytes (the idempotent, re-usable engine inputs),
   *  resolve the effective model set (from the FROZEN snapshot when
   *  submit-time resolution stamped it — otherwise fresh against the
   *  engine's current enumeration, a dead slot failing the attempt with the
   *  NAMED reason), build the graph EXCLUSIVELY from the frozen config,
   *  and submit with the attempt id stamped in both carriers. Outcomes:
   *  'submitted' (queued + observed), 'failed' (a definitive NAMED refusal
   *  — model resolution, engine validation, or an unreadable reference),
   *  'uncertain' (the /prompt send happened and its outcome is unknown).
   *
   *  THE DELIVERY VERDICT (fix round I-1): a delivery failure is
   *  classified AT THE SEND BOUNDARY and persisted. Everything before
   *  engine.submitGraph — reference uploads, the deferred resolution —
   *  never sent the /prompt, so no engine GPU work for THIS attempt can
   *  have run: those failures persist 'never-delivered' and the boot
   *  sweep's redispatch arm may safely re-drive them (the offline-submit
   *  queue semantics). Anything at or past the send persists 'uncertain'
   *  — the §11.4 ran-and-wiped world, where an empty history proves
   *  nothing and the sweep returns the row to interrupted + explicit
   *  retry. The dispatch path is the ONLY place that knows which side of
   *  the boundary a failure fell on, so the verdict is written here,
   *  durably, at the moment of failure.
   *
   *  THE TERMINAL GATE (Codex I1): every await above the engine submission
   *  is a cancellation window — an attempt persisted while its reference
   *  upload was still awaiting could be cancelled (the owner writes
   *  terminal cancelled) and then RESURRECTED by the dispatch completing
   *  into a /prompt. The row is re-read after EVERY pre-send await (and
   *  once more after the send itself): a terminal row aborts without
   *  engine contact, keeps its terminal state, and emits nothing that
   *  pretends anything rendered. Whichever side of the race wins, the
   *  re-read is the authoritative gate. Outcomes gain 'aborted' for
   *  exactly this case. */
  async function dispatchAttempt(attemptId: string, snapshot: FrozenAttemptSnapshot, documentId: string): Promise<'submitted' | 'failed' | 'uncertain' | 'aborted'> {
    let sent = false
    try {
      // The reference uploads come BEFORE the deferred model resolution: a
      // hung engine (connections accepted, never answered) then stalls
      // exactly where the pre-wave-1 dispatch stalled — after persistence,
      // with no verdict — instead of racing a resolution timeout into a
      // reconciling verdict. The reachable-engine paths are unaffected: the
      // submit-time preflight already gated the reachable case (a dead slot
      // costs no row and no upload there), and a live engine with a dead
      // slot here has already received idempotent, re-usable uploads when
      // the named refusal lands.
      for (const reference of snapshot.references) {
        const bytes = blobs.readBlob((reference.assetReference as { relPath: string }).relPath)
        if (!bytes) throw new AnimationRuleError(`The ${String(reference.role)} reference asset (${(reference.assetReference as { relPath: string }).relPath}) is no longer readable from the store — the frozen reference cannot be uploaded. Re-import the reference asset and re-roll.`, 400)
        await engine.uploadReference(reference.assetReference.assetId, bytes)
        // I1: the upload's await is the cancellation window — a row that
        // went terminal behind it aborts WITHOUT engine contact.
        if (abortIfTerminal(attemptId)) return 'aborted'
      }
      const models = modelsFromSnapshotSettings(snapshot.settings) ?? resolveAnimationModels({
        tool: snapshot.tool,
        enumerations: await engine.modelEnumerations({ force: true }),
        overrides: modelOverrides(snapshot.settings),
      })
      if (abortIfTerminal(attemptId)) return 'aborted'
      const graph: AnimationGraph = buildAnimationGraph(snapshot, frozenBuildSettings(snapshot, models))
      sent = true // past this point the /prompt has left (or failed leaving) — the outcome is the engine's to know
      const { engineJobId } = await engine.submitGraph(graph, attemptId)
      // The send itself raced a cancel (the row went terminal while /prompt
      // was in flight): the re-read is the authoritative gate — the
      // terminal state stands, nothing claims the job for the row, and the
      // just-submitted orphan is deposed best-effort (an orphaned
      // engine-side output never lands and never selects).
      if (abortIfTerminal(attemptId)) {
        await engine.interrupt(engineJobId).catch(() => undefined)
        await engine.dequeue(engineJobId).catch(() => undefined)
        return 'aborted'
      }
      store.setAttemptExecution(attemptId, { state: 'queued', engineJobId })
      owner.observe(attemptId)
      emit('animation.attempt.submitted', { attemptId, documentId, engineJobId, tool: snapshot.tool })
      return 'submitted'
    } catch (failure) {
      if (failure instanceof AnimationModelResolutionError) {
        // The engine's enumeration cannot serve a slot: definitively failed
        // with the NAMED reason persisted durably (the re-roll re-resolves
        // by construction — the repair path is the reason text itself).
        store.setAttemptExecution(attemptId, { state: 'failed', failureReason: failure.message })
        emit('animation.attempt.failed', { attemptId, documentId, reason: 'model-resolution', detail: failure.message })
        return 'failed'
      }
      if (failure instanceof AnimationEngineValidationError) {
        // Definitive refusal (the engine answered and said no): failed with
        // the composed SANITIZED reason (node class, input, value — never
        // the raw engine answer).
        store.setAttemptExecution(attemptId, { state: 'failed', failureReason: failure.reason })
        emit('animation.attempt.failed', { attemptId, documentId, reason: 'engine-validation', detail: failure.reason })
        return 'failed'
      }
      if (failure instanceof AnimationRuleError) {
        // A rule-class failure at dispatch (the unreadable-reference shape)
        // is TERMINAL, not uncertain (fix round M-2): the throw precedes
        // the send, so nothing is in flight — marking it reconciling would
        // make every later boot re-attempt a row that can never dispatch,
        // forever. Failed with the named reason; the re-roll re-freezes
        // fresh references.
        store.setAttemptExecution(attemptId, { state: 'failed', failureReason: failure.message })
        emit('animation.attempt.failed', { attemptId, documentId, reason: 'dispatch-input', detail: failure.message })
        return 'failed'
      }
      // A delivery failure, classified at the send boundary (I-1): the
      // verdict persists WITH the reconciling state, and the boot sweep's
      // redispatch arm reads it. Reconciliation pending, the attempt
      // preserved (§11.4).
      const verdict = sent ? 'uncertain' : 'never-delivered'
      store.setAttemptExecution(attemptId, { state: 'reconciling', dispatchVerdict: verdict })
      emit('animation.attempt.uncertain', { attemptId, documentId, verdict, error: failure instanceof Error ? failure.message : String(failure), at: now() })
      return 'uncertain'
    }
  }

  return {
    async submit(input, idempotencyKey) {
      // §7.2.2 idempotency FIRST — the fix round's M-3 reorder (wave 1's M6
      // pattern: the idempotency check precedes validation that depends on
      // the CURRENT build). The compiler-version gate inside validate() would
      // 400 a verbatim v1-era replay (or 409 after a fresh re-resolve) the
      // moment the version bumps; the row that already exists is the retry's
      // answer regardless of what a NEW build would demand of a NEW snapshot.
      // Only the key's own shape guards the peek; everything else validates
      // below for fresh keys.
      if (!isNonEmptyString(idempotencyKey)) throw new AnimationRuleError('The submission needs an idempotency key.', 400)
      // §11.4 idempotency: the hash over the RECEIVED input; a same-key
      // retry with different inputs is a conflict, never a second render.
      const inputHash = animationInputHash(input?.snapshot ?? null)
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

      // THE FROZEN DOCUMENT (I5): the submit path's ONE document read, taken
      // here — synchronously, before the first await below (the caller that
      // already read one at its own entry, the route, passes its row in and
      // this read never fires). Validation and every stamp consume this row;
      // nothing after the enumeration/extraction awaits re-reads the store's
      // live document on the freeze path.
      const frozenDocument = input.document ?? store.getDocument(input?.documentId ?? '')
      validate(input, idempotencyKey, frozenDocument)

      // Wave 1's preflight (the live review's #1): resolve the model set
      // against the engine's OWN enumeration BEFORE anything is persisted —
      // a dead slot is a structured 400 naming the slot, the tried names,
      // and what the engine enumerates, with NOTHING spent (no attempt row,
      // no upload, no submission). An unreachable engine defers resolution
      // to dispatch: queue semantics stand, submits never block on engine
      // reachability.
      let preflight: ResolvedAnimationModels | null = null
      try {
        preflight = resolveAnimationModels({
          tool: input.tool,
          enumerations: await engine.modelEnumerations({ force: true }),
          overrides: modelOverrides(input.snapshot.settings),
        })
      } catch (failure) {
        if (failure instanceof AnimationModelResolutionError) {
          throw new AnimationRuleError(failure.message, 400)
        }
        preflight = null
      }

      const snapshot = stampedSnapshot(input, preflight, frozenDocument)
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
        // A concurrent same-key writer won the insert race (Codex I6): both
        // requests peeked before either persisted, so the store's
        // return-existing contract hands the loser the WINNER's row. The
        // sequential same-input retry that contract answers must be earned —
        // the loser's own input hash is compared against the row's, and a
        // different-input loser gets the same 409 the sequential case answers
        // (never a silent 200 for the winner's render).
        if (recorded.attempt.inputHash !== inputHash) {
          const document = store.getDocument(recorded.attempt.documentId)
          throw new AnimationConflictError(
            document ? document.revision : 0,
            document,
            `This idempotency key was already used for attempt ${recorded.attempt.id} with different inputs — a retry must carry the same frozen snapshot (spec §11.4).`,
          )
        }
        return { attemptId: recorded.attempt.id, created: false }
      }
      emit('animation.attempt.persisted', { attemptId, documentId: input.documentId, tool: input.tool })

      // Dispatch (shared with the reconcile redispatch): reference bytes
      // reach the engine's input folder, then the graph built from the
      // FROZEN config. The attempt row is the durable dispatch intent — an
      // outcome that cannot be confirmed leaves it reconciliation-pending,
      // never dropped (§11.4).
      await dispatchAttempt(attemptId, snapshot, input.documentId)
      return { attemptId, created: true }
    },

    async redispatchAttempt(attemptId) {
      // The sweep's queue-semantic redispatch, narrowed to the PROVABLY
      // never-delivered (fix round I-1): only a row that is in flight,
      // holds no engine job, AND carries the dispatch path's own
      // 'never-delivered' verdict — the /prompt provably never left the
      // studio, so re-driving the persisted intent repeats no engine work —
      // reaches here. Uncertain-verdict and verdict-less rows (the
      // §11.4 ran-and-wiped world, pre-verdict rows) answer null and the
      // sweep marks them interrupted + explicit retry.
      const attempt = store.getAttempt(attemptId)
      if (!attempt || attempt.engineJobId !== null) return null
      if (attempt.execution.dispatchVerdict !== 'never-delivered') return null
      if (!['queued', 'reconciling', 'rendering', 'preparing'].includes(attempt.execution.state)) return null
      return dispatchAttempt(attempt.id, attempt.snapshot, attempt.documentId)
    },

    getState(attemptId) {
      const attempt = store.getAttempt(attemptId)
      if (!attempt) throw new AnimationRuleError(`No attempt with id ${attemptId}.`, 404)
      const view: AttemptStateView = {
        attemptId: attempt.id,
        tool: attempt.tool,
        targetId: attempt.targetId,
        ...(attempt.tool === 'hero' && attempt.snapshot.hero !== undefined
          ? {
              sourceKeyId: attempt.snapshot.hero.sourceKeyId,
              movementArc: attempt.snapshot.hero.movementArc,
              heroOverrides: attempt.snapshot.hero.overrides,
            }
          : {}),
        ...(attempt.tool === 'sequence' && attempt.snapshot.sequence !== undefined
          ? {
              windowEndKeyId: attempt.snapshot.sequence.windowEndKeyId,
              sequenceActions: attempt.snapshot.sequence.orderedActions,
              sequencePreservation: attempt.snapshot.sequence.preservation,
              sequenceOverrides: attempt.snapshot.sequence.overrides,
            }
          : {}),
        caption: attempt.snapshot.caption,
        compilerVersion: attempt.snapshot.compilerVersion,
        execution: attempt.execution.state,
        preparation: {
          state: attempt.preparation.state,
          ...(attempt.preparation.proposedFrameIndex !== undefined ? { proposedFrameIndex: attempt.preparation.proposedFrameIndex } : {}),
          ...(attempt.preparation.error !== undefined ? { error: attempt.preparation.error } : {}),
        },
        candidate: attempt.result ? attempt.result.candidate : null,
      }
      if (attempt.execution.progress !== undefined) view.progress = attempt.execution.progress
      if (attempt.execution.failureReason !== undefined) view.failureReason = attempt.execution.failureReason
      return view
    },

    cancel(attemptId) {
      return owner.cancel(attemptId)
    },

    retryPreparation(attemptId) {
      return owner.retryPreparation(attemptId)
    },

    async extractFrame(attemptId, frameIndex) {
      const attempt = store.getAttempt(attemptId)
      if (!attempt) throw new AnimationRuleError(`No attempt with id ${attemptId}.`, 404)
      if (!attempt.result) throw new AnimationRuleError('Only a landed clip can have a frame extracted.', 400)
      if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= attempt.result.candidate.frameCount) {
        throw new AnimationRuleError(`frameIndex must be an integer within the clip (0..${attempt.result.candidate.frameCount - 1}).`, 400)
      }
      if (!attempt.engineJobId) throw new AnimationRuleError('The attempt has no engine job to extract from.', 400)
      // On-demand extraction (§7.2.2 path 2): the SAME frame-resolution seam
      // the preparer performs — an image-sequence listing resolves the
      // frame-addressed image, a video-only listing frame-accurately decodes
      // through ffmpeg. Content addressing makes it idempotent per (take,
      // frame, extraction recipe); an unresolvable frame is a NAMED refusal
      // (never a video-asset reference the submission would reject).
      try {
        return await resolveFrameAsset({ engine, store, blobs, ffmpegPath }, attemptId, frameIndex)
      } catch (error) {
        if (error instanceof AnimationRuleError) throw error
        throw new AnimationRuleError(`The frame could not be extracted: ${error instanceof Error ? error.message : String(error)}`, 400)
      }
    },

    compileCaption(input) {
      if (input.tool === 'hero') return compile.hero(input.context)
      if (input.tool === 'tween') return compile.tween(input.context)
      return compile.sequence(input.context)
    },
  }
}
