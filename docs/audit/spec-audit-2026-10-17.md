# Spec audit — the three design-round specs, pre-blessing (2026-10-17)

> **This audit drove the r2 revisions** (2026-10-17): its findings are
> applied across the three specs' r2 texts (see each spec's STATUS line);
> archived here from `.superpowers/` as the pre-blessing record.

**Auditor:** blind adversarial spec auditor (opus-class), pre-blessing gate.
**Audited:** `docs/specs/2026-10-17-wizard-rework.md` (3p14abm), `docs/specs/2026-10-17-hash-catalog.md` (to7xpa7), `docs/specs/2026-10-17-take-viewer.md` (foelihc).
**Against:** `main` @ f229335 (specs) / 7314add+ (code); the review synthesis `docs/audit/ux-review-2026-10-15.md` + r1/r2/r3 reports; the Flux cards 3p14abm / to7xpa7 / foelihc / jxb34l0.
**Method:** code reading only — every load-bearing "X exists / X works this way" claim in the specs was checked against the tree. Blind: no `.superpowers/` narratives, no remediation-plan justifications (its constraint IDs were checked for existence only, since the wizard spec leans on them).

**Verification summary (what held):** the overwhelming majority of the specs' factual premises verify against the tree — the filmstrip foundation (route, ETag, headers, shared layout math, OPFS loader, poster), the frame-extraction endpoints, the fork seam (`forkInputSpec`, `forkFrameIsEndSeek`, wzt73ob defaults), the video pool's `exclusive:false` inspectors case, `StudioDialogLayered` + the crop-editor wheel idiom, the canvas keymap, `requestCamera({kind:'fly'})`, `collectOutputRefs`/forkHistory, `landingError`, `turboTierStates`/`inferSelections`, `installEngineNodePack` + `via`, `h3StackReport`'s row fields and module-head doctrine, `isCanonical` as basename compare, the registry's names-only inventory, the animation lane's streaming-sha256 stat-keyed seam with named refusals, the fetch catalog's taeh3 DATED CORRECTION and w4a8 gate note, the MANIFEST shas and the 304-byte VAE size pair, the devdocs no-digest addendum (2026-10-09), `startLanServer` 0.0.0.0:4178 HTTPS, the comfy-status `?url=` pattern, the object-info 500 at core.ts:3533, the launcher's port probe and qr-print, Settings' "Reopen the setup wizard", `submitPrompt`'s auto-submit, the wizard's per-keystroke saves and Enter-submits handler, the e2e mirror/journey infra, the 14-pack count, and assumption-register P2-1/P2-1's quant sizes. The findings below are what did NOT hold, ranked.

---

## 1. The first-run wizard rework (3p14abm) — VERDICT: NEEDS-REVISION

Sound architecture, honest framing, correct read of the current wizard — but the walk's central promise ("one-click installs/fetches, verified in place") breaks on the product bar's own scenario (fresh clone + external engine), because the two engine-side destination designations the one-click actions require are never collected by the walk. Must be fixed before blessing; it changes the step content.

### Critical

**W-C1 — The walk never designates the destinations its one-click actions require; both §2.2 fetch rows and §2.3 install rows dead-end on the default external setup.**
- *Section:* §2.2 (Models — "One-click fetch where a fetch entry exists … one click, verified result in-place: the file lands, the registry re-reads, the row flips to named-and-present"), §2.3 (Node packs — "one consented Install click"), §3 (verify gates), §8 ledger rows 2/4.
- *What's wrong:* both promises silently depend on settings the fresh-clone default leaves unset or pointed at the wrong place, and the walk collects neither.
- *Evidence (code):*
  - Pack installs: `resolveNodePackTarget` returns `targetKind: 'none'` on the default external engine (no `engine.externalCustomNodesDir`) — `server/engineNodes.ts:119-129`; `installNodePack` then returns `installed: false` with the target label — `engineNodes.ts:463-470`. The manager-via path needs ComfyUI-Manager present AND `--enable-manager` (`server/managerClient.ts:107`). R3 measured this exact default state (P1-8: "every Install and Fetch button is disabled … an install target is required first").
  - Model fetches: `model-root` fetches land under `settings.modelRoot`, which **defaults to the studio home** (`<home>/documents/ComfyUI/models` — `server/core.ts` `defaultSettings`), a directory an external engine does not read. The `extra_model_paths.yaml` mirroring that makes fetched weights engine-visible is **managed-checkout-only** (`server/runtime.ts:32` "generates extra_model_paths.yaml INTO the nominated checkout only"; `server/fetchCatalog.ts:871-876`). So on the default setup the file lands, the registry re-read does not list it, and the promised row-flip to "named-and-present" cannot happen. It works only if `modelRoot` is designated to the engine's own models dir — a designation the walk never asks for.
