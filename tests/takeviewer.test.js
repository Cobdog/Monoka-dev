// The take viewer core's contracts (foelihc T2, spec §2 stage + §3
// transport): the transport state machine, the scoped keymap (incl. the
// T-M3 focusable-chrome guard), the source-fallback selection, the surface
// gates (image = no transport, landingError = the verdict only, missing =
// the failure vocabulary's words), and the stage's zoom/pan math.
//
// Pure-module suite: src/media/takeViewerModel.ts through the VM harness —
// the wizardWalk shape. The repo has NO React-executing unit harness (no
// jsdom / testing-library; tests/canvas.test.js loads pure modules only),
// so the component (src/media/TakeViewerCore.tsx) is a THIN SHELL over
// this model: typecheck + scoped lint here, behavior e2e-owned (T7's
// journey legs). The model carries every contract this suite can pin.
//
// Sections:
//   (a) step-then-seek — steps pause first, then land the EXACT boundary
//       n/24 (never fractional drift; the drifted-3.5 s leg is the rule's
//       own example); one frame per press once aligned
//   (b) Shift+arrows = 1 s (24 frames); Home/End = 0 / N−1; the clamps
//   (c) transport defaults (loop ON, muted ON, 1×, playing) + the toggles
//       (speed cycles the four steps)
//   (d) the keymap — the §3 action table, chrome chords pass through, the
//       typing guard, the focusable-chrome guard, and the scope contract
//       (binds while attached, silent after detach)
//   (e) the source fallback order — blob → route → missing
//   (f) the surface gates — image takes carry no transport chrome,
//       landingError renders the verdict only, missing media gates the
//       stage; the action-enable ladder follows the surface
//   (g) the zoom contract — the 1×–4× clamp, wheel direction, the pan
//       clamp (pan dies at fit), the letterbox contain math, the
//       click-vs-pan threshold
//   (h) the missing-file words — the failure taxonomy's own output-missing
//       entry, never new words
//   (i) the pause-only intent (foelihc T4, the I-1 fix) — pausing NEVER
//       resumes: paused stays paused, playing pauses, idempotent, never a
//       seek. The use-frame handoff dispatches THIS, never toggle-play
//       (U while paused used to resume — T2's live bug)
//   (j) the seek intent + the strip wiring (T4) — a bare seek NEVER touches
//       playing; the strip's release composes resume-only-through-toggle
//   (k) the strip's resolved-duration gate (T3-review M-1) — a
//       maybe-metadata duration reads sheet-impossible, never a second door
//       into forever-generating
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

const model = loadTs('src/media/takeViewerModel.ts')
const taxonomy = loadTs('src/lib/failureTaxonomy.ts')
const takeMath = loadTs('src/media/takeMath.ts')

const BLOB = { kind: 'blob', url: 'https://studio/api/lan/documents/blobs/file?path=canvas-blobs/abc.mp4' }
const ROUTE = { kind: 'route', url: 'https://studio/api/lan/media?source=output&path=out/x.mp4' }
const BOTH = [BLOB, ROUTE]

/** A 5.0416 s clip at the 24 fps convention → 121 frames (T-M1's clip). */
const FRAMES = 121

