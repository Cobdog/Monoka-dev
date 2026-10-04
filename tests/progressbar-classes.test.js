// progressbar-classes (component vocabulary task 8, Flux k2q0n9s) — the
// scalar progress bar's OWN contract: the pure tone/state class math, the
// DETERMINATE WIDTH MATH, and the aria mapping behind src/ui/ProgressBar.tsx
// (kept in the react-free src/ui/progressClasses.ts so this node suite can
// load it through the VM harness), plus the recipe block's shape in
// src/styles.css:
//
//   (a) tone mapping — accent is the bare base (no modifier, the chip
//       neutral precedent); `local` composes `progressbar--local` (the fill
//       + track read the surface's `--bar-tone` bridge); unknown tones THROW
//       (closed matrix — the chip-over-generalization mitigation).
//   (b) state + merge — indeterminate/compact add their state classes; the
//       surface's className lands LAST (the geometry class composes after
//       the recipes so equal-specificity dialect rules in the surface's own
//       later-loading sheet win the cascade); duplicates dedupe.
//   (c) determinate width math — EXACT parity with the retired fetch-site
//       expression `${Math.round(f * 100)}%` across a 0..1 sweep, plus the
//       clamping contract (outside → 0%/100%, no-value → 0%). This is the
//       migration's rendering contract: for every fraction the fetch rows
//       ever rendered, the component emits the byte-identical width string.
//   (d) indeterminate is ONE class-toggle — `progressbar--indeterminate` on
//       the track; it wins over `value` (no width, no aria-value triple).
//   (e) aria — role="progressbar" always (indeterminate included); the
//       determinate value triple (0..100) carries the SAME rounding as the
//       width math, so what AT hears equals what the eye sees.
//   (f) recipe lockstep, both directions — every class the math/components
//       can emit has a `.progressbar`-family rule in src/styles.css, and
//       every `.progressbar--*` rule in the sheet is one the API can name.
//   (g) P06 enforcement, progressbar edition — the recipes carry TONE
//       (background) + the bar's intrinsic MECHANICS (display/overflow/
//       height/width/transition/animation, the two size steps) and NOTHING
//       else: no padding, font, margin, position, or borders; border-radius
//       appears ONLY as `inherit` on the fill (the track owns geometry).
//   (h) tokens-only — every var() the recipes reference is :root-defined,
//       EXCEPT the documented `--bar-tone` bridge (set by the consuming
//       surface, the statusToken `--pill-fg` precedent — never a :root
//       token).
//   (i) migration pins — the absorbed dialect rules are GONE from the
//       sheets and the retained surface geometry rules are still there
//       (tone deleted, shape stays — the manifest §10 doctrine), so a
//       regression that reintroduces a private dialect reds here.
//
// Why NO border-shorthand hazard-net leg (the C1 net has chip/button legs):
// the hazard is a surface `border:` shorthand silently resetting a RECIPE's
// border-color at equal-or-later cascade — but the progressbar recipes
// declare NO border property at all, so there is nothing to clobber. The
// one composed surface rule with a border (`.fetch-progress-bar`) was split
// to longhands at migration anyway (the recorded discipline), so a future
// recipe that gains border-color is protected by the existing discipline,
// not by a vacuous net.
//
// Browser behavior (computed styles, the running-tile pin) is e2e's
// business (P04): e2e/canvas.spec.ts owns it.
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const { loadTs } = require('../scripts/lib/ts-vm.cjs')
const progressModule = loadTs('src/ui/progressClasses.ts')
const { progressClasses, progressWidth, progressAria, PROGRESS_TONES } = progressModule

const ok = (condition, label) => assert.ok(condition, label)

function eq(actual, expected, label) {
  assert.equal(actual, expected, label)
  console.log(`  ok - ${label}`)
}

// ---- the live sheet parse (the chip/statusToken doctrine) -------------------

const STYLES = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'styles.css'), 'utf8')
const CANVAS_CSS = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'canvas', 'canvas.css'), 'utf8')

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

/** Comments are PROSE, never rules — strip them before any rule-shape scan
 *  (a comment saying "retired into the .progressbar recipes" is not a
 *  selector, and a comment mentioning a retired name is not a rule). */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

const STYLES_NOCOMMENTS = stripComments(STYLES)
const CANVAS_CSS_NOCOMMENTS = stripComments(CANVAS_CSS)

