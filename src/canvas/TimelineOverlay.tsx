/**
 * Canvas Phase 5b — the timeline projection (§6, the Director Suite): the
 * chronological projection of chain outputs, summoned by V (the flip family's
 * second member) or the titlebar button. NOT a permanent panel — a summonable
 * surface exactly like the library projection.
 *
 * Two regimes, one projection:
 *  - WITH a plan document (canvas_plan): the plan's segments in order, each
 *    carrying its chain's facts (planned vs rendered duration, the F7 status
 *    ladder — projections inherit the contracts), the plan editor beneath
 *    (brief + segments + per-segment reference handoffs), and the MEASURED
 *    gap menu between segments (hard cut / NLE / FLF splice / dip-to-black /
 *    diegetic bridge — verdicts from docs/research/h3-transitions, honest
 *    about assembly vs post vs in-model; only the FLF splice executes today,
 *    the render variants are labeled engine work, queued).
 *  - WITHOUT a plan: the project's chain outputs in creation order (the
 *    honest unplanned chronology; gaps implicit hard cuts) + the
 *    adopt-chronology upgrade ("Plan this chronology").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Film, Image as ImageIcon, LayoutList, Link2, Music2, Plus, Scissors, X } from 'lucide-react'
import { documentsApi } from './api'
import { STATUS_LABEL } from './derive'
import { deriveTimeline, GAP_LABEL, GAP_MECHANISM_LABEL, GAP_MENU, readPlanDocument, type PlanGapKind, type TimelineGapView } from './plan'
import { TIMELINE_TONE } from '../ui/statusToken'
import { Chip, ChipGroup } from '../ui/Chip'
import { arrowRowTarget, isTypingTarget } from '../ui/overlayBehavior'
import { StudioSelect } from '../ui/StudioSelect'
import { useOverlayBehavior } from '../ui/useOverlayBehavior'
import { useCanvasStore } from './store'
import { useJobsStore } from '../state/jobsStore'
import { useWindowedList } from './useWindowedList'

/** Draft-state binding for one plan-editor field (cleanup wave twmpu4m).
 *  The fields were uncontrolled (defaultValue): typing never fought the
 *  store, but a remount after any document reload painted whatever the
 *  store held at mount time and the field NEVER caught up — the judged
 *  timeline-gap-menu defect (prompt textareas empty while the persisted
 *  document was correct). The draft keeps typing local, commits on blur,
 *  and repaints from the store whenever the user is not mid-edit, so the
 *  DOM can never diverge from the persisted truth. */
function useDraftField(value: string) {
  const [draft, setDraft] = useState<string | null>(null)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    // A store refresh landed: adopt it as the new baseline; an in-flight
    // draft (user typing) keeps rendering until it settles.
    setSeen(value)
    if (draft === value) setDraft(null)
  }
  return {
    fieldValue: draft ?? value,
    commit: (next: string) => { setDraft(next) },
    settled: (): string => {
      const typed = draft ?? value
      setDraft(null)
      return typed
    },
  }
}

function PlanBriefField({ planRowId, brief }: { planRowId: string; brief: string }) {
  const field = useDraftField(brief)
  const updatePlanDocument = useCanvasStore((state) => state.updatePlanDocument)
  return <textarea data-canvas-plan-brief value={field.fieldValue} placeholder="The film this plan produces — story, rules, intent…" onChange={(event) => field.commit(event.target.value)} onBlur={() => { const next = field.settled(); if (next !== brief) void updatePlanDocument(planRowId, (current) => ({ ...current, brief: next })) }} />
}

function SegmentTitleField({ planRowId, segmentId, title }: { planRowId: string; segmentId: string; title: string }) {
  const field = useDraftField(title)
  const updatePlanSegment = useCanvasStore((state) => state.updatePlanSegment)
  return <input data-canvas-segment-title aria-label="Segment title" value={field.fieldValue} onChange={(event) => field.commit(event.target.value)} onBlur={() => { const next = field.settled(); if (next !== title) void updatePlanSegment(planRowId, segmentId, { title: next }) }} />
}

