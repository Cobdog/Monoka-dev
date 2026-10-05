/** The reactive dock-rank model (component vocabulary task 11, spec §0.1
 *  layering) — the keyed rank source behind `useDockRank` and the tier
 *  contract the z tokens in src/styles.css publish.
 *
 *  WHAT REPLACED WHAT: docks used to feed their z from `store.raiseDock(): number`
 *  — an UNBOUNDED counter each dock retained in local state (task 3's
 *  stopgap). Two failure modes: the counter crossed fixed chrome after ~10
 *  raises (the bench panel's z-70 first, then every tier above it — a lone
 *  modal constant eventually loses), and at-rest docks that had never been
 *  grabbed tied at z-60 with DOM order deciding. The replacement:
 *
 *    - participation is keyed (`raiseDock(id)` self-registers at the TOP —
 *      newest wins, CV03's raise discipline; `unregisterDock(id)` leaves);
 *    - every raise RENORMALIZES the participants to consecutive ranks
 *      0..n-1 (bottom→top) and PUBLISHES to every subscriber — no local z
 *      retention anywhere, and the band width is the participant count,
 *      forever bounded (NO clamping, NO modulo: both invert or collapse
 *      ordering — the r2 planning note);
 *    - the RANK is the list index; the z is `calc(var(--z-dock-base) +
 *      rank)` — the CSS token owns the band floor, so the ladder
 *      (--z-dock-base < --z-modal < --z-consent) lives entirely in the
 *      sheet and is asserted there (tests/dockOrder.test.js + the e2e
 *      band tests).
 *
 *  A dock's lifecycle with this module (the migration shape every dock
 *  shares, task 17's StudioDock included):
 *
 *      const rank = useDockRank('settings')            // reactive rank
 *      useEffect(() => {                               // registration rides
 *        raiseDock('settings')                         //   the shell's
 *        return () => unregisterDock('settings')       //   MOUNT lifetime
 *      }, [id])                                        //   (every consumer
 *      <Rnd style={{ zIndex: dockZCss(rank) }}         //   early-returns
 *           onPointerDownCapture={() => raiseDock('settings')} /> // null closed)
 *
 *  Like the layer registry (task 10), this is a UI-layer mechanism the
 *  canvas surfaces CONSUME — it holds no domain state and imports nothing.
 *
 *  VM-harness discipline (tests/dockOrder.test.js loads this module): no
 *  iterator spreads, no matchAll, no browser globals. */
export type DockId = string

/** The band floor token — the ONE place the dock band's position is named.
 *  dockZCss composes it; tests/dockOrder.test.js pins the ladder against
 *  src/styles.css at run time. */
export const DOCK_Z_BASE_TOKEN = '--z-dock-base'

// ---- the pure rank math (unit-tested directly; state ops are defined over
// these, so the renormalization property is provable with no store) ----

/** Re-rank: the raised id to the top, everyone else keeping their relative
 *  order (monotone recency). An unknown id is APPENDED — raiseDock is
 *  self-registering, and the result is consecutive 0..n-1 by construction. */
export function raiseInOrder(current: readonly DockId[], id: DockId): DockId[] {
  const next = current.filter((entry) => entry !== id)
  next.push(id)
  return next
}

/** Leave: removes exactly this id (non-top removal included — a dock closed
 *  from under a newer one must not corrupt the order); survivors compress
 *  back to consecutive ranks. */
export function removeFromOrder(current: readonly DockId[], id: DockId): DockId[] {
  return current.filter((entry) => entry !== id)
}

/** The id's rank — its index in the bottom→top order. An UNREGISTERED id
 *  reads order.length: the as-if-appended slot, exactly where its raise
 *  lands it one tick later, so a dock rendering between mount and its
 *  raise-on-open effect never shows a stale or negative rank. */
export function rankIn(current: readonly DockId[], id: DockId): number {
  const index = current.indexOf(id)
  return index === -1 ? current.length : index
}

/** The z a rank renders at: the token floor plus the rank. A string on
 *  purpose — the sheet owns the number, the DOM resolves it (browsers
 *  compute `calc(var(--z-dock-base) + 3)` to an integer z, which is what
 *  the e2e band assertions read). */
export function dockZCss(rank: number): string {
  return `calc(var(${DOCK_Z_BASE_TOKEN}) + ${rank})`
}

// ---- the reactive slice ------------------------------------------------------

/** The order, bottom → top. Ranks are the indices — consecutive 0..n-1 by
 *  construction, which IS the renormalization. */
let order: DockId[] = []

const listeners: Array<() => void> = []

function publish(): void {
  const snapshot = listeners.slice()
  for (let index = 0; index < snapshot.length; index += 1) snapshot[index]()
}

/** Raise a dock to the top of the band (registering it if it is new) and
 *  PUBLISH the re-ranked order to every participant. */
export function raiseDock(id: DockId): void {
  order = raiseInOrder(order, id)
  publish()
}

/** Take a dock out of the band (close/unmount). A no-op for ids that are
 *  not registered — no churn, no publish. */
export function unregisterDock(id: DockId): void {
  const next = removeFromOrder(order, id)
  if (next.length === order.length) return
  order = next
  publish()
}

/** The id's current rank — the value `useDockRank` subscribes to. */
export function dockRank(id: DockId): number {
  return rankIn(order, id)
}

/** The current order, bottom → top (probe/test visibility; a copy). */
export function dockOrderSnapshot(): DockId[] {
  return order.slice()
}

/** Subscription for the React binding (useSyncExternalStore). */
export function subscribeDockOrder(listener: () => void): () => void {
  listeners.push(listener)
  let active = true
  return () => {
    if (!active) return
    active = false // spent handle: idempotent
    const index = listeners.indexOf(listener)
    if (index !== -1) listeners.splice(index, 1)
  }
}
