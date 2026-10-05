import os from 'node:os'
import path from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { H3_REGISTRY_LISTINGS, serveModelRegistry, serveObjectInfo, stockObjectInfo } from './fakeEngineInfo'

// H3 Image Workbench (k9vu6t0, docs/specs/image-workbench-v1.md §2/§11): the
// dedicated surface end to end at ?images=1 — engine-independent (the packet
// take is seeded through the documents API exactly the way the landing loop
// writes it: ONE take whose artifacts are the N frame outputs, scorer verdict
// + canonical pointer in metrics). Covers: the mode rail, the 9-slot
// reference strip with roles + auto-per-role transports, the Keep dial, the
// generated contract, take-strip frame picking (manual pick beats the
// scorer), the always-opt-in refine affordance with engine-pairing honesty
// (engine offline → both engines say unavailable, never silent), the burst
// lane's E-IW2 gate, the beyond-9 honesty note, and the consent-gated exit
// dialog with the hybrid limitation named. Every test attaches the
// console/page-error guard like app.spec.ts.

const environmental = (entry: string) =>
  entry.includes('Failed to load resource')
  || /WebSocket connection to .* failed/.test(entry)
  || /Connecting to 'blob:.*' violates the following Content Security Policy directive: "connect-src/.test(entry)
  || /net::ERR_CONNECTION_REFUSED/.test(entry) // the engine is deliberately offline in this leg

