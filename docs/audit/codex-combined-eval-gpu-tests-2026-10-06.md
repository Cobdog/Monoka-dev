# Combined-eval GPU test handoff — 2026-10-06

The reproduced Flex OOM is caused by Torch Dynamo exhausting its specialization
budget and falling back to unfused attention. It is not a Triton autotune
workspace failure. This supersedes the workspace-first hypothesis in the earlier
code audit and in the combined-results document.

The user authorized GPU tests on the idle 8189 testbed. These tests use the
registered PDMD-4/ref2va-int8 graph, seed 421337, 124 frames at 1088×608. They do
not evaluate model quality or the maintainer's blind-review pairs.

## Reproduction and causal evidence

The original shim reproduces the executor's 3 sparse / 197 dense-fallback calls
in both warm and timed generations. Before the first failure, the log says:

```text
torch._dynamo hit config.recompile_limit (8)
last reason: tensor 'key' size mismatch at index 1. expected 24, actual 32
flex_attention called without torch.compile() ... materializes the full scores matrix
```

The full traceback ends at Torch's `_higher_order_ops/flex_attention.py:190`:

```python
scores = query.to(working_precision) @ key.to(working_precision).transpose(-2, -1)
```

This is `sdpa_dense -> math_attention -> _math_attention_inner`, not the Triton
kernel or autotuner. The failed input is `[33280, 32, 128]` in Veda's sequence-major
layout. Float32 scores require exactly:

```text
32 × 33280 × 33280 × 4 bytes = 132.03125 GiB
```

The allocator reports 132.03 GiB requested, 11.64 GiB CUDA-free in the warm run,
and 16.22 GiB CUDA-free in the timed run. `max_autotune` is false. Global observed
VRAM peaks do not describe free memory at the failing attention call.

`dynamic=False` specializes on changing tile-slot counts and head-group sizes.
The built-in backend self-test consumes one specialization before real H3
attention begins. Eight successful backend calls are followed by the ninth
signature's eager fallback; only three complete model-layer calls have finished.

The one-change `compute_q_blocks=False` experiment also fails at the ninth
signature, requests the same 132.03 GiB, and finishes with 3 sparse / 197 fallback
calls. It is a correct metadata optimization, but insufficient for this failure.

## Workaround result and implementation recommendation

**The OOM is workable without architectural change on this testbed.** Changing
only the Flex function's `torch.compile` call to add `recompile_limit=256` passes
two full real-engine generations: **200/200 sparse model-layer calls in each,
zero fallback, and 16.6% attention computed**. Global Dynamo limit remains 8;
only this function receives the larger budget. BlockMask construction and the
Veda chunker remain original. No workspace reserve, autotune change, smaller
chunks, or Q-list removal was needed for the passing experiment.

The installed Torch 2.12.1 API accepts `recompile_limit` directly on
`torch.compile`. Cheapest demonstrated fix at live `backends/flex.py:53`:

```python
self._fn = torch.compile(
    flex_attention.flex_attention, dynamic=False, recompile_limit=256
)
```

For the implementation, also add `fullgraph=True` to refuse unfused fallback
when a budget is eventually exhausted. A separate small GPU guard test uses
`fullgraph=True, recompile_limit=2`, with partial tiles and a real padding mask:
heads 1 and 2 compile and return the correct analytic output; heads 3 raises
`FailOnRecompileLimitHit` before entering dense math. A spy records **zero calls
to the unfused math implementation**. This guard was tested separately; the
full-engine passing runs changed only `recompile_limit`.

`compute_q_blocks=False` remains a sensible independent optimization, validated
numerically here. It must not be presented as the demonstrated OOM fix. The
128 MiB chunk floor and retained previous output remain memory-efficiency issues
from the code audit, but they did not prevent these passing generations.

| Variant | Stage | Wall seconds | Sampler seconds | Sparse / dense fallback | Sampled peak MiB |
|---|---|---:|---:|---|---:|
| Original | First | 123.58 | 77 | 3 / 197 | 22,943 |
| Original | Second | 105.17 | 72 | 3 / 197 | 23,865 |
| Only no-Q-lists | First | 126.66 | 80 | 3 / 197 | 22,945 |
| Only function limit 256 | First | 286.81 | 239 | 200 / 0 | 23,363 |
| Only function limit 256 | Second | 93.94 | 61 | 200 / 0 | 24,065 |

The five generations total 736.16 seconds of measured wall time (12.27 minutes),
excluding standalone tests and engine startup/teardown.

