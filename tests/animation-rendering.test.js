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
//       the UNCERTAIN world (fix round I-1: a dispatch that genuinely
//       landed, then lost ack + wiped engine ⇒ interrupted + explicit
//       retry — an empty history proves nothing and GPU work is never
//       automatically repeated); lost
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
//   (j) the real-engine output shape (task 15) — a VIDEO-ONLY listing (the
//       mirror's videoOnly knob; the real save tail lists the clip and
//       nothing beside it) lands the video clip and still PREPARES review
//       frames: the frame-resolution seam decodes the requested frame out of
//       the registered clip through ffmpeg, answers a registered PNG image
//       asset, is idempotent per (attempt, frame), and refuses a
//       beyond-decodable-range frame BY NAME
//   (k) durable frame resolution (the final review's F1) — the engine's
//       history is VOLATILE (a wipe is the irreversible restart shape); a
//       LANDED attempt whose history is gone still resolves frames from the
//       DURABLE registered clip: extractFrame answers the SAME asset the
//       engine-path extraction registered (content addressing proves the
//       path equivalence), idempotent on repeat, and the owner's
//       retryPreparation re-proposes through the same fallback
//   (k2) the M2 pin — an engine whose image listing UNDER-DELIVERS versus
//       its own graph (the mirror's underdeliverFrames knob): extraction at
//       an in-clip-range but beyond-listing index refuses BY NAME, never
//       clamps to the last image; the boundary frame inside the listing
//       still resolves
//   (l) the resolver (wave 1, the live review's #1) — pure ladder truth:
//       exact-default enumerations resolve to the pinned names;
//       DIFFERING enumerations resolve through the documented pattern
//       ladder deterministically (adversarial distractors included); an
//       enumerated override wins and an unenumerated one is a dead slot;
//       a dead slot throws the named refusal listing the slot, node class,
//       tried names, and the enumeration
//   (m) the submit-time preflight — a dead model slot answers the named
//       400 with NOTHING spent (no row, no upload, no submission); the
//       defaults-verbatim enumeration (the runtime knob) resolves to the
//       pinned names end to end
//   (o) the frozen execution config (the live review's #2) — the
//       dispatched graph carries the values FROZEN at persist; a document
//       that moves between submit and dispatch/recovery changes nothing
//       (the fresh-dispatch AND the restart-reconcile redispatch legs);
//       the same-key retry stays idempotent
//   (n) queue-then-fail (the live review's #1/#6) — an OFFLINE submit
//       persists (queue semantics), the engine returns with an enumeration
//       lacking a slot, and the deferred dispatch FAILS with the durable
//       named reason; once the enumeration changes, the re-roll (a NEW key)
//       re-resolves and RENDERS
//   (q) the REAL interrupt contract (Codex batch A: I2+I3+I4) — /interrupt
//       answers an EMPTY 200 (the pre-fix port parsed that as a transport
//       failure); an interrupted run lands in history as the CANONICAL
//       shape (status_str error + completed false + the
//       execution_interrupted message pair — never the invented
//       "interrupted" status_str) and the attempt settles the neutral
//       cancelled, NOT failed; and cancelling a job that sits in
//       queue_pending behind a running foreign job DEQUEUES it (the real
//       /interrupt deliberately no-ops a pending id) — no render fires,
//       cancelled settles, the foreign job is untouched
//   (r) the dispatch terminal gate (Codex I1) — a cancellation during the
//       held reference upload (or during the /prompt send itself) is never
//       resurrected: the dispatch re-reads the row after every pre-send
//       await and ABORTS without engine contact; the send-race leg's
//       just-submitted orphan is deposed best-effort and the row keeps its
//       terminal cancelled, engine_job_id never claimed
//   (s) offline-engine durable resolution (Codex I9) — an UNREACHABLE
//       engine (connection refused, not the reachable-with-empty-history
//       world (k) covers) no longer fails frame extraction: the transport
//       failure falls to the DURABLE registered clip; only both paths dead
//       refuses, naming both causes in separate sentences
//   (t) the batch A review's riders — the REAL /queue item tuples (I-A:
//       pinned inside (q)'s pending leg), the REAL error-record completion
//       shape (M-1: completed:false + the execution_error message pair),
//       and the moved-pending→running depose interleave (M-3: the gated
//       dequeue holds until the foreign completion promotes the victim, so
//       the delete no-ops against a running id and the NEXT round's
//       interrupt must catch the mover — the loop terminates, cancelled
//       settles)
//   (u) freeze-before-submission (Codex batch B: I5) — a binding+settings
//       move behind the submission's enumeration await changes NOTHING the
//       row freezes: one revision everywhere (caption, references,
//       documentRevision, bindingVersion, and the settings stamps all
//       describe the ENTRY document)
//   (v) concurrent same-key submissions (Codex I6) — two submits that share
//       an idempotency key with different captions, both peeking before
//       either persists: exactly one created:true, the loser the same 409
//       the sequential case answers; identical inputs racing stay
//       idempotent (one created:false with the same attempt id)
//   (x) the extension lane's carry seam (spec 2026-10-08 §7, Task 1) — the
//       tween builder's save tail validates through the contract-truth walk
//       (inside (i)); a LANDED carry render leaves the file at
//       engineOutputCarryPath(attemptId) with a digest that verifies across
//       re-fetches and NO history-listing payload; a plain render (no flag)
//       writes nothing
//   (y) the readiness split (spec §7/§8, Task 2) — the owner's carry
//       registration: the happy split (media ready while the artifact
//       registers, then continuation-ready with the digest-verified record);
//       registration failure with the file present (bounded retries → the
//       boot sweep's resume → the explicit action, none re-rendering); the
//       no-file case (the named not-produced condition, terminal, playable
//       preserved); the eviction case (the availability check — the
//       preflight/dispatch seam — refuses BY NAME at both call sites, the
//       clip playable, and recovers when the blob resolves again); and the
//       bookend containment (review M-1 — a state-write IO failure lands in
//       the event, never an unhandled rejection, never a leaked in-flight id)
//   (z) content identities (spec §5/§6, Task 3) — the digesting seam and
//       the fail-closed compatibility: the carrying SOURCE's submit stamps
//       the digested identities of its RESOLVED weights; the extension
//       target's DISPATCH re-resolves the target's identities fresh and
//       compares them against the binding's frozen set — identical passes
//       (the target renders), same-name-different-digest refuses naming the
//       artifact and both digests with nothing submitted (the aliased
//       weights case — the stat-keyed cache is NEVER trusted past the
//       file's mtime), missing evidence refuses both ways (an enumerated
//       name with no readable file; an unconfigured models root — never a
//       name-only pass), and the eviction leg proves Task 2's availability
//       seam is wired at the DISPATCH site itself (the load-bearing
//       directive from Task 2's review — no second resolver exists)
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
const { createHash, randomUUID } = require('node:crypto')
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
import { CONTINUATION_SAVE_RECIPE_VERSION, animationInputHash, engineOutputCarryPath } from '../shared/animation/types'

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
  compareModelIdentities,
  createAnimationRenderingService,
  createComfyEnginePort,
  ContinuationIdentityDriftError,
  ContinuationUnavailableError,
  decodeClipFrame,
  makeDocumentStoreBlobSink,
  makeFramePreparer,
} = require(path.join(REPO, 'dist-server/server/animation/rendering.js'))
const { createCompletionOwner } = require(path.join(REPO, 'dist-server/server/animation/completion-owner.js'))
const {
  AnimationModelEvidenceError,
  AnimationModelResolutionError,
  resolveAnimationModels,
  resolvedIdentities,
} = require(path.join(REPO, 'dist-server/server/animation/models.js'))

const freePort = makePortAllocator('animation-rendering')
const uuid = () => randomUUID()
const sampleClipBytes = fs.readFileSync(path.join(REPO, 'e2e/fixtures/sample-clip.mp4'))
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

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
let carryFetchOverrides = null
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
// (j)
let docJ = null
let attemptJ = null
// (k)/(k2)
let docK = null

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
    // No authored hold in this snapshot's span — the v1-identical STATIC line
    // (the compiler v2 empty-preservation arm).
    preservation: '',
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

// ---- the identity-evidence fixture (extension lane Task 3) --------------------
//
// The v1 evidence contract: content identities DIGEST the weight files
// through the configured per-kind model folders (the design investigation's
// outcome — the engine can enumerate and stat but serves no digest of model
// weights anywhere in its API; the honest mechanism reads the files the
// same-box engine loads). The mirror's role stays the REGISTRY: it
// enumerates the names (wave 1). This fixture tree stands in for the
// configured models root — one small weight file per enumerated name,
// subfolder paths included, exactly the shape a configured install
// presents. The missing-evidence and aliased-weights knobs are FILE
// operations on this tree (unlink a file; rewrite bytes under the same
// name) — the real-world failure shapes the checks must refuse on.

const ANIMATION_PROFILE = JSON.parse(fs.readFileSync(path.join(REPO, 'e2e/mirror/profiles/animation-h3.json'), 'utf8'))
const EVIDENCE_KIND_FOLDERS = { unet: 'diffusion_models', clip: 'text_encoders', vae: 'vae', lora: 'loras' }
const evidenceRoot = { dir: '' }
const evidenceOriginals = new Map()
/** The service dep: the folder for one evidence kind — '' while the root is
 *  unconfigured (a test knob for the named-refusal leg). */
const evidenceFolderFor = (kind) => (evidenceRoot.dir ? path.join(evidenceRoot.dir, kind) : '')

function buildEvidenceFixture() {
  const root = path.join(home, 'identity-models')
  for (const [slot, kind] of Object.entries(EVIDENCE_KIND_FOLDERS)) {
    for (const name of ANIMATION_PROFILE.loaderEnumerations[slot] ?? []) {
      const segments = name.split('/').filter(Boolean)
      const file = path.join(root, kind, ...segments)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const bytes = Buffer.from(`identity-evidence-weight-bytes:${kind}:${name}`)
      fs.writeFileSync(file, bytes)
      evidenceOriginals.set(path.resolve(file), bytes)
    }
  }
  evidenceRoot.dir = root
}

/** Restores a fixture file's original bytes (a fresh mtime — the stat-keyed
 *  identity cache correctly re-hashes it back to the original digest). */
function restoreEvidenceFile(absPath) {
  const bytes = evidenceOriginals.get(path.resolve(absPath))
  if (bytes !== undefined) fs.writeFileSync(absPath, bytes)
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

/** Kills and respawns the fake engine on the SAME port — the restart shape
 *  (a fresh process, empty history, the profile's boot state) used by the
 *  wave-1 queue/frozen-config legs. */
async function killEngine() {
  // signal death leaves exitCode null (signalCode carries it) — the e2e
  // harness's guard, so a section that ends with the engine DOWN (s) never
  // re-kills or waits on an already-dead child.
  if (!engine || engine.exitCode !== null || engine.signalCode !== null) return
  engine.kill('SIGINT')
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 10_000)
    engine.once('exit', () => { clearTimeout(timer); resolve() })
  })
}

async function restartEngine() {
  await killEngine()
  engine = spawn(process.execPath, [
    path.join(REPO, 'e2e', 'mirror', 'fakeEngineServer.mjs'),
    '--port', String(enginePort),
    '--profile', path.join('e2e/mirror/profiles/animation-h3.json'),
  ], { cwd: REPO, stdio: ['ignore', 'ignore', 'pipe'] })
  engine.stderr.on('data', (chunk) => { process.stderr.write(`[fake-engine] ${chunk}`) })
  await waitUntil(async () => {
    try { return (await engineFetch('/system_stats')).ok } catch { return false }
  }, 15_000, 'the fake engine restarting on its port')
}

async function waitAttemptState(attemptId, states, label, timeoutMs = 10_000) {
  const wanted = new Set(states)
  await waitUntil(() => {
    const attempt = anim.getAttempt(attemptId)
    return attempt !== null && wanted.has(attempt.execution.state)
  }, timeoutMs, label)
  return anim.getAttempt(attemptId)
}

/** The continuation-readiness twin of waitAttemptState (section y): waits
 *  for the attempt's continuation state to settle into one of `states`. */
