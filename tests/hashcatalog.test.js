// The hash-catalog data-plane suite (task to7xpa7, spec
// docs/specs/2026-10-17-hash-catalog.md §2, B1 ship-the-file).
//
// server/hashCatalog.json is the SHIPPED, APPEND-ONLY registry of known
// weights: sha256 → identity, the golden-registry pattern extended to model
// files. server/hashCatalog.ts is its typed loader (bySha + byAlias +
// knownSizes, built once at load). This suite polices the seam:
//
//   1. the loader builds both indexes from the shipped file (a real sha, a
//      real alias, the §6 size pre-filter's data — including a size two
//      rows SHARE);
//   2. a malformed or missing catalog degrades to the EMPTY catalog with ONE
//      honest log line — never a throw (the modularity degradation
//      contract: delete the file → today's behavior);
//   3. every seed row is DERIVED from FETCH_CATALOG (the seed-derivation
//      invariant — catches hand-drift between the two data files);
//   4. aliases are SECONDARY keys: one basename may map to many row ids
//      (the taeh3 same-name-different-bytes hazard, encoded);
//   5. the ci-map lockstep (a separate suite) names the new suite — enforced
//      by tests/ci-map.test.js test (1), which reds until the manifest
//      catalogs hashcatalog;
//   6. the append gate keeps server/hashCatalog.json append-only across
//      merges (rows by sha, gaps by repo|path) — exercised over a scratch
//      git repo pair of commits.

import { test, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync, execFileSync } from 'node:child_process'
import { logger } from '../server/logger'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')

const REPO = path.resolve(__dirname, '..')
const { makeScratchDir, removeAllScratchDirs } = require(path.join(REPO, 'tests', 'lib', 'scratch.cjs'))

afterAll(() => {
  void removeAllScratchDirs()
})

const ok = (cond, label) => assert.ok(cond, label)
const eq = (actual, expected, label) => assert.deepEqual(actual, expected, label)

/** The two real taeh3 artifacts (the fetch catalog's DATED CORRECTION,
 *  2026-09-22: same basename, different bytes). The fixture catalog carries
 *  them verbatim — the shipped file cannot (the simsim9 pack file is not a
 *  FETCH_CATALOG entry; its row is the crawl's business, task T2). */
const KIJAI_TAE_SHA = 'f0f60fa072089997f817402098c2fd90777cb2660dd79cf5df42fc1e3e08e527'
const KIJAI_TAE_BYTES = 9791388
const SIMSIM_TAE_SHA = '200b17f16fbdf2afbd4f5c70b8390d57225bd2671ec17dfe162ad0e866dff66c'
const SIMSIM_TAE_BYTES = 39458084

/** Runs loadHashCatalog() with MONOKA_HASH_CATALOG pointed at envValue
 *  (null = unset → the shipped file), restoring the env afterwards. */
async function loadWith(envValue) {
  const previous = process.env.MONOKA_HASH_CATALOG
  try {
    if (envValue === null) delete process.env.MONOKA_HASH_CATALOG
    else process.env.MONOKA_HASH_CATALOG = envValue
    const { loadHashCatalog } = await import('../server/hashCatalog')
    return loadHashCatalog()
  } finally {
    if (previous === undefined) delete process.env.MONOKA_HASH_CATALOG
    else process.env.MONOKA_HASH_CATALOG = previous
  }
}

