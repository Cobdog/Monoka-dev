import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import type { AddressInfo } from 'node:net'
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
    // fabric while the request itself never answers). Task 11's §5.2 shape:
    // the draft names the SOURCE key, the target is a fresh proposed slot.
    const proposedKeyId = uuid()
    await page.evaluate(({ documentId, keyId, idempotencyKey, targetId }) => {
      void fetch('/api/lan/animation/attempts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          documentId, tool: 'hero', targetId, idempotencyKey,
          draft: { tool: 'hero', sourceKeyId: keyId, movementArc: 'she plants the forward foot and pushes through into a full stride', overrides: { medium: 'clean line on white' } },
        }),
      }).catch(() => undefined)
    }, { documentId: document.id, keyId, targetId: proposedKeyId, idempotencyKey: `anim-e2e-fabric-${Date.now()}` })

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

test('a timeline command failure surfaces in the bound arm, then clears on success (timeline)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  const seeded = await seedTimelineDocument(request, projectId, 'Failure surface')
  const timeline = await openTimeline(page, projectId, seeded.documentId)
  const lockChip = timeline.locator(`[data-anim-key="${seeded.keyIds[2]}"] [data-anim-key-lock]`)
  await expect(lockChip).toHaveAttribute('aria-pressed', 'true')
  // Hold the lock ops at the wire and answer with a NAMED failure: the store
  // lands it in commandError and the BOUND arm must render it — the
  // timeline's own commands never fail silently (the same surface the seed's
  // named refusals render through).
  await page.route('**/api/lan/animation/keys', async (route) => {
    const body = route.request().postDataJSON() as { op?: string }
    if (body.op === 'lock' || body.op === 'unlock') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'the lock write was refused by the test wire' }) })
      return
    }
    await route.continue()
  })
  await lockChip.click()
  const failure = page.locator('[data-anim-command-error]')
  await expect(failure).toBeVisible()
  await expect(failure).toContainText('the lock write was refused by the test wire')
  await expect(failure).toContainText('The last command failed')
  // The chip keeps telling the SERVER's truth while the write failed, and
  // the document did not move.
  await expect(lockChip).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-anim-revision]')).toHaveText(`rev ${seeded.revision}`)
  // The next successful command clears the surface.
  await page.unroute('**/api/lan/animation/keys')
  await lockChip.click()
  await expect(lockChip).toHaveAttribute('aria-pressed', 'false')
  await expect(failure).toHaveCount(0)
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

// ---------------------------------------------------------------------------
// Task 9 — the span inspector (§6.1 the hybrid inspector, §6.2 the tween
// template, §6.3 the compiler's enforcement boundary, §6.4 the
// rolling-reference problem): selecting a span opens the authoring form under
// the timeline — the two endpoint frames with poses bound to the SELECTED
// candidates, facing pickers over the closed vocabulary, the debounced
// movement draft (preview recompute + durable intent persist on one settle),
// the inherited medium, the collapsed CLIENT-COMPILED "View caption" preview
// (the shared module's first browser import), advisory hints that never
// rewrite, and the explicit step submission whose frozen caption is the
// previewed text verbatim.
// ---------------------------------------------------------------------------

/** The span inspector's seed: a bound document with TWO selected keys (real
 *  blob images; the from key also carries an UNSELECTED alternative candidate
 *  with a different pose + facing) and ONE tween span (the insert's single
 *  seeded step slot). The far pose deliberately reads as a COMPARATIVE
 *  destination ("farther than…") so the advisory hint is seeded truth, and
 *  the facings differ per frame so the caption's facing text disambiguates
 *  them. */
async function seedInspectorDocument(request: APIRequestContext, projectId: string, name: string) {
  const relPathFrom = await ingestKeyImage(request, 'anim-insp-from.png')
  const relPathTo = await ingestKeyImage(request, 'anim-insp-to.png')
  const created = await (await request.post('/api/lan/animation/documents', {
    data: { projectId, name, binding: { characterDescription: 'a lanky courier in a long coat', referenceAssetIds: [uuid()], medium: 'clean line on white', initialKeyAssetId: relPathFrom } },
  })).json() as { document: { id: string; revision: number } }
  const documentId = created.document.id
  let revision = created.document.revision

  const keyCommand = async (payload: Record<string, unknown>) => {
    const landed = await (await request.post('/api/lan/animation/keys', { data: { documentId, expectedRevision: revision, ...payload } })).json() as { document: { revision: number } }
    revision = landed.document.revision
  }
  const select = async (keyId: string, candidateId: string) => {
    const landed = await (await request.post('/api/lan/animation/select/key-candidate', { data: { documentId, keyId, candidateId, expectedRevision: revision } })).json() as { document: { revision: number } }
    revision = landed.document.revision
  }

  const fromKeyId = uuid()
  const fromSelected = uuid()
  const fromAlternative = uuid()
  await keyCommand({
    op: 'add-candidate', keyId: fromKeyId,
    candidate: { id: fromSelected, assetReference: { assetId: `animref-${uuid().slice(0, 8)}`, relPath: relPathFrom, kind: 'image' }, origin: 'import', provenance: { assetId: 'animref-from' }, poseDescription: 'mid-stride, arms pumping', facing: 'screen-left' },
  })
  await keyCommand({
    op: 'add-candidate', keyId: fromKeyId,
    candidate: { id: fromAlternative, assetReference: { assetId: `animref-${uuid().slice(0, 8)}`, relPath: relPathFrom, kind: 'image' }, origin: 'import', provenance: { assetId: 'animref-from-alt' }, poseDescription: 'planted flat, weight settled on the back foot', facing: 'screen-right' },
  })
  await select(fromKeyId, fromSelected)

  const toKeyId = uuid()
  const toSelected = uuid()
  await keyCommand({
    op: 'add-candidate', keyId: toKeyId,
    candidate: { id: toSelected, assetReference: { assetId: `animref-${uuid().slice(0, 8)}`, relPath: relPathTo, kind: 'image' }, origin: 'import', provenance: { assetId: 'animref-to' }, poseDescription: 'turned farther than the start, head past the shoulder line', facing: 'toward camera' },
  })
  await select(toKeyId, toSelected)

  const span = await (await request.post('/api/lan/animation/spans', {
    data: { op: 'insert', documentId, fromKeyId, toKeyId, intent: { movement: 'she pushes off the back foot into a full stride', preservation: 'coat hem and scarf stay consistent' }, expectedRevision: revision },
  })).json() as { document: { revision: number; body: { spans: Array<{ id: string; stepSlots: Array<{ id: string }> }> } }; spanId: string }
  revision = span.document.revision
  const stepSlotId = span.document.body.spans.find((entry) => entry.id === span.spanId)!.stepSlots[0]!.id

  return { documentId, revision, fromKeyId, fromSelected, fromAlternative, toKeyId, spanId: span.spanId, stepSlotId }
}

/** Opens the seeded document, selects the span, and returns the opened
 *  caption-text locator (the preview's disclosure starts collapsed and is
 *  opened explicitly — the §6.3 affordance). */
async function openInspectorCaption(page: Page, projectId: string, seeded: Awaited<ReturnType<typeof seedInspectorDocument>>) {
  const timeline = await openTimeline(page, projectId, seeded.documentId)
  await timeline.locator(`[data-anim-span="${seeded.spanId}"]`).click()
  const inspector = page.locator('[data-anim-inspector]')
  await expect(inspector).toBeVisible()
  await expect(inspector).toHaveAttribute('data-anim-inspector-span', seeded.spanId)
  await page.locator('[data-anim-caption-preview] summary').click()
  const caption = page.locator('[data-anim-caption-text]')
  await expect(caption).toBeVisible()
  return { inspector, caption }
}

test('editing the movement text recompiles the caption preview and persists the span intent (inspector)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  const seeded = await seedInspectorDocument(request, projectId, 'Inspector movement')
  await openTimeline(page, projectId, seeded.documentId)
  // Nothing selected — no inspector yet; selecting the span opens it.
  await expect(page.locator('[data-anim-inspector]')).toHaveCount(0)
  await page.locator(`[data-anim-span="${seeded.spanId}"]`).click()
  const inspector = page.locator('[data-anim-inspector]')
  await expect(inspector).toBeVisible()
  await expect(inspector).toHaveAttribute('data-anim-inspector-span', seeded.spanId)
  // The caption preview starts COLLAPSED (§6.3's collapsed "View caption").
  await expect(page.locator('[data-anim-caption-text]')).toBeHidden()
  await page.locator('[data-anim-caption-preview] summary').click()
  const caption = page.locator('[data-anim-caption-text]')
  await expect(caption).toBeVisible()
  // The seeded compile — FIRST FRAME carries the ROLLING reference's pose
  // (the from key's selected candidate: the chain has landed nothing), the
  // far frame its own, MOVEMENT the intent VERBATIM, and the badge names the
  // compiler the submission will freeze with.
  await expect(caption).toContainText('FIRST FRAME (Reference 1): mid-stride, arms pumping, facing screen-left')
  await expect(caption).toContainText('TARGET END FRAME (Reference 2): turned farther than the start, head past the shoulder line, facing toward camera')
  await expect(caption).toContainText('MOVEMENT: she pushes off the back foot into a full stride')
  await expect(caption).toContainText('SCENE: clean line on white.')
  await expect(page.locator('[data-anim-caption-compiler]')).toHaveText('v1')
  // Edit the movement: the preview recomputes on the settle (the bounded
  // named-condition wait — the debounce's commit IS the condition).
  const MOVEMENT = 'the lead foot plants and the weight transfers through the hip'
  await page.locator('[data-anim-inspector-movement]').fill(MOVEMENT)
  await expect(caption).toContainText(`MOVEMENT: ${MOVEMENT}`, { timeout: 5_000 })
  // The same settle persisted the durable intent — the revision moved by
  // exactly the one debounced update-intent, and the span bar's label shows
  // the authored text.
  await expect(page.locator('[data-anim-revision]')).toHaveText(`rev ${seeded.revision + 1}`, { timeout: 5_000 })
  await expect(page.locator(`[data-anim-span="${seeded.spanId}"]`)).toContainText(MOVEMENT)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('the first frame follows the rolling reference — a new selected image changes the pose (inspector)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  const seeded = await seedInspectorDocument(request, projectId, 'Inspector rolling')
  const { caption } = await openInspectorCaption(page, projectId, seeded)
  await expect(caption).toContainText('FIRST FRAME (Reference 1): mid-stride, arms pumping, facing screen-left')
  // The §6.4 label names the source: the start key's SELECTED image — the
  // chain has landed no step — never a frozen endpoint copy.
  await expect(page.locator('[data-anim-frame-source="start-key"]')).toBeVisible()
  // Select the from key's OTHER candidate behind the page's back (§5.3's
  // explicit selection through the real route): the fabric's
  // document-changed envelope refreshes the document, and the rolling
  // reference — resolved to the start key's selected image — now carries the
  // NEW candidate's pose and facing. The old pose is gone, not appended.
  const current = await (await request.get(`/api/lan/animation/document?id=${seeded.documentId}`)).json() as { document: { revision: number } }
  const landed = await request.post('/api/lan/animation/select/key-candidate', {
    data: { documentId: seeded.documentId, keyId: seeded.fromKeyId, candidateId: seeded.fromAlternative, expectedRevision: current.document.revision },
  })
  expect(landed.ok(), `the rolling-reference selection lands (${await landed.text()})`).toBe(true)
  await expect(caption).toContainText('FIRST FRAME (Reference 1): planted flat, weight settled on the back foot, facing screen-right', { timeout: 10_000 })
  await expect(caption).not.toContainText('mid-stride, arms pumping')
  // The destination frame is untouched by the start-side change.
  await expect(caption).toContainText('TARGET END FRAME (Reference 2): turned farther than the start')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('comparative destination and negation surface as advisory hints, never rewrites (inspector)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  const seeded = await seedInspectorDocument(request, projectId, 'Inspector hints')
  const { caption } = await openInspectorCaption(page, projectId, seeded)
  // The seeded far pose is comparative ("farther than") — exactly the seeded
  // hint, and the ONLY one (both frames carry facings; the movement carries
  // no negation and names no facing).
  await expect(page.locator('[data-anim-caption-hint]')).toHaveCount(1)
  const comparative = page.locator('[data-anim-caption-hint="comparative-destination"]')
  await expect(comparative).toBeVisible()
  await expect(comparative).toContainText('describe the destination directly')
  // Advisory means VERBATIM: the comparative phrasing stays in the caption.
  await expect(caption).toContainText('turned farther than the start, head past the shoulder line')
  // Negation in the movement is the second advisory row — the text still
  // rides the caption unchanged (the checkpoints want positive phrasing; the
  // compiler flags, the author decides).
  await page.locator('[data-anim-inspector-movement]').fill('she leans forward without shifting the hips')
  await expect(page.locator('[data-anim-caption-hint="negation"]')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('[data-anim-caption-hint]')).toHaveCount(2)
  await expect(caption).toContainText('MOVEMENT: she leans forward without shifting the hips')
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

test('submitting freezes the previewed caption verbatim (inspector)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  // The stub engine (test (d)'s posture): accepts, never answers — the
  // submitted tween persists queued while its dispatch hangs, and the frozen
  // caption rides the persisted row. Engine ports stay off-limits; the stub
  // owns an ephemeral loopback port.
  const stub = http.createServer(() => { /* no response */ })
  const stubPort = await new Promise<number>((resolve) => stub.listen(0, '127.0.0.1', () => resolve((stub.address() as { port: number }).port)))
  const originalSettings = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
  try {
    await request.post('/api/lan/settings', { data: { settings: { ...originalSettings, comfyUrl: `http://127.0.0.1:${stubPort}` } } })
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedInspectorDocument(request, projectId, 'Inspector submit')
    const { caption } = await openInspectorCaption(page, projectId, seeded)
    await expect(caption).toContainText('MOVEMENT: she pushes off the back foot into a full stride')
    const previewed = await caption.textContent()
    expect(previewed, 'the previewed caption is the real compiled text').toContain('FIRST FRAME')
    // The explicit step submission (§7.1): one click. The route hangs at the
    // stub's dispatch while the ATTEMPT persists FIRST — the durable read is
    // the settle point, not the POST's response.
    await page.locator('[data-anim-inspector-submit]').click()
    await expect.poll(async () => {
      const view = await (await request.get(`/api/lan/animation/document?id=${seeded.documentId}`)).json() as { document?: { attempts?: Array<{ tool: string; targetId: string }> } }
      return view.document?.attempts?.filter((entry) => entry.tool === 'tween' && entry.targetId === seeded.stepSlotId).length ?? 0
    }, { timeout: 15_000 }).toBeGreaterThan(0)
    // The frozen caption is the previewed one VERBATIM (byte-equal, not
    // substring), the row names the compiler the preview badge showed, and
    // the span's own intent was already durable (the flush found nothing to
    // write — the debounce had persisted it).
    const settled = await (await request.get(`/api/lan/animation/document?id=${seeded.documentId}`)).json() as { document: { revision: number; attempts: Array<{ tool: string; targetId: string; caption: string; compilerVersion: string }> } }
    const attempt = settled.document.attempts.find((entry) => entry.tool === 'tween' && entry.targetId === seeded.stepSlotId)!
    expect(attempt.caption).toBe(previewed)
    expect(attempt.compilerVersion).toBe('1')
    expect(settled.document.revision).toBe(seeded.revision)
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    await new Promise<void>((resolve) => {
      stub.closeAllConnections()
      stub.close(() => resolve())
    })
  }
})

// ---------------------------------------------------------------------------
// Task 10 — the review panel + the wired vertical slice (§7.3 the status
// vocabulary, §7.4 during the wait / on return, §7.2.2 the two frame paths,
// §12.2 THE SLICE, §12.3 duplicate completion): the PRODUCTION completion
// owner runs end to end; the ONLY test double is the FAKE ENGINE
// (e2e/mirror/fakeEngineServer.mjs on an allocated port, the server's
// comfyUrl pointed at it — the journey.spec.ts pattern). No route, service,
// or landing path is stubbed: bind two keys → submit one tween attempt →
// leave the editor → completion lands SERVER-SIDE with no animation surface
// attached → return → the session restores and highlights "Ready to review"
// → review the clip → select a reference frame EXPLICITLY (the on-demand
// extraction path) → explicitly continue (appendStepSlot + the next step's
// submission). Asserted throughout: the landed candidate never changed any
// selection by itself.
// ---------------------------------------------------------------------------

const ANIMATION_PROFILE = 'e2e/mirror/profiles/animation-h3.json'

type FakeEngine = {
  port: number
  control(patch: Record<string, unknown>): Promise<unknown>
  historyAll(): Promise<Record<string, { prompt?: unknown[] }>>
  kill(): Promise<boolean>
}

/** Every live engine child, for the afterAll sweep: a test whose finally is
 *  preempted (a worker abort, a fixture teardown failure) must never leave
 *  an orphan behind — the sweep is the second belt. */
const liveEngines = new Set<ChildProcess>()

test.afterAll(async () => {
  for (const engine of liveEngines) {
    if (engine.exitCode === null && engine.signalCode === null) {
      engine.kill('SIGINT')
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { engine.kill('SIGKILL'); resolve() }, 5_000)
        engine.once('exit', () => { clearTimeout(timer); resolve() })
      })
    }
    liveEngines.delete(engine)
  }
})

