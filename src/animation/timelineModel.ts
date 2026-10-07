/**
 * The timeline model (task 8, k2q0n9s — spec §5 the key-slot model, §6 span
 * authoring, §7.4 the review position): the PURE, node-testable derivation
 * behind Timeline.tsx (tests/animation-timeline-model.test.js owns it; every
 * browser behavior is e2e/animation.spec.ts's). No React, no APIs, no
 * environment — the same discipline as shared/animation, kept here because
 * the shapes are view-shaped (the component's row/column math consumes them
 * verbatim).
 *
 * What it derives:
 *   - keys in TIMELINE order (sorted by `order` — the body's array order is
 *     storage order, never render order);
 *   - per key, the SELECTED candidate (null when the slot has no selection)
 *     and the ORIGIN BADGE that follows it (§5.1: origin is per-candidate —
 *     swapping the selection swaps the badge; a slot never owns one);
 *   - per span, its endpoints' orders VERBATIM (fromOrder/toOrder — a
 *     backward span shows fromOrder > toOrder; connectivity truth, not a
 *     normalized range) and `nesting`: the LANE its bar renders in. Adjacent
 *     spans share lane 0; a span whose key-order interval overlaps a span
 *     already placed in a lane stacks one lane up — deterministic (document
 *     order breaks ties), and step-slot content never moves a lane (steps
 *     nest INSIDE the bar, not beside it);
 *   - the REVIEW POSITION for the playhead (§7.4, finalized in task 10):
 *     the newest READY attempt whose review decision is still OPEN (a tween
 *     step slot with no rolling-reference selection; a hero key slot with
 *     no candidate selection), else the newest attempt still in flight —
 *     hero and sequence target key slots, tween targets a step slot and
 *     resolves to the span OWNING it. Nothing awaiting the user ⇒ null
 *     (the marker is absent, never a lying position).
 *
 * Input contract: a PARSED AnimationDocumentBody (parseAnimationDocumentBody
 * enforces the pointer integrity these derivations lean on — span endpoints
 * exist, selections point inside their own slot). The functions stay total
 * anyway: an unexpected dangling id degrades to a defensible value rather
 * than crashing the render.
 */
import type { AnimationDocumentBody, AnimationTool, AttemptExecutionState, KeyCandidate, KeySlot, Span } from '../../shared/animation/types'
import { assemblyDocumentProblems, assemblyEntryVerdict } from '../../shared/animation/assembly'

/** Where a key's chosen image came from (the closed §5.1 vocabulary). */
export type KeyOrigin = KeyCandidate['origin']

/** One key as the timeline renders it: the slot verbatim plus its selected
 *  candidate and the origin badge that follows the selection. */
export type TimelineKey = KeySlot & { candidate: KeyCandidate | null; badge: KeyOrigin | null }

/** One span as the timeline renders it: the span verbatim plus endpoint
 *  orders (raw) and the lane its bar nests in. */
export type TimelineSpan = Span & { fromOrder: number; toOrder: number; nesting: number }

export type TimelineModel = { keys: TimelineKey[]; spans: TimelineSpan[] }

/** The playhead's position: a key slot or the span owning the reviewed step. */
export type TimelineReviewPosition = { kind: 'key' | 'span'; id: string } | null

/** The attempt facts the review position derives from — the recovery read's
 *  AttemptStateView satisfies this structurally (the newest is the LAST:
 *  the store serves attempts oldest-first). Task 10 finalized the shape:
 *  the position is chosen by OUTCOME (what awaits the user), so the
 *  execution state rides along. Task 11 adds `sourceKeyId` (hero rows): an
 *  in-flight hero render whose PROPOSED target slot has not materialized
 *  yet marks its SOURCE key — the next-key render attaches to where it
 *  starts. */
export type TimelineAttemptSummary = { attemptId: string; tool: AnimationTool; targetId: string; sourceKeyId?: string; execution: AttemptExecutionState }

/** The states whose engine-side truth is not settled (the state adapter's
 *  own set, mirrored — the review position treats them all as "running"). */
const IN_FLIGHT: ReadonlySet<AttemptExecutionState> = new Set(['queued', 'rendering', 'preparing', 'reconciling'])

