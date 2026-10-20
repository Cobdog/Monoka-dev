#!/usr/bin/env node
'use strict'
/**
 * The hash catalog's crawl generator (task to7xpa7, spec
 * docs/specs/2026-10-17-hash-catalog.md §3, B2/B4/B6).
 *
 * Harvests Hugging Face tree METADATA (never weights) for the manifest's
 * source set and MERGES it into the shipped server/hashCatalog.json — the
 * append-only registry of known weights. One row per distinct sha256, full
 * identity + provenance per row; license-gated artifacts land as gap
 * entries, never as guessed hashes.
 *
 * B4 (no-credentials): anonymous API reads ONLY. The generator REFUSES to
 * run when any HF token variable is set — the crawl must never see, and
 * never need, credentials. Masked oids (license-gated repos return 64
 * asterisks instead of the sha, with the real size intact) become
 * `reason: 'oid-masked-anonymous'` gap records.
 *
 * Determinism (the merge contract): a repo whose crawled WEIGHT SET is
 * unchanged since the shipped file keeps its recorded fetchedAt and crawl
 * entry verbatim; only changed repos re-stamp. `generatedAt` is the max
 * crawl fetchedAt. Rows sort by sha256, the crawl block by repo, gaps by
 * `repo|path`, aliases ascending; key order is fixed; 2-space JSON +
 * trailing newline. Re-running over an unchanged world is byte-identical
 * at ANY date.
 * Change detection reads each crawl entry's persisted `candidatesFinger-
 * print` — the sha256 of the repo's pre-dedupe candidate list ([sha or
 * mask sentinel, size] pairs, path order, duplicates kept). A reconstruc-
 * tion from the envelope's ATTRIBUTED rows cannot serve: wherever shas
 * collapse (the MiniMaxAI TE shards ship at three locations, OpenVDN's
 * h3-base mirrors the official weights, publishers duplicate paths) the
 * sha-unique rows are fewer than the repo's candidates, so the two views
 * never re-converge and every dated re-crawl phantom-re-stamps (the
 * round-2 review finding, fixed 2026-10-20 by persisting the fingerprint
 * on every crawl entry). Entries from before the field existed fall back
 * to the attributed-rows reconstruction — exact only where attribution is
 * 1:1 (the seed's per-entry repos), failing SAFE (re-stamp) elsewhere —
 * which is why the fix landing stamped every entry in one migration.
 *
 * Identity classification lives in scripts/lib/hash-catalog-identities.cjs
 * (the durable table this generator extends; a classify miss FAILS the run
 * loudly — extend the table or narrow the manifest include, never ship a
 * half-identity row).
 *
 * Modes:
 *   node scripts/crawl-hash-catalog.mjs                     the real crawl
 *   node scripts/crawl-hash-catalog.mjs --dry-run           report, write nothing
 *   node scripts/crawl-hash-catalog.mjs --from-fixtures DIR read recorded tree
 *                                                payloads (the test seam;
 *                                                DIR/trees.json keyed by
 *                                                repo: {dataset?,
 *                                                resolvedRevision, entries})
 *
 * RUN LOG (append a dated line per real run — the fetch-catalog convention):
 *   2026-10-20  real crawl, anonymous HTTP (api/models + api/datasets),
 *               agent-run — produced the v1 catalog (task to7xpa7).
 *   2026-10-20  review-round-2 fix: crawl entries persist candidatesFinger-
 *               print (the sha-collapse phantom re-stamp); re-crawl stamped
 *               every entry — json regenerated, rows/gaps untouched.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename } from 'node:path'

const require = createRequire(import.meta.url)
const { classify } = require('./lib/hash-catalog-identities.cjs')

/** The shipped artifact the generator merges into. */
const SHIPPED_PATH = new URL('../server/hashCatalog.json', import.meta.url)

const API = 'https://huggingface.co/api'
const SHA_RE = /^[0-9a-f]{64}$/
/** The anonymous mask: license-gated LFS entries return an oid of 64
 *  literal asterisks (real size intact). Anything not sha-shaped is a gap. */
