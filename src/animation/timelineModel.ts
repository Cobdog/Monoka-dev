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
 *   - the REVIEW POSITION for the playhead (§7.4): the newest attempt's
 *     target resolved onto the timeline — hero and sequence target key
 *     slots, tween targets a step slot and resolves to the span OWNING it.
 *     No attempts ⇒ null (the marker is absent, never a lying position).
 *
 * Input contract: a PARSED AnimationDocumentBody (parseAnimationDocumentBody
 * enforces the pointer integrity these derivations lean on — span endpoints
 * exist, selections point inside their own slot). The functions stay total
 * anyway: an unexpected dangling id degrades to a defensible value rather
 * than crashing the render.
 */
import type { AnimationDocumentBody, AnimationTool, KeyCandidate, KeySlot, Span } from '../../shared/animation/types'

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
 *  the store serves attempts oldest-first). */
export type TimelineAttemptSummary = { attemptId: string; tool: AnimationTool; targetId: string }

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

export function deriveReviewPosition(body: AnimationDocumentBody, attempts: ReadonlyArray<TimelineAttemptSummary>): TimelineReviewPosition {
  const newest = attempts[attempts.length - 1]
  if (!newest) return null
  if (newest.tool === 'tween') {
    // A tween attempt targets a step slot — the reviewable position is the
    // span that owns it (the bar the step chips nest inside).
    const span = body.spans.find((entry) => entry.stepSlots.some((slot) => slot.id === newest.targetId))
    return span ? { kind: 'span', id: span.id } : null
  }
  // Hero targets a key slot; sequence targets its window-start key (§11.2).
  return body.keys.some((entry) => entry.id === newest.targetId) ? { kind: 'key', id: newest.targetId } : null
}
