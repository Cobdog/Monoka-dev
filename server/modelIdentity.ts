/**
 * The IDENTITY SEAM (task to7xpa7, spec docs/specs/2026-10-17-hash-catalog.md
 * §4 the seam + §6 the mechanics): the ONE derivation every surface reads,
 * plus the hoisted local-hashing machinery.
 *
 * THE ONE-DERIVATION DOCTRINE (spec §4, on the module-head evidence of
 * h3Stack.ts's dead parallel table): the catalog enters through the
 * derivations below and nowhere else. No surface re-encodes a sha→name
 * table; the only client transport is the identity block attached to
 * ModelFile (§2's wire pin — this module's ModelFileIdentity is that
 * block's shape). Consumers so far: the inventory/bootstrap populate paths
 * (attachIdentities), the lazy identify trigger (requestIdentification),
 * and the animation lane, whose digesting seam (resolvedIdentities in
 * server/animation/models.ts) DELEGATES its hashing here — one hasher, one
 * cache, no second digest path (the 2026-10-20 hoist; dated note in that
 * module's head).
 *
 * TWO CONTRACTS LIVE SIDE BY SIDE, ON PURPOSE (do not unify them):
 *   - THE SEAM'S NON-GATING DEGRADE: a verdict the evidence cannot support
 *     degrades honestly (name-suspected / unknown). Nothing here ever
 *     refuses a model for lacking identity evidence — the catalog widens
 *     what can be verified and never gates (spec §5 N1/N2).
 *   - THE ANIMATION LANE'S FAIL-CLOSED REFUSAL: a frozen snapshot's
 *     weights MUST digest, or the lane throws its named
 *     AnimationModelEvidenceError (never a name-only pass). The lane calls
 *     this module's digestWeightFile/weightFilePath and keeps its own
 *     refusal contract around them.
 *
 * READ-REACH (spec §4): hash-confirmed is exactly as wide as the configured
 * per-kind model roots — the same roots fetches land in, resolved through
 * fetchModelRootPath (scanner kinds via settings.paths[kind], else
 * <modelRoot>/<kind>; '' = unconfigured = the honest cap). Until the
 * wizard's Models-step designation sets those roots (landed D7 — audit
 * H-I3's dependency), everything renders name-suspected, honestly labeled:
 * AC-4's cap is the product-bar journey's DEFAULT state, not an edge case.
 * The app never downloads bytes to hash.
 *
 * MECHANICS (spec §6, plan rulings): hashing is LAZY — only files a pending
 * verdict needs; no boot sweep, no inventory walk. Digests stream in ONE
 * node:worker_threads worker behind a FIFO queue (a single digest stream —
 * one disk; parallel gigabyte reads thrash it — and the queue keeps every
 * caller off the main loop, remediation-plan §6 A-7), de-duplicated in
 * flight by absolute path. Results live in a stat-keyed LRU
 * (absPath → { mtimeNs:size, sha }) backed by the persistent sidecar
 * (B5): <app-data home>/hash-cache.json — a restart must not re-hash
 * 34 GB; strict stat-key invalidation (a replaced-under-same-name file
 * re-hashes — the animation lane's own requirement); atomic writes
 * (tmp + rename), debounced ~2 s after a settled digest; malformed file →
 * empty + one honest log (a restart's worst case is re-hashing, never a
 * wrong answer).
 *
 * THE SIZE PRE-FILTER (spec §6's cheap gate): stat first; a sizeBytes
 * matching no catalog row cannot hash-confirm — answered unknown without
 * reading bytes. requestIdentification applies it to every file it serves
 * (the plan's TDD step 3 rules the skip arm: an explicit ask that cannot
 * possibly confirm still answers unknown immediately — a digest with no
 * possible verdict upgrade is pure read cost; spec §6's explicit-ask
 * exception has no v1 caller).
 */