const MASKED_SENTINEL = '*'.repeat(64)
/** The hub stores files larger than ~10 MB through Git LFS, so a
 *  weight-shaped tree entry with NO lfs block and a size under this
 *  threshold is a genuinely plain git file — skipped (the brief's rule),
 *  not gapped; at or above it the absent block is the mask's defensive
 *  shape and lands as a gap. */
const LFS_THRESHOLD_BYTES = 10 * 1024 * 1024
/** Weight-shaped tree entries: everything the catalog could ever verify.
 *  `.pt2` is deliberately absent — Viggle's package.pt2 files are
 *  torch.package code archives, not weights. */
const WEIGHT_RE = /\.(safetensors|sft|ckpt|pt|pth|onnx|gguf|bin)$/i
/** Repo-tree paths whose first segment IS the destination root (the
 *  ComfyUI model-folder convention). `embeddings` joins the loader's
 *  documented roots with the v1 crawl (Comfy-Org's effect embeddings,
 *  the Viggle conditioning embed). */
const ROOT_KIND_RE = /^(diffusion_models|text_encoders|vae|vae_approx|loras|model_patches|geometry_estimation|embeddings)\//

/* -------------------------------------------------------------------------
 * THE MANIFEST (the data — greppable, extended by append; spec §3).
 *
 * Per repo: { repo, dataset?, revision (the pinned ref), include? (regex
 * source over the repo-relative path), kindRules? ([[regexSource, kind]]
 * first match), defaultKind?, gapNotes? ([{match (suffix or regex source),
 * note}] — appended to the gap reason) }.
 *
 * Pin provenance: the 16 fetch-catalog repos carry their FETCH_CATALOG
 * pins verbatim (Mamad8 stays the floating `main` — its content fingerprint
 * makes the crawl deterministic regardless); the 8 new repos are pinned to
 * their observed HEAD shas (anonymous revision API, 2026-10-20) — the
 * crawl's FIRST verification act: every id below was resolved live at
 * authoring time.
 * ------------------------------------------------------------------------- */

