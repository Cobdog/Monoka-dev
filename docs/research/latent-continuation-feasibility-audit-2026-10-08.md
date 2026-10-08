# Latent-continuation feasibility audit — proceed-with-adjustments

**Provenance:** the external Codex audit commissioned by the maintainer
(2026-10-08) ahead of the latent-chain continuation increment; inspected
HEAD `806e055`, repository + canonical engine sources read-only, no engine
contact. Preserved verbatim as the durable record per the documentation
protocol; the SDD ledger carries the program context.

---

**Verdict: proceed-with-adjustments.** There is enough evidence and
installed engine support to specify a narrow, durable latent-continuation
lane. There is **not** enough evidence to promise better motion, lower
cost, broad tween equivalence, or restart-safe execution without a live
persistence probe.

The key adjustment is conceptual: **Set K tested fresh-noise continuation
from a completed clip's latent, not exact resumption of interrupted
diffusion and not Motion Context prefix extension.** Those require
different state contracts.

### 1. Evidence: credible, but narrowly scoped

**The parity finding is usable as motivation for an increment, not as its
acceptance criterion.** Set K used one matched head-turn, one initial
seed, one style, and a particular base/adapter/scheduler configuration.
The eye called the tween-versus-latent pair indistinguishable. That
establishes a useful result under those conditions, without establishing
general equivalence. (gpu-batch-setK-results.md:10, :16, :208)

The latent arm genuinely chained: one five-beat graph, sampler output zero
into the next sampler, both image references fixed, captions changed, new
noise seeds after beat one — not five independent generations. It did
**not** exercise persistence, separate submissions, engine restart, or
rehydration. (setK_lib.py:173, :190, :194, :204)

Its creative result matters more than the parity headline:

- Beat one was bit-identical to tween step one (a graph-integrity control,
  not independent evidence for the continuation mechanism).
- Beats two through five held the already-arrived frontal pose despite
  mid-arc captions.
- Identity and style held through four continuations, with small measured
  wander.
- The recorded latent fill cost ~32 minutes vs ~16 for the five tween
  clips.

(gpu-batch-setK-results.md:37, :74, :76, :79, :92)

**Recommended interpretation:** a promising state-preserving
variation/continuation mechanism. The evidence does not yet establish a
motion-directing mechanism.

The m-scalar distinction needs an explicit correction in the new spec:

| Operation | Actual state contract |
|---|---|
| Exact continuation of an unfinished diffusion trajectory | The sprint established the link correction `m = (1−σ₁_last)/(1−σ₂_first)`. |
| Set K continuation from a completed, terminal-zero clip | Feed the completed latent into a new, partially denoised generation with fresh noise. The engine applies `σ·noise + (1−σ)·latent`; no additional m-scalar is needed for terminal-zero exits. |

(gpu-batch-setE-results.md:73, :78; setK_lib.py:176;
/home/agent/comfyui/comfy/model_sampling.py:94)

**Do not blindly apply the exact-resumption ratio to Set K-style
re-noising** — that would change the tested recipe.

Other claims a design should not lean on:

| Claim | Limitation |
|---|---|
| "Latent chains are safe/stable." | Demonstrated over four continuations of this already-arrived pose; not arbitrary motion or long chains. |
| "Ten-step drift was tested." | The extended drift finding concerns the tween chain; the latent arm has five beats. |
| "Landing fractions control progress." | The assessment calls them a lever; Set K found the tested fractions indistinguishable. |
| "Approach steps show continued advancement." | The eye says "nominally advancing"; the measured report says arrival occurred in the first clip. Treat the preference as aesthetic. |
| "Any adapter can use latent continuation." | The experiment used the tween LoRA. Hero and sequence latent behavior is unestablished. |

Reproducibility note: Set K names the int8 text encoder; the current graph
module's captured names include an NVFP4/AWQ encoder. A probe must record
the actual resolved model set rather than assume the current runtime
reproduces Set K. (setK_lib.py:40; shared/animation/graphs.ts:83)

### 2. Engine: the necessary primitives exist, but no ready-made animation landing contract

The canonical configuration points LoRA discovery at
`/home/agent/models/loras`; the three keyframe adapter symlinks are there.
(extra_model_paths.yaml:8; shared/animation/graphs.ts:72)

**What exists:**

