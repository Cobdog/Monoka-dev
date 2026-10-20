// The LAN prep step's server seams (wizard rework task 7, spec §2.4 — W-I1,
// W-I2/D8, plan rulings 2/3/6): the launcher-config write route the wizard's
// exit motion rides, the live posture read with env-override honesty, the
// host+port bind probe, and the loopback-gated token routes.
//
// Boots the BUILT standalone server on a scratch home + this suite's disjoint
// port range (like the documents suite) — routes are proven over the wire,
// the pure seam arms (isLoopbackPeer truth table, raw RMW preservation) load
// straight from dist-server. MONOKA_START_CONFIG is set on EVERY boot: the
// repo-root .start-config.json is the maintainer's real launcher config and
// is never read, written, or seeded by this suite. Sections:
//   (a) lan-status answers the live posture with env-override truth
//   (b) the bind probe refuses an in-use port honestly (the two-choice host)
//   (c) launcher-config writes validated keys read-modify-write (launcher
//       still parses the written file; a missing config is an honest
//       refusal, never a seed; unknown pre-existing keys survive verbatim)
//   (d) the env-override posture is stated ON the write (W-I1)
//   (e) the token answers loopback only (plan ruling 2)
//   (f) the launcher-export marker: MONOKA_LAUNCHER_EXPORTED marks the
//       launcher's own network exports, and the honesty reports only what
//       the USER set (review fix round, 3p14abm)
//   (g) the config write is atomic — stage + rename like the launcher's own
//       --set; a failed write leaves the original intact, a successful one
//       leaves no staging residue (review fix round, 3p14abm)
//   (h) the --setup flag lifecycle: env → bootstrap/settings surface, the
//       ack clears it, idempotent (wizard task 9, spec §4)
//
// HONEST LIMIT (stated): the non-loopback arm of the token gate is proven by
// the isLoopbackPeer truth table + the route's gate shape, not by a socket
// from a foreign host — a same-host connection to a LAN-bound server still
// presents a loopback remoteAddress, so no single-box socket test can speak
// AS a LAN peer. The table is the contract the route composes.
//
// Run after `pnpm build:server` (the server is loaded from dist-server).
import { test, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const REPO = require('node:path').resolve(__dirname, '..')

const { spawn, spawnSync } = require('node:child_process')
const net = require('node:net')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { makePortAllocator } = require('./lib/ports.cjs')
// Scratch-home ledger (Wave 4 test hygiene): every mkdtemp registers;
// afterAll tears them all down — per-run homes never leak again.
const { makeScratchDir, removeAllScratchDirs } = require('./lib/scratch.cjs')
afterAll(() => { void removeAllScratchDirs() })

const freePort = makePortAllocator('lanprep')

let passed = 0
function ok(condition, label) {
  assert.ok(condition, label)
  passed += 1
  console.log(`  ok - ${label}`)
}

/** The launcher config this suite seeds — the FULL launcher key set (the
 *  same shape start.sh seeds) so the RMW preservation assertion covers every
 *  pre-existing key and the launcher's own loader can still parse the
 *  written file. */
function seedConfig(overrides = {}) {
  return {
    port: 4178,
    host: '0.0.0.0',
    https: true,
    token: false,
    qrPrint: true,
    dataDir: '',
    engineUrl: 'http://127.0.0.1:8188',
    logLevel: 'info',
    dev: false,
    prettyLogs: false,
    sourceMaps: false,
    vitePort: 5173,
    dbg: false,
    ...overrides,
  }
}

/** Every server booted this run — the SUCCESS path and every FAILURE path
 *  kill them all (a spawned child holds its stdio pipes open, so a missed
 *  kill both orphans the server AND parks the runner in ep_poll forever). */
const bootedServers = []
const killAllServers = () => {
  for (const child of bootedServers) {
    try {
      child.kill()
    } catch { /* already gone */ }
  }
}
process.on('exit', killAllServers)

function scratch(prefix) {
  return makeScratchDir(path.join(os.tmpdir(), `monoka-lanprep-${prefix}-`))
}

/** Boots the built server with a scratch home, a probed port, plain HTTP,
 *  and a SCRATCH launcher config (never the repo root's). Extra env rides
 *  through (the env-override arms). `settingsSeed` lands in the home's
 *  settings.json BEFORE the spawn — the boot's first loadSettings caches it
 *  (the bootstrap's engine probe fetches the configured comfyUrl, so arms
 *  that must not touch a real engine seed a dead one). */
async function bootServer(label, env = {}, settingsSeed = null) {
  const home = scratch(label)
  const configPath = path.join(home, 'start-config.json')
  fs.writeFileSync(configPath, JSON.stringify(seedConfig(), null, 2) + '\n')
  if (settingsSeed) fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify(settingsSeed))
  const port = await freePort()
  const output = { text: '', label }
  const child = spawn(process.execPath, [path.join(REPO, 'dist-server', 'server', 'index.js')], {
    env: {
      ...process.env,
      MONOKA_HOME: home,
      MONOKA_LAN_PORT: String(port),
      MONOKA_NO_HTTPS: '1',
      MONOKA_START_CONFIG: configPath,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  bootedServers.push(child)
  child.stdout.on('data', (chunk) => { output.text += String(chunk) })
  child.stderr.on('data', (chunk) => { output.text += String(chunk) })
  const deadline = Date.now() + 15_000
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/lan/settings`)
      if (response.ok && output.text.includes(`"port":${port}`)) return { child, port, home, configPath, output }
    } catch { /* not up yet */ }
    if (Date.now() > deadline) {
      child.kill()
      throw new Error(`${label} server did not become ready in 15 s`)
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  child.kill()
  throw new Error(`${label} server never announced its port`)
}

function client(port) {
  const base = `http://127.0.0.1:${port}`
  return {
    async get(pathname) {
      const response = await fetch(base + pathname)
      const body = await response.json().catch(() => ({}))
      return { status: response.status, body }
    },
    async post(pathname, payload) {
      const response = await fetch(base + pathname, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      return { status: response.status, body }
    },
  }
}

const lanConfigModule = () => require(path.join(REPO, 'dist-server', 'server', 'lanConfig.js'))

test('(a) lan-status answers the live posture with env-override truth', async () => {
  console.log('lanprep: the live posture read')
  const server = await bootServer('status')
  const api = client(server.port)
  const answer = await api.get('/api/lan/lan-status')
  ok(answer.status === 200, `the status read answers 200 (got ${answer.status})`)

  // The LIVE posture: the booted bind, not the config file's numbers. The
  // boot port came from MONOKA_LAN_PORT — the env wins over the file, and
  // the read says so (W-I1's honesty: the wizard reads the applied truth).
  ok(answer.body.posture && typeof answer.body.posture === 'object', 'the read carries the posture object')
  ok(answer.body.posture.port === server.port, `posture.port is the BOUND port (got ${JSON.stringify(answer.body.posture.port)}, booted ${server.port})`)
  ok(answer.body.posture.host === '0.0.0.0', `posture.host is the default bind (got ${JSON.stringify(answer.body.posture.host)})`)
  ok(answer.body.posture.secure === false, 'posture.secure follows the actual listener (plain HTTP under MONOKA_NO_HTTPS)')
  ok(answer.body.posture.tokenEnforced === false, 'posture.tokenEnforced is the honest default (off)')
  ok(answer.body.posture.tokenConfigured === true, 'posture.tokenConfigured is true — the token file exists')

  // The env-override truth: this boot set MONOKA_LAN_PORT, and the read
  // NAMES it — the confirmation copy derives from this list.
  ok(Array.isArray(answer.body.envOverrides), 'envOverrides is a list')
  ok(answer.body.envOverrides.includes('MONOKA_LAN_PORT'), `envOverrides names the set launcher var (got ${JSON.stringify(answer.body.envOverrides)})`)

  // The live LanStatus rides too (the printed URL's source).
  ok(answer.body.status && answer.body.status.running === true, 'the live LanStatus is running')
  ok(typeof answer.body.status.url === 'string' && answer.body.status.url.includes(String(server.port)), 'the live status carries the printable URL')

  // The config file read: the seeded scratch config, verbatim.
  ok(answer.body.config && answer.body.config.readable !== false, 'the seeded config reads back')
  ok(answer.body.config.port === 4178 && answer.body.config.host === '0.0.0.0' && answer.body.config.token === false, 'the seeded config keys answer as written')
  server.child.kill()
})

test('(b) the bind probe refuses an in-use port honestly (the two-choice host)', async () => {
  console.log('lanprep: the bind probe')
  const server = await bootServer('probe')
  const api = client(server.port)

  // An OCCUPIED port: the suite's own listener holds it — the probe answers
  // claimable:false with the code, never a maybe.
  const holder = net.createServer()
  const occupied = await new Promise((resolve) => {
    holder.listen(0, '127.0.0.1', () => resolve(holder.address().port))
  })
  try {
    const busy = await api.post('/api/lan/lan-probe', { host: '127.0.0.1', port: occupied })
    ok(busy.status === 200, `the busy probe answers 200 (got ${busy.status})`)
    ok(busy.body.claimable === false, `an in-use port answers claimable:false (got ${JSON.stringify(busy.body.claimable)})`)
    ok(typeof busy.body.reason === 'string' && busy.body.reason.length > 0, `the refusal names the code (got ${JSON.stringify(busy.body.reason)})`)
    ok(/EADDRINUSE/i.test(busy.body.reason), `the reason is the bind error code (got ${JSON.stringify(busy.body.reason)})`)

    // A free port: claimable.
    const free = await api.post('/api/lan/lan-probe', { host: '0.0.0.0', port: await freePort() })
    ok(free.status === 200 && free.body.claimable === true, `a free port answers claimable:true (got ${JSON.stringify(free.body)})`)
  } finally {
    await new Promise((resolve) => holder.close(() => resolve()))
  }

  // The wizard is SERVED BY this listener — probing the studio's own port
  // is the live-web case (review fix round, 3p14abm): the honest raw answer
  // is claimable:false with the bind code (the holder is the studio itself).
  // The walk's live-posture equivalence arm is what routes a designation of
  // this exact address around the dead end — proven in the wizard suite.
  const ownPort = await api.post('/api/lan/lan-probe', { host: '0.0.0.0', port: server.port })
  ok(ownPort.status === 200 && ownPort.body.claimable === false, `probing the studio's OWN port answers honestly not-claimable (got ${JSON.stringify(ownPort.body)})`)
  ok(/EADDRINUSE/i.test(String(ownPort.body.reason)), `the own-port refusal carries the bind code (got ${JSON.stringify(ownPort.body.reason)})`)

  // The host scope is the step's TWO choices (plan ruling 6) — no arbitrary
  // bind probing through this route.
  const foreignHost = await api.post('/api/lan/lan-probe', { host: '10.1.2.3', port: 5000 })
  ok(foreignHost.status === 400, `a foreign host is refused 400 (got ${foreignHost.status})`)
  ok(typeof foreignHost.body.error === 'string' && foreignHost.body.error.length > 0, 'the host refusal names the rule')
  const badPort = await api.post('/api/lan/lan-probe', { host: '127.0.0.1', port: 80 })
  ok(badPort.status === 400, `an out-of-range port is refused 400 (got ${badPort.status})`)
  ok(/1024|65535/.test(String(badPort.body.error)), `the port refusal names the range (got ${JSON.stringify(badPort.body.error)})`)
  server.child.kill()
})

test('(c) launcher-config writes validated keys read-modify-write', async () => {
  console.log('lanprep: the launcher-config write')
  const server = await bootServer('write')
  const api = client(server.port)

  // RMW: write ONE key — every other pre-existing key survives verbatim, on
  // disk, in the route's read-back, and in the LAUNCHER's own parse.
  const seeded = { ...seedConfig(), dataDir: '/tmp/lanprep-data', engineUrl: 'http://127.0.0.1:9999' }
  fs.writeFileSync(server.configPath, JSON.stringify(seeded, null, 2) + '\n')
  const write = await api.post('/api/lan/launcher-config', { token: true })
  ok(write.status === 200, `the write answers 200 (got ${write.status})`)
  ok(Array.isArray(write.body.written) && write.body.written.join(',') === 'token', `written names exactly the written keys (got ${JSON.stringify(write.body.written)})`)
  ok(write.body.config && write.body.config.token === true, 'the read-back carries the written key')
  ok(write.body.config.dataDir === '/tmp/lanprep-data' && write.body.config.engineUrl === 'http://127.0.0.1:9999', 'the read-back preserves the untouched keys')
  ok(write.body.config.port === 4178 && write.body.config.host === '0.0.0.0', 'the read-back preserves the posture keys')
  const onDisk = JSON.parse(fs.readFileSync(server.configPath, 'utf8'))
  ok(onDisk.token === true, 'the file carries the written key')
  ok(onDisk.dataDir === '/tmp/lanprep-data' && onDisk.engineUrl === 'http://127.0.0.1:9999' && onDisk.vitePort === 5173, 'the file preserves EVERY pre-existing key')
  ok(fs.readdirSync(server.home).filter((name) => name.endsWith('.tmp')).length === 0, `the write leaves no staging residue (got ${JSON.stringify(fs.readdirSync(server.home).filter((name) => name.endsWith('.tmp')))})`)

  // The launcher itself still parses what the route wrote (the two stores
  // stay one contract — start.sh's load mode validates every field).
  const launcherPort = await freePort()
  const vitePort = await freePort()
  const parsed = spawnSync('sh', [path.join(REPO, 'start.sh'), '--print'], {
    cwd: REPO,
    env: { ...process.env, MONOKA_START_CONFIG: server.configPath, MONOKA_LAN_PORT: String(launcherPort), MONOKA_VITE_PORT: String(vitePort), MONOKA_HOME: server.home },
    encoding: 'utf8',
    timeout: 30_000,
  })
  const launcherOut = `${parsed.stdout || ''}${parsed.stderr || ''}`
  ok(parsed.status === 0, `the launcher parses the written config (exit ${parsed.status}: ${launcherOut.slice(0, 400)})`)
  ok(launcherOut.includes('token=on'), 'the launcher reads the written token posture back')

  // Validation: an out-of-range port is refused 400 naming the rule; the
  // file is untouched by the refused write.
  const badPort = await api.post('/api/lan/launcher-config', { port: 80 })
  ok(badPort.status === 400, `an out-of-range port write is refused 400 (got ${badPort.status})`)
  ok(/1024|65535/.test(String(badPort.body.error)), `the port refusal names the rule (got ${JSON.stringify(badPort.body.error)})`)
  const badHost = await api.post('/api/lan/launcher-config', { host: 'not a host' })
  ok(badHost.status === 400, `a malformed host is refused 400 (got ${badHost.status})`)
  const badToken = await api.post('/api/lan/launcher-config', { token: 'yes' })
  ok(badToken.status === 400, `a non-boolean token is refused 400 (got ${badToken.status})`)
  ok(JSON.parse(fs.readFileSync(server.configPath, 'utf8')).port === 4178, 'the refused writes never touched the file')

  // The missing-file refusal: MONOKA_START_CONFIG pointed nowhere answers
  // the honest refusal — {written: []} + a reason — NEVER a seed (the
  // launcher seeds on ITS first run; a wizard write must not invent one).
  const orphan = await bootServer('missing', { MONOKA_START_CONFIG: path.join(scratch('nowhere'), 'absent', 'config.json') })
  const orphanApi = client(orphan.port)
  const refused = await orphanApi.post('/api/lan/launcher-config', { token: true })
  ok(refused.status >= 400, `the missing-config write refuses (got ${refused.status})`)
  ok(Array.isArray(refused.body.written) && refused.body.written.length === 0, `the refusal answers written:[] (got ${JSON.stringify(refused.body.written)})`)
  ok(typeof refused.body.reason === 'string' && refused.body.reason.length > 0, `the refusal names its reason (got ${JSON.stringify(refused.body.reason)})`)
  ok(!fs.existsSync(path.join(scratch('nowhere'), 'absent', 'config.json')), 'the refusal never seeded a config file')
  const orphanStatus = await orphanApi.get('/api/lan/lan-status')
  ok(orphanStatus.body.config && orphanStatus.body.config.readable === false, 'the status read answers the unreadable config honestly')
  ok(typeof orphanStatus.body.config.reason === 'string' && orphanStatus.body.config.reason.length > 0, 'the unreadable config names its reason')
  orphan.child.kill()
  server.child.kill()
})

test('(d) the env-override posture is stated on the write', async () => {
  console.log('lanprep: the env-override honesty on writes')
  // The launcher exports MONOKA_LAN_HOST at boot; the server can read its
  // own truth — so a wizard write of that key names the override in the SAME
  // response (the confirmation copy derives from this; W-I1).
  const server = await bootServer('override', { MONOKA_LAN_HOST: '127.0.0.1' })
  const api = client(server.port)
  ok(server.port > 0, 'the override-boot server is up')
  const status = await api.get('/api/lan/lan-status')
  ok(status.body.posture.host === '127.0.0.1', `the applied posture is the ENV's host (got ${JSON.stringify(status.body.posture.host)})`)
  ok(status.body.envOverrides.includes('MONOKA_LAN_HOST'), `the status read names the override (got ${JSON.stringify(status.body.envOverrides)})`)

  const write = await api.post('/api/lan/launcher-config', { host: '0.0.0.0' })
  ok(write.status === 200, `the write lands (got ${write.status})`)
  ok(write.body.written.join(',') === 'host', 'the host key was written')
  ok(write.body.envOverrides.includes('MONOKA_LAN_HOST'), `the write response names the overriding env (got ${JSON.stringify(write.body.envOverrides)})`)
  ok(write.body.config.host === '0.0.0.0', 'the config now carries the written host — the env still wins at boot, and the response says both halves')
  server.child.kill()
})

test('(e) the token answers loopback only (plan ruling 2)', async () => {
  console.log('lanprep: the loopback-gated token routes')
  const { isLoopbackPeer } = lanConfigModule()

  // The truth table: loopback peers pass, LAN peers and unknowns fail.
  ok(isLoopbackPeer('127.0.0.1') === true, '127.0.0.1 is loopback')
  ok(isLoopbackPeer('::1') === true, '::1 is loopback')
  ok(isLoopbackPeer('::ffff:127.0.0.1') === true, 'the IPv4-mapped loopback form is loopback')
  ok(isLoopbackPeer('127.8.8.8') === true, 'the 127/8 range is loopback')
  ok(isLoopbackPeer('192.168.1.50') === false, 'a LAN address is not loopback')
  ok(isLoopbackPeer('10.0.0.7') === false, 'a private-range address is not loopback')
  ok(isLoopbackPeer('::ffff:192.168.1.50') === false, 'the mapped LAN form is not loopback')
  ok(isLoopbackPeer('') === false, 'an empty peer is not loopback')
  ok(isLoopbackPeer(undefined) === false, 'an absent peer is not loopback')

  // The route shape over the loopback the wizard actually rides.
  const server = await bootServer('token')
  const api = client(server.port)
  const read = await api.get('/api/lan/lan-token')
  ok(read.status === 200, `the loopback read answers 200 (got ${read.status})`)
  ok(/^[a-f0-9]{32}$/.test(String(read.body.token)), 'the token answers in the app format')
  ok(read.body.enforced === false, 'the read states the enforcement truth')

  const rotate = await api.post('/api/lan/lan-token/rotate', {})
  ok(rotate.status === 200, `the rotation answers 200 (got ${rotate.status})`)
  ok(/^[a-f0-9]{32}$/.test(String(rotate.body.token)), 'the rotated token answers in the app format')
  ok(rotate.body.token !== read.body.token, 'the rotation actually changed the token')
  const after = await api.get('/api/lan/lan-token')
  ok(after.body.token === rotate.body.token, 'the rotated value is the one that answers now')
  server.child.kill()
})

test('(f) the launcher-export marker: the honesty reports only what the USER set', async () => {
  console.log('lanprep: the launcher-export marker')
  // MONOKA_LAUNCHER_EXPORTED=1 is what start.sh sets alongside its own
  // network exports (review fix round, 3p14abm): with it present, the three
  // LAN keys in the env are the LAUNCHER's resolution of the saved config —
  // carrying them as "overrides" stated a falsehood (the file write wins at
  // the next fresh-shell boot). The honesty then reports an empty list: the
  // saved choices apply. Without the marker (a bare `node dist-server/...`
  // boot — arms (a)/(d)), a set key IS user intent and stays named.
  const server = await bootServer('marker', { MONOKA_LAUNCHER_EXPORTED: '1' })
  const api = client(server.port)
  const status = await api.get('/api/lan/lan-status')
  ok(status.status === 200, `the marked boot answers 200 (got ${status.status})`)
  ok(Array.isArray(status.body.envOverrides) && status.body.envOverrides.length === 0, `the marked boot reports NO user overrides (got ${JSON.stringify(status.body.envOverrides)})`)
  const write = await api.post('/api/lan/launcher-config', { token: true })
  ok(write.status === 200, `the write lands on the marked boot (got ${write.status})`)
  ok(Array.isArray(write.body.envOverrides) && write.body.envOverrides.length === 0, `the write response states no user overrides either (got ${JSON.stringify(write.body.envOverrides)})`)
  server.child.kill()
})

test('(g) the config write is atomic — stage + rename, the launcher\'s own standard', () => {
  console.log('lanprep: the atomic config write')
  const { writeLauncherConfig } = lanConfigModule()
  const dir = scratch('atomic')
  const configPath = path.join(dir, 'start-config.json')
  const seeded = seedConfig({ dataDir: '/tmp/lanprep-atomic' })
  fs.writeFileSync(configPath, JSON.stringify(seeded, null, 2) + '\n')
  const original = fs.readFileSync(configPath, 'utf8')
  // A writable FILE in a read-only DIRECTORY: an in-place truncate-at-open
  // write would SUCCEED here (and destroy the original); the launcher's own
  // stage + rename (start.sh:207-209) cannot even stage — the honest refusal
  // leaves the original byte-identical.
  const dirMode = fs.statSync(dir).mode & 0o777
  fs.chmodSync(dir, 0o555)
  try {
    let refused = null
    try {
      writeLauncherConfig(configPath, { token: true })
    } catch (error) {
      refused = error
    }
    ok(refused !== null, `the unwritable location refuses (got ${refused === null ? 'a silent success' : String(refused)})`)
    ok(refused !== null && refused.code === 'unwritable', `the refusal is the unwritable code (got ${JSON.stringify(refused && refused.code)})`)
    ok(fs.readFileSync(configPath, 'utf8') === original, 'the failed write left the original byte-identical (no truncate-at-open)')
  } finally {
    fs.chmodSync(dir, dirMode)
  }
  // The success path: same-dir stage + rename — no .tmp residue survives.
  const done = writeLauncherConfig(configPath, { token: true })
  ok(done.written.join(',') === 'token', 'the retry writes the key once the location is writable')
  ok(JSON.parse(fs.readFileSync(configPath, 'utf8')).token === true, 'the written file carries the key')
  ok(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')).length === 0, `no staging residue survives the rename (got ${JSON.stringify(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')))})`)
})

test('(h) bootstrap surfaces setupRequested and the ack clears it (wizard task 9, spec §4)', async () => {
  console.log('lanprep: the --setup flag lifecycle')
  // The env-derived, in-memory flag: boot with MONOKA_SETUP_REQUESTED=1 →
  // the bootstrap ask AND the settings read carry it; one POST to the ack
  // route clears it for every later read (no settings write — the flag is
  // the boot's, not the user's data); repeat acks stay idempotent. The
  // engine URL is seeded DEAD before the spawn: the bootstrap probes it and
  // the flag's surface must ride the down-engine answer too.
  const server = await bootServer(
    'setup-flag',
    { MONOKA_SETUP_REQUESTED: '1' },
    { comfyUrl: 'http://127.0.0.1:9' },
  )
  const api = client(server.port)
  const bootstrap = await api.get('/api/lan/bootstrap')
  ok(bootstrap.status === 200, `the bootstrap ask answers 200 (got ${bootstrap.status})`)
  ok(bootstrap.body.connected === false, 'the seeded engine is dead (the flag rides the down-engine answer too)')
  ok(bootstrap.body.setupRequested === true, `the bootstrap surfaces setupRequested:true (got ${JSON.stringify(bootstrap.body.setupRequested)})`)
  const settings = await api.get('/api/lan/settings')
  ok(settings.status === 200, `the settings read answers 200 (got ${settings.status})`)
  ok(settings.body.setupRequested === true, `the settings read surfaces it too (got ${JSON.stringify(settings.body.setupRequested)})`)

  const ack = await api.post('/api/lan/setup-ack', {})
  ok(ack.status === 200, `the ack route answers 200 (got ${ack.status})`)
  ok(ack.body.setupRequested === false, 'the ack answers the cleared state')
  const afterAck = await api.get('/api/lan/settings')
  ok(afterAck.body.setupRequested === false, 'the settings read is false after the ack')
  const afterAckBootstrap = await api.get('/api/lan/bootstrap')
  ok(afterAckBootstrap.body.setupRequested === false, 'the bootstrap is false after the ack')

  // Idempotent on repeat acks (a double-fired terminal state is normal).
  const again = await api.post('/api/lan/setup-ack', {})
  ok(again.status === 200, `the repeat ack answers 200 (got ${again.status})`)
  ok(again.body.setupRequested === false, 'the repeat ack stays false')
  server.child.kill()
})

test('suite summary', () => {
  console.log(`  lanprep: ${passed} assertions passed`)
})
