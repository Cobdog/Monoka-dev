# Prompting-guide founding build — BUILD REPORT

> Flux task: vcks4mb · Build date: 2026-10-03 · Builder: the
> prompting-guide research agent (opus-tier, dispatched by name for
> accuracy). Scope: per-family research packets + the master prompting
> guide (preset curation, prefill templates, mix-and-match block grammar)
> for every model family Monoka uses or plans to use. Corpus first, web
> second; built-in WebSearch/WebFetch per the maintainer's directive
> (searxng intentionally unused this session).

## 1. Coverage map (family × coverage class)

Coverage classes: **CORPUS** (already answered by our research docs before
this build) · **WEB-FILLED** (gap closed by this build's web research) ·
**SPEC-DERIVED** (constructed from the documented contract; nothing
exists) · **UNK** (remains open).

| Family | Contract | Samplers/res/steps | Task recipes | Failure modes | License |
|---|---|---|---|---|---|
| MiniMax H3 | CORPUS (library captures + SKILL.md fetch) | CORPUS (sigma thesis + turbo cards) | CORPUS-rich (editing/workbench/transitions docs) + SPEC-derived assembly | CORPUS (six plagues + our measured) | CORPUS |
| Krea 2 | CORPUS (Kreatine local truth + edit-mode sweep) | CORPUS | CORPUS + E-K1 measured prompt contracts | CORPUS + MEASURED | CORPUS |
| FLUX.2 Klein | CORPUS-thin → **WEB-FILLED** (BFL guides verbatim: slot template, bad-list, retention, hex, multi-ref) | CORPUS-thin (True-V1 card) + UNK on sigma doctrine | WEB-FILLED (edit recipes from verbatim examples) | WEB-FILLED (bad-list) | CORPUS |
| Qwen-Image-2.1 | CORPUS (assessment) + **WEB-FILLED** (official README ratios/RGBA/steps) | CORPUS (fooocus measured ladder + turbo rules) | CORPUS (fooocus measured mask protocol) | CORPUS (measured transparency/mask-word findings) | CORPUS |
| Anima | CORPUS-thin → **WEB-FILLED** (full official card: tag grammar, prefix, negative, samplers, limitations, license) | WEB-FILLED | SPEC-derived from card (portrait/mixed presets) | WEB-FILLED (card limitations) | WEB-FILLED |
| Viggle-Animate | CORPUS (addenda 1–6 incl. frozen-embed proof) | CORPUS | CORPUS (repaint-path doctrine) | CORPUS | CORPUS |
| SCAIL-2 | **was UNK** → WEB-FILLED (zai-org README: masks, caption-not-instruction, 40 steps/5.0/unipc/shift 3) | WEB-FILLED | WEB-FILLED (replacement/animation/multi-view) | WEB-FILLED | WEB-FILLED (Apache-2.0) |
| Wan-Animate-2 | **was UNK** → WEB-FILLED (card: appearance caption w/ motion exclusion, 40→10 steps, Apache-2.0) | WEB-FILLED | WEB-FILLED | WEB-FILLED | WEB-FILLED |
| Meridian | CORPUS-thin → WEB-FILLED (full card: frozen embed, camera CLI flags, teacher/turbo steps-shifts, lengths) | WEB-FILLED | WEB-FILLED (geometry-not-prose) | WEB-FILLED | WEB-FILLED (incl. VGGT-FAIR-NC gate) |
| YuE2 | CORPUS (dedicated assessment) | CORPUS | CORPUS | CORPUS | CORPUS (CC-BY-NC flip recorded) |
| Music 3 | CORPUS-thin → WEB-FILLED (three-section caption fields, tag rules, rewriter skill; sampler settings remain UNK) | partial (UNK on steps/cfg) | WEB-FILLED | thin | CORPUS |
| Fizgig | CORPUS (dedicated assessments + addenda) | CORPUS (pinned recipes) | CORPUS | CORPUS | CORPUS |
| FaceRefine | CORPUS (ecosystem + workbench) | CORPUS (shift-12 denoise gotcha) | CORPUS | CORPUS | COMM-tier |
| LatentSync | CORPUS-absent → WEB-FILLED (post-process, no prompt, duration-limit behavior) | COMM-tier; exact ComfyUI points UNK | n/a (no prompt) | thin | UNK until adopted |

**Corrections this build lands (the accuracy pass):**

1. **The "zero-prompt engines" grouping was wrong for 2 of 3.** Only
   Viggle-Animate is text-free (frozen 362×5120 embedding, no TE in the
   graph). SCAIL-2 wants LONG detailed video-caption prompts (short/empty
   runs but underperforms); Wan-Animate-2 REQUIRES an appearance caption
   with motion explicitly excluded, and uses text for camera decoupling.
   The guide + propagation packet document the real contracts.
2. **BFL's docs.bfl.ai guides have been re-authored around FLUX 3 Image**
   (BFL's next generation). The FLUX.2-verbatim quotes (bad-list, jar/
   polaroid region targeting) still hold from the 2026-09-18 harvest; new
   facts (1–10 refs, bbox rows, `<ref_image_0>`/`<id>` tokens) are tagged
   generation-flagged in the Klein packet — klein itself is documented at
   4 refs.
3. **Anima's license is nuanced and now recorded precisely**: weights
   non-commercial, OUTPUTS commercially usable (the packet quotes the
   allowed/disallowed lists verbatim).

## 2. What the guide contains (the product-content inventory)

- §0 contract-difference table (the four dialects side by side — the
  anti-blurring device).
- §1 the cross-family universals + the don't-transfer list + the triangle.
- §2 task×family matrix (19 task rows × 7 lanes).
- §3 **24 curated presets** (3.1–3.24), each with settings regime and
  evidence tag — the prefill-ready layer.
- §4 prefill templates with `{slot}` markers, incl. the family-agnostic
  edit scaffold with dialect-swap rules.
- §5 the block grammar: 12 blocks + 7 composition/conflict rules + worked
  compositions.
- §6 per-family "why" (fundamentals, one paragraph each; full versions in
  packets).
- §7 the decision framework (intent → workflow → pattern → lean).
- §8 packet index.

## 3. Source list (this build's fresh fetches, 2026-10-03)

1. MiniMax-AI/MiniMax-H3 `skills/h3-prompt-writing/SKILL.md` (raw) [DOC]
2. docs.comfy.org `/tutorials/video/minimax/minimax-h3-prompt-guide` — the
   10 style embeddings + the H3 negative-branch doctrine [DOC]
3. huggingface.co/circlestone-labs/Anima — full card [DOC]
4. docs.bfl.ai `/guides/prompting_unified_basics`, `/guides/prompting_editing_overview`,
   `/guides/prompting_editing_single_reference` [DOC — now FLUX 3-era]
5. huggingface.co/black-forest-labs/FLUX.2-klein-9B — card re-fetch [DOC]
6. github.com/zai-org/SCAIL-2 — README (inputs/masks/settings/license) [DOC]
7. huggingface.co/Wan-AI/Wan2.2-Animate-2-14B — card [DOC]
8. huggingface.co/Viggle/Meridian — full card [DOC]
9. docs.comfy.org `/tutorials/audio/minimax/minimax-music-3` [DOC]
10. raw.githubusercontent.com/QwenLM/Qwen-Image-2.1/main/README.md [DOC]
11. LatentSync search pass (bytedance/LatentSync + wrapper) [COMM]

Everything else is corpus, cited by path inside each packet (the packets
carry the full internal source lists).

## 4. What I'd research next with GPU access

Ranked by information-per-GPU-hour against the packets' open cells:

1. **E-K3 (Krea 2 prompt-discipline × dials)** — the one designed-but-unrun
   experiment that directly gates guide content: whether H3-style
   keep-lists are neutral or harmful on the Identity-Edit lane, and
   whether Krea2T phrases compose with edit LoRAs. The §4.1 prefill's
   dialect-swap rule currently rests on a prediction.
2. **SCAIL-2 vs Wan-Animate-2 caption sensitivity** — both contracts are
   card-level only; a 3×(bare/short/long-caption) board per engine at
   fixed seed would convert both WEB-FILLED contracts into MEASURED ones,
   and feeds VG-1's bake-off board for free.
3. **H3 preset-ladder A/B** — the curated T2VA/I2VA presets vs stripped
   prompts at 544p/768p (ties the preset curation to the X1/X2 grid-shape
   arms already scheduled in the GPU batch manifest).
4. **Anima mixed-mode vs tag-mode quality** (one board, blind judge) — the
   "mixes are best" claim is card+community; nobody has measured it.
5. **Music 3 sampler surface** — the packet's steps/cfg cell is UNK; one
   sweep at fixed caption closes it.
6. **Klein multi-ref count curve** (1→4 refs at fixed prompt) — no source
   documents quality vs ref count; cheap and directly load-bearing for the
   matrix's ● placement.

Non-GPU follow-ups worth a docs pass later: the Qwen official edit system
prompt's full verbatim text (rules captured via fooocus; original text not
in our tree — a library capture candidate); a Civitai prompt-harvest
correlation pass (ecosystem lane 7) once presets ship, to keep the curated
layer honest against field practice.

## 5. Honest limits of this build

- Presets marked `[SPEC-derived]` are contract-true but unmeasured — the
  GPU queue above is what converts them.
- Klein sigma/scheduler doctrine: nothing official exists [UNK]; the
  packet says so rather than inventing.
- Music 3 / LatentSync settings cells are thin (UNK/COMM-tier).
- The BFL guide drift (FLUX 3-era) means Klein quotes mix two harvests —
  both dated in the packet; a FLUX.2-era guide capture would be a library
  candidate if klein stays load-bearing.
