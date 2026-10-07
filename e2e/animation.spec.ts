import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Animation-authoring module, task 6 (k2q0n9s, spec
// docs/superpowers/specs/2026-10-06-animation-authoring-module-design.md
// §11.1 the route decision): the CLIENT INTEGRATION BOUNDARY end to end at
// /?images=1&view=animation — the Workbench SUBVIEW host branch, the typed
// HTTP client behind the shell's document load, and the fabric adapter that
// turns `animation`-channel envelopes into shell state. The registry itself
// is untouched (spec §11.1 keeps the `images` id — NO fifth entry), so the
// default ?images=1 view must boot the image editor unchanged.
//
// Engine posture: tests (a)–(c) are engine-independent (the document routes
// never reach an engine). Test (d) — the fabric leg — points the server's
// comfyUrl at a STUB engine that accepts connections and never answers, so a
// submitted attempt persists (the queued envelope) and its dispatch stays
// in flight forever: the honest "attempt in flight" shape without a fake
// engine and without touching the 8189 testbed (engine ports are off-limits
// to this suite; the stub owns an ephemeral loopback port).

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

// A 1x1 PNG — the selected key's reference image, registered through the
// real canvas ingest route exactly the way the routes suite seeds one.
const KEY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='

const uuid = () => randomUUID()

function makeBinding() {
  return {
    characterDescription: 'a lanky courier in a long coat',
    referenceAssetIds: [uuid(), uuid()],
    medium: 'clean line on white',
    initialKeyAssetId: `asset-${uuid().slice(0, 8)}`,
  }
}

async function createDocument(request: APIRequestContext, projectId: string, name: string) {
  const created = await request.post('/api/lan/animation/documents', { data: { projectId, name, binding: makeBinding() } })
  expect(created.ok(), `the document creates over HTTP (${await created.text()})`).toBe(true)
  return (await created.json()).document as { id: string; revision: number }
}

/** A key slot with ONE imported candidate, selected — the hero submit's
 *  reference source (the routes suite's makeSelectedKey shape). */
async function makeSelectedKey(request: APIRequestContext, documentId: string, startRevision: number) {
  const ingested = await (await request.post('/api/lan/documents/blobs/ingest', { data: { kind: 'image', name: 'anim-key.png', data: KEY_PNG } })).json()
  const assetReference = { assetId: `animref-${uuid().slice(0, 8)}`, relPath: ingested.blob.relPath, kind: 'image' }
  const candidateId = uuid()
  const keyId = uuid()
  let response = await request.post('/api/lan/animation/keys', {
    data: {
      op: 'add-candidate', documentId, keyId, expectedRevision: startRevision,
      candidate: { id: candidateId, assetReference, origin: 'import', provenance: { assetId: assetReference.assetId }, poseDescription: 'mid-stride, arms pumping', facing: 'screen-left' },
    },
  })
  expect(response.ok(), `add-candidate lands (${await response.text()})`).toBe(true)
  response = await request.post('/api/lan/animation/select/key-candidate', { data: { documentId, keyId, candidateId, expectedRevision: (await response.json()).document.revision } })
  expect(response.ok(), `the key selection lands (${await response.text()})`).toBe(true)
  return keyId
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw new Error(`Uncaught renderer error during navigation: ${error.message}`)
  })
})