async function waitContinuation(attemptId, states, label, timeoutMs = 10_000) {
  const wanted = new Set(states)
  await waitUntil(() => {
    const attempt = anim.getAttempt(attemptId)
    return attempt !== null && wanted.has(attempt.continuation.state)
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
  // The identity-evidence root (Task 3): built BEFORE any service exists —
  // every carrying submit in every section digests against it.
  buildEvidenceFixture()
  engineClient = createComfyEnginePort({ baseUrl: `http://127.0.0.1:${enginePort}`, blobs: sink })
  events = []
  const emit = (type, payload) => { events.push({ type, payload }) }
  // The one instrumented seam: per-attempt overrides in FRONT of the
  // production frame preparer (section h's failure injection — keyed by
  // attemptId, or the '*' wildcard for the next attempt whose preparation
  // fires, since the attemptId only exists after submit). Every other
  // preparation runs through the real preparer.
  prepOverrides = new Map()
  productionPreparer = makeFramePreparer({ engine: engineClient, store: anim, blobs: sink, ffmpegPath: () => 'ffmpeg' })
  // The carry-registration instrument (extension lane Task 2, the prep
  // pattern applied to the receipt fetch): per-attempt overrides in FRONT of
  // the production fetchCarryArtifact — a held gate (the happy split's
  // observability) or an injected failure (the bounded-retry leg). Only the
  // OWNER's engine view is wrapped: the service's dispatch path keeps the
  // untouched production port, exactly like the preparer seam.
  carryFetchOverrides = new Map()
  const ownerEngine = {
    ...engineClient,
    fetchCarryArtifact: (attemptId) => {
      const override = carryFetchOverrides.get(attemptId)
      return override ? override(attemptId) : engineClient.fetchCarryArtifact(attemptId)
    },
  }
  // Wave 1's queue-semantic redispatch, wired the way core.ts wires it (the
  // service takes the owner, so the sweep's redispatch arm calls through a
  // forward-declared thunk assigned once the service exists).
  let serviceRedispatch = async () => null
  owner = createCompletionOwner({
    store: anim,
    engine: ownerEngine,
    emit,
    prepareFrame: (attemptId, frameIndex) => {
      const override = prepOverrides.has(attemptId) ? prepOverrides.get(attemptId) : prepOverrides.get('*')
      return override ? override(attemptId, frameIndex) : productionPreparer(attemptId, frameIndex)
    },
    blobs: sink,
    redispatch: (attemptId) => serviceRedispatch(attemptId),
    maxAutoPrepRetries: 2,
    pollMs: 60,
  })
  service = createAnimationRenderingService({
    store: anim,
    engine: engineClient,
    owner,
    blobs: sink,
    ffmpegPath: () => 'ffmpeg',
    modelFolder: evidenceFolderFor,
    compile: { hero: compileHeroCaption, tween: compileTweenCaption, sequence: compileSequenceCaption },
    emit,
  })
  serviceRedispatch = (attemptId) => service.redispatchAttempt(attemptId)
}, 120_000)

afterAll(async () => {
  owner?.stopObserving()
  try {
    db?.close()
  } catch { /* the scratch teardown below still runs */ }
  // signal death leaves exitCode null — check both (the killEngine guard's
  // own note; section (s) legitimately ends with the engine already down).
  if (engine && engine.exitCode === null && engine.signalCode === null) {
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
  // The history tuple (docs/devdocs/comfyui-api §3): [number, prompt_id,
  // prompt_graph, extra_data, outputs_to_execute] — the graph at index 2.
  const graph = recordA.prompt[2]
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
  const graph = (await engineRecord(landed.engineJobId)).prompt[2]
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

  // The fix round's M-3 — the cross-version retry: the idempotency peek
  // precedes validation, so a same-key retry of a V1-ERA submission answers
  // the idempotent return instead of the compiler-version gate's 400 ("this
  // build submits compiler 2 captions"). §7.2.2's letter holds across a
  // version bump; first reachable now that the version has bumped.
  const legacySnapshot = makeHeroSnapshot(keyD, revision)
  legacySnapshot.compilerVersion = '1'
  const legacyRow = anim.recordAttempt({
    id: uuid(), documentId: docD.id, tool: 'hero', targetId: keyD,
    idempotencyKey: 'idem-d-v1-era', inputHash: animationInputHash(legacySnapshot), snapshot: legacySnapshot,
  })
  assert.equal(legacyRow.created, true)
  const legacyRetry = await service.submit({ documentId: docD.id, tool: 'hero', targetId: keyD, snapshot: legacySnapshot }, 'idem-d-v1-era')
  assert.equal(legacyRetry.created, false, 'the same-key v1-era retry answers the idempotent return, never the version gate')
  assert.equal(legacyRetry.attemptId, legacyRow.attempt.id)
  assert.equal(await engineRecordCount(), countAfterFirst, 'no engine work for the retry')
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
  // Wave 1 (the live review's #6): the failure carries a DURABLE named
  // reason — sanitized, composed at the failure site, surfaced on the view.
  assert.match(failedRow.execution.failureReason, /execution error/, 'the engine-error attempt names what happened')
  assert.equal(service.getState(failed.attemptId).failureReason, failedRow.execution.failureReason, 'the view surfaces the durable reason verbatim')

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
  // The refusal's reason is the composed SANITIZED detail — the failing node
  // class, the rejected input, and the value — never the raw engine body.
  assert.match(refusedRow.execution.failureReason, /MiniMaxH3ImageToVideo/, 'the reason names the failing node class')
  assert.match(refusedRow.execution.failureReason, /length/, 'the reason names the rejected input')
  assert.match(refusedRow.execution.failureReason, /value 1/, 'the reason names the rejected value')
  assert.ok(!refusedRow.execution.failureReason.includes('node_errors'), 'never the raw engine JSON')
  assert.equal(service.getState(refused.attemptId).failureReason, refusedRow.execution.failureReason)
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
  assert.equal(cancelledRow.execution.failureReason, undefined, 'a cancellation is not a failure — no reason rides it')
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
  const deadOwner = createCompletionOwner({ store: anim, engine: deadEngine, emit: () => undefined, prepareFrame: productionPreparer, blobs: sink, pollMs: 50 })
  const deadService = createAnimationRenderingService({
    store: anim, engine: deadEngine, owner: deadOwner, blobs: sink, ffmpegPath: () => 'ffmpeg', modelFolder: evidenceFolderFor,
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
  // Wave-1 hygiene: the dead-engine row is CANCELLED once its leg is pinned
  // — a perpetually-pending row would be REDISPATCHED by any later sweep
  // against the LIVE engine (the queue semantics), overlapping other legs'
  // renders in the single-slot fake engine and destabilizing them.
  await deadService.cancel(attemptG2.attemptId)
  assert.equal(anim.getAttempt(attemptG2.attemptId).execution.state, 'cancelled')
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
  const reattachRecords = Object.values(await engineHistoryAll()).filter((record) => record.prompt?.[3]?.attempt_id === reattach.attemptId)
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

  // ---- Leg C — the UNCERTAIN world (fix round I-1's ruling): the dispatch
  // genuinely LANDED (submitted against the live engine), the render may
  // even have run — then the acknowledgment is lost (the row's job id
  // nulled) and the engine restarts quiet (the wipe: killed jobs leave no
  // history record). An empty history is equally consistent with
  // ran-and-wiped, so "no trace NOW" proves nothing: the row carries no
  // never-delivered verdict (its dispatch SUCCEEDED) and the sweep must
  // answer interrupted + explicit retry — NEVER an automatic repeat of
  // work that may already have spent engine time (§11.4's own table row).
  const uncertainDispatch = await submitHero(docG2, uuid(), 'idem-g2-never')
  owner.stopObserving()
  await sleep(250)
  db.prepare('UPDATE animation_attempt SET engine_job_id = NULL WHERE id = ?').run(uncertainDispatch.attemptId)
  await engineControl({ wipe: true }) // the engine restarts QUIET: the dispatched job dies unrecorded
  const countBeforeC = await engineRecordCount()
  await owner.reconcile()
  const uncertainRow = await waitAttemptState(uncertainDispatch.attemptId, ['interrupted'], 'the sent-and-unacknowledged dispatch resolving interrupted')
  assert.equal(uncertainRow.result, null)
  assert.equal(uncertainRow.engineJobId, null)
  assert.equal(uncertainRow.execution.dispatchVerdict, undefined, 'a dispatch that SUCCEEDED carries no delivery verdict — the verdict is a failure-time classification')
  assert.equal(await engineRecordCount(), countBeforeC, 'the ambiguous world was never retried as new GPU work')
  // The world-A contrast lives in (n)/(o): a dispatch that provably never
  // left the studio (offline submit) carries 'never-delivered' and the
  // sweep REDISPATCHES it from the frozen snapshot.

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
  const racingJobOf = async () => Object.entries(await engineHistoryAll()).find(([, record]) => record.prompt?.[3]?.attempt_id === racing.attemptId)?.[0] ?? null
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
  // Task 11's frame-addressed listing: the fake engine lists the decoded
  // frames beside the clip, so extraction answers a real IMAGE asset — the
  // form the hero acceptance mints as a key candidate and the tween far
  // reference consumes. Distinct frames resolve to distinct artifacts.
  assert.equal(frame1.kind, 'image', 'the extracted frame is an image asset')
  const frameNext = await service.extractFrame(h1.attemptId, 5)
  assert.equal(frameNext.kind, 'image')
  assert.notEqual(frame1.relPath, frameNext.relPath, 'distinct frames resolve to distinct artifacts')
  assert.notEqual(frame1.relPath, h1Row.result.candidate.assetReference.relPath, 'a frame is not the clip artifact')
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
  // Wave 1: the builders take the RESOLVED names as EXPLICIT parameters —
  // these mirror the resolver's documented picks against the amended
  // animation-h3 profile (the enumeration that deliberately DIFFERS from
  // the pinned constants for unet/clip), so the contract-truth leg proves
  // the builders carry RESOLVED names, never welded ones.
  const resolvedSettings = (tool) => ({
    width: 1344,
    height: 768,
    steps: 30,
    baseModel: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
    adapterLora: ANIMATION_MODEL_DEFAULTS.adapters[tool],
    textEncoder: 'qwen3vl_32b_int8_convrot.safetensors',
    videoVae: 'minimax_h3_video_vae_fp16.safetensors',
  })
  const settings = resolvedSettings('hero')
  const graphs = {
    hero: buildHeroGraph(snapshots.hero, resolvedSettings('hero')),
    tween: buildTweenGraph(snapshots.tween, resolvedSettings('tween')),
    sequence: buildSequenceGraph(snapshots.sequence, resolvedSettings('sequence')),
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
    assert.equal(of('UNETLoader')[0].inputs.unet_name, resolvedSettings('hero').baseModel, 'the builders carry the RESOLVED base, never a welded constant')
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
  assert.equal(loraOf(graphs.hero), resolvedSettings('hero').adapterLora)
  assert.equal(loraOf(graphs.tween), resolvedSettings('tween').adapterLora)
  assert.equal(loraOf(graphs.sequence), resolvedSettings('sequence').adapterLora)
  // The caption reaches the engine VERBATIM (the compiler's frozen output).
  assert.equal(tweenNode.inputs.prompt, snapshots.tween.caption)

  // The steps bound: the attempt's frozen settings override within 30–50
  // (the snapshot's own settings are the override — the caller's build
  // settings are the fallback the service resolves from the document).
  const highSnap = { ...snapshots.tween, settings: { ...snapshots.tween.settings, steps: 99 } }
  const high = buildTweenGraph(highSnap, resolvedSettings('tween'))
  assert.equal(Object.values(high).find((node) => node.class_type === 'BasicScheduler').inputs.steps, 50, "steps clamp to the operating point's ceiling")
  const lowSnap = { ...snapshots.hero, settings: { ...snapshots.hero.settings, steps: 5 } }
  const low = buildHeroGraph(lowSnap, resolvedSettings('hero'))
  assert.equal(Object.values(low).find((node) => node.class_type === 'BasicScheduler').inputs.steps, 30, 'steps clamp to the floor')

  // The frozen extras (fix round M-6): length, refImageSize, denoise, and
  // the adapter strength ride the frozen snapshot's settings — no builder
  // holds them as code constants.
  const extrasSnap = {
    ...snapshots.tween,
    settings: { ...snapshots.tween.settings, length: 39, refImageSize: 'match', denoise: 0.72, loraStrength: 0.85 },
  }
  const extrasGraph = buildTweenGraph(extrasSnap, resolvedSettings('tween'))
  const extrasConditioning = Object.values(extrasGraph).find((node) => node.class_type === 'MiniMaxH3ReferenceToVideo')
  assert.equal(extrasConditioning.inputs.length, 39, 'the frozen clip length rides the conditioning node')
  assert.equal(extrasConditioning.inputs.ref_image_size, 'match', 'the frozen reference sizing rides the conditioning node')
  assert.equal(Object.values(extrasGraph).find((node) => node.class_type === 'BasicScheduler').inputs.denoise, 0.72, 'the frozen denoise rides the scheduler')
  assert.equal(Object.values(extrasGraph).find((node) => node.class_type === 'LoraLoaderModelOnly').inputs.strength_model, 0.85, 'the frozen adapter strength rides the LoRA loader')

  // The extension lane's carry tail (spec 2026-10-08 §7): the TWEEN builder
  // — alone, per the adapter scope — emits the pack's Save node when the
  // frozen snapshot carries the build flag, and the emission validates
  // through the SAME gate (the pack's classes are in the REAL capture; no
  // objectInfoExtras needed).
  const carrySnap = { ...snapshots.tween, settings: { ...snapshots.tween.settings, carry: true } }
  const carryGraph = buildTweenGraph(carrySnap, resolvedSettings('tween'))
  assert.deepEqual(validateGraphAgainstSchemas(carryGraph, REAL_INFO), [], 'the carry save tail passes the engine gate')
  const carrySaves = Object.values(carryGraph).filter((node) => node.class_type === 'MiniMaxH3MotionContextSaveLatent')
  assert.equal(carrySaves.length, 1, 'exactly one carry save node rides the carrying tween graph')
  assert.deepEqual(carrySaves[0].inputs.latent, ['15', 0], "the save node consumes the sampler's LIVE AV latent (the same tensor VAEDecode consumes)")
  assert.equal(carrySaves[0].inputs.filename_prefix, 'animation/carry', 'the pre-stamp marker prefix — the port stamps the attempt id in')
  assert.equal(carrySaves[0].inputs.clip_index, 1, "the pack's fixed slot — deterministic, never run-numbered")
  // A plain tween render (no flag) emits NO save node, and neither do the
  // other tools even when the flag rides their snapshots (the adapter scope).
  assert.equal(Object.values(graphs.tween).some((node) => node.class_type === 'MiniMaxH3MotionContextSaveLatent'), false, 'a plain tween render carries no save node')
  const heroFlagged = buildHeroGraph({ ...snapshots.hero, settings: { ...snapshots.hero.settings, carry: true } }, resolvedSettings('hero'))
  assert.equal(Object.values(heroFlagged).some((node) => node.class_type === 'MiniMaxH3MotionContextSaveLatent'), false, 'the hero builder never emits the carry save node (the adapter scope)')
  const seqFlagged = buildSequenceGraph({ ...snapshots.sequence, settings: { ...snapshots.sequence.settings, carry: true } }, resolvedSettings('sequence'))
  assert.equal(Object.values(seqFlagged).some((node) => node.class_type === 'MiniMaxH3MotionContextSaveLatent'), false, 'the sequence builder never emits the carry save node (the adapter scope)')

  // And the graph the DIST build actually submitted (read back from the
  // fake engine's history in (a)) validates clean too — same gate, same
  // truth, through the real submit path.
  assert.deepEqual(validateGraphAgainstSchemas(recordA.prompt[2], REAL_INFO), [], 'the submitted production graph passes the engine gate')

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

// ---------------------------------------------------------------------------
// (j) the real-engine output shape — frame-accurate extraction (task 15)
// ---------------------------------------------------------------------------

test('(j) a video-only listing (the real engine\'s save tail) lands the clip and frame-accurately EXTRACTS review frames through ffmpeg', async () => {
  docJ = anim.createDocument({ projectId, name: 'Juliet', binding: makeBinding() })
  // The REAL engine's output shape: the clip and NOTHING beside it (the
  // mirror's videoOnly knob strips the decoded frame images the
  // image-sequence shape lists).
  await engineControl({ videoOnly: true, steps: 4, stepDelayMs: 60 })
  try {
    attemptJ = await submitHero(docJ, uuid(), 'idem-j')
    const landed = await waitAttemptState(attemptJ.attemptId, ['ready'], 'the hero attempt landing against the video-only listing')

    // The listing the engine serves holds exactly ONE artifact — the clip.
    const record = await engineRecord(landed.engineJobId)
    const listed = Object.values(record.outputs).flatMap((node) => node.images ?? [])
    assert.equal(listed.length, 1, 'the video-only listing carries the clip alone')
    // The landed candidate IS that clip (a video asset), frame count from the
    // graph's conditioning (the history tuple's graph at [2]).
    assert.equal(landed.result.candidate.assetReference.kind, 'video')
    assert.equal(landed.result.candidate.frameCount, 22)

    // And yet the proposed frame PREPARED — the frame-resolution seam
    // DECODED frame 11 out of the registered clip through ffmpeg.
    const state = service.getState(attemptJ.attemptId)
    assert.equal(state.preparation.state, 'proposed', `preparation proposed (state ${JSON.stringify(state.preparation)})`)
    assert.equal(state.preparation.proposedFrameIndex, 11)

    // On-demand extraction (§7.2.2 path 2) answers an IMAGE asset — a real
    // PNG of the sample clip's own frame geometry (320x180), never the clip
    // itself and never a listing image (there are none).
    const first = await service.extractFrame(attemptJ.attemptId, 5)
    assert.equal(first.kind, 'image')
    assert.notEqual(first.relPath, landed.result.candidate.assetReference.relPath)
    const png = documents.readBlob(first.relPath)
    assert.ok(png, 'the extracted frame is a registered blob')
    assert.ok(png.subarray(0, 8).equals(PNG_MAGIC), 'the extracted bytes are a PNG')
    assert.equal(png.readUInt32BE(16), 320, 'the extracted frame carries the clip\'s width')
    assert.equal(png.readUInt32BE(20), 180, 'the extracted frame carries the clip\'s height')

    // §11.4's extraction identity: the same (attempt, frame) resolves to the
    // SAME registered asset (content addressing over a deterministic
    // decode); a different frame is a different asset.
    const again = await service.extractFrame(attemptJ.attemptId, 5)
    assert.equal(again.relPath, first.relPath, 'the same (attempt, frame) extracts to the same asset')
    const other = await service.extractFrame(attemptJ.attemptId, 6)
    assert.notEqual(other.relPath, first.relPath, 'a different frame extracts to a different asset')

    // A frame beyond the clip's decodable range refuses BY NAME — never a
    // silently-wrong frame (the raw seam: the fixture clip decodes 72
    // frames; the service-level bounds answer earlier against the row's 22).
    await assert.rejects(() => decodeClipFrame('ffmpeg', sampleClipBytes, 100), /no decodable frame at index 100/)
  } finally {
    // The knob is REVERSIBLE — the suite's standing image-sequence shape
    // restores for whatever runs after.
    await engineControl({ videoOnly: false })
  }
})

// ---------------------------------------------------------------------------
// (k) durable frame resolution — the final review's F1 (engine history is
//     volatile; the landed clip is not)
// ---------------------------------------------------------------------------

test('(k) a LANDED attempt with its engine history WIPED still resolves frames from the durable registered clip — same asset, idempotent, preparation retriable', async () => {
  docK = anim.createDocument({ projectId, name: 'Kilo', binding: makeBinding() })
  await engineControl({ videoOnly: true })
  try {
    const attempt = await submitHero(docK, uuid(), 'idem-k')
    const landed = await waitAttemptState(attempt.attemptId, ['ready'], 'the video-only attempt landing (its clip registered at landing)')
    assert.ok(landed.result, 'the clip landed')

    // The PRE-WIPE extraction through the engine's own listing: the
    // video-only shape decodes frame 8 out of the registered clip and
    // registers the PNG content-addressed.
    const preWipe = await service.extractFrame(attempt.attemptId, 8)
    assert.equal(preWipe.kind, 'image')
    assert.ok(documents.readBlob(preWipe.relPath), 'the pre-wipe extraction is a materialized blob')

    // The engine forgets EVERY history record — the irreversible restart
    // shape (the fake engine's wipe). The registered clip stays in the
    // app's own blob store, independent of engine history.
    await engineControl({ wipe: true })
    assert.equal(await engineRecord(landed.engineJobId), null, 'the engine holds no record for the landed job')

    // The SAME extraction now resolves through the DURABLE fallback — and
    // content addressing proves the path equivalence: identical decode
    // inputs (the same registered clip bytes, the same frame) ⇒ the SAME
    // registered asset.
    const postWipe = await service.extractFrame(attempt.attemptId, 8)
    assert.equal(postWipe.kind, 'image')
    assert.equal(postWipe.relPath, preWipe.relPath, 'the durable fallback resolves the SAME asset the engine path registered')
    const png = documents.readBlob(postWipe.relPath)
    assert.ok(png && png.subarray(0, 8).equals(PNG_MAGIC), 'the resolved bytes are the registered PNG')
    const repeat = await service.extractFrame(attempt.attemptId, 8)
    assert.equal(repeat.relPath, postWipe.relPath, 'idempotent on repeat — the (attempt, frame) identity holds across both paths')
    const other = await service.extractFrame(attempt.attemptId, 9)
    assert.notEqual(other.relPath, postWipe.relPath, 'a different frame is a different asset')
    // The row's own bounds keep refusing BY NAME (never a wrong frame).
    await assert.rejects(
      () => service.extractFrame(attempt.attemptId, 22),
      (err) => err instanceof AnimationRuleError && err.status === 400 && /within the clip/.test(err.message),
      'a frame index outside the clip is a named 400 either way',
    )

    // §10.2's recovery action runs the SAME seam: re-preparing the proposed
    // frame of a landed clip without re-rendering — and now without the
    // engine's history either.
    await owner.retryPreparation(attempt.attemptId)
    const row = anim.getAttempt(attempt.attemptId)
    assert.equal(row.preparation.state, 'proposed', 'the explicit preparation retry succeeds through the durable fallback')
    assert.equal(row.preparation.proposedFrameIndex, 11, 'the SAME deterministic mid-clip proposal')
    assert.equal(row.execution.state, 'ready', 'the landed clip was never at risk')
  } finally {
    await engineControl({ videoOnly: false })
  }
})

// ---------------------------------------------------------------------------
// (k2) the M2 pin — an image listing that under-delivers versus its own graph
// ---------------------------------------------------------------------------

test('(k2) an under-delivered image listing refuses a beyond-listing frame BY NAME — never the last image', async () => {
  try {
    await engineControl({ underdeliverFrames: 2 })
    const submitted = await submitHero(docK, uuid(), 'idem-k2')
    const landed = await waitAttemptState(submitted.attemptId, ['ready'], 'the under-delivering attempt landing (its proposal inside the shortened listing)')
    // The engine's OWN truth: 1 clip + 20 frame images against the graph's
    // 22 — the row's frameCount stays graph-derived.
    const record = await engineRecord(landed.engineJobId)
    const listed = Object.values(record.outputs).flatMap((node) => node.images ?? [])
    assert.equal(listed.length, 21, 'the listing carries the clip and 20 frame images (the graph conditioned on 22)')
    assert.equal(landed.result.candidate.frameCount, 22, 'the row keeps the graph-derived frame count')
    assert.equal(landed.preparation.state, 'proposed', 'the mid-clip proposal (frame 11) is inside the shortened listing')

    // Frame 19 is the listing's last image; frame 20 is INSIDE the clip's
    // row-bounds but BEYOND the listing — the pre-fix clamp would have
    // silently resolved frame 19.
    const lastListed = await service.extractFrame(submitted.attemptId, 19)
    assert.equal(lastListed.kind, 'image')
    await assert.rejects(
      () => service.extractFrame(submitted.attemptId, 20),
      (err) => err instanceof AnimationRuleError && err.status === 400 && /no frame at index 20/.test(err.message),
      'a beyond-listing index is the named refusal, never the clamped last image',
    )
    await assert.rejects(
      () => service.extractFrame(submitted.attemptId, 21),
      (err) => err instanceof AnimationRuleError && err.status === 400 && /no frame at index 21/.test(err.message),
    )
  } finally {
    await engineControl({ underdeliverFrames: 0 })
  }
})


// ---------------------------------------------------------------------------
// (l) the resolver (wave 1, the live review's #1) — pure ladder truth:
//     exact-default enumeration, DIFFERING enumeration (the canonical
//     install's shape with adversarial distractors), overrides, dead slots
// ---------------------------------------------------------------------------

test('(l) the resolver picks by the documented ladder — exact defaults, differing enumerations, overrides, dead slots (pure)', () => {
  // The exact-match rung: an engine that enumerates the pinned names
  // verbatim resolves to the pinned names.
  const exact = resolveAnimationModels({
    tool: 'tween',
    enumerations: {
      unet: ['some_other_unet.safetensors', ANIMATION_MODEL_DEFAULTS.refBase],
      clip: [ANIMATION_MODEL_DEFAULTS.textEncoder],
      vae: [ANIMATION_MODEL_DEFAULTS.videoVae],
      lora: ['unrelated_lora.safetensors', ANIMATION_MODEL_DEFAULTS.adapters.tween],
    },
  })
  assert.deepEqual(exact, {
    baseModel: ANIMATION_MODEL_DEFAULTS.refBase,
    adapterLora: ANIMATION_MODEL_DEFAULTS.adapters.tween,
    textEncoder: ANIMATION_MODEL_DEFAULTS.textEncoder,
    videoVae: ANIMATION_MODEL_DEFAULTS.videoVae,
  }, 'the pinned defaults win when the engine enumerates them')

  // The DIFFERING enumeration (the canonical 8189 install's shape, plus
  // distractors that sort EARLIER than every documented preference): the
  // ladder resolves, deterministically, to the documented candidates.
  const differing = resolveAnimationModels({
    tool: 'hero',
    enumerations: {
      unet: ['H3/ssd/minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors'],
      clip: ['aaa_qwen3vl_32b_placeholder.safetensors', 'qwen3vl_32b_int8_convrot.safetensors', 'qwen3vl_32b_minimax_h3_int8_convrot.safetensors'],
      vae: ['minimax_h3_audio_vae_fp32.safetensors', 'minimax_h3_video_vae_fp16.safetensors'],
      lora: ['h3_hero_step9000.safetensors', 'h3_hero_step12000.safetensors'],
    },
  })
  assert.equal(differing.baseModel, 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'the ref2va pattern picks the FLAT name the install serves — never the fl2va distractor')
  assert.equal(differing.textEncoder, 'qwen3vl_32b_int8_convrot.safetensors', "the maintainer's documented second preference — NOT the alphabetically-earlier 32B distractor (an explicit preference, not sort luck)")
  assert.equal(differing.videoVae, 'minimax_h3_video_vae_fp16.safetensors', 'the video-VAE pattern — never the audio VAE')
  assert.equal(differing.adapterLora, 'h3_hero_step12000.safetensors', 'the exact pinned adapter beats the step9000 distractor')

  // Determinism within one pattern: multiple ref2va candidates sort, and
  // the first wins — same enumeration, same answer, every call.
  const sorted = resolveAnimationModels({
    tool: 'sequence',
    enumerations: {
      unet: ['zzz_minimax_h3_ref2va_late_convrot.safetensors', 'aaa_minimax_h3_ref2va_early_convrot.safetensors'],
      clip: ['qwen3vl_32b_int8_convrot.safetensors'],
      vae: ['minimax_h3_video_vae_fp16.safetensors'],
      lora: ['h3_seq_step12000.safetensors'],
    },
  })
  assert.equal(sorted.baseModel, 'aaa_minimax_h3_ref2va_early_convrot.safetensors', 'the sorted-first candidate — deterministic')
  assert.equal(resolveAnimationModels({ tool: 'sequence', enumerations: { unet: ['zzz_minimax_h3_ref2va_late_convrot.safetensors', 'aaa_minimax_h3_ref2va_early_convrot.safetensors'], clip: ['qwen3vl_32b_int8_convrot.safetensors'], vae: ['minimax_h3_video_vae_fp16.safetensors'], lora: ['h3_seq_step12000.safetensors'] } }).baseModel, sorted.baseModel)

  // An explicit override wins — and must itself be enumerated.
  const overridden = resolveAnimationModels({
    tool: 'tween',
    enumerations: {
      unet: ['minimax_h3_ref2va_pruned_int8_convrot.safetensors'],
      clip: ['qwen3vl_32b_int8_convrot.safetensors'],
      vae: ['minimax_h3_video_vae_fp16.safetensors', 'operator_vae_fp16.safetensors'],
      lora: ['h3_tween_step12000.safetensors'],
    },
    overrides: { videoVae: 'operator_vae_fp16.safetensors' },
  })
  assert.equal(overridden.videoVae, 'operator_vae_fp16.safetensors', 'the explicit override wins when the engine enumerates it')
  assert.throws(
    () => resolveAnimationModels({
      tool: 'tween',
      enumerations: { unet: ['minimax_h3_ref2va_pruned_int8_convrot.safetensors'], clip: ['qwen3vl_32b_int8_convrot.safetensors'], vae: ['minimax_h3_video_vae_fp16.safetensors'], lora: ['h3_tween_step12000.safetensors'] },
      overrides: { videoVae: 'not_enumerated_vae.safetensors' },
    }),
    (err) => err instanceof AnimationModelResolutionError && /videoVae/.test(err.message) && /not_enumerated_vae\.safetensors \(the explicit override\)/.test(err.message),
    'an override the engine does not enumerate is a dead slot naming the override',
  )

  // A dead slot: the named refusal lists the slot, the node class, the
  // tried names, and what the engine enumerates.
  assert.throws(
    () => resolveAnimationModels({
      tool: 'tween',
      enumerations: { unet: ['minimax_h3_fl2va_only.safetensors'], clip: [], vae: ['minimax_h3_audio_vae_fp32.safetensors'], lora: [] },
    }),
    (err) => err instanceof AnimationModelResolutionError
      && /baseModel/.test(err.message)
      && /UNETLoader/.test(err.message) && /unet_name/.test(err.message)
      && /minimax_h3_fl2va_only\.safetensors/.test(err.message)
      && err.message.includes(ANIMATION_MODEL_DEFAULTS.refBase),
    'a dead unet slot names the slot, the node class, the tried pinned default, and the enumeration',
  )
})

// ---------------------------------------------------------------------------
// (m) the submit-time preflight (the live review's #1): validate the
//     effective set BEFORE spending work — a dead slot is a structured 400
//     with nothing persisted; a defaults-verbatim enumeration resolves to
//     the pinned names end to end
// ---------------------------------------------------------------------------

test('(m) a dead model slot at submit answers the named 400 with NOTHING spent; a defaults-verbatim enumeration renders the pinned names', async () => {
  const doc = anim.createDocument({ projectId, name: 'Mike', binding: makeBinding() })
  const attemptsBefore = anim.attemptsForDocument(doc.id).length
  const before = await engineRecordCount()

  // The engine enumerates NOTHING for the clip slot — the ladder has no
  // rung to stand on.
  await engineControl({ loaderEnumerations: { unet: ['minimax_h3_ref2va_pruned_int8_convrot.safetensors'], clip: [], vae: ['minimax_h3_video_vae_fp16.safetensors'], lora: ['h3_hero_step12000.safetensors'] } })
  try {
    await assert.rejects(
      () => submitHero(doc, uuid(), 'idem-m-dead'),
      (err) => err instanceof AnimationRuleError && err.status === 400
        && /textEncoder/.test(err.message)
        && /CLIPLoader/.test(err.message) && /clip_name/.test(err.message)
        && err.message.includes(ANIMATION_MODEL_DEFAULTS.textEncoder)
        && /qwen3vl_32b_int8_convrot\.safetensors/.test(err.message)
        && /enumerates/.test(err.message),
      'the dead clip slot is the structured 400 naming the slot, the tried names, and the enumeration',
    )
    assert.equal(anim.attemptsForDocument(doc.id).length, attemptsBefore, 'no attempt row was persisted')
    assert.equal(anim.attemptByIdempotencyKey('idem-m-dead'), null, 'the idempotency key holds no row')
    assert.equal(await engineRecordCount(), before, 'the engine received nothing — no upload, no submission')
  } finally {
    await engineControl({ loaderEnumerations: null })
  }

  // The exact-match preference leg, end to end: an engine serving the
  // DEFAULT names VERBATIM (the runtime knob — the standing profile
  // deliberately serves different names) resolves to the pinned constants,
  // and the graph the engine receives carries them.
  await engineControl({ loaderEnumerations: {
    unet: [ANIMATION_MODEL_DEFAULTS.refBase],
    clip: [ANIMATION_MODEL_DEFAULTS.textEncoder],
    vae: [ANIMATION_MODEL_DEFAULTS.videoVae],
    lora: [ANIMATION_MODEL_DEFAULTS.adapters.hero],
  } })
  try {
    const submitted = await submitHero(doc, uuid(), 'idem-m-exact')
    const landed = await waitAttemptState(submitted.attemptId, ['ready'], 'the defaults-verbatim attempt landing')
    const graph = (await engineRecord(landed.engineJobId)).prompt[2]
    assert.equal(Object.values(graph).find((node) => node.class_type === 'UNETLoader').inputs.unet_name, ANIMATION_MODEL_DEFAULTS.refBase, 'the exact pinned default when the engine enumerates it verbatim')
    assert.equal(Object.values(graph).find((node) => node.class_type === 'CLIPLoader').inputs.clip_name, ANIMATION_MODEL_DEFAULTS.textEncoder)
    // The frozen snapshot records the resolved set (Fix B's stamp).
    const frozen = anim.getAttempt(submitted.attemptId).snapshot.settings
    assert.equal(frozen.baseModel, ANIMATION_MODEL_DEFAULTS.refBase)
    assert.equal(frozen.textEncoder, ANIMATION_MODEL_DEFAULTS.textEncoder)
    assert.equal(frozen.adapterLora, ANIMATION_MODEL_DEFAULTS.adapters.hero)
    assert.equal(frozen.videoVae, ANIMATION_MODEL_DEFAULTS.videoVae)
  } finally {
    await engineControl({ loaderEnumerations: null })
  }
})

// ---------------------------------------------------------------------------
// (o) the frozen execution config (the live review's #2): the dispatched
//     graph carries the values FROZEN at persist — a document that moves
//     between submit and dispatch/recovery changes nothing, on both the
//     fresh-dispatch and the restart-reconcile (redispatch) legs
// ---------------------------------------------------------------------------

test('(o) the dispatched graph carries the FROZEN config — document moves between persist and dispatch change nothing (fresh + restart legs)', async () => {
  // ---- the fresh leg: submit with the engine up; the engine's own record
  // carries the frozen values + the RESOLVED model names.
  const doc = anim.createDocument({ projectId, name: 'Oscar', binding: makeBinding() })
  const keyFrom = uuid()
  const keyTo = uuid()
  let row = anim.addKeyCandidate(doc.id, keyFrom, { id: uuid(), assetReference: registerRefImage('o-from'), origin: 'import', provenance: { assetId: 'stable-o1' }, poseDescription: null, facing: null }, 0)
  row = anim.addKeyCandidate(doc.id, keyTo, { id: uuid(), assetReference: registerRefImage('o-to'), origin: 'import', provenance: { assetId: 'stable-o2' }, poseDescription: null, facing: null }, row.revision)
  row = anim.insertSpan(doc.id, { fromKeyId: keyFrom, toKeyId: keyTo, intent: { movement: 'walks two steps', preservation: 'silhouette intact' } }, row.revision)
  const stepId = row.body.spans[0].stepSlots[0].id
  // NO dimension/step overrides in the snapshot — the document's settings
  // (1344×768, steps 30) are exactly what must freeze.
  const snapshot = makeTweenSnapshot(stepId, row.revision)
  snapshot.settings = { seed: 99001 }
  const submitted = await service.submit({ documentId: doc.id, tool: 'tween', targetId: stepId, snapshot }, 'idem-o-fresh')
  const landed = await waitAttemptState(submitted.attemptId, ['ready'], 'the fresh-dispatch leg landing')
  const graphOf = (record) => {
    const g = record.prompt[2]
    return {
      conditioning: Object.values(g).find((node) => node.class_type === 'MiniMaxH3ReferenceToVideo'),
      scheduler: Object.values(g).find((node) => node.class_type === 'BasicScheduler'),
      unet: Object.values(g).find((node) => node.class_type === 'UNETLoader').inputs.unet_name,
      clip: Object.values(g).find((node) => node.class_type === 'CLIPLoader').inputs.clip_name,
    }
  }
  const fresh = graphOf(await engineRecord(landed.engineJobId))
  assert.equal(fresh.conditioning.inputs.width, 1344, 'the frozen width')
  assert.equal(fresh.conditioning.inputs.height, 768, 'the frozen height')
  assert.equal(fresh.scheduler.inputs.steps, 30, 'the frozen steps')
  assert.equal(fresh.unet, 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'the RESOLVED unet — the standing profile enumerates the FLAT name, not the pinned constant: resolution exercised, not echoed')
  assert.equal(fresh.clip, 'qwen3vl_32b_int8_convrot.safetensors', 'the RESOLVED clip (the documented preference)')
  const frozen = anim.getAttempt(submitted.attemptId).snapshot.settings
  assert.deepEqual(
    { width: frozen.width, height: frozen.height, steps: frozen.steps, sampler: frozen.sampler, scheduler: frozen.scheduler, shiftVideo: frozen.shiftVideo, shiftAudio: frozen.shiftAudio, fps: frozen.fps, length: frozen.length, refImageSize: frozen.refImageSize, denoise: frozen.denoise, loraStrength: frozen.loraStrength, bindingVersion: frozen.bindingVersion },
    { width: 1344, height: 768, steps: 30, sampler: 'euler', scheduler: 'simple', shiftVideo: 12, shiftAudio: 3, fps: 24, length: 22, refImageSize: 'max', denoise: 1, loraStrength: 1, bindingVersion: doc.body.activeBindingVersion },
    'the frozen snapshot carries the COMPLETE resolved execution config (M-6 extras included)',
  )

  // ---- the restart leg: the engine is DOWN at submit (queue semantics —
  // the row persists, resolution defers), the document MOVES, the engine
  // returns, and the sweep REDISPATCHES from the FROZEN config: the moved
  // document's settings never reach the graph.
  const doc2 = anim.createDocument({ projectId, name: 'Oscar-two', binding: makeBinding() })
  const from2 = uuid()
  const to2 = uuid()
  let row2 = anim.addKeyCandidate(doc2.id, from2, { id: uuid(), assetReference: registerRefImage('o2-from'), origin: 'import', provenance: { assetId: 'stable-o3' }, poseDescription: null, facing: null }, 0)
  row2 = anim.addKeyCandidate(doc2.id, to2, { id: uuid(), assetReference: registerRefImage('o2-to'), origin: 'import', provenance: { assetId: 'stable-o4' }, poseDescription: null, facing: null }, row2.revision)
  row2 = anim.insertSpan(doc2.id, { fromKeyId: from2, toKeyId: to2, intent: { movement: 'the weight settles', preservation: 'silhouette intact' } }, row2.revision)
  const step2 = row2.body.spans[0].stepSlots[0].id
  const snapshot2 = makeTweenSnapshot(step2, row2.revision)
  snapshot2.settings = { seed: 99002 }

  await killEngine()
  const offline = await service.submit({ documentId: doc2.id, tool: 'tween', targetId: step2, snapshot: snapshot2 }, 'idem-o-restart')
  assert.equal(offline.created, true, 'the submit is accepted while the engine is unreachable (queue semantics)')
  assert.equal(anim.getAttempt(offline.attemptId).execution.state, 'reconciling', 'the offline dispatch stays pending — nothing was spent')

  // The document MOVES between persistence and dispatch.
  anim.updateDocumentSettings(doc2.id, { steps: 44, outputWidth: 672 }, anim.getDocument(doc2.id).revision)
  assert.equal(anim.getDocument(doc2.id).body.settings.steps, 44, 'the document moved')

  await restartEngine()
  await owner.reconcile()
  const redispatched = await waitAttemptState(offline.attemptId, ['ready'], 'the sweep redispatching the frozen attempt after the engine returns')
  const moved = graphOf(await engineRecord(redispatched.engineJobId))
  assert.equal(moved.conditioning.inputs.width, 1344, 'the FROZEN width — not the moved document\'s 672')
  assert.equal(moved.conditioning.inputs.height, 768, 'the FROZEN height')
  assert.equal(moved.scheduler.inputs.steps, 30, 'the FROZEN steps — not the moved document\'s 44')
  assert.equal(moved.unet, 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'the models resolved at dispatch against the returned engine\'s enumeration')
  const frozen2 = anim.getAttempt(offline.attemptId).snapshot.settings
  assert.equal(frozen2.width, 1344, 'the row\'s frozen config was never rewritten by the document move')

  // The same-key retry is unchanged by all of it: the received-snapshot
  // hash still matches, the row answers { created: false }, and the engine
  // holds exactly the one dispatched job.
  const countAfterRedispatch = await engineRecordCount()
  const retry = await service.submit({ documentId: doc2.id, tool: 'tween', targetId: step2, snapshot: snapshot2 }, 'idem-o-restart')
  assert.deepEqual(retry, { attemptId: offline.attemptId, created: false }, 'the same-key retry answers the idempotent return')
  assert.equal(await engineRecordCount(), countAfterRedispatch, 'the retry spent no engine work')
})

// ---------------------------------------------------------------------------
// (n) queue-then-fail (wave 1): an OFFLINE submit persists (queue
//     semantics), the engine returns with an enumeration LACKING a slot,
//     and the dispatch resolves → the attempt FAILS with the durable named
//     reason; once the enumeration changes, the re-roll (a NEW key)
//     resolves and RENDERS — the repair path the reason text itself names
// ---------------------------------------------------------------------------

test('(n) an offline submit fails at dispatch with the durable named reason when the enumeration lacks a slot; the re-roll renders after the enumeration changes', async () => {
  const doc = anim.createDocument({ projectId, name: 'November', binding: makeBinding() })
  const keyFrom = uuid()
  const keyTo = uuid()
  let row = anim.addKeyCandidate(doc.id, keyFrom, { id: uuid(), assetReference: registerRefImage('n-from'), origin: 'import', provenance: { assetId: 'stable-n1' }, poseDescription: null, facing: null }, 0)
  row = anim.addKeyCandidate(doc.id, keyTo, { id: uuid(), assetReference: registerRefImage('n-to'), origin: 'import', provenance: { assetId: 'stable-n2' }, poseDescription: null, facing: null }, row.revision)
  row = anim.insertSpan(doc.id, { fromKeyId: keyFrom, toKeyId: keyTo, intent: { movement: 'the weight shifts forward', preservation: 'silhouette intact' } }, row.revision)
  const stepId = row.body.spans[0].stepSlots[0].id

  // The engine goes DOWN; the submit is accepted anyway (queue semantics —
  // submits never block on engine reachability) and stays pending, carrying
  // the dispatch path's own NEVER-DELIVERED verdict (the failure preceded
  // the /prompt send — the request provably never left the studio).
  await killEngine()
  const offline = await service.submit({ documentId: doc.id, tool: 'tween', targetId: stepId, snapshot: makeTweenSnapshot(stepId, row.revision) }, 'idem-n-1')
  assert.equal(offline.created, true)
  const offlineRow = anim.getAttempt(offline.attemptId)
  assert.equal(offlineRow.execution.state, 'reconciling', 'the offline dispatch stays pending')
  assert.equal(offlineRow.execution.dispatchVerdict, 'never-delivered', 'the offline dispatch is classified never-delivered — the redispatch gate reads exactly this')

  // The engine returns enumerating NOTHING for the clip slot: the deferred
  // dispatch resolves → the attempt FAILS with the durable named reason.
  await restartEngine()
  await engineControl({ loaderEnumerations: { unet: ['minimax_h3_ref2va_pruned_int8_convrot.safetensors'], clip: [], vae: ['minimax_h3_video_vae_fp16.safetensors'], lora: ['h3_tween_step12000.safetensors'] } })
  try {
    await owner.reconcile()
    const failedRow = await waitAttemptState(offline.attemptId, ['failed'], 'the deferred dispatch failing against the lacking enumeration')
    assert.equal(failedRow.result, null)
    assert.match(failedRow.execution.failureReason, /textEncoder/, 'the durable reason names the slot')
    assert.match(failedRow.execution.failureReason, /CLIPLoader/, 'the durable reason names the node class')
    assert.ok(failedRow.execution.failureReason.includes(ANIMATION_MODEL_DEFAULTS.textEncoder), 'the durable reason names the tried pinned default')
    assert.match(failedRow.execution.failureReason, /qwen3vl_32b_int8_convrot\.safetensors/, 'the durable reason names the tried documented preference')
    assert.equal(service.getState(offline.attemptId).failureReason, failedRow.execution.failureReason, 'the view surfaces the durable reason')

    // The enumeration CHANGES (the knob restores the profile's servable
    // names) — the re-roll is a NEW key, its preflight re-resolves, and the
    // take RENDERS: the repair path the reason text itself names.
    await engineControl({ loaderEnumerations: null })
    const repair = await service.submit({ documentId: doc.id, tool: 'tween', targetId: stepId, snapshot: makeTweenSnapshot(stepId, anim.getDocument(doc.id).revision) }, 'idem-n-2')
    assert.equal(repair.created, true)
    const landed = await waitAttemptState(repair.attemptId, ['ready'], 'the re-roll rendering after the enumeration changed')
    assert.ok(landed.result, 'the repaired take landed its candidate')
    const graph = (await engineRecord(landed.engineJobId)).prompt[2]
    assert.equal(Object.values(graph).find((node) => node.class_type === 'UNETLoader').inputs.unet_name, 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'the re-roll resolved the FLAT unet the engine serves')
    assert.equal(Object.values(graph).find((node) => node.class_type === 'CLIPLoader').inputs.clip_name, 'qwen3vl_32b_int8_convrot.safetensors', 'the re-roll resolved the documented clip preference')
  } finally {
    await engineControl({ loaderEnumerations: null })
  }
})

// ---------------------------------------------------------------------------
// (p) fix round M-1 + M-2 — the hung-enumeration regression (the submit
//     path's 3 s bound; the attempt persists FIRST) and the terminal settle
//     of an unreadable reference at redispatch (no infinite boot retry)
// ---------------------------------------------------------------------------

test('(p) a hung /object_info bounds the preflight — the submit returns and the row persists; an unreadable reference at redispatch settles TERMINALLY', async () => {
  const doc = anim.createDocument({ projectId, name: 'Papa', binding: makeBinding() })

  // ---- M-1: the hung-enumeration shape. The engine accepts /object_info
  // connections and never answers. Without the fetch bound, the preflight
  // would hang the submit path AHEAD of persistence (the pre-wave-1 stub
  // repro); with it, the preflight defers after ~3 s, the attempt persists,
  // and the deferred dispatch's own resolution times out the same way —
  // never-delivered, pending, no GPU spent.
  await engineControl({ hangObjectInfo: true })
  let hung = null
  try {
    const startedAt = Date.now()
    hung = await submitHero(doc, uuid(), 'idem-p-hang')
    const elapsed = Date.now() - startedAt
    assert.equal(hung.created, true, 'the submit RETURNS — the enumeration fetch is time-bounded')
    assert.ok(elapsed < 12_000, `the two bounded waits (preflight + deferred resolution) resolved in ${elapsed} ms, not forever`)
    const hungRow = anim.getAttempt(hung.attemptId)
    assert.equal(hungRow.engineJobId, null, 'nothing reached the engine')
    assert.equal(hungRow.execution.state, 'reconciling', 'the dispatch stays pending')
    assert.equal(hungRow.execution.dispatchVerdict, 'never-delivered', 'the failure preceded the send — classified at the boundary')
  } finally {
    await engineControl({ hangObjectInfo: false })
  }
  await service.cancel(hung.attemptId) // hygiene: terminal, so later sweeps leave it alone

  // ---- M-2: a reference blob that stops being readable between the
  // offline submit and the redispatch settles TERMINALLY — failed with the
  // named reason — instead of reconciling forever across boots.
  const keyFrom = uuid()
  const keyTo = uuid()
  let row = anim.addKeyCandidate(doc.id, keyFrom, { id: uuid(), assetReference: registerRefImage('p-from'), origin: 'import', provenance: { assetId: 'stable-p1' }, poseDescription: null, facing: null }, anim.getDocument(doc.id).revision)
  row = anim.addKeyCandidate(doc.id, keyTo, { id: uuid(), assetReference: registerRefImage('p-to'), origin: 'import', provenance: { assetId: 'stable-p2' }, poseDescription: null, facing: null }, row.revision)
  row = anim.insertSpan(doc.id, { fromKeyId: keyFrom, toKeyId: keyTo, intent: { movement: 'the coat swings', preservation: 'silhouette intact' } }, row.revision)
  const stepId = row.body.spans[0].stepSlots[0].id
  const snapshot = makeTweenSnapshot(stepId, row.revision)
  await killEngine()
  const offline = await service.submit({ documentId: doc.id, tool: 'tween', targetId: stepId, snapshot }, 'idem-p-unreadable')
  assert.equal(anim.getAttempt(offline.attemptId).execution.dispatchVerdict, 'never-delivered')

  // The near reference's blob file leaves the store (the imported bytes are
  // gone — the trash-backed rm wrapper makes this recoverable).
  const nearRelPath = snapshot.references[0].assetReference.relPath
  fs.rmSync(path.join(home, nearRelPath))
  assert.equal(sink.readBlob(nearRelPath), null, 'the reference blob is no longer readable')

  await restartEngine()
  await owner.reconcile()
  const settled = await waitAttemptState(offline.attemptId, ['failed'], 'the unreadable-reference redispatch settling terminally')
  assert.equal(settled.engineJobId, null, 'no engine work was spent')
  assert.match(settled.execution.failureReason, /no longer readable/, 'the durable reason names the reference problem')
  assert.match(settled.execution.failureReason, /rolling-near/, 'the durable reason names the slot that could not upload')
  // Terminal: a second sweep does not resurrect it.
  await owner.reconcile()
  assert.equal(anim.getAttempt(offline.attemptId).execution.state, 'failed', 'a terminal dispatch-input failure stays settled — no infinite boot retry')
})

// ---------------------------------------------------------------------------
// (q) the REAL interrupt contract (Codex batch A) — I2 the empty-200
//     answer, I4 the canonical interrupted record, I3 the pending dequeue
// ---------------------------------------------------------------------------

test('(q) the real /interrupt serves an EMPTY 200; the canonical interrupted record settles cancelled (never failed); a PENDING job is dequeued, not rendered', async () => {
  const doc = anim.createDocument({ projectId, name: 'Quebec', binding: makeBinding() })

  // ---- I2: the transport truth. The canonical engine answers /interrupt
  // with 200 and NO BODY (server.py:1198 — web.Response(status=200)); the
  // pre-fix port's unconditional response.json() turned exactly this into
  // "SyntaxError: Unexpected end of JSON input" and every real-engine
  // cancellation took the cancel-error branch. The mirror serves the real
  // shape; pin it at the wire so it can never drift back to a friendlier
  // JSON body.
  const probe = await engineFetch('/interrupt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt_id: 'no-such-job' }),
  })
  assert.equal(probe.status, 200, 'the real /interrupt answers 200')
  assert.equal(await probe.text(), '', 'with an EMPTY body — the shape the port must tolerate as success')

  // ---- I4: a targeted interrupt of a RUNNING job. The cancellation must
  // succeed through the empty 200 (no cancel-error), and the engine must
  // remember the run the CANONICAL way: status_str "error", completed
  // false, with the ("execution_interrupted", {...}) message pair — the
  // only real-engine shape (main.py:375-379 writes success|error alone;
  // execution.py:693-699 appends the message). The port reads the message
  // and the attempt settles the NEUTRAL cancelled — a user Stop is never a
  // render failure.
  await engineControl({ stepDelayMs: 400 })
  const running = await submitHero(doc, uuid(), 'idem-q-running')
  const runningJob = anim.getAttempt(running.attemptId).engineJobId
  await service.cancel(running.attemptId)
  const stoppedRow = await waitAttemptState(running.attemptId, ['cancelled'], 'the empty-200 interrupt cancelling the running job')
  assert.equal(stoppedRow.result, null)
  assert.equal(stoppedRow.execution.failureReason, undefined, 'I4: an interrupted run is NOT a failure — no reason rides it')
  const stoppedRecord = await engineRecord(runningJob)
  assert.ok(stoppedRecord, 'the engine remembers the interrupted run')
  assert.equal(stoppedRecord.status.status_str, 'error', 'the canonical record says error (there is no "interrupted" status_str in a real engine)')
  assert.equal(stoppedRecord.status.completed, false)
  const marker = (stoppedRecord.status.messages ?? []).find((entry) => Array.isArray(entry) && entry[0] === 'execution_interrupted')
  assert.ok(marker, 'the execution_interrupted message pair is what tells a Stop from a failure')
  assert.equal(marker[1].prompt_id, runningJob, 'the message names the interrupted job')
  assert.ok(
    !events.some((event) => event.type === 'animation.attempt.cancel-error' && event.payload.attemptId === running.attemptId),
    'no cancel-error: the empty 200 was success, not a transport failure',
  )

  // ---- I3: the pending half. A FOREIGN job occupies the engine's single
  // slot, so the victim WAITS in queue_pending (the mirror queues behind
  // the running job exactly as a real ComfyUI does). Cancelling the victim:
  // /interrupt deliberately NO-OPS its pending id (server.py:1176-1192
  // checks only currently-running prompts), so the cancel path must resolve
  // the disposition and DEQUEUE — the queue no longer lists it, no render
  // ever fires, cancelled settles, and the foreign job is untouched.
  const foreign = await submitHero(doc, uuid(), 'idem-q-foreign')
  const foreignJob = anim.getAttempt(foreign.attemptId).engineJobId
  const victim = await submitHero(doc, uuid(), 'idem-q-victim')
  const victimJob = anim.getAttempt(victim.attemptId).engineJobId
  assert.notEqual(victimJob, foreignJob)

  // ---- I-A's wire pin: the REAL /queue shape (server.py:1072-1078, devdocs
  // §2). Both lists carry the item TUPLES [number, prompt_id, prompt,
  // extra_data, outputs_to_execute] — the id at index 1 — never bare ids
  // (the pre-review mirror's flattened form left the production tuple
  // branch CI-dead: a future narrowing would have made queuedJobIds()
  // always empty against a real engine, and a pending job would render
  // despite the user's Stop).
  const queueListOf = () => engineFetch('/queue').then((r) => r.json())
  const queueLists = (queue) => queue.queue_running.every((entry) => Array.isArray(entry)) && queue.queue_pending.every((entry) => Array.isArray(entry))
  const listedIn = (queue, jobId) => [...queue.queue_running, ...queue.queue_pending].some((entry) => entry[1] === jobId)
  const queueBefore = await queueListOf()
  assert.ok(queueLists(queueBefore), 'both /queue lists carry item tuples, never bare ids')
  const runningTuple = queueBefore.queue_running.find((entry) => entry[1] === foreignJob)
  assert.ok(runningTuple, 'the foreign job holds the execution slot')
  assert.equal(runningTuple.length, 5, 'the tuple is [number, prompt_id, prompt, extra_data, outputs_to_execute]')
  assert.equal(typeof runningTuple[0], 'number', 'the queue number at index 0')
  assert.ok(runningTuple[2] && typeof runningTuple[2] === 'object', 'the prompt graph at index 2')
  assert.equal(runningTuple[3].attempt_id, foreign.attemptId, 'extra_data rides at index 3 — the attempt marker the queue tuples carry')
  assert.ok(Array.isArray(runningTuple[4]), 'outputs_to_execute at index 4')
  assert.ok(queueBefore.queue_pending.some((entry) => entry[1] === victimJob), 'the victim sits in queue_pending behind it')

  await service.cancel(victim.attemptId)
  const victimRow = await waitAttemptState(victim.attemptId, ['cancelled'], 'the pending job settling cancelled through the dequeue')
  assert.equal(victimRow.result, null, 'nothing landed for the never-rendered job')
  assert.equal(victimRow.execution.failureReason, undefined)
  const queueAfter = await queueListOf()
  assert.ok(!listedIn(queueAfter, victimJob), 'the queue no longer lists the cancelled job anywhere')
  assert.ok(queueAfter.queue_running.some((entry) => entry[1] === foreignJob), "the foreign job is untouched by the victim's cancellation")

  // The foreign render finishes on its own; the victim NEVER renders.
  await waitAttemptState(foreign.attemptId, ['ready'], 'the foreign render landing')
  const victimRecords = Object.values(await engineHistoryAll()).filter((record) => record.prompt?.[3]?.attempt_id === victim.attemptId)
  assert.equal(victimRecords.length, 0, 'the engine holds no record carrying the victim attempt id — no render ever fired')
  const foreignRecords = Object.values(await engineHistoryAll()).filter((record) => record.prompt?.[3]?.attempt_id === foreign.attemptId)
  assert.equal(foreignRecords.length, 1, 'exactly the foreign job ran')
  await engineControl({ stepDelayMs: 40 })
})

// ---------------------------------------------------------------------------
// (r) the dispatch terminal gate (Codex I1) — a cancellation racing the
//     dispatch is never resurrected into engine work
// ---------------------------------------------------------------------------

/** A wrapper port gating ONE dep seam until released — the suite's
 *  prepareFrame-override pattern applied to the engine dep: everything
 *  else passes straight through to the production port. Shared by (r)'s
 *  dispatch gates and (t)'s depose-interleave pin. */
function gatedEnginePort(gateDep) {
  const port = {
    submitGraph: (graph, attemptId) => engineClient.submitGraph(graph, attemptId),
    interrupt: (engineJobId) => engineClient.interrupt(engineJobId),
    dequeue: (engineJobId) => engineClient.dequeue(engineJobId),
    history: (engineJobId) => engineClient.history(engineJobId),
    view: (engineJobId, frameIndex) => engineClient.view(engineJobId, frameIndex),
    findJobByAttempt: (attemptId) => engineClient.findJobByAttempt(attemptId),
    queuedJobIds: () => engineClient.queuedJobIds(),
    uploadReference: (assetId, bytes) => engineClient.uploadReference(assetId, bytes),
    fetchCarryArtifact: (attemptId) => engineClient.fetchCarryArtifact(attemptId),
    modelEnumerations: (options) => engineClient.modelEnumerations(options),
  }
  gateDep(port)
  return port
}

/** An owner + rendering service pair over a gated port, sharing the suite's
 *  store/sink/preparer (the cancel/observe paths run production code). */
function gatedServiceFor(port) {
  const gatedEvents = []
  const gatedOwner = createCompletionOwner({ store: anim, engine: port, emit: (type, payload) => gatedEvents.push({ type, payload }), prepareFrame: productionPreparer, blobs: sink, pollMs: 60 })
  const gatedServiceInstance = createAnimationRenderingService({
    store: anim, engine: port, owner: gatedOwner, blobs: sink, ffmpegPath: () => 'ffmpeg', modelFolder: evidenceFolderFor,
    compile: { hero: compileHeroCaption, tween: compileTweenCaption, sequence: compileSequenceCaption },
    emit: (type, payload) => gatedEvents.push({ type, payload }),
  })
  return { owner: gatedOwner, service: gatedServiceInstance, events: gatedEvents }
}

test('(r) a cancel during the held reference upload submits NOTHING; a cancel racing the send keeps the row terminal and deposes the orphan', async () => {
  const doc = anim.createDocument({ projectId, name: 'Romeo', binding: makeBinding() })
  const submitOn = (service2, keyId, idem) => service2.submit(
    { documentId: doc.id, tool: 'hero', targetId: keyId, snapshot: makeHeroSnapshot(keyId, anim.getDocument(doc.id).revision) },
    idem,
  )

  // ---- Leg 1 — the I1 reproduction: the attempt persists, its reference
  // upload AWAITS, the user cancels (engine_job_id null ⇒ terminal
  // cancelled), THEN the upload completes. Pre-fix, dispatch submitted
  // /prompt anyway — cancellation became rendering. The gate: the re-read
  // after the upload aborts WITHOUT engine contact.
  {
    let release = null
    const gate = new Promise((resolve) => { release = resolve })
    let heldUploads = 0
    const port = gatedEnginePort((p) => {
      p.uploadReference = async (assetId, bytes) => {
        heldUploads += 1
        await gate
        return engineClient.uploadReference(assetId, bytes)
      }
    })
    const held = gatedServiceFor(port)
    const countBefore = await engineRecordCount()
    const submitted = submitOn(held.service, uuid(), 'idem-r-upload')
    await waitUntil(() => anim.attemptByIdempotencyKey('idem-r-upload') !== null, 10_000, 'the attempt persisting ahead of the held upload')
    assert.equal(heldUploads, 1, 'the dispatch is holding inside the reference upload')
    await held.service.cancel(anim.attemptByIdempotencyKey('idem-r-upload').id)
    assert.equal(anim.attemptByIdempotencyKey('idem-r-upload').execution.state, 'cancelled', 'the pre-dispatch cancel settles terminal cancelled')

    release() // the upload completes — the resurrection window opens
    assert.deepEqual(await submitted, { attemptId: anim.attemptByIdempotencyKey('idem-r-upload').id, created: true })
    const row = anim.attemptByIdempotencyKey('idem-r-upload')
    assert.equal(row.execution.state, 'cancelled', 'the terminal state STANDS — the dispatch aborted at the gate')
    assert.equal(row.engineJobId, null, 'no engine job was ever claimed')
    assert.equal(await engineRecordCount(), countBefore, 'NO engine submission — the upload completing changed nothing')
    assert.ok(!held.events.some((event) => event.type === 'animation.attempt.submitted'), 'no fabric event pretends anything rendered')
    await sleep(300) // negative window: the aborted row stays cancelled
    assert.equal(anim.getAttempt(row.id).execution.state, 'cancelled')
    held.owner.stopObserving()
  }

  // ---- Leg 2 — the send itself races the cancel: /prompt is in flight
  // when the user cancels, so the engine DOES hold the job. The post-send
  // re-read keeps the row terminal, never claims the job id, and the
  // just-submitted orphan is deposed best-effort (interrupt + dequeue).
  {
    await engineControl({ stepDelayMs: 400 }) // the orphan is still rendering when the depose lands
    let release = null
    const gate = new Promise((resolve) => { release = resolve })
    let sendEntered = false
    const port = gatedEnginePort((p) => {
      p.submitGraph = async (graph, attemptId) => {
        sendEntered = true
        const result = await engineClient.submitGraph(graph, attemptId)
        await gate
        return result
      }
    })
    const held = gatedServiceFor(port)
    const countBefore = await engineRecordCount()
    const submitted = submitOn(held.service, uuid(), 'idem-r-send')
    await waitUntil(() => sendEntered, 10_000, 'the dispatch reaching the /prompt send')
    await held.service.cancel(anim.attemptByIdempotencyKey('idem-r-send').id)
    assert.equal(anim.attemptByIdempotencyKey('idem-r-send').execution.state, 'cancelled')

    release() // the send resolves — the engine already holds the orphan job
    await submitted
    const row = anim.attemptByIdempotencyKey('idem-r-send')
    assert.equal(row.execution.state, 'cancelled', 'the send racing the cancel does not resurrect the row')
    assert.equal(row.engineJobId, null, 'the orphan job id is never claimed for the row')
    assert.ok(!held.events.some((event) => event.type === 'animation.attempt.submitted'), 'no submitted event for the aborted dispatch')
    // The best-effort depose fired: the orphan's engine record carries the
    // attempt marker AND the interrupted shape (the interrupt killed it).
    const orphanRecords = Object.values(await engineHistoryAll()).filter((record) => record.prompt?.[3]?.attempt_id === row.id)
    assert.equal(orphanRecords.length, 1, 'the engine holds exactly the orphaned job')
    assert.equal(orphanRecords[0].status.status_str, 'error', 'the orphan was deposed — the canonical interrupted record, not a completed render')
    assert.ok((orphanRecords[0].status.messages ?? []).some((entry) => Array.isArray(entry) && entry[0] === 'execution_interrupted'))
    const queueAfter = await engineFetch('/queue').then((r) => r.json())
    const orphanId = orphanRecords[0].prompt[1]
    assert.ok(![...queueAfter.queue_running, ...queueAfter.queue_pending].some((entry) => entry[1] === orphanId), 'the orphan is neither running nor queued')
    assert.equal((await engineRecordCount()) - countBefore, 1, 'exactly the one raced send ever reached the engine')
    held.owner.stopObserving()
    await engineControl({ stepDelayMs: 40 })
  }
})

// ---------------------------------------------------------------------------
// (s) offline-engine durable resolution (Codex I9) — the engine being DOWN
//     is indistinguishable-from-empty for frame RESOLUTION
// ---------------------------------------------------------------------------

test('(s) an unreachable engine no longer blocks frame extraction — the durable clip answers; both dead names both causes', async () => {
  const doc = anim.createDocument({ projectId, name: 'Sierra', binding: makeBinding() })
  // A landed VIDEO-ONLY take (the real engine's save tail): its clip is the
  // registered blob every frame decodes from.
  await engineControl({ videoOnly: true })
  let landed = null
  try {
    const attempt = await submitHero(doc, uuid(), 'idem-s')
    landed = await waitAttemptState(attempt.attemptId, ['ready'], 'the video-only attempt landing (its clip registered at landing)')
  } finally {
    await engineControl({ videoOnly: false })
  }
  assert.ok(landed.result, 'the clip landed')

  // The engine goes OFFLINE — connection refused, the I9 shape (a transport
  // failure; the (k) suite's wiped-history world is a REACHABLE engine with
  // empty history, a different branch). Pre-fix, the history fetch's
  // connection error escaped BEFORE the durable fallback and every
  // extraction/acceptance/retry against a landed clip failed.
  await killEngine()
  const frame = await service.extractFrame(landed.id, 7)
  assert.equal(frame.kind, 'image')
  const png = documents.readBlob(frame.relPath)
  assert.ok(png && png.subarray(0, 8).equals(PNG_MAGIC), 'the durable path decoded and registered a real PNG with the engine down')
  // The explicit preparation retry runs the SAME seam — no engine needed.
  await owner.retryPreparation(landed.id)
  const retried = anim.getAttempt(landed.id)
  assert.equal(retried.preparation.state, 'proposed', 'retryPreparation succeeds through the durable path while the engine is unreachable')
  assert.equal(retried.execution.state, 'ready', 'the landed clip was never at risk')

  // BOTH paths dead: the registered clip's bytes leave the store too — the
  // named refusal honestly carries BOTH causes, separate sentences. The
  // engine sentence states the HONEST class (review M-4: "could not serve
  // its output listing" — the raw fetch error names the transport — never
  // "unreachable" for what might be a refusal).
  fs.rmSync(path.join(home, landed.result.candidate.assetReference.relPath))
  await assert.rejects(
    () => service.extractFrame(landed.id, 8),
    (err) => err instanceof AnimationRuleError && err.status === 400
      && /could not serve its output listing/.test(err.message)
      && /fetch failed/.test(err.message)
      && /not readable from the store/.test(err.message),
    'the both-dead refusal names the unservable listing AND the unreadable clip, separately',
  )
})

// ---------------------------------------------------------------------------
// (t) the batch A review's riders — M-1 the real error-record shape, M-3
//     the moved-pending→running depose interleave (I-A's tuple wire pin
//     lives in (q)'s pending leg)
// ---------------------------------------------------------------------------

test('(t) the error record carries the real completion shape; a job moving pending→running between interrupt and dequeue is caught next round', async () => {
  const doc = anim.createDocument({ projectId, name: 'Tango', binding: makeBinding() })
  // (s) ends with the engine down — bring it back (the restart shape).
  await restartEngine()

  // ---- M-1: the REAL error record (main.py:377 `completed = e.success` +
  // execution.py:712's message pair): an error is completed FALSE and
  // carries the ('execution_error', {...}) tuple — never the invented
  // completed:true with empty messages. (The success record's
  // execution_success pair rides the same finishRecord.)
  await engineControl({ failMode: 'error' })
  try {
    const failing = await submitHero(doc, uuid(), 'idem-t-error')
    const failingJob = anim.getAttempt(failing.attemptId).engineJobId
    await waitAttemptState(failing.attemptId, ['failed'], 'the error attempt failing')
    const errorRecord = await engineRecord(failingJob)
    assert.ok(errorRecord, 'the engine remembers the failed run')
    assert.equal(errorRecord.status.status_str, 'error')
    assert.equal(errorRecord.status.completed, false, 'the real error record is completed:false (success follows completion; error does not)')
    const errorMessage = (errorRecord.status.messages ?? []).find((entry) => Array.isArray(entry) && entry[0] === 'execution_error')
    assert.ok(errorMessage, 'the execution_error message pair rides the record')
    assert.equal(errorMessage[1].exception_type, 'OOM', 'the pair carries the engine\'s own failure detail')
    assert.ok(!(errorRecord.status.messages ?? []).some((entry) => Array.isArray(entry) && entry[0] === 'execution_interrupted'), 'an error is not an interrupt — the marker stays exclusive')
  } finally {
    await engineControl({ failMode: null })
  }

  // ---- M-3: the interleave the depose loop guards by construction, now
  // PINNED. The victim PENDS behind the foreign job; the cancel's FIRST
  // interrupt no-ops its pending id; the gated dequeue then holds until the
  // foreign completion PROMOTES the victim to running — so the delete no-ops
  // against a running id exactly like the real engine's pending-heap walk.
  // The loop must NOT stop there (the queue still lists the mover): the
  // NEXT round's interrupt catches it running, the loop terminates, and the
  // settle lands cancelled.
  await engineControl({ stepDelayMs: 400 })
  const foreign = await submitHero(doc, uuid(), 'idem-t-foreign')
  const foreignJob = anim.getAttempt(foreign.attemptId).engineJobId
  const victim = await submitHero(doc, uuid(), 'idem-t-victim')
  const victimJob = anim.getAttempt(victim.attemptId).engineJobId
  assert.notEqual(victimJob, foreignJob)
  const queueBefore = await engineFetch('/queue').then((r) => r.json())
  assert.ok(queueBefore.queue_running.some((entry) => entry[1] === foreignJob) && queueBefore.queue_pending.some((entry) => entry[1] === victimJob), 'the foreign job runs, the victim pends')

  let heldDequeues = 0
  const port = gatedEnginePort((p) => {
    p.dequeue = async (engineJobId) => {
      heldDequeues += 1
      if (heldDequeues === 1) {
        // Hold the FIRST dequeue until the foreign job completed — the
        // mirror promotes the victim at that completion, so the delete
        // that follows no-ops against a RUNNING id.
        await waitUntil(async () => (await engineRecord(foreignJob)) !== null, 10_000, 'the foreign job completing inside the dequeue window')
      }
      return engineClient.dequeue(engineJobId)
    }
  })
  const gated = gatedServiceFor(port)
  await gated.service.cancel(victim.attemptId)
  const victimRow = await waitAttemptState(victim.attemptId, ['cancelled'], "the mover settling cancelled through the next round's interrupt")
  assert.equal(victimRow.result, null)
  assert.equal(victimRow.execution.failureReason, undefined)
  assert.equal(heldDequeues, 1, 'exactly one dequeue call — it no-op’d against the promoted id, and the loop did not need another')
  // The victim RAN (promoted mid-cancel) and was stopped as a running job:
  // the canonical interrupted record proves the second-round interrupt —
  // the pending-only delete could never have produced it.
  const victimRecords = Object.values(await engineHistoryAll()).filter((record) => record.prompt?.[3]?.attempt_id === victim.attemptId)
  assert.equal(victimRecords.length, 1, 'the engine holds exactly the victim’s own record')
  assert.equal(victimRecords[0].status.status_str, 'error')
  assert.ok((victimRecords[0].status.messages ?? []).some((entry) => Array.isArray(entry) && entry[0] === 'execution_interrupted'), 'the mover was interrupted mid-run — caught as RUNNING, not dequeued as pending')
  await waitAttemptState(foreign.attemptId, ['ready'], 'the foreign render landing on its own')
  await engineControl({ stepDelayMs: 40 })
})

// ---------------------------------------------------------------------------
// (u) freeze-before-submission (Codex I5) — a document that moves behind the
//     submission's own await changes NOTHING the row freezes
// ---------------------------------------------------------------------------

test('(u) a binding+settings move behind the enumeration await leaves the frozen snapshot CONSISTENT at the entry revision', async () => {
  const doc = anim.createDocument({ projectId, name: 'Uniform', binding: makeBinding() })
  const keyId = uuid()
  const entryRevision = anim.getDocument(doc.id).revision
  const entryBindingVersion = anim.getDocument(doc.id).body.activeBindingVersion
  assert.equal(entryBindingVersion, 1)

  // The preflight enumeration is HELD — the await window the old stamping
  // re-read the live document behind (the promoted-frame extraction await is
  // the same window at the route; the service leg pins the stamp seam).
  let release = null
  const gate = new Promise((resolve) => { release = resolve })
  let entered = 0
  const port = gatedEnginePort((p) => {
    p.modelEnumerations = async (options) => {
      entered += 1
      await gate
      return engineClient.modelEnumerations(options)
    }
  })
  const held = gatedServiceFor(port)
  const snapshot = makeHeroSnapshot(keyId, entryRevision)
  const submitted = held.service.submit(
    { documentId: doc.id, tool: 'hero', targetId: keyId, snapshot },
    'idem-u',
  )
  await waitUntil(() => entered === 1, 10_000, 'the submit holding inside the preflight enumeration')

  // The document MOVES behind the await: binding v2 + new output settings.
  anim.updateBinding(doc.id, makeBinding(), entryRevision)
  anim.updateDocumentSettings(doc.id, { outputWidth: 640, outputHeight: 360, steps: 12 }, entryRevision + 1)
  const moved = anim.getDocument(doc.id)
  assert.equal(moved.revision, entryRevision + 2)
  assert.equal(moved.body.activeBindingVersion, 2, 'the moved document carries binding v2')
  assert.equal(moved.body.settings.outputWidth, 640)

  release()
  const result = await submitted
  await waitAttemptState(result.attemptId, ['ready'], 'the frozen attempt landing on its own terms')
  const row = anim.getAttempt(result.attemptId)
  // ONE revision everywhere: the references, the caption, the revision, the
  // bindingVersion, and the settings stamps all describe the ENTRY document.
  // Pre-fix, the stamping re-read the live row and froze bindingVersion 2 /
  // width 640 / steps 12 onto the entry revision's caption and references.
  assert.equal(row.snapshot.documentRevision, entryRevision, 'the frozen revision is the entry revision')
  assert.equal(row.snapshot.settings.bindingVersion, 1, 'the bindingVersion stamp describes the ENTRY binding — not the moved v2')
  assert.equal(row.snapshot.settings.width, 1344, 'the width stamp is the entry operating point')
  assert.equal(row.snapshot.settings.height, 768)
  assert.equal(row.snapshot.settings.steps, 30, 'the steps stamp is the entry setting — not the moved 12')
  assert.equal(row.snapshot.caption, snapshot.caption, 'the frozen caption is the one submitted against the entry document')
  assert.deepEqual(row.snapshot.references, snapshot.references, 'the frozen references are the entry resolution')
  held.owner.stopObserving()
})

// ---------------------------------------------------------------------------
// (v) concurrent same-key submissions (Codex I6) — the insert race's loser
//     answers the 409, never a silent 200 for the winner's render
// ---------------------------------------------------------------------------

test('(v) two concurrent same-key submits with DIFFERENT inputs ⇒ exactly one created:true, the loser 409s; identical inputs stay idempotent', async () => {
  const doc = anim.createDocument({ projectId, name: 'Victor', binding: makeBinding() })
  const revision = anim.getDocument(doc.id).revision

  // ---- Leg 1 — DIFFERENT inputs (the I6 reproduction): both peek before
  // either persists; the store's return-existing contract alone answered
  // created:false with the WINNER's row — the loser got a 200 for a render
  // of the winner's caption.
  {
    const keyA = uuid()
    const snapshotA = makeHeroSnapshot(keyA, revision)
    const snapshotB = makeHeroSnapshot(keyA, revision)
    snapshotB.caption = `${snapshotB.caption}\nA DIFFERENT CAPTION`
    assert.notEqual(snapshotA.caption, snapshotB.caption)
    // Two gates: the winner is released first and its row observed before
    // the loser resumes past the enumeration — deterministic, no microtask
    // ordering assumptions.
    let releaseFirst = null
    let releaseSecond = null
    const firstGate = new Promise((resolve) => { releaseFirst = resolve })
    const secondGate = new Promise((resolve) => { releaseSecond = resolve })
    let entered = 0
    const port = gatedEnginePort((p) => {
      p.modelEnumerations = async (options) => {
        entered += 1
        await (entered === 1 ? firstGate : secondGate)
        return engineClient.modelEnumerations(options)
      }
    })
    const held = gatedServiceFor(port)
    const inputA = { documentId: doc.id, tool: 'hero', targetId: keyA, snapshot: snapshotA }
    const inputB = { documentId: doc.id, tool: 'hero', targetId: keyA, snapshot: snapshotB }
    const first = held.service.submit(inputA, 'idem-v-race')
    const second = held.service.submit(inputB, 'idem-v-race')
    await waitUntil(() => entered === 2, 10_000, 'both submissions holding behind the enumeration (both peeks already missed)')
    releaseFirst()
    await waitUntil(() => anim.attemptByIdempotencyKey('idem-v-race') !== null, 10_000, 'the winner persisting its row')
    releaseSecond()
    const [a, b] = await Promise.allSettled([first, second])
    const fulfilled = [a, b].filter((outcome) => outcome.status === 'fulfilled')
    assert.equal(fulfilled.length, 1, 'exactly one submission succeeds')
    assert.equal(fulfilled[0].value.created, true)
    const row = anim.attemptByIdempotencyKey('idem-v-race')
    assert.equal(fulfilled[0].value.attemptId, row.id, 'the winner owns the row')
    assert.equal(row.snapshot.caption, snapshotA.caption, 'the row froze the WINNER\'s inputs — the loser never overwrote anything')
    const rejected = [a, b].find((outcome) => outcome.status === 'rejected')
    assert.ok(rejected, 'the loser rejects')
    assert.ok(rejected.reason instanceof AnimationConflictError, `the loser's rejection is the conflict (got ${rejected.reason})`)
    assert.equal(rejected.reason.status, 409)
    assert.match(rejected.reason.message, /different inputs/)
    held.owner.stopObserving()
  }

  // ---- Leg 2 — IDENTICAL inputs racing: the benign twin stays idempotent
  // (one created:true, one created:false with the SAME attempt id — the fix
  // must not have broken §7.2.2's letter for the honest concurrent retry).
  {
    const keyB = uuid()
    const twin = makeHeroSnapshot(keyB, revision)
    let release = null
    const gate = new Promise((resolve) => { release = resolve })
    let entered = 0
    const port = gatedEnginePort((p) => {
      p.modelEnumerations = async (options) => {
        entered += 1
        await gate
        return engineClient.modelEnumerations(options)
      }
    })
    const held = gatedServiceFor(port)
    const input = { documentId: doc.id, tool: 'hero', targetId: keyB, snapshot: twin }
    const first = held.service.submit(input, 'idem-v-twin')
    const second = held.service.submit(input, 'idem-v-twin')
    await waitUntil(() => entered === 2, 10_000, 'both twin submissions holding behind the enumeration')
    release()
    const [a, b] = await Promise.allSettled([first, second])
    assert.equal(a.status, 'fulfilled')
    assert.equal(b.status, 'fulfilled', 'the identical twin never conflicts')
    assert.equal(a.value.created, true)
    assert.equal(b.value.created, false)
    assert.equal(b.value.attemptId, a.value.attemptId)
    held.owner.stopObserving()
  }
})

// ---------------------------------------------------------------------------
// (w) Codex batch C, M1 — the registration seam leaves NO staging copies:
//     registerBlobFile dedupes identical bytes to ONE canonical blob while
//     the sink's staging file was never removed (three identical
//     registrations grew three staging files — unbounded disk on the
//     extraction/preparation path, large video artifacts included). The
//     staging directory holds only in-flight files now: success removes the
//     source (the blob store owns the canonical copy), and so does a FAILED
//     registration — no orphan either.
// ---------------------------------------------------------------------------
test('(w) three identical registrations ⇒ one blob row, ZERO staging files; a failed registration leaves no orphan (M1)', () => {
  const stagingDir = path.join(home, 'm1-staging')
  const m1Sink = makeDocumentStoreBlobSink(documents, stagingDir)
  const bytes = Buffer.from(`m1-identical-${uuid()} — the content is the dedupe key, never the name`)
  const first = m1Sink.registerBytes('image', bytes, 'frame-a.png')
  const second = m1Sink.registerBytes('image', bytes, 'frame-b.png')
  const third = m1Sink.registerBytes('video', bytes, 'clip-c.mp4')
  assert.equal(first.present, true)
  assert.equal(second.relPath, first.relPath, 'identical bytes dedupe to the identical relPath')
  assert.equal(third.relPath, first.relPath, 'content addressing dedupes across names and kinds')
  // ONE blob row for the content (the canonical copy the store owns)…
  const rows = db.prepare('SELECT COUNT(*) AS n FROM canvas_blob WHERE path = ?').get(first.relPath)
  assert.equal(rows.n, 1, 'exactly one canvas_blob row for three identical registrations')
  // …and it is READABLE through the sink (the canonical copy serves, never
  // the staging source).
  const roundTrip = m1Sink.readBlob(first.relPath)
  assert.ok(roundTrip && roundTrip.equals(bytes), 'the blob store owns the canonical copy')
  // THE PIN: zero staging files remain.
  assert.deepEqual(fs.readdirSync(stagingDir), [], 'three identical registrations leave ZERO staging files')

  // The in-flight failure path: a registration that throws must not leave
  // its staging file behind either.
  const failingDir = path.join(home, 'm1-staging-fail')
  const failing = makeDocumentStoreBlobSink({
    registerBlobFile: () => { throw new Error('registration exploded') },
    readBlob: () => null,
  }, failingDir)
  assert.throws(() => failing.registerBytes('image', bytes, 'frame-d.png'), /registration exploded/, 'the failed registration propagates its error')
  assert.deepEqual(fs.readdirSync(failingDir), [], 'a failed registration leaves no orphan staging file')
})

// ---------------------------------------------------------------------------
// (x) the extension lane's carry seam (spec 2026-10-08 §7, plan Task 1) —
//     the deterministic receipt over a LANDED carry render, and the no-flag
//     shape. The builder-leg truth lives in (i); here the REAL submit path
//     runs: the frozen carry flag rides the tween build, the port stamps the
//     pack's Save node with the attempt id, the fake engine writes the file
//     at the deterministic path, and the test plays Task 2's owner — derive
//     the path from the attempt id ALONE, fetch through /view, verify the
//     digest. No history payload is consulted anywhere: the Save node
//     returns no UI output (the receipt IS the path + the digest).
// ---------------------------------------------------------------------------
test('(x) a landed carry render leaves the file at engineOutputCarryPath with a verifiable digest; a plain render writes nothing', async () => {
  const doc = anim.createDocument({ projectId, name: 'Xray', binding: makeBinding() })
  const keyFrom = uuid()
  const keyTo = uuid()
  let row = anim.addKeyCandidate(doc.id, keyFrom, { id: uuid(), assetReference: registerRefImage('x-from'), origin: 'import', provenance: { assetId: 'stable-x1' }, poseDescription: null, facing: null }, 0)
  row = anim.addKeyCandidate(doc.id, keyTo, { id: uuid(), assetReference: registerRefImage('x-to'), origin: 'import', provenance: { assetId: 'stable-x2' }, poseDescription: null, facing: null }, row.revision)
  row = anim.insertSpan(doc.id, { fromKeyId: keyFrom, toKeyId: keyTo, intent: { movement: 'leans into the turn', preservation: 'silhouette intact' } }, row.revision)
  const step = row.body.spans[0].stepSlots[0].id

  // The path contract's shape, pinned before any render runs: derived from
  // the attempt id alone, under the engine's output directory.
  assert.equal(engineOutputCarryPath('0f0e0d0c-1b1a-4c3d-8e7f-9a6b5c4d3e2f'), 'animation/0f0e0d0c-1b1a-4c3d-8e7f-9a6b5c4d3e2f/carry_00001.safetensors', 'the deterministic path: the attempt dir + the pack slot')

  // ---- Leg 1 — the CARRY render (the source render that carries).
  const carrySnap = makeTweenSnapshot(step, row.revision)
  carrySnap.settings.carry = true
  const carried = await service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: carrySnap }, 'idem-x1')
  const landed = await waitAttemptState(carried.attemptId, ['ready'], 'the carry render landing (media readiness unchanged — the artifact split is Task 2)')

  // The graph the engine stored carries the pack's Save node with the
  // STAMPED per-attempt prefix — and the engine's outputs_to_execute lists
  // it (an OUTPUT_NODE like any save tail, the real tuple shape).
  const record = await engineRecord(landed.engineJobId)
  const graph = record.prompt[2]
  const saveEntry = Object.entries(graph).find(([, node]) => node.class_type === 'MiniMaxH3MotionContextSaveLatent')
  assert.ok(saveEntry, "the landed graph carries the pack's Save node")
  assert.equal(saveEntry[1].inputs.filename_prefix, `animation/${carried.attemptId}/carry`, 'the port stamped the marker under the attempt directory')
  assert.ok(record.prompt[4].includes(saveEntry[0]), "outputs_to_execute lists the save node (the pack's node is an OUTPUT_NODE)")
  // NO history-UI payload: the outputs listing carries the media alone —
  // the receipt is the deterministic path, never a listing entry.
  const listed = Object.values(record.outputs).flatMap((node) => node.images ?? [])
  assert.ok(listed.length > 0 && listed.every((entry) => !String(entry.filename).endsWith('.safetensors')), 'the carry file never rides the history outputs listing')

  // THE OWNER'S MOVE (Task 2 formalizes it): derive the path from the
  // attempt id alone and fetch the bytes through the engine's /view —
  // (subfolder, filename) addressing, exactly the real engine's
  // output-folder form.
  const carryPath = engineOutputCarryPath(carried.attemptId)
  const parts = carryPath.split('/')
  const carryFilename = parts.pop()
  const carrySubfolder = parts.join('/')
  const carryUrl = `/view?filename=${encodeURIComponent(carryFilename)}&subfolder=${encodeURIComponent(carrySubfolder)}&type=output`
  const firstFetch = await engineFetch(carryUrl)
  assert.equal(firstFetch.status, 200, 'the saved carry file is served at the deterministic path')
  const carryBytes = Buffer.from(await firstFetch.arrayBuffer())

  // The file is the pack's container shape: safetensors framing whose
  // metadata carries the save-format id (the record's saveRecipeVersion is
  // READ FROM THE FILE) and whose payload is the profile-driven size.
  const headerLength = Number(carryBytes.readBigUInt64LE(0))
  const header = JSON.parse(carryBytes.subarray(8, 8 + headerLength).toString('utf8'))
  assert.equal(header.__metadata__.format, CONTINUATION_SAVE_RECIPE_VERSION, "the file's metadata carries the pack's save-format id")
  assert.ok(header.video && header.audio, "the synthetic carry models the pack's two-stream AV shape")
  const profileSpec = JSON.parse(fs.readFileSync(path.join(REPO, 'e2e/mirror/profiles/animation-h3.json'), 'utf8'))
  assert.equal(carryBytes.length, 8 + headerLength + profileSpec.carryFile.bytes, 'the payload is the profile-driven size')
  assert.equal(header.audio.data_offsets[1], profileSpec.carryFile.bytes, 'the tensor offsets partition the payload exactly')

  // The receipt record the owner registers (Task 2's row): the digest is
  // sha256 over the SAVED BYTES, and it VERIFIES — a re-fetch at the same
  // deterministic path serves byte-identical content.
  const digestOf = (buf) => createHash('sha256').update(buf).digest('hex')
  const artifact = {
    artifactId: uuid(),
    sourceAttemptId: carried.attemptId,
    digest: digestOf(carryBytes),
    saveRecipeVersion: header.__metadata__.format,
    producedAt: Date.now(),
  }
  assert.match(artifact.digest, /^[0-9a-f]{64}$/, 'the digest is a real sha256 over the saved bytes')
  assert.equal(artifact.saveRecipeVersion, CONTINUATION_SAVE_RECIPE_VERSION)
  const refetched = await engineFetch(carryUrl)
  assert.equal(refetched.status, 200)
  assert.equal(digestOf(Buffer.from(await refetched.arrayBuffer())), artifact.digest, 'the deterministic path re-serves byte-identical content — the digest verifies')

  // ---- Leg 2 — the PLAIN render (no flag): the same tween lane writes
  // NOTHING (a plain render does not carry; its continuation readiness is
  // the not-produced condition once Task 2 lands).
  const plainSnap = makeTweenSnapshot(step, row.revision)
  const plain = await service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: plainSnap }, 'idem-x2')
  const plainLanded = await waitAttemptState(plain.attemptId, ['ready'], 'the plain tween render landing')
  const plainRecord = await engineRecord(plainLanded.engineJobId)
  assert.equal(Object.values(plainRecord.prompt[2]).some((node) => node.class_type === 'MiniMaxH3MotionContextSaveLatent'), false, 'a plain render submits no save node')
  const plainParts = engineOutputCarryPath(plain.attemptId).split('/')
  const plainFile = plainParts.pop()
  const plainSubfolder = plainParts.join('/')
  const miss = await engineFetch(`/view?filename=${encodeURIComponent(plainFile)}&subfolder=${encodeURIComponent(plainSubfolder)}&type=output`)
  assert.equal(miss.status, 404, 'no carry file exists for the plain render')
})

// ---------------------------------------------------------------------------
// (y) the readiness split (spec 2026-10-08 §7/§8, Task 2) — the owner's
//     carry registration over the REAL submit path. The production machinery
//     runs whole: the landing path kicks the registration detached, the
//     store persists the continuation column, the availability check is the
//     exported seam Task 3/5's preflight/dispatch will call. The one
//     instrument is the carry-fetch override in front of the owner's engine
//     view (the prep-override pattern) — a held gate proves the SPLIT, an
//     injected failure proves the retry shapes.
// ---------------------------------------------------------------------------

/** A fresh tween span + step slot on a fresh document (the (y) sections'
 *  shared fixture shape). */
function carryDocFixture(name) {
  const doc = anim.createDocument({ projectId, name, binding: makeBinding() })
  const keyFrom = uuid()
  const keyTo = uuid()
  let row = anim.addKeyCandidate(doc.id, keyFrom, { id: uuid(), assetReference: registerRefImage(`y-${name}-from`), origin: 'import', provenance: { assetId: `stable-${uuid().slice(0, 8)}` }, poseDescription: null, facing: null }, 0)
  row = anim.addKeyCandidate(doc.id, keyTo, { id: uuid(), assetReference: registerRefImage(`y-${name}-to`), origin: 'import', provenance: { assetId: `stable-${uuid().slice(0, 8)}` }, poseDescription: null, facing: null }, row.revision)
  row = anim.insertSpan(doc.id, { fromKeyId: keyFrom, toKeyId: keyTo, intent: { movement: 'turns through the doorway', preservation: 'silhouette intact' } }, row.revision)
  return { doc, step: row.body.spans[0].stepSlots[0].id, revision: row.revision }
}

function carrySnapshot(step, revision) {
  const snapshot = makeTweenSnapshot(step, revision)
  snapshot.settings.carry = true
  return snapshot
}

test('(y1) the happy split — media lands ready WHILE the artifact registers; the record registers digest-verified', async () => {
  const { doc, step, revision } = carryDocFixture('Yankee')
  const before = await engineRecordCount()

  // The gate holds the receipt fetch until the split is OBSERVED — the
  // deterministic way to catch the registering window on a fast local fetch.
  let release = null
  const gate = new Promise((resolve) => { release = resolve })
  const submitted = await service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: carrySnapshot(step, revision) }, 'idem-y1')
  carryFetchOverrides.set(submitted.attemptId, async (attemptId) => {
    await gate
    return engineClient.fetchCarryArtifact(attemptId)
  })

  // THE SPLIT (§7): playable readiness lands FIRST and independently — the
  // standing ready transition, the candidate, and the proposed frame are all
  // durable while the continuation is still REGISTERING.
  const landed = await waitAttemptState(submitted.attemptId, ['ready'], 'the carrying render landing its media readiness')
  assert.equal(landed.result.candidate.frameCount, 22, 'the playable clip landed')
  assert.equal(landed.preparation.state, 'proposed', 'the proposed frame prepared — the standing lifecycle untouched')
  assert.equal(anim.getAttempt(submitted.attemptId).continuation.state, 'registering', 'media ready while the carry artifact registers — the two readiness halves are independent')
  assert.ok(events.some((event) => event.type === 'animation.attempt.ready' && event.payload.attemptId === submitted.attemptId), 'the ready event fired without waiting for the carry')
  assert.ok(!events.some((event) => event.type === 'animation.attempt.continuation-ready' && event.payload.attemptId === submitted.attemptId), 'no continuation-ready event while the registration is held')

  release()
  const registered = await waitContinuation(submitted.attemptId, ['ready'], 'the carry artifact registering')
  assert.equal(registered.continuation.artifact.sourceAttemptId, submitted.attemptId)
  assert.match(registered.continuation.artifact.artifactId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'the artifact id is a canonical UUID')
  assert.equal(registered.continuation.artifact.saveRecipeVersion, CONTINUATION_SAVE_RECIPE_VERSION, 'the save-recipe version was read FROM the file, not guessed')

  // THE DIGEST: sha256 over the file bytes served at the deterministic
  // receipt path — and the registered blob is byte-identical to them.
  const carryPath = engineOutputCarryPath(submitted.attemptId)
  const parts = carryPath.split('/')
  const filename = parts.pop()
  const subfolder = parts.join('/')
  const served = await engineFetch(`/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=output`)
  assert.equal(served.status, 200)
  const servedBytes = Buffer.from(await served.arrayBuffer())
  const digestOf = (buf) => createHash('sha256').update(buf).digest('hex')
  assert.equal(registered.continuation.artifact.digest, digestOf(servedBytes), 'the record digest is the sha256 of the saved file bytes')
  const stored = documents.readBlob(registered.continuation.relPath)
  assert.ok(stored && stored.equals(servedBytes), 'the registered studio blob is byte-identical to the engine-served carry file')

  // The view mirror: continuation ready with the OPAQUE handle only.
  const state = service.getState(submitted.attemptId)
  assert.equal(state.continuation.state, 'ready')
  assert.deepEqual(Object.keys(state.continuation.artifact).sort(), ['artifactId', 'digest'], 'the view carries the opaque {artifactId, digest} handle — no blob path leaks')
  assert.equal(state.continuation.artifact.digest, registered.continuation.artifact.digest)
  assert.ok(events.some((event) => event.type === 'animation.attempt.continuation-ready' && event.payload.attemptId === submitted.attemptId), 'the fabric seam observed the registration')
  assert.equal(await engineRecordCount(), before + 1, 'exactly one engine submission — the registration read, never re-rendered')
})

