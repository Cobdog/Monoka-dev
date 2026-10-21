/**
 * Canvas take viewer — the overlay mount (foelihc T4, spec §2/§3/§6.2).
 *
 * The layered canvas overlay: StudioDialogLayered (the op-editor / crop-editor
 * precedent) owns the focus trap + restore, Escape through the §0.2 layer
 * registry (topmost-only), and outside-press dismissal; the canvas stays
 * alive and dimmed behind it with the SELECTION PRESERVED (this component
 * never selects or deselects on its own paths — only the used-by chip
 * selects, and it closes first).
 *
 * THIN SHELL over src/canvas/takeViewerOverlayModel.ts (the wizardWalk
 * shape): the model owns the open gate, the header fields, the used-by
 * chips, and the take-chip ladder; this file binds them to the DOM and
 * mounts the CORE (T2) + the strip through it. The core is KEY-REMOUNTED
 * per take (`key={take.id}`): a sources change never re-resolves, so
 * switching takes is a fresh resolution + fresh lease + fresh strip in one
 * unmount/mount (the T2-review M-2 ruling, executed at the mount).
 */
import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { Button } from '../ui/Button'
import { StudioDialogLayered } from '../ui/StudioDialogLayered'
import { TakeViewerCore } from '../media/TakeViewerCore'
import type { ViewerMediaSource } from '../media/takeViewerModel'
import {
  TAKE_CHIP_DRIFT_NOTE, usedByChipAction, viewerHeader, viewerTakeChips,
} from './takeViewerOverlayModel'
import { takeBlobArtifact, takeNumberOf, takePreviewArtifact, usedBy } from './derive'
import { documentsApi } from './api'
import { useCanvasStore } from './store'
import './takevieweroverlay.css'

