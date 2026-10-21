// The side-by-side take comparison's contracts (foelihc T6, spec §6.1 —
// D3's blessed cutline): the candidates the picker offers (T1's
// compareCandidates consumed, honestly filtered), the ONE shared clock (a
// command fans out to both panes), THE HOLD RULE (the shorter pane holds its
// last frame, with loop ON the hold governs across the wrap — T-M2's no
// pane ever runs its own clock), focus (click to focus, the ring, U reads
// the FOCUSED pane's clock), the pool's exclusive:false coexistence, and
// the aspect split (portrait stacks).
//
// TWO harnesses, one suite — the wave's established shape:
//   - the PURE models load through the VM harness: src/media/
//     takeCompareModel.ts (canvas-agnostic clock/fan-out/hold spine) and
//     src/canvas/takeViewerOverlayModel.ts (the picker's honest filter);
//     videoPool.ts itself EXECUTES in the VM under a stub DOM for the
//     coexisting-inspectors leg (the pool has no dedicated unit suite, so
//     this suite is the pool's exclusive:false contract's one execution
//     home — stated in scripts/ci-map.cjs's rule).
//   - the React SHELL (src/media/TakeCompare.tsx) pins as SOURCE TEXT —
//     the canvas suite's (v) grep-pin idiom: presence needles for the
//     load-bearing wiring. The rendered behavior is e2e-owned (T7's legs).
//
// Sections:
//   (a) the candidates — T1's compareCandidates ordering consumed by the
//       picker (takes first, then the neighborhood), the honest filter
//       (takeless + non-video candidates dropped), the pane resolution,
//       the keys, the chip's gate (no dead chip)
//   (b) the shared clock — a seek applies to both panes (same seconds,
//       each clamped through the hold lens), play/pause/speed drive both,
//       loop reaches the ELEMENTS as false (T-M2), the wrap, the master
//   (c) THE HOLD RULE — beyond the shorter pane's duration it holds its
//       last frame with the exact on-strip note, the longer keeps playing,
//       and the pure sweep: one full loop wrap enumerated, no pane ever
//       advances past its own duration (T-M2)
//   (d) focus — pane A starts focused, the focused-pane resolver, U
//       computes from the FOCUSED pane's clock (the handoff consumes the
//       right pane's grid), the focused timecode
//   (e) exclusive:false — both leases COEXIST against the real pool code
//       under a stub DOM (the count asserted), an exclusive lease evicts
//       both; text pins: the shell passes exclusive:false, the hook
//       forwards it
//   (f) the aspect split — the FOCUSED pane's media aspect decides:
//       portrait stacks, landscape (and unprobed) side-by-side
//   (g) the shell's wiring — text pins: the fan-out seam, the wrap on the
//       master's ended, the scoped keymap, the chrome marks, the per-pane
//       strip riding the shared clock, the hold note's DOM
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

const require = createRequire(import.meta.url)

const assert = require('node:assert/strict')
const { loadTs } = require('../scripts/lib/ts-vm.cjs')
const fs = nodeFs
const path = nodePath
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(repo, file), 'utf8')

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

const compare = loadTs('src/media/takeCompareModel.ts')
const viewerModel = loadTs('src/media/takeViewerModel.ts')
const overlayModel = loadTs('src/canvas/takeViewerOverlayModel.ts')
const derive = loadTs('src/canvas/derive.ts')

// ---- fixtures (§2.1 document shapes derive.ts reads) -------------------------

const makeTake = (id, createdAt, extra = {}) => ({
  id, outputId: `out-${id}`, jobId: null, artifacts: [], latentPath: null,
  metrics: null, createdAt, supersededBy: null, evicted: false, contentHash: null,
  ...extra,
})
const videoTake = (id, createdAt, duration = 4, over = {}) =>
  makeTake(id, createdAt, { metrics: { kind: 'video', duration, width: 1024, height: 576 }, ...over })
