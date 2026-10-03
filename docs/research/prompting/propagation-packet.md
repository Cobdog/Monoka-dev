# Propagation engines (Viggle-Animate · SCAIL-2 · Wan-Animate-2) — research packet

> Packet date: 2026-10-03 · Flux task: vcks4mb · METHOD: corpus
> ([viggle-assessment.md](../viggle-assessment.md) incl. Addenda 1–6,
> [h3-v2v-reanchor.md](../h3-v2v-reanchor.md) R2-VG) + fresh card fetches
> 2026-10-03 (zai-org/SCAIL-2 README, Wan-AI/Wan2.2-Animate-2-14B card).
> **This packet CORRECTS a planning assumption**: the mission brief grouped
> all three as "zero-prompt engines" — only **Viggle-Animate** is truly
> text-free (frozen embedding). **SCAIL-2 wants LONG detailed video
> captions; Wan-Animate-2 requires an appearance-caption prompt** (motion
> excluded). Where prompting does NOT live (the propagation side), it lives
> in the REPAINT — the stills edit that composes the anchor frame (§5).
> Tags: **[DOC]**, **[COMM]**, **[SPEC]**, **[UNK]**.

## 1. What the lane is

Motion-preserving character recast/animation: a driving video supplies
motion/camera/timing; a reference supplies appearance/identity. This is the
fourth motion lane beside Fun Control (authored), the IK rig (parametric),
and prompt-level direction — it fills the *recast existing footage*
(including non-humans) cell [DOC — viggle-assessment §4.1].

| Engine | Inputs | Text prompt? | Backbone | License |
|---|---|---|---|---|
| **Viggle-Animate** | driving video + one repainted frame (of the clip) | **NONE — frozen 362×5120 embedding, no TE in the graph** [DOC — card + code-read] | 33.1B full finetune of H3-ref2va + r128 DMD2 LoRA (3 forwards) | minimax-h3-community class; derivatives granted (H3-family-improvement clause); territory excl. EU/UK/KR/US |
| **SCAIL-2** | reference image + its fg mask + driving-or-pose video + per-frame driving mask; optional extra ref/mask pairs (`--replace_flag` for replacement mode) | **YES — long, detailed video-caption prompts**; "Short prompts or an empty prompt can run, but detailed descriptions … usually produce better results" [DOC — README] | Wan-backbone (wan-scail2 branch) | Apache-2.0 (code; weights card-side) |
| **Wan-Animate-2 (14B)** | reference image + driving video | **YES — an appearance/background caption with motion EXCLUDED** ("人物外观描述，不描述动作行为" — describe appearance, do not describe actions); text also decouples output camera from the driving camera ("text-driven viewpoint control") [DOC — card] | redesigned end-to-end DiT, no intermediate motion extractors; distill at 10 steps no-CFG; Lite variant for streaming | Apache-2.0 |

## 2. How each model reads

### Viggle-Animate [DOC — Addendum 6]
- Packed token rows: text-FROZEN → keyframes → refs → audio → video; full
  self-attention; 3-axis RoPE. **"Nothing in the output comes from text you
  write"** — prompt injection is dead by construction. The frozen embed
  asks for silence → the `--audio` clean-row pin exists precisely because
  of it.
- Appearance authority = the anchor image ONLY; geometry authority = the
  driving video ("where paint and video disagree the video wins" — LEGO
  repaint reverted to human anatomy). Anchor has NO frame-index binding —
  pick the frame that shows the character clearest, front-on, unoccluded.
- No skeleton/segmenter/tracker anywhere — pose end-to-end from pixels.

### SCAIL-2 [DOC — README, fetched 2026-10-03]
- Binds the reference character to the moving subject through
  **colour-coded masks** (trained on a fixed colour correspondence):
  black = "background should NOT be visible here"; white = "background
  SHOULD be visible"; colour = character-region ↔ driving-motion
  correspondence. Masks are load-bearing even in animation mode — wrong
  masks collapse animation into replacement behavior.
- Multi-view refs (back/close-up/occluded, each masked) are supported but
  experimental ("not optimized for it" — quality may degrade); use
  full-white masks for clean background refs; keep colours consistent per
  character across all masks.

### Wan-Animate-2 [DOC — card, fetched 2026-10-03]
- Reference image = identity/appearance; driving video = motion; the text
  caption carries appearance + background so the two visual channels stay
  in their lanes. The official recipe generates the caption with an LLM
  reading the reference image (their example prompt is Qwen-class, Chinese,
  asking for appearance-only + background description).
- Camera decoupling: the caption's viewpoint language can override the
  driving video's camera perspective — the one place text moves the output.

## 3. The prompting contracts (where they exist)

- **Viggle-Animate**: no prompt contract. All operator intent goes into
  (a) the anchor image (§5), (b) the conditioning knobs (§4), (c) chunk
  orchestration. The style-LoRA stack on the finetune is the one text-free
  style lever [UNK — E-E gates it].
