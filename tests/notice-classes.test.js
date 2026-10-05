// notice-classes (component vocabulary task 9, Flux k2q0n9s) — the
// ToastHost + NoticeBanner family's OWN contract: the pure placement/tone
// class math, the per-item announcement mapping, and the P07 adapter's
// store-wiring mapping behind src/ui/ToastHost.tsx, src/ui/NoticeBanner.tsx,
// and src/canvas/toastAdapter.ts (kept in the react-free src/ui/noticeClasses.ts
// so this node suite can load it through the VM harness), plus the recipe
// blocks' shape in src/styles.css and the migration pins:
//
//   (a) toast placement — a CLOSED two-value matrix (bottom-left = the canvas
//       strip's historical geometry, bottom-right = the workbench's); unknown
//       placements throw; the surface's container geometry class merges LAST
//       (the canvas's retained `.canvas-toasts` rule composes after the
//       recipes so its later-loading sheet keeps winning the cascade).
//   (b) toast item classes — the retained item vocabulary, pinned BYTE-
//       IDENTICAL to the retired strip expression `canvas-toast ${tone}`
//       (CanvasToasts.tsx:14 / WorkbenchApp.tsx:1284): for every tone the
//       store can emit, the host renders the exact classes the e2e fleet
//       already asserts (`[data-canvas-toast]`, `.canvas-toast.error`).
//   (c) announcements — the tone→role mapping: error is role=alert +
//       aria-live=assertive (the store's own severity comment: a failure the
//       user must ACT on), success/neutral are role=status + polite. ONE
//       live mechanism per item (the old container aria-live="polite" died
//       with the strip — the roles subsume it; nothing double-announces).
//   (d) notice tone/role — CLOSED matrices; role derives its aria-live
//       (status→polite, alert→assertive) so the explicit attribute can never
//       disagree with the role's implicit semantics.
//   (e) the adapter's store-wiring mapping — a PASS-THROUGH: same entries,
//       same order, dismissal forwarded by id, and NOTHING else. The props
//       carry no timing/dedupe keys because the adapter READS the store, it
//       never rewrites it (the timeouts — error 15 s / other 4.2 s — live in
//       canvas/store.ts's toast() and stay there).
//   (f) recipe lockstep, both directions — every class the math can emit has
//       a rule (toast-host*/notice-banner* in styles.css; the canvas-toast
//       item vocabulary in canvas.css), and every `toast-host--*` /
//       `notice-banner--*` rule in the sheet is one the API can name.
//   (g) P06 property whitelists — the toast recipes carry PLACEMENT +
//        container mechanics + z ONLY (no padding/font/color); the notice
//        tone recipes carry color/background/border-color ONLY. The
//        `.notice-banner` BASE owns the intrinsic notice geometry (flex /
//        gap 10 / 6px 14px / --text-md) — the progressbar size-step judgment
//        call (task 8): all three migrated consumers shared that geometry
//        byte-identically, so it IS the vocabulary's shape, not a surface
//        divergence; surfaces keep their true divergences (border EDGE,
//        pre-wrap) locally and override at equal specificity later-sheet.
//   (h) tokens-only — every var() the recipes reference is :root-defined.
//   (i) the C1 border-shorthand hazard net, notice leg — the notice tone
//        recipes declare border-color, so any NoticeBanner-composed surface
//        class styled by a `border:` (or per-edge) shorthand would reset it;
//        the migrated surfaces use longhands (width/style only).
//   (j) migration pins — the hand-rolled strips/banners are GONE (the
//        workbench inline copy, `.iw-notice`/`.iw-toasts` rules, the
//        datasets banners' tone rules) and the retained geometry is still
//        there (`.canvas-toasts` container rule minus its placement
//        properties — the placement prop owns them now; `.canvas-toast`
//        item rules); the manifest §8 dead-CSS families are deleted.
//
// Browser behavior (computed placement, roles in the live DOM, the store's
// real timeouts, the × handler) is e2e's business (P04): canvas/images/
// datasets spec own it.
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const { loadTs } = require('../scripts/lib/ts-vm.cjs')
const noticeModule = loadTs('src/ui/noticeClasses.ts')
const {
  toastClasses, toastItemClasses, toastAriaFor, noticeClasses, noticeAria, toastAdapterProps,
  TOAST_PLACEMENTS, NOTICE_TONES, NOTICE_ROLES,
} = noticeModule
const { parseRootCustomProperties, stripComments, collectRules } = require('./lib/styleSheet.cjs')

