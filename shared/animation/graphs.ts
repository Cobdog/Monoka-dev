/**
 * The three tool graph builders (spec 2026-10-06-animation-authoring-module-
 * design.md §4.3 the reference-subset contract, §6.2 the caption templates;
 * the operating point is docs/research/h3-keyframe-animation-assessment.md §3
 * as measured by Set K — docs/research/gpu-batch-setK-results.md §0). Pure
 * functions from a FrozenAttemptSnapshot to a ComfyUI prompt graph: no Node
 * or browser APIs, imports nothing beyond ./types — the shared module's
 * dual-build rule compiles this file under both Bundler+DOM (the client) and
 * NodeNext (the server's authoritative submit path).
 *
 * THE OPERATING POINT is pinned here, not in callers: euler/simple,
 * BasicGuider with NO CFG (the keyframe checkpoints are CFG-distilled),
 * MiniMaxH3SigmaShift 12/3, 1344×768, 22 frames (the 17n+5 grid at n=1 —
 * 11 drawings held two frames each), 24 fps, ref_image_size "max" (the
 * adapters' identity-fidelity setting), the per-tool adapter LoRA at
 * strength 1.0 (alpha==rank, so the scale is exactly 1.0 — trained strength,
 * never walked back). The attempt's frozen settings override the step count
 * within the measured 30–50 window and the output dimensions; everything
 * else is the card.
 *
 * WIREFORMAT FACT (Set K's harness finding, load-bearing): the V1 /prompt
 * API cannot pass MiniMaxH3ReferenceToVideo's autogrow refs as flat
 * `ref_image_0` keys — they validate, then crash at execute(). The wire
 * format is DOTTED keys: `ref_images.ref_image_0`. The builders emit the
 * dotted form directly.
 *
 * Reference images reach the engine as INPUT-folder files named by
 * engineInputName() below — the deterministic, shared naming rule both the
 * builders (LoadImage values) and the submit path's uploads (the ComfyUI
 * port) follow, so a re-submitted attempt re-uses its already-uploaded
 * references instead of duplicating them engine-side.
 */
import type { AnimationTool, AssetReference, FacingTerm, FrozenAttemptSnapshot } from './types'
import { CARRY_SAVE_PREFIX, CARRY_SAVE_SLOT, engineOutputCarryPath, isUuid } from './types'

/** A ComfyUI prompt graph: node id → { class_type, inputs } — the same shape
 *  src/lib/engineContract.ts validates against the captured object_info. */
export type AnimationGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>

/** The measured keyframe operating point (assessment §3, Set K §0) — the
 *  constants the builders pin and the tests assert. Steps are the one dial
 *  the frozen settings move, clamped into [stepsMin, stepsMax]. */
export const ANIMATION_OPERATING_POINT = {
  sampler: 'euler',
  scheduler: 'simple',
  denoise: 1,
  shiftVideo: 12,
  shiftAudio: 3,
  width: 1344,
  height: 768,
  /** 17n+5 at n=1 — the card's clip length (11 drawings held two frames). */
  length: 22,
  fps: 24,
  stepsMin: 30,
  stepsMax: 50,
  stepsDefault: 30,
  /** The adapters' identity-fidelity reference sizing ('max' uses the
   *  reference pipeline's 2048px short edge; 'match' would downscale). */
  refImageSize: 'max',
  /** alpha==rank ⇒ the LoRA scale is exactly 1.0 — trained strength. */
  loraStrength: 1.0,
} as const

/** The engine-side model identifiers the animation lane PREFERS (wave 1 of
 *  the post-review program: the live review's #1 — the release blocker).
 *  These are the documented PREFERENCE SEED for the server-side resolver
 *  (server/animation/models.ts), never a welded value: the builders take
 *  RESOLVED names as explicit parameters and never read this table, and an
 *  installation that enumerates different filenames still renders through
 *  the resolver's documented ladder (§11.2: frozen snapshots carry the
 *  RESOLVED adapter/base identifiers in snapshot.settings.baseModel /
 *  .adapterLora / .textEncoder / .videoVae). The ref2va int8 convrot base +
 *  the three staged keyframe adapters (/home/agent/models/loras/h3_*.safetensors)
 *  are Set K's measured combo; the text encoder + VAE are the stock H3
 *  registry's files. */
