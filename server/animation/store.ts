/**
 * The animation document store (spec 2026-10-06-animation-authoring-module-
 * design.md §5 key-slot model, §7.2.1 the three selection commands, §8 the
 * data-model invariants, §11.2 the document schema): versioned animation
 * documents plus SEPARATE attempt records on the shared SQLite substrate —
 * attempts live in their own rows so progress updates never conflict with
 * authoring commands (§11.2).
 *
 * Document shape lives in shared/animation/types.ts; this module persists and
 * mutates it under two disciplines:
 *   - every authoring command is one transaction gated on expectedRevision
 *     (AnimationConflictError carries the CURRENT document on mismatch — a
 *     clean rebase-and-retry surface, the PlanConflictError idiom), and the
 *     mutated body is re-validated through parseAnimationDocumentBody before
 *     it is persisted, so the stored body_json always parses (a mutation bug
 *     throws instead of writing garbage). The parser returns a value-equal NEW
 *     object and `provenance.inputRevisions` rides by reference — the store
 *     never holds a body longer than one command: every command re-reads and
 *     re-parses inside its transaction, and the SERIALIZED parse result is
 *     what gets written.
 *   - attempt rows are append-mostly: the sole legal UPDATEs are
 *     engine_job_id / execution / preparation / result / own_revision /
 *     updated_at, enforced by the BEFORE UPDATE trigger in migration 006 (the
 *     canvas_take append-only precedent). Attempts carry their OWN revision —
 *     completion events are not user edits and never touch authored_revision.
 *
 * Two lifecycle decisions the interface left open (documented here, pinned by
 * tests/animation-store.test.js):
 *   - key slots materialize on first candidate: addKeyCandidate creates the
 *     slot when its keyId is new (the timeline grows a key when its first
 *     image arrives), and a landed hero attempt targeting a not-yet-existing
 *     "proposed" slot creates that slot with the candidate — selection stays
 *     an explicit command in both paths (§5.3).
 *   - a new span is created with its FIRST tween step slot (empty): step
 *     slots belong to a span, and the tween attempt that targets a slot is
 *     the only writer that could know its parent — so the span seeds the
 *     chain's starting slot and landed tween attempts attach to it. Every
 *     subsequent slot appends through appendStepSlot (the chain's
 *     advancement command — the foundation contract review's F1).
 */
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { CanvasSchemaVersionError, resolveStudioAppVersion } from '../documents'
import {
  isFacingTerm,
  isMediumString,
  isUuid,
  parseAnimationDocumentBody,
  parseKeyCandidate,
  type AnimationDocumentBody,
  type AnimationTool,
  type AssetReference,
  type AttemptExecutionState,
  type BindingInput,
  type BindingVersion,
  type FacingTerm,
  type FrozenAttemptSnapshot,
  type KeyCandidate,
  type SessionOverrides,
} from '../../shared/animation/types'

/** The ANIMATION DOCUMENT schema version (distinct from migration ids and
 *  from the canvas document schema): bumped only when the persisted body
 *  shape changes; unknown-NEWER versions refuse loudly, never downgrade. */
export const ANIMATION_SCHEMA_VERSION = 1

export type AnimationDocumentRow = {
  id: string
  projectId: string
  name: string
  schemaVersion: number
  revision: number
  body: AnimationDocumentBody
  updatedAt: number
}

export type AnimationAttemptRow = {
  id: string
  documentId: string
  tool: AnimationTool
  targetId: string
  idempotencyKey: string
  inputHash: string
  snapshot: FrozenAttemptSnapshot
  engineJobId: string | null
  execution: { state: AttemptExecutionState; progress?: { value: number; max: number }; failureReason?: string; dispatchVerdict?: 'never-delivered' | 'uncertain' }
  preparation: { state: 'pending' | 'proposed' | 'failed' | 'done'; proposedFrameIndex?: number; error?: string }
  /** `candidate.id` is the MINTED document candidate id — the id inside the
   *  document body's key slot (hero landings); null when the tool mints
   *  nothing (tween attaches by attempt id, sequence surfaces through
   *  editorial selection) and for rows persisted before the field existed.
   *  It is what the fabric's attempt-ready envelope must correlate against —
   *  never the engine artifact path. */
  result: { candidate: { id: string | null; assetReference: AssetReference; frameCount: number; earlierRevision: boolean } } | null
  ownRevision: number
}

/** Thrown when an authoring command loses the expectedRevision race: routes
 *  map this to 409 with the CURRENT document attached so the client can
 *  rebase and retry — never a silent lost update (the PlanConflictError
 *  idiom, spec §11.2 "all authoring commands use expectedRevision"). The
 *  optional message override carries the OTHER 409 this family owns: the
 *  rendering service's same-idempotency-key-different-inputs conflict
 *  (§7.2.2/§11.4) — same status, same current-document surface. */
export class AnimationConflictError extends Error {
  readonly status = 409
  readonly currentRevision: number
  readonly currentDocument: AnimationDocumentRow | null
  constructor(currentRevision: number, currentDocument: AnimationDocumentRow | null, message?: string) {
    super(message ?? 'This animation document changed while it was being edited — reload it and retry the edit on the fresh copy.')
    this.name = 'AnimationConflictError'
    this.currentRevision = currentRevision
    this.currentDocument = currentDocument
  }
}

/** A business-rule refusal (the DocumentsRuleError idiom): the store's
 *  guards — a missing target, a locked key's selection, a malformed input —
 *  answer with their status (400 state refusal / 404 missing target), never
 *  an opaque structural 500. Internal integrity aborts stay plain Errors. */
export class AnimationRuleError extends Error {
  readonly status: 400 | 404
  constructor(message: string, status: 400 | 404 = 400) {
    super(message)
    this.name = 'AnimationRuleError'
    this.status = status
  }
}

const EXECUTION_STATES: ReadonlySet<string> = new Set(['queued', 'rendering', 'preparing', 'ready', 'failed', 'cancelled', 'interrupted', 'reconciling'])
/** The delivery verdict a dispatch failure persists (wave 1 fix round, the
 *  review's I-1): 'never-delivered' — the failure preceded the /prompt send
 *  (the engine was unreachable at the upload/enumeration stage, the request
 *  provably never left the studio); 'uncertain' — the send happened and the
 *  outcome is unknown (the §11.4 ran-and-wiped world). The boot sweep's
 *  redispatch arm gates on never-delivered ONLY. */
const DISPATCH_VERDICTS: ReadonlySet<string> = new Set(['never-delivered', 'uncertain'])
const PREPARATION_STATES: ReadonlySet<string> = new Set(['pending', 'proposed', 'failed', 'done'])
const ANIMATION_TOOLS: ReadonlySet<string> = new Set(['hero', 'tween', 'sequence'])
/** Execution states whose engine-side truth is not settled — the recovery
 *  sweep's input (§11.4: reattach or land idempotently, never blindly
 *  resubmit). Terminal states (ready/failed/cancelled) and `interrupted`
 *  (confirmed lost — explicit user retry required) stay out. */
const IN_FLIGHT_STATES: ReadonlySet<string> = new Set(['queued', 'rendering', 'preparing', 'reconciling'])

