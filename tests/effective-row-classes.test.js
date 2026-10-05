// effective-row-classes (component vocabulary task 19, Flux k2q0n9s) — the
// effective-setting row's OWN contract: the pure origin/attempt display
// math behind src/ui/EffectiveSettingRow.tsx (kept in the react-free
// src/ui/effectiveRowClasses.ts so this node suite can load it through the
// VM harness), the recipe's shape in src/styles.css, the RESOLVER-SIDE
// mapping (modelOverrides.ts's effectiveSlotSetting — the P08 origin ≠
// outcome seam), and the migration pins at the two consumers:
//
//   (a) origin display — an override renders its LEVEL as a chip; the
//       no-override state renders NO chip at all: the origin slot reads
//       'auto/default' and NEVER a fabricated level (the r3 correction).
//   (b) attempt chips — 'level · outcome' in the outcome's tone: refused →
//       danger, degraded → warning (existing chip recipes, no new colors).
//   (c) class composition — effectiveRowClasses() composes
//       `effective-setting-row [surface…]` (surface geometry last, deduped).
//   (d) dev-warn — a reset handler against a non-override origin warns
//       (the owned-LEVEL half of the discipline is caller-side).
//   (e) recipe lockstep, both directions — every class the component emits
//       has a rule in src/styles.css, and every `.effective-setting*`
//       rule there is one the component can name.
//   (f) P06 + tokens — the row rules carry flow/tone/type plus the row's
//       OWN scoped chip geometry (`.effective-setting-row .chip` — the
//       shared .chip class stays geometry-free), and every var() they
//       reference is DEFINED in src/styles.css's :root (P02 membership).
//   (g) the resolver mapping — effectiveSlotSetting derives value/origin/
//       attempt from the raw layers: applied picks name their layer; a
//       failed pick NEVER becomes the effective value (it surfaces as the
//       attempt record over the surviving lower override or auto); blank
//       picks are auto; the level is never 'node' (no fabrications).
//   (h) migration pins — the retired level-attribution ternaries are gone
//       from PropertiesPanel/SettingsView, the seam (effectiveSlotSetting)
//       replaced overridePickOutcome at both consumers, and each surface's
//       reset is scoped to the level IT owns.
//
// The rendered chips + the reset-reveals-global contract only execute in a
// browser: P04 puts them in e2e/canvas.spec.ts (Review Focus #3) and
// e2e/settings.spec.ts, not here.
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const { loadTs } = require('../scripts/lib/ts-vm.cjs')
const rowModule = loadTs('src/ui/effectiveRowClasses.ts')
const { EFFECTIVE_AUTO_TEXT, effectiveAttemptChip, effectiveChipClasses, effectiveOriginChip, effectiveOriginKey, effectiveResetLabel, effectiveRowClasses, effectiveRowWarnFor } = rowModule
const overridesModule = loadTs('src/lib/modelOverrides.ts')
const { effectiveSlotSetting } = overridesModule

const ok = (condition, label) => assert.ok(condition, label)

function eq(actual, expected, label) {
  assert.equal(actual, expected, label)
  console.log(`  ok - ${label}`)
}

// ---- the live sheet parse (the statusToken doctrine: read the sheet at
// run time; membership proves definition) ---------------------------------

const STYLES = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'styles.css'), 'utf8')
const PANEL = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'canvas', 'PropertiesPanel.tsx'), 'utf8')
const SETTINGS = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'views', 'SettingsView.tsx'), 'utf8')

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

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Top-level rules as { selectorText, body } (the chip/notice walk shape). */
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
    rules.push({ selectorText: css.slice(index, open), body: css.slice(open + 1, end - 1) })
    index = end
  }
  return rules
}

const ROW_RULES = collectRules(stripComments(STYLES)).filter((rule) =>
  rule.selectorText.split(',').some((selector) => selector.includes('.effective-setting')),
)

// ---- (a) origin display: chip for overrides, plain text for auto --------

