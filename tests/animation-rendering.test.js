// The rendering service + completion owner suite (task 4 of the
// animation-authoring module, spec 2026-10-06-animation-authoring-module-
// design.md §7.2 the service contract, §10 the A-1 relationship, §11.4 the
// restart-recovery policy, §12.3 the mock's behavior requirements).
//
// THE MOCK BOUNDARY (plan correction #4): there is NO mock rendering service
// and NO test double that lands candidates. The PRODUCTION completion owner
// (server/animation/completion-owner.ts) and the PRODUCTION rendering
// service (server/animation/rendering.ts) run FOR REAL against the standing
// FAKE ENGINE (e2e/mirror/fakeEngineServer.mjs + profiles/animation-h3.json)
// over real HTTP — the only faked thing is the engine endpoint. The two dep
// seams the brief itself defines (emit, prepareFrame) carry thin test
// instrumentation (an event recorder; a per-attempt override dispatcher in
// front of the PRODUCTION frame preparer — section h's failure injection);
// every dispatch, observation, landing, reconciliation, cancellation-race,
// and preparation-retry code path below is production code.
//
// Sections:
//   (a) happy path — submit resolves when persisted + enqueued (NOT when the
//       render completes); progress events advance execution to rendering;
//       the watcher's engine observation lands ONE candidate with
//       preparation proposed at a frame index; the submitted graph uses the
//       tool's node class and carries the per-attempt output prefix; the
//       clip's bytes are REGISTERED as a blob (archive round-trips carry it)
//   (b) duplicate completion (Review Focus #1) — onAttemptEvent('done')
//       twice AND a re-run observe() after history already holds the output
//       ⇒ still exactly one candidate
//   (c) selection-change race (Review Focus #2) — the document's
//       authored_revision bumps mid-render ⇒ the candidate lands with
//       earlierRevision true, selections untouched
//   (d) idempotent submit — same key + same input ⇒ { created: false }, no
//       second engine submission (fake-engine history-record delta = 0);
//       same key + different input ⇒ 409
//   (e) failure — engine failMode error ⇒ attempt failed, prior candidates
//       preserved; engine validation refusal ⇒ definitively failed, nothing
//       enqueued; input validation refuses BEFORE anything is persisted
//   (f) cancel races — cancel mid-render ⇒ cancelled, no candidate; cancel
//       after the engine completed ⇒ the landed output is PRESERVED, never
//       selected
//   (g) uncertain dispatch (§11.4) — dispatch intent lost (engine_job_id
//       nulled, watcher dropped) ⇒ reconcile() resolves the attempt by
//       ATTEMPT-IDENTIFIER SEARCH through the engine's history and lands
//       once, with the engine's submission count NOT increasing; a DEAD
//       engine port ⇒ submission stays reconciling-pending, attempt
//       preserved
//   (g2) the reconciliation queue half + the lost verdicts (review
//       Important-1/2/3): reattach-while-running (a restart mid-render
//       re-attaches observation and lands once); confirmed-lost with a KNOWN
//       job id (a wiped engine ⇒ interrupted, prior work preserved);
//       dispatch-never-landed (lost ack + empty engine ⇒ interrupted); lost
//       ack while the job still RENDERS ⇒ reconcile stays pending — the
//       queue is non-empty and bare ids cannot correlate — and the NEXT
//       sweep lands the completed record without any resubmission; and the
//       torn-window pin (completion history lags the queue ⇒ never 'lost')
//   (h) frame-preparation failure — prepareFrame rejecting twice then
//       succeeding lands proposed via bounded auto-retry; rejecting past the
//       bound preserves the clip (§11.4) with preparation failed until the
//       explicit retryPreparation succeeds — none of it re-submits
//   (i) graph contract-truth — every builder emission validates CLEAN
//       through validateGraphAgainstSchemas against the REAL captured
//       object_info (the truth ladder's top CI-able rung), the operating
//       point is pinned (euler/simple, no CFG, shift 12/3, 22f, 24fps,
//       ref_image_size max, dotted autogrow ref keys — the Set K wire-format
//       finding), and the graph the DIST build actually submitted (read back
//       from the fake engine's history) validates clean too
//
// Run after `pnpm build:server` (the service modules load from dist-server;
// the shared graph builders + the engine-contract validator + the compiler
// load as SOURCE through vitest's native TS transform — the plan's
// correction #2). Scratch homes through the Wave 4 ledger; the engine port
// through the allocator.

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
const { makePortAllocator } = require('./lib/ports.cjs')
const { makeScratchDir, removeAllScratchDirs } = require('./lib/scratch.cjs')

// SOURCE imports (vitest compiles the TS natively — the plan's correction #2):
// the shared graph builders + the engine-contract validator + the compiler.
import { validateGraphAgainstSchemas } from '../src/lib/engineContract'
import {
  ANIMATION_MODEL_DEFAULTS,
  ANIMATION_OPERATING_POINT,
  buildHeroGraph,
  buildSequenceGraph,
  buildTweenGraph,
  engineInputName,
} from '../shared/animation/graphs'
import { COMPILER_VERSION, compileHeroCaption, compileSequenceCaption, compileTweenCaption } from '../shared/animation/compiler'

const REAL_INFO = require(path.join(REPO, 'scripts/fixtures/engine-object-info.json')).nodes

// DIST imports — the production modules under test (build:server first).
const { migrateDatabase } = require(path.join(REPO, 'dist-server/server/db.js'))
const { createDocumentStore } = require(path.join(REPO, 'dist-server/server/documents.js'))
const {
  createAnimationStore,
  AnimationConflictError,
  AnimationRuleError,
} = require(path.join(REPO, 'dist-server/server/animation/store.js'))
const {
  createAnimationRenderingService,
  createComfyEnginePort,
  makeDocumentStoreBlobSink,
  makeFramePreparer,
} = require(path.join(REPO, 'dist-server/server/animation/rendering.js'))
const { createCompletionOwner } = require(path.join(REPO, 'dist-server/server/animation/completion-owner.js'))

const freePort = makePortAllocator('animation-rendering')
const uuid = () => randomUUID()
const sampleClipBytes = fs.readFileSync(path.join(REPO, 'e2e/fixtures/sample-clip.mp4'))

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntil(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await sleep(40)
  }
  if (await predicate()) return true
  throw new Error(`timed out after ${timeoutMs} ms waiting for: ${label}`)
}

// ---- the fake engine (the ONLY test double) ------------------------------

let enginePort = 0
let engine = null

// ---- cross-section state ----------------------------------------------------

let home = ''
let db = null
let documents = null
let anim = null
let sink = null
let engineClient = null
let events = []
let prepOverrides = null
let productionPreparer = null
let owner = null
let service = null
let projectId = ''

