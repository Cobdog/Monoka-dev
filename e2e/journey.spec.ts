import http from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
// Scratch-dir ledger + teardown (the wave-4 hygiene contract — per-run
// scratch never accumulates; the fresh-engine leg's designated models root
// is a real dir the studio's fs/check must verify).
import { makeScratchDir, removeAllScratchDirs } from '../tests/lib/scratch.cjs'

/**
 * THE JOURNEY-SWEEP ACCEPTANCE WALK (task c4fifi5 — reality audit
 * 2026-09-25 punch items #4/#6/#7/#9/#3): the maintainer's journey against
 * THE ENVIRONMENT MIRROR (e2e/mirror/fakeEngineServer.mjs + the
 * maintainer-instance profile — the standing artifact, not an inline stub).
 *
 *   #9  the wizard SURVIVES connection (the audit's F1: it vanished the
 *       moment the engine connected; steps 2-4 were unreachable) and
 *       reopens on demand from Settings.
 *   #4a the footer spawn bar carries the image/video lane toggle (F6:
 *       every post-first-chain spawn was a video chain).
 *   #4c an image chain is never labeled "text → video" (F8's mislabel).
 *   #4b the image lane's unavailable regeneration refuses honestly NAMING
 *       the Mamad8 T=1 gate at the point of choice (F8/M5).
 *   #7  the turbo fetch affordance never points at a catalog without the
 *       goods (F10: "fetch missing (8)" over an empty catalog).
 *   #6  a validation rejection never shows the literal `[redacted]` token
 *       (F11 — the Wave-1 bar extended to the validation surface).
 *   #3  live previews ROUTE through the PreviewOverride pack on the mirror
 *       (M6/C7 — the pack-class node appears in the submitted graph).
 *
 * Harness discipline: the mirror is a child process on a reserved ephemeral
 * port; the studio NEVER touches 8188/8189; settings are swapped + restored
 * around the walk (the wave1.spec.ts pattern); teardown is verified.
 */

const MIRROR_PROFILE = 'e2e/mirror/profiles/maintainer-instance.json'

type MirrorHistoryEntry = {
  prompt?: Array<Record<string, unknown>>
  outputs?: Record<string, unknown>
  status?: { status_str?: string; completed?: boolean }
}

async function mirrorJson(port: number, pathname: string, init?: { method?: string; body?: string }) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, init)
  return (await response.json()) as Record<string, unknown>
}