test('(y2) registration failure with the file present — bounded retries, the sweep resume, the explicit action; never a re-render', async () => {
  const { doc, step, revision } = carryDocFixture('Zulu')
  const before = await engineRecordCount()
  const submitted = await service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: carrySnapshot(step, revision) }, 'idem-y2')
  let fetchAttempts = 0
  carryFetchOverrides.set(submitted.attemptId, async () => {
    fetchAttempts += 1
    throw new Error('the engine became unreachable at the receipt fetch')
  })
  await waitAttemptState(submitted.attemptId, ['ready'], 'the media landing regardless of the carry failure')
  await waitUntil(() => {
    const row = anim.getAttempt(submitted.attemptId)
    return row.continuation.state === 'registering' && row.continuation.error !== undefined
  }, 10_000, 'the bounded registration retries exhausting with the reason recorded')
  assert.equal(fetchAttempts, 3, 'the first try plus 2 bounded auto-retries — the frame-preparation pattern')
  const failedRow = anim.getAttempt(submitted.attemptId)
  assert.match(failedRow.continuation.error, /unreachable at the receipt fetch/)
  assert.equal(failedRow.execution.state, 'ready', 'the clip stays playable — the playable half never regresses')
  assert.ok(failedRow.result, 'the landed candidate is preserved')
  assert.equal(failedRow.preparation.state, 'proposed')
  assert.equal(await engineRecordCount(), before + 1, 'the failed registration re-submitted nothing')

  // THE SWEEP RESUME (the §7 crash shape): a later boot's reconcile re-drives
  // a registering row — bounded again, still no /prompt anywhere.
  await owner.reconcile()
  await waitUntil(() => fetchAttempts >= 6, 10_000, 'the sweep re-driving the bounded registration')
  // The sweep kick's retries are immediate (no timers), but the final
  // settle-write races the count observation — hold until the loop has
  // provably finished before clearing the failure for the explicit action.
  await sleep(250)
  assert.equal(fetchAttempts, 6, 'the sweep resume performed its own bounded round')
  const sweptRow = anim.getAttempt(submitted.attemptId)
  assert.equal(sweptRow.continuation.state, 'registering', 'the sweep resume keeps the retryable shape')
  assert.match(sweptRow.continuation.error, /unreachable at the receipt fetch/)
  assert.equal(await engineRecordCount(), before + 1, 'the sweep resume re-submitted nothing')

  // THE EXPLICIT ACTION (the registering shape's way forward): the failure
  // clears, the retry registers, still no re-render. The retry's fetch runs
  // through the PRODUCTION path (the override is gone), so the counter stays
  // at 6 — the registration itself is the proof.
  carryFetchOverrides.delete(submitted.attemptId)
  await service.retryContinuationRegistration(submitted.attemptId)
  const recovered = anim.getAttempt(submitted.attemptId)
  assert.equal(recovered.continuation.state, 'ready')
  assert.ok(recovered.continuation.artifact, 'the record registered')
  const recoveredDigest = (buf) => createHash('sha256').update(buf).digest('hex')
  const y2Path = engineOutputCarryPath(submitted.attemptId)
  const y2Parts = y2Path.split('/')
  const y2Served = await engineFetch(`/view?filename=${encodeURIComponent(y2Parts.pop())}&subfolder=${encodeURIComponent(y2Parts.join('/'))}&type=output`)
  assert.equal(recovered.continuation.artifact.digest, recoveredDigest(Buffer.from(await y2Served.arrayBuffer())), 'the recovered record digests the real carry file')
  assert.ok(documents.readBlob(recovered.continuation.relPath), 'the studio blob is readable')
  assert.equal(fetchAttempts, 6, 'no further override fetches — the explicit retry read through the production path')
  assert.equal(await engineRecordCount(), before + 1, 'the whole recovery never re-rendered')

  // The retry's own refusals: a landed attempt that never carried, and an
  // unlanded attempt, answer the named 400s.
  const plain = await service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: makeTweenSnapshot(step, anim.getDocument(doc.id).revision) }, 'idem-y2-plain')
  await waitAttemptState(plain.attemptId, ['ready'], 'the plain (no-carry) render landing')
  await assert.rejects(
    () => service.retryContinuationRegistration(plain.attemptId),
    (err) => err instanceof AnimationRuleError && err.status === 400 && /no continuation artifact to register/.test(err.message),
    'the explicit retry refuses a non-carrying attempt by name',
  )
  const unlanded = await service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: carrySnapshot(step, anim.getDocument(doc.id).revision) }, 'idem-y2-unlanded')
  await assert.rejects(
    () => service.retryContinuationRegistration(unlanded.attemptId),
    (err) => err instanceof AnimationRuleError && err.status === 400 && /Only a landed clip/.test(err.message),
    'the explicit retry refuses an unlanded attempt',
  )
  await service.cancel(unlanded.attemptId)
})

