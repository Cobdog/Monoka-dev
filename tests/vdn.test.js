/** VDN acceleration suite (task 9up52mj — the 2026-09-26 FINISH ruling:
 * "we adopt it entirely as our own"). The vendored ComfyUI-VDN-H3 tree is
 * first-party now, and this proves the graph lane that ruling finished:
 *
 *  (a) EMISSION — the H3 video factory emits ApplyVDNH3 (the adopted pack's
 *      base node) as a per-chain acceleration rung: dmd-8 (stage-dmd*,
 *      apply_turbo_adapter on, 8 steps, the pack's measured er_sde/beta
 *      pairing) and stage-b-50 (stage-b*, adapter off, the user's steps on
 *      the official sampler pair). The node wraps the model chain FIRST —
 *      between the UNet and everything else, the position the pack's own
 *      example workflow and README prescribe.
 *  (b) THE XOR RULE — VDN and the turbo tier are alternate acceleration
 *      patches on the same model slot (the registry's stated rule): both
 *      requested is an invariant violation that THROWS at the resolver and
 *      refuses readably at the validation ladder — never a silent drop, and
 *      never a double-distilled graph.
 *  (c) PRESENCE GATING — the pack is detected through the R5 presenceRule
 *      machinery (packPresence over the vdn-h3 row) and the STAGE through
 *      the engine's own vdn_checkpoint enum (object_info truth — the app
 *      never mirrors the models/vdn walk). Absent pack or stage = the arm
 *      stays inert with the reason junctioned, and the ladder refuses with
 *      install/fetch guidance naming the catalog rows.
 *  (d) INERTNESS — vdn 'off' (or an unavailable engine) rebuilds the exact
 *      pre-VDN graph: the registry's byte-contract.
 *  (e) READINESS + THREADING — h3StackReady's one membership rule gains the
 *      vdn arm (engine-side members, no turbo-LoRA member), the canvas chain
 *      settings carry the rung through the request into the graph, and the
 *      manifest records the active rung.
 *  (f) ENGINE-CONTRACT TRUTH — the fixture serves ApplyVDNH3 +
 *      ApplyVDNH3Advanced source-derived from OUR vendored tree (it is our
 *      code now), vdn_checkpoint honestly emptied as the
 *      environment-enumerated combo it is, and the emitted arms validate
 *      clean against those real schemas.
 *  (g) PROFILE WIRING — the vdn launch profile carries no env by default
 *      and asks for the consent-gated LongCache patch; VDN-proper composes
 *      with the patch degraded (the patch record's own degradesTo).
 *
 * VM harness — no engine, no python, no GPU. The measured speed/quality arm
 * is GPU-queued separately (see the task the closure names). */
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadTs } = require('../scripts/lib/ts-vm.cjs')

const workflow = loadTs('src/lib/workflow.ts')
const graph = loadTs('src/lib/graph/index.ts')
const vdnModule = loadTs('src/lib/graph/vdn.ts')
const packs = loadTs('src/lib/nodePackRegistry.ts')
const h3Stack = loadTs('src/lib/h3Stack.ts')
const engineProfiles = loadTs('server/engineProfiles.ts')
const enginePatch = loadTs('server/enginePatch.ts')
const localStorageStub = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
const h3Submit = loadTs('src/lib/h3Submit.ts', { localStorage: localStorageStub })
const generation = loadTs('src/canvas/generation.ts', { localStorage: localStorageStub, window: { dispatchEvent: () => undefined, addEventListener: () => undefined } })

const { buildMiniMaxWorkflow } = workflow

function ok(condition, message) {
  assert.ok(condition, message)
}
/** Canonical JSON comparison — cross-realm deepEqual is unreliable in this
 *  harness (the registry suite's own lesson); canonical strings are exact. */
function canon(value) {
  if (Array.isArray(value)) return '[' + value.map(canon).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => JSON.stringify(key) + ':' + canon(value[key]))
      .join(',') + '}'
  }
  return JSON.stringify(value)
}
function eq(actual, expected, message) {
  assert.equal(canon(actual), canon(expected), `${message} (got: ${canon(actual)})`)
}

// ---------------------------------------------------------------------------
// Fixtures: object_info shapes the engine would serve.
// ---------------------------------------------------------------------------
const node = (input) => ({ input: { required: input } })

