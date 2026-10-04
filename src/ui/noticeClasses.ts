/**
 * noticeClasses — the ToastHost + NoticeBanner family's pure class/aria math
 * (component vocabulary task 9, Flux k2q0n9s). React-free on purpose so the
 * node suite (tests/notice-classes.test.js) executes the SAME mapping the
 * components render — the statusToken/chipClasses/buttonClasses doctrine:
 * one authority, tested where it lives.
 *
 * Contract:
 *   - ToastHost is PURE PROPS (P07 — the adapter pattern): `toasts`,
 *     `onDismiss`, `placement`. `toastClasses()` composes
 *     `toast-host toast-host--{placement} [surface…]` — the placement values
 *     OWN the host's positioning (bottom-left = the canvas strip's absolute
 *     geometry, bottom-right = the workbench's fixed corner), while the
 *     consuming surface's container class (`canvas-toasts`, the manifest's
 *     retained geometry) composes LAST and keeps winning the cascade for
 *     layout in its own later-loading sheet. The matrix is CLOSED.
 *   - `toastItemClasses()` is the RETAINED item vocabulary, byte-identical
 *     to the retired strip expression `canvas-toast ${tone}` — the e2e
 *     fleet's `[data-canvas-toast]` / `.canvas-toast.error` selectors and
 *     canvas.css's retained rules keep working unchanged.
 *   - `toastAriaFor()` is the announcement mapping: error toasts are
 *     role=alert + aria-live=assertive (the store's own severity contract —
 *     a failure the user must ACT on), every other tone is role=status +
 *     polite. ONE live mechanism per item; the old strips' container
 *     aria-live="polite" died with them (the roles subsume it — nothing
 *     double-announces).
 *   - NoticeBanner: `noticeClasses()` composes `notice-banner
 *     notice-banner--{tone} [surface…]` (closed tone matrix) and
 *     `noticeAria()` maps the CLOSED role matrix to role + the aria-live
 *     the role implies (status→polite, alert→assertive — the explicit
 *     attribute can never disagree with the role's implicit semantics).
 *   - `toastAdapterProps()` is the P07 adapter's ENTIRE pure job: a
 *     pass-through. Same entries, same order, the store's dismissToast
 *     forwarded untouched, and NOTHING else — the props carry no timing or
 *     dedupe keys because the timeouts (error 15 s / other 4.2 s) and the
 *     -3 window live in canvas/store.ts's toast() and STAY there. The
 *     adapter reads the store; it never rewrites it.
 */

export type ToastPlacement = 'bottom-left' | 'bottom-right'

/** The toast tones the canvas store emits (CanvasToast['tone']). */
export type ToastTone = 'error' | 'success' | 'neutral'

/** One toast entry as ToastHost receives it (the store's CanvasToast,
 *  structurally identical — the adapter passes the entries through). */
export type ToastEntry = { id: number; tone: ToastTone; text: string }

/** The notice tones: the two migrated banner dialects (accent = the
 *  informational note, danger = the error banner). */
export type NoticeTone = 'accent' | 'danger'

/** The announcement roles a NoticeBanner may carry. */
export type NoticeRole = 'status' | 'alert'

export const TOAST_PLACEMENTS: readonly ToastPlacement[] = ['bottom-left', 'bottom-right']
export const TOAST_TONES: readonly ToastTone[] = ['error', 'success', 'neutral']
export const NOTICE_TONES: readonly NoticeTone[] = ['accent', 'danger']
export const NOTICE_ROLES: readonly NoticeRole[] = ['status', 'alert']

function mergeTail(parts: string[], className?: string): string {
  if (className) {
    const tokens = className.split(/\s+/)
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!
      if (token && parts.indexOf(token) === -1) parts.push(token)
    }
  }
  return parts.join(' ')
}

/** Composed host classes: `toast-host toast-host--{placement} [surface…]` —
 *  deduped, the surface's container class last (cascade-friendly). */
export function toastClasses({ placement = 'bottom-left', className }: { placement?: ToastPlacement; className?: string }): string {
  if (TOAST_PLACEMENTS.indexOf(placement) === -1) {
    throw new Error(`toastClasses: unknown toast placement "${String(placement)}" (closed matrix: ${TOAST_PLACEMENTS.join(', ')})`)
  }
  return mergeTail(['toast-host', `toast-host--${placement}`], className)
}

/** The retained toast item vocabulary — the retired strip expression
 *  VERBATIM (neutral is the bare base plus its tone token, exactly as the
 *  strip rendered it; canvas.css owns the rules). */
export function toastItemClasses(tone: ToastTone): string {
  if (TOAST_TONES.indexOf(tone) === -1) {
    throw new Error(`toastItemClasses: unknown toast tone "${String(tone)}" (closed matrix: ${TOAST_TONES.join(', ')})`)
  }
  return `canvas-toast ${tone}`
}

/** The announcement semantics a toast tone carries: errors are alerts
 *  (assertive), everything else is a status (polite). */
export function toastAriaFor(tone: ToastTone): { role: NoticeRole; 'aria-live': 'polite' | 'assertive' } {
  if (TOAST_TONES.indexOf(tone) === -1) {
    throw new Error(`toastAriaFor: unknown toast tone "${String(tone)}" (closed matrix: ${TOAST_TONES.join(', ')})`)
  }
  return tone === 'error' ? { role: 'alert', 'aria-live': 'assertive' } : { role: 'status', 'aria-live': 'polite' }
}

/** Composed banner classes: `notice-banner notice-banner--{tone} [surface…]` —
 *  deduped, the surface's edge geometry class last. */
export function noticeClasses({ tone, className }: { tone: NoticeTone; className?: string }): string {
  if (NOTICE_TONES.indexOf(tone) === -1) {
    throw new Error(`noticeClasses: unknown notice tone "${String(tone)}" (closed matrix: ${NOTICE_TONES.join(', ')})`)
  }
  return mergeTail(['notice-banner', `notice-banner--${tone}`], className)
}

/** The role + the aria-live that role implies, as one spreadable object. */
export function noticeAria(role: NoticeRole): { role: NoticeRole; 'aria-live': 'polite' | 'assertive' } {
  if (NOTICE_ROLES.indexOf(role) === -1) {
    throw new Error(`noticeAria: unknown notice role "${String(role)}" (closed matrix: ${NOTICE_ROLES.join(', ')})`)
  }
  return role === 'alert' ? { role, 'aria-live': 'assertive' } : { role, 'aria-live': 'polite' }
}

/** The adapter's store-wiring mapping: a PASS-THROUGH. The entries arrive
 *  as the store sliced them (its toast() owns the -3 window and the
 *  timeouts); dismissal is the store's own dismissToast, forwarded by id.
 *  The returned props object deliberately carries NOTHING else. */
export function toastAdapterProps(
  toasts: readonly ToastEntry[],
  dismissToast: (id: number) => void,
): { toasts: ToastEntry[]; onDismiss: (id: number) => void } {
  return { toasts: toasts.slice(), onDismiss: dismissToast }
}
