/**
 * Canvas Phase 2 — the typed-hole menu (§3 option menus).
 *
 * Opens on a tile's head (consume-from) or tail (produce-into) endpoint. The
 * rows come from the pure options module — type-directed over the source
 * media kinds, availability-aware (registry/LSX-2.3 detection + install
 * guidance), with the parameter hints in-menu. L19: category visible, the
 * type-natural generation routes lead.
 *
 * Component vocabulary task 16: the menu rides PopoverMenu — the ONE
 * dismissal idiom (registry Escape + Base UI outside-press), focus into the
 * surface on open, the local arrow walk over the rows, and the F8 viewport
 * clamp (the measured-height lift this menu pioneered, now the component's).
 */
import { useMemo } from 'react'
import { useCanvasStore } from './store'
import { dbg } from '../lib/dbg'
import { endpointOptions, type SourceKind } from './options'
import { readChainSettings } from './generation'
import { PopoverMenu } from '../ui/PopoverMenu'
import type { DocumentChain } from './derive'

/** The source media kinds an output tile carries (its canonical take). */
function sourceKindsOf(chain: DocumentChain | undefined): SourceKind[] {
  const take = chain?.outputs.flatMap((output) => output.takes).find((entry) => entry.supersededBy === null) ?? null
  const kind = take?.metrics?.kind
  if (kind === 'image' || kind === 'video' || kind === 'audio') return [kind]
  return chain?.kind === 'media' ? ['image'] : []
}

export function EndpointMenu() {
  const menu = useCanvasStore((state) => state.endpointMenu)
  const documents = useCanvasStore((state) => state.documents)
  const activeProjectId = useCanvasStore((state) => state.activeProjectId)
  const selection = useCanvasStore((state) => state.selection)
  const tiles = useCanvasStore((state) => state.tiles)
  const setEndpointMenu = useCanvasStore((state) => state.setEndpointMenu)
  const runEndpointAction = useCanvasStore((state) => state.runEndpointAction)
  const optionAvailability = useCanvasStore((state) => state.optionAvailability)

  const context = useMemo(() => {
    if (!menu) return null
    const doc = activeProjectId ? documents[activeProjectId] : null
    const chain = doc?.chains.find((entry) => entry.id === menu.chainId)
    const tile = tiles.find((entry) => entry.id === menu.chainId)
    // The consume direction acts on the SELECTED source (another tile); the
    // produce direction acts on THIS tile's output.
    const sourceChainId = selection.tileIds.find((id) => id !== menu.chainId) ?? null
    const kinds = menu.direction === 'produce' ? sourceKindsOf(chain) : sourceKindsOf(doc?.chains.find((entry) => entry.id === sourceChainId))
    return { chain, tile, sourceChainId, kinds }
  }, [activeProjectId, documents, menu, selection.tileIds, tiles])

  if (!menu || !context) return null
  // The consume menu opens on THIS chain's head — its media type gates the
  // video-only input roles (tmz8vh7 / audit P1-2).
  const options = endpointOptions(menu.direction, context.kinds, optionAvailability(), readChainSettings(context.chain?.settings ?? {}).mediaType)
  const hasOutput = Boolean(context.chain?.outputs.length)
  const naturalLeft = Math.min(Math.max(16, (context.tile?.x ?? 0) + (menu.direction === 'consume' ? -180 : (context.tile?.w ?? 0) - 40)), window.innerWidth - 300)
  const naturalTop = Math.max(64, (context.tile?.y ?? 0) + 24)

  return <PopoverMenu
    layerId="canvas-endpoint-menu"
    open
    onClose={() => setEndpointMenu(null)}
    position={{ left: naturalLeft, top: naturalTop }}
    className="canvas-endpoint-menu"
    backdrop
    data-canvas-endpoint-menu={menu.direction}
    role="dialog"
    aria-label={menu.direction === 'consume' ? 'Consume-from options' : 'Produce-into options'}
  >
    <header>
      <strong>{context.tile?.title ?? menu.chainId.slice(0, 8)}</strong>
      <span>{menu.direction === 'consume' ? 'consume from — inputs' : 'produce into — extensions'}</span>
    </header>
    <div className="canvas-menu-groups">
      {['generate', 'input', 'control', 'utility', 'fork'].map((group) => {
        const rows = options.filter((option) => option.group === group)
        if (!rows.length) return null
        return <div key={group} className="canvas-menu-group" data-canvas-menu-group={group}>
          <span className="canvas-menu-group-label">{group === 'generate' ? 'generate' : group === 'input' ? 'inputs' : group === 'control' ? 'control inputs' : group === 'utility' ? 'utilities' : 'fork'}</span>
          {rows.map((option) => {
            // (R-22) Consume rows are GATED on a selected source — the menu
            // enforces instead of teaching: without a source the rows say so
            // and refuse, the dead-end footer is gone.
            // Input roles consume a source; CONTROL rows (the pose rig —
            // a from-scratch input) never do.
            const needsSource = menu.direction === 'consume' && option.group === 'input' && !context.sourceChainId
            const gated = !option.available || needsSource
            if (gated) dbg('menu.gate', { option: option.id, direction: menu.direction, because: needsSource ? 'no-source-chain' : (option.reason ?? 'unavailable') })
            const gateReason = needsSource ? 'Select the object to consume from first — click it, then open this menu.' : option.reason
            return (
              <div key={option.id} className="canvas-menu-rowwrap">
                <button
                  type="button"
                  className={`canvas-menu-row ${gated ? 'unavailable' : ''}`}
                  data-canvas-menu-row={option.id}
                  disabled={gated}
                  title={[gateReason, option.hint].filter(Boolean).join('\n')}
                  onClick={() => void runEndpointAction(menu.chainId, menu.direction, option, context.sourceChainId ?? undefined)}
                >
                  <span className="canvas-menu-row-label">{option.label}</span>
                  <span className="canvas-menu-row-note">{gated ? gateReason : option.description}</span>
                  {option.hint && !gated && <span className="canvas-menu-row-hint">{option.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
      })}
    </div>
    <footer>
      {menu.direction === 'produce' && !hasOutput && 'This object has no output yet — generate or drop media first.'}
      {menu.direction === 'consume' && !context.sourceChainId && 'Pick the source object first — every input row unlocks once one is selected.'}
      {((menu.direction === 'produce' && hasOutput) || (menu.direction === 'consume' && context.sourceChainId)) && 'Esc closes · hints show the parameter contracts'}
    </footer>
  </PopoverMenu>
}
