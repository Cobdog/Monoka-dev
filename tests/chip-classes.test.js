// chip-classes (component vocabulary task 6, Flux k2q0n9s) — the chip
// system's OWN contract: the pure tone/variant class math + aria mapping
// behind src/ui/Chip.tsx (kept in the react-free src/ui/chipClasses.ts so
// this node suite can load it through the VM harness), and the recipe
// block's shape in src/styles.css:
//
//   (a) tone mapping — every ChipTone composes `chip chip--{tone}` (neutral
//       = the bare `chip` base, no modifier); unknown tones THROW (closed
//       matrix — the spec's chip-over-generalization risk mitigation,
//       enforced at runtime the same way statusToken enforces its domains).
//   (b) state + merge — selected/busy add their state classes; the surface's
//       className lands LAST (the geometry class composes after the tone so
//       equal-specificity dialect rules in the surface's own later-loading
//       sheet win the cascade); duplicate tokens dedupe; no stray whitespace.
//   (c) variant mapping — chipAria(): toggle → aria-pressed (independent
//       toggles are PRESSED BUTTONS, the r3 correction — never aria-checked,
//       which belongs to checkbox/radio roles only); radio → role=radio +
//       aria-checked (EXCLUSIVE groups only); action → no state aria; busy →
//       aria-busy; unknown variants throw.
//   (d) recipe lockstep, both directions — every class the math can emit has
//       a `.chip`-family rule in src/styles.css, and every `.chip--*` rule in
//       the sheet is one the API can name (no orphan recipes, no dead tones).
//   (e) P06 enforcement — the recipe rules carry color/background/border-
//       color (plus the opacity/cursor state affordances) and NOTHING else:
//       no padding, radius, font, gap, or border shorthand — geometry stays
//       in the consuming surface's own class applied alongside.
//   (f) tokens-only — every var() name the recipes reference is DEFINED in
//       src/styles.css's :root (P02 + the statusToken doctrine: membership
//       proves definition, never a hand-maintained constant).
//
// Keyboard behavior (arrows, roving tabindex, Tab exit) is NOT this suite's
// business (vitest is node-env, P04): e2e/canvas.spec.ts owns it.
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const { loadTs } = require('../scripts/lib/ts-vm.cjs')
const chipClassesModule = loadTs('src/ui/chipClasses.ts')
const { chipClasses, chipAria, CHIP_TONES, CHIP_VARIANTS } = chipClassesModule

const ok = (condition, label) => assert.ok(condition, label)

function eq(actual, expected, label) {
  assert.equal(actual, expected, label)
  console.log(`  ok - ${label}`)
}

// ---- the live sheet parse ------------------------------------------------
//
// Reuse the statusToken doctrine: read src/styles.css at run time. The chip
// recipe rules are extracted by scanning each top-level `{ ... }` block whose
// selector list contains a `.chip`-family selector; declarations are split on
// ';' with property names taken from the text before the first ':'.
const STYLES = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'styles.css'), 'utf8')

function parseRootCustomProperties(css) {
  const start = css.indexOf(':root')
  if (start === -1) throw new Error('no :root block found in src/styles.css')
  const open = css.indexOf('{', start)
  let depth = 1
  let end = open + 1
  while (depth > 0 && end < css.length) {
    if (css[end] === '{') depth += 1
    if (css[end] === '}') depth -= 1
    end += 1
  }
  const block = css.slice(open + 1, end - 1)
  const names = new Set()
  const declaration = /(--[\w-]+)\s*:/g
  let match = declaration.exec(block)
  while (match !== null) {
    names.add(match[1])
    match = declaration.exec(block)
  }
  if (names.size < 40) throw new Error(`:root parse looks wrong — only ${names.size} custom properties found`)
  return names
}

const ROOT_VARS = parseRootCustomProperties(STYLES)

/** Every top-level rule whose selector list mentions a `.chip`-family class,
 *  mapped className → the union of its declarations across all such rules. */