export const ANIMATION_MODEL_DEFAULTS = {
  /** The ref-conditioning base every tool rides (Set K ran hero/tween/sequence on ref2va). */
  refBase: 'H3/ssd/minimax_h3_ref2va_pruned_int8_convrot.safetensors',
  adapters: {
    hero: 'h3_hero_step12000.safetensors',
    tween: 'h3_tween_step12000.safetensors',
    sequence: 'h3_seq_step12000.safetensors',
  } as Record<AnimationTool, string>,
  textEncoder: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  videoVae: 'minimax_h3_video_vae_fp16.safetensors',
} as const

/** The engine input-folder name for a reference asset — THE shared naming
 *  rule: the builders' LoadImage values and the submit path's uploads derive
 *  the same name from the same assetId, so references are uploaded once and
 *  re-used across attempts that share them. */
export function engineInputName(asset: AssetReference): string {
  const extension = asset.kind === 'video' ? 'mp4' : 'png'
  const safe = asset.assetId
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80)
  return `anim-${safe || 'ref'}.${extension}`
}

/** The graph settings the builders accept: the RESOLVED execution config —
 *  the output dimensions, the attempt's step count, and the four model
 *  names the server-side resolver (server/animation/models.ts) picked from
 *  the engine's own enumeration. Wave 1's contract: the builders take the
 *  resolved names as EXPLICIT parameters and never read
 *  ANIMATION_MODEL_DEFAULTS — no builder holds a welded filename. Steps are
 *  already resolved + clamped by the caller (the builders clamp again
 *  defensively; pure functions defend their own contracts). */
export type GraphBuildSettings = {
  width: number
  height: number
  steps: number
  /** The resolved base (ref-conditioning) UNET the engine enumerated. */
  baseModel: string
  /** The resolved per-tool keyframe adapter LoRA. */
  adapterLora: string
  /** The resolved text encoder (clip) the engine enumerated. */
  textEncoder: string
  /** The resolved video VAE the engine enumerated. */
  videoVae: string
}

// ---------------------------------------------------------------------------
// input narrowing (module-local, the types.ts idiom — a builder never reads
// an unchecked value out of the snapshot's settings record)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return fallback
  return value
}

/** A finite positive float (the frozen config's denoise / LoRA-strength
 *  overrides) — the operating point stands in for anything malformed. */
function positiveFloat(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/** The frozen conditioning extras (fix round M-6 — the live review's #2
 *  "the graph has additional defaults"): clip length and the adapters'
 *  reference-image sizing ride the frozen snapshot's settings with the
 *  operating point as the pre-freeze fallback, exactly like the sampler
 *  values. No builder holds these as constants anymore. */
function conditioningExtrasOf(snapshot: FrozenAttemptSnapshot): { length: number; refImageSize: string } {
  const settings = isRecord(snapshot.settings) ? snapshot.settings : {}
  return {
    length: positiveInt(settings.length, ANIMATION_OPERATING_POINT.length),
    refImageSize: stringIn(settings.refImageSize, ANIMATION_OPERATING_POINT.refImageSize),
  }
}

function nonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return fallback
  return value
}

