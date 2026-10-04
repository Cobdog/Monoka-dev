/**
 * Button — the studio's button API (component vocabulary task 7, Flux
 * k2q0n9s). Behavior shared, chrome per-surface (the modularity contract,
 * the same P06 doctrine Chip established): Button renders the tone/state
 * recipe classes and the BUSY mechanics; the consuming surface's own class
 * (via `className`) carries the geometry — padding, radius, font — applied
 * alongside.
 *
 * The busy contract (manifest §2, the button-busy LoaderCircle census):
 *   - busy swaps `icon` for the LoaderCircle spinner (sized by `size` —
 *     each surface's icon scale; geometry itself never lives here),
 *   - sets aria-busy, and
 *   - disables the button (an in-flight action is never also clickable —
 *     `disabled` composes: busy || disabled).
 * Children always render (callers may key busy text through them, e.g.
 * `{running ? 'Checking…' : 'Run checks'}`), handlers pass straight
 * through, and type/onClick stay native. Icon-only buttons (no text in the
 * children tree) REQUIRE an aria-label — dev-time warn, the same contract
 * Chip carries; the warn math lives in the react-free ./buttonClasses.ts
 * (node-tested).
 *
 * The recipes live in src/styles.css; the class math lives in
 * ./buttonClasses.ts (one authority, node-tested against the sheet).
 */
import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { buttonClasses, buttonState, buttonWarnFor, type ButtonVariant } from './buttonClasses'

export type { ButtonVariant }

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Tone recipe (closed matrix — see buttonClasses.ts). Required. */
  variant: ButtonVariant
  /** The busy LoaderCircle's pixel size — the surface's icon scale (the
   *  census spans 11–16 across surfaces). Defaults to 16. */
  size?: number
  /** Busy state: spinner + aria-busy + disabled (the §2 contract). */
  busy?: boolean
  /** The resting icon, rendered before the children when not busy. */
  icon?: ReactNode
  children?: ReactNode
}

export function Button({ variant, size = 16, busy, disabled, icon, className, children, onClick, type = 'button', ...rest }: ButtonProps) {
  if (import.meta.env.DEV) {
    const warning = buttonWarnFor({ children, ariaLabel: rest['aria-label'] })
    if (warning) console.warn(warning)
  }
  return (
    <button
      type={type}
      className={buttonClasses({ variant, busy, className })}
      onClick={onClick}
      {...buttonState({ busy, disabled })}
      {...rest}
    >
      {busy ? <LoaderCircle size={size} className="spin" /> : icon}
      {children}
    </button>
  )
}
