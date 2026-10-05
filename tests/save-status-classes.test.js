// save-status-classes (component vocabulary task 20, Flux k2q0n9s) —
// SaveStatus's OWN contract: the pure state→class/aria/copy math behind
// src/ui/SaveStatus.tsx (kept in the react-free src/ui/saveStatusClasses.ts
// so this node suite can load it through the VM harness), and the recipe's
// shape in src/styles.css:
//
//   (a) the CLOSED state matrix — idle/saving/saved/failed, unknown throws;
//       idle is SILENT in the math itself (no classes, no aria, no copy —
//       the component renders nothing, matching the retired inspector
//       instance's `saveState && …` gating).
//   (b) class composition — saveStatusClasses() composes
//       `save-status [save-status--failed] [surface…]` (the state modifier
//       exists only where it changes the recipe's tone: failed; saving and
//       saved share the muted base — the data-save-state hook carries the
//       machine state for tests); the surface geometry class lands last,
//       deduped (P06, the mergeTail doctrine).
//   (c) the announcement mapping — saving/saved are role=status + polite,
//       failed is role=alert + assertive (the noticeClasses doctrine: the
//       explicit aria-live can never disagree with the role's implicit
//       semantics; ONE live mechanism, nothing double-announces); idle
//       carries no aria at all (it renders nothing).
//   (d) the copy templates — saveStatusText(): `Saving {label}…`,
//       `{Label} saved.`, `{Label} not saved — {detail}` with the bare
//       fallbacks when no label; the failed arm embeds the SERVER REASON
//       verbatim (substring-exact, never swallowed) and falls back to
//       honest copy when no reason exists; saveRetryLabel() names the
//       retry affordance after what it retries.
//   (e) dev warns — saveStatusWarnFor(): onRetry/detail supplied while
//       state is not failed warn (the affordance renders only on failed;
//       the reason surfaces only there — anything else would be silently
//       swallowed); the honest pairs stay silent.
//   (f) recipe lockstep, both directions + P06 + tokens — every class the
//       math emits has a rule in src/styles.css and every `.save-status*`
//       rule there is one the API can name; the rules carry tone/type/flow
//       and inheritance resets ONLY (the notice-banner × precedent — no box
//       geometry on the recipe); every var() they reference is DEFINED in
//       src/styles.css's :root (P02 membership doctrine).
//   (g) migration pins — the four consumers: the inspector's retired ad-hoc
//       saveState markup (the manifest's retired-selector grep), the
//       workbench's retired session-save notices, the caption panel's
//       retired ds-status savedAt row, and the settings dock's new outcome
//       states with the dirty line retained; plus the busy idiom's no-new-
//       animation pin (LoaderCircle + the existing .spin).
//
// The rendered states, the live-region mutations, and the retry wiring are
// browser behavior: P04 puts them in e2e (canvas/images/datasets specs),
// not here.
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const { loadTs } = require('../scripts/lib/ts-vm.cjs')
const saveStatusModule = loadTs('src/ui/saveStatusClasses.ts')
const { SAVE_STATES, saveStatusClasses, saveStatusAria, saveStatusText, saveRetryLabel, saveStatusWarnFor } = saveStatusModule
const { parseRootCustomProperties, collectRules } = require('./lib/styleSheet.cjs')

const ok = (condition, label) => assert.ok(condition, label)

function eq(actual, expected, label) {
  assert.equal(actual, expected, label)
  console.log(`  ok - ${label}`)
}

function throws(fn, label) {
  assert.throws(fn, /closed matrix/, label)
  console.log(`  ok - ${label}`)
}

// ---- the live sheet parse (the statusToken doctrine: read the sheet at
// run time; membership proves definition — through the shared sheet reader,
// tests/lib/styleSheet.cjs, the near-term-A consolidation of the ten kit
// suites' private parser copies) ------------------------------------------