const imageTake = (id, createdAt) =>
  makeTake(id, createdAt, { metrics: { kind: 'image', width: 1024, height: 1024 } })
const makeOutput = (id, chainId, takes) => ({ id, chainId, substratesAvailable: [], createdAt: 1, canonicalTakeId: takes.length ? takes[0].id : null, takes })
const makeChain = (id, over) => Object.assign(
  { id, projectId: 'p1', kind: 'video', inputSpec: {}, settings: {}, lockState: 'unlocked', hopCount: 0, driftMetrics: null, stale: false, createdAt: 100, outputs: [], ops: [] },
  over,
)

/** The §6.1 A/B fixture: chain b (watched, take 2 of 3) forked from a and
 *  forked into d; e is unrelated. All takes video so the clean ordering is
 *  visible before the honest filters get exercised. */
const abFixture = () => {
  const chainA = makeChain('a', { outputs: [makeOutput('out-a', 'a', [videoTake('ta', 50)])] })
  const t3 = videoTake('t3', 300, 8)
  const t1 = videoTake('t1', 100, 5)
  const t2 = videoTake('t2', 200, 4)
  const chainB = makeChain('b', { inputSpec: { outputRef: { outputId: 'out-a' } }, outputs: [makeOutput('out-b', 'b', [t3, t1, t2])] })
  const chainD = makeChain('d', { inputSpec: { outputRef: { outputId: 'out-b' } }, outputs: [makeOutput('out-d', 'd', [videoTake('td', 400)])] })
  const chainE = makeChain('e', { outputs: [makeOutput('out-e', 'e', [videoTake('te', 500)])] })
  return { chainA, chainB, chainD, chainE, document: { chains: [chainA, chainB, chainD, chainE] } }
}

