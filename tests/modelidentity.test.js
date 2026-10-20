// The identity seam suite (task to7xpa7, spec
// docs/specs/2026-10-17-hash-catalog.md §4 the seam + §6 the mechanics).
//
// server/modelIdentity.ts is THE one derivation every consumer reads
// (identifyModel) plus the hoisted local-hashing machinery (the streaming
// worker, the stat-keyed cache, the persistent sidecar, the size
// pre-filter). The animation lane's hasher MOVED here (server/animation/
// models.ts delegates — one hasher, one cache, no second digest path); the
// delegation itself is proven by the animation suites staying green
// UNTOUCHED, not by this file. This suite polices the seam's own contract:
//
//   1. identifyModel answers the three verdicts from the indexes alone
//      (sha hit → hash-confirmed; alias hit → name-suspected; else
//      unknown) — pure, injected fixture catalog;
//   2. a hash-confirmed verdict REQUIRES bytes actually read (AC-4 at the
//      seam: no settled digest → name-shape verdict, verifying absent);
//   3. the §6 size pre-filter: a size matching no catalog row is answered
//      unknown WITHOUT enqueueing (a hash cannot hit — never read);
//   4. the digest settles asynchronously and the verdict upgrades
//      (the progressive-reveal mechanics);
//   5. the sidecar survives a restart (fresh engine, same sidecar →
//      zero hashing), with strict stat-key invalidation (a file rewritten
//      under the same name re-hashes);
//   6. the FIFO: one digest stream — second-in requests queue behind the
//      running one, in-flight requests dedup by absPath;
//   7. weightFilePath's folder containment still refuses escapes (the
//      guard hoisted from the animation lane, asserted at its new home);
//   8. B3's animation arm: digests hitting a row stamp catalogRowId, and
//      the identity parser round-trips it;
//   9. the request bound (1..64 per call) and the degraded-catalog cap
//      (empty catalog → identity absent, today's behavior);
//   10. the digest stream's death policy: a worker death settles its
//      in-flight hash null (the FIFO never wedges), a productive death
//      recovers on the next hash, a death-before-first-completion goes
//      dead forever (immediate nulls — never a re-spawn loop).

