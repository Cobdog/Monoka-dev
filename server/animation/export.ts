/**
 * The animation export pipeline (task 14, k2q0n9s — spec
 * 2026-10-06-animation-authoring-module-design.md §9 "the selected sequence,
 * with timing and held frames preserved, plus provenance" and §11.3 the
 * export packaging decision): the delivery layer that freezes the document's
 * editorial truth, validates it, assembles ONE review package, and answers a
 * ZIP over HTTP.
 *
 * The package (§11.3, verbatim intent):
 *   - `sequence.mp4` — silent H.264, constant 24 fps, at the document's
 *     output dimensions;
 *   - `manifest.json` — a versioned assembly recipe: source identifiers and
 *     hashes, selected frame ranges, drawing holds, binding history, and the
 *     contributing attempt snapshots with their lineage.
 *
 * Integrity (§11.3, the acceptance core):
 *   - FREEZE BEFORE ASSEMBLY — `export()` reads the document row and its
 *     attempt rows ONCE, synchronously, before any await; the whole pipeline
 *     (gate, ffmpeg, manifest) consumes only that frozen value. Later edits
 *     cannot change a running export, and a re-export of an UNCHANGED
 *     document reproduces byte-identical video (bitexact encode, pinned
 *     threads — verified against the local toolchain during development).
 *   - REJECT, NEVER DROP — missing or incompatible selected media fails
 *     LOUDLY with the named contribution and the named media; nothing is
 *     silently skipped or clamped. The gate's inputs are the preview's
 *     problem classes (task 13's narrowing: export owns length semantics):
 *       · an unlanded attempt, a foreign attempt, a hero attempt (its
 *         product is a key drawing, §5.2) → refusal;
 *       · an out-of-range selection ([inFrame, outFrame) beyond the clip's
 *         frame count) → refusal;
 *       · a degenerate range (out ≤ in) is LEGAL — a held drawing — provided
 *         the held frame exists and the entry contributes at least one
 *         output frame; a zero-output-frame entry is a phantom row in the
 *         manifest and is refused.
 *   - STALE-BUT-USABLE — a contribution riding a stale span, or a take that
 *     landed against an earlier document revision, exports ONLY after an
 *     explicit acknowledgment (`acknowledgeStale`) and is recorded stale
 *     (with its reasons) in the manifest. Without the acknowledgment the
 *     route answers 428 Precondition Required carrying the stale list — a
 *     distinct code from the module's 409 (the revision-conflict rebase
 *     surface), so the client can never mistake one for the other.
 *
 * Task 13's declared narrowing, DECIDED here: key-still contributions (a
 * held drawing sourced from a KEY's selected image, not from a landed clip)
 * are REJECTED at the gate — the EditorialContribution schema carries no
 * keyId, and widening the document schema (store lanes, routes, picker,
 * preview) inside the delivery task is scope creep. The document's honest
 * path to a held drawing is the degenerate clip range the schema already
 * serves (§11.3's "drawing holds"), and the manifest's conventions block
 * documents exactly that.
 *
 * Assembly mechanics (the datasets bake pattern — encode, then ASSERT the
 * decoded frame count, never trust the toolchain's rounding): each
 * contribution becomes one intermediate segment (trim → CFR 24 → fit within
 * the document's dimensions → letterbox → aspect-corrected SAR → the hold as
 * cloned tail frames → yuv420p), every segment's decoded count is asserted
 * against its intended output frames, then the segments concatenate by
 * stream copy and the total is asserted again. The hold rides tpad's clone
 * mode with a duration of exactly hold/24 s (measured exact on CFR sources);
 * a toolchain that ever disagreed would fail the assertion loudly, never
 * ship a short video.
 */
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AnimationRuleError, type AnimationAttemptRow, type AnimationDocumentRow, type AnimationStore } from './store'
import { packZip } from '../documentArchive'
import { decodedFrameCount, runTool } from '../datasets/probe'
import type { AnimationDocumentBody, FrozenAttemptSnapshot } from '../../shared/animation/types'

