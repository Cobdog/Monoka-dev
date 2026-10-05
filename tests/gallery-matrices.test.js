// gallery-matrices (component vocabulary task 23, Flux k2q0n9s) — the
// gallery's OWN contract: the kit's STATE MATRICES as data, with every
// non-renderable cell carried as a JUSTIFIED N/A (a reason in the data,
// never a silently skipped cell). The data lives in the react-free
// src/gallery/matrices.ts so this node suite can load it through the VM
// harness (the statusToken/chipClasses/… doctrine: one authority, tested
// where it lives); the rendered cells, the hover/focus drivers, and the
// interactive demos are browser behavior — P04 puts them in
// e2e/gallery.spec.ts, not here.
//
//   (a) COMPLETENESS — galleryMatrixProblems() is empty: every section's
//       cell set is EXACTLY the cross product of its declared axes (each
//       combination appears exactly once), ids are unique, axis keys and
//       values are inside the declared alphabets, every N/A cell carries a
//       non-empty reason, drivers are the two real ones.
//   (b) THE GALLERY CONTRACT'S N/A-BEARING MATRICES — the three state
//       matrices the round shipped with impossible cells (SaveStatus
//       retry-off-failed, HandoffResult refresh-before-write,
//       EffectiveSettingRow node/auto-reset) actually carry them, with the
//       counts the interfaces pin.
//   (c) CLOSED-MATRIX LOCKSTEP — the gallery exhibits the kit's CLOSED
//       matrices EXACTLY: Button variants, Chip tones, Progress tones,
//       Toast tones/placements, Notice tones/roles, Save states, Handoff
//       write/refresh states — imported from the kit's own react-free
//       modules, not restated here (a kit change that forgets the gallery
//       false-reds).
//   (d) THE NAMED INVENTORY — every stateful component the gallery contract
//       names has a section: Button, Chip, ProgressBar, ToastHost,
//       NoticeBanner, SaveStatus, Refusal, HandoffResult,
//       EffectiveSettingRow, Field, StudioSelect, PopoverMenu, StudioDock,
//       ConfirmDialog, PromptDialog, and the layer-registry stacking demos.
//   (e) THE DESIGNED HOMES — the T15 `initial` arm (PromptDialog's
//       unexercised matrix cell) and the T22 consumer notes (the
//       queued-spinner and refresh-busy interface notes) live HERE as data.
//   (f) SOURCE PINS — GalleryApp renders from the data (a renderer arm per
//       section id, no hardcoded cell lists), the surface registry carries
//       the ?gallery=1 append, and the vision pipeline carries the
//       gallery's capture scenario (the registration the task demands).
import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const { loadTs } = require('../scripts/lib/ts-vm.cjs')
const gallery = loadTs('src/gallery/matrices.ts')
const { GALLERY_SECTIONS, galleryAxisCombinations, galleryCellKey, galleryCounts, galleryMatrixProblems } = gallery

// The kit's own closed matrices (the lockstep source of truth).
const { BUTTON_VARIANTS } = loadTs('src/ui/buttonClasses.ts')
const { CHIP_TONES } = loadTs('src/ui/chipClasses.ts')
const { PROGRESS_TONES } = loadTs('src/ui/progressClasses.ts')
const { NOTICE_ROLES, NOTICE_TONES, TOAST_PLACEMENTS, TOAST_TONES } = loadTs('src/ui/noticeClasses.ts')
const { SAVE_STATES } = loadTs('src/ui/saveStatusClasses.ts')
const { HANDOFF_REFRESH_STATES, HANDOFF_WRITE_STATES } = loadTs('src/ui/handoffClasses.ts')

const ok = (condition, label) => assert.ok(condition, label)

function eq(actual, expected, label) {
  assert.equal(actual, expected, label)
  console.log(`  ok - ${label}`)
}

const read = (repoRelative) => fs.readFileSync(path.join(__dirname, '..', repoRelative), 'utf8')

function sectionById(id) {
  return GALLERY_SECTIONS.find((section) => section.id === id)
}

function axisValues(section, name) {
  const axis = section.axes.find((entry) => entry.name === name)
  return axis ? axis.values : null
}

function cellsOfKind(section, kind) {
  return section.cells.filter((cell) => cell.kind === kind)
}