test('Journey sweep — the maintainer\'s walk on the environment mirror (#4/#6/#7/#9/#3)', async ({ page, request }) => {
  test.setTimeout(240_000)
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  // The mirror: the STANDING fake engine as a child process, on a port we
  // reserve first (nothing assumes 4199/5173/8188/8189 are ours).
  const holder = http.createServer(() => undefined)
  const mirrorPort = await new Promise<number>((resolve) => holder.listen(0, '127.0.0.1', () => resolve((holder.address() as AddressInfo).port)))
  await new Promise<void>((resolve) => holder.close(() => resolve()))
  const mirror: ChildProcess = spawn('node', [path.join(process.cwd(), 'e2e/mirror/fakeEngineServer.mjs'), '--port', String(mirrorPort), '--profile', MIRROR_PROFILE], { stdio: ['ignore', 'pipe', 'pipe'] })
  let mirrorLog = ''
  mirror.stdout?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  mirror.stderr?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  try {
    await expect.poll(async () => {
      try { await mirrorJson(mirrorPort, '/system_stats'); return true } catch { return false }
    }, { timeout: 15_000 }).toBe(true)

    // The studio points at the mirror BEFORE any page opens (the settings
    // POST pattern — the app must never probe its default URL).
    const originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
    const listed = ((await (await request.get('/api/lan/jobs')).json()) as { jobs?: Array<Record<string, unknown>> }).jobs
    const stale = (listed ?? []).filter((job) => job.status === 'queued' || job.status === 'running').map((job) => ({ ...job, status: 'cancelled' }))
    if (stale.length) await request.post('/api/lan/jobs', { data: { jobs: stale } })
    await request.post('/api/lan/settings', { data: { settings: {
      ...originalSettings,
      comfyUrl: `http://127.0.0.1:${mirrorPort}`,
      engine: { ...(originalSettings.engine as Record<string, unknown>), mode: 'external' },
    } } })
    await resetSession(page)

    // ---- STEP 1 (#9): the engine is UP at boot — the wizard still shows --
    // (F1: with a connected engine the registry is never empty, and the old
    // guard unmounted the wizard the moment models arrived. Steps 2-4 were
    // unreachable for exactly the maintainer's setup.)
    await page.goto('/?canvas=1')
    await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
    const wizard = page.locator('[data-canvas-wizard]')
    await expect(wizard).toBeVisible({ timeout: 30_000 })
    // THE PILLS ARE QUIET WHILE THE WALK PRESENTS (spec §2.2 — the R1
    // ruling: the header chip and the bar pill would contradict the step's
    // own verdict, so they unrender for the whole presentation).
    await expect(page.locator('[data-canvas-engine]')).toHaveCount(0, { timeout: 20_000 })
    await expect(page.locator('[data-canvas-bar-engine]')).toHaveCount(0)
    // The walk survives everything the engine does behind it — including
    // the connect that fills the registry (the audit's vanishing bug).
    await expect(wizard).toBeVisible()
    await expect(wizard).toHaveAttribute('data-wizard-step', '0')
    await expect(wizard).toContainText('1 of 5 — Engine')
    // The connect proof rides the walk's OWN Test (the candidate-scoped
    // check — task 2's path): the pill that used to carry it is quiet while
    // the walk presents.
    await page.locator('[data-wizard-test]').click()
    await expect(page.locator('[data-wizard-connected]')).toBeVisible({ timeout: 20_000 })

    // ---- STEP 2 (#9): steps 2-5 are completable (the audit's unreachable) -
    await page.locator('[data-wizard-next]').click()
    await expect(wizard).toHaveAttribute('data-wizard-step', '1')
    await expect(wizard).toContainText('2 of 5 — Models')
    // The Models step names per-component truth (a connected instance: the
    // mirror serves the full stack) — no counts anywhere. Five rows, the
    // resolved names verbatim, and the connect itself is proven by rows
    // reading present (the walk stayed up through it — F1 above).
    const componentRows = page.locator('[data-wizard-components] [data-wizard-model-row]')
    await expect(componentRows).toHaveCount(5, { timeout: 20_000 })
    await expect(page.locator('[data-wizard-model-row="FL2VA"]')).toHaveAttribute('data-row-present', 'true')
    await expect(page.locator('[data-wizard-model-row="FL2VA"] [data-wizard-row-name]')).toContainText('minimax_h3_fl2va_pruned_int8_convrot.safetensors')
    await expect(page.locator('[data-wizard-model-row="Turbo 8"]')).toHaveAttribute('data-row-present', 'true')
    // THE ONE VERDICT: the full text lane reads ready at mode 'text' — the
    // turbo LoRA's presence is the only optional member, and the step says
    // so exactly once (the old step text carried the report's turbo-gated
    // verdict and contradicted itself).
    await expect(page.locator('[data-wizard-verdict="ready"]')).toContainText('Ready to render', { timeout: 10_000 })
    await expect(page.locator('[data-wizard-verdict]')).toHaveCount(1)
    await page.locator('[data-wizard-next]').click()
    await expect(wizard).toHaveAttribute('data-wizard-step', '2')
    await expect(wizard).toContainText('3 of 5 — Node packs')
    await page.locator('[data-wizard-next]').click()
    await expect(wizard).toHaveAttribute('data-wizard-step', '3')
    await expect(wizard).toContainText('4 of 5 — LAN prep')
    // The LAN slot's honest keep-current panel (task 4's placeholder shell;
    // task 7 fills it).
    await expect(page.locator('[data-wizard-lan]')).toBeVisible()
    await page.locator('[data-wizard-next]').click()
    await expect(wizard).toHaveAttribute('data-wizard-step', '4')
    await expect(wizard).toContainText('5 of 5 — First prompt')
    // Skippable (never a nag)…
    await page.locator('[data-wizard-skip]').click()
    await expect(wizard).toHaveCount(0)

    // ---- STEP 3 (#9): the way back in — Settings reopens it on demand ----
    await page.locator('[data-canvas-settings-button]').click()
    await expect(page.locator('[data-canvas-settings-dock]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-settings-reopen-wizard]').click()
    await expect(wizard).toBeVisible({ timeout: 10_000 })
    await expect(wizard).toContainText('1 of 5 — Engine')
    // …and the dock closed behind the reopened wizard (one journey at a time).
    await expect(page.locator('[data-canvas-settings-dock]')).toHaveCount(0)
    await page.locator('[data-wizard-skip]').click()
    await expect(wizard).toHaveCount(0)
    // The pills return when the walk closes — and they read the CONNECTED
    // truth (quiet during presentation, not absent).
    await expect(page.locator('[data-canvas-engine]')).toHaveAttribute('data-engine-connected', 'true', { timeout: 20_000 })
    await expect(page.locator('[data-canvas-bar-engine], [data-canvas-engine]').first()).toContainText('ready', { timeout: 20_000 })

    // ---- STEP 4: the first video render (feeds #3's graph check) ---------
    await page.locator('[data-canvas-prompt]').fill('a lighthouse over a black sea, slow push-in')
    await page.locator('[data-canvas-submit]').click()
    const firstTile = page.locator('[data-canvas-tile]').first()
    await expect(firstTile).toBeVisible({ timeout: 15_000 })
    await expect(firstTile).toHaveAttribute('data-tile-status', 'idle', { timeout: 60_000 })

    // ---- STEP 5 (#3): the PreviewOverride pack owns this render's preview -
    // (M6/C7: PR #48 claims the pack routes when present; the audit's walk
    // found no override node in the graph the engine received. The mirror
    // serves the pack classes + taeh3 files — the submitted graph must carry
    // the pack's node with the taeh3 decoder by name.)
    await expect.poll(async () => {
      const history = (await mirrorJson(mirrorPort, '/history')) as Record<string, MirrorHistoryEntry>
      return Object.values(history).some((entry) => {
        const graph = (entry.prompt?.[2] ?? {}) as Record<string, { class_type?: string; inputs?: Record<string, unknown> }>
        return Object.values(graph).some((node) => typeof node?.class_type === 'string' && /MiniMaxH3PreviewOverride/.test(node.class_type))
      })
    }, { timeout: 20_000 }).toBe(true)
    // …with the decoder the mirror actually serves (the taeh3 fallback pick).
    const history = (await mirrorJson(mirrorPort, '/history')) as Record<string, MirrorHistoryEntry>
    const videoGraph = Object.values(history).flatMap((entry) => {
      const graph = (entry.prompt?.[2] ?? {}) as Record<string, { class_type?: string; inputs?: Record<string, unknown> }>
      return Object.values(graph)
    })
    const overrideNode = videoGraph.find((node) => typeof node?.class_type === 'string' && /MiniMaxH3PreviewOverride/.test(node.class_type!))
    expect(overrideNode?.inputs?.vae_name).toBe('taeh3_alpha.safetensors')

    // ---- STEP 6 (#4a): the footer spawn bar carries the lane toggle ------
    // (F6: once a chain exists the bar was video-only — the image lane had no
    // entrance after the hero.) Deselect, then the bar's empty context shows.
    await page.keyboard.press('Escape')
    const bar = page.locator('[data-canvas-bottombar]')
    await expect(bar).toHaveAttribute('data-canvas-bar-context', 'empty', { timeout: 10_000 })
    await expect(bar.locator('[data-canvas-bar-prompt]')).toBeVisible()
    await bar.locator('[data-canvas-bar-lane-toggle="image"]').click()
    await expect(bar.locator('[data-canvas-bar-lane="image"]')).toBeVisible()
    await bar.locator('[data-canvas-bar-prompt]').fill('a crisp product shot of a brass compass on chart paper')
    await bar.locator('[data-canvas-bar-prompt]').press('Enter')
    const tiles = page.locator('[data-canvas-tile]')
    await expect(tiles).toHaveCount(2, { timeout: 15_000 })

    // ---- STEP 7 (#4c): the image chain is never labeled "text → video" ---
    // The spawned image tile is selected by the spawn; the contextual bar's
    // mode chip must speak the image vocabulary (F8's mislabel dies).
    const barMode = bar.locator('[data-canvas-bar-mode]')
    await expect(bar).toHaveAttribute('data-canvas-bar-context', 'chain', { timeout: 10_000 })
    await expect(barMode).toHaveText(/image/i, { timeout: 10_000 })
    await expect(barMode).not.toHaveText(/video/i)

    // ---- STEP 8 (#4b): the honest Mamad8 gate at the point of choice -----
    // The image chain's generate refuses with the workbench ladder's honest
    // reason: the missing T=1 VAE FILE is named (the mirror serves neither
    // the Mamad8 decoder nor the Image Studio pack classes). The spawn
    // selected the tile and opened the inspector (the submitPrompt contract).
    const panel = page.locator('[data-canvas-properties]')
    await expect(panel).toBeVisible({ timeout: 10_000 })
    await expect(panel.locator('[data-canvas-validation]')).toContainText('minimax_h3_t1_image_vae', { timeout: 10_000 })
    await expect(panel.locator('[data-canvas-mode]')).not.toHaveText(/video/i)

    // ---- STEP 9 (#7): the fetch affordance states the catalog's truth -----
    // POST-T1 REALITY (2026-10-19; the leg's old premise died with c9cc631):
    // the lightx2v FL2V turbo rows landed in the fetch catalog, so of the
    // mirror's 8 missing turbo families ONE is now deliverable — the
    // affordance is honestly the fetch BUTTON, not the dead-end note. The
    // R-19 pin survives inverted: the button renders only when catalog rows
    // deliver a missing family (a nonzero count, named), and the note branch
    // — for families no row delivers — never promises "fetchable there"
    // (unit-pinned in tests/canvas.test.js, the empty-catalog case).
    const videoTile = page.locator('[data-canvas-tile]', { hasText: 'lighthouse' })
    await videoTile.click()
    // The completed video render landed its take — the tile is a MEDIA object
    // (transport + properties in the bar).
    await expect(bar).toHaveAttribute('data-canvas-bar-context', 'media', { timeout: 10_000 })
    await page.locator('[data-canvas-bar-properties]').click()
    await expect(panel.locator('[data-canvas-section="engine"]')).toBeVisible()
    await expect(panel.locator('[data-canvas-turbo-fetch]')).toBeVisible({ timeout: 10_000 })
    await expect(panel.locator('[data-canvas-turbo-fetch]')).toContainText(/fetch missing \([1-9]\d*\)/)
    await expect(panel.locator('[data-canvas-turbo-fetch-note]')).toHaveCount(0)

    // ---- STEP 10 (#6): a validation rejection carries no [redacted] token -
    await mirrorJson(mirrorPort, '/__control', { method: 'POST', body: JSON.stringify({ failMode: 'validation' }) })
    await page.locator('[data-canvas-generate]').click()
    const validationToast = page.locator('[data-canvas-toast="error"]', { hasText: 'Graph validation failed' })
    await expect(validationToast.first()).toBeVisible({ timeout: 20_000 })
    const toastText = (await validationToast.first().innerText()).trim()
    expect(toastText.includes('[redacted]'), `the toast must carry no redaction marker (got: ${toastText})`).toBe(false)
    for (const token of ['MiniMaxH3ImageToVideo', 'value_smaller_than_min']) {
      expect(toastText.includes(token), `the structural signal survives: ${token} (got: ${toastText})`).toBe(true)
    }
    // The persisted job error carries no marker either (the failed card's
    // alert renders it).
    await expect.poll(async () => {
      const jobs = ((await (await request.get('/api/lan/jobs')).json()) as { jobs: Array<{ status: string; error?: string }> }).jobs
      return jobs.find((job) => (job.error ?? '').includes('Graph validation failed'))?.error ?? ''
    }, { timeout: 15_000 }).resolves
    const jobs = ((await (await request.get('/api/lan/jobs')).json()) as { jobs: Array<{ status: string; error?: string }> }).jobs
    const validationError = jobs.find((job) => (job.error ?? '').includes('Graph validation failed'))?.error ?? ''
    expect(validationError.includes('[redacted]'), `the job error must carry no marker (got: ${validationError})`).toBe(false)
    await mirrorJson(mirrorPort, '/__control', { method: 'POST', body: JSON.stringify({ failMode: null }) })

    // No harness-caused page errors (business failures are honest toasts).
    expect(problems, `page errors: ${problems.join(' | ')}`).toEqual([])

    // ---- teardown ----------------------------------------------------------
    await request.post('/api/lan/settings', { data: { settings: originalSettings } })
    await resetSession(page)
  } finally {
    mirror.kill('SIGINT')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { mirror.kill('SIGKILL'); resolve() }, 5_000)
      mirror.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
  // The child actually exited (never an orphaned fake engine): a signal kill
  // leaves exitCode null and `signal` set — either way the process is gone.
  expect(mirror.exitCode !== null || mirror.signalCode !== null).toBe(true)
  expect(mirrorLog).not.toContain('EADDRINUSE')
})

/** (W18, perfect-state sweep 2026-09-27) The START-FRAME lane's
 *  preview-override wiring: the walk's one sampled image→video graph
 *  (LoadImage + MiniMaxH3ImageToVideo + PreviewImage) carried NO
 *  MiniMaxH3PreviewOverrideCS node, while the resolver claims it wires
 *  whenever livePreview (always on for canvas renders) + the pack class +
 *  the taeh3 decoder resolve. The builder is mode-independent by
 *  construction — this pin proves it at WIRING truth on the mirror: bind a
 *  dropped image as the chain's FIRST FRAME (mode 'image'), generate, and
 *  read the graph the engine actually received. */
test('the start-frame (image→video) lane wires the PreviewOverride pack node', async ({ page, request }) => {
  await seedWalkDone(page)
  test.setTimeout(240_000)
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  const holder = http.createServer(() => undefined)
  const mirrorPort = await new Promise<number>((resolve) => holder.listen(0, '127.0.0.1', () => resolve((holder.address() as AddressInfo).port)))
  await new Promise<void>((resolve) => holder.close(() => resolve()))
  const mirror: ChildProcess = spawn('node', [path.join(process.cwd(), 'e2e/mirror/fakeEngineServer.mjs'), '--port', String(mirrorPort), '--profile', MIRROR_PROFILE], { stdio: ['ignore', 'pipe', 'pipe'] })
  let mirrorLog = ''
  mirror.stdout?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  mirror.stderr?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  try {
    await expect.poll(async () => {
      try { await mirrorJson(mirrorPort, '/system_stats'); return true } catch { return false }
    }, { timeout: 15_000 }).toBe(true)
    const originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
    await request.post('/api/lan/settings', { data: { settings: {
      ...originalSettings,
      comfyUrl: `http://127.0.0.1:${mirrorPort}`,
      engine: { ...(originalSettings.engine as Record<string, unknown>), mode: 'external' },
    } } })
    await resetSession(page)

    await page.goto('/?canvas=1')
    await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
    await expect(page.locator('[data-canvas-engine]')).toHaveAttribute('data-engine-connected', 'true', { timeout: 20_000 })
    // The video chain the start frame anchors into.
    await page.locator('[data-canvas-prompt]').fill('a lighthouse over a black sea, start-frame anchored')
    await page.locator('[data-canvas-submit]').click()
    await expect(page.locator('[data-canvas-tile]')).toHaveCount(1, { timeout: 15_000 })
    // Drop the anchor image (a real media chain object).
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 360
      const context = canvas.getContext('2d')!
      context.fillStyle = '#1d2b1f'
      context.fillRect(0, 0, 640, 360)
      context.fillStyle = '#e8d04b'
      context.fillRect(280, 90, 80, 200)
      const dataUrl = canvas.toDataURL('image/png')
      const binary = atob(dataUrl.split(',')[1])
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'start-frame.png', { type: 'image/png' }))
      document.querySelector('[data-canvas-root]')!.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }))
    })
    await expect(page.locator('[data-canvas-tile]')).toHaveCount(2, { timeout: 15_000 })
    // Bind it as the render chain's FIRST FRAME — the lane whose sampled
    // graph lacked the override node (the workbench exit writes exactly
    // this field).
    const document = await (await page.evaluate(async () => {
      const session = await (await fetch('/api/lan/documents/session')).json() as { session: { activeProject: string | null } }
      const response = await fetch(`/api/lan/documents/project?id=${encodeURIComponent(session.session.activeProject!)}`)
      return (await response.json()) as {
        chains: Array<{ id: string; kind: string; settings: Record<string, unknown>; outputs: Array<{ id: string }> }>
      }
    }))
    const renderChain = document.chains.find((chain) => chain.kind === 'generation')!
    const mediaChain = document.chains.find((chain) => chain.kind === 'media')!
    await page.request.post('/api/lan/documents/chains/update', { data: { id: renderChain.id, settings: { ...renderChain.settings, firstFrameOutputId: mediaChain.outputs[0]!.id } } })
    await page.reload()
    await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
    await page.locator(`[data-canvas-tile="${renderChain.id}"]`).click()
    await expect(page.locator('[data-canvas-properties]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-canvas-generate]').click()

    type GraphNode = { class_type?: string; inputs?: Record<string, unknown> }
    const findStartFrameGraph = async () => {
      const history = (await mirrorJson(mirrorPort, '/history')) as Record<string, MirrorHistoryEntry>
      for (const entry of Object.values(history)) {
        const graph = (entry.prompt?.[2] ?? {}) as Record<string, GraphNode>
        if (Object.values(graph).some((node) => node.class_type === 'MiniMaxH3ImageToVideo')) return graph
      }
      return null
    }
    await expect.poll(() => findStartFrameGraph().then((graph) => graph !== null), { timeout: 30_000 }).toBe(true)
    const i2vGraph = (await findStartFrameGraph())!
    // THE SWEEP CHECK: the same graph carries the pack's preview node — the
    // override owns preview decoding on EVERY lane, this one included.
    const overrideNode = Object.values(i2vGraph).find((node) => typeof node?.class_type === 'string' && /MiniMaxH3PreviewOverride/.test(node.class_type!))
    expect(overrideNode, 'the start-frame lane\'s graph carries the PreviewOverride pack node').toBeDefined()
    expect(overrideNode?.inputs?.vae_name).toBe('taeh3_alpha.safetensors')

    expect(problems, `page errors: ${problems.join(' | ')}`).toEqual([])

    await request.post('/api/lan/settings', { data: { settings: originalSettings } })
    await resetSession(page)
  } finally {
    mirror.kill('SIGINT')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { mirror.kill('SIGKILL'); resolve() }, 5_000)
      mirror.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
  expect(mirror.exitCode !== null || mirror.signalCode !== null).toBe(true)
  expect(mirrorLog).not.toContain('EADDRINUSE')
})

