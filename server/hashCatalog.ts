/**
 * The hash catalog's typed loader (task to7xpa7, spec
 * docs/specs/2026-10-17-hash-catalog.md §2, B1 ship-the-file).
 *
 * server/hashCatalog.json is the SHIPPED, APPEND-ONLY registry of known
 * weights: one row per distinct sha256, identity + provenance per row, the
 * golden-registry pattern extended to model files. This module is its read
 * seam: it resolves the file, validates it, and builds the three lookup
 * structures the seams above it need — `bySha` (the §2 identity answer),
 * `byAlias` (the publisher-basename secondary key, lowercased), and
 * `knownSizes` (the §6 size pre-filter's data).
 *
 * Degradation contract: a missing, unreadable, or malformed catalog is the
 * EMPTY catalog with ONE honest log line — never a throw. Deleting the file
 * must leave today's behavior intact (the catalog widens what the seams can
 * verify; it never gates a boot). Individually malformed rows are DROPPED
 * (counted in the same single log line) so one bad row cannot blank an
 * otherwise-good registry — silent drops are the cardinal sin, so the line
 * says exactly how many rows were dropped and how many kept.
 *
 * `MONOKA_HASH_CATALOG` (env, wins verbatim — the `MONOKA_START_CONFIG`
 * pattern from server/lanConfig.ts) is the documented dev/test seam: point
 * it at a fixture catalog to exercise the loaders above without touching
 * the shipped file. Pointing it at nothing is legitimate — the degradation
 * contract answers.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { logger } from './logger'

/** The §2 identity classification: what the file IS, in the studio's own
 *  vocabulary. `unknown` is an HONEST value wherever no in-repo evidence
 *  exists — never a plausible default. */
export type CatalogIdentity = {
  family: string
  artifact: string
  variant: string
  quant: string
  dtype: string
}

/** One row of the shipped catalog: a crawl-verified public sha. */
export type CatalogRow = {
  sha256: string
  sizeBytes: number
  /** The destination root the file lands in (diffusion_models, loras, vae,
   *  vae_approx, text_encoders, model_patches, vdn, geometry_estimation). */
  kind: string
  identity: CatalogIdentity
  source: { repo: string; revision: string; path: string }
  /** The publisher path's basename(s) — the secondary key (byAlias). */
  aliases: string[]
  addedAt: string
}

/** A B4 gap: an artifact we know exists but whose sha is unrecoverable
 *  (license-gated repos mask the LFS oid from anonymous API reads). Lives
 *  in `envelope.gaps`, NEVER in rows — rows stay sha-keyed and the indexes
 *  stay total. The gap record's presence is the spec's "row present, sha
 *  marked unrecoverable". */
export type CatalogGap = {
  repo: string
  revision: string
  path: string
  sizeBytes?: number
  kind: string
  identity: CatalogIdentity
  reason: string
  addedAt: string
}

/** The parsed document shape (the envelope the file carries). */
export type HashCatalogEnvelope = {
  version: number
  generatedAt: string
  crawl: Array<{ repo: string; revision: string; fetchedAt: string }>
  gaps: CatalogGap[]
  rows: CatalogRow[]
}

/** The envelope plus the indexes built once at load. */
export type HashCatalog = HashCatalogEnvelope & {
  bySha: Map<string, CatalogRow>
  byAlias: Map<string, string[]>
  knownSizes: Set<number>
}

const SHA_RE = /^[0-9a-f]{64}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** The EMPTY catalog: what every seam sees when the file is absent or
 *  unusable. Fresh objects per call — callers may hold and inspect without
 *  sharing mutable state. */
