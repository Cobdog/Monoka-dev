// The "use this frame" fork handoff (foelihc T5, spec §4 — audit T-C1's
// central fix): U pauses, computes the clamped ROUND-lens frame anchor, and
// the fork flow consumes it with the RIGHT UNIT at every seam.
//
// The two-hop contract under test, end to end at the pure level:
//   the viewer computes  frameIndex = round(currentTime × 24)  clamped to N−1
//   the fork path calls  extractVideoFrame(position = frameIndex / 24)  — SECONDS
//   the chain records    inputSpec.frameIndex = frameIndex              — FRAMES
// A literal implementation that passes the frame number as the position
// would seek to second 84 of a 5-second clip; the wrong-unit trap is exactly
// what these legs exist to catch — asserted on the REQUEST computation (the
// pure function whose return IS the call argument), with T7's e2e owning
// the wire body itself.
//
// Harnesses (the overlay suite's shape): the pure modules —
// src/media/takeViewerModel.ts, src/canvas/generation.ts,
// src/canvas/options.ts — load through the VM harness; the shells
// (TakeViewerCore / TakeViewerOverlay / ForkMenu) and the store's fork path
// pin as SOURCE TEXT — the model owns every decision, and the text pins
// prove the wiring rides the decisions (a raw frameIndex at the seam call
// would still typecheck; the canvas seam rule keeps store.ts itself
// unexecuted by unit suites — e2e owns its behavior).
//
// Sections:
//   (a) the U computation (frameHandoff) — the combined transaction:
//       pause-first (playing pauses, paused holds, NEVER a seek), the ROUND
//       pick lens pinned against the step lens's floor (3.53 s → frame 85;
//       floor would say 84), the T-M1 N−1 clamp
//   (b) the seam's unit (forkExtractionPosition) — frames → SECONDS
//       (84 → 3.5, never 84), the −1 → 'last' end seek, the 0 default
//       byte-identical (the default-anchor seam untouched)
//   (c) the provenance (forkInputSpec with a handed frame) — frameIndex
//       stays FRAMES, extractedPath + takeId ride. Pins ALREADY-HELD
//       behavior (forkInputSpec landed in wzt73ob): this leg never reds;
//       it exists so the handed-frame contract is stated where T5 owns it.
//   (d) the ForkMenu words (forkFrameRowNote) — the spec's human template
//       ("Continue from frame 84 — 3.5 s (the paused frame)"), the seconds
//       formatting, today's default copy verbatim without a frame
//   (e) F7's hint retired — no endpoint row teaches frame arithmetic; the
//       string is gone from the served surfaces (its only rendered home was
//       the produce menu's fork row — R2's measured before-path, §9.2)
//   (f) the wiring — text pins: the core rides the model's transaction, the
//       store rides the pure conversion (never a raw frame number), the
//       overlay's default handoff opens the anchored menu, the ForkMenu
//       passes the frame through
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

const model = loadTs('src/media/takeViewerModel.ts')
const localStorageStub = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}
const generation = loadTs('src/canvas/generation.ts', { localStorage: localStorageStub, window: { dispatchEvent: () => undefined, addEventListener: () => undefined } })
const options = loadTs('src/canvas/options.ts')

/** A 5.0416 s clip at the 24 fps convention → 121 frames (T-M1's clip —
 *  round(duration × 24) can land exactly on N at the last frame). */
const FRAMES = 121
const READY = { connected: true, h3Ready: true, motionContextReady: true, music3: { available: true, missing: [] } }