test('(a) the candidates — T1\'s ordering consumed, honest filters, the gate', () => {
  console.log('compare: the candidates')
  const { chainB, document } = abFixture()

  // The picker's list IS T1's walk (spec §6.1: "the exact walk"): this
  // chain's OTHER takes first (the takeNumberOf ladder), then the
  // neighborhood (parents, then forks, document order) — one walk, two
  // homes (the bar's chips and this picker).
  const pickable = overlayModel.pickableCompareCandidates(document, chainB, 't2')
  eq(pickable, [
    { kind: 'take', takeId: 't1', number: 1, title: 'take 1' },
    { kind: 'take', takeId: 't3', number: 3, title: 'take 3' },
    { kind: 'parent', id: 'a', title: 'video 1' },
    { kind: 'fork', id: 'd', title: 'video 3' },
  ], 'the picker: other takes in ladder order (t2 excluded), then the parent, then forks')
  eq(pickable, derive.compareCandidates(document, chainB, 't2'), 'the clean all-video list is T1\'s output verbatim (no re-walk, no re-order)')

  // The honest filters: a chain candidate with NOTHING reviewable (takeless
  // parent) never reaches the picker — the pane it would open is empty.
  const takelessParent = makeChain('tp', { inputSpec: {}, outputs: [makeOutput('out-tp', 'tp', [])], kind: 'video' })
  const watched = makeChain('w', { inputSpec: { outputRef: { outputId: 'out-tp' } }, outputs: [makeOutput('out-w', 'w', [videoTake('tw', 10)])] })
  const docTakeless = { chains: [takelessParent, watched] }
  const raw = derive.compareCandidates(docTakeless, watched, 'tw')
  ok(raw.some((entry) => entry.id === 'tp'), 'fixture: the raw walk DOES list the takeless parent (T1\'s fn is ref-edge truth)')
  eq(overlayModel.pickableCompareCandidates(docTakeless, watched, 'tw'), [], 'the picker DROPS the takeless parent (an empty pane is not a candidate)')

  // A non-video canonical (an image parent) is dropped the same way — v1
  // compare is the video A/B surface (the shared transport is meaningless
  // over a still; §2's own image rule).
  const imageParent = makeChain('ip', { outputs: [makeOutput('out-ip', 'ip', [imageTake('ti', 50)])] })
  const imageWatcher = makeChain('iw', { inputSpec: { outputRef: { outputId: 'out-ip' } }, outputs: [makeOutput('out-iw', 'iw', [videoTake('tv', 60)])] })
  const docImage = { chains: [imageParent, imageWatcher] }
  eq(overlayModel.pickableCompareCandidates(docImage, imageWatcher, 'tv'), [], 'the picker DROPS the image-canonical parent (v1 compare is video-only)')
  // …and an image TAKE sibling is dropped too.
  const mixed = makeChain('mx', { outputs: [makeOutput('out-mx', 'mx', [videoTake('mv1', 10), imageTake('mi2', 20)])] })
  eq(
    overlayModel.pickableCompareCandidates({ chains: [mixed] }, mixed, 'mv1').map((entry) => entry.takeId),
    [],
    'an image take sibling never reaches the picker',
  )

  // The pane each candidate resolves to: a take candidate is THAT take; a
  // chain candidate is the chain's canonical (first supersededBy-null,
  // deriveTiles' own rule — one rule, two homes).
  eq(overlayModel.candidatePaneTake(document, { kind: 'take', takeId: 't1', number: 1, title: 'take 1' }).id, 't1', 'a take candidate resolves to that take')
  const parentPane = overlayModel.candidatePaneTake(document, { kind: 'parent', id: 'a', title: 'video 1' })
  eq(parentPane.id, 'ta', 'a chain candidate resolves to its canonical take')
  const superseded = makeChain('sp', { outputs: [makeOutput('out-sp', 'sp', [makeTake('s1', 10, { supersededBy: 's2' }), videoTake('s2', 20)])] })
  eq(overlayModel.candidatePaneTake({ chains: [superseded] }, { kind: 'fork', id: 'sp', title: 'x' }).id, 's2', 'the canonical is the first NON-superseded take, never a prior')
  eq(overlayModel.candidatePaneTake({ chains: [] }, { kind: 'fork', id: 'gone', title: 'x' }), null, 'a gone chain resolves to null (honestly, never a fake pane)')

  // The candidate keys — the pane identities the mount keys on.
  eq(overlayModel.candidateKey({ kind: 'take', takeId: 't1', number: 1, title: 'take 1' }), 'take:t1', 'a take candidate keys take:<id>')
  eq(overlayModel.candidateKey({ kind: 'parent', id: 'a', title: 'video 1' }), 'chain:a', 'a chain candidate keys chain:<id>')
  eq(overlayModel.findCandidate(pickable, 'chain:a').title, 'video 1', 'findCandidate locates by key')
  eq(overlayModel.findCandidate(pickable, 'chain:zz'), null, 'findCandidate misses honestly')

  // The chip's gate (the honest-state discipline): the compare chip exists
  // ONLY where a second candidate exists — an isolated single-take chain
  // with an empty neighborhood renders NO chip, never a dead one.
  const isolated = makeChain('solo', { outputs: [makeOutput('out-solo', 'solo', [videoTake('ts1', 10)])] })
  const empty = overlayModel.pickableCompareCandidates({ chains: [isolated] }, isolated, 'ts1')
  eq(empty, [], 'an isolated chain has NO candidates (empty neighborhood, no other takes)')
  ok(overlayModel.compareGate({ watchedKind: 'video', candidates: empty }) === false, 'the gate HIDES the chip when there is nothing to compare against (no dead chip)')
  ok(overlayModel.compareGate({ watchedKind: 'video', candidates: pickable }) === true, 'the gate shows the chip where a second candidate exists')
  ok(overlayModel.compareGate({ watchedKind: 'image', candidates: pickable }) === false, 'the gate hides the chip for an image watched take (no transport to share)')

  // Entering compare auto-picks the FIRST candidate (the A/B fork case —
  // this chain's other takes lead the list); an empty list never enters.
  eq(overlayModel.enterComparePick(pickable), 'take:t1', 'entering compare auto-picks the first candidate (the other-take A/B case)')
  eq(overlayModel.enterComparePick([]), null, 'an empty list picks nothing (the chip was never shown)')
})

