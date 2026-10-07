/**
 * The animation HTTP surface (spec 2026-10-06-animation-authoring-module-
 * design.md §7.2 the editor-facing service contract, §7.2.1 the three
 * selection commands, §7.2.2 submission idempotency, §11.1 the route
 * decision, §11.4 the restart-recovery policy): a PURE handler module —
 * core.ts stays the dispatcher and mounts this under /api/lan/animation in
 * its literal-pathname style. Three responsibilities live here:
 *
 *   1. THE ROUTES — documents create/list/read (the recovery read is
 *      durable, not callback-changed), the versioned binding update, the
 *      key and span command routes (discriminated by `op`, every branch
 *      expectedRevision-gated through the store's transactions), the THREE
 *      selection commands as distinct routes (§7.2.1), and the attempt
 *      surface (submit / state / cancel / extract-frame) delegating to the
 *      rendering service. The failure mapping is the documents block's:
 *      AnimationConflictError → 409 WITH the current document (the rebase
 *      surface), AnimationRuleError → 400/404 with the reason,
 *      CanvasSchemaVersionError → 400 loud refusal naming the versions.
 *
 *   2. THE AUTHORITATIVE COMPILE — submit bodies carry a DRAFT (intent +
 *      overrides), never a frozen snapshot: the route resolves the tool's
 *      references from the document's selected truth (§4.3's per-tool
 *      reference contract), compiles the caption through the shared
 *      compiler via the service's one server-side compile dispatch, and
 *      freezes the snapshot — caption, compilerVersion, documentRevision,
 *      and the SEED. The seed policy lives HERE on purpose (task 4's
 *      carried-forward note): the submit path deliberately does not
 *      auto-stamp one (an auto-varying stamp would break same-key
 *      idempotency), so the route stamps a DETERMINISTIC seed — the
 *      client's explicit seed when re-rolling, else one derived from the
 *      hash of (draft inputs + idempotency key). Same request retried ⇒
 *      same seed ⇒ same input hash ⇒ the existing attempt; a new key ⇒ a
 *      new seed ⇒ a fresh roll.
 *
 *   3. THE FABRIC VOCABULARY — `animationFabricEmitter` adapts the service
 *      and completion owner's internal `animation.attempt.*` events onto
 *      the fabric's animation channel envelopes (attempt-state /
 *      attempt-ready / reconciliation; the routes emit document-changed
 *      directly), and `makeEngineEventTap` feeds the realtime hub's
 *      normalized upstream engine events (promptId-keyed) into the owner's
 *      attempt vocabulary by resolving the prompt id through the store.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { CanvasSchemaVersionError } from '../documents'
import { AnimationConflictError, AnimationRuleError, type AnimationDocumentRow, type AnimationStore } from './store'
import type { AnimationRenderingService } from './rendering'
import type { CompletionOwner } from './completion-owner'
import type { JobLifecycleEvent } from '../../src/types'
import {
  ANIMATION_MEDIA,
  FACING_TERMS,
  animationInputHash,
  isMediumString,
  isUuid,
  type AnimationTool,
  type AssetReference,
  type BindingInput,
  type FacingTerm,
  type FrozenAttemptSnapshot,
  type KeyCandidate,
  type MediumString,
} from '../../shared/animation/types'
import { ANIMATION_OPERATING_POINT } from '../../shared/animation/graphs'
import { COMPILER_VERSION } from '../../shared/animation/compiler'
import type { HeroContext, SequenceContext, TweenContext } from '../../shared/animation/compiler'

// ---------------------------------------------------------------------------
// small narrowing helpers (the documents.ts str/num idiom)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** Authored text bound: long enough for any honest pose/movement
 *  description, short enough that a compiled caption cannot approach the
 *  service's 20,000-character freeze limit from a single field. */
const TEXT_LIMIT = 8_000

function boundedText(value: unknown, field: string): string {
  if (!isNonEmptyString(value) || value.length > TEXT_LIMIT) {
    throw new AnimationRuleError(`${field} must be non-empty text of at most ${TEXT_LIMIT} characters.`, 400)
  }
  return value
}

