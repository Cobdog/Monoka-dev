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
 *    the `_w4a8_from_fp16` suffix), `bf16` (the `_bf16` suffix, or the
 *    publisher's checkpoint table — the MiniMaxAI README's BF16 column at
 *    the crawled pin), `fp8` (`_fp8_scaled`), `w6a8` (`_w6a8`),
 *    `nvfp4-awq` (`_nvfp4_awq`), `fp16`/`fp32` (`_fp16`/`_fp32`),
 *    `svd-r128` / `svd-r64` (SVD-reduced LoRA ranks — the `_r128`/`_r64`
 *    suffix), `rank32` (a rank-32 ADAPTER — the `_rank32` suffix), `full`
 *    (full-rank LoRA — only where a committed doc confirms it; the Krea 2
 *    identity-edit v1.2 line per docs/research/krea2-edit-mode.md, the
 *    Viggle r64/full-rank pair per the task-2 brief).
 *  - `variant` mirrors the publisher's own distinguishing tokens verbatim
 *    (hyphenated): `v1.2-r128`, `smhfacct-b25-49` (block range),
 *    `step1597`, `dmd-step-250+b-step-2000` (a sha shared by BOTH OpenVDN
 *    stages — the variant names the union), `v1.0-768p-comfyui`,
 *    `fl2va-original` / `fl2va-diffusers` (MiniMaxAI's own split — the
 *    original checkpoint partitions vs the diffusers-format top level),
 *    `pdd-fl2va-8step` (the alibaba-pai accelerator line, named by the
 *    downstream `_pdd_acc_8step` port tokens). `default` is the reserved
 *    token for a publisher file with NO distinguishing variant token.
 *  - `artifact` is the role in lowercase-hyphen form (identity-edit,
 *    turbo-3, turbo-4, turbo-8, vdn-linear-branch, hybrid, dit,
 *    text-encoder, vae, preview-decoder, video-vae, audio-vae,
 *    t1-image-vae, depth-encoder, fun-control-union, fused-turbo,
 *    anypaint-adapter, inpaint-edit, fl2va, ref2va, viggle, fixed-embed,
 *    effect-embed, pose-detector, pose-model, hed, mlsd); `family` is the
 *    model family (minimax-h3, krea-2, qwen-image, depth-anything). A NEW
 *    family requires the standing research-packet rule (CLAUDE.md → the
 *    freshness doctrine) before its first row lands — with the settled
 *    exemption (2026-10-20, task to7xpa7): `preprocessor` is a
 *    non-generative family (the pack-ckpt detector weights — pose, edge,
 *    line annotators), there is no prompting contract to packet, so the
 *    note itself is the packet.
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
    // T2 crawl widening: the earlier v1 / v1.1 lines follow the same
    // publisher convention — version from the underscored tokens, an
    // `_rN` suffix is the SVD rank, the un-suffixed line is full-rank.
    [/^krea2_identity_edit_v([\d_]+?)(_r(128|64))?\.safetensors$/, (m) => ['krea-2', 'identity-edit', `v${m[1].replaceAll('_', '.')}`, m[3] ? `svd-r${m[3]}` : 'full', 'unknown']],
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
    // T2 crawl widening: h3-base/ mirrors the OFFICIAL diffusers-format
    // weights one-to-one (sha-identical to MiniMaxAI/MiniMax-H3's top
    // level — those rows win the dedupe; these rules keep the walk
    // classifying and would make a future divergence visible). The bf16
    // tokens mirror the official checkpoint table (MiniMaxAI README).
    [/^h3-base\/transformer\//, () => ['minimax-h3', 'dit', 'fl2va-diffusers', 'bf16', 'bf16']],
    [/^h3-base\/vae\//, () => ['minimax-h3', 'video-vae', 'diffusers', 'bf16', 'bf16']],
    [/^h3-base\/audio_vae\//, () => ['minimax-h3', 'audio-vae', 'diffusers', 'bf16', 'bf16']],
  ],
  'smhfacct/Minimax-H3-fl2va-ref2va-hybrid-models': [
    // The spec §2 example row. New pre-merged hybrids from this repo get
    // their own smhfacct-<block-range> variant tokens, never a reuse.
    ['minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors', ['minimax-h3', 'hybrid', 'smhfacct-b25-49', 'int8', 'int8']],
    // T2 crawl widening: the block range is the publisher's convention.
    [/^minimax_h3_hybrid_fl2va_ref2va_b(\d+-\d+)-int8\.safetensors$/, (m) => ['minimax-h3', 'hybrid', `smhfacct-b${m[1]}`, 'int8', 'int8']],
  ],
  'Mamad8/MiniMax-H3-Image-VAE': [
    ['minimax_h3_t1_image_vae_step1597.safetensors', ['minimax-h3', 't1-image-vae', 'step1597', 'unknown', 'unknown']],
    // T2 crawl widening: future decode steps follow the same convention.
    [/^minimax_h3_t1_image_vae_step(\d+)\.safetensors$/, (m) => ['minimax-h3', 't1-image-vae', `step${m[1]}`, 'unknown', 'unknown']],
  ],
  'jacokon/fasth3-live': [
    ['minimax_h3_video_vae_w4a8_from_fp16.safetensors', ['minimax-h3', 'video-vae', 'w4a8-from-fp16', 'w4a8', 'w4a8']],
    // T2 crawl widening: the dense fl2va pruned int8-convrot checkpoint
    // (license-masked for anonymous reads — see the crawl's gap entries).
    ['minimax_h3_fl2va_fasth3_dense_pruned_int8_convrot.safetensors', ['minimax-h3', 'fl2va', 'fasth3-dense-pruned', 'int8-convrot', 'int8']],
  ],
  'MATLOWAI/minimax-h3-fused-turbo-int8-convrot': [
    ['minimax_h3_fused_refdelta_r1024_turbo8_mystic07_int8_convrot.safetensors', ['minimax-h3', 'fused-turbo', 'refdelta-r1024-turbo8-mystic07', 'int8-convrot', 'int8']],
  ],
  'Kijai/MiniMax-H3-TAE': [
    ['taeh3_decoder.safetensors', ['minimax-h3', 'preview-decoder', 'kijai-tae', 'unknown', 'unknown']],
    // T2 crawl widening: the PUBLISHER path at the repo is
    // `vae_approx/taeh3.safetensors` — the catalog's shipped row keeps the
    // engine-side ship name (the 2026-09-22 ruling), so both shapes classify.
    [/taeh3(_decoder)?\.safetensors$/, () => ['minimax-h3', 'preview-decoder', 'kijai-tae', 'unknown', 'unknown']],
  ],
  'lightx2v/Minimax-h3-Turbo': [
    // The publisher's naming convention generalizes — step count + version
    // ride the filename. (The simsim9 pack's same-named decoder is a
    // DIFFERENT repo and a different row: the byAlias hazard, never a
    // table merge.)
    [/minimax_h3_fl2v_turbo_(\d+)step_v([\d.]+)_768p_comfyui_bf16\.safetensors$/, (match) => ['minimax-h3', `turbo-${match[1]}`, `v${match[2]}-768p-comfyui`, 'bf16', 'bf16']],
    // T2 crawl widening: the full tree adds the ref2v line, non-768p
    // cuts, fp8, and the bare v0.1 (no resolution, no dtype token —
    // honestly unknown).
    [/^minimax_h3_(fl2v|ref2v)_turbo_(\d+)step_v([\d.]+)(_768p)?(_comfyui)?(_(bf16|fp8))?\.safetensors$/, (m) => ['minimax-h3', `turbo-${m[2]}`, `v${m[3]}${m[4] ?? ''}${m[5] ? '-comfyui' : ''}`, m[7] ?? 'unknown', m[7] ?? 'unknown']],
  ],

  // ---- MiniMax-H3: the official source + the turbo long tail (T2) --------
  'MiniMaxAI/MiniMax-H3': [
    // The official repo hosts the ORIGINAL checkpoints (FL2VA/, Ref2VA/)
    // and the diffusers format side by side (its own README's words, at
    // the crawled pin). All released checkpoints are BF16 per that
    // table, and the TE is Qwen3-VL-32B full pretrained weights — so
    // bf16 rides quant+dtype on every rule here; nothing is inferred
    // from filenames alone.
    [/^(FL2VA|Ref2VA)\/transformer\//, (m) => ['minimax-h3', 'dit', `${m[1].toLowerCase()}-original`, 'bf16', 'bf16']],
    [/^transformer_ref\//, () => ['minimax-h3', 'dit', 'ref2va-diffusers', 'bf16', 'bf16']],
    [/^transformer\//, () => ['minimax-h3', 'dit', 'fl2va-diffusers', 'bf16', 'bf16']],
    [/(^|\/)text_encoder\/model-\d+-of-\d+\.safetensors$/, () => ['minimax-h3', 'text-encoder', 'qwen3vl-32b', 'bf16', 'bf16']],
    [/^(FL2VA|Ref2VA)\/(audio|video)_vae\//, (m) => ['minimax-h3', `${m[2].toLowerCase()}-vae`, 'original', 'bf16', 'bf16']],
    [/^audio_vae\//, () => ['minimax-h3', 'audio-vae', 'diffusers', 'bf16', 'bf16']],
    [/^vae\//, () => ['minimax-h3', 'video-vae', 'diffusers', 'bf16', 'bf16']],
  ],
  'Comfy-Org/MiniMax-H3': [
    // The official Comfy repackaging: the full fl2va/ref2va quant matrix.
    // Artifact is the TASK LINE (fl2va/ref2va — the studio's own product
    // distinction); variant carries the prune state; quant/dtype come
    // from the trailing precision token.
    [/^diffusion_models\/minimax_h3_(fl2va|ref2va)_(pruned_)?(bf16|int8_convrot|fp8_scaled|w6a8)\.safetensors$/, (m) => {
      const [quant, dtype] = { bf16: ['bf16', 'bf16'], int8_convrot: ['int8-convrot', 'int8'], fp8_scaled: ['fp8', 'fp8'], w6a8: ['w6a8', 'w6a8'] }[m[3]]
      return ['minimax-h3', m[1], m[2] ? 'pruned' : 'full', quant, dtype]
    }],
    [/^embeddings\/minimaxh3_([a-z0-9_]+)\.safetensors$/, (m) => ['minimax-h3', 'effect-embed', m[1].replaceAll('_', '-'), 'unknown', 'unknown']],
    [/^loras\/minimax_h3_(fl2v|ref2v)_turbo_(\d+)step_v([\d.]+)(_768p)?_comfyui_bf16\.safetensors$/, (m) => ['minimax-h3', `turbo-${m[2]}`, `v${m[3]}${m[4] ?? ''}-comfyui`, 'bf16', 'bf16']],
    [/^model_patches\/minimax_h3_fun_controlnet_union_(2\.0_)?(pruned_)?(bf16|int8_convrot)\.safetensors$/, (m) => {
      const [quant, dtype] = { bf16: ['bf16', 'bf16'], int8_convrot: ['int8-convrot', 'int8'] }[m[3]]
      return ['minimax-h3', 'fun-control-union', `${m[1] ? '2.0' : '1.0'}${m[2] ? '-pruned' : ''}`, quant, dtype]
    }],
    [/^text_encoders\/qwen3vl_32b_minimax_h3_(bf16|int8_convrot|nvfp4_awq)\.safetensors$/, (m) => {
      const [quant, dtype] = { bf16: ['bf16', 'bf16'], int8_convrot: ['int8-convrot', 'int8'], nvfp4_awq: ['nvfp4-awq', 'nvfp4'] }[m[1]]
      return ['minimax-h3', 'text-encoder', 'qwen3vl-32b', quant, dtype]
    }],
    [/^vae\/minimax_h3_(audio_vae_fp32|video_vae_fp16|video_vae_int8_convrot)\.safetensors$/, (m) => ({
      audio_vae_fp32: ['minimax-h3', 'audio-vae', 'default', 'fp32', 'fp32'],
      video_vae_fp16: ['minimax-h3', 'video-vae', 'default', 'fp16', 'fp16'],
      video_vae_int8_convrot: ['minimax-h3', 'video-vae', 'default', 'int8-convrot', 'int8'],
    }[m[1]])],
  ],
  'Viggle/Viggle-Animate': [
    // The official Viggle-Animate release: H3-based animation checkpoints
    // (bf16 shards per the task-2 brief), its DMD LoRA, and the fixed
    // conditioning embed the nodes consume.
    [/^transformer\//, () => ['minimax-h3', 'viggle', 'official', 'bf16', 'bf16']],
    [/^lora\/pytorch_lora_weights\.safetensors$/, () => ['minimax-h3', 'viggle', 'dmd', 'unknown', 'unknown']],
    [/^assets\/fixed_embed_fwd_anyframe\.pt$/, () => ['minimax-h3', 'fixed-embed', 'fwd-anyframe', 'unknown', 'unknown']],
  ],
  'drbaph/Viggle-Animate-ComfyUI': [
    // The ComfyUI port: ref2va-viggle quants, the DMD LoRA pair
    // (full-rank + r64 per the task-2 brief), the conditioning embed.
    [/^diffusion_models\/minimax_h3_ref2va_viggle_(bf16|int8_convrot|pruned_int8_convrot)\.safetensors$/, (m) => {
      const [quant, dtype] = { bf16: ['bf16', 'bf16'], int8_convrot: ['int8-convrot', 'int8'], pruned_int8_convrot: ['int8-convrot', 'int8'] }[m[1]]
      return ['minimax-h3', 'viggle', 'ref2va', quant, dtype]
    }],
    [/^loras\/viggle_animate_dmd_lora\.safetensors$/, () => ['minimax-h3', 'viggle', 'dmd', 'full', 'unknown']],
    [/^loras\/viggle_animate_dmd_lora_r64\.safetensors$/, () => ['minimax-h3', 'viggle', 'dmd', 'svd-r64', 'unknown']],
    [/^text_cond\/fixed_embed_fwd_anyframe\.safetensors$/, () => ['minimax-h3', 'fixed-embed', 'fwd-anyframe', 'unknown', 'unknown']],
  ],
  'drbaph/MiniMax-H3-Turbo-Lora-ComfyUI': [
    // The community turbo long tail: experimental drops, the hyperflow
    // line, rank-reduced re-publishes of the lightx2v lines (classified
    // as their SOURCE line + the resize token), the ckpt/ema 4-step
    // family, and the v4-step600 pair (the registry's larryvrh-v4-8
    // pairing, pruned here).
    ['experimental/minimax_h3_taomate_fl2va_3step_ema_comfyui.safetensors', ['minimax-h3', 'turbo-3', 'taomate-fl2va-3step-ema', 'unknown', 'unknown']],
    [/^experimental\/minimax_h3_dmd_(\d+)step_turbo\.safetensors$/, (m) => ['minimax-h3', `turbo-${m[1]}`, 'dmd', 'unknown', 'unknown']],
    [/^experimental\/minimax_h3_dmd_(fl2va|ref2va)_(\d+)step_turbo_pruned\.safetensors$/, (m) => ['minimax-h3', `turbo-${m[2]}`, `dmd-${m[1].toLowerCase()}-pruned`, 'unknown', 'unknown']],
    [/^minimax_h3_hyperflow_8step_v1\.0_comfyui(_pruned)?(_bf16)?(_resized_avg_rank_(\d+))?_bf16\.safetensors$/, (m) => ['minimax-h3', 'turbo-8', `hyperflow-v1.0-comfyui${m[1] ? '-pruned' : ''}${m[4] ? `-resized-avg-rank-${m[4]}` : ''}`, 'bf16', 'bf16']],
    [/^minimax_h3_(fl2v|ref2v)_turbo_(\d+)step_v([\d.]+)(_768p)?(_sla)?_comfyui_resized_avg_rank_(\d+)_bf16\.safetensors$/, (m) => ['minimax-h3', `turbo-${m[2]}`, `v${m[3]}${m[4] ?? ''}${m[5] ? '-sla' : ''}-comfyui-resized-avg-rank-${m[6]}`, 'bf16', 'bf16']],
    [/^minimax_h3_turbo_4step(_ema)?(_ckpt(500|850))?_pruned_comfyui\.safetensors$/, (m) => ['minimax-h3', 'turbo-4', `${[m[1] ? 'ema' : '', m[3] ? `ckpt${m[3]}` : '', 'pruned'].filter(Boolean).join('-')}`, 'unknown', 'unknown']],
    [/^minimax_h3_turbo_v4_step600(_ema)?_pruned_comfyui\.safetensors$/, (m) => ['minimax-h3', 'turbo-8', `v4-step600${m[1] ? '-ema' : ''}-pruned`, 'unknown', 'unknown']],
  ],
  'alibaba-pai/MiniMax-H3-Acc-LoRAs': [
    // The accelerator (pdd) 8-step lines — the registry's pdd-fl2va-8 /
    // pdd-ref2va-8 families.
    [/^MiniMax-H3-(FL2VA|Ref2VA)-Acc-8Step\.safetensors$/, (m) => ['minimax-h3', 'turbo-8', `pdd-${m[1].toLowerCase()}-8step`, 'unknown', 'unknown']],
  ],
  'aptech0081/MiniMax-H3-Acc-LoRAs-ComfyUI': [
    // The Comfy repackaged pdd LoRAs, plus the BAKED full checkpoints
    // (the LoRA merged into the ref2va DiT — they land in
    // diffusion_models, not loras).
    [/^minimax_h3_(fl2va|ref2va)_pdd_acc_8step_comfyui\.safetensors$/, (m) => ['minimax-h3', 'turbo-8', `pdd-${m[1]}-8step-comfyui`, 'unknown', 'unknown']],
    [/^minimax_h3_(fl2va|ref2va)_(pruned_)?pdd_acc_8step_baked_(with|without)_heads_int8_convrot\.safetensors$/, (m) => ['minimax-h3', m[1], `pdd-acc-8step-baked-${m[4]}-heads${m[2] ? '-pruned' : ''}`, 'int8-convrot', 'int8']],
  ],
  'larryvrh/MiniMax-H3-Turbo-Lora': [
    // The 4-step ckpt/ema family and the v4-step600 pair (the registry's
    // larryvrh-v4-8 family). The repo's experimental*.bin training
    // checkpoints are excluded by the crawl manifest's include filter —
    // training-attic, not shipping weights.
    [/^minimax_h3_turbo_4step(_ema)?(_ckpt(500|850))?\.safetensors$/, (m) => ['minimax-h3', 'turbo-4', [m[1] ? 'ema' : '', m[3] ? `ckpt${m[3]}` : ''].filter(Boolean).join('-') || 'default', 'unknown', 'unknown']],
    [/^minimax_h3_turbo_v4_step600(_ema)?\.safetensors$/, (m) => ['minimax-h3', 'turbo-8', `v4-step600${m[1] ? '-ema' : ''}`, 'unknown', 'unknown']],
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
    // T2 crawl widening: the bf16 dit, the qwen3.5-9b pe i2i/t2i encoder
    // pair, and the 8b encoder's bf16/w4a8 cuts.
    [/qwen_image_([\d.]+)_bf16\.safetensors$/, (match) => ['qwen-image', 'dit', match[1], 'bf16', 'bf16']],
    [/qwen3\.5_9b_qwen_image_2\.1_pe_(i2i|t2i)\.int8_convrot\.safetensors$/, (match) => ['qwen-image', 'text-encoder', `qwen3.5-9b-pe-${match[1]}-2.1`, 'int8-convrot', 'int8']],
    [/qwen3vl_([\d.]+b)_(bf16|w4a8)\.safetensors$/i, (match) => {
      const cut = match[2].toLowerCase() === 'bf16' ? ['bf16', 'bf16'] : ['w4a8', 'w4a8']
      return ['qwen-image', 'text-encoder', `qwen3vl-${match[1].toLowerCase()}-2.1`, cut[0], cut[1]]
    }],
  ],

  // ---- Preprocessors ------------------------------------------------------
  'Comfy-Org/Depth-Anything-3': [
    ['depth_anything_3_base.safetensors', ['depth-anything', 'depth-encoder', '3-base', 'unknown', 'unknown']],
    // T2 crawl widening: the other official cuts follow the same naming.
    [/depth_anything_3_(base|small|metric_large|mono_large)\.safetensors$/, (match) => ['depth-anything', 'depth-encoder', `3-${match[1]}`, 'unknown', 'unknown']],
  ],
  // T2 crawl widening: the pack-ckpt detector repos (the crawl manifest
  // narrows each to exactly the files the fetch catalog ships). Family
  // `preprocessor` per the header's settled exemption.
  'yzd-v/DWPose': [
    ['yolox_l.onnx', ['preprocessor', 'pose-detector', 'yolox-l', 'unknown', 'unknown']],
    ['dw-ll_ucoco_384.onnx', ['preprocessor', 'pose-model', 'dw-ll-ucoco-384', 'unknown', 'unknown']],
  ],
  'hr16/DWPose-TorchScript-BatchSize5': [
    ['dw-ll_ucoco_384_bs5.torchscript.pt', ['preprocessor', 'pose-model', 'dw-ll-ucoco-384-bs5', 'unknown', 'unknown']],
  ],
  'lllyasviel/Annotators': [
    ['ControlNetHED.pth', ['preprocessor', 'hed', 'controlnet', 'unknown', 'unknown']],
    ['mlsd_large_512_fp32.pth', ['preprocessor', 'mlsd', 'large-512', 'fp32', 'fp32']],
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
