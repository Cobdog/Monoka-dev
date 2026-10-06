# Block-sparse attention on SM86 (RTX 3090) — feasibility for Veda + H3

> Research subtask of the attention-steering line (parent: [attention-steering-research-note.md](attention-steering-research-note.md) §5, task rm2mjlp lineage). 2026-10-05.
> Question: Veda's sparse kernel is FA4 CuTe block-sparse, CC 8.9+ — is our 3090 (SM86) locked out, or is there a path?
>
> **METHOD**: code-read (Miowtion repo: README, `docs/features/veda_kernel.md`, `docs/INDEX.md`, `miowtion/kernels/fa4_sm8x/{__init__,interface}.py` fetched raw; flash-attention repo: tree, `setup.py`, `flash_api.cpp`, `flash_blocksparse_attn_interface.py`; SpargeAttn `setup.py`/README; Sparse_SageAttention_API README; SageAttention README/`setup.py`; FastVideo README; PyTorch `aten/src/ATen/native/transformers/attention.cpp`) + local-code-read (`scoped_sage_triton.py`, h3-packet) + README-assessed (HF checkpoint card via the steering note). **Nothing was measured** — no GPU touched. Every performance number below is Miowtion's (RTX 4090 / RTX PRO 6000) or a vendor claim; SM86 sparse performance is publicly unverified anywhere.

## TL;DR

The SM86 wall is **softer than Veda's deployment docs imply — because Miowtion already demolished it**. Their vendored `fa4_sm8x` patch is written for "the SM80 family (**sm80 / sm86 / sm89**) and SM120" (their own docstring), gated by GPU **major** arch (8 or 12), not by minor. It is GPU-verified on SM89 (4090, fwd+bwd) and SM120; SM86 is architecturally in-scope (same SM80 kernel family, same 99 KB smem/CTA, bf16 path, no sm89-only instructions) but **not regression-tested by them** — they just don't own a 3090. The verification is one bench script away, and their bench carries a built-in silent-dense detector. If the FA4 patch misbehaves on SM86, two sm86-safe fallbacks exist today: **FlexAttention** (Triton, torch-native, measured by Miowtion at 0.91–0.97 of the patched-FA4 efficiency) and **SpargeAttn** (`SUPPORTED_ARCHS` explicitly contains `"8.6"`). We are **not stuck in research territory**: a real path to Veda's speedup exists this week.

## Q1 — Existing block-sparse kernels that can run on SM86