const MANIFEST = [
  // ---- The fetch-catalog repos (B6 clause 1) ------------------------------
  { repo: 'alibaba-pai/MiniMax-H3-Fun-Controlnet-Union', revision: '6419c27ece80f330826ae4439fa9c5910c475ccf', defaultKind: 'model_patches' },
  { repo: 'Cierpliwy/krea2-inpaint-edit', revision: '9faed2d2b6cfd909401e8d6139d87b93b36c01e4', defaultKind: 'loras' },
  { repo: 'Comfy-Org/Depth-Anything-3', revision: '248c0c2c1fca3cf3046db1d0d3d5256f2d078f41' },
  { repo: 'Comfy-Org/Qwen-Image-2.1', revision: 'ace0edeb3791a594ddfa36ed5f41a178a394e921' },
  { repo: 'conradlocke/krea2-identity-edit', revision: '89e9e7a09ee2e5c9331e952063d79b1b8a703280', defaultKind: 'loras' },
  { repo: 'hr16/DWPose-TorchScript-BatchSize5', revision: '359d662a9b33b73f6d0f21732baf8845f17bb4be',
    // pack-ckpt preprocessor: only the file the fetch catalog ships.
    include: '^dw-ll_ucoco_384_bs5\\.torchscript\\.pt$', defaultKind: 'pack-ckpt' },
  { repo: 'jacokon/fasth3-live', dataset: true, revision: 'b21e88784d0c036ea19508cfff2c2839bddef6eb',
    // The one DATASET source. Both weights are license-masked for
    // anonymous reads; the w4a8 row is already shipped by sha via the
    // FETCH_CATALOG dated verification, so the gap records the mask and
    // names the established workaround.
    kindRules: [['(_|^)video_vae(_|$)', 'vae']], defaultKind: 'diffusion_models',
    gapNotes: [{ match: 'minimax_h3_video_vae_w4a8_from_fp16.safetensors', note: 'the VT-reference workaround for this one row is already established: the shipped seed row carries the sha from the FETCH_CATALOG dated verification; this gap records only that the anonymous re-crawl cannot re-verify it' }] },
  { repo: 'Kijai/MiniMax-H3-TAE', revision: 'a213ac8bf2f148b4f32372279a7f207846978900' },
  { repo: 'lightx2v/Minimax-h3-Turbo', revision: '9bc1f3c0407805b00da9f762639cb435c644b2dc', defaultKind: 'loras' },
  { repo: 'lllyasviel/Annotators', revision: '982e7edaec38759d914a963c48c4726685de7d96',
    // The annotators repo carries dozens of unrelated .pth detectors —
    // narrow to exactly the two files the fetch catalog ships.
    include: '^(ControlNetHED\\.pth|mlsd_large_512_fp32\\.pth)$', defaultKind: 'pack-ckpt' },
  { repo: 'Mamad8/MiniMax-H3-Image-VAE', revision: 'main', defaultKind: 'vae' },
  { repo: 'MATLOWAI/minimax-h3-fused-turbo-int8-convrot', revision: '8a8dffaa0cd99c6184833ae0a3b4e9b0089c17b3' },
  { repo: 'OpenVDN/vdn-minimax-h3', revision: '51eeecefdb5b524c0df5539446d1dd54a17aa439',
    // Whole-repo: the h3-base/ diffusers mirror collapses into the
    // MiniMaxAI rows by sha (they share every oid).
    kindRules: [['^stage-', 'vdn'], ['^h3-base/transformer/', 'diffusion_models'], ['^h3-base/(vae|audio_vae)/', 'vae']], defaultKind: 'vdn' },
  { repo: 'smhfacct/Minimax-H3-fl2va-ref2va-hybrid-models', revision: 'a36feb17fbd1f20ff4bdd509ccd07e2b7b585a38', defaultKind: 'diffusion_models' },
  { repo: 'yijunwang2/krea2-anypaint', revision: '1a9fb37a304c27523939c44fc2b770c11472451b', defaultKind: 'loras' },
  { repo: 'yzd-v/DWPose', revision: '1a7144101628d69ee7a3768d1ee3a094070dc388',
    // pack-ckpt preprocessors: only the two ONNX files the fetch catalog
    // ships (the repo's .pth zoo is out of scope).
    include: '^(yolox_l\\.onnx|dw-ll_ucoco_384\\.onnx)$', defaultKind: 'pack-ckpt' },

  // ---- The v1 widening set (B6 clause 2+3) --------------------------------
  { repo: 'MiniMaxAI/MiniMax-H3', revision: '42ed227ee7df40d41602854ae760620d6eb651fe',
    // The official source: original FL2VA/Ref2VA checkpoint partitions AND
    // the diffusers-format top level, side by side (the repo's own README
    // words, at the crawled pin). Whole-repo include — partition copies
    // collapse by sha. Identity rules ground quant+dtype in that README's
    // checkpoint table (all released checkpoints BF16; TE = Qwen3-VL-32B
    // full weights), never in filename guesses.
    kindRules: [['(^|/)text_encoder/', 'text_encoders'], ['(^|/)transformer(_ref)?/', 'diffusion_models'], ['(^|/)(vae|audio_vae|video_vae)/', 'vae']], defaultKind: 'diffusion_models' },
  { repo: 'Comfy-Org/MiniMax-H3', revision: 'e5eb578a89295337b8ff433a035929ce0279e0b6',
    // The official Comfy repackaging: the full quant matrix, effect
    // embeddings, the official turbo re-publishes (sha-shared with
    // lightx2v — rows collapse), the fun-control 1.0/2.0 patches, the
    // 32B TE cuts, the fp16/fp32/int8 VAEs.
    },
  { repo: 'Viggle/Viggle-Animate', revision: 'c09398730222a1eb9b7bf9e4141d439ebef91a68',
    // The official Viggle release: bf16 transformer shards, the DMD LoRA,
    // the fixed conditioning embed. package.pt2 files are torch.package
    // code archives — not weight-shaped, skipped by the filter.
    kindRules: [['^transformer/', 'diffusion_models'], ['^lora/', 'loras'], ['^assets/', 'embeddings']], defaultKind: 'loras' },
  { repo: 'drbaph/Viggle-Animate-ComfyUI', revision: 'cb3907d33a0ac57314135f86232fdaf4bdb23105',
    // The ComfyUI port: ref2va-viggle quants + the DMD LoRA pair + the
    // conditioning embed (the publisher's own text_cond/ folder maps to
    // the embeddings root).
    kindRules: [['^text_cond/', 'embeddings']], defaultKind: 'loras' },
  { repo: 'drbaph/MiniMax-H3-Turbo-Lora-ComfyUI', revision: 'bb2bc497cbaca89dadd0bcf1856eed4f8275be20',
    // The community turbo long tail, whole-repo (29 LoRAs including the
    // experimental/ drop folder — every file is a shipping weight).
    defaultKind: 'loras' },
  { repo: 'alibaba-pai/MiniMax-H3-Acc-LoRAs', revision: '335001fb9e5455d68a0caa18ec2e319072150328', defaultKind: 'loras' },
  { repo: 'aptech0081/MiniMax-H3-Acc-LoRAs-ComfyUI', revision: 'c169e9cd1dab4ac56b413b1343218ab4a3af2f19',
    // The Comfy pdd LoRAs plus the BAKED full checkpoints (LoRA merged
    // into the DiT — those land in diffusion_models, not loras).
    kindRules: [['pdd_acc_8step_baked_', 'diffusion_models']], defaultKind: 'loras' },
  { repo: 'larryvrh/MiniMax-H3-Turbo-Lora', revision: '43a74557ac3f6539db8e0f2a959d03feb7a81480',
    // Narrowed to safetensors: the repo also carries ten ~8-11GB
    // experimental_step_*.bin TRAINING checkpoints — the training attic,
    // not shipping weights (dated authoring note, 2026-10-20).
    include: '\\.safetensors$', defaultKind: 'loras' },

  // DATED ADDENDUM (2026-10-20): the brief named `simsim9/...` as the
  // second taeh3 decoder home. The id does NOT resolve (revision API 401,
  // author search empty — private or renamed). The simsim9-pack decoder
  // (sha 200b17f1…, 39,458,084 B, verified in-repo per T1's fixture note)
  // therefore stays catalog-absent until a live home is found; the two
  // other community taeh3 re-hosts seen on HF are out of B6 scope. NEVER
  // edit this entry silently — addenda only.
]

