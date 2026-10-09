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
  mediumChipId,
  mediumFromChipId,
  parseKeyCandidate,
  parseAnimationDocumentBody,
  animationInputHash,
  readCarrySaveRecipe,
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
          { id: step1, attempts: [attemptA, attemptB], selectedRollingReference: { attemptId: attemptA, frameIndex: 11, poseDescription: 'weight forward over the planted left foot', facing: 'screen-left', frameAsset: { assetId: 'canvas-blobs/ab/frame-11.png', relPath: 'canvas-blobs/ab/frame-11.png', kind: 'image' } } },
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
    body.spans[0].stepSlots[0].selectedRollingReference = { attemptId: uuid(), frameIndex: 3, poseDescription: null, facing: null }
  })
  rejects('an activeBindingVersion no binding history entry carries', (body) => { body.activeBindingVersion = 99 })
  rejects('two binding history entries sharing a version', (body) => {
    body.bindingHistory.push({ ...body.bindingHistory[0], boundAt: 1759800001000 })
  })
  rejects('two key slots sharing an id', (body) => { body.keys[1].id = body.keys[0].id })
  // Task 13 — the spanless editorial lane (§11.2: a sequence attempt owns no
  // span, so its contribution carries spanId null — a whole-scene render);
  // a NON-null spanId still must name an existing span.
  const spanless = makeBody()
  spanless.editorial.push({ id: uuid(), spanId: null, attemptId: uuid(), inFrame: 0, outFrame: 0, holdDuration: 12 })
  assert.notEqual(parseAnimationDocumentBody(spanless), null, 'a spanless contribution parses (the whole-scene lane)')
  rejects('an editorial contribution naming a span that does not exist', (body) => { body.editorial[0].spanId = uuid() })
  rejects('an editorial spanId that is neither null nor a UUID', (body) => { body.editorial[0].spanId = 'not-a-uuid' })
  // The pre-binding shape is the one allowed divergence: empty history with
  // activeBindingVersion 0 (a document created before its first binding).
  const preBinding = makeBody()
  preBinding.bindingHistory = []
  preBinding.activeBindingVersion = 0
  assert.notEqual(parseAnimationDocumentBody(preBinding), null, 'empty binding history + version 0 parses')
})

// Wave 2a (§6.4's ruling): the rolling-reference pointer carries the frame's
// image-bound annotation — one {poseDescription, facing} per selected frame,
// both nullable. The pointer-integrity rule (the attempt must live in its own
// slot) is unchanged; the annotation widens the shape without loosening it.
test('the rolling-reference annotation round-trips; the pre-wave-2a shape reads as nulls; malformation rejects', () => {
  const body = makeBody()
  const parsed = parseAnimationDocumentBody(body)
  assert.notEqual(parsed, null)
  assert.deepEqual(
    parsed.spans[0].stepSlots[0].selectedRollingReference,
    {
      attemptId: body.spans[0].stepSlots[0].selectedRollingReference.attemptId, frameIndex: 11,
      poseDescription: 'weight forward over the planted left foot', facing: 'screen-left',
      frameAsset: { assetId: 'canvas-blobs/ab/frame-11.png', relPath: 'canvas-blobs/ab/frame-11.png', kind: 'image' },
    },
    'the annotated pointer survives the round-trip',
  )
  // The pre-wave-2a wire shape (no annotation fields) is the one widening
  // normalization family: rows the older build wrote must keep parsing — their
  // whole document would otherwise become unservable — and "missing" is
  // exactly "unannotated".
  const legacy = makeBody()
  const legacyPointer = { attemptId: legacy.spans[0].stepSlots[0].selectedRollingReference.attemptId, frameIndex: 11 }
  legacy.spans[0].stepSlots[0].selectedRollingReference = legacyPointer
  const legacyParsed = parseAnimationDocumentBody(legacy)
  assert.notEqual(legacyParsed, null, 'a pointer without annotation fields parses (the widening read)')
  assert.deepEqual(
    legacyParsed.spans[0].stepSlots[0].selectedRollingReference,
    { ...legacyPointer, poseDescription: null, facing: null, frameAsset: null },
    'absent annotation fields read as nulls',
  )
  rejects('a non-string, non-null pose description', (mutated) => {
    mutated.spans[0].stepSlots[0].selectedRollingReference.poseDescription = 7
  })
  rejects('a facing outside FACING_TERMS on the annotation', (mutated) => {
    mutated.spans[0].stepSlots[0].selectedRollingReference.facing = 'leftward'
  })
})

