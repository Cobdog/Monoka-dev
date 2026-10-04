// gpu-review/setB — generation metadata (v2.1 contract, scripts/gpu-review/PAIRS-METADATA-SPEC.md)
// shared renders always; per-side reveals only after the call is recorded.
window.PAIR_META = {
 "p01": {
  "shared": {
   "board": "setB-canary (tranche-1 PROMPT_A verbatim)",
   "WxH": "960x544",
   "fps": 24,
   "frames": 39,
   "model": "h3-fl2va-base (pruned int8 convrot, no adapters)",
   "sampler": "res_multistep",
   "scheduler": "simple",
   "steps": 20,
   "shift_v": 12,
   "shift_a": 3,
   "seed": 421337,
   "kernel": "stock attention (sage absent)",
   "date": "2026-10-04",
   "condition": "post-model-reload"
  },
  "L": {
   "wall_s": 69.62,
   "load_encode_s": 6.0,
   "sampling_s": 63.62,
   "peak_vram_mib": 24165
  },
  "R": {
   "wall_s": 60.26,
   "load_encode_s": 6.0,
   "sampling_s": 54.26,
   "peak_vram_mib": 23991
  },
  "note": "expected TIE \u2014 identical config (canary-vs-canary); per-side details reveal after your call"
 },
 "p02": {
  "shared": {
   "board": "setB-canary (tranche-1 PROMPT_A verbatim)",
   "WxH": "960x544",
   "fps": 24,
   "frames": 39,
   "model": "h3-fl2va-base (pruned int8 convrot, no adapters)",
   "sampler": "res_multistep",
   "scheduler": "simple",
   "steps": 20,
   "shift_v": 12,
   "shift_a": 3,
   "seed": 421337,
   "kernel": "stock attention (sage absent)",
   "date": "2026-10-04",
   "condition": "warm"
  },
  "L": {
   "wall_s": 60.27,
   "load_encode_s": 5.0,
   "sampling_s": 55.27,
   "peak_vram_mib": 23899
  },
  "R": {
   "wall_s": 60.26,
   "load_encode_s": 5.0,
   "sampling_s": 55.26,
   "peak_vram_mib": 24001
  },
  "note": "expected TIE \u2014 identical config (canary-vs-canary); per-side details reveal after your call"
 },
 "p03": {
  "shared": {
   "board": "setB-canary (tranche-1 PROMPT_A verbatim)",
   "WxH": "960x544",
   "fps": 24,
   "frames": 39,
   "model": "h3-fl2va-base (pruned int8 convrot, no adapters)",
   "sampler": "res_multistep",
   "scheduler": "simple",
   "steps": 20,
   "shift_v": 12,
   "shift_a": 3,
   "seed": 421337,
   "kernel": "stock attention (sage absent)",
   "date": "2026-10-04",
   "condition": "repeat-warm"
  },
  "L": {
   "wall_s": 63.34,
   "load_encode_s": 6.0,
   "sampling_s": 57.34,
   "peak_vram_mib": 24165
  },
  "R": {
   "wall_s": 63.36,
   "load_encode_s": 6.0,
   "sampling_s": 57.36,
   "peak_vram_mib": 24165
  },
  "note": "expected TIE \u2014 identical config (canary-vs-canary); per-side details reveal after your call"
 },
 "p04": {
  "shared": {
   "board": "setB-canary (tranche-1 PROMPT_A verbatim)",
   "WxH": "960x544",
   "fps": 24,
   "frames": 39,
   "model": "h3-fl2va-base (pruned int8 convrot, no adapters)",
   "sampler": "res_multistep",
   "scheduler": "simple",
   "steps": 20,
   "shift_v": 12,
   "shift_a": 3,
   "seed": 421337,
   "kernel": "stock attention (sage absent)",
   "date": "2026-10-04",
   "condition": "warm (recovered slot)"
  },
  "L": {
   "wall_s": 60.25,
   "load_encode_s": 5.0,
   "sampling_s": 55.25,
   "peak_vram_mib": 23899
  },
  "R": {
   "wall_s": 60.26,
   "load_encode_s": 5.0,
   "sampling_s": 55.26,
   "peak_vram_mib": 24001
  },
  "note": "expected TIE \u2014 identical config (canary-vs-canary); per-side details reveal after your call"
 },
 "p05": {
  "shared": {
   "board": "setB-canary (tranche-1 PROMPT_A verbatim)",
   "WxH": "960x544",
   "fps": 24,
   "frames": 39,
   "model": "h3-fl2va-base (pruned int8 convrot, no adapters)",
   "sampler": "res_multistep",
   "scheduler": "simple",
   "steps": 20,
   "shift_v": 12,
   "shift_a": 3,
   "seed": 421337,
   "kernel": "stock attention (sage absent)",
   "date": "2026-10-04"
  },
  "L": {
   "wall_s": 69.48,
   "load_encode_s": 15.0,
   "sampling_s": 54.47,
   "peak_vram_mib": 24071,
   "condition": "cold-start"
  },
  "R": {
   "wall_s": 60.26,
   "load_encode_s": 5.0,
   "sampling_s": 55.26,
   "peak_vram_mib": 24001,
   "condition": "warm"
  },
  "note": "expected TIE \u2014 identical config (canary-vs-canary); per-side details reveal after your call"
 },
 "p06": {
  "shared": {
   "board": "setB-canary (tranche-1 PROMPT_A verbatim)",
   "WxH": "960x544",
   "fps": 24,
   "frames": 39,
   "model": "h3-fl2va-base (pruned int8 convrot, no adapters)",
   "sampler": "res_multistep",
   "scheduler": "simple",
   "steps": 20,
   "shift_v": 12,
   "shift_a": 3,
   "seed": 421337,
   "kernel": "stock attention (sage absent)",
   "date": "2026-10-04"
  },
  "L": {
   "wall_s": 69.62,
   "load_encode_s": 6.0,
   "sampling_s": 63.62,
   "peak_vram_mib": 24165,
   "condition": "post-model-reload"
  },
  "R": {
   "wall_s": 69.48,
   "load_encode_s": 15.0,
   "sampling_s": 54.47,
   "peak_vram_mib": 24071,
   "condition": "cold-start"
  },
  "note": "expected TIE \u2014 identical config (canary-vs-canary); per-side details reveal after your call"
 },
 "p07": {
  "shared": {
   "board": "setB-canary (tranche-1 PROMPT_A verbatim)",
   "WxH": "960x544",
   "fps": 24,
   "frames": 39,
   "model": "h3-fl2va-base (pruned int8 convrot, no adapters)",
   "sampler": "res_multistep",
   "scheduler": "simple",
   "steps": 20,
   "shift_v": 12,
   "shift_a": 3,
   "seed": 421337,
   "kernel": "stock attention (sage absent)",
   "date": "2026-10-04"
  },
  "L": {
   "wall_s": 60.26,
   "load_encode_s": 6.0,
   "sampling_s": 54.26,
   "peak_vram_mib": 23991,
   "condition": "post-model-reload"
  },
  "R": {
   "wall_s": 63.34,
   "load_encode_s": 6.0,
   "sampling_s": 57.34,
   "peak_vram_mib": 24165,
   "condition": "repeat-warm"
  },
  "note": "expected TIE \u2014 identical config (canary-vs-canary); per-side details reveal after your call"
 },
 "p08": {
  "shared": {
   "board": "setB-canary (tranche-1 PROMPT_A verbatim)",
   "WxH": "960x544",
   "fps": 24,
   "frames": 39,
   "model": "h3-fl2va-base (pruned int8 convrot, no adapters)",
   "sampler": "res_multistep",
   "scheduler": "simple",
   "steps": 20,
   "shift_v": 12,
   "shift_a": 3,
   "seed": 421337,
   "kernel": "stock attention (sage absent)",
   "date": "2026-10-04"
  },
  "L": {
   "wall_s": 61.32,
   "load_encode_s": 6.0,
   "sampling_s": 55.32,
   "peak_vram_mib": 23895,
   "condition": "canonical"
  },
  "R": {
   "wall_s": 69.48,
   "load_encode_s": 15.0,
   "sampling_s": 54.47,
   "peak_vram_mib": 24071,
   "condition": "cold-start"
  },
  "note": "expected TIE \u2014 identical config (canary-vs-canary); per-side details reveal after your call"
 }
};