function emptyHashCatalog(): HashCatalog {
  return {
    version: 1,
    generatedAt: '',
    crawl: [],
    gaps: [],
    rows: [],
    bySha: new Map(),
    byAlias: new Map(),
    knownSizes: new Set(),
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function parseIdentity(value: unknown): CatalogIdentity | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  for (const key of ['family', 'artifact', 'variant', 'quant', 'dtype']) {
    if (!nonEmptyString(record[key])) return null
  }
  return record as unknown as CatalogIdentity
}

/** Strict row validation: anything that fails is DROPPED (and counted in
 *  the one log line), never silently loosened. */
function parseRow(value: unknown): CatalogRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.sha256 !== 'string' || !SHA_RE.test(record.sha256)) return null
  if (typeof record.sizeBytes !== 'number' || !Number.isSafeInteger(record.sizeBytes) || record.sizeBytes <= 0) return null
  if (!nonEmptyString(record.kind)) return null
  const identity = parseIdentity(record.identity)
  if (!identity) return null
  if (!record.source || typeof record.source !== 'object') return null
  const source = record.source as Record<string, unknown>
  if (!nonEmptyString(source.repo) || !nonEmptyString(source.revision) || !nonEmptyString(source.path)) return null
  if (!Array.isArray(record.aliases) || !record.aliases.every((alias) => nonEmptyString(alias))) return null
  if (typeof record.addedAt !== 'string' || !DATE_RE.test(record.addedAt)) return null
  return {
    sha256: record.sha256,
    sizeBytes: record.sizeBytes,
    kind: record.kind,
    identity,
    source: { repo: source.repo, revision: source.revision, path: source.path },
    aliases: record.aliases,
    addedAt: record.addedAt,
  }
}

function parseGap(value: unknown): CatalogGap | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (!nonEmptyString(record.repo) || !nonEmptyString(record.revision) || !nonEmptyString(record.path)) return null
  if (record.sizeBytes !== undefined && (typeof record.sizeBytes !== 'number' || !Number.isSafeInteger(record.sizeBytes) || record.sizeBytes <= 0)) return null
  if (!nonEmptyString(record.kind)) return null
  const identity = parseIdentity(record.identity)
  if (!identity) return null
  if (!nonEmptyString(record.reason) || typeof record.addedAt !== 'string' || !DATE_RE.test(record.addedAt)) return null
  return {
    repo: record.repo,
    revision: record.revision,
    path: record.path,
    ...(record.sizeBytes !== undefined ? { sizeBytes: record.sizeBytes } : {}),
    kind: record.kind,
    identity,
    reason: record.reason,
    addedAt: record.addedAt,
  }
}

/** Where the catalog lives: `MONOKA_HASH_CATALOG` wins verbatim when set
 *  (pointing it nowhere is legitimate — the EMPTY catalog answers), else the
 *  walk: at EACH level from this module's directory upward, probe (a) the
 *  file beside the module and (b) `<level>/server/hashCatalog.json`. Probe
 *  (b) is the one that matters from the BUILT layout: the compiled module
 *  runs at `<repo>/dist-server/server/`, and the shipped catalog is a
 *  SIBLING of dist-server (`<repo>/server/`) — never an ancestor — so an
 *  ancestor-only walk ENOENTs forever in production while staying green
 *  under vitest (which imports the TS source, where probe (a) hits at level
 *  0). The walk hits at repo-root depth 2 from the build output; tsc does
 *  not emit JSON, so there is no dist copy — the append-gated source file
 *  IS the artifact, single-sourced. (If a future packaged build ships
 *  without the repo tree, adding the json to the build copy step composes:
 *  probe (a) is already first in line.) */
export function resolveHashCatalogPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.MONOKA_HASH_CATALOG
  if (typeof override === 'string' && override.trim()) return override
  let directory = __dirname
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(directory, 'hashCatalog.json'))) return join(directory, 'hashCatalog.json')
    if (existsSync(join(directory, 'server', 'hashCatalog.json'))) return join(directory, 'server', 'hashCatalog.json')
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return join(__dirname, 'hashCatalog.json')
}

