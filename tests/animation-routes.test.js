// The animation HTTP routes + fabric channel suite (task 5 of the
// animation-authoring module, spec 2026-10-06-animation-authoring-module-
// design.md §7.2 the editor-facing service contract, §7.2.1 the three
// selection commands, §7.2.2 submission idempotency, §11.1 the route
// decision): the REAL server (dist-server/server/index.js, the
// tests/documents.test.js BOOT pattern) + the standing FAKE ENGINE
// (e2e/mirror/fakeEngineServer.mjs, the animation-h3 profile) driven over
// real HTTP and the real fabric WebSocket. Nothing is constructed
// in-process — the HTTP + WS surface IS the module under test, which is the
// point of the task: the routes are the interface Task 6's client wraps.
//
// Sections:
//   (a) bootstrap + document create/list/read round-trip over HTTP
//   (b) revision-gated commands — a stale expectedRevision answers 409 WITH
//       the current document; a locked key's select answers 400; span
//       insert/update-intent/remove (the editorial rows riding a removed
//       span go with it); select/key-candidate round-trip
//   (c) submit → attempt-state envelopes arrive on the ANIMATION channel
//       (subscribe first, then submit — the brief's bounded poll wait); the
//       landed hero candidate NEVER auto-selects; the tween lane's first
//       step resolves its references from the selected keys and lands onto
//       the step slot, then the rolling-reference + clip-contribution
//       selection routes answer on the real document
//   (d) idempotency at the ROUTE — same key + same draft ⇒ { created: false }
//       with no second engine job; same key + different draft ⇒ 409 (Review
//       Focus #3)
//   (e) the unknown-newer schema version refuses loudly — a schema_version 99
//       row written directly into scratch SQLite ⇒ GET answers 400 naming
//       the versions (§2/F9, never a downgrade)
//   (f) boot reconcile — an in-flight attempt from a previous server life
//       resolves on a FRESH boot without a second engine submission (the
//       §11.4 restart policy, asserted against the fake engine's own
//       records)
//   (g) retry-preparation over HTTP (contract review F3) — a preparation
//       failure against a transient engine truth gap (the fake engine's
//       hideHistoryFor knob) retries through the endpoint: the clip stays
//       landed, the same deterministic frame is re-proposed, and the engine
//       count proves no re-render (§11.4)
//
// Run after `pnpm build` (the server + web dist boot from dist-server).
// Scratch homes through the Wave 4 ledger; ports through the allocator.
import { test, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const REPO = require('node:path').resolve(__dirname, '..')

const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const Database = require('better-sqlite3')
const WebSocket = require('ws')
const { makePortAllocator } = require('./lib/ports.cjs')
const { makeScratchDir, removeAllScratchDirs } = require('./lib/scratch.cjs')

const freePort = makePortAllocator('animation-routes')
const uuid = () => randomUUID()

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntil(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await sleep(60)
  }
  if (await predicate()) return true
  throw new Error(`timed out after ${timeoutMs} ms waiting for: ${label}`)
}

// ---- the fake engine (the standing artifact; the ONLY engine the server
// ever sees — the scratch settings.json points comfyUrl at it BEFORE boot) --

let enginePort = 0
let engine = null
const engineFetch = (pathname, init) => fetch(`http://127.0.0.1:${enginePort}${pathname}`, init)
const engineControl = async (patch) => engineFetch('/__control', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).then((r) => r.json())
const engineHistoryAll = () => engineFetch('/history').then((r) => r.json())
async function engineRecordCount() {
  return Object.keys(await engineHistoryAll()).length
}
/** History records carrying the attempt id in the request's extra_data — the
 *  durable per-attempt marker (each /prompt receipt creates exactly one). */
async function engineRecordsFor(attemptId) {
  const all = await engineHistoryAll()
  return Object.values(all).filter((record) => record.prompt?.[2]?.attempt_id === attemptId)
}

// ---- server boot (the documents.test.js pattern) --------------------------

/** Every server booted this run — killed on exit AND in afterAll (a spawned
 *  child holds its stdio pipes open; a missed kill orphans the server). */
const bootedServers = []
const killAllServers = () => {
  for (const child of bootedServers) {
    try { child.kill() } catch { /* already gone */ }
  }
}
process.on('exit', killAllServers)

