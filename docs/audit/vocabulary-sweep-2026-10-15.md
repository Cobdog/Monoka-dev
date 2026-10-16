# The vocabulary sweep — 2026-10-15 (et8hu1l)

R3 P1-7 / R2 F12-F13 (docs/audit/ux-review-2026-10-15/): insider ids,
machine labels, and doctrine copy out of user-facing surfaces. One row per
change; grouped by the audit's three classes. Internal comments, test names,
and docs/ are deliberately untouched — this was a user-surface sweep, not a
code-comment purge.

Pinned by the `(v)` section of `tests/canvas.test.js` (verbatim absence of
every stripped needle in the swept files) + the human-bar e2e lane in
`e2e/canvas.spec.ts`.

## Class 1 — internal tracker ids and design-decision notes

| # | Surface | Was | Now |
|---|---------|-----|-----|
| 1 | Launcher, video chip tooltip (first run) | `New seeds spawn as VIDEO chains — the derived mode follows what you later bind (R-23)` | same sentence, `(R-23)` dropped |
| 2 | Datasets titlebar, Settings button tooltip | `Settings — docked right here (R-21: opening it never leaves this surface)` | `Settings — docked right here; opening it never leaves this surface` |
| 3 | H3 Image Workbench, Settings button tooltip | same as #2 | same as #2 |
| 4 | Settings, Krea 2 section heading note | `Availability + recipe readout — the real editing UI lives on the canvas/workbench surfaces (the settings exit, R-15).` | `Availability + recipe readout — the real editing UI lives on the canvas and workbench surfaces.` |
| 5 | Datasets titlebar, interpolator chip tooltip | `rife-ncnn-vulkan absent — minterpolate fallback (A1 final)` | `(A1 final)` dropped |
| 6 | Workbench, semantic-overflow tooltip | `Semantic-only overflow beyond 9 — expert-experimental, off by default (demoted per decision 4)` | `(demoted per decision 4)` dropped |
| 7 | Audio-lane paused reason (AudioDock note + Properties hint/title) | `The audio lane is paused pending the YuE2 decision — Music 3 authoring returns with it.` | `The audio lane is paused for now — Music 3 authoring returns in a later update.` |
| 8 | BottomBar multi-generate toast | `…queued — L26: generations serialize by default.` | `…queued — generations run one at a time.` |
| 9 | BottomBar rerun tooltip | `Rerun this chain — one gesture (principle 5)` | `Rerun this chain (R)` (the hotkey moved in, the principle ref out) |
| 10 | ForkMenu earlier-take tooltip | `Fewer hops from the anchor — re-anchoring a drifting identity forks better from an early take (L28).` | `{take id} — recorded {time} · forking from an earlier take re-anchors an identity that has drifted` |
| 11 | Tile latent blocks aria-label | `Latent blocks (zoom-gated, L9)` | `Latent blocks (visible when zoomed in)` |

## Class 2 — the machine status bar (R2 F12's simple version: media · duration · tier · takes)

| # | Surface | Was | Now |
|---|---------|-----|-----|
| 12 | BottomBar identity readout | `no identity payload` / `identity "…" · 0.80` | removed from the bar — identity subject + strength live in the properties panel |
| 13 | BottomBar drift readout | `drift · 0 hops` (+ raw per-hop metrics) | removed from the bar — hop/drift facts stay on the document, not in the creator's face |
| 14 | BottomBar takes chip | `take f37f14d0 +1` | `take 2 +1` — take number via `takeNumberOf` (chronological, oldest = 1); the hex rides the chip's tooltip |
| 15 | BottomBar lock chip | label `unlocked P`; unlocked tooltip `Lock — propagation is gated; every take stays resident` (doctrine) | label `unlocked`; tooltip `Lock — freeze this chain; upstream changes stop flowing into it (P)` (locked variant keeps its sentence, gains `(P)`) |
| 16 | BottomBar fork chip | label `fork B`, empty tooltip | label `fork`; tooltip `Fork — start a new chain from this one's current take (B)` |
| 17 | BottomBar rerun chip | label `rerun R` | label `rerun`; the `(R)` lives in the tooltip |
| 18 | BottomBar media bar ops chip | label `ops ↵` | label `ops`; tooltip `Open the op editor (↵)` |
| 19 | BottomBar NEW facts | — | duration chip (`6s`, only when a take carries a duration) + tier chip (`quality` / `fast`, the panel's own tier vocabulary) |
| 20 | Tile canonical take chip | raw hex id | `take N`; hex moved into the chip tooltip |
| 21 | Tile prior-take chips | raw hex ids | `take N`; hex into each chip tooltip |
| 22 | ForkMenu earlier-take rows | `take 2 · f37f14d0` + note `… — pre-drift anchor` | `take 2` + note `recorded {time}`; hex into the row tooltip |
| 23 | ⌘K palette take rows | `take f37f14d0` | `take 2`; note carries `{hex} · {project} · prior/canonical` (hex search still matches, and now shows what matched) |
| 24 | Properties take rows (the details pane) | `f37f14d0` | `take 2 · f37f14d0` — the pane keeps the hex per the simple version and gains the shared number |
| 25 | Object titles (tiles, ⌘K palette, outputs library via `titleFor`) | a structured prompt titled its object `integrated_multimodal_description: [Shot 1] …` verbatim (F13) | the leading field labels (`integrated_multimodal_description` / `overall_soundscape` / `non_diegetic_music`) and `[Shot N]` markers strip before the title derives — titles read the human words |

## Class 3 — doctrine copy where a sentence would do

| # | Surface | Was | Now |
|---|---------|-----|-----|
| 26 | Timeline footer | `V cycles · timeline → library → canvas` + `projections inherit the no-silent-failure contract` | the doctrine span is gone; the navigation line stays |
| 27 | Library drawer footer | `V cycles · timeline → library → canvas · projections inherit the no-silent-failure contract` | `V cycles · timeline → library → canvas` |
| 28 | BottomBar lock tooltip | doctrine (`propagation is gated; every take stays resident`) | help (see #15) |

## Judged out of scope this pass (the entrenchment notes)

- `Benchmark.tsx` (`L33 rendering-budget harness`) — mounts only on the
  bench-mode dev route; the dev gallery's own finding, not a product surface.
- `handoffClasses.ts` (`…dead-end (R-19)`) — an internal handoff-validation
  string consumed by the suites; never rendered on a product surface.
- The StructuredPromptEditor's "identity payload" vocabulary (pin badge,
  aria-labels, option, toast) — that section's own feature name, used
  consistently; renaming it is product naming, not string hygiene. Flagged
  for the design round alongside F12's remaining half.
- Hex FALLBACKS for unnamed objects/layers (EndpointMenu header, datasets
  layer lists) — the only identifier an unnamed object has; not a take-id
  leak.
- `V cycles · timeline → library → canvas` — a navigation description, kept.
- Settings printing the engine's raw 45-file registry — R3 P1-9, routed to
  the design round by the audit itself.
- Pre-existing, adjacent, not vocabulary: `titleFor` splits first lines on
  periods, so a cut time (`At 00:04.000, …`) truncates a title at `At 00:04`.
  Noted for whoever next touches titleFor.
