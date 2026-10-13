// The MONOKA rename-sweep Task 3 suite (Flux campaign xmmaynx): the on-disk
// + wire names — folders MOVED once, contracts NEW-ONLY, zero back-compat
// (plan ruling R6; the R11 archive edge is DELIBERATE).
//
//   (a) the one-time idle-safe folder move: the legacy engine-input
//       subfolders (minimax-desktop/-mobile/-mobile-references) and the
//       output display folders ('MiniMax Studio Frames', 'MiniMax Studio
//       Reference Clips', 'MiniMax Character References') rename(2) to the
//       monoka names — files intact, old paths absent, a dated marker notes
//       completion, and a later boot does NOT re-move (one-time semantics).
//   (b) a busy job queue defers the move: nothing renames, no marker — the
//       next idle boot performs it (plan review focus 3: an in-flight job's
//       asset is never stranded mid-move).
//   (c) a target collision (legacy AND new folder present) refuses LOUDLY
//       naming both paths — never merge, never overwrite (R5's shape) — and
//       moves NOTHING (the scan runs before the first rename).
//   (d) a fresh install (no legacy folders anywhere) writes the marker with
//       an empty move list — the decision is settled, not retried forever.
//   (e) the engine-input arm engages only when the nominated checkout
//       actually has an input tree (external/unknown checkout ⇒ skip).
//   (f) the R11 edge: a pre-rename archive (manifest marker
//       'minimax-canvas-archive') import REFUSES loudly with the unknown-
//       format error; a current-marker archive round-trips — proving the
//       refusal is the legacy marker's doing, not a broken importer.
//
// No server boot, no ports (the rename-migration suite's direct dist-server
// discipline): run after `pnpm build:server`. Scratch dirs ride the Wave 4
// ledger (tests/lib/scratch.cjs).
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
const { makeScratchDir, removeAllScratchDirs } = require('./lib/scratch.cjs')

const { migrateStudioFolders, ENGINE_INPUT_FOLDER_MOVES, OUTPUT_DISPLAY_FOLDER_MOVES } = require(path.join(REPO, 'dist-server/server/folderMigration.js'))
const { createStudioRepository } = require(path.join(REPO, 'dist-server/server/repo.js'))
const { packZip, unpackZip, exportProjectArchive, importProjectArchive } = require(path.join(REPO, 'dist-server/server/documentArchive.js'))

let assertions = 0
const check = (condition, message) => {
  assert.ok(condition, message)
  assertions += 1
}
afterAll(() => {
  console.log(`rename-disk: ${assertions} assertions`)
  void removeAllScratchDirs()
})

const scratch = (label) => makeScratchDir(path.join(os.tmpdir(), `monoka-rename-disk-${label}-`))

/** Seeds one legacy tree: an output directory with the three display folders
 *  (files + the filmstrip cache subdir inside Frames) and an engine checkout
 *  whose input tree carries the three upload subfolders. */
function seedLegacyTrees(home) {
  const outputDirectory = path.join(home, 'data', 'output')
  for (const [folder, files] of [
    ['MiniMax Studio Frames', ['frame_a.png', '.filmstrips/sheet.png']],
    ['MiniMax Studio Reference Clips', ['clip_a.mp4']],
    ['MiniMax Character References', ['character-1.png']],
  ]) {
    for (const file of files) {
      fs.mkdirSync(path.join(outputDirectory, folder, path.dirname(file)), { recursive: true })
      fs.writeFileSync(path.join(outputDirectory, folder, file), `bytes:${folder}/${file}`)
    }
  }
  const engineCheckoutPath = path.join(home, 'engine')
  for (const folder of ['minimax-desktop', 'minimax-mobile', 'minimax-mobile-references']) {
    fs.mkdirSync(path.join(engineCheckoutPath, 'input', folder), { recursive: true })
    fs.writeFileSync(path.join(engineCheckoutPath, 'input', folder, 'asset.bin'), `bytes:${folder}`)
  }
  return { outputDirectory, engineCheckoutPath }
}

const migrate = (options) => migrateStudioFolders({ activeJobs: 0, ...options })

