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
  // The landed classification table (scripts/lib/hash-catalog-identities.cjs)
  // — the durable artifact T2's manifest extends. The shipped json must
  // agree with it row for row, so table and artifact cannot drift apart.
  const { classify } = require(path.join(REPO, 'scripts', 'lib', 'hash-catalog-identities.cjs'))
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
  // T2's crawl SUPERSEDES the seed (task to7xpa7): the shipped catalog is a
  // SUPERSET of the FETCH_CATALOG derivation — the crawl widens variants and
  // adds repos — so the T1-scoped exact-22 pin retires to this superset
  // check. The per-row assertions below still police every derivation row.
  ok(catalog.bySha.size >= expected.size, `the shipped catalog is a SUPERSET of the derivation (got ${catalog.bySha.size}, derivation ${expected.size})`)

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
    // Table lockstep: the landed classification table places every seed row
    // identically (a table MISS here means the crawler's rules and the
    // shipped artifact have diverged).
    const classified = classify(want.repo, want.path)
    ok(classified, `${sha.slice(0, 8)}: the landed table classifies ${want.repo} · ${want.path}`)
    eq(row.identity, { family: classified[0], artifact: classified[1], variant: classified[2], quant: classified[3], dtype: classified[4] }, `${sha.slice(0, 8)}: identity matches the landed table`)
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

test('(6e) the append gate refuses to vacuously pass (no fixture class matched)', () => {
  // A repo with NEITHER the goldens NOR the catalog at either ref: the gate
  // checked nothing, and a silent exit 0 there would green-light a merge
  // whose fixture contract was never evaluated.
  const scratch = makeScratchDir(path.join(os.tmpdir(), 'monoka-hashcatalog-gate-'))
  initScratchRepo(scratch)
  const result = spawnSync(process.execPath, [APPEND_SCRIPT, 'HEAD~1', 'HEAD'], { cwd: scratch, encoding: 'utf8' })
  ok(result.status !== 0, 'checking nothing fails the gate')
  ok(/no fixture/i.test(result.stderr), `the error names the vacuous-skip condition (stderr: ${result.stderr})`)
})

test('(7) the BUILT loader resolves the catalog from the dist-server layout', () => {
  // The fix-round regression test for the built-layout Critical: the
  // compiled module lives at <repo>/dist-server/server/, and the repo's
  // catalog is a SIBLING of dist-server (<repo>/server/), never an
  // ancestor — the ancestor-only walk ENOENTs forever in production while
  // staying green in vitest (which imports the TS source, where
  // beside-module hits). Verified end-to-end through PLAIN NODE against the
  // built module — the gate builds the server dist before this suite (the
  // ci-map 'server' build tier), so the built artifact is the real thing.
  const builtModule = path.join(REPO, 'dist-server', 'server', 'hashCatalog.js')
  ok(fs.existsSync(builtModule), `the built loader exists at ${builtModule} — run pnpm build:server (the gate builds it before the suite)`)

  // Plain-node probe: writes its result to a file so the pino warn stream
  // (stdout) cannot corrupt the JSON, and runs WITHOUT
  // MONOKA_HASH_CATALOG — the production resolution path.
  const resultPath = path.join(makeScratchDir(path.join(os.tmpdir(), 'monoka-hashcatalog-built-')), 'probe.json')
  const probe = `
    const { loadHashCatalog, resolveHashCatalogPath } = require(${JSON.stringify(builtModule)})
    const catalog = loadHashCatalog()
    require('node:fs').writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({
      resolved: resolveHashCatalogPath({}),
      rows: catalog.rows.length,
      hybridPresent: catalog.bySha.has('a629cfea8d89a071b140c6e1935dc9a23e72de6badc18975a2bb9e6d1423d76d'),
    }))
  `
  const childEnv = { ...process.env }
  delete childEnv.MONOKA_HASH_CATALOG
  const result = spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8', env: childEnv })
  eq(result.status, 0, `the built loader loads under plain node (stderr: ${result.stderr})`)
  const probeResult = JSON.parse(fs.readFileSync(resultPath, 'utf8'))
  eq(probeResult.resolved, path.join(REPO, 'server', 'hashCatalog.json'), `the built layout resolves the APPEND-GATED source copy (got ${probeResult.resolved})`)
  ok(probeResult.rows >= 22, `the built loader serves the seed rows (got ${probeResult.rows})`)
  ok(probeResult.hybridPresent, 'the built loader resolves the smhfacct hybrid sha')
})

