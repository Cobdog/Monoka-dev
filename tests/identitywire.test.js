// The identity-wire suite (task to7xpa7, spec
// docs/specs/2026-10-17-hash-catalog.md §2 the pinned payload + the
// populate paths, §6 the progressive reveal).
//
// Task 4 of the catalog build wave: ModelFile.identity rides the
// bootstrap + inventory-light payloads (settled-cache-only — no route
// ever blocks on bytes), POST /api/lan/models/identify starts lazy
// digests and answers the interim vocabulary, and the store's
// mergeModelIdentities re-publishes upgrades to the surfaces with no
// second fetch. The REAL built server + the REAL environment-mirror
// fake engine (the resync suite's boot pattern) + fixture bytes + a
// fixture catalog through MONOKA_HASH_CATALOG — tests/lib/hashfixture.cjs
// writes the files, computes the real shas, emits the rows.
//
// Legs (the brief's seven TDD steps, in order):
//   (1) bootstrap models carry identity blocks; settled digests read
//       hash-confirmed (family/artifact named, aliases riding, verifying
//       absent once settled)
//   (2) an unconfigured root caps at name-suspected, honestly labeled
//       (AC-4 at the route: nothing claims hash-confirmed without bytes
//       read — and attach never enqueues, so verifying stays absent)
//   (2b) the degraded boot: an EMPTY catalog leaves identity ABSENT on
//       every payload — today's behavior, bit for bit
//   (3) the identify route answers verifying then settles; the size
//       pre-filter answers unknown WITHOUT enqueue; 0/65/malformed → 400
//   (4) no payload ships raw catalog rows (AC-6's wire clause as a test:
//       deep-scan bootstrap models + identify results for sha256/source/
//       repo/revision keys)
//   (5) the light inventory carries the same blocks (the settle
//       re-publish path the engine loop reads)
//   (7) mergeModelIdentities upgrades the store in place — the VM-harness
//       leg over the real zustand store (no build, no DOM)
// (6) — the fetch arm's catalogRowId stamp — lives in tests/fetcher.test.js
// (f5), beside the install-record legs it extends.
import { test, afterAll } from 'vitest'
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
const { loadTs } = require('../scripts/lib/ts-vm.cjs')
const { makePortAllocator } = require('./lib/ports.cjs')
const { makeScratchDir, removeAllScratchDirs } = require('./lib/scratch.cjs')
const { writeFixtureFile, catalogRow, writeCatalogFile, fixtureBytes } = require('./lib/hashfixture.cjs')
afterAll(() => { void removeAllScratchDirs() })

const freePort = makePortAllocator('identitywire')

const hasServerBuild = fs.existsSync(path.join(REPO, 'dist-server', 'server', 'index.js'))
if (!hasServerBuild) {
  console.log('NOTE - no dist-server build present (server/index.js); run pnpm build:server — this suite runs on legs that build the server.')
}
const maybe = hasServerBuild ? test : test.skip

let passed = 0
function ok(condition, label) {
  assert.ok(condition, label)
  passed += 1
  console.log(`  ok - ${label}`)
}

