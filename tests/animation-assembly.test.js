// The assembly-edge agreement suite (task 15a of the animation-authoring
// module, k2q0n9s — the T14 review Important-1, re-ledgered per the T15
// review): THE ANTI-DIVERGENCE PIN. Two derivations decide whether an
// editorial contribution is burnable — server/animation/export.ts's gate
// (deriveExportPlan, the authority that refuses at click time) and
// src/animation/timelineModel.ts's preview (deriveAssembledSequence, the
// surface that must foreshadow the refusal BEFORE the click). Task 15a
// moved the LENGTH/EDGE semantics both read into shared/animation/
// assembly.ts (the shared/ dual-build contract, like compiler.ts); this
// suite walks a table of edge cases through BOTH derivations and asserts
// they AGREE — for every row, the preview's per-entry problem is non-null
// exactly when the gate refuses that entry, and the shared text after each
// side's own label is byte-identical.
//
//   - the four formerly divergent classes: the degenerate range pointing
//     past the clip's end, the zero-frame phantom row, odd output
//     dimensions, the export ceiling (plus the wide out-of-range class,
//     unified here too so the wording can never drift again);
//   - the legal shapes: the full-clip range, a portion + hold, the legal
//     degenerate range, the inFrame==outFrame==frameCount boundary on BOTH
//     sides of the rule (the last existing frame is legal, one past it is
//     not);
//   - the unlanded entry: deliberately NOT a shared class — the shared
//     verdict answers problem:null and each side keeps its own wording;
//   - the document-level verdicts (empty / odd dims / ceiling): the gate's
//     refusals and the preview's problems carry the same strings, in the
//     same order.
//
// The gate's refusal strings are the byte-for-byte contract that
// tests/animation-export.test.js pins — that suite stays green UNEDITED;
// this suite restates the shared cores as literals so a drift fails HERE
// first. Imports the TS source directly (no dist build needed — build: null
// in the ci-map).
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { deriveExportPlan, EXPORT_FPS as GATE_EXPORT_FPS, MAX_EXPORT_FRAMES as GATE_MAX_EXPORT_FRAMES } from '../server/animation/export'
import { deriveAssembledSequence } from '../src/animation/timelineModel'
import { assemblyDocumentProblems, assemblyEntryVerdict, EXPORT_FPS, MAX_EXPORT_FRAMES } from '../shared/animation/assembly'

const uuid = () => randomUUID()

/** The shared text after a side's own label (`${label}: ` prefix). Both
 *  labels are colon-free by construction, so the first ': ' is the seam. */
const stripLabel = (text) => text.slice(text.indexOf(': ') + 2)

// The shared cores, restated as literals (the byte-identical pin — the
// export suite's own regex pins stay the other half of the contract).
const WIDE_CORE = (inFrame, outFrame, frameCount) =>
  `the selection [${inFrame}, ${outFrame}) exceeds the clip's ${frameCount} frames — narrow it before export (the export refuses rather than clamping).`
const DEGEN_CORE = (inFrame, frameCount) =>
  `the held drawing points at frame ${inFrame} of a ${frameCount}-frame clip — a degenerate range must name an existing frame; the export refuses rather than dropping it.`
const PHANTOM_CORE = 'the entry contributes no frames (a degenerate range with no hold) — set a hold or widen the range; the export refuses a phantom manifest row.'
const EMPTY_PROBLEM = 'The assembled sequence is empty — contribute at least one landed clip before exporting.'
const oddProblem = (width, height) =>
  `The document's output dimensions (${width}x${height}) are odd — H.264 at 4:2:0 chroma needs even dimensions; adjust the document's settings before exporting.`
const ceilingProblem = (totalFrames) =>
  `The assembled sequence is ${totalFrames} frames — beyond the export ceiling of ${MAX_EXPORT_FRAMES}. Split the document or trim the contribution list.`

const CLIP_FRAMES = 22

function fixture(slug) {
  const keyStart = uuid()
  const keyEnd = uuid()
  const attemptId = `att-${slug}-a`
  const body = {
    keys: [
      { id: keyStart, order: 0, selectedCandidateId: null, candidates: [], lock: false },
      { id: keyEnd, order: 1, selectedCandidateId: null, candidates: [], lock: false },
    ],
    spans: [],
    bindingHistory: [],
    activeBindingVersion: 0,
    editorial: [],
    settings: { outputWidth: 1344, outputHeight: 768, fps: 24, steps: 30 },
  }
  const attempt = {
    id: attemptId,
    tool: 'sequence',
    idempotencyKey: `idem-${attemptId}`,
    inputHash: 'i'.repeat(64),
    targetId: keyStart,
    snapshot: {
      tool: 'sequence', targetId: keyStart, references: [], caption: 'c', compilerVersion: '1', settings: {}, documentRevision: 4,
      sequence: { windowStartKeyId: keyStart, windowEndKeyId: keyEnd, orderedActions: ['rises'], preservation: 'coat', overrides: { medium: 'clean line on white' } },
    },
    execution: { state: 'ready' },
    result: null, // filled per row
  }
  return {
    keyStart,
    keyEnd,
    attemptId,
    body,
    attempt,
    document: { id: uuid(), projectId: 'proj-assembly', name: 'Assembly edges', schemaVersion: 1, revision: 4, updatedAt: 0, body },
  }
}