test('(a) step-then-seek — pause first, land the exact boundary n/24', () => {
  console.log('viewer: the step transaction')
  // The rule's own example: a playhead reading 3.5 s but drifted past the
  // frame boundary (playing pauses with latency; 3.51 sits inside frame 84).
  const started = model.initialTransport()
  ok(started.playing === true, 'initial transport is the autoplay posture (playing)')
  const back = model.transportCommand(started, { type: 'step', direction: -1, coarse: false, currentTime: 3.51, frameCount: FRAMES })
  ok(back.state.playing === false, 'a step PAUSES first (spec §3)')
  ok(back.seekTo !== null, 'a step seeks (never a bare pause)')
  close(back.seekTo, 84 / 24, 0, '← from a drifted 3.5 s playhead lands currentTime ≡ 84/24 EXACTLY')
  ok(back.seekTo !== 3.51 - 1 / 24, 'the target is not t − 1/24 (the naive drift trap)')
  ok(back.seekTo * 24 === 84, 'the target is exactly on the frame boundary (×24 is an integer)')

  // Aligned, one frame per press: 84 → 83 → 82.
  const paused = { ...back.state }
  const b2 = model.transportCommand(paused, { type: 'step', direction: -1, coarse: false, currentTime: 84 / 24, frameCount: FRAMES })
  close(b2.seekTo, 83 / 24, 0, '← from the exact boundary steps one frame (83/24)')
  const b3 = model.transportCommand(paused, { type: 'step', direction: -1, coarse: false, currentTime: b2.seekTo, frameCount: FRAMES })
  close(b3.seekTo, 82 / 24, 0, '← again steps one more frame (82/24)')

  // Forward from a drifted position lands the NEXT boundary (85/24), and
  // from below a boundary steps to it (never skips a frame).
  const fwd = model.transportCommand(paused, { type: 'step', direction: 1, coarse: false, currentTime: 3.51, frameCount: FRAMES })
  close(fwd.seekTo, 85 / 24, 0, '→ from drifted 3.51 s lands 85/24 (the next boundary)')
  const fwdLow = model.transportCommand(paused, { type: 'step', direction: 1, coarse: false, currentTime: 3.4999, frameCount: FRAMES })
  close(fwdLow.seekTo, 84 / 24, 0, '→ from just below the boundary lands 84/24 (a frame is never skipped)')

  // The never-fractional-drift invariant across a sweep (n/24 × 24 carries
  // float noise — the integer check is a closeness, not an identity).
  for (const t of [0.013, 0.5, 1.999, 3.507, 4.9]) {
    const target = model.frameStepTarget(t, FRAMES, -1)
    ok(target >= 0, `sweep t=${t}: ← never seeks negative`)
    close(target * 24, Math.round(target * 24), 1e-9, `sweep t=${t}: ← lands an exact frame boundary`)
    const targetFwd = model.frameStepTarget(t, FRAMES, 1)
    close(targetFwd * 24, Math.round(targetFwd * 24), 1e-9, `sweep t=${t}: → lands an exact frame boundary`)
  }
  // Degenerates refuse honestly.
  ok(model.frameStepTarget(0, FRAMES, -1) === 0, '← at frame 0 holds 0 (clamped, never negative)')
  ok(model.frameStepTarget(Number.NaN, FRAMES, -1) === 0, 'a NaN playhead seeks frame 0, never NaN')
})

test('(b) Shift+arrows = 1 second; Home/End = 0 / N−1', () => {
  console.log('viewer: the coarse steps and the ends')
  const paused = { ...model.initialTransport(), playing: false }
  const coarseBack = model.transportCommand(paused, { type: 'step', direction: -1, coarse: true, currentTime: 3.5, frameCount: FRAMES })
  close(coarseBack.seekTo, 60 / 24, 0, 'Shift+← from 3.5 s lands 2.5 s (24 frames back)')
  const coarseFwd = model.transportCommand(paused, { type: 'step', direction: 1, coarse: true, currentTime: 3.5, frameCount: FRAMES })
  close(coarseFwd.seekTo, 108 / 24, 0, 'Shift+→ from 3.5 s lands 4.5 s (24 frames forward)')
  ok(coarseBack.state.playing === false && coarseFwd.state.playing === false, 'coarse steps pause first too (the step family)')

  const home = model.transportCommand(paused, { type: 'seek-end', which: 'first', frameCount: FRAMES })
  ok(home.seekTo === 0, 'Home seeks 0 (frame 0)')
  ok(home.state.playing === false, 'Home pauses first (the step family)')
  const end = model.transportCommand(paused, { type: 'seek-end', which: 'last', frameCount: FRAMES })
  close(end.seekTo, 120 / 24, 0, 'End seeks (N−1)/24 = 5 s exactly')
  ok(end.seekTo * 24 === FRAMES - 1, 'T-M1: End never seeks frame N of N (120, not 121)')

  ok(model.frameStepTarget(120 / 24, FRAMES, 1) === 120 / 24, '→ at the last frame holds it (clamped)')
  ok(model.transportCommand(paused, { type: 'step', direction: -1, coarse: true, currentTime: 0.2, frameCount: FRAMES }).seekTo === 0, 'coarse ← clamps at 0')
  close(model.transportCommand(paused, { type: 'step', direction: 1, coarse: true, currentTime: 4.9, frameCount: FRAMES }).seekTo, 120 / 24, 0, 'coarse → clamps at N−1')
})