test('(1) the loader builds both indexes from the shipped file', async () => {
  const catalog = await loadWith(null)
  ok(catalog.version === 1, 'the shipped envelope is version 1')
  ok(Array.isArray(catalog.gaps), 'the envelope carries a gaps array (empty at seed)')
  ok(catalog.rows.length >= 22, `the seed carries the 22 distinct FETCH_CATALOG shas (got ${catalog.rows.length})`)

  // The spec §2 example row, resolved by sha: the smhfacct hybrid.
  const hybrid = catalog.bySha.get('a629cfea8d89a071b140c6e1935dc9a23e72de6badc18975a2bb9e6d1423d76d')
  ok(hybrid, 'bySha resolves the smhfacct hybrid sha')
  eq(hybrid.identity, { family: 'minimax-h3', artifact: 'hybrid', variant: 'smhfacct-b25-49', quant: 'int8', dtype: 'int8' }, 'the hybrid row\'s identity matches the spec §2 example')
  eq(hybrid.sizeBytes, 20970379632, 'the hybrid row\'s size pin')
  eq(hybrid.kind, 'diffusion_models', 'the hybrid row lands in diffusion_models')

  // byAlias: the publisher basename, lowercased at the index.
  const turbo8 = catalog.byAlias.get('minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors')
  eq(turbo8, ['08cfe946033af7d27719b964b6e0a0e50c32138daabbd6ce4137e23df6bf9980'], 'byAlias maps the lightx2v 8-step basename to its row id')

  // knownSizes: the §6 size pre-filter's data. The T=1 image VAE shares its
  // size bracket with the (crawl-landed) musubi video VAE 304 bytes away;
  // today's seed carries the T=1 leg. And the two lightx2v turbo LoRAs share
  // ONE size outright — the disambiguation-by-other-key case the pre-filter
  // must survive.
  ok(catalog.knownSizes.has(5207808784), 'knownSizes carries the T=1 image VAE size (the 304-byte pair\'s seed leg)')
  ok(catalog.knownSizes.has(1956193000), 'knownSizes carries the lightx2v shared size')
  eq(catalog.bySha.get('08cfe946033af7d27719b964b6e0a0e50c32138daabbd6ce4137e23df6bf9980')?.sizeBytes, 1956193000, 'the 8-step row\'s size')
  eq(catalog.bySha.get('c8168ebc17bbacc4296103dda2fec1ba85b24392fa08cf2bfbcef0cff0dc3cc8')?.sizeBytes, 1956193000, 'the 4-step row\'s size — identical bytes-count, different sha')

  // One basename, two rows — in the SHIPPED file (the VDN default adapter is
  // the same basename in both stages; the turbo adapter is stage-specific).
  eq(catalog.byAlias.get('adapter_model.safetensors'), ['24fc93c82fe84dc45d0627f4e72c637bc387d282ba18f60ed3b7f8c81089392c', '58558fef506f88bb41649242de9b9b3a365da806b51b2e96afbbe1625222058a'], 'the shared VDN adapter basename maps to BOTH row ids')
})

test('(2) a malformed or missing catalog degrades to empty, never throws', async () => {
  const scratch = makeScratchDir(path.join(os.tmpdir(), 'monoka-hashcatalog-degrade-'))
  const badJson = path.join(scratch, 'bad.json')
  fs.writeFileSync(badJson, 'this is not json at all {{{')
  const missing = path.join(scratch, 'never-written.json')
  const wrongVersion = path.join(scratch, 'wrong-version.json')
  fs.writeFileSync(wrongVersion, JSON.stringify({ version: 7, generatedAt: 'x', crawl: [], gaps: [], rows: [] }))
  const rowsNotArray = path.join(scratch, 'rows-not-array.json')
  fs.writeFileSync(rowsNotArray, JSON.stringify({ version: 1, rows: 'nope' }))

  const warnCalls = []
  const originalWarn = logger.warn
  logger.warn = (...args) => {
    warnCalls.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a ?? ''))).join(' '))
  }
  try {
    for (const [label, envValue] of [['a non-JSON file', badJson], ['a missing file', missing], ['an unknown envelope version', wrongVersion], ['a rows-not-array shape', rowsNotArray]]) {
      const catalog = await loadWith(envValue)
      eq(catalog.rows, [], `${label}: rows degrade to empty`)
      eq(catalog.gaps, [], `${label}: gaps degrade to empty`)
      eq(catalog.bySha.size, 0, `${label}: bySha empty`)
      eq(catalog.byAlias.size, 0, `${label}: byAlias empty`)
      eq(catalog.knownSizes.size, 0, `${label}: knownSizes empty`)
    }
    // ONE honest log line per degraded load — never silent, never a stack.
    eq(warnCalls.length, 4, `exactly one warn per degraded load (got ${warnCalls.length})`)
    for (const line of warnCalls) ok(/hash catalog/i.test(line), `the warn names the hash catalog: ${line}`)
  } finally {
    logger.warn = originalWarn
  }

  // The healthy default (env unset, shipped file present) loads WITHOUT a warn.
  warnCalls.length = 0
  const shipped = await loadWith(null)
  ok(shipped.rows.length > 0, 'the shipped file loads with rows')
  eq(warnCalls.length, 0, 'the healthy load is silent')
})

