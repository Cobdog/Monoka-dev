/**
 * ReviewPanel — the animation module's review surface (task 10, k2q0n9s,
 * spec 2026-10-06-animation-authoring-module-design.md §7 the rendering
 * workflow): ONE attempt under review — its status in §7.3's vocabulary,
 * the landed candidate clip, the proposed reference frame, EXPLICIT frame
 * selection, and the continuation / re-roll actions.
 *
 * The four interface actions the task brief names — onSelectFrame /
 * onContinue / onRetryPreparation (+ the re-roll arm the §12.3 requirements
 * demand) — arrive as props verbatim; the data props beside them (the owning
 * span, the step position, the slot's DURABLE selection, the landed takes)
 * are what those actions act on. Props-only (P07): every connection lives in
 * ./state.ts.
 *
 * The invariants this panel renders, never breaks:
 *   - §7.3's FIVE-WORD status vocabulary, mapped from the attempt's
 *     execution state through ./reviewStatus.ts's ONE table (task 11 moved
 *     it beside the panel when the hero review became the second consumer —
 *     every surface that renders a status renders the same word).
 *   - The system PROPOSES a frame; only the user SELECTS (§7.2.2). The
 *     proposal is marked in the strip; the durable slot selection is the
 *     only "selected" truth, and the panel reads it back from the document —
 *     a local selection state does not exist here by design.
 *   - Continue ("Generate next step") is gated on the durable selection
 *     naming THIS take AND the subject being the chain's frontier (the last
 *     slot holding attempts): dependent advancement is always a user action
 *     taken after an explicit review decision (§7.1), and the chain
 *     continues from the FRONTIER's rolling reference — never an older
 *     step's (task 10's Important-1, closed at both the gate and the
 *     command).
 *   - A re-roll is a fresh take for the SAME step — an alternative that
 *     never replaces the selection (§8.2); the take strip switches the
 *     review SUBJECT, not the document.
 *   - A failed preparation keeps the clip (§11.4): the Refusal offers the
 *     explicit retry, which never re-renders.
 */
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { Refusal } from '../ui/Refusal'
import { documentsApi } from '../canvas/api'
import type { Span } from '../../shared/animation/types'
import { IN_FLIGHT, REVIEW_STATUS } from './reviewStatus'
import { extendGateReason } from './state'
import type { AttemptStateView } from './client'

/** The T10-M4 "new take" indicator (wave 2b), shared by all three review
 *  lanes' take strips: a kit Chip BESIDE the fresh take's button (never
 *  inside — a chip is itself a button). Clicking it dismisses the marker;
 *  selecting the take clears it through the shell. Announce, never
 *  auto-select (§8.2). */
export function TakeNewChip({ attemptId, onDismiss }: { attemptId: string; onDismiss(attemptId: string): void }) {
  return (
    <Chip
      variant="toggle"
      className="anim-take-new"
      data-anim-take-new={attemptId}
      title="A newer take landed — review it, or dismiss this marker"
      onClick={() => onDismiss(attemptId)}
    >
      new
    </Chip>
  )
}

