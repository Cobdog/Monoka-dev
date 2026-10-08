# Latent-continuation strategic review — rethink the v1

**Provenance:** the maintainer-commissioned independent strategic review
(2026-10-08, external, with independent research) challenging the
latent-continuation approach itself; tree reviewed at `ac905b1`, engine
sources + upstream projects + community reports researched read-only.
Preserved verbatim per the documentation protocol.

---

**Verdict: rethink the proposed v1, while retaining the latent-artifact
foundation as a possible implementation component.**

The prior audit establishes technical plausibility. It does not establish
that Set K-style re-noising is the right next product feature. The
priority changes: **first demonstrate useful continuation of motion into
new time; then prove durability for the winning method.**

Set K's implementation feeds the previous **entire clip latent into the
same-sized temporal window**, with fresh noise and fixed image references.
It does not shift a tail into a new window or append ungenerated frames.
That is a variation/refinement recipe producing successive clips — not
demonstrated temporal extension. Its observed continuations held the
already-arrived pose. (setK_lib.py:173, :190, :204;
gpu-batch-setK-results.md:74, :92)

## What the ecosystem changes

The strongest relevant practice found: **preserving a preceding motion
window and generating a new suffix**. "Latent continuation" covers several
materially different mechanisms:

| Practice | What it carries forward | Evidence and limits |
|---|---|---|
| H3 Motion Context | Previous tail latents become positioned conditioning blocks in a fresh generation; the repeated head is trimmed. | Public implementation + workflows; the maintainer explicitly bounds perceptual testing and acknowledges compounded degradation. github.com/NikoDemon80/ComfyUI-H3-Motion-Context |
| H3 MultiRef / masked extension | Preserved context plus a new generation region, explicit timing/mask contracts. | Extension, bridging, motion transfer, custom keyframes; README explicitly says cache reuse does NOT provide disk resume across restarts. github.com/seitanism/ComfyUI-H3-Motion-Context-MultiRef |
| H3 Context Loop | Scene-level continuation with accepted takes, checkpoints, review, retries, assembly. | Separates continuity checkpoints from preview/editorial alternates — a useful Monoka precedent; upstream implementation claims, not independent quality certification. github.com/ethanfel/ComfyUI-MiniMaxH3-Context-Loop |
| LTX extension | Clean prefix/suffix latent conditioning alongside generated regions. | Official training docs treat extension as a distinct conditioning mode; supports the mechanism distinction, not H3-adapter compatibility. github.com/Lightricks/LTX-2 (ltx-trainer training-modes) |
| Wan / Stable Video Infinity | Continuation-specific training with motion history and error recycling. | SVI identifies autoregressive exposure to generated errors as a training problem; its success cannot transfer to H3 by adding persistence. github.com/vita-epfl/Stable-Video-Infinity |
| H3 overlap-trajectory replay | Saves overlap states throughout denoising and replays them in the next window. | H3-Seamless reports a ~40-second example but ships methodology, not an installable renderer, at ~126 GiB peak. Research context, not a practical dependency. github.com/yjrocks712/H3-Seamless |

No basis for claiming one universally accepted community recipe; the
ecosystem has multiple approaches and unresolved failure modes.

Recency, nuanced: Motion Context's dated release is September 6; native
arbitrary H3 keyframe anchors arrived in ComfyUI 0.34.0 — both PREDATE
Set K (the experiment's narrow comparison omitted an already-existing
alternative). ComfyUI 0.39.0 adds H3 light-VAE support, SaveVideo encoding
default changes, VAE offloading fixes — reproducibility/cost matters, not
a new continuation contract. T8 upstream has advanced beyond the installed
checkout (stage/cold-load, temporal-window workflows) with nothing
evidencing latent extension WITH Monoka's keyframe adapters. No verified
newer official H3 capability makes the proposed lane turnkey.

## The alternatives, honestly weighed

| Approach | Buys | Limitation | Recommendation |
|---|---|---|---|
| Set K whole-window re-noising | Retains sampled state without pixel re-encode; identity/style held in the tested case. | Four continuations mostly held the arrived pose; ~32 min vs ~16 for tween; no demonstrated tail-to-head motion continuity. | Keep as an experimental comparison arm or a separately named variation feature. |
| Longer single generations | Removes inter-clip handoffs and checkpoint dependencies. | Adapter behavior beyond 22 frames is an identified unknown; longer sampling does not establish better motion. | **Test early** — could satisfy the need with much less infrastructure. |
| More tween steps | Fits the existing workflow. | Steps 2-10 were near-stills after first-step arrival on the tested beat; more steps did not buy gradual advancement. | Preserve as the baseline; not a solution. |
| FL2VA first-frame chaining / guides | Strong visible start anchoring; straightforward frame-based source choice. | Set K's guided FL2VA arm reproduced the arc but lost the preferred drawing cadence (a guided 107-frame render; not a general proof). | Useful control arm; do not promote to default from this evidence. |
| Motion Context tail conditioning | Supplies PRECEDING MOTION, not only a pose/initialization; generates new time. | Requires overlap budgeting, phase alignment, prompt changes; keyframe-adapter cadence/identity untested; installed code rejects a context as long as the target (nodes.py:459). | **Best candidate to challenge Set K in a prototype comparison.** |
| Defer continuation | Avoids building a second expensive lane without demonstrated creative value. | Leaves longer continuous animation unresolved. | Prefer if neither longer generation nor context extension clearly benefits. |

