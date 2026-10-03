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
 *  session settings (default none) — the ref-strip tests' starting state. */
async function seedSession(request: APIRequestContext, options?: { refs?: Array<Record<string, unknown>> }): Promise<Seeded> {
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
  return { projectId: project.project.id, chainId: chain.chain.id, outputId: output.output.id, takeId: take.take.id, artifactPaths }
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
  const dialog = page.locator('[data-iw-exit-dialog]')
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
  await expect(page.locator('[data-iw-exit-dialog]')).not.toBeVisible()
  await expect.poll(async () => {
    const doc = await (await page.request.get(`/api/lan/documents/project?id=${(await (await page.request.get('/api/lan/documents/session')).json()).session.activeProject}`)).json()
    return doc.chains.filter((chain: { kind: string }) => chain.kind === 'media' || chain.kind === 'generate').length
  }, { timeout: 10_000 }).toBeGreaterThanOrEqual(2)
  const problemsAfter = problems.filter((entry) => !environmental(entry))
  expect(problemsAfter).toEqual([])
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
    await expect(page.locator('.iw-toasts [data-canvas-toast="success"]', { hasText: 'frame landed' }).first()).toBeVisible({ timeout: 15_000 })

    // (W1) The start-frame exit dialog carries dialog semantics and answers
    // Escape.
    await page.locator('[data-iw-exit]').click()
    const exitDialog = page.locator('[data-iw-exit-dialog]')
    await expect(exitDialog).toBeVisible()
    await expect(exitDialog.locator('[role="dialog"]')).toHaveAttribute('aria-modal', 'true')
    await expect(exitDialog.locator('[role="dialog"]')).toHaveAttribute('aria-label', 'Start-frame exit')
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
    const picker = page.locator('[data-iw-canvas-picker="source"]')
    await expect(picker).toBeVisible()
    await expect(picker.locator('[role="dialog"]')).toHaveAttribute('aria-modal', 'true')
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
  const dialog = page.locator('[data-iw-exit-dialog]')
  await expect(dialog).toBeVisible()
  await page.locator('[data-iw-exit-choice="anchor"]').click()
  await page.locator('[data-iw-exit-confirm]').click()
  // The step-level notice names BOTH steps: the pin completed, the chain
  // creation failed.
  await expect(page.locator('[data-iw-notice]')).toContainText('pinned', { timeout: 15_000 })
  await expect(page.locator('[data-iw-notice]')).toContainText('could not be created')
  await expect(page.locator('[data-iw-notice]')).toContainText('AUDIT chain creation unavailable')
  // (Final review I1) The notice is the render channel for this branch's
  // decision prose (step/save failures, decline guidance) — the same >=11px
  // computed floor as the other A10 pins, not the dead --text-2xs fallback.
  const noticeSize = await page.locator('[data-iw-notice]').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
  expect(noticeSize, '[data-iw-notice] renders at the >=11px floor').toBeGreaterThanOrEqual(11)
  // Busy cleared: the confirm control is live again (no frozen dialog).
  await expect(page.locator('[data-iw-exit-confirm]')).toBeEnabled()
  // No unhandled rejection reached the page.
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})
