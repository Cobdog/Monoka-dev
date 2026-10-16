/** The shared MiniMax H3 render-submission core (canvas Phase 2, task flyuh6h).
 *
 * Extracted verbatim from useGenerationFlows.generate so BOTH surfaces submit
 * through one code path (spec §8 D1/D2: the old CreateView and the canvas
 * read the same underlying flows): the hook snapshots its workspace state
 * into an explicit H3RenderRequest, the canvas builds the request from
 * per-chain settings in the document store. Nothing here touches a store —
 * every fact arrives as data, which is what makes the validation ladder and
 * the graph construction testable without an engine.
 *
 * The request carries the EFFECTIVE prompt (composeH3Prompt output) and the
 * ORDERED render references (resolveRenderReferenceImages output) — surface
 * builders own composition; this module owns validation, upload, graph
 * submission, and job bookkeeping.
 */
import { createId } from './createId'
import { QUEUED_LABEL } from './jobReducer'
import { buildMonokaWorkflow, frameIndexForSeconds, guideFrameWarning } from './workflow'
import { vdnAvailability } from './graph'
import { turboTierRefusal } from './h3Stack'
import { teDimClassRefusal } from './modelSelection'
import { prepareImage, prepareReferenceImage } from './imageCrop'
import { buildRenderManifest } from './manifest'
import { missingCoreNodeClasses, preflightOrFail } from './preflight'
import { dbg } from './dbg'
import type { OverrideResolution } from './modelOverrides'
import type { ObjectInfo } from './comfyInfo'
import type { AppSettings, GenerationJob, GenerationMode, MediaFile, ModelFile, ModelSelection, UpscaleMode } from '../types'

export type H3RenderRequest = {
  mode: GenerationMode
  /** The composed prompt exactly as it will render. */
  prompt: string
  width: number
  height: number
  duration: number
  seed: number
  steps: number
  turbo: 'off' | '4' | '8'
  /** The VDN acceleration rung (task 9up52mj): 'off' default; XOR with
   *  `turbo` — the ladder refuses the combination, and each absence (pack
   *  not served, stage not fetched) refuses with install/fetch guidance. */
  vdn?: 'off' | 'dmd-8' | 'stage-b-50'
  turboLoader: 'auto' | 'plain'
  experimentalSampling: boolean
  loraStrength: number
  /** The chain's temporal LoRA stack (7twfk6o): 0–2 user LoRAs the graph
   *  chains after the turbo seam (slot 0 rides the first-party form adapter
   *  when installed). Absent/empty = no stack loaders — the graph stays
   *  byte-identical to the pre-seam factory output. */
  loraStack?: Array<{ name: string; strength: number }>
  sampler: string
  scheduler: string
  refImageSize: 'match' | 'max'
  sigmaShift?: { video: number; audio: number }
  upscale:
    | { mode: UpscaleMode; model: string; vae: string; lbhModel: string; missingNodes: readonly string[] }
  /* `model`/`vae` fed the removed LTX 2× mode (Phase 0, 2026-09-20) and are
   * kept as always-empty fields so callers stay shape-stable. */
  /** The chosen AI-upscale model (RTX path) — the old surface reads it from
   *  the workspace store, the canvas from chain settings. */
  rtxModel: string
  firstFrame: MediaFile | null
  lastFrame: MediaFile | null
  /** Ordered, policy-resolved reference images (≤9). */
  referenceImages: MediaFile[]
  referenceVideos: MediaFile[]
  referenceAudios: MediaFile[]
  timelineGuides: Array<{ file: MediaFile; seconds: number }>
  livePreview: { enabled: boolean; mode: 'standard' | 'h3-override' }
  /** Latent-chaining facts (canvas Phase 4): when present the graph saves its
   *  sampler latent (and loads + trims a continuation when index > 0) — the
   *  Motion-Context machinery. The manifest records the SAVED clip so the
   *  landed take can carry its forkable latent facts. */
  chain?: { index: number; folder: string; contextLength?: '5' | '22' | '39' | '56'; audioContextLength?: number; loadFrom?: { folder: string; clipIndex: number } }
  /** Extra provenance merged into the persisted manifest (the canvas records
   *  the chain/project a render belongs to so a reload can relink). */
  manifestExtra?: Record<string, unknown>
  filenamePrefix?: string
  movieLink?: GenerationJob['movieLink']
  characterProjectId?: string
  /** The location a render belongs to (the Phase-4 walkthrough migration —
   *  jobRecords' automation display keys on it). */
  locationProjectId?: string
}

