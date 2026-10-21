// The filmstrip strip's contracts (foelihc T3, spec §5): the sheet is the
// VISUAL (one cell per sampled frame, tiling the strip), the LINEAR
// full-width mapping is the SCRUB (cell boundaries never quantize it), the
// playhead moves continuously, and the three honest states carry the spec's
// EXACT words — 'filmstrip generating…' while the sheet is pending, 'no
// filmstrip for this take' when media is present but a sheet is impossible
// (the blob-only shape, audit T-I1 — NEVER a forever-generating placeholder),
// and the strip ABSENT when there is no media at all.
//
// The generation-counter no-bump (AC-5: the viewer's open never triggers a
// second extraction pass) is pinned at BOTH honest levels: the loader leg
// (h) runs the REAL fetchFilmstrip through the VM harness under a stubbed
// OPFS — the tile's load fills the cache, the viewer's same-key load issues
// NO HTTP request at all — and the route leg (i) boots the BUILT server on
// a fixture clip and asserts the route's x-monoka-filmstrip-generations
// header stays flat across the loads a viewer open can make when the client
// cache layers miss (ETag revalidation → 304; cold re-GET → the server's
// disk cache). Together: no repeat load, at any cache layer, re-extracts.
//
// Pure-model suite in the wizardWalk shape (the T2 posture): the model
// carries every decision; the React shell is a thin binding covered by
// typecheck + scoped lint here, rendered behavior e2e-owned (T7's legs).
//
// Sections:
//   (a) the strip's own mapping — pointer → fraction → time, LINEAR in x
//       regardless of cell count (T1's helper consumed and wrapped); the
//       round trip back; the degenerates
//   (b) the drag contract — a left press seeks immediately and records
//       playing-at-press; moves seek continuously while the drag lives;
//       release resumes ONLY if playing-at-press; a drag begun paused stays
//       paused; a canceled press never resumes
//   (c) the playhead — time → x-fraction, continuous; clamped at 0/duration
//   (d) state 1 — sheet pending: the plain-bar state with the placeholder
//       cell's EXACT words; the pure transition when the sheet lands
//   (e) state 2 — blob-only (media present, previewPath null): the plain
//       bar + 'no filmstrip for this take', NEVER the generating placeholder
//   (f) state 3 — no media: the strip is ABSENT, never a dead strip
//   (g) the cells — the tiling math (one cell per sheet frame, document
//       order, background-position selects the frame) + the honest density
//   (h) the loader no-bump — the REAL fetchFilmstrip, stubbed OPFS: the
//       second same-(path,duration) load issues no fetch (cache hit)
//   (i) the route no-bump — the BUILT server + fixture clip: the
//       generations counter is flat across the viewer's open (both arms)
import { test, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const REPO = require('node:path').resolve(__dirname, '..')

const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { loadTs } = require('../scripts/lib/ts-vm.cjs')
const { makePortAllocator } = require('./lib/ports.cjs')
const { makeScratchDir, removeAllScratchDirs } = require('./lib/scratch.cjs')
afterAll(() => { void removeAllScratchDirs() })

let passed = 0
function ok(condition, label) {
  assert.ok(condition, label)
  passed += 1
  console.log(`  ok - ${label}`)
}
function eq(actual, expected, label) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), label)
  passed += 1
  console.log(`  ok - ${label}`)
}
function close(a, b, tol, label) {
  assert.ok(Math.abs(a - b) <= tol, `${label}: |${a} - ${b}| > ${tol}`)
  passed += 1
  console.log(`  ok - ${label}`)
}

const model = loadTs('src/media/takeFilmstripModel.ts')
const layout = loadTs('src/media/filmstripLayout.ts')

// A 640×270 strip-shaped rect with a nonzero left offset (the mapping must
// be left-invariant, not assume the strip starts at x=0).
const RECT = { left: 137, width: 1200 }
const at = (fraction) => RECT.left + fraction * RECT.width

/** A hand-built Filmstrip over a real layout (the object the hook yields). */
const sheetFor = (duration) => {
  const l = layout.filmstripLayout(duration)
  return { url: `blob:sheet-${duration}`, cols: l.cols, rows: l.rows, frameCount: l.frameCount, duration, fps: 24, frameIndexAtTime: () => 0 }
}

