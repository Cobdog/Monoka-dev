// The MONOKA rename-sweep Task 2 suite (Flux campaign xmmaynx): the
// localStorage key migration, the data-home move, and the wiring that puts
// both ahead of every reader.
//
//   (A) the one-time key copy (src/lib/storageKeyMigration.ts): every legacy
//       `minimax.*` data key copies to its `monoka.*` name ONCE — only when
//       the new key is absent (the new key is newer truth and wins on
//       divergence), old keys stay in place un-read (removal is the
//       maintainer's browser action), and the `monoka.storage-migrated`
//       marker makes the pass idempotent: a second boot never re-copies over
//       data the app has since written. Scratch keys (wizard / first-run
//       dismiss / dbg) hard-renamed with NO copy by design (re-showing the
//       wizard is benign) — pinned by their absence from the map.
//   (B) the data-home move (server/dataHome.ts): ~/.minimax-studio RENAMES
//       to ~/.monoka once (rename(2), content intact); a pre-existing target
//       is a LOUD refusal naming both paths (never merge, R5); fresh
//       installs and explicit custom homes never move anything.
//   (C) the wiring pins: server/index.ts performs the move BEFORE it creates
//       the home (before db open); src/main.tsx runs the key migration as
//       the first storage-touching statement (before any reader mounts).
//
// No server boot, no ports (source-level VM discipline like the storage
// suite's migration sections). Scratch homes ride the Wave 4 ledger
// (tests/lib/scratch.cjs).
import { test, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const REPO = require('node:path').resolve(__dirname, '..')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')
const vm = require('node:vm')
const { makeScratchDir, removeAllScratchDirs } = require('./lib/scratch.cjs')
afterAll(() => { void removeAllScratchDirs() })

let assertions = 0
const ok = (condition, label) => {
  assert.ok(condition, label)
  assertions += 1
  console.log(`  ok - ${label}`)
}

// ---- VM harness (client + standalone server modules are TS sources) -------
function transpile(filePath) {
  const code = fs.readFileSync(path.join(REPO, filePath), 'utf8')
  return ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
}

function loadModule(filePath, extraGlobals = {}) {
  const exports = {}
  vm.runInNewContext(transpile(filePath), {
    exports,
    require,
    console,
    Buffer,
    URL,
    ...extraGlobals,
  })
  return exports
}

// ---- (A) the one-time key copy ---------------------------------------------
const LEGACY_KEYS = {
  'minimax.hair-style-projects': JSON.stringify([{ id: 'h1', name: 'Hair' }]),
  'minimax.wardrobe-projects': JSON.stringify([{ id: 'w1', name: 'Wardrobe', accessories: ['a watch'] }]),
  'minimax.location-projects': JSON.stringify([{ id: 'l1', name: 'Location' }]),
  'minimax.character-projects': JSON.stringify([{ id: 'c1', name: 'Vera' }]),
  'minimax.accessory-projects': JSON.stringify([{ id: 'a1', name: 'Accessory' }]),
  'minimax.accessories-migrated-from-wardrobe-v1': '1',
  'minimax.prompt-library': JSON.stringify([{ id: 'p1', prompt: 'a lantern-lit courtyard at dusk' }]),
  'minimax.jobs': JSON.stringify([{ id: 'job-1', status: 'completed' }]),
  'minimax.workspace': JSON.stringify({ mode: 'text', prompt: 'neon rain' }),
  'minimax.movie-projects': JSON.stringify([{ id: 'mp-1', title: 'Legacy cut' }]),
  'minimax.data-migrated': '1',
}
const NEW_KEYS = Object.fromEntries(Object.keys(LEGACY_KEYS).map((key) => [key.replace(/^minimax\./, 'monoka.'), null]))
const MARKER = 'monoka.storage-migrated'

function storageStubFrom(initial) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: (key) => { store.delete(key) },
    _store: store,
  }
}

function loadKeyMigration() {
  return loadModule('src/lib/storageKeyMigration.ts')
}

