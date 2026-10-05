// field-classes (component vocabulary task 18, Flux k2q0n9s) — Field's OWN
// contract: the pure precedence/id/merge math behind src/ui/Field.tsx (kept
// in the react-free src/ui/fieldClasses.ts so this node suite can load it
// through the VM harness), and the description recipe's shape in
// src/styles.css:
//
//   (a) precedence — fieldSlot() is error > hint > silent: error present →
//       the error slot regardless of hint; hint only when no error; null
//       when both are absent. "Absent" is the empty-ReactNode set
//       (undefined/null/false/'') — a caller passing '' must not get an
//       empty description element (a dangling, announced-nothing node);
//       0 and real nodes ARE content.
//   (b) id derivation — fieldDescriptionId() names the description off the
//       CONTROL's id (`{id}-{slot}`), so the association is greppable and
//       stable per control; fieldDescribedBy() MERGES into an existing
//       aria-describedby (multiple description refs are legal ARIA) with
//       dedupe, never clobbering a consumer's own wiring.
//   (c) class composition — fieldClasses() composes `field-group [surface…]`
//       (the house form tier IS the recipe class; the surface's geometry
//       class lands last, deduped); fieldDescriptionClasses() composes
//       `field-description [--error]`.
//   (d) dev warns — fieldWarnFor(): children that cannot carry the wiring
//       (fragments, arrays, plain text) and a htmlFor that disagrees with
//       the control's own id both warn; the honest pairs stay silent.
//   (e) recipe lockstep, both directions — every class the math emits has a
//       rule in src/styles.css, and every `.field-description*` rule there
//       is one the API can name.
//   (f) P06 + tokens — the description rules carry tone/type properties
//       (color, font-size, white-space) and flow margins only; no padding,
//       radius, border, or box geometry — and every var() they reference is
//       DEFINED in src/styles.css's :root (P02 membership doctrine).
//   (g) migration pins — the caption surface's retired tone dialect is gone
//       from datasets.css (.ds-validation.ok deleted; .ds-validation keeps
//       its list geometry, loses the color the recipe now owns).
//
// The aria-describedby WIRING itself (cloneElement onto the real control,
// the label association, the live toggling) is browser behavior: P04 puts
// it in e2e/datasets.spec.ts, not here.
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const { loadTs } = require('../scripts/lib/ts-vm.cjs')
const fieldClassesModule = loadTs('src/ui/fieldClasses.ts')
const { fieldSlot, fieldDescriptionId, fieldDescribedBy, fieldClasses, fieldDescriptionClasses, fieldWarnFor } = fieldClassesModule
const { parseRootCustomProperties, stripComments, collectRules } = require('./lib/styleSheet.cjs')

const ok = (condition, label) => assert.ok(condition, label)

function eq(actual, expected, label) {
  assert.equal(actual, expected, label)
  console.log(`  ok - ${label}`)
}

// ---- the live sheet parse (the statusToken doctrine: read the sheet at
// run time; membership proves definition — through the shared sheet reader,
// tests/lib/styleSheet.cjs, the near-term-A consolidation of the ten kit
// suites' private parser copies) ------------------------------------------

const STYLES = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'styles.css'), 'utf8')
const DATASETS_CSS = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'datasets', 'datasets.css'), 'utf8')

const ROOT_VARS = parseRootCustomProperties(STYLES)

const DESCRIPTION_RULES = collectRules(STYLES).filter((rule) =>
  rule.selectorText.split(',').some((selector) => selector.includes('.field-description')),
)

// ---- (a) precedence --------------------------------------------------------

