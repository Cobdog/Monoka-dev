/**
 * Timeline — the animation module's timeline (task 8, k2q0n9s, spec §5 the
 * key-slot model + §6 span authoring + §7.4 during the wait): the visual
 * heart of the module, mounted in the shell's stage for a bound document.
 *
 * Props-only (P07): every connection lives in ./state.ts — this component
 * derives NOTHING beyond the geometry of the timeline model
 * (./timelineModel.ts, the node-tested pure core) and renders what it is
 * handed:
 *   - keys as IMAGE-BACKED cards in `order` sequence, each with the lock
 *     chip (the kit's toggle Chip — the server-enforced protection, §5.1)
 *     and the ORIGIN BADGE of its selected candidate. No permanent tile
 *     treatments by origin (§5.1: after selection they perform the same
 *     timeline role); an empty slot renders an honest placeholder, and a
 *     candidate without a previewable relPath renders its asset id — never
 *     an assumed path (task 7's concern: handles may be opaque canvas
 *     output ids);
 *   - spans as bars connecting their endpoint keys, stacked in the model's
 *     nesting lanes (adjacent spans on the track lane, overlapping spans
 *     above), with the span's tween STEP SLOTS nested inside the bar;
 *   - selection: one id highlights the active span AND its two endpoint
 *     keys (the §6.1 inspector's inputs);
 *   - the playhead marking the review position (§7.4 — the newest
 *     attempt's target, absent when nothing targets the timeline);
 *   - the SEED affordance: a bound timeline with no keys offers the
 *     explicit action that materializes the initial key slot from the
 *     binding's initialKeyAssetId (the binding alone creates no slot —
 *     §5.3's selection is explicit, so the seed is too).
 *
 * Geometry only in animation.css (the P06 doctrine): tokens throughout, the
 * kit's Chip/Button recipes carry the interactive chrome.
 */
import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Lock, LockOpen, Sprout } from 'lucide-react'
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { documentsApi } from '../canvas/api'
import type { BindingVersion, ChainMismatch, KeyCandidate } from '../../shared/animation/types'
import type { ChainSurface, TimelineModel, TimelineReviewPosition } from './timelineModel'

export type TimelineProps = {
  timeline: TimelineModel
  /** The active binding — the seed affordance's source (required: the shell
   *  mounts the timeline only for a bound document). */
  binding: BindingVersion
  /** The one selected timeline entity (a key id or a span id), or null. */
  selectedId: string | null
  /** The review position for the playhead (null: absent, never a guess). */
  playhead: TimelineReviewPosition
  /** True while a timeline command is in flight (the store's busy). */
  busy: boolean
  /** The extension chains (§4's chain surface — Task 6): window slots in
   *  order per chain, the derived mismatch, the assembled preview. */
  chains: ChainSurface | null
  /** The chain window under review (a window slot id), or null. */
  selectedWindowId: string | null
  onSelectKey(keyId: string): void
  onSelectSpan(spanId: string): void
  onToggleLock(keyId: string, locked: boolean): void
  onSeedInitialKey(): void
  /** Opens a chain window's review (§4 — per-slot selection lives there). */
  onSelectWindow(windowSlotId: string): void
  /** The mismatch banner's FIRST resolution (§4): reselect the ancestor
   *  window's compatible take (`expectedSelection`). */
  onReselectAncestor(mismatch: ChainMismatch): void
  /** The mismatch banner's SECOND resolution (§5 ruling 3): explicitly
   *  rebind the descendant window to the ancestor's CURRENT selection. */
  onRebindWindow(mismatch: ChainMismatch): void
}

/** The candidate's image, or the honest placeholder when there is nothing
 *  previewable: no selected candidate, no relPath, or a preview that failed
 *  to load (an opaque handle is named, never guessed into a URL that lies). */
function KeyImage({ candidate }: { candidate: KeyCandidate | null }) {
  const [failed, setFailed] = useState(false)
  if (candidate === null) {
    return <div className="anim-key-empty" data-anim-key-empty>no image chosen</div>
  }
  const relPath = candidate.assetReference.relPath
  if (relPath === null || failed) {
    return (
      <div className="anim-key-placeholder" data-anim-key-placeholder title={candidate.assetReference.assetId}>
        {candidate.assetReference.assetId}
      </div>
    )
  }
  return <img className="anim-key-img" src={documentsApi.blobFileUrl(relPath)} alt={`Key image (${candidate.origin})`} onError={() => setFailed(true)} />
}

/** The seed card's preview of the bound initial key — the same honest
 *  degradation as a key card: a path-like handle previews through the blob
 *  route, an opaque handle is named. */