/** The pack served with BOTH fetch-row stages enumerated by the engine. */
const VDN_INFO = {
  ApplyVDNH3: node({ vdn_checkpoint: [['stage-b-step-2000', 'stage-dmd-step-250']] }),
}
/** Pack served but models/vdn empty — the node's own placeholder combo. */
const VDN_NO_STAGE_INFO = {
  ApplyVDNH3: node({ vdn_checkpoint: [['<place a VDN stage-... directory under models/vdn>']] }),
}
/** A served stage spread with an int8 sibling (the engine's sorted enum). */
const VDN_INT8_INFO = {
  ApplyVDNH3: node({ vdn_checkpoint: [['stage-dmd-step-250', 'stage-dmd-step-250-int8_convrot_comfyui']] }),
}

const MODELS = {
  fl2va: 'fl2va.safetensors', ref2va: 'ref2va.safetensors', textEncoder: 'clip.safetensors',
  videoVae: 'video.safetensors', audioVae: 'audio.safetensors', previewVae: '',
  fl2vLora: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', ref2vLora: 'ref-lora.safetensors',
}
const BASE = {
  mode: 'text', prompt: 'neutral test', width: 352, height: 608, duration: 5, seed: 123, steps: 30,
  turbo: 'off', sampler: 'heun', scheduler: 'karras', refImageSize: 'match', filenamePrefix: 'test',
}
const noUploads = { images: [], videos: [], audios: [] }
function build(options, info) {
  return buildMiniMaxWorkflow({ ...BASE, ...options }, MODELS, noUploads, info)
}

// ---------------------------------------------------------------------------
test('(a) emission — the dmd-8 rung wraps the model chain with the released-model defaults', () => {
  const graph_plan = vdnModule.resolveVdnPlan({ vdn: 'dmd-8', turbo: 'off', info: VDN_INFO })
  ok(graph_plan && graph_plan.stage === 'stage-dmd-step-250', 'the dmd-8 plan resolves the engine-enumerated stage')
  const g = build({ vdn: 'dmd-8' }, VDN_INFO)
  const apply = g['29']
  ok(apply && apply.class_type === 'ApplyVDNH3', 'node 29 is ApplyVDNH3 (the adopted pack\'s base node)')
  eq(apply.inputs.model, ['1', 0], 'the VDN wrap consumes the UNet directly (first in the chain — the pack\'s own example position)')
  eq(apply.inputs.vdn_checkpoint, 'stage-dmd-step-250', 'the engine-enumerated stage name rides verbatim')
  eq(apply.inputs.apply_turbo_adapter, true, 'dmd-8 applies the distilled turbo adapter (the released 8-step model)')
  eq(apply.inputs.strength, 1, 'strength 1.0 is the released model')
  eq(apply.inputs.lora_mode, 'merge', 'lora_mode merge — REQUIRED for 8-step DMD checkpoints per the node\'s own tooltip')
  eq(apply.inputs.branch_weights, 'auto', 'branch_weights auto — the node owns the memory policy')
  eq(apply.inputs.retain_buffers, 'auto', 'retain_buffers auto — present (a required input; the form-adapter low_vram lesson)')
  eq(apply.inputs.verbose, false, 'verbose off')
  eq(apply.inputs.attention_backend, 'grouped', 'attention_backend grouped (portable, exact)')
  ok(g['5'] === undefined, 'no turbo LoRA loader rides a VDN render (the XOR rule, graph-side)')
  eq(g['12'].inputs.model, ['29', 0], 'the guider consumes the VDN-wrapped model')
  eq(g['14'].inputs.model, ['29', 0], 'the scheduler consumes the VDN-wrapped model')
  eq(g['14'].inputs.steps, 8, 'the dmd-8 pairing forces 8 sampler steps')
  eq(g['13'].class_type, 'KSamplerSelect', 'the stock sampler select is kept (no pack sampler)')
  eq(g['13'].inputs.sampler_name, 'er_sde', 'the dmd-8 pairing runs er_sde (the pack\'s measured pairing)')
  eq(g['14'].inputs.scheduler, 'beta', 'the dmd-8 pairing runs the beta scheduler')
})

