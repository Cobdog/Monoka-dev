#!/usr/bin/env node
'use strict'

/**
 * Registry-append verification (task eg6l3v5, remediation-plan §6 A-CI;
 * hash-catalog legs task to7xpa7).
 *
 * Runs on MAIN merges only (the full-gate "contracts" job): the golden
 * registry fixtures' entry sets AND the hash catalog's row/gap sets are
 * APPEND-ONLY across a merge — a key that existed on the previous main and
 * vanished on the new one fails the gate. Additions are free;
 * removals/modifications are deliberate acts that must go through a
 * conscious regeneration (and land with a plan note), not ride a merge
 * silently.
 *
 *   node scripts/check-registry-append.cjs <old-ref> <new-ref>
 *
 * e.g.  node scripts/check-registry-append.cjs HEAD~1 HEAD
 *
 * Two fixture classes:
 *   - FIXTURES: the golden registries ({ entries: { name: … } }), keyed by
 *     entry name. A file missing at BOTH refs is skipped (the script must
 *     stay self-testable over a scratch repo); missing at one ref reads as
 *     an empty key set, so a vanished golden fails and a freshly-landed one
 *     passes.
 *   - CATALOGS: server/hashCatalog.json — rows keyed by sha256, gaps keyed
 *     by `repo|path` (a gap names an artifact whose sha is unrecoverable,
 *     so repo+path is its identity). The catalog may legitimately be absent
 *     at the old ref (its first landing) — that reads as an empty old key
 *     set; absent at the NEW ref is every key removed and fails.
 *
 * The drift direction (committed goldens vs what the code generates TODAY)
 * is the SEPARATE golden-regeneration check in .github/workflows/ci.yml
 * (MONOKA_UPDATE_GOLDEN=1 + git diff --exit-code); this script only
 * guards the append direction across the merge boundary.
 */

const { execFileSync } = require('node:child_process')

/** The golden fixtures whose entry sets are the registry contract. */
const FIXTURES = ['scripts/fixtures/registry-golden.json', 'scripts/fixtures/krea2edit-golden.json']

/** The hash catalogs whose row/gap sets are append-only (the generated
 *  data files; the golden-registry pattern extended to model files). */
const CATALOGS = ['server/hashCatalog.json']

/** Sorted entry keys of a parsed fixture ({ entries: { name: … } }). */
function extractEntryKeys(parsed) {
  return Object.keys(parsed?.entries ?? {}).sort()
}

/** Sorted key sets of a parsed hash catalog: rows as their sha256, gaps as
 *  `repo|path`. Malformed entries are skipped here — the loader (server/
 *  hashCatalog.ts) already degrades honestly on them; the gate only needs
 *  the key sets, and a row malformed enough to lack a sha cannot be
 *  append-checked by sha. */
function extractCatalogKeys(parsed) {
  const rows = (Array.isArray(parsed?.rows) ? parsed.rows : [])
    .map((row) => (row && typeof row.sha256 === 'string' ? row.sha256 : ''))
    .filter((key) => key !== '')
    .sort()
  const gaps = (Array.isArray(parsed?.gaps) ? parsed.gaps : [])
    .map((gap) => (gap && typeof gap.repo === 'string' && typeof gap.path === 'string' ? `${gap.repo}|${gap.path}` : ''))
    .filter((key) => key !== '')
    .sort()
  return { rows, gaps }
}

/** Keys present in old but missing from new (the forbidden direction). */
function removedKeys(oldKeys, newKeys) {
  const present = new Set(newKeys)
  return oldKeys.filter((key) => !present.has(key))
}

function gitHasFile(ref, fixture) {
  try {
    // The probe's stderr is silenced: a missing path is the EXPECTED no
    // answer here (the catalog's first landing, a scratch test repo), not
    // an alarm. The readFixtureAt calls below still surface real errors.
    execFileSync('git', ['cat-file', '-e', `${ref}:${fixture}`], { stdio: ['ignore', 'ignore', 'ignore'] })
    return true
  } catch {
    return false
  }
}

