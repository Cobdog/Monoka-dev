/**
 * SpanInspector — the animation module's span inspector (task 9, k2q0n9s,
 * spec 2026-10-06-animation-authoring-module-design.md §6 span authoring):
 * the hybrid motion-authoring form for ONE tween span, the module's core
 * creative interface. Layout per §6.1 — the two endpoint frames with their
 * pose descriptions and facing pickers, then the movement centered:
 *
 *   FIRST FRAME card — the ACTUAL current rolling reference (§6.4: the last
 *   landed step's promoted frame once the chain rolls, else the start key's
 *   selected image; never a frozen copy of the span's original endpoint).
 *   The source is LABELED, because the distinction is the point. A promoted
 *   frame's pose/facing author right here (wave 2a): the §6.4 image-bound
 *   ANNOTATION rides the step slot's selection pointer — a debounced pose
 *   draft (the movement draft's settle doctrine, pointer-scoped) plus the
 *   endpoint pickers' facing chip pattern — while the start key's pose
 *   stays candidate-bound and read-only (§5.1).
 *   TARGET END FRAME card — the destination key's selected image, pose
 *   verbatim (§5.1: the description follows the image candidate).
 *
 *   MOVEMENT + PRESERVATION — free text; the movement is the tween caption's
 *   MOVEMENT line verbatim, debounced into the durable span intent (§7.4's
 *   future-motion drafts) and recompiled into the preview after the same
 *   debounce. Authored preservation persists with the span AND compiles
 *   (compiler v2, the maintainer's 2026-10-07 ruling): the tween STATIC
 *   section carries it appended after the dialect's fixed hold phrase —
 *   a field in the motion authoring inspector has an honest effect.
 *
 *   OVERRIDES — medium/scene/camera: the medium inherits from the bound
 *   session by default, a different chip is this span's override; scene and
 *   camera (with its reason clause, §6.3) are span-scoped. All three ride
 *   the submission's draft — the frozen attempt is their durable record.
 *
 *   "View caption" — a collapsed native disclosure holding the caption
 *   compiled CLIENT-SIDE through compileTweenCaption (the shared module's
 *   first browser import, the same code the server freezes the snapshot
 *   with) plus the compiler's HINTS as advisory rows — flagged, never
 *   rewrites (§6.3). Raw caption editing is out by design.
 *
 * NOT here (§6.5, deliberately): no step-size dial, no progress lever, no
 * easing or intensity control — Set K measured the timing vocabulary dead;
 * no control implies validated generation-time timing. One explicit
 * "Submit step N" button, one step at a time (§7.1).
 *
 * Props-only (P07): every connection lives in ./state.ts — this component
 * holds its authoring draft and hands commands up. The draft seeds from the
 * span once per span id (the shell keys the mount); later external writes to
 * the same span never clobber live typing — the user's edit wins until they
 * leave the span, the same draft doctrine as the binding panel (task 13's
 * Minor-3 fix: an UNEDITED draft FOLLOWS the external write instead of
 * re-arming its debounce over it).
 */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { Chip, ChipGroup } from '../ui/Chip'
import { Field } from '../ui/Field'
import { Refusal } from '../ui/Refusal'
import { documentsApi } from '../canvas/api'
import { compileTweenCaption, type CompiledCaption, type SessionOverrideInput } from '../../shared/animation/compiler'
import {
  ANIMATION_MEDIA,
  FACING_TERMS,
  mediumChipId,
  mediumFromChipId,
  type BindingVersion,
  type FacingTerm,
  type MediumString,
  type Span,
} from '../../shared/animation/types'
import type { TimelineKey } from './timelineModel'
import type { TweenPreview } from './state'

/** The debounced recompute window: typing settles, then the preview
 *  recompiles AND the durable intent persists — one settle, two effects of
 *  the same draft. */
const DRAFT_SETTLE_MS = 400

/** Facing chip keys — the FACING_TERMS strings carry spaces, and the kit's
 *  exclusive ChipGroup keys a member by its id AND renders it as the DOM id
 *  (the mediumChipId rule; this pair is view-local until a second facing
 *  surface exists). The GROUP prefix namespaces the ids (task 9's Minor-5,
 *  fixed in task 11): the inspector mounts two pickers, and duplicate DOM
 *  ids across them broke label/aria association. */
