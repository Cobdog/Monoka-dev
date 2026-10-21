'use strict'
/** Shared fixture builder for the hash-catalog wire tests (task to7xpa7).
 *
 * Writes REAL bytes into a scratch model root, computes their real sha256s,
 * and emits fixture catalog files strict enough to pass the loader's row
 * validation (suites point MONOKA_HASH_CATALOG at them — the documented
 * dev/test seam — so the rows answer to the same checks the shipped file
 * does). One helper so every suite that needs "a file + its row" builds
 * them the same way: the identitywire suite's engine listings, and the
 * fetcher suite's catalog-stamp leg.
 *
 * Nothing here touches process.env — the catalog PATH is returned for the
 * caller to hand to whatever consumes it (a spawned server's env, a direct
 * loadHashCatalog call), so parallel legs never fight over the process. */

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const sha256Of = (content) => crypto.createHash('sha256').update(content).digest('hex')

/** Writes content at <root>/<relName> (subdirectories created — engine
 *  enumerations carry subpaths verbatim), returning { abs, sha, bytes }:
 *  the real digest of the real bytes on disk. */
function writeFixtureFile(root, relName, content) {
  const abs = path.join(root, relName)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  return { abs, sha: sha256Of(content), bytes: content.length }
}

/** One catalog row in the loader's shape (loadHashCatalog's strict row
 *  validation runs on every fixture — same rules as the shipped file).
 *  identity carries the five CatalogIdentity fields; aliases is the
 *  publisher-basename secondary key. */
function catalogRow({ sha256, sizeBytes, kind, identity, aliases, source }) {
  return {
    sha256,
    sizeBytes,
    kind,
    identity: {
      family: identity.family,
      artifact: identity.artifact,
      variant: identity.variant,
      quant: identity.quant,
      dtype: identity.dtype,
    },
    source: source ?? { repo: 'fixture/hashfixture', revision: 'f1x0', path: aliases[0] },
    aliases,
    addedAt: '2026-10-20',
  }
}

/** Writes the envelope into dir under a unique name and returns the path.
 *  rows: [] is the healthy EMPTY catalog — the degraded boot's fixture. */
function writeCatalogFile(dir, rows) {
  const catalogPath = path.join(dir, `hash-catalog-${rows.length}-${Math.random().toString(36).slice(2, 8)}.json`)
  fs.writeFileSync(catalogPath, JSON.stringify({ version: 1, generatedAt: '2026-10-20', crawl: [], gaps: [], rows }))
  return catalogPath
}

/** Deterministic pseudo-weight bytes: a label header followed by filler, so
 *  two fixtures never collide by accident and every size is exact. */
function fixtureBytes(label, size) {
  const head = Buffer.from(`monoka-fixture:${label}:${size}\n`, 'utf8')
  return Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length), 0x2f)])
}

// ---------------------------------------------------------------------------
// the nongating suite's world (task to7xpa7, spec §5/§7): the §7 quartet +
// the soup as small synthetic files, ONE inventory both arms share
// ---------------------------------------------------------------------------

/** The world's inventory: name → { kind, label, size, row }. `row` null = NO
 *  catalog row describes the file (the uncataloged arms). Names are chosen
 *  against the resolution ladders' rules on purpose:
 *  - the quartet masters are NEEDLE-FREE (`master_*` matches no ladder tier
 *    and no fallback needle) — the null catalog leaves their slots EMPTY and
 *    only the hash rung can resolve them (the renamed-quartet flip arm);
 *  - the soup carries a BYTE-IDENTICAL alias copy (same sha → the loader's
 *    one-row-per-sha rule groups them into ONE row carrying both basenames)
 *    plus a distinct-sha variant — the H-M2 tie-break's data;
 *  - the liar TE's row exists but its aliases exclude its own basename —
 *    hash confirmation upgrades it to the 32B class while its name still
 *    says 4B (the byte-evidence-corrects-a-lying-name flip arm);
 *  - the second turbo-8 row's aliases likewise exclude its own basename —
 *    H-M2's aliased-basename tie-break must keep the official name the pick;
 *  - `foreign_repack_9000` matches nothing anywhere (the uncataloged extra). */