/** The compile overrides (the compiler's SessionOverrideInput): a closed
 *  medium vocabulary plus optional scene and camera-with-reason — §6.3's
 *  "caption overrides must preserve the dialect's constraints" is checked
 *  here so the compiler's own guards are a backstop, not the API surface. */
function parseOverrides(value: unknown): { medium: MediumString; scene?: string; camera?: { description: string; reason: string } } {
  if (!isRecord(value)) throw new AnimationRuleError('The draft needs overrides with a medium (a member of the fixed vocabulary).', 400)
  if (!isMediumString(value.medium)) throw new AnimationRuleError(`The medium must be one of: ${ANIMATION_MEDIA.join(' / ')}.`, 400)
  const overrides: { medium: MediumString; scene?: string; camera?: { description: string; reason: string } } = { medium: value.medium }
  if (value.scene !== undefined) {
    if (typeof value.scene !== 'string' || value.scene.length > TEXT_LIMIT) throw new AnimationRuleError('The scene override must be text.', 400)
    overrides.scene = value.scene
  }
  if (value.camera !== undefined) {
    if (!isRecord(value.camera) || typeof value.camera.description !== 'string' || typeof value.camera.reason !== 'string'
      || value.camera.description.length > TEXT_LIMIT || value.camera.reason.length > TEXT_LIMIT) {
      throw new AnimationRuleError('The camera override needs a description and a reason clause (text).', 400)
    }
    overrides.camera = { description: value.camera.description, reason: value.camera.reason }
  }
  return overrides
}

// ---------------------------------------------------------------------------
// the fabric envelope adapter (internal events → the animation channel)
// ---------------------------------------------------------------------------

/** The fabric's animation envelopes (task 6's client wraps these 1:1):
 *  attempt-state carries the execution vocabulary; attempt-ready the landed
 *  candidate; reconciliation the §11.4 uncertain/lost outcomes;
 *  document-changed the authoring surface (emitted by the routes). */
export function animationFabricEmitter(emitAnimation: (type: string, payload: unknown) => void): (type: string, payload: unknown) => void {
  const attemptState = (payload: Record<string, unknown>, execution: string) => {
    if (!isNonEmptyString(payload.attemptId) || !isNonEmptyString(payload.documentId)) return
    const envelope: Record<string, unknown> = { documentId: payload.documentId, attemptId: payload.attemptId, execution }
    if (isRecord(payload.progress)) envelope.progress = payload.progress
    emitAnimation('attempt-state', envelope)
  }
  return (type, payload) => {
    if (!isRecord(payload)) return
    switch (type) {
      case 'animation.attempt.persisted':
      case 'animation.attempt.submitted':
        // The durable row exists and the dispatch is en route — the honest
        // user-facing state of both moments is queued.
        attemptState(payload, 'queued')
        return
      case 'animation.attempt.updated':
        if (typeof payload.execution === 'string') attemptState(payload, payload.execution)
        return
      case 'animation.attempt.failed':
        attemptState(payload, 'failed')
        return
      case 'animation.attempt.cancelled':
        attemptState(payload, 'cancelled')
        return
      case 'animation.attempt.uncertain':
        // §11.4's uncertain dispatch: pending, preserved.
        attemptState(payload, 'reconciling')
        if (isNonEmptyString(payload.attemptId)) emitAnimation('reconciliation', { attemptId: payload.attemptId, outcome: 'pending' })
        return
      case 'animation.attempt.lost':
        // Confirmed lost (engine asked, no trace): interrupted — explicit
        // user retry only.
        attemptState(payload, 'interrupted')
        if (isNonEmptyString(payload.attemptId)) emitAnimation('reconciliation', { attemptId: payload.attemptId, outcome: 'interrupted' })
        return
      case 'animation.attempt.ready': {
        if (!isNonEmptyString(payload.attemptId) || !isNonEmptyString(payload.documentId)) return
        const candidate = isRecord(payload.candidate) ? payload.candidate : null
        const asset = candidate && isRecord(candidate.assetReference) ? candidate.assetReference : null
        emitAnimation('attempt-ready', {
          documentId: payload.documentId,
          attemptId: payload.attemptId,
          candidateId: asset && isNonEmptyString(asset.assetId) ? asset.assetId : null,
        })
        return
      }
      default:
        // preparation/lifecycle detail events stay server-internal: the
        // attempt-state envelopes they sit between are the re-fetch signal.
        return
    }
  }
}