function eq(actual, expected, label) {
  assert.deepEqual(actual, expected, label)
  passed += 1
  console.log(`  ok - ${label}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntil(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await sleep(80)
  }
  if (await predicate()) return true
  throw new Error(`timed out after ${timeoutMs} ms waiting for: ${label}`)
}

// ---- the processes (the resync suite's boot pattern) ----------------------

const engineFor = (port) => spawn(process.execPath, [
  path.join(REPO, 'e2e', 'mirror', 'fakeEngineServer.mjs'),
  '--port', String(port),
  '--profile', path.join(REPO, 'e2e', 'mirror', 'profiles', 'stock-h3.json'),
], { stdio: ['ignore', 'ignore', 'pipe'] })

/** The built studio server on a scratch home; MONOKA_HASH_CATALOG rides the
 *  spawn env (never the suite process's env) so each leg's server sees
 *  exactly its own catalog. catalogPath null = the loader's walk (unused —
 *  every leg pins a fixture). */
function studioServer(home, serverPort, catalogPath) {
  return spawn(process.execPath, [path.join(REPO, 'dist-server', 'server', 'index.js')], {
    cwd: REPO,
    env: { ...process.env, MONOKA_HOME: home, MONOKA_LAN_PORT: String(serverPort), MONOKA_NO_HTTPS: '1', MONOKA_HASH_CATALOG: catalogPath },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
}

async function bootAll(engine, server, base, apiUrl) {
  await waitUntil(async () => {
    try { return (await fetch(`${apiUrl}/system_stats`)).ok } catch { return false }
  }, 10_000, 'mirror engine boot (stock-h3)')
  await waitUntil(async () => {
    try { return (await fetch(`${base}/api/lan/settings`)).ok } catch { return false }
  }, 15_000, 'studio server boot')
}

async function teardown(engine, server) {
  engine.kill('SIGINT')
  server.kill('SIGINT')
  await waitUntil(() => server.exitCode !== null, 5_000, 'server exit').catch(() => server.kill('SIGKILL'))
  await waitUntil(() => engine.exitCode !== null, 5_000, 'engine exit').catch(() => engine.kill('SIGKILL'))
}

// ---- the fixtures ----------------------------------------------------------

const FL2VA_NAME = 'H3/ssd/minimax_h3_fl2va_pruned_int8_convrot.safetensors'
const QWEN_NAME = 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'
const VIDEO_VAE_NAME = 'minimax_h3_video_vae_fp16.safetensors'
const TURBO_LORA_NAME = 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'

/** One leg's fixture: the stock-h3 profile's listing names written as REAL
 *  bytes under the settings roots the leg's server will carry, plus a
 *  fixture catalog with rows for three of them. The music3 pair, the audio
 *  VAE, the ref2va, and the turbo lora are deliberately ROWLESS — the
 *  honest-unknown arms — with sizes matching no row (the pre-filter's arm). */
function makeFixture(legDir) {
  const root = path.join(legDir, 'models')
  const files = {
    fl2va: writeFixtureFile(root, `diffusion_models/${FL2VA_NAME}`, fixtureBytes('fl2va', 8 * 1024 * 1024)),
    qwen: writeFixtureFile(root, `text_encoders/${QWEN_NAME}`, fixtureBytes('qwen', 64 * 1024)),
    videoVae: writeFixtureFile(root, `vae/${VIDEO_VAE_NAME}`, fixtureBytes('video-vae', 32 * 1024)),
    turboLora: writeFixtureFile(root, `loras/${TURBO_LORA_NAME}`, fixtureBytes('turbo', 3 * 1024)),
    music3Dit: writeFixtureFile(root, 'diffusion_models/music3_dit_int8.safetensors', fixtureBytes('music3-dit', 1024)),
    audioVae: writeFixtureFile(root, 'vae/minimax_h3_audio_vae_fp32.safetensors', fixtureBytes('audio-vae', 4 * 1024)),
  }
  const rows = [
    catalogRow({ sha256: files.fl2va.sha, sizeBytes: files.fl2va.bytes, kind: 'diffusion_models', identity: { family: 'minimax-h3', artifact: 'fl2va', variant: 'pruned', quant: 'int8', dtype: 'int8' }, aliases: ['minimax_h3_fl2va_pruned_int8_convrot.safetensors'] }),
    catalogRow({ sha256: files.qwen.sha, sizeBytes: files.qwen.bytes, kind: 'text_encoders', identity: { family: 'minimax-h3', artifact: 'text-encoder', variant: 'qwen3vl-32b', quant: 'nvfp4', dtype: 'awq' }, aliases: [QWEN_NAME] }),
    catalogRow({ sha256: files.videoVae.sha, sizeBytes: files.videoVae.bytes, kind: 'vae', identity: { family: 'minimax-h3', artifact: 'video-vae', variant: 'standard', quant: 'fp16', dtype: 'fp16' }, aliases: [VIDEO_VAE_NAME] }),
  ]
  return { root, catalogPath: writeCatalogFile(legDir, rows), files, rows }
}

/** Points the studio at the mirror engine and (when given) the fixture roots.
 *  paths.* are set explicitly — the saved defaults would point at the box's
 *  Documents tree, and the roots are a DESIGNATION the attach reads. */
async function applySettings(base, apiUrl, fixtureRoot) {
  const current = (await fetch(`${base}/api/lan/settings`).then((r) => r.json())).settings
  const kindPaths = {}
  for (const kind of ['diffusion_models', 'text_encoders', 'vae', 'loras', 'vae_approx', 'clip_vision']) {
    kindPaths[kind] = fixtureRoot ? path.join(fixtureRoot, kind) : ''
  }
  const applied = await fetch(`${base}/api/lan/settings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ settings: { ...current, comfyUrl: apiUrl, ...(fixtureRoot ? { modelRoot: fixtureRoot } : {}), paths: kindPaths, engine: { ...current.engine, mode: 'external' } } }),
  }).then((r) => r.json())
  return applied
}

