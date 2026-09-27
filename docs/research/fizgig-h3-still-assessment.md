# ComfyUI-Fizgig-H3-Still — pack assessment (the "our T1 method is now obsolete" ruling)

> **Provenance.** Maintainer ruling 2026-09-25, verbatim: *"Our T1 method is now obsolete: https://github.com/shootthesound/ComfyUI-Fizgig-H3-Still."* Assessed same day.
> **Read at:** commit `f3252d2b6c94c2e34d71f583d5e1804b683afe06` (the initial publish — 8 commits, all the evening of 2026-09-25, last push 23:25 UTC; repo created 2026-09-25T22:01Z). Shallow-cloned to /tmp scratch, never inside this repo.
> **METHOD:** full code read — `__init__.py` (94 lines, the entire pack: 2 node classes), `pyproject.toml`, `.github/workflows/publish.yml`, `LICENSE`, both example workflows (node inventory + widget values extracted); trainer-side cross-read `shootthesound/Fizgig` → `src/fizgig/minimax/vae.py` (the provenance of the load-bearing measurement); ComfyUI core verified at the shared install `a87667f` (v0.34.0 — every API the pack calls grepped in-source) **and** upstream `master` (raw fetch 2026-09-25); our side read against `src/lib/graph/h3image.ts` (the T=1 emission, `H3IMG_RECIPE_PINS`, decode wiring), `src/lib/nodePackRegistry.ts`, `docs/licenses/registry.md`. No GPU, no engine, nothing installed or submitted.
> **Community metrics: DROPPED per the fresh-release doctrine** — the repo is hours old (3 stars at read); star/fork counts are time-gated noise at that age, and the maintainer's 1-day-old picks are the normal intake pattern. Comfy Registry: **published, v1.0.0** (publisher `shootthesound`, 2026-09-25T22:02Z) — Manager-installable.

---

## 1. WHAT IT IS