test('(b) the shared clock — one command, both panes, the wrap, the master', () => {
  console.log('compare: the shared clock')
  // The A/B pair: take 1 (5 s) beside take 2 (8 s) — the spec's own
  // differing-durations shape.
  const panes = [
    { id: 'take:t1', title: 'take 1', duration: 5 },
    { id: 'take:t2', title: 'take 2', duration: 8 },
  ]
  const playing = viewerModel.initialTransport()
  ok(playing.playing === true && playing.loop === true, 'fixture: §3\'s autoplay+loop posture is the compare default too')

  // A SEEK applies to both panes at the same seconds — each through its
  // own hold lens (the shorter pane seeks its END, never beyond it).
  const seek = viewerModel.transportCommand(playing, { type: 'seek', time: 3 })
  let fan = compare.fanOutCommand(seek, panes, 'take:t1', 0)
  eq(fan.map((pane) => pane.seekTo), [3, 3], 'a clock seek to 3 s lands BOTH panes at 3 s (same seconds)')
  eq(fan.map((pane) => pane.playing), [true, true], 'a bare seek never pauses either pane (the intent\'s own contract)')

  const seekPast = viewerModel.transportCommand(playing, { type: 'seek', time: 6.5 })
  fan = compare.fanOutCommand(seekPast, panes, 'take:t1', 0)
  eq(fan.map((pane) => pane.seekTo), [5, 6.5], 'a seek past the shorter pane lands it AT its end (5 s), the longer at 6.5 s')
  eq(fan.map((pane) => pane.playing), [false, true], 'the shorter pane does not PLAY past its own end (the hold starts at the seek)')

  // PLAY/PAUSE drive both — through the hold guard: paused-then-play at
  // clock 7 starts only the pane still inside the clock's domain.
  const paused = { ...playing, playing: false }
  const resume = viewerModel.transportCommand(paused, { type: 'toggle-play' })
  fan = compare.fanOutCommand(resume, panes, 'take:t1', 7)
  eq(fan.map((pane) => pane.playing), [false, true], 'resume at clock 7: the holding pane STAYS held, the longer pane plays')
  const pause = viewerModel.transportCommand(playing, { type: 'pause' })
  fan = compare.fanOutCommand(pause, panes, 'take:t1', 3)
  eq(fan.map((pane) => pane.playing), [false, false], 'pause pauses both panes')

  // SPEED drives both (the rate rides every fan-out entry).
  const speed = viewerModel.transportCommand(playing, { type: 'cycle-speed' })
  fan = compare.fanOutCommand(speed, panes, 'take:t1', 0)
  eq(fan.map((pane) => pane.playbackRate), [2, 2], 'cycle-speed drives BOTH panes (1× → 2×)')

  // LOOP reaches the ELEMENTS as false — always (T-M2: no pane ever runs
  // its own clock; the wrap is the shared clock's decision, never the
  // element's). The state's loop flag still governs the WRAP below.
  const loopOff = viewerModel.transportCommand(playing, { type: 'toggle-loop' })
  ok(loopOff.state.loop === false, 'fixture: the toggle flips the shared loop state')
  for (const command of [seek, resume, loopOff, speed]) {
    const entries = compare.fanOutCommand(command, panes, 'take:t1', 0)
    ok(entries.every((pane) => pane.loop === false), `the elements never loop themselves (T-M2) — even with the clock's loop ${command.state.loop ? 'on' : 'off'}`)
  }

  // THE WRAP: with loop ON the master's end re-seeks BOTH panes to 0 and
  // keeps playing (the shorter pane RE-JOINS); with loop OFF the clock
  // just stops.
  const wrapOn = compare.wrapCommand(playing)
  eq(wrapOn, { state: { ...playing, playing: true }, seekTo: 0 }, 'loop ON: the wrap seeks 0 and keeps playing')
  fan = compare.fanOutCommand(wrapOn, panes, 'take:t1', 8)
  eq(fan.map((pane) => pane.seekTo), [0, 0], 'the wrap seeks BOTH panes to 0 (the re-join)')
  eq(fan.map((pane) => pane.playing), [true, true], 'the wrap re-joins the held pane to playback')
  const wrapOff = compare.wrapCommand(loopOff.state)
  eq(wrapOff.seekTo, null, 'loop OFF: no wrap seek')
  ok(wrapOff.state.playing === false, 'loop OFF: the clock stops at the master\'s end')

  // The clock master: the pane whose own timeline IS the clock — the
  // LONGEST duration (the playhead must keep moving after the shorter
  // ends); ties go to the first pane (the watched take — deterministic).
  eq(compare.clockMasterId(panes), 'take:t2', 'the longer pane is the clock master')
  eq(compare.clockMasterId([panes[1], panes[0]]), 'take:t2', 'the master is by duration, not pane order')
  eq(compare.clockMasterId([{ id: 'a', title: 'a', duration: 5 }, { id: 'b', title: 'b', duration: 5 }]), 'a', 'a duration tie masters the FIRST pane (the watched take)')
  eq(compare.clockMasterId([]), null, 'no panes, no master')

  // The mute rule: audio follows FOCUS — the focused pane's sound follows
  // the shared mute state, the other pane is always muted (two playing
  // videos with one soundscape would be a lie).
  eq(compare.paneMuted(playing, true), true, 'the focused pane follows the shared mute state (muted by default)')
  const unmuted = { ...playing, muted: false }
  eq(compare.paneMuted(unmuted, true), false, 'unmuting opens the FOCUSED pane\'s audio')
  eq(compare.paneMuted(unmuted, false), true, 'the unfocused pane stays muted always')
})

