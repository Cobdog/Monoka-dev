# TypedDecision — the caption-verifier pipeline (nomadoor/ComfyUI-TypedDecision + mohit67890/imajev, 2026-10-05)

> MIT (the pack); imajev-4b (490 MB adapter + readout + calibration) and the
> Qwen3.5-4B backbone licenses verified at fetch. Fresh (2026-09-29). The
> maintainer's product ruling: **the caption-verification pipeline** — VLMs
> hallucinate, miss, and invent; decompose captions into facts and challenge
> each through a decision engine.

## Verdict

**ADOPT-candidate as a PIPELINE PRIMITIVE** — not a judge gadget. The typed
decision (noul / choice / score, calibrated probabilities, abstention,
position-debias) is the verifier at the heart of a caption-facts pipeline,
and the same engine serves judge-in-the-loop and dataset triage.

## 1. The caption-verifier pipeline (the maintainer's design, formalized)

```
image ──► CAPTIONER (any VLM) ──► caption
                                   │
                    FACT EXTRACTOR (text-LLM: decompose into atomic claims —
                    subject, attributes, counts, colors, spatial relations,
                    actions, state)
                                   │
                    facts sheet ──► VERIFIER (TypedDecision, per fact):
                    noul(image, fact) → calibrated P(true) + abstention
                                   │
                    VERDICTS: VERIFIED (P ≥ threshold) · REFUTED (P low) ·
                    UNVERIFIABLE (abstained) — each with confidence
                                   │
                    the caption trust report: only verified facts flow into
                    the locked description / the training caption / the
                    reference metadata; the flagged facts surface for repair
```

The hallucination taxonomy it attacks, mapped:
- **Invented facts** → per-fact noul REFUTES them (isolated by
  decomposition — a lie can't hide inside a true sentence).
- **Missed information** → the CHECKLIST probe (the reverse direction):
  a domain-standard attribute checklist (choice mode: which of these are
  present?) recovers coverage gaps the caption never touched.
- **Wrong attribution** (spatial/count/color errors) → decomposition
  isolates each relation and count as its own fact, each verdicted alone.

Where it lands in our stack, concretely:
1. **The datasets caption lane** — captions ARE training data; the verifier
   is the quality gate before bake (the audit-before-train step).
2. **The `.char` locked description** — a *verified* description, not a
   VLM's first draft (the description drives every downstream generation).
3. **The keyframe adapters' caption dialect** — FIRST FRAME / TARGET END
   FRAME are load-bearing facts; verified before they steer a chain.
4. **Reference-strip metadata** and any caption the app persists.

The fact-extraction step is ours (the existing LLM lane, no new deps); the
verifier is the TypedDecision node in-graph or the same imajev model on our
engine lane; the composable halves stay modular per the contract.

## 2. What the engine provides (mechanism, not discipline)

The Codex methodology audit's judge doctrine, implemented as primitives:
position-debias (`debias`: average over option orders), abstention
(`abstained` + a `pass` that respects it), **shipped calibration**
(`calibration-rot4-modality.json` applied to probabilities), thresholds on
`value` while `label` stays unthresholded. Two-image support = our pairwise
shape exactly. The 4B-backbone question is ECONOMICS not competence: local,
in-graph, ~zero marginal cost — the bar is calibration and consistency on
NARROW typed questions (the eval's job to measure), not general judgment.

## 3. The eval (registered in the ledger — the TDE)

Three arms, calibration-before-trust per the audit's own rule:
- **TDE-1 judge calibration**: imajev vs the corruption ladder (regenerate
  from the source clip — the ladder was setA's judge-calibration
  instrument; the MP4s went to trash in the disk pass and are
  ffmpeg-derivable or trash-restorable). Discrimination on known
  corruptions; the drift doctrine applies.
- **TDE-2 caption verification (the pipeline's falsifiable core)**:
  ground-truth captions on controlled scenes, then CORRUPT ONE FACT at a
  time (swap a color, miscount, invent an object, break a spatial
  relation) — measure whether per-fact P(true) separates honest from
  corrupted claims (ROC + calibration curves per corruption class). The
  abstention arm: unanswerable facts must abstain, not guess.
- **TDE-3 dataset triage**: the sort workflow on a real slice of our
  datasets pipeline (people/no-people class or equivalent), vs
  hand-labels; the throughput/cost profile recorded (the in-graph
  economics case).

Dependencies at run: the pack (MIT) + imajev-4b + Qwen3.5-4B int8 — all
fetch-consent with rows at fetch.

## 4. The honest risks

- A 4B judge verifying an N-B-parameter captioner's claims: the verifier
  can be WEAKER than the liar. The eval measures exactly this; if 4B
  discriminates single-fact corruptions on narrow typed questions, the
  lane is real (verification is easier than generation — the classic
  asymmetry — but it must be measured, not assumed).
- Calibration transfer: rot4-modality was fit on their distribution; our
  classes (video frames, anime, references) may sit off-calibration —
  TDE-1 exists to check before anything trusts the probabilities.
- The fact extractor is a second hallucination surface (a bad
  decomposition verifies the wrong things) — the pipeline's report carries
  the extraction alongside the verdicts; the spec round designs the
  human-in-the-loop seam (our Refusal/confirm vocabulary applies).