test('(a) the U computation — pause-first transaction, the ROUND pick lens, the N−1 clamp', () => {
  console.log('viewer-fork: the use-frame transaction')
  ok(typeof model.frameHandoff === 'function', 'the model owns the combined use-frame transaction (frameHandoff)')

  // The combined transaction, from PLAYING: the command is the pause-ONLY
  // intent (T4's I-1 fix — U while paused used to resume through
  // toggle-play) and the anchor is the clamped pick lens.
  const playing = model.initialTransport()
  const live = model.frameHandoff(playing, 3.5, FRAMES)
  ok(live.command.state.playing === false, 'U PAUSES first (the combined transaction)')
  ok(live.command.seekTo === null, 'the handoff never seeks (pause-only, not a step)')
  eq(live.frameIndex, 84, '3.5 s → frame 84 (the spec §4 literal: round(currentTime × 24))')

  // Idempotent from PAUSED: U while paused holds — never resumes.
  const paused = { ...playing, playing: false }
  const held = model.frameHandoff(paused, 3.5, FRAMES)
  ok(held.command.state.playing === false, 'U while PAUSED stays paused (the I-1 regression pin)')
  ok(held.command.seekTo === null, 'still no seek from the paused arm')
  eq(held.frameIndex, 84, 'the paused arm hands the same anchor')

  // THE LENS PIN (the T2-review ruling): the PICK anchor is ROUND — the
  // NEAREST frame — deliberately NOT the step lens's floor (the frame whose
  // span CONTAINS the playhead). 3.53 × 24 = 84.72: round says 85, floor
  // says 84. (3.51 × 24 = 84.24 — both lenses agree at 84 there; only the
  // upper half of a frame's span distinguishes them.)
  const picked = model.frameHandoff(playing, 3.53, FRAMES)
  eq(picked.frameIndex, 85, 'the pick lens is ROUND: 3.53 s → frame 85 (the nearest frame)')
  ok(picked.frameIndex !== Math.floor(3.53 * 24), 'and NOT floor (the step lens would say 84 — the two lenses are deliberately different)')
  ok(picked.frameIndex === Math.round(3.53 * 24), 'the literal spec formula round(currentTime × 24), clamped')

  // The T-M1 clamp: round(duration × 24) can yield exactly N — never hand
  // the seams frame N of N (or a negative, or a NaN).
  eq(model.frameHandoff(playing, 5.0416, FRAMES).frameIndex, 120, 'the last-frame edge clamps to N−1 (round(120.9984) = 121 → 120)')
  eq(model.frameHandoff(playing, 999, FRAMES).frameIndex, 120, 'beyond the end clamps to N−1, never a beyond-end seek')
  eq(model.frameHandoff(playing, 0, FRAMES).frameIndex, 0, 'time 0 hands frame 0')
  eq(model.frameHandoff(playing, -1, FRAMES).frameIndex, 0, 'a negative playhead hands frame 0, never a negative anchor')
  eq(model.frameHandoff(playing, Number.NaN, FRAMES).frameIndex, 0, 'a NaN playhead hands frame 0, never NaN')
})

test('(b) the seam\'s unit — position = frameIndex / 24, never the frame number (T-C1)', () => {
  console.log('viewer-fork: the extraction position')
  ok(typeof generation.forkExtractionPosition === 'function', 'the pure frames→position conversion exists (forkExtractionPosition)')

  // THE wrong-unit trap (audit T-C1): the seam's numeric position is
  // SECONDS (POST /api/lan/video/frame feeds ffmpeg's -ss verbatim), while
  // the frame anchor is FRAMES. A literal implementation hands the frame
  // number straight through — seeking second 84 of a 5-second clip.
  eq(generation.forkExtractionPosition(84), 3.5, 'frame 84 → position 3.5 (seconds)')
  ok(generation.forkExtractionPosition(84) !== 84, 'the WRONG-UNIT trap: the position is never the raw frame number')
  eq(generation.forkExtractionPosition(85), 85 / 24, 'frame 85 → position 85/24')
  eq(generation.forkExtractionPosition(1), 1 / 24, 'frame 1 → position 1/24')
  eq(generation.forkExtractionPosition(0), 0, 'frame 0 → position 0 — the sole numeric the seam ever took before the viewer (frame 0 ≡ second 0, the ambiguity that hid the unit)')

  // The DEFAULT anchor seam, untouched: −1 still travels as 'last' (the
  // wzt73ob end seek — raw negative seconds clamp to 0 server-side).
  eq(generation.forkExtractionPosition(-1), 'last', 'the −1 default maps to the END seek (ffmpeg -sseof), never a raw negative')
  ok(generation.forkFrameIsEndSeek(-1) && !generation.forkFrameIsEndSeek(84), 'the end-seek predicate still owns the −1 convention (a picked frame is never in play)')
  eq(generation.forkFrameDefault(true), -1, 'the default anchors are unchanged: tail endpoint → −1')
  eq(generation.forkFrameDefault(false), 0, 'the default anchors are unchanged: other entries → 0')
})

