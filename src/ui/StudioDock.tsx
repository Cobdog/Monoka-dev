/** StudioDock — the studio's dock shell (component vocabulary task 17, spec
 *  §2.1 "StudioDock thin shell", Flux k2q0n9s). The eight react-rnd sites'
 *  CHROME collapses here — the title bar, the raise interaction, the close
 *  affordance, the resize wiring per policy — while the CONTENT stays
 *  per-surface (children; the spec's "behavior shared, chrome per-surface"
 *  principle, the StudioDialog precedent).
 *
 *  WHAT THE SHELL OWNS:
 *    - the Rnd itself — exactly one left in the tree (the dockOrder suite
 *      pins that census); the dock's root keeps its surface classes
 *      (`dockClassName`) and test hooks (data-* props pass straight through)
 *      plus the shell's own census marker `data-studio-dock={id}`;
 *    - the RANK — task 11's reactive band (src/ui/dockOrder.ts): the z is
 *      `calc(var(--z-dock-base) + rank)`, and registration rides the shell's
 *      MOUNT (raise on mount, unregister on unmount), which is the dock's
 *      open lifetime — every consumer early-returns null while closed, so
 *      the band's participants are exactly the rendered docks. A grab
 *      anywhere on the dock re-raises it (onPointerDownCapture, the
 *      newest-interacted-wins contract);
 *    - the TITLE BAR — the shared `canvas-inspector-header` recipe by
 *      default (the drag handle IS the header); `title` rides verbatim
 *      (icons, the strong, subtitle spans), and the pose rig passes its own
 *      header class;
 *    - the CLOSE AFFORDANCE — the shell's button, the consumer's behavior
 *      (`onClose`) and label;
 *    - the RESIZE WIRING per `resizePolicy`: the policy's minimum box plus
 *      which edges resize. The DEFAULT is the common literal the seven
 *      common-policy sites carried verbatim — grow down/right only, so a
 *      resize can never drag a dock's title bar off the viewport's top-left
 *      corner. The pose rig passes its distinct policy (720×420, every
 *      edge) as data, never coerced to the common gate;
 *    - the CONTENT BOUNDARY (`errorBoundary` — the label): a crashing
 *      surface degrades to the dark fallback without taking the shell down
 *      (the old per-view wrapper discipline, spec §2.1's "error-boundary
 *      slot").
 *
 *  WHAT STAYS PER-SURFACE: the body and footers (children), the dock root's
 *  classes and data hooks, the default rectangle (`geometry` — clamped
 *  upstream with dockDefaultGeometry where the surface already clamps), the
 *  header's inner markup, and the policy's own numbers (P06: geometry is
 *  per-surface data; the shell's chrome recipe is the shared part).
 */
import { useEffect, type ReactNode } from 'react'
import { Rnd, type ResizeEnable } from 'react-rnd'
import { X } from 'lucide-react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { dockZCss, raiseDock, unregisterDock, type DockId } from './dockOrder'
import { useDockRank } from './useDockRank'

/** react-rnd's edge gate (a direction→enabled map, or a boolean for all).
 *  re-resizable renders a handle div per ENABLED direction only — the
 *  refused edges are absent from the DOM, which is what the e2e policy
 *  tests count. */
export type DockResizeEdges = ResizeEnable

/** The common gate — GROW DOWN/RIGHT ONLY: the verbatim literal the
 *  manifest's seven common-policy sites carried (bottom, bottomRight,
 *  right; everything else refused). */
const DOCK_EDGES_GROW_DOWN_RIGHT: DockResizeEdges = {
  bottom: true,
  bottomRight: true,
  right: true,
  bottomLeft: false,
  topLeft: false,
  topRight: false,
  left: false,
  top: false,
}

/** A dock's resize contract: the minimum box plus which edges resize. */
export type DockResizePolicy = {
  minWidth: number
  minHeight: number
  /** Which edges/corners resize. Defaults to DOCK_EDGES_GROW_DOWN_RIGHT;
   *  `true` is the full-edge default the pose rig carries (react-rnd
   *  expands the boolean to every direction). */
  edges?: DockResizeEdges
}