function collectChipRules(css) {
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
  let index = 0
  while (index < css.length) {
    const open = css.indexOf('{', index)
    if (open === -1) break
    let depth = 1
    let end = open + 1
    while (depth > 0 && end < css.length) {
      if (css[end] === '{') depth += 1
      if (css[end] === '}') depth -= 1
      end += 1
    }
    const selectorText = css.slice(index, open)
    const body = css.slice(open + 1, end - 1)
    // Chip rules live at top level only: @media/@keyframes preludes are
    // skipped whole (their inner rules are never visited — a recipe that
    // moves inside a media query escapes the ORPHAN direction of (d), never
    // the emittable direction; keep the recipes top-level).
    if (!selectorText.trimStart().startsWith('@')) {
      for (const selector of selectorText.split(',')) {
        const classPattern = /\.chip\b(--[\w-]+)?/g
        let classMatch = classPattern.exec(selector)
        while (classMatch !== null) {
          note(classMatch[0].slice(1), body)
          classMatch = classPattern.exec(selector)
        }
      }
    }
    index = end
  }
  return rules
}

const CHIP_RULES = collectChipRules(STYLES)
const SHEET_CHIP_CLASSES = Array.from(CHIP_RULES.keys()).sort()

// ---- (a) tone mapping ------------------------------------------------------

test('(a) every tone composes its recipe; neutral is the bare base', () => {
  eq(chipClasses({ tone: 'neutral' }), 'chip', 'neutral tone = the bare chip base')
  for (const tone of ['accent', 'danger', 'warning', 'muted']) {
    eq(chipClasses({ tone }), `chip chip--${tone}`, `${tone} tone composes chip--${tone}`)
  }
})

test('(a) unknown tones throw — the tone matrix is closed', () => {
  assert.throws(() => chipClasses({ tone: 'sparkle' }), /chip tone/i, 'an unmapped tone throws (no silent base fallback)')
  assert.throws(() => chipClasses({ tone: 'ACCENT' }), /chip tone/i, 'tone names are case-sensitive')
})

// ---- (b) state + merge -----------------------------------------------------

test('(b) selected/busy add their state classes; className merges last, deduped', () => {
  eq(chipClasses({ selected: true }), 'chip chip--selected', 'selected adds the state class')
  eq(chipClasses({ busy: true }), 'chip chip--busy', 'busy adds the state class')
  eq(
    chipClasses({ tone: 'danger', selected: true, busy: true, className: 'canvas-chip' }),
    'chip chip--danger chip--selected chip--busy canvas-chip',
    'tone + both states + the surface geometry class in cascade-friendly order',
  )
  eq(chipClasses({ className: 'chip canvas-chip' }), 'chip canvas-chip', 'duplicate tokens dedupe (the surface may re-declare chip)')
  eq(chipClasses({ className: '  canvas-chip   ' }), 'chip canvas-chip', 'whitespace-only className tokens are dropped')
  eq(chipClasses({ tone: 'neutral', selected: false, busy: false }), 'chip', 'no props → the bare recipe base')
})

// ---- (c) variant mapping ---------------------------------------------------

test('(c) toggle → aria-pressed; radio → role=radio + aria-checked; action → no state aria', () => {
  const toggle = chipAria({ variant: 'toggle', selected: true })
  eq(toggle['aria-pressed'], true, 'toggle selected = aria-pressed true (pressed buttons, the r3 correction)')
  eq(toggle['aria-checked'], undefined, 'toggle NEVER carries aria-checked (checkbox/radio territory)')
  eq(toggle.role, undefined, 'toggle keeps the plain button role (no role override)')
  eq(chipAria({ variant: 'toggle', selected: false })['aria-pressed'], false, 'toggle unselected = aria-pressed false')

  const radio = chipAria({ variant: 'radio', selected: true })
  eq(radio.role, 'radio', 'radio variant renders role=radio')
  eq(radio['aria-checked'], true, 'radio selected = aria-checked true')
  eq(radio['aria-pressed'], undefined, 'radio NEVER carries aria-pressed')
  eq(chipAria({ variant: 'radio', selected: false })['aria-checked'], false, 'radio unselected = aria-checked false')

  const action = chipAria({ variant: 'action', selected: true })
  ok(!('aria-pressed' in action) && !('aria-checked' in action) && !('role' in action), 'action chips carry no selection state aria')
})

