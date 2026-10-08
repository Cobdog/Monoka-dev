// gpu-review/setM - generation metadata (PAIRS-METADATA-SPEC + Amendment 7)
// question/judge/sides render always; per-side reveals post-call.
window.PAIR_META = {
 "p02": {
  "shared": {
   "set": "M",
   "date": "2026-10-08",
   "kind": "controlxdrive",
   "seed": 421421,
   "question": "The Viggle-Animate swap question: the same 2.75-second driving clip of the elf woman (head turns with direction changes, both arms rising overhead, the figure drifting screen-right then settling back) is re-rendered by local Viggle-Animate from ONE still per arm \u2014 the elf woman re-rendered from her own repaint (control), the black-bobbed woman's FACE painted onto the elf's outfit (face), the black-bobbed woman's mustard cardigan painted onto the elf's face (outfit), and the black-bobbed woman as a 3-view character sheet (sheet). Which arm holds its intended identity and outfit through the motion, and where does it drift?",
   "judge": "ONE call per side: one side is the DRIVING CLIP ITSELF (the elf woman as rendered by our animation stack), the other is Viggle's propagation of her from her own repainted first frame. Judge PROPAGATION QUALITY: is the motion reproduced (the head turns, the arm raises, the drift and settle), the white ground and framing held, the drawing clean \u2014 or does the propagation smear, freeze, or redraw the character?",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "the elf woman's driving clip re-rendered by Viggle-Animate from one still per arm; character B is the authored black-bobbed woman (chin-length black bob, straight bangs, silver stud earring, mustard cardigan over charcoal tee)",
   "model": "Viggle pruned int8 + DMD r64 @1.0, shift 3/3, the upstream 4-point sigma list (3 Euler updates), euler, BasicGuider, frozen 362-token text conditioning; every arm shares the same driving clip",
   "audio_note": "strips are silent (Viggle discards generated audio); the driving clip's own audio is our stack's synthetic silence"
  },
  "L": {
   "staged": "pairs/p02_L.mp4",
   "sha256_16": "ab116a4224d2a9d3",
   "frames": 66,
   "cost": {
    "renders": 0,
    "note": "the driving clip (our animation stack, not Viggle)"
   }
  },
  "R": {
   "staged": "pairs/p02_R.mp4",
   "sha256_16": "3360bab9f96cc029",
   "frames": 66,
   "cost": {
    "wall_s_total": 180.9,
    "sampler_only_s_total": 121.0,
    "vram_peak_mib_max": 23950,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p03": {
  "shared": {
   "set": "M",
   "date": "2026-10-08",
   "kind": "facexcontrol",
   "seed": 421421,
   "question": "The Viggle-Animate swap question: the same 2.75-second driving clip of the elf woman (head turns with direction changes, both arms rising overhead, the figure drifting screen-right then settling back) is re-rendered by local Viggle-Animate from ONE still per arm \u2014 the elf woman re-rendered from her own repaint (control), the black-bobbed woman's FACE painted onto the elf's outfit (face), the black-bobbed woman's mustard cardigan painted onto the elf's face (outfit), and the black-bobbed woman as a 3-view character sheet (sheet). Which arm holds its intended identity and outfit through the motion, and where does it drift?",
   "judge": "ONE call per side: which 66-frame strip keeps the BLACK-BOBBED woman's face (chin-length black bob, straight dark bangs) through the WHOLE strip while the outfit stays the elf woman's turtleneck and light blue overshirt \u2014 judge FACE HOLD first (watch for the bob reverting to the cream high bun mid-motion), then motion smoothness, then line quality.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "the elf woman's driving clip re-rendered by Viggle-Animate from one still per arm; character B is the authored black-bobbed woman (chin-length black bob, straight bangs, silver stud earring, mustard cardigan over charcoal tee)",
   "model": "Viggle pruned int8 + DMD r64 @1.0, shift 3/3, the upstream 4-point sigma list (3 Euler updates), euler, BasicGuider, frozen 362-token text conditioning; every arm shares the same driving clip",
   "audio_note": "strips are silent (Viggle discards generated audio); the driving clip's own audio is our stack's synthetic silence"
  },
  "L": {
   "staged": "pairs/p03_L.mp4",
   "sha256_16": "a909660cbd97add3",
   "frames": 66,
   "cost": {
    "wall_s_total": 180.8,
    "sampler_only_s_total": 121.0,
    "vram_peak_mib_max": 23913,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p03_R.mp4",
   "sha256_16": "3360bab9f96cc029",
   "frames": 66,
   "cost": {
    "wall_s_total": 180.9,
    "sampler_only_s_total": 121.0,
    "vram_peak_mib_max": 23950,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p04": {
  "shared": {
   "set": "M",
   "date": "2026-10-08",
   "kind": "facexcontrol",
   "seed": 421777,
   "question": "The Viggle-Animate swap question: the same 2.75-second driving clip of the elf woman (head turns with direction changes, both arms rising overhead, the figure drifting screen-right then settling back) is re-rendered by local Viggle-Animate from ONE still per arm \u2014 the elf woman re-rendered from her own repaint (control), the black-bobbed woman's FACE painted onto the elf's outfit (face), the black-bobbed woman's mustard cardigan painted onto the elf's face (outfit), and the black-bobbed woman as a 3-view character sheet (sheet). Which arm holds its intended identity and outfit through the motion, and where does it drift?",
   "judge": "ONE call per side: which 66-frame strip keeps the BLACK-BOBBED woman's face (chin-length black bob, straight dark bangs) through the WHOLE strip while the outfit stays the elf woman's turtleneck and light blue overshirt \u2014 judge FACE HOLD first (watch for the bob reverting to the cream high bun mid-motion), then motion smoothness, then line quality.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "the elf woman's driving clip re-rendered by Viggle-Animate from one still per arm; character B is the authored black-bobbed woman (chin-length black bob, straight bangs, silver stud earring, mustard cardigan over charcoal tee)",
   "model": "Viggle pruned int8 + DMD r64 @1.0, shift 3/3, the upstream 4-point sigma list (3 Euler updates), euler, BasicGuider, frozen 362-token text conditioning; every arm shares the same driving clip",
   "audio_note": "strips are silent (Viggle discards generated audio); the driving clip's own audio is our stack's synthetic silence"
  },
  "L": {
   "staged": "pairs/p04_L.mp4",
   "sha256_16": "0a015d54edf3273d",
   "frames": 66,
   "cost": {
    "wall_s_total": 180.8,
    "sampler_only_s_total": 120.0,
    "vram_peak_mib_max": 24034,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p04_R.mp4",
   "sha256_16": "775805be6cb6afa3",
   "frames": 66,
   "cost": {
    "wall_s_total": 180.8,
    "sampler_only_s_total": 121.0,
    "vram_peak_mib_max": 23905,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p05": {
  "shared": {
   "set": "M",
   "date": "2026-10-08",
   "kind": "outfitxcontrol",
   "seed": 421421,
   "question": "The Viggle-Animate swap question: the same 2.75-second driving clip of the elf woman (head turns with direction changes, both arms rising overhead, the figure drifting screen-right then settling back) is re-rendered by local Viggle-Animate from ONE still per arm \u2014 the elf woman re-rendered from her own repaint (control), the black-bobbed woman's FACE painted onto the elf's outfit (face), the black-bobbed woman's mustard cardigan painted onto the elf's face (outfit), and the black-bobbed woman as a 3-view character sheet (sheet). Which arm holds its intended identity and outfit through the motion, and where does it drift?",
   "judge": "ONE call per side: which 66-frame strip keeps the elf woman's face (cream-blonde high bun, long pointed ears, gold hoop) while the outfit becomes the mustard-yellow cardigan over the charcoal tee \u2014 judge OUTFIT FIDELITY first (does the outfit hold, does it bleed into the face?), then motion smoothness, then line quality.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "the elf woman's driving clip re-rendered by Viggle-Animate from one still per arm; character B is the authored black-bobbed woman (chin-length black bob, straight bangs, silver stud earring, mustard cardigan over charcoal tee)",
   "model": "Viggle pruned int8 + DMD r64 @1.0, shift 3/3, the upstream 4-point sigma list (3 Euler updates), euler, BasicGuider, frozen 362-token text conditioning; every arm shares the same driving clip",
   "audio_note": "strips are silent (Viggle discards generated audio); the driving clip's own audio is our stack's synthetic silence"
  },
  "L": {
   "staged": "pairs/p05_L.mp4",
   "sha256_16": "3360bab9f96cc029",
   "frames": 66,
   "cost": {
    "wall_s_total": 180.9,
    "sampler_only_s_total": 121.0,
    "vram_peak_mib_max": 23950,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p05_R.mp4",
   "sha256_16": "6779712cf99b989f",
   "frames": 66,
   "cost": {
    "wall_s_total": 180.8,
    "sampler_only_s_total": 112.0,
    "vram_peak_mib_max": 23961,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p06": {
  "shared": {
   "set": "M",
   "date": "2026-10-08",
   "kind": "outfitxcontrol",
   "seed": 421777,
   "question": "The Viggle-Animate swap question: the same 2.75-second driving clip of the elf woman (head turns with direction changes, both arms rising overhead, the figure drifting screen-right then settling back) is re-rendered by local Viggle-Animate from ONE still per arm \u2014 the elf woman re-rendered from her own repaint (control), the black-bobbed woman's FACE painted onto the elf's outfit (face), the black-bobbed woman's mustard cardigan painted onto the elf's face (outfit), and the black-bobbed woman as a 3-view character sheet (sheet). Which arm holds its intended identity and outfit through the motion, and where does it drift?",
   "judge": "ONE call per side: which 66-frame strip keeps the elf woman's face (cream-blonde high bun, long pointed ears, gold hoop) while the outfit becomes the mustard-yellow cardigan over the charcoal tee \u2014 judge OUTFIT FIDELITY first (does the outfit hold, does it bleed into the face?), then motion smoothness, then line quality.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "the elf woman's driving clip re-rendered by Viggle-Animate from one still per arm; character B is the authored black-bobbed woman (chin-length black bob, straight bangs, silver stud earring, mustard cardigan over charcoal tee)",
   "model": "Viggle pruned int8 + DMD r64 @1.0, shift 3/3, the upstream 4-point sigma list (3 Euler updates), euler, BasicGuider, frozen 362-token text conditioning; every arm shares the same driving clip",
   "audio_note": "strips are silent (Viggle discards generated audio); the driving clip's own audio is our stack's synthetic silence"
  },
  "L": {
   "staged": "pairs/p06_L.mp4",
   "sha256_16": "775805be6cb6afa3",
   "frames": 66,
   "cost": {
    "wall_s_total": 180.8,
    "sampler_only_s_total": 121.0,
    "vram_peak_mib_max": 23905,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p06_R.mp4",
   "sha256_16": "a52d531fb93f6973",
   "frames": 66,
   "cost": {
    "wall_s_total": 180.8,
    "sampler_only_s_total": 121.0,
    "vram_peak_mib_max": 23970,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p07": {
  "shared": {
   "set": "M",
   "date": "2026-10-08",
   "kind": "sheetxface",
   "seed": 421421,
   "question": "The Viggle-Animate swap question: the same 2.75-second driving clip of the elf woman (head turns with direction changes, both arms rising overhead, the figure drifting screen-right then settling back) is re-rendered by local Viggle-Animate from ONE still per arm \u2014 the elf woman re-rendered from her own repaint (control), the black-bobbed woman's FACE painted onto the elf's outfit (face), the black-bobbed woman's mustard cardigan painted onto the elf's face (outfit), and the black-bobbed woman as a 3-view character sheet (sheet). Which arm holds its intended identity and outfit through the motion, and where does it drift?",
   "judge": "ONE call per side: BOTH sides target the same black-bobbed identity by different inputs \u2014 one single repainted frame versus a 3-view character sheet. Which holds her identity better through the motion (face, bob, earring) and renders more cleanly \u2014 judge IDENTITY HOLD first, then motion smoothness, then line quality.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "the elf woman's driving clip re-rendered by Viggle-Animate from one still per arm; character B is the authored black-bobbed woman (chin-length black bob, straight bangs, silver stud earring, mustard cardigan over charcoal tee)",
   "model": "Viggle pruned int8 + DMD r64 @1.0, shift 3/3, the upstream 4-point sigma list (3 Euler updates), euler, BasicGuider, frozen 362-token text conditioning; every arm shares the same driving clip",
   "audio_note": "strips are silent (Viggle discards generated audio); the driving clip's own audio is our stack's synthetic silence"
  },
  "L": {
   "staged": "pairs/p07_L.mp4",
   "sha256_16": "a909660cbd97add3",
   "frames": 66,
   "cost": {
    "wall_s_total": 180.8,
    "sampler_only_s_total": 121.0,
    "vram_peak_mib_max": 23913,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p07_R.mp4",
   "sha256_16": "b99da8dd94b04e21",
   "frames": 66,
   "cost": {
    "wall_s_total": 180.9,
    "sampler_only_s_total": 122.0,
    "vram_peak_mib_max": 23941,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p08": {
  "shared": {
   "set": "M",
   "date": "2026-10-08",
   "kind": "sheetxface",
   "seed": 421777,
   "question": "The Viggle-Animate swap question: the same 2.75-second driving clip of the elf woman (head turns with direction changes, both arms rising overhead, the figure drifting screen-right then settling back) is re-rendered by local Viggle-Animate from ONE still per arm \u2014 the elf woman re-rendered from her own repaint (control), the black-bobbed woman's FACE painted onto the elf's outfit (face), the black-bobbed woman's mustard cardigan painted onto the elf's face (outfit), and the black-bobbed woman as a 3-view character sheet (sheet). Which arm holds its intended identity and outfit through the motion, and where does it drift?",
   "judge": "ONE call per side: BOTH sides target the same black-bobbed identity by different inputs \u2014 one single repainted frame versus a 3-view character sheet. Which holds her identity better through the motion (face, bob, earring) and renders more cleanly \u2014 judge IDENTITY HOLD first, then motion smoothness, then line quality.",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 66,
   "canvas": "1344x768",
   "subject": "the elf woman's driving clip re-rendered by Viggle-Animate from one still per arm; character B is the authored black-bobbed woman (chin-length black bob, straight bangs, silver stud earring, mustard cardigan over charcoal tee)",
   "model": "Viggle pruned int8 + DMD r64 @1.0, shift 3/3, the upstream 4-point sigma list (3 Euler updates), euler, BasicGuider, frozen 362-token text conditioning; every arm shares the same driving clip",
   "audio_note": "strips are silent (Viggle discards generated audio); the driving clip's own audio is our stack's synthetic silence"
  },
  "L": {
   "staged": "pairs/p08_L.mp4",
   "sha256_16": "0fd72dae7dc0d29e",
   "frames": 66,
   "cost": {
    "wall_s_total": 183.9,
    "sampler_only_s_total": 113.0,
    "vram_peak_mib_max": 23913,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p08_R.mp4",
   "sha256_16": "0a015d54edf3273d",
   "frames": 66,
   "cost": {
    "wall_s_total": 180.8,
    "sampler_only_s_total": 120.0,
    "vram_peak_mib_max": 24034,
    "renders": 1
   }
  },
  "note": "contrast pair - arm identities in the escrowed key; per-side cost reveals render only after your call"
 },
 "p01": {
  "shared": {
   "set": "M",
   "date": "2026-10-08",
   "kind": "null",
   "seed": 421337,
   "question": "The Viggle-Animate swap question: the same 2.75-second driving clip of the elf woman (head turns with direction changes, both arms rising overhead, the figure drifting screen-right then settling back) is re-rendered by local Viggle-Animate from ONE still per arm \u2014 the elf woman re-rendered from her own repaint (control), the black-bobbed woman's FACE painted onto the elf's outfit (face), the black-bobbed woman's mustard cardigan painted onto the elf's face (outfit), and the black-bobbed woman as a 3-view character sheet (sheet). Which arm holds its intended identity and outfit through the motion, and where does it drift?",
   "judge": "identical content expected - flicker or divergence is a TOOLING BUG, report it",
   "sides": "sides randomized per pair by sha256 - no consistent side carries either arm",
   "fps": 24,
   "frames": 73,
   "canvas": "1344x768",
   "subject": "the null gate: one Viggle propagation duplicated through a fresh VAE alias",
   "model": "identical config both sides",
   "audio_note": ""
  },
  "L": {
   "staged": "pairs/p01_L.mp4",
   "sha256_16": "9ebcf650a2d4e141",
   "frames": 73,
   "cost": {
    "wall_s_total": 180.8,
    "sampler_only_s_total": 121.0,
    "vram_peak_mib_max": 23928,
    "renders": 1
   }
  },
  "R": {
   "staged": "pairs/p01_R.mp4",
   "sha256_16": "da8070ed6f249ca1",
   "frames": 73,
   "cost": {
    "wall_s_total": 180.9,
    "sampler_only_s_total": 121.0,
    "vram_peak_mib_max": 23950,
    "renders": 1
   }
  },
  "note": "identical content expected - flicker or divergence is a TOOLING BUG, report it"
 }
};
