# Roadmap — state of play

> **Derived from Flux (project `r2lnrfw`); refreshed 2026-09-20, then 2026-09-28
> at the maintainer's PERFECT-state directive, then 2026-10-05 (the
> program-completion refresh; the frontier sections below; the
> historical sections keep their original wording).** Flux is the source of truth;
> this file is the human-readable state of play — if it disagrees with the board,
> the board wins. Task ids are Flux ids.

## THE FOUNDATION REMEDIATION PROGRAM (epic 4lphxv8) — COMPLETE, merged at d773fa9 (2026-10-03)

**The maintainer's verdict (2026-09-20)**: the foundation wasn't solid — a full day
of small-friction fixes never got them past "enter a prompt, pick video, execute,
fail." The response is a full audit + remediation program, with the maintainer's
stated stakes: remediate, or the project gets scrapped and restarted fresh.

> **FRONTIER UPDATE (2026-10-05) — the program is merged; the state since.** The
> remediation program's four waves, the follow-on sweeps (truth surfaces,
> centralization, perfect-state), and the CI fixes all landed and **merged to main
> at d773fa9 (2026-10-03)** — the post-remediation merge the
> `component-vocabulary` branch pins to. State since the merge: the **shared
> component vocabulary round** (k2q0n9s, branch `component-vocabulary`) is
> internally complete — 24/24 tasks blind-reviewed, the near-term A/B/C items,
> both Codex audit fix rounds re-reviewed APPROVED — awaiting Codex's third pass
> or the maintainer's direct merge; and the **GPU experiment sprint** (ourbqum)
> ran sets A/B/C/D/E/J/P/P2 to maintainer-closed verdicts (PDMD-4 takes the
> fast-lane default; the ledger's THE SPRINT CLOSES section carries the
> consolidated verdict), with sets F/G/H/I designed-not-run. The epic's open
> tasks are post-program follow-ons (the design round, the assessment workspace,
> the GPU-gated experiment backlog), not live remediation.