// (a)
let docA = null
let attemptA = null
let recordA = null
// (b)
let docB = null
let attemptB = null
let stepB = null
// (c)
let docC = null
let keyC = null
let selectedC = null
// (d)
let docD = null
let attemptD = null
// (e)
let docE = null
let keyE1 = null
let keyE2 = null
let keyE3 = null
// (f)
let docF = null
let keyF1 = null
let keyF2 = null
// (g)/(g2)
let docG = null
let docG2 = null
let stepG1 = null
let attemptG1 = null
let attemptG2 = null
// (h)
let docH = null
let keyH1 = null
let keyH2 = null

// ---- fixtures ----------------------------------------------------------------

function makeBinding() {
  return {
    characterDescription: 'a lanky courier in a long coat',
    referenceAssetIds: [uuid(), uuid()],
    medium: 'clean line on white',
    initialKeyAssetId: `asset-${uuid().slice(0, 8)}`,
  }
}

/** A real registered blob backing a reference image — submit VALIDATES that
 *  reference assets are readable in the store before anything is persisted. */
function registerRefImage(label) {
  const file = path.join(home, `ref-${label}-${uuid().slice(0, 8)}.png`)
  fs.writeFileSync(file, Buffer.from(`animation-reference-bytes-${label}-${uuid()}`))
  const registered = documents.registerBlobFile('image', file)
  assert.equal(registered.present, true)
  return { assetId: `animref-${label}-${uuid().slice(0, 8)}`, relPath: registered.relPath, kind: 'image' }
}

const heroOverrides = () => ({ medium: 'clean line on white', scene: 'a rain-slick street at dusk' })

function makeHeroSnapshot(targetId, revision) {
  const currentKey = registerRefImage('hero-key')
  const caption = compileHeroCaption({
    currentKey: { assetReference: currentKey, pose: { poseDescription: 'mid-stride, arms pumping', facing: 'screen-left' } },
    movementArc: 'she plants the forward foot and pushes through into a full stride, arms swinging down to the hips',
    overrides: heroOverrides(),
  })
  return {
    tool: 'hero',
    targetId,
    references: [{ role: 'current-key', assetReference: currentKey, poseDescription: 'mid-stride, arms pumping', facing: 'screen-left' }],
    caption: caption.caption,
    compilerVersion: COMPILER_VERSION,
    settings: { steps: 30, seed: 421337 },
    documentRevision: revision,
  }
}

function makeTweenSnapshot(targetId, revision) {
  const rolling = registerRefImage('tween-near')
  const far = registerRefImage('tween-far')
  const caption = compileTweenCaption({
    rollingReference: { assetReference: rolling, pose: { poseDescription: 'weight forward over the planted left foot', facing: 'screen-left' } },
    farReference: { assetReference: far, pose: { poseDescription: 'settled onto the heel, arms at the sides', facing: 'screen-right' } },
    movementStep: 'she shifts her weight onto the heel, hips following',
    overrides: { medium: 'flat black-and-white animatic' },
  })
  return {
    tool: 'tween',
    targetId,
    references: [
      { role: 'rolling-near', assetReference: rolling, poseDescription: 'weight forward over the planted left foot', facing: 'screen-left' },
      { role: 'fixed-far', assetReference: far, poseDescription: 'settled onto the heel, arms at the sides', facing: 'screen-right' },
    ],
    caption: caption.caption,
    compilerVersion: COMPILER_VERSION,
    settings: { steps: 30, seed: 421337 },
    documentRevision: revision,
  }
}

function makeSequenceSnapshot(targetId, revision) {
  const start = registerRefImage('seq-start')
  const end = registerRefImage('seq-end')
  const caption = compileSequenceCaption({
    windowStart: { assetReference: start, pose: { poseDescription: 'seated, hands folded', facing: 'toward camera' } },
    windowEnd: { assetReference: end, pose: { poseDescription: 'rising onto the balls of the feet', facing: 'screen-right' } },
    orderedActions: ['she leans forward over the folded hands', 'she rises through the knees'],
    preservation: 'silhouette and wardrobe consistent',
    overrides: { medium: 'flat cel colour on white' },
  })
  return {
    tool: 'sequence',
    targetId,
    references: [
      { role: 'window-start', assetReference: start, poseDescription: 'seated, hands folded', facing: 'toward camera' },
      { role: 'window-end', assetReference: end, poseDescription: 'rising onto the balls of the feet', facing: 'screen-right' },
    ],
    caption: caption.caption,
    compilerVersion: COMPILER_VERSION,
    settings: { steps: 30, seed: 421337 },
    documentRevision: revision,
  }
}

/** Submits a hero attempt against a FRESH proposed key slot on `doc`. */
async function submitHero(doc, keyId, idem) {
  const revision = anim.getDocument(doc.id).revision
  return service.submit({ documentId: doc.id, tool: 'hero', targetId: keyId, snapshot: makeHeroSnapshot(keyId, revision) }, idem)
}

// ---- fake-engine probes --------------------------------------------------------

const engineFetch = (pathname, init) => fetch(`http://127.0.0.1:${enginePort}${pathname}`, init)
const engineControl = async (patch) => engineFetch('/__control', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).then((r) => r.json())
const engineHistoryAll = async () => engineFetch('/history').then((r) => r.json())
async function engineRecordCount() {
  return Object.keys(await engineHistoryAll()).length
}
async function engineRecord(jobId) {
  const all = await engineHistoryAll()
  return all[jobId] ?? null
}

async function waitAttemptState(attemptId, states, label, timeoutMs = 10_000) {
  const wanted = new Set(states)
  await waitUntil(() => {
    const attempt = anim.getAttempt(attemptId)
    return attempt !== null && wanted.has(attempt.execution.state)
  }, timeoutMs, label)
  return anim.getAttempt(attemptId)
}

// ---- suite boot ------------------------------------------------------------------

