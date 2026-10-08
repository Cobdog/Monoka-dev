// The shared caption compiler suite (task 3 of the animation-authoring
// module, spec 2026-10-06-animation-authoring-module-design.md §6.2/§6.3 +
// the H3 dialect in docs/research/h3-keyframe-animation-assessment.md §2).
//
// The compiler is the ONE module both environments submit through (Task 4's
// authoritative server compile, Task 9's client preview) — this suite runs
// it through vite's esbuild transform, the browser-pipeline leg of the
// dual-build contract (tsc NodeNext + Bundler legs run under pnpm
// typecheck / pnpm build:server).
//
// The contract under test: section order is MECHANICAL (per-tool enforced
// list), the medium string is byte-identical from ANIMATION_MEDIA,
// references are numbered, and language issues are FLAGGED as hints —
// never rewritten. No `landing <progress>` token anywhere (Set K measured
// the lever dead; spec §6.5).

import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  COMPILER_VERSION,
  compileHeroCaption,
  compileTweenCaption,
  compileSequenceCaption,
} from '../shared/animation/compiler'

// --- fixtures ---------------------------------------------------------------

const heroCtx = () => ({
  currentKey: {
    assetReference: { assetId: 'asset-key-1', relPath: 'library/key-1.png', kind: 'image' },
    pose: { poseDescription: 'mid-stride, arms pumping', facing: 'screen-left' },
  },
  movementArc: 'she plants the forward foot and pushes through into a full stride, arms swinging down to the hips',
  overrides: {
    medium: 'clean line on white',
    scene: 'a rain-slick street at dusk',
    camera: { description: 'low wide', reason: 'establishes the alley' },
  },
})

const tweenCtx = () => ({
  rollingReference: {
    assetReference: { assetId: 'asset-roll', relPath: 'takes/roll-07.png', kind: 'image' },
    // The ACTUAL current rolling reference — a promoted frame, whose pose
    // text deliberately differs from any span-endpoint phrasing.
    pose: { poseDescription: 'weight forward over the planted left foot', facing: 'screen-left' },
  },
  farReference: {
    assetReference: { assetId: 'asset-far', relPath: 'library/far-key.png', kind: 'image' },
    pose: { poseDescription: 'settled onto the heel, arms at the sides', facing: 'screen-right' },
  },
  movementStep: 'she shifts her weight onto the heel, hips following',
  // The span's authored hold (v2): the STATIC section appends it after the
  // fixed phrase — the live review's own typed text.
  preservation: 'The gold earring and both hands remain still.',
  overrides: { medium: 'flat black-and-white animatic' },
})

const sequenceCtx = () => ({
  windowStart: {
    assetReference: { assetId: 'asset-win-start', relPath: 'library/win-start.png', kind: 'image' },
    pose: { poseDescription: 'seated, hands folded', facing: 'toward camera' },
  },
  windowEnd: {
    assetReference: { assetId: 'asset-win-end', relPath: 'library/win-end.png', kind: 'image' },
    pose: { poseDescription: 'standing, one hand raised', facing: 'toward camera' },
  },
  orderedActions: ['she rises from the chair', 'her hand lifts to the brim of her hat', 'she settles the hat level'],
  preservation: 'coat hem stays consistent; the rhythm stays even',
  overrides: { medium: 'flat cel colour on white', scene: 'a station platform' },
})

/** Sections must appear as substrings strictly in the given order. */
const inOrder = (caption, sections) => {
  let at = -1
  for (const section of sections) {
    const i = caption.indexOf(section)
    assert.ok(i > at, `"${section}" present and after the previous section (at ${i}, previous at ${at})`)
    at = i
  }
}

const hintKinds = (hints) => hints.map((h) => h.kind)

// --- hero -------------------------------------------------------------------

test('hero caption: SCENE / MOVEMENT / STATIC in order, medium verbatim, Reference 1, camera reason clause', () => {
  const { caption, hints, compilerVersion } = compileHeroCaption(heroCtx())
  inOrder(caption, ['SCENE:', 'MOVEMENT:', 'STATIC:'])
  assert.ok(caption.includes('clean line on white'), 'the medium string appears byte-identical')
  assert.ok(caption.includes('Reference 1'), 'the single reference is numbered')
  assert.ok(caption.includes(heroCtx().movementArc), 'the movement arc appears verbatim')
  assert.ok(caption.includes('mid-stride, arms pumping'), 'the current key pose appears')
  assert.ok(caption.includes('low wide') && caption.includes('establishes the alley'), 'camera carries its reason clause')
  assert.ok(caption.includes('framing and ground'), 'STATIC ends on the framing+ground hold')
  assert.deepEqual(hints, [], 'a clean fixture compiles without hints')
  assert.equal(compilerVersion, '2')
})