test('(c) transport defaults and toggles — loop ON, muted ON, speed cycles', () => {
  console.log('viewer: the transport state machine')
  const initial = model.initialTransport()
  eq(initial, { playing: true, loop: true, muted: true, speedIndex: 2 }, 'defaults: playing (autoplay posture), loop ON, muted ON, 1×')
  ok(model.SPEED_STEPS[initial.speedIndex] === 1, 'the default speed step reads 1×')

  const loopOff = model.transportCommand(initial, { type: 'toggle-loop' })
  eq({ ...loopOff.state, loop: initial.loop }, initial, 'a toggle touches ONLY its own flag (nothing else moves)')
  ok(loopOff.state.loop === false, 'L flips loop OFF')
  ok(loopOff.seekTo === null, 'a toggle never seeks')
  const muteOff = model.transportCommand(initial, { type: 'toggle-mute' })
  ok(muteOff.state.muted === false, 'M flips mute OFF (audio check is deliberate)')

  const playToggle = model.transportCommand({ ...initial, playing: true }, { type: 'toggle-play' })
  ok(playToggle.state.playing === false, 'Space flips playing → paused')
  ok(model.transportCommand({ ...initial, playing: false }, { type: 'toggle-play' }).state.playing === true, 'Space flips paused → playing')

  // The speed chip cycles the four steps, wrapping.
  const speeds = []
  let state = initial
  for (let i = 0; i < 5; i += 1) {
    state = model.transportCommand(state, { type: 'cycle-speed' }).state
    speeds.push(model.SPEED_STEPS[state.speedIndex])
  }
  eq(speeds, [2, 0.25, 0.5, 1, 2], 'the chip cycles 2× → 0.25× → 0.5× → 1× → 2× (wraps through all four)')
  eq(model.SPEED_STEPS, [0.25, 0.5, 1, 2], 'the four blessed steps in order (spec §3)')
})