test('(c) busy sets aria-busy on every variant; unknown variants throw', () => {
  eq(chipAria({ busy: true })['aria-busy'], true, 'busy announces aria-busy')
  eq(chipAria({ variant: 'toggle', selected: true, busy: true })['aria-busy'], true, 'busy composes with variant state')
  assert.throws(() => chipAria({ variant: 'switch' }), /chip variant/i, 'an unknown variant throws (closed variant set)')
})

test('(c) the exported vocabularies are the closed sets the maps enforce', () => {
  eq(CHIP_TONES.join('|'), 'neutral|accent|danger|warning|muted', 'the tone vocabulary')
  eq(CHIP_VARIANTS.join('|'), 'action|toggle|radio', 'the variant vocabulary')
})

// ---- (d) recipe lockstep with the live sheet -------------------------------

test('(d) every emittable class has a rule in src/styles.css, and no orphan recipes exist', () => {
  const emittable = ['chip', 'chip--selected', 'chip--busy']
    .concat(Array.from(CHIP_TONES).filter((tone) => tone !== 'neutral').map((tone) => `chip--${tone}`))
    .sort()
  for (const className of emittable) {
    ok(CHIP_RULES.has(className), `"${className}" is DEFINED in src/styles.css (the math cannot emit a class the sheet lacks)`)
  }
  const orphans = SHEET_CHIP_CLASSES.filter((className) => !emittable.includes(className))
  eq(orphans.join('|'), '', `no orphan .chip rules the API cannot name (found: ${SHEET_CHIP_CLASSES.join(', ')})`)
})

// ---- (e) P06: recipes carry tone/state ONLY ---------------------------------

const TONE_PROPERTIES = new Set(['color', 'background', 'border-color', 'opacity', 'cursor'])

test('(e) recipe rules carry tone/state declarations ONLY — geometry stays in the surface class', () => {
  ok(CHIP_RULES.size >= 6, `the recipe family parsed from the sheet (got ${CHIP_RULES.size} classes)`)
  for (const className of SHEET_CHIP_CLASSES) {
    const props = Array.from(CHIP_RULES.get(className).props)
    for (const prop of props) {
      ok(TONE_PROPERTIES.has(prop), `"${className}" declares "${prop}" — only color/background/border-color (+opacity/cursor state affordances) belong in the shared recipes (P06: padding/radius/font live in the consuming surface's own class)`)
    }
  }
  ok(Array.from(CHIP_RULES.get('chip').props).includes('color'), 'the base recipe carries the tone trio (parse sanity)')
})

// ---- (f) tokens-only ---------------------------------------------------------

test('(f) every var() the recipes reference is :root-defined', () => {
  const referenced = new Set()
  for (const entry of Array.from(CHIP_RULES.values())) {
    for (const name of Array.from(entry.varRefs)) referenced.add(name)
  }
  ok(referenced.size >= 3, `the recipes reference real tokens (got ${referenced.size})`)
  for (const name of Array.from(referenced)) {
    ok(ROOT_VARS.has(name), `recipe token "${name}" is DEFINED in src/styles.css :root (parsed at run time — no new literals, P02)`)
  }
})