function stringIn(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

/** The pack's in-graph save class (ComfyUI-H3-Motion-Context, registry row
 *  h3-motion-context) — the extension lane's carry producer (spec §7): the
 *  Save node needs the sampler's LIVE AV tensor, so it executes INSIDE the
 *  source render graph and the ENGINE writes the file during the render
 *  itself — never the completion owner, post-hoc. Exported for the engine
 *  port's save-tail stamping (rendering.ts), which gives the node its
 *  per-attempt prefix exactly like the media save tail. */
export const MOTION_CONTEXT_SAVE_CLASS = 'MiniMaxH3MotionContextSaveLatent'

/** The carry build flag (spec §7 "the source render carries; a plain render
 *  doesn't"): an execution-relevant intent, so it freezes into the
 *  snapshot's settings like every other dial (fix M-6's doctrine — replay,
 *  recovery, and the input hash all reproduce it) and ONLY the tween
 *  builder reads it, per the adapter scope (§3: hero/sequence need
 *  adapter-specific probes before they may carry). Exported since the
 *  extension lane's Task 2: the completion owner reads the SAME frozen
 *  truth to know whether a landed attempt owes a carry registration — one
 *  definition, strict `=== true`, never a second loose-key reader. */
export function carryRequested(snapshot: FrozenAttemptSnapshot): boolean {
  const settings = isRecord(snapshot.settings) ? snapshot.settings : {}
  return settings.carry === true
}

// ---------------------------------------------------------------------------
// the continuation OVERLAP RECIPE (the extension lane, spec §9 — provisional)
// ---------------------------------------------------------------------------

/** The extension lane's conditioning classes (ComfyUI-H3-Motion-Context —
 *  Set L's measured mechanism): the Load node reads the registered carry
 *  file from the ENGINE's own output folder (the deterministic receipt path,
 *  addressed as a FILE with clip_index > 0 — "pointing at a specific FILE
 *  always loads that file when clip_index is greater than 0"); the Motion
 *  Context node pins the carried AV latent's tail as never-denoised
 *  conditioning rows and answers the trim count; the Trim node drops the
 *  pinned head off the DECODED clip (picture only here — the lane's graphs
 *  are silent by §3, and the node's audio input is optional by design); the
 *  Add Guide node anchors a reference image at an authored frame (the
 *  extension draft's anchor vocabulary, §10's collision surface). All four
 *  are in the REAL captured object_info — no mirror extras needed. */
export const MOTION_CONTEXT_LOAD_CLASS = 'MiniMaxH3MotionContextLoadLatent'
export const MOTION_CONTEXT_CLASS = 'MiniMaxH3MotionContext'
export const MOTION_CONTEXT_TRIM_CLASS = 'MiniMaxH3MotionContextTrim'
export const MOTION_CONTEXT_GUIDE_CLASS = 'MiniMaxH3AddGuide'

/** The OVERLAP RECIPE (spec §9 — "provisional until the tuning probe lands"):
 *  the join values every extension freezes into its binding's `recipe` and
 *  the target-length validation runs against. The two PROBE-GATED values
 *  carry their FALLBACKS inline — the join-tuning probe is PAUSED at this
 *  landing, so v1 ships Set L's measured operating point (the 22f
 *  latent-tail context on ComfyUI-H3-Motion-Context, 24f of tail audio)
 *  and the constants are the ONLY place a tuned recipe will land. The
 *  offered context lengths are NOT probe-gated: they are the node's own
 *  served combo (whole numbers of latent steps — anything else the node
 *  would silently snap DOWN, the exact degradation §10 bans), pinned here
 *  so the validation and the builder emit one of the engine's real keys.
 *  Recipe changes are version changes (§5): bump recipeVersion with any
 *  value here. */
export const CONTINUATION_OVERLAP_RECIPE = {
  /** PROBE (join tuning): frames of the source's picture the window pins —
   *  fallback 22, Set L's measured near-seamless context. */
  contextLength: 22,
  /** PROBE (join tuning): frames of tail audio pinned independently —
   *  fallback 24, the node's documented whole-second default. */
  audioContextLength: 24,
  /** The node's own combo — whole latent steps only. */
  offeredContextLengths: [5, 22, 39, 56],
  recipeVersion: 'overlap-recipe-v1-probe-pending',
} as const

/** A legal H3 window length on the 17k+5 frame grid (5, 22, 39, 56, 73, …).
 *  The engine SNAPS an off-grid length UP silently (nodes_minimax_h3
 *  temporal_shape); the lane refuses instead (§10's no-silent-drop). */
export function isLegalH3WindowLength(length: number): boolean {
  return Number.isInteger(length) && length >= 5 && length <= 3600 && (length - 5) % 17 === 0
}

/** Latent steps a legal window length occupies: FRAME_PER_TOKEN cycles
 *  (1,4,4,4,4) — 5 steps per 17 frames, plus the 2-step (1+4) head, so
 *  17k+5 frames ⇔ 5k+2 steps (5f→2, 22f→7, 39f→12, 56f→17; the pack's own
 *  _steps_for_frames table). */
function h3LatentSteps(length: number): number {
  return (5 * (length - 5)) / 17 + 2
}

/** The full §6 coordinate mapping for one extension window, computed and
 *  checked in ONE place — the route freezes exactly this record and the
 *  tests pin its arithmetic. Every refusal is a NAMED error message (the
 *  route maps it to its 400; the builder never sees these shapes): the
 *  source and target must be legal 17k+5 windows, the pinned tail must be
 *  one of the node's offered lengths, the tail must be STRICTLY SHORTER
 *  than the generation (the node contract) and NO LONGER than the source's
 *  own window (the node would silently pin less), and the tail's latent
 *  steps must begin at a whole cycle boundary (the phase check the node
 *  itself enforces — for on-grid lengths it holds by construction; the
 *  check stands as the fail-closed backstop). */
export type ContinuationWindowPlan = {
  /** The pinned tail's frame range in the SOURCE's GENERATED coordinates —
   *  the raw latent's own world (§6: subsequent extensions refer to this,
   *  never to delivered time). */
  windowCoordinates: { generatedStart: number; generatedEnd: number; phase: string }
  headTrim: number
  deliveredRange: { start: number; end: number }
}

export function continuationWindowPlan(input: { sourceLength: number; targetLength: number; contextLength: number }): ContinuationWindowPlan {
  const { sourceLength, targetLength, contextLength } = input
  if (!isLegalH3WindowLength(sourceLength)) {
    throw new Error(`The pinned tail is sliced from the source's raw latent, and the source's frozen window (${sourceLength} frames) is not a legal 17k+5 length — its tail cannot be phase-aligned (spec §6).`)
  }
  if (!isLegalH3WindowLength(targetLength)) {
    throw new Error(`The target window length (${targetLength}) is not a legal 17k+5 length on the 24 fps grid (5, 22, 39, 56, 73, …) — the engine would silently snap it up; the lane refuses instead (spec §10).`)
  }
  if (!(CONTINUATION_OVERLAP_RECIPE.offeredContextLengths as readonly number[]).includes(contextLength)) {
    throw new Error(`The overlap recipe's pinned tail (${contextLength} frames) is not one of the Motion Context node's offered windows (5/22/39/56 — whole numbers of latent steps); the node would silently snap it down (spec §10).`)
  }
  if (contextLength >= targetLength) {
    throw new Error(`The node contract keeps the pinned tail strictly shorter than the generation: the recipe pins ${contextLength} frames and the target window is ${targetLength} (spec §6).`)
  }
  if (contextLength > sourceLength) {
    throw new Error(`The pinned tail (${contextLength} frames) is longer than the source's own window (${sourceLength}) — the node would silently pin less of it; the lane refuses instead (spec §10).`)
  }
  const startSteps = h3LatentSteps(sourceLength) - h3LatentSteps(contextLength)
  if (!Number.isInteger(startSteps) || startSteps % 5 !== 0) {
    throw new Error(`The pinned tail's ${contextLength} frames do not begin at a whole latent cycle of the source's ${sourceLength}-frame window — the node refuses a shifted join, and so does the lane (spec §6).`)
  }
  return {
    windowCoordinates: { generatedStart: sourceLength - contextLength, generatedEnd: sourceLength, phase: 'cycle-0' },
    headTrim: contextLength,
    deliveredRange: { start: 0, end: targetLength - contextLength },
  }
}

/** The extension anchors a frozen snapshot's settings may carry (§4/§10):
 *  an in-force reference image pinned at an authored frame of the SAMPLED
 *  window, expressed as an Add Guide node — the vocabulary whose
 *  inside-the-pinned-head collisions the preflight refuses by name. The
 *  narrow read is shared by the builder (which wires the LoadImage) and
 *  stays loud on malformed shapes. */
export type ExtensionAnchor = { reference: 'rolling-near' | 'fixed-far'; frame: number }

function extensionAnchorsOf(snapshot: FrozenAttemptSnapshot): ExtensionAnchor[] {
  const settings = isRecord(snapshot.settings) ? snapshot.settings : {}
  const raw = settings.anchors
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > 8) throw new Error('The frozen anchors must be an array of at most 8 entries (reference role + frame).')
  const anchors: ExtensionAnchor[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) throw new Error('A frozen anchor must be an object with a reference role and a frame.')
    if (entry.reference !== 'rolling-near' && entry.reference !== 'fixed-far') {
      throw new Error(`A frozen anchor's reference must be one of the in-force roles "rolling-near"/"fixed-far" — got ${JSON.stringify(String(entry.reference))}.`)
    }
    const frame = entry.frame
    if (typeof frame !== 'number' || !Number.isInteger(frame) || frame < 0) {
      throw new Error('A frozen anchor\'s frame must be a non-negative integer.')
    }
    anchors.push({ reference: entry.reference, frame })
  }
  return anchors
}

