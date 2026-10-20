/** The H3 stack report — DERIVED, never parallel (maintainer ruling
 *  2026-09-26: "the auto inferred models are there, the H3 Engine Stack
 *  reports are incorrect").
 *
 *  This module once carried its own expectation table — hardcoded expected
 *  filenames plus anchored fallback regexes per slot — a SECOND source of
 *  truth beside the inference ladders. The pickers resolved the
 *  maintainer's real files (substring + size-class anchors) while the
 *  table's regexes demanded tokens the ladders never require (the
 *  `_minimax_h3_` infix), so present models read MISSING while the UI
 *  showed them inferred. PR #52's basename fix addressed the comparison;
 *  the root was the parallel table itself. The report now resolves every
 *  slot through the SAME code path submit uses — inferSelections' ladders
 *  + the override seam (resolveModels) — and states, per row: the RESOLVED
 *  model (what the graph will load, registry name verbatim), its source
 *  layer (override/global/inferred), presence truth, and — display
 *  guidance ONLY — the canonical official artifact. A slot with no
 *  resolution reads as the honest empty state with inference-shaped
 *  guidance, never missing-because-unlisted; a found-but-refused pick (or
 *  a resolved TE of the wrong dimension class) narrates the existing
 *  refusal machinery's reason and blocks readiness, exactly like the
 *  submission would. */
import type { GenerationMode, ModelFile, ModelSelection, ModelOverrideSlots } from '../types'
import type { ObjectInfo } from './comfyInfo'
import { dbg } from './dbg'
import { basenameOf, inferSelections, teDimClassRefusal } from './modelSelection'
import { resolveModels, type ModelOverrideSlotName } from './modelOverrides'
import { turboTierInstallHint, vdnAvailability } from './graph'
import { missingCoreNodeClasses, type MissingNodeClass } from './preflight'

export const diagnosticPrompt = 'A woman standing beside a window in soft daylight, natural skin texture, subtle head movement, realistic cinematic photography.'

/** The canonical official stack and per-slot display guidance — GUIDANCE
 *  ONLY, never validation. `canonical` names the official artifact the row
 *  hints at when the resolved file differs; `makeVisible` is the
 *  inference-shaped guidance shown when NOTHING resolves (what shape of
 *  name the ladder would pick up — read from the ladders in
 *  modelSelection.ts / the turbo registry; the ladders own the truth).
 *  `tier` + `field` say WHERE the row's resolution lives: the same
 *  inferSelections call the submit path runs, at the tier the row names. */
