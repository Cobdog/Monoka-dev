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
 *      expectedRevision-gated through the store's transactions), the
 *      extension-chain command route (the same op shape, the extension
 *      lane §4), the THREE selection commands as distinct routes (§7.2.1)
 *      plus the wave-2a rolling-reference annotation route in the same
 *      shape (§6.4) and the extension lane's window-candidate selection,
 *      and the attempt surface (submit / state / cancel / extract-frame /
 *      retry-preparation) delegating to the rendering service, plus the
 *      extension lane's EXTEND submission (lane Task 5, spec §4/§5/§6/§10)
 *      as its own route: the before-dispatch preflights — compatibility
 *      through Task 3's exported seams (requireContinuationArtifact +
 *      compareModelIdentities), anchor collisions, the overlap recipe —
 *      run BEFORE any attempt row exists, then the full §5
 *      ContinuationBinding freezes SERVER-SIDE and dispatches through the
 *      standing submit path. The failure
 *      mapping is the
 *      documents block's:
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
 *      new seed ⇒ a fresh roll. The retry's idempotency check runs BEFORE
 *      the promoted-near extraction (the final review's M6): a lost-response
 *      retry answers { created: false } even while the engine is
 *      unreachable — the row's frozen near reference is the retry's.
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
import { AnimationConflictError, AnimationRuleError, type AnimationAttemptRow, type AnimationDocumentRow, type AnimationStore } from './store'
import { compareModelIdentities, ContinuationIdentityDriftError, ContinuationUnavailableError, type AnimationRenderingService } from './rendering'
import { AnimationModelEvidenceError, AnimationModelResolutionError } from './models'
import type { AnimationExportService } from './export'
import { AnimationExportStaleError } from './export'
import type { CompletionOwner } from './completion-owner'
import type { JobLifecycleEvent } from '../../src/types'
import {
  ANIMATION_MEDIA,
  FACING_TERMS,
  animationInputHash,
  isFacingTerm,
  isMediumString,
  isUuid,
  parseContinuationBinding,
  parseModelContentIdentities,
  type AnimationTool,
  type AssetReference,
  type BindingInput,
  type ExtensionChain,
  type FacingTerm,
  type FrozenAttemptSnapshot,
  type KeyCandidate,
  type MediumString,
  type ModelContentIdentity,
  type WindowSlot,
} from '../../shared/animation/types'
import { ANIMATION_OPERATING_POINT, CONTINUATION_OVERLAP_RECIPE, continuationWindowPlan } from '../../shared/animation/graphs'
import { COMPILER_VERSION } from '../../shared/animation/compiler'
import type { ExtensionContext, HeroContext, SequenceContext, TweenContext } from '../../shared/animation/compiler'

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
        // candidateId is the MINTED DOCUMENT CANDIDATE ID (hero landings —
        // the id the client correlates against the key slot's candidates),
        // never the engine artifact path; null when the tool mints nothing
        // (a tween's landed result correlates by attemptId, which the
        // envelope already carries).
        const candidate = isRecord(payload.candidate) ? payload.candidate : null
        emitAnimation('attempt-ready', {
          documentId: payload.documentId,
          attemptId: payload.attemptId,
          candidateId: candidate && typeof candidate.id === 'string' ? candidate.id : null,
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
  /** The export pipeline (task 14, §11.3) — freezes, gates, assembles, and
   *  answers the review ZIP; wired by core.ts with the document store's
   *  blob resolution and the configured ffmpeg. */
  exporter: AnimationExportService
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
  const { store, service, exporter, emitAnimation, ready, engineAllowed, sendJson, readJson } = deps

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
   *  propagates to the structural 500 (the documents block's contract). `run`
   *  may await before its store write (the rolling-reference selection
   *  resolves its frame first, I11) — the revision gate still fires inside
   *  the store, so a document that moved during the resolution answers the
   *  ordinary 409 rebase surface. */
  async function authoring(response: ServerResponse, request: IncomingMessage, reason: string, run: (body: Record<string, unknown>, expectedRevision: number) => AnimationDocumentRow | Promise<AnimationDocumentRow>): Promise<void> {
    const body = await readJson(request, 2_000_000)
    // A non-integer expectedRevision reaches the store's own 400 (the gate is
    // one rule, stated once) — NaN fails its Number.isInteger check.
    const expectedRevision = typeof body.expectedRevision === 'number' && Number.isInteger(body.expectedRevision) && body.expectedRevision >= 0
      ? body.expectedRevision
      : Number.NaN
    try {
      const row = await run(body, expectedRevision)
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
    /** HERO only (§5.2, task 11 — the F5 contract-review fix): the frozen
     *  authoring draft, stamped into the snapshot so the re-roll and the
     *  span-into-the-accepted-key action read durable truth. */
    hero?: FrozenAttemptSnapshot['hero']
    /** SEQUENCE only (§5.2/§8.1, task 12): the frozen authoring window —
     *  endpoint keys, ordered beats, preservation, overrides — the re-roll's
     *  durable input (a sequence draft owns no span). */
    sequence?: FrozenAttemptSnapshot['sequence']
    /** TWEEN only: the promoted-frame near reference when the chain's
     *  rolling reference is a frame of a landed step's clip (not the span's
     *  start key) — the submission resolves it to the EXTRACTED frame image
     *  (§7.2.2) before freezing, so the reference the tween adapters consume
     *  is an image asset on every engine shape. */
    promotedNear?: { attemptId: string; frameIndex: number }
  } {
    const body = document.body
    if (tool === 'hero') {
      // §5.2's hero contract: ONE reference — the CURRENT key the movement
      // arc describes FROM — and the attempt targets the PROPOSED slot the
      // clip lands into. Hero generates the NEXT key, never a re-roll of the
      // current one: the target must be a UUID distinct from the source
      // (re-rolls RETARGET the same proposed slot with a new idempotency
      // key, appending alternatives §5.3).
      const sourceKeyId = uuidField(draft, 'sourceKeyId')
      if (!isUuid(targetId)) throw new AnimationRuleError('The hero attempt needs a UUID target key slot — the proposed slot the clip lands into.', 400)
      if (targetId === sourceKeyId) {
        throw new AnimationRuleError('A hero attempt generates the NEXT key — its target (the proposed slot) must differ from the source key (§5.2).', 400)
      }
      const candidate = selectedCandidate(body, sourceKeyId)
      const movementArc = boundedText(draft.movementArc, 'The movement arc')
      const overrides = parseOverrides(draft.overrides)
      return {
        compile: {
          tool: 'hero',
          context: {
            currentKey: poseContextOf(candidate),
            movementArc,
            overrides,
          },
        },
        references: [{ role: 'current-key', assetReference: candidate.assetReference, poseDescription: candidate.poseDescription, facing: candidate.facing }],
        hero: { sourceKeyId, movementArc, overrides },
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
      // pose belongs to the frame, not the document: wave 2a binds it to the
      // selection pointer as the authorable ANNOTATION (§6.4's
      // inspectable-and-correctable ruling), and this resolution reads it —
      // so a reviewed frame's authored pose/facing reach every later step's
      // caption. An UNANNOTATED pointer still carries nulls, and the
      // compiler flags that honestly as a hint. The promoted frame rides
      // as the marker (promotedNear) — the submission resolves it to the
      // EXTRACTED frame image before freezing (the task-15 flip: the frozen
      // reference is an image asset whether the engine lists decoded frames
      // or only the clip). A chain's FIRST step is unaffected: its near
      // reference is the start key's image.
      let near: PoseContext | null = null
      let promotedNear: { attemptId: string; frameIndex: number } | undefined
      for (let index = slotIndex - 1; index >= 0; index -= 1) {
        const rolling = span.stepSlots[index].selectedRollingReference
        if (!rolling) continue
        const attempt = store.getAttempt(rolling.attemptId)
        if (!attempt?.result) throw new AnimationRuleError(`The rolling reference attempt ${rolling.attemptId} holds no landed clip.`, 400)
        near = { assetReference: attempt.result.candidate.assetReference, pose: { poseDescription: rolling.poseDescription, facing: rolling.facing } }
        promotedNear = rolling
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
            // The span's authored preservation (the "What stays fixed" field)
            // is the durable home the v2 compiler reads — the draft carries
            // the movement only, so there is exactly one source of the hold
            // text (the flush before submit keeps preview and server
            // byte-identical).
            preservation: span.intent.preservation,
            overrides: parseOverrides(draft.overrides),
          },
        },
        references: [
          { role: 'rolling-near', assetReference: near.assetReference, poseDescription: near.pose.poseDescription, facing: near.pose.facing },
          { role: 'fixed-far', assetReference: far.assetReference, poseDescription: far.pose.poseDescription, facing: far.pose.facing },
        ],
        ...(promotedNear !== undefined ? { promotedNear } : {}),
      }
    }
    // sequence — the selected key window (§11.2 "sequence attempts capture a
    // selected key window"); the target id is the window's start key.
    if (draft.windowStartKeyId !== targetId) throw new AnimationRuleError('The sequence draft must name the window start key as its target.', 400)
    const windowEndKeyId = uuidField(draft, 'windowEndKeyId')
    // A window spans TWO drawings — its first and its own natural end (§5.2).
    // The same key twice is the degenerate window this contract refuses, the
    // hero arm's target≠source rule in the sequence lane's own words.
    if (windowEndKeyId === targetId) {
      throw new AnimationRuleError('A sequence window spans two distinct keys — its first drawing and its own natural end (§5.2); the window end must differ from the start.', 400)
    }
    if (!Array.isArray(draft.orderedActions) || draft.orderedActions.length < 1 || draft.orderedActions.length > 64 || !draft.orderedActions.every((action) => isNonEmptyString(action) && action.length <= TEXT_LIMIT)) {
      throw new AnimationRuleError('orderedActions must be an array of 1 to 64 non-empty text beats.', 400)
    }
    const start = poseContextOf(selectedCandidate(body, targetId))
    const end = poseContextOf(selectedCandidate(body, windowEndKeyId))
    const overrides = parseOverrides(draft.overrides)
    const preservation = boundedText(draft.preservation, 'The preservation text')
    return {
      compile: {
        tool: 'sequence',
        context: {
          windowStart: start,
          windowEnd: end,
          orderedActions: draft.orderedActions as string[],
          preservation,
          overrides,
        },
      },
      references: [
        { role: 'window-start', assetReference: start.assetReference, poseDescription: start.pose.poseDescription, facing: start.pose.facing },
        { role: 'window-end', assetReference: end.assetReference, poseDescription: end.pose.poseDescription, facing: end.pose.facing },
      ],
      // The frozen authoring window (§8.1) — a sequence draft owns no span,
      // so the snapshot is its only durable home (the re-roll's input).
      sequence: { windowStartKeyId: targetId, windowEndKeyId, orderedActions: draft.orderedActions as string[], preservation, overrides },
    }
  }

  /** Canonical JSON for the peek's draft-block comparison (the shared
   *  module's canonicalJson shape, local here): objects with recursively
   *  sorted keys, arrays in order — so key order can never decide identity. */
  function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
    if (isRecord(value)) {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
    }
    return JSON.stringify(value) ?? 'null'
  }

  /** §7.2.2's peek, the COMPILER-INDEPENDENT half (Codex I7): what the user
   *  actually sent, compared against the row's durably frozen DRAFT — never
   *  what the CURRENT compiler would produce. The full-input-hash peek above
   *  answers same-compiler retries; a retry of a submission an OLDER
   *  compiler froze (the response was lost, the build moved to a new
   *  compilerVersion) can never hash-match a recompiled snapshot even when
   *  the client resends the byte-identical body, so the identity comparison
   *  carries §7.2.2's letter across a compiler bump: the draft block, the
   *  RESOLVED references (role → assetId), the document revision, and the
   *  explicit seed when the request carries one. The derived seed is never
   *  re-derived — identities compare, and the row's frozen seed stands.
   *
   *  The TWEEN narrowing, deliberate: a tween draft's movement text has no
   *  durable compiler-independent home in the frozen snapshot (it lives
   *  only inside the compiled caption), so a cross-version same-key TWEEN
   *  retry cannot be proven identical and falls through to the full-hash
   *  comparison's honest 409 — never a false idempotent return for an
   *  operation this build cannot verify. Hero and sequence freeze their
   *  draft blocks (§8.1) and verify in full. */
  function sameSubmissionIdentity(
    row: AnimationAttemptRow,
    parts: {
      tool: AnimationTool
      targetId: string
      document: AnimationDocumentRow
      references: FrozenAttemptSnapshot['references']
      hero?: FrozenAttemptSnapshot['hero']
      sequence?: FrozenAttemptSnapshot['sequence']
      seed: unknown
    },
  ): boolean {
    if (row.documentId !== parts.document.id) return false
    if (row.tool !== parts.tool || row.targetId !== parts.targetId) return false
    if (row.snapshot.documentRevision !== parts.document.revision) return false
    // The resolved references must BE the row's frozen ones, role → assetId
    // (a promoted near rides the ROW's extracted asset — content addressing
    // makes that pointer's extraction deterministic, and the identity above
    // already pinned the document to the row's revision).
    const frozenByRole = new Map(row.snapshot.references.map((entry) => [entry.role, entry.assetReference.assetId]))
    if (frozenByRole.size !== parts.references.length) return false
    for (const reference of parts.references) {
      if (frozenByRole.get(reference.role) !== reference.assetReference.assetId) return false
    }
    // The explicit seed when the request carries one; a derived seed is the
    // identity's own function (same key + same inputs ⇒ same derivation).
    if (parts.seed !== undefined) {
      const frozenSeed = isRecord(row.snapshot.settings) ? row.snapshot.settings.seed : undefined
      if (typeof frozenSeed !== 'number' || frozenSeed !== parts.seed) return false
    }
    // The draft block, per tool — the authored inputs, compiler-independently.
    if (parts.tool === 'hero') {
      return stableJson(row.snapshot.hero) === stableJson(parts.hero)
    }
    if (parts.tool === 'sequence') {
      return stableJson(row.snapshot.sequence) === stableJson(parts.sequence)
    }
    return false // tween — the narrowing above
  }

  async function submitAttempt(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await readJson(request, 500_000)
    // Submissions serialize behind the boot reconcile sweep — the ready flag.
    await ready()
    const gate = engineAllowed()
    if (!gate.ok) return sendJson(response, 400, { error: gate.error })
    try {
      const documentId = documentIdFrom(body)
      // FREEZE-BEFORE-SUBMISSION (Codex I5 — the export module's doctrine,
      // applied to this boundary): the document is read ONCE, here,
      // synchronously after the body parse and before any engine-dependent
      // await. This single row feeds EVERYTHING the submission freezes — the
      // reference resolution, the caption context, the documentRevision, and
      // (passed into the service) the bindingVersion/settings stamps. The
      // service re-reading the live store behind the model-enumeration or
      // promoted-frame-extraction awaits is what spliced a moved document's
      // stamps onto the entry revision's references; it now consumes the row
      // handed to it and never re-reads on the freeze path.
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
      // The carry build flag (extension lane §7, "the source render carries; a
      // a plain render doesn't"): an execution-relevant intent, so it enters
      // through the ROUTE's freeze() settings merge below — never a client
      // settings passthrough — and only the tween lane may carry it (§3's
      // adapter scope: hero/sequence need adapter-specific probes first).
      if (draft.carry !== undefined && typeof draft.carry !== 'boolean') {
        throw new AnimationRuleError('The draft\'s carry flag must be a boolean — set it true to persist this render\'s tail as a continuation artifact (a plain render carries nothing).', 400)
      }
      if (draft.carry === true && tool !== 'tween') {
        throw new AnimationRuleError('Only the tween lane may carry its tail (spec §3\'s adapter scope) — hero and sequence renders need adapter-specific probes before they can condition a continuation.', 400)
      }

      const resolved = resolveDraft(document, tool, targetId, draft)
      const { hero, sequence, promotedNear } = resolved
      // The one server-side compile dispatch (rendering.ts) — a compiler
      // refusal is a state refusal, never a structural 500. The compiled
      // caption carries pose/context TEXT only (assets never ride the
      // caption), so the promoted-near swap below changes the frozen
      // REFERENCE, never the caption — compiled once, swapped per freeze.
      let compiled: ReturnType<AnimationRenderingService['compileCaption']>
      try {
        compiled = service.compileCaption(resolved.compile)
      } catch (error) {
        throw new AnimationRuleError(`The draft does not compile: ${error instanceof Error ? error.message : String(error)}`, 400)
      }
      if (body.seed !== undefined && !isNonNegativeInt(body.seed)) throw new AnimationRuleError('The seed must be a non-negative integer.', 400)

      /** The frozen snapshot for one near-reference asset: the SEED (the
       *  route's policy — the client's explicit seed on a deliberate re-roll,
       *  else one derived from the hash of (inputs + key), deterministic per
       *  request so a lost-response retry reproduces the SAME frozen
       *  snapshot, varied per key so two different submissions never silently
       *  share a roll) derived over the swapped references, nothing
       *  persisted. The carry flag (Task 1's load-bearing note) merges HERE —
       *  the route's own settings merge is the one door it enters through. */
      const freeze = (nearAsset?: AssetReference): FrozenAttemptSnapshot => {
        const references = promotedNear !== undefined && nearAsset !== undefined
          ? resolved.references.map((entry) => (entry.role === 'rolling-near' ? { ...entry, assetReference: nearAsset } : entry))
          : resolved.references
        const seedless: FrozenAttemptSnapshot = {
          tool,
          targetId,
          references,
          caption: compiled.caption,
          compilerVersion: compiled.compilerVersion,
          settings: { idempotencyKey, ...(draft.carry === true ? { carry: true } : {}) },
          documentRevision: document.revision,
          // HERO rows freeze the authored draft (§8.1/§5.2) — the re-roll and
          // the span-into-the-accepted-key action read it. SEQUENCE rows
          // freeze the authored window the same way (§8.1 — the re-roll's
          // input).
          ...(hero ? { hero } : {}),
          ...(sequence ? { sequence } : {}),
        }
        const seed = body.seed !== undefined ? body.seed : Number.parseInt(animationInputHash(seedless).slice(0, 8), 16) >>> 0
        return { ...seedless, settings: { seed, ...(draft.carry === true ? { carry: true } : {}) } }
      }

      // §11.4 idempotency BEFORE the engine-dependent near resolution (the
      // final review's M6): a same-key retry of a promoted-near submit must
      // answer { created: false } even while the engine is unreachable. The
      // row's frozen near reference IS the retry's near reference — the same
      // draft against the same document revision resolves the same promoted
      // frame, and its extraction is content-addressed — so the input-hash
      // comparison runs with the ROW's asset in the near slot and no
      // extraction (no engine call) fires. A mismatch falls through to the
      // full path, whose own hash check answers the 409.
      const existing = store.attemptByIdempotencyKey(idempotencyKey)
      if (existing) {
        const rowNear = promotedNear !== undefined
          ? existing.snapshot.references.find((entry) => entry.role === 'rolling-near')?.assetReference
          : undefined
        if (promotedNear === undefined || rowNear !== undefined) {
          if (animationInputHash(freeze(rowNear)) === existing.inputHash) {
            return sendJson(response, 200, { attemptId: existing.id, created: false })
          }
          // The compiler-independent identity (Codex I7): the row above
          // hash-missed, but a row an OLDER compiler froze can never
          // hash-match a recompiled snapshot — the byte-identical retry of a
          // cross-compiler submission answers through IDENTITY instead, and
          // only a genuinely different draft falls through to the 409.
          const identityReferences = promotedNear !== undefined && rowNear !== undefined
            ? resolved.references.map((entry) => (entry.role === 'rolling-near' ? { ...entry, assetReference: rowNear } : entry))
            : resolved.references
          if (sameSubmissionIdentity(existing, { tool, targetId, document, references: identityReferences, hero, sequence, seed: body.seed })) {
            return sendJson(response, 200, { attemptId: existing.id, created: false })
          }
        }
      }

      // The promoted-frame near reference (the task-15 flip): the chain's
      // rolling reference is a FRAME of the previous step's clip, not the
      // clip — resolve it through the service's frame extraction (§7.2.2)
      // so the frozen reference is the IMAGE the tween adapters consume. An
      // unresolvable frame is a named state refusal here, never a
      // video-asset rejection inside the submit.
      const nearAsset = promotedNear !== undefined
        ? await service.extractFrame(promotedNear.attemptId, promotedNear.frameIndex)
        : undefined
      // The frozen entry document rides the input (I5): the service stamps
      // the bindingVersion/settings from THIS row, never a later re-read.
      const submitted = await service.submit({ documentId, tool, targetId, snapshot: freeze(nearAsset), document }, idempotencyKey)
      return sendJson(response, 200, submitted)
    } catch (error) {
      if (animationFailure(response, error)) return
      throw error
    }
  }

  // ---- the Extend submission (extension lane Task 5, spec §4/§5/§6/§9/§10) ---

  /** The chain + window slot a window id names — the requireWindowSlot
   *  refusal class (404, never a silent no-op). */
  function requireWindowSlot(body: AnimationDocumentRow['body'], windowSlotId: string): { chain: ExtensionChain; slot: WindowSlot } {
    for (const chain of body.chains) {
      const slot = chain.windows.find((window) => window.id === windowSlotId)
      if (slot) return { chain, slot }
    }
    throw new AnimationRuleError(`No extension window slot with id ${windowSlotId} in this document.`, 404)
  }

  /** The binding source a frozen snapshot names — the route's narrow read
   *  (the same shape the shared builder and the store's ancestry walk read;
   *  a present-but-malformed block refuses LOUDLY, never a silent null). */
  function bindingSourceOfRow(row: AnimationAttemptRow): string | null {
    const binding: unknown = row.snapshot.continuationBinding
    if (binding === undefined) return null
    if (!isRecord(binding) || !isUuid(binding.sourceAttemptId)) {
      throw new AnimationRuleError(`Attempt ${row.id} carries a malformed continuation binding — the extend route refuses to walk corrupt ancestry.`, 400)
    }
    return binding.sourceAttemptId
  }

  /** The PLAIN tween take a continuation chain roots on — the ancestry walk
   *  from any window's recorded source back through binding sources to the
   *  take with no binding of its own. The identity references (§5: "the
   *  image references in force, unchanged §2 contracts") resolve from THAT
   *  take's span — the chain's identity anchor, exactly the shape Set L
   *  measured (fixed start/end keys across every window of a chain; the
   *  tail supplies the motion, the keys the identity). */
  function rootTakeOf(sourceAttemptId: string, documentId: string): AnimationAttemptRow {
    const visited = new Set<string>()
    let current = sourceAttemptId
    for (;;) {
      if (visited.has(current)) {
        throw new AnimationRuleError(`The continuation ancestry of attempt ${sourceAttemptId} is cyclic — the identity references cannot be resolved from corrupt truth.`, 400)
      }
      visited.add(current)
      const row = store.getAttempt(current)
      if (!row || row.documentId !== documentId) {
        throw new AnimationRuleError(`The continuation ancestry names attempt ${current}, which is not an attempt of this document — the identity references cannot be resolved.`, 400)
      }
      const source = bindingSourceOfRow(row)
      if (source === null) return row
      current = source
    }
  }

  async function extendAttempt(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await readJson(request, 500_000)
    // Submissions serialize behind the boot reconcile sweep and the engine
    // policy gate, exactly like any attempt submission.
    await ready()
    const gate = engineAllowed()
    if (!gate.ok) return sendJson(response, 400, { error: gate.error })
    try {
      const documentId = documentIdFrom(body)
      // FREEZE-BEFORE-SUBMISSION (the I5 doctrine, the submit route's own):
      // ONE synchronous document read feeding everything this route freezes.
      const document = store.getDocument(documentId)
      if (!document) throw new AnimationRuleError(`No animation document with id ${documentId}.`, 404)
      const windowSlotId = uuidField(body, 'windowSlotId')
      const bodySource = uuidField(body, 'sourceAttemptId')
      const idempotencyKey = body.idempotencyKey
      if (!isNonEmptyString(idempotencyKey) || idempotencyKey.length > 400) throw new AnimationRuleError('The submission needs an idempotency key.', 400)
      if (body.continuationBinding !== undefined) {
        throw new AnimationRuleError('The extend route builds the continuation binding server-side from the source attempt\'s frozen truth — do not send one (spec §5).', 400)
      }
      if (body.seed !== undefined && !isNonNegativeInt(body.seed)) throw new AnimationRuleError('The seed must be a non-negative integer.', 400)
      const targetLength = body.targetLength
      if (typeof targetLength !== 'number' || !Number.isInteger(targetLength) || targetLength <= 0) {
        throw new AnimationRuleError('targetLength must be a positive integer — the target window\'s full generated length on the 17k+5 grid.', 400)
      }
      const draft = recordField(body, 'draft', 'The extension needs a draft object (the window\'s own movement + preservation + overrides) — the server compiles and freezes the caption.')

      // ---- the window slot, its recorded source, and the ORDER guard -------
      // The slot's RECORDED source is the binding truth (rebindContinuation
      // re-points it; the next submission into the slot freezes it — Task 4's
      // ruling): the body's sourceAttemptId must AGREE with it, never drive it.
      const { chain, slot } = requireWindowSlot(document.body, windowSlotId)
      if (slot.sourceAttemptId !== bodySource) {
        throw new AnimationRuleError(`The window slot's recorded source is attempt ${slot.sourceAttemptId}, not ${bodySource} — reload the document (a rebind moved this window's source) and extend again.`, 400)
      }
      const sourceAttemptId = slot.sourceAttemptId
      // Task 4's M-4 ruling: the mismatch derivation is selection-coherent
      // but not order-aware, so the FREEZE discipline keeps the frozen
      // record's coordinates honest — a source at or after the window it
      // conditions is an inverted edge (only a corrupt or hand-edited body
      // reaches here; the store's own commands keep sources strictly
      // earlier), and it refuses by name here.
      if (chain.rootAttemptId !== sourceAttemptId) {
        const sourceSlot = chain.windows.find((window) => window.attempts.includes(sourceAttemptId))
        if (!sourceSlot) {
          throw new AnimationRuleError(`Attempt ${sourceAttemptId} is neither the root of, nor an alternative in, this window's chain — the extend route cannot freeze an out-of-chain binding source.`, 400)
        }
        if (sourceSlot.order >= slot.order) {
          throw new AnimationRuleError(`A window's binding source must precede it in the chain — attempt ${sourceAttemptId} lives in window order ${sourceSlot.order}, at or after this window (order ${slot.order}); the frozen coordinates would encode an inverted edge.`, 400)
        }
      }

      // ---- the source attempt: the Extend-source contract + the frozen geometry
      const source = store.getAttempt(sourceAttemptId)
      if (!source || source.documentId !== documentId) throw new AnimationRuleError(`Attempt ${sourceAttemptId} is not an attempt of this document.`, 404)
      if (source.tool !== 'tween') {
        throw new AnimationRuleError(`The extension lane conditions on tween-lane takes (§3's adapter scope) — attempt ${sourceAttemptId} is a ${source.tool} render.`, 400)
      }
      if (!source.result) {
        throw new AnimationRuleError(`Attempt ${sourceAttemptId} has not landed — the Extend action lives on a landed take.`, 400)
      }
      const sourceSettings = isRecord(source.snapshot.settings) ? source.snapshot.settings : {}
      const sourceLength = sourceSettings.length
      if (typeof sourceLength !== 'number' || !Number.isInteger(sourceLength) || sourceLength <= 0) {
        throw new AnimationRuleError(`Attempt ${sourceAttemptId}'s frozen window carries no readable length — the pinned tail's coordinates cannot be computed from its record.`, 400)
      }

      // ---- §6: the target length against the OVERLAP RECIPE, never the source's length
      const recipe = CONTINUATION_OVERLAP_RECIPE
      let plan: ReturnType<typeof continuationWindowPlan>
      try {
        plan = continuationWindowPlan({ sourceLength, targetLength, contextLength: recipe.contextLength })
      } catch (failure) {
        throw new AnimationRuleError(failure instanceof Error ? failure.message : String(failure), 400)
      }

      // ---- §5: the stamp-less source refuses named (Task 3's carried condition)
      const sourceIdentities = parseModelContentIdentities(source.snapshot.modelIdentities)
      if (sourceIdentities === null) {
        throw new AnimationRuleError(`Attempt ${sourceAttemptId}'s frozen record carries no resolved model content identities (identity evidence missing) — a source rendered without digest evidence can never seed a continuation binding, never a name-only pass (spec §5). Re-land the source on the current weights and extend that take.`, 400)
      }

      // ---- the registered artifact: the binding's opaque handle (§5/§7)
      const artifact = source.continuation.artifact
      if (artifact === undefined) {
        throw new AnimationRuleError(`Attempt ${sourceAttemptId} has no registered continuation artifact (its continuation state is "${source.continuation.state}") — only a registered carry can be extended${source.continuation.state === 'registering' ? '; retry once registration completes' : ''}.`, 400)
      }

      // ---- §5's conditioning inputs: the references in force, from the ROOT SPAN
      const rootTake = rootTakeOf(sourceAttemptId, documentId)
      const rootSpan = document.body.spans.find((span) => span.stepSlots.some((step) => step.id === rootTake.targetId))
      if (!rootSpan) {
        throw new AnimationRuleError(`The chain's root take targets step slot ${rootTake.targetId}, which no longer exists in the document — the window's identity references cannot be resolved from the span.`, 400)
      }
      const near = selectedCandidate(document.body, rootSpan.fromKeyId)
      const far = selectedCandidate(document.body, rootSpan.toKeyId)
      const references: FrozenAttemptSnapshot['references'] = [
        { role: 'rolling-near', assetReference: near.assetReference, poseDescription: near.poseDescription, facing: near.facing },
        { role: 'fixed-far', assetReference: far.assetReference, poseDescription: far.poseDescription, facing: far.facing },
      ]

      // ---- §10: the collision preflight — anchors inside the pinned head refuse NAMING the anchor
      const anchors: Array<{ reference: 'rolling-near' | 'fixed-far'; frame: number }> = []
      if (draft.anchors !== undefined) {
        if (!Array.isArray(draft.anchors) || draft.anchors.length > 8 || draft.anchors.length < 1) {
          throw new AnimationRuleError('The draft\'s anchors must be a non-empty array of at most 8 entries ({ reference: "rolling-near" | "fixed-far", frame }).', 400)
        }
        for (const entry of draft.anchors) {
          if (!isRecord(entry) || (entry.reference !== 'rolling-near' && entry.reference !== 'fixed-far') || typeof entry.frame !== 'number' || !Number.isInteger(entry.frame) || entry.frame < 0) {
            throw new AnimationRuleError('Each anchor needs a reference role ("rolling-near" or "fixed-far" — one of the in-force references) and a non-negative integer frame in the SAMPLED window.', 400)
          }
          if (entry.frame < plan.headTrim) {
            throw new AnimationRuleError(`The ${entry.reference} anchor at sampled frame ${entry.frame} falls inside the pinned head (frames 0-${plan.headTrim - 1}) — the conditioning node would silently drop it there; the lane refuses instead, naming the anchor (spec §10). Move it past the pinned head or drop it.`, 400)
          }
          if (entry.frame >= targetLength) {
            throw new AnimationRuleError(`The ${entry.reference} anchor at frame ${entry.frame} is outside the sampled window (0-${targetLength - 1}).`, 400)
          }
          anchors.push({ reference: entry.reference, frame: entry.frame })
        }
      }

      // ---- §4/§9: the time-shifted caption (the sampled window's time base)
      const overrides = parseOverrides(draft.overrides)
      let compiled: ReturnType<AnimationRenderingService['compileCaption']>
      try {
        const context: ExtensionContext = {
          rollingReference: { assetReference: near.assetReference, pose: { poseDescription: near.poseDescription, facing: near.facing } },
          farReference: { assetReference: far.assetReference, pose: { poseDescription: far.poseDescription, facing: far.facing } },
          movementStep: boundedText(draft.movement, 'The movement text'),
          preservation: boundedText(draft.preservation, 'The preservation text'),
          overrides,
          window: { sampledLength: targetLength, pinnedLength: plan.headTrim, fps: document.body.settings.fps },
        }
        compiled = service.compileCaption({ tool: 'extension', context })
      } catch (error) {
        throw new AnimationRuleError(`The extension draft does not compile: ${error instanceof Error ? error.message : String(error)}`, 400)
      }

      // ---- §5: the frozen record, whole and server-built
      // The binding's modelIdentities are the SOURCE ROW's stamp, copied
      // verbatim (Task 3's ruling 4: server-side seeding; a client block is
      // never echoed — refused outright above). The recipe's steps resolve
      // from the ENTRY document row exactly as stampedSnapshot will inside
      // the service, so the frozen record and the frozen graph agree.
      const steps = typeof document.body.settings.steps === 'number' && Number.isInteger(document.body.settings.steps) && document.body.settings.steps > 0
        ? document.body.settings.steps
        : ANIMATION_OPERATING_POINT.stepsDefault
      const buildBinding = (seed: number) => ({
        sourceAttemptId,
        modelIdentities: sourceIdentities,
        windowCoordinates: plan.windowCoordinates,
        headTrim: plan.headTrim,
        deliveredRange: plan.deliveredRange,
        artifact: { artifactId: artifact.artifactId, digest: artifact.digest },
        recipe: {
          mode: 'motion-context-tail',
          contextLength: recipe.contextLength,
          schedule: {
            sampler: ANIMATION_OPERATING_POINT.sampler,
            scheduler: ANIMATION_OPERATING_POINT.scheduler,
            shiftVideo: ANIMATION_OPERATING_POINT.shiftVideo,
            shiftAudio: ANIMATION_OPERATING_POINT.shiftAudio,
            denoise: ANIMATION_OPERATING_POINT.denoise,
            fps: document.body.settings.fps,
            audioContextLength: recipe.audioContextLength,
          },
          steps,
          seed,
          recipeVersion: recipe.recipeVersion,
        },
        conditioning: {
          caption: compiled.caption,
          compilerVersion: compiled.compilerVersion,
          referenceAssetIds: references.map((entry) => entry.assetReference.assetId),
        },
      })
      // The seed policy is the submit route's own: the client's explicit seed
      // on a deliberate re-roll, else one derived from the seedless freeze —
      // derived over the record with recipe.seed at 0 (the derivation input
      // is the request's own content; the placeholder never persists).
      const seedless: FrozenAttemptSnapshot = {
        tool: 'tween',
        targetId: windowSlotId,
        references,
        caption: compiled.caption,
        compilerVersion: compiled.compilerVersion,
        settings: {
          idempotencyKey,
          carry: true,
          length: targetLength,
          contextLength: recipe.contextLength,
          audioContextLength: recipe.audioContextLength,
          ...(anchors.length > 0 ? { anchors } : {}),
        },
        documentRevision: document.revision,
        continuationBinding: buildBinding(0),
      }
      const seed = body.seed !== undefined ? body.seed : Number.parseInt(animationInputHash(seedless).slice(0, 8), 16) >>> 0
      const binding = buildBinding(seed)
      if (parseContinuationBinding(binding) === null) {
        throw new Error('The extend route produced a continuation binding that fails its own parser — an internal shape bug; nothing was persisted.')
      }
      const snapshot: FrozenAttemptSnapshot = { ...seedless, settings: { ...seedless.settings, seed }, continuationBinding: binding }

      // ---- §11.4 idempotency BEFORE the engine-dependent preflight (M6's
      // discipline): a same-key retry answers from the row its dispatch
      // already gated, even while the engine is unreachable.
      const existing = store.attemptByIdempotencyKey(idempotencyKey)
      if (existing && existing.inputHash === animationInputHash(snapshot)) {
        return sendJson(response, 200, { attemptId: existing.id, created: false })
      }

      // ---- §10: the BEFORE-DISPATCH refusals (Task 3's load-bearing wiring)
      // AVAILABILITY — the registered artifact must resolve by digest NOW,
      // through the one seam (never a second resolver): the user learns the
      // eviction BEFORE the attempt row exists, the clip staying playable.
      try {
        service.requireContinuationArtifact(sourceAttemptId)
      } catch (failure) {
        if (failure instanceof AnimationRuleError) throw failure
        throw new AnimationRuleError(failure instanceof Error ? failure.message : String(failure), 400)
      }
      // COMPATIBILITY — §6's target-execution comparison: the target's
      // freshly resolved identities against the binding's frozen set. Drift
      // (the aliased-weights case) and missing evidence refuse by name here,
      // before anything is spent.
      let fresh: ModelContentIdentity[]
      try {
        fresh = await service.freshModelIdentities({ tool: 'tween', settings: snapshot.settings })
        compareModelIdentities(sourceIdentities, fresh)
      } catch (failure) {
        if (failure instanceof AnimationRuleError) throw failure
        if (failure instanceof AnimationModelResolutionError || failure instanceof AnimationModelEvidenceError || failure instanceof ContinuationIdentityDriftError) {
          throw new AnimationRuleError(failure.message, 400)
        }
        throw failure
      }

      // ---- the dispatch: exactly the standing submission path (the service's
      // own continuation gate re-runs availability + compatibility at
      // dispatch — the preflight above only moves the refusals earlier).
      const submitted = await service.submit({ documentId, tool: 'tween', targetId: windowSlotId, snapshot, document }, idempotencyKey)
      return sendJson(response, 200, submitted)
    } catch (error) {
      if (error instanceof ContinuationUnavailableError) {
        return sendJson(response, 400, { error: error.message })
      }
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
        // binding OPTIONAL (task 7, §4.1's empty session): absent creates the
        // pre-binding document; present-but-malformed still refuses 400.
        const binding = body.binding === undefined
          ? undefined
          : recordField(body, 'binding', 'The document needs a binding (character description, reference asset ids, medium, initial key asset id).') as BindingInput
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
        let stepSlotId: string | undefined
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
        } else if (op === 'append-step-slot') {
          // The tween chain's advancement (contract review F1): the diff
          // answers the minted slot id the same way insert answers the span
          // id — the only new fact in the response.
          const targetSpanId = uuidField(body, 'spanId')
          const before = new Set(store.getDocument(documentId)?.body.spans.find((span) => span.id === targetSpanId)?.stepSlots.map((slot) => slot.id) ?? [])
          row = store.appendStepSlot(documentId, targetSpanId, expectedRevision)
          const grown = row.body.spans.find((span) => span.id === targetSpanId)
          const added = grown?.stepSlots.filter((slot) => !before.has(slot.id)) ?? []
          stepSlotId = added[added.length - 1]?.id
        } else if (op === 'update-intent') {
          const targetSpanId = uuidField(body, 'spanId')
          const intent = recordField(body, 'intent', 'A span needs movement and preservation text.')
          row = store.updateSpanIntent(documentId, targetSpanId, intent as { movement: string; preservation: string }, expectedRevision)
        } else if (op === 'remove') {
          row = store.removeSpan(documentId, uuidField(body, 'spanId'), expectedRevision)
        } else {
          return sendJson(response, 400, { error: 'The spans route needs op: insert, append-step-slot, update-intent, or remove.' })
        }
        emitDocumentChanged(documentId, row.revision, `spans.${String(op)}`)
        const payload: Record<string, unknown> = { document: documentView(row) }
        if (spanId !== undefined) payload.spanId = spanId
        if (stepSlotId !== undefined) payload.stepSlotId = stepSlotId
        return sendJson(response, 200, payload)
      } catch (error) {
        if (animationFailure(response, error)) return
        throw error
      }
    }

    if (pathname === '/api/lan/animation/chains' && request.method === 'POST') {
      // The extension-chain command family (§4, lane Task 4): the window
      // slot's lifecycle + the explicit rebind, op-dispatched like the keys
      // and spans routes. create-window answers the MINTED window id and
      // its chain root — the only facts the client did not already know
      // (the spans route's diff idiom).
      const body = await readJson(request, 100_000)
      const expectedRevision = expectedRevisionFrom(body)
      const op = body.op
      try {
        const documentId = documentIdFrom(body)
        let row: AnimationDocumentRow
        let windowSlotId: string | undefined
        let chainRoot: string | undefined
        if (op === 'create-window') {
          const before = new Set((store.getDocument(documentId)?.body.chains ?? []).flatMap((chain) => chain.windows.map((window) => window.id)))
          row = store.createWindowSlot(documentId, uuidField(body, 'sourceAttemptId'), expectedRevision)
          const holding = row.body.chains.find((chain) => chain.windows.some((window) => !before.has(window.id)))
          if (holding) {
            windowSlotId = holding.windows.find((window) => !before.has(window.id))?.id
            chainRoot = holding.rootAttemptId
          }
        } else if (op === 'rebind') {
          row = store.rebindContinuation(documentId, uuidField(body, 'windowSlotId'), uuidField(body, 'sourceAttemptId'), expectedRevision)
        } else if (op === 'lock' || op === 'unlock') {
          row = store.setWindowLock(documentId, uuidField(body, 'windowSlotId'), op === 'lock', expectedRevision)
        } else {
          return sendJson(response, 400, { error: 'The chains route needs op: create-window, rebind, lock, or unlock.' })
        }
        emitDocumentChanged(documentId, row.revision, `chains.${String(op)}`)
        const payload: Record<string, unknown> = { document: documentView(row) }
        if (windowSlotId !== undefined) payload.windowSlotId = windowSlotId
        if (chainRoot !== undefined) payload.chainRoot = chainRoot
        return sendJson(response, 200, payload)
      } catch (error) {
        if (animationFailure(response, error)) return
        throw error
      }
    }

    if (pathname === '/api/lan/animation/select/window-candidate' && request.method === 'POST') {
      // The selection family's window member (§4 — selectWindowCandidate,
      // expectedRevision-gated, lock-guarded): the slot's own selection
      // truth, never implicit in landing.
      return authoring(response, request, 'select.window-candidate', (body, expectedRevision) =>
        store.selectWindowCandidate(documentIdFrom(body), uuidField(body, 'windowSlotId'), uuidField(body, 'attemptId'), expectedRevision))
    }

    if (pathname === '/api/lan/animation/select/key-candidate' && request.method === 'POST') {
      return authoring(response, request, 'select.key-candidate', (body, expectedRevision) =>
        store.selectKeyCandidate(documentIdFrom(body), uuidField(body, 'keyId'), uuidField(body, 'candidateId'), expectedRevision))
    }

    if (pathname === '/api/lan/animation/select/rolling-reference' && request.method === 'POST') {
      // Codex I11: the pointer records the frame's OWN extracted image, so
      // the inspector annotates beside the actual conditioning image. The
      // resolution is the route's job — the SAME §7.2.2 seam the submit and
      // the hero acceptance use (idempotent, content-addressed, and durable
      // against an offline engine since I9) — never a client-supplied
      // handle: the durable document must carry server truth. The §7.2.2
      // two paths unify here too: a selection is never written against a
      // frame that could not be resolved (a named 400, the client-side
      // on-demand extraction's own doctrine, now enforced at the seam).
      return authoring(response, request, 'select.rolling-reference', async (body, expectedRevision) => {
        const frameIndex = body.frameIndex
        if (!isNonNegativeInt(frameIndex)) throw new AnimationRuleError('frameIndex must be a non-negative integer.', 400)
        const attemptId = uuidField(body, 'attemptId')
        let frameAsset: AssetReference
        try {
          frameAsset = await service.extractFrame(attemptId, frameIndex)
        } catch (error) {
          throw new AnimationRuleError(`The selected frame could not be resolved — nothing was selected: ${error instanceof Error ? error.message : String(error)}`, 400)
        }
        return store.selectRollingReference(documentIdFrom(body), uuidField(body, 'spanId'), attemptId, frameIndex, frameAsset, expectedRevision)
      })
    }

    if (pathname === '/api/lan/animation/annotate/rolling-reference' && request.method === 'POST') {
      // Wave 2a (§6.4, the 2026-10-07 ruling): the annotation is an explicit,
      // inspectable, correctable document mutation — the same command shape
      // as the three selection commands (distinct route, expectedRevision,
      // document-changed), bound to the step slot's LIVE selection pointer.
      return authoring(response, request, 'annotate.rolling-reference', (body, expectedRevision) => {
        const annotation = recordField(body, 'annotation', 'The annotation needs a pose description (text or null) and a facing (a vocabulary term or null).')
        const { poseDescription, facing } = annotation
        // The wire contract is the FULL annotation — BOTH fields, always
        // (the fix round's M-2): null clears, and the shipped client merges
        // a partial edit over the live pointer before sending. An ABSENT
        // field would silently clear the other one, so it is a named 400
        // instead — never a wipe by omission.
        if (poseDescription === undefined) {
          throw new AnimationRuleError('The annotation needs BOTH fields — poseDescription is missing (send null to clear it; the route takes the full annotation, never a partial patch).', 400)
        }
        if (facing === undefined) {
          throw new AnimationRuleError('The annotation needs BOTH fields — facing is missing (send null to clear it; the route takes the full annotation, never a partial patch).', 400)
        }
        if (poseDescription !== null && (typeof poseDescription !== 'string' || poseDescription.length > TEXT_LIMIT)) {
          throw new AnimationRuleError(`The pose description must be text of at most ${TEXT_LIMIT} characters (or null to clear it).`, 400)
        }
        if (facing !== null && !isFacingTerm(facing)) {
          throw new AnimationRuleError('The facing must be one of: toward camera / back to camera / screen-left / screen-right (or null to clear it).', 400)
        }
        // An explicitly empty pose description IS a clear — the annotation's
        // null and its empty string name the same truth (no description).
        return store.annotateRollingReference(
          documentIdFrom(body),
          uuidField(body, 'spanId'),
          uuidField(body, 'stepSlotId'),
          { poseDescription: poseDescription === '' ? null : poseDescription, facing },
          expectedRevision,
        )
      })
    }

    if (pathname === '/api/lan/animation/select/clip-contribution' && request.method === 'POST') {
      return authoring(response, request, 'select.clip-contribution', (body, expectedRevision) => {
        const { inFrame, outFrame, holdDuration } = body
        if (!isNonNegativeInt(inFrame) || !isNonNegativeInt(outFrame) || !isNonNegativeInt(holdDuration)) {
          throw new AnimationRuleError('inFrame, outFrame, and holdDuration must be non-negative integers.', 400)
        }
        // The spanless lane (task 13): a sequence window's clip contributes
        // with NO span — `spanId: null` on the wire; anything non-null must
        // still be a UUID naming the tween lane's owning span.
        const spanId = body.spanId === null ? null : uuidField(body, 'spanId')
        return store.selectClipContribution(documentIdFrom(body), spanId, uuidField(body, 'attemptId'), inFrame, outFrame, holdDuration, expectedRevision)
      })
    }

    if (pathname === '/api/lan/animation/editorial' && request.method === 'POST') {
      const body = await readJson(request, 500_000)
      const expectedRevision = expectedRevisionFrom(body)
      const op = body.op
      try {
        const documentId = documentIdFrom(body)
        let row: AnimationDocumentRow
        if (op === 'reorder') {
          // The wire-shape gate (the store owns the permutation rule itself).
          if (!Array.isArray(body.orderedIds) || !body.orderedIds.every((id) => isUuid(id))) {
            return sendJson(response, 400, { error: 'The reorder needs orderedIds — an array of the contribution ids (UUIDs) in their new order.' })
          }
          row = store.reorderEditorial(documentId, body.orderedIds as string[], expectedRevision)
        } else if (op === 'remove') {
          row = store.removeContribution(documentId, uuidField(body, 'contributionId'), expectedRevision)
        } else {
          return sendJson(response, 400, { error: 'The editorial route needs op: reorder or remove.' })
        }
        emitDocumentChanged(documentId, row.revision, `editorial.${String(op)}`)
        return sendJson(response, 200, { document: documentView(row) })
      } catch (error) {
        if (animationFailure(response, error)) return
        throw error
      }
    }

    if (pathname === '/api/lan/animation/attempts' && request.method === 'POST') {
      return submitAttempt(request, response)
    }

    if (pathname === '/api/lan/animation/extend' && request.method === 'POST') {
      return extendAttempt(request, response)
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

    if (pathname === '/api/lan/animation/attempt/retry-preparation' && request.method === 'POST') {
      const body = await readJson(request, 10_000)
      if (!isUuid(body.attemptId)) return sendJson(response, 400, { error: 'An attempt id (UUID) is required.' })
      try {
        // §11.4's explicit recovery action (contract review F3): the owner
        // re-prepares the proposed frame of a LANDED clip — the engine is
        // never touched, so the answer's truth is the attempt's preparation
        // state on the next read.
        await service.retryPreparation(body.attemptId)
        return sendJson(response, 200, { retried: true })
      } catch (error) {
        if (animationFailure(response, error)) return
        throw error
      }
    }

    if (pathname === '/api/lan/animation/export' && request.method === 'POST') {
      // The delivery layer (task 14, §11.3): freeze → gate → assemble → the
      // review ZIP. The stale acknowledgment rides the request
      // (`acknowledgeStale: true`, the datasets acceptWarnings idiom); a
      // stale-but-usable sequence WITHOUT it answers 428 Precondition
      // Required carrying the stale list — a code deliberately distinct
      // from the module's 409 revision-conflict rebase surface. The gate's
      // named refusals (missing media, out-of-range selections, unlanded
      // takes) answer 400 through the shared mapping; a tool failure
      // answers a LOUD 500 naming the stage, never a structural whisper.
      const body = await readJson(request, 10_000)
      const documentId = typeof body.documentId === 'string' ? body.documentId : ''
      try {
        const exported = await exporter.export(documentId, body.acknowledgeStale === true)
        response.writeHead(200, {
          'content-type': 'application/zip',
          'content-disposition': `attachment; filename="${exported.fileName}"`,
          'content-length': String(exported.archive.length),
          'x-animation-manifest-version': String(exported.manifest.manifestVersion),
          'cache-control': 'no-store',
        })
        return void response.end(exported.archive)
      } catch (error) {
        if (error instanceof AnimationExportStaleError) {
          return sendJson(response, 428, { error: error.message, staleSelections: error.staleSelections })
        }
        if (animationFailure(response, error)) return
        return sendJson(response, 500, { error: error instanceof Error ? error.message : 'The export failed.' })
      }
    }

    return sendJson(response, 404, { error: 'Unknown animation route.' })
  }
}
