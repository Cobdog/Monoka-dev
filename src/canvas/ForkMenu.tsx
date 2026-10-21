/**
 * Canvas Phase 2 — the fork gesture menu (§2 fork substrates, L28 drift
 * guidance).
 *
 * Offers the substrates the selected take can actually fork on (decoded /
 * extracted frame / latents on disk — availability-honest) AND the
 * fork-from-early-take preference: an earlier take has hopped fewer windows,
 * so drifting identities should re-anchor there (the drift guidance
 * surfaced as a first-class choice, not a footnote).
 *
 * Component vocabulary task 16: the menu rides PopoverMenu — the ONE
 * dismissal idiom (registry Escape + Base UI outside-press). Pre-migration
 * this menu had NO Escape of its own (backdrop-click only).
 */
import { useLayoutEffect, useState } from 'react'
import { useCanvasStore } from './store'
import { takeNumberOf } from './derive'
import { SUBSTRATE_LABEL, forkFrameRowNote, substratesForTake, type ForkSubstrate } from './generation'
import { PopoverMenu } from '../ui/PopoverMenu'
import type { MediaFile } from '../types'

export function ForkMenu() {
  const menu = useCanvasStore((state) => state.forkMenu)
  const tiles = useCanvasStore((state) => state.tiles)
  const setForkMenu = useCanvasStore((state) => state.setForkMenu)
  const fork = useCanvasStore((state) => state.fork)
  // (foelihc T8, the T5-review I-1 rider) A handed frame preselects the
  // extracted-frame row — that row owns the OPENING FOCUS. PopoverMenu's
  // attach-time focusOnOpen seats focus on the panel (no entry field here)
  // and the arrow walk enters at the FIRST row ('decoded'), so U → ↓ → Enter
  // forked decoded and silently dropped the picked frame. The row is tracked
  // as STATE (PopoverMenu's own portal-commit lesson: the popup can attach a
  // commit after open, so an open-keyed effect alone can miss the node) and
  // this effect runs after the attach-time focus call in every commit
  // ordering — focus lands on the marked row, Enter accepts the anchor, the
  // walk steps FROM it. The accent (canvas.css, keyed on the same data mark)
  // keeps the row identified after focus travels. Without a handed frame the
  // default stands: panel focus, arrows enter at the first row.
  const [preselectedRow, setPreselectedRow] = useState<HTMLButtonElement | null>(null)
  const handedFrame = menu?.frameIndex
  useLayoutEffect(() => {
    if (handedFrame != null) preselectedRow?.focus()
  }, [handedFrame, preselectedRow])
  if (!menu) return null

  const tile = tiles.find((entry) => entry.id === menu.chainId)
  if (!tile || !tile.canonical) return null
  const substrates = substratesForTake(tile.canonical, tile.mediaKind as MediaFile['kind'] | null)
  // Earlier takes = priors, oldest-first. Forking one records the pinned
  // takeId — the pre-drift anchor.
  const earlier = [...tile.takes].filter((take) => take.id !== tile.canonical!.id).sort((a, b) => a.createdAt - b.createdAt)
  // The output id is the chain's first output (one output per chain in v1).
  const chainOutputId = (() => {
    const state = useCanvasStore.getState()
    const doc = state.activeProjectId ? state.documents[state.activeProjectId] : null
    return doc?.chains.find((chain) => chain.id === tile.id)?.outputs[0]?.id ?? null
  })()

  return <PopoverMenu
    layerId="canvas-fork-menu"
    open
    onClose={() => setForkMenu(null)}
    position={{ left: Math.min(Math.max(16, tile.x + tile.w - 60), window.innerWidth - 300), top: Math.max(64, tile.y + 48) }}
    className="canvas-endpoint-menu canvas-fork-menu"
    backdrop
    data-canvas-fork-menu
    data-canvas-fork-frame={menu.frameIndex ?? undefined}
    role="dialog"
    aria-label="Fork"
  >
    <header>
      <strong>Fork “{tile.title}”</strong>
      <span>the source is never altered</span>
    </header>
    <div className="canvas-menu-group" data-canvas-menu-group="substrate">
      <span className="canvas-menu-group-label">substrate</span>
      {(substrates as ForkSubstrate[]).map((substrate) => (
        <button
          type="button"
          key={substrate}
          className="canvas-menu-row"
          ref={substrate === 'extracted-frame' ? setPreselectedRow : undefined}
          data-canvas-fork-substrate={substrate}
          data-canvas-fork-preselected={menu.frameIndex != null && substrate === 'extracted-frame' ? 'true' : undefined}
          onClick={() => chainOutputId && void fork({ chainId: tile.id, outputId: chainOutputId, takeId: menu.takeId ?? undefined, substrate, frameIndex: menu.frameIndex ?? undefined })}
        >
          <span className="canvas-menu-row-label">{SUBSTRATE_LABEL[substrate]}</span>
          <span className="canvas-menu-row-note">
            {/* (foelihc T5, spec §4) With a frame handed in from the viewer's
                "use this frame", the row states the anchor in human words —
                the frame + its seconds, never arithmetic teaching. Without
                one, today's default copy. */}
            {substrate === 'decoded' ? 'A new chain consuming this take’s artifact.' : substrate === 'extracted-frame' ? forkFrameRowNote(menu.frameIndex) : 'Motion-Context continuation — the saved clip pins never-denoised conditioning, no re-encode.'}
          </span>
        </button>
      ))}
      {/* Upscale dual-mode (§5.1): the FORK side. The stack side is the
          upscale op in the op modal — one capability, two placements. */}
      <button
        type="button"
        className="canvas-menu-row"
        data-canvas-fork-upscale
        onClick={() => chainOutputId && void fork({ chainId: tile.id, outputId: chainOutputId, takeId: menu.takeId ?? undefined, substrate: 'decoded', withUpscale: true })}
      >
        <span className="canvas-menu-row-label">Fork — upscaled</span>
        <span className="canvas-menu-row-note">A new chain with the engine upscale preset (switchable in its properties).</span>
      </button>
    </div>
    {earlier.length > 0 && (
      <div className="canvas-menu-group" data-canvas-menu-group="early-take">
        <span className="canvas-menu-group-label">fork from an earlier take — lower drift</span>
        {earlier.slice(0, 4).map((take) => (
          <button
            type="button"
            key={take.id}
            className="canvas-menu-row"
            data-canvas-fork-take={take.id}
            title={`${take.id} — recorded ${new Date(take.createdAt).toLocaleTimeString()} · forking from an earlier take re-anchors an identity that has drifted`}
            onClick={() => chainOutputId && void fork({ chainId: tile.id, outputId: chainOutputId, takeId: take.id, substrate: 'decoded' })}
          >
            <span className="canvas-menu-row-label">take {takeNumberOf(tile.takes, take)}</span>
            <span className="canvas-menu-row-note">recorded {new Date(take.createdAt).toLocaleTimeString()}</span>
          </button>
        ))}
      </div>
    )}
    <footer>Esc closes · B reopens from any selection</footer>
  </PopoverMenu>
}
