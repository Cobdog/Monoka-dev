// The extension gate driver's unit-family pin (Codex batch C, the pre-gates
// audit 2026-10-09's I-4/I-5). The REAL legs are controller-run on the GPU
// (test-results/experiments/extension-gate/gate.mjs, the gitignored scratch
// driver); this suite pins the driver's PURE core (tests/lib/
// extensionGateLib.mjs — one definition the driver imports right back) so
// CI proves the machinery the GPU session will exercise:
//   - I-4: buildInGraphArm — the matched control's graph transform (the
//     source's sampler latent wired directly into the extension's Motion
//     Context, the Load node gone, the landed files never rewritten), with
//     its named refusals on unrecognized shapes;
//   - I-4: compareDeliveredFrames/parityVerdict — the AUTOMATED parity
//     verdict (exact / within-tolerance / diverged / inconclusive-fails),
//     so G1's exit result carries the measured comparison, never a frame
//     count alone;
//   - I-5: attemptSatisfies — the continuation-ready predicate (the second
//     extension may only fire after the first's continuation-ready is
//     observed; execution-ready alone is the flake the audit named);
//   - the engine /history graph extraction, defensive over both the
//     documented real-engine tuple and this repo's fake-engine tuple.

import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  attemptSatisfies, buildInGraphArm, compareDeliveredFrames, graphDimensions,
  graphLoadsCarryPath, graphSavesWithPrefix, historyGraphOf, meanDeltaE76,
  parityVerdict, psnrFromMse, rekeyGraph, srgbToLab, upstreamConeOf,
} from './lib/extensionGateLib.mjs'

// ---- fixtures -----------------------------------------------------------------

/** The studio's SOURCE graph shape (buildTweenGraph's, minimal): a sampler
 *  fed by conditioning + noise, its decode/video/carry-save sinks. */
const SOURCE_GRAPH = {
  1: { class_type: 'UNETLoader', inputs: { unet_name: 'base.safetensors' } },
  2: { class_type: 'CLIPLoader', inputs: { clip_name: 'te.safetensors' } },
  30: { class_type: 'LoadImage', inputs: { image: 'near.png' } },
  31: { class_type: 'LoadImage', inputs: { image: 'far.png' } },
  10: { class_type: 'MiniMaxH3ReferenceToVideo', inputs: { prompt: 'the source caption', width: 64, height: 32, length: 22, clip: ['2', 0], 'ref_images.ref_image_0': ['30', 0], 'ref_images.ref_image_1': ['31', 0] } },
  11: { class_type: 'RandomNoise', inputs: { noise_seed: 421337 } },
  12: { class_type: 'BasicGuider', inputs: { model: ['1', 0], conditioning: ['10', 0] } },
  15: { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['11', 0], guider: ['12', 0], latent_image: ['10', 1] } },
  16: { class_type: 'VAEDecode', inputs: { samples: ['15', 0], vae: ['3', 0] } },
  18: { class_type: 'CreateVideo', inputs: { images: ['16', 0], fps: 24 } },
  19: { class_type: 'SaveVideo', inputs: { video: ['18', 0], filename_prefix: 'animation/SOURCE/clip' } },
  20: { class_type: 'MiniMaxH3MotionContextSaveLatent', inputs: { latent: ['15', 0], filename_prefix: 'animation/SOURCE/carry' } },
}

/** The studio's EXTENSION graph shape (the loaded-carry arm): the pack's
 *  Load node feeding the Motion Context, the trim, its own carry save. */