const ok = (condition, label) => assert.ok(condition, label)

function eq(actual, expected, label) {
  assert.equal(actual, expected, label)
  console.log(`  ok - ${label}`)
}

// ---- the live sheet parse (the statusToken doctrine — through the shared
// sheet reader, tests/lib/styleSheet.cjs, the near-term-A consolidation of
// the ten kit suites' private parser copies) --------------------------------

const STYLES = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'styles.css'), 'utf8')
const CANVAS_CSS = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'canvas', 'canvas.css'), 'utf8')
const WORKBENCH_CSS = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'images', 'workbench.css'), 'utf8')
const DATASETS_CSS = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'datasets', 'datasets.css'), 'utf8')

const ROOT_VARS = parseRootCustomProperties(STYLES)

/** Every top-level rule whose selector list mentions a `.family` class,
 *  mapped className → the union of its declarations across all such rules,
 *  plus an exact-selector map (the base whitelist must read the BARE
 *  `.family` rule, not the union — descendant rules like `.family > button`
 *  mention the class but are their own contract). */
function collectFamilyRules(css, family) {
  const rules = new Map()
  const bySelector = new Map()
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
  // The shared walker: comments stripped, @media/@keyframes preludes skipped
  // whole (recipes live at top level only — a recipe that moves inside a
  // media query escapes the ORPHAN direction, never the emittable one).
  for (const { selectorText, body } of collectRules(css)) {
    bySelector.set(selectorText.trim(), body)
    for (const selector of selectorText.split(',')) {
      const classPattern = new RegExp(`\\.${family}(--[\\w-]+)?(?![\\w-])`, 'g')
      let classMatch = classPattern.exec(selector)
      while (classMatch !== null) {
        note(classMatch[0].slice(1), body)
        classMatch = classPattern.exec(selector)
      }
    }
  }
  rules.bySelector = bySelector
  return rules
}

const STYLES_NOCOMMENTS = stripComments(STYLES)
const CANVAS_NOCOMMENTS = stripComments(CANVAS_CSS)
const WORKBENCH_NOCOMMENTS = stripComments(WORKBENCH_CSS)

const TOAST_RULES = collectFamilyRules(STYLES_NOCOMMENTS, 'toast-host')
const NOTICE_RULES = collectFamilyRules(STYLES_NOCOMMENTS, 'notice-banner')
const CANVAS_TOAST_ITEM_RULES = collectFamilyRules(CANVAS_NOCOMMENTS, 'canvas-toast')

// ---- (a) toast placement ------------------------------------------------------

test('(a) placement is a closed matrix; the surface container class merges last, deduped', () => {
  eq(TOAST_PLACEMENTS.join('|'), 'bottom-left|bottom-right', 'the placement vocabulary is the closed two-value set')
  eq(toastClasses({}), 'toast-host toast-host--bottom-left', 'no placement → bottom-left (the canvas strip default)')
  eq(toastClasses({ placement: 'bottom-left' }), 'toast-host toast-host--bottom-left', 'bottom-left names itself')
  eq(toastClasses({ placement: 'bottom-right' }), 'toast-host toast-host--bottom-right', 'bottom-right names itself (the workbench mount)')
  eq(
    toastClasses({ placement: 'bottom-left', className: 'canvas-toasts' }),
    'toast-host toast-host--bottom-left canvas-toasts',
    'the adapter composes the canvas container geometry class after the recipes',
  )
  eq(
    toastClasses({ placement: 'bottom-right', className: 'canvas-toasts' }),
    'toast-host toast-host--bottom-right canvas-toasts',
    'the workbench mount composes the same tokens (the class is inert on routes without canvas.css — as before)',
  )
  assert.throws(() => toastClasses({ placement: 'top-right' }), /placement/i, 'an unknown placement throws (no silent defaulting)')
  assert.throws(() => toastClasses({ placement: 'BOTTOM-LEFT' }), /placement/i, 'placement names are case-sensitive')
  eq(
    toastClasses({ placement: 'bottom-left', className: 'canvas-toasts canvas-toasts' }),
    'toast-host toast-host--bottom-left canvas-toasts',
    'duplicate surface tokens dedupe',
  )
})

// ---- (b) the retained item vocabulary ------------------------------------------

