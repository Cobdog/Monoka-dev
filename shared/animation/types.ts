/**
 * The animation domain types (spec 2026-10-06-animation-authoring-module-design.md
 * — §5 the key-slot model, §7.2 the service contract, §11.2 the document
 * schema): the shared module's first file, consumed by the server store and
 * routes, the client workbench, and the caption compiler.
 *
 * Pure TypeScript on purpose — no Node or browser APIs (Task 3's dual-build
 * rule compiles this file under both Bundler+DOM and NodeNext resolution).
 * Validation is hand-rolled in the server/documents.ts narrowing idiom
 * (typeof checks, no `any`, no cast without a preceding check) — no schema
 * library, no new dependency.
 *
 * Parser contract — `parse*` return null on ANY malformation; the caller
 * decides 400 vs degrade. Beyond shape, the parser enforces the document's
 * internal pointer integrity, the same class as the spec's own "a span
 * connects key slots": a selectedCandidateId must live in its own slot, a
 * rolling reference must name one of its slot's attempts, an editorial
 * contribution must name an existing span (or carry spanId null — the
 * spanless whole-scene lane, task 13), an activeBindingVersion must be
 * carried by the binding history (empty history allows only version 0 — the
 * pre-binding document), and entity ids are unique within their collection.
 * NOT enforced here (deliberately): editorial inFrame/outFrame ordering —
 * drawing holds may carry degenerate ranges and length semantics belong to
 * the export compiler (§11.3).
 */

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export type AnimationTool = 'hero' | 'tween' | 'sequence'
export type FacingTerm = 'toward camera' | 'back to camera' | 'screen-left' | 'screen-right'
export type MediumString = 'clean line on white' | 'flat black-and-white animatic' | 'flat cel colour on white'

export type AssetReference = { assetId: string; relPath: string | null; kind: 'image' | 'video' }

export type CandidateProvenance = {
  assetId: string // the stable image asset
  sourceTake?: string // when extracted from a clip
  sourceFrame?: number
  generatingOp?: string // the attempt id when generated
  inputRevisions?: Record<string, string>
}

export type KeyCandidate = {
  id: string // UUID
  assetReference: AssetReference
  origin: 'import' | 'hero' | 'frame-promotion' | 'project-asset'
  provenance: CandidateProvenance
  poseDescription: string | null // follows the candidate (spec §5.1)
  facing: FacingTerm | null
}

export type KeySlot = { id: string; order: number; selectedCandidateId: string | null; candidates: KeyCandidate[]; lock: boolean }

export type TweenStepSlot = { id: string; attempts: string[]; selectedRollingReference: { attemptId: string; frameIndex: number } | null }

export type SessionOverrides = { medium?: MediumString; scene?: string; camera?: { description: string; reason: string } }

export type Span = {
  id: string
  fromKeyId: string
  toKeyId: string
  intent: { movement: string; preservation: string }
  overrides: SessionOverrides
  stepSlots: TweenStepSlot[]
  stale: boolean
  staleReasons: string[] // e.g. ['binding', 'pose', 'intent', 'settings']
}

export type BindingVersion = {
  version: number
  characterDescription: string
  referenceAssetIds: string[]
  medium: MediumString
  initialKeyAssetId: string
  boundAt: number
}

export type BindingInput = { characterDescription: string; referenceAssetIds: string[]; medium: MediumString; initialKeyAssetId: string }

/** One contribution in the document's ordered editorial list (§9/§11.2): the
 *  clip this entry contributes (attemptId), the portion (inFrame..outFrame,
 *  start-inclusive/end-exclusive integer frames), and the hold
 *  (holdDuration, in output frames). spanId names the owning span for a
 *  tween clip's contribution; NULL names a whole-scene render (a sequence
 *  window take — §11.2: a sequence attempt owns no span, task 13). */
export type EditorialContribution = { id: string; spanId: string | null; attemptId: string; inFrame: number; outFrame: number; holdDuration: number }

export type AnimationDocumentBody = {
  keys: KeySlot[]
  spans: Span[]
  bindingHistory: BindingVersion[]
  activeBindingVersion: number
  editorial: EditorialContribution[]
  settings: { outputWidth: number; outputHeight: number; fps: 24; steps: number }
}

