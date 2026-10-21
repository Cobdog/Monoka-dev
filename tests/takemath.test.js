// The take math suite (foelihc T1 — the take viewer's pure layer, spec
// docs/specs/2026-10-17-take-viewer.md §3 transport, §4 the T-C1 two-hop
// contract, §5 the strip mapping, §6 the walk + candidates; §9.10's vitest
// home). VM harness (scripts/lib/ts-vm.cjs): takeMath.ts and derive.ts are
// DOM-free pure modules. Sections:
//   (a) frameIndexFromTime — round(t × 24), negatives clamp to 0
//   (b) clampToFrames — the T-M1 N−1 clamp (round can yield exactly N at the
//       last frame) + frameCountFromDuration
//   (c) THE TWO-HOP CONTRACT (T-C1, the load-bearing one) —
//       positionFromFrame(frameIndexFromTime(t)) ≈ t within one frame, AND
//       the position is SECONDS, never the raw frame number (the
//       frames-passed-as-seconds trap a literal implementation produces)
//   (d) timecode — `S.FF · frame n of N` at the 24 fps convention
//   (e) the strip mapping — x-fraction ↔ time, LINEAR across the full width
//       regardless of cell boundaries
//   (f) compare candidates — this chain's takes first (the takeNumberOf
//       ladder), then parents, then forks; stable; empty edges
//   (g) the used-by inverse walk — consuming chains, chainTitle-named, no
//       self, stable order (BottomBar's forkHistory, extracted to derive.ts)
import { test } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const assert = require('node:assert/strict')
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
function close(a, b, tol, label) {
  assert.ok(Math.abs(a - b) <= tol, `${label}: |${a} - ${b}| > ${tol}`)
  passed += 1
  console.log(`  ok - ${label}`)
}

const takeMath = loadTs('src/media/takeMath.ts')
const layout = loadTs('src/media/filmstripLayout.ts')
const derive = loadTs('src/canvas/derive.ts')

// ---- fixtures (§2.1 document shapes derive.ts reads) -------------------------
const makeTake = (id, createdAt) => ({ id, outputId: `out-${id}`, jobId: null, artifacts: [], latentPath: null, metrics: null, createdAt, supersededBy: null, evicted: false, contentHash: null })
const makeOutput = (id, chainId, takes) => ({ id, chainId, substratesAvailable: [], createdAt: 1, canonicalTakeId: takes.length ? takes[0].id : null, takes })
const makeChain = (id, over) => Object.assign({ id, projectId: 'p1', kind: 'video', inputSpec: {}, settings: {}, lockState: 'unlocked', hopCount: 0, driftMetrics: null, stale: false, createdAt: 100, outputs: [], ops: [] }, over)

test('(a) frameIndexFromTime — round(t × 24), negatives clamp to 0', () => {
  eq(takeMath.frameIndexFromTime(3), 72, 'frame: 3.0 s → frame 72')
  eq(takeMath.frameIndexFromTime(4.999), 120, 'frame: 4.999 s rounds to frame 120 (round(119.976))')
  eq(takeMath.frameIndexFromTime(0), 0, 'frame: time 0 is frame 0')
  eq(takeMath.frameIndexFromTime(-0.4), 0, 'frame: a negative time clamps to frame 0')
  eq(takeMath.frameIndexFromTime(3.5), 84, 'frame: 3.5 s → frame 84 (the spec §4 anchor example)')
})

