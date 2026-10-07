// The animation domain types + guards suite (task 1 of the animation-authoring
// module, spec 2026-10-06-animation-authoring-module-design.md §5/§7.2/§11.2).
//
// The module under test is the shared module's first file. Vitest compiles the
// TS natively (the fetcher suite's '../src/components/FetchBrowser' import is
// the precedent), so this suite imports it directly — no VM harness, no build.

import { test } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  ANIMATION_MEDIA,
  FACING_TERMS,
  isUuid,
  isFacingTerm,
  isMediumString,
  parseKeyCandidate,
  parseAnimationDocumentBody,
  animationInputHash,
} from '../shared/animation/types'

const uuid = () => randomUUID()

// A fully-populated valid body: two keys (three candidates across the four
// origins), one span (two step slots — one with attempts + a selected rolling
// reference, one empty), one binding version, one editorial contribution,
// every optional field exercised somewhere.
function makeBody() {
  const keyA = uuid()
  const keyB = uuid()
  const candidateImport = uuid()
  const candidateHero = uuid()
  const candidatePromoted = uuid()
  const span = uuid()
  const step1 = uuid()
  const step2 = uuid()
  const attemptHero = uuid()
  const attemptA = uuid()
  const attemptB = uuid()
  const attemptEditorial = uuid()
  return {
    keys: [
      {
        id: keyA,
        order: 0,
        selectedCandidateId: candidateHero,
        candidates: [
          {
            id: candidateImport,
            assetReference: { assetId: uuid(), relPath: null, kind: 'image' },
            origin: 'import',
            provenance: { assetId: uuid() },
            poseDescription: null,
            facing: null,
          },
          {
            id: candidateHero,
            assetReference: { assetId: uuid(), relPath: 'library/courier-hero.png', kind: 'image' },
            origin: 'hero',
            provenance: {
              assetId: uuid(),
              sourceTake: uuid(),
              sourceFrame: 14,
              generatingOp: attemptHero,
              inputRevisions: { pose: 'r2', identity: 'r1' },
            },
            poseDescription: 'mid-stride, arms pumping',
            facing: 'screen-left',
          },
        ],
        lock: false,
      },
      {
        id: keyB,
        order: 1,
        selectedCandidateId: null,
        candidates: [
          {
            id: candidatePromoted,
            assetReference: { assetId: uuid(), relPath: 'takes/take-003.png', kind: 'image' },
            origin: 'frame-promotion',
            provenance: { assetId: uuid(), sourceTake: uuid(), sourceFrame: 7 },
            poseDescription: 'planted, weight forward',
            facing: 'back to camera',
          },
        ],
        lock: true,
      },
    ],
    spans: [
      {
        id: span,
        fromKeyId: keyA,
        toKeyId: keyB,
        intent: { movement: 'walks left to right across the frame', preservation: 'coat hem stays consistent' },
        overrides: {
          medium: 'flat cel colour on white',
          scene: 'a rain-slick street',
          camera: { description: 'low wide', reason: 'establishes the alley' },
        },
        stepSlots: [
          { id: step1, attempts: [attemptA, attemptB], selectedRollingReference: { attemptId: attemptA, frameIndex: 11 } },
          { id: step2, attempts: [], selectedRollingReference: null },
        ],
        stale: true,
        staleReasons: ['binding', 'pose'],
      },
    ],
    bindingHistory: [
      {
        version: 1,
        characterDescription: 'a lanky courier in a long coat',
        referenceAssetIds: [uuid(), uuid()],
        medium: 'clean line on white',
        initialKeyAssetId: uuid(),
        boundAt: 1759800000000,
      },
    ],
    activeBindingVersion: 1,
    editorial: [{ id: uuid(), spanId: span, attemptId: attemptEditorial, inFrame: 0, outFrame: 18, holdDuration: 4 }],
    settings: { outputWidth: 1280, outputHeight: 720, fps: 24, steps: 3 },
  }
}

// Run parseAnimationDocumentBody over a mutated copy of the valid body and
// assert it rejects (returns null — the caller decides 400 vs degrade).
const rejects = (label, mutate) => {
  const body = makeBody()
  mutate(body)
  assert.equal(parseAnimationDocumentBody(body), null, label)
}

test('parseAnimationDocumentBody round-trips a fully-populated valid body', () => {
  const body = makeBody()
  const parsed = parseAnimationDocumentBody(body)
  assert.notEqual(parsed, null, 'the valid body parses')
  assert.deepEqual(parsed, body, 'every field survives the round-trip')
})

test('parseAnimationDocumentBody returns null on malformation', () => {
  assert.equal(parseAnimationDocumentBody(42), null, 'a non-object (number)')
  assert.equal(parseAnimationDocumentBody(null), null, 'a non-object (null)')
  assert.equal(parseAnimationDocumentBody('body'), null, 'a non-object (string)')
  assert.equal(parseAnimationDocumentBody([makeBody()]), null, 'an array is not a body')
  rejects('keys is not an array', (body) => { body.keys = { 0: body.keys[0] } })
  rejects("a candidate origin outside the vocabulary ('magic')", (body) => { body.keys[0].candidates[0].origin = 'magic' })
  rejects('a facing outside FACING_TERMS', (body) => { body.keys[0].candidates[1].facing = 'left-ish' })
  rejects('a span referencing a missing key id', (body) => { body.spans[0].toKeyId = uuid() })
  rejects('a negative holdDuration', (body) => { body.editorial[0].holdDuration = -1 })
})