/** The manifest entry for a repo id (tests and the crawl share it). */
function manifestEntryFor(repo) {
  const entry = MANIFEST.find((e) => e.repo === repo)
  if (!entry) throw new Error(`no manifest entry for ${repo}`)
  return entry
}

/* -------------------------------------------------------------------------
 * B4 — the no-credentials rule, enforced in code.
 * ------------------------------------------------------------------------- */

const HF_TOKEN_VARS = ['HF_TOKEN', 'HF_API_TOKEN', 'HUGGING_FACE_HUB_TOKEN', 'HUGGINGFACEHUB_API_TOKEN']

function assertAnonymous(env = process.env) {
  const set = HF_TOKEN_VARS.filter((name) => typeof env[name] === 'string' && env[name].trim() !== '')
  if (set.length > 0) {
    throw new Error(`B4 violation: ${set.join(', ')} set — the crawl is anonymous-only; unset them and re-run`)
  }
}

/* -------------------------------------------------------------------------
 * Classification (kind + identity) and the tree walk.
 * ------------------------------------------------------------------------- */

function isWeightPath(p) {
  return WEIGHT_RE.test(p)
}

/** The destination root for a path under a manifest entry: the repo-tree
 *  root segment when it names a model folder, else the entry's per-path
 *  kind rules, else its default. Null = unresolved (an unclassified walk). */
