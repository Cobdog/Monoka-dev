# The CHAR eval results — the `.char` round-trip on our reference assets (2026-10-10)

> The registered CPU-first eval ([gpu-batch-ledger.md](gpu-batch-ledger.md)
> "THE CHAR EVAL REGISTERED", 2026-10-05; brief =
> [omnichar-assessment.md](omnichar-assessment.md) §5.1). Flux: CHAR eval
> (gu92clr). Executor: this session. **CPU-only** — no engine, no card; the
> optional testbed render leg stays flagged for a GPU window and was NOT run.
> Artifacts: `test-results/experiments/char-eval/` (script committed at
> `scripts/char_eval.py`, outputs on disk under `out/`).
>
> METHOD: everything below was **measured** by the eval script
> (`omnichar-sdk` 0.1.1 from PyPI, Python 3.14) unless tagged **[DOC]**
> (verified in the SDK's shipped source, read this session at
> `omnichar/ComfyUI-Omnichar@main/packages/omnichar-sdk`), **[DOC-packet]**
> (our own prompting packet), or **[SPEC]** (plausible, unverified).

**Verdict up front: the round-trip is clean — ALL 11 gates PASS.** Role
order survives both container layers, the locked description carries
byte-verbatim, and the `<Picture N>` numbering is stable against our wiring
conventions including the two-character trap. One substantive divergence
found (target-vs-cap reference normalization, §3), one packet gap filled
(§4), one honest corpus caveat (§6).

## 1. What was round-tripped

Two `.char` files built from OUR assets — no fabricated inputs:

| Character | face | body | cloth | locked description |
|---|---|---|---|---|
| **Quickstart Elf** (setK's own corpus) | `setK/A_key.png` (the authored bust key, 1792×2688) | `setK/B_key.png` (the hero pose-B key, 1344×768) | `setK/t10_last.png` (the tween-chain terminal take — a genuinely-used chain reference, 1344×768) | the setK `SCENE_S` character fragment, byte-verbatim |
| **Donor B** (setM's authored second character) | `setM/B_ref.png` | `setM/B_view_side.png` | `setM/B_view_threeq.png` (all 832×1216) | the setM `B_SCENE` character fragment, byte-verbatim |

Encode via `encode_character` + `write` (default archs: `flux2-klein` +
`minimax-h3`); decode via `Character.open` + `get_references`/`get_prompt`.
File sizes: elf 4.86 MB, donor 13.8 MB (3 originals + 2 compiled payloads
each). G-PROV asserts both fragments are byte-substrings of the live
setK/setM caption modules, so the locked descriptions cannot have drifted
from the corpus.

## 2. The gates (all PASS)

| Gate | Check | Result |
|---|---|---|
| G-PROV | 6 assets present, dims/sha recorded; descriptions byte-provenanced | **PASS** |
| G-ENC | signature `{"magic":"INLINECHAR","format_version":` at byte 0; `manifest.json` the FIRST zip member; `format_version` 1; both archs compiled | **PASS** |
| G-ORDER | role order survives encode → manifest `refs` → `payloads` files → decode, on BOTH layers (originals + minimax-h3); encode role-sorts face→body→cloth ("position is what a prompt names" [DOC]) | **PASS** |
| G-BYTES | `refs/` members byte-identical to our inputs re-encoded as RGB PNG; description member byte-verbatim + manifest sha agrees | **PASS** |
| G-H3 | payload dims conform to the SDK's H3 policy (short edge 2048, 32-px grid, aspect ≤ 4); 64-px content-match matrix: every payload's nearest original is its own (no reorder/swap) | **PASS** |
| G-SLOTS | the repo's dotted-key wiring (`ref_images.ref_image_N`, the setK harness finding) ↔ `<Picture N+1>` ordinals, 1:1; lead-image shift (`first_position=2`); two-character wiring contiguous 1..6, no gaps/dupes | **PASS** |
| G-PROMPT | token style declares each position exactly once; role lines refer back in prose WITHOUT brackets; description carried verbatim (its whitespace-collapse is the identity on our fragment); `at-image`/`ordinal` forms present and distinct | **PASS** |
| G-VOICE | stdlib 4 s mono WAV: stored + read back; `<Audio 1> is X's voice.` binds; `wanted("auto", …)` sends only with dialogue; audio ordinals per-modality (pictures 1..3 unchanged) | **PASS** |
| G-BATCH | `common_size` + `fit("pad")` compose one batch image, order == prompt numbering; numbered reference sheet renders; `limit=2` keeps `[face, body]` | **PASS** |
| G-DET | two encodes: members byte-identical, manifest delta exactly `{char_id, created_at, modified_at}`; fixed key order; stale-handle (`CharChanged`) + truncated + manifest-less containers all refused with user-facing copy | **PASS** |
| G-CLI | `omnichar-sdk inspect --json` round-trips the record; `prompt --style token` matches the library text | **PASS** |

## 3. The one substantive divergence: target vs cap reference normalization

The SDK's `minimax-h3` payload policy is `{"short_edge": 2048,
"multiple_of": 32, "max_aspect": 4.0}` — the short edge is scaled **ONTO**
2048, **up or down** [DOC]. Our packet's engine semantics is a **budget**:
`ref_image_size max` = keep **up to** 2048 short edge, i.e. shrink-only
[DOC-packet §2]. Measured on our six assets — **every one sits under the
2048 short edge, so the SDK upscaled all of them**:

| asset | original | payload | factor |
|---|---|---|---|
| A_key (face) | 1792×2688 | 2048×3072 | 1.14× |
| B_key (body) | 1344×768 | 3584×2048 | **2.67×** |
| t10_last (cloth) | 1344×768 | 3584×2048 | **2.67×** |
| B_ref / views ×3 | 832×1216 | 2048×3008 | 2.46× |

What this means, honestly:

- The payload pixels are NOT what our wiring would feed the engine today
  for sub-2048 assets — wiring the payload pre-empts the engine's own
  `ref_image_size` choice and forces identity-max resolution on every
  reference. A 2.67× Lanczos upscale of a delivery-res render adds no
  information; whether the larger latent-row count helps or hurts identity
  is an **empirical GPU question — exactly what the optional testbed leg
  should measure first** (flagged, not resolved here).
- It is NOT a format defect: the originals ride untouched and
  byte-identical in `refs/` (G-BYTES), and `build_payload` is exported with
  an overridable policy [DOC] — cap-semantics payloads are one
  `build_payload(doc.manifest, doc.members, images, "minimax-h3",
  {"short_edge": 2048, "only_shrink": True, …})`-shaped call away (a
  policy re-derive, not a fork).
- Uniform target size has a real argument behind it (every ref contributes
  the same latent-row count; the batch form needs one size anyway). The
  divergence is a **decision to surface, not a bug to report**.

## 4. Packet gap filled: the reserved-label repetition rule

The SDK's prompt goldens encode an H3 fact our packet does not carry:
**declare each `<Picture N>` exactly once (the bind line); refer back in
prose without brackets** — "a reserved label repeated replayed the
references on H3" [DOC — omnichar-sdk `prompt.py`, their golden strings].
Their role lines read "Pictures 1 and 2 show X's face", never a second
`<Picture 1>`. G-PROMPT pins this (exactly 3 bracketed tokens in a 3-ref
prompt + prose refer-backs). Recorded as a dated addendum in
[prompting/h3-packet.md](prompting/h3-packet.md) this commit. The voice
binding text (`<Audio 1> is X's voice. X speaks in this voice, lips moving
in sync with every word.`) and the send rule (auto = only when the prompt
has dialogue — quoted line or speech verb [DOC]) ride the same addendum for
the future voice lane.

## 5. The verdict menu (assessment §5 step 2 — framed, maintainer decides)

**License, verified from source this session (not from the assessment's
claim): `packages/omnichar-sdk` is a deliberate Apache-2.0 enclave inside
the GPL-3.0 ComfyUI-Omnichar repo** — its own `LICENSE` file is the
verbatim Apache-2.0 text; its README states "Apache-2.0. The rest of the
repository, including the node pack, is GPL-3.0-or-later"; the PyPI 0.1.1
wheel declares `License-Expression: Apache-2.0`. No GPL bytes are needed
for any integration shape below. The GPL node pack and the no-license
Inline-Core stay out per the assessment's tier table. Registry row landed
in the same commit as the eval script (eval-time dependency, nothing
vendored, nothing shipped).

The format's honest fit for us, then the three shapes:

- **The format is small, versioned, and defensively specified.** A zip
  whose first member is `manifest.json` with a fixed key order and a
  magic signature at byte 0; `format_version` 1 with forward-refusal;
  roles/origins on refs; per-arch compiled payloads; `text/` description;
  voice in `reserved`. Hostile-input caps are part of the spec (member
  count/size/compression-ratio bounds, symlink refusal, no nested
  archives) [DOC]. The whole SDK is 2,123 lines of Python; the
  read-path subset our integration would need (`charfile` + `references`
  + `prompt` + `limits`) is 639 lines, heavily docstringed — a
  first-party TS reader lands around 350–450 lines including the
  hostile-archive checks and the prompt goldens.

| Shape | What it costs | What it buys | When it wins |
|---|---|---|---|
| **A. SDK as a dependency** (Python sidecar in the server env; NOT an npm dep — the SDK is Python-only) | a pinned Python dep + version tracking of their goldens/policies upstream | everything measured here, kept correct upstream: LoRA portability verdicts, voice WAV rules, prompt goldens, policy fingerprinting | if we adopt `.char` as a USER-FACING interchange format and want to track their format evolution for free |
| **B. First-party reader per the spec** (~350–450 lines TS) | ours to maintain: version drift, their goldens re-pinned by hand, hostile-input parity | zero runtime deps, typed into the server, full control of the H3 policy (cap semantics natively) | if `.char` is a read-mostly import path for us and the format stays at v1 |
| **C. CLI boundary** (`omnichar-sdk inspect --json` + `prompt`, validated in G-CLI) | a Python tool present at runtime (fetch-consent-installable; Apache so even vendorable later) | zero code in-tree, any-language boundary, their correctness for free | fastest to ship behind the import path; the natural first step before A or B |

**Recommendation (surfaced, not decided):** start with **C** behind the
reference-strip import path (a day of work, nothing welded — the
modularity contract holds: pulling it out is deleting one subprocess
call), and let the optional testbed render leg (target-vs-cap, §3) plus
real usage decide whether B is worth 400 lines. A is the shape only if
`.char` becomes bidirectional (we WRITE them too — `encode_character`
round-trips cleanly per G-DET, but writing user characters is a product
decision beyond the import path). The step-2 registration asked "SDK
dependency or first-party reader if the format spec proves small": the
spec IS small (§5 above), so B is genuinely viable — the CLI lets us defer
the commitment.

## 6. Honest caveats

- **The corpus is bust-crop-centric.** setK carries no true full-body or
  flat-wardrobe plate; the body/cloth slots were exercised with the
  corpus's best-fitting assets (the pose-B key; a chain take). The slot
  MECHANICS are fully proven; the semantic quality of role assignment on
  non-role plates is a corpus property, not a format property.
- **No LoRA was exercised** (neither character carries one). The SDK's
  LoRA lane (safetensors header streaming, portability verdict, recorded
  strength) is spec-studied [DOC] but not round-tripped — our setsK/M
  LoRAs live engine-side, and synthesizing a fake adapter tests nothing
  real. The first real `.char` with a trained LoRA should re-run the
  script's pattern on that leg.
- **No engine contact.** Every claim above is container-level; "model-ready"
  means dims/policy/order/prompt conformance, not a rendered verdict. The
  testbed leg stays the arbiter of §3's divergence on real hardware.

## 7. Follow-ups registered

1. The testbed render leg (GPU window, maintainer): 2 arms — payload-as-
   compiled (target semantics) vs `refs/`-originals at engine `max` (cap
   semantics) — same seed/graph otherwise; the identity-vs-upscale
   question above is its one measurement.
2. The character file class in the fetch-consent catalog + the
   reference-strip import path (assessment §5.3), shaped per §5's C.
3. The packet addendum (landed this commit) closes the gap; no further
   packet action.

*Artifacts: `test-results/experiments/char-eval/out/` — `elf.char`,
`donor.char`, `elf_voiced.char`, `elf_batch.png`, `elf_sheet.png` (the
numbered contact sheet — the human-checkable numbering surface),
`summary.json` (every gate's raw measurements).*
