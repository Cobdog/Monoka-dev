import { expect, test, type Page } from '@playwright/test'
import { GALLERY_SECTIONS, galleryCounts } from '../src/gallery/matrices'

// The component gallery (component vocabulary task 23, Flux k2q0n9s) — the
// kit's STATE MATRICES exhibited as data at ?gallery=1, pinned END TO END.
// The gallery is engine-independent and document-independent (it composes
// the kit with local state only — no store, no fetches), so every test is
// the surface itself: the data module (src/gallery/matrices.ts, the same
// module the node suite walks) drives the EXPECTED shape, and the DOM +
// computed styles answer.
//
// The pin doctrine (the established one): REAL drivers only — Playwright
// hover()/keyboard focus drive the interactive states, never synthetic
// classes; every cell asserts DOM structure and computed style; the N/A
// cells are pinned as PRESENT with their reasons (a silently skipped cell
// is the false-green this surface exists to prevent).
//
// Sections:
//   boot + registry — the fourth surface, the shared switcher, the matrix
//                     totals the data module declares;
//   completeness     — every declared cell in the DOM, N/A justified, the
//                     one legitimately-empty stage (SaveStatus idle);
//   per-kit matrices — Button, Chip(+group), ProgressBar, Toast/Notice,
//                     SaveStatus, Refusal, HandoffResult, EffectiveRow,
//                     Field, StudioSelect — computed style + DOM per cell;
//   overlays         — PopoverMenu (Escape/outside/arrows), StudioDock
//                     (markers/raise/close), Confirm/Prompt (the resolve
//                     contract, the T15 `initial` arm), the layer-registry
//                     stacking demos (topmost-only Escape, probe-asserted).

const environmental = (entry: string) =>
  entry.includes('Failed to load resource')
  || /WebSocket connection to .* failed/.test(entry)
  || /net::ERR_CONNECTION_REFUSED/.test(entry)

