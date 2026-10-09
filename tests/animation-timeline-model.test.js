// The timeline model suite (task 8 of the animation-authoring module, k2q0n9s,
// spec docs/superpowers/specs/2026-10-06-animation-authoring-module-design.md
// §5 the key-slot model + §6 span authoring): deriveTimeline +
// deriveReviewPosition — the NODE-TESTABLE pure core behind
// src/animation/Timeline.tsx. Every browser behavior (image cards, lock chips,
// selection highlight, the playhead marker) is e2e/animation.spec.ts's; this
// suite pins the derivations those renders consume:
//   - keys sort by `order` (array order is not timeline order);
//   - the badge follows the SELECTED candidate's origin (§5.1 — origin is
//     per-candidate; an empty selection is candidate null + badge null);
//   - span connectivity rides key order (fromOrder/toOrder, raw — a backward
//     span shows fromOrder > toOrder) and `nesting` is the lane a span's bar
//     renders in: adjacent spans share lane 0, a span whose interval overlaps
//     a placed one stacks above it;
//   - step slots ride THEIR span in document order, derivation is stable, and
//     step-slot growth never moves a lane (steps nest INSIDE the bar);
//   - the review position (§7.4, finalized task 10): the newest READY
//     attempt whose review decision is still OPEN (a tween step slot with no
//     rolling-reference selection; a hero key slot with no candidate
//     selection) — hero/sequence → the key, tween → the span owning the step
//     slot; else the newest attempt still in flight; else null. Terminal
//     attempts and resolved decisions never mark the timeline.

import { test } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { deriveAssembledSequence, deriveChainSurface, deriveContributableClips, deriveExtendPreview, deriveReviewPosition, deriveTimeline } from '../src/animation/timelineModel'

const uuid = () => randomUUID()

function candidate(origin, overrides = {}) {
  return {
    id: uuid(),
    assetReference: { assetId: `asset-${uuid().slice(0, 8)}`, relPath: null, kind: 'image' },
    origin,
    provenance: { assetId: `asset-${uuid().slice(0, 8)}` },
    poseDescription: null,
    facing: null,
    ...overrides,
  }
}

function keySlot(order, overrides = {}) {
  return { id: uuid(), order, selectedCandidateId: null, candidates: [], lock: false, ...overrides }
}

function stepSlot(overrides = {}) {
  return { id: uuid(), attempts: [], selectedRollingReference: null, ...overrides }
}

function spanOf(fromKeyId, toKeyId, overrides = {}) {
  return {
    id: uuid(),
    fromKeyId,
    toKeyId,
    intent: { movement: 'walks left to right', preservation: 'coat hem stays consistent' },
    overrides: {},
    stepSlots: [stepSlot()],
    stale: false,
    staleReasons: [],
    ...overrides,
  }
}

function bodyOf(keys, spans) {
  return {
    keys,
    spans,
    bindingHistory: [],
    activeBindingVersion: 0,
    editorial: [],
    settings: { outputWidth: 1344, outputHeight: 768, fps: 24, steps: 30 },
  }
}

// The standard fixture: three keys whose ARRAY order deliberately disagrees
// with their `order` (B sits first), an adjacent pair of spans, and a
// skip-span across the whole range.
function standardFixture() {
  const keyA = keySlot(0)
  const keyB = keySlot(1)
  const keyC = keySlot(2)
  const spanAB = spanOf(keyA.id, keyB.id)
  const spanBC = spanOf(keyB.id, keyC.id)
  const spanAC = spanOf(keyA.id, keyC.id)
  return { keys: [keyB, keyA, keyC], spans: [spanAB, spanBC, spanAC], keyA, keyB, keyC, spanAB, spanBC, spanAC }
}

test('deriveTimeline sorts keys by order (array order is not timeline order) and passes lock through', () => {
  const fixture = standardFixture()
  const model = deriveTimeline(bodyOf(fixture.keys, fixture.spans))
  assert.deepEqual(model.keys.map((key) => key.id), [fixture.keyA.id, fixture.keyB.id, fixture.keyC.id], 'keys render in order 0,1,2')
  assert.deepEqual(model.keys.map((key) => key.order), [0, 1, 2])
  // The slot's own fields ride along untouched — the lock indicator's input.
  assert.equal(model.keys.every((key) => typeof key.lock === 'boolean'), true, 'lock is the model\'s input, verbatim')
})

test('an empty slot (no selected candidate) yields candidate null and badge null', () => {
  const unselected = keySlot(0, { candidates: [candidate('import'), candidate('hero')] })
  const candidateless = keySlot(1)
  const model = deriveTimeline(bodyOf([unselected, candidateless], []))
  assert.equal(model.keys[0].candidate, null, 'candidates exist but none selected — candidate null')
  assert.equal(model.keys[0].badge, null, 'no selection means no origin badge (§5.1: the badge follows selection)')
  assert.equal(model.keys[1].candidate, null)
  assert.equal(model.keys[1].badge, null)
})

test('swapping the selected candidate swaps the badge (origin is per-candidate)', () => {
  const importCandidate = candidate('import')
  const heroCandidate = candidate('hero')
  const slot = keySlot(0, { selectedCandidateId: importCandidate.id, candidates: [importCandidate, heroCandidate] })
  const before = deriveTimeline(bodyOf([slot], []))
  assert.equal(before.keys[0].candidate.id, importCandidate.id)
  assert.equal(before.keys[0].badge, 'import')
  slot.selectedCandidateId = heroCandidate.id
  const after = deriveTimeline(bodyOf([slot], []))
  assert.equal(after.keys[0].candidate.id, heroCandidate.id, 'the candidate pointer follows the selection')
  assert.equal(after.keys[0].badge, 'hero', 'the badge follows the selected candidate\'s origin — the slot never owns one')
})

