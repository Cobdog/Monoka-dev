/**
 * ProgressBar — the studio's scalar progress bar (component vocabulary task
 * 8, Flux k2q0n9s). Behavior shared, chrome per-surface (the modularity
 * contract, the P06 doctrine Chip/Button established): ProgressBar renders
 * the tone/state recipe classes, the determinate width, and the aria;
 * the consuming surface's class (via `className`) carries the geometry —
 * the track's dimensions, radius, placement, and borders — applied
 * alongside.
 *
 * The API (manifest §10, the {fetch, tile} set — scalar bars ONLY; wizard
 * step indicators and prototype queue bars are EXEMPT per spec §2.1):
 *   - `value` — the 0..1 FRACTION. Determinate width math is the retired
 *     fetch expression VERBATIM (`${Math.round(f * 100)}%`); values outside
 *     the unit interval clamp; a missing value renders an empty bar.
 *   - `indeterminate` — ONE class-toggle (the census fold of the two
 *     in-scope sweep dialects); it wins over `value`.
 *   - `compact` — the component's own smaller size step (3px vs 4px
 *     default); a surface with its own dimensions still overrides.
 *   - `tone` — `accent` (the default fill) or `local` (the fill + track
 *     tint read the surface's `--bar-tone` bridge, the statusToken
 *     `--pill-fg` precedent — e.g. the generating tile's `--tile-tone`).
 *
 * aria: role="progressbar" with the 0..100 value triple when determinate
 * (the SAME rounding as the width); pass aria-hidden for decorative bars
 * (the tile's) and the role is suppressed. Everything else passes through.
 *
 * The recipes live in src/styles.css; the class/width/aria math lives in
 * ./progressClasses.ts (one authority, node-tested against the sheet).
 */
import type { HTMLAttributes } from 'react'
import { progressAria, progressClasses, progressWidth, type ProgressTone } from './progressClasses'

export type { ProgressTone }

export type ProgressBarProps = Omit<HTMLAttributes<HTMLSpanElement>, 'role' | 'children'> & {
  /** The progress FRACTION 0..1 (determinate). Clamped; null/missing = empty. */
  value?: number | null
  /** Indeterminate: the sweep class; suppresses value/width/aria-value. */
  indeterminate?: boolean
  /** The compact size step (3px default track instead of 4px). */
  compact?: boolean
  /** Tone recipe (closed matrix — see progressClasses.ts). Defaults to accent. */
  tone?: ProgressTone
}

export function ProgressBar({ value, indeterminate, compact, tone = 'accent', className, ...rest }: ProgressBarProps) {
  const decorative = rest['aria-hidden'] === true || rest['aria-hidden'] === 'true'
  const aria = decorative ? {} : progressAria({ indeterminate, value })
  return (
    <span
      className={progressClasses({ tone, indeterminate, compact, className })}
      {...aria}
      {...rest}
    >
      <span className="progressbar-fill" style={indeterminate ? undefined : { width: progressWidth(value) }} />
    </span>
  )
}