export type ReviewPanelProps = {
  /** The attempt under review (the document view's row — live through the
   *  fabric's status patches and the durable re-reads). */
  attempt: AttemptStateView
  /** The tween span whose chain this step belongs to. */
  span: Span
  /** The 1-based position of the attempt's step slot within the span. */
  stepIndex: number
  /** The owning slot's DURABLE selectedRollingReference (server truth) —
   *  null until the user's explicit §7.2.1 command lands. */
  slotSelection: { attemptId: string; frameIndex: number } | null
  /** The slot's landed takes in landing order (re-rolls append here). */
  takes: Array<{ attemptId: string }>
  /** True while a command is in flight (the store's busy). */
  busy: boolean
  /** Switches the review SUBJECT to another take (view state, never a
   *  document write). */
  onSelectTake(attemptId: string): void
  /** The explicit frame selection — §7.2.1 command 2 (the adapter routes
   *  non-proposed frames through on-demand extraction first, §7.2.2). */
  onSelectFrame(frameIndex: number): void
  /** The continuation action — submits the next step into the span's
   *  trailing empty slot when one stands, else appends the next step slot
   *  and submits against it (§7.1: one step, explicit, never automatic). */
  onContinue(): void
  /** The re-roll action — a fresh take for this same step. */
  onReroll(): void
  /** §11.4's explicit preparation retry — re-prepares the proposed frame
   *  WITHOUT re-rendering. */
  onRetryPreparation(): void
  /** The EXTENSION lane's action (§4): opens the Extend flow with THIS take
   *  as the source — disabled with its named reason while the take is not
   *  continuation-ready (the gate's one table names it). */
  onExtend(): void
  /** T10-M4 (wave 2b): the strip's LAST take when it is fresher than the
   *  subject — announced with a "new" chip, never auto-selected (§8.2). */
  newTakeAttemptId?: string | null
  /** Dismisses the "new" marker (the chip's own click; selecting the take
   *  clears it through the shell). */
  onDismissNewTake(attemptId: string): void
}

