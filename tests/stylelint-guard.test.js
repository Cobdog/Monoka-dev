// The stylelint guard suite (component vocabulary task 5, Flux k2q0n9s) —
// the contract of `component-vocab/no-dead-fallback`, the rule that
// enforces spec principle 5 ("Tokens always") on the type ramp:
//
//   (a) ramp liveness — the rule's token→size knowledge is PARSED from
//       src/styles.css's :root blocks at load time (the statusToken
//       doctrine: membership proves definition, never a hand-maintained
//       constant). The suite re-parses the sheet independently and the
//       two must agree — a stale or hand-edited ramp reds here.
//   (b) the A10 fixture errors — `font-size: var(--text-2xs, 11px)` is
//       exactly the pattern audit A10 caught (--text-2xs IS defined at
//       7px, so the 11px fallback never applies; a var() fallback is not
//       a minimum). It must produce one rule warning naming the token's
//       REAL size, and EVERY ramp token is guarded the same way.
//   (c) compliant declarations stay clean — the bare token (the
//       removal-first end state), the `--text` COLOR token, non-ramp
//       custom-property fallbacks, and undefined ramp-shaped tokens (a
//       LIVE fallback — a different bug, not this rule's scope) all pass.
//   (d) the documented suppression idiom silences the rule — the syntax
//       exempt surfaces (manifest §12: prototypes / pose-rig authoring)
//       are permitted to carry, with a reason.
//   (e) the repo tree carries ZERO dead fallbacks — the four sheets that
//       carried the A10 class (styles.css, images/workbench.css,
//       datasets/datasets.css, surfaces/surfaces.css) lint clean under
//       the rule: the removal-first policy held in the committed tree,
//       not just in fixtures. Comments quoting the pattern as history
//       stay untouched by construction (the rule walks declarations).
//
// Vehicle: stylelint's programmatic node API over the repo's real
// stylelint.config.mjs — the same config `pnpm lint` runs.
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import stylelint from 'stylelint'
// Namespace import on purpose: in the red state the config does not yet
// export textRamp — a missing named export must fail the (a) assertion,
// not the module link (a clean per-test red, not an import crash).
import * as configModule from '../stylelint.config.mjs'

const stylelintConfig = configModule.default
const exportedRamp = configModule.textRamp

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const ok = (condition, label) => assert.ok(condition, label)
const eq = (actual, expected, label) => assert.equal(actual, expected, label)

const RULE = 'component-vocab/no-dead-fallback'

// Lint a CSS string under the repo config; return ONLY this rule's warnings.
async function guardWarnings(code) {
  const { results } = await stylelint.lint({ code, config: stylelintConfig })
  return results[0].warnings.filter((w) => w.rule === RULE)
}

// Same, for a real file on disk (the tree check).
async function guardWarningsInFile(cssPath) {
  const code = fs.readFileSync(cssPath, 'utf8')
  return guardWarnings(code)
}

// ---- (a) the rule's ramp is the live :root parse --------------------------
//
// Independent parse: EVERY :root block (overrides are the house cascade
// mechanism — a later block re-defining a ramp token wins), --text-*
// custom properties only.
function parseTextRampIndependently(cssPath) {
  const css = fs.readFileSync(cssPath, 'utf8')
  const ramp = new Map()
  let at = css.indexOf(':root')
  while (at !== -1) {
    const open = css.indexOf('{', at)
    if (open === -1) break
    let depth = 1
    let end = open + 1
    while (depth > 0 && end < css.length) {
      if (css[end] === '{') depth += 1
      if (css[end] === '}') depth -= 1
      end += 1
    }
    const decl = /(--text-[\w-]+)\s*:\s*([^;}]+)/g
    let m = decl.exec(css.slice(open + 1, end - 1))
    while (m !== null) {
      ramp.set(m[1], m[2].trim())
      m = decl.exec(css.slice(open + 1, end - 1))
    }
    at = css.indexOf(':root', end)
  }
  return ramp
}

const STYLES = path.resolve(__dirname, '..', 'src', 'styles.css')