test('(b) toast item classes are the retired strip expression, byte-identical', () => {
  // The retired expression (CanvasToasts.tsx:14, WorkbenchApp.tsx:1284):
  //   className={`canvas-toast ${toast.tone}`}
  for (const tone of ['error', 'success', 'neutral']) {
    eq(toastItemClasses(tone), `canvas-toast ${tone}`, `tone ${tone} renders the retired item classes verbatim`)
  }
  assert.throws(() => toastItemClasses('warning'), /toast tone/i, 'an unknown tone throws (closed matrix)')
})

// ---- (c) announcements ---------------------------------------------------------

test('(c) error toasts are alerts (assertive); others are statuses (polite)', () => {
  eq(JSON.stringify(toastAriaFor('error')), JSON.stringify({ role: 'alert', 'aria-live': 'assertive' }), 'error → role=alert, assertive (a failure the user must act on)')
  eq(JSON.stringify(toastAriaFor('success')), JSON.stringify({ role: 'status', 'aria-live': 'polite' }), 'success → role=status, polite')
  eq(JSON.stringify(toastAriaFor('neutral')), JSON.stringify({ role: 'status', 'aria-live': 'polite' }), 'neutral → role=status, polite')
  assert.throws(() => toastAriaFor('fatal'), /toast tone/i, 'an unknown tone throws')
})

// ---- (d) notice tone + role ------------------------------------------------------

test('(d) notice tones and roles are closed matrices; role derives its aria-live', () => {
  eq(NOTICE_TONES.join('|'), 'accent|danger', 'the notice tone vocabulary is the closed set (the two migrated banners)')
  eq(NOTICE_ROLES.join('|'), 'status|alert', 'the notice role vocabulary is the closed set')
  eq(noticeClasses({ tone: 'accent' }), 'notice-banner notice-banner--accent', 'accent tone (the iw note + ds notice)')
  eq(noticeClasses({ tone: 'danger' }), 'notice-banner notice-banner--danger', 'danger tone (the ds error banner)')
  eq(
    noticeClasses({ tone: 'danger', className: 'ds-error-banner' }),
    'notice-banner notice-banner--danger ds-error-banner',
    'the surface geometry class composes after the recipes',
  )
  assert.throws(() => noticeClasses({ tone: 'info' }), /notice tone/i, 'an unknown tone throws')
  eq(JSON.stringify(noticeAria('status')), JSON.stringify({ role: 'status', 'aria-live': 'polite' }), 'status → polite (never disagrees with the role)')
  eq(JSON.stringify(noticeAria('alert')), JSON.stringify({ role: 'alert', 'aria-live': 'assertive' }), 'alert → assertive')
  assert.throws(() => noticeAria('log'), /notice role/i, 'an unknown role throws')
})

// ---- (e) the adapter's store-wiring mapping --------------------------------------

test('(e) toastAdapterProps is a pass-through: same entries, same order, forwarded dismissal, nothing else', () => {
  const dismiss = (id) => `dismissed:${id}`
  const storeToasts = [
    { id: 7, tone: 'error', text: 'Could not save the canvas session' },
    { id: 8, tone: 'success', text: 'The render landed' },
  ]
  const props = toastAdapterProps(storeToasts, dismiss)
  ok(props.onDismiss === dismiss, 'the store\'s dismissToast is forwarded UNTOUCHED (the adapter never wraps a re-timed dismissal)')
  eq(props.toasts.length, 2, 'entry count preserved (no slicing — the store\'s toast() owns the -3 window)')
  eq(props.toasts[0].id, 7, 'order preserved')
  eq(props.toasts[1].id, 8, 'order preserved (bis)')
  eq(props.toasts[0].text, 'Could not save the canvas session', 'text preserved')
  eq(props.toasts[1].tone, 'success', 'tone preserved')
  ok(props.toasts !== storeToasts, 'a COPY, not the store\'s live array (the host can never mutate store state)')
  props.toasts.push({ id: 99, tone: 'neutral', text: 'smuggled' })
  eq(storeToasts.length, 2, 'mutating the props array does not touch the store slice')
  eq(Object.keys(props).sort().join('|'), 'onDismiss|toasts', 'the props carry NO timing/dedupe keys — timeouts (error 15 s / other 4.2 s) stay in the store')
  const empty = toastAdapterProps([], dismiss)
  eq(empty.toasts.length, 0, 'an empty store slice maps to an empty host (no banner fabrication)')
})

// ---- (f) recipe lockstep, both directions ----------------------------------------

