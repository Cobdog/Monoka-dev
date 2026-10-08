/**
 * HeroReview — the hero landing's review surface (task 11, k2q0n9s, spec
 * 2026-10-06-animation-authoring-module-design.md §5.2 the hero sourcing
 * path, §7.3 the status vocabulary, §7.2.2 the two frame paths, §8.2
 * candidate landing): ONE hero attempt under review, mounted for the key
 * slot its takes target. The ReviewPanel CONTRACT (the tween surface's
 * invariants) carried to the hero lane:
 *
 *   - §7.3's FIVE-WORD status vocabulary from the ONE mapping table
 *     (ReviewPanel's REVIEW_STATUS — every status-rendering surface renders
 *     the same word);
 *   - the system PROPOSES a frame; only the user ACCEPTS (§7.2.2). The
 *     acceptance is §5.2's explicit frame selection: the chosen frame is
 *     extracted on demand, becomes a NEW candidate of this key slot, and
 *     the explicit selection follows — the slot's selectedCandidateId is
 *     the only "accepted" truth, read back from the document (the marker
 *     matches the selected candidate's provenance: sourceTake + sourceFrame);
 *   - a re-roll is a fresh take for the SAME proposed slot — an alternative
 *     that never replaces the acceptance (§8.2);
 *   - an outdated result keeps its provenance: earlierRevision renders the
 *     §8.2 "generated from an earlier version" note;
 *   - a failed preparation keeps the clip (§11.4): the Refusal offers the
 *     explicit retry, which never re-renders;
 *   - the accepted key becomes the incoming tween span's FIXED FAR
 *     reference (§5.2): the span action creates (or re-selects) the span
 *     source→this key and opens the span inspector for authoring.
 *
 * Props-only (P07): every connection lives in ./state.ts.
 */
import { Button } from '../ui/Button'
import { Refusal } from '../ui/Refusal'
import { documentsApi } from '../canvas/api'
import { IN_FLIGHT, REVIEW_STATUS } from './reviewStatus'
import { TakeNewChip } from './ReviewPanel'
import type { TimelineKey } from './timelineModel'
import type { AttemptStateView } from './client'

export type HeroReviewProps = {
  /** The attempt under review (the document view's row — live through the
   *  fabric's status patches and the durable re-reads). */
  attempt: AttemptStateView
  /** The key slot this take targeted (the proposed slot the clip landed
   *  into — a real key once a frame is accepted). */
  keyEntity: TimelineKey
  /** The slot's landed hero takes in landing order (re-rolls append). */
  takes: Array<{ attemptId: string }>
  busy: boolean
  /** Switches the review SUBJECT to another take (view state, never a
   *  document write). */
  onSelectTake(attemptId: string): void
  /** The explicit frame acceptance — §5.2's "the accepted image becomes the
   *  key" (on-demand extraction, then the candidate + the selection). */
  onAcceptFrame(frameIndex: number): void
  /** The re-roll action — a fresh take for this same proposed slot. */
  onReroll(): void
  /** §5.2's far-reference binding: create (or re-select) the tween span
   *  from the take's source key into this key and open its inspector. */
  onOpenSpan(): void
  /** §11.4's explicit preparation retry — re-prepares the proposed frame
   *  WITHOUT re-rendering. */
  onRetryPreparation(): void
  /** T10-M4 (wave 2b): the strip's LAST take when it is fresher than the
   *  subject — announced with a "new" chip, never auto-selected (§8.2). */
  newTakeAttemptId?: string | null
  /** Dismisses the "new" marker (the chip's own click; selecting the take
   *  clears it through the shell). */
  onDismissNewTake(attemptId: string): void
}