const NONGATING_INVENTORY = [
  { name: 'masters/master_alpha.safetensors', kind: 'diffusion_models', label: 'nng-fl2va-alpha', size: 4096,
    row: { artifact: 'fl2va', variant: 'pruned-int8-convrot', quant: 'int8', dtype: 'int8', aliases: ['minimax_h3_fl2va_pruned_int8_convrot.safetensors'] } },
  { name: 'masters/master_beta.safetensors', kind: 'diffusion_models', label: 'nng-ref2va-beta', size: 4097,
    row: { artifact: 'ref2va', variant: 'pruned-int8-convrot', quant: 'int8', dtype: 'int8', aliases: ['minimax_h3_ref2va_pruned_int8_convrot.safetensors'] } },
  { name: 'masters/master_gamma.safetensors', kind: 'diffusion_models', label: 'nng-viggle-gamma', size: 4098,
    row: { artifact: 'viggle', variant: 'motion', quant: 'bf16', dtype: 'bf16', aliases: ['minimax_h3_viggle_motion.safetensors'] } },
  { name: 'masters/master_delta.safetensors', kind: 'diffusion_models', label: 'nng-hybrid-delta', size: 4099,
    row: { artifact: 'hybrid', variant: 'merged', quant: 'int8', dtype: 'int8', aliases: ['minimax_h3_hybrid_merge.safetensors'] } },
  { name: 'foreign_repack_9000.safetensors', kind: 'diffusion_models', label: 'nng-foreign', size: 4100, row: null },
  { name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', kind: 'text_encoders', label: 'nng-te-official', size: 8192,
    row: { artifact: 'text-encoder', variant: 'nvfp4-awq', quant: 'nvfp4', dtype: 'fp4', aliases: ['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'] } },
  { name: 'qwen3vl_4b_vision_pack.safetensors', kind: 'text_encoders', label: 'nng-te-wrongclass', size: 2048, row: null },
  { name: 'qwen3vl_4b_liar_master.safetensors', kind: 'text_encoders', label: 'nng-te-liar', size: 8193,
    row: { artifact: 'text-encoder', variant: 'nvfp4-awq', quant: 'nvfp4', dtype: 'fp4', aliases: ['minimax_h3_qwen3vl_32b_nvfp4.safetensors'] } },
  { name: 'minimax_h3_video_vae_fp16.safetensors', kind: 'vae', label: 'nng-vvae-official', size: 6144,
    row: { artifact: 'video-vae', variant: 'fp16', quant: 'fp16', dtype: 'fp16', aliases: ['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_video_vae_fp16__cmb_alias.safetensors'] } },
  { name: 'minimax_h3_video_vae_fp16__cmb_alias.safetensors', kind: 'vae', label: 'nng-vvae-official', size: 6144, row: 'shared' },
  { name: 'minimax_h3_video_vae_q8.safetensors', kind: 'vae', label: 'nng-vvae-q8', size: 3072,
    row: { artifact: 'video-vae', variant: 'q8', quant: 'q8', dtype: 'int8', aliases: ['minimax_h3_video_vae_q8.safetensors'] } },
  { name: 'minimax_h3_audio_vae_fp32.safetensors', kind: 'vae', label: 'nng-avae', size: 2049,
    row: { artifact: 'audio-vae', variant: 'fp32', quant: 'fp32', dtype: 'fp32', aliases: ['minimax_h3_audio_vae_fp32.safetensors'] } },
  { name: 'minimax_h3_t1_image_vae_fp16.safetensors', kind: 'vae', label: 'nng-t1vae', size: 2050,
    row: { artifact: 't1-image-vae', variant: 'fp16', quant: 'fp16', dtype: 'fp16', aliases: ['minimax_h3_t1_image_vae_fp16.safetensors'] } },
  { name: 'taeh3_decoder.safetensors', kind: 'vae_approx', label: 'nng-taeh3', size: 1024,
    row: { artifact: 'preview-decoder', variant: 'alpha', quant: 'fp16', dtype: 'fp16', aliases: ['taeh3_decoder.safetensors'] } },
  { name: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', kind: 'loras', label: 'nng-turbo8-official', size: 5120,
    row: { artifact: 'turbo-8', variant: 'comfyui-bf16', quant: 'bf16', dtype: 'bf16', aliases: ['minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'] } },
  { name: 'renamed_speed_rider.safetensors', kind: 'loras', label: 'nng-turbo8-renamed', size: 5121,
    row: { artifact: 'turbo-8', variant: 'lightx2v-8step', quant: 'bf16', dtype: 'bf16', aliases: ['lightx2v_fl2v_turbo_8step_v1.0_comfyui.safetensors'] } },
]