import { readFileSync, statSync } from 'node:fs'
import { mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { AppSettings, ModelFile, ModelKind } from '../src/types'
import { fetchModelRootPath } from './fetchCatalog'
import { loadHashCatalog, type CatalogIdentity, type HashCatalog } from './hashCatalog'
import { logger } from './logger'
import type { ModelContentIdentity } from '../shared/animation/types'

/** The spec §4 verdict: what a file IS, and how sure the seam is allowed to
 *  be. `hash-confirmed` — the app read the bytes locally and the sha matched
 *  a row; `name-suspected` — the alias index matched but there is no byte
 *  evidence (remote engine, unconfigured root, hash in flight); `unknown` —
 *  no match, fully usable, nothing changes for it (§5). */
export type ModelIdentityVerdict = {
  verdict: 'hash-confirmed' | 'name-suspected' | 'unknown'
  /** The matched row's identity. `aliases` rides hash-confirmed only (the
   *  H-M2 duplicate-bytes tie-break data). A name-suspected match whose
   *  alias bucket holds SEVERAL rows names NO identity — the name alone
   *  cannot pick (the taeh3 same-basename-different-bytes shape; the
   *  shipped catalog carries real such buckets). */
  identity?: CatalogIdentity & { aliases?: string[] }
}

/** The wire block (§2's pinned transport — ModelFile.identity, landed on
 *  the payloads by the wire task): the verdict vocabulary is CLOSED, the
 *  identity fields flatten from the matched row, `verifying` rides
 *  name-suspected while a digest is in flight (the interim vocabulary —
 *  spec §6's progressive reveal, owned HERE, rendered by the surfaces). */
export type ModelFileIdentity = {
  verdict: 'hash-confirmed' | 'name-suspected' | 'unknown'
  verifying?: boolean
  family?: string
  artifact?: string
  variant?: string
  quant?: string
  dtype?: string
  aliases?: string[]
}

/** A ModelFile carrying its (optional) identity block — the populate
 *  helpers' element shape. */
export type ModelFileWithIdentity = ModelFile & { identity?: ModelFileIdentity }

/** The named request-shape refusal (the route maps it to its 400): more
 *  than 64 files per identify call, or a malformed entry. The bound is a
 *  plan ruling — the wizard's rows + candidates fit; abuse-shaped bodies
 *  do not. */
export class ModelIdentityRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelIdentityRequestError'
  }
}

/** The request element (the identify route's body shape). */
export type IdentificationRequest = { kind: ModelKind; name: string }

// ---------------------------------------------------------------------------
// the hoisted containment guard (from server/animation/models.ts, verbatim)
// ---------------------------------------------------------------------------

/** Joins an enumerated name (which may carry subfolder segments — ComfyUI
 *  enumerates relative paths) under its folder, refusing any name that
 *  would escape the folder ('..' / absolute / empty segments) — a
 *  pathological enumeration can never turn the evidence read into an
 *  arbitrary-file digest. Hoisted verbatim from the animation lane
 *  (2026-10-20); the lane imports this one. */
export function weightFilePath(folder: string, name: string): string | null {
  const segments = name.split(/[\\/]/).map((segment) => segment.trim()).filter((segment) => segment.length > 0)
  if (segments.length === 0 || segments.some((segment) => segment === '..' || segment === '.')) return null
  const root = resolve(folder)
  const resolved = resolve(folder, ...segments)
  if (resolved !== root && !resolved.startsWith(root + sep)) return null
  return resolved
}

// ---------------------------------------------------------------------------
// the digest worker — ONE node:worker_threads stream
// ---------------------------------------------------------------------------

/** What a digest stream must do: hash ONE file's bytes, answer its sha256
 *  (or null when the bytes are unreadable — missing evidence, never a hash
 *  of nothing). Injectable so tests can count and serialize reads. */
export type DigestWorker = { hash(absPath: string): Promise<string | null>; close(): void }

/** The real stream: one eval'd worker thread (self-contained source — no
 *  sibling asset to compile or ship; tsc emits only JS and the worker must
 *  exist identically under vitest's TS source AND the built dist-server).
 *  Streaming sha256 — the file can be gigabytes, so it is never buffered
 *  whole (the fetcher's sha256File precedent). Unref'd: an idle worker
 *  never holds a process open. */