/** The engine/session facts a submission needs — supplied by whichever
 *  surface is submitting (the hook reads its facades; the canvas reads the
 *  session store through its engine host). */
export type H3SubmitFacts = {
  settings: AppSettings
  connected: boolean
  modelReady: boolean
  /** H3 component selection for the request's turbo tier (inferSelections). */
  selection: ModelSelection
  models: ModelFile[]
  info: ObjectInfo
  clientId?: string
  /** Detected H3 Preview Override node class, when installed. */
  h3PreviewOverrideNode?: string
  /** Model-override resolution for the monoka family when the caller
   *  consulted overrides building `selection` (task euxwdva): refused slots
   *  refuse the submission with their reason; degraded slots fell back to
   *  auto and surface their warning visibly. Absent = no overrides were
   *  consulted (the pre-override behavior exactly). */
  modelOverrides?: OverrideResolution
}

export type H3SubmitIo = {
  notify(tone: 'error' | 'success' | 'neutral', text: string): void
  setJobs(update: (current: GenerationJob[]) => GenerationJob[]): void
  /** The queue's cancellation-request set (cancel-before-submit races). */
  cancellationRequests: { current: Set<string> }
  /** The old surface tracks its active job in the workspace store. */
  onJobCreated?(jobId: string): void
}

/** The A-DBG junction on the preview path (maintainer ruling 2026-09-22, after
 *  their session's preview crash: "We likely need to use that node for the
 *  preview decoding, it's a fairly solid node"). When the PreviewOverride
 *  pack's node is served by the engine AND a taeh3 decoder file is present in
 *  vae_approx, the pack OWNS preview decoding for every live-preview render:
 *  its OUTER_SAMPLE wrapper decodes the video latent itself (tiny-VAE loaded
 *  explicitly by name, channel-checked, Latent2RGB fallback at every level)
 *  and emits the minimax_h3_preview_override stream the realtime hub already
 *  forwards — the server correspondingly skips the stock preview_method
 *  'taesd' request for graphs carrying the node (the fragile class: the
 *  engine's latent_preview constructs a TAEHV previewer from whatever
 *  arbitrary taeh3* file wins the prefix match). (r3q1o49) Pack absent (or no
 *  decoder file) means previews-OFF — the stock vae_approx fallback IS the
 *  null-previewer crash class: on a fresh engine the whole job dies at ~1%
 *  when latent_preview's previewer construction fails, and the submit never
 *  sends a stock preview request for it. Mode 'h3-override' stays the strict
 *  explicit path (its validation refusals are unchanged); mode 'standard'
 *  ROUTES — the pack when present, no previews when not. Pure — VM-harness
 *  tested. */
export function resolvePreviewOverride(
  livePreview: H3RenderRequest['livePreview'],
  facts: Pick<H3SubmitFacts, 'h3PreviewOverrideNode'> & { selection: Pick<ModelSelection, 'previewVae'> },
): { frames: number; fps: number; nodeType: string; vaeName: string; jpegQuality: number } | undefined {
  if (!livePreview.enabled) return undefined
  // (A-DBG, journey sweep #3 — audit M6/C7's RCA): the routing junction is
  // named at decision time. The audit observed "the pack never engaged on
  // the mirror" — the RCA (verified against e2e/mirror, 2026-09-26) is that
  // this resolver is CORRECT when the live facts are honest: it needs BOTH
  // the pack's node class (object_info) AND a preview decoder the REGISTRY
  // lists (selection.previewVae — a model-registry inference over vae_approx).
  // The audit's walk rode a stale registry window, where previewVae resolved
  // empty and the pack silently didn't engage. The junction below makes that
  // silent drop visible in the debug transcript instead.
  if (!facts.h3PreviewOverrideNode) {
    dbg('route', { verdict: 'preview-off', reason: 'pack-node-absent', previewVae: facts.selection.previewVae || '' })
    return undefined
  }
  if (!facts.selection.previewVae) {
    dbg('route', { verdict: 'preview-off', reason: 'decoder-absent-from-registry', packNode: facts.h3PreviewOverrideNode })
    return undefined
  }
  dbg('route', { verdict: 'preview-pack', node: facts.h3PreviewOverrideNode, vaeName: facts.selection.previewVae })
  return { frames: 50, fps: 12, nodeType: facts.h3PreviewOverrideNode, vaeName: facts.selection.previewVae, jpegQuality: 85 }
}