/** Two spans overlap when their key-order intervals share more than an
 *  endpoint: a bar ends where the next key's card sits, so [0,1) and [1,2)
 *  merely touch. Half-open semantics over integer orders express that. */
function overlaps(a: { lo: number; hi: number }, b: { lo: number; hi: number }): boolean {
  return a.lo < b.hi && b.lo < a.hi
}

export function deriveTimeline(body: AnimationDocumentBody): TimelineModel {
  const keys: TimelineKey[] = [...body.keys]
    .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id < b.id ? -1 : 1))
    .map((slot) => {
      const candidate = slot.candidates.find((entry) => entry.id === slot.selectedCandidateId) ?? null
      return { ...slot, candidate, badge: candidate !== null ? candidate.origin : null }
    })

  const orderByKey = new Map(body.keys.map((slot) => [slot.id, slot.order]))
  const placed = body.spans.map((span, index) => {
    const fromOrder = orderByKey.get(span.fromKeyId) ?? 0
    const toOrder = orderByKey.get(span.toKeyId) ?? 0
    return { id: span.id, index, fromOrder, toOrder, lo: Math.min(fromOrder, toOrder), hi: Math.max(fromOrder, toOrder) }
  })
  // Lane packing, deterministic: leftmost-longest first, document order
  // breaking ties; each span takes the lowest lane whose intervals it does
  // not overlap. Duplicate-interval spans stack (0, 1, 2, …) in order.
  placed.sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.index - b.index)
  const lanes: Array<Array<{ lo: number; hi: number }>> = []
  const nesting = new Map<string, number>()
  for (const entry of placed) {
    const interval = { lo: entry.lo, hi: entry.hi }
    let lane = 0
    while (lane < lanes.length && lanes[lane]!.some((other) => overlaps(interval, other))) lane += 1
    if (lane === lanes.length) lanes.push([])
    lanes[lane]!.push(interval)
    nesting.set(entry.id, lane)
  }

  const spans: TimelineSpan[] = body.spans.map((span) => ({
    ...span,
    fromOrder: orderByKey.get(span.fromKeyId) ?? 0,
    toOrder: orderByKey.get(span.toKeyId) ?? 0,
    nesting: nesting.get(span.id) ?? 0,
  }))
  return { keys, spans }
}

/** The review position (§7.4), FINALIZED in task 10 (task 8's newest-
 *  attempt rule was supersedeable): the position is what awaits the user,
 *  not merely what happened last —
 *    rule 1 — the newest READY attempt whose review decision is still OPEN
 *    (a tween whose step slot has no rolling-reference selection; a hero
 *    whose key slot has no candidate selection; a sequence window take with
 *    NO editorial contribution naming it — task 13, the lane's reviewed
 *    marker): "On return, the editor
 *    restores the session and highlights 'Ready to review'." A slot that
 *    HAS a selection is resolved — the chain can continue from it, and a
 *    later re-roll landing beside it is an alternative, not a blocker;
 *    rule 2 — else the newest attempt still IN FLIGHT: "the timeline …
 *    attaches the running attempt to the relevant span";
 *    rule 3 — else null (the marker is absent, never a lying position).
 *  Completion advancing the marker is NOT automatic progress: rule 1 marks
 *  what the USER must decide, and the user's own selection dissolves it. */