async function trackErrors(page: Page) {
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`)
  })
  return problems
}

// Three DISTINCT 1x1 PNGs (content-hash distinct — the blob tree dedupes).
const FRAME_PNGS = [
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNg+M/wHwAEAQH/cetH5QAAAABJRU5ErkJggg==',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/5ncLrgAAAABJRU5ErkJggg==',
]

type Seeded = { projectId: string; chainId: string; outputId: string; takeId: string; artifactPaths: string[] }

/** Seeds one workbench session with one landed packet take, the exact shape
 *  the landing loop writes (frame artifacts + scorer verdict + canonical
 *  pointer in metrics.h3img). `options.refs` seeds reference slots into the
 *  session settings (default none) — the ref-strip tests' starting state.
 *  `options.extraCanvasImages` adds further image chains (outputs + takes)
 *  to the same project — the canvas-picker rows for the long-content case. */
async function seedSession(request: APIRequestContext, options?: { refs?: Array<Record<string, unknown>>; extraCanvasImages?: number }): Promise<Seeded> {
  const project = await (await request.post('/api/lan/documents/projects', { data: { name: 'IW e2e' } })).json()
  const chain = await (await request.post('/api/lan/documents/chains', {
    data: {
      projectId: project.project.id,
      kind: 'h3img',
      settings: {
        family: 'h3img.generate.packet',
        intent: 'a ceramic bowl of lemons on an oak table',
        tier: 5,
        keepDial: 0.55,
        seed: 4242,
        resolution: '1344x768',
        loras: [],
        refs: options?.refs ?? [],
        semanticOverflow: false,
        framePicks: {},
        refineEngine: '',
        poserigInbox: null,
      },
    },
  })).json()
  const output = await (await request.post('/api/lan/documents/outputs', { data: { chainId: chain.chain.id, substrates: ['decoded'] } })).json()
  const artifactPaths: string[] = []
  for (let index = 0; index < FRAME_PNGS.length; index += 1) {
    const ingested = await (await request.post('/api/lan/documents/blobs/ingest', { data: { data: FRAME_PNGS[index], name: `packet-frame-${index}.png`, kind: 'image' } })).json()
    artifactPaths.push(ingested.path)
  }
  const take = await (await request.post('/api/lan/documents/takes', {
    data: {
      outputId: output.output.id,
      jobId: null,
      artifacts: artifactPaths,
      metrics: {
        kind: 'image',
        duration: 0,
        width: 1344,
        height: 768,
        sourcePath: artifactPaths[0],
        h3img: {
          family: 'h3img.generate.packet',
          profile: 'packet',
          tier: 5,
          frames: 3,
          prompt: 'the generated contract text',
          refs: [{ role: 'subject', transport: 'native', name: 'identity.png' }],
          loras: [],
          seed: 4242,
          resolution: '1344x768',
          hybrid: true,
          scorer: { bestIndex: 1, reason: 'sharpest of the pool (Laplacian 123.4)', metricBasis: 'pixel metrics only (no references supplied; CLIP similarity is a seam — not computed, no dependencies)' },
          canonicalFrameIndex: 1,
        },
      },
    },
  })).json()
  await request.post('/api/lan/documents/session', { data: { openProjects: [project.project.id], activeProject: project.project.id } })
  const seeded = { projectId: project.project.id, chainId: chain.chain.id, outputId: output.output.id, takeId: take.take.id, artifactPaths }
  for (let index = 0; index < (options?.extraCanvasImages ?? 0); index += 1) {
    const extraChain = await (await request.post('/api/lan/documents/chains', {
      data: {
        projectId: project.project.id,
        kind: 'h3img',
        settings: { family: 'h3img.generate.packet', intent: `picker row ${index + 2}`, tier: 5, keepDial: 0.55, seed: 4242, resolution: '1344x768', loras: [], refs: [], semanticOverflow: false, framePicks: {}, refineEngine: '', poserigInbox: null },
      },
    })).json()
    const extraOutput = await (await request.post('/api/lan/documents/outputs', { data: { chainId: extraChain.chain.id, substrates: ['decoded'] } })).json()
    await request.post('/api/lan/documents/takes', {
      data: {
        outputId: extraOutput.output.id,
        jobId: null,
        artifacts: [artifactPaths[0]],
        metrics: { kind: 'image', duration: 0, width: 1344, height: 768, sourcePath: artifactPaths[0] },
      },
    })
  }
  return seeded
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw new Error(`Uncaught renderer error during navigation: ${error.message}`)
  })
})

test('the workbench boots at ?images=1 with the seeded packet take on the pick surface', async ({ page, request }) => {
  const problems = await trackErrors(page)
  await seedSession(request)
  await page.goto('/?images=1')
  await expect(page.locator('[data-iw-root]')).toBeVisible()
  // The mode rail: five modes, the packet family selected.
  await expect(page.locator('[data-iw-mode-rail]')).toBeVisible()
  await expect(page.locator('[data-iw-mode="generate"]')).toBeVisible()
  await expect(page.locator('[data-iw-mode="compose"]')).toBeVisible()
  await expect(page.locator('[data-iw-mode="edit"]')).toBeVisible()
  await expect(page.locator('[data-iw-mode="refine"]')).toBeVisible()
  await expect(page.locator('[data-iw-root][data-iw-family="h3img.generate.packet"]')).toBeVisible()
  // The take strip IS the pick surface: one take, three frame artifacts,
  // the scorer's frame starred.
  const take = page.locator(`[data-iw-take][data-iw-take-kind="packet"]`)
  await expect(take).toBeVisible()
  await expect(take.locator('[data-iw-frame]')).toHaveCount(3)
  await expect(take.locator('[data-iw-frame="1"]')).toHaveClass(/scorer/)
  await expect(take.locator('[data-iw-frame="1"]')).toHaveClass(/picked/)
  // The preview shows the picked frame with the scorer verdict.
  await expect(page.locator('[data-iw-preview-image]')).toBeVisible()
  await expect(page.locator('[data-iw-scorer]')).toContainText('sharpest')
  const problemsAfterBoot = problems.filter((entry) => !environmental(entry))
  expect(problemsAfterBoot).toEqual([])
})

// (A10, Codex audit 2026-10-02) The perfect-state sweep's V3 "11px helper
// floor" was claimed through var(--text-2xs, 11px) — a dead fallback: the
// token IS defined (7px), so every decision-bearing paragraph rendered at
// 7px. The floor is asserted on the COMPUTED style (the audit's own method):
// staging note + unavailable note + engine note, the paragraphs that carry
// the reader's decision.
test('decision-bearing helper text meets the 11px legibility floor (A10)', async ({ page, request }) => {
  await seedSession(request)
  await page.goto('/?images=1')
  await expect(page.locator('[data-iw-root]')).toBeVisible()
  // Engine offline in this leg → the packet family is unavailable, so the
  // unavailable note and the engine note render alongside the always-on
  // staging note.
  for (const selector of ['[data-iw-staging]', '[data-iw-unavailable]', '.iw-engine-note']) {
    const note = page.locator(selector).first()
    await expect(note).toBeVisible()
    const size = await note.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
    expect(size, `${selector} renders at the >=11px floor`).toBeGreaterThanOrEqual(11)
  }
})

test('the workbench carries the shared surface switcher — Alt+2/Alt+3 live (the surface contract)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  await seedSession(request)
  await page.goto('/?images=1')
  await expect(page.locator('[data-iw-mode-rail]')).toBeVisible({ timeout: 15_000 })
  // The registry-driven switcher renders in the workbench header like on
  // every registered surface (app-tour wave d6iy68r, review M1 — before the
  // fix this surface was the one place Alt+1..9 was dead and datasets was
  // unreachable except by URL).
  const imagesPill = page.locator('[data-surface-switcher] [data-surface="images"]')
  await expect(imagesPill).toBeVisible()
  await expect(imagesPill).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('Alt+2')
  await expect(page.locator('[data-ds-root]')).toBeVisible({ timeout: 15_000 })
  await page.keyboard.press('Alt+3')
  await expect(page.locator('[data-iw-mode-rail]')).toBeVisible({ timeout: 15_000 })
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('manual pick on the take strip overrides the scorer (the canonical frame pointer)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const seeded = await seedSession(request)
  await page.goto('/?images=1')
  const take = page.locator(`[data-iw-take="${seeded.takeId}"]`)
  await expect(take.locator('[data-iw-frame="2"]')).toBeVisible()
  await take.locator('[data-iw-frame="2"]').click()
  // The pick persists through the document store (chain settings framePicks)
  // — reload and the manual choice stands.
  await page.reload()
  const reloaded = page.locator(`[data-iw-take="${seeded.takeId}"]`)
  await expect(reloaded.locator('[data-iw-frame="2"]')).toHaveClass(/picked/)
  await expect(reloaded.locator('[data-iw-frame="1"]')).not.toHaveClass(/picked/)
  const problemsAfter = problems.filter((entry) => !environmental(entry))
  expect(problemsAfter).toEqual([])
})

test('the refine affordance is opt-in with engine-pairing honesty; the burst lane states its gate', async ({ page, request }) => {
  const problems = await trackErrors(page)
  await seedSession(request)
  await page.goto('/?images=1')
  // Always opt-in: no refine ran, the affordance presents both engines.
  await expect(page.locator('[data-iw-refine]')).toBeVisible()
  await expect(page.locator('[data-iw-refine-tap="klein"]')).toBeVisible()
  await expect(page.locator('[data-iw-refine-tap="krea2"]')).toBeVisible()
  // Engine offline → BOTH engines say so (disabled with their reason), never
  // a silent skip.
  await expect(page.locator('[data-iw-refine-tap="klein"]')).toBeDisabled()
  await expect(page.locator('[data-iw-refine-tap="krea2"]')).toBeDisabled()
  await expect(page.locator('.iw-engine-note')).toContainText(/unavailable/i)
  // The primary Generate CTA names its reason too (app-tour wave d6iy68r,
  // review M7 — the refine-tap title pattern, never a silent dead button).
  const generate = page.locator('[data-iw-generate]')
  await expect(generate).toBeDisabled()
  await expect(generate).toHaveAttribute('title', /unavailable/i)
  // The burst lane ships behind the E-IW2 gate + experiment flag.
  const burst = page.locator('[data-iw-burst-fuse]')
  await expect(burst).toBeDisabled()
  await expect(burst).toContainText('E-IW2')
  const problemsAfter = problems.filter((entry) => !environmental(entry))
  expect(problemsAfter).toEqual([])
})

test('the reference strip: roles, auto-per-role transports, the beyond-9 honesty, and the Keep dial', async ({ page, request }) => {
  const problems = await trackErrors(page)
  await seedSession(request)
  await page.goto('/?images=1')
  // The strip: the budget counter and the honest v1 statement.
  await expect(page.locator('[data-iw-ref-count]')).toHaveText('0/9')
  await expect(page.locator('.iw-refs-note')).toContainText('9 native references')
  await expect(page.locator('[data-iw-ref-add-file]')).toBeVisible()
  await expect(page.locator('[data-iw-ref-add-canvas]')).toBeVisible()
  await expect(page.locator('[data-iw-ref-add-poserig]')).toBeVisible()
  // The Keep dial rides its band hint.
  await expect(page.locator('[data-iw-keep-dial]')).toBeVisible()
  await expect(page.locator('[data-iw-keep-hint]')).toContainText('large pose/composition')
  // (F05, followup Codex audit 2026-10-03) The Keep guidance and the LoRA
  // cross-form safety note are decision-bearing helper text — the same
  // >=11px computed floor as the A10 pins (they rendered at 10px).
  for (const selector of ['[data-iw-keep-hint]', '[data-iw-lora-crossform]']) {
    const note = page.locator(selector)
    await expect(note).toBeVisible()
    const size = await note.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
    expect(size, `${selector} renders at the >=11px floor`).toBeGreaterThanOrEqual(11)
  }
  // The generated contract preview (never hand-written).
  await expect(page.locator('[data-iw-contract]')).toContainText('generated')
  await expect(page.locator('[data-iw-contract-text]')).toContainText('bowl of lemons')
  const problemsAfter = problems.filter((entry) => !environmental(entry))
  expect(problemsAfter).toEqual([])
})

test('the exit dialog is consent-gated and names the hybrid limitation honestly', async ({ page, request }) => {
  const problems = await trackErrors(page)
  await seedSession(request)
  await page.goto('/?images=1')
  await page.locator('[data-iw-exit]').click()
  const dialog = page.getByRole('dialog', { name: 'Start-frame exit' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('created and selected, never submitted')
  // No hybrid loader (engine offline) → the stock limitation is NAMED.
  await expect(page.locator('[data-iw-exit-hybrid]')).toContainText('silently drop one of')
  // (A10 fix round 1) The exit dialog's explainer and its danger warning are
  // decision prose a first-run user must read before confirming — the same
  // >=11px floor as the staging/unavailable notes.
  for (const selector of ['.iw-dialog p', '[data-iw-exit-hybrid]']) {
    const note = page.locator(selector).first()
    await expect(note).toBeVisible()
    const size = await note.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
    expect(size, `${selector} renders at the >=11px floor`).toBeGreaterThanOrEqual(11)
  }
  await page.locator('[data-iw-exit-choice="anchor"]').click()
  await expect(page.locator('[data-iw-exit-confirm]')).toBeEnabled()
  await page.locator('[data-iw-exit-confirm]').click()
  // The exit seeds: the pinned media chain + the anchored video chain land
  // on the project (created, never submitted — no job appears).
  await expect(dialog).not.toBeVisible()
  await expect.poll(async () => {
    const doc = await (await page.request.get(`/api/lan/documents/project?id=${(await (await page.request.get('/api/lan/documents/session')).json()).session.activeProject}`)).json()
    return doc.chains.filter((chain: { kind: string }) => chain.kind === 'media' || chain.kind === 'generate').length
  }, { timeout: 10_000 }).toBeGreaterThanOrEqual(2)
  const problemsAfter = problems.filter((entry) => !environmental(entry))
  expect(problemsAfter).toEqual([])
})

// ---------------------------------------------------------------------------
// Component vocabulary task 12 (k2q0n9s) — IwDialog is DELETED: the three
// workbench dialogs are StudioDialogLayered (Base UI portal + the §0.2 layer
// registry). What that means, pinned here at the exit dialog:
//   - CV13's portal geometry: the retired backdrop nested the popup and owned
//     the flex centering; Base UI portals Backdrop/Popup as SIBLINGS, so the
//     .modal-backdrop/.ui-dialog-center recipe pair carries the layering and
//     the popup keeps .iw-dialog;
//   - §0.2: the open dialog REGISTERS ('iw-exit') — Escape routes through the
//     ONE window-capture listener (Base UI's own dismissal suppressed for the
//     routed keystroke: one keystroke, one dismissal path);
//   - the × owns its handler — the retired markup had no close button at all,
//     so pointer dismissal leaned entirely on the backdrop's
//     target-identity pointerdown check;
//   - the trap/restore pair is Base UI's FocusManager, not the hand-rolled
//     Tab wrap the (W1) sweep backported.
test('the start-frame exit dialog is a registry-participating StudioDialog: trap, restore, routed Escape, the × owns its close (k2q0n9s)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  await seedSession(request)
  await page.goto('/?images=1&probe=layers')
  await expect(page.locator('[data-iw-root]')).toBeVisible()
  const trigger = page.locator('[data-iw-exit]')
  await expect(trigger).toBeEnabled()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Start-frame exit' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAccessibleName('Start-frame exit')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  // CV13 — the portal structure: the popup keeps .iw-dialog; the backdrop and
  // center classes carry what the retired flex-centering backdrop owned.
  await expect(dialog).toHaveClass(/(^|\s)iw-dialog(\s|$)/)
  await expect(page.locator('.modal-backdrop.iw-dialog-backdrop')).toBeVisible()
  await expect(page.locator('.ui-dialog-center.iw-dialog-center')).toBeVisible()

  // §0.2 — the open dialog IS a registered layer (the probe's idiom, task 10).
  const stackVia = () => page.evaluate(() => {
    const probe = (window as unknown as { __studioLayerProbe?: { layerIds(): string[] } }).__studioLayerProbe
    return probe ? probe.layerIds().join('|') : '(probe not bound)'
  })
  await expect.poll(stackVia).toBe('iw-exit')

  // The trap: focus starts on the first tabbable (the header ×)…
  const close = dialog.getByRole('button', { name: 'Close the start-frame exit' })
  await expect(close).toBeFocused()
  // …Tab never RESTS outside the popup (the wrap's refocus lands a tick
  // after the keystroke — assert the settled state, 8 presses = 2 full
  // cycles including both wrap edges)…
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab')
    await expect.poll(() => dialog.evaluate((node) => {
      const active = document.activeElement
      return active !== null && (node === active || node.contains(active))
    }), `Tab #${index + 1} settles inside the dialog`).toBe(true)
  }
  // …and wraps: Shift+Tab from the FIRST tabbable (the ×) lands on the LAST
  // (the footer Cancel — the confirm starts disabled with no plan chosen).
  await close.focus()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()

  // Routed Escape closes the dialog, focus restores to the trigger, and the
  // layer unregisters on close.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect.poll(stackVia).toBe('')

  // The × owns its handler — the button alone dismisses…
  await trigger.click()
  await expect(dialog).toBeVisible()
  await close.click()
  await expect(dialog).toHaveCount(0)
  // …a click on the dialog BODY never does (only ×, Escape, or the backdrop)…
  await trigger.click()
  await expect(dialog).toBeVisible()
  await dialog.locator('p').first().click({ position: { x: 4, y: 4 } })
  await expect(dialog).toBeVisible()
  // …and the backdrop press still dismisses (Base UI's outside-press path,
  // never the registry's business).
  await page.mouse.click(8, 300)
  await expect(dialog).toHaveCount(0)

  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// Review Focus #1's mechanism at the SECOND real registry consumer: the