test('(a) the strip\'s own mapping — linear in x regardless of cell count', () => {
  console.log('filmstrip strip: the scrub mapping')
  // T1's helpers ARE the mapping (asserted by identity through the VM
  // module cache — the model re-exports takeMath's pair, never re-implements
  // it): the strip wraps them, so the pin below is the WRAPPING.
  const takeMath = loadTs('src/media/takeMath.ts')
  ok(model.timeFromStripFraction === takeMath.timeFromStripFraction, 'the model\'s fraction→time IS T1\'s helper (re-exported, never re-implemented)')
  ok(model.stripFractionFromTime === takeMath.stripFractionFromTime, 'the model\'s time→fraction IS T1\'s helper (the playhead math has one home)')

  // Left/right/edge probes on one duration.
  const D = 8
  close(model.stripSeekTime(at(0), RECT, D), 0, 1e-9, 'press at the left edge seeks 0')
  close(model.stripSeekTime(at(1), RECT, D), D, 1e-9, 'press at the right edge seeks the duration')
  close(model.stripSeekTime(at(0.5), RECT, D), D / 2, 1e-9, 'press mid-strip seeks the midpoint')
  close(model.stripSeekTime(RECT.left - 400, RECT, D), 0, 1e-9, 'a press left of the strip clamps to 0')
  close(model.stripSeekTime(RECT.left + RECT.width + 400, RECT, D), D, 1e-9, 'a press right of the strip clamps to the duration')
  ok(model.stripSeekTime(Number.NaN, RECT, D) === 0, 'a NaN pointer seeks 0, never NaN')
  ok(model.stripSeekTime(at(0.5), { left: 0, width: 0 }, D) === 0, 'a zero-width rect seeks 0 (never NaN/Infinity)')

  // LINEAR regardless of cell count: the same probe answers the same time
  // under every layout the sheet generator can produce for these durations
  // (3 s → 12 cells 4×3; 8 s → 16 cells 4×4; 15 s → 30 cells 6×5). A
  // cell-quantized mapping would give different answers per layout.
  const layouts = [
    { duration: 3, cells: 12 },
    { duration: 8, cells: 16 },
    { duration: 15, cells: 30 },
  ]
  for (const { duration, cells } of layouts) {
    eq(layout.filmstripLayout(duration).frameCount, cells, `density honesty: ${duration} s samples ${cells} cells (the sheet's own clamp)`)
    for (const f of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      close(model.stripSeekTime(at(f), RECT, duration), f * duration, 1e-9, `${duration} s / ${cells} cells: x=${f} seeks exactly ${f}×duration`)
    }
  }

  // Continuity, the anti-quantization pin: two probes 1 px apart differ by
  // duration/width — including ACROSS a cell boundary (a quantized mapping
  // jumps there).
  const boundary = at(5 / 16) // cell 5's left edge on the 16-cell sheet
  close(model.stripSeekTime(boundary + 0.5, RECT, D) - model.stripSeekTime(boundary - 0.5, RECT, D), D / RECT.width, 1e-9, 'no time jump across a cell boundary — the mapping is continuous, never cell-quantized')
  close(model.stripSeekTime(at(0.5) + 1, RECT, D) - model.stripSeekTime(at(0.5), RECT, D), D / RECT.width, 1e-9, '1 px of strip = duration/width seconds everywhere')

  // And back: the playhead fraction of a sought time returns the pressed
  // fraction (the strip-level round trip over T1's pair).
  for (const f of [0, 0.17, 0.5, 0.83, 1]) {
    close(model.stripFractionFromTime(model.stripSeekTime(at(f), RECT, D), D), f, 1e-9, `round trip: press ${f} → seek → playhead reads ${f}`)
  }
})

