/**
 * extensionGateLib — the extension gate driver's PURE core (Codex batch C,
 * the pre-gates audit 2026-10-09's I-4): the pieces of
 * test-results/experiments/extension-gate/gate.mjs that must be pinnable in
 * the unit family (tests/extension-gate.test.js) — the graph transform that
 * builds the IN-GRAPH carry arm, the delivered-frame comparison that makes
 * G1's Save/Load parity an AUTOMATED verdict instead of a frame count, and
 * the attempt-satisfaction predicate behind the continuation-ready wait.
 *
 * Committed here (not beside the driver) because the vitest pin imports it
 * and CI must run the pin without the driver's gitignored scratch directory.
 * The driver imports it right back — one definition, two consumers, no
 * duplicated logic that could drift out of honesty.
 *
 * Environment-neutral by construction: plain ESM, no node globals, no I/O —
 * the driver owns every fetch, file, and ffmpeg spawn; this module only
 * transforms and measures.
 */

// The node classes the transform keys on — the same constants
// shared/animation/graphs.ts owns (MOTION_CONTEXT_* / the sampler). If the
// shared names ever move, the gate fails LOUDLY here (a named error below),
// never silently builds a wrong graph.
export const SAMPLER_CLASS = 'SamplerCustomAdvanced'
export const MOTION_CONTEXT_SAVE_CLASS = 'MiniMaxH3MotionContextSaveLatent'
export const MOTION_CONTEXT_LOAD_CLASS = 'MiniMaxH3MotionContextLoadLatent'
export const MOTION_CONTEXT_CLASS = 'MiniMaxH3MotionContext'
const SAVE_CLASSES = new Set(['SaveVideo', 'SaveImage', MOTION_CONTEXT_SAVE_CLASS])

/** The parity tolerance (the probes' convention — PSNR + CIE76 dE, the
 *  extprobe_2_metrics pair()): both arms deliver through the SAME
 *  CreateVideo/SaveVideo chain and are decoded by the SAME ffmpeg, so the
 *  residual between a faithful Save/Load carry and the in-graph wire is
 *  codec-level. Set L's own gates (G-NULL/G-BEAT1) measured this stack
 *  bit-identical across separate renders, so EXACT is the expected verdict;
 *  the tolerance exists for cross-run encoder/sampler nondeterminism, and a
 *  broken carry (a different conditioning) lands an order of magnitude past
 *  it (single-digit PSNR, double-digit dE). */
export const PARITY_TOLERANCE = { minPsnrDb: 30, maxDE: 3 }

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isGraphNode = (value) => isRecord(value) && typeof value.class_type === 'string'
  && (value.inputs === undefined || isRecord(value.inputs))

const isLink = (value) => Array.isArray(value) && value.length === 2
  && typeof value[0] === 'string' && typeof value[1] === 'number'

/** A plain {id: {class_type, inputs}} graph — the ComfyUI API shape. */
export function looksLikeGraph(value) {
  if (!isRecord(value) || Object.keys(value).length === 0) return false
  for (const node of Object.values(value)) {
    if (!isGraphNode(node)) return false
  }
  return true
}

/** The prompt graph out of a ComfyUI /history entry — DEFENSIVELY, because
 *  the tuple's layout is engine-version detail: the documented real-engine
 *  shape is [prompt_id, prompt, workflow, extra_data] (graph at index 1)
 *  while this repo's own fake engine models the /queue tuple
 *  [number, prompt_id, graph, extra_data, outputs] (graph at index 2). Walk
 *  the tuple and take the one element that IS a graph, both shapes and
 *  whatever a future version does with the slot; null when nothing in the
 *  record is graph-shaped (the entry is unusable, never guessed at). */
export function historyGraphOf(entry) {
  const prompt = isRecord(entry) ? entry.prompt : undefined
  if (looksLikeGraph(prompt)) return prompt
  if (Array.isArray(prompt)) {
    for (const element of prompt) {
      if (looksLikeGraph(element)) return element
    }
  }
  return null
}

/** Every node id of `graph` whose class is `classType`. */
export function nodesOfClass(graph, classType) {
  return Object.entries(graph).filter(([, node]) => node.class_type === classType).map(([id]) => id)
}

/** True when any save-tail node writes under `prefix` — how the driver
 *  finds the STUDIO's source prompt in the engine's history (the studio
 *  stamps its save tails `animation/<attemptId>/…` before submitting). */