const resolveEverything = () => '/blobs/clip.mp4'

/** One editorial entry in the document + the landed/unlanded take behind it,
 *  then BOTH derivations over the same truth. */
function deriveBoth(seed, entry) {
  seed.body.editorial = [entry]
  seed.attempt.result = entry.landed === false
    ? null
    : { candidate: { id: null, assetReference: { assetId: 'clip', relPath: 'canvas-blobs/aa/clip', kind: 'video' }, frameCount: entry.frameCount ?? CLIP_FRAMES, earlierRevision: false } }
  const plan = deriveExportPlan(seed.document, [seed.attempt], resolveEverything)
  const assembled = deriveAssembledSequence(seed.body, [{
    attemptId: seed.attemptId,
    tool: 'sequence',
    targetId: seed.keyStart,
    windowEndKeyId: seed.keyEnd,
    candidate: entry.landed === false ? null : { frameCount: entry.frameCount ?? CLIP_FRAMES },
  }])
  return { plan, assembled }
}

const gateRefusalsFor = (plan, attemptId) => plan.refusals.filter((refusal) => refusal.includes(attemptId.slice(0, 8)))

// THE TABLE — every formerly divergent class, the legal shapes, the
// boundary, and the unlanded entry. `shared` is the expected shared core
// (null = no shared refusal: clean, or an own-class row).
const TABLE = [
  { slug: 'fullclip', label: 'the legal full-clip range', entry: { inFrame: 0, outFrame: CLIP_FRAMES, holdDuration: 0 }, shared: null },
  { slug: 'portion', label: 'a portion + hold', entry: { inFrame: 2, outFrame: 10, holdDuration: 6 }, shared: null },
  { slug: 'dlegal', label: 'the legal degenerate range (a held drawing)', entry: { inFrame: 5, outFrame: 5, holdDuration: 4 }, shared: null },
  { slug: 'dbound', label: 'the boundary case, legal side (inFrame==outFrame==frameCount-1 — the last existing frame)', entry: { inFrame: CLIP_FRAMES - 1, outFrame: CLIP_FRAMES - 1, holdDuration: 6 }, shared: null },
  { slug: 'dpast', label: 'degenerate-past-end (inFrame==outFrame==frameCount — one past the last frame)', entry: { inFrame: CLIP_FRAMES, outFrame: CLIP_FRAMES, holdDuration: 6 }, shared: DEGEN_CORE(CLIP_FRAMES, CLIP_FRAMES) },
  { slug: 'phantom', label: 'the zero-frame phantom (degenerate, no hold)', entry: { inFrame: 5, outFrame: 5, holdDuration: 0 }, shared: PHANTOM_CORE },
  { slug: 'wrange', label: 'the wide out-of-range selection', entry: { inFrame: 0, outFrame: 999, holdDuration: 0 }, shared: WIDE_CORE(0, 999, CLIP_FRAMES) },
  // The precedence pin: a degenerate range PAST the end is the degenerate
  // class, not the wide one — the old preview worded it out-of-range here.
  { slug: 'wdegen', label: 'a degenerate range pointing far past the end stays the degenerate class', entry: { inFrame: 999, outFrame: 999, holdDuration: 2 }, shared: DEGEN_CORE(999, CLIP_FRAMES) },
  { slug: 'unlanded', label: 'the unlanded entry (each side keeps its own copy)', entry: { inFrame: 0, outFrame: 8, holdDuration: 0, landed: false }, shared: null, unlanded: true },
]