/** (task 5, §2.2) Seeds the walk's local latch DONE and the fallback notice
 *  dismissed: these legs' subject is the render pipeline, not the walk — and
 *  the walk owns the canvas moment while it presents (silencing the engine
 *  pills those legs' boot-sync gates read). */
async function seedWalkDone(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('monoka.wizard', JSON.stringify({ step: 0, done: true, skipped: false }))
    localStorage.setItem('monoka.first-run-dismissed', '1')
  })
}

async function resetSession(page: Page) {
  await page.request.post('/api/lan/documents/session', { data: { openProjects: [], activeProject: null } })
  const listed = await page.request.get('/api/lan/jobs')
  if (listed.ok()) {
    const body = (await listed.json()) as { jobs?: Array<Record<string, unknown>> }
    const stale = (body.jobs ?? []).filter((job) => job.status === 'queued' || job.status === 'running' || job.status === 'pending').map((job) => ({ ...job, status: 'cancelled' }))
    if (stale.length) await page.request.post('/api/lan/jobs', { data: { jobs: stale } })
  }
}

/** (gfv5h0g — the R2 fix of the 2026-10-15 blind UX review) SERVER-OWNED
 *  JOBS at execution truth on the mirror: a render whose originator tab
 *  closes MID-SAMPLING still lands its take on its chain — the review's
 *  reproduced defect was exactly this vanish (engine history held the mp4,
 *  jobs/canvas_output held zero rows, and the ⌘K "job · completed" row knew
 *  better than the document). The server's job watcher owns observation and
 *  landing now; the fresh session + the palette recover the output. */