const EXTENSION_GRAPH = {
  1: { class_type: 'UNETLoader', inputs: { unet_name: 'base.safetensors' } },
  30: { class_type: 'LoadImage', inputs: { image: 'near.png' } },
  31: { class_type: 'LoadImage', inputs: { image: 'far.png' } },
  10: { class_type: 'MiniMaxH3ReferenceToVideo', inputs: { prompt: 'the extension caption', width: 64, height: 32, length: 56, clip: ['2', 0], 'ref_images.ref_image_0': ['30', 0], 'ref_images.ref_image_1': ['31', 0] } },
  11: { class_type: 'RandomNoise', inputs: { noise_seed: 999001 } },
  12: { class_type: 'BasicGuider', inputs: { model: ['1', 0], conditioning: ['41', 0] } },
  15: { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['11', 0], guider: ['12', 0], latent_image: ['10', 1] } },
  16: { class_type: 'VAEDecode', inputs: { samples: ['15', 0], vae: ['3', 0] } },
  40: { class_type: 'MiniMaxH3MotionContextLoadLatent', inputs: { latent_path: 'animation/SOURCE/carry_00001.safetensors', clip_index: 1 } },
  41: { class_type: 'MiniMaxH3MotionContext', inputs: { conditioning: ['10', 0], latent: ['10', 1], context_latent: ['40', 0], context_length: '22' } },
  42: { class_type: 'MiniMaxH3MotionContextTrim', inputs: { images: ['16', 0], trim_frames: ['41', 1] } },
  18: { class_type: 'CreateVideo', inputs: { images: ['42', 0], fps: 24 } },
  19: { class_type: 'SaveVideo', inputs: { video: ['18', 0], filename_prefix: 'animation/EXT/clip' } },
  20: { class_type: 'MiniMaxH3MotionContextSaveLatent', inputs: { latent: ['15', 0], filename_prefix: 'animation/EXT/carry' } },
}

// ---- I-4: the matched control's graph transform -------------------------------

test('I-4 buildInGraphArm wires the source sampler straight into the Motion Context and drops the disk hop', () => {
  const arm = buildInGraphArm({ sourceGraph: SOURCE_GRAPH, extensionGraph: EXTENSION_GRAPH, savePrefix: 'animation/g1a-run7' })

  // The rewire: the Motion Context now consumes the SOURCE's sampler output.
  assert.deepEqual(arm.graph[41].inputs.context_latent, ['s15', 0])
  assert.equal(arm.sourceSamplerId, 's15')
  // The Load node is gone — the in-graph arm never reads the saved carry.
  assert.equal('40' in arm.graph, false)
  // The landed attempts' files are never rewritten: the extension's carry
  // save is dropped, the source half is pruned to the sampler's upstream
  // cone (its own video + carry sinks included).
  assert.deepEqual(arm.droppedSaveNodes, ['20'])
  assert.equal('s19' in arm.graph, false, 'the source\'s video sink is pruned')
  assert.equal('s16' in arm.graph, false, 'the source\'s decode is pruned (nothing consumes it)')
  assert.equal('s20' in arm.graph, false, 'the source\'s carry save is pruned — never rewrite the registered engine copy')
  assert.equal('s12' in arm.graph, true, 'the source\'s guider rides the cone')
  assert.equal('s30' in arm.graph, true, 'the source\'s reference loads ride the cone')
  // The extension's media save is re-prefixed (no collision with the landed
  // extension's own stamped files) and still saves the TRIMMED window.
  assert.equal(arm.graph[19].inputs.filename_prefix, 'animation/g1a-run7/clip')
  assert.deepEqual(arm.graph[18].inputs.images, ['42', 0])
  // The extension's own sampler/settings are untouched (matched arms: same
  // seed, same caption, same length — only the carry path differs).
  assert.equal(arm.graph[11].inputs.noise_seed, 999001)
  assert.equal(arm.graph[10].inputs.prompt, 'the extension caption')
  assert.equal(arm.graph[10].inputs.length, 56)
  // The source's frozen seed rides the re-render (the same source, not a guess).
  assert.equal(arm.graph.s11.inputs.noise_seed, 421337)
  assert.equal(arm.graph.s10.inputs.prompt, 'the source caption')
})