/** The manifest's own format version — bumped when the manifest SHAPE
 *  changes (distinct from the document schema version it also records). */
export const ANIMATION_EXPORT_MANIFEST_VERSION = 1

/** The hard ceiling on assembled output frames (a ~70-minute sequence at
 *  24 fps): a runaway selection refuses loudly instead of encoding for
 *  hours. Generous by design — real sessions sit in the hundreds. */
export const MAX_EXPORT_FRAMES = 100_000

export const EXPORT_FPS = 24

// ---------------------------------------------------------------------------
// the gate (pure — the plan derivation the route and the tests share)
// ---------------------------------------------------------------------------

/** One contribution as the assembler will burn it: the recipe verbatim, the
 *  resolved source window (a degenerate range trims [in, in+1) — the frame
 *  the hold points AT), and the stale mark §11.3 records. */
export type ExportSegmentSpec = {
  contributionId: string
  attemptId: string
  spanId: string | null
  inFrame: number
  outFrame: number
  holdDuration: number
  clipFrames: number
  holdFrames: number
  outputFrames: number
  outputStart: number
  /** The trimmed source window, start-inclusive/end-exclusive. */
  selStart: number
  selEnd: number
  sourceRelPath: string
  /** The media's absolute path (null = the blob is not resolvable — a
   *  named refusal, never a skipped entry). */
  sourceAbsPath: string | null
  sourceFrameCount: number
  stale: boolean
  staleReasons: string[]
}

/** A stale-but-usable selection the acknowledgment prompt names (§11.3). */
export type ExportStaleSelection = {
  contributionId: string
  attemptId: string
  label: string
  reasons: string[]
}

export type ExportPlan = {
  fps: 24
  totalFrames: number
  segments: ExportSegmentSpec[]
  stale: ExportStaleSelection[]
  /** Every named refusal, in list order — non-empty means NO export. */
  refusals: string[]
}

/** Thrown when stale-but-usable selections export without the explicit
 *  acknowledgment: the route maps this to 428 Precondition Required carrying
 *  the stale list (a code deliberately distinct from the module's 409 — the
 *  revision-conflict rebase surface — so no client can mistake one for the
 *  other). */
export class AnimationExportStaleError extends Error {
  readonly staleSelections: ExportStaleSelection[]
  constructor(staleSelections: ExportStaleSelection[]) {
    super(`This sequence holds ${staleSelections.length} stale-but-usable selection(s) — acknowledge them to export: ${staleSelections.map((entry) => entry.label).join('; ')}.`)
    this.name = 'AnimationExportStaleError'
    this.staleSelections = staleSelections
  }
}

/** The attempt facts the plan labels a source with (the store's hydrated row
 *  satisfies this structurally; tests may pass narrower literals). */
export type ExportAttemptFacts = Pick<AnimationAttemptRow, 'id' | 'tool' | 'targetId' | 'snapshot' | 'execution'> & {
  result: AnimationAttemptRow['result']
}

/** The stale reasons of ONE contribution, resolved from the frozen truth:
 *  a tween lane rides its span's staleness marking (§8.3), and BOTH lanes
 *  honor §8.2's earlierRevision flag — the LANDING's own verdict, computed
 *  against the revision that stood when the take landed. Deliberately NOT
 *  the freeze-time revision drift: revisions move for unrelated reasons
 *  (assembly decisions themselves bump them — §9), so drift alone would
 *  mark every take stale after any edit; the flag captures exactly the
 *  race it names (the document moved between the render's submission and
 *  its landing). */
function staleReasonsOf(entry: AnimationDocumentBody['editorial'][number], attempt: ExportAttemptFacts, document: AnimationDocumentRow): string[] {
  const reasons: string[] = []
  if (entry.spanId !== null) {
    const span = document.body.spans.find((candidate) => candidate.id === entry.spanId)
    if (span?.stale) reasons.push(...span.staleReasons.length > 0 ? span.staleReasons : ['stale'])
  }
  if (attempt.result?.candidate.earlierRevision === true) reasons.push('earlier-revision')
  return [...new Set(reasons)]
}