import { test, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { loadHashCatalog } from '../server/hashCatalog'
import { createDefaultWorker, createModelIdentityEngine, ModelIdentityRequestError, weightFilePath } from '../server/modelIdentity'
import { parseModelContentIdentity, parseModelContentIdentities } from '../shared/animation/types'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')

const REPO = path.resolve(__dirname, '..')
const { makeScratchDir, removeAllScratchDirs } = require(path.join(REPO, 'tests', 'lib', 'scratch.cjs'))

afterAll(async () => {
  await removeAllScratchDirs()
})

const ok = (cond, label) => assert.ok(cond, label)
const eq = (actual, expected, label) => assert.deepEqual(actual, expected, label)

const shaOf = (content) => createHash('sha256').update(content).digest('hex')

// ---------------------------------------------------------------------------
// fixtures: a scratch model root + a fixture catalog loaded through the REAL
// loader (loadHashCatalog with MONOKA_HASH_CATALOG pointed at the file — the
// loader's documented dev/test seam — so the fixture rows pass the strict
// row validation the shipped file answers to).
// ---------------------------------------------------------------------------

let scratch

function writeFixtureFile(relName, content) {
  const abs = path.join(scratch.root, relName)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  return { abs, sha: shaOf(content), bytes: content.length }
}

function catalogRow(sha, bytes, kind, identity, aliases) {
  return {
    sha256: sha,
    sizeBytes: bytes,
    kind,
    identity,
    source: { repo: 'fixture/repo', revision: 'f1x0', path: aliases[0] },
    aliases,
    addedAt: '2026-10-20',
  }
}

/** Loads rows through the real loader (the strict validation runs). */
function loadFixtureCatalog(rows) {
  const catalogPath = path.join(scratch.dir, `catalog-${rows.length}-${Math.random().toString(36).slice(2, 8)}.json`)
  fs.writeFileSync(catalogPath, JSON.stringify({ version: 1, generatedAt: '2026-10-20', crawl: [], gaps: [], rows }))
  return loadHashCatalog({ MONOKA_HASH_CATALOG: catalogPath })
}

/** Minimal AppSettings shape for fetchModelRootPath: scanner kinds resolve
 *  through settings.paths[kind] first, then <modelRoot>/<kind>. */
function settingsFor(rootByKind) {
  return {
    modelRoot: '',
    paths: {
      diffusion_models: '',
      text_encoders: '',
      vae: '',
      loras: '',
      vae_approx: '',
      clip_vision: '',
      ...rootByKind,
    },
  }
}

/** A counting digest worker: replaces the real node:worker_threads worker
 *  so tests can assert exactly when bytes were (and were not) read. */
function makeCountingWorker(calls, opts = {}) {
  const shaByPath = opts.shaByPath ?? new Map()
  let running = 0
  const state = { maxConcurrent: 0, order: [] }
  const factory = () => ({
    hash: async (absPath) => {
      calls.push(absPath)
      state.order.push(absPath)
      running += 1
      state.maxConcurrent = Math.max(state.maxConcurrent, running)
      await new Promise((resolve) => setTimeout(resolve, opts.delayMs ?? 5))
      running -= 1
      return shaByPath.has(absPath) ? shaByPath.get(absPath) : shaOf(fs.readFileSync(absPath))
    },
    close: () => {},
  })
  factory.state = state
  return factory
}

/** The standard fixture world: three named rows (alpha/beta/gamma) plus the
 *  ambiguous pair (one basename, two rows — the taeh3 same-name-shape), the
 *  304-byte-motivating size pair, and matching files on disk. */
function buildStandardWorld() {
  const world = {}

  world.alpha = writeFixtureFile('alpha-weights.safetensors', Buffer.from(`alpha-weight-bytes-${'a'.repeat(512)}`))
  world.beta = writeFixtureFile('vae/beta-vae.safetensors', Buffer.from(`beta-vae-bytes-${'b'.repeat(640)}`))
  // The 304-byte pair (spec §6's motivating fixture: size alone separates
  // them before any bytes are read).
  world.pairSmall = writeFixtureFile('pair/small.step.safetensors', Buffer.alloc(1024, 1))
  world.pairBig = writeFixtureFile('pair/big.step.safetensors', Buffer.alloc(1328, 2))
  // A size matching NO row (the pre-filter's skip arm).
  world.odd = writeFixtureFile('odd-size.safetensors', Buffer.alloc(4096, 3))
  // A name shared by two rows (the ambiguity arm: the alias bucket holds
  // two shas, so the name alone cannot pick an identity).
  world.shared = writeFixtureFile('shared-name.safetensors', Buffer.from('shared-name-current-bytes'))

  const identityA = { family: 'minimax-h3', artifact: 'fl2va', variant: 'alpha-v1', quant: 'bf16', dtype: 'bfloat16' }
  const identityB = { family: 'minimax-h3', artifact: 'video-vae', variant: 'beta-v1', quant: 'fp16', dtype: 'float16' }
  const identityS1 = { family: 'minimax-h3', artifact: 'vdn-stage', variant: 'shared-one', quant: 'bf16', dtype: 'bfloat16' }
  const identityS2 = { family: 'minimax-h3', artifact: 'vdn-stage', variant: 'shared-two', quant: 'bf16', dtype: 'bfloat16' }
  const identityP1 = { family: 'minimax-h3', artifact: 'turbo-lora', variant: 'pair-small', quant: 'bf16', dtype: 'bfloat16' }
  const identityP2 = { family: 'minimax-h3', artifact: 'turbo-lora', variant: 'pair-big', quant: 'bf16', dtype: 'bfloat16' }

  world.rows = [
    catalogRow(world.alpha.sha, world.alpha.bytes, 'diffusion_models', identityA, ['alpha-weights.safetensors', 'alpha-renamed.safetensors']),
    catalogRow(world.beta.sha, world.beta.bytes, 'vae', identityB, ['beta-vae.safetensors']),
    catalogRow(shaOf(Buffer.from('shared-name-historic-one')), 11111, 'loras', identityS1, ['shared-name.safetensors']),
    catalogRow(shaOf(Buffer.from('shared-name-historic-two')), 22222, 'loras', identityS2, ['shared-name.safetensors']),
    catalogRow(world.pairSmall.sha, world.pairSmall.bytes, 'loras', identityP1, ['small.step.safetensors']),
    catalogRow(world.pairBig.sha, world.pairBig.bytes, 'loras', identityP2, ['big.step.safetensors']),
  ]
  world.catalog = loadFixtureCatalog(world.rows)
  return world
}

function newEngine(catalog, opts = {}) {
  return createModelIdentityEngine({ catalog, hashCachePath: path.join(scratch.dir, `hash-cache-${Math.random().toString(36).slice(2, 8)}.json`), ...opts })
}

// ---------------------------------------------------------------------------
// (1) identifyModel — the three verdicts, from the indexes alone
// ---------------------------------------------------------------------------

test('(1) identifyModel answers the three verdicts from the indexes alone', () => {
  scratch = { dir: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-1-')), root: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-root-')) }
  const world = buildStandardWorld()
  const engine = newEngine(world.catalog)

  // sha hit → hash-confirmed, identity named, aliases ride (the H-M2
  // tie-break data).
  const confirmed = engine.identifyModel({ name: 'whatever.safetensors', kind: 'diffusion_models' }, world.alpha.sha)
  eq(confirmed.verdict, 'hash-confirmed', 'the sha hit confirms')
  eq(confirmed.identity.family, 'minimax-h3', 'the row identity is named')
  eq(confirmed.identity.artifact, 'fl2va', 'the artifact is named')
  ok(Array.isArray(confirmed.identity.aliases) && confirmed.identity.aliases.includes('alpha-renamed.safetensors'), 'the row aliases ride the confirmed verdict')

  // alias-only hit → name-suspected (basename, subpaths included — ComfyUI
  // enumerates relative paths).
  const suspected = engine.identifyModel({ name: 'sub/dir/alpha-weights.safetensors', kind: 'diffusion_models' })
  eq(suspected.verdict, 'name-suspected', 'the basename hit suspects')
  eq(suspected.identity?.variant, 'alpha-v1', 'the matched row identity rides the suspicion')

  // no match → unknown.
  eq(engine.identifyModel({ name: 'nobody.safetensors', kind: 'vae' }).verdict, 'unknown', 'an unmatched name is unknown')
  eq(engine.identifyModel({ name: 'nobody.safetensors', kind: 'vae' }, shaOf(Buffer.from('not-a-row'))).verdict, 'unknown', 'a sha matching no row falls through to unknown')

  // The ambiguity arm: one basename, two rows — the name alone cannot pick,
  // so the verdict suspects WITHOUT naming an identity (never a guess).
  const ambiguous = engine.identifyModel({ name: 'shared-name.safetensors', kind: 'loras' })
  eq(ambiguous.verdict, 'name-suspected', 'the ambiguous bucket still suspects (the name DID match)')
  eq(ambiguous.identity, undefined, 'an ambiguous bucket names NO identity')
})