test('I-4 buildInGraphArm refuses named shapes it does not recognize — never a guessed graph', () => {
  assert.throws(
    () => buildInGraphArm({ sourceGraph: { not: 'a graph' }, extensionGraph: EXTENSION_GRAPH, savePrefix: 'x' }),
    /the source graph is not a \{id: \{class_type, inputs\}\} graph/,
  )
  assert.throws(
    () => buildInGraphArm({ sourceGraph: SOURCE_GRAPH, extensionGraph: [1, 2], savePrefix: 'x' }),
    /the extension graph is not a \{id: \{class_type, inputs\}\} graph/,
  )
  const twoSamplers = { ...SOURCE_GRAPH, 55: SOURCE_GRAPH[15] }
  assert.throws(
    () => buildInGraphArm({ sourceGraph: twoSamplers, extensionGraph: EXTENSION_GRAPH, savePrefix: 'x' }),
    /holds 2 SamplerCustomAdvanced nodes.*cannot identify the carry-producing sampler/,
  )
  const noLoad = Object.fromEntries(Object.entries(EXTENSION_GRAPH).filter(([id]) => id !== '40'))
  assert.throws(
    () => buildInGraphArm({ sourceGraph: SOURCE_GRAPH, extensionGraph: noLoad, savePrefix: 'x' }),
    /holds 0 MiniMaxH3MotionContextLoadLatent nodes.*not the loaded-carry shape/,
  )
  const twoContexts = { ...EXTENSION_GRAPH, 51: EXTENSION_GRAPH[41] }
  assert.throws(
    () => buildInGraphArm({ sourceGraph: SOURCE_GRAPH, extensionGraph: twoContexts, savePrefix: 'x' }),
    /holds 2 MiniMaxH3MotionContext nodes \(expected exactly 1\).*cannot rewire the conditioning/,
  )
  const unwired = { ...EXTENSION_GRAPH, 41: { ...EXTENSION_GRAPH[41], inputs: { ...EXTENSION_GRAPH[41].inputs, context_latent: ['10', 1] } } }
  assert.throws(
    () => buildInGraphArm({ sourceGraph: SOURCE_GRAPH, extensionGraph: unwired, savePrefix: 'x' }),
    /context_latent does not consume the Load node.*refusing to rewire a guess/,
  )
  assert.throws(
    () => buildInGraphArm({ sourceGraph: SOURCE_GRAPH, extensionGraph: EXTENSION_GRAPH, savePrefix: '' }),
    /savePrefix must be a non-empty string/,
  )
})

test('I-4 the graph predicates the driver discovers prompts by', () => {
  assert.equal(graphSavesWithPrefix(SOURCE_GRAPH, 'animation/SOURCE/carry'), true, 'the carry save stamp identifies the source prompt')
  assert.equal(graphSavesWithPrefix(EXTENSION_GRAPH, 'animation/SOURCE/carry'), false)
  assert.equal(graphLoadsCarryPath(EXTENSION_GRAPH, 'animation/SOURCE/carry_00001.safetensors'), true, 'the load path identifies the extension prompt')
  assert.equal(graphLoadsCarryPath(SOURCE_GRAPH, 'animation/SOURCE/carry_00001.safetensors'), false)
  assert.deepEqual(graphDimensions(EXTENSION_GRAPH), { width: 64, height: 32 })
  assert.deepEqual(graphDimensions(SOURCE_GRAPH), { width: 64, height: 32 })
})

test('I-4 the engine /history graph extraction is defensive over both tuple layouts', () => {
  // The fake engine's modeled shape: [number, prompt_id, graph, extra, outputs].
  assert.equal(historyGraphOf({ prompt: [7, 'fake-7', SOURCE_GRAPH, '', []] }), SOURCE_GRAPH)
  // The documented real-engine shape: [prompt_id, prompt, workflow, extra_data].
  assert.equal(historyGraphOf({ prompt: ['real-1', EXTENSION_GRAPH, { nodes: [] }, {}] }), EXTENSION_GRAPH)
  // Whatever a future version does: the graph-shaped element wins; nothing
  // graph-shaped is an unusable entry, never a guess.
  assert.equal(historyGraphOf({ prompt: ['x', { workflow: true }, SOURCE_GRAPH] }), SOURCE_GRAPH)
  assert.equal(historyGraphOf({ prompt: ['x', 5, null] }), null)
  assert.equal(historyGraphOf({}), null)
  assert.equal(historyGraphOf({ prompt: SOURCE_GRAPH }), SOURCE_GRAPH, 'a bare graph-shaped prompt passes too')
})