test('(c) THE HOLD RULE — the shorter pane holds, the exact note, the T-M2 sweep', () => {
  console.log('compare: the hold rule')
  const SHORT = 5
  const LONG = 8

  // Beyond the shorter pane's duration, that pane HOLDS its last frame…
  eq(compare.paneDisplayTime(6, SHORT), 5, 'clock 6 on a 5 s pane displays 5 (its last frame)')
  eq(compare.paneDisplayTime(8, SHORT), 5, 'clock 8 on a 5 s pane still displays 5 (held)')
  ok(compare.paneHolds(6, SHORT) === true, 'paneHolds: the clock past the pane\'s end holds')
  ok(compare.paneHolds(4.9, SHORT) === false, 'paneHolds: inside the pane\'s span it plays')
  ok(compare.paneHolds(5, SHORT) === false, 'paneHolds: AT the end is the end, not yet a hold (the note appears past it)')
  // …the longer pane keeps playing.
  ok(compare.paneHolds(6, LONG) === false, 'the longer pane keeps playing at clock 6')
  eq(compare.paneDisplayTime(6, LONG), 6, 'the longer pane displays the clock itself')

  // Degenerates: an unprobed duration never holds (nothing to hold
  // against) and never yields NaN.
  ok(compare.paneHolds(6, 0) === false, 'an unprobed duration never reports a hold')
  eq(compare.paneDisplayTime(6, 0), 0, 'an unprobed duration displays 0, never NaN')
  eq(compare.paneDisplayTime(Number.NaN, SHORT), 0, 'a NaN clock displays 0, never NaN')

  // The on-strip note's EXACT shape — the spec §6.1's own sentence.
  eq(compare.holdNote('take 2'), 'take 2 ended — holding its last frame', 'the note: "<pane> ended — holding its last frame" (the spec\'s words)')
  eq(compare.holdNote('video 3'), 'video 3 ended — holding its last frame', 'a chain pane reads its chain title in the same template')

  // THE PURE SWEEP (T-M2): enumerate one full clock domain — up through
  // the master's end, wrap, then up again — and assert NO pane ever
  // advances past its own duration, the shorter pane holding min(clock,
  // itself) throughout and re-joining when the clock comes back under it.
  const step = 1 / 24
  const violations = []
  let heldAtTail = 0
  let rejoined = false
  for (let t = 0; t <= LONG + step / 2; t += step) {
    const a = compare.paneDisplayTime(t, SHORT)
    const b = compare.paneDisplayTime(t, LONG)
    if (a > SHORT + 1e-9 || Math.abs(a - Math.min(t, SHORT)) > 1e-9) violations.push(`5 s pane at clock ${t.toFixed(3)} read ${a}`)
    if (b > LONG + 1e-9 || Math.abs(b - Math.min(t, LONG)) > 1e-9) violations.push(`8 s pane at clock ${t.toFixed(3)} read ${b}`)
    if (t > SHORT) heldAtTail += 1
  }
  ok(violations.length === 0, `the sweep: every pane reads min(clock, its own duration) across the FULL domain — no pane ever advances past its own duration (T-M2)${violations.length ? ` — first violations: ${violations.slice(0, 3).join('; ')}` : ''}`)
  ok(heldAtTail > 24, `fixture: the tail (clock past 5 s) was actually swept (${heldAtTail} frame-spaced samples held at the last frame)`)
  // The wrap: the clock comes back under the short pane's duration and it
  // RE-JOINS — same pure function, the loop's second lap.
  for (let t = step; t <= SHORT; t += step) {
    if (Math.abs(compare.paneDisplayTime(t, SHORT) - t) > 1e-9) violations.push(`re-join at ${t.toFixed(3)}`)
    rejoined = true
  }
  ok(violations.every((entry) => !entry.startsWith('re-join')), 'after the wrap the 5 s pane RE-JOINS the clock (it tracks the clock again under its duration)')
  ok(rejoined === true, 'the re-join lap actually ran')
})