- **SCAIL-2**: a video caption — "describe the generated video itself. It
  should not be an instruction to the model." For replacement, describe the
  post-replacement scene including clothing and interacted objects.
  Long/detailed is the trained distribution; the predecessor repo shipped
  LLM prompt-generation snippets (Gemini reading ref + motion) [DOC]. This
  is an H3-`detailed_description`-shaped caption, not an edit instruction.
- **Wan-Animate-2**: appearance caption with a motion EXCLUSION rule —
  describing actions in the caption fights the driving video; background
  description included; viewpoint language only if camera decoupling is
  wanted [DOC].

## 4. Sampler/settings

| Engine | Steps | Guidance | Shift/scheduler | Canvas/frames |
|---|---|---|---|---|
| Viggle-Animate | 4 (= 3 DMD passes; more over-sharpens) | — (distilled) | sigma presets 4/6/8; euler/shift 3.0 per drbaph's tested recipe | ≤124 f default envelope (5+17×7); community dense-attention runs clean at 243/372 f (ghosting >124f is a quantized-kernel artifact); 0.4–0.98 MP tested |
| Viggle drbaph artifacts | pruned-int8 21.03 GB + r64 DMD 0.94 GB + int8 video VAE — the 24 GB class | | | |
| SCAIL-2 | 40 default (`--sample_steps`); lightx2v distill example: 8 @ guide 1.0, shift 1 | 5.0 default; distill 1.0 | shift 3.0 default; solver unipc (or dpm++) | 512p/704p end-to-end (pose-driven prefers 704p); dims %32 (e.g. 704×1280); training cached 81 f |
| Wan-Animate-2 base | 40 | 1.0 (no CFG) | euler | 720p on 8×A800 default; 480p on 2×A800; 24 fps; 640×800 in the diffusers example |
| Wan-Animate-2 distilled | **10** | 1.0 | euler | same |
| Viggle knobs (conditioning, [DOC]) | `visual_cond_noise_aug` 0.999 default (lower = less anchor AND driving authority — the adherence dial); `audio_cond_noise_aug`; `ref_image_size` match/max (max changes the take, several× slower); 9 img + 3 vid + 3 aud ref slots (trained with 2); per-token denoise masks = region-scoped replacement (m=1 character / m=0.15 background); `audio_scale`; attention routing sol ≤124f / dense >124f | | | |

## 5. The REPAINT layer — where prompting actually lives

The propagation engines' "prompting" is the stills edit upstream that
composes the anchor/reference (Addendum 4's Path A — the primary appearance
lever, since Viggle has no in-model appearance dial):

1. **Compose the canonical reference first**: identity + outfit from two
   sources via Krea 2 edit / Klein multi-ref / Qwen-Image-2.1 lanes (the
   committed Qwen-first wave); or the outfit-only masked edit on a clean
   frame. One composed canonical reference then feeds EVERY chunk
   (chunking doctrine: never chain chunk-to-chunk — every chunk re-anchors
   on the canonical reference). **What independence does and does not buy
   (2026-10-03 audit repair — the old "variance instead of chain drift,
   flat by construction" claim was too strong):** it eliminates recursive
   INPUT drift — no chunk inherits another chunk's output errors, so
   error-accumulation-by-chaining is gone. It does NOT by itself guarantee
   flat identity or error-free motion: each chunk is still an independent
   render with its own variance (identity-vs-reference flatness is the
   DESIGN EXPECTATION, unmeasured — per-chunk ArcFace checks stay in the
   loop), and chunk boundaries still need the blend/stagger machinery and
   per-seam inspection.
2. **The repaint prompt contract is the stills engine's** (see those
   packets): ownership contract on H3 stills, instruction prose on Qwen,
   slot prose on Klein. SCAIL-2's multi-view refs make outfit enforceable
   from several angles; Viggle's single anchor makes pre-editing its ONLY
   appearance lever.
3. **Whole-scene stylized repaint** = the top experiment (E-A): anchor
   authority is full-frame, so a fully repainted anchor should propagate
   the entire look — "Viggle as motion-locked video restyler" [SPEC —
   author-documented stylized generalizations support it].
4. **Post-propagation spot-fix** (Path B): the propagation output is a
   valid reference for H3 instruction editing with preservation clauses
   (motion/camera/background preserved; outfit becomes X); surgical
   variant = per-token denoise masks for region-scoped re-render.

## 6. Task recipes

- **Character replacement over footage (Viggle)**: pick clearest front-on
  frame → repaint it with the target identity (§5) → driving video +
  repainted frame in, nothing else; pin source audio clean (`--audio`
  semantics) or run silent and mux the original soundtrack (chunking
  doctrine: audio NEVER generated, original muxed back).
- **Recast with outfit control (any engine)**: compose the anchor with the
  outfit BEFORE propagation (Path A); never attempt wardrobe edits in the
  propagation pass.
