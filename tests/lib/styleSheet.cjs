'use strict'
/** The shared styles.css reader for the component-vocabulary kit suites
 * (near-term dispatch A, 2026-10-05; the tests/lib/ports.cjs precedent —
 * plain require-able JS, no deps).
 *
 * Ten suites (statusToken + the nine *-classes kits) each carried a private
 * copy of this machinery; the copies had drifted three ways (comment-
 * stripping inside the walker vs at the call site vs not at all, @-rule
 * skipping vs keeping) while asserting the same contract. ONE walker now
 * owns the shape, the strictest common denominator:
 *
 *   - the LIVE-SHEET parse — src/styles.css is read at run time; membership
 *     proves definition (a map entry or recipe naming an undefined variable
 *     reds the suite), never a hand-maintained constant;
 *   - comments are PROSE, never rules — stripped before any rule-shape scan
 *     (a comment saying "retired into the .progressbar recipes" is not a
 *     selector, and a brace inside a comment would corrupt the brace walk);
 *   - recipes live at TOP LEVEL — @media/@keyframes preludes are skipped
 *     whole (their inner rules are consumed as prelude body, so a class
 *     filter never matched them anyway; a recipe that moves inside a media
 *     query escapes the ORPHAN direction, never the emittable direction).
 *
 * The suites' assertion bodies are unchanged consumers of these three
 * functions; only the mechanism moved. VM-harness discipline does not apply
 * (plain Node, no ts-vm), but the regex-exec-loop style is kept anyway —
 * it is the house pattern for every sheet walk. */

/** Every custom property NAME defined in the css's FIRST :root block.
 *  Aliased tokens (--color-status-ok: var(--accent)) count by NAME — that
 *  is what a consumer may reference. Throws if the parse looks degenerate
 *  (the sanity guard every copy carried). */
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

/** Comments are PROSE — drop them before any rule-shape scan. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Top-level rules as { selectorText, body }, comments stripped, @-rule
 *  preludes skipped whole (the chip/notice walk shape). */
function collectRules(css) {
  const rules = []
  let index = 0
  const stripped = stripComments(css)
  while (index < stripped.length) {
    const open = stripped.indexOf('{', index)
    if (open === -1) break
    let depth = 1
    let end = open + 1
    while (depth > 0 && end < stripped.length) {
      if (stripped[end] === '{') depth += 1
      if (stripped[end] === '}') depth -= 1
      end += 1
    }
    const selectorText = stripped.slice(index, open)
    if (!selectorText.trimStart().startsWith('@')) rules.push({ selectorText, body: stripped.slice(open + 1, end - 1) })
    index = end
  }
  return rules
}

module.exports = { parseRootCustomProperties, stripComments, collectRules }