The recorded ~2× wall-time difference is a WARNING, not proof of inherent
cost: both recipes use 30 executed sampling steps per beat; the difference
needs profiling before becoming a design assumption.

## Independent verification of the audit's three load-bearing claims

1. **The m-scalar distinction is correct; "exact resumption" needs
   qualification.** Entry `σ·noise + (1−σ)·latent`; exit
   `latent/(1−σ_terminal)`; with noise disabled the boundary ratio is
   `m=(1−σ₁_terminal)/(1−σ₂_initial)`. For Set K's terminal-zero +
   intentional fresh-noise re-noising, the unscaled completed latent IS
   the clean initialization. CORRECTION: the ratio preserves a state
   coordinate, not exact diffusion resumption — sampler history,
   stochastic state, conditioning, model transforms, and schedule must
   also agree (Set E records a trajectory change after multistep history
   reset). T8's checkpoint persists a complete native latent, NOT the
   internal state of an interrupted diffusion step.
2. **The missing T8 history-UI receipt: VERIFIED** — an integration gap,
   not unavailability. Monoka compounds it: the parser reads `images` and
   classifies every non-image filename as video (rendering.ts:461, :505).
3. **The whole-clip vs selected-frame problem: VERIFIED — and extends
   into editorial trims.** "Continue from the end" is ambiguous after a
   user trims a clip (raw end? editorial endpoint? chosen frame?). For
   tail-conditioned extension it becomes a window-selection problem; the
   installed Motion Context permits particular tail windows with temporal
   phase checks, not arbitrary interior-frame slicing (nodes.py:214, :232,
   :241). Upstream Context Loop explicitly preserves checkpoint ancestry
   despite preview/assembly changes — Monoka should make that distinction
   equally visible.

## What the spec must not miss

1. **Define the creative operation before choosing the artifact** —
   "extend motion," "make a related variation," and "resume interrupted
   sampling" need different contracts. Make temporal extension the
   product question; keep Set K re-noising as a control arm.
2. **Make useful motion a prerequisite for implementation** — passing
   persistence tests for an inert recipe is insufficient reason to build
   the lane.
3. **Budget overlap in generated AND delivered time** — the installed
   Motion Context trims the pinned head; its default 22-frame context
   cannot fit Monoka's default 22-frame generation (the node refuses);
   prompt times refer to the sampled window, so delivery times shift
   after trimming (graphs.ts:50; nodes.py:459, :662).
4. **Surface conditioning collisions** — Motion Context drops anchors
   inside its pinned head with a log warning; in a directed editor,
   losing a user-authored anchor must be an explicit preflight refusal or
   acknowledged change (nodes.py:645, :651).
5. **Test motion continuity, not only seam appearance and identity** —
   measure direction/speed across the boundary, pose advancement,
   duplicate/frozen frames, on-twos cadence, color drift. A stable face
   or invisible cut can coexist with stalled animation.
6. **Treat clean context as a tradeoff** — community reports include
   color drift; a separate context-noise project weakens carried
   appearance during character swaps while preserving readable motion:
   cleaner carried state is not always better creative control
   (Motion Context issue #44; github.com/beijinren/ComfyUI-H3-Context-Noise).
7. **Keep image conditioning, continuation ancestry, and editorial
   selection separate** — preserve typed image references; add an
   explicit continuation binding and artifact role; hash immutable
   identity + recipe metadata, not an engine slot path.

## The recommended v1 decision

The proposed scope is appropriately cautious about compatibility but
prematurely committed to the Set K mechanism; experimental labeling does
not compensate for unclear user benefit. Before selecting the lane,
compare: existing tween; a longer single adapter generation; Set K
whole-window re-noising; Motion Context tail-conditioned extension —
matched delivered duration, multiple seeds, an unsaturated head turn,
body motion, a change of direction; judged blind for drawing style,
identity, actual advancement, boundary continuity; render and artifact
costs recorded.

If tail conditioning wins: a narrow, explicit-review extension lane with
one validated overlap recipe and immutable checkpoints. If Set K wins
only at related variations: ship it under that meaning. If neither beats
existing workflows: defer continuation.

**The fresh evidence changes which mechanism deserves the first
experiment; it does not yet justify shipping any of them.**
