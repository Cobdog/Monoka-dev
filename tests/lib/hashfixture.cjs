'use strict'
/** Shared fixture builder for the hash-catalog wire tests (task to7xpa7).
 *
 * Writes REAL bytes into a scratch model root, computes their real sha256s,
 * and emits fixture catalog files strict enough to pass the loader's row
 * validation (suites point MONOKA_HASH_CATALOG at them — the documented
 * dev/test seam — so the rows answer to the same checks the shipped file
 * does). One helper so every suite that needs "a file + its row" builds
 * them the same way: the identitywire suite's engine listings, and the
 * fetcher suite's catalog-stamp leg.
 *
 * Nothing here touches process.env — the catalog PATH is returned for the
 * caller to hand to whatever consumes it (a spawned server's env, a direct
 * loadHashCatalog call), so parallel legs never fight over the process. */

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const sha256Of = (content) => crypto.createHash('sha256').update(content).digest('hex')

/** Writes content at <root>/<relName> (subdirectories created — engine
 *  enumerations carry subpaths verbatim), returning { abs, sha, bytes }:
 *  the real digest of the real bytes on disk. */
function writeFixtureFile(root, relName, content) {
  const abs = path.join(root, relName)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  return { abs, sha: sha256Of(content), bytes: content.length }
}

/** One catalog row in the loader's shape (loadHashCatalog's strict row
 *  validation runs on every fixture — same rules as the shipped file).
 *  identity carries the five CatalogIdentity fields; aliases is the
 *  publisher-basename secondary key. */
function catalogRow({ sha256, sizeBytes, kind, identity, aliases, source }) {
  return {
    sha256,
    sizeBytes,
    kind,
    identity: {
      family: identity.family,
      artifact: identity.artifact,
      variant: identity.variant,
      quant: identity.quant,
      dtype: identity.dtype,
    },
    source: source ?? { repo: 'fixture/hashfixture', revision: 'f1x0', path: aliases[0] },
    aliases,
    addedAt: '2026-10-20',
  }
}

/** Writes the envelope into dir under a unique name and returns the path.
 *  rows: [] is the healthy EMPTY catalog — the degraded boot's fixture. */
function writeCatalogFile(dir, rows) {
  const catalogPath = path.join(dir, `hash-catalog-${rows.length}-${Math.random().toString(36).slice(2, 8)}.json`)
  fs.writeFileSync(catalogPath, JSON.stringify({ version: 1, generatedAt: '2026-10-20', crawl: [], gaps: [], rows }))
  return catalogPath
}

/** Deterministic pseudo-weight bytes: a label header followed by filler, so
 *  two fixtures never collide by accident and every size is exact. */
function fixtureBytes(label, size) {
  const head = Buffer.from(`monoka-fixture:${label}:${size}\n`, 'utf8')
  return Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length), 0x2f)])
}

module.exports = { sha256Of, writeFixtureFile, catalogRow, writeCatalogFile, fixtureBytes }