/** The four staleness reasons (spec §8.3 + §11.2 "staleness is not limited to
 *  image replacement"): a binding change re-anchors identity, a pose change
 *  replaces a consumed reference image (a selected key candidate OR a rolling
 *  near reference — §6.4's reference state), an intent change rewrites the
 *  motion, a settings change alters every render's operating point. */
type StaleReason = 'binding' | 'pose' | 'intent' | 'settings'

/**
 * Migration 006 — the animation document tables (§11.2), appended to the
 * migration list in db.ts (one-way, append-only; a persisted history that
 * diverges is a hard error there). Own tables only — nothing existing is
 * touched. `animation_document.project_id` deliberately carries NO REFERENCES
 * clause: animation documents belong to a project id, and the referencing
 * surface (canvas projects today) is the route layer's concern, not a schema
 * constraint (the plan's DDL fixes shape).
 */
export function upAnimationTables(db: Database.Database): void {
  db.exec(`
    -- §11.2 animation_document: the authored body rides body_json (validated
    -- by shared/animation/types.parseAnimationDocumentBody on every read and
    -- before every persist); authored_revision is the authoring command count
    -- (landing never advances it).
    CREATE TABLE animation_document (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      authored_revision INTEGER NOT NULL,
      body_json TEXT NOT NULL,
      app_version TEXT NOT NULL DEFAULT 'unknown',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- §11.2 animation_attempt: the frozen inputs + execution bookkeeping.
    -- idempotency_key is UNIQUE at the schema level — "a retry with the same
    -- key returns the existing attempt" (§7.2.2) survives even a hostile
    -- second writer. Append-mostly: the BEFORE UPDATE trigger below freezes
    -- every column the lifecycle does not own (id, document_id, tool,
    -- target_id, idempotency_key, input_hash, snapshot_json, created_at) —
    -- submission freezes the attempt's inputs (§8.1), including its target.
    CREATE TABLE animation_attempt (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES animation_document(id),
      tool TEXT NOT NULL,
      target_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      engine_job_id TEXT,
      execution_json TEXT NOT NULL,
      preparation_json TEXT NOT NULL,
      result_json TEXT,
      own_revision INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX animation_attempt_idem ON animation_attempt(idempotency_key);
    CREATE INDEX animation_attempt_document ON animation_attempt(document_id);
    CREATE INDEX animation_attempt_engine_job ON animation_attempt(engine_job_id);
    CREATE TRIGGER animation_attempt_append_only BEFORE UPDATE ON animation_attempt
      WHEN OLD.id IS NOT NEW.id
      OR OLD.document_id IS NOT NEW.document_id
      OR OLD.tool IS NOT NEW.tool
      OR OLD.target_id IS NOT NEW.target_id
      OR OLD.idempotency_key IS NOT NEW.idempotency_key
      OR OLD.input_hash IS NOT NEW.input_hash
      OR OLD.snapshot_json IS NOT NEW.snapshot_json
      OR OLD.created_at IS NOT NEW.created_at
    BEGIN
      SELECT RAISE(ABORT, 'animation_attempt is append-only (spec 11.2): only engine_job_id/execution/preparation/result/own_revision/updated_at may change');
    END;
  `)
}

// ---------------------------------------------------------------------------
// small narrowing helpers (module-local, the documents.ts str/num idiom)
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

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function now(): number {
  return Date.now()
}

/** Tolerant JSON read for columns this store writes with natural fallbacks
 *  (the documents.ts parseJson idiom); snapshot_json is deliberately NOT read
 *  through this — a frozen attempt has no honest fallback shape. */
function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback
  try {
    const parsed = JSON.parse(raw) as T
    return parsed === null || parsed === undefined ? fallback : parsed
  } catch {
    return fallback
  }
}

/** The store's local AssetReference check (types.ts keeps its parser
 *  module-local; the same shape rules, cast-free). */
function parseAssetReferenceLocal(value: unknown): AssetReference | null {
  if (!isRecord(value)) return null
  const { assetId, relPath, kind } = value
  if (!isNonEmptyString(assetId)) return null
  if (relPath !== null && typeof relPath !== 'string') return null
  if (kind !== 'image' && kind !== 'video') return null
  return { assetId, relPath, kind }
}

function validateBindingInput(binding: unknown): BindingInput | null {
  if (!isRecord(binding)) return null
  const { characterDescription, referenceAssetIds, medium, initialKeyAssetId } = binding
  if (typeof characterDescription !== 'string') return null
  if (!Array.isArray(referenceAssetIds) || !referenceAssetIds.every((id): id is string => isNonEmptyString(id))) return null
  if (!isMediumString(medium)) return null
  if (!isNonEmptyString(initialKeyAssetId)) return null
  return { characterDescription, referenceAssetIds, medium, initialKeyAssetId }
}

function validateSessionOverrides(value: unknown): SessionOverrides | null {
  if (value === undefined) return {}
  if (!isRecord(value)) return null
  const overrides: SessionOverrides = {}
  const { medium, scene, camera } = value
  if (medium !== undefined) {
    if (!isMediumString(medium)) return null
    overrides.medium = medium
  }
  if (scene !== undefined) {
    if (typeof scene !== 'string') return null
    overrides.scene = scene
  }
  if (camera !== undefined) {
    if (!isRecord(camera)) return null
    if (typeof camera.description !== 'string' || typeof camera.reason !== 'string') return null
    overrides.camera = { description: camera.description, reason: camera.reason }
  }
  return overrides
}

function validateIntent(value: unknown): { movement: string; preservation: string } | null {
  if (!isRecord(value)) return null
  const { movement, preservation } = value
  if (typeof movement !== 'string' || typeof preservation !== 'string') return null
  return { movement, preservation }
}

// ---------------------------------------------------------------------------
// the store
// ---------------------------------------------------------------------------

/**
 * The animation document store: pure functions over the shared better-sqlite3
 * handle, prepared once. Authoring commands are revision-gated transactions
 * that propagate staleness; attempt lifecycle methods ride the attempt's OWN
 * revision. No caching — every command re-reads and re-parses inside its
 * transaction (parseAnimationDocumentBody returns a fresh object, so nothing
 * mutable escapes a command).
 */