test('I-4 rekeyGraph and upstreamConeOf — the mechanical halves', () => {
  const cone = upstreamConeOf(SOURCE_GRAPH, '15')
  assert.deepEqual(
    Object.keys(cone).sort(),
    ['1', '10', '11', '12', '15', '2', '30', '31'].sort(),
    'the cone keeps the sampler and everything feeding it',
  )
  const rekeyed = rekeyGraph(cone, 's')
  assert.deepEqual(rekeyed.s15.inputs.guider, ['s12', 0], 'links are rewritten to the rekeyed ids')
  assert.deepEqual(rekeyed.s10.inputs.clip, ['s2', 0])
  assert.deepEqual(rekeyed.s11.inputs.noise_seed, 421337, 'literal inputs ride untouched')
  assert.throws(() => upstreamConeOf(SOURCE_GRAPH, '99'), /node 99 is not in the graph/)
})

// ---- I-4: the automated parity verdict -----------------------------------------

/** One 2x2 rgb24 frame from a byte pattern. */
const frame = (fill) => Uint8Array.from([fill, fill + 1, fill + 2, fill + 3, fill + 4, fill + 5, fill + 6, fill + 7, fill + 8, fill + 9, fill + 10, fill + 11].map((v) => v & 0xff))
const DIMS = { width: 2, height: 2 }
const concat = (...frames) => {
  const out = new Uint8Array(frames.length * 12)
  frames.forEach((f, i) => out.set(f, i * 12))
  return out
}

test('I-4 parity verdict: byte-identical decodes are EXACT — the Set L bit-identity expectation', () => {
  const raw = concat(frame(10), frame(40), frame(90))
  const comparison = compareDeliveredFrames(raw, concat(frame(10), frame(40), frame(90)), DIMS)
  assert.equal(comparison.outcome, 'measured')
  assert.equal(comparison.exactFrames, 3)
  const verdict = parityVerdict(comparison)
  assert.equal(verdict.pass, true)
  assert.equal(verdict.outcome, 'exact')
  assert.match(verdict.detail, /3 delivered frames byte-identical/)
})

test('I-4 parity verdict: codec-level noise passes WITHIN TOLERANCE and the numbers are stated', () => {
  // A ±1 channel drift on a handful of pixels — the encoder-noise class.
  const noisy = frame(40)
  noisy[0] = (noisy[0] + 1) & 0xff
  noisy[5] = (noisy[5] + 1) & 0xff
  const comparison = compareDeliveredFrames(concat(frame(10), frame(40)), concat(frame(10), noisy), DIMS)
  assert.equal(comparison.exactFrames, 1)
  assert.ok(comparison.minPsnrDb > 40, `codec-level noise stays high-PSNR (measured ${comparison.minPsnrDb.toFixed(1)} dB)`)
  assert.ok(comparison.maxDE < 0.5, `and low-dE (measured ${comparison.maxDE.toFixed(3)})`)
  const verdict = parityVerdict(comparison)
  assert.equal(verdict.pass, true)
  assert.equal(verdict.outcome, 'within-tolerance')
  assert.match(verdict.detail, /min PSNR \d+\.\d dB.*max dE76 \d+\.\d+.*tolerance: min PSNR 30 dB, max dE 3/)
})

test('I-4 parity verdict: a diverged carry FAILS with the measured numbers', () => {
  // Half the frame inverted — the different-conditioning class.
  const diverged = frame(40)
  for (let i = 6; i < 12; i += 1) diverged[i] = (~diverged[i]) & 0xff
  const comparison = compareDeliveredFrames(concat(frame(40)), concat(diverged), DIMS)
  const verdict = parityVerdict(comparison)
  assert.equal(verdict.pass, false)
  assert.equal(verdict.outcome, 'diverged')
  assert.match(verdict.detail, /0\/1 frames byte-identical/)
})

