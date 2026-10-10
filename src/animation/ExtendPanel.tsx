/**
 * The extension lane's surfaces (Task 6, k2q0n9s — spec
 * 2026-10-08-animation-extension-lane-design.md §4 the Extend interaction):
 * TWO presentational components sharing one file the way ReviewPanel shares
 * TakeNewChip —
 *
 *   - ExtendPanel: what §4 names "before submission" for ONE landed take's
 *     extension — the overlap math in BOTH clocks (generated on the 17k+5
 *     grid vs delivered after the pinned head is trimmed), the carry preview
 *     (the pinned tail's frame range in SOURCE coordinates, plus the
 *     delivered-tail range through the one mapping, plus the prompt-time
 *     shift disclosure the compiled caption's TIME section freezes), the
 *     preflight verdicts inline (each a named pass or refusal, the
 *     identity-discontinuity ADVISORY among them), the window's motion
 *     draft, and the submission. §4's Retry lives here: a failed submission
 *     offers the SAME-key re-POST (§7.2.2's lost-response semantics, never a
 *     new take) — the panel holds the submission it minted the key for.
 *
 *   - WindowReview: the landed extension's review on the chain's window
 *     slot — the standing review contract (§7.3's five-word vocabulary, the
 *     candidate clip, the frozen caption, the preparation retry) plus the
 *     lane's own acts: the takes strip per window, the EXPLICIT per-slot
 *     selection (never implicit in landing), the lock, and §4's re-roll
 *     split — New alternative (an explicitly-changed seed; the frozen draft
 *     resubmitted byte-identically) and the Extend action on the subject
 *     take (extending an UNSELECTED alternative branches, exactly §4's
 *     rule).
 *
 * Props-only (P07): every connection lives in ./state.ts; the pure
 * derivations live in ./timelineModel.ts (node-tested).
 */
import { useState } from 'react'
import { Button } from '../ui/Button'
import { Chip, ChipGroup } from '../ui/Chip'
import { Field } from '../ui/Field'
import { Refusal } from '../ui/Refusal'
import { documentsApi } from '../canvas/api'
import { compileExtensionCaption } from '../../shared/animation/compiler'
import { ANIMATION_MEDIA, mediumChipId, mediumFromChipId, type AnimationDocumentBody, type MediumString, type WindowSlot } from '../../shared/animation/types'
import { IN_FLIGHT, REVIEW_STATUS } from './reviewStatus'
import { deriveExtendPreview, type ExtensionAttemptFacts } from './timelineModel'
import { extendGateReason, type ExtensionSubmission, type ExtensionOutcome } from './state'
import type { AttemptStateView } from './client'

/** The structural facts the derivations read off the view rows. */
const factsOf = (attempt: AttemptStateView): ExtensionAttemptFacts => ({
  attemptId: attempt.attemptId,
  targetId: attempt.targetId,
  execution: attempt.execution,
  ...(attempt.extension !== undefined ? { extension: attempt.extension } : {}),
  continuation: attempt.continuation,
  ...(attempt.modelIdentitiesStamped !== undefined ? { modelIdentitiesStamped: attempt.modelIdentitiesStamped } : {}),
  ...(attempt.referenceAssetIds !== undefined ? { referenceAssetIds: attempt.referenceAssetIds } : {}),
  candidate: attempt.candidate,
})

// ---------------------------------------------------------------------------
// ExtendPanel — §4's "before submission" surface
// ---------------------------------------------------------------------------

export type ExtendPanelProps = {
  /** The landed take whose carried tail the window conditions on (the
   *  caller gates it — the action's disable reason already named). */
  source: AttemptStateView
  body: AnimationDocumentBody
  attempts: ReadonlyArray<AttemptStateView>
  /** The active binding's medium — the draft's default. */
  bindingMedium: MediumString
  busy: boolean
  /** The deliberate Extend (the adapter resolves/mints the window, then
   *  POSTs with the panel's key). The failure arm carries the submission
   *  when the POST fired but never settled — the retryable shape. */
  onSubmit(draft: { targetLength: number; movement: string; preservation: string; overrides: { medium: MediumString; scene?: string }; anchors?: Array<{ reference: 'rolling-near' | 'fixed-far'; frame: number }> }, idempotencyKey: string): Promise<ExtensionOutcome>
  /** §4's Retry — the SAME key + identical inputs + the SAME window. */
  onRetrySubmission(submission: ExtensionSubmission): Promise<{ attemptId: string; created: boolean; windowSlotId: string } | null>
  onClose(): void
}

