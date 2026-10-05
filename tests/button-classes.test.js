// button-classes (component vocabulary task 7, Flux k2q0n9s) — the Button
// API's OWN contract: the pure variant/busy class math + state/aria mapping
// behind src/ui/Button.tsx (kept in the react-free src/ui/buttonClasses.ts so
// this node suite can load it through the VM harness), the recipe block's
// shape in src/styles.css, and the border-longhand hazard net extended to
// Button-composed surfaces:
//
//   (a) variant mapping — every ButtonVariant composes `btn btn--{variant}`
//       (the base carries the shared neutral tone, the variant overrides it);
//       unknown or MISSING variants throw (closed matrix — the same
//       over-generalization mitigation statusToken/chipClasses enforce).
//   (b) busy/disabled semantics — buttonState(): busy implies DISABLED and
//       aria-busy (the manifest §2 contract: busy = LoaderCircle + aria-busy
//       + disabled); disabled alone never sets aria-busy.
//   (c) state + merge — busy adds btn--busy; the surface's className lands
//       LAST (the geometry class composes after the recipes so
//       equal-specificity dialect rules in the surface's own later-loading
//       sheet win the cascade — the P06 bridge); duplicate tokens dedupe.
//   (d) recipe lockstep, both directions — every class the math can emit has
//       a `.btn`-family rule in src/styles.css, and every `.btn--*` rule in
//       the sheet is one the API can name (no orphan recipes).
//   (e) P06 enforcement — the recipe rules carry color/background/border-
//       color (plus the opacity/cursor state affordances) and NOTHING else:
//       no padding, radius, font, gap, or border shorthand — geometry stays
//       in the consuming surface's own class applied alongside.
//   (f) tokens-only — every var() name the recipes reference is DEFINED in
//       src/styles.css's :root (P02: membership proves definition).
//   (g) icon-only labeling — buttonWarnFor(): children without text and no
//       aria-label produce the dev warning (any variant — icon-only is a
//       children shape, not just the `icon` variant); text anywhere in the
//       tree, or an aria-label, satisfies it.
//   (h) the border-shorthand hazard net, BUTTON leg (the chip leg lives in
//       tests/chip-classes.test.js (g) — same failure mode, shared docs):
//       every surface class token composed onto a `<Button` (whose className
//       prop Button renders after the recipes) must not be styled by a
//       `border:`/per-edge shorthand in any src sheet — the shorthand resets
//       border-color to currentcolor and, at equal specificity in a
//       later-loading sheet, silently beats the recipes (T6's C1, caught
//       inside the chip commit itself).
//
// Browser behavior (spinner present, aria-busy on the live DOM, accessible
// names, focus-visible) is NOT this suite's business (vitest is node-env,
// P04): e2e/settings.spec.ts + e2e/datasets.spec.ts own it.
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const { loadTs } = require('../scripts/lib/ts-vm.cjs')
const buttonClassesModule = loadTs('src/ui/buttonClasses.ts')
const { buttonClasses, buttonState, buttonWarnFor, BUTTON_VARIANTS } = buttonClassesModule
const { parseRootCustomProperties, collectRules } = require('./lib/styleSheet.cjs')

const ok = (condition, label) => assert.ok(condition, label)

function eq(actual, expected, label) {
  assert.equal(actual, expected, label)
  console.log(`  ok - ${label}`)
}

// ---- the live sheet parse (the statusToken doctrine: read src/styles.css
// at run time; the shared sheet reader tests/lib/styleSheet.cjs owns the
// mechanism — the near-term-A consolidation of the ten kit suites' private
// parser copies) ---------------------------------------------------------------

const STYLES = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'styles.css'), 'utf8')

const ROOT_VARS = parseRootCustomProperties(STYLES)

/** Every top-level rule whose selector list mentions a `.btn`-family class,
 *  mapped className → the union of its declarations across all such rules.
 *  `\.ds-btn` and friends never match: the dot must sit directly before
 *  `btn`. */