test('(y3) the no-file case — the named not-produced condition, terminal, playable preserved, no re-render ever', async () => {
  const { doc, step, revision } = carryDocFixture('Nova')
  await engineControl({ omitCarrySave: true })
  try {
    const submitted = await service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: carrySnapshot(step, revision) }, 'idem-y3')
    const landed = await waitAttemptState(submitted.attemptId, ['ready'], 'the media landing (the render itself succeeded)')
    await waitContinuation(submitted.attemptId, ['not-produced'], 'the named condition settling')

    const row = anim.getAttempt(submitted.attemptId)
    assert.equal(row.continuation.state, 'not-produced', 'the deterministic receipt path holds no file — not-produced')
    assert.equal(row.continuation.artifact, undefined, 'no artifact was minted')
    assert.equal(row.execution.state, 'ready', 'the clip stays playable')
    assert.ok(row.result, 'the landed candidate is preserved')
    assert.equal(row.preparation.state, 'proposed', 'the standing lifecycle is untouched')
    assert.equal(landed.result.candidate.frameCount, 22)
    // The receipt path really is empty (the knob suppressed the write).
    const parts = engineOutputCarryPath(submitted.attemptId).split('/')
    const file = parts.pop()
    const miss = await engineFetch(`/view?filename=${encodeURIComponent(file)}&subfolder=${encodeURIComponent(parts.join('/'))}&type=output`)
    assert.equal(miss.status, 404, 'no carry file exists at the deterministic path')

    // NO RE-RENDER EVER: an absence window over the engine's record count —
    // the settle, a wait, and the refused retry all leave it unchanged.
    const settled = await engineRecordCount()
    await sleep(300) // negative observation window: nothing re-prompts
    assert.equal(await engineRecordCount(), settled, 'no re-render fired for the no-file condition')

    // TERMINAL for the attempt: the explicit retry refuses with the named
    // condition pointing at the re-roll, never a re-fetch.
    await assert.rejects(
      () => service.retryContinuationRegistration(submitted.attemptId),
      (err) => err instanceof AnimationRuleError && err.status === 400 && /continuation readiness is unreachable/.test(err.message) && /re-roll/.test(err.message),
      'the explicit retry refuses the terminal named condition',
    )
    assert.equal(await engineRecordCount(), settled, 'the refused retry re-rendered nothing')
    assert.equal(service.getState(submitted.attemptId).continuation.state, 'not-produced', 'the view carries the named condition')
    assert.ok(events.some((event) => event.type === 'animation.attempt.continuation-not-produced' && event.payload.attemptId === submitted.attemptId), 'the fabric seam observed the named condition')
  } finally {
    await engineControl({ omitCarrySave: false })
  }
})