export function ExtendPanel({ source, body, attempts, bindingMedium, busy, onSubmit, onRetrySubmission, onClose }: ExtendPanelProps) {
  const [targetLength, setTargetLength] = useState(56)
  const [movement, setMovement] = useState('')
  const [preservation, setPreservation] = useState('')
  const [mediumOverride, setMediumOverride] = useState<MediumString | null>(null)
  const [scene, setScene] = useState('')
  const [anchorWanted, setAnchorWanted] = useState(false)
  const [anchorReference, setAnchorReference] = useState<'rolling-near' | 'fixed-far'>('rolling-near')
  const [anchorFrame, setAnchorFrame] = useState('30')
  /** §4's Retry truth: the submission whose response never settled — the
   *  panel minted its key, so the SAME key can ride the re-POST. */
  const [awaiting, setAwaiting] = useState<ExtensionSubmission | null>(null)

  const preview = deriveExtendPreview(body, attempts.map(factsOf), source.attemptId, targetLength, anchorWanted ? [{ reference: anchorReference, frame: Number.parseInt(anchorFrame, 10) }] : [])

  // The caption preview — exactly what submission freezes (the SpanInspector
  // doctrine): the shared compiler over the same context the route builds.
  // The route resolves the references from the ROOT SPAN's selected keys and
  // the window from the plan; the derivation hands both.
  const compiled = (() => {
    if (preview.references === null || preview.plan === null) return null
    try {
      return compileExtensionCaption({
        rollingReference: {
          assetReference: { assetId: preview.references.near.assetId, relPath: null, kind: 'image' },
          pose: { poseDescription: preview.references.near.poseDescription, facing: preview.references.near.facing },
        },
        farReference: {
          assetReference: { assetId: preview.references.far.assetId, relPath: null, kind: 'image' },
          pose: { poseDescription: preview.references.far.poseDescription, facing: preview.references.far.facing },
        },
        movementStep: movement,
        preservation,
        overrides: { medium: mediumOverride ?? bindingMedium, ...(scene.trim() !== '' ? { scene } : {}) },
        window: { sampledLength: targetLength, pinnedLength: preview.plan.headTrim, fps: body.settings.fps },
      })
    } catch {
      return null
    }
  })()

  const canSubmit = !busy && preview.ready && movement.trim() !== '' && preservation.trim() !== ''

  const submit = async () => {
    if (!canSubmit || awaiting !== null) return
    const draft = {
      targetLength,
      movement,
      preservation,
      overrides: { medium: mediumOverride ?? bindingMedium, ...(scene.trim() !== '' ? { scene } : {}) } as { medium: MediumString; scene?: string },
      ...(anchorWanted ? { anchors: [{ reference: anchorReference, frame: Number.parseInt(anchorFrame, 10) }] } : {}),
    }
    const idempotencyKey = `anim-ext-${source.attemptId.slice(0, 8)}-${crypto.randomUUID()}`
    const outcome = await onSubmit(draft, idempotencyKey)
    if (!outcome.ok && outcome.submission !== null) {
      // The POST fired but never settled — hold the record so the Retry
      // offers the SAME key against the SAME window (a fresh key would mint
      // a duplicate take: exactly §4's conflation). The named failure is
      // already on the shell's command-error surface.
      setAwaiting(outcome.submission)
    }
  }

  const retry = async () => {
    if (awaiting === null) return
    const outcome = await onRetrySubmission(awaiting)
    if (outcome !== null) setAwaiting(null)
  }

  const deliveredTail = preview.pinnedTail !== null && preview.pinnedTail.delivered !== null ? preview.pinnedTail.delivered : null

  const gate = extendGateReason(source)

  return (
    <section className="anim-extend" data-anim-extend data-anim-extend-source={source.attemptId} aria-labelledby="anim-extend-title">
      <header className="anim-review-header">
        <h3 id="anim-extend-title">Extend — new time from this take&apos;s carried tail</h3>
      </header>
      <p className="anim-review-meaning">
        One explicit window per submission — it pins this take&apos;s carried tail as never-denoised conditioning and generates past it. Nothing chains automatically; the landing joins the chain as a reviewable take.
      </p>
      {gate !== null && <Refusal title="This take cannot seed an extension" reason={gate} />}

      {/* §4's overlap math, in BOTH clocks — the plan derives through the
          shared continuationWindowPlan (the same arithmetic the route
          freezes), so what previews is what submits. */}
      <div className="anim-extend-math" data-anim-extend-math>
        <label className="anim-binding-label" htmlFor="anim-extend-length">Target window length (generated frames)</label>
        <input
          id="anim-extend-length"
          className="anim-inspector-input"
          data-anim-extend-length
          type="number"
          min={5}
          max={3600}
          value={targetLength}
          onChange={(event) => { setAwaiting(null); setTargetLength(Number.parseInt(event.target.value, 10) || 0) }}
        />
        {preview.clocks !== null ? (
          <p className="anim-note" data-anim-extend-clocks>
            Generated <strong data-anim-extend-generated>{preview.clocks.generated}</strong> frames on the 17k+5 grid · delivered <strong data-anim-extend-delivered>{preview.clocks.delivered}</strong> after the pinned head ({preview.plan?.headTrim} frames) is trimmed — the delivery re-covers the pinned tail and buys the rest as new time.
          </p>
        ) : (
          <p className="anim-inspector-error" role="alert" data-anim-extend-recipe-refusal>{preview.recipeProblem}</p>
        )}
        {preview.pinnedTail !== null && (
          <p className="anim-note" data-anim-extend-pinned-tail>
            Pinned tail: this take&apos;s frames {preview.pinnedTail.generated.start} up to {preview.pinnedTail.generated.end} — the half-open window [{preview.pinnedTail.generated.start}, {preview.pinnedTail.generated.end}), {preview.pinnedTail.generated.end - preview.pinnedTail.generated.start} frames in generated coordinates (the latent&apos;s own world){deliveredTail !== null && deliveredTail.start !== preview.pinnedTail.generated.start
              ? `; in delivered frames that is ${deliveredTail.start} up to ${deliveredTail.end} (the user&apos;s world, through the frozen d = g − trim mapping)`
              : ''}.
          </p>
        )}
        <p className="anim-note" data-anim-extend-time-shift>
          Prompt times address the SAMPLED window ({targetLength} frames at {body.settings.fps} fps) — the movement you author below is written against that clock, and delivery starts at sampled frame {preview.plan?.headTrim ?? 0}: the caption&apos;s TIME section freezes exactly this shift.
        </p>
      </div>

      {/* §4's preflight verdicts inline — each a named pass or refusal; the
          discontinuity advisory is named too but never refuses (Task 5's
          ruling b: the honest-residue surfacing). */}
      <ul className="anim-extend-verdicts" data-anim-extend-verdicts aria-label="Preflight verdicts">
        {preview.verdicts.map((verdict) => (
          <li key={verdict.name} className="anim-extend-verdict" data-anim-extend-verdict={verdict.name} data-anim-verdict-pass={verdict.pass ? 'true' : 'false'} data-anim-verdict-advisory={verdict.advisory === true ? 'true' : 'false'}>
            <strong>{verdict.name}: {verdict.pass ? (verdict.advisory === true ? 'advisory' : 'pass') : 'refusal'}</strong>
            <span>{verdict.detail}</span>
          </li>
        ))}
      </ul>
      {preview.referencesProblem !== null && <Refusal title="The window's identity references do not resolve" reason={preview.referencesProblem} />}

      {/* The window's own motion draft (§4: authored against the window's
          time base, compiled through the tween dialect). */}
      <div className="anim-inspector-fields">
        <Field label="Movement" htmlFor="anim-extend-movement" hint="The new window's action, written against the sampled window's clock — frozen verbatim into the caption's MOVEMENT line.">
          <textarea
            id="anim-extend-movement"
            className="anim-inspector-text"
            data-anim-extend-movement
            rows={3}
            value={movement}
            onChange={(event) => setMovement(event.target.value)}
          />
        </Field>
        <Field label="What stays fixed" htmlFor="anim-extend-preservation" hint="What must not drift through the join — it rides the caption's hold line.">
          <textarea
            id="anim-extend-preservation"
            className="anim-inspector-text"
            data-anim-extend-preservation
            rows={2}
            value={preservation}
            onChange={(event) => setPreservation(event.target.value)}
          />
        </Field>
        <Field label="Medium" htmlFor="anim-extend-medium" hint={`Inherited from the bound session — picking another chip overrides it for this window.`}>
          <ChipGroup
            id="anim-extend-medium"
            className="anim-mediums"
            data-anim-extend-medium
            exclusive
            aria-label="Medium"
            value={mediumChipId(mediumOverride ?? bindingMedium)}
            onChange={(next) => {
              const picked = mediumFromChipId(next as string)
              setMediumOverride(picked === null || picked === bindingMedium ? null : picked)
            }}
          >
            {ANIMATION_MEDIA.map((entry) => (
              <Chip key={entry} id={mediumChipId(entry)} variant="radio" className="anim-chip" disabled={busy}>{entry}</Chip>
            ))}
          </ChipGroup>
        </Field>
        <div className="anim-inspector-overrides">
          <Field label="Scene override" htmlFor="anim-extend-scene" hint="Optional framing/context — empty omits the clause.">
            <input id="anim-extend-scene" className="anim-inspector-input" data-anim-extend-scene type="text" value={scene} onChange={(event) => setScene(event.target.value)} />
          </Field>
        </div>
        <Field label="Reference anchor" htmlFor="anim-extend-anchor-frame" hint="Pin one in-force reference image at a sampled frame of the new window. An anchor inside the pinned head would be silently dropped by the node — the preflight refuses it by name instead.">
          <div className="anim-extend-anchor">
            <Chip
              variant="toggle"
              className="anim-chip"
              selected={anchorWanted}
              disabled={busy}
              data-anim-extend-anchor-toggle
              onClick={() => setAnchorWanted((wanted) => !wanted)}
            >
              {anchorWanted ? 'anchor set' : 'no anchor'}
            </Chip>
            {anchorWanted && (
              <>
                <ChipGroup
                  id="anim-extend-anchor-role"
                  className="anim-mediums"
                  data-anim-extend-anchor-role
                  exclusive
                  aria-label="The anchor's reference"
                  value={`anim-anchor-${anchorReference}`}
                  onChange={(next) => { setAnchorReference((next as string) === 'anim-anchor-fixed-far' ? 'fixed-far' : 'rolling-near') }}
                >
                  <Chip id="anim-anchor-rolling-near" variant="radio" className="anim-chip">near</Chip>
                  <Chip id="anim-anchor-fixed-far" variant="radio" className="anim-chip">far</Chip>
                </ChipGroup>
                <input
                  id="anim-extend-anchor-frame"
                  className="anim-editorial-num"
                  data-anim-extend-anchor-frame
                  type="number"
                  min={0}
                  max={targetLength - 1}
                  value={anchorFrame}
                  onChange={(event) => setAnchorFrame(event.target.value)}
                />
              </>
            )}
          </div>
        </Field>
      </div>

      {/* The caption preview: the TIME section IS the shift disclosure. */}
      <details className="anim-caption" data-anim-extend-caption>
        <summary>View caption{compiled !== null && compiled.hints.length > 0 ? ` — ${compiled.hints.length} advisory note${compiled.hints.length === 1 ? '' : 's'}` : ''}</summary>
        <div className="anim-caption-body">
          {compiled === null
            ? <p className="anim-note">The caption compiles once the references resolve and the window satisfies the recipe.</p>
            : (
              <>
                <pre className="anim-caption-text" data-anim-extend-caption-text>{compiled.caption}</pre>
                {compiled.hints.length > 0 ? (
                  <ul className="anim-caption-hints" aria-label="Advisory caption hints">
                    {compiled.hints.map((hint, index) => <li key={index} className="anim-caption-hint" data-anim-caption-hint={hint.kind}>{hint.message}</li>)}
                  </ul>
                ) : <p className="anim-note" data-anim-caption-nohints>No advisory hints — the compiler advises, it never rewrites.</p>}
                <p className="anim-note">Caption compiler <span data-anim-extend-caption-compiler>v{compiled.compilerVersion}</span> — the preview and the submission freeze the same text.</p>
              </>
              )}
        </div>
      </details>

      {/* §4's Retry: the SAME key + identical inputs (§7.2.2 — a lost
          response, never a new take). A fresh key here would mint a
          duplicate window take. */}
      {awaiting !== null && (
        <Refusal
          title="The submission did not settle"
          reason="The Extend request never answered — the window may exist. Retrying re-issues the IDENTICAL request (the same idempotency key): the server answers the row it already gated instead of minting a duplicate take."
          satisfy={{ label: 'Retry the identical submission', action: () => void retry() }}
        />
      )}

      <div className="anim-inspector-submit">
        <Button variant="primary" className="anim-btn" busy={busy} disabled={!canSubmit || awaiting !== null} onClick={() => void submit()} data-anim-extend-submit>
          Extend this take
        </Button>
        <Button variant="secondary" className="anim-btn" busy={busy} disabled={busy} onClick={onClose} data-anim-extend-close>
          Close
        </Button>
        <span className="anim-note">One window per submission — it lands on the chain as a take you review and select.</span>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// WindowReview — the landed extension's review on the chain's window slot
// ---------------------------------------------------------------------------

export type WindowReviewProps = {
  /** The take under review (the window's selected candidate, else the
   *  newest — the reviewer's explicit override lands here too). */
  attempt: AttemptStateView
  /** The window slot the takes belong to (its own selection truth). */
  window: WindowSlot
  /** The 1-based window position in its chain. */
  windowIndex: number
  takes: Array<{ attemptId: string }>
  busy: boolean
  /** Switches the review SUBJECT (view state, never a document write). */
  onSelectTake(attemptId: string): void
  /** The slot's EXPLICIT selection (§4 — lock-guarded; a genuine no-op on
   *  the already-selected take). */
  onSelectCandidate(attemptId: string): void
  onToggleLock(locked: boolean): void
  /** Opens the Extend flow with this take as the source (extending an
   *  UNSELECTED alternative branches — §4's rule). */
  onExtend(): void
  /** §4's New alternative — an explicitly-changed seed, the frozen draft
   *  resubmitted byte-identically. */
  onReroll(): void
  onRetryPreparation(): void
}

export function WindowReview({ attempt, window: slot, windowIndex, takes, busy, onSelectTake, onSelectCandidate, onToggleLock, onExtend, onReroll, onRetryPreparation }: WindowReviewProps) {
  const status = REVIEW_STATUS[attempt.execution]
  const candidate = attempt.candidate
  const inFlight = IN_FLIGHT.has(attempt.execution)
  const selectionIsThisTake = slot.selectedCandidateId === attempt.attemptId
  const gate = extendGateReason(attempt)

  return (
    <section
      className="anim-review"
      data-anim-window-review
      data-anim-review-attempt={attempt.attemptId}
      data-anim-review-state={attempt.execution}
      data-anim-review-preparation={attempt.preparation.state}
      data-anim-window={slot.id}
      aria-labelledby="anim-window-review-title"
    >
      <header className="anim-review-header">
        <h3 id="anim-window-review-title">Extension review — window {windowIndex} of the chain</h3>
        <span className="anim-review-status" data-anim-review-status={status.key}>{status.label}</span>
        {attempt.progress && (
          <span className="anim-review-progress" data-anim-review-progress title="Observed engine progress">
            {attempt.progress.value}/{attempt.progress.max}
          </span>
        )}
        <Chip
          variant="toggle"
          className="anim-chip"
          selected={slot.lock}
          disabled={busy}
          data-anim-window-lock
          title={slot.lock ? 'Locked — the server refuses selection changes until it is unlocked' : 'Unlocked'}
          onClick={() => onToggleLock(!slot.lock)}
        >
          {slot.lock ? 'locked' : 'unlocked'}
        </Chip>
      </header>
      <p className="anim-review-meaning" data-anim-review-meaning>{status.meaning}</p>
      {attempt.execution === 'failed' && attempt.failureReason !== undefined && (
        <p className="anim-note anim-review-failure" role="alert" data-anim-review-failure-reason>{attempt.failureReason}</p>
      )}
      {slot.stale && (
        <p className="anim-note" role="status" data-anim-window-stale>
          This window is stale ({slot.staleReasons.join(', ')}) — the takes are preserved; a NEW submission into the window re-derives from current truth.
        </p>
      )}
      {candidate?.earlierRevision === true && (
        <p className="anim-note" role="status" data-anim-review-earlier>
          Generated from an earlier version of this document — it changed while this render ran.
        </p>
      )}
      {attempt.extension !== undefined && (
        <p className="anim-note" data-anim-window-geometry>
          Window geometry frozen at submission: {attempt.extension.targetLength} generated · {candidate?.frameCount ?? '—'} delivered{attempt.extension.headTrim !== undefined
            ? ` · pinned head ${attempt.extension.headTrim} frames — delivered frame 0 is sampled frame ${attempt.extension.headTrim}`
            : ''}.
        </p>
      )}

      {candidate !== null && candidate.assetReference.relPath !== null ? (
        <video
          className="anim-review-clip"
          data-anim-review-clip
          controls
          preload="metadata"
          src={documentsApi.blobFileUrl(candidate.assetReference.relPath)}
          aria-label={`The landed extension clip (${candidate.frameCount} frames)`}
        />
      ) : candidate !== null ? (
        <p className="anim-review-meaning" data-anim-review-clip-opaque title={candidate.assetReference.assetId}>
          The landed clip&apos;s handle ({candidate.assetReference.assetId}) carries no readable path in this build.
        </p>
      ) : attempt.execution === 'ready' ? (
        <p className="anim-note" role="status" data-anim-review-settling>The landed candidate is arriving — the completion event is being read back.</p>
      ) : (
        !inFlight && <p className="anim-note" data-anim-review-no-candidate>No candidate landed for this attempt — a new alternative starts a fresh take; nothing else moved.</p>
      )}

      {/* The takes strip per window (§4): switching the SUBJECT is a view
          act; the SELECTED marker follows the slot's own selection truth. */}
      {takes.length > 1 && (
        <div className="anim-review-takes" data-anim-review-takes role="group" aria-label="Takes for this window">
          {takes.map((take, index) => (
            <button
              key={take.attemptId}
              type="button"
              className="anim-review-take"
              data-anim-review-take={take.attemptId}
              data-anim-take-selected={slot.selectedCandidateId === take.attemptId ? 'true' : 'false'}
              disabled={busy}
              title={slot.selectedCandidateId === take.attemptId ? 'The window\'s selected take — the assembled preview follows it' : 'Review this take (the window\'s selection stays until you choose)'}
              onClick={() => { if (take.attemptId !== attempt.attemptId) onSelectTake(take.attemptId) }}
            >
              take {index + 1}
            </button>
          ))}
        </div>
      )}

      <div className="anim-review-actions">
        {/* The slot's EXPLICIT selection — never implicit in landing (§4). */}
        <Button
          variant="primary" className="anim-btn"
          busy={busy}
          disabled={busy || selectionIsThisTake || slot.lock || attempt.execution !== 'ready' || candidate === null}
          data-anim-window-select
          title={slot.lock
            ? 'This window is locked — unlock it before changing its selection'
            : selectionIsThisTake
              ? 'This take IS the window\'s selection — the assembled preview follows it'
              : 'Make this take the window\'s selection — the assembled preview and later windows follow it'}
          onClick={() => onSelectCandidate(attempt.attemptId)}
        >
          {selectionIsThisTake ? 'The selected take' : 'Select this take'}
        </Button>
        <Button
          variant="secondary" className="anim-btn"
          busy={busy}
          disabled={busy || gate !== null || inFlight}
          data-anim-window-extend
          title={gate ?? (slot.selectedCandidateId === attempt.attemptId
            ? 'Extend this take — the chain grows a new window conditioned on its tail'
            : 'Extend this take — an UNSELECTED alternative roots a new branch chain (§4)')}
          onClick={onExtend}
        >
          Extend this take
        </Button>
        {/* §4's New alternative — named as such: the seed change is explicit. */}
        <Button
          variant="secondary" className="anim-btn"
          busy={busy}
          disabled={busy || inFlight}
          data-anim-window-reroll
          title="A NEW ALTERNATIVE for this window — an explicitly changed seed; the frozen draft resubmitted byte-identically. Never the lost-response retry."
          onClick={onReroll}
        >
          New alternative take
        </Button>
      </div>

      {attempt.preparation.state === 'failed' && (
        <Refusal
          title="The proposed frame could not be prepared"
          reason={`The engine's record of this clip was unreadable past the bounded retries, so the proposed reference frame is not prepared. The clip itself is safe and landed — retrying preparation never re-renders.${attempt.preparation.error !== undefined ? ` Last error: ${attempt.preparation.error}` : ''}`}
          satisfy={{ label: 'Retry frame preparation', action: onRetryPreparation }}
        />
      )}

      <details className="anim-caption" data-anim-review-caption>
        <summary>View the frozen caption</summary>
        <div className="anim-caption-body">
          <pre className="anim-caption-text" data-anim-review-caption-text>{attempt.caption}</pre>
          <p className="anim-note">
            Caption compiler <span data-anim-review-compiler>v{attempt.compilerVersion}</span>, frozen at submission — the TIME section discloses the window&apos;s prompt-time shift.
          </p>
        </div>
      </details>
    </section>
  )
}