export type FrozenAttemptSnapshot = {
  tool: AnimationTool
  targetId: string
  references: Array<{
    role: 'current-key' | 'rolling-near' | 'fixed-far' | 'window-start' | 'window-end'
    assetReference: AssetReference
    poseDescription: string | null
    facing: FacingTerm | null
  }>
  caption: string
  compilerVersion: string
  settings: Record<string, unknown>
  documentRevision: number
  /** HERO only (task 11, §5.2 + §8.1 "submission freezes the attempt's
   *  inputs"): the frozen authoring draft — the key the arc describes FROM
   *  (its selected candidate froze as the 'current-key' reference, while
   *  `targetId` names the PROPOSED slot the clip lands into), the authored
   *  movement arc verbatim, and the resolved overrides. The playhead's
   *  in-flight rule, the re-roll's byte-identical resubmission, and the
   *  span-into-the-accepted-key action all read this; tween/sequence
   *  snapshots leave it unset. */
  hero?: {
    sourceKeyId: string
    movementArc: string
    overrides: { medium: MediumString; scene?: string; camera?: { description: string; reason: string } }
  }
  /** SEQUENCE only (task 12, §5.2/§6.2 + §8.1 "submission freezes the
   *  attempt's inputs"): the frozen authoring window — the two endpoint
   *  keys (targetId IS the window start; this block carries the end), the
   *  ordered action beats verbatim, the preservation text, and the resolved
   *  overrides. A sequence draft owns no span (§8.1: spans own tween motion
   *  intent), so the frozen attempt is its ONLY durable home — the re-roll
   *  resubmits this block byte-identically; hero/tween snapshots leave it
   *  unset. */
  sequence?: {
    windowStartKeyId: string
    windowEndKeyId: string
    orderedActions: string[]
    preservation: string
    overrides: { medium: MediumString; scene?: string; camera?: { description: string; reason: string } }
  }
}

export type AttemptExecutionState = 'queued' | 'rendering' | 'preparing' | 'ready' | 'failed' | 'cancelled' | 'interrupted' | 'reconciling'

// ---------------------------------------------------------------------------
// closed vocabularies (byte-identical fixed strings, spec §6.3)
// ---------------------------------------------------------------------------

export const ANIMATION_MEDIA: readonly MediumString[] = ['clean line on white', 'flat black-and-white animatic', 'flat cel colour on white']
export const FACING_TERMS: readonly FacingTerm[] = ['toward camera', 'back to camera', 'screen-left', 'screen-right']

/** The medium vocabulary's chip keys (task 7): the kit's exclusive ChipGroup
 *  keys a member by its `id` AND renders it as the DOM id — the medium
 *  strings carry spaces, so the group key is this deterministic slug and
 *  the medium string itself stays the chip's accessible name. Pure and
 *  environment-neutral like the rest of this module; both medium pickers
 *  (the binding panel, the Workbench exit arm) derive through these two so
 *  the mapping exists exactly once. */
export function mediumChipId(medium: MediumString): string {
  return `anim-medium-${medium.replace(/[^a-z]+/g, '-')}`
}

export function mediumFromChipId(chipId: string): MediumString | null {
  for (const medium of ANIMATION_MEDIA) {
    if (mediumChipId(medium) === chipId) return medium
  }
  return null
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function isFacingTerm(value: unknown): value is FacingTerm {
  return typeof value === 'string' && (FACING_TERMS as readonly string[]).includes(value)
}

export function isMediumString(value: unknown): value is MediumString {
  return typeof value === 'string' && (ANIMATION_MEDIA as readonly string[]).includes(value)
}

/** Canonical (lowercase) UUID shape — spec §11.2 "UUIDs for entity IDs". */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// ---------------------------------------------------------------------------
// small narrowing helpers (module-local, the documents.ts str/num idiom)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false
  return Object.values(value).every((v) => typeof v === 'string')
}

// ---------------------------------------------------------------------------
// parsers (validate in place, build the typed result from checked parts —
// a returned object contains nothing that was not itself checked)
// ---------------------------------------------------------------------------

function parseAssetReference(value: unknown): AssetReference | null {
  if (!isRecord(value)) return null
  const { assetId, relPath, kind } = value
  // assetId references the shared asset store, whose ids predate this module
  // — any non-empty string, not a UUID check.
  if (!isNonEmptyString(assetId)) return null
  if (relPath !== null && typeof relPath !== 'string') return null
  if (kind !== 'image' && kind !== 'video') return null
  return { assetId, relPath, kind }
}

