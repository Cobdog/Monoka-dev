import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Dataset manager v1 (sv14rt0, docs/specs/dataset-manager-v1.md §11/§12):
// the workbench surface end to end at ?datasets=1 — gallery from a real
// ingested source, the stamp-crop editor's interaction contract (aspect
// spectrum chips + the never-loops hard-stop hint + the 32-grid readout),
// layer save, the caption editor's live trigger validation, the dashboard's
// per-trainer preflight, and the export wizard's honest empty-selection
// refusal. Engine-independent (the media is a synthetic ffmpeg clip), and
// every test attaches the console/page-error guard like app.spec.ts.

const exec = promisify(execFile)

const environmental = (entry: string) =>
  entry.includes('Failed to load resource')
  || /WebSocket connection to .* failed/.test(entry)
  || /Connecting to 'blob:.*' violates the following Content Security Policy directive: "connect-src/.test(entry)

async function trackErrors(page: Page) {
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`)
  })
  return problems
}

async function seedLibrary(request: APIRequestContext) {
  // One synthetic 480×832 24 fps clip, ingested by reference through the
  // same HTTP surface a real client uses. The fixture lives INSIDE the
  // server's studio home (test-home) — by-reference ingest is scope-gated
  // (security wave 2) — and the file stays put (the source is sacred).
  const home = join(process.cwd(), 'test-home')
  mkdirSync(home, { recursive: true })
  const dir = mkdtempSync(join(home, 'ds-e2e-'))
  const clip = join(dir, 'e2e-clip.mp4')
  await exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=duration=3:size=480x832:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip])
  const response = await request.post('/api/lan/datasets/ingest/reference', { data: { path: clip } })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  expect(body.source.probe.width).toBe(480)
  // Wait for the async decode probe (required before layers bake; the UI
  // polls, the test just gives it a beat).
  await expect
    .poll(async () => {
      const library = await (await request.get('/api/lan/datasets/library')).json()
      return library.sources.find((source: { id: string }) => source.id === body.source.id)?.probeState
    }, { timeout: 15_000 })
    .toBe('done')
  return body.source.id as string
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw new Error(`Uncaught renderer error during navigation: ${error.message}`)
  })
})

// Shared-home isolation (Wave 4 test hygiene, the fh94g76 flake): the e2e
// home persists across runs, and the seed clips are byte-DETERMINISTIC
// (ffmpeg testsrc2) — every run's ingest dedupes onto the SAME source row,
// so layers accumulate on one master until an old 4:3 layer becomes the
// list's `.first()` and an aspect chip reads already-active+disabled. Every
// run now starts from a clean dataset slate, cleaned through the app's OWN
// API (trash the seeded sources, then empty the trash) — never by hand.
test.beforeAll(async ({ request }) => {
  const library = await (await request.get('/api/lan/datasets/library')).json() as {
    sources?: Array<{ id: string; absPath?: string }>
    trashed?: { sources?: Array<{ id: string; absPath?: string }> }
  }
  const seeded = (row: { id: string; absPath?: string }) => /e2e-(clip|still)\.(mp4|png)/.test(row.absPath ?? '')
  for (const row of [...(library.sources ?? []), ...(library.trashed?.sources ?? [])]) {
    if (seeded(row)) await request.post('/api/lan/datasets/sources/trash', { data: { sourceId: row.id } }).catch(() => undefined)
  }
  await request.post('/api/lan/datasets/trash/empty', { data: {} }).catch(() => undefined)
})

/** One synthetic 512² still, ingested by reference (the app-tour wave's
 * poll-terminus coverage — images resolve their probe facts at ingest). */
async function seedStill(request: APIRequestContext) {
  const home = join(process.cwd(), 'test-home')
  mkdirSync(home, { recursive: true })
  const dir = mkdtempSync(join(home, 'ds-e2e-'))
  const still = join(dir, 'e2e-still.png')
  await exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=duration=1:size=512x512:rate=24', '-frames:v', '1', still])
  const response = await request.post('/api/lan/datasets/ingest/reference', { data: { path: still } })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  return body.source.id as string
}

test('the workbench boots at ?datasets=1 with the seeded master in the gallery', async ({ page }) => {
  const problems = await trackErrors(page)
  const sourceId = await seedLibrary(page.request)
  await page.goto('/?datasets=1')
  await expect(page.locator('[data-ds-root]')).toBeVisible()
  await expect(page.locator('[data-ds-gallery]')).toBeVisible()
  const master = page.locator(`[data-ds-master][data-health="healthy"]`, { hasText: 'e2e-clip' }).first()
  await expect(master).toBeVisible({ timeout: 10_000 })
  await expect(master.locator('.ds-master-facts')).toContainText('480×832')
  // The empty state is gone and the shared surface switcher is present with
  // the canvas reachable (QOL wave rrxlw2r — the registry-driven switcher
  // replaced the old one-way "← canvas" chip).
  await expect(page.locator('[data-ds-empty]')).toHaveCount(0)
  await expect(page.locator('[data-surface-switcher] [data-surface="canvas"]')).toBeVisible()
  // No renderer errors beyond the known environmental set.
  await expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  void sourceId
})

test('the stamp-crop editor: aspect spectrum, hard-stop hint, 32-grid crop, save', async ({ page }) => {
  await seedLibrary(page.request)
  await page.goto('/?datasets=1')
  const master = page.locator('[data-ds-master]', { hasText: 'e2e-clip' }).first()
  await expect(master).toBeVisible({ timeout: 10_000 })
  await master.getByRole('button', { name: /layer/ }).first().click()
  await expect(page.locator('[data-ds-editor]')).toBeVisible()
  // The managed spectrum renders the officials, widest → tallest.
  const strip = page.locator('[data-ds-aspect-strip]')
  await expect(strip).toBeVisible()
  for (const label of ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']) {
    await expect(strip.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  // Fix round 1 (I1): the selected aspect chip keeps its SURFACE bold —
  // font is P06 surface territory, so the state fold that deleted
  // .ds-aspect-chip.active must not lose it — and the selected TONE renders
  // through the recipe (computed style, both).
  const selectedAspect = strip.locator('button.chip--selected')
  await expect(selectedAspect).toHaveCount(1)
  const aspectRender = await selectedAspect.evaluate((element) => ({ weight: getComputedStyle(element).fontWeight, border: getComputedStyle(element).borderTopColor }))
  const expectedAspectTone = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.borderTopColor = 'color-mix(in srgb, var(--accent) 48%, transparent)'
    document.body.appendChild(probe)
    const border = getComputedStyle(probe).borderTopColor
    probe.remove()
    return border
  })
  expect(aspectRender.weight).toBe('700')
  expect(aspectRender.border).toBe(expectedAspectTone)
  // Default is 16:9-class; the crop readout shows 32-grid values.
  await expect(page.locator('.ds-crop-readout')).toContainText(/w \d+ · h \d+/)
  // shift+scroll at the BOTTOM edge: the hard-stop hint appears (the
  // spectrum never loops — spec §3).
  const stage = page.locator('[data-ds-stage]')
  await strip.getByRole('button', { name: '9:16', exact: true }).click()
  await stage.click({ position: { x: 200, y: 200 } })
  for (let index = 0; index < 3; index += 1) {
    await stage.hover()
    await page.keyboard.down('Shift')
    await page.mouse.wheel(0, 240)
    await page.keyboard.up('Shift')
  }
  await expect(page.locator('.ds-status', { hasText: /hard stop/i }).first()).toBeVisible({ timeout: 5_000 })
  // Save a layer; it lands as a visible child with a bucket badge.
  await page.locator('[data-ds-save-layer]').click()
  await expect(page.locator('[data-ds-editor]')).toHaveCount(0)
  await master.locator('.ds-master-name').click() // expand to see the children
  const layer = page.locator('[data-ds-layer]').first()
  await expect(layer).toBeVisible({ timeout: 10_000 })
  await expect(layer.locator('.ds-bucket-badge')).toBeVisible()
})

test('the caption editor: live trigger validation and the stale badge flow', async ({ page }) => {
  await seedLibrary(page.request)
  await page.request.post('/api/lan/datasets/settings', { data: { triggerToken: 'ph0t0r34l', contentClass: 'style' } })
  await page.goto('/?datasets=1')
  const master = page.locator('[data-ds-master]', { hasText: 'e2e-clip' }).first()
  await expect(master).toBeVisible({ timeout: 10_000 })
  await master.getByRole('button', { name: /layer/ }).first().click()
  await page.locator('[data-ds-save-layer]').click()
  await master.locator('.ds-master-name').click() // expand to see the children
  await expect(page.locator('[data-ds-layer]').first()).toBeVisible({ timeout: 10_000 })
  // Open the caption editor; type a caption missing the trigger first.
  await page.locator('[data-ds-layer]').first().getByRole('button', { name: 'caption' }).click()
  await expect(page.locator('[data-ds-caption]')).toBeVisible()
  const textarea = page.locator('[data-ds-caption-textarea]')
  await textarea.fill('a colorful test pattern drifting slowly; no audible sound')
  await expect(page.locator('[data-ds-validation]')).toContainText(/trigger/i, { timeout: 5_000 })
  await textarea.fill('ph0t0r34l, a colorful test pattern drifting slowly; no audible sound')
  await expect(page.locator('[data-ds-validation-ok]')).toBeVisible({ timeout: 5_000 })
  await page.locator('[data-ds-save-caption]').click()
  await expect(page.locator('.ds-status', { hasText: 'Saved' })).toBeVisible()
  // Editing the crop afterwards flags the caption stale (§4).
  await page.locator('[data-ds-caption] .ds-btn.btn--ghost', { hasText: 'Close' }).click()
  await page.locator('[data-ds-layer]').first().getByRole('button', { name: 'crop/trim' }).click()
  // (2026-09-28) The aspect change must pick a chip that is NOT the layer's
  // current aspect — an already-active chip renders disabled and the click
  // hangs (the documented `.first()` fragility when a sibling layer from an
  // earlier seed already carries that aspect). 16:9 is never the 9:16
  // source's default nor the 4:3 flake case's active chip.
  const aspectStrip = page.locator('[data-ds-aspect-strip]')
  const preferred = aspectStrip.getByRole('button', { name: '16:9', exact: true })
  if (await preferred.isEnabled()) await preferred.click()
  else await aspectStrip.getByRole('button', { name: '4:3', exact: true }).click()
  await page.locator('[data-ds-save-layer]').click()
  await expect(page.locator('[data-ds-layer] .ds-stale-badge').first()).toBeVisible({ timeout: 10_000 })
})

test('the dashboard renders both trainer preflight profiles; export refuses honestly with no selection', async ({ page }) => {
  await seedLibrary(page.request)
  await page.goto('/?datasets=1')
  await page.getByRole('button', { name: 'dashboard' }).click()
  await expect(page.locator('[data-ds-dashboard]')).toBeVisible()
  await expect(page.locator('[data-ds-preflight]')).toBeVisible()
  await expect(page.locator('[data-ds-preflight-card]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-ds-preflight-card]')).toContainText('DiffSynX')
  await expect(page.locator('[data-ds-preflight-card]')).toContainText('musubi')
  await expect(page.locator('[data-ds-preflight-card]')).toContainText(/binds:/)
  await expect(page.locator('[data-ds-guidance]')).toBeVisible()
  // Export with nothing selected surfaces the honest error, not a silent pass.
  await page.getByRole('button', { name: 'export' }).click()
  await expect(page.locator('[data-ds-export]')).toBeVisible()
  await page.locator('[data-ds-run-export]').click()
  await expect(page.locator('[data-ds-error]')).toContainText(/No layers selected/i)
})

test('the surface switcher carries the datasets entry from the canvas (QOL wave rrxlw2r)', async ({ page }) => {
  await page.request.post('/api/lan/documents/session', { data: { openProjects: [], activeProject: null } })
  await page.goto('/')
  // The old launcher chip was RETIRED when the registry-driven titlebar
  // switcher landed (2026-09-18) — one entry point per surface, in the
  // shared chrome every surface carries.
  await expect(page.locator('[data-canvas-chip="datasets"]')).toHaveCount(0)
  await expect(page.locator('[data-surface-switcher] [data-surface="datasets"]')).toBeVisible()
})

// ---------------------------------------------------------------------------
// App-tour UX fix wave (d6iy68r) — the adversarial review's datasets findings:
// the forever-poll terminus, the vanishing error banner, the crop-editor
// scroll deadlock below the 32-grid floor, and Escape on the overlays.

test('an ingested still settles its probe state — the library poll terminates (no forever-fetch)', async ({ page }) => {
  const problems = await trackErrors(page)
  await seedLibrary(page.request)
  await seedStill(page.request)
  // A below-floor still: refused at import — its chip must carry the
  // server's detailed reason (app-tour wave d6iy68r, review M6), and it
  // too must settle its probe state. Content identity is the hash, so a
  // re-run on the shared home DEDUPES into the earlier run's source — the
  // ingest response then carries no refusal field, but the refused row and
  // its reason live on in the library; the DOM assertions below are the
  // truth either way (the accumulation trap testing.md documents).
  const home = join(process.cwd(), 'test-home')
  const tinyDir = mkdtempSync(join(home, 'ds-e2e-'))
  const tinyStill = join(tinyDir, 'e2e-tiny-still.png')
  await exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=duration=1:size=200x200:rate=24', '-frames:v', '1', tinyStill])
  await page.request.post('/api/lan/datasets/ingest/reference', { data: { path: tinyStill } })
  await page.goto('/?datasets=1')
  const stillMaster = page.locator('[data-ds-master]', { hasText: 'e2e-still' }).first()
  await expect(stillMaster).toBeVisible({ timeout: 10_000 })
  // The still never counts as probe-pending: no "probing…" flag renders for it.
  await expect(stillMaster.locator('.ds-master-flag', { hasText: /probing/ })).toHaveCount(0)
  // The refusal chip explains itself (the full server reason rides the
  // title — the same honesty the crop editor gives at crop-time).
  const refusedMaster = page.locator('[data-ds-master]', { hasText: 'e2e-tiny-still' }).first()
  await expect(refusedMaster).toBeVisible({ timeout: 10_000 })
  await expect(refusedMaster.locator('.ds-master-flag', { hasText: 'refused at import' })).toHaveAttribute('title', /256²/)
  // The poll terminus, observed on the wire: after the initial load, ZERO
  // further library fetches for >2 poll cycles (1.5 s each). Before the
  // server-side fix the still sat 'pending' forever and this count grew
  // every 1.5 s — two requests per cycle, sustained for the session's life.
  let libraryFetches = 0
  page.on('request', (request) => {
    if (request.url().includes('/api/lan/datasets/library')) libraryFetches += 1
  })
  await page.waitForTimeout(3400)
  expect(libraryFetches).toBe(0)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('error banners survive the background poll — action failures stay readable', async ({ page }) => {
  const problems = await trackErrors(page)
  // A LONG clip keeps its decode probe pending through the assertion window
  // (the poll runs only while a video probe is pending — the exact condition
  // that used to wipe the banner on every successful refresh).
  const home = join(process.cwd(), 'test-home')
  mkdirSync(home, { recursive: true })
  const dir = mkdtempSync(join(home, 'ds-e2e-'))
  const longClip = join(dir, 'e2e-long.mp4')
  await exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=duration=120:size=480x832:rate=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', longClip])
  const ingested = await (await page.request.post('/api/lan/datasets/ingest/reference', { data: { path: longClip } })).json()
  // A layer exists and is selectable; the trigger token is UNSET so the
  // first export attempt must refuse at the gates (the review's repro).
  await page.request.post('/api/lan/datasets/settings', { data: { triggerToken: '', contentClass: 'style' } })
  await page.request.post('/api/lan/datasets/layers', { data: { sourceId: ingested.source.id, name: 'banner-layer' } })
  await page.goto('/?datasets=1')
  const master = page.locator('[data-ds-master]', { hasText: 'e2e-long' }).first()
  await expect(master).toBeVisible({ timeout: 10_000 })
  await master.locator('.ds-master-name').click() // expand to see the layer
  const layer = master.locator('[data-ds-layer]', { hasText: 'banner-layer' }).first()
  await expect(layer).toBeVisible()
  await layer.locator('.ds-layer-select').click()
  await page.locator('.ds-tab', { hasText: 'export' }).click()
  await page.locator('[data-ds-run-export]').click()
  await expect(page.locator('[data-ds-error]')).toContainText(/refuse/i, { timeout: 10_000 })
  // Two-plus poll cycles pass with background refreshes succeeding while
  // the probe is still pending — the banner must SURVIVE them (before the
  // fix it vanished within ~1.5 s, faster than a human could read it).
  await page.waitForTimeout(3400)
  await expect(page.locator('[data-ds-error]')).toBeVisible()
  await expect(page.locator('[data-ds-error]')).toContainText(/refuse/i)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('the crop editor scroll-resize never strands below the grid floor (the 256×256 deadlock)', async ({ page }) => {
  await seedLibrary(page.request)
  await page.goto('/?datasets=1')
  const master = page.locator('[data-ds-master]', { hasText: 'e2e-clip' }).first()
  await expect(master).toBeVisible({ timeout: 10_000 })
  await master.getByRole('button', { name: /layer/ }).first().click()
  await expect(page.locator('[data-ds-editor]')).toBeVisible()
  const stage = page.locator('[data-ds-stage]')
  const readoutHeight = async () => {
    const text = await page.locator('.ds-crop-readout').innerText()
    return Number(/h (\d+)/.exec(text)?.[1] ?? 0)
  }
  // Shrink deep into the sub-267 px zone where a 6 % multiplicative tick is
  // smaller than one 32 px grid step. The old code re-snapped EVERY tick
  // from the previous snapped value, so 256 (and 192, 160…) were fixed
  // points — the review measured 15+ ticks with zero change.
  for (let index = 0; index < 9; index += 1) {
    await stage.hover()
    await page.mouse.wheel(0, 200)
  }
  const plateau = await readoutHeight()
  for (let index = 0; index < 5; index += 1) {
    await stage.hover()
    await page.mouse.wheel(0, 200)
  }
  const shrunkFurther = await readoutHeight()
  expect(shrunkFurther).toBeLessThan(plateau)
  // Growth un-strands too: scrolling back up must grow it again.
  for (let index = 0; index < 3; index += 1) {
    await stage.hover()
    await page.mouse.wheel(0, -200)
  }
  const grown = await readoutHeight()
  expect(grown).toBeGreaterThan(shrunkFurther)
})

// (A09, Codex audit 2026-10-02 — standing C2/C10) The crop editor was a
// nameless non-dialog whose Tab walked the background controls, and the crop
// geometry was pointer-only (drag/scroll). This pins the dialog semantics,
// focus containment, and the keyboard geometry path.
test('the crop editor is a named, focus-contained dialog with keyboard-settable geometry (A09)', async ({ page }) => {
  await seedLibrary(page.request)
  await page.goto('/?datasets=1')
  const master = page.locator('[data-ds-master]', { hasText: 'e2e-clip' }).first()
  await expect(master).toBeVisible({ timeout: 10_000 })
  await master.getByRole('button', { name: /layer/ }).first().click()
  const overlay = page.locator('[data-ds-editor]')
  const panel = page.locator('.ds-editor')
  await expect(overlay).toBeVisible()

  // Dialog semantics: role + modal + named by the visible heading.
  await expect(panel).toHaveAttribute('role', 'dialog')
  await expect(panel).toHaveAttribute('aria-modal', 'true')
  await expect(panel).toHaveAttribute('aria-labelledby', 'ds-editor-title')
  await expect(page.locator('#ds-editor-title')).toContainText('New layer')

  // Focus containment (C2): focus moves INTO the dialog on open, and Tab
  // stays inside no matter how far it walks (it used to travel the
  // background gallery controls).
  await expect(panel).toBeFocused()
  for (let index = 0; index < 30; index += 1) await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.closest('[data-ds-editor]') ?? null)).not.toBeNull()

  // Keyboard geometry (C10): the numeric fields set the crop — the 480×832
  // seed snaps to the 32-grid, so 256 and 224 land exactly.
  await page.locator('[data-ds-crop-field="w"]').fill('256')
  await page.locator('[data-ds-crop-field="w"]').blur()
  await page.locator('[data-ds-crop-field="x"]').fill('224')
  await page.locator('[data-ds-crop-field="x"]').blur()
  await expect(page.locator('.ds-crop-readout')).toContainText('x 224')
  await expect(page.locator('.ds-crop-readout')).toContainText('w 256')
  // The rect follows (the visual stage reflects the keyboard edit).
  await expect(page.locator('[data-ds-crop-rect]')).toBeVisible()

  // Escape still closes (the standing behavior, kept).
  await page.keyboard.press('Escape')
  await expect(overlay).toHaveCount(0)
})

// (F03, followup Codex audit 2026-10-03) The crop fields reused the
// DIMENSION minimum (32) for coordinates, so x=0/y=0 snapped to 32 — the
// top-left corner was un-enterable. And Enter committed by BLURRING to the
// body, stranding keyboard focus outside the dialog.
test('crop coordinates accept zero and Enter keeps focus inside the dialog (F03)', async ({ page }) => {
  await seedLibrary(page.request)
  await page.goto('/?datasets=1')
  const master = page.locator('[data-ds-master]', { hasText: 'e2e-clip' }).first()
  await expect(master).toBeVisible({ timeout: 10_000 })
  await master.getByRole('button', { name: /layer/ }).first().click()
  await expect(page.locator('[data-ds-editor]')).toBeVisible()
  // X=0 commits AS ZERO (dimensions keep their positive 32 floor). Shrink the
  // width first so the x coordinate has room to move — the seed crop is
  // full-frame, where x is pinned to 0 by the frame bound either way.
  const width = page.locator('[data-ds-crop-field="w"]')
  await width.fill('256')
  await width.blur()
  const field = page.locator('[data-ds-crop-field="x"]')
  await field.fill('0')
  await field.press('Enter')
  await expect(page.locator('.ds-crop-readout')).toContainText('x 0')
  // Enter commits WITHOUT blurring to the body — focus stays in the dialog.
  expect(await page.evaluate(() => document.activeElement?.closest('[data-ds-editor]') ?? null)).not.toBeNull()
  await expect(field).toBeFocused()
})

// (R4, round-3 escalation 2026-10-03) An Enter commit that CHANGES the value
// used to remount the key-synced input (the label key carried the value), so
// focus fell to BODY mid-dialog. The fields are controlled-with-draft now
// (the camera time field's idiom): no remount on the field's own commits.
test('a value-changing Enter commit keeps focus inside the crop dialog — no remount (R4)', async ({ page }) => {
  await seedLibrary(page.request)
  await page.goto('/?datasets=1')
  const master = page.locator('[data-ds-master]', { hasText: 'e2e-clip' }).first()
  await expect(master).toBeVisible({ timeout: 10_000 })
  await master.getByRole('button', { name: /layer/ }).first().click()
  await expect(page.locator('[data-ds-editor]')).toBeVisible()
  const width = page.locator('[data-ds-crop-field="w"]')
  await width.fill('256')
  await width.blur()
  const field = page.locator('[data-ds-crop-field="x"]')
  // An UNCHANGED commit (x stays 0) keeps focus — the F03 pin.
  await field.fill('0')
  await field.press('Enter')
  await expect(page.locator('.ds-crop-readout')).toContainText('x 0')
  await expect(field).toBeFocused()
  // A CHANGING commit (0 → 64): the value lands AND the field keeps focus.
  await field.fill('64')
  await field.press('Enter')
  await expect(page.locator('.ds-crop-readout')).toContainText('x 64')
  expect(await page.evaluate(() => document.activeElement?.closest('[data-ds-editor]') ?? null)).not.toBeNull()
  await expect(field).toBeFocused()
  // The blur-commit path is unchanged: an unfocused edit still lands (focus
  // naturally leaves the field on blur — the pin is the VALUE).
  await field.fill('96')
  await field.blur()
  await expect(page.locator('.ds-crop-readout')).toContainText('x 96')
})

test('the crop editor and caption panel answer Escape (one press, one action)', async ({ page }) => {
  await seedLibrary(page.request)
  await page.goto('/?datasets=1')
  const master = page.locator('[data-ds-master]', { hasText: 'e2e-clip' }).first()
  await expect(master).toBeVisible({ timeout: 10_000 })
  // Crop editor: Escape closes it (Close was the only exit before).
  await master.getByRole('button', { name: /layer/ }).first().click()
  await expect(page.locator('[data-ds-editor]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-ds-editor]')).toHaveCount(0)
  // A saved layer gives the caption phase its subject (the default full-frame
  // stamp, same as the aspect-spectrum test's save).
  await master.getByRole('button', { name: /layer/ }).first().click()
  await expect(page.locator('[data-ds-editor]')).toBeVisible()
  await page.locator('[data-ds-save-layer]').click()
  await expect(page.locator('[data-ds-editor]')).toHaveCount(0)
  // Caption panel: Escape closes the panel — but the inner VLM modal owns
  // the FIRST press while it is open.
  await master.locator('.ds-master-name').click()
  const layer = page.locator('[data-ds-layer]').first()
  await expect(layer).toBeVisible()
  await layer.getByRole('button', { name: 'caption' }).click()
  await expect(page.locator('[data-ds-caption]')).toBeVisible()
  await page.locator('[data-ds-caption] .ds-btn.btn--ghost', { hasText: 'VLM' }).click()
  await expect(page.locator('[data-ds-vlm]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-ds-vlm]')).toHaveCount(0)
  await expect(page.locator('[data-ds-caption]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-ds-caption]')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Audit remediation (k8y5hzk) — the Codex webui audit's two dataset dead-ends
// (docs/audit/codex-webui-audit-2026-10-02.md A06/A07): a real image died
// client-side before upload, and a fresh dataset could never satisfy the
// export gate.

test('LAN upload ingests a real-sized still through the UI path (A06)', async ({ page }) => {
  const problems = await trackErrors(page)
  // The audit's repro: a valid 512² PNG (730,183 bytes) yielded "0 imported,
  // Refusals: 1" with "Maximum call stack size exceeded" — the whole buffer
  // was spread into String.fromCharCode arguments and died before any request
  // left the page. The fixture here is the same class of file: a >500 KB
  // valid PNG (noise defeats PNG's deflate), byte-deterministic, so re-runs
  // content-dedupe onto the same source row instead of accumulating.
  const home = join(process.cwd(), 'test-home')
  mkdirSync(home, { recursive: true })
  const dir = mkdtempSync(join(home, 'ds-e2e-'))
  const bigStill = join(dir, 'e2e-upload.png')
  await exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=duration=1:size=512x512:rate=24', '-vf', 'noise=alls=100:allf=t', '-frames:v', '1', bigStill])
  expect((await stat(bigStill)).size).toBeGreaterThan(500 * 1024)
  await page.goto('/?datasets=1')
  await expect(page.locator('[data-ds-root]')).toBeVisible()
  await page.setInputFiles('input[type="file"]', bigStill)
  await expect(page.locator('[data-ds-notice]')).toContainText('1 imported', { timeout: 20_000 })
  // (A10) The datasets family's helper floor is pinned like the workbench's:
  // the notice is decision prose, computed style >= 11px.
  const noticeSize = await page.locator('[data-ds-notice]').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
  expect(noticeSize, 'ds-notice renders at the >=11px floor').toBeGreaterThanOrEqual(11)
  await expect(page.locator('[data-ds-notice]')).not.toContainText('Refusals')
  await expect(page.locator('[data-ds-error]')).toHaveCount(0)
  await expect(page.locator('[data-ds-master]', { hasText: 'e2e-upload.png' }).first()).toBeVisible({ timeout: 10_000 })
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('the fresh-user export cycle: the trigger is settable in the wizard and the export passes the gate (A07)', async ({ page }) => {
  const problems = await trackErrors(page)
  const runId = Date.now().toString(36)
  // Fresh state — the audit's A07 repro: the titlebar's "trigger: (unset)"
  // was a static display with no control behind it (datasetsApi.saveSettings
  // had no UI caller), so the export gate could never be satisfied.
  await page.request.post('/api/lan/datasets/settings', { data: { triggerToken: '', contentClass: 'style' } })
  const sourceId = await seedStill(page.request)
  const layer = (await (await page.request.post('/api/lan/datasets/layers', { data: { sourceId, name: 'trigger-layer' } })).json()).layer
  await page.request.post('/api/lan/datasets/captions', { data: { layerId: layer.id, text: `ph0t0r34l, a colorful test pattern drifting slowly; no audible sound (${runId})` } })
  await page.goto('/?datasets=1')
  await expect(page.locator('.ds-trigger code')).toHaveText('(unset)')
  const master = page.locator('[data-ds-master]', { hasText: 'e2e-still' }).first()
  await expect(master).toBeVisible({ timeout: 10_000 })
  await master.locator('.ds-master-name').click() // expand to see the layer
  // This run's layer is pinned by its caption's run id — layers from earlier
  // runs accumulate on the shared home's deduped still (testing.md).
  const layerRow = page.locator('[data-ds-layer]', { hasText: runId }).first()
  await expect(layerRow).toBeVisible()
  await layerRow.locator('.ds-layer-select').click()
  await page.locator('.ds-tab', { hasText: 'export' }).click()
  await expect(page.locator('[data-ds-export]')).toBeVisible()
  // (A10 fix round 2) The WARNING-tier consent sentence renders with the
  // form itself — computed size >= 11px like every other floored paragraph.
  const consentSize = await page.locator('[data-ds-accept-warnings]').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
  expect(consentSize, 'the consent sentence renders at the >=11px floor').toBeGreaterThanOrEqual(11)
  // Gate 8's prerequisite is an editable control now: set it, save it, and
  // the titlebar chip (the old static display) reflects the persisted token.
  await page.locator('[data-ds-trigger-input]').fill('ph0t0r34l')
  await page.locator('[data-ds-trigger-save]').click()
  await expect(page.locator('.ds-trigger code')).toHaveText('ph0t0r34l', { timeout: 5_000 })
  // The token persists server-side: the export runs past the trigger gate and
  // lands the immutable snapshot (one still item: bake → write → validate).
  await page.locator('[data-ds-export-folder]').fill(`e2e-trigger-export-${runId}`)
  await page.locator('[data-ds-run-export]').click()
  await expect(page.locator('[data-ds-export-result]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-ds-export-result] h3')).toContainText('1 item(s) exported · 0 refused')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// The button recipes' first family, worked fully (component vocabulary
// task 7, k2q0n9s): ds-btn — the plan's named complete dialect — absorbed
// into the shared .btn recipes (tone relocated verbatim, geometry retained
// in the surface class, P06). These pins hold the migration: the Button
// API's class composition on the real ds-btn surfaces AND the recipe-owned
// computed tone (browser-computed values as the final authority — the same
// probe doctrine as the aspect-chip pin above). The icon-only pin is the
// manifest §2 a11y row: icon-only REQUIRES an accessible name (the dev-warn
// contract's live surface — the trash action names itself).
test('button recipes: the ds-btn family composes btn classes with recipe-owned tone', async ({ page }) => {
  const problems = await trackErrors(page)
  const sourceId = await seedLibrary(page.request)
  await page.goto('/?datasets=1')
  const master = page.locator(`[data-ds-master][data-health="healthy"]`, { hasText: 'e2e-clip' }).first()
  await expect(master).toBeVisible({ timeout: 10_000 })

  // The toolbar's primary action: Button composes btn btn--primary; the
  // surface class carries geometry only; the old `primary` dialect token
  // is gone (its tone rule was absorbed, not kept alongside).
  const exportButton = page.locator('.ds-toolbar button', { hasText: 'Export…' })
  await expect(exportButton).toHaveClass(/(^|\s)btn btn--primary ds-btn(\s|$)/)
  const exportRender = await exportButton.evaluate((element) => {
    const style = getComputedStyle(element)
    return { border: style.borderTopColor, background: style.backgroundColor, color: style.color }
  })
  const expectedPrimaryTone = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.borderTopColor = 'color-mix(in srgb, var(--accent) 55%, transparent)'
    probe.style.backgroundColor = 'color-mix(in srgb, var(--accent) 16%, transparent)'
    probe.style.color = 'var(--accent)'
    document.body.appendChild(probe)
    const style = getComputedStyle(probe)
    const tone = { border: style.borderTopColor, background: style.backgroundColor, color: style.color }
    probe.remove()
    return tone
  })
  expect(exportRender).toEqual(expectedPrimaryTone)

  // The neutral base: a plain ds-btn composes btn btn--secondary and its
  // rest fill renders through the recipe (the muted-8% surface tint).
  const uploadButton = page.locator('.ds-toolbar button', { hasText: 'Upload from LAN' })
  await expect(uploadButton).toHaveClass(/(^|\s)btn btn--secondary ds-btn(\s|$)/)
  const uploadBackground = await uploadButton.evaluate((element) => getComputedStyle(element).backgroundColor)
  const expectedNeutralFill = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.backgroundColor = 'color-mix(in srgb, var(--muted) 8%, transparent)'
    document.body.appendChild(probe)
    const background = getComputedStyle(probe).backgroundColor
    probe.remove()
    return background
  })
  expect(uploadBackground).toBe(expectedNeutralFill)

  // The source row's icon-only trash action carries its accessible name
  // (the icon-only contract: never an unnamed icon button).
  const trash = master.getByRole('button', { name: 'Trash this source' })
  await expect(trash).toBeVisible()
  await expect(trash).toHaveClass(/btn--danger/)
  await expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  void sourceId
})

// The busy contract at a first-family site (manifest §2): the caption
// save held mid-flight by hanging its POST — busy = LoaderCircle +
// aria-busy + disabled, on the ds-btn dialect.
test('button busy: the caption save announces aria-busy and disables while held', async ({ page }) => {
  const problems = await trackErrors(page)
  await seedLibrary(page.request)
  await page.goto('/?datasets=1')
  const master = page.locator(`[data-ds-master][data-health="healthy"]`, { hasText: 'e2e-clip' }).first()
  await expect(master).toBeVisible({ timeout: 10_000 })
  await master.getByRole('button', { name: /layer/ }).first().click()
  await page.locator('[data-ds-save-layer]').click()
  await master.locator('.ds-master-name').click()
  const layer = page.locator('[data-ds-layer]').first()
  await expect(layer).toBeVisible({ timeout: 10_000 })
  await layer.getByRole('button', { name: 'caption' }).click()
  await expect(page.locator('[data-ds-caption]')).toBeVisible()

  const save = page.locator('[data-ds-save-caption]')
  await expect(save).toBeEnabled()
  await expect(save).not.toHaveAttribute('aria-busy')

  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/lan/datasets/captions', async (route) => {
    await held
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ layer: {} }) })
  })
  await page.locator('[data-ds-caption-textarea]').fill('e2e_trigger the busy contract pin')
  await save.click()
  await expect(save).toHaveAttribute('aria-busy', 'true')
  await expect(save).toBeDisabled()
  await expect(save.locator('.spin')).toHaveCount(1)
  await expect(save).toHaveClass(/(^|\s)btn btn--primary btn--busy ds-btn(\s|$)/)

  release()
  await expect(save).not.toHaveAttribute('aria-busy', { timeout: 10_000 })
  await expect(save).toBeEnabled()
  await expect(save.locator('.spin')).toHaveCount(0)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})