/**
 * The validation ladder, same order and same messages as the pre-extraction
 * hook: upscale readiness → prompt → connection → models → preview override →
 * per-mode media → reference limits → keyframe guides. Returns the refusal
 * message, or null when the request may proceed. Pure — VM-harness tested
 * without an engine.
 */
export function validateH3Render(request: H3RenderRequest, facts: Pick<H3SubmitFacts, 'connected' | 'modelReady' | 'selection' | 'h3PreviewOverrideNode' | 'modelOverrides' | 'info'>): string | null {
  const { upscale } = request
  if (upscale.mode === 'rtx' && !request.rtxModel) {
    return 'Choose an AI upscale model installed in ComfyUI first.'
  }
  if ((upscale.mode === 'lbh2d' || upscale.mode === 'lbh3d') && !upscale.lbhModel) {
    return 'Install an H3 latent upscaler model into ComfyUI/models/latent_upscale_models (LBH-123-AI release), then refresh the engine.'
  }
  if (!request.prompt.trim()) return 'Add a prompt before generating.'
  if (!facts.connected) return 'Start ComfyUI and verify the server connection in Settings.'
  // Model overrides (task euxwdva): a wrong-kind pick refuses BEFORE the
  // readiness rung — the render never ships a graph the family contract
  // rejects. Degraded picks (file gone since set) already fell back to auto
  // and only warn, at submit. (R-06) The refusal NAMES THE LAYER the pick
  // lives on — a wedged override is invisible otherwise. Migrated legacy
  // picks never reach this rung: they auto-clear with a warning (ruling D3).
  const overrideRefusal = facts.modelOverrides?.refusals[0]
  if (overrideRefusal) {
    const origin = overrideRefusal.layer === 'chain' ? "this chain's pick — clear it in the properties panel" : 'the global Settings pick — clear it in Settings → Model overrides'
    return `Model override refused — ${overrideRefusal.slot} (${origin}): ${overrideRefusal.reason}`
  }
  // The VDN rungs (task 9up52mj) run BEFORE the stack-membership rung
  // (perfect-state sweep 2026-09-27, W3): modelReady folds the VDN stage in
  // through h3StackReady, so a missing STAGE used to trip the generic
  // membership line below first and this rung's named, fetchable guidance —
  // the pack row, the Library fetch row — never reached the user. The XOR
  // refusal leads (both accelerations selected is a contradiction, never
  // silently resolved), then the honest environment absences — the pack,
  // then the rung's stage (the engine's own vdn_checkpoint enumeration; the
  // fetch rows are named so the refusal is a path, not a dead end). No
  // snapshot leaves these rungs to the resolver (the arm stays inert there
  // and the connection rung owns the cause).
  if (request.vdn && request.vdn !== 'off') {
    if (request.turbo !== 'off') {
      return 'VDN and the turbo tier are both selected — they are alternate acceleration patches on the same model slot. The VDN stage carries its own distilled adapter: turn the speed tier off, or set VDN off.'
    }
    if (facts.info) {
      const availability = vdnAvailability(facts.info)
      if (!availability.packPresent) {
        return 'VDN is selected but the engine does not serve its ApplyVDNH3 node — install the vdn-h3 pack from the Packs board and refresh the engine.'
      }
      if (request.vdn === 'dmd-8' && !availability.dmd) {
        return 'VDN 8-step needs a stage-dmd directory under ComfyUI/models/vdn — fetch it in the Library (row vdn-stage-dmd-250, ~5.5 GB) and refresh the engine.'
      }
      if (request.vdn === 'stage-b-50' && !availability.stageB) {
        return 'VDN 50-step needs a stage-b directory under ComfyUI/models/vdn — fetch it in the Library (row vdn-stage-b-2000, ~4.6 GB) and refresh the engine.'
      }
    }
  }
  // The tier-honesty rung (task g1girm8, R2 F3): a selected fast tier whose
  // lane LoRA the inference ladder cannot resolve refuses BY NAME, with ONE
  // truthful path — publisher source, placement, refresh — plus the working
  // Quality alternative. Runs BEFORE the membership rung (same W3 ordering
  // as the VDN rungs: a named cause must not be buried in the generic
  // list), and replaces the old behavior where the turbo line rode the
  // shared membership list and its tail promised "Settings → Fetchable
  // items" — a destination with zero turbo LoRA rows, rendered on the same
  // screen as the panel's own "not fetchable" note. The trigger is the
  // tier EXPLICITLY selected ('4'/'8' — an absent turbo field is not a
  // selected tier; the old `!== 'off'` check fired on undefined). The
  // facts.selection is resolved at the SUBMITTED tier (store.ts
  // selectionFor), so an empty lane LoRA here is exactly the ladder's
  // verdict for this tier.
  if ((request.turbo === '4' || request.turbo === '8') && !(request.mode === 'reference' ? facts.selection?.ref2vLora : facts.selection?.fl2vLora)) {
    return turboTierRefusal(request.turbo, request.mode)
  }
  if (!facts.modelReady) {
    // (W3, same sweep) The membership refusal COMPOSES from the resolved
    // rows — the same membership h3StackReady gates on, narrated per row —
    // instead of the old blanket "components are missing" that named
    // nothing. Weights rows name what to make visible AND where; the
    // engine-side check names the node classes weights cannot fix.
    const missing: string[] = []
    const lane = request.mode === 'reference' ? facts.selection?.ref2va : facts.selection?.fl2va
    if (!lane) missing.push(request.mode === 'reference' ? 'the Ref2VA checkpoint (place the reference-lane diffusion model in the engine\'s diffusion_models folder)' : 'the FL2VA checkpoint (place a diffusion model whose name contains "fl2va" in the engine\'s diffusion_models folder)')
    if (!facts.selection?.textEncoder) missing.push('the 32B-class text encoder (place a qwen3vl_32b encoder in the engine\'s text_encoders folder)')
    if (!facts.selection?.videoVae) missing.push('the video VAE (place a VAE whose name contains "video_vae" in the engine\'s vae folder)')
    if (!facts.selection?.audioVae) missing.push('the audio VAE (place a VAE whose name contains "audio_vae" in the engine\'s vae folder)')
    const missingNodes = missingCoreNodeClasses(facts.info, 'h3-video')
    if (missingNodes.length) missing.push(`the engine's H3 node classes (${missingNodes.map((entry) => entry.className).join(', ')}) — weights cannot fix this; update ComfyUI or install the missing packs`)
    if (missing.length) {
      const list = missing.length === 1 ? missing[0]! : `${missing.slice(0, -1).join(', ')}, and ${missing[missing.length - 1]!}`
      return `The H3 stack is incomplete — the render is missing ${list}. Refresh the engine once the files are in place.`
    }
    return 'One or more required MiniMax H3 model components are missing.'
  }
  // (eyzcev5) The TE dimension-class rung: the crash class the readiness
  // chip CANNOT see — a wrong-family TE resolves NON-EMPTY (the loosened
  // 'qwen3vl' anchor takes best-available), so modelReady stays true and
  // the doomed graph would submit. The family-registry expectation refuses
  // it here with the named reason (the maintainer's 2026-09-22 session:
  // mat1 171x2560 × mat2 5120x5376 at preprocess_text_embeds, 27 s into a
  // real render). Correct picks pass untouched — a guard, not a reroute.
  const teClassRefusal = facts.selection?.textEncoder ? teDimClassRefusal('monoka', facts.selection.textEncoder) : null
  if (teClassRefusal) return `Model resolution refused — textEncoder: ${teClassRefusal}`
  if (request.livePreview.enabled && request.livePreview.mode === 'h3-override' && !facts.h3PreviewOverrideNode) {
    return 'MiniMax H3 animated preview is selected, but its Preview Override node was not detected. Install or enable the custom node, restart ComfyUI, then click the Local engine status to refresh.'
  }
  if (request.livePreview.enabled && request.livePreview.mode === 'h3-override' && !facts.selection.previewVae) {
    return 'MiniMax H3 animated preview requires taeh3_decoder.safetensors in ComfyUI/models/vae_approx. Refresh the Local engine after adding it.'
  }
  if ((request.mode === 'image' || request.mode === 'frames') && !request.firstFrame) {
    return 'Choose a first frame for this mode.'
  }
  if (request.mode === 'frames' && !request.lastFrame) {
    return 'Choose a last frame for first-and-last-frame generation.'
  }
  if (request.mode === 'reference' && request.referenceImages.length + request.referenceVideos.length + request.referenceAudios.length === 0) {
    return 'Add at least one reference image, video, or audio file.'
  }
  if (request.mode === 'reference' && (request.referenceImages.length > 9 || request.referenceVideos.length > 3 || request.referenceAudios.length > 3)) {
    return 'Reference limits are 9 pictures, 3 videos, and 3 audio files. Remove extras before rendering.'
  }
  const invalidGuide = request.timelineGuides.find((guide) => guideFrameWarning(guide.seconds, request.duration))
  if (request.mode === 'reference' && invalidGuide) {
    return guideFrameWarning(invalidGuide.seconds, request.duration)!
  }
  return null
}

