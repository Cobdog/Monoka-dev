// statusToken (component vocabulary task 4, Flux k2q0n9s) — the
// domain-qualified status→tone-token map. The four hand-rolled status→color
// maps (tile ring ladder, connection health, doctor severity, node-pack
// install state) collapsed into src/ui/statusToken.ts; this suite is the
// map's OWN contract:
//
//   (a) :root parse — src/styles.css's :root block is parsed AT RUN TIME and
//       every token the maps name must be DEFINED there. Membership is
//       proof of definition, not a hand-maintained constant (the r3
//       correction): a map entry naming an undefined variable reds here
//       even when the constant list would have agreed with itself.
//   (b) per-domain totality — every member of every domain vocabulary
//       returns a token pair, both defined; unknown statuses throw (the
//       discriminated union enforced at runtime, P11).
//   (c) normalization pins — where domains SHARE words, the normalized
//       token choices are pinned (connection online reads the PR-1a ghost
//       token --color-status-ok, not a second accent spelling).
//   (d) adapters — the three surface adapters (timeline strip, health
//       pill, tile live readout) name only defined tokens and only keys
//       from their domain vocabulary plus the documented extension words.
//   (e) the divergence table is EXHAUSTIVE — every adapter delta versus
//       its domain map has a DIVERGENCES row, every row matches a real
//       delta with the exact tokens both sides claim, and the human table
//       in the module header carries the same row count (no drift between
//       the prose table and the machine-checked data).
//   (f) bg discipline — bg mirrors fg everywhere except where the skin
//       defines a distinct background token (connection online's tint).
//
// Rendering is NOT this suite's business (vitest is node-env, P04): the
// browser-computed values are the Playwright side's authority.
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const { loadTs } = require('../scripts/lib/ts-vm.cjs')
const statusTokenModule = loadTs('src/ui/statusToken.ts')
const { statusToken, DIVERGENCES, TIMELINE_TONE, HEALTH_PILL_TONE, LIVE_READOUT_TONE } = statusTokenModule

// ---- (a) the :root parse ------------------------------------------------
//
// Extract every custom property NAME defined in src/styles.css's FIRST
// :root block (the token definitions). Aliased tokens (--color-status-ok:
// var(--accent)) count by NAME — that is what a consumer may reference.
function parseRootCustomProperties(cssPath) {
  const css = fs.readFileSync(cssPath, 'utf8')
  const start = css.indexOf(':root')
  if (start === -1) throw new Error('no :root block found in src/styles.css')
  const open = css.indexOf('{', start)
  let depth = 1
  let end = open + 1
  while (depth > 0 && end < css.length) {
    if (css[end] === '{') depth += 1
    if (css[end] === '}') depth -= 1
    end += 1
  }
  const block = css.slice(open + 1, end - 1)
  const names = new Set()
  const declaration = /(--[\w-]+)\s*:/g
  let match = declaration.exec(block)
  while (match !== null) {
    names.add(match[1])
    match = declaration.exec(block)
  }
  if (names.size < 40) throw new Error(`:root parse looks wrong — only ${names.size} custom properties found`)
  return names
}

const ROOT_VARS = parseRootCustomProperties(path.resolve(__dirname, '..', 'src', 'styles.css'))

const ok = (condition, label) => assert.ok(condition, label)

function assertDefinedToken(token, label) {
  ok(typeof token === 'string' && token.startsWith('--'), `${label}: "${String(token)}" is a custom-property name`)
  ok(ROOT_VARS.has(token), `${label}: "${token}" is DEFINED in src/styles.css :root (parsed at run time — membership proves definition)`)
}

function assertPairDefined(pair, label) {
  assertDefinedToken(pair.fg, `${label}.fg`)
  assertDefinedToken(pair.bg, `${label}.bg`)
}

// The domain vocabularies (the contract the maps must cover totally —
// TileStatus comes from src/canvas/derive.ts, the rest are defined by
// statusToken.ts itself).
const TILE_WORDS = ['failed', 'idle', 'queued-gpu', 'running', 'stale']
const CONNECTION_WORDS = ['degraded', 'offline', 'online']
const DOCTOR_WORDS = ['fail', 'ok', 'warn']
const INSTALL_WORDS = ['info', 'muted', 'ok', 'warn']
const DOMAINS = [
  { domain: 'tile', words: TILE_WORDS },
  { domain: 'connection', words: CONNECTION_WORDS },
  { domain: 'doctor', words: DOCTOR_WORDS },
  { domain: 'install', words: INSTALL_WORDS },
]

// ---- (a)+(b) totality + definition --------------------------------------