async function getJson(base, pathname) {
  return fetch(`${base}${pathname}`).then((r) => r.json())
}

async function bootstrap(base, candidateUrl) {
  const query = candidateUrl ? `?url=${encodeURIComponent(candidateUrl)}` : ''
  return getJson(base, `/api/lan/bootstrap${query}`)
}

async function postJson(base, pathname, payload) {
  return fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

const findModel = (models, name) => models.find((file) => file.name === name)

/** AC-6's wire clause, as a walk: no payload ever carries the raw catalog
 *  rows' keys. Returns the offending trails (empty = clean). */
function catalogKeyTrails(value) {
  const forbidden = ['sha256', 'source', 'repo', 'revision']
  const hits = []
  const visit = (node, trail) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${trail}[${index}]`))
      return
    }
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        if (forbidden.includes(key)) hits.push(`${trail}.${key}`)
        else visit(node[key], `${trail}.${key}`)
      }
    }
  }
  visit(value, '$')
  return hits
}

// ---------------------------------------------------------------------------
maybe('(1)(3)(4)(5) the wire: the trigger answers verifying, the settle rides the standing reads, no raw rows on the wire', async () => {
  console.log('identitywire: the wire against the real server')
  const leg = makeScratchDir(path.join(os.tmpdir(), 'monoka-identitywire-'))
  const fixture = makeFixture(leg)
  const enginePort = await freePort()
  const serverPort = await freePort()
  const engine = engineFor(enginePort)
  const server = studioServer(leg, serverPort, fixture.catalogPath)
  const base = `http://127.0.0.1:${serverPort}`
  const apiUrl = `http://127.0.0.1:${enginePort}`

  try {
    await bootAll(engine, server, base, apiUrl)
    const applied = await applySettings(base, apiUrl, fixture.root)
    ok(applied.settings?.modelRoot === fixture.root, 'settings designate the fixture roots')

    // ---- (3) the trigger: POST /api/lan/models/identify -------------------
    console.log('identitywire: (3) the identify route answers the interim vocabulary')
    const identifyBody = { files: [
      { kind: 'diffusion_models', name: FL2VA_NAME },
      { kind: 'text_encoders', name: QWEN_NAME },
      { kind: 'vae', name: VIDEO_VAE_NAME },
      { kind: 'loras', name: TURBO_LORA_NAME },
    ] }
    const first = await postJson(base, '/api/lan/models/identify', identifyBody).then((r) => r.json())
    ok(Array.isArray(first.results) && first.results.length === 4, 'the route answers one result per asked file')
    const firstByName = new Map(first.results.map((result) => [result.name, result]))
    const fl2vaFirst = firstByName.get(FL2VA_NAME)
    ok(fl2vaFirst !== undefined && fl2vaFirst.kind === 'diffusion_models', 'results carry the asked (kind, name)')
    ok(fl2vaFirst.identity?.verdict === 'name-suspected' && fl2vaFirst.identity.verifying === true, 'an enqueued digest answers name-suspected + verifying (the interim vocabulary)')
    ok(fl2vaFirst.bytes === fixture.files.fl2va.bytes, 'the trigger result carries the stat bytes')
    const turboFirst = firstByName.get(TURBO_LORA_NAME)
    ok(turboFirst.identity?.verdict === 'unknown' && turboFirst.identity.verifying === undefined, 'the size pre-filter answers unknown WITHOUT enqueue (verifying absent) — the 8 MiB file stays the only one hashing')

    // ---- (1) the settle: the poll rides the standing bootstrap read -------
    console.log('identitywire: (1) settled digests ride the bootstrap payload hash-confirmed')
    await waitUntil(async () => {
      const boot = await bootstrap(base)
      return findModel(boot.models ?? [], FL2VA_NAME)?.identity?.verdict === 'hash-confirmed'
    }, 15_000, 'the fl2va digest to settle into the bootstrap payload')
    const boot = await bootstrap(base)
    const models = boot.models ?? []
    ok(models.length > 0, 'the bootstrap enumerated the mirror engine\'s registry')
    ok(models.every((file) => file.identity && typeof file.identity.verdict === 'string'), 'every enumerated file carries an identity block (the catalog loaded — the populate ruling)')
    const fl2va = findModel(models, FL2VA_NAME)
    eq(fl2va.identity, { verdict: 'hash-confirmed', family: 'minimax-h3', artifact: 'fl2va', variant: 'pruned', quant: 'int8', dtype: 'int8', aliases: ['minimax_h3_fl2va_pruned_int8_convrot.safetensors'] }, 'the settled fl2va block is hash-confirmed with the row identity + publisher aliases')
    ok(fl2va.identity.verifying === undefined, 'verifying is ABSENT once settled (the interim marker does not linger)')
    eq(findModel(models, QWEN_NAME).identity.verdict, 'hash-confirmed', 'the qwen encoder settled hash-confirmed too')
    eq(findModel(models, VIDEO_VAE_NAME).identity.verdict, 'hash-confirmed', 'the video VAE settled hash-confirmed')
    for (const rowless of ['music3_dit_int8.safetensors', 'minimax_h3_audio_vae_fp32.safetensors', TURBO_LORA_NAME]) {
      eq(findModel(models, rowless)?.identity?.verdict, 'unknown', `the rowless ${rowless} reads unknown — honestly, block still present`)
    }
    ok(findModel(models, 'music3_dit_int8.safetensors').identity.verifying === undefined, 'unknown carries no interim marker')

    // Idempotence: the trigger re-asked after settle answers NOW.
    const second = await postJson(base, '/api/lan/models/identify', identifyBody).then((r) => r.json())
    const fl2vaSecond = second.results.find((result) => result.name === FL2VA_NAME)
    ok(fl2vaSecond.identity.verdict === 'hash-confirmed' && fl2vaSecond.identity.verifying === undefined, 'the trigger is idempotent — a settled file answers hash-confirmed immediately')

    // The ?url= candidate scoping: the roots stay the SAVED settings'
    // designation (an engine url says nothing about where bytes live).
    const candidateBoot = await bootstrap(base, apiUrl)
    const candidateFl2va = findModel(candidateBoot.models ?? [], FL2VA_NAME)
    ok(candidateFl2va?.identity?.verdict === 'hash-confirmed', 'a ?url=-scoped bootstrap still reads the saved roots — hash-confirmed survives the candidate scoping')

    // ---- (4) no payload ships raw catalog rows ----------------------------
    console.log('identitywire: (4) AC-6 — no raw catalog rows on the wire')
    const bootHits = catalogKeyTrails(models)
    eq(bootHits, [], `the bootstrap models carry no sha256/source/repo/revision keys (found: ${bootHits.slice(0, 4).join(', ')})`)
    const resultHits = catalogKeyTrails(first.results)
    eq(resultHits, [], `the identify results carry no raw catalog keys either (found: ${resultHits.slice(0, 4).join(', ')})`)

    // ---- (5) the light inventory carries the same blocks -------------------
    console.log('identitywire: (5) the light inventory carries identities (the settle re-publish path)')
    const light = await getJson(base, '/api/lan/inventory-light')
    ok(light.connected === true && Array.isArray(light.models), 'the light route answers a judgeable listing')
    ok(light.models.every((file) => file.identity && typeof file.identity.verdict === 'string'), 'every light row carries a block')
    eq(findModel(light.models, FL2VA_NAME)?.identity?.verdict, 'hash-confirmed', 'the settled verdict rides the light payload too')
    eq(findModel(light.models, 'music3_dit_int8.safetensors')?.identity?.verdict, 'unknown', 'the rowless arm rides the light payload too')
    const lightHits = catalogKeyTrails(light.models)
    eq(lightHits, [], 'the light payload ships no raw catalog rows either')

    // ---- (3b) the bounds: shape validation like every sibling route -------
    const empty = await postJson(base, '/api/lan/models/identify', { files: [] })
    eq(empty.status, 400, '0 files → 400 (the route refuses what the seam passes through)')
    const bodyless = await postJson(base, '/api/lan/models/identify', {})
    eq(bodyless.status, 400, 'a body without a files array → 400')
    const sixtyFive = Array.from({ length: 65 }, (_, index) => ({ kind: 'loras', name: `gen-${index}.safetensors` }))
    const tooMany = await postJson(base, '/api/lan/models/identify', { files: sixtyFive })
    eq(tooMany.status, 400, '65 files → 400 (the named bound, mapped at the route)')
    const malformed = await postJson(base, '/api/lan/models/identify', { files: [{ kind: 'loras' }] })
    eq(malformed.status, 400, 'a malformed entry (no name) → 400')
    const malformedBody = await malformed.json()
    ok(typeof malformedBody.error === 'string' && malformedBody.error.length > 0, 'the 400 carries the named reason')
  } finally {
    await teardown(engine, server)
  }

  console.log(`  identitywire: ${passed} assertions passed`)
})