const WORKER_SOURCE = `
'use strict'
const { createHash } = require('node:crypto')
const { createReadStream } = require('node:fs')
const { pipeline } = require('node:stream/promises')
const { parentPort } = require('node:worker_threads')
parentPort.on('message', (job) => {
  try {
    const hash = createHash('sha256')
    pipeline(createReadStream(job.absPath), hash).then(
      () => parentPort.postMessage({ id: job.id, sha256: hash.digest('hex') }),
      () => parentPort.postMessage({ id: job.id, error: 'unreadable' }),
    )
  } catch {
    parentPort.postMessage({ id: job.id, error: 'unreadable' })
  }
})
`

function createDefaultWorker(): DigestWorker {
  const worker = new Worker(WORKER_SOURCE, { eval: true })
  worker.unref()
  const pending = new Map<number, (sha: string | null) => void>()
  let nextId = 1
  const settle = (id: number, sha: string | null) => {
    const waiting = pending.get(id)
    if (waiting === undefined) return
    pending.delete(id)
    waiting(sha)
  }
  worker.on('message', (message: { id: number; sha256?: string }) => settle(message.id, typeof message.sha256 === 'string' ? message.sha256 : null))
  // A dead worker answers nothing more: fail its waiters null (missing
  // evidence — the callers' named refusals), so the next hash never hangs.
  worker.on('error', () => {
    for (const id of [...pending.keys()]) settle(id, null)
  })
  worker.on('exit', () => {
    for (const id of [...pending.keys()]) settle(id, null)
  })
  return {
    hash: (absPath) =>
      new Promise((resolveJob) => {
        const id = nextId
        nextId += 1
        pending.set(id, resolveJob)
        worker.postMessage({ id, absPath })
      }),
    close: () => {
      void worker.terminate()
    },
  }
}

// ---------------------------------------------------------------------------
// the sidecar (B5) — <app-data home>/hash-cache.json
// ---------------------------------------------------------------------------

/** The persisted entry shape (the sidecar's own contract): absolute path →
 *  stat key + sha. Bytes are NOT persisted — they ride the live stat every
 *  consult already performs. */
type SidecarEntry = { statKey: string; sha256: string }
type SidecarShape = { entries: Record<string, SidecarEntry> }

const SIDECAR_FLUSH_MS = 2_000
const DIGEST_CACHE_MAX = 512

/** The sidecar path: <MONOKA_HOME ?? ~/.monoka>/hash-cache.json — the same
 *  app-data home server/index.ts resolves (dataHome.ts's move target).
 *  Resolved at first use, so test processes that point MONOKA_HOME at a
 *  scratch home keep the sidecar in the scratch (never the real home). */
export function resolveHashCachePath(env: NodeJS.ProcessEnv = process.env): string {
  const home = typeof env.MONOKA_HOME === 'string' && env.MONOKA_HOME.trim() ? env.MONOKA_HOME : join(homedir(), '.monoka')
  return join(home, 'hash-cache.json')
}

// ---------------------------------------------------------------------------
// the engine — one catalog + one cache + one sidecar + one worker stream
// ---------------------------------------------------------------------------

export type ModelIdentityEngineOptions = {
  /** Inject the lookup catalog (tests); defaults to the loader's own
   *  resolution (the shipped file, `MONOKA_HASH_CATALOG` override). */
  catalog?: HashCatalog
  /** Inject the sidecar path (tests); defaults to resolveHashCachePath(). */
  hashCachePath?: string
  /** Inject the digest stream (tests); defaults to the real worker. */
  createWorker?: () => DigestWorker
}

export type ModelIdentityEngine = {
  identifyModel(file: { name: string; kind: ModelKind }, sha256?: string): ModelIdentityVerdict
  attachIdentities(files: ModelFile[], settings: AppSettings): Promise<ModelFileWithIdentity[]>
  requestIdentification(files: IdentificationRequest[], settings: AppSettings): { results: ModelFileWithIdentity[] }
  /** The hoisted hasher (the animation lane delegates here): digest ONE
   *  file through cache + sidecar + worker. Null when the bytes are
   *  unreadable — the caller's named evidence refusal, never a hash of
   *  nothing. Stamps `catalogRowId` when the digest hits a row (B3's
   *  animation arm). */
  digestWeightFile(absPath: string, name: string): Promise<ModelContentIdentity | null>
  /** Settles once every queued/in-flight digest is done (tests, and any
   *  future caller that wants to await the upgrade). */
  drain(): Promise<void>
  /** Forces any pending sidecar write to disk now (tests; the exit hook). */
  flushNow(): Promise<void>
}