function facingChipId(term: FacingTerm, group: string): string {
  return `anim-facing-${group}-${term.replace(/[^a-z]+/g, '-')}`
}

function facingFromChipId(chipId: string, group: string): FacingTerm | null {
  for (const term of FACING_TERMS) {
    if (facingChipId(term, group) === chipId) return term
  }
  return null
}

export type SpanInspectorSubmitDraft = { movement: string; preservation: string; overrides: SessionOverrideInput }

export type SpanInspectorProps = {
  span: Span
  fromKey: TimelineKey | null
  toKey: TimelineKey | null
  /** The live preview selector's resolution (state.ts' deriveTweenPreview —
   *  the server's tween draft resolution mirrored client-side). */
  preview: TweenPreview
  /** The active binding — the inherited medium's source. */
  binding: BindingVersion
  onIntentChange(spanId: string, intent: { movement: string; preservation: string }): Promise<boolean>
  /** A facing correction for a key's selected image — the adapter's
   *  clone-and-select command (§5.1: facing follows the candidate). */
  onFacingChange(keyId: string, facing: FacingTerm | null): Promise<boolean>
  /** Wave 2a (§6.4): the image-bound annotation for the step slot's
   *  SELECTED rolling reference — a partial patch merged over the live
   *  pointer by the adapter, so a pose settle and a facing flip never
   *  clobber each other. */
  onAnnotateRolling(spanId: string, stepSlotId: string, patch: { poseDescription?: string | null; facing?: FacingTerm | null }): Promise<boolean>
  onSubmit(spanId: string, draft: SpanInspectorSubmitDraft): Promise<{ attemptId: string } | null>
  busy: boolean
}

/** One endpoint frame's image, or the honest placeholder (the KeyImage
 *  idiom): no previewable relPath, or a preview that failed to load. */