beforeAll(async () => {
  // The fake engine: the standing artifact, the animation lane's profile —
  // a plain node HTTP+ws server, zero GPU, zero engine-port contact. The
  // ONLY engine the service ever sees is this base URL.
  enginePort = await freePort()
  engine = spawn(process.execPath, [
    path.join(REPO, 'e2e', 'mirror', 'fakeEngineServer.mjs'),
    '--port', String(enginePort),
    '--profile', path.join('e2e/mirror/profiles/animation-h3.json'),
  ], { cwd: REPO, stdio: ['ignore', 'ignore', 'pipe'] })
  engine.stderr.on('data', (chunk) => { process.stderr.write(`[fake-engine] ${chunk}`) })
  await waitUntil(async () => {
    try {
      const stats = await engineFetch('/system_stats')
      return stats.ok
    } catch {
      return false
    }
  }, 15_000, 'the fake engine listening on its allocated port')
  const controlState = await engineFetch('/__control').then((r) => r.json())
  assert.equal(controlState.profile, 'animation-h3', 'the mirror runs the animation profile')

  // The production wiring: scratch SQLite + the real stores + the real
  // ComfyUI port pointed at the fake engine + the real completion owner +
  // the real service. The compile seam is the shared module itself.
  home = makeScratchDir(path.join(os.tmpdir(), 'minimax-animation-rendering-'))
  db = new Database(path.join(home, 'studio.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  migrateDatabase(db)
  documents = createDocumentStore(db, { blobRoot: path.join(home, 'canvas-blobs'), appVersion: 'test' })
  anim = createAnimationStore(db, { appVersion: 'test' })
  projectId = documents.createProject({ name: 'Animation rendering' }).id
  sink = makeDocumentStoreBlobSink(documents, path.join(home, 'animation-staging'))
  engineClient = createComfyEnginePort({ baseUrl: `http://127.0.0.1:${enginePort}`, blobs: sink })
  events = []
  const emit = (type, payload) => { events.push({ type, payload }) }
  // The one instrumented seam: per-attempt overrides in FRONT of the
  // production frame preparer (section h's failure injection — keyed by
  // attemptId, or the '*' wildcard for the next attempt whose preparation
  // fires, since the attemptId only exists after submit). Every other
  // preparation runs through the real preparer.
  prepOverrides = new Map()
  productionPreparer = makeFramePreparer({ engine: engineClient, store: anim, blobs: sink })
  owner = createCompletionOwner({
    store: anim,
    engine: engineClient,
    emit,
    prepareFrame: (attemptId, frameIndex) => {
      const override = prepOverrides.has(attemptId) ? prepOverrides.get(attemptId) : prepOverrides.get('*')
      return override ? override(attemptId, frameIndex) : productionPreparer(attemptId, frameIndex)
    },
    maxAutoPrepRetries: 2,
    pollMs: 60,
  })
  service = createAnimationRenderingService({
    store: anim,
    engine: engineClient,
    owner,
    blobs: sink,
    compile: { hero: compileHeroCaption, tween: compileTweenCaption, sequence: compileSequenceCaption },
    emit,
  })
}, 120_000)

afterAll(async () => {
  owner?.stopObserving()
  try {
    db?.close()
  } catch { /* the scratch teardown below still runs */ }
  if (engine && engine.exitCode === null) {
    engine.kill('SIGINT')
    const exit = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), 10_000)
      engine.once('exit', (code) => { clearTimeout(timer); resolve(code) })
    })
    assert.ok(exit !== 'timeout', 'the fake engine child exited on SIGINT')
  }
  await removeAllScratchDirs()
})

// ---------------------------------------------------------------------------
// (a) the happy path
// ---------------------------------------------------------------------------

test('(a) submit resolves at enqueue; progress → rendering; the watcher lands ONE candidate with a proposed frame', async () => {
  docA = anim.createDocument({ projectId, name: 'Alpha', binding: makeBinding() })
  const proposedKey = uuid() // a hero attempt targets a PROPOSED key slot
  const before = await engineRecordCount()

  const submitted = await submitHero(docA, proposedKey, 'idem-a')
  assert.equal(submitted.created, true)
  assert.match(submitted.attemptId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'the attempt id is a canonical UUID')
  attemptA = submitted

  // Resolved at ENQUEUE, not completion: the attempt row already carries the
  // engine job id, the execution state is still queued/rendering, no result.
  const early = anim.getAttempt(attemptA.attemptId)
  assert.ok(early.engineJobId, 'the dispatch intent is durable — the engine job id is recorded')
  assert.ok(['queued', 'rendering'].includes(early.execution.state), 'submit resolved before the render completed')
  assert.equal(early.result, null)
  assert.equal(early.snapshot.settings.bindingVersion, docA.body.activeBindingVersion, "task 1's forward flag: the submit path stamps the binding version into the frozen settings")

  // The engine received a /prompt whose graph uses the tool's node class and
  // carries the per-attempt output prefix (reconciliation's search key).
  await waitUntil(async () => (await engineRecord(early.engineJobId)) !== null, 10_000, 'the fake engine recording the submitted job')
  recordA = await engineRecord(early.engineJobId)
  const graph = recordA.prompt[0]
  const classes = Object.values(graph).map((node) => node.class_type)
  assert.ok(classes.includes('MiniMaxH3ImageToVideo'), 'the hero graph conditions through MiniMaxH3ImageToVideo')
  const saveNode = Object.values(graph).find((node) => node.class_type === 'SaveVideo')
  assert.ok(saveNode.inputs.filename_prefix.startsWith(`animation/${attemptA.attemptId}/`), 'the engine request carries the attempt id (the SaveVideo prefix is the search key)')
  const loader = Object.values(graph).find((node) => node.class_type === 'LoadImage')
  assert.ok(loader, 'the hero reference rides a LoadImage node')
  assert.equal(loader.inputs.image, engineInputName(early.snapshot.references[0].assetReference), 'the LoadImage names the uploaded engine input (the shared naming rule)')

  // Progress events (the realtime fabric's engine feed) advance execution.
  owner.onAttemptEvent(attemptA.attemptId, { type: 'executing' })
  owner.onAttemptEvent(attemptA.attemptId, { type: 'progress', value: 1, max: 3 })
  assert.equal(anim.getAttempt(attemptA.attemptId).execution.state, 'rendering')
  assert.deepEqual(anim.getAttempt(attemptA.attemptId).execution.progress, { value: 1, max: 3 })

  // The server-side watcher observes the engine and lands the candidate.
  const landed = await waitAttemptState(attemptA.attemptId, ['ready'], 'the watcher landing the hero candidate')
  const candidate = landed.result.candidate
  assert.equal(candidate.frameCount, 22, "the operating point's clip length rides the graph")
  assert.equal(candidate.earlierRevision, false)
  assert.ok(candidate.assetReference.relPath, "the clip is a registered blob path (task 2's archive note)")
  const clipBytes = documents.readBlob(candidate.assetReference.relPath)
  assert.ok(clipBytes && clipBytes.equals(sampleClipBytes), 'the registered clip bytes are the engine output fetched through /view')

  const state = service.getState(attemptA.attemptId)
  assert.equal(state.execution, 'ready')
  assert.equal(state.preparation.state, 'proposed')
  assert.equal(state.preparation.proposedFrameIndex, 11, 'a mid-clip frame is proposed (inspectable, never auto-selected)')
  assert.deepEqual(state.candidate, candidate)

  const body = anim.getDocument(docA.id).body
  const slot = body.keys.find((entry) => entry.id === proposedKey)
  assert.ok(slot, 'the proposed key slot materialized with the landed candidate')
  assert.equal(slot.candidates.length, 1)
  assert.equal(slot.candidates[0].origin, 'hero')
  assert.equal(slot.selectedCandidateId, null, 'completion NEVER auto-selects (§8.2)')
  assert.equal(body.editorial.length, 0)
  assert.ok(events.some((event) => event.type === 'animation.attempt.submitted'), 'the fabric seam observed the submission')
  assert.ok(events.some((event) => event.type === 'animation.attempt.ready'), 'the fabric seam observed the landing')
  assert.equal(await engineRecordCount(), before + 1, 'exactly one engine submission')
})

// ---------------------------------------------------------------------------
// (b) duplicate completion (Review Focus #1)
// ---------------------------------------------------------------------------

