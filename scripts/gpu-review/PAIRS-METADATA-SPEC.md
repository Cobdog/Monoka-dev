# pairs-metadata.js — the review sheet's generation-metadata contract

Set generators emit `pairs-metadata.js` next to review.html (a plain script
tag assignment — file:// loads script tags but blocks fetch, so JSON files
cannot be read by the page):

```js
/* global window */
window.PAIR_META = {
  p01: {
    shared:  { board: "director-low", width: 864, height: 480, fps: 24,
               frames: 39, model: "h3-base", sampler: "res_multistep",
               scheduler: "simple", steps: 20, shift_v: 12, shift_a: 3,
               seed: 42, kernel: "dense", date: "2026-10-04" },
    L: { wall_s: 312.4, steps: 20, /* arm-specific, reveals post-call */ },
    R: { wall_s: 305.9, steps: 20 },
    note: "expected tie (identical config)"   // optional pair-level note
  }, ...
};
```

BLINDING RULES: `shared` renders ALWAYS (both sides share it — cannot
unblind). Everything arm-specific — wall_s, steps, any per-side param that
differs by treatment — lives in `L`/`R` and renders ONLY AFTER the
maintainer records a call for that pair (the template enforces this), so
the quality call stays blind and the economic overlay (e.g. "L barely
better but 2× the wall clock") happens post-call. The escrowed pairs/.key
stays the authority on arm identity; this file carries measurements.

The shared and post-call reveal contract above is unchanged. Review media now
also requires a separate blind `pairs-frames.js` and lossless `frames/` assets;
see [FRAME-ASSETS-SPEC.md](FRAME-ASSETS-SPEC.md) for generation, validation,
playback semantics, and response JS export. Treatment metadata and pair notes
must never be placed in the frame manifest. Pair notes reveal only after a valid
call, just like L/R metadata. Metadata values render as text, never HTML.

Response export is now `review-responses.js`, a classic assignment to
`window.REVIEW_RESPONSES = { set, exported, responses }`; each response retains
`call`, `note`, and `ts`. Existing setA localStorage responses are preserved.
The frame manifest supplies playback count and timestamps; generation metadata
remains descriptive and does not control frame selection.