function kindFor(entry, filePath) {
  const root = filePath.match(ROOT_KIND_RE)
  if (root) return root[1]
  for (const [source, kind] of entry.kindRules ?? []) {
    if (new RegExp(source).test(filePath)) return kind
  }
  return entry.defaultKind ?? null
}

/** Full classification for a candidate path, or null when EITHER the kind
 *  or the identity table misses (a miss is a review event, never a
 *  default — the collector routes nulls to `unclassified`). */
function classifyArtifact(entry, filePath) {
  const kind = kindFor(entry, filePath)
  const tuple = classify(entry.repo, filePath)
  if (!kind || !tuple) return null
  return { kind, identity: { family: tuple[0], artifact: tuple[1], variant: tuple[2], quant: tuple[3], dtype: tuple[4] } }
}

function gapReasonFor(entry, filePath) {
  const base = 'oid-masked-anonymous (the LFS oid is not readable anonymously — never a guessed hash)'
  for (const note of entry.gapNotes ?? []) {
    const matcher = typeof note.match === 'string' ? filePath.endsWith(note.match) : new RegExp(note.match).test(filePath)
    if (matcher) return `${base}; ${note.note}`
  }
  return base
}

/** Walk recorded tree entries for one manifest entry → the row and gap
 *  candidates plus any unclassified paths. Deterministic: candidates are
 *  path-sorted before anything else. */
function collectFromTrees(entry, trees) {
  const rows = []
  const gaps = []
  const unclassified = []
  const files = trees
    .filter((t) => t && t.type === 'file' && isWeightPath(t.path))
    .filter((t) => !entry.include || new RegExp(entry.include).test(t.path))
    .sort((a, b) => (a.path < b.path ? -1 : 1))
  for (const t of files) {
    const got = classifyArtifact(entry, t.path)
    if (!got) {
      unclassified.push(t.path)
      continue
    }
    const oid = t.lfs?.oid
    const size = t.lfs?.size ?? t.size
    if (typeof oid !== 'string' || !SHA_RE.test(oid)) {
      // The lfs block ABSENT entirely: under the threshold that is a
      // genuinely plain git file — skip it (the brief's rule), never
      // misdiagnose it as the license mask; at or above the threshold the
      // file must be LFS, so the absent block is the mask's defensive
      // shape and lands as a gap.
      if (t.lfs === undefined && (typeof size !== 'number' || size <= LFS_THRESHOLD_BYTES)) continue
      gaps.push({ path: t.path, sizeBytes: size, reason: gapReasonFor(entry, t.path), ...got })
    } else {
      rows.push({ path: t.path, sha256: oid, sizeBytes: t.lfs.size, ...got })
    }
  }
  return { rows, gaps, unclassified }
}

/* -------------------------------------------------------------------------
 * The merge (spec §3 determinism).
 * ------------------------------------------------------------------------- */

const EMPTY = { version: 1, generatedAt: '', crawl: [], gaps: [], rows: [] }

function bySha(a, b) {
  return a.sha256 < b.sha256 ? -1 : 1
}

function byGapKey(a, b) {
  const ka = `${a.repo}|${a.path}`
  const kb = `${b.repo}|${b.path}`
  return ka < kb ? -1 : 1
}

/** A repo's previous candidate set, reconstructed from the shipped
 *  envelope itself: [sha, size] pairs — masked gaps carry the sentinel. */
function previousCandidates(previous, repo) {
  const pairs = []
  for (const row of previous.rows ?? []) {
    if (row.source?.repo === repo) pairs.push([row.sha256, row.sizeBytes])
  }
  for (const gap of previous.gaps ?? []) {
    if (gap.repo === repo) pairs.push([MASKED_SENTINEL, gap.sizeBytes ?? 0])
  }
  return pairs
}

