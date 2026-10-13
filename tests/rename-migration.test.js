// The MONOKA rename-sweep Task 1 suite (Flux campaign xmmaynx): the
// persisted-identifier migration wave — migration rows 008+ (provider /
// family-id / media-scheme / input-subfolder renames, the schema-audit DDL
// the controller triaged: A1-A8, C1-C6, D2, the A5 rowid re-key).
//
// Every fixture here is a SEEDED PRE-RENAME home: a studio.db migrated to
// ledger row 007, filled with rows whose JSON blobs carry rename targets AND
// carve-out values SIDE BY SIDE (the surgical rule — one graph holds
// modelFamilyId:'minimax' next to CLIPLoader type:'minimax' and
// minimax_h3_video_vae_fp16.safetensors). openStudioDatabase then applies
// the rename wave, and the assertions pin BOTH halves:
//   (a) targets migrate forward (provider column, modelOverrides key,
//       family/modelFamilyId field values, minimax-media:// prefixes, the
//       minimax-desktop/-mobile input-subfolder segments — plain and
//       comfy-input: and URL-encoded forms alike);
//   (b) lineage values emerge BYTE-IDENTICAL (engine enum, h3/music3
//       filenames, pack keys, display labels, retired providers).
// Plus the shape contract: C1-C6 CHECKs enforce at the statement level, the
// A4 WHEN-guarded jobs FTS trigger skips no-op updates, the A1/A2/A3/A6/A7/
// A8 indices actually serve their queries (EXPLAIN QUERY PLAN), D2's dead
// index is gone, and the A5 dataset-FTS re-key + explicit-rowid writes hold.
//
// No server boot, no ports (the animation-store suite's direct dist-server
// discipline): run after `pnpm build:server`. Scratch homes ride the Wave 4
// ledger (tests/lib/scratch.cjs).
import { test, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const REPO = require('node:path').resolve(__dirname, '..')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { makeScratchDir, removeAllScratchDirs } = require('./lib/scratch.cjs')
afterAll(() => { void removeAllScratchDirs() })

const { migrations, openStudioDatabase } = require(path.join(REPO, 'dist-server/server/db.js'))
const { createDatasetManager } = require(path.join(REPO, 'dist-server/server/datasets/index.js'))

function makeHome(label) {
  return makeScratchDir(path.join(os.tmpdir(), `minimax-rename-${label}-`))
}

let assertions = 0
const check = (condition, message) => {
  assert.ok(condition, message)
  assertions += 1
}

// The rename wave's own ledger rows, pinned by name (stable across future
// appends; the wave is one contiguous, ordered unit).
const WAVE_ROWS = [
  '008-monoka-jobs-rename',
  '009-monoka-identifiers',
  '010-canvas-shape-checks',
  '011-query-indices',
  '012-dataset-fts-rowids',
]
const PRE_RENAME_LEDGER = 7

// ---- the pre-rename fixture -------------------------------------------------
//
// One job whose params_json carries the rename targets and the carve-outs in
// the SAME blob (the surgical-rule fixture the plan demands), one retired-
// provider job (ltx25 — grandfathered data, types.ts documents the history),
// one music3 job (current vocabulary, untouched), the canvas/animation/
// workspace/settings surfaces, and a dataset layer + caption + FTS row on
// its pre-A5 auto rowid.
const CARVEOUT_VAE = 'minimax_h3_video_vae_fp16.safetensors'
const CARVEOUT_TE = 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'
const CARVEOUT_DAV = 'minimax_music3_dav.safetensors'
const UPSTREAM_VIEW = 'http://127.0.0.1:8188/view?filename=frame.png&subfolder=minimax-desktop&type=input'

function preRenameParamsJson() {
  return JSON.stringify({
    id: 'j-ren',
    mode: 'text',
    status: 'completed',
    prompt: 'a lantern-lit courtyard',
    createdAt: 1000,
    updatedAt: 1000,
    progress: 100,
    width: 1344,
    height: 768,
    duration: 5,
    provider: 'minimax',
    outputUrl: `minimax-media://comfy?url=${encodeURIComponent(UPSTREAM_VIEW)}`,
    manifest: {
      manifestVersion: 1,
      graphFamily: 'studio-2026-09',
      provider: 'minimax',
      models: { videoVae: { name: CARVEOUT_VAE, bytes: 1 } },
      engine: { comfyUrl: 'http://127.0.0.1:8188', app: 'MiniMax Studio' },
    },
    // A legacy client record could carry a submit graph through this field
    // (params_json rides everything but the stripped-in-server retry graph);
    // it holds the rename targets and the carve-outs side by side.
    graph: {
      modelFamilyId: 'minimax',
      family: 'minimax-video',
      // The pack-key + lookalike carve-outs ride BESIDE the rename targets:
      // 'minimax-h3-turbo' (upstream pack key) and a user-owned path that
      // merely RESEMBLES the app subfolder must emerge byte-identical.
      packKey: 'minimax-h3-turbo',
      externalPath: '/home/user/Videos/minimax-desktop-backup/clip.mp4',
      inputs: [
        { class_type: 'CLIPLoader', inputs: { clip_name: CARVEOUT_TE, type: 'minimax', device: 'default' } },
        { class_type: 'VAELoader', inputs: { vae_name: CARVEOUT_VAE } },
        { class_type: 'LoadImage', inputs: { image: 'input/minimax-desktop/frame.png' } },
      ],
    },
    upload: { name: 'frame.png', subfolder: 'minimax-desktop', type: 'input' },
  })
}

function seedPreRenameHome(home) {
  const dbFile = path.join(home, 'studio.db')
  const db = new Database(dbFile)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrateToPreRename(db)

  db.prepare(`INSERT INTO jobs (id, provider, media_type, mode, status, prompt, params_json, created_at, updated_at, width, height, duration, output_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('j-ren', 'minimax', 'video', 'text', 'completed', 'a lantern-lit courtyard', preRenameParamsJson(), 1000, 1000, 1344, 768, 5, `minimax-media://comfy?url=${encodeURIComponent(UPSTREAM_VIEW)}`)
  db.prepare(`INSERT INTO jobs (id, provider, media_type, mode, status, prompt, params_json, created_at, updated_at, width, height, duration)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('j-retired', 'ltx25', 'video', 'text', 'failed', 'an old ltx render', '{"id":"j-retired"}', 900, 900, 64, 64, 5)
  db.prepare(`INSERT INTO jobs (id, provider, media_type, mode, status, prompt, params_json, created_at, updated_at, width, height, duration)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('j-music', 'music3', 'audio', 'text', 'completed', 'a song', JSON.stringify({ id: 'j-music', provider: 'music3', manifest: { provider: 'music3', models: { audioVae: { name: CARVEOUT_DAV } } } }), 800, 800, 64, 64, 5)

  db.prepare(`INSERT INTO workspace_state (name, data_json, updated_at) VALUES (?, ?, ?)`).run('create', JSON.stringify({
    mode: 'reference',
    prompt: 'legacy workspace',
    firstFrame: { path: 'comfy-input:minimax-desktop/frame.png', name: 'frame.png', kind: 'image', preview: 'minimax-media://selected?path=%2Ftmp%2Fframe.png' },
    referenceImages: [{ path: 'comfy-input:minimax-mobile-references/clip.mp4', name: 'clip.mp4', kind: 'video' }],
  }), 50)

  db.prepare(`INSERT INTO projects (id, name, kind, data_json, updated_at) VALUES (?, ?, ?, ?, ?)`).run('mp-1', 'Legacy cut', 'movie', JSON.stringify({
    id: 'mp-1', title: 'Legacy cut', scenes: [{ shots: [{ outputUrl: 'minimax-media://local?path=%2Fout%2Fa.mp4', provider: 'minimax' }] }],
  }), 70)

  db.prepare(`INSERT INTO canvas_project (id, name, schema_version, camera_json, settings_defaults_json, app_version, created_at, last_active_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('p1', 'Rename sweep', 1, '{}', JSON.stringify({ modelOverrides: { minimax: { videoVae: CARVEOUT_VAE } } }), 'test', 1, 1)
  db.prepare(`INSERT INTO canvas_chain (id, project_id, kind, input_spec_json, settings_json, lock_state, hop_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('c1', 'p1', 'generation', JSON.stringify({ fresh: { prompt: 'courtyard', mediaKind: 'video' } }), JSON.stringify({ mediaType: 'video', modelOverrides: { minimax: { fl2va: 'fl2va_turbo_8step_v1.safetensors' } }, family: 'minimax-video' }), 'unlocked', 0, 1)
  db.prepare(`INSERT INTO canvas_output (id, chain_id, substrates_available_json, created_at) VALUES (?, ?, ?, ?)`).run('o1', 'c1', '["video"]', 1)
  db.prepare(`INSERT INTO canvas_take (id, output_id, job_id, artifacts_json, created_at) VALUES (?, ?, ?, ?, ?)`).run('t1', 'o1', 'j-ren', '["ab/frame.png"]', 10)
  db.prepare(`INSERT INTO canvas_op_stack (id, chain_id, created_at) VALUES (?, ?, ?)`).run('s1', 'c1', 1)
  db.prepare(`INSERT INTO canvas_op (id, stack_id, ordinal, kind, settings_json, baked_at) VALUES (?, ?, ?, ?, ?, ?)`).run('op1', 's1', 0, 'grade', '{}', 123)
  db.prepare(`INSERT INTO canvas_control_track (id, chain_id, kind, source, input_ref, mask_ref, params_json) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('ct1', 'c1', 'inpaint', 'upload', 'comfy-input:minimax-desktop/ref.png', null, null)
  db.prepare(`INSERT INTO canvas_asset (id, kind, fields_json, canonical_reference_set_json, created_at) VALUES (?, ?, ?, ?, ?)`).run('a1', 'character', JSON.stringify({ name: 'Ada', reference: { path: 'minimax-media://local?path=%2Ftmp%2Fada.png' } }), '[]', 1)
  // (review F1) A fork row MUST ride the fixture: migration 010 rebuilds
  // canvas_asset while this child's FK points at the old name — with
  // foreign_keys=ON the wrong drop order is an instant boot-blocker that a
  // fork-less fixture can never see.
  db.prepare(`INSERT INTO canvas_asset_fork (project_id, asset_id, forked_settings_snapshot_json, lineage_json, consent_at) VALUES (?, ?, ?, ?, ?)`).run('p1', 'a1', JSON.stringify({ modelOverrides: { minimax: { fl2va: 'fl2va_turbo_8step_v1.safetensors' } } }), null, 1)
  db.prepare(`INSERT INTO canvas_blob (path, kind, content_hash, size, missing) VALUES (?, ?, ?, ?, ?)`).run('ab/frame.png', 'image', 'hash-1', 10, 0)

  db.prepare(`INSERT INTO animation_document (id, project_id, name, schema_version, authored_revision, body_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('d1', 'p1', 'Shot one', 1, 0, JSON.stringify({
    spans: [{ graph: {
      modelFamilyId: 'minimax',
      family: 'minimax-video',
      '2': { class_type: 'CLIPLoader', inputs: { clip_name: CARVEOUT_TE, type: 'minimax', device: 'default' } },
      '4': { class_type: 'VAELoader', inputs: { vae_name: CARVEOUT_VAE } },
    } }],
  }), 1, 1)
  db.prepare(`INSERT INTO animation_attempt (id, document_id, tool, target_id, idempotency_key, input_hash, snapshot_json, execution_json, preparation_json, own_revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('at1', 'd1', 'hero', 'span-1', 'idem-1', 'hash', JSON.stringify({
    graph: { modelFamilyId: 'minimax', '2': { class_type: 'CLIPLoader', inputs: { clip_name: CARVEOUT_TE, type: 'minimax' } } },
    reference: { path: 'comfy-input:minimax-mobile/clip.mp4' },
  }), '{}', '{}', 0, 1, 1)

  // Dataset layers + caption + a pre-A5 FTS row (auto rowid — the re-key's
  // before-shape). The dummy FIRST layer forces lay-1's table rowid away from
  // the FTS auto rowid, so "re-keyed to the layer rowid" is distinct before
  // and after (no vacuous pass when they happen to coincide).
  db.prepare(`INSERT INTO dataset_sources (id, ingest_path, abs_path, content_hash, size_bytes, mtime_ms, kind, origin_note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('src-1', 'reference', '/home/user/clips/a.mp4', 'chash-1', 1000, 1, 'video', 'legacy clip', 1, 1)
  db.prepare(`INSERT INTO dataset_layers (id, source_id, name, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run('lay-0', 'src-1', 'rowid spacer', 'manual', 1, 1)
  db.prepare(`INSERT INTO dataset_layers (id, source_id, name, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run('lay-1', 'src-1', 'legacy layer', 'manual', 1, 1)
  db.prepare(`INSERT INTO dataset_captions (layer_id, text, author, updated_at) VALUES (?, ?, ?, ?)`).run('lay-1', 'legacy caption text', 'hand', 1)
  db.prepare(`INSERT INTO dataset_fts (text, source_id, layer_id, kind) VALUES (?, ?, ?, ?)`).run('legacy caption text', 'src-1', 'lay-1', 'layer')

  // settings.json beside the db — saveSettings' exact serialization shape.
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({
    comfyUrl: 'http://127.0.0.1:8188',
    modelOverrides: {
      minimax: { videoVae: CARVEOUT_VAE, fl2va: 'fl2va_turbo_8step_v1.safetensors' },
      music3: { audioVae: CARVEOUT_DAV },
    },
  }, null, 2))

  db.close()
  return dbFile
}

function migrateToPreRename(db) {
  const pre = migrations.slice(0, PRE_RENAME_LEDGER)
  assert.equal(pre[PRE_RENAME_LEDGER - 1].name, '007-animation-continuation', 'the fixture seeds against the real pre-rename ledger head')
  const applied = (() => {
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)')
    for (const migration of pre) {
      db.transaction(() => {
        migration.up(db)
        db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(migration.id, migration.name, 0)
      })()
    }
    return pre.length
  })()
  assert.equal(applied, PRE_RENAME_LEDGER)
}

const explain = (db, sql, ...args) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args).map((row) => row.detail).join(' | ')

// ---- the wave ----------------------------------------------------------------

let home = ''
let dbFile = ''
let db = null

beforeAll(() => {
  home = makeHome('home')
  dbFile = seedPreRenameHome(home)
  db = openStudioDatabase(dbFile)
})

test('(1) the surgical rule: targets rewrite, lineage survives byte-identically', () => {
  const job = db.prepare("SELECT * FROM jobs WHERE id = 'j-ren'").get()
  const params = JSON.parse(job.params_json)
  const graph = params.graph

  // (rename-sweep T1) The surgical rule: targets rewrite, lineage survives byte-identical.
  check(job.provider === 'monoka', 'provider value migrated')
  check(params.provider === 'monoka', 'params_json provider field migrated')
  check(params.manifest.provider === 'monoka', 'manifest provider migrated')
  check(graph.modelFamilyId === 'monoka', 'family id migrated in stored graph')
  check(graph.family === 'monoka-video', 'family value migrated in stored graph')
  check(graph.inputs.some((node) => node.class_type === 'CLIPLoader' && node.inputs.type === 'minimax'), 'ENGINE enum value untouched (carve-out)')
  check(graph.packKey === 'minimax-h3-turbo', 'the upstream pack key is byte-identical (carve-out)')
  check(graph.externalPath === '/home/user/Videos/minimax-desktop-backup/clip.mp4', 'a user-owned lookalike path is byte-identical (delimiter-bounded rewrite only)')
  check(JSON.stringify(graph).includes(CARVEOUT_VAE), 'model filename untouched (carve-out)')
  check(JSON.stringify(params).includes(CARVEOUT_TE), 'text-encoder filename untouched (carve-out)')
  check(String(job.output_url).startsWith('monoka-media://comfy?url='), 'media scheme migrated in persisted artifacts (output_url)')
  check(params.outputUrl.startsWith('monoka-media://comfy?'), 'media scheme migrated in persisted artifacts (params_json)')
  // Whole-row probes use the SAME bounded-segment shape the migration
  // matches — a raw !includes('minimax-desktop') would false-positive on the
  // deliberate user-lookalike carve-out seeded above.
  const rowJson = JSON.stringify({ ...job, params_json: JSON.stringify(params) })
  const subfolderResidue = /(^|[:/?=&]|%3D|%26)minimax-(desktop|mobile-references|mobile)(?=$|[/&]|%26|%2F)/
  check(!subfolderResidue.test(rowJson), 'no app-subfolder segment survives anywhere in the row (decoded + encoded); the user lookalike stays')
  check(!rowJson.includes('minimax-media://'), 'no legacy media scheme survives anywhere in the row')
  // The rewritten comfy URL still resolves the same file at the renamed folder.
  const inner = new URL(decodeURIComponent(new URLSearchParams(String(job.output_url).slice('monoka-media://comfy?'.length)).get('url')))
  check(inner.searchParams.get('subfolder') === 'monoka-desktop' && inner.searchParams.get('filename') === 'frame.png', 'the encoded upstream subfolder migrated, filename intact')
  check(params.upload.subfolder === 'monoka-desktop', 'the upload descriptor subfolder migrated')
  check(params.graph.inputs.find((node) => node.class_type === 'LoadImage').inputs.image === 'input/monoka-desktop/frame.png', 'input/ subfolder path migrated')

  // Retired + sibling providers are DATA, not rename targets.
  check(db.prepare("SELECT provider FROM jobs WHERE id = 'j-retired'").get().provider === 'ltx25', 'a retired provider row is grandfathered untouched')
  const musicJob = db.prepare("SELECT * FROM jobs WHERE id = 'j-music'").get()
  check(musicJob.provider === 'music3' && JSON.parse(musicJob.params_json).manifest.models.audioVae.name === CARVEOUT_DAV, 'music3 provider + carve-out filename untouched')

  // The client record's manifest lineage: filenames byte-identical.
  check(params.manifest.models.videoVae.name === CARVEOUT_VAE, 'manifest model filename byte-identical')
  check(params.manifest.engine.app === 'MiniMax Studio', 'display label untouched (carve-out)')
})

test('(2) workspace / projects / canvas / animation surfaces migrate', () => {
  const workspace = JSON.parse(db.prepare("SELECT data_json FROM workspace_state WHERE name = 'create'").get().data_json)
  check(workspace.firstFrame.path === 'comfy-input:monoka-desktop/frame.png', 'workspace comfy-input subfolder migrated')
  check(workspace.firstFrame.preview.startsWith('monoka-media://selected?'), 'workspace preview scheme migrated')
  check(workspace.referenceImages[0].path === 'comfy-input:monoka-mobile-references/clip.mp4', 'the mobile-references subfolder migrated')

  const project = JSON.parse(db.prepare("SELECT data_json FROM projects WHERE id = 'mp-1'").get().data_json)
  check(project.scenes[0].shots[0].outputUrl.startsWith('monoka-media://local?'), 'project media URL migrated')
  check(project.scenes[0].shots[0].provider === 'monoka', 'project provider field migrated')

  const defaults = JSON.parse(db.prepare("SELECT settings_defaults_json FROM canvas_project WHERE id = 'p1'").get().settings_defaults_json)
  check(defaults.modelOverrides.monoka && !defaults.modelOverrides.minimax, 'canvas settings_defaults family key migrated')
  check(defaults.modelOverrides.monoka.videoVae === CARVEOUT_VAE, 'canvas settings_defaults pick byte-identical (carve-out)')

  const chain = JSON.parse(db.prepare("SELECT settings_json FROM canvas_chain WHERE id = 'c1'").get().settings_json)
  check(chain.modelOverrides.monoka?.fl2va === 'fl2va_turbo_8step_v1.safetensors' && !chain.modelOverrides.minimax, 'chain settings family key migrated, pick intact')
  check(chain.family === 'monoka-video', 'chain settings family value migrated')

  check(db.prepare("SELECT input_ref FROM canvas_control_track WHERE id = 'ct1'").get().input_ref === 'comfy-input:monoka-desktop/ref.png', 'control-track input_ref migrated')

  const asset = JSON.parse(db.prepare("SELECT fields_json FROM canvas_asset WHERE id = 'a1'").get().fields_json)
  check(asset.reference.path.startsWith('monoka-media://local?'), 'canvas asset media URL migrated')

  // (review F1) The fork survives the asset rebuild with its FK intact and
  // its snapshot's family key migrated — the children-first drop order's pin.
  const fork = db.prepare('SELECT * FROM canvas_asset_fork').all()
  check(fork.length === 1 && fork[0].asset_id === 'a1' && fork[0].project_id === 'p1', 'the canvas_asset_fork row survives the canvas_asset rebuild (children-first drop order)')
  const forkSnapshot = JSON.parse(fork[0].forked_settings_snapshot_json)
  check(Boolean(forkSnapshot.modelOverrides.monoka) && !forkSnapshot.modelOverrides.minimax, 'the fork snapshot\'s family key migrated')

  const body = JSON.parse(db.prepare("SELECT body_json FROM animation_document WHERE id = 'd1'").get().body_json)
  check(body.spans[0].graph.modelFamilyId === 'monoka', 'animation body family id migrated')
  check(body.spans[0].graph.family === 'monoka-video', 'animation body family value migrated')
  check(body.spans[0].graph['2'].inputs.type === 'minimax' && body.spans[0].graph['2'].inputs.clip_name === CARVEOUT_TE, 'animation graph engine enum + filename untouched (carve-outs)')
  check(body.spans[0].graph['4'].inputs.vae_name === CARVEOUT_VAE, 'animation graph VAE filename untouched (carve-out)')

  const snapshot = JSON.parse(db.prepare("SELECT snapshot_json FROM animation_attempt WHERE id = 'at1'").get().snapshot_json)
  check(snapshot.graph.modelFamilyId === 'monoka' && snapshot.graph['2'].inputs.type === 'minimax', 'attempt snapshot: family id migrated, engine enum untouched')
  check(snapshot.reference.path === 'comfy-input:monoka-mobile/clip.mp4', 'attempt snapshot reference subfolder migrated')
})

test('(3) settings.json: the modelOverrides family key migrates on disk', () => {
  const raw = fs.readFileSync(path.join(home, 'settings.json'), 'utf8')
  const settings = JSON.parse(raw)
  check(Boolean(settings.modelOverrides.monoka) && !settings.modelOverrides.minimax, 'settings family key migrated')
  check(settings.modelOverrides.monoka.videoVae === CARVEOUT_VAE, 'settings video VAE pick byte-identical (carve-out filename)')
  check(settings.modelOverrides.monoka.fl2va === 'fl2va_turbo_8step_v1.safetensors', 'settings lane pick byte-identical')
  check(settings.modelOverrides.music3.audioVae === CARVEOUT_DAV, 'the music3 family key + its carve-out pick untouched')
  check(settings.comfyUrl === 'http://127.0.0.1:8188', 'unrelated settings fields untouched')
  check(raw === JSON.stringify(settings, null, 2), 'the file keeps saveSettings serialization shape')
})

test('(4) C6: the jobs vocabulary CHECKs enforce at the statement level', () => {
  let probeSeq = 0
  const insertJob = (provider, status = 'completed') => db.prepare(`INSERT INTO jobs (id, provider, media_type, mode, status, prompt, params_json, created_at, updated_at, width, height, duration) VALUES (?, ?, 'video', 'text', ?, 'x', '{}', 1, 1, 1, 1, 1)`)
    .run(`probe-${(probeSeq += 1)}`, provider, status)
  assert.throws(() => insertJob('minimax'), /CHECK constraint failed/, 'the OLD provider value is refused by the schema (zero back-compat)')
  assert.throws(() => insertJob('monoka', 'bogus'), /CHECK constraint failed/, 'a status outside the closed set is refused by the schema')
  const okRow = insertJob('monoka')
  check(okRow.changes === 1, "provider 'monoka' + a closed-set status persist")
  insertJob(null)
  check(true, 'NULL provider remains legal (providerless rows)')
  // The provider vocabulary the data can carry: current + the retired
  // families types.ts documents (historical rows render as their raw string).
  for (const provider of ['music3', 'ltx25', 'ltx23', 'zimage', 'acestep']) {
    insertJob(provider)
  }
  check(true, 'the retired-provider vocabulary still persists (grandfathered data truth)')
})

test('(5) C1-C5: the canvas shape CHECKs enforce at the statement level', () => {
  assert.throws(() => db.prepare("UPDATE canvas_chain SET stale = 2 WHERE id = 'c1'").run(), /CHECK constraint failed/, 'C1: canvas_chain.stale is pinned to 0/1')
  assert.throws(() => db.prepare("UPDATE canvas_chain SET lock_state = 'frozen' WHERE id = 'c1'").run(), /CHECK constraint failed/, 'C4: canvas_chain.lock_state is pinned to the unlocked/locked vocabulary')
  assert.throws(() => db.prepare("UPDATE canvas_take SET evicted = 2 WHERE id = 't1'").run(), /CHECK constraint failed/, 'C2: canvas_take.evicted is pinned to 0/1')
  assert.throws(() => db.prepare("UPDATE canvas_blob SET missing = 2 WHERE path = 'ab/frame.png'").run(), /CHECK constraint failed/, 'C3: canvas_blob.missing is pinned to 0/1')
  assert.throws(() => db.prepare("INSERT INTO canvas_asset (id, kind, fields_json, created_at) VALUES ('a-bad', 'video', '{}', 1)").run(), /CHECK constraint failed/, 'C5: canvas_asset.kind is pinned to the route vocabulary')
  // The legal marker paths still work.
  db.prepare("UPDATE canvas_chain SET stale = 1 WHERE id = 'c1'").run()
  db.prepare("UPDATE canvas_chain SET lock_state = 'locked' WHERE id = 'c1'").run()
  db.prepare("UPDATE canvas_take SET evicted = 1, evicted_at = 5 WHERE id = 't1' AND evicted = 0").run()
  check(true, 'the in-vocabulary marker writes still land')
  // Rebuild survivors: the append-only + baked-immutable triggers still enforce.
  assert.throws(() => db.prepare("UPDATE canvas_take SET artifacts_json = '[]' WHERE id = 't1'").run(), /append-only/, 'the canvas_take append-only trigger survived the rebuild')
  assert.throws(() => db.prepare("UPDATE canvas_op SET ordinal = 1 WHERE id = 'op1'").run(), /baked ops are immutable/, 'the canvas_op baked-immutable trigger survived the rebuild')

  // Every hand-recreated trigger body is BYTE-IDENTICAL to its pre-wave
  // self (whitespace-normalized) — a weakened WHEN clause (the
  // NEW-vs-NEW typo class) hides from behavior probes that touch only one
  // clause. The jobs UPDATE trigger is the one DELIBERATE change (A4's WHEN
  // guard) and is asserted by its own test.
  const reference = (() => {
    const home = makeHome('trigger-reference')
    const referenceDb = new Database(seedPreRenameHome(home))
    const bodies = {}
    for (const row of referenceDb.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'").all()) bodies[row.name] = String(row.sql).replace(/\s+/g, ' ').trim()
    referenceDb.close()
    return bodies
  })()
  const normalized = {}
  for (const row of db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'").all()) normalized[row.name] = String(row.sql).replace(/\s+/g, ' ').trim()
  for (const name of ['canvas_take_append_only', 'canvas_op_baked_immutable', 'animation_attempt_append_only', 'canvas_jobs_fts_insert', 'canvas_jobs_fts_delete']) {
    check(normalized[name] === reference[name], `trigger ${name} recreated verbatim`)
  }
  check(/WHEN OLD\.prompt IS NOT NEW\.prompt/.test(normalized.canvas_jobs_fts_update ?? ''), 'the jobs FTS update trigger carries A4\'s four-field WHEN guard')

  // FK integrity across the rebuilt cluster.
  check(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'PRAGMA foreign_key_check is clean after the rebuilds')
})

test('(6) A4: the jobs FTS update trigger skips no-op updates, reindexes real ones', () => {
  const jobFtsCount = () => db.prepare("SELECT COUNT(*) AS n FROM canvas_fts WHERE source_kind = 'job'").get().n
  const jobsCount = () => db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n
  check(jobFtsCount() === jobsCount(), 'every job has exactly one FTS row after the re-seed (no sweep dupes)')
  // A marker row at the TOP of the rowid space: under the UNGUARDED trigger
  // the FIRST no-op rewrite moves j-ren's FTS row to a NEW max rowid; under
  // the WHEN guard the row never moves. (FTS5 reuses a just-freed max rowid,
  // so only the first rewrite is rowid-visible — read `before` with zero
  // prior updates and do exactly one.) Distinct before/after by
  // construction — the one thing a vacuous pass forbids.
  db.prepare("INSERT INTO canvas_fts (rowid, text, source_id, source_kind) VALUES (999999, 'marker', 'a4-marker', 'chain')").run()
  const before = db.prepare("SELECT rowid FROM canvas_fts WHERE source_kind = 'job' AND source_id = 'j-ren'").get().rowid
  db.prepare("UPDATE jobs SET updated_at = ? WHERE id = 'j-ren'").run(Date.now())
  check(db.prepare("SELECT rowid FROM canvas_fts WHERE source_kind = 'job' AND source_id = 'j-ren'").get().rowid === before, 'a no-op poll update does not rewrite the FTS row (A4 WHEN guard)')
  db.prepare("DELETE FROM canvas_fts WHERE source_id = 'a4-marker'").run()
  // A real status change DOES reindex.
  db.prepare("UPDATE jobs SET status = 'failed', error = 'boom' WHERE id = 'j-ren'").run()
  const text = db.prepare("SELECT text FROM canvas_fts WHERE source_kind = 'job' AND source_id = 'j-ren'").get().text
  check(/failed/.test(text) && /boom/.test(text), 'a real status/error change reindexes (terminal transitions preserved)')
  check(jobFtsCount() === jobsCount(), 'the guarded update never duplicates or drops rows')
  // The insert trigger still fires for new rows.
  db.prepare(`INSERT INTO jobs (id, provider, mode, status, prompt, params_json, created_at, updated_at, width, height, duration) VALUES ('j-new', 'monoka', 'text', 'queued', 'fresh needle prompt', '{}', 5, 5, 1, 1, 1)`).run()
  check(jobFtsCount() === jobsCount(), 'the insert trigger still indexes new jobs')
})

test('(7) A1/A2/A3/A6/A7/A8: the indices exist and serve their queries; D2 dropped', () => {
  const indexNames = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => row.name)
  for (const name of ['canvas_take_job', 'animation_document_project', 'jobs_created_at', 'canvas_asset_live', 'dataset_sources_live', 'dataset_layers_live', 'canvas_project_live', 'canvas_control_input', 'canvas_control_mask', 'canvas_op_stack_chain']) {
    check(indexNames.includes(name), `index ${name} exists`)
  }
  check(indexNames.includes('jobs_updated_at'), '(review F3) 001\'s jobs_updated_at is recreated verbatim by the rebuild — a declared surface, not a silent casualty')
  check(!indexNames.includes('dataset_bake_jobs_state'), 'D2: the dead dataset_bake_jobs_state index is gone')

  const jobsPlan = explain(db, 'SELECT * FROM jobs ORDER BY created_at DESC, rowid ASC LIMIT 100')
  check(jobsPlan.includes('jobs_created_at') && !/TEMP B-TREE/.test(jobsPlan), `A3: listJobs walks the index in order — no temp-B-tree sort (plan: ${jobsPlan})`)
  const takePlan = explain(db, "SELECT * FROM canvas_take WHERE job_id = 'j-ren' ORDER BY created_at DESC, rowid DESC LIMIT 1")
  check(takePlan.includes('canvas_take_job'), `A1: takeByJob seeks the index (plan: ${takePlan})`)
  const docPlan = explain(db, "SELECT * FROM animation_document WHERE project_id = 'p1' ORDER BY updated_at DESC, rowid ASC")
  check(docPlan.includes('animation_document_project'), `A2: documentsByProject seeks the index (plan: ${docPlan})`)
  // A6's canvas partials: the planner still prefers the equality flag index
  // (canvas_asset_deleted / canvas_project_deleted) + temp sort when both
  // qualify — pinned honestly here as USABLE (INDEXED BY walks the exact
  // query shape with no sort) rather than planner-chosen; the datasets
  // partials have no competing index and ARE chosen. Recorded in the task
  // report for the controller.
  const assetPlan = explain(db, 'SELECT * FROM canvas_asset INDEXED BY canvas_asset_live WHERE deleted_at IS NULL ORDER BY created_at DESC, rowid ASC')
  check(assetPlan.includes('canvas_asset_live') && !/TEMP B-TREE/.test(assetPlan), `A6: the listAssets partial index serves the exact query order (plan: ${assetPlan})`)
  const projectPlan = explain(db, 'SELECT * FROM canvas_project INDEXED BY canvas_project_live WHERE deleted_at IS NULL ORDER BY last_active_at DESC, rowid ASC')
  check(projectPlan.includes('canvas_project_live') && !/TEMP B-TREE/.test(projectPlan), `A6: the listProjects partial index serves the exact query order (plan: ${projectPlan})`)
  const sourcesPlan = explain(db, 'SELECT * FROM dataset_sources WHERE trashed_at IS NULL ORDER BY created_at DESC, rowid ASC')
  check(sourcesPlan.includes('dataset_sources_live') && !/TEMP B-TREE/.test(sourcesPlan), `A6: listSources sorts through the partial index (plan: ${sourcesPlan})`)
  const layersPlan = explain(db, 'SELECT * FROM dataset_layers WHERE trashed_at IS NULL ORDER BY created_at ASC, rowid ASC')
  check(layersPlan.includes('dataset_layers_live') && !/TEMP B-TREE/.test(layersPlan), `A6: listLayers sorts through the partial index (plan: ${layersPlan})`)
  const trackPlan = explain(db, "SELECT * FROM canvas_control_track WHERE input_ref = 'x' OR mask_ref = 'y'")
  check(trackPlan.includes('canvas_control_input') && trackPlan.includes('canvas_control_mask'), `A7: trackByRef probes both indices (plan: ${trackPlan})`)
  const stackPlan = explain(db, "SELECT * FROM canvas_op_stack WHERE chain_id IN (SELECT id FROM canvas_chain WHERE project_id = 'p1')")
  check(stackPlan.includes('canvas_op_stack_chain'), `A8: the purge subquery seeks the index (plan: ${stackPlan})`)
})

test('(8) A5: dataset FTS rows are re-keyed to the layer rowid; writes go through it', () => {
  const layerRowid = db.prepare("SELECT rowid AS rid FROM dataset_layers WHERE id = 'lay-1'").get().rid
  const ftsRow = db.prepare("SELECT rowid AS rid FROM dataset_fts WHERE layer_id = 'lay-1'").get()
  check(Boolean(ftsRow) && ftsRow.rid === layerRowid, 'the pre-existing FTS row was re-keyed to the captions/layer rowid (PK fetch, no scan)')

  // The store's own write path (explicit-rowid insert) round-trips.
  const managerHome = makeHome('datasets')
  fs.mkdirSync(path.join(managerHome, 'media'), { recursive: true })
  const manager = createDatasetManager({
    db,
    mediaRoot: path.join(managerHome, 'media'),
    trashRoot: path.join(managerHome, 'trash'),
    tools: { ffmpegPath: 'ffmpeg', logFailure: () => undefined },
    logEvent: () => undefined,
    logFailure: () => undefined,
  })
  manager.store.setCaption('lay-1', 'fresh monoka-era caption text', 'hand')
  const after = db.prepare("SELECT rowid AS rid, text FROM dataset_fts WHERE layer_id = 'lay-1'").all()
  check(after.length === 1 && after[0].rid === layerRowid, 'a caption rewrite lands on the SAME explicit rowid (delete+insert collapsed to a PK fetch)')
  check(/fresh monoka-era caption/.test(after[0].text), 'the new caption text is what is indexed')
  const hits = manager.store.searchLayers('monoka-era')
  check(hits.some((hit) => hit.layerId === 'lay-1'), 'FTS search finds the re-indexed caption')
})

test('(9) the ledger: the wave lands as append-only rows, idempotent on re-open', () => {
  const applied = db.prepare('SELECT id, name FROM schema_migrations ORDER BY id').all()
  for (const name of WAVE_ROWS) {
    check(applied.some((row) => row.name === name), `ledger carries ${name}`)
  }
  check(Math.max(...applied.map((row) => row.id)) === migrations[migrations.length - 1].id, 'user_version-equivalent ledger head matches the code list')
  check(Number(db.pragma('user_version', { simple: true })) === migrations[migrations.length - 1].id, 'PRAGMA user_version stamped to the wave head')
  const ids = applied.map((row) => row.id)
  check(JSON.stringify(ids) === JSON.stringify(Array.from({ length: ids.length }, (_, index) => index + 1)), 'the ledger stays contiguous 1..N (append-only discipline)')

  // Re-opening the migrated home is a no-op and the values are stable.
  db.close()
  const reopened = openStudioDatabase(dbFile)
  check(reopened.prepare("SELECT provider FROM jobs WHERE id = 'j-ren'").get().provider === 'monoka', 're-open keeps the migrated provider')
  const settingsAgain = JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'))
  check(Boolean(settingsAgain.modelOverrides.monoka) && !settingsAgain.modelOverrides.minimax, 're-open does not touch the migrated settings.json again')
  db = reopened
})

test('(10) fresh install: an empty home passes the whole wave cleanly', () => {
  const freshHome = makeHome('fresh')
  const fresh = openStudioDatabase(path.join(freshHome, 'studio.db'))
  check(fresh.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n === migrations.length, 'a fresh home applies every migration in one boot')
  check(fresh.prepare('SELECT COUNT(*) AS n FROM jobs').get().n === 0, 'the jobs table is usable (empty)')
  assert.throws(() => fresh.prepare(`INSERT INTO jobs (id, provider, mode, status, prompt, params_json, created_at, updated_at, width, height, duration) VALUES ('x', 'minimax', 'text', 'queued', 'p', '{}', 1, 1, 1, 1, 1)`).run(), /CHECK constraint failed/, 'the fresh schema refuses the old provider value too')
  fresh.close()
})

test('(11) the settings-key seam: no live reader of the old family key survives (review F2)', () => {
  // FirstRunWizard/SettingsDock read settings.modelOverrides?.<family> through
  // a loosely-typed Record, so neither typecheck nor the VM suites can see a
  // stale key — the seam is pinned by scanning the SOURCE. server/db.ts is
  // excluded: the migration's own walker + its comments legitimately name the
  // old key while rewriting it.
  const readers = /modelOverrides\s*(?:\?\.\s*|\.\s*|\[\s*(?:['"]))\s*minimax\b/
  const walk = (dir) => {
    const hits = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue
        hits.push(...walk(full))
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        if (full === path.join(REPO, 'server', 'db.ts')) continue
        const text = fs.readFileSync(full, 'utf8')
        for (const line of text.split('\n')) if (readers.test(line)) hits.push(`${path.relative(REPO, full)}: ${line.trim()}`)
      }
    }
    return hits
  }
  const hits = [...walk(path.join(REPO, 'src')), ...walk(path.join(REPO, 'shared')), ...walk(path.join(REPO, 'server'))]
  check(hits.length === 0, `no live modelOverrides.minimax reader survives (found: ${hits.join(' | ') || 'none'})`)
})

test('(12) summary', () => {
  console.log(`  rename-migration: ${assertions} assertions passed`)
})