export function HeroReview({ attempt, keyEntity, takes, busy, onSelectTake, onAcceptFrame, onReroll, onOpenSpan, onRetryPreparation, newTakeAttemptId = null, onDismissNewTake }: HeroReviewProps) {
  const status = REVIEW_STATUS[attempt.execution]
  const candidate = attempt.candidate
  const proposedFrame = attempt.preparation.proposedFrameIndex
  const inFlight = IN_FLIGHT.has(attempt.execution)
  const readyToReview = attempt.execution === 'ready' && candidate !== null
  // The DURABLE acceptance: this slot's selected candidate, when it came
  // from THIS take, names the frame through its provenance (sourceTake +
  // sourceFrame). The marker is document truth, never local state.
  const acceptedFromThisTake = keyEntity.candidate !== null
    && keyEntity.candidate.provenance.sourceTake === attempt.attemptId
    && typeof keyEntity.candidate.provenance.sourceFrame === 'number'
    ? keyEntity.candidate.provenance.sourceFrame
    : null
  const isAcceptedFrame = (frameIndex: number): boolean => acceptedFromThisTake === frameIndex
  const hasSelection = keyEntity.candidate !== null

  return (
    <section
      className="anim-review"
      data-anim-hero-review
      data-anim-review-attempt={attempt.attemptId}
      data-anim-review-state={attempt.execution}
      data-anim-review-preparation={attempt.preparation.state}
      aria-labelledby="anim-hero-review-title"
    >
      <header className="anim-review-header">
        <h3 id="anim-hero-review-title">Hero review — key #{keyEntity.order}</h3>
        <span className="anim-review-status" data-anim-review-status={status.key}>{status.label}</span>
        {attempt.progress && (
          <span className="anim-review-progress" data-anim-review-progress title="Observed engine progress">
            {attempt.progress.value}/{attempt.progress.max}
          </span>
        )}
      </header>
      <p className="anim-review-meaning" data-anim-review-meaning>{status.meaning}</p>
      {/* The durable failure reason (the live review's #6) — the tween
          panel's contract: a FAILED attempt names its reason; a cancelled or
          interrupted one never does. */}
      {attempt.execution === 'failed' && attempt.failureReason !== undefined && (
        <p className="anim-note anim-review-failure" role="alert" data-anim-review-failure-reason>
          {attempt.failureReason}
        </p>
      )}
      {attempt.movementArc !== undefined && (
        <p className="anim-note" data-anim-hero-review-arc>Movement arc: {attempt.movementArc}</p>
      )}
      {candidate?.earlierRevision === true && (
        <p className="anim-note" role="status" data-anim-review-earlier>
          Generated from an earlier version of this document — it changed while this render ran.
        </p>
      )}

      {/* The candidate clip — the landed artifact through the real blob
          route; the same honest degradation as the tween panel. */}
      {candidate !== null && candidate.assetReference.relPath !== null ? (
        <video
          className="anim-review-clip"
          data-anim-review-clip
          controls
          preload="metadata"
          src={documentsApi.blobFileUrl(candidate.assetReference.relPath)}
          aria-label={`The landed hero clip (${candidate.frameCount} frames)`}
        />
      ) : candidate !== null ? (
        <p className="anim-review-meaning" data-anim-review-clip-opaque title={candidate.assetReference.assetId}>
          The landed clip&apos;s handle ({candidate.assetReference.assetId}) carries no readable path in this build.
        </p>
      ) : attempt.execution === 'ready' ? (
        <p className="anim-note" role="status" data-anim-review-settling>The landed candidate is arriving — the completion event is being read back.</p>
      ) : (
        !inFlight && <p className="anim-note" data-anim-review-no-candidate>No candidate landed for this attempt — a re-roll starts a fresh take; nothing else moved.</p>
      )}

      {/* The takes (re-roll alternatives, §8.2): switching the SUBJECT is a
          view act; the ACCEPTED marker follows the slot's durable selection.
          T10-M4: the fresh take carries the "new" chip — a sibling of the
          take button, never a child (both are buttons). */}
      {takes.length > 1 && (
        <div className="anim-review-takes" data-anim-review-takes role="group" aria-label="Hero takes for this key">
          {takes.map((take, index) => (
            <span key={take.attemptId} className="anim-take-wrap">
              <button
                type="button"
                className="anim-review-take"
                data-anim-review-take={take.attemptId}
                disabled={busy}
                title={acceptedFromThisTake !== null && attempt.attemptId === take.attemptId ? 'The accepted take — its frame is this key' : 'Review this take'}
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

      {/* The frame strip (§5.2): the clip's frames, the PROPOSAL marked, the
          ACCEPTED frame marked from document truth — clicking a frame IS the
          explicit acceptance. */}
      {readyToReview && (
        <div className="anim-review-frames-block">
          <p className="anim-review-frames-lede">
            Click the frame that becomes this key — the dashed frame is a suggestion; nothing is accepted until you click.
          </p>
          <div className="anim-review-frames" data-anim-hero-frames role="group" aria-label="Hero candidate frames">
            {Array.from({ length: candidate!.frameCount }, (_, frameIndex) => (
              <button
                key={frameIndex}
                type="button"
                className="anim-review-frame"
                data-anim-hero-frame={frameIndex}
                data-anim-frame-proposed={proposedFrame === frameIndex ? 'true' : 'false'}
                data-anim-frame-accepted={isAcceptedFrame(frameIndex) ? 'true' : 'false'}
                disabled={busy}
                aria-label={`Accept frame ${frameIndex} as this key${proposedFrame === frameIndex ? ' (the proposed frame)' : ''}`}
                onClick={() => { if (!isAcceptedFrame(frameIndex)) onAcceptFrame(frameIndex) }}
              >
                {frameIndex}
              </button>
            ))}
          </div>
          <p className="anim-review-selected" data-anim-hero-accepted-frame>
            {acceptedFromThisTake !== null
              ? <>This key: frame {acceptedFromThisTake} of this take — the explicit acceptance.</>
              : hasSelection
                ? <>This key&apos;s selection came from another take — accepting a frame here moves it explicitly.</>
                : <>No frame accepted yet — this key holds no selection until you choose.</>}
          </p>
        </div>
      )}

      {/* §11.4's preparation failure: the clip is PRESERVED, the explicit
          retry re-prepares without re-rendering (F3). */}
      {attempt.preparation.state === 'failed' && (
        <Refusal
          title="The proposed frame could not be prepared"
          reason={`The engine's record of this clip was unreadable past the bounded retries, so the proposed frame is not prepared. The clip itself is safe and landed — retrying preparation never re-renders.${attempt.preparation.error !== undefined ? ` Last error: ${attempt.preparation.error}` : ''}`}
          satisfy={{ label: 'Retry frame preparation', action: onRetryPreparation }}
        />
      )}

      <div className="anim-review-actions">
        <Button
          variant="primary" className="anim-btn"
          busy={busy}
          disabled={!hasSelection}
          data-anim-hero-open-span
          title={hasSelection
            ? 'Creates the tween span from this take\'s source key into this key — its fixed far reference — and opens the inspector'
            : 'Accept a frame first — the span into this key binds the accepted image as its far reference'}
          onClick={onOpenSpan}
        >
          Open the tween span into this key
        </Button>
        <Button
          variant="secondary" className="anim-btn"
          busy={busy}
          disabled={inFlight}
          data-anim-review-reroll
          title="A fresh take for this same key — an alternative alongside the others; it never replaces your acceptance"
          onClick={onReroll}
        >
          Generate another take
        </Button>
      </div>

      {/* The frozen caption (§8.1): what this attempt MEANT when it was
          submitted — later edits are the next draft, never its meaning. */}
      <details className="anim-caption" data-anim-review-caption>
        <summary>View the frozen caption</summary>
        <div className="anim-caption-body">
          <pre className="anim-caption-text" data-anim-review-caption-text>{attempt.caption}</pre>
          <p className="anim-note">
            Caption compiler <span data-anim-review-compiler>v{attempt.compilerVersion}</span>, frozen at submission — the current key and the full arc as submitted.
          </p>
        </div>
      </details>
    </section>
  )
}
