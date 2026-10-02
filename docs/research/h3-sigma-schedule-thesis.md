# The H3 sigma-schedule thesis — validating the Reddit deep-dive (shifts, schedulers, trajectories)

> Flux task: **H3 sampling-claims deep validation (25ttkzo)**. Date: **2026-10-02**.
> METHOD: (1) every quantitative claim **recomputed from the shift formula and
> re-derived from ComfyUI source** (`comfy/model_sampling.py`,
> `comfy/samplers.py`, `comfy/ldm/minimax/model.py`,
> `comfy_extras/nodes_minimax_h3.py` at the canonical install) — this doc's
> §2–§4 are ground truth, not summaries; (2) external evidence via a
> dedicated research pass over public H3 docs, cards, papers, and community
> benchmarks (§5, sources inline); (3) solution candidates + experiment
> designs (§6–§7). No GPU used; no engine touched.
>
> **The claim set** (a Reddit practitioner deep-dive, relayed by the
> maintainer): H3 quality convergence is a multidimensional function of
> steps × dimensions × sigma (shift_video) × duration × seed × prompt
> complexity; the native shift-12 schedule is strongly high-noise weighted
> (σ′ = sσ/(1+(s−1)σ)); motion resolves in mid/mid-low noise, texture in low
> noise, and over-sampling low noise fries output; distilled checkpoints
> pin their trained trajectories; schedulers sample the trajectory
> differently (simple = native table, normal = timestep-linear,
> sgm_uniform = timestep-uniform, beta = U-shaped); the recipe "raise shift
> + sgm_uniform + more steps for complex motion". Plus the prompt-side
> claim: the closed "IR" (prompt compiler) is the real quality gate, and
> prompts that latch onto trained TV/movie content work while novel content
> lands in "plastic deepfried slop".

## 1. Headline verdicts