test('(b) done-driven duplicate completion and a re-run observe() ⇒ still exactly one candidate', async () => {
  docB = anim.createDocument({ projectId, name: 'Bravo', binding: makeBinding() })
  const keyFrom = uuid()
  const keyTo = uuid()
  let row = anim.addKeyCandidate(docB.id, keyFrom, { id: uuid(), assetReference: registerRefImage('b-from'), origin: 'import', provenance: { assetId: 'stable-b1' }, poseDescription: null, facing: null }, 0)
  row = anim.addKeyCandidate(docB.id, keyTo, { id: uuid(), assetReference: registerRefImage('b-to'), origin: 'import', provenance: { assetId: 'stable-b2' }, poseDescription: null, facing: null }, row.revision)
  row = anim.insertSpan(docB.id, { fromKeyId: keyFrom, toKeyId: keyTo, intent: { movement: 'walks two steps', preservation: 'silhouette intact' } }, row.revision)
  stepB = row.body.spans[0].stepSlots[0].id

  const submitted = await service.submit(
    { documentId: docB.id, tool: 'tween', targetId: stepB, snapshot: makeTweenSnapshot(stepB, row.revision) },
    'idem-b',
  )
  attemptB = submitted
  const landed = await waitAttemptState(attemptB.attemptId, ['ready'], 'the tween attempt landing')
  const firstResult = landed.result
  const ownRevisionAfterLanding = landed.ownRevision

  // The graph used the tween tool's node class with the dotted autogrow keys.
  const graph = (await engineRecord(landed.engineJobId)).prompt[0]
  const tweenNode = Object.values(graph).find((node) => node.class_type === 'MiniMaxH3ReferenceToVideo')
  assert.ok(tweenNode, 'the tween graph conditions through MiniMaxH3ReferenceToVideo')
  assert.ok('ref_images.ref_image_0' in tweenNode.inputs && 'ref_images.ref_image_1' in tweenNode.inputs, 'the refs ride DOTTED autogrow keys (the Set K wire-format finding)')

  // A duplicate completion event — the fabric double-delivers 'done'.
  owner.onAttemptEvent(attemptB.attemptId, { type: 'done' })
  owner.onAttemptEvent(attemptB.attemptId, { type: 'done' })
  await sleep(200) // any background landing work settles
  let again = anim.getAttempt(attemptB.attemptId)
  assert.deepEqual(again.result, firstResult, 'the FIRST candidate is what stays')
  assert.equal(again.ownRevision, ownRevisionAfterLanding, 'the duplicate completion advanced nothing')

  // And the boot-style re-observation over history that ALREADY holds the
  // output: still one candidate.
  owner.observe(attemptB.attemptId)
  await sleep(250)
  again = anim.getAttempt(attemptB.attemptId)
  assert.deepEqual(again.result, firstResult, 're-observing a landed attempt is a no-op')

  const span = anim.getDocument(docB.id).body.spans[0]
  assert.deepEqual(span.stepSlots[0].attempts, [attemptB.attemptId], 'exactly one landed tween attempt on the step slot')
  assert.equal(span.stepSlots[0].selectedRollingReference, null, 'the rolling reference stays an explicit selection')
})

// ---------------------------------------------------------------------------
// (c) the selection-change race (Review Focus #2)
// ---------------------------------------------------------------------------

test('(c) an authored_revision bump mid-render ⇒ the candidate lands earlierRevision, selections untouched', async () => {
  docC = anim.createDocument({ projectId, name: 'Charlie', binding: makeBinding() })
  keyC = uuid()
  const cand1 = { id: uuid(), assetReference: registerRefImage('c-1'), origin: 'import', provenance: { assetId: 'stable-c1' }, poseDescription: null, facing: null }
  const cand2 = { id: uuid(), assetReference: registerRefImage('c-2'), origin: 'import', provenance: { assetId: 'stable-c2' }, poseDescription: null, facing: null }
  let row = anim.addKeyCandidate(docC.id, keyC, cand1, 0)
  row = anim.addKeyCandidate(docC.id, keyC, cand2, row.revision)
  row = anim.selectKeyCandidate(docC.id, keyC, cand1.id, row.revision)
  selectedC = cand1.id
  const revisionAtSubmit = row.revision

  const submitted = await submitHero(docC, keyC, 'idem-c')
  // The document moves while the render runs (§8.2: the result still lands
  // with its original provenance, "generated from an earlier version").
  row = anim.updateDocumentSettings(docC.id, { steps: 44 }, anim.getDocument(docC.id).revision)
  assert.ok(row.revision > revisionAtSubmit)

  const landed = await waitAttemptState(submitted.attemptId, ['ready'], 'the raced attempt landing')
  assert.equal(landed.result.candidate.earlierRevision, true, 'the frozen revision is behind — the candidate is marked "from an earlier version"')
  assert.equal(landed.snapshot.documentRevision, revisionAtSubmit, 'the frozen snapshot kept the submit-time revision')

  const slot = anim.getDocument(docC.id).body.keys.find((entry) => entry.id === keyC)
  assert.equal(slot.selectedCandidateId, selectedC, 'the concurrent authoring selection survives the landing untouched')
  assert.equal(slot.candidates.length, 3, 'the landed hero candidate APPENDED as an alternative')
  assert.equal(slot.candidates.filter((entry) => entry.origin === 'hero').length, 1)
})

// ---------------------------------------------------------------------------
// (d) idempotent submit
// ---------------------------------------------------------------------------

test('(d) same key + same input ⇒ { created: false }, no second engine submission; different input ⇒ 409', async () => {
  docD = anim.createDocument({ projectId, name: 'Delta', binding: makeBinding() })
  const keyD = uuid()
  const revision = anim.getDocument(docD.id).revision
  const snapshot = makeHeroSnapshot(keyD, revision)
  const input = { documentId: docD.id, tool: 'hero', targetId: keyD, snapshot }

  const first = await service.submit(input, 'idem-d')
  assert.equal(first.created, true)
  attemptD = first
  await waitAttemptState(attemptD.attemptId, ['ready'], 'the first submission landing')
  const countAfterFirst = await engineRecordCount()

  // The lost-response retry: the SAME key, the SAME input.
  const retry = await service.submit(input, 'idem-d')
  assert.equal(retry.created, false)
  assert.equal(retry.attemptId, attemptD.attemptId)
  assert.equal(await engineRecordCount(), countAfterFirst, 'no second engine submission — the expensive work is never repeated')

  // The same key with DIFFERENT inputs is a conflict (§7.2.2/§11.4).
  const changed = makeHeroSnapshot(keyD, revision)
  changed.caption = `${changed.caption}\nCHANGED INPUTS`
  await assert.rejects(
    () => service.submit({ documentId: docD.id, tool: 'hero', targetId: keyD, snapshot: changed }, 'idem-d'),
    (err) => err instanceof AnimationConflictError && err.status === 409,
    'same key + different input ⇒ a 409 conflict',
  )
})

