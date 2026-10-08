/**
 * HeroPanel — the animation module's hero authoring surface (task 11,
 * k2q0n9s, spec 2026-10-06-animation-authoring-module-design.md §5.2 the
 * hero sourcing path, §6.2 the hero caption template): selecting a key on
 * the timeline opens this panel BENEATH it — the current key's selected
 * image as the single reference, the movement ARC that describes the full
 * beat (start, path, end — no destination: showing where the action goes is
 * showing the model the answer), and the submission that generates the
 * NEXT key.
 *
 * The §5.2 contract this panel renders, never breaks:
 *   - ONE reference: the current key's SELECTED candidate (pose follows the
 *     image, §5.1). A key with no selection cannot source a hero render —
 *     the Refusal names it (accept a frame from the key's own review, or
 *     select a candidate).
 *   - The submission targets a FRESH PROPOSED key slot (state.ts mints it):
 *     the hero generates the NEXT key, never a re-roll of the current one.
 *     Re-rolls happen from the landed review (HeroReview), appending
 *     alternatives into the same proposed slot (§5.3).
 *   - One next-key render per source at a time: an in-flight hero attempt
 *     sourcing this key disables the action and surfaces its §7.3 status.
 *
 * The overrides + the collapsed "View caption" preview mirror the span
 * inspector (§6.3): the shared compiler runs in this browser, hints advise
 * without rewriting, and the frozen caption is the previewed text.
 *
 * Props-only (P07): every connection lives in ./state.ts; the arc draft is
 * component-local view state (it has no durable home before submission —
 * §8.1 freezes it into the attempt when the render is submitted).
 */
import { useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { Chip, ChipGroup } from '../ui/Chip'
import { Field } from '../ui/Field'
import { Refusal } from '../ui/Refusal'
import { documentsApi } from '../canvas/api'
import { compileHeroCaption, type CompiledCaption, type SessionOverrideInput } from '../../shared/animation/compiler'
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
import type { HeroPreview } from './state'

/** Medium chip keys for THIS surface — the kit's exclusive ChipGroup keys a
 *  member by its id AND renders it as the DOM id, and the span inspector
 *  (which mounts beside this panel) already claims the unnamespaced form —
 *  the hero prefix keeps every DOM id unique (task 9's Minor-5 class). */
function heroMediumChipId(medium: MediumString): string {
  return `anim-hero-${mediumChipId(medium)}`
}

function heroMediumFromChipId(chipId: string): MediumString | null {
  for (const medium of ANIMATION_MEDIA) {
    if (heroMediumChipId(medium) === chipId) return medium
  }
  return null
}

/** One key's selected image, or the honest placeholder (the KeyImage idiom). */
function KeyFrameImage({ relPath, assetId }: { relPath: string | null; assetId: string }) {
  const [failed, setFailed] = useState(false)
  if (relPath === null || failed) {
    return <div className="anim-frame-placeholder" data-anim-frame-placeholder title={assetId}>{assetId}</div>
  }
  return <img className="anim-frame-img" src={documentsApi.blobFileUrl(relPath)} alt="The current key's selected image" onError={() => setFailed(true)} />
}

export type HeroPanelSubmitDraft = { movementArc: string; overrides: SessionOverrideInput }

export type HeroPanelProps = {
  /** The selected key — the hero's SOURCE (the current key). */
  keyEntity: TimelineKey
  /** The live preview selector's resolution (state.ts' deriveHeroPreview). */
  preview: HeroPreview
  /** The active binding — the inherited medium's source. */
  binding: BindingVersion
  /** A hero attempt sourcing this key that is still in flight (null: none). */
  inFlightAttempt: AttemptStateView | null
  /** A facing correction for the source key's selected image (§5.1: facing
   *  follows the candidate — the clone-and-select command). */
  onFacingChange(keyId: string, facing: FacingTerm | null): Promise<boolean>
  onSubmit(keyId: string, draft: HeroPanelSubmitDraft): Promise<{ attemptId: string; keyId: string } | null>
  busy: boolean
}

export function HeroPanel({ keyEntity, preview, binding, inFlightAttempt, onFacingChange, onSubmit, busy }: HeroPanelProps) {
  // The arc draft — component-local view state (no durable home pre-submit;
  // the shell keys the mount by key id, so switching keys starts fresh).
  const [arc, setArc] = useState('')
  // Submit-scoped overrides: a null medium inherits the bound session's.
  const [mediumOverride, setMediumOverride] = useState<MediumString | null>(null)
  const [scene, setScene] = useState('')
  const [cameraDescription, setCameraDescription] = useState('')
  const [cameraReason, setCameraReason] = useState('')

  const overrides: SessionOverrideInput = useMemo(() => {
    const resolved: SessionOverrideInput = { medium: mediumOverride ?? binding.medium }
    if (scene.trim() !== '') resolved.scene = scene
    if (cameraDescription.trim() !== '') resolved.camera = { description: cameraDescription, reason: cameraReason }
    return resolved
  }, [mediumOverride, binding.medium, scene, cameraDescription, cameraReason])

  const compiled = useMemo<{ ok: true; result: CompiledCaption } | { ok: false; error: string } | null>(() => {
    if (!preview.currentKey.ok) return null
    try {
      return {
        ok: true,
        result: compileHeroCaption({
          currentKey: { assetReference: preview.currentKey.assetReference, pose: preview.currentKey.pose },
          movementArc: arc,
          overrides,
        }),
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }, [preview.currentKey, arc, overrides])

  const canSubmit = !busy
    && inFlightAttempt === null
    && arc.trim() !== ''
    && preview.currentKey.ok
    && compiled !== null && compiled.ok

  const submit = async () => {
    if (!canSubmit) return
    await onSubmit(keyEntity.id, { movementArc: arc, overrides })
  }

  const current = preview.currentKey
  const effectiveMedium = mediumOverride ?? binding.medium

  return (
    <section className="anim-inspector" data-anim-hero-panel data-anim-hero-panel-key={keyEntity.id} aria-labelledby="anim-hero-title">
      <h3 id="anim-hero-title">Hero — generate the next key from key #{keyEntity.order}</h3>
      <p className="anim-inspector-lede">
        Describe the full movement this key performs — start, path, and end. The render returns a 22-frame clip; review it and accept the frame that becomes the <strong>next</strong> key.
      </p>

      {!current.ok && (
        <Refusal title="This key cannot source a hero render" reason={`${current.problem} The hero caption needs the current key's selected pose.`} />
      )}

      <div className="anim-inspector-frames">
        <article className="anim-frame-card" data-anim-hero-source>
          <header>
            <strong>The current key — the single reference</strong>
            <span className="anim-frame-source">key #{keyEntity.order}&apos;s selected image ({keyEntity.candidate?.origin ?? 'no selection'})</span>
          </header>
          {current.ok ? (
            <>
              <KeyFrameImage relPath={current.assetReference.relPath} assetId={current.assetReference.assetId} />
              {current.pose.poseDescription !== null ? (
                <p className="anim-frame-pose" data-anim-hero-source-pose>{current.pose.poseDescription}</p>
              ) : (
                <p className="anim-frame-pose anim-frame-pose-empty" data-anim-frame-pose-empty>This image carries no pose description yet.</p>
              )}
              <FacingPicker keyEntity={keyEntity} busy={busy} id="anim-hero-facing" group="hero" onChange={(facing) => { void onFacingChange(keyEntity.id, facing) }} />
            </>
          ) : (
            <p className="anim-frame-pose anim-frame-pose-empty">{current.problem}</p>
          )}
        </article>
      </div>

      <div className="anim-inspector-fields">
        <Field
          label="Movement arc"
          htmlFor="anim-hero-arc"
          hint="The full action from this key — start, path, and end in one positive phrase. Carried verbatim into the caption."
        >
          <textarea
            id="anim-hero-arc"
            className="anim-inspector-text"
            data-anim-hero-arc
            rows={3}
            value={arc}
            onChange={(event) => setArc(event.target.value)}
          />
        </Field>

        <Field
          label="Medium"
          htmlFor="anim-hero-medium"
          hint={mediumOverride === null
            ? `Inherited from the bound session — picking another chip overrides it for this generation.`
            : 'An override for this generation — it freezes with the attempt.'}
        >
          <ChipGroup
            id="anim-hero-medium"
            className="anim-mediums"
            data-anim-hero-medium
            exclusive
            aria-label="Medium"
            value={heroMediumChipId(effectiveMedium)}
            onChange={(next) => {
              const picked = heroMediumFromChipId(next as string)
              // Picking the session's own medium chip CLEARS the override —
              // identical compile, honest label.
              setMediumOverride(picked === null || picked === binding.medium ? null : picked)
            }}
          >
            {ANIMATION_MEDIA.map((entry) => (
              <Chip key={entry} id={heroMediumChipId(entry)} variant="radio" className="anim-chip" disabled={busy}>{entry}</Chip>
            ))}
          </ChipGroup>
        </Field>

        <div className="anim-inspector-overrides">
          <Field label="Scene override" htmlFor="anim-hero-scene" hint="Optional framing/context — empty omits the clause from the caption.">
            <input id="anim-hero-scene" className="anim-inspector-input" data-anim-hero-scene type="text" value={scene} onChange={(event) => setScene(event.target.value)} />
          </Field>
          <Field label="Camera description" htmlFor="anim-hero-camera" hint="The camera move, phrased as part of the shot.">
            <input id="anim-hero-camera" className="anim-inspector-input" data-anim-hero-camera type="text" value={cameraDescription} onChange={(event) => setCameraDescription(event.target.value)} />
          </Field>
          <Field label="Camera reason" htmlFor="anim-hero-camera-reason" hint="Why the camera does this — the reason rides every camera statement.">
            <input id="anim-hero-camera-reason" className="anim-inspector-input" data-anim-hero-camera-reason type="text" value={cameraReason} onChange={(event) => setCameraReason(event.target.value)} />
          </Field>
        </div>
        {/* Task 9's Minor-4 (fixed in task 13): the reason compiles ONLY with
            its description — the coupling is named, never a silent drop. */}
        {cameraReason.trim() !== '' && cameraDescription.trim() === '' && (
          <p className="anim-note" role="status" data-anim-hero-camera-reason-inert>
            The camera reason rides the caption only with its description — describe the move for the reason to compile.
          </p>
        )}
      </div>

      <details className="anim-caption" data-anim-hero-caption-preview>
        <summary>
          View caption{compiled !== null && compiled.ok && compiled.result.hints.length > 0
            ? ` — ${compiled.result.hints.length} advisory note${compiled.result.hints.length === 1 ? '' : 's'}`
            : ''}
        </summary>
        <div className="anim-caption-body">
          {compiled === null && <p className="anim-note">The caption compiles once the current key resolves.</p>}
          {compiled !== null && !compiled.ok && <p className="anim-inspector-error" role="alert">The compiler refused this context: {compiled.error}</p>}
          {compiled !== null && compiled.ok && (
            <>
              <pre className="anim-caption-text" data-anim-hero-caption-text>{compiled.result.caption}</pre>
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
        <Button variant="primary" className="anim-btn" busy={busy} disabled={!canSubmit} onClick={() => void submit()} data-anim-hero-submit>
          Generate the next key
        </Button>
        {inFlightAttempt !== null ? (
          <span className="anim-note" role="status" data-anim-hero-inflight>
            A next-key render from this key is in flight — its review opens when it lands.
          </span>
        ) : (
          <span className="anim-note">The clip lands as a NEW key beside this one — the hero generates the next key, never a re-roll.</span>
        )}
      </div>
    </section>
  )
}
