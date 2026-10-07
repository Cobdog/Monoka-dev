/**
 * SequenceReview — the sequence landing's review surface (task 12, k2q0n9s,
 * spec 2026-10-06-animation-authoring-module-design.md §5.2 the sequence
 * sourcing path, §7.3 the status vocabulary, §8.2 candidate landing, §11.2
 * "sequence attempts capture a selected key window"): ONE sequence attempt
 * under review, mounted for the key its window STARTS from. The ReviewPanel
 * CONTRACT carried to the sequence lane:
 *
 *   - §7.3's FIVE-WORD status vocabulary from the ONE mapping table
 *     (reviewStatus.ts — every status-rendering surface renders the same
 *     word);
 *   - the FROZEN WINDOW names what the attempt meant (§8.1): the start key
 *     (the attempt's target) and the end key (the frozen draft's) — the
 *     review states the pair, never the current picker state;
 *   - a landing changes NO document truth by itself (§8.2): the clip surfaces
 *     through editorial selection and the endpoint keys' selections are
 *     exactly what they were — the panel renders the landed clip and the
 *     takes, it writes nothing;
 *   - a re-roll is a fresh take for the SAME window — the frozen window
 *     draft (endpoint keys, beats, preservation, overrides) resubmitted with
 *     only the seed varying, landing as a retained alternative;
 *   - an outdated result keeps its provenance: earlierRevision renders the
 *     §8.2 "generated from an earlier version" note;
 *   - a failed preparation keeps the clip (§11.4): the Refusal offers the
 *     explicit retry, which never re-renders.
 *
 * No frame strip mounts here by design: a window render's explicit selection
 * IS the window (frozen at submission); choosing the clip portions that
 * contribute to the assembled sequence is the editorial timing surface
 * (spec §9), a document decision with its own command.
 *
 * Props-only (P07): every connection lives in ./state.ts.
 */
import { Button } from '../ui/Button'
import { Refusal } from '../ui/Refusal'
import { documentsApi } from '../canvas/api'
import { IN_FLIGHT, REVIEW_STATUS } from './reviewStatus'
import type { TimelineKey } from './timelineModel'
import type { AttemptStateView } from './client'

export type SequenceReviewProps = {
  /** The attempt under review (the document view's row — live through the
   *  fabric's status patches and the durable re-reads). */
  attempt: AttemptStateView
  /** The key slot this window starts from (the attempt's target). */
  keyEntity: TimelineKey
  /** The window's END key resolved from the document (null when the frozen
   *  end key no longer resolves — named honestly, never guessed). */
  endKey: TimelineKey | null
  /** This window's landed takes in landing order (re-rolls append). */
  takes: Array<{ attemptId: string }>
  /** Task 12's Important-1 (fixed in task 13): the start key's DISTINCT
   *  windows — the chip group that reaches an OLDER window's takes (before,
   *  only the newest window's strip was reachable). Empty = one window. */
  windows: Array<{ windowEndKeyId: string; label: string }>
  /** The chips mark the SUBJECT's window's end key. */
  activeWindowEndKeyId: string | null
  busy: boolean
  /** Switches the review SUBJECT to another take (view state, never a
   *  document write). */
  onSelectTake(attemptId: string): void
  /** Switches the review to another WINDOW of this start key (view state —
   *  the subject becomes that window's newest take). */
  onSelectWindow(windowEndKeyId: string): void
  /** The re-roll action — a fresh take for this same window. */
  onReroll(): void
  /** §11.4's explicit preparation retry — re-prepares the proposed frame
   *  WITHOUT re-rendering. */
  onRetryPreparation(): void
}