// ---------------------------------------------------------------------------
// (e) failure
// ---------------------------------------------------------------------------

test('(e) engine error ⇒ failed with prior candidates preserved; engine validation refusal ⇒ definitively failed, nothing enqueued', async () => {
  docE = anim.createDocument({ projectId, name: 'Echo', binding: makeBinding() })
  keyE1 = uuid()
  keyE2 = uuid()
  keyE3 = uuid()

  // A prior successful render on this document — its candidate must survive.
  const ok = await submitHero(docE, keyE1, 'idem-e1')
  await waitAttemptState(ok.attemptId, ['ready'], 'the prior render landing')
  const candidatesBefore = anim.getDocument(docE.id).body.keys.find((entry) => entry.id === keyE1).candidates.length

  // failMode error: the render starts, then the engine reports OOM.
  await engineControl({ failMode: 'error' })
  const failed = await submitHero(docE, keyE2, 'idem-e2')
  const failedRow = await waitAttemptState(failed.attemptId, ['failed'], 'the engine-error attempt failing')
  assert.equal(failedRow.result, null)
  assert.ok(failedRow.engineJobId, 'the failed dispatch is still recorded')

  // failMode validation: /prompt itself is refused (400 node_errors) — a
  // DEFINITIVE refusal, not an uncertain dispatch.
  await engineControl({ failMode: 'validation' })
  const refused = await service.submit(
    { documentId: docE.id, tool: 'hero', targetId: keyE3, snapshot: makeHeroSnapshot(keyE3, anim.getDocument(docE.id).revision) },
    'idem-e3',
  )
  assert.equal(refused.created, true, 'the attempt row is the durable truth even when the engine refuses')
  const refusedRow = await waitAttemptState(refused.attemptId, ['failed'], 'the validation-refused attempt marked failed')
  assert.equal(refusedRow.engineJobId, null, 'nothing was enqueued')
  assert.equal(refusedRow.result, null)
  await engineControl({ failMode: null })

  const body = anim.getDocument(docE.id).body
  assert.equal(body.keys.find((entry) => entry.id === keyE1).candidates.length, candidatesBefore, 'prior candidates preserved')
  assert.ok(!body.keys.some((entry) => entry.id === keyE2 || entry.id === keyE3), 'the failed attempts materialized no slots')

  // Input validation refuses BEFORE anything is persisted (§7.2.2).
  const badCaption = makeHeroSnapshot(uuid(), anim.getDocument(docE.id).revision)
  badCaption.caption = ''
  await assert.rejects(
    () => service.submit({ documentId: docE.id, tool: 'hero', targetId: uuid(), snapshot: badCaption }, 'idem-bad-caption'),
    (err) => err instanceof AnimationRuleError && err.status === 400,
    'an empty caption is refused with a structured 400',
  )
  assert.equal(anim.attemptByIdempotencyKey('idem-bad-caption'), null, 'nothing was persisted for the refused input')
  const dangling = makeHeroSnapshot(uuid(), anim.getDocument(docE.id).revision)
  dangling.references[0].assetReference.relPath = 'canvas-blobs/zz/not-registered'
  await assert.rejects(
    () => service.submit({ documentId: docE.id, tool: 'hero', targetId: uuid(), snapshot: dangling }, 'idem-bad-ref'),
    (err) => err instanceof AnimationRuleError && err.status === 400 && /not present/.test(err.message),
    'a reference asset missing from the store is refused before dispatch',
  )
  assert.equal(anim.attemptByIdempotencyKey('idem-bad-ref'), null)
})

// ---------------------------------------------------------------------------
// (f) cancellation races (§11.4: preserve any landed output, never select)
// ---------------------------------------------------------------------------

test('(f) cancel mid-render ⇒ cancelled; cancel after engine completion ⇒ the output is PRESERVED, never selected', async () => {
  docF = anim.createDocument({ projectId, name: 'Foxtrot', binding: makeBinding() })
  keyF1 = uuid()
  keyF2 = uuid()

  // Leg 1 — the interrupt lands mid-render (a slow render makes the window
  // deterministic: the operating point's real 30-50 steps is what makes this
  // race worth pinning at all).
  await engineControl({ stepDelayMs: 400 })
  const racing = await submitHero(docF, keyF1, 'idem-f1')
  await service.cancel(racing.attemptId)
  const cancelledRow = await waitAttemptState(racing.attemptId, ['cancelled'], 'the mid-render cancel taking effect')
  assert.equal(cancelledRow.result, null, 'no candidate landed for the cancelled render')
  await sleep(250) // negative window: the cancelled attempt stays cancelled
  assert.equal(anim.getAttempt(racing.attemptId).execution.state, 'cancelled')
  const body1 = anim.getDocument(docF.id).body
  assert.ok(!body1.keys.some((entry) => entry.id === keyF1), 'the cancelled hero attempt materialized no slot')
  await engineControl({ stepDelayMs: 40 })

  // Leg 2 — the engine has ALREADY completed when the cancel arrives: the
  // landed output is preserved (§11.4), and never selected.
  const completed = await submitHero(docF, keyF2, 'idem-f2')
  const completedRow = anim.getAttempt(completed.attemptId)
  await waitUntil(async () => (await engineRecord(completedRow.engineJobId)) !== null, 10_000, 'the engine completing before the cancel')
  await service.cancel(completed.attemptId)
  const raced = await waitAttemptState(completed.attemptId, ['ready'], 'the cancel resolving the completed job to a preserved landing')
  assert.ok(raced.result, 'the already-completed output is PRESERVED, not discarded')
  const slot = anim.getDocument(docF.id).body.keys.find((entry) => entry.id === keyF2)
  assert.equal(slot.candidates.length, 1)
  assert.equal(slot.selectedCandidateId, null, 'the preserved candidate is never auto-selected')

  await assert.rejects(
    () => service.cancel(uuid()),
    (err) => err instanceof AnimationRuleError && err.status === 404,
    'cancelling an unknown attempt is a 404',
  )
})

// ---------------------------------------------------------------------------
// (g) uncertain dispatch + the dead engine (§11.4)
// ---------------------------------------------------------------------------