export function createModelIdentityEngine(options: ModelIdentityEngineOptions = {}): ModelIdentityEngine {
  // --- the catalog (lazy: one load, never a boot gate — the loader's
  // degradation contract answers for missing/malformed files).
  let catalog: HashCatalog | null = options.catalog ?? null
  const ensureCatalog = (): HashCatalog => {
    if (catalog === null) catalog = loadHashCatalog()
    return catalog
  }

  // --- the stat-keyed LRU: keyed by ABSOLUTE PATH, trusted only while the
  // file's (mtimeNs, size) stat pair is unchanged — a hit is never trusted
  // past the file's mtime, so a replaced file re-hashes (the animation
  // lane's own requirement). Bounded (512); a hit refreshes recency. The
  // residual (accepted, like every stat-keyed cache): bytes swapped while
  // preserving nanosecond mtime AND size — not a shape any real file
  // operation has.
  const memoryCache = new Map<string, { statKey: string; sha256: string }>()

  function rememberDigest(absPath: string, statKey: string, sha256: string): void {
    if (!memoryCache.has(absPath) && memoryCache.size >= DIGEST_CACHE_MAX) {
      const oldest = memoryCache.keys().next().value
      if (oldest !== undefined) memoryCache.delete(oldest)
    }
    memoryCache.set(absPath, { statKey, sha256 })
  }

  // --- the sidecar (B5), loaded lazily at first cache use; malformed file
  // → empty + ONE honest log (a restart's worst case is re-hashing, never
  // a wrong answer). Malformed ENTRIES drop into the same line's count.
  // The PATH resolves at first use too (not at engine creation): a test
  // process that points MONOKA_HOME at a scratch home after imports keeps
  // the sidecar in the scratch — never the real home.
  let resolvedSidecarPath: string | null = null
  const sidecarPath = (): string => {
    if (resolvedSidecarPath === null) resolvedSidecarPath = options.hashCachePath ?? resolveHashCachePath()
    return resolvedSidecarPath
  }
  let sidecar = new Map<string, SidecarEntry>()
  let sidecarLoaded = false
  let sidecarDirty = false
  let flushTimer: NodeJS.Timeout | null = null

  function loadSidecar(): void {
    if (sidecarLoaded) return
    sidecarLoaded = true
    let raw: string
    try {
      raw = readFileSync(sidecarPath(), 'utf8')
    } catch {
      return // absent (the common cold-start shape) — an empty cache answers
    }
    let wholeFileUnusable = false
    let droppedEntries = 0
    try {
      const parsed: unknown = JSON.parse(raw)
      const entries = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as SidecarShape).entries : undefined
      if (entries === undefined || entries === null || typeof entries !== 'object') {
        wholeFileUnusable = true
      } else {
        for (const [absPath, entry] of Object.entries(entries)) {
          const candidate = entry as Partial<SidecarEntry> | null
          if (candidate !== null && typeof candidate === 'object' && typeof candidate.statKey === 'string' && typeof candidate.sha256 === 'string' && /^[0-9a-f]{64}$/.test(candidate.sha256)) {
            sidecar.set(absPath, { statKey: candidate.statKey, sha256: candidate.sha256 })
          } else {
            droppedEntries += 1
          }
        }
      }
    } catch {
      wholeFileUnusable = true
    }
    if (wholeFileUnusable || droppedEntries > 0) {
      logger.warn(
        { scope: 'modelIdentity', path: sidecarPath(), droppedEntries, wholeFileUnusable },
        wholeFileUnusable
          ? 'hash cache is unusable — starting from the empty cache (restart cost: re-hash, never a wrong answer)'
          : 'hash cache had malformed entries — they were dropped (those files re-hash on next miss)',
      )
      if (wholeFileUnusable) sidecar = new Map()
    }
  }

  async function flushNow(): Promise<void> {
    if (flushTimer !== null) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    // Merge the live memory cache into the persistable set first — a fresh
    // digest lands in memory and must ride the next write. The merged set
    // keeps the same 512-entry bound (oldest insertion drops first).
    for (const [absPath, entry] of memoryCache) sidecar.set(absPath, entry)
    while (sidecar.size > DIGEST_CACHE_MAX) {
      const oldest = sidecar.keys().next().value
      if (oldest === undefined) break
      sidecar.delete(oldest)
    }
    if (!sidecarDirty) return
    sidecarDirty = false
    try {
      await mkdir(dirname(sidecarPath()), { recursive: true })
      const entries: Record<string, SidecarEntry> = {}
      for (const absPath of [...sidecar.keys()].sort()) entries[absPath] = sidecar.get(absPath) as SidecarEntry
      const tmp = `${sidecarPath()}.tmp`
      await writeFile(tmp, `${JSON.stringify({ entries }, null, 2)}\n`, 'utf8')
      await rename(tmp, sidecarPath()) // atomic — a reader never sees a half file
    } catch (error) {
      sidecarDirty = true // the memory copy stays truth; the next settle retries
      logger.warn({ scope: 'modelIdentity', path: sidecarPath(), reason: error instanceof Error ? error.message : 'write-failed' }, 'hash cache write failed — the in-memory cache keeps serving')
    }
  }

  function scheduleFlush(): void {
    sidecarDirty = true
    if (flushTimer !== null) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flushNow()
    }, SIDECAR_FLUSH_MS)
    flushTimer.unref?.() // an idle debounce never holds a process open
  }

  // --- the settled-digest consult: memory first, then the sidecar (a hit
  // seeds memory). STRICT stat-key validation against the LIVE stat — a
  // stale entry is invisible, never served.
  function settledDigestFor(absPath: string, statKey: string): string | null {
    loadSidecar()
    const cached = memoryCache.get(absPath)
    if (cached !== undefined) {
      if (cached.statKey === statKey) {
        memoryCache.delete(absPath)
        memoryCache.set(absPath, cached) // LRU refresh
        return cached.sha256
      }
      memoryCache.delete(absPath)
    }
    const persisted = sidecar.get(absPath)
    if (persisted !== undefined) {
      if (persisted.statKey === statKey) {
        rememberDigest(absPath, statKey, persisted.sha256)
        return persisted.sha256
      }
      sidecar.delete(absPath) // replaced under the same name — the entry is dead
    }
    return null
  }

  // --- the FIFO digest stream: one worker; the queue keeps every caller
  // off the main loop (A-7); in-flight requests dedup by absolute path.
  type QueueJob = { absPath: string; statKey: string; resolve: (sha: string | null) => void }
  const queue: QueueJob[] = []
  const inFlight = new Map<string, Promise<string | null>>()
  const idleWaiters: Array<() => void> = []
  let pumping = false
  let stream: DigestWorker | null = null

  const workerStream = (): DigestWorker => {
    if (stream === null) stream = options.createWorker ? options.createWorker() : createDefaultWorker()
    return stream
  }

  function pump(): void {
    if (pumping) return
    const job = queue.shift()
    if (job === undefined) {
      for (const waiter of idleWaiters.splice(0)) waiter()
      return
    }
    pumping = true
    void (async () => {
      let sha: string | null = null
      try {
        sha = await workerStream().hash(job.absPath)
      } catch {
        sha = null
      }
      if (sha !== null) {
        rememberDigest(job.absPath, job.statKey, sha)
        scheduleFlush() // a settled digest persists (B5's debounced write)
      }
      inFlight.delete(job.absPath)
      pumping = false
      job.resolve(sha)
      pump()
    })()
  }

  function enqueueDigest(absPath: string, statKey: string): Promise<string | null> {
    const existing = inFlight.get(absPath)
    if (existing !== undefined) return existing
    const shaPromise = new Promise<string | null>((resolveJob) => {
      queue.push({ absPath, statKey, resolve: resolveJob })
    })
    inFlight.set(absPath, shaPromise)
    pump()
    return shaPromise
  }

  // --- the derivations -----------------------------------------------------

  /** The §4 derivation, over this engine's indexes alone — no model-file
   *  I/O. The sha arm first (the only confirming evidence); the basename
   *  alias arm second; unknown otherwise. */
  function identifyInCatalog(current: HashCatalog, name: string, sha256?: string): ModelIdentityVerdict {
    if (typeof sha256 === 'string' && sha256.length > 0) {
      const row = current.bySha.get(sha256.toLowerCase())
      if (row) return { verdict: 'hash-confirmed', identity: { ...row.identity, aliases: [...row.aliases] } }
    }
    const base = basename(name).toLowerCase()
    const ids = base.length > 0 ? current.byAlias.get(base) : undefined
    if (ids !== undefined && ids.length > 0) {
      if (ids.length === 1) {
        const row = current.bySha.get(ids[0])
        if (row) return { verdict: 'name-suspected', identity: { ...row.identity } }
      }
      // Ambiguous bucket: the name matched several rows — the verdict says
      // what the evidence supports (a name match), never which row.
      return { verdict: 'name-suspected' }
    }
    return { verdict: 'unknown' }
  }

  function verdictToBlock(verdict: ModelIdentityVerdict): ModelFileIdentity {
    const block: ModelFileIdentity = { verdict: verdict.verdict }
    if (verdict.identity !== undefined) {
      block.family = verdict.identity.family
      block.artifact = verdict.identity.artifact
      block.variant = verdict.identity.variant
      block.quant = verdict.identity.quant
      block.dtype = verdict.identity.dtype
      // aliases ride hash-confirmed only (§2's wire clause).
      if (verdict.verdict === 'hash-confirmed' && verdict.identity.aliases !== undefined && verdict.identity.aliases.length > 0) block.aliases = verdict.identity.aliases
    }
    return block
  }

  return {
    identifyModel(file, sha256) {
      return identifyInCatalog(ensureCatalog(), file.name, sha256)
    },

    async attachIdentities(files, settings) {
      const current = ensureCatalog()
      // Degraded mode (the EMPTY catalog): today's behavior, bit for bit —
      // no identity block at all (the modularity contract: delete the
      // catalog file and nothing else moves).
      if (current.rows.length === 0) return files
      const results: ModelFileWithIdentity[] = []
      for (const file of files) {
        let block: ModelFileIdentity
        const root = fetchModelRootPath(file.kind, settings)
        const absPath = root === '' ? null : weightFilePath(root, file.name)
        const fileStat = absPath === null ? null : await stat(absPath, { bigint: true }).catch(() => null)
        const settled = fileStat !== null && fileStat.isFile() ? settledDigestFor(absPath as string, `${fileStat.mtimeNs}:${fileStat.size}`) : null
        if (settled !== null) {
          block = verdictToBlock(identifyInCatalog(current, file.name, settled))
        } else {
          // No readable bytes or no settled digest: the name-shape verdict
          // (never a hash-confirmed claim, never a hash — no route blocks
          // on bytes).
          block = verdictToBlock(identifyInCatalog(current, file.name))
        }
        results.push({ ...file, identity: block })
      }
      return results
    },

    requestIdentification(files, settings) {
      const current = ensureCatalog()
      if (!Array.isArray(files) || files.length > 64) {
        throw new ModelIdentityRequestError(`models/identify takes 1..64 files (got ${Array.isArray(files) ? files.length : 'not-an-array'}).`)
      }
      for (const file of files) {
        if (!file || typeof file !== 'object' || typeof file.kind !== 'string' || typeof file.name !== 'string') {
          throw new ModelIdentityRequestError('every identify entry needs string kind and name fields.')
        }
      }
      const results: ModelFileWithIdentity[] = []
      for (const file of files) {
        const entry: ModelFileWithIdentity = { name: file.name, kind: file.kind, bytes: 0 }
        const root = fetchModelRootPath(file.kind, settings)
        const absPath = root === '' ? null : weightFilePath(root, file.name)
        const fileStat = absPath === null ? null : syncStat(absPath)
        const statKey = fileStat !== null ? `${fileStat.mtimeNs}:${fileStat.size}` : ''
        const settled = fileStat !== null && fileStat.isFile() ? settledDigestFor(absPath as string, statKey) : null
        if (fileStat === null || !fileStat.isFile()) {
          entry.identity = verdictToBlock(identifyInCatalog(current, file.name)) // no readable bytes — the honest cap
        } else {
          const sizeBytes = Number(fileStat.size)
          entry.bytes = sizeBytes
          if (settled !== null) {
            entry.identity = verdictToBlock(identifyInCatalog(current, file.name, settled))
          } else if (!current.knownSizes.has(sizeBytes)) {
            // The size pre-filter (spec §6): a size matching no row cannot
            // hash-confirm — skip and answer unknown WITHOUT enqueueing.
            entry.identity = verdictToBlock(identifyInCatalog(current, file.name))
          } else {
            void enqueueDigest(absPath as string, statKey)
            entry.identity = verdictToBlock(identifyInCatalog(current, file.name))
            entry.identity.verifying = true
          }
        }
        results.push(entry)
      }
      return { results }
    },

    async digestWeightFile(absPath, name) {
      const fileStat = await stat(absPath, { bigint: true }).catch(() => null)
      if (fileStat === null || !fileStat.isFile()) return null
      const statKey = `${fileStat.mtimeNs}:${fileStat.size}`
      let sha = settledDigestFor(absPath, statKey)
      if (sha === null) {
        sha = await enqueueDigest(absPath, statKey)
        if (sha === null) return null
      }
      const identity: ModelContentIdentity = { name, digest: sha, bytes: Number(fileStat.size) }
      const row = ensureCatalog().bySha.get(sha)
      if (row !== undefined) identity.catalogRowId = row.sha256 // B3's animation arm
      return identity
    },

    drain() {
      if (queue.length === 0 && !pumping) return Promise.resolve()
      return new Promise<void>((resolveDrain) => {
        idleWaiters.push(resolveDrain)
      })
    },

    flushNow,
  }
}