test('(a) fieldSlot is error > hint > silent, with the empty-ReactNode set absent', () => {
  eq(fieldSlot({ error: 'broken', hint: 'advice' }).kind, 'error', 'error present + hint present → the ERROR slot (precedence)')
  eq(fieldSlot({ error: 'broken', hint: 'advice' }).content, 'broken', 'the error slot carries the error content')
  eq(fieldSlot({ error: 'broken' }).kind, 'error', 'error alone → the error slot')
  eq(fieldSlot({ hint: 'advice' }).kind, 'hint', 'hint alone (no error) → the hint slot')
  eq(fieldSlot({ hint: 'advice' }).content, 'advice', 'the hint slot carries the hint content')
  eq(fieldSlot({}), null, 'both absent → null (silent: no description element, no wiring)')
  eq(fieldSlot({ error: undefined, hint: undefined }), null, 'explicit undefineds are absent')
  eq(fieldSlot({ error: null, hint: null }), null, 'nulls are absent')
  eq(fieldSlot({ error: false, hint: false }), null, 'false is absent (conditional JSX)')
  eq(fieldSlot({ error: '', hint: '' }), null, "'' is absent (an empty string renders nothing — never an empty description node)")
  eq(fieldSlot({ error: '', hint: 'advice' }).kind, 'hint', "error '' counts as absent, so the hint shows")
  eq(fieldSlot({ error: 0 }).kind, 'error', '0 IS content (renders "0") — the empty set is the four above, not falsiness')
})

// ---- (b) id derivation + describedby merge ---------------------------------

test('(b) fieldDescriptionId names off the control id; fieldDescribedBy merges, never clobbers', () => {
  eq(fieldDescriptionId('ds-caption-textarea', 'error'), 'ds-caption-textarea-error', 'the description id derives from the control id + slot kind')
  eq(fieldDescriptionId('ds-caption-textarea', 'hint'), 'ds-caption-textarea-hint', 'the hint slot gets its own id (the association MOVES between slots, observable)')
  eq(fieldDescribedBy(undefined, 'x'), 'x', 'no existing describedby → the id alone')
  eq(fieldDescribedBy('', 'x'), 'x', 'empty-string existing → the id alone')
  eq(fieldDescribedBy('other', 'x'), 'other x', 'existing refs MERGE (multiple description refs are legal ARIA)')
  eq(fieldDescribedBy('a b', 'c'), 'a b c', 'the appended ref lands last')
  eq(fieldDescribedBy('a b', 'b'), 'a b', 'a ref already present is not duplicated')
  eq(fieldDescribedBy('x', 'x'), 'x', 'self-dedupe')
})

// ---- (c) class composition ---------------------------------------------------

test('(c) fieldClasses composes the house form tier + surface geometry; fieldDescriptionClasses the tone', () => {
  eq(fieldClasses({}), 'field-group', 'the bare recipe is the house form tier class (the established .field-group look, unchanged)')
  eq(fieldClasses({ className: 'grow' }), 'field-group grow', 'the surface geometry class rides last (P06)')
  eq(fieldClasses({ className: 'a b' }), 'field-group a b', 'multi-token surface classes compose')
  eq(fieldClasses({ className: 'field-group grow' }), 'field-group grow', 'tokens dedupe (a surface re-naming the base adds nothing)')
  eq(fieldClasses({ className: ' grow ' }), 'field-group grow', 'whitespace-normalized')
  eq(fieldDescriptionClasses('hint'), 'field-description', 'the hint slot is the base description recipe (muted)')
  eq(fieldDescriptionClasses('error'), 'field-description field-description--error', 'the error slot adds the error tone modifier')
})

// ---- (d) dev warns -----------------------------------------------------------

test('(d) fieldWarnFor flags unwireable children and id disagreements; honest pairs stay silent', () => {
  ok(fieldWarnFor({ wireable: false, htmlFor: undefined, childId: undefined }).length > 0, 'a fragment/array/text child (not wireable) warns — the wiring would silently drop')
  eq(fieldWarnFor({ wireable: true, htmlFor: undefined, childId: undefined }), null, 'a single element child with no manual ids is the happy path')
  eq(fieldWarnFor({ wireable: true, htmlFor: 'my-input', childId: 'my-input' }), null, 'htmlFor agreeing with the child id is silent')
  ok(fieldWarnFor({ wireable: true, htmlFor: 'a', childId: 'b' }).length > 0, 'htmlFor disagreeing with the child id warns (the label would point nowhere)')
  eq(fieldWarnFor({ wireable: true, htmlFor: undefined, childId: 'b' }), null, 'a child id with no htmlFor is silent (the label derives from the child)')
})

// ---- (e) recipe lockstep, both directions ------------------------------------

