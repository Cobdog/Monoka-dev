// gpu-review/setL - generation metadata (PAIRS-METADATA-SPEC + Amendment 7)
// question/judge/sides render always; per-side reveals post-call.
window.PAIR_META = {
 "p02": {
  "shared": {
   "set": "L",
   "date": "2026-10-08",
   "kind": "tweenxmctx",
   "seed": 421337,
   "question": "The continuation question: to carry a character's motion into NEW time \u2014 the same 2.75-second arc with three direction changes (her head screen-right \u2192 toward camera \u2192 screen-left \u2192 back toward camera while both arms rise overhead, then the left arm lowers) \u2014 which mechanism should earn the animation module's continuation spec: the tween image-reference chain, one longer single generation, Set K-style latent re-noising, or Motion Context tail conditioning?",
   "judge": "ONE call per side: which 66-frame strip advances the arc better \u2014 real motion through ALL THREE phases (watch for early freezes and held stills), direction and speed carrying smoothly across the internal cut(s), the clean hand-drawn line held, and the same elf woman throughout. Judge MOTION ADVANCEMENT first, then boundary continuity, then drawing style, then identity.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "Set K's A reference (the elf-girl bust drawing, clean line on white) carrying the 3-direction arc: head screen-right -> camera -> screen-left -> back toward camera, arms rising overhead then the left arm lowering",
   "model": "the Set-K point on every arm: ref2va pruned int8 + tween LoRA @1.0, euler/simple 30 steps, no CFG, shift 12/3; arm 4 adds Motion Context tail conditioning (22f context, 24f audio) per its pack's documented conventions",
   "audio_note": "strips are silent concats (silent line-art subject); per-window originals with audio auditionable in runs/"
  },
  "L": {
   "staged": "pairs/p02_L.mp4",
   "sha256_16": "543fb5d805e7739e",
   "frames": 66,
   "cost": {
    "wall_s_total": 1156.4,
    "sampler_only_s_total": 1081.0,
    "vram_peak_mib_max": 24012,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p02_R.mp4",
   "sha256_16": "19900409706f179c",
   "frames": 66,
   "cost": {
    "wall_s_total": 579.0,
    "sampler_only_s_total": 477.0,
    "vram_peak_mib_max": 24075,
    "renders": 3
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p03": {
  "shared": {
   "set": "L",
   "date": "2026-10-08",
   "kind": "mctxxsetk",
   "seed": 421337,
   "question": "The continuation question: to carry a character's motion into NEW time \u2014 the same 2.75-second arc with three direction changes (her head screen-right \u2192 toward camera \u2192 screen-left \u2192 back toward camera while both arms rise overhead, then the left arm lowers) \u2014 which mechanism should earn the animation module's continuation spec: the tween image-reference chain, one longer single generation, Set K-style latent re-noising, or Motion Context tail conditioning?",
   "judge": "ONE call per side: which 66-frame strip advances the arc better \u2014 real motion through ALL THREE phases (watch for early freezes and held stills), direction and speed carrying smoothly across the internal cut(s), the clean hand-drawn line held, and the same elf woman throughout. Judge MOTION ADVANCEMENT first, then boundary continuity, then drawing style, then identity.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "Set K's A reference (the elf-girl bust drawing, clean line on white) carrying the 3-direction arc: head screen-right -> camera -> screen-left -> back toward camera, arms rising overhead then the left arm lowering",
   "model": "the Set-K point on every arm: ref2va pruned int8 + tween LoRA @1.0, euler/simple 30 steps, no CFG, shift 12/3; arm 4 adds Motion Context tail conditioning (22f context, 24f audio) per its pack's documented conventions",
   "audio_note": "strips are silent concats (silent line-art subject); per-window originals with audio auditionable in runs/"
  },
  "L": {
   "staged": "pairs/p03_L.mp4",
   "sha256_16": "5da9a0a3ee43294e",
   "frames": 66,
   "cost": {
    "wall_s_total": 585.4,
    "sampler_only_s_total": 508.0,
    "vram_peak_mib_max": 24127,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p03_R.mp4",
   "sha256_16": "543fb5d805e7739e",
   "frames": 66,
   "cost": {
    "wall_s_total": 1156.4,
    "sampler_only_s_total": 1081.0,
    "vram_peak_mib_max": 24012,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p04": {
  "shared": {
   "set": "L",
   "date": "2026-10-08",
   "kind": "singlextween",
   "seed": 421337,
   "question": "The continuation question: to carry a character's motion into NEW time \u2014 the same 2.75-second arc with three direction changes (her head screen-right \u2192 toward camera \u2192 screen-left \u2192 back toward camera while both arms rise overhead, then the left arm lowers) \u2014 which mechanism should earn the animation module's continuation spec: the tween image-reference chain, one longer single generation, Set K-style latent re-noising, or Motion Context tail conditioning?",
   "judge": "ONE call per side: which 66-frame strip advances the arc better \u2014 real motion through ALL THREE phases (watch for early freezes and held stills), direction and speed carrying smoothly across the internal cut(s), the clean hand-drawn line held, and the same elf woman throughout. Judge MOTION ADVANCEMENT first, then boundary continuity, then drawing style, then identity.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "Set K's A reference (the elf-girl bust drawing, clean line on white) carrying the 3-direction arc: head screen-right -> camera -> screen-left -> back toward camera, arms rising overhead then the left arm lowering",
   "model": "the Set-K point on every arm: ref2va pruned int8 + tween LoRA @1.0, euler/simple 30 steps, no CFG, shift 12/3; arm 4 adds Motion Context tail conditioning (22f context, 24f audio) per its pack's documented conventions",
   "audio_note": "strips are silent concats (silent line-art subject); per-window originals with audio auditionable in runs/"
  },
  "L": {
   "staged": "pairs/p04_L.mp4",
   "sha256_16": "eb4799e4f5cddd22",
   "frames": 66,
   "cost": {
    "wall_s_total": 729.7,
    "sampler_only_s_total": 680.0,
    "vram_peak_mib_max": 24100,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p04_R.mp4",
   "sha256_16": "19900409706f179c",
   "frames": 66,
   "cost": {
    "wall_s_total": 579.0,
    "sampler_only_s_total": 477.0,
    "vram_peak_mib_max": 24075,
    "renders": 3
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p05": {
  "shared": {
   "set": "L",
   "date": "2026-10-08",
   "kind": "singlexmctx",
   "seed": 421337,
   "question": "The continuation question: to carry a character's motion into NEW time \u2014 the same 2.75-second arc with three direction changes (her head screen-right \u2192 toward camera \u2192 screen-left \u2192 back toward camera while both arms rise overhead, then the left arm lowers) \u2014 which mechanism should earn the animation module's continuation spec: the tween image-reference chain, one longer single generation, Set K-style latent re-noising, or Motion Context tail conditioning?",
   "judge": "ONE call per side: which 66-frame strip advances the arc better \u2014 real motion through ALL THREE phases (watch for early freezes and held stills), direction and speed carrying smoothly across the internal cut(s), the clean hand-drawn line held, and the same elf woman throughout. Judge MOTION ADVANCEMENT first, then boundary continuity, then drawing style, then identity.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "Set K's A reference (the elf-girl bust drawing, clean line on white) carrying the 3-direction arc: head screen-right -> camera -> screen-left -> back toward camera, arms rising overhead then the left arm lowering",
   "model": "the Set-K point on every arm: ref2va pruned int8 + tween LoRA @1.0, euler/simple 30 steps, no CFG, shift 12/3; arm 4 adds Motion Context tail conditioning (22f context, 24f audio) per its pack's documented conventions",
   "audio_note": "strips are silent concats (silent line-art subject); per-window originals with audio auditionable in runs/"
  },
  "L": {
   "staged": "pairs/p05_L.mp4",
   "sha256_16": "eb4799e4f5cddd22",
   "frames": 66,
   "cost": {
    "wall_s_total": 729.7,
    "sampler_only_s_total": 680.0,
    "vram_peak_mib_max": 24100,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p05_R.mp4",
   "sha256_16": "543fb5d805e7739e",
   "frames": 66,
   "cost": {
    "wall_s_total": 1156.4,
    "sampler_only_s_total": 1081.0,
    "vram_peak_mib_max": 24012,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p06": {
  "shared": {
   "set": "L",
   "date": "2026-10-08",
   "kind": "tweenxmctx",
   "seed": 421421,
   "question": "The continuation question: to carry a character's motion into NEW time \u2014 the same 2.75-second arc with three direction changes (her head screen-right \u2192 toward camera \u2192 screen-left \u2192 back toward camera while both arms rise overhead, then the left arm lowers) \u2014 which mechanism should earn the animation module's continuation spec: the tween image-reference chain, one longer single generation, Set K-style latent re-noising, or Motion Context tail conditioning?",
   "judge": "ONE call per side: which 66-frame strip advances the arc better \u2014 real motion through ALL THREE phases (watch for early freezes and held stills), direction and speed carrying smoothly across the internal cut(s), the clean hand-drawn line held, and the same elf woman throughout. Judge MOTION ADVANCEMENT first, then boundary continuity, then drawing style, then identity.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "Set K's A reference (the elf-girl bust drawing, clean line on white) carrying the 3-direction arc: head screen-right -> camera -> screen-left -> back toward camera, arms rising overhead then the left arm lowering",
   "model": "the Set-K point on every arm: ref2va pruned int8 + tween LoRA @1.0, euler/simple 30 steps, no CFG, shift 12/3; arm 4 adds Motion Context tail conditioning (22f context, 24f audio) per its pack's documented conventions",
   "audio_note": "strips are silent concats (silent line-art subject); per-window originals with audio auditionable in runs/"
  },
  "L": {
   "staged": "pairs/p06_L.mp4",
   "sha256_16": "9cdd99e3f66c8d8d",
   "frames": 66,
   "cost": {
    "wall_s_total": 1039.3,
    "sampler_only_s_total": 969.0,
    "vram_peak_mib_max": 23984,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p06_R.mp4",
   "sha256_16": "5379caf4c34c6d4d",
   "frames": 66,
   "cost": {
    "wall_s_total": 611.3,
    "sampler_only_s_total": 512.0,
    "vram_peak_mib_max": 24059,
    "renders": 3
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p07": {
  "shared": {
   "set": "L",
   "date": "2026-10-08",
   "kind": "mctxxsetk",
   "seed": 421421,
   "question": "The continuation question: to carry a character's motion into NEW time \u2014 the same 2.75-second arc with three direction changes (her head screen-right \u2192 toward camera \u2192 screen-left \u2192 back toward camera while both arms rise overhead, then the left arm lowers) \u2014 which mechanism should earn the animation module's continuation spec: the tween image-reference chain, one longer single generation, Set K-style latent re-noising, or Motion Context tail conditioning?",
   "judge": "ONE call per side: which 66-frame strip advances the arc better \u2014 real motion through ALL THREE phases (watch for early freezes and held stills), direction and speed carrying smoothly across the internal cut(s), the clean hand-drawn line held, and the same elf woman throughout. Judge MOTION ADVANCEMENT first, then boundary continuity, then drawing style, then identity.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "Set K's A reference (the elf-girl bust drawing, clean line on white) carrying the 3-direction arc: head screen-right -> camera -> screen-left -> back toward camera, arms rising overhead then the left arm lowering",
   "model": "the Set-K point on every arm: ref2va pruned int8 + tween LoRA @1.0, euler/simple 30 steps, no CFG, shift 12/3; arm 4 adds Motion Context tail conditioning (22f context, 24f audio) per its pack's documented conventions",
   "audio_note": "strips are silent concats (silent line-art subject); per-window originals with audio auditionable in runs/"
  },
  "L": {
   "staged": "pairs/p07_L.mp4",
   "sha256_16": "35dbb4dbffd52e2e",
   "frames": 66,
   "cost": {
    "wall_s_total": 574.2,
    "sampler_only_s_total": 497.0,
    "vram_peak_mib_max": 24055,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p07_R.mp4",
   "sha256_16": "9cdd99e3f66c8d8d",
   "frames": 66,
   "cost": {
    "wall_s_total": 1039.3,
    "sampler_only_s_total": 969.0,
    "vram_peak_mib_max": 23984,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p08": {
  "shared": {
   "set": "L",
   "date": "2026-10-08",
   "kind": "singlextween",
   "seed": 421421,
   "question": "The continuation question: to carry a character's motion into NEW time \u2014 the same 2.75-second arc with three direction changes (her head screen-right \u2192 toward camera \u2192 screen-left \u2192 back toward camera while both arms rise overhead, then the left arm lowers) \u2014 which mechanism should earn the animation module's continuation spec: the tween image-reference chain, one longer single generation, Set K-style latent re-noising, or Motion Context tail conditioning?",
   "judge": "ONE call per side: which 66-frame strip advances the arc better \u2014 real motion through ALL THREE phases (watch for early freezes and held stills), direction and speed carrying smoothly across the internal cut(s), the clean hand-drawn line held, and the same elf woman throughout. Judge MOTION ADVANCEMENT first, then boundary continuity, then drawing style, then identity.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "Set K's A reference (the elf-girl bust drawing, clean line on white) carrying the 3-direction arc: head screen-right -> camera -> screen-left -> back toward camera, arms rising overhead then the left arm lowering",
   "model": "the Set-K point on every arm: ref2va pruned int8 + tween LoRA @1.0, euler/simple 30 steps, no CFG, shift 12/3; arm 4 adds Motion Context tail conditioning (22f context, 24f audio) per its pack's documented conventions",
   "audio_note": "strips are silent concats (silent line-art subject); per-window originals with audio auditionable in runs/"
  },
  "L": {
   "staged": "pairs/p08_L.mp4",
   "sha256_16": "5379caf4c34c6d4d",
   "frames": 66,
   "cost": {
    "wall_s_total": 611.3,
    "sampler_only_s_total": 512.0,
    "vram_peak_mib_max": 24059,
    "renders": 3
   }
  },
  "R": {
   "staged": "pairs/p08_R.mp4",
   "sha256_16": "b118743998173d65",
   "frames": 66,
   "cost": {
    "wall_s_total": 664.2,
    "sampler_only_s_total": 613.0,
    "vram_peak_mib_max": 23935,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p09": {
  "shared": {
   "set": "L",
   "date": "2026-10-08",
   "kind": "singlexmctx",
   "seed": 421421,
   "question": "The continuation question: to carry a character's motion into NEW time \u2014 the same 2.75-second arc with three direction changes (her head screen-right \u2192 toward camera \u2192 screen-left \u2192 back toward camera while both arms rise overhead, then the left arm lowers) \u2014 which mechanism should earn the animation module's continuation spec: the tween image-reference chain, one longer single generation, Set K-style latent re-noising, or Motion Context tail conditioning?",
   "judge": "ONE call per side: which 66-frame strip advances the arc better \u2014 real motion through ALL THREE phases (watch for early freezes and held stills), direction and speed carrying smoothly across the internal cut(s), the clean hand-drawn line held, and the same elf woman throughout. Judge MOTION ADVANCEMENT first, then boundary continuity, then drawing style, then identity.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "Set K's A reference (the elf-girl bust drawing, clean line on white) carrying the 3-direction arc: head screen-right -> camera -> screen-left -> back toward camera, arms rising overhead then the left arm lowering",
   "model": "the Set-K point on every arm: ref2va pruned int8 + tween LoRA @1.0, euler/simple 30 steps, no CFG, shift 12/3; arm 4 adds Motion Context tail conditioning (22f context, 24f audio) per its pack's documented conventions",
   "audio_note": "strips are silent concats (silent line-art subject); per-window originals with audio auditionable in runs/"
  },
  "L": {
   "staged": "pairs/p09_L.mp4",
   "sha256_16": "b118743998173d65",
   "frames": 66,
   "cost": {
    "wall_s_total": 664.2,
    "sampler_only_s_total": 613.0,
    "vram_peak_mib_max": 23935,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p09_R.mp4",
   "sha256_16": "9cdd99e3f66c8d8d",
   "frames": 66,
   "cost": {
    "wall_s_total": 1039.3,
    "sampler_only_s_total": 969.0,
    "vram_peak_mib_max": 23984,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p10": {
  "shared": {
   "set": "L",
   "date": "2026-10-08",
   "kind": "tweenxmctx",
   "seed": 421777,
   "question": "The continuation question: to carry a character's motion into NEW time \u2014 the same 2.75-second arc with three direction changes (her head screen-right \u2192 toward camera \u2192 screen-left \u2192 back toward camera while both arms rise overhead, then the left arm lowers) \u2014 which mechanism should earn the animation module's continuation spec: the tween image-reference chain, one longer single generation, Set K-style latent re-noising, or Motion Context tail conditioning?",
   "judge": "ONE call per side: which 66-frame strip advances the arc better \u2014 real motion through ALL THREE phases (watch for early freezes and held stills), direction and speed carrying smoothly across the internal cut(s), the clean hand-drawn line held, and the same elf woman throughout. Judge MOTION ADVANCEMENT first, then boundary continuity, then drawing style, then identity.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "Set K's A reference (the elf-girl bust drawing, clean line on white) carrying the 3-direction arc: head screen-right -> camera -> screen-left -> back toward camera, arms rising overhead then the left arm lowering",
   "model": "the Set-K point on every arm: ref2va pruned int8 + tween LoRA @1.0, euler/simple 30 steps, no CFG, shift 12/3; arm 4 adds Motion Context tail conditioning (22f context, 24f audio) per its pack's documented conventions",
   "audio_note": "strips are silent concats (silent line-art subject); per-window originals with audio auditionable in runs/"
  },
  "L": {
   "staged": "pairs/p10_L.mp4",
   "sha256_16": "5940bf35e609950d",
   "frames": 66,
   "cost": {
    "wall_s_total": 1042.4,
    "sampler_only_s_total": 970.0,
    "vram_peak_mib_max": 24059,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p10_R.mp4",
   "sha256_16": "c69be9d38ef736d0",
   "frames": 66,
   "cost": {
    "wall_s_total": 576.6,
    "sampler_only_s_total": 476.0,
    "vram_peak_mib_max": 24060,
    "renders": 3
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p11": {
  "shared": {
   "set": "L",
   "date": "2026-10-08",
   "kind": "mctxxsetk",
   "seed": 421777,
   "question": "The continuation question: to carry a character's motion into NEW time \u2014 the same 2.75-second arc with three direction changes (her head screen-right \u2192 toward camera \u2192 screen-left \u2192 back toward camera while both arms rise overhead, then the left arm lowers) \u2014 which mechanism should earn the animation module's continuation spec: the tween image-reference chain, one longer single generation, Set K-style latent re-noising, or Motion Context tail conditioning?",
   "judge": "ONE call per side: which 66-frame strip advances the arc better \u2014 real motion through ALL THREE phases (watch for early freezes and held stills), direction and speed carrying smoothly across the internal cut(s), the clean hand-drawn line held, and the same elf woman throughout. Judge MOTION ADVANCEMENT first, then boundary continuity, then drawing style, then identity.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "Set K's A reference (the elf-girl bust drawing, clean line on white) carrying the 3-direction arc: head screen-right -> camera -> screen-left -> back toward camera, arms rising overhead then the left arm lowering",
   "model": "the Set-K point on every arm: ref2va pruned int8 + tween LoRA @1.0, euler/simple 30 steps, no CFG, shift 12/3; arm 4 adds Motion Context tail conditioning (22f context, 24f audio) per its pack's documented conventions",
   "audio_note": "strips are silent concats (silent line-art subject); per-window originals with audio auditionable in runs/"
  },
  "L": {
   "staged": "pairs/p11_L.mp4",
   "sha256_16": "5940bf35e609950d",
   "frames": 66,
   "cost": {
    "wall_s_total": 1042.4,
    "sampler_only_s_total": 970.0,
    "vram_peak_mib_max": 24059,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p11_R.mp4",
   "sha256_16": "d686d9a3542fac85",
   "frames": 66,
   "cost": {
    "wall_s_total": 555.7,
    "sampler_only_s_total": 477.0,
    "vram_peak_mib_max": 24037,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p12": {
  "shared": {
   "set": "L",
   "date": "2026-10-08",
   "kind": "singlextween",
   "seed": 421777,
   "question": "The continuation question: to carry a character's motion into NEW time \u2014 the same 2.75-second arc with three direction changes (her head screen-right \u2192 toward camera \u2192 screen-left \u2192 back toward camera while both arms rise overhead, then the left arm lowers) \u2014 which mechanism should earn the animation module's continuation spec: the tween image-reference chain, one longer single generation, Set K-style latent re-noising, or Motion Context tail conditioning?",
   "judge": "ONE call per side: which 66-frame strip advances the arc better \u2014 real motion through ALL THREE phases (watch for early freezes and held stills), direction and speed carrying smoothly across the internal cut(s), the clean hand-drawn line held, and the same elf woman throughout. Judge MOTION ADVANCEMENT first, then boundary continuity, then drawing style, then identity.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "Set K's A reference (the elf-girl bust drawing, clean line on white) carrying the 3-direction arc: head screen-right -> camera -> screen-left -> back toward camera, arms rising overhead then the left arm lowering",
   "model": "the Set-K point on every arm: ref2va pruned int8 + tween LoRA @1.0, euler/simple 30 steps, no CFG, shift 12/3; arm 4 adds Motion Context tail conditioning (22f context, 24f audio) per its pack's documented conventions",
   "audio_note": "strips are silent concats (silent line-art subject); per-window originals with audio auditionable in runs/"
  },
  "L": {
   "staged": "pairs/p12_L.mp4",
   "sha256_16": "c69be9d38ef736d0",
   "frames": 66,
   "cost": {
    "wall_s_total": 576.6,
    "sampler_only_s_total": 476.0,
    "vram_peak_mib_max": 24060,
    "renders": 3
   }
  },
  "R": {
   "staged": "pairs/p12_R.mp4",
   "sha256_16": "66634f5969a3cb72",
   "frames": 66,
   "cost": {
    "wall_s_total": 666.9,
    "sampler_only_s_total": 613.0,
    "vram_peak_mib_max": 24025,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p13": {
  "shared": {
   "set": "L",
   "date": "2026-10-08",
   "kind": "singlexmctx",
   "seed": 421777,
   "question": "The continuation question: to carry a character's motion into NEW time \u2014 the same 2.75-second arc with three direction changes (her head screen-right \u2192 toward camera \u2192 screen-left \u2192 back toward camera while both arms rise overhead, then the left arm lowers) \u2014 which mechanism should earn the animation module's continuation spec: the tween image-reference chain, one longer single generation, Set K-style latent re-noising, or Motion Context tail conditioning?",
   "judge": "ONE call per side: which 66-frame strip advances the arc better \u2014 real motion through ALL THREE phases (watch for early freezes and held stills), direction and speed carrying smoothly across the internal cut(s), the clean hand-drawn line held, and the same elf woman throughout. Judge MOTION ADVANCEMENT first, then boundary continuity, then drawing style, then identity.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "Set K's A reference (the elf-girl bust drawing, clean line on white) carrying the 3-direction arc: head screen-right -> camera -> screen-left -> back toward camera, arms rising overhead then the left arm lowering",
   "model": "the Set-K point on every arm: ref2va pruned int8 + tween LoRA @1.0, euler/simple 30 steps, no CFG, shift 12/3; arm 4 adds Motion Context tail conditioning (22f context, 24f audio) per its pack's documented conventions",
   "audio_note": "strips are silent concats (silent line-art subject); per-window originals with audio auditionable in runs/"
  },
  "L": {
   "staged": "pairs/p13_L.mp4",
   "sha256_16": "66634f5969a3cb72",
   "frames": 66,
   "cost": {
    "wall_s_total": 666.9,
    "sampler_only_s_total": 613.0,
    "vram_peak_mib_max": 24025,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p13_R.mp4",
   "sha256_16": "5940bf35e609950d",
   "frames": 66,
   "cost": {
    "wall_s_total": 1042.4,
    "sampler_only_s_total": 970.0,
    "vram_peak_mib_max": 24059,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p01": {
  "shared": {
   "set": "L",
   "date": "2026-10-08",
   "kind": "null",
   "seed": 421337,
   "question": "The continuation question: to carry a character's motion into NEW time \u2014 the same 2.75-second arc with three direction changes (her head screen-right \u2192 toward camera \u2192 screen-left \u2192 back toward camera while both arms rise overhead, then the left arm lowers) \u2014 which mechanism should earn the animation module's continuation spec: the tween image-reference chain, one longer single generation, Set K-style latent re-noising, or Motion Context tail conditioning?",
   "judge": "identical content expected - flicker or divergence is a TOOLING BUG, report it",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 22,
   "canvas": "1344x768",
   "subject": "the null gate: one 22f render duplicated through a fresh VAE alias",
   "model": "identical config both sides",
   "audio_note": ""
  },
  "L": {
   "staged": "pairs/p01_L.mp4",
   "sha256_16": "f93463e5f1b84692",
   "frames": 22,
   "cost": {
    "wall_s_total": 193.0,
    "sampler_only_s_total": 159.0,
    "vram_peak_mib_max": 23947,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p01_R.mp4",
   "sha256_16": "56809b8fae632057",
   "frames": 22,
   "cost": {
    "wall_s_total": 193.0,
    "sampler_only_s_total": 159.0,
    "vram_peak_mib_max": 24075,
    "renders": 1
   }
  },
  "note": "identical content expected - flicker or divergence is a TOOLING BUG, report it"
 }
};
