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
//       selection routes answer on the real document; the SEQUENCE lane
//       (task 12) submits the selected key window — start-key target, the
//       frozen window + beats surfaced on the row, the §8.2 no-body-change
//       landing asserted against document truth
//   (d) idempotency at the ROUTE — same key + same draft ⇒ { created: false }
//       with no second engine job; same key + different draft ⇒ 409 (Review
//       Focus #3); §5.2's named sequence-window refusals (a window spans
//       two DISTINCT keys; the draft names the window start as its target)
//   (e) the unknown-newer schema version refuses loudly — a schema_version 99
//       row written directly into scratch SQLite ⇒ GET answers 400 naming
//       the versions (§2/F9, never a downgrade)
//   (f) boot reconcile — an in-flight attempt from a previous server life
//       resolves on a FRESH boot without a second engine submission (the
//       §11.4 restart policy, asserted against the fake engine's own
//       records)
//   (g) retry-preparation over HTTP (contract review F3 + the final review's
//       F1) — a masked history record (the fake engine's hideHistoryFor
//       knob) no longer starves preparation: the explicit retry re-proposes
//       the same deterministic frame straight from the DURABLE registered
//       clip, no re-render; the preparation-FAILURE class keeps its HTTP pin
//       through an engine whose image listing under-delivers versus its own
//       graph (the M2 refusal) — clip preserved, retry still refusing
//   (h) the promoted-frame continuation (task 15) — a tween step 2+ whose
//       near reference is a promoted frame freezes the EXTRACTED frame image
//       (§7.2.2's frame-resolution seam at submit time): the submission
//       reaches the engine — where this build's old honest limit refused the
//       clip artifact as a video asset — and the engine's own record shows
//       the extracted frame as the uploaded near reference
//   (i) the final review's F1 at the route — a LANDED take whose engine
//       history is WIPED (the restart shape) still feeds the chain: the
//       extract-frame endpoint (hero acceptance's server half) answers a
//       registered IMAGE from the durable clip, and the step-2 promoted-near
//       submit SUCCEEDS where the engine-coupled build 400'd
//   (j) the final review's M6 — a same-key retry of a promoted-near submit
//       while the engine is UNREACHABLE answers { created: false } with the
//       existing attempt id: the idempotency check precedes any extraction
//       work, so no engine call (and no 400) can fire on the retry
//   (k) wave 1 (the live review's #1) — registry-driven model resolution:
//       a dead slot answers the named 400 with NOTHING spent (no attempt
//       row, no engine submission); a healthy submit's received graph
//       carries the RESOLVED names (the profile enumerates DIFFERENT names
//       than the pinned constants — resolution exercised at the wire)
//   (l) wave 1 queue-then-fail (the review's #1/#6) — an offline submit
//       persists (queue semantics), the engine returns with an enumeration
//       lacking a slot, the SERVER restarts, and the fresh boot's sweep
//       FAILS the deferred dispatch with the durable sanitized reason; the
//       enumeration changes and the re-roll renders
//   (m) wave 2a — the annotate route + the compiled annotation (its own
//       banner comment sits at the section)
//   (n) freeze-before-submission (Codex batch B: I5) — a binding update
//       landing behind the submission's held enumeration await changes
//       NOTHING the row freezes: the frozen documentRevision and the
//       bindingVersion/settings stamps all describe the ENTRY revision
//
// Run after `pnpm build` (the server + web dist boot from dist-server).
// Scratch homes through the Wave 4 ledger; ports through the allocator.
import { test, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { engineInputName } from '../shared/animation/graphs'

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
  return Object.values(all).filter((record) => record.prompt?.[3]?.attempt_id === attemptId)
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

/** A hero draft naming its SOURCE key (task 11's §5.2 semantics: the arc
 *  describes the movement FROM the current key; the submission's targetId
 *  separately names the PROPOSED slot the clip lands into). */
const heroDraft = (sourceKeyId) => ({
  tool: 'hero',
  sourceKeyId,
  movementArc: 'she plants the forward foot and pushes through into a full stride, arms swinging down to the hips',
  overrides: { medium: 'clean line on white', scene: 'a rain-slick street at dusk' },
})

/** A sequence draft over an explicit window (task 12's §5.2/§11.2 semantics:
 *  the submission's targetId IS the window's START key; the draft separately
 *  names the END key, the ordered beats, and the preservation). */
const sequenceDraft = (windowStartKeyId, windowEndKeyId) => ({
  tool: 'sequence',
  windowStartKeyId,
  windowEndKeyId,
  orderedActions: ['she rises from the bench', 'the coat swings as she turns', 'she settles facing the platform'],
  preservation: 'the coat hem stays consistent; the rhythm stays even',
  overrides: { medium: 'flat cel colour on white', scene: 'a station platform' },
})

// ---- cross-section state (sequential tests share it) -----------------------

let home = ''
let serverA = null
let api = null
let fabric = null
let projectId = ''
// (a)
let docA = null
let docEmpty = null
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
let sequenceAttemptC = null
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
// (n)/(o) — Codex batch B: the freeze and idempotency legs share a server life
let serverE = null
let apiE = null

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
  // A signal-killed child leaves exitCode null, so `killed` is the guard:
  // section (j) already SIGINT'd and reaped the engine — don't re-kill (the
  // second exit listener would never fire and the timer would burn 10 s).
  if (engine && engine.exitCode === null && !engine.killed) {
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
  assert.equal(boot.body.compilerVersion, '2', 'the shared caption compiler version (v2: the tween STATIC append)')
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

  // The EMPTY SESSION (task 7, spec §4.1): create WITHOUT a binding — the
  // pre-binding document the binding panel fills (empty history,
  // activeBindingVersion 0 — the schema's explicitly supported state), then
  // the binding route lands version 1 on it (§4.2).
  const emptyCreated = await api.post('/api/lan/animation/documents', { projectId, name: 'Alpha-empty' })
  assert.equal(emptyCreated.status, 200, `the pre-binding document creates (${emptyCreated.body.error ?? ''})`)
  docEmpty = emptyCreated.body.document
  assert.equal(docEmpty.body.activeBindingVersion, 0)
  assert.deepEqual(docEmpty.body.bindingHistory, [])
  assert.equal(docEmpty.revision, 0)
  const emptyRead = await api.get(`/api/lan/animation/document?id=${docEmpty.id}`)
  assert.equal(emptyRead.status, 200)
  assert.deepEqual(emptyRead.body.document.body, docEmpty.body, 'the pre-binding body round-trips')

  const emptyBound = await api.post('/api/lan/animation/binding', { documentId: docEmpty.id, binding: makeBinding(), expectedRevision: 0 })
  assert.equal(emptyBound.status, 200, `the binding lands on the empty session (${emptyBound.body.error ?? ''})`)
  assert.equal(emptyBound.body.document.body.activeBindingVersion, 1)
  assert.equal(emptyBound.body.document.body.bindingHistory.length, 1)
  assert.equal(emptyBound.body.document.body.bindingHistory[0].version, 1)
  assert.equal(emptyBound.body.document.revision, 1)
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
  // §5.2 (task 11): the attempt targets a FRESH PROPOSED key slot while the
  // draft names the SOURCE key — the hero generates the NEXT key, never a
  // re-roll of the current one (the F5 contract-review fix).
  const heroProposedC = uuid()
  const hero = await api.post('/api/lan/animation/attempts', {
    documentId: docC.id, tool: 'hero', targetId: heroProposedC, idempotencyKey: 'idem-c-hero',
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
  assert.equal(heroState.body.attempt.candidate.assetReference.kind, 'video', 'the landed clip is the video artifact')
  // The widened view (contract review F2 + task 11's hero fields): the
  // persisted row (tool, targetId, sourceKeyId) and the frozen snapshot
  // (caption, compilerVersion, movementArc) ride the state — read-only
  // surfacing of what was always persisted.
  assert.equal(heroState.body.attempt.tool, 'hero')
  assert.equal(heroState.body.attempt.targetId, heroProposedC, 'the attempt targets the PROPOSED slot')
  assert.equal(heroState.body.attempt.sourceKeyId, keyC1, 'the frozen draft names the SOURCE key')
  assert.equal(heroState.body.attempt.movementArc, heroDraft(keyC1).movementArc, 'the authored arc froze verbatim')
  assert.ok(typeof heroState.body.attempt.caption === 'string' && heroState.body.attempt.caption.length > 0, 'the frozen compiled caption rides the view')
  assert.equal(heroState.body.attempt.compilerVersion, '2', 'the compiler version that built the frozen caption')
  assert.ok(!heroState.body.attempt.caption.includes('TARGET END FRAME'), 'the hero caption has NO destination section (§6.2)')
  // The §5.2 document truth: the clip lands into the PROPOSED slot (which
  // materializes with it, selection null — §5.3), and the SOURCE key is
  // untouched — its candidate list and selection are exactly what they were.
  const heroDocumentC = (await api.get(`/api/lan/animation/document?id=${docC.id}`)).body.document
  const sourceSlot = heroDocumentC.body.keys.find((key) => key.id === keyC1)
  assert.equal(sourceSlot.candidates.length, 1, 'the SOURCE key gained nothing (§5.2: the next key, not a re-roll)')
  assert.equal(sourceSlot.selectedCandidateId, key1.candidateId, 'completion NEVER auto-selects (§8.2)')
  const heroSlot = heroDocumentC.body.keys.find((key) => key.id === heroProposedC)
  assert.ok(heroSlot, 'the proposed slot materialized with its candidate')
  assert.equal(heroSlot.candidates.length, 1, 'the landed hero clip is the slot\'s first candidate')
  assert.equal(heroSlot.candidates[0].origin, 'hero')
  assert.equal(heroSlot.selectedCandidateId, null, 'the landed clip is NOT auto-selected (§5.3)')
  assert.equal(heroSlot.candidates[0].provenance.generatingOp, heroAttemptC, 'provenance names the generating attempt')
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
  // The frame-addressed output listing (task 11): the fake engine lists the
  // clip's decoded frames beside the clip, so §7.2.2's on-demand extraction
  // answers a real IMAGE asset — frame 3 differs from frame 4, and both
  // differ from the clip artifact (the frame-preparer contract).
  const frameThree = await api.post('/api/lan/animation/attempt/extract-frame', { attemptId: heroAttemptC, frameIndex: 3 })
  const frameFour = await api.post('/api/lan/animation/attempt/extract-frame', { attemptId: heroAttemptC, frameIndex: 4 })
  assert.equal(frameThree.status, 200, `frame 3 extracts (${frameThree.body.error ?? ''})`)
  assert.equal(frameThree.body.assetReference.kind, 'image', 'the extracted frame is an image asset')
  assert.equal(frameFour.body.assetReference.kind, 'image')
  assert.notEqual(frameThree.body.assetReference.relPath, frameFour.body.assetReference.relPath, 'frames resolve to distinct artifacts')
  assert.notEqual(frameThree.body.assetReference.relPath, heroState.body.attempt.candidate.assetReference.relPath, 'a frame is not the clip artifact')

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
  assert.deepEqual(rolling.body.document.body.spans.find((span) => span.id === spanC.id).stepSlots[0].selectedRollingReference, { attemptId: tweenAttemptC, frameIndex: 7, poseDescription: null, facing: null })

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

  // SEQUENCE — the selected key window (task 12, §5.2/§11.2): the attempt
  // targets the window's START key while the draft names the END key; the
  // landing mints NOTHING (the clip surfaces through editorial selection).
  const beforeSequence = contribution.body.document
  const sequence = await api.post('/api/lan/animation/attempts', {
    documentId: docC.id, tool: 'sequence', targetId: keyC1, idempotencyKey: 'idem-c-sequence',
    draft: sequenceDraft(keyC1, keyC2),
  })
  assert.equal(sequence.status, 200, `the sequence attempt submits (${sequence.body.error ?? ''})`)
  sequenceAttemptC = sequence.body.attemptId
  await fabric.waitFor(
    (envelopes) => envelopes.some((envelope) => envelope.ch === 'animation' && envelope.type === 'attempt-ready' && envelope.payload.attemptId === sequenceAttemptC),
    'the sequence attempt landing',
  )
  const sequenceState = await api.get(`/api/lan/animation/attempt?id=${sequenceAttemptC}`)
  assert.equal(sequenceState.status, 200)
  assert.equal(sequenceState.body.attempt.execution, 'ready')
  assert.ok(sequenceState.body.attempt.candidate.assetReference.relPath, 'the landed window clip is a registered blob')
  assert.equal(sequenceState.body.attempt.candidate.id, null, 'a sequence landing mints no document candidate')
  const sequenceReady = fabric.envelopes.find((envelope) => envelope.ch === 'animation' && envelope.type === 'attempt-ready' && envelope.payload.attemptId === sequenceAttemptC)
  assert.equal(sequenceReady?.payload.candidateId, null, 'the sequence attempt-ready envelope carries candidateId null (§8.2: nothing auto-lands into the body)')
  // The widened view (F2 + task 12's sequence fields): the FROZEN WINDOW —
  // targetId IS the start key, windowEndKeyId names the end, the beats and
  // the preservation ride verbatim (the re-roll's resubmission input).
  const seq = sequenceState.body.attempt
  assert.equal(seq.tool, 'sequence')
  assert.equal(seq.targetId, keyC1, 'the attempt targets the window START key (§11.2 "sequence attempts capture a selected key window")')
  assert.equal(seq.windowEndKeyId, keyC2, 'the frozen draft names the window END key')
  assert.deepEqual(seq.sequenceActions, sequenceDraft(keyC1, keyC2).orderedActions, 'the ordered beats froze verbatim')
  assert.equal(seq.sequencePreservation, sequenceDraft(keyC1, keyC2).preservation, 'the preservation froze verbatim')
  assert.equal(seq.sequenceOverrides.medium, 'flat cel colour on white', 'the resolved overrides froze with the caption')
  // The §6.2 sequence caption: alignment first, Subject on twos, the beats
  // in order, Preserve last — and none of the hero/tween section headers.
  assert.ok(seq.caption.startsWith('Alignment:'), 'the alignment line opens the caption')
  assert.ok(seq.caption.includes('animated on twos in flat cel colour on white'), 'Subject carries the on-twos phrase and the medium')
  assert.ok(seq.caption.includes(`Action: ${sequenceDraft(keyC1, keyC2).orderedActions.join('; ')}`), 'the beats join in order')
  assert.ok(seq.caption.endsWith(`Preserve: ${sequenceDraft(keyC1, keyC2).preservation}`), 'Preserve closes the caption verbatim')
  assert.ok(!seq.caption.includes('SCENE:') && !seq.caption.includes('STATIC:') && !seq.caption.includes('FIRST FRAME'), 'the sequence template owns its own section set')
  // §8.2's never-silently list for this lane: the landing changed NO body
  // truth — no slot materialized, no candidate moved, the revision unmoved.
  const sequenceDocumentC = (await api.get(`/api/lan/animation/document?id=${docC.id}`)).body.document
  assert.equal(sequenceDocumentC.revision, beforeSequence.revision, 'a sequence landing bumps no revision')
  assert.equal(sequenceDocumentC.body.keys.length, beforeSequence.body.keys.length, 'no slot materialized (the hero lane\'s landing arm is not this lane\'s)')
  for (const slot of beforeSequence.body.keys) {
    const after = sequenceDocumentC.body.keys.find((entry) => entry.id === slot.id)
    assert.equal(after.candidates.length, slot.candidates.length, `key ${slot.id} gained nothing from the window landing`)
    assert.equal(after.selectedCandidateId, slot.selectedCandidateId, `key ${slot.id}'s selection never moved`)
  }
  // The document read's attempts carry the same frozen window truth (the
  // review re-attaches by targetId after a reload, F2's ruling).
  const seqInView = sequenceDocumentC.attempts.find((attempt) => attempt.attemptId === sequenceAttemptC)
  assert.equal(seqInView.tool, 'sequence')
  assert.equal(seqInView.targetId, keyC1)
  assert.equal(seqInView.windowEndKeyId, keyC2)

  // Task 13 — the editorial lane over HTTP: the sequence clip contributes
  // SPANLESS (§11.2 — the window take owns no span), and the list reorders
  // and removes through the editorial route (§9's ordered list).
  const seqContribution = await api.post('/api/lan/animation/select/clip-contribution', {
    documentId: docC.id, spanId: null, attemptId: sequenceAttemptC, inFrame: 0, outFrame: 20, holdDuration: 2, expectedRevision: sequenceDocumentC.revision,
  })
  assert.equal(seqContribution.status, 200, `the spanless contribution selects (${seqContribution.body.error ?? ''})`)
  const editorialC = seqContribution.body.document.body.editorial
  assert.equal(editorialC.length, 2)
  assert.equal(editorialC[1].spanId, null, 'the whole-scene lane carries spanId null')
  // The lane refusals are named 400s: a tween clip rides its span, a hero
  // clip's product is a key drawing.
  const tweenSpanless = await api.post('/api/lan/animation/select/clip-contribution', {
    documentId: docC.id, spanId: null, attemptId: tweenAttemptC, inFrame: 0, outFrame: 4, holdDuration: 0, expectedRevision: seqContribution.body.document.revision,
  })
  assert.equal(tweenSpanless.status, 400)
  assert.match(tweenSpanless.body.error, /through its span/)
  const heroSpanless = await api.post('/api/lan/animation/select/clip-contribution', {
    documentId: docC.id, spanId: null, attemptId: heroAttemptC, inFrame: 0, outFrame: 4, holdDuration: 0, expectedRevision: seqContribution.body.document.revision,
  })
  assert.equal(heroSpanless.status, 400)
  assert.match(heroSpanless.body.error, /hero/)
  // REORDER: the ordered list is the assembled sequence's order.
  const reordered = await api.post('/api/lan/animation/editorial', {
    documentId: docC.id, op: 'reorder', orderedIds: [editorialC[1].id, editorialC[0].id], expectedRevision: seqContribution.body.document.revision,
  })
  assert.equal(reordered.status, 200, `the reorder lands (${reordered.body.error ?? ''})`)
  assert.deepEqual(reordered.body.document.body.editorial.map((entry) => entry.id), [editorialC[1].id, editorialC[0].id])
  const partialReorder = await api.post('/api/lan/animation/editorial', {
    documentId: docC.id, op: 'reorder', orderedIds: [editorialC[0].id], expectedRevision: reordered.body.document.revision,
  })
  assert.equal(partialReorder.status, 400, 'a partial ordered list is refused')
  // REMOVE: the list is editable through the same route.
  const removed = await api.post('/api/lan/animation/editorial', {
    documentId: docC.id, op: 'remove', contributionId: editorialC[0].id, expectedRevision: reordered.body.document.revision,
  })
  assert.equal(removed.status, 200)
  assert.deepEqual(removed.body.document.body.editorial.map((entry) => entry.id), [editorialC[1].id])
  for (const reason of ['editorial.reorder', 'editorial.remove']) {
    await fabric.waitFor(
      (envelopes) => envelopes.some((envelope) => envelope.ch === 'animation' && envelope.type === 'document-changed' && envelope.payload.documentId === docC.id && envelope.payload.reason === reason),
      `the document-changed envelope for ${reason}`,
    )
  }
  // T12-M2: the sequence arm refuses an EMPTY beat list before anything
  // dispatches (one length term — the panel gates it, the route is the gate).
  const emptyBeats = await api.post('/api/lan/animation/attempts', {
    documentId: docC.id, tool: 'sequence', targetId: keyC1, idempotencyKey: 'idem-c-seq-empty-beats',
    draft: { ...sequenceDraft(keyC1, keyC2), orderedActions: [] },
  })
  assert.equal(emptyBeats.status, 400)
  assert.match(emptyBeats.body.error, /1 to 64/)
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
  const body = { documentId: docD.id, tool: 'hero', targetId: uuid(), idempotencyKey: 'idem-d', draft }
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
  // §5.2 (task 11): the hero generates the NEXT key — a target equal to the
  // source is the re-roll this contract forbids; a non-UUID target can never
  // materialize as a key slot; a source key with no selected candidate has
  // no reference to freeze.
  const selfTarget = await api.post('/api/lan/animation/attempts', { ...body, idempotencyKey: 'idem-d-bad2', targetId: key.keyId })
  assert.equal(selfTarget.status, 400)
  assert.match(selfTarget.body.error, /NEXT key/)
  const notAUuid = await api.post('/api/lan/animation/attempts', { ...body, idempotencyKey: 'idem-d-bad3', targetId: 'not-a-uuid' })
  assert.equal(notAUuid.status, 400)
  assert.match(notAUuid.body.error, /UUID target key slot/)
  const unselected = await api.post('/api/lan/animation/keys', {
    op: 'add-candidate', documentId: docD.id, keyId: uuid(), expectedRevision: (await api.get(`/api/lan/animation/document?id=${docD.id}`)).body.document.revision,
    candidate: { id: uuid(), assetReference: { assetId: `animref-${uuid().slice(0, 8)}`, relPath: null, kind: 'image' }, origin: 'import', provenance: { assetId: 'animref-unselected' }, poseDescription: null, facing: null },
  })
  assert.equal(unselected.status, 200)
  const unselectedKey = unselected.body.document.body.keys.find((entry) => entry.candidates.length > 0 && entry.selectedCandidateId === null)
  assert.ok(unselectedKey, 'the unselected key slot exists')
  const noSelection = await api.post('/api/lan/animation/attempts', { ...body, idempotencyKey: 'idem-d-bad4', targetId: uuid(), draft: heroDraft(unselectedKey.id) })
  assert.equal(noSelection.status, 400)
  assert.match(noSelection.body.error, /no selected candidate/)
  const missingSource = await api.post('/api/lan/animation/attempts', { ...body, idempotencyKey: 'idem-d-bad5', targetId: uuid(), draft: heroDraft(uuid()) })
  assert.equal(missingSource.status, 404, 'a source key that does not exist is a 404')
  // §5.2 (task 12) in the sequence lane: a window spans two DISTINCT keys —
  // the same key as both endpoints is the degenerate window, refused by
  // name; and the draft must name the window start as its target.
  const sequenceBody = { documentId: docD.id, tool: 'sequence', targetId: key.keyId, idempotencyKey: 'idem-d-bad-seq', draft: sequenceDraft(key.keyId, key.keyId) }
  const selfWindow = await api.post('/api/lan/animation/attempts', sequenceBody)
  assert.equal(selfWindow.status, 400)
  assert.match(selfWindow.body.error, /two distinct keys/)
  const mismatched = await api.post('/api/lan/animation/attempts', { ...sequenceBody, idempotencyKey: 'idem-d-bad-seq2', targetId: uuid(), draft: sequenceDraft(key.keyId, uuid()) })
  assert.equal(mismatched.status, 400)
  assert.match(mismatched.body.error, /window start key as its target/)

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
  const proposedF = uuid()
  const submitted = await api.post('/api/lan/animation/attempts', {
    documentId: docF.id, tool: 'hero', targetId: proposedF, idempotencyKey: 'idem-f',
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
  // §5.2: the reconciled candidate landed on the PROPOSED slot (materialized
  // by the landing, selection null); the SOURCE key is untouched.
  const slot = document.body.document.body.keys.find((entry) => entry.id === proposedF)
  assert.ok(slot, 'the proposed slot materialized with the reconciled candidate')
  assert.equal(slot.candidates.length, 1, 'the reconciled candidate landed on the proposed slot')
  assert.equal(slot.selectedCandidateId, null, 'the reconciliation changed no selection')
  const sourceKey = document.body.document.body.keys.find((entry) => entry.id === key.keyId)
  assert.equal(sourceKey.candidates.length, 1, 'the source key gained nothing')
  assert.equal(sourceKey.selectedCandidateId, key.candidateId, 'the reconciliation changed no selection')
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
  const proposedG = uuid()
  const submitted = await apiB.post('/api/lan/animation/attempts', {
    documentId: docG.id, tool: 'hero', targetId: proposedG, idempotencyKey: 'idem-g-prep',
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

  // F1: the transient engine truth gap no longer starves preparation — the
  // landed clip is DURABLE. The job's history record disappears from every
  // /history answer (the reversible mask), and the explicit retry still
  // re-proposes: the frame-resolution seam decodes the SAME deterministic
  // proposal straight from the registered clip.
  const jobId = Object.entries(await engineHistoryAll()).find(([, record]) => record.prompt?.[3]?.attempt_id === attemptId)?.[0]
  assert.ok(jobId, 'the engine holds the attempt’s history record')
  await engineControl({ hideHistoryFor: jobId })

  const masked = await apiB.post('/api/lan/animation/attempt/retry-preparation', { attemptId })
  assert.equal(masked.status, 200, `the retry endpoint answers (${masked.body.error ?? ''})`)
  assert.equal(masked.body.retried, true)
  state = (await apiB.get(`/api/lan/animation/attempt?id=${attemptId}`)).body.attempt
  assert.equal(state.preparation.state, 'proposed', 'the retry re-proposes through the DURABLE clip — history gone is no longer a preparation failure')
  assert.equal(state.execution, 'ready', 'the landed clip is PRESERVED (§11.4)')
  assert.ok(state.candidate)
  assert.equal(state.preparation.proposedFrameIndex, Math.floor(state.candidate.frameCount / 2), 'the SAME deterministic mid-clip proposal')
  await engineControl({ hideHistoryFor: null })
  assert.equal(await engineRecordCount(), countBefore + 1, 'exactly the ONE render — preparation retrying NEVER re-rendered')

  // The preparation-FAILURE class keeps its HTTP pin (the M2 refusal as the
  // deterministic injection): an engine whose image listing under-delivers
  // versus its own graph refuses the LANDING's mid-clip proposal BY NAME —
  // the clip stays landed, execution ready (§11.4 preserve-the-clip), and
  // the retry keeps refusing while the engine's own listing is short (engine
  // truth, not a transient gap).
  await engineControl({ underdeliverFrames: 12 })
  const short = await apiB.post('/api/lan/animation/attempts', {
    documentId: docG.id, tool: 'hero', targetId: uuid(), idempotencyKey: 'idem-g-prep-short',
    draft: heroDraft(key.keyId),
  })
  assert.equal(short.status, 200, `the under-delivering attempt submits (${short.body.error ?? ''})`)
  let shortState = null
  await waitUntil(async () => {
    const response = await apiB.get(`/api/lan/animation/attempt?id=${short.body.attemptId}`)
    shortState = response.body.attempt
    return shortState?.execution === 'ready'
  }, 20_000, 'the under-delivering attempt resolving with its clip preserved')
  assert.equal(shortState.preparation.state, 'failed', 'the out-of-listing proposal is the named refusal (the message itself is pinned in the rendering suite\'s M2 leg — the HTTP state view carries only the state)')
  assert.ok(shortState.candidate, '§11.4: the rendered clip is PRESERVED when preparation fails')
  const shortRetry = await apiB.post('/api/lan/animation/attempt/retry-preparation', { attemptId: short.body.attemptId })
  assert.equal(shortRetry.status, 200)
  shortState = (await apiB.get(`/api/lan/animation/attempt?id=${short.body.attemptId}`)).body.attempt
  assert.equal(shortState.preparation.state, 'failed', 'the retry keeps refusing while the listing is short — no wrong frame, ever')
  await engineControl({ underdeliverFrames: 0 })
  assert.equal(await engineRecordCount(), countBefore + 2, 'two renders total — nothing re-rendered for any preparation work')

  // The refusal class: an attempt that never landed has no preparation to
  // retry (400); an unknown attempt is a 404.
  await engineControl({ failMode: 'error' })
  const doomed = await apiB.post('/api/lan/animation/attempts', {
    documentId: docG.id, tool: 'hero', targetId: uuid(), idempotencyKey: 'idem-g-prep-doomed',
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

// ---------------------------------------------------------------------------
// (h) the promoted-frame continuation (task 15): a tween step 2+ whose near
//     reference is a PROMOTED FRAME resolves it to the EXTRACTED frame image
//     at submit time — the frozen reference is an image asset (the image-only
//     rule's old refusal of the clip artifact is gone), and the engine
//     receives the extracted frame as its uploaded near reference.
// ---------------------------------------------------------------------------

test('(h) a tween step 2+ freezes the EXTRACTED promoted frame as its near reference — the image-only refusal is flipped', async () => {
  const created = await apiB.post('/api/lan/animation/documents', { projectId, name: 'Hotel', binding: makeBinding() })
  assert.equal(created.status, 200)
  const docH = created.body.document
  const from = await makeSelectedKey(apiB, docH.id, docH.revision, 'h-from')
  const to = await makeSelectedKey(apiB, docH.id, from.revision, 'h-to')

  const span = await apiB.post('/api/lan/animation/spans', {
    op: 'insert', documentId: docH.id, fromKeyId: from.keyId, toKeyId: to.keyId,
    intent: { movement: 'she pushes off the back foot into a full stride', preservation: 'coat hem and scarf stay consistent' },
    expectedRevision: to.revision,
  })
  assert.equal(span.status, 200, `the span inserts (${span.body.error ?? ''})`)
  const spanId = span.body.spanId
  const stepOne = span.body.document.body.spans.find((entry) => entry.id === spanId).stepSlots[0].id

  // Step 1 renders and lands; the reviewer selects frame 5 (NOT the proposed
  // mid-clip frame, so the selection rides the on-demand path too).
  const first = await apiB.post('/api/lan/animation/attempts', {
    documentId: docH.id, tool: 'tween', targetId: stepOne, idempotencyKey: 'idem-h-step-1',
    draft: { tool: 'tween', targetStepSlotId: stepOne, movementStep: 'she pushes off the back foot', overrides: { medium: 'clean line on white' } },
  })
  assert.equal(first.status, 200, `step 1 submits (${first.body.error ?? ''})`)
  await waitUntil(async () => {
    const response = await apiB.get(`/api/lan/animation/attempt?id=${first.body.attemptId}`)
    return response.body.attempt?.execution === 'ready' && response.body.attempt?.candidate !== null
  }, 30_000, 'step 1 landing')
  const stepOneView = (await apiB.get(`/api/lan/animation/document?id=${docH.id}`)).body.document
  const stepOneSlot = stepOneView.body.spans.find((entry) => entry.id === spanId).stepSlots[0]
  assert.deepEqual(stepOneSlot.attempts, [first.body.attemptId])
  const selected = await apiB.post('/api/lan/animation/select/rolling-reference', {
    documentId: docH.id, spanId, attemptId: first.body.attemptId, frameIndex: 5, expectedRevision: stepOneView.revision,
  })
  assert.equal(selected.status, 200, `the rolling reference selects (${selected.body.error ?? ''})`)

  // The chain advances (the F1 append) — and step 2 SUBMITS CLEAN where this
  // build's old honest limit refused the clip artifact as a video asset: the
  // route resolves the near reference through the frame-resolution seam, so
  // the frozen reference is the EXTRACTED frame IMAGE.
  const appended = await apiB.post('/api/lan/animation/spans', {
    op: 'append-step-slot', documentId: docH.id, spanId, expectedRevision: selected.body.document.revision,
  })
  assert.equal(appended.status, 200, `the step slot appends (${appended.body.error ?? ''})`)
  const stepTwo = appended.body.stepSlotId

  // The extracted frame the seam must freeze: on-demand extraction of frame 5
  // (a REGISTERED image distinct from the clip) — resolved here first only to
  // pin what the submission freezes, not to feed it.
  const extracted = await apiB.post('/api/lan/animation/attempt/extract-frame', { attemptId: first.body.attemptId, frameIndex: 5 })
  assert.equal(extracted.status, 200, `frame 5 extracts (${extracted.body.error ?? ''})`)
  assert.equal(extracted.body.assetReference.kind, 'image')
  const clipRelPath = (await apiB.get(`/api/lan/animation/attempt?id=${first.body.attemptId}`)).body.attempt.candidate.assetReference.relPath
  assert.notEqual(extracted.body.assetReference.relPath, clipRelPath)

  const second = await apiB.post('/api/lan/animation/attempts', {
    documentId: docH.id, tool: 'tween', targetId: stepTwo, idempotencyKey: 'idem-h-step-2',
    draft: { tool: 'tween', targetStepSlotId: stepTwo, movementStep: 'the stride opens through the hips', overrides: { medium: 'clean line on white' } },
  })
  assert.equal(second.status, 200, `step 2 submits against the promoted frame (${second.body.error ?? ''})`)

  // The frozen reference IS the extracted image (the snapshot the attempt
  // carries; the clip would have been refused as a video asset — reaching
  // the engine at all is the flip's proof).
  await waitUntil(async () => {
    const response = await apiB.get(`/api/lan/animation/attempt?id=${second.body.attemptId}`)
    return response.body.attempt?.execution === 'ready'
  }, 30_000, 'step 2 landing')
  const stepTwoRecord = (await engineRecordsFor(second.body.attemptId))[0]
  assert.ok(stepTwoRecord, 'the engine holds step 2\'s submitted graph')
  const stepTwoGraph = stepTwoRecord.prompt[2]
  const loadImageNodes = Object.values(stepTwoGraph).filter((node) => node?.class_type === 'LoadImage')
  assert.ok(
    loadImageNodes.some((node) => node.inputs.image === engineInputName({ ...extracted.body.assetReference, kind: 'image' })),
    'the engine received the EXTRACTED frame as step 2\'s uploaded near reference',
  )
})

// ---------------------------------------------------------------------------
// (i) the final review's F1 at the route — the engine's history is VOLATILE;
//     a LANDED take whose history is WIPED still feeds the chain from the
//     DURABLE registered clip: the extract-frame endpoint (hero acceptance's
//     server half — state.ts ALWAYS extracts) and the step-2 promoted-near
//     submit both answer where the engine-coupled build 400'd.
// ---------------------------------------------------------------------------

test('(i) a history-wiped landed take still feeds the chain — extraction answers and step 2 submits from the durable clip', async () => {
  await engineControl({ videoOnly: true })
  try {
    const created = await apiB.post('/api/lan/animation/documents', { projectId, name: 'India', binding: makeBinding() })
    assert.equal(created.status, 200)
    const docI = created.body.document
    const from = await makeSelectedKey(apiB, docI.id, docI.revision, 'i-from')
    const to = await makeSelectedKey(apiB, docI.id, from.revision, 'i-to')
    const span = await apiB.post('/api/lan/animation/spans', {
      op: 'insert', documentId: docI.id, fromKeyId: from.keyId, toKeyId: to.keyId,
      intent: { movement: 'she pushes off the back foot into a full stride', preservation: 'coat hem and scarf stay consistent' },
      expectedRevision: to.revision,
    })
    assert.equal(span.status, 200, `the span inserts (${span.body.error ?? ''})`)
    const spanId = span.body.spanId
    const stepOne = span.body.document.body.spans.find((entry) => entry.id === spanId).stepSlots[0].id

    const first = await apiB.post('/api/lan/animation/attempts', {
      documentId: docI.id, tool: 'tween', targetId: stepOne, idempotencyKey: 'idem-i-step-1',
      draft: { tool: 'tween', targetStepSlotId: stepOne, movementStep: 'she pushes off the back foot', overrides: { medium: 'clean line on white' } },
    })
    assert.equal(first.status, 200, `step 1 submits (${first.body.error ?? ''})`)
    await waitUntil(async () => {
      const response = await apiB.get(`/api/lan/animation/attempt?id=${first.body.attemptId}`)
      return response.body.attempt?.execution === 'ready' && response.body.attempt?.candidate !== null
    }, 30_000, 'step 1 landing (its clip registered at landing)')
    const stepOneClip = (await apiB.get(`/api/lan/animation/attempt?id=${first.body.attemptId}`)).body.attempt.candidate.assetReference.relPath
    assert.ok(stepOneClip)

    // The engine forgets EVERY history record — the irreversible restart
    // shape. The registered clip stays in the app's own blob store.
    await engineControl({ wipe: true })
    assert.equal((await engineRecordsFor(first.body.attemptId)).length, 0, 'the engine holds no record for the landed step-1 take')

    // Hero acceptance's server half: state.ts accepts a hero frame through
    // the extract-frame endpoint on EVERY acceptance — against wiped history
    // it answers a registered IMAGE decoded from the durable clip.
    const extracted = await apiB.post('/api/lan/animation/attempt/extract-frame', { attemptId: first.body.attemptId, frameIndex: 5 })
    assert.equal(extracted.status, 200, `frame 5 extracts against wiped history (${extracted.body.error ?? ''})`)
    assert.equal(extracted.body.assetReference.kind, 'image')
    assert.notEqual(extracted.body.assetReference.relPath, stepOneClip, 'the frame is not the clip artifact')

    // The chain's advancement: select the promoted frame, append step 2, and
    // SUBMIT — the old build 400'd at promotedNear resolution here; the
    // durable fallback carries the submit clean.
    const stepOneView = (await apiB.get(`/api/lan/animation/document?id=${docI.id}`)).body.document
    const selected = await apiB.post('/api/lan/animation/select/rolling-reference', {
      documentId: docI.id, spanId, attemptId: first.body.attemptId, frameIndex: 5, expectedRevision: stepOneView.revision,
    })
    assert.equal(selected.status, 200, `the rolling reference selects (${selected.body.error ?? ''})`)
    const appended = await apiB.post('/api/lan/animation/spans', {
      op: 'append-step-slot', documentId: docI.id, spanId, expectedRevision: selected.body.document.revision,
    })
    assert.equal(appended.status, 200, `the step slot appends (${appended.body.error ?? ''})`)
    const stepTwo = appended.body.stepSlotId

    const second = await apiB.post('/api/lan/animation/attempts', {
      documentId: docI.id, tool: 'tween', targetId: stepTwo, idempotencyKey: 'idem-i-step-2',
      draft: { tool: 'tween', targetStepSlotId: stepTwo, movementStep: 'the stride opens through the hips', overrides: { medium: 'clean line on white' } },
    })
    assert.equal(second.status, 200, `step 2 submits against the history-wiped take (${second.body.error ?? ''})`)

    // The frozen near reference IS the durable-path extracted image: step
    // 2's own engine record (fresh — the wipe predates it) shows it as the
    // uploaded near reference.
    await waitUntil(async () => {
      const response = await apiB.get(`/api/lan/animation/attempt?id=${second.body.attemptId}`)
      return response.body.attempt?.execution === 'ready'
    }, 30_000, 'step 2 landing')
    const stepTwoRecord = (await engineRecordsFor(second.body.attemptId))[0]
    assert.ok(stepTwoRecord, 'the engine holds step 2\'s submitted graph')
    const stepTwoGraph = stepTwoRecord.prompt[2]
    const loadImageNodes = Object.values(stepTwoGraph).filter((node) => node?.class_type === 'LoadImage')
    assert.ok(
      loadImageNodes.some((node) => node.inputs.image === engineInputName({ ...extracted.body.assetReference, kind: 'image' })),
      'the engine received the DURABLE-path extracted frame as step 2\'s uploaded near reference',
    )
  } finally {
    await engineControl({ videoOnly: false })
  }
})

// ---------------------------------------------------------------------------
// (j) the final review's M6 — the idempotency check precedes the promoted-
//     near extraction: a same-key retry of a promoted-near submit while the
//     engine is UNREACHABLE answers the idempotent return. The engine being
//     DEAD makes the pin strict — any extraction call would have thrown, so
//     the 200 itself proves none fired.
// ---------------------------------------------------------------------------

test('(j) a same-key retry of a promoted-near submit with the engine DOWN answers { created: false } — no extraction call', async () => {
  const created = await apiB.post('/api/lan/animation/documents', { projectId, name: 'Juliet', binding: makeBinding() })
  assert.equal(created.status, 200)
  const docJ = created.body.document
  const from = await makeSelectedKey(apiB, docJ.id, docJ.revision, 'j-from')
  const to = await makeSelectedKey(apiB, docJ.id, from.revision, 'j-to')
  const span = await apiB.post('/api/lan/animation/spans', {
    op: 'insert', documentId: docJ.id, fromKeyId: from.keyId, toKeyId: to.keyId,
    intent: { movement: 'the weight settles back onto the heel', preservation: 'silhouette intact' },
    expectedRevision: to.revision,
  })
  assert.equal(span.status, 200, `the span inserts (${span.body.error ?? ''})`)
  const spanId = span.body.spanId
  const stepOne = span.body.document.body.spans.find((entry) => entry.id === spanId).stepSlots[0].id

  const first = await apiB.post('/api/lan/animation/attempts', {
    documentId: docJ.id, tool: 'tween', targetId: stepOne, idempotencyKey: 'idem-j-step-1',
    draft: { tool: 'tween', targetStepSlotId: stepOne, movementStep: 'the weight settles', overrides: { medium: 'clean line on white' } },
  })
  assert.equal(first.status, 200, `step 1 submits (${first.body.error ?? ''})`)
  await waitUntil(async () => {
    const response = await apiB.get(`/api/lan/animation/attempt?id=${first.body.attemptId}`)
    return response.body.attempt?.execution === 'ready' && response.body.attempt?.candidate !== null
  }, 30_000, 'step 1 landing')
  const stepOneView = (await apiB.get(`/api/lan/animation/document?id=${docJ.id}`)).body.document
  const selected = await apiB.post('/api/lan/animation/select/rolling-reference', {
    documentId: docJ.id, spanId, attemptId: first.body.attemptId, frameIndex: 5, expectedRevision: stepOneView.revision,
  })
  assert.equal(selected.status, 200, `the rolling reference selects (${selected.body.error ?? ''})`)
  const appended = await apiB.post('/api/lan/animation/spans', {
    op: 'append-step-slot', documentId: docJ.id, spanId, expectedRevision: selected.body.document.revision,
  })
  assert.equal(appended.status, 200, `the step slot appends (${appended.body.error ?? ''})`)
  const stepTwo = appended.body.stepSlotId

  // The lost-response shape: a SLOW render widens the window so the step-2
  // attempt is still in flight (the document NOT yet moved by its landing —
  // a landing would bump the revision and make the retry different inputs),
  // the response is "lost", and the engine dies before the retry.
  await engineControl({ stepDelayMs: 800 })
  const body = {
    documentId: docJ.id, tool: 'tween', targetId: stepTwo, idempotencyKey: 'idem-j-step-2',
    draft: { tool: 'tween', targetStepSlotId: stepTwo, movementStep: 'the shoulders follow the turn', overrides: { medium: 'clean line on white' } },
  }
  const submitted = await apiB.post('/api/lan/animation/attempts', body)
  assert.equal(submitted.status, 200, `step 2 submits while the engine lives (${submitted.body.error ?? ''})`)
  assert.equal(submitted.body.created, true)

  engine.kill('SIGINT')
  // A signal-killed child leaves exitCode null — the EXIT EVENT is the truth
  // (the rendering suite's teardown idiom).
  const exit = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), 10_000)
    engine.once('exit', (code) => { clearTimeout(timer); resolve(code) })
  })
  assert.ok(exit !== 'timeout', 'the fake engine child exited before the retry')

  // The retry: the SAME key, the SAME draft, against a dead engine. The
  // idempotency check runs BEFORE any extraction work — the row's frozen
  // near reference is the retry's — so no engine call fires and the answer
  // is the idempotent return (the pre-fix order 400'd at extraction here).
  const retry = await apiB.post('/api/lan/animation/attempts', body)
  assert.equal(retry.status, 200, `the dead-engine retry answers the idempotent return (${retry.body.error ?? ''})`)
  assert.deepEqual(retry.body, { attemptId: submitted.body.attemptId, created: false })
})

// ---------------------------------------------------------------------------
// (k) wave 1 (the live review's #1) — registry-driven model resolution at
//     the route: a dead slot answers the named 400 with NOTHING spent (no
//     attempt row, no engine submission), and a healthy submit's received
//     graph carries the RESOLVED names — the standing profile enumerates
//     DIFFERENT names than the pinned constants, so resolution is exercised
//     at the wire, never echoed
// ---------------------------------------------------------------------------

test('(k) a dead model slot answers the named 400 with nothing persisted; the received graph carries the RESOLVED names', async () => {
  // (j) killed the engine — bring it back on the same port (the boot shape
  // the suite has used all along).
  engine = spawn(process.execPath, [
    path.join(REPO, 'e2e', 'mirror', 'fakeEngineServer.mjs'),
    '--port', String(enginePort),
    '--profile', path.join('e2e/mirror/profiles/animation-h3.json'),
  ], { cwd: REPO, stdio: ['ignore', 'ignore', 'pipe'] })
  engine.stderr.on('data', (chunk) => { process.stderr.write(`[fake-engine] ${chunk}`) })
  await waitUntil(async () => {
    try { return (await engineFetch('/system_stats')).ok } catch { return false }
  }, 15_000, 'the fake engine restarting on its port')

  const created = await apiB.post('/api/lan/animation/documents', { projectId, name: 'Kilo', binding: makeBinding() })
  assert.equal(created.status, 200)
  const docK = created.body.document
  const from = await makeSelectedKey(apiB, docK.id, docK.revision, 'k-from')
  const to = await makeSelectedKey(apiB, docK.id, from.revision, 'k-to')
  const span = await apiB.post('/api/lan/animation/spans', {
    op: 'insert', documentId: docK.id, fromKeyId: from.keyId, toKeyId: to.keyId,
    intent: { movement: 'she pushes off the back foot into a full stride', preservation: 'coat hem stays consistent' },
    expectedRevision: to.revision,
  })
  assert.equal(span.status, 200, `the span inserts (${span.body.error ?? ''})`)
  const stepOne = span.body.document.body.spans.find((entry) => entry.id === span.body.spanId).stepSlots[0].id
  const draftBody = (idempotencyKey) => ({
    documentId: docK.id,
    tool: 'tween',
    targetId: stepOne,
    idempotencyKey,
    draft: { tool: 'tween', targetStepSlotId: stepOne, movementStep: 'she pushes off the back foot', overrides: { medium: 'clean line on white' } },
  })

  // The dead slot: the engine enumerates NOTHING for the clip.
  const countBefore = await engineRecordCount()
  await engineControl({ loaderEnumerations: { unet: ['minimax_h3_ref2va_pruned_int8_convrot.safetensors'], clip: [], vae: ['minimax_h3_video_vae_fp16.safetensors'], lora: ['h3_tween_step12000.safetensors'] } })
  let refused
  try {
    refused = await apiB.post('/api/lan/animation/attempts', draftBody('idem-k-dead'))
  } finally {
    await engineControl({ loaderEnumerations: null })
  }
  assert.equal(refused.status, 400, 'the dead slot is the structured validation refusal')
  assert.match(refused.body.error, /textEncoder/)
  assert.match(refused.body.error, /CLIPLoader/)
  assert.match(refused.body.error, /qwen3vl_32b_minimax_h3_nvfp4_awq\.safetensors/)
  assert.match(refused.body.error, /qwen3vl_32b_int8_convrot\.safetensors/)
  assert.match(refused.body.error, /enumerates/)

  // NOTHING was spent: no attempt row, no engine submission.
  const view = await apiB.get(`/api/lan/animation/document?id=${docK.id}`)
  assert.equal(view.body.document.attempts.length, 0, 'no attempt row was persisted')
  assert.equal(await engineRecordCount(), countBefore, 'the engine received no submission')

  // The healthy submit: the engine's OWN record shows the RESOLVED names —
  // the profile enumerates the FLAT unet and the int8 clip, neither of
  // which is the pinned constant.
  const ok = await apiB.post('/api/lan/animation/attempts', draftBody('idem-k-ok'))
  assert.equal(ok.status, 200, `the healthy submit lands (${JSON.stringify(ok.body)})`)
  await waitUntil(async () => {
    const response = await apiB.get(`/api/lan/animation/attempt?id=${ok.body.attemptId}`)
    return response.body.attempt?.execution === 'ready'
  }, 30_000, 'the resolved submission landing')
  const record = (await engineRecordsFor(ok.body.attemptId))[0]
  assert.ok(record, 'the engine holds the submitted graph')
  const graph = record.prompt[2]
  assert.equal(Object.values(graph).find((node) => node.class_type === 'UNETLoader').inputs.unet_name, 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'the RESOLVED unet (the FLAT name the profile enumerates — not the pinned H3/ssd constant)')
  assert.equal(Object.values(graph).find((node) => node.class_type === 'CLIPLoader').inputs.clip_name, 'qwen3vl_32b_int8_convrot.safetensors', 'the RESOLVED clip (the documented preference — not the pinned nvfp4 constant)')
})

// ---------------------------------------------------------------------------
// (l) wave 1 queue-then-fail over HTTP — the deferred dispatch's durable
//     named reason: submit while the engine is DOWN (the row persists),
//     bring the engine back with an enumeration LACKING a slot, restart the
//     SERVER (the boot reconcile is the sweep), and the attempt FAILS with
//     the sanitized reason; the enumeration changes and the re-roll renders
// ---------------------------------------------------------------------------

test('(l) an offline submit fails on the fresh boot\'s sweep with the durable named reason; the re-roll renders after the enumeration changes', async () => {
  const created = await apiB.post('/api/lan/animation/documents', { projectId, name: 'Lima', binding: makeBinding() })
  assert.equal(created.status, 200)
  const docL = created.body.document
  const from = await makeSelectedKey(apiB, docL.id, docL.revision, 'l-from')
  const to = await makeSelectedKey(apiB, docL.id, from.revision, 'l-to')
  const span = await apiB.post('/api/lan/animation/spans', {
    op: 'insert', documentId: docL.id, fromKeyId: from.keyId, toKeyId: to.keyId,
    intent: { movement: 'she turns through the doorway', preservation: 'coat hem stays consistent' },
    expectedRevision: to.revision,
  })
  assert.equal(span.status, 200, `the span inserts (${span.body.error ?? ''})`)
  const stepOne = span.body.document.body.spans.find((entry) => entry.id === span.body.spanId).stepSlots[0].id
  const draftBody = (idempotencyKey) => ({
    documentId: docL.id,
    tool: 'tween',
    targetId: stepOne,
    idempotencyKey,
    draft: { tool: 'tween', targetStepSlotId: stepOne, movementStep: 'she turns through the doorway', overrides: { medium: 'clean line on white' } },
  })

  // The engine goes down; the submit is ACCEPTED (queue semantics) and the
  // row stays reconciliation-pending.
  engine.kill('SIGINT')
  let exit = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), 10_000)
    engine.once('exit', (code) => { clearTimeout(timer); resolve(code) })
  })
  assert.ok(exit !== 'timeout', 'the fake engine exited')
  const offline = await apiB.post('/api/lan/animation/attempts', draftBody(`idem-l-1-${Date.now()}`))
  assert.equal(offline.status, 200, `the offline submit is accepted (${JSON.stringify(offline.body)})`)
  const pending = await apiB.get(`/api/lan/animation/attempt?id=${offline.body.attemptId}`)
  assert.equal(pending.body.attempt.execution, 'reconciling', 'the offline dispatch stays pending')

  // The engine returns enumerating NOTHING for the lora slot; the SERVER
  // restarts on the same home and its boot reconcile resolves the deferred
  // dispatch → the attempt FAILS with the durable named reason.
  engine = spawn(process.execPath, [
    path.join(REPO, 'e2e', 'mirror', 'fakeEngineServer.mjs'),
    '--port', String(enginePort),
    '--profile', path.join('e2e/mirror/profiles/animation-h3.json'),
  ], { cwd: REPO, stdio: ['ignore', 'ignore', 'pipe'] })
  engine.stderr.on('data', (chunk) => { process.stderr.write(`[fake-engine] ${chunk}`) })
  await waitUntil(async () => {
    try { return (await engineFetch('/system_stats')).ok } catch { return false }
  }, 15_000, 'the fake engine restarting on its port')
  await engineControl({ loaderEnumerations: { unet: ['minimax_h3_ref2va_pruned_int8_convrot.safetensors'], clip: ['qwen3vl_32b_int8_convrot.safetensors'], vae: ['minimax_h3_video_vae_fp16.safetensors'], lora: [] } })

  serverB.child.kill('SIGKILL')
  await new Promise((resolve) => serverB.child.once('exit', resolve))
  const serverC = await bootServer(home, 'animation-routes C')
  const apiC = client(serverC.port)
  try {
    let failedView = null
    await waitUntil(async () => {
      const response = await apiC.get(`/api/lan/animation/attempt?id=${offline.body.attemptId}`)
      failedView = response.body.attempt
      return response.status === 200 && failedView?.execution === 'failed'
    }, 20_000, 'the fresh boot\'s sweep failing the deferred dispatch with the named reason')
    assert.equal(failedView.candidate, null)
    assert.match(failedView.failureReason, /adapterLora/, 'the durable reason names the slot')
    assert.match(failedView.failureReason, /LoraLoaderModelOnly/, 'the durable reason names the node class')
    assert.match(failedView.failureReason, /h3_tween_step12000\.safetensors/, 'the durable reason names the tried pinned adapter')
    assert.match(failedView.failureReason, /enumerates/, 'the durable reason carries the enumeration excerpt')

    // The enumeration changes (the knob restores the profile's servable
    // names); the re-roll (a NEW key) resolves and RENDERS through the
    // fresh server.
    await engineControl({ loaderEnumerations: null })
    const repair = await apiC.post('/api/lan/animation/attempts', draftBody(`idem-l-2-${Date.now()}`))
    assert.equal(repair.status, 200, `the re-roll submits (${JSON.stringify(repair.body)})`)
    await waitUntil(async () => {
      const response = await apiC.get(`/api/lan/animation/attempt?id=${repair.body.attemptId}`)
      return response.body.attempt?.execution === 'ready'
    }, 30_000, 'the re-roll rendering after the enumeration changed')
    const record = (await engineRecordsFor(repair.body.attemptId))[0]
    assert.ok(record, 'the engine holds the re-rolled graph')
    const graph = record.prompt[2]
    assert.equal(Object.values(graph).find((node) => node.class_type === 'LoraLoaderModelOnly').inputs.lora_name, 'h3_tween_step12000.safetensors', 'the re-roll resolved the pinned adapter once the engine enumerates it')
    assert.equal(Object.values(graph).find((node) => node.class_type === 'UNETLoader').inputs.unet_name, 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'the re-roll resolved the FLAT unet')
  } finally {
    serverC.child.kill('SIGKILL')
    await new Promise((resolve) => { const t = setTimeout(resolve, 5_000); serverC.child.once('exit', () => { clearTimeout(t); resolve() }) })
  }
})

// ---------------------------------------------------------------------------
// (m) wave 2a (the live review's #4, §6.4's ruling) — the image-bound
//     annotation for a selected rolling reference, over HTTP: the annotate
//     route answers in the three-selection-command shape (distinct route,
//     expectedRevision, document-changed), refuses without a live selection,
//     and the tween arm's near-reference resolution READS the pointer's
//     annotation — the frozen step-2 caption's FIRST FRAME carries the
//     authored pose/facing, and an UNANNOTATED pointer still compiles the
//     bare line (honest, never a guessed pose).
// ---------------------------------------------------------------------------

test('(m) the annotate route lands the pointer annotation; the step-2 frozen caption compiles it — bare line when unannotated', async () => {
  // (l) killed server B for its restart leg — this section owns a fresh
  // server life on the same home (the engine (l) left running).
  const serverD = await bootServer(home, 'animation-routes D')
  const apiD = client(serverD.port)
  const fabricD = openFabricCollector(serverD.port)
  await fabricD.subscribe('animation')

  const created = await apiD.post('/api/lan/animation/documents', { projectId, name: 'Mike', binding: makeBinding() })
  assert.equal(created.status, 200)
  const docM = created.body.document
  const from = await makeSelectedKey(apiD, docM.id, docM.revision, 'm-from')
  const to = await makeSelectedKey(apiD, docM.id, from.revision, 'm-to')
  const span = await apiD.post('/api/lan/animation/spans', {
    op: 'insert', documentId: docM.id, fromKeyId: from.keyId, toKeyId: to.keyId,
    intent: { movement: 'she pushes off the back foot into a full stride', preservation: 'coat hem and scarf stay consistent' },
    expectedRevision: to.revision,
  })
  assert.equal(span.status, 200, `the span inserts (${span.body.error ?? ''})`)
  const spanId = span.body.spanId
  const stepOne = span.body.document.body.spans.find((entry) => entry.id === spanId).stepSlots[0].id

  // Step 1 renders and lands; the reviewer selects frame 5 — the pointer the
  // annotation will ride.
  const first = await apiD.post('/api/lan/animation/attempts', {
    documentId: docM.id, tool: 'tween', targetId: stepOne, idempotencyKey: 'idem-m-step-1',
    draft: { tool: 'tween', targetStepSlotId: stepOne, movementStep: 'she pushes off the back foot', overrides: { medium: 'clean line on white' } },
  })
  assert.equal(first.status, 200, `step 1 submits (${first.body.error ?? ''})`)
  await waitUntil(async () => {
    const response = await apiD.get(`/api/lan/animation/attempt?id=${first.body.attemptId}`)
    return response.body.attempt?.execution === 'ready' && response.body.attempt?.candidate !== null
  }, 30_000, 'step 1 landing')
  const stepOneView = (await apiD.get(`/api/lan/animation/document?id=${docM.id}`)).body.document
  const selected = await apiD.post('/api/lan/animation/select/rolling-reference', {
    documentId: docM.id, spanId, attemptId: first.body.attemptId, frameIndex: 5, expectedRevision: stepOneView.revision,
  })
  assert.equal(selected.status, 200, `the rolling reference selects (${selected.body.error ?? ''})`)
  let revision = selected.body.document.revision

  // The chain advances FIRST (the F1 append) so an EMPTY slot stands beside
  // the selected one — the no-pointer refusal's subject.
  const appended = await apiD.post('/api/lan/animation/spans', {
    op: 'append-step-slot', documentId: docM.id, spanId, expectedRevision: revision,
  })
  assert.equal(appended.status, 200, `the step slot appends (${appended.body.error ?? ''})`)
  const stepTwo = appended.body.stepSlotId
  revision = appended.body.document.revision

  // The annotate route's refusals, each named: a slot with NO selection is a
  // state refusal (the annotation is bound to a live selection); an unknown
  // slot a 404; a non-vocabulary facing a 400; a stale expectedRevision the
  // 409 rebase surface.
  const annotate = (payload, expectedRevision) => apiD.post('/api/lan/animation/annotate/rolling-reference', {
    documentId: docM.id, spanId, stepSlotId: stepOne, annotation: payload, expectedRevision,
  })
  const unbound = await apiD.post('/api/lan/animation/annotate/rolling-reference', {
    documentId: docM.id, spanId, stepSlotId: stepTwo, annotation: { poseDescription: 'weight forward', facing: 'screen-left' }, expectedRevision: revision,
  })
  assert.equal(unbound.status, 400, 'annotating a slot with no selection is a state refusal')
  assert.match(unbound.body.error, /no selected rolling reference/)
  assert.equal((await apiD.post('/api/lan/animation/annotate/rolling-reference', {
    documentId: docM.id, spanId, stepSlotId: uuid(), annotation: { poseDescription: null, facing: null }, expectedRevision: revision,
  })).status, 404, 'an unknown step slot is a 404')
  assert.equal((await annotate({ poseDescription: null, facing: 'leftward' }, revision)).status, 400, 'a non-vocabulary facing is a 400')
  // The wire contract is the FULL annotation (the fix round's M-2): a
  // partial patch would silently clear the missing field, so an absent one
  // is a named 400 — never a wipe by omission.
  const partialPose = await apiD.post('/api/lan/animation/annotate/rolling-reference', {
    documentId: docM.id, spanId, stepSlotId: stepOne, annotation: { poseDescription: 'weight forward' }, expectedRevision: revision,
  })
  assert.equal(partialPose.status, 400, 'a patch missing facing is a 400')
  assert.match(partialPose.body.error, /facing is missing/)
  const partialFacing = await apiD.post('/api/lan/animation/annotate/rolling-reference', {
    documentId: docM.id, spanId, stepSlotId: stepOne, annotation: { facing: 'screen-left' }, expectedRevision: revision,
  })
  assert.equal(partialFacing.status, 400, 'a patch missing poseDescription is a 400')
  assert.match(partialFacing.body.error, /poseDescription is missing/)
  const stale = await annotate({ poseDescription: 'weight forward', facing: 'screen-left' }, revision - 1)
  assert.equal(stale.status, 409, 'a stale expectedRevision is the 409 rebase surface')
  assert.equal(stale.body.conflict.currentRevision, revision, 'the 409 carries the current revision')

  // Step 2 submits against the UNANNOTATED pointer first — the compile is
  // honest: the bare FIRST FRAME line, never a guessed pose.
  const takeOne = await apiD.post('/api/lan/animation/attempts', {
    documentId: docM.id, tool: 'tween', targetId: stepTwo, idempotencyKey: 'idem-m-step-2-bare',
    draft: { tool: 'tween', targetStepSlotId: stepTwo, movementStep: 'the stride opens through the hips', overrides: { medium: 'clean line on white' } },
  })
  assert.equal(takeOne.status, 200, `the unannotated step 2 submits (${takeOne.body.error ?? ''})`)
  await waitUntil(async () => {
    const response = await apiD.get(`/api/lan/animation/attempt?id=${takeOne.body.attemptId}`)
    return response.body.attempt?.execution === 'ready'
  }, 30_000, 'the unannotated step 2 landing')
  const bare = (await apiD.get(`/api/lan/animation/attempt?id=${takeOne.body.attemptId}`)).body.attempt
  assert.match(bare.caption, /FIRST FRAME \(Reference 1\)\n/, 'an unannotated pointer compiles the BARE first-frame line')

  // THE ANNOTATION: the authored pose/facing ride the pointer, the
  // document-changed envelope names the command, and the span marks stale
  // 'pose' (the same class as a key-candidate pose change).
  const annotated = await annotate({ poseDescription: 'weight settled low over the balls of the feet', facing: 'screen-left' }, revision)
  assert.equal(annotated.status, 200, `the annotation lands (${annotated.body.error ?? ''})`)
  revision = annotated.body.document.revision
  assert.deepEqual(
    annotated.body.document.body.spans.find((entry) => entry.id === spanId).stepSlots[0].selectedRollingReference,
    { attemptId: first.body.attemptId, frameIndex: 5, poseDescription: 'weight settled low over the balls of the feet', facing: 'screen-left' },
    'the annotation rides the selection pointer',
  )
  const annotatedSpan = annotated.body.document.body.spans.find((entry) => entry.id === spanId)
  assert.equal(annotatedSpan.stale, true, 'the annotation marks the span stale')
  assert.ok(annotatedSpan.staleReasons.includes('pose'), 'with the pose reason')
  await fabricD.waitFor(
    (envelopes) => envelopes.some((envelope) => envelope.ch === 'animation' && envelope.type === 'document-changed' && envelope.payload.documentId === docM.id && envelope.payload.reason === 'annotate.rolling-reference'),
    'the document-changed envelope for the annotation',
  )

  // A NO-OP annotate over HTTP (the same values the pointer already carries —
  // the fix round's M-1): 200 with the row as it stands — no revision bump.
  const noOp = await annotate({ poseDescription: 'weight settled low over the balls of the feet', facing: 'screen-left' }, revision)
  assert.equal(noOp.status, 200, `the no-op annotate answers 200 (${noOp.body.error ?? ''})`)
  assert.equal(noOp.body.document.revision, revision, 'a no-op annotate bumps nothing')

  // The compile CONSUMES it: a fresh take for the SAME step (the re-roll's
  // new idempotency key) freezes the annotated pose in its caption — the
  // frozen step-2 near-reference pose equals the authored annotation.
  const takeTwo = await apiD.post('/api/lan/animation/attempts', {
    documentId: docM.id, tool: 'tween', targetId: stepTwo, idempotencyKey: 'idem-m-step-2-annotated',
    draft: { tool: 'tween', targetStepSlotId: stepTwo, movementStep: 'the stride opens through the hips', overrides: { medium: 'clean line on white' } },
  })
  assert.equal(takeTwo.status, 200, `the annotated step 2 re-roll submits (${takeTwo.body.error ?? ''})`)
  await waitUntil(async () => {
    const response = await apiD.get(`/api/lan/animation/attempt?id=${takeTwo.body.attemptId}`)
    return response.body.attempt?.execution === 'ready'
  }, 30_000, 'the annotated step 2 landing')
  const annotatedCaption = (await apiD.get(`/api/lan/animation/attempt?id=${takeTwo.body.attemptId}`)).body.attempt.caption
  assert.ok(
    annotatedCaption.includes('FIRST FRAME (Reference 1): weight settled low over the balls of the feet, facing screen-left'),
    `the frozen caption carries the authored annotation verbatim (${annotatedCaption.split('\n')[1]})`,
  )
  // The frozen reference's pose fields carry it too (the snapshot's truth).
  const annotatedView = (await apiD.get(`/api/lan/animation/attempt?id=${takeTwo.body.attemptId}`)).body.attempt
  assert.equal(annotatedView.compilerVersion, '2', 'the compiler v2 built the annotated caption')
  // The v2 STATIC append (the live review's #3): the span's authored
  // preservation — persisted all along, never before compiled — rides the
  // frozen caption after the fixed hold.
  assert.equal(
    annotatedCaption.split('\n')[4],
    'STATIC: identity, wardrobe, and proportions stay consistent; framing and ground plane stay fixed. coat hem and scarf stay consistent',
    'the authored preservation appends to the tween STATIC section',
  )
  fabricD.close()
})

// ---------------------------------------------------------------------------
// (n) freeze-before-submission at the ROUTE (Codex batch B: I5) — the public
//     handler freezes ONE revision: a binding update landing behind the
//     submission's held enumeration await changes NOTHING the row freezes
// ---------------------------------------------------------------------------

test('(n) a binding update mid-submission leaves the frozen row at the ENTRY revision — never a hybrid of two', async () => {
  serverE = await bootServer(home, 'animation-routes E')
  apiE = client(serverE.port)

  const created = await apiE.post('/api/lan/animation/documents', { projectId, name: 'November', binding: makeBinding() })
  assert.equal(created.status, 200)
  const documentId = created.body.document.id
  const key = await makeSelectedKey(apiE, documentId, created.body.document.revision, 'n1')
  const entryRevision = (await apiE.get(`/api/lan/animation/document?id=${documentId}`)).body.document.revision

  // The engine's /object_info answers are accepted-never-answered: the
  // submit's preflight enumeration holds (bounded at 3 s inside the port) —
  // the exact await window behind which the old stamping re-read the LIVE
  // document and froze the moved binding's version onto the entry revision's
  // references/caption.
  await engineControl({ hangObjectInfo: true })
  const targetId = uuid()
  const submitPromise = fetch(`http://127.0.0.1:${serverE.port}/api/lan/animation/attempts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ documentId, tool: 'hero', targetId, idempotencyKey: 'idem-n', draft: heroDraft(key.keyId) }),
  }).then(async (response) => ({ status: response.status, body: await response.json() }))

  // The document MOVES inside the window: binding v2 lands over HTTP while
  // the submission holds. (Unhang first so the dispatch that follows the
  // aborted preflight resolves against a live engine.)
  await sleep(500)
  await engineControl({ hangObjectInfo: false })
  const moved = await apiE.post('/api/lan/animation/binding', { documentId, binding: makeBinding(), expectedRevision: entryRevision })
  assert.equal(moved.status, 200, `the binding update lands mid-flight (${moved.body.error ?? ''})`)
  assert.equal(moved.body.document.body.activeBindingVersion, 2)
  const moveLandedAt = Date.now()

  const submitted = await submitPromise
  assert.equal(submitted.status, 200, `the submission resolves (${JSON.stringify(submitted.body)}`)
  assert.equal(submitted.body.created, true)
  assert.ok(moveLandedAt < Date.now(), 'the binding move preceded the submission completing — the freeze ran against a moved document')

  // The frozen row describes the ENTRY revision alone. Pre-fix, the row
  // carried documentRevision N with bindingVersion 2 — a combination the
  // user never authored, faithfully replayed by every later dispatch.
  const external = new Database(path.join(home, 'studio.db'))
  let snapshot
  try {
    const row = external.prepare('SELECT snapshot_json FROM animation_attempt WHERE idempotency_key = ?').get('idem-n')
    assert.ok(row, 'the attempt row persisted')
    snapshot = JSON.parse(row.snapshot_json)
  } finally {
    external.close()
  }
  assert.equal(snapshot.documentRevision, entryRevision, 'the frozen revision is the entry revision')
  assert.equal(snapshot.settings.bindingVersion, 1, 'the bindingVersion stamp describes the ENTRY binding (v1) — not the mid-flight v2')
  assert.equal(snapshot.settings.width, 1344, 'the frozen settings still describe the entry document')
  const live = (await apiE.get(`/api/lan/animation/document?id=${documentId}`)).body.document
  assert.equal(live.body.activeBindingVersion, 2, 'the live document really did move (the freeze ignored it)')
  assert.equal(live.revision, entryRevision + 1)
})
