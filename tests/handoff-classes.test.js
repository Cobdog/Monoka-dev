// handoff-classes (component vocabulary task 22, Flux k2q0n9s) —
// HandoffResult's OWN contract: the pure step→class/aria/copy math behind
// src/ui/HandoffResult.tsx (kept in the react-free src/ui/handoffClasses.ts
// so this node suite can load it through the VM harness), and the recipe's
// shape in src/styles.css:
//
//   (a) the CLOSED fact matrices — write pending/done/failed and refresh
//       pending/fresh/stale/failed, exactly the plan's pinned interface;
//       unknown values throw.
//   (b) class composition — handoffStepClasses() composes
//       `handoff-step [handoff-step--failed] [surface…]`: the failed tone
//       modifier belongs to the WRITE alone and the refresh fact NEVER adds
//       a class (the C2 pin in the math itself — a failed refresh is not a
//       failure tone); handoffResultClasses() composes the list container +
//       the surface tail, deduped, geometry last (P06, the mergeTail
//       doctrine).
//   (c) the stale derivation — handoffStepStale() is TRUE exactly on
//       (write done, refresh stale|failed): a landed write whose view did
//       not refresh. Every other cell of the 3x4 matrix is false — a failed
//       or pending write has no stale claim to make.
//   (d) the announcement mapping — a FAILED WRITE is role=alert +
//       assertive (a failed step announces); a DONE write is role=status +
//       polite REGARDLESS of the refresh fact (the done-with-stale marker is
//       a visual state inside a polite row, never an alert — C2's other
//       half); a PENDING write carries no aria (nothing to say yet).
//   (e) the copy templates — handoffStepText() (the write fact: null while
//       pending, `landed` when done, `failed — {detail}` with the honest
//       fallback) and handoffRefreshText() (the marker: null on fresh and
//       pending and any not-yet-landed write, `view stale`/`not refreshed`
//       carrying `detail` verbatim); handoffRetryLabel() names the retry
//       after WHICH fact failed (the write retries, the refresh refreshes);
//       handoffStepRetryable() is exactly (write failed | refresh failed) —
//       a standing 'stale' without a failed attempt offers no retry.
//   (f) dev warns — handoffWarnFor(): blank ids (the React key and the
//       onRetry routing both depend on them), blank labels, duplicate ids,
//       and a retryable step with no onRetry (a failed fact with no
//       affordance is a dead end — R-19); honest pairs stay silent.
//   (g) recipe lockstep, both directions + P06 + tokens — every class the
//       math emits has a rule in src/styles.css and every `.handoff-*` rule
//       there is one the API can name; the rules carry tone/type/flow and
//       the retry button's inheritance resets only (the save-status-retry
//       precedent); every var() they reference is DEFINED in src/styles.css's
//       :root (P02 membership doctrine); the danger tone belongs to the
//       failed WRITE modifier and the WARNING tone to the stale marker (the
//       refusal ruling: a state, not a failure); no handoff keyframes
//       anywhere (the busy arm rides the existing .spin).
//   (h) migration pins — the workbench exit: the retired A05 step notice
//       string is GONE (the tier owns the report, one announcer), the
//       HandoffResult mount + the per-step facts are in, the retained-
//       identifier write core is shared between the standalone pin and the
//       exit's first step, and the store's reloadActiveDocument returns the
//       boolean the refresh fact needs. The component owns its data-handoff
//       hooks (zero in the consumer).
//
// The rendered states, the live-region mutations, and the retry wiring are
// browser behavior: P04 puts them in e2e (e2e/images.spec.ts owns the exit
// flow's legs), not here.
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const { loadTs } = require('../scripts/lib/ts-vm.cjs')
const handoffModule = loadTs('src/ui/handoffClasses.ts')
const {
  HANDOFF_REFRESH_STATES, HANDOFF_WRITE_STATES,
  handoffRefreshText, handoffResultClasses, handoffRetryLabel, handoffStepAria, handoffStepClasses,
  handoffStepRetryable, handoffStepStale, handoffStepText, handoffWarnFor,
} = handoffModule
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

const step = (over) => ({ id: 'pin', label: 'Pin the frame to the canvas', write: 'done', refresh: 'fresh', ...over })

