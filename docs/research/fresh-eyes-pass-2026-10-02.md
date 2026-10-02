# Fresh-eyes pass 2026-10-02 — guidance & adherence, targeted edits & refinements, anime↔real medium transfer

> Flux task: **Fresh-eyes pass (m97uy4n)**. Date: **2026-10-02**. METHOD:
> three dedicated research passes (guidance; targeted edits/refinements/
> granular control; anime↔real medium transfer), each with a step-0 corpus
> audit building (a) an exclusion list of already-verified items and (b) a
> re-examination list of held/written-off items with their original stated
> reasons — then an external sweep as of today, fresh-eyes doctrine applied
> (mechanism-read for anything <4 weeks old, no community-signal claims).
> **Operational caveat, triple-confirmed across all three passes:** the
> searxng ranking layer returned junk on technical queries (fetch cascade
> stayed healthy; `huggingface.co`/`docs.comfy.org` newly domain-blocked in
> its filter) — built-in search carried discovery per the fallback policy
> and every load-bearing fact was re-verified against primary sources (HF
> API, GitHub API/raw, CivitAI API, arXiv). Treat "not found" as "not
> found via these routes." Tags: **[DOC]** shipped code/card/API-verified,
> **[COMM]**, **[SPEC]**, **[UNK]**.

## 1. The re-examination ledger — held items re-tested against their original reasons