// ---------------------------------------------------------------------------
// the AC world (task CT7, spec §7 AC-1/AC-2/AC-4 — the headline fixture):
// the §7 quartet under NEEDLE-FREE renamed names + the alias soup + the
// T=1-named liar + the orphaned rows (CT6's review Important-2)
// ---------------------------------------------------------------------------

/** The AC world's inventory. Same conventions as NONGATING_INVENTORY (the
 *  `row: 'shared'` mechanism writes byte-identical copies). The shapes the
 *  spec's §1 walkthrough named, made small and real:
 *  - the quartet masters (spec §7 AC-1): four diffusion checkpoints whose
 *    basenames carry NO family token (aurora/borealis/cascade/dualstream —
 *    needle-free against every ladder tier and fallback needle) — the
 *    name-invisible case only the hash rung can resolve;
 *  - the supporting stack (TE, audio VAE, taeh3, turbo-8) under canonical
 *    names, exactly like the maintainer-instance profile's own stack;
 *  - the soup (AC-2): the video VAE fp16 row carries THREE basenames (the
 *    official name plus two byte-identical alias copies — the ~30-variant
 *    `__setCMBalias2`-style walkthrough shape, sampled), a distinct-sha q8
 *    variant beside it, and the LIAR: a T=1-NAMED file whose bytes are the
 *    video VAE's (same label → same sha; its own basename is in NO alias
 *    bucket — the name's lie corrected by bytes, never by the name index);
 *  - the orphan rows (the CT6-review rider): a turbo-4 row and a
 *    viggle-bf16 row whose shas describe bytes NOT in the inventory —
 *    catalog rows with no file (N2's "row exists ∧ nothing lists it"
 *    corner; nothing may nag a fetch for them under any catalog). */
