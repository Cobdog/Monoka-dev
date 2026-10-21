import type { ModelFile, ModelFileIdentity, ModelKind, ModelSelection } from '../types'
import { dbg } from './dbg'
import { turboLoraPatterns } from './graph'

/** The registry lists engine-relative SUBPATHS ("H3/ssd/x.safetensors");
 *  the inference anchors speak family tokens that live in the FILENAME.
 *  Every ladder regex is therefore tested against the basename — the
 *  registry row's full name is returned verbatim (exactly what the graph
 *  loader accepts). (Wave 2 R-12: anchors re-targeted at registry subpaths.)
 *  Exported (sweep #1, 68e9k17): every registry-reading surface resolves
 *  files by basename through this ONE helper — the stack report included —
 *  so no surface can drift back to full-name compares. */
export function basenameOf(name: string) {
  const clean = name.replace(/\\/g, '/')
  const slash = clean.lastIndexOf('/')
  return slash === -1 ? clean : clean.slice(slash + 1)
}

/** Size-class preference tokens (Wave 2 R-12 — A-B3(c) folded): when several
 *  registry files match one ladder tier, the smaller-quant artifact wins —
 *  the official stacks and the GPU-tier guidance both anchor on these. The
 *  registry reports no byte sizes, so the class is read from the filename's
 *  own quant/quality tokens: earlier entries score higher, a hit is a
 *  case-insensitive substring of the basename. */
const SIZE_CLASS_PREFER = ['pruned', 'int8', 'convrot', 'nvfp4', 'awq', 'comfyui', 'ema', 'bf16', 'fp16', 'fp32']

function sizeClassScore(candidate: string) {
  let score = 0
  for (let index = 0; index < SIZE_CLASS_PREFER.length; index += 1) {
    if (candidate.toLowerCase().includes(SIZE_CLASS_PREFER[index]!)) score += SIZE_CLASS_PREFER.length - index
  }
  return score
}

/** Best-of tier: higher size-class score, then the SHORTER basename (fewer
 *  extraneous tokens = closer to the official artifact), then alphabetical
 *  for determinism. */
function bestOfTier(files: ModelFile[]) {
  return [...files].sort((a, b) => {
    const baseA = basenameOf(a.name)
    const baseB = basenameOf(b.name)
    const score = sizeClassScore(baseB) - sizeClassScore(baseA)
    if (score !== 0) return score
    const length = baseA.length - baseB.length
    if (length !== 0) return length
    return baseA.localeCompare(baseB)
  })[0]
}

/** One slot's inference over the registry listing: the ordered regex ladder
 *  (first tier WITH a match wins — the registry's own ranking), each tier
 *  tested against the basename and ranked within by size class. When no
 *  tier matches and a fallback NEEDLE is given, any registry file whose
 *  basename contains the needle is a candidate (the loosened anchor: a
 *  renamed quant, community repack, or subpathed file still auto-resolves);
 *  the same ranking picks among them. Empty string when nothing resolves.
 *
 *  Exported as THE family inference engine (Wave 2): the video ladder here,
 *  the workbench's inferH3ImgSelection, and the audio engines' ladders all
 *  resolve registry rows through this one function — no drifted copies.
 *  (to7xpa7) Name-rules ONLY: the H3 slot resolution rides resolveSlot,
 *  which layers the hash rung on top of this same walk. */
export function findRegistryModel(files: ModelFile[], kind: ModelKind, expressions: RegExp | RegExp[], fallbackNeedle?: string) {
  const candidates = files.filter((file) => file.kind === kind)
  for (const expression of Array.isArray(expressions) ? expressions : [expressions]) {
    const matches = candidates.filter((file) => expression.test(basenameOf(file.name)))
    if (matches.length) {
      const picked = bestOfTier(matches).name
      dbg('inventory.infer', { kind, picked, tier: String(expression), of: candidates.length })
      return picked
    }
  }
  if (fallbackNeedle) {
    const needle = fallbackNeedle.toLowerCase()
    const matches = candidates.filter((file) => basenameOf(file.name).toLowerCase().includes(needle))
    if (matches.length) {
      const picked = bestOfTier(matches).name
      dbg('inventory.infer', { kind, picked, tier: `fallback:${fallbackNeedle}`, of: candidates.length })
      return picked
    }
  }
  dbg('inventory.infer', { kind, picked: '', tier: 'none', of: candidates.length })
  return ''
}