test('a render that outlives its tab lands anyway — the fresh session and the palette recover it (gfv5h0g)', async ({ page, request }) => {
  await seedWalkDone(page)
  test.setTimeout(240_000)
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  const holder = http.createServer(() => undefined)
  const mirrorPort = await new Promise<number>((resolve) => holder.listen(0, '127.0.0.1', () => resolve((holder.address() as AddressInfo).port)))
  await new Promise<void>((resolve) => holder.close(() => resolve()))
  const mirror: ChildProcess = spawn('node', [path.join(process.cwd(), 'e2e/mirror/fakeEngineServer.mjs'), '--port', String(mirrorPort), '--profile', MIRROR_PROFILE], { stdio: ['ignore', 'pipe', 'pipe'] })
  let mirrorLog = ''
  mirror.stdout?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  mirror.stderr?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  try {
    await expect.poll(async () => {
      try { await mirrorJson(mirrorPort, '/system_stats'); return true } catch { return false }
    }, { timeout: 15_000 }).toBe(true)
    const originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
    await request.post('/api/lan/settings', { data: { settings: {
      ...originalSettings,
      comfyUrl: `http://127.0.0.1:${mirrorPort}`,
      engine: { ...(originalSettings.engine as Record<string, unknown>), mode: 'external' },
    } } })
    await resetSession(page)
    // Slow the render so the tab close lands MID-SAMPLING, not after.
    await mirrorJson(mirrorPort, '/__control', { method: 'POST', body: JSON.stringify({ stepDelayMs: 1200 }) })

    // The originator surface: submit a real render through the UI.
    await page.goto('/?canvas=1')
    await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
    await expect(page.locator('[data-canvas-engine]')).toHaveAttribute('data-engine-connected', 'true', { timeout: 20_000 })
    await page.locator('[data-canvas-prompt]').fill('a lighthouse over a black sea, outliving its tab')
    await page.locator('[data-canvas-submit]').click()
    await expect(page.locator('[data-canvas-tile]')).toHaveCount(1, { timeout: 15_000 })

    // The job must be SERVER-known before the tab dies (the debounced
    // persist lands within ~1 s of submit) — then close MID-RENDER.
    let jobId = ''
    await expect.poll(async () => {
      const jobs = ((await (await request.get('/api/lan/jobs')).json()) as { jobs: Array<{ id: string; promptId?: string; status: string }> }).jobs
      jobId = jobs.find((job) => job.promptId && job.status === 'running')?.id ?? ''
      return jobId
    }, { timeout: 20_000 }).toBeTruthy()
    await expect.poll(async () => {
      const queue = (await mirrorJson(mirrorPort, '/queue')) as { queue_running: unknown[] }
      return queue.queue_running.length
    }, { timeout: 20_000 }).toBe(1)
    await page.close()

    // NO SURFACE EXISTS NOW. The server owns the rest: the job settles and
    // the take lands on its chain (bounded poll for the named conditions).
    await expect.poll(async () => {
      const jobs = ((await (await request.get('/api/lan/jobs')).json()) as { jobs: Array<{ id: string; status: string }> }).jobs
      return jobs.find((job) => job.id === jobId)?.status ?? null
    }, { timeout: 60_000 }).toBe('completed')
    await expect.poll(async () => {
      const session = ((await (await request.get('/api/lan/documents/session')).json()) as { session: { activeProject: string | null } }).session
      if (!session.activeProject) return null
      const document = ((await (await request.get(`/api/lan/documents/project?id=${encodeURIComponent(session.activeProject)}`)).json()) as {
        chains: Array<{ outputs: Array<{ takes: Array<{ jobId: string | null; artifacts: string[] }> }> }>
      })
      return document.chains.some((chain) => chain.outputs.some((output) => output.takes.some((take) => take.jobId === jobId && take.artifacts.length > 0)))
    }, { timeout: 30_000 }).toBe(true)

    // THE FRESH SESSION recovers: the chain's tile carries its landed media.
    const fresh = await page.context().newPage()
    fresh.on('pageerror', (error) => problems.push(`fresh pageerror: ${error.message}`))
    try {
      await fresh.goto('/?canvas=1')
      await expect(fresh.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
      const recoveredTile = fresh.locator('[data-canvas-tile]').first()
      await expect(recoveredTile).toBeVisible({ timeout: 15_000 })
      await recoveredTile.click()
      await expect(fresh.locator('[data-canvas-bottombar]')).toHaveAttribute('data-canvas-bar-context', 'media', { timeout: 15_000 })

      // THE PALETTE RECOVERS: the job row names its completed state on the
      // canvas (never "not on an open canvas"), and its click lands on the
      // chain that owns the take. The needle filters the shared home's
      // accumulated canvases out first — the palette's 40-row cap otherwise
      // buries the job row under them (the testing.md accumulation class).
      await fresh.keyboard.press('ControlOrMeta+k')
      await expect(fresh.locator('[data-canvas-index]')).toBeVisible()
      await fresh.locator('[data-canvas-index-input]').fill('outliving its tab')
      // .first(): the jobs list is newest-first, and the shared home
      // accumulates this test's own prior runs (same prompt).
      const jobRow = fresh.locator('[data-canvas-index-row="job"]', { hasText: 'outliving its tab' }).first()
      await expect(jobRow).toBeVisible({ timeout: 10_000 })
      await expect(jobRow).not.toHaveAttribute('disabled')
      await expect(jobRow).toContainText('job · completed')
      await expect(jobRow).not.toContainText('not on an open canvas')
      await jobRow.click()
      await expect(fresh.locator('[data-canvas-index]')).toHaveCount(0)
      await expect(fresh.locator('[data-canvas-properties]')).toBeVisible({ timeout: 10_000 })
      await expect(fresh.locator('[data-canvas-bottombar]')).toHaveAttribute('data-canvas-bar-context', 'media')
    } finally {
      await fresh.close()
    }

    expect(problems, `page errors: ${problems.join(' | ')}`).toEqual([])
    await request.post('/api/lan/settings', { data: { settings: originalSettings } })
    await resetSession(page)
  } finally {
    mirror.kill('SIGINT')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { mirror.kill('SIGKILL'); resolve() }, 5_000)
      mirror.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
  expect(mirror.exitCode !== null || mirror.signalCode !== null).toBe(true)
  expect(mirrorLog).not.toContain('EADDRINUSE')
})

/** (gfv5h0g, F2) THE DEAD CLICK: a generate that cannot submit refuses
 *  INLINE naming why — the blind review's enabled-but-silent button (no
 *  request, no error) and its stray-node twin both died here. This leg
 *  drives the queued-engine refusal: the click produces the inline Refusal
 *  tier with the registry's own reason, and NOTHING submits. */
test('the generate click refuses inline — a queued engine names why and nothing submits (gfv5h0g F2)', async ({ page, request }) => {
  test.setTimeout(180_000)
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  const holder = http.createServer(() => undefined)
  const mirrorPort = await new Promise<number>((resolve) => holder.listen(0, '127.0.0.1', () => resolve((holder.address() as AddressInfo).port)))
  await new Promise<void>((resolve) => holder.close(() => resolve()))
  const mirror: ChildProcess = spawn('node', [path.join(process.cwd(), 'e2e/mirror/fakeEngineServer.mjs'), '--port', String(mirrorPort), '--profile', MIRROR_PROFILE], { stdio: ['ignore', 'pipe', 'pipe'] })
  let mirrorLog = ''
  mirror.stdout?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  mirror.stderr?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  try {
    await expect.poll(async () => {
      try { await mirrorJson(mirrorPort, '/system_stats'); return true } catch { return false }
    }, { timeout: 15_000 }).toBe(true)
    const originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
    await request.post('/api/lan/settings', { data: { settings: {
      ...originalSettings,
      comfyUrl: `http://127.0.0.1:${mirrorPort}`,
      engine: { ...(originalSettings.engine as Record<string, unknown>), mode: 'external' },
    } } })
    await resetSession(page)

    await page.goto('/?canvas=1')
    await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
    // Spawn an IMAGE chain from the hero's lane toggle (the blank-canvas
    // launcher owns the first spawn; the bottom bar exists only once a tile
    // does), then point it at the QUEUED engine slot.
    await page.locator('[data-canvas-chip="image"]').click()
    await page.locator('[data-canvas-prompt]').fill('a crisp brass compass on chart paper')
    await page.locator('[data-canvas-submit]').click()
    await expect(page.locator('[data-canvas-tile]')).toHaveCount(1, { timeout: 15_000 })
    const document = await (await page.evaluate(async () => {
      const session = await (await fetch('/api/lan/documents/session')).json() as { session: { activeProject: string | null } }
      const response = await fetch(`/api/lan/documents/project?id=${encodeURIComponent(session.session.activeProject!)}`)
      return (await response.json()) as {
        chains: Array<{ id: string; kind: string; settings: Record<string, unknown> }>
      }
    }))
    const imageChain = document.chains.find((chain) => chain.kind === 'generation')!
    await page.request.post('/api/lan/documents/chains/update', { data: { id: imageChain.id, settings: { ...imageChain.settings, imageEngine: 'krea2' } } })
    await page.reload()
    await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
    await page.locator(`[data-canvas-tile="${imageChain.id}"]`).click()
    await expect(page.locator('[data-canvas-properties]')).toBeVisible({ timeout: 10_000 })

    // THE CLICK: refused INLINE, the registry's own reason verbatim.
    await page.locator('[data-canvas-generate]').click()
    const refusal = page.locator('[data-refusal]')
    await expect(refusal).toBeVisible({ timeout: 10_000 })
    await expect(refusal.locator('[data-refusal-reason]')).toContainText('Krea 2 stills engine is queued')
    // Nothing submitted: no stop button ever replaces generate (no job
    // parked on the chain), and no prompt reached the engine.
    await expect(page.locator('[data-canvas-cancel]')).toHaveCount(0)
    await expect.poll(async () => {
      const history = (await mirrorJson(mirrorPort, '/history')) as Record<string, unknown>
      return Object.keys(history).length
    }, { timeout: 5_000 }).toBe(0)

    expect(problems, `page errors: ${problems.join(' | ')}`).toEqual([])
    await request.post('/api/lan/settings', { data: { settings: originalSettings } })
    await resetSession(page)
  } finally {
    mirror.kill('SIGINT')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { mirror.kill('SIGKILL'); resolve() }, 5_000)
      mirror.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
  expect(mirror.exitCode !== null || mirror.signalCode !== null).toBe(true)
  expect(mirrorLog).not.toContain('EADDRINUSE')
})

/** (gfv5h0g, F2) THE STRAY NODE: generate NEVER spawns objects as a side
 *  effect. The old image-with-reference handoff full-navigated to the
 *  workbench, whose session bootstrap minted an EMPTY h3img object on this
 *  canvas — the blind review's undeletable stray. The click now refuses
 *  inline naming where the lane lives; no navigation, no session node. */
test('generate never spawns workbench session nodes — the image+reference lane refuses inline (gfv5h0g F2)', async ({ page, request }) => {
  test.setTimeout(180_000)
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  const holder = http.createServer(() => undefined)
  const mirrorPort = await new Promise<number>((resolve) => holder.listen(0, '127.0.0.1', () => resolve((holder.address() as AddressInfo).port)))
  await new Promise<void>((resolve) => holder.close(() => resolve()))
  const mirror: ChildProcess = spawn('node', [path.join(process.cwd(), 'e2e/mirror/fakeEngineServer.mjs'), '--port', String(mirrorPort), '--profile', MIRROR_PROFILE], { stdio: ['ignore', 'pipe', 'pipe'] })
  let mirrorLog = ''
  mirror.stdout?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  mirror.stderr?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  try {
    await expect.poll(async () => {
      try { await mirrorJson(mirrorPort, '/system_stats'); return true } catch { return false }
    }, { timeout: 15_000 }).toBe(true)
    const originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
    await request.post('/api/lan/settings', { data: { settings: {
      ...originalSettings,
      comfyUrl: `http://127.0.0.1:${mirrorPort}`,
      engine: { ...(originalSettings.engine as Record<string, unknown>), mode: 'external' },
    } } })
    await resetSession(page)

    await page.goto('/?canvas=1')
    await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
    // An IMAGE chain with a BOUND first frame — the mode whose old generate
    // full-navigated to the workbench. The hero's lane toggle owns the first
    // spawn on a blank canvas.
    await page.locator('[data-canvas-chip="image"]').click()
    await page.locator('[data-canvas-prompt]').fill('a winter lighthouse study, anchored')
    await page.locator('[data-canvas-submit]').click()
    await expect(page.locator('[data-canvas-tile]')).toHaveCount(1, { timeout: 15_000 })
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 360
      const context = canvas.getContext('2d')!
      context.fillStyle = '#1d2b1f'
      context.fillRect(0, 0, 640, 360)
      context.fillStyle = '#e8d04b'
      context.fillRect(280, 90, 80, 200)
      const dataUrl = canvas.toDataURL('image/png')
      const binary = atob(dataUrl.split(',')[1])
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'anchor.png', { type: 'image/png' }))
      document.querySelector('[data-canvas-root]')!.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }))
    })
    await expect(page.locator('[data-canvas-tile]')).toHaveCount(2, { timeout: 15_000 })
    const document = await (await page.evaluate(async () => {
      const session = await (await fetch('/api/lan/documents/session')).json() as { session: { activeProject: string | null } }
      const response = await fetch(`/api/lan/documents/project?id=${encodeURIComponent(session.session.activeProject!)}`)
      return (await response.json()) as {
        chains: Array<{ id: string; kind: string; settings: Record<string, unknown>; outputs: Array<{ id: string }> }>
      }
    }))
    const imageChain = document.chains.find((chain) => chain.kind === 'generation')!
    const mediaChain = document.chains.find((chain) => chain.kind === 'media')!
    await page.request.post('/api/lan/documents/chains/update', { data: { id: imageChain.id, settings: { ...imageChain.settings, firstFrameOutputId: mediaChain.outputs[0]!.id } } })
    await page.reload()
    await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
    await page.locator(`[data-canvas-tile="${imageChain.id}"]`).click()
    await expect(page.locator('[data-canvas-properties]')).toBeVisible({ timeout: 10_000 })

    // THE CLICK: refused inline; the canvas stays exactly where it was.
    await page.locator('[data-canvas-generate]').click()
    const refusal = page.locator('[data-refusal]')
    await expect(refusal).toBeVisible({ timeout: 10_000 })
    await expect(refusal.locator('[data-refusal-reason]')).toContainText("workbench's Edit surface")
    // No navigation away from the canvas…
    expect(new URL(page.url()).searchParams.get('images')).toBe(null)
    // …and NO workbench session object was spawned as a side effect.
    await expect.poll(async () => {
      const session = ((await (await page.request.get('/api/lan/documents/session')).json()) as { session: { activeProject: string | null } }).session
      if (!session.activeProject) return null
      const current = ((await (await page.request.get(`/api/lan/documents/project?id=${encodeURIComponent(session.activeProject)}`)).json()) as {
        chains: Array<{ kind: string }>
      })
      return current.chains.some((chain) => chain.kind === 'h3img')
    }, { timeout: 10_000 }).toBe(false)

    expect(problems, `page errors: ${problems.join(' | ')}`).toEqual([])
    await request.post('/api/lan/settings', { data: { settings: originalSettings } })
    await resetSession(page)
  } finally {
    mirror.kill('SIGINT')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { mirror.kill('SIGKILL'); resolve() }, 5_000)
      mirror.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
  expect(mirror.exitCode !== null || mirror.signalCode !== null).toBe(true)
  expect(mirrorLog).not.toContain('EADDRINUSE')
})