test('(c) the provenance — inputSpec carries frameIndex in FRAMES + extractedPath', () => {
  console.log('viewer-fork: the chain record')
  const spec = generation.forkInputSpec({ outputId: 'out-1', takeId: 'take-2', substrate: 'extracted-frame', extractedPath: '/out/frame-84.png', frameIndex: 84 })
  eq(spec.outputRef.frameIndex, 84, 'inputSpec.frameIndex is the FRAME (84)')
  ok(spec.outputRef.frameIndex !== 3.5, '…never the seconds (the two-hop contract\'s record hop)')
  eq(spec.outputRef.extractedPath, '/out/frame-84.png', 'the extraction provenance rides the outputRef (extractedPath)')
  eq(spec.outputRef.takeId, 'take-2', 'the pinned take records WHICH take the frame came from')
  eq(spec.outputRef.substrate, 'extracted-frame', 'the substrate records the gesture')
})

test('(d) the ForkMenu words — the anchor in human terms (F7\'s arithmetic dies)', () => {
  console.log('viewer-fork: the menu copy')
  ok(typeof generation.forkFrameRowNote === 'function', 'the human-anchor template exists (forkFrameRowNote)')
  // The spec §4 template: "Continue from frame 84 — 3.5 s (the paused frame)".
  eq(generation.forkFrameRowNote(84), 'Continue from frame 84 — 3.5 s (the paused frame)', 'frame 84 reads the spec\'s own template (frame + seconds from T1\'s math)')
  eq(generation.forkFrameRowNote(72), 'Continue from frame 72 — 3 s (the paused frame)', 'whole seconds trim (72 → 3 s, not 3.0 s)')
  eq(generation.forkFrameRowNote(85), 'Continue from frame 85 — 3.54 s (the paused frame)', 'fractional seconds round to 2 decimals (85/24 → 3.54 s)')
  eq(generation.forkFrameRowNote(0), 'Continue from frame 0 — 0 s (the paused frame)', 'a handed frame 0 is still a PICKED frame (the first frame)')
  // Without a frame (the B gesture, the bar chip): today's default copy verbatim.
  eq(generation.forkFrameRowNote(undefined), 'Extract frame 0 server-side; continue from the still.', 'no handed frame keeps today\'s default copy byte-identical')
  eq(generation.forkFrameRowNote(null), 'Extract frame 0 server-side; continue from the still.', 'null keeps the default copy too')
  ok(!generation.forkFrameRowNote(84).includes('× 24'), 'no frame-index arithmetic teaching anywhere in the anchor words')
})

test('(e) F7\'s hint retired from every path the viewer serves', () => {
  console.log('viewer-fork: the arithmetic teaching is gone')
  // The hint's only rendered home was the produce menu's fork row
  // (src/canvas/options.ts — the EndpointMenu, R2's measured before-path
  // per §9.2: "produce menu + fork + frame arithmetic in the head"). The
  // viewer serves that chaining workflow now; the teaching dies with it.
  const produce = options.endpointOptions('produce', ['video'], READY)
  const forkRow = produce.find((row) => row.id === 'produce:fork-frame')
  ok(forkRow != null && forkRow.available === true, 'the produce fork row still exists (the retirement kills the HINT, not the row)')
  ok(!String(forkRow?.hint ?? '').includes('seconds × 24'), 'the produce fork row no longer teaches seconds × 24')
  ok(!String(forkRow?.hint ?? '').includes('negative counts from the end'), 'the produce fork row no longer teaches the counts-from-the-end convention')
  // …and no row on ANY direction carries the arithmetic.
  const allRows = [
    ...options.endpointOptions('produce', ['video', 'image'], READY),
    ...options.endpointOptions('consume', ['video', 'image'], READY, 'video'),
  ]
  ok(!JSON.stringify(allRows).includes('× 24'), 'no endpoint row anywhere teaches frame-index arithmetic')
  ok(!JSON.stringify(allRows).includes('negative counts from the end'), 'no endpoint row anywhere names the counts-from-the-end convention')
  // The hint is gone as a ROW PROPERTY from the served surfaces' sources.
  // (The dated retirement comment in options.ts quotes the dead text — the
  // repo's convention for naming what died — so the pin is the hint SHAPE,
  // not the quote: no row anywhere sets a hint containing the formula. The
  // −1 CONVENTION itself survives where it belongs — in the code docs of the
  // default-anchor seam (generation.ts / types.ts), which render nowhere.)
  ok(!read('src/canvas/options.ts').includes("hint: 'frame index"), 'options.ts: no row sets the frame-index hint (F7\'s text no longer renders)')
  ok(!read('src/canvas/ForkMenu.tsx').includes('frame index = seconds'), 'ForkMenu.tsx: F7\'s hint string is gone (it never rendered here — pinned for the grep contract)')
})

