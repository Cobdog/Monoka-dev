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
 *    whose key slot has no candidate selection): "On return, the editor
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
    // Hero targets a key slot; sequence targets its window-start key (§11.2)
    // — the landing mints/holds candidates, so the slot is open until a
    // selection exists.
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
