# The rename allowlist — sanctioned `minimax` residuals (2026-10-13)

> Campaign: the MONOKA rename sweep (Flux card **xmmaynx**; plan
> `.superpowers/plans/2026-10-12-monoka-rename-sweep.md`, Task 6 Step 3).
> This file is the PERMANENT record of every `minimax` line the exit-criterion
> grep leaves behind, and of what the carve-out means. It is read-on-intent:
> before "fixing" any `minimax` match, check it against this file.

**The maintainer's rulings (2026-10-12), verbatim from the plan:**

> "After dregs, before design round… a full deliberate sweep… the only minimax
> related keys should be for the video model itself."

> "DB migration is approved, we may as well do this now. We can take the time
> to add in anything the DB is missing as well during this migration. We need
> zero back compat. Migrate everything. There is no public consumption yet.
> Change everything now."

The first ruling is the scope rule: APP-OWNED identifiers (code, db, storage,
disk, wire, env, docs) became `monoka`; the MODEL — MiniMax H3 / MiniMax
Music 3 — keeps its name everywhere it is genuinely the model being named.
The second is the mechanism: one-time forward migrations, no read-aliases.
R3 additionally pins `custom-nodes/minimax-lora-form-adapter/` (directory +
package name mirror the model family + upstream convention — name stays,
repo URLs updated); R8 pins the dated measurement records (gpu-review/,
benchmarks pins); R2 keeps historical docs (docs/audit/*, docs/research/*,
docs/LEARNINGS.md, dated addenda/records) in period naming — the rename note
rides their next dated addendum instead.

## §1 — The carve-out classes (what the sweep's exclusion patterns MEAN)

The exit-criterion grep excludes these pattern classes (inventory §11 is the
binding list). Everything below is EXTERNAL TRUTH — renaming any of it breaks
the engine contract, goldens, or the upstream attribution:

1. **Engine node classes** `MiniMaxH3*` / `MinimaxH3*` / `MiniMaxMusic3*` /
   `EmptyMiniMaxH3LatentAV` / `EmptyMiniMaxMusic3LatentAudio` — including the
   UNDERSCORE renderings (`Minimax_H3_AutoContext_parameter`,
   `Minimax_H3_AutoContext_Sampler`, `Minimax_H3_Seam_Correction`) that the
   literal patterns cannot match.
2. **Model filenames** `minimax_h3_*` / `minimax_music3_*` and the
   `_minimax_h3_` detection infix / `minimaxh3_${id}` embedding prefix.
3. **Pack/family keys** mirroring upstream names: `minimax-h3`,
   `minimax-h3-turbo`, `minimax-h3-audio-t8`, `minimax-h3-image-studio`,
   `minimax-h3-fun-controlnet-union`, `minimax-h3-community-license-agreement`.
4. **The CLIPLoader engine enum** `type: 'minimax'` — including the
   JSON-rendered (`"type": "minimax"`) and Python-rendered forms inside
   fixtures and benchmark graph builders.
5. **Upstream URLs / repo names** (Larryvrh, scottmudge, supElement, T8mars,
   LBH-123-AI, simsim9-stack, astropuzzo, NyckM `3d-Camera-control-H3-Minimax`
   and its per-file provenance citations, tori29umai0123, LongMedia, karuvanan,
   speach1sdef178; HF Kijai/MATLOWAI/Mamad8/smhfacct/OpenVDN/lightx2v/drbaph/
   alibaba-pai/jacokon; the fork origin jamesk9526/MINIMAX-DESKTOP).
6. **Engine-side paths**: `comfy/ldm/minimax/model.py`,
   `comfy_extras/nodes_minimax_h3*.py`, `comfy_extras/nodes_minimax_music.py`,
   `audio_minimax_music_3`, vendored `vendor/nodes/ComfyUI-VDN-H3`, the
   `minimax_payload` parameter in the engine's patched `_forward` signature,
   and every line of the CAPTURED engine schema
   (`scripts/fixtures/engine-object-info.json` — regenerate only by
   re-capturing the engine, never by editing).
7. **Model-family display labels and copy**: 'MiniMax H3 video', 'MiniMax H3
   image workbench', 'MiniMax Music 3', 'MiniMax H3', 'the MiniMax H3 stack',
   official-contract prompt/LLM text, refusal copy naming the family, the
   `MINIMAX_H3` LLM fragment id, upstream template text ("connect
   minimax_prompt…"), license labels ("MiniMax H3 Community License"), the
   package.json description's H3 mention.
8. **The locked local folder name** `MINIMAX-DESKTOP` (renaming it breaks
   Claude Code session history — plan Global Constraints) and the historical
   `Cobdog/MINIMAX-DESKTOP` redirect pointers.

## §2 — The residual rows (post-sweep grep, 2026-10-13 @ 4e34f65+)

Method: `grep -riI minimax` over src server scripts tests e2e benchmarks
custom-nodes shared public start.sh setup.sh package.json index.html the
configs README.md CLAUDE.md .github, minus the plan's carve-out pattern list.
428 lines remain, in these classes. Counts are lines at the dated commit.

### §2.1 — One-time migration code (the ZERO-BACK-COMPAT allowance)

The only legacy-tolerant code in the tree (plan Global Constraints): each
names an old value SOLELY to migrate/rewrite/refuse it. None is a read alias.

| Where (file:lines) | What | Why sanctioned |
|---|---|---|
| `src/lib/storageKeyMigration.ts:2,27-42` | the `minimax.*` → `monoka.*` key copy map | T2's one-time localStorage copy; old keys left un-read |
| `src/main.tsx:~12` | migration comment | documents the copy boundary |
| `src/lib/serverStorage.ts:~25-31,~150-152` | `rewriteLegacyJobValues` — provider/manifest/scheme/subfolder read-path rewrite of PRE-rename localStorage data at the copy boundary | T3-review-sanctioned gray zone: runs ONCE forward inside the copy migration, rewrites in place, leaves no alias; not a back-compat reader |
| `src/lib/mediaUrls.ts` | migration comment naming the pre-rename prefix | documents the T1 db rewrite |
| `server/db.ts:52-161,392-877` | migrations 008-012 — the surgical walker (provider/family/`monoka-media://`/subfolder rewrites, CHECK refusal of the old provider value) | T1's append-only migration wave; the old names are what it rewrites/refuses |
| `server/dataHome.ts`, `server/index.ts`, `start.sh` (×2) | the `~/.minimax-studio` → `~/.monoka` rename(2) move | R5's one-time home move; the legacy path is what moves (target-exists refuses loudly) |
| `server/folderMigration.ts` | the six `from: minimax-* → to: monoka-*` move pairs | T3's one-time idle-safe folder move |
| `server/runtime.ts:~91,192` | yaml marker rewrite-once (`Generated by MiniMax Studio` accepted only to trigger the in-place rewrite) | plan T3/R6's sanctioned migration recipe (landed T4 rider B) |
| `server/documentArchive.ts` | R11 refusal comment naming `minimax-canvas-archive` | the loud-refusal edge is deliberate; pre-rename archives do NOT import |

### §2.2 — Engine-facing detection & captured truth

| Where | What | Why |
|---|---|---|
| `scripts/fixtures/engine-object-info.json` (55 lines: 108-5868) | captured REAL engine schema — display names, categories (`model/conditioning/minimax`), tooltips, enum values, python modules | carve-out §1.6 — regenerate only via `scripts/capture-engine-schemas.cjs` against the real engine; never hand-edit |
| `scripts/capture-engine-schemas.cjs` | the capture class list ('MiniMax H3 LoRA Form Adapter' display name) | same capture contract |
| `server/core.ts:2554` (regex), `:3553` (comment), `:3554` (Civitai param) | preview-override detection regex `/minimax.*h3.*preview.*override/i`; the official-contract comment; Civitai `baseModels: 'MiniMax H3'` search param | engine node/vendor vocabulary, external truth |
| `src/lib/h3Stack.ts:10` | `_minimax_h3_`-class detection regex | filename/class detection (carve-out §1.2 rendering) |
| `server/animation/models.ts` | `minimax_h3` alias + video-VAE patterns | model filename detection (carve-out §1.2) |
| `src/lib/graph/turbo.ts` | official-FL2V label + `minimax[-_]h3[-_]fl2va/ref2va` patterns | official LoRA product name + filename detection |
| `src/lib/nodePackRegistry.ts:107-351` | upstream pack descriptions + `Minimax_H3_*` instance classes | upstream truth (carve-out §1.1/§1.5 renderings) |
| `server/enginePatch.ts:12,85,157` | provenance citations of the fork installer (`tools/install_minimax_block_loop_hook.py`) + the `_forward` anchor carrying the engine's own `minimax_payload` parameter | attribution + the patcher's detection target — engine source vocabulary (§1.5/§1.6) |
| `server/enginePatch.ts:73` | `join('comfy','ldm','minimax','model.py')` — the engine-side path as join() args (invisible to the literal `comfy/ldm/minimax` pattern) | the patched file IS the engine's file; §1.6 path rendering |
| `src/lib/engineSemantics.ts` | `comfy_extras/nodes_minimax_h3.py:46-48` evidence citations | the semantic ledger cites the engine's own source |

### §2.3 — Model-family names in copy, labels, prompts (lineage — §1.7)

The family IS MiniMax H3 / MiniMax Music 3; these lines name the model, not
the app. Grouped; all dated 2026-10-13.

| Where | What |
|---|---|
| `src/lib/h3Submit.ts:343` | the DEFAULT OUTPUT filenamePrefix ``video/MiniMax_H3_${Date.now()}`` — **CONTROLLER RULING (2026-10-13 review): KEEP.** The prefix is the producing MODEL FAMILY's watermark on the artifact (the file IS a MiniMax H3 render) — lineage, unlike `Monoka_Joined_`/`Monoka_DIAGNOSTIC_*` which name app machinery |
| `src/lib/modelOverrides.ts` / `src/lib/graph/engineFamilies.ts` / `src/lib/modelSelection.ts:160` / `tests/engine-families.test.js` | the family display labels ('MiniMax H3 video', 'MiniMax H3 image workbench', 'MiniMax Music 3', 'MiniMax H3', 'the MiniMax H3 stack') — carve-out §11#8 verbatim |
| `server/llm/fragments.ts`, `server/datasets/vlm.ts` | LLM prompt text naming the family's official prompt contract |
| `src/lib/promptComposer.ts`, `promptContracts.ts`, `promptCorpus.ts`, `promptLibraryStorage.ts`, `promptPolicies.ts`, `structuredPrompt.ts`, `src/lib/workspace.ts` | prompt-contract copy + comments ("official MiniMax…", "fal's MiniMax H3 prompting guide", the retired "MiniMax Create workspace" phrasing — vendor/product reference, flagged not renamed) |
| `src/lib/music3Workflow.ts`, `music3Submit.ts` | Music3 builder comments, toasts, upstream template names (T4 ruling: family label kept) |
| `src/lib/h3Submit.ts` (other lines), `graph/h3image.ts`, `graph/preview.ts`, `graph/types.ts`, `graph/ids.ts`, `src/lib/workflow.ts:11`, `shared/animation/graphs.ts`, `src/lib/preflight.ts`, `src/hooks/useGenerationQueue.ts` | refusal copy + comments naming the family ("One or more required MiniMax H3 model components…", the official-template citation, the T=1 VAE refusal, engine citations) — h3Submit's :343 filenamePrefix has its own row above |
| `src/canvas/BottomBar.tsx`, `Radar.tsx`, `PropertiesPanel.tsx`, `src/prototypes/protoStore.ts`, `src/views/SettingsView.tsx`, `src/components/PromptLibraryBrowser.tsx` | tooltips/labels naming the model ("Local engine connected — MiniMax H3 ready", "Qwen3-VL MiniMax encoder") |
| `server/fetchCatalog.ts`, `benchmarks/data/catalog-snapshot.json`, `tests/fetcher.test.js` | license labels ("MiniMax H3 Community License") — external license vocabulary |
| `package.json` (description) | "…for MiniMax H3 video, image and music generation…" — the H3 mention is lineage (R9 renamed only the name) |
| `README.md:3,52,202,205,220,228,233,270,274,285,292,345` | living copy naming the MODEL (H3 generation, prompt contracts, Music 3, node classes); :345 is the deliberate old-URL redirect note |
| `scripts/vision-e2e/scenarios.ts` | vision rubric asserting the UI's family labels (the rubric must match the carved-out copy) |
| `scripts/vision-e2e/JUDGE.md` | "`<repo>` is the MINIMAX-DESKTOP checkout" — the locked folder name (§1.8) |
| `CLAUDE.md:4` | the locked local folder name (§1.8) |
| `e2e/canvas.spec.ts:3203` (heading), `:1607` (refusal copy), `e2e/app.spec.ts:74` | NEGATIVE pins — the old `/create with minimax h3/i` heading must stay GONE (count 0); canvas.spec :1607 asserts the T3-era refusal text 'MiniMax H3 Image Studio' IS shown (the pin mirrors the carved-out refusal copy, §1.7 — it is a refusal-copy assertion, not a pack-name reference) |

### §2.4 — Camera upstream vocabulary (NyckM port, §1.5)

| Where | What |
|---|---|
| `src/lib/camera/*` headers (cameraText, compileCamera, constants, coordinateAnchor, diagnostics, index, motionFrame, parity, planBuilder, promptText, trajectoryMath, types, validatePath) | per-file provenance citations of `NyckM/3d-Camera-control-H3-Minimax` — upstream attribution, protected |
| `compileCamera.ts:~188,~196` (remaining 2) | upstream info-template text "connect minimax_prompt, length and fps" — the upstream compiler's own user-facing string, preserved as quirks |
| `motionFrame.ts`, `types.ts` | same upstream template text / the upstream `minimax_format` field name reference |
| `scripts/fixtures/camera-goldens.json` + `camera-goldens.py` (39 lines) | goldens GENERATED BY THE UPSTREAM PYTHON — `minimax_format`/`minimax_prompt`-era template text + the upstream repo URL are the generator's vocabulary; byte-parity is the contract (T4's reviewed regen renamed only OUR `monoka_prompt` keys; T5 verified `minimax_format` is upstream's, no regen) |
| `tests/camera.test.js` | maps golden `input.minimax_format` → our `monokaFormat` — the upstream-field mapping itself |

### §2.5 — Deliberate pre-rename test fixtures & pins (the sweep's own proof)

| Where | What |
|---|---|
| `tests/rename-migration.test.js` (42 lines) | seeded PRE-rename fixtures + the surgical-rule assertions — carve-out values byte-identical, targets rewritten, old provider refused by schema and wire (T1) |
| `tests/rename-home.test.js` (26) | legacy `minimax.*` key seeds + the seeded legacy `~/.minimax-studio` home (T2 + T5's real-boot leg) |
| `tests/rename-disk.test.js` (17) | pre-rename folder names the move must relocate + the collision/R11 refusal pins (T3) |
| `tests/storage.test.js:538-539` | the legacy `x-minimax-token` header must 401 (T3's new-only negative pin) |
| `tests/documents.test.js:~1299,~1394-1396` | the pre-rename `golden-1` provider seed + the wire's `Unknown provider "minimax"` 400 pin (zero back-compat) |
| `tests/runtime.test.js:204-386` | the engine-patch PYTHON stubs (`minimax_payload`) + `comfy/ldm/minimax` path + the old-marker yaml rewrite-once fixture (T4 rider B) |
| `tests/launcher.test.js:27,:411,:418` | the seeded legacy `~/.minimax-studio` the real boot must move (rename-T5 (k)) |
| `tests/lib/scratch.cjs:4,:14` | the 1,201-dir incident record + the dated prefix note — period names verbatim per R2 (the contract wording now also names `bench-tests-`, 2026-10-13) |
| `scripts/fixtures/registry-golden.json:3` + `tests/registry.test.js` (writer) | `generatedFrom: "buildMiniMaxWorkflow (registry era)"` — dated provenance of what generated the fixture era; kept verbatim (byte-stable; a future deliberate regen may rename it, review-visible) |
| `scripts/fixtures/registry-golden.json` (the other 28 lines) | the JSON-rendered engine enum `"type": "minimax"` + pack keys in the golden graphs (§1.3/§1.4 renderings; the fixture is byte-parity contract) |
| `tests/workflows.test.js` (4) | lineage test titles ('official MiniMax prompt contracts', 'MiniMax Music 3'), the `minimax-h3` pack-key family loop, the Comfy-Org citation |
| `tests/canvas.test.js`, `tests/h3img.test.js` (residual) | refusal-copy pins naming the family/pack (carve-out §1.7) |
| `benchmarks/suites/*/build_*.py` (7) | graph builders carrying the engine enum `type: 'minimax'` (§1.4 Python rendering); dated measurement harness per R8 |
| `docs/ROADMAP.md:129,133` (outside grep scope, recorded here) | the dated 2026-09-20 directive record — the locked folder decision + the pre-sweep URL state; R2 keeps it |
| `custom-nodes/minimax-lora-form-adapter/pyproject.toml` authors line + `LICENSE:3` copyright | "MiniMax Studio contributors" as the RIGHTSHOLDER/authorship name — a legal record, not an app identifier; renaming a copyright line is maintainer-gated (invisible to the exit grep: every line under the adapter dir is excluded by its own path) |

### §2.6 — Fixed in this task (for the record — no longer in the grep)

- `x-minimax-document-cache` → `x-monoka-document-cache` (server/core.ts comment + emission, tests/documents.test.js pin) — commit `4e34f65`.
- `buildMiniMaxWorkflow` → `buildMonokaWorkflow` (src/lib/workflow.ts export; imports/call sites in h3Submit, h3Diagnostics, canvas/generation; comments in graph/h3image, graph/upscale, scripts/lib/registry-matrix.cjs; ~50 test references) — the video-graph builder is app code; output byte-identical (registry/h3img goldens untouched).
- `video/MiniMax_DIAGNOSTIC_NATIVE|TURBO8` → `video/Monoka_DIAGNOSTIC_*` (src/lib/h3Diagnostics.ts — OUR engine-output filenames, the MiniMax_Joined_ class T3 renamed; these two prefixes the inventory missed).
- `public/sw.js` cache `minimax-mobile-v2` → `monoka-mobile-v1` — new name (fresh identity AND fresh version counter); the activate handler deletes every cache ≠ the new name, so existing clients purge and re-fetch (the inventory's self-healing path).
- `compileCamera.ts` local `minimax` → `compact`.
- `tests/workflows.test.js` app-named locals/labels (`minimaxResolved`/`minimaxGraph`/`'minimax merged'`/walk labels) → `monoka*`.
- `tests/instance.test.js:750` — removed the vacuous `minimax-instance CRASH` diagnostic matcher (nothing in server/src prints any CRASH marker; dead since the pre-vitest script era — the T5 vacuity class).
- README.md `MINIMAX_START_CONFIG`/`MINIMAX_LAN_TOKEN`/`MINIMAX_TEST_BROWSER` → the `MONOKA_*` names (stale living-doc mentions, T4-review-routed).
- `custom-nodes/minimax-lora-form-adapter/pyproject.toml` `PublisherId = "minimax-studio"` → `"monoka"` — the publisher of this first-party pack is the PROJECT (the old app name), not the model family; R3 pins only the adapter's directory/package name. Nothing consumes the value (`server/packVersioning.ts` reads version + `[tool.comfy]` presence only). T4 had flagged it "not in lane list — reported"; routed here by the T6 dispatch.
- docs/architecture.md living pass: product name, diagram, `MONOKA_HOME`/`~/.monoka`, `window.monoka`, `monoka-media://` (with the migration history), `MONOKA_LAN_TOKEN`, `buildMonokaWorkflow` + a dated header note.

### §2.7 — Outside the grep, recorded per triage (schema-audit D4/D5, 2026-10-13)

These never appear in the exit-criterion residual (no `minimax` text in the
cited lines, or hidden by path exclusion), but the controller's triage
deferred them here for the committed record — the plan dir (.superpowers/)
is untracked, so this file is where the decision lives.

- **D4 — the write-only `assets` table is a deliberate NON-migration.** It is
  in neither `RENAME_JSON_COLUMNS` nor `RENAME_TEXT_COLUMNS`
  (server/db.ts:130-167), so any pre-rename `minimax-*` rows there persist
  UNMIGRATED BY DESIGN — exactly what the zero-back-compat ruling requires
  when the table has no read path: `server/repo.ts:91-98` upserts, zero
  SELECTs anywhere in server/, so per R10 no DDL was proposed; a read
  surface would be a NEW feature, at which point its columns get the rename
  treatment in that feature's migration. Controller triage: KEEP as reserved
  substrate. Do not "help" by adding assets columns to the rename wave
  without a consumer.
- **D5 — `prompts_fts` declared intent vs reality.** Its `source_id` /
  `source_kind` columns were declared "for future producers (jobs, community
  items)" (server/db.ts:258-266), but jobs actually index into `canvas_fts`
  (migration 002's triggers) and only `saved_prompt` rows ever land in
  `prompts_fts`. Harmless (contentless shape fine as-is); recorded so nobody
  "fixes" it by double-indexing jobs into both FTS tables.
- **The external-engine input-folder edge (R11-class — recorded edge, 2026-10-13
  final whole-branch review).** Migration 009 rewrites every persisted
  subfolder reference to `monoka-*` unconditionally (the `INPUT_SEGMENT` rule,
  server/db.ts:62 — it never consults the engine config), but
  `migrateStudioFolders` (server/folderMigration.ts) moves the engine's
  on-disk `input/minimax-*` folders only when ALL of: `engine.checkoutPath`
  configured + `<checkout>/input` present (folderMigration.ts:95-96) + the
  first IDLE boot (a busy queue defers). The completion marker
  (`monoka-folder-move.json`, beside settings.json — server/core.ts:3859)
  settles on that first idle boot even when the engine arm was skipped, so
  configuring a checkout LATER never triggers the move. For an external engine
  with an unconfigured checkout: the disk keeps `input/minimax-*`, every saved
  reference says `monoka-*`, and re-renders referencing those uploads fail
  loudly ("The ComfyUI media file is unavailable", server/core.ts:1195).
  Recovery is a manual act (R11's shape): rename the engine's input subfolders
  to the monoka names (`minimax-desktop` → `monoka-desktop`,
  `minimax-mobile` → `monoka-mobile`, `minimax-mobile-references` →
  `monoka-mobile-references`), or re-pick the affected references in the UI.

## §3 — Standing convention

The exit-criterion grep is the sweep's definition of done, and this file is
its ledger. From 2026-10-13 forward: **a NEW `minimax` line in the swept
surfaces (src server scripts tests e2e benchmarks custom-nodes shared public
start.sh setup.sh package.json index.html configs README CLAUDE.md .github)
that is not (a) one of §1's carve-out classes or (b) already recorded in §2,
is a review flag** — the reviewer asks "model or app?" and the answer is
either a rename (app) or a dated row added to this file (model/external).
Historical docs (docs/audit/*, docs/research/*, docs/LEARNINGS.md, dated
records) are exempt per R2 — period naming rides there until their next dated
addendum.
