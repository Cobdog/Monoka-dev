/** The VDN acceleration arm (task 9up52mj — the maintainer's 2026-09-26
 * FINISH ruling: "the upstream repo has been removed but we still have local
 * copies — we adopt it entirely as our own. We take on the debt of managing
 * this one, since there is no upstream to contend with").
 *
 * VDN is hybrid attention for MiniMax-H3: nearby frames keep exact softmax
 * attention while distant context rides the checkpoint's linear Video Delta
 * Attention branch — delta-attention acceleration applied as runtime model
 * patches, a different class from LoRA distillation. The vendored tree
 * (vendor/nodes/ComfyUI-VDN-H3 @ 3eb6349) is first-party now; this module
 * is its graph lane, shaped exactly like turbo.ts:
 *
 *  - the pack is detected through the ONE presence machinery (R5:
 *    packPresence over the vdn-h3 row — the row's own presenceRule);
 *  - the STAGE is read from the engine's own vdn_checkpoint combo in
 *    object_info (ApplyVDNH3's INPUT_TYPES enumerates models/vdn itself —
 *    the app never mirrors that walk; a client-side re-derivation would be
 *    exactly the shadow the central-model law forbids);
 *  - the XOR rule (the registry's stated slot rule for turbo/VDN adapters):
 *    VDN and the turbo tier are alternate acceleration patches on the same
 *    model slot. The stage-dmd rung carries its own distilled turbo adapter
 *    — stacking a turbo LoRA on top would double-distill. A rung plus a
 *    tier is therefore an invariant VIOLATION that throws here and refuses
 *    readably at the validation ladder; environment absences (no snapshot,
 *    pack not served, stage not fetched) are NOT violations — the arm stays
 *    inert with the reason junctioned, and the ladder owns the user-facing
 *    refusal. Never a silent drop in either direction.
 *
 * The emitted node is the pack's BASE class (ApplyVDNH3) with the
 * released-model defaults: the Advanced class (per-adapter strengths,
 * ablation knobs, fast_kernels) is deliberately never emitted — fast_kernels
 * is documented to drift on 8-step DMD stages (torch 2.10) and the ablations
 * deviate from the released spec. That subset emission is also why the
 * registry row's presenceRule is 'any', not 'all': our graphs load one of
 * the row's two listed classes by design (the R5 doctrine's deliberate-
 * subset case), while the pack board's any-match keeps telling the install
 * truth. */
import type { ObjectInfo } from '../comfyInfo'
import type { ComfyNode, ComfyPrompt, GraphContext, OptimizationEntry, TransformOptions, VdnPlan, VdnRung } from './types'
import { H3 } from './ids'
import { packPresence } from '../nodePackRegistry'
import { dbg } from '../dbg'

/** The emitted class (the pack's base node — see the module header). */
export const VDN_APPLY_NODE = 'ApplyVDNH3'

/** The dmd-8 rung's measured pairing (the pack's own benchmarks: 8 steps,
 * er_sde / beta — README @ 3eb6349, "VDN-H3 Turbo, er_sde / beta — 8
 * steps"). The stage-b-50 rung owns no pairing: with the adapter off the
 * model is the undistilled 50-step stack, which keeps the official
 * res_multistep/simple pair the factory pins. */
const DMD_PAIRING = { sampler: 'er_sde', scheduler: 'beta', steps: 8 } as const

/** True when the vdn-h3 pack is installed on the engine (the row's own
 * presence rule, read through the one helper — R5). */
export function vdnPackPresent(info: ObjectInfo | Record<string, unknown> | undefined): boolean {
  return packPresence(info, 'vdn-h3')
}

/** The engine's own stage enumeration: the vdn_checkpoint combo the served
 * ApplyVDNH3 node carries (its INPUT_TYPES walks models/vdn server-side).
 * The no-stage placeholder string ("<place a VDN stage-… directory…>") is
 * filtered — an empty result means the pack is served but no stage is
 * fetched. Undefined info answers the empty list (unknown, not absent). */
export function vdnStages(info: ObjectInfo | Record<string, unknown> | undefined): string[] {
  const served = info?.[VDN_APPLY_NODE] as { input?: { required?: Record<string, unknown> } } | undefined
  const spec = served?.input?.required?.vdn_checkpoint
  const options = Array.isArray(spec) && Array.isArray(spec[0]) ? spec[0] : []
  return options.filter((name): name is string => typeof name === 'string' && name.length > 0 && !name.startsWith('<'))
}

/** Pack + stage truth in one read — the availability surface the UI and the
 * validation ladder share. `dmd`/`stageB` are the engine-served stage names
 * each rung would run on (sorted-first: the plain bf16 stage wins over an
 * int8_convrot sibling when both are served — the node handles either, the
 * pick just stays deterministic). */
export type VdnAvailability = {
  packPresent: boolean
  stages: string[]
  dmd: string | undefined
  stageB: string | undefined
}

export function vdnAvailability(info: ObjectInfo | Record<string, unknown> | undefined): VdnAvailability {
  const packPresent = vdnPackPresent(info)
  const stages = packPresent ? vdnStages(info) : []
  return {
    packPresent,
    stages,
    dmd: stages.find((stage) => /^stage-dmd/i.test(stage)),
    stageB: stages.find((stage) => /^stage-b/i.test(stage)),
  }
}