// ---------------------------------------------------------------------------
maybe('(2) an unconfigured root caps at name-suspected, honestly labeled (AC-4 at the route)', async () => {
  console.log('identitywire: (2) the unconfigured-root cap')
  const leg = makeScratchDir(path.join(os.tmpdir(), 'monoka-identitywire-'))
  const fixture = makeFixture(leg)
  const enginePort = await freePort()
  const serverPort = await freePort()
  const engine = engineFor(enginePort)
  const server = studioServer(leg, serverPort, fixture.catalogPath)
  const base = `http://127.0.0.1:${serverPort}`
  const apiUrl = `http://127.0.0.1:${enginePort}`

  try {
    await bootAll(engine, server, base, apiUrl)
    // The fixture root is NOT designated: modelRoot stays the shipped
    // default (which holds no fixture bytes on this box). The catalog is
    // loaded — only the bytes are out of reach.
    await applySettings(base, apiUrl, null)

    const boot = await bootstrap(base)
    const models = boot.models ?? []
    ok(models.length > 0, 'the registry enumerated regardless')
    ok(models.every((file) => file.identity && typeof file.identity.verdict === 'string'), 'every file still carries a block (the catalog loaded — name-shape verdicts are computable from names alone)')
    ok(models.every((file) => file.identity.verdict === 'name-suspected' || file.identity.verdict === 'unknown'), 'NOTHING reads hash-confirmed without bytes read (AC-4 at the route)')
    ok(models.every((file) => file.identity.verifying === undefined), 'attach never enqueues — verifying stays absent on every payload block')
    const fl2va = findModel(models, FL2VA_NAME)
    eq(fl2va.identity.verdict, 'name-suspected', 'the aliased fl2va caps at name-suspected')
    eq(fl2va.identity.family, 'minimax-h3', 'the name-suspected block still LABELS what the name matched')
    ok(!('aliases' in fl2va.identity), 'aliases ride hash-confirmed only (§2\'s wire clause)')
    eq(findModel(models, 'music3_dit_int8.safetensors').identity.verdict, 'unknown', 'the rowless arm stays unknown')

    const light = await getJson(base, '/api/lan/inventory-light')
    ok((light.models ?? []).every((file) => file.identity && file.identity.verdict !== 'hash-confirmed'), 'the light payload caps identically')
  } finally {
    await teardown(engine, server)
  }

  console.log(`  identitywire: (2) done`)
})