// ---------------------------------------------------------------------------
// (2) hash-confirmed requires bytes actually read (AC-4 at the seam)
// ---------------------------------------------------------------------------

test('(2) a hash-confirmed verdict requires bytes actually read', async () => {
  scratch = { dir: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-2-')), root: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-root-')) }
  const world = buildStandardWorld()
  const engine = newEngine(world.catalog)
  const settings = settingsFor({ diffusion_models: scratch.root })

  const file = { name: 'alpha-weights.safetensors', kind: 'diffusion_models', bytes: world.alpha.bytes }

  // No settled digest yet: the attach caps at the name-shape verdict —
  // verifying ABSENT (attach never enqueues, never blocks on bytes).
  const cold = await engine.attachIdentities([file], settings)
  eq(cold[0].identity?.verdict, 'name-suspected', 'without bytes the attach suspects by name')
  eq(cold[0].identity?.verifying, undefined, 'the attach never sets verifying')
  eq(cold[0].identity?.family, 'minimax-h3', 'the suspected identity is still named')

  // Prime the digest through the lazy trigger, then attach: hash-confirmed.
  const primed = engine.requestIdentification([{ kind: 'diffusion_models', name: 'alpha-weights.safetensors' }], settings)
  eq(primed.results[0].identity?.verdict, 'name-suspected', 'the request starts at the name verdict')
  eq(primed.results[0].identity?.verifying, true, 'the request marks the digest in flight')
  await engine.drain()
  const warm = await engine.attachIdentities([file], settings)
  eq(warm[0].identity?.verdict, 'hash-confirmed', 'with settled bytes the attach confirms')
  eq(warm[0].identity?.family, 'minimax-h3', 'the confirmed identity is named')

  // The root REMOVED: no bytes → back to the name-shape verdict, and
  // NOTHING in the payload claims hash-confirmed (AC-4's nothing-claims-
  // without-bytes).
  fs.rmSync(scratch.root, { recursive: true, force: true })
  const gone = await engine.attachIdentities([file], settings)
  eq(gone[0].identity?.verdict, 'name-suspected', 'without a readable root the attach suspects')
  eq(gone[0].identity?.verifying, undefined, 'verifying stays absent without a trigger')
  ok(gone[0].identity?.verdict !== 'hash-confirmed', 'nothing claims hash-confirmed without bytes')
})