export function graphSavesWithPrefix(graph, prefix) {
  for (const node of Object.values(graph)) {
    if (SAVE_CLASSES.has(node.class_type) && typeof node.inputs?.filename_prefix === 'string'
      && node.inputs.filename_prefix.startsWith(prefix)) return true
  }
  return false
}

/** True when the graph consumes the registered carry at `relativePath`
 *  through the pack's Load node — how the driver finds the studio's
 *  EXTENSION prompt (the loaded-carry arm's own graph). */
export function graphLoadsCarryPath(graph, relativePath) {
  for (const node of Object.values(graph)) {
    if (node.class_type === MOTION_CONTEXT_LOAD_CLASS && node.inputs?.latent_path === relativePath) return true
  }
  return false
}

/** The output dimensions a graph renders at — its conditioning node's
 *  width/height inputs (both arms' graphs carry them; the parity comparison
 *  needs the frame size to slice the decoded raw streams). Null when no
 *  node names both. */
export function graphDimensions(graph) {
  for (const node of Object.values(graph)) {
    const width = node.inputs?.width
    const height = node.inputs?.height
    if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
      return { width, height }
    }
  }
  return null
}

/** Rekeys `graph`'s node ids by `prefixId` (rewriting every link input with
 *  it) — the mechanical half of merging two graphs whose skeleton ids
 *  collide ('1'..'15' in both). Pure: returns a NEW graph. */
export function rekeyGraph(graph, prefixId) {
  const idOf = new Map(Object.keys(graph).map((id) => [id, `${prefixId}${id}`]))
  const rekeyed = {}
  for (const [id, node] of Object.entries(graph)) {
    const inputs = {}
    for (const [name, value] of Object.entries(node.inputs ?? {})) {
      inputs[name] = isLink(value) && idOf.has(value[0]) ? [idOf.get(value[0]), value[1]] : value
    }
    rekeyed[idOf.get(id)] = { class_type: node.class_type, inputs }
  }
  return rekeyed
}

/** `graph` pruned to the upstream cone of `rootId` (the root plus everything
 *  it transitively references) — the source half of the in-graph arm needs
 *  ONLY the sampler and what feeds it; its decode/video/carry-save sinks
 *  would re-render files the landed attempt already owns (the carry save
 *  would overwrite the registered engine copy at its own slot — never
 *  allowed). Pure: returns a NEW graph. Throws when `rootId` is not in the
 *  graph. */
export function upstreamConeOf(graph, rootId) {
  if (!(rootId in graph)) throw new Error(`upstreamConeOf: node ${rootId} is not in the graph`)
  const kept = new Set()
  const visit = (id) => {
    if (kept.has(id)) return
    kept.add(id)
    for (const value of Object.values(graph[id].inputs ?? {})) {
      if (isLink(value) && value[0] in graph) visit(value[0])
    }
  }
  visit(rootId)
  const pruned = {}
  for (const id of kept) pruned[id] = graph[id]
  return pruned
}

/** THE I-4 MATCHED CONTROL'S GRAPH TRANSFORM: one graph, both windows — the
 *  source's sampler latent wired DIRECTLY into the extension's Motion
 *  Context (the Set L g_mctx_chain shape), replacing the pack's Load node
 *  that reads the saved carry back from disk.
 *
 *  Inputs are the ENGINE'S OWN RECORDS of the studio's two prompts (the
 *  graphs out of /history), which is what makes the arms MATCHED: the
 *  source half re-renders the exact frozen source graph (same caption,
 *  references, seed, settings — everything the studio froze), and the
 *  extension half keeps the exact loaded-carry graph minus the disk hop.
 *  Deterministic engine + faithful Save/Load ⇒ byte-identical delivered
 *  frames; that equivalence is what G1's comparison then measures.
 *
 *  - the SOURCE graph is pruned to its SamplerCustomAdvanced's upstream
 *    cone and rekeyed under 's' (sinks dropped — see upstreamConeOf);
 *  - the EXTENSION graph's LoadLatent node is REMOVED and the Motion
 *    Context node's context_latent rewired to the source's sampler output;
 *  - the extension's media save tails are re-prefixed under `savePrefix`
 *    (never colliding with the landed attempt's own files) and its carry
 *    Save node is dropped outright (never rewriting the landed extension's
 *    engine carry file).
 *
 *  Every shape expectation refuses with a NAMED error — the transform never
 *  guesses at a graph it does not recognize. Returns { graph,
 *  sourceSamplerId, droppedSaveNodes }. */