test('(d) the scoped keymap — the table, the guards, the bind/release', () => {
  console.log('viewer: the keymap')
  // The §3 table.
  eq(model.viewerKeyAction({ key: ' ' }, null), 'toggle-play', 'Space → play/pause')
  eq(model.viewerKeyAction({ key: 'Space' }, null), 'toggle-play', 'Space (the long spelling) → play/pause too')
  eq(model.viewerKeyAction({ key: 'ArrowLeft' }, null), 'step-back', '← → frame-step back')
  eq(model.viewerKeyAction({ key: 'ArrowRight' }, null), 'step-forward', '→ → frame-step forward')
  eq(model.viewerKeyAction({ key: 'ArrowLeft', shiftKey: true }, null), 'coarse-back', 'Shift+← → 1 s back')
  eq(model.viewerKeyAction({ key: 'ArrowRight', shiftKey: true }, null), 'coarse-forward', 'Shift+→ → 1 s forward')
  eq(model.viewerKeyAction({ key: 'Home' }, null), 'seek-first', 'Home → first frame')
  eq(model.viewerKeyAction({ key: 'End' }, null), 'seek-last', 'End → last frame')
  eq(model.viewerKeyAction({ key: 'l' }, null), 'toggle-loop', 'l → loop')
  eq(model.viewerKeyAction({ key: 'L' }, null), 'toggle-loop', 'L → loop (case-insensitive)')
  eq(model.viewerKeyAction({ key: 'm' }, null), 'toggle-mute', 'm → mute')
  eq(model.viewerKeyAction({ key: 'U' }, null), 'use-frame', 'U → use this frame (§4; the T5 handoff)')
  eq(model.viewerKeyAction({ key: 's' }, null), null, 'no key emits cycle-speed (§3 binds the speed chip to CLICK only)')

  // Never the viewer's: unknown keys, Enter, and — deliberately — Escape
  // (the layer registry owns Escape-class dismissal; the CORE is not a layer).
  eq(model.viewerKeyAction({ key: 'x' }, null), null, 'an unbound key is not the map\'s')
  eq(model.viewerKeyAction({ key: 'Enter' }, null), null, 'Enter is not the map\'s')
  eq(model.viewerKeyAction({ key: 'Escape' }, null), null, 'Escape is NEVER the map\'s (the layer registry owns it)')
  eq(model.viewerKeyAction({ key: 'v' }, null), null, 'the canvas map\'s v is not the viewer\'s')

  // Chrome chords pass through to the app chrome above every layer.
  eq(model.viewerKeyAction({ key: ' ', metaKey: true }, null), null, '⌘+Space passes through')
  eq(model.viewerKeyAction({ key: 'l', ctrlKey: true }, null), null, 'ctrl+l passes through')
  eq(model.viewerKeyAction({ key: 'm', altKey: true }, null), null, 'alt+m passes through')

  // The typing-target discipline (the menus\' rule, unchanged).
  eq(model.viewerKeyAction({ key: ' ' }, { tagName: 'INPUT' }), null, 'a key from a text field is the FIELD\'s')
  eq(model.viewerKeyAction({ key: 'ArrowLeft' }, { tagName: 'TEXTAREA' }), null, 'arrows from a textarea are the field\'s')
  eq(model.viewerKeyAction({ key: 'l' }, { isContentEditable: true }), null, 'a contenteditable target is the field\'s')

  // The focusable-chrome guard (T-M3): a Space aimed at a focused transport
  // chip activates the CHIP, not the map — no double fire.
  const chromeTarget = { closest: (selector) => (selector === '[data-take-viewer-chrome]' ? { tagName: 'BUTTON' } : null) }
  ok(model.isViewerChrome(chromeTarget) === true, 'the chrome predicate recognizes its own marked controls')
  eq(model.viewerKeyAction({ key: ' ' }, chromeTarget), null, 'Space on a focused transport chip is skipped by the map')
  eq(model.viewerKeyAction({ key: 'ArrowLeft' }, chromeTarget), null, 'arrows on a focused chip are skipped too')
  ok(model.isViewerChrome({ closest: () => null }) === false, 'an unmarked element is not chrome')
  ok(model.isViewerChrome(null) === false, 'no target is not chrome')

  // The scope contract: binds while attached, releases on detach.
  const fired = []
  let defaulted = 0
  const fakeWindow = {
    listeners: [],
    addEventListener(type, listener) { this.listeners.push({ type, listener }) },
    removeEventListener(type, listener) { this.listeners = this.listeners.filter((entry) => entry.listener !== listener) },
    dispatch(event) { for (const entry of this.listeners) if (entry.type === 'keydown') entry.listener(event) },
  }
  const detach = model.bindViewerKeymap(fakeWindow, (action) => fired.push(action))
  ok(fakeWindow.listeners.length === 1, 'binding the map attaches exactly one keydown listener')
  fakeWindow.dispatch({ key: 'm', target: null, preventDefault: () => { defaulted += 1 } })
  eq(fired, ['toggle-mute'], 'while attached, the map answers (scope ON)')
  ok(defaulted === 1, 'a consumed key is preventDefaulted (Space never scrolls)')
  fakeWindow.dispatch({ key: ' ', target: chromeTarget, preventDefault: () => { defaulted += 1 } })
  eq(fired, ['toggle-mute'], 'the chrome guard holds through the binding (the chip keeps its Space)')
  ok(defaulted === 1, 'a skipped key is NOT preventDefaulted (the button gets it untouched)')
  detach()
  fakeWindow.dispatch({ key: 'm', target: null, preventDefault: () => { defaulted += 1 } })
  eq(fired, ['toggle-mute'], 'after detach the map is silent (scope OFF — the unmount contract)')
  ok(defaulted === 1, 'and it no longer consumes anything')
})

