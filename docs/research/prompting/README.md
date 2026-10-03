# Prompting & model-family research packets

Standing rule (maintainer, 2026-10-03): **a new model family lands only with a
full research packet** — everything needed to use the model to its fullest:
the prompting contract (format, sections, tags, triggers, prefill),
sampler settings, resolutions/canvas conventions, steps, sigmas/shifts,
frame rates, LoRA/strength interactions, known failure modes, license.
Gaps found in existing packets get filled, not deferred.

The founding build (Flux `vcks4mb`, 2026-10-03) shipped:

| File | What it is |
| --- | --- |
| [guide.md](guide.md) | the master prompting guide — task×family matrix, preset curation (ready-to-prefill prompts per task per family), prefill templates with slot markers, the mix-and-match block grammar, cross-family fundamentals + decision framework |
| [packet-template.md](packet-template.md) | the reusable packet template future families are built against |
| [h3-packet.md](h3-packet.md) | MiniMax H3 (all modes, turbos, Fun Control, stills lanes) |
| [krea2-packet.md](krea2-packet.md) | Krea 2 (captioner prose + the three edit-lane contracts) |
| [klein-packet.md](klein-packet.md) | FLUX.2 Klein (+ the shipped True-V1 de-distill) |
| [qwen-image-2.1-packet.md](qwen-image-2.1-packet.md) | Qwen-Image-2.1 (instruction prose, tag protocol, measured mask doctrine) |
| [anima-packet.md](anima-packet.md) | Anima (tag grammar, real negatives, hybrid prompting) |
| [propagation-packet.md](propagation-packet.md) | Viggle-Animate / SCAIL-2 / Wan-Animate-2 (the recast lane; prompting lives in the repaint) |
| [supporting-cast-packet.md](supporting-cast-packet.md) | Meridian / YuE2 / Music 3 / Fizgig / FaceRefine / LatentSync |
| [BUILD-REPORT.md](BUILD-REPORT.md) | the founding build's coverage map, source list, next-research queue |

Evidence discipline: every claim in every packet carries
[DOC]/[COMM]/[SPEC]/[UNK] (plus [MEASURED]/[DOC-m] where they apply); a
community guess is never presented as official; recipes constructed from
the contract rather than sourced are marked `[SPEC-derived]`.