**Two nodes, category `Fizgig`, zero dependencies, MIT** (a real LICENSE file, Copyright 2026 Peter Neill — contrast this author's `ComfyUI-H3Studio`, which is badge-MIT-with-no-file). The whole pack is 94 lines. Both mechanisms are extracted from how the **Fizgig trainer** renders its H3 still previews (`src/fizgig/minimax/vae.py`, `single_frame_mode="group"` default).

| Node | What it does |
|---|---|
| `FizgigH3StillLatent` | A true one-frame packed AV latent: `NestedTensor(video[B,24,1,even(H/16),even(W/16)], audio[B,32,2,2])`, zeros; the even-grid clamp exists because the DiT patchifies 2×2 on the 16× latent grid (`__init__.py:32-39`). Widths/heights any multiple of 32, to 4096. |
| `FizgigH3StillDecode` | Clean decode of that lone latent through the **video VAE**: replicates it into a full 5-latent temporal group, decodes (spatially tiled), keeps **pixel frame 3** — past the decoder's causal lead-in. Anything longer than one latent frame, or a VAE without the H3 decode API, passes straight to stock decode (`__init__.py:42-89`). |

**The latent legality mechanism is the SAME CLASS as astropuzzo's** — a parallel latent construction where T=1 is legal (`_empty_h3_av_latent` at its T=1 point). But the surrounding strategy is different and leaner:

- **No conditioning reimplementation.** The stock `MiniMaxH3ImageToVideo` / `MiniMaxH3ReferenceToVideo` node stays in the graph for its conditioning; its LATENT output is simply left unconnected, and its length widget stays **legal** (5 in the shipped example — verified in the workflow JSON). The #15644 floor (`value_smaller_than_min` + the `max(5,·)` grid clamp) is sidestepped from the *submission* side — never send an illegal length — where astropuzzo sidesteps it from the *schema* side (own node, no min). One conditioning-implementation fewer to track against core drift.
- **The decode is the real divergence — and the direct challenge to us.** H3's ViT decoder is chunk-trained on complete 5-latent temporal groups `(1,4,4,4,4)` and its token t-coordinate is normalized over `latent_T`; a lone token sits at t=0, outside the training range. Core's own T=1 branch (v0.34.0 `comfy/ldm/minimax/vae.py:703`, same at master) decodes the lone token **as-is** — the banded/dark result. Fizgig replicates to a complete group (only interior frames are clean; boundary frames lose ~10 dB) and keeps frame 3.
- **Weights: the official stack only** — fl2va pruned, qwen3vl nvfp4, video VAE (int8 primary, fp16 explicitly fine — we stage fp16). Optional larryvrh v4-step-600-EMA turbo @ **0.38**, **20 steps**, `er_sde`/`simple` = the author's stills recipe. **No Mamad8 image VAE, no hybrid file, no new weights — the pack retires a dependency rather than adding one.** The README's direct shot at our lane's decode: the dedicated single-frame VAE is *"slower and softer, with less skin detail… there's no reason to use it with these nodes."*
- **Edit lane (hedged):** stock `ReferenceToVideo` conditioning + `<Picture 1>` prompts on the **fl2va** base — "the model already has some edit abilities", best ~2.5 MP. One example workflow, no validation.

**Why the maintainer's "obsolete" has substance:** our just-landed T=1 lane (afvlbk4) is Image-Studio-Prepare(latent_t=1) → 8-step hybrid recipe → **Mamad8 image-VAE decode**; fast-sharp's premise is "image-VAE sharpness with multi-frame context." Fizgig claims the same T=1 capability with 94 lines, zero extra weights, stock conditioning, and a decode that is *faster and sharper than the image VAE*. If that holds, both the machinery choice and the decode choice of our lane are superseded — and fast-sharp's premise with them.

## 2. QUALITY / EVIDENCE

- **Measured (self-reported, precisely provenanced) [COMM]:** round-trip fidelity **29.99 dB mean vs 16.96 dB** (group vs lone token, real photos, `tests/diag_frame_choice.py`), plus a dated self-correction in the trainer comments — the cheaper 2-latent "reference" scheme (what ai-toolkit does) was tried as default on 4 Aug and **reverted** (16.96 vs 16.64 dB; only a *complete* group restores the training regime). **The diag script is NOT in the public trainer tree** (no `tests/` at HEAD) — the number is exactly cited but not independently runnable.
- **Asserted with no artifacts [SPEC]:** the Mamad8 comparison ("slower and softer, less skin detail" — "in our tests", no sheet, no wall-times, which Mamad8 quantization unstated); the edit lane's quality; "any size" (the one comparison PNG is a single seed at 2144×1216 — itself off our native-area envelope for the DiT).
- **VRAM/speed on 24GB at our stills resolutions: nothing measured anywhere in the pack.** Trainer-side facts that bound it: group decode costs 2.5× the decode tokens ("small at preview size"); tiling is measured (512-px single-pass seam energy 2.31 vs ~1.1 tiled, 256-px tiles). Our only anchor is the afvlbk4 8189 probe: the Mamad8 lane end-to-end ~63 s incl. cold loads — no decode decomposition, no Fizgig-side number exists. **The bake-off owns the envelope.**
- **The author bar:** shootthesound's trainer work is measurement-heavy (the 2026-09-19 Fizgig assessment: block-role maps, quant calibration) and these 94 lines carry the same culture — exact numbers, dated reverts, boundary-frame dB. Against astropuzzo's bar (measured wall-times, unfiltered committed comparison sheets, published negative results): **below on artifacts** (one PNG, zero tests, the GH workflow is registry-publish only), **comparable on mechanism honesty.** Bus factor 1, again.

## 3. COMPATIBILITY

- **ComfyUI floor v0.34.0 (`a87667f`): every private API the pack calls verified in-source [DOC]** — `comfy.nested_tensor.NestedTensor` (`.is_nested`/`.unbind()`), `MiniMaxH3VideoVAE._adaptive_decode` / `_finalize_pixels` / `latents_mean`/`latents_std` (`comfy/ldm/minimax/vae.py:417/398/382-383`), the `VAE.memory_used_decode` lambda (`comfy/sd.py:498+`), `load_models_gpu(…, force_full_load=)`, `intermediate_device()`. **Upstream master (fetched 2026-09-25): same APIs present** (`vae.py:483/502`). Works on our floor and the maintainer's latest-master instance.
- **The silent-degradation seam:** `hasattr(fsm, "_adaptive_decode")` falls back to the *banded stock decode* on a core lacking the API — the node "succeeds" while producing exactly the artifact it exists to fix. Our adoption must contract-assert behavior (pinned rev + served-schema capture, the afvlbk4 method), not presence alone — the same lesson as the taeh3 spot-check.
- **Weights licensing:** adds nothing (official Comfy-Org stack, already cataloged; the larryvrh turbo is already a tracked turbo-registry entry). **Retires** the `mamad8-t1-image-vae` fetch-consent row if adopted. Pack code MIT → unconditionally vendor-eligible; fetch-consent matches current posture; a registry row is required at adoption (lockstep audit).
- **Composition with our runtime-merge hybrid loader + override lanes: clean.** The latent node is model-agnostic; the hybrid merge feeds the same sampler; the decode keys on latent shape + the VAE model's API, not filenames. The `imageVae` override slot simply goes unused on a Fizgig T=1 path; `assertNoT1ImageVaeInVideoGraph` semantics are unaffected (frames=1).

## 4. THE SUPERSESSION QUESTION

**The ruling decomposed against our lane's three legs:**

1. **Legal latent** — same mechanism class; Fizgig's T=1-only variant is arguably better engineering for that lane (no conditioning reimplementation, legal length submitted, 94 lines vs 2,389).
2. **Recipe** — different author pins (ours: hybrid b25-49 + turbo @0.75 + detail @0.5, 8 steps; theirs: plain fl2va + v4-600 @0.38, 20 steps). Neither measured against the other.
3. **Decode** — the contested leg. Ours routes T=1 (and fast-sharp's slice) through the Mamad8 image VAE; Fizgig claims the video VAE with group replication beats it on speed *and* detail, with zero extra weights.

**Verdict on the claim: PARTIAL OVERLAP, not outright replacement — and unproven today.** Fizgig covers exactly one lane, T=1 stills. It does **not** cover: the exact 9/13 packet ladder (its latent node is T=1-hardcoded), fast-sharp's multi-frame sampling context, or multi-ref edit conditioning quality (their edit lane is stock REF conditioning on fl2va, hedged by the author himself). So: the **T=1 profile's graph is a REPLACE-candidate** (pending the bake-off); **Image Studio stays load-bearing** for packets and — pending the context arm — sharp.

**What happens to the just-landed investment (afvlbk4):**
- **Exact 9/13 ladder: SURVIVES** — Image Studio's territory, untouched by this pack.
- **Fast-sharp slice decode: premise survives, decode leg challenged.** Whether multi-frame context still buys quality once decode is equalized is precisely bake-off Arm D. If group-decode wins, the slice leg migrates to an extract-slice→replicate compose (~30 lines, MIT-clean) — a follow-up, not shipped.
- **Carries over regardless:** the execution-probe methodology, the served-schema fixture discipline, the audits, the stock-length:1 negative proof.
- **Dies on full migration:** the T=1 branch's pack-conditioning emission, the Mamad8 dependency on that path, the T1-VAE factory guard's reason to exist there.

**Migration sketch under the modularity contract:** one `ENGINE_NODE_PACKS` row (`fizgig-h3-still`, MIT, pinned `f3252d2`, classes `[FizgigH3StillLatent, FizgigH3StillDecode]`) → the T=1 builder branch flips to the stock-conditioning emission (that code already exists — it is today's pack-absent packet path), inserts the two Fizgig nodes, decodes via the video VAE → `detect` swaps `t1StudioPack` for the Fizgig classes → fixture captures the 2 real schemas (--cpu boot) → goldens regenerate. One audit allowance to write explicitly: the T=1 graph now *contains* a stock conditioning node at length=5 whose latent dangles — the audit must key the frame count on the latent source (FizgigH3StillLatent), never on the conditioning node's length. **Swap cost: smaller than the afvlbk4 adoption itself** (2 tiny classes vs 5, stock emission reused, zero new weights); removal = drop the row + branch + fixture entries, nothing welds.

## 5. THE TEST (the epistemology applies to rulings too)

**E-FS0 — the cheap falsifier first:** replicate the round-trip measurement through OUR staged video VAE — encode real photos, decode lone-token vs group-replicate vs **Mamad8** (the arm the author didn't publish), PSNR. CPU-able or a five-minute 8189 arm; directly tests 29.99/16.96 dB and extends it to the claim that actually matters to us.

**E-FS1 — matched arms, golden domains, blind pairs, cost-scored:**

- **Arm A (incumbent):** our T=1 Fast as landed — Image Studio Prepare (latent_t=1), hybrid+turbo@0.75+detail@0.5, 8 steps, Mamad8 decode.
- **Arm B (swap-isolated):** the SAME model+recipe as A; latent+decode via the Fizgig nodes. Single variable: the machinery.
- **Arm B2 (challenger-full):** Fizgig's shipped recipe (fl2va + v4-600 @0.38, 20 steps, er_sde/simple) + Fizgig nodes.
- **Arm C (decode-isolated):** A's latent/conditioning, Fizgig decode instead of Mamad8 — the cleanest single test of "is Mamad8 obsolete."
- **Arm D (context axis):** fast-sharp (5-context + slice decode) vs B — does multi-frame sampling context still buy quality once decode is equalized.
- **Domains:** portrait/skin-detail (their claim is skin-flavored), texture/fine-detail, edit-fidelity on an edit golden, composition/seed-spread. Blind pairs per the assessment-workspace discipline; cost rows = end-to-end wall-clock, decode-segment wall-clock, VRAM peak — at 768×1344 and the ~2.5 MP edit size.

**STATUS: PROPOSED-PENDING-TEST.** Fallback ladder: B/C lose → **CONFIRM** the incumbent (ledger the negative — the ruling answered "no"); C wins, B loses → hybrid migration (keep the Image Studio latent, adopt group-decode via the MIT-clean port); B wins wholesale → T=1 migrates to Fizgig, Image Studio stays for packets/sharp, Mamad8 retires pending D. **The maintainer's lean is recorded verbatim at the top of this document.**

## 6. VERDICT

| Question | Answer |
|---|---|
| What is it | 94-line MIT pack, 2 nodes: a true T=1 latent (same mechanism class as astropuzzo's, minus the conditioning reimplementation) + a group-replicate video-VAE decode that replaces the Mamad8 image VAE — zero extra weights |
| vs our T=1 lane | Challenges the decode leg head-on ("no reason to use" Mamad8) and minimizes the machinery (stock conditioning kept, legal length submitted); covers ONLY the T=1 lane — no packets, no context, weak edit story |
| Evidence | Trainer-measured 29.99 vs 16.96 dB round-trip (precisely cited, script not shipped); Mamad8 comparison asserted with zero artifacts; nothing measured on VRAM/speed |
| Compatibility | Verified API-by-API at v0.34.0 floor AND master [DOC]; silent-fallback seam needs a behavior contract; MIT; composes with hybrid loader + override lanes; retires a weight dependency |
| Supersession | Partial: T=1 profile is a replace-candidate pending measurement; Image Studio stays load-bearing for 9/13 packets (+sharp context); exact ladder survives, fast-sharp's decode leg is challenged, Mamad8 retirement is the stake |
| Migration | One registry row + one builder branch flip (reusing today's stock-emission path) + fixture + goldens — smaller than the adoption it would succeed; removal stays trivial |
| **Verdict** | **ADJUST** — a credible, mechanism-grounded challenge to the just-landed lane's decode choice and a real machinery minimization, but "obsolete" is unproven at hours old with zero validation artifacts; the T=1 method adjusts pending E-FS0/E-FS1, with the maintainer's lean on the record |

**Corrections/decisions this feeds:** queue E-FS0/E-FS1 into the next GPU batch (alongside the Fizgig trainer try-out, rswg9db — same author, different artifact); soften the fast-sharp rationale's "video-VAE softness ceiling" framing (the trainer's measurements attribute stills softness to out-of-distribution lone-token decode, not the video VAE itself); a `fizgig-h3-still` registry row only at adoption; re-price nothing until the bake-off reports.

---

## Examined-ledger entries (for node-pack-registry §9 absorption)

- **ComfyUI-Fizgig-H3-Still** (shootthesound, MIT, `f3252d2`, 2026-09-25): examined this pass — verdict **ADJUST**; PROPOSED-PENDING-TEST as the T=1 challenge arm (E-FS0/E-FS1); alt-ladder position: decode-port-only hybrid if C wins alone. Fresh-release doctrine applied (metrics dropped, repo hours old).
- **astropuzzo Image Studio v23.0.0** — still latest (re-verified via API 2026-09-25); the 2026-09-21 assessment remains current; its 4-class adoption stays load-bearing for packets/sharp regardless of this outcome.
- **shootthesound author file** — now three public artifacts: the Fizgig trainer (Apache-2.0, measurement-heavy), ComfyUI-H3Studio (NO-LICENSE, watch), and this pack (MIT, real file). The trainer's `single_frame_mode="group"` decode is the third independently-useful mechanism harvested from that codebase (after the block-role map and quant calibration).

---

## ADDENDUM 2026-09-26 — the repo moved (demo artifacts, not measurements); the dB number's status unchanged (ratify-and-verify pass 2)

Three commits since this assessment's pinned `f3252d2` (2026-09-26T00:24–00:30Z): `c6a1d69` (an **8 MP no-Turbo example workflow** + sample still, metadata stripped — README: 3872×2176, 50 steps, `er_sde`), `54eaa31` + `10d5171` (README: recommended sizes; decode tooltip wording; the single-frame VAE now named precisely `minimax_h3_t1_image_vae_step1597_int8_convrot.safetensors`). Registry version still **1.0.0**; the trainer (`shootthesound/Fizgig`, pushed 2026-09-25T23:06Z) still ships **no `tests/` and no diag script** (289-file tree at HEAD, checked 2026-09-26).

**Verdict impact: none.** §2's classification of the 29.99 vs 16.96 dB round-trip as precisely-cited-but-not-independently-runnable **stands** — the new artifacts are demo/validation-adjacent (one sample still, one workflow), not the measurement. E-FS0 (replicate the round-trip through OUR staged video VAE, CPU-able) remains the settling test, and now also covers the README's new "recommended sizes" claim.

---

## ADDENDUM 2 — 2026-09-26: the documentation-verification pass + the 1F full image stack adoption (the usability directive)

Maintainer directive 2026-09-26 (verbatim-critical parts): *"get fizgig nodes wired in and usable for the 1Frame image gen path. I want to be able to do reference to image as well, inpainting, edit tasks — apparently all doable by H3 — so let's get the full image stack done end to end"*; mid-flight addition: *"I would also look into Fizgig's documentation so we are sure we are using it properly and we expose the right settings on the UI"*; correction: *"Fizgig tested on 8MP as shown in his README.md"* (superseding the 5 MP community figure this assessment's task directive carried).

**METHOD.** Full documentation read at BOTH the pinned `f3252d2` and the current `10d5171` (8 commits at read time, all 2026-09-25/26): the README at both revisions (diffed — the changes are quoted below), `__init__.py` (5,114 bytes, cross-checked against the fixture's source-derived schemas), and all three example workflows parsed NODE BY NODE (`h3_still_text_to_image.json`, `h3_still_text_to_image-8MP-NoTurboVersion.json`, `Edit_Workflow_example.json` — widgets, links, the `ResolutionSelector`/`AILab_ImageResize` sizing chains). Cross-read: astropuzzo's ComfyUI-MiniMax-H3-Image-Studio README (the counter-evidence). No GPU, no engine, nothing submitted. Discrepancy check (the H3-Still precedent: README claimed vs code differed): **one found, benign** — the t2i workflow's `FizgigH3StillLatent` widgets read `[1344, 768, 1]` while the workflow's actual size comes from the `ResolutionSelector` node feeding its width/height INPUTS (widgets are stale UI state; the LINKS are the truth — verified in the link table). Code wins for behavior, as ruled; no doc error filed since the README text itself is correct.

### The settings-exposure matrix (parameter | doc says | code does | our UI exposes | default sourced-from)

| Parameter | Doc says | Code does | Our UI exposes | Default sourced-from |
|---|---|---|---|---|
| `FizgigH3StillLatent.width/height` | "Any width and height that are multiples of 32" (README §sizes) | Schema INT 64..4096 step 32 (fixture-verified) | YES — the workbench's tiered resolution picker (all rungs ≤4096/dim; custom override free beyond, contract-refused per lane) | the author's 2.5 MP default / 8 MP demo (below) |
| `batch_size` | not mentioned | INT 1..64, their workflows pin 1 | NO (pinned 1 — single still) | their example workflows |
| `FizgigH3StillDecode` inputs | "Same inputs: the sampler's output and the video VAE" | exactly samples+vae; >1-frame latents pass through to stock decode | NO dials (none exist) | n/a |
| Turbo LoRA + strength | "v4 step-600 EMA … at strength **0.38** … That combination works best for stills" | their t2i + edit workflows: `LoraLoaderModelOnly` @0.38 on plain fl2va | YES — the machinery row's 'Fizgig' choice pins 0.38 (recipe); the ladder's inference also gained the v4-600 file as a fallback tier | README + both workflows, verbatim |
| Steps / sampler / scheduler | 20 steps, `er_sde` | workflows: `BasicScheduler('simple', 20)`, `KSamplerSelect('er_sde')` | YES (pinned with the machinery choice; not a free dial — one switch, the author's point) | their workflows |
| Sigma shift | not mentioned anywhere | NO `MiniMaxH3SigmaShift` node in any of their workflows | follows the recipe pin (absent on fizgig lanes) | workflow absence |
| Detail adapter | not mentioned | absent | follows the recipe pin (absent) | workflow absence |
| Base checkpoint | fl2va pruned (their model list) | `UNETLoader` plain fl2va even in the edit workflow | YES — the machinery choice pins the fl2va base (arm-B2 shape) | their edit workflow's wiring |
| **Max-quality variant** | "For the highest quality … **no Turbo LoRA** (its strength is set to 0), at **50 steps** with er_sde" | 8MP workflow: the SAME loader node at strength 0 (kept, not removed), `BasicScheduler('simple', 50)` | YES — the third machinery choice 'Fizgig max quality' (strength-0 loader kept in-graph exactly as they do; omitted only when no turbo file resolves — a 0-strength LoRA is a no-op) | README §example + the 8MP workflow, verbatim |
| Edit lane | "`<Picture 1>` and Change the dress to red…"; "The upscale to 2.5 MP in the edit workflow is intentional: editing seems to work best at that size" | Edit workflow: `MiniMaxH3ReferenceToVideo` (ref_image_size **'match'**), `AILab_ImageResize` longest-side/32-divisible → `GetImageSize` → BOTH the conditioning and the Fizgig latent (canvas follows the resized source) | YES — the `h3img.edit.instruct` lane (studio machinery) / the author path (fizgig machinery); the 2.5 MP edit size is the image-focus optimal on the fizgig leg | README + edit workflow |
| Recommended sizes | "results are best from **3 MP up**; small images come out noticeably weaker" (added in `10d5171` — at the pinned `f3252d2` it read "at any size") | their t2i default renders 2.5 MP; the 8 MP demo is the ceiling | YES — the image-focus tier's optimal markers + the machinery row's note | README @ 10d5171, verbatim |
| Stock conditioning length | not mentioned (their diagrams keep the node) | workflows pin length 5 (legal floor) | pinned (our `conditioningLength: 5`, unchanged) | their workflows |

**Deliberately NOT exposed** (docs read, judged not lane-load-bearing for v1): `ref_image_size` 'match'-vs-'max' (we pin 'max' on our stock REF lane per our own reference-prep ruling — the longest-side scale makes the node's own ref sizing moot), and the `AILab_ImageResize` helper (our app-side `prepareReferenceImage`/`prepareMaskedImage` own sizing; the RMBG pack is not a dependency we take). The 8 MP **no-Turbo** rung economics ("cost more") are surfaced as the max-quality choice's ~2× render-time note rather than hidden.

### The resolution evidence trail (PART 3 of the directive)

- **[COMM, author-demonstrated]** The 8 MP ceiling: the README's own 8 MP still (3872×2176 — their `ResolutionSelector` 8 MP 16:9 snap), no-Turbo 50 steps, with sample artifact committed to the repo. ONE published sample; not our-measured (the GPU verification arm stays queued with E-FS0/E-FS1 — this addendum changes no verdict there).
- **[COMM, author-claimed]** "best from 3 MP up; small images come out noticeably weaker" (README @ 10d5171; note the doc CHANGED between our pinned revision and now — the pinned-era text said "any size").
- **[COMM, second author — the counter-evidence]** astropuzzo's Image Studio README: "Four-megapixel generation and editing were also tested, but cost more and do not guarantee better composition or detail"; "A 2 MP canvas increases memory and runtime and is not a general quality upgrade." The two authors' positions DIVERGE EXACTLY ALONG THE DECODE LEG (Mamad8 image VAE vs video-VAE group decode) — which is why our image-focus OPTIMAL is machinery-aware (image-studio → the native ~1 MP envelope; fizgig → the 2.5 MP rung with the ≥3 MP note), not one number.
- **[DOC, schema]** `FizgigH3StillLatent` width/height max 4096 (served schema, the fixture): every image-focus rung stays ≤4096/dim so ONE list serves both machineries (21:9 tops at its 6 MP rung 3744×1600 — the 8 MP target's long edge exceeds the bound). The stock conditioning schema (16384) is the custom override's wider legal envelope; the contract layer refuses per-lane (proven by test: a 4128-wide fizgig latent fails `value_bigger_than_max`).
- **[COMM, general]** Community image-gen testing on H3 exists beyond the pack authors (r/comfyui "Behold: MiniMax-H3 Image Generation"; a 1 MP 16:9 raw-output thread) — context, not load-bearing for the tiers.

### What shipped (this addendum's adoption record)

PART 1: the `experimentalT1Decode` flag gained its selection surface (the workbench's T=1 machinery row: Image Studio | Fizgig | Fizgig max-quality, honestly labeled experimental) and a third value `'fizgig-max'`; the settings seam now maps BOTH fizgig values to the FULL author path (latent+decode+recipe+fl2va base) — the swap-isolated arm-B shape stays experiment-runner-only. Availability detection is machinery-aware (a fizgig lane needs the Fizgig pack, not the Image Studio pack, and no Mamad8 row). **E-FS0/E-FS1 are UNCHANGED** — the default stays 'image-studio' until the bake-off reports; usability now, default flip only on evidence.

PART 2: three single-frame lanes as registry entries over the unchanged builder branches (extend, not fork): `h3img.r2i.refs` (refs in → one still), `h3img.edit.instruct` (source+instruction → one still — the author's edit wiring), `h3img.edit.inpaint` (masked refine: SolidMask→MaskToImage→prefill composite pre-encode + restore composite post-decode on core classes; the canvas pins to the masked source's 32-snapped dims, the author's own edit-workflow pattern; the restore IS the pixel preservation H3 lacks a sampling mechanism for). Reference prep composes with the longest-side ruling (never cropped) on every lane.

**Verdict impact: none on §5/§6** — the bake-off ladder and the ADJUST verdict stand; this addendum records doc-verified operating points and the usability surface, both of which the bake-off's outcome may yet reorder (a losing Fizgig retires the machinery row's fizgig choices with the row + branch + fixture entries, nothing else welded).
