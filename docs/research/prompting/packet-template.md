# Model-family research packet — TEMPLATE

> This is the reusable skeleton every family packet in this directory is
> built against (the standing rule's enforcement shape, maintainer
> 2026-10-03). Copy it, fill EVERY section, and delete any section only
> with an explicit `[UNK — nothing exists]` note explaining what was tried.
> A packet that quietly skips a section is a gap wearing a document's
> clothes.

Fill rules:

- **Header block**: family name, packet date, task id, METHOD line (what was
  code-read vs card-read vs web-harvested vs measured), and the evidence-tag
  legend. Same tags as every research doc: **[DOC]** shipped code / official
  source, **[COMM]** reputable community claim, **[SPEC]** plausible-unverified,
  **[UNK]** nobody knows. Add **[MAINTAINER]** and **[DOC-m]** (measured by
  someone else, not us) where they apply.
- **Every preset carries its evidence tag.** A preset is shippable product
  content (it becomes app copy); a community guess must never read as
  official.
- **Recipes marked `[SPEC-derived]`** are constructed from the family's
  documented contract because no source exists — say so at the recipe, not
  in a footnote.
- **Corrections arrive as dated addenda**, never silent rewrites.
- **Re-verify on**: new checkpoint in the family, sampler/TE change, or any
  sign the upstream prompting guidance moved (the library's
  SOURCE-OF-TRUTH CHECK applies to the captures a packet leans on).

---

## <family> — research packet

> Packet date: YYYY-MM-DD · Flux task: <id> · METHOD: <what was read, from
> where, at what revision>.
> Weights (as shipped/staged here): <file names + quant class>. License:
> <verdict + one-line obligations + territory notes>. Last license
> re-verify: <date>.

### 1. What the family is (one paragraph)

Variant table (base / distilled / edit-specialized / finetunes), which
checkpoints Monoka uses, and what each is FOR.

### 2. How the model reads (the conditioning path, plain terms)

- Text encoder(s), what they were trained on, and the prompt shape that
  implies.
- Reference/conditioning inputs and how they bind (indexed tags, latents,
  vision tokens, masks).
- What ordering/tokenization is REAL vs folklore here.

### 3. The prompting contract

- Format: sections/fields/tags/triggers, verbatim skeletons.
- Length/density norms and language rules.
- Negative-prompt channel: exists or not; how suppression is actually done.
- Reference addressing rules (slot syntax, ordering law, role statements).

### 4. Sampler settings, resolutions, frames

- Sampler/scheduler, steps, CFG/guidance — per variant (base vs distilled).
- Sigmas/shifts (per-checkpoint where they differ).
- Resolution grid/canvas conventions, aspect ratios, multiples.
- Frame rates / duration grids (video+audio families).

### 5. LoRA / strength interactions

Which adapter classes exist, what their strength dials actually scale,
stacking ceilings, never-merge rules, adapter×checkpoint×shift pairing
constraints.

### 6. Task recipes (the taxonomy)

Per task this family serves: the recipe (preset), settings, the prompt
template, failure modes specific to the task. Cover at minimum, where
applicable: instruction edit, object removal/insertion, quality
refine/enhance, camera retarget/re-camera, inpaint, outpaint,
identity/multi-subject reference work, dialogue/audio, style/medium
transfer, camera-movement direction.

### 7. Fundamentals — WHY the contract is shaped this way

- The adherence/quality/speed triangle: what moves each vertex and what it
  costs (state the trade-off).
- Structure principles: ordering effects, sectioning, specificity
  gradients, contradiction behavior.
- Negative space: what NOT to prompt (documented backfires), and the
  no-op traps (channels that silently do nothing).

### 8. Community-verified tips (each tagged, distinguished from official)

The multi-reporter or measured findings; folklore explicitly labeled
folklore.

### 9. Failure modes (the honest list)

Ranked by how often they bite; each with its documented fix.

### 10. License pointer

Verdict, obligations, territory, derivative rules, output-use rules; link to
the registry row if one exists.

### 11. Sources

Numbered, tagged, dated. Official first, vendor docs second, community
third. Internal corpus docs cited by path.