function parseCandidateProvenance(value: unknown): CandidateProvenance | null {
  if (!isRecord(value)) return null
  const { assetId, sourceTake, sourceFrame, generatingOp, inputRevisions } = value
  if (!isNonEmptyString(assetId)) return null
  const provenance: CandidateProvenance = { assetId }
  if (sourceTake !== undefined) {
    // A take id from the outputs surface — not an animation-module UUID.
    if (!isNonEmptyString(sourceTake)) return null
    provenance.sourceTake = sourceTake
  }
  if (sourceFrame !== undefined) {
    if (!isNonNegativeInt(sourceFrame)) return null
    provenance.sourceFrame = sourceFrame
  }
  if (generatingOp !== undefined) {
    if (!isUuid(generatingOp)) return null
    provenance.generatingOp = generatingOp
  }
  if (inputRevisions !== undefined) {
    if (!isStringRecord(inputRevisions)) return null
    provenance.inputRevisions = inputRevisions
  }
  return provenance
}

export function parseKeyCandidate(value: unknown): KeyCandidate | null {
  if (!isRecord(value)) return null
  const { id, assetReference, origin, provenance, poseDescription, facing } = value
  if (!isUuid(id)) return null
  const asset = parseAssetReference(assetReference)
  if (!asset) return null
  if (origin !== 'import' && origin !== 'hero' && origin !== 'frame-promotion' && origin !== 'project-asset') return null
  const parsedProvenance = parseCandidateProvenance(provenance)
  if (!parsedProvenance) return null
  if (poseDescription !== null && typeof poseDescription !== 'string') return null
  if (facing !== null && !isFacingTerm(facing)) return null
  return { id, assetReference: asset, origin, provenance: parsedProvenance, poseDescription, facing }
}

function parseKeySlot(value: unknown): KeySlot | null {
  if (!isRecord(value)) return null
  const { id, order, selectedCandidateId, candidates, lock } = value
  if (!isUuid(id)) return null
  if (!isNonNegativeInt(order)) return null
  if (selectedCandidateId !== null && !isUuid(selectedCandidateId)) return null
  if (!Array.isArray(candidates)) return null
  const parsedCandidates: KeyCandidate[] = []
  const candidateIds = new Set<string>()
  for (const raw of candidates) {
    const candidate = parseKeyCandidate(raw)
    if (!candidate) return null
    if (candidateIds.has(candidate.id)) return null
    candidateIds.add(candidate.id)
    parsedCandidates.push(candidate)
  }
  if (typeof lock !== 'boolean') return null
  if (selectedCandidateId !== null && !candidateIds.has(selectedCandidateId)) return null
  return { id, order, selectedCandidateId, candidates: parsedCandidates, lock }
}

function parseTweenStepSlot(value: unknown): TweenStepSlot | null {
  if (!isRecord(value)) return null
  const { id, attempts, selectedRollingReference } = value
  if (!isUuid(id)) return null
  if (!Array.isArray(attempts)) return null
  const parsedAttempts: string[] = []
  for (const raw of attempts) {
    if (!isUuid(raw)) return null
    parsedAttempts.push(raw)
  }
  let rolling: TweenStepSlot['selectedRollingReference'] = null
  if (selectedRollingReference !== null) {
    if (!isRecord(selectedRollingReference)) return null
    const { attemptId, frameIndex } = selectedRollingReference
    if (!isUuid(attemptId)) return null
    if (!isNonNegativeInt(frameIndex)) return null
    if (!parsedAttempts.includes(attemptId)) return null
    rolling = { attemptId, frameIndex }
  }
  return { id, attempts: parsedAttempts, selectedRollingReference: rolling }
}

function parseSessionOverrides(value: unknown): SessionOverrides | null {
  if (!isRecord(value)) return null
  const { medium, scene, camera } = value
  const overrides: SessionOverrides = {}
  if (medium !== undefined) {
    if (!isMediumString(medium)) return null
    overrides.medium = medium
  }
  if (scene !== undefined) {
    if (typeof scene !== 'string') return null
    overrides.scene = scene
  }
  if (camera !== undefined) {
    if (!isRecord(camera)) return null
    const { description, reason } = camera
    if (typeof description !== 'string' || typeof reason !== 'string') return null
    overrides.camera = { description, reason }
  }
  return overrides
}