test('(a) emission — the stage-b-50 rung keeps the user\'s steps and the official sampler pair', () => {
  const g = build({ vdn: 'stage-b-50', steps: 50 }, VDN_INFO)
  const apply = g['29']
  ok(apply && apply.class_type === 'ApplyVDNH3', 'node 29 is ApplyVDNH3')
  eq(apply.inputs.vdn_checkpoint, 'stage-b-step-2000', 'the 50-step rung resolves the stage-b directory')
  eq(apply.inputs.apply_turbo_adapter, false, 'adapter off — the 50-step model (the stage carries no turbo adapter)')
  eq(g['14'].inputs.steps, 50, 'the user\'s step count owns the 50-step rung')
  eq(g['13'].inputs.sampler_name, workflow.OFFICIAL_H3_SAMPLER, 'official sampler pair kept (the undistilled model\'s pairing)')
  eq(g['14'].inputs.scheduler, workflow.OFFICIAL_H3_SCHEDULER, 'official scheduler kept')
})

test('(a) emission — the LoRA user stack and preview override compose after the VDN wrap', () => {
  const g = build({
    vdn: 'dmd-8',
    loraStack: [{ name: 'style.safetensors', strength: 0.7 }],
    previewOverride: { frames: 24, fps: 12, nodeType: 'MiniMaxH3PreviewOverride', vaeName: 'taeh3.safetensors' },
  }, VDN_INFO)
  ok(g['8'] && g['8'].class_type === 'LoraLoaderModelOnly', 'the user LoRA stack still loads')
  eq(g['8'].inputs.model, ['29', 0], 'the user stack chains AFTER the VDN wrap (the README\'s unchanged-LoRAs position)')
  ok(g['7'] && g['7'].inputs.model.join('|') === '8|0', 'the preview override still wraps the chain tail')
  eq(g['12'].inputs.model, ['7', 0], 'the guider sees the full chain')
})

test('(a) emission — the stage pick prefers the plain stage over its int8 sibling', () => {
  const g = build({ vdn: 'dmd-8' }, VDN_INT8_INFO)
  eq(g['29'].inputs.vdn_checkpoint, 'stage-dmd-step-250', 'sorted-first (the plain bf16 stage) wins when both variants are served')
  const onlyInt8 = { ApplyVDNH3: node({ vdn_checkpoint: [['stage-dmd-step-250-int8_convrot_comfyui']] }) }
  eq(build({ vdn: 'dmd-8' }, onlyInt8)['29'].inputs.vdn_checkpoint, 'stage-dmd-step-250-int8_convrot_comfyui', 'an int8-only serving resolves the int8 stage')
})

// ---------------------------------------------------------------------------
test('(b) the XOR rule — VDN and the turbo tier never ride the same graph', () => {
  assert.throws(() => vdnModule.resolveVdnPlan({ vdn: 'dmd-8', turbo: '8', info: VDN_INFO }), /exclusive|VDN/i, 'the resolver throws on the contradiction (an invariant, not an environment state)')
  assert.throws(() => build({ vdn: 'dmd-8', turbo: '8' }, VDN_INFO), /turbo/i, 'the factory throws before emitting a double-distilled graph')

  const template = {
    mode: 'text', prompt: 'a lone drummer', width: 1344, height: 768, duration: 6, seed: 1, steps: 30,
    turbo: 'off', turboLoader: 'auto', experimentalSampling: false, loraStrength: 1, sampler: 'res_multistep', scheduler: 'simple',
    refImageSize: 'match', upscale: { mode: 'off', model: '', vae: '', lbhModel: '', missingNodes: [] }, rtxModel: '',
    firstFrame: null, lastFrame: null, referenceImages: [], referenceVideos: [], referenceAudios: [], timelineGuides: [],
    livePreview: { enabled: false, mode: 'standard' },
  }
  const facts = { connected: true, modelReady: true, selection: { previewVae: '' }, h3PreviewOverrideNode: undefined, info: VDN_INFO }
  const refusal = h3Submit.validateH3Render({ ...template, vdn: 'dmd-8', turbo: '8' }, facts)
  ok(refusal && /VDN.*turbo|turbo.*VDN/i.test(refusal), `the ladder refuses both-selected readably (got: ${refusal})`)
  eq(h3Submit.validateH3Render({ ...template, vdn: 'dmd-8' }, facts), null, 'a coherent VDN request passes the ladder')
})