// ---------------------------------------------------------------------------
// (3) the §6 size pre-filter — impossible hashes are never read
// ---------------------------------------------------------------------------

test('(3) the size pre-filter skips impossible hashes without enqueueing', async () => {
  scratch = { dir: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-3-')), root: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-root-')) }
  const world = buildStandardWorld()
  const calls = []
  const engine = newEngine(world.catalog, { createWorker: makeCountingWorker(calls, { shaByPath: new Map([[world.pairSmall.abs, world.pairSmall.sha], [world.pairBig.abs, world.pairBig.sha]]) }) })
  const settings = settingsFor({ loras: scratch.root, diffusion_models: scratch.root })

  // A size matching no knownSizes row: a hash cannot hit — answered
  // unknown WITHOUT touching the queue (the 304-byte pair is exactly why:
  // size alone separates the near-twins before any bytes are read).
  const skipped = engine.requestIdentification([{ kind: 'loras', name: 'odd-size.safetensors' }], settings)
  eq(skipped.results[0].identity?.verdict, 'unknown', 'the impossible size answers unknown')
  eq(skipped.results[0].identity?.verifying, undefined, 'no verifying marker on a skipped hash')
  await engine.drain()
  eq(calls.length, 0, 'the queue stayed empty — no bytes were read')

  // The size-excluded arm does NOT consult the name index (the review's
  // Important): the stat is POSITIVE evidence the bytes are no row's, so
  // an aliased basename attaches NOTHING — unknown, never a suspicion the
  // seam's own stat disproves.
  writeFixtureFile('alpha-renamed.safetensors', Buffer.alloc(2048, 9)) // alpha's alias; 2048 is no row's size
  const aliased = engine.requestIdentification([{ kind: 'diffusion_models', name: 'alpha-renamed.safetensors' }], settings)
  eq(aliased.results[0].identity?.verdict, 'unknown', 'a size-excluded file answers unknown even on an aliased name')
  eq(aliased.results[0].identity?.family, undefined, 'no identity attaches against the size evidence')
  eq(aliased.results[0].identity?.verifying, undefined, 'no verifying marker — the read was skipped')
  await engine.drain()
  eq(calls.length, 0, 'still zero reads — the aliased size was skipped too')

  // A size-matching file enqueues and answers verifying (the pair's small
  // leg; the big leg differs by exactly 304 bytes — both are known sizes).
  const small = engine.requestIdentification([{ kind: 'loras', name: 'pair/small.step.safetensors' }], settings)
  eq(small.results[0].identity?.verdict, 'name-suspected', 'the size-matching file starts at the name verdict')
  eq(small.results[0].identity?.verifying, true, 'the digest is in flight')
  const big = engine.requestIdentification([{ kind: 'loras', name: 'pair/big.step.safetensors' }], settings)
  eq(big.results[0].identity?.verifying, true, 'the 304-byte sibling also enqueues')
  await engine.drain()
  eq(calls.length, 2, 'exactly the two possible hashes were read')
  eq(calls[0], world.pairSmall.abs, 'the first request hashed first')
  eq(calls[1], world.pairBig.abs, 'the second request queued behind it (FIFO)')
})