test('(3) every seed row matches its FETCH_CATALOG source (the seed-derivation invariant)', async () => {
  const { FETCH_CATALOG } = await import('../server/fetchCatalog')
  const catalog = await loadWith(null)

  // Walk the fetch catalog exactly as the seed was derived: model-root
  // entries, live (not removedAt), files carrying a sha256 pin.
  const expected = new Map()
  for (const entry of FETCH_CATALOG) {
    if (entry.removedAt) continue
    if (entry.destination.kind !== 'model-root') continue
    for (const file of entry.files ?? []) {
      if (!file.sha256) continue
      const alias = path.basename(file.path)
      const prior = expected.get(file.sha256)
      if (!prior) {
        expected.set(file.sha256, {
          sizeBytes: file.sizeBytes,
          repo: entry.source.kind === 'hf' ? entry.source.repo : entry.source.url,
          revision: entry.source.revision.value,
          kind: entry.destination.root,
          path: file.path,
          aliases: new Set([alias]),
        })
      } else {
        // The same sha fetched under both VDN stages: sizes must agree, the
        // alias set unions, the ROW keeps the first path in walk order.
        eq(prior.sizeBytes, file.sizeBytes, `shared sha ${file.sha256.slice(0, 8)}: both records agree on size`)
        prior.aliases.add(alias)
      }
    }
  }
  eq(expected.size, 22, 'the FETCH_CATALOG walk yields 22 distinct shas')
  eq(catalog.bySha.size, expected.size, 'the shipped catalog is EXACTLY the derivation today (the crawl grows it in T2 and updates this)')

  for (const [sha, want] of expected) {
    const row = catalog.bySha.get(sha)
    ok(row, `seed row present for ${sha.slice(0, 8)}`)
    eq(row.sizeBytes, want.sizeBytes, `${sha.slice(0, 8)}: sizeBytes`)
    eq(row.source.repo, want.repo, `${sha.slice(0, 8)}: source.repo`)
    eq(row.source.revision, want.revision, `${sha.slice(0, 8)}: source.revision`)
    eq(row.kind, want.kind, `${sha.slice(0, 8)}: kind is the destination root`)
    eq(row.source.path, want.path, `${sha.slice(0, 8)}: source.path is the first FETCH_CATALOG path for the sha`)
    eq([...row.aliases].sort(), [...want.aliases].sort(), `${sha.slice(0, 8)}: aliases are the publisher basenames`)
    ok(/^\d{4}-\d{2}-\d{2}$/.test(row.addedAt), `${sha.slice(0, 8)}: addedAt is a date`)
    for (const key of ['family', 'artifact', 'variant', 'quant', 'dtype']) {
      ok(typeof row.identity[key] === 'string' && row.identity[key].length > 0, `${sha.slice(0, 8)}: identity.${key} is a non-empty string`)
    }
  }
})