/** The standing fake engine as a child process (the journey.spec.ts pattern):
 *  a port is RESERVED first, the child owns it, the health-check gates the
 *  return, and kill() asserts the child actually exited (never orphaned). */
async function startFakeEngine(onPort?: number): Promise<FakeEngine> {
  // An explicit port REBINDS a previously killed engine's address — the
  // restart shape (a fresh process with EMPTY history on the same URL the
  // server already points at).
  let port = onPort ?? 0
  if (!onPort) {
    const holder = http.createServer(() => undefined)
    port = await new Promise<number>((resolve) => holder.listen(0, '127.0.0.1', () => resolve((holder.address() as AddressInfo).port)))
    await new Promise<void>((resolve) => holder.close(() => resolve()))
  }
  const engine: ChildProcess = spawn('node', [path.join(process.cwd(), 'e2e/mirror/fakeEngineServer.mjs'), '--port', String(port), '--profile', ANIMATION_PROFILE], { stdio: ['ignore', 'pipe', 'pipe'] })
  liveEngines.add(engine)
  let log = ''
  engine.stdout?.on('data', (chunk: Buffer) => { log += chunk.toString() })
  engine.stderr?.on('data', (chunk: Buffer) => { log += chunk.toString() })
  engine.once('exit', () => { liveEngines.delete(engine) })
  // The settle: the fake engine answers /system_stats (a named condition —
  // a spawn that died names itself in the log instead).
  await expect.poll(async () => {
    try { const response = await fetch(`http://127.0.0.1:${port}/system_stats`); return response.ok } catch { return false }
  }, { timeout: 15_000 }).toBe(true)
  return {
    port,
    control: (patch) => fetch(`http://127.0.0.1:${port}/__control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).then((response) => response.json()),
    historyAll: () => fetch(`http://127.0.0.1:${port}/history`).then((response) => response.json() as Promise<Record<string, { prompt?: unknown[] }>>),
    kill: async () => {
      engine.kill('SIGINT')
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { engine.kill('SIGKILL'); resolve() }, 5_000)
        engine.once('exit', () => { clearTimeout(timer); resolve() })
      })
      if (engine.exitCode === null && engine.signalCode === null) return false
      if (log.includes('EADDRINUSE')) throw new Error(`the fake engine failed to bind: ${log}`)
      return true
    },
  }
}

/** Points the shared server's comfyUrl at the fake engine and returns the
 *  original settings for the restore (the wave1/journey swap pattern). */
async function pointAtEngine(request: APIRequestContext, enginePort: number) {
  const original = ((await (await request.get('/api/lan/settings')).json()) as { settings: Record<string, unknown> }).settings
  await request.post('/api/lan/settings', { data: { settings: { ...original, comfyUrl: `http://127.0.0.1:${enginePort}` } } })
  return original
}

type SliceDocument = {
  document: {
    revision: number
    body: {
      keys: Array<{
        id: string
        selectedCandidateId: string | null
        candidates: Array<{
          id: string
          origin: string
          assetReference: { kind: string }
          provenance: { sourceTake?: string; sourceFrame?: number; generatingOp?: string }
        }>
      }>
      spans: Array<{ id: string; fromKeyId: string; toKeyId: string; intent: { movement: string; preservation: string }; stepSlots: Array<{ id: string; attempts: string[]; selectedRollingReference: { attemptId: string; frameIndex: number; poseDescription: string | null; facing: string | null } | null }> }>
      editorial: Array<{ id: string; spanId: string | null; attemptId: string; inFrame: number; outFrame: number; holdDuration: number }>
    }
    attempts: Array<{ attemptId: string; tool: string; targetId: string; execution: string }>
  }
}

const readAnimationDocument = async (request: APIRequestContext, documentId: string) =>
  (await (await request.get(`/api/lan/animation/document?id=${documentId}`)).json()) as { document: SliceDocument['document'] }

const readAttemptView = async (request: APIRequestContext, attemptId: string) =>
  (await (await request.get(`/api/lan/animation/attempt?id=${attemptId}`)).json()) as { attempt: { execution: string; windowEndKeyId?: string; preparation: { state: string; proposedFrameIndex?: number }; candidate: { id: string | null; earlierRevision: boolean; frameCount: number } | null } }

/** One tween draft body for page-context submissions (a KNOWN idempotency key
 *  so a second tab context can replay the identical request). */
const tweenDraftBody = (documentId: string, stepSlotId: string, idempotencyKey: string) => ({
  documentId,
  tool: 'tween',
  targetId: stepSlotId,
  idempotencyKey,
  draft: { tool: 'tween', targetStepSlotId: stepSlotId, movementStep: 'she pushes off the back foot into a full stride', overrides: { medium: 'clean line on white' } },
})