test('(a) origin display — level chips for overrides, auto/default text and NO chip for the no-override state', () => {
  eq(EFFECTIVE_AUTO_TEXT, 'auto/default', "the auto state reads 'auto/default' (never a fabricated level)")
  eq(effectiveOriginChip({ kind: 'auto' }), null, 'auto renders NO origin chip')
  for (const level of ['node', 'chain', 'global']) {
    const chip = effectiveOriginChip({ kind: 'override', level })
    ok(chip, `an override at ${level} renders a chip`)
    eq(chip.tone, 'muted', `the ${level} origin chip is the muted tone (provenance, not a state)`)
    eq(chip.text, level, `the ${level} origin chip names its level verbatim`)
  }
  eq(effectiveOriginKey({ kind: 'auto' }), 'auto', "the origin's machine value for auto is 'auto'")
  eq(effectiveOriginKey({ kind: 'override', level: 'chain' }), 'chain', 'the origin machine value names the level')
})

// ---- (b) attempt chips: level · outcome in the outcome's tone ------------

test('(b) attempt chips — refused rides danger, degraded rides warning, text carries level and outcome', () => {
  const refused = effectiveAttemptChip({ level: 'global', outcome: 'refused' })
  eq(refused.tone, 'danger', 'a refused attempt is the danger tone (the submission will not run until it clears)')
  eq(refused.text, 'global · refused', 'the refused chip reads level · outcome')
  const degraded = effectiveAttemptChip({ level: 'chain', outcome: 'degraded' })
  eq(degraded.tone, 'warning', 'a degraded attempt is the warning tone (drift; rendering proceeds)')
  eq(degraded.text, 'chain · degraded', 'the degraded chip reads level · outcome')
  eq(effectiveChipClasses('danger'), 'chip chip--danger effective-setting-chip', 'the attempt tone composes through the existing chip recipes (no new colors)')
  eq(effectiveChipClasses('muted'), 'chip chip--muted effective-setting-chip', 'the origin tone composes through the existing chip recipes')
})

// ---- (c) class composition -------------------------------------------------

test('(c) class composition — the recipe class first, surface geometry last, deduped', () => {
  eq(effectiveRowClasses({}), 'effective-setting-row', 'the bare recipe class')
  eq(effectiveRowClasses({ className: 'model-override-effective' }), 'effective-setting-row model-override-effective', 'the surface geometry class composes after the recipe')
  eq(
    effectiveRowClasses({ className: 'canvas-model-effective effective-setting-row canvas-model-effective' }),
    'effective-setting-row canvas-model-effective',
    'deduped — the recipe token never repeats and the surface class never promotes',
  )
})

// ---- (d) dev-warn: reset ownership ----------------------------------------

test('(d) dev-warn — onReset against a non-override origin is the misuse the component can see', () => {
  const warn = effectiveRowWarnFor({ origin: { kind: 'auto' }, onReset: () => undefined })
  ok(warn !== null, 'a reset handler with an auto origin warns')
  ok(warn.includes('onReset'), 'the warning names the misused prop')
  eq(effectiveRowWarnFor({ origin: { kind: 'override', level: 'chain' }, onReset: () => undefined }), null, 'a reset at an override origin is the honest pair')
  eq(effectiveRowWarnFor({ origin: { kind: 'auto' } }), null, 'no handler, no warning')
  eq(effectiveRowWarnFor({ origin: { kind: 'auto' }, onReset: undefined }), null, 'undefined handler is absence, not misuse')
  ok(effectiveResetLabel('Video VAE').includes('Video VAE'), "the reset's accessible name names what resets")
})

// ---- (e) recipe lockstep, both directions ----------------------------------

