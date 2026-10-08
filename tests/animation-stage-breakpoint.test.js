// The stage-breakpoint pair (wave 3 fix round, k2q0n9s, the review's M-4):
// the animation stage's wide/stacked breakpoint is ONE value with TWO homes —
// the CSS media query that performs the layout and AnimationApp's matchMedia
// that feeds the DOM-truth attribute the layout pins read. A CSS media query
// cannot read a var and JS cannot read the cascade, so the literal is
// duplicated by design — THIS suite is the drift detector the pair otherwise
// lacks: both files are read as text, every breakpoint-shaped literal in each
// is extracted, and the two sets must agree (and hold exactly one member
// each, so a second home cannot sneak in unpaired). Both pinned e2e viewports
// (1920/1280) sit far from the boundary, so nothing else catches a one-sided
// edit between them.

import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const css = readFileSync(path.resolve(__dirname, '../src/animation/animation.css'), 'utf8')
const app = readFileSync(path.resolve(__dirname, '../src/animation/AnimationApp.tsx'), 'utf8')

/** The media-query breakpoints of the sheet (the sheet's component
 *  min-widths like .anim-span's 140px are not breakpoints). */
const cssWidths = [...css.matchAll(/@media\s*\(min-width:\s*(\d+)px\)/g)].map((match) => match[1])

/** The matchMedia breakpoints of the shell — the component may query the
 *  same literal from more than one site (the initializer + the listener);
 *  every site must name the same value. */
const appWidths = [...app.matchAll(/matchMedia\('\(min-width:\s*(\d+)px\)'\)/g)].map((match) => match[1])

test('the stage breakpoint is one value with exactly two homes (the CSS media query and the matchMedia mirror)', () => {
  assert.equal(cssWidths.length, 1, `animation.css carries exactly one media-query breakpoint (found ${cssWidths.length}: ${cssWidths.join(', ')})`)
  assert.ok(appWidths.length >= 1, 'AnimationApp.tsx queries the breakpoint at least once')
})

test('the pair agrees — a one-sided edit to either home fails here', () => {
  assert.deepEqual([...new Set(appWidths)], cssWidths, 'every matchMedia literal must equal the media-query literal (change them together)')
})

test('the DOM-truth attribute rides the same literal the layout uses', () => {
  // The attribute's consumers (the layout e2e, the vision checkpoints) read
  // data-anim-stage-mode; the value derives from the matchMedia call, so the
  // call itself must carry the sheet's literal verbatim.
  assert.ok(
    app.includes(`matchMedia('(min-width: ${cssWidths[0]}px)')`),
    `AnimationApp's matchMedia must quote the sheet's ${cssWidths[0]}px literal verbatim`,
  )
})