const stackSlots = [
  { label: 'FL2VA', kind: 'diffusion_models' as const, canonical: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', tier: 'off' as const, field: 'fl2va' as const, overrideSlot: 'fl2va' as ModelOverrideSlotName, makeVisible: 'a diffusion-model file whose name contains "fl2va" (the first-frame lane)' },
  { label: 'Text encoder', kind: 'text_encoders' as const, canonical: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', tier: 'off' as const, field: 'textEncoder' as const, overrideSlot: 'textEncoder' as ModelOverrideSlotName, makeVisible: 'a 32B-class qwen3vl text encoder (a name containing "qwen3vl_32b" — the 4B/8B companions are the wrong dimension class and refuse)' },
  { label: 'Video VAE', kind: 'vae' as const, canonical: 'minimax_h3_video_vae_fp16.safetensors', tier: 'off' as const, field: 'videoVae' as const, overrideSlot: 'videoVae' as ModelOverrideSlotName, makeVisible: 'a VAE whose name contains "video_vae"' },
  { label: 'Audio VAE', kind: 'vae' as const, canonical: 'minimax_h3_audio_vae_fp32.safetensors', tier: 'off' as const, field: 'audioVae' as const, overrideSlot: 'audioVae' as ModelOverrideSlotName, makeVisible: 'a VAE whose name contains "audio_vae"' },
  { label: 'Turbo 8', kind: 'loras' as const, canonical: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', tier: '8' as const, field: 'fl2vLora' as const, overrideSlot: null, makeVisible: 'the official 8-step turbo LoRA or a lightx2v fl2v 8-step name — the turbo ladder is anchored on purpose (no loose fallback: a wrong-tier pick is worse than none)' },
]

export type H3StackSlotRow = {
  label: string
  kind: ModelFile['kind']
  /** The selection slot this row narrates (the ModelSelection key) — the
   *  view builder reads it to enumerate candidates at the same slot. */
  slot: 'fl2va' | 'textEncoder' | 'videoVae' | 'audioVae' | 'fl2vLora'
  /** The tier the row's resolution lives at ('8' for the turbo row). */
  tier: 'off' | '8'
  /** The override seam the slot's ambiguous pick designates through; absent
   *  for slots with no override (the turbo LoRA rows). */
  overrideSlot?: ModelOverrideSlotName
  /** The canonical official artifact — DISPLAY guidance only, never a gate. */
  canonical: string
  /** The RESOLVED model the graph will load (registry name, verbatim); ''
   *  when nothing resolves — see makeVisible for what naming to surface. */
  selected: string
  /** Which layer produced the selection: 'override' (a pick applied) or
   *  'inferred' (the ladder); '' when nothing resolves. */
  source: 'override' | 'inferred' | ''
  /** The override layer that applied ('chain'|'global'); undefined for
   *  inferred rows and picks that only legacy migration filled. */
  layer?: 'chain' | 'global'
  /** Presence truth: the registry lists the resolved name verbatim. */
  present: boolean
  /** The resolved basename IS the canonical artifact (display hint). */
  isCanonical: boolean
  /** Found but refused — the existing refusal machinery's reason (an
   *  override pick the family contract rejects, or the TE dimension-class
   *  guard on the resolved encoder). Submission refuses; so does readiness. */
  refusal?: string
  /** Inference-shaped guidance for the empty state: what naming resolves. */
  makeVisible: string
}

/** The report is the SAME resolution the graphs will use, narrated. For each
 *  slot it resolves through inferSelections + the override seam — the store's
 *  selectionFor code path, not a fork — and the row states what the graph
 *  will load, from which layer, with presence truth. `overrides` here is the
 *  SETTINGS-level (global) layer both surfaces pass; per-chain picks surface
 *  in the chain properties panel, so the layer attribution names 'global'.
 *
 *  Verdicts: `validated` is a DISPLAY statement (every slot resolves to the
 *  canonical official artifact — the pill's vocabulary, never a gate).
 *  `ready` is the honest usability verdict the doctor/wizard surfaces keep:
 *  every slot resolves + present, nothing refused (override refusal or the
 *  TE dimension class — the same checks the submit validate rung runs), and
 *  the engine serves the H3 core node classes (R-29: weights cannot fix a
 *  node class).
 *
 *  (R-29, audit C F7) With an object_info snapshot at hand the report also
 *  checks the ENGINE side: an instance a version behind serves every file
 *  check yet fails at render. `nodes.missing` names the h3-video core
 *  classes the engine does not serve, and `ready` is false while any are
 *  missing. No snapshot (or an empty one) keeps the file-only verdict: the
 *  connection rung owns that refusal. */
/** (R2, central-model audit) THE ONE stack-ready predicate — the membership
 *  definition of "this H3 render can run," parameterized by what is actually
 *  being gated, so every surface (the submit gates' modelReady, the canvas
 *  chip, the diagnostics pair, and this report's own `ready`) derives from
 *  one rule instead of re-encoding membership per file:
 *
 *  - `mode` — which lane the gated graph loads. The video factory's
 *    UNETLoader picks ref2va ONLY in reference mode, fl2va otherwise, so the
 *    text/image/frames lanes do not require ref2va (a text-only stack is a
 *    READY stack — the old chip's blanket ref2va demand soft-gated
 *    first-frame renders the graph could actually run) and the reference
 *    lane does. The shared spine (textEncoder, videoVae, audioVae) is always
 *    required.
 *  - `turbo` — a turbo plan additionally requires ITS LANE's LoRA: the
 *    graph runs the tier's step count, and N distilled steps without the
 *    distillation LoRA is a broken render the old gates waved through.
 *  - `info` — render readiness: with an object_info snapshot at hand, the
 *    engine must serve the H3 core node classes (R-29: weights cannot fix a
 *    node class). No snapshot keeps the file-only verdict — the connection
 *    rung owns that refusal.
 *
 *  Refusal NARRATION stays with the narrators (the report's rows, the submit
 *  ladder's named messages); this predicate owns membership and nothing
 *  else. */
export type H3StackReadinessQuery = {
  selection: Pick<ModelSelection, 'fl2va' | 'ref2va' | 'textEncoder' | 'videoVae' | 'audioVae' | 'fl2vLora' | 'ref2vLora'>
  mode?: GenerationMode
  turbo?: 'off' | '4' | '8'
  /** The VDN acceleration rung (task 9up52mj): when set, the turbo-LoRA
   *  member does not apply (the VDN stage's own distilled adapter replaces
   *  it — the XOR rule) and the engine-side members do (pack + the rung's
   *  stage, read from the same object_info snapshot the core-class check
   *  uses). No snapshot keeps the file-only verdict, exactly like the core
   *  check. Both a rung AND a tier set is not a runnable graph (the factory
   *  throws) — membership answers false, narration stays with the ladder. */
  vdn?: 'off' | 'dmd-8' | 'stage-b-50'
  info?: ObjectInfo | Record<string, unknown>
}

export function h3StackReady(query: H3StackReadinessQuery): boolean {
  const mode = query.mode ?? 'text'
  const turbo = query.turbo ?? 'off'
  const vdn = query.vdn ?? 'off'
  if (vdn !== 'off' && turbo !== 'off') return false
  const lane = mode === 'reference' ? query.selection.ref2va : query.selection.fl2va
  const members = [lane, query.selection.textEncoder, query.selection.videoVae, query.selection.audioVae]
  if (turbo !== 'off') members.push(mode === 'reference' ? query.selection.ref2vLora : query.selection.fl2vLora)
  if (!members.every(Boolean)) return false
  if (vdn !== 'off' && query.info) {
    const availability = vdnAvailability(query.info)
    if (!availability.packPresent) return false
    if (vdn === 'dmd-8' && !availability.dmd) return false
    if (vdn === 'stage-b-50' && !availability.stageB) return false
  }
  return missingCoreNodeClasses(query.info, 'h3-video').length === 0
}

/** Speed-tier availability, derived from the app's OWN inventory through the
 *  exact seam the submit path uses (inferSelections ladder → resolveModels →
 *  the lane LoRA that h3StackReady checks membership on) — never a parallel
 *  table (the module-head doctrine). Per fast tier in the given mode's lane:
 *  whether the tier can actually run, the LoRA the graph would load, and —
 *  when unavailable — ONE truthful remediation.
 *
 *  Remediation history: R2 F3 (task g1girm8) worded this to NEVER promise
 *  the fetch catalog, which then carried zero turbo LoRA rows — the audited
 *  double remediation was a promise rendered directly above a "not
 *  fetchable" note. D9 (the blessed wizard spec §7, task 3p14abm,
 *  2026-10-19) changed the fact: the catalog now carries the lightx2v FL2V
 *  turbo rows, so the remediation names the fetch FIRST and keeps the
 *  manual placement beside it. The ref2v lane and family-scoped
 *  resolutions stay publisher-only — no fetch rows exist for them, and a
 *  fetch promise there would be the R2 F3 lie again. */
export type TurboTierState = {
  tier: '4' | '8'
  available: boolean
  /** The lane LoRA the graph would load at this tier ('' when none resolves). */
  loraName: string
  /** ONE truthful remediation; '' when available. */
  remediation: string
}

/** (D9) The FL2V fast tiers' fetch rows — ids ARE the catalog ids in
 *  server/fetchCatalog.ts. The tier menu (turboTierStates →
 *  PropertiesPanel) and the submit refusal (turboTierRefusal → h3Submit)
 *  derive from THIS one table so both surfaces name the same row (the
 *  g1girm8 one-seam discipline). */
const FL2V_TIER_FETCH_ROWS: Record<'4' | '8', string> = {
  '4': 'lightx2v-fl2v-turbo-4',
  '8': 'lightx2v-fl2v-turbo-8',
}

/** The fix clause both surfaces embed: the fetch affordance when the tier's
 *  lane is cataloged (fl2v, and no explicit family — a family-scoped
 *  resolution names only ITS publisher), and the always-true manual
 *  placement. */
function turboTierFixClause(tier: '4' | '8', lane: 'fl2v' | 'ref2v', family: string | undefined, hint: string): string {
  const fetchRow = lane === 'fl2v' && !family ? FL2V_TIER_FETCH_ROWS[tier] : ''
  const fetchPart = fetchRow ? `fetch ${fetchRow} through the library (consent-gated), or ` : ''
  return `${fetchPart}place one from its publisher in the engine's loras folder and refresh the engine${hint ? `: ${hint}` : ''}`
}

export function turboTierStates(models: ModelFile[], mode: GenerationMode, family?: string): Record<'4' | '8', TurboTierState> {
  const lane: 'fl2v' | 'ref2v' = mode === 'reference' ? 'ref2v' : 'fl2v'
  const states = {} as Record<'4' | '8', TurboTierState>
  for (const tier of ['4', '8'] as const) {
    const selection = resolveModels('monoka', inferSelections(models, tier, family), models).selection
    const loraName = lane === 'ref2v' ? selection.ref2vLora : selection.fl2vLora
    const hint = turboTierInstallHint(tier, lane, family)
    states[tier] = {
      tier,
      available: Boolean(loraName),
      loraName: loraName ?? '',
      remediation: loraName ? '' : `no ${tier}-step turbo LoRA is installed — ${turboTierFixClause(tier, lane, family, hint)}`,
    }
  }
  return states
}

/** The submit-ladder refusal for a selected-but-unresolvable speed tier:
 *  the tier by name, the ONE truthful fix (the catalog fetch when the lane
 *  has a row, the manual placement always — the same LoRA in the loras
 *  folder either way), and the working alternative (the Quality tier).
 *  History: worded at g1girm8 to never promise the fetch (R2 F3); D9
 *  (task 3p14abm, 2026-10-19) flipped the fl2v lane to name its row. */
export function turboTierRefusal(tier: '4' | '8', mode: GenerationMode): string {
  const lane: 'fl2v' | 'ref2v' = mode === 'reference' ? 'ref2v' : 'fl2v'
  const hint = turboTierInstallHint(tier, lane)
  const tierLabel = tier === '4' ? 'Fast · 4-step' : 'Fast · 8-step'
  const fetchRow = lane === 'fl2v' ? FL2V_TIER_FETCH_ROWS[tier] : ''
  const fix = fetchRow
    ? `Fetch ${fetchRow} through the library (consent-gated), or install one from its publisher and refresh the engine`
    : `Install one from its publisher and refresh the engine`
  return `${tierLabel} needs a ${tier}-step turbo LoRA and none is installed in the engine's loras folder. ${fix}${hint ? `: ${hint}` : ''} — or switch the speed tier to Quality, which runs without it.`
}

export function h3StackReport(models: ModelFile[], overrides?: ModelOverrideSlots, info?: ObjectInfo | Record<string, unknown>) {
  const quality = resolveModels('monoka', inferSelections(models, 'off'), models, overrides, { global: overrides })
  const turbo = resolveModels('monoka', inferSelections(models, '8'), models, overrides, { global: overrides })
  const byTier: Record<'off' | '8', { selection: ModelSelection }> = { off: quality, '8': turbo }
  const rows: H3StackSlotRow[] = stackSlots.map((definition) => {
    const selected = byTier[definition.tier].selection[definition.field]
    const outcome = definition.overrideSlot ? quality.resolution.slots[definition.overrideSlot] : null
    const applied = outcome && outcome.state === 'applied' ? outcome : null
    const refused = outcome && outcome.state === 'refused' ? outcome : null
    // (eyzcev5 composition) The submit validate rung runs the TE
    // dimension-class guard on the RESOLVED selection — best-available can
    // resolve a 4B-class encoder NON-EMPTY (the crash class the old
    // readiness could not see). The row narrates the same verdict.
    const teRefusal = definition.overrideSlot === 'textEncoder' && selected ? teDimClassRefusal('monoka', selected) : null
    const refusal = refused ? refused.reason : (teRefusal ?? undefined)
    const row: H3StackSlotRow = {
      label: definition.label,
      kind: definition.kind,
      slot: definition.field,
      tier: definition.tier,
      ...(definition.overrideSlot ? { overrideSlot: definition.overrideSlot } : {}),
      canonical: definition.canonical,
      selected,
      source: applied ? 'override' : selected ? 'inferred' : '',
      ...(applied && applied.layer ? { layer: applied.layer } : {}),
      present: Boolean(selected) && models.some((model) => model.name === selected),
      isCanonical: Boolean(selected) && basenameOf(selected).toLowerCase() === definition.canonical.toLowerCase(),
      ...(refusal ? { refusal } : {}),
      makeVisible: definition.makeVisible,
    }
    // (A-DBG) The per-slot junction: the report narrates the same trace the
    // picker used — what resolved, from which layer, and any refusal.
    dbg('h3stack.slot', { slot: definition.label, picked: selected || '(none)', source: row.source || 'none', canonical: row.isCanonical, ...(refusal ? { refused: true } : {}) })
    return row
  })
  const missingNodes: MissingNodeClass[] = missingCoreNodeClasses(info, 'h3-video')
  return {
    rows,
    // (task 5) The tier-'off' resolution itself — the SAME object the chip's
    // predicate reads — so a narrator can call h3StackReady without
    // re-deriving membership (one predicate, zero re-encodings).
    selection: quality.selection,
    validated: rows.every((row) => row.present && row.isCanonical),
    // (R2) The report's ready is the ONE predicate over its own table
    // membership: the full stack (text lane + the Turbo-8 row's LoRA) with
    // no refused pick, on a core-serving engine. Same verdict as before the
    // recomposition — now derived, never re-encodable.
    ready: h3StackReady({ selection: turbo.selection, mode: 'text', turbo: '8', info }) && rows.every((row) => !row.refusal),
    warnings: quality.resolution.warnings,
    nodes: { missing: missingNodes },
  }
}

/** THE ONE VERDICT (wizard rework §2.2, task 5, 2026-10-19): the Models
 *  step's single verdict line. It derives from the SAME predicate the
 *  engine chip reads — h3StackReady at the text lane over the report's own
 *  tier-'off' selection — never from the report's turbo-8-gated `ready`
 *  (that vocabulary belongs to the pill; reusing it here is the R1
 *  contradiction in reverse: a "ready" pill beside a body the step calls
 *  incomplete). One voice, one line: missing node classes first (weights
 *  cannot fix them), then the first refused row, then the missing component
 *  NAMES; when every text-lane member resolves, "Ready to render." — even
 *  with the turbo LoRA absent, because the fast tier is an upgrade, not a
 *  requirement. The walk gates the text lane (the blessed default); the
 *  reference lane's row lands with the catalog wave's row additions. */
export type StackVerdict = { ready: boolean; text: string }

export function stackVerdictText(report: ReturnType<typeof h3StackReport>, mode: GenerationMode = 'text'): StackVerdict {
  const nodes = report.nodes.missing
  if (nodes.length > 0) {
    return { ready: false, text: `The engine does not serve the studio's core render nodes (${nodes.map((item) => item.className).join(', ')}) — weights cannot fix this. Update ComfyUI (or install the missing node packs), restart the engine, then refresh.` }
  }
  const refused = report.rows.find((row) => row.refusal)
  if (refused && refused.refusal) {
    return { ready: false, text: `${refused.label} was found but refused: ${refused.refusal}` }
  }
  const ready = h3StackReady({ selection: report.selection, mode })
  if (ready) return { ready: true, text: 'Ready to render.' }
  const laneSlot: 'fl2va' | 'ref2va' = mode === 'reference' ? 'ref2va' : 'fl2va'
  const members: Array<H3StackSlotRow['slot'] | 'ref2va'> = [laneSlot, 'textEncoder', 'videoVae', 'audioVae']
  const missing = report.rows
    .filter((row) => members.indexOf(row.slot) !== -1 && !row.selected)
    .map((row) => row.label)
  return {
    ready: false,
    text: missing.length > 0
      ? `Not ready to render — missing from the engine's registry: ${missing.join(', ')}. Each row below names the one file that fixes it.`
      : 'Not ready to render — the text-lane stack could not be verified against this engine.',
  }
}

export function findH3PreviewOverrideNode(info: ObjectInfo) {
  return Object.keys(info).find((name) => name === 'MiniMaxH3PreviewOverrideCS')
    ?? Object.keys(info).find((name) => /minimax.*h3.*preview.*override/i.test(name))
}