test('(a) the rule ramps over the live :root parse of src/styles.css', () => {
  const live = parseTextRampIndependently(STYLES)
  ok(live.size >= 6, `the independent parse found the type ramp (${live.size} --text-* tokens)`)
  for (const [name, value] of live) {
    ok(/^--text-[\w-]+$/.test(name), `ramp key shape: ${name}`)
    ok(/^\d+(\.\d+)?px$/.test(value), `ramp value shape: ${name} = ${value} (a px size)`)
  }
  const exported = exportedRamp
  ok(exported instanceof Map, 'stylelint.config.mjs exports its parsed ramp as textRamp (a Map)')
  eq([...exported.entries()].sort().join('|'), [...live.entries()].sort().join('|'),
    'the rule\'s ramp IS the live :root parse (no stale or hand-edited copy)')
})

// ---- (b) the pattern errors ------------------------------------------------

test('(b) the A10 fixture errors — var(--text-2xs, 11px) is flagged with the real size', async () => {
  const warnings = await guardWarnings('a { font-size: var(--text-2xs, 11px); }\n')
  eq(warnings.length, 1, 'exactly one no-dead-fallback warning')
  eq(warnings[0].rule, RULE)
  ok(warnings[0].text.includes('--text-2xs'), 'the message names the token')
  ok(warnings[0].text.includes('7px'), 'the message states the token\'s REAL defined size (7px)')
  ok(warnings[0].line === 1, 'the warning points at the declaration')
})

test('(b) every ramp token is guarded', async () => {
  for (const [name] of exportedRamp) {
    const warnings = await guardWarnings(`a { font-size: var(${name}, 99px); }\n`)
    eq(warnings.length, 1, `var(${name}, 99px) errors`)
  }
})

test('(b) a token-valued fallback is still dead, and each occurrence reports', async () => {
  const nested = await guardWarnings('a { font-size: var(--text-lg, var(--text-md)); }\n')
  eq(nested.length, 1, 'var(--text-lg, var(--text-md)) errors (the fallback is dead regardless of its shape)')
  const both = await guardWarnings('a { grid-template-columns: var(--text-xs, 8px) var(--text-sm, 9px); }\n')
  eq(both.length, 2, 'two dead fallbacks in one declaration report separately')
})

// ---- (c) compliant declarations stay clean ---------------------------------

test('(c) compliant declarations produce no warnings', async () => {
  const cases = [
    ['a { font-size: var(--text-2xs); }\n', 'the bare token — the removal-first end state'],
    ['a { color: var(--text, #edf3ef); }\n', 'the --text COLOR token (not a ramp member)'],
    ['a { color: var(--muted, #8f9b94); }\n', 'a non-ramp custom-property fallback (colors are no-raw-colors\' scope)'],
    ['a { font-size: var(--text-3xl, 18px); }\n', 'an UNDEFINED ramp-shaped token — the fallback is LIVE there (a different defect, not this rule)'],
  ]
  for (const [code, label] of cases) {
    const warnings = await guardWarnings(code)
    eq(warnings.length, 0, `clean: ${label}`)
  }
})

// ---- (d) the suppression idiom ----------------------------------------------

test('(d) the documented suppression silences the rule', async () => {
  const code = '.proto-thing { font-size: var(--text-2xs, 11px); /* stylelint-disable-line component-vocab/no-dead-fallback -- exempt: prototype family (manifest §12) */ }\n'
  const warnings = await guardWarnings(code)
  eq(warnings.length, 0, 'the disable-line comment with a reason suppresses the warning')
})

// ---- (e) the repo tree is clean (removal-first held) ------------------------

test('(e) the four A10-class sheets carry zero dead fallbacks', async () => {
  const sheets = [
    'src/styles.css',
    'src/images/workbench.css',
    'src/datasets/datasets.css',
    'src/surfaces/surfaces.css',
  ]
  for (const rel of sheets) {
    const warnings = await guardWarningsInFile(path.resolve(__dirname, '..', rel))
    eq(warnings.length, 0, `${rel} has no dead --text-* fallback (removal-first policy)`)
  }
})