- **Non-human recast**: Viggle "bounded by what you can paint" [DOC];
  SCAIL-2 pose quality degrades ~3× on quadrupeds per our Fun-Control
  E-FC1 analogue? No — that was H3's controlnet; for SCAIL-2 non-human
  behavior: [UNK]. Use sprite/repaint anchors where skeleton semantics are
  doubtful.
- **Multi-view outfit lock (SCAIL-2)**: extra refs = back view + close-up +
  occluded state, each with consistent per-character mask colours;
  full-white masks for background-only refs.
- **Camera-decoupled recast (Wan-Animate-2)**: put the desired viewpoint in
  the appearance caption ("filmed from a low third-person angle…")
  [DOC — viewpoint control].
- **Long-form**: cut-aligned windows ≤124 f (Viggle); engine-native
  extension contracts where they exist — **attribution corrected
  2026-10-03: the five-frame chained-anchor EVIDENCE is Saganaki's VIGGLE
  pack (goofyrodent mirror, `five_frame_anchor`) [COMM — Addendum 6], NOT
  a SCAIL mechanism — SCAIL-2's README documents no chaining (verified
  2026-10-03); its own continuation surface, per the methodology audit, is
  the ComfyUI node schema's `previous_frames`/`previous_frame_count`
  [DOC — audit finding, node-schema-level], a separate mechanism needing
  its own arm.** Chained-anchors (Viggle pack) vs our independent-hops
  remains the live measured question (VIG-SEAM); one canonical ref for all
  chunks; blend 17–22 f overlaps; stagger interleave passes for high-fps
  sources.

## 7. Fundamentals — the triangle

- **Adherence** (to motion): the driving video IS the motion contract on
  all three; text must never fight it (Wan's exclusion rule is the explicit
  case). SCAIL-2 adds the mask correspondence as a second adherence
  channel.
- **Quality**: anchor/reference quality is load-bearing (Viggle: appearance
  authority is the anchor alone; "bounded by what you can paint"); more
  passes over-sharpen Viggle (4 steps = the operating point); dense
  attention above 124 f on Viggle.
- **Speed**: Viggle 3 forwards (26 s/clip on B200; minutes-class on our
  tier with offload); Wan-Animate-2 distilled 10 steps; SCAIL-2 40 (or the
  8-step distill arm).
- Trade-offs: Viggle = strongest identity-through-propagation, weakest
  authoring (no masks/strength, complex scenes/multi-char/re-entry are the
  stated weak spots); SCAIL-2 = mask-authorable, multi-view, experimental
  multi-ref; Wan-Animate-2 = caption-steerable camera, real-time Lite
  variant, newest.

## 8. Failure modes

| # | Failure | Fix |
|---|---|---|
| 1 | Assuming "no prompt needed" on SCAIL-2 / Wan-Animate-2 | This packet's correction — SCAIL-2 wants long captions; Wan wants appearance captions |
| 2 | Motion described in a Wan-Animate-2 caption | Appearance-only; viewpoint only for camera decoupling |
| 3 | SCAIL-2 animation collapses into replacement | Mask correctness (colour correspondence; §2) |
| 4 | Viggle output silence/lip-sync weirdness | Pin driving audio clean t=1.0 (46 dB round-trip) or mux the original track |
| 5 | Wardrobe drift across chunks | One canonical composed reference for every chunk; never chain outputs |
| 6 | Viggle adapter-strength expectations | The dial interpolates toward the un-distilled FINETUNE, not stock H3 (Addendum 6 correction); the DMD LoRA only loads on the finetune |
| 7 | Chained chunk drift | Independent hops from the canonical ref + blend seams (Addendum 3) |
| 8 | Cross-pass shimmer at N-pass interleave | Stagger boundaries per pass + blend within each pass's frame domain BEFORE interleaving (Addendum 5) |

## 9. License pointers

Viggle-Animate: minimax-h3-community class (weights) + Apache-2.0 (code);
Model Derivatives expressly granted — we own ours; derivatives may only
improve H3-family models; attribution + AUP; territory excl. EU/UK/KR/US
(Canada clear). SCAIL-2: Apache-2.0. Wan-Animate-2: Apache-2.0. Registry
rows land with the respective adoption commits per the lockstep rule.

## 10. Sources

[viggle-assessment.md](../viggle-assessment.md) (Addenda 1–6; card +
sample.py code-read 2026-09-25); zai-org/SCAIL-2 README (fetched 2026-10-03);
Wan-AI/Wan2.2-Animate-2-14B card (fetched 2026-10-03); drbaph/
Viggle-Animate-ComfyUI README; [h3-v2v-reanchor.md](../h3-v2v-reanchor.md)
(R2-VG addendum); [gpu-batch-manifest.md](../gpu-batch-manifest.md)
Blocks 2–4 (the scheduled bake-offs).
