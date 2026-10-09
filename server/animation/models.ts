/**
 * Registry-driven model resolution for the animation lane (wave 1 of the
 * post-review follow-up program, the live review's #1 — the release
 * blocker): the engine's OWN enumeration is the registry, and every model
 * slot the animation graphs load is resolved to ONE enumerated name by an
 * explicit preference ladder. The lane's pinned names
 * (ANIMATION_MODEL_DEFAULTS in shared/animation/graphs.ts) survive as the
 * documented PREFERENCE seed — never as a welded value: an installation
 * that serves different filenames still renders, and an installation that
 * serves nothing matching gets a NAMED refusal listing what was tried and
 * what the engine enumerates (never another installation-specific
 * universal hardcode — the reviewer's binding rule).
 *
 * The ladder per slot, in order:
 *   (a) an explicit snapshot-settings override (settings.baseModel /
 *       .adapterLora / .textEncoder / .videoVae) when the engine enumerates
 *       it — an override the engine does not serve is a dead slot named
 *       with the override as the tried value;
 *   (b) the exact ANIMATION_MODEL_DEFAULTS name when the engine enumerates
 *       it;
 *   (c) a documented pattern ladder per slot (the filename family the
 *       install serves); within a pattern the candidates are sorted and the
 *       first wins — deterministic — and the resolved set that lands in the
 *       frozen snapshot IS the record of the choice;
 *   (d) nothing matches → the named refusal (AnimationModelResolutionError)
 *       carrying the slot, the node class + input that loads it, the tried
 *       names, and an excerpt of the enumeration.
 *
 * The textEncoder slot carries one extra documented rung between (b) and
 * (c): qwen3vl_32b_int8_convrot.safetensors, the maintainer's directive of
 * 2026-10-07 ("use that one instead" — the file the live independent
 * review's two real tween renders used; the canonical install now serves
 * both that name and its minimax_h3 alias as symlinks to the same bytes).
 * It is written as an explicit preference, NOT alphabetical luck, so a
 * third 32B-class name sorting earlier cannot silently win the slot.
 *
 * SANITIZATION BY CONSTRUCTION: every refusal message is composed here from
 * fixed technical prose and filename-shaped values — never from raw engine
 * output (the logSanitize discipline; enumeration entries are capped in
 * count and length before they enter a message, so a pathological engine
 * cannot smuggle prose through a "filename").
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { ANIMATION_MODEL_DEFAULTS } from '../../shared/animation/graphs'
import type { AnimationTool, ModelContentIdentity } from '../../shared/animation/types'

/** The engine's own enumeration of what its loader nodes will accept —
 *  sourced server-side from /object_info (UNETLoader's unet_name,
 *  CLIPLoader's clip_name, VAELoader's vae_name, LoraLoader(+ModelOnly)'s
 *  lora_name combo lists). Enumeration alone does not prove READABILITY
 *  (the review's alias finding: an enumerated name can point at a missing
 *  file) — readability stays the engine's own validation's problem, which
 *  is exactly why refusals name the enumeration instead of guessing. */
export type ModelEnumerations = { unet: string[]; clip: string[]; vae: string[]; lora: string[] }

/** The one resolved name per slot the animation graphs load — the shape the
 *  frozen snapshot's settings and the builders' explicit parameters carry. */
export type ResolvedAnimationModels = {
  baseModel: string
  adapterLora: string
  textEncoder: string
  videoVae: string
}

/** The named refusal: a slot the engine's enumeration cannot serve. The
 *  message is the durable, sanitized reason (the 400 at submit and the
 *  persisted failureReason share it verbatim). */
export class AnimationModelResolutionError extends Error {
  readonly slot: string
  readonly nodeClass: string
  readonly inputName: string
  readonly tried: string[]
  readonly enumerated: string[]
  constructor(details: { slot: string; nodeClass: string; inputName: string; tried: string[]; enumerated: string[]; patternLabel: string }) {
    super(composeRefusal(details))
    this.name = 'AnimationModelResolutionError'
    this.slot = details.slot
    this.nodeClass = details.nodeClass
    this.inputName = details.inputName
    this.tried = details.tried
    this.enumerated = details.enumerated
  }
}

// ---------------------------------------------------------------------------
// the documented ladder table
// ---------------------------------------------------------------------------

/** The maintainer's documented second preference for the text-encoder slot
 *  (directive 2026-10-07): the file the canonical install actually serves
 *  readably and the live review's real renders used. A PREFERENCE rung in
 *  the ladder — it applies only when the engine enumerates it, and it
 *  yields to an explicit override and to the exact pinned default. */
