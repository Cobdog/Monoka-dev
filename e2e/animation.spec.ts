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
  || /Connecting to 'blob:.*' violates the following Content Security Policy directive/.test(entry)
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

// ---------------------------------------------------------------------------
// Task 7 — the session binding panel (§4.1 the binding step, §4.2 the
// versioned binding): the empty session's missing inputs INLINE in the same
// workspace (Refusal — never a blocked shell), the four fields + submit
// creating the versioned binding, the prepared handoff opening DIRECTLY into
// the timeline, the medium chips as the kit's exclusive radiogroup, the
// Workbench exit's "Open animation" arm, and the 409 rebase notice (never a
// silent lost update).
// ---------------------------------------------------------------------------

/** The pre-binding document (§4.1's empty session): created WITHOUT a
 *  binding — `bindingHistory: []`, `activeBindingVersion: 0` — the state the
 *  binding panel fills. */
async function createEmptySession(request: APIRequestContext, projectId: string, name: string) {
  const created = await request.post('/api/lan/animation/documents', { data: { projectId, name } })
  expect(created.ok(), `the pre-binding document creates over HTTP (${await created.text()})`).toBe(true)
  return (await created.json()).document as { id: string; revision: number }
}

async function openPanel(page: Page, projectId: string, documentId: string) {
  await page.goto(`/?images=1&view=animation&project=${projectId}&document=${documentId}`)
  const panel = page.locator('[data-anim-binding]')
  await expect(panel).toBeVisible({ timeout: 15_000 })
  return panel
}

