// The animation export suite (task 14 of the animation-authoring module,
// spec 2026-10-06-animation-authoring-module-design.md §9 export + §11.3
// export packaging — Review Focus #5's tests land here): the delivery layer
// that freezes the document's editorial truth, gates it, assembles ONE
// review package (sequence.mp4 + manifest.json in a ZIP), and answers it
// over HTTP. Two halves:
//
//   (a) the PURE gate — deriveExportPlan's rejection/acknowledgment
//       boundary (task 13's declared narrowing: export owns length
//       semantics): clean plans across both lanes, out-of-range selections,
//       unlanded/foreign/hero attempts, missing media, degenerate ranges as
//       held drawings, zero-frame phantoms, the stale marks (span staleness
//       + earlierRevision), segmentFilter's exact chain, buildManifest's
//       recipe;
//   (b) the REAL pipeline over HTTP — the built server (dist-server, the
//       animation-routes BOOT pattern) + the standing fake engine
//       (e2e/mirror/fakeEngineServer.mjs, animation-h3 profile) + real
//       ffmpeg: landed tween + sequence takes contribute, the ZIP arrives,
//       the mp4 is silent H.264 at constant 24 fps and the document's
//       dimensions with the recipe's exact frame count, the manifest
//       carries sources + hashes + binding history + attempt lineage;
//   (c) §11.3's integrity arms — freeze-before-assembly (a re-export of an
//       UNCHANGED document is byte-identical; an export AFTER edits
//       reflects the new truth while the delivered bytes never change),
//       missing media and out-of-range selections refuse LOUDLY by name,
//       stale-but-usable exports only past the explicit acknowledgment
//       (428 + the stale list) and records stale in the manifest;
//   (d) task 13's carried M2 — reorder/remove are assembly decisions:
//       staleReasons stay byte-identical through them.
//   (a—i8)/(e) Codex batch B: I8 — the SPANLESS (sequence) lane derives
//       staleness from freeze-time drift (binding version / output settings
//       / window-endpoint drawings) instead of bypassing it: pure-gate pins
//       per drift class + the clean + pre-wave-1 cases, and the end-to-end
//       428-then-manifest leg over HTTP.
//
// ffmpeg is required on PATH (the datasets suite's standing assumption).
// Scratch homes through the Wave 4 ledger; ports through the allocator.
import { test, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const { makePortAllocator } = require('./lib/ports.cjs')
const { makeScratchDir, removeAllScratchDirs } = require('./lib/scratch.cjs')
const {
  deriveExportPlan,
  buildManifest,
  segmentFilter,
  ANIMATION_EXPORT_MANIFEST_VERSION,
} = require(path.join(REPO, 'dist-server/server/animation/export.js'))
const { unpackZip } = require(path.join(REPO, 'dist-server/server/documentArchive.js'))

const freePort = makePortAllocator('animation-export')
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

// ffmpeg/ffprobe (the datasets probe derivation — ffprobe ships next to ffmpeg)
const FFMPEG = 'ffmpeg'
const probeOf = () => path.join(path.dirname(FFMPEG), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
const decodedFrames = (file) =>
  Number(execFileSync(probeOf(), ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim())
const streamFacts = (file) =>
  execFileSync(probeOf(), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,avg_frame_rate', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim()
const hasAudio = (file) => execFileSync(probeOf(), ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim() !== ''

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

// ---------------------------------------------------------------------------
// (a) the pure gate — synthetic documents, no server
// ---------------------------------------------------------------------------

/** A minimal frozen document row for the pure derivations (the hydrated
 *  AnimationDocumentRow shape, only the fields the gate reads). */
function syntheticDocument(overrides = {}) {
  const { body, ...rest } = overrides
  return {
    id: uuid(),
    projectId: 'proj-export',
    name: 'Pure gate',
    schemaVersion: 1,
    revision: 4,
    updatedAt: 0,
    body: {
      keys: [
        { id: 'key-a', order: 0, selectedCandidateId: 'cand-a', candidates: [{ id: 'cand-a', assetReference: { assetId: 'a', relPath: 'canvas-blobs/aa/a', kind: 'image' }, origin: 'import', provenance: { assetId: 'a' }, poseDescription: null, facing: null }], lock: false },
        { id: 'key-b', order: 1, selectedCandidateId: 'cand-b', candidates: [{ id: 'cand-b', assetReference: { assetId: 'b', relPath: 'canvas-blobs/bb/b', kind: 'image' }, origin: 'import', provenance: { assetId: 'b' }, poseDescription: null, facing: null }], lock: false },
      ],
      spans: [
        { id: 'span-1', fromKeyId: 'key-a', toKeyId: 'key-b', intent: { movement: 'steps forward', preservation: 'silhouette' }, overrides: {}, stepSlots: [{ id: 'slot-1', attempts: ['att-tween'], selectedRollingReference: null }], stale: false, staleReasons: [] },
      ],
      bindingHistory: [{ version: 1, characterDescription: 'a courier', referenceAssetIds: ['r1'], medium: 'clean line on white', initialKeyAssetId: 'r0', boundAt: 1 }],
      activeBindingVersion: 1,
      editorial: [],
      settings: { outputWidth: 1344, outputHeight: 768, fps: 24, steps: 30 },
      ...(body ?? {}),
    },
    ...rest,
  }
}

const videoRef = () => ({ assetId: 'clip', relPath: `canvas-blobs/${uuid().slice(0, 2)}/${uuid()}`, kind: 'video' })

function tweenAttempt({ id = 'att-tween', landed = true, earlierRevision = false, frameCount = 22, execution = { state: 'ready' } } = {}) {
  return {
    id,
    tool: 'tween',
    idempotencyKey: `idem-${id}`,
    inputHash: 'i'.repeat(64),
    targetId: 'slot-1',
    snapshot: { tool: 'tween', targetId: 'slot-1', references: [], caption: 'c', compilerVersion: '1', settings: {}, documentRevision: 4 },
    execution,
    result: landed ? { candidate: { id: null, assetReference: videoRef(), frameCount, earlierRevision } } : null,
  }
}

function sequenceAttempt({ id = 'att-seq', landed = true, earlierRevision = false, frameCount = 22, execution = { state: 'ready' } } = {}) {
  return {
    id,
    tool: 'sequence',
    idempotencyKey: `idem-${id}`,
    inputHash: 'i'.repeat(64),
    targetId: 'key-a',
    snapshot: {
      tool: 'sequence', targetId: 'key-a', references: [], caption: 'c', compilerVersion: '1', settings: {}, documentRevision: 4,
      sequence: { windowStartKeyId: 'key-a', windowEndKeyId: 'key-b', orderedActions: ['rises'], preservation: 'coat', overrides: { medium: 'clean line on white' } },
    },
    execution,
    result: landed ? { candidate: { id: null, assetReference: videoRef(), frameCount, earlierRevision } } : null,
  }
}

const resolveEverything = () => '/blobs/clip.mp4'

test('(a) the gate derives a clean plan across both lanes — half-open ranges, output starts, degenerate ranges as held drawings', () => {
  const document = syntheticDocument({ body: {
    editorial: [
      { id: 'contrib-1', spanId: 'span-1', attemptId: 'att-tween', inFrame: 2, outFrame: 10, holdDuration: 6 },
      { id: 'contrib-2', spanId: null, attemptId: 'att-seq', inFrame: 5, outFrame: 5, holdDuration: 4 },
    ],
  } })
  const plan = deriveExportPlan(document, [tweenAttempt({ id: 'att-unlanded', landed: false, execution: { state: 'rendering' } }), tweenAttempt(), sequenceAttempt()], resolveEverything)
  assert.deepEqual(plan.refusals, [], 'a clean plan refuses nothing')
  assert.deepEqual(plan.stale, [], 'a fresh span and current landings mark nothing stale')
  assert.equal(plan.totalFrames, (8 + 6) + (0 + 4), 'clip frames + holds, degenerate range contributing only its hold')
  const [first, second] = plan.segments
  assert.equal(first.clipFrames, 8)
  assert.equal(first.outputStart, 0)
  assert.equal(first.outputFrames, 14)
  assert.deepEqual([first.selStart, first.selEnd], [2, 10], 'a normal range trims exactly its window')
  assert.equal(second.clipFrames, 0)
  assert.equal(second.outputFrames, 4)
  assert.equal(second.outputStart, 14)
  assert.deepEqual([second.selStart, second.selEnd], [5, 6], 'a degenerate range trims the ONE frame the hold points at')
})

test('(a) missing or incompatible selections refuse BY NAME — unlanded, foreign, hero, out-of-range, missing media, phantom rows, empty list', () => {
  const base = {
    editorial: [
      { id: 'contrib-unlanded', spanId: 'span-1', attemptId: 'att-unlanded', inFrame: 0, outFrame: 8, holdDuration: 0 },
      { id: 'contrib-range', spanId: 'span-1', attemptId: 'att-tween', inFrame: 0, outFrame: 999, holdDuration: 0 },
      { id: 'contrib-foreign', spanId: 'span-1', attemptId: 'att-elsewhere', inFrame: 0, outFrame: 8, holdDuration: 0 },
      { id: 'contrib-zero', spanId: null, attemptId: 'att-seq', inFrame: 5, outFrame: 5, holdDuration: 0 },
    ],
  }
  // The out-of-range and phantom rows ride a list whose OTHER rows refuse
  // first — every refusal is collected, never first-error-wins.
  const document = syntheticDocument({ body: base })
  const plan = deriveExportPlan(document, [tweenAttempt({ id: 'att-unlanded', landed: false, execution: { state: 'rendering' } }), tweenAttempt(), sequenceAttempt()], resolveEverything)
  const text = plan.refusals.join(' ')
  assert.match(text, /att-unla.*has not landed \(execution "rendering"\)/, 'the unlanded take names its execution state')
  assert.match(text, /\[0, 999\) exceeds the clip's 22 frames/, 'the out-of-range selection is named with its range and the clip truth')
  assert.match(text, /not an attempt of this document/, 'a foreign attempt id is named')
  assert.match(text, /contributes no frames \(a degenerate range with no hold\)/, 'a zero-output-frame entry is refused as a phantom manifest row')
  assert.equal(plan.segments.length, 0, 'nothing assembles while any row refuses')

  const hero = syntheticDocument({ body: { editorial: [{ id: 'contrib-hero', spanId: null, attemptId: 'att-hero', inFrame: 0, outFrame: 8, holdDuration: 0 }] } })
  const heroPlan = deriveExportPlan(hero, [{ id: 'att-hero', tool: 'hero', targetId: 'key-a', snapshot: { documentRevision: 4 }, execution: { state: 'ready' }, result: { candidate: { id: null, assetReference: videoRef(), frameCount: 22, earlierRevision: false } } }], resolveEverything)
  assert.match(heroPlan.refusals.join(' '), /hero lane's product is a key drawing/, 'a hero attempt never contributes (§5.2) — the key-still narrowing, decided')

  const missing = syntheticDocument({ body: { editorial: [{ id: 'contrib-missing', spanId: null, attemptId: 'att-seq', inFrame: 0, outFrame: 4, holdDuration: 0 }] } })
  const missingPlan = deriveExportPlan(missing, [sequenceAttempt()], () => null)
  assert.match(missingPlan.refusals.join(' '), /is missing from the store/, 'unresolvable media is named, never skipped')

  const gone = syntheticDocument({ body: { editorial: [{ id: 'contrib-holdgone', spanId: null, attemptId: 'att-seq', inFrame: 22, outFrame: 22, holdDuration: 6 }] } })
  const gonePlan = deriveExportPlan(gone, [sequenceAttempt()], resolveEverything)
  assert.match(gonePlan.refusals.join(' '), /points at frame 22 of a 22-frame clip/, 'a degenerate range must name an EXISTING frame')

  const empty = deriveExportPlan(syntheticDocument(), [], resolveEverything)
  assert.match(empty.refusals.join(' '), /assembled sequence is empty/, 'an empty sequence has nothing to deliver')

  // Odd output dimensions are a DOCUMENT-level refusal (H.264 at 4:2:0 needs
  // even pairs) — named at the gate, never an ffmpeg failure mid-assembly.
  const odd = syntheticDocument({ body: { settings: { outputWidth: 1345, outputHeight: 768, fps: 24, steps: 30 }, editorial: [{ id: 'contrib-odd', spanId: 'span-1', attemptId: 'att-tween', inFrame: 0, outFrame: 8, holdDuration: 0 }] } })
  const oddPlan = deriveExportPlan(odd, [tweenAttempt()], resolveEverything)
  assert.match(oddPlan.refusals.join(' '), /1345x768\) are odd/, 'odd dimensions refuse by name')
})

test('(a) stale-but-usable marks — span staleness and earlier revisions collect for the acknowledgment prompt', () => {
  const staleSpan = syntheticDocument({ body: {
    spans: [{ id: 'span-1', fromKeyId: 'key-a', toKeyId: 'key-b', intent: { movement: 'm', preservation: 'p' }, overrides: {}, stepSlots: [{ id: 'slot-1', attempts: ['att-tween'], selectedRollingReference: null }], stale: true, staleReasons: ['intent'] }],
    editorial: [{ id: 'contrib-stale', spanId: 'span-1', attemptId: 'att-tween', inFrame: 0, outFrame: 8, holdDuration: 0 }],
  } })
  const stalePlan = deriveExportPlan(staleSpan, [tweenAttempt()], resolveEverything)
  assert.equal(stalePlan.refusals.length, 0, 'stale-but-usable REFUSES NOTHING — it waits on the acknowledgment')
  assert.equal(stalePlan.stale.length, 1)
  assert.deepEqual(stalePlan.stale[0].reasons, ['intent'])
  assert.equal(stalePlan.segments[0].stale, true)
  assert.deepEqual(stalePlan.segments[0].staleReasons, ['intent'])

  // The LANDING's earlierRevision flag marks the spanless lane stale — and
  // drift alone does NOT: revisions move for unrelated reasons (assembly
  // decisions themselves bump them, §9), so a take that landed clean stays
  // clean however many edits follow.
  const drifted = syntheticDocument({ revision: 9, body: { editorial: [{ id: 'contrib-drift', spanId: null, attemptId: 'att-seq', inFrame: 0, outFrame: 8, holdDuration: 0 }] } })
  const driftPlan = deriveExportPlan(drifted, [sequenceAttempt()], resolveEverything)
  assert.deepEqual(driftPlan.stale, [], 'revision drift after a clean landing marks nothing stale')
  const flagged = deriveExportPlan(syntheticDocument({ body: { editorial: [{ id: 'contrib-flag', spanId: null, attemptId: 'att-seq', inFrame: 0, outFrame: 8, holdDuration: 0 }] } }), [sequenceAttempt({ earlierRevision: true })], resolveEverything)
  assert.deepEqual(flagged.stale[0].reasons, ['earlier-revision'])
})

test('(a) segmentFilter pins the exact conform chain, and buildManifest carries the recipe', () => {
  const document = syntheticDocument({ body: { editorial: [
    { id: 'contrib-1', spanId: 'span-1', attemptId: 'att-tween', inFrame: 2, outFrame: 10, holdDuration: 6 },
    { id: 'contrib-2', spanId: null, attemptId: 'att-seq', inFrame: 0, outFrame: 22, holdDuration: 0 },
  ] } })
  const attempts = [tweenAttempt(), sequenceAttempt()]
  const plan = deriveExportPlan(document, attempts, resolveEverything)
  assert.equal(
    segmentFilter(plan.segments[0], 1344, 768),
    'trim=start_frame=2:end_frame=10,setpts=PTS-STARTPTS,fps=24,scale=1344:768:force_original_aspect_ratio=decrease,pad=1344:768:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,tpad=stop_mode=clone:stop_duration=0.250000,format=yuv420p',
    'the hold clones exactly 6/24 s onto the trimmed window',
  )
  assert.ok(!segmentFilter(plan.segments[1], 1344, 768).includes('tpad'), 'a zero hold adds no clone tail')

  const manifest = buildManifest({
    document,
    attempts,
    plan,
    videoSha256: 'v'.repeat(64),
    videoFrameCount: plan.totalFrames,
    sourceHashes: new Map([['att-tween', 't'.repeat(64)], ['att-seq', 's'.repeat(64)]]),
    frozenAt: 123,
    staleAcknowledged: false,
  })
  assert.equal(manifest.manifestVersion, ANIMATION_EXPORT_MANIFEST_VERSION)
  assert.equal(manifest.kind, 'minimax-animation-sequence')
  assert.equal(manifest.document.revision, 4, 'the revision at freeze')
  assert.equal(manifest.document.bindingHistory.length, 1, 'the binding history rides verbatim (§11.3)')
  assert.equal(manifest.sequence.video.width, 1344)
  assert.equal(manifest.sequence.video.height, 768)
  assert.equal(manifest.sequence.totalFrames, plan.totalFrames)
  assert.equal(manifest.contributions.length, 2)
  assert.equal(manifest.contributions[0].source.sha256, 't'.repeat(64), 'the source hash rides per contribution')
  assert.equal(manifest.contributions[0].attempt.tool, 'tween')
  assert.equal(manifest.contributions[0].attempt.lineage.stepSlotIndex, 0, 'tween lineage names its step slot position')
  assert.equal(manifest.contributions[1].attempt.lineage.windowEndKeyId, 'key-b', 'sequence lineage names the frozen window')
  assert.ok(manifest.contributions[1].attempt.idempotencyKey, "the attempt's idempotency key rides")
})

// ---------------------------------------------------------------------------
// (b) the real pipeline — server + fake engine + ffmpeg over HTTP
// ---------------------------------------------------------------------------

let home = ''
let server = null
let api = null
let engine = null
let enginePort = 0
const engineFetch = (pathname, init) => fetch(`http://127.0.0.1:${enginePort}${pathname}`, init)

const bootedServers = []
const killAllServers = () => {
  for (const child of bootedServers) {
    try { child.kill() } catch { /* already gone */ }
  }
}
process.on('exit', killAllServers)

async function bootServer(homeDir, label) {
  const output = { text: '', label }
  const port = await freePort()
  const child = spawn(process.execPath, [path.join(REPO, 'dist-server', 'server', 'index.js')], {
    env: { ...process.env, MINIMAX_STUDIO_HOME: homeDir, MINIMAX_LAN_PORT: String(port), MINIMAX_NO_HTTPS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  bootedServers.push(child)
  child.stdout.on('data', (chunk) => { output.text += String(chunk) })
  child.stderr.on('data', (chunk) => { output.text += String(chunk) })
  const deadline = Date.now() + 20_000
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/lan/settings`)
      if (response.ok && output.text.includes(`"port":${port}`)) return { child, port, home: homeDir, output }
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
  const jsonOf = async (response) => {
    const body = await response.json().catch(() => ({}))
    return { status: response.status, body }
  }
  return {
    get: (pathname) => fetch(base + pathname).then(jsonOf),
    post: (pathname, payload) => fetch(base + pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).then(jsonOf),
    /** The export leg: the ZIP bytes on success, the JSON error otherwise. */
    export: async (documentId, acknowledgeStale) => {
      const response = await fetch(`${base}/api/lan/animation/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documentId, acknowledgeStale }) })
      if (response.ok) {
        const disposition = response.headers.get('content-disposition') ?? ''
        return { status: 200, archive: Buffer.from(await response.arrayBuffer()), fileName: /filename="([^"]+)"/.exec(disposition)?.[1] ?? '' }
      }
      return jsonOf(response)
    },
  }
}

function makeBinding() {
  return {
    characterDescription: 'a lanky courier in a long coat',
    referenceAssetIds: [uuid(), uuid()],
    medium: 'clean line on white',
    initialKeyAssetId: `asset-${uuid().slice(0, 8)}`,
  }
}

async function registerKeyImage(label) {
  const bytes = Buffer.from(`animation-export-reference-${label}-${uuid()}`)
  const response = await api.post('/api/lan/documents/blobs/ingest', { kind: 'image', name: `key-${label}.png`, data: bytes.toString('base64') })
  assert.equal(response.status, 200, `the reference image ingests over HTTP (${response.body.error ?? ''})`)
  return { assetId: `animref-${label}-${uuid().slice(0, 8)}`, relPath: response.body.blob.relPath, kind: 'image' }
}

async function makeSelectedKey(documentId, startRevision, label) {
  const assetReference = await registerKeyImage(label)
  const candidateId = uuid()
  const keyId = uuid()
  let response = await api.post('/api/lan/animation/keys', {
    op: 'add-candidate', documentId, keyId, expectedRevision: startRevision,
    candidate: { id: candidateId, assetReference, origin: 'import', provenance: { assetId: assetReference.assetId }, poseDescription: 'mid-stride, arms pumping', facing: 'screen-left' },
  })
  assert.equal(response.status, 200, `add-candidate lands (${response.body.error ?? ''})`)
  response = await api.post('/api/lan/animation/select/key-candidate', { documentId, keyId, candidateId, expectedRevision: response.body.document.revision })
  assert.equal(response.status, 200, `the key selection lands (${response.body.error ?? ''})`)
  return { keyId, revision: response.body.document.revision }
}

async function attemptReady(attemptId) {
  return waitUntil(async () => {
    const state = await api.get(`/api/lan/animation/attempt?id=${attemptId}`)
    return state.status === 200 && state.body.attempt.execution === 'ready'
  }, 30_000, `attempt ${attemptId} landing ready`)
}

async function attemptView(attemptId) {
  return (await api.get(`/api/lan/animation/attempt?id=${attemptId}`)).body.attempt
}

/** A document with two selected keys + one span (the tween lane) + the span's
 *  first step slot id. */
async function seedSpanDocument(name) {
  const created = await api.post('/api/lan/animation/documents', { projectId: 'proj-animation-export', name, binding: makeBinding() })
  assert.equal(created.status, 200)
  const documentId = created.body.document.id
  const first = await makeSelectedKey(documentId, created.body.document.revision, 'x1')
  const second = await makeSelectedKey(documentId, first.revision, 'x2')
  const inserted = await api.post('/api/lan/animation/spans', {
    op: 'insert', documentId, expectedRevision: second.revision, fromKeyId: first.keyId, toKeyId: second.keyId,
    intent: { movement: 'she pushes through into a stride', preservation: 'silhouette intact' },
  })
  assert.equal(inserted.status, 200, `the span inserts (${inserted.body.error ?? ''})`)
  const spanId = inserted.body.spanId
  const stepSlotId = inserted.body.document.body.spans.find((span) => span.id === spanId).stepSlots[0].id
  return { documentId, revision: inserted.body.document.revision, keyOne: first.keyId, keyTwo: second.keyId, spanId, stepSlotId }
}

const submitTween = (documentId, stepSlotId, key, overrides = {}) =>
  api.post('/api/lan/animation/attempts', {
    documentId, tool: 'tween', targetId: stepSlotId, idempotencyKey: `idem-export-tween-${key}`,
    draft: { tool: 'tween', targetStepSlotId: stepSlotId, movementStep: 'she shifts her weight onto the heel, hips following', overrides: { medium: 'flat black-and-white animatic', ...overrides } },
  })

const submitSequence = (documentId, startKeyId, endKeyId, key) =>
  api.post('/api/lan/animation/attempts', {
    documentId, tool: 'sequence', targetId: startKeyId, idempotencyKey: `idem-export-seq-${key}`,
    draft: { tool: 'sequence', windowStartKeyId: startKeyId, windowEndKeyId: endKeyId, orderedActions: ['she rises from the bench', 'the coat swings as she turns'], preservation: 'the coat hem stays consistent', overrides: { medium: 'flat cel colour on white' } },
  })

const contribute = (documentId, expectedRevision, payload) =>
  api.post('/api/lan/animation/select/clip-contribution', { documentId, expectedRevision, ...payload })

const unpackExport = (archive) => {
  const files = unpackZip(archive)
  assert.ok(files.has('sequence.mp4'), 'the ZIP carries sequence.mp4')
  assert.ok(files.has('manifest.json'), 'the ZIP carries manifest.json')
  return { video: files.get('sequence.mp4'), manifest: JSON.parse(files.get('manifest.json').toString('utf8')) }
}

/** The mp4 lands in a scratch file (ffprobe wants a path). */
const withVideo = async (bytes, run) => {
  const file = path.join(home, `probe-${uuid().slice(0, 8)}.mp4`)
  fs.writeFileSync(file, bytes)
  try {
    return await run(file)
  } finally {
    fs.rmSync(file, { force: true })
  }
}

let docMain = null

beforeAll(async () => {
  // ffmpeg must exist — the whole suite assembles real video.
  execFileSync(FFMPEG, ['-version'], { encoding: 'utf8', stdio: 'ignore' })

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

  home = makeScratchDir(path.join(os.tmpdir(), 'minimax-animation-export-'))
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ comfyUrl: `http://127.0.0.1:${enginePort}` }))

  server = await bootServer(home, 'animation-export')
  api = client(server.port)
}, 120_000)

