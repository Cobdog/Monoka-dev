/**
 * The studio database (wave 1 storage substrate): a single better-sqlite3
 * file at <MONOKA_HOME>/studio.db.
 *
 * Decision record (2026-09-11): better-sqlite3 over node:sqlite because FTS5
 * is required for prompt search and node:sqlite is still RC without FTS5.
 * The database is the app's own LOCAL USER DATA: prompts are stored raw and
 * searchable (FTS needs them) — log-PII scrubbing applies to LOGS and
 * exported diagnostics, never to the user's own database. Media files stay
 * on the filesystem; this file holds metadata only.
 *
 * Migration discipline (the Wan2GP versioned-migration pattern): migrations
 * are an append-only numbered list; each one records a row in
 * schema_migrations inside the same transaction as its DDL, and PRAGMA
 * user_version is stamped with the latest id. Persisted records survive app
 * upgrades unchanged — a code upgrade only ever APPENDS migrations, and a
 * persisted history that no longer matches a prefix of the list is a hard
 * error rather than a silent re-shape.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { upAnimationContinuation, upAnimationTables } from './animation/store'
import { upCanvasDocuments } from './documents'
import { upDatasetTables } from './datasets/store'
import { appAuthoredDiagnostic, sanitizeErrorMessage } from './logSanitize'

export type Migration = {
  id: number
  name: string
  up(db: Database.Database): void
}

// ---------------------------------------------------------------------------
// (rename-sweep T1, 2026-10-12) The MONOKA identifier wave — shared vocabulary
// + the surgical rewriter. The carve-out list (inventory §11) is LAW: engine
// enums (CLIPLoader type:'minimax'), minimax_h3_*/minimax_music3_* filenames,
// minimax-h3* pack keys, and display labels are NEVER touched. Every rewrite
// below is an exact key/value/prefix match — never a substring sweep over a
// serialized blob.
// ---------------------------------------------------------------------------

/** The closed job-status vocabulary (src/types.ts JobStatus == repo.ts's
 *  terminality superset): the route gate (core.ts isStoredJobShape) and the
 *  schema CHECK (migration 008) share this one home. */
export const JOB_STATUS_VALUES: readonly string[] = ['queued', 'running', 'completed', 'failed', 'cancelled']

/** The provider vocabulary the DATA can carry: the current families plus the
 *  retired ones types.ts documents as possibly persisted ('ltx25'/'ltx23'/
 *  'zimage' — deleted 2026-09-20; 'acestep' — deleted 2026-09-21; they
 *  render as their raw string, never crash — grandfathered data truth, not
 *  back-compat code). The OLD name 'minimax' is deliberately absent: after
 *  migration 008 the schema refuses it (zero back-compat). */
export const JOB_PROVIDER_VALUES: readonly string[] = ['monoka', 'music3', 'ltx25', 'ltx23', 'zimage', 'acestep']

/** The app-owned engine-input subfolders (renamed on disk by rename-T3);
 *  persisted references to them — bare subfolder values, `comfy-input:` refs,
 *  `input/…` paths, and URL-encoded /view query params — ride this wave so
 *  they keep resolving after the folders move. Only these three exact names:
 *  a generic `minimax-*` rule would swallow carve-outs (minimax-h3* pack
 *  keys, the minimax-lora-form-adapter directory). */
const INPUT_SEGMENT = /(^|[:/?=&]|%3D|%26)minimax-(desktop|mobile-references|mobile)(?=$|[/&]|%26|%2F)/g

/** String-level rewrites (applied to whole JSON string VALUES and the scalar
 *  columns that carry media references): the minimax-media:// scheme prefix,
 *  and the input-subfolder segments bounded by path/URL delimiters. */
function renameSweepString(value: string): string {
  let out = value
  if (out.startsWith('minimax-media://')) out = `monoka-media://${out.slice('minimax-media://'.length)}`
  return out.replace(INPUT_SEGMENT, (_match: string, lead: string, folder: string) => `${lead}monoka-${folder}`)
}

/** The JSON walker: rewrites ONLY at the named key/value level —
 *  modelOverrides.minimax → .monoka (the family id's one persisted object-key
 *  home), modelFamilyId/family FIELD values from the exact old ids,
 *  provider FIELD values, and every string value through renameSweepString.
 *  Everything else (engine enums under `type`, filenames, pack keys, labels)
 *  round-trips untouched. */
function renameSweepValue(value: unknown, parentKey: string): unknown {
  if (typeof value === 'string') return renameSweepString(value)
  if (Array.isArray(value)) return value.map((item) => renameSweepValue(item, parentKey))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (parentKey === 'modelOverrides' && key === 'minimax' && nested && typeof nested === 'object' && !Array.isArray(nested)) {
        out.monoka = renameSweepValue(nested, key)
        continue
      }
      if ((key === 'modelFamilyId' || key === 'family') && (nested === 'minimax' || nested === 'minimax-video')) {
        out[key] = nested === 'minimax' ? 'monoka' : 'monoka-video'
        continue
      }
      if (key === 'provider' && nested === 'minimax') {
        out[key] = 'monoka'
        continue
      }
      out[key] = renameSweepValue(nested, key)
    }
    return out
  }
  return value
}

/** Rewrites a persisted JSON blob's TEXT only when a target value actually
 *  changed (the walk is compared against the parsed original first — a blob
 *  whose only 'minimax' occurrences are carve-outs keeps its exact bytes,
 *  and a corrupt blob is never "fixed" by the rename). `indent` mirrors the
 *  caller's serializer when the text is a FILE (settings.json keeps
 *  saveSettings' 2-space shape). */
function renameSweepJsonText(raw: string, indent?: number): string {
  if (!raw || !raw.includes('minimax')) return raw
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw
  }
  const before = JSON.stringify(parsed)
  const walked = renameSweepValue(parsed, '')
  const after = JSON.stringify(walked)
  if (after === before) return raw
  return indent === undefined ? after : JSON.stringify(walked, null, indent)
}