**Compile latency remains material.** Across the passing pair, instrumentation
observes 124 distinct `(Q shape, strides, tile count)` signatures, including the
self-test. These are observed input signatures, not an exact compiler-cache-entry
count. The minimum recorded free memory before one of these first-seen calls is
0.644 GiB. Some signatures first appear in the second generation because
memory-dependent chunking changes head counts, so that run still incurs new
compilation. Neither 239 seconds nor 61 seconds is a clean steady-state Flex
benchmark. No cold-cache or steady-state speedup claim should be derived from
these tests.

256 is a tested budget for this geometry, not a universal upper bound across
future resolutions, devices, and videos. An implementation can later reduce
signature proliferation with consistent head-chunk sizes or a validated
specialization strategy. That is a performance follow-up, not a prerequisite
for the demonstrated workaround. Fullgraph refusal must remain in place so
future cap exhaustion becomes a clear backend failure rather than a giant
unfused allocation. The eval harness should fail the arm if any sparse call
falls back, even when the production node completes the user's render.

The executor's proposed remedies can now be classified more precisely:

- Q-list removal: correct optimization; demonstrated insufficient alone.
- Pre-warming: cannot fix an eight-signature budget; useful only after
  specialization management is fixed, and must cover actual head/tile signatures.
- Autotune off: already off in all tests; cannot explain or remedy this failure.
- Compile workspace reserve: cannot satisfy a 132 GiB scores allocation on a
  24 GiB GPU; not needed in the passing limit-only experiment.

## Numerical checks

Standalone checks on RTX 3090 / SM86, Torch 2.12.1+cu130:

- Original Flex and no-Q-list Flex pass sparse-reference fixtures at seeds 0,
  17, and 421337. Maximum absolute error is 0.0078125–0.015625, below 0.41% of
  reference absolute maximum. All tested real outputs are finite.
- A padding-denominator adversary puts one real key in each 128-slot tile,
  with Q=K=0 and real V=1. Both Flex variants return exactly 1 on real query
  rows. Without padding masking, this fixture would return approximately 1/128.
- FA4 passes the same three sparse-reference fixtures. Maximum absolute error
  is 0.0078125–0.015625.
- FA4 pack → all-kept attend → unpack matches dense reference attention on
  three seeds, with partial video tiles, history, and global rows present.
  Maximum absolute error is 0.001953125–0.00390625, below 0.56% of reference
  absolute maximum. No layout corruption is detected by these checks.
- The compiler-limit experiment additionally checks actual H3 attention outputs:
  three real query rows and two heads for each of the first three production
  signatures. Q-slot counts are 29440, 33280, and 37120. Maximum errors versus
  fp32 masked reference are 0.007785, 0.007084, and 0.027923, respectively;
  each is below 0.25% of reference absolute maximum. These are sampled checks,
  not exhaustive verification of every production output.

The small standalone reference follows the node's existing reference convention:
fp32 math followed by bf16 output. The sampled production reference retains
fp32 output through comparison.

## Harness and evidence

The test harness lives in
`test-results/experiments/gpu-batch-combined/audit-2026-10-06/`:

- `kernel_checks.py` / `.json`: standalone correctness checks.
- `engine_bootstrap.py`: temporary import-time source substitutions plus
  input-shape, allocation, and error instrumentation.
- `engine_checks.py`: fresh 8189 launches using the original registered graphs
  and controller; changes output prefix only; warm/timed use the original VAE
  cache-bust arrangement.
- `original.log` / `.json`, `no_q_blocks.log` / `.json`,
  `compile_limit.log` / `.json`: complete engine logs and per-run manifests.
- `provenance.json`: repository revisions and live source hashes.
- `fullgraph_guard.py` / `.json`: refusal-before-dense-math guard test.

No installed node, kernel, converter, or engine source is edited. The engine is
stopped after each variant. Compiler disk caches are reused; “warm” means first
generation in that fresh process, not a clean compiler-cache benchmark.
Production reference probes are limited to the first three production signatures
in the compiler-limit experiment and introduce some warm-run synchronization.
Peak VRAM is sampled at one-second intervals. Sampler times are parsed from tqdm
and have one-second granularity; `wall_s` includes polling and final thread joins.
The inherited driver's `sampling_s` is retained in raw manifests but is not used
as sampler-only time here.

All three engine launches exited successfully and returned the GPU to 305 MiB.
The final standalone guard test also completed and released the GPU. Live source
hashes were checked against `provenance.json` after testing; installed Flex,
Veda engine, and Miowtion FA4 source remained unchanged.

The artifacts under `test-results/` are local/ignored by the repository. This
handoff document is a normal repository file. The scripts and raw logs must be
included explicitly if the implementer needs a portable archive.
