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
  const promptId = await enginePrompt({ save: { class_type: 'SaveVideo', inputs: {} } })
  const jobId = 'jobwatcher-c'
  await post('/api/lan/jobs', { jobs: [jobRecord(jobId, promptId, { canvas: { chainId: chainC.id, projectId: client.projectId } })] })
  const failed = await waitFor(async () => {
    const listed = (await get('/api/lan/jobs')).jobs ?? []
    return listed.find((job) => job.id === jobId && job.status === 'failed') ?? null
  }, `the job row ${jobId} to read failed`, 30_000)
  assert.ok(failed.error && failed.error.length > 0, 'the failure carries its sanitized reason')
  const envelope = await waitFor(() => fabric.envelopes.find((entry) => entry.ch === 'job' && entry.type === 'landing' && entry.payload?.jobId === jobId) ?? null, 'the failed landing envelope', 5000)
  assert.equal(envelope.payload.outcome, 'failed')
  const document = await documentFor(client.projectId)
  const chain = document.chains.find((entry) => entry.id === chainC.id)
  assert.equal((chain?.outputs ?? []).length, 0, 'a failed render lands no output row')
  await fetch(`http://127.0.0.1:${engine.port}/__control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ failMode: null }) })
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