test('(4) aliases are secondary keys: one basename maps to many row ids (the taeh3 hazard)', async () => {
  // The fetch catalog's DATED CORRECTION encoded as data: Kijai's TAE
  // decoder and the simsim9 pack's same-named decoder are DIFFERENT
  // artifacts — the alias alone must never collapse them.
  const fixture = makeScratchDir(path.join(os.tmpdir(), 'monoka-hashcatalog-taeh3-'))
  const catalogPath = path.join(fixture, 'hashCatalog.json')
  const row = (sha, sizeBytes) => ({
    sha256: sha,
    sizeBytes,
    kind: 'vae_approx',
    identity: { family: 'minimax-h3', artifact: 'preview-decoder', variant: sha === KIJAI_TAE_SHA ? 'kijai-tae' : 'simsim9-pack', quant: 'unknown', dtype: 'unknown' },
    source: { repo: sha === KIJAI_TAE_SHA ? 'Kijai/MiniMax-H3-TAE' : 'simsim9/MiniMaxH3-PreviewOverride', revision: 'pinned', path: 'taeh3_decoder.safetensors' },
    aliases: ['taeh3_decoder.safetensors'],
    addedAt: '2026-10-20',
  })
  fs.writeFileSync(catalogPath, JSON.stringify({ version: 1, generatedAt: '2026-10-20', crawl: [], gaps: [], rows: [row(KIJAI_TAE_SHA, KIJAI_TAE_BYTES), row(SIMSIM_TAE_SHA, SIMSIM_TAE_BYTES)] }, null, 2))

  const catalog = await loadWith(catalogPath)
  eq(catalog.byAlias.get('taeh3_decoder.safetensors'), [KIJAI_TAE_SHA, SIMSIM_TAE_SHA].sort(), 'ONE basename maps to TWO row ids')
  eq(catalog.bySha.get(KIJAI_TAE_SHA)?.sizeBytes, KIJAI_TAE_BYTES, 'bySha still resolves each row\'s own size (9,791,388)')
  eq(catalog.bySha.get(SIMSIM_TAE_SHA)?.sizeBytes, SIMSIM_TAE_BYTES, 'bySha still resolves each row\'s own size (39,458,084)')
  ok(catalog.knownSizes.has(KIJAI_TAE_BYTES) && catalog.knownSizes.has(SIMSIM_TAE_BYTES), 'knownSizes carries both sizes')
})

// ---------------------------------------------------------------------------
// (6) The append gate — scripts/check-registry-append.cjs over a scratch git
// repo. Each leg builds its own pair of commits so a failure names its leg.
// ---------------------------------------------------------------------------

const APPEND_SCRIPT = path.join(REPO, 'scripts', 'check-registry-append.cjs')
const CATALOG_IN_REPO = 'server/hashCatalog.json'

function gitIn(dir, ...args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
}

function initScratchRepo(scratch) {
  gitIn(scratch, 'init', '-q')
  gitIn(scratch, 'config', 'user.email', 'tests@monoka.local')
  gitIn(scratch, 'config', 'user.name', 'hashcatalog tests')
  gitIn(scratch, 'config', 'commit.gpgsign', 'false')
  fs.writeFileSync(path.join(scratch, 'README.md'), '# scratch\n')
  gitIn(scratch, 'add', 'README.md')
  gitIn(scratch, 'commit', '-q', '-m', 'init')
}

function commitCatalog(scratch, json, message) {
  fs.mkdirSync(path.join(scratch, 'server'), { recursive: true })
  fs.writeFileSync(path.join(scratch, CATALOG_IN_REPO), json)
  gitIn(scratch, 'add', CATALOG_IN_REPO)
  gitIn(scratch, 'commit', '-q', '-m', message)
}