/** The realtime hub's normalized upstream engine events (promptId-keyed)
 *  resolved onto the owner's attempt vocabulary — the observation feed rides
 *  the SAME shared upstream socket every other engine consumer uses (§10.1:
 *  no shadow engine client). Correlation is the store's engine_job_id index;
 *  events for non-animation prompts (the canvas lane) resolve to nothing and
 *  drop. */
export function makeEngineEventTap(store: AnimationStore, owner: CompletionOwner): (event: JobLifecycleEvent) => void {
  return (event) => {
    const attempt = store.attemptByEngineJobId(event.promptId)
    if (!attempt) return
    switch (event.type) {
      case 'execution_start':
      case 'executing':
        owner.onAttemptEvent(attempt.id, { type: 'executing' })
        return
      case 'progress':
        owner.onAttemptEvent(attempt.id, { type: 'progress', value: event.value, max: event.max })
        return
      case 'job_done':
        if (event.outcome === 'success') owner.onAttemptEvent(attempt.id, { type: 'done' })
        else if (event.outcome === 'error') owner.onAttemptEvent(attempt.id, { type: 'error' })
        else owner.onAttemptEvent(attempt.id, { type: 'interrupted' })
        return
      default:
        return
    }
  }
}

// ---------------------------------------------------------------------------
// the route module
// ---------------------------------------------------------------------------

export type AnimationRouteDeps = {
  store: AnimationStore
  service: AnimationRenderingService
  emitAnimation: (type: string, payload: unknown) => void
  /** Resolves when the boot reconcile sweep finished — submissions serialize
   *  behind it (the ready flag; §11.4 never blindly resubmits). */
  ready: () => Promise<void>
  /** The engine policy gate (core.ts owns the local-only SSRF rule): the
   *  submit route refuses loudly instead of dispatching at a disallowed
   *  configured engine. */
  engineAllowed: () => { ok: true } | { ok: false; error: string }
  sendJson: (response: ServerResponse, status: number, value: unknown) => void
  readJson: (request: IncomingMessage, maximumBytes?: number) => Promise<Record<string, unknown>>
}