// ---------------------------------------------------------------------------
// (8) The crawl generator — scripts/crawl-hash-catalog.mjs (T2, the crawl).
//
// The generator MERGES into the shipped file (spec §3 determinism): a repo
// whose crawled content set is unchanged keeps its recorded fetchedAt, a
// changed repo re-stamps only itself, new rows append in canonical sha
// order, and masked oids land as gaps — never a guessed sha. Change
// detection needs no stored fingerprint: the previous envelope's own
// rows+gaps for a repo reconstruct its candidate set ([sha, size] pairs,
// a sentinel for masked gaps), so legacy seed entries and fresh entries
// compare under one deterministic rule. These legs run over FIXTURE tree
// payloads (the --from-fixtures seam; NO network in this suite); legs
// (8d/8e) also police the SHIPPED artifact against the manifest and the
// classification table — satisfiable only once the real run has landed.
// ---------------------------------------------------------------------------

const D1 = '2026-11-01'
const D2 = '2026-11-02'
const D3 = '2026-11-03'
const MASKED_OID = '*'.repeat(64)

const crawlMod = () => import('../scripts/crawl-hash-catalog.mjs')
const hfFile = (p, oid, size) => ({ type: 'file', path: p, size, lfs: { oid, size } })
const hfNonLfs = (p, size) => ({ type: 'file', path: p, size })
const shaFor = (n) => `${'c'.repeat(60)}${String(n).padStart(4, '0')}`

/** The T1 Kijai seed row verbatim (as shipped): the crawl sees the
 *  PUBLISHER path (taeh3.safetensors) under the same sha — the merge must
 *  keep this row byte-for-byte and report the new provenance. */
const kijaiSeedRow = () => ({
  sha256: KIJAI_TAE_SHA,
  sizeBytes: KIJAI_TAE_BYTES,
  kind: 'vae_approx',
  identity: { family: 'minimax-h3', artifact: 'preview-decoder', variant: 'kijai-tae', quant: 'unknown', dtype: 'unknown' },
  source: { repo: 'Kijai/MiniMax-H3-TAE', revision: 'a213ac8bf2f148b4f32372279a7f207846978900', path: 'vae_approx/taeh3_decoder.safetensors' },
  aliases: ['taeh3_decoder.safetensors'],
  addedAt: '2026-10-20',
})

test('(8a) an unchanged manifest regenerates byte-identically', async () => {
  const g = await crawlMod()
  const seed = {
    version: 1,
    generatedAt: '2026-10-20',
    crawl: [{ repo: 'Kijai/MiniMax-H3-TAE', revision: 'a213ac8bf2f148b4f32372279a7f207846978900', fetchedAt: '2026-09-22' }],
    gaps: [],
    rows: [kijaiSeedRow()],
  }
  const entry = g.manifestEntryFor('Kijai/MiniMax-H3-TAE')
  const trees = [hfFile('vae_approx/taeh3.safetensors', KIJAI_TAE_SHA, KIJAI_TAE_BYTES)]
  const collect = () => ({ entry, ok: true, revision: entry.revision, ...g.collectFromTrees(entry, trees) })
  const first = g.buildEnvelope({ previous: seed, results: [collect()], crawlDate: D1 })
  const second = g.buildEnvelope({ previous: seed, results: [collect()], crawlDate: D1 })
  eq(g.serializeCatalog(first.envelope), g.serializeCatalog(second.envelope), 'two merges over the same inputs are byte-identical')
  eq(first.envelope.rows[0], seed.rows[0], 'the same-sha row is preserved verbatim (provenance change reported, never rewritten)')
  ok(first.reports.some((r) => /taeh3\.safetensors/.test(r)), `the publisher-path provenance change is reported (got ${JSON.stringify(first.reports)})`)
  eq(first.envelope.crawl[0].fetchedAt, '2026-09-22', 'the recorded fetchedAt survives: content set unchanged')
  // The AC-5 clause proper: re-merge the MERGED file with identical trees
  // at a LATER crawl date — nothing moves, byte-identical output.
  const third = g.buildEnvelope({ previous: first.envelope, results: [collect()], crawlDate: D2 })
  eq(g.serializeCatalog(third.envelope), g.serializeCatalog(first.envelope), 'a re-crawl of an unchanged repo is byte-identical at a later date')
  eq(third.envelope.crawl[0].fetchedAt, '2026-09-22', 'fetchedAt survives the later run')
})