/** The binding source a frozen snapshot names — the builder's narrow,
 *  environment-neutral read (rendering.ts's continuationBindingOf is the
 *  validating seam server-side; this one only needs the Load node's path
 *  argument). Null when the snapshot carries no binding (every plain
 *  render); LOUD on a present-but-malformed block — corrupt truth never
 *  builds a graph. */
function continuationSourceOf(snapshot: FrozenAttemptSnapshot): string | null {
  const raw = (snapshot as { continuationBinding?: unknown }).continuationBinding
  if (raw === undefined) return null
  if (!isRecord(raw) || !isUuid(raw.sourceAttemptId)) {
    throw new Error('The frozen continuation binding is malformed (it must name its source attempt by UUID) — the extension conditioning refuses to build from corrupt truth.')
  }
  return raw.sourceAttemptId
}

export type GraphReference = {
  role: FrozenAttemptSnapshot['references'][number]['role']
  assetReference: AssetReference
  poseDescription: string | null
  facing: FacingTerm | null
}

/** Picks the snapshot's references by role, refusing any snapshot that does
 *  not carry EXACTLY the tool's reference contract (§4.3) — a hero attempt
 *  with a far reference is a caller bug, and the pure builder is where that
 *  bug becomes a loud error instead of a mis-wired graph. Reference assets
 *  must be images: the adapters' reference slots consume IMAGE tensors (a
 *  video reference would need LoadVideo + component split, a lane this
 *  module deliberately does not speak). */
