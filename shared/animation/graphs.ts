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

/** The engine-side model identifiers the animation lane loads (§11.2: frozen
 *  snapshots carry adapter/base identifiers — snapshot.settings.baseModel /
 *  .adapterLora / .textEncoder / .videoVae override these defaults). The
 *  ref2va int8 convrot base + the three staged keyframe adapters
 *  (/home/agent/models/loras/h3_*.safetensors) are Set K's measured combo;
 *  the text encoder + VAE are the stock H3 registry's files. File-listing
 *  combos are environment-enumerated — the engine confirms availability at
 *  validation time, these names are the lane's pinned defaults, not a claim
 *  every install serves them (Task 15's real-engine leg verifies). */
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

/** The graph settings the builders accept: the document's output dimensions
 *  plus the attempt's step count (already resolved + clamped by the caller —
 *  the builders clamp again defensively; pure functions defend their own
 *  contracts). */
export type GraphBuildSettings = { width: number; height: number; steps: number }

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

function nonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return fallback
  return value
}

function stringIn(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
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
  const baseModel = stringIn(settings.baseModel, ANIMATION_MODEL_DEFAULTS.refBase)
  const adapterLora = stringIn(settings.adapterLora, ANIMATION_MODEL_DEFAULTS.adapters[input.tool])
  const textEncoder = stringIn(settings.textEncoder, ANIMATION_MODEL_DEFAULTS.textEncoder)
  const videoVae = stringIn(settings.videoVae, ANIMATION_MODEL_DEFAULTS.videoVae)

  const graph: AnimationGraph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: baseModel, weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: textEncoder, type: 'minimax', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: videoVae } },
    // The per-tool keyframe adapter at trained strength — model-only (the
    // adapters are LoRAs over the DiT, never over the text encoder).
    '5': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: adapterLora, strength_model: ANIMATION_OPERATING_POINT.loraStrength } },
    '6': { class_type: 'MiniMaxH3SigmaShift', inputs: { model: ['5', 0], shift_video: ANIMATION_OPERATING_POINT.shiftVideo, shift_audio: ANIMATION_OPERATING_POINT.shiftAudio } },
  }
  for (const reference of input.referenceLinks) reference.node(graph)

  const conditioningId = '10'
  input.attachConditioning(graph, conditioningId)

  graph['11'] = { class_type: 'RandomNoise', inputs: { noise_seed: seed } }
  graph['12'] = { class_type: 'BasicGuider', inputs: { model: ['6', 0], conditioning: [conditioningId, 0] } }
  graph['13'] = { class_type: 'KSamplerSelect', inputs: { sampler_name: ANIMATION_OPERATING_POINT.sampler } }
  graph['14'] = {
    class_type: 'BasicScheduler',
    inputs: { model: ['6', 0], scheduler: ANIMATION_OPERATING_POINT.scheduler, steps, denoise: ANIMATION_OPERATING_POINT.denoise },
  }
  graph['15'] = {
    class_type: 'SamplerCustomAdvanced',
    inputs: { noise: ['11', 0], guider: ['12', 0], sampler: ['13', 0], sigmas: ['14', 0], latent_image: [conditioningId, 1] },
  }
  graph['16'] = { class_type: 'VAEDecode', inputs: { samples: ['15', 0], vae: ['3', 0] } }
  // Silent H.264 at the schema's constant 24 fps (§11.3) — no audio lane:
  // the keyframe clips are silent drawings, and the export owns the track.
  graph['18'] = { class_type: 'CreateVideo', inputs: { images: ['16', 0], fps: ANIMATION_OPERATING_POINT.fps, bit_depth: 8, color_space: 'sRGB' } }
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
  return buildSkeleton({
    tool: 'hero',
    settings: snapshot.settings,
    build: settings,
    referenceLinks: [{ node: (graph) => { graph['30'] = { class_type: 'LoadImage', inputs: { image: engineInputName(currentKey.assetReference) } } } }],
    attachConditioning: (graph, id) => {
      graph[id] = {
        class_type: 'MiniMaxH3ImageToVideo',
        inputs: { clip: ['2', 0], vae: ['3', 0], prompt: snapshot.caption, width, height, length: ANIMATION_OPERATING_POINT.length, first_frame: ['30', 0] },
      }
    },
  })
}

/** TWEEN — MiniMaxH3ReferenceToVideo with rolling-near (Reference 1) +
 *  fixed-far (Reference 2): the far ref is context-that-leans, held constant
 *  per span while the near ref rolls (§6.4). */
export function buildTweenGraph(snapshot: FrozenAttemptSnapshot, settings: GraphBuildSettings): AnimationGraph {
  if (snapshot.tool !== 'tween') throw new Error(`buildTweenGraph compiles tween attempts — this snapshot's tool is "${snapshot.tool}".`)
  const [rollingNear, fixedFar] = referencesFor(snapshot, ['rolling-near', 'fixed-far'])
  const { width, height } = dimensionsOf(snapshot, settings)
  return buildSkeleton({
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
          length: ANIMATION_OPERATING_POINT.length,
          ref_image_size: ANIMATION_OPERATING_POINT.refImageSize,
          'ref_images.ref_image_0': ['30', 0],
          'ref_images.ref_image_1': ['31', 0],
        },
      }
    },
  })
}

/** SEQUENCE — MiniMaxH3ReferenceToVideo with the window endpoints (start =
 *  Reference 1, the window's natural end = Reference 2): surfacing held
 *  animation the base distribution already knows how to draw. */
export function buildSequenceGraph(snapshot: FrozenAttemptSnapshot, settings: GraphBuildSettings): AnimationGraph {
  if (snapshot.tool !== 'sequence') throw new Error(`buildSequenceGraph compiles sequence attempts — this snapshot's tool is "${snapshot.tool}".`)
  const [windowStart, windowEnd] = referencesFor(snapshot, ['window-start', 'window-end'])
  const { width, height } = dimensionsOf(snapshot, settings)
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
          length: ANIMATION_OPERATING_POINT.length,
          ref_image_size: ANIMATION_OPERATING_POINT.refImageSize,
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
