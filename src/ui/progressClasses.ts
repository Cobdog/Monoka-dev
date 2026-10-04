/**
 * progressClasses — the scalar progress bar's pure class/width/aria math
 * (component vocabulary task 8, Flux k2q0n9s). React-free on purpose so the
 * node suite (tests/progressbar-classes.test.js) executes the SAME mapping
 * the component renders — the statusToken/chipClasses doctrine: one
 * authority, tested where it lives.
 *
 * Contract:
 *   - SCALAR BARS ONLY (spec §2.1 narrowing, manifest §10): the {fetch,
 *     tile} set. Wizard step indicators and prototype queue bars are EXEMPT
 *     and never compose these classes.
 *   - TONE is shared, GEOMETRY is local (P06): the recipes in src/styles.css
 *     carry the track/fill paint, the fill mechanics (block/100%/transition)
 *     and the component's own default size step (4px, compact 3px); the
 *     consuming surface's class — composed LAST so its equal-specificity
 *     rules keep winning in the later-loading sheet — owns the track's
 *     real dimensions, radius, placement, and borders.
 *   - The DETERMINATE WIDTH MATH is the retired fetch expression VERBATIM
 *     (`${Math.round(f * 100)}%`, the migration's rendering contract) with
 *     a clamping guard: `value` is a 0..1 FRACTION; anything outside clamps
 *     to 0%/100% and a missing value renders an empty bar.
 *   - INDETERMINATE is one class-toggle — `progressbar--indeterminate` —
 *     the census fold of the two in-scope dialects (fetch's translateX
 *     shimmer and canvas-slide were the same sweep: a rounded bar crossing
 *     the track, ease-in-out, infinite — unified on the sweep geometry;
 *     proto's width-fill dialect is EXEMPT and untouched). It wins over
 *     `value`: no width style, no aria-value triple.
 *   - The tone matrix is CLOSED — unknown values throw (the chip
 *     over-generalization mitigation). `local` reads the surface's
 *     `--bar-tone` custom-property bridge (the statusToken `--pill-fg`
 *     precedent): the surface sets it, the recipes consume it, never :root.
 */

/** The tone recipes. `accent` is the bare base; `local` follows the
 *  consuming surface's own `--bar-tone` variable (fill + track tint). */
export type ProgressTone = 'accent' | 'local'

export const PROGRESS_TONES: readonly ProgressTone[] = ['accent', 'local']

export type ProgressClassInput = {
  tone?: ProgressTone
  /** Indeterminate state: the sweep class; suppresses value/width/aria-value. */
  indeterminate?: boolean
  /** The compact size step (3px default track instead of 4px). */
  compact?: boolean
  /** The consuming surface's geometry class(es), composed after the recipes. */
  className?: string
}

/** Composed class list: `progressbar [progressbar--{tone}] [progressbar--
 * indeterminate] [progressbar--compact] [surface geometry…]` — deduped,
 * whitespace-normalized. */
export function progressClasses({ tone = 'accent', indeterminate = false, compact = false, className }: ProgressClassInput): string {
  if (PROGRESS_TONES.indexOf(tone) === -1) {
    throw new Error(`progressClasses: unknown progress tone "${String(tone)}" (closed matrix: ${PROGRESS_TONES.join(', ')})`)
  }
  const parts: string[] = ['progressbar']
  if (tone !== 'accent') parts.push(`progressbar--${tone}`)
  if (indeterminate) parts.push('progressbar--indeterminate')
  if (compact) parts.push('progressbar--compact')
  if (className) {
    const tokens = className.split(/\s+/)
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!
      if (token && parts.indexOf(token) === -1) parts.push(token)
    }
  }
  return parts.join(' ')
}

/** Clamp a fraction to the unit interval; missing/NaN reads as empty (0). */
function clampFraction(value: number | undefined | null): number {
  if (value === undefined || value === null || Number.isNaN(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/** The determinate fill's inline width — the retired fetch expression
 *  VERBATIM (Math.round of the fraction's percent), with clamping. */
export function progressWidth(value: number | undefined | null): string {
  return `${Math.round(clampFraction(value) * 100)}%`
}

/** The aria a bar renders: role="progressbar" always; the determinate 0..100
 *  value triple uses the SAME rounding as the width, so what assistive tech
 *  announces equals what the eye sees. Indeterminate carries the role and no
 *  value triple. */
export function progressAria({ indeterminate = false, value }: { indeterminate?: boolean; value?: number | null }): Record<string, string> {
  const aria: Record<string, string> = { role: 'progressbar' }
  if (!indeterminate && typeof value === 'number' && !Number.isNaN(value)) {
    aria['aria-valuemin'] = '0'
    aria['aria-valuemax'] = '100'
    aria['aria-valuenow'] = String(Math.round(clampFraction(value) * 100))
  }
  return aria
}