// ---------------------------------------------------------------------------
// (4) the digest settles asynchronously and the verdict upgrades
// ---------------------------------------------------------------------------

test('(4) the digest settles asynchronously and the verdict upgrades', async () => {
  scratch = { dir: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-4-')), root: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-root-')) }
  const world = buildStandardWorld()
  const engine = newEngine(world.catalog)
  const settings = settingsFor({ diffusion_models: scratch.root })

  // request → verifying (the interim vocabulary: "verifying bytes —
  // identified by name for now").
  const interim = engine.requestIdentification([{ kind: 'diffusion_models', name: 'alpha-weights.safetensors' }], settings)
  eq(interim.results[0].identity?.verdict, 'name-suspected', 'the interim verdict suspects by name')
  eq(interim.results[0].identity?.verifying, true, 'the interim marker rides')
  eq(interim.results[0].bytes, world.alpha.bytes, 'the stat rides the interim answer too')

  // await the queue drain → re-request answers hash-confirmed IN PLACE.
  await engine.drain()
  const settled = engine.requestIdentification([{ kind: 'diffusion_models', name: 'alpha-weights.safetensors' }], settings)
  eq(settled.results[0].identity?.verdict, 'hash-confirmed', 'the settled verdict confirms')
  eq(settled.results[0].identity?.verifying, undefined, 'the interim marker clears')
  eq(settled.results[0].identity?.variant, 'alpha-v1', 'the identity is named')
  eq(settled.results[0].bytes, world.alpha.bytes, 'the byte count rides')

  // The attach path agrees (the same engine, one cache).
  const attached = await engine.attachIdentities([{ name: 'alpha-weights.safetensors', kind: 'diffusion_models', bytes: world.alpha.bytes }], settings)
  eq(attached[0].identity?.verdict, 'hash-confirmed', 'the attach sees the settled digest')
})

// ---------------------------------------------------------------------------
// (5) the persistent sidecar — restarts never re-hash; strict stat-key
// ---------------------------------------------------------------------------

test('(5) the sidecar survives a restart; a rewritten file re-hashes', async () => {
  scratch = { dir: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-5-')), root: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-root-')) }
  const world = buildStandardWorld()
  const cachePath = path.join(scratch.dir, 'hash-cache-restart.json')

  // Settle both digests, force the debounced write.
  const engine1 = createModelIdentityEngine({ catalog: world.catalog, hashCachePath: cachePath })
  const settings = settingsFor({ diffusion_models: scratch.root, vae: scratch.root })
  engine1.requestIdentification([
    { kind: 'diffusion_models', name: 'alpha-weights.safetensors' },
    { kind: 'vae', name: 'vae/beta-vae.safetensors' },
  ], settings)
  await engine1.drain()
  await engine1.flushNow()
  ok(fs.existsSync(cachePath), 'the sidecar file exists after the flush')

  // A NEW engine (fresh memory cache, same sidecar): both requests answer
  // hash-confirmed with ZERO hashing (the counting worker proves it).
  const calls = []
  const engine2 = createModelIdentityEngine({ catalog: world.catalog, hashCachePath: cachePath, createWorker: makeCountingWorker(calls) })
  const restarted = engine2.requestIdentification([
    { kind: 'diffusion_models', name: 'alpha-weights.safetensors' },
    { kind: 'vae', name: 'vae/beta-vae.safetensors' },
  ], settings)
  eq(restarted.results[0].identity?.verdict, 'hash-confirmed', 'the restart answers alpha from the sidecar')
  eq(restarted.results[1].identity?.verdict, 'hash-confirmed', 'the restart answers beta from the sidecar')
  await engine2.drain()
  eq(calls.length, 0, 'zero hashing after the restart — restarts never re-hash')

  // A file REWRITTEN under the same name (different content, SAME byte
  // length — a size the pre-filter can't skip, so the strict stat-key is
  // what refuses the sidecar entry — and a new mtime): the stale entry is
  // not trusted and the file re-hashes.
  const rewritten = Buffer.from(`alpha-rewritten-${'z'.repeat(515)}`)
  fs.writeFileSync(world.alpha.abs, rewritten)
  const newSha = shaOf(rewritten)
  ok(newSha !== world.alpha.sha, 'the rewrite changed the bytes')

  const afterRewrite = engine2.requestIdentification([{ kind: 'diffusion_models', name: 'alpha-weights.safetensors' }], settings)
  eq(afterRewrite.results[0].identity?.verdict, 'name-suspected', 'the stale sidecar entry is not trusted')
  eq(afterRewrite.results[0].identity?.verifying, true, 'the re-hash is in flight')
  await engine2.drain()
  eq(calls.length, 1, 'exactly one re-hash happened')
  const redigested = await engine2.digestWeightFile(world.alpha.abs, 'alpha-weights.safetensors')
  eq(redigested?.digest, newSha, 'the fresh digest is the rewritten bytes')
})