// ---------------------------------------------------------------------------
test('(c) presence gating — pack absent, stage absent, placeholder, no snapshot', () => {
  // Pack absent from object_info: inert + the junction reason.
  ok(vdnModule.resolveVdnPlan({ vdn: 'dmd-8', turbo: 'off', info: { KSamplerSelect: node({}) } }) === undefined, 'pack-absent resolves no plan')
  ok(build({ vdn: 'dmd-8' }, { KSamplerSelect: node({}) })['29'] === undefined, 'pack-absent emits no VDN node')
  // No snapshot at all (the offline plan surface): inert, never a guess.
  ok(vdnModule.resolveVdnPlan({ vdn: 'dmd-8', turbo: 'off' }) === undefined, 'no engine snapshot resolves no plan')
  // Pack served, models/vdn empty (the node's placeholder combo): inert.
  ok(vdnModule.resolveVdnPlan({ vdn: 'dmd-8', turbo: 'off', info: VDN_NO_STAGE_INFO }) === undefined, 'placeholder-only stage combo resolves no plan')
  ok(vdnModule.vdnAvailability(VDN_NO_STAGE_INFO).packPresent === true, 'availability still reports the pack (install truth)')
  eq(vdnModule.vdnAvailability(VDN_NO_STAGE_INFO).stages, [], 'the placeholder string is filtered out of the stage list')
  // A rung whose stage family is not served: refused with the fetch row named.
  const wrongRung = vdnModule.resolveVdnPlan({ vdn: 'stage-b-50', turbo: 'off', info: VDN_INT8_INFO })
  ok(wrongRung === undefined, 'stage-b rung without a stage-b directory resolves no plan')

  // The registry row's presence rule (R5): our graphs load the base node as
  // a deliberate subset — 'any', not 'all'.
  const row = packs.ENGINE_NODE_PACKS.find((pack) => pack.id === 'vdn-h3')
  ok(row, 'the vdn-h3 row exists')
  ok(row.presenceRule === 'any', 'the row\'s presenceRule is any (the deliberate-subset case our emission defines)')
  ok(packs.packPresence({ ApplyVDNH3: node({}) }, 'vdn-h3') === true, 'a base-node-only serving reads present')
  ok(packs.packPresence({ ApplyVDNH3Advanced: node({}) }, 'vdn-h3') === true, 'the board truth is any-match (the pack IS installed)')
  ok(packs.packPresence({}, 'vdn-h3') === false, 'no served classes reads absent')
  ok(/STUB\(wiring\)/.test(JSON.stringify(row)) === false, 'the FINISH deleted the STUB(wiring) marker from the row')

  // The validation ladder names the install/fetch path for each absence.
  const template = {
    mode: 'text', prompt: 'p', width: 352, height: 608, duration: 5, seed: 1, steps: 30,
    turbo: 'off', turboLoader: 'auto', experimentalSampling: false, loraStrength: 1, sampler: 'res_multistep', scheduler: 'simple',
    refImageSize: 'match', upscale: { mode: 'off', model: '', vae: '', lbhModel: '', missingNodes: [] }, rtxModel: '',
    firstFrame: null, lastFrame: null, referenceImages: [], referenceVideos: [], referenceAudios: [], timelineGuides: [],
    livePreview: { enabled: false, mode: 'standard' },
  }
  const baseFacts = { connected: true, modelReady: true, selection: { previewVae: '' }, h3PreviewOverrideNode: undefined }
  const packAbsent = h3Submit.validateH3Render({ ...template, vdn: 'dmd-8' }, { ...baseFacts, info: {} })
  ok(packAbsent && /ApplyVDNH3|vdn-h3|VDN pack/i.test(packAbsent), `pack-absent refuses with install guidance (got: ${packAbsent})`)
  const stageAbsent = h3Submit.validateH3Render({ ...template, vdn: 'dmd-8' }, { ...baseFacts, info: VDN_NO_STAGE_INFO })
  ok(stageAbsent && /vdn-stage-dmd-250|stage-dmd|Library|models\/vdn/i.test(stageAbsent), `stage-absent refuses naming the fetch row (got: ${stageAbsent})`)
})