test('(8b) a changed repo updates only its own fetchedAt and rows', async () => {
  const g = await crawlMod()
  const seed = { version: 1, generatedAt: '', crawl: [], gaps: [], rows: [] }
  const mamad8 = g.manifestEntryFor('Mamad8/MiniMax-H3-Image-VAE')
  const kijai = g.manifestEntryFor('Kijai/MiniMax-H3-TAE')
  // The COLLAPSE repo (review round 2): its tree carries the same sha at
  // TWO paths (the intra-repo duplicate shape — the MiniMaxAI TE shards
  // ship at three locations) and a sha that ALSO exists in Kijai's tree
  // (the cross-repo collapse — OpenVDN's h3-base mirror). Pre-dedupe
  // candidates: 3. Attributed rows after the merge: 1 (the duplicate
  // collapses by sha; the third collapses into Kijai's row). Change
  // detection must read the persisted CANDIDATE fingerprint — not a
  // reconstruction from attributed rows — or this repo re-stamps its
  // fetchedAt on every future crawl with an unchanged weight set.
  const openvdn = g.manifestEntryFor('OpenVDN/vdn-minimax-h3')
  const T_SHA = shaFor(7777)
  const T_BYTES = 4279428112
  const openvdnTrees = [
    hfFile('adapters/turbo/adapter_model.safetensors', T_SHA, T_BYTES),
    hfFile('mirror/adapters/turbo/adapter_model.safetensors', T_SHA, T_BYTES),
    hfFile('stage-dmd-step-250/linear_branch/model.safetensors', KIJAI_TAE_SHA, KIJAI_TAE_BYTES),
  ]
  const MAMAD8_REV = 'c7b9252c73707dba494cf4d99ca45d3f33f561b3'
  const mamad8Trees = (steps) => steps.map((n) => hfFile(`minimax_h3_t1_image_vae_step${n}.safetensors`, shaFor(n), 5207808000 + n))
  const kijaiTrees = [hfFile('vae_approx/taeh3.safetensors', KIJAI_TAE_SHA, KIJAI_TAE_BYTES)]
  const r = (entry, revision, trees) => ({ entry, ok: true, revision, ...g.collectFromTrees(entry, trees) })
  const results = (mamad8Steps) => [
    r(mamad8, MAMAD8_REV, mamad8Trees(mamad8Steps)),
    r(kijai, kijai.revision, kijaiTrees),
    r(openvdn, openvdn.revision, openvdnTrees),
  ]
  const v1 = g.buildEnvelope({ previous: seed, results: results([1597]), crawlDate: D1 })
  // v2: Mamad8 gains step2000 upstream; Kijai and the collapse repo are
  // untouched — the collapse repo MUST NOT re-stamp (its candidate list
  // is byte-stable even though only one of three candidates keeps a row).
  const v2 = g.buildEnvelope({ previous: v1.envelope, results: results([1597, 2000]), crawlDate: D2 })
  const crawlBy = Object.fromEntries(v2.envelope.crawl.map((c) => [c.repo, c]))
  eq(crawlBy['Mamad8/MiniMax-H3-Image-VAE'].fetchedAt, D2, 'the changed repo re-stamps')
  eq(crawlBy['Kijai/MiniMax-H3-TAE'].fetchedAt, D1, 'the unchanged repo keeps its recorded date')
  eq(crawlBy['OpenVDN/vdn-minimax-h3'].fetchedAt, D1, 'the collapse repo does NOT re-stamp: candidates unchanged')
  eq(typeof crawlBy['OpenVDN/vdn-minimax-h3'].candidatesFingerprint, 'string', 'the crawl entry persists the candidate fingerprint')
  eq(v1.envelope.generatedAt, D1, 'v1 generatedAt is the v1 max')
  eq(v2.envelope.generatedAt, D2, 'generatedAt rides the max fetchedAt')
  eq(v2.envelope.rows.length, 4, 'exactly one row appended')
  eq(v2.envelope.rows.filter((row) => row.sha256 === T_SHA).length, 1, 'the intra-repo duplicate path collapses to one row')
  eq(v2.envelope.rows.find((row) => row.sha256 === KIJAI_TAE_SHA)?.source.repo, 'Kijai/MiniMax-H3-TAE', 'the cross-repo collapse keeps the first-seen attribution')
  const added = v2.envelope.rows.find((row) => row.source.path.endsWith('step2000.safetensors'))
  ok(added, 'the new row landed')
  eq(added.addedAt, D2, 'the new row stamps the run date')
  eq(added.identity, { family: 'minimax-h3', artifact: 't1-image-vae', variant: 'step2000', quant: 'unknown', dtype: 'unknown' }, 'the new row classifies via the table')
  const shas = v2.envelope.rows.map((row) => row.sha256)
  eq(shas, [...shas].sort(), 'rows stay canonically sha-sorted')
  for (const old of v1.envelope.rows) {
    eq(v2.envelope.rows.find((row) => row.sha256 === old.sha256), old, `pre-existing row ${old.sha256.slice(0, 8)} is untouched`)
  }
  // v3: re-crawl the unchanged world at a THIRD date — the full AC-5
  // clause with collapse present: byte-identical output, nothing moves.
  const v3 = g.buildEnvelope({ previous: v2.envelope, results: results([1597, 2000]), crawlDate: D3 })
  eq(g.serializeCatalog(v3.envelope), g.serializeCatalog(v2.envelope), 'a dated re-crawl with collapse present is byte-identical')
  const crawl3 = Object.fromEntries(v3.envelope.crawl.map((c) => [c.repo, c]))
  eq(crawl3['OpenVDN/vdn-minimax-h3'].fetchedAt, D1, 'the collapse repo keeps D1 across runs')
  eq(crawl3['Mamad8/MiniMax-H3-Image-VAE'].fetchedAt, D2, 'the changed repo keeps its D2 stamp')
})

