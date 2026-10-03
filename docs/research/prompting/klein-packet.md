# FLUX.2 Klein — research packet

> Packet date: 2026-10-03 · Flux task: vcks4mb · METHOD: corpus
> ([per-model-prompt-doctrines.md](../per-model-prompt-doctrines.md) §2,
> [h3-instruction-based-editing.md](../h3-instruction-based-editing.md) §6.1)
> + fresh BFL fetches 2026-10-03 (docs.bfl.ai unified-basics, editing-
> overview, editing-single-reference; black-forest-labs/FLUX.2-klein-9B card).
> NOTE: docs.bfl.ai's guides have been re-authored around **FLUX 3 Image**
> (BFL's newest generation); klein is the FLUX.2 open line. Generation-
> ambiguous guide facts are tagged accordingly. Tags: **[DOC]**, **[COMM]**,
> **[SPEC]**, **[UNK]**.
>
> **Weights (as run here):** `Flux2-Klein-9B-True-fp8.safetensors` — a
> community de-distilled full fine-tune of klein-9B (wikeeyang True-V1,
> byte-pinned), TE `qwen3-8b`, flux-family VAE [DOC — MANIFEST +
> per-model-prompt-doctrines §2]. **License:** FLUX Non-Commercial License
> inherited by the 9B line (4B is Apache-2.0); the True-V1 de-distill
> carries it forward. Registry records it as wikeeyang-True-V1-fp8, NOT
> "official klein".

## 1. What the family is

| Variant | Job | Regime |
|---|---|---|
| klein 4B base / distilled | fast local T2I + edit | base 50 steps; distilled 4 steps @ guidance 1.0 |
| klein 9B base / distilled | T2I + single/multi-reference editing, unified | distilled: 4 steps, guidance 1.0, sub-second class |
| **True-V1 (our weight)** | the de-distilled 9B — restores the base regime | **20–30 steps T2I / 10–25 steps edit-inpaint**, cfg 1.0, euler/simple (or any); optional turbo/distill LoRA at 8–12 steps [COMM — wikeeyang card] |

The 4-step defaults of the DISTILLED model produce detail collapse on the
de-distilled True weight — steps are the #1 operator trap with our file.

## 2. How the model reads

- **An 8B Qwen3 LLM text embedder** (9B; the 4B uses Qwen3-4B) — natural
  language, full sentences; keyword/booru piles are out-of-distribution
  [DOC — official card + Comfy packaging].
- BFL's own limitation line: **"Prompt following is heavily influenced by
  the prompting style"** [DOC — card] — the family is unusually sensitive to
  prompt SHAPE (hence this packet).
- Multi-reference binding is positional: references are addressed by index
  in connection order (`Image 1`, `Image 2`…) with "only"-style constraints
  scoping what each ref contributes [DOC — BFL editing guides]. The
  indexed-reference spine shared with H3 and Krea 2.
- Rendered text wants quotation marks — the guide's text-rendering rule
  (exact wording in quotes renders as visible text; unquoted wording reads
  as scene description) [DOC].

## 3. The prompting contract

**Generation slot template, verbatim [DOC — BFL unified guide]:**
```text
[SUBJECT], [LOCATION], [STYLE], [CAMERA SETTINGS], [LIGHTING], [COLORS], [EFFECT], [ADDITIONAL ELEMENTS]
```
"a useful starting structure, not a strict formula" — compress, expand, or
omit slots. Caption principles: medium/style first; state positions;
describe pose/appearance; small details and light effects; **"Only what's
visible"** — avoid "beautiful", "iconic", "masterpiece"; every phrase names
something pointable in the frame. Launch-caption order: "medium and style
first, then the subjects and where they sit, then light, color, and
background" [DOC].

- **Length**: no hard limit; short prompts work; write more ONLY for the
  details you want to control (positions, light, text). Quality comes from
  iteration — "adjust one important detail at a time" [DOC].
- **Language**: multilingual accepted; English most precise [DOC].
- **Text rendering**: quote the exact words; card admits rendered text "may
  be inaccurate or subject to distortion" [DOC].
- **Hex colors are first-class vocabulary** (#e01075, #c0392b…) [DOC].

**Edit doctrine, verbatim rules [DOC — BFL editing guides]:**
1. "Be specific about what changes and explicit about what should stay the
   same."
2. Name the target so only one thing matches — "by position, size, color,
   or what it's next to" ("the white car parked on the right", "the cherries
   in the right-most jar", "on the top polaroid photo").
3. Say what changes, into what — name the element as it is AND as it should
   be ("Change the jacket from red to blue").
4. Retention clauses name elements BY NAME, "not only 'the rest of the
   image'": "Keep the rest of the scene exactly unchanged: the dense upper
   bamboo leaves, the frozen stream, the stone lantern." Close with
   "Change nothing else."
5. Both imperative ("Remove all of the sprinkles while keeping the rest of
   the image unchanged") and declarative ("The butterfly is now made of
   shiny silver") are valid.
6. Material preservation phrasing: "Preserve the original fabric texture,
   transparency, patterns, highlights, and natural folds" / "Keep the exact
   patch shapes, fur texture, original shadows and grazing pose."
7. **Bad list (vague quality requests — the documented failure class):**
   "Make it better", "Improve the lighting", "Fix the image", "Change the
   shirt" (no target), "Add some text" (no words/placement), "Remove the
   car" (two cars). Each has a documented good rewrite [DOC].
8. **Multi-reference addressing**: "Use Image 2 as the location. Insert
   only the ice skates from Image 1…" — assign each image a role; "only"
   constrains what is taken. klein supports up to 4 reference images [DOC];
   the newest generation (FLUX 3 Image) supports up to 10 with `<id>` tokens
   and 0–1000-scale bbox rows appended to the prompt [DOC — current
   docs.bfl.ai; generation-flagged].

## 4. Sampler settings, resolutions, frames

| Variant | Steps | CFG/guidance | Sampler | Resolutions |
|---|---|---|---|---|
| Official distilled 9B | 4 | 1.0 | any (card example: default) | 1024² in card examples; no documented range |
| Official base | ~50 (fine-tune variant) | 1.0-class | — | — |
| **True-V1 (ours)** | **20–30 T2I / 10–25 edit-inpaint** | 1.0 | euler/simple or any | community practice up to ~2 MP class; 19.6 GB at 4-step on 5090 for distilled; True needs the full step budget |

No sigma-shift family doctrine is documented for klein [UNK — nothing
official]; use the tool defaults that ship with the workflow you run.

## 5. LoRA / strength interactions

- The de-distill restores trainability: LoRAs train on base/True; the
  distilled checkpoint is the inference accelerator (same TRAIN-on-base /
  RUN-on-distilled shape as Krea 2 Raw/Turbo) [DOC/COMM].
- Optional turbo/distill LoRA at 8–12 steps on True-V1 [COMM — card].
- Multi-LoRA stacking ceilings for klein: not documented anywhere we could
  find [UNK] — treat as untested.

## 6. Task recipes (presets)

- **Fast single-ref edit (iteration loop)**: distilled 4-step, guidance 1.0,
  instruction = target + change + retention triad. ~2 s-class edits;
  community-positive on facial fidelity; weaker on precise text [COMM].
- **Quality single-ref edit (our weight)**: True-V1, 10–25 steps, cfg 1.0,
  same prompt shape; one important detail changed per pass [DOC].
- **Multi-ref composition** (≤4 refs): role sentences per image + "only"
  constraints ("Image 1 is the subject; use only the jacket from Image 2").
  Community multi-ref winner among our stills engines on ref count [COMM].
- **Recolor**: hex + preservation list ("change the color of only one bird
  in the middle to #e01075 … keep the exact patch shapes").
- **Object removal**: "Remove all of the X while keeping the rest of the
  image unchanged" — but note Krea 2 measured BETTER on
  removal/reconstruction in the community A/B (hand-behind-fork case);
  route identity-critical removals accordingly [COMM A/B].
- **Style transfer**: "Turn Image 1 in the Style of Image 2" (two-ref) or
  "Turn the image into an oil painting with thick, textured brushstrokes."
- **Camera/zoom reframe**: "Zoom out to a wider view of the same outdoor
  scene, showing more of the grassy banks…" — same-scene widening is a
  documented edit class [DOC].
- **Text change**: "Change the text to Flux.2" (single-ref) — klein's text
  rendering is admitted-imperfect; Qwen-Image-2.1 is the text-fidelity
  lane.

## 7. Fundamentals — the triangle

- **Adherence**: prompt SHAPE (slot order, target+change+retention) is the
  lever — the card says so verbatim. Vague quality language is the
  documented failure. Position language beats hoping ("in the right-most
  jar").
- **Quality**: "only what's visible" specificity; hex codes for color
  fidelity; quoted text; one detail per iteration.
- **Speed**: the distilled tier (4-step) vs True (20–30) is a ~5–7× wall
  difference; multi-ref costs encode time per ref.
- Trade-off: klein is the FAST/multi-ref lane; it concedes removal/
  reconstruction and precise-text classes to Krea 2 / Qwen respectively
  [COMM A/B].

## 8. Community-verified tips

- The myaiforce per-task A/B: Krea 2 won removal/reconstruction/camera-
  angle; Klein won speed, multi-ref compositing; semantic-interaction edits
  split [COMM].
- Facial fidelity in multi-ref composites is klein's praised class;
  "weaker on precise text" [COMM].
- FLUX 3-era docs tip that also reads as klein practice: put your preferred
  aspect-ratio image FIRST in the images array when aspect is `auto` [DOC —
  generation-flagged].

## 9. Failure modes

| # | Failure | Fix |
|---|---|---|
| 1 | True-V1 run at distilled defaults (4 steps) → detail collapse | 20–30 steps on our weight; 4 steps only with a distilled checkpoint |
| 2 | Vague quality instructions | The bad-list rewrites (§3.7) |
| 3 | Ambiguous target (two of a kind) | Position/size/color/next-to disambiguation |
| 4 | Retention stated only as "the rest" | Name the elements to keep |
| 5 | Distorted rendered text | Quote exact words; accept the card's admitted limit; route text-critical to Qwen |
| 6 | Style-mismatched prompting (keyword piles) | Full-sentence slot prose |

## 10. License pointer

FLUX Non-Commercial License (9B line; 4B Apache-2.0); BFL AUP; the True-V1
de-distill inherits the non-commercial class — outputs/use per license
terms; commercial 9B use needs BFL terms. Our registry row records
wikeeyang-True-V1-fp8 provenance explicitly so nobody treats it as a BFL
release [DOC — registry].

## 11. Sources

[DOC] docs.bfl.ai/guides/prompting_unified_basics, /prompting_editing_overview,
/prompting_editing_single_reference (fetched 2026-10-03 — now FLUX 3-era
content; the FLUX.2-verbatim quotes were additionally held from the
2026-09-18 harvest in per-model-prompt-doctrines §7); HF card
black-forest-labs/FLUX.2-klein-9B (fetched 2026-10-03); wikeeyang/
Flux2-Klein-9B-True-V1 card [COMM]; ComfyUI blog klein post [DOC];
myaiforce A/B [COMM]. Internal: per-model-prompt-doctrines §2,
h3-instruction-based-editing §6.1, speed-quality-and-imagegen-paths §3.