test('(a) completeness — every section is the exact cross product of its axes, N/A justified', () => {
  const problems = galleryMatrixProblems()
  eq(problems.length, 0, `galleryMatrixProblems() is empty (got: ${JSON.stringify(problems.slice(0, 4))})`)
  eq(galleryCellKey('button', 'primary-rest'), 'button.primary-rest', 'galleryCellKey composes the DOM hook')
  for (const section of GALLERY_SECTIONS) {
    const expected = galleryAxisCombinations(section.axes).length
    eq(section.cells.length, expected, `section "${section.id}" carries every one of its ${expected} axis combinations`)
  }
  const counts = galleryCounts()
  eq(counts.cells, counts.rendered + counts.na, 'the totals partition into rendered + N/A')
  ok(counts.na >= 15, `the gallery carries justified N/A cells as data (${counts.na})`)
  console.log(`  ok - ${counts.sections} sections · ${counts.rendered} rendered cells · ${counts.na} justified N/A cells`)
})

test('(b) the N/A-bearing matrices carry their impossible cells with reasons', () => {
  const save = sectionById('save-status')
  eq(cellsOfKind(save, 'na').length, 3, 'SaveStatus: retry × {idle,saving,saved} are N/A (the affordance renders only on failed)')
  for (const cell of cellsOfKind(save, 'na')) ok(cell.reason.includes('failed'), `save-status N/A "${cell.id}" names the failed-only contract`)
  ok(cellsOfKind(save, 'render').some((cell) => cell.id === 'failed-present'), 'SaveStatus failed+retry renders')

  const handoff = sectionById('handoff')
  eq(handoff.cells.length, HANDOFF_WRITE_STATES.length * HANDOFF_REFRESH_STATES.length, 'HandoffResult: the full 3×4 write×refresh matrix')
  eq(cellsOfKind(handoff, 'na').length, 6, 'HandoffResult: the six companion-fact impossibilities are N/A, not skipped')
  for (const cell of cellsOfKind(handoff, 'na')) {
    ok(cell.reason.length > 20, `handoff N/A "${cell.id}" carries a real reason`)
    ok(cell.axes.write !== 'done', `handoff N/A "${cell.id}" is a not-yet-landed write (the refresh is the write's companion fact)`)
  }

  const effective = sectionById('effective-row')
  eq(effective.cells.length, 24, 'EffectiveSettingRow: origin × attempt × reset = 4×3×2')
  eq(cellsOfKind(effective, 'na').length, 9, 'EffectiveSettingRow: the node column (6) + auto-with-reset (3) are N/A')
  for (const cell of cellsOfKind(effective, 'na')) {
    if (cell.axes.origin === 'node') ok(cell.reason.includes('resolver'), `effective-row node N/A "${cell.id}" names the missing resolver (the T19 ruling)`)
    else ok(cell.axes.origin === 'auto' && cell.axes.reset === 'present', `effective-row N/A "${cell.id}" is auto-with-reset (the dev-warn contract)`)
  }

  const popover = sectionById('popover')
  // (C02/C03, Codex code audit 2026-10-05 fix round) the popover section
  // gained the row-count axis (the 0/1-tabbable containment edges) and the
  // chip-group section the disabled-member exhibit — the pins moved with
  // the data.
  eq(cellsOfKind(popover, 'na').length, 3, 'PopoverMenu: the latent no-backdrop path is N/A at every row count, not demoed broken')
  for (const cell of cellsOfKind(popover, 'na')) ok(cell.reason.includes('LATENT'), `the no-backdrop N/A "${cell.id}" names the latent path`)
  const popoverRows = axisValues(popover, 'rows') ?? []
  ok(popoverRows.indexOf('one') !== -1 && popoverRows.indexOf('none') !== -1, 'popover exhibits the 0/1-tabbable containment edges (C02)')
  const chipGroup = sectionById('chip-group')
  ok((axisValues(chipGroup, 'shape') ?? []).indexOf('radiogroup-disabled') !== -1, 'chip-group exhibits the disabled-member traversal case (C03)')
})