test('(b) the drag contract — press seeks, drag scrubs, release resumes only-if-playing', () => {
  console.log('filmstrip strip: the drag machine')
  // A left press mid-strip at x% SEEKS IMMEDIATELY and records whether the
  // take was playing (the resume contract's input).
  const playing = model.stripPress({ clientX: at(0.25), button: 0, rect: RECT, duration: 8, playing: true })
  eq(playing.drag, { wasPlaying: true }, 'a press while playing records wasPlaying')
  close(playing.seekTo, 2, 1e-9, 'pointer-down at 25% seeks 25% of the duration immediately (spec §5)')

  const paused = model.stripPress({ clientX: at(0.75), button: 0, rect: RECT, duration: 8, playing: false })
  eq(paused.drag, { wasPlaying: false }, 'a press while paused records wasPlaying false')
  close(paused.seekTo, 6, 1e-9, 'a press while paused still seeks immediately (the paused scrub)')

  // A non-left press is not the strip's at all.
  const middle = model.stripPress({ clientX: at(0.5), button: 1, rect: RECT, duration: 8, playing: true })
  ok(middle.drag === null && middle.seekTo === null, 'a non-left press neither drags nor seeks')

  // Drag moves seek CONTINUOUSLY while the drag lives.
  close(model.stripDragMove(at(0.3), RECT, 8, playing.drag), 2.4, 1e-9, 'drag to 30% seeks 2.4 s continuously')
  close(model.stripDragMove(at(0.9), RECT, 8, playing.drag), 7.2, 1e-9, 'drag on to 90% seeks 7.2 s')
  ok(model.stripDragMove(at(0.5), RECT, 8, null) === null, 'a move with NO live drag never seeks (a hover is not a scrub)')

  // Release: resumes ONLY if the take was playing when the drag began.
  ok(model.stripDragRelease(playing.drag) === true, 'release after a playing-begun drag RESUMES (spec §5)')
  ok(model.stripDragRelease(paused.drag) === false, 'a drag begun while paused STAYS paused on release')
  ok(model.stripDragRelease(null) === false, 'a canceled press (no live drag) never resumes — the f4f33f9 ruling, again')
})

test('(c) the playhead — continuous, clamped at 0 and duration', () => {
  console.log('filmstrip strip: the playhead')
  ok(model.stripFractionFromTime(0, 8) === 0, 'time 0 reads the left edge')
  ok(model.stripFractionFromTime(8, 8) === 1, 'the duration reads the right edge')
  close(model.stripFractionFromTime(4, 8), 0.5, 1e-9, 'mid-clip reads the middle')
  close(model.stripFractionFromTime(1.234, 8), 1.234 / 8, 1e-9, 'an arbitrary time reads its exact fraction (continuous, not cell-snapped)')
  ok(model.stripFractionFromTime(-1, 8) === 0, 'a negative time clamps to 0')
  ok(model.stripFractionFromTime(9.5, 8) === 1, 'a time past the duration clamps to 1')
  ok(model.stripFractionFromTime(Number.NaN, 8) === 0, 'a NaN time reads 0, never NaN')
  ok(model.stripFractionFromTime(4, 0) === 0, 'a zero-duration take reads 0 (degenerate, never NaN)')
  // Continuity across the sweep — the marker glides, it never jumps cells.
  // (Index-driven t: the accumulated `+=` drift would stop the sweep short
  // of exactly 8.)
  let previous = -1
  for (let i = 0; i <= 200; i += 1) {
    const t = (i / 200) * 8
    const f = model.stripFractionFromTime(t, 8)
    ok(f >= previous, `sweep t=${t.toFixed(3)}: the playhead never moves backwards`)
    previous = f
  }
  close(previous, 1, 0, 'the sweep ends at the right edge (t=8 reads exactly 1)')
})

test('(d) state 1 — sheet pending: the plain bar + the placeholder\'s EXACT words; the pure fill transition', () => {
  console.log('filmstrip strip: the generating state')
  eq(model.stripSurface({ mediaPresent: true, previewPath: '/output/take-3.mp4', sheet: null }), 'generating', 'a previewPath take with the sheet not yet landed renders the generating state (the plain scrub bar + the placeholder cell)')
  eq(model.stripSurface({ mediaPresent: true, previewPath: '/output/take-3.mp4', sheet: sheetFor(3) }), 'sheet', 'when the sheet lands, the state becomes the sheet (cells fill — the pure transition)')
  eq(model.FILMSTRIP_GENERATING, 'filmstrip generating…', 'the placeholder cell\'s words are the spec\'s EXACT "filmstrip generating…" (single-glyph ellipsis)')
  eq(model.NO_FILMSTRIP_FOR_TAKE, 'no filmstrip for this take', 'state 2\'s words are the spec\'s EXACT "no filmstrip for this take"')
  ok(model.FILMSTRIP_GENERATING !== model.NO_FILMSTRIP_FOR_TAKE, 'the two states never share words')
  ok(model.FILMSTRIP_GENERATING.length > 0 && model.NO_FILMSTRIP_FOR_TAKE.length > 0, 'both are real copy')
})