function SegmentDurationField({ planRowId, segmentId, duration }: { planRowId: string; segmentId: string; duration: number }) {
  const field = useDraftField(String(duration))
  const updatePlanSegment = useCanvasStore((state) => state.updatePlanSegment)
  return <label className="canvas-plan-segment-duration">seconds<input data-canvas-segment-duration type="number" min={2} max={15} value={field.fieldValue} onChange={(event) => field.commit(event.target.value)} onBlur={() => { const typed = field.settled(); const next = Math.max(2, Math.min(15, Number(typed) || duration)); if (String(next) !== String(duration)) void updatePlanSegment(planRowId, segmentId, { duration: next }) }} /></label>
}

function SegmentPromptField({ planRowId, segmentId, prompt }: { planRowId: string; segmentId: string; prompt: string }) {
  const field = useDraftField(prompt)
  const updatePlanSegment = useCanvasStore((state) => state.updatePlanSegment)
  return <textarea data-canvas-segment-prompt value={field.fieldValue} placeholder="This segment's prompt — subject, action, camera, light…" onChange={(event) => field.commit(event.target.value)} onBlur={() => { const next = field.settled(); if (next !== prompt) void updatePlanSegment(planRowId, segmentId, { prompt: next }) }} />
}

// The strip's tone ladder lives in statusToken's TIMELINE_TONE adapter
// (task 4): it intentionally diverges from the tile ring's map on
// idle/queued-gpu/running (accent for the plan's own committed + active
// segments) — each difference is a row in statusToken's divergence table.
// (The old hand map also carried a dead #e5484d fallback on --danger —
// gone with the map; the token is :root-defined and asserted by the
// statusToken suite.)

function KindIcon({ kind }: { kind: 'video' | 'image' | 'audio' | null }) {
  if (kind === 'audio') return <Music2 size={13} />
  if (kind === 'image') return <ImageIcon size={13} />
  if (kind === 'video') return <Film size={13} />
  return <Scissors size={13} />
}

/** The measured gap menu (§6) — a NESTED surface since task 14: registered
 *  with the layer registry ABOVE the timeline while open, one Escape closes
 *  only the menu and the projection survives the press. Deliberately NOT a
 *  task-16 PopoverMenu consumer: the menu is positioned and stacked INSIDE
 *  the projection panel (absolute, z 5 under the panel's own layer) — the
 *  shared component's body-level portal would re-anchor it to the viewport
 *  and paint it under the panel. The stale-gapMenu flag cleanup rides the
 *  overlay (the effect below).
 *
 * (Codex S02, near-term C, k2q0n9s) The menu's KEYBOARD MODEL — roles were
 * never the whole contract: on open, focus ENTERS on the current option
 * (first enabled when nothing is checked); ArrowUp/ArrowDown/Home/End walk
 * the ENABLED options with wrap over the pure arrowRowTarget (the task-16
 * PopoverMenu idiom — disabled engine-work rows are skipped, they cannot
 * hold focus); options are controlled tab stops (tabIndex -1 — menu items
 * live on arrows, not Tab; the overlay's Tab containment owns the cycle);
 * Enter/Space activate the focused option natively and the exclusive
 * checked state follows through the activation. */
