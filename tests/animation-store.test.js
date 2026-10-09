// The animation document store suite (task 2 of the animation-authoring
// module, spec 2026-10-06-animation-authoring-module-design.md §7.2.1/§8/§11.2):
// migration 006, the full document lifecycle, attempts as separate rows, and
// the project-archive round-trip.
//
// The suite drives the BUILT store modules directly (better-sqlite3 handle +
// dist-server imports — the documents suite's shim, without the server boot:
// no ports, no routes; the routes land in task 5):
//   (a) migration 006 + 007 — both tables, the three indexes, the append-only
//       trigger (aborts a snapshot_json/tool UPDATE; own_revision updates are
//       the legal path), the continuation column, id list + user_version
//   (b) CRUD + the revision gate — create/list/get round-trip; a stale
//       expectedRevision throws AnimationConflictError carrying the CURRENT
//       document; a locked key refuses selection (400) until unlocked; the
//       unknown-newer schema version refuses loudly; 404/400 rule errors
//   (c) idempotency — recordAttempt twice with the same key returns
//       { created: false } and ONE row; the stored inputHash is exposed for
//       the route's different-inputs conflict (task 5)
//   (d) duplicate landing (Review Focus #1) — landCandidate twice ⇒ still
//       exactly ONE candidate in the attempt result and the document body
//   (e) landing vs authoring concurrency (Review Focus #2) — an attempt
//       frozen at N lands after the document moved to N+3 ⇒ candidate
//       present, earlierRevision true, selections unchanged, revision N+3
//   (f) staleness (Review Focus #4) — binding, pose (selected-candidate
//       swap), intent, and settings changes each mark the affected spans
//       stale with the matching reason; previous takes/candidates remain
//   (g) the three selection commands mutate exactly their own structures —
//       selectRollingReference sets the step slot's pointer (never creates a
//       key), selectClipContribution upserts the editorial entry
//   (h) archive round-trip — project export packs animation documents +
//       attempts + every referenced blob; import restores both tables and
//       the blob bytes, and refuses id collisions loudly
//   (j) the continuation column (extension lane Task 2) — setAttemptContinuation's
//       validation + round-trip over migration 007's column, landedAttempts
//       (the boot sweep's registration-resume read), and the archive riding
//       the registered carry blob
//   (k) the extension chain (extension lane Task 4) — window slots +
//       selection truth, the staleness rules (alternatives never
//       invalidate; ancestry/intent marks with takes preserved), rebind as
//       the explicit document mutation producing the NEXT attempt's binding
//       (the old ones byte-unchanged), the derived mismatch, and the
//       archive round-trip carrying chains + bindings + artifacts
//
// Run after `pnpm build:server` (the store + archive load from dist-server).
// Scratch homes go through the Wave 4 ledger (tests/lib/scratch.cjs).