test('(e) the source fallback order — blob → route → missing', () => {
  console.log('viewer: the media resolution')
  const first = model.initialMediaResolution(BOTH)
  eq(first, { state: 'present', index: 0, source: BLOB }, 'the content-addressed blob is the first source')
  const second = model.mediaResolutionAfterError(BOTH, first.index)
  eq(second, { state: 'present', index: 1, source: ROUTE }, 'a blob load error falls to the engine-side media route')
  const third = model.mediaResolutionAfterError(BOTH, second.index)
  eq(third, { state: 'missing', index: 2, source: null }, 'a route error falls to the honest missing state')
  eq(model.initialMediaResolution([]), { state: 'missing', index: 0, source: null }, 'no sources is missing immediately (never a spinner)')
  const routeOnly = model.initialMediaResolution([ROUTE])
  eq(routeOnly.source, ROUTE, 'a route-only list starts at the route')
  eq(model.mediaResolutionAfterError([ROUTE], routeOnly.index).state, 'missing', 'a route-only list has nothing behind it')
})

test('(f) the surface gates — image, landingError, missing', () => {
  console.log('viewer: which surfaces render')
  eq(model.viewerSurface({ kind: 'video', landingError: null, media: 'present' }), { verdictOnly: false, missing: false, stage: true, transport: true }, 'a present video take: stage + transport')
  eq(model.viewerSurface({ kind: 'image', landingError: null, media: 'present' }), { verdictOnly: false, missing: false, stage: true, transport: false }, 'an image take: the still + zoom, NO transport chrome (the dishonest shape named by §2)')
  eq(model.viewerSurface({ kind: 'video', landingError: 'the engine output could not be fetched: …', media: 'missing' }), { verdictOnly: true, missing: false, stage: false, transport: false }, 'a landingError take: the humanized verdict, NOTHING else (no stage, no transport)')
  eq(model.viewerSurface({ kind: 'image', landingError: 'frame 3 could not be fetched: …', media: 'present' }), { verdictOnly: true, missing: false, stage: false, transport: false }, 'the verdict gate wins for image takes too')
  eq(model.viewerSurface({ kind: 'video', landingError: null, media: 'missing' }), { verdictOnly: false, missing: true, stage: false, transport: false }, 'missing media: the honest missing-file state, no dead stage or transport')

  const videoSurface = model.viewerSurface({ kind: 'video', landingError: null, media: 'present' })
  const imageSurface = model.viewerSurface({ kind: 'image', landingError: null, media: 'present' })
  ok(model.actionEnabled('toggle-play', videoSurface) === true, 'transport actions are enabled on a video take')
  ok(model.actionEnabled('toggle-play', imageSurface) === false, 'transport actions are disabled on an image take')
  ok(model.actionEnabled('use-frame', imageSurface) === true, 'use-frame follows the STAGE (an image take is one pickable frame — T5 owns the handler)')
  ok(model.actionEnabled('use-frame', model.viewerSurface({ kind: 'video', landingError: null, media: 'missing' })) === false, 'use-frame is disabled with no media')
})

