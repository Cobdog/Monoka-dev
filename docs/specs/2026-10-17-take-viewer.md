# The take viewer — the review surface the loop is missing (spec)

> **STATUS: DRAFTED (r2 — the 2026-10-17 audit's findings applied; see
> [docs/audit/spec-audit-2026-10-17.md](../audit/spec-audit-2026-10-17.md))**
> — decision-ready draft for the maintainer (The take viewer (foelihc),
> 2026-10-17). The judgment calls this draft made are collected in §8 for
> the blessing; everything else restates landed rulings, the review's
> findings, or reads the tree.

**Inputs:** the blind-review synthesis [docs/audit/ux-review-2026-10-15.md](../audit/ux-review-2026-10-15.md) (theme 4, §4.1 — this spec IS that design item) and R2's loop leg [r2-report.md](../audit/ux-review-2026-10-15/r2-report.md) (F4 in full, the gesture accounting, the reach-for list); the landed seams this builds on — the filmstrip foundation (server sprite route `server/core.ts:3688`, the shared layout math `src/media/filmstripLayout.ts`, the OPFS-cached loader `src/media/useFilmstrip.ts`, the poster component `src/components/PooledVideoCard.tsx`), the frame-extraction backbone (`POST /api/lan/video/frame` / `frames`, `server/core.ts:3634-3654`; the client seam `src/lib/apiClient.ts:241`), the fork flow with the −1/`'last'` anchor convention (`src/canvas/generation.ts:592-628`, wzt73ob), the video-element pool (`src/media/videoPool.ts`), and the layered-dialog idiom (`src/datasets/CropEditor.tsx` on `StudioDialogLayered`); the sibling design-round specs — the wizard rework [2026-10-17-wizard-rework.md](2026-10-17-wizard-rework.md) (3p14abm; its §6 explicitly defers to this) and the hash catalog [2026-10-17-hash-catalog.md](2026-10-17-hash-catalog.md) (to7xpa7); the pre-blessing audit [spec-audit-2026-10-17.md](../audit/spec-audit-2026-10-17.md) — this r2 applies its findings (T-C1, T-I1…I3, T-M1…M4, CT-3).

**The review's words that govern this spec (R2 F4):** today the clip review
surface is play/pause, and that is all. The tile renders the video as a
**poster** (`canvas-tile-poster`, `preload="metadata"`, paused at frame 0 —
`src/canvas/Tile.tsx` `TilePreview`); the only transport is the bottom bar's
play chip, which DOM-queries the tile's `<video>` and toggles pause
(`src/canvas/BottomBar.tsx` `toggleTransport`). No seek bar, no timecode, no
frame-step, no filmstrip (**0 filmstrip elements in the DOM at any zoom** —
probed to 400%), no loop, no speed, no mute, no still-frame export from the
viewer. Space / ← / → / L are all inert. *"Reviewing IS the loop. Every turn
starts with 'look at what I got' — and looking is the one thing the app makes
hard."* The follow-on finding F7 is the same wound from the other side: the
one chaining path that works (`Fork — extracted frame`) makes the creator do
frame-index arithmetic in their head (`seconds × 24`, negative counts from
the end) because no frame picker exists — because no review surface exists
to pick from.

---

## 1. Purpose and frame

One surface where a landed take is **watched at inspectable size, scrubbed,
frame-stepped, and chained from** — the "look at what I got" half of every
loop turn. The bones it needs are already in the tree:

- The **filmstrip foundation** exists end to end — the server lazily
  generates a sprite sheet per clip (`GET /api/lan/assets/filmstrip`, ETag'd,
  `cols`/`rows`/`frame-count` headers), the layout math is shared
  client/server (≈ `clamp(12, duration×2, 30)` cells at the studio's
  **24 fps convention**, `FILMSTRIP_FPS`), the client loads it cache-first
  through OPFS (`useFilmstrip`), and `FilmstripPoster` already renders frame
  1 of it as the tile's fallback poster. It renders nowhere as *filmstrip* —
  no surface shows the cells as a strip. This spec points it at one.