export function buildInGraphArm({ sourceGraph, extensionGraph, savePrefix }) {
  if (!looksLikeGraph(sourceGraph)) throw new Error('buildInGraphArm: the source graph is not a {id: {class_type, inputs}} graph')
  if (!looksLikeGraph(extensionGraph)) throw new Error('buildInGraphArm: the extension graph is not a {id: {class_type, inputs}} graph')
  if (typeof savePrefix !== 'string' || savePrefix.length === 0) throw new Error('buildInGraphArm: savePrefix must be a non-empty string')

  const sourceSamplers = nodesOfClass(sourceGraph, SAMPLER_CLASS)
  if (sourceSamplers.length !== 1) {
    throw new Error(`buildInGraphArm: the source graph holds ${sourceSamplers.length} ${SAMPLER_CLASS} nodes (expected exactly 1) — cannot identify the carry-producing sampler`)
  }
  const loadNodes = nodesOfClass(extensionGraph, MOTION_CONTEXT_LOAD_CLASS)
  if (loadNodes.length !== 1) {
    throw new Error(`buildInGraphArm: the extension graph holds ${loadNodes.length} ${MOTION_CONTEXT_LOAD_CLASS} nodes (expected exactly 1) — it is not the loaded-carry shape this control compares against`)
  }
  const contextNodes = nodesOfClass(extensionGraph, MOTION_CONTEXT_CLASS)
  if (contextNodes.length !== 1) {
    throw new Error(`buildInGraphArm: the extension graph holds ${contextNodes.length} ${MOTION_CONTEXT_CLASS} nodes (expected exactly 1) — cannot rewire the conditioning`)
  }
  const contextNode = extensionGraph[contextNodes[0]]
  const contextLatent = contextNode.inputs?.context_latent
  if (!isLink(contextLatent) || contextLatent[0] !== loadNodes[0]) {
    throw new Error(`buildInGraphArm: the Motion Context node's context_latent does not consume the Load node (${MOTION_CONTEXT_LOAD_CLASS}) — refusing to rewire a guess`)
  }

  const droppedSaveNodes = []
  const extension = {}
  for (const [id, node] of Object.entries(extensionGraph)) {
    if (id === loadNodes[0]) continue // the disk hop this control replaces
    if (node.class_type === MOTION_CONTEXT_SAVE_CLASS) {
      droppedSaveNodes.push(id) // never rewrite the landed extension's engine carry
      continue
    }
    const inputs = { ...(node.inputs ?? {}) }
    if (SAVE_CLASSES.has(node.class_type) && typeof inputs.filename_prefix === 'string') {
      const tail = inputs.filename_prefix.split('/').filter(Boolean).pop() ?? 'clip'
      inputs.filename_prefix = `${savePrefix}/${tail}`
    }
    if (id === contextNodes[0]) inputs.context_latent = [`s${sourceSamplers[0]}`, 0]
    extension[id] = { class_type: node.class_type, inputs }
  }

  const sourceCone = upstreamConeOf(sourceGraph, sourceSamplers[0])
  return {
    graph: { ...rekeyGraph(sourceCone, 's'), ...extension },
    sourceSamplerId: `s${sourceSamplers[0]}`,
    droppedSaveNodes,
  }
}

// ---- the delivered-frame comparison (I-4's automated verdict) ------------

/** PSNR (dB) from a mean-squared error over 8-bit channels — Infinity when
 *  the streams are byte-equal (the exact case). */
export function psnrFromMse(mse) {
  if (mse <= 0) return Infinity
  return 10 * Math.log10((255 * 255) / mse)
}

/** One pixel's sRGB channel triple (0..255) → CIE L*a*b* (D65). The standard
 *  linearization + XYZ → Lab chain — dE76 below needs it. */
export function srgbToLab(r, g, b) {
  const lin = (v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)]
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb
  const z = (0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + (16 / 116))
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** Mean CIE76 dE over one frame pair (rgb24 byte arrays, length bytes). */
export function meanDeltaE76(frameA, frameB) {
  const pixels = frameA.length / 3
  let total = 0
  for (let offset = 0; offset < frameA.length; offset += 3) {
    const [l1, a1, b1] = srgbToLab(frameA[offset], frameA[offset + 1], frameA[offset + 2])
    const [l2, a2, b2] = srgbToLab(frameB[offset], frameB[offset + 1], frameB[offset + 2])
    total += Math.sqrt(((l1 - l2) ** 2) + ((a1 - a2) ** 2) + ((b1 - b2) ** 2))
  }
  return total / pixels
}