test('(a/b) every domain entry returns :root-DEFINED token names', () => {
  ok(ROOT_VARS.has('--color-status-ok'), 'the :root parse found the PR-1a ghost token (parse sanity)')
  ok(ROOT_VARS.has('--accent-soft'), 'the :root parse found --accent-soft (parse sanity)')
  for (const { domain, words } of DOMAINS) {
    for (const status of words) {
      const pair = statusToken({ domain, status })
      assertPairDefined(pair, `${domain}/${status}`)
    }
  }
})

test('(b) unknown statuses throw — the union is enforced at runtime', () => {
  assert.throws(() => statusToken({ domain: 'tile', status: 'exploded' }), /tile/, 'an unmapped tile status throws')
  assert.throws(() => statusToken({ domain: 'connection', status: 'flapping' }), /connection/, 'an unmapped connection status throws')
  assert.throws(() => statusToken({ domain: 'doctor', status: 'maybe' }), /doctor/, 'an unmapped doctor severity throws')
  assert.throws(() => statusToken({ domain: 'install', status: 'broken' }), /install/, 'an unmapped install status throws')
  assert.throws(() => statusToken({ domain: 'weather', status: 'ok' }), /unknown|weather/, 'an unknown domain throws (no silent fallback)')
})

test('(b) bare strings are not the interface — the discriminated union shape', () => {
  // A bare status string must not answer: statusToken receives a
  // domain-qualified object only (P11). Calling with a string throws
  // rather than resolving through some shared ladder.
  assert.throws(() => statusToken('running'), /domain|undefined|cannot read|not a function/i, 'a bare string status throws')
})

// ---- (c) normalization pins ---------------------------------------------

test('(c) shared words read their normalized tokens', () => {
  // The connection domain's "online" reads the PR-1a token (Task 2 aliased
  // it to the accent) — the health-pill's older --accent spelling
  // normalized onto it (value-equal through the alias, one name).
  eq(statusToken({ domain: 'connection', status: 'online' }).fg, '--color-status-ok', 'connection online fg is the ghost token')
  eq(statusToken({ domain: 'connection', status: 'online' }).bg, '--accent-soft', 'connection online bg is the pill\'s accent tint')
  eq(statusToken({ domain: 'connection', status: 'degraded' }).fg, '--warning', 'connection degraded keeps the warning token')
  eq(statusToken({ domain: 'connection', status: 'offline' }).fg, '--muted-2', 'connection offline (the engine chip\'s calm absence) is muted-2')
  // Doctor and install "ok" agree on the accent — same word, same tone.
  eq(statusToken({ domain: 'doctor', status: 'ok' }).fg, '--accent', 'doctor ok reads the accent')
  eq(statusToken({ domain: 'install', status: 'ok' }).fg, '--accent', 'install ok reads the accent (same word, same tone)')
})

// ---- (d) the surface adapters --------------------------------------------

test('(d) adapters name :root-defined tokens over in-vocabulary keys', () => {
  for (const status of TILE_WORDS.concat(['unseeded'])) {
    assertPairDefined(TIMELINE_TONE[status], `timeline/${status}`)
  }
  ok(Object.keys(TIMELINE_TONE).sort().join('|') === TILE_WORDS.concat(['unseeded']).sort().join('|'), 'the timeline adapter covers exactly TimelineItemStatus')
  for (const status of ['online', 'offline']) {
    assertPairDefined(HEALTH_PILL_TONE[status], `pill/${status}`)
  }
  ok(Object.keys(HEALTH_PILL_TONE).sort().join('|') === ['offline', 'online'].join('|'), 'the pill adapter covers exactly its online/offline vocabulary')
  for (const status of ['running', 'queued-gpu']) {
    assertPairDefined(LIVE_READOUT_TONE[status], `live/${status}`)
  }
  ok(Object.keys(LIVE_READOUT_TONE).sort().join('|') === ['queued-gpu', 'running'].join('|'), 'the live-readout adapter covers exactly its active window')
})

// ---- (e) the exhaustive divergence table ---------------------------------