test('(A) the one-time key copy: legacy data follows to the monoka.* names', () => {
  console.log('rename-home: storage key copy — legacy data follows')
  const storage = storageStubFrom(LEGACY_KEYS)
  const { runStorageKeyMigration } = loadKeyMigration()
  runStorageKeyMigration(storage)
  for (const [legacyKey, value] of Object.entries(LEGACY_KEYS)) {
    const newKey = legacyKey.replace(/^minimax\./, 'monoka.')
    ok(storage.getItem(newKey) === value, `legacy data copied forward: ${legacyKey} -> ${newKey}`)
  }
  ok(storage.getItem(MARKER) === '1', 'the monoka.storage-migrated marker is set after the copy')
})

test('(A) divergence: the new key is newer truth and is never overwritten', () => {
  console.log('rename-home: storage key copy — new key wins on divergence')
  const storage = storageStubFrom({
    ...LEGACY_KEYS,
    'monoka.character-projects': JSON.stringify([{ id: 'newer', name: 'Post-rename entry' }]),
    'monoka.jobs': JSON.stringify([{ id: 'job-new', status: 'running' }]),
  })
  const { runStorageKeyMigration } = loadKeyMigration()
  runStorageKeyMigration(storage)
  ok(storage.getItem('monoka.character-projects').includes('newer'), 'divergent monoka.character-projects never overwritten')
  ok(storage.getItem('monoka.jobs').includes('job-new'), 'divergent monoka.jobs never overwritten')
  ok(!storage.getItem('monoka.character-projects').includes('c1'), 'the stale legacy value did not leak into the new key')
})

test('(A) idempotent: the second boot never re-copies over app-written data', () => {
  console.log('rename-home: storage key copy — idempotence via the marker')
  const storage = storageStubFrom(LEGACY_KEYS)
  const { runStorageKeyMigration } = loadKeyMigration()
  runStorageKeyMigration(storage)
  // The app (post-rename boot) writes newer truth under the new keys; a
  // stale legacy read must never clobber it.
  storage.setItem('monoka.jobs', JSON.stringify([{ id: 'job-after-boot', status: 'completed' }]))
  runStorageKeyMigration(storage)
  ok(storage.getItem('monoka.jobs').includes('job-after-boot'), 'second run left the newer app-written value alone')
  // The old keys stay in place un-read (the maintainer's browser action removes them).
  for (const legacyKey of Object.keys(LEGACY_KEYS)) {
    ok(storage._store.has(legacyKey), `old key left in place, un-read: ${legacyKey}`)
  }
})

test('(A) a fresh browser copies nothing but still marks the pass done', () => {
  console.log('rename-home: storage key copy — fresh install')
  const storage = storageStubFrom({})
  const { runStorageKeyMigration } = loadKeyMigration()
  runStorageKeyMigration(storage)
  ok(storage.getItem(MARKER) === '1', 'marker set on a fresh browser (the pass runs once)')
  for (const newKey of Object.keys(NEW_KEYS)) {
    ok(storage.getItem(newKey) === null, `no phantom data created for ${newKey}`)
  }
})

test('(A) quota-blocked copy: no marker, the next boot retries', () => {
  console.log('rename-home: storage key copy — degraded storage retries')
  const store = new Map(Object.entries({ 'minimax.jobs': LEGACY_KEYS['minimax.jobs'] }))
  let failures = 0
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      if (key === MARKER) { failures += 1; throw new Error('QuotaExceededError') }
      store.set(key, String(value))
    },
  }
  const { runStorageKeyMigration } = loadKeyMigration()
  runStorageKeyMigration(storage)
  ok(store.get('monoka.jobs') === LEGACY_KEYS['minimax.jobs'], 'the copy itself landed before the marker write failed')
  ok(failures === 1 && storage.getItem(MARKER) === null, 'no marker on a failed marker-write: the copy retries next boot')
})