function referencesFor(snapshot: FrozenAttemptSnapshot, roles: ReadonlyArray<GraphReference['role']>): GraphReference[] {
  const byRole = new Map<string, GraphReference[]>()
  for (const reference of snapshot.references ?? []) {
    if (!isRecord(reference)) throw new Error('The frozen snapshot carries a malformed reference entry.')
    if (reference.assetReference?.kind !== 'image') {
      throw new Error(`The ${String(reference.role)} reference must be an image asset — the keyframe adapters' reference slots consume images.`)
    }
    const bucket = byRole.get(String(reference.role)) ?? []
    bucket.push(reference as GraphReference)
    byRole.set(String(reference.role), bucket)
  }
  const picked: GraphReference[] = []
  for (const role of roles) {
    const bucket = byRole.get(role) ?? []
    if (bucket.length !== 1) {
      throw new Error(`A ${snapshot.tool} attempt freezes exactly one "${role}" reference (spec §4.3) — found ${bucket.length}.`)
    }
    picked.push(bucket[0])
    byRole.delete(role)
  }
  if (byRole.size > 0) {
    throw new Error(`The ${snapshot.tool} reference contract takes only ${roles.join(' + ')} — unexpected roles: ${[...byRole.keys()].join(', ')}.`)
  }
  return picked
}

// ---------------------------------------------------------------------------
// the shared graph skeleton (assessment §3's chain, the studio topology
// minus its registry seams: loaders → adapter LoRA → sigma shift →
// conditioning → advanced sampler → decode → silent 24fps video → save)
// ---------------------------------------------------------------------------

type SkeletonInputs = {
  tool: AnimationTool
  settings: Record<string, unknown>
  build: GraphBuildSettings
  referenceLinks: Array<{ node: (graph: AnimationGraph) => void }>
  attachConditioning: (graph: AnimationGraph, conditioningId: string) => void
}

/** Steps CLAMP into the measured 30–50 window — the frozen settings
 *  override within the bounds (the assessment's step-count floor/ceiling),
 *  never outside them. */
function clampSteps(value: unknown, requested: number): number {
  const raw = typeof value === 'number' && Number.isInteger(value)
    ? value
    : (typeof requested === 'number' && Number.isInteger(requested) ? requested : ANIMATION_OPERATING_POINT.stepsDefault)
  return Math.min(ANIMATION_OPERATING_POINT.stepsMax, Math.max(ANIMATION_OPERATING_POINT.stepsMin, raw))
}