test('(g) reconcile resolves a lost dispatch by attempt-identifier search — never resubmitting; a dead engine keeps the attempt pending', async () => {
  docG = anim.createDocument({ projectId, name: 'Golf', binding: makeBinding() })
  const keyG = uuid()
  const keyG2 = uuid()
  let row = anim.addKeyCandidate(docG.id, keyG, { id: uuid(), assetReference: registerRefImage('g-from'), origin: 'import', provenance: { assetId: 'stable-g1' }, poseDescription: null, facing: null }, 0)
  row = anim.addKeyCandidate(docG.id, keyG2, { id: uuid(), assetReference: registerRefImage('g-to'), origin: 'import', provenance: { assetId: 'stable-g2' }, poseDescription: null, facing: null }, row.revision)
  row = anim.insertSpan(docG.id, { fromKeyId: keyG, toKeyId: keyG2, intent: { movement: 'turns to leave', preservation: 'silhouette intact' } }, row.revision)
  stepG1 = row.body.spans[0].stepSlots[0].id

  // The dispatch SUCCEEDED engine-side, but the acknowledgment was lost: the
  // recorded engine_job_id is gone and the in-memory watcher with it (the
  // server-restart shape — the row survives, the attachment does not).
  await engineControl({ stepDelayMs: 400 })
  const submitted = await service.submit(
    { documentId: docG.id, tool: 'tween', targetId: stepG1, snapshot: makeTweenSnapshot(stepG1, row.revision) },
    'idem-g1',
  )
  attemptG1 = submitted
  const jobId = anim.getAttempt(attemptG1.attemptId).engineJobId
  // The restart drops the watchers WHILE the engine still renders (any tick
  // already in flight observes 'running' and stops — nothing lands), then
  // the recorded attachment is lost. What survives is exactly the durable
  // row: an in-flight attempt with no engine job id.
  owner.stopObserving()
  await sleep(250) // the in-flight tick settles against the pre-loss row (running) and stops
  assert.ok(['queued', 'rendering'].includes(anim.getAttempt(attemptG1.attemptId).execution.state), 'the attempt is still in flight when the attachment is lost')
  db.prepare('UPDATE animation_attempt SET engine_job_id = NULL WHERE id = ?').run(attemptG1.attemptId)
  assert.equal(anim.getAttempt(attemptG1.attemptId).engineJobId, null)
  await waitUntil(async () => (await engineRecord(jobId))?.status?.status_str === 'success', 10_000, 'the engine completing the dispatched job')
  await engineControl({ stepDelayMs: 40 })
  const countBeforeReconcile = await engineRecordCount()

  await owner.reconcile()

  const reconciled = await waitAttemptState(attemptG1.attemptId, ['ready'], 'reconcile re-attaching and landing the uncertain attempt')
  assert.ok(reconciled.engineJobId, 'the attempt-identifier search re-adopted the engine job id')
  assert.equal(reconciled.result.candidate.frameCount, 22)
  const span = anim.getDocument(docG.id).body.spans[0]
  assert.deepEqual(span.stepSlots[0].attempts, [attemptG1.attemptId], 'the attempt attached to its step slot exactly once')
  assert.equal(await engineRecordCount(), countBeforeReconcile, 'reconcile NEVER resubmits — the engine saw no new /prompt')

  // The dead-engine leg: a real ComfyUI port pointed at a CLOSED port (the
  // allocator's probe-verified free port). Submission outcome UNCERTAIN ⇒
  // reconciliation pending, the attempt preserved (§11.4).
  const deadPort = await freePort()
  const deadEngine = createComfyEnginePort({ baseUrl: `http://127.0.0.1:${deadPort}`, blobs: sink })
  const deadOwner = createCompletionOwner({ store: anim, engine: deadEngine, emit: () => undefined, prepareFrame: productionPreparer, pollMs: 50 })
  const deadService = createAnimationRenderingService({
    store: anim, engine: deadEngine, owner: deadOwner, blobs: sink,
    compile: { hero: compileHeroCaption, tween: compileTweenCaption, sequence: compileSequenceCaption },
    emit: () => undefined,
  })
  const dead = await deadService.submit(
    { documentId: docG.id, tool: 'hero', targetId: uuid(), snapshot: makeHeroSnapshot(uuid(), anim.getDocument(docG.id).revision) },
    'idem-g2',
  )
  attemptG2 = dead
  assert.equal(anim.getAttempt(attemptG2.attemptId).execution.state, 'reconciling', 'an unreachable engine leaves the dispatch outcome pending')
  await deadOwner.reconcile()
  assert.equal(anim.getAttempt(attemptG2.attemptId).execution.state, 'reconciling', 'reconcile against a dead engine stays pending — the attempt is preserved, never dropped')
})

// ---------------------------------------------------------------------------
// (g2) the reconciliation queue half + the lost verdicts (review round)
// ---------------------------------------------------------------------------

