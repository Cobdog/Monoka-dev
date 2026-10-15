# R2 — The working loop (blind adversarial review, 2026-10-15)

Reviewer 2 leg: once a first clip exists — reviewing it, chaining the next generation from it, attaching/managing references, and the prompt surfaces along the way.
Environment: app http://127.0.0.1:17680 (fresh home `ux-home-2`), engine http://127.0.0.1:17651 (RTX 3090, shared with other reviewers — wall times are upper bounds). Driven with Playwright + /usr/bin/chromium; screenshots cited as `r2-shots/NN-*.png`.

## Wall times (UX data)

| Event | Wall time | Notes |
|---|---|---|
| Enter → auto-run starts | ~3 s | auto-submits at Quality tier |
| Stop a just-started run | 2.6 s | works |
| "Fast · 4-step" render (cold) | **19.8 min** | engine actually ran **30 steps** (F3) |
| Quality render (warm, turn-1) | **~17.5 min** | 30 steps |
| Turn-2 chained render (Quality, warm) | **18.0 min** | fork→extracted frame→new prompt→generate; landed (`88-turn2-landed-final.png`, second clip on canvas) |
| One loop turn, prompt-to-next-prompt | **~19 min render + ~14 gestures** | see accounting |

## What actually works (credit where due)

- **The `//` presets popover** (`83-presets-trigger.png`): 206 items, categorized (Camera 42, Lighting 26, Audio 23…), each with a plain-language gloss ("Slow Push In — Gentle approach toward the subject"). This is the best prompt surface in the app.
- **Structured mode** (`82b-structured.png`): Concept / Subject (pinnable) / Setting / Lighting / Style / Camera / Soundscape / Music / Dialogue — a real storyboard form.
- **Reference binding + identity dial** (`81-refs-after-bind.png`): once bound, the panel shows "1 of 9 slots", the bound picture, "clear canvas refs (1)", and a **stiff↔drift** slider with an honest explainer ("Stiff preserves the reference identity exactly; loose lets the take drift with the prompt"). The mode label updates to `reference → video`.
- **Consume/produce endpoints** on nodes are a clean chaining vocabulary (head = inputs, tail = extensions) — when the options actually exist (F12).
- **Honest step telemetry while sampling** on the Quality path: "25% · Sampling · step 8 of 30" — the right idea; it just stops short of an ETA (F5).
- The **⌘K index** quietly knows about jobs (running/stop, completed, "cancelled — not on an open canvas") and has a `trash` browser — real system bones, hidden behind a hotkey (F7).

## Ranked punch list

### P0 — experience-breakers

#### F1 — A render that outlives its tab is lost, even when it SUCCEEDS; the palette knows, the canvas doesn't
- **What's wrong:** Output delivery is driven by a live browser session. Sequence verified twice: (a) a run at 4% vanishes when the tab closes — node resets to a pristine seed, no error anywhere (`13-after-reload.png`); (b) a run that was **mid-sampling** stayed visible to a *fresh* session (`19-reopened-midrun.png`, "79% · Sampling · step 25 of 30" — run state is server-visible), the originator tab then closed, the render **succeeded engine-side** (`23-after-gen1-complete.png`), and the clip never landed: 0 rows in `jobs`/`canvas_output` (sqlite dump), 0 `<video>` in the app, while the engine's history holds `video/Canvas_H3_….mp4`. The ⌘K palette even lists "job · completed — A red paper plane… Motio…" (`84-index-palette.png`) — the system knew; clicking the row recovered nothing onto the canvas.
- **Why it matters:** one accidental refresh in ~20 minutes of GPU time = silent total loss, with the evidence of the loss hidden in a hotkey palette. For an impatient solo creator this is the worst possible failure shape: success-shaped silence.
- **Simple version:** the server owns job records end-to-end; on completion it harvests the engine output onto the chain regardless of who's connected. Session reconnect adopts in-flight runs (the state half already works).

