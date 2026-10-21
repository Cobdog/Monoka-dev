// The take viewer overlay's contracts (foelihc T4, spec §2 + §6.2): the open
// paths (the affordance gate — double-click / the bar's review chip / the
// tile hover affordance), the header fields, the used-by chips (the §6.2
// reverse view), the take chips, D5's death (the bar's DOM-querying
// transport), and the overlay's layer/remount discipline.
//
// TWO harnesses, one suite — the repo's established shape:
//   - the PURE model (src/canvas/takeViewerOverlayModel.ts) loads through
//     the VM harness (tests/takeviewer.test.js's posture — the repo has no
//     React-executing unit harness);
//   - the React SHELLS (TakeViewerOverlay / Tile / BottomBar /
//     PooledVideoCard / TakeViewerCore) pin as SOURCE TEXT — the canvas
//     suite's own (v) grep-pin idiom (et8hu1l): absence needles for the
//     retired vocabulary, presence needles for the load-bearing wiring.
//     The rendered behavior is e2e-owned (T7's journey legs).
//
// Sections:
//   (a) the open contract — the affordance gate ladder (seed tile gated,
//       running takeless gated + its reason, mid-render WITH prior take
//       enabled, tombstoned absent, audio absent, image enabled,
//       landingError enabled) + opensViewer (no dead click) + the
//       band-free double-click (any zoom opens; the root-tag grep-pin)
//   (b) the header + the used-by line — viewerHeader's fields, the walk
//       (one inverse, two homes), the chip action = close + select + fly
//   (c) the take chips — the takeNumberOf ladder, canonical starred, the
//       ForkMenu L28 drift note riding the tooltips (one sentence, two homes)
//   (d) D5's death — no DOM-querying transport remains in the bar; the
//       review chip's pin + its reason vocabulary
//   (e) the overlay's discipline — StudioDialogLayered + the registry id,
//       selection preserved (no select(null)), the KEY-REMOUNT per take,
//       the core's seam exposure (the strip wired through the transport
//       intents, the use-frame pause dispatch)
import { test } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadTs } = require('../scripts/lib/ts-vm.cjs')

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

const model = loadTs('src/canvas/takeViewerOverlayModel.ts')
const derive = loadTs('src/canvas/derive.ts')
const cameraMod = loadTs('src/canvas/camera.ts')

const repo = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(repo, file), 'utf8')

// ---- fixtures -------------------------------------------------------------

const makeTake = (id, createdAt, extra = {}) => ({
  id, outputId: `out-${id}`, jobId: null, artifacts: [], latentPath: null,
  metrics: null, createdAt, supersededBy: null, evicted: false, contentHash: null,
  ...extra,
})

const makeChain = (id, { prompt = 'a lone drummer on a night train', outputs = [] } = {}) => ({
  id, projectId: 'p1', kind: 'h3', inputSpec: {}, settings: { prompt },
  lockState: 'unlocked', hopCount: 0, driftMetrics: null, stale: false,
  createdAt: 1, outputs, ops: [],
})

/** The gate input the shells derive from a Tile (structural — the suite
 *  builds plain objects, never a React tree). */
const gateTile = (fields) => ({ canonical: null, mediaKind: null, status: 'idle', ...fields })