/** The human label the stale prompt and the manifest share (the preview's
 *  own vocabulary, so one name follows a contribution everywhere). */
function sourceLabel(entry: AnimationDocumentBody['editorial'][number], attempt: ExportAttemptFacts | null, document: AnimationDocumentRow): string {
  if (attempt === null) return `contribution ${entry.id.slice(0, 8)} (attempt ${entry.attemptId.slice(0, 8)} — no such attempt row)`
  if (attempt.tool === 'tween') {
    const span = document.body.spans.find((candidate) => candidate.id === entry.spanId)
    const stepIndex = span?.stepSlots.findIndex((slot) => slot.id === attempt.targetId)
    return `Tween step ${stepIndex === undefined || stepIndex < 0 ? '?' : stepIndex + 1} of span ${entry.spanId?.slice(0, 8) ?? '?'} (attempt ${entry.attemptId.slice(0, 8)})`
  }
  const sequence = attempt.snapshot.sequence
  return `Sequence window take (attempt ${entry.attemptId.slice(0, 8)}${sequence ? `, keys ${sequence.windowStartKeyId.slice(0, 8)} → ${sequence.windowEndKeyId.slice(0, 8)}` : ''})`
}

/**
 * Derives the assembly plan from the FROZEN document + attempts (§11.3's
 * gate): every editorial entry resolves to a burnable segment or a NAMED
 * refusal; stale-but-usable selections collect for the acknowledgment
 * prompt. Pure and synchronous — `resolveMedia` is the document store's own
 * synchronous blob resolution (`resolveBlobFile`), so a missing media file
 * is a gate fact, not an assembly surprise.
 */