function TimelineGapMenu({ gap, footer, onChoose, onClose }: {
  gap: TimelineGapView
  footer: string
  onChoose(kind: PlanGapKind): void
  onClose(): void
}) {
  const { ref: registerPanel, onKeyDown: overlayKeyDown } = useOverlayBehavior({ id: 'canvas-gap-menu', onDismiss: onClose })
  // The panel node for the focus-entry effect, composed with the hook's
  // registration ref (both must ride the SAME element; the hook's ref keeps
  // its stable identity, so the composed callback does too).
  const panelRef = useRef<HTMLDivElement | null>(null)
  const setPanel = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node
    registerPanel(node)
  }, [registerPanel])
  // Focus ENTRY (the hook's focusOnOpen would land on the panel itself —
  // no entry field here): the CURRENT option first, the first enabled one
  // otherwise. Runs on mount (the panel's mount IS the open lifetime).
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const options = Array.from(panel.querySelectorAll<HTMLElement>('[data-canvas-gap-option]:not([disabled])'))
    const current = options.find((option) => option.getAttribute('aria-checked') === 'true') ?? options[0]
    current?.focus()
  }, [])
  return <div className="canvas-gap-menu" data-canvas-gap-menu role="menu" aria-label="Transition" ref={setPanel} onKeyDown={(event) => {
    overlayKeyDown(event)
    // The menu's own arrows (local; the pure walk from overlayBehavior —
    // the PopoverMenu idiom; Escape stays the registry's, never navigation).
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-canvas-gap-option]:not([disabled])'))
    const target = arrowRowTarget(options.length, options.indexOf(document.activeElement as HTMLElement), event.key)
    if (target !== null) {
      event.preventDefault()
      options[target].focus()
    }
  }}>
    <header>
      <strong>Transition</strong>
      <span>{GAP_LABEL[gap.kind]} · choose the measured path</span>
      <button type="button" className="icon-button" aria-label="Close transition menu" data-canvas-gap-close onClick={onClose}><X size={12} /></button>
    </header>
    {GAP_MENU.map((entry) => {
      const flfBlocked = entry.kind === 'flf' && !gap.flfReady
      const disabled = entry.engineDependent || flfBlocked
      const reason = entry.engineDependent
        ? 'needs bridge-render machinery — engine work, queued (the choice is recorded; the render lands with it)'
        : flfBlocked
          ? 'render the LEFT segment first — the splice wires from its final rendered frame'
          : null
      // (near-term C, k2q0n9s — §0.3 long-tail) The options are the MENU's
      // own selection shape: menuitemradio + aria-checked (chipAria's
      // checked state with the menu-native role overriding role=radio).
      // This is the migration's ONE documented ChipGroup outlier — a
      // radiogroup cannot nest inside role=menu (menus own menuitem*
      // descendants), so the selection contract's keyboard half rides the
      // menu's OWN model above (focus entry + the arrow walk + controlled
      // tab stops); the class composition rides the kit's Chip (one
      // authority). tabIndex -1 = the controlled menu-item tab stop.
      return <Chip
        key={entry.kind}
        tabIndex={-1}
        variant="radio"
        role="menuitemradio"
        selected={gap.kind === entry.kind}
        className="canvas-gap-option"
        data-canvas-gap-option={entry.kind}
        disabled={disabled}
        title={reason ?? entry.verdict}
        onClick={() => onChoose(entry.kind)}
      >
        <span className="canvas-gap-option-head">
          <strong>{entry.label}</strong>
          <span className="canvas-gap-option-mechanism" data-canvas-gap-mechanism={entry.mechanism}>{GAP_MECHANISM_LABEL[entry.mechanism]}</span>
          {gap.kind === entry.kind && <span className="canvas-gap-option-current">current</span>}
        </span>
        <span className="canvas-gap-option-verdict" data-canvas-gap-verdict>{entry.verdict}</span>
        {reason && <span className="canvas-gap-option-reason">{reason}</span>}
      </Chip>
    })}
    <footer>{footer} — verdicts: tranche-1 measurements</footer>
  </div>
}

