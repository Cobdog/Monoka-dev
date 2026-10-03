# Supporting cast (Meridian · YuE2 · Music 3 · Fizgig · FaceRefine · LatentSync) — research packet

> Packet date: 2026-10-03 · Flux task: vcks4mb · METHOD: corpus +
> fresh fetches 2026-10-03 (Viggle/Meridian card;
> docs.comfy.org Music 3 tutorial; SCAIL/LatentSync searches) over
> [viggle-assessment.md](../viggle-assessment.md), [yue2-3b-assessment.md](../yue2-3b-assessment.md),
> [ecosystem-2026-09.md](../ecosystem-2026-09.md),
> [fizgig-h3-still-assessment.md](../fizgig-h3-still-assessment.md).
> Tags: **[DOC]**, **[COMM]**, **[SPEC]**, **[UNK]**.

## A. Meridian — camera-path vocabulary is GEOMETRY, not prose

**What it is**: two LoRA adapters (teacher 2.5 GiB + turbo 2.5 GiB, loaded
together, never merged) on the unmodified H3 transformer; VGGT-Omega builds
depth+poses → colored 3-D points → render the chosen camera path with grey
holes → H3 fills/refines. Space and time are independent axes (orbit/zoom/
slide a held moment; retime then re-camera) [DOC — card, fetched 2026-10-03].

**The prompting contract (there is none, by design):**
- **No user text prompt at inference; no text encoder loaded.** Conditioning
  is a frozen precomputed embedding (`fixed_embed_{n}.pt`) "with timestamp
  markers and no pixels"; reference videos reach the model only as
  condition rows (`<Video 1>` = source, `<Video 2>` = geometric render, in
  that order) [DOC].
- **Camera language = CLI/geometry flags**: `--yaw 15 --sweep --ease`
  (orbit), `--freeze 24:49` (bullet-time hold), move in/out, slide
  sideways, move up/down, set viewing direction and FOV; the Studio
  prototype authors multi-keyframe paths with a browser 3-D preview
  (warp preview ~0.24 s for 73 frames — check framing BEFORE spending video
  passes) [DOC].
- Retiming = re-time the input first, then author the path over that
  timeline. Inputs must be continuous 24 fps shots (no rate normalization,
  no cut detection) [DOC].

**Settings** [DOC]: teacher `--steps 50 --flow-shift 12`; turbo `--steps
4 --flow-shift 3` (ComfyUI: euler/simple/cfg 1.0; steps one less — 49/3).
Output 24 fps, aspect-matched 768-class (1344×768 for 16:9); lengths 73/90/
107/124/141/158/175/243 frames. Reference impl is bf16 no-offload at 82–113
GiB — a 24 GB run is a port job onto our quant stack (watch-tier).

**Failure modes**: unseen surfaces are generated not recovered; severe
geometry errors propagate; large moves risk distortion/drift; separately
generated clips may not join smoothly [DOC].

**License**: weights MiniMax H3 Community (Model Derivative); code
Apache-2.0; **VGGT-Omega dependency is FAIR Noncommercial** — any
commercial posture is gated on replacing it [DOC].