test('(y4) the eviction case — the availability check refuses BY NAME at both call sites; the clip playable; recovery on re-resolve', async () => {
  const { doc, step, revision } = carryDocFixture('Oscar')
  const submitted = await service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: carrySnapshot(step, revision) }, 'idem-y4')
  await waitAttemptState(submitted.attemptId, ['ready'], 'the carrying render landing')
  const registered = await waitContinuation(submitted.attemptId, ['ready'], 'the artifact registering')
  const artifact = registered.continuation.artifact
  const relPath = registered.continuation.relPath
  const blobAbs = path.join(home, relPath)
  const blobBytes = fs.readFileSync(blobAbs)

  // THE PREFLIGHT SITE: the artifact removed post-registration — the check
  // refuses BY NAME (the artifact id + the digest), the state flips
  // unavailable, the RECORD is preserved (§5: metadata vs availability).
  fs.unlinkSync(blobAbs)
  await assert.rejects(
    async () => service.requireContinuationArtifact(submitted.attemptId),
    (err) => err instanceof ContinuationUnavailableError
      && err.message.includes(artifact.artifactId)
      && err.message.includes(artifact.digest)
      && /continuation unavailable/.test(err.message)
      && /stays playable/.test(err.message),
    'the preflight-site check refuses by name',
  )
  const unavailableRow = anim.getAttempt(submitted.attemptId)
  assert.equal(unavailableRow.continuation.state, 'unavailable')
  assert.equal(unavailableRow.continuation.artifact.digest, artifact.digest, 'the record stays truthful history')
  const view = service.getState(submitted.attemptId)
  assert.equal(view.execution, 'ready', 'the clip stays playable throughout')
  assert.ok(view.candidate, 'the playable candidate is intact')
  assert.equal(view.continuation.state, 'unavailable', 'the view carries the unavailable condition')
  assert.equal(view.continuation.artifact.artifactId, artifact.artifactId, 'the view still carries the opaque handle — the binding surface stays truthful')

  // THE DISPATCH SITE (the same seam the dispatch will call): refuses again
  // by name — and the miss is ALSO a digest MISMATCH, not just absence: a
  // replaced file under the content-addressed path refuses identically.
  fs.writeFileSync(blobAbs, Buffer.concat([blobBytes, Buffer.from('-tampered')]))
  await assert.rejects(
    async () => service.requireContinuationArtifact(submitted.attemptId),
    (err) => err instanceof ContinuationUnavailableError && err.message.includes(artifact.artifactId),
    'the dispatch-site check refuses the replaced-content artifact by name',
  )
  assert.equal(anim.getAttempt(submitted.attemptId).continuation.state, 'unavailable')

  // RECOVERY: availability is derived truth — the blob resolving by digest
  // again flips the row back to ready (the §7 backstop, not a re-fetch).
  fs.writeFileSync(blobAbs, blobBytes)
  const record = service.requireContinuationArtifact(submitted.attemptId)
  assert.equal(record.digest, artifact.digest)
  assert.equal(record.artifactId, artifact.artifactId)
  assert.equal(anim.getAttempt(submitted.attemptId).continuation.state, 'ready', 'a re-resolved artifact is available again — the state tracks the digest, not a guess')

  // The seam's own refusal vocabulary: no registered artifact answers the
  // named rule error (the plain-attempt shape), not the unavailable class.
  const plain = await service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: makeTweenSnapshot(step, anim.getDocument(doc.id).revision) }, 'idem-y4-plain')
  await waitAttemptState(plain.attemptId, ['ready'], 'the plain render landing')
  await assert.rejects(
    async () => service.requireContinuationArtifact(plain.attemptId),
    (err) => err instanceof AnimationRuleError && err.status === 400 && /no registered continuation artifact/.test(err.message),
    'an attempt with no artifact answers the rule refusal, never the unavailable class',
  )
  // And the explicit retry's unavailable refusal (the named recovery list).
  const gone = await service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: carrySnapshot(step, anim.getDocument(doc.id).revision) }, 'idem-y4-gone')
  await waitAttemptState(gone.attemptId, ['ready'], 'the second carrying render landing')
  await waitContinuation(gone.attemptId, ['ready'], 'the second artifact registering')
  const goneRow = anim.getAttempt(gone.attemptId)
  fs.unlinkSync(path.join(home, goneRow.continuation.relPath))
  await assert.rejects(
    async () => service.requireContinuationArtifact(gone.attemptId),
    (err) => err instanceof ContinuationUnavailableError,
  )
  await assert.rejects(
    () => service.retryContinuationRegistration(gone.attemptId),
    (err) => err instanceof AnimationRuleError && err.status === 400 && /re-fetch/.test(err.message),
    'the explicit retry refuses the unavailable condition — recovery is §7\'s explicit list',
  )
})