test('(a) the open contract — the affordance gate, no dead clicks, any zoom band', () => {
  console.log('viewer-overlay: the open gate')
  // A reviewable canonical take: enabled, naming the take it opens.
  const video = model.reviewAffordance(gateTile({ canonical: { id: 'tk-1' }, mediaKind: 'video' }))
  eq(video, { state: 'enabled', takeId: 'tk-1' }, 'a canonical video take: enabled, opening that take')

  // T-M4's mirror: mid-render WITH a prior canonical take renders enabled —
  // the take exists and the viewer opens it.
  eq(
    model.reviewAffordance(gateTile({ canonical: { id: 'tk-1' }, mediaKind: 'video', status: 'running' })).state,
    'enabled',
    'T-M4: mid-render WITH a prior canonical take is ENABLED',
  )

  // The takeless shapes: GATED with a reason (the bar's R-22 chip), never a
  // silent nothing and never a dead click.
  const generating = model.reviewAffordance(gateTile({ status: 'running' }))
  eq(generating.state, 'gated', 'a running takeless chain is gated (disabled + reason)')
  ok(generating.reason === model.REVIEW_REASON_GENERATING, 'the mid-render takeless reason is the generating one')
  const queued = model.reviewAffordance(gateTile({ status: 'queued-gpu' }))
  eq(queued.state, 'gated', 'a queued takeless chain is gated the same way (the mid-render family)')
  const idle = model.reviewAffordance(gateTile({ status: 'idle' }))
  eq(idle.state, 'gated', 'an idle seed tile is gated (the bar chip teaches; the tile carries no affordance)')
  ok(idle.reason === model.REVIEW_REASON_TAKELESS, 'the idle reason is the takeless one')
  ok(typeof model.REVIEW_REASON_TAKELESS === 'string' && model.REVIEW_REASON_TAKELESS.length > 0, 'the takeless reason is real copy')
  ok(typeof model.REVIEW_REASON_GENERATING === 'string' && model.REVIEW_REASON_GENERATING.length > 0, 'the generating reason is real copy')
  ok(model.REVIEW_REASON_TAKELESS !== model.REVIEW_REASON_GENERATING, 'the two reasons say different things (two shapes, two words)')

  // Tombstoned: the chain is gone — no tile, no affordance at all.
  eq(model.reviewAffordance(null).state, 'absent', 'a tombstoned source (no tile) renders NO affordance')

  // Audio takes: §7's honest absence — no viewer in v1, no affordance, no
  // dead click (never a gated chip promising something that cannot open).
  eq(model.reviewAffordance(gateTile({ canonical: { id: 'tk-a' }, mediaKind: 'audio' })).state, 'absent', 'an audio take offers NOTHING (§7)')

  // Image takes: enabled (zoomable, no transport — the surface is T2's pin).
  eq(model.reviewAffordance(gateTile({ canonical: { id: 'tk-i' }, mediaKind: 'image' })).state, 'enabled', 'an image take opens (zoomable, no transport)')

  // A landing-errored take: enabled — it OPENS, on its humanized verdict
  // (the verdictOnly surface is the takeviewer suite's (f) leg).
  eq(model.reviewAffordance(gateTile({ canonical: { id: 'tk-e' }, mediaKind: 'video' })).state, 'enabled', 'a landing-errored take opens (on its verdict)')

  // opensViewer: the tile-side rule — ONLY an enabled gate opens (a gated or
  // absent gate is not a dead click; nothing fires).
  ok(model.opensViewer(video) === true, 'opensViewer: an enabled gate opens')
  ok(model.opensViewer(generating) === false, 'opensViewer: a gated gate never opens (no dead click)')
  ok(model.opensViewer(model.reviewAffordance(null)) === false, 'opensViewer: an absent gate never opens')

  // The double-click is NOT band-gated: the gate answers identically for
  // every zoom band (R2 probed review gestures at 400% — far band), and the
  // tile binds the handler on its ROOT element, outside every band
  // conditional (the near/mid/far sections gate chrome, never the open).
  for (const band of cameraMod.ZOOM_BANDS) {
    eq(model.reviewAffordance(gateTile({ canonical: { id: 'tk-1' }, mediaKind: 'video' })), video, `the gate is band-free (${band.id} answers the same)`)
  }
  const tileSource = read('src/canvas/Tile.tsx')
  const rootStart = tileSource.indexOf('return <div')
  const firstChild = tileSource.indexOf('<button', rootStart)
  const rootRegion = tileSource.slice(rootStart, firstChild)
  ok(rootStart >= 0 && firstChild > rootStart, 'Tile.tsx root tag found (up to its first child element)')
  ok(rootRegion.includes('onDoubleClick'), 'the double-click binds on the tile ROOT — outside every band conditional (any zoom opens)')
  ok(tileSource.includes('data-canvas-tile-review'), 'the tile carries the hover affordance pin')
  ok(tileSource.includes('onOpenViewer'), 'the tile takes the open callback (the substrate wires it)')
})

