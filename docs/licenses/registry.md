# The Monoka license registry

> **What this is:** the standing, heavy-diligence record of every third-party
> component Monoka touches — code, packs, weights, fonts, ideas — with what the
> license ACTUALLY STATES (one honest line, not just the SPDX label), how we use
> it, whether it survives AGPLv3, what it obligates, and what it costs to rip
> out. Commissioned by maintainer directives `5b19f1bb` (the license
> infrastructure) and `c5673267` (surface minimality) on epic 4lphxv8; the
> diligence is heavy, the surface is minimal.
>
> **The four license documents, one line each:**
> [LICENSE](../../LICENSE) is the grant (AGPLv3 full text) ·
> [docs/LICENSES.md](../LICENSES.md) is the consolidated third-party NOTICES
> file (the distribution surface — what we ship and what it obligates) ·
> **this file** is the registry (the internal diligence record) ·
> [policy.md](policy.md) is the decision rules + compliance map.
> [PROVENANCE.md](../PROVENANCE.md) records who *we* are (fork lineage, the
> rewrite measurement).
>
> **Machine-checked:** `pnpm license:audit` (gate + CI) verifies registry ↔
> reality lockstep — every `package.json` dependency, every fetch-catalog
> entry id, every node-pack registry id, and every vendored directory named
> below, or the build fails. An addition without its registry row fails CI.
>
> **Verification legend** (inherited from docs/LICENSES.md):
> `[API-YYYY-MM-DD]` checked against the GitHub/HF API that day ·
> `[LOCAL]` verified in this repo's tree · `[DOC]` recorded from research
> captures (`docs/research/*`), not independently re-verified this pass ·
> `[UNK]` not yet verified — verify before adoption.

## Usage modes and blast radius

| Mode | Meaning | C&D blast radius (the modularity contract) |
| --- | --- | --- |
| **vendored** | Third-party code ships in this repo at a pinned revision | The manifest pattern: delete `vendor/nodes/<dir>` + its registry row + LICENSES.md §2 row; the audit catches the residue. Never welded — no vendored pack may grow import edges beyond the node-class seam |
| **fetch-consent** | The user obtains it, through the consent-gated catalog or a local copy they nominate; we redistribute nothing | **Trivial** — delete the catalog entry + registry row. No code of ours contains its bytes; the graph builders reference node *classes*, not pack code |
| **API** | We call a hosted service; nothing enters our tree | Trivial — remove the client call site |
| **replicated** (ported) | Re-implementation in our language; no upstream bytes ship | Provenance headers + goldens; removal = delete the module |
| **referenced-only** | Idea/pattern source in research docs or devdocs; no code or asset flows | Nothing to remove — the citation stays, and citations are protected speech |

The invariant that makes every "less than ideal" license safe: **we never
redistribute what we cannot ship.** The fetch-consent catalog is the standing
workaround (policy.md §3).

---

## 1. Our own code — license and fork inheritance (task 68rnn84, carried forward)

| Component | Source / revision | License as stated | Mode | AGPLv3 verdict | Obligations | Blast radius |
| --- | --- | --- | --- | --- | --- | --- |
| Monoka itself | this repo (`Cobdog/Monoka-dev`, renamed from `Cobdog/MINIMAX-DESKTOP` 2026-09-20) | AGPLv3, full text at repo root `[LOCAL]` | first-party | — | Conveying: license text + source (§4/§6); network interaction: source offer (§13); interactive UIs: Appropriate Legal Notices (§5d) — satisfied by the Settings → License & source section | n/a |
| Upstream fork base (`jamesk9526/MINIMAX-DESKTOP`, no license file → all-rights-reserved) | merge-base `f58eb4b` (upstream tip, 2026-09-09) | **No license — ARR by default.** Our position (recorded openly in [PROVENANCE.md](../PROVENANCE.md)): upstream is machine-generated (no human authorship → not copyrightable per US Copyright Office guidance), and the rewrite is measured: **96.2% of the tree ex-lockfile is authored in-project; upstream residue is 4,516 lines, fully enumerated** (mobile route, Studios suite + prompt machinery, aux builders, styles.css design language, scraps). If the no-authorship position were ever rejected, exposure is exactly that residue; remedies in order: replace it / seek a written grant from jamesk9526 / carve-outs (not recommended) | inherited | The AGPLv3 claim rests on the two recorded grounds; nothing new obstructs it (68rnn84 verdict, 2026-09-17) | Keep the final-diff statement current as the residue shrinks | A C&D from upstream → execute remedy 1 (replace ~4.5k lines, largest chunks: styles.css ~1.3k, mobile route ~388, Studios suite ~2k). Costly but bounded, and the diff is the evidence |
| `docs/archive/plan-v0.md` | upstream planning doc, archived per archive-don't-delete | upstream prose, kept for history, not shipped code | referenced-only | no code exposure | none | already inert |

## 2. Runtime + dev dependencies (all 38 direct, every one permissive)

Every direct dependency is permissive and AGPLv3-compatible — notices ride in
the manifests (`node_modules/<pkg>/package.json` `license` fields) + the
lockfile pins exact versions; a bundled/binary distribution would need a
generated notices bundle first (LICENSES.md §9.2). The full per-package table
with versions regenerates from `pnpm license:audit` into
[docs/LICENSES.md §1](../LICENSES.md); the rows below are the license classes
that carry anything beyond "notice":

| Component(s) | License as stated | Obligations beyond notice | Verdict |
| --- | --- | --- | --- |
| `@huggingface/transformers` | Apache-2.0 — full text + patent grant; §4: retain notices, state changes | Apache §4 notice retention (met by manifest + lockfile) | clean |
| `@playwright/test`, `typescript` | Apache-2.0 (dev deps, not distributed) | — | clean |
| `d3-selection`, `d3-transition`, `d3-zoom` | ISC — permission to use/copy/modify/sell, "provided that… copyright notice… this permission notice… appear in all copies" | copyright + permission notice retention | clean |
| `lucide-react` | ISC (see also §6 — the icon system) | same ISC notice class | clean |
| The MIT mass: `react`, `react-dom`, `zustand`, `better-sqlite3`, `pino`, `pino-pretty`, `ws`, `three`, `hash-wasm`, `react-rnd`, `@base-ui/react`, `@eslint/js`, `@rollup/rollup-win32-x64-msvc`, `@types/better-sqlite3`, `@types/d3-selection`, `@types/d3-transition`, `@types/d3-zoom`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/three`, `@types/ws`, `@vitejs/plugin-react`, `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `stylelint`, `stylelint-config-standard`, `typescript-eslint`, `vite`, `vitest` | MIT — do anything, keep the copyright + permission notice | notice only | clean |