test('(d) focus — pane A starts focused, the ring, U reads the FOCUSED pane\'s clock', () => {
  console.log('compare: focus')
  const panes = [
    { id: 'take:t1', title: 'take 1', duration: 5 },
    { id: 'take:t2', title: 'take 2', duration: 8 },
  ]

  // Pane A (the watched take) starts focused; the resolver follows the
  // focus id with an honest fallback to pane A (a stale focus never
  // blanks the U path).
  eq(compare.initialFocusId(panes), 'take:t1', 'pane A — the watched take — starts focused')
  eq(compare.focusedPane(panes, 'take:t2').id, 'take:t2', 'the resolver follows the focus id')
  eq(compare.focusedPane(panes, 'stale-id').id, 'take:t1', 'a stale focus falls back to pane A (never null mid-compare)')
  eq(compare.focusedPane([], 'x'), null, 'no panes, no focused pane')

  // U computes from the FOCUSED pane's clock — the anchor rides the
  // focused pane's own frame grid, held-clamped at its end.
  const playing = viewerModel.initialTransport()
  // Focus the SHORT pane while the clock is past it: the anchor is the
  // short pane's LAST frame (5 s grid → 120 frames → anchor 119), never
  // the long pane's grid.
  const shortHandoff = compare.compareUseFrame(playing, 7, 5)
  eq(shortHandoff.frameIndex, 119, 'U on the held 5 s pane anchors its LAST frame (119 of 120 — the T-M1 clamp through the hold lens)')
  ok(shortHandoff.command.state.playing === false, 'U still pauses first (the §4 combined transaction, unchanged)')
  ok(shortHandoff.command.seekTo === null, 'U never seeks (the pause-only command)')
  // Focus the LONG pane at the same clock: the same 7 s reads the LONG
  // grid (frame 168 of 192) — the handoff consumes the RIGHT pane's clock.
  const longHandoff = compare.compareUseFrame(playing, 7, 8)
  eq(longHandoff.frameIndex, 168, 'U on the focused 8 s pane anchors frame 168 (7 s × 24 on ITS grid)')
  ok(longHandoff.frameIndex !== shortHandoff.frameIndex, 'the anchor differs by focused pane (the A/B question answers on the winner\'s grid)')
  // Inside both spans the focused lens is the plain §4 pick lens.
  eq(compare.compareUseFrame(playing, 3.53, 8).frameIndex, 85, 'the ROUND pick lens holds inside the span (3.53 s → 85, not floor\'s 84)')

  // The timecode reads the focused pane's grid too (the number the U
  // anchor will name).
  eq(compare.paneTimecode(7, 5), '4.23 · frame 119 of 120', 'the timecode at clock 7 on the 5 s pane reads its held last frame')
  eq(compare.paneTimecode(3.5, 5), '3.12 · frame 84 of 120', 'the timecode inside the span is the §3 S.FF shape on the focused grid (frame 84 = 3 s + 12 frames)')
})