/** Every top-level rule whose selector list mentions a `.progressbar`
 *  modifier (the base and the `-fill` child are handled explicitly), mapped
 *  className → the union of its declarations across all such rules. */
function collectProgressbarRules(css) {
  const rules = new Map()
  const note = (className, body) => {
    if (!rules.has(className)) rules.set(className, { props: new Set(), declarations: new Map(), varRefs: new Set() })
    const entry = rules.get(className)
    const declarations = body.split(';')
    for (const declaration of declarations) {
      const colon = declaration.indexOf(':')
      if (colon === -1) continue
      const prop = declaration.slice(0, colon).trim().toLowerCase()
      const value = declaration.slice(colon + 1).trim()
      if (prop) {
        entry.props.add(prop)
        entry.declarations.set(prop, value)
      }
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
    // Recipes live at top level only: @media/@keyframes preludes are skipped
    // whole (the chip collector's rule — a recipe that moves inside a media
    // query escapes the ORPHAN direction, never the emittable direction).
    if (!selectorText.trimStart().startsWith('@')) {
      for (const selector of selectorText.split(',')) {
        // The house kebab convention (stylelint's selector-class-pattern)
        // has no BEM `__`: the fill is `.progressbar-fill`. The lookahead
        // keeps the base pattern from swallowing kebab children — the fill
        // gets its own explicit membership on the next line.
        const classPattern = /\.progressbar(--[\w-]+)?(?![\w-])/g
        let classMatch = classPattern.exec(selector)
        while (classMatch !== null) {
          note(classMatch[0].slice(1), body)
          classMatch = classPattern.exec(selector)
        }
        if (/\.progressbar-fill(?![\w-])/.test(selector)) note('progressbar-fill', body)
      }
    }
    index = end
  }
  return rules
}

const PROGRESS_RULES = collectProgressbarRules(STYLES_NOCOMMENTS)
const SHEET_PROGRESS_CLASSES = Array.from(PROGRESS_RULES.keys()).sort()

// ---- (a) tone mapping --------------------------------------------------------

test('(a) accent is the bare base; local composes its recipe; unknown tones throw', () => {
  eq(progressClasses({}), 'progressbar', 'no props → the bare recipe base (accent default)')
  eq(progressClasses({ tone: 'accent' }), 'progressbar', 'accent tone = the bare base, no modifier')
  eq(progressClasses({ tone: 'local' }), 'progressbar progressbar--local', 'local tone composes progressbar--local')
  assert.throws(() => progressClasses({ tone: 'sparkle' }), /progress tone/i, 'an unmapped tone throws (no silent base fallback)')
  assert.throws(() => progressClasses({ tone: 'ACCENT' }), /progress tone/i, 'tone names are case-sensitive')
  eq(PROGRESS_TONES.join('|'), 'accent|local', 'the tone vocabulary is the closed set')
})

// ---- (b) state + merge ---------------------------------------------------------

test('(b) indeterminate/compact add their state classes; className merges last, deduped', () => {
  eq(progressClasses({ indeterminate: true }), 'progressbar progressbar--indeterminate', 'indeterminate adds the state class')
  eq(progressClasses({ compact: true }), 'progressbar progressbar--compact', 'compact adds the size-step class')
  eq(
    progressClasses({ tone: 'local', indeterminate: true, compact: true, className: 'canvas-tile-progress' }),
    'progressbar progressbar--local progressbar--indeterminate progressbar--compact canvas-tile-progress',
    'tone + both states + the surface geometry class in cascade-friendly order',
  )
  eq(progressClasses({ className: 'progressbar fetch-progress-bar' }), 'progressbar fetch-progress-bar', 'duplicate tokens dedupe (the surface may re-declare the base)')
  eq(progressClasses({ className: '  fetch-progress-bar   ' }), 'progressbar fetch-progress-bar', 'whitespace-only className tokens are dropped')
})

// ---- (c) the determinate width math — EXACT ------------------------------------

test('(c) progressWidth is byte-identical to the retired fetch expression across the unit sweep', () => {
  // The fetch site rendered `${Math.round(fraction * 100)}%` — every value
  // the component emits for a 0..1 fraction must equal it exactly.
  const retiredExpression = (fraction) => `${Math.round(fraction * 100)}%`
  let checked = 0
  for (let step = 0; step <= 1000; step += 1) {
    const fraction = step / 1000
    eq(progressWidth(fraction), retiredExpression(fraction), `width(${fraction}) === the retired expression`)
    checked += 1
  }
  ok(checked === 1001, `the sweep covered the whole unit interval (${checked} points)`)
  // Named pins at the rounding boundaries the sweep proves generically.
  eq(progressWidth(0), '0%', 'zero renders 0%')
  eq(progressWidth(1), '100%', 'complete renders 100%')
  eq(progressWidth(0.5), '50%', 'half renders 50%')
  eq(progressWidth(0.347), '35%', '0.347 rounds UP to 35% (Math.round, not floor)')
  eq(progressWidth(0.342), '34%', '0.342 rounds DOWN to 34%')
  eq(progressWidth(0.005), '1%', 'the .5 boundary rounds up (Math.round parity)')
})

test('(c) the clamp contract — outside values and no-value collapse honestly', () => {
  eq(progressWidth(-0.3), '0%', 'negative clamps to 0% (never a negative width)')
  eq(progressWidth(1.7), '100%', 'overflow clamps to 100% (never >100%)')
  eq(progressWidth(Number.NaN), '0%', 'NaN reads as an empty bar, not a crash')
  eq(progressWidth(undefined), '0%', 'no value renders an empty determinate bar')
  eq(progressWidth(null), '0%', 'explicit null renders an empty determinate bar')
})

// ---- (d) indeterminate is the class toggle --------------------------------------

test('(d) indeterminate wins over value — the class, not a width', () => {
  // The retired site toggled `className={fraction === null ? 'indeterminate' : ''}`
  // with a synthetic width:100%; the component expresses the SAME state as
  // one class and suppresses the width entirely.
  eq(progressClasses({ indeterminate: true }), 'progressbar progressbar--indeterminate', 'the one class')
  ok(progressClasses({ indeterminate: true, value: undefined }).includes('progressbar--indeterminate'), 'indeterminate composes regardless of value')
})

// ---- (e) aria -------------------------------------------------------------------

test('(e) role=progressbar always; the determinate triple matches the width rounding', () => {
  const determinate = progressAria({ value: 0.347 })
  eq(determinate.role, 'progressbar', 'determinate bars expose the progressbar role')
  eq(determinate['aria-valuemin'], '0', 'min 0')
  eq(determinate['aria-valuemax'], '100', 'max 100 (percent units)')
  eq(determinate['aria-valuenow'], '35', 'now uses the SAME Math.round as the width (35% seen and heard)')
  eq(progressAria({ value: 1 })['aria-valuenow'], '100', 'complete announces 100')
  eq(progressAria({ value: 1.9 })['aria-valuenow'], '100', 'overflow clamps in aria too')
  eq(progressAria({ value: -1 })['aria-valuenow'], '0', 'negative clamps in aria too')

  const indeterminate = progressAria({ indeterminate: true })
  eq(indeterminate.role, 'progressbar', 'indeterminate bars keep the role (no value triple is the indeterminate signal)')
  ok(!('aria-valuenow' in indeterminate), 'indeterminate carries NO value triple')
  const indeterminateWithValue = progressAria({ indeterminate: true, value: 0.7 })
  ok(!('aria-valuenow' in indeterminateWithValue), 'indeterminate suppresses the triple even if a value leaks in (state wins, matching the width)')
  eq(progressAria({}).role, 'progressbar', 'a bare bar still announces its role')
  ok(!('aria-valuenow' in progressAria({})), 'no value → no triple (empty is not zero-progress)')

  // What the eye sees equals what AT hears, across the sweep.
  for (let step = 0; step <= 100; step += 1) {
    const fraction = step / 100
    const aria = progressAria({ value: fraction })
    eq(aria['aria-valuenow'], progressWidth(fraction).slice(0, -1), `aria now === width number at ${fraction}`)
  }
})

// ---- (f) recipe lockstep with the live sheet -------------------------------------

test('(f) every emittable class has a rule in src/styles.css, and no orphan recipes exist', () => {
  const emittable = ['progressbar', 'progressbar-fill', 'progressbar--indeterminate', 'progressbar--compact']
    .concat(Array.from(PROGRESS_TONES).filter((tone) => tone !== 'accent').map((tone) => `progressbar--${tone}`))
    .sort()
  for (const className of emittable) {
    ok(PROGRESS_RULES.has(className), `"${className}" is DEFINED in src/styles.css (the math cannot emit a class the sheet lacks)`)
  }
  const orphans = SHEET_PROGRESS_CLASSES.filter((className) => !emittable.includes(className))
  eq(orphans.join('|'), '', `no orphan .progressbar rules the API cannot name (found: ${SHEET_PROGRESS_CLASSES.join(', ')})`)
  ok(PROGRESS_RULES.has('progressbar--indeterminate'), 'the indeterminate state rule exists (parse sanity)')
})

// ---- (g) P06, progressbar edition -------------------------------------------------

// Tone + the bar's intrinsic mechanics + the two size steps. NOT here:
// padding, font, margin, position, borders, or any absolute border-radius —
// geometry lives in the consuming surface's class composed alongside.
const RECIPE_PROPERTIES = new Set(['background', 'display', 'overflow', 'height', 'width', 'transition', 'animation'])

test('(g) recipe rules carry tone + bar mechanics ONLY; border-radius only as inherit', () => {
  ok(PROGRESS_RULES.size >= 5, `the recipe family parsed from the sheet (got ${PROGRESS_RULES.size} classes)`)
  for (const className of SHEET_PROGRESS_CLASSES) {
    const entry = PROGRESS_RULES.get(className)
    for (const prop of Array.from(entry.props)) {
      if (prop === 'border-radius') {
        eq(entry.declarations.get(prop), 'inherit', `"${className}" border-radius must be inherit (the track owns the geometry — no absolute radius in the recipes)`)
        continue
      }
      ok(RECIPE_PROPERTIES.has(prop), `"${className}" declares "${prop}" — only tone (background) + the bar's mechanics (display/overflow/height/width/transition/animation) belong in the shared recipes (P06: the track's dimensions/radius/margins stay in the surface class)`)
    }
  }
  ok(PROGRESS_RULES.get('progressbar').props.has('background'), 'the base recipe carries the track tone (parse sanity)')
  ok(PROGRESS_RULES.get('progressbar-fill').props.has('background'), 'the fill recipe carries the fill tone (parse sanity)')
  ok(PROGRESS_RULES.get('progressbar-fill').props.has('transition'), 'the fill recipe carries the width transition (parse sanity)')
})

// ---- (h) tokens-only ---------------------------------------------------------------

test('(h) every var() the recipes reference is :root-defined, except the --bar-tone bridge', () => {
  const referenced = new Set()
  for (const entry of Array.from(PROGRESS_RULES.values())) {
    for (const name of Array.from(entry.varRefs)) referenced.add(name)
  }
  ok(referenced.size >= 2, `the recipes reference real tokens (got ${referenced.size})`)
  for (const name of Array.from(referenced)) {
    if (name === '--bar-tone') continue // the documented surface bridge (the --pill-fg precedent)
    ok(ROOT_VARS.has(name), `recipe token "${name}" is DEFINED in src/styles.css :root (parsed at run time — no new literals, P02)`)
  }
  ok(referenced.has('--bar-tone'), 'the local tone actually reads the --bar-tone bridge (parse sanity)')
})

// ---- (i) migration pins — the absorbed dialects are gone, the geometry stays ---------

test('(i) the retired dialect rules are absent; the retained surface geometry is present', () => {
  // Absorbed into the recipes (tone + the unified sweep) — checked against
  // the comment-stripped sheets: prose naming a retired rule is not a rule.
  ok(!/fetch-indeterminate/.test(STYLES_NOCOMMENTS), 'the fetch-indeterminate keyframes are retired (the census fold)')
  ok(!/\.fetch-progress-bar > span/.test(STYLES_NOCOMMENTS), 'the fetch fill dialect rule is retired (progressbar-fill owns the fill)')
  ok(!/canvas-slide/.test(CANVAS_CSS_NOCOMMENTS), 'the canvas-slide keyframes are retired (progressbar-sweep owns the sweep)')
  ok(!/\.canvas-tile-progress::after/.test(CANVAS_CSS_NOCOMMENTS), 'the tile ::after dialect is retired (the component renders the fill)')
  // Retained geometry (shape stays, tone moved):
  ok(/\.fetch-progress-bar \{/.test(STYLES_NOCOMMENTS), 'the fetch track geometry rule is retained')
  ok(/\.canvas-tile-progress \{/.test(CANVAS_CSS_NOCOMMENTS), 'the tile track geometry rule is retained')
  ok(/\.canvas-tile-progress[^{]*\{[^}]*--bar-tone:\s*var\(--tile-tone\)/.test(CANVAS_CSS), 'the tile bridges --tile-tone onto --bar-tone (the local tone contract)')
})
