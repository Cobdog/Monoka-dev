/**
 * chipClasses — the chip system's pure class/aria math (component vocabulary
 * task 6, Flux k2q0n9s). React-free on purpose so the node suite
 * (tests/chip-classes.test.js) executes the SAME mapping the component
 * renders — the statusToken doctrine: one authority, tested where it lives.
 *
 * Contract:
 *   - TONE is what a chip IS; STATE is what the user did. `chipClasses()`
 *     composes the shared tone/state recipe classes (defined in
 *     src/styles.css) and appends the consuming surface's own geometry class
 *     LAST — P06: the shared recipes carry color/background/border-color
 *     only; padding, radius, and font stay in the surface's class applied
 *     alongside (CV02: op-chip pills, iw rectangles, ds-aspect dashed-custom
 *     keep their dimensions and treatments).
 *   - The tone and variant matrices are CLOSED — unknown values throw at
 *     runtime (the spec's chip-over-generalization mitigation), and
 *     tests/chip-classes.test.js keeps the emitted class set in lockstep
 *     with the rules src/styles.css actually defines, both directions.
 *   - VARIANT is the ARIA/interaction shape (the r3 correction):
 *     independent toggles are PRESSED BUTTONS — `aria-pressed` flipped by
 *     Space/Enter — NEVER aria-checked (which belongs to checkbox/radio
 *     roles); `aria-checked` + role=radio belong to EXCLUSIVE ChipGroups
 *     only (spec §0.3: radiogroup + roving tabindex + arrow-key selection +
 *     group-as-one Tab exit — the behavior lives in ChipGroup, e2e-owned).
 *
 * Tone semantics (the census folds — near-duplicate mix ratios collapsed to
 * the dominant value; rendering-identical at the geometry level, tone-only
 * moves):
 *   neutral  the census default — line border, transparent bg, muted text
 *   accent   the filled accent badge (the census "active"/selected + the
 *            accent badges: take chips, technique/llm/pin/cluster markers)
 *   danger   the danger outline (canvas-chip.danger, bucket wall-stop)
 *   warning  the warning tint (stale badges, op-chip.baked, wall-warn)
 *   muted    the surface-filled neutral (op chips, prior takes) with the
 *            accent hover affordance the clickable members carried
 */
export type ChipTone = 'neutral' | 'accent' | 'danger' | 'warning' | 'muted'

/** The interaction shape — which aria state the chip renders. */
export type ChipVariant = 'action' | 'toggle' | 'radio'

export const CHIP_TONES: readonly ChipTone[] = ['neutral', 'accent', 'danger', 'warning', 'muted']
export const CHIP_VARIANTS: readonly ChipVariant[] = ['action', 'toggle', 'radio']

/** The state classes every tone may compose with (kept in the same set as
 *  the recipe rules the test walks in src/styles.css). */
export type ChipClassInput = {
  tone?: ChipTone
  selected?: boolean
  busy?: boolean
  /** The consuming surface's geometry class(es), composed after the recipes. */
  className?: string
}

/** Composed class list: `chip [chip--{tone}] [chip--selected] [chip--busy]
 *  [surface geometry…]` — deduped, whitespace-normalized. */
export function chipClasses({ tone = 'neutral', selected = false, busy = false, className }: ChipClassInput): string {
  if (CHIP_TONES.indexOf(tone) === -1) {
    throw new Error(`chipClasses: unknown chip tone "${String(tone)}" (closed matrix: ${CHIP_TONES.join(', ')})`)
  }
  const parts: string[] = ['chip']
  if (tone !== 'neutral') parts.push(`chip--${tone}`)
  if (selected) parts.push('chip--selected')
  if (busy) parts.push('chip--busy')
  if (className) {
    const tokens = className.split(/\s+/)
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!
      if (token && parts.indexOf(token) === -1) parts.push(token)
    }
  }
  return parts.join(' ')
}

/** The aria state a chip renders for its variant (spread onto the button):
 *  pressed buttons for toggles, radio semantics for exclusive groups, no
 *  selection state for plain actions; aria-busy whenever busy. */
export function chipAria({ variant = 'action', selected = false, busy = false }: { variant?: ChipVariant; selected?: boolean; busy?: boolean }): Record<string, string | boolean> {
  if (CHIP_VARIANTS.indexOf(variant) === -1) {
    throw new Error(`chipAria: unknown chip variant "${String(variant)}" (closed set: ${CHIP_VARIANTS.join(', ')})`)
  }
  const aria: Record<string, string | boolean> = {}
  if (variant === 'toggle') aria['aria-pressed'] = selected
  if (variant === 'radio') {
    aria.role = 'radio'
    aria['aria-checked'] = selected
  }
  if (busy) aria['aria-busy'] = true
  return aria
}