export function deriveExportPlan(
  document: AnimationDocumentRow,
  attempts: ReadonlyArray<ExportAttemptFacts>,
  resolveMedia: (relPath: string) => string | null,
): ExportPlan {
  const refusals: string[] = []
  const stale: ExportStaleSelection[] = []
  const segments: ExportSegmentSpec[] = []
  let outputStart = 0

  if (document.body.editorial.length === 0) {
    refusals.push('The assembled sequence is empty — contribute at least one landed clip before exporting.')
  }
  // H.264 at 4:2:0 chroma needs even dimensions; the settings schema allows
  // any positive integer pair, so an odd pair is refused HERE, by name —
  // never discovered as an ffmpeg failure mid-assembly.
  const { outputWidth, outputHeight } = document.body.settings
  if (outputWidth % 2 !== 0 || outputHeight % 2 !== 0) {
    refusals.push(`The document's output dimensions (${outputWidth}x${outputHeight}) are odd — H.264 at 4:2:0 chroma needs even dimensions; adjust the document's settings before exporting.`)
  }

  for (const entry of document.body.editorial) {
    const attempt = attempts.find((candidate) => candidate.id === entry.attemptId) ?? null
    const label = sourceLabel(entry, attempt, document)
    if (attempt === null) {
      refusals.push(`${label}: the contributed attempt is not an attempt of this document — the export refuses rather than dropping it.`)
      continue
    }
    if (attempt.tool === 'hero') {
      refusals.push(`${label}: the hero lane's product is a key drawing (§5.2), not a sequence contribution — a held drawing comes from a landed clip's degenerate range.`)
      continue
    }
    if (attempt.result === null) {
      refusals.push(`${label}: the contributed attempt has not landed (execution "${attempt.execution.state}") — it contributes nothing until its take lands; the export refuses rather than dropping it.`)
      continue
    }
    const candidate = attempt.result.candidate
    const frameCount = candidate.frameCount
    if (candidate.assetReference.kind !== 'video') {
      refusals.push(`${label}: the landed media is not a video clip (kind "${candidate.assetReference.kind}") — the export refuses rather than dropping it.`)
      continue
    }
    const relPath = candidate.assetReference.relPath
    const absPath = typeof relPath === 'string' && relPath ? resolveMedia(relPath) : null
    if (absPath === null) {
      refusals.push(`${label}: the selected media (${typeof relPath === 'string' ? relPath : 'no materialized asset'}) is missing from the store — re-land or re-render the clip; the export refuses rather than dropping it.`)
      continue
    }
    // Length semantics live HERE (task 13's narrowing): the clip frames the
    // entry burns, the degenerate-range rule, the range bounds.
    const clipFrames = Math.max(0, entry.outFrame - entry.inFrame)
    if (clipFrames > 0 && entry.outFrame > frameCount) {
      refusals.push(`${label}: the selection [${entry.inFrame}, ${entry.outFrame}) exceeds the clip's ${frameCount} frames — narrow it before export (the export refuses rather than clamping).`)
      continue
    }
    // The degenerate range is a held drawing: trim the ONE frame the range
    // points at, clone the rest. That frame must exist; and whatever the
    // range, the entry must contribute at least one output frame — a
    // zero-frame entry is a phantom manifest row.
    const selEnd = clipFrames > 0 ? entry.outFrame : entry.inFrame + 1
    if (clipFrames === 0 && entry.inFrame >= frameCount) {
      refusals.push(`${label}: the held drawing points at frame ${entry.inFrame} of a ${frameCount}-frame clip — a degenerate range must name an existing frame; the export refuses rather than dropping it.`)
      continue
    }
    const outputFrames = clipFrames + entry.holdDuration
    if (outputFrames < 1) {
      refusals.push(`${label}: the entry contributes no frames (a degenerate range with no hold) — set a hold or widen the range; the export refuses a phantom manifest row.`)
      continue
    }
    const reasons = staleReasonsOf(entry, attempt, document)
    if (reasons.length > 0) stale.push({ contributionId: entry.id, attemptId: entry.attemptId, label, reasons })
    segments.push({
      contributionId: entry.id,
      attemptId: entry.attemptId,
      spanId: entry.spanId,
      inFrame: entry.inFrame,
      outFrame: entry.outFrame,
      holdDuration: entry.holdDuration,
      clipFrames,
      holdFrames: entry.holdDuration,
      outputFrames,
      outputStart,
      selStart: entry.inFrame,
      selEnd,
      sourceRelPath: relPath as string,
      sourceAbsPath: absPath,
      sourceFrameCount: frameCount,
      stale: reasons.length > 0,
      staleReasons: reasons,
    })
    outputStart += outputFrames
  }

  if (segments.length > 0 && outputStart > MAX_EXPORT_FRAMES) {
    refusals.push(`The assembled sequence is ${outputStart} frames — beyond the export ceiling of ${MAX_EXPORT_FRAMES}. Split the document or trim the contribution list.`)
  }

  return { fps: EXPORT_FPS, totalFrames: outputStart, segments, stale, refusals }
}

// ---------------------------------------------------------------------------
// the manifest (pure)
// ---------------------------------------------------------------------------

/** A contributing attempt as the manifest records it (§11.3: "contributing
 *  attempt snapshots and lineage") — the frozen inputs verbatim plus the
 *  document-position lineage resolved at freeze time. */
export type ManifestAttemptLineage = {
  attemptId: string
  tool: string
  targetId: string
  idempotencyKey: string
  inputHash: string
  snapshot: FrozenAttemptSnapshot
  lineage: {
    spanId?: string
    stepSlotIndex?: number
    windowStartKeyId?: string
    windowEndKeyId?: string
  }
  landed: {
    assetReference: { assetId: string; relPath: string | null; kind: string }
    frameCount: number
    earlierRevision: boolean
  }
}