/**
 * Validates, uploads, builds, and submits one H3 render through the shared
 * queue bookkeeping. Never parks a job when validation refuses — the caller
 * surfaces the returned message (both surfaces route it through their notice
 * tier). On success the job is already in jobsStore with status running;
 * on submission failure the job record flips to failed with the reason.
 */
export async function submitH3Render(
  request: H3RenderRequest,
  facts: H3SubmitFacts,
  io: H3SubmitIo,
): Promise<{ ok: true; jobId: string } | { ok: false; message: string }> {
  const refusal = validateH3Render(request, facts)
  if (refusal) {
    dbg('submit', { verdict: 'refused-at-validate', family: 'monoka', mode: request.mode, reason: refusal.slice(0, 160) })
    io.notify('error', refusal)
    return { ok: false, message: refusal }
  }
  const { settings } = facts
  // (r3q1o49) The preview gate resolves ONCE and drives three decisions: the
  // graph's override node, the wire-level preview request, and the job
  // record's honest note. Stock taesd previews are NEVER requested — the
  // pack-absent fallback is previews-off (the stock request is the
  // null-previewer crash class that kills whole jobs on fresh engines).
  const previewOverride = resolvePreviewOverride(request.livePreview, facts)
  // Degraded overrides (the picked file vanished from the registry) proceed on
  // auto — visibly: the warning rides the notice tier right where the render
  // starts, never a silent swap.
  for (const warning of facts.modelOverrides?.warnings ?? []) io.notify('neutral', warning)
  io.notify('neutral', 'Uploading inputs and preparing the ComfyUI graph…')
  const upscale = request.upscale
  const localId = createId()
  const job: GenerationJob = {
    id: localId,
    mode: request.mode,
    prompt: request.prompt,
    createdAt: Date.now(),
    status: 'queued',
    progress: 2,
    progressLabel: 'Preparing and uploading inputs',
    width: request.width * (upscale.mode === 'off' ? 1 : 2),
    height: request.height * (upscale.mode === 'off' ? 1 : 2),
    duration: request.duration,
    movieLink: request.movieLink,
    characterProjectId: request.characterProjectId,
    locationProjectId: request.locationProjectId,
    // (r3q1o49) The render wanted previews but this engine has no verified
    // preview path — noted where the live-preview state renders.
    ...(request.livePreview.enabled && !previewOverride ? { previewUnavailable: true } : {}),
  }
  io.setJobs((current) => [job, ...current])
  io.onJobCreated?.(localId)
  try {
    const upload = async (file: MediaFile, fitToOutput = false) => file.kind === 'image' && (fitToOutput || Boolean(file.crop))
      ? window.monoka.uploadImageData(settings.comfyUrl, await prepareImage(file, request.width, request.height))
      : window.monoka.uploadInput(settings.comfyUrl, file.path)
    // REFERENCE PREP (maintainer ruling 2026-09-26, directive 1e363ec0 item
    // 5): reference pictures NEVER ride the output-fit path — the longest
    // edge scales to the selected resolution's longest side, aspect
    // preserved, cropping forbidden. The conditioning node takes
    // unconstrained IMAGE refs and scales them itself (ref_image_size
    // 'match'/'max'), so the cover-crop the output-fit path applies destroyed
    // reference content for nothing. First/last frames and timeline guides
    // stay output-fit: they anchor literal frames of the OUTPUT video.
    const targetLongestSide = Math.max(request.width, request.height)
    const uploadReference = async (file: MediaFile) => {
      if (file.kind !== 'image') return window.monoka.uploadInput(settings.comfyUrl, file.path)
      const data = await prepareReferenceImage(file, targetLongestSide)
      // (A-DBG) The ruled scaling decision, per reference: what the engine
      // receives and why (region = a user zoom window, never a fit).
      dbg('prep.reference', { name: file.name, targetLongestSide, cropped: Boolean(file.crop), bytes: data.length })
      return window.monoka.uploadImageData(settings.comfyUrl, data)
    }
    const guides = request.mode === 'reference' ? request.timelineGuides : []
    const [first, last, images, videos, audios, guideUploads] = await Promise.all([
      request.firstFrame && (request.mode === 'image' || request.mode === 'frames') ? upload(request.firstFrame, true) : undefined,
      request.lastFrame && request.mode === 'frames' ? upload(request.lastFrame, true) : undefined,
      Promise.all(request.mode === 'reference' ? request.referenceImages.map((file) => uploadReference(file)) : []),
      Promise.all(request.mode === 'reference' ? request.referenceVideos.map((file) => upload(file)) : []),
      Promise.all(request.mode === 'reference' ? request.referenceAudios.map((file) => upload(file)) : []),
      Promise.all(guides.map(({ file }) => upload(file))),
    ])
    if (io.cancellationRequests.current.has(localId)) throw new Error('Generation cancelled before submission.')
    const filenamePrefix = request.filenamePrefix ?? `video/MiniMax_H3_${Date.now()}`
    const graph = buildMonokaWorkflow({
      mode: request.mode,
      prompt: request.prompt,
      width: request.width,
      height: request.height,
      duration: request.duration,
      seed: request.seed,
      steps: request.steps,
      turbo: request.turbo,
      vdn: request.vdn,
      experimentalSampling: request.experimentalSampling,
      loraStrength: request.loraStrength,
      sampler: request.experimentalSampling ? request.sampler : 'res_multistep',
      scheduler: request.experimentalSampling ? request.scheduler : 'simple',
      upscale: upscale.mode === 'rtx' ? { type: 'rtx', model: request.rtxModel } : upscale.mode === 'lbh2d' || upscale.mode === 'lbh3d' ? { type: upscale.mode, model: upscale.lbhModel } : undefined,
      refImageSize: request.refImageSize,
      sigmaShift: request.sigmaShift,
      previewOverride,
      filenamePrefix,
      firstFrame: request.firstFrame?.path,
      lastFrame: request.lastFrame?.path,
      referenceImages: request.referenceImages.map((item) => item.path),
      referenceVideos: request.referenceVideos.map((item) => item.path),
      referenceAudios: request.referenceAudios.map((item) => item.path),
      timelineGuides: guides.length ? guides.map((guide) => ({ frameIndex: frameIndexForSeconds(guide.seconds) })) : undefined,
      turboLoader: request.turboLoader,
      ...(request.loraStack?.length ? { loraStack: request.loraStack } : {}),
      chain: request.chain,
    }, facts.selection, { first, last, images, videos, audios, guides: guideUploads }, facts.info)
    // R-02 preflight (Wave 1): the built graph's class_types diffed against
    // the engine's object_info BEFORE submission — a missing class refuses
    // here with its pack row, instead of a mangled engine 400 after the
    // fact. Throws inside this try, so the job fails with the readable list.
    const preflight = preflightOrFail(graph, facts.info, 'preflight.h3video')
    if (preflight) throw new Error(preflight)
    const manifest = buildRenderManifest({
      mode: request.mode, prompt: request.prompt, width: request.width, height: request.height, duration: request.duration,
      seed: request.seed, steps: request.steps, turbo: request.turbo, vdn: request.vdn, experimentalSampling: request.experimentalSampling,
      loraStrength: request.loraStrength,
      sampler: request.experimentalSampling ? request.sampler : 'res_multistep', scheduler: request.experimentalSampling ? request.scheduler : 'simple',
      refImageSize: request.refImageSize, sigmaShift: request.sigmaShift,
      upscale: upscale.mode === 'off' ? undefined : { type: 'rtx', model: request.rtxModel },
      referenceImages: request.referenceImages.map((item) => item.path), referenceVideos: request.referenceVideos.map((item) => item.path), referenceAudios: request.referenceAudios.map((item) => item.path),
      timelineGuides: guides.length ? guides.map((guide) => ({ frameIndex: frameIndexForSeconds(guide.seconds) })) : undefined,
      filenamePrefix,
    }, facts.selection, facts.models, settings.comfyUrl, graph)
    // Override provenance (task euxwdva): which slots rode an explicit pick.
    // manifest.models above already records the RESOLVED filenames; this
    // record says which of them were picks rather than inference.
    const appliedSlots = facts.modelOverrides ? Object.keys(facts.modelOverrides.applied) : []
    if (appliedSlots.length) manifest.modelOverrides = { ...facts.modelOverrides!.applied }
    // The saved-clip facts ride the manifest's motionContext record — the
    // take-landing path reads them to persist forkable latent provenance.
    if (request.chain) manifest.motionContext = { folder: request.chain.folder, clipIndex: request.chain.index }
    // The temporal LoRA stack rides as its own record (7twfk6o) — take
    // landing copies it into metrics.loras beside the turbo LoRA the models
    // record already carries, so every take states WHICH LoRAs were active.
    if (request.loraStack?.length) manifest.loraStack = request.loraStack.map((entry) => ({ ...entry }))
    if (request.manifestExtra) Object.assign(manifest, request.manifestExtra)
    // livePreview rides the submission (the server asks the engine for
    // native sampler previews via extra_data.preview_method — EXCEPT when
    // the graph carries the pack's preview-override node, where the pack's
    // own minimax_h3_preview_override stream owns previews and the stock
    // request is deliberately skipped server-side). (r3q1o49) The gate: the
    // request goes out ONLY when the pack's override resolved — a pack-absent
    // engine gets NO preview request (the stock taesd request is the
    // null-previewer crash class), never silently: the job record notes
    // previews are unavailable. clientId stays for interface compatibility —
    // the server pins its own session id.
    const response = await window.monoka.submitPrompt(settings.comfyUrl, graph, facts.clientId, request.livePreview.enabled && previewOverride !== undefined)
    if (io.cancellationRequests.current.has(localId)) {
      await window.monoka.cancelPrompt(settings.comfyUrl, response.prompt_id)
      io.setJobs((current) => current.map((item) => item.id === localId ? { ...item, promptId: response.prompt_id, status: 'cancelled', error: undefined } : item))
      io.notify('success', 'Generation cancelled.')
    } else {
      // (ewtobuh, ij878ap) The engine just accepted the prompt — the honest
      // state is QUEUED, not "running": it starts executing when the
      // engine's own execution_start arrives, and until then the label says
      // queued (the queue-position wording arrives with the engine's
      // queue-status broadcasts).
      io.setJobs((current) => current.map((item) => item.id === localId ? { ...item, promptId: response.prompt_id, status: 'queued', progress: 0, progressLabel: QUEUED_LABEL, manifest, graph } : item))
      io.notify('success', 'Generation added to the local ComfyUI queue.')
      dbg('submit', { verdict: 'submitted', family: 'monoka', mode: request.mode, jobId: localId, promptId: response.prompt_id, nodes: Object.keys(graph).length })
    }
    return { ok: true, jobId: localId }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const cancelled = io.cancellationRequests.current.has(localId)
    io.setJobs((current) => current.map((item) => item.id === localId ? cancelled ? { ...item, status: 'cancelled', error: undefined } : { ...item, status: 'failed', error: message } : item))
    io.notify(cancelled ? 'success' : 'error', cancelled ? 'Generation cancelled.' : message)
    return { ok: false, message }
  } finally {
    io.cancellationRequests.current.delete(localId)
  }
}