test('span connectivity rides key order: adjacent spans nest at 0, an overlapping span stacks above', () => {
  const fixture = standardFixture()
  const model = deriveTimeline(bodyOf(fixture.keys, fixture.spans))
  const byId = new Map(model.spans.map((span) => [span.id, span]))
  const ab = byId.get(fixture.spanAB.id)
  const bc = byId.get(fixture.spanBC.id)
  const ac = byId.get(fixture.spanAC.id)
  assert.equal(ab.fromOrder, 0, 'A→B reads key A\'s order')
  assert.equal(ab.toOrder, 1)
  assert.equal(ab.nesting, 0, 'the adjacent A→B bar sits on the track lane')
  assert.equal(bc.fromOrder, 1)
  assert.equal(bc.toOrder, 2)
  assert.equal(bc.nesting, 0, 'B→C touches A→B only at key B — adjacent spans share lane 0')
  assert.equal(ac.fromOrder, 0)
  assert.equal(ac.toOrder, 2)
  assert.equal(ac.nesting, 1, 'the skip-span overlaps both adjacent bars — it renders one lane up')
})

test('a backward span (key 3 → key 1) keeps raw connectivity and nests by its normalized interval', () => {
  const keyOne = keySlot(0)
  const keyTwo = keySlot(1)
  const keyThree = keySlot(2)
  const forward = spanOf(keyOne.id, keyTwo.id)
  const backward = spanOf(keyThree.id, keyOne.id)
  const model = deriveTimeline(bodyOf([keyOne, keyTwo, keyThree], [forward, backward]))
  assert.equal(model.spans.find((span) => span.id === backward.id).fromOrder, 2, 'fromOrder is the RAW from-key order')
  assert.equal(model.spans.find((span) => span.id === backward.id).toOrder, 0, 'toOrder is the RAW to-key order — connectivity truth, not a normalized range')
  assert.equal(model.spans.find((span) => span.id === backward.id).nesting, 1, 'the backward span covers [0,2] and overlaps the adjacent bar — lane 1')
  assert.equal(model.spans.find((span) => span.id === forward.id).nesting, 0)
})

test('two spans over the same interval stack in distinct lanes', () => {
  const keyA = keySlot(0)
  const keyB = keySlot(1)
  const first = spanOf(keyA.id, keyB.id)
  const second = spanOf(keyA.id, keyB.id)
  const third = spanOf(keyA.id, keyB.id)
  const model = deriveTimeline(bodyOf([keyA, keyB], [first, second, third]))
  assert.deepEqual(model.spans.map((span) => span.nesting), [0, 1, 2], 'document order breaks the tie — lanes stack deterministically')
})

test('step slots ride their span in document order, and derivation is stable', () => {
  const keyA = keySlot(0)
  const keyB = keySlot(1)
  const stepOne = stepSlot()
  const stepTwo = stepSlot({ attempts: [uuid()] })
  const theSpan = spanOf(keyA.id, keyB.id, { stepSlots: [stepOne, stepTwo] })
  const body = bodyOf([keyA, keyB], [theSpan])
  const first = deriveTimeline(body)
  const second = deriveTimeline(body)
  assert.deepEqual(first, second, 'the same body derives the same model (no hidden state)')
  const derived = first.spans.find((span) => span.id === theSpan.id)
  assert.deepEqual(derived.stepSlots.map((slot) => slot.id), [stepOne.id, stepTwo.id], 'steps nest under their own span, document order')
  assert.equal(derived.stepSlots[1].attempts.length, 1, 'the slot\'s own truth rides along verbatim')
})

test('step-slot growth never moves a lane — steps nest inside the bar, not beside it', () => {
  const keyA = keySlot(0)
  const keyB = keySlot(1)
  const keyC = keySlot(2)
  const adjacent = spanOf(keyA.id, keyB.id)
  const skip = spanOf(keyA.id, keyC.id)
  const before = deriveTimeline(bodyOf([keyA, keyB, keyC], [adjacent, skip]))
  const grown = spanOf(keyA.id, keyC.id, { stepSlots: [stepSlot(), stepSlot(), stepSlot(), stepSlot()] })
  grown.id = skip.id
  const after = deriveTimeline(bodyOf([keyA, keyB, keyC], [adjacent, grown]))
  const strip = (model) => ({
    keys: model.keys.map((key) => ({ id: key.id, order: key.order, badge: key.badge })),
    spans: model.spans.map((span) => ({ id: span.id, fromOrder: span.fromOrder, toOrder: span.toOrder, nesting: span.nesting })),
  })
  assert.deepEqual(strip(after), strip(before), 'four step slots change nothing about lanes or keys — nesting is a span-interval fact')
})