test('(b) the T-M1 N−1 clamp + the approximated frame count', () => {
  eq(takeMath.clampToFrames(121, 121), 120, 'clamp: raw 121 of frameCount 121 → 120 — round can yield exactly N at the last frame, never hand the seams frame N')
  eq(takeMath.clampToFrames(130, 121), 120, 'clamp: beyond the end clamps to N−1')
  eq(takeMath.clampToFrames(50, 121), 50, 'clamp: an in-range frame passes through untouched')
  eq(takeMath.clampToFrames(-3, 121), 0, 'clamp: a negative raw clamps to frame 0 (never a negative seek)')
  eq(takeMath.clampToFrames(5, 0), 0, 'clamp: a zero frameCount degenerates to frame 0, not −1')
  eq(takeMath.frameCountFromDuration(5), 120, 'count: round(5 × 24) = 120')
  eq(takeMath.frameCountFromDuration(5.0416666), 121, 'count: round can land just past N frames (the T-M1 setup)')
  eq(takeMath.frameCountFromDuration(0), 0, 'count: zero duration is zero frames')
  eq(takeMath.frameCountFromDuration(-2), 0, 'count: a negative duration is zero frames, not a negative count')
  // The composed T-M1 pipeline: the last playable instant of a 5.0416 s clip
  // must anchor frame 120, never 121.
  eq(takeMath.clampToFrames(takeMath.frameIndexFromTime(5.0416666), takeMath.frameCountFromDuration(5.0416666)), 120, 'clamp: the composed pipeline never yields N (T-M1 exact case)')
})

test('(c) THE TWO-HOP CONTRACT (T-C1) — the position is seconds, never frames', () => {
  // The sweep: for every representative time, the two hops stay within one
  // frame of the original — round-trip stability.
  const sweep = [0, 1 / 48, 0.5, 1, 1.999, 2.999, 3, 3.5, 4.999, 5]
  for (const time of sweep) {
    close(takeMath.positionFromFrame(takeMath.frameIndexFromTime(time)), time, 1 / 24 + 1e-9, `two-hop: t=${time} survives frame→position within one frame`)
  }
  // The trap, pinned: frame 84 of a 5-second clip is SECOND 3.5 at the 24 fps
  // convention. A literal frames-passed-as-seconds implementation returns 84
  // here — an impossible seek — so these legs cannot pass against it.
  eq(takeMath.positionFromFrame(84), 3.5, 'two-hop: frame 84 → position 3.5 SECONDS (84 / 24), the unit the extraction seam takes')
  ok(takeMath.positionFromFrame(84) !== 84, 'two-hop: the position is never the raw frame number')
  ok(takeMath.positionFromFrame(84) < 5, 'two-hop: frame 84 of a 5 s clip seeks inside the clip, not to second 84')
  eq(takeMath.frameIndexFromTime(takeMath.positionFromFrame(84)), 84, 'two-hop: the other direction lands back on frame 84 exactly')
  ok(takeMath.FILMSTRIP_FPS === layout.FILMSTRIP_FPS && takeMath.FILMSTRIP_FPS === 24, 'two-hop: one fps convention — the math re-exports FILMSTRIP_FPS, no second literal')
})

test('(d) timecode — `S.FF · frame n of N` at the 24 fps convention', () => {
  eq(takeMath.timecodeLabel(72, 121), '3.00 · frame 72 of 121', 'timecode: frame 72 of 121 renders 3.00 · frame 72 of 121')
  eq(takeMath.timecodeLabel(0, 121), '0.00 · frame 0 of 121', 'timecode: frame 0 pads seconds to two digits')
  eq(takeMath.timecodeLabel(84, 121), '3.12 · frame 84 of 121', 'timecode: the frames part is frame mod 24 (84 → .12)')
  eq(takeMath.timecodeLabel(73, 121), '3.01 · frame 73 of 121', 'timecode: single-digit frames pad to FF')
  eq(takeMath.timecodeLabel(264, 289), '11.00 · frame 264 of 289', 'timecode: seconds ≥ 10 render untruncated')
  eq(takeMath.secondsFramesLabel(72), '3.00', 'timecode: the bare S.FF part composes (the transport renders S.FF / S.FF)')
  eq(takeMath.secondsFramesLabel(264), '11.00', 'timecode: the bare part pads past 10 s too')
})

