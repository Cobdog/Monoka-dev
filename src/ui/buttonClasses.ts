/**
 * buttonClasses — the Button API's pure class/state math (component
 * vocabulary task 7, Flux k2q0n9s). React-free on purpose so the node suite
 * (tests/button-classes.test.js) executes the SAME mapping the component
 * renders — the statusToken/chipClasses doctrine: one authority, tested
 * where it lives.
 *
 * Contract:
 *   - VARIANT is the semantic tone (the manifest §2 button-busy census +
 *     the plan's named complete dialect, ds-btn): primary (the accent
 *     action), secondary (the surface-filled neutral), ghost (the
 *     transparent neutral), danger (the destructive outline), icon (an
 *     icon-only button — ghost paint in this skin; its geometry stays in
 *     the surface class, its accessible name must come from aria-label).
 *     The matrix is CLOSED — unknown or missing variants throw.
 *   - `buttonClasses()` composes `btn [btn--{variant}] [btn--busy]
 *     [surface geometry…]` — P06: the shared recipes in src/styles.css
 *     carry color/background/border-color (+opacity/cursor state
 *     affordances) ONLY; padding, radius, font, and border-width/style stay
 *     in the consuming surface's own class, composed LAST so its dialect
 *     rules keep winning the cascade wherever they still exist (the
 *     between-batches bridge — the surface dialects not yet absorbed paint
 *     through their own rules).
 *   - `buttonState()` is the busy/disabled semantics: busy implies DISABLED
 *     and aria-busy (manifest §2: busy = LoaderCircle + aria-busy +
 *     disabled — an in-flight action is never also clickable).
 *   - `buttonWarnFor()` is the icon-only labeling rule: children with no
 *     text and no aria-label produce the dev-time warning (the accessible
 *     name is the icon otherwise). Icon-only is a CHILDREN shape, not just
 *     the `icon` variant — the rule fires for any button whose rendered
 *     content is icons-only.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'

export const BUTTON_VARIANTS: readonly ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'icon']

export type ButtonClassInput = {
  variant: ButtonVariant
  /** Busy state: the btn--busy recipe class. */
  busy?: boolean
  /** The consuming surface's geometry class(es), composed after the recipes. */
  className?: string
}

/** Composed class list: `btn [btn--{variant}] [btn--busy] [surface…]` —
 *  deduped, whitespace-normalized. */
export function buttonClasses({ variant, busy = false, className }: ButtonClassInput): string {
  if (BUTTON_VARIANTS.indexOf(variant) === -1) {
    throw new Error(`buttonClasses: unknown button variant "${String(variant)}" (closed matrix: ${BUTTON_VARIANTS.join(', ')})`)
  }
  const parts: string[] = ['btn', `btn--${variant}`]
  if (busy) parts.push('btn--busy')
  if (className) {
    const tokens = className.split(/\s+/)
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!
      if (token && parts.indexOf(token) === -1) parts.push(token)
    }
  }
  return parts.join(' ')
}

/** The disabled/aria attributes a button renders for its state: busy forces
 *  disabled and announces aria-busy; plain disabled never announces. */
export function buttonState({ busy = false, disabled = false }: { busy?: boolean; disabled?: boolean }): { disabled: boolean; 'aria-busy'?: true } {
  const state: { disabled: boolean; 'aria-busy'?: true } = { disabled: disabled || busy }
  if (busy) state['aria-busy'] = true
  return state
}

/** Does the children tree render ANYTHING (text, number, or element)? An
 *  explicitly empty button has nothing to misname — no warning. */
function hasContent(children: unknown): boolean {
  if (children === null || children === undefined || typeof children === 'boolean') return false
  if (typeof children === 'string') return children.trim().length > 0
  if (typeof children === 'number') return true
  if (Array.isArray(children)) {
    for (let index = 0; index < children.length; index += 1) {
      if (hasContent(children[index])) return true
    }
    return false
  }
  return typeof children === 'object' && '$$typeof' in children
}

/** Does the children tree carry any text (an icon-ONLY button needs a
 *  label)? Walks plain ReactNode shapes; element children are read through
 *  .props.children the way React renders them (real or hand-built fakes —
 *  only the children chain matters). */
function hasTextContent(children: unknown): boolean {
  if (children === null || children === undefined || typeof children === 'boolean') return false
  if (typeof children === 'string') return children.trim().length > 0
  if (typeof children === 'number') return true
  if (Array.isArray(children)) {
    for (let index = 0; index < children.length; index += 1) {
      if (hasTextContent(children[index])) return true
    }
    return false
  }
  if (typeof children === 'object' && '$$typeof' in children) {
    const props = (children as { props?: { children?: unknown } }).props
    return props ? hasTextContent(props.children) : false
  }
  return false
}

/** The dev-time warning for an icon-only button without an aria-label, or
 *  null when the labeling contract is satisfied (an aria-label, text
 *  anywhere in the tree, or no rendered content at all). */
export function buttonWarnFor({ children, ariaLabel }: { children: unknown; ariaLabel?: string }): string | null {
  if (ariaLabel !== undefined && ariaLabel.trim().length > 0) return null
  if (!hasContent(children)) return null
  if (hasTextContent(children)) return null
  return 'Button: icon-only buttons require an aria-label (the accessible name is the icon otherwise).'
}
