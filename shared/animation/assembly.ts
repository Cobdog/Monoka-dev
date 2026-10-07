/**
 * The shared assembly-edge derivation (task 15a, k2q0n9s — the T14 review
 * Important-1, re-ledgered per the T15 review): ONE home for the LENGTH/EDGE
 * semantics both sides of the export boundary consume —
 * server/animation/export.ts's gate (`deriveExportPlan`, the authority that
 * refuses at click time) and src/animation/timelineModel.ts's preview
 * (`deriveAssembledSequence`, the surface that must foreshadow the refusal
 * BEFORE the click). Two hand-maintained copies had drifted apart on four
 * edge classes — a degenerate range pointing past the clip's end, a
 * zero-frame phantom row, odd output dimensions, the export ceiling: the
 * preview looked clean and the gate refused with a reason the panel could
 * have shown. The verdicts are written once now.
 *
 * Scope, deliberately narrow: the classes decidable from a contribution's
 * numbers plus the landed clip's frame count (and, at the document level,
 * the dimensions and the assembled total). The gate's RICHER classes — a
 * foreign attempt, the hero lane, an unlanded take, a non-video kind,
 * missing media — stay the gate's own: the shared entry verdict takes
 * `frameCount: number | null` and answers `problem: null` for the unlanded
 * class, so each side keeps its own unlanded wording (the gate refuses, the
 * preview shows its softer text).
 *
 * The reason strings are the GATE'S EXISTING TEXT verbatim — the refusal
 * pins in tests/animation-export.test.js are byte-for-byte contracts. The
 * per-entry label is a PARAMETER: each caller interpolates its own label
 * vocabulary; the document-level strings are label-free.
 *
 * Environment-neutral (the shared/animation dual-build contract — see
 * compiler.ts): zero imports, zero Node or browser APIs; compiles under
 * Bundler+DOM AND NodeNext.
 */

/** The assembled sequence's constant frame rate (moved from export.ts with
 *  task 15a — the gate re-exports it so its own imports stay stable). */
export const EXPORT_FPS = 24

/** The hard ceiling on assembled output frames (a ~70-minute sequence at
 *  24 fps): a runaway selection refuses loudly instead of encoding for
 *  hours. Generous by design — real sessions sit in the hundreds. */
export const MAX_EXPORT_FRAMES = 100_000

/** One contribution as the shared verdict reads it: the recipe numbers
 *  verbatim plus the landed clip's frame count (null = the clip has not
 *  landed — the unlanded class stays each side's own). */
export type AssemblyEntryInput = {
  contributionId: string
  inFrame: number
  outFrame: number
  holdDuration: number
  /** The landed clip's frame count; null = the clip has not landed (the
   *  unlanded class stays each side's own — the shared module only owns
   *  edges that need the frame count). */
  frameCount: number | null
}

/** The document facts the shared document-level verdicts read. */
export type AssemblyDocumentInput = { outputWidth: number; outputHeight: number }

/** One entry's shared verdict: the clip arithmetic both sides burned
 *  separately, and the shared refusal/problem reason (null = clean, or an
 *  edge the caller owns — the unlanded class). */
export type AssemblyEntryVerdict = {
  clipFrames: number
  outputFrames: number
  problem: string | null
}

/**
 * The per-entry edge verdict — the classes the two derivations must never
 * word-drift on again, in the gate's own precedence order: a wide
 * out-of-range selection first, then the degenerate range that must name an
 * EXISTING frame, then the zero-frame phantom row. `label` opens the reason
 * (the gate's `${label}: ` shape — the previews' row label differs by
 * vocabulary, the shared text after it is byte-identical). Unlanded
 * (frameCount === null) is NOT a shared class: the verdict is
 * `problem: null` and each side keeps its own unlanded copy.
 */
export function assemblyEntryVerdict(entry: AssemblyEntryInput, label: string): AssemblyEntryVerdict {
  const clipFrames = Math.max(0, entry.outFrame - entry.inFrame)
  const outputFrames = clipFrames + entry.holdDuration
  let problem: string | null = null
  if (entry.frameCount !== null) {
    if (clipFrames > 0 && entry.outFrame > entry.frameCount) {
      problem = `${label}: the selection [${entry.inFrame}, ${entry.outFrame}) exceeds the clip's ${entry.frameCount} frames — narrow it before export (the export refuses rather than clamping).`
    } else if (clipFrames === 0 && entry.inFrame >= entry.frameCount) {
      problem = `${label}: the held drawing points at frame ${entry.inFrame} of a ${entry.frameCount}-frame clip — a degenerate range must name an existing frame; the export refuses rather than dropping it.`
    } else if (outputFrames < 1) {
      problem = `${label}: the entry contributes no frames (a degenerate range with no hold) — set a hold or widen the range; the export refuses a phantom manifest row.`
    }
  }
  return { clipFrames, outputFrames, problem }
}

/**
 * The document-level verdicts the preview must foreshadow: the empty
 * sequence, the odd output dimensions (H.264 at 4:2:0 chroma needs even
 * pairs — the settings schema allows any positive integer pair, so an odd
 * pair is refused by name, never discovered as an ffmpeg failure
 * mid-assembly), and the export ceiling (given the assembled total). The
 * gate's existing reason strings verbatim, label-free; the caller decides
 * where they land (the gate refuses, the preview names them as problems).
 */
export function assemblyDocumentProblems(document: AssemblyDocumentInput, totalFrames: number, empty: boolean): string[] {
  const problems: string[] = []
  if (empty) {
    problems.push('The assembled sequence is empty — contribute at least one landed clip before exporting.')
  }
  if (document.outputWidth % 2 !== 0 || document.outputHeight % 2 !== 0) {
    problems.push(`The document's output dimensions (${document.outputWidth}x${document.outputHeight}) are odd — H.264 at 4:2:0 chroma needs even dimensions; adjust the document's settings before exporting.`)
  }
  if (totalFrames > MAX_EXPORT_FRAMES) {
    problems.push(`The assembled sequence is ${totalFrames} frames — beyond the export ceiling of ${MAX_EXPORT_FRAMES}. Split the document or trim the contribution list.`)
  }
  return problems
}