export function TimelineOverlay() {
  const open = useCanvasStore((state) => state.timelineOpen)
  const timelinePlanId = useCanvasStore((state) => state.timelinePlanId)
  const documents = useCanvasStore((state) => state.documents)
  const activeProjectId = useCanvasStore((state) => state.activeProjectId)
  const libraries = useCanvasStore((state) => state.libraries)
  const chainJobs = useCanvasStore((state) => state.chainJobs)
  const dismissedFailures = useCanvasStore((state) => state.dismissedFailures)
  const gapMenu = useCanvasStore((state) => state.gapMenu)
  const jobs = useJobsStore((state) => state.jobs)

  const document = activeProjectId ? documents[activeProjectId] ?? null : null
  const plans = useMemo(() => document?.plans ?? [], [document])
  const planRow = useMemo(
    () => plans.find((plan) => plan.id === timelinePlanId) ?? plans[0] ?? null,
    [plans, timelinePlanId],
  )
  const projection = useMemo(() => document
    ? deriveTimeline({
      document,
      plan: planRow ? { id: planRow.id, document: planRow.document } : null,
      jobs,
      links: chainJobs,
      dismissed: new Set(dismissedFailures),
    })
    : { planId: null, items: [], gaps: [], plannedDuration: 0, renderedDuration: 0 }, [document, planRow, jobs, chainJobs, dismissedFailures])
  const plan = planRow ? readPlanDocument(planRow.document) : null
  const store = useCanvasStore.getState

  // Perf wave 1: windowed mounting for the strip (profile rec 2) — 300
  // cards (most carrying a <video preload="metadata">) in one commit cost a
  // 453 ms open with a 229 ms long task; only the horizontal scroll window
  // (+overscan) mounts now. Slot pitch is measured at runtime from the
  // mounted cells, so the CSS card/gap widths stay the single source of
  // truth. The plan editor below is untouched — plans are hand-authored,
  // not density-seeded.
  const stripWindow = useWindowedList({ count: projection.items.length, axis: 'x' })
  // Task 14 (§0.2): the projection joins the layer registry — Escape routes
  // topmost-only (the window-cascade branch died with it), focus settles
  // into the panel, and the background chain suspends while it holds the
  // keyboard. V stays the family's own flip through the panel's local key.
  const overlay = useOverlayBehavior({ id: 'canvas-timeline', onDismiss: () => useCanvasStore.getState().setTimelineOpen(false) })
  const { focusOnOpen } = overlay

  useEffect(() => {
    if (open) focusOnOpen()
  }, [open, focusOnOpen])

  // The open gap, resolved BEFORE the early return (the stale-flag effect
  // below needs it while the panel is mounted).
  const openGap = projection.gaps.find((gap) => gap.afterSegmentId === gapMenu?.afterSegmentId)
  // The stale-gapMenu flag (task 14's ledger, cleaned at task 16): a gap
  // that no longer resolves (its segment left the plan while the menu flag
  // was set) must leave NO menu mounted and NO flag waiting — the store's
  // flag dies with the gap, so nothing resurrects a menu on a later derive.
  useEffect(() => {
    if (gapMenu && !openGap) store().setGapMenu(null)
  }, [gapMenu, openGap, store])

  if (!open) return null

  const close = () => store().setTimelineOpen(false)
  const navigate = (chainId: string) => {
    store().select(chainId)
    store().requestCamera({ kind: 'fly', tileId: chainId })
    close()
  }
  const seedSegment = async (segmentId: string) => {
    if (!planRow) return
    const chainId = await store().seedSegmentChain(planRow.id, segmentId)
    if (chainId) store().toast('success', 'Segment seeded as a canvas object — review and generate from its panel or the row below. Nothing auto-executes.')
  }
  const generateSegment = async (segmentId: string) => {
    if (!planRow) return
    // The submit ladder's early refusals (settings loading, no object) do
    // not notify inside the core — surface them here; the rarer
    // engine-ladder refusal may double-toast, which is cosmetic.
    const result = await store().submitSegment(planRow.id, segmentId)
    if (!result.ok && result.message) store().toast('error', result.message)
  }
  const openGapMenu = (afterSegmentId: string) => {
    if (!planRow) return
    store().setGapMenu({ planId: planRow.id, afterSegmentId })
  }
  const chooseGap = async (kind: PlanGapKind) => {
    if (!gapMenu) return
    await store().setPlanGap(gapMenu.planId, gapMenu.afterSegmentId, kind)
  }

  // The latent-episode trigger: the first FLF-connected run of ≥2 seeded
  // segments (the scene-chain successor).
  const episodeStart = plan ? plan.segments.findIndex((segment, index) => {
    if (!segment.chainId) return false
    const next = plan.segments[index + 1]
    return Boolean(next && next.chainId && plan.gaps.some((gap) => gap.afterSegmentId === segment.id && gap.kind === 'flf'))
  }) : -1

  const openGapRight = plan ? plan.segments.find((segment) => segment.id === gapMenu?.afterSegmentId) : undefined

  // V stays the flip family's own key while a projection is open (§0.2) —
  // the footers advertise the cycle; the panel's local handler owns it
  // because the hook's containment keeps it away from the background chain.
  // Never while the user types (the plan editor's fields own their keys).
  const flipProjection = (event: { key: string; target: unknown }) => {
    if (event.key === 'v' && !isTypingTarget(event.target)) store().cycleProjection()
  }

  return <div className="canvas-index-overlay" data-canvas-timeline role="dialog" aria-label="Timeline" onClick={close}>
    <div
      className="canvas-timeline-panel"
      onClick={(event) => event.stopPropagation()}
      ref={overlay.ref}
      onKeyDown={(event) => { overlay.onKeyDown(event); flipProjection(event) }}
    >
      <header className="canvas-index-input canvas-timeline-header">
        <LayoutList size={15} />
        <strong className="canvas-timeline-title">{planRow ? `Timeline — plan (${plan ? plan.segments.length : 0} segments)` : 'Timeline — chain outputs (unplanned chronology)'}</strong>
        <span className="canvas-timeline-total">{projection.items.length} items · {Math.round(projection.plannedDuration)}s planned{projection.renderedDuration ? ` · ${Math.round(projection.renderedDuration)}s rendered` : ''}</span>
        {plans.length > 1 && <StudioSelect
          className="canvas-timeline-plan-select"
          aria-label="Plan"
          value={planRow?.id ?? ''}
          onChange={(event) => useCanvasStore.setState({ timelinePlanId: event.target.value })}
        >
          {plans.map((entry, index) => <option key={entry.id} value={entry.id}>Plan {index + 1} — {readPlanDocument(entry.document).segments.length} segments</option>)}
        </StudioSelect>}
        {!planRow && document && document.chains.some((chain) => chain.outputs.some((output) => output.takes.length)) && (
          <button type="button" className="chip canvas-chip" data-canvas-timeline-adopt onClick={() => void store().adoptChronology()}>Plan this chronology</button>
        )}
        <button type="button" className="chip canvas-chip" data-canvas-timeline-new-plan onClick={() => void store().createPlan()}><Plus size={12} /> New plan</button>
        <button type="button" className="icon-button" aria-label="Close timeline" data-canvas-timeline-close onClick={close}><X size={14} /></button>
      </header>

      {/* The strip: items + the measured gaps between them (window-mounted —
          see stripWindow above). */}
      <div className="canvas-timeline-strip" data-canvas-timeline-strip ref={stripWindow.containerRef} onScroll={stripWindow.onScroll}>
        {stripWindow.range.padStartPx > 0 && <div aria-hidden="true" style={{ width: stripWindow.range.padStartPx, flex: '0 0 auto' }} />}
        <div style={{ display: 'contents' }} ref={stripWindow.itemsRef}>
          {projection.items.slice(stripWindow.range.start, stripWindow.range.end).map((item) => {
            const gap = projection.gaps.find((entry) => entry.afterSegmentId === item.segmentId)
            return <div className="canvas-timeline-slot" key={item.segmentId}>
              <button type="button" className="canvas-timeline-item" data-canvas-timeline-item={item.segmentId} onClick={() => item.chainId && navigate(item.chainId)} disabled={!item.chainId}>
                {item.artifactPath && item.mediaKind === 'image' && <img className="canvas-timeline-poster" src={documentsApi.blobFileUrl(item.artifactPath)} alt="" />}
                {item.artifactPath && item.mediaKind === 'video' && <video className="canvas-timeline-poster" src={documentsApi.blobFileUrl(item.artifactPath)} muted preload="metadata" />}
                {!item.artifactPath && item.previewPath && <video className="canvas-timeline-poster" src={item.previewPath} muted preload="metadata" />}
                {!item.artifactPath && !item.previewPath && <span className="canvas-timeline-poster empty"><KindIcon kind={item.mediaKind} /></span>}
                <span className="canvas-timeline-item-title">{item.title}</span>
                <span className="canvas-timeline-item-meta">
                  <i style={{ background: `var(${TIMELINE_TONE[item.status].fg})` }} data-canvas-timeline-item-status={item.status} />
                  {item.status === 'unseeded' ? 'no object' : STATUS_LABEL[item.status]}
                  {' · '}{item.plannedDuration}s{item.renderedDuration != null ? ` · rendered ${Math.round(item.renderedDuration)}s` : ''}
                </span>
              </button>
              {gap && (planRow
                ? <button type="button" className={`canvas-timeline-gap kind-${gap.kind}`} data-canvas-gap={gap.afterSegmentId} onClick={() => openGapMenu(gap.afterSegmentId)} title={`${GAP_LABEL[gap.kind]} — click to change the transition`}>
                    <span className="canvas-timeline-gap-kind">{GAP_LABEL[gap.kind]}</span>
                    <span className="canvas-timeline-gap-mechanism">{GAP_MECHANISM_LABEL[GAP_MENU.find((entry) => entry.kind === gap.kind)?.mechanism ?? 'assembly']}</span>
                  </button>
                : <span className="canvas-timeline-gap implicit" data-canvas-gap={gap.afterSegmentId}><span className="canvas-timeline-gap-kind">Hard cut</span><span className="canvas-timeline-gap-mechanism">implicit</span></span>)}
            </div>
          })}
        </div>
        {stripWindow.range.padEndPx > 0 && <div aria-hidden="true" style={{ width: stripWindow.range.padEndPx, flex: '0 0 auto' }} />}
        {!projection.items.length && <div className="canvas-timeline-empty" data-canvas-timeline-empty>
          {planRow ? 'No segments yet — add the first below.' : 'Chain outputs appear here in creation order — drop or generate media, then plan the chronology.'}
        </div>}
      </div>

      {/* The measured gap menu (§6): five entries, verdicts from the
          transitions research, honest mechanism labels — a registered
          NESTED layer (task 14): one Escape closes only the menu. */}
      {gapMenu && openGap && (
        <TimelineGapMenu
          gap={openGap}
          footer={openGapRight ? `between “${projection.items.find((item) => item.segmentId === openGap.afterSegmentId)?.title ?? ''}” and the next segment` : ''}
          onChoose={(kind) => void chooseGap(kind)}
          onClose={() => store().setGapMenu(null)}
        />
      )}

      {/* The plan editor (the MoviePlanner inheritance, on the document store). */}
      {planRow && plan && <div className="canvas-timeline-editor" data-canvas-plan-editor>
        <label className="canvas-timeline-brief">
          <span>Brief</span>
          <PlanBriefField planRowId={planRow.id} brief={plan.brief} />
        </label>
        <div className="canvas-plan-segments" data-canvas-plan-segments>
          {plan.segments.map((segment, index) => {
            const item = projection.items.find((entry) => entry.segmentId === segment.id)
            return <div className="canvas-plan-segment" data-canvas-segment={segment.id} key={segment.id}>
              <div className="canvas-plan-segment-head">
                <span className="canvas-plan-segment-index">{index + 1}</span>
                <SegmentTitleField planRowId={planRow.id} segmentId={segment.id} title={segment.title} />
                <SegmentDurationField planRowId={planRow.id} segmentId={segment.id} duration={segment.duration} />
                {segment.chainId
                  ? <span className="canvas-plan-segment-state" data-canvas-segment-state={item?.status ?? 'idle'}>{item && item.status !== 'unseeded' ? STATUS_LABEL[item.status] : 'idle'}</span>
                  : <span className="canvas-plan-segment-state muted">no object</span>}
              </div>
              <SegmentPromptField planRowId={planRow.id} segmentId={segment.id} prompt={segment.prompt} />
              {/* (near-term C, k2q0n9s — §0.3 long-tail) The reference chips
                  are GENUINE multi-toggles — pressed buttons (aria-pressed)
                  in a labeled group, never aria-checked (the r3 correction's
                  toggle/radio split); the container's previously dead
                  aria-label on a roleless div is now a real group name. */}
              <ChipGroup className="canvas-plan-segment-refs" aria-label="Reference handoffs">
                {libraries.characters.map((character) => (
                  <Chip key={character.id} variant="toggle" selected={segment.referenceCharacterIds.includes(character.id)} className="canvas-chip canvas-plan-ref" data-canvas-segment-ref-character={character.id}
                    onClick={() => void store().updatePlanSegment(planRow.id, segment.id, { referenceCharacterIds: segment.referenceCharacterIds.includes(character.id) ? segment.referenceCharacterIds.filter((id) => id !== character.id) : [...segment.referenceCharacterIds, character.id] })}>{character.name}</Chip>
                ))}
                {libraries.locations.map((location) => (
                  <Chip key={location.id} variant="toggle" selected={segment.referenceLocationIds.includes(location.id)} className="canvas-chip canvas-plan-ref" data-canvas-segment-ref-location={location.id}
                    onClick={() => void store().updatePlanSegment(planRow.id, segment.id, { referenceLocationIds: segment.referenceLocationIds.includes(location.id) ? segment.referenceLocationIds.filter((id) => id !== location.id) : [...segment.referenceLocationIds, location.id] })}>{location.name}</Chip>
                ))}
              </ChipGroup>
              <div className="canvas-plan-segment-actions">
                {!segment.chainId && <button type="button" className="chip canvas-chip" data-canvas-segment-seed disabled={!segment.prompt.trim()} onClick={() => void seedSegment(segment.id)}>Seed object</button>}
                {segment.chainId && <button type="button" className="chip canvas-chip" data-canvas-segment-generate onClick={() => void generateSegment(segment.id)}>Generate</button>}
                <button type="button" className="chip canvas-chip" data-canvas-segment-remove onClick={() => void store().removePlanSegment(planRow.id, segment.id)}>Remove</button>
              </div>
            </div>
          })}
          <div className="canvas-plan-segment-toolbar">
            <button type="button" className="chip canvas-chip" data-canvas-plan-add-segment onClick={() => void store().addPlanSegment(planRow.id)}><Plus size={12} /> Add segment</button>
            <button type="button" className="chip canvas-chip" data-canvas-plan-episode disabled={episodeStart < 0} title={episodeStart < 0 ? 'Needs two seeded segments joined by an FLF gap' : 'Render the FLF-connected run as ONE latent-chained episode (Motion-Context); every take lands on its own object'}
              onClick={() => void store().submitPlanEpisode(planRow.id, plan.segments[episodeStart].id)}><Link2 size={12} /> Render FLF run as latent chain</button>
          </div>
        </div>
      </div>}
      {!planRow && <footer className="canvas-timeline-footer"><span>V cycles · timeline → library → canvas</span><span>projections inherit the no-silent-failure contract</span></footer>}
      {planRow && <footer className="canvas-timeline-footer"><span>V cycles · timeline → library → canvas</span><span>transitions are measured choices — FLF executes; the bridge renders are labeled engine work</span></footer>}
    </div>
  </div>
}