test('(A) the scratch keys are absent from the copy map (hard rename, no copy)', () => {
  console.log('rename-home: storage key copy — scratch keys stay out')
  const source = fs.readFileSync(path.join(REPO, 'src/lib/storageKeyMigration.ts'), 'utf8')
  ok(!source.includes('minimax.wizard'), 'the wizard key is not in the copy map (re-showing the wizard is benign)')
  ok(!source.includes('minimax.first-run-dismissed'), 'the dismiss key is not in the copy map')
  ok(!source.includes("'minimax-dbg'"), 'the dbg key is not in the copy map')
})

// ---- (B) the data-home move -------------------------------------------------
function loadMoveDataHome() {
  return loadModule('server/dataHome.ts')
}

function seedLegacyHome(dir) {
  fs.mkdirSync(path.join(dir, 'minimax-studio'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'minimax-studio', 'settings.json'), JSON.stringify({ comfyUrl: 'http://127.0.0.1:8189', outputDirectory: '/legacy/out' }))
  fs.writeFileSync(path.join(dir, 'minimax-studio', 'lan-access-token.txt'), 'token-bytes')
  return path.join(dir, 'minimax-studio')
}

test('(B) the home move: legacy home renames to the new home, content intact', () => {
  console.log('rename-home: data home — the one-time move')
  const dir = makeScratchDir(path.join(os.tmpdir(), 'monoka-rename-home-move-'))
  const legacyHome = seedLegacyHome(dir)
  const home = path.join(dir, 'monoka')
  const { moveDataHome } = loadMoveDataHome()
  moveDataHome({ home, defaultHome: home, legacyHome })
  ok(fs.existsSync(path.join(home, 'settings.json')), 'settings.json follows to the new home')
  ok(fs.readFileSync(path.join(home, 'lan-access-token.txt'), 'utf8') === 'token-bytes', 'content byte-intact after the move')
  ok(!fs.existsSync(legacyHome), 'the old home is gone (a rename, not a copy)')
})

test('(B) target exists: LOUD refusal naming both paths, nothing merged', () => {
  console.log('rename-home: data home — target-exists refusal (R5)')
  const dir = makeScratchDir(path.join(os.tmpdir(), 'monoka-rename-home-clash-'))
  const legacyHome = seedLegacyHome(dir)
  const home = path.join(dir, 'monoka')
  fs.mkdirSync(home)
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ comfyUrl: 'http://127.0.0.1:9999' }))
  const { moveDataHome } = loadMoveDataHome()
  let refused = null
  try {
    moveDataHome({ home, defaultHome: home, legacyHome })
  } catch (error) {
    refused = error
  }
  ok(refused !== null, 'a pre-existing target refuses the move')
  // NOTE: cross-realm (the VM harness's Error is not this realm's) — check
  // duck-typed, never instanceof.
  ok(typeof refused?.message === 'string' && refused.message.includes(legacyHome) && refused.message.includes(home), `the refusal names BOTH paths\n    got: ${refused && refused.message}`)
  ok(fs.existsSync(path.join(legacyHome, 'settings.json')), 'the legacy home is untouched (never merged)')
  ok(fs.readFileSync(path.join(home, 'settings.json'), 'utf8').includes('9999'), 'the existing target is untouched (never overwritten)')
})

test('(B) rename failure surfaces as the same loud refusal', () => {
  console.log('rename-home: data home — rename(2) failure path')
  const dir = makeScratchDir(path.join(os.tmpdir(), 'monoka-rename-home-exdev-'))
  const legacyHome = seedLegacyHome(dir)
  const home = path.join(dir, 'monoka')
  const { moveDataHome } = loadMoveDataHome()
  let refused = null
  try {
    moveDataHome({ home, defaultHome: home, legacyHome, rename: () => { const e = new Error('cross-device link'); e.code = 'EXDEV'; throw e } })
  } catch (error) {
    refused = error
  }
  ok(refused !== null && refused.message.includes(legacyHome) && refused.message.includes(home), `a failing rename refuses loudly with both paths\n    got: ${refused && refused.message}`)
  ok(fs.existsSync(path.join(legacyHome, 'settings.json')), 'the legacy home survives a failed move (no data dropped)')
})