test('(e) the strip mapping — linear across the full width, cells never quantize it', () => {
  eq(takeMath.timeFromStripFraction(0.5, 4), 2, 'strip: x-fraction 0.5 of a 4 s clip is 2.0 s')
  const roundTrip = [0, 0.1, 1 / 12, 0.25, 0.5, 5 / 30, 0.9, 1]
  for (const fraction of roundTrip) {
    close(takeMath.stripFractionFromTime(takeMath.timeFromStripFraction(fraction, 4), 4), fraction, 1e-9, `strip: fraction ${fraction.toFixed(4)} round-trips`)
  }
  // Linear regardless of cell count: the same fraction maps to the same time
  // under a 12-cell sheet (filmstripLayout(2)) and a 30-cell one
  // (filmstripLayout(15)) — the sheet is the visual, the mapping is the scrub.
  const cells12 = layout.filmstripLayout(2)
  const cells30 = layout.filmstripLayout(15)
  ok(cells12.frameCount === 12 && cells30.frameCount === 30, 'strip: the fixtures really are 12-cell and 30-cell sheets')
  for (const fraction of [0, 1 / 12, 1 / 6, 0.25, 0.5, 5 / 30, 0.75, 1]) {
    eq(takeMath.timeFromStripFraction(fraction, 4), fraction * 4, `strip: fraction ${fraction.toFixed(4)} is fraction × duration under BOTH cell counts (cells never enter the mapping)`)
  }
  close(takeMath.timeFromStripFraction(1 / 12 + 0.001, 4), (1 / 12 + 0.001) * 4, 1e-9, 'strip: a fraction just past a cell boundary is NOT snapped to it (continuous scrub)')
  eq(takeMath.timeFromStripFraction(-0.2, 4), 0, 'strip: a drag off the left edge clamps to 0 s')
  eq(takeMath.timeFromStripFraction(1.3, 4), 4, 'strip: a drag off the right edge clamps to the duration')
  eq(takeMath.stripFractionFromTime(-1, 4), 0, 'strip: a negative time maps to fraction 0')
  eq(takeMath.stripFractionFromTime(99, 4), 1, 'strip: a time past the end maps to fraction 1')
  eq(takeMath.stripFractionFromTime(2, 0), 0, 'strip: a zero-duration clip degenerates to fraction 0, never NaN')
})

test('(f) compare candidates — takes first (the ladder), then parents, then forks', () => {
  // A → B (fork edges both directions), D and C consume B's output, E is
  // unrelated. B carries three takes, handed in NON-chronological order so
  // the ordering leg proves the sort, not the fixture's accident.
  const t3 = makeTake('t3', 300)
  const t1 = makeTake('t1', 100)
  const t2 = makeTake('t2', 200)
  const chainA = makeChain('a', { outputs: [makeOutput('out-a', 'a', [makeTake('ta', 50)])] })
  const chainB = makeChain('b', { inputSpec: { outputRef: { outputId: 'out-a' } }, outputs: [makeOutput('out-b', 'b', [t3, t1, t2])] })
  const chainD = makeChain('d', { inputSpec: { outputRef: { outputId: 'out-b', substrate: 'extracted-frame' } } })
  const chainC = makeChain('c', { inputSpec: { refs: [{ outputId: 'out-b' }, { outputId: 'missing-output' }] } })
  const chainE = makeChain('e')
  const document = { project: { id: 'p1', name: 'p', camera: {}, createdAt: 1, lastActiveAt: 2 }, chains: [chainA, chainB, chainD, chainC, chainE] }

  const candidates = derive.compareCandidates(document, chainB, 't2')
  eq(candidates, [
    { kind: 'take', takeId: 't1', number: 1, title: 'take 1' },
    { kind: 'take', takeId: 't3', number: 3, title: 'take 3' },
    { kind: 'parent', id: 'a', title: 'video 1' },
    { kind: 'fork', id: 'd', title: 'video 3' },
    { kind: 'fork', id: 'c', title: 'video 4' },
  ], 'candidates: the OTHER takes first in takeNumberOf order (t2 excluded), then the parent, then forks in document order — deterministic end to end')

  // The current take rides number 2 against the FULL list (numbering never
  // renumbers because one take is excluded).
  const all = derive.compareCandidates(document, chainB, null)
  eq(all.filter((entry) => entry.kind === 'take').map((entry) => entry.number), [1, 2, 3], 'candidates: without a current take every take lists, numbered against the full chain')

  // Empty edges.
  eq(derive.compareCandidates({ chains: [] }, chainE, null), [], 'candidates: an isolated chain in an empty document lists nothing')
  const takeless = makeChain('tl', { inputSpec: { outputRef: { outputId: 'out-a' } } })
  eq(derive.compareCandidates(document, takeless, null).map((entry) => entry.kind), ['parent'], 'candidates: a takeless chain lists only the neighborhood')
  const isolated = makeChain('f', { outputs: [makeOutput('out-f', 'f', [makeTake('tf1', 10), makeTake('tf2', 20)])] })
  eq(derive.compareCandidates(document, isolated, null).map((entry) => entry.kind), ['take', 'take'], 'candidates: a takeless NEIGHBORHOOD leaves only the takes')
  eq(derive.compareCandidates(document, isolated, 'tf1').map((entry) => entry.takeId), ['tf2'], 'candidates: excluding the current take prunes exactly it')
})