// ---------------------------------------------------------------------------
// (a) §11.1's recoverable document-selection state: a missing/invalid
// document id in the URL is a named heading + a back-to-workbench link —
// never a crash, never a blank — and the image editor never mounted.
// ---------------------------------------------------------------------------
test('a missing document id renders the recoverable document-selection state (§11.1)', async ({ page }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  await page.goto(`/?images=1&view=animation&project=${projectId}&document=${uuid()}`)
  await expect(page.locator('[data-anim-root]')).toBeVisible({ timeout: 15_000 })
  // The named heading + the back-to-workbench link — the recovery surface.
  await expect(page.getByRole('heading', { name: /choose an animation document/i })).toBeVisible()
  const back = page.locator('[data-anim-back]')
  await expect(back).toBeVisible()
  await expect(back).toHaveAttribute('href', '/?images=1')
  // No crash, no blank: the selection state names the missing id, and the
  // image editor never mounted beside it (the host branch returned early).
  await expect(page.locator('[data-anim-select]')).toContainText('does not exist')
  await expect(page.locator('[data-iw-root]')).toHaveCount(0)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// (b) The module shell loads a real document through the typed client: the
// name renders, the shell carries the document id, and (the durable-handoff
// half of §11.1) the document WAS the handoff — created through the API the
// Workbench exit will call, living in the shared store, not localStorage.
// ---------------------------------------------------------------------------
test('a created document opens the animation shell with its name', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  const document = await createDocument(request, projectId, 'Walk cycle one')
  await page.goto(`/?images=1&view=animation&project=${projectId}&document=${document.id}`)
  await expect(page.locator('[data-anim-root]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-anim-document-name]')).toHaveText('Walk cycle one')
  await expect(page.locator('[data-anim-root]')).toHaveAttribute('data-anim-document', document.id)
  await expect(page.locator('[data-iw-root]')).toHaveCount(0)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// (c) The host branch is INERT for the default view: ?images=1 without
// `view` mounts the image editor unchanged (the registry entry keeps
// rendering the workbench — spec §11.1's "no fifth registry entry").
// ---------------------------------------------------------------------------
test('?images=1 without view still mounts the image editor unchanged', async ({ page, request }) => {
  const problems = await trackErrors(page)
  // A minimal workbench session (the images suite's seeding shape): one
  // project, one h3img chain, the session naming it — enough for the editor
  // to reach its landmark without the auto-create path.
  const project = await (await request.post('/api/lan/documents/projects', { data: { name: 'Animation e2e host' } })).json()
  await request.post('/api/lan/documents/chains', {
    data: {
      projectId: project.project.id,
      kind: 'h3img',
      settings: { family: 'h3img.generate.packet', intent: 'animation host-pin session', tier: 5, keepDial: 0.55, seed: 7, resolution: '1344x768', loras: [], refs: [], semanticOverflow: false, framePicks: {}, refineEngine: '', poserigInbox: null },
    },
  })
  await request.post('/api/lan/documents/session', { data: { openProjects: [project.project.id], activeProject: project.project.id } })
  try {
    await page.goto('/?images=1')
    // The image-editor landmark — the mode rail only the editor renders.
    await expect(page.locator('[data-iw-mode-rail]')).toBeVisible({ timeout: 20_000 })
    // And the animation shell never mounted.
    await expect(page.locator('[data-anim-root]')).toHaveCount(0)
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    // (testing.md's shared-home discipline) the session and the project this
    // test created go before the next suite boots against the shared home.
    await request.post('/api/lan/documents/session', { data: { openProjects: [], activeProject: null } }).catch(() => undefined)
    await request.post('/api/lan/documents/projects/delete', { data: { id: project.project.id } }).catch(() => undefined)
  }
})

// ---------------------------------------------------------------------------
// (d) The fabric adapter: an attempt in flight (submitted via the API
// against a STUB engine URL — accepts, never answers — so the attempt
// persists queued and its dispatch hangs) flips the shell's
// data-attempt-state through the `animation` channel envelope. The existing
// fabric carries it (subscribe('animation', …) — no new socket).
// ---------------------------------------------------------------------------
test('an animation envelope flips the shell attempt state (the fabric adapter)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  // The stub engine: every request is accepted and never answered.
  const stub = http.createServer(() => { /* no response — the dispatch stays in flight */ })
  const stubPort = await new Promise<number>((resolve) => stub.listen(0, '127.0.0.1', () => resolve((stub.address() as { port: number }).port)))
  const originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
  try {
    await request.post('/api/lan/settings', { data: { settings: { ...originalSettings, comfyUrl: `http://127.0.0.1:${stubPort}` } } })
    const projectId = `anim-e2e-${Date.now()}`
    const document = await createDocument(request, projectId, 'Fabric leg')
    const keyId = await makeSelectedKey(request, document.id, document.revision)
    await page.goto(`/?images=1&view=animation&project=${projectId}&document=${document.id}`)
    await expect(page.locator('[data-anim-document-name]')).toHaveText('Fabric leg', { timeout: 15_000 })
    // No attempt activity yet — the attribute is absent, not a lying value.
    expect(await page.locator('[data-anim-root]').getAttribute('data-attempt-state')).toBeNull()

    // Submit from the page (the submit route hangs at the engine dispatch —
    // the ATTEMPT persists first, so the queued envelope is already on the
    // fabric while the request itself never answers).
    await page.evaluate(({ documentId, keyId, idempotencyKey }) => {
      void fetch('/api/lan/animation/attempts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          documentId, tool: 'hero', targetId: keyId, idempotencyKey,
          draft: { tool: 'hero', targetKeyId: keyId, movementArc: 'she plants the forward foot and pushes through into a full stride', overrides: { medium: 'clean line on white' } },
        }),
      }).catch(() => undefined)
    }, { documentId: document.id, keyId, idempotencyKey: `anim-e2e-fabric-${Date.now()}` })

    // The queued envelope (animation.attempt.persisted → attempt-state
    // queued) reaches the shell through the existing fabric.
    await expect(page.locator('[data-anim-root]')).toHaveAttribute('data-attempt-state', 'queued', { timeout: 15_000 })
    // The image editor still never mounted beside the animation module.
    await expect(page.locator('[data-iw-root]')).toHaveCount(0)
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    // (testing.md's shared-home discipline) the settings flip is restored —
    // every later boot in this run must see the original engine address.
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    // The stub's sockets are DELIBERATELY left open (the server's engine
    // dispatch is still hanging on one) — close() alone would wait for them
    // forever, so they are destroyed first.
    await new Promise<void>((resolve) => {
      stub.closeAllConnections()
      stub.close(() => resolve())
    })
  }
})