export function createAnimationRoutes(deps: AnimationRouteDeps): (request: IncomingMessage, response: ServerResponse, url: URL) => Promise<void> {
  const { store, service, emitAnimation, ready, engineAllowed, sendJson, readJson } = deps

  // ---- shared plumbing ------------------------------------------------------

  function animationFailure(response: ServerResponse, error: unknown): boolean {
    if (error instanceof CanvasSchemaVersionError) {
      sendJson(response, 400, {
        error: error.message,
        schemaVersion: { found: error.found, supported: error.supported, writerAppVersion: error.writerAppVersion },
      })
      return true
    }
    if (error instanceof AnimationConflictError) {
      sendJson(response, 409, {
        error: error.message,
        conflict: { currentRevision: error.currentRevision, currentDocument: error.currentDocument ? documentView(error.currentDocument) : null },
      })
      return true
    }
    if (error instanceof AnimationRuleError) {
      sendJson(response, error.status, { error: error.message })
      return true
    }
    return false
  }

  /** The document view every document-bearing response shares — the row plus
   *  its attempts (the recovery read's shape; §7.2.1 "the contract is
   *  durable, not callback-chained"). */
  function documentView(row: AnimationDocumentRow) {
    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      schemaVersion: row.schemaVersion,
      revision: row.revision,
      body: row.body,
      updatedAt: row.updatedAt,
      attempts: store.attemptsForDocument(row.id).map((attempt) => service.getState(attempt.id)),
    }
  }

  function emitDocumentChanged(documentId: string, revision: number, reason: string): void {
    emitAnimation('document-changed', { documentId, revision, reason })
  }

  /** One revision-gated authoring command: run, emit document-changed, answer
   *  with the fresh view; mapped failures answer themselves, anything else
   *  propagates to the structural 500 (the documents block's contract). */
  async function authoring(response: ServerResponse, request: IncomingMessage, reason: string, run: (body: Record<string, unknown>, expectedRevision: number) => AnimationDocumentRow): Promise<void> {
    const body = await readJson(request, 2_000_000)
    // A non-integer expectedRevision reaches the store's own 400 (the gate is
    // one rule, stated once) — NaN fails its Number.isInteger check.
    const expectedRevision = typeof body.expectedRevision === 'number' && Number.isInteger(body.expectedRevision) && body.expectedRevision >= 0
      ? body.expectedRevision
      : Number.NaN
    try {
      const row = run(body, expectedRevision)
      emitDocumentChanged(row.id, row.revision, reason)
      sendJson(response, 200, { document: documentView(row) })
      return
    } catch (error) {
      if (animationFailure(response, error)) return
      throw error
    }
  }

  const expectedRevisionFrom = (body: Record<string, unknown>): number =>
    typeof body.expectedRevision === 'number' && Number.isInteger(body.expectedRevision) && body.expectedRevision >= 0
      ? body.expectedRevision
      : Number.NaN

  const documentIdFrom = (body: Record<string, unknown>): string => {
    if (!isUuid(body.documentId)) throw new AnimationRuleError(`No animation document with id ${String(body.documentId)}.`, 404)
    return body.documentId
  }

  const uuidField = (body: Record<string, unknown>, field: string): string => {
    if (!isUuid(body[field])) throw new AnimationRuleError(`${field} must be a UUID.`, 400)
    return body[field]
  }

  const recordField = (body: Record<string, unknown>, field: string, hint: string): Record<string, unknown> => {
    if (!isRecord(body[field])) throw new AnimationRuleError(hint, 400)
    return body[field]
  }

  // ---- draft → frozen snapshot (the authoritative server-side compile) -----

  /** §4.3's per-tool reference contract, resolved from the document's
   *  selected truth — a missing selection is a state refusal (400), a
   *  missing slot a 404, both structured. */
  function selectedCandidate(body: AnimationDocumentRow['body'], keyId: string): KeyCandidate {
    const slot = body.keys.find((entry) => entry.id === keyId)
    if (!slot) throw new AnimationRuleError(`No key slot with id ${keyId} in this document.`, 404)
    if (!slot.selectedCandidateId) {
      throw new AnimationRuleError(`Key slot ${keyId} has no selected candidate — select one before submitting.`, 400)
    }
    const candidate = slot.candidates.find((entry) => entry.id === slot.selectedCandidateId)
    if (!candidate) throw new AnimationRuleError(`Key slot ${keyId}'s selection is dangling.`, 400)
    return candidate
  }

  type PoseContext = { assetReference: AssetReference; pose: { poseDescription: string | null; facing: FacingTerm | null } }

  const poseContextOf = (candidate: KeyCandidate): PoseContext => ({
    assetReference: candidate.assetReference,
    pose: { poseDescription: candidate.poseDescription, facing: candidate.facing },
  })

  function resolveDraft(document: AnimationDocumentRow, tool: AnimationTool, targetId: string, draft: Record<string, unknown>): {
    compile: { tool: 'hero'; context: HeroContext } | { tool: 'tween'; context: TweenContext } | { tool: 'sequence'; context: SequenceContext }
    references: FrozenAttemptSnapshot['references']
  } {
    const body = document.body
    if (tool === 'hero') {
      if (draft.targetKeyId !== targetId) throw new AnimationRuleError('The hero draft must name the target key slot as its targetKeyId.', 400)
      const candidate = selectedCandidate(body, targetId)
      return {
        compile: {
          tool: 'hero',
          context: {
            currentKey: poseContextOf(candidate),
            movementArc: boundedText(draft.movementArc, 'The movement arc'),
            overrides: parseOverrides(draft.overrides),
          },
        },
        references: [{ role: 'current-key', assetReference: candidate.assetReference, poseDescription: candidate.poseDescription, facing: candidate.facing }],
      }
    }
    if (tool === 'tween') {
      if (draft.targetStepSlotId !== targetId) throw new AnimationRuleError('The tween draft must name the target step slot as its targetStepSlotId.', 400)
      const span = body.spans.find((entry) => entry.stepSlots.some((slot) => slot.id === targetId))
      if (!span) throw new AnimationRuleError(`No tween step slot with id ${targetId} in this document.`, 404)
      const slotIndex = span.stepSlots.findIndex((slot) => slot.id === targetId)
      // The ACTUAL current rolling reference (§6.4): the promoted frame from
      // the last landed step before this one — falling back to the span's
      // start key while the chain has landed nothing. The promoted frame's
      // pose belongs to the frame, not the document: it carries none, and
      // the compiler flags that honestly as a hint. (Honest limit, task 4's:
      // this build's frame assets ARE the clip artifacts — kind 'video' —
      // so a tween whose near reference is a promoted frame is refused by
      // the service's image-only reference rule until frame-accurate
      // extraction lands on the real-engine leg; a chain's FIRST step is
      // unaffected, its near reference is the start key's image.)
      let near: PoseContext | null = null
      for (let index = slotIndex - 1; index >= 0; index -= 1) {
        const rolling = span.stepSlots[index].selectedRollingReference
        if (!rolling) continue
        const attempt = store.getAttempt(rolling.attemptId)
        if (!attempt?.result) throw new AnimationRuleError(`The rolling reference attempt ${rolling.attemptId} holds no landed clip.`, 400)
        near = { assetReference: attempt.result.candidate.assetReference, pose: { poseDescription: null, facing: null } }
        break
      }
      if (!near) near = poseContextOf(selectedCandidate(body, span.fromKeyId))
      const far = poseContextOf(selectedCandidate(body, span.toKeyId))
      return {
        compile: {
          tool: 'tween',
          context: {
            rollingReference: near,
            farReference: far,
            movementStep: boundedText(draft.movementStep, 'The movement step'),
            overrides: parseOverrides(draft.overrides),
          },
        },
        references: [
          { role: 'rolling-near', assetReference: near.assetReference, poseDescription: near.pose.poseDescription, facing: near.pose.facing },
          { role: 'fixed-far', assetReference: far.assetReference, poseDescription: far.pose.poseDescription, facing: far.pose.facing },
        ],
      }
    }
    // sequence — the selected key window (§11.2 "sequence attempts capture a
    // selected key window"); the target id is the window's start key.
    if (draft.windowStartKeyId !== targetId) throw new AnimationRuleError('The sequence draft must name the window start key as its target.', 400)
    const windowEndKeyId = uuidField(draft, 'windowEndKeyId')
    if (!Array.isArray(draft.orderedActions) || draft.orderedActions.length > 64 || !draft.orderedActions.every((action) => isNonEmptyString(action) && action.length <= TEXT_LIMIT)) {
      throw new AnimationRuleError('orderedActions must be an array of at most 64 non-empty text beats.', 400)
    }
    const start = poseContextOf(selectedCandidate(body, targetId))
    const end = poseContextOf(selectedCandidate(body, windowEndKeyId))
    return {
      compile: {
        tool: 'sequence',
        context: {
          windowStart: start,
          windowEnd: end,
          orderedActions: draft.orderedActions as string[],
          preservation: boundedText(draft.preservation, 'The preservation text'),
          overrides: parseOverrides(draft.overrides),
        },
      },
      references: [
        { role: 'window-start', assetReference: start.assetReference, poseDescription: start.pose.poseDescription, facing: start.pose.facing },
        { role: 'window-end', assetReference: end.assetReference, poseDescription: end.pose.poseDescription, facing: end.pose.facing },
      ],
    }
  }

  async function submitAttempt(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await readJson(request, 500_000)
    // Submissions serialize behind the boot reconcile sweep — the ready flag.
    await ready()
    const gate = engineAllowed()
    if (!gate.ok) return sendJson(response, 400, { error: gate.error })
    try {
      const documentId = documentIdFrom(body)
      const document = store.getDocument(documentId)
      if (!document) throw new AnimationRuleError(`No animation document with id ${documentId}.`, 404)
      const tool = body.tool
      if (tool !== 'hero' && tool !== 'tween' && tool !== 'sequence') throw new AnimationRuleError(`Unknown animation tool ${String(tool)}.`, 400)
      const targetId = body.targetId
      if (!isNonEmptyString(targetId)) throw new AnimationRuleError('The attempt needs a target id.', 400)
      const idempotencyKey = body.idempotencyKey
      if (!isNonEmptyString(idempotencyKey) || idempotencyKey.length > 400) throw new AnimationRuleError('The submission needs an idempotency key.', 400)
      const draft = recordField(body, 'draft', 'The submission needs a draft object (intent + overrides) — the server compiles and freezes the snapshot.')
      if (draft.tool !== tool) throw new AnimationRuleError(`The draft must be a ${tool} draft (draft.tool must match tool).`, 400)

      const { compile, references } = resolveDraft(document, tool, targetId, draft)
      // The one server-side compile dispatch (rendering.ts) — a compiler
      // refusal is a state refusal, never a structural 500.
      let compiled: ReturnType<AnimationRenderingService['compileCaption']>
      try {
        compiled = service.compileCaption(compile)
      } catch (error) {
        throw new AnimationRuleError(`The draft does not compile: ${error instanceof Error ? error.message : String(error)}`, 400)
      }

      // The SEED (the route's policy): the client's explicit seed on a
      // deliberate re-roll, else one derived from the hash of (inputs + key)
      // — deterministic per request so a lost-response retry reproduces the
      // SAME frozen snapshot, varied per key so two different submissions
      // never silently share a roll.
      const seedless: FrozenAttemptSnapshot = {
        tool,
        targetId,
        references,
        caption: compiled.caption,
        compilerVersion: compiled.compilerVersion,
        settings: { idempotencyKey },
        documentRevision: document.revision,
      }
      if (body.seed !== undefined && !isNonNegativeInt(body.seed)) throw new AnimationRuleError('The seed must be a non-negative integer.', 400)
      const seed = body.seed !== undefined ? body.seed : Number.parseInt(animationInputHash(seedless).slice(0, 8), 16) >>> 0
      const snapshot: FrozenAttemptSnapshot = { ...seedless, settings: { seed } }

      const submitted = await service.submit({ documentId, tool, targetId, snapshot }, idempotencyKey)
      return sendJson(response, 200, submitted)
    } catch (error) {
      if (animationFailure(response, error)) return
      throw error
    }
  }

  // ---- the dispatcher (core.ts's literal-pathname style) --------------------

  return async function handleAnimationApi(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const { pathname } = url

    if (pathname === '/api/lan/animation/bootstrap' && request.method === 'GET') {
      return sendJson(response, 200, {
        schemaVersion: store.schemaVersion,
        compilerVersion: COMPILER_VERSION,
        media: ANIMATION_MEDIA,
        facingTerms: FACING_TERMS,
        defaults: {
          outputWidth: ANIMATION_OPERATING_POINT.width,
          outputHeight: ANIMATION_OPERATING_POINT.height,
          fps: ANIMATION_OPERATING_POINT.fps,
          steps: ANIMATION_OPERATING_POINT.stepsDefault,
          stepsMin: ANIMATION_OPERATING_POINT.stepsMin,
          stepsMax: ANIMATION_OPERATING_POINT.stepsMax,
        },
      })
    }

    if (pathname === '/api/lan/animation/documents' && request.method === 'GET') {
      const project = url.searchParams.get('project') ?? ''
      if (!project || project.length > 400) return sendJson(response, 400, { error: 'A project id is required.' })
      return sendJson(response, 200, { documents: store.listDocuments(project) })
    }

    if (pathname === '/api/lan/animation/documents' && request.method === 'POST') {
      const body = await readJson(request, 100_000)
      try {
        const projectId = typeof body.projectId === 'string' && body.projectId.length <= 400 ? body.projectId : ''
        const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 200) : ''
        const binding = recordField(body, 'binding', 'The document needs a binding (character description, reference asset ids, medium, initial key asset id).') as BindingInput
        const row = store.createDocument({ projectId, name, binding })
        emitDocumentChanged(row.id, row.revision, 'created')
        return sendJson(response, 200, { document: documentView(row) })
      } catch (error) {
        if (animationFailure(response, error)) return
        throw error
      }
    }

    if (pathname === '/api/lan/animation/document' && request.method === 'GET') {
      const id = url.searchParams.get('id') ?? ''
      if (!id || id.length > 400) return sendJson(response, 400, { error: 'A document id is required.' })
      try {
        const document = store.getDocument(id)
        if (!document) return sendJson(response, 404, { error: `No animation document with id ${id}.` })
        return sendJson(response, 200, { document: documentView(document) })
      } catch (error) {
        if (animationFailure(response, error)) return
        throw error
      }
    }

    if (pathname === '/api/lan/animation/binding' && request.method === 'POST') {
      return authoring(response, request, 'binding', (body, expectedRevision) =>
        store.updateBinding(documentIdFrom(body), recordField(body, 'binding', 'The binding needs a character description, reference asset ids, a medium, and an initial key asset id.') as BindingInput, expectedRevision))
    }

    if (pathname === '/api/lan/animation/keys' && request.method === 'POST') {
      const body = await readJson(request, 8_000_000)
      const expectedRevision = expectedRevisionFrom(body)
      const op = body.op
      try {
        const documentId = documentIdFrom(body)
        const keyId = uuidField(body, 'keyId')
        let row: AnimationDocumentRow
        if (op === 'add-candidate') {
          row = store.addKeyCandidate(documentId, keyId, recordField(body, 'candidate', 'The candidate is malformed (id, asset reference, origin, provenance, pose, facing).') as KeyCandidate, expectedRevision)
        } else if (op === 'select') {
          row = store.selectKeyCandidate(documentId, keyId, uuidField(body, 'candidateId'), expectedRevision)
        } else if (op === 'lock' || op === 'unlock') {
          row = store.setKeyLock(documentId, keyId, op === 'lock', expectedRevision)
        } else {
          return sendJson(response, 400, { error: 'The keys route needs op: add-candidate, select, lock, or unlock.' })
        }
        emitDocumentChanged(documentId, row.revision, `keys.${String(op)}`)
        return sendJson(response, 200, { document: documentView(row) })
      } catch (error) {
        if (animationFailure(response, error)) return
        throw error
      }
    }

    if (pathname === '/api/lan/animation/spans' && request.method === 'POST') {
      const body = await readJson(request, 500_000)
      const expectedRevision = expectedRevisionFrom(body)
      const op = body.op
      try {
        const documentId = documentIdFrom(body)
        let row: AnimationDocumentRow
        let spanId: string | undefined
        if (op === 'insert') {
          const before = new Set(store.getDocument(documentId)?.body.spans.map((span) => span.id) ?? [])
          const intent = recordField(body, 'intent', 'A span needs movement and preservation text.')
          row = store.insertSpan(documentId, {
            fromKeyId: typeof body.fromKeyId === 'string' ? body.fromKeyId : '',
            toKeyId: typeof body.toKeyId === 'string' ? body.toKeyId : '',
            intent: intent as { movement: string; preservation: string },
            overrides: isRecord(body.overrides) ? body.overrides as Record<string, never> : undefined,
          }, expectedRevision)
          // The freshly minted span id — the only id in the answer the
          // client did not already know.
          const added = row.body.spans.filter((span) => !before.has(span.id))
          spanId = added[added.length - 1]?.id
        } else if (op === 'update-intent') {
          const targetSpanId = uuidField(body, 'spanId')
          const intent = recordField(body, 'intent', 'A span needs movement and preservation text.')
          row = store.updateSpanIntent(documentId, targetSpanId, intent as { movement: string; preservation: string }, expectedRevision)
        } else if (op === 'remove') {
          row = store.removeSpan(documentId, uuidField(body, 'spanId'), expectedRevision)
        } else {
          return sendJson(response, 400, { error: 'The spans route needs op: insert, update-intent, or remove.' })
        }
        emitDocumentChanged(documentId, row.revision, `spans.${String(op)}`)
        const payload: Record<string, unknown> = { document: documentView(row) }
        if (spanId !== undefined) payload.spanId = spanId
        return sendJson(response, 200, payload)
      } catch (error) {
        if (animationFailure(response, error)) return
        throw error
      }
    }

    if (pathname === '/api/lan/animation/select/key-candidate' && request.method === 'POST') {
      return authoring(response, request, 'select.key-candidate', (body, expectedRevision) =>
        store.selectKeyCandidate(documentIdFrom(body), uuidField(body, 'keyId'), uuidField(body, 'candidateId'), expectedRevision))
    }

    if (pathname === '/api/lan/animation/select/rolling-reference' && request.method === 'POST') {
      return authoring(response, request, 'select.rolling-reference', (body, expectedRevision) => {
        const frameIndex = body.frameIndex
        if (!isNonNegativeInt(frameIndex)) throw new AnimationRuleError('frameIndex must be a non-negative integer.', 400)
        return store.selectRollingReference(documentIdFrom(body), uuidField(body, 'spanId'), uuidField(body, 'attemptId'), frameIndex, expectedRevision)
      })
    }

    if (pathname === '/api/lan/animation/select/clip-contribution' && request.method === 'POST') {
      return authoring(response, request, 'select.clip-contribution', (body, expectedRevision) => {
        const { inFrame, outFrame, holdDuration } = body
        if (!isNonNegativeInt(inFrame) || !isNonNegativeInt(outFrame) || !isNonNegativeInt(holdDuration)) {
          throw new AnimationRuleError('inFrame, outFrame, and holdDuration must be non-negative integers.', 400)
        }
        return store.selectClipContribution(documentIdFrom(body), uuidField(body, 'spanId'), uuidField(body, 'attemptId'), inFrame, outFrame, holdDuration, expectedRevision)
      })
    }

    if (pathname === '/api/lan/animation/attempts' && request.method === 'POST') {
      return submitAttempt(request, response)
    }

    if (pathname === '/api/lan/animation/attempt' && request.method === 'GET') {
      const id = url.searchParams.get('id') ?? ''
      try {
        return sendJson(response, 200, { attempt: service.getState(id) })
      } catch (error) {
        if (animationFailure(response, error)) return
        throw error
      }
    }

    if (pathname === '/api/lan/animation/attempt/cancel' && request.method === 'POST') {
      const body = await readJson(request, 10_000)
      if (!isUuid(body.attemptId)) return sendJson(response, 400, { error: 'An attempt id (UUID) is required.' })
      try {
        await service.cancel(body.attemptId)
        return sendJson(response, 200, { cancelled: true })
      } catch (error) {
        if (animationFailure(response, error)) return
        throw error
      }
    }

    if (pathname === '/api/lan/animation/attempt/extract-frame' && request.method === 'POST') {
      const body = await readJson(request, 10_000)
      if (!isUuid(body.attemptId)) return sendJson(response, 400, { error: 'An attempt id (UUID) is required.' })
      if (!isNonNegativeInt(body.frameIndex)) return sendJson(response, 400, { error: 'frameIndex must be a non-negative integer.' })
      try {
        return sendJson(response, 200, { assetReference: await service.extractFrame(body.attemptId, body.frameIndex) })
      } catch (error) {
        if (animationFailure(response, error)) return
        throw error
      }
    }

    return sendJson(response, 404, { error: 'Unknown animation route.' })
  }
}