test('(c) closed-matrix lockstep — the gallery exhibits the kit\'s closed sets exactly', () => {
  eq(axisValues(sectionById('button'), 'variant').join(','), BUTTON_VARIANTS.join(','), 'button variants === BUTTON_VARIANTS')
  eq(axisValues(sectionById('chip'), 'tone').join(','), CHIP_TONES.join(','), 'chip tones === CHIP_TONES')
  eq(axisValues(sectionById('progress'), 'tone').join(','), PROGRESS_TONES.join(','), 'progress tones === PROGRESS_TONES')
  eq(axisValues(sectionById('toast'), 'tone').join(','), TOAST_TONES.join(','), 'toast tones === TOAST_TONES')
  eq(axisValues(sectionById('toast'), 'placement').join(','), TOAST_PLACEMENTS.join(','), 'toast placements === TOAST_PLACEMENTS')
  eq(axisValues(sectionById('notice'), 'tone').join(','), NOTICE_TONES.join(','), 'notice tones === NOTICE_TONES')
  eq(axisValues(sectionById('notice'), 'role').join(','), NOTICE_ROLES.join(','), 'notice roles === NOTICE_ROLES')
  eq(axisValues(sectionById('save-status'), 'state').join(','), SAVE_STATES.join(','), 'save states === SAVE_STATES')
  eq(axisValues(sectionById('handoff'), 'write').join(','), HANDOFF_WRITE_STATES.join(','), 'handoff write states === HANDOFF_WRITE_STATES')
  eq(axisValues(sectionById('handoff'), 'refresh').join(','), HANDOFF_REFRESH_STATES.join(','), 'handoff refresh states === HANDOFF_REFRESH_STATES')
})

test('(d) the named inventory — every component the gallery contract names has a section', () => {
  const components = GALLERY_SECTIONS.map((section) => section.component).join(' ')
  for (const name of ['Button', 'Chip', 'ProgressBar', 'ToastHost', 'NoticeBanner', 'SaveStatus', 'Refusal', 'HandoffResult', 'EffectiveSettingRow', 'Field', 'StudioSelect', 'PopoverMenu', 'StudioDock', 'ConfirmDialog', 'PromptDialog']) {
    ok(components.includes(name), `the inventory names ${name}`)
  }
  const layers = sectionById('layers')
  ok(layers && layers.cells.length === 2, 'the layer-registry stacking demos have their section')
  ok(layers.blurb.includes('layer registry'), 'the stacking section names the layer registry')
  console.log(`  ok - ${GALLERY_SECTIONS.length} sections: ${GALLERY_SECTIONS.map((s) => s.id).join(', ')}`)
})

test('(e) the designed homes — T15 initial + the T22 consumer notes live here as data', () => {
  const dialogs = sectionById('dialogs')
  const prefilled = dialogs.cells.find((cell) => cell.kind === 'render' && cell.axes.shape === 'prompt-prefilled')
  ok(prefilled, 'PromptDialog\'s prefilled-initial cell exists (the T15 unexercised arm)')
  ok(prefilled.note && prefilled.note.includes('initial'), 'the prefilled cell\'s note names the initial prop')

  const handoff = sectionById('handoff')
  const notes = handoff.cells.filter((cell) => cell.kind === 'render' && cell.note).map((cell) => cell.note).join(' ')
  ok(notes.includes('queued'), 'the queued-spinner interface note (T22 M2) is carried on the pending cell')
  ok(notes.includes('refresh'), 'the refresh-busy interface note (T22 M3) is carried on the done+pending cell')
})

test('(f) source pins — the app renders from the data; the surface + vision registrations exist', () => {
  const app = read('src/gallery/GalleryApp.tsx')
  ok(app.includes('GALLERY_SECTIONS'), 'GalleryApp renders from GALLERY_SECTIONS (no hardcoded cell lists)')
  for (const section of GALLERY_SECTIONS) {
    ok(app.includes(`'${section.id}'`), `GalleryApp carries a renderer arm for section "${section.id}"`)
  }
  ok(app.includes('data-gallery-cell'), 'the app stamps the per-cell hook the e2e walks')

  const registry = read('src/surfaces/registry.ts')
  ok(registry.includes("params.get('gallery') === '1'"), 'the surface registry matches ?gallery=1')
  ok(registry.includes('gallery/GalleryApp'), 'the registry lazily imports the gallery component')

  const scenarios = read('scripts/vision-e2e/scenarios.ts')
  ok(scenarios.includes("'component-gallery'"), 'the vision pipeline carries the gallery capture scenario')
  ok(scenarios.includes('[data-gallery-root]'), 'the gallery scenario asserts DOM truth before capture')
})
