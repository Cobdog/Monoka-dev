/**
 * TakeFilmstrip (foelihc T3, spec §5) — the filmstrip strip: the sprite
 * sheet the server already generates, rendered as the VISUAL (one cell per
 * sampled frame, tiling the strip) with the LINEAR full-width mapping as
 * the SCRUB — pointer-down-and-drag scrubs continuously, dragging pauses,
 * release resumes if it was playing. Renders under the stage, above the
 * transport row, full width; the MOUNT (T4's overlay) owns that layout,
 * this component owns the strip's own contract.
 *
 * THIN SHELL over src/media/takeFilmstripModel.ts (the T2 posture — the
 * repo has no React-executing unit harness): the model owns every decision
 * the suite pins — the three honest states with the spec's exact words, the
 * press/drag/release machine, the pointer→time mapping, the cell tiling.
 * This file binds those decisions to the DOM: useFilmstrip (the SAME
 * OPFS-cached loader the tile's poster path uses — one generation per clip,
 * the route's counter stays flat on viewer open, pinned at both the loader
 * and the route by tests/takefilmstrip.test.js), pointer capture, the
 * playhead marker.
 *
 * The transport seam is the PARENT's (the core's command seam, untouched
 * here): onScrubStart pauses, onScrub seeks continuously, onScrubEnd(resume)
 * resumes only when the take was playing at drag start.
 */
import { useRef } from 'react'
import { useFilmstrip } from './useFilmstrip'
import { stripFractionFromTime } from './takeMath'
import {
  FILMSTRIP_GENERATING, NO_FILMSTRIP_FOR_TAKE,
  cellBackground, cellCount, stripDragMove, stripDragRelease, stripPress, stripSurface,
} from './takeFilmstripModel'
import './takefilmstrip.css'

export type TakeFilmstripProps = {
  /** The output-contained preview path a sheet can exist for. Null when the
   *  take is blob-only — media present, sheet IMPOSSIBLE (audit T-I1): the
   *  plain scrub bar + the honest note, never a forever-generating
   *  placeholder. */
  previewPath: string | null
  /** The take's duration in seconds — the strip's full width maps to it. */
  duration: number
  /** The playhead position in seconds (the parent owns the clock). */
  currentTime: number
  /** Whether the take is playing — captured at drag start; drives release. */
  playing: boolean
  /** No resolvable media at all: the strip is ABSENT, never a dead strip
   *  (the missing-file state owns the surface). */
  mediaPresent: boolean
  /** The drag contract: pause when the scrub begins. */
  onScrubStart: () => void
  /** Continuous seek — fires on press and on every move while dragging. */
  onScrub: (time: number) => void
  /** Release: resume ONLY if the take was playing when the drag began. */
  onScrubEnd: (resume: boolean) => void
  /** The take's name, for the accessible label. */
  label: string
  className?: string
}

export function TakeFilmstrip({
  previewPath, duration, currentTime, playing, mediaPresent,
  onScrubStart, onScrub, onScrubEnd, label, className = '',
}: TakeFilmstripProps) {
  // Hooks before any early return (the absent state still unmounts clean).
  const sheet = useFilmstrip(mediaPresent ? previewPath : null, duration)
  const dragRef = useRef<{ wasPlaying: boolean } | null>(null)

  const surface = stripSurface({ mediaPresent, previewPath: previewPath || null, sheet })
  if (surface === 'absent') return null

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const press = stripPress({
      clientX: event.clientX,
      button: event.button,
      rect: event.currentTarget.getBoundingClientRect(),
      duration,
      playing,
    })
    if (press.seekTo === null) return
    dragRef.current = press.drag
    event.currentTarget.setPointerCapture?.(event.pointerId)
    onScrubStart()
    onScrub(press.seekTo)
  }
  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const seekTo = stripDragMove(event.clientX, event.currentTarget.getBoundingClientRect(), duration, dragRef.current)
    if (seekTo !== null) onScrub(seekTo)
  }
  const onPointerUp = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag) onScrubEnd(stripDragRelease(drag))
  }
  // A canceled press is not a release (T2's ruling): clear the drag, never
  // resume off it.
  const onPointerCancel = () => {
    dragRef.current = null
  }

  const playheadFraction = stripFractionFromTime(currentTime, duration)

  return (
    <div
      className={`take-filmstrip take-filmstrip-${surface} ${className}`.trim()}
      data-take-filmstrip={surface}
      aria-label={`Filmstrip scrub bar — ${label}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {surface === 'sheet' && sheet && Array.from({ length: cellCount(sheet) }, (_unused, index) => {
        const background = cellBackground(sheet, index)
        return (
          <div
            key={index}
            className="take-filmstrip-cell"
            data-take-filmstrip-cell
            style={{
              backgroundImage: `url("${sheet.url}")`,
              backgroundSize: `${background.sizeX}% ${background.sizeY}%`,
              backgroundPosition: `${background.positionX}% ${background.positionY}%`,
            }}
          />
        )
      })}
      {surface === 'generating' && (
        <div className="take-filmstrip-cell take-filmstrip-placeholder" data-take-filmstrip-placeholder>{FILMSTRIP_GENERATING}</div>
      )}
      {surface === 'plain' && (
        <div className="take-filmstrip-cell take-filmstrip-note" data-take-filmstrip-note>{NO_FILMSTRIP_FOR_TAKE}</div>
      )}
      <div
        className="take-filmstrip-playhead"
        data-take-filmstrip-playhead
        style={{ left: `${playheadFraction * 100}%` }}
      />
    </div>
  )
}
