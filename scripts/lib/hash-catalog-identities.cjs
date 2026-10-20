'use strict'
/**
 * The hash catalog's identity classification table (task to7xpa7) — the
 * per-repo rules that turn a crawled (repo, path, sha) into the catalog
 * row's identity tuple. The catalog-build wave's Task 2 crawler
 * (`scripts/crawl-hash-catalog.mjs`) EXTENDS this table; tests/hashcatalog.
 * test.js test (3) cross-checks the shipped `server/hashCatalog.json`
 * against it, so table and artifact cannot drift apart silently.
 *
 * Tuple order (the spec §2 identity): [family, artifact, variant, quant,
 * dtype].
 *
 * Conventions (authored 2026-10-20 — extend, never re-litigate):
 *  - `unknown` is an HONEST value wherever no in-repo evidence exists — a
 *    field either earns its token from the publisher's own naming or from a
 *    committed research doc, or it stays unknown. No plausible defaults.
 *  - quant/dtype evidence tokens seen so far: `int8` (plain int8 quant),
 *    `int8-convrot` (ComfyUI's conv-rotated int8 convention — the
 *    `_int8_convrot` filename suffix), `w4a8` (weights-4/activations-8 —
 *    the `_w4a8_from_fp16` suffix), `bf16` (the `_bf16` suffix),
 *    `svd-r128` / `svd-r64` (SVD-reduced LoRA ranks — the `_r128`/`_r64`
 *    suffix), `rank32` (a rank-32 ADAPTER — the `_rank32` suffix), `full`
 *    (full-rank LoRA — only where a committed doc confirms it; the Krea 2
 *    identity-edit v1.2 line per docs/research/krea2-edit-mode.md).
 *  - `variant` mirrors the publisher's own distinguishing tokens verbatim
 *    (hyphenated): `v1.2-r128`, `smhfacct-b25-49` (block range),
 *    `step1597`, `dmd-step-250+b-step-2000` (a sha shared by BOTH OpenVDN
 *    stages — the variant names the union), `v1.0-768p-comfyui`.
 *  - `artifact` is the role in lowercase-hyphen form (identity-edit,
 *    turbo-8, vdn-linear-branch, hybrid, dit, text-encoder, vae,
 *    preview-decoder, video-vae, t1-image-vae, depth-encoder,
 *    fun-control-union, fused-turbo, anypaint-adapter, inpaint-edit);
 *    `family` is the model family (minimax-h3, krea-2, qwen-image,
 *    depth-anything). A NEW family requires the standing research-packet
 *    rule (CLAUDE.md → the freshness doctrine) before its first row lands.
 *  - Rule shape, per repo (first match wins — order static rows
 *    most-specific-first): a `[pathSuffix, tuple]` static row (suffix
 *    matched with endsWith, so it may be a basename or a deeper path —
 *    the VDN adapter rows disambiguate default vs turbo by their
 *    `adapters/…` path segment), or a `[RegExp, (match) => tuple]`
 *    pattern row for a publisher naming CONVENTION (the lightx2v turbo
 *    line, the `_int8_convrot` convention) — the crawler's widening cases.
 *  - A crawled row that classify() cannot place is a REVIEW event (extend
 *    this table consciously), never a default identity. Same publisher
 *    basename + different bytes = different rows, different variant tokens.
 */