test('(a) an idle boot moves both trees once, records the dated marker, and later boots re-move nothing', () => {
  const home = scratch('idle')
  const { outputDirectory, engineCheckoutPath } = seedLegacyTrees(home)
  const markerFile = path.join(home, 'monoka-folder-move.json')

  const result = migrate({ outputDirectory, engineCheckoutPath, markerFile, activeJobs: 0 })
  check(result.status === 'moved', `status is moved (got ${result.status})`)
  check(result.moved.length === ENGINE_INPUT_FOLDER_MOVES.length + OUTPUT_DISPLAY_FOLDER_MOVES.length, `every legacy folder rode the move (got ${result.moved.length})`)

  // New paths exist, old paths absent, bytes intact — engine tree.
  for (const move of ENGINE_INPUT_FOLDER_MOVES) {
    const newPath = path.join(engineCheckoutPath, 'input', move.to)
    check(fs.existsSync(path.join(newPath, 'asset.bin')), `${move.to} exists with its file`)
    check(fs.readFileSync(path.join(newPath, 'asset.bin'), 'utf8') === `bytes:${move.from}`, `${move.to} carries the original bytes`)
    check(!fs.existsSync(path.join(engineCheckoutPath, 'input', move.from)), `${move.from} is gone (rename(2), not a copy)`)
  }
  // Display folders — same, including the nested filmstrip cache.
  for (const move of OUTPUT_DISPLAY_FOLDER_MOVES) {
    const newPath = path.join(outputDirectory, move.to)
    check(fs.existsSync(newPath), `${move.to} exists`)
    check(!fs.existsSync(path.join(outputDirectory, move.from)), `${move.from} is gone`)
  }
  check(fs.existsSync(path.join(outputDirectory, 'Monoka Studio Frames', '.filmstrips', 'sheet.png')), 'the nested filmstrip cache moved with its parent')

  // The dated marker notes completion.
  check(fs.existsSync(markerFile), 'the completion marker was written')
  const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'))
  check(typeof marker.completedAt === 'string' && !Number.isNaN(Date.parse(marker.completedAt)), `the marker is dated (got ${marker.completedAt})`)
  check(marker.moves.length === result.moved.length, 'the marker records every move')

  // One-time: a LATER boot does not re-move — a new legacy-named folder that
  // appears after completion stays put (the marker settles the decision).
  const straggler = path.join(engineCheckoutPath, 'input', 'minimax-desktop')
  fs.mkdirSync(straggler, { recursive: true })
  const later = migrate({ outputDirectory, engineCheckoutPath, markerFile, activeJobs: 0 })
  check(later.status === 'already-done', `a later boot is already-done (got ${later.status})`)
  check(fs.existsSync(straggler), 'a post-marker legacy folder is NOT re-moved (one-time semantics)')
})

test('(b) a busy job queue defers the move; the next idle boot performs it', () => {
  const home = scratch('busy')
  const { outputDirectory, engineCheckoutPath } = seedLegacyTrees(home)
  const markerFile = path.join(home, 'monoka-folder-move.json')

  const deferred = migrate({ outputDirectory, engineCheckoutPath, markerFile, activeJobs: 2 })
  check(deferred.status === 'idle-deferred', `status is idle-deferred (got ${deferred.status})`)
  check(deferred.activeJobs === 2, 'the result reports the busy count')
  check(fs.existsSync(path.join(engineCheckoutPath, 'input', 'minimax-desktop', 'asset.bin')), 'a busy queue strands NOTHING: the legacy folder is untouched')
  check(fs.existsSync(path.join(outputDirectory, 'MiniMax Studio Frames', 'frame_a.png')), 'the display folders are untouched too')
  check(!fs.existsSync(path.join(engineCheckoutPath, 'input', 'monoka-desktop')), 'no new folder appeared mid-queue')
  check(!fs.existsSync(markerFile), 'no marker on a deferred boot (the next idle boot retries)')

  const idle = migrate({ outputDirectory, engineCheckoutPath, markerFile, activeJobs: 0 })
  check(idle.status === 'moved', `the next idle boot moves (got ${idle.status})`)
  check(fs.existsSync(path.join(engineCheckoutPath, 'input', 'monoka-desktop', 'asset.bin')), 'the deferred move lands whole')
})

test('(c) a target collision refuses loudly, names both paths, and moves nothing', () => {
  const home = scratch('collision')
  const { outputDirectory, engineCheckoutPath } = seedLegacyTrees(home)
  const markerFile = path.join(home, 'monoka-folder-move.json')
  // The collision: BOTH sides of one engine pair exist (the ambiguous state
  // no code may resolve on the user's behalf).
  fs.mkdirSync(path.join(engineCheckoutPath, 'input', 'monoka-desktop'), { recursive: true })

  let refused = null
  try {
    migrate({ outputDirectory, engineCheckoutPath, markerFile, activeJobs: 0 })
  } catch (error) {
    refused = error
  }
  check(refused !== null, 'the collision refuses (throws)')
  check(/refus/i.test(refused.message), `the refusal says why (got: ${refused.message.slice(0, 120)})`)
  check(refused.message.includes(path.join(engineCheckoutPath, 'input', 'minimax-desktop')) && refused.message.includes(path.join(engineCheckoutPath, 'input', 'monoka-desktop')), 'the refusal names BOTH paths')
  // Scan-before-move: the OTHER pairs (display folders included) are
  // untouched — a refusal never leaves a half-moved boot.
  check(fs.existsSync(path.join(outputDirectory, 'MiniMax Studio Frames', 'frame_a.png')), 'the display folders were not moved either')
  check(fs.existsSync(path.join(engineCheckoutPath, 'input', 'minimax-mobile', 'asset.bin')), 'the non-colliding engine pairs were not moved either')
  check(!fs.existsSync(markerFile), 'no marker on a refused boot')
})