**Prompting consequence for the app**: the camera lane's "vocabulary" is a
path/keyframe UI, and the prose layer only matters if/when a scene-restyle
edit rides on top (then it's the H3 edit contract). The Meridian METHOD
(geometry-render + cheap preview + generative refine) adopts now; weights
stay watch-tier.

## B. YuE2-3B — lyrics-to-song with an editable symbolic score

**What it is**: one 3.6B AR–NAR checkpoint that composes (ABC melody/chord
plan), renders (48 kHz stereo song), covers (re-skins a transcribed song),
revises (agent edits score/style/lyrics, re-renders) [DOC —
[yue2-3b-assessment.md](../yue2-3b-assessment.md)].

**Prompting contract** [DOC]:
- Inputs: genre/style prompt + lyrics with section tags. Modes:
  `cot="full"` (melody+chord plan), `cot="melody"` (melody-only,
  recommended for covers), `cot="off"` (direct); bring-your-own ABC score
  accepted.
- Section tags in lyrics (`[Verse]`, `[Chorus]`-class) are the structural
  control; seed reuse reproduces the exact plan for revision loops.
- The score is a white-box artifact — edit the ABC, re-render; agentic
  editing ships as a SKILL.md package.
- CFG on semantics only (1.0/1.01 defaults), none on the ABC.

**Settings**: 3.6-min song in 71 s on a 4090; peak 11.18 GiB unquantized
(24 GB host RAM); int8-convrot day-one; length context-bounded (demos
1:09–5:00; node max 900 s) [DOC].

**Recipes**: song with vocals (strong); covers (zero-shot class — SHS100K
mAP 0.647); instrumental lane NOT in the official surface (community LoRA;
untested [UNK]); hum-to-song via community LoRA.

**License**: CC-BY-NC-4.0 (the lineage break from YuE 1's Apache-2.0);
outputs' commercial terms per the license text — flagged class.

## C. MiniMax Music 3 — the three-section caption + structure tags

**What it is**: 8B global + 0.6B local LLM, Flow-VAE, 32 kHz stereo, up to
5 min, open weights, ComfyUI-native [DOC].

**The caption contract (three sections, in order)** [DOC — docs.comfy.org
tutorial, fetched 2026-10-03]:
1. **Global Metadata**: genre, BPM, key, scale, emotional progression,
   listening scenario, production profile.
2. **Vocal Details**: vocal gender, timbre, performance style, harmonies,
   vocal effects.
3. **Arrangement**: primary and secondary instruments, groove, bass,
   percussion, textures, spatial effects.

"The more specific, the closer the result."

**Lyrics rules** [DOC]: section tags `[Intro] [Verse] [Pre-Chorus] [Chorus]
[Post-Chorus] [Bridge] [Instrumental] [Solo] [Outro]`; "Tags are the
structural instructions; the lyric text conveys the mood"; "Keep tags as
the only structural instructions" — tags are executable, so never embed
structural directions in prose. The official caption-rewriter skill
(`npx skills add MiniMax-AI/MiniMax-Music3 --skill music-caption-rewriter`)
builds the structured caption from a brief description + tagged lyrics.

**Settings**: `caption`, `lyrics`, `max_duration` (template 60 s; ~300 s
max), seed (fix to reproduce, change for a new take), `tiled_decode` for
low VRAM (small seam risk) [DOC]. Sampler steps/cfg: not documented on the
tutorial page [UNK].

**Division of labor with YuE2**: YuE2 leads musicality/quality on songs
(their bench), Music 3 keeps lyric intelligibility (PER 6.27% vs 8.44%) and
the commercial-friendly license (free under $20M revenue); neither covers
ambience [DOC + SPEC].

## D. Fizgig-H3-Still — the T=1 stills recipe (a settings preset, not a prompt dialect)

The pack's contribution is machinery + recipe, not prompting: T=1 latent +
group-replicate video-VAE decode; **fl2va base + larryvrh v4-step600-EMA
turbo @ 0.38, 20 steps, `er_sde`/`simple`**; max-quality variant: turbo
strength 0, 50 steps (8 MP demonstrated; "best from 3 MP up; small images
come out noticeably weaker") [COMM — card/workflows, doc-verified in
addendum 2]. Prompting on its lanes is ordinary H3 stills prompting
(ownership contract; edit lane: `<Picture 1>` + instruction, best ~2.5 MP).
MIT pack; official-stack weights only.

## E. H3-FaceRefine — the post-pass that needs no prompt

Per-frame face repair: YOLO tracking, smoothed crop trajectory, size-scaled
re-denoise (full for small faces, ~0.35× for large), color-matched
composite, cut resets. **Gotcha that IS prompt-adjacent**: H3's sigma shift
12 means SDXL-style denoise values don't transfer (0.25 lands at σ 0.800
and REWRITES frames) [COMM — ecosystem lane 2]. No text prompt is involved;
the "recipe" is the denoise ladder. Maps to our FaceRefine task (krzunud)
with thaakeno's crop-based implementation as the shipped reference.

## F. LatentSync — post-process lipsync, no prompt

ByteDance's audio-conditioned latent-diffusion lipsync (end-to-end, no
intermediate motion representation); in our flows it is the redub/lipsync
lane AFTER assembly (Addendum 3's exception lane: deliberate voice
replacement = redub + LatentSync-class lipsync on the stitched output).
Inputs: video + audio (output limited to the shorter of the two — extend
the video for long audio); no text prompt; params = sync mode, steps, CFG,
precision (bf16 default) [COMM — wrapper docs/issues, search-verified
2026-10-03; exact ComfyUI operating points [UNK] until adopted].

## Quick table — who takes what

| Engine | Text prompt? | What the prompt controls | The real control surface |
|---|---|---|---|
| Meridian | No (frozen embed) | — | camera-path geometry flags/keyframes; retime |
| YuE2 | Yes | genre/style + lyrics + ABC score | cot mode; seed for plan-revision |
| Music 3 | Yes | three-section caption + tagged lyrics | caption specificity; max_duration; seed |
| Fizgig stills | Yes (H3 stills contract) | the image content/ownership contract | machinery choice + turbo @0.38 / 20 steps |
| FaceRefine | No | — | denoise ladder (shift-12-aware) |
| LatentSync | No | — | sync mode, steps, audio/video length |

## Sources

Viggle/Meridian HF card (fetched 2026-10-03); docs.comfy.org MiniMax Music
3 tutorial (fetched 2026-10-03); MiniMaxAI/MiniMax-Music3 HF card +
Comfy-Org repack [via ecosystem lane 5];
[yue2-3b-assessment.md](../yue2-3b-assessment.md) (HF + GitHub + ComfyUI
code reads, 2026-09-21); [fizgig-h3-still-assessment.md](../fizgig-h3-still-assessment.md)
+ addenda (code-reads 2026-09-25/26); Carasibana/ComfyUI-H3-FaceRefine
[COMM via ecosystem]; bytedance/LatentSync + ComfyUI-LatentSyncWrapper
[COMM, search-verified 2026-10-03].