test('deriveReviewPosition resolves an open ready attempt onto the timeline (§7.4 return-and-highlight)', () => {
  const keyA = keySlot(0)
  const keyB = keySlot(1)
  const tweenStep = stepSlot()
  const theSpan = spanOf(keyA.id, keyB.id, { stepSlots: [tweenStep] })
  const body = bodyOf([keyA, keyB], [theSpan])
  assert.equal(deriveReviewPosition(body, []), null, 'no attempts — no review position (the marker is absent, not zero)')
  const heroAttempt = { attemptId: uuid(), tool: 'hero', targetId: keyB.id, execution: 'ready' }
  assert.deepEqual(deriveReviewPosition(body, [heroAttempt]), { kind: 'key', id: keyB.id }, 'a ready hero attempt targets a key slot with no selection — open')
  const sequenceAttempt = { attemptId: uuid(), tool: 'sequence', targetId: keyA.id, execution: 'ready' }
  assert.deepEqual(deriveReviewPosition(body, [sequenceAttempt]), { kind: 'key', id: keyA.id }, 'a sequence attempt targets its window-start key')
  const tweenAttempt = { attemptId: uuid(), tool: 'tween', targetId: tweenStep.id, execution: 'ready' }
  assert.deepEqual(deriveReviewPosition(body, [tweenAttempt]), { kind: 'span', id: theSpan.id }, 'a ready tween attempt targets a step slot — the review position is the OWNING span')
  assert.deepEqual(deriveReviewPosition(body, [heroAttempt, tweenAttempt]), { kind: 'span', id: theSpan.id }, 'the NEWEST open attempt wins (attempts arrive oldest-first)')
  assert.equal(deriveReviewPosition(body, [{ attemptId: uuid(), tool: 'tween', targetId: uuid(), execution: 'ready' }]), null, 'a dangling target resolves to no position, never a guess')
})

test('deriveReviewPosition: the running attempt marks the timeline; terminal attempts never do', () => {
  const keyA = keySlot(0)
  const keyB = keySlot(1)
  const tweenStep = stepSlot()
  const theSpan = spanOf(keyA.id, keyB.id, { stepSlots: [tweenStep] })
  const body = bodyOf([keyA, keyB], [theSpan])
  // In flight (§7.4's during-the-wait attachment): the running attempt
  // attaches to its span even though nothing is reviewable yet.
  const running = { attemptId: uuid(), tool: 'tween', targetId: tweenStep.id, execution: 'rendering' }
  assert.deepEqual(deriveReviewPosition(body, [running]), { kind: 'span', id: theSpan.id })
  const queued = { attemptId: uuid(), tool: 'tween', targetId: tweenStep.id, execution: 'queued' }
  assert.deepEqual(deriveReviewPosition(body, [queued]), { kind: 'span', id: theSpan.id })
  // Terminal states carry no position — nothing awaits the user there.
  for (const execution of ['failed', 'cancelled', 'interrupted']) {
    assert.equal(deriveReviewPosition(body, [{ attemptId: uuid(), tool: 'tween', targetId: tweenStep.id, execution }]), null, `${execution} never marks the timeline`)
  }
})

test('deriveReviewPosition: a ready attempt whose decision is made steps aside (task 10 finalization)', () => {
  const keyA = keySlot(0)
  const keyB = keySlot(1)
  const stepOne = stepSlot()
  const otherStep = stepSlot()
  const theSpan = spanOf(keyA.id, keyB.id, { stepSlots: [stepOne] })
  const otherSpan = spanOf(keyB.id, keyA.id, { stepSlots: [otherStep] })
  const body = bodyOf([keyA, keyB], [theSpan, otherSpan])
  // A tween whose slot HAS a rolling-reference selection is resolved — the
  // chain can continue from it; a later re-roll landing beside it is an
  // alternative, not a blocker. Here nothing else marks the timeline.
  const resolvedTween = { attemptId: uuid(), tool: 'tween', targetId: stepOne.id, execution: 'ready' }
  stepOne.selectedRollingReference = { attemptId: resolvedTween.attemptId, frameIndex: 4 }
  assert.equal(deriveReviewPosition(body, [resolvedTween]), null, 'a resolved ready tween is not the review position')
  // A ready-OPEN attempt beats a NEWER in-flight one: what awaits the user
  // outranks what is merely running (§7.4's highlight-on-return).
  const runningElsewhere = { attemptId: uuid(), tool: 'tween', targetId: otherStep.id, execution: 'rendering' }
  const openTween = { attemptId: uuid(), tool: 'tween', targetId: otherStep.id, execution: 'ready' }
  // otherStep: open first, then running — both target otherSpan.
  assert.deepEqual(deriveReviewPosition(body, [resolvedTween, { ...openTween }]), { kind: 'span', id: otherSpan.id }, 'the open ready attempt on another span still wins')
  assert.deepEqual(deriveReviewPosition(body, [resolvedTween, runningElsewhere]), { kind: 'span', id: otherSpan.id }, 'with no open decision, the running attempt attaches')
  // A ready hero whose key slot already has a selection is equally resolved.
  const heroResolved = { attemptId: uuid(), tool: 'hero', targetId: keyA.id, execution: 'ready' }
  keyA.candidates = [candidate('hero')]
  keyA.selectedCandidateId = keyA.candidates[0].id
  assert.equal(deriveReviewPosition(bodyOf([keyA, keyB], [theSpan]), [heroResolved]), null, 'a hero landing into an already-selected slot is resolved')
})

