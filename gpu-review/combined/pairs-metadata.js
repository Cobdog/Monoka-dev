// gpu-review/combined — generation metadata (PAIRS-METADATA-SPEC.md + Amendment 7)
// question/judge/sides render always (they cannot unblind); per-side reveals post-call.
window.PAIR_META = {
 "p01": {
  "shared": {
   "set": "COMBINED",
   "date": "2026-10-06",
   "kind": "null",
   "question": "The crown contest: at five seconds, same prompt, same seed, same graph family \u2014 does the 4-step adversarially-distilled challenger (a different solution to the same distillation problem) beat the freshly crowned 4-step projection king? Both arms at their own card recipes; brand-new scenes neither has seen.",
   "judge": "ONE call per side: the better shipping render of this 5-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full clip \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters \u2014 the two challengers were distilled with a different audio shift than the king).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 124,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "5.167 s (124f = 5+17*7; the registration's '121f' is off-grid \u2014 engine snaps to 124; disclosed)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple, dense SDPA \u2014 arms differ in LoRA, steps, and shift: turbo-8 @ card 6/3 \u00b7 PDMD-4 @ 12/3 \u00b7 DMAD-4 (both critics) @ 12/2 audio (the DMAD card)",
   "audio_note": "both sides generated their own audio; the DMAD arms ride audio shift 2 vs the king's 3 \u2014 audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 114.41,
   "sampling_s": 100.41,
   "peak_vram_mib": 23907,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -32.105,
    "treble_ratio": 0.004336,
    "spectral_centroid_hz": 1438.16
   }
  },
  "R": {
   "wall_s": 114.41,
   "sampling_s": 100.41,
   "peak_vram_mib": 24041,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -32.105,
    "treble_ratio": 0.004336,
    "spectral_centroid_hz": 1438.16
   }
  },
  "note": "identical content expected \u2014 any flicker or divergence is a TOOLING BUG, report it"
 },
 "p02": {
  "shared": {
   "set": "COMBINED",
   "date": "2026-10-06",
   "kind": "primary",
   "question": "The crown contest: at five seconds, same prompt, same seed, same graph family \u2014 does the 4-step adversarially-distilled challenger (a different solution to the same distillation problem) beat the freshly crowned 4-step projection king? Both arms at their own card recipes; brand-new scenes neither has seen.",
   "judge": "ONE call per side: the better shipping render of this 5-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full clip \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters \u2014 the two challengers were distilled with a different audio shift than the king).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 124,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "5.167 s (124f = 5+17*7; the registration's '121f' is off-grid \u2014 engine snaps to 124; disclosed)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple, dense SDPA \u2014 arms differ in LoRA, steps, and shift: turbo-8 @ card 6/3 \u00b7 PDMD-4 @ 12/3 \u00b7 DMAD-4 (both critics) @ 12/2 audio (the DMAD card)",
   "audio_note": "both sides generated their own audio; the DMAD arms ride audio shift 2 vs the king's 3 \u2014 audition pairs/<id>_L/R.mp4",
   "board_prompt": "P2_1 \u2014 CONTACT \u2014 two movers, heavy crate down a loading ramp",
   "prompt_focus": "designed stress: contact physics and carried weight \u2014 does the crate sag, slip, and settle like 40 kg of wood, and do the movers' bodies coordinate around it?"
  },
  "L": {
   "wall_s": 114.39,
   "sampling_s": 100.39,
   "peak_vram_mib": 23907,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -20.67,
    "treble_ratio": 0.001415,
    "spectral_centroid_hz": 1127.4
   }
  },
  "R": {
   "wall_s": 114.41,
   "sampling_s": 100.41,
   "peak_vram_mib": 23907,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -32.105,
    "treble_ratio": 0.004336,
    "spectral_centroid_hz": 1438.16
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p03": {
  "shared": {
   "set": "COMBINED",
   "date": "2026-10-06",
   "kind": "primary",
   "question": "The crown contest: at five seconds, same prompt, same seed, same graph family \u2014 does the 4-step adversarially-distilled challenger (a different solution to the same distillation problem) beat the freshly crowned 4-step projection king? Both arms at their own card recipes; brand-new scenes neither has seen.",
   "judge": "ONE call per side: the better shipping render of this 5-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full clip \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters \u2014 the two challengers were distilled with a different audio shift than the king).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 124,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "5.167 s (124f = 5+17*7; the registration's '121f' is off-grid \u2014 engine snaps to 124; disclosed)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple, dense SDPA \u2014 arms differ in LoRA, steps, and shift: turbo-8 @ card 6/3 \u00b7 PDMD-4 @ 12/3 \u00b7 DMAD-4 (both critics) @ 12/2 audio (the DMAD card)",
   "audio_note": "both sides generated their own audio; the DMAD arms ride audio shift 2 vs the king's 3 \u2014 audition pairs/<id>_L/R.mp4",
   "board_prompt": "P2_2 \u2014 GYMNASTICS \u2014 vault runway to stuck landing",
   "prompt_focus": "designed stress: full-body fast motion \u2014 a clean Yurchenko rotation, an opening before landing, and a mat that compresses on the stick."
  },
  "L": {
   "wall_s": 103.13,
   "sampling_s": 98.13,
   "peak_vram_mib": 24057,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -25.16,
    "treble_ratio": 0.011925,
    "spectral_centroid_hz": 1904.69
   }
  },
  "R": {
   "wall_s": 105.17,
   "sampling_s": 100.17,
   "peak_vram_mib": 23961,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -24.732,
    "treble_ratio": 0.002444,
    "spectral_centroid_hz": 1470.91
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p04": {
  "shared": {
   "set": "COMBINED",
   "date": "2026-10-06",
   "kind": "primary",
   "question": "The crown contest: at five seconds, same prompt, same seed, same graph family \u2014 does the 4-step adversarially-distilled challenger (a different solution to the same distillation problem) beat the freshly crowned 4-step projection king? Both arms at their own card recipes; brand-new scenes neither has seen.",
   "judge": "ONE call per side: the better shipping render of this 5-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full clip \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters \u2014 the two challengers were distilled with a different audio shift than the king).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 124,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "5.167 s (124f = 5+17*7; the registration's '121f' is off-grid \u2014 engine snaps to 124; disclosed)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple, dense SDPA \u2014 arms differ in LoRA, steps, and shift: turbo-8 @ card 6/3 \u00b7 PDMD-4 @ 12/3 \u00b7 DMAD-4 (both critics) @ 12/2 audio (the DMAD card)",
   "audio_note": "both sides generated their own audio; the DMAD arms ride audio shift 2 vs the king's 3 \u2014 audition pairs/<id>_L/R.mp4",
   "board_prompt": "P2_3 \u2014 BASKET TOSS \u2014 three bases launch and catch a flyer",
   "prompt_focus": "designed stress: multi-body coordination \u2014 synchronized dip-launch-catch, a true apex, and the flyer's weight absorbed by bent knees."
  },
  "L": {
   "wall_s": 103.12,
   "sampling_s": 98.12,
   "peak_vram_mib": 24061,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -16.132,
    "treble_ratio": 0.001536,
    "spectral_centroid_hz": 1338.02
   }
  },
  "R": {
   "wall_s": 103.13,
   "sampling_s": 98.13,
   "peak_vram_mib": 23997,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -21.371,
    "treble_ratio": 0.001699,
    "spectral_centroid_hz": 1554.15
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p05": {
  "shared": {
   "set": "COMBINED",
   "date": "2026-10-06",
   "kind": "primary",
   "question": "The crown contest: at five seconds, same prompt, same seed, same graph family \u2014 does the 4-step adversarially-distilled challenger (a different solution to the same distillation problem) beat the freshly crowned 4-step projection king? Both arms at their own card recipes; brand-new scenes neither has seen.",
   "judge": "ONE call per side: the better shipping render of this 5-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full clip \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters \u2014 the two challengers were distilled with a different audio shift than the king).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 124,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "5.167 s (124f = 5+17*7; the registration's '121f' is off-grid \u2014 engine snaps to 124; disclosed)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple, dense SDPA \u2014 arms differ in LoRA, steps, and shift: turbo-8 @ card 6/3 \u00b7 PDMD-4 @ 12/3 \u00b7 DMAD-4 (both critics) @ 12/2 audio (the DMAD card)",
   "audio_note": "both sides generated their own audio; the DMAD arms ride audio shift 2 vs the king's 3 \u2014 audition pairs/<id>_L/R.mp4",
   "board_prompt": "P2_4 \u2014 AIRCRAFT \u2014 biplane barrel roll, formation camera",
   "prompt_focus": "designed stress: rolling-horizon coherence \u2014 the horizon rolls with the plane (not the camera), the shadow sweeps the cliff, gulls scatter."
  },
  "L": {
   "wall_s": 105.18,
   "sampling_s": 100.18,
   "peak_vram_mib": 23885,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -23.743,
    "treble_ratio": 0.000962,
    "spectral_centroid_hz": 1272.44
   }
  },
  "R": {
   "wall_s": 105.17,
   "sampling_s": 100.17,
   "peak_vram_mib": 23885,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -20.249,
    "treble_ratio": 0.002334,
    "spectral_centroid_hz": 1267.47
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p06": {
  "shared": {
   "set": "COMBINED",
   "date": "2026-10-06",
   "kind": "primary",
   "question": "The crown contest: at five seconds, same prompt, same seed, same graph family \u2014 does the 4-step adversarially-distilled challenger (a different solution to the same distillation problem) beat the freshly crowned 4-step projection king? Both arms at their own card recipes; brand-new scenes neither has seen.",
   "judge": "ONE call per side: the better shipping render of this 5-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full clip \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters \u2014 the two challengers were distilled with a different audio shift than the king).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 124,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "5.167 s (124f = 5+17*7; the registration's '121f' is off-grid \u2014 engine snaps to 124; disclosed)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple, dense SDPA \u2014 arms differ in LoRA, steps, and shift: turbo-8 @ card 6/3 \u00b7 PDMD-4 @ 12/3 \u00b7 DMAD-4 (both critics) @ 12/2 audio (the DMAD card)",
   "audio_note": "both sides generated their own audio; the DMAD arms ride audio shift 2 vs the king's 3 \u2014 audition pairs/<id>_L/R.mp4",
   "board_prompt": "P2_5 \u2014 FISH TANK \u2014 three dropped objects, sink/float physics",
   "prompt_focus": "designed stress: buoyancy/gravity physics \u2014 stone sinks, duck bobs back up, apple floats high; three distinct splash events, locked camera."
  },
  "L": {
   "wall_s": 102.1,
   "sampling_s": 97.1,
   "peak_vram_mib": 24061,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -24.022,
    "treble_ratio": 0.026465,
    "spectral_centroid_hz": 1878.27
   }
  },
  "R": {
   "wall_s": 102.1,
   "sampling_s": 97.1,
   "peak_vram_mib": 24061,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -26.042,
    "treble_ratio": 0.028524,
    "spectral_centroid_hz": 1801.88
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p07": {
  "shared": {
   "set": "COMBINED",
   "date": "2026-10-06",
   "kind": "primary",
   "question": "The crown contest: at five seconds, same prompt, same seed, same graph family \u2014 does the 4-step adversarially-distilled challenger (a different solution to the same distillation problem) beat the freshly crowned 4-step projection king? Both arms at their own card recipes; brand-new scenes neither has seen.",
   "judge": "ONE call per side: the better shipping render of this 5-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full clip \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters \u2014 the two challengers were distilled with a different audio shift than the king).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 124,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "5.167 s (124f = 5+17*7; the registration's '121f' is off-grid \u2014 engine snaps to 124; disclosed)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple, dense SDPA \u2014 arms differ in LoRA, steps, and shift: turbo-8 @ card 6/3 \u00b7 PDMD-4 @ 12/3 \u00b7 DMAD-4 (both critics) @ 12/2 audio (the DMAD card)",
   "audio_note": "both sides generated their own audio; the DMAD arms ride audio shift 2 vs the king's 3 \u2014 audition pairs/<id>_L/R.mp4",
   "board_prompt": "P2_6 \u2014 WET ROAD \u2014 rainy pull-away with reflections + a 00:06.5 cut",
   "prompt_focus": "designed stress: fidelity and lighting (wet reflections, taillight streaks, sodium streetlights) plus the hard cut as an instruction-following test."
  },
  "L": {
   "wall_s": 103.12,
   "sampling_s": 98.12,
   "peak_vram_mib": 23933,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -26.824,
    "treble_ratio": 0.000349,
    "spectral_centroid_hz": 1009.49
   }
  },
  "R": {
   "wall_s": 103.12,
   "sampling_s": 98.12,
   "peak_vram_mib": 23933,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -26.478,
    "treble_ratio": 0.001193,
    "spectral_centroid_hz": 1153.05
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p08": {
  "shared": {
   "set": "COMBINED",
   "date": "2026-10-06",
   "kind": "secondary",
   "question": "The engineering finding: two critic trainings of the SAME challenger \u2014 the paper's citable frozen-LoRA critic vs the fully-trained critic that scored higher on the authors' benchmark. Same recipe otherwise; which training renders better here?",
   "judge": "ONE call per side: the better shipping render of this 5-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full clip \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters \u2014 the two challengers were distilled with a different audio shift than the king).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 124,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "5.167 s (124f = 5+17*7; the registration's '121f' is off-grid \u2014 engine snaps to 124; disclosed)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple, dense SDPA \u2014 arms differ in LoRA, steps, and shift: turbo-8 @ card 6/3 \u00b7 PDMD-4 @ 12/3 \u00b7 DMAD-4 (both critics) @ 12/2 audio (the DMAD card)",
   "audio_note": "both sides generated their own audio; the DMAD arms ride audio shift 2 vs the king's 3 \u2014 audition pairs/<id>_L/R.mp4",
   "board_prompt": "P2_1 \u2014 CONTACT \u2014 two movers, heavy crate down a loading ramp",
   "prompt_focus": "designed stress: contact physics and carried weight \u2014 does the crate sag, slip, and settle like 40 kg of wood, and do the movers' bodies coordinate around it?"
  },
  "L": {
   "wall_s": 114.4,
   "sampling_s": 100.4,
   "peak_vram_mib": 23907,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -26.457,
    "treble_ratio": 0.008527,
    "spectral_centroid_hz": 1562.24
   }
  },
  "R": {
   "wall_s": 114.39,
   "sampling_s": 100.39,
   "peak_vram_mib": 23907,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -20.67,
    "treble_ratio": 0.001415,
    "spectral_centroid_hz": 1127.4
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p09": {
  "shared": {
   "set": "COMBINED",
   "date": "2026-10-06",
   "kind": "secondary",
   "question": "The engineering finding: two critic trainings of the SAME challenger \u2014 the paper's citable frozen-LoRA critic vs the fully-trained critic that scored higher on the authors' benchmark. Same recipe otherwise; which training renders better here?",
   "judge": "ONE call per side: the better shipping render of this 5-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full clip \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters \u2014 the two challengers were distilled with a different audio shift than the king).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 124,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "5.167 s (124f = 5+17*7; the registration's '121f' is off-grid \u2014 engine snaps to 124; disclosed)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple, dense SDPA \u2014 arms differ in LoRA, steps, and shift: turbo-8 @ card 6/3 \u00b7 PDMD-4 @ 12/3 \u00b7 DMAD-4 (both critics) @ 12/2 audio (the DMAD card)",
   "audio_note": "both sides generated their own audio; the DMAD arms ride audio shift 2 vs the king's 3 \u2014 audition pairs/<id>_L/R.mp4",
   "board_prompt": "P2_2 \u2014 GYMNASTICS \u2014 vault runway to stuck landing",
   "prompt_focus": "designed stress: full-body fast motion \u2014 a clean Yurchenko rotation, an opening before landing, and a mat that compresses on the stick."
  },
  "L": {
   "wall_s": 105.18,
   "sampling_s": 100.18,
   "peak_vram_mib": 24057,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -21.188,
    "treble_ratio": 0.002853,
    "spectral_centroid_hz": 1546.27
   }
  },
  "R": {
   "wall_s": 105.17,
   "sampling_s": 100.17,
   "peak_vram_mib": 23961,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -24.732,
    "treble_ratio": 0.002444,
    "spectral_centroid_hz": 1470.91
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p10": {
  "shared": {
   "set": "COMBINED",
   "date": "2026-10-06",
   "kind": "secondary",
   "question": "The engineering finding: two critic trainings of the SAME challenger \u2014 the paper's citable frozen-LoRA critic vs the fully-trained critic that scored higher on the authors' benchmark. Same recipe otherwise; which training renders better here?",
   "judge": "ONE call per side: the better shipping render of this 5-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full clip \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters \u2014 the two challengers were distilled with a different audio shift than the king).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 124,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "5.167 s (124f = 5+17*7; the registration's '121f' is off-grid \u2014 engine snaps to 124; disclosed)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple, dense SDPA \u2014 arms differ in LoRA, steps, and shift: turbo-8 @ card 6/3 \u00b7 PDMD-4 @ 12/3 \u00b7 DMAD-4 (both critics) @ 12/2 audio (the DMAD card)",
   "audio_note": "both sides generated their own audio; the DMAD arms ride audio shift 2 vs the king's 3 \u2014 audition pairs/<id>_L/R.mp4",
   "board_prompt": "P2_3 \u2014 BASKET TOSS \u2014 three bases launch and catch a flyer",
   "prompt_focus": "designed stress: multi-body coordination \u2014 synchronized dip-launch-catch, a true apex, and the flyer's weight absorbed by bent knees."
  },
  "L": {
   "wall_s": 103.12,
   "sampling_s": 98.12,
   "peak_vram_mib": 24061,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -14.981,
    "treble_ratio": 0.001555,
    "spectral_centroid_hz": 1418.28
   }
  },
  "R": {
   "wall_s": 103.12,
   "sampling_s": 98.12,
   "peak_vram_mib": 24061,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -16.132,
    "treble_ratio": 0.001536,
    "spectral_centroid_hz": 1338.02
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p11": {
  "shared": {
   "set": "COMBINED",
   "date": "2026-10-06",
   "kind": "secondary",
   "question": "The engineering finding: two critic trainings of the SAME challenger \u2014 the paper's citable frozen-LoRA critic vs the fully-trained critic that scored higher on the authors' benchmark. Same recipe otherwise; which training renders better here?",
   "judge": "ONE call per side: the better shipping render of this 5-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full clip \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters \u2014 the two challengers were distilled with a different audio shift than the king).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 124,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "5.167 s (124f = 5+17*7; the registration's '121f' is off-grid \u2014 engine snaps to 124; disclosed)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple, dense SDPA \u2014 arms differ in LoRA, steps, and shift: turbo-8 @ card 6/3 \u00b7 PDMD-4 @ 12/3 \u00b7 DMAD-4 (both critics) @ 12/2 audio (the DMAD card)",
   "audio_note": "both sides generated their own audio; the DMAD arms ride audio shift 2 vs the king's 3 \u2014 audition pairs/<id>_L/R.mp4",
   "board_prompt": "P2_4 \u2014 AIRCRAFT \u2014 biplane barrel roll, formation camera",
   "prompt_focus": "designed stress: rolling-horizon coherence \u2014 the horizon rolls with the plane (not the camera), the shadow sweeps the cliff, gulls scatter."
  },
  "L": {
   "wall_s": 105.17,
   "sampling_s": 100.17,
   "peak_vram_mib": 23885,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -20.249,
    "treble_ratio": 0.002334,
    "spectral_centroid_hz": 1267.47
   }
  },
  "R": {
   "wall_s": 105.17,
   "sampling_s": 100.17,
   "peak_vram_mib": 23933,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -17.293,
    "treble_ratio": 0.000821,
    "spectral_centroid_hz": 1090.31
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p12": {
  "shared": {
   "set": "COMBINED",
   "date": "2026-10-06",
   "kind": "secondary",
   "question": "The engineering finding: two critic trainings of the SAME challenger \u2014 the paper's citable frozen-LoRA critic vs the fully-trained critic that scored higher on the authors' benchmark. Same recipe otherwise; which training renders better here?",
   "judge": "ONE call per side: the better shipping render of this 5-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full clip \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters \u2014 the two challengers were distilled with a different audio shift than the king).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 124,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "5.167 s (124f = 5+17*7; the registration's '121f' is off-grid \u2014 engine snaps to 124; disclosed)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple, dense SDPA \u2014 arms differ in LoRA, steps, and shift: turbo-8 @ card 6/3 \u00b7 PDMD-4 @ 12/3 \u00b7 DMAD-4 (both critics) @ 12/2 audio (the DMAD card)",
   "audio_note": "both sides generated their own audio; the DMAD arms ride audio shift 2 vs the king's 3 \u2014 audition pairs/<id>_L/R.mp4",
   "board_prompt": "P2_5 \u2014 FISH TANK \u2014 three dropped objects, sink/float physics",
   "prompt_focus": "designed stress: buoyancy/gravity physics \u2014 stone sinks, duck bobs back up, apple floats high; three distinct splash events, locked camera."
  },
  "L": {
   "wall_s": 102.1,
   "sampling_s": 97.1,
   "peak_vram_mib": 24061,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -24.158,
    "treble_ratio": 0.060839,
    "spectral_centroid_hz": 2082.81
   }
  },
  "R": {
   "wall_s": 102.1,
   "sampling_s": 97.1,
   "peak_vram_mib": 24061,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -26.042,
    "treble_ratio": 0.028524,
    "spectral_centroid_hz": 1801.88
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p13": {
  "shared": {
   "set": "COMBINED",
   "date": "2026-10-06",
   "kind": "secondary",
   "question": "The engineering finding: two critic trainings of the SAME challenger \u2014 the paper's citable frozen-LoRA critic vs the fully-trained critic that scored higher on the authors' benchmark. Same recipe otherwise; which training renders better here?",
   "judge": "ONE call per side: the better shipping render of this 5-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full clip \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters \u2014 the two challengers were distilled with a different audio shift than the king).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 124,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "5.167 s (124f = 5+17*7; the registration's '121f' is off-grid \u2014 engine snaps to 124; disclosed)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple, dense SDPA \u2014 arms differ in LoRA, steps, and shift: turbo-8 @ card 6/3 \u00b7 PDMD-4 @ 12/3 \u00b7 DMAD-4 (both critics) @ 12/2 audio (the DMAD card)",
   "audio_note": "both sides generated their own audio; the DMAD arms ride audio shift 2 vs the king's 3 \u2014 audition pairs/<id>_L/R.mp4",
   "board_prompt": "P2_6 \u2014 WET ROAD \u2014 rainy pull-away with reflections + a 00:06.5 cut",
   "prompt_focus": "designed stress: fidelity and lighting (wet reflections, taillight streaks, sodium streetlights) plus the hard cut as an instruction-following test."
  },
  "L": {
   "wall_s": 103.13,
   "sampling_s": 98.13,
   "peak_vram_mib": 23933,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -20.731,
    "treble_ratio": 0.001393,
    "spectral_centroid_hz": 1202.16
   }
  },
  "R": {
   "wall_s": 103.12,
   "sampling_s": 98.12,
   "peak_vram_mib": 23933,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -26.478,
    "treble_ratio": 0.001193,
    "spectral_centroid_hz": 1153.05
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 }
};