test('(g2) reattach-while-running lands; wiped engines interrupt; a lost-ack render stays pending and lands on the next sweep — never an orphan, never a resubmit', async () => {
  docG2 = anim.createDocument({ projectId, name: 'Golf-2', binding: makeBinding() })

  // A prior landed render on this document — the lost legs must preserve it.
  const prior = await submitHero(docG2, uuid(), 'idem-g2-prior')
  await waitAttemptState(prior.attemptId, ['ready'], 'the prior render landing')
  const candidatesBefore = anim.getDocument(docG2.id).body.keys.length

  // ---- Leg A — reattach-while-running: a restart mid-render re-attaches
  // observation through the KNOWN engine job id and lands exactly once.
  await engineControl({ stepDelayMs: 400 })
  const reattach = await submitHero(docG2, uuid(), 'idem-g2-reattach')
  owner.stopObserving() // the restart: watchers drop, the row keeps its job id
  await sleep(250) // the in-flight tick settles against the pre-restart row (running)
  assert.ok(['queued', 'rendering'].includes(anim.getAttempt(reattach.attemptId).execution.state), 'the attempt is still in flight across the restart')
  const countBeforeA = await engineRecordCount()
  await owner.reconcile()
  assert.equal(anim.getAttempt(reattach.attemptId).execution.state, 'rendering', 'the sweep re-attached observation of the running job')
  const landed = await waitAttemptState(reattach.attemptId, ['ready'], 'the re-attached watcher landing the render')
  assert.ok(landed.result, 'the re-attached observation landed the candidate')
  assert.equal(await engineRecordCount(), countBeforeA + 1, 'exactly ONE engine job for the reattached attempt (countBeforeA predates its completion) — no resubmission')
  const reattachRecords = Object.values(await engineHistoryAll()).filter((record) => record.prompt?.[2]?.attempt_id === reattach.attemptId)
  assert.equal(reattachRecords.length, 1, 'the engine holds exactly one record carrying the attempt id (the extra_data carrier rides)')

  // ---- Leg B — confirmed lost with a KNOWN job id: the engine forgets the
  // job entirely (the wipe: history gone, running job killed) ⇒ interrupted.
  const lost = await submitHero(docG2, uuid(), 'idem-g2-lost')
  owner.stopObserving()
  await sleep(250)
  await engineControl({ wipe: true })
  await owner.reconcile()
  const lostRow = await waitAttemptState(lost.attemptId, ['interrupted'], 'the wiped-engine attempt resolving interrupted')
  assert.equal(lostRow.result, null)
  assert.equal(anim.getDocument(docG2.id).body.keys.length, candidatesBefore + 1, 'prior landed work is preserved (only the reattached leg A candidate was added)')

  // ---- Leg C — dispatch-never-landed: the acknowledgment was lost AND the
  // engine (reachable, quiet) holds no trace ⇒ interrupted, never resubmitted.
  const neverLanded = await submitHero(docG2, uuid(), 'idem-g2-never')
  owner.stopObserving()
  await sleep(250)
  db.prepare('UPDATE animation_attempt SET engine_job_id = NULL WHERE id = ?').run(neverLanded.attemptId)
  await engineControl({ wipe: true }) // the engine restarts QUIET: the dispatched job dies unrecorded
  const countBeforeC = await engineRecordCount()
  await owner.reconcile()
  const neverRow = await waitAttemptState(neverLanded.attemptId, ['interrupted'], 'the never-landed dispatch resolving interrupted')
  assert.equal(neverRow.result, null)
  assert.equal(neverRow.engineJobId, null)
  assert.equal(await engineRecordCount(), countBeforeC, 'the never-landed dispatch was never retried as new GPU work')

  // ---- Leg D — the Important-1 core: the acknowledgment was lost while the
  // job still RENDERS. The queue is non-empty and bare ids cannot correlate,
  // so the sweep answers UNCERTAIN — never interrupted — and the NEXT sweep
  // lands the completed record through the attempt-identifier search.
  const racing = await submitHero(docG2, uuid(), 'idem-g2-racing')
  owner.stopObserving()
  await sleep(250)
  db.prepare('UPDATE animation_attempt SET engine_job_id = NULL WHERE id = ?').run(racing.attemptId)
  const countBeforeD = await engineRecordCount()
  await owner.reconcile()
  assert.equal(anim.getAttempt(racing.attemptId).execution.state, 'reconciling', 'a non-empty engine queue keeps the lost-ack attempt pending — the job may be ours')
  // The job the attempt actually dispatched, found by the marker exactly as
  // the sweep finds it (waitUntil returns a boolean — the key is re-read).
  const racingJobOf = async () => Object.entries(await engineHistoryAll()).find(([, record]) => record.prompt?.[2]?.attempt_id === racing.attemptId)?.[0] ?? null
  await waitUntil(async () => (await racingJobOf()) !== null, 10_000, 'the racing job completing into history (the marker answerable)')
  const racingJob = await racingJobOf()
  await owner.reconcile()
  const raced = await waitAttemptState(racing.attemptId, ['ready'], 'the next sweep landing the completed lost-ack attempt')
  assert.equal(raced.engineJobId, racingJob, 'the search re-adopted the engine job id')
  assert.ok(raced.result, 'the completed output LANDED — no orphan')
  assert.equal(await engineRecordCount(), countBeforeD + 1, 'exactly the ONE dispatched job completed across both sweeps — never resubmitted')
  await engineControl({ stepDelayMs: 40 })

  // ---- Minor-3 — the torn-window pin: the job's queue slot empties at
  // completion but its history record lags 150 ms. The watcher's poll inside
  // that window must NOT conclude 'lost' — the settle holds, the record
  // lands, and the render completes normally.
  await engineControl({ historyLagMs: 150 })
  const lagged = await submitHero(docG2, uuid(), 'idem-g2-lag')
  const lagRow = await waitAttemptState(lagged.attemptId, ['ready'], 'the lagged-completion render landing normally')
  assert.ok(lagRow.result, 'the lagged history record was waited out, not misread as lost')
  const lostEmits = events.filter((event) => event.type === 'animation.attempt.lost' && event.payload.attemptId === lagged.attemptId)
  assert.deepEqual(lostEmits, [], 'the torn window never produced a lost verdict')
  await engineControl({ historyLagMs: 0 })
})

// ---------------------------------------------------------------------------
// (h) frame-preparation failure (§11.4: preserve the clip, retry without rendering)
// ---------------------------------------------------------------------------

test('(h) bounded auto-retry then success; past the bound the clip survives until the explicit retry — no new engine work', async () => {
  docH = anim.createDocument({ projectId, name: 'Hotel', binding: makeBinding() })
  keyH1 = uuid()
  keyH2 = uuid()
  const countBefore = await engineRecordCount()

  // Leg 1 — rejecting twice, then succeeding: INSIDE the bounded auto-retry
  // (1 initial try + maxAutoPrepRetries: 2). The '*' wildcard arms the
  // override for the attempt whose preparation fires first — the attemptId
  // only exists once submit returns.
  let calls = 0
  prepOverrides.set('*', async (attemptId, frameIndex) => {
    calls += 1
    if (calls <= 2) throw new Error('frame extraction exploded')
    return productionPreparer(attemptId, frameIndex)
  })
  const h1 = await submitHero(docH, keyH1, 'idem-h1')
  const h1Row = await waitAttemptState(h1.attemptId, ['ready'], 'the flaky-prep attempt landing')
  prepOverrides.delete('*')
  assert.equal(calls, 3, 'two failures then success inside the bounded auto-retry')
  assert.equal(h1Row.preparation.state, 'proposed')
  assert.equal(h1Row.preparation.proposedFrameIndex, 11)
  assert.ok(h1Row.result, 'the clip landed before preparation ran')

  // Leg 2 — failing past the bound: the clip is PRESERVED, preparation is
  // failed, and the explicit retryPreparation finishes it — without any new
  // engine submission.
  prepOverrides.set('*', async () => { throw new Error('frame extraction permanently down') })
  const h2 = await submitHero(docH, keyH2, 'idem-h2')
  const h2Row = await waitAttemptState(h2.attemptId, ['ready'], 'the never-prep attempt resolving with its clip landed')
  prepOverrides.delete('*')
  assert.equal(h2Row.preparation.state, 'failed')
  assert.match(h2Row.preparation.error, /permanently down/)
  assert.ok(h2Row.result, '§11.4: the rendered clip is preserved when preparation fails')
  assert.equal(h2Row.result.candidate.frameCount, 22)
  await sleep(300) // negative window: the auto-retry bound held
  assert.equal(anim.getAttempt(h2.attemptId).preparation.state, 'failed', 'no infinite retries')

  prepOverrides.set(h2.attemptId, async (attemptId, frameIndex) => productionPreparer(attemptId, frameIndex))
  await owner.retryPreparation(h2.attemptId)
  const retried = anim.getAttempt(h2.attemptId)
  assert.equal(retried.preparation.state, 'proposed')
  assert.equal(retried.preparation.proposedFrameIndex, 11, 'the retry re-prepares the SAME deterministic proposal')
  assert.equal(await engineRecordCount(), countBefore + 2, 'exactly the two renders — preparation retrying NEVER re-rendered')

  // The on-demand extractFrame path: idempotent by (take, frame, version).
  const frame1 = await service.extractFrame(h1.attemptId, 4)
  const frame2 = await service.extractFrame(h1.attemptId, 4)
  assert.deepEqual(frame1, frame2)
  assert.ok(frame1.relPath)
  assert.ok(documents.readBlob(frame1.relPath), 'the extracted frame asset is materialized in the blob store')
  await assert.rejects(() => service.extractFrame(h1.attemptId, 22), (err) => err.status === 400, 'a frame index outside the clip is a 400')
  await assert.rejects(() => service.extractFrame(uuid(), 0), (err) => err.status === 404)
})