/** JSON-carrying columns the identifier wave walks (jobs is handled by its
 *  own migration 008; user-freeform and external-truth stores — saved prompt
 *  text/source, dataset probes/exports, the FTS tables — are deliberately
 *  NOT walked: no app identifier persists there, and rewriting user text
 *  would corrupt their own words). */
const RENAME_JSON_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ['workspace_state', 'data_json'],
  ['projects', 'data_json'],
  ['canvas_project', 'camera_json'],
  ['canvas_project', 'settings_defaults_json'],
  ['canvas_chain', 'input_spec_json'],
  ['canvas_chain', 'settings_json'],
  ['canvas_chain', 'drift_metrics_json'],
  ['canvas_output', 'substrates_available_json'],
  ['canvas_op', 'settings_json'],
  ['canvas_control_track', 'params_json'],
  ['canvas_asset', 'fields_json'],
  ['canvas_asset', 'canonical_reference_set_json'],
  ['canvas_asset_fork', 'forked_settings_snapshot_json'],
  ['canvas_asset_fork', 'lineage_json'],
  ['canvas_plan', 'document_json'],
  ['animation_document', 'body_json'],
  ['animation_attempt', 'snapshot_json'],
  ['animation_attempt', 'execution_json'],
  ['animation_attempt', 'preparation_json'],
  ['animation_attempt', 'result_json'],
  ['animation_attempt', 'continuation_json'],
]

/** Scalar reference columns (media refs ride these outside JSON blobs).
 *  Blob-store relPaths (canvas_blob.path, canvas_take.artifacts_json/
 *  latent_path) are content-addressed and deliberately excluded — rewriting
 *  them would orphan the bytes they address. */
const RENAME_TEXT_COLUMNS: ReadonlyArray<readonly [table: string, pk: string, column: string]> = [
  ['canvas_control_track', 'id', 'input_ref'],
  ['canvas_control_track', 'id', 'mask_ref'],
]



/**
 * Migration 001 — the foundation schema. The assets column set is the
 * expensive-to-reverse part: fps / frame_count / duration_ms land NOW so the
 * frame↔time mapping never needs a table rebuild.
 */