// canvas-ref picker is the workbench's nested case (the Caption→VLM-shaped
// stack — task 13 lands the datasets' own). A registered overlay ABOVE the
// open picker: ONE Escape closes ONLY the overlay — the window-capture stop
// keeps Base UI's document-level dismissal from also closing the dialog
// underneath — and the next Escape belongs to the picker, focus restoring to
// its trigger.
test('the canvas-ref picker unwinds topmost-first under a registered overlay (§0.2, k2q0n9s)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  await seedSession(request)
  await page.goto('/?images=1&probe=layers')
  await expect(page.locator('[data-iw-root]')).toBeVisible()
  const trigger = page.locator('[data-iw-ref-add-canvas]')
  await trigger.click()
  const picker = page.getByRole('dialog', { name: 'Use a canvas image as a reference' })
  await expect(picker).toBeVisible()
  await expect(picker).toHaveAttribute('aria-modal', 'true')

  const stackVia = () => page.evaluate(() => {
    const probe = (window as unknown as { __studioLayerProbe?: { layerIds(): string[] } }).__studioLayerProbe
    return probe ? probe.layerIds().join('|') : '(probe not bound)'
  })
  await expect.poll(stackVia).toBe('iw-canvas-picker')

  // The stand-in overlay (task 10's probe seam — the hook-overlay class that
  // task 14 migrates), registered ABOVE the open picker.
  const standIn = page.locator('[data-e2e-stand-in-layer]')
  const registered = await page.evaluate(() => {
    const probe = (window as unknown as {
      __studioLayerProbe?: {
        layerIds(): string[]
        registerLayer(registration: { id: string; modal?: boolean; onEscape(event: KeyboardEvent): void }): () => void
      }
    }).__studioLayerProbe
    if (!probe) return '(probe not bound)'
    const overlay = document.createElement('div')
    overlay.setAttribute('data-e2e-stand-in-layer', 'hook-overlay')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.35)'
    document.body.appendChild(overlay)
    let unregister = () => {}
    unregister = probe.registerLayer({ id: 'e2e-hook-overlay', modal: true, onEscape: () => { overlay.remove(); unregister() } })
    return probe.layerIds().join('|')
  })
  expect(registered).toBe('iw-canvas-picker|e2e-hook-overlay')
  await expect(standIn).toHaveCount(1)

  // ONE Escape: the topmost layer takes it, the picker underneath stays.
  await page.keyboard.press('Escape')
  await expect(standIn).toHaveCount(0)
  await expect(picker).toBeVisible()
  expect(await stackVia()).toBe('iw-canvas-picker')

  // The next Escape belongs to the picker — and restores focus to its trigger.
  await page.keyboard.press('Escape')
  await expect(picker).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect.poll(stackVia).toBe('')

  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// CV13's containment clauses, driven for real: the picker's grid grows past