test('(8c) a masked oid lands as a gap, never a guessed sha', async () => {
  const g = await crawlMod()
  const entry = g.manifestEntryFor('jacokon/fasth3-live')
  // The observed anonymous mask shape (2026-10-20 probe): the lfs block is
  // present, the oid is 64 literal asterisks, the real size survives. The
  // second entry is the defensive shape — the lfs block absent entirely.
  const masked = [
    hfFile('minimax_h3_video_vae_w4a8_from_fp16.safetensors', MASKED_OID, 1738850040),
    hfNonLfs('minimax_h3_fl2va_fasth3_dense_pruned_int8_convrot.safetensors', 20970382880),
  ]
  const got = g.collectFromTrees(entry, masked)
  eq(got.unclassified, [], 'both masked paths classify (a gap carries a full identity)')
  eq(got.rows, [], 'a masked oid never becomes a row candidate')
  eq(got.gaps.length, 2, 'both masked entries land as gaps')
  const byPath = Object.fromEntries(got.gaps.map((gap) => [gap.path, gap]))
  const w4a8 = byPath['minimax_h3_video_vae_w4a8_from_fp16.safetensors']
  const dense = byPath['minimax_h3_fl2va_fasth3_dense_pruned_int8_convrot.safetensors']
  ok(w4a8 && dense, 'both masked paths are present as gaps')
  ok(w4a8.reason.startsWith('oid-masked-anonymous'), 'the w4a8 gap names the anonymous mask')
  ok(/VT-reference/i.test(w4a8.reason), 'the w4a8 gap records the established VT-reference workaround note')
  ok(dense.reason.startsWith('oid-masked-anonymous'), 'the lfs-absent gap names the anonymous mask too')
  ok(w4a8.sizeBytes === 1738850040 && dense.sizeBytes === 20970382880, 'the real sizes survive into the gap records')
  for (const gap of got.gaps) {
    for (const key of ['family', 'artifact', 'variant', 'quant', 'dtype']) {
      ok(typeof gap.identity[key] === 'string' && gap.identity[key].length > 0, `gap ${gap.path}: identity.${key} is non-empty`)
    }
  }
  // The control: the same repo, an UNMASKED oid → a row candidate, not a gap.
  const control = g.collectFromTrees(entry, [hfFile('minimax_h3_video_vae_w4a8_from_fp16.safetensors', 'a'.repeat(64), 1738850040)])
  eq(control.rows.length, 1, 'the unmasked twin is a row candidate')
  eq(control.gaps, [], 'the unmasked twin is not a gap')
  // The under-threshold plain file (review round 2, minor 1): a weight-
  // shaped entry with NO lfs block under the hub's ~10 MB LFS threshold is
  // a genuinely plain git file — skipped, never misdiagnosed as the mask.
  // (The path classifies — the misdiagnosis at HEAD turned it into an
  // oid-masked gap.)
  const plain = g.collectFromTrees(entry, [hfNonLfs('minimax_h3_video_vae_w4a8_from_fp16.safetensors', 512 * 1024)])
  eq(plain.rows, [], 'the under-threshold plain file is no row')
  eq(plain.gaps, [], 'the under-threshold plain file is no gap — not a mask, not a gap')
  eq(plain.unclassified, [], 'the under-threshold plain file is out of scope, not a classification miss')
  // Envelope level: the merge emits the gaps, and NO row anywhere carries a
  // non-sha sha — masked means absent from rows, never guessed.
  const envelope = g.buildEnvelope({
    previous: { version: 1, generatedAt: '', crawl: [], gaps: [], rows: [] },
    results: [{ entry, ok: true, revision: entry.revision, ...got }],
    crawlDate: D1,
  }).envelope
  eq(envelope.gaps.length, 2, 'both gaps land in the envelope')
  eq(envelope.rows, [], 'a masked-only crawl contributes no rows')
  for (const gap of envelope.gaps) {
    eq(gap.repo, entry.repo, 'the gap names its repo')
    eq(gap.revision, entry.revision, 'the gap records the revision')
    ok(/^\d{4}-\d{2}-\d{2}$/.test(gap.addedAt), 'the gap stamps its date')
  }
})