test('(e) the divergence table is exhaustive — both directions, exact tokens', () => {
  const adapters = [
    { surface: 'timeline strip', domain: 'tile', map: TIMELINE_TONE, base: 'tile', extensionWords: ['unseeded'] },
    { surface: 'health pill', domain: 'connection', map: HEALTH_PILL_TONE, base: 'connection', extensionWords: [] },
    { surface: 'tile live readout', domain: 'tile', map: LIVE_READOUT_TONE, base: 'tile', extensionWords: [] },
  ]
  // The computed delta set: every (surface, shared word) whose adapter pair
  // differs from the domain map's pair.
  const computed = []
  for (const adapter of adapters) {
    const extension = new Set(adapter.extensionWords)
    for (const status of Object.keys(adapter.map)) {
      if (extension.has(status)) continue
      const mapPair = statusToken({ domain: adapter.base, status })
      const surfacePair = adapter.map[status]
      if (mapPair.fg !== surfacePair.fg || mapPair.bg !== surfacePair.bg) {
        computed.push(`${adapter.surface}|${status}|${mapPair.fg}->${surfacePair.fg}`)
      }
    }
  }
  const declared = DIVERGENCES.map((row) => `${row.surface}|${row.status}|${row.mapFg}->${row.surfaceFg}`)
  for (const delta of computed) {
    ok(declared.includes(delta), `undocumented divergence: ${delta} — every intentional difference needs a DIVERGENCES row (no forced equality, but no silent drift either)`)
  }
  for (const row of DIVERGENCES) {
    ok(typeof row.why === 'string' && row.why.length > 20, `divergence ${row.surface}/${row.status} carries a reason`)
    ok(row.mapFg !== row.surfaceFg, `divergence ${row.surface}/${row.status} actually diverges`)
    assertDefinedToken(row.mapFg, `divergence ${row.surface}/${row.status} mapFg`)
    assertDefinedToken(row.surfaceFg, `divergence ${row.surface}/${row.status} surfaceFg`)
    // The row's claimed tokens must match the real maps — the table cannot lie.
    const mapPair = statusToken({ domain: row.domain, status: row.status })
    eq(mapPair.fg, row.mapFg, `divergence ${row.surface}/${row.status}: mapFg matches the domain map`)
    const adapter = adapters.find((entry) => entry.surface === row.surface)
    ok(adapter, `divergence row names a known surface ("${row.surface}")`)
    eq(adapter.map[row.status].fg, row.surfaceFg, `divergence ${row.surface}/${row.status}: surfaceFg matches the adapter`)
    ok(computed.includes(`${row.surface}|${row.status}|${row.mapFg}->${row.surfaceFg}`), `divergence ${row.surface}/${row.status} is a REAL delta (no stale rows)`)
  }
  ok(DIVERGENCES.length >= 5, `the five known intentional divergences are all present (got ${DIVERGENCES.length})`)
})

test('(e) the human table in the module header stays in lockstep with the data', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui', 'statusToken.ts'), 'utf8')
  const headerEnd = source.indexOf('export type ConnectionStatus')
  ok(headerEnd > 0, 'the module header was found')
  const header = source.slice(0, headerEnd)
  const marker = header.indexOf('Intentional divergences')
  ok(marker !== -1, 'the header carries the divergence table section')
  const table = header.slice(marker)
  const rows = table.split('\n').filter((line) => /^\s*\*?\s*\|\s*\d/.test(line))
  eq(rows.length, DIVERGENCES.length, `the header table has one row per DIVERGENCES entry (${DIVERGENCES.length}) — keep the prose table in sync when the data changes`)
})

// ---- (f) bg discipline ----------------------------------------------------

test('(f) bg mirrors fg except where the skin defines a distinct background token', () => {
  for (const { domain, words } of DOMAINS) {
    for (const status of words) {
      const pair = statusToken({ domain, status })
      if (domain === 'connection' && status === 'online') {
        ok(pair.bg !== pair.fg, 'connection online keeps its distinct tint token')
      } else {
        eq(pair.bg, pair.fg, `${domain}/${status}: bg mirrors fg (no distinct background token in the skin)`)
      }
    }
  }
  for (const status of Object.keys(TIMELINE_TONE)) {
    eq(TIMELINE_TONE[status].bg, TIMELINE_TONE[status].fg, `timeline/${status}: bg mirrors fg`)
  }
  for (const status of Object.keys(HEALTH_PILL_TONE)) {
    if (status === 'online') {
      // The pill's online reuses the connection pair — distinct tint token.
      eq(HEALTH_PILL_TONE[status].bg, '--accent-soft', 'pill/online: bg is the connection tint')
    } else {
      eq(HEALTH_PILL_TONE[status].bg, HEALTH_PILL_TONE[status].fg, `pill/${status}: bg mirrors fg`)
    }
  }
})

// eq: plain scalar compare with the ported-suite console line (the VM-realm
// objects are compared field-by-field above; deepEqual across realms is
// unreliable by design — testing.md's harness pitfalls).
function eq(actual, expected, label) {
  assert.equal(actual, expected, label)
  console.log(`  ok - ${label}`)
}
