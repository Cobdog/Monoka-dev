/**
 * effectiveRowClasses — the effective-setting row's pure display math
 * (component vocabulary task 19, spec §0.4 / P08 r3-corrected, Flux
 * k2q0n9s). React-free on purpose so the node suite
 * (tests/effective-row-classes.test.js) executes the SAME mapping the
 * component renders — the fieldClasses doctrine: one authority, tested
 * where it lives.
 *
 * Contract:
 *   - ORIGIN (where the effective value comes from): an override renders
 *     its LEVEL as a chip (the provenance the resolver supplied); the
 *     no-override state renders NO chip at all — the origin slot reads
 *     'auto/default' as plain text, and a level is NEVER fabricated for it
 *     (the r3 correction: modelOverrides.ts's {state:'auto'} maps here
 *     without inventing one).
 *   - ATTEMPT (origin ≠ outcome): a tried-but-not-in-force pick renders as
 *     its OWN chip, 'level · outcome', tone by outcome — refused rides the
 *     danger chip recipe (the submission will not run until it clears),
 *     degraded the warning one (environmental drift; rendering proceeds).
 *     Existing chip tones only — no new colors.
 *   - RESET ownership is the CALLER's discipline: onReset is supplied only
 *     when the row's OWNED level holds the override (resetting reveals the
 *     layer beneath and deletes nothing upstream). The component dev-warns
 *     the half it can see — a reset handler against a non-override origin.
 *   - CLASSES: effectiveRowClasses() composes `effective-setting-row
 *     [surface…]` — the recipe owns the row's internal flow/tone and its
 *     chips' compact geometry (scoped `.effective-setting-row .chip`,
 *     never the shared .chip class); the surface's geometry class lands
 *     last, deduped (P06, the mergeTail doctrine).
 */
import { chipClasses, type ChipTone } from './chipClasses'

/** The override ladder the row vocabulary knows. 'node' exists for a future
 *  per-node seam (a single graph node's model dial); the model-override
 *  resolver supplies only chain/global — effectiveSlotSetting in
 *  modelOverrides.ts never fabricates the third. */
export type EffectiveRowLevel = 'node' | 'chain' | 'global'

export type EffectiveRowOrigin =
  | { kind: 'override'; level: EffectiveRowLevel }
  | { kind: 'auto' }

export type EffectiveRowAttempt = { level: EffectiveRowLevel; outcome: 'refused' | 'degraded' }

/** What the origin slot reads when nothing overrides: plain text, no chip. */
export const EFFECTIVE_AUTO_TEXT = 'auto/default'

/** The origin slot: the chip an override level renders (the surface-filled
 *  neutral — provenance, not a state), or null for auto (NO chip; the slot
 *  renders EFFECTIVE_AUTO_TEXT as plain muted text). */
export function effectiveOriginChip(origin: EffectiveRowOrigin): { tone: ChipTone; text: string } | null {
  if (origin.kind !== 'override') return null
  return { tone: 'muted', text: origin.level }
}

/** The attempt chip: 'level · outcome' in the outcome's tone. */
export function effectiveAttemptChip(attempt: EffectiveRowAttempt): { tone: ChipTone; text: string } {
  return {
    tone: attempt.outcome === 'refused' ? 'danger' : 'warning',
    text: `${attempt.level} · ${attempt.outcome}`,
  }
}

/** The origin's machine value (the data attribute consumers assert): the
 *  override level, or 'auto'. */
export function effectiveOriginKey(origin: EffectiveRowOrigin): string {
  return origin.kind === 'override' ? origin.level : 'auto'
}

/** The reset affordance's accessible name — names WHAT resets; the tooltip
 *  carries the full deletes-nothing-upstream contract. */
export function effectiveResetLabel(label: string): string {
  return `Reset ${label} — clear this row's pick only`
}

/** Composed row classes: `effective-setting-row [surface…]` — deduped, the
 *  surface geometry class last (the mergeTail doctrine). */
export function effectiveRowClasses({ className }: { className?: string }): string {
  const parts = ['effective-setting-row']
  if (className) {
    const tokens = className.split(/\s+/)
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!
      if (token && parts.indexOf(token) === -1) parts.push(token)
    }
  }
  return parts.join(' ')
}

/** Dev-time misuse warning (the Field/Button contract's sibling): a reset
 *  handler against an origin that is not an override would render an
 *  affordance with nothing to reset. The owned-LEVEL half of the discipline
 *  (reset only at the row's own level — the PropertiesPanel rows own chain,
 *  the Settings rows own global) is caller-side and invisible here. */
export function effectiveRowWarnFor({ origin, onReset }: { origin: EffectiveRowOrigin; onReset?: unknown }): string | null {
  if (onReset !== undefined && onReset !== null && origin.kind !== 'override') {
    return 'EffectiveSettingRow: onReset supplied while origin is auto — the row owns no override to reset. Pass onReset only when the row\'s OWNED level holds the override (origin.kind === \'override\').'
  }
  return null
}

/** The chips' composed classes: the chip recipe's TONE plus the row's OWN
 *  geometry token (`effective-setting-chip`) composed last — the
 *  canvas-chip/ds-chip doctrine: geometry rides the consuming surface's
 *  token alongside the recipes, never a `.chip`-named selector (the shared
 *  chip classes stay geometry-free; the chip-classes suite's P06 net walks
 *  every `.chip`-mentioning rule in the sheet). */
export const EFFECTIVE_CHIP_GEOMETRY = 'effective-setting-chip'

export function effectiveChipClasses(tone: ChipTone): string {
  return chipClasses({ tone, className: EFFECTIVE_CHIP_GEOMETRY })
}
