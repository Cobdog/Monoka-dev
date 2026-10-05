// refusal-classes (component vocabulary task 21, Flux k2q0n9s) — Refusal's
// OWN contract: the pure class/aria/warn math behind src/ui/Refusal.tsx
// (kept in the react-free src/ui/refusalClasses.ts so this node suite can
// load it through the VM harness), and the recipe's shape in src/styles.css:
//
//   (a) class composition — refusalClasses() composes `refusal [surface…]`
//       (ONE recipe, no state modifiers — a refusal is a state, not a
//       matrix; the surface's geometry class lands last, deduped per the
//       mergeTail doctrine, P06).
//   (b) the announcement mapping — refusalAria() is the alert pair
//       (role=alert + aria-live=assertive) ALWAYS: a refusal blocks the
//       primary action and names its remedy, so it announces; there is no
//       polite variant to choose wrong. The noticeClasses doctrine: the
//       explicit aria-live matches the role's implicit semantics — ONE live
//       mechanism per element, nothing double-announces.
//   (c) dev warns — refusalWarnFor() flags the dead-end shapes the pinned
//       interface cannot police through types alone: a blank title (WHAT is
//       refused goes unnamed), a blank reason (the WHY is the component's
//       whole reason for existing), and a malformed satisfy (a blank label
//       or a non-function action — an affordance that names nothing or does
//       nothing is worse than no affordance). The honest pairs stay silent.
//   (d) recipe lockstep, both directions + P06 + tokens — every class the
//       math emits has a rule in src/styles.css and every `.refusal*` rule
//       there is one the API can name; the rules carry tone/type/flow and
//       inheritance resets ONLY (the save-status-retry/notice-banner ×
//       precedent — no box geometry on the recipe); every var() they
//       reference is DEFINED in src/styles.css's :root (P02 membership
//       doctrine); the tone is the WARNING token, never danger (the plan's
//       ruling: a refusal is a state, not a failure), at the decision-prose
//       floor (--text-md, the A02/A10 >=11px class).
//   (e) migration pins — the image-lane gate (the manifest's named first
//       consumer): the Generate button's retired title-carried refusal is
//       GONE (the manifest row's ad-hoc markup), the shared Refusal renders
//       in its place with the R-19 library satisfy wired, the button KEEPS
//       its disabled gate (honest refusal, never silent dimming alone — the
//       refusal states it, the button still cannot run), and the richer
//       `.iw-unavailable-note` block STAYS (not a manifest row: the W6
//       alternative-machinery arm and the W10 install hint have no home in
//       the pinned interface).
//
// The rendered announcement, the satisfy click, and the gate's reactivity
// are browser behavior: P04 puts them in e2e (the images spec's refusal
// test), not here.
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const { loadTs } = require('../scripts/lib/ts-vm.cjs')
const refusalModule = loadTs('src/ui/refusalClasses.ts')
const { refusalClasses, refusalAria, refusalWarnFor } = refusalModule
const { parseRootCustomProperties, collectRules } = require('./lib/styleSheet.cjs')

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

const ROOT_VARS = parseRootCustomProperties(STYLES)

const REFUSAL_RULES = collectRules(STYLES).filter((rule) =>
  rule.selectorText.split(',').some((selector) => selector.includes('.refusal')),
)

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')

/** Code-only view of a TSX source: drops `//` and `*` comment lines (the
 *  manifest §0 prose-strike normalization — comments are the record of what
 *  retired, the code is what must not carry it). */
function codeOnly(source) {
  return source.split('\n').filter((line) => !/^\s*(\*|\/\/)/.test(line)).join('\n')
}

// ---- (a) class composition ---------------------------------------------------

test('(a) refusalClasses composes the one recipe + the surface tail', () => {
  eq(refusalClasses({}), 'refusal', 'the recipe is ONE class — a refusal has no state modifiers (a state, not a matrix)')
  eq(refusalClasses({ className: 'iw-refusal' }), 'refusal iw-refusal', 'the surface geometry class rides last (P06)')
  eq(refusalClasses({ className: 'a b' }), 'refusal a b', 'multi-token surface classes compose after the recipe')
  eq(refusalClasses({ className: 'refusal x' }), 'refusal x', 'tokens dedupe (a surface re-naming the recipe adds nothing)')
  eq(refusalClasses({ className: ' grow ' }), 'refusal grow', 'whitespace-normalized')
})

// ---- (b) the announcement mapping ---------------------------------------------

test('(b) a refusal is the alert pair, always — no variant to choose wrong', () => {
  eq(refusalAria().role, 'alert', 'role=alert: the refusal blocks the primary action and names its remedy')
  eq(refusalAria()['aria-live'], 'assertive', 'the explicit live matches the role\'s implicit semantics (the noticeAria doctrine)')
})

// ---- (c) dev warns --------------------------------------------------------------