export function TakeViewerOverlay({ onUseFrame }: { onUseFrame?: (frameIndex: number) => void }) {
  const viewer = useCanvasStore((state) => state.takeViewer)
  const tiles = useCanvasStore((state) => state.tiles)
  const documents = useCanvasStore((state) => state.documents)
  const activeProjectId = useCanvasStore((state) => state.activeProjectId)
  const setTakeViewer = useCanvasStore((state) => state.setTakeViewer)
  const setForkMenu = useCanvasStore((state) => state.setForkMenu)
  const select = useCanvasStore((state) => state.select)
  const requestCamera = useCanvasStore((state) => state.requestCamera)
  // The watched take: the canonical pointer at open, then whatever the chip
  // row switches to. null = "follow the canonical" (the open state).
  const [activeTakeId, setActiveTakeId] = useState<string | null>(null)

  const tile = viewer ? tiles.find((entry) => entry.id === viewer.chainId) ?? null : null
  const canonicalId = tile?.canonical?.id ?? null

  // The target gone (tombstoned under the viewer): close honestly — never a
  // zombie open state rendering nothing.
  useEffect(() => {
    if (viewer && !tile) setTakeViewer(null)
  }, [viewer, tile, setTakeViewer])

  // A new open (or the canonical pointer moving under an untouched viewer)
  // re-seats the watched take on the canonical — the follow default.
  useEffect(() => {
    setActiveTakeId(null)
  }, [viewer?.chainId, canonicalId])

  if (!viewer || !tile) return null
  const take = tile.takes.find((entry) => entry.id === (activeTakeId ?? canonicalId)) ?? tile.canonical
  if (!take) return null

  const document = activeProjectId ? documents[activeProjectId] ?? null : null
  const chain = document ? document.chains.find((entry) => entry.id === tile.id) ?? null : null

  // The header reads the model (spec §2: chainTitle · take n of N · duration
  // · resolution — honest nulls for unprobed metrics, never invented ones).
  // A missing document (transient load) still numbers the take honestly.
  const header = document && chain
    ? viewerHeader({ document, chain, takes: tile.takes, take })
    : { title: tile.title, takeLabel: `take ${takeNumberOf(tile.takes, take)} of ${tile.takes.length}`, durationLabel: null, resolutionLabel: null }

  // §6.2's reverse view: the walk's fork arm, chainTitle-named (the model's
  // usedByChips is derive's usedBy — one inverse, two homes).
  const used = document && chain ? usedBy(document, chain) : []

  // The media the core plays: the content-addressed blob first, the
  // engine-side media route second (the tile poster's own fallback order).
  const metrics = (take.metrics ?? {}) as Record<string, unknown>
  const sources: ViewerMediaSource[] = []
  const blobPath = takeBlobArtifact(take)
  if (blobPath) sources.push({ kind: 'blob', url: documentsApi.blobFileUrl(blobPath) })
  const previewPath = takePreviewArtifact(take)
  if (previewPath) sources.push({ kind: 'route', url: `/api/lan/media?source=output&path=${encodeURIComponent(previewPath)}` })

  const kind = metrics.kind === 'image' ? 'image' : 'video'
  const duration = Number(metrics.duration)
  const width = Number(metrics.width)
  const height = Number(metrics.height)
  const landingError = typeof metrics.landingError === 'string' ? metrics.landingError : null

  const chips = viewerTakeChips(tile.takes, take.id)

  // §4's handoff default (foelihc T5): U closes the viewer and opens the
  // fork flow PRE-ANCHORED on the watched take — the menu states the anchor
  // in human words and its extracted-frame row forks with the frame (the
  // seam takes seconds, the record keeps frames). A mount can override the
  // destination through the prop; the core stays canvas-agnostic.
  const handleUseFrame = onUseFrame ?? ((frameIndex: number) => {
    setTakeViewer(null)
    setForkMenu({ chainId: tile.id, takeId: take.id, frameIndex })
  })

  return <StudioDialogLayered
    layerId="canvas-take-viewer"
    open
    onClose={() => setTakeViewer(null)}
    backdropClassName="canvas-take-viewer-backdrop"
    centerClassName="canvas-take-viewer-center"
    popupClassName="canvas-take-viewer"
    labelledBy="canvas-take-viewer-title"
  >
    <div className="canvas-take-viewer-flow" data-canvas-take-viewer>
      <header className="canvas-take-viewer-head">
        <div>
          <h2 id="canvas-take-viewer-title">{header.title}</h2>
          <p className="canvas-take-viewer-sub">
            {header.takeLabel}
            {header.durationLabel ? ` · ${header.durationLabel}` : ''}
            {header.resolutionLabel ? ` · ${header.resolutionLabel}` : ''}
          </p>
        </div>
        <Button variant="ghost" className="canvas-take-viewer-close" data-take-viewer-chrome onClick={() => setTakeViewer(null)}>Close</Button>
      </header>

      {/* §3's take-switching row: the takeNumberOf vocabulary, canonical
          starred, the ForkMenu L28 drift note riding the priors' tooltips.
          Switching only moves the watched take — the canonical POINTER is
          the tile strip's gesture, not this one. Every chip carries the
          focusable-chrome mark (the T-M3 guard). */}
      <div className="canvas-take-viewer-takes" aria-label="Takes">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`chip ${chip.canonical ? 'chip--accent' : 'chip--muted'} canvas-take-viewer-take ${chip.active ? 'active' : ''}`}
            data-take-viewer-chrome
            data-canvas-take-viewer-chip={chip.id}
            data-canvas-take-viewer-chip-active={chip.active}
            aria-pressed={chip.active}
            title={chip.id
              ? `${chip.id} — ${chip.active ? 'watching this take' : 'watch this take'}${chip.canonical ? ' · the canonical take' : ` · ${TAKE_CHIP_DRIFT_NOTE}`}`
              : undefined}
            onClick={() => setActiveTakeId(chip.id)}
          >
            {chip.canonical && <Star size={10} fill="currentColor" />} take {chip.number}
          </button>
        ))}
      </div>

      {/* §6.2's used-by line: one chip per consuming chain, click = close +
          select + fly (the action the model states; the shell issues it). */}
      <div className="canvas-take-viewer-usedby" data-canvas-take-viewer-usedby>
        <span className="canvas-take-viewer-usedby-label">used by →</span>
        {used.length === 0 && <span className="canvas-take-viewer-usedby-none">nothing yet</span>}
        {used.map((card) => {
          const action = usedByChipAction(card.id)
          return (
            <button
              key={card.id}
              type="button"
              className="chip chip--muted canvas-take-viewer-usedby-chip"
              data-take-viewer-chrome
              data-canvas-take-viewer-usedby-chip={card.id}
              title={`${card.id} — close the viewer and fly to this consuming chain`}
              onClick={() => {
                setTakeViewer(null)
                select(action.select)
                requestCamera(action.camera)
              }}
            >
              {card.title}
            </button>
          )
        })}
      </div>

      {/* The core, key-remounted per take: switching swaps the stage's lease
          and the strip together (fresh resolution + fresh transport). */}
      <TakeViewerCore
        key={take.id}
        sources={sources}
        kind={kind}
        meta={{ duration: Number.isFinite(duration) ? duration : 0, width: Number.isFinite(width) ? width : 0, height: Number.isFinite(height) ? height : 0 }}
        landingError={landingError}
        label={`${header.title} — ${header.takeLabel}`}
        filmstrip={{ previewPath }}
        onUseFrame={handleUseFrame}
        className="canvas-take-viewer-core"
      />
    </div>
  </StudioDialogLayered>
}
