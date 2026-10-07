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
 *     selection, it only fills the empty one);
 *   - the conflict rebase notice (a 409 is never silent) and the failed
 *     silent-refresh notice, both role=status; the selection state carries
 *     the "new animation document" creation arm (task 7's Minor-2).
 */
import { useEffect, useMemo, useState } from 'react'
import { Clapperboard, FilePlus2, LoaderCircle } from 'lucide-react'
import { SurfaceSwitcher } from '../surfaces/SurfaceSwitcher'
import { Button } from '../ui/Button'
import { animationHref } from './client'
import { BindingPanel } from './BindingPanel'
import { Timeline } from './Timeline'
import { SpanInspector } from './SpanInspector'
import { ReviewPanel } from './ReviewPanel'
import { deriveReviewPosition, deriveTimeline } from './timelineModel'
import { deriveTweenPreview, useAnimationDocument } from './state'
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
  const session = useAnimationDocument(params.documentId, params.projectId)
  const { phase, errorDetail, document, projectDocuments, assets, assetsFailed, conflict, busy, commandError, refreshFailed } = session

  const activeBinding = document
    ? (document.body.bindingHistory.find((entry) => entry.version === document.body.activeBindingVersion) ?? null)
    : null
  const timeline = useMemo(() => (document === null ? null : deriveTimeline(document.body)), [document])
  const playhead = useMemo(
    () => (document === null ? null : deriveReviewPosition(document.body, document.attempts)),
    [document],
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
  // The selected span's continuation truth (task 10): what the NEXT
  // submission's near reference will resolve to — the server's own backward
  // walk over the slots before the target (the first slot WITH a selection
  // decides). The next step's target is APPENDED after every current slot,
  // so the walk here covers them ALL. When it resolves to a landed clip,
  // the near reference is a PROMOTED FRAME and this build's honest dispatch
  // limit applies — the review panel names it (the slot still advances; the
  // engine leg's real frame extraction is what flips the rule).
  const nextNearIsPromotedFrame = useMemo(() => {
    if (document === null || selectedSpan === null) return false
    for (let index = selectedSpan.stepSlots.length - 1; index >= 0; index -= 1) {
      const selected = selectedSpan.stepSlots[index]?.selectedRollingReference
      if (!selected) continue
      const attempt = document.attempts.find((entry) => entry.attemptId === selected.attemptId) ?? null
      return attempt !== null && attempt.candidate !== null
    }
    return false
  }, [document, selectedSpan])
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
    const limit = nextNearIsPromotedFrame
      ? 'Honest limit of this build: the chosen frame rides the clip artifact itself, and the tween adapters consume image references — generating the next step appends the step slot and submits, but the submission is refused until real frame extraction lands on the engine leg.'
      : null
    return { subject, stepIndex: slotIndex + 1, slotSelection: slot.selectedRollingReference, takes: slot.attempts.map((attemptId) => ({ attemptId })), limit }
  }, [document, selectedSpan, reviewTake, nextNearIsPromotedFrame])

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
                silently changes a bound session. */}
            <section className="anim-bound" data-anim-bound-version data-anim-bound-version-n={activeBinding.version} aria-label="The bound session">
              <header>
                <strong>Bound — version {activeBinding.version}</strong>
                <span>{activeBinding.medium}</span>
                <span>{activeBinding.referenceAssetIds.length} {activeBinding.referenceAssetIds.length === 1 ? 'reference' : 'references'}</span>
              </header>
              <p data-anim-bound-description>{activeBinding.characterDescription}</p>
            </section>
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
                  limit={reviewPanel.limit}
                  onSelectTake={(attemptId) => setReviewTake({ spanId: selectedSpan.id, attemptId })}
                  onSelectFrame={(frameIndex) => void session.commands.selectReferenceFrame(selectedSpan.id, reviewPanel.subject.attemptId, frameIndex)}
                  onContinue={() => void session.commands.continueChain(selectedSpan.id)}
                  onReroll={() => void session.commands.rerollStep(selectedSpan.id)}
                  onRetryPreparation={() => void session.commands.retryPreparation(reviewPanel.subject.attemptId)}
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