| Engine capability | Concrete availability |
|---|---|
| Return a sampler latent | `SamplerCustomAdvanced` returns sampled + denoised output; Set K chains output zero. (nodes_custom_sampler.py:1058, :1072) |
| Feed a prior latent into sampling | `SamplerCustomAdvanced.latent_image` accepts a latent dict into the guider. (nodes_custom_sampler.py:1040, :1055) |
| Apply the boundary scalar | `LatentMultiply` multiplies latent samples. (nodes_latent.py:73, :90) |
| Reproduce Set K's residual schedule | `BasicScheduler` densifies by `steps/denoise`, takes the final `steps+1` sigmas. (nodes_custom_sampler.py:33) |
| Save/load complete H3 AV checkpoints | Installed T8 `MiniMaxH3NativeLatentCheckpointSaveT8Advanced` / `…LoadT8Advanced`: atomic safetensors persistence, hashes/manifests, verification. (nodes_native_latent_checkpoint_advanced.py:23, :105) |
| Reconstruct sampler-compatible H3 state | T8 rebuilds the video/audio `NestedTensor` + optional nested noise masks. (native_latent_checkpoint_advanced.py:389, :408) |

The T8 nodes are in the extension's node list; offline inspection cannot
establish successful registration in a running engine.

**What is not available in the form the increment needs:**

1. **No latent reference input on `MiniMaxH3ReferenceToVideo`** — its
   references are images/frames/audio; it creates a separate empty AV
   sampling latent. A continuation retains image conditioning and replaces
   the sampler's initialization. (nodes_minimax_h3.py:259, :286, :292)
2. **Stock SaveLatent/LoadLatent is not an adequate H3 checkpoint
   contract** — stock treats `samples` as one tensor; H3's native state has
   separate video and audio streams in a NestedTensor. (nodes.py:556,
   :578; nodes_minimax_h3.py:85)
3. **Motion Context's loader is not a sampler-state loader** — it returns
   a plain video/audio list for its own context input, unsuitable for
   decoding; its indexed save mode can overwrite a re-roll's slot,
   conflicting with immutable retained alternatives. (ComfyUI-H3-Motion-Context/nodes.py:1044, :1077, :1140)
4. **T8 persistence does not automatically provide an HTTP completion
   receipt** — the save node returns path/hash/manifest as execution
   outputs; ComfyUI history's `outputs` is assembled from UI outputs.
   Monoka cannot discover those strings through the existing history
   parser without an additional receipt mechanism.
   (nodes_native_latent_checkpoint_advanced.py:85, :97; execution.py:826)
5. **Checkpoint integrity is not model compatibility** — T8's manifest
   records tensor content/shapes/dtypes/masks/metadata, not that a
   different base/adapter/VAE/schedule/conditioning produces compatible
   continuation. (native_latent_timeline_advanced.py:285)

**Recommended engine strategy:** evaluate the installed T8 checkpoint
pair as the persistence primitive; retain the tween adapter's
image-conditioning contract; feed a verified checkpoint into
`SamplerCustomAdvanced`. Preserve both AV streams even though the module
produces silent video — its graph omits audio decoding, not H3's internal
audio latent. (shared/animation/graphs.ts:275, :279; nodes_minimax_h3.py:85)

### 3. Architecture fit: additive, with several explicit changes

The module can absorb this lane **without weakening image references**,
provided latent state is a separate typed input/output relationship.

| Seam | Current behavior | Recommended change |
|---|---|---|
| Frozen attempt | Image-typed references; validation requires image assets. | A separate, discriminated continuation binding: source attempt, artifact identity/digest, state convention, compatibility fingerprint. Image references intact. (types.ts:107; rendering.ts:949) |
| Graph building | Sampler initialization always from the conditioning node's empty latent. | Branch initialization fresh-latent vs verified loaded checkpoint; freeze the continuation schedule and seed. (graphs.ts:270) |
| Artifact transport | Completion parsing collects `images`; unknown extensions become video. | Explicit artifact roles + latent receipt/materialization; never infer a latent is video from its extension. (rendering.ts:447, :491, :311) |
| Landing | Owner chooses `outputs[0]`; store persists one media candidate. | Land a designated playable clip PLUS a designated latent artifact; persist latent preparation independently; retry it without re-rendering. (completion-owner.ts:199; store.ts:1045) |
| Selection | Rolling-reference selects attempt + frame index. | Explicit latent-source selection — a whole-clip latent is not the latent of an arbitrarily selected decoded frame. (store.ts:735; setK_lib.py:204) |
| Idempotency | SHA-256 over the canonical snapshot; retries compare hashes. | Retain; include latent identity, content digest, recipe version, compatibility fields in the frozen snapshot. (types.ts:509; rendering.ts:1205) |
| Project archive | Recursively collects `relPath` from document/snapshot/result. | Register latent references via that convention; schema migration + round-trip acceptance. (documentArchive.ts:32, :276; store.ts:65) |
| Sequence export | Requires a video candidate; manifest carries snapshot + landed media. | Video assembly unchanged; extend provenance with latent dependency identity + compatibility metadata; decide separately whether checkpoint bytes ship in sequence exports. (export.ts:278, :359, :451) |