test('(e) state 2 — blob-only: the plain bar + the honest note, NEVER the generating placeholder', () => {
  console.log('filmstrip strip: the sheet-impossible state')
  // The settled-not-generating discrimination (audit T-I1): media present,
  // no previewPath — a sheet can never be served for this take, so the
  // state is settled the moment the take is read, not pending.
  const blobOnly = { mediaPresent: true, previewPath: null, sheet: null }
  eq(model.stripSurface(blobOnly), 'plain', 'a blob-only take renders the plain scrub bar + the note')
  ok(model.stripSurface(blobOnly) !== 'generating', 'NEVER the generating placeholder — the state is settled before any load can run')
  eq(model.stripSurface({ mediaPresent: true, previewPath: null, sheet: sheetFor(3) }), 'plain', 'the discrimination is on the TAKE\'s shape (no previewPath), not on a fetch outcome — it cannot flip')
})

test('(f) state 3 — no media: the strip is ABSENT, never a dead strip', () => {
  console.log('filmstrip strip: the absent state')
  eq(model.stripSurface({ mediaPresent: false, previewPath: null, sheet: null }), 'absent', 'no media renders NO strip (the missing-file state owns the surface)')
  eq(model.stripSurface({ mediaPresent: false, previewPath: '/output/take-3.mp4', sheet: null }), 'absent', 'absent wins over a previewPath (no media = nothing to scrub)')
  eq(model.stripSurface({ mediaPresent: false, previewPath: '/output/take-3.mp4', sheet: sheetFor(3) }), 'absent', 'absent wins even over a stale sheet — precedence: absent > plain > generating/sheet')
})

test('(g) the cells — one per sheet frame, document order, the sprite math', () => {
  console.log('filmstrip strip: the cell tiling')
  const sheet = sheetFor(3) // 12 frames on a 4×3 grid
  eq(model.cellCount(sheet), 12, 'the strip renders the sheet\'s own frame count (the honest density — a navigator, not a per-frame browser)')
  eq(model.cellCount({ ...sheet, frameCount: 99 }), 12, 'a lying frameCount is capped at cols×rows (never empty cells)')

  const first = model.cellBackground(sheet, 0)
  eq(first, { sizeX: 400, sizeY: 300, positionX: 0, positionY: 0 }, 'cell 0: the sheet at 400%×300%, positioned to its top-left frame')
  const middle = model.cellBackground(sheet, 5)
  close(middle.positionX, 100 / 3, 1e-9, 'cell 5 (col 1 of 4): background-x at 100/3 %')
  ok(middle.positionY === 50, 'cell 5 (row 1 of 3): background-y at 50 %')
  const last = model.cellBackground(sheet, 11)
  ok(last.positionX === 100 && last.positionY === 100, 'cell 11 (the last): positioned to the bottom-right frame')
  eq(model.cellBackground(sheet, 0).sizeX, sheet.cols * 100, 'the sheet is scaled so ONE cell fills one strip cell (cols×100% wide)')

  // Every cell of a real 30-frame sheet stays inside [0, 100] on both axes.
  const big = sheetFor(15)
  for (let index = 0; index < model.cellCount(big); index += 1) {
    const bg = model.cellBackground(big, index)
    ok(bg.positionX >= 0 && bg.positionX <= 100 && bg.positionY >= 0 && bg.positionY <= 100 && Number.isFinite(bg.positionX) && Number.isFinite(bg.positionY), `30-frame sheet cell ${index}: a finite in-range position`)
  }

  // Degenerate 1×1 sheet: the guards hold (never NaN from /0).
  eq(model.cellBackground({ ...sheet, cols: 1, rows: 1, frameCount: 1 }, 0), { sizeX: 100, sizeY: 100, positionX: 0, positionY: 0 }, 'a 1×1 sheet centers without dividing by zero')
})