// ---------------------------------------------------------------------------
maybe('(2b) the degraded boot: an EMPTY catalog leaves identity absent on every payload (today\'s behavior, bit for bit)', async () => {
  console.log('identitywire: (2b) the degraded byte-parity boot')
  const leg = makeScratchDir(path.join(os.tmpdir(), 'monoka-identitywire-'))
  const emptyCatalogPath = writeCatalogFile(leg, [])
  const enginePort = await freePort()
  const serverPort = await freePort()
  const engine = engineFor(enginePort)
  const server = studioServer(leg, serverPort, emptyCatalogPath)
  const base = `http://127.0.0.1:${serverPort}`
  const apiUrl = `http://127.0.0.1:${enginePort}`

  try {
    await bootAll(engine, server, base, apiUrl)
    await applySettings(base, apiUrl, null)

    const boot = await bootstrap(base)
    const models = boot.models ?? []
    ok(models.length > 0, 'the registry enumerated (degradation never gates a boot)')
    ok(models.every((file) => !('identity' in file)), 'no bootstrap row carries an identity key — byte-parity with the pre-catalog payloads')
    const light = await getJson(base, '/api/lan/inventory-light')
    ok((light.models ?? []).every((file) => !('identity' in file)), 'the light payload degrades identically')

    // An explicit ask still answers honestly (never a crash, never a claim).
    const asked = await postJson(base, '/api/lan/models/identify', { files: [{ kind: 'diffusion_models', name: FL2VA_NAME }] })
    eq(asked.status, 200, 'the identify route stays live in degraded mode')
    const answer = await asked.json()
    eq(answer.results?.[0]?.identity?.verdict, 'unknown', 'an explicit ask over an empty catalog reads unknown — nothing claimed, nothing crashed')
  } finally {
    await teardown(engine, server)
  }

  console.log(`  identitywire: (2b) done`)
})