// ---------------------------------------------------------------------------
// (6) the FIFO — one digest stream, in-flight dedup
// ---------------------------------------------------------------------------

test('(6) the queue is one FIFO digest stream with in-flight dedup', async () => {
  scratch = { dir: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-6-')), root: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-root-')) }
  const world = buildStandardWorld()
  const calls = []
  const worker = makeCountingWorker(calls, { delayMs: 15, shaByPath: new Map([[world.alpha.abs, world.alpha.sha], [world.beta.abs, world.beta.sha], [world.pairSmall.abs, world.pairSmall.sha]]) })
  const engine = newEngine(world.catalog, { createWorker: worker })
  const settings = settingsFor({ diffusion_models: scratch.root, vae: scratch.root, loras: scratch.root })

  // Three requests while one stream runs: all answer verifying immediately
  // (never a blocked caller), the digests serialize in request order, and
  // never two at once (one disk; parallel gigabyte reads thrash it).
  const first = engine.requestIdentification([{ kind: 'diffusion_models', name: 'alpha-weights.safetensors' }], settings)
  const second = engine.requestIdentification([{ kind: 'vae', name: 'vae/beta-vae.safetensors' }], settings)
  const third = engine.requestIdentification([{ kind: 'loras', name: 'pair/small.step.safetensors' }], settings)
  eq(first.results[0].identity?.verifying, true, 'the first request answers verifying')
  eq(second.results[0].identity?.verifying, true, 'the second request answers verifying (queued)')
  eq(third.results[0].identity?.verifying, true, 'the third request answers verifying (queued)')
  await engine.drain()
  eq(worker.state.order.length, 3, 'all three digests ran')
  eq(worker.state.order, [world.alpha.abs, world.beta.abs, world.pairSmall.abs], 'FIFO: request order is digest order')
  eq(worker.state.maxConcurrent, 1, 'one digest at a time — the single stream')

  // In-flight dedup: a second identify for a queued file adds no job.
  const dedup = engine.requestIdentification([{ kind: 'loras', name: 'pair/small.step.safetensors' }], settings)
  eq(dedup.results[0].identity?.verdict, 'hash-confirmed', 'the settled digest answers directly')
  await engine.drain()
  eq(calls.filter((abs) => abs === world.pairSmall.abs).length, 1, 'no second hash for the same path')
})

// ---------------------------------------------------------------------------
// (7) weightFilePath — the folder-containment guard, at its new home
// ---------------------------------------------------------------------------

