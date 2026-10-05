# Codex component-vocabulary merge gate — second pass — 2026-10-05

Verdict: **NEEDS-FIXES**. The original C01–C04 and V01–V02 findings are closed for their demonstrated scenarios. Two issues in the near-term segment need correction: the arrival-order regression tests no longer wait for the adversarial write to finish, and the gap-menu selection migration supplies roles without its keyboard model. The maintainer holds the merge.

## Reviewed tree and evidence

HEAD was `95c0991e9425652d220302d9115d6f450401519b`. The C migration was **uncommitted**, in the working tree: Launcher, OpEditor, TimelineOverlay, CropEditor, DatasetsApp, canvas.css, their e2e additions, and chip-classes tests. This verdict includes those changes. GPU-review deletions were outside scope and untouched. Contrary to the handoff, manifest §16 had not been updated in the reviewed tree.

Read the binding spec, manifest, plan review-focus material, controller ledger, prior audit, fix-round report, and the actual committed and working-tree diffs. Compared every conversion in `9ce3887` with its pre-image; examined the wizard source change separately. Rechecked EffectiveSettingRow, HandoffResult and SaveStatus interfaces against the spec: origin remains separate from attempted outcome, write remains separate from refresh, and execution remains caller-owned.

Fresh `pnpm build`: **passed** (typecheck, web, server). Fourteen focused unit suites: **133/133 passed**, including the shared stylesheet reader's consumers, ci-map, layer registry, dock ordering, Chip and overlay behavior.

Browser runs used system Chromium, 1920×1080 at 1×, port 7953 and isolated app home `/tmp/codex-vocabulary-m57boiu2`. **16 distinct normal/positive checks passed** across the targeted runs: launcher layout and chip behavior, wizard dev/StrictMode race pin, existing ChipGroup behavior, brush migration, measured gap flow, dataset aspect/filter/export migrations, C01 immediate fault injection, C01 project-switch-and-back, C02, C03, V01, V02, launcher modal slash gate, and the two current arrival-order tests. The full fleet and remote CI were not rerun.

Artifacts: `test-results/codex-vocabulary-second-pass/`. This contains scratch configs/spec copies, reviewed diff snapshots, the canvas pre-image, screenshots, and separate trace directories (`pw`, `pw-adversarial`, `pw-final`, `pw-original`). The initial datasets checks failed during fixture ingest because the existing spec hardcodes `test-home`; the scratch copy placed fixtures inside the isolated server home, after which both checks passed. The initial server launch required sandbox escalation for network-interface access. These were harness issues, not product findings.

## Ranked findings

### S01 — Medium — fix-now: arrival-order tests can pass before the older write lands

Locations: `e2e/canvas.spec.ts:6037` and `e2e/canvas.spec.ts:6164` (settings R1 and identity R1/3b).

The route counter increments before a request is delivered. After `releaseFirst()`, the new poll asks whether the server contains the newer keepalive value. That value can already be present before the released older write runs. Neither the following immediate read nor reopening the inspector provides a completion barrier for the held request. The callback also swallows delivery errors, allowing context teardown to cancel the very adversarial arrival being tested.

**Failure scenario:** the keepalive persists draft two; the released older request takes another 900 ms to arrive. The poll and subsequent UI assertions pass against draft two, then the older request overwrites it. A revision-gate regression can therefore evade this test.

**Own adversarial evidence:** in a scratch copy only, delayed the released older delivery by 900 ms and removed its `settingsRevision` stamp. The unstamped request uses the server's documented always-apply path, simulating the effect of a missing stale-arrival gate without changing production code. All original converted assertions passed; the extra completion-aware read returned `arrival draft one`, failing only the auditor's final assertion. Repeating the same injection with the exact pre-image orchestration (1,000 ms before release; 1,500 ms after release) failed at the original durable-value assertion. Traces are in `pw/canvas-a-held-older-write-*` and `pw-final/canvas-AUDIT-preimage-*`. This is demonstrated weakening, not merely a suspicion about polling. The identity test has the same control flow; its analogous mutation was not separately run.

**Required fix:** explicitly await successful completion of the held `route.fetch()`/upstream delivery before checking durability and reopening. Before releasing it, prove the newer keepalive is durable, rather than merely intercepted. Propagate delivery failures. Keep bounded waits, but wait on the causal event, then assert the outcome. Verify that a gate-disabled mutation fails both tests.

### S02 — Medium — fix-now: gap menu has selection roles but lacks menu keyboard behavior

Location: `src/canvas/TimelineOverlay.tsx:116`, supporting migration/comment at `:130`.