export const migrations: Migration[] = [
  {
    id: 1,
    name: '001-foundation',
    up(db) {
      db.exec(`
        -- Generation job records. params_json holds the FULL client record
        -- (including the reproducibility manifest); the scalar columns are the
        -- queryable projection. The in-memory retry graph is NEVER persisted.
        CREATE TABLE jobs (
          id TEXT PRIMARY KEY,
          provider TEXT,
          media_type TEXT,
          mode TEXT NOT NULL,
          status TEXT NOT NULL,
          prompt TEXT NOT NULL DEFAULT '',
          params_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          error TEXT,
          width INTEGER,
          height INTEGER,
          duration REAL,
          output_url TEXT
        );
        CREATE INDEX jobs_updated_at ON jobs(updated_at);

        -- Append-only progress/log tail. The realtime fabric writes here once
        -- it lands; for now terminal transitions + failures are recorded.
        CREATE TABLE job_events (
          job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
          seq INTEGER NOT NULL,
          ts INTEGER NOT NULL,
          type TEXT NOT NULL,
          payload_json TEXT,
          PRIMARY KEY (job_id, seq)
        );

        -- Frame-indexed asset metadata (media bytes stay on the filesystem).
        CREATE TABLE assets (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          path TEXT NOT NULL UNIQUE,
          mime TEXT,
          bytes INTEGER,
          width INTEGER,
          height INTEGER,
          duration_ms INTEGER,
          fps REAL,
          frame_count INTEGER,
          sha256 TEXT,
          created_at INTEGER NOT NULL
        );

        -- Projects; kind separates 'movie' (today) from future project types.
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'movie',
          data_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        -- Persisted named workspace snapshots (the Create workspace is
        -- name='create'). Whole-document last-write-wins.
        CREATE TABLE workspace_state (
          name TEXT PRIMARY KEY,
          data_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        -- Saved prompt library backing table; prompts_fts indexes it.
        CREATE TABLE saved_prompts (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL DEFAULT '',
          prompt TEXT NOT NULL,
          negative_prompt TEXT,
          seed INTEGER,
          sampler TEXT,
          steps INTEGER,
          cfg_scale REAL,
          source_json TEXT,
          technique INTEGER NOT NULL DEFAULT 0,
          saved_at INTEGER NOT NULL DEFAULT 0
        );

        -- Contentless FTS5 index over prompt text. Insert/delete is managed
        -- explicitly by the repository layer (contentless_delete=1 allows
        -- DELETE by rowid, required since content='' stores nothing back).
        -- source_id/source_kind are part of the declared shape for future
        -- producers (jobs, community items); a contentless table cannot
        -- return them, so callers join on rowid against the backing table.
        CREATE VIRTUAL TABLE prompts_fts USING fts5(
          prompt,
          tags,
          source_id UNINDEXED,
          source_kind UNINDEXED,
          content='',
          contentless_delete=1
        );
      `)
    },
  },
  {
    // Canvas Phase 0 (docs/specs/canvas-document-model.md §1/§2): the
    // document tables, take append-only + bake-immutability triggers, the
    // canvas FTS surface (+ live job indexing triggers), the legacy-import
    // marker, and the additive jobs extension (gpu_queue_state / plan_ref /
    // failure_json — nullable, never referenced by the old surface). The old
    // stores keep their tables and their behavior untouched.
    id: 2,
    name: '002-canvas-documents',
    up: upCanvasDocuments,
  },
  {
    // Dataset manager v1 (docs/specs/dataset-manager-v1.md §1/§2): sources
    // (by-reference + LAN-upload, identity = content hash), layers, captions
    // with append-only history, the managed aspect spectrum, scene cuts, the
    // tier-2 embedding index, bake jobs, immutable export snapshots, dataset
    // settings, and the dataset FTS surface. Own tables only — nothing
    // existing is touched.
    id: 3,
    name: '003-dataset-manager',
    up: upDatasetTables,
  },
  {
    // One-canonical-take (correctness audit M2′, cleanup wave twmpu4m): the
    // document store enforces "at most one non-superseded take per output"
    // (canvas invariant 2) with a PARTIAL UNIQUE INDEX, closing the crash
    // window the single-process transaction could not (a hard-killed server
    // between statements, a hostile archive, a future second writer).
    // Databases from older builds may carry strays (two non-superseded takes
    // on one output — the pre-fix crash window): the migration HEALS them
    // first with appendTake's own semantics (the newest take of the output
    // wins; the rest become its priors), then creates the index. The heal is
    // marker-only — no rows are deleted (takes are append-only; copy-never-
    // destroy applies to priors as much as canonicals).
    id: 4,
    name: '004-one-canonical-take',
    up(db) {
      const nonSuperseded = db.prepare(
        'SELECT id, output_id FROM canvas_take WHERE superseded_by IS NULL ORDER BY output_id, created_at DESC, rowid DESC',
      ).all() as Array<{ id: string; output_id: string }>
      const winners = new Map<string, string>()
      for (const row of nonSuperseded) if (!winners.has(row.output_id)) winners.set(row.output_id, row.id)
      const heal = db.prepare('UPDATE canvas_take SET superseded_by = ? WHERE id = ? AND superseded_by IS NULL')
      const healed = db.transaction(() => {
        let strays = 0
        for (const row of nonSuperseded) {
          const winner = winners.get(row.output_id)
          if (winner && winner !== row.id) {
            heal.run(winner, row.id)
            strays += 1
          }
        }
        db.exec('CREATE UNIQUE INDEX canvas_take_one_canonical ON canvas_take(output_id) WHERE superseded_by IS NULL')
        return strays
      })()
      if (healed > 0) {
        // Observable, never silent: the heal is the audit trail.
        console.warn(`[db] migration 004: superseded ${healed} stray non-superseded take(s) to restore the one-canonical invariant (newest take wins per output).`)
      }
    },
  },
  {
    // Round 3 R1 (followup audit escalation, l0ebkju) + round-3 fix round
    // C-1: per-chain, PER-KIND revision columns for arrival-order gating.
    // The inspector's transport has a fire-and-forget leg (the unload
    // keepalive) that cannot be sequenced against in-flight writes once
    // requests leave the page — a proxy-held older write can arrive after a
    // newer one. The server compares PER KIND: a revisioned write whose
    // revision does not EXCEED its kind's stored column is a stale-arrival
    // no-op. The kinds MUST NOT share a column (C-1, critical): settings and
    // identity payloads are disjoint, and a shared gate discarded a settings
    // arrival merely because an identity arrival carried a higher stamp.
    // Ungated writers (legacy callers, other surfaces) keep the always-apply
    // behavior untouched.
    id: 5,
    name: '005-chain-revision-gates',
    up(db) {
      db.exec(`
        ALTER TABLE canvas_chain ADD COLUMN settings_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE canvas_chain ADD COLUMN identity_revision INTEGER NOT NULL DEFAULT 0;
      `)
    },
  },
  {
    // Animation-authoring module (spec 2026-10-06-animation-authoring-module-
    // design.md §11.2): versioned animation documents + separate attempt
    // records beside the canvas tables. Own tables only — nothing existing is
    // touched; the DDL + the append-only attempt trigger live with the store
    // (server/animation/store.ts, the canvas_documents precedent).
    id: 6,
    name: '006-animation-documents',
    up: upAnimationTables,
  },
  {
    // Animation extension lane, Task 2 (spec 2026-10-08-animation-extension-
    // lane-design.md §7/§8): the continuation readiness column — the attempt
    // row's second, independent readiness flag (media landing vs carry
    // artifact registration). Additive ALTER only; existing rows hydrate as
    // the pre-lane 'absent' state.
    id: 7,
    name: '007-animation-continuation',
    up: upAnimationContinuation,
  },
  {
    // (rename-sweep T1, 2026-10-12) The jobs half of the MONOKA identifier
    // wave, ONE transaction: the value renames (provider column +
    // params_json + output_url, at the key/prefix level — carve-outs byte-
    // identical) and the C6 shape contract they ride with. The CHECKs need a
    // table rebuild (SQLite has no ADD CONSTRAINT), and the rebuild replaces
    // the jobs FTS triggers — which is also where audit A4's WHEN guard
    // lands (a no-op poll update no longer rewrites canvas_fts) and A3's
    // created_at index (listJobs stops sorting the whole table).
    //
    // FK note: migrations run inside db.transaction with foreign_keys=ON and
    // the pragma is a no-op mid-transaction, so the rebuild renames jobs AND
    // job_events aside first (references retarget to the old names), rebuilds
    // both, copies rowids explicitly (listJobs orders by rowid), and drops
    // the OLD CHILD before the old parent — the drop order that never fires
    // a cascade.
    id: 8,
    name: '008-monoka-jobs-rename',
    up(db) {
      const providers = JOB_PROVIDER_VALUES.map((provider) => `'${provider}'`).join(', ')
      const statuses = JOB_STATUS_VALUES.map((status) => `'${status}'`).join(', ')
      // 1. The value renames FIRST (the old triggers are dropped before the
      //    pass so it does not churn the FTS index row by row; the provider
      //    column's own rewrite legalizes 'minimax' rows for what follows).
      db.exec(`
        DROP TRIGGER canvas_jobs_fts_insert;
        DROP TRIGGER canvas_jobs_fts_delete;
        DROP TRIGGER canvas_jobs_fts_update;
      `)
      const rewriteJob = db.transaction(() => {
        const rows = db.prepare('SELECT id, params_json, output_url FROM jobs').all() as Array<{ id: string; params_json: string; output_url: string | null }>
        const update = db.prepare('UPDATE jobs SET params_json = ?, output_url = ? WHERE id = ?')
        for (const row of rows) {
          const params = renameSweepJsonText(row.params_json)
          const output = row.output_url === null ? null : renameSweepString(row.output_url)
          if (params !== row.params_json || output !== row.output_url) update.run(params, output, row.id)
        }
        db.prepare("UPDATE jobs SET provider = 'monoka' WHERE provider = 'minimax'").run()
      })
      rewriteJob()
      // Loud pre-validation, AFTER the rewrite: a row still outside the
      // vocabulary must refuse the boot with a named row, not a bare CHECK
      // failure at the copy.
      const badProvider = db.prepare(`SELECT id, provider AS value FROM jobs WHERE provider IS NOT NULL AND provider NOT IN (${providers})`).get() as { id: string; value: string } | undefined
      if (badProvider) {
        throw appAuthoredDiagnostic(`Migration 008 cannot apply: job ${sanitizeErrorMessage(badProvider.id)} carries provider '${sanitizeErrorMessage(badProvider.value)}', outside the known vocabulary (${JOB_PROVIDER_VALUES.join(', ')}). Rename the sweep's JOB_PROVIDER_VALUES to cover it deliberately — data is never silently rewritten.`)
      }
      const badStatus = db.prepare(`SELECT id, status AS value FROM jobs WHERE status NOT IN (${statuses})`).get() as { id: string; value: string } | undefined
      if (badStatus) {
        throw appAuthoredDiagnostic(`Migration 008 cannot apply: job ${sanitizeErrorMessage(badStatus.id)} carries status '${sanitizeErrorMessage(badStatus.value)}', outside the closed vocabulary (${JOB_STATUS_VALUES.join(', ')}).`)
      }

      // 2. Sweep + rebuild (one FTS sweep instead of per-row trigger churn).
      db.exec("DELETE FROM canvas_fts WHERE source_kind = 'job'")
      db.exec(`
        ALTER TABLE jobs RENAME TO jobs_monoka_old;
        ALTER TABLE job_events RENAME TO job_events_monoka_old;
      `)
      db.exec(`
        CREATE TABLE jobs (
          id TEXT PRIMARY KEY,
          provider TEXT CHECK (provider IS NULL OR provider IN (${providers})),
          media_type TEXT,
          mode TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN (${statuses})),
          prompt TEXT NOT NULL DEFAULT '',
          params_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          error TEXT,
          width INTEGER,
          height INTEGER,
          duration REAL,
          output_url TEXT,
          gpu_queue_state TEXT,
          plan_ref TEXT,
          failure_json TEXT
        );
        CREATE TABLE job_events (
          job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
          seq INTEGER NOT NULL,
          ts INTEGER NOT NULL,
          type TEXT NOT NULL,
          payload_json TEXT,
          PRIMARY KEY (job_id, seq)
        );
      `)
      const jobColumns = 'id, provider, media_type, mode, status, prompt, params_json, created_at, updated_at, error, width, height, duration, output_url, gpu_queue_state, plan_ref, failure_json'
      db.exec(`INSERT INTO jobs (rowid, ${jobColumns}) SELECT rowid, ${jobColumns} FROM jobs_monoka_old ORDER BY rowid`)
      db.exec('INSERT INTO job_events (rowid, job_id, seq, ts, type, payload_json) SELECT rowid, job_id, seq, ts, type, payload_json FROM job_events_monoka_old ORDER BY rowid')
      db.exec(`
        DROP TABLE job_events_monoka_old;
        DROP TABLE jobs_monoka_old;
      `)

      // 3. The triggers return: insert/delete verbatim from 002, the update
      //    trigger with audit A4's four-field WHEN guard (only prompt/mode/
      //    status/error — the indexed text — force a reindex; the client's
      //    debounced no-op job sync stops rewriting the index).
      db.exec(`
        CREATE TRIGGER canvas_jobs_fts_insert AFTER INSERT ON jobs BEGIN
          INSERT INTO canvas_fts (text, source_id, source_kind)
          VALUES (NEW.prompt || ' ' || NEW.mode || ' ' || NEW.status || ' ' || COALESCE(NEW.error, ''), NEW.id, 'job');
        END;
        CREATE TRIGGER canvas_jobs_fts_delete AFTER DELETE ON jobs BEGIN
          DELETE FROM canvas_fts WHERE source_id = OLD.id AND source_kind = 'job';
        END;
        CREATE TRIGGER canvas_jobs_fts_update AFTER UPDATE ON jobs
        WHEN OLD.prompt IS NOT NEW.prompt OR OLD.mode IS NOT NEW.mode
          OR OLD.status IS NOT NEW.status OR OLD.error IS NOT NEW.error
        BEGIN
          DELETE FROM canvas_fts WHERE source_id = OLD.id AND source_kind = 'job';
          INSERT INTO canvas_fts (text, source_id, source_kind)
          VALUES (NEW.prompt || ' ' || NEW.mode || ' ' || NEW.status || ' ' || COALESCE(NEW.error, ''), NEW.id, 'job');
        END;
        CREATE INDEX jobs_created_at ON jobs(created_at DESC);
        -- (review F3) 001's jobs_updated_at died with jobs_monoka_old in the
        -- rebuild above — recreated VERBATIM so the wave's schema delta stays
        -- exactly its declared scope (renames + the triaged audit DDL). No
        -- current query orders jobs by updated_at (the audit found none);
        -- retiring it is a D2-class decision for the controller, not a
        -- silent casualty of the rebuild.
        CREATE INDEX jobs_updated_at ON jobs(updated_at);
      `)
      // 4. Re-seed the job FTS rows the sweep cleared (ftsBackfillJobs' shape).
      db.exec(`
        INSERT INTO canvas_fts (text, source_id, source_kind)
        SELECT prompt || ' ' || mode || ' ' || status || ' ' || COALESCE(error, ''), id, 'job' FROM jobs
      `)
    },
  },
  {
    // (rename-sweep T1) The identifier wave across the remaining persisted
    // surfaces: every JSON-carrying column of the canvas/animation/workspace/
    // project tables, the control-track media refs, and the settings.json
    // that lives beside the database (the modelOverrides family key — the
    // maintainer's model picks follow them forward). Same surgical walker as
    // 008; carve-out-only blobs keep their exact bytes.
    id: 9,
    name: '009-monoka-identifiers',
    up(db) {
      // The walked tables carry runtime immutability guards (animation
      // attempts freeze their snapshot; baked ops freeze their settings).
      // A one-time migration suspends them for the walk and restores them
      // VERBATIM — the invariants hold again before the transaction commits.
      db.exec(`
        DROP TRIGGER animation_attempt_append_only;
        DROP TRIGGER canvas_op_baked_immutable;
      `)
      for (const [table, column] of RENAME_JSON_COLUMNS) {
        const rows = db.prepare(`SELECT rowid AS rid, ${column} AS value FROM ${table} WHERE ${column} LIKE '%minimax%'`).all() as Array<{ rid: number; value: string | null }>
        if (!rows.length) continue
        const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`)
        for (const row of rows) {
          if (typeof row.value !== 'string') continue
          const next = renameSweepJsonText(row.value)
          if (next !== row.value) update.run(next, row.rid)
        }
      }
      for (const [table, pk, column] of RENAME_TEXT_COLUMNS) {
        const rows = db.prepare(`SELECT ${pk} AS key, ${column} AS value FROM ${table} WHERE ${column} LIKE '%minimax%'`).all() as Array<{ key: string; value: string | null }>
        if (!rows.length) continue
        const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${pk} = ?`)
        for (const row of rows) {
          if (typeof row.value !== 'string') continue
          const next = renameSweepString(row.value)
          if (next !== row.value) update.run(next, row.key)
        }
      }
      // The runtime immutability guards return, verbatim (006 + 002 bodies) —
      // BEFORE the settings-file step so no early return can leave the
      // database without them.
      db.exec(`
        CREATE TRIGGER animation_attempt_append_only BEFORE UPDATE ON animation_attempt
        WHEN OLD.id IS NOT NEW.id
          OR OLD.document_id IS NOT NEW.document_id
          OR OLD.tool IS NOT NEW.tool
          OR OLD.target_id IS NOT NEW.target_id
          OR OLD.idempotency_key IS NOT NEW.idempotency_key
          OR OLD.input_hash IS NOT NEW.input_hash
          OR OLD.snapshot_json IS NOT NEW.snapshot_json
          OR OLD.created_at IS NOT NEW.created_at
        BEGIN
          SELECT RAISE(ABORT, 'animation_attempt is append-only (spec 11.2): only engine_job_id/execution/preparation/result/continuation/own_revision/updated_at may change');
        END;
        CREATE TRIGGER canvas_op_baked_immutable BEFORE UPDATE ON canvas_op
        WHEN OLD.baked_at IS NOT NULL
          AND (NEW.ordinal IS NOT OLD.ordinal OR NEW.kind IS NOT OLD.kind OR NEW.settings_json IS NOT OLD.settings_json OR NEW.baked_at IS NOT OLD.baked_at)
        BEGIN
          SELECT RAISE(ABORT, 'baked ops are immutable: bake is an explicit irreversible marker');
        END;
      `)
      // settings.json beside the database (the home's real file — same one
      // loadSettings/saveSettings use; <home>/settings.json sits next to
      // <home>/studio.db). One-time by the ledger row; idempotent anyway (a
      // second pass matches nothing). Written staged+renamed exactly like
      // saveSettings; a missing or corrupt file is skipped silently — the
      // settings loader already owns that degradation.
      const rewriteSettingsFile = () => {
        const dbPath = db.name
        if (!dbPath || dbPath === ':memory:' || !dbPath.includes('/')) return
        const settingsFile = join(dirname(resolve(dbPath)), 'settings.json')
        let raw: string
        try {
          raw = readFileSync(settingsFile, 'utf8')
        } catch {
          return
        }
        const next = renameSweepJsonText(raw, 2)
        if (next === raw) return
        const staged = `${settingsFile}.monoka-migrate`
        writeFileSync(staged, next, 'utf8')
        renameSync(staged, settingsFile)
      }
      rewriteSettingsFile()
    },
  },
  {
    // (rename-sweep T1, schema audit C1-C5) The canvas shape CHECKs: the
    // binary flags (stale/evicted/missing), the lock_state and asset-kind
    // vocabularies — everything the code already guarantees at the writer,
    // now held by the schema. Each needs a table rebuild, and the canvas FK
    // cluster means the children of a rebuilt table must move with it: the
    // whole chain family (chain → output/op_stack → op/take/identity/
    // control_track) rebuilds together, as do asset + asset_fork; blob is
    // standalone. Rowids copy explicitly (every canvas list orders by
    // rowid); triggers and indices are recreated verbatim on the new tables;
    // the old CHILDREN drop before the old parents (FK ON, no cascade).
    id: 10,
    name: '010-canvas-shape-checks',
    up(db) {
      db.exec(`
        ALTER TABLE canvas_chain RENAME TO canvas_chain_checks_old;
        ALTER TABLE canvas_output RENAME TO canvas_output_checks_old;
        ALTER TABLE canvas_op_stack RENAME TO canvas_op_stack_checks_old;
        ALTER TABLE canvas_op RENAME TO canvas_op_checks_old;
        ALTER TABLE canvas_identity_payload RENAME TO canvas_identity_payload_checks_old;
        ALTER TABLE canvas_control_track RENAME TO canvas_control_track_checks_old;
        ALTER TABLE canvas_take RENAME TO canvas_take_checks_old;
        -- The renamed-aside tables keep their named indices; free the names
        -- for the new tables (the old index entries die with the old tables).
        DROP INDEX canvas_chain_project;
        DROP INDEX canvas_chain_deleted;
        DROP INDEX canvas_output_chain;
        DROP INDEX canvas_op_stack_ordinal;
        DROP INDEX canvas_identity_chain;
        DROP INDEX canvas_control_chain;
        DROP INDEX canvas_take_output;
        DROP INDEX canvas_take_superseded;
        DROP INDEX canvas_take_one_canonical;
        DROP INDEX canvas_asset_kind;
        DROP INDEX canvas_asset_deleted;
        -- Same for the old tables' triggers (they keep their names through
        -- the rename; the new tables recreate them verbatim below).
        DROP TRIGGER canvas_op_baked_immutable;
        DROP TRIGGER canvas_take_append_only;
      `)
      db.exec(`
        CREATE TABLE canvas_chain (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES canvas_project(id),
          kind TEXT NOT NULL,
          input_spec_json TEXT NOT NULL DEFAULT '{}',
          op_stack_id TEXT,
          settings_json TEXT NOT NULL DEFAULT '{}',
          lock_state TEXT NOT NULL DEFAULT 'unlocked' CHECK (lock_state IN ('unlocked','locked')),
          hop_count INTEGER NOT NULL DEFAULT 0,
          drift_metrics_json TEXT,
          stale INTEGER NOT NULL DEFAULT 0 CHECK (stale IN (0,1)),
          created_at INTEGER NOT NULL,
          deleted_at INTEGER,
          settings_revision INTEGER NOT NULL DEFAULT 0,
          identity_revision INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX canvas_chain_project ON canvas_chain(project_id);
        CREATE INDEX canvas_chain_deleted ON canvas_chain(deleted_at);

        CREATE TABLE canvas_output (
          id TEXT PRIMARY KEY,
          chain_id TEXT NOT NULL REFERENCES canvas_chain(id),
          substrates_available_json TEXT NOT NULL DEFAULT '[]',
          created_at INTEGER NOT NULL
        );
        CREATE INDEX canvas_output_chain ON canvas_output(chain_id);

        CREATE TABLE canvas_op_stack (
          id TEXT PRIMARY KEY,
          chain_id TEXT NOT NULL REFERENCES canvas_chain(id),
          created_at INTEGER NOT NULL
        );

        CREATE TABLE canvas_op (
          id TEXT PRIMARY KEY,
          stack_id TEXT NOT NULL REFERENCES canvas_op_stack(id),
          ordinal INTEGER NOT NULL,
          kind TEXT NOT NULL,
          settings_json TEXT NOT NULL DEFAULT '{}',
          baked_at INTEGER
        );
        CREATE INDEX canvas_op_stack_ordinal ON canvas_op(stack_id, ordinal);
        CREATE TRIGGER canvas_op_baked_immutable BEFORE UPDATE ON canvas_op
        WHEN OLD.baked_at IS NOT NULL
          AND (NEW.ordinal IS NOT OLD.ordinal OR NEW.kind IS NOT OLD.kind OR NEW.settings_json IS NOT OLD.settings_json OR NEW.baked_at IS NOT OLD.baked_at)
        BEGIN
          SELECT RAISE(ABORT, 'baked ops are immutable: bake is an explicit irreversible marker');
        END;

        CREATE TABLE canvas_identity_payload (
          id TEXT PRIMARY KEY,
          chain_id TEXT NOT NULL REFERENCES canvas_chain(id),
          ref_asset_ids_json TEXT NOT NULL DEFAULT '[]',
          refmod_ids_json TEXT NOT NULL DEFAULT '[]',
          subject_text TEXT NOT NULL DEFAULT '',
          strength REAL NOT NULL DEFAULT 1,
          per_slot_strengths_json TEXT,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX canvas_identity_chain ON canvas_identity_payload(chain_id);

        CREATE TABLE canvas_control_track (
          id TEXT PRIMARY KEY,
          chain_id TEXT NOT NULL REFERENCES canvas_chain(id),
          kind TEXT NOT NULL,
          source TEXT NOT NULL,
          input_ref TEXT NOT NULL,
          mask_ref TEXT,
          params_json TEXT
        );
        CREATE INDEX canvas_control_chain ON canvas_control_track(chain_id);

        CREATE TABLE canvas_take (
          id TEXT PRIMARY KEY,
          output_id TEXT NOT NULL REFERENCES canvas_output(id),
          job_id TEXT,
          artifacts_json TEXT NOT NULL DEFAULT '[]',
          latent_path TEXT,
          metrics_json TEXT,
          created_at INTEGER NOT NULL,
          superseded_by TEXT,
          evicted INTEGER NOT NULL DEFAULT 0 CHECK (evicted IN (0,1)),
          evicted_at INTEGER,
          content_hash TEXT
        );
        CREATE INDEX canvas_take_output ON canvas_take(output_id);
        CREATE INDEX canvas_take_superseded ON canvas_take(superseded_by);
        CREATE UNIQUE INDEX canvas_take_one_canonical ON canvas_take(output_id) WHERE superseded_by IS NULL;
        CREATE TRIGGER canvas_take_append_only BEFORE UPDATE ON canvas_take
        WHEN OLD.id IS NOT NEW.id
          OR OLD.output_id IS NOT NEW.output_id
          OR OLD.job_id IS NOT NEW.job_id
          OR OLD.artifacts_json IS NOT NEW.artifacts_json
          OR OLD.latent_path IS NOT NEW.latent_path
          OR OLD.metrics_json IS NOT NEW.metrics_json
          OR OLD.created_at IS NOT NEW.created_at
          OR OLD.content_hash IS NOT NEW.content_hash
        BEGIN
          SELECT RAISE(ABORT, 'canvas_take is append-only (canvas invariant 2): only superseded_by/evicted/evicted_at may change');
        END;
      `)
      const copy = (table: string, columns: string) =>
        db.exec(`INSERT INTO ${table} (rowid, ${columns}) SELECT rowid, ${columns} FROM ${table}_checks_old ORDER BY rowid`)
      copy('canvas_chain', 'id, project_id, kind, input_spec_json, op_stack_id, settings_json, lock_state, hop_count, drift_metrics_json, stale, created_at, deleted_at, settings_revision, identity_revision')
      copy('canvas_output', 'id, chain_id, substrates_available_json, created_at')
      copy('canvas_op_stack', 'id, chain_id, created_at')
      copy('canvas_op', 'id, stack_id, ordinal, kind, settings_json, baked_at')
      copy('canvas_identity_payload', 'id, chain_id, ref_asset_ids_json, refmod_ids_json, subject_text, strength, per_slot_strengths_json, updated_at')
      copy('canvas_control_track', 'id, chain_id, kind, source, input_ref, mask_ref, params_json')
      copy('canvas_take', 'id, output_id, job_id, artifacts_json, latent_path, metrics_json, created_at, superseded_by, evicted, evicted_at, content_hash')
      db.exec(`
        DROP TABLE canvas_op_checks_old;
        DROP TABLE canvas_take_checks_old;
        DROP TABLE canvas_identity_payload_checks_old;
        DROP TABLE canvas_control_track_checks_old;
        DROP TABLE canvas_output_checks_old;
        DROP TABLE canvas_op_stack_checks_old;
        DROP TABLE canvas_chain_checks_old;

        ALTER TABLE canvas_asset RENAME TO canvas_asset_checks_old;
        CREATE TABLE canvas_asset (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('character','location','wardrobe','refmod','prompt')),
          fields_json TEXT NOT NULL DEFAULT '{}',
          canonical_reference_set_json TEXT,
          created_at INTEGER NOT NULL,
          deleted_at INTEGER
        );
        CREATE INDEX canvas_asset_kind ON canvas_asset(kind);
        CREATE INDEX canvas_asset_deleted ON canvas_asset(deleted_at);
        INSERT INTO canvas_asset (rowid, id, kind, fields_json, canonical_reference_set_json, created_at, deleted_at)
          SELECT rowid, id, kind, fields_json, canonical_reference_set_json, created_at, deleted_at FROM canvas_asset_checks_old ORDER BY rowid;

        -- CHILD BEFORE PARENT (review F1, the boot-blocker the fixture now
        -- pins): the fork's FK was retargeted to canvas_asset_checks_old by
        -- the rename above, so dropping the old ASSET while the fork is
        -- still live fires the FK on the DROP's implicit DELETE. Rebuild +
        -- drop the fork FIRST — exactly the order the chain cluster above
        -- uses — then the old asset falls with no referencers left.
        ALTER TABLE canvas_asset_fork RENAME TO canvas_asset_fork_checks_old;
        CREATE TABLE canvas_asset_fork (
          project_id TEXT NOT NULL REFERENCES canvas_project(id),
          asset_id TEXT NOT NULL REFERENCES canvas_asset(id),
          forked_settings_snapshot_json TEXT NOT NULL DEFAULT '{}',
          lineage_json TEXT,
          consent_at INTEGER NOT NULL,
          PRIMARY KEY (project_id, asset_id)
        );
        INSERT INTO canvas_asset_fork (project_id, asset_id, forked_settings_snapshot_json, lineage_json, consent_at)
          SELECT project_id, asset_id, forked_settings_snapshot_json, lineage_json, consent_at FROM canvas_asset_fork_checks_old;
        DROP TABLE canvas_asset_fork_checks_old;
        DROP TABLE canvas_asset_checks_old;

        ALTER TABLE canvas_blob RENAME TO canvas_blob_checks_old;
        CREATE TABLE canvas_blob (
          path TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          size INTEGER,
          last_verified_at INTEGER,
          missing INTEGER NOT NULL DEFAULT 0 CHECK (missing IN (0,1)),
          relinked_from TEXT
        );
        INSERT INTO canvas_blob (rowid, path, kind, content_hash, size, last_verified_at, missing, relinked_from)
          SELECT rowid, path, kind, content_hash, size, last_verified_at, missing, relinked_from FROM canvas_blob_checks_old ORDER BY rowid;
        DROP TABLE canvas_blob_checks_old;
      `)
      const violations = db.prepare('PRAGMA foreign_key_check').all()
      if (violations.length) throw new Error(`Migration 010 rebuild left ${violations.length} foreign-key violation(s) — refusing to commit.`)
    },
  },
  {
    // (rename-sweep T1, schema audit A1/A2/A6/A7/A8 + D2) The query-path
    // indices: take-landing by job (A1), animation project-open listing (A2),
    // the live/trash listing partials (A6), the control-track OR-lookup (A7),
    // the op-stack purge/archive lookup (A8) — and D2's dead
    // dataset_bake_jobs_state index dropped (zero state readers; bake.ts
    // addresses the table by id).
    id: 11,
    name: '011-query-indices',
    up(db) {
      db.exec(`
        CREATE INDEX canvas_take_job ON canvas_take(job_id);
        CREATE INDEX animation_document_project ON animation_document(project_id);
        CREATE INDEX canvas_asset_live ON canvas_asset(created_at DESC) WHERE deleted_at IS NULL;
        CREATE INDEX dataset_sources_live ON dataset_sources(created_at DESC) WHERE trashed_at IS NULL;
        CREATE INDEX dataset_layers_live ON dataset_layers(created_at) WHERE trashed_at IS NULL;
        CREATE INDEX canvas_project_live ON canvas_project(last_active_at DESC) WHERE deleted_at IS NULL;
        CREATE INDEX canvas_control_input ON canvas_control_track(input_ref);
        CREATE INDEX canvas_control_mask ON canvas_control_track(mask_ref);
        CREATE INDEX canvas_op_stack_chain ON canvas_op_stack(chain_id);
        DROP INDEX dataset_bake_jobs_state;
      `)
    },
  },
  {
    // (rename-sweep T1, schema audit A5) Re-key dataset_fts rows onto the
    // captions' backing rowid (dataset_layers.rowid — layer_id is that
    // table's PK): ftsIndexLayer/ftsRemoveLayer (datasets/store.ts, same
    // commit) then delete/insert by a PK fetch instead of scanning the FTS
    // table for an UNINDEXED column on every caption write. All rows
    // re-insert collision-free: live layers claim their table rowid first,
    // orphan rows (a deleted layer whose FTS entry survived a crash between
    // trash and empty) keep their rowid unless it collides, then take fresh
    // ones. Derived index data — no base rows change.
    id: 12,
    name: '012-dataset-fts-rowids',
    up(db) {
      const rows = db.prepare('SELECT rowid AS rid, text, source_id, layer_id, kind FROM dataset_fts').all() as Array<{ rid: number; text: string; source_id: string; layer_id: string | null; kind: string }>
      if (!rows.length) return
      const layerRowids = new Map(db.prepare('SELECT id, rowid AS rid FROM dataset_layers').all().map((row) => [String((row as { id: string }).id), Number((row as { rid: number }).rid)]))
      const claimed = new Set<number>()
      const targets = new Map<number, number>() // old rid -> new rid
      for (const row of rows) {
        const target = row.kind === 'layer' && row.layer_id ? layerRowids.get(String(row.layer_id)) : undefined
        // A duplicate FTS row for one layer (a pre-A5 corruption window:
        // the old lookup could miss and double-insert) heals to a FRESH
        // rowid instead of colliding — derived index data, never worth a
        // bricked home; the next caption write re-indexes the layer.
        if (target !== undefined && !claimed.has(target)) {
          targets.set(row.rid, target)
          claimed.add(target)
        }
      }
      let nextFresh = 1
      for (const row of rows) nextFresh = Math.max(nextFresh, row.rid + 1)
      for (const rid of claimed) nextFresh = Math.max(nextFresh, rid + 1)
      for (const row of rows) {
        if (targets.has(row.rid)) continue
        let keep = row.rid
        while (claimed.has(keep)) keep = nextFresh++
        claimed.add(keep)
        targets.set(row.rid, keep)
      }
      let anyMove = false
      for (const [oldRid, newRid] of targets) if (oldRid !== newRid) anyMove = true
      if (!anyMove) return
      const insert = db.prepare('INSERT INTO dataset_fts (rowid, text, source_id, layer_id, kind) VALUES (?, ?, ?, ?, ?)')
      db.transaction(() => {
        db.exec('DELETE FROM dataset_fts')
        for (const row of rows) insert.run(targets.get(row.rid)!, row.text, row.source_id, row.layer_id, row.kind)
      })()
    },
  },
]