#### F2 — The "generate" button can silently do nothing, or silently do something else
- **What's wrong:** after the F1 orphan state, the properties **generate · text → video** button remains enabled but a click produces no request, no error, no state change (network + ws traced: only idle status pings — `32-after-gen-click.png`, `33-gen-click-2.png`). In one instance the same click instead silently **spawned an empty image seed node** (`canvas_chain` row `kind: h3img, intent: ""`; the stray "h3img 2" tile in `36-zoom-fit-all-nodes.png`). Two identical-looking attempts, two different non-outcomes; the loop restarts only by typing a brand-new prompt in the bottom bar.
- **Why it matters:** the primary button. A dead click teaches the creator the app is unreliable; a click that spawns `h3img 2` teaches them nothing at all (the name explains nothing and the node cannot be deleted — F10).
- **Simple version:** one submission path with inline refusal messages ("this chain is mid-cancel; retry in 2 s" / "settings unsaved"). Never spawn nodes as a side effect of generate.

#### F3 — "Fast · 4-step" ran 30 steps; the second Fast attempt errored with a fix that contradicts itself
- **What's wrong:** the Speed tier radios advertise `Quality / Fast · 4-step / Fast · 8-step`. The successful Fast submission's engine graph shows `BasicScheduler steps=30` — 7.5× the advertised steps, 19.8 min wall (engine history, prompt d2f078ed). The next Fast attempt refused: "The H3 stack is incomplete — the render is missing the turbo LoRA for the selected speed tier. Fetch them in Settings → Fetchable items…" directly above "Not fetchable through the library — the model catalog carries no turbo LoRA rows" (`42-turbo-error-state.png`). The app knows exactly which turbo options are installed (it marks 6 of 9 combobox entries "(not installed)") and still presents all three tiers as live.
- **Why it matters:** the creator plans iteration cadence around tier names. "Fast" that takes 20 min, or Fast that errors with two contradictory remediation paths, breaks planning twice over.
- **Simple version:** derive the tier radios from engine inventory; annotate Fast as "unavailable — missing turbo LoRA (install from the Packs board)" or state the honest fallback ("will run 30 steps ≈ N min"); one remediation path, not two.

#### F4 — The clip review surface is play/pause. That's all.
- **What's wrong:** after a clip lands, the tile shows the video as a **poster** (`canvas-tile-poster`, `preload=metadata`, no controls — `58-media-tile-dom.png`). The ONLY transport is a transient play chip in the **bottom bar** that appears when the take is selected (`67-play-location.png`): it toggles play/pause. No seek bar, no timecode, no frame-step, no filmstrip (0 filmstrip elements in the DOM at any zoom — probed to 400%), no loop, no speed, no mute, no still-frame export from the viewer. Keyboard: Space/←/→/L all do nothing. You cannot answer "is the motion right at second 3?" without watching the whole clip, repeatedly.
- **Why it matters:** reviewing IS the loop. Every turn starts with "look at what I got" — and looking is the one thing the app makes hard. This is the gap a fast-iterating creator feels first and always.
- **Simple version:** a take viewer with scrub, timecode, frame-step (←/→), loop, and "use this frame" — one surface, opened by double-click or a big affordance on the tile; the filmstrip can live there. (The extract-frame op already renders frames server-side — point it at a picker.)

### P1 — loop-defining gaps

#### F5 — No ETA and no queue honesty during 20-minute renders
- The Quality path shows "Sampling · step 8 of 30" (good) but never an ETA, never a queue position, and the Fast path's progress sat pinned near 60% through most of its 19.8 minutes with the same stage label (shots `16/17-gen1-*` taken 30 s apart). On a shared engine the creator can't tell "my 30 steps" from "someone else's job".
- **Simple version:** ETA from measured s/step history + queue depth; stage names a human can act on.

#### F6 — "Continue from this take" — the loop's headline action — is disabled on a stock engine
- **What's wrong:** the produce-into menu's `Continue from this take (no re-encode)` is disabled with "Latent continuation needs the ComfyUI-H3-Motion-Context custom nodes — install the pack manually, then refresh the engine" (`71-media-produce-menu.png`). Adjacent: "Music 3 — a complete song" disabled "pending the YuE2 decision" — an internal roadmap decision surfaced as UI.
- **Why it matters:** the charter flow ("continue the clip from its last frame") dead-ends on first contact, and the remediation leaves the app entirely.
- **Simple version:** either ship the pack through the Packs board with one-click install from this row, or promote the working substitute ("continue from last frame via extracted still") into the disabled row's place.

