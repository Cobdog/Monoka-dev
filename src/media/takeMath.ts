/**
 * The take viewer's frame/time arithmetic (foelihc T1) — PURE, no DOM or
 * node APIs, the shared-math family filmstripLayout.ts heads.
 *
 * ONE fps convention: FILMSTRIP_FPS (filmstripLayout.ts) is the single
 * constant the filmstrip registration, the timeline guides' round(s × 24),
 * and this module share — there is no second 24 anywhere in the viewer's
 * math (re-exported so consumers have one import site).
 *
 * The two-hop contract (spec §4, audit T-C1) lives here as a pair:
 * `frameIndexFromTime` turns a playhead position into the FRAME anchor
 * (`inputSpec.frameIndex`'s unit); `positionFromFrame` turns a frame anchor
 * back into the SECONDS the extraction seam takes (POST /api/lan/video/frame
 * feeds ffmpeg's -ss verbatim). The two hops must never be collapsed — a
 * literal implementation passing frames as seconds would seek to second 84
 * of a 5-second clip. Honest footnote (spec §3): the fps is the registered
 * approximation until real probing lands.
 */
import { FILMSTRIP_FPS } from './filmstripLayout'

export { FILMSTRIP_FPS }

/** The frame anchor for a playhead position: round(time × 24), floored at
 *  0 — a picked frame is never negative (negative anchors are the fork
 *  menu's counts-from-the-end convention, mapped to 'last' upstream). */
export function frameIndexFromTime(time: number): number {
  if (!Number.isFinite(time) || time <= 0) return 0
  return Math.round(time * FILMSTRIP_FPS)
}

/** The T-M1 clamp (audit): frameCount is itself round(duration × 24), so
 *  round can yield exactly N at the last frame — never hand the seams frame
 *  N of N, and never a negative seek. */
export function clampToFrames(frame: number, frameCount: number): number {
  return Math.max(0, Math.min(frame, frameCount - 1))
}

/** The SECONDS the extraction seam takes for a frame anchor — frame / 24,
 *  never the raw frame number (the T-C1 unit contract). */
export function positionFromFrame(frame: number): number {
  return frame / FILMSTRIP_FPS
}

/** The approximated frame count the transport's `of N` reads. */
export function frameCountFromDuration(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.round(duration * FILMSTRIP_FPS)
}

/** `S.FF` — the seconds.frames pair of one frame position (spec §3's shape:
 *  `3.00`, `0.00`, `11.00` — the seconds integer is bare, the fractional
 *  frames part always 2 digits). */
export function secondsFramesLabel(frame: number): string {
  const seconds = Math.floor(frame / FILMSTRIP_FPS)
  const frames = frame - seconds * FILMSTRIP_FPS
  return `${seconds}.${String(frames).padStart(2, '0')}`
}

/** `S.FF · frame n of N` — the transport's timecode string (spec §3). */
export function timecodeLabel(frame: number, frameCount: number): string {
  return `${secondsFramesLabel(frame)} · frame ${frame} of ${frameCount}`
}

/** Strip x-fraction → time: LINEAR across the full width (spec §5 — the
 *  sheet is the visual, this mapping is the scrub; cell boundaries never
 *  quantize it), clamped to the clip. */
export function timeFromStripFraction(fraction: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  if (!Number.isFinite(fraction)) return 0
  return Math.min(1, Math.max(0, fraction)) * duration
}

/** Time → strip x-fraction (the playhead position), clamped to [0, 1]. */
export function stripFractionFromTime(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  if (!Number.isFinite(time)) return 0
  return Math.min(1, Math.max(0, time / duration))
}