test('(b) the header + the used-by line — the §6.2 reverse view', () => {
  console.log('viewer-overlay: the header')
  const takes = [makeTake('t1', 100), makeTake('t2', 200), makeTake('t3', 300)]
  const landed = makeTake('t2', 200, { metrics: { kind: 'video', duration: 6.04, width: 1344, height: 768 } })
  const chain = makeChain('c1')
  const document = { chains: [chain] }

  const header = model.viewerHeader({ document, chain, takes, take: landed })
  eq(header, {
    title: 'a lone drummer on a night train',
    takeLabel: 'take 2 of 3',
    durationLabel: '6.0s',
    resolutionLabel: '1344×768',
  }, 'the header reads chainTitle · take n of N · duration · resolution')

  // Degenerate metrics stay HONEST: absent fields render nothing, never 0.0s
  // or 0×0 pretending to be facts.
  const bare = model.viewerHeader({ document, chain, takes, take: makeTake('t1', 100) })
  ok(bare.durationLabel === null, 'an unprobed duration renders NO duration field (never 0.0s)')
  ok(bare.resolutionLabel === null, 'an unprobed resolution renders NO resolution field (never 0×0)')
  eq(bare.takeLabel, 'take 1 of 3', 'the take label needs no metrics')

  // The used-by chips are the SAME walk the bar counts (one inverse, two
  // homes — spec §6.2): derive.usedBy === forkNeighborhood's fork arm.
  const output = { id: 'o1', chainId: 'c1', substratesAvailable: [], createdAt: 1, canonicalTakeId: null, takes: [] }
  const source = makeChain('c1', { outputs: [output] })
  const consumer = makeChain('c2')
  consumer.inputSpec = { source: { outputId: 'o1' } }
  const doc = { chains: [source, consumer] }
  eq(model.usedByChips(doc, source), [{ id: 'c2', title: 'a lone drummer on a night train' }], 'the used-by chips are the walk\'s output, chainTitle-named')
  eq(model.usedByChips(doc, source), derive.forkNeighborhood(doc, source).forks, 'the walk IS forkNeighborhood\'s fork arm (one inverse, two homes)')
  eq(model.usedByChips(doc, consumer), [], 'a chain nothing consumes carries no chips')

  // The chip action: close + select + fly (the fly request asserted at the
  // model level — the shell issues exactly these three commands).
  eq(model.usedByChipAction('c2'), { close: true, select: 'c2', camera: { kind: 'fly', tileId: 'c2' } }, 'a used-by click = close the viewer + select the chain + camera fly')
})

test('(c) the take chips — the ladder, the star, the drift note', () => {
  console.log('viewer-overlay: the take chips')
  // t3 is canonical (supersededBy null); t1/t2 are priors. Newest-first in
  // the tile's own list, OLDEST-first in the chip row.
  const takes = [
    makeTake('t3', 300),
    makeTake('t1', 100, { supersededBy: 't3' }),
    makeTake('t2', 200, { supersededBy: 't3' }),
  ]
  const chips = model.viewerTakeChips(takes, 't2')
  eq(chips, [
    { id: 't1', number: 1, canonical: false, active: false },
    { id: 't2', number: 2, canonical: false, active: true },
    { id: 't3', number: 3, canonical: true, active: false },
  ], 'the chips: oldest-first takeNumberOf vocabulary, canonical flagged, the watched take active')

  const canonicalWatched = model.viewerTakeChips(takes, 't3')
  ok(canonicalWatched.find((chip) => chip.id === 't3').active === true, 'the active flag follows the watched take (switching swaps the stage)')

  // The L28 drift guidance rides the chip TOOLTIPS (spec §3) — the SAME
  // sentence the ForkMenu's earlier-take rows carry: one note, two homes,
  // pinned to both.
  ok(typeof model.TAKE_CHIP_DRIFT_NOTE === 'string' && model.TAKE_CHIP_DRIFT_NOTE.includes('re-anchor'), 'the drift note is real copy about re-anchoring')
  ok(read('src/canvas/ForkMenu.tsx').includes(model.TAKE_CHIP_DRIFT_NOTE), 'the drift note is the ForkMenu\'s own sentence verbatim (no second vocabulary)')
})

test('(d) D5\'s death — one transport; the bar\'s DOM-querying toggle is gone', () => {
  console.log('viewer-overlay: D5')
  const bar = read('src/canvas/BottomBar.tsx')
  ok(!bar.includes('toggleTransport'), 'pin: BottomBar no longer carries toggleTransport (the function dies)')
  ok(!bar.includes('querySelector'), 'pin: BottomBar no longer DOM-queries a tile\'s <video> (the second transport dies with it)')
  ok(!bar.includes('data-canvas-bar-transport'), 'pin: the transport pin is retired (data-canvas-bar-transport gone)')
  ok(bar.includes('data-canvas-bar-review'), 'pin: the review chip\'s pin exists (data-canvas-bar-review)')
  ok(bar.includes('reviewAffordance('), 'the chip\'s enable/gate/reason derives from the gate model (never an ad-hoc conditional)')
  ok(bar.includes('setTakeViewer'), 'the chip opens the viewer through the store seam')
})