// any viewport's 80vh cap (17 canvas image rows here — 1 seeded + 16 extra), so the POPUP must own
// the scroll (max-height 80vh + overflow auto — content taller than the cap
// scrolls INSIDE the dialog, never the page), and on a narrow viewport the
// popup fits the 18px-padded center (width min(560px, 100%) — the retired
// 92vw could overflow the portal center's padding).
test('the picker owns its scroll: long content scrolls inside the popup, never the page; narrow viewports fit (CV13, k2q0n9s)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  await seedSession(request, { extraCanvasImages: 16 })
  await page.setViewportSize({ width: 480, height: 700 })
  await page.goto('/?images=1')
  await expect(page.locator('[data-iw-root]')).toBeVisible()
  await page.locator('[data-iw-ref-add-canvas]').click()
  const picker = page.getByRole('dialog', { name: 'Use a canvas image as a reference' })
  await expect(picker).toBeVisible()
  await expect(picker.locator('[data-iw-canvas-ref]')).toHaveCount(17, { timeout: 15_000 })
  // The portal's centering wrapper owns the geometry the retired backdrop
  // carried when the popup was its DOM child (CV13).
  await expect(page.locator('.ui-dialog-center.iw-dialog-center')).toBeVisible()

  // Containment: the popup is the scroll container, and the 17-row grid
  // exceeds the 80vh cap (560px at this viewport).
  const metrics = await picker.evaluate((node) => ({
    overflowY: getComputedStyle(node).overflowY,
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
  }))
  expect(metrics.overflowY, 'the popup is the scroll container').toBe('auto')
  expect(metrics.scrollHeight, 'the 17-row grid exceeds the 80vh cap at this viewport').toBeGreaterThan(metrics.clientHeight)
  const scrolled = await picker.evaluate((node) => {
    node.scrollTop = 60
    return node.scrollTop
  })
  expect(scrolled, 'the internal scroll actually moves').toBe(60)

  // Narrow viewport: the popup fits inside the viewport horizontally and the
  // document does not overflow (no page scrollbar behind the dialog).
  const box = await picker.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(480)
  const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(docOverflow, 'no horizontal document overflow behind the dialog').toBeLessThanOrEqual(0)

  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('the canvas tile names the workbench packet and links to the pick surface', async ({ page, request }) => {
  const problems = await trackErrors(page)
  await seedSession(request)
  await page.goto('/')
  // The session chain renders as a canvas object with the frame-count chip.
  // The take chips are zoom-gated (band 'near'): zoom in past the mid band.
  const chip = page.locator('[data-canvas-take-to-workbench]')
  await expect(chip).toBeVisible({ timeout: 15_000 }).catch(async () => {
    for (let index = 0; index < 3; index += 1) await page.getByRole('button', { name: 'Zoom in' }).click()
  })
  await expect(chip).toContainText('3 frames')
  const problemsAfter = problems.filter((entry) => !environmental(entry))
  expect(problemsAfter).toEqual([])
})

// ---------------------------------------------------------------------------
// (Task 12R, k2q0n9s) The mask painter's sizing contract, pinned end to end:
// the paint canvas's BITMAP (its width/height attributes) must equal the
// loaded source's natural pixel geometry — the painter paints in SOURCE
// pixels and CSS scales the view, so a mis-sized bitmap mis-scales every
// stroke and the mask. This is the pin the T12 StudioDialogLayered move
// needed: Base UI's portal mounts its content a commit AFTER the dialog
// component, so the painter's old []-mount-effect img-load binding ran
// against null refs and never re-ran — the canvas stayed at the browser's
// 300x150 default. The bind now rides callback refs (the CropEditor fix
// shape, src/datasets/CropEditor.tsx). Engine-independent: painting needs no
// engine, only the seeded canvas take as the picked source (the W8 path).
test('the mask painter\'s canvas sizes to the loaded source\'s natural pixels (Task 12R, k2q0n9s)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  await seedSession(request)
  await page.goto('/?images=1')
  await expect(page.locator('[data-iw-root]')).toBeVisible({ timeout: 15_000 })

  // The inpaint lane: the Edit tab, the masked sub-lane, then anchor the
  // source from the seeded canvas take.
  await page.locator('[data-iw-mode="edit"] > button').click()
  await page.locator('[data-iw-family-button="h3img.edit.inpaint"]').click()
  await page.locator('[data-iw-source-pick-canvas]').click()
  const picker = page.getByRole('dialog', { name: 'Use a canvas image as the source' })
  await expect(picker).toBeVisible()
  await picker.locator('[data-iw-canvas-ref]').first().click()
  await expect(picker).toHaveCount(0)
  await expect(page.locator('[data-iw-source-name]')).toBeVisible()

  // Open the painter.
  await page.locator('[data-iw-paint-mask]').click()
  const painter = page.getByRole('dialog', { name: 'Paint the region to regenerate' })
  await expect(painter).toBeVisible()

  // Judge only a LOADED source (natural size is 0 while in flight; the
  // seeded frames are the distinct 1x1 PNGs from seedSession).
  await page.waitForFunction(() => {
    const img = document.querySelector('.iw-mask-under')
    return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0
  })
  const dims = await page.evaluate(() => {
    const img = document.querySelector('.iw-mask-under')
    const paint = document.querySelector('[data-iw-mask-canvas]')
    if (!(img instanceof HTMLImageElement) || !(paint instanceof HTMLCanvasElement)) return { natural: '(missing)', canvas: '(missing)' }
    return { natural: `${img.naturalWidth}x${img.naturalHeight}`, canvas: `${paint.width}x${paint.height}` }
  })
  // 300x150 here would be the browser default — the T12 regression, live.
  expect(dims.canvas, `paint bitmap ${dims.canvas} vs natural ${dims.natural}`).toBe(dims.natural)

  // The painter stays a registry-participating dialog: Escape dismisses it.
  await page.keyboard.press('Escape')
  await expect(painter).toHaveCount(0)

  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// The FULL generation path through a fake engine speaking the real contract
// (the canvas F6 precedent): submit → poll → the packet-aware landing
// (getHistory → EVERY frame descriptor → server-side byte ingest → the
// first-party scorer decoding the frames → ONE take whose artifacts are the
// N frames). This is AC1's landing mechanics proven engine-free end to end.
test('a generation lands as ONE take whose artifacts are the packet frames (fake engine, full path)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const http = await import('node:http')

  // (Wave 2 R-12) The engine's /models listing resolves the workbench's
  // availability — no local files (the T=1 decoder + the MaxiMin adapter
  // ride the listing).
  const workbenchListings = {
    ...H3_REGISTRY_LISTINGS,
    vae: [...H3_REGISTRY_LISTINGS.vae, 'minimax_h3_t1_image_vae_step1597.safetensors'],
    loras: [...H3_REGISTRY_LISTINGS.loras, 'MaxiMin-HHH-R2V-ThisIsFine.safetensors'],
  }

  const frameBytes = FRAME_PNGS.map((base64) => Buffer.from(base64, 'base64'))
  const PROMPT_ID = 'iw-e2e-landing-1'
  const engine = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://engine.local')
    if (url.pathname === '/system_stats') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ system: {}, devices: [] }))
      return
    }
    if (serveObjectInfo(url, stockObjectInfo({ MiniMaxH3HybridLoader: {} }), res)) return
    if (serveModelRegistry(url, workbenchListings, res)) return
    if (url.pathname === '/upload/image') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ name: 'uploaded.png', subfolder: '', type: 'input' }))
      return
    }
    if (url.pathname === '/prompt') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ prompt_id: PROMPT_ID, number: 1, node_errors: {} }))
      return
    }
    if (url.pathname === `/history/${PROMPT_ID}`) {
      // THREE per-frame publish outputs — the exact history shape the
      // workbench's frame nodes produce.
      const outputs: Record<string, unknown> = {}
      for (let index = 0; index < 3; index += 1) {
        outputs[`70${index}`] = { images: [{ filename: `iw-frame-0000${index + 1}_.png`, subfolder: '', type: 'output' }] }
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ [PROMPT_ID]: { prompt: [], outputs, status: { completed: true } } }))
      return
    }
    if (url.pathname === '/view') {
      const filename = url.searchParams.get('filename') ?? ''
      const match = filename.match(/0000(\d)/)
      const index = match ? Number(match[1]) - 1 : 0
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(frameBytes[index] ?? frameBytes[0])
      return
    }
    res.writeHead(404)
    res.end()
  })
  const enginePort = await new Promise<number>((resolve) => engine.listen(0, '127.0.0.1', () => resolve((engine.address() as { port: number }).port)))

  const originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
  try {
    // Cancel any stale non-terminal jobs from earlier runs first (the vision
    // after-hook precedent) — they would poll this run's dead engine.
    const listed = await (await request.get('/api/lan/jobs')).json() as { jobs?: Array<Record<string, unknown>> }
    const stale = (listed.jobs ?? []).filter((job) => job.status === 'queued' || job.status === 'running').map((job) => ({ ...job, status: 'cancelled' }))
    if (stale.length) await request.post('/api/lan/jobs', { data: { jobs: stale } })
    await request.post('/api/lan/settings', { data: { settings: {
      ...originalSettings,
      comfyUrl: `http://127.0.0.1:${enginePort}`,
    } } })
    await request.post('/api/lan/documents/session', { data: { openProjects: [], activeProject: null } })
    await page.goto('/?images=1')
    await expect(page.locator('[data-iw-root]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-iw-engine="on"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-iw-intent]').fill('a ceramic bowl of lemons on an oak table, morning light')
    await page.locator('[data-iw-generate]').click()
    // The submission lands ONE take whose artifacts are the THREE frames,
    // the scorer ran (a starred frame + verdict), and the preview paints.
    const take = page.locator('[data-iw-take-kind="packet"]').first()
    await expect(take).toBeVisible({ timeout: 30_000 })
    await expect(take.locator('[data-iw-frame]')).toHaveCount(3, { timeout: 15_000 })
    await expect(page.locator('[data-iw-scorer]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-iw-preview-image]')).toBeVisible()
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    await request.post('/api/lan/documents/session', { data: { openProjects: [], activeProject: null } }).catch(() => undefined)
    // Remove the dummy model files: the shared test-home must return to its
    // EMPTY-model-roots state — the first-run-guidance e2e keys on it (the
    // QOL wave's precondition). Scratch this test created, in a gitignored
    // tree, removed by the same test.
    await new Promise<void>((resolve) => engine.close(() => resolve()))
  }
})