// T10-M4 (wave 2b): an EXPLICIT review position sticks when a re-roll of the
// reviewed step LANDS. The document-truth signature of "a re-roll landed on
// this span" is a step slot holding MORE THAN ONE take — the rule never keys
// on the new take's outcome, so a FAILED re-roll holds the position too
// (today the position dissolves under the reviewer: the steal). Key-grain
// positions need no rule — a hero/sequence re-roll targets the SAME key, so
// §7.4 already resolves to the same id or dissolves without moving. Every
// two-argument call (all the §7.4 pins above) is untouched by construction.
test('deriveReviewPosition: an explicit position sticks when a re-roll lands on its span (T10-M4, wave 2b)', () => {
  const keyA = keySlot(0)
  const keyB = keySlot(1)
  const stepOne = stepSlot()
  const theSpan = spanOf(keyA.id, keyB.id, { stepSlots: [stepOne] })
  const body = bodyOf([keyA, keyB], [theSpan])
  const explicit = { kind: 'span', id: theSpan.id }
  // The reviewer reviewed take one: the frame selection made, the decision closed.
  const takeOne = { attemptId: uuid(), tool: 'tween', targetId: stepOne.id, execution: 'ready' }
  stepOne.selectedRollingReference = { attemptId: takeOne.attemptId, frameIndex: 4 }
  stepOne.attempts = [takeOne.attemptId]
  // No re-roll yet — nothing sticks: the resolved tween is null with or
  // without the explicit position (rule 0 needs a MULTI-take slot).
  assert.equal(deriveReviewPosition(body, [takeOne]), null, '§7.4 alone: a resolved single-take tween is null (unchanged)')
  assert.equal(deriveReviewPosition(body, [takeOne], explicit), null, 'an explicit position does not stick without a re-roll — §7.4 rules stand')
  // The re-roll LANDS: a second take on the slot. The position holds.
  const takeTwo = { attemptId: uuid(), tool: 'tween', targetId: stepOne.id, execution: 'ready' }
  stepOne.attempts = [takeOne.attemptId, takeTwo.attemptId]
  assert.deepEqual(deriveReviewPosition(body, [takeOne, takeTwo], explicit), explicit, 'a re-roll landing holds the explicit position')
  // The FAILED re-roll holds it too — the rule reads the document (two
  // takes), never the landing's outcome.
  assert.deepEqual(deriveReviewPosition(body, [takeOne, { ...takeTwo, execution: 'failed' }], explicit), explicit, 'a failed re-roll landing holds the position as well')
  // The stick is the re-rolled span's OWN explicit position: an explicit
  // naming another span does not stick here — §7.4 resolves (null).
  assert.equal(deriveReviewPosition(body, [takeOne, takeTwo], { kind: 'span', id: uuid() }), null, 'another span\'s explicit never sticks this span')
  // A key-grain explicit never arms rule 0 — the span rule is span-only.
  assert.equal(deriveReviewPosition(body, [takeOne, takeTwo], { kind: 'key', id: keyA.id }), null, 'a key-grain explicit does not stick a span position')
  // A FIRST take on an untouched span: rule 0 does not fire (one take) —
  // §7.4's open decision is the position, exactly as before wave 2b.
  const fresh = spanOf(keyA.id, keyB.id)
  const freshBody = bodyOf([keyA, keyB], [fresh])
  const firstTake = { attemptId: uuid(), tool: 'tween', targetId: fresh.stepSlots[0].id, execution: 'ready' }
  assert.deepEqual(deriveReviewPosition(freshBody, [firstTake], { kind: 'span', id: fresh.id }), { kind: 'span', id: fresh.id }, 'a first take on an untouched span stays §7.4\'s open decision')
})

// Task 11 — the hero lane's review-position facts (§5.2's proposed slot +
// the ordering matrix T10-M3 left unpinned): an in-flight hero render
// targets a slot that materializes only at LANDING, so before that the
// render attaches to its SOURCE key; among multiple running attempts the
// NEWEST wins; a ready-OPEN decision always outranks a newer running one.
test('deriveReviewPosition: an in-flight hero marks its SOURCE key until the proposed slot materializes (task 11)', () => {
  const keyA = keySlot(0)
  const keyB = keySlot(1)
  const theSpan = spanOf(keyA.id, keyB.id)
  const body = bodyOf([keyA, keyB], [theSpan])
  // The proposed slot does NOT exist yet (it materializes at landing) — the
  // render attaches to the source key (§5.2: the next key grows out of the
  // current one).
  const rendering = { attemptId: uuid(), tool: 'hero', targetId: uuid(), sourceKeyId: keyA.id, execution: 'rendering' }
  assert.deepEqual(deriveReviewPosition(body, [rendering]), { kind: 'key', id: keyA.id }, 'the in-flight next-key render attaches to its source')
  // Without a sourceKeyId (a summary that never carried it), a dangling
  // target resolves to NO position — absent, never a guess.
  assert.equal(deriveReviewPosition(body, [{ ...rendering, sourceKeyId: undefined }]), null, 'no source, no materialized target — no position')
  // Once the slot materialized (a re-roll against a landed slot), the
  // TARGET key is the position.
  const rerolling = { attemptId: uuid(), tool: 'hero', targetId: keyB.id, sourceKeyId: keyA.id, execution: 'queued' }
  assert.deepEqual(deriveReviewPosition(body, [rerolling]), { kind: 'key', id: keyB.id }, 'a re-roll against the materialized slot marks the slot')
  // Rule 2's tie-break: the NEWEST running attempt wins (oldest-first list).
  assert.deepEqual(deriveReviewPosition(body, [rendering, rerolling]), { kind: 'key', id: keyB.id }, 'the newest in-flight attempt attaches')
  // Rule 1 outranks rule 2 even when the running one is newer (T10-M3's
  // unpinned claim, pinned): a ready-OPEN hero decision beats a newer render.
  const open = { attemptId: uuid(), tool: 'hero', targetId: uuid(), execution: 'ready' }
  const openBody = bodyOf([keyA, keyB], [theSpan])
  // The open attempt's target materialized with its landing — a real slot
  // with no selection (the landed clip candidate, §5.3).
  openBody.keys.push({ ...keySlot(2), id: open.targetId, candidates: [candidate('hero')] })
  assert.deepEqual(deriveReviewPosition(openBody, [open, rerolling]), { kind: 'key', id: open.targetId }, 'the open ready decision outranks the newer running render')
  // And the rules stack in order: the newest OPEN decision wins over an
  // OLDER open one (both unselected hero slots).
  const openOlder = { attemptId: uuid(), tool: 'hero', targetId: uuid(), execution: 'ready' }
  openBody.keys.push({ ...keySlot(3), id: openOlder.targetId, candidates: [candidate('hero')] })
  assert.deepEqual(deriveReviewPosition(openBody, [openOlder, open]), { kind: 'key', id: open.targetId }, 'the newest open decision wins')
  // Accepting its frame dissolves the marker — the next open decision takes it.
  const accepted = openBody.keys.find((entry) => entry.id === open.targetId)
  accepted.selectedCandidateId = accepted.candidates[0].id
  assert.deepEqual(deriveReviewPosition(openBody, [openOlder, open, rerolling]), { kind: 'key', id: openOlder.targetId }, 'a resolved decision steps aside for the next open one')
})