test('the §12.2 vertical slice — leave, land, return, review, select, continue (slice)', async ({ page, request }) => {
  test.setTimeout(150_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  // A render slow enough to LEAVE the surface before it lands (~4s at 12
  // steps × 350ms — the honest during-the-wait window, §7.4).
  await engine.control({ steps: 12, stepDelayMs: 350 })
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedInspectorDocument(request, projectId, 'The slice')
    const animationUrl = `/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`
    await page.goto(animationUrl)
    const timeline = page.locator('[data-anim-timeline]')
    await expect(timeline).toBeVisible({ timeout: 15_000 })
    // Select the span — the inspector opens (§6.1); no attempts yet, so no
    // review panel stands.
    await timeline.locator(`[data-anim-span="${seeded.spanId}"]`).click()
    await expect(page.locator('[data-anim-inspector]')).toBeVisible()
    await expect(page.locator('[data-anim-review]')).toHaveCount(0)
    // The truths completion must NEVER change by itself (asserted before,
    // after the landing, and again after the return).
    await expect(timeline.locator(`[data-anim-key="${seeded.fromKeyId}"] [data-anim-key-badge]`)).toHaveAttribute('data-anim-key-badge', 'import')

    // SUBMIT one tween step (§7.1's explicit action — the real button).
    await page.locator('[data-anim-inspector-submit]').click()
    // The timeline keeps the sequence visible with the running attempt
    // attached (§7.4): the review panel mounts in-flight vocabulary and the
    // playhead marks the span owning the step.
    const panel = page.locator('[data-anim-review]')
    await expect(panel).toBeVisible({ timeout: 15_000 })
    await expect(panel).toHaveAttribute('data-anim-review-state', /queued|reconciling|rendering|preparing/, { timeout: 15_000 })
    await expect(panel.locator('[data-anim-review-status]')).toHaveText(/Queued|Rendering|Preparing review/)
    await expect(timeline.locator('[data-anim-playhead]')).toHaveAttribute('data-anim-playhead-at', seeded.spanId)

    // The durable read settles the attempt row (the settle point is the API,
    // not the POST's response — the submit already returned).
    await expect.poll(async () => {
      const view = await readAnimationDocument(request, seeded.documentId)
      return view.document.attempts.filter((entry) => entry.tool === 'tween' && entry.targetId === seeded.stepSlotId).length
    }, { timeout: 15_000 }).toBe(1)
    const submitted = await readAnimationDocument(request, seeded.documentId)
    const attemptId = submitted.document.attempts.find((entry) => entry.tool === 'tween' && entry.targetId === seeded.stepSlotId)!.attemptId

    // LEAVE the surface — the canvas, a different workstation entirely.
    await page.goto('/?canvas=1')
    await expect(page.locator('[data-canvas-root]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-anim-root]')).toHaveCount(0)

    // Completion lands SERVER-SIDE with no animation surface attached: the
    // bounded wait is the attempt row itself (execution ready, the frame
    // prepared, the clip landed) — the production completion owner's own
    // polling did the landing, never a browser.
    await expect.poll(async () => {
      const view = await readAttemptView(request, attemptId)
      return view.attempt.execution === 'ready' && view.attempt.preparation.state === 'proposed' && view.attempt.candidate !== null
    }, { timeout: 30_000 }).toBe(true)

    // The landing changed NO selection by itself: both keys' selections, the
    // authored revision (landing is not an authoring edit, §11.2), and the
    // step slot's rolling reference are exactly what they were.
    const landed = await readAnimationDocument(request, seeded.documentId)
    const landedSpan = landed.document.body.spans.find((entry) => entry.id === seeded.spanId)!
    expect(landed.document.revision, 'landing bumps no revision').toBe(seeded.revision)
    expect(landed.document.body.keys.find((entry) => entry.id === seeded.fromKeyId)!.selectedCandidateId).toBe(seeded.fromSelected)
    expect(landedSpan.stepSlots[0]!.attempts).toEqual([attemptId])
    expect(landedSpan.stepSlots[0]!.selectedRollingReference, 'the landed candidate selected nothing').toBeNull()

    // RETURN (§7.4): the session restores — the review position auto-focuses
    // the span and the panel highlights Ready to review.
    await page.goto(animationUrl)
    const back = page.locator('[data-anim-review]')
    await expect(back).toBeVisible({ timeout: 15_000 })
    await expect(back).toHaveAttribute('data-anim-review-attempt', attemptId)
    await expect(back).toHaveAttribute('data-anim-review-state', 'ready')
    await expect(back.locator('[data-anim-review-status]')).toHaveText('Ready to review')
    await expect(back.locator('[data-anim-review-meaning]')).toContainText('selection unchanged')
    // Review the clip: the landed candidate displays through the real blob
    // route, and the selections are STILL untouched at the UI.
    const clip = back.locator('[data-anim-review-clip]')
    await expect(clip).toBeVisible()
    await expect(clip).toHaveAttribute('src', /\/api\/lan\/documents\/blobs\/file/)
    await expect(page.locator(`[data-anim-key="${seeded.fromKeyId}"] [data-anim-key-badge]`)).toHaveAttribute('data-anim-key-badge', 'import')
    // The frame strip: the clip's 22 frames, the PROPOSED one marked — and
    // NOTHING selected (§7.2.2: the system proposes, it never selects).
    const frames = back.locator('[data-anim-review-frame]')
    await expect(frames).toHaveCount(22)
    await expect(back.locator('[data-anim-review-frame="11"]')).toHaveAttribute('data-anim-frame-proposed', 'true')
    await expect(back.locator('[data-anim-frame-selected="true"]')).toHaveCount(0)
    await expect(back.locator('[data-anim-review-selected-frame]')).toContainText('No frame chosen')
    // Dependent advancement is a user action gated on a selection (§7.1).
    await expect(back.locator('[data-anim-review-continue]')).toBeDisabled()

    // SELECT a reference frame — explicit, and deliberately NOT the proposal
    // (frame 5), so the choice rides §7.2.2's on-demand extraction path.
    let extractCalls = 0
    page.on('request', (route) => { if (route.url().includes('/api/lan/animation/attempt/extract-frame')) extractCalls += 1 })
    await back.locator('[data-anim-review-frame="5"]').click()
    await expect(back.locator('[data-anim-review-frame="5"]')).toHaveAttribute('data-anim-frame-selected', 'true')
    await expect(back.locator('[data-anim-review-selected-frame]')).toContainText('frame 5')
    expect(extractCalls, 'a non-proposed frame selects through on-demand extraction').toBe(1)
    // The selection is DOCUMENT truth (§7.2.1 command 2): the slot names
    // this attempt + frame 5, the revision moved exactly the one selection,
    // and the span carries the §8.3 stale mark (later steps consume the new
    // near reference).
    const selected = await readAnimationDocument(request, seeded.documentId)
    const selectedSpan = selected.document.body.spans.find((entry) => entry.id === seeded.spanId)!
    expect(selectedSpan.stepSlots[0]!.selectedRollingReference).toEqual({ attemptId, frameIndex: 5, poseDescription: null, facing: null })
    expect(selected.document.revision).toBe(seeded.revision + 1)
    await expect(page.locator(`[data-anim-span="${seeded.spanId}"]`)).toHaveAttribute('data-anim-span-stale', 'true')

    // Continue is enabled ONLY now — the selection is the gate.
    await expect(back.locator('[data-anim-review-continue]')).toBeEnabled()
    // EXPLICITLY CONTINUE (§7.1): the chain advances one step — the new step
    // slot mints (the F1 append) and the next step's submission fires against
    // it. The promoted-frame path is REAL now (task 15): the near reference
    // resolves to the EXTRACTED frame image at submit time, the step-2 render
    // dispatches and lands — the honest-limit refusal and its panel note are
    // gone (the §12.2 slice's continuation completes).
    await expect(back.locator('[data-anim-review-limit]')).toHaveCount(0)
    await back.locator('[data-anim-review-continue]').click()
    await expect(page.locator(`[data-anim-span="${seeded.spanId}"] [data-anim-step-slot]`)).toHaveCount(2, { timeout: 15_000 })
    await expect.poll(async () => {
      const view = await readAnimationDocument(request, seeded.documentId)
      const span = view.document.body.spans.find((entry) => entry.id === seeded.spanId)!
      return span.stepSlots[1]!.attempts.length
    }, { timeout: 45_000 }).toBe(1)
    // The selection survived the continuation, and the panel followed the
    // chain: it reviews step 2's take now.
    const continued = await readAnimationDocument(request, seeded.documentId)
    const continuedSpan = continued.document.body.spans.find((entry) => entry.id === seeded.spanId)!
    expect(continuedSpan.stepSlots).toHaveLength(2)
    expect(continuedSpan.stepSlots[0]!.selectedRollingReference).toEqual({ attemptId, frameIndex: 5, poseDescription: null, facing: null })
    const stepTwoAttempt = continued.document.attempts.find((entry) => continuedSpan.stepSlots[1]!.attempts.includes(entry.attemptId))!
    await expect(back).toHaveAttribute('data-anim-review-attempt', stepTwoAttempt.attemptId, { timeout: 15_000 })
    await expect(back).toContainText('step 2')
    // RENDER-IS-THE-PROOF: the engine holds exactly TWO records — reaching
    // the engine at all is the flip (a video-asset near reference would have
    // been refused before dispatch), and no second render fired for step 1.
    expect(Object.keys(await engine.historyAll())).toHaveLength(2)
    await expect(page.locator('[data-anim-command-error]')).toHaveCount(0)
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  // The fake-engine child actually exited — never orphaned.
  expect(engineExited).toBe(true)
})

// Task 15's regression case (task 10's Important-1 — the RELEASE BLOCKER): a
// span holding a TRAILING EMPTY step slot (exactly what a continuation whose
// submission was refused or interrupted leaves behind) still reviews the
// FRONTIER step — and Continue from that review submits INTO the empty
// trailing slot: no second hole mints, the near reference is the frontier's
// promoted frame, and the chain advances one step exactly. Before the fix
// the button was enabled while the command demanded the LAST slot's own
// selection and refused loudly — the divergence.
test('a trailing empty step slot receives the continuation — no second hole, the frontier review drives it (regression)', async ({ page, request }) => {
  test.setTimeout(120_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  await engine.control({ steps: 6, stepDelayMs: 200 })
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedInspectorDocument(request, projectId, 'Divergence regression')
    const animationUrl = `/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`

    // Step 1 renders and lands; the reviewer selects frame 3 (the explicit
    // §7.2.1 decision that gates the continuation).
    const submitted = await request.post('/api/lan/animation/attempts', { data: tweenDraftBody(seeded.documentId, seeded.stepSlotId, `anim-e2e-reg-${Date.now()}`) })
    expect(submitted.ok(), `step 1 submits (${await submitted.text()})`).toBe(true)
    const attemptId = ((await submitted.json()) as { attemptId: string }).attemptId
    await expect.poll(async () => {
      const view = await readAttemptView(request, attemptId)
      return view.attempt.execution === 'ready' && view.attempt.candidate !== null
    }, { timeout: 30_000 }).toBe(true)
    const landed = await readAnimationDocument(request, seeded.documentId)
    expect(landed.document.revision).toBe(seeded.revision)
    const selected = await request.post('/api/lan/animation/select/rolling-reference', {
      data: { documentId: seeded.documentId, spanId: seeded.spanId, attemptId, frameIndex: 3, expectedRevision: landed.document.revision },
    })
    expect(selected.ok(), `the rolling reference selects (${await selected.text()})`).toBe(true)

    // THE DIVERGENCE STATE: an empty trailing slot stands (the F1 append —
    // exactly what a refused continuation leaves behind).
    const appended = await request.post('/api/lan/animation/spans', {
      data: { op: 'append-step-slot', documentId: seeded.documentId, spanId: seeded.spanId, expectedRevision: landed.document.revision + 1 },
    })
    expect(appended.ok(), `the step slot appends (${await appended.text()})`).toBe(true)
    const stepTwoId = ((await appended.json()) as { stepSlotId: string }).stepSlotId

    // The surface reviews the FRONTIER (step 1 — the newest landed take of
    // the chain) and Continue is ENABLED: the panel's model and the command
    // agree on the frontier now.
    await page.goto(animationUrl)
    await page.locator(`[data-anim-span="${seeded.spanId}"]`).click()
    const panel = page.locator('[data-anim-review]')
    await expect(panel).toBeVisible({ timeout: 15_000 })
    await expect(panel).toContainText('step 1')
    await expect(panel.locator('[data-anim-review-continue]')).toBeEnabled()

    // CONTINUE: the submission lands on the EXISTING empty slot — the span
    // still holds exactly TWO slots (no second hole mints) and step 2
    // renders from the frontier's promoted frame (the extracted image).
    await panel.locator('[data-anim-review-continue]').click()
    await expect(page.locator(`[data-anim-span="${seeded.spanId}"] [data-anim-step-slot]`)).toHaveCount(2)
    await expect.poll(async () => {
      const current = await readAnimationDocument(request, seeded.documentId)
      const span = current.document.body.spans.find((entry) => entry.id === seeded.spanId)!
      return span.stepSlots[1]!.attempts.length
    }, { timeout: 45_000 }).toBe(1)
    const continued = await readAnimationDocument(request, seeded.documentId)
    const span = continued.document.body.spans.find((entry) => entry.id === seeded.spanId)!
    expect(span.stepSlots).toHaveLength(2)
    expect(span.stepSlots[1]!.id).toBe(stepTwoId)
    expect(Object.keys(await engine.historyAll())).toHaveLength(2)
    await expect(page.locator('[data-anim-command-error]')).toHaveCount(0)
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  // The fake-engine child actually exited — never orphaned.
  expect(engineExited).toBe(true)
})

// Wave 2a (the live review's #4, §6.4's ruling): the promoted frame's pose
// and facing are AUTHORABLE — the image-bound annotation rides the step
// slot's selection pointer, edits through the inspector's FIRST FRAME card,
// and recompiles the caption preview; the next submission freezes it
// byte-identically.
test('annotating the rolling reference recompiles the preview and freezes verbatim (inspector)', async ({ page, request }) => {
  test.setTimeout(120_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  await engine.control({ steps: 6, stepDelayMs: 150 })
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedInspectorDocument(request, projectId, 'Rolling annotation')

    // Step 1 lands; the reviewer selects frame 3 (the pointer), and the chain
    // appends step 2 — the submission target whose near reference IS that
    // annotated frame.
    const first = await request.post('/api/lan/animation/attempts', { data: tweenDraftBody(seeded.documentId, seeded.stepSlotId, `anim-e2e-ann-1-${Date.now()}`) })
    expect(first.ok(), `step 1 submits (${await first.text()})`).toBe(true)
    const attemptId = ((await first.json()) as { attemptId: string }).attemptId
    await expect.poll(async () => {
      const view = await readAttemptView(request, attemptId)
      return view.attempt.execution === 'ready' && view.attempt.candidate !== null
    }, { timeout: 30_000 }).toBe(true)
    const landed = await readAnimationDocument(request, seeded.documentId)
    const selected = await request.post('/api/lan/animation/select/rolling-reference', {
      data: { documentId: seeded.documentId, spanId: seeded.spanId, attemptId, frameIndex: 3, expectedRevision: landed.document.revision },
    })
    expect(selected.ok(), `the rolling reference selects (${await selected.text()})`).toBe(true)
    const appended = await request.post('/api/lan/animation/spans', {
      data: { op: 'append-step-slot', documentId: seeded.documentId, spanId: seeded.spanId, expectedRevision: landed.document.revision + 1 },
    })
    expect(appended.ok(), `the step slot appends (${await appended.text()})`).toBe(true)

    // The inspector's FIRST FRAME card names the promoted source and carries
    // the annotation editor (the start-key arm keeps its read-only pose).
    const animationUrl = `/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`
    await page.goto(animationUrl)
    await page.locator(`[data-anim-span="${seeded.spanId}"]`).click()
    await expect(page.locator('[data-anim-inspector]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-anim-frame-source="promoted-frame"]')).toBeVisible()
    await expect(page.locator('[data-anim-rolling-annotation]')).toBeVisible()
    await expect(page.locator('[data-anim-frame="first"] [data-anim-frame-pose]')).toHaveCount(0, 'the promoted-frame card carries the EDITOR, not a read-only pose paragraph')
    await page.locator('[data-anim-caption-preview] summary').click()
    const caption = page.locator('[data-anim-caption-text]')
    await expect(caption).toBeVisible()
    // Unannotated: the rolling frame carries no facing — the honest hint.
    await expect(page.locator('[data-anim-caption-hint="missing-facing"]')).toBeVisible()

    // Type the pose: the settle persists the annotation, the fabric refresh
    // lands it, and the preview recomputes — FIRST FRAME carries the authored
    // text (within the debounced wait).
    const POSE = 'weight settled low over the balls of the feet'
    await page.locator('[data-anim-inspector-pose]').fill(POSE)
    await expect(caption).toContainText(`FIRST FRAME (Reference 1): ${POSE}`, { timeout: 10_000 })

    // Flip the facing chip: the term lands in the SAME line, and the
    // missing-facing hint leaves — the frame states its facing now.
    await page.locator('#anim-facing-rolling-screen-left').click()
    await expect(caption).toContainText(`FIRST FRAME (Reference 1): ${POSE}, facing screen-left`, { timeout: 10_000 })
    await expect(page.locator('[data-anim-caption-hint="missing-facing"]')).toHaveCount(0, { timeout: 10_000 })
    // The document's pointer carries the annotation (durable truth), and the
    // annotation marked the span stale 'pose' (§6.4's reference state).
    const annotated = await readAnimationDocument(request, seeded.documentId)
    const annotatedSpan = annotated.document.body.spans.find((entry) => entry.id === seeded.spanId)!
    expect(annotatedSpan.stepSlots[0]!.selectedRollingReference).toEqual({ attemptId, frameIndex: 3, poseDescription: POSE, facing: 'screen-left' })
    await expect(page.locator(`[data-anim-span="${seeded.spanId}"]`)).toHaveAttribute('data-anim-span-stale', 'true')

    // The submission freezes the PREVIEWED caption byte-identically (the
    // byte-identity pin, promoted-frame + annotation edition).
    const previewed = await caption.textContent()
    expect(previewed, 'the previewed caption is the real compiled text').toContain(`FIRST FRAME (Reference 1): ${POSE}, facing screen-left`)
    await page.locator('[data-anim-inspector-submit]').click()
    await expect.poll(async () => {
      const view = await readAnimationDocument(request, seeded.documentId)
      const span = view.document.body.spans.find((entry) => entry.id === seeded.spanId)!
      return span.stepSlots[1]!.attempts.length
    }, { timeout: 45_000 }).toBe(1)
    const settled = await (await request.get(`/api/lan/animation/document?id=${seeded.documentId}`)).json() as { document: { attempts: Array<{ tool: string; targetId: string; caption: string; compilerVersion: string }> } }
    const stepTwo = settled.document.attempts.find((entry) => entry.tool === 'tween' && entry.targetId !== seeded.stepSlotId)!
    expect(stepTwo.caption).toBe(previewed)
    expect(stepTwo.compilerVersion).toBe('1')
    await expect(page.locator('[data-anim-command-error]')).toHaveCount(0)
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  // The fake-engine child actually exited — never orphaned.
  expect(engineExited).toBe(true)
})

test('a duplicate completion at the surface leaves exactly one candidate (review)', async ({ page, request }) => {
  test.setTimeout(90_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedInspectorDocument(request, projectId, 'Duplicate at the surface')
    await page.goto(`/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`)
    await expect(page.locator('[data-anim-timeline]')).toBeVisible({ timeout: 15_000 })
    // The first submission from the page context with a KNOWN idempotency
    // key (the walk replays the identical request later).
    const key = `anim-e2e-dup-${Date.now()}`
    const body = tweenDraftBody(seeded.documentId, seeded.stepSlotId, key)
    const first = await page.evaluate(async (payload) => {
      const response = await fetch('/api/lan/animation/attempts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      return await response.json() as { attemptId: string; created: boolean }
    }, body)
    expect(first.created).toBe(true)
    await expect.poll(async () => {
      const view = await readAttemptView(request, first.attemptId)
      return view.attempt.execution === 'ready' && view.attempt.candidate !== null
    }, { timeout: 30_000 }).toBe(true)
    // The panel shows the ONE landed candidate.
    await page.reload()
    const panel = page.locator('[data-anim-review]')
    await expect(panel).toBeVisible({ timeout: 15_000 })
    await expect(panel.locator('[data-anim-review-clip]')).toHaveCount(1)
    const historySize = Object.keys(await engine.historyAll()).length
    expect(historySize).toBe(1)

    // The duplicate attempt-ready (§12.3): the SAME idempotency key + the
    // SAME inputs from a second tab context — the route answers with the
    // EXISTING attempt (§7.2.2), never a second render.
    const second = await page.evaluate(async (payload) => {
      const response = await fetch('/api/lan/animation/attempts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      return await response.json() as { attemptId: string; created: boolean }
    }, body)
    expect(second.attemptId).toBe(first.attemptId)
    expect(second.created).toBe(false)
    // The surface still shows exactly ONE candidate (Review Focus #1), the
    // engine still holds exactly ONE completed record, and the document
    // holds exactly ONE attempt row for the step slot.
    await expect(panel.locator('[data-anim-review-clip]')).toHaveCount(1)
    await expect(panel.locator('[data-anim-review-status]')).toHaveText('Ready to review')
    expect(Object.keys(await engine.historyAll()).length).toBe(historySize)
    const view = await readAnimationDocument(request, seeded.documentId)
    expect(view.document.attempts.filter((entry) => entry.targetId === seeded.stepSlotId)).toHaveLength(1)
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  expect(engineExited).toBe(true)
})

test('a failed preparation recovers through the panel retry action (review)', async ({ page, request }) => {
  test.setTimeout(90_000)
  const problems = await trackErrors(page)
  let engine = await startFakeEngine()
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedInspectorDocument(request, projectId, 'Preparation recovery')
    await page.goto(`/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`)
    await expect(page.locator('[data-anim-timeline]')).toBeVisible({ timeout: 15_000 })
    const submitted = await page.evaluate(async (payload) => {
      const response = await fetch('/api/lan/animation/attempts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      return await response.json() as { attemptId: string }
    }, tweenDraftBody(seeded.documentId, seeded.stepSlotId, `anim-e2e-prep-${Date.now()}`))
    await expect.poll(async () => {
      const view = await readAttemptView(request, submitted.attemptId)
      return view.attempt.execution === 'ready' && view.attempt.preparation.state === 'proposed'
    }, { timeout: 30_000 }).toBe(true)

    // §11.4's preparation-failure class after F1: a masked history record no
    // longer starves preparation (the DURABLE registered clip answers), so
    // the honest remaining failure is the engine being UNREACHABLE. Kill it;
    // the retry's bounded attempts exhaust against the dead port —
    // preparation FAILED, the clip PRESERVED.
    expect(await engine.kill()).toBe(true)
    await request.post('/api/lan/animation/attempt/retry-preparation', { data: { attemptId: submitted.attemptId } })
    const failed = await readAttemptView(request, submitted.attemptId)
    expect(failed.attempt.preparation.state).toBe('failed')
    expect(failed.attempt.execution).toBe('ready')

    // The panel names the failed preparation and offers the explicit
    // recovery action (F3) — the durable read carries it (reload).
    await page.reload()
    const panel = page.locator('[data-anim-review]')
    await expect(panel).toBeVisible({ timeout: 15_000 })
    await expect(panel).toHaveAttribute('data-anim-review-preparation', 'failed')
    await expect(panel.locator('[data-anim-review-clip]')).toBeVisible()
    await expect(panel.locator('[data-anim-review-status]')).toHaveText('Ready to review')

    // The engine RETURNS — restarted on the same port with EMPTY history
    // (the routine-restart shape). The panel's retry wires the client's
    // retryPreparation, and the proposal returns through the DURABLE clip
    // (F1: history gone is no longer a preparation failure) — WITHOUT any
    // new engine work: the restarted engine still holds zero records.
    engine = await startFakeEngine(engine.port)
    await panel.locator('[data-refusal-satisfy]').click()
    await expect(panel).toHaveAttribute('data-anim-review-preparation', 'proposed', { timeout: 15_000 })
    await expect(panel.locator('[data-anim-review-frame="11"]')).toHaveAttribute('data-anim-frame-proposed', 'true')
    expect(Object.keys(await engine.historyAll()).length).toBe(0)
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  expect(engineExited).toBe(true)
})

test('a failed attempt renders its named reason and the distinct Failed copy without touching selections (review)', async ({ page, request }) => {
  test.setTimeout(90_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  // The review's own #6 scenario: the engine's validation gate refuses the
  // graph at /prompt (the invalid-model refusal shape) — a precise,
  // structured answer the pre-wave-1 surface collapsed into "Failed or
  // canceled".
  await engine.control({ failMode: 'validation' })
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedInspectorDocument(request, projectId, 'Failed vocabulary')
    await page.goto(`/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`)
    await expect(page.locator('[data-anim-timeline]')).toBeVisible({ timeout: 15_000 })
    const submitted = await page.evaluate(async (payload) => {
      const response = await fetch('/api/lan/animation/attempts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      return await response.json() as { attemptId: string }
    }, tweenDraftBody(seeded.documentId, seeded.stepSlotId, `anim-e2e-fail-${Date.now()}`))
    await expect.poll(async () => (await readAttemptView(request, submitted.attemptId)).attempt.execution, { timeout: 30_000 }).toBe('failed')

    await page.reload()
    // §7.4's restored-session highlight is spec-worded for "Ready to review"
    // — a terminal failure is reached through the span the user authored
    // (the playhead marks open decisions and running work, not dead ones).
    const failedTimeline = page.locator('[data-anim-timeline]')
    await expect(failedTimeline).toBeVisible({ timeout: 15_000 })
    await failedTimeline.locator(`[data-anim-span="${seeded.spanId}"]`).click()
    const panel = page.locator('[data-anim-review]')
    await expect(panel).toBeVisible({ timeout: 15_000 })
    await expect(panel).toHaveAttribute('data-anim-review-state', 'failed')
    // Wave 1 (the review's #6): FAILED is its own word — distinct from the
    // neutral stopped line — and the DURABLE named reason renders with it
    // (the failing node class, the rejected input and value), so the re-roll
    // beside it is not the only visible fact.
    await expect(panel.locator('[data-anim-review-status]')).toHaveText('Failed')
    await expect(panel.locator('[data-anim-review-meaning]')).toContainText('Previous selections remain')
    const reason = panel.locator('[data-anim-review-failure-reason]')
    await expect(reason).toBeVisible()
    await expect(reason).toContainText('MiniMaxH3ImageToVideo')
    await expect(reason).toContainText('length')
    // No candidate landed: no clip, no frame strip, nothing to continue
    // from — and a re-roll stays available (a fresh take is a new attempt).
    await expect(panel.locator('[data-anim-review-clip]')).toHaveCount(0)
    await expect(panel.locator('[data-anim-review-frames]')).toHaveCount(0)
    await expect(panel.locator('[data-anim-review-continue]')).toBeDisabled()
    await expect(panel.locator('[data-anim-review-reroll]')).toBeEnabled()
    // The failure changed no selection (§8.2's never-silently list).
    const view = await readAnimationDocument(request, seeded.documentId)
    expect(view.document.body.keys.find((entry) => entry.id === seeded.fromKeyId)!.selectedCandidateId).toBe(seeded.fromSelected)
    expect(view.document.body.spans.find((entry) => entry.id === seeded.spanId)!.stepSlots[0]!.selectedRollingReference).toBeNull()
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await engine.control({ failMode: null }).catch(() => undefined)
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  expect(engineExited).toBe(true)
})

test('a cancelled attempt renders the neutral Stopped copy — never a failure reason (review)', async ({ page, request }) => {
  test.setTimeout(90_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  // Slow enough that the cancel lands mid-render, deterministically.
  await engine.control({ steps: 12, stepDelayMs: 350 })
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedInspectorDocument(request, projectId, 'Cancelled vocabulary')
    await page.goto(`/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`)
    await expect(page.locator('[data-anim-timeline]')).toBeVisible({ timeout: 15_000 })
    const submitted = await page.evaluate(async (payload) => {
      const response = await fetch('/api/lan/animation/attempts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      return await response.json() as { attemptId: string }
    }, tweenDraftBody(seeded.documentId, seeded.stepSlotId, `anim-e2e-cancel-${Date.now()}`))
    await request.post('/api/lan/animation/attempt/cancel', { data: { attemptId: submitted.attemptId } })
    await expect.poll(async () => (await readAttemptView(request, submitted.attemptId)).attempt.execution, { timeout: 30_000 }).toBe('cancelled')

    // The panel through the span: the NEUTRAL stopped line — a cancellation
    // is not a failure, so no reason block ever renders (wave 1's failed ≠
    // canceled split).
    await page.reload()
    const timeline = page.locator('[data-anim-timeline]')
    await expect(timeline).toBeVisible({ timeout: 15_000 })
    await timeline.locator(`[data-anim-span="${seeded.spanId}"]`).click()
    const panel = page.locator('[data-anim-review]')
    await expect(panel).toBeVisible({ timeout: 15_000 })
    await expect(panel).toHaveAttribute('data-anim-review-state', 'cancelled')
    await expect(panel.locator('[data-anim-review-status]')).toHaveText('Stopped')
    await expect(panel.locator('[data-anim-review-meaning]')).toContainText('stopped')
    await expect(panel.locator('[data-anim-review-failure-reason]')).toHaveCount(0)
    await expect(panel.locator('[data-anim-review-reroll]')).toBeEnabled()
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await engine.control({ steps: 3, stepDelayMs: 40 }).catch(() => undefined)
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  expect(engineExited).toBe(true)
})

test('a model-slot refusal surfaces through the inspector and the resubmit renders once the engine serves the slot (resolution)', async ({ page, request }) => {
  test.setTimeout(120_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedInspectorDocument(request, projectId, 'Resolution refusal')
    const animationUrl = `/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`
    await page.goto(animationUrl)
    await expect(page.locator('[data-anim-timeline]')).toBeVisible({ timeout: 15_000 })
    // Open the span's inspector and fill the movement (the slice test's
    // seeding shape).
    await page.locator(`[data-anim-span="${seeded.spanId}"]`).click()
    const inspector = page.locator('[data-anim-inspector]')
    await expect(inspector).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-anim-inspector-movement]').fill('she pushes off the back foot into a full stride')

    // The engine enumerates NOTHING for the lora slot: the submit through
    // the REAL inspector is refused BEFORE anything is spent, and the named
    // reason reaches the surface (the slot, the node class, the tried
    // pinned adapter, the enumeration).
    await engine.control({ loaderEnumerations: { unet: ['minimax_h3_ref2va_pruned_int8_convrot.safetensors'], clip: ['qwen3vl_32b_int8_convrot.safetensors'], vae: ['minimax_h3_video_vae_fp16.safetensors'], lora: [] } })
    await page.locator('[data-anim-inspector-submit]').click()
    const commandError = page.locator('[data-anim-command-error]')
    await expect(commandError).toBeVisible({ timeout: 15_000 })
    await expect(commandError).toContainText('adapterLora')
    await expect(commandError).toContainText('LoraLoaderModelOnly')
    await expect(commandError).toContainText('h3_tween_step12000.safetensors')
    await expect(commandError).toContainText('enumerates')

    // Nothing was spent: no attempt row exists for the document.
    const view = await readAnimationDocument(request, seeded.documentId)
    expect(view.document.attempts.length).toBe(0)

    // The enumeration CHANGES (the engine now serves the slot): the same
    // submit path resolves and RENDERS — the repair the reason names.
    await engine.control({ loaderEnumerations: null })
    await page.locator('[data-anim-inspector-submit]').click()
    await expect(page.locator('[data-anim-command-error]')).toHaveCount(0, { timeout: 15_000 })
    const panel = page.locator('[data-anim-review]')
    await expect(panel).toBeVisible({ timeout: 30_000 })
    await expect(panel).toHaveAttribute('data-anim-review-state', 'ready', { timeout: 30_000 })
    await expect(panel.locator('[data-anim-review-clip]')).toBeVisible()
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await engine.control({ loaderEnumerations: null }).catch(() => undefined)
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  expect(engineExited).toBe(true)
})

test('a re-roll adds an alternative take without replacing the selection (review)', async ({ page, request }) => {
  test.setTimeout(120_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedInspectorDocument(request, projectId, 'Re-roll takes')
    const animationUrl = `/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`
    await page.goto(animationUrl)
    await expect(page.locator('[data-anim-timeline]')).toBeVisible({ timeout: 15_000 })
    // Take 1 lands and the user selects frame 3 from it explicitly.
    const takeOne = await page.evaluate(async (payload) => {
      const response = await fetch('/api/lan/animation/attempts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      return await response.json() as { attemptId: string }
    }, tweenDraftBody(seeded.documentId, seeded.stepSlotId, `anim-e2e-roll-1-${Date.now()}`))
    await expect.poll(async () => {
      const view = await readAttemptView(request, takeOne.attemptId)
      return view.attempt.execution === 'ready' && view.attempt.candidate !== null
    }, { timeout: 30_000 }).toBe(true)
    await page.reload()
    const panel = page.locator('[data-anim-review]')
    await expect(panel).toBeVisible({ timeout: 15_000 })
    await panel.locator('[data-anim-review-frame="3"]').click()
    await expect(panel.locator('[data-anim-review-frame="3"]')).toHaveAttribute('data-anim-frame-selected', 'true')

    // RE-ROLL: a fresh take for the SAME step (a new idempotency key — a
    // deliberate roll, never §7.2.2's retry key). The take lands as an
    // ALTERNATIVE; the selection from take 1 is never replaced.
    await panel.locator('[data-anim-review-reroll]').click()
    await expect.poll(async () => {
      const view = await readAnimationDocument(request, seeded.documentId)
      return view.document.attempts.filter((entry) => entry.targetId === seeded.stepSlotId).length
    }, { timeout: 30_000 }).toBe(2)
    const both = await readAnimationDocument(request, seeded.documentId)
    const takeTwo = both.document.attempts.find((entry) => entry.targetId === seeded.stepSlotId && entry.attemptId !== takeOne.attemptId)!.attemptId
    // The panel's subject follows the NEWEST take to its own Ready state,
    // and the take strip lists BOTH with take 1 still the selected one.
    await expect(panel).toHaveAttribute('data-anim-review-attempt', takeTwo)
    await expect(panel).toHaveAttribute('data-anim-review-state', 'ready', { timeout: 30_000 })
    const takes = panel.locator('[data-anim-review-take]')
    await expect(takes).toHaveCount(2)
    await expect(panel.locator(`[data-anim-review-take="${takeOne.attemptId}"]`)).toHaveAttribute('data-anim-take-selected', 'true')
    await expect(panel.locator(`[data-anim-review-take="${takeTwo}"]`)).toHaveAttribute('data-anim-take-selected', 'false')
    // The DOCUMENT truth: the selection still names take 1 (§8.2 — the
    // landing never replaced it), while the slot holds both takes.
    const rolled = await readAnimationDocument(request, seeded.documentId)
    const rolledSlot = rolled.document.body.spans.find((entry) => entry.id === seeded.spanId)!.stepSlots[0]!
    expect(rolledSlot.attempts).toEqual([takeOne.attemptId, takeTwo])
    expect(rolledSlot.selectedRollingReference).toEqual({ attemptId: takeOne.attemptId, frameIndex: 3, poseDescription: null, facing: null })

    // Switching takes is an EXPLICIT user act: reviewing take 2 and choosing
    // frame 8 moves the selection — the user did it, not the system.
    await panel.locator(`[data-anim-review-take="${takeTwo}"]`).click()
    await expect(panel).toHaveAttribute('data-anim-review-attempt', takeTwo)
    await panel.locator('[data-anim-review-frame="8"]').click()
    await expect(panel.locator('[data-anim-review-frame="8"]')).toHaveAttribute('data-anim-frame-selected', 'true')
    const switched = await readAnimationDocument(request, seeded.documentId)
    expect(switched.document.body.spans.find((entry) => entry.id === seeded.spanId)!.stepSlots[0]!.selectedRollingReference).toEqual({ attemptId: takeTwo, frameIndex: 8, poseDescription: null, facing: null })
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  expect(engineExited).toBe(true)
})

// ---------------------------------------------------------------------------
// Task 11 — the hero tool (§5.2 the hero sourcing path, §6.2 the hero
// caption template, §7.2.2 the two frame paths, §8.2 candidate landing):
// the hero generates the NEXT key from the current one — the submission
// targets a FRESH PROPOSED key slot (never a re-roll of the source), the
// clip lands there as an unselected candidate, and the user's EXPLICIT
// frame acceptance establishes the key (a new candidate + the selection).
// The accepted key then becomes the incoming tween span's FIXED FAR
// reference (§5.2) — proven end to end by a tween step that SUBMITS AND
// RENDERS against it (a video-asset far reference would be refused by the
// image-only rule; success is the proof the accepted frame resolved as an
// image). Lock enforcement and outdated-result provenance ride the same
// flow. The production completion owner runs everything; the fake engine
// (which lists the clip's decoded frames beside the clip) is the only
// double.
// ---------------------------------------------------------------------------

/** The hero flow's seed: a bound document with ONE selected key (a real
 *  blob image, a pose, a facing) — the hero's SOURCE. */
async function seedHeroDocument(request: APIRequestContext, projectId: string, name: string) {
  const relPath = await ingestKeyImage(request, 'anim-hero-source.png')
  const created = await (await request.post('/api/lan/animation/documents', {
    data: { projectId, name, binding: { characterDescription: 'a lanky courier in a long coat', referenceAssetIds: [uuid()], medium: 'clean line on white', initialKeyAssetId: relPath } },
  })).json() as { document: { id: string; revision: number } }
  const documentId = created.document.id
  let revision = created.document.revision
  const keyId = uuid()
  const candidateId = uuid()
  let landed = await (await request.post('/api/lan/animation/keys', {
    data: { op: 'add-candidate', documentId, keyId, expectedRevision: revision, candidate: { id: candidateId, assetReference: { assetId: `animref-${uuid().slice(0, 8)}`, relPath, kind: 'image' }, origin: 'import', provenance: { assetId: 'animref-hero-source' }, poseDescription: 'mid-stride, arms pumping', facing: 'screen-left' } },
  })).json() as { document: { revision: number } }
  revision = landed.document.revision
  landed = await (await request.post('/api/lan/animation/select/key-candidate', { data: { documentId, keyId, candidateId, expectedRevision: revision } })).json() as { document: { revision: number } }
  revision = landed.document.revision
  return { documentId, revision, keyId, candidateId }
}

const HERO_ARC = 'she plants the forward foot, pushes through into a full stride, and settles onto the heel three steps along'

test('the §5.2 hero slice — generate the next key, accept a frame explicitly, bind the far reference (hero)', async ({ page, request }) => {
  test.setTimeout(150_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedHeroDocument(request, projectId, 'The hero slice')
    const animationUrl = `/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`
    await page.goto(animationUrl)
    const timeline = page.locator('[data-anim-timeline]')
    await expect(timeline).toBeVisible({ timeout: 15_000 })
    // Selecting the source key opens the HERO AUTHORING PANEL (§5.2): the
    // current key's image as the single reference, the movement arc, the
    // client-compiled caption preview.
    const sourceCard = timeline.locator(`[data-anim-key="${seeded.keyId}"]`)
    await sourceCard.click()
    const panel = page.locator('[data-anim-hero-panel]')
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute('data-anim-hero-panel-key', seeded.keyId)
    await expect(panel.locator('[data-anim-hero-source] img')).toBeVisible()
    await expect(page.locator('[data-refusal]')).toHaveCount(0)
    // The arc + the caption preview: §6.2's template — SCENE, ONE numbered
    // reference line (the current key), MOVEMENT verbatim, the fixed STATIC
    // hold — and NO destination section.
    await page.locator('[data-anim-hero-arc]').fill(HERO_ARC)
    await page.locator('[data-anim-hero-caption-preview] summary').click()
    const caption = page.locator('[data-anim-hero-caption-text]')
    await expect(caption).toBeVisible()
    await expect(caption).toContainText(`MOVEMENT: ${HERO_ARC}`, { timeout: 5_000 })
    await expect(caption).toContainText('Reference 1: the current key — mid-stride, arms pumping, facing screen-left')
    await expect(caption).toContainText('SCENE: clean line on white.')
    expect(await caption.textContent()).not.toContain('TARGET END FRAME')
    const previewed = await caption.textContent()
    // GENERATE (§7.1's explicit action): the attempt targets a fresh
    // PROPOSED key slot; the in-flight render attaches to its SOURCE key
    // (the playhead's rule 2 — the slot materializes only at landing).
    await page.locator('[data-anim-hero-submit]').click()
    await expect(timeline.locator('[data-anim-playhead]')).toHaveAttribute('data-anim-playhead-at', seeded.keyId, { timeout: 15_000 })
    await expect(timeline.locator('[data-anim-playhead]')).toHaveAttribute('data-anim-playhead-kind', 'key')
    // The landing (the completion owner's own polling): the proposed slot
    // materializes with the clip, selection null.
    let heroAttemptId = ''
    await expect.poll(async () => {
      const view = await readAnimationDocument(request, seeded.documentId)
      const hero = view.document.attempts.find((entry) => entry.tool === 'hero')
      heroAttemptId = hero?.attemptId ?? ''
      return hero !== undefined && hero.execution === 'ready' && view.document.body.keys.length === 2
    }, { timeout: 30_000 }).toBe(true)
    const landedView = await readAnimationDocument(request, seeded.documentId)
    const sourceSlot = landedView.document.body.keys.find((entry) => entry.id === seeded.keyId)!
    const proposedSlot = landedView.document.body.keys.find((entry) => entry.id !== seeded.keyId)!
    // (b) §5.2: the accepted frame establishes a NEW key — the SOURCE key is
    // untouched (its candidates and selection exactly what they were).
    expect(sourceSlot.candidates).toHaveLength(1)
    expect(sourceSlot.selectedCandidateId).toBe(seeded.candidateId)
    expect(proposedSlot.candidates).toHaveLength(1)
    expect(proposedSlot.candidates[0]!.origin).toBe('hero')
    expect(proposedSlot.selectedCandidateId).toBeNull()
    // The frozen caption is the previewed text VERBATIM (byte-equal), with
    // the frozen arc + source key riding the row (§8.1).
    const attemptState = await (await request.get(`/api/lan/animation/attempt?id=${heroAttemptId}`)).json() as { attempt: { caption: string; sourceKeyId: string; movementArc: string } }
    expect(attemptState.attempt.caption).toBe(previewed)
    expect(attemptState.attempt.sourceKeyId).toBe(seeded.keyId)
    expect(attemptState.attempt.movementArc).toBe(HERO_ARC)
    // The fabric's refresh grew the card (no badge — nothing selected); the
    // user's explicit selection of the new key opens the HERO REVIEW.
    const proposedCard = timeline.locator(`[data-anim-key="${proposedSlot.id}"]`)
    await expect(proposedCard).toBeVisible({ timeout: 15_000 })
    await expect(proposedCard.locator('[data-anim-key-badge]')).toHaveCount(0)
    await proposedCard.click()
    const review = page.locator('[data-anim-hero-review]')
    await expect(review).toBeVisible()
    await expect(review).toHaveAttribute('data-anim-review-attempt', heroAttemptId)
    await expect(review).toHaveAttribute('data-anim-review-state', 'ready')
    await expect(review.locator('[data-anim-review-status]')).toHaveText('Ready to review')
    await expect(review.locator('[data-anim-review-clip]')).toBeVisible()
    // The frame strip (§7.2.2): 22 frames, the PROPOSAL marked, NOTHING
    // accepted (the system proposes; only the user accepts).
    const frames = review.locator('[data-anim-hero-frame]')
    await expect(frames).toHaveCount(22)
    await expect(review.locator('[data-anim-hero-frame="11"]')).toHaveAttribute('data-anim-frame-proposed', 'true')
    await expect(review.locator('[data-anim-frame-accepted="true"]')).toHaveCount(0)
    await expect(review.locator('[data-anim-hero-accepted-frame]')).toContainText('No frame accepted')
    // ACCEPT frame 5 — explicit, not the proposal: the on-demand extraction
    // path (§7.2.2 path 2), wire-pinned to exactly one extract-frame POST.
    let extractCalls = 0
    page.on('request', (route) => { if (route.url().includes('/api/lan/animation/attempt/extract-frame')) extractCalls += 1 })
    await review.locator('[data-anim-hero-frame="5"]').click()
    await expect(review.locator('[data-anim-hero-frame="5"]')).toHaveAttribute('data-anim-frame-accepted', 'true')
    await expect(review.locator('[data-anim-hero-accepted-frame]')).toContainText('frame 5 of this take')
    expect(extractCalls, 'the acceptance rides on-demand extraction once').toBe(1)
    // The acceptance is DOCUMENT truth (§7.2.1's selectKeyCandidate arm): the
    // proposed slot holds the clip AND the accepted frame, the selection
    // names the frame (origin hero, provenance take+frame), and the key card
    // grew its badge. The SOURCE key is still untouched.
    const acceptedView = await readAnimationDocument(request, seeded.documentId)
    const acceptedSlot = acceptedView.document.body.keys.find((entry) => entry.id === proposedSlot.id)!
    expect(acceptedSlot.candidates).toHaveLength(2)
    expect(acceptedSlot.selectedCandidateId).not.toBeNull()
    const acceptedCandidate = acceptedSlot.candidates.find((entry) => entry.id === acceptedSlot.selectedCandidateId)!
    expect(acceptedCandidate.origin).toBe('hero')
    expect(acceptedCandidate.provenance.sourceTake).toBe(heroAttemptId)
    expect(acceptedCandidate.provenance.sourceFrame).toBe(5)
    expect(acceptedCandidate.assetReference.kind).toBe('image', 'the accepted frame resolved as a real image asset')
    await expect(proposedCard.locator('[data-anim-key-badge]')).toHaveAttribute('data-anim-key-badge', 'hero')
    // (a) a RE-ROLL lands an alternative without moving the selection: a
    // fresh take for the SAME proposed slot, the frozen arc resubmitted.
    // The settle is the second take's LANDING (its clip in the slot), not
    // the submit — the attempt row exists while still rendering.
    await review.locator('[data-anim-review-reroll]').click()
    await expect.poll(async () => {
      const view = await readAnimationDocument(request, seeded.documentId)
      const takes = view.document.attempts.filter((entry) => entry.tool === 'hero' && entry.targetId === proposedSlot.id)
      return takes.length === 2 && takes[1]!.execution === 'ready'
    }, { timeout: 30_000 }).toBe(true)
    const rolledView = await readAnimationDocument(request, seeded.documentId)
    const rolledSlot = rolledView.document.body.keys.find((entry) => entry.id === proposedSlot.id)!
    expect(rolledSlot.selectedCandidateId).toBe(acceptedSlot.selectedCandidateId, 'the re-roll never replaced the acceptance (§8.2)')
    expect(rolledSlot.candidates.length).toBeGreaterThanOrEqual(3, 'the second clip landed as a retained alternative')
    await expect(review).toHaveAttribute('data-anim-review-state', 'ready', { timeout: 30_000 })
    // (d) LOCK enforcement: the locked key refuses the frame acceptance
    // (§7.2.1 — the server's rule, named here before the doomed command).
    const lockChip = proposedCard.locator('[data-anim-key-lock]')
    await lockChip.click()
    await expect(lockChip).toHaveAttribute('aria-pressed', 'true')
    await review.locator('[data-anim-hero-frame="8"]').click()
    const lockedRefusal = page.locator('[data-anim-command-error]')
    await expect(lockedRefusal).toBeVisible()
    await expect(lockedRefusal).toContainText('locked')
    const stillLockedView = await readAnimationDocument(request, seeded.documentId)
    expect(stillLockedView.document.body.keys.find((entry) => entry.id === proposedSlot.id)!.selectedCandidateId).toBe(acceptedSlot.selectedCandidateId, 'the locked key\'s selection never moved')
    // The explicit unlock, then the acceptance moves the selection — the
    // user's act, not the system's.
    await lockChip.click()
    await expect(lockChip).toHaveAttribute('aria-pressed', 'false')
    await review.locator('[data-anim-hero-frame="8"]').click()
    await expect(review.locator('[data-anim-hero-frame="8"]')).toHaveAttribute('data-anim-frame-accepted', 'true', { timeout: 15_000 })
    const reAcceptedView = await readAnimationDocument(request, seeded.documentId)
    const reAcceptedSlot = reAcceptedView.document.body.keys.find((entry) => entry.id === proposedSlot.id)!
    expect(reAcceptedSlot.selectedCandidateId).not.toBe(acceptedSlot.selectedCandidateId)
    const reAccepted = reAcceptedSlot.candidates.find((entry) => entry.id === reAcceptedSlot.selectedCandidateId)!
    expect(reAccepted.provenance.sourceTake).not.toBe(heroAttemptId, 'the new acceptance came from the re-rolled take')
    expect(reAccepted.provenance.sourceFrame).toBe(8)
    // (c) the accepted key becomes the incoming tween span's FIXED FAR
    // reference (§5.2): the span action mints source→this key and opens the
    // inspector — the TARGET END FRAME card IS the accepted frame's image.
    await review.locator('[data-anim-hero-open-span]').click()
    const inspector = page.locator('[data-anim-inspector]')
    await expect(inspector).toBeVisible({ timeout: 15_000 })
    await expect(inspector.locator('[data-anim-frame="target"] img')).toBeVisible()
    const spanView = await readAnimationDocument(request, seeded.documentId)
    const theSpan = spanView.document.body.spans.find((entry) => entry.fromKeyId === seeded.keyId && entry.toKeyId === proposedSlot.id)
    expect(theSpan, 'the span source→hero-key minted').toBeTruthy()
    expect(theSpan!.intent.movement).toBe(HERO_ARC, 'the hero arc seeded the span\'s movement draft')
    // The end-to-end proof: a tween step SUBMITS AND RENDERS against the
    // span — the far reference resolved from the hero key's accepted frame
    // (an image asset; a video far reference would be refused outright by
    // the image-only rule, so the attempt reaching the engine IS the proof).
    await page.locator('[data-anim-inspector-submit]').click()
    await expect.poll(async () => {
      const view = await readAnimationDocument(request, seeded.documentId)
      return view.document.attempts.filter((entry) => entry.tool === 'tween').length
    }, { timeout: 30_000 }).toBe(1)
    const tweenAttemptId = (await readAnimationDocument(request, seeded.documentId)).document.attempts.find((entry) => entry.tool === 'tween')!.attemptId
    await expect(page.locator('[data-anim-command-error]')).toHaveCount(0)
    await expect.poll(async () => (await readAttemptView(request, tweenAttemptId)).attempt.execution, { timeout: 30_000 }).toBe('ready')
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  expect(engineExited).toBe(true)
})

test('an outdated hero result keeps its provenance and is marked generated from an earlier version (hero)', async ({ page, request }) => {
  test.setTimeout(150_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  // A render long enough (~14s at 40 steps × 350ms) that the document can
  // move behind the page's back WELL inside the render window.
  await engine.control({ steps: 40, stepDelayMs: 350 })
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedHeroDocument(request, projectId, 'Outdated hero')
    const animationUrl = `/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`
    await page.goto(animationUrl)
    const timeline = page.locator('[data-anim-timeline]')
    await expect(timeline).toBeVisible({ timeout: 15_000 })
    await timeline.locator(`[data-anim-key="${seeded.keyId}"]`).click()
    await page.locator('[data-anim-hero-arc]').fill('she rises from the bench and squares her shoulders')
    await page.locator('[data-anim-hero-submit]').click()
    // The attempt persists BEFORE the dispatch — settle on the durable row,
    // then RELOAD: the §7.4 restored-session read shows the in-flight render
    // attached to its SOURCE key (the proposed slot has not materialized;
    // the playhead's rule 2, pinned here for hero).
    await expect.poll(async () => {
      const view = await readAnimationDocument(request, seeded.documentId)
      return view.document.attempts.some((entry) => entry.tool === 'hero')
    }, { timeout: 15_000 }).toBe(true)
    await page.reload()
    const reloaded = page.locator('[data-anim-timeline]')
    await expect(reloaded).toBeVisible({ timeout: 15_000 })
    await expect(reloaded.locator('[data-anim-playhead]')).toHaveAttribute('data-anim-playhead-at', seeded.keyId, { timeout: 15_000 })
    // The document MOVES while the render runs (§8.2): an authoring command
    // lands behind the page's back — an alternative candidate on the source
    // key, its selection untouched.
    const current = await (await request.get(`/api/lan/animation/document?id=${seeded.documentId}`)).json() as { document: { revision: number } }
    const moved = await request.post('/api/lan/animation/keys', {
      data: {
        op: 'add-candidate', documentId: seeded.documentId, keyId: seeded.keyId, expectedRevision: current.document.revision,
        candidate: { id: uuid(), assetReference: { assetId: `animref-${uuid().slice(0, 8)}`, relPath: null, kind: 'image' }, origin: 'import', provenance: { assetId: 'animref-midflight' }, poseDescription: 'a mid-flight alternative', facing: null },
      },
    })
    expect(moved.ok(), `the mid-flight authoring write lands (${await moved.text()})`).toBe(true)
    // The landing keeps its ORIGINAL provenance: earlierRevision true.
    let heroAttemptId = ''
    await expect.poll(async () => {
      const view = await readAnimationDocument(request, seeded.documentId)
      const hero = view.document.attempts.find((entry) => entry.tool === 'hero')
      heroAttemptId = hero?.attemptId ?? ''
      return hero !== undefined && hero.execution === 'ready'
    }, { timeout: 40_000 }).toBe(true)
    const state = await readAttemptView(request, heroAttemptId)
    expect(state.attempt.candidate!.earlierRevision).toBe(true, 'the store marked the result generated from an earlier revision')
    // The review surfaces it (§8.2's named note) — a reload lands the
    // restored session with the ready-open hero decision auto-focused.
    await page.reload()
    const review = page.locator('[data-anim-hero-review]')
    await expect(review).toBeVisible({ timeout: 15_000 })
    await expect(review).toHaveAttribute('data-anim-review-state', 'ready')
    await expect(review.locator('[data-anim-review-earlier]')).toBeVisible()
    await expect(review.locator('[data-anim-review-earlier]')).toContainText('earlier version')
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  expect(engineExited).toBe(true)
})

// ---------------------------------------------------------------------------
// Task 12 — the sequence tool (§5.2 the sequence sourcing path, §6.2 the
// sequence caption template, §7.3 the status vocabulary, §8.2 candidate
// landing, §11.2 "sequence attempts capture a selected key window"): TWO
// references — the window's first drawing and its own natural end — with no
// new mapping taught (surfacing held animation already in the base
// distribution). The selected key is the window START; the END is an explicit
// pick; the attempt targets the window snapshot (start-key target + the
// frozen end, beats, and preservation riding the row). The landing changes no
// document truth — the clip surfaces through editorial selection — and the
// re-roll resubmits the frozen window as a retained alternative. The
// production completion owner runs everything; the fake engine is the only
// double.
// ---------------------------------------------------------------------------

/** The sequence flow's seed: a bound document with TWO selected keys (real
 *  blob images, distinct poses + facings — the window's two drawings). */
async function seedSequenceDocument(request: APIRequestContext, projectId: string, name: string) {
  const relPathStart = await ingestKeyImage(request, 'anim-seq-start.png')
  const relPathEnd = await ingestKeyImage(request, 'anim-seq-end.png')
  const created = await (await request.post('/api/lan/animation/documents', {
    data: { projectId, name, binding: { characterDescription: 'a lanky courier in a long coat', referenceAssetIds: [uuid()], medium: 'clean line on white', initialKeyAssetId: relPathStart } },
  })).json() as { document: { id: string; revision: number } }
  const documentId = created.document.id
  let revision = created.document.revision
  const addSelected = async (relPath: string, pose: string, facing: string) => {
    const keyId = uuid()
    const candidateId = uuid()
    let landed = await (await request.post('/api/lan/animation/keys', {
      data: {
        op: 'add-candidate', documentId, keyId, expectedRevision: revision,
        candidate: { id: candidateId, assetReference: { assetId: `animref-${uuid().slice(0, 8)}`, relPath, kind: 'image' }, origin: 'import', provenance: { assetId: `animref-${uuid().slice(0, 8)}` }, poseDescription: pose, facing },
      },
    })).json() as { document: { revision: number } }
    revision = landed.document.revision
    landed = await (await request.post('/api/lan/animation/select/key-candidate', { data: { documentId, keyId, candidateId, expectedRevision: revision } })).json() as { document: { revision: number } }
    revision = landed.document.revision
    return keyId
  }
  const startKeyId = await addSelected(relPathStart, 'seated on the bench, hands folded', 'toward camera')
  const endKeyId = await addSelected(relPathEnd, 'standing, one hand raised to the hat brim', 'screen-left')
  return { documentId, revision, startKeyId, endKeyId }
}

const SEQUENCE_BEATS = ['she rises from the bench', 'the coat swings as she turns', 'she settles facing the platform']
const SEQUENCE_PRESERVATION = 'the coat hem stays consistent; the rhythm stays even'

test('the §5.2 sequence slice — pick the window explicitly, render it, review the held take, re-roll (sequence)', async ({ page, request }) => {
  test.setTimeout(150_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  // A render slow enough (~4s at 12 steps × 350ms) that the mid-flight
  // reload below deterministically lands INSIDE the flight window — at the
  // default speed the render can land while the page reloads, and a READY
  // sequence attempt on a selected start key marks no playhead (the review
  // decision that dissolves the marker is the editorial lane's, §9).
  await engine.control({ steps: 12, stepDelayMs: 350 })
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedSequenceDocument(request, projectId, 'The sequence slice')
    const animationUrl = `/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`
    await page.goto(animationUrl)
    const timeline = page.locator('[data-anim-timeline]')
    await expect(timeline).toBeVisible({ timeout: 15_000 })
    // Selecting the START key opens the sequence panel beside the hero panel
    // — one selection, two tools: the key sources the next hero generation
    // AND opens as a window start.
    await timeline.locator(`[data-anim-key="${seeded.startKeyId}"]`).click()
    const panel = page.locator('[data-anim-seq-panel]')
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute('data-anim-seq-panel-key', seeded.startKeyId)
    await expect(page.locator('[data-anim-hero-panel]')).toBeVisible()
    await expect(panel.locator('[data-anim-seq-start] img')).toBeVisible()
    // The window-end picker EXCLUDES the start key; the pick is the explicit
    // act this tool owns.
    const endGroup = page.locator('[data-anim-seq-end]')
    await expect(endGroup.getByRole('radio', { name: 'key #0' })).toHaveCount(0)
    await endGroup.getByRole('radio', { name: 'key #1' }).click()
    await expect(panel.locator('[data-anim-seq-end-card] img')).toBeVisible()
    // The beats (line order IS beat order) + the preservation.
    await page.locator('[data-anim-seq-actions]').fill(SEQUENCE_BEATS.join('\n'))
    await page.locator('[data-anim-seq-preservation]').fill(SEQUENCE_PRESERVATION)
    // The §6.2 caption preview: the alignment line first, Subject on twos
    // with the medium, the beats joined in order, Preserve last — the
    // sequence template's own section set.
    await page.locator('[data-anim-seq-caption-preview] summary').click()
    const caption = page.locator('[data-anim-seq-caption-text]')
    await expect(caption).toBeVisible()
    await expect(caption).toContainText('Alignment: Reference 1 (the window start) opens the sequence; Reference 2 (the window end) closes it', { timeout: 5_000 })
    await expect(caption).toContainText('animated on twos in clean line on white')
    await expect(caption).toContainText(`Action: ${SEQUENCE_BEATS.join('; ')}`)
    await expect(caption).toContainText(`Preserve: ${SEQUENCE_PRESERVATION}`)
    const previewed = await caption.textContent()
    expect(previewed?.startsWith('Alignment:'), 'the alignment line opens the caption').toBe(true)
    expect(previewed).not.toContain('SCENE:')
    // RENDER (§7.1's explicit action): the attempt targets the window's START
    // key — the durable row settles first, then the §7.4 restore pins the
    // in-flight playhead on that key (the timeline's rule 2 for the
    // sequence lane).
    await page.locator('[data-anim-seq-submit]').click()
    let sequenceAttemptId = ''
    await expect.poll(async () => {
      const view = await readAnimationDocument(request, seeded.documentId)
      const take = view.document.attempts.find((entry) => entry.tool === 'sequence')
      sequenceAttemptId = take?.attemptId ?? ''
      return take !== undefined
    }, { timeout: 15_000 }).toBe(true)
    await page.reload()
    const reloaded = page.locator('[data-anim-timeline]')
    await expect(reloaded).toBeVisible({ timeout: 15_000 })
    await expect(reloaded.locator('[data-anim-playhead]')).toHaveAttribute('data-anim-playhead-at', seeded.startKeyId, { timeout: 15_000 })
    await expect(reloaded.locator('[data-anim-playhead]')).toHaveAttribute('data-anim-playhead-kind', 'key')
    // The landing (the completion owner's own polling): ready + the review
    // mounts for the window takes, in §7.3's vocabulary.
    await expect.poll(async () => (await readAttemptView(request, sequenceAttemptId)).attempt.execution, { timeout: 30_000 }).toBe('ready')
    const review = page.locator('[data-anim-seq-review]')
    await expect(review).toBeVisible({ timeout: 15_000 })
    await expect(review).toHaveAttribute('data-anim-review-attempt', sequenceAttemptId)
    await expect(review).toHaveAttribute('data-anim-review-state', 'ready')
    await expect(review.locator('[data-anim-review-status]')).toHaveText('Ready to review')
    await expect(review.locator('[data-anim-review-meaning]')).toContainText('selection unchanged')
    // The frozen window names the pair (§8.1) — the start is the target, the
    // end the frozen draft's pick.
    await expect(review.locator('[data-anim-seq-review-window]')).toContainText('Window: key #0 → key #1')
    const clip = review.locator('[data-anim-review-clip]')
    await expect(clip).toBeVisible()
    await expect(clip).toHaveAttribute('src', /\/api\/lan\/documents\/blobs\/file/)
    // No frame strip in this lane: a window render's explicit selection IS
    // the window; the clip portions that contribute are §9's editorial
    // surface, not a frame pick here.
    await expect(review.locator('[data-anim-review-frames]')).toHaveCount(0)
    // The frozen caption is the previewed text VERBATIM (byte-equal), and
    // the row carries the frozen window snapshot (§11.2).
    const attemptState = await (await request.get(`/api/lan/animation/attempt?id=${sequenceAttemptId}`)).json() as { attempt: { caption: string; targetId: string; windowEndKeyId: string; sequenceActions: string[]; sequencePreservation: string } }
    expect(attemptState.attempt.caption).toBe(previewed)
    expect(attemptState.attempt.targetId).toBe(seeded.startKeyId, 'the attempt targets the window START key')
    expect(attemptState.attempt.windowEndKeyId).toBe(seeded.endKeyId, 'the frozen draft names the window END key')
    expect(attemptState.attempt.sequenceActions).toEqual(SEQUENCE_BEATS)
    expect(attemptState.attempt.sequencePreservation).toBe(SEQUENCE_PRESERVATION)
    // §8.2 for this lane: the landing changed NO body truth — both keys'
    // candidates and selections exactly what they were, the revision unmoved
    // (a sequence landing mints nothing; the clip surfaces through editorial
    // selection).
    const landed = await readAnimationDocument(request, seeded.documentId)
    expect(landed.document.revision).toBe(seeded.revision)
    for (const [keyId, order] of [[seeded.startKeyId, 0], [seeded.endKeyId, 1]] as const) {
      const slot = landed.document.body.keys.find((entry) => entry.id === keyId)!
      expect(slot.candidates).toHaveLength(1, `key #${order} gained nothing from the window landing`)
      expect(slot.selectedCandidateId).not.toBeNull()
    }
    // The in-flight guard has cleared: the panel's in-flight note is gone
    // (the panel remounted on the reload, so its authoring draft is fresh —
    // the button honestly stays gated until the window is re-picked).
    await expect(page.locator('[data-anim-seq-inflight]')).toHaveCount(0)
    // RE-ROLL: the frozen window draft resubmitted — a fresh take for the
    // SAME window, landing as a retained alternative that replaces nothing.
    await review.locator('[data-anim-review-reroll]').click()
    await expect.poll(async () => {
      const view = await readAnimationDocument(request, seeded.documentId)
      const takes = view.document.attempts.filter((entry) => entry.tool === 'sequence' && entry.targetId === seeded.startKeyId)
      return takes.length === 2 && takes[1]!.execution === 'ready'
    }, { timeout: 30_000 }).toBe(true)
    const rolled = await readAnimationDocument(request, seeded.documentId)
    const rolledSlot = rolled.document.body.keys.find((entry) => entry.id === seeded.startKeyId)!
    expect(rolledSlot.candidates).toHaveLength(1, 'the re-roll landed no candidate into the body either')
    expect(rolledSlot.selectedCandidateId).toBe(landed.document.body.keys.find((entry) => entry.id === seeded.startKeyId)!.selectedCandidateId, 'the re-roll never moved a selection (§8.2)')
    // The strip lists BOTH takes of this window; the subject follows the
    // newest; switching back to take 1 is the reviewer's explicit view act.
    await expect(review).toHaveAttribute('data-anim-review-state', 'ready', { timeout: 30_000 })
    const takes = review.locator('[data-anim-review-take]')
    await expect(takes).toHaveCount(2)
    const firstTake = rolled.document.attempts.filter((entry) => entry.tool === 'sequence')[0]!
    await review.locator(`[data-anim-review-take="${firstTake.attemptId}"]`).click()
    await expect(review).toHaveAttribute('data-anim-review-attempt', firstTake.attemptId)
    await expect(review.locator('[data-anim-review-caption-text]')).toContainText(`Action: ${SEQUENCE_BEATS.join('; ')}`)
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  expect(engineExited).toBe(true)
})

test('the window pick is explicit and bounded — gated submit, the distinct-endpoint refusal (sequence)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  const seeded = await seedSequenceDocument(request, projectId, 'Window bounds')
  // A THIRD key with a candidate but NO selection — it cannot bound a window
  // and the picker must say so.
  const current = await (await request.get(`/api/lan/animation/document?id=${seeded.documentId}`)).json() as { document: { revision: number } }
  const unselected = await (await request.post('/api/lan/animation/keys', {
    data: {
      op: 'add-candidate', documentId: seeded.documentId, keyId: uuid(), expectedRevision: current.document.revision,
      candidate: { id: uuid(), assetReference: { assetId: `animref-${uuid().slice(0, 8)}`, relPath: null, kind: 'image' }, origin: 'import', provenance: { assetId: 'animref-seq-unselected' }, poseDescription: null, facing: null },
    },
  })).json() as { document: { body: { keys: Array<{ id: string; selectedCandidateId: string | null }> } } }
  const unselectedKey = unselected.document.body.keys.find((entry) => entry.selectedCandidateId === null)!.id
  await page.goto(`/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`)
  const timeline = page.locator('[data-anim-timeline]')
  await expect(timeline).toBeVisible({ timeout: 15_000 })
  await timeline.locator(`[data-anim-key="${seeded.startKeyId}"]`).click()
  const panel = page.locator('[data-anim-seq-panel]')
  await expect(panel).toBeVisible()
  // The submit gate is the honest one: no end picked, no beats, no
  // preservation — each missing input keeps the action disabled.
  const submit = page.locator('[data-anim-seq-submit]')
  await expect(submit).toBeDisabled()
  const endGroup = page.locator('[data-anim-seq-end]')
  // Key #3 (no selected image) is present but DISABLED — a key with no
  // selection cannot bound a window, and the chip says so.
  const unselectedChip = endGroup.locator(`[data-anim-seq-end-key="${unselectedKey}"]`)
  await expect(unselectedChip).toBeDisabled()
  await endGroup.getByRole('radio', { name: 'key #1' }).click()
  await page.locator('[data-anim-seq-actions]').fill(SEQUENCE_BEATS[0]!)
  await expect(submit).toBeDisabled()
  await page.locator('[data-anim-seq-preservation]').fill(SEQUENCE_PRESERVATION)
  await expect(submit).toBeEnabled()
  // §5.2's bound at the route: a window spans two DISTINCT keys — the same
  // key as both endpoints is the degenerate window, refused BY NAME before
  // anything dispatches or persists (the picker excludes it; the route is
  // the defense in depth).
  const refusal = await page.evaluate(async ({ documentId, keyId, beat, preservation }) => {
    const response = await fetch('/api/lan/animation/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        documentId, tool: 'sequence', targetId: keyId, idempotencyKey: `anim-e2e-seq-self-${Date.now()}`,
        draft: { tool: 'sequence', windowStartKeyId: keyId, windowEndKeyId: keyId, orderedActions: [beat], preservation, overrides: { medium: 'clean line on white' } },
      }),
    })
    return { status: response.status, error: ((await response.json()) as { error?: string }).error ?? '' }
  }, { documentId: seeded.documentId, keyId: seeded.startKeyId, beat: SEQUENCE_BEATS[0], preservation: SEQUENCE_PRESERVATION })
  expect(refusal.status).toBe(400)
  expect(refusal.error).toContain('two distinct keys')
  // Nothing dispatched, nothing persisted — the document holds no attempts.
  const view = await readAnimationDocument(request, seeded.documentId)
  expect(view.document.attempts.length).toBe(0)
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// Task 13 — the editorial timing surface (§9 editorial timing and export,
// §11.3 the export conventions): the assembly layer. Which portions of landed
// clips contribute ([inFrame, outFrame) — start-inclusive, end-exclusive,
// integer frames), how long each hold lasts (output frames), the ORDER the
// contributions assemble in (the list order IS the assembled sequence's
// order), and the assembled-sequence preview (the frame-indexed strip + the
// frame total at the document's constant rate). Sequence window takes
// contribute through the SPANLESS lane (§11.2 — a window owns no span; the
// task-2 widening the ledger named); older windows' takes stay reachable
// (task 12's Important-1) both here (the picker lists every landed take) and
// in the review (the window chips + the window-scoped re-roll).
// ---------------------------------------------------------------------------

/** The editorial flow's seed: a bound document with THREE selected keys (the
 *  window lane needs a start plus two distinct ends). */
async function seedEditorialDocument(request: APIRequestContext, projectId: string, name: string) {
  const relPaths = [await ingestKeyImage(request, 'anim-edit-a.png'), await ingestKeyImage(request, 'anim-edit-b.png'), await ingestKeyImage(request, 'anim-edit-c.png')]
  const created = await (await request.post('/api/lan/animation/documents', {
    data: { projectId, name, binding: { characterDescription: 'a lanky courier in a long coat', referenceAssetIds: [uuid()], medium: 'clean line on white', initialKeyAssetId: relPaths[0]! } },
  })).json() as { document: { id: string; revision: number } }
  const documentId = created.document.id
  let revision = created.document.revision
  const keyIds: string[] = []
  for (let index = 0; index < 3; index += 1) {
    const keyId = uuid()
    const candidateId = uuid()
    let landed = await (await request.post('/api/lan/animation/keys', {
      data: {
        op: 'add-candidate', documentId, keyId, expectedRevision: revision,
        candidate: { id: candidateId, assetReference: { assetId: `animref-${uuid().slice(0, 8)}`, relPath: relPaths[index], kind: 'image' }, origin: 'import', provenance: { assetId: `animref-${uuid().slice(0, 8)}` }, poseDescription: `pose ${index}`, facing: 'toward camera' },
      },
    })).json() as { document: { revision: number } }
    revision = landed.document.revision
    landed = await (await request.post('/api/lan/animation/select/key-candidate', { data: { documentId, keyId, candidateId, expectedRevision: revision } })).json() as { document: { revision: number } }
    revision = landed.document.revision
    keyIds.push(keyId)
  }
  return { documentId, revision, keyIds }
}

test('the §9 editorial slice — contribute a window take, hold, reorder, the window chips, remove (editorial)', async ({ page, request }) => {
  test.setTimeout(150_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedEditorialDocument(request, projectId, 'The editorial slice')
    const [startKey, endOne] = seeded.keyIds
    const animationUrl = `/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`
    await page.goto(animationUrl)
    const timeline = page.locator('[data-anim-timeline]')
    await expect(timeline).toBeVisible({ timeout: 15_000 })
    const panel = page.locator('[data-anim-editorial]')
    await expect(panel).toBeVisible()
    await expect(panel.locator('[data-anim-editorial-empty]')).toBeVisible()
    await expect(panel.locator('[data-anim-editorial-no-clips]')).toBeVisible()

    // WINDOW ONE (key #0 → key #1) through the real panel.
    await timeline.locator(`[data-anim-key="${startKey}"]`).click()
    await page.locator('[data-anim-seq-end]').getByRole('radio', { name: 'key #1' }).click()
    await page.locator('[data-anim-seq-actions]').fill(SEQUENCE_BEATS.join('\n'))
    await page.locator('[data-anim-seq-preservation]').fill(SEQUENCE_PRESERVATION)
    await page.locator('[data-anim-seq-submit]').click()
    let windowOneAttempt = ''
    await expect.poll(async () => {
      const view = await readAnimationDocument(request, seeded.documentId)
      const take = view.document.attempts.find((entry) => entry.tool === 'sequence' && entry.targetId === startKey)
      windowOneAttempt = take?.attemptId ?? ''
      return take !== undefined
    }, { timeout: 15_000 }).toBe(true)
    await expect.poll(async () => (await readAttemptView(request, windowOneAttempt)).attempt.execution, { timeout: 30_000 }).toBe('ready')

    // The landed window take is the picker's first clip; contribute its
    // [2, 10) portion with a 6-frame hold — the §11.3 conventions: 8 clip
    // frames + a hold in OUTPUT frames = 14, opening the assembled sequence
    // at frame 0.
    const clipRow = panel.locator(`[data-anim-editorial-clip="${windowOneAttempt}"]`)
    await expect(clipRow).toBeVisible()
    await expect(clipRow.locator('.anim-editorial-clip-source')).toContainText('Sequence window — key #0 → key #1')
    await clipRow.locator('[data-anim-editorial-in]').fill('2')
    await clipRow.locator('[data-anim-editorial-out]').fill('10')
    await clipRow.locator('[data-anim-editorial-hold]').fill('6')
    await clipRow.locator('[data-anim-editorial-add]').click()
    const rows = panel.locator('[data-anim-editorial-row]')
    await expect(rows).toHaveCount(1)
    await expect(panel.locator('[data-anim-editorial-total]')).toHaveText('14 frames — 0.6 s at 24 fps')
    await expect(rows.first().locator('[data-anim-editorial-span]')).toContainText('assembles frames 0–14 (8 clip + 6 hold)')
    await expect(panel.locator('[data-anim-editorial-block]')).toHaveCount(1)
    await expect(panel.locator('[data-anim-editorial-block="0"]')).toHaveAttribute('data-anim-block-frames', '14')
    // Document truth: the SPANLESS lane (a window take owns no span).
    let view = await readAnimationDocument(request, seeded.documentId)
    expect(view.document.body.editorial).toHaveLength(1)
    expect(view.document.body.editorial[0]!.spanId).toBe(null)
    expect([view.document.body.editorial[0]!.inFrame, view.document.body.editorial[0]!.outFrame, view.document.body.editorial[0]!.holdDuration]).toEqual([2, 10, 6])

    // WINDOW TWO (key #0 → key #2): the same start key's OTHER window — the
    // explicit end re-pick, a second independent render.
    await page.locator('[data-anim-seq-end]').getByRole('radio', { name: 'key #2' }).click()
    await page.locator('[data-anim-seq-submit]').click()
    let windowTwoAttempt = ''
    await expect.poll(async () => {
      const current = await readAnimationDocument(request, seeded.documentId)
      const take = current.document.attempts.find((entry) => entry.tool === 'sequence' && entry.attemptId !== windowOneAttempt)
      windowTwoAttempt = take?.attemptId ?? ''
      return take !== undefined
    }, { timeout: 15_000 }).toBe(true)
    await expect.poll(async () => (await readAttemptView(request, windowTwoAttempt)).attempt.execution, { timeout: 30_000 }).toBe('ready')
    const windowTwoFrames = (await readAttemptView(request, windowTwoAttempt)).attempt.candidate!.frameCount

    // Contribute window two WHOLE (the picker's defaults: the full clip, no
    // hold) — two rows now, the total = 14 + windowTwoFrames.
    const secondClipRow = panel.locator(`[data-anim-editorial-clip="${windowTwoAttempt}"]`)
    await expect(secondClipRow).toBeVisible()
    await secondClipRow.locator('[data-anim-editorial-add]').click()
    await expect(rows).toHaveCount(2)
    await expect(panel.locator('[data-anim-editorial-total]')).toHaveText(`${14 + windowTwoFrames} frames — ${((14 + windowTwoFrames) / 24).toFixed(1)} s at 24 fps`)
    view = await readAnimationDocument(request, seeded.documentId)
    expect(view.document.body.editorial.map((entry) => entry.attemptId)).toEqual([windowOneAttempt, windowTwoAttempt])

    // REORDER — the ordered list IS the assembled sequence's order (§9): the
    // first row moves down; the strip and the document flip together.
    await rows.nth(0).locator('[data-anim-editorial-down]').click()
    await expect(rows.nth(0).locator('.anim-editorial-row-source')).toContainText('Sequence window — key #0 → key #2', { timeout: 10_000 })
    await expect(panel.locator('[data-anim-editorial-total]')).toHaveText(`${14 + windowTwoFrames} frames — ${((14 + windowTwoFrames) / 24).toFixed(1)} s at 24 fps`, { timeout: 10_000 })
    await expect.poll(async () => {
      const current = await readAnimationDocument(request, seeded.documentId)
      return current.document.body.editorial.map((entry) => entry.attemptId).join('|')
    }, { timeout: 10_000 }).toBe(`${windowTwoAttempt}|${windowOneAttempt}`)

    // Task 12's Important-1 — the WINDOW CHIPS: the start key's two windows
    // are both reachable from the review. The ACTIVE chip follows the newest
    // take's window (key #2); switching to the older window (key #1) swaps
    // the review subject AND the takes strip to that window's takes.
    const review = page.locator('[data-anim-seq-review]')
    await expect(review).toBeVisible()
    const chips = review.locator('[data-anim-seq-window]')
    await expect(chips).toHaveCount(2)
    await expect(review.locator(`[data-anim-seq-window="${endOne}"]`)).toHaveAttribute('data-anim-seq-window-active', 'false')
    await expect(review).toHaveAttribute('data-anim-review-attempt', windowTwoAttempt)
    await review.locator(`[data-anim-seq-window="${endOne}"]`).click()
    await expect(review).toHaveAttribute('data-anim-review-attempt', windowOneAttempt)
    // The strip mounts only with MULTIPLE takes (§8.2's retained-alternatives
    // affordance) — the older window holds one take, and it IS the subject.
    await expect(review.locator('[data-anim-review-take]')).toHaveCount(0)
    // The re-roll of an OLDER window re-rolls THAT window (the frozen pair),
    // never the start key's newest take of another window.
    await review.locator('[data-anim-review-reroll]').click()
    await expect.poll(async () => {
      const current = await readAnimationDocument(request, seeded.documentId)
      const windowOne = current.document.attempts.filter((entry) => entry.attemptId !== windowTwoAttempt)
      const rerolled = windowOne.find((entry) => entry.attemptId !== windowOneAttempt)
      return rerolled !== undefined && (await readAttemptView(request, rerolled.attemptId)).attempt.execution === 'ready'
    }, { timeout: 30_000 }).toBe(true)
    await expect(review.locator('[data-anim-review-take]')).toHaveCount(2, { timeout: 10_000 })
    view = await readAnimationDocument(request, seeded.documentId)
    expect(view.document.attempts.filter((entry) => entry.tool === 'sequence').length).toBe(3, 'two takes of window one + one take of window two')

    // REMOVE — the list is an authored document, never append-only.
    await rows.nth(0).locator('[data-anim-editorial-remove]').click()
    await expect(rows).toHaveCount(1)
    await expect(panel.locator('[data-anim-editorial-total]')).toHaveText('14 frames — 0.6 s at 24 fps', { timeout: 10_000 })
    await expect.poll(async () => (await readAnimationDocument(request, seeded.documentId)).document.body.editorial.length, { timeout: 10_000 }).toBe(1)
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  expect(engineExited).toBe(true)
})

// Task 15a — THE PREVIEW FORESHADOWS THE GATE: a contribution whose
// degenerate range points past the clip's end shows its problem row in the
// editorial panel BEFORE any export attempt (the user-visible contract the
// shared assembly-edge derivation exists for — the panel names the same
// refusal the export gate would, and the export surface blocks on it).
test('the editorial preview names the gate refusal before any export — a degenerate range pointing past the clip (editorial, task 15a)', async ({ page, request }) => {
  test.setTimeout(120_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedEditorialDocument(request, projectId, 'The foreshadow slice')
    const [startKey, endKey] = seeded.keyIds

    // A landed tween take through the API (the review flows are pinned by
    // their own slices; this slice needs the landed truth only).
    let revision = seeded.revision
    const inserted = await (await request.post('/api/lan/animation/spans', {
      data: { op: 'insert', documentId: seeded.documentId, expectedRevision: revision, fromKeyId: startKey, toKeyId: endKey, intent: { movement: 'she pushes through into a stride', preservation: 'silhouette intact' } },
    })).json() as { spanId: string; document: { revision: number; body: { spans: Array<{ id: string; stepSlots: Array<{ id: string }> }> } } }
    expect(inserted.spanId, 'the span inserts').toBeTruthy()
    revision = inserted.document.revision
    const stepSlotId = inserted.document.body.spans.find((span) => span.id === inserted.spanId)!.stepSlots[0]!.id
    const submitted = await (await request.post('/api/lan/animation/attempts', {
      data: {
        documentId: seeded.documentId, tool: 'tween', targetId: stepSlotId, idempotencyKey: `anim-e2e-foreshadow-${Date.now()}`,
        draft: { tool: 'tween', targetStepSlotId: stepSlotId, movementStep: 'she shifts her weight onto the heel, hips following', overrides: { medium: 'clean line on white' } },
      },
    })).json() as { attemptId: string }
    await expect.poll(async () => (await readAttemptView(request, submitted.attemptId)).attempt.execution, { timeout: 30_000 }).toBe('ready')

    // Contribute a degenerate range pointing PAST the clip's end: the store
    // accepts it (length semantics are the GATE's, task 13's narrowing) —
    // and the PREVIEW must name the problem before any export attempt.
    await page.goto(`/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`)
    const panel = page.locator('[data-anim-editorial]')
    await expect(panel).toBeVisible({ timeout: 15_000 })
    const clipRow = panel.locator(`[data-anim-editorial-clip="${submitted.attemptId}"]`)
    await expect(clipRow).toBeVisible()
    await clipRow.locator('[data-anim-editorial-in]').fill('999')
    await clipRow.locator('[data-anim-editorial-out]').fill('999')
    await clipRow.locator('[data-anim-editorial-hold]').fill('6')
    await clipRow.locator('[data-anim-editorial-add]').click()
    const rows = panel.locator('[data-anim-editorial-row]')
    await expect(rows).toHaveCount(1)

    // The problem row — the gate's own shared text (label + the degenerate
    // class), no export click having happened.
    const rowProblem = rows.first().locator('[data-anim-editorial-row-problem]')
    await expect(rowProblem).toContainText('a degenerate range must name an existing frame')
    await expect(panel.locator('[data-anim-editorial-problem]')).toHaveCount(1)
    // The export surface blocks on the same truth — the gate never gets the
    // chance to surprise the user at click time.
    await expect(page.locator('[data-anim-export-blocked]')).toBeVisible()
    await expect(page.locator('[data-anim-export-submit]')).toBeDisabled()
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  expect(engineExited).toBe(true)
})

test('the inspector follows external intent writes, parks its persist behind busy, and names the inert camera reason (inspector, task 13)', async ({ page, request }) => {
  const problems = await trackErrors(page)
  const projectId = `anim-e2e-${Date.now()}`
  const seeded = await seedInspectorDocument(request, projectId, 'Inspector minors')
  const { inspector, caption } = await openInspectorCaption(page, projectId, seeded)
  const movement = page.locator('[data-anim-inspector-movement]')

  // T9-M4 — the camera reason is INERT without its description: the coupling
  // is named at the field, never a silent drop. Typing the reason alone
  // surfaces the note; adding the description releases it and compiles the
  // paired clause (§6.3).
  await page.locator('[data-anim-inspector-camera-reason]').fill('establishes the alley')
  await expect(page.locator('[data-anim-inspector-camera-reason-inert]')).toBeVisible()
  await expect(caption).not.toContainText('Camera:')
  await page.locator('[data-anim-inspector-camera]').fill('low wide')
  await expect(page.locator('[data-anim-inspector-camera-reason-inert]')).toHaveCount(0, { timeout: 5_000 })
  await expect(caption).toContainText('Camera: low wide — establishes the alley.', { timeout: 5_000 })

  // T9-M3 — an UNEDITED inspector FOLLOWS external writes to the span intent
  // (task 9 re-armed its debounce over them with the stale seeded text).
  const currentOne = await (await request.get(`/api/lan/animation/document?id=${seeded.documentId}`)).json() as { document: { revision: number } }
  const externalOne = await request.post('/api/lan/animation/spans', {
    data: { op: 'update-intent', documentId: seeded.documentId, spanId: seeded.spanId, intent: { movement: 'the coat swings as she turns through the doorway', preservation: 'coat hem and scarf stay consistent' }, expectedRevision: currentOne.document.revision },
  })
  expect(externalOne.ok(), `the external intent write lands (${await externalOne.text()})`).toBe(true)
  await expect(movement).toHaveValue('the coat swings as she turns through the doorway', { timeout: 10_000 })
  await expect(caption).toContainText('MOVEMENT: the coat swings as she turns through the doorway', { timeout: 5_000 })

  // A draft the user HAS typed keeps winning: the external write lands while
  // the local edit is live, and the debounced persist re-asserts the local
  // text (the mount doctrine — the user's edit wins until they leave the span).
  const LOCAL = 'she plants the heel and lets the momentum carry the shoulder line'
  await movement.fill(LOCAL)
  await expect(caption).toContainText(`MOVEMENT: ${LOCAL}`, { timeout: 5_000 })
  const currentTwo = await (await request.get(`/api/lan/animation/document?id=${seeded.documentId}`)).json() as { document: { revision: number } }
  const externalTwo = await request.post('/api/lan/animation/spans', {
    data: { op: 'update-intent', documentId: seeded.documentId, spanId: seeded.spanId, intent: { movement: 'an external overwrite racing the local draft', preservation: 'coat hem and scarf stay consistent' }, expectedRevision: currentTwo.document.revision },
  })
  expect(externalTwo.ok(), `the racing external write lands (${await externalTwo.text()})`).toBe(true)
  await expect(movement).toHaveValue(LOCAL, { timeout: 10_000 })
  await expect(movement).toHaveValue(LOCAL, { timeout: 1_500 })
  await expect.poll(async () => {
    const view = await readAnimationDocument(request, seeded.documentId)
    return view.document.body.spans.find((entry) => entry.id === seeded.spanId)!.intent.movement
  }, { timeout: 10_000 }).toBe(LOCAL)

  // T9-M2 — the debounced persist PARKS behind a busy store instead of
  // dropping: the first update-intent is held at the wire (busy holds), the
  // second settle fires while it is held, and when the hold releases the
  // parked persist lands the newest text (the old code dropped it silently).
  let releaseHeld: (() => void) | undefined
  const gate = new Promise<void>((resolve) => { releaseHeld = resolve })
  let heldOne = false
  await page.route('**/api/lan/animation/spans', async (route) => {
    const body = route.request().postDataJSON() as { op?: string }
    if (body?.op === 'update-intent' && !heldOne) {
      heldOne = true
      await gate
    }
    await route.continue()
  })
  try {
    const FIRST = 'the first settled draft, held at the wire'
    await movement.fill(FIRST)
    // The held request holds busy — every command button is disabled by it.
    await expect(inspector.locator('[data-anim-inspector-submit]')).toBeDisabled({ timeout: 5_000 })
    const PARKED = 'the second draft, settled while the store was busy'
    await movement.fill(PARKED)
    // Inside the race window deliberately: the second settle's persist parks
    // behind the held first command (600ms > the 400ms debounce).
    await page.waitForTimeout(600)
    await expect(movement).toHaveValue(PARKED)
    releaseHeld!()
    // The parked persist lands once the store idles — the durable intent is
    // the NEWEST text, never the silently dropped one.
    await expect.poll(async () => {
      const view = await readAnimationDocument(request, seeded.documentId)
      return view.document.body.spans.find((entry) => entry.id === seeded.spanId)!.intent.movement
    }, { timeout: 10_000 }).toBe(PARKED)
  } finally {
    await page.unroute('**/api/lan/animation/spans')
  }
  expect(problems.filter((entry) => !environmental(entry))).toEqual([])
})

// ---------------------------------------------------------------------------
// Task 14 — the export surface (§9 export in scope + §11.3 the export
// packaging decision): the delivery layer. One review package — a ZIP with
// sequence.mp4 (silent H.264, constant 24 fps, the document's output
// dimensions) + manifest.json (the versioned assembly recipe) — assembled
// from a FROZEN snapshot, with stale-but-usable selections exporting only
// past an explicit acknowledgment. Plus task 13's carried M1: the sequence
// re-roll's per-window in-flight guard, pinned (a named refusal when a take
// of the SAME window is still rendering — never a second render).
// ---------------------------------------------------------------------------

test('the §11.3 export slice — the review package downloads, and stale selections demand the explicit acknowledgment (export)', async ({ page, request }) => {
  test.setTimeout(150_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  const originalSettings = await pointAtEngine(request, engine.port)
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const seeded = await seedEditorialDocument(request, projectId, 'The export slice')
    const [startKey, endKey] = seeded.keyIds

    // The tween lane's take, landed through the API (the review flows are
    // pinned by their own slices; the export slice needs the landed truth).
    let revision = seeded.revision
    const inserted = await (await request.post('/api/lan/animation/spans', {
      data: { op: 'insert', documentId: seeded.documentId, expectedRevision: revision, fromKeyId: startKey, toKeyId: endKey, intent: { movement: 'she pushes through into a stride', preservation: 'silhouette intact' } },
    })).json() as { spanId: string; document: { revision: number; body: { spans: Array<{ id: string; stepSlots: Array<{ id: string }> }> } } }
    expect(inserted.spanId, 'the span inserts').toBeTruthy()
    revision = inserted.document.revision
    const stepSlotId = inserted.document.body.spans.find((span) => span.id === inserted.spanId)!.stepSlots[0]!.id
    const submitted = await (await request.post('/api/lan/animation/attempts', {
      data: {
        documentId: seeded.documentId, tool: 'tween', targetId: stepSlotId, idempotencyKey: `anim-e2e-export-${Date.now()}`,
        draft: { tool: 'tween', targetStepSlotId: stepSlotId, movementStep: 'she shifts her weight onto the heel, hips following', overrides: { medium: 'clean line on white' } },
      },
    })).json() as { attemptId: string }
    await expect.poll(async () => (await readAttemptView(request, submitted.attemptId)).attempt.execution, { timeout: 30_000 }).toBe('ready')

    // The panel contributes the landed take, then exports.
    await page.goto(`/?images=1&view=animation&project=${projectId}&document=${seeded.documentId}`)
    const panel = page.locator('[data-anim-editorial]')
    await expect(panel).toBeVisible({ timeout: 15_000 })
    const clipRow = panel.locator(`[data-anim-editorial-clip="${submitted.attemptId}"]`)
    await expect(clipRow).toBeVisible()
    await clipRow.locator('[data-anim-editorial-in]').fill('2')
    await clipRow.locator('[data-anim-editorial-out]').fill('10')
    await clipRow.locator('[data-anim-editorial-hold]').fill('6')
    await clipRow.locator('[data-anim-editorial-add]').click()
    await expect(panel.locator('[data-anim-editorial-total]')).toHaveText('14 frames — 0.6 s at 24 fps')

    const exportPanel = page.locator('[data-anim-export]')
    await expect(exportPanel).toBeVisible()
    await expect(exportPanel.locator('[data-anim-export-summary]')).toHaveText('14 frames — 0.6 s at 24 fps')
    await expect(exportPanel.locator('[data-anim-export-blocked]')).toHaveCount(0)

    // The download: one ZIP whose name carries the document, revision, and
    // frame total (the content truth is the unit suite's — this pins the
    // DELIVERY, the surface's whole job).
    const [firstDownload] = await Promise.all([
      page.waitForEvent('download'),
      exportPanel.locator('[data-anim-export-submit]').click(),
    ])
    expect(firstDownload.suggestedFilename()).toMatch(/^The_export_slice-rev\d+-14f\.zip$/)
    const firstPath = await firstDownload.path()
    const archive = firstPath ? fs.readFileSync(firstPath) : Buffer.alloc(0)
    expect(archive.length).toBeGreaterThan(10_000, 'the downloaded ZIP is a real package')
    expect(archive.subarray(0, 2).toString('latin1')).toBe('PK', 'the payload is a ZIP')
    await expect(exportPanel.locator('[data-anim-export-done]')).toBeVisible()
    await expect(exportPanel.locator('[data-anim-export-error]')).toHaveCount(0)
    await expect(exportPanel.locator('[data-anim-export-stale]')).toHaveCount(0)

    // STALE-BUT-USABLE (§11.3): the span's intent changes after the landing —
    // the export now answers the acknowledgment prompt naming the selection,
    // never a silent package and never a refused download without a reason.
    const current = await readAnimationDocument(request, seeded.documentId)
    const staled = await request.post('/api/lan/animation/spans', {
      data: { op: 'update-intent', documentId: seeded.documentId, spanId: inserted.spanId, intent: { movement: 'she turns to leave', preservation: 'silhouette intact' }, expectedRevision: current.document.revision },
    })
    expect(staled.ok(), `the intent change marks the span stale (${await staled.text()})`).toBe(true)

    // A bounded NEGATIVE observation window (testing.md's sanctioned class):
    // no download may fire for an unacknowledged stale sequence. The wait's
    // timeout resolving EMPTY is the assertion.
    const noDownload = page.waitForEvent('download', { timeout: 6_000 })
    await exportPanel.locator('[data-anim-export-submit]').click()
    expect(await noDownload.then(() => true, () => false)).toBe(false)
    await expect(exportPanel.locator('[data-anim-export-stale]')).toBeVisible({ timeout: 10_000 })
    await expect(exportPanel.locator('[data-anim-export-stale]')).toContainText('stale: intent')
    await expect(exportPanel.locator('[data-anim-export-error]')).toContainText('stale-but-usable')
    // The acknowledged export: the checkbox, the second button, the package.
    await exportPanel.locator('[data-anim-export-ack-check]').check()
    const [secondDownload] = await Promise.all([
      page.waitForEvent('download'),
      exportPanel.locator('[data-anim-export-submit-ack]').click(),
    ])
    expect(secondDownload.suggestedFilename()).toMatch(/-14f\.zip$/)
    await expect(exportPanel.locator('[data-anim-export-done]')).toBeVisible({ timeout: 10_000 })
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  expect(engineExited).toBe(true)
})

test('the sequence re-roll refuses while the same window renders — the per-window guard (sequence, task 12 M1)', async ({ page, request }) => {
  test.setTimeout(120_000)
  const problems = await trackErrors(page)
  const engine = await startFakeEngine()
  const originalSettings = await pointAtEngine(request, engine.port)
  // A DEAD engine port (reserved then released — nothing listens): a take
  // dispatched at it fails to connect, the outcome is UNCERTAIN, and the
  // attempt settles 'reconciling' — in flight forever, the honest racing
  // shape whose own submission still answers promptly.
  const deadHolder = http.createServer(() => undefined)
  const deadPort = await new Promise<number>((resolve) => deadHolder.listen(0, '127.0.0.1', () => resolve((deadHolder.address() as AddressInfo).port)))
  await new Promise<void>((resolve) => deadHolder.close(() => resolve()))
  let engineExited = false
  try {
    const projectId = `anim-e2e-${Date.now()}`
    const document = await createDocument(request, projectId, 'The re-roll guard')
    const revisionOf = async () => ((await readAnimationDocument(request, document.id)).document.revision)
    const keyOne = await makeSelectedKey(request, document.id, await revisionOf())
    const keyTwo = await makeSelectedKey(request, document.id, await revisionOf())

    // TAKE ONE lands through the fake engine (its frozen window is the
    // re-roll's durable input).
    const first = await (await request.post('/api/lan/animation/attempts', {
      data: {
        documentId: document.id, tool: 'sequence', targetId: keyOne, idempotencyKey: `anim-e2e-m1-first-${Date.now()}`,
        draft: { tool: 'sequence', windowStartKeyId: keyOne, windowEndKeyId: keyTwo, orderedActions: SEQUENCE_BEATS, preservation: SEQUENCE_PRESERVATION, overrides: { medium: 'clean line on white' } },
      },
    })).json() as { attemptId: string }
    await expect.poll(async () => (await readAttemptView(request, first.attemptId)).attempt.execution, { timeout: 30_000 }).toBe('ready')

    // The server's engine now points at the STUB: take two — the same frozen
    // window, a fresh idempotency key — dispatches and never resolves, so the
    // window holds one landed take and one IN FLIGHT.
    await request.post('/api/lan/settings', { data: { settings: { ...originalSettings, comfyUrl: `http://127.0.0.1:${deadPort}` } } })
    const second = await (await request.post('/api/lan/animation/attempts', {
      data: {
        documentId: document.id, tool: 'sequence', targetId: keyOne, idempotencyKey: `anim-e2e-m1-second-${Date.now()}`,
        draft: { tool: 'sequence', windowStartKeyId: keyOne, windowEndKeyId: keyTwo, orderedActions: SEQUENCE_BEATS, preservation: SEQUENCE_PRESERVATION, overrides: { medium: 'clean line on white' } },
      },
    })).json() as { attemptId: string }
    await expect.poll(async () => (await readAttemptView(request, second.attemptId)).attempt.execution, { timeout: 15_000 }).toMatch(/reconciling|queued/)

    // The review: the window's takes strip shows both; the reviewer picks the
    // LANDED take (the newest is the in-flight one, whose button is disabled)
    // and re-rolls it — the command guard keys off the FROZEN window pair,
    // finds the in-flight take, and refuses BY NAME. No third render exists.
    await page.goto(`/?images=1&view=animation&project=${projectId}&document=${document.id}`)
    const timeline = page.locator('[data-anim-timeline]')
    await expect(timeline).toBeVisible({ timeout: 15_000 })
    await timeline.locator(`[data-anim-key="${keyOne}"]`).click()
    const review = page.locator('[data-anim-seq-review]')
    await expect(review).toBeVisible({ timeout: 10_000 })
    const takes = review.locator('[data-anim-review-take]')
    await expect(takes).toHaveCount(2, { timeout: 10_000 })
    await review.locator(`[data-anim-review-take="${first.attemptId}"]`).click()
    await expect(review).toHaveAttribute('data-anim-review-attempt', first.attemptId)
    await review.locator('[data-anim-review-reroll]').click()
    await expect(page.locator('[data-anim-command-error]')).toContainText('already in flight', { timeout: 10_000 })
    // And the refusal was the WHOLE effect: still exactly two takes.
    await expect.poll(async () => {
      const view = await readAnimationDocument(request, document.id)
      return view.document.attempts.filter((entry) => entry.tool === 'sequence').length
    }, { timeout: 10_000 }).toBe(2)
    expect(problems.filter((entry) => !environmental(entry))).toEqual([])
  } finally {
    await request.post('/api/lan/settings', { data: { settings: originalSettings } }).catch(() => undefined)
    engineExited = await engine.kill()
  }
  expect(engineExited).toBe(true)
})