// ---------------------------------------------------------------------------
// (Perfect-state sweep 2026-09-27) Four findings on the T=1 lane, one fake
// engine: W6 the badge names the READY machinery instead of "unavailable";
// W7 a single-frame landing speaks lane copy (no packet language, no
// pool-of-one scorer); W1 the dialogs carry role=dialog semantics; W8 the
// anchored source picks from the canvas like the references always could.
// The engine serves the FULL base stack + the Fizgig still pack but NOT the
// Mamad8 T=1 VAE — the Image Studio machinery is unusable, Fizgig is not.
test('T=1 lane: the badge names the ready machinery; single frames land with lane copy; dialogs carry semantics; sources pick from canvas', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const http = await import('node:http')

  const frameBytes = Buffer.from(FRAME_PNGS[0], 'base64')
  const PROMPT_ID = 'iw-e2e-t1-1'
  const engine = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://engine.local')
    if (url.pathname === '/system_stats') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ system: {}, devices: [] }))
      return
    }
    // The Fizgig still pack's two classes (no Image Studio pack classes, no
    // Mamad8 file in the listing — the machinery asymmetry the badge must
    // narrate).
    if (serveObjectInfo(url, stockObjectInfo({ FizgigH3StillLatent: {}, FizgigH3StillDecode: {}, MiniMaxH3HybridLoader: {} }), res)) return
    if (serveModelRegistry(url, H3_REGISTRY_LISTINGS, res)) return
    if (url.pathname === '/prompt') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ prompt_id: PROMPT_ID, number: 1, node_errors: {} }))
      return
    }
    if (url.pathname === `/history/${PROMPT_ID}`) {
      // ONE image output — the single-frame T=1 landing.
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ [PROMPT_ID]: { prompt: [], outputs: { '70': { images: [{ filename: 'iw-t1-00001_.png', subfolder: '', type: 'output' }] } }, status: { completed: true } } }))
      return
    }
    if (url.pathname === '/view') {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(frameBytes)
      return
    }
    res.writeHead(404)
    res.end()
  })
  const enginePort = await new Promise<number>((resolve) => engine.listen(0, '127.0.0.1', () => resolve((engine.address() as { port: number }).port)))

  const originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
  try {
    const listed = await (await request.get('/api/lan/jobs')).json() as { jobs?: Array<Record<string, unknown>> }
    const stale = (listed.jobs ?? []).filter((job) => job.status === 'queued' || job.status === 'running').map((job) => ({ ...job, status: 'cancelled' }))
    if (stale.length) await request.post('/api/lan/jobs', { data: { jobs: stale } })
    await seedSession(request)
    await request.post('/api/lan/settings', { data: { settings: {
      ...originalSettings,
      comfyUrl: `http://127.0.0.1:${enginePort}`,
      // Reset any leftover machinery pick: the DEFAULT (Image Studio) must
      // be the selected machinery when the badge is asserted.
      experimentalT1Decode: 'image-studio',
    } } })
    await page.goto('/?images=1')
    await expect(page.locator('[data-iw-root]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-iw-engine="on"]')).toBeVisible({ timeout: 15_000 })

    // (W6) The T=1 lane's badge: the SELECTED machinery (Image Studio) is
    // unusable without the Mamad8 VAE, but the badge names the ready
    // machinery set — never a bare "unavailable" that hides the working
    // path.
    const t1Lane = page.locator('[data-iw-family-button="h3img.generate.t1"]')
    await expect(t1Lane).toBeVisible({ timeout: 15_000 })
    // Both Fizgig machineries ride the same pack classes — 2 of 3 ready.
    await expect(t1Lane.locator('[data-iw-unavailable-badge]')).toHaveText('2 of 3 machineries ready')
    await t1Lane.click()
    // …and the unavailable note points AT the switch that unlocks the lane.
    const note = page.locator('[data-iw-unavailable]')
    await expect(note).toBeVisible()
    await expect(note).toContainText('Fizgig')
    await expect(note).toContainText('T=1 machinery')

    // Switch the machinery: the lane unlocks and generates.
    await page.locator('[data-iw-machinery-value]').selectOption('fizgig')
    await expect(page.locator('[data-iw-unavailable]')).toHaveCount(0, { timeout: 15_000 })
    await page.locator('[data-iw-intent]').fill('a single brass compass on chart paper, top light')
    await page.locator('[data-iw-generate]').click()

    // (W7) The single frame lands as ONE unscored take, the caption reads
    // lane copy, and the toast never speaks packet language.
    const take = page.locator('[data-iw-take-kind="t1"]').first()
    await expect(take).toBeVisible({ timeout: 30_000 })
    await expect(take.locator('[data-iw-frame]')).toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator('[data-iw-scorer]')).toHaveCount(0)
    // The caption speaks the lane's vocabulary (T=1 fast — the 'single
    // frame' wording is the non-t1 single-frame lanes').
    await expect(page.locator('[data-iw-preview-caption]')).toContainText('T=1 fast')
    await expect(page.locator('.toast-host--bottom-right [data-canvas-toast="success"]', { hasText: 'frame landed' }).first()).toBeVisible({ timeout: 15_000 })

    // (W1) The start-frame exit dialog carries dialog semantics and answers
    // Escape (task 12: the role/name wiring rides StudioDialog's labelledBy).
    await page.locator('[data-iw-exit]').click()
    const exitDialog = page.getByRole('dialog', { name: 'Start-frame exit' })
    await expect(exitDialog).toBeVisible()
    await expect(exitDialog).toHaveAttribute('aria-modal', 'true')
    await expect(exitDialog).toHaveAccessibleName('Start-frame exit')
    await page.keyboard.press('Escape')
    await expect(exitDialog).toHaveCount(0)

    // (W8 + W11) The Edit lane's SOURCE picks from the canvas (the OS dialog
    // was the only path), and the picker's visible label follows the canvas
    // naming convention (kind + ordinal), not the raw hash filename.
    // The sub-lane row shows the ACTIVE group's lanes — switch the top-level
    // Edit tab first (W5's stable sub-rail).
    await page.locator('[data-iw-mode="edit"] > button').click()
    await page.locator('[data-iw-family-button="h3img.edit.instruct"]').click()
    await expect(page.locator('[data-iw-source-pick-canvas]')).toBeVisible()
    await page.locator('[data-iw-source-pick-canvas]').click()
    const picker = page.getByRole('dialog', { name: 'Use a canvas image as the source' })
    await expect(picker).toBeVisible()
    await expect(picker).toHaveAttribute('aria-modal', 'true')
    const refCard = picker.locator('[data-iw-canvas-ref]').first()
    // kind + ordinal — the canvas tile's own convention for this object.
    await expect(refCard).toContainText(/^h3img 1$/)
    await refCard.click()
    await expect(picker).toHaveCount(0)
    // The pick anchored the source (the figure with its name shows).
    await expect(page.locator('[data-iw-source-name]')).toBeVisible()

    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    // (testing.md's shared-home discipline) This test FLIPS a persisted
    // setting (the machinery select saves experimentalT1Decode) and leaves a
    // running job against an engine that is about to die — both must be
    // cleaned HERE or every later boot in the shared home rehydrates them:
    // the flag wedges the H3-1F specs onto the Fizgig ladder, the stuck job
    // pins the radar visible for the at-rest assertions.
    await request.post('/api/lan/settings', { data: { settings: { ...originalSettings, experimentalT1Decode: originalSettings.experimentalT1Decode ?? 'image-studio' } } }).catch(() => undefined)
    const listed = await (await request.get('/api/lan/jobs')).json().catch(() => ({ jobs: [] })) as { jobs?: Array<Record<string, unknown>> }
    const stale = (listed.jobs ?? []).filter((job) => job.status === 'queued' || job.status === 'running').map((job) => ({ ...job, status: 'cancelled' }))
    if (stale.length) await request.post('/api/lan/jobs', { data: { jobs: stale } }).catch(() => undefined)
    await request.post('/api/lan/documents/session', { data: { openProjects: [], activeProject: null } }).catch(() => undefined)
    await new Promise<void>((resolve) => engine.close(() => resolve()))
  }
})

