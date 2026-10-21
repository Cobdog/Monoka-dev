/**
 * The filmstrip strip's pure model (foelihc T3) — the three honest states
 * with the spec's EXACT words, the press/drag/release scrub machine, the
 * strip-level wrapping of T1's linear mapping, and the cell-tiling math as
 * ONE VM-testable spine. The wizardWalk shape (T2's posture): the repo has
 * no React-executing unit harness, so src/media/TakeFilmstrip.tsx is a thin
 * shell over this module and tests/takefilmstrip.test.js pins these
 * contracts through the VM harness; the rendered behavior is e2e-owned
 * (T7's journey legs).
 *
 * Spec: docs/specs/2026-10-17-take-viewer.md §5 — the sheet is the VISUAL,
 * the linear full-width mapping is the SCRUB: the strip's width maps to the
 * clip's duration regardless of cell boundaries (pointer-down-and-drag
 * scrubs continuously, dragging pauses, release resumes if it was playing),
 * the playhead moves continuously, clicking a spot seeks. The density is
 * honest (the sheet's own ≈ clamp(12, duration×2, 30) cells — a navigator,
 * not a per-frame browser; per-frame inspection is ←/→ on the stage).
 *
 * CANVAS-AGNOSTIC by D2's letter: media math and the sheet's own types,
 * never src/canvas.
 */
import { stripFractionFromTime, timeFromStripFraction } from './takeMath'
import type { Filmstrip } from './PreviewSource'

// T1's mapping pair is THE mapping — re-exported for the one-import-site
// discipline (never re-implemented; the suite pins the identity).
export { stripFractionFromTime, timeFromStripFraction }

// -------------------------------------------------------- the honest words

/** State 1's placeholder cell, byte-exact per spec §5 (single-glyph
 *  ellipsis) — shown only while a sheet is genuinely PENDING. */
export const FILMSTRIP_GENERATING: string = 'filmstrip generating…'

/** State 2's note, byte-exact per spec §5 — the settled sheet-impossible
 *  answer (audit T-I1), NEVER a forever-generating placeholder. */
export const NO_FILMSTRIP_FOR_TAKE: string = 'no filmstrip for this take'

// ------------------------------------------------------ the surface states

export type StripSurface = 'sheet' | 'generating' | 'plain' | 'absent'

/** Which state the strip renders, in precedence order:
 *
 *  - absent  — no media at all: the strip is ABSENT with the missing-file
 *    state (§2), never a dead strip. Wins over everything.
 *  - plain   — media present but sheet IMPOSSIBLE (no previewPath — the
 *    blob-only post-landing shape): the plain scrub bar + the honest note.
 *    Settled on the TAKE's shape, before any load can run — it can never
 *    flip to generating.
 *  - generating — a previewPath take whose sheet has not landed yet (first
 *    open, generation in flight): the plain scrub bar + the placeholder
 *    cell; fills when the sheet lands.
 *  - sheet   — the sheet is loaded: its cells tile the strip, the linear
 *    mapping scrubs, the playhead glides. */
export function stripSurface(input: { mediaPresent: boolean; previewPath: string | null; sheet: Filmstrip | null }): StripSurface {
  if (!input.mediaPresent) return 'absent'
  if (input.previewPath === null) return 'plain'
  return input.sheet ? 'sheet' : 'generating'
}

// ------------------------------------------------- the strip-level mapping

export type StripRect = { left: number; width: number }

/** Pointer x within the strip's rect → the clamped [0, 1] x-fraction.
 *  Degenerate rects and NaN pointers answer 0, never NaN. */
export function stripFractionFromPointer(clientX: number, rect: StripRect): number {
  if (!Number.isFinite(rect.width) || !(rect.width > 0) || !Number.isFinite(clientX)) return 0
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
}

/** One pointer position → the time it names: T1's linear map over the
 *  pressed fraction (the strip IS the scrub bar — cell boundaries never
 *  quantize it). */
export function stripSeekTime(clientX: number, rect: StripRect, duration: number): number {
  return timeFromStripFraction(stripFractionFromPointer(clientX, rect), duration)
}

// ------------------------------------------------------- the scrub machine

/** A live scrub drag: whether the take was PLAYING when it began — the only
 *  fact the release decision is allowed to consult. */
export type StripDrag = { wasPlaying: boolean } | null

/** The pointer-down transaction (spec §5): a LEFT press mid-strip seeks
 *  IMMEDIATELY at the pressed fraction and opens a drag recording the
 *  playing state. A non-left press is not the strip's — no drag, no seek. */
export function stripPress(input: { clientX: number; button: number; rect: StripRect; duration: number; playing: boolean }): { drag: StripDrag; seekTo: number | null } {
  if (input.button !== 0) return { drag: null, seekTo: null }
  return { drag: { wasPlaying: input.playing }, seekTo: stripSeekTime(input.clientX, input.rect, input.duration) }
}

/** The move transaction: seeks CONTINUOUSLY while the drag lives; a hover
 *  (no live drag) never seeks. */
export function stripDragMove(clientX: number, rect: StripRect, duration: number, drag: StripDrag): number | null {
  if (!drag) return null
  return stripSeekTime(clientX, rect, duration)
}

/** The release decision: resume ONLY if the take was playing when the drag
 *  began — a drag begun paused stays paused, and a canceled press (no live
 *  drag) never resumes (the f4f33f9 ruling, applied to the strip). */
export function stripDragRelease(drag: StripDrag): boolean {
  return drag !== null && drag.wasPlaying
}

// --------------------------------------------------------- the cell tiling

/** How many cells the strip renders: the sheet's own sampled frame count —
 *  the honest density — capped at cols×rows so a lying frameCount can never
 *  paint empty cells. */
export function cellCount(sheet: Pick<Filmstrip, 'cols' | 'rows' | 'frameCount'>): number {
  return Math.max(0, Math.min(sheet.frameCount, sheet.cols * sheet.rows))
}

export type CellBackground = { sizeX: number; sizeY: number; positionX: number; positionY: number }

/** One cell's background placement: the whole sheet scaled to cols×100% ×
 *  rows×100% (so ONE frame fills the cell), positioned so cell `index`'s
 *  frame (row-major, document order) is the visible one — the standard
 *  oversized-sprite percentage trick. Single-row/column sheets guard the
 *  /0. */
export function cellBackground(sheet: Pick<Filmstrip, 'cols' | 'rows'>, index: number): CellBackground {
  const col = index % sheet.cols
  const row = Math.floor(index / sheet.cols)
  return {
    sizeX: sheet.cols * 100,
    sizeY: sheet.rows * 100,
    positionX: sheet.cols > 1 ? (100 * col) / (sheet.cols - 1) : 0,
    positionY: sheet.rows > 1 ? (100 * row) / (sheet.rows - 1) : 0,
  }
}
