# The Monoka prompting guide — presets, prefills, blocks, and the fundamentals

> Guide date: 2026-10-03 · Flux task: vcks4mb · Audience: the maintainer AND
> the app (these presets/prefills/blocks are product content — they become
> the workbench's prefill libraries and the composer's block grammar).
> Method: corpus-first over the packets in this directory + the research
> corpus; every preset carries its evidence tag ([DOC]/[COMM]/[SPEC-
> derived]/[UNK]) — **a community guess is never presented as official**.
> Packet index at §8. This guide makes family CONTRACT differences
> explicit; it never blurs them.

---

## 0. Read this first — the contracts differ by design

Four prompt dialects coexist in this stack, and using the wrong one is the
most common cross-family mistake:

| Family | Dialect | The prompt IS… | Negative prompt |
|---|---|---|---|
| **MiniMax H3** | structured sections | a sectioned AV document (`integrated_multimodal_description` / soundscape / music; six sections in R2V) | **none** — bans backfire; positive phrasing or retention markers |
| **Qwen-Image-2.1** | instruction prose + tags | an edit instruction; `<imageN>` tags when N≥2; scene description for outpaint | exists but INERT at cfg 1 |
| **Krea 2** | captioner prose (T2I) / bare instruction (Identity Edit) / scene-style (AnyPaint) / region-content (ostris inpaint) | what the captioner template asks: color/shape/size/texture/quantity/text/spatial | stage-1 only (flatten syntax) |
| **Klein** | BFL slot prose | subject→location→style→camera→lighting→color→effect sentences; edits = target+change+retention | not a mechanism; guide says control via prompt |
| **Anima** | tag piles / NL / mixes | danbooru-order tags with quality prefix | **first-class** — the shipped default negative |
| **Propagation engines** | (mostly none) | Viggle: frozen embed (NO text). SCAIL-2: long video caption. Wan-Animate-2: appearance caption, motion excluded | — |
| **Audio (YuE2/Music 3)** | structured caption | Music 3: three-section caption + `[Section]` tags; YuE2: genre/style + tagged lyrics + ABC | — |

The one near-universal: **indexed references** (`<Picture N>` / `Image N` /
`Picture {i}:` / `<imageN>`) — three families independently converged on
addressing references by connection order [DOC ×3].

---

## 1. General principles (what transfers, and the honesty about what doesn't)

**Universals — hold across every family we hold evidence for:**

1. **Specificity gradient: global → subject → detail.** Style/medium and
   scene first, subject second, fine detail last. H3 puts style at the head
   of `[Shot 1]` [DOC]; BFL: "medium and style first, then the subjects and
   where they sit, then light, color, and background" [DOC]; Anima's tag
   order is literally quality→count→character→series→artist→general [DOC].
   Krea 2's captioner template enumerates object-level properties without
   prescribing order, but subject-first prose is the community norm [COMM].
2. **Only what's visible / only what changes.** Vague quality words
   ("beautiful", "masterpiece", "cinematic" as a filler) are documented
   anti-patterns on two families (BFL "only what's visible" [DOC]; H3
   skill's "favor concrete … over vague terms like cinematic" [DOC]) and
   inert-to-harmful elsewhere. Quality lives in structure and dials, not
   adjectives.
3. **Contradictions render as unions, not compromises.** Documented for H3
   (both people appear [COMM — Motion Context]); the same failure family
   shows up as Qwen's copy-shaped reference priority (an extra exemplar ref
   overrides the skeleton [DOC-m]) and H3's same-subject ref merge. One
   concept per channel, everywhere.
4. **Retention is named, never implied.** H3 keep-lists + retention markers
   [DOC/COMM]; BFL "name the elements to keep, not only 'the rest of the
   image'" [DOC]; Krea 2 is the exception that proves the rule — its edit
   LoRA's dials own preservation, so prose keep-lists are off-contract
   there [DOC + measured-pending].
5. **Positive phrasing for absence.** Strongest on H3 (naming a thing
   teaches the thing — the negative-branch docs page [DOC]) and Qwen (any
   transparency vocabulary, even negated, triggers transparency [DOC-m]).
   Where a real negative channel exists (Anima, Krea stage-1), suppression
   vocabulary belongs THERE, not in the positive prompt.