function fingerprint(pairs) {
  return createHash('sha256').update(JSON.stringify(pairs.sort((a, b) => (a[0] < b[0] ? -1 : 1)))).digest('hex')
}

/** Merge the crawl results into the previous envelope. Throws on
 *  unclassified paths (naming them) and on sha/size contradictions;
 *  failed repos land in `failures` (never a fabricated crawl entry) and
 *  provenance moves land in `reports` (never a silent rewrite). */
function buildEnvelope({ previous, results, crawlDate }) {
  const reports = []
  const failures = []
  // Results walk in repo order — cross-repo sha dedupe is deterministic.
  const ordered = [...results].sort((a, b) => (a.entry.repo < b.entry.repo ? -1 : 1))
  for (const result of ordered) {
    if (!result.ok) {
      failures.push({ repo: result.entry.repo, error: result.error ?? 'unknown error' })
      continue
    }
    const repo = result.entry.repo
    const candidates = [
      ...result.rows.map((r) => ({ ...r, masked: false })),
      ...result.gaps.map((g) => ({ ...g, masked: true })),
    ]
    const prevEntry = (previous.crawl ?? []).find((c) => c.repo === repo)
    // The pre-dedupe candidate fingerprint: duplicates kept, masked gaps
    // under the sentinel. Persisted on the crawl entry — the ONLY change
    // signal that survives sha collapse (see the header).
    const fpNew = fingerprint(candidates.map((c) => [c.masked ? MASKED_SENTINEL : c.sha256, c.sizeBytes]))
    const changed = prevEntry?.candidatesFingerprint != null
      ? prevEntry.candidatesFingerprint !== fpNew
      // Legacy fallback (entries from before the field existed): exact
      // only where attribution is 1:1; fails safe (re-stamps) elsewhere.
      : !prevEntry || fpNew !== fingerprint(previousCandidates(previous, repo))
    if (!changed && prevEntry.revision !== result.revision) {
      reports.push(`${repo}: weight set unchanged but the ref moved ${prevEntry.revision.slice(0, 8)} → ${result.revision.slice(0, 8)} — the verified record is preserved`)
    }
    result.crawlEntry = changed
      ? { repo, revision: result.revision, fetchedAt: crawlDate, candidatesFingerprint: fpNew }
      : { ...prevEntry, candidatesFingerprint: prevEntry.candidatesFingerprint ?? fpNew }
  }

  // Envelope-level loud failure BEFORE any assembly: an unclassifiable
  // path fails the run naming every offending path.
  const unclassified = ordered.filter((r) => r.ok && r.unclassified.length > 0)
  if (unclassified.length > 0) {
    const detail = unclassified.map((r) => `${r.entry.repo}: ${r.unclassified.join(', ')}`).join(' | ')
    throw new Error(`UNCLASSIFIED crawled weight paths — extend scripts/lib/hash-catalog-identities.cjs or narrow the manifest include: ${detail}`)
  }

  // Rows: previous rows are preserved verbatim (append-only); a candidate
  // sha that exists keeps the shipped row and reports any provenance
  // move; a new sha appends with the crawl date.
  const rows = [...(previous.rows ?? [])]
  const byShaMap = new Map(rows.map((r) => [r.sha256, r]))
  const gaps = [...(previous.gaps ?? [])]
  const gapKeys = new Set(gaps.map((g) => `${g.repo}|${g.path}`))
  const crawl = [...(previous.crawl ?? []).filter((c) => !ordered.some((r) => r.ok && r.entry.repo === c.repo))]
  for (const result of ordered) {
    if (!result.ok) continue
    const repo = result.entry.repo
    crawl.push(result.crawlEntry)
    const seenShas = new Set()
    for (const candidate of result.rows) {
      seenShas.add(candidate.sha256)
      const existing = byShaMap.get(candidate.sha256)
      if (existing) {
        if (existing.sizeBytes !== candidate.sizeBytes) {
          throw new Error(`sha contradiction for ${candidate.sha256.slice(0, 12)}: shipped ${existing.sizeBytes} vs crawled ${candidate.sizeBytes} (${repo} · ${candidate.path})`)
        }
        if (existing.source.repo !== repo || existing.source.path !== candidate.path) {
          reports.push(`sha ${candidate.sha256.slice(0, 12)}: new provenance ${repo} · ${candidate.path} — the shipped row keeps ${existing.source.repo} · ${existing.source.path}`)
        }
        continue
      }
      const row = {
        sha256: candidate.sha256,
        sizeBytes: candidate.sizeBytes,
        kind: candidate.kind,
        identity: candidate.identity,
        source: { repo, revision: result.revision, path: candidate.path },
        aliases: [basename(candidate.path)],
        addedAt: crawlDate,
      }
      rows.push(row)
      byShaMap.set(row.sha256, row)
    }
    for (const candidate of result.gaps) {
      const key = `${repo}|${candidate.path}`
      const existing = gaps.find((g) => `${g.repo}|${g.path}` === key)
      if (existing) {
        if (existing.sizeBytes !== undefined && existing.sizeBytes !== candidate.sizeBytes) {
          throw new Error(`gap contradiction for ${key}: shipped ${existing.sizeBytes} vs crawled ${candidate.sizeBytes}`)
        }
        continue
      }
      gaps.push({
        repo,
        revision: result.revision,
        path: candidate.path,
        ...(candidate.sizeBytes !== undefined ? { sizeBytes: candidate.sizeBytes } : {}),
        kind: candidate.kind,
        identity: candidate.identity,
        reason: candidate.reason,
        addedAt: crawlDate,
      })
      gapKeys.add(key)
    }
    // Vanished weights are REPORTED, never dropped from the registry.
    for (const prevRow of previous.rows ?? []) {
      if (prevRow.source?.repo === repo && !seenShas.has(prevRow.sha256)) {
        reports.push(`sha ${prevRow.sha256.slice(0, 12)} no longer visible at ${repo} · ${prevRow.source.path} — the shipped row is preserved (append-only)`)
      }
    }
  }

  const crawlSorted = [...crawl].sort((a, b) => (a.repo < b.repo ? -1 : 1))
  const envelope = {
    version: 1,
    generatedAt: crawlSorted.reduce((max, c) => (c.fetchedAt > max ? c.fetchedAt : max), ''),
    crawl: crawlSorted,
    gaps: gaps.sort(byGapKey),
    rows: rows.sort(bySha),
  }
  return { envelope, failures, reports }
}