test('(e) recipe lockstep — emitted classes ⇄ sheet rules, both directions', () => {
  // Every class the component can emit has a rule (or is a chip recipe the
  // chip-classes suite owns in lockstep).
  const emitted = ['effective-setting-row', 'effective-setting-value', 'effective-setting-chip', 'effective-setting-reset', 'chip', 'chip--muted', 'chip--danger', 'chip--warning']
  for (const token of emitted) {
    const anchored = new RegExp(`\\.(${token.replace(/[-]/g, '[-]')})([^\\w-]|$|[,:. ])`)
    ok(
      token.startsWith('chip')
        ? anchored.test(stripComments(STYLES))
        : ROW_RULES.some((rule) => rule.selectorText.includes(`.${token}`)),
      `the emitted class .${token} has a rule in src/styles.css`,
    )
  }
  // Every `.effective-setting*` rule in the sheet is one the component names.
  for (const rule of ROW_RULES) {
    const selectors = rule.selectorText.split(',').map((entry) => entry.trim())
    for (const selector of selectors) {
      ok(selector.includes('.effective-setting'), `the rule ${selector} belongs to the row's family`)
      ok(
        selector.startsWith('.effective-setting-row'),
        `the rule ${selector} is anchored on the recipe class, not floating`,
      )
    }
  }
  ok(ROW_RULES.length >= 4, 'the recipe block exists (row, value, chips, reset)')
  // The chip geometry rides the row's OWN token — never a selector that
  // mentions .chip (the shared chip classes stay geometry-free; the
  // chip-classes suite's P06 net walks every .chip-mentioning rule).
  for (const rule of ROW_RULES) {
    ok(!rule.selectorText.includes('.chip ') && rule.selectorText.trim() !== '.chip', `the rule ${rule.selectorText.trim()} carries no chip-geometry (the row's own token does)`)
  }
})

// ---- (f) P06 + tokens -------------------------------------------------------

test('(f) P06 — flow/tone/type + the row-scoped chip geometry only; every var() is :root-defined', () => {
  const FLOW_TONE_TYPE = new Set(['display', 'flex-wrap', 'align-items', 'gap', 'margin', 'color', 'font-size', 'min-width', 'overflow-wrap', 'line-height', 'padding', 'border-radius', 'border-width', 'border-style', 'cursor'])
  const seen = new Set()
  for (const rule of ROW_RULES) {
    const declarations = rule.body.split(';')
    for (const declaration of declarations) {
      const colon = declaration.indexOf(':')
      if (colon === -1) continue
      const property = declaration.slice(0, colon).trim()
      ok(FLOW_TONE_TYPE.has(property), `the row rule's property "${property}" is flow/tone/type or the scoped chip shape (P06)`)
      seen.add(property)
      const varMatch = /var\((--[\w-]+)\)/.exec(declaration)
      if (varMatch) ok(ROOT_VARS.has(varMatch[1]), `the var ${varMatch[1]} is defined in :root`)
    }
  }
  ok(seen.has('color') && seen.has('font-size'), 'the recipe owns tone/type')
  ok(seen.has('display') && seen.has('gap'), 'the recipe owns its internal flow')
  // The shared .chip class stays geometry-free: the compact pill shape is
  // SCOPED to the row (`.effective-setting-row .chip`), never global.
  const sharedChip = collectRules(stripComments(STYLES)).find((rule) => rule.selectorText.trim() === '.chip')
  ok(sharedChip, 'the shared .chip tone rule exists')
  ok(!/padding|border-radius|font-size/.test(sharedChip.body), 'the shared .chip rule carries no geometry (the row scopes its own)')
})

// ---- (g) the resolver-side mapping (origin ≠ outcome) ----------------------