test('(c) refusalWarnFor flags the dead-end shapes; honest pairs stay silent', () => {
  eq(refusalWarnFor({ title: 'Generate is not available', reason: 'the Mamad8 VAE is missing', satisfy: { label: 'Get the missing pieces…', action: () => {} } }), null, 'the full contract is honest')
  eq(refusalWarnFor({ title: 'Lane down', reason: 'nothing serves this yet' }), null, 'a satisfy-less refusal is legitimate — no remedy exists, the caller decides (never forced)')
  eq(refusalWarnFor({ title: 'Lane down', reason: 'nothing serves this yet', satisfy: undefined }), null, 'an explicit undefined satisfy is absent')
  ok(String(refusalWarnFor({ title: '   ', reason: 'x' })).includes('title'), 'a blank title warns — WHAT is refused goes unnamed')
  ok(String(refusalWarnFor({ title: 'x', reason: '' })).includes('reason'), 'a blank reason warns — the WHY is the component\'s whole point')
  ok(String(refusalWarnFor({ title: 'x', reason: 'y', satisfy: { label: '  ', action: () => {} } })).includes('label'), 'a blank satisfy label warns — an unnamed affordance')
  ok(String(refusalWarnFor({ title: 'x', reason: 'y', satisfy: { label: 'do it' } })).includes('action'), 'a missing satisfy action warns — an affordance that does nothing is worse than none')
})

// ---- (d) recipe lockstep + P06 + tokens ------------------------------------------

test('(d) every emitted class has a rule; every .refusal* rule is nameable; tone/type/flow only; warning never danger; tokens defined', () => {
  const emitted = new Set(['refusal', 'refusal-title', 'refusal-reason', 'refusal-satisfy'])
  const sheetClasses = new Set(REFUSAL_RULES.flatMap((rule) =>
    rule.selectorText.split(',').flatMap((selector) => {
      const found = []
      const pattern = /\.([\w-]+)/g
      let match = pattern.exec(selector)
      while (match !== null) {
        if (match[1].startsWith('refusal')) found.push(match[1])
        match = pattern.exec(selector)
      }
      return found
    }),
  ))
  for (const className of emitted) {
    ok(sheetClasses.has(className), `the emitted class ".${className}" has a rule in src/styles.css`)
  }
  for (const className of sheetClasses) {
    ok(emitted.has(className), `the sheet's ".${className}" rule is one the API can name (no orphan recipes)`)
  }
  ok(REFUSAL_RULES.length >= 4, 'the base, title, reason, and satisfy rules all exist')
  const allowed = new Set(['display', 'flex-direction', 'align-items', 'gap', 'margin', 'color', 'font-size', 'font-weight', 'line-height', 'background', 'border', 'padding', 'text-decoration', 'cursor'])
  for (const rule of REFUSAL_RULES) {
    for (const declaration of rule.body.split(';')) {
      const colon = declaration.indexOf(':')
      if (colon === -1) continue
      const prop = declaration.slice(0, colon).trim().toLowerCase()
      ok(allowed.has(prop), `"${prop}" is recipe-owned in "${rule.selectorText.trim().slice(0, 40)}" (tone/type/flow + the button's inheritance resets — the save-status-retry precedent; box geometry stays in surfaces per P06)`)
    }
  }
  const baseRule = REFUSAL_RULES.find((rule) => /\.refusal(?![\w-])/.test(rule.selectorText.trim().split(',')[0]))
  ok(baseRule, 'the base rule exists')
  ok(baseRule.body.includes('var(--warning)'), 'the refusal tone is the EXISTING warning token (a state, not a failure — the plan\'s ruling)')
  ok(!baseRule.body.includes('var(--danger)'), 'the base never paints danger (that tier belongs to failures — SaveStatus\'s failed arm)')
  ok(baseRule.body.includes('var(--text-md)'), 'decision prose at the A02/A10 >=11px floor')
  const varRefs = new Set()
  for (const rule of REFUSAL_RULES) {
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

// ---- (e) migration pins (the image-lane gate, the manifest's named consumer) -----

test('(e) the workbench gate: the title-carried refusal retired, the shared Refusal in, the disabled gate kept, the note retained', () => {
  const workbench = codeOnly(read('src/images/WorkbenchApp.tsx'))
  ok(!workbench.includes('title={detectionOf(settings.family)'), 'the Generate button\'s retired ad-hoc title refusal is GONE (the manifest row: the title carried missingModels/missingNodes)')
  ok(workbench.includes('<Refusal'), 'the workbench renders the shared Refusal at the gate')
  ok(/data-iw-generate[\s\S]{0,300}?disabled=/.test(workbench), 'the Generate button KEEPS its disabled gate (honest refusal, never dimming alone — the action truly cannot run)')
  ok(/satisfy=\{/.test(workbench), 'the gate wires the satisfy escape hatch')
  ok(workbench.includes("'Get the missing pieces…'"), 'the satisfy speaks the R-19 voice (the note\'s established label)')
  ok(workbench.includes('setLibraryDock(true)'), 'the satisfy opens the Library (the R-19 remedy)')
  ok(workbench.includes('the engine is not connected'), 'the no-detection reason states the actual condition plainly (never a bare \'unavailable\')')
  ok(workbench.includes('data-iw-unavailable'), 'the richer .iw-unavailable-note block STAYS (not a manifest row — the W6/W10 arms have no home in the pinned interface)')
})

test('(e2) the component: the machine hooks and the real-button contract', () => {
  const component = codeOnly(read('src/ui/Refusal.tsx'))
  ok(component.includes('data-refusal'), 'the container hook is data-refusal (shared-component-owned)')
  ok(component.includes('data-refusal-title') && component.includes('data-refusal-reason'), 'title and reason are individually addressable')
  ok(component.includes('data-refusal-satisfy'), 'the satisfy hook')
  ok(/type="button"/.test(component), 'the satisfy is a real button (type=button, never a submit)')
  ok(component.includes('refusalAria('), 'the announcement rides the pure map (one authority)')
})