/** ---------------------------------------------------------------------------
 *  THE TE DIMENSION-CLASS GUARD (task eyzcev5 — a new class of the R-12
 *  invariant). The crash it kills is real, from the maintainer's 2026-09-22
 *  session: the loosened anchors above take "best available", and when only
 *  a 4B-class qwen3vl was visible the 'qwen3vl' fallback needle resolved it
 *  into an H3 graph whose token refiner demands the 32B-class — the render
 *  died 27 s in, at preprocess_text_embeds:
 *
 *    mat1 and mat2 shapes cannot be multiplied (171x2560 and 5120x5376)
 *
 *  2560 is the 4B's hidden width, 5120 the 32B's — the log is its own
 *  dimension evidence. The invariant: instance-invisible = nonexistent
 *  (R-12) gets a sibling — WRONG DIMENSION CLASS = UNUSABLE. A visible file
 *  the family cannot consume refuses at validate with the named reason;
 *  it never reroutes (a correct pick resolves exactly as before) and never
 *  submits-and-crashes at the engine.
 *
 *  WHY THE SEAM, NOT THE ENGINE-CONTRACT LAYER (assessed, task AC iuu9keq):
 *  engineContract.ts mirrors the engine's SCHEMA gate (validate_inputs) —
 *  and this failure class is schema-INVISIBLE: CLIPLoader's clip_name combo
 *  accepts any listed filename (the capture fixture carries both TE names
 *  as legal), and the mismatch surfaces only inside execution as a
 *  weight-shape error. object_info serves no tensor dimensions, so a
 *  contract-level check would need a dims oracle the engine does not
 *  provide — the family expectation is OURS. The seam check is therefore
 *  the only honest home, and the cheaper one.
 *
 *  Classification is by the FILENAME's own size token (the registry lists
 *  names only, exactly like the VAE decoder-class markers in
 *  modelOverrides.ts): '32b' → 5120-dim, '8b' → 4096, '4b' → 2560. A name
 *  with NO known token is UNCLASSIFIED — it applies, the engine stays the
 *  final arbiter (no false refusals on community renames). Evidence per
 *  class: the crash log above (2560 vs 5120) + the official model cards /
 *  template pairings (Qwen3-VL-32B hidden 5120; the klein 9B template's
 *  qwen_3_8b 4096; the klein 4B template's qwen_3_4b and the 4B qwen3vl
 *  2560) — read from the templates shipped in the canonical shared install
 *  (comfyui_workflow_templates_json, rev installed with v0.34-era), see
 *  docs/research/h3-te-dimension-classes.md.
 * ------------------------------------------------------------------------- */
export type TeDimClassId = '32b' | '8b' | '4b'

/** The classes the classifier can name — the filename token is the id. */
export const TE_DIM_CLASSES: Readonly<Record<TeDimClassId, { hiddenDim: number; label: string }>> = {
  '32b': { hiddenDim: 5120, label: 'the 32B-class (5120-dim) qwen3vl' },
  '8b': { hiddenDim: 4096, label: 'the 8B-class (4096-dim) Qwen3 companion' },
  '4b': { hiddenDim: 2560, label: 'the 4B-class (2560-dim) qwen3vl/Qwen3' },
}

/** The filename's own size-class token, basename truth (subpaths classify);
 *  null when the name carries no KNOWN token — unclassified, never guessed.
 *  Quant tokens do not false-match: 'int8'/'fp8' carry no digit-b pair. */
export function teDimClassOf(name: string): TeDimClassId | null {
  const match = /(\d{1,2}b)/i.exec(basenameOf(name))
  const token = match ? match[1]!.toLowerCase() : ''
  return token === '32b' || token === '8b' || token === '4b' ? token : null
}