// ---------------------------------------------------------------------------
// (i) graph contract-truth (the truth ladder's top CI-able rung)
// ---------------------------------------------------------------------------

test('(i) every builder emission validates CLEAN against the REAL captured schemas; the operating point is pinned', () => {
  const snapshots = {
    hero: makeHeroSnapshot(uuid(), 0),
    tween: makeTweenSnapshot(uuid(), 0),
    sequence: makeSequenceSnapshot(uuid(), 0),
  }
  const settings = { width: 1344, height: 768, steps: 30 }
  const graphs = {
    hero: buildHeroGraph(snapshots.hero, settings),
    tween: buildTweenGraph(snapshots.tween, settings),
    sequence: buildSequenceGraph(snapshots.sequence, settings),
  }
  for (const [tool, graph] of Object.entries(graphs)) {
    const violations = validateGraphAgainstSchemas(graph, REAL_INFO)
    assert.deepEqual(violations, [], `the ${tool} builder's emission passes the engine's own validation gate`)
    for (const node of Object.values(graph)) {
      assert.ok(REAL_INFO[node.class_type], `the ${tool} graph's emitted class ${node.class_type} is in the REAL capture (no capture-list additions needed — verified, not assumed)`)
    }
  }

  // The operating point (the assessment §3 / Set K card): euler/simple, no
  // CFG (BasicGuider, never CFGGuider), shift 12/3, 22f (17n+5, n=1), 24fps,
  // ref_image_size max, the per-tool adapters @ 1.0 on the ref2va base.
  for (const graph of Object.values(graphs)) {
    const of = (cls) => Object.values(graph).filter((node) => node.class_type === cls)
    assert.equal(of('KSamplerSelect').length, 1)
    assert.equal(of('KSamplerSelect')[0].inputs.sampler_name, ANIMATION_OPERATING_POINT.sampler)
    assert.equal(of('BasicScheduler').length, 1)
    assert.equal(of('BasicScheduler')[0].inputs.scheduler, ANIMATION_OPERATING_POINT.scheduler)
    assert.equal(of('BasicScheduler')[0].inputs.denoise, 1)
    assert.equal(of('BasicGuider').length, 1)
    assert.equal(of('CFGGuider').length, 0, 'the keyframe lane is CFG-free (BasicGuider only)')
    const shift = of('MiniMaxH3SigmaShift')[0]
    assert.deepEqual({ video: shift.inputs.shift_video, audio: shift.inputs.shift_audio }, { video: 12, audio: 3 })
    const lora = of('LoraLoaderModelOnly')[0]
    assert.equal(lora.inputs.strength_model, 1.0, 'the adapters ride at trained strength (alpha==rank ⇒ scale exactly 1.0)')
    assert.equal(of('UNETLoader')[0].inputs.unet_name, ANIMATION_MODEL_DEFAULTS.refBase)
    assert.equal(of('CreateVideo')[0].inputs.fps, 24)
    const conditioning = of('MiniMaxH3ImageToVideo')[0] ?? of('MiniMaxH3ReferenceToVideo')[0]
    assert.equal(conditioning.inputs.length, 22)
    assert.equal(conditioning.inputs.width, 1344)
    assert.equal(conditioning.inputs.height, 768)
  }
  // The per-tool conditioning classes + adapters + reference counts.
  assert.ok(Object.values(graphs.hero).some((node) => node.class_type === 'MiniMaxH3ImageToVideo'))
  assert.equal(Object.values(graphs.hero).filter((node) => node.class_type === 'LoadImage').length, 1)
  const tweenNode = Object.values(graphs.tween).find((node) => node.class_type === 'MiniMaxH3ReferenceToVideo')
  assert.equal(tweenNode.inputs.ref_image_size, 'max')
  assert.ok('ref_images.ref_image_0' in tweenNode.inputs && 'ref_images.ref_image_1' in tweenNode.inputs, "dotted autogrow keys (Set K's V1-API engine finding)")
  const seqNode = Object.values(graphs.sequence).find((node) => node.class_type === 'MiniMaxH3ReferenceToVideo')
  assert.ok('ref_images.ref_image_0' in seqNode.inputs && 'ref_images.ref_image_1' in seqNode.inputs)
  const loraOf = (graph) => Object.values(graph).find((node) => node.class_type === 'LoraLoaderModelOnly').inputs.lora_name
  assert.equal(loraOf(graphs.hero), ANIMATION_MODEL_DEFAULTS.adapters.hero)
  assert.equal(loraOf(graphs.tween), ANIMATION_MODEL_DEFAULTS.adapters.tween)
  assert.equal(loraOf(graphs.sequence), ANIMATION_MODEL_DEFAULTS.adapters.sequence)
  // The caption reaches the engine VERBATIM (the compiler's frozen output).
  assert.equal(tweenNode.inputs.prompt, snapshots.tween.caption)

  // The steps bound: the attempt's frozen settings override within 30–50
  // (the snapshot's own settings are the override — the caller's build
  // settings are the fallback the service resolves from the document).
  const highSnap = { ...snapshots.tween, settings: { ...snapshots.tween.settings, steps: 99 } }
  const high = buildTweenGraph(highSnap, { width: 1344, height: 768, steps: 30 })
  assert.equal(Object.values(high).find((node) => node.class_type === 'BasicScheduler').inputs.steps, 50, "steps clamp to the operating point's ceiling")
  const lowSnap = { ...snapshots.hero, settings: { ...snapshots.hero.settings, steps: 5 } }
  const low = buildHeroGraph(lowSnap, { width: 1344, height: 768, steps: 30 })
  assert.equal(Object.values(low).find((node) => node.class_type === 'BasicScheduler').inputs.steps, 30, 'steps clamp to the floor')

  // And the graph the DIST build actually submitted (read back from the
  // fake engine's history in (a)) validates clean too — same gate, same
  // truth, through the real submit path.
  assert.deepEqual(validateGraphAgainstSchemas(recordA.prompt[0], REAL_INFO), [], 'the submitted production graph passes the engine gate')

  // The wrong-role snapshot is refused loudly by the pure builders (a
  // cross-tool snapshot is refused even earlier, by the tool guard).
  const heroWithTweenRefs = { ...snapshots.hero, references: snapshots.tween.references }
  assert.throws(() => buildHeroGraph(heroWithTweenRefs, settings), /current-key/, 'the hero builder demands its own reference contract')
  const tweenWithHeroRefs = { ...snapshots.tween, references: snapshots.hero.references }
  assert.throws(() => buildTweenGraph(tweenWithHeroRefs, settings), /rolling-near/)
  const sequenceWithHeroRefs = { ...snapshots.sequence, references: snapshots.hero.references }
  assert.throws(() => buildSequenceGraph(sequenceWithHeroRefs, settings), /window-start/)
  assert.throws(() => buildHeroGraph(snapshots.tween, settings), /hero attempts/, 'a cross-tool snapshot is refused by the tool guard')
})
