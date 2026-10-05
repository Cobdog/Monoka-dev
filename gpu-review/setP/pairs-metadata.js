// gpu-review/setP — generation metadata (PAIRS-METADATA-SPEC.md + Amendment 7)
// question/judge/sides render always (they cannot unblind); per-side reveals post-call.
window.PAIR_META = {
 "p01": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "null",
   "question": "The displacement question: a 4-network-step challenger (PDMD distill) vs our 8-step turbo speed king \u2014 same prompt, same seed, same everything else. If the challenger holds up here, it halves the cost of the fast lane.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B2_med \u2014 woman stirring soup, slow push-in (rich board prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 24.53,
   "sampling_s": 18.53,
   "peak_vram_mib": 24153,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -38.705,
    "treble_ratio": 0.000508,
    "spectral_centroid_hz": 956.18
   }
  },
  "R": {
   "wall_s": 24.52,
   "sampling_s": 19.52,
   "peak_vram_mib": 24149,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -38.705,
    "treble_ratio": 0.000508,
    "spectral_centroid_hz": 956.18
   }
  },
  "note": "identical content expected \u2014 any flicker or divergence is a TOOLING BUG, report it"
 },
 "p02": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "primary",
   "question": "The displacement question: a 4-network-step challenger (PDMD distill) vs our 8-step turbo speed king \u2014 same prompt, same seed, same everything else. If the challenger holds up here, it halves the cost of the fast lane.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B1_low \u2014 ball, slow short roll (rich board prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 42.95,
   "sampling_s": 25.95,
   "peak_vram_mib": 23895,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -39.188,
    "treble_ratio": 0.000392,
    "spectral_centroid_hz": 676.8
   }
  },
  "R": {
   "wall_s": 46.02,
   "sampling_s": 40.02,
   "peak_vram_mib": 24149,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -53.108,
    "treble_ratio": 0.000293,
    "spectral_centroid_hz": 583.59
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p03": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "primary",
   "question": "The displacement question: a 4-network-step challenger (PDMD distill) vs our 8-step turbo speed king \u2014 same prompt, same seed, same everything else. If the challenger holds up here, it halves the cost of the fast lane.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B2_med \u2014 woman stirring soup, slow push-in (rich board prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 24.52,
   "sampling_s": 19.52,
   "peak_vram_mib": 24149,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -38.705,
    "treble_ratio": 0.000508,
    "spectral_centroid_hz": 956.18
   }
  },
  "R": {
   "wall_s": 33.74,
   "sampling_s": 28.74,
   "peak_vram_mib": 24153,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -41.346,
    "treble_ratio": 0.003551,
    "spectral_centroid_hz": 1449.98
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p04": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "primary",
   "question": "The displacement question: a 4-network-step challenger (PDMD distill) vs our 8-step turbo speed king \u2014 same prompt, same seed, same everything else. If the challenger holds up here, it halves the cost of the fast lane.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B3_high \u2014 ball, brisk full-width roll (rich board prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 24.52,
   "sampling_s": 18.52,
   "peak_vram_mib": 24089,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -38.082,
    "treble_ratio": 5.2e-05,
    "spectral_centroid_hz": 521.11
   }
  },
  "R": {
   "wall_s": 33.7,
   "sampling_s": 28.7,
   "peak_vram_mib": 24153,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -47.693,
    "treble_ratio": 3.8e-05,
    "spectral_centroid_hz": 409.3
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p05": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "primary",
   "question": "The displacement question: a 4-network-step challenger (PDMD distill) vs our 8-step turbo speed king \u2014 same prompt, same seed, same everything else. If the challenger holds up here, it halves the cost of the fast lane.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B4_naive_low \u2014 ball, slow roll (bare one-liner prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 33.72,
   "sampling_s": 27.72,
   "peak_vram_mib": 23929,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -39.15,
    "treble_ratio": 5.7e-05,
    "spectral_centroid_hz": 599.18
   }
  },
  "R": {
   "wall_s": 21.45,
   "sampling_s": 16.45,
   "peak_vram_mib": 24089,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -28.772,
    "treble_ratio": 0.012767,
    "spectral_centroid_hz": 1146.67
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p06": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "primary",
   "question": "The displacement question: a 4-network-step challenger (PDMD distill) vs our 8-step turbo speed king \u2014 same prompt, same seed, same everything else. If the challenger holds up here, it halves the cost of the fast lane.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B5_naive_med \u2014 woman stirring soup (bare one-liner prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 33.74,
   "sampling_s": 27.74,
   "peak_vram_mib": 24121,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -16.444,
    "treble_ratio": 0.043426,
    "spectral_centroid_hz": 1530.03
   }
  },
  "R": {
   "wall_s": 24.53,
   "sampling_s": 18.53,
   "peak_vram_mib": 24153,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -13.254,
    "treble_ratio": 0.050026,
    "spectral_centroid_hz": 1581.73
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p07": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "primary",
   "question": "The displacement question: a 4-network-step challenger (PDMD distill) vs our 8-step turbo speed king \u2014 same prompt, same seed, same everything else. If the challenger holds up here, it halves the cost of the fast lane.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B6_naive_high \u2014 ball, brisk roll (bare one-liner prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 24.52,
   "sampling_s": 19.52,
   "peak_vram_mib": 23881,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -27.389,
    "treble_ratio": 0.003141,
    "spectral_centroid_hz": 1022.31
   }
  },
  "R": {
   "wall_s": 33.74,
   "sampling_s": 28.74,
   "peak_vram_mib": 24089,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -30.998,
    "treble_ratio": 8.4e-05,
    "spectral_centroid_hz": 488.87
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p08": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "secondary",
   "question": "Attribution: both sides are 4-step renders. One is the PDMD distill, the other the official 4-step turbo. Any quality gap you see isolates PDMD-the-method from just running 4 steps.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B1_low \u2014 ball, slow short roll (rich board prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 46.03,
   "sampling_s": 29.03,
   "peak_vram_mib": 23903,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -43.815,
    "treble_ratio": 0.000279,
    "spectral_centroid_hz": 466.2
   }
  },
  "R": {
   "wall_s": 42.95,
   "sampling_s": 25.95,
   "peak_vram_mib": 23895,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -39.188,
    "treble_ratio": 0.000392,
    "spectral_centroid_hz": 676.8
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p09": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "secondary",
   "question": "Attribution: both sides are 4-step renders. One is the PDMD distill, the other the official 4-step turbo. Any quality gap you see isolates PDMD-the-method from just running 4 steps.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B2_med \u2014 woman stirring soup, slow push-in (rich board prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 24.53,
   "sampling_s": 18.53,
   "peak_vram_mib": 24149,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -36.247,
    "treble_ratio": 0.000788,
    "spectral_centroid_hz": 983.16
   }
  },
  "R": {
   "wall_s": 24.52,
   "sampling_s": 19.52,
   "peak_vram_mib": 24149,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -38.705,
    "treble_ratio": 0.000508,
    "spectral_centroid_hz": 956.18
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p10": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "secondary",
   "question": "Attribution: both sides are 4-step renders. One is the PDMD distill, the other the official 4-step turbo. Any quality gap you see isolates PDMD-the-method from just running 4 steps.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B3_high \u2014 ball, brisk full-width roll (rich board prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 24.52,
   "sampling_s": 18.52,
   "peak_vram_mib": 24089,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -38.082,
    "treble_ratio": 5.2e-05,
    "spectral_centroid_hz": 521.11
   }
  },
  "R": {
   "wall_s": 24.53,
   "sampling_s": 18.53,
   "peak_vram_mib": 23913,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -38.365,
    "treble_ratio": 1.2e-05,
    "spectral_centroid_hz": 315.26
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p11": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "secondary",
   "question": "Attribution: both sides are 4-step renders. One is the PDMD distill, the other the official 4-step turbo. Any quality gap you see isolates PDMD-the-method from just running 4 steps.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B4_naive_low \u2014 ball, slow roll (bare one-liner prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 21.45,
   "sampling_s": 16.45,
   "peak_vram_mib": 24089,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -28.772,
    "treble_ratio": 0.012767,
    "spectral_centroid_hz": 1146.67
   }
  },
  "R": {
   "wall_s": 24.53,
   "sampling_s": 18.53,
   "peak_vram_mib": 23929,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -28.431,
    "treble_ratio": 8e-06,
    "spectral_centroid_hz": 421.8
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p12": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "secondary",
   "question": "Attribution: both sides are 4-step renders. One is the PDMD distill, the other the official 4-step turbo. Any quality gap you see isolates PDMD-the-method from just running 4 steps.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B5_naive_med \u2014 woman stirring soup (bare one-liner prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 24.53,
   "sampling_s": 19.53,
   "peak_vram_mib": 23993,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -11.604,
    "treble_ratio": 0.054071,
    "spectral_centroid_hz": 1547.36
   }
  },
  "R": {
   "wall_s": 24.53,
   "sampling_s": 18.53,
   "peak_vram_mib": 24153,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -13.254,
    "treble_ratio": 0.050026,
    "spectral_centroid_hz": 1581.73
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p13": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "secondary",
   "question": "Attribution: both sides are 4-step renders. One is the PDMD distill, the other the official 4-step turbo. Any quality gap you see isolates PDMD-the-method from just running 4 steps.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B6_naive_high \u2014 ball, brisk roll (bare one-liner prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 24.52,
   "sampling_s": 19.52,
   "peak_vram_mib": 23881,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -27.389,
    "treble_ratio": 0.003141,
    "spectral_centroid_hz": 1022.31
   }
  },
  "R": {
   "wall_s": 24.53,
   "sampling_s": 19.53,
   "peak_vram_mib": 23897,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -30.724,
    "treble_ratio": 1e-06,
    "spectral_centroid_hz": 206.62
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p14": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "context",
   "question": "Cost of the regime on the incumbent's own line: the official 4-step turbo vs its 8-step parent \u2014 what does halving the steps cost when the method stays the same?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B1_low \u2014 ball, slow short roll (rich board prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 46.02,
   "sampling_s": 40.02,
   "peak_vram_mib": 24149,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -53.108,
    "treble_ratio": 0.000293,
    "spectral_centroid_hz": 583.59
   }
  },
  "R": {
   "wall_s": 46.03,
   "sampling_s": 29.03,
   "peak_vram_mib": 23903,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -43.815,
    "treble_ratio": 0.000279,
    "spectral_centroid_hz": 466.2
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p15": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "context",
   "question": "Cost of the regime on the incumbent's own line: the official 4-step turbo vs its 8-step parent \u2014 what does halving the steps cost when the method stays the same?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B2_med \u2014 woman stirring soup, slow push-in (rich board prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 24.53,
   "sampling_s": 18.53,
   "peak_vram_mib": 24149,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -36.247,
    "treble_ratio": 0.000788,
    "spectral_centroid_hz": 983.16
   }
  },
  "R": {
   "wall_s": 33.74,
   "sampling_s": 28.74,
   "peak_vram_mib": 24153,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -41.346,
    "treble_ratio": 0.003551,
    "spectral_centroid_hz": 1449.98
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p16": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "context",
   "question": "Cost of the regime on the incumbent's own line: the official 4-step turbo vs its 8-step parent \u2014 what does halving the steps cost when the method stays the same?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B3_high \u2014 ball, brisk full-width roll (rich board prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 33.7,
   "sampling_s": 28.7,
   "peak_vram_mib": 24153,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -47.693,
    "treble_ratio": 3.8e-05,
    "spectral_centroid_hz": 409.3
   }
  },
  "R": {
   "wall_s": 24.53,
   "sampling_s": 18.53,
   "peak_vram_mib": 23913,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -38.365,
    "treble_ratio": 1.2e-05,
    "spectral_centroid_hz": 315.26
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p17": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "context",
   "question": "Cost of the regime on the incumbent's own line: the official 4-step turbo vs its 8-step parent \u2014 what does halving the steps cost when the method stays the same?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B4_naive_low \u2014 ball, slow roll (bare one-liner prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 24.53,
   "sampling_s": 18.53,
   "peak_vram_mib": 23929,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -28.431,
    "treble_ratio": 8e-06,
    "spectral_centroid_hz": 421.8
   }
  },
  "R": {
   "wall_s": 33.72,
   "sampling_s": 27.72,
   "peak_vram_mib": 23929,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -39.15,
    "treble_ratio": 5.7e-05,
    "spectral_centroid_hz": 599.18
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p18": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "context",
   "question": "Cost of the regime on the incumbent's own line: the official 4-step turbo vs its 8-step parent \u2014 what does halving the steps cost when the method stays the same?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B5_naive_med \u2014 woman stirring soup (bare one-liner prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 33.74,
   "sampling_s": 27.74,
   "peak_vram_mib": 24121,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -16.444,
    "treble_ratio": 0.043426,
    "spectral_centroid_hz": 1530.03
   }
  },
  "R": {
   "wall_s": 24.53,
   "sampling_s": 19.53,
   "peak_vram_mib": 23993,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -11.604,
    "treble_ratio": 0.054071,
    "spectral_centroid_hz": 1547.36
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p19": {
  "shared": {
   "set": "P",
   "date": "2026-10-04",
   "kind": "context",
   "question": "Cost of the regime on the incumbent's own line: the official 4-step turbo vs its 8-step parent \u2014 what does halving the steps cost when the method stays the same?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "B6_naive_high \u2014 ball, brisk roll (bare one-liner prompt)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, shift 12/3, no CFG, MiniMaxH3TurboSampler (Euler) \u2014 LoRA + step count are the only arms",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 24.53,
   "sampling_s": 19.53,
   "peak_vram_mib": 23897,
   "nfe": 4,
   "audio_preview": {
    "rms_dbfs": -30.724,
    "treble_ratio": 1e-06,
    "spectral_centroid_hz": 206.62
   }
  },
  "R": {
   "wall_s": 33.74,
   "sampling_s": 28.74,
   "peak_vram_mib": 24089,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -30.998,
    "treble_ratio": 8.4e-05,
    "spectral_centroid_hz": 488.87
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 }
};