/** Resolves how a VDN render will run, from engine truth. Undefined = the
 * arm is not active (vdn off, or an environment absence — the reason is
 * junctioned, never silent). THROWS only on the XOR invariant (a rung plus
 * a turbo tier): that is a contradiction in the requested options, not an
 * environment state, and the graph must not build double-distilled. */
export function resolveVdnPlan(input: {
  vdn?: VdnRung
  turbo?: 'off' | '4' | '8'
  info?: ObjectInfo
}): VdnPlan | undefined {
  const rung = input.vdn ?? 'off'
  if (rung === 'off') return undefined
  if (input.turbo !== undefined && input.turbo !== 'off') {
    // (A-DBG) The XOR refusal — the one case that throws.
    dbg('vdn.plan', { applied: false, reason: 'xor-turbo-tier', rung, turbo: input.turbo })
    throw new Error(`VDN (${rung}) and the turbo tier (${input.turbo}) are exclusive — both are acceleration patches on the same model slot. The VDN stage carries its own distilled adapter; turn the turbo tier off or set VDN off.`)
  }
  if (!input.info) {
    dbg('vdn.plan', { applied: false, reason: 'no-engine-snapshot', rung })
    return undefined
  }
  const availability = vdnAvailability(input.info)
  if (!availability.packPresent) {
    dbg('vdn.plan', { applied: false, reason: 'pack-absent', rung })
    return undefined
  }
  const stage = rung === 'dmd-8' ? availability.dmd : availability.stageB
  if (!stage) {
    dbg('vdn.plan', { applied: false, reason: 'stage-absent', rung, stages: availability.stages })
    return undefined
  }
  const plan: VdnPlan = rung === 'dmd-8'
    ? { rung, stage, applyTurboAdapter: true, ...DMD_PAIRING }
    : { rung, stage, applyTurboAdapter: false }
  // (A-DBG) The applied decision: rung, the engine-served stage, adapter,
  // and the pairing the rung owns — the transcript line a VDN render greps.
  dbg('vdn.plan', { applied: true, rung, stage, adapter: plan.applyTurboAdapter, ...(plan.steps !== undefined ? { steps: plan.steps, sampler: plan.sampler, scheduler: plan.scheduler } : {}) })
  return plan
}

/** The one transform the arm owns: wrap the model chain FIRST (between the
 * UNet and everything else — the position the pack's own example workflow
 * and README prescribe: "Drop it between your MiniMax-H3 loader and the
 * sampler; conditioning, LoRAs, samplers, VAE decode and video/audio output
 * nodes are unchanged"). Inert without a plan — byte-identical to the
 * pre-VDN graph. */
function vdnTransform(_graph: ComfyPrompt, ctx: GraphContext, opts: TransformOptions): void {
  const plan = opts.vdnPlan
  if (!plan) return
  const node: ComfyNode = {
    class_type: VDN_APPLY_NODE,
    inputs: {
      vdn_checkpoint: plan.stage,
      apply_turbo_adapter: plan.applyTurboAdapter,
      // The released-model defaults (the node's DESCRIPTION: "Defaults
      // reproduce the released model exactly"). merge is REQUIRED for
      // 8-step DMD checkpoints (bypass's activation-space rounding noise
      // visibly degrades them); auto lets the node own the memory policy
      // (cache_gpu vs stream by free VRAM — the validated v1.3.1 pattern).
      // Every required input is present — the form-adapter low_vram lesson:
      // an omitted required widget is refused at prompt validation.
      strength: 1,
      lora_mode: 'merge',
      branch_weights: 'auto',
      retain_buffers: 'auto',
      verbose: false,
      attention_backend: 'grouped',
    },
  }
  ctx.wrapModel('vdnApply', H3.vdnApply, node)
}

/** The registry entry: the VDN arm as a real, selectable acceleration. The
 * stage weights are NOT model-registry files (they land under models/vdn,
 * which the engine itself enumerates) — detect reads object_info only. */
export const VDN_ENTRY: OptimizationEntry = {
  id: 'vdn.apply',
  label: 'VDN hybrid attention (adopted first-party)',
  kind: 'acceleration',
  appliesTo: ['minimax'],
  wraps: 'modelChain',
  pairing: { sampler: DMD_PAIRING.sampler, scheduler: DMD_PAIRING.scheduler, steps: DMD_PAIRING.steps },
  detect(info) {
    const availability = vdnAvailability(info)
    return {
      available: Boolean(availability.dmd ?? availability.stageB),
      model: availability.dmd ?? availability.stageB,
      ...(availability.packPresent ? {} : { missingNodes: [VDN_APPLY_NODE] }),
      packs: { vdn: availability.packPresent },
    }
  },
  transform: vdnTransform,
  ui: {
    description: 'VDN-H3 hybrid attention: exact softmax near, linear Video Delta Attention far — long-clip acceleration as runtime model patches (our adopted first-party pack). The dmd stage carries its own distilled 8-step adapter (er_sde/beta); the stage-b rung is the 50-step stack.',
    warning: 'VDN replaces the turbo tier on the same model slot — the stage\'s distilled adapter IS the turbo acceleration. Stages are separate engine-side fetches (Library rows vdn-stage-dmd-250 / vdn-stage-b-2000).',
    note: 'Adopted as our own entirely (2026-09-26 ruling — upstream removed, the vendored tree is the code of record). Measured speed/quality arm GPU-queued.',
    installHint: 'Packs board → vdn-h3 (vendored, installs locally) + a VDN stage under ComfyUI/models/vdn (Library → vdn-stage-dmd-250 for 8-step, vdn-stage-b-2000 for 50-step)',
  },
}
