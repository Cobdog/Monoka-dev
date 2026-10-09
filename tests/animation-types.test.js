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
  parseContinuationBinding,
  parseModelContentIdentity,
  parseModelContentIdentities,
  chainMismatch,
  continuationGeneratedFrame,
  animationInputHash,
  readCarrySaveRecipe,
} from '../shared/animation/types'

const uuid = () => randomUUID()

// A fully-populated valid body: two keys (three candidates across the four
// origins), one span (two step slots — one with attempts + a selected rolling
// reference, one empty), one extension chain (two window slots — one with
// alternatives + a selection + its recorded source, one locked + stale with
// the chain's own reason vocabulary), one binding version, one editorial
// contribution, every optional field exercised somewhere.
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
  const chainRoot = uuid()
  const window1 = uuid()
  const window2 = uuid()
  const attemptExtA = uuid()
  const attemptExtB = uuid()
  const attemptExtC = uuid()
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
    chains: [
      {
        rootAttemptId: chainRoot,
        windows: [
          { id: window1, order: 0, attempts: [attemptExtA, attemptExtB], selectedCandidateId: attemptExtA, lock: false, sourceAttemptId: chainRoot, stale: false, staleReasons: [] },
          { id: window2, order: 1, attempts: [attemptExtC], selectedCandidateId: null, lock: true, sourceAttemptId: attemptExtA, stale: true, staleReasons: ['ancestry', 'intent'] },
        ],
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
  // The extension chains (lane Task 4, §4): shape + the chain's own pointer
  // integrity — a window's selection names one of ITS alternatives, the
  // recorded source is a UUID, and one window per attempt within a chain.
  rejects('chains is not an array', (body) => { body.chains = { 0: body.chains[0] } })
  rejects('a chain root that is not a UUID', (body) => { body.chains[0].rootAttemptId = 'not-a-uuid' })
  rejects('two chains rooted at the same attempt', (body) => { body.chains.push(JSON.parse(JSON.stringify(body.chains[0]))) })
  rejects('a window id shared across chains', (body) => {
    const branch = JSON.parse(JSON.stringify(body.chains[0]))
    branch.rootAttemptId = branch.windows[0].attempts[1]
    branch.windows = [{ ...branch.windows[0], id: body.chains[0].windows[1].id, attempts: [uuid()] }]
    body.chains.push(branch)
  })
  rejects('a window selection pointing outside its own slot', (body) => { body.chains[0].windows[0].selectedCandidateId = uuid() })
  rejects('a window whose recorded source is not a UUID', (body) => { body.chains[0].windows[0].sourceAttemptId = 'nope' })
  rejects('two windows of one chain sharing an order', (body) => { body.chains[0].windows[1].order = 0 })
  rejects('one attempt sitting in two windows of the same chain', (body) => { body.chains[0].windows[1].attempts.push(body.chains[0].windows[0].attempts[0]) })
  rejects('a window staleReasons entry that is not a string', (body) => { body.chains[0].windows[0].staleReasons = [7] })
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

test('parseModelContentIdentities round-trips identity sets and refuses every malformation (extension lane Task 3)', () => {
  const hex = (fill) => fill.repeat(64)
  const valid = [
    { name: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', digest: hex('a'), bytes: 42 },
    { name: 'sub/dir/h3_tween_step12000.safetensors', digest: hex('b'), bytes: 1 },
  ]
  // The round-trip: a non-empty set of well-formed, name-unique identities.
  assert.deepEqual(parseModelContentIdentities(valid), valid, 'the set round-trips verbatim')
  assert.deepEqual(parseModelContentIdentity(valid[0]), valid[0], 'a single identity round-trips')

  // Identity malformation: every field has a named refusal shape.
  assert.equal(parseModelContentIdentity(null), null, 'not an object')
  assert.equal(parseModelContentIdentity({ name: '', digest: hex('a'), bytes: 1 }), null, 'an empty name')
  assert.equal(parseModelContentIdentity({ name: 'x'.repeat(513), digest: hex('a'), bytes: 1 }), null, 'a pathologically long name')
  assert.equal(parseModelContentIdentity({ name: 'x.safetensors', digest: 'not-hex', bytes: 1 }), null, 'a non-hex digest')
  assert.equal(parseModelContentIdentity({ name: 'x.safetensors', digest: hex('A'), bytes: 1 }), null, 'an uppercase digest — the canonical form is lowercase hex')
  assert.equal(parseModelContentIdentity({ name: 'x.safetensors', digest: hex('a').slice(0, 63), bytes: 1 }), null, 'a short digest')
  assert.equal(parseModelContentIdentity({ name: 'x.safetensors', digest: hex('a'), bytes: 0 }), null, 'a zero byte count')
  assert.equal(parseModelContentIdentity({ name: 'x.safetensors', digest: hex('a'), bytes: 1.5 }), null, 'a fractional byte count')

  // Set malformation: empty, non-array, a malformed entry, a duplicate name.
  assert.equal(parseModelContentIdentities([]), null, 'an empty set never freezes — a binding carries the full slot set')
  assert.equal(parseModelContentIdentities('no'), null, 'not an array')
  assert.equal(parseModelContentIdentities([valid[0], { name: 'y.safetensors', digest: 'z', bytes: 2 }]), null, 'one malformed entry refuses the whole set')
  assert.equal(parseModelContentIdentities([valid[0], { ...valid[0] }]), null, 'a duplicate name refuses — one identity per slot')
})

// ---------------------------------------------------------------------------
// the extension lane's document model (Task 4, spec §4/§5): the chains'
// widening read, the full continuation binding, and the derived mismatch.
// ---------------------------------------------------------------------------

test('a body without chains parses as the pre-chain document — the widening read (lane Task 4)', () => {
  const body = makeBody()
  delete body.chains
  const parsed = parseAnimationDocumentBody(body)
  assert.notEqual(parsed, null, 'a pre-chain body parses whole')
  assert.deepEqual(parsed.chains, [], 'the absent collection reads as empty — a widening read, never a downgrade')
})

test('parseContinuationBinding round-trips the full §5 record and refuses every malformation (lane Task 4)', () => {
  const sha256 = (label) => require('node:crypto').createHash('sha256').update(label).digest('hex')
  const binding = {
    sourceAttemptId: uuid(),
    modelIdentities: [
      { name: 'ref2va_int8.safetensors', digest: sha256('unet'), bytes: 9_000_000_000 },
      { name: 'h3_tween_adapter.safetensors', digest: sha256('adapter'), bytes: 300_000_000 },
    ],
    windowCoordinates: { generatedStart: 0, generatedEnd: 21, phase: '17k+5' },
    headTrim: 5,
    deliveredRange: { start: 0, end: 16 },
    artifact: { artifactId: uuid(), digest: sha256('carry-bytes') },
    recipe: { mode: 'mctx-latent-tail', contextLength: 22, schedule: { shift: '12/3', cfg: 1 }, steps: 30, seed: 7, recipeVersion: 'extension-v1' },
    conditioning: { caption: 'she strides on through the rain, coat swinging', compilerVersion: '2', referenceAssetIds: [uuid(), uuid()] },
  }
  const parsed = parseContinuationBinding(binding)
  assert.notEqual(parsed, null, 'the full record parses')
  assert.deepEqual(parsed, binding, 'every §5 field survives the round-trip verbatim')

  // The seed alone is NOT a full record — the strict reader refuses the
  // prefix (the seed reader is the dispatch gate's own narrow, Task 3).
  const seed = { sourceAttemptId: binding.sourceAttemptId, modelIdentities: binding.modelIdentities }
  assert.equal(parseContinuationBinding(seed), null, 'the seed alone is not the full record')

  const refuse = (label, mutate) => {
    const mutated = JSON.parse(JSON.stringify(binding))
    mutate(mutated)
    assert.equal(parseContinuationBinding(mutated), null, label)
  }
  refuse('a source that is not a UUID', (b) => { b.sourceAttemptId = 'nope' })
  refuse('a malformed identity set', (b) => { b.modelIdentities[0].digest = 'not-hex' })
  refuse('windowCoordinates missing', (b) => { delete b.windowCoordinates })
  refuse('a degenerate generated range', (b) => { b.windowCoordinates.generatedEnd = b.windowCoordinates.generatedStart })
  refuse('an empty phase', (b) => { b.windowCoordinates.phase = '' })
  refuse('a negative head trim', (b) => { b.headTrim = -1 })
  refuse('a degenerate delivered range', (b) => { b.deliveredRange.end = b.deliveredRange.start })
  refuse('a non-UUID artifact id', (b) => { b.artifact.artifactId = 'x' })
  refuse('a non-sha256 artifact digest', (b) => { b.artifact.digest = 'zz' })
  refuse('a missing schedule', (b) => { delete b.recipe.schedule })
  refuse('a zero context length', (b) => { b.recipe.contextLength = 0 })
  refuse('a zero step count', (b) => { b.recipe.steps = 0 })
  refuse('a negative seed', (b) => { b.recipe.seed = -1 })
  refuse('an empty recipe version', (b) => { b.recipe.recipeVersion = '' })
  refuse('an empty caption', (b) => { b.conditioning.caption = '' })
  refuse('a 20,001-character caption', (b) => { b.conditioning.caption = 'x'.repeat(20_001) })
  refuse('a non-string reference asset id', (b) => { b.conditioning.referenceAssetIds = [7] })
  refuse('a non-string compiler version', (b) => { b.conditioning.compilerVersion = 2 })

  // The coordinate mapping (§6's explicit d ↔ g = d + trim).
  assert.equal(continuationGeneratedFrame(0, 5), 5, 'delivered frame 0 is generated frame 5 under a 5-frame head trim')
  assert.equal(continuationGeneratedFrame(16, 5), 21, 'the mapping holds at the delivered tail')
})

test('chainMismatch walks source-attempt edges: consistent chains pass, a reselected ancestor names the mismatch (lane Task 4)', () => {
  const root = uuid()
  const a1 = uuid()
  const a2 = uuid()
  const b1 = uuid()
  const c1 = uuid()
  const w1 = uuid()
  const w2 = uuid()
  const w3 = uuid()
  // A1's binding: the root (an extension of the source take); B1 binds A1;
  // C1 binds B1 — the three-generation chain.
  const sources = new Map([[a1, root], [a2, root], [b1, a1], [c1, b1]])
  const sourceOf = (attemptId) => sources.get(attemptId) ?? null
  const chain = {
    rootAttemptId: root,
    windows: [
      { id: w1, order: 0, attempts: [a1, a2], selectedCandidateId: a1, lock: false, sourceAttemptId: root, stale: false, staleReasons: [] },
      { id: w2, order: 1, attempts: [b1], selectedCandidateId: b1, lock: false, sourceAttemptId: a1, stale: false, staleReasons: [] },
      { id: w3, order: 2, attempts: [c1], selectedCandidateId: c1, lock: false, sourceAttemptId: b1, stale: false, staleReasons: [] },
    ],
  }

  assert.equal(chainMismatch(chain, sourceOf), null, 'a chain whose ancestry edges all match the current selections is consistent')

  // B extends A1; the ancestor slot now selects A2 — §4's exact case.
  chain.windows[0].selectedCandidateId = a2
  const mismatch = chainMismatch(chain, sourceOf)
  assert.deepEqual(
    mismatch,
    { windowSlotId: w2, selectedAttemptId: b1, sourceAttemptId: a1, ancestorSlotId: w1, expectedSelection: a1 },
    'the mismatch names the descendant, its selected take, the frozen source, the ancestor slot, and the selection that restores the path',
  )
  // The lock never hides it: the state is derived, not a command.
  chain.windows[0].lock = true
  assert.notEqual(chainMismatch(chain, sourceOf), null, 'a locked ancestor still mismatches visibly')

  // The resolution the spec names first — reselect the compatible ancestry:
  chain.windows[0].lock = false
  chain.windows[0].selectedCandidateId = a1
  assert.equal(chainMismatch(chain, sourceOf), null, 'reselecting the compatible ancestry restores the path')

  // A source outside the chain (a dangling edge — corruption the derivation
  // surfaces rather than papers over).
  sources.set(b1, uuid())
  const dangling = chainMismatch(chain, sourceOf)
  assert.equal(dangling.ancestorSlotId, null, 'a source that is not a member of the chain reports no ancestor slot')
  assert.equal(dangling.sourceAttemptId, sources.get(b1))

  // Restore consistency; an UNSELECTED window carries no live edge of its
  // own — skipped, never mismatched (a fresh, unreviewed window). But an
  // ancestor whose selection is null while a descendant binds its attempt
  // IS a mismatch: null is not the attempt the descendant was conditioned
  // on (§4's letter).
  sources.set(b1, a1)
  chain.windows[2].selectedCandidateId = null
  assert.equal(chainMismatch(chain, sourceOf), null, 'an unselected window carries no live edge — nothing to check for it')
  chain.windows[1].selectedCandidateId = null
  chain.windows[2].selectedCandidateId = c1
  const unselectedAncestor = chainMismatch(chain, sourceOf)
  assert.deepEqual(
    unselectedAncestor,
    { windowSlotId: w3, selectedAttemptId: c1, sourceAttemptId: b1, ancestorSlotId: w2, expectedSelection: b1 },
    'a descendant of an UNSELECTED ancestor mismatches — the edge cannot assemble from no selection',
  )
})