// ---------------------------------------------------------------------------
// (Audit A03, task 3tu6ei6) Two rapid session edits under ordinary latency
// used to erase the first edit: every write built the FULL settings object
// from the same stale closure snapshot, so the second request carried the old
// intent and overwrote the new one — with BOTH requests succeeding. The
// audit's own repro: delay chain-update 900ms, change the intent, immediately
// set Keep — after settling, BOTH must persist.
test('concurrent session edits persist together (A03): a slow write never erases a newer field', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const seeded = await seedSession(request)
  await page.goto('/?images=1')
  await expect(page.locator('[data-iw-intent]')).toBeVisible({ timeout: 15_000 })
  // Slow EVERY session write — the window the stale snapshot raced in.
  await page.route('**/api/lan/documents/chains/update', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900))
    await route.continue()
  })
  await page.locator('[data-iw-intent]').fill('DO NOT LOSE THIS NEW INTENT')
  await page.locator('[data-iw-keep-dial]').fill('0.73')
  // Settle on DURABLE state: the second write has landed on the document.
  await expect.poll(async () => {
    const doc = await (await request.get(`/api/lan/documents/project?id=${seeded.projectId}`)).json()
    const chain = doc.chains.find((entry: { id: string }) => entry.id === seeded.chainId)
    return chain?.settings?.keepDial ?? null
  }, { timeout: 15_000 }).toBe(0.73)
  // BOTH edits persist: the new intent AND the new Keep dial.
  const settled = await (await request.get(`/api/lan/documents/project?id=${seeded.projectId}`)).json()
  const settledChain = settled.chains.find((entry: { id: string }) => entry.id === seeded.chainId)
  expect(settledChain.settings.intent).toBe('DO NOT LOSE THIS NEW INTENT')
  expect(settledChain.settings.keepDial).toBe(0.73)
  // The visible session agrees (a reload shows both — no silent revert).
  await page.reload()
  await expect(page.locator('[data-iw-intent]')).toHaveValue('DO NOT LOSE THIS NEW INTENT', { timeout: 15_000 })
  await expect(page.locator('[data-iw-keep-value]')).toHaveText('0.73')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// (Audit A03 fix round 1 — blind review F1, task 3tu6ei6) The write queue
// fixed SCALAR fields, but every collection-valued patch was still a
// WHOLE-ARRAY value derived from the render-scope snapshot (`settings`,
// refreshed only after a write's reload): two edits to the same collection
// inside the write-latency window still erased the first — folded
// pre-flush the second array won; a straddling flush replaced the first
// edit's durable result with the stale-derived array. The review's own
// repro: set ref0's role, immediately set its transport under a 900 ms
// route delay — BOTH must persist on one slot.
test('same-collection ref edits persist together (A03 fix round 1): role then transport on one slot under write latency', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const seeded = await seedSession(request, {
    refs: [{ id: 'ref-seed-0', role: 'subject', transport: null, keepOverride: null, note: 'seeded reference', source: { kind: 'file', path: '/seed/ref-0.png', name: 'seed-ref-0.png' } }],
  })
  await page.goto('/?images=1')
  await expect(page.locator('[data-iw-ref-slot="0"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-iw-ref-count]')).toHaveText('1/9')
  // Slow EVERY session write — the straddle window: the transport edit
  // queues while the role write is still in flight.
  await page.route('**/api/lan/documents/chains/update', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900))
    await route.continue()
  })
  await page.locator('[data-iw-ref-role="0"]').selectOption('pose')
  await page.locator('[data-iw-ref-transport="0"]').selectOption('native')
  // Settle on DURABLE state: the transport (the second write) has landed.
  await expect.poll(async () => {
    const doc = await (await request.get(`/api/lan/documents/project?id=${seeded.projectId}`)).json()
    const chain = doc.chains.find((entry: { id: string }) => entry.id === seeded.chainId)
    return chain?.settings?.refs?.[0]?.transport ?? null
  }, { timeout: 15_000 }).toBe('native')
  // BOTH collection edits persist: the role AND the transport on one slot.
  const settled = await (await request.get(`/api/lan/documents/project?id=${seeded.projectId}`)).json()
  const settledChain = settled.chains.find((entry: { id: string }) => entry.id === seeded.chainId)
  expect(settledChain.settings.refs[0].role).toBe('pose')
  expect(settledChain.settings.refs[0].transport).toBe('native')
  // The visible session agrees (a reload shows both — no silent revert).
  await page.reload()
  await expect(page.locator('[data-iw-ref-role="0"]')).toHaveValue('pose', { timeout: 15_000 })
  await expect(page.locator('[data-iw-ref-transport="0"]')).toHaveValue('native')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// (Audit A03 fix round 2 — re-review, task 3tu6ei6) Composing collection