function SeedPreview({ assetId }: { assetId: string }) {
  const [failed, setFailed] = useState(false)
  if (!assetId.includes('/') || failed) {
    return <div className="anim-key-placeholder" data-anim-key-placeholder title={assetId}>{assetId}</div>
  }
  return <img className="anim-key-img" data-anim-seed-preview src={documentsApi.blobFileUrl(assetId)} alt="The bound initial key" onError={() => setFailed(true)} />
}

function SeedCard({ binding, busy, onSeed }: { binding: BindingVersion; busy: boolean; onSeed(): void }) {
  return (
    <div className="anim-seed" data-anim-seed-card>
      <h4 className="anim-seed-title">The bound initial key</h4>
      <p className="anim-seed-lede">
        This timeline holds no keys yet. The session binding (version {binding.version}) carries the first pose — seed the initial key slot from it to start authoring.
      </p>
      <div className="anim-seed-body">
        <SeedPreview assetId={binding.initialKeyAssetId} />
        <div className="anim-seed-actions">
          <Button variant="primary" className="anim-btn" busy={busy} disabled={busy} icon={<Sprout size={12} />} onClick={onSeed} data-anim-seed-initial>
            Seed the initial key slot
          </Button>
          <span className="anim-note">One explicit act — the slot materializes with the bound image and selects it.</span>
        </div>
      </div>
    </div>
  )
}

const selectOnKey = (onSelect: () => void) => (event: ReactKeyboardEvent<HTMLElement>) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onSelect()
  }
}

/** §4's chain surface: one row per extension chain — the root take, the
 *  window slots in order (each with its takes count, its own selection
 *  truth, its stale mark), the assembled preview along the ONE selected
 *  path, and the DERIVED mismatch banner with its two explicit resolutions.
 *  A mismatch NEVER silently assembles: the banner replaces the assembled
 *  total. Locks never hide it (derived truth is not a command). */