// ---- (g) the border-shorthand hazard net (fix round 1, C1/I2) ---------------
//
// THE FAILURE MODE this net exists for: a surface rule declaring the
// `border:` SHORTHAND (or a per-edge shorthand like `border-top:`) RESETS
// border-color to currentcolor — and at (0,1,0), EQUAL to .chip/.chip--*
// specificity, in a sheet that loads AFTER src/styles.css (canvas.css,
// datasets.css, workbench.css), it beats the recipes. The composed tone then
// renders silently as the surface's own color: C1 shipped exactly this way —
// the gap menu's selected option carried `chip--selected` while
// `.canvas-gap-option`'s shorthand + background/color kept winning, so the
// selection was invisible and the old `.active` rule died unread.
//
// stylelint cannot catch this (it lints one sheet at a time and knows
// nothing about WHICH elements compose `chip` — the composition lives in
// the TSX), which is why the net lives HERE: walk every chip-composed
// element's SURFACE class tokens out of the TSX, then fail on any rule in
// the src sheets that references such a token and declares a border
// shorthand. Surface geometry rules must use the border-width/border-style
// LONGHANDS (the migration discipline recorded in canvas.css).

/** Every top-level rule (selector text + declarations) in a CSS sheet. */
function collectRules(css) {
  const rules = []
  let index = 0
  while (index < css.length) {
    const open = css.indexOf('{', index)
    if (open === -1) break
    let depth = 1
    let end = open + 1
    while (depth > 0 && end < css.length) {
      if (css[end] === '{') depth += 1
      if (css[end] === '}') depth -= 1
      end += 1
    }
    const selectorText = css.slice(index, open)
    const body = css.slice(open + 1, end - 1)
    if (!selectorText.trimStart().startsWith('@')) rules.push({ selectorText, body })
    index = end
  }
  return rules
}

/** All className attribute values (static strings AND brace-matched template
 *  expressions, ternary branches included) in one TSX file's source. */
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
      // Brace-match the expression (template literals may nest braces).
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

/** Class TOKENS of one className expression: static text fully; inside
 *  ${…} interpolations only QUOTED STRING LITERALS count (ternary branches
 *  like 'chip--selected' are class tokens; bare identifiers like
 *  chip.status are NOT — the node-pack rows' `${chip.status}` must not read
 *  as chip composition). */
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

test('(g) no chip-composed surface class is styled by a border shorthand', () => {
  const srcRoot = path.resolve(__dirname, '..', 'src')
  // 1. The surface tokens: every class token that shares a className value
  //    with `chip` or a `chip--*` modifier anywhere in the TSX.
  const surfaceTokens = new Set()
  const tsxFiles = walkFiles(srcRoot, '.tsx', [])
  ok(tsxFiles.length > 20, `the TSX walk found the source tree (${tsxFiles.length} files)`)
  for (const file of tsxFiles) {
    const source = fs.readFileSync(file, 'utf8')
    for (const expression of collectClassNameExpressions(source)) {
      const tokens = classTokensOf(expression)
      const composesChip = tokens.some((token) => token === 'chip' || token.startsWith('chip--'))
      if (!composesChip) continue
      for (const token of tokens) {
        if (token !== 'chip' && !token.startsWith('chip--')) surfaceTokens.add(token)
      }
    }
  }
  ok(surfaceTokens.has('canvas-chip'), 'the walk sees the census surface tokens (parse sanity: canvas-chip)')
  ok(surfaceTokens.has('canvas-gap-option'), 'the walk sees the C1 token (parse sanity: canvas-gap-option)')

  // 2. Any rule in the src sheets referencing a surface token that declares
  //    a border shorthand (whole or per-edge) — the hazard at equal-or-higher
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
          violations.push(`${path.relative(srcRoot, file)}: "${rule.selectorText.trim().replace(/\s+/g, ' ').slice(0, 60)}" declares ${prop}: — the shorthand resets border-color to currentcolor and, at (0,1,0) in a later-loading sheet, beats the .chip recipes (split to border-width/border-style longhands)`)
        }
      }
    }
  }
  eq(violations.length, 0, `zero border shorthands on chip-composed surface classes (found: ${violations.length})\n    ${violations.join('\n    ')}`)
})
