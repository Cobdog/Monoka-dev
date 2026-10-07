/**
 * The animation module's typed HTTP client (task 6, k2q0n9s — spec
 * 2026-10-06-animation-authoring-module-design.md §7.2 the editor-facing
 * service contract): thin fetch wrappers, ONE method per route in
 * server/animation/routes.ts, the documentsApi idiom (no caching, no retry
 * — the module's state layer owns state; every failure throws with the
 * server's message so the surface can route it honestly).
 *
 * The conflict surface is TYPED: every mutating method can answer 409 — a
 * stale expectedRevision, or a same-idempotency-key retry after the document
 * moved (the frozen snapshot carries the revision at submit time, part of
 * the input hash — task 5's carried note). Both arrive as AnimationConflict
 * carrying the server's CURRENT document, so the caller re-reads and
 * rebases onto it — never a silent lost update, never a blind re-POST.
 */
import type {
  AnimationDocumentBody,
  AnimationTool,
  AssetReference,
  AttemptExecutionState,
  BindingInput,
  FacingTerm,
  MediumString,
} from '../../shared/animation/types'
import type { SessionOverrideInput } from '../../shared/animation/compiler'

/** The route's document view — the row plus its attempts (the recovery
 *  read's shape; §7.2.1 "the contract is durable, not callback-chained").
 *  `schemaVersion`/`updatedAt` ride the wire; optional here because the
 *  contract's consumers key on the fields the spec names. */
export type AnimationDocumentView = {
  id: string
  name: string
  projectId: string
  revision: number
  body: AnimationDocumentBody
  attempts: AttemptStateView[]
  schemaVersion?: number
  updatedAt?: number
}

/** A mirror of server/animation/rendering.ts's AttemptStateView (the server
 *  module cannot enter the client bundle; the shapes are one contract —
 *  change them together). `candidate.id` is the MINTED document candidate
 *  id (hero landings — correlate it against the key slot's candidates);
 *  null when the tool mints nothing (tween attaches by attemptId, sequence
 *  surfaces through editorial selection). */
export type AttemptStateView = {
  attemptId: string
  execution: AttemptExecutionState
  progress?: { value: number; max: number }
  preparation: { state: 'pending' | 'proposed' | 'failed' | 'done'; proposedFrameIndex?: number }
  candidate: { id: string | null; assetReference: AssetReference; frameCount: number; earlierRevision: boolean } | null
}

/** The bootstrap vocabularies (§6.3's closed sets) + the document defaults
 *  (the operating point; stepsMin/stepsMax clamp the inspector's dial). */
export type AnimationBootstrap = {
  schemaVersion: number
  compilerVersion: string
  media: MediumString[]
  facingTerms: FacingTerm[]
  defaults: { outputWidth: number; outputHeight: number; fps: 24; steps: number; stepsMin?: number; stepsMax?: number }
}

/** The EDITABLE draft (span intent + resolved references + overrides) — the
 *  SERVER compiles + freezes it into a FrozenAttemptSnapshot (§7.2.2); a
 *  draft never rewrites a running attempt (§8.1). */
export type DraftInput =
  | { tool: 'hero'; targetKeyId: string; movementArc: string; overrides: SessionOverrideInput }
  | { tool: 'tween'; targetStepSlotId: string; movementStep: string; overrides: SessionOverrideInput }
  | { tool: 'sequence'; windowStartKeyId: string; windowEndKeyId: string; orderedActions: string[]; preservation: string; overrides: SessionOverrideInput }

/** Animation-route failure carrying its HTTP status (the DocumentsHttpError
 *  idiom): rule refusals answer 400/404 with their reason. */
export class AnimationHttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'AnimationHttpError'
    this.status = status
  }
}

/** The 409 surface: the server's current document rides the body so the
 *  caller rebases onto it and re-issues on the fresh revision. */
export class AnimationConflict extends AnimationHttpError {
  readonly currentRevision: number
  readonly currentDocument: AnimationDocumentView | null
  constructor(currentRevision: number, currentDocument: AnimationDocumentView | null, message: string) {
    super(409, message)
    this.name = 'AnimationConflict'
    this.currentRevision = currentRevision
    this.currentDocument = currentDocument
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Narrows a route response's `document` into the view — checked scalars
 *  (the documents.ts str/num idiom); a malformed row degrades to null so a
 *  broken conflict payload can never crash the rebase path. */
function toDocumentView(value: unknown): AnimationDocumentView | null {
  if (!isRecord(value)) return null
  const { id, name, projectId, revision, body, attempts, schemaVersion, updatedAt } = value
  if (typeof id !== 'string' || typeof name !== 'string' || typeof projectId !== 'string') return null
  if (typeof revision !== 'number' || !isRecord(body) || !Array.isArray(attempts)) return null
  const view: AnimationDocumentView = { id, name, projectId, revision, body: body as AnimationDocumentBody, attempts: attempts as AttemptStateView[] }
  if (typeof schemaVersion === 'number') view.schemaVersion = schemaVersion
  if (typeof updatedAt === 'number') view.updatedAt = updatedAt
  return view
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('x-minimax-token', new URLSearchParams(window.location.search).get('token') ?? '')
  const response = await fetch(path, { ...init, headers })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (response.status === 409) {
    const conflict = isRecord(body.conflict) ? body.conflict : {}
    throw new AnimationConflict(
      typeof conflict.currentRevision === 'number' ? conflict.currentRevision : 0,
      toDocumentView(conflict.currentDocument),
      typeof body.error === 'string' ? body.error : 'This animation document changed while it was being edited — reload it and retry on the fresh copy.',
    )
  }
  if (!response.ok) throw new AnimationHttpError(response.status, typeof body.error === 'string' ? body.error : `animation request failed (${response.status})`)
  return body as T
}

const post = <T>(path: string, payload: unknown): Promise<T> =>
  call<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })

/** One document-bearing response: the route's `{ document }` wrapper off. */
async function documentCall(path: string, init?: RequestInit): Promise<AnimationDocumentView> {
  const body = await call<{ document: unknown }>(path, init)
  const view = toDocumentView(body.document)
  if (!view) throw new AnimationHttpError(500, 'The animation document response was malformed.')
  return view
}

/** documentCall's twin for the post() arms — the same wrapper off. */
async function documentOf(body: { document: unknown }): Promise<AnimationDocumentView> {
  const view = toDocumentView(body.document)
  if (!view) throw new AnimationHttpError(500, 'The animation document response was malformed.')
  return view
}

export const animationApi = {
  bootstrap: () => call<AnimationBootstrap>('/api/lan/animation/bootstrap'),

  createDocument: (input: { projectId: string; name: string; binding: BindingInput }) =>
    documentCall('/api/lan/animation/documents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }),

  listDocuments: async (projectId: string): Promise<Array<{ id: string; name: string; updatedAt: number }>> => {
    const body = await call<{ documents: unknown }>(`/api/lan/animation/documents?project=${encodeURIComponent(projectId)}`)
    return Array.isArray(body.documents) ? body.documents as Array<{ id: string; name: string; updatedAt: number }> : []
  },

  /** The recovery read — document + attempts, durable, never
   *  callback-chained (§7.2.1). A missing document answers 404. */
  getDocument: (id: string) => documentCall(`/api/lan/animation/document?id=${encodeURIComponent(id)}`),

  updateBinding: (documentId: string, binding: BindingInput, expectedRevision: number) =>
    post<{ document: unknown }>('/api/lan/animation/binding', { documentId, binding, expectedRevision }).then(documentOf),

  /** The key commands (one route, discriminated by op): payload carries the
   *  op's own fields — { keyId, candidate } for add-candidate, { keyId,
   *  candidateId } for select, { keyId } for lock/unlock. */
  keyCommand: (documentId: string, op: 'add-candidate' | 'select' | 'lock' | 'unlock', payload: Record<string, unknown>, expectedRevision: number) =>
    post<{ document: unknown }>('/api/lan/animation/keys', { documentId, op, ...payload, expectedRevision }).then(documentOf),

  /** The span commands: payload carries { fromKeyId, toKeyId, intent,
   *  overrides? } for insert, { spanId, intent } for update-intent, and
   *  { spanId } for remove. */
  spanCommand: (documentId: string, op: 'insert' | 'update-intent' | 'remove', payload: Record<string, unknown>, expectedRevision: number) =>
    post<{ document: unknown }>('/api/lan/animation/spans', { documentId, op, ...payload, expectedRevision }).then(documentOf),

  selectKeyCandidate: (documentId: string, keyId: string, candidateId: string, expectedRevision: number) =>
    post<{ document: unknown }>('/api/lan/animation/select/key-candidate', { documentId, keyId, candidateId, expectedRevision }).then(documentOf),

  selectRollingReference: (documentId: string, spanId: string, attemptId: string, frameIndex: number, expectedRevision: number) =>
    post<{ document: unknown }>('/api/lan/animation/select/rolling-reference', { documentId, spanId, attemptId, frameIndex, expectedRevision }).then(documentOf),

  selectClipContribution: (documentId: string, spanId: string, attemptId: string, inFrame: number, outFrame: number, holdDuration: number, expectedRevision: number) =>
    post<{ document: unknown }>('/api/lan/animation/select/clip-contribution', { documentId, spanId, attemptId, inFrame, outFrame, holdDuration, expectedRevision }).then(documentOf),

  /** Submits a DRAFT — the server resolves the tool's references, compiles
   *  the caption, and freezes the snapshot (§7.2.2). `options.seed` rides a
   *  deliberate re-roll (a new idempotency key); without it the route stamps
   *  a deterministic seed so a lost-response retry reproduces the same
   *  snapshot. Same key + different inputs answers AnimationConflict. */
  submit: (input: { documentId: string; tool: AnimationTool; targetId: string; draft: DraftInput }, idempotencyKey: string, options?: { seed?: number }) =>
    post<{ attemptId: string; created: boolean }>('/api/lan/animation/attempts', { ...input, idempotencyKey, ...(options?.seed !== undefined ? { seed: options.seed } : {}) }),

  attemptState: async (attemptId: string): Promise<AttemptStateView> => {
    const body = await call<{ attempt: AttemptStateView }>(`/api/lan/animation/attempt?id=${encodeURIComponent(attemptId)}`)
    return body.attempt
  },

  cancel: async (attemptId: string): Promise<void> => {
    await post('/api/lan/animation/attempt/cancel', { attemptId })
  },

  extractFrame: async (attemptId: string, frameIndex: number): Promise<AssetReference> => {
    const body = await post<{ assetReference: AssetReference }>('/api/lan/animation/attempt/extract-frame', { attemptId, frameIndex })
    return body.assetReference
  },
}
