// SERVER-OWNED JOBS (Flux gfv5h0g — the R2 fix of the 2026-10-15 blind UX
// review): the server observes engine completion and lands takes/gallery
// rows itself, through the SAME document-store paths the client landing
// used; surfaces become readers. This suite reproduces the review's defect
// at the server boundary — a render that completes with NO surface open
// (the originator tab closed) still lands its take, its job row reaches
// the terminal truth, and the fabric tells any listener.
//
//   (a) THE R2 REPRO: a running job (promptId + manifest.canvas link,
//       persisted the way the client persists it) completes on the fake
//       engine with NO client attached — the take lands on its chain
//       (canvas_take row, blob-registered artifact), the job row reads
//       completed, and re-observation never duplicates the take.
//   (b) THE FABRIC EVENT: a job-channel `landing` envelope announces the
//       settled job (outcome + ids) so live surfaces can refresh without
//       their own polls.
//   (c) THE ERROR PATH: an engine-side execution error fails the job row
//       with the sanitized reason and lands NO take; the envelope carries
//       outcome 'failed'.
//   (d) THE TERMINAL GUARD: a stale client POST (status 'running' after
//       the server settled 'completed') cannot resurrect the row.
//   (e) THE PACKET BACKSTOP: a workbench-packet job (manifest.h3img) whose
//       surface never lands it gets its ONE take server-side after the
//       live-session grace window — N frame artifacts, honest scorer:null.
//
// CARD-FREE: the engine is e2e/mirror/fakeEngineServer.mjs (profile
// stock-h3) — never a GPU, never 8188/8189. Runs after `pnpm build`
// (dist-server boot, the documents-suite pattern).
import { test, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const REPO = require('node:path').resolve(__dirname, '..')

const { spawn } = require('node:child_process')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const WebSocket = require('ws')
const { makePortAllocator } = require('./lib/ports.cjs')
const { makeScratchDir, removeAllScratchDirs } = require('./lib/scratch.cjs')

const freePort = makePortAllocator('jobwatcher')

/** A settle-or-poll wait for a named condition (the e2e determinism
 *  convention, lifted into the unit suites for this watcher's async
 *  truth): polls `read()` until it returns non-null or the bound expires. */
async function waitFor(read, label, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = await read()
    if (found !== null && found !== undefined) return found
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

const booted = []
process.on('exit', () => { for (const child of booted) { try { child.kill() } catch { /* gone */ } } })

/** Boots the BUILT server on a scratch home (the documents-suite pattern).
 *  The packet grace is shortened so section (e) settles inside seconds. */
async function bootServer(home) {
  const port = await freePort()
  const child = spawn(process.execPath, [path.join(REPO, 'dist-server', 'server', 'index.js')], {
    env: { ...process.env, MONOKA_HOME: home, MONOKA_LAN_PORT: String(port), MONOKA_NO_HTTPS: '1', MONOKA_JOBWATCH_PACKET_GRACE_MS: '2500' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  booted.push(child)
  let output = ''
  child.stdout.on('data', (chunk) => { output += String(chunk) })
  child.stderr.on('data', (chunk) => { output += String(chunk) })
  await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/lan/settings`)
      return response.ok ? true : null
    } catch { return null }
  }, 'the studio server to boot', 20_000)
  return { child, port, output: () => output }
}

/** Boots the standing FAKE ENGINE (the card-free contract) on a probe-verified port. */
async function bootFakeEngine() {
  const port = await freePort()
  const child = spawn(process.execPath, [path.join(REPO, 'e2e/mirror/fakeEngineServer.mjs'), '--port', String(port), '--profile', 'e2e/mirror/profiles/stock-h3.json'], { stdio: ['ignore', 'pipe', 'pipe'] })
  booted.push(child)
  let output = ''
  child.stdout.on('data', (chunk) => { output += String(chunk) })
  child.stderr.on('data', (chunk) => { output += String(chunk) })
  await waitFor(async () => {
    try { return (await fetch(`http://127.0.0.1:${port}/system_stats`)).ok ? true : null } catch { return null }
  }, 'the fake engine to boot', 20_000)
  return { child, port, output: () => output }
}

// ---- shared fixtures (sequential tests share the one boot) ----------------
let server = null
let engine = null
let home = ''
let client = null
let fabric = null
let chainA = null // (a)+(d): the video chain
let chainB = null // (b)
let chainC = null // (c)
let chainE = null // (e)
let chainF = null // (f): the recovered chain
let chainG = null // (f): the tombstoned chain (must STAY unlanded)
const landedJobIds = new Set()

function apiBase() { return `http://127.0.0.1:${server.port}` }

async function post(pathname, payload) {
  const response = await fetch(apiBase() + pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${pathname} -> ${response.status}: ${JSON.stringify(body).slice(0, 300)}`)
  return body
}

async function get(pathname) {
  const response = await fetch(apiBase() + pathname)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${pathname} -> ${response.status}`)
  return body
}

/** Submits a graph to the fake engine directly (what the studio's submit
 *  core does over the proxy) and returns the engine's prompt id. */
async function enginePrompt(graph) {
  const response = await fetch(`http://127.0.0.1:${engine.port}/prompt`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: graph, extra_data: {}, client_id: 'jobwatcher-suite' }),
  })
  const body = await response.json()
  assert.equal(response.status, 200, `the fake engine accepted the prompt: ${JSON.stringify(body).slice(0, 200)}`)
  return body.prompt_id
}

