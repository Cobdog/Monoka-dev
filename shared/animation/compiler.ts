/**
 * The shared caption compiler (spec 2026-10-06-animation-authoring-module-
 * design.md §6.2 the three caption templates, §6.3 the enforcement
 * boundary; the dialect itself is prompting-packet-grade —
 * docs/research/h3-keyframe-animation-assessment.md §2). One module, three
 * entry points, ONE return shape — consumed by the server's authoritative
 * compile (the frozen attempt snapshot) and the client's live "View
 * caption" preview, so it lives in shared/ and stays environment-neutral:
 * zero imports beyond ./types, zero Node or browser APIs (the dual-build
 * contract — NodeNext and Bundler+DOM both compile it, vite's transform
 * executes it).
 *
 * MECHANICAL (guaranteed by construction, spec §6.3 "enforced"):
 *   - section order per tool: hero SCENE/MOVEMENT/STATIC; tween
 *     SCENE/FIRST FRAME/TARGET END FRAME/MOVEMENT/STATIC; sequence
 *     alignment line, Subject, Action, Preserve;
 *   - the medium string is byte-identical from ANIMATION_MEDIA (a medium
 *     outside the vocabulary is impossible by type AND throws at runtime —
 *     a caption that reaches the engine carries only the fixed strings);
 *   - references are numbered (Reference 1, Reference 2) in attachment
 *     order: hero's current key, tween's rolling-then-far, sequence's
 *     window start-then-end;
 *   - facing renders only as a FACING_TERMS value, and every frame states
 *     its facing when one is set.
 *
 * GUIDED (hints, NEVER rewrites): comparative destination language in a
 * far-pose description, missing facing, a movement naming a facing that
 * contradicts the target frame, negation in movement/preservation text
 * (the checkpoints are CFG-distilled — every token positive). Authored
 * text reaches the caption VERBATIM, punctuation included; the compiler
 * appends nothing after it.
 *
 * VERSION 2 (wave 2a, the 2026-10-07 ruling): the tween STATIC section
 * APPENDS the span's authored preservation after the fixed hold phrase —
 * a field in the motion authoring inspector must have an honest effect.
 * The hold phrase itself is unchanged and still ends the v1 line
 * byte-identically when no preservation is authored; frozen attempts keep
 * their frozen caption + compilerVersion verbatim ('1' rows replay as
 * captured — no migration, no rewrite). Hero and sequence templates are
 * unchanged (hero has no preservation field; sequence already compiles
 * its Preserve section).
 *
 * NOT emitted: the `landing <progress>` token. Set K measured the lever
 * dead and spec §6.5 bans controls implying generation-time timing — the
 * tween MOVEMENT section carries the authored step and nothing else.
 */
import { ANIMATION_MEDIA, isFacingTerm, isMediumString } from './types'
import type { AssetReference, FacingTerm, MediumString } from './types'

export const COMPILER_VERSION = '2'

export type PoseRef = { poseDescription: string | null; facing: FacingTerm | null }
export type SessionOverrideInput = { medium: MediumString; scene?: string; camera?: { description: string; reason: string } }
export type CaptionHint = {
  kind: 'comparative-destination' | 'missing-facing' | 'contradictory-facing' | 'negation'
  message: string
}

/** HERO — one reference: the current key. Movement is a full ARC (start,
 *  path, end). No destination image: showing where the action goes is
 *  showing the model the answer. */
export type HeroContext = {
  currentKey: { assetReference: AssetReference; pose: PoseRef }
  movementArc: string
  overrides: SessionOverrideInput
}

/** TWEEN — the ACTUAL current rolling reference (a promoted frame from the
 *  LAST landed step, NOT the span's original start endpoint), plus the
 *  fixed far reference, plus ONE movement step. Both poses carry facing.
 *  V2: the span's authored preservation (the "What stays fixed" field)
 *  appends to the STATIC section after the fixed hold phrase — the
 *  movement-authoring field has an honest effect on the caption. */
export type TweenContext = {
  rollingReference: { assetReference: AssetReference; pose: PoseRef }
  farReference: { assetReference: AssetReference; pose: PoseRef }
  movementStep: string
  preservation: string
  overrides: SessionOverrideInput
}

/** SEQUENCE — the selected key window's start/end images + poses + the
 *  ordered action list + the preservation constraints. The endpoint poses
 *  are hint-checked but not rendered: the reference images carry them, and
 *  the sequence template has no frame sections. */
export type SequenceContext = {
  windowStart: { assetReference: AssetReference; pose: PoseRef }
  windowEnd: { assetReference: AssetReference; pose: PoseRef }
  orderedActions: string[]
  preservation: string
  overrides: SessionOverrideInput
}

/** The ONE return shape — both environments, both consumers. */
export type CompiledCaption = { caption: string; hints: CaptionHint[]; compilerVersion: string }

// ---------------------------------------------------------------------------
// runtime guards (the fixed vocabularies are mechanical — a typed caller
// can still pass a corrupted value, and arbitrary text must never reach a
// submitted caption silently)
// ---------------------------------------------------------------------------

