/**
 * SequencePanel — the animation module's sequence authoring surface (task 12,
 * k2q0n9s, spec 2026-10-06-animation-authoring-module-design.md §5.2 the
 * sequence sourcing path, §6.2 the sequence caption template, §11.2 "sequence
 * attempts capture a selected key window"): selecting a key on the timeline
 * opens this panel beside the hero panel — the key is the window's START, and
 * the authoring act is picking the window's END.
 *
 * The §5.2 contract this panel renders, never breaks:
 *   - TWO references: the window's first drawing (this key's SELECTED image)
 *     and the window's OWN NATURAL END (an explicitly picked other key's
 *     selected image) — pose follows the image on both (§5.1). The pick is
 *     the explicit selection this tool owns: nothing is inferred, no span is
 *     consulted, and the same key twice is refused (the server names it).
 *   - NOT teaching a new mapping — SURFACING held animation already in the
 *     base distribution: the caption aligns the two references, orders the
 *     action beats, and states the preservation axes; "animated on twos" and
 *     the alignment phrasing are the compiler's fixed dialect.
 *   - One render per WINDOW at a time: an in-flight take of this exact
 *     start+end pair disables the action and surfaces its §7.3 status.
 *
 * The overrides + the collapsed "View caption" preview mirror the hero panel
 * and the span inspector (§6.3): the shared compiler runs in this browser,
 * hints advise without rewriting, and the frozen caption is the previewed
 * text.
 *
 * Props-only (P07): every connection lives in ./state.ts; the beats,
 * preservation, and window-end pick are component-local view state (a
 * sequence draft owns no span — §8.1 freezes it into the attempt at
 * submission, the only durable home it has).
 */
import { useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { Chip, ChipGroup } from '../ui/Chip'
import { Field } from '../ui/Field'
import { Refusal } from '../ui/Refusal'
import { documentsApi } from '../canvas/api'
import { compileSequenceCaption, type CompiledCaption, type SessionOverrideInput } from '../../shared/animation/compiler'
import {
  ANIMATION_MEDIA,
  mediumChipId,
  type BindingVersion,
  type FacingTerm,
  type MediumString,
} from '../../shared/animation/types'
import { FacingPicker } from './SpanInspector'
import type { TimelineKey } from './timelineModel'
import type { AttemptStateView } from './client'
import { deriveSequencePreview } from './state'

/** Medium chip keys for THIS surface (the heroMediumChipId rule): the kit's
 *  exclusive ChipGroup keys a member by its id AND renders it as the DOM id,
 *  and the inspector + hero panel already claim their forms — the sequence
 *  prefix keeps every DOM id unique (task 9's Minor-5 class). */
function sequenceMediumChipId(medium: MediumString): string {
  return `anim-seq-${mediumChipId(medium)}`
}

function sequenceMediumFromChipId(chipId: string): MediumString | null {
  for (const medium of ANIMATION_MEDIA) {
    if (sequenceMediumChipId(medium) === chipId) return medium
  }
  return null
}

/** One window endpoint's image, or the honest placeholder (the KeyImage
 *  idiom). */
function WindowFrameImage({ relPath, assetId, alt }: { relPath: string | null; assetId: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (relPath === null || failed) {
    return <div className="anim-frame-placeholder" data-anim-frame-placeholder title={assetId}>{assetId}</div>
  }
  return <img className="anim-frame-img" src={documentsApi.blobFileUrl(relPath)} alt={alt} onError={() => setFailed(true)} />
}

export type SequencePanelSubmitDraft = { orderedActions: string[]; preservation: string; overrides: SessionOverrideInput }

export type SequencePanelProps = {
  /** The selected key — the window's START (the first drawing). */
  keyEntity: TimelineKey
  /** The timeline's keys in order — the window-end picker's pool (the start
   *  key itself is excluded by construction). */
  keys: TimelineKey[]
  /** The active binding — the inherited medium's source. */
  binding: BindingVersion
  /** The sequence attempts sourcing this key that are still in flight — the
   *  panel matches its chosen end against their frozen windows. */
  inFlightAttempts: AttemptStateView[]
  /** A facing correction for either endpoint key's selected image (§5.1:
   *  facing follows the candidate — the clone-and-select command). */
  onFacingChange(keyId: string, facing: FacingTerm | null): Promise<boolean>
  onSubmit(windowStartKeyId: string, windowEndKeyId: string, draft: SequencePanelSubmitDraft): Promise<{ attemptId: string } | null>
  busy: boolean
}

export function SequencePanel({ keyEntity, keys, binding, inFlightAttempts, onFacingChange, onSubmit, busy }: SequencePanelProps) {
  // The authoring draft — component-local view state (no durable home
  // pre-submit; the shell keys the mount by key id, so switching keys starts
  // fresh). The window end is the explicit pick this tool owns.
  const [endKeyId, setEndKeyId] = useState<string | null>(null)
  const [actionsText, setActionsText] = useState('')
  const [preservation, setPreservation] = useState('')
  // Submit-scoped overrides: a null medium inherits the bound session's.
  const [mediumOverride, setMediumOverride] = useState<MediumString | null>(null)
  const [scene, setScene] = useState('')
  const [cameraDescription, setCameraDescription] = useState('')
  const [cameraReason, setCameraReason] = useState('')

  /** The ordered beats — one per line, in order; the line order IS the beat
   *  order the caption joins ('; ') and the route freezes verbatim. */
  const orderedActions = useMemo(
    () => actionsText.split('\n').map((line) => line.trim()).filter((line) => line !== ''),
    [actionsText],
  )

  const overrides: SessionOverrideInput = useMemo(() => {
    const resolved: SessionOverrideInput = { medium: mediumOverride ?? binding.medium }
    if (scene.trim() !== '') resolved.scene = scene
    if (cameraDescription.trim() !== '') resolved.camera = { description: cameraDescription, reason: cameraReason }
    return resolved
  }, [mediumOverride, binding.medium, scene, cameraDescription, cameraReason])

  const preview = useMemo(
    () => deriveSequencePreview(keys, keyEntity.id, endKeyId),
    [keys, keyEntity.id, endKeyId],
  )

  const compiled = useMemo<{ ok: true; result: CompiledCaption } | { ok: false; error: string } | null>(() => {
    if (!preview.windowStart.ok || !preview.windowEnd.ok) return null
    try {
      return {
        ok: true,
        result: compileSequenceCaption({
          windowStart: { assetReference: preview.windowStart.assetReference, pose: preview.windowStart.pose },
          windowEnd: { assetReference: preview.windowEnd.assetReference, pose: preview.windowEnd.pose },
          orderedActions,
          preservation,
          overrides,
        }),
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }, [preview.windowStart, preview.windowEnd, orderedActions, preservation, overrides])

  // The in-flight guard keys off the exact window (start + the chosen end) —
  // two DIFFERENT windows from one start are independent renders.
  const inFlightAttempt = endKeyId === null
    ? null
    : inFlightAttempts.find((entry) => entry.windowEndKeyId === endKeyId) ?? null

  const start = preview.windowStart
  const end = preview.windowEnd
  const endKey = useMemo(
    () => (endKeyId === null ? null : keys.find((entry) => entry.id === endKeyId) ?? null),
    [keys, endKeyId],
  )
  const endChoices = keys.filter((entry) => entry.id !== keyEntity.id)
  const effectiveMedium = mediumOverride ?? binding.medium

  const canSubmit = !busy
    && inFlightAttempt === null
    && endKeyId !== null
    && orderedActions.length > 0
    && preservation.trim() !== ''
    && start.ok
    && end.ok
    && compiled !== null && compiled.ok

  const submit = async () => {
    if (!canSubmit || endKeyId === null) return
    await onSubmit(keyEntity.id, endKeyId, { orderedActions, preservation, overrides })
  }

  return (
    <section className="anim-inspector" data-anim-seq-panel data-anim-seq-panel-key={keyEntity.id} aria-labelledby="anim-seq-title">
      <h3 id="anim-seq-title">Sequence — surface the held window from key #{keyEntity.order}</h3>
      <p className="anim-inspector-lede">
        Pick the window&apos;s end key and write the beats in order — the render returns one held clip for review.
      </p>

      {!start.ok && (
        <Refusal title="This key cannot open a window" reason={`${start.problem} The sequence caption needs both window endpoints' selected poses.`} />
      )}
      {endKeyId !== null && !end.ok && (
        <Refusal title="The chosen window end is not resolvable" reason={`${end.problem} Pick another key, or give that key a selected image first.`} />
      )}

      <div className="anim-inspector-frames">
        {/* The window START — this key's selected image (§5.1). */}
        <article className="anim-frame-card" data-anim-seq-start>
          <header>
            <strong>Window start — the first drawing</strong>
            <span className="anim-frame-source">key #{keyEntity.order}&apos;s selected image ({keyEntity.candidate?.origin ?? 'no selection'})</span>
          </header>
          {start.ok ? (
            <>
              <WindowFrameImage relPath={start.assetReference.relPath} assetId={start.assetReference.assetId} alt="The window start image" />
              {start.pose.poseDescription !== null ? (
                <p className="anim-frame-pose" data-anim-seq-start-pose>{start.pose.poseDescription}</p>
              ) : (
                <p className="anim-frame-pose anim-frame-pose-empty" data-anim-frame-pose-empty>This image carries no pose description yet.</p>
              )}
              <FacingPicker keyEntity={keyEntity} busy={busy} id="anim-seq-facing-start" group="seq-start" onChange={(facing) => { void onFacingChange(keyEntity.id, facing) }} />
            </>
          ) : (
            <p className="anim-frame-pose anim-frame-pose-empty">{start.problem}</p>
          )}
        </article>

        {/* The window END — the explicitly picked other key (§5.2: its own
            natural end, never an inferred one). */}
        <article className="anim-frame-card" data-anim-seq-end-card>
          <header>
            <strong>Window end — its own natural end</strong>
            <span className="anim-frame-source">{endKey !== null ? `key #${endKey.order}'s selected image (${endKey.candidate?.origin ?? 'no selection'})` : 'no key picked yet — the pick below is yours'}</span>
          </header>
          {end.ok ? (
            <>
              <WindowFrameImage relPath={end.assetReference.relPath} assetId={end.assetReference.assetId} alt="The window end image" />
              {end.pose.poseDescription !== null ? (
                <p className="anim-frame-pose" data-anim-seq-end-pose>{end.pose.poseDescription}</p>
              ) : (
                <p className="anim-frame-pose anim-frame-pose-empty" data-anim-frame-pose-empty>This image carries no pose description yet.</p>
              )}
              {endKey !== null && (
                <FacingPicker keyEntity={endKey} busy={busy} id="anim-seq-facing-end" group="seq-end" onChange={(facing) => { void onFacingChange(endKey.id, facing) }} />
              )}
            </>
          ) : (
            <p className="anim-frame-pose anim-frame-pose-empty">{end.problem}</p>
          )}
          <Field
            label="The window's end key"
            htmlFor="anim-seq-end"
            hint="The explicit pick — the key whose selected drawing closes the window. A key with no selected image cannot bound a window; the window end must differ from the start."
          >
            {endChoices.length === 0 ? (
              <p className="anim-note" data-anim-seq-end-empty>No other keys on the timeline yet — import, or generate the next key with the hero panel above.</p>
            ) : (
              <ChipGroup
                id="anim-seq-end"
                className="anim-mediums"
                data-anim-seq-end
                exclusive
                aria-label="The window end key"
                value={endKeyId === null ? null : `anim-seq-end-${endKeyId}`}
                onChange={(next) => {
                  const picked = next as string
                  setEndKeyId(picked.startsWith('anim-seq-end-') ? picked.slice('anim-seq-end-'.length) : null)
                }}
              >
                {endChoices.map((entry) => (
                  <Chip
                    key={entry.id}
                    id={`anim-seq-end-${entry.id}`}
                    variant="radio"
                    className="anim-chip"
                    disabled={busy || entry.candidate === null}
                    data-anim-seq-end-key={entry.id}
                    title={entry.candidate === null ? `Key #${entry.order} has no selected image — it cannot bound a window yet.` : `Key #${entry.order}'s selected drawing closes the window`}
                  >
                    key #{entry.order}
                  </Chip>
                ))}
              </ChipGroup>
            )}
          </Field>
        </article>
      </div>

      <div className="anim-inspector-fields">
        <Field
          label="Ordered actions"
          htmlFor="anim-seq-actions"
          hint="One beat per line, in order — each rides verbatim into the caption. Positive phrasing: negation is flagged, never rewritten."
        >
          <textarea
            id="anim-seq-actions"
            className="anim-inspector-text"
            data-anim-seq-actions
            rows={4}
            value={actionsText}
            onChange={(event) => setActionsText(event.target.value)}
          />
        </Field>
        <Field
          label="What stays fixed"
          htmlFor="anim-seq-preservation"
          hint="The no-drift axes and the rhythm — carried verbatim, closing the caption."
        >
          <textarea
            id="anim-seq-preservation"
            className="anim-inspector-text"
            data-anim-seq-preservation
            rows={2}
            value={preservation}
            onChange={(event) => setPreservation(event.target.value)}
          />
        </Field>

        <Field
          label="Medium"
          htmlFor="anim-seq-medium"
          hint={mediumOverride === null
            ? `Inherited from the bound session — picking another chip overrides it for this window's render.`
            : 'An override for this window\'s render — it freezes with the attempt.'}
        >
          <ChipGroup
            id="anim-seq-medium"
            className="anim-mediums"
            data-anim-seq-medium
            exclusive
            aria-label="Medium"
            value={sequenceMediumChipId(effectiveMedium)}
            onChange={(next) => {
              const picked = sequenceMediumFromChipId(next as string)
              // Picking the session's own medium chip CLEARS the override —
              // identical compile, honest label.
              setMediumOverride(picked === null || picked === binding.medium ? null : picked)
            }}
          >
            {ANIMATION_MEDIA.map((entry) => (
              <Chip key={entry} id={sequenceMediumChipId(entry)} variant="radio" className="anim-chip" disabled={busy}>{entry}</Chip>
            ))}
          </ChipGroup>
        </Field>

        <div className="anim-inspector-overrides">
          <Field label="Scene override" htmlFor="anim-seq-scene" hint="Optional framing/context — empty omits the clause from the caption's Subject line.">
            <input id="anim-seq-scene" className="anim-inspector-input" data-anim-seq-scene type="text" value={scene} onChange={(event) => setScene(event.target.value)} />
          </Field>
          <Field label="Camera description" htmlFor="anim-seq-camera" hint="The camera move, phrased as part of the shot.">
            <input id="anim-seq-camera" className="anim-inspector-input" data-anim-seq-camera type="text" value={cameraDescription} onChange={(event) => setCameraDescription(event.target.value)} />
          </Field>
          <Field label="Camera reason" htmlFor="anim-seq-camera-reason" hint="Why the camera does this — the reason rides every camera statement.">
            <input id="anim-seq-camera-reason" className="anim-inspector-input" data-anim-seq-camera-reason type="text" value={cameraReason} onChange={(event) => setCameraReason(event.target.value)} />
          </Field>
        </div>
        {/* Task 9's Minor-4 (fixed in task 13): the reason compiles ONLY with
            its description — the coupling is named, never a silent drop. */}
        {cameraReason.trim() !== '' && cameraDescription.trim() === '' && (
          <p className="anim-note" role="status" data-anim-seq-camera-reason-inert>
            The camera reason rides the caption only with its description — describe the move for the reason to compile.
          </p>
        )}
      </div>

      <details className="anim-caption" data-anim-seq-caption-preview>
        <summary>
          View caption{compiled !== null && compiled.ok && compiled.result.hints.length > 0
            ? ` — ${compiled.result.hints.length} advisory note${compiled.result.hints.length === 1 ? '' : 's'}`
            : ''}
        </summary>
        <div className="anim-caption-body">
          {compiled === null && <p className="anim-note">The caption compiles once the window's two endpoints resolve.</p>}
          {compiled !== null && !compiled.ok && <p className="anim-inspector-error" role="alert">The compiler refused this context: {compiled.error}</p>}
          {compiled !== null && compiled.ok && (
            <>
              <pre className="anim-caption-text" data-anim-seq-caption-text>{compiled.result.caption}</pre>
              {compiled.result.hints.length > 0 ? (
                <ul className="anim-caption-hints" data-anim-caption-hints aria-label="Advisory caption hints">
                  {compiled.result.hints.map((hint, index) => (
                    <li key={index} className="anim-caption-hint" data-anim-caption-hint={hint.kind}>{hint.message}</li>
                  ))}
                </ul>
              ) : (
                <p className="anim-note" data-anim-caption-nohints>No advisory hints — the compiler advises, it never rewrites.</p>
              )}
              <p className="anim-note">
                Caption compiler <span data-anim-caption-compiler>v{compiled.result.compilerVersion}</span> — the preview and the submission freeze the same text.
              </p>
            </>
          )}
        </div>
      </details>

      <div className="anim-inspector-submit">
        <Button variant="primary" className="anim-btn" busy={busy} disabled={!canSubmit} onClick={() => void submit()} data-anim-seq-submit>
          Render the window
        </Button>
        {inFlightAttempt !== null ? (
          <span className="anim-note" role="status" data-anim-seq-inflight>
            A render of this window is in flight — its review opens when it lands.
          </span>
        ) : (
          <span className="anim-note">The window's two endpoint keys, the beats, and the preservation freeze with the render. The clip lands as a retained take; re-rolls add alternatives.</span>
        )}
      </div>
    </section>
  )
}