test('I-4 parity verdict: an uncomparable pair is INCONCLUSIVE and FAILS — never a pass by absence', () => {
  const shortArm = compareDeliveredFrames(concat(frame(1)), concat(frame(1), frame(2)), DIMS)
  assert.equal(shortArm.outcome, 'inconclusive')
  assert.match(shortArm.reason, /different frame counts \(1 vs 2\)/)
  assert.equal(parityVerdict(shortArm).pass, false)
  assert.equal(parityVerdict(shortArm).outcome, 'inconclusive')

  const notFrames = compareDeliveredFrames(new Uint8Array(7), new Uint8Array(7), DIMS)
  assert.equal(notFrames.outcome, 'inconclusive')
  assert.match(notFrames.reason, /not a whole number of 2x2 rgb24 frames/)
  assert.equal(parityVerdict(notFrames).pass, false)

  const empty = compareDeliveredFrames(new Uint8Array(0), new Uint8Array(0), DIMS)
  assert.equal(empty.outcome, 'inconclusive')
  assert.equal(parityVerdict(empty).pass, false)
})

test('I-4 the metric primitives: PSNR and CIE76 dE behave at the anchors', () => {
  assert.equal(psnrFromMse(0), Infinity, 'identical streams are infinite PSNR')
  // mse 0.75 (three ±1 channel deltas over 12 bytes) → 10·log10(255²/0.75) ≈ 49.4 dB
  assert.ok(Math.abs(psnrFromMse(0.75) - 49.38) < 0.1, `measured ${psnrFromMse(0.75).toFixed(2)}`)
  const white = srgbToLab(255, 255, 255)
  assert.ok(Math.abs(white[0] - 100) < 0.01, `sRGB white is L*100 (got ${white[0].toFixed(2)})`)
  assert.ok(Math.abs(white[1]) < 0.01 && Math.abs(white[2]) < 0.01)
  const midGray = srgbToLab(128, 128, 128)
  assert.ok(Math.abs(midGray[0] - 53.59) < 0.1, `sRGB 128 is L*≈53.6 (got ${midGray[0].toFixed(2)})`)
  assert.equal(meanDeltaE76(frame(40), frame(40)), 0, 'identical frames are dE 0')
})

// ---- I-5: the continuation-ready ordering predicate -----------------------------

test('I-5 attemptSatisfies: execution-ready alone is NOT continuation-ready — the second submission waits', () => {
  // The healthy-implementation flake the audit named: playable (ready)
  // while the detached registration is still settling (registering).
  const landedButRegistering = { execution: 'ready', continuation: { state: 'registering' } }
  assert.equal(attemptSatisfies(landedButRegistering, { execution: 'ready', continuation: 'ready' }), false)
  // The ordering the gate asserts: BOTH halves observed before submitting.
  const continuationReady = { execution: 'ready', continuation: { state: 'ready' } }
  assert.equal(attemptSatisfies(continuationReady, { execution: 'ready', continuation: 'ready' }), true)
  // The want without a continuation clause is the plain execution wait.
  assert.equal(attemptSatisfies(landedButRegistering, { execution: 'ready' }), true)
  assert.equal(attemptSatisfies(continuationReady, { execution: 'ready' }), true)
  // Not-ready shapes never satisfy.
  assert.equal(attemptSatisfies({ execution: 'rendering', continuation: { state: 'ready' } }, { execution: 'ready', continuation: 'ready' }), false)
  assert.equal(attemptSatisfies(null, { execution: 'ready' }), false)
  assert.equal(attemptSatisfies({ execution: 'ready' }, { execution: 'ready', continuation: 'ready' }), false, 'a missing continuation never satisfies a continuation want')
})