test('(h) the loader no-bump — the REAL fetchFilmstrip answers the viewer\'s open from the OPFS cache, no second fetch', async () => {
  console.log('filmstrip strip: the loader-level no-bump')
  // The strip consumes the SAME loader the tile's poster path uses
  // (useFilmstrip → fetchFilmstrip). The no-second-extraction-pass contract
  // pins cheapest HERE: with the OPFS cache holding the tile's entry, the
  // viewer's load is a pure cache hit — no HTTP request exists to bump
  // anything. The REAL transpiled module graph runs against a stubbed OPFS
  // + a recorded fetch.
  //
  // The stub environment must reach the TRANSITIVE imports too (apiClient
  // reads window.location, blobCache reads navigator.storage) — ts-vm's
  // extraContext only injects the TOP module, so this is the two-file
  // loader pattern (tests/workflows.test.js's promptLibraryStorage block,
  // generalized to a recursive require): every relative dep transpiles and
  // runs in the same stub context.
  const vm = require('node:vm')
  const { transpile } = require('../scripts/lib/ts-vm.cjs')
  const written = new Set()
  const fakeDir = {
    async getFileHandle(name, options) {
      if (options && options.create) {
        written.add(name)
        return { async createWritable() { return { async write() { }, async close() { } } } }
      }
      if (!written.has(name)) throw new Error('NotFoundError (stub)')
      return { async getFile() { return { size: 4321 } } }
    },
  }
  const fakeRoot = { async getDirectoryHandle() { return fakeDir } }
  let fetches = 0
  const stubEnv = {
    navigator: { storage: { async getDirectory() { return fakeRoot } } },
    fetch: async () => { fetches += 1; return { ok: true, blob: async () => ({ size: 4321 }) } },
    window: { location: { search: '' } },
    URL: { createObjectURL: () => `blob:stub-${fetches}` },
  }
  const moduleCache = new Map()
  const loadInStub = (absolutePath) => {
    const cached = moduleCache.get(absolutePath)
    if (cached) return cached
    const moduleExports = {}
    moduleCache.set(absolutePath, moduleExports)
    const dir = path.dirname(absolutePath)
    const req = (name) => {
      if (!name.startsWith('.')) return require(name)
      const base = path.resolve(dir, name)
      const resolved = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]
        .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      if (!resolved) throw new Error(`cannot resolve '${name}' from ${absolutePath}`)
      return loadInStub(resolved)
    }
    vm.runInNewContext(transpile(absolutePath), { exports: moduleExports, require: req, URLSearchParams, URL, console, ...stubEnv })
    return moduleExports
  }
  const httpPreview = loadInStub(path.join(REPO, 'src', 'media', 'httpPreview.ts'))

  // The tile's poster load: one network fetch (the ONE extraction pass),
  // answered and written to the cache.
  const tileLoad = await httpPreview.fetchFilmstrip('/output/take-3.mp4', 3)
  ok(tileLoad !== null, 'the tile\'s load answers a Filmstrip')
  ok(fetches === 1, 'the tile\'s load is exactly one network fetch')
  eq({ cols: tileLoad.cols, rows: tileLoad.rows, frameCount: tileLoad.frameCount }, { cols: 4, rows: 3, frameCount: 12 }, 'the load carries the shared layout (3 s → 4×3×12)')

  // The viewer opens — the strip's loader runs with the SAME path and the
  // SAME duration (both read the take's own fields): a pure cache hit.
  const viewerLoad = await httpPreview.fetchFilmstrip('/output/take-3.mp4', 3)
  ok(fetches === 1, 'the viewer\'s open issues NO second fetch — the OPFS hit means no second extraction pass can exist')
  ok(viewerLoad !== null, 'the cached load still answers a Filmstrip')
  eq({ cols: viewerLoad.cols, rows: viewerLoad.rows, frameCount: viewerLoad.frameCount }, { cols: 4, rows: 3, frameCount: 12 }, 'the cached load answers the same layout')

  // The key discipline: the cache keys on path AND duration — a different
  // duration is a different sheet need (honest boundary of the cache, not a
  // no-bump violation: the route's own disk cache still serves it without
  // regenerating while the layout is unchanged — leg (i) pins that side).
  await httpPreview.fetchFilmstrip('/output/take-3.mp4', 4)
  ok(fetches === 2, 'a different duration misses the cache (the key is path+duration — the documented discipline)')
})

// ---- the route leg (i): the built server + fixture clip ----------------------
//
// The generation counter must stay flat when the viewer opens and its load
// reaches the ROUTE (the honest worst case: the client cache layers missed).
// Both arms: ETag revalidation (the browser re-asks, If-None-Match → 304)
// and a cold re-GET (no ETag — the server's own sheet disk cache answers).
// The header value before/after is asserted EQUAL — the no-bump contract.

