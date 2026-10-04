# Exact presentation frames for file:// review

The review HTML is a static, dependency-free page. Open it directly in Chromium.
There is no server, fetch, module loader, WebCodecs demuxer, or browser video seek.
All three modes draw the same matched frame pair to a single canvas. This also
makes frame stepping exact in side-by-side and slider, rather than only blink.

After a set generator finishes writing blind `pairs/pNN_L.mp4` and
`pairs/pNN_R.mp4`, run this local post-generation command (requires FFmpeg with
libwebp, plus ffprobe, and Python's standard library):

```sh
python3 scripts/gpu-review/extract-review-frames.py gpu-review/setA
```

Copy `review-template.html` into the set as `review.html`, along with its
`pairs-metadata.js`. Ship the generated `pairs-frames.js` and `frames/` with the
page. Existing generators need this post-generation step; they do not need to
change their video encoder. No engine contact is involved. The extractor never
reads `.key` or treatment metadata. Re-run after replacing any source videos.
Old unreferenced strips are retained; regenerate into a fresh set to reclaim them.

`pairs-frames.js` is a classic script assignment to `window.REVIEW_FRAMES`:

```js
{ version: 1, strip: 12, pairs: {
  p01: { width: 864, height: 480, fps: 24, count: 124,
         pts: [0, 0.041667, /* normalized presentation timestamps */],
         L: ["frames/<sha256>.webp", /* strips in presentation order */],
         R: ["frames/<sha256>.webp", /* same indexing */] }
} }
```

Each lossless WebP strip stacks twelve full-resolution frames vertically. Frame
`i` is row `i % 12` in strip `floor(i / 12)`. The final strip has black padding;
`count` excludes padding. FFmpeg decodes sequentially in presentation order with
`-fps_mode passthrough`, no seeking, no frame-rate resampling, and no lossy image
encoding. Side dimensions, frame count, constant frame rate and normalized PTS
must match; generation fails on a mismatch instead of truncating either side.
This establishes presentation-index alignment, not semantic alignment of the
content: an intentionally swapped frame remains a content difference.

Hash filenames identify asset bytes, never arm identity. Identical strips are
stored once across the set. This costs substantially more disk than MP4; Set A's
measured size is recorded in `VERIFICATION.md`. Losslessness is intentional:
JPEG would introduce another compression difference at precisely the judging
floor. The page retains two decoded strips per side per pair, rather than giant
full-video canvas caches; only the active pair's animation clock and next-strip prefetch run. Both sides
load before a new frame is committed. Storage stalls hold both sides, never skip
content frames or expose an unmatched pair. Actual playback can slow under load.

Playback starts paused. Select a mode, then Play. Restart returns to frame zero
and preserves play/pause state. The scrubber and arrows pause at a true content
frame. Automatic blink alternates every `1 / (2 * Hz)` seconds, where Hz denotes
complete L/R cycles, independently of content playback. Manual mode flips only
on tap, Flip L/R, or B. Backgrounding pauses content. Screen refresh quantizes
blink timing; sub-refresh precision is not promised. No audio is presented.
Missing assets display a blocking explanation; there is no approximate video
fallback masquerading as exact frames.

Responses use the existing `gpu-review-A-responses` localStorage key for setA,
and a distinct B key for setB. If absent, the earlier `gpu-review-setA-responses`
key is read as a non-destructive fallback. The next save uses the current key. `?set=` overrides the set name. Notes alone do not
reveal metadata. A valid recorded call does. Export downloads
`review-responses.js` containing `window.REVIEW_RESPONSES = {set, exported,
responses};`, retaining existing call/note/ts fields. If localStorage is denied,
the UI says to export before closing. No exported response is loaded implicitly.