/** statSync with bigint — the request path answers synchronously (the route
 *  never awaits bytes to mark verifying), so its stat is sync too. Null on
 *  any stat failure (absent/unreadable — the honest cap). */
function syncStat(absPath: string): { mtimeNs: bigint; size: bigint; isFile(): boolean } | null {
  try {
    const fileStat = statSync(absPath, { bigint: true })
    return fileStat.isFile() ? { mtimeNs: fileStat.mtimeNs, size: fileStat.size, isFile: () => true } : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// the app singleton — the free exports the spec pins (and every consumer
// but the tests reads)
// ---------------------------------------------------------------------------

const defaultEngine = createModelIdentityEngine()

/** The spec §4 signature, verbatim: the ONE derivation. Pure over the
 *  catalog indexes (no model-file I/O; the caller owns whether a sha
 *  exists). */
export function identifyModel(file: { name: string; kind: ModelKind }, sha256?: string): ModelIdentityVerdict {
  return defaultEngine.identifyModel(file, sha256)
}

/** The populate helper for routes: attaches identity blocks to a registry
 *  listing. Never hashes, never enqueues — settled-cache lookups only (no
 *  route ever blocks on bytes). */
export function attachIdentities(files: ModelFile[], settings: AppSettings): Promise<ModelFileWithIdentity[]> {
  return defaultEngine.attachIdentities(files, settings)
}

/** The lazy trigger core: stats, pre-filters, consults settled digests,
 *  enqueues what can possibly confirm, and answers immediately with the
 *  interim vocabulary (verifying rides name-suspected). Synchronous — the
 *  caller never waits on bytes. */
export function requestIdentification(files: IdentificationRequest[], settings: AppSettings): { results: ModelFileWithIdentity[] } {
  return defaultEngine.requestIdentification(files, settings)
}

/** The hoisted hasher (the animation lane's delegation target). */
export function digestWeightFile(absPath: string, name: string): Promise<ModelContentIdentity | null> {
  return defaultEngine.digestWeightFile(absPath, name)
}

/** Awaits the default engine's digest queue (tests and future callers). */
export function drainIdentification(): Promise<void> {
  return defaultEngine.drain()
}

/** Forces the default engine's sidecar flush (the exit hook + tests). */
export function flushIdentificationCache(): Promise<void> {
  return defaultEngine.flushNow()
}

// One exit hook for the default engine: the debounced sidecar write lands
// before a clean exit (best effort — beforeExit does not fire on a hard
// kill, and a lost write's cost is one re-hash, never a wrong answer).
process.once('beforeExit', () => {
  void flushIdentificationCache()
})