// ops POSITIONALLY hits the wrong slot: the strip does not re-render until
// a write's reload, so two removes inside the write-latency window both
// carry render-time indices — composed against the fresh array, the second
// filter deleted a reference the user never touched (remove b then c left
// [a,c], deleting d). The re-review's repro: refs [a,b,c,d], remove slot
// 1 then slot 2 under a 900 ms route delay — the durable result must be
// exactly [a,d].
test('same-collection ref removals persist together (A03 fix round 2): remove b then c under write latency deletes exactly those slots', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const seeded = await seedSession(request, {
    refs: ['a', 'b', 'c', 'd'].map((tag) => ({
      id: `ref-seed-${tag}`,
      role: 'subject',
      transport: null,
      keepOverride: null,
      note: `seeded reference ${tag}`,
      source: { kind: 'file', path: `/seed/ref-${tag}.png`, name: `seed-ref-${tag}.png` },
    })),
  })
  await page.goto('/?images=1')
  await expect(page.locator('[data-iw-ref-count]')).toHaveText('4/9', { timeout: 15_000 })
  // Slow EVERY session write — both removes queue before the first reload.
  await page.route('**/api/lan/documents/chains/update', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900))
    await route.continue()
  })
  await page.locator('[data-iw-ref-slot="1"] .iw-ref-remove').click()
  await page.locator('[data-iw-ref-slot="2"] .iw-ref-remove').click()
  // Settle on DURABLE state: the second write has landed (two slots left).
  await expect.poll(async () => {
    const doc = await (await request.get(`/api/lan/documents/project?id=${seeded.projectId}`)).json()
    const chain = doc.chains.find((entry: { id: string }) => entry.id === seeded.chainId)
    return chain?.settings?.refs?.length ?? 0
  }, { timeout: 15_000 }).toBe(2)
  // EXACTLY the two targeted slots are gone: b and c removed, the untouched
  // d survives (positional composition used to delete d and keep c).
  const settled = await (await request.get(`/api/lan/documents/project?id=${seeded.projectId}`)).json()
  const settledChain = settled.chains.find((entry: { id: string }) => entry.id === seeded.chainId)
  expect(settledChain.settings.refs.map((slot: { id: string }) => slot.id)).toEqual(['ref-seed-a', 'ref-seed-d'])
  // The visible session agrees.
  await page.reload()
  await expect(page.locator('[data-iw-ref-count]')).toHaveText('2/9', { timeout: 15_000 })
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// (Component vocabulary task 20, k2q0n9s) The workbench's SESSION WRITES
// (the plan's second named consumer — the serialized patchSettings seam)
// surface the save-state tier beside Generate: idle silent, the busy idiom
// while a write is in flight, the muted confirmation when it lands, and —
// new — the failed state with the SERVER REASON verbatim plus retry. The
// retired failure path was a NoticeBanner line ('The session could not be
// saved: …'); the inline tier owns the failure now (one announcer, no
// double-report), and the retry re-runs the retained write through the SAME
// queue (nothing reverts a newer edit — the failed ops re-compose over the
// fresh base).
test('session writes surface save state; a failed write retries through the same queue (task 20)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const seeded = await seedSession(request)
  await page.goto('/?images=1')
  await expect(page.locator('[data-iw-intent]')).toBeVisible({ timeout: 15_000 })
  const root = page.locator('[data-iw-root]')
  const status = root.locator('[data-save-state]')

  // idle = silent.
  await expect(status).toHaveCount(0)

  // saving → saved through the real seam, the write held mid-flight.
  let releaseFirst!: () => void
  const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve })
  await page.route('**/api/lan/documents/chains/update', async (route) => {
    await firstHeld
    await route.continue()
  })
  await page.locator('[data-iw-intent]').fill('the saving arm intent')
  const saving = root.locator('[data-save-state="saving"]')
  await expect(saving).toBeVisible({ timeout: 10_000 })
  await expect(saving).toHaveAttribute('role', 'status')
  await expect(saving).toContainText('Saving session…')
  await expect(saving.locator('.spin')).toBeVisible() // the Button busy precedent
  releaseFirst()
  const saved = root.locator('[data-save-state="saved"]')
  await expect(saved).toBeVisible({ timeout: 10_000 })
  await expect(saved).toContainText('Session saved.')

  // failed: the server reason verbatim, an alert, retry present — and the
  // retired NoticeBanner double-report does NOT also fire.
  await page.unroute('**/api/lan/documents/chains/update')
  await page.route('**/api/lan/documents/chains/update', async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'T20 session save down' }) })
  })
  await page.locator('[data-iw-keep-dial]').fill('0.81')
  const failed = root.locator('[data-save-state="failed"]')
  await expect(failed).toBeVisible({ timeout: 10_000 })
  await expect(failed).toHaveAttribute('role', 'alert')
  await expect(failed).toHaveAttribute('aria-live', 'assertive')
  await expect(failed).toContainText('T20 session save down')
  await expect(page.locator('[data-iw-note]')).toHaveCount(0) // one announcer — the retired notice stays retired

  // retry: the route heals — saving again (held so it is observable), then
  // saved, and the write lands DURABLY (the API is the truth).
  await page.unroute('**/api/lan/documents/chains/update')
  let releaseRetry!: () => void
  const retryHeld = new Promise<void>((resolve) => { releaseRetry = resolve })
  await page.route('**/api/lan/documents/chains/update', async (route) => {
    await retryHeld
    await route.continue()
  })
  await failed.locator('[data-save-retry]').click()
  await expect(root.locator('[data-save-state="saving"]')).toBeVisible({ timeout: 5_000 })
  releaseRetry()
  await expect(root.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 10_000 })
  await expect.poll(async () => {
    const doc = await (await request.get(`/api/lan/documents/project?id=${seeded.projectId}`)).json()
    const chain = doc.chains.find((entry: { id: string }) => entry.id === seeded.chainId)
    return chain?.settings?.keepDial ?? null
  }, { timeout: 15_000 }).toBe(0.81)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// (Audit A11, task 3tu6ei6) The poserig handoff was consumed BEFORE the