const TABLE = {
  // ---- Krea 2 edit lane ---------------------------------------------------
  'conradlocke/krea2-identity-edit': [
    ['krea2_identity_edit_v1_2_r128.safetensors', ['krea-2', 'identity-edit', 'v1.2-r128', 'svd-r128', 'unknown']],
    ['krea2_identity_edit_v1_2_r64.safetensors', ['krea-2', 'identity-edit', 'v1.2-r64', 'svd-r64', 'unknown']],
    ['krea2_identity_edit_v1_2.safetensors', ['krea-2', 'identity-edit', 'v1.2', 'full', 'unknown']],
  ],
  'yijunwang2/krea2-anypaint': [
    ['krea2_anypaint_rank32.safetensors', ['krea-2', 'anypaint-adapter', 'rank32', 'rank32', 'unknown']],
  ],
  'Cierpliwy/krea2-inpaint-edit': [
    ['krea2_inpaint_edit_strong.safetensors', ['krea-2', 'inpaint-edit', 'strong', 'full', 'unknown']],
    ['krea2_inpaint_edit_mild.safetensors', ['krea-2', 'inpaint-edit', 'mild', 'full', 'unknown']],
    ['krea2_inpaint_edit.safetensors', ['krea-2', 'inpaint-edit', 'default', 'full', 'unknown']],
  ],

  // ---- MiniMax-H3 lanes ---------------------------------------------------
  'alibaba-pai/MiniMax-H3-Fun-Controlnet-Union': [
    ['MiniMax-H3-Fun-Controlnet-Union.safetensors', ['minimax-h3', 'fun-control-union', 'union', 'unknown', 'unknown']],
  ],
  'OpenVDN/vdn-minimax-h3': [
    // Path-suffix rules: the two stages ship the SAME shas under
    // stage-prefixed paths, and default/turbo adapters share a basename —
    // only the `adapters/…` path segment tells them apart.
    ['adapters/turbo/adapter_model.safetensors', ['minimax-h3', 'vdn-adapter-turbo', 'dmd-step-250', 'unknown', 'unknown']],
    ['adapters/default/adapter_model.safetensors', ['minimax-h3', 'vdn-adapter-default', 'dmd-step-250+b-step-2000', 'unknown', 'unknown']],
    ['linear_branch/model.safetensors', ['minimax-h3', 'vdn-linear-branch', 'dmd-step-250+b-step-2000', 'unknown', 'unknown']],
  ],
  'smhfacct/Minimax-H3-fl2va-ref2va-hybrid-models': [
    // The spec §2 example row. New pre-merged hybrids from this repo get
    // their own smhfacct-<block-range> variant tokens, never a reuse.
    ['minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors', ['minimax-h3', 'hybrid', 'smhfacct-b25-49', 'int8', 'int8']],
  ],
  'Mamad8/MiniMax-H3-Image-VAE': [
    ['minimax_h3_t1_image_vae_step1597.safetensors', ['minimax-h3', 't1-image-vae', 'step1597', 'unknown', 'unknown']],
  ],
  'jacokon/fasth3-live': [
    ['minimax_h3_video_vae_w4a8_from_fp16.safetensors', ['minimax-h3', 'video-vae', 'w4a8-from-fp16', 'w4a8', 'w4a8']],
  ],
  'MATLOWAI/minimax-h3-fused-turbo-int8-convrot': [
    ['minimax_h3_fused_refdelta_r1024_turbo8_mystic07_int8_convrot.safetensors', ['minimax-h3', 'fused-turbo', 'refdelta-r1024-turbo8-mystic07', 'int8-convrot', 'int8']],
  ],
  'Kijai/MiniMax-H3-TAE': [
    ['taeh3_decoder.safetensors', ['minimax-h3', 'preview-decoder', 'kijai-tae', 'unknown', 'unknown']],
  ],
  'lightx2v/Minimax-h3-Turbo': [
    // The publisher's naming convention generalizes — step count + version
    // ride the filename. (The simsim9 pack's same-named decoder is a
    // DIFFERENT repo and a different row: the byAlias hazard, never a
    // table merge.)
    [/minimax_h3_fl2v_turbo_(\d+)step_v([\d.]+)_768p_comfyui_bf16\.safetensors$/, (match) => ['minimax-h3', `turbo-${match[1]}`, `v${match[2]}-768p-comfyui`, 'bf16', 'bf16']],
  ],

  // ---- Qwen Image 2.1 lane ------------------------------------------------
  'Comfy-Org/Qwen-Image-2.1': [
    // The official Comfy-Org int8-convrot trio — the `_int8_convrot`
    // suffix is the convention token for this repo's quant+dtype.
    // Patterns are basename conventions: NOT ^-anchored (the repo lays its
    // files under diffusion_models/ etc.), $-anchored for specificity.
    [/qwen_image_([\d.]+)_int8_convrot\.safetensors$/, (match) => ['qwen-image', 'dit', match[1], 'int8-convrot', 'int8']],
    [/qwen3vl_([\d.]+b)_int8_convrot\.safetensors$/i, (match) => ['qwen-image', 'text-encoder', `qwen3vl-${match[1].toLowerCase()}-2.1`, 'int8-convrot', 'int8']],
    [/qwen_image_([\d.]+)_vae_bf16\.safetensors$/, (match) => ['qwen-image', 'vae', `${match[1]}-64ch-rgba`, 'bf16', 'bf16']],
  ],

  // ---- Preprocessors ------------------------------------------------------
  'Comfy-Org/Depth-Anything-3': [
    ['depth_anything_3_base.safetensors', ['depth-anything', 'depth-encoder', '3-base', 'unknown', 'unknown']],
  ],
}

/** Classify a crawled artifact: `repo` is the source repo (Hugging Face
 *  `owner/name` or a git URL — the table keys on the repo string as the
 *  fetch catalog's `source.repo` writes it), `filePath` the repo-relative
 *  publisher path. Returns the identity tuple, or null for a TABLE MISS —
 *  and a miss is a REVIEW event (extend the table), never a default. */
function classify(repo, filePath) {
  const rules = TABLE[repo]
  if (!rules) return null
  for (const [matcher, resolve] of rules) {
    if (typeof matcher === 'string') {
      if (filePath.endsWith(matcher)) return resolve.slice()
    } else {
      const match = filePath.match(matcher)
      if (match) return resolve(match).slice()
    }
  }
  return null
}

module.exports = { TABLE, classify }