/** THE REFERENCE-PREP RULING (maintainer 2026-09-26, directive 1e363ec0
 *  item 5): "scaled longest side to the selected resolution. Never
 *  cropped." Proven at WIRING truth on the environment mirror: a 1:2
 *  portrait reference bound to a 1344x768 (16:9) render must reach the
 *  engine as a 672x1344 PNG — longest side matched, aspect preserved, zero
 *  crop. The old path cover-cropped it into the output ratio (1344x768),
 *  destroying half the reference; the conditioning node takes unconstrained
 *  IMAGE refs and scales them itself, so the true aspect is what it wants.
 *  The proof reads the PNG the engine ACTUALLY received (IHDR of the
 *  uploaded bytes served back from the mirror's /view). */
test('reference prep on the mirror: longest side to the resolution, aspect preserved, never cropped', async ({ page, request }) => {
  await seedWalkDone(page)
  test.setTimeout(240_000)
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  const holder = http.createServer(() => undefined)
  const mirrorPort = await new Promise<number>((resolve) => holder.listen(0, '127.0.0.1', () => resolve((holder.address() as AddressInfo).port)))
  await new Promise<void>((resolve) => holder.close(() => resolve()))
  const mirror: ChildProcess = spawn('node', [path.join(process.cwd(), 'e2e/mirror/fakeEngineServer.mjs'), '--port', String(mirrorPort), '--profile', MIRROR_PROFILE], { stdio: ['ignore', 'pipe', 'pipe'] })
  let mirrorLog = ''
  mirror.stdout?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  mirror.stderr?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  try {
    await expect.poll(async () => {
      try { await mirrorJson(mirrorPort, '/system_stats'); return true } catch { return false }
    }, { timeout: 15_000 }).toBe(true)
    const originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
    await request.post('/api/lan/settings', { data: { settings: {
      ...originalSettings,
      comfyUrl: `http://127.0.0.1:${mirrorPort}`,
      engine: { ...(originalSettings.engine as Record<string, unknown>), mode: 'external' },
    } } })
    await resetSession(page)

    await page.goto('/?canvas=1')
    await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
    await expect(page.locator('[data-canvas-engine]')).toHaveAttribute('data-engine-connected', 'true', { timeout: 20_000 })
    // The render chain (16:9 default → 1344x768; longest side 1344).
    await page.locator('[data-canvas-prompt]').fill('a tall glass tower over a frozen lake, reference study')
    await page.locator('[data-canvas-submit]').click()
    await expect(page.locator('[data-canvas-tile]')).toHaveCount(1, { timeout: 15_000 })
    // Drop a 1:2 PORTRAIT reference (500x1000).
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 500
      canvas.height = 1000
      const context = canvas.getContext('2d')!
      context.fillStyle = '#2b3a55'
      context.fillRect(0, 0, 500, 1000)
      context.fillStyle = '#e8b04b'
      context.fillRect(120, 300, 260, 400)
      const dataUrl = canvas.toDataURL('image/png')
      const binary = atob(dataUrl.split(',')[1])
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'portrait-reference.png', { type: 'image/png' }))
      document.querySelector('[data-canvas-root]')!.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }))
    })
    await expect(page.locator('[data-canvas-tile]')).toHaveCount(2, { timeout: 15_000 })
    // Bind it as the render's reference (the drop + documents-API write).
    const document = await (await page.evaluate(async () => {
      const session = await (await fetch('/api/lan/documents/session')).json() as { session: { activeProject: string | null } }
      const response = await fetch(`/api/lan/documents/project?id=${encodeURIComponent(session.session.activeProject!)}`)
      return (await response.json()) as {
        chains: Array<{ id: string; kind: string; settings: Record<string, unknown>; outputs: Array<{ id: string }> }>
      }
    }))
    const renderChain = document.chains.find((chain) => chain.kind === 'generation')!
    const mediaChain = document.chains.find((chain) => chain.kind === 'media')!
    await page.request.post('/api/lan/documents/chains/update', { data: { id: renderChain.id, settings: { ...renderChain.settings, referenceOutputIds: [mediaChain.outputs[0]!.id] } } })
    await page.reload()
    await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
    await page.locator(`[data-canvas-tile="${renderChain.id}"]`).click()
    await expect(page.locator('[data-canvas-properties]')).toBeVisible({ timeout: 10_000 })

    // Generate: the reference-mode render uploads the PREPARED reference,
    // then submits the graph naming it.
    await page.locator('[data-canvas-generate]').click()

    type GraphNode = { class_type?: string; inputs?: Record<string, unknown> }
    const findReferenceGraph = async () => {
      const history = (await mirrorJson(mirrorPort, '/history')) as Record<string, MirrorHistoryEntry>
      for (const entry of Object.values(history)) {
        const graph = (entry.prompt?.[2] ?? {}) as Record<string, GraphNode>
        if (Object.values(graph).some((node) => node.class_type === 'MiniMaxH3ReferenceToVideo')) return graph
      }
      return null
    }
    await expect.poll(() => findReferenceGraph().then((graph) => graph !== null), { timeout: 30_000 }).toBe(true)
    const referenceGraph = (await findReferenceGraph())!
    const conditioning = Object.values(referenceGraph).find((node) => node.class_type === 'MiniMaxH3ReferenceToVideo')!
    // The output latent stays the selected 16:9 resolution.
    expect(conditioning.inputs?.width).toBe(1344)
    expect(conditioning.inputs?.height).toBe(768)
    // The reference slot names the uploaded file; fetch its bytes back.
    const refLink = conditioning.inputs?.['ref_images.ref_image_0'] as [string, number]
    expect(Array.isArray(refLink)).toBe(true)
    const loadImage = referenceGraph[refLink[0]]
    const uploadedName = String((loadImage.inputs as { image?: unknown } | undefined)?.image ?? '').split('/').pop() as string
    expect(uploadedName.endsWith('.png')).toBe(true)
    const view = await fetch(`http://127.0.0.1:${mirrorPort}/view?filename=${encodeURIComponent(uploadedName)}`)
    expect(view.status).toBe(200)
    const png = new Uint8Array(await view.arrayBuffer())
    // PNG IHDR: width/height are big-endian uint32 at bytes 16 and 20.
    const readUint32 = (offset: number) => (png[offset]! * 2 ** 24) + (png[offset + 1]! * 2 ** 16) + (png[offset + 2]! * 2 ** 8) + png[offset + 3]!
    const width = readUint32(16)
    const height = readUint32(20)
    // THE RULING, on the bytes the engine received: 1:2 portrait at a 16:9
    // resolution → 672x1344 — longest side matched to 1344, aspect exactly
    // preserved, ZERO crop (the old path delivered a cropped 1344x768).
    expect({ width, height }).toEqual({ width: 672, height: 1344 })
    expect(Math.abs(width / height - 500 / 1000)).toBeLessThan(0.01)

    expect(problems, `page errors: ${problems.join(' | ')}`).toEqual([])

    await request.post('/api/lan/settings', { data: { settings: originalSettings } })
    await resetSession(page)
  } finally {
    mirror.kill('SIGINT')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { mirror.kill('SIGKILL'); resolve() }, 5_000)
      mirror.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
  expect(mirror.exitCode !== null || mirror.signalCode !== null).toBe(true)
  expect(mirrorLog).not.toContain('EADDRINUSE')
})