// Codex batch C, I11 — the rolling-reference pointer carries the frame's OWN
// extracted image (frameAsset), recorded at selection time by the route's
// §7.2.2 resolution. The same widening doctrine as the annotation: the
// pre-I11 shape reads as null (the pointer annotates beside the honest
// placeholder until its frame is re-selected), a well-formed asset
// round-trips, and a malformed one refuses the whole body.
test('the rolling-reference frameAsset round-trips; the pre-I11 shape reads as null; malformation rejects', () => {
  const body = makeBody()
  const pointer = body.spans[0].stepSlots[0].selectedRollingReference
  // The pre-I11 wire shape (annotation present, no frameAsset) parses with
  // frameAsset null — rows the older build wrote stay servable.
  const legacy = makeBody()
  const legacyPointer = { attemptId: legacy.spans[0].stepSlots[0].selectedRollingReference.attemptId, frameIndex: 11, poseDescription: 'weight forward over the planted left foot', facing: 'screen-left' }
  legacy.spans[0].stepSlots[0].selectedRollingReference = legacyPointer
  const legacyParsed = parseAnimationDocumentBody(legacy)
  assert.notEqual(legacyParsed, null, 'a pointer without frameAsset parses (the widening read)')
  assert.equal(legacyParsed.spans[0].stepSlots[0].selectedRollingReference.frameAsset, null, 'an absent frameAsset reads as null')
  // A well-formed asset survives the round-trip verbatim.
  const parsed = parseAnimationDocumentBody(body)
  assert.deepEqual(parsed.spans[0].stepSlots[0].selectedRollingReference.frameAsset, pointer.frameAsset, 'the recorded frame asset round-trips')
  // Malformation refuses: the asset reference shape is the shared contract.
  rejects('a frameAsset without an asset id', (mutated) => {
    mutated.spans[0].stepSlots[0].selectedRollingReference.frameAsset = { relPath: 'canvas-blobs/ab/x.png', kind: 'image' }
  })
  rejects('a frameAsset of an unknown kind', (mutated) => {
    mutated.spans[0].stepSlots[0].selectedRollingReference.frameAsset = { assetId: 'x', relPath: null, kind: 'audio' }
  })
  rejects('a non-null, non-string relPath on the frameAsset', (mutated) => {
    mutated.spans[0].stepSlots[0].selectedRollingReference.frameAsset = { assetId: 'x', relPath: 3, kind: 'image' }
  })
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

// The medium chip keys (task 7): deterministic slugs, no spaces, and the
// round-trip covers the whole vocabulary — both medium pickers derive
// through this one mapping.
test('mediumChipId derives space-free slugs that round-trip the vocabulary', () => {
  for (const medium of ANIMATION_MEDIA) {
    const chipId = mediumChipId(medium)
    assert.match(chipId, /^anim-medium-[a-z-]+$/, `${medium} derives a lowercase slug`)
    assert.ok(!/\s/.test(chipId), `${medium}'s slug carries no spaces`)
    assert.equal(mediumFromChipId(chipId), medium, `${medium} round-trips`)
  }
  assert.equal(mediumFromChipId('anim-medium-oil-on-canvas'), null, 'an unknown slug maps to null, never a guess')
  assert.equal(mediumFromChipId(''), null)
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

// The extension lane's receipt-verify half (Task 2): the save-recipe version
// is read FROM the carry file's own safetensors metadata — the pack's framing
// (u64 LE header length + JSON header), parsed environment-neutrally.
test('readCarrySaveRecipe reads the pack metadata from the safetensors framing; malformation refuses', () => {
  const framed = (header) => {
    const headerBuf = Buffer.from(JSON.stringify(header), 'utf8')
    const buf = Buffer.alloc(8 + headerBuf.length + 16)
    buf.writeBigUInt64LE(BigInt(headerBuf.length), 0)
    headerBuf.copy(buf, 8)
    return buf
  }
  const withMetadata = framed({ __metadata__: { format: 'h3_motion_context_av_v1' }, video: { dtype: 'F16', shape: [22, 16, 48, 84], data_offsets: [0, 14] } })
  assert.equal(readCarrySaveRecipe(withMetadata), 'h3_motion_context_av_v1', 'the metadata format is the save-recipe version, read from the file')
  assert.equal(readCarrySaveRecipe(framed({})), null, 'no metadata block refuses')
  assert.equal(readCarrySaveRecipe(framed({ __metadata__: {} })), null, 'no format key refuses')
  assert.equal(readCarrySaveRecipe(framed({ __metadata__: { format: '' } })), null, 'an empty format refuses')
  assert.equal(readCarrySaveRecipe(framed({ __metadata__: { format: 7 } })), null, 'a non-string format refuses')
  // Framing malformation: short bytes, a header length past the buffer, and
  // garbage JSON all refuse — never a guessed version.
  assert.equal(readCarrySaveRecipe(Buffer.alloc(4)), null, 'shorter than the framing prefix')
  assert.equal(readCarrySaveRecipe(Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])), null, 'a header length far past the buffer')
  const overlong = Buffer.alloc(24)
  overlong.writeBigUInt64LE(16n, 0)
  overlong.fill(0x7f, 8, 24) // 16 bytes of non-JSON
  assert.equal(readCarrySaveRecipe(overlong), null, 'unparseable header JSON refuses')
  // A subarray view (non-zero byteOffset) still reads the framing correctly.
  const padded = Buffer.concat([Buffer.alloc(3), withMetadata])
  assert.equal(readCarrySaveRecipe(padded.subarray(3)), 'h3_motion_context_av_v1', 'a non-zero-offset view parses the same file')
})