- *Why it's critical:* the card's own bar ("ONE-CLICK … no Settings detours, no dead-end steps", card comment bak1xw5) and ledger rows 2/4 are unmeetable on the default path; the maintainer's directive was "one click installs" — this is the gap between that directive and this spec.
- *Fix:* the walk designates both engine-side destinations with existence verification — the external custom-nodes folder (Packs step or Engine step) and the models root (Models step: "where should fetched weights land so your engine sees them?", prefillable from the engine's configured dirs where discoverable). This is not scope creep; it is the directive's own word ("everything is designated, selected, tested, and verified") applied to the two designations the actions literally require. Add it as §7 D7.

### Important

**W-I1 — §2.4/§3's LAN write "through the existing `--set` seam" is not an existing seam, and the launcher's env-over-config precedence can silently void it.**
- *Evidence:* `--set` is a start.sh CLI mode that edits `.start-config.json` and exits (`start.sh:741-742`); no HTTP route or server code writes that file. The spec's exit contract ("a single settings save carrying … the LAN config keys") conflates app settings with the launcher config file — two different stores, the second with no server-side writer today. Worse, start.sh's own rule — "Environment already set by the caller wins over the config file" (`MONOKA_LAN_PORT`/`MONOKA_LAN_HOST`) — means a wizard config write can be silently overridden while the step promises "applies the next time the studio starts."
- *Fix:* spec the real mechanism — a server route that edits `.start-config.json` (new, small) — plus the honesty rule: if launcher env overrides are present at boot, the applied posture is the env's, and the step's confirmation must say so. Alternatively narrow v1 to "show + print, write only via `--set` instructions" and say that.

**W-I2 — The LAN token claim is factually wrong in a security-relevant way, and the token default is a missing decision point.**
- *Section:* §1 ("already binds `0.0.0.0:4178` with HTTPS and a LAN token by default"), §2.4 (Token offer; security posture "presented, not hidden").
- *Evidence:* the token is **not** enforced by default — `lanAuthRequired()` is true only under `--token`/`MONOKA_LAN_TOKEN` (`server/core.ts:305-307`, enforced at 1686), and start.sh's config default is `token: false` (a token *file* exists; nothing requires it). The spec's own §2.4 world-terms copy ("any device on this network can open the studio") states the truth that §1's "with … a LAN token by default" denies. A step whose job is an informed host/token choice must not open by overstating the protection.
- *Fix:* correct §1; add decision point D8 — should first-run default the token ON when LAN-reachable is kept? (The printed URL + QR invites a phone onto the studio; today that phone needs no token.)

**W-I3 — Ledger row 9's "submit → clip = the fast tier's render (minutes-class)" has an unruled precondition; no spec in the set can deliver the fast tier on a fresh engine.**
- *Evidence:* the fast tier needs a turbo LoRA; the fetch catalog deliberately carries **no turbo-LoRA rows** (`src/lib/h3Stack.ts` turboTierStates: "never a fetch promise … the fetch catalog carries no turbo LoRA rows"; FETCH_CATALOG's only turbo-adjacent entries are the Larryvrh loader *pack* and the MATLOWAI fused checkpoint — a diffusion swap, not the LoRA). On a turbo-less engine the honest after-state is the spec's own fallback: "will run 30 steps at quality" ≈ 18–20 min on the R1 rig — i.e. row 9's after-column is not achievable as written there.
- *Fix:* add decision point D9 — bless a fetch row for a license-clean turbo LoRA (e.g. the Apache-2.0 lightx2v line, same posture as the Larryvrh pack) so the walk can genuinely one-click the fast tier, or re-state row 9 honestly (first clip stays quality-class on stock engines; "minutes" arrives with the second turn / turbo-equipped rigs).

**W-I4 — The Models step has no story for first-verdict hashing latency (the catalog's own §6 + B5 make it minutes-class for the big slots).**
- *Section:* §2.2's presentation contract; §7 D6 sequencing.
- *Evidence:* the quartet is ~90 GB; the catalog hashes lazily on stack-verdict computation, worker-threaded but with **no background pass** (B5) — so the first time the reworked Models step opens with readable roots, hash-confirmed verdicts for FL2VA/TE arrive minutes after the step renders. The spec promises "ONE verdict in one voice" with no interim state; verdicts flipping mid-walk from name-suspected to hash-confirmed is the two-voices problem in slow motion.
- *Fix:* define the interim presentation ("verifying bytes — identified by name for now") and the upgrade event, jointly with the catalog spec (same finding there, CT-I3).

**W-I5 — Small factual drifts that should be corrected before the blessing text is frozen.**
- §2.1 "Empty address field … (landed sr7fdym/f370ec8 — inherited)": the landed behavior is a **prefilled** `http://127.0.0.1:8188` (`server/core.ts:757`), not an empty field. The substance (prefill agrees with placeholder) is right; the description is wrong.
- §5.1/ledger row 3 "an unguarded comfyFetch that throws to a raw 500": the 500 is the catch-all *structured* body (`{error:'Request failed.', stage, ref}` — core.ts:3860) — still dishonest at the Test moment (no `connected:false` shape, client swallows), but "raw" overstates; the fix as proposed is correct.
- Ledger row 4's after-state ("one inventory event per settle, count from the record") is substantially the **current** behavior already (EngineHost has toasted once per resync record since sweep #2/68e9k17 — `src/canvas/EngineHost.tsx:75-84` reads `resync.files` from the record). The remaining R1 bug is the settle-against-the-stale-URL producing a 0-file record — which §5.2's candidate scoping fixes. Say so, so the walkthrough's before/after columns stay honest.
- §5.2's premise verifies precisely, for the record: `getObjectInfo()` sends no url (`src/lib/apiClient.ts:158-160`) and the server route reads only `settings.comfyUrl` (core.ts:3534) — the object-info pull genuinely fires against the saved default while the typed candidate differs.

**W-I6 — "One consented click" vs the actual consent ritual.** The library's fetch flow is row → license sheet → acknowledge checkbox → confirm (`src/components/FetchBrowser.tsx:241-260`) — three gestures. The spec should state what the in-wizard consent gesture is (e.g. the row itself carries the license verdict and the single click IS the consent, checkbox retired in-wizard) or the one-click bar is quietly three clicks.

### Minor

- **W-M1** — §3's Models gate "the verdict is one of the closed set" conflates the identity vocabulary (hash-confirmed/name-suspected/unknown — defined for *present* files) with the presence axis (a missing component has no identity verdict). Split the sentence.
- **W-M2** — §2.2's "one click to designate the pick through the existing override seam": true the seam exists (`resolveModels` override slots, applied/refused with reasons) — but note the exit contract then must persist those picks; §3 does say so. No action; keep.
- **W-M3** — The exit's "one-motion write" (§3) vs "installs are facts, not configuration" (§3's honest exception) is well handled; the LAN keys are the odd one out (see W-I1 — they're launcher-config, not app-settings, so "one motion" is actually two stores).

---

## 2. The primed hash catalog (to7xpa7) — VERDICT: SOUND

The strongest of the three. Every `[DOC]` premise I checked verifies in the tree (names-only registry; no digest surface; the streaming-sha256 seam with stat-keyed LRU and named unconfigured-root refusals; the module-head parallel-table doctrine; the taeh3 same-name-different-bytes correction; the w4a8 oid-masking; MANIFEST shas `7ad4c73e…`/`bc2ced0f…`; the 304-byte size pair; check-registry-append.cjs). The design (one seam, append-only data, non-gating invariants, honest read-reach caps) is right. The revisions below are wording/interface fixes, not architecture.

### Important

**H-I1 — N1's "offered fetches … SUPERSET" invariant contradicts §4's fetch-suggestion removal — the test suite as worded would fail on the ruling's own desired behavior.**
- *Sections:* §5 N1 ("the set of accepted submissions / legal picks / offered fetches with the primed catalog is a SUPERSET of the set with a null catalog") vs §4 ("a 'download X' remediation may appear only when X is truly absent — hash-confirmed presence under ANY name **removes the suggestion**").
- *What's wrong:* removing a false-missing fetch suggestion shrinks the offered-fetch set — exactly what the maintainer ruled they want ("see if it really does not exist first before we say we have to download it"). AC-3's N-suite asserting the superset over fetches contradicts §4.
- *Fix:* split the invariant — acceptances and legal picks are monotone non-decreasing; fetch *suggestions* may only be REMOVED, and only when hash-confirmed present (never added, never mandated). One sentence in §5.

**H-I2 — The transport seam is unspecified at exactly the point the wizard consumes it.**
- *Sections:* §2 ("the client receives verdicts through the stack/inventory payloads, never the raw catalog"), §4 (h3Stack/overrides/wizard consume `identifyModel`), AC-6.
- *What's wrong:* `identifyModel` is specced server-side (`server/modelIdentity.ts`) while `h3StackReport` is a **client** module computed over the session store's `ModelFile[]` (`src/lib/h3Stack.ts`, called from FirstRunWizard/PropertiesPanel). Which payload carries the verdicts — a new field on `ModelFile` populated by `scanModels`? the bootstrap? both? — is nowhere pinned. AC-6's grep-able invariant polices code consumption, not the wire shape; the wizard spec builds against "the server payload" with no shape to build against.
- *Fix:* name the extension (e.g. `ModelFile.identity?: { verdict, family, artifact, variant, quant, … }`) and the routes that populate it. This is the interface the two specs promise each other; it should be in the blessed text or a dated addendum before build.

**H-I3 — Read-reach reality: on the product-bar journey the catalog's headline value silently never fires, and no spec designates the roots.**
- *Sections:* §4 read-reach rules, §6, AC-4.
- *What's wrong:* hash-confirmed requires the per-kind model roots to point at the engine's real model dirs. On a fresh clone `modelRoot` defaults to the studio home (see W-C1) — hashing files there is pointless (the engine's actual weights live elsewhere) and the engine's real dirs are unconfigured. The spec is *honest* about the cap (AC-4: everything name-suspected, labeled) but never states who designates the roots or when. As specced, the maintainer's own ruling ("easy to see if it really does not exist") is only served on boxes where someone hand-configured the roots in Settings.
- *Fix:* state the dependency explicitly and name the wizard's Models step as the designation moment (cross-ref W-C1). This is the top cross-cutting finding's other half.

**H-I4 — First-hash latency and the progressive-reveal contract (shared with W-I4).** §6's lazy hashing + B5's no-background-pass means the first stack-verdict computation on a big stack is minutes-class; no interim state or upgrade event is defined for the surfaces rendering the verdict. Define it here (the catalog owns the vocabulary) so the wizard renders it rather than inventing one.

### Minor

- **H-M1** — §4 labels the resolution change "each a consume-only change" while simultaneously adding "a new top rung above the name ladder" — a behavior change in resolution, not consume-only. Reword ("consume the one seam; the ladder gains a rung").
- **H-M2** — Duplicate-bytes tie-break unstated: when two registry files hash-confirm to the same artifact (guaranteed by the alias soup), which one resolves the slot? The wizard's picked/ambiguous presentation covers the UI; the resolution rule needs one line.
- **H-M3** — §6's "the alias-VAE soup is sub-second per file after the first" — true per file, but ~30 aliases × first-hash on a cold cache is still ~30 network-disk reads; fine, just don't let the walkthrough prose promise instant soup collapse on a cold NAS.
- **H-M4** — The licensing note is correctly flagged as a blessing input ([SPEC]); keep the "facts about public artifacts" framing — it matches what the fetch catalog's pins already ship.

---

## 3. The take viewer (foelihc) — VERDICT: NEEDS-REVISION

Excellent read of the gap and the bones (every "already exists" claim verifies: sprite route, layout math, OPFS loader, extraction endpoints, fork seam, pool, layered-dialog idiom, keymap, inverse walk). But the spec's **central gesture** — "Use this frame" — hands a frame index to an extraction seam whose numeric position is **seconds**. Implemented as written, every mid-clip anchor seeks 24× too far. That is a one-paragraph fix that must be in the blessed text, because it is the spec's whole point (killing frame-arithmetic bugs) and its AC as written would *pass while extracting the wrong frame*.

### Critical

**T-C1 — §4 "Use this frame": frame-index/seconds unit mismatch at the extraction seam — a literal implementation seeks to `frameIndex` SECONDS.**
- *Section:* §4 ("computes `frameIndex = round(currentTime × 24)` … The extraction is the existing one … a picked frame is always a non-negative numeric, so the `forkFrameIsEndSeek` 'last' mapping is never in play"), AC-4.
- *Evidence (code):* `POST /api/lan/video/frame` passes `position` directly to ffmpeg's `-ss` — `server/core.ts:1263` `['-ss', String(Math.max(0, position))]`; the batch endpoint's own error message says "at ${position.toFixed(3)} **seconds**" (core.ts:1310); `apiClient.extractVideoFrame` does no conversion (apiClient.ts:241-243). Pause at 3.5 s → frameIndex 84 → the server seeks to second 84 of a 5-second clip. The spec's §3 frame-step math is correct (`n/24` for the stage's `currentTime`) — the §4 handoff then discards it and ships the raw index.
- *Why the existing path never caught it:* the only numeric ever passed today is `0` (frame 0 ≡ second 0 — `forkFrameDefault` returns −1→`'last'` or 0; store.ts:2021-2022), so the seam's unit ambiguity is latent. The spec is the first consumer of a nonzero anchor — and inherits the bug F7 was filed about, at 24× scale.
- *Note the two-hop shape:* `inputSpec.frameIndex` IS a frame index downstream (keyframe guides — types.ts:623 "round(seconds*24)"), while the extraction API takes seconds. The spec must name the unit at each hop: pass `position = frameIndex / 24` to `extractVideoFrame`; keep `frameIndex` in `inputSpec`.
- *Fix the AC too:* AC-4 verifies "`inputSpec.frameIndex` equal to the paused frame and `extractedPath` resolved through POST /api/lan/video/frame" — both hold while the PNG is the wrong frame. The e2e must compare the extracted image against the paused frame (or assert the request body's position ≡ frameIndex/24).

### Important

**T-I1 — §5/AC-5's "the same OPFS-cached sheet the tile's poster path loads" is wrong for the canonical landed take, and the fallback vocabulary lacks the "sheet impossible" state.**
- *Evidence:* for takes with a durable blob artifact (the normal post-landing case), TilePreview renders the **blob video**, not the filmstrip poster (`src/canvas/Tile.tsx:72-77`); the poster is the no-artifact fallback. The sheet is still *fetched* (the `useFilmstrip` hook runs unconditionally, Tile.tsx:57) — but only when `previewPath` exists (`metrics.sourcePath`, an output-contained path — derive.ts:223-234). For blob-only takes (no sourcePath), **no sheet can ever be served**: the filmstrip route is outputDirectory-contained (core.ts:3691-3694) and does not resolve `canvas-blobs/` — unlike the extraction seam, which does (core.ts:1211-1216). For those takes the spec's "filmstrip generating… then fills" placeholder lies forever.
- *Fix:* add the third strip state (media present, sheet impossible → plain scrub bar with an honest note), or extend the filmstrip route to resolve blob sources (the extraction seam already shows the pattern). Also reword AC-5's "counter does not bump on viewer open" — it holds only when the tile already fetched the sheet (previewPath present).

**T-I2 — §2's hover play affordance contradicts D5's "one transport."** D5 kills the bar's play/pause toggle and says "the tile stays a poster unless the viewer is open" — but §2 grows "a hover play affordance, the `PooledVideoCard` overlay pattern," and the referenced pattern (`PooledVideoCard.play`) plays **inline**. If the hover affordance plays inline there are two transports again; if it opens the viewer, say that. One sentence.

**T-I3 — AC-2's "~6" after-total is optimistic by the table's own rows.** Review 2–3 + `U` 1 + prompt "unchanged (1)" (plus the untouched panel scrolls — R2's P2-8, a jxb34l0 row no spec in this set touches) + verify/generate 2 = **~7–8**. "~6" is R2's number for a state that also assumed the binding ritual fixed. State ~7–8 and the ledger is defensible; ~6 invites a walkthrough that "fails" its own target.

### Minor

- **T-M1** — §3's timecode/`n/24` seek is right; `N` comes from the approximated `frameCount = round(duration×24)` — the honest footnote covers it; clamp `U` to `N−1` explicitly (round can produce `N` at the last frame).
- **T-M2** — §6.1 compare mode with loop-ON default: does the shorter pane re-loop while the longer plays, or hold? Unstated; one line.
- **T-M3** — §3's viewer-scoped keyboard map: Space on a focused transport button activates the button before the map sees it — the scoping needs the focusable-chrome guard (the `isTypingTarget` discipline extended to buttons), not just text fields.
- **T-M4** — §2's "a tile mid-render opens the *last* canonical take … the live progress stays on the tile" — good; make sure the bar's `review` chip mirrors that (it renders disabled "with its reason" only for takeless chains — a mid-render takeless chain and a mid-render with-priors chain should read consistently).

---

## 4. Cross-cutting

### CT-1 (top) — The destination designations are the set's shared blind spot: the wizard's one-click promises, the catalog's hash-confirmed verdicts, and the product bar all gate on two settings none of the three specs designates.

The three specs' mutual interfaces are otherwise consistent — the verdict vocabulary (`hash-confirmed`/`name-suspected`/`unknown`) matches verbatim across wizard §2.2 and catalog §4; the viewer's deferrals line up with the wizard's non-goals; D6's sequencing is coherent. But: pack installs need `engine.externalCustomNodesDir`; engine-visible fetches and hash read-reach need `modelRoot` (or per-kind paths) pointed at the **engine's** dirs. On the fresh-clone external-engine default — the charter's own scenario — the first is unset (installs refuse) and the second points at a studio-home dir the engine doesn't read (fetches land invisible; hashing there proves nothing about the engine's weights). Wizard W-C1 and catalog H-I3 are the two halves; the fix is one addition to the wizard's walk (designate + verify both destinations), which then unlocks the other two specs' headline values. If the blessing fixes only one thing, fix this.

### CT-2 — The wizard↔catalog interface names the vocabulary but not the payload (H-I2).
"The server payload" is not a shape. Pin the `ModelFile` extension and the routes that populate it before build, or the two efforts will meet at an improvised seam — the exact failure mode the module-head doctrine warns about.

### CT-3 — Orphaned dispositions: rows the synthesis sent into this round that none of the three specs (nor jxb34l0's AC list) picks up.
- **Synthesis 4.2's second half — "the pack install from the disabled row" (R2 F6):** the viewer spec §7 defers it to "the wizard/packs round"; the wizard spec never claims it (§2.3 curates preflight/fast-tier/preview packs; the Motion-Context pack behind F6's disabled "Continue from this take" is not named); jxb34l0's AC list (xj0sk6u) does not include it. Dropped from the set.
- **Synthesis 5.2 — R3 P1-8, "the modularity storefront is a first-class destination," dispositioned to 3p14abm:** the wizard spec §6 explicitly hands the day-to-day half to "jxb34l0 / the Control Center round" — but jxb34l0's AC list has **no P1-8 row** (its closest, P1-9, is the Settings split). The first-run storefront half IS covered (wizard §2.2/§2.3); the day-to-day half is orphaned.
- Both need a named home recorded at blessing (a jxb34l0 AC row is the cheap fix) or they silently drop.

### CT-4 — P1-9's ownership is contradicted between specs.
Catalog §9: the pickers' filtering fix "is the wizard round's." Wizard §6: P1-9 is a jxb34l0 row (standing IA). jxb34l0: P1-9 = the Settings setup-vs-daily split. One owner, stated once.

### CT-5 — The product-bar estimate, honestly stated.
- **Launch → submit:** 3m02s → ≤2 min is credible (dead ends, detours, and the silent 500 removed) — contingent on W-C1, without which the Models/Packs steps add the detours back.
- **Submit → clip:** unchanged at ~18–20 min on any engine without a turbo LoRA — the set has no path to the fast tier on a fresh engine (no fetch rows; W-I3). The "first generation back in minutes" half of the bar is NOT closed by these three specs on a stock engine; closing it needs the turbo-weights ruling (wizard D9) on top of the landed execution cards.
- **Loop turn:** ~14 → **~7–8** gestures (the viewer's real delta: review + anchor; the binding ritual F8 and the properties-panel scrolls stay jxb34l0's), wall-clock still render-bound.
- The specs are individually honest about most of this; the blessing should state the set-level arithmetic so nobody measures the round against a bar it cannot hit without the two rulings above.

### CT-6 — Build order wizard → catalog → viewer: right.
The wizard is the maintainer's stated pain ("very terrible"); the catalog upgrades the wizard's labels in place per D6; the viewer is independent and answers the loop's loudest finding. One caveat: W-C1's destination work belongs to the wizard round itself (it is the walk's spine), not a follow-up.

---

## 5. Blessing readiness

| Spec | Verdict | Can it go to the maintainer? |
|---|---|---|
| Hash catalog (to7xpa7) | **SOUND** | Yes — with H-I1's invariant rewording fixed in the text first (it is the AC contract), and H-I2's payload shape promised as a dated addendum before build. H-I3/H-I4 should be raised at the blessing table as dependencies on the wizard's destinations step. |
| Wizard rework (3p14abm) | **NEEDS-REVISION** | Not as-is. W-C1 (destination designations) must be resolved first — it changes the walk's content and is the directive's own core. W-I1 (LAN write mechanism), W-I2 (token default — new D8), W-I3 (turbo weights — new D9) should be settled at the same table; the §7 list is missing all three. |
| Take viewer (foelihc) | **NEEDS-REVISION** | Not as-is. T-C1 (seconds vs frames) is a one-paragraph fix that must land in the blessed text — the spec's central gesture, as written, ships F7's bug at 24×, and its AC would pass while doing it. T-I1/T-I2/T-I3 are one-liners to fold in. |

**Critical findings: 2** (W-C1, T-C1). Important: 13 (W-I1…W-I6, H-I1…H-I4, T-I1…T-I3). The set is close: two focused revisions and the catalog's invariant fix, plus three decision points the blessing should add (destinations, token default, turbo weights), and all three can be blessed in one round.