/** (r3q1o49) THE FRESH-ENGINE PREVIEW GATE, execution-adjacent truth on the
 *  mirror: the canvas default (live preview on, mode standard) used to ride
 *  EVERY submission as a stock `preview_method: 'taesd'` request — on a
 *  fresh engine (no PreviewOverride pack, no vae_approx listing) the real
 *  engine's latent_preview constructs a stock previewer from whatever taeh3*
 *  file wins its prefix match and the WHOLE job dies at ~1%, rescued 3 s
 *  later by the silent auto-retry (minus previews). The gate: pack-absent
 *  submits with NO preview request at all, the render completes on ONE
 *  submission (engine history carries one prompt_id — never the
 *  fail→resubmit pair), and the job record honestly notes previews are
 *  unavailable where the live-preview state renders. */
test('a pack-absent fresh engine receives NO stock preview request and renders clean — no crash-retry detour (r3q1o49)', async ({ page, request }) => {
  await seedWalkDone(page)
  test.setTimeout(240_000)
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  const holder = http.createServer(() => undefined)
  const mirrorPort = await new Promise<number>((resolve) => holder.listen(0, '127.0.0.1', () => resolve((holder.address() as AddressInfo).port)))
  await new Promise<void>((resolve) => holder.close(() => resolve()))
  // The STOCK profile: the full H3 weight stack but NO pack classes and NO
  // vae_approx listing — exactly the fresh-engine repro shape.
  const mirror: ChildProcess = spawn('node', [path.join(process.cwd(), 'e2e/mirror/fakeEngineServer.mjs'), '--port', String(mirrorPort), '--profile', 'e2e/mirror/profiles/stock-h3.json'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let mirrorLog = ''
  mirror.stdout?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  mirror.stderr?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  try {
    await expect.poll(async () => {
      try { await mirrorJson(mirrorPort, '/system_stats'); return true } catch { return false }
    }, { timeout: 15_000 }).toBe(true)
    const originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
    await request.post('/api/lan/settings', { data: { settings: {
      ...originalSettings,
      comfyUrl: `http://127.0.0.1:${mirrorPort}`,
      engine: { ...(originalSettings.engine as Record<string, unknown>), mode: 'external' },
    } } })
    await resetSession(page)
    // Slow the render so the honest note is observably present while the job
    // is active (the note shows exactly as long as the job does — a
    // transient-by-design surface; the durable record assertion follows).
    await mirrorJson(mirrorPort, '/__control', { method: 'POST', body: JSON.stringify({ stepDelayMs: 1200 }) })

    await page.goto('/?canvas=1')
    await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
    await expect(page.locator('[data-canvas-engine]')).toHaveAttribute('data-engine-connected', 'true', { timeout: 20_000 })
    await page.locator('[data-canvas-prompt]').fill('a lighthouse over a black sea, fresh engine')
    await page.locator('[data-canvas-submit]').click()
    await expect(page.locator('[data-canvas-tile]').first()).toBeVisible({ timeout: 15_000 })

    // The honest note, where the live-preview state renders (named condition:
    // the job record carries previewUnavailable from submit; the job stays
    // active ~12 s at the slowed cadence, so the window is wide).
    await expect(page.locator('[data-canvas-live-preview-off]')).toBeVisible({ timeout: 10_000 })

    // The engine received ONE prompt, carrying NO preview request.
    await expect.poll(async () => {
      const history = (await mirrorJson(mirrorPort, '/history')) as Record<string, MirrorHistoryEntry>
      return Object.keys(history).length
    }, { timeout: 60_000 }).toBe(1)
    const history = (await mirrorJson(mirrorPort, '/history')) as Record<string, MirrorHistoryEntry>
    const [entry] = Object.values(history)
    const extraData = entry.prompt?.[3] as Record<string, unknown> | string | undefined
    const extraRecord = extraData && typeof extraData === 'object' ? extraData : {}
    expect('preview_method' in extraRecord, `no preview_method reaches a pack-absent engine (got: ${JSON.stringify(extraData)})`).toBe(false)
    const receivedGraph = (entry.prompt?.[2] ?? {}) as Record<string, { class_type?: string }>
    expect(Object.values(receivedGraph).some((node) => typeof node?.class_type === 'string' && /minimax.*h3.*preview.*override/i.test(node.class_type)), 'the pack-absent graph carries no override node').toBe(false)
    expect(entry.status?.completed, 'the single submission completed').toBe(true)

    // No silent rescue ever fired: the job record is a clean single-attempt
    // completion that notes previews were unavailable. (One bounded poll for
    // the whole named condition — the app's 1 s poll lags the mirror's
    // history write, so a read-after-history-settle races the completion.)
    await expect.poll(async () => {
      const jobs = ((await (await request.get('/api/lan/jobs')).json()) as { jobs: Array<{ status: string; retriedOnce?: boolean; previewUnavailable?: boolean }> }).jobs
      const clean = jobs.find((job) => job.previewUnavailable === true && job.retriedOnce !== true)
      return clean?.status === 'completed' ? 'completed' : null
    }, { timeout: 15_000 }).toBe('completed')

    // No harness-caused page errors (business failures are honest toasts).
    expect(problems, `page errors: ${problems.join(' | ')}`).toEqual([])

    // ---- teardown ----------------------------------------------------------
    await request.post('/api/lan/settings', { data: { settings: originalSettings } })
    await resetSession(page)
  } finally {
    mirror.kill('SIGINT')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { mirror.kill('SIGKILL'); resolve() }, 5_000)
      mirror.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
  expect(mirror.exitCode !== null || mirror.signalCode !== null).toBe(true)
  expect(mirrorLog).not.toContain('EADDRINUSE')
})

/** (r3q1o49) The auto-retry's SURFACING contract: when a render carrying the
 *  preview request dies with the preview-crash signature, the existing
 *  engine-reset retry must surface as a FIRST-CLASS event — a named toast
 *  ("Preview unavailable on this engine — retrying without previews") and a
 *  job record that says the landed take rendered without previews — never
 *  the silent failure→un-failure flash. The mirror's one-shot preview-crash
 *  failMode models the real mechanism's recovery shape: the crash fires once
 *  (on the real engine the retry cannot re-crash, because it submits without
 *  preview_method), and the resubmission renders clean. */
test('the preview-crash retry surfaces as a first-class named event, never a silent flash (r3q1o49)', async ({ page, request }) => {
  await seedWalkDone(page)
  test.setTimeout(240_000)
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  const holder = http.createServer(() => undefined)
  const mirrorPort = await new Promise<number>((resolve) => holder.listen(0, '127.0.0.1', () => resolve((holder.address() as AddressInfo).port)))
  await new Promise<void>((resolve) => holder.close(() => resolve()))
  const mirror: ChildProcess = spawn('node', [path.join(process.cwd(), 'e2e/mirror/fakeEngineServer.mjs'), '--port', String(mirrorPort), '--profile', MIRROR_PROFILE], { stdio: ['ignore', 'pipe', 'pipe'] })
  let mirrorLog = ''
  mirror.stdout?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  mirror.stderr?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  try {
    await expect.poll(async () => {
      try { await mirrorJson(mirrorPort, '/system_stats'); return true } catch { return false }
    }, { timeout: 15_000 }).toBe(true)
    const originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
    await request.post('/api/lan/settings', { data: { settings: {
      ...originalSettings,
      comfyUrl: `http://127.0.0.1:${mirrorPort}`,
      engine: { ...(originalSettings.engine as Record<string, unknown>), mode: 'external' },
    } } })
    await resetSession(page)
    // Arm the one-shot crash BEFORE the submit (the mirror's established
    // failMode control).
    await mirrorJson(mirrorPort, '/__control', { method: 'POST', body: JSON.stringify({ failMode: 'preview-crash' }) })

    await page.goto('/?canvas=1')
    await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
    await expect(page.locator('[data-canvas-engine]')).toHaveAttribute('data-engine-connected', 'true', { timeout: 20_000 })
    await page.locator('[data-canvas-prompt]').fill('a lighthouse over a black sea, preview crash surfacing')
    await page.locator('[data-canvas-submit]').click()
    await expect(page.locator('[data-canvas-tile]').first()).toBeVisible({ timeout: 15_000 })

    // FIRST-CLASS: the named toast appears (named condition: the mirror fails
    // at step 3 (~1.3 s), the app's 1 s poll sweep classifies the signature
    // and fires the notice — the neutral toast lives 4.2 s, the poll samples
    // well inside that window).
    await expect(page.locator('[data-canvas-toast]', { hasText: 'Preview unavailable on this engine — retrying without previews' }).first()).toBeVisible({ timeout: 20_000 })

    // The rescue lands: the job completes on the resubmission.
    await expect.poll(async () => {
      const jobs = ((await (await request.get('/api/lan/jobs')).json()) as { jobs: Array<{ status: string; retriedOnce?: boolean; previewUnavailable?: boolean; progressLabel?: string }> }).jobs
      return jobs.find((job) => job.status === 'completed') ?? {}
    }, { timeout: 60_000 }).toMatchObject({ status: 'completed', retriedOnce: true, previewUnavailable: true })

    // Engine history holds the fail→retry PAIR, and the resubmission carried
    // no preview request (the retry's honest drop).
    const history = (await mirrorJson(mirrorPort, '/history')) as Record<string, MirrorHistoryEntry>
    expect(Object.keys(history).length, 'exactly two submissions: the failed attempt + the retry').toBe(2)
    const statuses = Object.values(history).map((entry) => entry.status)
    expect(statuses.filter((status) => status?.status_str === 'error').length, 'the first attempt errored').toBe(1)
    expect(statuses.filter((status) => status?.completed).length, 'the retry completed').toBe(1)
    for (const entry of Object.values(history)) {
      const extraData = entry.prompt?.[3] as Record<string, unknown> | string | undefined
      const extraRecord = extraData && typeof extraData === 'object' ? extraData : {}
      expect('preview_method' in extraRecord, 'no submission ever carries the stock preview_method here (the pack owns previews; the retry drops them)').toBe(false)
    }

    expect(problems, `page errors: ${problems.join(' | ')}`).toEqual([])

    // ---- teardown ----------------------------------------------------------
    await request.post('/api/lan/settings', { data: { settings: originalSettings } })
    await resetSession(page)
  } finally {
    mirror.kill('SIGINT')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { mirror.kill('SIGKILL'); resolve() }, 5_000)
      mirror.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
  expect(mirror.exitCode !== null || mirror.signalCode !== null).toBe(true)
  expect(mirrorLog).not.toContain('EADDRINUSE')
})

/** (3p14abm task 4) THE REWORKED WALK'S ENGINE STEP — the anti-regression
 *  pin for the candidate model (spec §2.1/§3): typing into the engine
 *  address NEVER reaches the network as configuration — no settings POST,
 *  no engine probe chasing the half-typed url (the old wizard wrote every
 *  keystroke into the shared session STORE — pure state, no POST — and
 *  EngineHost's probe loop then chased the half-typed urls; the walk holds
 *  the candidate in memory now, and the wizard carries no settings
 *  subscription at all). Test verifies the CANDIDATE through the honest
 *  candidate-scoped path (task 2's `?url=` seams) with the device +
 *  latency readout, and the footer is the five-step spine (Engine →
 *  Models → Node packs → LAN prep → First prompt). The negative
 *  observation is a legitimate sleep window per testing.md item 5: the
 *  typing window IS the assertion — counting route handlers must read
 *  ZERO across the keystrokes plus a poll-cycle beat (a poll would pass
 *  vacuously on an absence). */
test('the reworked walk: typing never saves, the candidate Test verifies, the footer is five steps (3p14abm task 4)', async ({ page, request }) => {
  test.setTimeout(240_000)
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  const holder = http.createServer(() => undefined)
  const mirrorPort = await new Promise<number>((resolve) => holder.listen(0, '127.0.0.1', () => resolve((holder.address() as AddressInfo).port)))
  await new Promise<void>((resolve) => holder.close(() => resolve()))
  const mirror: ChildProcess = spawn('node', [path.join(process.cwd(), 'e2e/mirror/fakeEngineServer.mjs'), '--port', String(mirrorPort), '--profile', MIRROR_PROFILE], { stdio: ['ignore', 'pipe', 'pipe'] })
  let mirrorLog = ''
  mirror.stdout?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  mirror.stderr?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  // The settings snapshot lives OUTSIDE the try so the finally can restore
  // it even when an assertion dies mid-test — a skipped restore would leak
  // the dead-mirror comfyUrl into this worker's later tests.
  let originalSettings: Record<string, unknown> | null = null
  try {
    await expect.poll(async () => {
      try { await mirrorJson(mirrorPort, '/system_stats'); return true } catch { return false }
    }, { timeout: 15_000 }).toBe(true)

    originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
    await request.post('/api/lan/settings', { data: { settings: {
      ...originalSettings,
      comfyUrl: `http://127.0.0.1:${mirrorPort}`,
      engine: { ...(originalSettings.engine as Record<string, unknown>), mode: 'external' },
      // Pre-seed the W16 self-record (one-time testedComfyVersion save on
      // first connect) so no LEGITIMATE settings save can land inside the
      // counting window — the window must measure only the typing.
      testedComfyVersion: 'mirror-profile',
    } } })
    await resetSession(page)

    await page.goto('/?canvas=1')
    await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
    const wizard = page.locator('[data-canvas-wizard]')
    await expect(wizard).toBeVisible({ timeout: 30_000 })
    // The pills are quiet while the walk presents (§2.2/R1); the connected
    // truth is proven by the step's own Test readout below (the NVIDIA
    // device line — the same readout task 2 rides).
    await expect(page.locator('[data-canvas-engine]')).toHaveCount(0, { timeout: 20_000 })
    await expect(page.locator('[data-canvas-bar-engine]')).toHaveCount(0)

    // THE FIVE-STEP SPINE (the blessed order, spec §2).
    await expect(wizard).toContainText('1 of 5 — Engine')
    const progress = wizard.locator('[data-wizard-progress]')
    await expect(progress).toHaveCount(5)
    await expect(progress.nth(3)).toHaveText('LAN prep')
    await expect(progress.nth(4)).toHaveText('First prompt')

    // The prefill is the SAVED url (W-I5: the field is born agreeing with
    // its placeholder), not empty.
    const urlField = page.locator('[data-wizard-comfy-url]')
    const mirrorUrl = `http://127.0.0.1:${mirrorPort}`
    await expect(urlField).toHaveValue(mirrorUrl)

    // THE NEGATIVE WINDOW: while the candidate is edited
    // keystroke-by-keystroke — first AWAY from the saved url (a real edit),
    // then back — count BOTH network shapes the old bug could produce: a
    // settings POST (the exit's save leaking into typing) and an ENGINE
    // PROBE aimed at the typed host (a reintroduced store-write per
    // keystroke would re-arm EngineHost's watch loop against the
    // half-typed urls — the actual old failure mode; nothing else in this
    // test ever targets that host, so any hit is a regression signal).
    let settingsSaves = 0
    let typedHostProbes = 0
    await page.route('**/api/lan/settings', async (route) => {
      if (route.request().method() === 'POST') settingsSaves += 1
      await route.continue()
    })
    // The predicate is bound once and handed to unroute by the SAME
    // reference — unroute matches function selectors by identity.
    const isTypedHost = (url: URL) => url.hostname === '10.255.255.1'
    await page.route(isTypedHost, async (route) => {
      typedHostProbes += 1
      await route.abort()
    })
    await urlField.click()
    await page.keyboard.press('ControlOrMeta+a')
    await urlField.pressSequentially('http://10.255.255.1:9', { delay: 15 })
    await expect(urlField).toHaveValue('http://10.255.255.1:9')
    // The window IS the assertion (testing.md item 5): a poll-cycle beat
    // after the last keystroke, then the second edit round, then the count.
    await page.waitForTimeout(1_000)
    await urlField.click()
    await page.keyboard.press('ControlOrMeta+a')
    await urlField.pressSequentially(mirrorUrl, { delay: 15 })
    await expect(urlField).toHaveValue(mirrorUrl)
    await page.waitForTimeout(1_000)
    expect(settingsSaves, 'zero settings POSTs across the whole typing session (the network half)').toBe(0)
    expect(typedHostProbes, 'zero engine probes aimed at the typed host (the probe loop never chases the candidate)').toBe(0)
    await page.unroute('**/api/lan/settings')
    await page.unroute(isTypedHost)

    // Test verifies the CANDIDATE (task 2's candidate-scoped object-info
    // path): the connected readout names the mirror's device.
    await page.locator('[data-wizard-test]').click()
    await expect(page.locator('[data-wizard-connected]')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-wizard-connected]')).toContainText('NVIDIA GeForce RTX 4090')

    expect(problems, `page errors: ${problems.join(' | ')}`).toEqual([])
  } finally {
    // ---- teardown (runs on EVERY exit path — a failed assertion must not
    // leak the dead-mirror comfyUrl to this worker's later tests) ----------
    if (originalSettings !== null) {
      await request.post('/api/lan/settings', { data: { settings: originalSettings } })
      await resetSession(page)
    }
    mirror.kill('SIGINT')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { mirror.kill('SIGKILL'); resolve() }, 5_000)
      mirror.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
  expect(mirror.exitCode !== null || mirror.signalCode !== null).toBe(true)
  expect(mirrorLog).not.toContain('EADDRINUSE')
})

/** (3p14abm task 5) THE MODELS STEP ON A FRESH ENGINE: the walk against a
 *  stock v0.34.0 with ZERO weights (the fresh-clone profile). Counts are
 *  dead — five named rows, each missing WITH the one artifact to make
 *  visible; the turbo row is the catalog's one-click lift, gated on a
 *  verified models-root designation (D7); the click IS the consent (W-I6);
 *  the engine's listing swap + the step's own Refresh flip the row to
 *  named-and-present with the honest name-suspected identity. A real
 *  HuggingFace download must never start — only /api/lan/fetch/start is
 *  route-sabotaged; the consent POST passes through to the studio server
 *  (the §3-sanctioned mid-walk ledger write, wiped by the settings restore). */
test('the Models step on a fresh engine: named truth, one verdict, the one-click fetch (3p14abm task 5)', async ({ page, request }) => {
  test.setTimeout(240_000)
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  const holder = http.createServer(() => undefined)
  const mirrorPort = await new Promise<number>((resolve) => holder.listen(0, '127.0.0.1', () => resolve((holder.address() as AddressInfo).port)))
  await new Promise<void>((resolve) => holder.close(() => resolve()))
  const mirror: ChildProcess = spawn('node', [path.join(process.cwd(), 'e2e/mirror/fakeEngineServer.mjs'), '--port', String(mirrorPort), '--profile', 'e2e/mirror/profiles/fresh-external.json'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let mirrorLog = ''
  mirror.stdout?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  mirror.stderr?.on('data', (chunk: Buffer) => { mirrorLog += chunk.toString() })
  const scratchRoot = makeScratchDir(path.join(os.tmpdir(), 'monoka-wizard-models-'))
  const turboFile = 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'
  try {
    await expect.poll(async () => {
      try { await mirrorJson(mirrorPort, '/system_stats'); return true } catch { return false }
    }, { timeout: 15_000 }).toBe(true)

    const originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
    await request.post('/api/lan/settings', { data: { settings: {
      ...originalSettings,
      comfyUrl: `http://127.0.0.1:${mirrorPort}`,
      engine: { ...(originalSettings.engine as Record<string, unknown>), mode: 'external' },
    } } })
    await resetSession(page)

    await page.goto('/?canvas=1')
    await expect(page.locator('[data-canvas-root]')).toHaveAttribute('data-phase', 'ready')
    const wizard = page.locator('[data-canvas-wizard]')
    await expect(wizard).toBeVisible({ timeout: 30_000 })
    // The candidate Test verifies the engine first (task 2's path) — the
    // Models step's gate stays unverified otherwise and invents NO verdict.
    await page.locator('[data-wizard-test]').click()
    await expect(page.locator('[data-wizard-connected]')).toBeVisible({ timeout: 20_000 })
    await page.locator('[data-wizard-next]').click()
    await expect(wizard).toHaveAttribute('data-wizard-step', '1')

    // NAMED TRUTH, NOT COUNTS: five rows on the empty registry, every one
    // missing WITH its make-visible guidance — and the pills quiet while
    // the step presents its own blocked verdict.
    const componentRows = page.locator('[data-wizard-components] [data-wizard-model-row]')
    await expect(componentRows).toHaveCount(5, { timeout: 20_000 })
    await expect(page.locator('[data-canvas-engine]')).toHaveCount(0)
    await expect(page.locator('[data-canvas-bar-engine]')).toHaveCount(0)
    await expect(page.locator('[data-wizard-model-row="FL2VA"]')).toHaveAttribute('data-row-present', 'false')
    await expect(page.locator('[data-wizard-model-row="FL2VA"] [data-wizard-row-guide]')).toContainText('fl2va')
    await expect(page.locator('[data-wizard-model-row="Turbo 8"] [data-wizard-row-guide]')).toContainText('lightx2v')
    // The fresh stack is blocked, and the verdict names the missing members.
    await expect(page.locator('[data-wizard-verdict="blocked"]')).toContainText('FL2VA', { timeout: 10_000 })
    // The catalog delivers exactly ONE component: the turbo row's one-click
    // lift. The publisher-direct four say so per row (no silent nothing).
    await expect(page.locator('[data-wizard-fetch="lightx2v-fl2v-turbo-8"]')).toHaveCount(1, { timeout: 10_000 })
    await expect(page.locator('[data-wizard-fetch-license]')).toContainText('Apache-2.0')
    await expect(page.locator('[data-wizard-row-direct]')).toHaveCount(4)

    // D7: the fetch is GATED until a models root verifies.
    const turboFetch = page.locator('[data-wizard-fetch="lightx2v-fl2v-turbo-8"]')
    await expect(turboFetch).toHaveAttribute('data-fetch-gated', 'true')
    await expect(page.locator('[data-wizard-fetch-gated-copy]')).toBeVisible()

    // Designate a scratch models root; the field verifies EXISTENCE (the
    // studio's own fs/check against the real dir) and the gate opens.
    await page.locator('[data-wizard-designation-input="wizard-models-root"]').fill(scratchRoot)
    await page.locator('[data-wizard-designation-verify="wizard-models-root"]').click()
    await expect(page.locator('[data-wizard-designation-verdict="wizard-models-root"]')).toHaveAttribute('data-verdict', 'exists', { timeout: 10_000 })
    await expect(turboFetch).toHaveAttribute('data-fetch-gated', 'false')
    await expect(page.locator('[data-wizard-fetch-gated-copy]')).toHaveCount(0)

    // W-I6: THE CLICK IS THE CONSENT — one click records the license
    // acknowledgement (through to the real ledger) AND starts the fetch.
    // The start itself is sabotaged: a real HuggingFace download must never
    // begin from a journey.
    let fetchStarts = 0
    await page.route('**/api/lan/fetch/start', async (route) => {
      fetchStarts += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ started: true, id: 'lightx2v-fl2v-turbo-8' }) })
    })
    await page.locator('[data-wizard-fetch-start]').click()
    // The click resolves on DISPATCH; the route fires when the request is
    // actually issued (one consent round-trip later) — poll, never read.
    await expect.poll(() => fetchStarts, { timeout: 10_000 })
      .toBe(1)
    await expect.poll(async () => {
      const read = (await (await request.get('/api/lan/settings')).json()) as { settings: { fetch?: { consents?: Record<string, unknown> } } }
      return read.settings.fetch?.consents?.['lightx2v-fl2v-turbo-8'] ? 'recorded' : null
    }, { timeout: 10_000 }).toBe('recorded')
    // The honest settling copy: the studio cannot make the engine see the
    // file — it names where weights land and what must happen next.
    await expect(page.locator('[data-wizard-fetch-settling]')).toBeVisible()

    // The engine "sees" the weight: pre-placed in the designated root's
    // loras folder, the mirror's listing swapped (the real engine's folder
    // re-scan), then the STEP'S OWN refresh re-reads the engine.
    fs.mkdirSync(path.join(scratchRoot, 'loras'), { recursive: true })
    fs.writeFileSync(path.join(scratchRoot, 'loras', turboFile), 'journey placeholder — never a real download\n')
    await mirrorJson(mirrorPort, '/__control', { method: 'POST', body: JSON.stringify({ modelListings: { loras: [turboFile] } }) })
    await page.locator('[data-wizard-refresh]').click()
    const turboRow = page.locator('[data-wizard-model-row="Turbo 8"]')
    await expect(turboRow).toHaveAttribute('data-row-present', 'true', { timeout: 20_000 })
    await expect(turboRow.locator('[data-wizard-row-name]')).toHaveText(turboFile)
    // The identity vocabulary: no digest is served, so name-suspected —
    // and the interim word stays reserved for an in-flight digest (always
    // false today; to7xpa7).
    await expect(turboRow.locator('[data-wizard-row-identity]')).toContainText('name-suspected')
    await expect(turboRow.locator('[data-wizard-row-identity]')).not.toContainText('verifying bytes')
    // …and the ONE verdict re-names what STILL blocks the fresh stack.
    await expect(page.locator('[data-wizard-verdict="blocked"]')).toContainText('FL2VA', { timeout: 10_000 })

    expect(problems, `page errors: ${problems.join(' | ')}`).toEqual([])

    // ---- teardown ----------------------------------------------------------
    await request.post('/api/lan/settings', { data: { settings: originalSettings } })
    await resetSession(page)
  } finally {
    removeAllScratchDirs()
    mirror.kill('SIGINT')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { mirror.kill('SIGKILL'); resolve() }, 5_000)
      mirror.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
  expect(mirror.exitCode !== null || mirror.signalCode !== null).toBe(true)
  expect(mirrorLog).not.toContain('EADDRINUSE')
})