test('parseAnimationDocumentBody enforces the internal pointer integrity', () => {
  rejects('a selectedCandidateId pointing outside its own slot', (body) => { body.keys[0].selectedCandidateId = uuid() })
  rejects('a rolling reference pointing at an attempt outside its slot', (body) => {
    body.spans[0].stepSlots[0].selectedRollingReference = { attemptId: uuid(), frameIndex: 3 }
  })
  rejects('an activeBindingVersion no binding history entry carries', (body) => { body.activeBindingVersion = 99 })
  rejects('two binding history entries sharing a version', (body) => {
    body.bindingHistory.push({ ...body.bindingHistory[0], boundAt: 1759800001000 })
  })
  rejects('two key slots sharing an id', (body) => { body.keys[1].id = body.keys[0].id })
  // The pre-binding shape is the one allowed divergence: empty history with
  // activeBindingVersion 0 (a document created before its first binding).
  const preBinding = makeBody()
  preBinding.bindingHistory = []
  preBinding.activeBindingVersion = 0
  assert.notEqual(parseAnimationDocumentBody(preBinding), null, 'empty binding history + version 0 parses')
})

test('the closed vocabularies are the spec-fixed byte-identical strings', () => {
  assert.deepEqual(ANIMATION_MEDIA, ['clean line on white', 'flat black-and-white animatic', 'flat cel colour on white'])
  assert.deepEqual(FACING_TERMS, ['toward camera', 'back to camera', 'screen-left', 'screen-right'])
  assert.equal(isMediumString('flat cel colour on white'), true)
  assert.equal(isMediumString('oil on canvas'), false)
  assert.equal(isMediumString(7), false)
  assert.equal(isFacingTerm('screen-left'), true)
  assert.equal(isFacingTerm('left'), false)
  assert.equal(isFacingTerm(null), false)
})

test('isUuid accepts canonical UUIDv4 and rejects non-UUIDs', () => {
  assert.equal(isUuid(randomUUID()), true)
  assert.equal(isUuid(randomUUID()), true)
  assert.equal(isUuid('123e4567-e89b-42d3-a456-426614174000'), true, 'a canonical v4 literal')
  assert.equal(isUuid(''), false)
  assert.equal(isUuid(42), false)
  assert.equal(isUuid('not-a-uuid'), false)
  assert.equal(isUuid('123e4567e89b42d3a456426614174000'), false, 'the right hex without dashes is not canonical')
})

test('parseKeyCandidate round-trips a candidate and rejects malformation', () => {
  const candidate = makeBody().keys[0].candidates[1]
  assert.deepEqual(parseKeyCandidate(candidate), candidate, 'the hero candidate round-trips')
  assert.equal(parseKeyCandidate({}), null)
  assert.equal(parseKeyCandidate(null), null)
  const badFacing = { ...candidate, facing: 7 }
  assert.equal(parseKeyCandidate(badFacing), null, 'a non-string facing')
  const badProvenance = { ...candidate, provenance: { assetId: '' } }
  assert.equal(parseKeyCandidate(badProvenance), null, 'an empty provenance assetId')
})

test('animationInputHash is order-stable and difference-sensitive', () => {
  const snapshot = {
    tool: 'tween',
    targetId: uuid(),
    references: [
      {
        role: 'current-key',
        assetReference: { assetId: uuid(), relPath: null, kind: 'image' },
        poseDescription: 'planted foot, weight forward',
        facing: 'toward camera',
      },
      {
        role: 'fixed-far',
        assetReference: { assetId: uuid(), relPath: 'assets/far.png', kind: 'image' },
        poseDescription: null,
        facing: 'screen-right',
      },
    ],
    caption: 'the courier crosses the boulevard',
    compilerVersion: 'animation-compiler/0.1.0',
    settings: { steps: 6, cfg: 3.5, seed: 42 },
    documentRevision: 12,
  }
  // Same values, every object's keys inserted in a different order.
  const permuted = {
    documentRevision: 12,
    settings: { seed: 42, cfg: 3.5, steps: 6 },
    compilerVersion: 'animation-compiler/0.1.0',
    caption: 'the courier crosses the boulevard',
    references: [
      {
        facing: 'toward camera',
        poseDescription: 'planted foot, weight forward',
        assetReference: { kind: 'image', relPath: null, assetId: snapshot.references[0].assetReference.assetId },
        role: 'current-key',
      },
      {
        assetReference: { assetId: snapshot.references[1].assetReference.assetId, kind: 'image', relPath: 'assets/far.png' },
        facing: 'screen-right',
        poseDescription: null,
        role: 'fixed-far',
      },
    ],
    targetId: snapshot.targetId,
    tool: 'tween',
  }
  const baseline = animationInputHash(snapshot)
  assert.match(baseline, /^[0-9a-f]{64}$/, 'the digest is 64 lowercase hex chars')
  assert.equal(animationInputHash(permuted), baseline, 'key-order permutation hashes identically')
  assert.equal(animationInputHash(snapshot), baseline, 'the same snapshot hashes identically')
  assert.notEqual(animationInputHash({ ...snapshot, caption: 'the courier pauses at the kerb' }), baseline, 'a caption change differs')
  assert.notEqual(
    animationInputHash({
      ...snapshot,
      references: [
        { ...snapshot.references[0], assetReference: { ...snapshot.references[0].assetReference, assetId: uuid() } },
        snapshot.references[1],
      ],
    }),
    baseline,
    'a reference assetId change differs',
  )
  assert.notEqual(animationInputHash({ ...snapshot, settings: { steps: 6, cfg: 3.5, seed: 43 } }), baseline, 'a settings change differs')
  assert.notEqual(animationInputHash({ ...snapshot, settings: { steps: 6, cfg: 3.5, seed: 42, extra: 1 } }), baseline, 'an added settings key differs')
})