- The **frame-extraction backbone** exists server-side — `POST
  /api/lan/video/frame` (a numeric position or `'last'`) and `POST
  /api/lan/video/frames` (1–100 positions), both ffmpeg-backed, both
  already called by the fork path (`src/canvas/store.ts` extracts before
  creating an extracted-frame chain). R2's own simple version says it: "the
  extract-frame op already renders frames server-side — point it at a
  picker."
- The **fork seam carries a frame anchor** — `forkInputSpec` already
  persists `frameIndex` + `extractedPath`, and the wzt73ob round fixed the
  *default* (tail forks anchor `'last'`; everything else frame 0). What
  never existed is the human's way to *choose* the frame.

Two constraints govern every decision below:

- **The modularity contract** (remediation epic 4lphxv8): the viewer is a
  canvas **overlay** — a view over takes that already exist, opened from
  objects that already render. No new nav surface, no new route, no second
  home for anything. Pulling it out must leave the tile, the bar, and the
  fork flow whole.
- **The keep-list binds** (the review's KEEP section): the viewer *composes
  with* the endpoint grammar, the identity dial, structured mode, the
  presets popover, and the ⌘K index — it replaces none of them. It adds no
  prompt surface, no settings vocabulary, and no second naming convention:
  objects are named by `chainTitle`, takes by `takeNumberOf` (the W9
  one-convention ruling), the hex ids ride tooltips only.

## 2. The surface

**Opened how.** Two ways, both named by the card:

1. **Double-click the tile** (any zoom band, any selection state — the first
   click still selects; the second opens). R2 probed review gestures at
   400% zoom; the affordance must not be band-gated.
2. **A prominent affordance**: the bottom bar's media-context play chip
   becomes **`review`** — it opens the viewer. The tile's media area grows
   a hover affordance in the `PooledVideoCard` overlay pattern — and it
   **OPENS the viewer** (audit T-I2: the pattern supplies the look, not a
   second play path — nothing plays inline; one transport, stated). The
   bar's DOM-querying play/pause toggle retires with it (§8 D5) — after
   this spec there is ONE transport, not two half-ones.

The affordance exists exactly where a reviewable canonical take exists. A
seed tile, a running chain with no prior take, a tombstoned source: no
affordance, no dead click (the bar's `review` chip renders disabled with
its reason, the R-22 gate idiom). The chip mirrors the mid-render rule so
the two mid-render shapes read consistently (audit T-M4): a mid-render
chain WITH a prior canonical take renders `review` enabled — the take
exists and the viewer opens it — while a mid-render takeless chain renders
it disabled with its reason.

**Where it lives.** A **layered canvas overlay** — `StudioDialogLayered`,
the op-editor / crop-editor precedent: Base UI focus trap and restore,
Escape through the §0.2 layer registry (topmost-only), outside-press
dismissal, the canvas alive but dimmed behind it with the selection
preserved. NOT a blocking takeover of the app (the timeline/library
takeover shape is itself a P2-11 finding — this surface does not repeat
it), NOT a floating dock (§8 D1 puts the real alternative on the table),
NOT a new surface in the nav.

**What it renders.** The canonical take at inspectable size:

- **Video takes** — the durable blob artifact through the **video pool**
  (`leaseVideo`, exclusive, `controls: false`): the viewer renders its own
  chrome (§3), never the browser's. Source fallback order matches the tile
  poster's: the content-addressed blob (`documentsApi.blobFileUrl`) first,
  the engine-side source path via the media route second, and where neither
  resolves, the **honest missing-file state** (the failure vocabulary's
  words, never a spinner). A take whose landing errored (`landingError`)
  opens on its humanized verdict — the same one the status ring carries.
  A tile mid-render opens the *last* canonical take if one exists; the
  live progress stays on the tile (one status vocabulary — no second
  progress surface here).
- **Image takes** — the still at inspectable size with zoom/pan (below),
  no transport chrome. A still has nothing to scrub; rendering a disabled
  transport would be the dishonest shape.
- **Audio takes** — v1: no viewer, honestly (§7). The affordance does not
  render for them.

**Zoom.** Fit-to-view default (letterboxed, the crop editor's stage
pattern); wheel over the stage zooms 1×–4×, drag pans while zoomed —
CSS-scaled view over source-true media, the exact idiom the crop editor
proves (including its non-passive callback-ref wheel binding). The wheel
contract is scoped INSIDE the stage only; the canvas's wheel-zoom semantics
are untouched (audit-clean, same ruling as the crop editor).

**Layout.** Header (chain title · take n of N · duration · resolution ·
the `used by` line, §6.2) → the stage → the filmstrip strip (§5) → the
transport row (§3). The dialog sizes to the viewport minus margins; the
stage letterboxes within it.

## 3. The transport

One row, every control R2 enumerated, all keyboard-reachable:

| Control | Shape | Keyboard |
|---|---|---|
| Play / pause | the stage is click-to-toggle (click vs pan disambiguated by a movement threshold) | `Space` |
| Scrub | the filmstrip strip IS the scrub surface (§5) — pointer-down-and-drag scrubs continuously; dragging pauses, release resumes if it was playing | drag |
| Timecode | `S.FF / S.FF · frame n of N` — seconds.frames at the studio's 24 fps convention (the one `FILMSTRIP_FPS`, the filmstrip registration, and `timelineGuides`' `seconds × 24` already share; honest footnote: fps is the registered approximation until real probing lands) | — |
| Frame-step | steps pause first, then seek to the exact frame boundary `n/24` (never a fractional drift) | `←` / `→` = 1 frame; `Shift+←/→` = 1 second |
| Ends | first / last frame | `Home` / `End` |
| Loop | toggle; default **ON** (the review posture — "watch it again" is the norm, R2 had to replay from zero every time) | `L` |
| Mute | toggle; default **muted** (autoplay-safe; audio check is deliberate) | `M` |
| Speed | chip cycling 0.25× / 0.5× / 1× / 2× (`playbackRate`; the slow rates are the motion-inspection tool) | click |
| Use this frame | §4 | `U` |

