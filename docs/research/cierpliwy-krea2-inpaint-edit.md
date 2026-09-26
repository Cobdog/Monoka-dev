# Cierpliwy krea2-inpaint-edit — the ostris-recipe inpaint LoRA (assessment + wiring)

> **Provenance.** Maintainer ruling #1 of the 2026-09-26 inventory decision
> ([node-inventory-decision-2026-09-26.md](node-inventory-decision-2026-09-26.md)
> §Rulings): *"Krea 2 edit should also use the Ostris edit, so we can utilize:
> https://huggingface.co/Cierpliwy/krea2-inpaint-edit"* — the ostris-edit
> pack reverses from cut-candidate to KEPT+WIRED and these weights are the
> reason. Flux task `aunt0rl` (epic 4lphxv8).
>
> **Method.** HF model API + raw README (not the heavy page) + all four
> example workflows parsed link-by-link + the ostris pack's `nodes.py` read
> from the canonical shared install at its pinned revision + ComfyUI
> v0.37.4 `comfy_extras/nodes_mask.py` for the stock composite classes.
> **No engine, no GPU, nothing run** — wiring-truth only, per the graph-lane
> discipline. Assessment date 2026-09-26; weights published 2026-09-24
> (TWO DAYS FRESH — every claim below is publisher-stated, nothing measured
> by us).

## What it is

Three LoRA variants for Krea 2 that perform **inpainting by masked
editing**: you provide an image with the region to (re)generate filled in
solid black plus a prompt describing what should go there; the model paints
the masked region while the reference conditioning holds the rest. It is an
**ostris/ai-toolkit t=0 edit LoRA** — the same recipe class the
`comfyui-krea2-ostris-edit` pack implements (`TextEncodeKrea2OstrisEdit` +
`Krea2OstrisEditModelPatch`, reference latents appended as tokens
conditioned at t=0, "index_timestep_zero") — and it was trained with
ai-toolkit's **kv_cache** isolation (the README: kv_cache on the model patch
*must be enabled* — default off in the pack — "important for correct masked
editing"). The pack docstring confirms the semantics: a kv_cache-trained
LoRA's reference tokens attend only to each other, so their per-block K/V
are timestep-invariant and get precomputed in one ref-only pass at t=0.