test('(d) a fresh install settles the marker with nothing to move', () => {
  const home = scratch('fresh')
  const outputDirectory = path.join(home, 'data', 'output')
  fs.mkdirSync(outputDirectory, { recursive: true })
  const markerFile = path.join(home, 'monoka-folder-move.json')

  const result = migrate({ outputDirectory, engineCheckoutPath: '', markerFile, activeJobs: 0 })
  check(result.status === 'nothing-to-do', `status is nothing-to-do (got ${result.status})`)
  check(result.moved.length === 0, 'nothing moved')
  check(fs.existsSync(markerFile), 'the marker settles the decision on a fresh install')
})

test('(e) the engine arm engages only when the checkout has an input tree', () => {
  const home = scratch('checkout')
  const outputDirectory = path.join(home, 'data', 'output')
  for (const folder of ['MiniMax Studio Frames']) {
    fs.mkdirSync(path.join(outputDirectory, folder), { recursive: true })
    fs.writeFileSync(path.join(outputDirectory, folder, 'frame.png'), 'bytes')
  }
  const markerFile = path.join(home, 'monoka-folder-move.json')
  // Empty checkout (external engine, path unknown): display folders move,
  // the engine arm skips silently — there is nothing observable to act on.
  const noCheckout = migrate({ outputDirectory, engineCheckoutPath: '', markerFile, activeJobs: 0 })
  check(noCheckout.status === 'moved' && noCheckout.moved.length === 1, `only the display folder moved (got ${noCheckout.moved.length})`)
  fs.rmSync(markerFile)
  // A checkout WITHOUT an input tree: same skip.
  const bareCheckout = path.join(home, 'bare-engine')
  fs.mkdirSync(bareCheckout, { recursive: true })
  const result = migrate({ outputDirectory, engineCheckoutPath: bareCheckout, markerFile, activeJobs: 0 })
  check(result.status === 'nothing-to-do', `a checkout with no input tree moves nothing (got ${result.status})`)
})

test('(f) the R11 edge: a pre-rename archive refuses loudly; a current archive round-trips', () => {
  // A real store on a scratch db (no server boot) seeds the positive control.
  const homeA = scratch('archive-a')
  const storeA = createStudioRepository(path.join(homeA, 'studio.db'))
  const project = storeA.documents.createProject({ name: 'Archive source' })
  storeA.documents.createChain({ projectId: project.id, inputSpec: { fresh: { prompt: 'a lighthouse at dusk' } } })
  const { archive } = exportProjectArchive(storeA.documents, project.id)
  storeA.close()

  // The positive control FIRST: the current marker imports cleanly, so the
  // refusal below is the legacy marker's doing, not a broken importer.
  const homeB = scratch('archive-b')
  const storeB = createStudioRepository(path.join(homeB, 'studio.db'))
  const imported = importProjectArchive(storeB.documents, archive)
  check(imported.counts.chains === 1, 'a current-marker archive imports (control)')
  storeB.close()

  // Now the SAME archive carrying the PRE-RENAME marker — R11: it refuses
  // loudly. Zero back-compat is the pinned intent, not a regression.
  const files = unpackZip(archive)
  const legacyManifest = JSON.parse(files.get('manifest.json'))
  check(legacyManifest.format === 'monoka-canvas-archive', `the exporter writes the new marker (got ${legacyManifest.format})`)
  legacyManifest.format = 'minimax-canvas-archive'
  const legacyArchive = packZip([...files.entries()].map(([name, data]) => ({ name, data: name === 'manifest.json' ? Buffer.from(JSON.stringify(legacyManifest)) : data })))
  const homeC = scratch('archive-c')
  const storeC = createStudioRepository(path.join(homeC, 'studio.db'))
  let refused = null
  try {
    importProjectArchive(storeC.documents, legacyArchive)
  } catch (error) {
    refused = error
  }
  storeC.close()
  check(refused !== null, 'the legacy-marker archive refuses (throws)')
  check(/unknown archive format/i.test(refused.message), `the refusal is the unknown-format error (got: ${refused.message.slice(0, 160)})`)
  check(refused.message.includes('monoka-canvas-archive'), 'the refusal names the only accepted marker')
})

test('(g) the moved-trees module is the single source of the folder names', () => {
  check(ENGINE_INPUT_FOLDER_MOVES.length === 3, 'three engine input subfolders move')
  check(OUTPUT_DISPLAY_FOLDER_MOVES.length === 3, 'three display folders move')
  for (const move of [...ENGINE_INPUT_FOLDER_MOVES, ...OUTPUT_DISPLAY_FOLDER_MOVES]) {
    check(!/minimax/i.test(move.to), `no legacy name survives on the target side (got ${move.to})`)
  }
})