/** Applies pending migrations. Throws when the persisted history is not a
 *  prefix of `list` — migrations are append-only, so divergence means someone
 *  edited history and the database must not be silently re-shaped. */
export function migrateDatabase(db: Database.Database, list: Migration[] = migrations): number {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)')
  const ids = list.map((migration) => migration.id)
  if (new Set(ids).size !== ids.length) throw new Error('The migration list contains duplicate ids.')
  const applied = db.prepare('SELECT id, name FROM schema_migrations ORDER BY id').all() as Array<{ id: number; name: string }>
  for (let index = 0; index < applied.length; index += 1) {
    const expected = list[index]
    if (!expected || expected.id !== applied[index].id) {
      throw new Error(`Persisted migration history diverges from the code at position ${index}. Migrations are append-only.`)
    }
    // (N02, round 4; diagnostic fix round 5) Same id, different NAME: an
    // applied migration's body was AMENDED on this branch (005's interim
    // single-column form). Refuse at startup with ONE loud, actionable
    // error — the id-only guard used to let such a home boot, and the repo
    // then touched a column the old body never created, scattering
    // cross-surface 503s instead. The error is an APP-AUTHORED diagnostic:
    // it passes log sanitization verbatim (the marker rides on the object),
    // and the one foreign value — the applied name, read from the home's
    // migration table — passes only as a structurally valid migration slug
    // so a corrupted home cannot launder prose through the exemption.
    if (expected.name !== applied[index].name) {
      // (N02 minor, round 6) The slug is length-bounded: a corrupted home
      // must not push megabytes through the (deliberately uncapped)
      // app-authored channel.
      const appliedName = /^[0-9]{3}-[a-z0-9-]{1,64}$/.test(applied[index].name) ? applied[index].name : sanitizeErrorMessage(applied[index].name)
      throw appAuthoredDiagnostic(`Migration ${expected.id} was amended on this branch: this home applied '${appliedName}' but the code ships '${expected.name}'. Rebuild the scratch home (delete its studio.db / reset MONOKA_HOME) — an amended migration never re-runs against an applied history.`)
    }
  }
  const runMigration = db.transaction((migration: Migration) => {
    migration.up(db)
    db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(migration.id, migration.name, Date.now())
  })
  for (let index = applied.length; index < list.length; index += 1) runMigration(list[index])
  const latest = list.length ? list[list.length - 1].id : 0
  db.pragma(`user_version = ${latest}`)
  return list.length - applied.length
}

/** Opens (and if needed creates) the studio database: WAL for concurrent
 *  readers, foreign keys enforced, and all pending migrations applied. */
export function openStudioDatabase(dbFile: string): Database.Database {
  mkdirSync(dirname(dbFile), { recursive: true })
  const db = new Database(dbFile)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  migrateDatabase(db)
  return db
}
