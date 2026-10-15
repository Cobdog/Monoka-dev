# R1 — LAUNCH TO FIRST LIGHT (blind adversarial UX review)

**Leg:** never-configured install → first real generated clip back on the canvas.
**Instance:** app at http://127.0.0.1:17670 (fresh home `/home/agent/tmp-gpu/ux-home-1`), real engine at http://127.0.0.1:17651.
**Driver evidence:** screenshots + a11y dumps in `/home/agent/tmp-gpu/ux-review/r1-shots/` (cited below as `NN-name`); driver scripts in `/home/agent/tmp-gpu/monoka-fresh/.r1-driver/`.

## Headline number

**Launch → clip back: 23m34s** (20:29:27.971Z first navigation → 20:53:01.670Z landing toast). Breakdown:

| Phase | Clock (UTC) | Duration |
|---|---|---|
| App load → first content paint | 20:29:27.97 → 20:29:28.6 | **0.6s** (DCL 0.12s) — excellent |
| Wizard auto-opens over blank canvas | at first paint | immediate |
| Type engine address + Test → "Engine reachable — cuda:0 RTX 3090" | 20:31:06.20 → 20:31:06.9 | **0.7s** for the Test itself |
| Wizard steps 2–4 (Models → Node packs → First prompt) | 20:31:29.9 → 20:32:13.3 | ~44s incl. my reading |
| Type prompt → "Create the first chain" click | 20:32:30.15 | — |
| **Launch → submit** | | **3m02s** |
| Submit → first attempt CRASHES at 1% | 20:32:30.88 → 20:32:31.1 | ~0.3s |
| Hidden auto-retry queued (engine /free reset + tiled VAE, live preview dropped) | 20:32:34.11 | 3.2s gap |
| Retry samples (Quality 30-step default, ~35s/step) | ~20:32:36 → 20:51:31 | **~17m55s** |
| Opaque "Loading or processing workflow stage" at 95% (video decode) | 20:51:41 → 20:53:01 | 80s |
| **Submit → clip lands** | | **20m32s** |

The clip is real and healthy: 5.167s, 1344×768, plays in the tile (`19-clip-playing`), file at `data/output/canvas-media/Canvas_H3_1792096350196_00001_-d362f8c1.mp4`. State survives reload (wizard stays gone, canvas+clip restore) — `20-after-reload`.

---

## The punch list (ranked)

### P0-1 — The default "live preview" setting crashes every first generation; a hidden retry saves it 3 seconds later, silently minus previews

- **What happens:** The canvas render path hard-codes `livePreview: { enabled: true, mode: 'standard' }` (`src/canvas/generation.ts:510`), so the app server asks the engine for native sampler previews (`extra_data.preview_method: 'taesd'`, `server/core.ts:2557`). On this real engine that request dies inside ComfyUI's previewer construction (`'NoneType' object has no attribute 'show_progress_bar'` at `latent_preview.py:109` — the TAEHV `taeh3` decoder loads with a null first-stage model). Verified in engine history: my first prompt (`c928ce8e`) errored 0.3s into execution. 3.2s later the app auto-retried: `/free` engine reset, tiled-VAE graph, resubmitted **without** previews (`d2f078ed`) — and that renders fine. Another reviewer's job carrying `preview_method: taesd` failed identically.
- **What the user sees:** the tile flashes **"1% Execution failed — finishing up"** (`12-chain-created-settled`, `13-failure-aftermath`) and then, with no action, starts climbing again. Failure → un-failure inside 4 seconds. If the retry ever doesn't fire, the user is staring at a dead 1% job.
- **Why it matters:** this is the app's *first impression*, on defaults, against a healthy engine — and the app knows this exact crash class: its own Settings copy calls it "the fragile stock preview path (its null-previewer crash class when an arbitrary taeh3* file wins the engine's prefix match)" (`16-settings-root` a11y, ComfyUI-MiniMaxH3-PreviewOverride row). The dangerous default was shipped anyway.
- **The simple version:** don't request stock `taesd` previews unless the engine is verified to serve them (probe the decoder once at connect time, or default live preview off until the PreviewOverride pack is installed). If you must keep it on, surface the retry as a first-class event, not a 3-second flash.