/** The persisted job record exactly the way the client's debounced save
 *  POSTs it: the full client shape incl. promptId + manifest (the canvas
 *  link is the ONLY chain association that survives a closed tab). */
function jobRecord(id, promptId, manifest, extra = {}) {
  return {
    id,
    promptId,
    mode: 'text',
    status: 'running',
    progress: 40,
    prompt: 'a lighthouse over a black sea',
    createdAt: Date.now() - 5000,
    width: 1344,
    height: 768,
    duration: 6,
    manifest,
    ...extra,
  }
}

async function createChain(projectId, prompt) {
  const body = await post('/api/lan/documents/chains', { projectId, kind: 'generation', settings: { prompt, mediaType: 'video' } })
  return body.chain
}

async function documentFor(projectId) {
  return (await get(`/api/lan/documents/project?id=${encodeURIComponent(projectId)}`))
}

beforeAll(async () => {
  home = makeScratchDir(path.join(os.tmpdir(), 'monoka-jobwatcher-'))
  server = await bootServer(home)
  engine = await bootFakeEngine()
  // Point the studio at the fake engine BEFORE anything observes it.
  const settingsBody = await get('/api/lan/settings')
  await post('/api/lan/settings', { settings: { ...settingsBody.settings, comfyUrl: `http://127.0.0.1:${engine.port}` } })
  const project = (await post('/api/lan/documents/projects', { name: 'jobwatcher' })).project
  client = { projectId: project.id }
  chainA = await createChain(project.id, 'a lighthouse over a black sea, server-owned')
  chainB = await createChain(project.id, 'a second lighthouse, envelope leg')
  chainC = await createChain(project.id, 'a third lighthouse, error leg')
  chainE = await createChain(project.id, 'a workbench packet, backstop leg')
  chainF = await createChain(project.id, 'a recovered lighthouse, restart leg')
  chainG = await createChain(project.id, 'a tombstoned lighthouse, restart leg')
  // A fabric listener subscribed to the job channel (a live surface's
  // transport — passive here; section (a) asserts landing WITHOUT it by
  // construction, since nothing about the landing depends on it).
  fabric = await new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`)
    const state = { envelopes: [] }
    socket.on('error', reject)
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'sub', ch: 'job' }))
      socket.on('message', (data) => {
        try { state.envelopes.push(JSON.parse(data.toString('utf8'))) } catch { /* binary */ }
      })
      resolve(state)
    })
  })
}, 120_000)

afterAll(async () => {
  for (const child of booted) {
    child.kill('SIGINT')
    await new Promise((resolve) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 3000)
      child.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
  void removeAllScratchDirs()
}, 30_000)

test('(a) THE R2 REPRO — a render that completes with no surface open still lands its take on its chain', async () => {
  // The originator "tab": submits, persists the job (promptId + manifest
  // canvas link), then is GONE — nothing client-side exists from here on.
  const promptId = await enginePrompt({ save: { class_type: 'SaveVideo', inputs: {} } })
  const jobId = 'jobwatcher-a'
  await post('/api/lan/jobs', { jobs: [jobRecord(jobId, promptId, { canvas: { chainId: chainA.id, projectId: client.projectId } })] })

  // Named condition: the take lands on the chain (server-owned landing).
  const take = await waitFor(async () => {
    const document = await documentFor(client.projectId)
    const chain = document.chains.find((entry) => entry.id === chainA.id)
    const takeRow = chain?.outputs?.[0]?.takes?.find((row) => row.jobId === jobId) ?? null
    return takeRow ?? null
  }, `the take for ${jobId} to land on its chain`, 30_000)
  // The durable form: the artifact is a content-addressed blob reference.
  assert.ok(/^canvas-blobs\//.test(take.artifacts[0] ?? ''), `the landed artifact is blob-registered (got: ${JSON.stringify(take.artifacts)})`)
  assert.equal(take.metrics?.kind, 'video', 'the take metrics carry the media kind')
  assert.equal(take.metrics?.sourcePath?.includes(path.join('canvas-media')), true, 'the remote output was fetched into the studio output tree')

  // The job row itself reached the terminal truth the surfaces read.
  const jobs = await waitFor(async () => {
    const listed = (await get('/api/lan/jobs')).jobs ?? []
    return listed.find((job) => job.id === jobId && job.status === 'completed') ?? null
  }, `the job row ${jobId} to read completed`, 10_000)
  assert.ok(jobs.outputUrl, 'the completed job row names its output URL')
  landedJobIds.add(jobId)

  // No duplication: the watcher keeps observing nothing (the job is
  // terminal); an extra settle window must not append a second take.
  await new Promise((resolve) => setTimeout(resolve, 4000))
  const document = await documentFor(client.projectId)
  const chain = document.chains.find((entry) => entry.id === chainA.id)
  const rows = chain?.outputs?.[0]?.takes ?? []
  assert.equal(rows.filter((row) => row.jobId === jobId).length, 1, `exactly one take for the job (got ${rows.length})`)
}, 60_000)

test('(b) the fabric announces the settled job on the job channel', async () => {
  const promptId = await enginePrompt({ save: { class_type: 'SaveVideo', inputs: {} } })
  const jobId = 'jobwatcher-b'
  await post('/api/lan/jobs', { jobs: [jobRecord(jobId, promptId, { canvas: { chainId: chainB.id, projectId: client.projectId } })] })
  const envelope = await waitFor(() => {
    const hit = fabric.envelopes.find((entry) => entry.ch === 'job' && entry.type === 'landing' && entry.payload?.jobId === jobId) ?? null
    return hit ?? null
  }, `the landing envelope for ${jobId}`, 30_000)
  assert.equal(envelope.payload.outcome, 'completed')
  assert.equal(envelope.payload.chainId, chainB.id)
  assert.ok(envelope.payload.takeId, 'the envelope names the landed take')
  assert.equal(envelope.payload.job?.status, 'completed', 'the envelope carries the settled job record for surfaces to apply')
  landedJobIds.add(jobId)
}, 60_000)

test('(c) an engine-side execution error fails the job honestly and lands no take', async () => {
  await fetch(`http://127.0.0.1:${engine.port}/__control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ failMode: 'error' }) })
  // The disarm rides `finally` — a failing assertion here must never leave
  // the failMode armed to poison the sections after this one.
  try {
    const promptId = await enginePrompt({ save: { class_type: 'SaveVideo', inputs: {} } })
    const jobId = 'jobwatcher-c'
    await post('/api/lan/jobs', { jobs: [jobRecord(jobId, promptId, { canvas: { chainId: chainC.id, projectId: client.projectId } })] })
    const failed = await waitFor(async () => {
      const listed = (await get('/api/lan/jobs')).jobs ?? []
      return listed.find((job) => job.id === jobId && job.status === 'failed') ?? null
    }, `the job row ${jobId} to read failed`, 30_000)
    assert.ok(failed.error && failed.error.length > 0, 'the failure carries its sanitized reason')
    // (ewtobuh, R1 P1-7 / vfhcu5r) The settled record carries the STRUCTURED
    // classification — the taxonomy bucket + the failing node's class/id — so
    // Diagnostics counts causes from fields, never by re-parsing prose.
    assert.equal(failed.failureKind, 'out-of-memory', `the record classifies the OOM cause (got: ${failed.failureKind})`)
    assert.equal(failed.failureNodeType, 'MiniMaxH3ImageToVideo', 'the record names the failing node class')
    assert.equal(failed.failureNodeId, 'sampler', 'the record names the failing node id')
    const envelope = await waitFor(() => fabric.envelopes.find((entry) => entry.ch === 'job' && entry.type === 'landing' && entry.payload?.jobId === jobId) ?? null, 'the failed landing envelope', 5000)
    assert.equal(envelope.payload.outcome, 'failed')
    // The envelope's failureKind stays the OBSERVATION kind — the r3q1o49
    // retry gate reads it ('executionError' = the crash class the one retry
    // absorbs); the record's failureKind is the taxonomy bucket.
    assert.equal(envelope.payload.failureKind, 'executionError', 'the envelope keeps the observation kind for the retry gate')
    assert.equal(envelope.payload.job?.failureKind, 'out-of-memory', 'the settled record on the envelope carries the taxonomy bucket')
    const document = await documentFor(client.projectId)
    const chain = document.chains.find((entry) => entry.id === chainC.id)
    assert.equal((chain?.outputs ?? []).length, 0, 'a failed render lands no output row')
  } finally {
    await fetch(`http://127.0.0.1:${engine.port}/__control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ failMode: null }) })
  }
}, 60_000)

test('(d) a stale client POST cannot resurrect a settled job (the terminal guard, server-side)', async () => {
  const stale = jobRecord('jobwatcher-a', 'whatever', { canvas: { chainId: chainA.id, projectId: client.projectId } })
  stale.status = 'running'
  await post('/api/lan/jobs', { jobs: [stale] })
  const listed = (await get('/api/lan/jobs')).jobs ?? []
  const row = listed.find((job) => job.id === 'jobwatcher-a')
  assert.equal(row.status, 'completed', `the settled row stays completed (got ${row.status})`)
  // …and the guard did not manufacture a second take either.
  const document = await documentFor(client.projectId)
  const chain = document.chains.find((entry) => entry.id === chainA.id)
  assert.equal((chain?.outputs?.[0]?.takes ?? []).length, 1)
}, 30_000)

test('(e) a workbench packet whose surface never lands it is backstopped server-side after the grace window', async () => {
  // Three SaveImage tails → three frame outputs (the packet shape).
  const graph = {
    f1: { class_type: 'SaveImage', inputs: {} },
    f2: { class_type: 'SaveImage', inputs: {} },
    f3: { class_type: 'SaveImage', inputs: {} },
  }
  const promptId = await enginePrompt(graph)
  const jobId = 'jobwatcher-e'
  await post('/api/lan/jobs', { jobs: [jobRecord(jobId, promptId, {
    canvas: { chainId: chainE.id, projectId: client.projectId },
    h3img: { family: 'h3img.generate.packet', profile: 'packet', tier: 5, frames: 3, prompt: 'a packet', refs: [], loras: [], seed: 1, resolution: '1344x768', hybrid: false },
  }, { mediaType: 'image' })] })
  // The grace window (2.5 s here) hands a live surface the first chance;
  // after it, the SERVER lands the packet — ONE take, all three frames,
  // the honest scorer:null (no scoring server-side).
  const take = await waitFor(async () => {
    const document = await documentFor(client.projectId)
    const chain = document.chains.find((entry) => entry.id === chainE.id)
    return chain?.outputs?.[0]?.takes?.find((row) => row.jobId === jobId) ?? null
  }, `the packet take for ${jobId} to land`, 30_000)
  assert.equal(take.artifacts.length, 3, `every frame artifact lands in ONE take (got ${take.artifacts.length})`)
  assert.equal(take.metrics?.h3img?.frames, 3)
  assert.equal(take.metrics?.h3img?.scorer, null, 'the backstop lands unscored — pick-by-eye, never a fabricated verdict')
  landedJobIds.add(jobId)
}, 60_000)

test('(f) THE BOOT RECOVERY PASS — a settled-but-unlanded job lands after a restart (fix round 1, finding 2)', async () => {
  // The narrow cousin of the R2 repro: a job the watcher SETTLED (status
  // completed, persisted) whose landing never completed before the process
  // died. The observation loop ignores terminal rows and the retry maps are
  // in-memory — without a boot pass this job lands no take, ever.
  const promptIdF = await enginePrompt({ save: { class_type: 'SaveVideo', inputs: {} } })
  const promptIdG = await enginePrompt({ save: { class_type: 'SaveVideo', inputs: {} } })
  await waitFor(async () => {
    const history = await (await fetch(`http://127.0.0.1:${engine.port}/history/${promptIdF}`)).json()
    return history[promptIdF]?.status?.completed ? true : null
  }, 'the engine to complete both renders', 30_000)
  // The tombstoned chain: completed job against a chain the user deleted.
  await post('/api/lan/documents/chains/delete', { id: chainG.id })

  // SETTLED rows, persisted exactly as a mid-retry crash would leave them.
  const jobF = jobRecord('jobwatcher-f', promptIdF, { canvas: { chainId: chainF.id, projectId: client.projectId } })
  jobF.status = 'completed'
  jobF.progress = 100
  const jobG = jobRecord('jobwatcher-g', promptIdG, { canvas: { chainId: chainG.id, projectId: client.projectId } })
  jobG.status = 'completed'
  jobG.progress = 100
  await post('/api/lan/jobs', { jobs: [jobF, jobG] })

  // The live sweep does NOT touch terminal rows: a settle window proves
  // nothing lands while the process that settled them keeps running.
  await new Promise((resolve) => setTimeout(resolve, 4000))
  let document = await documentFor(client.projectId)
  assert.equal((document.chains.find((entry) => entry.id === chainF.id)?.outputs ?? []).length, 0, 'no output row lands without a driver')

  // THE CRASH + REBOOT: same home (settings + the settled rows persist),
  // same engine. The FIRST sweep's recovery pass finds both completed rows.
  server.child.kill('SIGINT')
  await new Promise((resolve) => { const timer = setTimeout(() => { server.child.kill('SIGKILL'); resolve() }, 5000); server.child.once('exit', () => { clearTimeout(timer); resolve() }) })
  server = await bootServer(home)

  // The live chain's job lands; the TOMBSTONED chain's job stays unlanded.
  const take = await waitFor(async () => {
    const refreshed = await documentFor(client.projectId)
    return refreshed.chains.find((entry) => entry.id === chainF.id)?.outputs?.[0]?.takes?.find((row) => row.jobId === 'jobwatcher-f') ?? null
  }, 'the recovered take to land after the restart', 30_000)
  assert.ok(/^canvas-blobs\//.test(take.artifacts[0] ?? ''), `the recovered artifact is blob-registered (got: ${JSON.stringify(take.artifacts)})`)
  await new Promise((resolve) => setTimeout(resolve, 4000))
  document = await documentFor(client.projectId)
  const tombstoned = document.chains.find((entry) => entry.id === chainG.id)
  assert.equal((tombstoned?.outputs ?? []).length, 0, 'a job against a tombstoned chain stays unlanded — the user deleted it')
  const listed = (await get('/api/lan/jobs')).jobs ?? []
  assert.equal(listed.find((job) => job.id === 'jobwatcher-f')?.status, 'completed', 'the recovered row stays settled')
}, 120_000)

test('(g) the ingest fetch is bounded — a stalled engine /view aborts at the deadline, never hanging the sweep (fix round 1, finding 1)', async () => {
  const { ingestEngineOutputFile, ENGINE_INGEST_TIMEOUT_MS } = require(path.join(REPO, 'dist-server', 'server', 'engineOutputs.js'))
  // The default matches the history fetch's bound (comfyFetch's 60 s): every
  // await inside the serialized sweep is bounded the same way.
  assert.equal(ENGINE_INGEST_TIMEOUT_MS, 60_000)
  // A half-open server: accepts the connection, never answers — the engine
  // dying mid-response, the exact class that must not stall the sweep.
  const sockets = new Set()
  const stall = net.createServer((socket) => { sockets.add(socket) })
  const stallPort = await new Promise((resolve) => stall.listen(0, '127.0.0.1', () => resolve(stall.address().port)))
  try {
    const started = Date.now()
    await assert.rejects(
      ingestEngineOutputFile({
        viewBase: `http://127.0.0.1:${stallPort}`,
        outputDirectory: home,
        registerBlobFile: () => ({ relPath: '', hash: null, size: null, present: false }),
        file: { filename: 'stalled.mp4' },
        kind: 'video',
        timeoutMs: 400,
      }),
      (error) => /timed out/.test(error instanceof Error ? error.message : String(error)),
      'the stalled /view aborts at its deadline with the named reason',
    )
    const elapsed = Date.now() - started
    assert.ok(elapsed < 5000, `the fetch aborts at the bound, not the socket's mercy (took ${elapsed} ms)`)
    assert.ok(elapsed >= 350, `the bound is honored (waited ${elapsed} ms)`)
  } finally {
    // The aborted fetch leaves its half-open socket in the pool — destroy
    // the accepted connections before closing (close() alone waits on them).
    for (const socket of sockets) socket.destroy()
    await new Promise((resolve) => stall.close(() => resolve()))
  }
}, 30_000)

test('(h) QUEUE TRUTH — a prompt the engine still holds as pending stays queued in the record (ewtobuh)', async () => {
  // One render hangs (occupies the engine's single execution slot); the
  // second prompt queues behind it — the real engine's queue_pending, the
  // fake models it (POST /prompt while another renders → pending).
  await fetch(`http://127.0.0.1:${engine.port}/__control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ failMode: 'hang' }) })
  const hungId = await enginePrompt({ save: { class_type: 'SaveVideo', inputs: {} } })
  const pendingId = await enginePrompt({ save: { class_type: 'SaveVideo', inputs: {} } })
  const hungJob = 'jobwatcher-h1'
  const queuedJob = 'jobwatcher-h2'
  await post('/api/lan/jobs', { jobs: [
    jobRecord(hungJob, hungId, {}, { status: 'running' }),
    jobRecord(queuedJob, pendingId, {}, { status: 'queued', progress: 0 }),
  ] })
  try {
    // /queue is the engine's own per-prompt truth (the watcher reads it in
    // the sweep when a queued row exists). Give the sweep several ticks —
    // the defect under test is a row that flips to "running" purely because
    // history has no entry yet.
    await new Promise((resolve) => setTimeout(resolve, 4000))
    const listed = (await get('/api/lan/jobs')).jobs ?? []
    const queuedRow = listed.find((job) => job.id === queuedJob)
    assert.ok(queuedRow, 'the queued row exists')
    assert.equal(queuedRow.status, 'queued', `a merely-queued job stays queued across sweeps (got: ${queuedRow.status})`)
    // The hung one keeps its running row — no false terminal, no lie.
    const hungRow = listed.find((job) => job.id === hungJob)
    assert.equal(hungRow?.status, 'running', 'the actually-executing job still reads running')
  } finally {
    // Tear the leg down honestly: stop the hang, drain the engine queue,
    // and settle both rows terminal so no later section (or the sweep after
    // teardown) observes them.
    await fetch(`http://127.0.0.1:${engine.port}/__control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ failMode: null }) })
    await fetch(`http://127.0.0.1:${engine.port}/queue`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clear: true }) })
    await fetch(`http://127.0.0.1:${engine.port}/interrupt`, { method: 'POST' })
    const settled = [
      jobRecord(hungJob, hungId, {}, { status: 'cancelled' }),
      jobRecord(queuedJob, pendingId, {}, { status: 'cancelled' }),
    ]
    await post('/api/lan/jobs', { jobs: settled }).catch(() => undefined)
  }
}, 30_000)

