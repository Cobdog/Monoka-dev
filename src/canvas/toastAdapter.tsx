/**
 * CanvasToastAdapter — the P07 adapter half of the toast system (component
 * vocabulary task 9, Flux k2q0n9s). ToastHost (src/ui/ToastHost.tsx) is
 * PURE PROPS; THIS module owns the store connection and nothing else: it
 * subscribes to the canvas store's global toast slice, forwards the
 * store's own dismissToast by id, and renders the host.
 *
 * The store contract is UNTOUCHED (the adapter reads, never rewrites):
 *   - timeouts live in store.ts's toast() — error 15 s, every other tone
 *     4.2 s (the W14 severity contract: a failure the user must act on
 *     outlives a success toast);
 *   - the -3 window and dedupe live there too;
 *   - dismissal is the store's dismissToast, forwarded untouched.
 * The pure pass-through mapping (toastAdapterProps) lives in
 * src/ui/noticeClasses.ts, node-tested.
 *
 * Geometry: the adapter composes the canvas strip's retained container
 * class (`canvas-toasts`, canvas.css — the manifest's retained-geometry
 * row) after the host recipes, exactly as the retired inline strips did;
 * `placement` selects the recipe placement (bottom-left, the canvas
 * default; bottom-right, the workbench mount). Surfaces that mount
 * store-acting panels (settings dock, library dock) mount this adapter so
 * notifications never silently vanish (the R-21 doctrine).
 */
import { useCanvasStore } from './store'
import { ToastHost, type ToastPlacement } from '../ui/ToastHost'
import { toastAdapterProps } from '../ui/noticeClasses'

export function CanvasToastAdapter({ placement = 'bottom-left', className = 'canvas-toasts' }: { placement?: ToastPlacement; className?: string }) {
  const toasts = useCanvasStore((state) => state.toasts)
  return <ToastHost {...toastAdapterProps(toasts, (id) => useCanvasStore.getState().dismissToast(id))} placement={placement} className={className} />
}