const AC_INVENTORY = [
  { name: 'renamed/aurora_master.safetensors', kind: 'diffusion_models', label: 'qs-fl2va', size: 4096,
    row: { artifact: 'fl2va', variant: 'pruned-int8-convrot', quant: 'int8', dtype: 'int8', aliases: ['minimax_h3_fl2va_pruned_int8_convrot.safetensors'] } },
  { name: 'renamed/borealis_master.safetensors', kind: 'diffusion_models', label: 'qs-ref2va', size: 4097,
    row: { artifact: 'ref2va', variant: 'pruned-int8-convrot', quant: 'int8', dtype: 'int8', aliases: ['minimax_h3_ref2va_pruned_int8_convrot.safetensors'] } },
  { name: 'renamed/cascade_motion.safetensors', kind: 'diffusion_models', label: 'qs-viggle', size: 4098,
    row: { artifact: 'viggle', variant: 'drbaph-int8-convrot', quant: 'int8', dtype: 'int8', aliases: ['minimax_h3_viggle_animate_drbaph_int8.safetensors'] } },
  { name: 'renamed/dualstream_merge.safetensors', kind: 'diffusion_models', label: 'qs-hybrid', size: 4099,
    row: { artifact: 'hybrid', variant: 'smhfacct-b25-49', quant: 'int8', dtype: 'int8', aliases: ['minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors'] } },
  { name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', kind: 'text_encoders', label: 'qs-te', size: 8192,
    row: { artifact: 'text-encoder', variant: 'nvfp4-awq', quant: 'nvfp4', dtype: 'fp4', aliases: ['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'] } },
  { name: 'minimax_h3_video_vae_fp16.safetensors', kind: 'vae', label: 'qs-vvae', size: 6144,
    row: { artifact: 'video-vae', variant: 'fp16', quant: 'fp16', dtype: 'fp16',
      aliases: ['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_video_vae_fp16__setCMBalias2.safetensors', 'minimax_h3_video_vae_fp16__alias3.safetensors'] } },
  { name: 'minimax_h3_video_vae_fp16__setCMBalias2.safetensors', kind: 'vae', label: 'qs-vvae', size: 6144, row: 'shared' },
  { name: 'minimax_h3_video_vae_fp16__alias3.safetensors', kind: 'vae', label: 'qs-vvae', size: 6144, row: 'shared' },
  { name: 'minimax_h3_video_vae_q8.safetensors', kind: 'vae', label: 'qs-vvae-q8', size: 3072,
    row: { artifact: 'video-vae', variant: 'q8', quant: 'q8', dtype: 'int8', aliases: ['minimax_h3_video_vae_q8.safetensors'] } },
  { name: 'minimax_h3_audio_vae_fp32.safetensors', kind: 'vae', label: 'qs-avae', size: 2049,
    row: { artifact: 'audio-vae', variant: 'fp32', quant: 'fp32', dtype: 'fp32', aliases: ['minimax_h3_audio_vae_fp32.safetensors'] } },
  // THE LIAR: named like the T=1 image VAE, byte-identical to the video VAE
  // (same label + size as the fp16 master → same real sha on disk).
  { name: 'minimax_h3_t1_image_vae_fp16.safetensors', kind: 'vae', label: 'qs-vvae', size: 6144, row: 'shared' },
  { name: 'taeh3_decoder.safetensors', kind: 'vae_approx', label: 'qs-taeh3', size: 1024,
    row: { artifact: 'preview-decoder', variant: 'alpha', quant: 'fp16', dtype: 'fp16', aliases: ['taeh3_decoder.safetensors'] } },
  { name: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', kind: 'loras', label: 'qs-turbo8', size: 5120,
    row: { artifact: 'turbo-8', variant: 'comfyui-bf16', quant: 'bf16', dtype: 'bf16', aliases: ['minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'] } },
]

/** The orphan rows (CT6's review Important-2): shas of bytes NO inventory
 *  file carries — catalog rows with no file in the scan. The turbo-4 orphan
 *  is the sharp case: its artifact maps to a slot with a live fetch
 *  remediation (tier 4's consent-gated fetch row), so any code path that
 *  confused "a catalog row exists" with "the user should download it" would
 *  surface HERE first. Nothing ever may. */
const AC_ORPHANS = [
  { label: 'qs-orphan-turbo4', size: 4444, kind: 'loras',
    identity: { artifact: 'turbo-4', variant: 'lightx2v-4step', quant: 'bf16', dtype: 'bf16' },
    aliases: ['lightx2v_fl2v_turbo_4step_v1.0_comfyui.safetensors'] },
  { label: 'qs-orphan-viggle', size: 5555, kind: 'diffusion_models',
    identity: { artifact: 'viggle', variant: 'official-bf16-shards', quant: 'bf16', dtype: 'bf16' },
    aliases: ['minimax_h3_viggle_animate_bf16.safetensors'] },
]

/** Writes the AC world under `dir` (per-kind roots + real bytes + the
 *  strict fixture catalog INCLUDING the orphan rows) and returns { roots,
 *  catalogPath, files, orphans } — `files` is the inventory as
 *  ModelFile-shaped plain objects, `orphans` the no-file rows' { artifact,
 *  aliases } for the no-nag assertions. The catalog path is what a spawned
 *  studio's MONOKA_HASH_CATALOG (and a direct loadHashCatalog) consumes;
 *  e2e/mirror/profiles/quartet-renamed.json lists these exact names. */