// ---------------------------------------------------------------------------
test('(c) the registry entry — kind acceleration, detect honest, id stable', () => {
  const entry = graph.findOptimization('vdn.apply')
  ok(entry, 'the vdn.apply entry is registered')
  ok(entry.kind === 'acceleration', 'its kind is acceleration (the slot the schema always carried)')
  ok(entry.wraps === 'modelChain', 'it wraps the model chain')
  const detected = entry.detect(VDN_INFO, [])
  ok(detected.available === true && detected.model === 'stage-dmd-step-250', 'detect reports the engine-served stage')
  const undetected = entry.detect({}, [])
  ok(undetected.available === false, 'detect reports unavailable without the pack')
  eq(undetected.missingNodes, ['ApplyVDNH3'], 'the absent class is named for install guidance')
  const files = [{ kind: 'loras', name: 'x.safetensors' }]
  ok(entry.detect(VDN_NO_STAGE_INFO, files).available === false, 'pack without a stage is unavailable (the weights-as-data rule does not apply — stages are engine-side)')
})

// ---------------------------------------------------------------------------
test('(d) inertness — vdn off (or unavailable) rebuilds the pre-VDN graph', () => {
  const plain = build({})
  const off = build({ vdn: 'off' })
  eq(off, plain, "vdn: 'off' is byte-identical to the option absent")
  eq(build({ vdn: 'dmd-8' }, undefined), plain, 'a requested rung without a snapshot stays inert (the offline plan surface)')
  eq(build({ vdn: 'dmd-8' }, {}), plain, 'a requested rung without the pack stays inert')
  ok(plain['29'] === undefined, 'the base graph has no node 29')
})

// ---------------------------------------------------------------------------
test('(e) readiness + threading — the one membership rule and the canvas path', () => {
  const selection = {
    fl2va: 'fl2va.safetensors', ref2va: 'ref2va.safetensors', textEncoder: 'clip.safetensors',
    videoVae: 'video.safetensors', audioVae: 'audio.safetensors', fl2vLora: '', ref2vLora: '',
  }
  // The readiness fixtures need the h3-video core classes served too (the
  // predicate's existing engine-side member — R-29).
  const READY_INFO = {
    ...VDN_INFO,
    MiniMaxH3ImageToVideo: node({}), MiniMaxH3ReferenceToVideo: node({}),
    KSamplerSelect: node({}), SamplerCustomAdvanced: node({}),
  }
  const READY_NO_PACK = { MiniMaxH3ImageToVideo: node({}), MiniMaxH3ReferenceToVideo: node({}), KSamplerSelect: node({}), SamplerCustomAdvanced: node({}) }
  ok(h3Stack.h3StackReady({ selection, mode: 'text', turbo: 'off', vdn: 'dmd-8', info: READY_INFO }) === true, 'a VDN rung with pack+stage served is ready')
  ok(h3Stack.h3StackReady({ selection, mode: 'text', turbo: 'off', vdn: 'dmd-8', info: READY_NO_PACK }) === false, 'VDN without the served pack is not ready')
  ok(h3Stack.h3StackReady({ selection, mode: 'text', turbo: 'off', vdn: 'dmd-8', info: VDN_NO_STAGE_INFO }) === false, 'VDN without a served stage is not ready')
  ok(h3Stack.h3StackReady({ selection, mode: 'text', turbo: 'off', vdn: 'dmd-8' }) === true, 'no snapshot keeps the file-only verdict (the connection rung owns that refusal)')
  ok(h3Stack.h3StackReady({ selection, mode: 'text', turbo: '8', vdn: 'dmd-8', info: VDN_INFO }) === false, 'both accelerations set is not a runnable graph (membership, not narration)')

  // Canvas threading: defaults, migration, request, and the plan graph.
  const defaults = generation.chainSettingsDefaults(null)
  ok(defaults.vdn === 'off', 'chain settings default vdn off')
  const migrated = generation.readChainSettings({ vdn: 'dmd-8' })
  ok(migrated.vdn === 'dmd-8', 'a stored vdn rung migrates through')
  const request = generation.buildCanvasRenderRequest(
    { ...defaults, vdn: 'dmd-8', prompt: 'p', resolution: '352x608' },
    { firstFrame: null, lastFrame: null, referenceImages: [], referenceVideos: [], referenceAudios: [] },
    [],
  )
  ok(request.vdn === 'dmd-8', 'the render request carries the chain\'s rung')
  const plan = generation.planCanvasGraph(request, MODELS, {}, VDN_INFO)
  ok(plan['29'] && plan['29'].class_type === 'ApplyVDNH3', 'the engine-aware plan graph carries the VDN wrap')
  eq(generation.planCanvasGraph({ ...request, vdn: 'off' }, MODELS, {}, VDN_INFO)['29'], undefined, 'vdn off plans no VDN node')
})