The new `menuitemradio`/`aria-checked` shape is a reasonable alternative to nesting a radiogroup inside a menu. It does not supply the missing behavior. The only key handler is `overlay.onKeyDown`, which contains Tab and stops propagation; it never implements arrow navigation. Every enabled option remains an ordinary tab stop. The nested menu also never invokes its own `focusOnOpen()`.

**Failure scenario:** open the measured gap menu and focus Hard cut. ArrowDown leaves focus on Hard cut rather than moving to NLE transition. The new migration test asserts checked states but never exercises this keyboard path.

**Own reproduction:** the scratch `AUDIT gap keyboard` test follows the existing real-video gap setup, focuses the first enabled option, presses ArrowDown and asserts focus on the second enabled option. It fails. Capture: `gap-arrow.png`; trace: `pw-final/canvas-AUDIT-gap-keyboard-*`.

**Required fix:** implement the menu's keyboard model, including focus entry, enabled-item arrow traversal/wrap, controlled tab stops, and activation preserving exclusive checked state. Pin focus and selected state through activation and ensure unavailable engine-work options are skipped. The source comment admitting that the menu “never had” this behavior is disclosure, not satisfaction of §0.3's complete-interaction requirement.

### S03 — Low — fix-now: manifest still describes the migrated tail as unmigrated

Location: `docs/specs/component-vocabulary-manifest.md:360`.

The handoff says §16 was updated with dispositions. It still says all named groups render visual-only selection with no ARIA state and asks for migration at next touch. This contradicts the audited working tree and obscures the remaining gap-menu exception.

**Required fix:** update §16 with actual dispositions and realized behavior-test names, explicitly recording any remaining exception. Include the C working-tree changes in the reviewable merge revision; this audit is not an approval of HEAD alone.

## Prior findings and remaining qualifications

- **C01: closed for the original failure and ordinary project round trip.** Own PUT-success → GET-failure → unrelated-edit test passed with exactly two writes and the acknowledged value in the second body. An additional scratch test switched to another project through the persisted session/navigation path and back, then made the unrelated edit: 0.42 remained durable. Navigation remounts the workbench and boot reloads the active document, so the ref resets together with a fresh read. The chain-id guard prevents applying A's snapshot to B. There is no currently exposed in-workbench project switch; this check does not claim to cover hypothetical same-component store switches during a held PUT.
- **C01 follow-up: accept the disclosed external-writer limitation for this merge.** The ref clears only after this flush's successful reload, not every independent successful document reload. Thus an externally modified setting, even if later seen through another refresh path, can still be overwritten from the retained snapshot. The fix-round ledger discloses this window. A per-chain cache/acknowledgement generation would make the lifecycle more robust, but no additional single-user reverting path was established here.
- **C02/C03: closed for their original cases.** Personally reran zero/one-control Tab and Shift+Tab containment and disabled-first/disabled-neighbor traversal with selection and focus asserted together. Launcher, brush, dataset aspect, kind filters and export shape/trainer migrations use the controlled group mechanism; the crop's selected member is appropriately enabled to serve as its radio tab stop. No migrated group selects disabled engine-work choices by arrows.
- **C04: closed.** The charter now counts T1, T6 and T16 and the ledger plainly retracts its earlier overbroad composition claim.
- **V01: closed.** Personally reran the gallery nested demo: row-center `elementFromPoint` resolves into the menu, computed menu/dialog/consent tiers are 80/70/90, and a coordinate click reaches the menu handler while the parent survives. Inspected the fresh `v01-menu-over-dialog.png`: Transport is visibly above the ask. This verifies hit-testability, not just registration or visibility.
- **V02: closed.** Computed pill geometry and consistent rest tone passed; inspected the fresh audio-selected capture. Image and audio selections each highlight only the selected chip.
- **A: accepted.** The launcher modal slash reproduction passed on a real portal dialog. Shared parser consumers and ci-map fan-out passed; unused reserved z-slots are removed and the raised tier is documented. No new recipe-geometry regression was established. The PDMD packet row is documented research context, not fresh GPU evidence from this audit.
- **B beyond S01: follow-up.** Most conversions retain exact outcome predicates or assert the same outcomes after a distinct settle marker. Camera-save polling at `e2e/canvas.spec.ts:1201` only waits for an existing camera object; it does not prove the latest pan persisted. Several structured-draft markers can likewise pre-match before the last edit lands. Their downstream assertions remain intact, so this primarily leaves false-red timing exposure rather than the demonstrated false-green class in S01. Improve these markers to identify the actual final mutation at next touch. The wizard fix moves synchronous persistence/event dispatch out of React updater execution; its dev-build deterministic regression check passed.

Existing documented naming, unused-branch, refresh-reason and typography residuals retain their prior dispositions. No fleet-wide, screen-reader, narrow-viewport or real-engine validation is claimed by this pass.
