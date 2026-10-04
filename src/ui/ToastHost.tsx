/**
 * ToastHost — the studio's toast strip (component vocabulary task 9, Flux
 * k2q0n9s). PURE PROPS by design (P07 — the adapter pattern): the host
 * receives `toasts`, `onDismiss`, and `placement` and renders; the STORE
 * connection lives in the adapter (src/canvas/toastAdapter.ts), which
 * connects the canvas zustand store — the timeouts (error 15 s / other
 * 4.2 s), the -3 window, and dismissal — and mounts this component. The
 * host itself never imports store, timing, or persistence.
 *
 * The item vocabulary is RETAINED, not new (manifest §7): every toast
 * renders the old strip's `canvas-toast {tone}` classes + the
 * `data-canvas-toast` attribute, whose rules stay in canvas.css as the
 * retained geometry — the e2e fleet's selectors keep working unchanged.
 * What the host ADDS is the announcement contract: each toast carries its
 * own role (error → alert/assertive, the store's severity contract; other
 * tones → status/polite) — ONE live mechanism per item; the retired strips'
 * container aria-live="polite" died with them.
 *
 * The recipes (`.toast-host`, `.toast-host--{placement}`) live in
 * src/styles.css; the placement prop POSITIONS the host. The class/aria
 * math lives in ./noticeClasses.ts (react-free, node-tested).
 */
import type { HTMLAttributes } from 'react'
import { toastAriaFor, toastClasses, toastItemClasses, type ToastEntry, type ToastPlacement, type ToastTone } from './noticeClasses'

export type { ToastEntry, ToastPlacement, ToastTone }

export type ToastHostProps = Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'children'> & {
  /** The toasts to render, newest last (the adapter passes the store's
   *  slice through — order and windowing are the store's business). */
  toasts: readonly ToastEntry[]
  /** Dismisses one toast by id (the adapter forwards the store's
   *  dismissToast; the × button owns this handler). */
  onDismiss: (id: number) => void
  /** Where the strip sits (closed matrix — see noticeClasses.ts). Defaults
   *  to bottom-left, the canvas strip's historical placement. */
  placement?: ToastPlacement
}

export function ToastHost({ toasts, onDismiss, placement = 'bottom-left', className, ...rest }: ToastHostProps) {
  return (
    <div className={toastClasses({ placement, className })} {...rest}>
      {toasts.map((toast) => (
        <div key={toast.id} className={toastItemClasses(toast.tone)} data-canvas-toast={toast.tone} {...toastAriaFor(toast.tone)}>
          <span>{toast.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