#### F7 — The frame-fork anchors on frame 0 by default — a "continuation" that starts over
- **What's wrong:** `Fork — extracted frame` extracts with "frame index = seconds × 24 · negative counts from the end" as hint text — the default extracted `frame_at_0-00_….png`, the FIRST frame (`81-refs-after-bind.png`). My turn-2 "continuation" therefore re-rendered from the clip's opening image. There is no frame picker (no filmstrip exists to pick from — F4); the creator must do index arithmetic in their head.
- **Why it matters:** the one chaining path that works on a stock engine silently does the wrong thing for its most common purpose (continue from the end).
- **Simple version:** default −1 (last frame) for forks made from a clip's tail endpoint, and a tiny scrubber/frame thumbnails in the fork dialog.

#### F8 — Binding a reference is an order-of-operations ritual the UI only explains after you fail
- **What's wrong:** the consume-from menu opens with "Add as reference — Select the object to consume from first — click it, then open this menu" (`77-consume-menu.png`) — instructions for a gesture you've already completed incorrectly. The working sequence (select source tile → open target's head endpoint → Add as reference → verify in target's References section) is 4+ gestures with zero on-canvas affordance (drag-from-tile? nothing suggests it).
- **Why it matters:** references are the identity story ("bind a picture for the subject"); the friction lands exactly where the app's value proposition lives. (Once bound, the slot UI is good — credit above.)
- **Simple version:** "Add reference" button in the References section that opens an object picker (recent outputs first), plus drag-a-tile-onto-a-tile as the power path.