const TEXT_ENCODER_SECOND_PREFERENCE = 'qwen3vl_32b_int8_convrot.safetensors'

type SlotLadder = {
  /** The frozen-settings key that carries the slot's resolved name (and the
   *  explicit-override key). */
  setting: keyof ResolvedAnimationModels
  /** The node class + input that loads the slot (named in refusals). */
  nodeClass: string
  inputName: string
  /** The enumeration the slot resolves against. */
  source: keyof ModelEnumerations
  /** The exact pinned default (the preference seed). */
  pinned: string
  /** Extra documented exact preferences tried (in order) after the pin and
   *  before the pattern ladder. */
  extraPreferences?: string[]
  /** The pattern ladder: filename families the install serves. Order matters;
   *  within one pattern, candidates sort and the first wins. */
  patterns: RegExp[]
  /** How the pattern rung is named in refusals. */
  patternLabel: string
}

const LADDERS: Record<keyof ResolvedAnimationModels, SlotLadder> = {
  baseModel: {
    setting: 'baseModel',
    nodeClass: 'UNETLoader',
    inputName: 'unet_name',
    source: 'unet',
    pinned: ANIMATION_MODEL_DEFAULTS.refBase,
    patterns: [/minimax_h3_ref2va[^\s]*convrot/i],
    patternLabel: 'the minimax_h3_ref2va convrot family (the ref-conditioning base Set K measured)',
  },
  adapterLora: {
    setting: 'adapterLora',
    nodeClass: 'LoraLoaderModelOnly',
    inputName: 'lora_name',
    source: 'lora',
    pinned: '', // per-tool — see adapterLadderFor
    patterns: [],
    patternLabel: '',
  },
  textEncoder: {
    setting: 'textEncoder',
    nodeClass: 'CLIPLoader',
    inputName: 'clip_name',
    source: 'clip',
    pinned: ANIMATION_MODEL_DEFAULTS.textEncoder,
    extraPreferences: [TEXT_ENCODER_SECOND_PREFERENCE],
    patterns: [/qwen3vl_32b/i],
    patternLabel: 'a 32B-class qwen3vl text encoder',
  },
  videoVae: {
    setting: 'videoVae',
    nodeClass: 'VAELoader',
    inputName: 'vae_name',
    source: 'vae',
    pinned: ANIMATION_MODEL_DEFAULTS.videoVae,
    patterns: [/minimax_h3[^\s]*video[^\s]*vae/i],
    patternLabel: 'the minimax_h3 video VAE family (never the audio VAE)',
  },
}

/** The per-tool adapter ladder — the one slot whose pinned name and pattern
 *  depend on the attempt's tool (hero/tween/sequence adapters). */
function adapterLadderFor(tool: AnimationTool): SlotLadder {
  const pinned = ANIMATION_MODEL_DEFAULTS.adapters[tool] ?? ''
  const stems: Record<AnimationTool, RegExp> = {
    hero: /h3_hero/i,
    tween: /h3_tween/i,
    sequence: /h3_seq/i,
  }
  return {
    setting: 'adapterLora',
    nodeClass: 'LoraLoaderModelOnly',
    inputName: 'lora_name',
    source: 'lora',
    pinned,
    patterns: [stems[tool]],
    patternLabel: `the ${tool} keyframe adapter family (h3_${tool === 'sequence' ? 'seq' : tool})`,
  }
}

// ---------------------------------------------------------------------------
// sanitization-by-construction helpers
// ---------------------------------------------------------------------------

/** Filenames entering a refusal message: capped per-name and count so a
 *  pathological enumeration cannot flood or smuggle prose. */
const MAX_NAME_LENGTH = 160
const MAX_LISTED_NAMES = 12

function safeName(name: string): string {
  return name.length <= MAX_NAME_LENGTH ? name : `${name.slice(0, MAX_NAME_LENGTH)}…`
}

function listNames(names: string[]): string {
  const sorted = [...names].sort()
  const listed = sorted.slice(0, MAX_LISTED_NAMES).map((name) => `"${safeName(name)}"`)
  const suffix = sorted.length > MAX_LISTED_NAMES ? ` (+${sorted.length - MAX_LISTED_NAMES} more)` : ''
  return listed.length > 0 ? `${listed.join(', ')}${suffix}` : '(nothing — the enumeration is empty)'
}