/** One family's TE dimension-class expectation — family-registry data
 *  (task AC buzirkv), enforced at the resolution seam. `accepts` lists the
 *  classes the family can consume; `makeVisible` is the canonical artifact
 *  the refusal names (WHAT TO MAKE VISIBLE, per the root cause: the trap
 *  fires when the right one is invisible). */
export type TeDimClassExpectation = {
  familyLabel: string
  accepts: readonly TeDimClassId[]
  makeVisible: string
  evidence: string
}

/** The H3 stack's one TE expectation, shared by both override families
 *  (the video family and the image workbench run the same TE ladder). */
const H3_TE_EXPECTATION: TeDimClassExpectation = {
  familyLabel: 'the MiniMax H3 stack',
  accepts: ['32b'],
  makeVisible: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  evidence: "the maintainer's 2026-09-22 crash log (mat1 171x2560 × mat2 5120x5376 at preprocess_text_embeds — the token refiner consumes the 32B's 5120-dim hidden state) + the Qwen3-VL-32B model card",
}

/** Per-family TE dimension-class expectations. klein: the small-Qwen3
 *  companion class — its official templates pair 9B↔qwen_3_8b_fp8mixed
 *  (4096-dim; this repo's port) and 4B↔qwen_3_4b (2560-dim), so BOTH small
 *  classes are legal there and the 32B-class is the wrong-family pick in
 *  the reverse direction; within-small pairing precision (4B vs 8B) is the
 *  anchored ladder's + the engine's, not the name classifier's. music3 has
 *  NO row: its TE ladder is fully anchored (no substring fallback), so the
 *  loosened-anchor crash class cannot fire there — absence = inert. */
export const FAMILY_TE_DIM_CLASS: Readonly<Partial<Record<'monoka' | 'h3image' | 'klein' | string, TeDimClassExpectation>>> = {
  monoka: H3_TE_EXPECTATION,
  h3image: H3_TE_EXPECTATION,
  klein: {
    familyLabel: 'the klein refine engine',
    accepts: ['4b', '8b'],
    makeVisible: 'qwen_3_8b_fp8mixed.safetensors',
    evidence: 'the official ComfyUI klein templates read from the canonical shared install: image_flux2_klein_image_edit_9b_distilled pairs qwen_3_8b_fp8mixed (4096-dim), the 4b variant pairs qwen_3_4b (2560-dim)',
  },
}

/** The shared refusal (one message source for every enforcement point — the
 *  override seam, the video ladder's validate rung, and the workbench's
 *  detection): names the picked file, its class, the family's need, and the
 *  artifact to make visible. Null = proceed (no expectation for the family,
 *  no class token in the name, or the class is accepted).
 *
 *  (to7xpa7 AC-2) `identity` is the hash catalog's byte evidence: when the
 *  bytes hash-confirm the H3 text-encoder artifact, THAT class replaces the
 *  filename token — but only when the family ACCEPTS it, so byte evidence
 *  can correct a lying name and can never ADD a refusal (N1: a family the
 *  bytes cannot serve keeps today's name-only verdict, engine arbiter
 *  included). */
export function teDimClassRefusal(familyKey: string, fileName: string, identity?: ModelFileIdentity): string | null {
  const expectation = FAMILY_TE_DIM_CLASS[familyKey]
  if (!expectation || !fileName) return null
  const identityClass = teDimClassOfIdentity(identity)
  const classId = identityClass && expectation.accepts.includes(identityClass) ? identityClass : teDimClassOf(fileName)
  if (!classId || expectation.accepts.includes(classId)) return null
  const picked = TE_DIM_CLASSES[classId]
  const needed = expectation.accepts.map((id) => TE_DIM_CLASSES[id].label).join(' or ')
  dbg('teclass', { verdict: 'refuse', family: familyKey, file: basenameOf(fileName), class: classId, accepts: expectation.accepts.join('|') })
  return `'${basenameOf(fileName)}' is a ${classId.toUpperCase()}-class text encoder (${picked.hiddenDim}-dim) — ${expectation.familyLabel} needs ${needed}, and a mismatched encoder crashes the render at the engine's text-embedding stage instead of failing cleanly. Make ${expectation.makeVisible} visible to the instance (or pick it for this family) instead.`
}