test('(f) every emittable class has a rule, and every recipe rule is nameable', () => {
  // Emittable → sheet.
  for (const placement of TOAST_PLACEMENTS) {
    for (const token of toastClasses({ placement }).split(' ')) {
      ok(TOAST_RULES.has(token), `emittable toast class "${token}" has a .toast-host-family rule in styles.css`)
    }
  }
  for (const tone of NOTICE_TONES) {
    for (const token of noticeClasses({ tone }).split(' ')) {
      ok(NOTICE_RULES.has(token), `emittable notice class "${token}" has a .notice-banner-family rule in styles.css`)
    }
  }
  // The item vocabulary is RETAINED GEOMETRY in canvas.css (manifest §7):
  // the base rule. `neutral` is the bare base (the chip accent precedent —
  // no rule of its own, by design); the tone modifiers are pinned in (f2).
  ok(CANVAS_TOAST_ITEM_RULES.has('canvas-toast'), 'the retained .canvas-toast base rule is present in canvas.css')
})

test('(f2) the canvas.css item tone selectors exist (error/success; neutral is the bare base)', () => {
  // collectFamilyRules keys compound selectors like `.canvas-toast.error`
  // under `canvas-toast` — the tone modifiers need their own existence
  // check against the sheet text.
  ok(/\.canvas-toast\.error(?![\w-])/.test(CANVAS_NOCOMMENTS), '.canvas-toast.error exists (retained tone rule)')
  ok(/\.canvas-toast\.success(?![\w-])/.test(CANVAS_NOCOMMENTS), '.canvas-toast.success exists (retained tone rule)')
  ok(!/\.canvas-toast\.neutral(?![\w-])/.test(CANVAS_NOCOMMENTS), 'neutral has no rule — the bare base (chip-accent precedent), not an omission')
  // Sheet → nameable (the ORPHAN direction): every toast-host--* /
  // notice-banner--* rule in styles.css is one the closed matrices name.
  for (const className of TOAST_RULES.keys()) {
    if (className.startsWith('toast-host--')) {
      const modifier = className.slice('toast-host--'.length)
      ok(TOAST_PLACEMENTS.indexOf(modifier) !== -1, `sheet rule .${className} is nameable by the placement matrix`)
    }
  }
  for (const className of NOTICE_RULES.keys()) {
    if (className.startsWith('notice-banner--')) {
      const modifier = className.slice('notice-banner--'.length)
      ok(NOTICE_TONES.indexOf(modifier) !== -1, `sheet rule .${className} is nameable by the tone matrix`)
    }
  }
})

// ---- (g) P06 property whitelists --------------------------------------------------

test('(g) the recipes carry only their documented properties', () => {
  // Toast host: placement + container mechanics + z. No padding/font/color —
  // the surface class owns the strip's shape (canvas.css .canvas-toasts).
  const base = TOAST_RULES.get('toast-host')
  ok(base, '.toast-host base rule exists')
  for (const prop of Array.from(base.props)) {
    ok(
      ['display', 'flex-direction', 'gap', 'z-index'].indexOf(prop) !== -1,
      `.toast-host declares only container mechanics (found "${prop}")`,
    )
  }
  for (const placement of TOAST_PLACEMENTS) {
    const rule = TOAST_RULES.get(`toast-host--${placement}`)
    ok(rule, `.toast-host--${placement} rule exists`)
    for (const prop of Array.from(rule.props)) {
      ok(
        ['position', 'left', 'right', 'bottom', 'top'].indexOf(prop) !== -1,
        `.toast-host--${placement} declares only placement properties (found "${prop}")`,
      )
    }
  }
  // Notice tones: color/background/border-color ONLY (the chip/button rule).
  for (const tone of NOTICE_TONES) {
    const rule = NOTICE_RULES.get(`notice-banner--${tone}`)
    ok(rule, `.notice-banner--${tone} rule exists`)
    for (const prop of Array.from(rule.props)) {
      ok(
        ['color', 'background', 'border-color'].indexOf(prop) !== -1,
        `.notice-banner--${tone} declares only tone properties (found "${prop}")`,
      )
    }
  }
  // The notice BASE owns the intrinsic geometry (the task-8 size-step
  // judgment call, documented in the recipe comment) + nothing tonal. Read
  // the BARE rule, not the union (the `> button` descendant is its own
  // contract, checked below).
  const noticeBaseBody = NOTICE_RULES.bySelector.get('.notice-banner')
  ok(noticeBaseBody !== undefined, '.notice-banner base rule exists (bare selector)')
  for (const declaration of noticeBaseBody.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon === -1) continue
    const prop = declaration.slice(0, colon).trim().toLowerCase()
    ok(
      ['display', 'align-items', 'gap', 'padding', 'font-size'].indexOf(prop) !== -1,
      `.notice-banner base declares only the intrinsic notice geometry (found "${prop}")`,
    )
  }
  // The shared × button rule: layout only.
  const buttonBody = NOTICE_RULES.bySelector.get('.notice-banner > button')
  ok(buttonBody !== undefined, '.notice-banner > button rule exists (the shared × geometry)')
  for (const declaration of buttonBody.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon === -1) continue
    const prop = declaration.slice(0, colon).trim().toLowerCase()
    ok(
      ['margin-left', 'background', 'border', 'color', 'cursor'].indexOf(prop) !== -1,
      `.notice-banner > button declares only the ×'s own layout (found "${prop}")`,
    )
  }
})