### P0-2 — The first clip defaults to the slowest tier the app has; the wait has no ETA and a machine-text plateau at 95%

- **What happens:** default quality = "Native quality · 30 steps" at 1344×768 (`16-settings-root` a11y, Defaults). On this 3090: ~35s/step → **~18 minutes of sampling + 80s of decode for a 5-second clip**. The charter bar is "first generation back in minutes." The app ships a one-click "Preview 864 × 480 · official Turbo 8" preset — but the wizard's First-prompt step never offers it, and nothing between connect and submit tells the first-time user that the default they're about to inherit costs 20 minutes.
- **During the wait:** the tile shows only "N% · Sampling · step N of 30" — no elapsed time, no ETA (watcher log, `phase8/9` output). From 95% to landing the label becomes **"Loading or processing workflow stage"** (ComfyUI's internal node status, verbatim) for 80 seconds — machine text at the exact moment a user most wants "saving your video."
- **The simple version:** first-run default = the Preview/Turbo tier (or the wizard's step 4 offers "quick first look (~3 min) vs full quality (~20 min)"); show elapsed + rough ETA on the tile; humanize the post-sampling stage ("Decoding video…").

### P0-3 — "Create the first chain" starts an 18-minute GPU job the copy says you'll trigger later

- **What happens:** wizard step 4's copy: *"Describe one shot. The chain lands on the canvas; generate when you're ready."* The button says **"Create the first chain."** Clicking it created the chain AND submitted the render immediately (engine execution began 0.7s after the click) at Quality defaults. Label/action mismatch plus a surprise 20-minute commitment with no cost preview. (A "stop" button does exist in the footer — untested.)
- **The simple version:** either the button is "Generate my first clip" (and says the tier/duration), or "Create the chain" creates it and the tile's generate button — which exists (`15-clip-landed`: "generate · text → video") — stays the single submit gesture.

### P1-4 — First-run health verdicts contradict each other on the same screen, and "what's missing" is never named

- **What happens:** on the Models step, the two status pills read **"H3 engine ready" / "H3 ready"** while the step body reads **"The H3 stack is incomplete — make the missing components visible to the engine (any name shape the pickers recognize resolves)"** (`07-models-step-settled`). The engine actually had everything — the render completed. The step lists counts (11/22/6/45/5) but never *which* components are missing or whether it matters. "Any name shape the pickers recognize resolves" is maintainer-speak, not a sentence.
- **The simple version:** one verdict, computed once: "Ready to render" or "Missing X, Y — here's where they go." If it can render, the incomplete-warning should not appear at all.

### P1-5 — The engine field is pre-filled with 8189 while its own placeholder says 8188 is "ComfyUI's default port"

- **What happens:** on a never-configured home the wizard's Engine address input **contains** `http://127.0.0.1:8189` (value read directly from the input; `02` a11y) while the placeholder advertises `http://127.0.0.1:8188 — ComfyUI's default port`. The shipped default is 8189 (`server/core.ts:725: comfyUrl: 'http://127.0.0.1:8189'`). A stock-ComfyUI user (8188) will hit Test against a confidently-wrong address; my engine (17651) required clearing a prefill that looked like something I'd already configured.
- **The simple version:** empty field + placeholder showing the true world default (8188); the "Probe common ports" button covers the rest. A prefill that disagrees with its own placeholder is worse than no prefill.

### P1-6 — The Node-packs wizard step is a pointer, not a step: "0 of 14 packs active," no rows, no verdict

- **What happens:** step 3 shows a paragraph, a count, and two buttons that both *leave* the wizard ("Open the pack board (Settings)", "Open the library — get models") (`08-nodepacks-step`). It never says whether any pack is needed to generate (it isn't — nothing installed and the render worked), so a first-time user must either detour mid-wizard or gamble on Next. The packs themselves are described in 100+ word license/provenance essays written to the maintainer (`16-settings-root`: "The VDN port we adopted as our own…", "@ 3eb63496c24c — a valid ComfyUI checkout (with main.py) is required…").
- **The simple version:** the step should answer the only question a first-timer has — "Can I generate right now? Yes/No" — and defer pack essays to Settings.

### P1-7 — A real engine failure leaves no record: Diagnostics says "0 FAILED" 23 minutes after one

- **What happens:** Diagnostics → "Recent job failures — Which node and stage failed, the sanitized reason… **0 FAILED — No failed jobs recorded on this device.**" (`21-diagnostics-full`, 20:55:37) — despite prompt `c928ce8e` dying with an execution_error at 20:32:31. The auto-retry path (P0-1) bypasses failure recording entirely. The one surface that promises failure truth says nothing happened; only the engine's own history knows.
- **The simple version:** record every terminal attempt, including retried ones ("1 failure, auto-recovered, reason: …"). Recovered-or-not, the failure data is exactly what this panel exists to show.

### P2-8 — First light opens the entire control room: the properties panel at submit time

- **What happens:** the moment the first chain exists, the right panel presents: freeform/structured modes, "// production presets (206)", enhance (disabled), audio pass (disabled), timeline → Flow (disabled), library, Speed tier, **VDN acceleration**, **turbo family** (10 options, 7 marked "(not installed)", incl. "drbaph 4-step (larryvrh lineage)"), a paragraph about the model catalog, seconds/ratio/resolution/seed, **LoRA timeline paint ranges** + "the engine's 5/22/39… frame ladder", **clothing policy**, keyframe guides, takes (`12-chain-created-settled`). Much of it dimmed with no explanation of why or what would enable it. For a user who has not yet seen one clip, this answers questions nobody asked while the asked one — "how long will this take?" — goes unanswered.
- **The simple version:** progressive disclosure — prompt, tier, duration, references until the first clip lands; everything else behind an "advanced" disclosure per section.

### P2-9 — Three status stories run at once right after submit

- **What happens:** at 20:32:33 the screen simultaneously showed: tile **"1% Execution failed — finishing up"**, header pill **"1 running"**, footer "running", and two toasts ("Uploading inputs…", "Generation added to the local ComfyUI queue.") (`12-chain-created-settled`). Earlier, engine state was told three ways too ("engine offline" header + footer duplicate, then "engine on · models missing", then "H3 engine ready" vs "H3 ready"). Status needs one home and one voice.
- **The simple version:** one job-state element (the tile) as source of truth; pills summarize, never contradict.

### P2-10 — Copy addressed to the machine, in the places a human decides

- Wizard step 1: "Nothing is scanned or configured manually — the engine's own registry is the model source of truth." Node-packs step: "detection always reads the connected engine's live registry." LoRA panel: "grid-conformed (the engine's 5/22/39… frame ladder) and joined by measured transitions." Settings/Managed engine: "Ports stay clear of 8188/8189" (insider port lore). Diagnostics pack note: "the pip Manager is not installed, or the engine was not started with --enable-manager" (`16-settings-root`). Each is accurate and each is written for someone who already knows the system.
- **The simple version:** the wizard speaks human ("I'll ask your ComfyUI what it has"); provenance detail lives in Settings/Diagnostics.

### P2-11 — Small trust leaks

- `⌘K` shown on a Linux build (should be Ctrl+K) — every header, `02` a11y.
- Landing toast truncates mid-word: "The render landed on 'A red paper lantern drifting over dark n'." (`15-clip-landed`).
- A stray always-present "Choose File" button sits in the accessibility tree (hidden file input leaking; `02` onward).
- During the Test click the app's `/api/lan/object-info` call returned HTTP 500 — swallowed silently (console-only; `browser.log` 20:31:06). It recovered on the next step, but the Test moment is exactly when node info should be cached.
- The duplicate prompt surfaces during the wizard (wizard's own box + the canvas prompt bar behind it) invite "which one do I type in?"

---

## What genuinely works (keep)

- First paint in 0.6s; the wizard opens itself; the canvas is already alive behind it.
- The Test button returns a concrete, honest readout ("cuda:0 NVIDIA GeForce RTX 3090 : cudaMallocAsync", 0.7s).
- Progress during sampling is granular and truthful (% + step of 30).
- The auto-retry (whatever its transparency sins) converted a hard dead-end into a completed first clip with zero user action.
- Reload persistence: canvas, chain, and clip all restore; the wizard does not return.
- Diagnostics' ethos — scrubbed reports, canary self-test, "nothing leaves this machine" — is the right design instinct; it just needs the failure feed wired in (P1-7).

## Journey log (raw timeline)

- 20:29:06 driver browser up (persistent profile, CDP).
- 20:29:27.971 **T0** navigate to app. 20:29:28.06 deprecated-meta warning (console). 20:29:28.6 content visible (0.6s). DCL/load 0.12s. Wizard "Set up the studio 1 of 4 — Engine" over "A blank canvas". Engine field value `http://127.0.0.1:8189`, placeholder `…8188 — ComfyUI's default port`. Header: "engine offline" ×2.
- 20:31:06.0 cleared 8189, typed `http://127.0.0.1:17651`. 20:31:06.30 clicked Test. 20:31:06.33 `/api/lan/object-info` → 500 (silent). 20:31:07.0 "Engine reachable — cuda:0 NVIDIA GeForce RTX 3090 : cudaMallocAsync." Pills → "engine on · models missing"; toast "node registry and model inventory re-synced (0 files on the engine)".
- 20:31:29.9 Next — Models. Counts at +0.8s (diffusion 11, loras 22, text encoders 6, vae 45, vae approx 5). "The H3 stack is incomplete…" while pills read "H3 engine ready".
- 20:31:57.7 Next — Node packs → "0 of 14 packs active on the engine", two exit links.
- 20:32:13.3 Next — First prompt (placeholder example, "Create the first chain" disabled until text).
- 20:32:29.9 typed prompt. 20:32:30.15 clicked Create → wizard closes, chain + tile on canvas, properties panel fully open, footer "running" + stop.
- 20:32:30.88 attempt 1 (`c928ce8e`) starts on engine → **execution_error** ~0.3s later (`SamplerCustomAdvanced` / `'NoneType' object has no attribute 'show_progress_bar'`, preview_method=taesd path). Tile: "1% Execution failed — finishing up".
- 20:32:34.11 attempt 2 (`d2f078ed`) queued — auto-retry: engine `/free`, tiled-VAE graph, **no** preview_method. Sampling begins ~20:32:36 (~35s/step).
- 20:36–20:51 progress climb 19%→95% (step 30/30 at 20:51:31).
- 20:51:41 → 20:53:01 plateau "Loading or processing workflow stage" at 95% (decode+save).
- 20:53:01.7 **LANDS**: toast "The render landed on 'A red paper lantern drifting over dark n'." Tile shows frame + play + generate + fork. **T0+23m34s.**
- 20:55:02 video verified: 5.167s, 1344×768, readyState 4; play click works (t advances, paused=false). Output file on disk.
- 20:55:19 reload: wizard gone, canvas+clip restored.
- 20:55:39 Diagnostics: CONNECTED · 6ms, graphs verified, "0 FAILED — No failed jobs recorded" (see P1-7).

## Method notes

- One real render consumed (attempt 1 died pre-sampling, attempt 2 = the one render); zero renders deliberately started beyond it.
- Engine-side crash verified against engine history/queue + `latent_preview.py`; app-side defaults verified in `server/core.ts`, `src/canvas/generation.ts`, `src/hooks/useGenerationQueue.ts` (code read only to explain observed behavior).
- Vision analysis of screenshots `02`, `07`, `12`, `15` via the image tool; all quoted labels cross-checked against Playwright aria snapshots.