/** Canonical serialization: fixed key order, sorted collections, 2-space
 *  JSON + trailing newline. Input key order must not matter. */
function serializeCatalog(envelope) {
  const doc = {
    version: 1,
    generatedAt: envelope.generatedAt,
    crawl: [...envelope.crawl]
      .sort((a, b) => (a.repo < b.repo ? -1 : 1))
      .map((c) => ({
        repo: c.repo,
        revision: c.revision,
        fetchedAt: c.fetchedAt,
        ...(typeof c.candidatesFingerprint === 'string' ? { candidatesFingerprint: c.candidatesFingerprint } : {}),
      })),
    gaps: [...envelope.gaps]
      .sort(byGapKey)
      .map((g) => ({
        repo: g.repo,
        revision: g.revision,
        path: g.path,
        ...(g.sizeBytes !== undefined ? { sizeBytes: g.sizeBytes } : {}),
        kind: g.kind,
        identity: { family: g.identity.family, artifact: g.identity.artifact, variant: g.identity.variant, quant: g.identity.quant, dtype: g.identity.dtype },
        reason: g.reason,
        addedAt: g.addedAt,
      })),
    rows: [...envelope.rows]
      .sort(bySha)
      .map((r) => ({
        sha256: r.sha256,
        sizeBytes: r.sizeBytes,
        kind: r.kind,
        identity: { family: r.identity.family, artifact: r.identity.artifact, variant: r.identity.variant, quant: r.identity.quant, dtype: r.identity.dtype },
        source: { repo: r.source.repo, revision: r.source.revision, path: r.source.path },
        aliases: [...r.aliases].sort(),
        addedAt: r.addedAt,
      })),
  }
  return `${JSON.stringify(doc, null, 2)}\n`
}