function collectButtonRules(css) {
  const rules = new Map() // className -> { props: Set, varRefs: Set }
  const note = (className, body) => {
    if (!rules.has(className)) rules.set(className, { props: new Set(), varRefs: new Set() })
    const entry = rules.get(className)
    const declarations = body.split(';')
    for (const declaration of declarations) {
      const colon = declaration.indexOf(':')
      if (colon === -1) continue
      const prop = declaration.slice(0, colon).trim().toLowerCase()
      if (prop) entry.props.add(prop)
      const varPattern = /var\((--[\w-]+)/g
      let varMatch = varPattern.exec(declaration)
      while (varMatch !== null) {
        entry.varRefs.add(varMatch[1])
        varMatch = varPattern.exec(declaration)
      }
    }
  }
  // The shared walker: comments stripped, @-preludes skipped whole (same
  // rationale as before — a recipe that moves inside a media query escapes
  // the ORPHAN direction of (d), never the emittable direction).
  for (const { selectorText, body } of collectRules(css)) {
    for (const selector of selectorText.split(',')) {
      const classPattern = /\.btn\b(--[\w-]+)?/g
      let classMatch = classPattern.exec(selector)
      while (classMatch !== null) {
        note(classMatch[0].slice(1), body)
        classMatch = classPattern.exec(selector)
      }
    }
  }
  return rules
}

const BUTTON_RULES = collectButtonRules(STYLES)
const SHEET_BUTTON_CLASSES = Array.from(BUTTON_RULES.keys()).sort()

// ---- (a) variant mapping -----------------------------------------------------

test('(a) every variant composes its recipe on the btn base', () => {
  for (const variant of ['primary', 'secondary', 'ghost', 'danger', 'icon']) {
    eq(buttonClasses({ variant }), `btn btn--${variant}`, `${variant} variant composes btn btn--${variant}`)
  }
})

test('(a) unknown or missing variants throw — the variant matrix is closed', () => {
  assert.throws(() => buttonClasses({ variant: 'link' }), /variant/i, 'an unmapped variant throws (no silent base fallback)')
  assert.throws(() => buttonClasses({ variant: 'PRIMARY' }), /variant/i, 'variant names are case-sensitive')
  assert.throws(() => buttonClasses({}), /variant/i, 'variant is REQUIRED (the API has no default tone)')
})

test('(a) the exported vocabulary is the closed set the map enforces', () => {
  eq(BUTTON_VARIANTS.join('|'), 'primary|secondary|ghost|danger|icon', 'the variant vocabulary')
})

// ---- (b) busy/disabled semantics ---------------------------------------------

test('(b) busy implies disabled + aria-busy; disabled alone never announces', () => {
  const busy = buttonState({ busy: true })
  eq(busy.disabled, true, 'busy forces the disabled attribute (the manifest §2 contract)')
  eq(busy['aria-busy'], true, 'busy announces aria-busy')
  const busyAndDisabled = buttonState({ busy: true, disabled: true })
  eq(busyAndDisabled.disabled, true, 'busy + disabled stays disabled')
  eq(busyAndDisabled['aria-busy'], true, 'busy + disabled still announces aria-busy')
  const disabled = buttonState({ busy: false, disabled: true })
  eq(disabled.disabled, true, 'plain disabled stays disabled')
  ok(!('aria-busy' in disabled), 'a disabled-but-not-busy button carries NO aria-busy')
  const idle = buttonState({ busy: false, disabled: false })
  eq(idle.disabled, false, 'idle buttons stay enabled')
  ok(!('aria-busy' in idle), 'idle buttons carry no aria-busy')
})

// ---- (c) state + merge ---------------------------------------------------------

test('(c) busy adds the state class; className merges last, deduped', () => {
  eq(buttonClasses({ variant: 'secondary', busy: true }), 'btn btn--secondary btn--busy', 'busy adds btn--busy after the variant')
  eq(
    buttonClasses({ variant: 'primary', busy: true, className: 'ds-btn' }),
    'btn btn--primary btn--busy ds-btn',
    'variant + busy + the surface geometry class in cascade-friendly order',
  )
  eq(buttonClasses({ variant: 'ghost', className: 'btn canvas-properties-ref-caption' }), 'btn btn--ghost canvas-properties-ref-caption', 'duplicate tokens dedupe (the surface may re-declare btn)')
  eq(buttonClasses({ variant: 'ghost', className: '  ds-btn   ' }), 'btn btn--ghost ds-btn', 'whitespace-only className tokens are dropped')
})

// ---- (d) recipe lockstep with the live sheet -----------------------------------

test('(d) every emittable class has a rule in src/styles.css, and no orphan recipes exist', () => {
  const emittable = ['btn', 'btn--busy']
    .concat(Array.from(BUTTON_VARIANTS).map((variant) => `btn--${variant}`))
    .sort()
  for (const className of emittable) {
    ok(BUTTON_RULES.has(className), `"${className}" is DEFINED in src/styles.css (the math cannot emit a class the sheet lacks)`)
  }
  const orphans = SHEET_BUTTON_CLASSES.filter((className) => !emittable.includes(className))
  eq(orphans.join('|'), '', `no orphan .btn rules the API cannot name (found: ${SHEET_BUTTON_CLASSES.join(', ')})`)
})

// ---- (e) P06: recipes carry tone/state ONLY ------------------------------------

const TONE_PROPERTIES = new Set(['color', 'background', 'border-color', 'opacity', 'cursor'])

test('(e) recipe rules carry tone/state declarations ONLY — geometry stays in the surface class', () => {
  ok(BUTTON_RULES.size >= 7, `the recipe family parsed from the sheet (got ${BUTTON_RULES.size} classes)`)
  for (const className of SHEET_BUTTON_CLASSES) {
    const props = Array.from(BUTTON_RULES.get(className).props)
    for (const prop of props) {
      ok(TONE_PROPERTIES.has(prop), `"${className}" declares "${prop}" — only color/background/border-color (+opacity/cursor state affordances) belong in the shared recipes (P06: padding/radius/font live in the consuming surface's own class)`)
    }
  }
  ok(Array.from(BUTTON_RULES.get('btn').props).includes('color'), 'the base recipe carries the tone trio (parse sanity)')
})

// ---- (f) tokens-only -------------------------------------------------------------

test('(f) every var() the recipes reference is :root-defined', () => {
  const referenced = new Set()
  for (const entry of Array.from(BUTTON_RULES.values())) {
    for (const name of Array.from(entry.varRefs)) referenced.add(name)
  }
  ok(referenced.size >= 3, `the recipes reference real tokens (got ${referenced.size})`)
  for (const name of Array.from(referenced)) {
    ok(ROOT_VARS.has(name), `recipe token "${name}" is DEFINED in src/styles.css :root (parsed at run time — no new literals, P02)`)
  }
})

// ---- (g) icon-only labeling (the dev-warn math, pure) ----------------------------

// Hand-built element fakes: buttonWarnFor only reads .props.children, so a
// minimal { $$typeof, props } shape exercises the same walk real elements do.
const element = (children) => ({ $$typeof: Symbol.for('react.transitional.element'), type: 'span', props: { children }, key: null })

test('(g) icon-only without aria-label warns; text anywhere in the tree satisfies', () => {
  ok(buttonWarnFor({ children: 'Save caption' }) === null, 'plain text children never warn')
  ok(buttonWarnFor({ children: element('Install') }) === null, 'text inside an element counts')
  ok(buttonWarnFor({ children: ['Install ', element('no network')] }) === null, 'mixed arrays with text count')
  ok(buttonWarnFor({ children: 42 }) === null, 'numbers are text content')
  const warned = buttonWarnFor({ children: element(null) })
  ok(typeof warned === 'string' && /aria-label/.test(warned), 'an icon-only button (no text) without aria-label produces the warning')
  ok(buttonWarnFor({ children: element(null), ariaLabel: 'Trash this source' }) === null, 'an aria-label satisfies the requirement')
  ok(buttonWarnFor({ children: null }) === null, 'an explicitly empty button does not warn (no icon to misname)')
  ok(buttonWarnFor({ children: [element(null), false] }) !== null, 'an icon element plus a boolean child still reads icon-only')
})

// ---- (h) the border-shorthand hazard net, Button leg -----------------------------
//
// THE FAILURE MODE (T6's C1, verbatim from the chip net): a surface rule
// declaring the `border:` SHORTHAND (or a per-edge shorthand) RESETS
// border-color to currentcolor — and at (0,1,0), EQUAL to .btn/.btn--*
// specificity, in a sheet that loads AFTER src/styles.css, it beats the
// recipes. Button renders the surface className AFTER the recipe classes,
// so EVERY className passed to <Button> is a composed surface token the
// net must cover — the composition is invisible to the TSX className walk
// (Button adds the recipes internally), which is why this leg scans
// <Button opening tags specifically.

/** The className attribute expression of one opening tag's source text. */
function classNameExpressionIn(openingTag) {
  const at = openingTag.search(/className=/)
  if (at === -1) return null
  const valueStart = at + 'className='.length
  if (openingTag[valueStart] === '"') {
    const close = openingTag.indexOf('"', valueStart + 1)
    if (close === -1) return null
    return openingTag.slice(valueStart + 1, close)
  }
  if (openingTag[valueStart] === '{') {
    let depth = 1
    let cursor = valueStart + 1
    while (depth > 0 && cursor < openingTag.length) {
      const char = openingTag[cursor]
      if (char === '{') depth += 1
      else if (char === '}') depth -= 1
      cursor += 1
    }
    return openingTag.slice(valueStart + 1, cursor - 1)
  }
  return null
}

/** Every <Button …> opening tag's full source text (attrs included). Walks
 *  from each `<Button` (word-bounded so <ButtonGroup-style names never
 *  match) to the closing `>` at brace-depth 0 outside quotes — arrow
 *  functions, `>`-bearing strings, and BACKSLASH ESCAPES inside attr
 *  strings (title="… editor\'s …") stay intact. */
function collectButtonOpeningTags(source) {
  const tags = []
  const pattern = /<Button(?=[\s/>])/g
  let match = pattern.exec(source)
  while (match !== null) {
    let cursor = match.index + match[0].length
    let depth = 0
    let quote = null
    let done = false
    while (cursor < source.length && !done) {
      const char = source[cursor]
      if (quote !== null) {
        if (char === '\\') cursor += 1 // escaped char — never closes the string
        else if (char === quote) quote = null
      } else if (char === '"' || char === "'") {
        quote = char
      } else if (char === '{') {
        depth += 1
      } else if (char === '}') {
        depth -= 1
      } else if (char === '>' && depth <= 0) {
        done = true
      }
      cursor += 1
    }
    tags.push(source.slice(match.index, cursor))
    match = pattern.exec(source)
  }
  return tags
}

/** Class TOKENS of one className expression: static text fully; inside ${…}
 *  interpolations only QUOTED STRING LITERALS count (the chip net's rule —
 *  bare identifiers are not class tokens). */
function classTokensOf(expression) {
  let text = ''
  let at = 0
  for (;;) {
    const open = expression.indexOf('${', at)
    if (open === -1) {
      text += ` ${expression.slice(at)} `
      break
    }
    text += ` ${expression.slice(at, open)} `
    let depth = 1
    let cursor = open + 2
    while (depth > 0 && cursor < expression.length) {
      if (expression[cursor] === '{') depth += 1
      else if (expression[cursor] === '}') depth -= 1
      cursor += 1
    }
    const inner = expression.slice(open + 2, cursor - 1)
    const quoted = inner.match(/'[^']*'|"[^"]*"/g) ?? []
    for (const literal of quoted) text += ` ${literal.slice(1, -1)} `
    at = cursor
  }
  return text.split(/[^a-zA-Z0-9_-]+/).filter(Boolean)
}

function walkFiles(dir, suffix, into) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-server') continue
      walkFiles(full, suffix, into)
    } else if (entry.name.endsWith(suffix)) {
      into.push(full)
    }
  }
  return into
}