| Item | Original hold (verbatim-ish) | Verdict 2026-10-02 |
|---|---|---|
| T8mars `dynamic_guidance` | "undocumented effects [COMM/UNK]" | **OVERTURNED as undocumented** — source now self-documenting: shift-aware progress (un-shifts by shift_video — correct math), linear/cosine `early→late` scale schedule, hard clamp ±20%, modes `passthrough/single_condition_gain/true_cfg`. Gain mode works at guidance 1.0 (no uncond). Still unmeasured [DOC-code] |
| AYS schedules for H3 | never validated | **Upstream disclaims it** — node hard-codes `ays…for_minimax_h3: False`, refuses to relabel SD schedules; no calibrated H3 knots exist anywhere. Dissolves into our S2/X1 [DOC-code] |
| CADS | "[UNK]" | **Reclassified** — mechanism = γ-annealed noise on H3's `cond_video_latents` (ref/keyframe rows) over shifted sigma, `stable_fixed_path` variant; upstream flags `h3_quality_validated: False` for adherence, but as a **reference-staleness lever** it targets our guide-freeze (E-MD1) and pin-drag (E5) failure modes → E-G3 [DOC-code] |
| Sol-Attn quality exclusion | real approximation (≈23 dB PSNR) | **Holds** — re-verified; official HF org unchanged since 2026-08-13 [DOC] |
| "No negative-prompt conditioning on H3" | ecosystem non-finding | **Partially overturned** — RunComfy official Fun-Control recipe: branches 2/3 use CFGGuider "so negative prompt text actually affects generation," with the discipline *same references on both branches* (guidance subtracts without clashing with identity refs); Pulse Studio does CFG>1 → CFGGuider+empty-negative. Quality unproven; doctrine (guidance-1 on distills) intact → E-G5 settles base-model headroom [COMM/DOC] |
| Resolution-collapse workaround | single-thread (HF #65) | **Still single-thread externally**; internally owned (X2 + E-TW1 + Semantic-Bridge arm) |
| HyperFlow park-until-1.1 | version gate (HF-1) | **Holds** — no 1.1, manifest unchanged |
| HyperFlow "no ComfyUI loader" | diffusers-only pip | **OVERTURNED** — `Adudeguyman/ComfyUI-HyperFlow-H3`, Apache-2.0, pushed 2026-10-01 (unofficial, zero validation; fresh-release doctrine) → cheap tier-ladder arm |
| Viggle-Animate gate | "no int8; ≥96 GB" → unblocked 09-05, 24 GB unmeasured | **Gate unchanged, lane context OVERTURNED** — no published 24 GB wall-time anywhere (honest not-found); but the recast cell now has two permissive rivals (SCAIL-2 MIT, Wan-Animate-2 Apache-2.0) → VG-1 re-scopes to a three-way bake-off |
| SeedVR2 | "license unverified" | **RESOLVED vendorable** — Apache-2.0 + official ComfyUI int8 upscale templates (3B/7B). No successor exists |
| STAR | "license unverified" | **RESOLVED not-permissive** — GitHub license: NONE → closed |
| AdaRefSR | "license unverified" | **RESOLVED vendorable** — Apache-2.0 (12.66 GB one-step RefSR); anchor-image detail lane license-clean |
| YuE2 decision | own gates (CC-BY-NC, instance, benchmark) | **Unchanged** — no new family models; Comfy-Org templates marked local-only; ai-toolkit extended YuE2 training. Ours to decide |
| Krea2 edit-LoRA @24 GB | 28.1 GB borderline | **Holds** — no new low-VRAM path; Identity Edit still v1.2; no Krea 3 |
| Poisson (JS/WASM) | no maintained impl; ours to own | **Holds** — nothing new; scumble's Rust/WASM stays patterns-only reference |
| Z-Image sidecar | no first-party trainer (issue #5) | **Holds** — issue open, repo dormant since 2026-02 |
| LTX utilities removal | LTX-only family | **Reinforced** — Comfy-Org swapped LTX 2.5 → HunyuanVideo in templates over gating (09-30); but the LTX IC-LoRA family is pattern-ADOPT (§3.4) |
| Viggle "propagation-only" | no stills/partial control | **Holds for weights, implication overturned** — repaint-propagation IS a restyle mechanism (TeleStyle productized repaint-in-style→propagate); Wan-Animate-2 covers the reference cell Apache-2.0 |
| CrossView-Warp lane fit | camera re-observation only | **Holds, promoted** — its geometry+identity two-channel pattern is THE fidelity-dial primitive for medium transfer (§4) |
| "No IP-adapter for H3" | ecosystem non-finding | **Stands** — nothing surfaced; ref-token mechanism remains |
| "Ref2VA refs beat character LoRAs" | consensus | **Holds, with composition note** — the modes compose: style/medium LoRA carries the transform, ref slots carry identity (the new Anime-to-Realism LoRA is itself the evidence) |
| Fun Control kinds (no normal/AO) | trained set fixed | **Stands as gap** — depth-from-render is the sanctioned exact-structure channel; normal/AO steering is a one-afternoon E-FC-style probe, not load-bearing |

## 2. Guidance & adherence — findings

1. **The adherence race is now three-mechanism** (all targeting the
   "no dial at guidance 1" gap): (a) Fizgig Prompt Strength (attention-V,
   MIT, in-corpus); (b) T8mars shift-aware single-condition gain schedule
   (ledger R1; ~40-line reimplementation, GPL pattern-only); (c) **Semantic
   Bridge adapters** — trained conditioning-space bridges (six-tensor
   5120→512→512→5120 SiLU MLP + transformer variants; speach1sdef178
   original, BUNNY ActionLogic, two cross-token bridges), applied at encode
   time, α≈0.10, up to 8 composed, T8mars wiring or ~100-line first-party
   loader; original adapter weights license **unstated — check before any
   catalog row** [COMM-weights + DOC-wiring]. E-G1 runs the bake-off.
2. **Meridian by Viggle** (second Viggle H3 artifact): geometry-guided
   **re-camera + retime** (orbit/dolly/slide/FOV keyframed; source-time
   mapping = slow-mo/freeze/bullet-time) as **two LoRA adapters on
   unmodified H3** (2.5 GiB each, summed at 1.0, merging lossy). Inputs:
   source + camera path; VGGT-Omega geometry (FAIR-NC flag at consent);
   officially B200-class — **the T8mars INT8 conversion is the 24 GB bet**
   (user-accepted samples at strength 0.12/0.03). Weights: H3 Community
   License (same as base), code Apache-2.0 [DOC]. E-G2: camera/retime lane
   pilot + the NyckM MoGe depth-warp non-LoRA comparator.
3. **Latent reward-guided search family** (Latent Reward-Guided Search,
   WMReward, lookahead sampling — all 2026): score partially-denoised
   latents on visual+motion quality for best-of-N pruning. **The most
   modular candidate in the pass** — app-side only: takes + taeh3 preview
   decoder (shipped) + local VLM scorer; zero engine surface (E-G4).
4. True-CFG on the BASE model (never distills): machinery + recipe now
   public (CFGGuider multi-branch, reference-wiring discipline); PMC-CFG
   (arXiv 2609.24287, 11 days old — posterior-mean-capped guidance) and
   manifold-projection CFG are the importable refinements **if** E-G5 finds
   uncond headroom.
5. **Veda scorer** (T8mars 1.88.0, shipped today): trained per-step
   predictor for 8-NFE; upstream itself "not yet accepted" — watch-tier
   only. T8mars also shipped **JointClock RF Restart** (v1.88.1) —
   modality-level dual-clock sampling (per-stream sigma grids), a partial
   port of the Time-to-Move idea.
6. Honest negatives: **spatial/regional dual-prompt guidance on H3 —
   no mechanism in the packed joint attention, nothing shipped anywhere**;
   SAG-video ports don't exist; LTX-2 dual (audio/video) CFG is blocked by
   H3's guidance-1 packed architecture — our shift_audio/X4 experiments
   are the H3-native instance.

## 3. Targeted edits & refinements — findings

1. **The recast/propagation lane is three-way**: Viggle-Animate
   (H3-native repaint-frame geometry, gate open) vs **SCAIL-2** (Zhipu,
   MIT weights, Wan2.1-14B: no pose intermediates, trained 60K synthetic
   motion pairs; emergent cross-identity replacement, multi-character,
   animal-driving; DPO + relight LoRAs; Comfy-Org int8-convrot **16.7 GB**
   + official character-replacement template) vs **Wan2.2-Animate-2-14B**
   (Apache-2.0: no motion extractors, **text-driven viewpoint decouples
   output camera from the driving video**, distilled 10-step; official
   templates; 24 GB fit [UNK] pending quants — the Viggle-gate pattern).
   All three are complementary geometries; VG-1 re-scopes to the bake-off.
2. **VOID** (Netflix, Apache-2.0, *official* templates): flow-guided
   **deterministic** two-pass video object removal — attacks exactly the
   pixel-exact-outside-region axis where instruction edits can't go (our
   10–13 dB semantic class). Fourth arm in E-ED4.
3. **Bernini-R** (ByteDance, Apache-2.0, official template): MLLM
   semantic planner + DiT renderer, Wan2.2 two-stage (high-noise +
   low-noise — the same split shape as FL2VA/Ref2VA), int8 14.5 GB/stage
   sequential residency. The first open structural rival to H3's edit
   engine; comparison oracle + second-engine candidate.
4. **LTX-2.5 IC-LoRA family** (Restore, Refine-Details, SDR-To-HDR,
   Alpha-Gen, Layout-To-Render — Sept): one-graph per-task edit/restore on
   a resident DiT. Direct integration blocked (LTX gated, dropped from
   templates) — **pattern-ADOPT**: industrial validation of the
   small-targeted-graphs doctrine; the recipe ports to H3 on our R1/R3
   machinery with zero new weights (restore-window pass; colorist arm).
5. **UniLumos** (NeurIPS'25; weights Apache-2.0, code unlicensed →
   fetch-weights + own glue): unified image+video relight — the one edit
   axis with a dedicated open challenger (vs H3 instruction relight).
6. Refinement lane: SeedVR2 now official-template int8; **LatentSync 1.6**
   is the local lip-sync consensus leader (mature ComfyUI path; H3's
   `<Audio>` pin modes in-corpus; X-Dub/TBDub research continues the
   condition-don't-mask line); H3-native community artifacts: X2-Detail-VAE
   (2× detail VAE, license:other → user-fetch), LightVAE, PDMD 2/4-NFE
   distills (Apache), TensorRT VAE 1.7×. **SageAttention temporal-flicker
   bug report** — QA note for our speed stack.
7. **Layer-aware editing is the emerging trend**: Seedream 5.0 hosted
   layer_separation, Ming-Image-Design-Layer (MIT, local), LTX Alpha-Gen
   (alpha-channel video). Watch; nothing to adopt yet on our lanes.
8. **The official H3 side is static** — no submodels of any kind since
   Music3 (2026-08-07); the only changes are the int8-convrot VAE template
   swap (09-22) and the demo-page removal (09-26).

## 4. Medium transfer (anime↔real) — the map

**The fidelity dial** (most-exact → most-essence; every position reachable
on our stack today; **positions compose on one graph** — the load-bearing
headline):

| # | Mechanism | Survives | Free |
|---|---|---|---|
| 1 | Repaint-propagation (Viggle / Wan-Animate-2 / TeleStyle shape) | motion, camera, timing, lighting | medium, subject identity |
| 2 | Depth/geometry control (Fun Control depth; CrossView-Warp two-channel) | 3D structure, layout, camera path | surface, medium, identity |
| 3 | Lineart/canny control | silhouettes, contours, composition | texture, depth, medium |
| 4 | Per-token mask / union-inpaint | everything outside mask (deterministic) | everything inside |
| 5 | Reference recreation (Ref2VA `<Video 1>` + preservation clauses + medium LoRA) | whatever the clauses enumerate | the rest |
| 6 | Identity refs/sheet + pose control | identity, mannerism, skeleton | staging, camera, light |
| 7 | Style LoRA / prompt style-words alone | the look only | everything |

Dial-within-dial: Fun Control strength + sigma window; LoRA strength
(0.8–1.5; on-twos fixed 1.0); RefMod strength/copies; retention_analysis
markers; hybrid-adaln profile for identity-through-edit (E-ED1 winner).
**CrossView-Warp's geometry-channel + identity-channel pattern is the
formalization** — structure and medium as independent axes.

**Direction findings.** *Animation→real:* native today via depth/lineart
control (A1) or reference recreation + **"Anime to Realism" H3 LoRA**
(CivitAI 2783657, 2026-09-25, trigger "LumiReal", image+video trained,
preservation templates; the card's discipline: VLM-caption every cut or
tails stay unconverted) (A2); CG→real via render depth (+normal/AO probe)
— RealMaster (Mar 2026, code) is the research-grade version (A3);
essence-only via ContactSheet/turnaround identity bridge (A4). *Real→
animation:* repaint-propagate (B1 — TeleStyle V2, Apache-2.0, productizes
stylize-keyframe→propagate on Qwen-Image-Edit + Wan-1.3B; **pattern-ADOPT
now, model-ADOPT option the day the Qwen-first wave lands**); anime-native
**Index-AniSora V3.2** (Apache-2.0 weights, Wan2.2 base, line-art-guided
V2V, 8-step, 12 GB build exists) as the resident-anime alternative (B2);
style LoRA + lineart/depth control (B3); subject-scoped restyle via
per-token masks (B4); **alvdansen/h3-keyframe-animation** — on-twos
hand-drawn cadence adapters ON OUR EXACT BASE (hero/tween/sequence, r64,
structured caption dialect, turbo-incompatible; PolyForm SB license →
user-fetch, patterns free) — the deepest "medium": *timing*, not look
(B5). **Consistency:** style/medium LoRA = drift-free style anchor across
shots (baked in weights) while identity rides re-declared refs — the
chain-drift doctrine specializes cleanly; flow-blend deflicker + luminance
deflicker as cheap post stages; V2V-Bench / IVEBench give the
drift-envelope suite ready-made restyle vocabularies.

## 5. Newly solved (last ~3–6 months; consolidated)

1. Open permissive character replacement at SOTA (Wan-Animate-2;
   SCAIL-2) incl. multi-character + animal driving.
2. Stylize-one-keyframe→propagate as a shipped open model (TeleStyle V2).
3. Anime-native open V2V with line-art guidance (AniSora V3.2).
4. H3-native anime→real LoRA with the full preservation contract
   (Anime-to-Realism).
5. Hand-drawn cadence as trained adapters on H3 (alvdansen).
6. Rendered→photoreal with full alignment as open method (RealMaster).
7. Camera obedience + retiming on open H3 (Meridian; limits stated).
8. Deterministic open object removal with official support (VOID).
9. Open instruction-edit planner+renderer rival (Bernini-R).
10. Retitle-quality local lip-sync (LatentSync 1.6).
11. CFG-free adherence *mechanisms* (three shipped; none validated).
12. Video-restyle evaluation vocabularies (V2V-Bench/IVEBench).
**Still open everywhere:** pixel-exact out-of-region preservation (the
semantic-regeneration ceiling — our own E-ED1/E-K1 numbers remain the
honest measurement); single-generation multi-shot identity; legible text
in video; drag/trajectory on H3 (AddGuide remains our only measured
native answer); 24 GB wall-times for Viggle/Wan-Animate-2 (unpublished).

## 6. The queue — experiments & workflows (priority order)

| # | Item | Cost | Gate |
|---|---|---|---|
| **Q1 = E-G1** | Three-mechanism adherence bake-off (Fizgig vs shift-aware gain vs Semantic Bridge; 576p sanity + 768p collapse + loosen arm) | one GPU window | extends E-TW1 |
| **Q2 = VG-1 re-scope** | Three-way recast bake-off: Viggle pruned-int8 vs SCAIL-2 int8 vs Wan-Animate-2 (+ incumbents), fixed 8-clip board; publishes the first 24 GB wall-times | fetch rows + one window | consent per row |
| **Q3 = E-G4** | Latent reward gate on takes (best-of-N + taeh3 preview + local VLM scorer) — app-side only | no engine change | most modular; ship as toggle |
| **Q4 = E-G2** | Meridian INT8 camera/retime pilot (3 graphs: slide 0.12 / freeze-orbit 0.03 / 1to1) + MoGe-warp comparator | 34 GB fetch row | does INT8 hold at 24 GB dynamic? |
| **Q5** | VOID arm in E-ED4 (deterministic removal vs instruction vs denoise-mask) | fetch row | attacks the preservation ceiling |
| **Q6** | IC-LoRA-pattern port: H3 restore-window + colorist graphs (zero new weights) | builder work | R1/R3 machinery |
| **Q7 = W1/W2** | TeleStyle-on-H3 (styled keyframe → propagate) + Viggle style-repaint arm | rides VG-1 | falsifier: style decay over length |
| **Q8 = W5** | Anime-to-Realism grounding pilot (VLM-caption cuts + LoRA + retention clauses) | 296 MB fetch | identity/structure/multi-shot metrics |
| **Q9 = E-G5** | Base-model true-CFG falsifier (empty-negative + reference-wiring + PMC cap) | cheap | settles a doctrine |
| **Q10 = E-G3** | Reference-annealing arm (CADS equation, pattern-copy) vs guide-freeze/pin-drag | ~60-line wrapper | E-MD1 harness |
| **Q11** | UniLumos relight vs H3 instruction relight; HyperFlow-H3 pack tier-ladder run | fetch rows | one clip / one rung |
| Watch | Veda scorer; Wan-Animate-2 quants; EchoStyle/DreamStyle code; MiKa (not found); Viggle v2; Krea2 edit model; Wan 3.0 weights (API-only, sources contradict) | — | ledger only |

X1–X7 (sigma thesis) remain the separate sampler-track queue; Q-items
share the same harness assets and GPU-window discipline (8189 runbook).

## 7. Honest not-founds

MiKa (no trace); OmniGen-V (doesn't exist as named); regional/spatial
dual-prompt guidance on H3 (no mechanism); SAG-for-video ports; any H3
edit/inpaint/control submodel; Wan 3.0 open weights (best evidence:
API-only); Viggle-Animate v2; Saganaki22 revival (still 404); published
24 GB wall-times (Viggle, Wan-Animate-2); dedicated open text-in-video
editor; maintained JS/WASM Poisson; EchoStyle/DreamStyle/VideoStylist
release status; DVFace/StableBFVR/MotionStream integrations; RealMaster +
VideoPainter licenses; quality data for Anime-to-Realism + alvdansen +
Semantic-Bridge originals (≤2 weeks old — fresh-release doctrine, our
harness settles them).

## 8. Sources (top sets per pass)

**Guidance:** T8mars repo (changelog + guidance-family sources + SEMANTIC_BRIDGE/Meridian/Veda docs); Viggle/Meridian HF card; arXiv 2609.24287 (PMC-CFG); arXiv 2601.03233 + ltx.io (LTX-2 dual CFG); RunComfy Fun-Control workflow (CFGGuider branches); HF API MiniMaxAI/MiniMax-H3; OpenReview (Latent Reward-Guided Search); papers.cool CFG-manifold index.
**Edits:** HF zai-org/SCAIL-2 (+Comfy-Org repack, docs.comfy.org tutorial); HF Wan-AI/Wan2.2-Animate-2-14B (+templates); HF ByteDance/Bernini-R (+Comfy-Org int8 + template); Comfy-Org/workflow_templates commit log 09-15→10-02 (the freshness oracle); HF Comfy-Org/void-model; HF Lightricks org (IC-LoRA family); HF hangfrieddays/AdaRefSR + GitHub NJU-PCALab/STAR (license resolutions); GitHub Adudeguyman/ComfyUI-HyperFlow-H3.
**Medium transfer:** github.com/bilibili/index-anisora; HF Wan-AI/Wan2.2-Animate-2-14B; github.com/Tele-AI/TeleStyle + HF; HF alvdansen/h3-keyframe-animation (+ *Animating on Twos*); CivitAI API models 2783657 (Anime-to-Realism) + H3 style LoRAs; RealMaster (arXiv Mar 2026 + code); V2V-Bench (ICML'26 workshop); EchoStyle (arXiv Aug 2026).