/** The common resize policy — the default `resizePolicy` (the census's most
 *  common minimum box, the settings dock's 420×280, under the common gate).
 *  Migrated surfaces state their own box; the default stands for future
 *  docks and names the literal the surfaces' wiring collapsed into. */
const DOCK_RESIZE_COMMON: DockResizePolicy = { minWidth: 420, minHeight: 280 }

export type StudioDockProps = {
  /** Rank identity in the dock band (src/ui/dockOrder.ts) — also the census
   *  marker's value. */
  id: DockId
  /** The title bar's leading content, rendered verbatim inside the header —
   *  icons, the strong title, subtitle spans all ride it. */
  title: ReactNode
  /** The close affordance's aria-label (the affordance itself is the shell's). */
  closeLabel: string
  /** The close affordance's behavior. */
  onClose(): void
  /** The close button's test hook — the ATTRIBUTE NAME (e.g.
   *  "data-canvas-settings-close"), rendered present when given. */
  closeDataAttr?: string
  /** The close glyph. Defaults to the X icon; the pose rig's × text rides
   *  here. */
  closeGlyph?: ReactNode
  /** The resize wiring. Defaults to the common policy (DOCK_RESIZE_COMMON). */
  resizePolicy?: DockResizePolicy
  /** The content boundary's label: with it, children render inside the
   *  ErrorBoundary (a crashing surface degrades to the dark fallback);
   *  without it the surface owns its own boundary discipline. */
  errorBoundary?: string
  /** The dock root's classes (P06: the surface's own geometry recipe). */
  dockClassName?: string
  /** The header's class — the shared `canvas-inspector-header` recipe by
   *  default; a surface with its own header recipe (the pose rig) passes it
   *  here. The class names the drag handle too: the header IS the grab bar. */
  headerClassName?: string
  /** The dock's default rectangle (per-surface geometry; clamp upstream
   *  with dockDefaultGeometry where the surface already clamps). */
  geometry: { x: number; y: number; width: number; height: number }
  /** The dock's body — content per-surface. */
  children: ReactNode
} & {
  /** Test/data hooks for the dock root, passed through to the Rnd (the
   *  StudioSelect convention — surfaces keep their existing selectors). */
  [key: `data-${string}`]: string | true
}

export function StudioDock({
  id,
  title,
  closeLabel,
  onClose,
  closeDataAttr,
  closeGlyph = <X size={13} />,
  resizePolicy = DOCK_RESIZE_COMMON,
  errorBoundary,
  dockClassName,
  headerClassName = 'canvas-inspector-header',
  geometry,
  children,
  ...dataAttrs
}: StudioDockProps) {
  // Dock stacking (task 11, spec §0.1): the reactive rank — no local z, no
  // CSS pin. Registration rides this component's mount: it renders exactly
  // while its surface is open, so raise-on-mount/unregister-on-unmount IS
  // the dock's open lifetime, and the band's participants are exactly the
  // rendered docks (consecutive ranks over the surfaces that stack).
  const rank = useDockRank(id)
  useEffect(() => {
    raiseDock(id)
    return () => unregisterDock(id)
  }, [id])

  const closeHook = closeDataAttr ? { [closeDataAttr]: true } : {}
  return (
    <Rnd
      className={dockClassName}
      {...dataAttrs}
      data-studio-dock={id}
      style={{ zIndex: dockZCss(rank) }}
      onPointerDownCapture={() => raiseDock(id)}
      default={geometry}
      minWidth={resizePolicy.minWidth}
      minHeight={resizePolicy.minHeight}
      bounds="parent"
      dragHandleClassName={headerClassName}
      enableResizing={resizePolicy.edges ?? DOCK_EDGES_GROW_DOWN_RIGHT}
    >
      <header className={headerClassName}>
        {title}
        <button type="button" aria-label={closeLabel} onClick={onClose} {...closeHook}>
          {closeGlyph}
        </button>
      </header>
      {errorBoundary ? <ErrorBoundary label={errorBoundary}>{children}</ErrorBoundary> : children}
    </Rnd>
  )
}