// Task 13 — the sequence lane's reviewed marker is the EDITORIAL
// CONTRIBUTION (§9): a landed window take whose start key already holds a
// selection never fired rule 1 under task 12 (nothing about the body was
// open); its review decision is whether it CONTRIBUTES. An uncontributed
// ready take is the open decision — the playhead marks the window start; a
// contribution naming the attempt resolves it.
test('deriveReviewPosition: a ready sequence take stays open until it contributes (task 13)', () => {
  const startCandidate = candidate('import')
  const keyStart = keySlot(0, { candidates: [startCandidate], selectedCandidateId: startCandidate.id })
  const keyEnd = keySlot(1)
  const body = bodyOf([keyStart, keyEnd], [])
  const take = { attemptId: uuid(), tool: 'sequence', targetId: keyStart.id, execution: 'ready' }
  assert.deepEqual(
    deriveReviewPosition(body, [take]),
    { kind: 'key', id: keyStart.id },
    'an uncontributed window take is the open decision — the playhead marks its start key (the start holds a selection; the missing decision is the contribution)',
  )
  body.editorial.push({ id: uuid(), spanId: null, attemptId: take.attemptId, inFrame: 0, outFrame: 18, holdDuration: 2 })
  assert.equal(deriveReviewPosition(body, [take]), null, 'a contribution names the take — the decision is made, the marker dissolves')
  // Only a contribution naming THIS attempt resolves it — a span-named entry
  // for another clip leaves the window's decision open.
  body.editorial = [{ id: uuid(), spanId: null, attemptId: uuid(), inFrame: 0, outFrame: 4, holdDuration: 0 }]
  assert.deepEqual(deriveReviewPosition(body, [take]), { kind: 'key', id: keyStart.id }, 'a foreign contribution resolves nothing')
})

// Task 13 — the editorial derivations behind the EditorialPanel (§9/§11.3):
// which landed clips can contribute (and through which lane), and what the
// ordered contribution list assembles to (integer frames, start-inclusive
// end-exclusive ranges, holds measured in output frames).
test('deriveContributableClips lists the landed tween and sequence clips with their lanes (task 13)', () => {
  const startCandidate = candidate('import')
  const endCandidate = candidate('import')
  const keyA = keySlot(0, { candidates: [startCandidate], selectedCandidateId: startCandidate.id })
  const keyB = keySlot(1, { candidates: [endCandidate], selectedCandidateId: endCandidate.id })
  const step = stepSlot()
  const theSpan = spanOf(keyA.id, keyB.id, { stepSlots: [step], intent: { movement: 'she shifts her weight onto the heel', preservation: 'coat hem consistent' } })
  const tweenTake = { attemptId: uuid(), tool: 'tween', targetId: step.id, candidate: { frameCount: 22 } }
  step.attempts.push(tweenTake.attemptId)
  const seqTake = { attemptId: uuid(), tool: 'sequence', targetId: keyA.id, windowEndKeyId: keyB.id, candidate: { frameCount: 30 } }
  const heroTake = { attemptId: uuid(), tool: 'hero', targetId: uuid(), candidate: { frameCount: 22 } }
  const unlanded = { attemptId: uuid(), tool: 'sequence', targetId: keyA.id, windowEndKeyId: keyB.id, candidate: null }
  const body = bodyOf([keyA, keyB], [theSpan])

  let clips = deriveContributableClips(body, [tweenTake, seqTake, heroTake, unlanded])
  assert.deepEqual(clips.map((clip) => clip.attemptId), [tweenTake.attemptId, seqTake.attemptId], 'hero clips and unlanded attempts never contribute')
  assert.equal(clips[0].spanId, theSpan.id, 'the tween lane names its owning span')
  assert.equal(clips[0].stepIndex, 1, 'the tween label names its 1-based step')
  assert.ok(clips[0].label.includes('key #0 → key #1'), `the label carries the endpoint orders (${clips[0].label})`)
  assert.ok(clips[0].detail.includes('shifts her weight'), 'the tween detail carries the span movement')
  assert.equal(clips[0].frameCount, 22)
  assert.equal(clips[1].spanId, null, 'the sequence lane is spanless')
  assert.ok(clips[1].label.includes('key #0 → key #1'), `the window label carries its endpoint orders (${clips[1].label})`)
  assert.equal(clips[1].frameCount, 30)
  assert.equal(clips[0].contributionId, null)
  assert.equal(clips[1].contributionId, null)

  // An orphaned tween (its span removed) is NOT offered — the store's attach
  // rule would refuse it; the picker never shows a doomed command.
  clips = deriveContributableClips(bodyOf([keyA, keyB], []), [tweenTake, seqTake])
  assert.deepEqual(clips.map((clip) => clip.attemptId), [seqTake.attemptId])

  // An existing contribution flags its clip (the picker says "already in the
  // list"; the row below owns the edit).
  body.editorial.push({ id: uuid(), spanId: null, attemptId: seqTake.attemptId, inFrame: 0, outFrame: 12, holdDuration: 0 })
  clips = deriveContributableClips(body, [tweenTake, seqTake])
  assert.equal(clips.find((clip) => clip.attemptId === seqTake.attemptId).contributionId, body.editorial[0].id)
  assert.equal(clips.find((clip) => clip.attemptId === tweenTake.attemptId).contributionId, null)
})