test('(y5) the bookend containment — a state-write IO failure never escapes the kick, never leaks the in-flight id (review M-1)', async () => {
  const { doc, step, revision } = carryDocFixture('Papa')

  // The bookend stub: ONE throwing state write per leg — the SQLite
  // disk-full class (the payloads are trivially valid, so IO is the only
  // failure mode the writes have). Leg 1 fails the PROLOGUE registering
  // write; leg 2 fails the exhausted-EPILOGUE error write. Everything else
  // passes through to the production store.
  const rawWrite = anim.setAttemptContinuation
  const originalWrite = rawWrite.bind(anim)
  let leg = 1
  let thrown = false
  let attempt1 = null
  let attempt2 = null
  anim.setAttemptContinuation = (attemptId, continuation) => {
    const prologue = continuation.state === 'registering' && continuation.error === undefined
    const epilogue = continuation.state === 'registering' && continuation.error !== undefined
    if (!thrown && ((leg === 1 && attemptId === attempt1 && prologue) || (leg === 2 && attemptId === attempt2 && epilogue))) {
      thrown = true
      throw new Error(`sqlite: database or disk is full (${leg === 1 ? 'prologue' : 'epilogue'})`)
    }
    return originalWrite(attemptId, continuation)
  }
  try {
    // ---- Leg 1 — the PROLOGUE bookend: the registering write itself fails.
    // The failure must land as the registration-failed EVENT (this test
    // process survives — no unhandled rejection), the row keeps its prior
    // truth, no fetch half-runs, and the in-flight set is CLEAN afterward
    // (the explicit retry runs — a leaked id would silently no-op at the
    // guard).
    const submitted1 = await service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: carrySnapshot(step, revision) }, 'idem-y5a')
    attempt1 = submitted1.attemptId
    let leg1Fetches = 0
    carryFetchOverrides.set(attempt1, (id) => {
      leg1Fetches += 1
      return engineClient.fetchCarryArtifact(id)
    })
    await waitAttemptState(attempt1, ['ready'], 'the media landing (leg 1)')
    await waitUntil(() => events.some((event) => event.type === 'animation.attempt.continuation-registration-failed' && event.payload.attemptId === attempt1), 10_000, 'the prologue bookend failure landing as the event')
    assert.deepEqual(anim.getAttempt(attempt1).continuation, { state: 'absent' }, 'a failed prologue write leaves the row at its prior truth — no half-state')
    assert.equal(leg1Fetches, 0, 'the registration did not half-run — the loop never started behind the failed bookend')
    const registrationFailed = events.find((event) => event.type === 'animation.attempt.continuation-registration-failed' && event.payload.attemptId === attempt1)
    assert.match(registrationFailed.payload.error, /disk is full \(prologue\)/, 'the event names the observed bookend cause')
    await service.retryContinuationRegistration(attempt1)
    assert.equal(anim.getAttempt(attempt1).continuation.state, 'ready', 'the explicit retry RAN after the bookend failure — the in-flight set was cleaned, not leaked')
    assert.ok(anim.getAttempt(attempt1).continuation.artifact)
    assert.ok(leg1Fetches >= 1, 'the retry fetched through the real path')

    // ---- Leg 2 — the EPILOGUE bookend: the exhausted-error write itself
    // fails after the bounded loop. Same contract: the event lands with the
    // bookend cause, the set cleans, the explicit retry drives to ready.
    leg = 2
    thrown = false
    const submitted2 = await service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: carrySnapshot(step, revision) }, 'idem-y5b')
    attempt2 = submitted2.attemptId
    carryFetchOverrides.set(attempt2, async () => {
      throw new Error('the engine became unreachable at the receipt fetch')
    })
    await waitAttemptState(attempt2, ['ready'], 'the media landing (leg 2)')
    await waitUntil(() => events.some((event) => event.type === 'animation.attempt.continuation-registration-failed' && event.payload.attemptId === attempt2 && /disk is full \(epilogue\)/.test(String(event.payload.error))), 10_000, 'the epilogue bookend failure landing as the event with its cause')
    assert.deepEqual(anim.getAttempt(attempt2).continuation, { state: 'registering' }, 'the prologue write landed; the failed error-write left no half-error state')
    carryFetchOverrides.delete(attempt2)
    await service.retryContinuationRegistration(attempt2)
    assert.equal(anim.getAttempt(attempt2).continuation.state, 'ready', 'the explicit retry drove the epilogue-failed row to ready')
    assert.ok(anim.getAttempt(attempt2).continuation.artifact)
  } finally {
    anim.setAttemptContinuation = rawWrite
    carryFetchOverrides.delete(attempt1)
    carryFetchOverrides.delete(attempt2)
  }
})