**The keyboard map is viewer-scoped.** It binds while the layer is open and
releases on close — the `overlayBehavior` scoping (`isTypingTarget` guards
any future fields), the same discipline the menus carry — extended with
the **focusable-chrome guard** (audit T-M3): `Space` on a focused
transport button must activate that button, not double-fire the map, so
the typing-target discipline covers the viewer's own controls too (the
map skips a key whose event target is one of its buttons/chips, not just
text fields). The canvas map
(`v` timeline, `j`/`k` selection walk, `f` fit, `r` rerun, `b` fork, `↵`
op editor, `p` lock, `/`, `⌘K`) is untouched behind it and unchanged when
the viewer is closed. R2 measured `Space`/`←`/`→`/`L` as inert *on the
canvas*; this spec does not spend them there — they live inside the
review surface where they mean what a reviewer expects.

**Take switching.** The header carries the chain's take chips
(`takeNumberOf` vocabulary, canonical starred — the tile's take strip,
rendered once more where the takes are actually watched). Switching swaps
the stage's lease and the strip; the fork-from-earlier-take drift guidance
(the ForkMenu's L28 note) rides the chip tooltips, not new chrome.

## 4. "Use this frame" — the fork/extract handoff

The button pauses, computes **`frameIndex = round(currentTime × 24)`**
clamped to **`N − 1`** (audit T-M1: `N` comes from the approximated
`frameCount = round(duration × 24)`, and `round` can yield exactly `N` at
the last frame) — the same arithmetic `timelineGuides` performs, now
invisible — and opens the fork flow with the substrate **preselected and
pre-anchored**:

- The **extraction is the existing seam, fed the right unit** (audit
  T-C1 — this spec's central fix): the store's fork path extracts
  server-side before creating the chain (`monoka.extractVideoFrame` →
  `POST /api/lan/video/frame`). **The seam's numeric position is
  SECONDS** — it feeds ffmpeg's `-ss` verbatim (core.ts:1263; the batch
  route's own error text says "seconds") — **while `frameIndex` is
  frames** (`inputSpec.frameIndex` is the frame anchor downstream,
  keyframe guides' `round(seconds × 24)`). The two-hop contract, named:
  the viewer computes `frameIndex = round(currentTime × 24)`; the fork
  path passes **`position = frameIndex / 24`** to `extractVideoFrame`;
  `inputSpec` keeps `frameIndex` in frames. (The seam's ambiguity is
  latent today only because the sole numeric ever passed is `0` — frame
  0 ≡ second 0; this spec is the first nonzero consumer, and a literal
  implementation would have sought to second 84 of a 5-second clip.) A
  picked frame is always a non-negative numeric, so the
  `forkFrameIsEndSeek` `'last'` mapping is never in play — it stays as
  the seam for *default* anchoring, untouched.
- The **ForkMenu states the anchor in human terms**: with a frame handed
  in, its extracted-frame row reads "Continue from **frame 84 — 3.5 s**
  (the paused frame)" instead of today's "Extract frame 0 server-side."
  F7's hint text — *"frame index = seconds × 24 · negative counts from the
  end"* — retires from every path the viewer serves. The arithmetic the
  review made the creator do in their head dies here; that is the point.
- The **fork chain's inputSpec carries the truth** (`frameIndex` +
  `extractedPath`, `forkInputSpec` as landed) — provenance persists, the
  derived edge appears for free, and the loop turn continues in the
  existing surfaces (properties → prompt → generate).

One destination in v1: the extracted-frame fork (the loop's continuation
gesture). A second destination — bind the frame as an identity reference —
is deliberately deferred to the reference-binding design item (synthesis
4.4): that round owns the picker/drag ritual, and this spec does not
pre-empt it.

## 5. The filmstrip

The strip renders **under the stage, above the transport row**, full
dialog width — the sprite sheet the server already generates, the same
OPFS-cached sheet the tile's poster path loads where a sheet can exist
(one generation per clip; the route's `x-monoka-filmstrip-generations`
header stays flat when the viewer opens — no second extraction pass; the
third fallback state below names the takes no sheet can exist for):

- **The sheet is the visual; the scrub is the mapping.** The strip's full
  width maps linearly to the clip's duration regardless of cell
  boundaries: pointer-down-and-drag scrubs continuously, the playhead
  marker moves continuously, the sheet cells tile the background. Clicking
  a spot seeks to its time. The strip IS the scrub bar (§3) — one surface,
  not two.
- **Density, honestly.** The sheet samples ≈ `clamp(12, duration×2, 30)`
  frames — a *navigator*, not a per-frame browser. Per-frame inspection is
  `←`/`→` on the stage; the strip gets you to the neighborhood. The
  deferred upgrade (§7) is an on-demand denser strip through `POST
  /api/lan/video/frames` (≤100 positions) — v1 does not re-sample
  anything.
- **Fallbacks — three states, each honest.** (1) No sheet yet (first
  open, generation in flight): the strip renders the plain scrub bar with
  an honest "filmstrip generating…" placeholder cell, then fills. (2)
  Media present, **sheet impossible** (audit T-I1): a take with a durable
  blob artifact and no `previewPath`/source path — the normal
  post-landing blob-only case, where the tile renders the blob video, not
  a poster — can never be served a sheet (the filmstrip route is
  outputDirectory-contained and does not resolve `canvas-blobs/`; the
  extraction seam does — the pattern a route extension would follow, the
  deferred upgrade in §7). For those takes the strip renders the plain
  scrub bar with an honest note ("no filmstrip for this take") — never a
  forever-"generating…" placeholder. (3) No media at all: the strip is
  absent with the missing-file state (§2) — never a dead strip.

The card's AC is blunt about the before-state: *0 filmstrip elements exist
in the DOM today*. The strip is the machine's first real home.

## 6. The comparisons and the reverse view

### 6.1 Side-by-side take comparison (reach-for #8)

R2: *"Takes section lists takes as hex chips; no A/B view of two clips (the
fork feature implies comparing forks)."* The fork gesture exists; the
gesture that judges it does not. **v1 shape:**

- **Entry**: a `compare` chip at the end of the take strip. Candidates list
  this chain's other takes first (the A/B fork case), then the **fork
  neighborhood** — parents and forks, the exact walk the bottom bar's
  fork-history chips already compute over `collectOutputRefs`.
- **Two panes, one clock.** The stage splits into two letterboxed panes
  (side-by-side; stacked for portrait aspects), each a pooled video lease
  in the pool's **`exclusive: false` mode** — the explicitly supported
  "coexisting inspectors" case (the pool's own comment names it). ONE
  shared transport: the playhead seeks both panes to the same seconds,
  play/pause/speed/loop drive both. When durations differ, the shorter
  pane holds its last frame with an on-strip note ("take 2 ended — holding
  its last frame"); the clock is the truth, not a pretense of sync. (With
  loop ON and differing durations, the hold rule governs across the wrap:
  the shorter pane holds its last frame through the clock's tail and
  re-joins when the clock comes back under its duration — no pane ever
  runs its own clock, audit T-M2.)
- **"Use this frame" in compare mode** applies to the focused pane (click
  to focus; the focused pane carries the ring). The A/B question is "which
  one do I keep chaining from" — the answer is a frame anchor on the
  winner.
- **Deferred**: more than two panes, unsynced independent playback,
  onion-skin/diff overlays, and any-clip-any-project candidates (§8 D3
  fixes this cutline).

### 6.2 The "where is this used?" reverse view (reach-for #7)

R2: *"every chain knows its refs; no surface answers the inverse (identity
drift debugging starts here)."* The inverse walk already exists — the
bottom bar computes it per selection (`forkHistory` over
`collectOutputRefs`); it just renders as a count, not as destinations.
**v1 minimal:** the viewer's header carries a **`used by →`** line — one
chip per consuming chain, named by the `chainTitle` convention, click =
close the viewer + select the chain + camera fly to its tile
(`requestCamera({ kind: 'fly' })`, all landed). The walk itself moves to
`derive.ts` as a pure helper both surfaces share — one inverse, two homes.

The **full** inverse (every project/library reference to this file, by
content hash) is deferred to the hash-catalog/library round — that is a
cross-project asset index, not a canvas projection (§8 D4).

## 7. What this spec does NOT do

- **The reference-binding rework** (synthesis 4.4 — the picker + drag
  ritual). This spec's frame handoff stops at the fork. Overlap is the
  thing to avoid: the viewer picks a *frame*, the binding round picks a
  *source object*.
- **ETA / queue honesty** (F5) — the progress surface's row; the viewer
  renders takes, not jobs.
- **Editing** — no trim, no splice, no in-viewer ops. The trim/join
  endpoints and the timeline's gap menu own assembly; the viewer *reviews*
  (the op editor stays the op surface, modal-only per L8).
- **Audio takes** — v1 carries no audio viewer. The honest absence: no
  affordance, no dead click. A waveform transport is its own small round
  if audio takes become a real lane.
- **The gallery / library IA** (5.1, jxb34l0) and **elapsed/ETA**
  (synthesis 2.1) — their rows, untouched.
- **Node delete, job recovery, tier honesty** — the FIX-NOW cards' rows
  (several landed); nothing here depends on or duplicates them.
- **A denser strip** (on-demand `video/frames` re-sampling) and **latent
  continuation remediation** (F6's pack install — owner recorded in the
  wizard rework §6: jxb34l0, an AC row there at blessing)
  — named, deferred.

## 8. The blessing decision points

Where this draft made judgment calls the maintainer should confirm:

- **D1 — overlay vs floating dock.** Rec: the layered overlay
  (`StudioDialogLayered`) — review is a summon/act/dismiss act; Escape,
  focus trap, and the canvas-keymap scoping come free; the op editor and
  crop editor set the media-inspection precedent. The alternative — a
  floating dock (the AudioDock/`dockDefaultGeometry` pattern) — keeps the
  canvas fully live behind the review, but fights the keymap, adds
  geometry management, and makes a focused act into a persistent thing
  (the docks are companions; review is not one).
- **D2 — unify with the workbench/library viewers now or later.** Rec: the
  viewer's core (stage + transport + strip + frame handoff) lands as ONE
  shared component in `src/media/` beside `PooledVideoCard`; the canvas
  overlay mounts it in v1, the library cards and the images workbench
  adopt it opportunistically AFTER v1 (the workbench's pick surface is
  T=1 stills with a different job — forcing it in now doubles the round).
  The alternative — build canvas-local, unify "eventually" — is how a
  codebase ends up with three viewers.
- **D3 — the comparison cutline.** Rec: 2-up, one shared clock, candidates
  = the chain's takes + the fork neighborhood; defer >2 panes,
  any-clip-any-project, unsynced playback, onion-skin/diff. The
  alternative — any-object candidates in v1 — is one picker away but grows
  the round by a browser surface; the fork A/B is the case R2 actually
  reached for.
- **D4 — the reverse view in v1 or deferred.** Rec: v1 minimal (`used by`
  chips + fly — the walk exists, the naming convention exists, the cost is
  a header line); the asset-hash inverse rides the hash-catalog round.
  The alternative — defer entirely — saves a line and leaves reach-for #7
  unanswered another round.
- **D5 — the bottom bar's play chip.** Rec: it becomes the `review`
  affordance and the DOM-querying toggle dies (one transport; the tile
  stays a poster unless the viewer is open). The alternative — keep the
  quick play/pause beside `review` — preserves a zero-cost convenience but
  keeps two transports with different vocabularies on one bar.
- **D6 — transport defaults and zoom in v1.** Rec: loop ON, muted, 1×,
  fit-view, with wheel-zoom 1×–4× + drag pan shipping in v1 (the
  crop-editor idiom, proven; motion inspection at 2–4× is a real review
  need, not gold-plate). The leaner alternative — fit-only v1, zoom in a
  follow-up — is defensible if the round needs to shrink.

## 9. Acceptance criteria — the review shape

The card's ACs (foelihc: pa7ms3y, svpliub, lsyg61y, 1ewnizz) carry forward
verbatim as the contract; this section fixes the *evidence shape*:

1. **The R2 repro, answered in one gesture.** With a landed clip, the
   question *"is the motion right at second 3?"* is answerable by opening
   the viewer and ONE scrub gesture (double-click → drag to 3 s → the
   frame is on screen, the timecode names it `3.00 · frame 72`). Before:
   watch the whole clip repeatedly (F4, measured). Reproduced in e2e
   against the mirror engine with screenshots at the paused frame.
2. **The gesture accounting, before → after** (R2's method — a click, a
   keypress, or a purposeful drag each count as one):

   | The turn (chained generation) | Before (R2, measured) | After (target) |
   |---|---|---|
   | Review the clip | play chip + full replays, no scrub — 2+ | double-click (1) + scrub/step to the anchor (1–2) |
   | Chain from the right frame | produce menu + fork + **frame arithmetic in the head** (1–2, and F7 got it wrong) | `U` — use this frame (1), anchor pre-set |
   | Set the continuation prompt | find props + scroll (1–2 + scrolls) | unchanged (1) — the fork lands in properties as today |
   | Verify tier + generate | 2 | 2 (tier honesty is g1girm8's row, not this spec's) |
   | **Total** | **~14 measured** (happy path 9–12 + scrolls) | **~7–8** (2–3 + 1 + 1 + 2, plus the untouched panel scrolls — R2's P2-8 row is jxb34l0's) |

   The delta is this spec's alone to claim: the review row and the anchor
   row. The honest after-total is **~7–8, not R2's "~6"** (audit T-I3:
   that number assumed the F8 binding ritual also fixed, which this spec
   defers) — the ledger is defensible at the number it names. Measured in
   the walkthrough, not asserted.

