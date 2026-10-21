/**
 * Canvas take viewer — the overlay mount (foelihc T4, spec §2/§3/§6.1/§6.2).
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
 * chips, the take-chip ladder, and §6.1's compare candidates; this file
 * binds them to the DOM and mounts the CORE (T2) + the strip through it.
 * The core is KEY-REMOUNTED per take (`key={take.id}`): a sources change
 * never re-resolves, so switching takes is a fresh resolution + fresh
 * lease + fresh strip in one unmount/mount (the T2-review M-2 ruling,
 * executed at the mount).
 *
 * §6.1's compare (foelihc T6): the compare chip at the take strip's end
 * toggles the split stage IN, in place of the single core (the mount swap
 * — one shared transport owns both panes), with T1's candidate walk as the
 * second pane's picker.
 */
import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { Button } from '../ui/Button'
import { StudioDialogLayered } from '../ui/StudioDialogLayered'
import { TakeViewerCore } from '../media/TakeViewerCore'
import { TakeCompare, type ComparePaneView } from '../media/TakeCompare'
import type { ViewerMediaSource } from '../media/takeViewerModel'
import {
  TAKE_CHIP_DRIFT_NOTE, candidateKey, candidatePaneTake, compareGate, enterComparePick,
  findCandidate, pickableCompareCandidates, usedByChipAction, viewerHeader, viewerTakeChips,
} from './takeViewerOverlayModel'
import { takeBlobArtifact, takeNumberOf, takePreviewArtifact, usedBy, type DocumentTake } from './derive'
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
  // §6.1's compare session (foelihc T6): active = the split stage; the
  // second pane's picked candidate key (null = only the picker shows).
  const [compare, setCompare] = useState<{ active: boolean; secondKey: string | null }>({ active: false, secondKey: null })

  const tile = viewer ? tiles.find((entry) => entry.id === viewer.chainId) ?? null : null
  const canonicalId = tile?.canonical?.id ?? null

  // The target gone (tombstoned under the viewer): close honestly — never a
  // zombie open state rendering nothing.
  useEffect(() => {
    if (viewer && !tile) setTakeViewer(null)
  }, [viewer, tile, setTakeViewer])

  // A new open (or the canonical pointer moving under an untouched viewer)
  // re-seats the watched take on the canonical — the follow default — and
  // drops any compare session (never a zombie split over a moved target).
  useEffect(() => {
    setActiveTakeId(null)
    setCompare({ active: false, secondKey: null })
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

  // The media a pane plays: the content-addressed blob first, the
  // engine-side media route second (the tile poster's own fallback order) —
  // ONE builder for the watched take and §6.1's compare panes alike.
  const sourcesForTake = (target: DocumentTake): ViewerMediaSource[] => {
    const sources: ViewerMediaSource[] = []
    const blobPath = takeBlobArtifact(target)
    if (blobPath) sources.push({ kind: 'blob', url: documentsApi.blobFileUrl(blobPath) })
    const preview = takePreviewArtifact(target)
    if (preview) sources.push({ kind: 'route', url: `/api/lan/media?source=output&path=${encodeURIComponent(preview)}` })
    return sources
  }
  const metaForTake = (target: DocumentTake) => {
    const m = (target.metrics ?? {}) as Record<string, unknown>
    const duration = Number(m.duration)
    const width = Number(m.width)
    const height = Number(m.height)
    return {
      duration: Number.isFinite(duration) ? duration : 0,
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0,
    }
  }

  const metrics = (take.metrics ?? {}) as Record<string, unknown>
  const previewPath = takePreviewArtifact(take)
  const sources = sourcesForTake(take)
  const meta = metaForTake(take)
  const kind = metrics.kind === 'image' ? 'image' : 'video'
  const landingError = typeof metrics.landingError === 'string' ? metrics.landingError : null

  const chips = viewerTakeChips(tile.takes, take.id)

  // §6.1's compare (foelihc T6): the candidates T1's walk offers — this
  // chain's other takes first (the A/B fork case), then the fork
  // neighborhood — honestly filtered to what can fill a pane; the chip
  // exists only where a second candidate exists (the model's gate — no
  // dead chip).
  const compareCandidatesList = document && chain ? pickableCompareCandidates(document, chain, take.id) : []
  const compareAvailable = compareGate({ watchedKind: kind === 'image' ? 'image' : 'video', candidates: compareCandidatesList })
  // The picked candidate resolves THROUGH the live list, never from the
  // stored key: a watched-take switch that absorbs the pick (the exclusion
  // list recomputes) makes it resolve null — the split honestly falls back
  // to the picker, never a pane comparing itself. No normalizing effect:
  // the derivation IS the normalization.
  const secondCandidate = compare.active ? findCandidate(compareCandidatesList, compare.secondKey) : null
  const secondTake = secondCandidate && document ? candidatePaneTake(document, secondCandidate) : null

  // The watched take must stay VIDEO for the split to live (§2's own image
  // rule — no transport to share): a take-chip switch onto an image take
  // collapses compare to single view alongside the hidden chip, with no
  // state surgery — the derivation governs.
  const compareLive = compare.active && kind === 'video' && secondCandidate !== null && secondTake !== null
  const comparePanes: [ComparePaneView, ComparePaneView] | null = secondCandidate !== null && secondTake !== null
    ? [
      {
        id: `take:${take.id}`,
        chainId: tile.id,
        takeId: take.id,
        title: `take ${takeNumberOf(tile.takes, take)}`,
        sources,
        meta,
        filmstrip: { previewPath },
        label: `${header.title} — take ${takeNumberOf(tile.takes, take)}`,
      },
      {
        id: candidateKey(secondCandidate),
        chainId: secondCandidate.kind === 'take' ? tile.id : secondCandidate.id,
        takeId: secondTake.id,
        title: secondCandidate.title,
        sources: sourcesForTake(secondTake),
        meta: metaForTake(secondTake),
        filmstrip: { previewPath: takePreviewArtifact(secondTake) },
        label: secondCandidate.title,
      },
    ]
    : null

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
        {/* §6.1's entry point (foelihc T6): the compare chip at the take
            strip's END — a toggle into the split stage. Gated by the model
            (no second candidate, no chip); entering auto-picks the first
            candidate (the other-take A/B case), leaving returns to single
            view. */}
        {compareAvailable && (
          <button
            type="button"
            className={`chip ${compare.active ? 'chip--accent' : 'chip--muted'} canvas-take-viewer-compare`}
            data-take-viewer-chrome
            data-canvas-take-viewer-compare={compare.active ? 'on' : 'off'}
            aria-pressed={compare.active}
            title={compare.active ? 'Leave the side-by-side comparison' : 'Compare this take side-by-side — one shared transport'}
            onClick={() => setCompare((current) => (current.active
              ? { active: false, secondKey: null }
              : { active: true, secondKey: enterComparePick(compareCandidatesList) }))}
          >
            compare
          </button>
        )}
      </div>

      {/* §6.1's picker: the second pane's candidates — T1's walk, honestly
          filtered; the picked one marked. Stays live while comparing so the
          A/B question can switch panes without re-entering (and hides with
          the chip wherever the watched take is not video). */}
      {compare.active && compareAvailable && (
        <div className="canvas-take-viewer-compare-picker" aria-label="Compare against">
          <span className="canvas-take-viewer-compare-picker-label">compare with</span>
          {compareCandidatesList.map((candidate) => {
            const key = candidateKey(candidate)
            const picked = compare.secondKey === key
            return (
              <button
                key={key}
                type="button"
                className={`chip chip--muted canvas-take-viewer-compare-candidate ${picked ? 'active' : ''}`}
                data-take-viewer-chrome
                data-canvas-take-viewer-compare-candidate={key}
                aria-pressed={picked}
                title={picked ? `${candidate.title} — the compared pane` : `compare with ${candidate.title}`}
                onClick={() => setCompare((current) => ({ ...current, secondKey: key }))}
              >
                {candidate.title}
              </button>
            )
          })}
        </div>
      )}

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

      {/* THE MOUNT SWAP (§6.1, foelihc T6): compare renders INSTEAD of the
          single core — one shared transport owns BOTH panes, and the core's
          transport owns exactly one lease; sharing its row would weld a
          second pane into the core. The compare mount is KEY-REMOUNTED per
          pane pair (a pane swap = fresh leases + fresh clock); exiting
          returns to the single core, which re-mounts fresh the same way. */}
      {compareLive && comparePanes ? (
        <TakeCompare
          key={`${take.id}:${comparePanes[1].id}`}
          panes={comparePanes}
          onUseFrame={(pane, frameIndex) => {
            setTakeViewer(null)
            setForkMenu({ chainId: pane.chainId, takeId: pane.takeId, frameIndex })
          }}
          className="canvas-take-viewer-core"
        />
      ) : (
        <TakeViewerCore
          key={take.id}
          sources={sources}
          kind={kind}
          meta={meta}
          landingError={landingError}
          label={`${header.title} — ${header.takeLabel}`}
          filmstrip={{ previewPath }}
          onUseFrame={handleUseFrame}
          className="canvas-take-viewer-core"
        />
      )}
    </div>
  </StudioDialogLayered>
}