test('an empty session exposes the missing binding inputs inline without blocking the shell (binding)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  const document = await createEmptySession(request, projectId, 'Unbound one')
  await openPanel(page, projectId, document.id)
  // The rest of the shell stands beside the panel — never blocked.
  await expect(page.locator('[data-anim-document-name]')).toHaveText('Unbound one')
  await expect(page.locator('[data-anim-revision]')).toHaveText('rev 0')
  await expect(page.locator('[data-anim-root]')).toHaveAttribute('data-anim-document', document.id)
  // The panel owns the stage in place of the timeline placeholder.
  await expect(page.locator('[data-anim-stage]')).toHaveCount(0)
  // The missing inputs are exposed INLINE — the Refusal names all four.
  const refusal = page.locator('[data-anim-binding] [data-refusal]')
  await expect(refusal).toBeVisible()
  for (const missing of ['reference images', 'character description', 'medium', 'initial key']) {
    await expect(refusal).toContainText(missing)
  }
  // The four controls stand in the same workspace, and submit stays gated.
  await expect(page.locator('[data-anim-binding-description]')).toBeVisible()
  await expect(page.locator('[data-anim-binding-medium]')).toBeVisible()
  // The file half of the picker: the visible affordance (the input itself
  // is the workbench's display:none idiom behind it).
  await expect(page.getByRole('button', { name: 'Add image files' })).toBeVisible()
  await expect(page.locator('[data-anim-binding-submit]')).toBeDisabled()
  // The prepared-character rows load through the real asset store.
  await expect(page.locator('[data-anim-binding-assets]')).toBeVisible()
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('filling the four binding fields and submitting creates the versioned binding (binding)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  const document = await createEmptySession(request, projectId, 'Fill me')
  await openPanel(page, projectId, document.id)
  // Field 1 — the locked description (typed; the session stores this exact
  // version, §4.2).
  const DESCRIPTION = 'a lanky courier in a long coat, ink-ready silhouette'
  await page.locator('[data-anim-binding-description]').fill(DESCRIPTION)
  // Field 2 — reference images from FILES through the existing ingest route.
  await page.locator('[data-anim-binding-files]').setInputFiles({ name: 'courier-ref.png', mimeType: 'image/png', buffer: Buffer.from(KEY_PNG, 'base64') })
  const pool = page.locator('[data-anim-binding-pool] [data-anim-pool-image]')
  await expect(pool).toHaveCount(1)
  // An imported file lands IN the reference set (the pick is the explicit act).
  await expect(pool.first()).toHaveAttribute('data-anim-pool-reference', 'true')
  // Field 3 — the medium, from the adapter's fixed vocabulary.
  await page.locator('[data-anim-binding-medium]').getByRole('radio', { name: 'flat cel colour on white' }).click()
  // The Refusal re-derives: only the initial key is still missing.
  await expect(page.locator('[data-anim-binding] [data-refusal]')).toContainText('initial key')
  await expect(page.locator('[data-anim-binding] [data-refusal]')).not.toContainText('medium')
  // Field 4 — the initial key as an EXPLICIT image selection.
  await page.locator('[data-anim-pool-initial-key]').click()
  await expect(pool.first()).toHaveAttribute('data-anim-pool-initial', 'true')
  await expect(page.locator('[data-anim-binding] [data-refusal]')).toHaveCount(0)
  await expect(page.locator('[data-anim-binding-submit]')).toBeEnabled()
  await page.locator('[data-anim-binding-submit]').click()
  // The bound version renders: v1, the description VERBATIM, the medium.
  const bound = page.locator('[data-anim-bound-version]')
  await expect(bound).toBeVisible()
  await expect(bound).toHaveAttribute('data-anim-bound-version-n', '1')
  await expect(page.locator('[data-anim-bound-description]')).toHaveText(DESCRIPTION)
  await expect(bound).toContainText('flat cel colour on white')
  await expect(bound).toContainText('1 reference')
  // The panel is replaced by the timeline placeholder (Task 8's landmark).
  await expect(page.locator('[data-anim-binding]')).toHaveCount(0)
  await expect(page.locator('[data-anim-stage]')).toBeVisible()
  // The write is durable — the revision the shell shows moved.
  await expect(page.locator('[data-anim-revision]')).toHaveText('rev 1')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('a prepared binding handoff opens directly into the timeline placeholder (binding)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  const document = await createDocument(request, projectId, 'Handoff ready')
  await page.goto(`/?images=1&view=animation&project=${projectId}&document=${document.id}`)
  await expect(page.locator('[data-anim-root]')).toBeVisible({ timeout: 15_000 })
  // DIRECTLY into the timeline: the bound summary + the placeholder stand,
  // and the binding panel never mounted.
  const bound = page.locator('[data-anim-bound-version]')
  await expect(bound).toBeVisible()
  await expect(bound).toHaveAttribute('data-anim-bound-version-n', '1')
  await expect(page.locator('[data-anim-bound-description]')).toHaveText('a lanky courier in a long coat')
  await expect(page.locator('[data-anim-stage]')).toBeVisible()
  await expect(page.locator('[data-anim-binding]')).toHaveCount(0)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('the binding medium chips are an exclusive radiogroup — arrows move selection (binding)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  const document = await createEmptySession(request, projectId, 'Medium chips')
  await openPanel(page, projectId, document.id)
  const group = page.locator('[data-anim-binding-medium]')
  await expect(group).toHaveAttribute('role', 'radiogroup')
  const media = ['clean line on white', 'flat black-and-white animatic', 'flat cel colour on white']
  const chip = (name: string) => group.getByRole('radio', { name })
  // Nothing selected yet: no chip lies about being checked.
  await expect(group.locator('[aria-checked="true"]')).toHaveCount(0)
  // Click selects + focuses (the single tab stop).
  await chip(media[0]).click()
  await expect(chip(media[0])).toBeFocused()
  await expect(chip(media[0])).toHaveAttribute('aria-checked', 'true')
  // ArrowRight moves SELECTION AND FOCUS together over the members,
  // wrapping at the ends (the kit contract) — and stays exclusive.
  for (const next of [1, 2, 0]) {
    await page.keyboard.press('ArrowRight')
    await expect(chip(media[next])).toHaveAttribute('aria-checked', 'true')
    await expect(chip(media[next])).toBeFocused()
    await expect(group.locator('[aria-checked="true"]')).toHaveCount(1)
  }
  // ArrowLeft walks back the other way (from index 0 → wraps to 2).
  await page.keyboard.press('ArrowLeft')
  await expect(chip(media[2])).toHaveAttribute('aria-checked', 'true')
  await expect(chip(media[2])).toBeFocused()
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('a stale binding write surfaces the conflict and re-reads — never silent (binding)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  const document = await createEmptySession(request, projectId, 'Contested')
  await openPanel(page, projectId, document.id)
  // Fill the four fields.
  await page.locator('[data-anim-binding-description]').fill('a contested binding')
  await page.locator('[data-anim-binding-files]').setInputFiles({ name: 'contested.png', mimeType: 'image/png', buffer: Buffer.from(KEY_PNG, 'base64') })
  await expect(page.locator('[data-anim-binding-pool] [data-anim-pool-image]')).toHaveCount(1)
  await page.locator('[data-anim-binding-medium]').getByRole('radio', { name: 'clean line on white' }).click()
  await page.locator('[data-anim-pool-initial-key]').click()
  await expect(page.locator('[data-anim-binding-submit]')).toBeEnabled()
  // Hold the submit at the wire; WHILE IT IS HELD, move the document behind
  // the page's back (a key-candidate write bumps the revision without
  // touching the binding, so the panel stays the honest surface). The
  // submit then answers 409 — the store must set the conflict, re-read,
  // and SHOW the notice.
  let held = true
  await page.route('**/api/lan/animation/binding', async (route) => {
    if (!held) { await route.continue(); return }
    held = false
    const bumped = await request.post('/api/lan/animation/keys', {
      data: {
        op: 'add-candidate', documentId: document.id, keyId: uuid(), expectedRevision: 0,
        candidate: { id: uuid(), assetReference: { assetId: `animref-${uuid().slice(0, 8)}`, relPath: null, kind: 'image' }, origin: 'import', provenance: { assetId: 'animref-race' }, poseDescription: null, facing: null },
      },
    })
    expect(bumped.ok(), `the concurrent write lands (${await bumped.text()})`).toBe(true)
    await route.continue()
  })
  await page.locator('[data-anim-binding-submit]').click()
  // The 409 is NEVER silent: the reload notice names the conflict.
  const notice = page.locator('[data-anim-conflict]')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('changed')
  // The rebase re-read landed: the fresh revision shows, the panel still
  // stands (the concurrent write did not bind), and the retry — now on the
  // fresh revision — succeeds.
  await expect(page.locator('[data-anim-revision]')).toHaveText('rev 1')
  await expect(page.locator('[data-anim-binding]')).toBeVisible()
  await expect(page.locator('[data-anim-binding-submit]')).toBeEnabled()
  await page.locator('[data-anim-binding-submit]').click()
  const bound = page.locator('[data-anim-bound-version]')
  await expect(bound).toBeVisible()
  await expect(bound).toHaveAttribute('data-anim-bound-version-n', '1')
  await expect(page.locator('[data-anim-bound-description]')).toHaveText('a contested binding')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// The Workbench exit's "Open animation" arm (task 6 deferred it here — the
// binding UX prerequisite): the prepared session (contract + strip + picked
// frame) plus the one input the workbench cannot infer (the medium) become a
// BOUND document through animationApi.createDocument, and the browser lands
// in the animation module with the timeline already open.
test('the workbench exit opens animation with a bound handoff (binding)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  // The images suite's seeding shape: one h3img chain whose landed take
  // carries 3 frame artifacts (the picked frame = the scorer's canonical),
  // one FILE reference on the strip, the session naming the project.
  const project = await (await request.post('/api/lan/documents/projects', { data: { name: 'Animation exit e2e' } })).json()
  const ingested = await (await request.post('/api/lan/documents/blobs/ingest', { data: { data: KEY_PNG, name: 'identity.png', kind: 'image' } })).json()
  try {
    const chain = await (await request.post('/api/lan/documents/chains', {
      data: {
        projectId: project.project.id,
        kind: 'h3img',
        settings: { family: 'h3img.generate.packet', intent: 'a ceramic bowl of lemons on an oak table', tier: 5, keepDial: 0.55, seed: 4242, resolution: '1344x768', loras: [], refs: [{ id: 'ref-1', role: 'subject', transport: null, keepOverride: null, note: 'identity', source: { kind: 'file', path: ingested.path, name: 'identity.png' } }], semanticOverflow: false, framePicks: {}, refineEngine: '', poserigInbox: null },
      },
    })).json()
    const output = await (await request.post('/api/lan/documents/outputs', { data: { chainId: chain.chain.id, substrates: ['decoded'] } })).json()
    const take = await (await request.post('/api/lan/documents/takes', {
      data: {
        outputId: output.output.id, jobId: null, artifacts: [ingested.path],
        metrics: { kind: 'image', duration: 0, width: 1344, height: 768, sourcePath: ingested.path, h3img: { family: 'h3img.generate.packet', profile: 'packet', tier: 5, frames: 1, prompt: 'the generated contract text', refs: [], loras: [], seed: 4242, resolution: '1344x768', hybrid: true, scorer: { bestIndex: 0, reason: 'sharpest', metricBasis: 'pixel metrics only' }, canonicalFrameIndex: 0 } },
      },
    })).json()
    expect(take.take.id, 'the seeded take lands').toBeTruthy()
    await request.post('/api/lan/documents/session', { data: { openProjects: [project.project.id], activeProject: project.project.id } })
    await page.goto('/?images=1')
    await expect(page.locator('[data-iw-mode-rail]')).toBeVisible({ timeout: 20_000 })
    // The arm: consent-shaped like the start-frame exit — a dialog, the
    // prepared inputs named, the medium REQUIRED (the workbench cannot
    // infer it), confirm gated until chosen.
    await page.locator('[data-iw-open-animation]').click()
    const dialog = page.getByRole('dialog', { name: 'Open animation' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('bowl of lemons')
    await expect(page.locator('[data-iw-open-animation-confirm]')).toBeDisabled()
    await dialog.getByRole('radio', { name: 'clean line on white' }).click()
    await expect(page.locator('[data-iw-open-animation-confirm]')).toBeEnabled()
    await page.locator('[data-iw-open-animation-confirm]').click()
    // The navigation lands in the animation module, DIRECTLY bound — the
    // timeline placeholder stands and the binding panel never mounted.
    await expect(page.locator('[data-anim-root]')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/view=animation/)
    const bound = page.locator('[data-anim-bound-version]')
    await expect(bound).toBeVisible()
    await expect(page.locator('[data-anim-bound-description]')).toContainText('bowl of lemons')
    await expect(page.locator('[data-anim-stage]')).toBeVisible()
    await expect(page.locator('[data-anim-binding]')).toHaveCount(0)
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    // (testing.md's shared-home discipline) the session and the project go.
    await request.post('/api/lan/documents/session', { data: { openProjects: [], activeProject: null } }).catch(() => undefined)
    await request.post('/api/lan/documents/projects/delete', { data: { id: project.project.id } }).catch(() => undefined)
  }
})

// ---------------------------------------------------------------------------
// Task 8 — the timeline (§5 the key-slot model, §6 span authoring, §7.4 the
// playhead/review position): keys as IMAGE-BACKED cards with lock chips and
// origin badges (the badge follows the SELECTED candidate — no permanent tile
// treatments by origin, §5.1), spans as connecting bars with tween step slots
// NESTED inside, selection highlighting the active span AND its endpoint
// keys, the seed-the-initial-key affordance for a bound-but-empty timeline
// (the binding's initialKeyAssetId materializes no slot on its own), and the
// "new animation document" creation arm in the selection state.
// ---------------------------------------------------------------------------

/** Ingest the 1x1 key PNG through the real blob route — the returned relPath
 *  is the content-addressed handle every key candidate's image renders
 *  through (the same handle the binding panel binds). */
async function ingestKeyImage(request: APIRequestContext, name: string): Promise<string> {
  const ingested = await (await request.post('/api/lan/documents/blobs/ingest', { data: { kind: 'image', name, data: KEY_PNG } })).json() as { blob?: { relPath?: string } }
  expect(ingested.blob?.relPath, `the key image ingests (${JSON.stringify(ingested)})`).toBeTruthy()
  return ingested.blob!.relPath!
}

/** A bound document whose timeline is fully authored through the real routes:
 *  three selected keys (hero / import / frame-promotion origins, real blob
 *  images, the third LOCKED), an adjacent span carrying TWO step slots, and a
 *  skip-span across all three keys (nesting lane 1 in the timeline model). */
async function seedTimelineDocument(request: APIRequestContext, projectId: string, name: string) {
  const relPathA = await ingestKeyImage(request, 'anim-key-a.png')
  const relPathB = await ingestKeyImage(request, 'anim-key-b.png')
  const relPathC = await ingestKeyImage(request, 'anim-key-c.png')
  const created = await (await request.post('/api/lan/animation/documents', {
    data: { projectId, name, binding: { characterDescription: 'a lanky courier in a long coat', referenceAssetIds: [uuid()], medium: 'clean line on white', initialKeyAssetId: relPathA } },
  })).json() as { document: { id: string; revision: number } }
  const documentId = created.document.id
  let revision = created.document.revision

  const addSelectedKey = async (origin: string, relPath: string) => {
    const keyId = uuid()
    const candidateId = uuid()
    let landed = await (await request.post('/api/lan/animation/keys', {
      data: { op: 'add-candidate', documentId, keyId, expectedRevision: revision, candidate: { id: candidateId, assetReference: { assetId: `animref-${uuid().slice(0, 8)}`, relPath, kind: 'image' }, origin, provenance: { assetId: `animref-${uuid().slice(0, 8)}` }, poseDescription: 'mid-stride, arms pumping', facing: 'screen-left' } },
    })).json() as { document: { revision: number } }
    revision = landed.document.revision
    landed = await (await request.post('/api/lan/animation/select/key-candidate', { data: { documentId, keyId, candidateId, expectedRevision: revision } })).json() as { document: { revision: number } }
    revision = landed.document.revision
    return keyId
  }

  const keyOne = await addSelectedKey('hero', relPathA)
  const keyTwo = await addSelectedKey('import', relPathB)
  const keyThree = await addSelectedKey('frame-promotion', relPathC)
  const locked = await (await request.post('/api/lan/animation/keys', { data: { op: 'lock', documentId, keyId: keyThree, expectedRevision: revision } })).json() as { document: { revision: number } }
  revision = locked.document.revision

  const spanOne = await (await request.post('/api/lan/animation/spans', {
    data: { op: 'insert', documentId, fromKeyId: keyOne, toKeyId: keyTwo, intent: { movement: 'she pushes off the back foot into a full stride', preservation: 'coat hem and scarf stay consistent' }, expectedRevision: revision },
  })).json() as { document: { revision: number }; spanId: string }
  revision = spanOne.document.revision
  const appended = await (await request.post('/api/lan/animation/spans', { data: { op: 'append-step-slot', documentId, spanId: spanOne.spanId, expectedRevision: revision } })).json() as { document: { revision: number }; stepSlotId: string }
  revision = appended.document.revision
  const spanTwo = await (await request.post('/api/lan/animation/spans', {
    data: { op: 'insert', documentId, fromKeyId: keyOne, toKeyId: keyThree, intent: { movement: 'a long beeline across the plaza', preservation: 'the silhouette stays readable' }, expectedRevision: revision },
  })).json() as { document: { revision: number }; spanId: string }
  revision = spanTwo.document.revision

  return { documentId, revision, keyIds: [keyOne, keyTwo, keyThree], spanIds: [spanOne.spanId, spanTwo.spanId], stepSlotId: appended.stepSlotId }
}

async function openTimeline(page: Page, projectId: string, documentId: string) {
  await page.goto(`/?images=1&view=animation&project=${projectId}&document=${documentId}`)
  const timeline = page.locator('[data-anim-timeline]')
  await expect(timeline).toBeVisible({ timeout: 15_000 })
  return timeline
}

test('keys render as image cards with lock chips and origin badges (timeline)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  const seeded = await seedTimelineDocument(request, projectId, 'Timeline cards')
  const timeline = await openTimeline(page, projectId, seeded.documentId)
  // Three key cards, ordered by the slots' order, each IMAGE-backed through
  // the real blob route (the candidate relPath → the preview URL).
  const cards = timeline.locator('[data-anim-key]')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(0)).toHaveAttribute('data-anim-key', seeded.keyIds[0])
  await expect(cards.nth(1)).toHaveAttribute('data-anim-key', seeded.keyIds[1])
  await expect(cards.nth(2)).toHaveAttribute('data-anim-key', seeded.keyIds[2])
  for (let index = 0; index < 3; index += 1) {
    const img = cards.nth(index).locator('img')
    await expect(img).toBeVisible()
    expect((await img.getAttribute('src')) ?? '', `key ${index} renders through the blob route`).toContain('/api/lan/documents/blobs/file')
  }
  // The origin badge follows the SELECTED candidate (§5.1).
  await expect(cards.nth(0).locator('[data-anim-key-badge]')).toHaveAttribute('data-anim-key-badge', 'hero')
  await expect(cards.nth(1).locator('[data-anim-key-badge]')).toHaveAttribute('data-anim-key-badge', 'import')
  await expect(cards.nth(2).locator('[data-anim-key-badge]')).toHaveAttribute('data-anim-key-badge', 'frame-promotion')
  // The lock chip reflects the SERVER's lock state — and the toggle rides the
  // real revision-gated command (the server enforces the lock contract).
  const lockChip = cards.nth(2).locator('[data-anim-key-lock]')
  await expect(lockChip).toHaveAttribute('aria-pressed', 'true')
  await lockChip.click()
  await expect(lockChip).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-anim-revision]')).toHaveText(`rev ${seeded.revision + 1}`)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('selecting a span highlights it and its two endpoint keys; step slots nest inside the bar (timeline)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  const seeded = await seedTimelineDocument(request, projectId, 'Timeline spans')
  const timeline = await openTimeline(page, projectId, seeded.documentId)
  // The adjacent span renders on lane 0; the skip-span across all three keys
  // stacks one lane up (the model's nesting, §6 connectivity).
  const adjacent = timeline.locator(`[data-anim-span="${seeded.spanIds[0]}"]`)
  const skip = timeline.locator(`[data-anim-span="${seeded.spanIds[1]}"]`)
  await expect(adjacent).toBeVisible()
  await expect(adjacent).toHaveAttribute('data-anim-span-nesting', '0')
  await expect(skip).toBeVisible()
  await expect(skip).toHaveAttribute('data-anim-span-nesting', '1')
  await expect(adjacent).toHaveAttribute('data-anim-span-from', seeded.keyIds[0])
  await expect(adjacent).toHaveAttribute('data-anim-span-to', seeded.keyIds[1])
  // Two tween step slots nest INSIDE the span bar.
  await expect(adjacent.locator('[data-anim-step-slot]')).toHaveCount(2)
  await expect(skip.locator('[data-anim-step-slot]')).toHaveCount(1)
  // Selecting the span highlights it AND its two endpoint keys — not the
  // third key, not the other span.
  await adjacent.click()
  await expect(adjacent).toHaveAttribute('data-anim-selected', 'true')
  await expect(timeline.locator(`[data-anim-key="${seeded.keyIds[0]}"]`)).toHaveAttribute('data-anim-selected', 'true')
  await expect(timeline.locator(`[data-anim-key="${seeded.keyIds[1]}"]`)).toHaveAttribute('data-anim-selected', 'true')
  await expect(timeline.locator(`[data-anim-key="${seeded.keyIds[2]}"]`)).toHaveAttribute('data-anim-selected', 'false')
  await expect(skip).toHaveAttribute('data-anim-selected', 'false')
  // Selecting a key re-highlights cleanly (the selection is one id).
  await timeline.locator(`[data-anim-key="${seeded.keyIds[2]}"]`).click()
  await expect(timeline.locator(`[data-anim-key="${seeded.keyIds[2]}"]`)).toHaveAttribute('data-anim-selected', 'true')
  await expect(adjacent).toHaveAttribute('data-anim-selected', 'false')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('an empty timeline seeds the initial key slot from the binding (timeline)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  // The binding's initialKeyAssetId is a REAL blob path here, so the seed
  // card previews it and the seeded candidate renders image-backed.
  const initialKey = await ingestKeyImage(request, 'anim-initial-key.png')
  const created = await (await request.post('/api/lan/animation/documents', {
    data: { projectId, name: 'Seed me', binding: { characterDescription: 'a lanky courier', referenceAssetIds: [uuid()], medium: 'clean line on white', initialKeyAssetId: initialKey } },
  })).json() as { document: { id: string } }
  const timeline = await openTimeline(page, projectId, created.document.id)
  // The seed affordance stands in the stage — the bound initial key named,
  // previewable, one explicit action away (§5.3: selection is explicit).
  const seedCard = page.locator('[data-anim-seed-card]')
  await expect(seedCard).toBeVisible()
  await expect(seedCard.locator('img')).toBeVisible()
  expect((await seedCard.locator('img').getAttribute('src')) ?? '').toContain('/api/lan/documents/blobs/file')
  await expect(page.locator('[data-anim-seed-initial]')).toBeEnabled()
  // The seed materializes the slot AND selects it — two real commands.
  await page.locator('[data-anim-seed-initial]').click()
  await expect(seedCard).toHaveCount(0)
  const cards = timeline.locator('[data-anim-key]')
  await expect(cards).toHaveCount(1)
  await expect(cards.first().locator('img')).toBeVisible()
  expect((await cards.first().locator('img').getAttribute('src')) ?? '').toContain(encodeURIComponent(initialKey))
  await expect(cards.first().locator('[data-anim-key-badge]')).toHaveAttribute('data-anim-key-badge', 'project-asset')
  await expect(page.locator('[data-anim-revision]')).toHaveText('rev 2')
  // The seeded card is selectable like any key.
  await cards.first().click()
  await expect(cards.first()).toHaveAttribute('data-anim-selected', 'true')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('the playhead indicates the newest attempt\'s review position (timeline)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  // The stub engine (test (d)'s posture): accepts, never answers — a
  // submitted tween persists queued and its dispatch hangs.
  const stub = http.createServer(() => { /* no response */ })
  const stubPort = await new Promise<number>((resolve) => stub.listen(0, '127.0.0.1', () => resolve((stub.address() as { port: number }).port)))
  const originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
  try {
    await request.post('/api/lan/settings', { data: { settings: { ...originalSettings, comfyUrl: `http://127.0.0.1:${stubPort}` } } })
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedTimelineDocument(request, projectId, 'Playhead')
    const timeline = await openTimeline(page, projectId, seeded.documentId)
    // No attempts — the playhead is ABSENT, not a lying position.
    await expect(timeline.locator('[data-anim-playhead]')).toHaveCount(0)
    // Submit one tween attempt against the span's appended step slot —
    // WITHOUT awaiting the response: the route hangs at the engine dispatch
    // (the stub never answers) while the ATTEMPT persists first (test (d)'s
    // posture), so the durable read is the settle point, not the POST.
    await page.evaluate(({ documentId, targetStepSlotId, idempotencyKey }) => {
      void fetch('/api/lan/animation/attempts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          documentId, tool: 'tween', targetId: targetStepSlotId, idempotencyKey,
          draft: { tool: 'tween', targetStepSlotId, movementStep: 'the lead foot plants and the weight transfers forward', overrides: { medium: 'clean line on white' } },
        }),
      }).catch(() => undefined)
    }, { documentId: seeded.documentId, targetStepSlotId: seeded.stepSlotId, idempotencyKey: `anim-e2e-playhead-${Date.now()}` })
    await expect.poll(async () => {
      const view = await (await request.get(`/api/lan/animation/document?id=${seeded.documentId}`)).json() as { document?: { attempts?: unknown[] } }
      return view.document?.attempts?.length ?? 0
    }, { timeout: 15_000 }).toBeGreaterThan(0)
    // Leave and return (§7.4): the recovery read carries the attempt, and
    // the playhead marks its review position — the span owning the step slot.
    await page.reload()
    const reloaded = page.locator('[data-anim-timeline]')
    await expect(reloaded).toBeVisible({ timeout: 15_000 })
    const playhead = reloaded.locator('[data-anim-playhead]')
    await expect(playhead).toBeVisible()
    await expect(playhead).toHaveAttribute('data-anim-playhead-at', seeded.spanIds[0])
    await expect(playhead).toHaveAttribute('data-anim-playhead-kind', 'span')
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    await new Promise<void>((resolve) => {
      stub.closeAllConnections()
      stub.close(() => resolve())
    })
  }
})

test('the selection state creates a new empty animation document (timeline)', async ({ page }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  await page.goto(`/?images=1&view=animation&project=${projectId}&document=${uuid()}`)
  await expect(page.locator('[data-anim-select]')).toBeVisible({ timeout: 15_000 })
  // The creation arm (task 7's Minor-2): one click creates the pre-binding
  // document in this project and opens it — the empty session's panel.
  const create = page.locator('[data-anim-new-document]')
  await expect(create).toBeEnabled()
  await create.click()
  await expect(page.locator('[data-anim-binding]')).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(/view=animation&project=[^&]+&document=/)
  await expect(page.locator('[data-anim-document-name]')).toHaveText('Untitled animation')
  await expect(page.locator('[data-anim-revision]')).toHaveText('rev 0')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})