3. **The transport contract, proven e2e**: scrub seeks (pointer-drag on
   the strip), timecode reads `S.FF · frame n of N` at 24, `←`/`→` land on
   exact frame boundaries (`currentTime ≡ n/24`), `Shift+←/→` one second,
   `Home`/`End`, loop, mute, and each speed step. The keyboard map is
   viewer-scoped: while open, the canvas map is inert; closed, it is
   byte-identical to today's.
4. **"Use this frame" e2e against the mirror engine**: scrub → frame-step
   to a mid-clip frame → `U` → a fork chain exists whose `inputSpec`
   carries `frameIndex` equal to the paused frame and whose
   `extractedPath` resolved through `POST /api/lan/video/frame` — **and
   the RIGHT frame is verified** (audit T-C1: the two original assertions
   hold while extracting the wrong frame, since the seam's position is
   seconds): the request body's `position` ≡ `frameIndex / 24` asserted
   on the request, or the extracted image compared against the paused
   frame; the ForkMenu states the anchor in human words; **no
   frame-index arithmetic is visible anywhere on the path** (F7's hint
   text gone).
5. **The filmstrip renders**: the strip's cells are in the DOM (0 →
   present), served by the SAME cached sheet the tile poster path loads
   when one exists (the route's generations counter does not bump on
   viewer open — the tile already fetched it; that counter condition
   holds for preview-path takes, the only kind a sheet exists for —
   §5's second state); the playhead is continuous across the strip's
   full width; scrubbing the strip seeks; a blob-only take renders the
   honest plain-bar state, never a forever placeholder.
6. **Honest states, no dead clicks**: a seed tile carries no affordance;
   the bar's `review` chip on a takeless chain is disabled with its
   reason; a missing artifact opens the honest missing-file state; an
   image take opens zoomable with no transport chrome; an audio take
   offers nothing.
7. **Comparison (per §8 D3 as blessed)**: two panes hold one shared clock
   — both at the same seconds, the shorter pane's hold stated on the
   strip; both leases coexist (pool `exclusive: false`).
8. **The reverse view (per §8 D4 as blessed)**: the `used by` chips equal
   the `collectOutputRefs` walk's output for the take's output; a click
   closes, selects, and flies.
9. **The modularity test** (every architectural decision): the viewer is
   one removable layer. Pull it out — the tile renders, the bar makes
   sense, the ForkMenu works with its default anchors, the timeline and
   library are whole. It composes with the keep-list (endpoint grammar,
   identity dial, structured mode, presets, ⌘K) and replaces none of it;
   that is the acceptance question for review.
10. **Test homes** per [docs/agent/testing.md](../agent/testing.md): the
    pure parts (frame math, timecode formatting, strip-time mapping, the
    candidates list, the used-by walk extracted to `derive.ts`) land in
    the vitest suites under the port-allocator discipline; the journey
    e2e lane drives open → scrub → step → use-this-frame against the fake
    engine end to end. No new standalone scripts.

---

*Drafted 2026-10-17 against `main` @ 86c7f91 (post the uxfix batch, docs
head). r2, 2026-10-17: the pre-blessing audit's findings applied — T-C1's
unit contract at the extraction seam + the AC-4 right-frame assertion,
T-I1's third strip state, T-I2's hover-opens-the-viewer, T-I3's honest
~7–8, T-M1's N−1 clamp, T-M2's loop/hold line, T-M3's focusable-chrome
guard, T-M4's review-chip consistency, and the F6 owner pointer (CT-3).
Corrections arrive as dated addenda per convention; the blessing ruling
flips the status line to BLESSED and settles §8.*