test('(g) the used-by inverse walk — one inverse, chainTitle-named, no self, stable', () => {
  const t1 = makeTake('t1', 100)
  const t2 = makeTake('t2', 200)
  const chainA = makeChain('a', { outputs: [makeOutput('out-a', 'a', [makeTake('ta', 50)])] })
  const chainB = makeChain('b', { inputSpec: { outputRef: { outputId: 'out-a', takeId: 'ta', substrate: 'decoded' } }, outputs: [makeOutput('out-b', 'b', [t1, t2])] })
  const chainD = makeChain('d', { inputSpec: { outputRef: { outputId: 'out-b', substrate: 'extracted-frame', frameIndex: 84 } } })
  const chainC = makeChain('c', { inputSpec: { refs: [{ outputId: 'out-b' }, { outputId: 'gone' }] } })
  const chainSelf = makeChain('s', { inputSpec: { outputRef: { outputId: 'out-s' } }, outputs: [makeOutput('out-s', 's', [])] })
  const chainE = makeChain('e')
  const document = { project: { id: 'p1', name: 'p', camera: {}, createdAt: 1, lastActiveAt: 2 }, chains: [chainA, chainB, chainD, chainC, chainSelf, chainE] }

  // The neighborhood in both directions — BottomBar's forkHistory, extracted.
  eq(derive.forkNeighborhood(document, chainB), {
    parents: [{ id: 'a', title: 'video 1' }],
    forks: [{ id: 'd', title: 'video 3' }, { id: 'c', title: 'video 4' }],
  }, 'walk: parents = the chains whose outputs B consumes; forks = the chains consuming B\'s outputs — document order (d before c), chainTitle-named')

  // The inverse the viewer's header renders: exactly the fork arm.
  eq(derive.usedBy(document, chainB), [{ id: 'd', title: 'video 3' }, { id: 'c', title: 'video 4' }], 'walk: usedBy is the same walk\'s fork arm — one inverse, two homes')
  eq(derive.usedBy(document, chainA), [{ id: 'b', title: 'video 2' }], 'walk: A\'s consumer is B alone')
  eq(derive.usedBy(document, chainE), [], 'walk: a leaf chain consumes nobody\'s attention — empty, honestly')

  // No self, ever — even a chain whose inputSpec names its OWN output.
  eq(derive.usedBy(document, chainSelf), [], 'walk: a self-reference never lists the chain itself')
  eq(derive.forkNeighborhood(document, chainSelf).parents, [], 'walk: owning what you reference is not a parent either')

  // Unresolvable refs (tombstoned sources) yield no entries, no crash.
  eq(derive.usedBy(document, chainC), [], 'walk: a ref to a vanished output is honestly nobody')

  // Every take of every output counts as owned — the pointer switch arm.
  const multiOut = makeChain('m', { outputs: [makeOutput('out-m1', 'm', [makeTake('tm1', 10)]), makeOutput('out-m2', 'm', [makeTake('tm2', 20)])] })
  const consumer1 = makeChain('k1', { inputSpec: { outputRef: { outputId: 'out-m1' } } })
  const consumer2 = makeChain('k2', { inputSpec: { outputRef: { outputId: 'out-m2' } } })
  const doc2 = { chains: [multiOut, consumer1, consumer2] }
  eq(derive.usedBy(doc2, multiOut), [{ id: 'k1', title: 'video 2' }, { id: 'k2', title: 'video 3' }], 'walk: consumers of ANY of the chain\'s outputs list — one per chain, stable')
  console.log(`\ntest-takemath: ${passed} assertions passed`)
})
