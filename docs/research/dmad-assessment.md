# DMAD intake — the 4-step challenger to PDMD (ZhengmingYu/DMAD, 2026-10-05)

> Source: huggingface.co/ZhengmingYu/DMAD (created 2026-10-02; ByteDance +
> Texas A&M; arXiv 2610.02188). License: the H3 Community License family
> (§5a; fetch-consent, flagged row at fetch). Two checkpoints at 1.4 GB each.
> **Maintainer ruling: a combined eval — attention-kernel benchmark + the
> DMAD-vs-PDMD bake-off, one GPU window.**

## Verdict

**ADOPT-candidate for a head-to-head eval.** DMAD is the direct challenger
to our freshly crowned PDMD fast-lane king — same architecture target
(rank-128 LoRA, 50 blocks + 2 token refiners, 4 NFE), same canvas class,
but a genuinely different mechanism: **adversarial distillation** (the
critic is trained as a discriminator) vs PDMD's **projection** (filtering
the critic error out of the update). Two solutions to the same DMD
instability.

## The two checkpoints

| File | What | Note |
|---|---|---|
| `dmad_..._4step_lora_critic.safetensors` | the paper's EMA @ iteration 800 | the citable result |
| `dmad_..._4step_full_critic.safetensors` | fully-trained critic backbone @ iteration 1600 | **scores HIGHER on AVGen-Bench** — training the critic fully (vs freezing it under a LoRA) is an independent engineering finding |

Both ride the eval (the frozen-vs-full-critic comparison is free).

## What it needs for our stack

A ComfyUI-format conversion (diffusers PEFT → fused-qkv) — the exact math
we've documented three times (PDMD v6, Omnichar, the keyframe adapters'
converter): `attn.to_q/to_k/to_v → qkv_proj` (stacked-A, block-diagonal-B),
`to_out.0 → out_proj`, `ff.net.0.proj → mlp.fc1`, `ff.net.2 → mlp.fc2`;
alpha = rank = 128 → no alpha key needed (scale = 1.0). Our existing
conversion tooling handles this class. Sampler: 4 steps, time shift **12
(video) / 2 (audio)** — note audio shift 2, not 3 (PDMD and turbo both use
3; a recipe difference our audio battery will catch).

## The combined eval (registered as the next GPU window)

### Part 1 — the attention-kernel benchmark (the SM86 tuned-kernel gate)

Native attention methods vs our tuned kernel, on the same generations:
- **Dense (ComfyUI stock SDPA / PyTorch scaled_dot_product_attention)** —
  the baseline every shipped build uses
- **SageAttention** (already on our stack, ~2× per our speed-stack lore)
- **FA4-patched block-sparse** (the Miowtion SM8x kernel, if the build
  agent's Phase 1 passes)
- **FlexAttention / Triton** (the sm86-safe comparison arm)
- Each kernel × the same prompts/seeds/settings; wall-clock per step, VRAM
  peak, and a pixel-diff against dense (the quality-penalty check per kernel)

### Part 2 — the DMAD vs PDMD bake-off (the distill-crown contest)

- **6 prompts** (the P2 six: CONTACT, GYMNASTICS, BASKET TOSS, AIRCRAFT,
  FISH TANK, WET ROAD — the same board, already authored and registered)
- **5-second clips** (121f, the nearest 17k+5 grid value to 5s) — shorter
  than P2's 243f for economy; the maintainer's call
- **4 arms**: PDMD-4 (the incumbent), DMAD-4 lora-critic, DMAD-4
  full-critic, turbo-8 (the context arm)
- Same base, same graph, only LoRA + steps varying; single seed per cell
  (Amendment 5)
- **Primary**: DMAD-full-critic vs PDMD on the maintainer's blind calls
  (the crown question)
- **Secondary**: lora-critic vs full-critic (the engineering finding);
  audio battery (shift-2 vs shift-3); wall-clock
- Null pair: PDMD duplicate through the alias lever
- ~24 gens + null + canary ≈ 30-40 GPU-min at 121f/4-step on int8

### Sequencing

Runs when: (a) the SM86 build agent finishes, (b) the GPU frees, (c) the
maintainer gives the go. Part 1 first (the kernels), Part 2 on whatever
kernel wins Part 1 (or dense if no kernel passes the quality gate).