test('(f) the wiring — every seam rides the pure decisions (text pins)', () => {
  console.log('viewer-fork: the wiring')
  // The core's branch: the combined transaction comes from the MODEL (the
  // wizardWalk shape — the shell never re-derives the anchor).
  const core = read('src/media/TakeViewerCore.tsx')
  const branch = /if \(action === 'use-frame'\) \{([\s\S]*?)\n\x20{4}\}/.exec(core)
  ok(branch !== null, 'the core\'s use-frame branch found')
  ok((branch?.[1] ?? '').includes('frameHandoff('), 'the branch rides the model\'s combined pause+anchor transaction')
  ok((branch?.[1] ?? '').includes('onUseFrame?.('), 'the anchor is handed UP through onUseFrame')
  ok(!(branch?.[1] ?? '').includes("transportCommand(transportRef.current, { type: 'toggle-play' })"), 'pin: the branch never dispatches the toggle (the I-1 regression pin, kept from T4)')

  // The overlay's default: U closes the viewer and opens the ANCHORED fork
  // menu on the watched take (a mount can override through the prop).
  const overlay = read('src/canvas/TakeViewerOverlay.tsx')
  ok(overlay.includes('setForkMenu({ chainId: tile.id, takeId: take.id, frameIndex })'), 'the default handoff opens the fork menu pre-anchored on the WATCHED take')

  // The store's fork path: the handed frame wins (the default-anchor seam
  // stays the fallback), and the seam call takes the CONVERTED position — a
  // raw frameIndex at the call site would still typecheck, so the text pin
  // is the unit contract's only unit-level teeth.
  const store = read('src/canvas/store.ts')
  ok(store.includes('source.frameIndex ?? forkFrameDefault('), 'the handed frame wins; the −1/0 default stays the fallback (untouched)')
  ok(store.includes('forkExtractionPosition(frameIndex)'), 'extractVideoFrame takes the pure frames→seconds conversion (the T-C1 seam)')
  ok(!store.includes('forkFrameIsEndSeek(frameIndex) ?'), 'the end-seek ternary no longer lives at the call site (the conversion owns it)')
  ok(store.includes('extracted = { path: extractedFile.path, frameIndex }'), 'the extraction record carries BOTH provenance facts (path + frames)')
  ok(store.includes('frameIndex: extracted?.frameIndex ?? null'), 'inputSpec.frameIndex rides the extraction record (frames)')

  // The ForkMenu: the note rides the pure template and the row's fork call
  // carries the frame + the pinned take.
  const forkMenu = read('src/canvas/ForkMenu.tsx')
  ok(forkMenu.includes('forkFrameRowNote(menu.frameIndex)'), 'the extracted-frame row\'s note rides the human-anchor template')
  ok(forkMenu.includes('frameIndex: menu.frameIndex ?? undefined'), 'the row\'s fork call carries the handed frame')
  ok(forkMenu.includes('takeId: menu.takeId ?? undefined'), 'the row\'s fork call pins the watched take')
  console.log(`\ntest-takeviewerfork: ${passed} assertions passed`)
})
