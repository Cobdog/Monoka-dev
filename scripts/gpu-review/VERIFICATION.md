# Review instrument diagnosis and verification

Run on Linux with Chromium 153.0.8010.52 (Arch Linux) and FFmpeg n9.0.2,
using real `file://` URLs, no HTTP server,
network, engine calls, or page dependency installation. Browser automation uses
the repository's existing Playwright installation. All response tests use an
isolated Chromium profile; the maintainer's existing responses are untouched.

## Root-cause findings

The previous page had two independently confirmed defects:

1. **The cache indices were not content-frame indices.** Chromium's actual
   `requestVideoFrameCallback` presentation timestamps around p03's temporal
   reversal were:

   | requested index | exact `i/24` seek presented | midpoint seek presented |
   | --- | --- | --- |
   | 60 | 2.500000 (frame 60) | 2.500000 (frame 60) |
   | 61 | 2.500000 (frame 60) | 2.541667 (frame 61) |
   | 62 | 2.541667 (frame 61) | 2.583333 (frame 62) |
   | 63 | 2.625000 (frame 63) | 2.625000 (frame 63) |

   Actual canvas screenshots confirmed the exact-seek frame 61 is pixel-identical
   to midpoint frame 60, and exact-seek frame 62 to midpoint frame 61, on **both**
   sides. Similar preceding-frame selections occurred at indices 1, 2, 23, 25
   and 37. The encoded PTS are rounded, e.g. 2.541667, whereas 61/24 is
   2.541666…, just before that presentation boundary. This is consistent with
   timestamp boundary selection, **not proof of nearest-keyframe seeking**.
   The sampled L/R timestamps matched: the proposed differential keyframe-cadence
   explanation was not confirmed in this corpus. Nevertheless the old cache
   duplicates/skips frames and mislabels true frame steps. Its timeout also drew
   whatever was available without validating a presented timestamp.

2. **Blink never hid the two native videos.** The old `.stage.blink` contained
   visible L video, R video, then canvas, each 687.8px tall in a 1280px viewport:
   the stage was 2063.3px tall. A normal viewport showed a native video instead of
   the comparator. See `evidence/legacy-layout.txt` and the legacy screenshot.
   The previous automatic blink also stopped alternating when content paused,
   and had no dedicated manual mode to disable automatic flips.

p07 is a valid falsifier: sequential FFmpeg frame-MD5 checks showed its L/R files
have exactly equal decoded pixels for all 39 frames. p03's source frames confirm
that the adjacent reversal is real: RGB mean absolute difference of L61 to R61
is 5.3542, but L61 to R62 is 1.3534; L62 to R62 is 5.4433, but L62 to R61 is
1.3906. Independent encoding adds smaller differences elsewhere; do not expect
only two source frames to differ byte-for-byte. Boundary screenshots and
measurements are in `evidence/` and the full temporary capture directory.

## Replacement

Sequential offline FFmpeg extraction creates full-resolution, lossless RGB
WebP strips and a classic script-tag manifest. Both sides must match geometry,
frame rate, count and normalized PTS. A single canvas commits both sides from
one content index in every mode, with no live video decoders or browser seeking.
All features remain: synchronized side-by-side, clipped draggable slider, 0.5–8Hz
blink, explicit manual flip, frame stepping and scrubber, play/pause/restart,
per-stage fullscreen, shared metadata, post-call L/R and note reveal, persisted
calls and notes, and Blob JS export. See `FRAME-ASSETS-SPEC.md`.

Template, setA's `review-v2.html` and `review.html`, and setB's `review.html` are
identical. setA includes complete assets; setB displays an explicit empty state
until its generator runs the documented extraction step. During this task another
worker started populating setB; those generated videos, frame assets and metadata
remain owned by that worker and are excluded from this change.

## Checks

```sh
python3 scripts/gpu-review/verify-frame-assets.py gpu-review/setA
node scripts/gpu-review/diagnose-seeks.cjs
node scripts/gpu-review/verify-storage.cjs
node scripts/gpu-review/verify-browser.cjs /tmp/gpu-review-evidence
```

The pixel verifier compares **every frame of every side** to sequential FFmpeg
BGRA decode, including final-strip padding exclusion. Counts: p01–p06 124 frames
per side, p07 39, p08 243 (1,026 matched pairs, 2,052 side frames). All passed.
p07 has zero differing frames. The lossless assets are 223.1 MiB, in 119
content-deduplicated strips. There is no JPEG judging noise.

Browser checks exercised all eight pairs in all three modes, with screenshots.
p01/p02/p03/p08 and the stronger p04–p06 show pixel differences when manually
flipped; this verifies visibility, not a subjective preference or JND judgment.
All 39 p07 frames produce identical canvas screenshots on manual L/R flips.
Automatic blink at each selectable rate, 0.5, 1, …, 8Hz, produced the expected
half-cycle changes over four seconds (within one refresh-quantized flip) while
paused content stayed at frame 23 with unchanged pixels. Manual mode remained
stable over four seconds and responded to B and stage taps.

All modes passed true-frame forward/backward stepping, play/pause, restart and
fullscreen. Real-time playback and blink measurements are in `evidence/real-clock.json`;
the summary is in `evidence/browser-results.txt`. Deterministic rate checks use
Playwright's virtual RAF clock; the additional wall-clock measurement does not.

Notes alone kept per-side metadata absent. A valid call revealed it. A JS Blob
download succeeded and parsed as executable `window.REVIEW_RESPONSES` data.
After completely closing and reopening Chromium on the exact setA file URL,
call, note, and post-call reveal survived. setB has its own B storage key and no
inherited A responses. A later smoke check loaded the concurrently generated
eight-pair setB corpus and exercised p01 in all three modes with exact steps
and restart, still with no metadata reveal or console/page errors. The older `review.html` key is restored as a fallback;
a subsequent save writes the current key and leaves the legacy key untouched. No page/console errors, HTTP requests or `.key` requests
were observed. Screenshots were centered clear of sticky header/footer overlays;
the initial occluded screenshot comparison was discarded.

## Limits

Initial testing found cold-load contention from prefetching every pair. Prefetch
now runs only for the active pair. A fresh run without warm-up measured 73
consecutive frames and 49 blink transitions over roughly three seconds; the
observed interval rates were 23.61fps and 8.00Hz. Fresh sets require the offline extraction step and substantially more disk than
MP4. Replaced videos require regeneration. Storage stalls slow playback while
both sides hold; frames are never skipped. Screen refresh quantizes blink timing.
There is no audio, variable-frame-rate support, or approximate native-video
fallback. FFmpeg's RGB conversion is used consistently on both sides; browser
native-video color conversion is no longer part of the judging path. Persistence
was verified in an ordinary isolated Chromium profile, not the maintainer's
personal profile or private browsing settings. When localStorage fails, the UI
explicitly asks for export before closing.
