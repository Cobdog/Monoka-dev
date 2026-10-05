/**
 * EffectiveSettingRow — the origin ≠ outcome display tier (component
 * vocabulary task 19, spec §0.4 / P08 r3-corrected, Flux k2q0n9s): ONE row
 * showing WHAT is effectively set and WHERE it came from, with the
 * ATTEMPTED-but-not-in-force pick carried separately from the effective
 * fallback:
 *
 *   <label> <value> [level chip | auto/default] [level · outcome chip] [reset]
 *
 * The row renders, never resolves — every field is supplied by the resolver
 * seam (modelOverrides.ts's effectiveSlotSetting for the model dials): the
 * value is the EFFECTIVE setting, origin names the layer it comes from
 * ({kind:'auto'} renders the plain 'auto/default' text — NO chip, and never
 * a fabricated level), and attempt records a refused/degraded pick WITHOUT
 * rewriting the effective value (a refused global pick renders effective =
 * auto — or the surviving lower override — plus attempt = global/refused).
 *
 * Reset ownership (spec §0.4): onReset is caller-supplied and scoped to the
 * override level THIS ROW owns — resetting reveals the inherited effective
 * value and deletes NOTHING upstream (clearing a chain pick leaves the
 * global Settings pick standing). Supply it only when the row's owned level
 * holds the override; a handler against a non-override origin dev-warns
 * (effectiveRowWarnFor, node-tested). Direct authoring controls (the pick
 * selects) do not become the row — the row is the provenance display beside
 * them; a read-only variant is simply a row with no onReset.
 *
 * P06: tone through the existing chip recipes (muted origin chip,
 * danger/warning attempt chips); the row's internal flow/tone is the
 * `.effective-setting-row` recipe block in src/styles.css; the surface's
 * geometry class rides className.
 */
import { EFFECTIVE_AUTO_TEXT, effectiveAttemptChip, effectiveChipClasses, effectiveOriginChip, effectiveOriginKey, effectiveResetLabel, effectiveRowClasses, effectiveRowWarnFor, type EffectiveRowAttempt, type EffectiveRowOrigin } from './effectiveRowClasses'

export type EffectiveSettingRowProps = {
  /** The setting's name — the row's lead-in and the reset's accessible name. */
  label: string
  /** The EFFECTIVE value as the resolver resolved it ('' = nothing in force
   *  beyond the default — the origin slot then carries the row). */
  value: string
  /** Where the effective value comes from — resolver-supplied. */
  origin: EffectiveRowOrigin
  /** A tried-but-not-in-force pick (refused/degraded), carried SEPARATELY
   *  from the effective fallback. */
  attempt?: EffectiveRowAttempt
  /** Present only when the row's OWNED level holds the override: resets
   *  this row's pick, revealing the layer beneath — never deletes upstream. */
  onReset?: () => void
  /** The surface's geometry class (P06 — composes after the recipe). */
  className?: string
}

export function EffectiveSettingRow({ label, value, origin, attempt, onReset, className }: EffectiveSettingRowProps) {
  if (import.meta.env.DEV) {
    const warning = effectiveRowWarnFor({ origin, onReset })
    if (warning) console.warn(warning)
  }
  const originChip = effectiveOriginChip(origin)
  const attemptChip = attempt ? effectiveAttemptChip(attempt) : null
  return (
    <div
      className={effectiveRowClasses({ className })}
      data-effective-origin={effectiveOriginKey(origin)}
      {...(attempt ? { 'data-effective-attempt': `${attempt.level}:${attempt.outcome}` } : {})}
    >
      <span>{label}</span>
      {value ? <span className="effective-setting-value" data-effective-value>{value}</span> : null}
      {originChip
        ? <span className={effectiveChipClasses(originChip.tone)} data-effective-origin-chip>{originChip.text}</span>
        : <span>{EFFECTIVE_AUTO_TEXT}</span>}
      {attemptChip && (
        <span className={effectiveChipClasses(attemptChip.tone)} data-effective-attempt-chip>{attemptChip.text}</span>
      )}
      {onReset && (
        <button
          type="button"
          className={`${effectiveChipClasses('muted')} effective-setting-reset`}
          data-effective-reset
          aria-label={effectiveResetLabel(label)}
          title="Clear this row's pick only — the effective value falls back to the layer beneath (the global pick, or auto). Nothing upstream changes."
          onClick={onReset}
        >
          reset
        </button>
      )}
    </div>
  )
}