// --- tween ------------------------------------------------------------------

test('tween caption: five sections in order; FIRST FRAME is the ROLLING reference pose, not the span endpoint', () => {
  const { caption, hints, compilerVersion } = compileTweenCaption(tweenCtx())
  inOrder(caption, ['SCENE:', 'FIRST FRAME', 'TARGET END FRAME', 'MOVEMENT:', 'STATIC:'])
  // The anti-original-endpoint guarantee: the caption carries the ACTUAL
  // rolling reference's pose text — whatever the span's original start was.
  assert.ok(caption.includes('weight forward over the planted left foot'), 'the rolling pose text appears')
  assert.ok(caption.includes('settled onto the heel, arms at the sides'), 'the far pose text appears')
  assert.ok(caption.includes('FIRST FRAME (Reference 1)'), 'the rolling reference is Reference 1')
  assert.ok(caption.includes('TARGET END FRAME (Reference 2)'), 'the far reference is Reference 2')
  assert.ok(caption.includes('facing screen-left'), 'facing rendered for the first frame')
  assert.ok(caption.includes('facing screen-right'), 'facing rendered for the target frame')
  assert.ok(caption.includes(tweenCtx().movementStep), 'the movement step appears verbatim')
  assert.deepEqual(hints, [], 'a clean fixture compiles without hints')
  assert.equal(compilerVersion, '2')
})

// --- tween v2: the authored preservation appends to STATIC (wave 2a, the
// maintainer's 2026-10-07 ruling — the live review's #3) ---------------------

/** The v1 tween caption over the tween fixture — the byte-identical shape an
 *  EMPTY authored preservation must keep (the replay pin: nothing about the
 *  fixed hold changed). */
const V1_TWEEN_CAPTION = [
  'SCENE: flat black-and-white animatic.',
  'FIRST FRAME (Reference 1): weight forward over the planted left foot, facing screen-left',
  'TARGET END FRAME (Reference 2): settled onto the heel, arms at the sides, facing screen-right',
  'MOVEMENT: she shifts her weight onto the heel, hips following',
  'STATIC: identity, wardrobe, and proportions stay consistent; framing and ground plane stay fixed',
].join('\n')

test('tween v2: authored preservation appends to STATIC after the fixed hold; empty keeps the v1 line byte-identical', () => {
  const authored = compileTweenCaption(tweenCtx())
  assert.equal(
    authored.caption.split('\n')[4],
    'STATIC: identity, wardrobe, and proportions stay consistent; framing and ground plane stay fixed. The gold earring and both hands remain still.',
    'the authored sentence follows the unchanged fixed hold after a full stop',
  )
  assert.ok(authored.caption.endsWith('The gold earring and both hands remain still.'), 'the authored text is the caption\'s last byte — nothing appended after it')
  assert.ok(authored.caption.includes('framing and ground plane stay fixed'), 'the measured fixed hold phrase stays')
  assert.equal(authored.compilerVersion, '2', 'the append is a compiler-versioned change')
  // Whitespace-only authored text is "not authored": the v1 line, byte for
  // byte — the fixed hold phrase never grew a trailing sentence.
  for (const empty of ['', '   ', '\t\n ']) {
    const { caption, hints } = compileTweenCaption({ ...tweenCtx(), preservation: empty })
    assert.equal(caption, V1_TWEEN_CAPTION, `preservation ${JSON.stringify(empty)} keeps the v1 caption byte-identical`)
    assert.deepEqual(hints, [], 'empty text hints nothing')
  }
  // Edges trim: the authored sentence lands without surrounding whitespace.
  const padded = compileTweenCaption({ ...tweenCtx(), preservation: '  The gold earring and both hands remain still.  ' })
  assert.ok(padded.caption.endsWith('The gold earring and both hands remain still.'), 'leading/trailing whitespace trims, the text itself verbatim')
  // Hero is unchanged by construction: it carries no preservation field, and
  // its STATIC line stays the bare fixed hold.
  const hero = compileHeroCaption(heroCtx())
  assert.equal(hero.caption.split('\n')[3], 'STATIC: identity, wardrobe, and proportions stay consistent; framing and ground plane stay fixed', 'hero keeps the bare hold — no appended sentence exists in its template')
})