// ---------------------------------------------------------------------------
test('(7) mergeModelIdentities upgrades the store in place — the settle re-publish (the wizard\'s D6 contract)', () => {
  console.log('identitywire: (7) the store\'s settle upgrade')
  const { useSessionStore } = loadTs('src/state/sessionStore.ts')
  const store = useSessionStore.getState()

  const seed = [
    { name: FL2VA_NAME, kind: 'diffusion_models', bytes: 0, identity: { verdict: 'name-suspected', verifying: true, family: 'minimax-h3' } },
    { name: 'music3_dit_int8.safetensors', kind: 'diffusion_models', bytes: 0, identity: { verdict: 'unknown' } },
    { name: 'unheard.safetensors', kind: 'loras', bytes: 4096 },
  ]
  store.setModels(seed)
  eq(useSessionStore.getState().models, seed, 'the store seeds with name-shape blocks')

  const results = [
    { kind: 'diffusion_models', name: FL2VA_NAME, identity: { verdict: 'hash-confirmed', family: 'minimax-h3', artifact: 'fl2va', variant: 'pruned', quant: 'int8', dtype: 'int8', aliases: ['minimax_h3_fl2va_pruned_int8_convrot.safetensors'] } },
    { kind: 'diffusion_models', name: 'music3_dit_int8.safetensors', identity: { verdict: 'name-suspected', family: 'music3', artifact: 'dit', variant: 'base', quant: 'int8', dtype: 'int8' } },
    { kind: 'loras', name: 'ghost.safetensors', identity: { verdict: 'hash-confirmed' } },
  ]
  store.mergeModelIdentities(results)

  const after = useSessionStore.getState().models
  eq(after.map((file) => `${file.kind}:${file.name}`), seed.map((file) => `${file.kind}:${file.name}`), 'the (kind, name) order is untouched')
  ok(after !== seed, 'a real upgrade publishes a fresh array (the surfaces re-render)')
  const upgraded = after[0]
  eq(upgraded.identity, { verdict: 'hash-confirmed', family: 'minimax-h3', artifact: 'fl2va', variant: 'pruned', quant: 'int8', dtype: 'int8', aliases: ['minimax_h3_fl2va_pruned_int8_convrot.safetensors'] }, 'name-suspected+verifying flips to the settled hash-confirmed block — verifying GONE')
  ok(upgraded.bytes === 0, 'the upgrade touches only the identity field (bytes survived)')
  eq(after[1].identity.verdict, 'name-suspected', 'the second row upgraded too')
  ok(after[2] === seed[2], 'a row with no matching result is left untouched (same row object)')

  // The no-op guard: the standing cadence re-delivers the same settled
  // blocks every tick — a re-merge must not churn the array.
  const settled = useSessionStore.getState().models
  store.mergeModelIdentities(results)
  ok(useSessionStore.getState().models === settled, 'a re-merge of identical blocks is a no-op (no re-render churn on the standing cadence)')

  // Identity-absent results (the degraded light listing's shape) touch
  // nothing — and an empty ask is a no-op.
  store.setModels(seed)
  store.mergeModelIdentities([{ kind: 'loras', name: 'unheard.safetensors' }])
  ok(useSessionStore.getState().models === seed, 'a result without an identity block leaves every row untouched')
  store.mergeModelIdentities([])
  ok(useSessionStore.getState().models === seed, 'an empty ask is a no-op')

  console.log(`  identitywire: (7) done`)
})

console.log('identitywire: suite loaded')