// workbench session existed: on a cold navigation the inbox key was removed
// on the first effect pass, patchSettings early-returned on !sessionChain,
// and the delivered reference silently vanished — twice, for the auditor.
// The audit's own repro: open 'from pose rig', click 'Send to image
// workbench' — the pose reference must land in the strip and SURVIVE.
test('the poserig handoff lands as a pose reference from a cold navigation (A11)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  // Cold: NO open project — the workbench creates its canvas + session AFTER
  // the handoff arrives (the not-ready window the audit fell into).
  await request.post('/api/lan/documents/session', { data: { openProjects: [], activeProject: null } })
  await page.goto('/?poserig=1&send=iw')
  await expect(page.locator('[data-poserig="app"]')).toBeVisible({ timeout: 20_000 })
  await page.locator('[data-poserig-send-workbench]').click()
  // The Send ingests the blob, stashes the inbox, and navigates to ?images=1.
  await expect(page.locator('[data-iw-root]')).toBeVisible({ timeout: 20_000 })
  // The reference landed: 1/9, a pose-role slot carrying the rig render.
  await expect(page.locator('[data-iw-ref-count]')).toHaveText('1/9', { timeout: 20_000 })
  await expect(page.locator('[data-iw-ref-slot="0"] select[data-iw-ref-role="0"]')).toHaveValue('pose')
  await expect(page.locator('[data-iw-ref-slot="0"] .iw-poserig-tag')).toBeVisible()
  // It is DURABLE: the session chain's own settings carry the poserig slot.
  await expect.poll(async () => {
    const session = await (await request.get('/api/lan/documents/session')).json()
    const doc = await (await request.get(`/api/lan/documents/project?id=${session.session.activeProject}`)).json()
    const chain = doc.chains.find((entry: { kind: string }) => entry.kind === 'h3img')
    return chain?.settings?.refs?.length ?? 0
  }, { timeout: 15_000 }).toBe(1)
  // The inbox is consumed for good (no double-ingest on the next visit)…
  const leftover = await page.evaluate(() => window.localStorage.getItem('h3img-poserig-handoff'))
  expect(leftover).toBeNull()
  // …and the reference survives a reload (it was saved, not merely shown).
  await page.reload()
  await expect(page.locator('[data-iw-ref-count]')).toHaveText('1/9', { timeout: 20_000 })
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// (Audit A05, task 3tu6ei6) runExit had finally but no catch: an injected
// failure creating the continuation chain escaped as an unhandled rejection
// with the dialog frozen and no user-visible report. The frame pin (step 1)
// completing must still be reported against the failed chain creation
// (step 2) — a step-level notice, no unhandled rejection, busy cleared.
test('the start-frame exit reports a failed chain creation (A05): step notice, no unhandled rejection, busy cleared', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const seeded = await seedSession(request)
  await page.goto('/?images=1')
  await expect(page.locator(`[data-iw-take="${seeded.takeId}"]`)).toBeVisible({ timeout: 15_000 })
  // Fail ONLY the continuation chain (kind 'generate') — the frame pin's
  // media chain succeeds, so step 1 completes and step 2 is what failed.
  await page.route('**/api/lan/documents/chains', async (route) => {
    if (route.request().method() === 'POST' && (route.request().postData() ?? '').includes('"kind":"generate"')) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'AUDIT chain creation unavailable' }) })
      return
    }
    await route.continue()
  })
  await page.locator('[data-iw-exit]').click()
  const dialog = page.getByRole('dialog', { name: 'Start-frame exit' })
  await expect(dialog).toBeVisible()
  await page.locator('[data-iw-exit-choice="anchor"]').click()
  await page.locator('[data-iw-exit-confirm]').click()
  // The step-level notice names BOTH steps: the pin completed, the chain
  // creation failed. (Task 9, k2q0n9s: the banner is NoticeBanner — the
  // data attribute renamed with the vocabulary; the roles ride the
  // component.)
  const note = page.locator('[data-iw-note]')
  await expect(note).toContainText('pinned', { timeout: 15_000 })
  await expect(note).toContainText('could not be created')
  await expect(note).toContainText('AUDIT chain creation unavailable')
  await expect(note).toHaveAttribute('role', 'status')
  await expect(note).toHaveAttribute('aria-live', 'polite')
  await expect(note).toHaveClass(/notice-banner notice-banner--accent iw-note/)
  // (Final review I1) The notice is the render channel for this branch's
  // decision prose (step/save failures, decline guidance) — the same >=11px
  // computed floor as the other A10 pins, not the dead --text-2xs fallback.
  const noticeSize = await note.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
  expect(noticeSize, '[data-iw-note] renders at the >=11px floor').toBeGreaterThanOrEqual(11)
  // Busy cleared: the confirm control is live again (no frozen dialog).
  await expect(page.locator('[data-iw-exit-confirm]')).toBeEnabled()
  // Close the exit dialog so the banner beneath is reachable by pointer.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Start-frame exit' })).toHaveCount(0)
  // Task 9 (k2q0n9s): ONE dismiss contract — the × owns its handler. The
  // banner body never dismisses (the retired hand-rolled banner's
  // banner-click dismissal died with it); the button alone clears it.
  await note.click()
  await expect(note, 'clicking the banner body does not dismiss — the × is the only path').toBeVisible()
  await note.locator('button[aria-label="Dismiss"]').click()
  await expect(note).toHaveCount(0)
  // No unhandled rejection reached the page.
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// Component vocabulary task 9 (Flux k2q0n9s): the workbench's inline toast
// strip is DELETED — the surface mounts the shared adapter with
// placement="bottom-right". The placement prop is what positions the host
// (computed authority: fixed at the old .iw-toasts coordinates), toasts keep
// the store's contract through the adapter (roles per tone, auto-dismiss at
// the store's own 4.2 s), and the inline copy's classes are gone.
test('the workbench toast strip is the adapter at bottom-right — the placement prop positions (k2q0n9s)', async ({ page }) => {
  const problems = await trackErrors(page)
  const original = ((await (await page.request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
  try {
    await page.goto('/?images=1')
    await expect(page.locator('[data-iw-root]')).toBeVisible({ timeout: 20_000 })

    // The inline copy is dead: no iw-toasts strip anywhere — the mount is
    // the shared host placed bottom-right.
    await expect(page.locator('.iw-toasts')).toHaveCount(0)
    const host = page.locator('.toast-host')
    await expect(host).toHaveClass(/toast-host toast-host--bottom-right canvas-toasts/)
    const hostComputed = await host.evaluate((element) => {
      const cs = getComputedStyle(element)
      return { position: cs.position, right: cs.right, bottom: cs.bottom, display: cs.display, gap: cs.gap }
    })
    expect(hostComputed.position, 'bottom-right is the workbench placement (fixed)').toBe('fixed')
    expect(hostComputed.right).toBe('16px')
    expect(hostComputed.bottom).toBe('16px')
    expect(hostComputed.display, 'the base recipe\'s column layout (the retired .iw-toasts geometry)').toBe('flex')

    // A toast through a real flow (the settings save warning, M4's path):
    // the strip still lands there with its role, and the STORE still
    // auto-dismisses it at 4.2 s — the adapter never re-times.
    await page.locator('[data-iw-settings-button]').click()
    await expect(page.locator('[data-canvas-settings-dock]')).toBeVisible()
    await page.locator('#output-path').fill(path.join(os.tmpdir(), 't9-workbench-toast-definitely-missing'))
    await page.locator('[data-save-settings]').click()
    const toast = page.locator('.toast-host [data-canvas-toast="success"]').first()
    await expect(toast).toBeVisible({ timeout: 20_000 })
    await expect(toast).toHaveAttribute('role', 'status')
    await expect(toast).toHaveAttribute('aria-live', 'polite')
    await expect(toast).toBeHidden({ timeout: 8_000 })
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await page.request.post('/api/lan/settings', { data: { settings: original } }).catch(() => undefined)
  }
})

// Task 16 fix round 1 (I2): the StudioSelect wrap must FILL the .iw-row
// labels. Pre-migration the tier and resolution-locked selects were
// block-level width:100% children of their flexed labels (workbench.css's
// .iw-controls select rule); the migration's inline wrap needed the fill
// made an EXPLICIT contract (.iw-row label .studio-select) — the geometry
// was already held by the .iw-controls label > span blockification, so
// this pin holds with the rule removed; it exists so option-text-length
// drift can never silently shrink the rows. Covers BOTH named sites, and
// pins the label>span text idiom NOT reaching the select (the re-review's
// finding 2: uppercase/muted/letter-spacing must not cascade through the
// wrap — the retired selects were label siblings with normal-case text).
test('the workbench row selects fill their labels (StudioSelect wrap geometry, task 16 fix I2)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  await seedSession(request)

  // A REAL-sized canvas image for the masked-source lane: the seeded frames
  // are 1x1 PNGs and the mask composite snaps to the 32-grid (a 1px source
  // snaps to 0 — the use-mask path cannot run on it), so drop a 64x36
  // image onto the canvas first; it lands in the session's active project
  // and the workbench's canvas-source picker lists it.
  await page.goto('/?canvas=1')
  await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
  await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 36
    const context = canvas.getContext('2d')!
    context.fillStyle = '#2b3a55'
    context.fillRect(0, 0, 64, 36)
    const dataUrl = canvas.toDataURL('image/png')
    const binary = atob(dataUrl.split(',')[1])
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'fill-source.png', { type: 'image/png' }))
    document.querySelector('[data-canvas-root]')!.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }))
  })
  await expect(page.locator('[data-canvas-tile]').first()).toBeVisible({ timeout: 10_000 })

  await page.goto('/?images=1')
  await expect(page.locator('[data-iw-root]')).toBeVisible({ timeout: 15_000 })

  // A row select FILLS its label, on its OWN line under the label text: the
  // wrap's width:100% companion restores the pre-migration shape (a
  // block-level width:100% select wraps below the label's span), while the
  // unfixed inline wrap shrink-to-fits BESIDE the text — the stacking is the
  // discriminator the width ratio alone cannot carry (the flexed label hugs
  // its content either way).
  const fillPin = async (selector: string, name: string) => {
    const select = page.locator(selector)
    await expect(select).toBeVisible()
    const layout = await select.evaluate((element) => {
      const label = element.closest('label')
      const span = label?.querySelector('span')
      if (!label || !(span instanceof HTMLElement)) return { select: -1, label: -1, ownLine: false }
      const selectRect = element.getBoundingClientRect()
      return {
        select: selectRect.width,
        label: label.getBoundingClientRect().width,
        ownLine: selectRect.top >= span.getBoundingClientRect().bottom - 1,
      }
    })
    expect(layout.label, `${name}: the select sits inside a labelled row`).toBeGreaterThan(0)
    expect(layout.ownLine, `${name}: the filled select breaks to its own line under the label text`).toBe(true)
    expect(layout.select, `${name}: select ${layout.select.toFixed(0)}px fills the label (${layout.label.toFixed(0)}px)`).toBeGreaterThanOrEqual(layout.label * 0.9)
    // The label>span text idiom must not reach the select through the wrap:
    // RED against the unfixed cascade (the wrap matched .iw-controls
    // label > span and lent the select its uppercase/muted label-text paint).
    expect(await select.evaluate((node) => getComputedStyle(node).textTransform), `${name}: normal-case option text`).toBe('none')
    expect(await select.evaluate((node) => getComputedStyle(node).marginBottom), `${name}: no label-text margin`).toBe('0px')
  }

  // Site 1 — the boot-default packet family's tier row.
  await fillPin('[data-iw-tier] select', 'the tier select')

  // Site 2 — the inpaint lane's resolution-locked select: edit tab, the
  // masked sub-lane, the DROPPED canvas image as source, paint + USE the
  // mask (the lane refuses an empty mask — one stroke first).
  await page.locator('[data-iw-mode="edit"] > button').click()
  await page.locator('[data-iw-family-button="h3img.edit.inpaint"]').click()
  await page.locator('[data-iw-source-pick-canvas]').click()
  const picker = page.getByRole('dialog', { name: 'Use a canvas image as the source' })
  await expect(picker).toBeVisible()
  await picker.locator('[data-iw-canvas-ref][title*="fill-source"]').click()
  await expect(page.locator('[data-iw-source-name]')).toContainText('fill-source')
  await page.locator('[data-iw-paint-mask]').click()
  const painter = page.getByRole('dialog', { name: 'Paint the region to regenerate' })
  await expect(painter).toBeVisible()
  await page.waitForFunction(() => {
    const img = document.querySelector('.iw-mask-under')
    return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 1
  })
  const maskCanvas = painter.locator('[data-iw-mask-canvas]')
  const canvasBox = (await maskCanvas.boundingBox())!
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.75, canvasBox.y + canvasBox.height * 0.75, { steps: 4 })
  await page.mouse.up()
  await painter.locator('[data-iw-mask-use]').click()
  await expect(painter).toHaveCount(0)
  await expect(page.locator('[data-iw-resolution-locked]')).toBeVisible()
  await fillPin('[data-iw-resolution-locked]', 'the resolution-locked select')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})