// The fixture IS an instance-registry listing (the Wave-2 R-12 shape the
// workflows suite uses): plain {name, kind, bytes: 0} rows.
const SCAN = [
  { kind: 'diffusion_models', name: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', bytes: 0 },
  { kind: 'diffusion_models', name: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', bytes: 0 },
  { kind: 'diffusion_models', name: 'TenStrip_10Eros-Max_beta5_int8.safetensors', bytes: 0 },
  { kind: 'text_encoders', name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', bytes: 0 },
  { kind: 'vae', name: 'minimax_h3_video_vae_fp16.safetensors', bytes: 0 },
  { kind: 'vae', name: 'minimax_h3_audio_vae_fp32.safetensors', bytes: 0 },
]
const FL2VA_INFERRED = 'minimax_h3_fl2va_pruned_int8_convrot.safetensors'
const VIDEO_VAE_INFERRED = 'minimax_h3_video_vae_fp16.safetensors'
const MERGE = 'TenStrip_10Eros-Max_beta5_int8.safetensors'

test('(g) the resolver mapping — applied picks name their layer; failed picks are the ATTEMPT, never the value', () => {
  // 1. No picks anywhere: auto, no fabricated level.
  const none = effectiveSlotSetting('minimax', 'fl2va', SCAN, {})
  eq(none.value, FL2VA_INFERRED, 'no picks → the auto inference is the value')
  eq(none.origin.kind, 'auto', 'no picks → origin auto')
  eq(none.attempt, undefined, 'no picks → no attempt record')
  eq(none.attemptMessage, undefined, 'no picks → no message')

  // 2. A chain pick that applies: value = the pick, origin = chain.
  const chainApplied = effectiveSlotSetting('minimax', 'fl2va', SCAN, { chain: { fl2va: MERGE } })
  eq(chainApplied.value, MERGE, 'an applied chain pick is the value')
  eq(JSON.stringify(chainApplied.origin), '{"kind":"override","level":"chain"}', 'an applied chain pick names the chain level')
  eq(chainApplied.attempt, undefined, 'an applied pick carries no attempt')

  // 3. A global pick that applies (no chain pick): origin = global.
  const globalApplied = effectiveSlotSetting('minimax', 'fl2va', SCAN, { global: { fl2va: MERGE } })
  eq(globalApplied.value, MERGE, 'an applied global pick is the value')
  eq(JSON.stringify(globalApplied.origin), '{"kind":"override","level":"global"}', 'an applied global pick names the global level')

  // 4. A chain pick SHADOWS a global pick on the same slot: origin = chain
  //    (the layer actually in force), the global not fabricated as origin.
  const shadowing = effectiveSlotSetting('minimax', 'fl2va', SCAN, { chain: { fl2va: MERGE }, global: { fl2va: FL2VA_INFERRED } })
  eq(shadowing.value, MERGE, 'the chain pick wins the value')
  eq(JSON.stringify(shadowing.origin), '{"kind":"override","level":"chain"}', 'the shadowing layer is the origin')

  // 5. A REFUSED global pick (the audio decoder named into the video VAE
  //    slot — in the registry, cross-class): effective = auto, attempt =
  //    global/refused. The failed pick never becomes the value.
  const refusedGlobal = effectiveSlotSetting('minimax', 'videoVae', SCAN, { global: { videoVae: 'minimax_h3_audio_vae_fp32.safetensors' } })
  eq(refusedGlobal.value, VIDEO_VAE_INFERRED, 'a refused global pick falls back to the auto inference as the value')
  eq(refusedGlobal.origin.kind, 'auto', 'a refused global pick leaves origin auto (nothing lower than global)')
  eq(JSON.stringify(refusedGlobal.attempt), '{"level":"global","outcome":"refused"}', 'the refusal surfaces as the attempt record')
  ok(String(refusedGlobal.attemptMessage).includes('audio-class VAE'), 'the attempt message carries the resolver reason')

  // 6. A REFUSED chain pick with the global still standing: effective = the
  //    SURVIVING global override (exactly what clearing the failed pick puts
  //    in force), attempt = chain/refused.
  const refusedChain = effectiveSlotSetting('minimax', 'videoVae', SCAN, {
    chain: { videoVae: 'minimax_h3_audio_vae_fp32.safetensors' },
    global: { videoVae: VIDEO_VAE_INFERRED },
  })
  eq(refusedChain.value, VIDEO_VAE_INFERRED, 'the failed chain pick never becomes the value — the surviving global is shown')
  eq(JSON.stringify(refusedChain.origin), '{"kind":"override","level":"global"}', 'the origin is the surviving lower override')
  eq(JSON.stringify(refusedChain.attempt), '{"level":"chain","outcome":"refused"}', 'the failed pick is the chain attempt record')

  // 7. A DEGRADED chain pick (file vanished from the registry), nothing
  //    beneath: effective = auto, attempt = chain/degraded.
  const degradedChain = effectiveSlotSetting('minimax', 'videoVae', SCAN, { chain: { videoVae: 'GONE_video_decoder.safetensors' } })
  eq(degradedChain.value, VIDEO_VAE_INFERRED, 'a degraded pick falls back to the auto inference')
  eq(degradedChain.origin.kind, 'auto', 'a degraded pick leaves origin auto')
  eq(JSON.stringify(degradedChain.attempt), '{"level":"chain","outcome":"degraded"}', 'the drift surfaces as the chain attempt record')
  ok(String(degradedChain.attemptMessage).includes('not in the engine\'s model registry'), 'the attempt message carries the drift warning')

  // 8. A DEGRADED global pick: attempt = global/degraded.
  const degradedGlobal = effectiveSlotSetting('minimax', 'audioVae', SCAN, { global: { audioVae: 'GONE_audio_decoder.safetensors' } })
  eq(JSON.stringify(degradedGlobal.attempt), '{"level":"global","outcome":"degraded"}', 'the global drift is the attempt record')

  // 9. Blank/whitespace picks are auto (the stored convention) — no
  //    fabricated level from an empty slot.
  const blank = effectiveSlotSetting('minimax', 'fl2va', SCAN, { chain: { fl2va: '   ' }, global: { fl2va: '' } })
  eq(blank.origin.kind, 'auto', 'blank picks read as auto')

  // 10. Levels stay resolver-honest across every case: never 'node' (the
  //     row's vocabulary admits it; this seam never fabricates it).
  const cases = [none, chainApplied, globalApplied, shadowing, refusedGlobal, refusedChain, degradedChain, degradedGlobal, blank]
  for (const entry of cases) {
    if (entry.origin.kind === 'override') ok(entry.origin.level === 'chain' || entry.origin.level === 'global', 'the resolver-side origin level is chain|global only')
    if (entry.attempt) ok(entry.attempt.level === 'chain' || entry.attempt.level === 'global', 'the attempt level is chain|global only')
  }
})

// ---- (h) migration pins ------------------------------------------------------

test('(h) migration pins — the seam replaced the hand-rolled provenance at both consumers', () => {
  // Both consumers render through the row + the ONE resolver seam.
  ok(PANEL.includes('effectiveSlotSetting('), 'PropertiesPanel derives through the resolver seam')
  ok(PANEL.includes('<EffectiveSettingRow'), 'PropertiesPanel renders the effective-setting row')
  ok(SETTINGS.includes('effectiveSlotSetting('), 'SettingsView derives through the resolver seam')
  ok(SETTINGS.includes('<EffectiveSettingRow'), 'SettingsView renders the effective-setting row')
  // The retired ad-hoc provenance markup is gone.
  ok(!PANEL.includes("Refused {layer === 'global'"), 'the panel\'s level-attribution refused ternary is retired')
  ok(!PANEL.includes("layer === 'global' ? 'The global Settings pick '"), 'the panel\'s level-attribution degraded ternary is retired')
  ok(!PANEL.includes('overridePickOutcome'), 'the panel no longer re-derives verdicts beside the seam (one validation path)')
  ok(!SETTINGS.includes('Refused — {outcome.reason}'), 'the settings refused ternary is retired')
  ok(!SETTINGS.includes('overridePickOutcome'), 'SettingsView no longer re-derives verdicts beside the seam')
  ok(!PANEL.includes("outcome?.state === 'applied' && outcome.warning"), 'the unreachable applied+warning branch died with the ternaries')
  ok(!SETTINGS.includes("outcome?.state === 'applied' && outcome.warning"), 'the settings copy of the dead branch died too')
  // Reset is scoped to the level each surface OWNS.
  ok(PANEL.includes("setting.origin.level === 'chain'"), 'the panel\'s reset is scoped to its chain level')
  ok(!PANEL.includes("setting.origin.level === 'global'"), 'the panel never offers a reset at the global level (not its row to clear)')
  ok(SETTINGS.includes("setting.origin.level === 'global'"), 'the settings rows\' reset is scoped to their global level')
  ok(!SETTINGS.includes("setting.origin.level === 'chain'"), 'the settings rows never offer a chain reset (the chain panel owns that)')
  // The consumer-side geometry landed with the surface (P06).
  ok(STYLES.includes('.model-override-row .model-override-effective'), 'the settings row\'s grid-column geometry rides its surface class')
})
