/**
 * AnimationApp — the animation module's shell (task 6, k2q0n9s, spec
 * 2026-10-06-animation-authoring-module-design.md §11.1 the route decision):
 * a Workbench SUBVIEW at /?images=1&view=animation&project=<id>&document=<id>,
 * lazy-loaded by the Workbench host branch — NOT a registry entry (the
 * images id and its bookmarks stay; the registry is untouched).
 *
 * Since task 7 the shell is PRESENTATIONAL (P07): every connection — the
 * durable recovery read, the fabric subscription, the command surface —
 * lives in ./state.ts's `useAnimationDocument`; this file renders what the
 * adapter hands it:
 *   - the loading / recoverable-selection / error arms around the document
 *     read (§11.1: a named heading, the stale id named, the project's other
 *     animation documents as pick rows, a back-to-workbench link — never a
 *     crash, never a blank, never a silently created replacement);
 *   - an UNBOUND document renders the session binding panel (§4.1) in the
 *     workspace — the missing inputs inline, the rest of the shell standing;
 *   - a BOUND document renders the versioned binding summary (§4.2, the
 *     description VERBATIM) above the TIMELINE (task 8: keys as image cards
 *     with lock chips + origin badges, span bars with nested step slots, the
 *     playhead, the seed-initial-key affordance for an empty timeline), and
 *     since task 9 SELECTING A SPAN opens the SPAN INSPECTOR beneath it (§6.1
 *     — the hybrid authoring form with the client-compiled caption preview);
 *     since task 10 a span holding tween attempts opens the REVIEW PANEL
 *     beside it (§7.3's status vocabulary, the candidate clip, the proposed
 *     frame, EXPLICIT frame selection, the continue / re-roll actions) — and
 *     with NOTHING explicitly selected, the timeline's review position IS
 *     the selection (§7.4's restored session: returning to a landed attempt
 *     focuses the span awaiting review; completion never steals an explicit
 *     selection, it only fills the empty one); since task 11 SELECTING A KEY
 *     opens the HERO surfaces (§5.2) — the review of the hero takes that
 *     targeted it (the clip, the frame strip, the EXPLICIT acceptance that
 *     establishes the key, the far-reference span action) above the hero
 *     authoring panel that sources the NEXT generation from its selection;
 *     since task 12 the SEQUENCE surfaces join them (§5.2/§11.2) — the
 *     selected key is a WINDOW START: its window takes' review (§7.3
 *     vocabulary, the retained takes, the WINDOW CHIPS reaching older
 *     windows, the re-roll resubmitting the frozen window) above the
 *     authoring panel whose explicit END-KEY pick bounds the window
 *     (alignment + ordered action + preservation caption); since task 13
 *     the EDITORIAL surface (§9) stands under them all — the assembly
 *     layer: the landed clips that can contribute, the ordered contribution
 *     list (portion + hold + order), and the assembled-sequence preview;
 *   - the conflict rebase notice (a 409 is never silent) and the failed
 *     silent-refresh notice, both role=status; the selection state carries
 *     the "new animation document" creation arm (task 7's Minor-2).
 *
 * Wave 3 (the live review's #7): the stage is a SIDE-BY-SIDE creative loop
 * at wide viewports — a persistent TIMELINE BAND above [review/preview
 * pane | active inspector pane], the two panes scrolling independently so
 * the timeline and the tool's primary action stay reachable while
 * authoring; below the breakpoint the panes stack (the deliberate 1280x800
 * collapse). A selected KEY presents ONE chosen tool — the hero and
 * sequence panels never stack together; the switch is an explicit chip
 * choice, and the inactive lane stays mounted but hidden so a half-typed
 * draft survives the round trip. The editorial + export surfaces moved
 * behind the assembly disclosure at the stage's foot — reachable, no
 * longer permanently mounted in the loop.
 */
import { useEffect, useMemo, useState } from 'react'
import { Clapperboard, FilePlus2, LoaderCircle, RefreshCw } from 'lucide-react'
import { SurfaceSwitcher } from '../surfaces/SurfaceSwitcher'
import { Button } from '../ui/Button'
import { Chip, ChipGroup } from '../ui/Chip'
import { animationHref } from './client'
import type { ChainMismatch } from '../../shared/animation/types'
import { BindingPanel } from './BindingPanel'
import { KeyCandidates, type KeyImportDestination } from './KeyCandidates'
import { Timeline } from './Timeline'
import { SpanInspector } from './SpanInspector'
import { ReviewPanel } from './ReviewPanel'
import { ExtendPanel, WindowReview } from './ExtendPanel'
import { HeroPanel } from './HeroPanel'
import { HeroReview } from './HeroReview'
import { SequencePanel } from './SequencePanel'
import { SequenceReview } from './SequenceReview'
import { EditorialPanel } from './EditorialPanel'
import { ExportPanel } from './ExportPanel'
import { IN_FLIGHT } from './reviewStatus'
import { deriveAssembledSequence, deriveChainSurface, deriveContributableClips, deriveReviewPosition, deriveTimeline, type TimelineReviewPosition } from './timelineModel'
import { deriveHeroPreview, deriveTweenPreview, useAnimationDocument, type ExtensionOutcome } from './state'
import './animation.css'