test('deriveAssembledSequence concatenates the ordered list with holds in output frames (task 13, §11.3)', () => {
  const startCandidate = candidate('import')
  const endCandidate = candidate('import')
  const keyA = keySlot(0, { candidates: [startCandidate], selectedCandidateId: startCandidate.id })
  const keyB = keySlot(1, { candidates: [endCandidate], selectedCandidateId: endCandidate.id })
  const step = stepSlot()
  const theSpan = spanOf(keyA.id, keyB.id, { stepSlots: [step] })
  const tweenTake = { attemptId: uuid(), tool: 'tween', targetId: step.id, candidate: { frameCount: 22 } }
  step.attempts.push(tweenTake.attemptId)
  const seqTake = { attemptId: uuid(), tool: 'sequence', targetId: keyA.id, windowEndKeyId: keyB.id, candidate: { frameCount: 30 } }
  const seqTake2 = { attemptId: uuid(), tool: 'sequence', targetId: keyB.id, windowEndKeyId: keyA.id, candidate: { frameCount: 18 } }
  const body = bodyOf([keyA, keyB], [theSpan])
  body.editorial = [
    { id: uuid(), spanId: theSpan.id, attemptId: tweenTake.attemptId, inFrame: 4, outFrame: 16, holdDuration: 8 },
    { id: uuid(), spanId: null, attemptId: seqTake.attemptId, inFrame: 0, outFrame: 30, holdDuration: 0 },
    { id: uuid(), spanId: null, attemptId: seqTake2.attemptId, inFrame: 5, outFrame: 5, holdDuration: 12 },
  ]
  const assembled = deriveAssembledSequence(body, [tweenTake, seqTake, seqTake2])
  assert.equal(assembled.fps, 24, 'the document\'s constant frame rate')
  // [4,16) = 12 clip frames + an 8-frame hold = 20; the window contributes
  // its whole 30; the degenerate [5,5) range contributes NO clip frames — a
  // held drawing, 12 output frames (§11.3's drawing holds).
  assert.deepEqual(
    assembled.contributions.map((entry) => [entry.outputStart, entry.clipFrames, entry.outputFrames]),
    [[0, 12, 20], [20, 30, 30], [50, 0, 12]],
    'start-inclusive/end-exclusive ranges, holds in output frames, cumulative starts',
  )
  assert.equal(assembled.totalFrames, 62)
  assert.deepEqual(assembled.problems, [], 'in-range selections carry no problems')
  assert.equal(assembled.contributions[2].frameCount, 18)

  // An out-of-range range is a NAMED problem — never a silent clamp (the
  // export compiler owns length semantics; the preview names the excess).
  body.editorial[1].outFrame = 44
  const flagged = deriveAssembledSequence(body, [tweenTake, seqTake, seqTake2])
  assert.equal(flagged.problems.length, 1)
  assert.ok(flagged.problems[0].includes('44') && flagged.problems[0].includes('30'), `the problem names the range and the clip (${flagged.problems[0]})`)

  // An entry whose attempt never landed (or left the view) names itself — a
  // missing clip is never silently skipped (§11.3's reject-don't-drop rule,
  // previewed).
  body.editorial.push({ id: uuid(), spanId: null, attemptId: uuid(), inFrame: 0, outFrame: 4, holdDuration: 0 })
  const unlandedView = deriveAssembledSequence(body, [tweenTake, seqTake, seqTake2])
  assert.ok(unlandedView.problems.some((problem) => problem.includes('has not landed')), 'the unlanded entry is named')
  assert.equal(unlandedView.contributions.length, 4, 'the entry still renders — named, not dropped')
})

// ---------------------------------------------------------------------------
// The extension lane (Task 6, spec 2026-10-08-animation-extension-lane-design.md
// §4): deriveChainSurface (the source-attempt-edge traversal, the derived
// mismatch, the assembled preview) + deriveExtendPreview (§4's carry math,
// §6's two clocks, the preflight verdicts, the discontinuity advisory).
// ---------------------------------------------------------------------------

function windowSlot(order, overrides = {}) {
  return { id: uuid(), order, attempts: [], selectedCandidateId: null, lock: false, sourceAttemptId: '', stale: false, staleReasons: [], ...overrides }
}

function chainOf(rootAttemptId, windows) {
  return { rootAttemptId, windows }
}

/** One extension-lane attempt row (the view's structural facts). */
function extTake(attemptId, overrides = {}) {
  return {
    attemptId,
    targetId: uuid(),
    execution: 'ready',
    continuation: { state: 'ready' },
    candidate: { frameCount: 34 },
    ...overrides,
  }
}