test('(7) weightFilePath containment still refuses escapes', () => {
  const folder = path.join(makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-7-')), 'models')

  eq(weightFilePath(folder, 'model.safetensors'), path.resolve(folder, 'model.safetensors'), 'a plain name joins under the folder')
  eq(weightFilePath(folder, 'sub/dir/model.safetensors'), path.resolve(folder, 'sub/dir/model.safetensors'), 'subfolder names join (ComfyUI enumerates relative paths)')
  eq(weightFilePath(folder, ''), null, 'an empty name refuses')
  eq(weightFilePath(folder, '..'), null, 'a bare .. refuses')
  eq(weightFilePath(folder, '../escape.safetensors'), null, 'a .. escape refuses')
  eq(weightFilePath(folder, 'sub/../../escape.safetensors'), null, 'a nested .. escape refuses')
  eq(weightFilePath(folder, './model.safetensors'), null, 'a . segment refuses (the lane\'s verbatim contract)')
  // Absolute and UNC names cannot ESCAPE either — the split drops the
  // leading separator, so the segments land inside the folder (the moved
  // guard's verbatim contract: the invariant is containment, not refusal
  // of unusual shapes).
  eq(weightFilePath(folder, '/etc/passwd'), path.resolve(folder, 'etc/passwd'), 'an absolute POSIX name lands inside the folder (the leading slash is dropped)')
  eq(weightFilePath(folder, '\\\\host\\share\\x.safetensors'), path.resolve(folder, 'host/share/x.safetensors'), 'a UNC-shaped name lands inside the folder')
})

// ---------------------------------------------------------------------------
// (8) B3's animation arm — catalogRowId stamps and round-trips
// ---------------------------------------------------------------------------

test('(8) a digest hitting a row stamps catalogRowId, and the parser carries it', async () => {
  scratch = { dir: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-8-')), root: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-root-')) }
  const world = buildStandardWorld()
  const engine = newEngine(world.catalog)

  // The digest of a cataloged file references its row.
  const stamped = await engine.digestWeightFile(world.alpha.abs, 'alpha-weights.safetensors')
  eq(stamped?.digest, world.alpha.sha, 'the digest is the file sha')
  eq(stamped?.catalogRowId, world.alpha.sha, 'the identity references the catalog row whose sha it matches')
  eq(stamped?.bytes, world.alpha.bytes, 'the byte count rides')

  // The digest of an uncataloged file carries NO row id (honest absence).
  const unstamped = await engine.digestWeightFile(world.odd.abs, 'odd-size.safetensors')
  eq(unstamped?.digest, world.odd.sha, 'the uncataloged digest is still honest')
  eq(unstamped?.catalogRowId, undefined, 'no row id without a row')

  // The frozen-snapshot parser round-trips the reference (B3: the
  // animation snapshot's identities may reference the matched row).
  eq(parseModelContentIdentity(stamped), stamped, 'a stamped identity round-trips verbatim')
  eq(parseModelContentIdentity({ name: 'x.safetensors', digest: world.alpha.sha, bytes: 1, catalogRowId: 'not-a-sha' }), null, 'a malformed row id refuses the identity')
  // The SET parser (the frozen record's boundary) carries mixed stamped and
  // unstamped identities — the reference survives, its absence survives.
  const mixed = [stamped, unstamped]
  eq(parseModelContentIdentities(mixed), mixed, 'a frozen set round-trips with and without row references')
})

// ---------------------------------------------------------------------------
// (9) the request bound + the degraded-catalog cap
// ---------------------------------------------------------------------------