test('(B) fresh install: no legacy home, nothing happens', () => {
  console.log('rename-home: data home — fresh install default')
  const dir = makeScratchDir(path.join(os.tmpdir(), 'monoka-rename-home-fresh-'))
  const home = path.join(dir, 'monoka')
  const { moveDataHome } = loadMoveDataHome()
  moveDataHome({ home, defaultHome: home, legacyHome: path.join(dir, 'minimax-studio') })
  ok(!fs.existsSync(home), 'a fresh install creates nothing (the boot mkdir still owns creation)')
})

test('(B) explicit custom home: the operator path stands, no move', () => {
  console.log('rename-home: data home — explicit MONOKA_HOME never moves')
  const dir = makeScratchDir(path.join(os.tmpdir(), 'monoka-rename-home-custom-'))
  const legacyHome = seedLegacyHome(dir)
  const defaultHome = path.join(dir, 'monoka')
  const customHome = path.join(dir, 'custom', 'monoka-home')
  const { moveDataHome } = loadMoveDataHome()
  moveDataHome({ home: customHome, defaultHome, legacyHome })
  ok(fs.existsSync(path.join(legacyHome, 'settings.json')), 'the legacy default home is untouched under an explicit home')
  ok(!fs.existsSync(customHome), 'the explicit home was not created by the move')
})

test('(B) already moved: no legacy home, the existing new home stands', () => {
  console.log('rename-home: data home — second boot after a completed move')
  const dir = makeScratchDir(path.join(os.tmpdir(), 'monoka-rename-home-done-'))
  const home = path.join(dir, 'monoka')
  fs.mkdirSync(home)
  fs.writeFileSync(path.join(home, 'settings.json'), '{}')
  const { moveDataHome } = loadMoveDataHome()
  moveDataHome({ home, defaultHome: home, legacyHome: path.join(dir, 'minimax-studio') })
  ok(fs.existsSync(path.join(home, 'settings.json')), 'the already-migrated home is left alone')
})

// ---- (C) the wiring pins -----------------------------------------------------
test('(C) server/index.ts moves the home BEFORE creating it / opening the db', () => {
  console.log('rename-home: wiring — index.ts move precedes mkdir + db open')
  const source = fs.readFileSync(path.join(REPO, 'server/index.ts'), 'utf8')
  ok(/moveDataHome\(/.test(source), 'index.ts calls moveDataHome')
  const moveAt = source.search(/moveDataHome\(/)
  const mkdirAt = source.indexOf('mkdirSync(')
  const studioAt = source.indexOf('createStudioServer(')
  ok(moveAt !== -1 && mkdirAt !== -1 && moveAt < mkdirAt, 'the move runs before the home mkdir (a pre-created target would refuse every boot)')
  ok(moveAt !== -1 && studioAt !== -1 && moveAt < studioAt, 'the move runs before createStudioServer (before db open)')
  ok(source.includes(".monoka'"), 'the default home resolves to ~/.monoka')
})

test('(C) src/main.tsx runs the key migration ahead of every storage reader', () => {
  console.log('rename-home: wiring — main.tsx migration precedes the readers')
  const source = fs.readFileSync(path.join(REPO, 'src/main.tsx'), 'utf8')
  const callAt = source.search(/runStorageKeyMigration\(/)
  ok(callAt !== -1, 'main.tsx calls runStorageKeyMigration')
  const apiAt = source.indexOf('installWebApiClient()')
  const renderAt = source.indexOf('createRoot(')
  ok(callAt < apiAt, 'the migration runs before the api client installs (the first app side effect)')
  ok(callAt < renderAt, 'the migration runs before React mounts (every reader mounts after it)')
})

console.log(`rename-home: ${assertions} assertions across the storage-copy, home-move, and wiring sections`)