function composeRefusal(details: { slot: string; nodeClass: string; inputName: string; tried: string[]; enumerated: string[]; patternLabel: string }): string {
  const triedText = details.tried.length > 0
    ? details.tried.map((name) => `"${safeName(name)}"`).join(', ')
    : 'nothing (no override, no pinned default, no documented preference)'
  return `The engine's enumeration cannot serve the animation lane's ${details.slot} slot (${details.nodeClass} input "${details.inputName}"). Tried in order: ${triedText}${details.patternLabel ? `, plus ${details.patternLabel}` : ''}. The engine enumerates: ${listNames(details.enumerated)}. Install or fetch a file one of those rungs matches, or set the attempt's ${details.slot} override to a name the engine serves.`
}

// ---------------------------------------------------------------------------
// the resolver
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** The explicit per-slot overrides a frozen snapshot's settings may carry —
 *  narrowed here once; absent/non-string entries simply do not override. */
export function modelOverrides(settings: unknown): Partial<ResolvedAnimationModels> {
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) return {}
  const record = settings as Record<string, unknown>
  const overrides: Partial<ResolvedAnimationModels> = {}
  for (const key of ['baseModel', 'adapterLora', 'textEncoder', 'videoVae'] as const) {
    if (isNonEmptyString(record[key])) overrides[key] = record[key]
  }
  return overrides
}

/** Resolves ONE slot through its ladder. Throws the named refusal on a dead
 *  slot. An explicit override is the operator's PIN: when the engine does
 *  not enumerate it the slot is DEAD right there — silently substituting a
 *  ladder match would ignore the pin (the silent-substitution failure mode
 *  the reviewer banned); without an override the ladder runs in order. */
function resolveSlot(ladder: SlotLadder, enumerated: string[], override: string | undefined): string {
  const serve = new Set(enumerated)
  if (override !== undefined) {
    if (serve.has(override)) return override
    throw new AnimationModelResolutionError({
      slot: ladder.setting,
      nodeClass: ladder.nodeClass,
      inputName: ladder.inputName,
      tried: [`${override} (the explicit override)`],
      enumerated,
      patternLabel: ladder.patternLabel,
    })
  }
  const tried: string[] = []
  if (ladder.pinned !== '') {
    tried.push(`${ladder.pinned} (the lane's pinned default)`)
    if (serve.has(ladder.pinned)) return ladder.pinned
  }
  for (const preference of ladder.extraPreferences ?? []) {
    tried.push(`${preference} (the documented preference)`)
    if (serve.has(preference)) return preference
  }
  for (const pattern of ladder.patterns) {
    const candidates = enumerated.filter((name) => pattern.test(name)).sort()
    if (candidates.length > 0) return candidates[0]
  }
  throw new AnimationModelResolutionError({
    slot: ladder.setting,
    nodeClass: ladder.nodeClass,
    inputName: ladder.inputName,
    tried,
    enumerated,
    patternLabel: ladder.patternLabel,
  })
}

/** Resolves the full set the animation graphs load — one enumerated name per
 *  slot by the documented preference order. Any dead slot throws the named
 *  refusal (nothing partial ever reaches a graph). */
export function resolveAnimationModels(input: { tool: AnimationTool; enumerations: ModelEnumerations; overrides?: Partial<ResolvedAnimationModels> }): ResolvedAnimationModels {
  const overrides = input.overrides ?? {}
  const adapterLadder = adapterLadderFor(input.tool)
  return {
    baseModel: resolveSlot(LADDERS.baseModel, input.enumerations.unet, overrides.baseModel),
    adapterLora: resolveSlot(adapterLadder, input.enumerations.lora, overrides.adapterLora),
    textEncoder: resolveSlot(LADDERS.textEncoder, input.enumerations.clip, overrides.textEncoder),
    videoVae: resolveSlot(LADDERS.videoVae, input.enumerations.vae, overrides.videoVae),
  }
}

/** Reads the RESOLVED model set a frozen snapshot's settings already carry
 *  (submit-time resolution stamps them; Fix B's frozen config) — null when
 *  any slot is missing (the deferred-resolution shape: resolve at dispatch). */
export function modelsFromSnapshotSettings(settings: unknown): ResolvedAnimationModels | null {
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) return null
  const record = settings as Record<string, unknown>
  const baseModel = record.baseModel
  const adapterLora = record.adapterLora
  const textEncoder = record.textEncoder
  const videoVae = record.videoVae
  if (!isNonEmptyString(baseModel) || !isNonEmptyString(adapterLora) || !isNonEmptyString(textEncoder) || !isNonEmptyString(videoVae)) return null
  return { baseModel, adapterLora, textEncoder, videoVae }
}

