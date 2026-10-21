# FastVideo/FastH3-Omni-Comfy — fresh-release assessment (the omniref family arrives)

> **Provenance.** Maintainer ask 2026-10-20, verbatim: *"Is this good for us at all? https://huggingface.co/FastVideo/FastH3-Omni-Comfy"*. Assessed same day (repo lastModified 2026-10-20T21:58Z — hours old).
> **Read at:** HF model card (README, verbatim), the HF API model tree, `MANIFEST.json`, the INT8 checkpoint's `.receipt.json`. The `conversion/` scripts were NOT read line-by-line (assessed via manifest shas + receipts); no clone, no download, no GPU, nothing submitted.
> **METHOD:** README + API-metadata read [DOC for what the card/receipts state]; our-side cross-read against `server/hashCatalog.json` (228 rows, 24 repos, 2 gaps), `scripts/crawl-hash-catalog.mjs`, the ref2va lane, and the h3 sampler doctrine. Quality claims about model OUTPUT are [SPEC] — nothing GPU-validated by anyone yet (the repo's own receipt says `gpu_inference_validated_here: false`).
> **Community metrics: DROPPED per the fresh-release doctrine** — hours old (11 downloads at read); time-gated noise. `gated: False` is the one platform fact that matters: **anonymously crawlable**, no token, no license gate at the API layer (weights themselves remain under the MiniMax-H3 Community License Agreement — same posture as our existing H3 rows, user-fetch).

---

## 1. WHAT IT IS

**A ComfyUI-layout republish of the final FastH3 Omni release** — one genuinely new artifact in two quants, plus byte-preserving re-ships of components we already catalog:

| File | Status vs our catalog |
|---|---|
| `diffusion_models/fasth3_omniref_8step_pruned_bf16.safetensors` | **NEW** — the omniref checkpoint, BF16 |
| `diffusion_models/fasth3_omniref_8step_pruned_int8_convrot.safetensors` | **NEW** — 22,213,723,064 B, sha256 `851b2dc9…3f80` [DOC, receipt] |
| `text_encoders/qwen3vl_32b_minimax_h3_bf16.safetensors` | already carried (Comfy-Org/MiniMax-H3 row) |
| `text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors` | already carried |
| `text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | already carried |
| `vae/minimax_h3_audio_vae_fp32.safetensors` | already carried (audio-vae/default/fp32) |
| `vae/minimax_h3_video_vae_fp16.safetensors` | already carried (video-vae/default/fp16) |
| `vae/minimax_h3_video_vae_int8_convrot.safetensors` | already carried (video-vae/default/int8-convrot) |

Sibling repos exist for other formats (the collection "fasth3-omniref"): `FastH3-OmniRef-FP8-Comfy`, `FastH3-OmniRef-NVFP4-QAD-Comfy`, and the original FastVideo-layout `FastVideo-FastH3-Omni-8-Step-V1`. **On the 24GB stack the INT8's 22.2 GB checkpoint implies heavy offload; the FP8/QAD siblings are the plausible resident quants — sibling assessment is part of the intake, not done here.** [SPEC]

**The capability claim [DOC, card]:** "Generate video and synchronized audio from a prompt and ordered image, video and audio references" — native OMNI conditioning (video + audio references, not just images), audio generated synchronized, 8 sampling steps at guidance 1.0 (video shift 12.0, audio shift 3.0). Reference inputs are prompt-ordered tags: `<Picture 1>`, `<Video 1>`, `<Audio 1>`. **"The text encoders include the vision tower needed for references"** — the reference mechanism rides the TE's vision tower (the same class as our ref2va lane's qwen3vl tower), not a new conditioning node type.

**Provenance discipline (the strong part):** every file carries a sha256 in `MANIFEST.json`; each checkpoint has a `.receipt.json` — the INT8's says `verified_byte_preserving_copy` from `nuva-omniref-preview/FastH3-OmniRef-v5-DMPDD8-w03-cfg2-step3500` (revision pinned, source path named, "modifications: filename only"), plus a `provenance/` directory of 14 audit JSONs (SOURCE_PINS, SOURCE_VERIFICATION, schema audits, sample validations). Vendored ComfyUI tooling carries its license files. The card states the honest divergences: ComfyUI "outputs can differ from FastVideo and UniServe", NVFP4 needs Blackwell, and the receipt admits `gpu_inference_validated_here: false`. Model co-developed with Nuva Lab (the receipt's source repo prefix matches).

## 2. CORRECTIONS to the in-chat first read (the audit trail)

- **It does NOT close our two catalog gaps.** The gaps are `minimax_h3_fl2va_fasth3_dense_pruned_int8_convrot` and `minimax_h3_video_vae_w4a8_from_fp16` at `jacokon/fasth3-live` — this repo carries neither file (no dense variant, no w4a8 VAE). Those gaps stay open, oid-masked at jacokon.
- **The TE/VAE variants are not new to us.** My first read called the BF16 TE and INT8 video VAE "variants we don't have" — wrong; all six supporting files are already cataloged (likely sha-identical re-ships of the Comfy-Org conversions; the crawl dedupes these naturally via the shared-sha candidates machinery).

## 3. WHAT IT MEANS FOR US

**The reference/identity loop's missing half.** Our ref2va lane binds image references. The omniref family adds ordered **video** and **audio** references in one checkpoint — the capability the blind UX review flagged as the loop's core value (identity continuity across takes). If the mechanism holds, the `<Video N>` tag is the take-chaining primitive: feed the last take back as a reference directly, no frame-extraction preprocessing.

**The turbo-lane competition.** Our fast tier is lightx2v turbo LoRAs on the ref2va base. This is a purpose-distilled 8-step checkpoint (DMPDD8, step 3500) rather than a LoRA tack — plausibly stronger at equal steps, and it speaks audio. Whether it replaces the lightx2v lane is a bake-off question, ours to run [SPEC].

**The stock-node question (the load-bearing unknown).** The card says to use "the **MiniMax H3 Reference to Video** conditioning node" — which our graphs already drive (68 references) — but the card does not show the wiring for video/audio reference inputs, and a vision tower cannot take audio. Open: does current ComfyUI core's `MiniMaxH3ReferenceToVideo` schema expose video/audio reference inputs, or does omni need a newer core / a different conditioning path? **[UNK] — the packet's first question; check core's node schema at our floor vs latest before any graph work.** The audio side also adds an audio-VAE decode leg our graph builder has never emitted.

**Crawl value: modest but free.** Anonymously readable, manifest-sha'd, receipt'd — the crawl adds 2 rows (the omniref quants) and the re-ships dedupe against existing shas. No gap closure.

## 4. VERDICT

| Arm | Ruling |
|---|---|
| **ADOPT (candidate)** | The omniref 8-step family — full research packet (docs/research/prompting/) + sibling-quant survey (FP8/QAD for 24GB residency) + bake-off vs the lightx2v turbo lane on OUR harness. The packet is the prerequisite of landing (standing rule 2026-10-03). No graph work before the stock-node question is answered. |
| **ADOPT (mechanical)** | Add the repo to the crawl manifest (24 → 25 repos). Two new rows; zero new obligations. |
| **CONFIRM** | The `<Picture N>` ordered-tag grammar — third independent confirmation (CHAR eval, Fizgig's edit lane, now the vendor) — now with `<Video N>`/`<Audio N>` siblings. Also confirms our never-trust-published-hashes doctrine (we crawl bytes; the manifest's shas are cross-checks, not inputs) and our receipt/pin provenance culture — theirs mirrors ours. |
| **CORRECT** | Two self-corrections recorded in §2 (the phantom gap closure; the phantom new components). The correction arm pointed at my own first read, this time. |
| **NONE** | Community signals (dropped, hours old). |

**The one-line answer to the maintainer's question:** yes — as the omniref family intake (packet → stock-node verification → sibling-quant pick → bake-off vs lightx2v), not as a gap closure, and nothing lands before the packet.

---

*Assessment for FastH3-Omni-Comfy fresh-release assessment (aucxqnl). Addenda arrive dated, never as silent rewrites.*