/** Compares two ffmpeg `-f rawvideo -pix_fmt rgb24` decodes of the arms'
 *  delivered clips. Byte-equal frames count exact (the Set L bit-identity
 *  expectation); the others are measured (per-frame PSNR + mean CIE76 dE —
 *  the probes' convention). Never throws on content: a shape problem
 *  (length not a whole number of frames, unequal frame counts) is an
 *  INCONCLUSIVE outcome, which the verdict fails — a parity check must
 *  never guess past a comparison it could not honestly make. */
export function compareDeliveredFrames(rawA, rawB, { width, height }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return { outcome: 'inconclusive', reason: `the frame dimensions are not usable (${width}x${height})`, framesA: 0, framesB: 0 }
  }
  const frameBytes = width * height * 3
  const framesOf = (raw, label) => {
    if (!(raw instanceof Uint8Array) || raw.length === 0) return { error: `${label} decoded to nothing` }
    if (raw.length % frameBytes !== 0) return { error: `${label} decoded ${raw.length} bytes — not a whole number of ${width}x${height} rgb24 frames` }
    return { frames: raw.length / frameBytes }
  }
  const a = framesOf(rawA, 'arm (a)')
  const b = framesOf(rawB, 'arm (b)')
  if (a.error !== undefined || b.error !== undefined) {
    return { outcome: 'inconclusive', reason: [a.error, b.error].filter(Boolean).join('; '), framesA: a.frames ?? 0, framesB: b.frames ?? 0 }
  }
  if (a.frames !== b.frames) {
    return { outcome: 'inconclusive', reason: `the arms delivered different frame counts (${a.frames} vs ${b.frames})`, framesA: a.frames, framesB: b.frames }
  }

  let exactFrames = 0
  let psnrSum = 0
  let minPsnr = Infinity
  let maxDE = 0
  for (let frame = 0; frame < a.frames; frame += 1) {
    const start = frame * frameBytes
    const end = start + frameBytes
    const sliceA = rawA.subarray(start, end)
    const sliceB = rawB.subarray(start, end)
    let equal = true
    let squaredError = 0
    for (let index = 0; index < frameBytes; index += 1) {
      const delta = sliceA[index] - sliceB[index]
      if (delta !== 0) equal = false
      squaredError += delta * delta
    }
    if (equal) {
      exactFrames += 1
      continue
    }
    const psnr = psnrFromMse(squaredError / frameBytes)
    psnrSum += psnr
    minPsnr = Math.min(minPsnr, psnr)
    maxDE = Math.max(maxDE, meanDeltaE76(sliceA, sliceB))
  }

  const measuredFrames = a.frames - exactFrames
  return {
    outcome: 'measured',
    frames: a.frames,
    exactFrames,
    minPsnrDb: measuredFrames > 0 ? minPsnr : Infinity,
    meanPsnrDb: measuredFrames > 0 ? psnrSum / measuredFrames : Infinity,
    maxDE: measuredFrames > 0 ? maxDE : 0,
    framesA: a.frames,
    framesB: b.frames,
  }
}

/** The automated G1 verdict over the comparison: EXACT (every frame
 *  byte-identical) or WITHIN TOLERANCE passes; DIVERGED and INCONCLUSIVE
 *  both fail — an inconclusive parity is a failed gate, never a pass by
 *  absence. The detail string carries the measured numbers (the gate's
 *  collected result states the comparison it made). */
export function parityVerdict(comparison, tolerance = PARITY_TOLERANCE) {
  if (comparison.outcome === 'inconclusive') {
    return { pass: false, outcome: 'inconclusive', detail: `inconclusive — ${comparison.reason}` }
  }
  if (comparison.exactFrames === comparison.frames) {
    return { pass: true, outcome: 'exact', detail: `all ${comparison.frames} delivered frames byte-identical (both arms decoded through the same ffmpeg)` }
  }
  const detail = `${comparison.exactFrames}/${comparison.frames} frames byte-identical; on the rest: min PSNR ${Number.isFinite(comparison.minPsnrDb) ? comparison.minPsnrDb.toFixed(1) : 'inf'} dB, mean ${Number.isFinite(comparison.meanPsnrDb) ? comparison.meanPsnrDb.toFixed(1) : 'inf'} dB, max dE76 ${comparison.maxDE.toFixed(2)} (tolerance: min PSNR ${tolerance.minPsnrDb} dB, max dE ${tolerance.maxDE})`
  if (comparison.minPsnrDb >= tolerance.minPsnrDb && comparison.maxDE <= tolerance.maxDE) {
    return { pass: true, outcome: 'within-tolerance', detail }
  }
  return { pass: false, outcome: 'diverged', detail }
}