The author's gallery compares results directly against
`yijunwang2/krea2-anypaint` (our refine/outpaint family's adapter) with
per-row difference maps — the two lanes are explicit competitors on the
same masked-edit task.

| File | Size | sha256 (LFS oid at pin) | Purpose (card) |
| --- | --- | --- | --- |
| `krea2_inpaint_edit.safetensors` | 457,111,984 | `4c09533fdd243200e7afad92f1ed1a92dacd39c53fe64412f938ae093c82a26b` | default strength |
| `krea2_inpaint_edit_mild.safetensors` | 457,111,984 | `59d00eb3559e69a57a68dc6bb1f2a38aebaf9365de12a9bbd7387f2435cbc5f4` | fewer changes to non-masked areas; better when the mask covers the main focus point |
| `krea2_inpaint_edit_strong.safetensors` | 457,111,984 | `26e2e80e00c9547439786404d17ee4a6335b68f19c744633a8ad582f6df1e2eb` | better at outpainting; adapts more strongly to the prompt |

Repo pinned at **`9faed2d2b6cfd909401e8d6139d87b93b36c01e4`** (HEAD at
assessment). The four example workflows use only official ComfyUI nodes plus
the two ostris classes.

## License

`license: other` → `license_name: krea-2-community-license`, link
[krea.ai/krea-2-licensing](https://www.krea.ai/krea-2-licensing). **No
LICENSE file ships in the repo — the card metadata is the grant record**
(noted verbatim in the catalog row's licenseNote). Same class as our other
Krea 2 derivative weights (identity-edit, anypaint): commercial use under
the revenue threshold, content-moderation and AI-disclosure duties ride the
outputs — USER duties surfaced at consent, never enforced in-app. NOT
NO-LICENSE (a declared custom license exists), NOT NC. Gating:
fetch-consent, `krea-2-community-license`, flagged-class handling identical
to the sibling rows. Training data not disclosed; unofficial.

## The recipe (from the publisher's own workflows)

All three example workflows agree on the operating point, and it is the
Turbo one:

- **Checkpoint:** Turbo — every workflow loads
  `krea2-turbo-mxfp8-simple.safetensors` (see the discrepancy note below).
- **Sampler:** 8 steps / CFG 1.0 / `euler_ancestral` + `simple` / denoise 1.
- **LoRA:** `LoraLoaderModelOnly` @ strength 1.0, then
  `Krea2OstrisEditModelPatch` (kv_cache ON — 2 of 3 workflows; the README
  text is normative, see below).
- **Negative:** `ConditioningZeroOut` of the positive (2 of 3; the third
  wires the positive as negative — equivalent at CFG 1.0 where the negative
  is unused by math).
- **Masking:** the edit region is built as BLACK pixels BEFORE the encode —
  `SolidMask(0,w,h)` → `MaskToImage` → `ImageCompositeMasked` — and the
  masked image feeds `TextEncodeKrea2OstrisEdit.image1` with the `vae`
  connected (the encode then attaches the VAE reference latents itself,
  auto-fitted to ≤1MP and snapped /16; the Qwen3-VL tower sees a ≤384×384
  copy). The output canvas is the same size as the masked image.
- **Prompt convention (the card's own words):** *"write a prompt describing
  what should appear in the masked region (style, colors, content)"* — the
  deliberate OPPOSITE of AnyPaint's measured scene-style contract (E-K1):
  here the reference carries the unmasked rest, so the prompt scopes the
  masked content.

### Discrepancies recorded honestly

1. **Card metadata vs shipped workflows.** The card's `base_model` tag and
   Requirements section say **Krea-2-Raw**; all three shipped workflows run
   the **Turbo** checkpoint at the Turbo operating point (8/1.0). We pin
   what the publisher's own runnable artifacts do (Turbo @ 8/1.0) and note
   the metadata conflict — if Raw-at-CFG>1 turns out to be the intended
   quality path, that is a re-pin with evidence, not a silent flip.
2. **kv_cache in background_replacement.** That one workflow sets
   kv_cache **False**, contradicting the README's "must be enabled". We
   follow the README (and 2 of 3 workflows): kv_cache ON, and the recipe
   audit now enforces it as a violation when off with these weights — the
   exact plausible-output-wrongly class the audit exists for.
3. **Patch/LoRA order varies** across the workflows (lora→patch in two,
   patch→lora in one). Object patches survive `ModelPatcher.clone()` in both
   orders; we keep our house order (LoRA → patch), which matches the
   majority example.

## Composition with the dual-conditioning path (the carrier semantics)

This is the **t=0 carrier done right**: the reference latents ride the
conditioning produced by the ostris encode and the patched model appends
them as tokens at t=0 with isolated K/V — the recipe this LoRA was trained
with. The E-K1 trap is the CROSS-pairing: the *identity* LoRA on a t=0
carrier silently destroys the reference region (meanAD 5.30 → 40.06 on our
int8 stack). The audit therefore keeps both truths simultaneously: t=0 via
core `ReferenceLatent` + `index_timestep_zero` remains **legitimate for
ostris-recipe LoRAs**, and the identity LoRA on it remains a violation;
`Krea2OstrisEditModelPatch` joins the whole-pipeline patcher
mutual-exclusion set (all three packs replace `diffusion_model.forward`
wholesale).

## What landed (the wiring)

- **`krea2edit.ostris` family** (`src/lib/graph/krea2edit.ts`): Turbo
  checkpoint, the pinned operating point, LoRA @1.0, kv_cache ON pinned.
  Input prep: `SolidMask(0) → MaskToImage → ImageCompositeMasked` black-fills
  the Mask-Editor region (white = regenerate) into the source BEFORE the
  encode; the masked image feeds the ostris encode's `image1` with clip+vae;
  negative is `ConditioningZeroOut`. Node ids 44–48 (the paint block is
  40–43; the base skeleton and identity/anypaint blocks untouched).
  Availability gating honest: missing pack classes or weights → install
  guidance naming the fetch entries (never silent). Sampler dials are not
  exposed (one shipped operating point — same Turbo-locked posture as
  AnyPaint); mask required (explicit `mask: false` refused). LoRA variants
  resolve presence-order **default > mild > strong** (no variant dial until
  evidence says which axis matters — the test design below owns that).
- **Recipe audit grows three rules:** the ostris encode/transport/LoRA
  triple; kv_cache-off with these weights is a violation; and the composite
  rule becomes **position-aware** — a composite consuming the DECODED output
  is forbidden (output doctoring), while pre-encode input construction (the
  black-region fill, the publisher's own mechanism) is the allowed form. The
  old flat class-ban would have false-positived the new family's input prep.
- **Fetch rows** (`server/fetchCatalog.ts`): `pack:krea2-ostris-edit`
  (single-sourced from the new ENGINE_NODE_PACKS row, MIT @
  `7756566160c4a1b24bb1bd9f0ff3ced1a83d7547` — the shared install's rev)
  and `krea2-ostris-inpaint-edit` (weights; all three variants, sha256 +
  size pinned per file, destination `loras/`, 1.31 GB total).
- **Registry/license rows** (same commit, lockstep): ENGINE_NODE_PACKS
  `krea2-ostris-edit` + [../licenses/registry.md](../licenses/registry.md)
  §4 pack row and §5b weights row.
- **Engine-contract fixture**: the two ostris class schemas + the three
  stock mask/composite classes added source-derived at the pin (the pack IS
  installed on the shared install — its classes were served by the
  2026-09-26 capture boot but trimmed from the kept set because no builder
  emitted them; the next `/object_info` capture folds the real entries in).
  `STOCK_GRAPH_CLASSES` + the capture script's mirror gained the three
  stock classes (lockstep-checked).

## Epistemology: PROPOSED-PENDING-TEST (baseline candidate, not a default flip)

Is the card's evidence decisive? **No.** What it offers: an author-authored
gallery comparison against AnyPaint (one widget row with difference maps —
author-selected examples, no protocol, no numbers), a fresh release with
427 downloads / 22 likes (noise, per the fresh-release doctrine), and no
independent usage history (two days old). Nothing in it justifies flipping
defaults away from the measured-on-our-stack AnyPaint refine lane
(E-K1's VAE-floor preservation numbers are OURS).

**Test design (the named matched arms):** `krea2edit.ostris` vs
`krea2edit.refine` (and `outpaint` where padding applies) on the
edit-preservation golden domains — masked-inpaint tasks scored on (a)
outside-mask fidelity to source, (b) in-mask prompt adherence, (c) boundary
quality — **cost-scored** (same machine, wall-clock + VRAM recorded; the
ostris path pays one extra ref-only K/V pass, AnyPaint pays per-step latent
restoration). Secondary axis worth one arm each: the _mild variant where
the mask covers the main subject, the _strong variant on canvas-growth
tasks (the card's own claims, verified or falsified). Until that runs, the
family is wired, gated, and honest — availability is presence-truth, the UI
copy says baseline-candidate, and nothing defaults to it.

## Standing notes

- The maintainer's two-stage sampler (ruling #8) lands on this lane's
  scoreboard too — the ostris arm's numbers feed the same evidence pool the
  TS-1/TS design draws on.
- Kreatine's `KreatineReferencePatch` implements the same t=0 recipe
  natively; if/when the Kreatine lane adopts, this wiring is the
  non-Kreatine fallback arm — the modularity contract holds (pull the pack
  row + family entry + fixture entries, nothing else welds).
- Re-verify triggers: a v2/retrain of the LoRA, the card's Raw-vs-Turbo
  conflict resolving upstream, or kv_cache semantics changing in the pack.