function buildSkeleton(input: SkeletonInputs): AnimationGraph {
  const settings = isRecord(input.settings) ? input.settings : {}
  const steps = clampSteps(settings.steps, input.build.steps)
  const seed = nonNegativeInt(settings.seed, 0)
  // Wave 1: the resolved model names arrive as EXPLICIT parameters — a
  // builder never falls back to a pinned filename. An empty one is a caller
  // bug and becomes a loud error here, never a silently defaulted graph.
  for (const [name, value] of Object.entries({ baseModel: input.build.baseModel, adapterLora: input.build.adapterLora, textEncoder: input.build.textEncoder, videoVae: input.build.videoVae })) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`The graph build settings need a resolved ${name} — the server-side resolver must pick one from the engine's enumeration before building.`)
  }
  // The frozen snapshot's sampler/scheduler/shift/fps (Fix B stamps the
  // complete resolved config) win; the operating point is the fallback for
  // pre-freeze shapes. Same values by construction unless a snapshot froze
  // an override — building exclusively from the frozen config is what makes
  // replay independent of mutable state. The denoise + LoRA-strength
  // extras (fix round M-6) ride the same seam.
  const sampler = stringIn(settings.sampler, ANIMATION_OPERATING_POINT.sampler)
  const scheduler = stringIn(settings.scheduler, ANIMATION_OPERATING_POINT.scheduler)
  const shiftVideo = nonNegativeInt(settings.shiftVideo, ANIMATION_OPERATING_POINT.shiftVideo)
  const shiftAudio = nonNegativeInt(settings.shiftAudio, ANIMATION_OPERATING_POINT.shiftAudio)
  const fps = positiveInt(settings.fps, ANIMATION_OPERATING_POINT.fps)
  const denoise = positiveFloat(settings.denoise, ANIMATION_OPERATING_POINT.denoise)
  const loraStrength = positiveFloat(settings.loraStrength, ANIMATION_OPERATING_POINT.loraStrength)

  const graph: AnimationGraph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: input.build.baseModel, weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: input.build.textEncoder, type: 'minimax', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: input.build.videoVae } },
    // The per-tool keyframe adapter at trained strength — model-only (the
    // adapters are LoRAs over the DiT, never over the text encoder).
    '5': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: input.build.adapterLora, strength_model: loraStrength } },
    '6': { class_type: 'MiniMaxH3SigmaShift', inputs: { model: ['5', 0], shift_video: shiftVideo, shift_audio: shiftAudio } },
  }
  for (const reference of input.referenceLinks) reference.node(graph)

  const conditioningId = '10'
  input.attachConditioning(graph, conditioningId)

  graph['11'] = { class_type: 'RandomNoise', inputs: { noise_seed: seed } }
  graph['12'] = { class_type: 'BasicGuider', inputs: { model: ['6', 0], conditioning: [conditioningId, 0] } }
  graph['13'] = { class_type: 'KSamplerSelect', inputs: { sampler_name: sampler } }
  graph['14'] = {
    class_type: 'BasicScheduler',
    inputs: { model: ['6', 0], scheduler, steps, denoise },
  }
  graph['15'] = {
    class_type: 'SamplerCustomAdvanced',
    inputs: { noise: ['11', 0], guider: ['12', 0], sampler: ['13', 0], sigmas: ['14', 0], latent_image: [conditioningId, 1] },
  }
  graph['16'] = { class_type: 'VAEDecode', inputs: { samples: ['15', 0], vae: ['3', 0] } }
  // Silent H.264 at the schema's constant 24 fps (§11.3) — no audio lane:
  // the keyframe clips are silent drawings, and the export owns the track.
  graph['18'] = { class_type: 'CreateVideo', inputs: { images: ['16', 0], fps, bit_depth: 8, color_space: 'sRGB' } }
  graph['19'] = {
    class_type: 'SaveVideo',
    inputs: { video: ['18', 0], filename_prefix: 'animation/clip', format: 'auto', codec: 'auto' },
  }
  return graph
}

/** Output dimensions: the frozen snapshot's override wins, then the build
 *  settings (the document's output size), then the operating point. */
function dimensionsOf(snapshot: FrozenAttemptSnapshot, build: GraphBuildSettings): { width: number; height: number } {
  const settings = isRecord(snapshot.settings) ? snapshot.settings : {}
  return {
    width: positiveInt(settings.width, positiveInt(build.width, ANIMATION_OPERATING_POINT.width)),
    height: positiveInt(settings.height, positiveInt(build.height, ANIMATION_OPERATING_POINT.height)),
  }
}

// ---------------------------------------------------------------------------
// the three builders
// ---------------------------------------------------------------------------

/** HERO — MiniMaxH3ImageToVideo with ONE reference: the current key as the
 *  first frame (§4.3: no destination — showing where the action goes is
 *  showing the model the answer). */
export function buildHeroGraph(snapshot: FrozenAttemptSnapshot, settings: GraphBuildSettings): AnimationGraph {
  if (snapshot.tool !== 'hero') throw new Error(`buildHeroGraph compiles hero attempts — this snapshot's tool is "${snapshot.tool}".`)
  const [currentKey] = referencesFor(snapshot, ['current-key'])
  const { width, height } = dimensionsOf(snapshot, settings)
  const extras = conditioningExtrasOf(snapshot)
  return buildSkeleton({
    tool: 'hero',
    settings: snapshot.settings,
    build: settings,
    referenceLinks: [{ node: (graph) => { graph['30'] = { class_type: 'LoadImage', inputs: { image: engineInputName(currentKey.assetReference) } } } }],
    attachConditioning: (graph, id) => {
      graph[id] = {
        class_type: 'MiniMaxH3ImageToVideo',
        inputs: { clip: ['2', 0], vae: ['3', 0], prompt: snapshot.caption, width, height, length: extras.length, first_frame: ['30', 0] },
      }
    },
  })
}