function guardMedium(medium: MediumString): void {
  if (!isMediumString(medium)) {
    throw new Error(
      `Unsupported animation medium ${JSON.stringify(medium)} — the caption medium is a fixed vocabulary: ${ANIMATION_MEDIA.join(' / ')}`,
    )
  }
}

function guardPose(pose: PoseRef): void {
  if (pose.facing !== null && !isFacingTerm(pose.facing)) {
    throw new Error(
      `Unsupported facing ${JSON.stringify(pose.facing)} — facing is a closed vocabulary: toward camera / back to camera / screen-left / screen-right`,
    )
  }
}

// ---------------------------------------------------------------------------
// section builders (pure string assembly)
// ---------------------------------------------------------------------------

function sceneSection(overrides: SessionOverrideInput): string {
  const parts = overrides.scene !== undefined ? [overrides.scene, overrides.medium] : [overrides.medium]
  let line = `SCENE: ${parts.join('; ')}.`
  if (overrides.camera !== undefined) {
    line += ` Camera: ${overrides.camera.description} — ${overrides.camera.reason}.`
  }
  return line
}

/** The hero/tween STATIC hold — fixed positive phrasing, ending on the
 *  framing+ground clause the dialect requires. Hero compiles it alone
 *  (it carries no preservation field); tween appends the span's authored
 *  preservation through tweenStaticSection (v2). */
const STATIC_HOLD = 'STATIC: identity, wardrobe, and proportions stay consistent; framing and ground plane stay fixed'

/** The tween STATIC section (v2, the maintainer's 2026-10-07 ruling): the
 *  fixed hold phrase, then — when the span carries authored preservation —
 *  the authored sentence appended after a full stop, verbatim (the
 *  compiler appends nothing after authored text). Empty/whitespace
 *  preservation keeps the v1 line byte-identical. */
function tweenStaticSection(preservation: string): string {
  const authored = preservation.trim()
  return authored === '' ? STATIC_HOLD : `${STATIC_HOLD}. ${authored}`
}

/** A tween frame section: the reference number rides the section header so
 *  the attachment order is unambiguous, the pose text lands verbatim, the
 *  facing renders as a vocabulary term. */
function frameLine(section: string, referenceNumber: number, pose: PoseRef): string {
  const bits: string[] = []
  if (pose.poseDescription !== null) bits.push(pose.poseDescription)
  if (pose.facing !== null) bits.push(`facing ${pose.facing}`)
  return bits.length > 0 ? `${section} (Reference ${referenceNumber}): ${bits.join(', ')}` : `${section} (Reference ${referenceNumber})`
}

/** The hero reference annotation — hero has no frame sections, so the
 *  current key's pose and facing ride a numbered reference line between
 *  SCENE and MOVEMENT. */
function referenceLine(label: string, referenceNumber: number, pose: PoseRef): string {
  const bits: string[] = []
  if (pose.poseDescription !== null) bits.push(pose.poseDescription)
  if (pose.facing !== null) bits.push(`facing ${pose.facing}`)
  return bits.length > 0 ? `Reference ${referenceNumber}: ${label} — ${bits.join(', ')}` : `Reference ${referenceNumber}: ${label}`
}

// ---------------------------------------------------------------------------
// hint collectors (flagged, never rewritten)
// ---------------------------------------------------------------------------

/** Comparative destination language — "than" / "farther" / "further" /
 *  "more than" in a far-pose description. Comparisons read against a
 *  moving reference (the rolling frame) and go stale per step. */
const COMPARATIVE_RE = /\b(more than|farther|further|than)\b/i

function pushComparativeHint(hints: CaptionHint[], frameLabel: string, poseDescription: string | null): void {
  if (poseDescription !== null && COMPARATIVE_RE.test(poseDescription)) {
    hints.push({
      kind: 'comparative-destination',
      message: `${frameLabel} pose is phrased as a comparison — describe the destination directly (e.g. "head facing screen-left"); comparative phrasing reads stale against a moving reference.`,
    })
  }
}

function missingFacingHint(frameLabel: string): CaptionHint {
  return {
    kind: 'missing-facing',
    message: `${frameLabel} carries no facing — the dialect states one per frame (toward camera / back to camera / screen-left / screen-right).`,
  }
}

/** A facing NAMED in movement text ("turns to face screen-right") that
 *  differs from the target frame's facing. Turning onto a DIFFERENT
 *  facing than the start is the intended large move — only a named
 *  direction that contradicts the TARGET is flagged. */
const NAMED_FACING_RE = /\bfaces?\s+(toward camera|back to camera|screen-left|screen-right)\b/gi

function pushContradictionHint(
  hints: CaptionHint[],
  textLabel: string,
  targetLabel: string,
  movementText: string,
  targetFacing: FacingTerm | null,
): void {
  if (targetFacing === null) return
  for (const match of movementText.matchAll(NAMED_FACING_RE)) {
    const named = match[1].toLowerCase()
    if (named !== targetFacing) {
      hints.push({
        kind: 'contradictory-facing',
        message: `${textLabel} names "${named}" but ${targetLabel} faces ${targetFacing} — align the movement text and the target facing on one direction.`,
      })
      return
    }
  }
}