// ---------------------------------------------------------------------------
// (z) content identities (extension lane Task 3, spec §5/§6) — the digesting
//     seam and the fail-closed target-execution comparison at dispatch
// ---------------------------------------------------------------------------

/** Lands a carrying tween source on a FRESH document and waits for BOTH
 *  readiness halves (playable + the carry artifact registered). */
async function landCarrySource(label, idem) {
  const { doc, step, revision } = carryDocFixture(label)
  const submitted = await service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: carrySnapshot(step, revision) }, idem)
  await waitAttemptState(submitted.attemptId, ['ready'], `${label}: the carrying render landing`)
  await waitContinuation(submitted.attemptId, ['ready'], `${label}: the carry artifact registering`)
  return { doc, step, attemptId: submitted.attemptId }
}

/** The extension TARGET's snapshot: a tween snapshot whose frozen
 *  continuation binding carries the source attempt and its stamped
 *  identities verbatim, shaped exactly as Task 5's route now freezes it —
 *  the 56-frame sampled window with the recipe's 22-frame pinned head (the
 *  plain tween snapshot's default 22-frame window cannot host a 22-frame
 *  head; the node contract keeps the pin strictly shorter). */
function extendSnapshot(step, revision, sourceAttemptId, modelIdentities) {
  const snapshot = makeTweenSnapshot(step, revision)
  snapshot.settings = { ...snapshot.settings, carry: true, length: 56, contextLength: 22, audioContextLength: 24 }
  snapshot.continuationBinding = { sourceAttemptId, modelIdentities }
  return snapshot
}