export function AnimationApp() {
  // Read once per mount: a view or document switch is a full navigation
  // (the registry's own precedent), so the component remounts.
  const [params] = useState(() => {
    const search = new URLSearchParams(window.location.search)
    return { documentId: search.get('document') ?? '', projectId: search.get('project') ?? '' }
  })
  // The timeline's EXPLICIT selection (§6.1's inspector input): ONE id — a
  // key or a span. Ephemeral view state, so the shell owns it (P07's stores
  // rule is about connections, not local state — the binding panel's draft
  // is the same precedent); the shell remounts per navigation, so it never
  // leaks across documents.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The review panel's SUBJECT override — a take the reviewer explicitly
  // switched to (null = the newest attempt of the selected span wins). The
  // span id keys it so switching spans forgets the stale take.
  const [reviewTake, setReviewTake] = useState<{ spanId: string; attemptId: string } | null>(null)
  // The hero review's SUBJECT override — same doctrine, keyed by the target
  // key slot (task 11): switching keys forgets the stale take.
  const [heroTake, setHeroTake] = useState<{ keyId: string; attemptId: string } | null>(null)
  // The sequence review's SUBJECT override — same doctrine, keyed by the
  // window-start key slot (task 12).
  const [sequenceTake, setSequenceTake] = useState<{ keyId: string; attemptId: string } | null>(null)
  // The sequence review's WINDOW override (task 12's Important-1, fixed in
  // task 13): which of the start key's DISTINCT windows is under review —
  // null follows the newest take. Switching windows clears the take override
  // so the picked window's newest take becomes the subject.
  const [sequenceWindow, setSequenceWindow] = useState<{ keyId: string; windowEndKeyId: string } | null>(null)
  // T10-M4 (wave 2b): the "new take" markers the reviewer dismissed — the
  // chip is announce-only; its dismissal is view state (a reload returns to
  // the plain §7.4 truth). Selecting the take clears the marker naturally:
  // the subject then IS the newest, so no derivation below names it.
  const [dismissedNewTakes, setDismissedNewTakes] = useState<string[]>([])
  // Wave 2b (Fix 1): the bound session's explicit "Update character
  // binding" action opens the update-mode binding panel beneath the bound
  // header — discoverable in the bound state, not buried in a drawer.
  const [updateOpen, setUpdateOpen] = useState(false)
  // Wave 3 (the live review's #7): a selected key presents ONE tool. The
  // switch is an EXPLICIT choice — this override holds while the same key
  // stays selected; switching keys (or a reload) falls back to the derived
  // default below. Keyed by key id so a stale pick never leaks across keys.
  const [keyTool, setKeyTool] = useState<{ keyId: string; tool: 'hero' | 'sequence' } | null>(null)
  // The extension lane (Task 6): the chain window under review (a window
  // slot id — its own selection dimension; selecting a key or span clears
  // it and vice versa, exactly one review subject at a time).
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null)
  // The window review's SUBJECT override (the reviewer's explicit take),
  // keyed by window slot id so switching windows forgets the stale take.
  const [windowTake, setWindowTake] = useState<{ windowSlotId: string; attemptId: string } | null>(null)
  // The Extend flow's open source (the landed take whose carried tail the
  // next window conditions on) — opened by an Extend action, closed by the
  // submission's follow-to-window or the panel's Close.
  const [extendFor, setExtendFor] = useState<string | null>(null)
  // The stage's responsive mode. The 1440px literal MIRRORS the media query
  // in animation.css (.anim-stage-panes' two-column rule) — one breakpoint,
  // two homes, because a CSS media query cannot read a var and JS cannot
  // read the cascade. Change them together.
  const [stageMode, setStageMode] = useState<'wide' | 'stacked'>(() => (window.matchMedia('(min-width: 1440px)').matches ? 'wide' : 'stacked'))
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1440px)')
    const listener = (event: MediaQueryListEvent) => setStageMode(event.matches ? 'wide' : 'stacked')
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])
  const session = useAnimationDocument(params.documentId, params.projectId)
  const { phase, errorDetail, document, projectDocuments, assets, assetsFailed, conflict, busy, commandError, refreshFailed } = session

  const activeBinding = document
    ? (document.body.bindingHistory.find((entry) => entry.version === document.body.activeBindingVersion) ?? null)
    : null
  const timeline = useMemo(() => (document === null ? null : deriveTimeline(document.body)), [document])
  // The EXPLICIT review position (T10-M4): the selection, when it names a
  // live span or key. Nothing selected (or a stale id) ⇒ null ⇒ the pure
  // §7.4 rules resolve untouched — every pre-wave-2b behavior stands.
  const explicitPosition = useMemo<TimelineReviewPosition>(() => {
    if (timeline === null || selectedId === null) return null
    if (timeline.spans.some((span) => span.id === selectedId)) return { kind: 'span', id: selectedId }
    if (timeline.keys.some((key) => key.id === selectedId)) return { kind: 'key', id: selectedId }
    return null
  }, [timeline, selectedId])
  const playhead = useMemo(
    () => (document === null ? null : deriveReviewPosition(document.body, document.attempts, explicitPosition)),
    [document, explicitPosition],
  )
  // §7.4's restored session (task 10): with nothing explicitly selected, the
  // review position IS the selection — returning to a document with a
  // "Ready to review" (or running) attempt focuses exactly the span or key
  // awaiting the user. The fill PROMOTES to the explicit selection (one
  // setState), so it is sticky: the reviewer's surface never dissolves under
  // them when the decision that dissolved the playhead is their own click,
  // and a later explicit click still simply wins.
  useEffect(() => {
    if (selectedId === null && playhead !== null) setSelectedId(playhead.id)
  }, [selectedId, playhead])
  // The selected SPAN's inspector inputs (task 9): the timeline model's span
  // + endpoint keys, plus the live preview selector's resolution — all
  // re-derived from every fresh document read, so a rolling-reference change
  // elsewhere lands in the inspector through the fabric's refresh.
  const selectedSpan = useMemo(
    () => (timeline === null || selectedId === null ? null : timeline.spans.find((span) => span.id === selectedId) ?? null),
    [timeline, selectedId],
  )
  const spanInspector = useMemo(() => {
    if (document === null || selectedSpan === null || timeline === null) return null
    return {
      span: selectedSpan,
      preview: deriveTweenPreview(document, selectedSpan.id),
      fromKey: timeline.keys.find((key) => key.id === selectedSpan.fromKeyId) ?? null,
      toKey: timeline.keys.find((key) => key.id === selectedSpan.toKeyId) ?? null,
    }
  }, [document, selectedSpan, timeline])
  // The selected span's continuation truth (task 10, completed by task 15):
  // what the NEXT submission's near reference will resolve to — the server's
  // own backward walk over the slots before the target (the first slot WITH
  // a selection decides). A promoted frame resolves to its EXTRACTED image
  // at submit time (the frame-resolution seam), so the chain advances from
  // any landed step's reviewed frame.
  const reviewPanel = useMemo(() => {
    if (document === null || selectedSpan === null) return null
    // The span's tween attempts in landing order — the panel's subject is
    // the reviewer's explicit take, else the NEWEST (the freshest truth).
    const spanAttempts = document.attempts.filter((entry) => entry.tool === 'tween' && selectedSpan.stepSlots.some((slot) => slot.id === entry.targetId))
    if (spanAttempts.length === 0) return null
    const chosen = reviewTake !== null && reviewTake.spanId === selectedSpan.id
      ? spanAttempts.find((entry) => entry.attemptId === reviewTake.attemptId) ?? null
      : null
    const subject = chosen ?? spanAttempts[spanAttempts.length - 1]!
    const slotIndex = selectedSpan.stepSlots.findIndex((slot) => slot.id === subject.targetId)
    if (slotIndex < 0) return null
    const slot = selectedSpan.stepSlots[slotIndex]!
    // T10-M4: the newest take announced while the reviewer holds an older
    // one — a "new" chip on the strip, never an auto-switch (§8.2).
    const newest = spanAttempts[spanAttempts.length - 1]!
    const newTakeAttemptId = subject.attemptId !== newest.attemptId && !dismissedNewTakes.includes(newest.attemptId)
      ? newest.attemptId
      : null
    return { subject, stepIndex: slotIndex + 1, slotSelection: slot.selectedRollingReference, takes: slot.attempts.map((attemptId) => ({ attemptId })), newTakeAttemptId }
  }, [document, selectedSpan, reviewTake, dismissedNewTakes])
  // The selected KEY's hero surfaces (task 11, §5.2): the review of the hero
  // takes that targeted it (the newest, or the reviewer's explicit take) and
  // the authoring panel sourcing it as the current key of the NEXT
  // generation. A selection is ONE id, so this arm and the span arm are
  // mutually exclusive.
  const selectedKey = useMemo(
    () => (timeline === null || selectedId === null ? null : timeline.keys.find((key) => key.id === selectedId) ?? null),
    [timeline, selectedId],
  )
  const heroReview = useMemo(() => {
    if (document === null || selectedKey === null) return null
    const heroTakes = document.attempts.filter((entry) => entry.tool === 'hero' && entry.targetId === selectedKey.id)
    if (heroTakes.length === 0) return null
    const chosen = heroTake !== null && heroTake.keyId === selectedKey.id
      ? heroTakes.find((entry) => entry.attemptId === heroTake.attemptId) ?? null
      : null
    const subject = chosen ?? heroTakes[heroTakes.length - 1]!
    // T10-M4: the newest take announced while the reviewer holds an older
    // one — the same doctrine as the tween strip. Wave 3 (the 2b review's
    // M-1): the chip announces a LANDED take — this lane's strip reads
    // document.attempts, which holds the row from SUBMISSION
    // (queued/running), so the chip is gated on the newest take no longer
    // being in flight; its "landed" claim is never made while rendering.
    const newest = heroTakes[heroTakes.length - 1]!
    const newTakeAttemptId = subject.attemptId !== newest.attemptId && !IN_FLIGHT.has(newest.execution) && !dismissedNewTakes.includes(newest.attemptId)
      ? newest.attemptId
      : null
    return { subject, takes: heroTakes.map((entry) => ({ attemptId: entry.attemptId })), newTakeAttemptId }
  }, [document, selectedKey, heroTake, dismissedNewTakes])
  const inFlightHeroFromKey = useMemo(() => {
    if (document === null || selectedKey === null) return null
    return document.attempts.find((entry) => entry.tool === 'hero' && entry.sourceKeyId === selectedKey.id && IN_FLIGHT.has(entry.execution)) ?? null
  }, [document, selectedKey])
  const heroPanel = useMemo(() => {
    if (document === null || selectedKey === null) return null
    return { keyEntity: selectedKey, preview: deriveHeroPreview(document, selectedKey.id) }
  }, [document, selectedKey])
  // The selected KEY's sequence surfaces (task 12, §5.2/§11.2): the review of
  // the window takes that START from it (the newest, or the reviewer's
  // explicit take — grouped by the subject's frozen window, so one key's
  // several windows never mix strips) and beneath the hero surfaces the
  // authoring panel whose explicit pick is the window's END key.
  const sequenceReview = useMemo(() => {
    if (document === null || selectedKey === null || timeline === null) return null
    const windowTakes = document.attempts.filter((entry) => entry.tool === 'sequence' && entry.targetId === selectedKey.id)
    if (windowTakes.length === 0) return null
    // The window under review (task 12's Important-1, fixed in task 13): the
    // reviewer's explicit window pick, else the newest take's own window.
    const chosen = sequenceTake !== null && sequenceTake.keyId === selectedKey.id
      ? windowTakes.find((entry) => entry.attemptId === sequenceTake.attemptId) ?? null
      : null
    const activeEnd = sequenceWindow !== null && sequenceWindow.keyId === selectedKey.id
      ? sequenceWindow.windowEndKeyId
      : chosen?.windowEndKeyId ?? windowTakes[windowTakes.length - 1]!.windowEndKeyId
    // The subject: the reviewer's explicit take when it belongs to the active
    // window, else that window's NEWEST take — an older window's takes stay
    // reachable (the chips switch windows; the strip never mixes them).
    const ofWindow = windowTakes.filter((entry) => entry.windowEndKeyId === activeEnd)
    const subject = chosen !== null && chosen.windowEndKeyId === activeEnd
      ? chosen
      : ofWindow[ofWindow.length - 1] ?? windowTakes[windowTakes.length - 1]!
    // T10-M4: the window's newest take announced while the reviewer holds
    // an older one — the same doctrine as the other two strips, with the
    // same wave-3 landed gating (M-1): no "new" chip while the fresh take
    // is still rendering.
    const windowNewest = ofWindow[ofWindow.length - 1] ?? null
    const newTakeAttemptId = windowNewest !== null && subject.attemptId !== windowNewest.attemptId && !IN_FLIGHT.has(windowNewest.execution) && !dismissedNewTakes.includes(windowNewest.attemptId)
      ? windowNewest.attemptId
      : null
    const endKey = activeEnd === undefined
      ? null
      : timeline.keys.find((key) => key.id === activeEnd) ?? null
    return { subject, takes: ofWindow.map((entry) => ({ attemptId: entry.attemptId })), endKey, windowEndKeyId: activeEnd ?? null, newTakeAttemptId }
  }, [document, selectedKey, sequenceTake, sequenceWindow, timeline, dismissedNewTakes])
  // T10-M4: the chip's own dismissal (view state; selecting the take clears
  // the marker by making it the subject).
  const dismissNewTake = (attemptId: string) => {
    setDismissedNewTakes((current) => (current.includes(attemptId) ? current : [...current, attemptId]))
  }
  // The start key's DISTINCT windows, newest first — the review's chip group
  // (rendered only when more than one exists).
  const sequenceWindows = useMemo(() => {
    if (document === null || selectedKey === null || timeline === null) return []
    const windows: Array<{ windowEndKeyId: string; label: string }> = []
    for (let index = document.attempts.length - 1; index >= 0; index -= 1) {
      const entry = document.attempts[index]!
      if (entry.tool !== 'sequence' || entry.targetId !== selectedKey.id || entry.windowEndKeyId === undefined) continue
      if (windows.some((existing) => existing.windowEndKeyId === entry.windowEndKeyId)) continue
      const order = timeline.keys.find((key) => key.id === entry.windowEndKeyId)?.order
      windows.push({ windowEndKeyId: entry.windowEndKeyId, label: order === undefined ? 'window → vanished key' : `window → key #${order}` })
    }
    return windows
  }, [document, selectedKey, timeline])
  const inFlightSequenceFromKey = useMemo(() => {
    if (document === null || selectedKey === null) return []
    return document.attempts.filter((entry) => entry.tool === 'sequence' && entry.targetId === selectedKey.id && IN_FLIGHT.has(entry.execution))
  }, [document, selectedKey])
  // Wave 3: the key tool's DERIVED default — the newest take targeting this
  // key names its own lane (a key that just received a hero clip opens the
  // hero review; a window start with landed takes opens the sequence
  // review), else hero. The reviewer's explicit chip pick above overrides
  // it while the same key stays selected.
  const keyToolDefault = useMemo<'hero' | 'sequence'>(() => {
    if (document === null || selectedKey === null) return 'hero'
    for (let index = document.attempts.length - 1; index >= 0; index -= 1) {
      const entry = document.attempts[index]!
      if (entry.targetId !== selectedKey.id) continue
      if (entry.tool === 'hero' || entry.tool === 'sequence') return entry.tool
    }
    return 'hero'
  }, [document, selectedKey])
  const activeKeyTool = keyTool !== null && keyTool.keyId === selectedKey?.id ? keyTool.tool : keyToolDefault
  // The editorial surface (task 13, §9): the landed clips that can contribute
  // and what the ordered contribution list assembles to — both pure
  // derivations over the live document (timelineModel).
  const editorialClips = useMemo(
    () => (document === null ? [] : deriveContributableClips(document.body, document.attempts)),
    [document],
  )
  const assembledSequence = useMemo(
    () => (document === null ? null : deriveAssembledSequence(document.body, document.attempts)),
    [document],
  )
  // The extension lane's chain surface (§4, Task 6): the chains in body
  // order, each window's takes + selection truth, the DERIVED mismatch, the
  // assembled preview along the selected path. Pure (timelineModel).
  const chainSurface = useMemo(
    () => (document === null ? null : deriveChainSurface(document.body, document.attempts)),
    [document],
  )
  // The selected chain window (a window slot id), resolved against the
  // surface — null when the window left the document.
  const selectedWindowView = useMemo(() => {
    if (chainSurface === null || selectedWindowId === null) return null
    for (const chain of chainSurface.chains) {
      const index = chain.windows.findIndex((window) => window.slot.id === selectedWindowId)
      if (index >= 0) return { chain, window: chain.windows[index]!, index }
    }
    return null
  }, [chainSurface, selectedWindowId])
  // The window review's subject: the reviewer's explicit take, else the
  // window's NEWEST (the freshest truth); an EMPTY window (the refused or
  // interrupted submission's trailing hole) names itself honestly — the
  // Extend flow is its surface.
  const windowReview = useMemo(() => {
    if (document === null || selectedWindowView === null) return null
    const ids = selectedWindowView.window.slot.attempts
    if (ids.length === 0) {
      return { empty: true as const, slot: selectedWindowView.window.slot, index: selectedWindowView.index }
    }
    const chosen = windowTake !== null && windowTake.windowSlotId === selectedWindowView.window.slot.id
      ? document.attempts.find((entry) => entry.attemptId === windowTake.attemptId) ?? null
      : null
    const subject = chosen ?? document.attempts.find((entry) => entry.attemptId === ids[ids.length - 1]) ?? null
    if (subject === null) return null
    return { empty: false as const, subject, slot: selectedWindowView.window.slot, index: selectedWindowView.index, takes: ids.map((attemptId) => ({ attemptId })) }
  }, [document, selectedWindowView, windowTake])
  // The Extend flow's source row (null when the take left the document —
  // the panel then unmounts, its close already implied).
  const extendSource = useMemo(
    () => (document === null || extendFor === null ? null : document.attempts.find((entry) => entry.attemptId === extendFor) ?? null),
    [document, extendFor],
  )
  // The shell's Extend submission wrapper: the follow-to-window on success
  // (the review IS the landing's surface; the panel closes, the window's
  // review opens on the in-flight take — §7.3's during-the-wait contract).
  const submitExtension = async (draft: Parameters<typeof session.commands.extendTake>[1], idempotencyKey: string): Promise<ExtensionOutcome> => {
    if (extendFor === null) return { ok: false, submission: null }
    const outcome = await session.commands.extendTake(extendFor, draft, idempotencyKey)
    if (outcome.ok) {
      setExtendFor(null)
      setSelectedWindowId(outcome.windowSlotId)
      setWindowTake(null)
    }
    return outcome
  }
  const retryExtension = async (submission: Parameters<typeof session.commands.retryExtendSubmission>[0]) => {
    const outcome = await session.commands.retryExtendSubmission(submission)
    if (outcome !== null) {
      setExtendFor(null)
      setSelectedWindowId(outcome.windowSlotId)
      setWindowTake(null)
    }
    return outcome
  }
  // The mismatch banner's two explicit resolutions (§4): reselect the
  // compatible ancestry, or explicitly rebind to the ancestor's CURRENT
  // selection — both revision-gated commands through the adapter.
  const resolveMismatchByReselect = (mismatch: ChainMismatch) => {
    if (mismatch.ancestorSlotId === null) return
    void session.commands.selectWindowCandidate(mismatch.ancestorSlotId, mismatch.expectedSelection)
  }
  const resolveMismatchByRebind = (mismatch: ChainMismatch) => {
    if (mismatch.ancestorSlotId === null || document === null) return
    const ancestor = document.body.chains.flatMap((chain) => chain.windows).find((window) => window.id === mismatch.ancestorSlotId) ?? null
    const target = ancestor?.selectedCandidateId ?? null
    if (target === null) return
    void session.commands.rebindWindow(mismatch.windowSlotId, target)
  }

  if (phase === 'loading') {
    return (
      <div className="anim-root anim-boot" data-anim-root>
        <header className="anim-titlebar"><SurfaceSwitcher /><strong className="anim-brand"><Clapperboard size={14} /> Animation</strong></header>
        <div className="anim-boot-body"><LoaderCircle className="spin" /><span>Opening the animation document…</span></div>
      </div>
    )
  }

  if (phase === 'missing') {
    return (
      <div className="anim-root" data-anim-root>
        <header className="anim-titlebar"><SurfaceSwitcher /><strong className="anim-brand"><Clapperboard size={14} /> Animation</strong></header>
        <main className="anim-body">
          <section className="anim-select" data-anim-select aria-labelledby="anim-select-title">
            <h2 id="anim-select-title">Choose an animation document</h2>
            <p data-anim-select-reason>
              {params.documentId
                ? <>The document named in this address (<code>{params.documentId}</code>) does not exist — it may have been removed, or the address is stale.</>
                : 'This address names no animation document.'}
            </p>
            <a className="anim-back" href="/?images=1" data-anim-back>← Back to the image workbench</a>
            {/* The creation arm (task 7's Minor-2, task 8's scope): the only
                user-facing path to an EMPTY animation document — the workbench
                handoff requires a complete binding. One click creates the
                pre-binding document in this project and opens it. */}
            <div className="anim-select-actions">
              <Button
                variant="primary" className="anim-btn"
                busy={busy}
                disabled={busy || !params.projectId}
                icon={<FilePlus2 size={12} />}
                data-anim-new-document
                title={params.projectId ? 'Create a pre-binding animation document in this project and open it' : 'The address names no project — open animation through a project to create here'}
                onClick={() => void session.commands.createEmptyDocument(params.projectId)}
              >
                New animation document
              </Button>
              {!params.projectId && <p className="anim-note">The address names no project — creation needs one.</p>}
            </div>
            {commandError && <p className="anim-note anim-conflict" role="alert" data-anim-command-error>Creating the document failed: {commandError}</p>}
            {projectDocuments === 'failed' && <p className="anim-note" role="status">This project's animation documents could not be listed — the heading and the way back stand.</p>}
            {Array.isArray(projectDocuments) && projectDocuments.length === 0 && <p className="anim-note">No animation documents in this project yet.</p>}
            {Array.isArray(projectDocuments) && projectDocuments.length > 0 && (
              <ul className="anim-docs" data-anim-docs>
                {projectDocuments.map((row) => (
                  <li key={row.id}>
                    <a href={animationHref(params.projectId, row.id)} data-anim-pick-document={row.id}>{row.name}</a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="anim-root" data-anim-root>
        <header className="anim-titlebar"><SurfaceSwitcher /><strong className="anim-brand"><Clapperboard size={14} /> Animation</strong></header>
        <main className="anim-body">
          <section className="anim-select" data-anim-error aria-labelledby="anim-error-title">
            <h2 id="anim-error-title">This animation document could not be opened</h2>
            <p>{errorDetail} — retrying the read never replaces anything.</p>
            <Button variant="secondary" className="anim-btn" onClick={() => void session.commands.retry()} data-anim-retry>Retry the read</Button>
            <a className="anim-back" href="/?images=1" data-anim-back>← Back to the image workbench</a>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="anim-root" data-anim-root data-anim-document={document!.id} data-attempt-state={session.attemptState ?? undefined}>
      <header className="anim-titlebar">
        <SurfaceSwitcher />
        <strong className="anim-brand"><Clapperboard size={14} /> Animation</strong>
        <span className="anim-doc-name" data-anim-document-name>{document!.name}</span>
        <span className="anim-revision" data-anim-revision title="The authored revision — every write is checked against it">rev {document!.revision}</span>
        <a className="anim-back" href="/?images=1" data-anim-back>workbench</a>
      </header>
      <main className={activeBinding ? 'anim-body anim-body--stage' : 'anim-body'}>
        {refreshFailed && (
          <p className="anim-note" role="status" data-anim-refresh-failed>This document changed but the fresh read failed — the view may be stale until the next event or reload.</p>
        )}
        {conflict && (
          <p className="anim-note anim-conflict" role="status" data-anim-conflict>
            This document changed while a write was in flight (the server is now at revision {conflict.currentRevision}) — the fresh copy is loaded; submit again if the change is still wanted. {conflict.message}
          </p>
        )}
        {/* The bound timeline's own failure surface: the seed's named
            refusals and any non-409 command failure (network, 5xx) land
            here — never a silent no-op. Cleared by the next command. */}
        {commandError && (
          <p className="anim-note anim-conflict" role="alert" data-anim-command-error>The last command failed: {commandError}</p>
        )}
        {activeBinding ? (
          <>
            {/* The versioned binding summary (§4.2): the description is
                retained VERBATIM — editing the source character later never
                silently changes a bound session. Wave 2b (Fix 1): the bound
                state carries its explicit update action here — discoverable
                where the binding lives, not buried in a settings drawer. */}
            <section className="anim-bound" data-anim-bound-version data-anim-bound-version-n={activeBinding.version} aria-label="The bound session">
              <header>
                <strong>Bound — version {activeBinding.version}</strong>
                <span>{activeBinding.medium}</span>
                <span>{activeBinding.referenceAssetIds.length} {activeBinding.referenceAssetIds.length === 1 ? 'reference' : 'references'}</span>
                <span className="anim-bound-actions">
                  <Button
                    variant="secondary" className="anim-btn"
                    icon={<RefreshCw size={12} />}
                    busy={busy}
                    onClick={() => setUpdateOpen((open) => !open)}
                    data-anim-bound-update
                    title="Append the next binding version — new references or a session-copy description edit"
                  >
                    Update character binding
                  </Button>
                </span>
              </header>
              <p data-anim-bound-description>{activeBinding.characterDescription}</p>
            </section>
            {/* The update surface (Fix 1 + Fix 2, T7-M1): prefilled from the
                active binding, the description read-only until "Edit session
                copy" unlatches the labeled override, and the submit named
                for what it does — appending an immutable binding version
                (spans mark stale 'binding'; prior takes are preserved). */}
            {updateOpen && (
              <BindingPanel
                mode="update"
                document={document!}
                assets={assets}
                assetsFailed={assetsFailed}
                onImportFiles={session.commands.importImages}
                onSubmitBinding={async (binding) => {
                  const ok = await session.commands.updateBinding(binding)
                  if (ok) setUpdateOpen(false)
                  return ok
                }}
                onDismiss={() => setUpdateOpen(false)}
                busy={busy}
                errors={commandError ? { submit: commandError } : undefined}
              />
            )}
            {/* The stage (wave 3, the live review's #7): the timeline band
                PERSISTS above the two panes — the creative loop (see the
                motion → adjust the intent → generate) side by side at wide
                viewports, stacked below the breakpoint. The mode attribute is
                the DOM truth the layout pins read. */}
            <section className="anim-stage" data-anim-stage data-anim-stage-mode={stageMode}>
              <div className="anim-stage-timeline" data-anim-stage-timeline>
                <Timeline
                  timeline={timeline!}
                  binding={activeBinding}
                  selectedId={selectedId}
                  playhead={playhead}
                  busy={busy}
                  chains={chainSurface}
                  selectedWindowId={selectedWindowId}
                  onSelectKey={(keyId) => { setSelectedId(keyId); setSelectedWindowId(null) }}
                  onSelectSpan={(spanId) => { setSelectedId(spanId); setSelectedWindowId(null) }}
                  onToggleLock={(keyId, locked) => void session.commands.toggleKeyLock(keyId, locked)}
                  onSeedInitialKey={() => void session.commands.seedInitialKey()}
                  onSelectWindow={(windowSlotId) => { setSelectedWindowId(windowSlotId); setSelectedId(null); setExtendFor(null) }}
                  onReselectAncestor={resolveMismatchByReselect}
                  onRebindWindow={resolveMismatchByRebind}
                />
              </div>
              {(spanInspector !== null || selectedKey !== null || windowReview !== null) && (
                <div className="anim-stage-panes" data-anim-stage-panes>
                  {/* The review/preview pane — the selected surface's landed
                      (or in-flight) takes; an honest empty state names the
                      way in when nothing has rendered yet. */}
                  <div className="anim-stage-pane anim-stage-review" data-anim-stage-review>
                    {selectedSpan !== null && (
                      reviewPanel !== null ? (
                        <ReviewPanel
                          attempt={reviewPanel.subject}
                          span={selectedSpan}
                          stepIndex={reviewPanel.stepIndex}
                          slotSelection={reviewPanel.slotSelection}
                          takes={reviewPanel.takes}
                          busy={busy}
                          onSelectTake={(attemptId) => setReviewTake({ spanId: selectedSpan.id, attemptId })}
                          onSelectFrame={(frameIndex) => void session.commands.selectReferenceFrame(selectedSpan.id, reviewPanel.subject.attemptId, frameIndex)}
                          onContinue={() => void session.commands.continueChain(selectedSpan.id)}
                          onReroll={() => {
                            // T10-M4: the re-roll pins the CURRENT subject first —
                            // the landing lands beside it as an announced alternative
                            // and never steals the review (§8.2: selection truth is
                            // untouched; the pin is view state).
                            setReviewTake({ spanId: selectedSpan.id, attemptId: reviewPanel.subject.attemptId })
                            void session.commands.rerollStep(selectedSpan.id, reviewPanel.subject.targetId)
                          }}
                          onRetryPreparation={() => void session.commands.retryPreparation(reviewPanel.subject.attemptId)}
                          onExtend={() => setExtendFor(reviewPanel.subject.attemptId)}
                          newTakeAttemptId={reviewPanel.newTakeAttemptId}
                          onDismissNewTake={dismissNewTake}
                        />
                      ) : (
                        <div className="anim-stage-empty" data-anim-review-empty>
                          <strong>Nothing to review yet</strong>
                          <span>Submit a step from the inspector — its render lands here for review.</span>
                        </div>
                      )
                    )}
                    {selectedKey !== null && (
                      <>
                        {/* One chosen tool: the inactive lane stays MOUNTED but
                            hidden, so a half-typed draft survives the round
                            trip. */}
                        <div data-anim-review-lane="hero" hidden={activeKeyTool !== 'hero'}>
                          {heroReview !== null ? (
                            <HeroReview
                              attempt={heroReview.subject}
                              keyEntity={selectedKey}
                              takes={heroReview.takes}
                              busy={busy}
                              onSelectTake={(attemptId) => setHeroTake({ keyId: selectedKey.id, attemptId })}
                              onAcceptFrame={(frameIndex) => void session.commands.acceptHeroFrame(selectedKey.id, heroReview.subject.attemptId, frameIndex)}
                              onReroll={() => {
                                // T10-M4: the re-roll pins the CURRENT subject first —
                                // the fresh take lands announced, never auto-selected.
                                setHeroTake({ keyId: selectedKey.id, attemptId: heroReview.subject.attemptId })
                                void session.commands.rerollHero(selectedKey.id)
                              }}
                              onOpenSpan={() => {
                                const subject = heroReview.subject
                                // §5.2 (c): the span binds this take's SOURCE key → this
                                // key; the hero arc seeds its movement draft. The shell
                                // selects the minted span so the inspector opens on it.
                                if (subject.sourceKeyId === undefined || subject.movementArc === undefined) return
                                void session.commands.openSpanIntoKey(subject.sourceKeyId, selectedKey.id, subject.movementArc).then((spanId) => {
                                  if (spanId !== null) setSelectedId(spanId)
                                })
                              }}
                              onRetryPreparation={() => void session.commands.retryPreparation(heroReview.subject.attemptId)}
                              newTakeAttemptId={heroReview.newTakeAttemptId}
                              onDismissNewTake={dismissNewTake}
                            />
                          ) : (
                            <div className="anim-stage-empty" data-anim-review-empty>
                              <strong>No next-key renders yet</strong>
                              <span>Generate the next key from the inspector — its clip lands here for review.</span>
                            </div>
                          )}
                        </div>
                        <div data-anim-review-lane="sequence" hidden={activeKeyTool !== 'sequence'}>
                          {sequenceReview !== null ? (
                            <SequenceReview
                              attempt={sequenceReview.subject}
                              keyEntity={selectedKey}
                              endKey={sequenceReview.endKey}
                              takes={sequenceReview.takes}
                              windows={sequenceWindows}
                              activeWindowEndKeyId={sequenceReview.windowEndKeyId}
                              busy={busy}
                              onSelectTake={(attemptId) => setSequenceTake({ keyId: selectedKey.id, attemptId })}
                              onSelectWindow={(windowEndKeyId) => {
                                setSequenceWindow({ keyId: selectedKey.id, windowEndKeyId })
                                setSequenceTake(null)
                              }}
                              onReroll={() => {
                                // T10-M4: the re-roll pins the CURRENT subject first —
                                // the fresh take lands announced, never auto-selected.
                                setSequenceTake({ keyId: selectedKey.id, attemptId: sequenceReview.subject.attemptId })
                                void session.commands.rerollSequence(selectedKey.id, sequenceReview.subject.windowEndKeyId)
                              }}
                              onRetryPreparation={() => void session.commands.retryPreparation(sequenceReview.subject.attemptId)}
                              newTakeAttemptId={sequenceReview.newTakeAttemptId}
                              onDismissNewTake={dismissNewTake}
                            />
                          ) : (
                            <div className="anim-stage-empty" data-anim-review-empty>
                              <strong>No window renders yet</strong>
                              <span>Render a window from the inspector — its clip lands here for review.</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    {/* The extension lane's window review (Task 6): a chain
                        window's takes strip, its EXPLICIT selection, the
                        re-roll split, and the Extend action on the subject
                        take. An EMPTY window names itself — the Extend flow
                        (its own surface) is the way in. */}
                    {windowReview !== null && (
                      windowReview.empty ? (
                        <div className="anim-stage-empty" data-anim-review-empty data-anim-window-empty={windowReview.slot.id}>
                          <strong>An empty window</strong>
                          <span>A previous submission never settled here — Extend the source take again to fill it, or keep authoring elsewhere; nothing chains by itself.</span>
                        </div>
                      ) : (
                        <WindowReview
                          attempt={windowReview.subject}
                          window={windowReview.slot}
                          windowIndex={windowReview.index + 1}
                          takes={windowReview.takes}
                          busy={busy}
                          onSelectTake={(attemptId) => setWindowTake({ windowSlotId: windowReview.slot!.id, attemptId })}
                          onSelectCandidate={(attemptId) => void session.commands.selectWindowCandidate(windowReview.slot!.id, attemptId)}
                          onToggleLock={(locked) => void session.commands.toggleWindowLock(windowReview.slot!.id, locked)}
                          onExtend={() => setExtendFor(windowReview.subject!.attemptId)}
                          onReroll={() => {
                            // T10-M4's pin doctrine: the re-roll pins the
                            // CURRENT subject first — the fresh take lands
                            // announced beside it, never stealing the review
                            // (§8.2: the window's selection never moves).
                            setWindowTake({ windowSlotId: windowReview.slot!.id, attemptId: windowReview.subject!.attemptId })
                            void session.commands.rerollExtension(windowReview.subject!.attemptId)
                          }}
                          onRetryPreparation={() => void session.commands.retryPreparation(windowReview.subject!.attemptId)}
                        />
                      )
                    )}
                    {/* The Extend flow (§4): mounted under the take's review —
                        the carry preview, the preflight verdicts, the window
                        draft, the submission (and its lost-response Retry). */}
                    {extendSource !== null && activeBinding !== null && (
                      <ExtendPanel
                        source={extendSource}
                        body={document!.body}
                        attempts={document!.attempts}
                        bindingMedium={activeBinding.medium}
                        busy={busy}
                        onSubmit={submitExtension}
                        onRetrySubmission={retryExtension}
                        onClose={() => setExtendFor(null)}
                      />
                    )}
                  </div>
                  {/* The active inspector pane — the authoring surface for
                      the selection. A selected key carries the explicit TOOL
                      SWITCH above exactly one tool's panel (the prescription:
                      hero and sequence never stack), with the candidate
                      strip beneath; a selected span carries the tween
                      inspector. */}
                  <div className="anim-stage-pane anim-stage-inspector" data-anim-stage-inspector>
                    {selectedKey !== null && (
                      <div className="anim-stage-tools" data-anim-key-tools-label>
                        <span className="anim-stage-tools-label">Key #{selectedKey.order} — author with</span>
                        <ChipGroup
                          id="anim-key-tools"
                          className="anim-mediums"
                          data-anim-key-tools
                          exclusive
                          aria-label="The key's authoring tool"
                          value={`anim-key-tool-${activeKeyTool}`}
                          onChange={(next) => {
                            const picked = (next as string) === 'anim-key-tool-sequence' ? 'sequence' : 'hero'
                            setKeyTool({ keyId: selectedKey.id, tool: picked })
                          }}
                        >
                          <Chip id="anim-key-tool-hero" variant="radio" className="anim-chip" data-anim-key-tool="hero">Hero — next key</Chip>
                          <Chip id="anim-key-tool-sequence" variant="radio" className="anim-chip" data-anim-key-tool="sequence">Sequence — window</Chip>
                        </ChipGroup>
                      </div>
                    )}
                    {spanInspector !== null && (
                      <SpanInspector
                        key={spanInspector.span.id}
                        span={spanInspector.span}
                        fromKey={spanInspector.fromKey}
                        toKey={spanInspector.toKey}
                        preview={spanInspector.preview}
                        binding={activeBinding}
                        busy={busy}
                        onIntentChange={session.commands.updateSpanIntent}
                        onFacingChange={session.commands.setKeyFacing}
                        onAnnotateRolling={session.commands.annotateRollingReference}
                        onSubmit={session.commands.submitTweenStep}
                      />
                    )}
                    {/* One chosen tool — the inactive pane stays mounted but
                        hidden (the draft survives the switch). The per-surface
                        key PREFIXES matter: the key-selected panels would
                        otherwise share the bare selectedKey.id, and duplicate
                        sibling keys corrupt the reconciler (observed: fresh
                        mounts appended on every commit, old DOM never
                        removed). */}
                    {heroPanel !== null && (
                      <div data-anim-tool-pane="hero" hidden={activeKeyTool !== 'hero'}>
                        <HeroPanel
                          key={`hero-${heroPanel.keyEntity.id}`}
                          keyEntity={heroPanel.keyEntity}
                          preview={heroPanel.preview}
                          binding={activeBinding}
                          inFlightAttempt={inFlightHeroFromKey}
                          busy={busy}
                          onFacingChange={session.commands.setKeyFacing}
                          onSubmit={session.commands.submitHero}
                        />
                      </div>
                    )}
                    {selectedKey !== null && timeline !== null && (
                      <div data-anim-tool-pane="sequence" hidden={activeKeyTool !== 'sequence'}>
                        <SequencePanel
                          key={`sequence-${selectedKey.id}`}
                          keyEntity={selectedKey}
                          keys={timeline.keys}
                          binding={activeBinding}
                          inFlightAttempts={inFlightSequenceFromKey}
                          busy={busy}
                          onFacingChange={session.commands.setKeyFacing}
                          onSubmit={session.commands.submitSequence}
                        />
                      </div>
                    )}
                    {/* The key's candidate strip (wave 2b, Fix 1): the selected
                        key's alternatives — importing lands an ALTERNATIVE
                        candidate (never a selection change, §5.3); choosing is
                        the explicit select command. Presented under either
                        tool. A landed CLIP candidate's review link (Codex
                        I12) switches the key's tool to hero — the lane that
                        holds its takes and the frame acceptance. */}
                    {selectedKey !== null && (
                      <KeyCandidates
                        key={`candidates-${selectedKey.id}`}
                        keyEntity={selectedKey}
                        busy={busy}
                        assets={assets}
                        onImportFiles={session.commands.importImages}
                        onImport={(destination: KeyImportDestination, image, origin) => session.commands.importKeyCandidate(destination, image, origin)}
                        onSelect={(candidateId) => void session.commands.selectKeyCandidate(selectedKey.id, candidateId)}
                        onOpenClipReview={() => { setKeyTool({ keyId: selectedKey.id, tool: 'hero' }) }}
                      />
                    )}
                  </div>
                </div>
              )}
              {/* The assembly + delivery surfaces (tasks 13/14, §9/§11.3):
                  behind an explicit disclosure at the stage's foot —
                  reachable from the loop, no longer permanently mounted in
                  it. The summary carries the live totals so the closed state
                  still reports what stands assembled. */}
              {assembledSequence !== null && (
                <details className="anim-assembly" data-anim-assembly>
                  <summary data-anim-assembly-summary>
                    <strong>Assembly &amp; export</strong>
                    <span className="anim-assembly-summary-note" data-anim-assembly-total>
                      {assembledSequence.contributions.length === 0
                        ? 'nothing assembled yet'
                        : `${assembledSequence.contributions.length} ${assembledSequence.contributions.length === 1 ? 'contribution' : 'contributions'} — ${assembledSequence.totalFrames} frames · ${(assembledSequence.totalFrames / assembledSequence.fps).toFixed(1)} s`}
                    </span>
                  </summary>
                  <div className="anim-assembly-body">
                    <EditorialPanel
                      clips={editorialClips}
                      assembled={assembledSequence}
                      busy={busy}
                      onContribute={(spanId, windowSlotId, attemptId, inFrame, outFrame, holdDuration) =>
                        void session.commands.contributeClip(spanId, attemptId, inFrame, outFrame, holdDuration, windowSlotId)}
                      onReorder={(orderedIds) => void session.commands.reorderContributions(orderedIds)}
                      onRemove={(contributionId) => void session.commands.removeContribution(contributionId)}
                    />
                    <ExportPanel
                      assembled={assembledSequence}
                      exportPhase={session.exportPhase}
                      exportError={session.exportError}
                      exportStale={session.exportStale}
                      lastExportName={session.lastExportName}
                      onExport={(acknowledgeStale) => void session.commands.exportSequence(acknowledgeStale)}
                    />
                  </div>
                </details>
              )}
            </section>
          </>
        ) : (
          <BindingPanel
            document={document!}
            assets={assets}
            assetsFailed={assetsFailed}
            onImportFiles={session.commands.importImages}
            onSubmitBinding={session.commands.updateBinding}
            busy={busy}
            errors={commandError ? { submit: commandError } : undefined}
          />
        )}
      </main>
    </div>
  )
}
