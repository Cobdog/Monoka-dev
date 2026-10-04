import fs from 'node:fs'
import path from 'node:path'
import stylelint from 'stylelint'

/**
 * Studio lint stack — CSS half of `pnpm lint` (eslint owns JS/TS).
 *
 * Three layers, all signal-only:
 *  1. stylelint-config-standard — syntax correctness and genuine foot-guns.
 *  2. minimax/no-raw-colors (custom, below) — design-token discipline: color
 *     values in declarations must go through var(--token) (the wave-2b token
 *     system in src/styles.css :root). Raw literals are allowed ONLY in
 *     token definitions (custom properties) and on the documented allowlist
 *     (secondary.allow) — every entry there states why it is a one-off.
 *  3. component-vocab/no-dead-fallback (custom, below) — type-ramp
 *     discipline on the --text-* tokens.
 *
 * Rules from the standard config that only fight the codebase's established
 * patterns are disabled BELOW with a comment stating why (documented
 * suppression, not silent).
 */

// CSS named colors (basic extended set) — matched with word boundaries.
const NAMED_COLOR_SOURCE = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond',
  'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue',
  'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey',
  'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue',
  'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro',
  'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred',
  'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral',
  'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime',
  'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
  'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue',
  'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff',
  'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown',
  'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray',
  'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet',
  'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen',
]
const NAMED_COLOR = new RegExp(`\\b(?:${NAMED_COLOR_SOURCE.join('|')})\\b`, 'i')
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/
const COLOR_FUNCTION = /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(/i

// Wave-2b blessed one-off literals (exact property+value matches), generated
// from the first full-tree audit — see scripts/stylelint-raw-color-allowlist.json.
const allowlistPath = path.resolve(import.meta.dirname, 'scripts', 'stylelint-raw-color-allowlist.json')
// Normalized to postcss's view of a value (!important is parsed out of
// Declaration#value, so allowlist entries match with or without it).
const rawColorAllow = (JSON.parse(fs.readFileSync(allowlistPath, 'utf8')).allow)
  .map((entry) => ({ ...entry, value: entry.value.replace(/\s*!important$/, '') }))

const noRawColors = stylelint.createPlugin('minimax/no-raw-colors', (primary, secondary) => (root, result) => {
  if (!primary) return
  // Documented one-offs: the committed JSON inventory plus any { property,
  // value, reason } entries passed via the rule's secondary `allow` option.
  const allow = [...rawColorAllow, ...(Array.isArray(secondary?.allow) ? secondary.allow : [])]
  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--')) return // token definitions live in :root by design
    const value = decl.value
    if (value.includes('var(')) return // token-composed (incl. color-mix over tokens)
    if (value.trim() === 'transparent') return // no token needed for full transparency
    if (!HEX_COLOR.test(value) && !COLOR_FUNCTION.test(value) && !NAMED_COLOR.test(value)) return
    if (allow.some((entry) => entry.property === decl.prop && entry.value === value.trim())) return
    stylelint.utils.report({
      ruleName: 'minimax/no-raw-colors',
      result,
      node: decl,
      message: `Use a design token (var(--…)) for the color in "${decl.prop}"; raw literals need a documented allowlist entry in stylelint.config.mjs (got: "${value.trim().slice(0, 48)}").`,
    })
  })
})

// The type ramp (--text-* font-size tokens) parsed from src/styles.css at
// config load — every :root block, later definitions winning (the cascade is
// the house override mechanism). Same doctrine as the statusToken suite:
// the rule's knowledge is the LIVE sheet, never a hand-maintained constant.
function parseTextRamp() {
  const css = fs.readFileSync(path.resolve(import.meta.dirname, 'src', 'styles.css'), 'utf8')
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
    const declaration = /(--text-[\w-]+)\s*:\s*([^;}]+)/g
    let match = declaration.exec(css.slice(open + 1, end - 1))
    while (match !== null) {
      ramp.set(match[1], match[2].trim())
      match = declaration.exec(css.slice(open + 1, end - 1))
    }
    at = css.indexOf(':root', end)
  }
  if (ramp.size < 6) throw new Error(`text-ramp parse looks wrong — only ${ramp.size} --text-* tokens found in src/styles.css :root`)
  return ramp
}

export const textRamp = parseTextRamp()