/** Negation in authored movement/preservation text — the checkpoints are
 *  CFG-distilled from positive tokens only. */
const NEGATION_RE = /\b(not|no|never|without)\b/i

function pushNegationHint(hints: CaptionHint[], textLabel: string, text: string): void {
  if (NEGATION_RE.test(text)) {
    hints.push({
      kind: 'negation',
      message: `${textLabel} contains negation ("not", "no", "never", "without") — the checkpoints are distilled from positive tokens only; phrase what should happen rather than what should stop.`,
    })
  }
}

// ---------------------------------------------------------------------------
// the three compilers — hints collect in a fixed order (comparative,
// missing-facing in frame order, contradictory-facing, negation in text
// order) so a context always compiles to the same caption AND hints
// ---------------------------------------------------------------------------

export function compileHeroCaption(ctx: HeroContext): CompiledCaption {
  guardMedium(ctx.overrides.medium)
  guardPose(ctx.currentKey.pose)
  const hints: CaptionHint[] = []
  if (ctx.currentKey.pose.facing === null) hints.push(missingFacingHint('The current key'))
  pushNegationHint(hints, 'The movement arc', ctx.movementArc)
  // No comparative or contradiction checks: hero has no destination by
  // design — the arc is authored as a whole and nothing in the context
  // can contradict it.
  const caption = [
    sceneSection(ctx.overrides),
    referenceLine('the current key', 1, ctx.currentKey.pose),
    `MOVEMENT: ${ctx.movementArc}`,
    STATIC_HOLD,
  ].join('\n')
  return { caption, hints, compilerVersion: COMPILER_VERSION }
}

export function compileTweenCaption(ctx: TweenContext): CompiledCaption {
  guardMedium(ctx.overrides.medium)
  guardPose(ctx.rollingReference.pose)
  guardPose(ctx.farReference.pose)
  const hints: CaptionHint[] = []
  pushComparativeHint(hints, 'TARGET END FRAME', ctx.farReference.pose.poseDescription)
  if (ctx.rollingReference.pose.facing === null) hints.push(missingFacingHint('FIRST FRAME'))
  if (ctx.farReference.pose.facing === null) hints.push(missingFacingHint('TARGET END FRAME'))
  pushContradictionHint(hints, 'The movement step', 'TARGET END FRAME', ctx.movementStep, ctx.farReference.pose.facing)
  pushNegationHint(hints, 'The movement step', ctx.movementStep)
  // The appended preservation is authored text like the movement — checked
  // for negation on the same string the caption carries (the trimmed form).
  pushNegationHint(hints, 'The preservation text', ctx.preservation.trim())
  const caption = [
    sceneSection(ctx.overrides),
    frameLine('FIRST FRAME', 1, ctx.rollingReference.pose),
    frameLine('TARGET END FRAME', 2, ctx.farReference.pose),
    `MOVEMENT: ${ctx.movementStep}`,
    tweenStaticSection(ctx.preservation),
  ].join('\n')
  return { caption, hints, compilerVersion: COMPILER_VERSION }
}

export function compileSequenceCaption(ctx: SequenceContext): CompiledCaption {
  guardMedium(ctx.overrides.medium)
  guardPose(ctx.windowStart.pose)
  guardPose(ctx.windowEnd.pose)
  const hints: CaptionHint[] = []
  pushComparativeHint(hints, 'The window end', ctx.windowEnd.pose.poseDescription)
  if (ctx.windowStart.pose.facing === null) hints.push(missingFacingHint('The window start'))
  if (ctx.windowEnd.pose.facing === null) hints.push(missingFacingHint('The window end'))
  pushContradictionHint(hints, 'The action beats', 'the window end', ctx.orderedActions.join(' '), ctx.windowEnd.pose.facing)
  ctx.orderedActions.forEach((action, index) => pushNegationHint(hints, `Action beat ${index + 1}`, action))
  pushNegationHint(hints, 'The preservation text', ctx.preservation)

  let subject = `Subject: the figure shown in Reference 1 and Reference 2, animated on twos in ${ctx.overrides.medium}.`
  if (ctx.overrides.scene !== undefined) subject += ` Scene: ${ctx.overrides.scene}.`
  if (ctx.overrides.camera !== undefined) {
    subject += ` Camera: ${ctx.overrides.camera.description} — ${ctx.overrides.camera.reason}.`
  }
  const lines = [
    'Alignment: Reference 1 (the window start) opens the sequence; Reference 2 (the window end) closes it',
    subject,
  ]
  if (ctx.orderedActions.length > 0) lines.push(`Action: ${ctx.orderedActions.join('; ')}`)
  lines.push(`Preserve: ${ctx.preservation}`)
  return { caption: lines.join('\n'), hints, compilerVersion: COMPILER_VERSION }
}