export function SequenceReview({ attempt, keyEntity, endKey, takes, windows, activeWindowEndKeyId, busy, onSelectTake, onSelectWindow, onReroll, onRetryPreparation }: SequenceReviewProps) {
  const status = REVIEW_STATUS[attempt.execution]
  const candidate = attempt.candidate
  const inFlight = IN_FLIGHT.has(attempt.execution)

  return (
    <section
      className="anim-review"
      data-anim-seq-review
      data-anim-review-attempt={attempt.attemptId}
      data-anim-review-state={attempt.execution}
      data-anim-review-preparation={attempt.preparation.state}
      aria-labelledby="anim-seq-review-title"
    >
      <header className="anim-review-header">
        <h3 id="anim-seq-review-title">Sequence review — the window from key #{keyEntity.order}</h3>
        <span className="anim-review-status" data-anim-review-status={status.key}>{status.label}</span>
        {attempt.progress && (
          <span className="anim-review-progress" data-anim-review-progress title="Observed engine progress — no fixed countdowns (§7.3)">
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
      {/* The frozen window (§8.1): the pair this render meant — the start is
          the attempt's target, the end the frozen draft's own pick. */}
      <p className="anim-note" data-anim-seq-review-window>
        Window: key #{keyEntity.order} → {endKey !== null ? `key #${endKey.order}` : `its frozen end (${attempt.windowEndKeyId ?? 'unknown'}) no longer resolves in this document`} — the two references the caption aligned.
      </p>
      {attempt.sequenceActions !== undefined && attempt.sequenceActions.length > 0 && (
        <p className="anim-note" data-anim-seq-review-actions>{attempt.sequenceActions.length} action {attempt.sequenceActions.length === 1 ? 'beat' : 'beats'} in order — the first: “{attempt.sequenceActions[0]}”.</p>
      )}
      {candidate?.earlierRevision === true && (
        <p className="anim-note" role="status" data-anim-review-earlier>
          Generated from an earlier version of this document — it changed while this render ran; the result keeps its original provenance (§8.2).
        </p>
      )}

      {/* The candidate clip — the landed artifact through the real blob
          route; the same honest degradation as the other review panels. */}
      {candidate !== null && candidate.assetReference.relPath !== null ? (
        <video
          className="anim-review-clip"
          data-anim-review-clip
          controls
          preload="metadata"
          src={documentsApi.blobFileUrl(candidate.assetReference.relPath)}
          aria-label={`The landed window clip (${candidate.frameCount} frames)`}
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

      {/* Task 12's Important-1 (fixed in task 13): the start key's DISTINCT
          windows as chips — an older window's takes stay reachable from the
          review surface (before, only the newest window ever showed). A view
          act; the subject becomes the picked window's newest take. */}
      {windows.length > 1 && (
        <div className="anim-review-takes" data-anim-seq-windows role="group" aria-label="Windows from this key">
          {windows.map((window) => (
            <button
              key={window.windowEndKeyId}
              type="button"
              className="anim-review-take"
              data-anim-seq-window={window.windowEndKeyId}
              data-anim-seq-window-active={window.windowEndKeyId === activeWindowEndKeyId ? 'true' : 'false'}
              disabled={busy}
              title={window.windowEndKeyId === activeWindowEndKeyId ? 'The window under review' : 'Review this window (its own takes)'}
              onClick={() => { if (window.windowEndKeyId !== activeWindowEndKeyId) onSelectWindow(window.windowEndKeyId) }}
            >
              {window.label}
            </button>
          ))}
        </div>
      )}

      {/* The takes (re-roll alternatives, §8.2): switching the SUBJECT is a
          view act. No selected marker exists in this lane — a window render
          selects nothing; its takes are retained alternatives. */}
      {takes.length > 1 && (
        <div className="anim-review-takes" data-anim-review-takes role="group" aria-label="Takes for this window">
          {takes.map((take, index) => (
            <button
              key={take.attemptId}
              type="button"
              className="anim-review-take"
              data-anim-review-take={take.attemptId}
              disabled={busy}
              title="Review this take (the takes are retained alternatives — nothing is replaced)"
              onClick={() => { if (take.attemptId !== attempt.attemptId) onSelectTake(take.attemptId) }}
            >
              take {index + 1}
            </button>
          ))}
        </div>
      )}
      <p className="anim-note" data-anim-seq-review-note>
        Each take is retained as an alternative — a window render changes no selection (§8.2). Choosing the portions that contribute to the assembled sequence is the editorial timing surface (§9).
      </p>

      {/* §11.4's preparation failure: the clip is PRESERVED, the explicit
          retry re-prepares without re-rendering (F3). */}
      {attempt.preparation.state === 'failed' && (
        <Refusal
          title="The proposed frame could not be prepared"
          reason={`The engine's record of this clip was unreadable past the bounded retries, so the proposed reference frame is not prepared. The clip itself is safe and landed — retrying preparation never re-renders.${attempt.preparation.error !== undefined ? ` Last error: ${attempt.preparation.error}` : ''}`}
          satisfy={{ label: 'Retry frame preparation', action: onRetryPreparation }}
        />
      )}

      <div className="anim-review-actions">
        <Button
          variant="secondary"
          busy={busy}
          disabled={inFlight}
          data-anim-review-reroll
          title="A fresh take for this same window — the frozen window draft resubmitted; an alternative alongside the others"
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
            Frozen at submission with the shared caption compiler <span data-anim-review-compiler>v{attempt.compilerVersion}</span> — the sequence template aligns the two window references, orders the action beats, and closes on the preservation line (§6.2).
          </p>
        </div>
      </details>
    </section>
  )
}