test('(e) every emitted class has a rule; every .field-description* rule is nameable', () => {
  const emitted = new Set(['field-group', 'field-description', 'field-description--error'])
  const sheetClasses = new Set(DESCRIPTION_RULES.flatMap((rule) =>
    rule.selectorText.split(',').flatMap((selector) => {
      const found = []
      const pattern = /\.([\w-]+)/g
      let match = pattern.exec(selector)
      while (match !== null) {
        if (match[1].startsWith('field-description')) found.push(match[1])
        match = pattern.exec(selector)
      }
      return found
    }),
  ))
  for (const className of emitted) {
    if (className === 'field-group') continue // the house form tier predates the recipe; pinned by usage, not new
    ok(sheetClasses.has(className), `the emitted class ".${className}" has a rule in src/styles.css`)
  }
  for (const className of sheetClasses) {
    ok(emitted.has(className), `the sheet's ".${className}" rule is one the API can name (no orphan recipes)`)
  }
})

// ---- (f) P06 property whitelist + :root tokens -------------------------------

test('(f) the description recipe carries tone/type/flow only; every var() is :root-defined', () => {
  ok(DESCRIPTION_RULES.length >= 2, 'the .field-description and .field-description--error rules both exist')
  const allowed = new Set(['color', 'font-size', 'white-space', 'margin', 'min-width'])
  for (const rule of DESCRIPTION_RULES) {
    for (const declaration of rule.body.split(';')) {
      const colon = declaration.indexOf(':')
      if (colon === -1) continue
      const prop = declaration.slice(0, colon).trim().toLowerCase()
      ok(allowed.has(prop), `"${prop}" is recipe-owned in "${rule.selectorText.trim().slice(0, 40)}" (tone/type/flow; box geometry stays in surfaces per P06)`)
    }
  }
  const toneRule = DESCRIPTION_RULES.find((rule) => rule.selectorText.includes('field-description--error'))
  ok(toneRule, 'the error tone rule exists')
  ok(toneRule.body.includes('var(--danger)'), 'the error tone is the existing danger token (no new colors)')
  const baseRule = DESCRIPTION_RULES.find((rule) => /\.field-description(?![\w-])/.test(rule.selectorText.trim().split(',')[0]))
  ok(baseRule, 'the base (hint) rule exists')
  ok(baseRule.body.includes('var(--muted)'), 'the hint tone is the existing muted token')
  const varRefs = new Set()
  for (const rule of DESCRIPTION_RULES) {
    const pattern = /var\((--[\w-]+)/g
    let match = pattern.exec(rule.body)
    while (match !== null) {
      varRefs.add(match[1])
      match = pattern.exec(rule.body)
    }
  }
  for (const ref of varRefs) {
    ok(ROOT_VARS.has(ref), `var(${ref}) is DEFINED in :root (membership proves definition)`)
  }
})

// ---- (g) migration pins (the caption surface) ---------------------------------

test('(g) the caption validation dialect: tone retired to the recipe, geometry retained', () => {
  const noComments = stripComments(DATASETS_CSS)
  ok(!/\.ds-validation\.ok/.test(noComments), 'the .ds-validation.ok rule is retired (the ok confirmation rides Field\'s hint slot now)')
  const validationRule = collectRules(DATASETS_CSS).find((rule) => rule.selectorText.split(',').some((selector) => selector.trim() === '.ds-validation'))
  ok(validationRule, 'the .ds-validation rule itself is retained (the issues list\'s geometry)')
  ok(validationRule.body.includes('padding-left'), '.ds-validation keeps its list indent (retained geometry)')
  for (const declaration of validationRule.body.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon === -1) continue
    const prop = declaration.slice(0, colon).trim().toLowerCase()
    ok(prop !== 'color', `.ds-validation carries no color (the recipe owns tone; found "${prop}" kept as geometry)`)
  }
  const captionPanel = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'datasets', 'CaptionPanel.tsx'), 'utf8')
  ok(captionPanel.includes('data-ds-validation]') || captionPanel.includes('data-ds-validation'), 'the T13 test hook rides the migrated content (the e2e contract survives)')
  ok(!/className="ds-validation ok"/.test(captionPanel), 'the retired ok-dialect markup is gone from the component')
})