function ChainBand({ surface, selectedWindowId, busy, onSelectWindow, onReselectAncestor, onRebindWindow }: {
  surface: ChainSurface
  selectedWindowId: string | null
  busy: boolean
  onSelectWindow(windowSlotId: string): void
  onReselectAncestor(mismatch: ChainMismatch): void
  onRebindWindow(mismatch: ChainMismatch): void
}) {
  if (surface.chains.length === 0) return null
  return (
    <div className="anim-chains" data-anim-chains aria-label="The extension chains">
      {surface.chains.map((view) => {
        const mismatch = view.mismatch
        // The banner's second resolution needs the ancestor's CURRENT
        // selection as the rebind target; a null selection (or a source
        // outside this chain) names itself instead of offering a doomed
        // command.
        const ancestorSlot = mismatch !== null && mismatch.ancestorSlotId !== null
          ? view.chain.windows.find((window) => window.id === mismatch.ancestorSlotId) ?? null
          : null
        const rebindTarget = ancestorSlot !== null ? ancestorSlot.selectedCandidateId : null
        return (
          <section key={view.chain.rootAttemptId} className="anim-chain" data-anim-chain={view.chain.rootAttemptId}>
            <header className="anim-chain-header">
              <strong>Extension chain</strong>
              <span className="anim-note" data-anim-chain-assembled={view.assembled !== null ? String(view.assembled.deliveredFrames) : view.assembledAbsentReason === 'mismatch' ? 'blocked' : 'awaiting'}>
                rooted at this span&apos;s take — {view.windows.length} {view.windows.length === 1 ? 'window' : 'windows'}
                {view.assembled !== null
                  ? ` · ${view.assembled.deliveredFrames} delivered frames along the selected path (root + ${view.assembled.windows})`
                  : view.assembledAbsentReason === 'in-flight'
                    ? ' · the assembled total lands when the selected path finishes rendering'
                    : ''}
              </span>
              {view.rootProblem !== null && <span className="anim-note" role="status" data-anim-chain-root-problem>{view.rootProblem}</span>}
            </header>
            <div className="anim-chain-windows" role="group" aria-label="The chain's windows in order">
              {view.windows.map((window, index) => (
                <button
                  key={window.slot.id}
                  type="button"
                  className="anim-chain-window"
                  data-anim-chain-window={window.slot.id}
                  data-anim-window-order={window.slot.order}
                  data-anim-selected={window.slot.id === selectedWindowId ? 'true' : 'false'}
                  data-anim-window-stale={window.slot.stale ? 'true' : 'false'}
                  data-anim-window-mismatch={mismatch !== null && mismatch.windowSlotId === window.slot.id ? 'true' : 'false'}
                  data-anim-window-review-pending={window.reviewPending ? 'true' : 'false'}
                  disabled={busy}
                  title={`Window ${index + 1} — ${window.takes.length} ${window.takes.length === 1 ? 'take' : 'takes'}${window.slot.selectedCandidateId !== null ? '; the selected take drives the assembled preview' : window.reviewPending ? '; a landed take awaits your selection' : ''}${window.slot.stale ? ` (stale: ${window.slot.staleReasons.join(', ')})` : ''}`}
                  onClick={() => onSelectWindow(window.slot.id)}
                >
                  window {index + 1}
                  <span className="anim-chain-window-meta">
                    {window.takes.length} {window.takes.length === 1 ? 'take' : 'takes'}
                    {window.slot.selectedCandidateId !== null ? ' · selected' : window.reviewPending ? ' · ready to review' : ''}
                  </span>
                  {mismatch !== null && mismatch.windowSlotId === window.slot.id && <span className="anim-chain-window-flag">mismatch</span>}
                </button>
              ))}
            </div>
            {/* §4's named stale/mismatch state — surfaced, never silently
                assembled past. The two explicit resolutions; the banner
                stands regardless of locks (a lock never hides a mismatch). */}
            {mismatch !== null && (
              <div className="anim-chain-mismatch" role="alert" data-anim-chain-mismatch>
                <p className="anim-chain-mismatch-title">Ancestry mismatch — the assembled preview stops here</p>
                <p className="anim-note">
                  Window {view.windows.findIndex((window) => window.slot.id === mismatch.windowSlotId) + 1}&apos;s selected take was conditioned on a frozen source that its ancestor window no longer selects. Assembling would join unrelated ancestry; nothing rebinds by itself.
                </p>
                <div className="anim-chain-mismatch-actions">
                  <Button
                    variant="secondary" className="anim-btn"
                    busy={busy}
                    disabled={busy || ancestorSlot === null || ancestorSlot.lock}
                    data-anim-mismatch-reselect
                    title={ancestorSlot === null
                      ? 'The frozen source is not a member of this chain — reselecting has nothing to restore here'
                      : ancestorSlot.lock
                        ? 'The ancestor window is locked — unlock it before changing its selection (the lock never hides the mismatch)'
                        : 'Reselect the ancestor window\'s compatible take — the recorded edge becomes the selected path again'}
                    onClick={() => onReselectAncestor(mismatch)}
                  >
                    Reselect the compatible ancestry
                  </Button>
                  <Button
                    variant="secondary" className="anim-btn"
                    busy={busy}
                    disabled={busy || rebindTarget === null}
                    data-anim-mismatch-rebind
                    title={ancestorSlot === null
                      ? 'The frozen source is not a member of this chain — extend that chain instead'
                      : rebindTarget === null
                        ? 'The ancestor window selects nothing yet — select one of its takes first'
                        : 'Explicitly rebind this window to the ancestor\'s CURRENT selection — the next submission into it freezes that source (a distinct document mutation with its own revision bump)'}
                    onClick={() => onRebindWindow(mismatch)}
                  >
                    Rebind to the current selection
                  </Button>
                </div>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

export function Timeline({ timeline, binding, selectedId, playhead, busy, chains, selectedWindowId, onSelectKey, onSelectSpan, onToggleLock, onSeedInitialKey, onSelectWindow, onReselectAncestor, onRebindWindow }: TimelineProps) {
  if (timeline.keys.length === 0) {
    return (
      <div className="anim-timeline" data-anim-timeline>
        <SeedCard binding={binding} busy={busy} onSeed={onSeedInitialKey} />
      </div>
    )
  }

  // Grid geometry: one track per key (odd columns) and one per gap (even);
  // rows are the playhead ruler (1), the nesting lanes (2…), then the keys.
  // Placement is inline because the counts are dynamic; the lane for nesting
  // n sits directly above the keys when n is 0 and stacks upward from there.
  const keyIndex = new Map(timeline.keys.map((key, index) => [key.id, index] as const))
  const maxNesting = timeline.spans.reduce((max, span) => Math.max(max, span.nesting), 0)
  const lanes = maxNesting + 1
  const keysRow = lanes + 2
  const selectedSpan = selectedId === null ? null : timeline.spans.find((span) => span.id === selectedId) ?? null

  const spanPlacement = (span: TimelineModel['spans'][number]): { column: string; row: number } | null => {
    const from = keyIndex.get(span.fromKeyId)
    const to = keyIndex.get(span.toKeyId)
    if (from === undefined || to === undefined) return null
    const lo = Math.min(from, to)
    const hi = Math.max(from, to)
    // A span's bar covers the gaps between its endpoint keys; a degenerate
    // self-span (same key both ends) renders in the gap beside the key.
    const column = hi === lo ? String(2 * lo + 2) : `${2 * lo + 2} / ${2 * hi + 1}`
    return { column, row: maxNesting - span.nesting + 2 }
  }

  let playheadColumn: string | null = null
  if (playhead !== null) {
    if (playhead.kind === 'key') {
      const index = keyIndex.get(playhead.id)
      playheadColumn = index === undefined ? null : String(2 * index + 1)
    } else {
      const span = timeline.spans.find((entry) => entry.id === playhead.id)
      const placement = span === undefined ? null : spanPlacement(span)
      if (placement !== null) playheadColumn = placement.column
    }
  }

  return (
    <div className="anim-timeline" data-anim-timeline>
      <div
        className="anim-track"
        data-anim-track
        role="group"
        aria-label="The key timeline"
        style={{ gridTemplateRows: `repeat(${lanes + 2}, auto)`, gridTemplateColumns: `repeat(${timeline.keys.length * 2 - 1}, auto)` }}
      >
        {playhead !== null && playheadColumn !== null && (
          <div
            className="anim-playhead"
            data-anim-playhead
            data-anim-playhead-kind={playhead.kind}
            data-anim-playhead-at={playhead.id}
            style={{ gridColumn: playheadColumn, gridRow: '1' }}
            title="The review position — the newest attempt's target"
          />
        )}
        {timeline.spans.map((span) => {
          const placement = spanPlacement(span)
          if (placement === null) return null
          return (
            <div
              key={span.id}
              className="anim-span"
              data-anim-span={span.id}
              data-anim-span-from={span.fromKeyId}
              data-anim-span-to={span.toKeyId}
              data-anim-span-nesting={span.nesting}
              data-anim-span-stale={span.stale ? 'true' : 'false'}
              data-anim-selected={selectedId === span.id ? 'true' : 'false'}
              role="button"
              tabIndex={0}
              aria-label={`Span from key ${span.fromOrder} to key ${span.toOrder}`}
              style={{ gridColumn: placement.column, gridRow: String(placement.row) }}
              onClick={() => onSelectSpan(span.id)}
              onKeyDown={selectOnKey(() => onSelectSpan(span.id))}
            >
              <span className="anim-span-label">{span.intent.movement !== '' ? span.intent.movement : 'unauthored span'}</span>
              <span className="anim-span-steps">
                {span.stepSlots.map((slot, stepIndex) => (
                  <span key={slot.id} className="anim-step-slot" data-anim-step-slot={slot.id} data-anim-step-index={stepIndex}>
                    step {stepIndex + 1}{slot.attempts.length > 0 ? ` · ${slot.attempts.length}` : ''}
                  </span>
                ))}
              </span>
              {span.stale && <span className="anim-span-stale-note">stale ({span.staleReasons.join(', ') || 'dependencies changed'})</span>}
            </div>
          )
        })}
        {timeline.keys.map((key, index) => {
          const isSelected = selectedId === key.id
            || (selectedSpan !== null && (selectedSpan.fromKeyId === key.id || selectedSpan.toKeyId === key.id))
          return (
            <article
              key={key.id}
              className="anim-key"
              data-anim-key={key.id}
              data-anim-key-order={key.order}
              data-anim-selected={isSelected ? 'true' : 'false'}
              role="button"
              tabIndex={0}
              aria-label={`Key ${key.order}${key.badge !== null ? ` (${key.badge})` : ''}`}
              style={{ gridColumn: String(2 * index + 1), gridRow: String(keysRow) }}
              onClick={() => onSelectKey(key.id)}
              onKeyDown={selectOnKey(() => onSelectKey(key.id))}
            >
              {/* Keyed by candidate id so a selection swap resets the preview's
                  failed-load state honestly for the new image. */}
              <KeyImage key={key.candidate?.id ?? 'empty'} candidate={key.candidate} />
              <div className="anim-key-meta">
                <Chip
                  variant="toggle"
                  selected={key.lock}
                  disabled={busy}
                  className="anim-chip"
                  data-anim-key-lock
                  title={key.lock ? 'Locked — the server refuses selection changes until it is unlocked' : 'Unlocked'}
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleLock(key.id, !key.lock)
                  }}
                >
                  {key.lock ? <Lock size={11} /> : <LockOpen size={11} />}
                  {key.lock ? 'locked' : 'unlocked'}
                </Chip>
                {key.badge !== null && <span className="anim-key-badge" data-anim-key-badge={key.badge}>{key.badge}</span>}
                <span className="anim-key-order">#{key.order}</span>
              </div>
            </article>
          )
        })}
      </div>
      {/* The extension chains' surface (§4, Task 6) — under the track: the
          chains root at this timeline's takes, their windows are new time
          beyond the spans. */}
      <ChainBand surface={chains ?? { chains: [] }} selectedWindowId={selectedWindowId} busy={busy} onSelectWindow={onSelectWindow} onReselectAncestor={onReselectAncestor} onRebindWindow={onRebindWindow} />
    </div>
  )
}