const ffmpegProbe = spawnSync('ffmpeg', ['-version'], { timeout: 10_000 })
const hasFfmpeg = !(ffmpegProbe.error || ffmpegProbe.status !== 0)
if (!hasFfmpeg) console.log('SKIP (route leg): ffmpeg is not available on this runner — the filmstrip generation needs it. (CI installs it via apt; see .github/workflows/ci.yml.)')
const hasServerBuild = fs.existsSync(path.join(REPO, 'dist-server', 'server', 'index.js'))
if (!hasServerBuild) console.log('NOTE - no dist-server build present (server/index.js); run pnpm build:server — the route leg runs on legs that build the server.')
const maybeRoute = hasServerBuild && hasFfmpeg ? test : test.skip
const freePort = makePortAllocator('takefilmstrip')

maybeRoute('(i) the route no-bump — x-monoka-filmstrip-generations stays flat across the viewer\'s open', async () => {
  console.log('filmstrip strip: the route-level no-bump')
  const home = makeScratchDir(path.join(os.tmpdir(), 'monoka-takefilmstrip-'))
  const outputDirectory = path.join(home, 'output')
  const port = await freePort()
  let output = ''
  const child = spawn(process.execPath, [path.join(REPO, 'dist-server', 'server', 'index.js')], {
    env: { ...process.env, MONOKA_HOME: home, MONOKA_LAN_PORT: String(port), MONOKA_NO_HTTPS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { output += String(chunk) })
  child.stderr.on('data', (chunk) => { output += String(chunk) })
  const fail = (message) => { child.kill('SIGKILL'); throw new Error(`${message}\n--- server output ---\n${output}`) }
  try {
    // Boot + readiness (the filmstrip suite's probe discipline, incl. the
    // port-echo guard against probing a foreign server).
    let base = ''
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/lan/settings`)
        if (response.ok) { base = `http://127.0.0.1:${port}`; break }
      } catch { /* not up yet */ }
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    if (!base) fail('the studio server never became ready')
    if (!output.includes(`"port":${port}`)) fail('the readiness probe reached a server that is not the test child')

    const saved = await fetch(`${base}/api/lan/settings`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settings: { comfyUrl: 'http://127.0.0.1:8188', outputDirectory } }),
    })
    assert.equal(saved.status, 200, 'settings POST must accept the scratch output directory')
    fs.mkdirSync(outputDirectory, { recursive: true })
    const clip = path.join(outputDirectory, 'take-3.mp4')
    fs.copyFileSync(path.join(REPO, 'e2e', 'fixtures', 'sample-clip.mp4'), clip)
    const route = `${base}/api/lan/assets/filmstrip?${new URLSearchParams({ path: clip, duration: '3' })}`

    // The TILE's poster load: the one extraction pass.
    const tile = await fetch(route)
    if (tile.status !== 200) fail(`the tile's GET failed: ${await tile.text()}`)
    assert.equal(tile.headers.get('content-type'), 'image/png', "the tile's load serves the sheet PNG")
    const before = tile.headers.get('x-monoka-filmstrip-generations')
    const etag = tile.headers.get('etag')
    assert.equal(before, '1', 'the tile\'s load is generation 1 (the ONE extraction pass)')
    assert.ok(etag, 'the sheet carries a content-derived ETag')

    // The VIEWER OPENS — arm 1: the browser revalidation shape (If-None-Match).
    const revalidated = await fetch(route, { headers: { 'if-none-match': etag } })
    assert.equal(revalidated.status, 304, 'an unchanged sheet answers 304 to the viewer\'s revalidation')
    assert.equal(revalidated.headers.get('x-monoka-filmstrip-generations'), before, 'arm 1 (ETag revalidation): the counter does not bump')

    // The VIEWER OPENS — arm 2: the cold shape (no ETag — the client cache
    // layers missed; the server's own sheet disk cache must answer).
    const cold = await fetch(route)
    assert.equal(cold.status, 200, 'the cold re-GET still serves the sheet')
    const after = cold.headers.get('x-monoka-filmstrip-generations')
    assert.equal(after, before, 'arm 2 (cold re-GET): the counter does not bump — the server\'s disk cache is the backstop')

    // The contract, stated as the header-value equality the AC names.
    assert.ok(before === after, 'x-monoka-filmstrip-generations before === after the viewer\'s open (no second extraction pass, at any cache layer)')
    console.log('PASS: the generations counter stayed flat across the viewer open (both arms).')
  } finally {
    child.kill('SIGINT')
    await new Promise((resolve) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 5_000)
      child.on('exit', () => { clearTimeout(timer); resolve() })
    })
  }
})

test('(j) the summary', () => {
  console.log(`\ntest-takefilmstrip: ${passed} assertions passed`)
  ok(passed > 0, 'the suite ran its assertions')
})