/** ---------------------------------------------------------------------------
 *  THE HASH RUNG (to7xpa7, 2026-10-20) — the ladder's top rung. The hash
 *  catalog's sha256 verdicts are STRONGER evidence than any filename
 *  pattern: names lie (renames, community repacks), bytes do not. A file
 *  whose hash-confirmed identity names the slot's catalog artifact resolves
 *  the slot BEFORE any name rule runs (H-M1); the name ladders below stay
 *  exactly as they are — the fallback, unchanged, for everything the
 *  catalog cannot confirm (N1: the rung only ADDS resolutions).
 *
 *  The slot → artifact map is authored HERE, beside the ladders it extends —
 *  one derivation home, so a slot's identity target cannot drift from its
 *  name ladder. The artifact ids are the crawl's vocabulary
 *  (scripts/lib/hash-catalog-identities.cjs; server/hashCatalog.json §2) —
 *  the plan sketch's 'te-32b' shipped as 'text-encoder', which is why the
 *  match is family-pinned (qwen-image rows share the id). The MERGED slot
 *  stays the deliberate exception: `hybrid` maps to NO slot (community
 *  merges are name-invisible BY DESIGN, spec §4) — MERGED_SLOT_ARTIFACT
 *  exists for the wizard's one-click offer, never for a rung.
 * ------------------------------------------------------------------------- */
/** One slot's catalog-artifact target. `family` is pinned because artifact
 *  ids are not globally unique. Turbo slots carry `laneExclude`: the
 *  catalog's turbo ids are lane-AGNOSTIC (turbo-8 covers the fl2v, ref2v,
 *  dmd and hyperflow LoRA families), so the lanes keep ONE rule of the
 *  ladders' discipline — a file whose basename or canonical alias names the
 *  OTHER lane never enters this lane. A lane-UNLABELED accelerator (dmd,
 *  hyperflow) serves either lane, exactly as the 2026-09-15 bake-off
 *  (muwufpp's v4_step600_ema promotion) blessed in practice. */
export type SlotArtifact = { artifact: string; family: string; laneExclude?: RegExp }

const H3_CATALOG_FAMILY = 'minimax-h3'

const SLOT_ARTIFACT: Partial<Record<SelectionSlotKey, SlotArtifact>> = {
  fl2va: { artifact: 'fl2va', family: H3_CATALOG_FAMILY },
  ref2va: { artifact: 'ref2va', family: H3_CATALOG_FAMILY },
  textEncoder: { artifact: 'text-encoder', family: H3_CATALOG_FAMILY },
  videoVae: { artifact: 'video-vae', family: H3_CATALOG_FAMILY },
  audioVae: { artifact: 'audio-vae', family: H3_CATALOG_FAMILY },
  previewVae: { artifact: 'preview-decoder', family: H3_CATALOG_FAMILY },
}

/** The class guards' catalog targets (the override seam's guarded slots).
 *  The TE/VAE targets are the shared inference slots' own; the imageVae pick
 *  has NO inference slot (T=1 is pick-only), so its target is authored here
 *  beside the map — still one vocabulary, never re-encoded at the guards. */
export const GUARD_SLOT_ARTIFACT: Readonly<Record<'textEncoder' | 'videoVae' | 'audioVae' | 'imageVae', SlotArtifact>> = {
  textEncoder: SLOT_ARTIFACT.textEncoder!,
  videoVae: SLOT_ARTIFACT.videoVae!,
  audioVae: SLOT_ARTIFACT.audioVae!,
  imageVae: { artifact: 't1-image-vae', family: H3_CATALOG_FAMILY },
}

/** The merged slot's catalog artifact — `hybrid` maps to NO inference slot
 *  (see the rung block above). Read only by the wizard's mergedPickOffer. */
export const MERGED_SLOT_ARTIFACT: SlotArtifact = { artifact: 'hybrid', family: H3_CATALOG_FAMILY }