test("(8d) the manifest's every repo appears in the envelope's crawl block", async () => {
  const g = await crawlMod()
  // Fixture leg: a FAILED repo lands no fabricated crawl entry — the
  // failure is reported loudly. The crawl block is the record of every
  // source and date (spec §2); a fabricated entry would be a lie.
  const seed = { version: 1, generatedAt: '', crawl: [], gaps: [], rows: [] }
  const kijai = g.manifestEntryFor('Kijai/MiniMax-H3-TAE')
  const fasth3 = g.manifestEntryFor('jacokon/fasth3-live')
  const out = g.buildEnvelope({
    previous: seed,
    results: [
      { entry: kijai, ok: true, revision: kijai.revision, ...g.collectFromTrees(kijai, [hfFile('vae_approx/taeh3.safetensors', KIJAI_TAE_SHA, KIJAI_TAE_BYTES)]) },
      { entry: fasth3, ok: false, error: 'TREE-HTTP-401' },
    ],
    crawlDate: D1,
  })
  eq(out.envelope.crawl.map((c) => c.repo), ['Kijai/MiniMax-H3-TAE'], 'only successful repos land crawl entries')
  eq(out.failures.map((f) => f.repo), ['jacokon/fasth3-live'], 'the failed repo is reported, not swallowed')
  eq(out.envelope.gaps, [], 'a failed repo contributes no gaps')
  // Shipped leg: after the real run, the landed envelope covers the WHOLE
  // manifest, and every shipped row's repo has a crawl entry. RED until the
  // real run lands — that is the point.
  const shipped = JSON.parse(fs.readFileSync(path.join(REPO, 'server', 'hashCatalog.json'), 'utf8'))
  const shippedRepos = new Set(shipped.crawl.map((c) => c.repo))
  eq(g.MANIFEST.filter((e) => !shippedRepos.has(e.repo)).map((e) => e.repo), [], 'every manifest repo is recorded in the shipped crawl block')
  eq([...new Set(shipped.rows.map((r) => r.source.repo))].filter((repo) => !shippedRepos.has(repo)), [], "every shipped row's source repo has a crawl entry")
})

test('(8e) the classification table leaves no crawled weight unclassified', async () => {
  const g = await crawlMod()
  // (i) A table miss FAILS the merge loudly, naming the path — never a
  // default identity (the review event the table's header promises).
  const openvdn = g.manifestEntryFor('OpenVDN/vdn-minimax-h3')
  const missed = g.collectFromTrees(openvdn, [hfFile('stage-unknown/weird-file.bin', 'b'.repeat(64), 10)])
  eq(missed.unclassified, ['stage-unknown/weird-file.bin'], 'the miss is collected')
  assert.throws(
    () => g.buildEnvelope({
      previous: { version: 1, generatedAt: '', crawl: [], gaps: [], rows: [] },
      results: [{ entry: openvdn, ok: true, revision: openvdn.revision, ...missed }],
      crawlDate: D1,
    }),
    /weird-file\.bin/,
    'the merge throws, naming the unclassifiable path',
  )
  // (ii) Drift battery: EVERY shipped row re-derives exactly from the
  // manifest + table — classification cannot drift from the artifact.
  const shipped = JSON.parse(fs.readFileSync(path.join(REPO, 'server', 'hashCatalog.json'), 'utf8'))
  ok(shipped.rows.length >= 22, `the shipped catalog carries rows (got ${shipped.rows.length})`)
  for (const row of shipped.rows) {
    const entry = g.manifestEntryFor(row.source.repo)
    ok(entry, `the manifest covers ${row.source.repo}`)
    const got = g.classifyArtifact(entry, row.source.path)
    ok(got, `${row.source.repo} · ${row.source.path}: the table classifies the shipped row`)
    eq(got.identity, row.identity, `${row.source.repo} · ${row.source.path}: identity re-derives`)
    eq(got.kind, row.kind, `${row.source.repo} · ${row.source.path}: kind re-derives`)
  }
})