export type ExportManifest = {
  manifestVersion: number
  kind: 'minimax-animation-sequence'
  frozenAt: number
  staleAcknowledged: boolean
  document: {
    id: string
    name: string
    schemaVersion: number
    revision: number
    settings: AnimationDocumentBody['settings']
    bindingHistory: AnimationDocumentBody['bindingHistory']
    activeBindingVersion: number
  }
  sequence: {
    fps: 24
    totalFrames: number
    durationSeconds: number
    video: { file: 'sequence.mp4'; sha256: string; codec: 'h264'; width: number; height: number; frameCount: number }
    conventions: {
      frameIndices: string
      clipRanges: string
      holds: string
      clipPolicy: string
      degenerateRanges: string
      conform: string
      silence: string
    }
  }
  contributions: Array<{
    contributionId: string
    attemptId: string
    spanId: string | null
    inFrame: number
    outFrame: number
    holdDuration: number
    clipFrames: number
    outputFrames: number
    outputStart: number
    source: { relPath: string; sha256: string; frameCount: number }
    stale: { stale: boolean; reasons: string[] }
    attempt: ManifestAttemptLineage
  }>
}

/** Builds the manifest from the frozen plan + the assembly's measured
 *  facts (hashes, verified frame count). Pure. */
export function buildManifest(input: {
  document: AnimationDocumentRow
  attempts: ReadonlyArray<AnimationAttemptRow>
  plan: ExportPlan
  videoSha256: string
  videoFrameCount: number
  sourceHashes: ReadonlyMap<string, string>
  frozenAt: number
  staleAcknowledged: boolean
}): ExportManifest {
  const { document, attempts, plan, videoSha256, videoFrameCount, sourceHashes, frozenAt, staleAcknowledged } = input
  const body = document.body
  const contributions: ExportManifest['contributions'] = plan.segments.map((segment) => {
    const attempt = attempts.find((candidate) => candidate.id === segment.attemptId)!
    const lineage: ManifestAttemptLineage['lineage'] = {}
    if (segment.spanId !== null) {
      lineage.spanId = segment.spanId
      const span = body.spans.find((candidate) => candidate.id === segment.spanId)
      const index = span?.stepSlots.findIndex((slot) => slot.id === attempt.targetId) ?? -1
      if (index >= 0) lineage.stepSlotIndex = index
    }
    if (attempt.snapshot.sequence !== undefined) {
      lineage.windowStartKeyId = attempt.snapshot.sequence.windowStartKeyId
      lineage.windowEndKeyId = attempt.snapshot.sequence.windowEndKeyId
    }
    const manifestAttempt: ManifestAttemptLineage = {
      attemptId: attempt.id,
      tool: attempt.tool,
      targetId: attempt.targetId,
      idempotencyKey: attempt.idempotencyKey,
      inputHash: attempt.inputHash,
      snapshot: attempt.snapshot,
      lineage,
      landed: {
        assetReference: attempt.result!.candidate.assetReference,
        frameCount: attempt.result!.candidate.frameCount,
        earlierRevision: attempt.result!.candidate.earlierRevision,
      },
    }
    return {
      contributionId: segment.contributionId,
      attemptId: segment.attemptId,
      spanId: segment.spanId,
      inFrame: segment.inFrame,
      outFrame: segment.outFrame,
      holdDuration: segment.holdDuration,
      clipFrames: segment.clipFrames,
      outputFrames: segment.outputFrames,
      outputStart: segment.outputStart,
      source: {
        relPath: segment.sourceRelPath,
        sha256: sourceHashes.get(segment.attemptId) ?? '',
        frameCount: segment.sourceFrameCount,
      },
      stale: { stale: segment.stale, reasons: segment.staleReasons },
      attempt: manifestAttempt,
    }
  })
  const width = body.settings.outputWidth
  const height = body.settings.outputHeight
  return {
    manifestVersion: ANIMATION_EXPORT_MANIFEST_VERSION,
    kind: 'minimax-animation-sequence',
    frozenAt,
    staleAcknowledged,
    document: {
      id: document.id,
      name: document.name,
      schemaVersion: document.schemaVersion,
      revision: document.revision,
      settings: body.settings,
      bindingHistory: body.bindingHistory,
      activeBindingVersion: body.activeBindingVersion,
    },
    sequence: {
      fps: 24,
      totalFrames: plan.totalFrames,
      durationSeconds: plan.totalFrames / 24,
      video: { file: 'sequence.mp4', sha256: videoSha256, codec: 'h264', width, height, frameCount: videoFrameCount },
      conventions: {
        frameIndices: 'integer, 0-based',
        clipRanges: 'start-inclusive, end-exclusive',
        holds: 'drawing holds measured in OUTPUT frames at the sequence frame rate',
        clipPolicy: 'a selected clip retains its frame order and existing held frames; no interpolation, no retiming — sources are conformed to constant 24 fps',
        degenerateRanges: 'inFrame === outFrame is a held drawing: the frame at inFrame holds for holdDuration output frames',
        conform: `sources are scaled to fit within ${width}x${height} preserving aspect and letterboxed (black) to the document's output dimensions`,
        silence: 'sequence.mp4 carries no audio track',
      },
    },
    contributions,
  }
}