test('the edge table agrees: the preview foreshadows exactly the gate, byte for byte after each label', () => {
  for (const row of TABLE) {
    const seed = fixture(row.slug)
    const entry = { id: `contrib-${row.slug}`, spanId: null, attemptId: seed.attemptId, ...row.entry }
    const { plan, assembled } = deriveBoth(seed, entry)
    const previewRow = assembled.contributions[0]
    const refusals = gateRefusalsFor(plan, seed.attemptId)

    // The agreement rule, EVERY row: the preview names a problem exactly
    // when the gate refuses the entry.
    assert.equal(previewRow.problem !== null, refusals.length > 0, `${row.label}: preview problem ⇔ gate refusal (${previewRow.problem ?? '—'} vs ${refusals.join(' | ') || '—'})`)

    // The arithmetic agrees too (one derivation, one clip/output math).
    const verdict = assemblyEntryVerdict(
      { contributionId: entry.id, inFrame: entry.inFrame, outFrame: entry.outFrame, holdDuration: entry.holdDuration, frameCount: entry.landed === false ? null : (entry.frameCount ?? CLIP_FRAMES) },
      'L',
    )
    assert.equal(previewRow.clipFrames, verdict.clipFrames, `${row.label}: clipFrames agree`)
    assert.equal(previewRow.outputFrames, verdict.outputFrames, `${row.label}: outputFrames agree`)

    if (row.unlanded) {
      // NOT a shared class: the shared verdict stays null, and each side
      // names the unlanded take in its own vocabulary.
      assert.equal(verdict.problem, null, `${row.label}: the unlanded class is deliberately not shared`)
      assert.match(previewRow.problem, /has not landed/, `${row.label}: the preview's own unlanded copy`)
      assert.match(refusals[0], /has not landed \(execution/, `${row.label}: the gate's own unlanded refusal`)
      continue
    }
    if (row.shared === null) {
      assert.equal(verdict.problem, null, `${row.label}: the shared verdict is clean`)
      assert.equal(previewRow.problem, null, `${row.label}: the preview is silent`)
      assert.deepEqual(refusals, [], `${row.label}: the gate refuses nothing`)
      assert.deepEqual(plan.refusals, [], `${row.label}: no document-level refusals either`)
      assert.deepEqual(assembled.problems, [], `${row.label}: no document-level preview problems either`)
      assert.equal(plan.segments[0].outputFrames, previewRow.outputFrames, `${row.label}: both sides assemble the same span`)
      continue
    }
    // A shared class: the text after each side's label is byte-identical —
    // and identical to the shared verdict's own answer.
    assert.equal(stripLabel(verdict.problem), row.shared, `${row.label}: the shared verdict's core`)
    assert.equal(previewRow.problem.startsWith(previewRow.label), true, `${row.label}: the preview problem opens with its row label`)
    assert.equal(stripLabel(previewRow.problem), row.shared, `${row.label}: the preview shares the gate's text byte for byte`)
    assert.equal(stripLabel(refusals[0]), row.shared, `${row.label}: the gate refusal is byte-identical to the pin`)
  }
})

test('the document-level verdicts agree: empty, odd dimensions, the ceiling — same strings, same order, both sides', () => {
  // EMPTY.
  const emptySeed = fixture('empty')
  const emptyPlan = deriveExportPlan(emptySeed.document, [emptySeed.attempt], resolveEverything)
  const emptyAssembled = deriveAssembledSequence(emptySeed.body, [])
  assert.deepEqual(emptyPlan.refusals, [EMPTY_PROBLEM])
  assert.deepEqual(emptyAssembled.problems, [EMPTY_PROBLEM])
  assert.deepEqual(assemblyDocumentProblems({ outputWidth: 1344, outputHeight: 768 }, 0, true), [EMPTY_PROBLEM])

  // ODD DIMENSIONS (a clean entry; the document-level class fires alone).
  const oddSeed = fixture('odddim')
  oddSeed.body.settings = { ...oddSeed.body.settings, outputWidth: 1345, outputHeight: 768 }
  const { plan: oddPlan, assembled: oddAssembled } = deriveBoth(oddSeed, { id: 'contrib-odd', spanId: null, attemptId: oddSeed.attemptId, inFrame: 0, outFrame: CLIP_FRAMES, holdDuration: 0 })
  assert.deepEqual(oddPlan.refusals, [oddProblem(1345, 768)], 'the gate refuses the odd pair by name, alone')
  assert.deepEqual(oddAssembled.problems, [oddProblem(1345, 768)], 'the preview foreshadows the same string')
  assert.deepEqual(assemblyDocumentProblems({ outputWidth: 1345, outputHeight: 768 }, CLIP_FRAMES, false), [oddProblem(1345, 768)])

  // THE CEILING (a clean in-range entry whose hold runs the total past it).
  const ceilingSeed = fixture('ceiling')
  const ceilingEntry = { id: 'contrib-ceiling', spanId: null, attemptId: ceilingSeed.attemptId, inFrame: 0, outFrame: CLIP_FRAMES, holdDuration: MAX_EXPORT_FRAMES - CLIP_FRAMES + 1 }
  const { plan: ceilingPlan, assembled: ceilingAssembled } = deriveBoth(ceilingSeed, ceilingEntry)
  assert.equal(ceilingPlan.totalFrames, MAX_EXPORT_FRAMES + 1, 'the gate total is the assembled arithmetic')
  assert.equal(ceilingAssembled.totalFrames, ceilingPlan.totalFrames, 'the preview total agrees')
  assert.deepEqual(ceilingPlan.refusals, [ceilingProblem(MAX_EXPORT_FRAMES + 1)], 'the gate refuses past the ceiling, alone')
  assert.deepEqual(ceilingAssembled.problems, [ceilingProblem(MAX_EXPORT_FRAMES + 1)], 'the preview foreshadows the same string')

  // TOGETHER — and in the same order on both sides (empty/odd head,
  // ceiling tail, entry problems between).
  const bothSeed = fixture('bothdoc')
  bothSeed.body.settings = { ...bothSeed.body.settings, outputWidth: 1345, outputHeight: 769 }
  const { plan: bothPlan, assembled: bothAssembled } = deriveBoth(bothSeed, { id: 'contrib-both', spanId: null, attemptId: bothSeed.attemptId, inFrame: 0, outFrame: CLIP_FRAMES, holdDuration: MAX_EXPORT_FRAMES - CLIP_FRAMES + 1 })
  assert.deepEqual(bothPlan.refusals, [oddProblem(1345, 769), ceilingProblem(MAX_EXPORT_FRAMES + 1)], 'odd dims head, ceiling tail')
  assert.deepEqual(bothAssembled.problems, [oddProblem(1345, 769), ceilingProblem(MAX_EXPORT_FRAMES + 1)], 'the preview order agrees')
})

test('the refusal-order pin: an entry refusal precedes the ceiling refusal, gate and preview positionally agree', () => {
  // T15a review Important-1 (carried to task 16): the 15a refactor
  // unshifted the WHOLE shared document block, which dragged the ceiling
  // refusal from its historical tail to the head whenever an entry refusal
  // and a past-ceiling total coexist. The placement is split — empty/
  // odd-dims stay at the head, the ceiling is PUSHED after the entry loop —
  // so the historical [entryRefusals…, ceiling] order holds and the preview
  // (which appends its document problems) agrees positionally.
  const seed = fixture('orderpin')
  seed.attempt.result = { candidate: { id: null, assetReference: { assetId: 'clip', relPath: 'canvas-blobs/aa/clip', kind: 'video' }, frameCount: CLIP_FRAMES, earlierRevision: false } }
  // Entry 1 assembles clean and drives the total past the ceiling; entry 2
  // is a degenerate range pointing past the clip's end with no hold — a
  // refusal that contributes ZERO frames on both sides (the gate skips the
  // entry, the preview's own arithmetic emits none), so the totals agree
  // and the ceiling string is identical on both sides.
  seed.body.editorial = [
    { id: 'contrib-clean', spanId: null, attemptId: seed.attemptId, inFrame: 0, outFrame: CLIP_FRAMES, holdDuration: MAX_EXPORT_FRAMES - CLIP_FRAMES + 1 },
    { id: 'contrib-degen', spanId: null, attemptId: seed.attemptId, inFrame: 999, outFrame: 999, holdDuration: 0 },
  ]
  const plan = deriveExportPlan(seed.document, [seed.attempt], resolveEverything)
  const assembled = deriveAssembledSequence(seed.body, [{
    attemptId: seed.attemptId,
    tool: 'sequence',
    targetId: seed.keyStart,
    windowEndKeyId: seed.keyEnd,
    candidate: { frameCount: CLIP_FRAMES },
  }])

  assert.equal(plan.totalFrames, MAX_EXPORT_FRAMES + 1, 'the clean entry drives the total past the ceiling')
  assert.equal(assembled.totalFrames, plan.totalFrames, 'the totals agree (the refused entry contributes none on either side)')
  assert.equal(plan.refusals.length, 2, 'the gate names BOTH: the refused entry and the past-ceiling total')
  assert.equal(stripLabel(plan.refusals[0]), DEGEN_CORE(999, CLIP_FRAMES), 'the ENTRY refusal comes first — the ceiling does not jump the queue')
  assert.equal(plan.refusals[1], ceilingProblem(MAX_EXPORT_FRAMES + 1), 'the ceiling refusal is the TAIL (the document strings are label-free)')
  assert.equal(stripLabel(assembled.problems[0]), DEGEN_CORE(999, CLIP_FRAMES), 'the preview names the entry first too')
  assert.equal(assembled.problems[1], ceilingProblem(MAX_EXPORT_FRAMES + 1), 'the preview agrees positionally — the ceiling second')
})

test('the export constants live in the shared module; the gate re-exports them unchanged', () => {
  assert.equal(EXPORT_FPS, 24)
  assert.equal(GATE_EXPORT_FPS, EXPORT_FPS, 'the gate re-exports the shared EXPORT_FPS')
  assert.equal(MAX_EXPORT_FRAMES, 100_000)
  assert.equal(GATE_MAX_EXPORT_FRAMES, MAX_EXPORT_FRAMES, 'the gate re-exports the shared MAX_EXPORT_FRAMES')
})