#### F9 — "gallery" is a component style guide, not a gallery of the creator's work
- The nav link `gallery` opens "Component gallery — 16 components · 122 cells · 21 justified N/A": buttons rendered in hover/focus/busy states (`25-gallery.png`). There is no outputs shelf anywhere except the `library` drawer (which is good — `68-library-with-output.png` — and lists takes with provenance).
- **Simple version:** rename the component gallery (it's a design-system audit), and promote the library drawer's outputs view to a first-class surface (or the nav word "gallery" to it).

#### F10 — You cannot delete a node
- **What's wrong:** with a stray `h3img 2` tile selected: no delete/trash affordance on the tile, in the bottom bar (its chips are `op / ops ↵ / properties / fork`), or in a properties panel; right-click yields no context menu; the Delete key is a no-op (tile count unchanged — `85-delete-attempt.png`). A `trash` entry exists in the ⌘K palette (browse/restore), which implies deletion exists somewhere — it is not discoverable from the object that needs deleting.
- **Why it matters:** iterating means spawning wrong things (the app itself spawns strays — F2); an infinite canvas that can't be tidied becomes a landfill. My own canvas accumulated 7 tiles in 90 minutes, several accidental.
- **Simple version:** delete on the tile (context menu + Delete key with undo toast), matching the trash browser that already exists.

#### F11 — Enter auto-fires a 20-minute GPU job before any setting is seen
- Typing in the entry bar and pressing Enter immediately submits at the Quality default: "running, 4%" 3 s after Enter (`37-turn1-enter.png`). Tier/duration/ratio were never chosen (they live in node properties).
- **Simple version:** Enter spawns the node with prompt focused; auto-run only after the first completed generation (or make the entry bar's tier chip visible and settable before Enter).

### P2 — jargon, labels, polish

#### F12 — The status bar speaks machine
- Selected-tile bottom bar: `h3img 2 | text → video | idle | no identity payload | drift · 0 hops | no takes | no forks yet | unlocked | P | fork | B` (`84-index-palette` session, `85-delete-attempt.png`). "No identity payload · drift 0 hops" is the implementation's diary, not creator status. The take chip shows a raw hex id (`f37f14d0`). Node badges `unlocked P` / `fork B` expose hotkey mnemonics as labels; the `unlocked P` tooltip is "Lock — propagation is gated; every take stays resident" (doctrine, not help) and `fork B`'s tooltip is empty.
- **Simple version:** one line of human status (media · duration · tier · takes); hotkeys in tooltips, not labels; take names like "take 2" with the hex in a details pane.

#### F13 — Internal strings leak as creator-facing titles
- The ⌘K palette lists a canvas object titled `integrated_multimodal_description: [Shot 1] //` — an API field name promoted to a title (`84-index-palette.png`). Auto-named nodes (`h3img 2`, `image 4`, `image 6`) carry no memory of what they are. The library drawer footer: "V cycles · timeline → library → canvas · projections inherit the no-silent-failure contract" — engineering doctrine in a footer.

#### F14 — The entry bar is two bars, and sometimes neither
- First-run placeholder: "Describe the shot… (/ to focus · Enter to spawn)"; steady state: "Describe a shot — Enter spawns it at the bar"; while properties are open the bar disappears entirely (automation waits time out on it). The fast path to "one more clip" vanishes exactly when the creator is deepest in a clip.

#### F15 — Wizard verdicts contradict the header
- The Models step says "The H3 stack is incomplete" on the same screen whose header chip reads "H3 engine ready" (`05-wizard-step.png`); the same contradiction drives F3's tier fiction. (Onboarding flow depth is Reviewer 1's leg; the contradiction itself is loop-relevant.)

## Gestures per loop turn (measured)

Turn = review the clip → chain the next generation → set its prompt → launch. Counting a click, a keypress, or a purposeful drag as one gesture; scrolls to reach panel sections count as one each.

**The happy-path turn (all features working, warm engine):**

| Step | Gestures | Notes |
|---|---|---|
| Select the clip tile | 1 | click poster |
| Play/pause to review | 2 | play chip in bottom bar; replay to re-check = 1 more each time (no scrub — F4) |
| Open produce-into menu | 1 | tail endpoint |
| Choose the chain path | 1 | e.g. Fork — extracted frame |
| (Fix the frame anchor) | (1–2) | only if you notice it defaulted to frame 0 — F7 |
| Find + open the new chain's props | 1–2 | it opens on spawn — but the panel is ~4 screens tall; scroll to prompt ≈ 1, scroll past engine jargon |
| Edit the continuation prompt | 1 | Chain prompt box |
| Verify tier | 1 | (or eat a 20-min surprise) |
| Press generate | 1 | |
| **Total** | **9–12 gestures + 2 scrolls** | then ~20 min of render with no ETA |

**What it should be:** select clip (1) → scrub/frame-step to the anchor frame (2–3) → "continue from here" (1) → tweak prompt (1) → generate (1) = **~6 gestures** and the review step actually works. The delta is mostly F4 (no review), F7 (wrong anchor default), and F8 (binding ritual).

**One measured turn end-to-end:** ~14 gestures, 18.0 min render wall (turn-2, completed and landed on canvas — `88-turn2-landed-final.png`). Getting to that clean turn required four generate attempts across the session (two silent no-ops F2, one Fast refusal F3) — the retry tax is part of the loop as shipped.

## What a fast-iterating creator reaches for and doesn't find

1. **Scrubbing/timecode/frame-step on a clip** — doesn't exist (F4). The single most-reached tool in video iteration.
2. **"Continue from the end"** — disabled without a pack install (F6); the working substitute anchors on frame 0 (F7).
3. **A delete for nodes** (F10).
4. **An ETA / queue position** during long renders (F5).
5. **Fast iterations** — the Fast tier is fiction on a stock engine (F3).
6. **Recovery of a render after a refresh** (F1) — and the palette row that proves the system knew.
7. **A "where is this image used?" reverse view for references** — every chain knows its refs; no surface answers the inverse (identity drift debugging starts here).
8. **Side-by-side take comparison** — Takes section lists takes as hex chips; no A/B view of two clips (the fork feature implies comparing forks).

## Loop verdict

The loop's bones are right — chain/seed/take vocabulary, endpoint menus, reference slots with a stiffness dial, a presets library worth browsing — but the working loop today is: *type → Enter → 20 min → pray the tab survives → play once (no scrubbing) → fork from the wrong frame → 20 more minutes.* The distance from here to "impatient creator iterating in flow" is: server-owned jobs (F1), a real review surface (F4), honest tiers (F3), last-frame default (F7), and delete (F10). None of them require re-architecting the canvas; all of them are currently the difference between a demo and a tool.
