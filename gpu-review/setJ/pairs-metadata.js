// gpu-review/setJ — generation metadata (PAIRS-METADATA-SPEC.md + Amendment 7)
// question/judge/sides render always (they cannot unblind); per-side reveals post-call.
window.PAIR_META = {
 "p01": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "null",
   "question": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P2_med \u2014 woman stirring soup, slow push-in (the face/audio cell)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 66.4,
   "sampling_s": 60.4,
   "peak_vram_mib": 24149,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -26.697,
    "treble_ratio": 0.000305,
    "spectral_centroid_hz": 740.6
   }
  },
  "R": {
   "wall_s": 75.61,
   "sampling_s": 61.61,
   "peak_vram_mib": 24111,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -26.697,
    "treble_ratio": 0.000305,
    "spectral_centroid_hz": 740.6
   }
  },
  "note": "identical content expected \u2014 any flicker or divergence is a TOOLING BUG, report it"
 },
 "p02": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j1",
   "question": "Prompt adherence at the collapsing resolution: the SAME base model and prompt at 768p (where H3 adherence is known to collapse). One side is the plain render; the other carries an adherence mechanism (a prompt-strength dial, a conditioning adapter, or a guidance-gain schedule). Which follows the prompt better (the ball starts at the LEFT quarter, rolls across, rests at the RIGHT quarter) WITHOUT looking worse?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P3_high \u2014 red ball, brisk full-width traverse (high motion)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 141.97,
   "sampling_s": 136.97,
   "peak_vram_mib": 24137,
   "nfe": 20
  },
  "R": {
   "wall_s": 144.98,
   "sampling_s": 138.98,
   "peak_vram_mib": 24073,
   "nfe": 20
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p03": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j1",
   "question": "Prompt adherence at the collapsing resolution: the SAME base model and prompt at 768p (where H3 adherence is known to collapse). One side is the plain render; the other carries an adherence mechanism (a prompt-strength dial, a conditioning adapter, or a guidance-gain schedule). Which follows the prompt better (the ball starts at the LEFT quarter, rolls across, rests at the RIGHT quarter) WITHOUT looking worse?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P3_high \u2014 red ball, brisk full-width traverse (high motion)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 141.92,
   "sampling_s": 135.92,
   "peak_vram_mib": 24137,
   "nfe": 20
  },
  "R": {
   "wall_s": 141.97,
   "sampling_s": 136.97,
   "peak_vram_mib": 24137,
   "nfe": 20
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p04": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j1",
   "question": "Prompt adherence at the collapsing resolution: the SAME base model and prompt at 768p (where H3 adherence is known to collapse). One side is the plain render; the other carries an adherence mechanism (a prompt-strength dial, a conditioning adapter, or a guidance-gain schedule). Which follows the prompt better (the ball starts at the LEFT quarter, rolls across, rests at the RIGHT quarter) WITHOUT looking worse?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P3_high \u2014 red ball, brisk full-width traverse (high motion)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 142.01,
   "sampling_s": 137.01,
   "peak_vram_mib": 24153,
   "nfe": 20
  },
  "R": {
   "wall_s": 141.97,
   "sampling_s": 136.97,
   "peak_vram_mib": 24137,
   "nfe": 20
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p05": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j1_dose",
   "question": "The adherence dial's dose: a stronger setting vs a milder one of the SAME mechanism at 768p. Does more dial buy more adherence, or artifacts?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P3_high \u2014 red ball, brisk full-width traverse (high motion)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 141.93,
   "sampling_s": 140.93,
   "peak_vram_mib": 24137,
   "nfe": 20
  },
  "R": {
   "wall_s": 144.98,
   "sampling_s": 138.98,
   "peak_vram_mib": 24073,
   "nfe": 20
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p06": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j1_loosen",
   "question": "The loosening direction: a NEGATIVE prompt-strength setting vs the plain render. Does the dial loosen the prompt's grip usefully (softer interpretation, freer render) or just degrade?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P2_med \u2014 woman stirring soup, slow push-in (the face/audio cell)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 144.98,
   "sampling_s": 139.98,
   "peak_vram_mib": 24153,
   "nfe": 20
  },
  "R": {
   "wall_s": 145.08,
   "sampling_s": 140.08,
   "peak_vram_mib": 24149,
   "nfe": 20
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p07": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j2_fallback",
   "question": "Camera-move fallback WITHOUT any new adapter: identical model and prompt; one side was conditioned to keep the camera where it was, the other to follow a sideways camera slide (its reference shows the scene from the slid camera with grey holes). Judge CAMERA COMPLIANCE: does the slid side actually read as the same scene from a shifted viewpoint, with the holes filled consistently?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "bouldering_hang \u2014 climber on a bouldering wall (the removal/re-camera clip)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 827.36,
   "sampling_s": 800.36,
   "peak_vram_mib": 24141,
   "nfe": 20
  },
  "R": {
   "wall_s": 834.39,
   "sampling_s": 804.39,
   "peak_vram_mib": 23913,
   "nfe": 20
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p08": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j2_meridian",
   "question": "The camera LoRA pair vs the no-adapter fallback on the SAME slid-camera conditioning: the LoRA side runs a fast 3-step student trained for this task; the fallback runs the plain base model 20 steps. Which better completes the slid view?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "bouldering_hang \u2014 climber on a bouldering wall (the removal/re-camera clip)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 143.06,
   "sampling_s": 142.06,
   "peak_vram_mib": 24111,
   "nfe": 3
  },
  "R": {
   "wall_s": 827.36,
   "sampling_s": 800.36,
   "peak_vram_mib": 24141,
   "nfe": 20
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p09": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j3_instr_vs_dmask",
   "question": "Two generative removals: full re-render from an instruction vs region-scoped regeneration (only the person's region re-denoised, the rest of the latent kept). Which removes the person more cleanly while keeping the scene?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "bouldering_hang \u2014 climber on a bouldering wall (the removal/re-camera clip)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 177.73,
   "sampling_s": 153.72,
   "peak_vram_mib": 23897,
   "nfe": 20
  },
  "R": {
   "wall_s": 87.93,
   "sampling_s": 83.93,
   "peak_vram_mib": 23961,
   "nfe": 14
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p10": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j3_void_vs_instr",
   "question": "Person removal, two philosophies: a deterministic two-pass flow method (pixels outside the person are meant to stay EXACTLY as filmed) vs the base model re-rendering from an instruction. Judge REMOVAL SUCCESS + what happens OUTSIDE the person: is the wall/floor kept, and is the person gone?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "bouldering_hang \u2014 climber on a bouldering wall (the removal/re-camera clip)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 87.93,
   "sampling_s": 83.93,
   "peak_vram_mib": 23961,
   "nfe": 14
  },
  "R": {
   "wall_s": 0.0,
   "nfe": 0,
   "note": "untouched passthrough (driver-side ffmpeg rescale; zero generations)"
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p11": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j3_instr_vs_dmask",
   "question": "Two generative removals: full re-render from an instruction vs region-scoped regeneration (only the person's region re-denoised, the rest of the latent kept). Which removes the person more cleanly while keeping the scene?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "bouldering_hang \u2014 climber on a bouldering wall (the removal/re-camera clip)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 165.51,
   "sampling_s": 150.51,
   "peak_vram_mib": 24147,
   "nfe": 20
  },
  "R": {
   "wall_s": 177.73,
   "sampling_s": 153.72,
   "peak_vram_mib": 23897,
   "nfe": 20
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p12": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j4_style",
   "question": "Style propagation: the same kitchen scene and motion. One side is the plain photoreal propagate from the original first frame; the other starts from a frame re-painted in flat 2D cel style and is asked to HOLD that style. Judge STYLE HOLD over the clip's length (does the cel look survive to the last frame?) with subject and motion still correct.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P2_med_f0 \u2014 the soup-kitchen keyframe cell",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 72.52,
   "sampling_s": 66.52,
   "peak_vram_mib": 23891,
   "nfe": 20
  },
  "R": {
   "wall_s": 90.96,
   "sampling_s": 73.96,
   "peak_vram_mib": 23897,
   "nfe": 20
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p13": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j4_viggle",
   "question": "Two style-propagation machines: first-frame keyframe propagation vs Viggle's repaint (it re-renders a driving clip anchored to the styled image). Which holds the 2D cel style better across the clip while keeping the woman's motion?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P2_med_f0 \u2014 the soup-kitchen keyframe cell",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 72.52,
   "sampling_s": 66.52,
   "peak_vram_mib": 23891,
   "nfe": 20
  },
  "R": {
   "wall_s": 78.67,
   "sampling_s": 67.67,
   "peak_vram_mib": 24062,
   "nfe": 8
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p14": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j6",
   "question": "True classifier-free guidance on the base model: identical render except one side subtracts an empty-prompt prediction during sampling (classic CFG). Does the guided side follow the prompt better WITHOUT frying/oversaturating? Judge adherence first, then artifact freedom.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P2_med \u2014 woman stirring soup, slow push-in (the face/audio cell)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 75.61,
   "sampling_s": 61.61,
   "peak_vram_mib": 24111,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -26.697,
    "treble_ratio": 0.000305,
    "spectral_centroid_hz": 740.6
   }
  },
  "R": {
   "wall_s": 106.21,
   "sampling_s": 99.21,
   "peak_vram_mib": 24159,
   "nfe": 40,
   "audio_preview": {
    "rms_dbfs": -20.332,
    "treble_ratio": 3.6e-05,
    "spectral_centroid_hz": 559.39
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p15": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j6",
   "question": "True classifier-free guidance on the base model: identical render except one side subtracts an empty-prompt prediction during sampling (classic CFG). Does the guided side follow the prompt better WITHOUT frying/oversaturating? Judge adherence first, then artifact freedom.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P3_high \u2014 red ball, brisk full-width traverse (high motion)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 105.18,
   "sampling_s": 99.18,
   "peak_vram_mib": 24159,
   "nfe": 40,
   "audio_preview": {
    "rms_dbfs": -29.742,
    "treble_ratio": 0.000302,
    "spectral_centroid_hz": 644.35
   }
  },
  "R": {
   "wall_s": 60.25,
   "sampling_s": 54.25,
   "peak_vram_mib": 24159,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -35.768,
    "treble_ratio": 1.4e-05,
    "spectral_centroid_hz": 312.55
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p16": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j7",
   "question": "Reference freshness: identical keyframe-anchored render; one side anneals noise onto the keyframe conditioning during sampling (the reference 'fades' as denoising proceeds). Judge ANCHOR FIDELITY over the clip: which keeps the anchored subject closer to the first frame for longer, without going stale or static?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P2_med \u2014 woman stirring soup, slow push-in (the face/audio cell)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 161.36,
   "sampling_s": 146.36,
   "peak_vram_mib": 23889,
   "nfe": 20
  },
  "R": {
   "wall_s": 142.94,
   "sampling_s": 141.94,
   "peak_vram_mib": 24115,
   "nfe": 20
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p17": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j7",
   "question": "Reference freshness: identical keyframe-anchored render; one side anneals noise onto the keyframe conditioning during sampling (the reference 'fades' as denoising proceeds). Judge ANCHOR FIDELITY over the clip: which keeps the anchored subject closer to the first frame for longer, without going stale or static?",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P3_high \u2014 red ball, brisk full-width traverse (high motion)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 149.07,
   "sampling_s": 144.07,
   "peak_vram_mib": 24147,
   "nfe": 20
  },
  "R": {
   "wall_s": 142.95,
   "sampling_s": 141.95,
   "peak_vram_mib": 24147,
   "nfe": 20
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p18": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j8",
   "question": "The tier ladder at matched model: the FULL int8 base run 20 steps vs the HyperFlow flow-map distillation at its native 8 steps (same seed and prompt). Which is the better 8-step-quality-per-cost rung \u2014 judge overall fidelity and motion; the base side is the ceiling, not a shipping candidate.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P1_low \u2014 red ball, slow short roll (low motion)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 72.62,
   "sampling_s": 67.62,
   "peak_vram_mib": 24159,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -41.744,
    "treble_ratio": 0.001087,
    "spectral_centroid_hz": 1333.88
   }
  },
  "R": {
   "wall_s": 60.32,
   "sampling_s": 43.32,
   "peak_vram_mib": 23935,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -35.542,
    "treble_ratio": 1.2e-05,
    "spectral_centroid_hz": 328.72
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p19": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j8",
   "question": "The tier ladder at matched model: the FULL int8 base run 20 steps vs the HyperFlow flow-map distillation at its native 8 steps (same seed and prompt). Which is the better 8-step-quality-per-cost rung \u2014 judge overall fidelity and motion; the base side is the ceiling, not a shipping candidate.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P2_med \u2014 woman stirring soup, slow push-in (the face/audio cell)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 36.78,
   "sampling_s": 31.78,
   "peak_vram_mib": 24159,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -41.701,
    "treble_ratio": 0.008307,
    "spectral_centroid_hz": 1363.48
   }
  },
  "R": {
   "wall_s": 60.25,
   "sampling_s": 55.25,
   "peak_vram_mib": 24019,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -39.776,
    "treble_ratio": 0.005048,
    "spectral_centroid_hz": 1402.2
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 },
 "p20": {
  "shared": {
   "set": "J",
   "date": "2026-10-05",
   "kind": "j8",
   "question": "The tier ladder at matched model: the FULL int8 base run 20 steps vs the HyperFlow flow-map distillation at its native 8 steps (same seed and prompt). Which is the better 8-step-quality-per-cost rung \u2014 judge overall fidelity and motion; the base side is the ceiling, not a shipping candidate.",
   "judge": "ONE call per side: which is the better shipping render of this prompt \u2014 overall fidelity (subject, scene, motion as prompted) plus temporal stability and freedom from artifacts. Use 'tie' only if you genuinely could not pick; audio only as a tie-breaker (audition pairs/<id>_L/R.mp4 if it matters).",
   "sides": "sides randomized per pair by sha256 \u2014 no consistent side carries either arm",
   "board_prompt": "P3_high \u2014 red ball, brisk full-width traverse (high motion)",
   "frames": 39,
   "fps": 24.0,
   "seed": 421337,
   "canvas": "per-arm (escrowed key)",
   "model": "per-pilot base (escrowed key): J1/J4/J7 fl2va pruned; J2 fl2va FULL int8; J3 mix (VOID cogvideox-class / ref2va); J6 ref2va; J8 fl2va FULL int8",
   "audio_note": "audio-bearing pairs where the arms generated it; audition pairs/<id>_L/R.mp4"
  },
  "L": {
   "wall_s": 36.78,
   "sampling_s": 32.78,
   "peak_vram_mib": 24143,
   "nfe": 8,
   "audio_preview": {
    "rms_dbfs": -25.773,
    "treble_ratio": 0.000112,
    "spectral_centroid_hz": 388.13
   }
  },
  "R": {
   "wall_s": 60.25,
   "sampling_s": 55.25,
   "peak_vram_mib": 24163,
   "nfe": 20,
   "audio_preview": {
    "rms_dbfs": -25.277,
    "treble_ratio": 0.000165,
    "spectral_centroid_hz": 401.25
   }
  },
  "note": "contrast pair \u2014 arm identities in the escrowed key; per-side reveals render only after your call is recorded"
 }
};