afterAll(async () => {
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

test('(b) both lanes export one review package — silent H.264, constant 24 fps, document dimensions, the recipe exact', async () => {
  docMain = await seedSpanDocument('Main export')

  // The tween lane: land one step, contribute [2, 10) + a 6-frame hold.
  const tween = await submitTween(docMain.documentId, docMain.stepSlotId, 'main')
  assert.equal(tween.status, 200, `the tween submits (${tween.body.error ?? ''})`)
  await attemptReady(tween.body.attemptId)
  let revision = (await api.get(`/api/lan/animation/document?id=${docMain.documentId}`)).body.document.revision
  let contributed = await contribute(docMain.documentId, revision, { spanId: docMain.spanId, attemptId: tween.body.attemptId, inFrame: 2, outFrame: 10, holdDuration: 6 })
  assert.equal(contributed.status, 200, `the tween contribution lands (${contributed.body.error ?? ''})`)
  revision = contributed.body.document.revision

  // The spanless lane: land a sequence window over the same two keys,
  // contribute it whole (the picker's default).
  const sequence = await submitSequence(docMain.documentId, docMain.keyOne, docMain.keyTwo, 'main')
  assert.equal(sequence.status, 200, `the sequence submits (${sequence.body.error ?? ''})`)
  await attemptReady(sequence.body.attemptId)
  const sequenceFrames = (await attemptView(sequence.body.attemptId)).candidate.frameCount
  contributed = await contribute(docMain.documentId, revision, { spanId: null, attemptId: sequence.body.attemptId, inFrame: 0, outFrame: sequenceFrames, holdDuration: 0 })
  assert.equal(contributed.status, 200, `the sequence contribution lands (${contributed.body.error ?? ''})`)

  const exported = await api.export(docMain.documentId, false)
  assert.equal(exported.status, 200, `the export answers (${exported.body?.error ? JSON.stringify(exported.body.error) : 'zip bytes'})`)
  assert.match(exported.fileName, /^Main_export-rev\d+-\d+f\.zip$/, 'the download name carries the document, revision, and frame total')
  const { video, manifest } = unpackExport(exported.archive)

  // The recipe: ordered contributions, half-open ranges, output starts.
  const expectedTotal = (8 + 6) + sequenceFrames
  assert.equal(manifest.manifestVersion, ANIMATION_EXPORT_MANIFEST_VERSION)
  assert.equal(manifest.kind, 'minimax-animation-sequence')
  assert.equal(manifest.document.id, docMain.documentId)
  assert.equal(manifest.document.settings.fps, 24)
  assert.ok(manifest.document.bindingHistory.length >= 1, 'the binding history rides (§11.3)')
  assert.equal(manifest.staleAcknowledged, false)
  assert.equal(manifest.sequence.totalFrames, expectedTotal)
  assert.equal(manifest.contributions.length, 2)
  const [tweenRow, sequenceRow] = manifest.contributions
  assert.equal(tweenRow.attemptId, tween.body.attemptId)
  assert.deepEqual([tweenRow.inFrame, tweenRow.outFrame, tweenRow.holdDuration], [2, 10, 6])
  assert.equal(tweenRow.clipFrames, 8)
  assert.equal(tweenRow.outputStart, 0)
  assert.equal(tweenRow.attempt.lineage.stepSlotIndex, 0)
  assert.equal(sequenceRow.spanId, null, 'the sequence lane is spanless in the manifest too')
  assert.equal(sequenceRow.outputStart, 14)
  assert.equal(sequenceRow.attempt.lineage.windowStartKeyId, docMain.keyOne)
  assert.equal(sequenceRow.attempt.lineage.windowEndKeyId, docMain.keyTwo)
  assert.deepEqual(sequenceRow.attempt.snapshot.sequence.orderedActions, ['she rises from the bench', 'the coat swings as she turns'], 'the frozen attempt snapshot rides verbatim')

  // The source hashes: the sha256 of each REGISTERED clip blob.
  const tweenAbs = path.join(home, tweenRow.source.relPath)
  assert.equal(tweenRow.source.sha256, sha256(fs.readFileSync(tweenAbs)), 'the source hash is the registered media bytes')
  assert.equal(manifest.sequence.video.sha256, sha256(video), 'the video hash matches the shipped bytes')

  // The video truth (§11.3): silent H.264, constant 24 fps, the document's
  // output dimensions, EXACTLY the recipe's frame count.
  await withVideo(video, async (file) => {
    assert.equal(streamFacts(file), 'h264,1344,768,24/1', 'codec, the document dimensions, constant 24 fps')
    assert.equal(hasAudio(file), false, 'the sequence is silent')
    assert.equal(decodedFrames(file), expectedTotal, 'the decoded frame count is the recipe, exactly')
  })
  docMain.tweenAttemptId = tween.body.attemptId
  docMain.sequenceAttemptId = sequence.body.attemptId
  docMain.firstExport = { archive: exported.archive, manifest, video }
})

test('(c) a frozen export is immune to later edits — a re-export of an UNCHANGED document is byte-identical; edits after a freeze change only LATER exports', async () => {
  // Re-export with NOTHING changed: the video bytes reproduce exactly
  // (bitexact encode, pinned threads) — "re-export compares bytes".
  const again = await api.export(docMain.documentId, false)
  assert.equal(again.status, 200)
  const second = unpackExport(again.archive)
  assert.equal(sha256(second.video), sha256(docMain.firstExport.video), 'an unchanged document re-exports byte-identical video')
  assert.deepEqual(
    second.manifest.contributions.map((row) => [row.attemptId, row.inFrame, row.outFrame, row.holdDuration]),
    docMain.firstExport.manifest.contributions.map((row) => [row.attemptId, row.inFrame, row.outFrame, row.holdDuration]),
    'the recipe reproduces',
  )

  // Now EDIT the selection (the assembled order flips). The already-delivered
  // package cannot change; the NEXT export reflects the new truth — the
  // freeze happened at each request, never retroactively.
  const current = (await api.get(`/api/lan/animation/document?id=${docMain.documentId}`)).body.document
  const order = current.body.editorial.map((entry) => entry.id)
  const reordered = await api.post('/api/lan/animation/editorial', { documentId: docMain.documentId, op: 'reorder', orderedIds: [...order].reverse(), expectedRevision: current.revision })
  assert.equal(reordered.status, 200, `the reorder lands (${reordered.body.error ?? ''})`)

  const after = await api.export(docMain.documentId, false)
  assert.equal(after.status, 200)
  const third = unpackExport(after.archive)
  assert.deepEqual(
    third.manifest.contributions.map((row) => row.attemptId),
    [docMain.sequenceAttemptId, docMain.tweenAttemptId],
    'the post-edit export reflects the NEW assembly order',
  )
  assert.deepEqual(
    docMain.firstExport.manifest.contributions.map((row) => row.attemptId),
    [docMain.tweenAttemptId, docMain.sequenceAttemptId],
    'the already-delivered package still reflects the truth it froze',
  )
  assert.equal(third.manifest.sequence.totalFrames, docMain.firstExport.manifest.sequence.totalFrames, 'the frame total survives the reorder')

  // Restore the original order for the sections that follow.
  const now = (await api.get(`/api/lan/animation/document?id=${docMain.documentId}`)).body.document
  const restore = await api.post('/api/lan/animation/editorial', { documentId: docMain.documentId, op: 'reorder', orderedIds: order, expectedRevision: now.revision })
  assert.equal(restore.status, 200)
})

test('(c) missing or incompatible selected media fails LOUDLY, by name', async () => {
  const document = await seedSpanDocument('Refusals')
  const tween = await submitTween(document.documentId, document.stepSlotId, 'refuse')
  assert.equal(tween.status, 200)
  await attemptReady(tween.body.attemptId)
  let revision = (await api.get(`/api/lan/animation/document?id=${document.documentId}`)).body.document.revision

  // (1) an out-of-range selection — the store accepts it (length semantics
  // are the EXPORT's, task 13's narrowing), the gate refuses by name.
  const ranged = await contribute(document.documentId, revision, { spanId: document.spanId, attemptId: tween.body.attemptId, inFrame: 0, outFrame: 9999, holdDuration: 0 })
  assert.equal(ranged.status, 200, 'the store accepts the range — the gate owns length semantics')
  revision = ranged.body.document.revision
  let refused = await api.export(document.documentId, false)
  assert.equal(refused.status, 400)
  assert.match(refused.body.error, /\[0, 9999\) exceeds the clip's \d+ frames/)

  // (2) MISSING MEDIA — the registered blob file leaves the store; the
  // export names the media, never a silent drop.
  const narrowed = await contribute(document.documentId, revision, { spanId: document.spanId, attemptId: tween.body.attemptId, inFrame: 0, outFrame: 8, holdDuration: 0 })
  assert.equal(narrowed.status, 200)
  const attemptRow = await attemptView(tween.body.attemptId)
  const blobAbs = path.join(home, attemptRow.candidate.assetReference.relPath)
  assert.ok(fs.existsSync(blobAbs), 'the landed clip blob is on disk before the removal')
  fs.rmSync(blobAbs)
  refused = await api.export(document.documentId, false)
  assert.equal(refused.status, 400)
  assert.match(refused.body.error, /is missing from the store/, 'the missing media is named')
  assert.ok(refused.body.error.includes(attemptRow.candidate.assetReference.relPath), 'by its registered path')

  // (3) an UNLANDED take: point the server at a dead engine port, submit a
  // second tween (the attempt persists, its dispatch never resolves),
  // contribute it, restore the engine — the gate names the execution state.
  const original = (await api.get('/api/lan/settings')).body.settings
  const deadPort = await freePort()
  await api.post('/api/lan/settings', { settings: { ...original, comfyUrl: `http://127.0.0.1:${deadPort}` } })
  try {
    // The spanless lane owns the unlanded shape: a sequence attempt attaches
    // to nothing (§11.2), so the store accepts the contribution and the
    // EXPORT gate owns the refusal. (An unlanded tween is refused earlier —
    // by the store's span-attachment rule, a 404 — which is its own correct
    // layering.)
    const unlanded = await submitSequence(document.documentId, document.keyOne, document.keyTwo, 'unlanded')
    assert.equal(unlanded.status, 200, `the dead-engine sequence persists (${unlanded.body.error ?? ''})`)
    await waitUntil(async () => ['reconciling', 'queued'].includes((await attemptView(unlanded.body.attemptId)).execution), 10_000, 'the dead-engine attempt settling in flight')
    const current = (await api.get(`/api/lan/animation/document?id=${document.documentId}`)).body.document
    const contributed = await contribute(document.documentId, current.revision, { spanId: null, attemptId: unlanded.body.attemptId, inFrame: 0, outFrame: 4, holdDuration: 0 })
    assert.equal(contributed.status, 200, 'an unlanded take CAN be contributed — the gate owns the refusal')
  } finally {
    await api.post('/api/lan/settings', { settings: { ...original, comfyUrl: `http://127.0.0.1:${enginePort}` } })
  }
  refused = await api.export(document.documentId, false)
  assert.equal(refused.status, 400)
  assert.match(refused.body.error, /has not landed \(execution "(reconciling|queued)"\)/, 'the unlanded take is named with its execution state')

  // (4) the empty sequence refuses its own way.
  const emptyDoc = await api.post('/api/lan/animation/documents', { projectId: 'proj-animation-export', name: 'Empty', binding: makeBinding() })
  const emptyRefusal = await api.export(emptyDoc.body.document.id, false)
  assert.equal(emptyRefusal.status, 400)
  assert.match(emptyRefusal.body.error, /assembled sequence is empty/)
})

let docStale = null

test('(c) stale-but-usable selections export only past the explicit acknowledgment, and the manifest records them stale', async () => {
  const document = await seedSpanDocument('Stale')
  docStale = document
  const tween = await submitTween(document.documentId, document.stepSlotId, 'stale')
  assert.equal(tween.status, 200, `the tween submits (${tween.body.error ?? ''})`)

  // While the render is in flight, the span's intent changes: the span is
  // marked stale ('intent') AND the landing freezes against an older
  // revision (earlierRevision) — both §11.3 stale marks on one lane,
  // deterministic (the intent write lands well inside the render window).
  const intent = await api.post('/api/lan/animation/spans', {
    op: 'update-intent', documentId: document.documentId, expectedRevision: (await api.get(`/api/lan/animation/document?id=${document.documentId}`)).body.document.revision,
    spanId: document.spanId, intent: { movement: 'she turns to leave', preservation: 'silhouette intact' },
  })
  assert.equal(intent.status, 200, 'the intent change lands while the tween renders')
  await attemptReady(tween.body.attemptId)
  const revision = intent.body.document.revision
  const contributed = await contribute(document.documentId, revision, { spanId: document.spanId, attemptId: tween.body.attemptId, inFrame: 0, outFrame: 8, holdDuration: 2 })
  assert.equal(contributed.status, 200)

  // WITHOUT the acknowledgment: 428 Precondition Required, the stale list by
  // name — never a partial export, never a silent one.
  const refused = await api.export(document.documentId, false)
  assert.equal(refused.status, 428, 'the acknowledgment prompt is 428 — never confused with the 409 rebase surface')
  assert.equal(refused.body.staleSelections.length, 1)
  assert.equal(refused.body.staleSelections[0].contributionId, contributed.body.document.body.editorial[0].id)
  assert.ok(refused.body.staleSelections[0].reasons.includes('intent'), 'the span staleness reason rides')
  assert.ok(refused.body.staleSelections[0].reasons.includes('earlier-revision'), 'the earlier-revision reason rides')

  // WITH the acknowledgment: the package ships and the manifest records the
  // staleness (§11.3's "recorded as stale in the manifest").
  const acknowledged = await api.export(document.documentId, true)
  assert.equal(acknowledged.status, 200, `the acknowledged export ships (${acknowledged.body?.error ? JSON.stringify(acknowledged.body.error) : 'zip bytes'})`)
  const { video, manifest } = unpackExport(acknowledged.archive)
  assert.equal(manifest.staleAcknowledged, true)
  assert.equal(manifest.contributions[0].stale.stale, true)
  assert.deepEqual(manifest.contributions[0].stale.reasons.sort(), ['earlier-revision', 'intent'])
  await withVideo(video, async (file) => {
    assert.equal(decodedFrames(file), 10, 'the stale take still assembles exactly (8 clip + 2 hold)')
  })
})

test("(d) task 13's M2 — reorder and remove are assembly decisions: staleness stays byte-identical in BOTH directions", async () => {
  // docMain's span is fresh (pin: no NEW marks appear); docStale's span is
  // marked stale with reasons (pin: nothing RESETS). Task 13's review asked
  // for the construction to be pinned, not assumed.
  for (const document of [docMain, docStale]) {
    const before = (await api.get(`/api/lan/animation/document?id=${document.documentId}`)).body.document
    const staleBefore = JSON.stringify(before.body.spans.map((span) => [span.stale, span.staleReasons]))
    const order = before.body.editorial.map((entry) => entry.id)
    const reordered = await api.post('/api/lan/animation/editorial', { documentId: document.documentId, op: 'reorder', orderedIds: [...order].reverse(), expectedRevision: before.revision })
    assert.equal(reordered.status, 200)
    const removed = await api.post('/api/lan/animation/editorial', { documentId: document.documentId, op: 'remove', contributionId: reordered.body.document.body.editorial[0].id, expectedRevision: reordered.body.document.revision })
    assert.equal(removed.status, 200)
    const after = removed.body.document
    assert.equal(
      JSON.stringify(after.body.spans.map((span) => [span.stale, span.staleReasons])),
      staleBefore,
      'reorder/remove neither introduce nor reset staleness (§9: assembly decisions, no generation-time promises)',
    )
    if (document === docMain) {
      // Put the removed contribution back — docMain is the earlier sections'
      // shared state and stays whole for any future section.
      const view = after.body.editorial[0]
      const putBack = await contribute(document.documentId, after.revision, {
        spanId: view.spanId, attemptId: view.attemptId, inFrame: view.inFrame, outFrame: view.outFrame, holdDuration: view.holdDuration,
      })
      assert.equal(putBack.status, 200, 'the removed contribution returns')
    }
  }
})

// ---------------------------------------------------------------------------
// (a—i8) Codex batch B: I8 — the SPANLESS (sequence) lane derives staleness
//        from freeze-time drift (binding / settings / endpoint drawings);
//        the clean case and pre-wave-1 rows stay clean
// ---------------------------------------------------------------------------

/** A sequence attempt whose frozen snapshot carries the wave-1 execution
 *  stamps and RESOLVED window-endpoint references — the drift comparison's
 *  inputs. The synthetic document's key-a selects asset 'a' and key-b
 *  selects asset 'b', so the defaults describe the clean case. */
function frozenSequenceAttempt({ settings = {}, startAsset = 'a', endAsset = 'b', earlierRevision = false } = {}) {
  return {
    id: 'att-seq',
    tool: 'sequence',
    idempotencyKey: 'idem-att-seq',
    inputHash: 'i'.repeat(64),
    targetId: 'key-a',
    snapshot: {
      tool: 'sequence',
      targetId: 'key-a',
      references: [
        { role: 'window-start', assetReference: { assetId: startAsset, relPath: `canvas-blobs/aa/${startAsset}`, kind: 'image' }, poseDescription: null, facing: null },
        { role: 'window-end', assetReference: { assetId: endAsset, relPath: `canvas-blobs/bb/${endAsset}`, kind: 'image' }, poseDescription: null, facing: null },
      ],
      caption: 'c',
      compilerVersion: '2',
      settings,
      documentRevision: 1,
      sequence: { windowStartKeyId: 'key-a', windowEndKeyId: 'key-b', orderedActions: ['rises'], preservation: 'coat', overrides: { medium: 'clean line on white' } },
    },
    execution: { state: 'ready' },
    result: { candidate: { id: null, assetReference: videoRef(), frameCount: 22, earlierRevision } },
  }
}

const i8Editorial = [{ id: 'contrib-i8', spanId: null, attemptId: 'att-seq', inFrame: 0, outFrame: 8, holdDuration: 0 }]
const i8FrozenStamps = { bindingVersion: 1, width: 1344, height: 768, steps: 30, fps: 24 }
const bindingV2 = (body) => syntheticDocument({ body: {
  ...body,
  bindingHistory: [
    { version: 1, characterDescription: 'a courier', referenceAssetIds: ['r1'], medium: 'clean line on white', initialKeyAssetId: 'r0', boundAt: 1 },
    { version: 2, characterDescription: 'the same courier, older', referenceAssetIds: ['r1'], medium: 'clean line on white', initialKeyAssetId: 'r0', boundAt: 2 },
  ],
  activeBindingVersion: 2,
} })

test('(a) Codex I8 — spanless staleness derives from binding, settings, and endpoint drift at freeze time; clean stays clean', () => {
  // CLEAN: the frozen stamps describe the document as it stands.
  const clean = deriveExportPlan(syntheticDocument({ body: { editorial: i8Editorial } }), [frozenSequenceAttempt({ settings: i8FrozenStamps })], resolveEverything)
  assert.deepEqual(clean.refusals, [])
  assert.deepEqual(clean.stale, [], 'a spanless take whose inputs still stand marks nothing stale')
  assert.equal(clean.segments[0].stale, false)

  // BINDING drift: the take froze binding v1; the document re-bound to v2.
  const binding = deriveExportPlan(bindingV2({ editorial: i8Editorial }), [frozenSequenceAttempt({ settings: i8FrozenStamps })], resolveEverything)
  assert.equal(binding.refusals.length, 0, 'drift is stale-but-usable — the 428 gate owns it, not a refusal')
  assert.deepEqual(binding.stale[0].reasons, ['binding'], 'the binding drift names the store\'s own vocabulary')
  assert.deepEqual(binding.segments[0].staleReasons, ['binding'], 'the segment carries the reason for the manifest')

  // SETTINGS drift: the document's output settings moved off the frozen ones.
  const settings = deriveExportPlan(
    syntheticDocument({ body: { editorial: i8Editorial, settings: { outputWidth: 640, outputHeight: 360, fps: 24, steps: 12 } } }),
    [frozenSequenceAttempt({ settings: i8FrozenStamps })],
    resolveEverything,
  )
  assert.deepEqual(settings.stale[0].reasons, ['settings'])

  // ENDPOINT drift: key-b now selects a DIFFERENT drawing than the one the
  // window froze as its end — the 'pose' vocabulary a key-selection change
  // marks a span with.
  const endpoint = deriveExportPlan(
    syntheticDocument({ body: {
      editorial: i8Editorial,
      keys: [
        { id: 'key-a', order: 0, selectedCandidateId: 'cand-a', candidates: [{ id: 'cand-a', assetReference: { assetId: 'a', relPath: 'canvas-blobs/aa/a', kind: 'image' }, origin: 'import', provenance: { assetId: 'a' }, poseDescription: null, facing: null }], lock: false },
        { id: 'key-b', order: 1, selectedCandidateId: 'cand-b2', candidates: [
          { id: 'cand-b', assetReference: { assetId: 'b', relPath: 'canvas-blobs/bb/b', kind: 'image' }, origin: 'import', provenance: { assetId: 'b' }, poseDescription: null, facing: null },
          { id: 'cand-b2', assetReference: { assetId: 'b2', relPath: 'canvas-blobs/b2/b2', kind: 'image' }, origin: 'import', provenance: { assetId: 'b2' }, poseDescription: null, facing: null },
        ], lock: false },
      ],
    } }),
    [frozenSequenceAttempt({ settings: i8FrozenStamps })],
    resolveEverything,
  )
  assert.deepEqual(endpoint.stale[0].reasons, ['pose'])

  // PRE-WAVE-1 rows froze none of the stamps — a missing stamp compares
  // nothing (the landing's earlierRevision flag still speaks for its race).
  const legacy = deriveExportPlan(bindingV2({ editorial: i8Editorial }), [frozenSequenceAttempt({ settings: {} })], resolveEverything)
  assert.deepEqual(legacy.stale, [], 'a row without the frozen stamps drift-compares nothing')

  // The manifest records the drift reasons verbatim (§11.3 "recorded as
  // stale in the manifest").
  const manifest = buildManifest({
    document: bindingV2({ editorial: i8Editorial }),
    attempts: [frozenSequenceAttempt({ settings: i8FrozenStamps })],
    plan: binding,
    videoSha256: 'v'.repeat(64),
    videoFrameCount: binding.totalFrames,
    sourceHashes: new Map([['att-seq', 's'.repeat(64)]]),
    frozenAt: 1,
    staleAcknowledged: true,
  })
  assert.deepEqual(manifest.contributions[0].stale, { stale: true, reasons: ['binding'] })
})

// ---------------------------------------------------------------------------
// (e) Codex I8 end to end — a spanless contribution whose binding moved
//     refuses 428 until acknowledged; the acknowledged manifest records it
// ---------------------------------------------------------------------------

test('(e) a spanless contribution drifts stale through a binding update — 428, then the acknowledged export records the reason', async () => {
  const document = await seedSpanDocument('I8 spanless')
  const sequence = await submitSequence(document.documentId, document.keyOne, document.keyTwo, 'i8')
  assert.equal(sequence.status, 200, `the sequence submits (${sequence.body.error ?? ''})`)
  await attemptReady(sequence.body.attemptId)
  let revision = (await api.get(`/api/lan/animation/document?id=${document.documentId}`)).body.document.revision

  const contributed = await contribute(document.documentId, revision, { spanId: null, attemptId: sequence.body.attemptId, inFrame: 0, outFrame: 4, holdDuration: 0 })
  assert.equal(contributed.status, 200, `the spanless contribution lands (${contributed.body.error ?? ''})`)
  revision = contributed.body.document.revision

  // CLEAN first: the take's frozen inputs still stand — no acknowledgment
  // is asked for (Codex's repro shape: this is where the pre-fix build said
  // stale:[] for everything, drift included).
  const clean = await api.export(document.documentId, false)
  assert.equal(clean.status, 200, `the clean spanless export sails without acknowledgment (${clean.body?.error ?? 'zip bytes'})`)

  // The binding moves (v2) — the spanless lane has no span to mark, so the
  // drift is derived at the export gate.
  const moved = await api.post('/api/lan/animation/binding', { documentId: document.documentId, binding: makeBinding(), expectedRevision: revision })
  assert.equal(moved.status, 200, `the binding update lands (${moved.body.error ?? ''})`)
  assert.equal(moved.body.document.body.activeBindingVersion, 2)

  const refused = await api.export(document.documentId, false)
  assert.equal(refused.status, 428, 'the drifted spanless contribution gates on the acknowledgment')
  assert.equal(refused.body.staleSelections.length, 1)
  assert.ok(refused.body.staleSelections[0].reasons.includes('binding'), `the binding drift is named (${JSON.stringify(refused.body.staleSelections[0].reasons)})`)

  const acknowledged = await api.export(document.documentId, true)
  assert.equal(acknowledged.status, 200, `the acknowledged export ships (${acknowledged.body?.error ? JSON.stringify(acknowledged.body.error) : 'zip bytes'})`)
  const { manifest } = unpackExport(acknowledged.archive)
  assert.equal(manifest.staleAcknowledged, true)
  assert.equal(manifest.contributions[0].stale.stale, true, 'the manifest records the drift (§11.3)')
  assert.deepEqual(manifest.contributions[0].stale.reasons, ['binding'])
})