test('(9) the request bound refuses abuse-shaped bodies; a degraded catalog leaves identity absent', async () => {
  scratch = { dir: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-9-')), root: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-root-')) }
  const world = buildStandardWorld()
  const engine = newEngine(world.catalog)
  const settings = settingsFor({ diffusion_models: scratch.root })

  // >64 files is the route's 400 shape — the seam throws the named error.
  const abuse = Array.from({ length: 65 }, (_, i) => ({ kind: 'diffusion_models', name: `f${i}.safetensors` }))
  assert.throws(() => engine.requestIdentification(abuse, settings), (err) => err instanceof ModelIdentityRequestError, '65 files refuse with the named error')
  assert.throws(() => engine.requestIdentification([], settings), (err) => err instanceof ModelIdentityRequestError, 'an empty body refuses too (the 1..64 bound is honest)')
  assert.throws(() => engine.requestIdentification([{ kind: 'diffusion_models', name: 42 }], settings), (err) => err instanceof ModelIdentityRequestError, 'a malformed entry refuses')

  // Degraded mode (the EMPTY catalog): the attach leaves identity ABSENT —
  // today's name-shape behavior, bit for bit (the modularity contract:
  // delete the catalog file and nothing else moves).
  const emptyCatalogPath = path.join(scratch.dir, 'empty-catalog.json')
  fs.writeFileSync(emptyCatalogPath, JSON.stringify({ version: 1, generatedAt: '', crawl: [], gaps: [], rows: [] }))
  const degraded = createModelIdentityEngine({ catalog: loadHashCatalog({ MONOKA_HASH_CATALOG: emptyCatalogPath }), hashCachePath: path.join(scratch.dir, 'hash-cache-degraded.json') })
  const files = [{ name: 'alpha-weights.safetensors', kind: 'diffusion_models', bytes: world.alpha.bytes }]
  const untouched = await degraded.attachIdentities(files, settings)
  eq(untouched[0].identity, undefined, 'the degraded attach attaches nothing')
  eq(untouched[0].name, 'alpha-weights.safetensors', 'the file itself rides unchanged')
})

// ---------------------------------------------------------------------------
// (10) the digest stream's death policy — a dying worker SETTLES (never a
// wedge), a productive death recovers, a birth death goes dead forever
// ---------------------------------------------------------------------------

// A worker that hashes normally EXCEPT a path carrying '/die-' — it exits
// mid-flight without answering (the real-world death shape: the thread is
// gone while a job is outstanding).
const DIE_ON_DEMAND_SOURCE = `
'use strict'
const { createHash } = require('node:crypto')
const { createReadStream } = require('node:fs')
const { pipeline } = require('node:stream/promises')
const { parentPort } = require('node:worker_threads')
parentPort.on('message', (job) => {
  if (String(job.absPath).includes('/die-')) process.exit(1)
  const hash = createHash('sha256')
  pipeline(createReadStream(job.absPath), hash).then(
    () => parentPort.postMessage({ id: job.id, sha256: hash.digest('hex') }),
    () => parentPort.postMessage({ id: job.id, error: 'unreadable' }),
  )
})
`

// A worker that dies at LOAD, before ever completing a job (the
// deterministic-breakage shape: re-spawning cannot help).
const DIE_ON_LOAD_SOURCE = `
'use strict'
require('node:worker_threads').parentPort.on('message', () => {})
process.exit(1)
`

test('(10) a dying digest worker settles in-flight hashes null and never wedges the stream', async () => {
  scratch = { dir: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-10-')), root: makeScratchDir(path.join(os.tmpdir(), 'monoka-modelidentity-root-')) }
  const world = buildStandardWorld()

  // A PRODUCTIVE death (the worker had completed jobs): the mid-flight
  // hash settles null — missing evidence, the callers' named refusals,
  // never a hang, never a half-answer — and the NEXT hash lazily
  // re-creates the stream (a transient death must not cost hash-confirmed
  // for the process's remaining life).
  const stream = createDefaultWorker(DIE_ON_DEMAND_SOURCE)
  const first = await stream.hash(world.alpha.abs)
  eq(first, world.alpha.sha, 'the live stream hashes normally')
  const dying = await stream.hash(path.join(scratch.root, 'die-now.bin'))
  eq(dying, null, 'the mid-flight death settles null (the FIFO keeps pumping — no wedge)')
  const recovered = await stream.hash(world.beta.abs)
  eq(recovered, world.beta.sha, 'the next hash re-created the stream and answers again')
  stream.close()

  // A BIRTH death (zero completions): the stream is dead for good —
  // re-spawning on every job would only loop — and every hash answers
  // null immediately (the non-gating degrade: verdicts fall back to
  // name-suspected until the process restarts; the sidecar keeps every
  // settled digest safe across it).
  const doomed = createDefaultWorker(DIE_ON_LOAD_SOURCE)
  eq(await doomed.hash(world.alpha.abs), null, 'the first hash settles null after a load death')
  eq(await doomed.hash(world.beta.abs), null, 'the stream stays dead — no re-create loop, no hang')
  doomed.close()
})