export function createAnimationStore(db: Database.Database, options: { appVersion?: string } = {}) {
  const appVersion = options.appVersion ?? resolveStudioAppVersion()

  const statements = {
    insertDocument: db.prepare(`
      INSERT INTO animation_document (id, project_id, name, schema_version, authored_revision, body_json, app_version, created_at, updated_at)
      VALUES (@id, @project_id, @name, @schema_version, @authored_revision, @body_json, @app_version, @created_at, @updated_at)
    `),
    document: db.prepare('SELECT * FROM animation_document WHERE id = ?'),
    documentsByProject: db.prepare('SELECT id, name, updated_at FROM animation_document WHERE project_id = ? ORDER BY updated_at DESC, rowid ASC'),
    /** The guarded authoring write: the revision predicate is re-checked at
     *  the statement boundary, so even a hypothetical second connection
     *  cannot interleave a write between the gate and the persist. */
    setDocumentBody: db.prepare('UPDATE animation_document SET body_json = ?, authored_revision = ?, updated_at = ? WHERE id = ? AND authored_revision = ?'),
    /** The landing write: body only — authored_revision and updated_at are
     *  deliberately untouched (completion events are not user edits, §11.2;
     *  a background landing must not reorder the user's documents). */
    setDocumentBodyLanding: db.prepare('UPDATE animation_document SET body_json = ? WHERE id = ?'),

    insertAttempt: db.prepare(`
      INSERT INTO animation_attempt (id, document_id, tool, target_id, idempotency_key, input_hash, snapshot_json, engine_job_id, execution_json, preparation_json, result_json, own_revision, created_at, updated_at)
      VALUES (@id, @document_id, @tool, @target_id, @idempotency_key, @input_hash, @snapshot_json, NULL, @execution_json, @preparation_json, NULL, 0, @created_at, @created_at)
    `),
    attempt: db.prepare('SELECT * FROM animation_attempt WHERE id = ?'),
    attemptByIdem: db.prepare('SELECT * FROM animation_attempt WHERE idempotency_key = ?'),
    attemptByJob: db.prepare('SELECT * FROM animation_attempt WHERE engine_job_id = ?'),
    allAttempts: db.prepare('SELECT * FROM animation_attempt ORDER BY created_at ASC, rowid ASC'),
    /** Scoped to one document — the recovery read must never hydrate (and
     *  choke on) OTHER documents' rows. */
    attemptsByDocument: db.prepare('SELECT * FROM animation_attempt WHERE document_id = ? ORDER BY created_at ASC, rowid ASC'),
    setAttemptResult: db.prepare('UPDATE animation_attempt SET result_json = ?, own_revision = own_revision + 1, updated_at = ? WHERE id = ?'),
    setAttemptExecution: db.prepare('UPDATE animation_attempt SET execution_json = ?, engine_job_id = COALESCE(?, engine_job_id), own_revision = own_revision + 1, updated_at = ? WHERE id = ?'),
    setAttemptPreparation: db.prepare('UPDATE animation_attempt SET preparation_json = ?, own_revision = own_revision + 1, updated_at = ? WHERE id = ?'),
  }

  // ---- hydration + version guard -------------------------------------------

  function hydrateDocument(row: Record<string, unknown>): AnimationDocumentRow {
    const schemaVersion = Number(row.schema_version)
    if (schemaVersion > ANIMATION_SCHEMA_VERSION) {
      throw new CanvasSchemaVersionError(schemaVersion, ANIMATION_SCHEMA_VERSION, str(row.app_version), `animation document "${str(row.name)}"`)
    }
    const body = parseAnimationDocumentBody(parseJson<unknown>(row.body_json, null))
    if (!body) {
      // Store-written bodies always parse (every persist re-validates) — a
      // row that does not is an integrity failure, and the honest answer is a
      // loud abort, never a quietly rebuilt default body.
      throw new Error(`Animation document ${str(row.id)} carries a body this build cannot parse — refusing to serve a rebuilt shape.`)
    }
    return {
      id: str(row.id),
      projectId: str(row.project_id),
      name: str(row.name),
      schemaVersion,
      revision: Number(row.authored_revision),
      body,
      updatedAt: Number(row.updated_at),
    }
  }

  function hydrateAttempt(row: Record<string, unknown>): AnimationAttemptRow {
    // snapshot_json: strict parse — a frozen attempt has no fallback shape.
    const snapshot = JSON.parse(str(row.snapshot_json)) as FrozenAttemptSnapshot
    const tool = str(row.tool)
    if (!ANIMATION_TOOLS.has(tool)) throw new Error(`Attempt ${str(row.id)} carries an unknown tool "${tool}" — refusing to serve it.`)
    return {
      id: str(row.id),
      documentId: str(row.document_id),
      tool: tool as AnimationTool,
      targetId: str(row.target_id),
      idempotencyKey: str(row.idempotency_key),
      inputHash: str(row.input_hash),
      snapshot,
      engineJobId: row.engine_job_id === null ? null : str(row.engine_job_id),
      execution: parseJson<AnimationAttemptRow['execution']>(row.execution_json, { state: 'queued' as const }),
      preparation: parseJson<AnimationAttemptRow['preparation']>(row.preparation_json, { state: 'pending' as const }),
      result: (() => {
        const parsed = parseJson<AnimationAttemptRow['result']>(row.result_json, null)
        // candidate.id normalization: rows persisted before the field
        // existed hydrate with `undefined` — the type's truth is `| null`.
        if (parsed?.candidate && typeof parsed.candidate.id !== 'string') parsed.candidate.id = null
        return parsed
      })(),
      ownRevision: Number(row.own_revision),
    }
  }

  function documentRow(documentId: string): Record<string, unknown> {
    if (!isUuid(documentId)) throw new AnimationRuleError(`No animation document with id ${documentId}.`, 404)
    const row = statements.document.get(documentId) as Record<string, unknown> | undefined
    if (!row) throw new AnimationRuleError(`No animation document with id ${documentId}.`, 404)
    return row
  }

  /** Rows → hydrated attempts with POISON ISOLATION (the documents listing's
   *  version-refusal isolation, M4): a row this build cannot hydrate (a
   *  future tool, a corrupt snapshot) is skipped in isolation — one bad row
   *  never takes a whole document read or the boot sweep down. The skipped
   *  row stays untouched; its own direct read still surfaces the refusal. */
  function hydrateAll(rows: Array<Record<string, unknown>>): AnimationAttemptRow[] {
    const hydrated: AnimationAttemptRow[] = []
    for (const row of rows) {
      try {
        hydrated.push(hydrateAttempt(row))
      } catch {
        // Isolation only — see the doc comment.
      }
    }
    return hydrated
  }

  // ---- the authoring-command core -------------------------------------------

  type DocumentMutation = (body: AnimationDocumentBody) => void

  /** One revision-gated transaction: read → gate → mutate → re-validate →
   *  guarded persist. parseAnimationDocumentBody is the persist gate, so a
   *  mutation that would corrupt pointer integrity throws here instead of
   *  ever reaching body_json. */
  const authorCommand = db.transaction((documentId: string, expectedRevision: number, mutate: DocumentMutation): AnimationDocumentRow => {
    if (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new AnimationRuleError('expectedRevision must be a non-negative integer.', 400)
    }
    const row = documentRow(documentId)
    const currentRevision = Number(row.authored_revision)
    if (currentRevision !== expectedRevision) {
      throw new AnimationConflictError(currentRevision, hydrateDocument(row))
    }
    const body = parseAnimationDocumentBody(parseJson<unknown>(row.body_json, null))
    if (!body) throw new Error(`Animation document ${documentId} carries a body this build cannot parse — refusing to mutate it.`)
    mutate(body)
    const revalidated = parseAnimationDocumentBody(body)
    if (!revalidated) {
      throw new Error(`An animation command produced a body that fails validation (document ${documentId}) — the write was refused, nothing was persisted.`)
    }
    const changes = statements.setDocumentBody.run(JSON.stringify(revalidated), currentRevision + 1, now(), documentId, currentRevision).changes
    if (changes === 0) {
      const fresh = statements.document.get(documentId) as Record<string, unknown> | undefined
      throw new AnimationConflictError(fresh ? Number(fresh.authored_revision) : currentRevision, fresh ? hydrateDocument(fresh) : hydrateDocument(row))
    }
    return hydrateDocument(statements.document.get(documentId) as Record<string, unknown>)
  })

  // ---- staleness propagation (§8.3: mark, never delete) ---------------------

  function markStale(body: AnimationDocumentBody, spanIds: Iterable<string>, reason: StaleReason): number {
    const targets = spanIds instanceof Set ? spanIds : new Set(spanIds)
    let marked = 0
    for (const span of body.spans) {
      if (!targets.has(span.id)) continue
      span.stale = true
      if (!span.staleReasons.includes(reason)) span.staleReasons.push(reason)
      marked += 1
    }
    return marked
  }

  /** Spans adjacent to a key (the ones consuming its image): the span it
   *  starts AND the span that ends into it. Nothing beyond — a downstream
   *  span consumes its own key's SELECTION, which did not change (§5.3). */
  function spansTouchingKey(body: AnimationDocumentBody, keyId: string): Set<string> {
    const ids = new Set<string>()
    for (const span of body.spans) {
      if (span.fromKeyId === keyId || span.toKeyId === keyId) ids.add(span.id)
    }
    return ids
  }

  /** The changed span plus its downstream chain: the rolling motion sequence
   *  flows across span boundaries through the keys (§6.4), so every span
   *  departing the forward key frontier is a descendant. Errs toward marking
   *  MORE stale — stale is a re-render prompt with takes preserved, never a
   *  deletion; under-marking would present outdated work as current. */
  function spanAndDescendants(body: AnimationDocumentBody, spanId: string): Set<string> {
    const origin = body.spans.find((span) => span.id === spanId)
    if (!origin) return new Set()
    const ids = new Set<string>([spanId])
    const frontier = new Set<string>([origin.toKeyId])
    let grew = true
    while (grew) {
      grew = false
      for (const span of body.spans) {
        if (ids.has(span.id)) continue
        if (frontier.has(span.fromKeyId)) {
          ids.add(span.id)
          frontier.add(span.toKeyId)
          grew = true
        }
      }
    }
    return ids
  }

  // ---- shared input validation ----------------------------------------------

  function bindingVersionFromInput(input: BindingInput, version: number): BindingVersion {
    return { version, ...input, boundAt: now() }
  }

  function requireKeySlot(body: AnimationDocumentBody, keyId: string): number {
    const index = body.keys.findIndex((slot) => slot.id === keyId)
    if (index < 0) throw new AnimationRuleError(`No key slot with id ${keyId} in this document.`, 404)
    return index
  }

  function requireSpan(body: AnimationDocumentBody, spanId: string): number {
    const index = body.spans.findIndex((span) => span.id === spanId)
    if (index < 0) throw new AnimationRuleError(`No span with id ${spanId} in this document.`, 404)
    return index
  }

  // ---- store surface ----------------------------------------------------------

  const store = {
    schemaVersion: ANIMATION_SCHEMA_VERSION,
    appVersion,

    // documents --------------------------------------------------------------
    /** `binding` optional since task 7 (spec §4.1): an omitted binding
     *  creates the EMPTY SESSION — the pre-binding document (empty history,
     *  activeBindingVersion 0, the schema's explicitly supported state) the
     *  session panel fills through updateBinding. A PRESENT binding must
     *  still validate whole (the prepared-handoff path). */
    createDocument: (input: { projectId: string; name: string; binding?: BindingInput }) => {
      if (!isNonEmptyString(input?.projectId)) throw new AnimationRuleError('A document needs a project id.', 400)
      if (!isNonEmptyString(input?.name)) throw new AnimationRuleError('A document needs a name.', 400)
      const binding = input.binding === undefined ? null : validateBindingInput(input.binding)
      if (input.binding !== undefined && !binding) throw new AnimationRuleError('The binding needs a character description, non-empty reference asset ids, a supported medium, and an initial key asset id.', 400)
      // The measured H3 keyframe operating point (docs/research/
      // h3-keyframe-animation-assessment.md §3 + Set K): 1344×768, 30 steps,
      // 24 fps — the schema's constant. Per-attempt frozen settings override
      // within these bounds at submit time (the rendering service).
      const body: AnimationDocumentBody = {
        keys: [],
        spans: [],
        bindingHistory: binding ? [bindingVersionFromInput(binding, 1)] : [],
        activeBindingVersion: binding ? 1 : 0,
        editorial: [],
        settings: { outputWidth: 1344, outputHeight: 768, fps: 24, steps: 30 },
      }
      const validated = parseAnimationDocumentBody(body)
      if (!validated) throw new Error('The fresh document body failed validation — an internal shape bug, refusing to persist.')
      const id = randomUUID()
      statements.insertDocument.run({
        id,
        project_id: input.projectId,
        name: input.name,
        schema_version: ANIMATION_SCHEMA_VERSION,
        authored_revision: 0,
        body_json: JSON.stringify(validated),
        app_version: appVersion,
        created_at: now(),
        updated_at: now(),
      })
      return hydrateDocument(statements.document.get(id) as Record<string, unknown>)
    },

    listDocuments: (projectId: string) =>
      (statements.documentsByProject.all(projectId) as Array<Record<string, unknown>>).map((row) => ({
        id: str(row.id),
        name: str(row.name),
        updatedAt: Number(row.updated_at),
      })),

    getDocument: (id: string) => {
      if (!isUuid(id)) return null
      const row = statements.document.get(id) as Record<string, unknown> | undefined
      return row ? hydrateDocument(row) : null
    },

    // authoring commands — every one transactional, expectedRevision-gated,
    // staleness-propagating (see authorCommand for the gate mechanics) ------
    updateBinding: (documentId: string, binding: BindingInput, expectedRevision: number) => {
      const validated = validateBindingInput(binding)
      if (!validated) throw new AnimationRuleError('The binding needs a character description, non-empty reference asset ids, a supported medium, and an initial key asset id.', 400)
      return authorCommand(documentId, expectedRevision, (body) => {
        const version = body.bindingHistory.reduce((max, entry) => Math.max(max, entry.version), 0) + 1
        body.bindingHistory.push(bindingVersionFromInput(validated, version))
        body.activeBindingVersion = version
        markStale(body, body.spans.map((span) => span.id), 'binding')
      })
    },

    addKeyCandidate: (documentId: string, keyId: string, candidate: KeyCandidate, expectedRevision: number) => {
      if (!isUuid(keyId)) throw new AnimationRuleError('The key slot id must be a UUID.', 400)
      const parsed = parseKeyCandidate(candidate)
      if (!parsed) throw new AnimationRuleError('The candidate is malformed (id, asset reference, origin, provenance, pose, facing).', 400)
      return authorCommand(documentId, expectedRevision, (body) => {
        const slot = body.keys.find((entry) => entry.id === keyId)
        if (slot) {
          if (slot.candidates.some((entry) => entry.id === parsed.id)) {
            throw new AnimationRuleError(`Key slot ${keyId} already holds a candidate with id ${parsed.id}.`, 400)
          }
          // Alternatives append — a lock protects the SELECTION, not membership (§11.2).
          slot.candidates.push(parsed)
        } else {
          // The slot materializes with its first candidate; selection stays explicit (§5.3).
          const order = body.keys.reduce((max, entry) => Math.max(max, entry.order), -1) + 1
          body.keys.push({ id: keyId, order, selectedCandidateId: null, candidates: [parsed], lock: false })
        }
      })
    },

    selectKeyCandidate: (documentId: string, keyId: string, candidateId: string, expectedRevision: number) => {
      if (!isUuid(keyId)) throw new AnimationRuleError('The key slot id must be a UUID.', 400)
      if (!isUuid(candidateId)) throw new AnimationRuleError('The candidate id must be a UUID.', 400)
      return authorCommand(documentId, expectedRevision, (body) => {
        const slot = body.keys[requireKeySlot(body, keyId)]
        if (!slot.candidates.some((candidate) => candidate.id === candidateId)) {
          throw new AnimationRuleError(`No candidate with id ${candidateId} in key slot ${keyId}.`, 404)
        }
        // Server-enforced lock (§7.2.1): a locked key's selection cannot change
        // without an explicit unlock — checked here, not in the client.
        if (slot.lock) {
          throw new AnimationRuleError(`Key slot ${keyId} is locked — unlock it before changing its selection.`, 400)
        }
        if (slot.selectedCandidateId !== candidateId) {
          slot.selectedCandidateId = candidateId
          markStale(body, spansTouchingKey(body, keyId), 'pose')
        }
      })
    },

    setKeyLock: (documentId: string, keyId: string, locked: boolean, expectedRevision: number) => {
      if (!isUuid(keyId)) throw new AnimationRuleError('The key slot id must be a UUID.', 400)
      if (typeof locked !== 'boolean') throw new AnimationRuleError('locked must be a boolean.', 400)
      return authorCommand(documentId, expectedRevision, (body) => {
        body.keys[requireKeySlot(body, keyId)].lock = locked
      })
    },

    insertSpan: (
      documentId: string,
      span: { fromKeyId: string; toKeyId: string; intent: { movement: string; preservation: string }; overrides?: SessionOverrides },
      expectedRevision: number,
    ) => {
      if (!isUuid(span?.fromKeyId) || !isUuid(span?.toKeyId)) throw new AnimationRuleError('A span needs UUID from/to key ids.', 400)
      const intent = validateIntent(span?.intent)
      if (!intent) throw new AnimationRuleError('A span needs movement and preservation text.', 400)
      const overrides = validateSessionOverrides(span?.overrides)
      if (!overrides) throw new AnimationRuleError('The span overrides are malformed (medium, scene, camera description/reason).', 400)
      return authorCommand(documentId, expectedRevision, (body) => {
        requireKeySlot(body, span.fromKeyId)
        requireKeySlot(body, span.toKeyId)
        body.spans.push({
          id: randomUUID(),
          fromKeyId: span.fromKeyId,
          toKeyId: span.toKeyId,
          intent,
          overrides,
          // The span seeds its FIRST step slot: step slots belong to a span,
          // and a tween attempt only names the slot — the parent must already
          // exist when the chain starts rolling.
          stepSlots: [{ id: randomUUID(), attempts: [], selectedRollingReference: null }],
          stale: false,
          staleReasons: [],
        })
      })
    },

    /** The tween chain's advancement surface (the foundation contract
     *  review's F1): appends one EMPTY step slot to the span — insertSpan
     *  seeds the chain's first slot, this command grows every subsequent
     *  one. Span-level by ruling: the slot's position is its order within
     *  the span, so the command carries no client-chosen data beyond the
     *  span it grows; the minted slot id (the only new fact) rides the
     *  returned row. Nothing is marked stale — an empty slot consumes no
     *  reference state (§6.4). */
    appendStepSlot: (documentId: string, spanId: string, expectedRevision: number) => {
      if (!isUuid(spanId)) throw new AnimationRuleError('The span id must be a UUID.', 400)
      return authorCommand(documentId, expectedRevision, (body) => {
        const span = body.spans[requireSpan(body, spanId)]
        span.stepSlots.push({ id: randomUUID(), attempts: [], selectedRollingReference: null })
      })
    },

    updateSpanIntent: (documentId: string, spanId: string, intent: { movement: string; preservation: string }, expectedRevision: number) => {
      if (!isUuid(spanId)) throw new AnimationRuleError('The span id must be a UUID.', 400)
      const validated = validateIntent(intent)
      if (!validated) throw new AnimationRuleError('A span needs movement and preservation text.', 400)
      return authorCommand(documentId, expectedRevision, (body) => {
        const span = body.spans[requireSpan(body, spanId)]
        span.intent = validated
        markStale(body, spanAndDescendants(body, spanId), 'intent')
      })
    },

    updateDocumentSettings: (documentId: string, settings: Partial<AnimationDocumentBody['settings']>, expectedRevision: number) => {
      if (!isRecord(settings)) throw new AnimationRuleError('Settings must be an object.', 400)
      for (const key of ['outputWidth', 'outputHeight', 'steps'] as const) {
        if (settings[key] !== undefined && !isPositiveInt(settings[key])) throw new AnimationRuleError(`${key} must be a positive integer.`, 400)
      }
      // fps is a schema constant (§11.3: constant 24 fps), not a setting.
      if (settings.fps !== undefined && settings.fps !== 24) throw new AnimationRuleError('fps is a constant of the animation schema (24), not a setting.', 400)
      return authorCommand(documentId, expectedRevision, (body) => {
        // Undefined-safe merge: an explicitly-undefined key is "not provided",
        // never an overwrite of the current value. (fps never rides the patch
        // — it is re-pinned to the constant below.)
        const patch: Partial<AnimationDocumentBody['settings']> = {}
        for (const key of ['outputWidth', 'outputHeight', 'steps'] as const) {
          if (settings[key] !== undefined) patch[key] = settings[key]
        }
        body.settings = { ...body.settings, ...patch, fps: 24 }
        markStale(body, body.spans.map((span) => span.id), 'settings')
      })
    },

    selectRollingReference: (documentId: string, spanId: string, attemptId: string, frameIndex: number, expectedRevision: number) => {
      if (!isUuid(spanId)) throw new AnimationRuleError('The span id must be a UUID.', 400)
      if (!isUuid(attemptId)) throw new AnimationRuleError('The attempt id must be a UUID.', 400)
      if (!isNonNegativeInt(frameIndex)) throw new AnimationRuleError('frameIndex must be a non-negative integer.', 400)
      return authorCommand(documentId, expectedRevision, (body) => {
        const span = body.spans[requireSpan(body, spanId)]
        const slot = span.stepSlots.find((step) => step.attempts.includes(attemptId))
        if (!slot) throw new AnimationRuleError(`Attempt ${attemptId} is not attached to span ${spanId}.`, 404)
        // The annotation rides the selection pointer (wave 2a, §6.4): a
        // DIFFERENT rolling reference starts unannotated — the new frame's
        // pose is unknown until authored — while re-selecting the SAME frame
        // keeps the authored annotation (an idempotent re-click of the
        // already-selected frame must not destroy authored work).
        const current = slot.selectedRollingReference
        slot.selectedRollingReference = current !== null && current.attemptId === attemptId && current.frameIndex === frameIndex
          ? current
          : { attemptId, frameIndex, poseDescription: null, facing: null }
        // The new near reference changes the reference state the span's later
        // steps consume (§6.4) — mark the span stale with the pose reason;
        // previous takes stay in the slot's attempts (§8.3).
        markStale(body, [spanId], 'pose')
      })
    },

    /** Wave 2a (§6.4's "inspectable and correctable" ruling, 2026-10-07):
     *  the image-bound annotation for a step slot's SELECTED rolling
     *  reference — one {poseDescription, facing} riding the selection
     *  pointer, correctable in place. The annotation feeds the next
     *  submission's compile exactly as intent does, so the span marks stale
     *  'pose' — the same class as a key-candidate pose change; the annotated
     *  slot's own landed takes stay untouched (§8.3: prior takes preserved).
     *  Bound to a LIVE selection: a slot with no selected rolling reference
     *  is a state refusal, never an annotation floating free of its frame. */
    annotateRollingReference: (
      documentId: string,
      spanId: string,
      stepSlotId: string,
      annotation: { poseDescription: string | null; facing: FacingTerm | null },
      expectedRevision: number,
    ) => {
      if (!isUuid(spanId)) throw new AnimationRuleError('The span id must be a UUID.', 400)
      if (!isUuid(stepSlotId)) throw new AnimationRuleError('The step slot id must be a UUID.', 400)
      if (!isRecord(annotation)) throw new AnimationRuleError('The annotation needs a pose description (text or null) and a facing (a vocabulary term or null).', 400)
      const { poseDescription, facing } = annotation
      if (poseDescription !== null && typeof poseDescription !== 'string') throw new AnimationRuleError('The pose description must be text (or null to clear it).', 400)
      if (facing !== null && !isFacingTerm(facing)) throw new AnimationRuleError('The facing must be one of: toward camera / back to camera / screen-left / screen-right (or null to clear it).', 400)
      return authorCommand(documentId, expectedRevision, (body) => {
        const span = body.spans[requireSpan(body, spanId)]
        const slot = span.stepSlots.find((step) => step.id === stepSlotId)
        if (!slot) throw new AnimationRuleError(`No tween step slot with id ${stepSlotId} in span ${spanId}.`, 404)
        if (slot.selectedRollingReference === null) {
          throw new AnimationRuleError(`Step slot ${stepSlotId} holds no selected rolling reference — the annotation is bound to a live selection.`, 400)
        }
        slot.selectedRollingReference.poseDescription = poseDescription
        slot.selectedRollingReference.facing = facing
        // A changed annotation changes the pose the span's later steps'
        // captions compile from (§6.4's reference state) — the same 'pose'
        // staleness a key-candidate selection change carries.
        markStale(body, [spanId], 'pose')
      })
    },

    /** The editorial list's lane rules (task 13, §9/§11.2): a spanId names
     *  the TWEEN lane (the attempt must be attached to that span's step
     *  slots); spanId NULL names the SPANLESS lane — a whole-scene render
     *  whose clip IS the contribution (a sequence window take; §11.2: a
     *  sequence attempt owns no span, the task-2 widening the ledger named).
     *  Hero clips ride neither: their product is a KEY DRAWING (§5.2), not a
     *  sequence contribution. */
    selectClipContribution: (documentId: string, spanId: string | null, attemptId: string, inFrame: number, outFrame: number, holdDuration: number, expectedRevision: number) => {
      if (spanId !== null && !isUuid(spanId)) throw new AnimationRuleError('The span id must be a UUID (or null for a whole-scene clip).', 400)
      if (!isUuid(attemptId)) throw new AnimationRuleError('The attempt id must be a UUID.', 400)
      for (const [name, value] of [['inFrame', inFrame], ['outFrame', outFrame], ['holdDuration', holdDuration]] as const) {
        if (!isNonNegativeInt(value)) throw new AnimationRuleError(`${name} must be a non-negative integer.`, 400)
      }
      return authorCommand(documentId, expectedRevision, (body) => {
        // The referenced clip must be REAL and belong to THIS document — the
        // same refusal class as selectRollingReference (review Important-1):
        // a fabricated or foreign attemptId would leave an editorial entry
        // whose row never rides this project's archive export.
        const attemptRow = statements.attempt.get(attemptId) as Record<string, unknown> | undefined
        if (!attemptRow || str(attemptRow.document_id) !== documentId) {
          throw new AnimationRuleError(`Attempt ${attemptId} is not an attempt of this document.`, 404)
        }
        if (spanId !== null) {
          const span = body.spans[requireSpan(body, spanId)]
          if (!span.stepSlots.some((step) => step.attempts.includes(attemptId))) {
            throw new AnimationRuleError(`Attempt ${attemptId} is not attached to span ${spanId}.`, 404)
          }
        } else {
          const tool = str(attemptRow.tool)
          if (tool === 'tween') {
            throw new AnimationRuleError('A tween clip contributes through its span — name the span that owns its step slot.', 400)
          }
          if (tool !== 'sequence') {
            throw new AnimationRuleError(`A ${tool} render does not contribute to the assembled sequence — the hero lane's product is a key drawing (§5.2).`, 400)
          }
        }
        // One contribution per (span, attempt): re-choosing a portion UPDATES
        // (id stable), a different clip contributes a second entry. Editorial
        // timing is an assembly decision (§9) — it marks nothing stale.
        const existing = body.editorial.find((entry) => entry.spanId === spanId && entry.attemptId === attemptId)
        if (existing) {
          existing.inFrame = inFrame
          existing.outFrame = outFrame
          existing.holdDuration = holdDuration
        } else {
          body.editorial.push({ id: randomUUID(), spanId, attemptId, inFrame, outFrame, holdDuration })
        }
      })
    },

    /** The editorial-list reorder (task 13, §9: the ordered list IS the
     *  assembled sequence's order): `orderedIds` must be a PERMUTATION of the
     *  current list — every contribution exactly once, nothing foreign.
     *  Rows move; nothing is rewritten. An assembly decision: no staleness. */
    reorderEditorial: (documentId: string, orderedIds: string[], expectedRevision: number) => {
      if (!Array.isArray(orderedIds) || !orderedIds.every((id) => isUuid(id))) {
        throw new AnimationRuleError('orderedIds must be an array of contribution ids (UUIDs).', 400)
      }
      return authorCommand(documentId, expectedRevision, (body) => {
        if (orderedIds.length !== body.editorial.length) {
          throw new AnimationRuleError(`The ordered id list must name every contribution exactly once — got ${orderedIds.length} of ${body.editorial.length}.`, 400)
        }
        const byId = new Map(body.editorial.map((entry) => [entry.id, entry]))
        const next: AnimationDocumentBody['editorial'] = []
        const seen = new Set<string>()
        for (const id of orderedIds) {
          const entry = byId.get(id)
          if (!entry || seen.has(id)) {
            throw new AnimationRuleError(`The ordered id list must name every contribution exactly once — ${id} is missing or repeated.`, 400)
          }
          seen.add(id)
          next.push(entry)
        }
        body.editorial = next
      })
    },

    /** The editorial-list removal (task 13): a mistaken contribution is
     *  deletable — the list is an authored document, never an append-only
     *  ledger. (A SPAN's removal still drops its own entries wholesale.)
     *  An assembly decision: no staleness. */
    removeContribution: (documentId: string, contributionId: string, expectedRevision: number) => {
      if (!isUuid(contributionId)) throw new AnimationRuleError('The contribution id must be a UUID.', 400)
      return authorCommand(documentId, expectedRevision, (body) => {
        const before = body.editorial.length
        body.editorial = body.editorial.filter((entry) => entry.id !== contributionId)
        if (body.editorial.length === before) {
          throw new AnimationRuleError(`No editorial contribution with id ${contributionId} in this document.`, 404)
        }
      })
    },

    /** Span removal (the spans route's `remove` op — landed with the routes
     *  because no earlier task needed it): the span leaves the document AND
     *  its editorial contributions go with it (a contribution row naming a
     *  missing span would fail parseAnimationDocumentBody's pointer
     *  integrity — the persist gate refuses it anyway; dropping them here is
     *  the honest semantics, editorial timing belongs to its span). Nothing
     *  is marked stale: no OTHER span consumed this span's references (a
     *  downstream span consumes its own key's selection, §5.3), and the
     *  attempt rows targeting the removed step slots stay readable — the
     *  completion owner's landing for them is a 404 refusal, by design. */
    removeSpan: (documentId: string, spanId: string, expectedRevision: number) => {
      if (!isUuid(spanId)) throw new AnimationRuleError('The span id must be a UUID.', 400)
      return authorCommand(documentId, expectedRevision, (body) => {
        requireSpan(body, spanId)
        body.spans = body.spans.filter((span) => span.id !== spanId)
        body.editorial = body.editorial.filter((entry) => entry.spanId !== spanId)
      })
    },

    // attempts — separate rows, their OWN revision; completion events are
    // not user edits (§11.2) -------------------------------------------------
    /** The recovery read's attempt half (the route pairs it with the
     *  document): every attempt of one document, oldest first, scoped at the
     *  QUERY (never hydrate-then-filter — a poison row from another document
     *  must not reach this read at all) and hydrated with per-row isolation
     *  (hydrateAll). Attempt rows outlive their span — a tween attempt whose
     *  target step slot was later removed stays readable here (its landing
     *  is the owner's refusal, not this read's). */
    attemptsForDocument: (documentId: string): AnimationAttemptRow[] =>
      hydrateAll(statements.attemptsByDocument.all(documentId ?? '') as Array<Record<string, unknown>>),
    recordAttempt: (input: { id: string; documentId: string; tool: AnimationTool; targetId: string; idempotencyKey: string; inputHash: string; snapshot: FrozenAttemptSnapshot }) => {
      // Same key ⇒ the existing attempt, whatever the new inputs carry — the
      // different-inputs CONFLICT is the route's call (it compares the stored
      // inputHash, §11.4); the store's contract is return-existing.
      const existing = statements.attemptByIdem.get(input?.idempotencyKey ?? '') as Record<string, unknown> | undefined
      if (existing) return { attempt: hydrateAttempt(existing), created: false }
      if (!isUuid(input?.id)) throw new AnimationRuleError('The attempt id must be a UUID.', 400)
      if (!isUuid(input?.documentId)) throw new AnimationRuleError('The document id must be a UUID.', 400)
      if (!ANIMATION_TOOLS.has(input?.tool)) throw new AnimationRuleError(`Unknown animation tool ${String(input?.tool)}.`, 400)
      if (!isNonEmptyString(input?.targetId)) throw new AnimationRuleError('The attempt needs a target id.', 400)
      if (!isNonEmptyString(input?.idempotencyKey)) throw new AnimationRuleError('The attempt needs an idempotency key.', 400)
      if (!isNonEmptyString(input?.inputHash)) throw new AnimationRuleError('The attempt needs an input hash.', 400)
      // The one snapshot field the landing contract depends on; full snapshot
      // validation is the submit seam's guard (the shared module gains its
      // parser deliberately when the compiler lands — task 1's report note).
      if (!isRecord(input?.snapshot) || !isNonNegativeInt((input.snapshot as Record<string, unknown>).documentRevision)) {
        throw new AnimationRuleError('The frozen snapshot must carry a non-negative integer documentRevision.', 400)
      }
      documentRow(input.documentId)
      statements.insertAttempt.run({
        id: input.id,
        document_id: input.documentId,
        tool: input.tool,
        target_id: input.targetId,
        idempotency_key: input.idempotencyKey,
        input_hash: input.inputHash,
        snapshot_json: JSON.stringify(input.snapshot),
        execution_json: JSON.stringify({ state: 'queued' }),
        preparation_json: JSON.stringify({ state: 'pending' }),
        created_at: now(),
      })
      return { attempt: hydrateAttempt(statements.attempt.get(input.id) as Record<string, unknown>), created: true }
    },

    getAttempt: (attemptId: string) => {
      if (!isUuid(attemptId)) return null
      const row = statements.attempt.get(attemptId) as Record<string, unknown> | undefined
      return row ? hydrateAttempt(row) : null
    },

    attemptByIdempotencyKey: (key: string) => {
      const row = statements.attemptByIdem.get(key ?? '') as Record<string, unknown> | undefined
      return row ? hydrateAttempt(row) : null
    },

    /** Landing (§8.2): completion ADDS a candidate — it never replaces a
     *  selection, never starts dependent work, and never duplicates (a second
     *  call for the same attempt is a no-op returning the landed row). The
     *  document body changes WITHOUT touching authored_revision or updated_at
     *  — completion events are not user edits; concurrent authoring changes
     *  survive byte-for-byte, and the candidate carries earlierRevision
     *  provenance when the attempt's frozen documentRevision is behind. */
    landCandidate: db.transaction((attemptId: string, candidate: { assetReference: AssetReference; frameCount: number; earlierRevision: boolean }): { attempt: AnimationAttemptRow } => {
      const attemptRow = statements.attempt.get(attemptId ?? '') as Record<string, unknown> | undefined
      if (!attemptRow) throw new AnimationRuleError(`No attempt with id ${attemptId}.`, 404)
      const existingResult = parseJson<AnimationAttemptRow['result']>(attemptRow.result_json, null)
      if (existingResult) return { attempt: hydrateAttempt(attemptRow) } // exactly one candidate ever
      const assetReference = parseAssetReferenceLocal(candidate?.assetReference)
      if (!assetReference) throw new AnimationRuleError('The landed candidate needs an asset reference (assetId, relPath, kind).', 400)
      if (!isPositiveInt(candidate?.frameCount)) throw new AnimationRuleError('frameCount must be a positive integer.', 400)

      const documentRowData = statements.document.get(str(attemptRow.document_id)) as Record<string, unknown> | undefined
      if (!documentRowData) throw new AnimationRuleError(`The attempt's document ${str(attemptRow.document_id)} no longer exists.`, 404)
      const currentRevision = Number(documentRowData.authored_revision)
      const body = parseAnimationDocumentBody(parseJson<unknown>(documentRowData.body_json, null))
      if (!body) throw new Error(`Animation document ${str(documentRowData.id)} carries a body this build cannot parse — refusing to land into it.`)

      const attemptIdValue = str(attemptRow.id)
      const tool = str(attemptRow.tool)
      const targetId = str(attemptRow.target_id)
      const snapshot = parseJson<Record<string, unknown>>(attemptRow.snapshot_json, {})
      const frozenRevision = typeof snapshot.documentRevision === 'number' ? snapshot.documentRevision : currentRevision
      // The store computes the truth from the frozen revision; a caller's
      // `true` is honored (its semantics may outrun the revision count).
      const earlierRevision = candidate.earlierRevision === true || frozenRevision < currentRevision

      // The MINTED document candidate id (a hero landing pushes a
      // KeyCandidate into the body — that id is the correlation key the
      // fabric's attempt-ready envelope carries; the tools that mint nothing
      // leave it null). Declared before the tool arms so the result write
      // below is one shape for all three.
      let mintedCandidateId: string | null = null
      if (tool === 'hero') {
        // A hero clip lands as a KEY CANDIDATE of its (proposed) slot — the
        // slot materializes when absent; selection stays an explicit command.
        let slot = body.keys.find((entry) => entry.id === targetId)
        if (!slot) {
          const order = body.keys.reduce((max, entry) => Math.max(max, entry.order), -1) + 1
          slot = { id: targetId, order, selectedCandidateId: null, candidates: [], lock: false }
          body.keys.push(slot)
        }
        mintedCandidateId = randomUUID()
        slot.candidates.push({
          id: mintedCandidateId,
          assetReference,
          origin: 'hero',
          provenance: {
            assetId: assetReference.assetId,
            generatingOp: attemptIdValue,
            inputRevisions: { document: `r${frozenRevision}` },
          },
          poseDescription: null,
          facing: null,
        })
      } else if (tool === 'tween') {
        // The landed tween clip attaches its attempt to the target step slot —
        // the slot's attempt alternatives grow; the selected rolling
        // reference stays an explicit command.
        const span = body.spans.find((entry) => entry.stepSlots.some((step) => step.id === targetId))
        const slot = span?.stepSlots.find((step) => step.id === targetId)
        if (!span || !slot) throw new AnimationRuleError(`The attempt's target step slot ${targetId} no longer exists in the document.`, 404)
        if (!slot.attempts.includes(attemptIdValue)) slot.attempts.push(attemptIdValue)
      }
      // 'sequence' clips surface through editorial selection — no body change.

      const revalidated = parseAnimationDocumentBody(body)
      if (!revalidated) {
        throw new Error(`Landing into document ${str(documentRowData.id)} produced a body that fails validation — the landing was refused, nothing was persisted.`)
      }
      statements.setDocumentBodyLanding.run(JSON.stringify(revalidated), documentRowData.id)
      const result: NonNullable<AnimationAttemptRow['result']> = { candidate: { id: mintedCandidateId, assetReference, frameCount: candidate.frameCount, earlierRevision } }
      statements.setAttemptResult.run(JSON.stringify(result), now(), attemptIdValue)
      return { attempt: hydrateAttempt(statements.attempt.get(attemptIdValue) as Record<string, unknown>) }
    }),

    setAttemptExecution: (attemptId: string, execution: { state: AttemptExecutionState; engineJobId?: string; progress?: { value: number; max: number }; failureReason?: string; dispatchVerdict?: 'never-delivered' | 'uncertain' }) => {
      const row = statements.attempt.get(attemptId ?? '') as Record<string, unknown> | undefined
      if (!row) throw new AnimationRuleError(`No attempt with id ${attemptId}.`, 404)
      if (!EXECUTION_STATES.has(execution?.state)) throw new AnimationRuleError(`Unknown execution state ${String(execution?.state)}.`, 400)
      if (execution.engineJobId !== undefined && !isNonEmptyString(execution.engineJobId)) throw new AnimationRuleError('engineJobId must be a non-empty string.', 400)
      if (execution.progress !== undefined) {
        if (!isRecord(execution.progress) || !isNonNegativeInt(execution.progress.value) || !isPositiveInt(execution.progress.max) || execution.progress.value > execution.progress.max) {
          throw new AnimationRuleError('progress must be { value, max } with 0 <= value <= max.', 400)
        }
      }
      // The durable failure detail (wave 1, the live review's #6): the
      // sanitized, structured reason a failed attempt carries — composed by
      // the failure sites (never raw engine output), capped so a pathological
      // reason cannot flood the row. Written only WITH the failed verdict;
      // a state transition that carries none writes none.
      if (execution.failureReason !== undefined && typeof execution.failureReason !== 'string') {
        throw new AnimationRuleError('failureReason must be a string.', 400)
      }
      // The delivery verdict (fix round I-1): a closed two-member vocabulary.
      if (execution.dispatchVerdict !== undefined && !DISPATCH_VERDICTS.has(execution.dispatchVerdict)) {
        throw new AnimationRuleError('dispatchVerdict must be "never-delivered" or "uncertain".', 400)
      }
      const current = parseJson<AnimationAttemptRow['execution']>(row.execution_json, { state: 'queued' as const })
      const next: AnimationAttemptRow['execution'] = { state: execution.state }
      if (execution.progress !== undefined) next.progress = execution.progress
      else if (current.progress !== undefined) next.progress = current.progress
      if (execution.failureReason !== undefined) next.failureReason = execution.failureReason.slice(0, 2000)
      if (execution.dispatchVerdict !== undefined) next.dispatchVerdict = execution.dispatchVerdict
      statements.setAttemptExecution.run(JSON.stringify(next), execution.engineJobId ?? null, now(), attemptId)
    },

    setAttemptPreparation: (attemptId: string, preparation: { state: 'pending' | 'proposed' | 'failed' | 'done'; proposedFrameIndex?: number; error?: string }) => {
      const row = statements.attempt.get(attemptId ?? '') as Record<string, unknown> | undefined
      if (!row) throw new AnimationRuleError(`No attempt with id ${attemptId}.`, 404)
      if (!PREPARATION_STATES.has(preparation?.state)) throw new AnimationRuleError(`Unknown preparation state ${String(preparation?.state)}.`, 400)
      if (preparation.proposedFrameIndex !== undefined && !isNonNegativeInt(preparation.proposedFrameIndex)) throw new AnimationRuleError('proposedFrameIndex must be a non-negative integer.', 400)
      if (preparation.error !== undefined && typeof preparation.error !== 'string') throw new AnimationRuleError('error must be a string.', 400)
      // Wholesale replace with exactly what the caller means — the completion
      // owner owns the full state machine (proposed → done/failed → retried).
      const next: AnimationAttemptRow['preparation'] = { state: preparation.state }
      if (preparation.proposedFrameIndex !== undefined) next.proposedFrameIndex = preparation.proposedFrameIndex
      if (preparation.error !== undefined) next.error = preparation.error
      statements.setAttemptPreparation.run(JSON.stringify(next), now(), attemptId)
    },

    attemptsInFlight: (): AnimationAttemptRow[] =>
      hydrateAll(statements.allAttempts.all() as Array<Record<string, unknown>>)
        .filter((attempt) => IN_FLIGHT_STATES.has(attempt.execution.state)),

    attemptByEngineJobId: (engineJobId: string) => {
      const row = statements.attemptByJob.get(engineJobId ?? '') as Record<string, unknown> | undefined
      return row ? hydrateAttempt(row) : null
    },
  }

  return store
}

export type AnimationStore = ReturnType<typeof createAnimationStore>
