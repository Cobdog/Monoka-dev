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
//   - the review position resolves the newest attempt's target onto the
//     timeline (hero/sequence → the key, tween → the span owning the step
//     slot), null when nothing targets the timeline.

import { test } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { deriveTimeline, deriveReviewPosition } from '../src/animation/timelineModel'

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

test('deriveReviewPosition resolves the newest attempt onto the timeline', () => {
  const keyA = keySlot(0)
  const keyB = keySlot(1)
  const tweenStep = stepSlot()
  const theSpan = spanOf(keyA.id, keyB.id, { stepSlots: [tweenStep] })
  const body = bodyOf([keyA, keyB], [theSpan])
  assert.equal(deriveReviewPosition(body, []), null, 'no attempts — no review position (the marker is absent, not zero)')
  const heroAttempt = { attemptId: uuid(), tool: 'hero', targetId: keyB.id }
  assert.deepEqual(deriveReviewPosition(body, [heroAttempt]), { kind: 'key', id: keyB.id }, 'a hero attempt targets a key slot')
  const sequenceAttempt = { attemptId: uuid(), tool: 'sequence', targetId: keyA.id }
  assert.deepEqual(deriveReviewPosition(body, [sequenceAttempt]), { kind: 'key', id: keyA.id }, 'a sequence attempt targets its window-start key')
  const tweenAttempt = { attemptId: uuid(), tool: 'tween', targetId: tweenStep.id }
  assert.deepEqual(deriveReviewPosition(body, [tweenAttempt]), { kind: 'span', id: theSpan.id }, 'a tween attempt targets a step slot — the review position is the OWNING span')
  assert.deepEqual(deriveReviewPosition(body, [heroAttempt, tweenAttempt]), { kind: 'span', id: theSpan.id }, 'the NEWEST attempt wins (attempts arrive oldest-first)')
  assert.equal(deriveReviewPosition(body, [{ attemptId: uuid(), tool: 'tween', targetId: uuid() }]), null, 'a dangling target resolves to no position, never a guess')
})