function collectClassNameExpressions(source) {
  const expressions = []
  let at = 0
  for (;;) {
    const start = source.indexOf('className=', at)
    if (start === -1) break
    const valueStart = start + 'className='.length
    if (source[valueStart] === '"') {
      const close = source.indexOf('"', valueStart + 1)
      if (close === -1) break
      expressions.push(source.slice(valueStart + 1, close))
      at = close + 1
      continue
    }
    if (source[valueStart] === '{') {
      let depth = 1
      let cursor = valueStart + 1
      while (depth > 0 && cursor < source.length) {
        const char = source[cursor]
        if (char === '{') depth += 1
        else if (char === '}') depth -= 1
        cursor += 1
      }
      expressions.push(source.slice(valueStart + 1, cursor - 1))
      at = cursor
      continue
    }
    at = valueStart
  }
  return expressions
}

test('(h) no Button-composed surface class is styled by a border shorthand', () => {
  const srcRoot = path.resolve(__dirname, '..', 'src')
  // 1. The surface tokens: every class token that shares a className value
  //    with the recipes — either passed to <Button> (Button renders them
  //    after `btn btn--*` by construction) or composed literally alongside
  //    `btn`/`btn--*` in a plain className expression.
  const surfaceTokens = new Set()
  const tsxFiles = walkFiles(srcRoot, '.tsx', [])
  ok(tsxFiles.length > 20, `the TSX walk found the source tree (${tsxFiles.length} files)`)
  for (const file of tsxFiles) {
    const source = fs.readFileSync(file, 'utf8')
    for (const tag of collectButtonOpeningTags(source)) {
      const expression = classNameExpressionIn(tag)
      if (expression === null) continue
      for (const token of classTokensOf(expression)) {
        if (token !== 'btn' && !token.startsWith('btn--')) surfaceTokens.add(token)
      }
    }
    for (const expression of collectClassNameExpressions(source)) {
      const tokens = classTokensOf(expression)
      const composesBtn = tokens.some((token) => token === 'btn' || token.startsWith('btn--'))
      if (!composesBtn) continue
      for (const token of tokens) {
        if (token !== 'btn' && !token.startsWith('btn--')) surfaceTokens.add(token)
      }
    }
  }
  ok(surfaceTokens.has('ds-btn'), 'the walk sees the first family\'s surface token (parse sanity: ds-btn)')

  // 2. Any rule in the src sheets referencing such a token that declares a
  //    border shorthand (whole or per-edge) — the hazard at equal-or-higher
  //    specificity than the recipes.
  const cssFiles = walkFiles(srcRoot, '.css', [])
  const violations = []
  for (const file of cssFiles) {
    for (const rule of collectRules(fs.readFileSync(file, 'utf8'))) {
      const referencesSurfaceToken = Array.from(surfaceTokens).some((token) => new RegExp(`\\.${token}(?![a-zA-Z0-9_-])`).test(rule.selectorText))
      if (!referencesSurfaceToken) continue
      for (const declaration of rule.body.split(';')) {
        const colon = declaration.indexOf(':')
        if (colon === -1) continue
        const prop = declaration.slice(0, colon).trim().toLowerCase()
        if (prop === 'border' || /^(border-(top|right|bottom|left))$/.test(prop)) {
          violations.push(`${path.relative(srcRoot, file)}: "${rule.selectorText.trim().replace(/\s+/g, ' ').slice(0, 60)}" declares ${prop}: — the shorthand resets border-color to currentcolor and, at (0,1,0) in a later-loading sheet, beats the .btn recipes (split to border-width/border-style longhands)`)
        }
      }
    }
  }
  eq(violations.length, 0, `zero border shorthands on Button-composed surface classes (found: ${violations.length})\n    ${violations.join('\n    ')}`)
})