/** The tier-shaped turbo slots' targets: the artifact id is the TIER's truth
 *  (a hash-confirmed 8-step file is not a wrong-tier pick — plan ruling),
 *  scoped to the lane exclusion. 'off' admits both step tiers, exactly like
 *  the off-patterns' union. */
export function slotArtifacts(slot: SelectionSlotKey, turbo: 'off' | '4' | '8' = 'off'): SlotArtifact[] {
  const mapped = SLOT_ARTIFACT[slot]
  if (mapped) return [mapped]
  if (slot !== 'fl2vLora' && slot !== 'ref2vLora') return []
  const ids = turbo === '4' ? ['turbo-4'] : turbo === '8' ? ['turbo-8'] : ['turbo-4', 'turbo-8']
  const laneExclude: RegExp = slot === 'fl2vLora' ? /ref2v/i : /fl2v/i
  const targets: SlotArtifact[] = []
  for (const artifact of ids) targets.push({ artifact, family: H3_CATALOG_FAMILY, laneExclude })
  return targets
}

/** H-M1's byte-evidence test — the ONE helper every consumer reads (the
 *  rung, the stack report's isCanonical upgrade, the class guards, the
 *  wizard's fetch suppression), never a re-encoding. True when the file
 *  carries a hash-confirmed identity naming one of the targets
 *  (family-pinned; lane-excluded targets additionally require that the
 *  basename and aliases name no OTHER lane). */
export function identityConfirmsArtifact(file: Pick<ModelFile, 'name' | 'identity'>, targets: readonly SlotArtifact[]): boolean {
  const identity = file.identity
  if (!identity || identity.verdict !== 'hash-confirmed') return false
  for (const target of targets) {
    if (identity.family !== target.family || identity.artifact !== target.artifact) continue
    const exclude = target.laneExclude
    if (!exclude) return true
    if (exclude.test(basenameOf(file.name))) continue
    const aliases = identity.aliases
    if (aliases && aliases.some((alias) => exclude.test(alias))) continue
    return true
  }
  return false
}

/** The identity-based sibling of teDimClassOf (AC-2's byte classifier):
 *  hash-confirmed bytes classify DIRECTLY — the catalog's H3 text-encoder
 *  artifact IS the 32B-class qwen3vl (every cataloged row; the
 *  classification table owns the fact). Null when the block does not
 *  confirm that artifact — callers keep the filename classifier, and the
 *  class guards only ever RELAX on it (the guards never gain a refusal, N1). */
export function teDimClassOfIdentity(identity?: ModelFileIdentity): TeDimClassId | null {
  if (!identity || identity.verdict !== 'hash-confirmed') return null
  if (identity.family === H3_CATALOG_FAMILY && identity.artifact === SLOT_ARTIFACT.textEncoder!.artifact) return '32b'
  return null
}

/** H-M2's tie-break over a slot's hash-confirmed pool: (1) the canonically
 *  aliased basename wins (a renamed copy of the SAME bytes yields to the
 *  registry name the catalog knows); (2) the existing bestOfTier ranking;
 *  (3) bestOfTier's sort is stable — full ties keep registry order. */
function hashConfirmedPick(pool: ModelFile[]): ModelFile | null {
  if (pool.length === 0) return null
  const aliased = pool.filter((file) => {
    const aliases = file.identity && file.identity.aliases
    if (!aliases) return false
    const base = basenameOf(file.name).toLowerCase()
    for (const alias of aliases) if (alias.toLowerCase() === base) return true
    return false
  })
  return bestOfTier(aliased.length > 0 ? aliased : pool)
}

/** ---------------------------------------------------------------------------
 *  THE SLOT LADDERS — one table, one derivation (wizard rework task 5,
 *  2026-10-19). inferSelections' per-slot ladders moved here so the Models
 *  step's candidate ENUMERATOR (slotCandidates) reads the exact same tiers
 *  and fallback needles the picker reads: no second source of resolution
 *  truth can drift (the h3Stack lesson — a parallel table is how present
 *  models once read missing). The ladders' semantics are unchanged, tier
 *  for tier, needle for needle.
 * ------------------------------------------------------------------------- */