test('tween v2: negation in the authored preservation is flagged, never rewritten', () => {
  const flagged = compileTweenCaption({ ...tweenCtx(), preservation: 'the hands never drift and the scarf does not move' })
  assert.ok(hintKinds(flagged.hints).includes('negation'), 'negation in the authored hold is noted')
  assert.ok(flagged.caption.includes('the hands never drift and the scarf does not move'), 'the offending text rides the caption verbatim')
})

// --- sequence ---------------------------------------------------------------

test('sequence caption: alignment line first, Subject on twos, actions in beat order, Preserve last', () => {
  const { caption, hints, compilerVersion } = compileSequenceCaption(sequenceCtx())
  const alignment = caption.indexOf('Alignment:')
  assert.ok(alignment !== -1, 'the alignment line exists')
  assert.ok(caption.indexOf('Reference 1') > alignment && caption.indexOf('Reference 2') > alignment, 'the alignment line numbers both window references')
  assert.ok(caption.indexOf('Subject:') > alignment, 'alignment precedes Subject')
  assert.ok(caption.includes('animated on twos'), 'Subject carries the on-twos phrase')
  assert.ok(caption.includes('flat cel colour on white'), 'the medium string appears byte-identical')
  assert.ok(caption.includes('a station platform'), 'the scene override appears')
  inOrder(caption, ['she rises from the chair', 'her hand lifts to the brim of her hat', 'she settles the hat level'])
  assert.ok(caption.indexOf('Action:') < caption.indexOf('Preserve:'), 'Action precedes Preserve')
  assert.ok(caption.endsWith('Preserve: coat hem stays consistent; the rhythm stays even'), 'Preserve is the last section, verbatim')
  assert.deepEqual(hints, [], 'a clean fixture compiles without hints')
  assert.equal(compilerVersion, '2')

  // A degenerate empty action list omits the Action section; Preserve stays last.
  const empty = compileSequenceCaption({ ...sequenceCtx(), orderedActions: [] })
  assert.ok(!empty.caption.includes('Action:'), 'no Action section without beats')
  assert.ok(empty.caption.endsWith('Preserve: coat hem stays consistent; the rhythm stays even'), 'Preserve still closes the caption')
})

// --- the Set K ban: no landing token in ANY template -------------------------

test('no compiled caption contains a landing progress token', () => {
  for (const caption of [
    compileHeroCaption(heroCtx()).caption,
    compileTweenCaption(tweenCtx()).caption,
    compileSequenceCaption(sequenceCtx()).caption,
  ]) {
    assert.ok(!caption.includes('landing'), `the dead step-size lever stays out (${JSON.stringify(caption.slice(0, 40))}…)`)
  }
})

// --- hints: flagged, never rewritten ------------------------------------------

test('comparative destination language in the far pose is flagged and kept verbatim', () => {
  const comparative = compileTweenCaption({
    ...tweenCtx(),
    farReference: { ...tweenCtx().farReference, pose: { poseDescription: 'head turned farther than the first frame', facing: 'screen-right' } },
  })
  assert.ok(hintKinds(comparative.hints).includes('comparative-destination'), 'farther-than phrasing is flagged')
  assert.ok(comparative.caption.includes('head turned farther than the first frame'), 'the offending text is NOT rewritten')
  const moreThan = compileTweenCaption({
    ...tweenCtx(),
    farReference: { ...tweenCtx().farReference, pose: { poseDescription: 'leaning more than the start pose', facing: 'screen-right' } },
  })
  assert.ok(hintKinds(moreThan.hints).includes('comparative-destination'), '"more than" phrasing is flagged')
  assert.ok(hintKinds(compileSequenceCaption({ ...sequenceCtx(), windowEnd: { ...sequenceCtx().windowEnd, pose: { poseDescription: 'turned farther than the window start', facing: 'toward camera' } } }).hints).includes('comparative-destination'), 'the sequence window end is checked too')
})