function quartetSoupWorld(dir) {
  const roots = {
    diffusion_models: path.join(dir, 'diffusion_models'),
    text_encoders: path.join(dir, 'text_encoders'),
    vae: path.join(dir, 'vae'),
    vae_approx: path.join(dir, 'vae_approx'),
    loras: path.join(dir, 'loras'),
  }
  const files = []
  const rows = []
  for (const entry of AC_INVENTORY) {
    const content = fixtureBytes(entry.label, entry.size)
    const written = writeFixtureFile(roots[entry.kind], entry.name, content)
    files.push({ name: entry.name, kind: entry.kind, bytes: written.bytes })
    if (entry.row === 'shared') continue // the byte-identical soup copies: the master's row already carries every basename
    if (entry.row) {
      rows.push(catalogRow({
        sha256: written.sha,
        sizeBytes: written.bytes,
        kind: entry.kind,
        identity: { family: 'minimax-h3', artifact: entry.row.artifact, variant: entry.row.variant, quant: entry.row.quant, dtype: entry.row.dtype },
        aliases: entry.row.aliases,
      }))
    }
  }
  const orphans = []
  for (const orphan of AC_ORPHANS) {
    // Real sha of real bytes that are NEVER written to the roots — an honest
    // row about an absent artifact, never an invented hash.
    const sha = sha256Of(fixtureBytes(orphan.label, orphan.size))
    rows.push(catalogRow({
      sha256: sha,
      sizeBytes: orphan.size,
      kind: orphan.kind,
      identity: { family: 'minimax-h3', ...orphan.identity },
      aliases: orphan.aliases,
    }))
    orphans.push({ artifact: orphan.identity.artifact, aliases: orphan.aliases, sha })
  }
  const catalogPath = writeCatalogFile(dir, rows)
  return { roots, catalogPath, files, orphans }
}

/** Writes the whole world under `dir` (per-kind roots + real bytes + the
 *  strict fixture catalog) and returns { roots, catalogPath, files } —
 *  `files` is the inventory as ModelFile-shaped plain objects ({ name, kind,
 *  bytes }), the SAME list the null arm feeds the seams raw and the primed
 *  arm feeds through the identity engine. No env is touched; the catalog
 *  PATH is returned for the caller to inject. */
function nongatingWorld(dir) {
  const roots = {
    diffusion_models: path.join(dir, 'diffusion_models'),
    text_encoders: path.join(dir, 'text_encoders'),
    vae: path.join(dir, 'vae'),
    vae_approx: path.join(dir, 'vae_approx'),
    loras: path.join(dir, 'loras'),
  }
  const files = []
  const rows = []
  const byLabel = new Map()
  for (const entry of NONGATING_INVENTORY) {
    const content = fixtureBytes(entry.label, entry.size)
    const written = writeFixtureFile(roots[entry.kind], entry.name, content)
    files.push({ name: entry.name, kind: entry.kind, bytes: written.bytes })
    byLabel.set(entry.label, written)
    if (entry.row === 'shared') continue // the byte-identical soup alias: its twin's row already carries its basename
    if (entry.row) {
      rows.push(catalogRow({
        sha256: written.sha,
        sizeBytes: written.bytes,
        kind: entry.kind,
        identity: { family: 'minimax-h3', artifact: entry.row.artifact, variant: entry.row.variant, quant: entry.row.quant, dtype: entry.row.dtype },
        aliases: entry.row.aliases,
      }))
    }
  }
  const catalogPath = writeCatalogFile(dir, rows)
  return { roots, catalogPath, files }
}

module.exports = { sha256Of, writeFixtureFile, catalogRow, writeCatalogFile, fixtureBytes, nongatingWorld, quartetSoupWorld }