/** Load the hash catalog: read, validate, index. Never throws — the
 *  degradation contract is the API. ONE log line when the file is unusable
 *  or rows had to be dropped; silent on the healthy load. */
export function loadHashCatalog(env: NodeJS.ProcessEnv = process.env): HashCatalog {
  const filePath = resolveHashCatalogPath(env)
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (error) {
    logger.warn({ scope: 'hashCatalog', path: filePath, reason: (error as NodeJS.ErrnoException).code ?? 'unreadable' }, 'hash catalog unreadable — serving the EMPTY catalog')
    return emptyHashCatalog()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    logger.warn({ scope: 'hashCatalog', path: filePath, reason: 'not-valid-json' }, 'hash catalog is not valid JSON — serving the EMPTY catalog')
    return emptyHashCatalog()
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    logger.warn({ scope: 'hashCatalog', path: filePath, reason: 'not-an-object' }, 'hash catalog is not an object — serving the EMPTY catalog')
    return emptyHashCatalog()
  }
  const envelope = parsed as Record<string, unknown>
  if (envelope.version !== 1) {
    logger.warn({ scope: 'hashCatalog', path: filePath, version: envelope.version }, 'hash catalog envelope version is unknown — serving the EMPTY catalog')
    return emptyHashCatalog()
  }
  if (!Array.isArray(envelope.rows)) {
    logger.warn({ scope: 'hashCatalog', path: filePath, reason: 'rows-not-an-array' }, 'hash catalog rows are not an array — serving the EMPTY catalog')
    return emptyHashCatalog()
  }

  // Row-by-row: a malformed row is dropped and counted, not fatal. The same
  // sha twice is also a drop (first wins) — one row per DISTINCT sha is the
  // file's own contract.
  const bySha = new Map<string, CatalogRow>()
  const byAlias = new Map<string, string[]>()
  const knownSizes = new Set<number>()
  let dropped = 0
  let duplicate = 0
  for (const value of envelope.rows) {
    const row = parseRow(value)
    if (!row) {
      dropped += 1
      continue
    }
    if (bySha.has(row.sha256)) {
      duplicate += 1
      continue
    }
    bySha.set(row.sha256, row)
    knownSizes.add(row.sizeBytes)
    for (const alias of row.aliases) {
      const key = alias.toLowerCase()
      const ids = byAlias.get(key)
      if (ids) {
        if (!ids.includes(row.sha256)) ids.push(row.sha256)
      } else {
        byAlias.set(key, [row.sha256])
      }
    }
  }
  // Buckets sort ascending by sha: lookups are file-order-independent (the
  // file's row order is the generator's canonical sha sort, but a fixture
  // need not be — the ANSWER should not depend on it).
  for (const ids of byAlias.values()) ids.sort()

  const gaps: CatalogGap[] = []
  for (const value of Array.isArray(envelope.gaps) ? envelope.gaps : []) {
    const gap = parseGap(value)
    if (gap) gaps.push(gap)
    else dropped += 1
  }

  const crawl: Array<{ repo: string; revision: string; fetchedAt: string }> = []
  for (const value of Array.isArray(envelope.crawl) ? envelope.crawl : []) {
    const entry = value as Record<string, unknown>
    if (nonEmptyString(entry.repo) && nonEmptyString(entry.revision) && nonEmptyString(entry.fetchedAt)) {
      crawl.push({ repo: entry.repo, revision: entry.revision, fetchedAt: entry.fetchedAt })
    } else {
      dropped += 1
    }
  }

  if (dropped > 0 || duplicate > 0) {
    logger.warn({ scope: 'hashCatalog', path: filePath, dropped, duplicate, kept: bySha.size }, 'hash catalog had malformed or duplicate entries — they were dropped (this is the ONE honest line)')
  }

  return { version: 1, generatedAt: typeof envelope.generatedAt === 'string' ? envelope.generatedAt : '', crawl, gaps, rows: [...bySha.values()], bySha, byAlias, knownSizes }
}