test('(e) exclusive:false — both leases COEXIST against the real pool (stub DOM)', () => {
  console.log('compare: the coexisting leases')
  // The pool has NO dedicated unit suite (its only test presence was
  // absence pins), so THIS suite is the exclusive:false contract's one
  // execution home: videoPool.ts runs in the VM under a stub DOM and the
  // lease COUNT is asserted — the pool's own diagnostic counter.
  const makeStubVideo = () => {
    const listeners = []
    return {
      preload: 'none', playsInline: true, controls: false, muted: false, loop: false, autoplay: false, src: '',
      addEventListener(type, listener) { listeners.push([type, listener]) },
      removeEventListener(type, listener) {
        const index = listeners.findIndex(([t, l]) => t === type && l === listener)
        if (index >= 0) listeners.splice(index, 1)
      },
      removeAttribute(name) { if (name === 'src') this.src = '' },
      pause() {}, play() { return Promise.resolve() }, load() {}, remove() {},
    }
  }
  let preemptedA = 0
  let preemptedB = 0
  const pool = loadTs('src/media/videoPool.ts', {
    document: { createElement: () => makeStubVideo() },
    window: { setTimeout: () => 0, clearTimeout: () => undefined },
  })

  const leaseA = pool.leaseVideo({ src: 'a.mp4', exclusive: false, onPreempted: () => { preemptedA += 1 } })
  ok(leaseA !== null, 'the first pane leases')
  eq(pool.activeVideoLeaseCount(), 1, 'one lease live')
  const leaseB = pool.leaseVideo({ src: 'b.mp4', exclusive: false, onPreempted: () => { preemptedB += 1 } })
  ok(leaseB !== null, 'the second pane leases')
  ok(leaseA.video !== leaseB.video, 'the panes hold DISTINCT elements (true coexistence, not a shared one)')
  eq(pool.activeVideoLeaseCount(), 2, 'BOTH leases coexist — the coexisting-inspectors case (exclusive: false)')
  ok(preemptedA === 0 && preemptedB === 0, 'neither pane preempted the other')

  // The contrast: an EXCLUSIVE lease (the default) evicts both — the
  // compare panes' non-exclusivity is what keeps them alive.
  const leaseC = pool.leaseVideo({ src: 'c.mp4' })
  ok(leaseC !== null, 'an exclusive lease arrives')
  eq(pool.activeVideoLeaseCount(), 1, 'the exclusive lease evicted both compare panes (the default behavior stands)')
  ok(preemptedA === 1 && preemptedB === 1, 'both panes\' onPreempted fired (the pool\'s contract reached the UI)')

  // The text-level wiring: the shell passes exclusive:false on both panes,
  // and the hook forwards it to the pool (a dropped flag would silently
  // revert compare to winner-takes-all).
  const shell = read('src/media/TakeCompare.tsx')
  const nonExclusiveMarks = shell.match(/exclusive: false/g) ?? []
  ok(nonExclusiveMarks.length >= 2, `pin: TakeCompare passes exclusive:false on BOTH panes (found ${nonExclusiveMarks.length})`)
  const hook = read('src/media/usePooledVideo.ts')
  ok(hook.includes('exclusive'), 'pin: usePooledVideo forwards the exclusive flag to leaseVideo')
})