/** TWEEN — MiniMaxH3ReferenceToVideo with rolling-near (Reference 1) +
 *  fixed-far (Reference 2): the far ref is context-that-leans, held constant
 *  per span while the near ref rolls (§6.4). The tween lane ALONE carries
 *  (the extension lane's adapter scope): when the frozen snapshot sets the
 *  carry build flag, the pack's Save node rides the graph beside the media
 *  save tail (see the carry block below). */
export function buildTweenGraph(snapshot: FrozenAttemptSnapshot, settings: GraphBuildSettings): AnimationGraph {
  if (snapshot.tool !== 'tween') throw new Error(`buildTweenGraph compiles tween attempts — this snapshot's tool is "${snapshot.tool}".`)
  const [rollingNear, fixedFar] = referencesFor(snapshot, ['rolling-near', 'fixed-far'])
  const { width, height } = dimensionsOf(snapshot, settings)
  const extras = conditioningExtrasOf(snapshot)
  const graph = buildSkeleton({
    tool: 'tween',
    settings: snapshot.settings,
    build: settings,
    referenceLinks: [
      { node: (graph) => { graph['30'] = { class_type: 'LoadImage', inputs: { image: engineInputName(rollingNear.assetReference) } } } },
      { node: (graph) => { graph['31'] = { class_type: 'LoadImage', inputs: { image: engineInputName(fixedFar.assetReference) } } } },
    ],
    attachConditioning: (graph, id) => {
      graph[id] = {
        class_type: 'MiniMaxH3ReferenceToVideo',
        inputs: {
          clip: ['2', 0],
          vae: ['3', 0],
          prompt: snapshot.caption,
          width,
          height,
          length: extras.length,
          ref_image_size: extras.refImageSize,
          'ref_images.ref_image_0': ['30', 0],
          'ref_images.ref_image_1': ['31', 0],
        },
      }
    },
  })
  // The extension lane's carry tail (spec §7): the Save node consumes the
  // sampler's LIVE AV latent — node 15's output 0, the same tensor VAEDecode
  // consumes (wiring the sampler output straight into a conditioning input
  // would be a cycle, which is exactly why the carry crosses submissions
  // through disk). The prefix is the PRE-STAMP marker: the port's attempt-id
  // stamping rewrites it under animation/<attemptId>/, so the file lands at
  // engineOutputCarryPath(attemptId) — the deterministic receipt (types.ts).
  if (carryRequested(snapshot)) {
    graph['20'] = {
      class_type: MOTION_CONTEXT_SAVE_CLASS,
      inputs: {
        latent: ['15', 0],
        filename_prefix: CARRY_SAVE_PREFIX,
        clip_index: CARRY_SAVE_SLOT,
      },
    }
  }
  // The extension lane's CONDITIONING BUILD (spec §4/§6, lane Task 5): a
  // snapshot carrying a continuation binding is an extension attempt — the
  // conditioning routes through the pack's Motion Context chain exactly as
  // Set L wired it (g_mctx_chain), adapted to the cross-submission carry:
  //   '40' LoadLatent   — the registered carry file at its deterministic
  //                       engine-output path (clip_index 1 addresses the
  //                       FILE; §7: the registered artifact is the truth,
  //                       the engine's own file the read-through);
  //   guides           — the draft's anchors (Add Guide per anchor, chained
  //                       onto the conditioning BEFORE the Motion Context
  //                       node: anchors inside the pinned head are the
  //                       node's silent drops, so they live upstream of it
  //                       where the preflight's collision refusal governs);
  //   '41' MotionContext — pins the carried tail as never-denoised rows,
  //                       answers trim_frames;
  //   '42' Trim         — drops the pinned head off the decoded clip, so
  //                       the SAVED output is the delivered window (§6: the
  //                       head-trim count frozen beside it).
  // The sampler still denoises the FRESH latent (node 10's output 1) — only
  // the guider's conditioning moves to the Motion Context output. The audio
  // half stays silent (§3: no audio in delivered output; the Trim node's
  // audio input is optional and unwired).
  const continuationSource = continuationSourceOf(snapshot)
  if (continuationSource !== null) {
    const settings = isRecord(snapshot.settings) ? snapshot.settings : {}
    const contextLength = positiveInt(settings.contextLength, CONTINUATION_OVERLAP_RECIPE.contextLength)
    const audioContextLength = positiveInt(settings.audioContextLength, CONTINUATION_OVERLAP_RECIPE.audioContextLength)
    if (!(CONTINUATION_OVERLAP_RECIPE.offeredContextLengths as readonly number[]).includes(contextLength)) {
      throw new Error(`The frozen context length ${contextLength} is not one of the Motion Context node's offered windows (5/22/39/56) — the extension graph refuses to build a silently-snapped join.`)
    }
    if (contextLength >= extras.length) {
      throw new Error(`The pinned tail (${contextLength} frames) must be strictly shorter than the sampled window (${extras.length}) — the node refuses to pin a run as long as the clip itself.`)
    }
    graph['40'] = {
      class_type: MOTION_CONTEXT_LOAD_CLASS,
      inputs: { latent_path: engineOutputCarryPath(continuationSource), clip_index: 1 },
    }
    let conditioning: [string, number] = ['10', 0]
    let guideId = 43
    for (const anchor of extensionAnchorsOf(snapshot)) {
      graph[String(guideId)] = {
        class_type: MOTION_CONTEXT_GUIDE_CLASS,
        inputs: {
          positive: conditioning,
          latent: ['10', 1],
          image: [anchor.reference === 'rolling-near' ? '30' : '31', 0],
          frame_idx: anchor.frame,
          vae: ['3', 0],
        },
      }
      conditioning = [String(guideId), 0]
      guideId += 1
    }
    graph['41'] = {
      class_type: MOTION_CONTEXT_CLASS,
      inputs: {
        conditioning,
        vae: ['3', 0],
        latent: ['10', 1],
        context_length: String(contextLength),
        audio_context_length: audioContextLength,
        context_latent: ['40', 0],
      },
    }
    graph['12'].inputs.conditioning = ['41', 0]
    graph['42'] = {
      class_type: MOTION_CONTEXT_TRIM_CLASS,
      inputs: { images: ['16', 0], trim_frames: ['41', 1] },
    }
    graph['18'].inputs.images = ['42', 0]
  }
  return graph
}