// ---------------------------------------------------------------------------
// the assembler (ffmpeg; the datasets bake discipline)
// ---------------------------------------------------------------------------

/** The per-segment filter chain (pure — unit-pinned): trim the selected
 *  window, re-base timestamps, pin CFR 24, fit within the document's
 *  dimensions preserving aspect, letterbox, square the sample aspect, clone
 *  the hold frames onto the tail, land on yuv420p. */
export function segmentFilter(segment: ExportSegmentSpec, width: number, height: number): string {
  const filters = [
    `trim=start_frame=${segment.selStart}:end_frame=${segment.selEnd}`,
    'setpts=PTS-STARTPTS',
    `fps=${EXPORT_FPS}`,
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
  ]
  const trimmed = segment.selEnd - segment.selStart
  const clones = segment.outputFrames - trimmed
  if (clones > 0) filters.push(`tpad=stop_mode=clone:stop_duration=${(clones / EXPORT_FPS).toFixed(6)}`)
  filters.push('format=yuv420p')
  return filters.join(',')
}

async function sha256File(path: string): Promise<string> {
  const { createReadStream } = await import('node:fs')
  const { pipeline } = await import('node:stream/promises')
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

export type AnimationExportDeps = {
  store: AnimationStore
  /** The document store's synchronous blob resolution (resolveBlobFile) —
   *  a registered, present blob to its absolute path; anything else null. */
  resolveMedia: (relPath: string) => string | null
  /** Re-resolved per export (settings changes apply without a restart). */
  ffmpegPath: () => string
  /** The core.ts failure logger seam (probe.ts's ToolOptions shape — a
   *  detail record of JSON scalars, matching logFailure's own contract). */
  logFailure?: (stage: string, error: unknown, detail?: Record<string, string | number | boolean>) => void
  now?: () => number
}

export type AnimationExportService = {
  /** Freezes the document truth, gates it, assembles the package. Throws
   *  AnimationRuleError (400/404 — the named refusals), AnimationExportStaleError
   *  (428 — the acknowledgment prompt), or a plain Error (a tool failure the
   *  route maps to a loud 500). */
  export(documentId: string, acknowledgeStale: boolean): Promise<{ archive: Buffer; manifest: ExportManifest; fileName: string }>
}

export function createAnimationExportService(deps: AnimationExportDeps): AnimationExportService {
  const { store, resolveMedia, ffmpegPath } = deps
  const logFailure = deps.logFailure ?? (() => undefined)
  const now = deps.now ?? Date.now

  return {
    async export(documentId, acknowledgeStale) {
      // ---- THE FREEZE (§11.3: before assembly, before anything async) -----
      // One synchronous pass: the document row and its attempt rows land in
      // locals; every later stage (gate, ffmpeg, manifest) reads ONLY these.
      // Authoring commands and landings after this point cannot touch the
      // running export.
      if (typeof documentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(documentId)) {
        throw new AnimationRuleError(`No animation document with id ${String(documentId)}.`, 404)
      }
      const frozenDocument = store.getDocument(documentId)
      if (!frozenDocument) throw new AnimationRuleError(`No animation document with id ${documentId}.`, 404)
      const frozenAttempts = store.attemptsForDocument(documentId)
      const frozenAt = now()

      // ---- THE GATE --------------------------------------------------------
      const plan = deriveExportPlan(frozenDocument, frozenAttempts, resolveMedia)
      if (plan.refusals.length > 0) {
        throw new AnimationRuleError(`The assembled sequence cannot be exported — ${plan.refusals.length} problem(s): ${plan.refusals.join(' ')}`)
      }
      if (plan.stale.length > 0 && acknowledgeStale !== true) {
        throw new AnimationExportStaleError(plan.stale)
      }

      // ---- THE ASSEMBLY (the bake discipline: encode, assert, concat) -----
      const tool = ffmpegPath()
      const toolOptions = { ffmpegPath: tool, logFailure }
      const width = frozenDocument.body.settings.outputWidth
      const height = frozenDocument.body.settings.outputHeight
      const work = await mkdtemp(join(tmpdir(), 'minimax-animation-export-'))
      let finalVideoPath = ''
      try {
        const segmentPaths: string[] = []
        for (const [index, segment] of plan.segments.entries()) {
          const output = join(work, `seg-${String(index).padStart(4, '0')}.mp4`)
          // bitexact + one thread: the encode is deterministic, so a re-export
          // of an unchanged document reproduces byte-identical video.
          await runTool(tool, [
            '-y', '-v', 'error', '-i', segment.sourceAbsPath!,
            '-vf', segmentFilter(segment, width, height),
            '-frames:v', String(segment.outputFrames),
            '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
            '-r', String(EXPORT_FPS), '-threads', '1',
            '-fflags', '+bitexact', '-flags:v', '+bitexact',
            output,
          ], 600_000)
          const decoded = await decodedFrameCount(output, toolOptions)
          if (decoded !== segment.outputFrames) {
            throw new Error(`The assembler's segment ${index + 1} (${segment.contributionId}) decoded to ${decoded} frames but the recipe demands ${segment.outputFrames} — refusing to ship a wrong-length sequence.`)
          }
          segmentPaths.push(output)
        }
        const listPath = join(work, 'concat.txt')
        await writeFile(listPath, segmentPaths.map((path) => `file '${path.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'), 'utf8')
        finalVideoPath = join(work, 'sequence.mp4')
        await runTool(tool, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-fflags', '+bitexact', '-movflags', '+faststart', finalVideoPath], 600_000)
        const total = await decodedFrameCount(finalVideoPath, toolOptions)
        if (total !== plan.totalFrames) {
          throw new Error(`The assembled sequence decoded to ${total} frames but the recipe demands ${plan.totalFrames} — refusing to ship a wrong-length sequence.`)
        }

        // ---- THE PACKAGE ---------------------------------------------------
        const videoBytes = await readFile(finalVideoPath)
        const videoSha256 = createHash('sha256').update(videoBytes).digest('hex')
        const sourceHashes = new Map<string, string>()
        for (const segment of plan.segments) {
          if (!sourceHashes.has(segment.attemptId)) sourceHashes.set(segment.attemptId, await sha256File(segment.sourceAbsPath!))
        }
        const manifest = buildManifest({
          document: frozenDocument,
          attempts: frozenAttempts,
          plan,
          videoSha256,
          videoFrameCount: total,
          sourceHashes,
          frozenAt,
          staleAcknowledged: acknowledgeStale === true,
        })
        const archive = packZip([
          { name: 'sequence.mp4', data: videoBytes },
          { name: 'manifest.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8') },
        ])
        const slug = frozenDocument.name.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'animation'
        const fileName = `${slug}-rev${frozenDocument.revision}-${plan.totalFrames}f.zip`
        return { archive, manifest, fileName }
      } catch (error) {
        logFailure('animation/export', error, { documentId })
        throw error
      } finally {
        await rm(work, { recursive: true, force: true }).catch(() => undefined)
      }
    },
  }
}