export function ReviewPanel({ attempt, span, stepIndex, slotSelection, takes, busy, onSelectTake, onSelectFrame, onContinue, onReroll, onRetryPreparation, onExtend, newTakeAttemptId = null, onDismissNewTake }: ReviewPanelProps) {
  const status = REVIEW_STATUS[attempt.execution]
  const candidate = attempt.candidate
  const proposedFrame = attempt.preparation.proposedFrameIndex
  // The extension lane's gate (§4 — "disabled with named reasons when not
  //  continuation-ready"): ONE table names the condition here, on the
  //  window review, and at the adapter's pre-gate alike.
  const extendReason = extendGateReason(attempt)
  // The durable selection names THIS take — the §7.1 continuation gate.
  const selectionIsThisTake = slotSelection !== null && slotSelection.attemptId === attempt.attemptId
  // ...AND the subject must be the chain's FRONTIER — the LAST slot holding
  // attempts. When a later step has already landed, the chain's rolling
  // reference is THAT step's promoted frame (the server's backward walk), so
  // continuing from an older step's review would submit against a different
  // near reference than the one reviewed. The panel's model and the
  // continuation command agree exactly on the frontier (task 10's
  // Important-1, closed both ways).
  let frontierIndex = -1
  for (let index = span.stepSlots.length - 1; index >= 0; index -= 1) {
    if (span.stepSlots[index]!.attempts.length > 0) { frontierIndex = index; break }
  }
  const subjectIsFrontier = frontierIndex === stepIndex - 1
  const canContinue = selectionIsThisTake && subjectIsFrontier
  const readyToReview = attempt.execution === 'ready' && candidate !== null
  const inFlight = IN_FLIGHT.has(attempt.execution)
  const isSelectedFrame = (frameIndex: number): boolean => selectionIsThisTake && slotSelection!.frameIndex === frameIndex

  return (
    <section
      className="anim-review"
      data-anim-review
      data-anim-review-attempt={attempt.attemptId}
      data-anim-review-state={attempt.execution}
      data-anim-review-preparation={attempt.preparation.state}
      aria-labelledby="anim-review-title"
    >
      <header className="anim-review-header">
        <h3 id="anim-review-title">Review — step {stepIndex} of the tween span</h3>
        <span className="anim-review-status" data-anim-review-status={status.key}>{status.label}</span>
        {attempt.progress && (
          <span className="anim-review-progress" data-anim-review-progress title="Observed engine progress">
            {attempt.progress.value}/{attempt.progress.max}
          </span>
        )}
      </header>
      <p className="anim-review-meaning" data-anim-review-meaning>{status.meaning}</p>
      {/* The durable failure reason (the live review's #6): a FAILED attempt
          shows the named, sanitized reason the failure site persisted — the
          reason text itself names what to change (a model-slot refusal says
          which slot and what the engine serves), and the re-roll beside it
          re-resolves by construction. A cancelled or interrupted attempt
          never renders a reason — its copy is the neutral stopped line. */}
      {attempt.execution === 'failed' && attempt.failureReason !== undefined && (
        <p className="anim-note anim-review-failure" role="alert" data-anim-review-failure-reason>
          {attempt.failureReason}
        </p>
      )}
      <p className="anim-note" data-anim-review-span>Span: {span.intent.movement}</p>
      {candidate?.earlierRevision === true && (
        <p className="anim-note" role="status" data-anim-review-earlier>
          Generated from an earlier version of this span — it changed while this render ran.
        </p>
      )}

      {/* The candidate clip — the landed artifact through the real blob
          route; an opaque handle (no relPath) is named, never guessed into a
          URL that lies; nothing landed renders an honest absence. */}
      {candidate !== null && candidate.assetReference.relPath !== null ? (
        <video
          className="anim-review-clip"
          data-anim-review-clip
          controls
          preload="metadata"
          src={documentsApi.blobFileUrl(candidate.assetReference.relPath)}
          aria-label={`The landed candidate clip (${candidate.frameCount} frames)`}
        />
      ) : candidate !== null ? (
        <p className="anim-review-meaning" data-anim-review-clip-opaque title={candidate.assetReference.assetId}>
          The landed clip&apos;s handle ({candidate.assetReference.assetId}) carries no readable path in this build.
        </p>
      ) : attempt.execution === 'ready' ? (
        // Task 10's Minor-2: the attempt-state envelope flips the row to
        // 'ready' a beat BEFORE the attempt-ready envelope's durable re-read
        // lands the candidate — that window is SETTLING, not an absence. A
        // ready row without its candidate renders the arrival, never the
        // "no candidate landed" note (ready implies landed: §8.2).
        <p className="anim-note" role="status" data-anim-review-settling>The landed candidate is arriving — the completion event is being read back.</p>
      ) : (
        !inFlight && <p className="anim-note" data-anim-review-no-candidate>No candidate landed for this attempt — a re-roll starts a fresh take; nothing else moved.</p>
      )}

      {/* The takes (re-roll alternatives, §8.2): switching the SUBJECT is a
          view act; the SELECTED marker follows the durable slot selection.
          T10-M4: the fresh take carries the "new" chip (announce, never
          auto-select) — a sibling of the take button, never a child (both
          are buttons). */}
      {takes.length > 1 && (
        <div className="anim-review-takes" data-anim-review-takes role="group" aria-label="Takes for this step">
          {takes.map((take, index) => (
            <span key={take.attemptId} className="anim-take-wrap">
              <button
                type="button"
                className="anim-review-take"
                data-anim-review-take={take.attemptId}
                data-anim-take-selected={slotSelection?.attemptId === take.attemptId ? 'true' : 'false'}
                disabled={busy}
                title={slotSelection?.attemptId === take.attemptId ? 'The selected take — its frame is the rolling reference' : 'Review this take (the selection stays until you choose a frame from another take)'}
                onClick={() => { if (take.attemptId !== attempt.attemptId) onSelectTake(take.attemptId) }}
              >
                take {index + 1}
              </button>
              {newTakeAttemptId === take.attemptId && onDismissNewTake !== undefined && (
                <TakeNewChip attemptId={take.attemptId} onDismiss={onDismissNewTake} />
              )}
            </span>
          ))}
        </div>
      )}

      {/* The frame strip (§7.2.2): the clip's frames, the proposal MARKED,
          the selection absent until the user's explicit act. */}
      {readyToReview && (
        <div className="anim-review-frames-block">
          <p className="anim-review-frames-lede">
            Pick the frame the next step continues from — the dashed frame is a suggestion; nothing is chosen until you click.
          </p>
          <div className="anim-review-frames" data-anim-review-frames role="group" aria-label="Reference frames">
            {Array.from({ length: candidate!.frameCount }, (_, frameIndex) => (
              <button
                key={frameIndex}
                type="button"
                className="anim-review-frame"
                data-anim-review-frame={frameIndex}
                data-anim-frame-proposed={proposedFrame === frameIndex ? 'true' : 'false'}
                data-anim-frame-selected={isSelectedFrame(frameIndex) ? 'true' : 'false'}
                disabled={busy}
                aria-label={`Use frame ${frameIndex} as the rolling reference${proposedFrame === frameIndex ? ' (the proposed frame)' : ''}`}
                onClick={() => { if (!isSelectedFrame(frameIndex)) onSelectFrame(frameIndex) }}
              >
                {frameIndex}
              </button>
            ))}
          </div>
          <p className="anim-review-selected" data-anim-review-selected-frame>
            {selectionIsThisTake
              ? <>Rolling reference: frame {slotSelection!.frameIndex} of this take — the next step continues from it.</>
              : <>No frame chosen from this take yet — the chain waits for your selection.</>}
          </p>
        </div>
      )}

      {/* §11.4's preparation failure: the clip is PRESERVED, the explicit
          retry re-prepares without re-rendering (F3). The durable last
          error rides the refusal when the row carries one. */}
      {attempt.preparation.state === 'failed' && (
        <Refusal
          title="The proposed frame could not be prepared"
          reason={`The engine's record of this clip was unreadable past the bounded retries, so the proposed reference frame is not prepared. The clip itself is safe and landed — retrying preparation never re-renders.${attempt.preparation.error !== undefined ? ` Last error: ${attempt.preparation.error}` : ''}`}
          satisfy={{ label: 'Retry frame preparation', action: onRetryPreparation }}
        />
      )}

      <div className="anim-review-actions">
        <Button
          variant="primary" className="anim-btn"
          busy={busy}
          disabled={!canContinue}
          data-anim-review-continue
          title={selectionIsThisTake
            ? (subjectIsFrontier
                ? 'Submits the next step — the chain continues from this take’s chosen frame'
                : 'The chain has already advanced past this step — its rolling reference is the latest landed step’s frame; continue from that step’s review')
            : 'Choose a reference frame from this take first — the next step continues from it'}
          onClick={onContinue}
        >
          Generate next step
        </Button>
        <Button
          variant="secondary" className="anim-btn"
          busy={busy}
          disabled={inFlight}
          data-anim-review-reroll
          title="A fresh take for this same step — an alternative alongside the others; it never replaces your selection"
          onClick={onReroll}
        >
          Generate another take
        </Button>
        {/* The extension lane's Extend action (§4): beside the standing
            actions, never a timeline drag, never automatic. The disable is
            NAMED (the two-readiness lifecycle's honest surface): a take not
            continuation-ready says which condition holds and what would
            change it. */}
        <Button
          variant="secondary" className="anim-btn"
          busy={busy}
          disabled={busy || extendReason !== null}
          data-anim-review-extend
          title={extendReason ?? 'Open the Extend flow — a new window conditioned on this take\'s carried tail'}
          onClick={onExtend}
        >
          Extend this take
        </Button>
      </div>
      {extendReason !== null && attempt.execution === 'ready' && (
        <p className="anim-note" data-anim-review-extend-reason>{extendReason}</p>
      )}

      {/* The frozen caption (F2's surfacing): what this attempt MEANT when it
          was submitted — later edits are the next draft, never its meaning. */}
      <details className="anim-caption" data-anim-review-caption>
        <summary>View the frozen caption</summary>
        <div className="anim-caption-body">
          <pre className="anim-caption-text" data-anim-review-caption-text>{attempt.caption}</pre>
          <p className="anim-note">
            Caption compiler <span data-anim-review-compiler>v{attempt.compilerVersion}</span>, frozen at submission — later edits are the next draft, never this take&apos;s meaning.
          </p>
        </div>
      </details>
    </section>
  )
}