// ---------------------------------------------------------------------------
// content identities (extension lane Task 3, spec §5/§6) — the digesting seam
// ---------------------------------------------------------------------------

/** The engine-side model FOLDER a slot's weights live in — ComfyUI's own
 *  folder_names_and_paths vocabulary (the folders its /models/{kind} routes
 *  list), not a studio invention: `unet` slots load from diffusion_models,
 *  `clip` from text_encoders, `vae` from vae, `lora` from loras. */
export type ModelFolderKind = 'diffusion_models' | 'text_encoders' | 'vae' | 'loras'

/** Locates the LOCAL folder one evidence kind's weights live in — the v1
 *  identity-evidence contract (the design investigation's outcome, recorded
 *  in the lane docs): the engine can ENUMERATE names (/object_info) and STAT
 *  files (/experiment/models: name + mtime + size) but serves NO digest of
 *  model weights anywhere in its API surface (verified against the pinned
 *  canonical checkout + the comfyui-api capture), and /view deliberately
 *  serves only the input/output/temp dirs — never the model folders. The
 *  only honest digest source is therefore the weight files themselves, read
 *  through the folders the studio already configures as the fetch-landing
 *  roots (the same folders the engine scans: a fetch that lands there is
 *  what makes a file enumerable). The studio runs beside the engine on the
 *  same box — this resolver is wired from those settings. '' (empty) means
 *  UNCONFIGURED, and unconfigured is the named evidence refusal, never a
 *  name-only pass. */
export type ModelFolderResolver = (kind: ModelFolderKind) => string

/** The named refusal (spec §5: "identity evidence missing"): a slot RESOLVED
 *  — the engine enumerates the name — but the weight file's bytes cannot be
 *  read to digest (the folder is unconfigured, or holds no readable file at
 *  the enumerated name; an enumerated name pointing at a missing file is the
 *  standing alias hazard the wave-1 resolver already documents). The message
 *  is composed from fixed technical prose and capped filename/path-shaped
 *  values — the same sanitization-by-construction as the resolution refusal. */
export class AnimationModelEvidenceError extends Error {
  readonly slot: string
  readonly resolvedName: string
  readonly folderKind: ModelFolderKind
  readonly folder: string
  constructor(details: { slot: string; name: string; folderKind: ModelFolderKind; folder: string }) {
    super(composeEvidenceRefusal(details))
    this.name = 'AnimationModelEvidenceError'
    this.slot = details.slot
    this.resolvedName = details.name
    this.folderKind = details.folderKind
    this.folder = details.folder
  }
}

function composeEvidenceRefusal(details: { slot: string; name: string; folderKind: ModelFolderKind; folder: string }): string {
  const where = details.folder === ''
    ? "no models folder is configured for it (the studio's models root is empty for that kind)"
    : `the configured folder (${safeName(details.folder)}) holds no readable weight file at that name`
  return `Identity evidence is missing for the animation lane's ${details.slot} slot: the engine enumerates "${safeName(details.name)}" but ${where}. Content identities are DIGESTS of the resolved weights, not filenames — where the evidence is unavailable the compatibility check refuses (never a name-only pass). Point the studio's models root at the engine's models directory (the folder its /models/${details.folderKind} route lists) or place the enumerated file there.`
}

/** The slot → evidence-folder mapping (one table, beside the ladders it
 *  serves). Order is the identity list's documented order. */
const SLOT_EVIDENCE_FOLDERS: ReadonlyArray<{ slot: keyof ResolvedAnimationModels; kind: ModelFolderKind }> = [
  { slot: 'baseModel', kind: 'diffusion_models' },
  { slot: 'adapterLora', kind: 'loras' },
  { slot: 'textEncoder', kind: 'text_encoders' },
  { slot: 'videoVae', kind: 'vae' },
]

/** Joins an enumerated name (which may carry subfolder segments — ComfyUI
 *  enumerates relative paths) under its folder, refusing any name that
 *  would escape the folder ('..' / absolute / empty segments) — a
 *  pathological enumeration can never turn the evidence read into an
 *  arbitrary-file digest. */
function weightFilePath(folder: string, name: string): string | null {
  const segments = name.split(/[\\/]/).map((segment) => segment.trim()).filter((segment) => segment.length > 0)
  if (segments.length === 0 || segments.some((segment) => segment === '..' || segment === '.')) return null
  const root = resolve(folder)
  const resolved = resolve(folder, ...segments)
  if (resolved !== root && !resolved.startsWith(root + sep)) return null
  return resolved
}