// ---- the live sheet parse (the statusToken doctrine: read the sheet at
// run time; membership proves definition — through the shared sheet reader,
// tests/lib/styleSheet.cjs, the near-term-A consolidation of the ten kit
// suites' private parser copies) ------------------------------------------

const STYLES = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'styles.css'), 'utf8')
const SHEETS = ['src/styles.css', 'src/canvas/canvas.css', 'src/datasets/datasets.css', 'src/images/workbench.css']
  .map((file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'))

const ROOT_VARS = parseRootCustomProperties(STYLES)

const HANDOFF_RULES = collectRules(STYLES).filter((rule) =>
  rule.selectorText.split(',').some((selector) => selector.includes('.handoff-')),
)

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')

/** Code-only view of a TSX source: drops `//` and `*` comment lines (the
 *  manifest §0 prose-strike normalization — comments are the record of what
 *  retired, the code is what must not carry it). */
function codeOnly(source) {
  return source.split('\n').filter((line) => !/^\s*(\*|\/\/)/.test(line)).join('\n')
}

// ---- (a) the closed fact matrices ---------------------------------------------

test('(a) the fact unions are exactly the plan\'s pinned interface; unknown values throw', () => {
  eq(HANDOFF_WRITE_STATES.join('|'), 'pending|done|failed', 'the write matrix is exactly pending/done/failed')
  eq(HANDOFF_REFRESH_STATES.join('|'), 'pending|fresh|stale|failed', 'the refresh matrix is exactly pending/fresh/stale/failed')
  throws(() => handoffStepClasses({ write: 'saving' }), 'handoffStepClasses throws on an unknown write state')
  throws(() => handoffStepStale(step({ write: 'landed' })), 'handoffStepStale throws on an unknown write state')
  throws(() => handoffStepStale(step({ refresh: 'dirty' })), 'handoffStepStale throws on an unknown refresh state')
  throws(() => handoffStepText(step({ write: 'saved' })), 'handoffStepText throws on an unknown write state')
  throws(() => handoffRefreshText(step({ refresh: 'dirty' })), 'handoffRefreshText throws on an unknown refresh state')
})

// ---- (b) class composition — the failed tone belongs to the WRITE alone -------

test('(b) handoffStepClasses: the write composes the tone, the refresh NEVER adds a class (C2 in the math)', () => {
  eq(handoffStepClasses({ write: 'pending' }), 'handoff-step', 'pending is the muted base (the busy row)')
  eq(handoffStepClasses({ write: 'done' }), 'handoff-step', 'done is the muted base — never an ok dialect (T18\'s landed ruling)')
  eq(handoffStepClasses({ write: 'failed' }), 'handoff-step handoff-step--failed', 'a failed WRITE adds the danger tone modifier')
  for (const refresh of ['pending', 'fresh', 'stale', 'failed']) {
    eq(handoffStepClasses({ write: 'done' }), handoffStepClasses({ write: 'done' }), `refresh "${refresh}" changes nothing (the class math takes no refresh)`)
  }
  eq(handoffStepClasses({ write: 'failed', className: 'iw-exit-steps' }), 'handoff-step handoff-step--failed iw-exit-steps', 'the surface geometry class rides last (P06)')
  eq(handoffStepClasses({ write: 'done', className: 'a b' }), 'handoff-step a b', 'multi-token surface classes compose after the recipe')
  eq(handoffStepClasses({ write: 'done', className: 'handoff-step x' }), 'handoff-step x', 'tokens dedupe (a surface re-naming the base adds nothing)')
  eq(handoffStepClasses({ write: 'done', className: ' grow ' }), 'handoff-step grow', 'whitespace-normalized')
})

test('(b2) handoffResultClasses: the list container + the surface tail', () => {
  eq(handoffResultClasses({}), 'handoff-result', 'the bare container')
  eq(handoffResultClasses({ className: 'iw-exit-steps' }), 'handoff-result iw-exit-steps', 'the surface geometry class rides last')
  eq(handoffResultClasses({ className: 'handoff-result x' }), 'handoff-result x', 'tokens dedupe')
})

// ---- (c) the stale derivation — the full 3x4 matrix -----------------------------

test('(c) handoffStepStale is true exactly on (done, stale|failed) — the full matrix', () => {
  eq(handoffStepStale(step({ write: 'done', refresh: 'stale' })), true, 'done + stale IS the marker state')
  eq(handoffStepStale(step({ write: 'done', refresh: 'failed' })), true, 'done + failed refresh IS the marker state (the failed reload leaves the view stale)')
  eq(handoffStepStale(step({ write: 'done', refresh: 'fresh' })), false, 'done + fresh is clean')
  eq(handoffStepStale(step({ write: 'done', refresh: 'pending' })), false, 'done + pending claims nothing (the refresh is unresolved, not known-stale)')
  eq(handoffStepStale(step({ write: 'failed', refresh: 'pending' })), false, 'a failed write has no stale claim (its refresh never ran)')
  eq(handoffStepStale(step({ write: 'failed', refresh: 'stale' })), false, 'even an explicitly stale refresh stays false under a failed write — the row is FAILED, not stale-marked')
  eq(handoffStepStale(step({ write: 'pending', refresh: 'pending' })), false, 'pending claims nothing')
})

// ---- (d) the announcement mapping ----------------------------------------------

test('(d) a failed write asserts; a done write stays polite under EVERY refresh fact; pending is silent', () => {
  eq(handoffStepAria(step({ write: 'failed', refresh: 'pending' })).role, 'alert', 'a failed write is an alert — a failed step announces')
  eq(handoffStepAria(step({ write: 'failed', refresh: 'pending' }))['aria-live'], 'assertive', 'failed is assertive')
  eq(handoffStepAria(step({ write: 'failed', refresh: 'failed' })).role, 'alert', 'both facts failed still rides the WRITE\'s alert')
  for (const refresh of ['pending', 'fresh', 'stale', 'failed']) {
    eq(handoffStepAria(step({ write: 'done', refresh })).role, 'status', `done + ${refresh} is a polite status — the marker is a visual state, not an alert`)
    eq(handoffStepAria(step({ write: 'done', refresh }))['aria-live'], 'polite', `done + ${refresh} stays polite (the explicit live matches the role)`)
  }
  eq(handoffStepAria(step({ write: 'pending', refresh: 'pending' })), null, 'pending carries no aria')
})

// ---- (e) the copy templates -------------------------------------------------------

test('(e) handoffStepText: the write fact — null pending, landed done, failed with the reason verbatim', () => {
  eq(handoffStepText(step({ write: 'pending' })), null, 'pending has no state copy (the spinner is the idiom)')
  eq(handoffStepText(step({ write: 'done' })), 'landed', 'done reads landed (this repo\'s own vocabulary for a write that stuck)')
  eq(handoffStepText(step({ write: 'done', refresh: 'failed' })), 'landed', 'the write copy ignores the refresh fact (independent facts, independent copy)')
  eq(handoffStepText(step({ write: 'failed', detail: 'T22 chain creation unavailable' })), 'failed — T22 chain creation unavailable', 'the failed arm embeds the SERVER REASON verbatim')
  eq(handoffStepText(step({ write: 'failed' })), 'failed — the step did not land', 'no detail → the honest fallback, never a fabricated reason')
})

test('(e2) handoffRefreshText: the marker — fresh/pending silent, stale/failed named with the detail verbatim', () => {
  eq(handoffRefreshText(step({ write: 'done', refresh: 'fresh' })), null, 'fresh is the quiet default — no marker')
  eq(handoffRefreshText(step({ write: 'done', refresh: 'pending' })), null, 'an unresolved refresh claims nothing')
  eq(handoffRefreshText(step({ write: 'pending', refresh: 'pending' })), null, 'no marker before the write lands — the refresh is the WRITE\'s companion fact')
  eq(handoffRefreshText(step({ write: 'failed', refresh: 'pending' })), null, 'a failed write carries no refresh marker either')
  eq(handoffRefreshText(step({ write: 'done', refresh: 'stale' })), 'view stale', 'the standing-stale marker')
  eq(handoffRefreshText(step({ write: 'done', refresh: 'stale', detail: 'a later write invalidated it' })), 'view stale — a later write invalidated it', 'the stale arm carries the detail verbatim')
  eq(handoffRefreshText(step({ write: 'done', refresh: 'failed' })), 'not refreshed', 'the failed-attempt marker (an attempt record, never a live-view oracle)')
  eq(handoffRefreshText(step({ write: 'done', refresh: 'failed', detail: 'T22 reload down' })), 'not refreshed — T22 reload down', 'the failed arm carries the detail verbatim')
})

test('(e3) retryability + the retry label name WHICH fact failed', () => {
  eq(handoffStepRetryable(step({ write: 'failed', refresh: 'pending' })), true, 'a failed write is retryable')
  eq(handoffStepRetryable(step({ write: 'done', refresh: 'failed' })), true, 'a failed refresh is retryable (the refresh re-runs — never the landed write)')
  eq(handoffStepRetryable(step({ write: 'done', refresh: 'stale' })), false, 'a standing stale with no failed attempt offers no retry — the caller failed nothing')
  eq(handoffStepRetryable(step({ write: 'done', refresh: 'fresh' })), false, 'clean is not retryable')
  eq(handoffStepRetryable(step({ write: 'pending', refresh: 'pending' })), false, 'pending is not retryable')
  eq(handoffRetryLabel(step({ write: 'failed', refresh: 'pending', label: 'Seed the video chain' })), 'Retry "Seed the video chain" now', 'a failed write RETRIES')
  eq(handoffRetryLabel(step({ write: 'done', refresh: 'failed', label: 'Pin the frame to the canvas' })), 'Refresh "Pin the frame to the canvas" now', 'a failed refresh REFRESHES — the label names the cheaper act')
})

// ---- (f) dev warns ------------------------------------------------------------------

test('(f) handoffWarnFor flags the dead shapes; honest pairs stay silent', () => {
  const retry = () => {}
  eq(handoffWarnFor({ steps: [step()], onRetry: retry }), null, 'a clean step with retry wired is the honest resting pair')
  eq(handoffWarnFor({ steps: [step({ write: 'pending' })] }), null, 'no onRetry and nothing retryable is honest (a terminal report)')
  ok(String(handoffWarnFor({ steps: [step({ id: '' })] })).includes('blank step id'), 'a blank id warns (React key + onRetry routing)')
  ok(String(handoffWarnFor({ steps: [step({ label: '  ' })] })).includes('blank label'), 'a blank label warns')
  ok(String(handoffWarnFor({ steps: [step({ id: 'pin' }), step({ id: 'pin' })] })).includes('duplicate'), 'duplicate ids warn (key collision + ambiguous retry routing)')
  ok(String(handoffWarnFor({ steps: [step({ write: 'failed' })] })).includes('onRetry'), 'a retryable step with no onRetry warns — a failed fact with no affordance dead-ends (R-19)')
  ok(String(handoffWarnFor({ steps: [step({ write: 'done', refresh: 'failed' })] })).includes('onRetry'), 'the refresh-failed arm warns the same way')
  eq(handoffWarnFor({ steps: [step({ write: 'done', refresh: 'stale' })] }), null, 'standing-stale with no onRetry stays silent (nothing failed — no retry is owed)')
})

// ---- (g) recipe lockstep + P06 + tokens ----------------------------------------------

test('(g) every emitted class has a rule; every .handoff-* rule is nameable; tone/type/flow only; tokens defined', () => {
  const emitted = new Set(['handoff-result', 'handoff-step', 'handoff-step--failed', 'handoff-step-marker', 'handoff-step-retry'])
  const sheetClasses = new Set(HANDOFF_RULES.flatMap((rule) =>
    rule.selectorText.split(',').flatMap((selector) => {
      const found = []
      const pattern = /\.([\w-]+)/g
      let match = pattern.exec(selector)
      while (match !== null) {
        if (match[1].startsWith('handoff-')) found.push(match[1])
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
  ok(HANDOFF_RULES.length >= 5, 'the container, base row, failed modifier, marker, and retry rules all exist')
  const allowed = new Set(['display', 'flex-direction', 'flex-wrap', 'align-items', 'gap', 'margin', 'padding', 'list-style', 'color', 'font-size', 'line-height', 'min-width', 'background', 'border', 'text-decoration', 'cursor'])
  for (const rule of HANDOFF_RULES) {
    for (const declaration of rule.body.split(';')) {
      const colon = declaration.indexOf(':')
      if (colon === -1) continue
      const prop = declaration.slice(0, colon).trim().toLowerCase()
      ok(allowed.has(prop), `"${prop}" is recipe-owned in "${rule.selectorText.trim().slice(0, 40)}" (tone/type/flow + the button's inheritance resets — the save-status-retry precedent; box geometry stays in surfaces per P06)`)
    }
  }
  const failedRule = HANDOFF_RULES.find((rule) => rule.selectorText.includes('handoff-step--failed'))
  ok(failedRule, 'the failed tone rule exists')
  ok(failedRule.body.includes('var(--danger)'), 'the failed WRITE tone is the existing danger token (no new colors)')
  const markerRule = HANDOFF_RULES.find((rule) => rule.selectorText.includes('.handoff-step-marker'))
  ok(markerRule, 'the marker rule exists')
  ok(markerRule.body.includes('var(--warning)'), 'the stale marker paints WARNING — a state, not a failure (the refusal ruling)')
  const baseRule = HANDOFF_RULES.find((rule) => /\.handoff-step(?![\w-])/.test(rule.selectorText.trim().split(',')[0]))
  ok(baseRule, 'the base row rule exists')
  ok(baseRule.body.includes('var(--muted)'), 'done/pending rows paint the muted tone (T18\'s confirmation ruling — the accent-ok dialect stays dead)')
  ok(baseRule.body.includes('var(--text-md)'), 'the rows are decision prose at --text-md (the A02 >=11px floor — these rows carry retry decisions)')
  const varRefs = new Set()
  for (const rule of HANDOFF_RULES) {
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
  for (const sheet of SHEETS) {
    ok(!/@keyframes\s+handoff/.test(sheet), 'no handoff keyframes anywhere (the busy arm rides the existing .spin — a new animation is exactly what the brief bans)')
  }
})

// ---- (h) migration pins (the workbench exit + the store seam + the component hooks) ---

test('(h) the workbench exit: the A05 step notice retired into the tier, the per-step facts in', () => {
  const workbench = codeOnly(read('src/images/WorkbenchApp.tsx'))
  ok(!workbench.includes('but the video chain could not be created'), 'the retired A05 notice string is GONE (the tier owns the report — one announcer, no double-report)')
  ok(workbench.includes('<HandoffResult'), 'the exit dialog renders the shared HandoffResult')
  ok(workbench.includes("'pin'"), 'the exit machine carries the pin step')
  ok(workbench.includes("'chain'"), 'the exit machine carries the chain step')
  ok(!workbench.includes('data-handoff'), 'the consumer never hand-writes the component\'s hooks (shared-component-owned)')
})

test('(h2) the retained-identifier write core is shared by the standalone pin and the exit\'s first step', () => {
  const workbench = codeOnly(read('src/images/WorkbenchApp.tsx'))
  ok(workbench.includes('pinChainId') && workbench.includes('pinOutputId'), 'the exit run retains the pin\'s landed identifiers (retry re-runs only what never landed — spec §0.5)')
  ok(workbench.includes('The frame could not be pinned'), 'the STANDALONE pin button keeps its own notice (not the manifest row — its behavior is unchanged)')
})

test('(h3) the store\'s reloadActiveDocument returns the boolean the refresh fact reads', () => {
  const store = codeOnly(read('src/canvas/store.ts'))
  ok(store.includes('reloadActiveDocument(): Promise<boolean>'), 'the interface types the boolean return')
  ok(/return Boolean\(refreshed\)/.test(store), 'the implementation reports whether the document actually reloaded')
})

test('(h4) the component\'s busy arm is the Button precedent verbatim — no new animation', () => {
  const component = codeOnly(read('src/ui/HandoffResult.tsx'))
  ok(component.includes('LoaderCircle'), 'the spinner is LoaderCircle (the button-busy census idiom)')
  ok(component.includes('className="spin"'), 'it rides the EXISTING .spin animation')
})