async function bootServer(home, label) {
  const output = { text: '', label }
  const port = await freePort()
  const child = spawn(process.execPath, [path.join(REPO, 'dist-server', 'server', 'index.js')], {
    env: { ...process.env, MINIMAX_STUDIO_HOME: home, MINIMAX_LAN_PORT: String(port), MINIMAX_NO_HTTPS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  bootedServers.push(child)
  child.stdout.on('data', (chunk) => { output.text += String(chunk) })
  child.stderr.on('data', (chunk) => { output.text += String(chunk) })
  const deadline = Date.now() + 20_000
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/lan/settings`)
      if (response.ok && output.text.includes(`"port":${port}`)) return { child, port, home, output }
    } catch { /* not up yet */ }
    if (Date.now() > deadline) {
      child.kill('SIGKILL')
      throw new Error(`${label} server did not become ready in 20 s\n${output.text.slice(-4000)}`)
    }
    await sleep(250)
  }
}

function client(port) {
  const base = `http://127.0.0.1:${port}`
  const get = async (pathname) => {
    const response = await fetch(base + pathname)
    const body = await response.json().catch(() => ({}))
    return { status: response.status, body }
  }
  const post = async (pathname, payload) => {
    const response = await fetch(base + pathname, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await response.json().catch(() => ({}))
    return { status: response.status, body }
  }
  return { get, post }
}

// ---- the fabric WebSocket collector (the animation channel) ---------------

function openFabricCollector(port) {
  const envelopes = []
  let closed = false
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`)
  const waiters = []
  socket.on('message', (raw) => {
    let envelope
    try { envelope = JSON.parse(String(raw)) } catch { return }
    envelopes.push(envelope)
    for (const waiter of waiters.splice(0)) waiter()
  })
  const opened = new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  return {
    envelopes,
    async subscribe(channel) {
      await opened
      socket.send(JSON.stringify({ type: 'sub', ch: channel }))
    },
    /** The brief's bounded poll wait: a predicate over the collected
     *  envelopes, raced with a timeout — never an unbounded promise. */
    async waitFor(predicate, label, timeoutMs = 15_000) {
      await waitUntil(() => predicate(envelopes), timeoutMs, label)
    },
    close() {
      if (!closed) { closed = true; socket.close() }
    },
  }
}

// ---- shared fixtures --------------------------------------------------------

function makeBinding() {
  return {
    characterDescription: 'a lanky courier in a long coat',
    referenceAssetIds: [uuid(), uuid()],
    medium: 'clean line on white',
    initialKeyAssetId: `asset-${uuid().slice(0, 8)}`,
  }
}

/** A registered image blob via the REAL canvas ingest route — the frozen
 *  references must be readable in the server's own blob store. */
async function registerKeyImage(api, label) {
  const bytes = Buffer.from(`animation-route-reference-${label}-${uuid()}`)
  const response = await api.post('/api/lan/documents/blobs/ingest', {
    kind: 'image',
    name: `key-${label}.png`,
    data: bytes.toString('base64'),
  })
  assert.equal(response.status, 200, `the reference image ingests over HTTP (${response.body.error ?? ''})`)
  assert.equal(response.body.blob.present, true)
  return { assetId: `animref-${label}-${uuid().slice(0, 8)}`, relPath: response.body.blob.relPath, kind: 'image' }
}

/** A key slot with ONE imported candidate, selected — the hero/tween
 *  reference source. Returns { keyId, candidateId, revision }. */
async function makeSelectedKey(api, documentId, startRevision, label) {
  const assetReference = await registerKeyImage(api, label)
  const candidateId = uuid()
  const keyId = uuid()
  let revision = startRevision
  let response = await api.post('/api/lan/animation/keys', {
    op: 'add-candidate', documentId, keyId, expectedRevision: revision,
    candidate: { id: candidateId, assetReference, origin: 'import', provenance: { assetId: assetReference.assetId }, poseDescription: 'mid-stride, arms pumping', facing: 'screen-left' },
  })
  assert.equal(response.status, 200, `add-candidate lands (${response.body.error ?? ''})`)
  revision = response.body.document.revision
  response = await api.post('/api/lan/animation/select/key-candidate', { documentId, keyId, candidateId, expectedRevision: revision })
  assert.equal(response.status, 200, `the key selection lands (${response.body.error ?? ''})`)
  return { keyId, candidateId, revision: response.body.document.revision }
}

const heroDraft = (targetKeyId) => ({
  tool: 'hero',
  targetKeyId,
  movementArc: 'she plants the forward foot and pushes through into a full stride, arms swinging down to the hips',
  overrides: { medium: 'clean line on white', scene: 'a rain-slick street at dusk' },
})

// ---- cross-section state (sequential tests share it) -----------------------

let home = ''
let serverA = null
let api = null
let fabric = null
let projectId = ''
// (a)
let docA = null
// (b)
let docB = null
let keyB1 = null
let keyB2 = null
// (c)
let docC = null
let keyC1 = null
let keyC2 = null
let heroAttemptC = null
let tweenAttemptC = null
let spanC = null
// (d)
let docD = null
let attemptD = null
// (e)
let docE = null
// (f)
let serverB = null
let apiB = null
let docF = null

// ---- suite boot --------------------------------------------------------------

beforeAll(async () => {
  // The fake engine first: the scratch settings.json must point the server
  // at it BEFORE boot (the default comfyUrl is the 8189 testbed — the test
  // never lets the server near it; asserted, not assumed).
  enginePort = await freePort()
  engine = spawn(process.execPath, [
    path.join(REPO, 'e2e', 'mirror', 'fakeEngineServer.mjs'),
    '--port', String(enginePort),
    '--profile', path.join('e2e/mirror/profiles/animation-h3.json'),
  ], { cwd: REPO, stdio: ['ignore', 'ignore', 'pipe'] })
  engine.stderr.on('data', (chunk) => { process.stderr.write(`[fake-engine] ${chunk}`) })
  await waitUntil(async () => {
    try { return (await engineFetch('/system_stats')).ok } catch { return false }
  }, 15_000, 'the fake engine listening on its allocated port')

  home = makeScratchDir(path.join(os.tmpdir(), 'minimax-animation-routes-'))
  const settingsFile = path.join(home, 'settings.json')
  fs.writeFileSync(settingsFile, JSON.stringify({ comfyUrl: `http://127.0.0.1:${enginePort}` }))
  assert.ok(fs.readFileSync(settingsFile, 'utf8').includes(`127.0.0.1:${enginePort}`), 'the scratch settings point at the fake engine before boot')

  serverA = await bootServer(home, 'animation-routes A')
  api = client(serverA.port)
  projectId = 'proj-animation-routes'
  fabric = openFabricCollector(serverA.port)
  await fabric.subscribe('animation')
  await fabric.waitFor((envelopes) => envelopes.some((envelope) => envelope.ch === 'system' && envelope.type === 'hello'), 'the fabric hello', 10_000)
}, 120_000)

afterAll(async () => {
  fabric?.close()
  killAllServers()
  if (engine && engine.exitCode === null) {
    engine.kill('SIGINT')
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 10_000)
      engine.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
  await removeAllScratchDirs()
})

// ---------------------------------------------------------------------------
// (a) bootstrap + documents round-trip
// ---------------------------------------------------------------------------

test('(a) bootstrap serves the vocabularies; document create/list/read round-trips over HTTP', async () => {
  const boot = await api.get('/api/lan/animation/bootstrap')
  assert.equal(boot.status, 200)
  assert.equal(boot.body.schemaVersion, 1, 'the animation document schema version')
  assert.equal(boot.body.compilerVersion, '1', 'the shared caption compiler version')
  assert.deepEqual(boot.body.media, ['clean line on white', 'flat black-and-white animatic', 'flat cel colour on white'])
  assert.deepEqual(boot.body.facingTerms, ['toward camera', 'back to camera', 'screen-left', 'screen-right'])
  assert.equal(boot.body.defaults.outputWidth, 1344)
  assert.equal(boot.body.defaults.outputHeight, 768)
  assert.equal(boot.body.defaults.fps, 24)
  assert.equal(boot.body.defaults.steps, 30)

  const created = await api.post('/api/lan/animation/documents', { projectId, name: 'Alpha', binding: makeBinding() })
  assert.equal(created.status, 200, `the document creates (${created.body.error ?? ''})`)
  docA = created.body.document
  assert.match(docA.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'the document id is a canonical UUID')
  assert.equal(docA.revision, 0)
  assert.equal(docA.body.activeBindingVersion, 1)
  assert.equal(docA.body.bindingHistory.length, 1)
  assert.deepEqual(docA.body.settings, { outputWidth: 1344, outputHeight: 768, fps: 24, steps: 30 })
  assert.deepEqual(docA.attempts, [], 'a fresh document carries no attempts')

  const listed = await api.get(`/api/lan/animation/documents?project=${encodeURIComponent(projectId)}`)
  assert.equal(listed.status, 200)
  assert.ok(listed.body.documents.some((entry) => entry.id === docA.id && entry.name === 'Alpha'), 'the listing sees the created document')

  const read = await api.get(`/api/lan/animation/document?id=${docA.id}`)
  assert.equal(read.status, 200)
  assert.equal(read.body.document.id, docA.id)
  assert.deepEqual(read.body.document.body, docA.body, 'the recovery read returns the same body')

  const missing = await api.get(`/api/lan/animation/document?id=${uuid()}`)
  assert.equal(missing.status, 404)
  assert.match(missing.body.error, /No animation document/)
})

// ---------------------------------------------------------------------------
// (b) revision-gated commands + span lifecycle + key selection
// ---------------------------------------------------------------------------

test('(b) stale expectedRevision ⇒ 409 WITH the current document; locked select ⇒ 400; spans insert/update-intent/remove; key selection round-trip', async () => {
  const created = await api.post('/api/lan/animation/documents', { projectId, name: 'Bravo', binding: makeBinding() })
  assert.equal(created.status, 200)
  docB = created.body.document

  // Two keys, one candidate each — the span endpoints.
  const first = await makeSelectedKey(api, docB.id, docB.revision, 'b1')
  keyB1 = first.keyId
  const second = await makeSelectedKey(api, docB.id, first.revision, 'b2')
  keyB2 = second.keyId
  let revision = second.revision

  // A STALE expectedRevision answers 409 carrying the CURRENT document —
  // the clean rebase surface, never a silent lost update.
  const stale = await api.post('/api/lan/animation/keys', {
    op: 'lock', documentId: docB.id, keyId: keyB1, expectedRevision: 0,
  })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.conflict.currentRevision, revision)
  assert.equal(stale.body.conflict.currentDocument.id, docB.id)
  assert.equal(stale.body.conflict.currentDocument.revision, revision, 'the 409 carries the current document row')

  // Spans: insert (returns the new span id) → update-intent → remove.
  const inserted = await api.post('/api/lan/animation/spans', {
    op: 'insert', documentId: docB.id, expectedRevision: revision,
    fromKeyId: keyB1, toKeyId: keyB2, intent: { movement: 'walks two steps', preservation: 'silhouette intact' },
  })
  assert.equal(inserted.status, 200, `the span inserts (${inserted.body.error ?? ''})`)
  assert.ok(inserted.body.spanId, 'the insert answers the new span id')
  const spanId = inserted.body.spanId
  revision = inserted.body.document.revision
  const spanRow = inserted.body.document.body.spans.find((span) => span.id === spanId)
  assert.ok(spanRow, 'the new span is in the returned body')
  assert.equal(spanRow.stepSlots.length, 1, 'a new span seeds its first step slot')
  assert.equal(spanRow.stale, false)

  // The tween chain advances (contract review F1): append-step-slot grows
  // the span and answers the MINTED slot id — the only new fact.
  const appended = await api.post('/api/lan/animation/spans', {
    op: 'append-step-slot', documentId: docB.id, expectedRevision: revision, spanId,
  })
  assert.equal(appended.status, 200, `the step slot appends (${appended.body.error ?? ''})`)
  assert.ok(appended.body.stepSlotId, 'the append answers the minted step slot id')
  const grownSpan = appended.body.document.body.spans.find((span) => span.id === spanId)
  assert.equal(grownSpan.stepSlots.length, 2, 'the span carries two step slots after one append')
  assert.deepEqual(grownSpan.stepSlots[1], { id: appended.body.stepSlotId, attempts: [], selectedRollingReference: null }, 'the appended slot is empty')
  assert.equal(grownSpan.stale, false, 'an empty slot marks nothing stale')
  revision = appended.body.document.revision

  const appendGone = await api.post('/api/lan/animation/spans', {
    op: 'append-step-slot', documentId: docB.id, expectedRevision: revision, spanId: uuid(),
  })
  assert.equal(appendGone.status, 404, 'appending to an unknown span is a 404')

  const updated = await api.post('/api/lan/animation/spans', {
    op: 'update-intent', documentId: docB.id, expectedRevision: revision, spanId,
    intent: { movement: 'turns to leave', preservation: 'silhouette intact' },
  })
  assert.equal(updated.status, 200)
  assert.equal(updated.body.document.body.spans.find((span) => span.id === spanId).intent.movement, 'turns to leave')
  assert.equal(updated.body.document.body.spans.find((span) => span.id === spanId).stale, true, 'an intent change marks the span stale')
  revision = updated.body.document.revision

  // A clip contribution rides the span — removing the span takes its
  // editorial rows with it (pointer integrity is the parser's hard gate).
  const external = new Database(path.join(home, 'studio.db'))
  try {
    external.prepare('UPDATE animation_document SET body_json = ? WHERE id = ?').run(
      JSON.stringify({ ...updated.body.document.body, editorial: [{ id: uuid(), spanId, attemptId: uuid(), inFrame: 0, outFrame: 12, holdDuration: 0 }] }),
      docB.id,
    )
  } finally {
    external.close()
  }
  const removed = await api.post('/api/lan/animation/spans', { op: 'remove', documentId: docB.id, expectedRevision: revision, spanId })
  assert.equal(removed.status, 200, `the span removes (${removed.body.error ?? ''})`)
  assert.equal(removed.body.document.body.spans.length, 0, 'the span is gone')
  assert.equal(removed.body.document.body.editorial.length, 0, 'the removed span takes its editorial rows with it')
  revision = removed.body.document.revision

  const updateGone = await api.post('/api/lan/animation/spans', {
    op: 'update-intent', documentId: docB.id, expectedRevision: revision, spanId,
    intent: { movement: 'gone', preservation: 'gone' },
  })
  assert.equal(updateGone.status, 404, 'a removed span no longer exists')

  // Lock → select answers 400 with the lock reason; unlock → select lands.
  const locked = await api.post('/api/lan/animation/keys', { op: 'lock', documentId: docB.id, keyId: keyB1, expectedRevision: revision })
  assert.equal(locked.status, 200)
  revision = locked.body.document.revision
  const lockedSelect = await api.post('/api/lan/animation/select/key-candidate', {
    documentId: docB.id, keyId: keyB1, candidateId: first.candidateId, expectedRevision: revision,
  })
  assert.equal(lockedSelect.status, 400)
  assert.match(lockedSelect.body.error, /locked/)
  const unlocked = await api.post('/api/lan/animation/keys', { op: 'unlock', documentId: docB.id, keyId: keyB1, expectedRevision: revision })
  assert.equal(unlocked.status, 200)
  const selected = await api.post('/api/lan/animation/select/key-candidate', {
    documentId: docB.id, keyId: keyB1, candidateId: first.candidateId, expectedRevision: unlocked.body.document.revision,
  })
  assert.equal(selected.status, 200)
  assert.equal(selected.body.document.body.keys.find((key) => key.id === keyB1).selectedCandidateId, first.candidateId)

  // The fabric heard the authoring commands as document-changed envelopes.
  await fabric.waitFor(
    (envelopes) => envelopes.some((envelope) => envelope.ch === 'animation' && envelope.type === 'document-changed' && envelope.payload.documentId === docB.id && envelope.payload.reason === 'select.key-candidate'),
    'the document-changed envelope for the key selection',
  )
})

// ---------------------------------------------------------------------------
// (c) submit → the animation channel; the tween lane end to end
// ---------------------------------------------------------------------------

test('(c) submit emits attempt-state envelopes on the animation channel; the landed candidate never auto-selects; the tween lane resolves from the selected keys', async () => {
  const created = await api.post('/api/lan/animation/documents', { projectId, name: 'Charlie', binding: makeBinding() })
  assert.equal(created.status, 200)
  docC = created.body.document
  const key1 = await makeSelectedKey(api, docC.id, docC.revision, 'c1')
  keyC1 = key1.keyId
  const key2 = await makeSelectedKey(api, docC.id, key1.revision, 'c2')
  keyC2 = key2.keyId
  let revision = key2.revision

  const inserted = await api.post('/api/lan/animation/spans', {
    op: 'insert', documentId: docC.id, expectedRevision: revision,
    fromKeyId: keyC1, toKeyId: keyC2, intent: { movement: 'she shifts her weight onto the heel', preservation: 'silhouette intact' },
  })
  assert.equal(inserted.status, 200)
  spanC = { id: inserted.body.spanId, stepSlotId: inserted.body.document.body.spans.find((span) => span.id === inserted.body.spanId).stepSlots[0].id }
  revision = inserted.body.document.revision

  // HERO — the subscribed socket hears the attempt move through the states.
  const hero = await api.post('/api/lan/animation/attempts', {
    documentId: docC.id, tool: 'hero', targetId: keyC1, idempotencyKey: 'idem-c-hero',
    draft: heroDraft(keyC1),
  })
  assert.equal(hero.status, 200, `the hero attempt submits (${hero.body.error ?? ''})`)
  assert.equal(hero.body.created, true)
  heroAttemptC = hero.body.attemptId
  await fabric.waitFor(
    (envelopes) => envelopes.some((envelope) => envelope.ch === 'animation' && envelope.type === 'attempt-state' && envelope.payload.attemptId === heroAttemptC),
    'an attempt-state envelope for the submitted attempt',
  )
  await fabric.waitFor(
    (envelopes) => envelopes.some((envelope) => envelope.ch === 'animation' && envelope.type === 'attempt-ready' && envelope.payload.attemptId === heroAttemptC && envelope.payload.candidateId),
    'the attempt-ready envelope with the landed candidate id',
  )
  const heroState = await api.get(`/api/lan/animation/attempt?id=${heroAttemptC}`)
  assert.equal(heroState.status, 200)
  assert.equal(heroState.body.attempt.execution, 'ready')
  assert.equal(heroState.body.attempt.preparation.state, 'proposed')
  assert.ok(heroState.body.attempt.candidate.assetReference.relPath, 'the landed clip is a registered blob')
  // The widened view (contract review F2): the persisted row (tool, targetId)
  // and the frozen snapshot (caption, compilerVersion) ride the state —
  // read-only surfacing of what was always persisted.
  assert.equal(heroState.body.attempt.tool, 'hero')
  assert.equal(heroState.body.attempt.targetId, keyC1)
  assert.ok(typeof heroState.body.attempt.caption === 'string' && heroState.body.attempt.caption.length > 0, 'the frozen compiled caption rides the view')
  assert.equal(heroState.body.attempt.compilerVersion, '1', 'the compiler version that built the frozen caption')
  const heroSlot = (await api.get(`/api/lan/animation/document?id=${docC.id}`)).body.document.body.keys.find((key) => key.id === keyC1)
  assert.equal(heroSlot.candidates.length, 2, 'the landed hero candidate APPENDED as an alternative')
  assert.equal(heroSlot.selectedCandidateId, key1.candidateId, 'completion NEVER auto-selects (§8.2)')
  // Review Important-1: attempt-ready's candidateId is the MINTED DOCUMENT
  // CANDIDATE id — correlatable against the key slot's candidates — never
  // the engine artifact path.
  const heroReady = fabric.envelopes.find((envelope) => envelope.ch === 'animation' && envelope.type === 'attempt-ready' && envelope.payload.attemptId === heroAttemptC)
  assert.ok(heroReady, 'the attempt-ready envelope was collected')
  assert.ok(
    heroSlot.candidates.some((candidate) => candidate.id === heroReady.payload.candidateId),
    'attempt-ready.candidateId matches a candidate id in the document body',
  )
  assert.notEqual(heroReady.payload.candidateId, heroState.body.attempt.candidate.assetReference.assetId, 'the candidateId is not the engine artifact path')

  // TWEEN — the first step of a chain: the rolling near reference resolves
  // from the span's start key (nothing has landed on the chain yet), the
  // fixed far reference from the end key.
  const tween = await api.post('/api/lan/animation/attempts', {
    documentId: docC.id, tool: 'tween', targetId: spanC.stepSlotId, idempotencyKey: 'idem-c-tween',
    draft: {
      tool: 'tween', targetStepSlotId: spanC.stepSlotId,
      movementStep: 'she shifts her weight onto the heel, hips following',
      overrides: { medium: 'flat black-and-white animatic' },
    },
  })
  assert.equal(tween.status, 200, `the tween attempt submits (${tween.body.error ?? ''})`)
  tweenAttemptC = tween.body.attemptId
  await fabric.waitFor(
    (envelopes) => envelopes.some((envelope) => envelope.ch === 'animation' && envelope.type === 'attempt-ready' && envelope.payload.attemptId === tweenAttemptC),
    'the tween attempt landing',
  )
  const afterTween = await api.get(`/api/lan/animation/document?id=${docC.id}`)
  const landedSpan = afterTween.body.document.body.spans.find((span) => span.id === spanC.id)
  assert.deepEqual(landedSpan.stepSlots[0].attempts, [tweenAttemptC], 'the landed tween attempt attached to its step slot')
  assert.equal(landedSpan.stepSlots[0].selectedRollingReference, null, 'the rolling reference stays an explicit selection')
  // The document read's attempts carry the same widened truth — a tween's
  // targetId IS its step slot, the timeline's re-attachment key after a
  // reload (F2's ruling).
  const tweenInView = afterTween.body.document.attempts.find((attempt) => attempt.attemptId === tweenAttemptC)
  assert.equal(tweenInView.tool, 'tween')
  assert.equal(tweenInView.targetId, spanC.stepSlotId)
  const tweenReady = fabric.envelopes.find((envelope) => envelope.ch === 'animation' && envelope.type === 'attempt-ready' && envelope.payload.attemptId === tweenAttemptC)
  assert.equal(tweenReady?.payload.candidateId, null, 'a tween landing mints no document candidate — candidateId is null, correlated by attemptId')

  // The two span-anchored selection routes answer on the real document.
  const rolling = await api.post('/api/lan/animation/select/rolling-reference', {
    documentId: docC.id, spanId: spanC.id, attemptId: tweenAttemptC, frameIndex: 7, expectedRevision: afterTween.body.document.revision,
  })
  assert.equal(rolling.status, 200, `the rolling reference selects (${rolling.body.error ?? ''})`)
  assert.deepEqual(rolling.body.document.body.spans.find((span) => span.id === spanC.id).stepSlots[0].selectedRollingReference, { attemptId: tweenAttemptC, frameIndex: 7 })

  const contribution = await api.post('/api/lan/animation/select/clip-contribution', {
    documentId: docC.id, spanId: spanC.id, attemptId: tweenAttemptC, inFrame: 2, outFrame: 15, holdDuration: 4, expectedRevision: rolling.body.document.revision,
  })
  assert.equal(contribution.status, 200, `the clip contribution selects (${contribution.body.error ?? ''})`)
  const editorial = contribution.body.document.body.editorial
  assert.equal(editorial.length, 1)
  assert.deepEqual({ inFrame: editorial[0].inFrame, outFrame: editorial[0].outFrame, holdDuration: editorial[0].holdDuration }, { inFrame: 2, outFrame: 15, holdDuration: 4 })

  for (const reason of ['select.rolling-reference', 'select.clip-contribution']) {
    await fabric.waitFor(
      (envelopes) => envelopes.some((envelope) => envelope.ch === 'animation' && envelope.type === 'document-changed' && envelope.payload.documentId === docC.id && envelope.payload.reason === reason),
      `the document-changed envelope for ${reason}`,
    )
  }
})

// ---------------------------------------------------------------------------
// (d) idempotency at the route (Review Focus #3)
// ---------------------------------------------------------------------------

test('(d) same key + same draft ⇒ { created: false } and no second engine job; same key + different draft ⇒ 409', async () => {
  const created = await api.post('/api/lan/animation/documents', { projectId, name: 'Delta', binding: makeBinding() })
  assert.equal(created.status, 200)
  docD = created.body.document
  const key = await makeSelectedKey(api, docD.id, docD.revision, 'd1')

  const draft = heroDraft(key.keyId)
  const body = { documentId: docD.id, tool: 'hero', targetId: key.keyId, idempotencyKey: 'idem-d', draft }
  const first = await api.post('/api/lan/animation/attempts', body)
  assert.equal(first.status, 200)
  assert.equal(first.body.created, true)
  attemptD = first.body.attemptId
  await api.get(`/api/lan/animation/attempt?id=${first.body.attemptId}`).then((state) => assert.ok(['queued', 'rendering', 'preparing', 'ready'].includes(state.body.attempt.execution)))
  const countAfterFirst = await engineRecordCount()

  // The lost-response retry: the SAME key, the SAME draft.
  const retry = await api.post('/api/lan/animation/attempts', body)
  assert.equal(retry.status, 200)
  assert.equal(retry.body.created, false)
  assert.equal(retry.body.attemptId, first.body.attemptId)
  assert.equal(await engineRecordCount(), countAfterFirst, 'no second engine submission')

  // The same key with a DIFFERENT draft is a conflict (§7.2.2/§11.4).
  const changed = { ...body, draft: { ...draft, movementArc: `${draft.movementArc}, then a beat` } }
  const conflict = await api.post('/api/lan/animation/attempts', changed)
  assert.equal(conflict.status, 409)
  assert.match(conflict.body.error, /different inputs/)
  assert.equal(await engineRecordCount(), countAfterFirst, 'the conflicting submit reached no engine')

  // Shape refusals are structured 400s with nothing persisted.
  const badTool = await api.post('/api/lan/animation/attempts', { ...body, idempotencyKey: 'idem-d-bad', tool: 'morph' })
  assert.equal(badTool.status, 400)
  const mismatchedTarget = await api.post('/api/lan/animation/attempts', { ...body, idempotencyKey: 'idem-d-bad2', targetId: uuid() })
  assert.equal(mismatchedTarget.status, 400, 'the target id must agree with the draft')

  // Deterministic section close: the first submission's engine record EXISTS
  // before (f) snapshots its count (a still-rendering earlier job would
  // otherwise land into the next section's delta).
  await waitUntil(async () => {
    const response = await api.get(`/api/lan/animation/attempt?id=${first.body.attemptId}`)
    return response.body.attempt?.execution === 'ready'
  }, 10_000, 'the (d) attempt landing before the section closes')
})

// ---------------------------------------------------------------------------
// (e) the unknown-newer schema version refuses loudly
// ---------------------------------------------------------------------------

test('(e) a schema_version 99 row answers 400 naming the versions — never a downgrade', async () => {
  const created = await api.post('/api/lan/animation/documents', { projectId, name: 'Echo', binding: makeBinding() })
  assert.equal(created.status, 200)
  docE = created.body.document

  const external = new Database(path.join(home, 'studio.db'))
  try {
    external.prepare('UPDATE animation_document SET schema_version = 99 WHERE id = ?').run(docE.id)
  } finally {
    external.close()
  }

  const read = await api.get(`/api/lan/animation/document?id=${docE.id}`)
  assert.equal(read.status, 400)
  assert.match(read.body.error, /schema version 99/)
  assert.equal(read.body.schemaVersion.found, 99)
  assert.equal(read.body.schemaVersion.supported, 1)
  assert.ok('writerAppVersion' in read.body.schemaVersion, 'the refusal names the writing app version')

  // The poison is isolated: the healthy documents still read.
  const healthy = await api.get(`/api/lan/animation/document?id=${docD.id}`)
  assert.equal(healthy.status, 200)

  // Review Important-2: poison ATTEMPT rows degrade only themselves — one
  // on THIS document (unhydratable: a future tool + a corrupt snapshot,
  // skipped in isolation) and one on ANOTHER document (never reached by the
  // scoped query). Neither may take the document read down.
  const poison = new Database(path.join(home, 'studio.db'))
  try {
    const insertPoison = poison.prepare(
      "INSERT INTO animation_attempt (id, document_id, tool, target_id, idempotency_key, input_hash, snapshot_json, engine_job_id, execution_json, preparation_json, result_json, own_revision, created_at, updated_at) VALUES (?, ?, 'quantum-morph', 't', ?, 'h', 'not-json', NULL, '{\"state\":\"queued\"}', '{\"state\":\"pending\"}', NULL, 0, 1, 1)",
    )
    insertPoison.run(uuid(), docD.id, `poison-${uuid().slice(0, 8)}`)
    insertPoison.run(uuid(), docE.id, `poison-${uuid().slice(0, 8)}`)
  } finally {
    poison.close()
  }
  const surviving = await api.get(`/api/lan/animation/document?id=${docD.id}`)
  assert.equal(surviving.status, 200, 'a poison attempt row does not take the document read down')
  assert.deepEqual(
    surviving.body.document.attempts.map((attempt) => attempt.attemptId),
    [attemptD],
    'the document serves exactly its one healthy attempt — the poison row skipped, the other document’s poison never reached',
  )
})

// ---------------------------------------------------------------------------
// (f) boot reconcile — the second server life
// ---------------------------------------------------------------------------

test('(f) an in-flight attempt from a previous server life resolves on a fresh boot — no second engine submission', async () => {
  // A slow render widens the crash window deterministically.
  await engineControl({ stepDelayMs: 800 })

  const created = await api.post('/api/lan/animation/documents', { projectId, name: 'Foxtrot', binding: makeBinding() })
  assert.equal(created.status, 200)
  docF = created.body.document
  const key = await makeSelectedKey(api, docF.id, docF.revision, 'f1')

  const countBefore = await engineRecordCount()
  const submitted = await api.post('/api/lan/animation/attempts', {
    documentId: docF.id, tool: 'hero', targetId: key.keyId, idempotencyKey: 'idem-f',
    draft: heroDraft(key.keyId),
  })
  assert.equal(submitted.status, 200)
  const attemptId = submitted.body.attemptId

  // The crash: the first server life dies mid-render, its watcher with it.
  // The durable row (in flight, engine job recorded) is what survives.
  serverA.child.kill('SIGKILL')
  await new Promise((resolve) => serverA.child.once('exit', resolve))
  fabric.close()

  // The engine finishes the dispatched job with nobody watching.
  await waitUntil(async () => (await engineRecordsFor(attemptId)).length === 1, 15_000, 'the engine completing the dispatched job')
  await engineControl({ stepDelayMs: 40 })

  // The second server life: fresh boot on the SAME home runs the boot
  // reconcile, which resolves the attempt from engine truth — never a
  // resubmit (§11.4).
  serverB = await bootServer(home, 'animation-routes B')
  apiB = client(serverB.port)
  let state = null
  await waitUntil(async () => {
    const response = await apiB.get(`/api/lan/animation/attempt?id=${attemptId}`)
    state = response.body.attempt
    return response.status === 200 && state?.execution === 'ready'
  }, 20_000, 'the fresh boot reconciling the attempt to ready')
  assert.ok(state.candidate.assetReference.relPath, 'the reconciled attempt holds its landed candidate')

  const countAfter = await engineRecordCount()
  assert.equal(countAfter, countBefore + 1, 'exactly ONE engine job across both server lives — the boot reconcile never resubmitted')
  assert.equal((await engineRecordsFor(attemptId)).length, 1)

  const document = await apiB.get(`/api/lan/animation/document?id=${docF.id}`)
  assert.equal(document.status, 200)
  const slot = document.body.document.body.keys.find((entry) => entry.id === key.keyId)
  assert.equal(slot.candidates.length, 2, 'the reconciled candidate landed on the key slot')
  assert.equal(slot.selectedCandidateId, key.candidateId, 'the reconciliation changed no selection')
})

// ---------------------------------------------------------------------------
// (g) retry-preparation over HTTP (contract review F3 — §11.4: preserve the
//     clip, retry preparation without rendering)
// ---------------------------------------------------------------------------

test('(g) a failed preparation retries through the endpoint — the clip survives, no new engine work', async () => {
  const created = await apiB.post('/api/lan/animation/documents', { projectId, name: 'Golf', binding: makeBinding() })
  assert.equal(created.status, 200)
  const docG = created.body.document
  const key = await makeSelectedKey(apiB, docG.id, docG.revision, 'g1')

  const countBefore = await engineRecordCount()
  const submitted = await apiB.post('/api/lan/animation/attempts', {
    documentId: docG.id, tool: 'hero', targetId: key.keyId, idempotencyKey: 'idem-g-prep',
    draft: heroDraft(key.keyId),
  })
  assert.equal(submitted.status, 200, `the attempt submits (${submitted.body.error ?? ''})`)
  const attemptId = submitted.body.attemptId
  let state = null
  await waitUntil(async () => {
    const response = await apiB.get(`/api/lan/animation/attempt?id=${attemptId}`)
    state = response.body.attempt
    return state?.execution === 'ready' && state?.preparation?.state === 'proposed'
  }, 20_000, 'the attempt landing with its frame proposed')
  assert.ok(state.candidate, 'the clip landed')

  // The transient engine truth gap: the job's history record disappears from
  // every /history answer — the preparation read finds no outputs (§11.4's
  // preparation-failure class; the knob is reversible, unlike wipe).
  const jobId = Object.entries(await engineHistoryAll()).find(([, record]) => record.prompt?.[2]?.attempt_id === attemptId)?.[0]
  assert.ok(jobId, 'the engine holds the attempt’s history record')
  await engineControl({ hideHistoryFor: jobId })

  const failed = await apiB.post('/api/lan/animation/attempt/retry-preparation', { attemptId })
  assert.equal(failed.status, 200, `the retry endpoint answers (${failed.body.error ?? ''})`)
  assert.equal(failed.body.retried, true)
  state = (await apiB.get(`/api/lan/animation/attempt?id=${attemptId}`)).body.attempt
  assert.equal(state.preparation.state, 'failed', 'preparation past the bounded retries marks failed')
  assert.equal(state.execution, 'ready', 'the landed clip is PRESERVED (§11.4)')
  assert.ok(state.candidate)

  // The gap closes; the explicit retry finishes preparation — no re-render.
  await engineControl({ hideHistoryFor: null })
  const retried = await apiB.post('/api/lan/animation/attempt/retry-preparation', { attemptId })
  assert.equal(retried.status, 200)
  state = (await apiB.get(`/api/lan/animation/attempt?id=${attemptId}`)).body.attempt
  assert.equal(state.preparation.state, 'proposed')
  assert.equal(state.preparation.proposedFrameIndex, Math.floor(state.candidate.frameCount / 2), 'the SAME deterministic mid-clip proposal')
  assert.equal(await engineRecordCount(), countBefore + 1, 'exactly the ONE render — preparation retrying NEVER re-rendered')

  // The refusal class: an attempt that never landed has no preparation to
  // retry (400); an unknown attempt is a 404.
  await engineControl({ failMode: 'error' })
  const doomed = await apiB.post('/api/lan/animation/attempts', {
    documentId: docG.id, tool: 'hero', targetId: key.keyId, idempotencyKey: 'idem-g-prep-doomed',
    draft: heroDraft(key.keyId),
  })
  assert.equal(doomed.status, 200, `the failing attempt submits (${doomed.body.error ?? ''})`)
  await waitUntil(async () => {
    const response = await apiB.get(`/api/lan/animation/attempt?id=${doomed.body.attemptId}`)
    return response.body.attempt?.execution === 'failed'
  }, 20_000, 'the failing attempt resolving')
  await engineControl({ failMode: null })
  const refusal = await apiB.post('/api/lan/animation/attempt/retry-preparation', { attemptId: doomed.body.attemptId })
  assert.equal(refusal.status, 400)
  assert.match(refusal.body.error, /landed clip/)
  const missing = await apiB.post('/api/lan/animation/attempt/retry-preparation', { attemptId: uuid() })
  assert.equal(missing.status, 404)
  assert.match(missing.body.error, /No attempt/)
})