async function trackErrors(page: Page) {
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`)
  })
  return problems
}

async function bootGallery(page: Page, extra = '') {
  await page.goto(`/?gallery=1${extra}`)
  await expect(page.locator('[data-gallery-root]')).toBeVisible()
}

const cell = (page: Page, key: string) => page.locator(`[data-gallery-cell="${key}"]`)

const counts = galleryCounts()

test('gallery: boots at ?gallery=1 as the fourth registered surface', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  // The registry append: the shared switcher lists four surfaces, gallery
  // active (its own titlebar carries the same chrome).
  const switcher = page.locator('[data-surface-switcher]')
  await expect(switcher).toBeVisible()
  await expect(switcher.locator('[data-surface]')).toHaveCount(4)
  await expect(switcher.locator('[data-surface="gallery"]')).toHaveAttribute('aria-current', 'page')
  await expect(switcher.locator('[data-surface="gallery"]')).toHaveAttribute('href', '/?gallery=1')
  // The declared matrix totals are DOM truth.
  const header = page.locator('[data-gallery-counts]')
  await expect(header).toHaveAttribute('data-sections', String(counts.sections))
  await expect(header).toHaveAttribute('data-cells', String(counts.cells))
  await expect(header).toHaveAttribute('data-rendered', String(counts.rendered))
  await expect(header).toHaveAttribute('data-na', String(counts.na))
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('gallery: the declared matrix renders complete — every cell present, N/A justified', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  // Per section: the declared cell count, the declared N/A count, and the
  // section's data-* inventory matches the module the node suite walks.
  await expect(page.locator('[data-gallery-section]')).toHaveCount(counts.sections)
  for (const section of GALLERY_SECTIONS) {
    const root = page.locator(`[data-gallery-section="${section.id}"]`)
    await expect(root).toHaveAttribute('data-cells', String(section.cells.length))
    const declaredNa = section.cells.filter((entry) => entry.kind === 'na').length
    await expect(root).toHaveAttribute('data-na', String(declaredNa))
    for (const entry of section.cells) {
      await expect(cell(page, `${section.id}.${entry.id}`)).toBeAttached()
    }
  }
  // Every N/A cell states its reason (data + visible prose) — never blank.
  const naCells = page.locator('[data-gallery-na]')
  await expect(naCells).toHaveCount(counts.na)
  for (let index = 0; index < await naCells.count(); index += 1) {
    const text = await naCells.nth(index).locator('.gallery-na').innerText()
    expect(text.startsWith('N/A — ') && text.length > 12, `N/A cell ${index} carries a reason (got "${text.slice(0, 40)}…")`).toBe(true)
  }
  // The driver cells are marked for the suite (rendered at rest, driven here).
  await expect(page.locator('[data-gallery-driver="hover"]')).toHaveCount(5)
  await expect(page.locator('[data-gallery-driver="focus"]')).toHaveCount(5)
  // The ONE legitimately-empty stage: SaveStatus idle (silent by contract).
  const emptyStages = await page.locator('[data-gallery-stage]').evaluateAll((stages) =>
    stages.filter((stage) => stage.childElementCount === 0 && (stage.textContent ?? '').trim() === '').map((stage) => (stage.closest('[data-gallery-cell]') as HTMLElement).dataset.galleryCell))
  expect(emptyStages, 'exactly the SaveStatus idle cell renders an empty stage').toEqual(['save-status.idle-absent'])
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('button matrix: variants, busy, disabled, icon labeling', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  for (const variant of ['primary', 'secondary', 'ghost', 'danger', 'icon']) {
    const rest = cell(page, `button.${variant}-rest`).locator('button')
    await expect(rest).toHaveClass(new RegExp(`(^|\\s)btn btn--${variant}(\\s|$)`))
    await expect(rest).toBeEnabled()
  }
  // busy = LoaderCircle + aria-busy + disabled (the §2 contract).
  const busy = cell(page, 'button.secondary-busy').locator('button')
  await expect(busy).toHaveAttribute('aria-busy', 'true')
  await expect(busy).toBeDisabled()
  await expect(busy.locator('.spin')).toHaveCount(1)
  await expect(busy).toHaveClass(/btn--busy/)
  expect(await busy.evaluate((element) => getComputedStyle(element).cursor)).toBe('progress')
  // plain disabled: never announces busy.
  const disabled = cell(page, 'button.secondary-disabled').locator('button')
  await expect(disabled).toBeDisabled()
  await expect(disabled).not.toHaveAttribute('aria-busy')
  expect(await disabled.evaluate((element) => getComputedStyle(element).opacity)).toBe('0.5')
  // icon-only carries its accessible name.
  const icon = cell(page, 'button.icon-rest').locator('button')
  await expect(icon).toHaveAttribute('aria-label', 'Open the index')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('button drivers: real hover and keyboard focus (never synthetic classes)', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  // REAL pointer hover on the secondary hover cell: the recipe's hover
  // border engages; the resting twin stays put.
  const hovering = cell(page, 'button.secondary-hover').locator('button')
  const resting = cell(page, 'button.secondary-rest').locator('button')
  const before = await hovering.evaluate((element) => getComputedStyle(element).borderTopColor)
  const restingBorder = await resting.evaluate((element) => getComputedStyle(element).borderTopColor)
  await hovering.hover()
  const after = await hovering.evaluate((element) => getComputedStyle(element).borderTopColor)
  expect(after, 'secondary hover changes the border color (the base .btn:hover rule)').not.toBe(before)
  expect(before, 'the hover cell renders at rest until driven').toBe(restingBorder)
  // The primary recipe PINS its hover border (grouped with its rest rule) —
  // the recipe's truth, pinned as such.
  const primary = cell(page, 'button.primary-hover').locator('button')
  const primaryRest = await cell(page, 'button.primary-rest').locator('button').evaluate((element) => getComputedStyle(element).borderTopColor)
  await primary.hover()
  expect(await primary.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe(primaryRest)
  // REAL keyboard focus: Tab forward from the titlebar's switcher link onto
  // the focus cell — the global :focus-visible ring renders.
  await page.locator('[data-surface-switcher] [data-surface="gallery"]').click()
  await expect(page.locator('[data-gallery-root]')).toBeVisible()
  for (let step = 0; step < 20; step += 1) {
    await page.keyboard.press('Tab')
    if (await cell(page, 'button.secondary-focus').locator('button').evaluate((element) => element === document.activeElement)) break
  }
  const focused = cell(page, 'button.secondary-focus').locator('button')
  await expect(focused).toBeFocused()
  const outline = await focused.evaluate((element) => { const style = getComputedStyle(element); return { style: style.outlineStyle, color: style.outlineColor, width: style.outlineWidth } })
  expect(outline.style).toBe('solid')
  expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('chip matrix + group: tones, selection semantics, roving tabindex', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  // Non-neutral tones compose their modifier; neutral IS the bare base.
  for (const tone of ['accent', 'danger', 'warning', 'muted']) {
    const rest = cell(page, `chip.${tone}-rest`).locator('button')
    await expect(rest).toHaveClass(new RegExp(`(^|\\s)chip chip--${tone}(\\s|$)`))
  }
  // neutral rest composes the bare base (no tone modifier class).
  await expect(cell(page, 'chip.neutral-rest').locator('button')).toHaveClass(/(^|\s)chip(\s|$)/)
  // A selected ACTION chip: the visual recipe composes chip--selected, and —
  // the r3 correction — carries NO selection aria (aria-pressed belongs to
  // toggles, aria-checked to exclusive-group radios; a plain action is
  // neither).
  const selected = cell(page, 'chip.danger-selected').locator('button')
  await expect(selected).toHaveClass(/chip--selected/)
  await expect(selected).not.toHaveAttribute('aria-pressed')
  await expect(selected).not.toHaveAttribute('aria-checked')
  const busy = cell(page, 'chip.accent-busy').locator('button')
  await expect(busy).toHaveAttribute('aria-busy', 'true')
  await expect(busy).toHaveClass(/chip--busy/)

  // The exclusive group: radiogroup semantics + the controlled selection.
  const group = cell(page, 'chip-group.radiogroup-none')
  await expect(group.locator('[role="radiogroup"]')).toHaveCount(1)
  const radios = group.locator('[data-chip-value]')
  await expect(radios).toHaveCount(3)
  await expect(radios.first()).toHaveAttribute('aria-checked', 'false')
  // Nothing selected → the FIRST chip is the single tab stop.
  expect(await radios.nth(0).evaluate((element) => element.tabIndex)).toBe(0)
  expect(await radios.nth(1).evaluate((element) => element.tabIndex)).toBe(-1)
  // A real click selects through the controlled path.
  await radios.nth(1).click()
  await expect(group.locator('[data-gallery-chip-value]')).toHaveAttribute('data-gallery-chip-value', 'image')
  await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true')
  // ArrowRight moves selection AND focus together (wrapping at the end).
  await radios.nth(1).focus()
  await group.locator('[role="radiogroup"]').press('ArrowRight')
  await expect(group.locator('[data-gallery-chip-value]')).toHaveAttribute('data-gallery-chip-value', 'audio')
  await expect(radios.nth(2)).toBeFocused()
  await group.locator('[role="radiogroup"]').press('ArrowRight')
  await expect(group.locator('[data-gallery-chip-value]')).toHaveAttribute('data-gallery-chip-value', 'video')
  await expect(radios.nth(0)).toBeFocused()

  // The pre-selected group: aria-checked on the selected member.
  const preset = cell(page, 'chip-group.radiogroup-selected').locator('[data-chip-value]')
  await expect(preset.nth(1)).toHaveAttribute('aria-checked', 'true')
  expect(await preset.nth(1).evaluate((element) => element.tabIndex)).toBe(0)

  // The toggle: a pressed button, never aria-checked.
  const toggle = cell(page, 'chip-group.toggle-unpressed').locator('button')
  await expect(toggle).not.toHaveAttribute('aria-checked')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(cell(page, 'chip-group.toggle-unpressed').locator('[data-gallery-toggle]')).toHaveAttribute('data-gallery-toggle', 'pressed')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('progressbar matrix: widths, aria triple, indeterminate, compact, local tone', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  const partial = cell(page, 'progress.partial-default-accent').locator('.progressbar')
  await expect(partial).toHaveAttribute('role', 'progressbar')
  await expect(partial).toHaveAttribute('aria-valuenow', '35')
  await expect(partial).toHaveAttribute('aria-valuemin', '0')
  await expect(partial).toHaveAttribute('aria-valuemax', '100')
  await expect(partial.locator('.progressbar-fill')).toHaveCSS('width', '77px') // 220px track × 35%
  const full = cell(page, 'progress.full-default-accent').locator('.progressbar')
  await expect(full).toHaveAttribute('aria-valuenow', '100')
  await expect(full.locator('.progressbar-fill')).toHaveCSS('width', '220px')
  // Empty: the role stays, the value triple does not.
  const empty = cell(page, 'progress.empty-default-accent').locator('.progressbar')
  await expect(empty).toHaveAttribute('role', 'progressbar')
  await expect(empty).not.toHaveAttribute('aria-valuenow')
  await expect(empty.locator('.progressbar-fill')).toHaveCSS('width', '0px')
  // Indeterminate: the sweep class wins — no width style, no value triple.
  const indeterminate = cell(page, 'progress.indeterminate-default-accent').locator('.progressbar')
  await expect(indeterminate).toHaveClass(/progressbar--indeterminate/)
  await expect(indeterminate).not.toHaveAttribute('aria-valuenow')
  expect(await indeterminate.locator('.progressbar-fill').evaluate((element) => element.style.width)).toBe('')
  expect(await indeterminate.locator('.progressbar-fill').evaluate((element) => getComputedStyle(element).animationName)).toBe('progressbar-sweep')
  // Compact is the component's own 3px step; default is 4px.
  expect(await cell(page, 'progress.partial-compact-accent').locator('.progressbar').evaluate((element) => getComputedStyle(element).height)).toBe('3px')
  expect(await partial.evaluate((element) => getComputedStyle(element).height)).toBe('4px')
  // The local tone reads the surface's --bar-tone bridge (info), not accent.
  const localFill = cell(page, 'progress.partial-default-local').locator('.progressbar-fill')
  const accentFill = partial.locator('.progressbar-fill')
  const localColor = await localFill.evaluate((element) => getComputedStyle(element).backgroundColor)
  const accentColor = await accentFill.evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(localColor).not.toBe(accentColor)
  expect(localColor).toBe('rgb(141, 184, 255)')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('toast + notice: tones announce, placements position, the × owns dismissal', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  // Every tone announces through its own role (error → alert/assertive).
  const errorToast = cell(page, 'toast.error-bottom-left').locator('[data-canvas-toast]')
  await expect(errorToast).toHaveAttribute('role', 'alert')
  await expect(errorToast).toHaveAttribute('aria-live', 'assertive')
  const successToast = cell(page, 'toast.success-bottom-left').locator('[data-canvas-toast]')
  await expect(successToast).toHaveAttribute('role', 'status')
  await expect(successToast).toHaveAttribute('aria-live', 'polite')
  await expect(successToast).toHaveClass(/(^|\s)canvas-toast success(\s|$)/)
  // The placements position the host: absolute vs fixed.
  expect(await cell(page, 'toast.neutral-bottom-left').locator('.toast-host').evaluate((element) => getComputedStyle(element).position)).toBe('absolute')
  expect(await cell(page, 'toast.neutral-bottom-right').locator('.toast-host').evaluate((element) => getComputedStyle(element).position)).toBe('fixed')
  // The × owns the one dismiss contract — a REAL click removes the item.
  await cell(page, 'toast.neutral-bottom-left').locator('[data-canvas-toast] button[aria-label="Dismiss"]').click()
  await expect(cell(page, 'toast.neutral-bottom-left').locator('[data-canvas-toast]')).toHaveCount(0)

  // Notices: tone × role × dismiss, the role's aria-live always agreeing.
  const accentStatus = cell(page, 'notice.accent-status-persistent').locator('.notice-banner')
  await expect(accentStatus).toHaveClass(/notice-banner--accent/)
  await expect(accentStatus).toHaveAttribute('role', 'status')
  await expect(accentStatus).toHaveAttribute('aria-live', 'polite')
  await expect(accentStatus.locator('button')).toHaveCount(0)
  const dangerAlert = cell(page, 'notice.danger-alert-dismissible').locator('.notice-banner')
  await expect(dangerAlert).toHaveAttribute('role', 'alert')
  await expect(dangerAlert).toHaveAttribute('aria-live', 'assertive')
  await dangerAlert.locator('button[aria-label="Dismiss"]').click()
  await expect(cell(page, 'notice.danger-alert-dismissible').locator('.notice-banner')).toHaveCount(0)
  await expect(cell(page, 'notice.danger-alert-dismissible').getByRole('button', { name: 'restore the banner' })).toBeVisible()
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('save-status + refusal: the four states, the failed-only retry, the ±satisfy gate', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  // idle is SILENT — pinned in the completeness test via the empty stage.
  const saving = cell(page, 'save-status.saving-absent').locator('[data-save-state="saving"]')
  await expect(saving).toHaveAttribute('role', 'status')
  await expect(saving.locator('.spin')).toHaveCount(1)
  await expect(saving).toContainText('Saving draft…')
  const saved = cell(page, 'save-status.saved-absent').locator('[data-save-state="saved"]')
  await expect(saved).toContainText('Draft saved.')
  await expect(saved).not.toHaveAttribute('role', 'alert')
  const failedWithoutRetry = cell(page, 'save-status.failed-absent').locator('[data-save-state="failed"]')
  await expect(failedWithoutRetry).toHaveAttribute('role', 'alert')
  await expect(failedWithoutRetry).toHaveAttribute('aria-live', 'assertive')
  await expect(failedWithoutRetry.locator('[data-save-retry]')).toHaveCount(0)
  // The failed+retry cell: the SERVER REASON verbatim + the retry affordance
  // re-runs the caller's seam (the count is the demo's caller-side state).
  const failed = cell(page, 'save-status.failed-present')
  await expect(failed.locator('[data-save-state="failed"]')).toContainText('422 Unprocessable Entity — resolution not in the family set')
  await expect(failed.locator('[data-save-retry]')).toHaveCount(1)
  await expect(failed.locator('[data-save-retry]')).toHaveAccessibleName('Retry saving the draft now')
  await failed.locator('[data-save-retry]').click()
  await expect(failed.locator('[data-gallery-retry-count]')).toHaveAttribute('data-gallery-retry-count', '1')
  // The danger tone at the ≥11px floor (the A02/A10 class).
  expect(await failed.locator('[data-save-state="failed"]').evaluate((element) => getComputedStyle(element).fontSize)).toBe('11px')

  // Refusal: the alert pair on BOTH arms; satisfy present/absent.
  for (const arm of ['absent', 'present']) {
    await expect(cell(page, `refusal.${arm}`).locator('[data-refusal]')).toHaveAttribute('role', 'alert')
    await expect(cell(page, `refusal.${arm}`).locator('[data-refusal]')).toHaveAttribute('aria-live', 'assertive')
  }
  await expect(cell(page, 'refusal.absent').locator('[data-refusal-satisfy]')).toHaveCount(0)
  const satisfyCell = cell(page, 'refusal.present')
  await expect(satisfyCell.locator('[data-refusal-satisfy]')).toHaveCount(1)
  await satisfyCell.locator('[data-refusal-satisfy]').click()
  await expect(satisfyCell.locator('[data-gallery-satisfy-count]')).toHaveAttribute('data-gallery-satisfy-count', '1')
  // The WARNING tone, never danger (a refusal is a state, not a failure).
  const refusalColor = await satisfyCell.locator('[data-refusal]').evaluate((element) => getComputedStyle(element).color)
  expect(refusalColor).toBe('rgb(240, 188, 102)')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('handoff matrix: the two independent facts across all six renderable cells', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  // pending/pending: the spinner is the idiom; nothing announces yet.
  const pending = cell(page, 'handoff.pending-pending').locator('[data-handoff-step]')
  await expect(pending).not.toHaveAttribute('role')
  await expect(pending.locator('.spin')).toHaveCount(1)
  await expect(pending.locator('[data-handoff-stale]')).toHaveCount(0)
  // done × {pending, fresh}: polite, 'landed', marker silent.
  for (const refresh of ['pending', 'fresh']) {
    const done = cell(page, `handoff.done-${refresh}`).locator('[data-handoff-step]')
    await expect(done).toHaveAttribute('role', 'status')
    await expect(done).toHaveAttribute('aria-live', 'polite')
    await expect(done).toContainText('landed')
    await expect(done.locator('[data-handoff-stale]')).toHaveCount(0)
    await expect(done.locator('[data-handoff-retry]')).toHaveCount(0)
  }
  // done/stale: the standing condition — a warning marker, no retry.
  const stale = cell(page, 'handoff.done-stale').locator('[data-handoff-step]')
  await expect(stale).toHaveAttribute('role', 'status')
  await expect(stale.locator('[data-handoff-stale]')).toHaveText('view stale — the canvas rehydrated before the write landed')
  await expect(stale.locator('[data-handoff-retry]')).toHaveCount(0)
  const markerColor = await stale.locator('[data-handoff-stale]').evaluate((element) => getComputedStyle(element).color)
  expect(markerColor).toBe('rgb(240, 188, 102)') // the warning token
  // done/failed: the failed ATTEMPT — 'not refreshed' + the REFRESH act.
  const refreshFailed = cell(page, 'handoff.done-failed').locator('[data-handoff-step]')
  await expect(refreshFailed).toHaveAttribute('role', 'status')
  await expect(refreshFailed.locator('[data-handoff-stale]')).toHaveText('not refreshed — the reload request errored (timeout)')
  await expect(refreshFailed.locator('[data-handoff-retry]')).toHaveText('refresh')
  await expect(refreshFailed.locator('[data-handoff-retry]')).toHaveAccessibleName('Refresh "Seed the video chain" now')
  await refreshFailed.locator('[data-handoff-retry]').click()
  await expect(cell(page, 'handoff.done-failed').locator('[data-gallery-retry-count]')).toHaveAttribute('data-gallery-retry-count', '1')
  // failed/pending: the only alert + danger row; the RETRY act.
  const writeFailed = cell(page, 'handoff.failed-pending').locator('[data-handoff-step]')
  await expect(writeFailed).toHaveAttribute('role', 'alert')
  await expect(writeFailed).toHaveAttribute('aria-live', 'assertive')
  await expect(writeFailed).toHaveClass(/handoff-step--failed/)
  await expect(writeFailed).toContainText('failed — 500 Internal Server Error — the documents route rejected the chain')
  await expect(writeFailed.locator('[data-handoff-retry]')).toHaveText('retry')
  await expect(writeFailed.locator('[data-handoff-retry]')).toHaveAccessibleName('Retry "Seed the video chain" now')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('effective-setting rows: origins, attempts, reset ownership', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  // auto: NO chip — the plain auto/default text (never a fabricated level).
  const auto = cell(page, 'effective-row.auto-none-absent')
  await expect(auto.locator('[data-effective-origin]')).toHaveAttribute('data-effective-origin', 'auto')
  await expect(auto.locator('[data-effective-origin-chip]')).toHaveCount(0)
  await expect(auto.locator('.effective-setting-row')).toContainText('auto/default')
  await expect(auto.locator('[data-effective-attempt-chip]')).toHaveCount(0)
  await expect(auto.locator('[data-effective-reset]')).toHaveCount(0)
  // auto + refused: origin ≠ outcome — the attempt chip beside plain auto.
  const autoRefused = cell(page, 'effective-row.auto-refused-absent')
  await expect(autoRefused.locator('[data-effective-attempt-chip]')).toHaveText('global · refused')
  await expect(autoRefused.locator('[data-effective-attempt-chip]')).toHaveClass(/chip--danger/)
  await expect(autoRefused.locator('[data-effective-value]')).toContainText('fl2va')
  // chain/global overrides render their level chip + the scoped reset.
  const chain = cell(page, 'effective-row.chain-none-present')
  await expect(chain.locator('[data-effective-origin-chip]')).toHaveText('chain')
  await expect(chain.locator('[data-effective-origin-chip]')).toHaveClass(/chip--muted/)
  await expect(chain.locator('[data-effective-reset]')).toHaveAccessibleName("Reset FL2VA checkpoint — clear this row's pick only")
  await chain.locator('[data-effective-reset]').click()
  await expect(chain.locator('[data-gallery-reset-count]')).toHaveAttribute('data-gallery-reset-count', '1')
  const global = cell(page, 'effective-row.global-none-present')
  await expect(global.locator('[data-effective-origin-chip]')).toHaveText('global')
  // degraded rides the warning chip; refused the danger chip.
  await expect(cell(page, 'effective-row.global-degraded-absent').locator('[data-effective-attempt-chip]')).toHaveClass(/chip--warning/)
  await expect(cell(page, 'effective-row.chain-refused-absent').locator('[data-effective-attempt-chip]')).toHaveClass(/chip--danger/)
  // A read-only row is simply a row with no reset.
  await expect(cell(page, 'effective-row.global-none-absent').locator('[data-effective-reset]')).toHaveCount(0)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('field precedence: error > hint > silent through real aria-describedby wiring', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  const silent = cell(page, 'field.absent-absent')
  const silentInput = silent.locator('input')
  await expect(silent.locator('.field-description')).toHaveCount(0)
  await expect(silentInput).not.toHaveAttribute('aria-describedby')
  await expect(silent.locator('label')).toHaveAttribute('for', await silentInput.evaluate((element) => element.id))
  const hint = cell(page, 'field.absent-present')
  const hintInput = hint.locator('input')
  await expect(hint.locator('.field-description')).toHaveClass(/(^|\s)field-description(\s|$)/)
  await expect(hintInput).toHaveAttribute('aria-describedby', /-hint$/)
  await expect(hint.locator('label')).toHaveAttribute('for', await hintInput.evaluate((element) => element.id))
  const error = cell(page, 'field.present-absent')
  await expect(error.locator('.field-description')).toHaveClass(/field-description--error/)
  await expect(error.locator('input')).toHaveAttribute('aria-describedby', /-error$/)
  const errorColor = await error.locator('.field-description').evaluate((element) => getComputedStyle(element).color)
  expect(errorColor).toBe('rgb(255, 127, 127)')
  // Both present: the ERROR alone describes the control — the hint element
  // leaves the DOM entirely (precedence, not masking).
  const both = cell(page, 'field.present-present')
  await expect(both.locator('.field-description')).toHaveCount(1)
  await expect(both.locator('.field-description')).toHaveClass(/field-description--error/)
  await expect(both.locator('input')).toHaveAttribute('aria-describedby', /-error$/)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('studio select: native semantics, chevron, overflow, visible focus', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  for (const key of ['bare-short', 'bare-long', 'form-short', 'form-long']) {
    const select = cell(page, `select.${key}`).locator('select')
    expect(await select.evaluate((element) => element.tagName)).toBe('SELECT')
    await expect(select).toHaveClass(/studio-select-input/)
    expect(await select.evaluate((element) => getComputedStyle(element).appearance)).toBe('none')
    await expect(cell(page, `select.${key}`).locator('.studio-select > svg')).toBeVisible()
  }
  // Long option text truncates with an ellipsis, never spills.
  for (const key of ['bare-long', 'form-long']) {
    expect(await cell(page, `select.${key}`).locator('select').evaluate((element) => getComputedStyle(element).textOverflow)).toBe('ellipsis')
  }
  // The form tier rides the retained wrap geometry (38px house row).
  expect(await cell(page, 'select.form-short').locator('.studio-select').evaluate((element) => getComputedStyle(element).display)).toBe('flex')
  expect(await cell(page, 'select.form-short').locator('select').evaluate((element) => getComputedStyle(element).height)).toBe('38px')
  // REAL keyboard focus visibly changes the control against its rest paint
  // (the settings-spec idiom: click a focusable anchor above, then Tab in —
  // programmatic .focus() does not engage :focus-visible).
  const select = cell(page, 'select.bare-short').locator('select')
  const restingOutline = await select.evaluate((element) => getComputedStyle(element).outlineStyle)
  await cell(page, 'field.absent-absent').locator('input').click()
  for (let step = 0; step < 16 && !(await select.evaluate((element) => element === document.activeElement)); step += 1) {
    await page.keyboard.press('Tab')
  }
  await expect(select).toBeFocused()
  expect(await select.evaluate((element) => getComputedStyle(element).outlineStyle), 'keyboard focus draws the :focus-visible ring').toBe('solid')
  expect(restingOutline).toBe('none')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('popover menu: registry Escape, outside-press, the arrow walk, disabled rows', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page, '&probe=layers')
  const open = cell(page, 'popover.present-four').locator('[data-gallery-open-menu]')
  await open.click()
  const menu = page.locator('[data-gallery-menu]')
  await expect(menu).toBeVisible()
  const rows = menu.locator('.gallery-menu-row')
  await expect(rows).toHaveCount(4)
  // Focus entered the popup on open (the hook's discipline).
  await expect(menu).toBeFocused()
  // The local arrows walk ENABLED rows only (disabled rows cannot hold focus).
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(0)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(1)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(3)).toBeFocused() // row 2 is disabled — skipped
  // A row click closes through the ONE onClose.
  await rows.nth(3).click()
  await expect(menu).toHaveCount(0)
  // Reopen: a ROUTED Escape closes exactly this topmost layer.
  await open.click()
  await expect(page.locator('[data-gallery-menu]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-gallery-menu]')).toHaveCount(0)
  // Reopen: an outside press lands in the same onClose (Base UI's dismiss).
  await open.click()
  await page.mouse.click(600, 300)
  await expect(page.locator('[data-gallery-menu]')).toHaveCount(0)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('studio dock: shell markers, raise on grab, close, drag', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  const arena = cell(page, 'dock.stacked-pair').locator('[data-gallery-dock-arena]')
  const dockA = arena.locator('[data-studio-dock="gallery-dock-a"]')
  const dockB = arena.locator('[data-studio-dock="gallery-dock-b"]')
  await expect(arena.locator('[data-studio-dock]')).toHaveCount(2)
  // The COMMON resize policy's minimum box (420×280) is the honest demo —
  // the shell's default, exhibited at its own floor.
  expect(await dockA.evaluate((element) => element.style.width)).toBe('420px')
  expect(await dockA.evaluate((element) => element.style.height)).toBe('280px')
  // The reactive band: consecutive ranks over the participants — the later
  // dock renders above until a grab re-raises the other.
  const zOf = async (dock: typeof dockA) => dock.evaluate((element) => Number(getComputedStyle(element).zIndex))
  const [za, zb] = [await zOf(dockA), await zOf(dockB)]
  expect(zb).toBeGreaterThan(za)
  expect(za).toBeGreaterThanOrEqual(60) // var(--z-dock-base) + rank ≥ 0
  // A REAL grab on the lower dock's header (the drag handle) raises it.
  const headerA = dockA.locator('.canvas-inspector-header')
  await headerA.hover()
  await page.mouse.down()
  await page.mouse.up()
  const [zaAfter, zbAfter] = [await zOf(dockA), await zOf(dockB)]
  expect(zaAfter, 'the grabbed dock raised to the top of the band').toBeGreaterThan(zbAfter)
  // A REAL header drag moves the dock inside the arena (bounds=parent — the
  // arena column is narrow, so the honest travel is DOWNWARD) — the canvas
  // idiom: explicit move to the header's left third (clear of the close
  // button), down, travel, up.
  const before = await dockA.boundingBox()
  const handle = await headerA.boundingBox()
  await page.mouse.move(handle!.x + handle!.width * 0.3, handle!.y + handle!.height / 2)
  await page.mouse.down()
  await page.mouse.move(before!.x + 2, before!.y + 110, { steps: 16 })
  await page.mouse.up()
  const after = await dockA.boundingBox()
  expect(Math.abs(after!.y - before!.y), 'the header drag moved the dock').toBeGreaterThan(60)
  // The shell's close affordance unmounts exactly ITS dock — the other
  // stands (the band compresses over the survivor).
  await arena.locator('[data-studio-dock="gallery-dock-b"] [aria-label="Close the second demo dock"]').click()
  await expect(arena.locator('[data-studio-dock]')).toHaveCount(1)
  await expect(arena.locator('[data-studio-dock="gallery-dock-a"]')).toBeVisible()
  await expect(arena.getByRole('button', { name: 'restore the closed dock' })).toBeVisible()
  await arena.getByRole('button', { name: 'restore the closed dock' }).click()
  await expect(arena.locator('[data-studio-dock]')).toHaveCount(2)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('dialogs: the resolve contract — true/false, null ≠ \'\', the T15 initial arm', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page, '&probe=layers')
  const probe = () => page.evaluate(() => (window as unknown as { __studioLayerProbe?: { layerIds(): string[] } }).__studioLayerProbe?.layerIds() ?? [])
  // The dialogs PORTAL to body level — locate them at page scope (Confirm's
  // popup class is .confirm-dialog, Prompt's is .prompt-dialog); the open
  // buttons + resolve readouts stay inside their cells.
  const confirm = (title: string) => page.locator('.confirm-dialog').filter({ hasText: title })
  const prompt = (title: string) => page.locator('.prompt-dialog').filter({ hasText: title })

  // Confirm (neutral): Escape resolves false; the confirm action resolves true.
  const neutral = cell(page, 'dialogs.confirm-neutral')
  await neutral.locator('[data-gallery-open-dialog]').click()
  const ask = confirm('Re-run the caption pass?')
  await expect(ask).toBeVisible()
  expect(await probe()).toContain('gallery-confirm')
  await page.keyboard.press('Escape')
  await expect(ask).toHaveCount(0)
  await expect(neutral.locator('[data-gallery-resolve]')).toHaveText('false')
  await neutral.locator('[data-gallery-open-dialog]').click()
  await expect(confirm('Re-run the caption pass?')).toBeVisible()
  await expect(ask.locator('.confirm-dialog-btn').last()).toHaveClass(/btn--primary/)
  await ask.locator('.confirm-dialog-btn').last().click()
  await expect(neutral.locator('[data-gallery-resolve]')).toHaveText('true')

  // Confirm (danger): the danger Button recipe on the confirm action only.
  const danger = cell(page, 'dialogs.confirm-danger')
  await danger.locator('[data-gallery-open-dialog]').click()
  const dangerAsk = confirm('Delete the dataset layer?')
  await expect(dangerAsk.locator('.confirm-dialog-btn').last()).toHaveClass(/btn--danger/)
  await expect(dangerAsk.locator('.confirm-dialog-btn').first()).toHaveClass(/btn--secondary/)
  await dangerAsk.locator('.confirm-dialog-btn').last().click()
  await expect(danger.locator('[data-gallery-resolve]')).toHaveText('true')

  // Prompt (empty): submitted-empty is '' (the caller applies it), cancel is null.
  const empty = cell(page, 'dialogs.prompt-empty')
  await empty.locator('[data-gallery-open-dialog]').click()
  const emptyAsk = prompt('Rename the layer')
  const input = emptyAsk.locator('.prompt-dialog-input')
  await expect(input).toBeFocused() // Base UI's initial focus: the first tabbable
  await expect(input).toHaveValue('')
  await input.fill('renamed layer')
  await emptyAsk.locator('.confirm-dialog-btn').last().click() // OK submits the form
  await expect(empty.locator('[data-gallery-resolve]')).toHaveText('"renamed layer"')
  await empty.locator('[data-gallery-open-dialog]').click()
  await prompt('Rename the layer').locator('.prompt-dialog-input').fill('')
  await prompt('Rename the layer').locator('.confirm-dialog-btn').last().click()
  await expect(empty.locator('[data-gallery-resolve]')).toHaveText('""')
  await empty.locator('[data-gallery-open-dialog]').click()
  await prompt('Rename the layer').locator('.confirm-dialog-btn').first().click() // Cancel aborts
  await expect(empty.locator('[data-gallery-resolve]')).toHaveText('null')

  // Prompt (prefilled) — the T15 `initial` arm's first exercised home: the
  // field opens with the prop's value verbatim.
  const prefilled = cell(page, 'dialogs.prompt-prefilled')
  await prefilled.locator('[data-gallery-open-dialog]').click()
  const prefilledInput = prompt('Rename the layer').locator('.prompt-dialog-input')
  await expect(prefilledInput).toHaveValue('vision-clip — layered')
  // Enter submits through the native form (no keydown handler).
  await prefilledInput.press('Enter')
  await expect(prefilled.locator('[data-gallery-resolve]')).toHaveText('"vision-clip — layered"')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('layer stacking: one routed Escape unwinds exactly the topmost layer', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page, '&probe=layers')
  const probe = () => page.evaluate(() => (window as unknown as { __studioLayerProbe?: { layerIds(): string[] } }).__studioLayerProbe?.layerIds() ?? [])
  const lowerAsk = page.locator('.confirm-dialog').filter({ hasText: 'Merge the reference lanes?' })
  const upperAsk = page.locator('.confirm-dialog').filter({ hasText: 'Discard the lighting lane?' })

  // Dialog over dialog: the upper registers after the lower — it IS the topmost.
  const stack = cell(page, 'layers.dialog-over-dialog')
  await stack.locator('[data-gallery-open-stack]').click()
  await expect(lowerAsk).toBeVisible()
  await page.locator('[data-gallery-open-upper]').click()
  await expect(upperAsk).toBeVisible()
  expect(await probe()).toEqual(expect.arrayContaining(['gallery-layers-lower', 'gallery-layers-upper']))
  // Escape #1: ONLY the upper ask closes.
  await page.keyboard.press('Escape')
  await expect(upperAsk).toHaveCount(0)
  await expect(lowerAsk).toBeVisible()
  // Escape #2: the lower closes.
  await page.keyboard.press('Escape')
  await expect(lowerAsk).toHaveCount(0)

  // Popover over dialog: the menu registered later — the Escape is its.
  const menuStack = cell(page, 'layers.popover-over-dialog')
  await menuStack.locator('[data-gallery-open-stack]').click()
  await expect(lowerAsk).toBeVisible()
  await page.locator('[data-gallery-open-upper]').click()
  const menu = page.locator('[data-gallery-stack-menu]')
  await expect(menu).toBeVisible()
  expect(await probe()).toEqual(expect.arrayContaining(['gallery-layers-lower', 'gallery-layers-menu']))
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(lowerAsk).toBeVisible() // the dialog survived the press
  await page.keyboard.press('Escape')
  await expect(lowerAsk).toHaveCount(0)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// (C02, Codex code audit 2026-10-05) Focus containment at the cardinality
// edges, driven for real on the gallery's row-count exhibits: a hook-owned
// overlay with ONE enabled control used to hand Tab to the browser (focus
// escaped to the background), and an EMPTY one did the same. Now Tab from
// the single control cycles back to it, and with zero tabbables focus
// stays on the panel — through Shift+Tab too.
test('popover containment at the edges: one tabbable cycles to itself, zero keep the panel (C02)', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)

  // ONE enabled row (the two disabled rows prove the tabbable count is real).
  const one = cell(page, 'popover.present-one')
  await one.locator('[data-gallery-open-menu]').click()
  const menuOne = page.locator('[data-gallery-menu][data-gallery-menu-rows="one"]')
  await expect(menuOne).toBeVisible()
  const enabledRow = menuOne.locator('.gallery-menu-row:not([disabled])')
  await expect(enabledRow).toHaveCount(1)
  // Tab enters the single control from the panel…
  await page.keyboard.press('Tab')
  await expect(enabledRow).toBeFocused()
  // …every further Tab cycles back to it — focus NEVER escapes the surface…
  for (let index = 0; index < 3; index += 1) await page.keyboard.press('Tab')
  await expect(enabledRow).toBeFocused()
  // …and Shift+Tab wraps onto the same control from the other direction.
  await page.keyboard.press('Shift+Tab')
  await expect(enabledRow).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menuOne).toHaveCount(0)

  // ZERO enabled rows: the panel itself holds focus through both directions.
  const none = cell(page, 'popover.present-none')
  await none.locator('[data-gallery-open-menu]').click()
  const menuNone = page.locator('[data-gallery-menu][data-gallery-menu-rows="none"]')
  await expect(menuNone).toBeVisible()
  await expect(menuNone.locator('.gallery-menu-row:not([disabled])')).toHaveCount(0)
  await expect(menuNone).toBeFocused() // focus entered the panel on open
  for (const key of ['Tab', 'Shift+Tab']) {
    await page.keyboard.press(key)
    await expect(menuNone).toBeFocused() // containment: never leaves the panel
  }
  await page.keyboard.press('Escape')
  await expect(menuNone).toHaveCount(0)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// (C03, Codex code audit 2026-10-05) ChipGroup's arrow traversal included
// disabled chips and called onChange before focus, so an arrow toward a
// disabled neighbor SELECTED it while focus could not move onto it. The
// disabled member is excluded from traversal AND from the initial tab-stop
// selection; selection and focus are asserted TOGETHER.
test('chip group: a disabled member is excluded from traversal and the initial tab stop (C03)', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  const group = cell(page, 'chip-group.radiogroup-disabled')
  const radios = group.locator('[data-chip-value]')
  await expect(radios).toHaveCount(3)
  // The FIRST member is disabled: the roving tab stop is the first AVAILABLE
  // chip, never the disabled one.
  await expect(radios.nth(0)).toBeDisabled()
  expect(await radios.nth(0).evaluate((element) => element.tabIndex)).toBe(-1)
  expect(await radios.nth(1).evaluate((element) => element.tabIndex)).toBe(0)
  expect(await radios.nth(2).evaluate((element) => element.tabIndex)).toBe(-1)
  // ArrowLeft from a SELECTED enabled radio toward the disabled neighbor:
  // the walk SKIPS it — selection AND focus land on audio together, and the
  // disabled chip is left with neither. (Selecting image first: with
  // nothing selected the arrows ENTER at the first available member — the
  // native radiogroup idiom — which is not the traversal under test.)
  await radios.nth(1).click()
  await expect(group.locator('[data-gallery-chip-value]')).toHaveAttribute('data-gallery-chip-value', 'image')
  await group.locator('[role="radiogroup"]').press('ArrowLeft')
  await expect(group.locator('[data-gallery-chip-value]')).toHaveAttribute('data-gallery-chip-value', 'audio')
  await expect(radios.nth(2)).toBeFocused()
  await expect(radios.nth(0)).not.toBeFocused()
  // ArrowRight from audio wraps to image — video is never selected.
  await group.locator('[role="radiogroup"]').press('ArrowRight')
  await expect(group.locator('[data-gallery-chip-value]')).toHaveAttribute('data-gallery-chip-value', 'image')
  await expect(radios.nth(1)).toBeFocused()
  // A traversal pass never leaves the disabled member checked.
  await group.locator('[role="radiogroup"]').press('ArrowLeft')
  await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'false')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// (V01, Codex visual audit 2026-10-05) Paint order must agree with
// registered ownership: a menu mounted INSIDE a modal dialog registered
// topmost but painted UNDER the parent (.canvas-menu-backdrop z-60 <
// --z-modal 70) — the parent's confirm-dialog swallowed the menu's hit
// area. toBeVisible() does NOT prove unobscured: the assertion is REAL hit
// testing (elementFromPoint at the row's center) plus a real coordinate
// click landing in the menu's own handler, and the paint tiers compared.
test('layers: a menu over a modal dialog paints above it — hit testing reaches the menu rows (V01)', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page, '&probe=layers')
  const probe = () => page.evaluate(() => (window as unknown as { __studioLayerProbe?: { layerIds(): string[] } }).__studioLayerProbe?.layerIds() ?? [])
  const menuStack = cell(page, 'layers.popover-over-dialog')
  await menuStack.locator('[data-gallery-open-stack]').click()
  const lowerAsk = page.locator('.confirm-dialog').filter({ hasText: 'Merge the reference lanes?' })
  await expect(lowerAsk).toBeVisible()
  await page.locator('[data-gallery-open-upper]').click()
  const menu = page.locator('[data-gallery-stack-menu]')
  await expect(menu).toBeVisible()
  expect(await probe()).toEqual(expect.arrayContaining(['gallery-layers-lower', 'gallery-layers-menu']))
  // REAL hit testing at the row's center: the topmost element there must be
  // the menu's own row (Codex's proof shape — the parent's confirm-dialog
  // used to take the hit).
  const row = menu.locator('.gallery-menu-row').first()
  const hit = await row.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    if (target === element || (target instanceof Node && element.contains(target))) return 'menu'
    return target ? `${target.tagName}.${String(target.className).slice(0, 40)}` : 'nothing'
  })
  expect(hit, 'elementFromPoint at the row center resolves INTO the menu, not the parent dialog').toBe('menu')
  // The paint tiers: the menu's backdrop sits above the dialog's --z-modal
  // band (while consent stays the contract's topmost tier).
  const tiers = await page.evaluate(() => {
    const backdrop = document.querySelector('.canvas-menu-backdrop')
    const dialog = document.querySelector('.modal-backdrop')
    if (!(backdrop instanceof HTMLElement) || !(dialog instanceof HTMLElement)) return null
    return { menu: getComputedStyle(backdrop).zIndex, dialog: getComputedStyle(dialog).zIndex, consent: getComputedStyle(document.documentElement).getPropertyValue('--z-consent').trim() }
  })
  expect(tiers, 'both paint surfaces exist').not.toBeNull()
  expect(Number(tiers!.menu), `the menu backdrop (${tiers!.menu}) paints above the dialog (${tiers!.dialog})`).toBeGreaterThan(Number(tiers!.dialog))
  expect(Number(tiers!.menu), `the menu backdrop (${tiers!.menu}) stays under the consent tier (${tiers!.consent})`).toBeLessThan(Number(tiers!.consent))
  // CLICKABILITY: a real coordinate click on the row lands in the MENU's own
  // handler — the menu closes through its onClose while the dialog survives.
  const rowBox = await row.boundingBox()
  expect(rowBox).not.toBeNull()
  await page.mouse.click(rowBox!.x + rowBox!.width / 2, rowBox!.y + rowBox!.height / 2)
  await expect(menu).toHaveCount(0)
  await expect(lowerAsk).toBeVisible()
  // The visual evidence of the open state (the fix round's re-capture).
  await page.locator('[data-gallery-open-upper]').click()
  await expect(page.locator('[data-gallery-stack-menu]')).toBeVisible()
  await page.screenshot({ path: 'test-results/codex-fix-round-2026-10-05/v01-menu-over-dialog.png' })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(lowerAsk).toHaveCount(0)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// (V02, Codex visual audit 2026-10-05) The radio exhibit omitted its surface
// geometry (browser-default rectangles) and the video chip was permanently
// accent-toned — two choices looked highlighted. The geometry class rides
// every radio, peers share ONE rest tone, and selection reads against it;
// two different selections are captured.
test('radio chips carry the gallery geometry and a consistent rest tone — selection reads (V02)', async ({ page }) => {
  const problems = await trackErrors(page)
  await bootGallery(page)
  const group = cell(page, 'chip-group.radiogroup-none')
  const radios = group.locator('[data-chip-value]')
  await expect(radios).toHaveCount(3)
  // The displayed SHAPE: the gallery-chip pill geometry on every radio (the
  // browser-default rectangle is the defect).
  for (let index = 0; index < 3; index += 1) {
    const shape = await radios.nth(index).evaluate((element) => ({ radius: getComputedStyle(element).borderRadius, padding: getComputedStyle(element).paddingTop }))
    expect(shape.radius, `radio ${index} renders the gallery-chip pill radius`).toBe('999px')
    expect(shape.padding, `radio ${index} renders the gallery-chip vertical padding`).toBe('5px')
  }
  // ONE consistent rest tone: no peer is pre-highlighted with nothing chosen.
  const restBorders: string[] = []
  for (let index = 0; index < 3; index += 1) restBorders.push(await radios.nth(index).evaluate((element) => getComputedStyle(element).borderTopColor))
  expect(new Set(restBorders).size, 'all three peers paint the same resting border').toBe(1)
  // Selection reads: the chosen chip's paint leaves that rest tone…
  await radios.nth(1).click() // image
  await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true')
  expect(await radios.nth(1).evaluate((element) => getComputedStyle(element).borderTopColor)).not.toBe(restBorders[0])
  expect(await radios.nth(0).evaluate((element) => getComputedStyle(element).borderTopColor), 'the unselected peers keep the rest tone').toBe(restBorders[0])
  await page.screenshot({ path: 'test-results/codex-fix-round-2026-10-05/v02-chip-group-image-selected.png' })
  // …and a DIFFERENT selection reads the same way (exclusivity, visual).
  await radios.nth(2).click() // audio
  await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true')
  await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'false')
  expect(await radios.nth(2).evaluate((element) => getComputedStyle(element).borderTopColor)).not.toBe(restBorders[0])
  await page.screenshot({ path: 'test-results/codex-fix-round-2026-10-05/v02-chip-group-audio-selected.png' })
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})
