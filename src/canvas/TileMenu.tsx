/**
 * The tile context menu (wzt73ob R2 F10) — the object-level actions that had
 * NO home: right-click was the browser default and Delete was a no-op, while
 * the only trash front door lived in the ⌘K index. One row, one purpose:
 * move the whole selection to the trash through the EXISTING tombstone
 * machinery (deleteTiles → deleteScene → the same trash the index browser
 * reads; NEVER a hard delete) — the toast's Undo action is the first-line
 * recovery, the trash browser is the second.
 *
 * Component vocabulary task 16: the menu rides PopoverMenu — the ONE
 * dismissal idiom (registry Escape + Base UI outside-press); the F8 viewport
 * clamp keeps it on screen, so the pointer position passes through raw.
 */
import { useCanvasStore } from './store'
import { PopoverMenu } from '../ui/PopoverMenu'

export function TileMenu() {
  const menu = useCanvasStore((state) => state.tileMenu)
  const setTileMenu = useCanvasStore((state) => state.setTileMenu)
  if (!menu) return null
  return <PopoverMenu
    layerId="canvas-tile-menu"
    open
    onClose={() => setTileMenu(null)}
    position={{ left: menu.x, top: menu.y }}
    className="canvas-endpoint-menu canvas-tile-menu"
    backdrop
    data-canvas-tile-menu
    role="menu"
    aria-label="Object actions"
  >
    <button
      type="button"
      className="canvas-menu-row"
      role="menuitem"
      data-canvas-tile-menu-delete
      onClick={() => {
        // Live read at click: the right-clicked tile joins the selection when
        // it is not part of it (set at open), so a marquee clears in one
        // gesture — the row acts on the WHOLE selection either way.
        const state = useCanvasStore.getState()
        const ids = state.selection.tileIds.includes(menu.chainId) ? [...state.selection.tileIds] : [menu.chainId]
        setTileMenu(null)
        void state.deleteTiles(ids)
      }}
    >
      <TileMenuDeleteLabel chainId={menu.chainId} />
      <span className="canvas-menu-row-note">Restorable from the trash (⌘K) — an undo toast follows.</span>
    </button>
    <footer>Esc closes</footer>
  </PopoverMenu>
}

function TileMenuDeleteLabel({ chainId }: { chainId: string }) {
  const count = useCanvasStore((state) => (state.selection.tileIds.includes(chainId) ? state.selection.tileIds.length : 1))
  return <span className="canvas-menu-row-label">{count > 1 ? `Trash ${count} objects` : 'Move to trash'}</span>
}
