/** useDockRank — the reactive half of the dock-rank model (component
 *  vocabulary task 11, spec §0.1). Subscribes the calling dock to
 *  src/ui/dockOrder's renormalizing rank order: every raiseDock/unregister
 *  PUBLISHES, and every participating dock re-renders with its new rank —
 *  the dock retains NOTHING locally (the retired pattern kept its z in
 *  useState; that stopgap is gone).
 *
 *  Registration is the DOCK's own lifecycle (the migration shape pinned in
 *  dockOrder.ts's header): raise on open, unregister on close/unmount —
 *  the band's participants are exactly the open docks, so ranks stay
 *  consecutive over the surfaces that actually stack. */
import { useSyncExternalStore } from 'react'
import { dockRank, subscribeDockOrder, type DockId } from './dockOrder'

export function useDockRank(id: DockId): number {
  return useSyncExternalStore(subscribeDockOrder, () => dockRank(id))
}
