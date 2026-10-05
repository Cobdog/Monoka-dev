// gpu-review/setE — generation metadata (PAIRS-METADATA-SPEC.md + Amendment 7)
// question/judge/sides render always (they cannot unblind); per-side reveals post-call.
window.PAIR_META = {
 "p01": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "null",
   "question": "The staged handoff: same total cost (11 denoising steps each side). One side starts on the full base model and hands its mid-run state over to the fast turbo model; the other runs the fast turbo model the whole way with its 11 steps spread differently (its top noise segment subdivided). Which renders the prompt better?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P2_med \u2014 woman stirring soup, slow push-in (the face/audio cell)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 39.83,
   "sampling_s": 34.83,
   "peak_vram_mib": 24165,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -44.025,
    "treble_ratio": 0.002667,
    "spectral_centroid_hz": 1884.59
   }
  },
  "R": {
   "wall_s": 49.04,
   "sampling_s": 43.04,
   "peak_vram_mib": 24149,
   "nfe": 11
  },
  "note": "identical content expected \u2014 any flicker or divergence is a TOOLING BUG, report it"
 },
 "p02": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "primary",
   "question": "The staged handoff: same total cost (11 denoising steps each side). One side starts on the full base model and hands its mid-run state over to the fast turbo model; the other runs the fast turbo model the whole way with its 11 steps spread differently (its top noise segment subdivided). Which renders the prompt better?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P1_low \u2014 red ball, slow short roll (low motion)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 39.83,
   "sampling_s": 33.83,
   "peak_vram_mib": 24153,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -49.121,
    "treble_ratio": 0.000709,
    "spectral_centroid_hz": 851.3
   }
  },
  "R": {
   "wall_s": 55.19,
   "sampling_s": 41.19,
   "peak_vram_mib": 24069,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -48.413,
    "treble_ratio": 0.031475,
    "spectral_centroid_hz": 1728.6
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p03": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "primary",
   "question": "The staged handoff: same total cost (11 denoising steps each side). One side starts on the full base model and hands its mid-run state over to the fast turbo model; the other runs the fast turbo model the whole way with its 11 steps spread differently (its top noise segment subdivided). Which renders the prompt better?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P2_med \u2014 woman stirring soup, slow push-in (the face/audio cell)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 39.83,
   "sampling_s": 34.83,
   "peak_vram_mib": 24165,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -44.025,
    "treble_ratio": 0.002667,
    "spectral_centroid_hz": 1884.59
   }
  },
  "R": {
   "wall_s": 39.83,
   "sampling_s": 34.83,
   "peak_vram_mib": 24153,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -39.838,
    "treble_ratio": 0.002931,
    "spectral_centroid_hz": 1262.52
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p04": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "primary",
   "question": "The staged handoff: same total cost (11 denoising steps each side). One side starts on the full base model and hands its mid-run state over to the fast turbo model; the other runs the fast turbo model the whole way with its 11 steps spread differently (its top noise segment subdivided). Which renders the prompt better?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P3_high \u2014 red ball, brisk full-width traverse (high motion)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 39.83,
   "sampling_s": 33.83,
   "peak_vram_mib": 24153,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -43.641,
    "treble_ratio": 1.9e-05,
    "spectral_centroid_hz": 378.13
   }
  },
  "R": {
   "wall_s": 39.83,
   "sampling_s": 34.83,
   "peak_vram_mib": 24165,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -43.592,
    "treble_ratio": 0.005568,
    "spectral_centroid_hz": 1082.76
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p05": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "ceiling",
   "question": "What the shortcut gives up: the staged 11-step handoff vs the full 20-step base-model run (our quality ceiling for this prompt) \u2014 judge the SIZE of the quality gap.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P1_low \u2014 red ball, slow short roll (low motion)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 66.45,
   "sampling_s": 60.45,
   "peak_vram_mib": 24149,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -43.631,
    "treble_ratio": 0.000492,
    "spectral_centroid_hz": 699.1
   }
  },
  "R": {
   "wall_s": 55.19,
   "sampling_s": 41.19,
   "peak_vram_mib": 24069,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -48.413,
    "treble_ratio": 0.031475,
    "spectral_centroid_hz": 1728.6
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p06": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "ceiling",
   "question": "What the shortcut gives up: the staged 11-step handoff vs the full 20-step base-model run (our quality ceiling for this prompt) \u2014 judge the SIZE of the quality gap.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P2_med \u2014 woman stirring soup, slow push-in (the face/audio cell)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 60.28,
   "sampling_s": 54.28,
   "peak_vram_mib": 24153,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -25.805,
    "treble_ratio": 0.000335,
    "spectral_centroid_hz": 737.47
   }
  },
  "R": {
   "wall_s": 39.83,
   "sampling_s": 34.83,
   "peak_vram_mib": 24165,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -44.025,
    "treble_ratio": 0.002667,
    "spectral_centroid_hz": 1884.59
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p07": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "ceiling",
   "question": "What the shortcut gives up: the staged 11-step handoff vs the full 20-step base-model run (our quality ceiling for this prompt) \u2014 judge the SIZE of the quality gap.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P3_high \u2014 red ball, brisk full-width traverse (high motion)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 39.83,
   "sampling_s": 34.83,
   "peak_vram_mib": 24165,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -43.592,
    "treble_ratio": 0.005568,
    "spectral_centroid_hz": 1082.76
   }
  },
  "R": {
   "wall_s": 60.25,
   "sampling_s": 55.25,
   "peak_vram_mib": 23945,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -34.923,
    "treble_ratio": 1.3e-05,
    "spectral_centroid_hz": 314.93
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p08": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "mach-base",
   "question": "Machinery check, same model throughout: a continuous 20-step run vs the same run split into two stages (5+15) through the exact handoff machinery. NOT identical by design (the split provably nudges the trajectory) \u2014 judge only whether the split side shows a real QUALITY drop (broken structure, artifacts, garbled audio). A clear drop = the machinery failing, not a preference.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P1_low \u2014 red ball, slow short roll (low motion)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 54.13,
   "sampling_s": 53.13,
   "peak_vram_mib": 24101,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -44.072,
    "treble_ratio": 0.000496,
    "spectral_centroid_hz": 704.14
   }
  },
  "R": {
   "wall_s": 66.45,
   "sampling_s": 60.45,
   "peak_vram_mib": 24149,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -43.631,
    "treble_ratio": 0.000492,
    "spectral_centroid_hz": 699.1
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p09": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "mach-base",
   "question": "Machinery check, same model throughout: a continuous 20-step run vs the same run split into two stages (5+15) through the exact handoff machinery. NOT identical by design (the split provably nudges the trajectory) \u2014 judge only whether the split side shows a real QUALITY drop (broken structure, artifacts, garbled audio). A clear drop = the machinery failing, not a preference.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P2_med \u2014 woman stirring soup, slow push-in (the face/audio cell)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 60.28,
   "sampling_s": 54.28,
   "peak_vram_mib": 24153,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -25.805,
    "treble_ratio": 0.000335,
    "spectral_centroid_hz": 737.47
   }
  },
  "R": {
   "wall_s": 60.25,
   "sampling_s": 55.25,
   "peak_vram_mib": 24165,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -26.913,
    "treble_ratio": 0.000334,
    "spectral_centroid_hz": 753.23
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p10": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "mach-base",
   "question": "Machinery check, same model throughout: a continuous 20-step run vs the same run split into two stages (5+15) through the exact handoff machinery. NOT identical by design (the split provably nudges the trajectory) \u2014 judge only whether the split side shows a real QUALITY drop (broken structure, artifacts, garbled audio). A clear drop = the machinery failing, not a preference.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P3_high \u2014 red ball, brisk full-width traverse (high motion)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 60.26,
   "sampling_s": 54.25,
   "peak_vram_mib": 24149,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -35.824,
    "treble_ratio": 1.6e-05,
    "spectral_centroid_hz": 318.87
   }
  },
  "R": {
   "wall_s": 60.25,
   "sampling_s": 55.25,
   "peak_vram_mib": 23945,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -34.923,
    "treble_ratio": 1.3e-05,
    "spectral_centroid_hz": 314.93
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p11": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "mach-turbo",
   "question": "Machinery check inside the fast family: the turbo model's 11-step run vs the same steps split 5+6 through the handoff machinery. Same rule: near-tie expected; a real quality drop = the machinery failing.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P1_low \u2014 red ball, slow short roll (low motion)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 39.83,
   "sampling_s": 33.83,
   "peak_vram_mib": 24153,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -49.121,
    "treble_ratio": 0.000709,
    "spectral_centroid_hz": 851.3
   }
  },
  "R": {
   "wall_s": 39.83,
   "sampling_s": 33.83,
   "peak_vram_mib": 24153,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -48.482,
    "treble_ratio": 0.000742,
    "spectral_centroid_hz": 856.43
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p12": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "mach-turbo",
   "question": "Machinery check inside the fast family: the turbo model's 11-step run vs the same steps split 5+6 through the handoff machinery. Same rule: near-tie expected; a real quality drop = the machinery failing.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P2_med \u2014 woman stirring soup, slow push-in (the face/audio cell)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 39.83,
   "sampling_s": 34.83,
   "peak_vram_mib": 24089,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -39.582,
    "treble_ratio": 0.002738,
    "spectral_centroid_hz": 1258.57
   }
  },
  "R": {
   "wall_s": 39.83,
   "sampling_s": 34.83,
   "peak_vram_mib": 24153,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -39.838,
    "treble_ratio": 0.002931,
    "spectral_centroid_hz": 1262.52
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p13": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "mach-turbo",
   "question": "Machinery check inside the fast family: the turbo model's 11-step run vs the same steps split 5+6 through the handoff machinery. Same rule: near-tie expected; a real quality drop = the machinery failing.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P3_high \u2014 red ball, brisk full-width traverse (high motion)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 39.83,
   "sampling_s": 33.83,
   "peak_vram_mib": 24153,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -43.641,
    "treble_ratio": 1.9e-05,
    "spectral_centroid_hz": 378.13
   }
  },
  "R": {
   "wall_s": 39.83,
   "sampling_s": 34.83,
   "peak_vram_mib": 24153,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -43.241,
    "treble_ratio": 2.1e-05,
    "spectral_centroid_hz": 380.6
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p14": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "stress",
   "question": "Handoff depth: hand over EARLY (t=0.5, the state is noisier and the noise-label mismatch is 2.6x larger, 14 total steps) vs LATE (t=0.75, 11 steps). Which staged render is better?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P1_low \u2014 red ball, slow short roll (low motion)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 55.19,
   "sampling_s": 41.19,
   "peak_vram_mib": 24069,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -48.413,
    "treble_ratio": 0.031475,
    "spectral_centroid_hz": 1728.6
   }
  },
  "R": {
   "wall_s": 49.03,
   "sampling_s": 43.03,
   "peak_vram_mib": 24165,
   "nfe": 14,
   "audio_preview": {
    "rms_dbfs": -43.361,
    "treble_ratio": 0.016447,
    "spectral_centroid_hz": 1680.2
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p15": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "stress",
   "question": "Handoff depth: hand over EARLY (t=0.5, the state is noisier and the noise-label mismatch is 2.6x larger, 14 total steps) vs LATE (t=0.75, 11 steps). Which staged render is better?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P2_med \u2014 woman stirring soup, slow push-in (the face/audio cell)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 39.83,
   "sampling_s": 34.83,
   "peak_vram_mib": 24165,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -44.025,
    "treble_ratio": 0.002667,
    "spectral_centroid_hz": 1884.59
   }
  },
  "R": {
   "wall_s": 45.96,
   "sampling_s": 40.96,
   "peak_vram_mib": 24165,
   "nfe": 14,
   "audio_preview": {
    "rms_dbfs": -34.863,
    "treble_ratio": 0.00064,
    "spectral_centroid_hz": 1570.19
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p16": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "stress",
   "question": "Handoff depth: hand over EARLY (t=0.5, the state is noisier and the noise-label mismatch is 2.6x larger, 14 total steps) vs LATE (t=0.75, 11 steps). Which staged render is better?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P3_high \u2014 red ball, brisk full-width traverse (high motion)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 39.83,
   "sampling_s": 34.83,
   "peak_vram_mib": 24165,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -43.592,
    "treble_ratio": 0.005568,
    "spectral_centroid_hz": 1082.76
   }
  },
  "R": {
   "wall_s": 45.95,
   "sampling_s": 40.95,
   "peak_vram_mib": 24165,
   "nfe": 14,
   "audio_preview": {
    "rms_dbfs": -42.831,
    "treble_ratio": 0.000202,
    "spectral_centroid_hz": 1313.15
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p17": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "frontier",
   "question": "Inside the fast family: the turbo model's native 8 steps vs 11 steps with the top noise segment subdivided \u2014 does the extra top-end work buy quality, or is native-8 the better buy?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P1_low \u2014 red ball, slow short roll (low motion)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 49.06,
   "sampling_s": 35.06,
   "peak_vram_mib": 23895,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -49.226,
    "treble_ratio": 0.000582,
    "spectral_centroid_hz": 759.64
   }
  },
  "R": {
   "wall_s": 39.83,
   "sampling_s": 33.83,
   "peak_vram_mib": 24153,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -49.121,
    "treble_ratio": 0.000709,
    "spectral_centroid_hz": 851.3
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p18": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "frontier",
   "question": "Inside the fast family: the turbo model's native 8 steps vs 11 steps with the top noise segment subdivided \u2014 does the extra top-end work buy quality, or is native-8 the better buy?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P2_med \u2014 woman stirring soup, slow push-in (the face/audio cell)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 39.83,
   "sampling_s": 34.83,
   "peak_vram_mib": 24153,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -39.838,
    "treble_ratio": 0.002931,
    "spectral_centroid_hz": 1262.52
   }
  },
  "R": {
   "wall_s": 33.71,
   "sampling_s": 28.71,
   "peak_vram_mib": 24149,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -42.817,
    "treble_ratio": 0.00405,
    "spectral_centroid_hz": 1407.66
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p19": {
  "shared": {
   "set": "E",
   "date": "2026-10-05",
   "kind": "frontier",
   "question": "Inside the fast family: the turbo model's native 8 steps vs 11 steps with the top noise segment subdivided \u2014 does the extra top-end work buy quality, or is native-8 the better buy?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition the pair mp4s if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P3_high \u2014 red ball, brisk full-width traverse (high motion)",
   "frames": 39,
   "fps": 24,
   "seed": 421337,
   "canvas": "960x544",
   "model": "h3-ref2va pruned int8 convrot, text-only, no CFG; base legs res_multistep @ shift 12/3, turbo legs Euler (MiniMaxH3TurboSampler) @ shift 6/3 + the LightX2V ref2v turbo LoRA \u2014 the arm wiring is the escrowed key",
   "audio_note": "both sides generated their own audio; audition pairs/<id>_L/R.mp4 (the six audio metrics ride the results doc)"
  },
  "L": {
   "wall_s": 33.71,
   "sampling_s": 27.71,
   "peak_vram_mib": 24153,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -47.503,
    "treble_ratio": 9e-06,
    "spectral_centroid_hz": 323.03
   }
  },
  "R": {
   "wall_s": 39.83,
   "sampling_s": 33.83,
   "peak_vram_mib": 24153,
   "nfe": 11,
   "audio_preview": {
    "rms_dbfs": -43.641,
    "treble_ratio": 1.9e-05,
    "spectral_centroid_hz": 378.13
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 }
};