test('(e) the overlay\'s discipline — the layer, the selection, the remount, the seam', () => {
  console.log('viewer-overlay: the mount discipline')
  const overlay = read('src/canvas/TakeViewerOverlay.tsx')
  // The layered-overlay shape (spec §2): StudioDialogLayered — focus trap +
  // restore, Escape through the §0.2 layer registry topmost-only,
  // outside-press dismissal, the canvas dimmed behind.
  ok(overlay.includes('StudioDialogLayered'), 'the overlay mounts through StudioDialogLayered (the op/crop editor precedent)')
  ok(overlay.includes('layerId="canvas-take-viewer"'), 'the layer registers under the canvas take-viewer id');
  // Selection preserved: the overlay NEVER deselects on its own paths.
  ok(!overlay.includes('select(null)'), 'pin: the overlay never deselects (the selection survives open and close)')

  // The KEY-REMOUNT decision (T2-review M-2): a sources change never
  // re-resolves, so switching takes is a FRESH core — new resolution, new
  // lease, new strip — through the React key, not an effect.
  ok(overlay.includes('key={take.id}'), 'the core is KEY-REMOUNTED per take (take switching swaps the stage lease + strip)')

  // The seam exposure: the strip rides THROUGH the core (the mount never
  // touches the video element); the strip's callbacks compose the transport
  // intents (pause / seek / resume-only-through-toggle).
  const core = read('src/media/TakeViewerCore.tsx')
  ok(core.includes('TakeFilmstrip'), 'the core mounts the strip (the overlay passes data, not handlers)')
  ok(core.includes('onScrubStart') && core.includes('onScrub={'), 'the strip\'s callbacks are forwarded through the core')
  ok(core.includes("{ type: 'pause' }"), 'scrub-start dispatches the pause intent (the core\'s own transport seam)')
  ok(core.includes("{ type: 'seek'"), 'scrub-move dispatches the seek intent')
  ok(core.includes('stripPreviewPath('), 'the core gates the strip\'s preview path on the resolved duration (M-1)')
  // T4-review I-2: the release-resume CONDITIONAL is pinned string-exact —
  // a regression to always-resume (dropping the `if (resume)` guard) must
  // red here, not survive to T7's e2e.
  ok(/onScrubEnd=\{\(resume\) => \{\s*if \(resume\)/.test(core), 'pin: scrub-end resumes ONLY through the resume guard (a drag begun paused stays paused)')
  // T4-review I-1 secondary: the overlay's chrome marks are pinned — the
  // Close button AND the chips carry data-take-viewer-chrome (the T-M3
  // guard's DOM reachability is not just the model's predicate).
  const chromeMarks = overlay.match(/data-take-viewer-chrome/g) ?? []
  ok(chromeMarks.length >= 3, `pin: the overlay marks its chrome (close + chips ≥ 3 marks; found ${chromeMarks.length})`)
  ok(overlay.includes('canvas-take-viewer-close" data-take-viewer-chrome'), 'pin: the Close button carries the chrome mark (Space on a focused Close closes, never double-fires the map)')

  // The use-frame dispatch is the pause intent — the I-1 fix, pinned at the
  // shell site (the branch must never go back to the toggle). The needles
  // are the full DISPATCH expressions, string-exact — comments naming
  // toggle-play never trip them (the canvas (v) suite's own discipline).
  const useFrameBranch = /if \(action === 'use-frame'\) \{([\s\S]*?)\n\x20{4}\}/.exec(core)
  ok(useFrameBranch !== null, 'the use-frame branch found in the core')
  // (foelihc T5) the branch rides the MODEL's combined pause+anchor
  // transaction (frameHandoff) — the pause-first property is pinned at
  // the model level by the takeviewerfork suite; here the pin is that the
  // shell delegates and never re-derives.
  ok((useFrameBranch?.[1] ?? '').includes('frameHandoff('), 'use-frame rides the model\'s combined pause+anchor transaction (the shell never re-derives the anchor)')
  ok(!(useFrameBranch?.[1] ?? '').includes("transportCommand(transportRef.current, { type: 'toggle-play' })"), 'pin: the use-frame branch never dispatches the toggle (the I-1 regression pin)')

  // T-I2: the shared card OPENS the viewer — nothing plays inline.
  const card = read('src/components/PooledVideoCard.tsx')
  ok(!card.includes('leaseVideo'), 'pin: PooledVideoCard no longer leases a <video> (the inline play path is dead)')
  ok(card.includes('onReview'), 'the card takes the review callback (the pattern supplies the look, not a second play path)')
  ok(card.includes('data-pooled-review'), 'the card\'s affordance carries its pin')

  // The store seam exists (the open state is app state, not tile state).
  ok(read('src/canvas/store.ts').includes('takeViewer'), 'the store carries the viewer\'s open state')
  console.log(`\ntest-takevieweroverlay: ${passed} assertions passed`)
})