import { test, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
// The shared pure module imports from SOURCE (the routes suite's precedent —
// vitest transforms the TS natively); the server modules below load from the
// built dist-server, the suite's standing discipline.
import { chainMismatch } from '../shared/animation/types'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const REPO = require('node:path').resolve(__dirname, '..')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const Database = require('better-sqlite3')
const { makeScratchDir, removeAllScratchDirs } = require('./lib/scratch.cjs')
afterAll(() => { void removeAllScratchDirs() })

const { migrations, migrateDatabase } = require(path.join(REPO, 'dist-server/server/db.js'))
const {
  createAnimationStore,
  upAnimationTables,
  upAnimationContinuation,
  ANIMATION_SCHEMA_VERSION,
  AnimationConflictError,
  AnimationRuleError,
} = require(path.join(REPO, 'dist-server/server/animation/store.js'))
const { createDocumentStore } = require(path.join(REPO, 'dist-server/server/documents.js'))
const { exportProjectArchive, importProjectArchive } = require(path.join(REPO, 'dist-server/server/documentArchive.js'))

const uuid = () => randomUUID()
const rev = (row) => row.revision

// ---- fixtures -------------------------------------------------------------

function makeBinding(overrides = {}) {
  return {
    characterDescription: overrides.characterDescription ?? 'a lanky courier in a long coat',
    referenceAssetIds: overrides.referenceAssetIds ?? [uuid(), uuid()],
    medium: overrides.medium ?? 'clean line on white',
    initialKeyAssetId: overrides.initialKeyAssetId ?? `asset-${uuid().slice(0, 8)}`,
  }
}

function makeCandidate(overrides = {}) {
  return {
    id: overrides.id ?? uuid(),
    assetReference: overrides.assetReference ?? { assetId: `asset-${uuid().slice(0, 8)}`, relPath: overrides.relPath ?? null, kind: 'image' },
    origin: overrides.origin ?? 'import',
    provenance: overrides.provenance ?? { assetId: `stable-${uuid().slice(0, 8)}` },
    poseDescription: overrides.poseDescription ?? null,
    facing: overrides.facing ?? null,
  }
}

function makeSnapshot(overrides = {}) {
  return {
    tool: overrides.tool ?? 'hero',
    targetId: overrides.targetId ?? uuid(),
    references: overrides.references ?? [
      { role: 'current-key', assetReference: { assetId: `asset-${uuid().slice(0, 8)}`, relPath: null, kind: 'image' }, poseDescription: 'standing, weight even', facing: 'toward camera' },
    ],
    caption: overrides.caption ?? 'FIRST FRAME: the courier stands mid-stride. She walks screen-left.',
    compilerVersion: overrides.compilerVersion ?? 'animation-captions/1',
    settings: overrides.settings ?? { steps: 30, shift: '12/3' },
    documentRevision: overrides.documentRevision ?? 0,
  }
}

function recordAttemptSimple(store, documentId, tool, targetId, idempotencyKey, snapshotOverrides = {}) {
  return store.recordAttempt({
    id: uuid(),
    documentId,
    tool,
    targetId,
    idempotencyKey,
    inputHash: `hash-${idempotencyKey}`,
    snapshot: makeSnapshot({ tool, targetId, ...snapshotOverrides }),
  })
}

// ---- cross-section state (sequential tests share it, documents-suite style)

let db = null
let documentStore = null
let anim = null
let projectId = ''
let applied = 0

// (a)/(b)
let docA = null
const keyA = uuid()
let candA1 = null
let candA2 = null
let attemptA1 = null
// (d)
let docD = null
const keyD1 = uuid()
let candD1 = null
let attemptD1 = null
// (e)
let docE = null
const keyE1 = uuid()
const keyE2 = uuid()
let proposedSlotId = ''
let attemptE1 = null
// (f)
let docF = null
const keyX = uuid()
const keyF1 = uuid()
const keyF2 = uuid()
const keyF3 = uuid()
let spanF0 = null
let spanF1 = null
let spanF2 = null
// (g)
let docG = null
const keyP = uuid()
const keyQ = uuid()
let spanG = null
let stepG1 = ''
let attemptG1 = null
// (h)
let home = ''

beforeAll(() => {
  home = makeScratchDir(path.join(os.tmpdir(), 'minimax-animation-store-'))
  db = new Database(path.join(home, 'studio.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  applied = migrateDatabase(db)
  documentStore = createDocumentStore(db, { blobRoot: path.join(home, 'canvas-blobs'), appVersion: 'test' })
  anim = createAnimationStore(db, { appVersion: 'test' })
  projectId = documentStore.createProject({ name: 'Animation round-trip' }).id
})

afterAll(() => {
  try {
    db?.close()
  } catch { /* already closed — the scratch teardown below still runs */ }
})

// Opens a second scratch studio (migrations applied, document + animation
// stores on the same handle) — the archive-import arms.
function openScratchStudio(label) {
  const scratch = makeScratchDir(path.join(os.tmpdir(), `minimax-animation-store-${label}-`))
  const handle = new Database(path.join(scratch, 'studio.db'))
  handle.pragma('journal_mode = WAL')
  handle.pragma('foreign_keys = ON')
  handle.pragma('busy_timeout = 5000')
  migrateDatabase(handle)
  return {
    home: scratch,
    db: handle,
    documents: createDocumentStore(handle, { blobRoot: path.join(scratch, 'canvas-blobs'), appVersion: 'test' }),
    animation: createAnimationStore(handle, { appVersion: 'test' }),
  }
}

// ---------------------------------------------------------------------------
// (a) migration 006
// ---------------------------------------------------------------------------
test('(a) migration 006 + 007 — tables, indexes, the append-only trigger, the continuation column', () => {
  assert.equal(migrations.length, 7, 'the migration list carries seven entries')
  assert.equal(migrations[5].id, 6)
  assert.equal(migrations[5].name, '006-animation-documents')
  assert.equal(migrations[5].up, upAnimationTables, 'migration 6 runs upAnimationTables')
  assert.equal(migrations[6].id, 7)
  assert.equal(migrations[6].name, '007-animation-continuation')
  assert.equal(migrations[6].up, upAnimationContinuation, 'migration 7 runs upAnimationContinuation')
  assert.equal(applied, 7, 'a fresh boot applies all seven migrations')
  assert.equal(Number(db.pragma('user_version', { simple: true })), 7)

  const appliedRows = db.prepare('SELECT id, name FROM schema_migrations ORDER BY id').all()
  assert.equal(appliedRows.length, 7)
  assert.deepEqual(appliedRows[5], { id: 6, name: '006-animation-documents' })
  assert.deepEqual(appliedRows[6], { id: 7, name: '007-animation-continuation' })

  // The continuation column: additive, nullable — every pre-lane row hydrates
  // as the honest absent state.
  const columns = db.prepare("SELECT name FROM pragma_table_info('animation_attempt')").all().map((row) => row.name)
  assert.ok(columns.includes('continuation_json'), 'migration 007 added continuation_json to animation_attempt')

  const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'animation%'").all().map((row) => row.name))
  for (const expected of [
    'animation_document', 'animation_attempt',
    'animation_attempt_idem', 'animation_attempt_document', 'animation_attempt_engine_job',
    'animation_attempt_append_only',
  ]) {
    assert.ok(names.has(expected), `sqlite_master carries ${expected}`)
  }
  const idemIndex = db.prepare("SELECT * FROM pragma_index_list('animation_attempt') WHERE name = 'animation_attempt_idem'").get()
  assert.equal(idemIndex?.unique, 1, 'the idempotency index is UNIQUE')

  // Live rows for the trigger + idempotency-index arms below (they ride into
  // the later sections, documents-suite style).
  docA = anim.createDocument({ projectId, name: 'Alpha', binding: makeBinding() })
  const recorded = recordAttemptSimple(anim, docA.id, 'hero', keyA, 'idem-a1', { documentRevision: 0 })
  attemptA1 = recorded.attempt

  // The idempotency UNIQUE index is schema-level: a raw duplicate insert aborts.
  assert.throws(
    () => db.prepare('INSERT INTO animation_attempt (id, document_id, tool, target_id, idempotency_key, input_hash, snapshot_json, engine_job_id, execution_json, preparation_json, result_json, own_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, 0, ?, ?)')
      .run(uuid(), docA.id, 'hero', keyA, 'idem-a1', 'other', '{}', '{"state":"queued"}', '{"state":"pending"}', Date.now(), Date.now()),
    /UNIQUE constraint failed/,
    'a second row with the same idempotency_key is refused by the index',
  )

  // Append-mostly: the frozen columns abort, the mutable ones update.
  assert.throws(
    () => db.prepare('UPDATE animation_attempt SET snapshot_json = ? WHERE id = ?').run('{"tampered":true}', attemptA1.id),
    /append-only/,
    'a snapshot_json UPDATE aborts (frozen inputs)',
  )
  assert.throws(
    () => db.prepare('UPDATE animation_attempt SET tool = ? WHERE id = ?').run('tween', attemptA1.id),
    /append-only/,
    'a tool UPDATE aborts (the target is part of the frozen inputs)',
  )
  db.prepare('UPDATE animation_attempt SET own_revision = own_revision + 1, updated_at = ? WHERE id = ?').run(Date.now(), attemptA1.id)
  assert.equal(anim.getAttempt(attemptA1.id).ownRevision, 1, 'execution/preparation/own_revision/result stay updatable')
})

// ---------------------------------------------------------------------------
// (b) CRUD + the revision gate
// ---------------------------------------------------------------------------
test('(b) create/list/get round-trip, conflict carries the current document, locks gate selection', () => {
  assert.equal(ANIMATION_SCHEMA_VERSION, 1)
  assert.equal(docA.revision, 0, 'a fresh document starts at revision 0')
  assert.equal(docA.schemaVersion, 1)
  assert.equal(docA.projectId, projectId)
  assert.equal(docA.body.keys.length, 0)
  assert.equal(docA.body.spans.length, 0)
  assert.equal(docA.body.editorial.length, 0)
  assert.equal(docA.body.bindingHistory.length, 1, 'creation binds version 1')
  assert.equal(docA.body.bindingHistory[0].version, 1)
  assert.equal(docA.body.bindingHistory[0].characterDescription, 'a lanky courier in a long coat')
  assert.equal(docA.body.activeBindingVersion, 1)
  // The operating point from docs/research/h3-keyframe-animation-assessment.md:
  // trained 1344×768, 30 steps, 24 fps (the schema constant).
  assert.deepEqual(docA.body.settings, { outputWidth: 1344, outputHeight: 768, fps: 24, steps: 30 })

  const listed = anim.listDocuments(projectId)
  assert.equal(listed.length, 1)
  assert.deepEqual(Object.keys(listed[0]).sort(), ['id', 'name', 'updatedAt'])
  assert.equal(listed[0].id, docA.id)
  assert.equal(listed[0].name, 'Alpha')

  const reread = anim.getDocument(docA.id)
  assert.deepEqual(reread, docA, 'getDocument round-trips the created row')
  assert.equal(anim.getDocument(uuid()), null, 'an unknown document reads as null')

  // Commands on a missing document are 404 rule errors; malformed ids are 400.
  assert.throws(() => anim.addKeyCandidate(uuid(), keyA, makeCandidate(), 0), (err) => err instanceof AnimationRuleError && err.status === 404)
  assert.throws(() => anim.addKeyCandidate(docA.id, 'not-a-uuid', makeCandidate(), 0), (err) => err instanceof AnimationRuleError && err.status === 400)
  assert.throws(() => anim.addKeyCandidate(docA.id, keyA, { junk: true }, 0), (err) => err instanceof AnimationRuleError && err.status === 400, 'a malformed candidate is refused')

  candA1 = makeCandidate()
  let row = anim.addKeyCandidate(docA.id, keyA, candA1, rev(docA))
  assert.equal(row.revision, 1)
  assert.equal(row.body.keys.length, 1)
  assert.equal(row.body.keys[0].id, keyA)
  assert.equal(row.body.keys[0].order, 0)
  assert.equal(row.body.keys[0].selectedCandidateId, null, 'a new slot starts unselected — selection is always explicit')
  assert.deepEqual(row.body.keys[0].candidates[0], candA1)

  candA2 = makeCandidate({ origin: 'hero', provenance: { assetId: `stable-${uuid().slice(0, 8)}`, generatingOp: attemptA1.id } })
  row = anim.addKeyCandidate(docA.id, keyA, candA2, row.revision)
  assert.equal(row.body.keys[0].candidates.length, 2, 're-rolls append alternatives, never replace')

  // The revision gate: a stale expectedRevision is a 409 carrying the CURRENT
  // document so the client can rebase and retry.
  assert.throws(
    () => anim.selectKeyCandidate(docA.id, keyA, candA2.id, 1),
    (err) =>
      err instanceof AnimationConflictError && err.status === 409
      && err.currentRevision === 2
      && err.currentDocument.id === docA.id
      && err.currentDocument.body.keys[0].candidates.length === 2,
    'a stale expectedRevision throws AnimationConflictError with the current document',
  )
  assert.equal(anim.getDocument(docA.id).revision, 2, 'the refused command bumped nothing')

  row = anim.selectKeyCandidate(docA.id, keyA, candA2.id, 2)
  assert.equal(row.revision, 3)
  assert.equal(row.body.keys[0].selectedCandidateId, candA2.id)

  // Locks are server-enforced (spec §7.2.1): a locked key's selection cannot
  // change without an explicit unlock — but adding alternatives stays legal.
  row = anim.setKeyLock(docA.id, keyA, true, row.revision)
  assert.equal(row.body.keys[0].lock, true)
  const candA3 = makeCandidate()
  row = anim.addKeyCandidate(docA.id, keyA, candA3, row.revision)
  assert.equal(row.body.keys[0].candidates.length, 3, 'a locked slot still accepts alternatives (§11.2)')
  assert.throws(
    () => anim.selectKeyCandidate(docA.id, keyA, candA1.id, row.revision),
    (err) => err instanceof AnimationRuleError && err.status === 400 && /locked/.test(err.message),
    'selecting on a locked slot is a 400',
  )
  row = anim.setKeyLock(docA.id, keyA, false, row.revision)
  row = anim.selectKeyCandidate(docA.id, keyA, candA1.id, row.revision)
  assert.equal(row.body.keys[0].selectedCandidateId, candA1.id, 'unlock then select succeeds')

  // Codex I12 — a key slot selects an IMAGE: a hero landing materializes the
  // landed CLIP as a video candidate of the proposed key (a retained
  // alternative), and selecting it would strand the timeline with a key no
  // adapter can consume. The refusal is the lock's own class — named, with
  // the review path (§5.2's frame promotion) as the way forward.
  const candVideo = makeCandidate({ assetReference: { assetId: 'clip-video-a', relPath: null, kind: 'video' }, origin: 'hero' })
  row = anim.addKeyCandidate(docA.id, keyA, candVideo, row.revision)
  assert.equal(row.body.keys[0].candidates.length, 4, 'the clip candidate joins as an alternative (§8.2: retained)')
  assert.throws(
    () => anim.selectKeyCandidate(docA.id, keyA, candVideo.id, row.revision),
    (err) => err instanceof AnimationRuleError && err.status === 400 && /A key slot selects an image; promote a frame from the clip through review/.test(err.message),
    'selecting a video candidate is a 400 naming the review path',
  )
  assert.equal(anim.getDocument(docA.id).body.keys[0].selectedCandidateId, candA1.id, 'the refused selection left the slot untouched')

  // Unknown targets are 404s, not silent no-ops.
  assert.throws(() => anim.selectKeyCandidate(docA.id, uuid(), candA1.id, row.revision), (err) => err.status === 404)
  assert.throws(() => anim.selectKeyCandidate(docA.id, keyA, uuid(), row.revision), (err) => err.status === 404)

  // The unknown-newer refusal (reused CanvasSchemaVersionError, §2/F9 idiom).
  const docV = anim.createDocument({ projectId, name: 'From the future', binding: makeBinding() })
  db.prepare('UPDATE animation_document SET schema_version = 99 WHERE id = ?').run(docV.id)
  assert.throws(
    () => anim.getDocument(docV.id),
    (err) => err.name === 'CanvasSchemaVersionError' && err.found === 99 && err.supported === ANIMATION_SCHEMA_VERSION,
    'a newer-schema document refuses loudly',
  )
  db.prepare('UPDATE animation_document SET schema_version = 1 WHERE id = ?').run(docV.id) // keep the archive arms clean
})

// ---------------------------------------------------------------------------
// (c) idempotency
// ---------------------------------------------------------------------------
test('(c) recordAttempt idempotency — same key returns the existing row, one row ever', () => {
  const first = recordAttemptSimple(anim, docA.id, 'hero', keyA, 'idem-c1', { documentRevision: anim.getDocument(docA.id).revision })
  assert.equal(first.created, true)
  assert.deepEqual(first.attempt.execution, { state: 'queued' })
  assert.deepEqual(first.attempt.preparation, { state: 'pending' })
  assert.equal(first.attempt.result, null)
  assert.equal(first.attempt.ownRevision, 0)
  assert.equal(first.attempt.engineJobId, null)

  const second = recordAttemptSimple(anim, docA.id, 'hero', keyA, 'idem-c1', { documentRevision: 99, caption: 'entirely different inputs' })
  assert.equal(second.created, false, 'the same idempotency key returns the existing attempt')
  assert.equal(second.attempt.id, first.attempt.id)

  const rows = db.prepare('SELECT COUNT(*) AS n FROM animation_attempt WHERE idempotency_key = ?').get('idem-c1')
  assert.equal(rows.n, 1, 'exactly ONE row exists for the key')

  // The stored inputHash is exposed so task 5's route can enforce the
  // same-key-different-inputs conflict (spec §11.4) — the store itself stays
  // return-existing.
  const byKey = anim.attemptByIdempotencyKey('idem-c1')
  assert.equal(byKey.inputHash, 'hash-idem-c1')
  assert.equal(byKey.id, first.attempt.id)
  assert.equal(anim.attemptByIdempotencyKey('no-such-key'), null)
  assert.deepEqual(anim.getAttempt(first.attempt.id), first.attempt)
  assert.equal(anim.getAttempt(uuid()), null)

  assert.throws(() => recordAttemptSimple(anim, uuid(), 'hero', keyA, 'idem-c2'), (err) => err.status === 404, 'recording against a missing document is a 404')
  assert.throws(
    () => anim.recordAttempt({ id: uuid(), documentId: docA.id, tool: 'magic', targetId: keyA, idempotencyKey: 'idem-c3', inputHash: 'h', snapshot: makeSnapshot() }),
    (err) => err.status === 400,
    'an unknown tool is a 400',
  )
})

// ---------------------------------------------------------------------------
// (d) duplicate landing (Review Focus #1)
// ---------------------------------------------------------------------------
test('(d) landCandidate twice ⇒ exactly one candidate in the attempt result and the document body', () => {
  docD = anim.createDocument({ projectId, name: 'Delta', binding: makeBinding() })
  candD1 = makeCandidate()
  let row = anim.addKeyCandidate(docD.id, keyD1, candD1, 0)
  attemptD1 = recordAttemptSimple(anim, docD.id, 'hero', keyD1, 'idem-d1', { documentRevision: row.revision })
  const revisionBeforeLanding = row.revision

  const landed = anim.landCandidate(attemptD1.attempt.id, {
    assetReference: { assetId: 'gen-d1', relPath: 'takes/gen-d1.mp4', kind: 'video' },
    frameCount: 22,
    earlierRevision: false,
  })
  assert.equal(landed.attempt.result.candidate.assetReference.assetId, 'gen-d1')
  assert.equal(landed.attempt.result.candidate.frameCount, 22)
  assert.equal(landed.attempt.result.candidate.earlierRevision, false, 'the document had not moved — not earlier')
  assert.equal(landed.attempt.execution.state, 'queued', 'landing never drives execution state (the completion owner does)')
  const ownRevisionAfterFirst = landed.attempt.ownRevision
  assert.ok(ownRevisionAfterFirst > 0, 'the landing advanced the attempt own revision')

  row = anim.getDocument(docD.id)
  const slot = row.body.keys.find((k) => k.id === keyD1)
  assert.equal(slot.candidates.length, 2, 'the landed hero candidate joined the slot')
  const heroCandidates = slot.candidates.filter((c) => c.origin === 'hero')
  assert.equal(heroCandidates.length, 1)
  assert.equal(heroCandidates[0].provenance.generatingOp, attemptD1.attempt.id, 'provenance names the generating attempt')
  assert.equal(slot.selectedCandidateId, null, 'landing never changes a selection — the unselected slot stays unselected')

  // The second landing — even with different bytes — is a no-op returning the
  // landed row: duplicate-completion is idempotent (spec §8.2).
  const again = anim.landCandidate(attemptD1.attempt.id, {
    assetReference: { assetId: 'gen-d1-DUPLICATE', relPath: 'takes/other.mp4', kind: 'video' },
    frameCount: 999,
    earlierRevision: false,
  })
  assert.deepEqual(again.attempt.result, landed.attempt.result, 'the FIRST candidate is what stays')
  assert.equal(again.attempt.ownRevision, ownRevisionAfterFirst, 'the no-op landing advanced nothing')
  row = anim.getDocument(docD.id)
  assert.equal(row.body.keys.find((k) => k.id === keyD1).candidates.length, 2, 'still exactly one landed candidate in the body')
  assert.equal(row.revision, revisionBeforeLanding, 'the authored revision is untouched by landing')

  assert.throws(() => anim.landCandidate(uuid(), { assetReference: { assetId: 'x', relPath: null, kind: 'image' }, frameCount: 1, earlierRevision: false }), (err) => err.status === 404)
})

// ---------------------------------------------------------------------------
// (e) landing vs authoring concurrency (Review Focus #2)
// ---------------------------------------------------------------------------
test('(e) an attempt frozen at N lands after the document moved to N+3', () => {
  docE = anim.createDocument({ projectId, name: 'Echo', binding: makeBinding() })
  const candE1 = makeCandidate()
  const candE2 = makeCandidate()
  let row = anim.addKeyCandidate(docE.id, keyE1, candE1, 0)
  row = anim.addKeyCandidate(docE.id, keyE2, candE2, row.revision)
  row = anim.selectKeyCandidate(docE.id, keyE1, candE1.id, row.revision)
  row = anim.insertSpan(docE.id, { fromKeyId: keyE1, toKeyId: keyE2, intent: { movement: 'walks left to right', preservation: 'coat hem consistent' } }, row.revision)
  const frozenAt = row.revision
  const spanE1 = row.body.spans[0]

  proposedSlotId = uuid() // a hero attempt targeting a PROPOSED (not-yet-created) key slot
  attemptE1 = recordAttemptSimple(anim, docE.id, 'hero', proposedSlotId, 'idem-e1', { documentRevision: frozenAt })

  // Three authoring commands land while the render runs: N → N+3.
  row = anim.updateDocumentSettings(docE.id, { steps: 44 }, row.revision)
  row = anim.updateSpanIntent(docE.id, spanE1.id, { movement: 'strides left to right', preservation: 'coat hem consistent' }, row.revision)
  row = anim.updateBinding(docE.id, makeBinding({ characterDescription: 'a courier, older coat' }), row.revision)
  const authoredNow = row.revision
  assert.equal(authoredNow, frozenAt + 3)

  const landed = anim.landCandidate(attemptE1.attempt.id, {
    assetReference: { assetId: 'gen-e1', relPath: 'takes/gen-e1.mp4', kind: 'video' },
    frameCount: 22,
    earlierRevision: false, // the CALLER says false; the store computes the truth
  })

  assert.equal(landed.attempt.result.candidate.earlierRevision, true, 'the frozen revision is behind — the store marks it "generated from an earlier version"')
  const after = anim.getDocument(docE.id)
  assert.equal(after.revision, authoredNow, 'landing never counts as a user edit')
  const proposed = after.body.keys.find((k) => k.id === proposedSlotId)
  assert.ok(proposed, 'the proposed slot materialized with its candidate')
  assert.equal(proposed.candidates.length, 1)
  assert.equal(proposed.candidates[0].origin, 'hero')
  assert.equal(proposed.selectedCandidateId, null, 'the landed candidate is NOT auto-selected')
  assert.equal(after.body.keys.find((k) => k.id === keyE1).selectedCandidateId, candE1.id, 'concurrent authoring changes survive the landing')
  assert.equal(after.body.keys.find((k) => k.id === keyE2).selectedCandidateId, null)
})

// ---------------------------------------------------------------------------
// (f) staleness propagation (Review Focus #4)
// ---------------------------------------------------------------------------
test('(f) binding, pose, intent, and settings changes each mark the affected spans stale; prior work remains', () => {
  docF = anim.createDocument({ projectId, name: 'Foxtrot', binding: makeBinding() })
  const cX = makeCandidate()
  const cF1 = makeCandidate()
  const cF1b = makeCandidate()
  const cF2 = makeCandidate()
  const cF3 = makeCandidate()
  let row = anim.addKeyCandidate(docF.id, keyX, cX, 0)
  row = anim.addKeyCandidate(docF.id, keyF1, cF1, row.revision)
  row = anim.addKeyCandidate(docF.id, keyF2, cF2, row.revision)
  row = anim.addKeyCandidate(docF.id, keyF3, cF3, row.revision)
  row = anim.selectKeyCandidate(docF.id, keyX, cX.id, row.revision)
  row = anim.selectKeyCandidate(docF.id, keyF1, cF1.id, row.revision)
  row = anim.selectKeyCandidate(docF.id, keyF2, cF2.id, row.revision)
  row = anim.selectKeyCandidate(docF.id, keyF3, cF3.id, row.revision)
  row = anim.insertSpan(docF.id, { fromKeyId: keyX, toKeyId: keyF1, intent: { movement: 'turns head', preservation: 'gaze steady' } }, row.revision)
  spanF0 = row.body.spans[0]
  row = anim.insertSpan(docF.id, { fromKeyId: keyF1, toKeyId: keyF2, intent: { movement: 'steps forward', preservation: 'weight centered' } }, row.revision)
  spanF1 = row.body.spans[1]
  row = anim.insertSpan(docF.id, { fromKeyId: keyF2, toKeyId: keyF3, intent: { movement: 'settles', preservation: 'shoulders level' } }, row.revision)
  spanF2 = row.body.spans[2]
  const spansOf = (r) => Object.fromEntries(r.body.spans.map((s) => [s.id, s]))

  // Fresh spans are current.
  for (const span of row.body.spans) {
    assert.equal(span.stale, false)
    assert.deepEqual(span.staleReasons, [])
  }

  // A binding change marks EVERY span stale ('binding').
  row = anim.updateBinding(docF.id, makeBinding({ characterDescription: 'a courier, patched coat' }), row.revision)
  let spans = spansOf(row)
  for (const span of [spanF0, spanF1, spanF2]) {
    assert.equal(spans[span.id].stale, true)
    assert.ok(spans[span.id].staleReasons.includes('binding'))
  }
  assert.equal(row.body.bindingHistory.length, 2, 'the binding history is append-only')
  assert.equal(row.body.bindingHistory[1].version, 2)
  assert.equal(row.body.activeBindingVersion, 2)
  assert.equal(row.body.bindingHistory[0].characterDescription, 'a lanky courier in a long coat', 'prior versions are preserved verbatim')

  // A selected-candidate (pose) swap marks the ADJACENT spans — the span the
  // key starts and the span ending into it — and nothing beyond.
  row = anim.addKeyCandidate(docF.id, keyF1, cF1b, row.revision)
  row = anim.selectKeyCandidate(docF.id, keyF1, cF1b.id, row.revision)
  spans = spansOf(row)
  assert.ok(spans[spanF0.id].staleReasons.includes('pose'), 'the span ENDING at the changed key is stale')
  assert.ok(spans[spanF1.id].staleReasons.includes('pose'), 'the span STARTING at the changed key is stale')
  assert.ok(!spans[spanF2.id].staleReasons.includes('pose'), 'a span not touching the changed key is untouched by the pose change')
  // Adding an UNSELECTED alternative never marks anything (spec §5.3).
  const beforeAdd = spansOf(anim.getDocument(docF.id))
  row = anim.addKeyCandidate(docF.id, keyF3, makeCandidate(), row.revision)
  spans = spansOf(row)
  for (const span of [spanF0, spanF1, spanF2]) {
    assert.deepEqual(spans[span.id].staleReasons, beforeAdd[span.id].staleReasons, 'an unselected alternative changes nothing')
  }

  // An intent change marks the span AND its downstream chain ('intent').
  row = anim.updateSpanIntent(docF.id, spanF1.id, { movement: 'leaps forward', preservation: 'weight centered' }, row.revision)
  spans = spansOf(row)
  assert.ok(spans[spanF1.id].staleReasons.includes('intent'))
  assert.ok(spans[spanF2.id].staleReasons.includes('intent'), 'the downstream span is stale too (the rolling chain flows through the keys)')
  assert.ok(!spans[spanF0.id].staleReasons.includes('intent'), 'the upstream span is not')

  // A settings change marks EVERY span stale ('settings').
  row = anim.updateDocumentSettings(docF.id, { steps: 48 }, row.revision)
  spans = spansOf(row)
  for (const span of [spanF0, spanF1, spanF2]) assert.ok(spans[span.id].staleReasons.includes('settings'))
  assert.equal(row.body.settings.steps, 48)
  assert.equal(row.body.settings.fps, 24, 'fps stays the schema constant')
  assert.throws(() => anim.updateDocumentSettings(docF.id, { fps: 30 }, row.revision), (err) => err.status === 400, 'fps is not a setting — it is a constant')

  // Previous takes and candidates remain (spec §8.3: stale marks, never deletes).
  const finalRow = anim.getDocument(docF.id)
  const slots = Object.fromEntries(finalRow.body.keys.map((k) => [k.id, k]))
  assert.equal(slots[keyX].candidates.length, 1)
  assert.equal(slots[keyF1].candidates.length, 2, 'the displaced selection is still an available alternative')
  assert.equal(slots[keyF1].selectedCandidateId, cF1b.id)
  assert.equal(slots[keyF2].candidates.length, 1)
  assert.equal(slots[keyF3].candidates.length, 2)
  assert.equal(finalRow.body.editorial.length, 0)
})

// ---------------------------------------------------------------------------
// (g) the three selection commands (spec §7.2.1)
// ---------------------------------------------------------------------------
test('(g) selectRollingReference sets the step slot pointer and never creates a key; selectClipContribution upserts editorial', () => {
  docG = anim.createDocument({ projectId, name: 'Golf', binding: makeBinding() })
  const cP = makeCandidate()
  const cQ = makeCandidate()
  let row = anim.addKeyCandidate(docG.id, keyP, cP, 0)
  row = anim.addKeyCandidate(docG.id, keyQ, cQ, row.revision)
  row = anim.selectKeyCandidate(docG.id, keyP, cP.id, row.revision)
  row = anim.selectKeyCandidate(docG.id, keyQ, cQ.id, row.revision)
  row = anim.insertSpan(docG.id, { fromKeyId: keyP, toKeyId: keyQ, intent: { movement: 'walks two steps', preservation: 'silhouette intact' } }, row.revision)
  spanG = row.body.spans[0]
  assert.equal(spanG.stepSlots.length, 1, 'a new span carries its first step slot (the tween chain starts there)')
  stepG1 = spanG.stepSlots[0].id
  assert.deepEqual(spanG.stepSlots[0].attempts, [])
  assert.equal(spanG.stepSlots[0].selectedRollingReference, null)

  // A tween attempt against the step slot: landing attaches it to the slot.
  attemptG1 = recordAttemptSimple(anim, docG.id, 'tween', stepG1, 'idem-g1', { documentRevision: row.revision })
  const landed = anim.landCandidate(attemptG1.attempt.id, {
    assetReference: { assetId: 'clip-g1', relPath: 'takes/clip-g1.mp4', kind: 'video' },
    frameCount: 22,
    earlierRevision: false,
  })
  assert.equal(landed.attempt.result.candidate.frameCount, 22)
  row = anim.getDocument(docG.id)
  spanG = row.body.spans[0]
  assert.deepEqual(spanG.stepSlots[0].attempts, [attemptG1.attempt.id], 'the landed tween attempt joined its step slot')
  assert.equal(row.body.keys.length, 2, 'a tween landing never creates a key')

  // Command 2 — selectRollingReference: the step slot's pointer, nothing
  // else. The pointer records the frame's OWN extracted image (Codex I11 —
  // the route resolves it through the §7.2.2 seam; the store test supplies
  // the asset directly, the store's contract being to record what it is
  // handed).
  const frameAssetG = { assetId: 'canvas-blobs/ea/frame-g1-11.png', relPath: 'canvas-blobs/ea/frame-g1-11.png', kind: 'image' }
  row = anim.selectRollingReference(docG.id, spanG.id, attemptG1.attempt.id, 11, frameAssetG, row.revision)
  spanG = row.body.spans[0]
  assert.deepEqual(spanG.stepSlots[0].selectedRollingReference, { attemptId: attemptG1.attempt.id, frameIndex: 11, poseDescription: null, facing: null, frameAsset: frameAssetG })
  assert.equal(row.body.keys.length, 2, 'selecting a rolling reference never creates a key')
  assert.equal(row.body.keys.find((k) => k.id === keyP).selectedCandidateId, cP.id)
  assert.equal(row.body.keys.find((k) => k.id === keyQ).selectedCandidateId, cQ.id)
  assert.equal(row.body.editorial.length, 0, 'rolling-reference selection is separate from editorial (§11.2)')
  assert.equal(spanG.stale, true, 'the re-selected near reference makes the later steps of the span outdated')
  assert.ok(spanG.staleReasons.includes('pose'), 'the rolling-reference change rides the pose reason (§6.4: the reference state carries the pose)')

  assert.throws(() => anim.selectRollingReference(docG.id, spanG.id, attemptG1.attempt.id, -1, frameAssetG, row.revision), (err) => err.status === 400, 'a negative frame index is a 400')
  assert.throws(() => anim.selectRollingReference(docG.id, spanG.id, uuid(), 3, frameAssetG, row.revision), (err) => err.status === 404, 'an attempt not attached to the span is a 404')

  // Command 3 — selectClipContribution: the editorial list, upserted per
  // (span, attempt); assembly timing never marks anything stale (§9).
  row = anim.selectClipContribution(docG.id, spanG.id, attemptG1.attempt.id, 0, 18, 4, row.revision)
  assert.equal(row.body.editorial.length, 1)
  assert.deepEqual(
    row.body.editorial[0],
    { id: row.body.editorial[0].id, spanId: spanG.id, attemptId: attemptG1.attempt.id, inFrame: 0, outFrame: 18, holdDuration: 4 },
  )
  const editorialId = row.body.editorial[0].id
  const staleBefore = row.body.spans[0].staleReasons.slice()

  row = anim.selectClipContribution(docG.id, spanG.id, attemptG1.attempt.id, 2, 12, 6, row.revision)
  assert.equal(row.body.editorial.length, 1, 're-choosing the same span+attempt UPDATES, never duplicates')
  assert.equal(row.body.editorial[0].id, editorialId)
  assert.deepEqual(
    { inFrame: row.body.editorial[0].inFrame, outFrame: row.body.editorial[0].outFrame, holdDuration: row.body.editorial[0].holdDuration },
    { inFrame: 2, outFrame: 12, holdDuration: 6 },
  )
  assert.deepEqual(row.body.spans[0].staleReasons, staleBefore, 'editorial timing marks nothing stale — it is an assembly decision')
  assert.equal(row.body.keys.length, 2, 'editorial selection never creates a key')

  assert.throws(() => anim.selectClipContribution(docG.id, uuid(), attemptG1.attempt.id, 0, 18, 4, row.revision), (err) => err.status === 404)
  assert.throws(() => anim.selectClipContribution(docG.id, spanG.id, attemptG1.attempt.id, -1, 18, 4, row.revision), (err) => err.status === 400)

  // A dangling attemptId is the same refusal class as selectRollingReference
  // (review Important-1): the attempt must be a REAL row of THIS document and
  // attached to THIS span — otherwise the editorial entry references a clip
  // whose row never rides this project's export.
  assert.throws(
    () => anim.selectClipContribution(docG.id, spanG.id, uuid(), 0, 18, 4, row.revision),
    (err) => err.status === 404 && /not an attempt of this document/.test(err.message),
    'a fabricated attemptId (no row) is a 404',
  )
  assert.throws(
    () => anim.selectClipContribution(docG.id, spanG.id, attemptE1.attempt.id, 0, 18, 4, row.revision),
    (err) => err.status === 404 && /not an attempt of this document/.test(err.message),
    'an attempt belonging to a DIFFERENT document is a 404 (its row would never ride this project export)',
  )
  // A real attempt of this document, but attached to a different span.
  row = anim.insertSpan(docG.id, { fromKeyId: keyQ, toKeyId: keyP, intent: { movement: 'returns', preservation: 'silhouette intact' } }, row.revision)
  const spanG2 = row.body.spans[1]
  const stepG2 = spanG2.stepSlots[0].id
  const attemptG2 = recordAttemptSimple(anim, docG.id, 'tween', stepG2, 'idem-g2', { documentRevision: row.revision })
  anim.landCandidate(attemptG2.attempt.id, { assetReference: { assetId: 'clip-g2', relPath: null, kind: 'video' }, frameCount: 22, earlierRevision: false })
  assert.equal(anim.getDocument(docG.id).body.spans[1].stepSlots[0].attempts.length, 1, 'the second tween attempt attached to the second span')
  assert.throws(
    () => anim.selectClipContribution(docG.id, spanG.id, attemptG2.attempt.id, 0, 18, 4, anim.getDocument(docG.id).revision),
    (err) => err.status === 404 && /not attached to span/.test(err.message),
    'a same-document attempt attached to a DIFFERENT span is a 404',
  )
  assert.equal(anim.getDocument(docG.id).body.editorial.length, 1, 'every refused contribution left the editorial list untouched')
})

// ---------------------------------------------------------------------------
// (g2) task 13 — the editorial list's own commands: the SPANLESS lane (a
//      sequence window's clip contributes with no span, §11.2), the reorder
//      (the ordered list IS the assembled sequence's order, §9), and remove.
//      Its OWN document, so the archive counts in (h) never shift.
// ---------------------------------------------------------------------------
test('(g2) the spanless sequence lane, reorderEditorial, and removeContribution (task 13)', () => {
  // Its OWN project too — (h) pins the archive counts of `projectId` below.
  const docI = anim.createDocument({ projectId: `${projectId}-editorial`, name: 'India', binding: makeBinding() })
  const keyI1 = uuid()
  const keyI2 = uuid()
  let row = anim.addKeyCandidate(docI.id, keyI1, makeCandidate(), 0)
  row = anim.addKeyCandidate(docI.id, keyI2, makeCandidate(), row.revision)
  row = anim.selectKeyCandidate(docI.id, keyI1, row.body.keys.find((entry) => entry.id === keyI1).candidates[0].id, row.revision)
  row = anim.selectKeyCandidate(docI.id, keyI2, row.body.keys.find((entry) => entry.id === keyI2).candidates[0].id, row.revision)
  row = anim.insertSpan(docI.id, { fromKeyId: keyI1, toKeyId: keyI2, intent: { movement: 'walks two steps', preservation: 'silhouette intact' } }, row.revision)
  const spanI = row.body.spans[0]
  const stepI = spanI.stepSlots[0].id

  // A landed tween take on the span (the (g) shape, fresh): the TWEEN lane.
  const tweenI = recordAttemptSimple(anim, docI.id, 'tween', stepI, 'idem-i-tween', { documentRevision: row.revision })
  anim.landCandidate(tweenI.attempt.id, {
    assetReference: { assetId: 'clip-i-tween', relPath: 'takes/clip-i-tween.mp4', kind: 'video' },
    frameCount: 22,
    earlierRevision: false,
  })
  row = anim.selectClipContribution(docI.id, spanI.id, tweenI.attempt.id, 0, 18, 4, row.revision)
  assert.equal(row.body.editorial.length, 1, 'the tween lane contributes through its span')

  // A landed SEQUENCE window take (targetId = the window start key): its
  // clip contributes with NO span — a sequence attempt owns no span and no
  // step slot ever holds it.
  const seqI = recordAttemptSimple(anim, docI.id, 'sequence', keyI1, 'idem-i-seq', { documentRevision: row.revision })
  anim.landCandidate(seqI.attempt.id, {
    assetReference: { assetId: 'clip-i-seq', relPath: 'takes/clip-i-seq.mp4', kind: 'video' },
    frameCount: 22,
    earlierRevision: false,
  })
  row = anim.selectClipContribution(docI.id, null, seqI.attempt.id, 0, 16, 8, row.revision)
  assert.equal(row.body.editorial.length, 2)
  const spanless = row.body.editorial[1]
  assert.equal(spanless.spanId, null, 'the whole-scene lane carries spanId null')
  assert.equal(spanless.attemptId, seqI.attempt.id)
  assert.deepEqual(
    { inFrame: spanless.inFrame, outFrame: spanless.outFrame, holdDuration: spanless.holdDuration },
    { inFrame: 0, outFrame: 16, holdDuration: 8 },
  )
  // Re-choosing the portion UPDATES the same row (id stable) — the (span,
  // attempt) upsert rule with null === null.
  row = anim.selectClipContribution(docI.id, null, seqI.attempt.id, 2, 10, 4, row.revision)
  assert.equal(row.body.editorial.length, 2, 'never a duplicate')
  assert.equal(row.body.editorial[1].id, spanless.id)
  assert.equal(row.body.editorial[1].inFrame, 2)

  // The lane refusals, each named:
  // a TWEEN attempt cannot ride the spanless lane — its clip belongs to a span.
  assert.throws(
    () => anim.selectClipContribution(docI.id, null, tweenI.attempt.id, 0, 4, 0, row.revision),
    (err) => err.status === 400 && /through its span/.test(err.message),
    'a tween clip with no span named is a 400',
  )
  // a HERO attempt's product is a key drawing, not a sequence contribution.
  const heroI = recordAttemptSimple(anim, docI.id, 'hero', uuid(), 'idem-i-hero', { documentRevision: row.revision })
  anim.landCandidate(heroI.attempt.id, {
    assetReference: { assetId: 'clip-i-hero', relPath: null, kind: 'video' },
    frameCount: 22,
    earlierRevision: false,
  })
  assert.throws(
    () => anim.selectClipContribution(docI.id, null, heroI.attempt.id, 0, 4, 0, row.revision),
    (err) => err.status === 400 && /hero/i.test(err.message),
    'a hero clip is a 400 on the spanless lane',
  )
  // a SEQUENCE attempt named WITH a span is not attached to any step slot.
  assert.throws(
    () => anim.selectClipContribution(docI.id, spanI.id, seqI.attempt.id, 0, 4, 0, row.revision),
    (err) => err.status === 404,
    'a sequence attempt pinned to a span is a 404 (not attached)',
  )
  // a bogus spanId value is a shape refusal.
  assert.throws(
    () => anim.selectClipContribution(docI.id, 'not-a-uuid', seqI.attempt.id, 0, 4, 0, row.revision),
    (err) => err.status === 400,
    'a non-UUID, non-null spanId is a 400',
  )
  assert.equal(anim.getDocument(docI.id).body.editorial.length, 2, 'every refusal left the list untouched')

  // REORDER — the ordered list is the assembled sequence's order (§9): a
  // PERMUTATION of the whole list, nothing less.
  const [tweenEntry, spanlessEntry] = anim.getDocument(docI.id).body.editorial
  row = anim.reorderEditorial(docI.id, [spanlessEntry.id, tweenEntry.id], anim.getDocument(docI.id).revision)
  assert.deepEqual(row.body.editorial.map((entry) => entry.id), [spanlessEntry.id, tweenEntry.id], 'the list reorders wholesale')
  assert.deepEqual(row.body.editorial[0], spanlessEntry, 'reorder moves ROWS, it never rewrites them')
  assert.deepEqual(row.body.editorial[1], tweenEntry)
  assert.throws(() => anim.reorderEditorial(docI.id, [tweenEntry.id], row.revision), (err) => err.status === 400, 'a partial list is a 400')
  assert.throws(
    () => anim.reorderEditorial(docI.id, [tweenEntry.id, tweenEntry.id, spanlessEntry.id], row.revision),
    (err) => err.status === 400,
    'a duplicate in the list is a 400',
  )
  assert.throws(
    () => anim.reorderEditorial(docI.id, [tweenEntry.id, uuid()], row.revision),
    (err) => err.status === 400,
    'a foreign id in the list is a 400',
  )
  assert.throws(() => anim.reorderEditorial(docI.id, 'nope', row.revision), (err) => err.status === 400, 'a non-array is a 400')

  // Span removal still drops ONLY its own entries — the spanless lane
  // survives (a window is not a span; editorial timing belongs to its
  // source, and this entry's source is the window take).
  row = anim.removeSpan(docI.id, spanI.id, row.revision)
  assert.equal(row.body.editorial.length, 1, 'the span-named entry left with its span')
  assert.equal(row.body.editorial[0].id, spanlessEntry.id, 'the spanless entry survived')

  // REMOVE — the list is editable; a missing id is a 404.
  row = anim.removeContribution(docI.id, spanlessEntry.id, row.revision)
  assert.equal(row.body.editorial.length, 0)
  assert.throws(() => anim.removeContribution(docI.id, uuid(), row.revision), (err) => err.status === 404, 'removing a foreign id is a 404')
})

// ---------------------------------------------------------------------------
// (g3) wave 2a — the rolling-reference annotation (§6.4's
//      inspectable-and-correctable ruling): one {poseDescription, facing}
//      riding the step slot's selection pointer, revision-gated and
//      transactional like every authoring command, staleness-propagating
//      with the 'pose' reason, and bound to a LIVE selection.
// ---------------------------------------------------------------------------

test('(g3) annotateRollingReference — transactional, pointer-bound, pose-stale; selection reset clears', () => {
  docG = anim.createDocument({ projectId, name: 'Golf-annotation', binding: makeBinding() })
  const cP = makeCandidate()
  const cQ = makeCandidate()
  let row = anim.addKeyCandidate(docG.id, keyP, cP, 0)
  row = anim.addKeyCandidate(docG.id, keyQ, cQ, row.revision)
  row = anim.selectKeyCandidate(docG.id, keyP, cP.id, row.revision)
  row = anim.selectKeyCandidate(docG.id, keyQ, cQ.id, row.revision)
  row = anim.insertSpan(docG.id, { fromKeyId: keyP, toKeyId: keyQ, intent: { movement: 'walks two steps', preservation: 'silhouette intact' } }, row.revision)
  const span = row.body.spans[0]
  const step = span.stepSlots[0].id

  // Two landed takes on the slot — the annotation's subject and the reset's.
  const takeOne = recordAttemptSimple(anim, docG.id, 'tween', step, 'idem-g3-a', { documentRevision: row.revision })
  anim.landCandidate(takeOne.attempt.id, { assetReference: { assetId: 'clip-g3-a', relPath: 'takes/clip-g3-a.mp4', kind: 'video' }, frameCount: 22, earlierRevision: false })
  const takeTwo = recordAttemptSimple(anim, docG.id, 'tween', step, 'idem-g3-b', { documentRevision: row.revision })
  anim.landCandidate(takeTwo.attempt.id, { assetReference: { assetId: 'clip-g3-b', relPath: null, kind: 'video' }, frameCount: 22, earlierRevision: false })
  row = anim.getDocument(docG.id)

  // No pointer yet: the annotation is bound to a LIVE selection — a 400.
  assert.throws(
    () => anim.annotateRollingReference(docG.id, span.id, step, { poseDescription: 'weight forward', facing: 'screen-left' }, row.revision),
    (err) => err instanceof AnimationRuleError && err.status === 400 && /no selected rolling reference/.test(err.message),
    'annotating a slot with no selection is a state refusal',
  )

  // Select, then annotate in place — correctable, exactly as the ruling says.
  const frameAssetOne = { assetId: 'canvas-blobs/1f/frame-g3-11.png', relPath: 'canvas-blobs/1f/frame-g3-11.png', kind: 'image' }
  const frameAssetTwo = { assetId: 'canvas-blobs/2f/frame-g3-3.png', relPath: 'canvas-blobs/2f/frame-g3-3.png', kind: 'image' }
  row = anim.selectRollingReference(docG.id, span.id, takeOne.attempt.id, 11, frameAssetOne, row.revision)
  row = anim.annotateRollingReference(docG.id, span.id, step, { poseDescription: 'weight forward over the planted left foot', facing: 'screen-left' }, row.revision)
  assert.deepEqual(
    row.body.spans[0].stepSlots[0].selectedRollingReference,
    { attemptId: takeOne.attempt.id, frameIndex: 11, poseDescription: 'weight forward over the planted left foot', facing: 'screen-left', frameAsset: frameAssetOne },
    'the annotation rides the selection pointer',
  )
  assert.equal(row.body.spans[0].stale, true, 'the annotation marks the span stale')
  assert.ok(row.body.spans[0].staleReasons.includes('pose'), 'with the pose reason — the same class as a key-candidate pose change')
  // The command's own book: the revision gate held (one bump), and nothing
  // outside the pointer moved — no keys, candidates, selections, or attempts.
  assert.equal(row.revision, anim.getDocument(docG.id).revision)
  assert.equal(row.body.keys.length, 2)
  assert.equal(row.body.keys.find((k) => k.id === keyP).candidates.length, 1)
  assert.equal(row.body.keys.find((k) => k.id === keyP).selectedCandidateId, cP.id)
  assert.deepEqual(row.body.spans[0].stepSlots[0].attempts, [takeOne.attempt.id, takeTwo.attempt.id], 'the landed takes are untouched (§8.3)')

  // Correctable in place: a second annotation UPDATES, and clearing works.
  row = anim.annotateRollingReference(docG.id, span.id, step, { poseDescription: null, facing: 'back to camera' }, row.revision)
  assert.deepEqual(
    row.body.spans[0].stepSlots[0].selectedRollingReference,
    { attemptId: takeOne.attempt.id, frameIndex: 11, poseDescription: null, facing: 'back to camera', frameAsset: frameAssetOne },
    'a re-annotation corrects in place (null clears the pose; the frame asset rides untouched)',
  )

  // A NO-OP annotation (the pointer already carries these values — the fix
  // round's M-1): a genuine no-op — no revision bump, no stale mark, the row
  // returned as it stands (§5.3 reserves marks for actual changes).
  const revisionBeforeNoop = row.revision
  const reasonsBeforeNoop = row.body.spans[0].staleReasons.slice()
  row = anim.annotateRollingReference(docG.id, span.id, step, { poseDescription: null, facing: 'back to camera' }, row.revision)
  assert.equal(row.revision, revisionBeforeNoop, 'a no-op annotation bumps no revision')
  assert.deepEqual(row.body.spans[0].staleReasons, reasonsBeforeNoop, 'and marks nothing stale')
  assert.equal(row.body.spans[0].stepSlots[0].selectedRollingReference.facing, 'back to camera', 'the annotation is unchanged')

  // The transactional gate: a stale expectedRevision loses to the current row.
  assert.throws(
    () => anim.annotateRollingReference(docG.id, span.id, step, { poseDescription: 'stale write', facing: null }, row.revision - 1),
    (err) => err instanceof AnimationConflictError && err.currentRevision === row.revision,
    'a stale expectedRevision is a conflict carrying the current document',
  )
  assert.equal(
    anim.getDocument(docG.id).body.spans[0].stepSlots[0].selectedRollingReference.poseDescription,
    null,
    'the refused write persisted nothing',
  )

  // Refusals with their statuses: a missing span/slot is a 404; a facing
  // outside the vocabulary and a non-string pose are 400s.
  assert.throws(() => anim.annotateRollingReference(docG.id, uuid(), step, { poseDescription: null, facing: null }, row.revision), (err) => err.status === 404, 'an unknown span is a 404')
  assert.throws(() => anim.annotateRollingReference(docG.id, span.id, uuid(), { poseDescription: null, facing: null }, row.revision), (err) => err.status === 404, 'an unknown step slot is a 404')
  assert.throws(() => anim.annotateRollingReference(docG.id, span.id, step, { poseDescription: null, facing: 'leftward' }, row.revision), (err) => err.status === 400, 'a non-vocabulary facing is a 400')
  assert.throws(() => anim.annotateRollingReference(docG.id, span.id, step, { poseDescription: 7, facing: null }, row.revision), (err) => err.status === 400, 'a non-string pose is a 400')

  // The selection reset: re-selecting the SAME frame keeps the authored
  // annotation (an idempotent re-click must not destroy authored work) and
  // is itself a GENUINE no-op — no bump, no mark (the fix round's M-1)…
  const revisionBeforeReselect = row.revision
  row = anim.selectRollingReference(docG.id, span.id, takeOne.attempt.id, 11, frameAssetOne, row.revision)
  assert.equal(row.body.spans[0].stepSlots[0].selectedRollingReference.facing, 'back to camera', 'the same-pointer re-select keeps the annotation')
  assert.equal(row.revision, revisionBeforeReselect, 'an idempotent same-frame re-select bumps no revision')
  // …while selecting a DIFFERENT rolling reference starts unannotated — the
  // new frame's pose is unknown until authored (and its pointer records the
  // NEW frame's own asset, Codex I11).
  row = anim.selectRollingReference(docG.id, span.id, takeTwo.attempt.id, 3, frameAssetTwo, row.revision)
  assert.deepEqual(
    row.body.spans[0].stepSlots[0].selectedRollingReference,
    { attemptId: takeTwo.attempt.id, frameIndex: 3, poseDescription: null, facing: null, frameAsset: frameAssetTwo },
    'a different rolling reference resets the annotation to nulls and records the new frame asset',
  )
})

// ---------------------------------------------------------------------------
// (g4) Codex batch C, I11 — the pointer's frameAsset book: a same-frame
//      re-select is a no-op only once the asset stands; a PRE-widening
//      pointer (frameAsset null — rows the older build wrote, hydrated to
//      null on every read) takes the BACKFILL: the resolved image records,
//      exactly one revision bump, nothing marked stale (the reference did
//      not change), the annotation riding untouched. Its OWN project — (h)
//      pins the archive counts of `projectId` below.
// ---------------------------------------------------------------------------
test('(g4) a pre-widening pointer takes the frameAsset backfill — one bump, no stale mark; the asset-carried no-op stands', () => {
  docG = anim.createDocument({ projectId: `${projectId}-frame-asset`, name: 'Golf-frame-asset', binding: makeBinding() })
  const cP = makeCandidate()
  const cQ = makeCandidate()
  let row = anim.addKeyCandidate(docG.id, keyP, cP, 0)
  row = anim.addKeyCandidate(docG.id, keyQ, cQ, row.revision)
  row = anim.selectKeyCandidate(docG.id, keyP, cP.id, row.revision)
  row = anim.selectKeyCandidate(docG.id, keyQ, cQ.id, row.revision)
  row = anim.insertSpan(docG.id, { fromKeyId: keyP, toKeyId: keyQ, intent: { movement: 'walks two steps', preservation: 'silhouette intact' } }, row.revision)
  const span = row.body.spans[0]
  const step = span.stepSlots[0].id
  const take = recordAttemptSimple(anim, docG.id, 'tween', step, 'idem-g4-a', { documentRevision: row.revision })
  anim.landCandidate(take.attempt.id, { assetReference: { assetId: 'clip-g4', relPath: 'takes/clip-g4.mp4', kind: 'video' }, frameCount: 22, earlierRevision: false })
  row = anim.getDocument(docG.id)

  // The legacy shape, authored exactly as the pre-I11 build wrote it: a
  // pointer with NO frameAsset (hydration reads the absent field as null).
  const legacyAsset = { assetId: 'canvas-blobs/0f/frame-g4-4.png', relPath: 'canvas-blobs/0f/frame-g4-4.png', kind: 'image' }
  const legacyBody = JSON.parse(JSON.stringify(row.body))
  legacyBody.spans[0].stepSlots[0].selectedRollingReference = { attemptId: take.attempt.id, frameIndex: 4, poseDescription: 'arms folded', facing: null }
  db.prepare('UPDATE animation_document SET body_json = ?, authored_revision = authored_revision + 1 WHERE id = ?').run(JSON.stringify(legacyBody), docG.id)
  row = anim.getDocument(docG.id)
  assert.equal(row.body.spans[0].stepSlots[0].selectedRollingReference.frameAsset, null, 'the surgically-authored legacy pointer hydrates with no frame asset')

  // The BACKFILL: the same frame re-selected now records the resolved image —
  // one revision bump, the annotation untouched, and NO new stale mark (the
  // stale reasons stand exactly as the legacy write left them).
  const reasonsBefore = row.body.spans[0].staleReasons.slice()
  const staleBefore = row.body.spans[0].stale
  row = anim.selectRollingReference(docG.id, span.id, take.attempt.id, 4, legacyAsset, row.revision)
  assert.deepEqual(
    row.body.spans[0].stepSlots[0].selectedRollingReference,
    { attemptId: take.attempt.id, frameIndex: 4, poseDescription: 'arms folded', facing: null, frameAsset: legacyAsset },
    'the backfill records the frame asset over the legacy pointer',
  )
  assert.equal(row.revision, anim.getDocument(docG.id).revision, 'the backfill is a real write (one bump)')
  assert.deepEqual(row.body.spans[0].staleReasons, reasonsBefore, 'the backfill marks nothing stale — the reference did not change')
  assert.equal(row.body.spans[0].stale, staleBefore, 'the stale flag stands where the legacy write left it')

  // With the asset standing, the same-frame re-select is the GENUINE no-op
  // again (the fix round's M-1 semantics — no bump, no write).
  const revisionAfterBackfill = row.revision
  row = anim.selectRollingReference(docG.id, span.id, take.attempt.id, 4, legacyAsset, row.revision)
  assert.equal(row.revision, revisionAfterBackfill, 'an assetd same-frame re-select bumps no revision')
  assert.equal(row.body.spans[0].stepSlots[0].selectedRollingReference.frameAsset.assetId, legacyAsset.assetId, 'the pointer is unchanged')
})


// ---------------------------------------------------------------------------
// (h) the project-archive round-trip (spec §11.3 scope: ordinary project
//     preservation must include the animation records + referenced blobs)
// ---------------------------------------------------------------------------
test('(h) project archive round-trips animation documents, attempts, and referenced blobs', async () => {
  // One registered blob referenced from the body (a candidate), the frozen
  // snapshot, AND the landed result — the three walks export must cover.
  const refBytes = Buffer.from(`animation-reference-${uuid()}`)
  const refFile = path.join(home, `ref-${uuid().slice(0, 8)}.png`)
  fs.writeFileSync(refFile, refBytes)
  const registered = documentStore.registerBlobFile('image', refFile)
  assert.ok(registered.present)

  const doc = anim.createDocument({ projectId, name: 'Hotel', binding: makeBinding() })
  const keyH1 = uuid()
  const keyH2 = uuid()
  let row = anim.addKeyCandidate(doc.id, keyH1, makeCandidate({ relPath: registered.relPath }), 0)
  row = anim.addKeyCandidate(doc.id, keyH2, makeCandidate(), row.revision)
  row = anim.selectKeyCandidate(doc.id, keyH1, row.body.keys[0].candidates[0].id, row.revision)
  row = anim.insertSpan(doc.id, { fromKeyId: keyH1, toKeyId: keyH2, intent: { movement: 'turns to leave', preservation: 'silhouette intact' } }, row.revision)
  const attemptH = recordAttemptSimple(anim, doc.id, 'sequence', keyH1, 'idem-h1', {
    documentRevision: row.revision,
    references: [
      { role: 'window-start', assetReference: { assetId: 'w1', relPath: registered.relPath, kind: 'image' }, poseDescription: null, facing: null },
      { role: 'window-end', assetReference: { assetId: 'w2', relPath: registered.relPath, kind: 'image' }, poseDescription: null, facing: null },
    ],
  })
  const landed = anim.landCandidate(attemptH.attempt.id, {
    assetReference: { assetId: 'seq-h1', relPath: registered.relPath, kind: 'video' },
    frameCount: 22,
    earlierRevision: false,
  })
  assert.ok(landed.attempt.result, 'the sequence landing persists its result (clips surface through editorial selection)')

  const { archive, manifest } = exportProjectArchive(documentStore, projectId)
  assert.equal(manifest.counts.animationDocuments, 8, 'all eight authored documents ride the archive (g3 added the annotation document)')
  assert.equal(manifest.counts.animationAttempts, 9, 'all nine attempts ride the archive (g3 added two tween takes)')
  assert.ok(manifest.blobs.some((b) => b.path === registered.relPath && b.hash === registered.hash), 'the referenced blob rides the archive')
  // The four fabricated engine-output relPaths (gen-d1/gen-e1/clip-g1/clip-g3-a)
  // were never registered as blobs — the archive records them as VISIBLE
  // missing entries (the §7 idiom: never a silent omission while counts claim
  // full coverage). In production the completion owner registers real outputs
  // before landing (task 4). The two frame-asset paths join them since I11:
  // (g)/(g3) hand the store fabricated extraction relPaths (the route's real
  // resolution registers the PNG before the pointer ever carries it).
  assert.deepEqual(
    manifest.missingBlobs.map((b) => b.path).sort(),
    ['canvas-blobs/2f/frame-g3-3.png', 'canvas-blobs/ea/frame-g1-11.png', 'takes/clip-g1.mp4', 'takes/clip-g3-a.mp4', 'takes/gen-d1.mp4', 'takes/gen-e1.mp4'],
    'unregistered referenced paths are visible, never silently dropped',
  )

  // Import into a second studio (fresh home + db + stores).
  const second = openScratchStudio('import')
  const report = importProjectArchive(second.documents, archive)
  assert.equal(report.projectId, projectId)
  assert.deepEqual(second.animation.getDocument(doc.id), anim.getDocument(doc.id), 'the animation document round-trips byte-equal (body, revision, schema version)')
  assert.deepEqual(second.animation.getAttempt(attemptH.attempt.id), anim.getAttempt(attemptH.attempt.id), 'the attempt round-trips (snapshot, execution, result)')
  assert.equal(second.animation.attemptByIdempotencyKey('idem-h1').id, attemptH.attempt.id, 'the idempotency index survives the import')
  const bytes = second.documents.readBlob(registered.relPath)
  assert.ok(bytes && bytes.equals(refBytes), 'the referenced blob bytes round-trip content-addressed')

  // Id collisions refuse loudly (the existing archive idiom).
  assert.throws(() => importProjectArchive(second.documents, archive), /already exists/, 're-importing the same project refuses')

  // A newer animation schema version riding an archive refuses loudly too.
  const futureHome = makeScratchDir(path.join(os.tmpdir(), 'minimax-animation-store-future-'))
  const futureDbFile = path.join(futureHome, 'studio.db')
  await db.backup(futureDbFile)
  const futureDb = new Database(futureDbFile)
  futureDb.pragma('foreign_keys = ON')
  futureDb.prepare('UPDATE animation_document SET schema_version = 99 WHERE id = ?').run(doc.id)
  const future = exportProjectArchive(createDocumentStore(futureDb, { blobRoot: path.join(futureHome, 'canvas-blobs'), appVersion: 'test' }), projectId)
  const target = openScratchStudio('future-import')
  assert.throws(
    () => importProjectArchive(target.documents, future.archive),
    (err) => err.name === 'CanvasSchemaVersionError',
    'an archive from a studio with newer animation documents refuses loudly',
  )
})

// ---------------------------------------------------------------------------
// (i) appendStepSlot — the tween chain's advancement surface (the foundation
//     contract review's F1: without it the rolling chain is capped at one
//     step per span)
// ---------------------------------------------------------------------------

test('(i) appendStepSlot grows a span one empty slot per command; the revision gate and 404s hold', () => {
  const doc = anim.createDocument({ projectId, name: 'India', binding: makeBinding() })
  const key1 = uuid()
  const key2 = uuid()
  let row = anim.addKeyCandidate(doc.id, key1, makeCandidate(), 0)
  row = anim.addKeyCandidate(doc.id, key2, makeCandidate(), row.revision)
  row = anim.selectKeyCandidate(doc.id, key1, row.body.keys[0].candidates[0].id, row.revision)
  row = anim.selectKeyCandidate(doc.id, key2, row.body.keys[1].candidates[0].id, row.revision)
  row = anim.insertSpan(doc.id, { fromKeyId: key1, toKeyId: key2, intent: { movement: 'walks two steps', preservation: 'silhouette intact' } }, row.revision)
  const spanId = row.body.spans[0].id
  const seeded = row.body.spans[0].stepSlots[0]
  assert.equal(row.body.spans[0].stepSlots.length, 1, 'insertSpan seeds exactly one slot')

  // One append: a second EMPTY slot, one revision forward.
  const appended = anim.appendStepSlot(doc.id, spanId, row.revision)
  assert.equal(appended.revision, row.revision + 1, 'the append is one authoring command')
  const grown = appended.body.spans.find((entry) => entry.id === spanId)
  assert.equal(grown.stepSlots.length, 2, 'the span now carries two step slots')
  const second = grown.stepSlots[1]
  assert.notEqual(second.id, seeded.id)
  assert.deepEqual(second, { id: second.id, attempts: [], selectedRollingReference: null }, 'the appended slot is empty — the chain’s next step submits against it')
  assert.deepEqual(grown.stepSlots[0], seeded, 'the seeded slot is untouched')
  assert.equal(grown.stale, false, 'an empty slot consumes no reference state — nothing goes stale (§6.4)')
  assert.deepEqual(grown.staleReasons, [])

  // The chain keeps rolling; every command rides the same gate.
  const again = anim.appendStepSlot(doc.id, spanId, appended.revision)
  assert.equal(again.body.spans.find((entry) => entry.id === spanId).stepSlots.length, 3)
  assert.throws(
    () => anim.appendStepSlot(doc.id, spanId, appended.revision),
    (err) => err instanceof AnimationConflictError && err.currentRevision === again.revision,
    'a stale expectedRevision conflicts carrying the current document',
  )
  assert.throws(() => anim.appendStepSlot(doc.id, uuid(), again.revision), (err) => err.status === 404, 'an unknown span is a 404')
  assert.throws(() => anim.appendStepSlot(doc.id, 'not-a-uuid', again.revision), (err) => err.status === 400, 'a malformed span id is a 400')
})

// ---------------------------------------------------------------------------
// (j) the continuation column (extension lane Task 2, spec 2026-10-08 §7/§8)
//     — setAttemptContinuation's validation + round-trip, landedAttempts (the
//     boot sweep's registration-resume read), and the project archive riding
//     the registered carry blob.
// ---------------------------------------------------------------------------

test('(j) setAttemptContinuation round-trips the readiness record; landedAttempts scopes the resume read; the archive carries the artifact', () => {
  const doc = anim.createDocument({ projectId, name: 'Juliet', binding: makeBinding() })
  const keyJ = uuid()
  const attempt = recordAttemptSimple(anim, doc.id, 'sequence', keyJ, 'idem-j1')
  assert.deepEqual(anim.getAttempt(attempt.attempt.id).continuation, { state: 'absent' }, 'a fresh row hydrates as the pre-lane absent state')

  // The landed tween/sequence row is the registration's substrate.
  anim.landCandidate(attempt.attempt.id, { assetReference: { assetId: 'seq-j1', relPath: 'takes/clip-j1.mp4', kind: 'video' }, frameCount: 22, earlierRevision: false })
  assert.ok(anim.getAttempt(attempt.attempt.id).result)

  // The retryable shape first: registering + error, wholesale replaced.
  let row = anim.getAttempt(attempt.attempt.id)
  anim.setAttemptContinuation(attempt.attempt.id, { state: 'registering', error: 'the engine became unreachable at the receipt fetch' })
  row = anim.getAttempt(attempt.attempt.id)
  assert.deepEqual(row.continuation, { state: 'registering', error: 'the engine became unreachable at the receipt fetch' })
  assert.ok(row.ownRevision > attempt.attempt.ownRevision, 'the continuation write rides the attempt\'s own revision')
  // A raw UPDATE of the column is legal under the append-only trigger (it
  // freezes inputs, not lifecycle columns).
  db.prepare('UPDATE animation_attempt SET continuation_json = ? WHERE id = ?').run(JSON.stringify({ state: 'absent' }), attempt.attempt.id)
  assert.equal(anim.getAttempt(attempt.attempt.id).continuation.state, 'absent')

  // The registered shape: the full record, validated whole.
  const carryBytes = Buffer.from(`carry-artifact-${uuid()}`)
  const digest = require('node:crypto').createHash('sha256').update(carryBytes).digest('hex')
  const carryFile = path.join(home, `carry-${uuid().slice(0, 8)}.safetensors`)
  fs.writeFileSync(carryFile, carryBytes)
  const registered = documentStore.registerBlobFile('latent', carryFile)
  assert.ok(registered.present)
  const record = { artifactId: uuid(), sourceAttemptId: attempt.attempt.id, digest, saveRecipeVersion: 'h3_motion_context_av_v1', producedAt: Date.now() }
  anim.setAttemptContinuation(attempt.attempt.id, { state: 'ready', artifact: record, relPath: registered.relPath })
  assert.deepEqual(anim.getAttempt(attempt.attempt.id).continuation, { state: 'ready', artifact: record, relPath: registered.relPath })

  // The refusal vocabulary: unknown states, malformed records, foreign
  // sources, and unknown attempts.
  assert.throws(() => anim.setAttemptContinuation(attempt.attempt.id, { state: 'half-registered' }), (err) => err instanceof AnimationRuleError && err.status === 400)
  assert.throws(() => anim.setAttemptContinuation(attempt.attempt.id, { state: 'ready', artifact: { ...record, digest: 'not-a-digest' } }), (err) => err.status === 400 && /sha256/.test(err.message), 'a malformed digest refuses')
  assert.throws(() => anim.setAttemptContinuation(attempt.attempt.id, { state: 'ready', artifact: { ...record, sourceAttemptId: uuid() } }), (err) => err.status === 400 && /source/.test(err.message), 'a record naming another attempt refuses')
  assert.throws(() => anim.setAttemptContinuation(uuid(), { state: 'ready' }), (err) => err.status === 404, 'an unknown attempt is a 404')

  // landedAttempts: the boot sweep's registration-resume read — landed rows
  // in, unlanded rows out (the caller applies the carries-a-tail predicate).
  const unlanded = recordAttemptSimple(anim, doc.id, 'sequence', keyJ, 'idem-j2')
  const landedIds = new Set(anim.landedAttempts().map((entry) => entry.id))
  assert.ok(landedIds.has(attempt.attempt.id), 'the landed row is in the resume read')
  assert.ok(!landedIds.has(unlanded.attempt.id), 'the unlanded row is not')

  // The archive arm (its own project, isolated counts): a registered carry
  // is a referenced blob — it rides the export or would be a silent omission.
  const carryProject = documentStore.createProject({ name: 'Carry archive' })
  const carryDoc = anim.createDocument({ projectId: carryProject.id, name: 'Kilo', binding: makeBinding() })
  const sourceAttempt = recordAttemptSimple(anim, carryDoc.id, 'sequence', uuid(), 'idem-j3').attempt
  anim.landCandidate(sourceAttempt.id, { assetReference: { assetId: 'seq-j3', relPath: 'takes/clip-j3.mp4', kind: 'video' }, frameCount: 22, earlierRevision: false })
  anim.setAttemptContinuation(sourceAttempt.id, { state: 'ready', artifact: { ...record, sourceAttemptId: sourceAttempt.id, artifactId: uuid() }, relPath: registered.relPath })
  const { archive, manifest } = exportProjectArchive(documentStore, carryProject.id)
  assert.equal(manifest.counts.animationDocuments, 1)
  assert.equal(manifest.counts.animationAttempts, 1)
  assert.ok(manifest.blobs.some((b) => b.path === registered.relPath), 'the registered carry blob rides the archive (the continuation walk)')
  assert.ok(!manifest.missingBlobs.some((b) => b.path === registered.relPath), 'the carry is not a missing entry')
  const imported = openScratchStudio('carry-import')
  const report = importProjectArchive(imported.documents, archive)
  assert.equal(report.projectId, carryProject.id)
  assert.deepEqual(imported.animation.getAttempt(sourceAttempt.id).continuation, anim.getAttempt(sourceAttempt.id).continuation, 'the continuation record round-trips byte-equal')
  const roundTripped = imported.documents.readBlob(registered.relPath)
  assert.ok(roundTripped && roundTripped.equals(carryBytes), 'the carry blob bytes round-trip content-addressed')
})
// ---------------------------------------------------------------------------
// (k) the extension chain (extension lane Task 4, spec 2026-10-08 §4/§5) —
//     window slots + selection truth, the staleness rules (alternatives
//     never invalidate; selected-ancestry changes mark descendants; the
//     rebind-as-new-attempt contract), the derived mismatch, and the
//     archive round-trip carrying chains + bindings + artifacts.
// ---------------------------------------------------------------------------

const sha256Of = (label) => require('node:crypto').createHash('sha256').update(label).digest('hex')

const makeIdentityK = (name) => ({ name, digest: sha256Of(`weights-${name}`), bytes: 1_000_000 })

/** A FULL §5 continuation binding (Task 4's record) for one source. */
const makeFullBinding = (sourceAttemptId, overrides = {}) => ({
  sourceAttemptId,
  modelIdentities: [makeIdentityK('ref2va_int8.safetensors'), makeIdentityK('h3_tween_adapter.safetensors')],
  windowCoordinates: { generatedStart: 0, generatedEnd: 21, phase: '17k+5' },
  headTrim: 5,
  deliveredRange: { start: 0, end: 16 },
  artifact: { artifactId: uuid(), digest: sha256Of(`carry-${sourceAttemptId}`) },
  recipe: { mode: 'mctx-latent-tail', contextLength: 22, schedule: { shift: '12/3' }, steps: 30, seed: 7, recipeVersion: 'extension-v1' },
  conditioning: { caption: 'she strides on through the rain', compilerVersion: '2', referenceAssetIds: [uuid(), uuid()] },
  ...overrides,
})

/** Records + lands ONE extension attempt into a window slot, freezing the
 *  given continuation binding (seed or full) — the store-level half of what
 *  Task 5's extend route drives through the service. (makeSnapshot takes
 *  per-field overrides only, so the binding rides an explicit spread.) */
function recordLandedExtension(store, documentId, windowSlotId, idempotencyKey, binding, documentRevision) {
  const recorded = store.recordAttempt({
    id: uuid(),
    documentId,
    tool: 'tween',
    targetId: windowSlotId,
    idempotencyKey,
    inputHash: `hash-${idempotencyKey}`,
    snapshot: { ...makeSnapshot({ tool: 'tween', targetId: windowSlotId, documentRevision }), continuationBinding: binding },
  })
  assert.equal(recorded.created, true)
  store.landCandidate(recorded.attempt.id, {
    assetReference: { assetId: `clip-${idempotencyKey}`, relPath: `takes/clip-${idempotencyKey}.mp4`, kind: 'video' },
    frameCount: 22,
    earlierRevision: false,
  })
  return recorded.attempt
}

/** The derived mismatch's sourceOf, over THIS store's attempt rows. */
const storeSourceOf = (store) => (attemptId) => store.getAttempt(attemptId)?.snapshot?.continuationBinding?.sourceAttemptId ?? null

const snapshotBytesByAttempt = (documentId) =>
  new Map(db.prepare('SELECT id, snapshot_json FROM animation_attempt WHERE document_id = ?').all(documentId).map((entry) => [entry.id, entry.snapshot_json]))

let docK = null
let chainK = null
let wK1 = null
let wK2 = null
let wK3 = null

test('(k1) the window-slot lifecycle — the chain materializes on the first Extend, selection is explicit, locks guard it', () => {
  docK = anim.createDocument({ projectId, name: 'Lima-chain', binding: makeBinding() })
  const keyK1 = uuid()
  const keyK2 = uuid()
  let row = anim.addKeyCandidate(docK.id, keyK1, makeCandidate(), 0)
  row = anim.addKeyCandidate(docK.id, keyK2, makeCandidate(), row.revision)
  row = anim.selectKeyCandidate(docK.id, keyK1, row.body.keys.find((k) => k.id === keyK1).candidates[0].id, row.revision)
  row = anim.selectKeyCandidate(docK.id, keyK2, row.body.keys.find((k) => k.id === keyK2).candidates[0].id, row.revision)
  row = anim.insertSpan(docK.id, { fromKeyId: keyK1, toKeyId: keyK2, intent: { movement: 'walks two steps', preservation: 'silhouette intact' } }, row.revision)
  const stepK = row.body.spans[0].stepSlots[0].id

  // The root substrate: a LANDED tween take on the span.
  const rootRecorded = recordAttemptSimple(anim, docK.id, 'tween', stepK, 'idem-k-root', { documentRevision: row.revision })
  anim.landCandidate(rootRecorded.attempt.id, { assetReference: { assetId: 'clip-k-root', relPath: 'takes/clip-k-root.mp4', kind: 'video' }, frameCount: 22, earlierRevision: false })
  const rootK = rootRecorded.attempt

  // The first Extend: the chain materializes ROOTED at the take, carrying
  // one empty window (order 0, the take as its recorded source).
  const revisionBeforeCreate = anim.getDocument(docK.id).revision
  const created = anim.createWindowSlot(docK.id, rootK.id, revisionBeforeCreate)
  assert.equal(created.revision, revisionBeforeCreate + 1, 'the create is one authoring command')
  assert.equal(created.body.chains.length, 1, 'the chain materialized')
  chainK = created.body.chains[0]
  assert.equal(chainK.rootAttemptId, rootK.id)
  assert.equal(chainK.windows.length, 1)
  wK1 = chainK.windows[0]
  assert.deepEqual(
    wK1,
    { id: wK1.id, order: 0, attempts: [], selectedCandidateId: null, lock: false, sourceAttemptId: rootK.id, stale: false, staleReasons: [] },
    'the fresh window: empty, unselected, unlocked, the take as its recorded source, nothing stale',
  )
  assert.match(wK1.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'the minted window id is a canonical UUID')

  // The extension attempt lands INTO the window (targetId = the window id)
  // — attached as an alternative, never selected, nothing marked.
  const extA1 = recordLandedExtension(anim, docK.id, wK1.id, 'idem-k-ext-a1', makeFullBinding(rootK.id), created.revision)
  row = anim.getDocument(docK.id)
  wK1 = row.body.chains[0].windows[0]
  assert.deepEqual(wK1.attempts, [extA1.id], 'the landed extension attempt attached to its window slot')
  assert.equal(wK1.selectedCandidateId, null, 'landing NEVER selects (§4: selection is a new explicit command)')
  assert.equal(wK1.stale, false, 'a landed alternative marks nothing (§5.3)')

  // The explicit selection — the slot's own truth, revision-gated.
  assert.throws(
    () => anim.selectWindowCandidate(docK.id, wK1.id, extA1.id, row.revision - 1),
    (err) => err instanceof AnimationConflictError && err.currentRevision === row.revision,
    'a stale expectedRevision conflicts carrying the current document',
  )
  row = anim.selectWindowCandidate(docK.id, wK1.id, extA1.id, row.revision)
  wK1 = row.body.chains[0].windows[0]
  assert.equal(wK1.selectedCandidateId, extA1.id)
  assert.equal(wK1.stale, false, 'the FIRST selection displaces nothing — no one conditioned on a prior selection')
  const revisionAfterSelect = row.revision
  row = anim.selectWindowCandidate(docK.id, wK1.id, extA1.id, row.revision)
  assert.equal(row.revision, revisionAfterSelect, 'a no-op re-select bumps no revision (§5.3)')

  // Locks guard the selection; membership stays legal (the key-slot class).
  row = anim.setWindowLock(docK.id, wK1.id, true, row.revision)
  assert.equal(row.body.chains[0].windows[0].lock, true)
  const extA2 = recordLandedExtension(anim, docK.id, wK1.id, 'idem-k-ext-a2', makeFullBinding(rootK.id), row.revision)
  row = anim.getDocument(docK.id)
  assert.deepEqual(row.body.chains[0].windows[0].attempts, [extA1.id, extA2.id], 'a locked window still accepts alternatives')
  assert.throws(
    () => anim.selectWindowCandidate(docK.id, wK1.id, extA2.id, row.revision),
    (err) => err instanceof AnimationRuleError && err.status === 400 && /locked/.test(err.message),
    'selecting on a locked window is a 400',
  )
  row = anim.setWindowLock(docK.id, wK1.id, false, row.revision)
  assert.equal(row.body.chains[0].windows[0].lock, false)

  // The create/refuse vocabulary: unknown/foreign/unlandable sources.
  assert.throws(() => anim.createWindowSlot(docK.id, uuid(), row.revision), (err) => err.status === 404, 'an unknown source attempt is a 404')
  assert.throws(() => anim.createWindowSlot(docK.id, attemptE1.attempt.id, row.revision), (err) => err.status === 404 && /not an attempt of this document/.test(err.message), 'a foreign document\'s attempt is a 404')
  const heroK = recordAttemptSimple(anim, docK.id, 'hero', uuid(), 'idem-k-hero', { documentRevision: row.revision })
  anim.landCandidate(heroK.attempt.id, { assetReference: { assetId: 'clip-k-hero', relPath: null, kind: 'video' }, frameCount: 22, earlierRevision: false })
  assert.throws(
    () => anim.createWindowSlot(docK.id, heroK.attempt.id, anim.getDocument(docK.id).revision),
    (err) => err.status === 400 && /tween-lane/.test(err.message),
    'a hero take cannot seed a window (§3 adapter scope)',
  )
  const unlandedK = recordAttemptSimple(anim, docK.id, 'tween', stepK, 'idem-k-unlanded', { documentRevision: row.revision })
  assert.throws(
    () => anim.createWindowSlot(docK.id, unlandedK.attempt.id, anim.getDocument(docK.id).revision),
    (err) => err.status === 400 && /not landed/.test(err.message),
    'an unlanded take is a state refusal — the Extend action lives on landed takes',
  )
  assert.throws(() => anim.selectWindowCandidate(docK.id, uuid(), extA1.id, row.revision), (err) => err.status === 404, 'an unknown window is a 404')
  assert.throws(() => anim.selectWindowCandidate(docK.id, wK1.id, uuid(), row.revision), (err) => err.status === 404, 'an attempt not in the window is a 404')

  // The parser's pointer integrity is the serve gate: a surgically
  // authored window whose selection points outside its own slot makes the
  // whole document refuse to SERVE — the loud abort, never a rebuild.
  const corrupt = JSON.parse(JSON.stringify(anim.getDocument(docK.id).body))
  corrupt.chains[0].windows[0].selectedCandidateId = uuid()
  db.prepare('UPDATE animation_document SET body_json = ? WHERE id = ?').run(JSON.stringify(corrupt), docK.id)
  assert.throws(() => anim.getDocument(docK.id), /cannot parse/, 'a corrupt window selection refuses loudly at hydration')
  const repaired = JSON.parse(JSON.stringify(corrupt))
  repaired.chains[0].windows[0].selectedCandidateId = corrupt.chains[0].windows[0].attempts[0]
  db.prepare('UPDATE animation_document SET body_json = ? WHERE id = ?').run(JSON.stringify(repaired), docK.id)
  assert.equal(anim.getDocument(docK.id).body.chains[0].windows[0].selectedCandidateId, corrupt.chains[0].windows[0].attempts[0], 'the repaired body serves again')
})

test('(k2) adding an unselected alternative marks NOTHING stale — alternatives never invalidate', () => {
  const before = anim.getDocument(docK.id)
  const chainsBefore = JSON.parse(JSON.stringify(before.body.chains))
  const extA3 = recordLandedExtension(anim, docK.id, wK1.id, 'idem-k-ext-a3', makeFullBinding(chainK.rootAttemptId), before.revision)
  const after = anim.getDocument(docK.id)
  const window = after.body.chains[0].windows[0]
  assert.deepEqual(window.attempts.slice(0, -1), chainsBefore[0].windows[0].attempts, 'the alternative appended')
  assert.ok(window.attempts.includes(extA3.id))
  assert.equal(window.selectedCandidateId, chainsBefore[0].windows[0].selectedCandidateId, 'the selection is untouched by a landing')
  for (const chain of after.body.chains) {
    const priorChain = chainsBefore.find((entry) => entry.rootAttemptId === chain.rootAttemptId)
    for (const w of chain.windows) {
      const prior = priorChain.windows.find((entry) => entry.id === w.id)
      assert.equal(w.stale, prior.stale, `window ${w.id} stale flag unchanged`)
      assert.deepEqual(w.staleReasons, prior.staleReasons, `window ${w.id} reasons unchanged — an unselected alternative invalidates no one`)
    }
  }
  assert.equal(after.revision, before.revision, 'landing never bumps the authored revision')
})

test('(k3) an ancestor reselection marks descendants stale WITHOUT rebinding; the derived mismatch names the state', () => {
  // Build the chain's descendants: w2 extends w1's SELECTED take; w3
  // extends w2's selected take. One landed, selected alternative each.
  let row = anim.getDocument(docK.id)
  const w1Selected = row.body.chains[0].windows[0].selectedCandidateId
  row = anim.createWindowSlot(docK.id, w1Selected, row.revision)
  chainK = row.body.chains[0]
  wK2 = chainK.windows[1]
  assert.equal(wK2.order, 1, 'extending the selected candidate appends to the rooted chain')
  assert.equal(wK2.sourceAttemptId, w1Selected, 'the new window records its source')
  const extB1 = recordLandedExtension(anim, docK.id, wK2.id, 'idem-k-ext-b1', makeFullBinding(wK2.sourceAttemptId), row.revision)
  row = anim.selectWindowCandidate(docK.id, wK2.id, extB1.id, anim.getDocument(docK.id).revision)
  row = anim.createWindowSlot(docK.id, extB1.id, row.revision)
  wK3 = row.body.chains[0].windows[2]
  assert.equal(row.body.chains.length, 1, 'still one chain — the root line')
  const extC1 = recordLandedExtension(anim, docK.id, wK3.id, 'idem-k-ext-c1', makeFullBinding(extB1.id), row.revision)
  row = anim.selectWindowCandidate(docK.id, wK3.id, extC1.id, anim.getDocument(docK.id).revision)

  // Extending an UNSELECTED alternative BRANCHES: a new chain rooted at it.
  const branchSource = row.body.chains[0].windows[0].attempts.find((id) => id !== w1Selected)
  row = anim.createWindowSlot(docK.id, branchSource, row.revision)
  assert.equal(row.body.chains.length, 2, 'the branch is its own chain rooted at the alternative')
  assert.equal(row.body.chains[1].rootAttemptId, branchSource)
  assert.equal(row.body.chains[1].windows[0].sourceAttemptId, branchSource)

  // THE RESELECTION: w1 selects its other alternative — the displaced take
  // is what w2 (and transitively w3) were conditioned on.
  const snapshotsBefore = snapshotBytesByAttempt(docK.id)
  row = anim.selectWindowCandidate(docK.id, wK1.id, branchSource, anim.getDocument(docK.id).revision)
  const windowsOf = (r) => Object.fromEntries(r.body.chains[0].windows.map((w) => [w.id, w]))
  const marked = windowsOf(row)
  assert.equal(marked[wK2.id].stale, true, 'the direct descendant went stale')
  assert.ok(marked[wK2.id].staleReasons.includes('ancestry'), 'with the ancestry reason')
  assert.equal(marked[wK3.id].stale, true, 'the transitive descendant went stale too (the walk follows binding sources)')
  assert.ok(marked[wK3.id].staleReasons.includes('ancestry'))
  assert.equal(marked[wK1.id].stale, false, 'the reselected slot itself carries no mark')
  // WITHOUT REBINDING: every frozen attempt row is byte-unchanged, and the
  // takes stay attached (§8.3: takes preserved).
  const snapshotsAfter = snapshotBytesByAttempt(docK.id)
  assert.deepEqual([...snapshotsAfter.entries()].sort(), [...snapshotsBefore.entries()].sort(), 'no attempt row changed by one byte — descendants bind frozen source attempts')
  assert.deepEqual(marked[wK2.id].attempts, [extB1.id], 'the stale window keeps its takes')
  assert.deepEqual(marked[wK3.id].attempts, [extC1.id])
  // The branch chain's own window is not a descendant of the displaced take
  // through any SELECTED edge — unmarked.
  assert.equal(row.body.chains[1].windows[0].stale, false, 'the branch chain marks nothing here')

  // The DERIVED mismatch (§4): the walk names the broken edge while the
  // ancestor selects the other alternative — and reads consistent again
  // once the compatible ancestry is reselected.
  const sourceOf = storeSourceOf(anim)
  const chainNow = anim.getDocument(docK.id).body.chains[0]
  assert.deepEqual(
    chainMismatch(chainNow, sourceOf),
    { windowSlotId: wK2.id, selectedAttemptId: extB1.id, sourceAttemptId: w1Selected, ancestorSlotId: wK1.id, expectedSelection: w1Selected },
    'the mismatch names the descendant, its take, the frozen source, the ancestor slot, and the restoring selection',
  )
  row = anim.selectWindowCandidate(docK.id, wK1.id, w1Selected, anim.getDocument(docK.id).revision)
  assert.equal(chainMismatch(anim.getDocument(docK.id).body.chains[0], sourceOf), null, 'reselecting the compatible ancestry restores the derived path')
  // The MARKS stand (monotonic, the span machinery's own doctrine): stale
  // is a re-render prompt with takes preserved, never auto-cleared.
  assert.ok(windowsOf(row)[wK2.id].staleReasons.includes('ancestry'), 'the mark stands after the path restored')
})

test('(k4) rebindContinuation edits the document and produces the NEXT attempt\'s binding — the old ones byte-unchanged', () => {
  let row = anim.getDocument(docK.id)
  let chain = row.body.chains[0]
  const w1 = chain.windows[0]
  const w2 = chain.windows[1]
  const displacedSource = w2.sourceAttemptId
  // The mismatch-resolution shape: w1 selects its compatible take again;
  // rebind w2 to the OTHER alternative.
  const rebindSource = w1.attempts.find((id) => id !== w1.selectedCandidateId)
  assert.notEqual(rebindSource, displacedSource)

  const snapshotsBefore = snapshotBytesByAttempt(docK.id)
  row = anim.rebindContinuation(docK.id, w2.id, rebindSource, row.revision)
  chain = row.body.chains[0]
  const rebound = chain.windows[1]
  assert.equal(rebound.sourceAttemptId, rebindSource, 'the slot\'s recorded source re-pointed')
  assert.equal(rebound.stale, true, 'the rebound window marks stale (its takes bind the displaced source)')
  assert.ok(rebound.staleReasons.includes('ancestry'))
  assert.equal(chain.windows[2].stale, true, 'the descendant marked too (§5: descendant staleness)')
  assert.ok(chain.windows[2].staleReasons.includes('ancestry'))

  // The next attempt — the re-submission the rebind enables — freezes the
  // REBOUND source; the old ones are byte-unchanged (the absolute contract).
  const next = recordLandedExtension(anim, docK.id, w2.id, 'idem-k-ext-b2', makeFullBinding(rebindSource), row.revision)
  const snapshotsAfter = snapshotBytesByAttempt(docK.id)
  for (const [id, bytes] of snapshotsAfter) {
    if (id === next.id) continue
    assert.equal(bytes, snapshotsBefore.get(id), `attempt ${id} is byte-unchanged`)
  }
  assert.equal(anim.getAttempt(next.id).snapshot.continuationBinding.sourceAttemptId, rebindSource, 'the NEW attempt carries the rebound binding source')
  row = anim.getDocument(docK.id)
  assert.ok(row.body.chains[0].windows[1].attempts.includes(next.id), 'the new attempt joined as an alternative')
  assert.equal(row.body.chains[0].windows[1].attempts.length, 2, 'the prior take stays attached (takes preserved)')

  // The refusal + no-op vocabulary.
  const revision = row.revision
  const noOp = anim.rebindContinuation(docK.id, w2.id, rebindSource, revision)
  assert.equal(noOp.revision, revision, 'a same-source rebind is the no-op verdict — no bump, no write')
  assert.throws(
    () => anim.rebindContinuation(docK.id, w1.id, chain.windows[2].attempts[0], revision),
    (err) => err.status === 400 && /precede/.test(err.message),
    'a source at or after the window refuses — the cycle guard',
  )
  assert.throws(
    () => anim.rebindContinuation(docK.id, w1.id, w1.attempts[0], revision),
    (err) => err.status === 400 && /precede/.test(err.message),
    'a source from the window\'s OWN slot refuses — a window cannot extend itself',
  )
  // A genuinely cross-chain source: land one take in the branch chain, then
  // try to rebind the root chain's window to it.
  const branchWindow = row.body.chains[1].windows[0]
  const branchTake = recordLandedExtension(anim, docK.id, branchWindow.id, 'idem-k-branch-1', makeFullBinding(row.body.chains[1].rootAttemptId), revision)
  assert.throws(
    () => anim.rebindContinuation(docK.id, w1.id, branchTake.id, anim.getDocument(docK.id).revision),
    (err) => err.status === 400 && /neither the root of, nor an alternative in/.test(err.message),
    'a cross-chain source refuses — a rebind resolves a mismatch inside one chain',
  )
  assert.throws(() => anim.rebindContinuation(docK.id, uuid(), rebindSource, revision), (err) => err.status === 404, 'an unknown window is a 404')
  // Rebinding to the chain ROOT is legal in principle — for w1 it is the
  // no-op (its recorded source IS the root).
  assert.equal(anim.rebindContinuation(docK.id, w1.id, chain.rootAttemptId, revision).revision, revision, 'the root rebind of w1 is the no-op')
})

test('(k5) an authored-input change on the root span marks the chain\'s windows stale (intent)', () => {
  let row = anim.getDocument(docK.id)
  const spanId = row.body.spans[0].id
  row = anim.updateSpanIntent(docK.id, spanId, { movement: 'she pivots and walks back', preservation: 'silhouette intact' }, row.revision)
  const rootChain = row.body.chains[0]
  for (const window of rootChain.windows) {
    assert.equal(window.stale, true, `window ${window.id} marked`)
    assert.ok(window.staleReasons.includes('intent'), `window ${window.id} carries the intent reason`)
  }
  assert.ok(row.body.spans.find((s) => s.id === spanId).staleReasons.includes('intent'), 'the span itself still marks (the standing rule)')
  // The BRANCH chain roots at an extension ATTEMPT (its target is a window
  // slot, not a step slot) — it rides its parent chain's marks, not its own.
  const branchChain = row.body.chains[1]
  for (const window of branchChain.windows) {
    assert.ok(!window.staleReasons.includes('intent'), `branch window ${window.id} carries no intent mark (documented residual)`)
  }
})

test('(k6) the project archive round-trips chains + bindings + artifacts (its own project)', () => {
  // A registered carry blob the source's continuation record + the binding
  // both name — the artifact the archive must carry.
  const carryBytes = Buffer.from(`chain-carry-${uuid()}`)
  const carryFile = path.join(home, `chain-carry-${uuid().slice(0, 8)}.safetensors`)
  fs.writeFileSync(carryFile, carryBytes)
  const registered = documentStore.registerBlobFile('latent', carryFile)
  assert.ok(registered.present)

  const chainProject = documentStore.createProject({ name: 'Chain archive' })
  const doc = anim.createDocument({ projectId: chainProject.id, name: 'Mike-chain', binding: makeBinding() })
  const keyM1 = uuid()
  const keyM2 = uuid()
  let row = anim.addKeyCandidate(doc.id, keyM1, makeCandidate(), 0)
  row = anim.addKeyCandidate(doc.id, keyM2, makeCandidate(), row.revision)
  row = anim.selectKeyCandidate(doc.id, keyM1, row.body.keys.find((k) => k.id === keyM1).candidates[0].id, row.revision)
  row = anim.selectKeyCandidate(doc.id, keyM2, row.body.keys.find((k) => k.id === keyM2).candidates[0].id, row.revision)
  row = anim.insertSpan(doc.id, { fromKeyId: keyM1, toKeyId: keyM2, intent: { movement: 'runs', preservation: 'steady' } }, row.revision)
  const stepM = row.body.spans[0].stepSlots[0].id
  const root = recordAttemptSimple(anim, doc.id, 'tween', stepM, 'idem-m-root', { documentRevision: row.revision })
  anim.landCandidate(root.attempt.id, { assetReference: { assetId: 'clip-m-root', relPath: registered.relPath, kind: 'video' }, frameCount: 22, earlierRevision: false })
  anim.setAttemptContinuation(root.attempt.id, {
    state: 'ready',
    artifact: { artifactId: uuid(), sourceAttemptId: root.attempt.id, digest: sha256Of(carryBytes.toString()), saveRecipeVersion: 'h3_motion_context_av_v1', producedAt: Date.now() },
    relPath: registered.relPath,
  })
  row = anim.createWindowSlot(doc.id, root.attempt.id, anim.getDocument(doc.id).revision)
  const windowM = row.body.chains[0].windows[0]
  // The FULL §5 binding freezes into the extension attempt — the artifact
  // handle names the registered carry.
  const fullBinding = makeFullBinding(root.attempt.id, { artifact: { artifactId: uuid(), digest: sha256Of(carryBytes.toString()) } })
  const ext = recordLandedExtension(anim, doc.id, windowM.id, 'idem-m-ext', fullBinding, row.revision)
  row = anim.selectWindowCandidate(doc.id, windowM.id, ext.id, anim.getDocument(doc.id).revision)

  const { archive, manifest } = exportProjectArchive(documentStore, chainProject.id)
  assert.equal(manifest.counts.animationDocuments, 1)
  assert.equal(manifest.counts.animationAttempts, 2, 'the root take and the extension attempt both ride')
  assert.ok(manifest.blobs.some((b) => b.path === registered.relPath), 'the carry blob rides (the artifact walk)')
  assert.ok(!manifest.missingBlobs.some((b) => b.path === registered.relPath), 'the carry is not a missing entry')

  const imported = openScratchStudio('chain-import')
  const report = importProjectArchive(imported.documents, archive)
  assert.equal(report.projectId, chainProject.id)
  const ours = anim.getDocument(doc.id)
  assert.deepEqual(imported.animation.getDocument(doc.id).body.chains, ours.body.chains, 'the CHAIN round-trips byte-equal (windows, selections, sources, staleness)')
  assert.deepEqual(imported.animation.getAttempt(ext.id).snapshot.continuationBinding, fullBinding, 'the BINDING round-trips verbatim inside the frozen snapshot')
  assert.deepEqual(imported.animation.getAttempt(root.attempt.id).continuation, anim.getAttempt(root.attempt.id).continuation, 'the continuation record round-trips')
  const roundTripped = imported.documents.readBlob(registered.relPath)
  assert.ok(roundTripped && roundTripped.equals(carryBytes), 'the ARTIFACT bytes round-trip content-addressed')
  // The imported chain still derives: the mismatch walk over the imported
  // rows reads the same truth (consistent here).
  assert.equal(chainMismatch(imported.animation.getDocument(doc.id).body.chains[0], storeSourceOf(imported.animation)), null, 'the imported chain walks consistent')
})