function readFixtureAt(ref, fixture) {
  const stdout = execFileSync('git', ['show', `${ref}:${fixture}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  return JSON.parse(stdout)
}

function reportRemoved(fixture, label, removed) {
  console.error(`FAIL - ${fixture}: ${label} are APPEND-ONLY across main merges; these vanished:`)
  for (const key of removed) console.error(`  - ${key}`)
  console.error('  If the removal is deliberate (a family/entry retirement, a conscious regeneration),')
  console.error('  it must land with a remediation-plan note — not silently inside a merge.')
}

function main() {
  const [oldRef, newRef] = process.argv.slice(2)
  if (!oldRef || !newRef) {
    console.error('usage: node scripts/check-registry-append.cjs <old-ref> <new-ref>')
    process.exit(2)
  }
  let failures = 0
  let checked = 0
  for (const fixture of FIXTURES) {
    const oldExists = gitHasFile(oldRef, fixture)
    const newExists = gitHasFile(newRef, fixture)
    if (!oldExists && !newExists) continue
    checked += 1
    const oldKeys = extractEntryKeys(oldExists ? readFixtureAt(oldRef, fixture) : { entries: {} })
    const newKeys = extractEntryKeys(newExists ? readFixtureAt(newRef, fixture) : { entries: {} })
    const removed = removedKeys(oldKeys, newKeys)
    const added = newKeys.filter((key) => !oldKeys.includes(key))
    if (removed.length > 0) {
      failures += 1
      reportRemoved(fixture, 'registry entries', removed)
    } else {
      console.log(`OK - ${fixture}: ${newKeys.length} entries (${added.length} appended, 0 removed)`)
    }
  }
  for (const catalog of CATALOGS) {
    const oldExists = gitHasFile(oldRef, catalog)
    const newExists = gitHasFile(newRef, catalog)
    if (!oldExists && !newExists) continue
    checked += 1
    if (!newExists) {
      failures += 1
      console.error(`FAIL - ${catalog}: the catalog vanished at ${newRef} — every row and gap counts as removed.`)
      continue
    }
    let newParsed
    let oldParsed
    try {
      newParsed = readFixtureAt(newRef, catalog)
      oldParsed = oldExists ? readFixtureAt(oldRef, catalog) : { rows: [], gaps: [] }
    } catch (error) {
      failures += 1
      console.error(`FAIL - ${catalog}: not valid JSON at the compared refs (${error.message.split('\n')[0]}).`)
      continue
    }
    const oldKeys = extractCatalogKeys(oldParsed)
    const newKeys = extractCatalogKeys(newParsed)
    const addedRows = newKeys.rows.filter((key) => !oldKeys.rows.includes(key))
    const addedGaps = newKeys.gaps.filter((key) => !oldKeys.gaps.includes(key))
    const removedRows = removedKeys(oldKeys.rows, newKeys.rows)
    const removedGaps = removedKeys(oldKeys.gaps, newKeys.gaps)
    if (removedRows.length > 0 || removedGaps.length > 0) {
      failures += 1
      if (removedRows.length > 0) reportRemoved(catalog, 'catalog rows', removedRows)
      if (removedGaps.length > 0) reportRemoved(catalog, 'catalog gaps', removedGaps)
    } else {
      console.log(`OK - ${catalog}: ${newKeys.rows.length} rows + ${newKeys.gaps.length} gaps (${addedRows.length + addedGaps.length} appended, 0 removed)`)
    }
  }
  // The vacuous-skip belt: both fixture classes absent at both refs means
  // NOTHING was checked — a silent exit 0 there would green-light a merge
  // whose append contract was never evaluated.
  if (checked === 0) {
    console.error(`FAIL - no fixture class matched at either ref (goldens: ${FIXTURES.join(', ')}; catalogs: ${CATALOGS.join(', ')}) — the append contract was not evaluated, refusing to pass vacuously.`)
    process.exit(1)
  }
  process.exit(failures > 0 ? 1 : 0)
}

if (require.main === module) main()

module.exports = { FIXTURES, CATALOGS, extractEntryKeys, extractCatalogKeys, removedKeys }