| Kernel | SM86? | Mask format (Veda-fit) | Perf vs dense (measured) |
|---|---|---|---|
| **FA4 CuTe + Miowtion `fa4_sm8x` patch** | **In-scope, unverified** [DOC] | `DenseBlockMaskTorch` `[B\|1, H\|1, M, N]` uint8 (0 skip / 1 full / 2 partial) — their wrapper builds it from Veda's `dense_block_mask` natively [DOC] | 4090, 8 heads, d=128, 90% sparsity, fresh mask/call: **0.70 ms @16k vs SDPA-dense 7.25 ms; 2.70 @32k vs 26.9** (efficiency 0.97/1.00) [DOC] |
| **FlexAttention** (torch ≥2.5, Triton JIT) | Yes [DOC — Triton JIT; present in our venv: torch 2.12.1+cu130, triton 3.7.1] | `BlockMask` via `mask_mod`/`create_block_mask`; per-head masks supported | 4090 same conditions: 0.81 ms @16k (eff 0.91), 2.87–2.90 @32k (eff 0.94–0.97) **steady-state**; with per-call BlockMask construction 2.18/4.34 ms [DOC — Miowtion bench] |
| **SpargeAttn** `block_sparse_sage2_attn_cuda` (thu-ml, ICML'25) | **Yes — `"8.6"` in `SUPPORTED_ARCHS`** [DOC setup.py]; CUDA ≥12.0 for Ampere [DOC] | `mask_id (B, H, ⌈S/128⌉, ⌈S/64⌉)` 0/1, per-head, any pattern — Veda's 128-token blocks split 2:1 into 64-cols, trivial upsample | Quantized (Sage2) + sparse; README perf table exists in figs; paper-claimed e2e gains [COMM]; no public Ampere numbers [UNK] |
| **Sparse SageAttention1 API** (jt-zhang, Triton) | Yes (Triton) [DOC] | same-shaped `mask_id`, block (128,64), per-head | Benchmarked vs flex/FA2 in README figs (4090/5090) [DOC-fig]; officially superseded by SpargeAttn [DOC] |
| **FastVideo Triton VSA** (hao-ai-lab; arXiv 2505.13389) | Yes (Triton) [DOC] | Structural (sliding-window + delta), not predictor masks | 4090, Miowtion's bench with arbitrary patterns: 0.99 ms @16k (eff 0.74), 3.89 @32k (0.70) [DOC — Miowtion bench] |
| FA2 `flash_attn.blocksparse` | **No — dead code** | — | See Q2 |
| xformers | No current arbitrary block-sparse op (block-diagonal/causal masks only; historical Triton blocksparse long removed) [COMM] | — | — |

Notes:
- The Miowtion 4090 numbers are the load-bearing ones: at 90% sparsity the patched FA4 path is **~10× faster than SDPA-dense at kernel level**, and flex gets ~90% of that. Their SM120 run (RTX PRO 6000, 56 heads, real H3 geometry) hit **MFU 70–74%** at 16–32k tokens — the sparse skip converts to time almost losslessly across densities 0.05–0.2 [DOC].
- Bonus ecosystem: **FastH3** (FastVideo, 2026-09-15) — an 8-step DMD2 checkpoint distilled *from MiniMax-H3* with **80% VSA** baked in [DOC]. A second, structural (non-predictor) sparse-H3 line; orthogonal to Veda but relevant if we ever want sparse without the predictor.

## Q2 — The FA2 block-sparse path: present but dead

- The files exist in `Dao-AILab/flash-attention` main: `flash_attn/flash_blocksparse_attention.py` and `flash_attn/flash_blocksparse_attn_interface.py` [DOC — repo tree]. API: `flash_blocksparse_attn_func(packed_qkv, cu_seqlens, 0/1 blockmask, ...)` calling `flash_attn_cuda.fwd_block` [DOC — code read].
- **But the CUDA backing is gone from the current repo**: `csrc/flash_attn/blocksparse` does not exist (API 404), `csrc/flash_attn/flash_api.cpp` (1,542 lines) contains **zero** `fwd_block`/`blocksparse` exports, and `setup.py`'s extension source list is dense sm80 kernels only [DOC]. The Python shim is FA1-era residue that cannot run on any modern build.
- Maintenance: issue #77 (2022-11, open) — dense-kernel perf work never backported to blocksparse; #196 (2023-04, open) — requirements questions unanswered; #1784 (open) — "feat: blocksparse support" never landed for FA2 [DOC — issues].
- Could Veda masks feed it? Format-wise a 0/1 block mask is close (H3 is bidirectional; the mask converter `asserts not causal`, which suits us), but it is **binary only** (no partial tiles — Veda has edge tiles), reportedly wants fixed small block shapes (~16×256 per #196 [COMM]), and takes packed-qkv varlen only. Performance on a 3090 today: no measurements exist [UNK]; FA1-era A100 claims were near-linear in sparsity.
- **Verdict**: resurrecting a pre-FA2 checkout for this is strictly worse than every Q1 option. Upstream abandoned it correctly; so should we.

## Q3 — SageAttention compatibility

- Core SageAttention (thu-ml/SageAttention) has **no block-sparse mode itself**, but it is explicitly an Ampere citizen: "Optimized kernels for Ampere, Ada and Hopper GPUs" [DOC README]; SageAttention 2.0.0 beta "measured speedup on … **RTX 3090** and RTX 4090" (news 2024-11-21) [DOC]; `setup.py SUPPORTED_ARCHS = {"8.0", "8.6", "8.9", "9.0", "10.0", "12.0", "12.1"}` with a dedicated `8.6` branch [DOC]; CUDA ≥12.0 for Ampere [DOC].
- The sparse question is answered by the same team as shipped product: SageAttention's README (2025-06-19) officially points to **Sparse SageAttention1 API** (`jt-zhang/Sparse_SageAttention_API`, Triton) and **Sparse SageAttention2 API** (`thu-ml/SpargeAttn`, CUDA) — "can compute attention with any block sparse pattern very fast" [DOC]. So "does Sage plan block-sparse" → it shipped, as SpargeAttn.
- Veda-mask integration: `block_sparse_sage2_attn_cuda(q, k, v, mask_id)` takes per-head 0/1 blocks of 128×64 — a mechanical 2× column upsample of Veda's `dense_block_mask` (partial tiles become keep-or-drop policy).
- Caveats: (a) Sage quantization (INT8 QK / reduced-precision PV) stacks error on top of 90% sparsity — a **confound for steering research** where we need the predictor's readout to be trustworthy; (b) Miowtion's own kernel todo lists "FP8 sparse" as *future* work, explicitly referencing SageAttention/SpargeAttn quantization styles [DOC] — i.e., the Veda stack itself hasn't fused quantization yet.
- Our stack already runs Sage-adjacent machinery: the H3 packet's speed-stack lore (~2× attention) [COMM], and locally `custom_nodes/comfyui-minimax-h3-audio-T8/h3_t8/scoped_sage_triton.py` wraps the installed Sage Triton JIT with an **attn_mask adapter** (natural-log→log2 bias conversion, two-stage launch for smem limits) [DOC — local code read]. That adapter is precisely the dense-with-bias hook Q5 needs.

## Q4 — The Triton route

Triton compiles for any supported compute capability including sm86, so every Triton kernel above is architecture-portable by construction. State of the art:

1. **FlexAttention** — the flagship Triton block-sparse path (BlockMask, `mask_mod`/`score_mod`, block-level skipping). Miowtion measured it at 0.91–0.97 efficiency vs the ideal on 4090 [DOC]. Costs: BlockMask *construction* (~1.4–1.8 ms at 16k on 4090 when the pattern changes per call — Veda's does, per layer/step/head [DOC]); dense-flex perf on Ampere has no official numbers (PyTorch's ~90%-of-FA2 claim is H100 [DOC — flex blog]; open issue #149767 collects slower-than-handwritten cases [COMM]).
2. **SpargeAttn's Triton kernel example** (2025-07) [DOC news] — quantized+sparse Triton reference.
3. **FastVideo VSA** — Triton, video-specific structural sparsity; 0.70–0.74 efficiency in Miowtion's bench [DOC].
4. Historical: Triton's own block-sparse tutorials were removed from the repo years ago [COMM] — the torch-native flex path superseded them.

Writing our own SM86-tuned Triton kernel for Veda masks is **not needed this week** — three existing kernels accept arbitrary per-head masks. A custom kernel becomes justified only if (a) flex's per-call BlockMask build tax or (b) SpargeAttn's quantization error actually bite; the design reference for a from-scratch attempt is Miowtion's `DenseBlockMask` trick (CTA-row bitmasks in smem via ballot, no argsort/index lists) [DOC].

## Q5 — The fallback: predictor output as dense-attention bias

What it costs to run the block-importance map as an attention *bias* on a dense path:

- **The naive route is catastrophic, not negligible**: on CUDA, SDPA's flash backend takes **no attn_mask at all** (torch source: the flash call site passes only q/k/v/dropout/is_causal/scale — `aten/src/ATen/native/transformers/attention.cpp`) [DOC]. A materialized mask forces the mem-efficient or math backend; math materializes S². At H3 scale (S≈38k, H=56, bf16) a dense per-head bias is 38k×38k×56×2 B ≈ **162 GB — impossible on 24 GB**. FA2 core likewise accepts only ALiBi slopes as bias [DOC README]; its Triton bias variant wants a dense bias tensor — same wall.
- **The fused route is ~free**: bias arithmetic is S² adds against 4·S²·D matmul flops → ~**0.2% of the attention FLOPs** at D=128 (computed). The real cost is *which dense kernel* absorbs the mask: FlexAttention `score_mod` with a block-indexed bias lookup (dense FLOPs, bias from a tiny `[H, n_q_blocks, n_kv_blocks]` table — kilobytes), or the Sage Triton JIT's `attn_mask` path — **already implemented in our tree** (`scoped_sage_triton.py`), where Sage's ~2× quantized dense speed plausibly pays for the flex-class slowdown [DOC local + COMM].
- **Steering needs even less**: the hypothesis is about video-token→prefix binding; a bias restricted to the prefix-column slice is `[S_v × S_prefix]` — as a block table, trivially small.
- Verdict: **dense-with-bias ≈ pure dense (±5%) when fused in a Triton/Sage kernel; OOM/hours if forced through SDPA math.** The steering instrument costs essentially nothing — it just must not be routed through a materialized `attn_mask`.

## Q6 — Ranking and recommendation

| # | Option | (a) Effort this week | (b) Perf gain | (c) Steering-research value |
|---|---|---|---|---|
| 1 | **Miowtion stack on the 3090** (`fa4_sm8x`; flex fallback inside the same pluggable attention) | M — venv + pinned flash-attn-4 4.0.0b32 + weights arrange + their bench | Kernel-level ~10× vs dense at 90% sparsity (4090-measured); e2e 3.1× on 4090 @14.4 s clip [DOC]; 3090 e2e estimate 1.5–2.5× [SPEC — streaming-bound step time dilutes attention wins] | Full: predictor + masks + heatmaps all exercise |
| 2 | **FlexAttention** (standalone or as Miowtion's fallback arm) | S — torch-native, already in our venv | ~0.9× of option 1's kernel speed; sm86-safe by construction | Full (same masks, slower) |
| 3 | SpargeAttn `block_sparse_sage2` | S–M | Quant+sparse stacked speedup [COMM] | Reduced — quantization confounds the readout |
| 4 | FastH3/VSA distilled ckpts | M (different ecosystem, no predictor) | 80% structural VSA, distilled | None for Veda (no predictor) |
| 5 | FA2 blocksparse resurrection | L | [UNK] | — |
| 6 | **Dense-with-bias** (scoped Sage mask / flex score_mod) | XS — adapter exists locally | None (dense cost) | The instrument itself; ~free overhead |

**Recommendation — two tracks, starting immediately:**

- **Track A (speed verdict, day 1)**: stand up Miowtion in a uv venv (`[dev,gpu]`, flash-attn-4 **4.0.0b32** — the patch hash-pins that exact version), fetch the 263 MB predictor, and run `scripts/bench_sparse_attention.py` on an idle 3090. That single script answers the SM86 question for *both* the patched FA4 path and flex, and it cross-checks every kernel against an fp32 reference specifically to catch silent-dense fallback [DOC]. Then `pytest tests/gpu -m gpu`. If green: `scripts/generate.py --attention dense veda` for the e2e side-by-side (their tooling emits titled comparison videos + timing).
- **Track B (steering instrument, parallel, dense)**: predictor block-heat readout (Miowtion's `veda` module already has the fused Triton heatmap kernel and dense-LSE teacher heat [DOC]) + bias through the local scoped-Sage mask adapter. No sparse kernel required; overhead ≈ noise.
- **If `fa4_sm8x` fails to compile/run on sm86** (register pressure was tuned on 4090; sm86 has identical smem/CTA and register file, so the risk is low but real): fall back to the flex arm *inside Miowtion* — already measured by them at 0.91–0.94 — and report the sm86 result upstream; they keep per-arch verification records and would likely take the datapoint.
- Weight logistics are the main cost: Miowtion's strict loader wants the HF-release layout (~210 GB FL2VA incl. text encoder + VAEs); our ComfyUI-side H3 weights may need re-fetch or careful symlinking. VRAM fits (verified by them on 1×4090 24 GB with host streaming; our 112 GB host RAM clears their ~40 GB pinned requirement) [DOC].

**Effort estimate**: 0.5–1 day to the kernel verdict (bench + tests); 2–3 days to e2e Veda generation on the 3090; +2–3 days for the dense steering instrument. The "are we stuck?" answer: **no — the kernel exists, it names our GPU in its docstring, and the fallback ladder (flex → sparge) is sm86-safe all the way down.**

## Sources

- Miowtion repo: <https://github.com/veda-sparse/Miowtion> — README; `docs/INDEX.md`; `docs/features/veda_kernel.md` (fetched 2026-10-05); `miowtion/kernels/fa4_sm8x/{__init__.py, interface.py}` (raw).
- FlashAttention: <https://github.com/Dao-AILab/flash-attention> — README; repo tree; `setup.py`; `csrc/flash_attn/flash_api.cpp`; `flash_attn/flash_blocksparse_attn_interface.py`; issues #77, #196, #1784.
- SageAttention: <https://github.com/thu-ml/SageAttention> — README; `setup.py`.
- SpargeAttn: <https://github.com/thu-ml/SpargeAttn> — README; `setup.py`; paper arXiv:2502.18137.
- Sparse SageAttention1 API: <https://github.com/jt-zhang/Sparse_SageAttention_API> — README.
- FastVideo: <https://github.com/hao-ai-lab/FastVideo> — README (VSA arXiv:2505.13389; FastH3 news).
- PyTorch: `aten/src/ATen/native/transformers/attention.cpp` (flash backend call site, no attn_mask); flex_attention blog <https://pytorch.org/blog/flexattention/> (H100 ~90%-of-FA2 claim); issue pytorch/pytorch#149767.
- Local: `docs/research/prompting/h3-packet.md` (speed-stack lore); `custom_nodes/comfyui-minimax-h3-audio-T8/h3_t8/scoped_sage_triton.py` (masked dense Sage adapter).
- Veda predictor checkpoint: <https://huggingface.co/Veda-Sparse/Minimax-H3-T2VA-Veda-8NFE-600Step-Preview> (via steering note).