test('(g) the zoom contract — 1×–4×, the pan clamp, the letterbox', () => {
  console.log('viewer: the stage math')
  ok(model.VIEWER_ZOOM_MIN === 1 && model.VIEWER_ZOOM_MAX === 4, 'the blessed zoom range is 1×–4× (spec §2/D6)')
  ok(model.viewerZoomAfterWheel(1, -100) > 1, 'wheel up zooms in')
  ok(model.viewerZoomAfterWheel(2, 100) < 2, 'wheel down zooms out')
  ok(model.viewerZoomAfterWheel(1, 100) === 1, 'zooming out at fit holds 1×')
  ok(model.viewerZoomAfterWheel(4, -100) === 4, 'zooming in past 4× clamps at 4×')
  let zoom = 1
  for (let i = 0; i < 60; i += 1) zoom = model.viewerZoomAfterWheel(zoom, -100)
  ok(zoom === 4, 'sixty wheel-ups never exceed 4×')
  for (let i = 0; i < 60; i += 1) zoom = model.viewerZoomAfterWheel(zoom, 100)
  ok(zoom === 1, 'sixty wheel-downs never go below 1×')
  ok(model.viewerZoomAfterWheel(Number.NaN, -100) === 1, 'a NaN zoom resets to fit')

  // The pan clamp: pan bounds grow with (zoom − 1); fit kills pan entirely.
  eq(model.clampViewerPan(500, 300, 1, 800, 450), { x: 0, y: 0 }, 'at fit (1×) pan is always zero — the letterbox centers')
  eq(model.clampViewerPan(500, 300, 2, 800, 450), { x: 400, y: 225 }, 'at 2× the pan clamps at (zoom−1)×fitted/2 per axis')
  eq(model.clampViewerPan(-500, -300, 2, 800, 450), { x: -400, y: -225 }, 'the clamp is symmetric')
  ok(model.clampViewerPan(2, 2, 3, 800, 450).x === 2, 'small pans inside the bounds pass through untouched')

  // The letterbox contain math (fit-to-view).
  eq(model.fittedMediaSize(1920, 1080, 800, 600), { w: 800, h: 450 }, 'a 16:9 clip letterboxes to 800×450 inside 800×600')
  close(model.fittedMediaSize(1080, 1920, 800, 600).h, 600, 1e-9, 'a portrait clip is height-bound')
  close(model.fittedMediaSize(1080, 1920, 800, 600).w, 337.5, 1e-9, 'the portrait clip keeps its aspect (337.5 wide)')
  ok(model.fittedMediaSize(0, 0, 800, 600).w > 0, 'degenerate media still yields a drawable box (never NaN)')

  // Click vs pan: the movement threshold.
  ok(model.isPanGesture(2, 1) === false, 'a 2 px wiggle is a CLICK (toggle play)')
  ok(model.isPanGesture(5, 0) === true, 'a 5 px move is a PAN')
  ok(model.isPanGesture(0, 4) === true, 'the threshold is radial, per-axis agnostic')
})

test('(h) the missing-file words — the failure vocabulary\'s own', () => {
  console.log('viewer: the honest missing-file state')
  // The closed taxonomy is src/lib/failureTaxonomy.ts; its missing-file
  // class is the output-missing bucket. The viewer REUSES those words —
  // the pin is structural: the model\'s exported copy IS the taxonomy entry.
  const bucket = taxonomy.FAILURE_BUCKETS['output-missing']
  ok(model.MISSING_FILE_TITLE === bucket.label, 'the missing-file title is the taxonomy\'s output-missing label (never new words)')
  ok(model.MISSING_FILE_BODY === bucket.cause, 'the missing-file body is the taxonomy\'s output-missing cause')
  ok(typeof model.MISSING_FILE_TITLE === 'string' && model.MISSING_FILE_TITLE.length > 0, 'the title is real copy')
  ok(typeof model.MISSING_FILE_BODY === 'string' && model.MISSING_FILE_BODY.length > 0, 'the body is real copy')
  ok(model.MISSING_FILE_TITLE.indexOf('spinner') === -1 && model.MISSING_FILE_BODY.indexOf('Loading') === -1, 'never a spinner, never a loading placeholder')
  // And the two-hop math the transport leans on is T1\'s own (one constant).
  ok(model.FILMSTRIP_FPS === takeMath.FILMSTRIP_FPS, 'the model shares T1\'s one fps constant (no second literal)')
})

test('(i) the pause-only intent — pausing never resumes (the I-1 fix)', () => {
  console.log('viewer: the pause intent')
  const playing = model.initialTransport()
  const paused = { ...playing, playing: false }

  // THE I-1 CASE: the take is ALREADY paused; the pause-shaped gesture (the
  // use-frame handoff, the strip's scrub start) must leave it paused. Before
  // this intent existed the only shape was toggle-play — and U while paused
  // RESUMED (T2's live bug).
  const staysPaused = model.transportCommand(paused, { type: 'pause' })
  ok(staysPaused.state.playing === false, 'paused + pause → STAYS paused (U while paused never resumes)')
  ok(staysPaused.state.loop === paused.loop && staysPaused.state.muted === paused.muted && staysPaused.state.speedIndex === paused.speedIndex, 'a pause touches NOTHING but playing')
  ok(staysPaused.seekTo === null, 'a pause never seeks')

  const nowPaused = model.transportCommand(playing, { type: 'pause' })
  ok(nowPaused.state.playing === false, 'playing + pause → pauses')

  // Idempotent: however many pause-shaped gestures stack, the answer is the
  // same paused state.
  const twice = model.transportCommand(nowPaused.state, { type: 'pause' })
  eq(twice.state, nowPaused.state, 'pause is idempotent (double-pause holds the same state)')
  ok(twice.seekTo === null, 'the double pause still never seeks')

  // The composition the strip's release relies on: resume is ONLY reachable
  // through toggle-play, and toggle-play from the paused state plays — the
  // two intents stay distinct (a pause-shaped gesture can never resume).
  const resumed = model.transportCommand(nowPaused.state, { type: 'toggle-play' })
  ok(resumed.state.playing === true, 'toggle-play from paused resumes (the intents stay distinct)')
})

