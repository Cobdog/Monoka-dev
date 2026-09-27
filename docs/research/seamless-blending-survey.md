# Seamless blending — the match-the-canvas survey (classical toolkit, diffusion-native, color matching, the blend-back stack)

> Compiled 2026-09-27 for directive `8dce5967` (epic `4lphxv8`, the image workbench;
> no Flux task per the dispatch instruction — the coordinator places this). Feeds the
> workbench v2 spec round (mnz1ood, whose named contract is the marquee round-trip).
> The problem, precisely: when a generated region returns to the canvas and lands as
> a new layer at the source geometry, it must MATCH what surrounds it — or the
> composite reads as collage. Five failure axes: **seams** (frequency/texture
> discontinuity at the boundary), **color drift** (the patch grading differently),
> **grain/noise mismatch**, **focus/blur falloff mismatch**, **lighting
> inconsistency**.
>
> **METHOD.** (1) Repo grounding at `main` `e9b1dd3`: the workbench spec's refine
> op-stack and tone-lock op (`src/lib/h3imageOps.ts` — the band-split DSP we already
> ship), the inpaint lane's prefill/restore composite pair and its hard-boundary
> warning (`src/lib/graph/h3image.ts`), the O-arms/seam-metric conventions
> (`h3-overlap-concept.md`, `h3-transitions-and-latent-continuity.md`), the prior-art
> survey's opencv-js/library candidates (`image-workbench-prior-art.md`), the
> openOutpaint overmask mechanism (`openoutpaint-core-vision.md`). (2) Web passes on
> 2026-09-26/27: primary sources fetched where load-bearing (the @techstark
> `cvKeys.json` availability manifest, the jradice/blending repo, papers' abstract
> pages); search-mediated claims are **[API-2026-09-26]** (fetched source) or
> **[COMM]**; classical-algorithm descriptions carry paper citations and are
> **[SPEC]** where I reason from the math rather than a fetched text. No GPU, no
> engine, no installs. House tags: **[DOC]** verified in shipped code / official
> source we hold, **[UNK]** nobody knows.

---

## 0. Verdict summary