test('deriveChainSurface walks windows in order and assembles the ONE selected path (§4)', () => {
  const root = extTake(uuid(), { candidate: { frameCount: 22 } })
  const w1Take = extTake(uuid(), { extension: { sourceAttemptId: root.attemptId, targetLength: 56, movement: 'm', preservation: 'p', overrides: { medium: 'clean line on white' }, anchors: [] } })
  const w2Take = extTake(uuid(), { extension: { sourceAttemptId: w1Take.attemptId, targetLength: 56, movement: 'm', preservation: 'p', overrides: { medium: 'clean line on white' }, anchors: [] }, candidate: { frameCount: 34 } })
  const w1Alt = extTake(uuid(), { extension: { sourceAttemptId: root.attemptId, targetLength: 39, movement: 'm', preservation: 'p', overrides: { medium: 'clean line on white' }, anchors: [] } })
  const w1 = windowSlot(0, { attempts: [w1Take.attemptId, w1Alt.attemptId], selectedCandidateId: w1Take.attemptId, sourceAttemptId: root.attemptId })
  const w2 = windowSlot(1, { attempts: [w2Take.attemptId], selectedCandidateId: w2Take.attemptId, sourceAttemptId: w1Take.attemptId })
  const body = { ...bodyOf([], []), chains: [chainOf(root.attemptId, [w2, w1])] }
  const surface = deriveChainSurface(body, [root, w1Take, w1Alt, w2Take])
  assert.equal(surface.chains.length, 1)
  const chain = surface.chains[0]
  // Windows sort by ORDER (the fixture's array order disagrees).
  assert.deepEqual(chain.windows.map((window) => window.slot.id), [w1.id, w2.id])
  assert.equal(chain.mismatch, null, 'the selected path is consistent — no mismatch')
  // The assembled preview: root 22 + w1's selected 34 + w2's selected 34.
  assert.deepEqual(chain.assembled, { windows: 2, deliveredFrames: 90 })
  // Alternatives ride the window's takes but never the path.
  assert.equal(chain.windows[0].takes.length, 2)
  assert.equal(chain.windows[0].selected.attemptId, w1Take.attemptId)
})

test('deriveChainSurface derives the NAMED mismatch when an ancestor selection displaces the edge — and both resolutions are answerable (§4)', () => {
  const root = extTake(uuid(), { candidate: { frameCount: 22 } })
  const a1 = extTake(uuid(), { extension: { sourceAttemptId: root.attemptId, targetLength: 56, movement: 'm', preservation: 'p', overrides: { medium: 'clean line on white' }, anchors: [] } })
  const a2 = extTake(uuid(), { extension: { sourceAttemptId: root.attemptId, targetLength: 56, movement: 'm', preservation: 'p', overrides: { medium: 'clean line on white' }, anchors: [] } })
  const b = extTake(uuid(), { extension: { sourceAttemptId: a1.attemptId, targetLength: 56, movement: 'm', preservation: 'p', overrides: { medium: 'clean line on white' }, anchors: [] } })
  const w1 = windowSlot(0, { attempts: [a1.attemptId, a2.attemptId], selectedCandidateId: a2.attemptId, sourceAttemptId: root.attemptId })
  const w2 = windowSlot(1, { attempts: [b.attemptId], selectedCandidateId: b.attemptId, sourceAttemptId: a1.attemptId })
  const body = { ...bodyOf([], []), chains: [chainOf(root.attemptId, [w1, w2])] }
  const surface = deriveChainSurface(body, [root, a1, a2, b])
  const mismatch = surface.chains[0].mismatch
  assert.notEqual(mismatch, null, 'B extends A1 while the ancestor slot selects A2 — the named mismatch')
  assert.equal(mismatch.windowSlotId, w2.id)
  assert.equal(mismatch.selectedAttemptId, b.attemptId)
  assert.equal(mismatch.sourceAttemptId, a1.attemptId)
  assert.equal(mismatch.ancestorSlotId, w1.id)
  assert.equal(mismatch.expectedSelection, a1.attemptId, 'the first resolution: reselect the compatible ancestry')
  assert.equal(surface.chains[0].assembled, null, 'never a silent assembly past the mismatch')
  // Reselecting A1 back clears the derivation (marks are monotonic; the
  // DERIVED state reads consistent on its own).
  const restored = { ...body, chains: [{ ...body.chains[0], windows: [{ ...w1, selectedCandidateId: a1.attemptId }, w2] }] }
  assert.equal(deriveChainSurface(restored, [root, a1, a2, b]).chains[0].mismatch, null)
})

test('deriveExtendPreview: the first extension from a plain 22-frame take — both clocks, the pinned tail, the verdicts pass (§4/§6)', () => {
  const stepId = uuid()
  const root = extTake(uuid(), { targetId: stepId, candidate: { frameCount: 22 }, modelIdentitiesStamped: true, referenceAssetIds: ['near-a', 'far-a'] })
  const fromKey = keySlot(0, { selectedCandidateId: 'c1', candidates: [{ ...candidate('import'), id: 'c1', assetReference: { assetId: 'near-a', relPath: null, kind: 'image' } }] })
  const toKey = keySlot(1, { selectedCandidateId: 'c2', candidates: [{ ...candidate('import'), id: 'c2', assetReference: { assetId: 'far-a', relPath: null, kind: 'image' } }] })
  const body = bodyOf([fromKey, toKey], [spanOf(fromKey.id, toKey.id, { stepSlots: [{ ...stepSlot(), id: stepId }] })])
  const preview = deriveExtendPreview(body, [root], root.attemptId, 56, [])
  assert.equal(preview.sourceLength, 22)
  assert.deepEqual(preview.clocks, { generated: 56, delivered: 34 })
  assert.deepEqual(preview.pinnedTail, { generated: { start: 0, end: 22 }, delivered: { start: 0, end: 22 } }, 'a plain root delivers its whole window — the pinned tail is the same range in both worlds')
  assert.ok(preview.ready, 'every verdict passes and the references resolve')
  assert.ok(preview.verdicts.every((verdict) => verdict.pass))
  // The compiled-caption context resolves the root span's selected keys.
  assert.equal(preview.references.near.assetId, 'near-a')
  assert.equal(preview.references.far.assetId, 'far-a')
})