The strongest resistance is **selection semantics**. Existing review
selects a specific frame; Set K continues the complete clip latent.
Silently equating them makes the visible choice differ from the
generation input.

Two distinct readiness concepts are recommended: **playable/reviewable**
and **continuation-ready**. A landed video with a failed checkpoint
transfer stays usable for editorial/export; latent continuation refuses
with an actionable reason. The owner's single ready transition needs an
explicit additional artifact state. (completion-owner.ts:199, :207)

### 4. Ranked risk register and required decisions

| Rank | Risk / unknown | Resolution / recommended answer |
|---|---|---|
| **1 — release blocker** | Separate-job persistence may differ from Set K's in-memory chain. | **Live probe: durable boundary parity** — fixed-seed two-beat in-memory chain vs save → restart → verified load → identical second beat; compare both latent streams and decoded frame hashes; equality where deterministic, else a tight explained tolerance. |
| **2 — release blocker** | No proven durable completion receipt for the checkpoint. | **Live probe: receipt and recovery** — video + checkpoint output, inspect actual history, restart before landing, prove discovery/transfer/hash-verification/reconciliation without another GPU render. |
| **3 — high, product** | "Continue" may mean preserve, extend time, refine, or direct a new pose. | Scope v1 to **Set K-style completed-latent re-noising**, explicitly experimental. Exact resume and prefix extension are separate increments. |
| **4 — high, product + live** | User-selected frame vs whole latent conflict. | Select a source **attempt/checkpoint**, independent of the rolling image frame. Frame-specific latent continuation blocks pending a temporal-slicing probe. |
| **5 — high, policy** | Compatibility across models/adapters/sizes/lengths/conventions. | Fail-closed: same resolved model/adapter fingerprints, latent layout, geometry, length, declared terminal-zero convention. Probe any relaxation individually. |
| **6 — high, live quality** | State preservation may suppress intended motion. | **Probe: unsaturated motion matrix** — larger arcs, body movement, multiple seeds, changed captions vs tween; measure pose advancement, identity, cadence, drift; blind review. |
| **7 — important** | Re-rolls/cancellation/deletion could orphan latent dependencies. | Immutable artifacts per attempt; explicit source selection; retain artifacts referenced by frozen descendants; idempotent checkpoint landing independent of candidate order; avoid Motion Context's overwritable slots. |
| **8 — important** | Cost and storage value unproven. | **Probe: resource envelope** — wall time, checkpoint size, transfer/hash latency, memory at the production model set. Do NOT advertise speed: Set K's latent fill was slower. |
| **9 — important, product** | Export portability vs archive size. | Sequence export: video + latent provenance by default. Project/resumable archive: referenced checkpoint bytes included. Resumable sequence package optional. |
| **10 — important, scope** | Hero/sequence support speculative. | Start with the tested tween-conditioned lane; adapter-specific probes before any expansion. |

**The spec must answer:** (1) the supported operation — completed,
terminal-zero latent re-noising with fresh noise; (2) the user selects a
source attempt/checkpoint, separately from image-frame selection; (3)
Set K's fixed image pair initially — changing it is a new recipe; (4)
compatibility = an explicit, versioned fingerprint checked before
dispatch (content hashes and shape checks alone insufficient); (5) freeze
+ hash: source artifact identity/digest, source attempt, compatibility
descriptor, state convention, schedule recipe, seed, existing
image/caption inputs; (6) durability: engine receipt → verified blob
transfer → persisted artifact binding, surviving engine history loss; (7)
checkpoint preparation failure preserves the playable candidate, refuses
latent continuation, retries preparation without re-rendering; (8)
invalidation: explicit source-checkpoint replacement + relevant
conditioning/compatibility changes, historical attempts preserved; (9)
export: playable media + provenance by default, checkpoint bytes in
resumable archives; (10) the release gate: durable boundary parity,
restart/reconciliation recovery, explicit source selection, compatibility
refusals, and a useful motion-quality result — not merely another
visually stable hold.

**Proceed to the spec and probe design. Hold production implementation
behind the first two live probes; hold any promise of improved animation
behind the motion-quality probe.**