export function deriveReviewPosition(body: AnimationDocumentBody, attempts: ReadonlyArray<TimelineAttemptSummary>): TimelineReviewPosition {
  // Rule 1 — the open review decision (§7.4's return-and-highlight).
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index]!
    if (attempt.execution !== 'ready') continue
    if (attempt.tool === 'tween') {
      // A tween attempt targets a step slot — the reviewable position is
      // the span that owns it (the bar the step chips nest inside).
      const span = body.spans.find((entry) => entry.stepSlots.some((slot) => slot.id === attempt.targetId && slot.selectedRollingReference === null))
      if (span) return { kind: 'span', id: span.id }
      continue
    }
    if (attempt.tool === 'sequence') {
      // Task 13: the sequence lane's review decision IS the editorial
      // contribution (§9 — task 12's named gap: the window-start key holds a
      // selection by construction, so nothing about the BODY was open). A
      // landed window take with NO contribution naming it is an OPEN decision
      // — the playhead marks the window start; contributing resolves it.
      if (!body.editorial.some((entry) => entry.attemptId === attempt.attemptId)
        && body.keys.some((entry) => entry.id === attempt.targetId)) {
        return { kind: 'key', id: attempt.targetId }
      }
      continue
    }
    // Hero targets a key slot (the PROPOSED slot the landing mints a
    // candidate into — open until the explicit selection exists).
    const key = body.keys.find((entry) => entry.id === attempt.targetId)
    if (key && key.selectedCandidateId === null) return { kind: 'key', id: key.id }
  }
  // Rule 2 — the running attempt (§7.4's during-the-wait attachment).
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index]!
    if (!IN_FLIGHT.has(attempt.execution)) continue
    if (attempt.tool === 'tween') {
      const span = body.spans.find((entry) => entry.stepSlots.some((slot) => slot.id === attempt.targetId))
      if (span) return { kind: 'span', id: span.id }
      continue
    }
    if (body.keys.some((entry) => entry.id === attempt.targetId)) return { kind: 'key', id: attempt.targetId }
    // An in-flight hero render targets a PROPOSED slot that materializes
    // only at landing — before that, the render attaches to its SOURCE key
    // (§5.2: the next key grows out of the current one).
    if (attempt.tool === 'hero' && attempt.sourceKeyId !== undefined && body.keys.some((entry) => entry.id === attempt.sourceKeyId)) {
      return { kind: 'key', id: attempt.sourceKeyId }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Task 13 — the editorial derivations (§9 editorial timing, §11.3 the export
// conventions): which landed clips can contribute to the assembled sequence
// (and through which lane), and what the ordered contribution list assembles
// to. Pure like the rest of this module; the EditorialPanel renders them,
// e2e/animation.spec.ts pins the rendered behavior.
// ---------------------------------------------------------------------------

/** The attempt facts the editorial derivations read — the recovery read's
 *  AttemptStateView satisfies this structurally (oldest-first, like every
 *  attempt list the store serves). */
export type EditorialAttemptSummary = {
  attemptId: string
  tool: AnimationTool
  targetId: string
  /** SEQUENCE rows: the frozen window's end key (the label's second half). */
  windowEndKeyId?: string
  /** The landed clip's frame count — null until the take has landed. */
  candidate: { frameCount: number } | null
}

/** One landed clip the picker offers: a TWEEN take rides its owning span
 *  (spanId names it, stepIndex is the 1-based slot position), a SEQUENCE
 *  window take is spanless (spanId null, §11.2). `contributionId` names the
 *  existing contribution when this clip is already in the list. Hero takes
 *  never appear — their product is a key drawing (§5.2), and the store
 *  refuses the lane; the picker never offers a doomed command. */
export type ContributableClip = {
  attemptId: string
  spanId: string | null
  stepIndex: number | null
  label: string
  detail: string
  frameCount: number
  contributionId: string | null
}

/** The landed, contributable clips of a document in attempt order (oldest
 *  first — the arrival order the review surfaces share). */
export function deriveContributableClips(body: AnimationDocumentBody, attempts: ReadonlyArray<EditorialAttemptSummary>): ContributableClip[] {
  const orderOf = (keyId: string): number | null => body.keys.find((entry) => entry.id === keyId)?.order ?? null
  const clips: ContributableClip[] = []
  for (const attempt of attempts) {
    if (attempt.candidate === null) continue
    if (attempt.tool === 'tween') {
      const span = body.spans.find((entry) => entry.stepSlots.some((slot) => slot.id === attempt.targetId))
      if (!span) continue // orphaned (its span left) — the store would refuse
      const stepIndex = span.stepSlots.findIndex((slot) => slot.id === attempt.targetId) + 1
      clips.push({
        attemptId: attempt.attemptId,
        spanId: span.id,
        stepIndex,
        label: `Tween step ${stepIndex} — key #${orderOf(span.fromKeyId) ?? '?'} → key #${orderOf(span.toKeyId) ?? '?'}`,
        detail: span.intent.movement,
        frameCount: attempt.candidate.frameCount,
        contributionId: body.editorial.find((entry) => entry.spanId === span.id && entry.attemptId === attempt.attemptId)?.id ?? null,
      })
      continue
    }
    if (attempt.tool === 'sequence') {
      clips.push({
        attemptId: attempt.attemptId,
        spanId: null,
        stepIndex: null,
        label: `Sequence window — key #${orderOf(attempt.targetId) ?? '?'} → key #${attempt.windowEndKeyId === undefined ? '?' : orderOf(attempt.windowEndKeyId) ?? '?'}`,
        detail: '',
        frameCount: attempt.candidate.frameCount,
        contributionId: body.editorial.find((entry) => entry.spanId === null && entry.attemptId === attempt.attemptId)?.id ?? null,
      })
    }
  }
  return clips
}

/** One contribution as the assembled sequence reads it: the portion
 *  ([inFrame, outFrame), start-inclusive/end-exclusive integer frames), the
 *  hold in OUTPUT frames (§11.3), and where the entry sits in the assembled
 *  whole. A degenerate range (outFrame ≤ inFrame) contributes no clip frames
 *  — a held drawing; the length/edge semantics ARE the shared assembly
 *  derivation (task 15a): the preview and the export gate read one verdict,
 *  and this derivation computes and NAMES, never clamps. */
export type AssembledContribution = {
  contributionId: string
  attemptId: string
  spanId: string | null
  label: string
  detail: string
  inFrame: number
  outFrame: number
  holdDuration: number
  clipFrames: number
  outputFrames: number
  outputStart: number
  /** The landed clip's frame count when resolvable (null names itself in
   *  `problem`). */
  frameCount: number | null
  problem: string | null
}

export type AssembledSequence = {
  fps: number
  totalFrames: number
  contributions: AssembledContribution[]
  /** Every named problem, in list order — empty when the assembly is clean. */
  problems: string[]
}

/** What the ordered editorial list assembles to (§9): the contributions in
 *  document order — the list order IS the assembled order — each with its
 *  computed output span, plus the whole sequence's frame total at the
 *  document's constant frame rate. Per entry, the SHARED assembly verdict
 *  (task 15a — the gate's own refusal classes and arithmetic, so the panel
 *  foreshadows exactly what the export refuses); the unlanded class keeps
 *  its softer preview copy (the shared verdict answers problem:null for
 *  it). The document-level verdicts (empty, odd dimensions, the ceiling)
 *  append to the problems list — §11.3's reject-don't-drop rule, previewed;
 *  the entry still renders, never silently skipped. */
export function deriveAssembledSequence(body: AnimationDocumentBody, attempts: ReadonlyArray<EditorialAttemptSummary>): AssembledSequence {
  const clipOf = new Map<string, ContributableClip>()
  for (const clip of deriveContributableClips(body, attempts)) clipOf.set(clip.attemptId, clip)

  const problems: string[] = []
  const contributions: AssembledContribution[] = []
  let outputStart = 0
  for (const entry of body.editorial) {
    const clip = clipOf.get(entry.attemptId) ?? null
    const label = clip?.label ?? `Unlanded clip (${entry.attemptId.slice(0, 8)})`
    const verdict = assemblyEntryVerdict(
      { contributionId: entry.id, inFrame: entry.inFrame, outFrame: entry.outFrame, holdDuration: entry.holdDuration, frameCount: clip?.frameCount ?? null },
      label,
    )
    const problem = verdict.problem ?? (clip === null
      ? `The clip for this contribution has not landed (attempt ${entry.attemptId}) — it contributes nothing until its take lands.`
      : null)
    if (problem !== null) problems.push(problem)
    contributions.push({
      contributionId: entry.id,
      attemptId: entry.attemptId,
      spanId: entry.spanId,
      label,
      detail: clip?.detail ?? '',
      inFrame: entry.inFrame,
      outFrame: entry.outFrame,
      holdDuration: entry.holdDuration,
      clipFrames: verdict.clipFrames,
      outputFrames: verdict.outputFrames,
      outputStart,
      frameCount: clip?.frameCount ?? null,
      problem,
    })
    outputStart += verdict.outputFrames
  }
  // The document-level verdicts append (task 15a): the empty list, odd
  // dimensions, the export ceiling — classes the gate refuses that the
  // preview used to render silently.
  problems.push(...assemblyDocumentProblems(body.settings, outputStart, body.editorial.length === 0))
  return { fps: body.settings.fps, totalFrames: outputStart, contributions, problems }
}