/** The identity cache: keyed by ABSOLUTE PATH, trusted only while the
 *  file's (mtimeNs, size) stat pair is unchanged — a cache hit is never
 *  trusted past the file's mtime, so a replaced file re-hashes. Weight
 *  files are gigabytes; without this the hot submit path would re-hash
 *  them per attempt. Bounded FIFO (insertion order): 4 identities per
 *  attempt means even a long-lived server rotates it slowly. The residual
 *  (accepted, like every stat-keyed cache): bytes swapped while preserving
 *  nanosecond mtime AND size — not a shape any real file operation has. */
const identityCache = new Map<string, { statKey: string; identity: ModelContentIdentity }>()
const IDENTITY_CACHE_MAX = 512

/** Digests ONE weight file (streaming — the file can be gigabytes, so it is
 *  never buffered whole; the fetcher's sha256File precedent) through the
 *  stat-keyed cache. Null when the file cannot be read (absent, not a
 *  regular file, or vanishing between the stat and the stream — an
 *  unreadable file IS missing evidence) — the caller's named evidence
 *  refusal, never a hash of nothing and never an unclassified transport
 *  error. */
async function digestWeightFile(absPath: string, name: string): Promise<ModelContentIdentity | null> {
  const fileStat = await stat(absPath, { bigint: true }).catch(() => null)
  if (fileStat === null || !fileStat.isFile()) return null
  const statKey = `${fileStat.mtimeNs}:${fileStat.size}`
  const cached = identityCache.get(absPath)
  if (cached !== undefined && cached.statKey === statKey) return cached.identity
  const hash = createHash('sha256')
  const hashed = await pipeline(createReadStream(absPath), hash as unknown as NodeJS.WritableStream).catch(() => null)
  if (hashed === null) return null
  const identity: ModelContentIdentity = { name, digest: hash.digest('hex'), bytes: Number(fileStat.size) }
  if (identityCache.size >= IDENTITY_CACHE_MAX && !identityCache.has(absPath)) {
    const oldest = identityCache.keys().next().value
    if (oldest !== undefined) identityCache.delete(oldest)
  }
  identityCache.set(absPath, { statKey, identity })
  return identity
}

/** Digests the RESOLVED weights — the extension lane's one identity seam
 *  (spec §5 "the resolved model content identities"): resolves the four
 *  slots (through the caller's already-resolved set when it holds one — the
 *  submit-time preflight's — otherwise through the standing ladder against
 *  fresh enumerations, which may throw the wave-1 resolution refusal), then
 *  reads and sha-256-digests each resolved name's weight file through the
 *  configured evidence folder. Fail-closed by construction: a slot whose
 *  file cannot be read throws the NAMED evidence refusal — there is no
 *  name-only identity anywhere in this seam's output. */
export async function resolvedIdentities(input: {
  tool: AnimationTool
  modelFolder: ModelFolderResolver
  /** The caller's already-resolved set (the submit preflight's) — when
   *  present the ladder is not re-run and `enumerations` is unused. */
  models?: ResolvedAnimationModels
  /** Required when `models` is absent: the fresh enumeration the ladder
   *  resolves against (dispatch passes `force`-fetched truth). */
  enumerations?: ModelEnumerations
  overrides?: Partial<ResolvedAnimationModels>
}): Promise<ModelContentIdentity[]> {
  if (input.models === undefined && input.enumerations === undefined) {
    throw new Error("resolvedIdentities needs either the caller's resolved model set or the engine enumerations.")
  }
  const models = input.models ?? resolveAnimationModels({
    tool: input.tool,
    enumerations: input.enumerations as ModelEnumerations,
    overrides: input.overrides,
  })
  const identities: ModelContentIdentity[] = []
  for (const evidence of SLOT_EVIDENCE_FOLDERS) {
    const name = models[evidence.slot]
    const folder = input.modelFolder(evidence.kind)
    if (folder === '') {
      throw new AnimationModelEvidenceError({ slot: evidence.slot, name, folderKind: evidence.kind, folder: '' })
    }
    const file = weightFilePath(folder, name)
    if (file === null) {
      throw new AnimationModelEvidenceError({ slot: evidence.slot, name, folderKind: evidence.kind, folder })
    }
    const identity = await digestWeightFile(file, name)
    if (identity === null) {
      throw new AnimationModelEvidenceError({ slot: evidence.slot, name, folderKind: evidence.kind, folder })
    }
    identities.push(identity)
  }
  return identities
}