// ---- (h) tokens-only ---------------------------------------------------------------

test('(h) every var() the recipes reference is :root-defined', () => {
  for (const [className, entry] of Array.from(NOTICE_RULES.entries())) {
    for (const ref of Array.from(entry.varRefs)) {
      ok(ROOT_VARS.has(ref), `${className} references a :root-defined token (${ref})`)
    }
  }
  for (const [className, entry] of Array.from(TOAST_RULES.entries())) {
    for (const ref of Array.from(entry.varRefs)) {
      ok(ROOT_VARS.has(ref), `${className} references a :root-defined token (${ref})`)
    }
  }
})

// ---- (i) the C1 border-shorthand hazard net, notice leg ------------------------------

function walkFiles(dir, suffix, into) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, suffix, into)
    else if (entry.name.endsWith(suffix)) into.push(full)
  }
  return into
}

/** Class tokens from a className JSX attribute expression (string literal or
 *  template), the P01 normalization. */
function classTokensOf(expression) {
  const tokens = []
  const pattern = /[a-zA-Z][\w-]*/g
  let match = pattern.exec(expression)
  while (match !== null) {
    tokens.push(match[0])
    match = pattern.exec(expression)
  }
  return tokens
}

test('(i) no NoticeBanner-composed surface class is styled by a border shorthand', () => {
  const srcRoot = path.resolve(__dirname, '..', 'src')
  // The surface tokens: every class token composed alongside the
  // notice-banner recipes in a className expression (NoticeBanner renders
  // them after `notice-banner notice-banner--*` by construction).
  const surfaceTokens = new Set()
  const tsxFiles = walkFiles(srcRoot, '.tsx', [])
  for (const file of tsxFiles) {
    const source = fs.readFileSync(file, 'utf8')
    const tagPattern = /<NoticeBanner\b[\s\S]*?>/g
    let tagMatch = tagPattern.exec(source)
    while (tagMatch !== null) {
      const classMatch = /className=\{?"([^"}`]*)/.exec(tagMatch[0])
      if (classMatch) {
        for (const token of classTokensOf(classMatch[1])) {
          if (token !== 'notice-banner' && !token.startsWith('notice-banner--')) surfaceTokens.add(token)
        }
      }
      tagMatch = tagPattern.exec(source)
    }
  }
  ok(surfaceTokens.has('ds-notice'), `the walk sees the ds-notice surface token (parse sanity; got: ${Array.from(surfaceTokens).join(', ')})`)
  ok(surfaceTokens.has('ds-error-banner'), 'the walk sees the ds-error-banner surface token')
  ok(surfaceTokens.has('iw-note'), 'the walk sees the iw-note surface token')
  // Any rule referencing such a token that declares a border shorthand —
  // the hazard: the shorthand resets border-color and, at (0,1,0) in a
  // later-loading sheet, beats the tone recipes.
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
          violations.push(`${path.relative(srcRoot, file)}: "${rule.selectorText.trim().replace(/\s+/g, ' ').slice(0, 60)}" declares ${prop}: — the shorthand resets border-color to currentcolor and, at (0,1,0) in a later-loading sheet, beats the .notice-banner--* recipes (split to border-width/border-style longhands)`)
        }
      }
    }
  }
  eq(violations.length, 0, `zero border shorthands on NoticeBanner-composed surface classes (found: ${violations.length})\n    ${violations.join('\n    ')}`)
})

// ---- (j) migration pins --------------------------------------------------------

test('(j) the hand-rolled strips/banners are gone; retained geometry stays; the §8 dead families are deleted', () => {
  // The workbench inline copy (manifest §7): no iw-notice token anywhere in
  // WorkbenchApp.tsx (the data attribute included — the substring matters),
  // and its workbench.css rules retire with it.
  const workbenchApp = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'images', 'WorkbenchApp.tsx'), 'utf8')
  eq(workbenchApp.indexOf('iw-notice'), -1, 'WorkbenchApp.tsx carries no iw-notice token (grep target 0, manifest §7)')
  ok(!/\.iw-notice(?![\w-])/.test(WORKBENCH_NOCOMMENTS), 'the .iw-notice rules retired from workbench.css')
  ok(!/\.iw-toasts(?![\w-])/.test(WORKBENCH_NOCOMMENTS), 'the .iw-toasts rule retired with the inline strip (the toast-host--bottom-right recipe owns the placement)')
  ok(/\.iw-note(?![\w-])/.test(WORKBENCH_NOCOMMENTS), 'the workbench notice keeps its local EDGE geometry under the new .iw-note surface class')
  const iwNoteBody = collectRules(WORKBENCH_CSS)
    .filter((rule) => rule.selectorText.split(',').some((selector) => selector.trim() === '.iw-note'))
    .map((rule) => rule.body)
    .join(';')
  ok(iwNoteBody.length > 0, 'the .iw-note rule has a body (parse sanity)')
  ok(iwNoteBody.indexOf('cursor') === -1, 'the banner-click cursor died with the banner-click dismissal (the × is the only dismiss path)')

  // The datasets banners: tone rules collapsed into the recipes; the EDGE
  // geometry (border-bottom) + pre-wrap stay local.
  const dsNoticeRules = collectRules(DATASETS_CSS).filter((rule) => /\.ds-notice|\.ds-error-banner/.test(rule.selectorText))
  ok(dsNoticeRules.length > 0, 'the ds banner surface rules exist (retained edge geometry)')
  for (const rule of dsNoticeRules) {
    for (const forbidden of ['background', 'color:', 'border-bottom:', 'border-color']) {
      ok(rule.body.indexOf(forbidden) === -1, `ds banner surface rule carries no tone/shorthand property ("${forbidden}" in "${rule.selectorText.trim().slice(0, 40)}")`)
    }
  }

  // Retained geometry: the canvas container rule stays, minus the placement
  // properties the placement prop now owns.
  const toastsRule = collectRules(CANVAS_CSS).find((rule) => /^\.canvas-toasts(?![\w-])/m.test(rule.selectorText.trim()))
  ok(toastsRule, 'the retained .canvas-toasts container rule is present in canvas.css (manifest §7)')
  for (const declaration of toastsRule.body.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon === -1) continue
    const name = declaration.slice(0, colon).trim().toLowerCase()
    ok(['display', 'gap', 'max-width', 'z-index'].indexOf(name) !== -1, `.canvas-toasts declares container geometry only (found "${name}") — placement lives in toast-host--bottom-left`)
  }
  ok(/\.canvas-toast(?![\w-])/.test(CANVAS_NOCOMMENTS), 'the .canvas-toast item rules are present (retained)')

  // Manifest §8: the dead families are gone from styles.css. Token-exact
  // boundary (the manifest's own P01 normalization): `notice-banner` is a
  // DIFFERENT token than `notice` — \b would false-hit the hyphen.
  const dead = /^\s*(--sidebar:|\.(notice|mode-tabs|app-shell|titlebar|sidebar|nav-button|progress)([^-a-zA-Z0-9_]|$))/m
  ok(!dead.test(STYLES_NOCOMMENTS), 'the manifest §8 dead-CSS families are deleted from styles.css (selector-position, token-exact)')
  ok(!/notice-enter/.test(STYLES_NOCOMMENTS), 'the dead @keyframes notice-enter rode with its only consumer')
  ok(!/--sidebar/.test(STYLES_NOCOMMENTS), 'the orphaned --sidebar token rode with the shell/nav family')
  // …and the interleaved LIVE rules survived the deletion.
  ok(/\.status-dot(?![\w-])/.test(STYLES_NOCOMMENTS), '.status-dot survived (live at Radar)')
  ok(/\.icon-button(?![\w-])/.test(STYLES_NOCOMMENTS), '.icon-button survived (5 consumers)')
  ok(/\.generation-defaults-grid/.test(STYLES_NOCOMMENTS), '.generation-defaults-grid survived (live in SettingsView + both media blocks)')
  ok(/\.standard-page(?![\w-])/.test(STYLES_NOCOMMENTS), 'the 680px block kept its live lines (.standard-page)')
})