| # | Claim | Verdict | One-line basis |
|---|---|---|---|
| 1 | Shift formula σ′ = sσ/(1+(s−1)σ); all quoted grids (4/8/20 evals @ s=12; 4-step @ s=3/6/10/12) | **VALIDATED [DOC — recomputed]** | Every number exact to 4 decimals (§2.1) |
| 2 | Native shift_video 12, audio 3 "4:1 lockstep" | **VALIDATED [DOC — code]** | `sigma_shift_video=12.0, sigma_shift_audio=3.0` defaults; `audio_scale = shift/audio_shift = 4.0`; DiT derives audio via `time_shift_sigma(σ_v, 12, 3)` (§2.2) |
| 3 | "Roughly 75% of intervals at σ≥0.8 at s=12" | **VALIDATED [DOC]** | σ′=0.8 ⟺ base 0.25 at s=12 → 75% of a base-uniform grid (§2.3) |
| 4 | "At shift 32, σ=0.8 ⟺ underlying 0.1111" / "~6.67 of 60 intervals above 0.8" | **HALF: the 0.1111 is exact; the interval count is INVERTED** | 53–54 of 60 intervals sit ABOVE σ′=0.8 at s=32 — *more* high-noise concentration than s=12's 75%, not less (§2.3) |
| 5 | Scheduler semantics: simple = native shifted table; normal = timestep-linear converted back; sgm_uniform = timestep-uniform; beta = U-shaped ends (α=β=0.6); ddim_uniform similar-in-some-cases | **VALIDATED [DOC — code]** | All five match `comfy/samplers.py` line-for-line (§3.1) |
| 6 | "Simple goes to shit fastest when you tickle shift; sgm_uniform is the shift-friendly one" | **VALIDATED + mechanism made precise [DOC — computed]** | At s=32 simple's non-zero floor is σ′≈0.91 (giant terminal jump); sgm_uniform still reaches σ′≈0.51 (§3.2) |
| 7 | "Steps are not a silver bullet; convergence is multidimensional (dims, duration, seed, prompt)" | **CONSISTENT with prior evidence [COMM]** | HF #65: more steps "refine visuals but don't fix structure"; docs.comfy.org: simple shots hold at 12–16 steps, high-frequency detail benefits up to ~50; no controlled study exists — the sweep remains unpublished by anyone (§5) |
| 8 | Turbo/distilled checkpoints have trained trajectories; LightX2V 768p = shift 6/3, 544p = 12/3; changing scheduler takes them off-distribution | **VALIDATED [DOC — shipped cards]** | ModelTC/Minimax-H3-Turbo README verbatim: 544p line trains 12/3, 768p line 6/3, "Recommended settings: 8 NFE, video shift 6, audio shift 3", sampler `euler`; card's own sigma-grid math matches our formula; off-distribution doctrine supported by SGLang/HyperFlow/loopforge shipped docs (§5). NOTE the inversion: the 768p (higher-res) turbo trains at the LOWER shift — distill choices do not follow the SD3 resolution heuristic |
| 9 | seeds_2 does 2N−1 internal calls; res_multistep ~2× faster at matched grid | **VALIDATED [DOC — core source]** | Both are ComfyUI **core** samplers: `seeds_2` (SEEDS-2, arXiv 2305.14267) = 2 calls/step except the last = 2N−1 NFE; `res_multistep` (arXiv 2308.02157) = second-order with N NFE by reusing the cached previous denoised output (§5) |
| 10 | The "IR" (closed prompt compiler) is the real quality gate; trained-content latching works, novel prompts → slop | **PARTIAL [DOC for the IR; the latching theory is the user's invention]** | The IR is real, named, and diagrammed: **H3-Context-IR**, "critical to the quality of the final output" (official README verbatim); released as API only (`/video-generation-v2-h3-context-ir`), never as weights. But the iff-latching theory is refuted in its strong form — official outputs are original content; the kernel of truth is *structure*-latching (the six-section Ref2VA contract), not TV/movie *content*-latching (§5) |
| 11 | "High noise = structure, mid/mid-low = motion, very low = texture; low-noise over-sampling fries" | **PARTIAL [DOC-paper for endpoints; COMM/SPEC for the middle and the fry]** | Endpoints peer-reviewed: Beta paper (arXiv 2407.12173) measured low-freq changes early / high-freq late; SD3 §5.3.2 supplies the shift rationale; SDEdit the low-noise-preservation basis. "Mid = motion" appears in NO paper — H3 practitioner evidence is directional only; "fries" is [SPEC] on H3 (§5) |

## 2. The math, recomputed

### 2.1 Every quoted grid is exact

σ′ = s·b/(1+(s−1)·b) at uniform base positions b = 1, (N−1)/N, …, 1/N — which
is precisely what `simple_scheduler` samples (uniform stride over the model's
1000-entry `sigmas` table, built as `shift(s, k/1000)`,
`ModelSamplingDiscreteFlow.set_parameters`):

| Setting | Recomputed grid | Reddit | Match |
|---|---|---|---|
| s=12, N=4 | 1.0000, 0.9730, 0.9231, 0.8000, 0 | same | exact |
| s=12, N=8 | 1.0000, 0.9882, 0.9730, 0.9524, 0.9231, 0.8780, 0.8000, 0.6316, 0 | same | exact |
| s=12, N=20 | …, 0.8372, 0.8000, 0.7500, 0.6792, 0.5714, 0.3871, 0 | same | exact (all 21 values) |
| s=3, N=4 | 1, 0.900, 0.750, 0.500, 0 | same | exact |
| s=6, N=4 | 1, 0.947, 0.857, 0.667, 0 | same | exact |
| s=10, N=4 | 1, 0.968, 0.909, 0.769, 0 | same | exact |

The author disclaimed their own numbers ("I had an LLM calculate these") —
they are all correct.

### 2.2 The 4:1 audio lockstep, precisely

Code (`comfy/ldm/minimax/model.py:479`,
`comfy/model_sampling.py:ModelSamplingAV`): video shift defaults 12.0, audio
3.0. The coupling is threefold: (a) the sampler **carries the audio latent
scaled** onto the video schedule by `audio_scale = shift/audio_shift = 4.0`
(so a packed latent decodes as one ordinary single-schedule flow latent);
(b) the DiT derives the audio stream's true timestep per step by
**inverting** the incoming video sigma to the shared base grid and
re-applying the audio shift: σ_a = shift(3, unshift(s_v, σ_v)); (c)
`MiniMaxH3SigmaShift` patches BOTH the sampler-side table and the DiT-side
pair coherently. The user's "audio converges faster since it's simpler" is
plausible-but-unattributed **[SPEC]**.

### 2.3 The one inversion error (claim 4)

unshift(32, 0.8) = 0.8/(32 − 0.8·31) = 0.1111 — exact, as quoted. But the
follow-on count is backwards: at s=32 a base-uniform grid has **~89% of its
intervals at σ′ ≥ 0.8** (54/60 at N=60), versus 75% at s=12. Shift 32
concentrates *harder* high-noise, consistent with the author's own framing
elsewhere ("shift controls how aggressively the schedule is pushed toward
high-noise") — the "6.67 intervals above σ=0.8" sentence counts the
below-0.8 intervals. Direction of their advice is unaffected; the number is
wrong.

### 2.4 Base-position intuition (why the numbers look like that)

The shift map sends b→σ′ with fixed points 0 and 1 and everything else
upward; its slope at b is s/(1+(s−1)b)². At s=12 the map spends most of its
slope budget low: half the σ′ range [0.8, 1.0] covers base [0.25, 1.0].
Denser grid points at high b ⇒ many evaluations packed into the σ′∈[0.8,1]
band (structure), few in the mid band (motion), and a long terminal jump
(textures resolved in one hop). This is the geometry behind every claimed
grid.

## 3. Scheduler semantics — code truth (claim 5, 6)

### 3.1 What each scheduler actually does on H3

`timestep(σ) = σ·1000` and `sigma(t) = shift(s, t/1000)` for H3's flow
sampling (`ModelSamplingDiscreteFlow`, multiplier 1000). Therefore:

| Scheduler | Grid construction (`comfy/samplers.py`) | Effective spacing |
|---|---|---|
| `simple` | uniform stride over the model's shifted table (base-uniform, warped) | base-uniform; **floors at b = 1/N** (N=8@s12 → last non-zero σ′=0.63) |
| `normal` | linspace t ∈ [1000·σ′min, 1000] → `sigma(t)` | ≈ base-uniform over [σ′min, 1]; endpoint variants only |
| `sgm_uniform` | same linspace, N+1 points, drop last, append 0 | ≈ base-uniform **extended deepest** (to b ≈ σ′min ≈ 0.012@s12) |
| `beta(0.6,0.6)` | Beta-PPF-quantiles over the table (arXiv 2407.12173) | **U-shaped in base position**: piles both ends, hollows the middle — "focuses least on motion" ✓ |
| `ddim_uniform` | table stride from index 1 | ≈ `simple` but never exactly σ′=1.0 and extends to the table floor |

Computed 8-step grids at s=12 (descending):

```
simple      : 1.0000 0.9882 0.9730 0.9524 0.9231 0.8780 0.8000 0.6316 → 0
sgm_uniform : 0.9884 0.9734 0.9532 0.9247 0.8814 0.8074 0.6527 0.1260 → 0
beta(.6,.6) : 1.0000 0.9950 0.9825 0.9607 0.9234 0.8553 0.7207 0.4249 → 0
ddim        : 0.9884 0.9733 0.9528 0.9236 0.8790 0.8017 0.6358 0.0235 → 0
```

Two consequences the Reddit summary implies but does not state: **(a)** all
four schedulers are base-uniform-then-warped — the shift moves *every* one
of them (there is no shift-invariant scheduler here); **(b)** at high shift
the schedulers separate mainly by **how deep their non-zero floor reaches**,
which is exactly the "explode vs not" boundary (next).

### 3.2 Why "simple explodes, sgm_uniform doesn't" at high shift (claim 6)

At s=32, N=8: `simple` = 1.0000, 0.9965, 0.9930, 0.9877, 0.9800, 0.9684,
0.9504, 0.9143 → **0** — seven evaluations crowded above σ′=0.91 and one
0.91→0 mega-jump carrying ~19% of the entire trajectory. `sgm_uniform` at
the same setting reaches σ′=0.506 before its final hop. The integrator's
local-error budget is dominated by that terminal jump; a multistep solver
(res_multistep) amplifies the problem by extrapolating across it. This is
the mechanical content of "simple … completely sends stuff off the rails"
and "sgm_uniform … to not explode".

## 4. What the knobs do — the corrected mental model

1. **shift_video** sets the warp of the base→sigma map for ALL schedulers
   (sampler-side table + DiT-side audio remap). Higher = more evaluations in
   the structure band, larger terminal hops for table-floor schedulers.
2. **scheduler** chooses the base-position density: `simple`/`normal` ≈
   uniform; `sgm_uniform` = uniform + deepest floor (shift-robust);
   `beta(.6,.6)` = U-shape (ends over middle); `ddim` = table-striding
   variant.
3. **Hidden coupling**: changing shift_video also **retimes audio**
   (σ_a = shift(3, unshift(s_v, σ_v))): at σ_v=0.5, audio sits at σ_a=0.20
   (s_v=12) vs 0.086 (s_v=32) — the audio stream is dragged ~2.3× "later"
   (cleaner) relative to video. Nobody in the thread accounts for this; it
   is testable and possibly part of why shift changes "feel" bigger than
   the video grid alone implies.
4. **NFE (steps)** buys resolution *within* the chosen density. Steps do
   not repair structure (HF #65) but they do buy motion resolution in the
   mid band when the grid actually visits it — which at s=12 it barely does
   (§3.1: simple spends 16/20 intervals above 0.8).

## 4a. The Krea 2 precedent — our own measured analog (Kreatine)

The maintainer flagged it and it checks out: **Kreatine's Krea 2 work is a
measured instance of the entire thesis** (docs at
`/home/agent/work/VS Proj/Kreatine/docs/reference/krea2-model.md` +
`two-stage-sampling.md`) **[DOC — our measurements, MAINTAINER project]**:

1. **Resolution-interpolated shift is shipped vendor practice.** Krea 2
   Raw's schedule is `mu = slope · image_tokens + intercept` (mu 0.5 @ 256²
   → 1.15 @ 1280², *unclamped* — 2048² extrapolates to mu 2.21); same
   formula family as H3's (σ(t) = S·t/(1+(S−1)·t), S = e^mu). Turbo **pins
   mu = 1.15 at every resolution** — "it was trained at a fixed mu. Do not
   raise it for higher resolutions." This is the thesis's claim 8
   (distilled trajectory pinning) with a vendor-shipped, code-verified
   instance — and the resolution axis of "convergence is a multidimensional
   function" with a concrete vendor implementation (token-count-linear).
   H3 ships a flat 12 for every resolution/duration; whether that's a
   trained invariant or an unexposed dial is exactly what X2 measures.
2. **Stage-handoff sigmas must be grid-native on BOTH sides — and the
   computation is resolution-dependent.** The raw→turbo handoff had to move
   off the shipped constant ("only correct near one resolution") to a
   formula picking σ 0.9045 (n/8 = m/12, native to both stage grids);
   measured identical across 458 canvas sizes, worst quantization error
   0.0056, "below ~768² re-check rather than assume." Direct H3 transfer:
   every refine/seam/continuation pass that starts from partial noise
   (the latent-upscaler refine in the roychoo workflow, our seam
   re-denoise arm S, R-family re-anchors) has a handoff sigma that must
   sit on both grids — and if X2 finds H3's effective shift is
   resolution-dependent, handoff constants inherit that dependence.
3. **Distilled-stage NFE discipline, measured**: 16 steps measurably worse
   than 8 **at identical sigma values** (interval mis-integration — the
   model predicts interval-averaged velocity); samplers evaluating at
   *intermediate* sigmas (heun, dpmpp_sde, 2s/3s, ancestral) are the
   defect class on distilled stages. Consequences here: `res_multistep`
   (one call/step, schedule sigmas only, cached-second-order) is on the
   safe list; **`seeds_2`'s second evaluation at intermediate σ_s_1 puts
   it in the avoid class for turbo H3 stages** — the Reddit author's
   res_multistep preference is right, and their seeds_2 baseline would
   degrade exactly the way our Krea 2 16-step test did.
4. **A bound on the Reddit advice**: on Krea 2, `sgm_uniform` vs `simple`
   was measured a "functional twin that buys nothing" — at Krea's S≈3.16
   the floor-depth difference is negligible. My H3 grids agree the two are
   near-twins at s=12 (§3.1); they separate only at high shift (s≳24,
   §3.2). "sgm_uniform to not explode" is correct precisely in the regime
   where exploding becomes possible — neutral elsewhere.
5. **Parameter-hazard echo**: Krea 2's mu-vs-multiplicative-shift input
   confusion (1.15 typed where 3.158 belongs → nearly flat schedule) is
   the same hazard class H3's shift dial must guard against in UI
   (unit-labeled dials, S1's manifest carries the unit).

## 5. External evidence (research pass)

Research pass executed 2026-10-02 (subagent; searxng primary, Z.AI WebSearch
fallback for Reddit discovery — Reddit via the arctic-shift archive;
huggingface.co via WebFetch (domain-blocked in searxng); ComfyUI semantics
re-verified against the local checkout). Library actions from the pass:
dated addendum to `docs/library/comfyui-minimax-h3-overview.md` (the live
page gained a sampling section our 2026-09-16 capture lacks — canonical
recipe upgraded [COMM]→[DOC]); new capture
`docs/library/lightx2v-minimax-h3-turbo-readme.md`.

### 5.1 The IR — identified, quoted, and half-open (claim 10)

The official repo defines the full system as **H3-Context-IR → H3-Base →
H3-Regenerate-2K** with overview/architecture diagrams
(`assets/overview.png`, `assets/full-arch.png` — the diagram the Reddit
author half-remembers) **[DOC,
github.com/MiniMax-AI/MiniMax-H3]**. Verbatim: "we build a dedicated
system to deeply understand and refine the input multimodal instructions,
then convert them into a form that H3 can readily understand — the
**Context Intermediate Representation** … H3-Context-IR is critical to the
quality of the final output." And: "it is not included in this
open-source release. **We provide an API**" — endpoint
`/video-generation-v2-h3-context-ir` (`task_type: h3_context_ir`),
returns the enhanced structured prompt; launch blog: source material
takes "~100K tokens of inference, distilled to ~4K tokens average"
**[DOC]**. H3-Regenerate-2K is likewise API-only. Community approximation:
**lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA** (Qwen3.6-27B base + 8B/Omni
variants; card: "a learned approximation, not … an exact replica of the
official H3-Context-IR service", benchmarked against the hosted service)
**[DOC-card]**. The six-section format is the official **Ref2VA** contract;
T2VA/I2VA use three sections **[DOC]**. The latching iff-theory: no
official or community support anywhere — official showcase outputs are
original content; the distortion kernel is that *structure* (the
compiled prompt) is critical, which MiniMax itself states.

### 5.2 Turbo cards end-to-end (claim 8)

ModelTC/Minimax-H3-Turbo README (now captured): 544p line (FL2VA 4-step
v0.1, FL2VA 8-step v1.0, Ref2VA 4-step v0.1) trains at **12/3**; 768p line
(FL2VA 4/8-step v1.0 768p) at **6/3**; "Recommended settings: 8 NFE, video
shift 6, audio shift 3"; sampler `euler`; the card's own sigma-grid worked
example matches our §2 formula exactly. **The inversion worth naming**: the
higher-resolution 768p line trains at the *lower* video shift — distill
training choices do not follow the SD3 resolution heuristic (Wan2.1 by
contrast ships "flow_shift 5.0 for 720P, 3.0 for 480P" following SD3's
law). Do not generalize shift values across models, nor across
base/distill within a model. Off-distribution doctrine, adjacent shipped
docs: SGLang H3 cookbook ("pin the exact FL2VA/Ref2VA file and its
NFE/sigma schedule"); drbaph HyperFlow card ("uses its own fixed 8-step
sigma schedule … follow the upstream scheduler"); loopforge ("4-step
sigmas without the LoRA those sigmas exist for … looks like a render that
gave up half way") **[DOC×3]**. Other distill recipes: larryvrh-lineage
turbo_v4 = Euler + **Beta** scheduler, 6–8 steps, **12/4–6** audio shift
range; TaoMate 3-step own sigmas; audio-shift mistakes have documented
failure modes ("severe distortion … completely broken audio").

### 5.3 Samplers in the wild (claims 5–9 context)

docs.comfy.org (live): "**Every local MiniMax H3 workflow samples with
`res_multistep` and the `simple` scheduler**"; simple shots hold at 12–16
steps, high-frequency detail benefits up to ~50; turbo 8 (T2V/I2V) / 4
(R2V/multiframe/Fun-Control); **the FastH3 official template runs
shift_video 10 / audio 3 — the first official-template deviation from
12/3 on record** (added to X2's arm list). The third-party pack the
Reddit author's vocabulary comes from is **ClownsharkBatwing/RES4LYF**
(its real H3 role: the `beta57` scheduler); res_multistep itself long
predates H3 (Cosmos lineage, ComfyUI PR #6462; "Refined Exponential
Solver", arXiv 2308.02157). Published H3 speed measurement: the RH pack
(adapted from **MiniMax's own Apache-2.0 H3 source package** — the
closest thing to an official reference recipe, 50 sigma points / euler /
12/3) measured **res_multistep at 2.46× denoise-loop, 1.35× end-to-end**
vs Euler, "21 sigma points (20 DiT calls) match the quality of 50-step
Euler (49 calls)" **[DOC, Apache-2.0, measured table]**. Community
benchmarks exist but are weak (single prompt, subjective star ratings):
the r/comfyui ~400-clip sweep's seeds_2-combo wins have in-thread
dissent; the favorites thread converges on er_sde + beta/beta57/sgm_uniform
and res_multistep + simple/beta; Spectrum composes with res/euler only;
RH forces accel=off under res_multistep (velocity caches calibrated for
50 steps over-skip at 20).

### 5.4 Noise-band evidence quality (claim 11)

Peer-reviewed endpoints: Beta paper (WACV 2025) Fourier-measured
"substantial low-frequency changes early on and high-frequency
adjustments later"; SD3 §5.3.2 (resolution-dependent shift, Eq. 23 — the
same functional form as H3's); SDEdit (low-noise start = preserve layout).
"Mid-noise = motion": in no paper; H3 practitioner evidence directional
("more steps … degrades motion in a way that looks like anti-shake
applied to GoPro footage"; "12 steps great static, blurry hair movement
in fast cuts"). "Fries from low-noise over-sampling": no H3 measurement
found anywhere — **[SPEC]**, X1/X3 measure it. **"Trained at shift 12":
no official statement exists** (card/README/API silent; the promised
technical report never shipped) — 12/3 is convergent engineering
inference: ComfyUI's H3 definition bakes it; the RH/official-source
package defaults 50-point euler at 12/3; SGLang serves "the standard
50-point schedule"; LightX2V distilled the 544p line at 12/3. Official-
adjacent serving is a ~50-step euler-class schedule at 12/3 — ComfyUI's
res_multistep/20 is the measured-equivalent speed reformulation.

**Local verification, hybrid-model claim:** the thesis's "REF2VA FL2VA
hybrid (30+ layers out of 49)" maps exactly onto
`ComfyUI_MinimaxH3HybridLoader` (installed at the canonical install):
`block_range_adaln` preset overlays `blocks.{start}..{end}.adaln_proj.*`
from Ref2VA onto an FL2VA base, default range end 49 (50 blocks total,
0-indexed) — an adaln-only overlay on a mostly-FL2VA body, i.e. "highly
biased hybrid" is accurate, and the pack's own docstring says the preset
implements "the configuration the user described" **[DOC — local code
read]**.

**Local verification, sampler-NFE claim (row 9):** `res_multistep`,
`res_multistep_cfg_pp`, `res_multistep_ancestral(_cfg_pp)`, `seeds_2`,
`seeds_3`, `er_sde`, `sa_solver` are all **ComfyUI core**
(`comfy/samplers.py:971-975`, implemented in
`comfy/k_diffusion/sampling.py`). `sample_seeds_2` (docstring: "SEEDS-2 —
Stochastic Explicit Exponential Derivative-free Solvers (VP Data
Prediction) stage 2, arXiv 2305.14267, NeurIPS 2023") evaluates the model
twice per step except the final step (`if sigmas[i+1] == 0: x = denoised;
continue` short-circuits the second call) = **2N−1 NFE**.
`res_multistep` (comment: "Second order multistep method in
arXiv 2308.02157") evaluates once per step = **N NFE**, reaching second
order by combining the current and *cached previous* denoised outputs
through φ₁/φ₂ exponential-integrator coefficients in log-σ time — the
whole point of the multistep family: higher order without extra
evaluations. Hence "~2× as fast as seeds_2" is mechanically exact at
equal N. Both also honor `model_sampling.noise_scale` (H3-compatible).
Note both solvers integrate in **log-SNR / exponential-integrator time**
(t = −log σ), a third time-parameterization in the stack alongside base
position and σ′ **[DOC — local code read]**.

## 6. Solution candidates (root-cause level)

Per the settled architecture (registry + node-level model dials), in
ascending build cost:

**S1 — Trajectory manifests in the model registry (loader-level, cheap,
high-value).** Every distilled checkpoint/LoRA row carries its trained
recipe — sampler, scheduler or explicit sigma ladder, shift pair, steps,
cfg — as machine-readable dials (LightX2V 768p 6/3 vs 544p 12/3; Tutu's
fixed ManualSigmas; our turbo rows). Loading a distilled model without its
manifest → warning banner ("off-distribution trajectory risk"). This makes
the user's distillation warning structural instead of tribal knowledge.
Builds directly on the existing per-model dial slots.

**S2 — A motion-focus scheduler dial (scheduler-level).** The thesis says
motion lives mid/mid-low and the native grid barely visits it. Implement as
a custom scheduler exposing ONE dial ("motion focus") that maps to a
base-position density: e.g., Beta(α,β) with α<1<β (unimodal, mid-low peak)
interpolating to uniform at 0 — or a mixture ρ(b) = w·uniform +
(1−w)·Beta(2,4). Ship as `BasicScheduler`-compatible custom sigma output;
keep DiT-side shift untouched (the grid remains "in-distribution per-step
timesteps" — the base model integrates ODEs, so per-step σ′ values are all
valid model inputs; only the *path* changes). The distillation caveat from
S1 bounds this to the base/hybrid models, not 4–8-step turbos.

**S3 — Resolution/duration-aware shift defaults (patcher-level). SD3
doctrine ported honestly.** SD3 §5.3.2's resolution-dependent shift is the
principled version of "these values are a moving target as you change
dimensions/duration": H3's native 12 was presumably tuned on its trained
envelope (~768p, 5–15 s); our megapixel dial already spans 0.2–2.0 MP. A
per-resolution shift table (empirically calibrated by X2 below) wired as
the default behind a "native / calibrated / manual" tri-state on the
existing shift dial.

**S4 — Terminal-window discipline (anti-fry).** The fry mechanism per the
thesis is over-integration at very low σ′ (plus the terminal jump). Two
mechanical mitigations, both cheap: (a) **terminal truncation** — end the
schedule at σ′ ≈ 0.05–0.15 instead of 0 (leave the last hop undone); (b)
**floor-aware scheduler default** — when shift > ~16, prefer sgm_uniform
automatically (the §3.2 mechanism), or clamp the terminal hop size. Expose
as "terminal sigma" advanced dial with native default.

**S5 — The open IR (prompt-side, the actual quality gate).** The IR claim
identifies as **H3-Context-IR**, MiniMax's closed prompt-enhancement
endpoint. Root-cause answer: a local prompt compiler on the existing LLM
toolchain (DeepSeek V4 Flash class) that compiles intent → the H3 six-section
contract with live validation (the Fantastic-PromptBuilder ADOPT-candidate
pattern) + AutoContext temporal-exclusivity rules for chains + RefMod
grounding for novel content (the latching asymmetry's honest mitigation:
when the prior can't be latched, anchor it with references instead). The
research pass upgrades this from speculation to a buildable spec: the IR
API is public and returns the full structured prompt with documented token
usage — usable as an **offline validation oracle** for our compiler (same
input → compare our compile vs theirs), without making the product depend
on it (local-first stands; the oracle is a test-harness tool). The
**lightx2v Prompt-Rewriter-LoRA** (Qwen3.6-27B/8B/Omni) is the community's
learned approximation and the local fallback baseline to beat. X5 measures
the gap.

**S6 — Audio-retiming dial (diagnostics + control).** Expose (shift_video,
shift_audio) as the pair it is, with the §4.3 retiming effect documented in
the dial's help text; optionally an "audio lead/lag" advanced dial that
compensates by adjusting shift_audio when shift_video moves off 12.

**S7 — The staged base→turbo handoff, Krea 2 pattern transposed
(maintainer proposal, 2026-10-02).** Run base H3 for the structure segment
(seed variance + prompt adherence live in the early, high-noise dynamics),
hand the latent to the turbo stage at a shared grid position, let the
distilled model render the remaining trajectory fast. Mechanically
constructible today on native primitives, with three H3-specific wrinkles
the Krea 2 case did not have:

- **Handoff by base position, not by σ′ value.** The turbo stages train at
  different shifts (LightX2V 768p: 6/3 vs base 12/3), so the same σ′ maps
  to different base positions per table. The coherent handoff picks a
  base position t native to BOTH grids and labels each stage with its own
  σ′(t). For base-20 (s12) × turbo-8 (s6): shared t at n/20 = m/8 →
  t ∈ {0.75, 0.5, 0.25} (three points, mirroring Krea 2's three). σ′
  labels differ per stage (t=0.75: σ′_base 0.973 vs σ′_turbo 0.947) —
  that is correct, not a mismatch.
- **Audio-stream rebasing.** The sampler carries the audio latent scaled
  by `audio_scale = shift_video/shift_audio` — 4.0 on 12/3, 2.0 on 6/3.
  Crossing stages with different shift pairs requires rescaling the
  packed audio rows by the scale ratio (a small unpack→rescale→repack
  node on the nested latent; same machinery the LTXV separate/concat
  pair touches). Getting this wrong garbles audio silently.
- **Stage-2 model patch.** The turbo stage must run under
  `MiniMaxH3SigmaShift(6,3)` (its trained pair) — two model patches, one
  per stage, both already native nodes.

What transfers from Krea 2's measurements as PRIOR (not proof): distilled
interval sensitivity says the turbo stage should run its OWN trained step
count (8), not an arbitrary subdivision; the handoff constant must be a
formula (n/k), never a fixed σ; and below some canvas/token count,
re-check alignment rather than assume. What does NOT transfer: Krea 2's
raw stage brought real CFG (adherence via guidance); H3 base runs
guidance-1, so the adherence benefit must come from the undistilled
velocity field alone — smaller expected effect, exactly what X7 measures.
No public base→turbo staged H3 has been found ([UNK] — see §5); the
nearest shipped patterns are single-stage turbo and post-hoc SDEdit
refines (the roychoo upscale pass).

## 7. Experiment designs (GPU, 8189 runbook, designed-not-run)

All arms fixed-seed, fixed-prompt set (3 prompts: low/med/high motion
complexity from the movement-director harness), CPU metrics + blind VLM
judge; turbo OFF unless stated; every arm logs the full sigma grid used.

| # | Question | Arms | Metrics / falsifier |
|---|---|---|---|
| **X1 grid shape** | Does mid-band density buy motion without fry? | {simple/12, sgm_uniform/12, sgm_uniform/24, beta(0.8,3)-mid-low/12} × 20 NFE × 2 seeds | motion-plan error (director harness); high-freq energy ratio + skin-patch dE (fry); VLM rank. Falsifier: mid-peak ≤ simple on motion at matched NFE |
| **X2 resolution×shift** | Is H3's optimal shift resolution-coupled (SD3 doctrine)? | {352p, 768p, 1088p} × s ∈ {8, 10, 12, 18} × simple/20 (s=10 added: the official FastH3 template's deviation) | structure/adherence metrics (HF #65's collapse point per shift); dE trajectory. Falsifier: optimal shift flat across resolution. WARNING from §5.2: the LightX2V 768p turbo trains at shift 6 — if a resolution trend exists for the base model, do not assume it points the SD3 direction; arm both directions and let the data decide |
| **X3 terminal truncation** | Does ending at σ′>0 reduce fry at no structure cost? | terminal σ′ ∈ {0, 0.05, 0.15} × sgm/12/20 | fry metrics vs HF #65's "steps are aesthetic"; VLM texture preference. Falsifier: truncation loses structure |
| **X4 audio retiming** | How big is the hidden audio coupling? | (s_v, s_a) ∈ {(12,3),(12,4),(24,3),(24,6)} | audio join correlation + treble energy; audio-first hallucination check. Falsifier: audio metrics flat |
| **X5 IR gap** | How much does structured/compiled prompting buy vs naive? | {naive, six-section hand-written, LLM-compiled} × 3 prompts, fixed grid | adherence metrics + blind judge; establishes the compiler's value target for S5 |
| **X6 distill off-distribution** | Quantify the turbo off-grid penalty | turbo-8-step at {manifest grid, sgm_uniform, simple} same NFE | quality collapse metrics; calibrates S1's warning threshold |
| **X7 staged base→turbo handoff (S7)** | Does base structure + turbo render beat pure turbo at matched NFE? | 3 arms, fixed seeds ×3: (a) pure turbo-8 (6/3); (b) staged: base-20 (12/3) → t=0.75 → turbo-8 (6/3) with audio rebasing, ~5+6 NFE; (c) pure base-20. Optional arm (d): staged at t=0.5 (heavier base share) | adherence metrics + blind judge + motion-plan error; NFE-matched comparison vs (a) is the economic question, vs (c) the quality ceiling. Falsifier: (b) ≤ (a) at matched NFE on adherence AND (b) < (c) on quality — the Krea 2 pattern doesn't pay on H3. Audio join/timbre check validates the rebasing math |

X1–X3 share assets (one generation set per arm-cell); estimated ~40–60 gens
total at cheap tier — one GPU window. X5 needs no engine-side novelty (same
grids), only the three prompt arms. These slot into the drift-suite-era
harness conventions (metrics scripts, fixed seeds, per-run manifests).

## 8. Verdict summary

The thesis is **substantially correct and unusually well-computed for
community output** — corrections: one arithmetic inversion (claim 4's
interval count), one unstated coupling (audio retiming, §4.3), one
attribution slip (`res_multistep`/`seeds_2` are ComfyUI core from the
Cosmos lineage, not the RES4LYF pack — that pack's H3 role is `beta57`),
and the latching theory (structure-latching is real and official; TV/movie
content-latching is unsupported). The load-bearing insights (native
high-noise concentration, scheduler floor separation, distillation
trajectory-pinning now card-documented end-to-end, prompt-side dominance
via H3-Context-IR) all check out against code, cards, and shipped source
packages. Two facts newly on record from the pass: **no official
"trained at shift 12" statement exists** (12/3 is convergent engineering
inference — the closest official artifact is MiniMax's own Apache-2.0
source package serving a 50-point euler schedule at 12/3, with ComfyUI's
res_multistep/20 the measured-equivalent reformulation), and **FastH3's
official template deviates to shift 10**. The area is genuinely
under-measured: nobody has published a controlled H3 grid-shape × shift ×
resolution study — exactly the gap X1–X3 fill, and the reason the user's
"no silver bullet, that's why they're knobs" conclusion is the honest
endpoint of folklore. Our answer is to turn the folklore into calibrated
dials (S1–S7) and measurements (X1–X7).