test('a null facing yields a missing-facing hint per frame', () => {
  const near = compileTweenCaption({
    ...tweenCtx(),
    rollingReference: { ...tweenCtx().rollingReference, pose: { poseDescription: 'weight forward', facing: null } },
  })
  assert.ok(hintKinds(near.hints).includes('missing-facing'), 'a null rolling facing is noted')
  const both = compileTweenCaption({
    ...tweenCtx(),
    rollingReference: { ...tweenCtx().rollingReference, pose: { poseDescription: 'weight forward', facing: null } },
    farReference: { ...tweenCtx().farReference, pose: { poseDescription: 'settled', facing: null } },
  })
  assert.equal(hintKinds(both.hints).filter((k) => k === 'missing-facing').length, 2, 'one hint per missing frame')
  assert.ok(hintKinds(compileHeroCaption({ ...heroCtx(), currentKey: { ...heroCtx().currentKey, pose: { poseDescription: 'mid-stride', facing: null } } }).hints).includes('missing-facing'), 'the hero key is checked too')
})

test('a movement naming a facing that contradicts the target frame is flagged; a legal turn is not', () => {
  const contradiction = compileTweenCaption({
    ...tweenCtx(),
    rollingReference: { ...tweenCtx().rollingReference, pose: { poseDescription: 'weight forward', facing: 'screen-left' } },
    farReference: { ...tweenCtx().farReference, pose: { poseDescription: 'settled', facing: 'screen-left' } },
    movementStep: 'turns to face screen-right',
  })
  assert.ok(hintKinds(contradiction.hints).includes('contradictory-facing'), 'movement names screen-right against a screen-left target')
  assert.ok(contradiction.caption.includes('turns to face screen-right'), 'the movement text is NOT rewritten')
  const legal = compileTweenCaption({
    ...tweenCtx(),
    rollingReference: { ...tweenCtx().rollingReference, pose: { poseDescription: 'weight forward', facing: 'screen-left' } },
    farReference: { ...tweenCtx().farReference, pose: { poseDescription: 'settled', facing: 'screen-right' } },
    movementStep: 'turns to face screen-right',
  })
  assert.ok(!hintKinds(legal.hints).includes('contradictory-facing'), 'a turn onto the target facing is the intended large move')
})

test('negation in movement or preservation text is flagged and kept verbatim', () => {
  const hero = compileHeroCaption({ ...heroCtx(), movementArc: 'she crosses the square and does not look away' })
  assert.ok(hintKinds(hero.hints).includes('negation'), 'negation in the hero arc is noted')
  assert.ok(hero.caption.includes('does not look away'), 'the offending text is NOT rewritten')
  assert.ok(hintKinds(compileTweenCaption({ ...tweenCtx(), movementStep: 'she never breaks stride' }).hints).includes('negation'), 'negation in the tween step is noted')
  assert.ok(hintKinds(compileSequenceCaption({ ...sequenceCtx(), preservation: 'no drift on the coat hem' }).hints).includes('negation'), 'negation in preservation is noted')
  assert.ok(hintKinds(compileSequenceCaption({ ...sequenceCtx(), orderedActions: ['she rises without hesitation'] }).hints).includes('negation'), 'negation in an action beat is noted')
})

// --- the mechanical vocabulary guards -----------------------------------------

test('every return carries the compiler version', () => {
  assert.equal(COMPILER_VERSION, '2')
  assert.equal(compileHeroCaption(heroCtx()).compilerVersion, '2')
  assert.equal(compileTweenCaption(tweenCtx()).compilerVersion, '2')
  assert.equal(compileSequenceCaption(sequenceCtx()).compilerVersion, '2')
})

test('an unsupported medium string is rejected at runtime by every entry point', () => {
  const badMedium = { ...heroCtx().overrides, medium: 'oil on canvas' }
  assert.throws(() => compileHeroCaption({ ...heroCtx(), overrides: badMedium }), /medium/, 'hero guards the vocabulary')
  assert.throws(() => compileTweenCaption({ ...tweenCtx(), overrides: badMedium }), /medium/, 'tween guards the vocabulary')
  assert.throws(() => compileSequenceCaption({ ...sequenceCtx(), overrides: badMedium }), /medium/, 'sequence guards the vocabulary')
  // A facing outside the closed vocabulary is equally impossible by type —
  // and equally mechanical, so the runtime guard fires rather than leaking
  // arbitrary text into the submitted caption.
  const badFacing = { poseDescription: 'mid-stride', facing: 'left-ish' }
  assert.throws(() => compileHeroCaption({ ...heroCtx(), currentKey: { ...heroCtx().currentKey, pose: badFacing } }), /facing/, 'facing outside FACING_TERMS throws')
})