> **FRONTIER UPDATE (2026-09-28) — the PERFECT-state pass.** The maintainer's
> 2026-09-27 directive — *"Mainline — let's get what we have currently working in
> a PERFECT state before we move on to adding more features."* — is the active
> frame. The perfect-state walk (`docs/audit/perfect-state-walk-2026-09-27.md`,
> c85bd48) found the spine real and every 09-25 punch-list fix HELD (zero hard
> regressions); its 31 findings concentrate on the NEW surfaces (workbench dialog
> semantics, refusal truth, mode vocabulary) plus the standing tail. The sweep
> zeroing that punch list is landing as the current PR (task 6rmxbzf). Before it:
>
> - **The four waves are DONE** (W1–W4 all merged; the 09-21 note below is
>   history). The numbered PR series ran to **#63**; main is green through the
>   full local gate (8/8 legs, twice, on the clean tree at the walk).
> - **The image stack shipped end-to-end**: the H3 Image Workbench (packet/T=1/
>   directed, R2I, the six edit families, inpaint with the mask painter, tiered
>   resolutions to 8MP, refine pairing, burst lane) + the full 1F machinery row
>   (Image Studio | Fizgig author recipe | Fizgig max quality, PR #63/#54).
> - **The truth-surface program** (PRs #52–#55, 68e9k17/tsw02y1): the stack
>   report derives from the resolution the graphs use; inventory refresh on
>   engine recovery; override attribution; the TE-dimension guard (PR #53);
>   scene trash as a real cycle (PR #56).
> - **VDN adopted first-party** (PR #62): ApplyVDNH3 as the vdn.apply
>   acceleration rung; the wire-or-remove passes A/B (PRs #60/#61) cut 20 dead
>   wires and wired control-track delete + documents export.
> - **The image-workbench v2 spec is BLESSED** (7e3d9dd, eight maintainer
>   rulings; post-blessing verification 20d7ea4): the layered-canvas Workbench
>   with sub-modules Infinite Canvas / Image Editor / Video Editor, Invoke
>   selective, refs strip, top-level documents, RLHF local-only, Qwen inside v2.
>   **Phase A is cleared to dispatch** (the Qwen-first wave r546bab carries the
>   doctrine as six new acceptance criteria).
> - **The research library kept pace**: the Fizgig assessments, the seamless-
>   blending survey, Invoke/openOutpaint prior art, the fooocus-qwen doctrine
>   (426f76c/0cc4550), the drift-envelope arms (R1/R2-Viggle/R3), the custom-node
>   inventory rulings (ostris kept+wired, VDN adopted, Viggle custody recorded).
>
> **Next after the sweep**: the blessed workbench-v2 Phase A dispatch (the
> creation-surface build-out), then the design-system (shibui) visual round —
> which owns every contrast/taste item the perfect-state sweep deliberately left
> alone.

> **FRONTIER UPDATE (2026-09-21) — kept for the record**: the approval landed —
> all six [REC]s as recommended, with the direction-audit addendum folded
> (plan §6). Waves 1–4, the CI redesign, devdocs round 1, Qwen fetch rows, and
> engine-contract testing all merged across 2026-09-21/22.

**The rename, locked (2026-09-20)**: the app is **MONOKA** and the aesthetic is
**shibui** (sumi base, washi neutrals, vermillion seal-accent, wood-warm chrome;
font/icon criteria on the epic) — directives `55857485` + `2561df9e` on 4lphxv8.
The GitHub repo is now **Cobdog/Monoka-dev** (origin repointed; the LOCAL FOLDER
deliberately stays MINIMAX-DESKTOP — renaming it breaks Claude Code). The
public-repo strategy (directive `262db65f`): Cobdog/Monoka exists PRIVATE as a
stub; Monoka-dev stays the messy working repo and curates into it later. The full
app/doc/git rename sweep executes as ONE atomic pass during remediation (wave 2–3
timing) — the in-app and catalog URLs still naming `Cobdog/MINIMAX-DESKTOP`
(they redirect) are that sweep's scope, not staleness to fix piecemeal.

**The four waves** (the plan carries the detail):
- **W1 — unblock rendering**: the maintainer's exact first-session journey as the
  acceptance bar (engine re-check loop, preflight before submit, readable failures,
  the misroute gates, the debug suite instrumented as fixes land).
- **W2 — removals + registry-only**: the strip completes; the registry-only
  inventory build implements the directives below.
- **W3 — the redesigns**: Settings IA, first-run wizard, the preflight surface,
  node-level model dials — shaped post-directive.
- **W4 — the tail**, with named dissolution expectations.

### The destination architecture (the maintainer's directives, all on the epic)

A **workshop of three workstations** — modular to the core:
- **WIRING** (the canvas): the infinite graph, complete and self-sufficient.
- **CONTROL** (the control center, post-foundation design): modular rack tiles,
  previews, lock-and-cascade; reads everything, edits nothing.
- **CREATION** (the workbench, post-foundation design): all media/prompt creation —
  editing, reference sheets, refmods, LoRAs (trainers: Fizgig/Musubi/Ostris), the
  multi-model stack, the LLM/prompt-library composer. Both INPUT (source
  abstraction: disk | upload | workbench, for media AND prompts) and OUTPUT (the
  gallery — the canonical output home).

**Settled architecture directives** (never re-litigate):
1. **Registry-only MODELS** — ComfyUI's registry is the only source of truth; no
   manual pointing; instance-invisible = nonexistent; the manual model-location UI dies.
2. **Registry-only NODES** — detection reads object_info; the custom_nodes folder is
   only the install target for remediation; ComfyUI-Manager's API first for installs,
   our fetcher second.
3. **Models live on the NODES** — node-level dials; Settings is the fallback layer
   (global default → chain override → node dial).
4. **The debug suite** — tagged toggleable junction logging; the
   describe-the-problem era ends.
5. **The chain manager** — post-foundation, full brainstorm/spec/audit/blessing.
6. **The modularity contract** — "pulling out and removing old tools should be as
   easy as buying a new one"; every wave's acceptance includes the removal-cost test.

## Shipped (verified, CI green at landing)

*Pre-program history — real, CI-proven, and now under the remediation frame: the
audits found the load-bearing structures sound (document model, graph factories,
realtime core, landing machinery) with the debt concentrated at the seams.*

- **Stabilization + web migration** (epics m2yc3vd, 1qv5cg3, yl4tzwb, ph34nd8):
  P0 data-loss/silent-failure fixes, LAN hardening, Electron stripped → standalone
  Node server + SPA.
- **Foundation pass** (epic t63llq): perf, pino+boundaries, SQLite/FTS5 + OPFS,
  realtime fabric, zustand discipline, CSS tokens + Base UI, EngineProcess,
  PreviewSource/filmstrips/pooling.
- **LLM layer** (1de65kg): router primary + Ollama fallback; 8-layer composer;
  vision captioning; unload-before-generate.
- **Graph factory + optimization registry** (ttlqwwi, g07jo24); **self-managed
  runtime increments 1–2** (3ay7wbz); **local-first fetcher + catalog** (hgjbea2);
  **Identity Edit** (t8u00uu); **form-adaptive LoRA node** (k271ykk); **IK pose
  rig** (r2kxcjh); **camera compiler port** (ving89w); **Krea 2 edit families**;
  **Diagnostics suite**; **benchmark harness v1** (cp96zdm); **AutoContext
  catalog** (p8oyfy1).
- **Canvas Phases 0–5b SHIPPED** (specs blessed after adversarial audits): document
  store → substrate/launcher/queue → generation on canvas → ops/forks/takes →
  latent-fork rendering + the retirement wave → the deletion wave (canvas became THE
  app) → the Director Suite (timeline projection, plan documents, the gap menu;
  MoviePlanner retired).
- **Experiment program**: tranches 1–3b + E-FC + E-MD1 + E-K1 + MATLOWAI — verdicts
  in the research docs as dated addenda.
- **Training research**: DiffSynX smoke (a80ekav), the envelope (1n3a4mi), the
  training guide (mfdza7o), the per-model prompt doctrines, the Fizgig assessment.
- **Infrastructure migration** (dgrkp2e): central model home, canonical ComfyUI,
  118 GiB dedup, quarantine purged.
- **Overnight full audit** (junllxf, 5 PRs): security/correctness/perf/E2E —
  the latent live-verify POSITIVE.
- **Dataset Manager v1** (sv14rt0): the blessed spec end-to-end at `?datasets=1`.
- **H3 Image Workbench** (k9vu6t0, PR #12): the blessed spec r2 at `?images=1` —
  now understood as the SEED of the creation surface.
- **The 09-19 fix waves** (PRs #18–#27): image-pathway reroute (Z-Image → H3-1F),
  model overrides, LoRA timeline, external-instance integration, the settings +
  app-tour UX waves, start.sh launcher (configure TUI, dev mode, pull-freshness,
  tty hygiene), the node-pack status board.
- **Test suite migrated to vitest** (z7ogmig, PR #29): 19 serial cjs suites →
  `tests/*.test.js`, one parallel run (4.6× unit speedup), port allocator,
  build-before-unit gate.
- **Override layer completed** (rq0lsax PR #28 + epdvxd4 PR #30): instance-source
  form arm, the three checkpoint lanes (fl2va/ref2va/merged), the VAE trio
  (video/audio/image) + the workflow-population audit as a standing test.
- **Critical-path fixes** (tmz8vh7, PR #32): the T=1 wedge — legacy VAE picks
  route by decoder class at both seams, the server heals stored wedges at load,
  the inverse image/reference misroute refuses honestly, the remaining three
  dock scroll locks fixed.
- **Phase 0 removals** (z8bc21p, PR #33): LTX and Z-Image fully removed; the
  mobile companion, the five asset studios, and 447 dead CSS class families out
  (styles.css 274 KB → 60 KB); the manual model-path surface cut (read-only
  inventory + refresh); manifest with restore paths at
  `docs/audit/removals-phase0.md`; e2e 101 passed on the merged tree.

## Shipped since the waves (2026-09-22 → 2026-09-27)

- **High-zoom canvas fidelity + the PreviewOverride pack** (PRs #49/#48): the
  composited-layer blur diagnosed and fixed (gesture-scoped world promotion);
  the pack owns preview decoding whenever it + a taeh3 decoder are present.
- **The reality audit + journey + truth sweeps** (96c1242, PRs #50–#52): the
  environment mirror (`e2e/mirror/`); the wizard survives connection; the image
  lane reachable; `[redacted]` exiled from user surfaces; basename-true stack
  reporting; subpath'd models resolve.
- **The TE-dimension guard** (PR #53): wrong-family encoders refuse at validate
  (the 2026-09-22 crash class), with the family-registry expectation data.
- **Fizgig behind a flag → the full 1F machinery row** (PR #54 → #63): the
  E-FS1 arm contract-validated, then the T=1 machinery row selectable end-to-end.
- **The hands-on review trio** (PR #56): scene trash/restore/empty as a real
  cycle; AR-first resolution picking; reference prep never cropped (the
  maintainer's 2026-09-26 ruling, proven on the mirror at wiring truth).
- **The stack-report rework** (PR #55): derived from the SAME resolution the
  graphs use — the central-model law's reference implementation.
- **The custom-node inventory rulings executed** (PR #57 + custody commits):
  ostris inpaint-edit wired with the Cierpliwy weights; VDN adopted as our own;
  Viggle lineage corrected and weights mirrored hash-pinned.
- **Wire-or-remove A/B** (PRs #60/#61) + **VDN finished** (PR #62, zero-emission
  lane emitting) + **the centralization wave** (PR #59, R1–R5: the frame-grid
  ledger, one stack-ready predicate, basename truth, one pack-presence rule).
- **The image-workbench v2 spec round** (7151a66 → 20d7ea4): draft → blind audit
  → r2 fix pass → BLESSED (eight rulings) → post-blessing verification.
- **CI on demand** (fad53a4, the 2026-09-26 standing rule): runs only on
  workflow_dispatch or the `run-ci` PR label.
- **The perfect-state walk** (c85bd48): the mainline audit at the PERFECT-state
  directive — 31 findings, zero hard regressions, the gate twice-green.

## Queued (frontier order)

- **The perfect-state sweep** (6rmxbzf, landed 2026-09-28 and merged with the
  program): the 31 findings zeroed in
  the walk's six-wave order (truth surfaces → dialogs → workbench coherence →
  CSS floors → standing tail → gate tooling).
- **Workbench v2 Phase A** — the blessed creation-surface build-out (the
  Qwen-first wave r546bab carries the fooocus doctrine).
- **The shibui design round** — owns every contrast/visual-taste item (the
  perfect-state program deliberately scoped those OUT).
- Pre-program queue (re-scoped): the training sidecar (ehzagoc, re-scoped
  post-removal), drift-envelope suite (5nfy24y), camera editor, control-input
  tools, licensing statement.
- **Nits backlog** (5vu57ue) — deliberately deferred; many will dissolve in the
  redesigns.
- **GPU-window batch** (maintainer-timed): first real training run, E-IW2 (burst
  fusion), E-IW3 (pan-stitch), benchmark plumbing pass, Fizgig A/B.

## Awaiting maintainer

- The workbench-v2 phase gates beyond A (per the blessed spec's §11 phases).
- **Batch 4 keep/kill list** (dgrkp2e): fl2va-pruned, ref2va-pruned, 32B TE
  variant, GLM-in-tmp relocation.
- MATLOWAI default-vs-labeled; Intern bakeoff soak; Qwen3.8-Flash-Next
  verification (qwen4exp + mmproj).

## Explicitly not planned

- Audio work (V2A, vzpyldn) — parked; hinges on the envelope's audio A/B.
- GPU/testbed work only in maintainer-authorized windows; 8188 off-limits to agents.
- No network telemetry, no filters/gating (content-neutral by design).
- **Agentic Dataset Harness** (epic xfm74qg) — parked P2 per the maintainer
  ("the base app comes first"); all groundwork done and on its record.