test('(j) the seek intent + the strip wiring — a bare seek never touches playing', () => {
  console.log('viewer: the seek intent')
  const playing = model.initialTransport()
  const paused = { ...playing, playing: false }

  // The strip's continuous scrub: seeking while playing KEEPS playing.
  const fromPlaying = model.transportCommand(playing, { type: 'seek', time: 3.5 })
  ok(fromPlaying.state.playing === true, 'a seek while playing keeps playing (never touches it)')
  ok(fromPlaying.state.speedIndex === playing.speedIndex && fromPlaying.state.loop === playing.loop && fromPlaying.state.muted === playing.muted, 'a seek touches NOTHING but the playhead')
  ok(fromPlaying.seekTo === 3.5, 'the seek carries the exact time')

  // Seeking while paused keeps it paused — the press = pause + seek as
  // SEPARATE transactions, exactly as the strip wires them.
  const fromPaused = model.transportCommand(paused, { type: 'seek', time: 1.25 })
  ok(fromPaused.state.playing === false, 'a seek while paused keeps it paused')
  ok(fromPaused.seekTo === 1.25, 'the paused seek still carries the time')

  // The strip's press composition: pause then seek (two transactions).
  const afterPress = model.transportCommand(
    model.transportCommand(playing, { type: 'pause' }).state,
    { type: 'seek', time: 2 },
  )
  ok(afterPress.state.playing === false && afterPress.seekTo === 2, 'the scrub press composes: pause first, then the seek (separate transactions)')

  // The strip's release composition: resume === false → NOTHING (the drag
  // begun paused stays paused); resume === true → toggle-play (the only
  // resume path). T3's stripDragRelease computes the boolean; the intent
  // shape here is what the core dispatches off it.
  const releasedCold = model.transportCommand(afterPress.state, { type: 'seek', time: 2.5 })
  ok(releasedCold.state.playing === false, 'release(resume=false) dispatches nothing play-shaped — the take stays paused')
  const releasedWarm = model.transportCommand(afterPress.state, { type: 'toggle-play' })
  ok(releasedWarm.state.playing === true, 'release(resume=true) is the toggle-play dispatch — the take resumes')
})

test('(k) the strip\'s resolved-duration gate (T3-review M-1) — never a second door into forever-generating', () => {
  console.log('viewer: the strip duration gate')
  // The take\'s duration is maybe-metadata: unprobed takes carry 0 (or worse,
  // NaN). The filmstrip loader never fetches for duration <= 0, so a
  // previewPath take with an unresolved duration would sit in the
  // \'generating\' state FOREVER (the sheet can never land). The gate: an
  // unresolved duration reads as sheet-IMPOSSIBLE — the plain honest state.
  ok(model.stripPreviewPath('/outputs/clip.mp4', 6) === '/outputs/clip.mp4', 'a resolved duration passes the preview path through (the sheet can exist)')
  ok(model.stripPreviewPath('/outputs/clip.mp4', 0) === null, 'duration 0 → null (the plain state — never forever-generating)')
  ok(model.stripPreviewPath('/outputs/clip.mp4', -1) === null, 'a negative duration → null too')
  ok(model.stripPreviewPath('/outputs/clip.mp4', Number.NaN) === null, 'a NaN duration → null, never a NaN-driven load')
  ok(model.stripPreviewPath(null, 6) === null, 'no preview path stays null (the blob-only shape)')
  ok(model.stripPreviewPath('/outputs/clip.mp4', Number.POSITIVE_INFINITY) === null, 'an infinite duration is not a resolved one')
  console.log(`\ntest-takeviewer: ${passed} assertions passed`)
})