function parseSpan(value: unknown, keyIds: ReadonlySet<string>): Span | null {
  if (!isRecord(value)) return null
  const { id, fromKeyId, toKeyId, intent, overrides, stepSlots, stale, staleReasons } = value
  if (!isUuid(id)) return null
  if (!isUuid(fromKeyId) || !keyIds.has(fromKeyId)) return null
  if (!isUuid(toKeyId) || !keyIds.has(toKeyId)) return null
  if (!isRecord(intent)) return null
  const { movement, preservation } = intent
  if (typeof movement !== 'string' || typeof preservation !== 'string') return null
  const parsedOverrides = parseSessionOverrides(overrides)
  if (!parsedOverrides) return null
  if (!Array.isArray(stepSlots)) return null
  const parsedSteps: TweenStepSlot[] = []
  const stepIds = new Set<string>()
  for (const raw of stepSlots) {
    const step = parseTweenStepSlot(raw)
    if (!step) return null
    if (stepIds.has(step.id)) return null
    stepIds.add(step.id)
    parsedSteps.push(step)
  }
  if (typeof stale !== 'boolean') return null
  if (!Array.isArray(staleReasons)) return null
  const parsedReasons: string[] = []
  for (const raw of staleReasons) {
    if (typeof raw !== 'string') return null
    parsedReasons.push(raw)
  }
  return {
    id,
    fromKeyId,
    toKeyId,
    intent: { movement, preservation },
    overrides: parsedOverrides,
    stepSlots: parsedSteps,
    stale,
    staleReasons: parsedReasons,
  }
}

function parseBindingVersion(value: unknown): BindingVersion | null {
  if (!isRecord(value)) return null
  const { version, characterDescription, referenceAssetIds, medium, initialKeyAssetId, boundAt } = value
  if (!isPositiveInt(version)) return null
  if (typeof characterDescription !== 'string') return null
  if (!Array.isArray(referenceAssetIds)) return null
  const parsedRefs: string[] = []
  for (const raw of referenceAssetIds) {
    if (!isNonEmptyString(raw)) return null
    parsedRefs.push(raw)
  }
  if (!isMediumString(medium)) return null
  if (!isNonEmptyString(initialKeyAssetId)) return null
  if (!isNonNegativeInt(boundAt)) return null
  return { version, characterDescription, referenceAssetIds: parsedRefs, medium, initialKeyAssetId, boundAt }
}

function parseEditorialContribution(value: unknown, spanIds: ReadonlySet<string>): EditorialContribution | null {
  if (!isRecord(value)) return null
  const { id, spanId, attemptId, inFrame, outFrame, holdDuration } = value
  if (!isUuid(id)) return null
  // spanId null = the spanless lane (a sequence window take, task 13); a
  // non-null id must name an existing span.
  if (spanId !== null && (!isUuid(spanId) || !spanIds.has(spanId))) return null
  if (!isUuid(attemptId)) return null
  if (!isNonNegativeInt(inFrame)) return null
  if (!isNonNegativeInt(outFrame)) return null
  if (!isNonNegativeInt(holdDuration)) return null
  // inFrame/outFrame ordering deliberately unchecked — see the module header.
  return { id, spanId, attemptId, inFrame, outFrame, holdDuration }
}

function parseAnimationSettings(value: unknown): AnimationDocumentBody['settings'] | null {
  if (!isRecord(value)) return null
  const { outputWidth, outputHeight, fps, steps } = value
  if (!isPositiveInt(outputWidth)) return null
  if (!isPositiveInt(outputHeight)) return null
  if (fps !== 24) return null // the schema's constant (§11.3: constant 24 fps)
  if (!isPositiveInt(steps)) return null
  return { outputWidth, outputHeight, fps, steps }
}