MPL-2.0, BSD, Unlicense-class deps would also pass the audit allowlist; GPL
family WARNs (combining-compatible but distribution duties — record the
decision before committing to one); CC-BY is permissive-but-attribution (never
vendorable); anything NC/proprietary/missing FAILs.

### §2 addendum — Python eval-time dependencies (experiment scripts; nothing shipped)

Not npm deps and not vendored — executed by committed experiment scripts from
a gitignored venv under `test-results/experiments/`; never bundled, so no
LICENSES.md row. Row lands here in the same commit as the script that
declares the dependency (the lockstep discipline, applied by hand where the
audit's machine surface does not reach).

| Component | Source / revision | License as stated | Mode | Verdict |
| --- | --- | --- | --- | --- |
| `omnichar-sdk` 0.1.1 | PyPI (source read at `omnichar/ComfyUI-Omnichar@main` `packages/omnichar-sdk`, 2026-10-10) | **Apache-2.0 — deliberately**: the package carries its own verbatim Apache LICENSE *inside the otherwise GPL-3.0 repo*, the README states "Apache-2.0. The rest of the repository, including the node pack, is GPL-3.0-or-later", and the PyPI wheel declares `License-Expression: Apache-2.0` — triple-verified at the source `[API-2026-10-10]`. Zero-dep base install (`[images]` extra = Pillow only) | eval-time dependency (the CHAR eval, `test-results/experiments/char-eval/scripts/char_eval.py`; [research/omnichar-char-eval-results.md](../research/omnichar-char-eval-results.md)) | clean — the permissive floor; vendor-eligible if native `.char` support (assessment §5.2) ever wants it in-tree. The REPO around it is GPL-3.0 (the node pack) — that part stays fetch-consent per the tier table in [research/omnichar-assessment.md](../research/omnichar-assessment.md) |

## 3. Vendored, ported, and first-party code (ships in this repo)

| Component | Source / pin | License as stated | Mode | Obligations (and how met) | Blast radius |
| --- | --- | --- | --- | --- | --- |
| `ComfyUI-VDN-H3` (vendor tree) | `Saganaki22/ComfyUI-VDN-H3` @ `3eb63496c24ca70faaf8a14b6c75fcb480e34bf1` (v1.5.2) — **upstream REMOVED; custody taken 2026-09-26 (§3 addendum)** | Apache-2.0 `[API-2026-09-14]` `[LOCAL]` | adopted-our-own | Apache §4: LICENSE ships in-tree (audit-checked); changes stated (functional content verbatim; `.git/`, `.github/`, `assets/`, workflow PNGs excluded — recorded in PROVENANCE); Monoka is the sole manager and only upstream of this copy from here (the Viggle posture) | manifest pattern; pack `vdn-h3` row goes with it |
| LongCache patch constants (`server/enginePatch.ts`) | maintainer's ComfyUI-VDN-H3-24GB fork, `tools/install_minimax_block_loop_hook.py` @ local scratchpad | Apache-2.0 as the fork states it; **second reading** — if the ~45 constant lines substantially copy ComfyUI's own loop, they are GPL-3.0 in origin (a licensee cannot relicense the licensor's code). Either reading: no blocker, only attribution (LICENSES.md §8; sign-off still staged) | replicated (verbatim port of constants, TS) | in-file attribution header `[LOCAL]`; never ship a pre-applied patch; applies user-locally behind consent, reversible | self-contained module; the §8 analysis is the record |
| Camera-path compiler (`src/lib/camera/`) | `NyckM/3d-Camera-control-H3-Minimax` @ `846880de859959e801b2c506dc424bd5c8b5c6c4` | Apache-2.0 `[LOCAL]` (LICENSE read from the clone before porting) | replicated (faithful TS port, compiler half only; no upstream bytes) | Apache §4 via per-file provenance headers (repo + commit) + deviations documented in module headers; fidelity locked by upstream-generated goldens (`pnpm test:camera`) | delete the module + goldens; zero import edges outside its seam |
| `minimax-lora-form-adapter` (custom node) | first-party, `v1.0.0` | MIT (LICENSE in the pack) | first-party | MIT notice (shipped); **zero MiniMax-derived runtime bytes** — the projection encoder derives at first use from the user's own artifacts; test-only golden vectors documented in the pack's FIXTURES.md | copy-the-directory = the pack; independently releasable |

## 4. Node packs (the `ENGINE_NODE_PACKS` registry — all ids machine-checked)

Policy in one line: permissive = vendor-eligible; GPL/NO-LICENSE = fetch-consent
only, flagged at consent time (license text + verdict surfaced before the
network is touched); we never redistribute them.

| Pack id | Source / pin | License as stated | Mode | Verdict + obligations | Blast radius |
| --- | --- | --- | --- | --- | --- |
| `vdn-h3` | Saganaki22 @ `3eb6349…` | Apache-2.0 | vendored (§3) | clean; notice | manifest pattern |
| `lora-form-adapter` | first-party | MIT | first-party | clean | trivial |
| `minimax-h3-turbo` | Larryvrh @ `4274783a…` | Apache-2.0 `[API-2026-09-14]` | fetch-consent (vendor candidate) | clean; notice if ever vendored | trivial |
| `h3-hybrid-loader` | scottmudge @ `a44c69b0…` | MIT `[LOCAL 2026-09-18]` | fetch-consent (vendor candidate) | clean | trivial |
| ~~`krea2-controlnet`~~ | facok @ branch `main` | **NO-LICENSE — no license file in the repo; all-rights-reserved by default.** | **RETIRED 2026-09-26** — the registry row + fetch entry were cut (wiring-check §1.5: no builder ever emitted `Krea2Control*`); the record stays as license history. Superseded-by-Kreatine on the Krea lane (§7) | none — never redistributed, now not installable either | retired |
| `h3-audio-t8` | T8mars @ `5cb5008…` (v1.91.0; SHA stamped 2026-10-05 at the Set J install) | **GPL-3.0-or-later** — combining-compatible with AGPLv3, but vendoring would fold third-party GPL code into our distribution and couple releases to an unmaintained-by-us contributor set | fetch-consent, flagged; pattern-adopt only in our code | none triggered (never redistributed); installed at the shared install for Set J (J1's shift-aware gain mechanism + J7's CADS annealing node) — pattern-only in our code | trivial |
| `krea2edit` | lbouaraba @ `86f886da…` | Apache-2.0 `[API-2026-09-14]` | fetch-consent | clean; solo-maintained, v2 retrain in progress — re-verify at v2 | trivial |
| `krea2-anypaint` | alexw5702-afk @ `675be5a9…` | MIT `[API-2026-09-14]` (NOTICE credits Rebels + ostris) | fetch-consent | clean | trivial |
| `krea2-ostris-edit` | ostris @ `7756566…` | MIT `[LOCAL 2026-09-26 — LICENSE file read from the shared install's copy at this rev; GitHub API MIT]` | fetch-consent (vendor candidate) | clean; the original source of the reference-attention/K/V-cache pattern anypaint's NOTICE credits — the Cierpliwy weights row is the reason this is wired (ruling #1, 2026-09-26) | trivial |
| `autocontext` | supElement @ `f1062d34…` | Apache-2.0 `[API-2026-09-16]` | fetch-consent (vendor candidate — 14 files, no weights) | clean | trivial |
| `h3-image-studio` | astropuzzo @ `47dea30…` (v23.0.0) | Unlicense `[code-read 2026-09-21 — pack assessment; served-schema capture from the shared install's clone at this rev 2026-09-22]` | fetch-consent (vendor-eligible: public-domain-equivalent; user-fetch matches the current posture — "adopt now, port later" per the maintainer's 2026-09-22 ruling) | clean | trivial — the ADOPTED T=1/exact-9-13/slice-decode machinery (task afvlbk4; the gate's pack, d4er4ati); our builder emits its 5 load-bearing classes |
| `h3-motion-context` | NikoDemon80 @ `5335715a…` (v0.6.2) | **GPL-3.0-only** — plain v3 LICENSE (no or-later grant), read from the canonical shared install's copy at this rev `[LOCAL 2026-09-21]` | fetch-consent, flagged; never vendored (the T8mars posture) | none triggered (never redistributed); the chain lane's engine side (GAP-1 closed, task 06jr4eh) | trivial |
| `lbh-latent-upscaler` | LBH-123-AI @ `40316cf0…` | MIT `[API + code-read 2026-09-21 — LICENSE added upstream at exactly this commit, 2026-09-17]` | fetch-consent (vendor candidate) | clean; the upscaler WEIGHTS are separate engine-side downloads | trivial — the LBH 2D/3D hires-fix lane (GAP-2 closed, task 06jr4eh) |
| `h3-preview-override` | simsim9-stack @ `d1eb17b0…` | MIT `[code-read 2026-09-22 — LICENSE file (© 2026 InsanE_GeN) read from the repo at the pinned revision during the pack assessment; GitHub API license record MIT]` | fetch-consent (vendor candidate) | clean; the shipped 39.4 MB `taeh3_decoder.safetensors` is a MiniMax-H3-derivative weight that rides the pack's own minivae/ (README's copy-into-vae_approx step) — never vendored by us, and the catalog's Kijai taeh3 row keeps serving the vae_approx slot | trivial — the maintainer-endorsed preview-decoding path (task t6vub9k; the pack-absent fallback is the stock vae_approx file convention) |
| `fizgig-h3-still` | shootthesound @ `f3252d2b…` | MIT `[code-read 2026-09-25 — LICENSE file (© 2026 Peter Neill) read from the repo at the pinned revision during the pack assessment (the whole pack: 94 lines, 2 classes); GitHub API license record MIT]` | fetch-consent (vendor candidate) | clean; zero dependencies, official weights only — the pack RETIRES a weight dependency (the Mamad8 T=1 VAE) rather than adding one | trivial — the E-FS1 challenge arm behind the `experimentalT1Decode` flag only (task 464xfvd; NOT adopted — the bake-off owns the verdict); removal = the registry row + the builder's flag branch + the fixture entries, nothing welds |
| `fizgig-h3-tweaks` | shootthesound @ `5f8b48a…` (registry v1.0.2) | MIT `[code-read 2026-09-26 — the pack assessment (326 lines, 1 class); LICENSE read from the pinned clone at the Set J install 2026-10-05]` | fetch-consent (vendor candidate) | clean; zero deps — the CFG-free inference-shaping dials (residual bands + prompt-strength attention scaling); installed at the shared install for Set J's J1 adherence arm | trivial |
| `semantic-bridge` | Speach1sdef178 @ `0ec72f4…` | **code: NO permissive license asserted** (LICENSE.md explicitly declines to relabel; all-rights-reserved by default) `[LOCAL 2026-10-05]`; the ADAPTER weights (`MiniMaxH3_SemanticBridge_v1.safetensors`, 11 MB) are declared a **MiniMax H3 Community License Model Derivative — §5a family**; SenseNova U1.5 teacher (Apache-2.0) research-only, not redistributed | **fetch-consent, FLAGGED** (the fresh-eyes "unstated" flag RESOLVED to this split record); never vendored | trivial — J1's third adherence mechanism (conditioning-space MLP at encode); v1 scope is FL2VA T2V/FLF only (Ref2VA unsupported per its README) |
| `veda-sparse-attention` (Veda-on-ComfyUI) | veda-sparse @ `fd59c727…` (v0.2.0, from the built wheel `veda_sparse_attention-0.2.0-py3-none-any.whl` — code unmodified; install-protocol-recorded by task jyf2ld2) | **MIT** `[LOCAL 2026-10-05 — code-read at install; the wheels README + LICENSE]`; its Triton INT8 kernel arithmetic derives from **SageAttention v1 (BSD-3-Clause)** — stated in the package docs; the bundled predictor weights are §5a | fetch-consent; **INSTALLED at the shared install 2026-10-05** (custom_nodes/Veda-on-ComfyUI; predictor served from the central `veda/` root via extra_model_paths) | trivial — the learned block-sparse attention node (Part 1 of the combined eval); two TESTBED-ONLY backend shims (fa4.py/flex.py + the VEDA_FORCE_BACKEND hook) added 2026-10-06 for the kernel benchmark, durable copies at `test-results/experiments/gpu-batch-combined/scripts/shims/` — never upstreamed, documented in the results doc |

Fetch-catalog packs not in `ENGINE_NODE_PACKS` (fetched into the user's
instance; same fetch-consent discipline):

| Pack | Pin | License as stated | Verdict |
| --- | --- | --- | --- |
| `pack:lora-form-adapter` (catalog face of the first-party pack) | — | MIT | clean (our own payload, no network) |
| Lightricks/ComfyUI-LTXVideo | `15d09abb…` | **LTX-2-Community-License** — the same agreement as the LTX-2.3 weights (§5): revenue-threshold commercial use + moderation + AI-disclosure duties | fetch-consent; never vendored (custom license, not SPDX-listed) |
| kijai/ComfyUI-KJNodes | `d3cfe216…` | GPL-3.0 `[LOCAL 2026-09-15]` | fetch-consent, flagged (three LTX-2.3 utility nodes) |
| fxtdstudios/radiance | `64fee414…` | GPL-3.0 `[API-2026-09-15]` | fetch-consent, flagged (Float32ColorCorrect) |
| ComfyUI reference checkout (`engine-comfyui` catalog id) | tag `v0.39.0` → `b0b7435…` (the shared install's 2026-10-05 upgrade) | **GPL-3.0.** The checkout exists only on the user's machine, produced by their consented fetch; we convey nothing | fetch-consent, flagged; the §8 tool-vs-program analysis applied to the whole engine |
| ComfyUI_MinimaxH3_AutoContext deep-read sources, Motion Context (NikoDemon80), LBH upscaler | — | Motion Context: **GPL-3.0** `[DOC]` (devdocs MANIFEST); LBH: no provenance yet | GAP rows from the node-pack curation pass: license/pin verification happens AT ROW TIME before they enter `ENGINE_NODE_PACKS` |
| Adudeguyman/ComfyUI-HyperFlow-H3 (the Saganaki22 continuation — upstream repo deleted/404, resolved by this fork; v1.4.0) | `99778905…` | Apache-2.0 `[API + LOCAL 2026-10-04 — LICENSE read from the staged clone at this rev]` | fetch-consent (vendor candidate); staged at `/home/agent/models/hyperflow-dl/` and **INSTALLED at the shared install 2026-10-05** (pack @ `99778905` in custom_nodes; the full-base converted build file-linked into `models/hyperflow/`) for J8's tier-ladder rung — the `ApplyHyperFlowH3` two-time machinery + curve-fits for our exact local pruned int8 bases (no extra download); its drbaph weights row is §5a |
| Engine-side Python deps of the combined eval (installed into the shared install's venv 2026-10-06, torch pinned at 2.12.1+cu130): `sageattention 1.0.6` (PyPI) · `flash-attn-4 4.0.0b32` · `miowtion 0.1.0` (both from the jyf2ld2 wheel set at `/home/agent/models/wheels/`) · their transitive `nvidia-cutlass-dsl 4.8.0` / `apache-tvm-ffi` / `torch-c-dlpack-ext` / `quack-kernels` | as pinned | **BSD-3-Clause** (sageattention v1; flash-attn-4/FA4 — LICENSE verified in the wheel build, task jyf2ld2) · **Apache-2.0 family** (miowtion; its vendored FA4 modules carry the upstream BSD-3 + AUTHORS) · cutlass-dsl BSD-3 `[LOCAL 2026-10-06 — licenses read from the installed dist-infos]` | runtime-separate-process (the engine's own venv — the §2a/§26 GPL-boundary analysis applies unchanged; nothing enters our repo or distribution) | clean; the Part-1 kernel arms (dense-SDPA was already shipped; sage via `--use-sage-attention`; FA4-patched via the miowtion wrapper) — removal = `uv pip uninstall`, zero repo surface |

## 5. Model weights and checkpoints (never in the repo; linked, never copied)

Weights are fetched by the user with the license surfaced at consent
(`flaggedLicense()` classes in FetchBrowser), or staged manually. We convey
none of them. The catalog pins sizes + sha256 per file.

### 5a. The MiniMax H3 community-license family

What the license actually states (as recorded; the agreement text is
MiniMax's, per-repo): the weights are a licensed grant, not open source —
community-reported **Applicable Territory excludes EU/UK/South Korea/USA**;
commercial use requires a MiniMax license (sold through Comfy); **outputs
follow the same terms**; derivatives inherit. Verify the current text on the
model card — this is `[DOC]`-grade, community-confirmed in multiple pack
READMEs, not legal advice.

| Asset (catalog id where fetchable) | License record | Mode |
| --- | --- | --- |
| MiniMax H3 base / turbo / audio-VAE (the primary stack) | MiniMax H3 Community License `[DOC]` | manual-stage (user-supplied); the one-time LicenseNotice was the designed in-app surface — currently unrouted, see policy.md §4 |
| `vdn-stage-dmd-250`, `vdn-stage-b-2000` (OpenVDN/vdn-minimax-h3) | `minimax-h3-community-license-agreement` `[API-2026-09-14]` | fetch-consent |
| `fun-control-union` (alibaba-pai) | MiniMax H3 Community License `[API]` | fetch-consent |
| `smhfacct-hybrid-b25-49` | inherits fl2va/ref2va terms, no additional grant `[API]` | fetch-consent (optional; runtime merge preferred) |
| `mamad8-t1-image-vae` | MiniMax H3 derivative, no separate grant `[API-2026-09-18]` | fetch-consent |
| `fasth3-vae-w4a8` (jacokon) | `minimax-h3-community-license-agreement` + **HF dataset gate** (per-account acceptance; anonymous fetch fails honestly 401) `[API-2026-09-15]` | fetch-consent |
| `matlowai-fused-turbo-int8-convrot` (`matlowai-fused-turbo-int8` catalog id) | merged weights stay MiniMax-H3 derivatives (folded turbo/base conversion are Apache-2.0 sides) `[API-2026-09-15]` | fetch-consent |
| `taeh3-preview-decoder` (Kijai) | **Apache-2.0 repo**; the weights are a MiniMax-H3 derivative trained by Kijai `[API-2026-09-18]` | fetch-consent |
| `minimax_h3_pdmd_4nfe_comfyui_v6` (Iwannapose conversion of pdmd2026/pdmd_4NFE_lora — the PDMD 4-NFE student, arXiv 2609.35768) | Apache-2.0 upstream AND conversion `[API-2026-10-04]` — an H3-33B-derived distill; sha-verified at fetch (1.96 GB) | fetch-consent |
| `meridian_teacher_lora` + `meridian_turbo_lora` (Viggle/Meridian, the ComfyUI flavor + frozen embeds + recam code — J2's camera/retime pair) | weights: **MiniMax H3 Community License** (LICENSE read at fetch: Applicable Territory excludes EU/UK/ROK/USA; >$20M/yr commercial needs written MiniMax authorization; AUP; outputs follow the same terms) — the §5a grant, not VGGT-FAIR-NC; code Apache-2.0 (LICENSE-CODE) `[API + LICENSE-read 2026-10-04]`; sha-verified at fetch (1.88 GB × 2) | fetch-consent; **FLAGGED** — the geometry dependency VGGT-Omega carries the FAIR-NC gate (§5i), surfaces at consent with it |
| `custom_node_hyperflow_8step_v1.0_comfyui` (drbaph conversion of Video-Rebirth/hyperflow — J8's tier-ladder rung) | `license: other` with `license_name: minimax-h3-community-license-agreement` on the card `[API-2026-10-04]` — an H3 Model Derivative, §5a family; sha256 cross-checked at fetch against BOTH the HF LFS etag and the node pack's own `assets/hyperflow.json` pin (`b10b1a78…cd71`) | fetch-consent |
| `dmad_4step_lora_critic_comfyui` + `dmad_4step_full_critic_comfyui` (our first-party fused-QKV conversions of ZhengmingYu/DMAD — the 4-step adversarial-distillation students, arXiv 2610.02188; the combined eval's challengers) | `license: other` / `license_name: minimax-h3-community-license-agreement` + the full agreement file in the repo `[LOCAL 2026-10-05 — LICENSE read at fetch; card + README]` — §5a family; conversion tool + sources staged at `/home/agent/models/dmad-dl/` (converted files sha: lora `3a5f1e40…`, full `a93f045d…` after the 2026-10-06 defect fix, task comment bln4ycg) | fetch-consent (manual-stage; the §5a duties ride the weights) |
| `minimax_h3_t2va_veda_8nfe_600step_preview_fp8` (the Veda learned block-sparse predictor, 275 MB — Veda-Sparse/Minimax-H3-T2VA-Veda-8NFE-600Step-Preview) | **MiniMax H3 Community License** (an H3-derivative predictor) `[LOCAL 2026-10-05 — wheels README + card]` — §5a family | fetch-consent; staged at `/home/agent/models/veda/` (central root, extra_model_paths) |
| Viggle/Viggle-Animate; t8star Vdn-Minimax-H3-Comfy; FastVideo FastH3; Tutu 20→8 NFE LoRA | `minimax-h3-community-license` class `[API]`/`[DOC]` | watch tier |

### 5b. The Krea 2 community-license family

What it actually states (from the LICENSE.pdf + NOTICE, `[API-2026-09-14]`):
derivative works under the same license; **commercial use only under the
revenue threshold (§2.3, currently <$1M/yr)**; content-moderation duty (§4.2);
AI-disclosure duties (§4.3); the identity-edit author additionally disallows
non-consensual use of real people. These are USER duties that ride the
weights — surfaced at consent, never enforced in-app (the content-neutral
position, 68rnn84 F10).

| Asset | License record | Mode |
| --- | --- | --- |
| `krea2-identity-edit` (conradlocke v1.2 + r128/r64) | `krea-2-community-license` `[API]` | fetch-consent |
| `krea2-anypaint` (yijunwang2 rank-32 adapter; its pipeline code carries a separate PIPELINE_LICENSE — only the adapter is fetched) | `krea-2-community-license` `[API]` | fetch-consent |
| `krea2-ostris-inpaint-edit` (Cierpliwy default + _mild + _strong; license declared via card metadata `license: other` → license_name krea-2-community-license — no LICENSE file ships in the repo, the card IS the grant record `[API-2026-09-26]`) | `krea-2-community-license` `[API-2026-09-26]` | fetch-consent |
| Krea 2 base + style-reference module | Krea AI Community License `[DOC]` | verify at first-classing |

### 5c. The LTX-2 community-license family

What it actually states (LICENSE dated 2026-01-05, `[API-2026-09-15]`): the
Lightricks counterpart of the community licenses — permitted commercial use
under a revenue threshold, content-moderation + AI-disclosure duties; the
`ltx-video-license` rows are derivatives linking the same Lightricks terms.

Catalog ids under this class: `ltx23-dev-checkpoint`, `ltx23-dev-fp8`,
`ltx23-gemma-encoders` (Comfy-Org repack of Gemma 3 — Gemma terms also apply
to the underlying weights), `ltx23-latent-upscaler`, `ltx23-distilled-loras`,
`ltx23-distilled-rank111`, `ltx23-dearchive`, `ltx23-obscura-remova`,
`ltx23-ic-outpaint` (these three carry `ltx-video-license`),
`ltx23-kijai-transformer`, `ltx23-kijai-projection`, `ltx23-kijai-vaes`
(Kijai conversions, same terms). All fetch-consent, flagged at consent.
`ltx23-icedit-remove-pair` (joyfox) is **Apache-2.0** on the LoRAs themselves
— outputs remain subject to the LTX-2.3 base terms.

### 5d. Qwen (the regime change)

What the license actually states (full text read, `[DOC 2026-09-20]`):
**Qwen RESEARCH LICENSE — NOT Apache-2.0** (every predecessor in the family
was; 2.1 changed the regime). Non-commercial — research/evaluation use only;
commercial use requires a separate license from Alibaba; attribution + naming
restrictions ("Built with Qwen" documentation when outputs train distributed
models; "Qwen" must not be a derivative product's primary name);
redistribution requires the license copy + change notices; **governed by
Chinese law, Hangzhou courts**.

Catalog ids: `qwen21-dit-convrot`, `qwen21-te-convrot`, `qwen21-vae` —
fetch-consent, flagged (the `flaggedLicense()` restricted-use class catches
`qwen-research`). A commercial posture for the app would flip this family to
NONE — not our call to make, and the personal-desktop use case stays inside
the research grant.

### 5e. The audio lane (research-stage rows)

| Asset | License as stated | Mode |
| --- | --- | --- |
| YuE2-3B (m-a-p) | **CC-BY-NC 4.0 on the weights** — ungated public download; attribution required; non-commercial, and in CC-BY-NC practice the terms attach to outputs/adaptations. Lineage break: every YuE 1.x repo was Apache-2.0 (v1 preserved on the `YuE-v1` branch); code components MIT (stable-audio-tools, SnakeBeta). Every derivative quant/LoRA inherits NC `[DOC 2026-09-21]` | fetch-consent when adopted; never vendored; forecloses selling YuE2-generated music — music3 stays the commercial-safe rung (acestep removed 2026-09-21, nn5ld47) |
| MiniMax Music 3 (MiniMaxAI/MiniMax-Music3) | **MiniMax Community License — open weights, ungated** (corrected 2026-09-21 from "provider API terms"; the paid music API closed to new users 2026-08-20). Commercial use free under the revenue threshold (~$20M/yr) with attribution `[DOC]` | fetch-consent when the music3 dock goes first-class; same consent surfacing as §5a |
| ACE-Step (1.5) | Apache-2.0 per the research capture `[DOC]` — **re-verify at any adoption commit** (LICENSES.md §5 keeps this row open) | fetch-consent when first-classed |
| LTX-2.5, Z-Image | per their HF cards — **verify at first-classing time** `[UNK]` | open |

### 5f. The image lane: Klein, Anima, Qwen-IE

| Asset | License | Mode |
| --- | --- | --- |
| FLUX.2 klein (BFL, 4B/9B base + distilled) — the fast refine tier | **`[UNK]` — not yet verified.** BFL model licenses are custom agreements (the FLUX Dev class is non-commercial with output terms); nothing may be assumed from the family name. Verify the repo LICENSE before the family enters the model registry | fetch-consent only after the row exists |
| Anima (circlestone-labs, 2B anime/illustration T2I) — future arrival | **`[UNK]` — verify at arrival.** Also: the name collides with the Intern pack's `Anima*` node prefix — rename one side when it lands (node-pack-registry §1.5) | stock loaders expected; verify |
| Qwen-Image-Edit 2511 Lightning (refine watch-item) | same Qwen research license as §5d | referenced-only today |

### 5g. Preprocessor weights

| Asset | License | Mode |
| --- | --- | --- |
| `dwpose-onnx` (yzd-v), `dwpose-torchscript` (hr16), `da3-base` (Comfy-Org Depth-Anything-3) | Apache-2.0 `[API-2026-09-14]` | fetch-consent; notice-clean |
| `moge_2_vitl_normal_fp16` (Comfy-Org/MoGe repack of Ruicheng/moge-2-vitl — J2's geometry-warp comparator) | **MIT both sides** — the mirror's tag AND the upstream weights repo's tag `[API-2026-10-04]`; the MoGe integration is core ComfyUI (`nodes_moge.py` + `geometry_estimation/`), no pack; sha-verified at fetch (662 MB) | fetch-consent; notice-clean; **INSTALLED at `models/geometry_estimation/` 2026-10-05** for Set J (the offline MoGe-warp conditioning + the camera-compliance metric — the VGGT-free J2 lane) |
| `hed-annotator`, `mlsd-annotator` (lllyasviel/Annotators) | **NO-LICENSE** — repo carries only a `license: other` tag, no file `[API]` | fetch-consent, flagged; never redistributed |

### 5h. The Wan lane (Set D engines — SCAIL-2, Wan-Animate-2)

Both upstreams are permissive — no community-license duties ride these
weights, and neither grant restricts outputs. Fetched 2026-10-04 for the GPU
batch's Set D caption factorials (task ourbqum), via the Comfy-Org repackage
repos (the actual home of the split_files layouts — the first attempt's
GitHub-derived URLs returned stubs; corrected in 58894d0); sha256-verified
against the HF LFS etags at fetch time, staged in
`/home/agent/models/{scail2-dl,wan-animate2-dl}/` pending Set D install.

| Asset | License record | Mode |
| --- | --- | --- |
| `scail2-int8` (`wan2.1_14B_SCAIL_2_int8_convrot`) | **MIT** upstream (zai-org/SCAIL-2) AND mirror (Comfy-Org/SCAIL-2) `[API-2026-10-04]` — a Wan2.1-14B derivative under the permissive floor | fetch-consent |
| `wan-animate2-distill-int8` (`wan_animate_2_distill_int8_convrot`; the base non-distill variant is fetch-on-demand) | **Apache-2.0** upstream (Wan-AI/Wan2.2-Animate-2-14B) AND mirror `[API-2026-10-04]` | fetch-consent |
| Shared Wan assets: `umt5_xxl_fp8_e4m3fn_scaled`, `Wan2_1_VAE_bf16`, `clip_vision_h` | Apache-2.0 `[API-2026-10-04 — the Comfy-Org/Wan-Animate-2 repackage's tag; the umt5/clip_vision lineage rides the Wan distribution]` | fetch-consent |
| `lightx2v_I2V_14B_480p_cfg_step_distill_rank64` | Apache-2.0 (the LightX2V distill; distributed via Comfy-Org/Wan-Animate-2 — also the official SCAIL-2 template's speed LoRA @ 0.8) `[API-2026-10-04]` | fetch-consent |
| `wan2.1_SCAIL_2_DPO_lora` + `wan2.1_SCAIL_2_relight_lora` | MIT (SCAIL-2's own — DPO: hands/lip/eye sync @ 1.0; relight: replacement-mode lighting blend) `[API-2026-10-04]` | fetch-consent |
| `sam3.1_multiplex_fp16` (the official SCAIL-2 replacement workflow's tracker) | **SAM License** (Meta community-style, dated 2025-11-19 — royalty-free use/modify/distribute grant with acceptable-use + trade-controls riders; LICENSE read at fetch) `[API + LICENSE-read 2026-10-04]` | fetch-consent, **flagged** (custom license; surfaced at consent, never vendored) |

### 5i. The Set J fresh-eyes lane (VOID + the gated trio)

Fetched 2026-10-04 for the GPU batch's Set J pilots (task ourbqum), Set D's
verified-path discipline verbatim — HF API sizes + LFS-etag sha256s, both
verified after download; staged under `/home/agent/models/{void,moge,
meridian,hyperflow}-dl/` pending J dispatch (manifest
`/home/agent/models/setJ-fetch-manifest.json`; 51/51 files PASS, 38.1 GiB).
VOID and MoGe are **core ComfyUI** at the shared install (`nodes_void.py`,
`nodes_moge.py` + the official blueprints) — weights only, no node packs.
Three assets are **maintainer-staged** (gated/login-walled — surfaced, never
routed around), recorded below with everything the maintainer's own download
needs.

| Asset | License record | Mode |
| --- | --- | --- |
| `void_pass1` + `void_pass2` + `cogvideox_vae` + `raft_large_C_T_SKHT_V2` + `t5xxl_fp16` (Comfy-Org/void-model — J3's deterministic removal) | **Apache-2.0** (the Comfy mirror of Netflix VOID, per fresh-eyes §3.2; the blueprint's own URLs) `[API-2026-10-04]`; riders: the RAFT file is torchvision BSD-3-Clause lineage, t5xxl is comfyanonymous/flux_text_encoders lineage (Apache-2.0), and the sam3.1 tracker the blueprint also names is already §5h; sha-verified at fetch (pass1/pass2 11.14 GB each) | fetch-consent |
| **VGGT-Omega** (`vggt_omega_1b_512.pt`, facebook/VGGT-Omega — Meridian's REQUIRED geometry dependency) | **gated:manual** (HF access request + acceptance) + **Meta FAIR Noncommercial Research License v1** — noncommercial-only on the materials AND their outputs/results (quoted in Meridian `docs/installation.md` §2; LICENSE.txt sits behind the gate — anonymous fetch 401) `[API-2026-10-04]` | **maintainer-staged, FLAGGED** — the ledger's "VGGT-FAIR-NC surfaces at consent" confirmed: it rides the dependency, not the Meridian weights (§5a) |
| `Anime2Realsim__H3.safetensors` (CivitAI model 2783657, version "Minimax H3 ref2v v1.0" id 3356617 — J5) | **CivitAI user-upload terms**, per-model flags: no-credit OK, commercial OK (Image/Rent/RentCivit/Sell/SellMerge), derivatives OK `[API-2026-10-04]`; metadata anonymously readable but the download is login-walled (401) — API sha256 `BCE58949…DE2A3E` recorded for post-download verification | **maintainer-staged** (user's own download, the CivitAI user-fetch class) |
| UniLumos (`unilumos.pt` + `vae.pth` + `models_t5_umt5-xxl-enc-bf16.pth`, Alibaba-DAMO-Academy/UniLumos — J8's relight challenger) | weights tag **apache-2.0** `[API-2026-10-04]`; the CODE repo (github.com/alibaba-damo-academy/Lumos-Custom, NeurIPS'25 / arXiv 2511.01678) has **NO LICENSE file** — fresh-eyes' "code unlicensed → fetch-weights + own glue" stands; **gated:auto** (any logged-in HF account) | **maintainer-staged** (11.4 GB of the repo is a bf16 umt5-xxl; whether our local fp8 substitutes is unproven — J8's call) |
## 6. Fonts, icons, cursor (the shibui plan — none shipped yet)

Planned per [shibui-fonts-icons.md](../research/shibui-fonts-icons.md); rows
become obligations only when files land in `public/fonts/`:

| Asset | License as stated | Obligations when shipped | Verdict |
| --- | --- | --- | --- |
| JetBrains Mono (variable, mono voice) | **OFL 1.1** — bundle/embed freely in AGPL software, ship the license text, respect Reserved Font Names (no renaming internal names; no subclassing — we do neither) | OFL copy beside the woff2 + the Reserved-Font-Name discipline | vendor-safe |
| IBM Plex Sans (variable, body voice) | OFL | same | vendor-safe |
| Nerd Fonts symbols-only subset (fallback glyph layer) | OFL (patched-font release) | same; the full patched fonts (127 MB+) are never shipped — symbols-only ~3 MB | vendor-safe |
| lucide-react (current dep, planned upgrade `^0.468.0 → ^1.47.0`) | ISC | notice (already in §2) | vendor-safe |
| The custom cursor | self-drawn PNG data-URIs (sumi fill, washi outline) — first-party work | none (our own asset) | clean |
| Berkeley Mono (considered) | **Proprietary** — commercial license, no app embedding, no redistribution | — | **REJECTED** — cannot ship in an AGPL repo; recorded so it is not re-litigated |

## 7. The open-decision zone (maintainer calls — surfaced, not decided)

| Component | The question | The facts that frame it |
| --- | --- | --- |
| **ComfyUI-Kreatine** (the maintainer's own two-stage sampler) | Vendor / fetch-consent / first-party-install / dual-license? | **GPLv3, and the copyright is the maintainer's** — the never-vendor-GPL rule exists to avoid coupling releases to third-party contributor sets; here the contributor set is us. Options recorded in [node-pack-registry.md §5](../research/node-pack-registry.md). The registry row (when the Krea lane lands) records which and why. Subordination note: Kreatine itself vendors the anypaint prepare/encode pair byte-faithfully (MIT notices kept) and takes schedule math from Auryg (MIT) + per-token weighting from Kijai lineage (GPLv3) — consistent with its own GPLv3; it ships THIRD_PARTY_NOTICES.md |
| **astropuzzo ComfyUI-MiniMax-H3-Image-Studio** | Vendor the 4 needed nodes, or write the ~150-line first-party port? | **The Unlicense** — public-domain-equivalent, the permissiveness ceiling: unconditionally vendor-eligible under AGPLv3, and equally clean to pattern-copy (the Unlicense asks nothing — no attribution obligation exists; we would still credit by habit, not duty). Both paths license-clean; the trade is maintenance-ours vs bus-factor-1-theirs. Adoption task in flight |
| **Acly comfyui-tooling-nodes (ETN)** | Runtime-only GPL dependency for the bridge lane | GPL-3.0 — installed on the user's instance, never vendored; the separate-process/instance boundary is the compliance mechanism (policy.md §2 grey) |
| **Acly/krita-ai-diffusion** | Prior art for a Monoka↔editor bridge | GPL-3.0 — referenced-only; code never copied (the transport *pattern* is uncopyrightable fact) |
| **intern_nodes** (the maintainer's own contract-seam pack) | Row + license when the bridge lane lands | first-party-class; assign a license at row time (MIT suggested — matches the form-adapter precedent) |

Standing decisions carried forward from 68rnn84 (staged, unchanged): the
headers policy (LICENSES.md §7 — default A, no per-file headers); the VDN
patch §8 sign-off (status-quo + documentation recommended).

## 8. Referenced-only (docs/library + docs/devdocs captures)

The [library](../library/README.md) and [devdocs](../devdocs/MANIFEST.md)
captures are internal reference copies — GPL-3.0 and no-license sources read
there, never shipped, never vendored; each capture's header carries its
license verdict. External ARR web docs (docs.comfy.org) are cited as URLs
where possible; captured pages are internal-reference only. Nothing in this
section distributes.

## 9. The C&D posture, summarized

If any single component's owner ever objects, the answer is already
mechanical:

1. **Fetch-consent items (all GPL/NO-LICENSE/NC packs, every weight):** remove
   the catalog row + registry row. We never possessed a distribution right and
   never exercised one; the user's own consented copy is theirs. Cost: minutes.
2. **Vendored Apache/MIT items:** the grant is irrevocable-in-practice and
   recorded at a pinned revision; a hostile relicensing upstream cannot
   retroactively revoke the version we pinned. Cost of removal anyway: the
   manifest pattern.
3. **Our AGPLv3 claim:** the 68rnn84 measurement is the defense file — the
   diff is the evidence; remedies enumerated and bounded.
4. **The name**: "Monoka" + the placeholder grep-ability note (PROVENANCE) —
   no third-party naming exposure known; the Qwen naming restriction is the
   one live naming rule (never make "Qwen" a product name — it never will be).

*This registry is engineering diligence, not legal advice (IANAL, as ever).
The grey areas and the disclaimer live in [policy.md §5](policy.md).*

### §4 addendum — ComfyUI-Viggle-Animate-H3 (2026-09-26: custody taken)
Upstream (`bhardwajRahul/ComfyUI-Viggle-Animate-H3`) REMOVED; the maintainer handed
over their local copy (installed at the shared install's `custom_nodes/`, git tree
intact at `6ae081a` — v1.3.2, "Fix long-video tail conditioning"). **Apache-2.0** —
clean for full first-party adoption (vendor-eligible, no constraints). Code + example
workflows only (chunked-sampler, long-video-advanced); the WEIGHTS remain the separate
drbaph HF quants (int8 47GB / pruned-int8 21GB / r64 DMD-LoRA) — status checked
2026-09-26, see the Viggle assessment addendum. Posture per the maintainer's ruling:
managed by us entirely; the local git history is the archive of record.

**Correction (2026-09-26, maintainer):** the handed-over tree is a FORK of the original
pack (bhardwajRahul's fork, not the pack creator's upstream). Per the maintainer's
ruling the `origin` remote has been REMOVED from the local tree — no accidental
fetches from a non-creator repo; Monoka is the sole manager and only upstream of
this copy from here.

**Weights mirrored (2026-09-26, hash-pinned):** pruned_int8_convrot checkpoint
(21,033,720,080 B, sha256 `c16db9a4…d3540`) + both DMD-LoRA cuts (full 3.77GB
`71361eb8…5930`; r64 0.94GB `8dc50f29…4446`) + the frozen anyframe embed
(`86ae5987…0fde`) — all in the central home, symlinked into the shared install.
Viggle-Animate is now FULLY local: code (custody), weights (mirrored), recipe
(the v1.3.2 examples), documentation. Nothing upstream-removable remains.

### §3 addendum — ComfyUI-VDN-H3 (2026-09-26: custody taken, the graph lane finished)

Upstream (`Saganaki22/ComfyUI-VDN-H3`) REMOVED; the maintainer's ruling (the
2026-09-26 inventory decision, §Rulings #3): *"we still have local copies — we
adopt it entirely as our own. We take on the debt of managing this one, since
there is no upstream to contend with."* **Apache-2.0** — clean for full
first-party adoption. Posture per the ruling, mirroring the Viggle custody
language: managed by us entirely; the vendored tree at the pinned
`3eb6349` (v1.5.2) and its pin are the archive of record — Monoka is the sole
manager and only upstream of this copy from here. Nothing upstream-removable
remains in the product path: code (custody, `vendor/nodes/ComfyUI-VDN-H3`),
engine integration (the `vdn` launch profile + the consent-gated LongCache
patch), graph lane (the `vdn.apply` acceleration entry, task 9up52mj), and
documentation. The WEIGHTS stay the separate OpenVDN fetch rows
(`vdn-stage-dmd-250` / `vdn-stage-b-2000`, §5a class) — fetched with consent,
never redistributed; the separately-installed `-24GB` variant on the shared
install is environment, not product (it registers `*_24GB`-suffixed classes;
detection and emission are by OUR pinned pack).
| `h3-keyframe-animation` (alvdansen; hero/tween/sequence adapters, 3×1.88 GB, converted for fused-qkv; the *Animating on Twos* paper's artifacts) | **H3 Keyframe Animation Adapter License 1.0.0** — a PolyForm-Small-Business derivative: free/unlimited for individuals, researchers, nonprofits, orgs <$2M revenue+capital (90-day grace); paid above; no competing product; notices ride. Plus NON-WAIVABLE MiniMax H3 base terms (§5a) `[LICENSE-read 2026-10-05 — gated repo accessed on the maintainer's auth at their direction]` | fetch-consent, **FLAGGED** (eligibility class — surface at consent; the maintainer is eligible) |