function FrameImage({ relPath, assetId, alt }: { relPath: string | null; assetId: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (relPath === null || failed) {
    return <div className="anim-frame-placeholder" data-anim-frame-placeholder title={assetId}>{assetId}</div>
  }
  return <img className="anim-frame-img" src={documentsApi.blobFileUrl(relPath)} alt={alt} onError={() => setFailed(true)} />
}

/** The closed-vocabulary facing picker. Clicking the checked chip CLEARS the
 *  facing (null is legal and hint-noted as missing); a locked key disables
 *  the group — the server would refuse the selection change (§7.2.1). The
 *  `group` slug namespaces the member chip ids (two pickers mount here;
 *  task 11 exports the picker for the hero panel's current-key card). */
export function FacingPicker({ keyEntity, busy, onChange, id, group }: { keyEntity: TimelineKey; busy: boolean; onChange(facing: FacingTerm | null): void; id: string; group: string }) {
  const candidate = keyEntity.candidate
  const value = candidate !== null && candidate.facing !== null ? facingChipId(candidate.facing, group) : null
  return (
    <Field
      label="Facing"
      htmlFor={id}
      hint={keyEntity.lock ? 'This key is locked — unlock it on the timeline before changing its facing.' : 'The closed dialect vocabulary; click the checked chip to clear it (a frame with no facing is hint-noted, never refused).'}
    >
      <ChipGroup
        id={id}
        className="anim-facings"
        data-anim-facing={keyEntity.id}
        exclusive
        aria-label={`Facing for key ${keyEntity.order}`}
        value={value}
        onChange={(next) => {
          const picked = next as string
          if (value !== null && picked === value) {
            onChange(null)
            return
          }
          onChange(facingFromChipId(picked, group))
        }}
      >
        {FACING_TERMS.map((term) => (
          <Chip key={term} id={facingChipId(term, group)} variant="radio" className="anim-chip" disabled={busy || keyEntity.lock || candidate === null}>{term}</Chip>
        ))}
      </ChipGroup>
    </Field>
  )
}

export function SpanInspector({ span, fromKey, toKey, preview, binding, onIntentChange, onFacingChange, onAnnotateRolling, onSubmit, busy }: SpanInspectorProps) {
  // The authoring draft — seeded once per span (the shell keys the mount by
  // span id); `committed` is the debounced projection the preview compiles.
  const [draft, setDraft] = useState(() => ({ movement: span.intent.movement, preservation: span.intent.preservation }))
  const [committed, setCommitted] = useState(() => ({ movement: span.intent.movement, preservation: span.intent.preservation }))
  // Whether the user has TYPED in this mount (task 9's Minor-3, fixed in
  // task 13): one-way, cleared only by leaving the span (the remount). An
  // UNEDITED inspector FOLLOWS external writes to the span intent; once the
  // user has typed, the draft is theirs — external writes never re-armed the
  // debounce over the authored text (the old bug clobbered them with the
  // stale seeded draft; a naive "persisted ⇒ follow again" fix clobbered
  // them with the user's own persisted words one refresh later).
  const [userTyped, setUserTyped] = useState(false)
  // The rolling-reference annotation draft (wave 2a, §6.4): bound to the
  // SELECTION POINTER, not the span — and it exists ONLY once the user has
  // typed for that pointer (the movement draft's task-13 doctrine,
  // pointer-scoped). An UNEDITED editor holds NO draft: the textarea reads
  // the document's annotation and FOLLOWS external writes (another
  // surface's annotate lands through the fabric refresh straight into the
  // field), and the settle NEVER fires — an idle inspector must not revert
  // another surface's authored pose 400ms after the refresh lands it.
  const [poseDraft, setPoseDraft] = useState<{ pointer: string; text: string } | null>(null)
  // Span-scoped overrides: a null medium inherits the bound session's.
  const [mediumOverride, setMediumOverride] = useState<MediumString | null>(span.overrides.medium ?? null)
  const [scene, setScene] = useState(span.overrides.scene ?? '')
  const [cameraDescription, setCameraDescription] = useState(span.overrides.camera?.description ?? '')
  const [cameraReason, setCameraReason] = useState(span.overrides.camera?.reason ?? '')

  const editDraft = (next: { movement: string; preservation: string }) => {
    setUserTyped(true)
    setDraft(next)
  }

  // External writes land here (another surface, a fresh read): with no user
  // typing behind it, the inspector FOLLOWS the document's truth.
  useEffect(() => {
    if (userTyped) return
    if (draft.movement === span.intent.movement && draft.preservation === span.intent.preservation) return
    setDraft({ movement: span.intent.movement, preservation: span.intent.preservation })
    setCommitted({ movement: span.intent.movement, preservation: span.intent.preservation })
  }, [userTyped, draft.movement, draft.preservation, span.intent.movement, span.intent.preservation])

  // The settle: 400ms after the last keystroke the preview recompiles AND
  // the durable intent persists (when the authored draft actually differs
  // from the document's truth — the guard keeps a mount-time no-op command
  // impossible). The adapter PARKS the persist behind a busy store (task 9's
  // Minor-2, fixed in task 13), so a command in flight delays it — never
  // drops it; a failed persist surfaces through the shell's command-error
  // arm and never re-fires on its own.
  useEffect(() => {
    if (!userTyped) return
    if (draft.movement === span.intent.movement && draft.preservation === span.intent.preservation) return
    const timer = window.setTimeout(() => {
      setCommitted({ movement: draft.movement, preservation: draft.preservation })
      void onIntentChange(span.id, { movement: draft.movement, preservation: draft.preservation })
    }, DRAFT_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [userTyped, draft.movement, draft.preservation, span.id, span.intent.movement, span.intent.preservation, onIntentChange])

  // ---- the rolling-reference annotation (wave 2a, §6.4) ----------------------
  //
  // The promoted frame's pose/facing ride the step slot's selection pointer
  // as an IMAGE-BOUND ANNOTATION — inspectable and correctable right here,
  // the same authority the key-bound poses have through their pickers. The
  // editor exists ONLY for a promoted frame: the start key's pose belongs to
  // its selected candidate (§5.1) and keeps its read-only display.
  const nearForAnnotation = preview.rollingReference
  const rollingSource = nearForAnnotation.ok && nearForAnnotation.source.kind === 'promoted-frame' ? nearForAnnotation.source : null
  const rollingPointerKey = rollingSource === null
    ? null
    : `${rollingSource.stepSlotId}:${rollingSource.attemptId}:${rollingSource.frameIndex}`
  const rollingPose = rollingSource !== null && nearForAnnotation.ok ? nearForAnnotation.pose.poseDescription : null
  const rollingFacing = rollingSource !== null && nearForAnnotation.ok ? nearForAnnotation.pose.facing : null

  // The draft's lifetime is the POINTER: a different promoted frame (or the
  // chain falling back to the start key) DISCARDS it — the new selection's
  // pose is unknown until authored, and the reset the selection command
  // writes must reach the editor. The SAME pointer keeps the user's draft:
  // neither the command's own landing nor an external refresh may re-arm
  // over authored text. With no draft (unedited), the field below reads the
  // LIVE annotation and follows whatever lands.
  useEffect(() => {
    setPoseDraft((current) => {
      if (rollingPointerKey === null) return null
      if (current !== null && current.pointer === rollingPointerKey) return current
      return null
    })
  }, [rollingPointerKey])
  const poseDraftText = poseDraft !== null && poseDraft.pointer === rollingPointerKey ? poseDraft.text : rollingPose ?? ''

  // The annotation settle: 400ms after the last keystroke the pose persists
  // through the annotate command (the adapter parks it behind a busy
  // store), and the refreshed document's pointer recompiles the preview —
  // every later step's caption freezes the authored pose. It fires ONLY on
  // the user's OWN draft (a matching, non-null poseDraft): an unedited
  // editor never settles, whatever the document does around it. Empty text
  // IS a clear (null).
  useEffect(() => {
    if (rollingSource === null || poseDraft === null || poseDraft.pointer !== rollingPointerKey) return
    if (poseDraft.text === (rollingPose ?? '')) return
    const stepSlotId = rollingSource.stepSlotId
    const timer = window.setTimeout(() => {
      void onAnnotateRolling(span.id, stepSlotId, { poseDescription: poseDraft.text.trim() === '' ? null : poseDraft.text })
    }, DRAFT_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [rollingSource, poseDraft, rollingPointerKey, rollingPose, span.id, onAnnotateRolling])

  /** The compile overrides the preview AND the submission share — one object,
   *  so the frozen caption is byte-identical to the previewed one. Empty
   *  scene/camera text means "not set" (the caption omits the clause). */
  const overrides: SessionOverrideInput = useMemo(() => {
    const resolved: SessionOverrideInput = { medium: mediumOverride ?? binding.medium }
    if (scene.trim() !== '') resolved.scene = scene
    if (cameraDescription.trim() !== '') resolved.camera = { description: cameraDescription, reason: cameraReason }
    return resolved
  }, [mediumOverride, binding.medium, scene, cameraDescription, cameraReason])

  /** The live compile — the shared compiler in the browser, over the resolved
   *  references and the COMMITTED draft. Total: a compiler refusal (impossible
   *  from typed vocabularies, guarded anyway) lands as a named error, never a
   *  silent blank. */
  const compiled = useMemo<{ ok: true; result: CompiledCaption } | { ok: false; error: string } | null>(() => {
    if (!preview.rollingReference.ok || !preview.farReference.ok || toKey === null) return null
    try {
      return {
        ok: true,
        result: compileTweenCaption({
          rollingReference: { assetReference: preview.rollingReference.assetReference, pose: preview.rollingReference.pose },
          farReference: { assetReference: preview.farReference.assetReference, pose: preview.farReference.pose },
          movementStep: committed.movement,
          // The compiler v2 STATIC append: the preview compiles the SAME
          // settled preservation the server reads from the span intent (the
          // submit flushes the draft into the intent first, so preview and
          // frozen caption stay byte-identical).
          preservation: committed.preservation,
          overrides,
        }),
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }, [preview.rollingReference, preview.farReference, toKey, committed.movement, committed.preservation, overrides])

  const canSubmit = !busy
    && committed.movement.trim() !== ''
    && draft.movement.trim() !== ''
    && preview.targetStepSlotId !== null
    && preview.rollingReference.ok
    && preview.farReference.ok
    && compiled !== null && compiled.ok

  const submit = async () => {
    if (!canSubmit) return
    // An explicit submission flushes EVERY pending draft for the span BEFORE
    // the submit call (Codex I10): the pose draft's debounce exists for idle
    // settles — a deliberate Submit waits for nothing. The annotate command
    // fires NOW and is AWAITED, so the wire order is annotate-then-submit and
    // the server freezes the caption the textarea showed (the adapter reads
    // the fresh document after the settle, so the flush is what the frozen
    // near pose rides). A failed flush ABORTS the submission — the adapter's
    // command error already names the cause; never a silent skip that renders
    // on the old pose and marks the span stale only afterward. The settle
    // effect needs no manual disarm: once the flush lands, its own guard
    // (draft text === the document's annotation) disarms the timer, and a
    // timer that races the submit parks behind the busy store as a
    // client-side no-op (equal annotation, no wire call).
    if (rollingSource !== null && poseDraft !== null && poseDraft.pointer === rollingPointerKey && poseDraft.text !== (rollingPose ?? '')) {
      const settled = await onAnnotateRolling(span.id, rollingSource.stepSlotId, { poseDescription: poseDraft.text.trim() === '' ? null : poseDraft.text })
      if (!settled) return
    }
    // Converge the preview on the live text BEFORE the frozen snapshot takes
    // it — the byte-identity pin: what was previewed is what froze. (The
    // movement/preservation flush rides the submit adapter itself — it
    // persists the intent before the attempt POST.)
    setCommitted({ movement: draft.movement, preservation: draft.preservation })
    await onSubmit(span.id, { movement: draft.movement, preservation: draft.preservation, overrides })
  }

  const near = preview.rollingReference
  const far = preview.farReference
  const effectiveMedium = mediumOverride ?? binding.medium
  const mediumChipValue = mediumChipId(effectiveMedium)

  return (
    <section className="anim-inspector" data-anim-inspector data-anim-inspector-span={span.id} aria-labelledby="anim-inspector-title">
      <h3 id="anim-inspector-title">Tween span — from key #{fromKey?.order ?? '?'} to key #{toKey?.order ?? '?'}</h3>
      {span.stale && <p className="anim-note" role="status" data-anim-inspector-stale>This span is stale ({span.staleReasons.join(', ')}) — previous takes remain available; a new submission freezes fresh references.</p>}
      <p className="anim-inspector-lede">
        Author step {preview.stepCount} of the movement from key #{fromKey?.order ?? '?'} to key #{toKey?.order ?? '?'}. Each render is one step — review it, then continue the chain.
      </p>

      {preview.problems.length > 0 && (
        <Refusal title="The tween references are not resolvable" reason={`${preview.problems.join(' ')} The caption preview and submission stay gated until the references resolve.`} />
      )}

      <div className="anim-inspector-frames">
        {/* FIRST FRAME — the ACTUAL current rolling reference (§6.4). */}
        <article className="anim-frame-card" data-anim-frame="first">
          <header>
            <strong>First frame — the rolling reference</strong>
            {near.ok && near.source.kind === 'start-key' && <span className="anim-frame-source" data-anim-frame-source="start-key">key #{near.source.keyOrder}&apos;s selected image — the chain has landed no step yet</span>}
            {near.ok && near.source.kind === 'promoted-frame' && <span className="anim-frame-source" data-anim-frame-source="promoted-frame">the frame promoted from step {near.source.stepIndex + 1}&apos;s landed clip</span>}
          </header>
          {near.ok ? (
            <>
              <FrameImage
                // The promoted frame renders its OWN extracted image (Codex
                // I11): the selection pointer's recorded frameAsset — the
                // actual conditioning drawing, exactly what the submission
                // freezes as the rolling-near reference. A pre-widening
                // pointer (frameAsset null) falls back to the honest
                // placeholder naming the clip handle, never the clip blob
                // served as a broken <img>.
                relPath={near.source.kind === 'start-key' ? near.assetReference.relPath : near.source.frameAsset?.relPath ?? null}
                assetId={near.source.kind === 'start-key' ? near.assetReference.assetId : near.source.frameAsset?.assetId ?? near.assetReference.assetId}
                alt="The rolling reference image"
              />
              {near.source.kind === 'promoted-frame' ? (
                <div className="anim-rolling-annotation" data-anim-rolling-annotation>
                  <Field
                    label="Pose description"
                    htmlFor="anim-inspector-pose"
                    hint="Bound to the selected rolling frame — it carries into every later step's caption and persists as you settle. Until authored, the caption flags the missing facing."
                  >
                    <textarea
                      id="anim-inspector-pose"
                      className="anim-inspector-text"
                      data-anim-inspector-pose
                      rows={2}
                      value={poseDraftText}
                      onChange={(event) => {
                        if (rollingPointerKey === null) return
                        setPoseDraft({ pointer: rollingPointerKey, text: event.target.value })
                      }}
                    />
                  </Field>
                  <Field
                    label="Facing"
                    htmlFor="anim-inspector-facing-rolling"
                    hint="The closed dialect vocabulary for this frame; click the checked chip to clear it (a frame with no facing is hint-noted, never refused)."
                  >
                    <ChipGroup
                      id="anim-inspector-facing-rolling"
                      className="anim-facings"
                      data-anim-rolling-facing
                      exclusive
                      aria-label="Facing for the rolling reference"
                      value={rollingFacing !== null ? facingChipId(rollingFacing, 'rolling') : null}
                      onChange={(next) => {
                        if (rollingSource === null) return
                        const picked = next as string
                        const current = rollingFacing !== null ? facingChipId(rollingFacing, 'rolling') : null
                        if (current !== null && picked === current) {
                          void onAnnotateRolling(span.id, rollingSource.stepSlotId, { facing: null })
                          return
                        }
                        const term = facingFromChipId(picked, 'rolling')
                        if (term !== null) void onAnnotateRolling(span.id, rollingSource.stepSlotId, { facing: term })
                      }}
                    >
                      {FACING_TERMS.map((term) => (
                        <Chip key={term} id={facingChipId(term, 'rolling')} variant="radio" className="anim-chip" disabled={busy}>{term}</Chip>
                      ))}
                    </ChipGroup>
                  </Field>
                </div>
              ) : (
                <>
                  {near.pose.poseDescription !== null ? (
                    <p className="anim-frame-pose" data-anim-frame-pose>{near.pose.poseDescription}</p>
                  ) : (
                    <p className="anim-frame-pose anim-frame-pose-empty" data-anim-frame-pose-empty>This image carries no pose description yet.</p>
                  )}
                  {fromKey !== null ? (
                    <FacingPicker keyEntity={fromKey} busy={busy} id="anim-inspector-facing-first" group="first" onChange={(facing) => { void onFacingChange(fromKey.id, facing) }} />
                  ) : null}
                </>
              )}
            </>
          ) : (
            <p className="anim-frame-pose anim-frame-pose-empty">{near.problem}</p>
          )}
        </article>

        {/* TARGET END FRAME — the destination key's selected image (§5.1). */}
        <article className="anim-frame-card" data-anim-frame="target">
          <header>
            <strong>Target end frame — the fixed destination</strong>
            <span className="anim-frame-source">key #{toKey?.order ?? '?'}&apos;s selected image — absolute, not comparative</span>
          </header>
          {far.ok ? (
            <>
              <FrameImage relPath={far.assetReference.relPath} assetId={far.assetReference.assetId} alt="The destination key image" />
              {far.pose.poseDescription !== null ? (
                <p className="anim-frame-pose" data-anim-frame-pose>{far.pose.poseDescription}</p>
              ) : (
                <p className="anim-frame-pose anim-frame-pose-empty" data-anim-frame-pose-empty>This image carries no pose description yet.</p>
              )}
              {toKey !== null && <FacingPicker keyEntity={toKey} busy={busy} id="anim-inspector-facing-target" group="target" onChange={(facing) => { void onFacingChange(toKey.id, facing) }} />}
            </>
          ) : (
            <p className="anim-frame-pose anim-frame-pose-empty">{far.problem}</p>
          )}
        </article>
      </div>

      <div className="anim-inspector-fields">
        <Field
          label="Movement"
          htmlFor="anim-inspector-movement"
          hint="The action and path of this step — carried verbatim into the caption; it persists as you settle."
        >
          <textarea
            id="anim-inspector-movement"
            className="anim-inspector-text"
            data-anim-inspector-movement
            rows={3}
            value={draft.movement}
            onChange={(event) => editDraft({ ...draft, movement: event.target.value })}
          />
        </Field>
        <Field
          label="What stays fixed"
          htmlFor="anim-inspector-preservation"
          hint="What must not drift during the movement — it rides the caption's hold line. Empty leaves the standard hold."
        >
          <textarea
            id="anim-inspector-preservation"
            className="anim-inspector-text"
            data-anim-inspector-preservation
            rows={2}
            value={draft.preservation}
            onChange={(event) => editDraft({ ...draft, preservation: event.target.value })}
          />
        </Field>

        <Field
          label="Medium"
          htmlFor="anim-inspector-medium"
          hint={mediumOverride === null
            ? `Inherited from the bound session — picking another chip overrides it for this span.`
            : 'An override for this span — it freezes with each submitted attempt.'}
        >
          <ChipGroup
            id="anim-inspector-medium"
            className="anim-mediums"
            data-anim-inspector-medium
            exclusive
            aria-label="Medium"
            value={mediumChipValue}
            onChange={(next) => {
              const picked = mediumFromChipId(next as string)
              // Picking the session's own medium chip CLEARS the override —
              // the compile result is identical, the label stays honest.
              setMediumOverride(picked === null || picked === binding.medium ? null : picked)
            }}
          >
            {ANIMATION_MEDIA.map((entry) => (
              <Chip key={entry} id={mediumChipId(entry)} variant="radio" className="anim-chip" disabled={busy}>{entry}</Chip>
            ))}
          </ChipGroup>
        </Field>

        <div className="anim-inspector-overrides">
          <Field label="Scene override" htmlFor="anim-inspector-scene" hint="Optional framing/context — empty inherits nothing (the caption omits the clause); this build's bindings carry no scene default.">
            <input id="anim-inspector-scene" className="anim-inspector-input" data-anim-inspector-scene type="text" value={scene} onChange={(event) => setScene(event.target.value)} />
          </Field>
          <Field label="Camera description" htmlFor="anim-inspector-camera" hint="The camera move, phrased as part of the shot.">
            <input id="anim-inspector-camera" className="anim-inspector-input" data-anim-inspector-camera type="text" value={cameraDescription} onChange={(event) => setCameraDescription(event.target.value)} />
          </Field>
          <Field label="Camera reason" htmlFor="anim-inspector-camera-reason" hint="Why the camera does this — the reason rides every camera statement.">
            <input id="anim-inspector-camera-reason" className="anim-inspector-input" data-anim-inspector-camera-reason type="text" value={cameraReason} onChange={(event) => setCameraReason(event.target.value)} />
          </Field>
        </div>
        {/* Task 9's Minor-4 (fixed in task 13): the reason compiles ONLY with
            its description — the coupling is named, never a silent drop. */}
        {cameraReason.trim() !== '' && cameraDescription.trim() === '' && (
          <p className="anim-note" role="status" data-anim-inspector-camera-reason-inert>
            The camera reason rides the caption only with its description — describe the move for the reason to compile.
          </p>
        )}
      </div>

      <details className="anim-caption" data-anim-caption-preview>
        <summary>
          View caption{compiled !== null && compiled.ok && compiled.result.hints.length > 0
            ? ` — ${compiled.result.hints.length} advisory note${compiled.result.hints.length === 1 ? '' : 's'}`
            : ''}
        </summary>
        <div className="anim-caption-body">
          {compiled === null && <p className="anim-note">The caption compiles once both references resolve.</p>}
          {compiled !== null && !compiled.ok && <p className="anim-inspector-error" role="alert">The compiler refused this context: {compiled.error}</p>}
          {compiled !== null && compiled.ok && (
            <>
              <pre className="anim-caption-text" data-anim-caption-text>{compiled.result.caption}</pre>
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
        <Button variant="primary" className="anim-btn" busy={busy} disabled={!canSubmit} onClick={() => void submit()} data-anim-inspector-submit>
          Submit step {preview.stepCount}
        </Button>
        <span className="anim-note">One step per render — review it, then continue.</span>
      </div>
    </section>
  )
}