/** The inference-resolvable slots — `merged` is override-only (inference
 *  cannot see community merges), so it is not a slot with a ladder. */
export type SelectionSlotKey = Exclude<keyof ModelSelection, 'merged'>

export type SlotLadder = { kind: ModelKind; tiers: RegExp[]; fallbackNeedle?: string }

const STATIC_SLOT_LADDERS: Record<Exclude<SelectionSlotKey, 'fl2vLora' | 'ref2vLora'>, SlotLadder> = {
  fl2va: { kind: 'diffusion_models', tiers: [/^minimax_h3_fl2va_pruned_int8_convrot\.safetensors$/i, /^minimax_h3_fl2va.*\.safetensors$/i], fallbackNeedle: 'fl2va' },
  ref2va: { kind: 'diffusion_models', tiers: [/^minimax_h3_ref2va_pruned_int8_convrot\.safetensors$/i, /^minimax_h3_ref2va.*\.safetensors$/i], fallbackNeedle: 'ref2va' },
  textEncoder: { kind: 'text_encoders', tiers: [/^qwen3vl_32b_minimax_h3_nvfp4_awq\.safetensors$/i, /^qwen3vl_32b_minimax_h3.*\.safetensors$/i], fallbackNeedle: 'qwen3vl' },
  videoVae: { kind: 'vae', tiers: [/^minimax_h3_video_vae_fp16\.safetensors$/i, /^minimax_h3_video_vae.*\.safetensors$/i], fallbackNeedle: 'video_vae' },
  audioVae: { kind: 'vae', tiers: [/^minimax_h3_audio_vae_fp32\.safetensors$/i, /^minimax_h3_audio_vae.*\.safetensors$/i], fallbackNeedle: 'audio_vae' },
  // The H3 preview TAE ships under two names: Kijai's original
  // vae_approx/taeh3.safetensors (the fetchable catalog entry) and the
  // preview-override pack's taeh3_decoder.safetensors. The engine's native
  // previewer matches any vae_approx file starting with "taeh3" — this
  // selection feeds the graph-side override node, so both names resolve
  // (the explicit decoder name stays preferred).
  previewVae: { kind: 'vae_approx', tiers: [/^taeh3_decoder\.safetensors$/i, /^taeh3\.safetensors$/i], fallbackNeedle: 'taeh3' },
}

function slotLadder(slot: SelectionSlotKey, turbo: 'off' | '4' | '8', family?: string): SlotLadder {
  // Turbo inference is family-ranked through the optimization registry:
  // official weights first, then lightx2v newest-first, with an explicit
  // family choice (registry entry id) constraining the patterns to it.
  // The registry owns these patterns — deliberately NO substring fallback
  // here (a wrong-tier turbo pick is worse than none; the escape hatch is
  // the explicit family pick or an override). Reference mode: the official
  // 4-step LoRA (ComfyUI's template pair), or the 8-step fast tier when
  // 8-step reference mode is requested — ranked larryvrh v4_step600_ema
  // first per the 2026-09-15 bake-off (task muwufpp), lightx2v Ref2VA 8-step
  // as the measured runner-up.
  if (slot === 'fl2vLora') return { kind: 'loras', tiers: turboLoraPatterns('fl2v', turbo, family) }
  if (slot === 'ref2vLora') return { kind: 'loras', tiers: turboLoraPatterns('ref2v', turbo, family) }
  return STATIC_SLOT_LADDERS[slot]
}

/** ONE slot resolution (to7xpa7): the hash rung FIRST (H-M1 — byte evidence
 *  outranks every name rule; the pool is the ladder kind's files whose
 *  identity confirms the slot's artifact, tied off per H-M2), then the
 *  ladder's tiers, then the fallback needle. inferSelections and
 *  slotCandidates BOTH consume this walk, so the picker and the enumerator
 *  cannot disagree (the no-drift invariant) — the rung cannot exist in one
 *  and not the other. */
type SlotResolution = {
  kind: ModelKind
  picked: string
  basis: 'hash' | 'anchored' | 'fallback' | ''
  names: string[]
}

