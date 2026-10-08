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
 */
import { useEffect, useMemo, useState } from 'react'
import { Clapperboard, FilePlus2, LoaderCircle, RefreshCw } from 'lucide-react'
import { SurfaceSwitcher } from '../surfaces/SurfaceSwitcher'
import { Button } from '../ui/Button'
import { animationHref } from './client'
import { BindingPanel } from './BindingPanel'
import { KeyCandidates, type KeyImportDestination } from './KeyCandidates'
import { Timeline } from './Timeline'
import { SpanInspector } from './SpanInspector'
import { ReviewPanel } from './ReviewPanel'
import { HeroPanel } from './HeroPanel'
import { HeroReview } from './HeroReview'
import { SequencePanel } from './SequencePanel'
import { SequenceReview } from './SequenceReview'
import { EditorialPanel } from './EditorialPanel'
import { ExportPanel } from './ExportPanel'
import { IN_FLIGHT } from './reviewStatus'
import { deriveAssembledSequence, deriveContributableClips, deriveReviewPosition, deriveTimeline, type TimelineReviewPosition } from './timelineModel'
import { deriveHeroPreview, deriveTweenPreview, useAnimationDocument } from './state'
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
    // one — the same doctrine as the tween strip.
    const newest = heroTakes[heroTakes.length - 1]!
    const newTakeAttemptId = subject.attemptId !== newest.attemptId && !dismissedNewTakes.includes(newest.attemptId)
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
    // an older one — the same doctrine as the other two strips.
    const windowNewest = ofWindow[ofWindow.length - 1] ?? null
    const newTakeAttemptId = windowNewest !== null && subject.attemptId !== windowNewest.attemptId && !dismissedNewTakes.includes(windowNewest.attemptId)
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
                variant="primary"
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
            <button type="button" data-anim-retry onClick={() => void session.commands.retry()}>Retry the read</button>
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
        <span className="anim-revision" data-anim-revision title="The authored revision — every command is expectedRevision-gated against it">rev {document!.revision}</span>
        <a className="anim-back" href="/?images=1" data-anim-back>workbench</a>
      </header>
      <main className="anim-body">
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
                    variant="secondary"
                    icon={<RefreshCw size={12} />}
                    busy={busy}
                    onClick={() => setUpdateOpen((open) => !open)}
                    data-anim-bound-update
                    title="Append the next binding version — new references or a session-copy description edit (§4.2)"
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
            {/* The timeline (task 8): keys, spans, nested step slots, the
                playhead — the shell owns only the document + event plumbing;
                every connection rides the adapter's command bag. The
                selection the timeline renders is the EFFECTIVE one (an
                explicit click, else §7.4's restored review position). */}
            <section className="anim-stage" data-anim-stage>
              <Timeline
                timeline={timeline!}
                binding={activeBinding}
                selectedId={selectedId}
                playhead={playhead}
                busy={busy}
                onSelectKey={setSelectedId}
                onSelectSpan={setSelectedId}
                onToggleLock={(keyId, locked) => void session.commands.toggleKeyLock(keyId, locked)}
                onSeedInitialKey={() => void session.commands.seedInitialKey()}
              />
              {/* The span inspector (task 9, §6.1): keyed by span id — the
                  authoring draft seeds per span and survives document
                  refreshes; selecting a different span is a fresh mount. */}
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
              {/* The review panel (task 10, §7.3): the selected span's tween
                  attempts — the newest (or the reviewer's explicit take) under
                  review: status vocabulary, the clip, the proposed frame,
                  explicit selection, the continue / re-roll actions. */}
              {reviewPanel !== null && selectedSpan !== null && (
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
                  newTakeAttemptId={reviewPanel.newTakeAttemptId}
                  onDismissNewTake={dismissNewTake}
                />
              )}
              {/* The hero surfaces (task 11, §5.2): a selected KEY reviews the
                  hero takes that targeted it (the newest, or the reviewer's
                  explicit take) — the clip, the frame strip, the EXPLICIT
                  acceptance that establishes the key, the far-reference span
                  action — and below it, the authoring panel that sources the
                  NEXT generation from this key's selection. */}
              {heroReview !== null && selectedKey !== null && (
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
              )}
              {/* The key's candidate strip (wave 2b, Fix 1): the selected
                  key's alternatives — importing lands an ALTERNATIVE
                  candidate (never a selection change, §5.3); choosing is the
                  explicit select command. The per-surface key PREFIXES matter:
                  all three key-selected panels would otherwise share the bare
                  selectedKey.id, and duplicate sibling keys corrupt the
                  reconciler (observed: fresh mounts appended on every commit,
                  old DOM never removed). */}
              {selectedKey !== null && (
                <KeyCandidates
                  key={`candidates-${selectedKey.id}`}
                  keyEntity={selectedKey}
                  busy={busy}
                  assets={assets}
                  onImportFiles={session.commands.importImages}
                  onImport={(destination: KeyImportDestination, image, origin) => session.commands.importKeyCandidate(destination, image, origin)}
                  onSelect={(candidateId) => void session.commands.selectKeyCandidate(selectedKey.id, candidateId)}
                />
              )}
              {heroPanel !== null && (
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
              )}
              {/* The sequence surfaces (task 12, §5.2/§11.2): the selected key
                  is a WINDOW START — its window takes' review above the
                  authoring panel whose explicit pick is the window's end. */}
              {sequenceReview !== null && selectedKey !== null && (
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
              )}
              {selectedKey !== null && timeline !== null && (
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
              )}
              {/* The editorial surface (task 13, §9): the assembly layer —
                  which portions of the landed clips contribute, the holds,
                  the order, and the assembled-sequence preview. Always
                  mounted for a bound document (the empty state names the way
                  in). */}
              {assembledSequence !== null && (
                <EditorialPanel
                  clips={editorialClips}
                  assembled={assembledSequence}
                  busy={busy}
                  onContribute={(spanId, attemptId, inFrame, outFrame, holdDuration) =>
                    void session.commands.contributeClip(spanId, attemptId, inFrame, outFrame, holdDuration)}
                  onReorder={(orderedIds) => void session.commands.reorderContributions(orderedIds)}
                  onRemove={(contributionId) => void session.commands.removeContribution(contributionId)}
                />
              )}
              {/* The delivery surface (task 14, §11.3): the review package —
                  sequence.mp4 + manifest.json in one ZIP, assembled from a
                  FROZEN snapshot (edits during export are safe by design),
                  stale selections acknowledged explicitly. */}
              {assembledSequence !== null && (
                <ExportPanel
                  assembled={assembledSequence}
                  exportPhase={session.exportPhase}
                  exportError={session.exportError}
                  exportStale={session.exportStale}
                  lastExportName={session.lastExportName}
                  onExport={(acknowledgeStale) => void session.commands.exportSequence(acknowledgeStale)}
                />
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
