// gpu-review/setP2 — generation metadata (PAIRS-METADATA-SPEC.md + Amendment 7)
// question/judge/sides render always (they cannot unblind); per-side reveals post-call.
window.PAIR_META = {
 "p01": {
  "shared": {
   "set": "P2",
   "date": "2026-10-05",
   "kind": "null",
   "question": "The long-horizon confirmation: at TEN seconds and true HD \u2014 the first in-distribution length of the sprint \u2014 does the 4-step challenger (PDMD) still beat the 8-step turbo king now that the king finally runs at its own card recipe? Same prompt, same seed, both arms at their best settings, brand-new scenes neither has seen.",
   "judge": "ONE call per side: the better shipping render of this 10-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full 10 s \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION (objects and bodies obeying the scene's physics). Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 243,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "10.125 s \u2014 the batch's FIRST long-horizon, in-distribution test (Amendments 8/8b: every earlier verdict was 1.6 s AND below the 4 s request floor)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple \u2014 the arms differ in LoRA, steps, and shift: turbo-8 v1.0 768p @ its CARD 6/3 \u00b7 PDMD-4 v6 @ 1.0, 4 steps, 12/3, prompt passed verbatim (no trigger prefix)",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 312.57,
   "sampling_s": 298.57,
   "peak_vram_mib": 23911,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -29.573,
    "treble_ratio": 0.001759,
    "spectral_centroid_hz": 1345.34
   }
  },
  "R": {
   "wall_s": 306.6,
   "sampling_s": 292.6,
   "peak_vram_mib": 23911,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -29.573,
    "treble_ratio": 0.001759,
    "spectral_centroid_hz": 1345.34
   }
  },
  "note": "identical content expected \u2014 any flicker or divergence is a TOOLING BUG, report it"
 },
 "p02": {
  "shared": {
   "set": "P2",
   "date": "2026-10-05",
   "kind": "primary",
   "question": "The long-horizon confirmation: at TEN seconds and true HD \u2014 the first in-distribution length of the sprint \u2014 does the 4-step challenger (PDMD) still beat the 8-step turbo king now that the king finally runs at its own card recipe? Same prompt, same seed, both arms at their best settings, brand-new scenes neither has seen.",
   "judge": "ONE call per side: the better shipping render of this 10-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full 10 s \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION (objects and bodies obeying the scene's physics). Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 243,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "10.125 s \u2014 the batch's FIRST long-horizon, in-distribution test (Amendments 8/8b: every earlier verdict was 1.6 s AND below the 4 s request floor)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple \u2014 the arms differ in LoRA, steps, and shift: turbo-8 v1.0 768p @ its CARD 6/3 \u00b7 PDMD-4 v6 @ 1.0, 4 steps, 12/3, prompt passed verbatim (no trigger prefix)",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)",
   "board_prompt": "P2_1 \u2014 CONTACT \u2014 two movers, heavy crate down a loading ramp",
   "prompt_focus": "designed stress: contact physics and carried weight \u2014 does the crate sag, slip, and settle like 40 kg of wood, and do the movers' bodies coordinate around it?"
  },
  "L": {
   "wall_s": 306.6,
   "sampling_s": 292.6,
   "peak_vram_mib": 23911,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -29.573,
    "treble_ratio": 0.001759,
    "spectral_centroid_hz": 1345.34
   }
  },
  "R": {
   "wall_s": 546.65,
   "sampling_s": 531.65,
   "peak_vram_mib": 23913,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -32.587,
    "treble_ratio": 0.120036,
    "spectral_centroid_hz": 2880.95
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p03": {
  "shared": {
   "set": "P2",
   "date": "2026-10-05",
   "kind": "primary",
   "question": "The long-horizon confirmation: at TEN seconds and true HD \u2014 the first in-distribution length of the sprint \u2014 does the 4-step challenger (PDMD) still beat the 8-step turbo king now that the king finally runs at its own card recipe? Same prompt, same seed, both arms at their best settings, brand-new scenes neither has seen.",
   "judge": "ONE call per side: the better shipping render of this 10-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full 10 s \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION (objects and bodies obeying the scene's physics). Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 243,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "10.125 s \u2014 the batch's FIRST long-horizon, in-distribution test (Amendments 8/8b: every earlier verdict was 1.6 s AND below the 4 s request floor)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple \u2014 the arms differ in LoRA, steps, and shift: turbo-8 v1.0 768p @ its CARD 6/3 \u00b7 PDMD-4 v6 @ 1.0, 4 steps, 12/3, prompt passed verbatim (no trigger prefix)",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)",
   "board_prompt": "P2_2 \u2014 GYMNASTICS \u2014 vault runway to stuck landing",
   "prompt_focus": "designed stress: full-body fast motion \u2014 a clean Yurchenko rotation, an opening before landing, and a mat that compresses on the stick."
  },
  "L": {
   "wall_s": 537.18,
   "sampling_s": 531.18,
   "peak_vram_mib": 24149,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -31.06,
    "treble_ratio": 0.012518,
    "spectral_centroid_hz": 1993.09
   }
  },
  "R": {
   "wall_s": 296.18,
   "sampling_s": 290.18,
   "peak_vram_mib": 24149,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -26.395,
    "treble_ratio": 0.002412,
    "spectral_centroid_hz": 1519.03
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p04": {
  "shared": {
   "set": "P2",
   "date": "2026-10-05",
   "kind": "primary",
   "question": "The long-horizon confirmation: at TEN seconds and true HD \u2014 the first in-distribution length of the sprint \u2014 does the 4-step challenger (PDMD) still beat the 8-step turbo king now that the king finally runs at its own card recipe? Same prompt, same seed, both arms at their best settings, brand-new scenes neither has seen.",
   "judge": "ONE call per side: the better shipping render of this 10-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full 10 s \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION (objects and bodies obeying the scene's physics). Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 243,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "10.125 s \u2014 the batch's FIRST long-horizon, in-distribution test (Amendments 8/8b: every earlier verdict was 1.6 s AND below the 4 s request floor)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple \u2014 the arms differ in LoRA, steps, and shift: turbo-8 v1.0 768p @ its CARD 6/3 \u00b7 PDMD-4 v6 @ 1.0, 4 steps, 12/3, prompt passed verbatim (no trigger prefix)",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)",
   "board_prompt": "P2_3 \u2014 BASKET TOSS \u2014 three bases launch and catch a flyer",
   "prompt_focus": "designed stress: multi-body coordination \u2014 synchronized dip-launch-catch, a true apex, and the flyer's weight absorbed by bent knees."
  },
  "L": {
   "wall_s": 295.1,
   "sampling_s": 290.1,
   "peak_vram_mib": 24153,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -21.793,
    "treble_ratio": 0.001691,
    "spectral_centroid_hz": 1540.83
   }
  },
  "R": {
   "wall_s": 532.34,
   "sampling_s": 526.33,
   "peak_vram_mib": 24121,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -26.294,
    "treble_ratio": 0.016852,
    "spectral_centroid_hz": 2194.83
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p05": {
  "shared": {
   "set": "P2",
   "date": "2026-10-05",
   "kind": "primary",
   "question": "The long-horizon confirmation: at TEN seconds and true HD \u2014 the first in-distribution length of the sprint \u2014 does the 4-step challenger (PDMD) still beat the 8-step turbo king now that the king finally runs at its own card recipe? Same prompt, same seed, both arms at their best settings, brand-new scenes neither has seen.",
   "judge": "ONE call per side: the better shipping render of this 10-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full 10 s \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION (objects and bodies obeying the scene's physics). Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 243,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "10.125 s \u2014 the batch's FIRST long-horizon, in-distribution test (Amendments 8/8b: every earlier verdict was 1.6 s AND below the 4 s request floor)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple \u2014 the arms differ in LoRA, steps, and shift: turbo-8 v1.0 768p @ its CARD 6/3 \u00b7 PDMD-4 v6 @ 1.0, 4 steps, 12/3, prompt passed verbatim (no trigger prefix)",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)",
   "board_prompt": "P2_4 \u2014 AIRCRAFT \u2014 biplane barrel roll, formation camera",
   "prompt_focus": "designed stress: rolling-horizon coherence \u2014 the horizon rolls with the plane (not the camera), the shadow sweeps the cliff, gulls scatter."
  },
  "L": {
   "wall_s": 533.25,
   "sampling_s": 527.25,
   "peak_vram_mib": 23905,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -26.399,
    "treble_ratio": 0.005525,
    "spectral_centroid_hz": 1593.44
   }
  },
  "R": {
   "wall_s": 294.08,
   "sampling_s": 289.08,
   "peak_vram_mib": 24153,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -23.026,
    "treble_ratio": 0.000548,
    "spectral_centroid_hz": 1091.84
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p06": {
  "shared": {
   "set": "P2",
   "date": "2026-10-05",
   "kind": "primary",
   "question": "The long-horizon confirmation: at TEN seconds and true HD \u2014 the first in-distribution length of the sprint \u2014 does the 4-step challenger (PDMD) still beat the 8-step turbo king now that the king finally runs at its own card recipe? Same prompt, same seed, both arms at their best settings, brand-new scenes neither has seen.",
   "judge": "ONE call per side: the better shipping render of this 10-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full 10 s \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION (objects and bodies obeying the scene's physics). Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 243,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "10.125 s \u2014 the batch's FIRST long-horizon, in-distribution test (Amendments 8/8b: every earlier verdict was 1.6 s AND below the 4 s request floor)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple \u2014 the arms differ in LoRA, steps, and shift: turbo-8 v1.0 768p @ its CARD 6/3 \u00b7 PDMD-4 v6 @ 1.0, 4 steps, 12/3, prompt passed verbatim (no trigger prefix)",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)",
   "board_prompt": "P2_5 \u2014 FISH TANK \u2014 three dropped objects, sink/float physics",
   "prompt_focus": "designed stress: buoyancy/gravity physics \u2014 stone sinks, duck bobs back up, apple floats high; three distinct splash events, locked camera."
  },
  "L": {
   "wall_s": 295.12,
   "sampling_s": 289.12,
   "peak_vram_mib": 23993,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -38.517,
    "treble_ratio": 0.024389,
    "spectral_centroid_hz": 2155.37
   }
  },
  "R": {
   "wall_s": 532.25,
   "sampling_s": 526.25,
   "peak_vram_mib": 24057,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -48.32,
    "treble_ratio": 0.213804,
    "spectral_centroid_hz": 3430.87
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p07": {
  "shared": {
   "set": "P2",
   "date": "2026-10-05",
   "kind": "primary",
   "question": "The long-horizon confirmation: at TEN seconds and true HD \u2014 the first in-distribution length of the sprint \u2014 does the 4-step challenger (PDMD) still beat the 8-step turbo king now that the king finally runs at its own card recipe? Same prompt, same seed, both arms at their best settings, brand-new scenes neither has seen.",
   "judge": "ONE call per side: the better shipping render of this 10-second scene. Weigh the six judging axes \u2014 AESTHETICS \u00b7 COHERENCY over the full 10 s \u00b7 INSTRUCTION-FOLLOWING under complexity (every clause of the prompt) \u00b7 FIDELITY \u00b7 LIGHTING \u00b7 PHYSICS/GRAVITY/MOTION (objects and bodies obeying the scene's physics). Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "frames": 243,
   "fps": 24,
   "seed": 421337,
   "canvas": "1088x608",
   "duration_note": "10.125 s \u2014 the batch's FIRST long-horizon, in-distribution test (Amendments 8/8b: every earlier verdict was 1.6 s AND below the 4 s request floor)",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG, MiniMaxH3TurboSampler (Euler)+simple \u2014 the arms differ in LoRA, steps, and shift: turbo-8 v1.0 768p @ its CARD 6/3 \u00b7 PDMD-4 v6 @ 1.0, 4 steps, 12/3, prompt passed verbatim (no trigger prefix)",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)",
   "board_prompt": "P2_6 \u2014 WET ROAD \u2014 rainy pull-away with reflections + a 00:06.5 cut",
   "prompt_focus": "designed stress: fidelity and lighting (wet reflections, taillight streaks, sodium streetlights) plus the 00:06.5 hard cut as an instruction-following test at length."
  },
  "L": {
   "wall_s": 533.42,
   "sampling_s": 528.42,
   "peak_vram_mib": 23929,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -24.597,
    "treble_ratio": 0.027882,
    "spectral_centroid_hz": 2052.27
   }
  },
  "R": {
   "wall_s": 296.09,
   "sampling_s": 290.09,
   "peak_vram_mib": 24121,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -19.445,
    "treble_ratio": 0.000349,
    "spectral_centroid_hz": 977.65
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 }
};