export function parseAnimationDocumentBody(value: unknown): AnimationDocumentBody | null {
  if (!isRecord(value)) return null
  const { keys, spans, bindingHistory, activeBindingVersion, editorial, settings } = value
  if (!Array.isArray(keys)) return null
  if (!Array.isArray(spans)) return null
  if (!Array.isArray(bindingHistory)) return null
  if (!Array.isArray(editorial)) return null
  if (!isNonNegativeInt(activeBindingVersion)) return null
  const parsedSettings = parseAnimationSettings(settings)
  if (!parsedSettings) return null

  const parsedKeys: KeySlot[] = []
  const keyIds = new Set<string>()
  for (const raw of keys) {
    const slot = parseKeySlot(raw)
    if (!slot) return null
    if (keyIds.has(slot.id)) return null
    keyIds.add(slot.id)
    parsedKeys.push(slot)
  }

  const parsedSpans: Span[] = []
  const spanIds = new Set<string>()
  for (const raw of spans) {
    const span = parseSpan(raw, keyIds)
    if (!span) return null
    if (spanIds.has(span.id)) return null
    spanIds.add(span.id)
    parsedSpans.push(span)
  }

  const parsedHistory: BindingVersion[] = []
  const versions = new Set<number>()
  for (const raw of bindingHistory) {
    const binding = parseBindingVersion(raw)
    if (!binding) return null
    if (versions.has(binding.version)) return null
    versions.add(binding.version)
    parsedHistory.push(binding)
  }
  if (parsedHistory.length > 0) {
    if (!versions.has(activeBindingVersion)) return null
  } else if (activeBindingVersion !== 0) {
    return null
  }

  const parsedEditorial: EditorialContribution[] = []
  const editorialIds = new Set<string>()
  for (const raw of editorial) {
    const contribution = parseEditorialContribution(raw, spanIds)
    if (!contribution) return null
    if (editorialIds.has(contribution.id)) return null
    editorialIds.add(contribution.id)
    parsedEditorial.push(contribution)
  }

  return {
    keys: parsedKeys,
    spans: parsedSpans,
    bindingHistory: parsedHistory,
    activeBindingVersion,
    editorial: parsedEditorial,
    settings: parsedSettings,
  }
}

// ---------------------------------------------------------------------------
// animationInputHash — the idempotency-key comparison (§7.2.2 / §11.4)
// ---------------------------------------------------------------------------

/**
 * A stable hash of a frozen attempt snapshot: sha-256 over a canonical JSON
 * serialization (recursively key-sorted objects, arrays kept in order).
 * Idempotency-key comparison rides on this — two snapshots with the same
 * content MUST hash equal regardless of key order, and different content
 * MUST hash different, so a real digest rather than a checksum is the
 * contract (a collision would silently return the wrong attempt).
 *
 * The sha-256 and UTF-8 encoding are implemented inline (verified against
 * node:crypto during development) because this module must stay
 * environment-neutral: `node:crypto` is Node-only and WebCrypto is async,
 * while this function is synchronous and shared by server, client, and
 * compiler builds.
 */
export function animationInputHash(snapshot: FrozenAttemptSnapshot): string {
  return sha256Hex(canonicalJson(snapshot))
}

/** Canonical JSON: objects with recursively sorted keys (UTF-16 code-unit
 *  order — ECMAScript's specified default sort, identical in every engine),
 *  arrays in order, JSON.stringify string escaping. Non-JSON values
 *  (undefined, functions, symbols, bigints) canonicalize to null — snapshot
 *  settings are JSON by contract, and a total, deterministic function beats
 *  a crash on a compiler bug. */
function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      return String(value) // ToString of a double is fully specified — deterministic
    case 'string':
      return JSON.stringify(value)
    case 'object':
      if (Array.isArray(value)) return `[${value.map((element) => canonicalJson(element)).join(',')}]`
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
        .join(',')}}`
    default:
      return 'null'
  }
}

// --- inline sha-256 (FIPS 180-4); the K constants are the fractional parts
// --- of the cube roots of the first 64 primes.

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n))
}

/** UTF-8 encoding without TextEncoder (environment-neutrality again).
 *  canonicalJson only ever feeds it JSON.stringify-escaped strings, so lone
 *  surrogates never reach here. */
function utf8Bytes(input: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
        i++
      }
    }
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
  }
  return bytes
}

function sha256Hex(input: string): string {
  const message = utf8Bytes(input)
  const bitLength = message.length * 8
  message.push(0x80)
  while (message.length % 64 !== 56) message.push(0)
  const hi = Math.floor(bitLength / 0x100000000)
  const lo = bitLength >>> 0
  message.push(
    (hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff,
    (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff,
  )

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19

  const w = new Array<number>(64)
  for (let block = 0; block < message.length; block += 64) {
    for (let t = 0; t < 16; t++) {
      const o = block + t * 4
      w[t] = ((message[o] << 24) | (message[o + 1] << 16) | (message[o + 2] << 8) | message[o + 3]) >>> 0
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3)
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + SHA256_K[t] + w[t]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((word) => word.toString(16).padStart(8, '0')).join('')
}