// ---------------------------------------------------------------------------
test('(f) engine-contract truth — source-derived schemas in the fixture, emitted arms validate', () => {
  const FIXTURE = path.resolve(__dirname, '..', 'scripts', 'fixtures', 'engine-object-info.json')
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const apply = fixture.nodes.ApplyVDNH3
  const advanced = fixture.nodes.ApplyVDNH3Advanced
  ok(apply && advanced, 'the fixture serves both VDN classes')
  ok(String(apply.__sourceDerived).includes('vendor/nodes/ComfyUI-VDN-H3') && String(apply.__sourceDerived).includes('3eb6349'), 'provenance names OUR vendored tree at the pin (it is our code now)')
  eq(apply.input_order.required, ['model', 'vdn_checkpoint', 'apply_turbo_adapter', 'strength', 'lora_mode', 'branch_weights', 'retain_buffers', 'verbose', 'attention_backend'], 'the base node\'s required set is the transcribed order (all nine — every one the emission must carry)')
  eq(apply.input.required.lora_mode[0], ['bypass', 'merge'], 'lora_mode combo verbatim')
  eq(apply.input.required.branch_weights[0], ['auto', 'stream', 'cache_gpu'], 'branch_weights combo verbatim')
  eq(apply.input.required.attention_backend[0], ['grouped', 'flex'], 'attention_backend combo verbatim')
  ok(Array.isArray(apply.input.required.vdn_checkpoint[0]) && apply.input.required.vdn_checkpoint[0].length === 0, 'vdn_checkpoint is the environment-enumerated combo, honestly emptied (models/vdn is the engine\'s filesystem)')
  eq(apply.output, ['MODEL'], 'MODEL→MODEL')
  eq(advanced.input_order.required.slice(0, 4), ['model', 'vdn_checkpoint', 'apply_turbo_adapter', 'stage_b_strength'], 'the advanced node\'s per-adapter strengths transcribed')
  ok(advanced.input.optional && advanced.input.optional.fast_kernels !== undefined, 'the advanced node\'s optional ablation set transcribed (fast_kernels — the drift-flagged knob we never emit)')

  // The emitted arms validate CLEAN against the real transcribed schemas —
  // the full fixture (every class the graph loads) with only the
  // environment-enumerated vdn_checkpoint combo filled in, exactly as a
  // serving engine with both stages fetched would answer object_info.
  const contract = loadTs('src/lib/engineContract.ts')
  const stagesServed = JSON.parse(JSON.stringify(fixture.nodes))
  stagesServed.ApplyVDNH3.input.required.vdn_checkpoint = [['stage-b-step-2000', 'stage-dmd-step-250']]
  const violations = contract.validateGraphAgainstSchemas(build({ vdn: 'dmd-8' }, stagesServed), stagesServed)
  eq(violations, [], 'the dmd-8 emission validates clean against the transcribed schema (enum values, types, the link)')
  eq(contract.validateGraphAgainstSchemas(build({ vdn: 'stage-b-50', steps: 50 }, stagesServed), stagesServed), [], 'the stage-b-50 emission validates clean')

  // The capture script keeps them on regeneration.
  const capture = require('../scripts/capture-engine-schemas.cjs')
  ok(capture.PACK_CLASSES.includes('ApplyVDNH3') && capture.PACK_CLASSES.includes('ApplyVDNH3Advanced'), 'the capture script\'s pack-class list carries both VDN classes')
})

// ---------------------------------------------------------------------------
test('(g) profile wiring — the vdn launch profile and the LongCache consent gate compose', () => {
  const profile = engineProfiles.DEFAULT_ENGINE_PROFILES.vdn
  ok(profile, 'the seeded vdn profile exists')
  eq(Object.keys(profile.env), [], 'it carries no environment by default (VDN_H3_* are node-read lab toggles)')
  eq(profile.hooks, [{ kind: 'patch', patchId: 'longcache-block-loop' }], 'it asks for the LongCache block-loop patch')
  const patch = enginePatch.ENGINE_PATCHES.find((candidate) => candidate.id === 'longcache-block-loop')
  ok(patch, 'the patch record exists under the id the profile asks for')
  ok(/VDN still works/i.test(patch.degradesTo ?? ''), 'the patch degrades to working VDN without consent (VDN-proper does not need it — the composition contract)')
})
