/**
 * Chip + ChipGroup — the studio's chip system (component vocabulary task 6,
 * Flux k2q0n9s). Behavior shared, chrome per-surface (the modularity
 * contract): Chip renders the tone/state recipe classes and the selection
 * SEMANTICS; the consuming surface's own class (via `className`) carries the
 * geometry — padding, radius, font — applied alongside (P06/CV02).
 *
 * Selection contract (spec §0.3), the complete radio interaction for
 * EXCLUSIVE groups — roles and aria-checked alone were never the contract:
 *   - `<ChipGroup exclusive aria-label value onChange>` renders
 *     role="radiogroup" with CONTROLLED selection (`value` + `onChange`).
 *   - Roving tabindex: the selected chip (or the first, when nothing is
 *     selected) is the group's single tab stop — Tab/Shift+Tab move past the
 *     whole group as one unit.
 *   - ArrowRight/Down and ArrowLeft/Up move SELECTION AND FOCUS together,
 *     wrapping at the ends (native button activation — Space/Enter — selects
 *     the focused chip through the ordinary click path).
 *   - Independent toggles are PRESSED BUTTONS instead: `<Chip
 *     variant="toggle" selected>` renders `aria-pressed` flipped by the
 *     button's own Space/Enter activation — never aria-checked (the r3
 *     correction: aria-checked + the radiogroup contract are exclusive-group
 *     territory only).
 *
 * The class/aria math lives in the react-free ./chipClasses.ts (one
 * authority, node-tested); the recipes live in src/styles.css. Icon-only
 * chips require `aria-label` (dev-time warn).
 */
import { Children, createContext, useContext, isValidElement, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { chipAria, chipClasses, type ChipTone, type ChipVariant } from './chipClasses'

export type { ChipTone, ChipVariant }

type ChipGroupValue = {
  exclusive: boolean
  value: string | null
  /** The ordered group keys (each member Chip's `id`), source order. */
  ids: string[]
  select(next: string): void
}

const ChipGroupContext = createContext<ChipGroupValue | null>(null)

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Tone recipe (closed matrix — see chipClasses.ts). Defaults to neutral. */
  tone?: ChipTone
  /** The aria/interaction shape: action (default) | toggle | radio. */
  variant?: ChipVariant
  /** Selected state — the group's value governs inside an exclusive group. */
  selected?: boolean
  /** Busy state: aria-busy + the chip--busy recipe. */
  busy?: boolean
  /** Inside an exclusive ChipGroup: the chip's group key AND its DOM id. */
  id?: string
  children: ReactNode
}

/** Does the children tree carry any text (an icon-ONLY chip needs a label)? */
function hasTextContent(children: ReactNode): boolean {
  if (children === null || children === undefined || typeof children === 'boolean') return false
  if (typeof children === 'string') return children.trim().length > 0
  if (typeof children === 'number') return true
  if (Array.isArray(children)) {
    for (let index = 0; index < children.length; index += 1) {
      if (hasTextContent(children[index])) return true
    }
    return false
  }
  if (isValidElement(children)) {
    const props = children.props as { children?: ReactNode } | undefined
    return props ? hasTextContent(props.children) : false
  }
  return false
}

export function Chip({ tone, variant = 'action', selected, busy, className, children, id, onClick, ...rest }: ChipProps) {
  const group = useContext(ChipGroupContext)
  const keyed = group !== null && id !== undefined && group.ids.indexOf(id) !== -1
  const isSelected = keyed && group.exclusive ? group.value === id : Boolean(selected)
  const tabIndex = keyed && group.exclusive && variant === 'radio'
    ? isSelected || (group.value === null && group.ids[0] === id) ? 0 : -1
    : undefined
  if (import.meta.env.DEV && rest['aria-label'] === undefined && !hasTextContent(children)) {
    console.warn('Chip: icon-only chips require an aria-label (the accessible name is the icon otherwise).')
  }
  return (
    <button
      type="button"
      id={id}
      data-chip-value={id}
      className={chipClasses({ tone, selected: isSelected, busy, className })}
      tabIndex={tabIndex}
      onClick={(event) => {
        if (keyed && group.exclusive) group.select(id!)
        onClick?.(event)
      }}
      {...chipAria({ variant, selected: isSelected, busy })}
      {...rest}
    >
      {children}
    </button>
  )
}

export type ChipGroupProps = HTMLAttributes<HTMLDivElement> & {
  /** EXCLUSIVE groups carry the radiogroup contract (controlled selection). */
  exclusive?: boolean
  /** The selected member's id (controlled). */
  value?: string | null
  /** Controlled selection change — clicks and arrow keys both land here. */
  onChange?(next: string): void
  'aria-label'?: string
  children: ReactNode
}

const ARROW_STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

export function ChipGroup({ exclusive = false, value = null, onChange, className, 'aria-label': ariaLabel, onKeyDown, children, ...rest }: ChipGroupProps) {
  if (import.meta.env.DEV && exclusive && !onChange) {
    console.warn('ChipGroup: exclusive groups are controlled — pass value + onChange (arrow keys and clicks have nowhere to land otherwise).')
  }
  const ids: string[] = []
  Children.forEach(children, (child) => {
    if (isValidElement(child)) {
      const id = (child.props as { id?: unknown }).id
      if (typeof id === 'string' && ids.indexOf(id) === -1) ids.push(id)
    }
  })
  const group: ChipGroupValue = { exclusive, value, ids, select: (next: string) => { onChange?.(next) } }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (!exclusive || event.defaultPrevented) return
    const step = ARROW_STEP[event.key]
    if (step === undefined) return
    const chips = Array.prototype.slice.call(event.currentTarget.querySelectorAll<HTMLElement>('[data-chip-value]')) as HTMLElement[]
    if (chips.length < 2) return
    let anchor = -1
    for (let index = 0; index < chips.length; index += 1) {
      if (chips[index]!.dataset.chipValue === value) { anchor = index; break }
    }
    const next = chips[(anchor === -1 ? 0 : anchor + step + chips.length) % chips.length]!
    event.preventDefault()
    onChange?.(next.dataset.chipValue ?? '')
    next.focus()
  }

  return (
    <div
      role={exclusive ? 'radiogroup' : 'group'}
      aria-label={ariaLabel}
      className={className}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      <ChipGroupContext.Provider value={group}>{children}</ChipGroupContext.Provider>
    </div>
  )
}