test('deriveExtendPreview: the SECOND extension maps the pinned tail through the frozen trim — [34,56) generated is [12,34) delivered (§6)', () => {
  const stepId = uuid()
  const root = extTake(uuid(), { targetId: stepId, candidate: { frameCount: 22 }, modelIdentitiesStamped: true })
  const extension = extTake(uuid(), {
    extension: { sourceAttemptId: root.attemptId, targetLength: 56, movement: 'm', preservation: 'p', overrides: { medium: 'clean line on white' }, anchors: [] },
    candidate: { frameCount: 34 },
    modelIdentitiesStamped: true,
  })
  const fromKey = keySlot(0, { selectedCandidateId: 'c1', candidates: [{ ...candidate('import'), id: 'c1' }] })
  const toKey = keySlot(1, { selectedCandidateId: 'c2', candidates: [{ ...candidate('import'), id: 'c2' }] })
  const body = bodyOf([fromKey, toKey], [spanOf(fromKey.id, toKey.id, { stepSlots: [{ ...stepSlot(), id: stepId }] })])
  const preview = deriveExtendPreview(body, [root, extension], extension.attemptId, 56, [])
  assert.equal(preview.sourceLength, 56, 'the extension source\'s GENERATED length — never its delivered 34')
  assert.deepEqual(preview.pinnedTail, { generated: { start: 34, end: 56 }, delivered: { start: 12, end: 34 } }, 'the raw latent\'s world and the user\'s, through the ONE mapping')
  assert.deepEqual(preview.clocks, { generated: 56, delivered: 34 })
  assert.ok(preview.ready)
})

test('deriveExtendPreview names the recipe, collision, identity, and availability refusals — and the discontinuity advisory never refuses (§4/§10, Task 3 + Task 5 ruling b)', () => {
  const stepId = uuid()
  const nearKey = (assetId) => keySlot(0, { selectedCandidateId: 'c1', candidates: [{ ...candidate('import'), id: 'c1', assetReference: { assetId, relPath: null, kind: 'image' } }] })
  const root = extTake(uuid(), { targetId: stepId, candidate: { frameCount: 22 }, modelIdentitiesStamped: true, referenceAssetIds: ['near-a', 'far-a'] })
  const fromKey = nearKey('near-a')
  const toKey = keySlot(1, { selectedCandidateId: 'c2', candidates: [{ ...candidate('import'), id: 'c2', assetReference: { assetId: 'far-a', relPath: null, kind: 'image' } }] })
  const body = bodyOf([fromKey, toKey], [spanOf(fromKey.id, toKey.id, { stepSlots: [{ ...stepSlot(), id: stepId }] })])
  const byName = (verdicts, name) => verdicts.find((verdict) => verdict.name === name)

  // Off-grid target: the recipe refusal, the same name the route answers with.
  const offGrid = deriveExtendPreview(body, [root], root.attemptId, 50, [])
  assert.equal(offGrid.plan, null)
  assert.match(offGrid.recipeProblem, /17k\+5/)
  assert.equal(byName(offGrid.verdicts, 'Overlap recipe').pass, false)
  assert.equal(offGrid.ready, false)

  // An anchor inside the pinned head: the collision refusal NAMES the anchor.
  const collision = deriveExtendPreview(body, [root], root.attemptId, 56, [{ reference: 'rolling-near', frame: 3 }])
  const anchors = byName(collision.verdicts, 'Anchors')
  assert.equal(anchors.pass, false)
  assert.match(anchors.detail, /rolling-near/)
  assert.match(anchors.detail, /frame 3/)
  assert.match(anchors.detail, /pinned head/)

  // A stamp-less source: the named continuation-identity-missing condition.
  const stampless = extTake(uuid(), { targetId: stepId, candidate: { frameCount: 22 }, modelIdentitiesStamped: false })
  const identity = byName(deriveExtendPreview(body, [stampless], stampless.attemptId, 56, []).verdicts, 'Identity evidence')
  assert.equal(identity.pass, false)
  assert.match(identity.detail, /identity evidence is missing/i)

  // The unavailable carry: the named condition, the clip stays playable.
  const evicted = extTake(uuid(), { targetId: stepId, candidate: { frameCount: 22 }, continuation: { state: 'unavailable' } })
  const carry = byName(deriveExtendPreview(body, [evicted], evicted.attemptId, 56, []).verdicts, 'Carry')
  assert.equal(carry.pass, false)
  assert.match(carry.detail, /unavailable/)

  // The identity-discontinuity ADVISORY: the current keys differ from the
  // frozen references — named, but pass stays true (Task 5's ruling b).
  const changedKey = nearKey('a-different-image')
  const changedBody = bodyOf([changedKey, toKey], [spanOf(changedKey.id, toKey.id, { stepSlots: [{ ...stepSlot(), id: stepId }] })])
  const advisory = byName(deriveExtendPreview(changedBody, [root], root.attemptId, 56, []).verdicts, 'Identity continuity')
  assert.equal(advisory.pass, true)
  assert.equal(advisory.advisory, true)
  assert.match(advisory.detail, /differ/)
})
