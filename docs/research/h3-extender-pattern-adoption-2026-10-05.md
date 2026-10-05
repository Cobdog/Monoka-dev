# H3 Extender — pattern adoption (tritant/ComfyUI_MiniMax_H3_Extender, assessed 2026-10-05)

> Intake verdict: **ADOPT-patterns + CONFIRM**. Source: github.com/tritant/
> ComfyUI_MiniMax_H3_Extender (Apache-2.0 on the tin; THIRD_PARTY_NOTICE
> discloses its motion-context core is adapted from
> NikoDemon80/ComfyUI-H3-Motion-Context, **GPL-3.0** — the same upstream our
> library captured). **Arm's-length rule: we adopt IDEAS and first-party
> implementations only; no bytes are vendored** (the policy's "an idea is
> free; the bytes are not" — and the GPL mix makes vendoring doubly off the
> table). Nothing here is fetched; no registry row (referenced-only).

## 1. PATTERN — audio-preserving latent refine (the highest-value take)

Their v3.0.5 refine mode, reduced to its load-bearing decisions:
1. Split H3's nested (video, audio) latent into streams.
2. Upscale ONLY the video stream (they use LBH-123-AI's
   `minimax_h3_latent_upscaler_3d_conv_v1_bf16` — pinned sha
   `4f57821f…a5e6`, ~691 MB, auto-fetched into `latent_upscale_models/`;
   the LBH house is already in our node-pack registry).
3. Second H3 pass on the upscaled latent (SAME model, refine steps +
   denoise as dials — no draft/refine workflow split).
4. **Re-attach the FIRST pass's audio bit-exactly; discard the refined
   pass's audio.** Audio never regenerates through refine.

Why (4) is the insight: H3's joint audio is re-derived from the video
schedule on every pass — a refine pass would re-roll audio that was already
good, and any A/B of refined outputs would confound video gains with audio
drift. Freezing audio at first-pass makes refine a pure video operation —
the same write≠refresh independence doctrine our UI just built, at the
latent level. Our cross-check: Set E's audio battery showed per-family
audio character (turbo −14 dB vs base) — a second pass WOULD move it.

First-party implementation: `/home/agent/comfyui/exp_shims/
latent_refine_audio.py` (ours, written from the pattern — the split/rejoin
is ~40 lines over `comfy.nested_tensor`; the upscaler call is a
model-load + conv pass). Ready for the next GPU window; the measurement
design when it runs: refine-on/off at fixed seed, audio md5 MUST be
identical (the pattern's own null gate), video PSNR/plan as the treatment.

## 2. METHODOLOGY — independence-as-invalidation (for Set I)

Their "Motion Context OFF" is a cache architecture, not just a mode:
independent clips → **any clip can be inserted, rerendered, or invalidated
without touching its neighbors**; ON → predecessor invalidation cascades
downstream (chain semantics). The dial is per-project cost/continuity.

Adopted into Set I's design (the ledger amendment): the drift-chain suite
runs its arms on a per-clip cache keyed (clip id, graph hash, seed, refs
hash) with TWO invalidation regimes measured as a first-class variable —
chained (cascade) vs independent (surgical) — because drift measurement
REQUIRES the chained regime while development iteration wants the surgical
one. Their interrupt/save/resume (project file + completed-clip retention +
resume-from-stop) is the operational shape for any long board: our window
discipline already tears down mid-set; the resume state belongs in the
roster's runs.json (already durable — the Set J pause proved it).

## 3. PATTERN — reference hygiene (the plumbing layer)

Their reference-video handling solves the exact problems our ref-heavy
lanes keep rediscovering:
- **FPS normalization**: source video at any fps → resampled to 24fps
  PRESERVING duration before H3 sees it (their fix for "the end of the
  reference video appeared missing" — a non-24fps batch interpreted as
  24fps). Our packet's fps-plan policy (23.976→retime, 30→dropdup) is the
  bake-lane counterpart; this is the reference-lane version.
- **17k+5 grid alignment** for reference frame counts (the whole-latent-
  step constraint, our captured lore).
- **Audio slicing along the clip timeline** for standalone audio refs;
  video soundtracks cropped to the effective reference duration.
- **Slot discipline**: stable logical slots (no auto-remapping), local
  refs take next-available slots with global-slot reservation on conflict,
  9P/3V/3A limits (the captured contract).

Adopted as the spec for our reference-input layer whenever the recast/
Viggle lanes build theirs. Per-clip LoRA stacking (choose + strength +
list growth, project-persisted) rides the same slot discipline.

## 4. CONFIRM — the chain patch and our m-scalar

Their chaining runs on the NikoDemon80 payload-patch logic (adapted to
RAM-in-DAG). Our Set E probe proved the latent link carries
`x_final/(1−σ_terminal)` and exact continuation needs the scalar
`m=(1−σ₁_last)/(1−σ₂_first)` — two independent proofs of the same engine
fact: the patch logic exists BECAUSE the raw latent is not a valid
cross-schedule state. Our m-scalar rule stays binding on any chaining we
build; their working system is the existence-proof the patch handles it
at production scale.

## 5. What we did NOT adopt

No sampler/schedule intelligence in their chain (orthogonal to our
X-questions); same-model refine only (not a distill handoff — X7 settled
that cutting beats handoff anyway); their web UI/productization (our
long-form UX is the workshop's lane, not a ComfyUI side-panel); their GPL-
derived chaining code (arm's length — our chaining, if built, is first-
party on the patch PATTERN with the m-scalar rule explicit).