test('(i) RESTART ORPHANS — a prompt the reachable engine knows nowhere fails with the restart advice (ewtobuh round 2)', async () => {
  // The settlement move (gfv5h0g) retired the client's recovery-restart
  // writer (the old poll loop failed any active prompt the fresh instance
  // had never heard of), and the 'absent → promote' backstop left a queued
  // orphan phantom-running to the 60-minute deadline. The watcher owns
  // settlement now, so the verdict lives here. Ghost prompt ids the fake
  // never received are exactly the evidence shape: both reads SUCCEED and
  // neither knows the prompt — history answers empty, /queue lacks them.
  const ghostQueued = 'jobwatcher-i1'
  const ghostRunning = 'jobwatcher-i2'
  await post('/api/lan/jobs', { jobs: [
    jobRecord(ghostQueued, 'ghost-wave1-queued', {}, { status: 'queued', progress: 0 }),
    jobRecord(ghostRunning, 'ghost-wave1-running', {}, { status: 'running' }),
  ] })
  try {
    // Young absence: the first absent sweep only MARKS the orphan — the
    // hold keeps the queued row queued through the confirmation window
    // (never a phantom promote), the running row stays running (no demote).
    await new Promise((resolve) => setTimeout(resolve, 700))
    const young = (await get('/api/lan/jobs')).jobs ?? []
    assert.equal(young.find((job) => job.id === ghostQueued)?.status, 'queued', 'a freshly-absent queued row holds queued during the confirmation window')
    // After the confirmation window the honest verdict lands on both —
    // seconds, not the 60-minute deadline.
    const orphans = await waitFor(async () => {
      const listed = (await get('/api/lan/jobs')).jobs ?? []
      const failed = listed.filter((job) => (job.id === ghostQueued || job.id === ghostRunning) && job.status === 'failed')
      return failed.length === 2 ? failed : null
    }, 'both restart orphans failing with the restart advice')
    for (const row of orphans) {
      assert.ok((row.error ?? '').includes('restarted'), `the restart advice rides the record (${row.id}: ${row.error ?? ''})`)
      assert.equal(row.failureKind, 'engine-unreachable', `the classification is structured (${row.id})`)
    }
  } finally {
    // Settle the ghosts terminal so no later sweep (or the fabric listener)
    // observes them past this section.
    const settled = [
      jobRecord(ghostQueued, 'ghost-wave1-queued', {}, { status: 'cancelled' }),
      jobRecord(ghostRunning, 'ghost-wave1-running', {}, { status: 'cancelled' }),
    ]
    await post('/api/lan/jobs', { jobs: settled }).catch(() => undefined)
  }
}, 30_000)