test('(f) the aspect split — the FOCUSED pane\'s aspect decides; portrait stacks', () => {
  console.log('compare: the split')
  // The rule (stated): the FOCUSED pane's media aspect decides the split —
  // portrait media (height > width) stacks the panes vertically so each
  // pane gets the tall box portrait video needs; landscape and UNPROBED
  // metrics go side-by-side (the default posture — never a layout flip on
  // missing metadata).
  eq(compare.compareLayout({ width: 1024, height: 576 }), 'side-by-side', 'landscape media splits side-by-side')
  eq(compare.compareLayout({ width: 576, height: 1024 }), 'stacked', 'portrait media STACKS (spec §6.1)')
  eq(compare.compareLayout({ width: 1024, height: 1024 }), 'side-by-side', 'square media is NOT portrait (strictly h > w)')
  eq(compare.compareLayout({ width: 0, height: 0 }), 'side-by-side', 'unprobed metrics default side-by-side, never a NaN flip')
  eq(compare.compareLayout({ width: Number.NaN, height: 1024 }), 'side-by-side', 'a NaN width degrades to the default')
})

test('(g) the shell\'s wiring — the fan-out seam, the wrap, the keymap, the chrome', () => {
  console.log('compare: the wiring')
  const shell = read('src/media/TakeCompare.tsx')
  // ONE command seam: the shell applies the model's fan-out (never its own
  // per-video conditionals).
  ok(shell.includes('fanOutCommand('), 'pin: applyCommand rides the model\'s fan-out (one command, both panes)')
  ok(shell.includes('wrapCommand('), 'pin: the master\'s ended dispatches the model\'s wrap decision (loop ON re-joins, OFF stops)')
  ok(shell.includes('clockMasterId('), 'pin: the clock master is the model\'s decision (the longest pane)')
  // The scoped keymap (§3): compare binds the SAME map — Space/arrows/U
  // drive the shared clock, and the map\'s chrome guard needs the marks.
  ok(shell.includes('bindViewerKeymap'), 'pin: the viewer-scoped keymap binds in compare (the same scope contract)')
  const chromeMarks = shell.match(/data-take-viewer-chrome/g) ?? []
  ok(chromeMarks.length >= 5, `pin: the transport controls carry the focusable-chrome mark (≥ 5; found ${chromeMarks.length})`)
  // The panes: click focuses (the ring), the note renders on-strip, each
  // pane rides the shared clock through its OWN strip.
  ok(shell.includes('data-take-compare-focused'), 'pin: the focused pane carries the ring state (the DOM mark)')
  ok(shell.includes('data-take-compare-hold'), 'pin: the hold note carries its DOM mark')
  ok(shell.includes('paneHolds(') && shell.includes('holdNote('), 'pin: the note renders from the model\'s hold predicate + template')
  ok(shell.includes('TakeFilmstrip'), 'pin: each pane renders its own strip (the scrub stays on the strip surface)')
  ok(shell.includes('compareUseFrame('), 'pin: U rides the model\'s focused-pane handoff (the shell never re-derives the anchor)')
  ok(shell.includes('compareLayout('), 'pin: the split direction rides the model\'s aspect rule')
  // (the §4 transaction itself lives in takeViewerModel — compare composes it;
  // T6's review caught this line as a tautological `=== false || true` assertion)
  ok(!shell.includes('video.loop = true'), 'pin: no pane element ever loops itself (the wrap is the clock\'s, T-M2)')
  console.log(`\ntest-takecompare: ${passed} assertions passed`)
})