const identity = { family: 'minimax-h3', artifact: 'preview-decoder', variant: 'v', quant: 'unknown', dtype: 'unknown' }
const testRow = (sha) => ({ sha256: sha, sizeBytes: 10, kind: 'loras', identity, source: { repo: 'r/repo', revision: 'rev0', path: `${sha.slice(0, 6)}.safetensors` }, aliases: [`${sha.slice(0, 6)}.safetensors`], addedAt: '2026-10-20' })
const testGap = (repo, pathValue) => ({ repo, revision: 'rev0', path: pathValue, kind: 'vae', identity, reason: 'oid-masked-anonymous', addedAt: '2026-10-20' })
const catalogJson = (rows, gaps = []) => `${JSON.stringify({ version: 1, generatedAt: '2026-10-20', crawl: [], gaps, rows }, null, 2)}\n`

const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)
const SHA_C = 'c'.repeat(64)

/** Commits oldJson then newJson in a fresh scratch repo and runs the append
 *  gate HEAD~1 → HEAD. Returns { status, stdout, stderr }. */
function runAppendGate(oldJson, newJson) {
  const scratch = makeScratchDir(path.join(os.tmpdir(), 'monoka-hashcatalog-gate-'))
  initScratchRepo(scratch)
  if (oldJson !== null) commitCatalog(scratch, oldJson, 'old')
  if (newJson !== null) commitCatalog(scratch, newJson, 'new')
  const result = spawnSync(process.execPath, [APPEND_SCRIPT, 'HEAD~1', 'HEAD'], { cwd: scratch, encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

test('(6a) the append gate passes an appended row and an appended gap', () => {
  const appended = runAppendGate(
    catalogJson([testRow(SHA_A), testRow(SHA_B)]),
    catalogJson([testRow(SHA_A), testRow(SHA_B), testRow(SHA_C)], [testGap('gated/repo', 'masked/file.safetensors')]),
  )
  eq(appended.status, 0, `an append is free (stderr: ${appended.stderr})`)
  ok(/OK/.test(appended.stdout), 'the OK line names the catalog')
})

test('(6b) the append gate refuses a removed row — including a sha change', () => {
  // A pure removal...
  const removed = runAppendGate(
    catalogJson([testRow(SHA_A), testRow(SHA_B), testRow(SHA_C)]),
    catalogJson([testRow(SHA_A), testRow(SHA_B)]),
  )
  ok(removed.status !== 0, 'a removed row fails the gate')
  ok(removed.stderr.includes(SHA_C), 'the failure names the vanished sha')
  ok(/APPEND-ONLY/.test(removed.stderr), 'the failure states the contract')

  // ...and a "modification" is a removal in key terms (a different sha on
  // the same path is a DIFFERENT artifact — the same-name-different-bytes
  // hazard again — so it must refuse too).
  const changed = runAppendGate(
    catalogJson([testRow(SHA_A), testRow(SHA_B)]),
    catalogJson([{ ...testRow(SHA_A), sha256: 'd'.repeat(64) }, testRow(SHA_B)]),
  )
  ok(changed.status !== 0, 'a changed row sha fails the gate')
  ok(changed.stderr.includes(SHA_A), 'the failure names the replaced sha')
})

test('(6c) the append gate refuses a removed gap', () => {
  const gap = testGap('gated/repo', 'masked/file.safetensors')
  const removed = runAppendGate(catalogJson([testRow(SHA_A)], [gap]), catalogJson([testRow(SHA_A)]))
  ok(removed.status !== 0, 'a removed gap fails the gate')
  ok(removed.stderr.includes('gated/repo|masked/file.safetensors'), 'the failure names the gap key (repo|path)')
})

test('(6d) the append gate accepts the catalog\'s FIRST landing (absent at the old ref)', () => {
  const scratch = makeScratchDir(path.join(os.tmpdir(), 'monoka-hashcatalog-gate-'))
  initScratchRepo(scratch)
  commitCatalog(scratch, catalogJson([testRow(SHA_A)]), 'the catalog lands')
  const result = spawnSync(process.execPath, [APPEND_SCRIPT, 'HEAD~1', 'HEAD'], { cwd: scratch, encoding: 'utf8' })
  eq(result.status, 0, `the first landing has nothing to remove (stderr: ${result.stderr})`)
})