// SCOPE AUTHORIZATION (component vocabulary task 5, Flux k2q0n9s; P12):
// spec principle 5 ("Tokens always") BANS the dead-fallback pattern —
// var(--text-<token>, <fallback>) where the token IS defined in the
// src/styles.css :root type ramp. A var() fallback is not a minimum:
// --text-2xs is 7px, so every `var(--text-2xs, 11px)` rendered at 7px
// while reading as an 11px floor (audit A10,
// docs/audit/codex-webui-audit-2026-10-02.md). This rule ENFORCES the ban.
//
// Policy (removal-first): an in-scope consumer's fallback is REMOVED —
// `var(--text-2xs, 11px)` becomes `var(--text-2xs)` (rendering-identical:
// the fallback never applied). Suppression is for EXEMPT surfaces only
// (prototypes / pose-rig authoring — the families in the migration
// manifest §12, whose exemption column is the authoritative list):
//   /* stylelint-disable-line component-vocab/no-dead-fallback -- <reason> */
const NO_DEAD_FALLBACK = 'component-vocab/no-dead-fallback'

// Every var() call in a declaration value whose first argument is a
// ramp-defined token AND that carries a fallback argument (the first
// top-level comma inside the call). Paren-depth aware, so fallbacks that
// are themselves var() chains are walked correctly.
function* deadFallbacks(value) {
  let from = 0
  for (;;) {
    const at = value.indexOf('var(', from)
    if (at === -1) return
    let depth = 1
    let i = at + 4
    let comma = -1
    while (i < value.length && depth > 0) {
      const ch = value[i]
      if (ch === '(') depth += 1
      else if (ch === ')') depth -= 1
      else if (ch === ',' && depth === 1 && comma === -1) comma = i
      i += 1
    }
    if (comma !== -1) {
      const name = value.slice(at + 4, comma).trim()
      if (textRamp.has(name)) yield name
    }
    from = at + 4 // keep scanning inside the fallback (nested var() chains)
  }
}

const noDeadFallback = stylelint.createPlugin(NO_DEAD_FALLBACK, (primary) => (root, result) => {
  if (!primary) return
  root.walkDecls((decl) => {
    for (const name of deadFallbacks(decl.value)) {
      stylelint.utils.report({
        ruleName: NO_DEAD_FALLBACK,
        result,
        node: decl,
        message: `Dead fallback: ${name} is defined (${textRamp.get(name)}) in src/styles.css :root, so the second var() argument never applies (audit A10's class) — remove the fallback, or suppress with a manifest §12 exemption reason.`,
      })
    }
  })
})

export default {
  plugins: [noRawColors, noDeadFallback],
  extends: ['stylelint-config-standard'],
  rules: {
    'minimax/no-raw-colors': true,
    'component-vocab/no-dead-fallback': true,

    // ---- Documented suppressions (rules that only fight house style) ----
    // The stylesheets are deliberately written as dense SINGLE-LINE rules
    // (multiple declarations per line) — the format predates this lint and is
    // uniform across src/styles.css and src/guided-studio.css. Enforcing
    // one-declaration-per-line formatting on ~2000 lines is pure churn.
    'declaration-block-single-line-max-declarations': null,
    'rule-empty-line-before': null,
    'at-rule-empty-line-before': null,
    'declaration-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'comment-empty-line-before': null,
    // The house color notation is legacy rgba()/hex with fractional alpha
    // (rgba(198,255,78,.34)); rewriting to rgb()/modern syntax/percentage
    // alphas would touch hundreds of values for zero rendering change.
    'color-function-notation': null,
    'color-function-alias-notation': null,
    'alpha-value-notation': null,
    // Media queries use the (min-width: Npx) prefix form throughout.
    'media-feature-range-notation': null,
    // Overrides are expressed as intentional later re-definitions of the same
    // selector (including a second :root token block) — cascade order is the
    // house mechanism; the rule reads every one of them as a defect.
    'no-duplicate-selectors': null,
    // Selector order follows DOM/feature grouping, not ascending specificity;
    // the rule's ordering mandate conflicts with that layout at scale.
    'no-descending-specificity': null,
    // overflow-x/overflow-y longhands (often with MIXED values) are the house
    // pattern for scroll containers — explicit axes over shorthand push.
    'declaration-block-no-redundant-longhand-properties': null,
  },
}