/* -------------------------------------------------------------------------
 * The network (anonymous only) and the run modes.
 * ------------------------------------------------------------------------- */

async function apiJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'monoka-hash-catalog-crawler (anonymous; task to7xpa7)' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.replace(API, '')}`)
  return res.json()
}

async function crawlRepo(entry) {
  const base = entry.dataset ? 'datasets' : 'models'
  try {
    const rev = (await apiJson(`${API}/${base}/${entry.repo}/revision/${entry.revision}`)).sha
    const trees = await apiJson(`${API}/${base}/${entry.repo}/tree/${rev}?recursive=true`)
    return { entry, ok: true, revision: rev, ...collectFromTrees(entry, trees) }
  } catch (error) {
    return { entry, ok: false, error: error.message }
  }
}

function crawlFromFixtures(entry, treesJson) {
  const fixture = treesJson[entry.repo]
  if (!fixture) return { entry, ok: false, error: 'no fixture recorded' }
  return { entry, ok: true, revision: fixture.resolvedRevision ?? entry.revision, ...collectFromTrees(entry, fixture.entries) }
}

function printReport({ envelope, failures, reports }, previous, wrote) {
  const prevRows = previous.rows?.length ?? 0
  const prevGaps = previous.gaps?.length ?? 0
  console.log(`rows: ${prevRows} → ${envelope.rows.length} (+${envelope.rows.length - prevRows})`)
  console.log(`gaps: ${prevGaps} → ${envelope.gaps.length} (+${envelope.gaps.length - prevGaps})`)
  console.log(`crawl block: ${envelope.crawl.length} repos, generatedAt ${envelope.generatedAt}`)
  for (const failure of failures) console.log(`FAILURE ${failure.repo}: ${failure.error}`)
  for (const report of reports) console.log(`note: ${report}`)
  console.log(wrote ? `wrote ${SHIPPED_PATH.pathname}` : 'wrote nothing')
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const fixturesAt = args.indexOf('--from-fixtures')
  const fixturesDir = fixturesAt >= 0 ? args[fixturesAt + 1] : null
  if (fixturesAt >= 0 && !fixturesDir) throw new Error('--from-fixtures requires a directory')

  assertAnonymous()
  const crawlDate = new Date().toISOString().slice(0, 10)
  const previous = existsSync(SHIPPED_PATH) ? JSON.parse(readFileSync(SHIPPED_PATH, 'utf8')) : EMPTY

  let results
  if (fixturesDir) {
    const treesJson = JSON.parse(readFileSync(`${fixturesDir}/trees.json`, 'utf8'))
    results = MANIFEST.map((entry) => crawlFromFixtures(entry, treesJson))
  } else {
    results = []
    for (const entry of MANIFEST) {
      process.stdout.write(`crawling ${entry.repo} … `)
      const result = await crawlRepo(entry)
      console.log(result.ok ? `${result.rows.length} rows, ${result.gaps.length} gaps, ${result.unclassified.length} unclassified @ ${result.revision.slice(0, 8)}` : `FAILED (${result.error})`)
      results.push(result)
    }
  }

  const out = buildEnvelope({ previous, results, crawlDate })
  printReport(out, previous, false)
  if (out.failures.length > 0) {
    console.error(`refusing to write: ${out.failures.length} repo(s) failed — the crawl block would be incomplete against the manifest`)
    process.exit(1)
  }
  if (dryRun) return
  writeFileSync(SHIPPED_PATH, serializeCatalog(out.envelope))
  printReport(out, previous, true)
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('crawl-hash-catalog.mjs')) {
  await main()
}

export { MANIFEST, assertAnonymous, buildEnvelope, classifyArtifact, collectFromTrees, isWeightPath, kindFor, manifestEntryFor, serializeCatalog }