| # | Question | Verdict | Confidence |
|---|----------|---------|------------|
| A | **What fixes what, in the classical toolkit?** | Nothing fixes everything; the families compose. Feathered alpha fixes the hard-edge seam only. **Multi-band (Laplacian-pyramid) blending fixes the frequency seam per band** — the closest thing to a general post-process answer — but does not correct a global mis-grade. **Poisson/gradient-domain fixes color+lighting adaptively** (reconstructs the patch from its gradients under the destination's boundary conditions) at the cost of bleeding/ghosting and a real solver. Optimal-seam/graph-cut methods place the boundary where the images already agree — powerful in mosaics, mostly inapplicable at a fixed round-trip geometry. | **High [papers + DOC]** |
| B | **Does any of it exist as usable JS/WASM?** | **No — and less than the prior survey implied.** The one production-grade JS Poisson (`cv.seamlessClone`) is **absent from the @techstark/opencv-js build we candidate-adopted** (checked against the package's own `cvKeys.json`: `inpaint`/`pyrDown`/`pyrUp` present, `seamlessClone` missing) [API-2026-09-26]. The npm `poisson-blend` is dead C++ bindings (Node-only); no maintained JS multi-band blender exists (the closest repo is unlicensed Python course code); no JS learning-harmonizer exists at all. The classical blend stack is **ours to own** — and most of it is small. | **High [API]** on absences |
| C | **Is model-side better than post-process?** | **Split by failure axis, not by fashion.** Model-side (blended-latent / overlap-conditioning / a low-denoise harmonize pass) is the only thing that fixes *lighting and texture coherently* — it re-synthesizes them. Post-process is the only thing that *guarantees preservation* (never-worse fallback, determinism, purity, no engine pass) and the only thing that works when the engine round-trip is unwanted. Our H3 inpaint lane regenerates the whole frame, so a restore composite (and hence a blend-back) is **structurally required** — the model-side and post-process stacks are complements, not competitors. | **High [DOC our graph + papers]** |
| D | **The ranked composite stack for the canvas round-trip?** | **Grow-at-generation → annulus color match → masked multi-band blend → (opt-in) grain/acutance match**, all app-side at the canvas layer boundary; **SDEdit seam-band re-denoise** as the opt-in engine-side quality tier (the video arm-S ported to stills); native **latent denoise-mask with feathered ramps** as the generation-time seam preventer (gated on the #15981 grid artifact). Poisson deferred; graph-cut seam in the grown ring is the v2 idea. §4. | **High on the ranking logic; the arm order is a testable prediction, not a measurement** |
| E | **The insight that changes the design?** | **The blend-back is not a new tool — it is the masked, multi-band generalization of the tone-lock op we already ship.** `toneLockBlend` is a one-band pyramid blend with a global (unmasked) application and a "target owns low frequencies" contract; the canvas blend-back is the same band-split core with a mask pyramid and a "surroundings own low frequencies near the seam" contract. One frequency-blend module, two entry points, one test discipline — extend `h3imageOps.ts`, don't add a dependency for it. §4.2. | **High [DOC]** |

---

## 1. The classic algorithms (the post-process toolkit)

### 1.1 Poisson blending / gradient-domain fusion (Pérez et al. 2003)

The reference: **Pérez, Gangnet, Blake, "Poisson Image Editing," SIGGRAPH 2003** —
paste the patch's *gradient field*, not its values, into the destination and solve
the Poisson equation with the destination pixels as Dirichlet boundary conditions
([ACM DL](https://dl.acm.org/doi/10.1145/882262.882269)).

- **What it fixes:** seams AND color/lighting in one mechanism — the reconstruction
  has no boundary condition to disagree with (the seam's Laplacian vanishes), and
  the low-frequency illumination of the destination flows into the patch by
  construction. This is the only classical method that adapts *lighting*, which is
  why it survives 20+ years as the reference answer.
- **Failure modes (well-documented):** **bleeding/ghosting** — strong destination
  gradients leak into the patch interior (Stack Overflow's canonical
  [ghost-objects report](https://stackoverflow.com/questions/49008854/using-seamlessclone-in-opencv-python-produces-image-with-ghost-objects));
  **boundary sensitivity** — the whole result hangs on the boundary ring, which is
  Jia et al. 2006's motivation (below); **contrast flattening** over large
  low-gradient regions (the solver integrates small gradient errors over area);
  OpenCV's own docs concede the halo problem class
  ([photo__clone](https://docs.opencv.org/4.10.0/df/da0/group__photo__clone.html)).
  Modes matter: `NORMAL_CLONE` (full gradient) vs `MIXED_CLONE` (per-pixel
  stronger-gradient-wins — trades bleeding for background-texture invasion, cf.
  [LearnOpenCV's comparison](https://learnopencv.com/seamless-cloning-using-opencv-python-cpp/))
  vs `MONOCHROME_TRANSFER` (luminance-only — the color-transfer mode).
- **Complexity:** a sparse linear system over the patch area. In C++ OpenCV it is
  fast but **scales with total image size even for small masks**
  ([opencv#5045](https://github.com/opencv/opencv/issues/5045)); a JS
  implementation wants multigrid or FFT/DCT (solve in the frequency domain via the
  eigenfunctions of the Neumann problem) — **~300–500 lines TS** for a
  jacobi/multigrid solve at canvas resolutions [SPEC], plus real perf attention at
  8 MP.
- **JS/WASM:** see §1.5 — effectively absent.

### 1.2 Laplacian-pyramid / multi-band blending (Burt & Adelson 1983)

The reference: **Burt & Adelson, "A Multiresolution Spline With Application to
Image Mosaics," ACM TOGRA 1983** (the "multiband blending" of Brown-Sutherland
stitching is the same machinery). Build Gaussian pyramids of both images and of
the mask; form Laplacian pyramids of the images; blend each band with that band's
*own* blurred mask; collapse.

- **What it fixes:** the **frequency seam** — the exact failure where a hard edge
  looks fine at low frequencies but rings at high frequency (or vice versa). Each
  band crosses over at a width proportional to its wavelength, so the transition
  is band-appropriate everywhere. This is what our failure axis #1 actually is.
- **What it does NOT fix:** a global color mis-grade survives (low bands blend
  *values*, so a wrong-grade patch contributes its wrong low frequencies deep into
  the seam); lighting inconsistency survives; misalignment ghosts per band.
  **Compose with a color match first** (§3) — the stack, not the algorithm.
- **Failure modes:** ghosting on content misalignment (each band double-exposes);
  cost is trivial — pyramids are O(n) per level, log n levels. **~150–200 lines TS
  over the band-split core we already have** [SPEC, and §4.2's kinship argument].
- **JS/WASM:** nobody ships it (§1.5).

### 1.3 Optimal-seam / graph-cut / patch-synthesis lineage

- **Jia, Sun, Tang, Shum, "Drag-and-Drop Pasting," SIGGRAPH 2006**
  ([ACM DL](https://dl.acm.org/doi/10.1145/1141911.1141934)): observes Poisson's
  boundary sensitivity and **computes the optimal boundary** — a shortest closed
  path through the color/gradient-difference matrix around the paste perimeter —
  before blending. The dispatch's "ObjectiveEdit" is **not locatable** under that
  name [UNK — searched several ways]; the confirmed canon around it is
  **Agarwala et al., "Interactive Digital Photomontage" (SIGGRAPH 2004)** —
  graph-cut seams over an image stack — and **Kwatra et al., "Graphcut Textures"
  (SIGGRAPH 2003)**; **Darabi et al., "Image Melding" (TOG 2012)** generalizes to
  patch-based synthesis as harmonization.
- **What it fixes:** the seam *placement* problem — where mosaic tools have
  freedom to move the boundary, cutting where the images already agree makes the
  subsequent blend nearly free.
- **Applicability to us — mostly no, one yes:** our round-trip lands at **fixed
  source geometry**; the boundary is the mask, not a free variable [DOC: the
  marquee round-trip contract]. The exception: **the grown generation ring** (§4.1
  step 1) *is* free territory — the seam may wander inside content the engine
  re-rendered. Graph-cut inside that ring is the v2 candidate (needs a min-cut
  solver — own implementation; OpenCV.js ships `grabCut` but not a general
  max-flow API on our candidate build's manifest).
- **JS/WASM:** none maintained.

### 1.4 Feathered alpha compositing done right

The floor everyone actually stands on: dilate/blur the mask (or distance-transform
+ gaussian), composite premultiplied-over. **Fixes:** the hard edge only — it
*averages* the discontinuity instead of removing it (double-exposure ghosting when
content is misaligned; blur-width visibly wrong when it exceeds the texture scale).
The lineage's shipped wisdom, which we hold in-tree:

- **openOutpaint's overmask** [DOC, our `openoutpaint-core-vision.md`]: mask
  dilation grown as `^(px/8)` over the content boundary "so the seam region joins
  the regenerated content," plus a configurable blur "so the regenerated seam
  blends."
- **InvokeAI's outpaint paste-back** [DOC, prior-art survey §1.5]: a gradient mask
  + a Gaussian-blur edge-coherence pass + `img_blend` — they ship exactly the
  grow+feather+blend triad as graph nodes.
- **ComfyUI practice** [COMM]: `GrowMaskWithBlur` ("the node that turns a
  hard-edged mask into one that inpaints cleanly"), Inpaint-CropAndStitch's
  `blending_radius` — grow a little, feather a little, is the community's
  load-bearing default.

**The correct floor for us**, and the base case of the multi-band stack: a
feathered composite where the feather crosses only *engine-re-rendered* pixels
(§4.1 step 1 makes that true).

### 1.5 The JS/WASM availability matrix (the port-cost truth)

| Algorithm | Browser-grade JS/WASM today | Port cost if we own it | Evidence |
|---|---|---|---|
| Poisson / seamlessClone | **Effectively no.** `cv.seamlessClone` is **absent from @techstark/opencv-js's build manifest** — its own `cvKeys.json` (~1,250 keys) lists `inpaint`, `pyrDown`, `pyrUp`, `Laplacian`, `createHanningWindow`, and the `*_CLONE` enum *flags*, but not the function [API-2026-09-26, fetched `doc/cvKeys.json`]. Official docs.opencv.org never shipped a JS seamlessClone tutorial; 4.x-era community usage exists but is unverifiable for our pinned build [COMM/UNK]. npm `poisson-blend` (Erkaman) is dead C++ native bindings, Node-only [API]. | **~300–500 lines** (multigrid or DCT-FFT solver) + 8 MP perf work — or a custom opencv.js build with photo-clone bound, which is *owning a build*, worse than owning the solver | cvKeys.json fetch; npm/GitHub |
| Laplacian-pyramid / multi-band | **No maintained package.** Closest: `jradice/blending` — Python, unlicensed, course assignment [API-2026-09-26]. Tutorials exist (becominghuman.ai class walkthrough [COMM]). | **~150–200 lines** over our existing band-split core; opencv-js `pyrDown/pyrUp` can host it but adds nothing we lack | searches returned no npm hits for multiband/pyramid/laplacian blend |
| Optimal seam / graph-cut | No. (OpenCV.js `grabCut` exists; a general max-flow does not appear on the manifest check above.) | ~200–300 lines (BK max-flow) — v2, ring-only | — |
| Feathered alpha | Trivially ours already (Konva/canvas2D composite ops); `GrowMask`-class morphology via opencv-js if wanted | ~30–60 lines | [DOC our h3imageOps substrate] |
| Reinhard / histogram / MKL color transfer | **No dedicated package** — npm `color-transfer` is a HEX↔RGB↔HSL *format* utility (name collision) [API]; the only located JS implementation of the Lab mean/std math is inside `fxtdstudios/radiance` (app code, not a lib) [API]. `chroma.js`/`colorjs.io` give the color-space conversions only. | **~60 lines** Reinhard, **~80** histogram-LUT, **~120** MKL (3×3 eigensolves + axis rotations) | §3 |
| Learning harmonizers (Harmonizer-class) | **None in JS.** PyTorch + weights; no ONNX exports located for any of them | large (weights + onnxruntime-web module) — and unnecessary (§3 verdict) | — |

**Consequence:** the prior-art survey's "opencv-js gives six concerns in one
Apache slot" holds; but the implicit "classical blending rides free on it" does
not — **the candidate build does not export `seamlessClone`**. Runtime-verify
before any spec line depends on it (the manifest is the package's own
availability doc; treat as strong-but-recheckable).

---

## 2. The diffusion-native approaches

### 2.1 Blended-latent diffusion — mask-time latent compositing

**Avrahami et al., "Blended Diffusion" (CVPR 2022) and "Blended Latent Diffusion"
(arXiv 2206.02779, SIGGRAPH 2023)**: at *every denoising step*, spatially blend
the noised original with the edited latent using the mask — outside-mask pixels
stay the original's trajectory, inside-mask pixels follow the edit
([project page](https://omriavrahami.com/blended-latent-diffusion-page),
[repo](https://github.com/omriav/blended-latent-diffusion)). The insight that
matters for us: **the blend must happen per-step in latent space, not once at the
end** — an end-of-schedule blend re-introduces exactly the pixel-domain seam the
round trip already has.

- **Where we already hold this mechanism:** ComfyUI's H3 `denoise_mask` —
  per-token latent noise masks, 0 = preserve / 1 = regenerate, video masks
  snapping to 2×2 latent patches (PR #15375, documented on the native workflows
  page) [DOC, `ecosystem-2026-09.md`]; **feathered denoise ramps on boundary
  tokens** are shipped pattern in FL-MiniMaxH3 (Apache-2.0, ADOPT-verdicted in
  the node-ecosystem sweep) [DOC]. **Differential Diffusion** (arXiv 2306.00950)
  generalizes the binary mask to a *per-pixel noise-level map* — the model
  decides how much each pixel changes — and exists as a core ComfyUI
  `DifferentialDiffusion` node [COMM]; an H3 "Soft Denoise Zone (v2v)" wrapper
  exists in the wild [COMM/UNK — third-party site, not code-read].
- **The hazard we hold:** H3's `denoise_mask` path currently overlays a repeating
  **grid artifact** (open ComfyUI issue #15981, since commit ff6c8a8af) — any
  masked-latent arm must carry a per-version artifact check [DOC,
  `h3-sampler-shaping-and-motion-control.md`].
- **Honest scope note:** our stills lanes are conditioning-masked (the prefill
  composite rides Picture 1; the restore composite preserves outside-region
  pixels exactly [DOC, `h3image.ts` nodes 52–53]) — not latent-masked. The
  latent-mask path is the *generation-time seam preventer*: the boundary pixels
  themselves get partially denoised, so there is no full-strength seam to blend
  afterward. It is the strongest single mechanism in this section and the one
  gated by a known bug.

### 2.2 Overlap-conditioning — generate with the surroundings in view

The O-arms' video mechanism, already ours: condition generation on real
surrounding context so **the model itself matches the boundary** — openOutpaint's
context snapshot + overmask [DOC], Invoke's bbox context-window composite [DOC],
our prefill composite (the masked source with the region black-filled rides
Picture 1) [DOC]. The video-side finding to port: overlap-conditioning extends
*local* runway (seam/motion/variance) while global consistency needs other arms
(h3-overlap-concept §2.1) — the stills analog: **context conditioning fixes the
seam's texture statistics but not a global grade difference**; that remains
§3+§1.2 work.

### 2.3 The low-denoise harmonize pass — SDEdit over the seam band

**SDEdit** (Meng et al., ICLR 2022, arXiv 2108.01073 — already in our overlap
doc's source list): partially re-noise the composite and re-denoise under
conditioning = project toward the image manifold — which is precisely "make this
composite look like one photograph." Our **arm-S design ports to stills
unchanged in shape** [DOC, h3-overlap-concept §2.5 / §4.1]: re-noise the *seam
band only* (sigma start ~20–35% of schedule), flanks pinned (`denoise_mask` 0),
references attached, optional **RePaint-style 2–3 resample cycles** at the band
(Song et al., CVPR 2022, arXiv 2201.09873) for flank harmony. Cost: one short
engine pass over a band, not a frame-scale regeneration. Community practice
matches at cruder granularity: low-denoise img2img over the whole composite is
the standard "harmonize" move in every UI [COMM].

### 2.4 Model-side vs post-process — the honest split

| Axis | Model-side (2.1–2.3) | Post-process (§1+§3) |
|---|---|---|
| Frequency/texture seam | fixed at generation (no seam forms) or re-synthesized (2.3) | fixed deterministically (multi-band) |
| Color drift | fixed only incidentally (2.3 usually helps) | fixed exactly and reversibly (§3) |
| Grain/noise | re-synthesized coherently | matched statistically (band energy) |
| Lighting | **the only real fix** — re-rendered under joint statistics | Poisson approximates it; DSP cannot invent it |
| Preservation guarantee | **none** — hallucination channel opens; ring pixels drift unless pinned-and-verified | **exact** — never-worse fallback possible (our burst-fuse precedent) |
| Determinism / testability | seed-dependent, engine-bound | pure functions, vitest on crafted frames (h3imageOps precedent) |
| Cost | engine passes (GPU, queue) | milliseconds app-side |
| Availability | needs the engine wired (our round trip has it) | works on any layer, any source, offline |

**Verdict:** post-process is the *default* tier (deterministic, pure, always
available, exactly our op-stack doctrine); model-side is the *quality* tier for
lighting/texture incoherence the DSP cannot fix — opt-in, like refine (the
spec's "always opt-in, never automatic" amendment, jvcrud2). And structurally:
because H3 regenerates the whole frame, the restore composite (hence a blend-back)
exists no matter what — the stacks compose by necessity, not preference [DOC].

---

## 3. Color matching / harmonization — what's practical in JS today

- **Reinhard statistical transfer** (Reinhard et al., IEEE CG&A 2001): match
  per-channel mean/std in CIELAB, source→target. Global, cheap, surprisingly
  robust; fails when content statistics mismatch (a portrait ring vs a foliage
  interior). **~60 lines TS** (sRGB↔Lab conversion included). No npm package
  (§1.5) — ours.
- **Histogram matching** (per-channel CDF→CDF quantile LUT): the "hm" of the
  ecosystem; matches distributions not just moments; fails by cross-warping
  independent content (a bright sky region remapped onto dark interior tones).
  **~80 lines** (the LUT form is exactly a 1D-LUT op).
- **MKL / Monge–Kantorovich linear transfer** (Pitié et al. 2005): closed-form
  3×3 optimal-transport map between color distributions — the ecosystem's
  favorite (KJNodes' ColorMatch wraps the GPL-3.0 `hahnec/color-matcher` with
  methods `mkl/mvgd/reinhard/hm/hm-mkl/hm-mvgd/adain` [API-2026-09-26];
  the seam-correction node in the autocontext read uses MKL at its `high`
  setting; LBH's latent upscaler ships "two-level color match" [COMM/DOC-held]).
  **License note:** color-matcher and KJNodes are GPL-3.0 → pattern-only; the
  *math* is clean and small (~120 lines: iterate axis-aligned 1D transforms
  under a rotating basis). The maintained reference is worth reading before we
  write ours.
- **LUT approaches**: quantile-LUT per channel (≡ histogram matching), or 3D LUTs
  for style-grade reuse — InvokeAI already ships per-layer adjustments +
  curves-LUTs on raster layers [DOC, prior survey §1.3]; a solved 1D-LUT is the
  cheap artifact form of any of the above.
- **Learning-based harmonizers**: **Harmonizer** (Ke et al., ECCV 2022, arXiv
  2207.01322 — white-box intermediate steps), **iHarmonizer/CDTNet** (CVPR 2022),
  **DoveNet** (CVPR 2020), benchmarked on **iHarmony4**; the modern diffusion
  line is generative image composition (ORIDa, calibrated-reference composition,
  painterly harmonization — survey: Awesome-Generative-Image-Composition). **No
  ONNX/browser exports exist for any of them** [API-2026-09-26 — searched
  several ways], and none is needed: our mismatch is *round-trip statistics*
  (same engine, same model, adjacent geometry), not cross-domain insertion —
  exactly the regime the classical methods were built for. **SKIP the learned
  tier; revisit only if a cross-engine paste surface appears.**
- **The spatial cut none of them make:** all the above are *global* transfers.
  Our mismatch is *local* — the patch vs its immediate surroundings. **Match to
  the annulus** (a ring of the surrounding canvas at r ≈ the feather width,
  excluding the patch interior), not to the whole canvas: it localizes the
  correction, keeps the operator idempotent-ish, and gives the QC observable for
  free (§4.3's dE-across-boundary). VidPanos' overlap-agreement is the same
  ring-statistics pattern [DOC, pan-stitch-extension].

---

## 4. The composite pipeline recommendation (ranked, with falsifiers)

### 4.1 The ranked stack — marquee round-trip → layer lands at source geometry

| # | Step | Tier | What it buys | Cost |
|---|---|---|---|---|
| 1 | **Grow at generation, blend back at the ORIGINAL mask.** Generate with the mask grown by N px (overmask lineage); the eventual seam then sits *inside engine-re-rendered content* — both sides of the blend come from the same decode; continuity across it is model-guaranteed, and the DSP only smooths decode-internal variance. | engine-submit param + app-side blend | removes the worst seam class (regenerated-vs-preserved) structurally | ~N px of extra generation area |
| 2 | **Annulus color match** (Reinhard-on-ring first; MKL as the dial-up) of the returned patch against the surrounding ring, pre-blend. | app-side DSP | kills color drift | ~1 ms/MP |
| 3 | **Masked multi-band blend** — Laplacian-pyramid blend with a feathered mask, the per-band crossover widths pinned | app-side DSP | kills the frequency seam at every scale | ~5–15 ms/MP [SPEC] |
| 4 | **Grain/acutance match** (optional dial): estimate ring high-band energy + noise sigma; scale the patch's high band to match — fixes grain and focus-falloff mismatch | app-side DSP | kills axes 3–4 | ~2 ms/MP |
| 5 | **SDEdit seam-band re-denoise** (arm-S on stills): re-noise the band at σ≈20–35%, flanks pinned, refs attached, optional RePaint cycles — the opt-in quality tier | engine-side | the only fix for lighting incoherence | one short engine pass |
| 6 | **Native latent denoise-mask with feathered ramps** (FL pattern) as the generation-time preventer — alternative/complement to 5 | engine-side | prevents the seam forming at all | masked-latent path + #15981 grid-artifact gate |
| 7 | (deferred) **Poisson gradient-domain cleanup** — only if a lighting-mismatch regime appears where no engine pass is wanted; requires owning the solver (§1.5) | app-side, heavy | lighting adaptation without the engine | ~300–500 lines + 8 MP perf |
| 8 | (v2) **Graph-cut seam inside the grown ring** (Jia 2006 / Agarwala 2004 pattern) — the ring is free seam-placement territory | app-side | seams where images already agree | ~200–300 lines max-flow |

Design consequences: (a) steps 2–4 are **one module** (below); (b) step 1 changes
the submit seam (a mask-grow parameter on the lane graphs) — spec-round input;
(c) steps 5–6 stay behind the refine-always-opt-in doctrine; (d) **the blend runs
at the canvas layer boundary, not inside the engine graph** — the round trip's
layer is the object being made seamless, the op-stack is our deletable surface,
and the still-lane publish path keeps its exact-preservation composite
deliberately (its warning text is honest today [DOC, `h3image.ts`]).

### 4.2 The kinship: blend-back = masked multi-band tone-lock

`toneLockBlend` today: one band-split (box blur r=32), target owns low band at
0.85, refiner contributes high band at 0.55, global application, pure, pinned,
vitest-covered [DOC, `src/lib/h3imageOps.ts`]. The blend-back needs: N bands
(pyramid), a mask pyramid (per-band feather widths — the crossover schedule),
surroundings-own-low-near-seam / patch-owns-interior, and the same
never-worse/report/purity discipline. That is **the same operator with two
entries** (`blendGlobal` / `blendMasked`), sharing the band core — the spec
should name it as one frequency-blend module, not a new "seamless" dependency.
This also fixes a latent inconsistency: refine-lane and canvas-blend otherwise
grow two parallel band-split codepaths. The MLS precedent applies (prior survey
§3): small, load-bearing, nobody ships it — ours to own, worth owning.

### 4.3 Falsifier-first test designs (the epistemology's blind-pair battery)

Metrics we hold from the drift work, ported to stills [DOC, transitions + overlap
docs]: the **seam metric** (video: frame-delta at joint ÷ median local motion →
stills: *boundary-band gradient-energy step ÷ median local gradient energy in
surrounding content*, positive = invisible); **overlap-agreement PSNR/SSIM** of
two renders of the same ring (valid wherever step 1's grown ring exists);
**L\*/dE color walk** → stills: dE of annulus-in vs annulus-out means; the
calibration anchors (≈30 dB = same-picture VAE round trip, ~13 dB = hard cut)
for reading PSNR arms; **blind forced-choice pairs** with a null-arm noise floor
(identical-image pairs must score chance). Golden domains: the studio's —
portrait/skin, texture-dense (foliage/fabric), flat-gradient (sky), hard-edge
text — stimuli = real round-trips from the three lanes (R2I refs→still,
instruct-edit, inpaint), not synthetic collages.

- **B1 — blend choice (the §4.1 ranking's falsifier).** Arms: {hard composite
  (incumbent), feathered alpha, multi-band, +annulus Reinhard, +grain match,
  best-classical + SDEdit band}. Blind pairs + the three objective seam metrics +
  cost columns (ms/MP at 2 and 8 MP; engine passes). Falsifier for the ranking:
  if multi-band does not beat feathered alpha blind *and* on the gradient-step
  metric in the texture-dense domain, the pyramid is not earning its lines.
- **B2 — model-side vs post-process.** Same composites, arms {best classical,
  SDEdit band, latent-ramp generation}; domains split by induced mismatch
  (statistical-only vs lighting-shifted). Prediction to falsify: classical wins
  statistical, SDEdit wins lighting, latent-ramp beats both where it applies —
  plus preservation checks (ring PSNR must be ∞ for classical; measured drift
  otherwise; ArcFace identity on the portrait domain for hallucination).
- **B3 — color-match choice with ground truth.** Synthesize deterministic
  mis-grades (known LUT/CCM applied to the patch), arms {none, Reinhard-ring,
  histogram-ring, MKL-ring}; measure recovery dE vs the known truth — an exact
  ground-truth test, not only blind reads. Falsifier for the annulus cut: if
  global-statistics matching beats ring-statistics on recovery dE, the ring is
  the wrong window.

Fallback ladders in the house style: B1 multi-band ≯ alpha → ship feather-only,
ledger the negative; B2 SDEdit wins everywhere → promote to default with cost
gate (it won't — preservation column); B3 none wins on lighting-shifted → that
regime belongs to B2's engine tier, not to color math.

---

## 5. The nobody-has-it check (the toolbox-philosophy verdict)

**Does anyone ship a maintained JS/WASM Poisson or pyramid blender? No.**
Verified 2026-09-26: npm has no multi-band/laplacian-blend package (name
searches empty; the closest repo is unlicensed Python coursework); the Poisson
slot holds only the dead C++-bindings `poisson-blend`; the candidate opencv-js
build lacks `seamlessClone` outright (§1.5); no learning harmonizer exists in
JS; no JS Reinhard/MKL package exists (the npm name is taken by a format
converter). **The classical blend stack is in-house territory, like MLS** —
with a friendlier size profile: masked multi-band ~150–200 lines over code we
already ship, annulus color match ~60–120, grain match ~40–60, and only Poisson
(~300–500 + perf) and max-flow (~200–300) as need-triggered big tickets.

What we do NOT claim as novel: the algorithms (Pérez/Burt/Jia/Reinhard canon),
the grow+feather practice (openOutpaint/Invoke/ComfyUI lineage), the latent-mask
mechanism (Avrahami → ComfyUI native), or SDEdit harmonization. The union — a
canvas round-trip whose blend-back is a deterministic, vitest-covered,
never-worse multi-band op stack composed with an opt-in engine harmonize tier —
is unbuilt anywhere; it is the same shape of claim as the workbench's own.

---

## Verdict table (the one-screen answer)

| Item | Verdict |
|---|---|
| **Multi-band (Laplacian-pyramid) blend, masked, app-side** | **ADOPT — the core of the blend-back; own it (~150–200 lines) as the masked generalization of `toneLockBlend`** |
| **Grow-at-generation / blend-at-original-mask** | **ADOPT** (overmask lineage; changes the submit seam — spec-round input) |
| **Annulus Reinhard (+MKL dial)** | **ADOPT — own (~60–120 lines); color-matcher/KJNodes are GPL = pattern-only** |
| **Grain/acutance match** | **ADOPT as a dial** (~40–60 lines) |
| **SDEdit seam-band re-denoise (arm-S on stills)** | **ADOPT-candidate — opt-in quality tier, behind the refine doctrine; B2 owns the verdict** |
| **Native latent denoise-mask + feathered ramps (FL pattern)** | **ADOPT-candidate — gated on the #15981 grid-artifact check** |
| **Poisson / seamlessClone** | **DEFER** — absent from the candidate opencv-js build; own-solver cost is real; only the lighting-without-engine regime needs it |
| **Optimal-seam / graph-cut in the grown ring** | **v2 candidate** (~200–300 lines max-flow) |
| **Learning-based harmonizers (Harmonizer/iHarmonizer/DoveNet)** | **SKIP** — no JS ships, and our regime (same-engine round-trip statistics) is the classical methods' home turf |
| **erkaman/poisson-blend, jradice/blending, npm color-transfer, hahnec/color-matcher, KJNodes ColorMatch** | **SKIP as code** (dead / unlicensed / misnomer / GPL×2) — pattern and math donors |

*Corrections land as dated addenda, never silent rewrites (the library
protocol). Web claims carry their verification method inline ([API-2026-09-26] =
fetched primary source, [COMM] = community claim, [SPEC] = reasoning from the
math); the load-bearing absence (seamlessClone in @techstark's build) is from
the package's own `cvKeys.json` and deserves a runtime re-check the day a spec
line depends on it.*

## Sources

**Papers (abstract/project pages verified 2026-09-26/27):**
1. Pérez, Gangnet, Blake — Poisson Image Editing, SIGGRAPH 2003 — https://dl.acm.org/doi/10.1145/882262.882269
2. Burt, Adelson — A Multiresolution Spline With Application to Image Mosaics, ACM TOGRA 1983 — the multi-band source (via tutorial/ coursework citations; original accessed through secondary sources [COMM])
3. Jia, Sun, Tang, Shum — Drag-and-Drop Pasting, TOG 2006 — https://dl.acm.org/doi/10.1145/1141911.1141934
4. Avrahami et al. — Blended Latent Diffusion — https://arxiv.org/abs/2206.02779 · https://omriavrahami.com/blended-latent-diffusion-page
5. Levin et al. — Differential Diffusion — https://arxiv.org/abs/2306.00950
6. Meng et al. — SDEdit — https://arxiv.org/abs/2108.01073 · Song et al. — RePaint — https://arxiv.org/abs/2201.09873 (both already in the overlap doc's source list)
7. Reinhard et al. — Color Transfer between Images, IEEE CG&A 2001 · Pitié et al. — N-dimensional PDF transfer (MKL), 2005
8. Ke et al. — Harmonizer (ECCV 2022) — https://arxiv.org/abs/2207.01322 · Cong et al. — DoveNet (CVPR 2020) / iHarmonizer-CDTNet (CVPR 2022) · iHarmony4 — https://github.com/bcmi/Image-Harmonization-Dataset-iHarmony4

**Web/primary sources fetched:**
9. @techstark/opencv-js `doc/cvKeys.json` — the availability manifest (seamlessClone absent) — https://raw.githubusercontent.com/TechStark/opencv-js/master/doc/cvKeys.json
10. jradice/blending (Python, unlicensed, course code) — https://github.com/jradice/blending
11. hahnec/color-matcher (GPL-3.0; mkl/mvgd/reinhard/hm methods) — https://github.com/hahnec/color-matcher · KJNodes ColorMatch docs (runcomfy/comfyui-wiki)
12. OpenCV seamlessClone limitations: https://docs.opencv.org/4.10.0/df/da0/group__photo__clone.html · https://github.com/opencv/opencv/issues/5045 · https://stackoverflow.com/questions/49008854/ · https://learnopencv.com/seamless-cloning-using-opencv-python-cpp/
13. ComfyUI mask practice: GrowMaskWithBlur / Inpaint-CropAndStitch blending radius (comfy.icu, comfyui-wiki, runcomfy — [COMM])

**Internal (repo-held, the grounding):**
14. `src/lib/h3imageOps.ts` — tone-lock/burst-fuse band DSP (the module the blend-back extends); `src/lib/graph/h3image.ts` — prefill/restore composite pair (nodes 52/53) + the hard-boundary warning
15. `docs/research/h3-overlap-concept.md` — O-arms, arm-S seam re-denoise, denoise_mask/PR #15375, golden-domain + metric conventions
16. `docs/research/h3-transitions-and-latent-continuity.md` — seam metric definitions, dB anchors, blind-read conventions; `docs/research/h3-sampler-shaping-and-motion-control.md` — #15981 grid artifact; `docs/research/ecosystem-2026-09.md` — native H3 noise masks; `docs/research/pan-stitch-extension.md` — overlap-agreement
17. `docs/research/image-workbench-prior-art.md` — opencv-js/library candidates, Invoke paste-back, MLS precedent, toolbox bar; `docs/research/openoutpaint-core-vision.md` — overmask mechanism
18. `docs/specs/image-workbench-v1.md` — the op-stack doctrine and refine-always-opt-in amendment (jvcrud2)