const digestOf = (buf) => createHash('sha256').update(buf).digest('hex')
const RESOLVED_UNET = 'minimax_h3_ref2va_pruned_int8_convrot.safetensors'
const RESOLVED_TEXT_ENCODER = 'qwen3vl_32b_int8_convrot.safetensors'

test('(z1) identical identities pass at DISPATCH — the source stamps the digests of its RESOLVED weights, and the target renders on the same set', async () => {
  // ---- the digesting seam, directly: the fixture-backed folder answers
  // one identity per RESOLVED slot, in the resolver's documented order.
  const enumerations = await engineClient.modelEnumerations({ force: true })
  const identities = await resolvedIdentities({ tool: 'tween', enumerations, modelFolder: evidenceFolderFor })
  assert.equal(identities.length, 4, 'four slots, four identities')
  assert.deepEqual(identities.map((identity) => identity.name), [RESOLVED_UNET, 'h3_tween_step12000.safetensors', RESOLVED_TEXT_ENCODER, 'minimax_h3_video_vae_fp16.safetensors'], 'the identity names are the RESOLVED names (the ladder output, in slot order)')
  for (const identity of identities) {
    assert.match(identity.digest, /^[0-9a-f]{64}$/, 'a sha-256 digest')
    assert.ok(Number.isInteger(identity.bytes) && identity.bytes > 0, 'the byte count rides the identity')
  }
  const unet = identities.find((identity) => identity.name === RESOLVED_UNET)
  const unetBytes = fs.readFileSync(path.join(evidenceRoot.dir, 'diffusion_models', RESOLVED_UNET))
  assert.equal(unet.digest, digestOf(unetBytes), 'the digest is the sha256 of the resolved weight FILE')
  assert.equal(unet.bytes, unetBytes.length, 'the byte count is the file size')

  // ---- the pure comparison: an identical set passes; nothing throws.
  compareModelIdentities(identities, identities.map((identity) => ({ ...identity })))

  // ---- the SOURCE stamp through the real submit path: a carrying render's
  // frozen record carries the digests of the weights it ran on.
  const source = await landCarrySource('Zulu-one', 'idem-z1-source')
  const stamped = anim.getAttempt(source.attemptId).snapshot.modelIdentities
  assert.deepEqual(stamped, identities, 'the frozen record carries exactly the seam\'s identities — captured at source submit, before any drift can happen')

  // ---- THE TARGET-VS-BINDING COMPARISON AT DISPATCH (test d): the same
  // identities freshly re-resolved MATCH the frozen set — the gate passes
  // and the graph is submitted exactly once.
  const before = await engineRecordCount()
  const target = await service.submit(
    { documentId: source.doc.id, tool: 'tween', targetId: source.step, snapshot: extendSnapshot(source.step, anim.getDocument(source.doc.id).revision, source.attemptId, stamped) },
    'idem-z1-target',
  )
  const landed = await waitAttemptState(target.attemptId, ['ready'], 'the extension target rendering under identical identities')
  assert.ok(landed.result, 'the target rendered and landed a candidate')
  assert.equal(await engineRecordCount(), before + 1, 'the gate PASSED — exactly one engine submission')
})

test('(z2) same name, different digest — the aliased-weights refusal names the artifact and BOTH digests, nothing is submitted, the cache is never trusted past the mtime', async () => {
  const source = await landCarrySource('Zulu-two', 'idem-z2-source')
  const frozenIdentities = anim.getAttempt(source.attemptId).snapshot.modelIdentities
  const unet = frozenIdentities.find((identity) => identity.name === RESOLVED_UNET)
  const unetPath = path.join(evidenceRoot.dir, 'diffusion_models', RESOLVED_UNET)
  const before = await engineRecordCount()
  try {
    // WEIGHTS REPLACED UNDER THE UNCHANGED NAME — still enumerated, still
    // "the resolved name", different bytes (the identity cache already holds
    // this path's ORIGINAL digest from the source's submit: the refusal
    // below also proves the cache re-hashed instead of serving it stale).
    fs.writeFileSync(unetPath, Buffer.concat([fs.readFileSync(unetPath), Buffer.from('-replaced-weights-payload-aka-the-alias')]))
    const freshDigest = digestOf(fs.readFileSync(unetPath))
    assert.notEqual(freshDigest, unet.digest, 'the aliased file hashes differently')

    const target = await service.submit(
      { documentId: source.doc.id, tool: 'tween', targetId: source.step, snapshot: extendSnapshot(source.step, anim.getDocument(source.doc.id).revision, source.attemptId, frozenIdentities) },
      'idem-z2-target',
    )
    const failed = await waitAttemptState(target.attemptId, ['failed'], 'the aliased-weights dispatch refusal')
    assert.match(failed.execution.failureReason, new RegExp(RESOLVED_UNET.replace(/\./g, '\\.')), 'the refusal NAMES the drifted artifact (the unchanged filename)')
    assert.ok(failed.execution.failureReason.includes(unet.digest), 'the refusal carries the frozen digest')
    assert.ok(failed.execution.failureReason.includes(freshDigest), 'the refusal carries the fresh digest')
    assert.match(failed.execution.failureReason, /replaced/, 'the refusal states the aliased-weights cause')
    assert.match(failed.execution.failureReason, /re-land the source|rebind/, 'the refusal names the paths forward')
    assert.ok(events.some((event) => event.type === 'animation.attempt.failed' && event.payload.attemptId === target.attemptId && event.payload.reason === 'continuation-compatibility'), 'the named compatibility-failure event fired')
    assert.equal(await engineRecordCount(), before, 'NOTHING was submitted — the refusal preceded the graph send')

    // The SOURCE is untouched by its descendant's refusal: playable and
    // continuation-ready stay exactly as they landed (§5/§8).
    const sourceRow = anim.getAttempt(source.attemptId)
    assert.equal(sourceRow.execution.state, 'ready', 'the source stays playable')
    assert.equal(sourceRow.continuation.state, 'ready', 'the source stays continuation-ready — drift refuses the TARGET, never mutates the source')

    // The pure comparison, pinned directly: same name, different digest is
    // the named drift refusal naming the artifact.
    const drifted = frozenIdentities.map((identity) => (identity.name === RESOLVED_UNET ? { ...identity, digest: freshDigest, bytes: identity.bytes + 8 } : { ...identity }))
    assert.throws(
      () => compareModelIdentities(frozenIdentities, drifted),
      (err) => err instanceof ContinuationIdentityDriftError && err.artifact === RESOLVED_UNET && err.message.includes(unet.digest) && err.message.includes(freshDigest),
      'the seam refuses the digest mismatch by name',
    )
    // And the other drift shape: a name that no longer resolves at all.
    assert.throws(
      () => compareModelIdentities(frozenIdentities, frozenIdentities.filter((identity) => identity.name !== RESOLVED_UNET)),
      (err) => err instanceof ContinuationIdentityDriftError && err.artifact === RESOLVED_UNET && /no longer resolves/.test(err.message),
      'a vanished name refuses naming it',
    )
  } finally {
    restoreEvidenceFile(unetPath)
  }
})

test('(z3) missing identity evidence refuses — the deleted-file leg and the unconfigured-root leg, both named, never a name-only pass', async () => {
  const source = await landCarrySource('Zulu-three', 'idem-z3-source')
  const frozenIdentities = anim.getAttempt(source.attemptId).snapshot.modelIdentities
  const clipPath = path.join(evidenceRoot.dir, 'text_encoders', RESOLVED_TEXT_ENCODER)
  const submitTarget = (idem) => service.submit(
    { documentId: source.doc.id, tool: 'tween', targetId: source.step, snapshot: extendSnapshot(source.step, anim.getDocument(source.doc.id).revision, source.attemptId, frozenIdentities) },
    idem,
  )

  // ---- Leg 1: the name still ENUMERATES (the engine's registry serves it)
  // but the weight file is gone — the enumerated-alias hazard.
  fs.unlinkSync(clipPath)
  let before = await engineRecordCount()
  try {
    let target = await submitTarget('idem-z3-target-a')
    let failed = await waitAttemptState(target.attemptId, ['failed'], 'the missing-evidence refusal (file absent)')
    assert.match(failed.execution.failureReason, /Identity evidence is missing/, 'the named evidence class')
    assert.ok(failed.execution.failureReason.includes(RESOLVED_TEXT_ENCODER), 'the refusal names the resolved name whose evidence is gone')
    assert.match(failed.execution.failureReason, /textEncoder/, 'the refusal names the slot')
    assert.match(failed.execution.failureReason, /never a name-only pass/, 'the refusal states the fail-closed rule')
    assert.equal(await engineRecordCount(), before, 'nothing was submitted')

    // The seam, directly: the same world through resolvedIdentities.
    const enumerations = await engineClient.modelEnumerations({ force: true })
    await assert.rejects(
      () => resolvedIdentities({ tool: 'tween', enumerations, modelFolder: evidenceFolderFor }),
      (err) => err instanceof AnimationModelEvidenceError && err.slot === 'textEncoder' && err.resolvedName === RESOLVED_TEXT_ENCODER,
      'the digesting seam throws the named evidence refusal itself',
    )
  } finally {
    restoreEvidenceFile(clipPath)
  }

  // ---- Leg 2: the whole evidence root UNCONFIGURED (the v1 contract's
  // named refusal — this studio runs beside the engine; when no models root
  // is configured, identity checks refuse rather than pass on names).
  const originalDir = evidenceRoot.dir
  evidenceRoot.dir = ''
  try {
    before = await engineRecordCount()
    const target = await submitTarget('idem-z3-target-b')
    const failed = await waitAttemptState(target.attemptId, ['failed'], 'the missing-evidence refusal (root unconfigured)')
    assert.match(failed.execution.failureReason, /Identity evidence is missing/)
    assert.match(failed.execution.failureReason, /no models folder is configured/, 'the refusal names the configuration gap')
    assert.equal(await engineRecordCount(), before, 'nothing was submitted')
  } finally {
    evidenceRoot.dir = originalDir
  }
})

test('(z4) the dispatch site wires Task 2\'s availability seam — an evicted artifact refuses the extension BY NAME, and recovery re-submits clean', async () => {
  const source = await landCarrySource('Zulu-four', 'idem-z4-source')
  const frozenIdentities = anim.getAttempt(source.attemptId).snapshot.modelIdentities
  const registered = anim.getAttempt(source.attemptId)
  const blobAbs = path.join(home, registered.continuation.relPath)
  const blobBytes = fs.readFileSync(blobAbs)

  // EVICT the registered carry between registration and the extension's
  // dispatch: the gate's availability half must refuse THROUGH THE SEAM
  // (Task 2's requireContinuationArtifact — the one digest resolver; this
  // is the wiring Task 2's review routed here as load-bearing).
  fs.unlinkSync(blobAbs)
  const before = await engineRecordCount()
  try {
    const target = await service.submit(
      { documentId: source.doc.id, tool: 'tween', targetId: source.step, snapshot: extendSnapshot(source.step, anim.getDocument(source.doc.id).revision, source.attemptId, frozenIdentities) },
      'idem-z4-target-a',
    )
    const failed = await waitAttemptState(target.attemptId, ['failed'], 'the eviction refusal at the dispatch site')
    assert.match(failed.execution.failureReason, /continuation unavailable/, 'the named unavailable condition')
    assert.ok(failed.execution.failureReason.includes(registered.continuation.artifact.artifactId), 'the refusal names the artifact id')
    assert.ok(failed.execution.failureReason.includes(registered.continuation.artifact.digest), 'the refusal names the digest')
    assert.ok(events.some((event) => event.type === 'animation.attempt.failed' && event.payload.attemptId === target.attemptId && event.payload.reason === 'continuation-unavailable'), 'the named unavailable event fired')
    assert.equal(await engineRecordCount(), before, 'nothing was submitted')
    // The seam's DERIVED state flip happened through the dispatch call —
    // and the source's playable half is untouched throughout (§7).
    assert.equal(anim.getAttempt(source.attemptId).continuation.state, 'unavailable', 'the source flipped unavailable through the dispatch-site check')
    assert.equal(anim.getAttempt(source.attemptId).execution.state, 'ready', 'the source stays playable')

    // RECOVERY: availability is derived truth — restore the bytes, and a
    // NEW extension on a fresh key renders clean end to end. The re-observe
    // happens THROUGH the retry's own dispatch check (the row sits
    // optimistically unavailable until a consumer checks — exactly y4's
    // derived-state contract).
    fs.writeFileSync(blobAbs, blobBytes)
    const retry = await service.submit(
      { documentId: source.doc.id, tool: 'tween', targetId: source.step, snapshot: extendSnapshot(source.step, anim.getDocument(source.doc.id).revision, source.attemptId, frozenIdentities) },
      'idem-z4-target-b',
    )
    const landed = await waitAttemptState(retry.attemptId, ['ready'], 'the recovered extension rendering')
    assert.ok(landed.result, 'the recovered extension landed a candidate')
    assert.equal(anim.getAttempt(source.attemptId).continuation.state, 'ready', 'the retry\'s dispatch check re-flipped the source — availability is re-observed truth')
    assert.equal(await engineRecordCount(), before + 1, 'exactly one engine submission — the recovery path')
  } finally {
    if (!fs.existsSync(blobAbs)) fs.writeFileSync(blobAbs, blobBytes)
  }
})

test('(z5) the binding\'s shape gate at submit — malformed identities never persist; the unconfigured world renders on WITHOUT the stamp and says so', async () => {
  const { doc, step, revision } = carryDocFixture('Zulu-five')

  // A malformed binding (not a 64-hex digest) refuses at submit — nothing
  // persists, the named 400.
  const malformed = carrySnapshot(step, revision)
  malformed.continuationBinding = { sourceAttemptId: uuid(), modelIdentities: [{ name: 'x.safetensors', digest: 'not-a-digest', bytes: 10 }] }
  await assert.rejects(
    () => service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: malformed }, 'idem-z5-malformed'),
    (err) => err instanceof AnimationRuleError && err.status === 400 && /well-formed model content identities/.test(err.message),
    'a malformed binding answers the named shape refusal before anything persists',
  )
  // A foreign source attempt id refuses the same way.
  const foreign = carrySnapshot(step, revision)
  foreign.continuationBinding = { sourceAttemptId: 'not-a-uuid', modelIdentities: [{ name: 'x.safetensors', digest: 'a'.repeat(64), bytes: 10 }] }
  await assert.rejects(
    () => service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: foreign }, 'idem-z5-foreign'),
    (err) => err instanceof AnimationRuleError && err.status === 400 && /source attempt by UUID/.test(err.message),
  )

  // The unconfigured world: a carrying submit does NOT refuse (the render
  // is never hostage to identity evidence — §7's independence principle),
  // the stamp simply does not land, the named event records the gap, and
  // the extension attempt refuses later instead of passing on the name.
  const originalDir = evidenceRoot.dir
  evidenceRoot.dir = ''
  try {
    const submitted = await service.submit({ documentId: doc.id, tool: 'tween', targetId: step, snapshot: carrySnapshot(step, revision) }, 'idem-z5-gap')
    assert.equal(anim.getAttempt(submitted.attemptId).snapshot.modelIdentities, undefined, 'no identity stamp in the unconfigured world')
    await waitAttemptState(submitted.attemptId, ['ready'], 'the render landing playable despite the identity gap')
    await waitContinuation(submitted.attemptId, ['ready'], 'the carry artifact registering (availability is independent of identities)')
    assert.ok(
      events.some((event) => event.type === 'animation.attempt.continuation-identity-missing' && event.payload.attemptId === submitted.attemptId && /Identity evidence is missing/.test(String(event.payload.reason))),
      'the gap landed as the named event — never a silent drop',
    )
    // And a binding hand-frozen from this unconfigured source refuses at
    // dispatch: the target cannot pass on names it cannot digest.
    const before = await engineRecordCount()
    const named = await service.submit(
      { documentId: doc.id, tool: 'tween', targetId: step, snapshot: extendSnapshot(step, anim.getDocument(doc.id).revision, submitted.attemptId, [
        { name: RESOLVED_UNET, digest: 'b'.repeat(64), bytes: 100 },
        { name: 'h3_tween_step12000.safetensors', digest: 'c'.repeat(64), bytes: 100 },
        { name: RESOLVED_TEXT_ENCODER, digest: 'd'.repeat(64), bytes: 100 },
        { name: 'minimax_h3_video_vae_fp16.safetensors', digest: 'e'.repeat(64), bytes: 100 },
      ]) },
      'idem-z5-named',
    )
    const failed = await waitAttemptState(named.attemptId, ['failed'], 'the name-only world refusing at dispatch')
    assert.match(failed.execution.failureReason, /Identity evidence is missing/, 'never a name-only pass')
    assert.equal(await engineRecordCount(), before, 'nothing was submitted')
  } finally {
    evidenceRoot.dir = originalDir
  }
})