function resolveSlot(files: ModelFile[], slot: SelectionSlotKey, turbo: 'off' | '4' | '8', family?: string): SlotResolution {
  const ladder = slotLadder(slot, turbo, family)
  const candidates = files.filter((file) => file.kind === ladder.kind)
  const pool: ModelFile[] = []
  for (const file of candidates) {
    if (identityConfirmsArtifact(file, slotArtifacts(slot, turbo))) pool.push(file)
  }
  const hashPick = hashConfirmedPick(pool)
  if (hashPick) {
    dbg('inventory.infer', { slot, picked: hashPick.name, tier: 'hash', of: pool.length })
    const names = [hashPick.name]
    for (const file of pool) {
      if (file.name !== hashPick.name && names.indexOf(file.name) === -1) names.push(file.name)
    }
    return { kind: ladder.kind, picked: hashPick.name, basis: 'hash', names }
  }
  // The name walk — the ladders' existing semantics, verbatim (first tier
  // with a match wins, then the fallback needle), plus the enumerated names
  // the wizard's narration reads.
  const names: string[] = []
  const admit = (test: (base: string) => boolean) => {
    for (const file of candidates) {
      const base = basenameOf(file.name)
      if (test(base) && names.indexOf(file.name) === -1) names.push(file.name)
    }
  }
  let picked = ''
  let basis: SlotResolution['basis'] = ''
  for (const tier of ladder.tiers) {
    admit((base) => tier.test(base))
    if (!picked) {
      const matches = candidates.filter((file) => tier.test(basenameOf(file.name)))
      if (matches.length) {
        picked = bestOfTier(matches).name
        basis = 'anchored'
      }
    }
  }
  if (!picked && ladder.fallbackNeedle) {
    const needle = ladder.fallbackNeedle.toLowerCase()
    admit((base) => base.toLowerCase().includes(needle))
    const matches = candidates.filter((file) => basenameOf(file.name).toLowerCase().includes(needle))
    if (matches.length) {
      picked = bestOfTier(matches).name
      basis = 'fallback'
    }
  }
  return { kind: ladder.kind, picked, basis, names }
}

/** The MODELS STEP'S ENUMERATOR (wizard rework task 5): every registry row a
 *  slot's resolution would admit — the hash pool, tier matches, or the
 *  fallback needle's matches — beside the pick and HOW it was earned
 *  ('hash' = byte evidence; 'anchored' = a tier regex; 'fallback' = the
 *  loose needle; '' = nothing resolves). ONE derivation beside the ladders:
 *  `picked` IS inferSelections' answer for this slot (both read resolveSlot),
 *  so the wizard's picked/ambiguous narration can never disagree with the
 *  picker (pinned in tests/workflows.test.js, the no-drift invariant). */
export type SlotCandidateSet = {
  slot: SelectionSlotKey
  kind: ModelKind
  /** Every admitting registry name (verbatim subpaths), pick first on a
   *  hash basis, tier order first on a name basis. */
  names: string[]
  /** The resolution's pick — exactly inferSelections' answer for this slot. */
  picked: string
  basis: 'hash' | 'anchored' | 'fallback' | ''
}

export function slotCandidates(files: ModelFile[], slot: SelectionSlotKey, turbo: 'off' | '4' | '8' = 'off', family?: string): SlotCandidateSet {
  const resolution = resolveSlot(files, slot, turbo, family)
  return { slot, kind: resolution.kind, names: resolution.names, picked: resolution.picked, basis: resolution.basis }
}

export function inferSelections(files: ModelFile[], turbo: 'off' | '4' | '8', family?: string): ModelSelection {
  const pick = (slot: SelectionSlotKey) => resolveSlot(files, slot, turbo, family).picked
  return {
    fl2va: pick('fl2va'),
    ref2va: pick('ref2va'),
    textEncoder: pick('textEncoder'),
    videoVae: pick('videoVae'),
    audioVae: pick('audioVae'),
    previewVae: pick('previewVae'),
    fl2vLora: pick('fl2vLora'),
    ref2vLora: pick('ref2vLora'),
  }
}