6. **Reference quality is load-bearing.** H3: "feed it the highest-quality
   reference material" + grade refs toward what the model renders [DOC/COMM];
   propagation engines: the anchor IS the appearance authority [DOC].
7. **Resolution interacts with adherence — not always the way you think.**
   H3: adherence COLLAPSES above ~576p (author low, re-render high) [COMM,
   multi-reporter]. Qwen: turbo distills are scoped to ~1024² (grid above)
   [DOC-m]. Anima: 512²–1536² is the trained band [DOC]. Klein/Krea: no
   documented adherence cliff — but Krea's working sizes (≤2 MP) are
   compute ceilings. **Do not transfer the H3 low-res-authoring rule to
   families that lack the evidence.**

**Where the universals STOP (the don't-transfer list):**
- Tag piles: correct ONLY on Anima. Keyword piles are out-of-distribution
  for every LLM-encoder family (H3/Krea/Klein/Qwen) [DOC].
- Long prompts: H3 prompts run to thousands of chars (up to 7k on the API
  [DOC]); Anima NL caps at ~300 words; Krea at ~1k tokens; Klein has no
  limit but "write more only for what you control" [DOC].
- Keep-lists: load-bearing on H3/Klein/Qwen-in-prose; off-contract on
  Krea-Identity-Edit (dials own it).
- Negative prompts: real on Anima/Krea-stage-1/Qwen-(cfg>1); absent/inert
  on H3/Krea-turbo/Qwen-at-cfg-1.

**The adherence/quality/speed triangle (cross-family statement).** Every
family has the same three vertices and the same law: you rarely get all
three. H3's sharpest documented trade: adherence-lean = ≤576p + full
structure + base 20-step; quality-lean = 768p + hybrid + refine stage;
speed-lean = turbo (costs motion + audio quality, officially). Krea 2:
identity vs edit-strength is a DIAL trade; pixel-exactness costs the
instruct lane. Qwen: the license + turbo-scope trade. Klein: distilled
speed vs the de-distilled quality tier (our True weight NEEDS its 20–30
steps). Anima: tags for control, NL for flow, CFG 4–5 vs turbo CFG 1.
Pick the lean per task — §7's decision framework.

---

## 2. Task × family matrix

Legend: ● = the recommended lane · ○ = works, second choice · △ = possible
but documented-weak · — = not that family's job.

| Task | H3 | Qwen-2.1 | Krea 2 | Klein | Anima | Propag. | Support |
|---|---|---|---|---|---|---|---|
| Instruction edit (stills) | ○ (packet/T=1) | ● | ● (Identity Edit) | ● | — | — | — |
| Instruction edit (video) | ● (R2V edit) | — | — | — | — | △ (spot-fix only) | — |
| Object removal (stills) | △ | ○ (mask) | ● (RAW recipe) | ○ | — | — | — |
| Object removal (video) | ● (instruction or Fun-Control mask) | — | — | — | — | — | — |
| Object insertion/composite | ○ | ● (multi-ref) | ○ (2-ref) | ● (multi-ref) | — | — | — |
| Quality refine/enhance (stills) | ○ (T=1 + refine stage) | ○ (turbo finish) | ● (AnyPaint scene-style) | ○ (fast tier) | — | — | FaceRefine (faces) |
| Quality refresh (video) | ● (V2V re-render R1/R2) | — | — | — | — | ○ (R2-VG) | — |
| Camera retarget / re-camera | ● (prompt + AddGuide; Meridian method) | — | — | — | — | — | Meridian (geometry) |
| Inpainting (stills) | ○ (masked composite) | ● (mask protocol) | ● (AnyPaint / ostris) | ○ | — | — | — |
| Inpainting (video) | ● (Fun Control / denoise_mask) | — | — | — | — | — | — |
| Outpainting / expansion | ○ (stills trick) | ● (scene-description) | ● (AnyPaint padding / trained outpaint) | ○ | — | — | — |
| Identity / character consistency | ● (R2V subject_definitions; RefMods) | ○ (refs + roles) | ○ (on-recipe instruct) | ○ (multi-ref) | ○ (character LoRA + trigger) | ● (recast) | — |
| Multi-subject composition | ● (≤9 refs, role-split) | ● (≤10 refs, tags) | △ (2 refs) | ● (≤4 refs) | ○ (count tags) | △ (multi-char weak) | — |
| Dialogue / speech | ● (S-IDs + `<d>`) | — | — | — | — | — | LatentSync (redub lipsync) |
| Music / song | — | — | — | — | — | — | YuE2 / Music 3 |
| Style / medium transfer | ● (style word / style ref) | ○ (style ref role) | ○ (style-reference LoRA) | ● (Image2 style) | ● (@artist) | ○ (full-frame repaint [SPEC]) | — |
| Camera movement direction | ● (triplet) | — | — | — | — | — | Meridian |
| Anime/illustration stills | ○ | △ | △ | △ | ● | — | — |
| Text-heavy design | ○ (accurate rendering claimed) | ● (signature) | △ | △ (admitted distortion) | △ (single words) | — | — |
| Transparent/RGBA assets | — | ● (native) | — | — | — | — | — |

---

## 3. PRESET CURATION — the curated prompt per common task per family

Ready to prefill. `{slots}` are user-facing. Each preset names its settings
regime (full settings in the family packet).

### 3.1 H3 — cinematic clip (T2VA)
Settings: base, `res_multistep`+`simple`, 20–25 steps, shifts 12/3, ≤576p
authoring, 124 f [COMM/DOC mix — h3-packet §4].
```text
integrated_multimodal_description: [Shot 1] {style: Cinematic|live-action|2D-animated|3D CG|claymation|watercolor|vintage film}, {shot size: a medium-wide shot|a close-up|an extreme close-up|a wide establishing shot} frames {subject with 2-3 identifying details} {action onset} in {location with 2-3 anchors}. The camera {motion type}{ optional: with small|large amplitude}{ optional: at slow|fast speed} {target of the move}. {development beat}. {optional dialogue: The {identity phrase} ({S1}) says: <d>[{Language}] {verbatim line}</d>}

overall_soundscape: {ambience covering the whole clip}. {one or two physical-action sounds}.
non_diegetic_music: {instrumentation} at {tempo}, {dynamic arc}. (or: N/A)
```
[DOC — official base-guide structure; assembly [SPEC-derived]]

### 3.2 H3 — start frame to video (I2VA)
Same settings; the alignment line first:
```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] {style}, the {subject} shown in <Picture 1> remains {where they are}, preserving {appearance, clothing, {key objects}, and the spatial layout of the scene}. The camera {triplet}. {new action developing from the anchor}. {result or reaction}.
overall_soundscape: …
non_diegetic_music: …
```
[DOC — base guide Case 2 shape]

### 3.3 H3 — first+last motion bridge (FL2VA)
```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the {duration:.2f}-second mark of the target video.

integrated_multimodal_description: [Shot 1] {style}, {subject} begins in the position and framing established by Picture 1, {starting state}. The camera {triplet} as {observable intermediate changes, in order}. {differences narrow} until {subject} settles into the {pose, spacing, and composition} established by Picture 2.
overall_soundscape: {physical sounds of the motion path}.
non_diegetic_music: {or N/A}
```
[DOC — Case 3 shape; single shot preferred]

### 3.4 H3 — multi-reference composition (R2V, six sections)
Settings: hybrid b25-49 [MEASURED], `ref_image_size: max` for identity, 20
steps, refs wired in citation order.
```text
subject_definitions:
<Subject 1> is {the subject} in <Picture 1>, with {defining appearance details}.
<Subject 2> is {the second subject / outfit / environment} in <Picture 2>, with {details}.

summary:
[reference generation] The target video shows {one-paragraph summary of the shot and what each reference provides}.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - {what is retained}.
<Subject 2> (appears in [Shot 1]): attribute_transfer - {what transfers}.

detailed_description:
{1-2 style sentences}.
[Shot 1] {composition}. <Subject 1> {position + action}. <Subject 2> {position + action}. The camera {triplet}. {beat development}.

overall_soundscape: …
non_diegetic_music: …
```
[DOC — ref-guide structure; the strongest single stability lever is
`<Subject N>` description strength [COMM]]

### 3.5 H3 — video instruction edit (replace/restyle/relight/wardrobe)
```text
subject_definitions:
<Video 1> is the source video for the target video edit.
{optional: <Subject 1> is the {replacement identity} in <Picture 1>, with {details}.}

summary:
[video editing{ + audio reuse if the soundtrack stays}] The target video is an edited version of <Video 1>. {one-line description of the edit}.

retention_analysis:
<Video 1> (motion, camera, timing, and everything not named below): fully_preserved.
{edited element}: attribute_transfer - {from what to what}.

detailed_description:
{style sentences}. The edit: {THE CHANGE, named concretely}. Keep: {keep-list — camera path, motion, timing, other subjects, background, lighting on unedited regions}. Everything else stays exactly as in <Video 1>.
overall_soundscape: {if audio reuse: the original soundtrack continues unchanged}. {else: …}
non_diegetic_music: …
```
[DOC — Runware edit contract + ref-guide; Change/Keep framing COMM DomoAI]
Settings: width/height = source aspect; one change per call; shorter
sources preserve better.

### 3.6 H3 — object removal (video, deterministic lane)
Fun Control inpaint: mask (1=regenerate) + source_video; 40 steps,
guidance 1.0; prompt = the normal scene prompt with the object ABSENT and
the fill described: "The plaza is empty where {object} stood, the pavement
continuing uninterrupted." [DOC mechanics; prompt shape SPEC-derived from
fal's "describe what fills the space"]

### 3.7 H3 — camera movement direction
Camera line first in the shot, exactly one named behavior:
```text
The camera {pushes in|pulls out|pans left|pans right|trucks left|trucks right|tilts up|tilts down|pedestals up|pedestals down|arcs around the subject|tracks the subject|holds a static shot}{ with large amplitude}{ at fast speed}, {what the move reveals or follows}.
```
[DOC vocabulary; placement/ordering findings COMM]
For a locked shot: `The camera holds a locked-off tripod shot as {action}.`
— strip every word implying reveals/handheld/distance change [COMM].

### 3.8 H3 — dialogue scene
```text
{The {age/gender/voice-quality} {noun} (S1)} {action}, says: <d>[English] {verbatim line}</d>
{The {identity} (S2)} replies, <d>[English] {verbatim line}</d>
```
Rules: identity outside `<d>`; verbatim words inside; voiceover formula +
"while {pronoun} lips remain completely closed."; `<scenetrans>` at both
sides of a cut-spanning line. [DOC — base guide §4.4]

### 3.9 H3 — deliberate silence (the anti-gibberish preset)
```text
overall_soundscape: {ambience scripted for every second: wind, room tone, footsteps…}. {no human voice events}.
non_diegetic_music: N/A
```
+ optional belt-and-braces block: "No dialogue, no narration, no singing,
no speech." A bare "no dialogue" leaves the audio budget unspent — the
actual failure mode. [COMM multi-source; the fields are DOC]

### 3.10 Qwen-Image-2.1 — instruction edit (single ref, no tags)
Settings: 25–40 steps, cfg 1, reference-scale 1024, explicit frame dims.
```text
{Instruction naming target + change + retention}: Change the {target, disambiguated by position/color/what-it's-next-to} to {new state}; keep {named elements} unchanged.
```
[DOC/DOC-m — official instruction style + the measured no-mask-words /
no-transparency-vocabulary rules]

### 3.11 Qwen-Image-2.1 — multi-ref composition (tags mandatory)
```text
<image1> is the canvas: {scene description}. <image2> provides only {the hat}. <image3> provides {the character on the left} wearing {garment described in words}. {Additional role sentences per image.}
```
[DOC — official tag protocol; roles per system prompt]

### 3.12 Qwen-Image-2.1 — outpaint (scene description, NOT the operation)
```text
{Describe the FINISHED picture as if it had always been this wide: full scene, both the original content and the extension, in prose.}
```
("Continue the scene naturally" measurably produces sticker cut-outs.)
Prefill new area with border-replicate; canvas rounded up to /32. [DOC-m]

### 3.13 Qwen-Image-2.1 — RGBA / subject extraction
```text
This is an RGBA image with transparency. {description}. The image has alpha channel and the background is transparent.
```
[DOC — official formula verbatim]

### 3.14 Krea 2 — identity edit (instruct lane)
Settings: Turbo 8 / CFG 1 / grounding_px 768 / ref_boost 1.0 (→4 for
likeness).
```text
{Bare instruction}: Change the outfit to {description}. / Restage the subject in {setting}.
```
No keep-list prose — dials own preservation. Removal preset flips the lane:
RAW / CFG 3.0 / ~20 steps: `Remove the {object}.` [DOC]

### 3.15 Krea 2 — masked refine (AnyPaint, scene-style contract)
Settings: Turbo 8 / guidance 0 / LoRA 1.0 / white=generate.
```text
{Whole-scene style description of the intended result}: A crisp photograph of {the full scene}, {lighting}, {materials/texture words}, {mood}. 
```
NOT "fix this area" — the scene-style contract is the measured templating.
[MEASURED E-K1]

### 3.16 Krea 2 — masked content insertion (ostris trio)
```text
{What should appear in the masked region}: {content}, {style}, {colors}.
```
Region-scoped — the deliberate opposite of AnyPaint's scene contract.
[DOC — card]

### 3.17 Klein — single-reference edit
Settings: distilled 4-step (fast) / True-V1 10–25 steps (quality), cfg 1.
```text
{Imperative or declarative change}, {retention clause naming elements}: Replace the {target by position} with {new thing with 2-3 material details}. Keep {named elements — light, pose, background objects} exactly unchanged.
```
[DOC — BFL single-reference guide]

### 3.18 Klein — multi-ref composition (≤4 refs)
```text
Use Image 1 as {role: the subject}. Insert only {the element} from Image 2. Use Image 3 as {the location/lighting}. {Scene prose continuing the composite.}
```
[DOC — BFL multi-ref addressing]

### 3.19 Klein — recolor with exact color
```text
Change the color of only {the target, disambiguated} to {#hex}. Preserve the original {fabric texture / fur texture / shadows}, {pose}, and the rest of the scene.
```
[DOC — hex examples verbatim from the guide]

### 3.20 Anima — character portrait (tag mode)
Settings: 30–50 steps, CFG 4–5, er_sde, ≤1536².
```text
masterpiece, best quality, score_7, safe, {1girl|1boy|…}, {character}, {series}, @{artist}, {hair}, {eyes}, {outfit}, {pose}, {expression}, {background}, {lighting}, {composition tags: upper body, looking at viewer, …}
```
Negative (prefilled): `worst quality, low quality, score_1, score_2, score_3, artist name, blurry, jpeg artifacts, chromatic aberration`
[DOC — card verbatim]

### 3.21 Anima — mixed mode
```text
{1-3 sentences: subject, action, setting}. {tag tail: count, wardrobe, artist, quality}
```
[DOC hybrid stance; composition SPEC-derived]

### 3.22 Propagation — character recast (Viggle)
No prompt. The preset is the ANCHOR pipeline: repaint the clearest front-on
frame with the target identity via §3.10/3.17/3.14 → driving video +
repainted frame → pin audio or run silent + mux original. [DOC — viggle
addenda]

### 3.23 Propagation — SCAIL-2 caption / Wan-Animate-2 caption
SCAIL-2 (long caption): `A video of {character appearance in detail},
{clothing}, {interacting objects}, in {environment}, {lighting}.` —
describe the OUTPUT video, never an instruction [DOC].
Wan-Animate-2 (appearance only): `{Character appearance description,
motion excluded}. {Background description}.` [DOC]

### 3.24 Audio — Music 3 caption / YuE2
Music 3:
```text
Genre: {genres}; BPM {n}; key {key} {scale}; emotional progression: {arc}; scenario: {listening context}; production: {profile}.
Vocals: {gender}, {timbre}, {performance style}, {harmonies}.
Arrangement: {lead instrument}, {secondary}, {groove}, {bass}, {percussion}, {textures}, {space}.
```
Lyrics with `[Verse]`/`[Chorus]` tags — tags are the ONLY structural
instructions. [DOC]
YuE2: genre/style prompt + tagged lyrics; `cot=melody` for covers; edit the
ABC score for revision. [DOC]

---

## 4. PREFILL TEMPLATES — editing flows with slot markers

The workbench's edit surfaces prefill these; `{}` = user slot, `⟨optional⟩`
= include when applicable.

### 4.1 Still-image edit prefill (family-agnostic scaffold, dialect-swapped)
```text
{TARGET: the one thing that changes, disambiguated by position/size/color/what-it's-next-to}
{CHANGE: from-state → to-state with 2-3 material/color details ⟨exact #hex if color-critical⟩}
{RETAIN: named elements — subject identity, pose, lighting, background objects, fabric/texture}
⟨{REGION: in the {left/right/top/bottom} {area}, on the {named surface}}⟩
{CLOSE: Change nothing else.}
```
Dialect swap at compose time: H3 stills → wrap in the ownership-contract
form ("Keep the identity, face, hair, clothing, camera, and environment
from `<Picture 1>`; {change}; Change nothing else." [DOC×3 pack form]);
Qwen → prose instruction (no tags at N=1, no mask words, no transparency
vocabulary); Klein → the §3.17 form; Krea instruct → STRIP the retain
clause (dials own it).

### 4.2 Video edit prefill (H3 six-section, edit flavored)
§3.5 with the invariant slots: `{SOURCE_ASPECT}` in the node, `keep-list`
built from the timeline's durable layers (the R3 prompt-timeline contract:
durable layers verbatim + beat layer), audio mode chosen explicitly
(reuse / regenerate / pin).

### 4.3 Character-consistency prefill (R2V identity payload)
```text
subject_definitions:
<Subject 1> is {CHARACTER_NAME} in <Picture 1>, with {stable identity descriptors — the same words every shot}.
```
+ the verbatim-repetition rule: camera/lighting/character descriptions
repeat WORD FOR WORD in every chained shot [COMM — chain discipline].

### 4.4 Outpaint prefill (Qwen)
```text
A {wide shot|full scene} of {the finished scene described whole: original content + extension, continuous lighting and perspective}.
```
[DOC-m measured]

### 4.5 Repaint-anchor prefill (propagation Path A)
Compose with §4.1 on the chosen frame; the output image + its provenance
manifest becomes the canonical reference for every chunk.

---

## 5. MIX-AND-MATCH BLOCK GRAMMAR

Composable blocks for fast iteration. Rules stated per block: what it
composes with, what it conflicts with, and its dialect constraints.

### The blocks

| Block | Content | Families | Notes |
|---|---|---|---|
| **B-SUBJECT** | `{count tag or subject sentence} + 2-4 identifying details + position` | all | FIRST after style everywhere. Anima: `1girl`-class count tag mandatory |
| **B-STYLE** | style word / medium / @artist / style-ref role | all | H3: opens `[Shot 1]`; BFL slot 3; Anima: `@artist` + quality prefix; Krea: prose |
| **B-CAMERA** | the H3 triplet / BFL camera-settings slot / Meridian geometry | H3, Klein; others weak | ONE named behavior per shot (H3); lens-name words "do almost nothing" on H3 [COMM] |
| **B-LIGHT** | light source + direction + quality (color words / L* intent) | all | composes with B-STYLE and B-MOOD; in RELIGHT edits it IS the change |
| **B-ACTION** | subject verb chain in temporal order; micro-actions | all (motion families) | H3: motion bias wants this named; Anima: pose tags instead |
| **B-RETAIN** | named keep-list + "Change nothing else" | H3, Klein, Qwen-prose | CONFLICTS: Krea-instruct (dial-owned); Anima (no edit lane) |
| **B-AUDIO-AMBIENCE** | 1-4 sentences covering every second | H3 only | mandatory unless B-AUDIO-SILENCE |
| **B-AUDIO-SILENCE** | `non_diegetic_music: N/A` + scripted ambience + no-dialogue block | H3 only | composes with B-AUDIO-AMBIENCE (ambience stays); conflicts with B-DIALOGUE |
| **B-DIALOGUE** | speaker ID + `<d>[Lang] verbatim</d>` lines | H3 only | speaker IDs stable across shots; voiceover needs the closed-lips clause |
| **B-TEXT-ONSCREEN** | quoted verbatim strings | H3, Qwen, Klein (capability order) | CONFLICT: H3 anti-burn-in — never quote what you don't want rendered |
| **B-REFROLE** | per-reference role sentence (indexed) | H3, Qwen, Klein, Krea | one concept per reference; compose with B-RETAIN only on different refs |
| **B-NEGATIVE** | suppression vocabulary | Anima (real), Krea stage-1, Qwen cfg>1 (emergency) | NEVER on H3; never as positive-prompt negation on Qwen transparency |

### Composition rules (which compose, which conflict)

1. **B-STYLE + B-CAMERA + B-LIGHT + B-SUBJECT** compose freely in every
   family (that IS the BFL slot order and the H3 shot opening).
2. **B-RETAIN conflicts with dials**: on Krea instruct, delete B-RETAIN and
   move intent into grounding_px/ref_boost. On Qwen masked edits, B-RETAIN
   reduces to what the mask already guarantees — extra retention words
   about the masked region are fine, words ABOUT the mask are not.
3. **B-DIALOGUE excludes B-AUDIO-SILENCE** (a silence block with dialogue
   is a contradiction → union risk).
4. **B-TEXT-ONSCREEN anti-composes with burn-in avoidance**: quoting text
   teaches the text. On H3, quote ONLY text that should render.
5. **B-REFROLE is exclusive per reference**: two roles on one reference
   merge (the union/copy-shaped hazard family). Split refs or move the
   second concept into words.
6. **B-NEGATIVE belongs to exactly three places** (Anima positive-negative
   pair; Krea stage-1 flattened; Qwen cfg>1 emergency). Elsewhere use
   positive phrasing of the absence.
7. **Per-shot budget on H3**: one B-CAMERA and one cut verb per `[Shot N]`;
  camera motion instead of a cut when only framing changes [DOC].

### Worked compositions

- *Cinematic dialogue shot*: B-STYLE + B-SUBJECT + B-CAMERA + B-ACTION +
  B-DIALOGUE + B-AUDIO-AMBIENCE (music N/A or B-MOOD-music line).
- *Identity-locked wardrobe edit (video)*: B-REFROLE ×2 + B-RETAIN +
  B-STYLE-continuity (same words as the source shot).
- *Fast anime portrait*: Anima prefix + B-SUBJECT(count+character+series) +
  @artist + pose/lighting tags + B-NEGATIVE.
- *Scene extension*: Qwen B-STYLE + B-SUBJECT + B-LIGHT written as the
  finished wide scene (no operation words).

---

## 6. FUNDAMENTALS — why each family wants what it wants (the reader's mental model)

The full per-family fundamentals live in each packet (§7 of every one).
The compressed reasoning:

- **H3** reads a *sectioned document* through a Qwen3-VL encoder trained on
  exactly that shape — sections, shot blocks, speaker tags and quoted
  dialogue are the model's native language, not formatting taste. Its
  adherence is resolution-gated (structure decided at high sigma; collapse
  >576p), its audio wants a filled budget every second, and its edit
  quality is keep-list-gated because an edit is reference-generation with
  an instruction — under-specified means "helpfully redesign everything".
- **Qwen-2.1** reads *instruction prose + auto-spliced vision tokens*; the
  tag protocol is its role-steering mechanism; the mask is semantic (not
  latent-machinery), so words about the mask compete with the mask — and
  lose, measurably.
- **Krea 2**'s TE is *prompted as a captioner* — its native distribution is
  descriptive prose enumerating color/shape/size/texture/quantity/spatial
  relations; its edit lanes are LoRA-trained contracts (instruction /
  scene-style / region-content), and pairing the wrong prose with the
  wrong lane is the quality bug.
- **Klein** is a *positional binder*: references bind by index; prompt
  shape moves prompt-following (BFL's own words); retention naming is the
  difference between an edit and a re-roll.
- **Anima** is *tag-native* because it was tag-trained (with dropout, so
  mixes work); its small LLM encoder caps NL length; its negative prompt
  is real. The only family where the tag grammar is the contract.
- **The propagation engines** read *no prose at all* (Viggle) or a caption
  whose job is to stay OUT of the motion channel (SCAIL-2/Wan) — operator
  intent lives in the anchor repaint and the geometry, which is why their
  "prompting" lives in the stills-edit packets.

---

## 7. Decision framework — task → workflow → goal → pattern

Pick the row, then the lean:

| Intent (the real goal) | Workflow | Structural pattern | Triangle lean |
|---|---|---|---|
| Quick iterate on composition (stills) | Qwen turbo @1024² / Krea Turbo / Klein distilled | short prompts, minimal blocks; seed-lock; full-preset re-run on the keeper | **speed** |
| Final-quality hero still | Krea Raw-class / Qwen 40-step / Klein True / H3 packet + refine stage | full block composition; one detail per iteration | **quality** |
| Identity-critical still edit | Krea instruct on-recipe / Qwen instruction | bare instruction (Krea) / target+change+retain (Qwen); dials for behavior | adherence+quality |
| Pixel-exact outside a region | Krea AnyPaint / Qwen mask protocol / H3 Fun-Control (video) | mask contract + the lane's own prompt contract (§3.15/3.12/3.6) | adherence |
| Multi-subject / multi-ref compose | Qwen (≤10, tags) or H3 R2V (≤9, six sections) or Klein (≤4) | B-REFROLE per ref, one concept each; role-split across DIFFERENT subjects | quality |
| Multi-shot continuity shot (video) | H3 single-pass multi-shot (measured winner at short lengths) or cut-together | timed `[Shot N]` blocks + verbatim repetition across chain | adherence |
| Long-form video | chain + hard cuts + post; R-pass refresh; propagation for recast | per-shot identity payload; windows independent; audio muxed, never generated | quality (per-shot) |
| Recast existing footage | Viggle / SCAIL-2 / Wan-Animate-2 + repaint anchor | canonical reference for every chunk; appearance composed upstream | adherence (motion) |
| Camera work on existing footage | Meridian method (geometry) / H3 prompt+AddGuide | geometry flags or triplet+guides at frames 0/17/34 | speed (preview first) |
| Song / score | Music 3 (intelligibility, license-friendly) / YuE2 (quality, covers, editable score) | three-section caption / genre+lyrics+ABC | quality |
| Anime illustration | Anima | tag mode for control; mix for flow | quality (CFG 4–5) or speed (turbo) |
| Text-bearing design | Qwen first, H3 second | quoted strings; typography verified | quality |

The flow in one line: **what must survive unchanged? → nothing (generate:
blocks by family) · something (edit: retain-clause dialect + mask-or-
instruct by exactness) · motion (propagation/camera lanes) · sound (audio
captions) — then pick the lean, then the preset.**

---

## 8. Packet index

| Packet | Family | One-line contract |
|---|---|---|
| [h3-packet.md](h3-packet.md) | MiniMax H3 (T2VA/I2VA/FL2VA/L2VA/R2V/turbos/Fun-Control/stills) | sectioned AV documents; no negatives; retention-gated edits |
| [krea2-packet.md](krea2-packet.md) | Krea 2 | captioner prose; per-lane edit contracts (instruction / scene-style / region-content) |
| [klein-packet.md](klein-packet.md) | FLUX.2 Klein (+our True-V1 de-distill) | BFL slot prose; target+change+retention; indexed multi-ref |
| [qwen-image-2.1-packet.md](qwen-image-2.1-packet.md) | Qwen-Image-2.1 | instruction prose + `<imageN>` tags; measured mask protocol |
| [anima-packet.md](anima-packet.md) | Anima | danbooru tag grammar; real negatives; hybrid native |
| [propagation-packet.md](propagation-packet.md) | Viggle-Animate / SCAIL-2 / Wan-Animate-2 | no-prompt (Viggle) / caption-not-instruction (SCAIL) / appearance-only (Wan); prompting lives in the repaint |
| [supporting-cast-packet.md](supporting-cast-packet.md) | Meridian / YuE2 / Music 3 / Fizgig / FaceRefine / LatentSync | geometry-not-prose; structured audio captions; settings-not-prompt |
| [packet-template.md](packet-template.md) | — | the standing-rule template for future families |

Maintenance: a new family lands only with its full packet (the standing
rule); gaps in these packets get filled, not deferred. Re-verify triggers
per packet §"Sources".