/** SEQUENCE — MiniMaxH3ReferenceToVideo with the window endpoints (start =
 *  Reference 1, the window's natural end = Reference 2): surfacing held
 *  animation the base distribution already knows how to draw. */
export function buildSequenceGraph(snapshot: FrozenAttemptSnapshot, settings: GraphBuildSettings): AnimationGraph {
  if (snapshot.tool !== 'sequence') throw new Error(`buildSequenceGraph compiles sequence attempts — this snapshot's tool is "${snapshot.tool}".`)
  const [windowStart, windowEnd] = referencesFor(snapshot, ['window-start', 'window-end'])
  const { width, height } = dimensionsOf(snapshot, settings)
  const extras = conditioningExtrasOf(snapshot)
  return buildSkeleton({
    tool: 'sequence',
    settings: snapshot.settings,
    build: settings,
    referenceLinks: [
      { node: (graph) => { graph['30'] = { class_type: 'LoadImage', inputs: { image: engineInputName(windowStart.assetReference) } } } },
      { node: (graph) => { graph['31'] = { class_type: 'LoadImage', inputs: { image: engineInputName(windowEnd.assetReference) } } } },
    ],
    attachConditioning: (graph, id) => {
      graph[id] = {
        class_type: 'MiniMaxH3ReferenceToVideo',
        inputs: {
          clip: ['2', 0],
          vae: ['3', 0],
          prompt: snapshot.caption,
          width,
          height,
          length: extras.length,
          ref_image_size: extras.refImageSize,
          'ref_images.ref_image_0': ['30', 0],
          'ref_images.ref_image_1': ['31', 0],
        },
      }
    },
  })
}

/** The builder dispatch the submit path uses — tool → builder. */
export function buildAnimationGraph(snapshot: FrozenAttemptSnapshot, settings: GraphBuildSettings): AnimationGraph {
  if (snapshot.tool === 'hero') return buildHeroGraph(snapshot, settings)
  if (snapshot.tool === 'tween') return buildTweenGraph(snapshot, settings)
  if (snapshot.tool === 'sequence') return buildSequenceGraph(snapshot, settings)
  throw new Error(`Unknown animation tool ${String(snapshot.tool)} — cannot build a graph.`)
}
