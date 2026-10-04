/* global window */
// Retroactive metadata for Set A's corruption ladder (calls already recorded; key already opened).
// Shared config + per-side identity + the pre-registered expectation as the pair note.
window.PAIR_META = {
  p01: { shared: { set: "A", type: "corruption-calibration", fps: 24, res: "864x480", origin: "tranche-1 clean render (reused)" },
         L: { content: "clean.mp4" }, R: { content: "c1_vaereencode" },
         note: "NEAR-FLOOR by design: VAE round-trip loss only — tie is the correct call" },
  p02: { shared: { set: "A", type: "corruption-calibration", fps: 24, res: "864x480", origin: "tranche-1 clean render (reused)" },
         L: { content: "c2_gainL2" }, R: { content: "clean.mp4" },
         note: "+2 L* uniform — pre-registered visually-subtle; tie expected below JND" },
  p03: { shared: { set: "A", type: "corruption-calibration", fps: 24, res: "864x480", origin: "tranche-1 clean render (reused)" },
         L: { content: "clean.mp4" }, R: { content: "c3_1frame_jitter" },
         note: "single-frame temporal reversal (frames 61<->62) — local spike only; tie expected at a glance, DETECTABLE via frame-step" },
  p04: { shared: { set: "A", type: "corruption-calibration", fps: 24, res: "864x480", origin: "tranche-1 clean render (reused)" },
         L: { content: "c4_crossblend_seam" }, R: { content: "clean.mp4" },
         note: "17-frame crossblend ghost window (62..78) — pre-registered VISIBLE" },
  p05: { shared: { set: "A", type: "corruption-calibration", fps: 24, res: "864x480", origin: "tranche-1 clean render (reused)" },
         L: { content: "clean.mp4" }, R: { content: "c5_identity_swap" },
         note: "donor-face swap (feathered paste) — largest identity delta in the ladder; pre-registered VISIBLE" },
  p06: { shared: { set: "A", type: "corruption-calibration", fps: 24, res: "864x480", origin: "tranche-1 clean render (reused)" },
         L: { content: "clean.mp4" }, R: { content: "c6_halfres" },
         note: "864x480 -> 432x240 -> up (2x softening) — pre-registered VISIBLE" },
  p07: { shared: { set: "A", type: "decode-determinism-null", fps: 24, res: "864x480", origin: "same latent, two load states" },
         L: { content: "holddecode_A" }, R: { content: "holddecode_B" },
         note: "THE NULL: identical latent decoded across load states — any visible difference is a decode-determinism FAILURE, tie is the pass" },
  p08: { shared: { set: "A", type: "vae-floor", fps: 24, res: "864x480", frames: 243, origin: "clean render" },
         L: { content: "item0_original" }, R: { content: "a4_roundtrip" },
         note: "the VAE encode->decode floor made visible — near-tie expected" }
};