const STYLES = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'styles.css'), 'utf8')
const CANVAS_CSS = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'canvas', 'canvas.css'), 'utf8')
const SHEETS = ['src/styles.css', 'src/canvas/canvas.css', 'src/datasets/datasets.css', 'src/images/workbench.css']
  .map((file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'))

const ROOT_VARS = parseRootCustomProperties(STYLES)

const STATUS_RULES = collectRules(STYLES).filter((rule) =>
  rule.selectorText.split(',').some((selector) => selector.includes('.save-status')),
)

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')

/** Code-only view of a TSX source: drops `//` and `*` comment lines (the
 *  manifest §0 prose-strike normalization — comments are the record of what
 *  retired, the code is what must not carry it). */
function codeOnly(source) {
  return source.split('\n').filter((line) => !/^\s*(\*|\/\/)/.test(line)).join('\n')
}

// ---- (a) the closed matrix + idle silence -----------------------------------

test('(a) SAVE_STATES is the closed four-state matrix; idle is silent in the math itself', () => {
  eq(SAVE_STATES.join('|'), 'idle|saving|saved|failed', 'the matrix is exactly the plan\'s four states, in order')
  eq(saveStatusClasses({ state: 'idle' }), '', 'idle emits no classes (the component renders nothing)')
  eq(saveStatusAria('idle'), null, 'idle carries no aria')
  eq(saveStatusText({ state: 'idle' }), null, 'idle has no copy')
  eq(saveStatusWarnFor({ state: 'idle' }), null, 'idle with neither prop is the honest resting pair')
  throws(() => saveStatusClasses({ state: 'done' }), 'saveStatusClasses throws on an unknown state')
  throws(() => saveStatusAria('done'), 'saveStatusAria throws on an unknown state')
  throws(() => saveStatusText({ state: 'done' }), 'saveStatusText throws on an unknown state')
})

// ---- (b) class composition ---------------------------------------------------

test('(b) saveStatusClasses composes the recipe + the failed tone modifier + the surface tail', () => {
  eq(saveStatusClasses({ state: 'saving' }), 'save-status', 'saving is the muted base (the busy chrome)')
  eq(saveStatusClasses({ state: 'saved' }), 'save-status', 'saved is the muted base too — the T18 confirmation ruling (no accent-ok dialect)')
  eq(saveStatusClasses({ state: 'failed' }), 'save-status save-status--failed', 'failed adds the danger tone modifier')
  eq(saveStatusClasses({ state: 'saving', className: 'iw-save-line' }), 'save-status iw-save-line', 'the surface geometry class rides last (P06)')
  eq(saveStatusClasses({ state: 'failed', className: 'a b' }), 'save-status save-status--failed a b', 'multi-token surface classes compose after the recipe')
  eq(saveStatusClasses({ state: 'failed', className: 'save-status x' }), 'save-status save-status--failed x', 'tokens dedupe (a surface re-naming the base adds nothing)')
  eq(saveStatusClasses({ state: 'saved', className: ' grow ' }), 'save-status grow', 'whitespace-normalized')
})

// ---- (c) the announcement mapping ---------------------------------------------

test('(c) saving/saved announce politely; failed asserts; the pair can never disagree', () => {
  eq(saveStatusAria('saving').role, 'status', 'saving is a status (polite)')
  eq(saveStatusAria('saving')['aria-live'], 'polite', 'the explicit live matches the role\'s implicit semantics')
  eq(saveStatusAria('saved').role, 'status', 'saved is a status (polite)')
  eq(saveStatusAria('saved')['aria-live'], 'polite', 'saved is polite')
  eq(saveStatusAria('failed').role, 'alert', 'failed is an alert — a failed save announces (the A02 doctrine)')
  eq(saveStatusAria('failed')['aria-live'], 'assertive', 'failed is assertive')
})

// ---- (d) the copy templates ----------------------------------------------------

test('(d) saveStatusText: the label voice, the bare fallbacks, and the reason VERBATIM', () => {
  eq(saveStatusText({ state: 'saving', label: 'draft' }), 'Saving draft…', 'the label names what is saving (the inspector\'s established voice)')
  eq(saveStatusText({ state: 'saving' }), 'Saving…', 'the bare saving copy')
  eq(saveStatusText({ state: 'saved', label: 'draft' }), 'Draft saved.', 'the label is capitalized sentence-initially')
  eq(saveStatusText({ state: 'saved' }), 'Saved.', 'the bare saved copy')
  eq(saveStatusText({ state: 'failed', label: 'draft', detail: 'AUDIT save unavailable' }), 'Draft not saved — AUDIT save unavailable', 'the failed arm embeds the SERVER REASON verbatim (substring-exact)')
  eq(saveStatusText({ state: 'failed', detail: 'boom' }), 'Not saved — boom', 'the bare failed copy with a reason')
  eq(saveStatusText({ state: 'failed', label: 'session' }), 'Session not saved — the save failed', 'no detail → the honest fallback, never a fabricated reason')
  eq(saveStatusText({ state: 'failed' }), 'Not saved — the save failed', 'the bare fallback')
  ok(saveStatusText({ state: 'failed', label: 'caption', detail: 'x' }).includes('— x'), 'the detail rides after the em dash, never dropped')
})

test('(d2) saveRetryLabel names the retry after what it retries', () => {
  eq(saveRetryLabel('draft'), 'Retry saving the draft now', 'the label names the subject')
  eq(saveRetryLabel(), 'Retry the save now', 'the bare fallback')
})

// ---- (e) dev warns --------------------------------------------------------------

test('(e) saveStatusWarnFor flags props that cannot render on the given state; honest pairs stay silent', () => {
  eq(saveStatusWarnFor({ state: 'failed', detail: 'x', onRetry: () => {} }), null, 'failed with both props is the full contract')
  eq(saveStatusWarnFor({ state: 'failed' }), null, 'failed with neither (a save can fail with no reason; the workbench still wires retry on failed — this is the math-only resting pair)')
  eq(saveStatusWarnFor({ state: 'saving' }), null, 'saving with neither prop is honest')
  eq(saveStatusWarnFor({ state: 'saved', detail: undefined, onRetry: undefined }), null, 'explicit undefineds are absent')
  ok(String(saveStatusWarnFor({ state: 'saved', onRetry: () => {} })).includes('onRetry'), 'onRetry on saved warns — the affordance renders only on failed')
  ok(String(saveStatusWarnFor({ state: 'idle', detail: 'x' })).includes('detail'), 'detail on idle warns — the reason would be silently swallowed')
  ok(String(saveStatusWarnFor({ state: 'saving', detail: 'x', onRetry: () => {} })).includes('onRetry')
    && String(saveStatusWarnFor({ state: 'saving', detail: 'x', onRetry: () => {} })).includes('detail'), 'both misuses name themselves in one warning')
})

// ---- (f) recipe lockstep + P06 + tokens ------------------------------------------

test('(f) every emitted class has a rule; every .save-status* rule is nameable; tone/type/flow only; tokens defined', () => {
  const emitted = new Set(['save-status', 'save-status--failed', 'save-status-retry'])
  const sheetClasses = new Set(STATUS_RULES.flatMap((rule) =>
    rule.selectorText.split(',').flatMap((selector) => {
      const found = []
      const pattern = /\.([\w-]+)/g
      let match = pattern.exec(selector)
      while (match !== null) {
        if (match[1].startsWith('save-status')) found.push(match[1])
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
  ok(STATUS_RULES.length >= 3, 'the base, failed, and retry rules all exist')
  const allowed = new Set(['display', 'align-items', 'gap', 'margin', 'color', 'font-size', 'line-height', 'background', 'border', 'padding', 'text-decoration', 'cursor'])
  for (const rule of STATUS_RULES) {
    for (const declaration of rule.body.split(';')) {
      const colon = declaration.indexOf(':')
      if (colon === -1) continue
      const prop = declaration.slice(0, colon).trim().toLowerCase()
      ok(allowed.has(prop), `"${prop}" is recipe-owned in "${rule.selectorText.trim().slice(0, 40)}" (tone/type/flow + the button's inheritance resets — the notice-banner × precedent; box geometry stays in surfaces per P06)`)
    }
  }
  const failedRule = STATUS_RULES.find((rule) => rule.selectorText.includes('save-status--failed'))
  ok(failedRule, 'the failed tone rule exists')
  ok(failedRule.body.includes('var(--danger)'), 'the failed tone is the existing danger token (no new colors)')
  const baseRule = STATUS_RULES.find((rule) => /\.save-status(?![\w-])/.test(rule.selectorText.trim().split(',')[0]))
  ok(baseRule, 'the base rule exists')
  ok(baseRule.body.includes('var(--muted-2)'), 'saving/saved paint the muted tone — T18\'s landed confirmation ruling (the accent-ok dialect stays dead)')
  ok(baseRule.body.includes('var(--text-2xs)') && failedRule.body.includes('var(--text-md)'), 'saving/saved are dense chrome; failed is decision prose (the A02 >=11px floor)')
  const varRefs = new Set()
  for (const rule of STATUS_RULES) {
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

// ---- (g) migration pins (the four consumers + the busy idiom) ----------------------

test('(g) the inspector: the ad-hoc saveState markup retired, the SaveStatus tier in', () => {
  const panel = codeOnly(read('src/canvas/PropertiesPanel.tsx'))
  ok(!panel.includes("saveState === 'saving'"), 'the retired ad-hoc markup ternary is GONE (the manifest\'s retired-selector grep: 0)')
  ok(!panel.includes('data-canvas-save-state'), 'the canvas-prefixed hook is gone (the shared component owns data-save-state)')
  ok(panel.includes('<SaveStatus'), 'the panel renders the shared SaveStatus')
  ok(panel.includes('label="draft"'), 'the panel keeps its established voice through the label prop')
  ok(/onRetry=\{saveState === 'failed'/.test(panel), 'the retry is gated on the failed state (the row-ownership dev-warn contract)')
})

test('(g2) the workbench: the session-save notices retired into the tier, the retry present', () => {
  const workbench = codeOnly(read('src/images/WorkbenchApp.tsx'))
  ok(!workbench.includes('The session could not be saved'), 'both retired session-save notice strings are gone (the inline tier owns the failure — one announcer, no double-report)')
  ok(workbench.includes('<SaveStatus'), 'the workbench renders the shared SaveStatus for session writes')
  ok(/label="session"/.test(workbench), 'the session voice')
})

test('(g3) the caption panel: the ds-status savedAt row retired into the tier', () => {
  const caption = codeOnly(read('src/datasets/CaptionPanel.tsx'))
  ok(!caption.includes('ds-status'), 'the caption panel\'s ad-hoc ds-status saved line is gone (the class itself stays for the crop editor + the app strip)')
  ok(!caption.includes('savedAt'), 'the savedAt timestamp state died with the row (the machine owns the state)')
  ok(caption.includes('<SaveStatus'), 'the caption panel renders the shared SaveStatus')
  ok(/label="caption"/.test(caption), 'the caption voice')
})

test('(g4) the settings dock: outcome states through the tier, the dirty line retained', () => {
  const dock = codeOnly(read('src/canvas/SettingsDock.tsx'))
  ok(dock.includes('<SaveStatus'), 'the dock renders the shared SaveStatus for the save outcome states')
  ok(dock.includes('settings-dirty-state'), 'the dirty/clean standing line stays (the adjacent dirty-set vocabulary, its geometry retained)')
  ok(CANVAS_CSS.includes('.settings-dirty-state'), 'the retained geometry rule stays in canvas.css (the manifest\'s retained-geometry row)')
})

test('(g5) the busy idiom is the Button precedent verbatim — no new animation', () => {
  const component = codeOnly(read('src/ui/SaveStatus.tsx'))
  ok(component.includes('LoaderCircle'), 'the spinner is LoaderCircle (the button-busy census idiom)')
  ok(component.includes('className="spin"'), 'it rides the EXISTING .spin animation')
  for (const sheet of SHEETS) {
    ok(!/@keyframes\s+save/.test(sheet), 'no save-status keyframes anywhere (a new animation is exactly what the brief bans)')
  }
})
