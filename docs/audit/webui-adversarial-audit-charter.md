# WebUI adversarial audit charter — the intended design, the inventory, and the protocol

> Flux task: **Codex handoff — webui audit charter (h6svuud)**. Date:
> **2026-10-02**. Purpose: the contract an external auditor (Codex) audits
> the webui AGAINST. This file states what SHOULD exist, what must NOT
> exist, what is deliberately interim/paused/retiring, the cross-cutting
> wiring invariants, and the adversarial protocol + output format. It is
> compiled from the settled corpus (ROADMAP, the remediation program epic
> 4lphxv8, the perfect-state walk c85bd48, the blessed specs, the SHIBUI
> design language) — those documents win over this summary wherever they
> disagree.

## 1. Mandate and scope

**Audit the webui only** — everything under `src/` (the Vite client) and
its contract with `server/` (the API the UI wires to), including build
health and the test suites that pin UI behavior. **NOT in scope:** engine/
ComfyUI internals, GPU work (ports 8188/8189 are OFF-LIMITS — never submit
anything to an engine), docs content, licensing paperwork, backend
performance. **Adversarial format:** the auditor's job is to BREAK claims —
every "the app does X" statement in this charter is a hypothesis to attack
by running the app, reading the wiring, and trying to produce the failure;
findings stand only with evidence (command + observed output, or file:line
+ what the code actually does vs what the contract says). No fixes: report,
don't repair.

## 2. The intended design — goals (settled; never re-litigate)

1. **The destination: a WORKSHOP OF THREE WORKSTATIONS** — *wiring* (the
   infinite canvas, self-sufficient), *control* (the control center:
   modular rack tiles, lock-and-cascade, reads-everything-edits-nothing),
   *creation* (the workbench: all media/prompt creation, input and output
   surfaces). Today the app is mid-journey: **the canvas IS the app**
   (default route, Phases 0–5b shipped); the image workbench v1
   (`?images=1`) is the creation-surface seed pending wholesale replacement
   by the BLESSED v2 spec; the control center is not yet built (the
   settings dock is its interim placeholder).
2. **The modularity contract governs everything**: pulling a tool out
   should be as easy as buying a new one. Surfaces self-register in the
   surface registry (`src/surfaces/registry.ts`) and the switcher picks
   them up — no surface may weld itself into another's shell.
3. **Identity (locked directives, 2026-09-20): the app name is MONOKA; the
   aesthetic is SHIBUI** — sumi warm-charcoal base, washi warm-neutral
   text hierarchy, **vermillion as the SINGLE accent** (the maker's mark:
   canonical takes, locked chains, sealed handoffs — never decoration),
   oiled-wood chrome warmth, 1px lines, restrained shadows. Monospace for
   LLM output. No style work outside this direction; "MONOKA" rename is
   ONE atomic future wave — the codebase may still carry the old name
   deliberately (do not flag piecemeal rename debt).
4. **Registry-only models/nodes; node-level model dials** (global default
   → chain override → node dial layering); the debug/diagnostics suite;
   truth surfaces (the UI must never display a claim the underlying
   machinery cannot support).
5. **Honest refusals over fake capability**: gated features refuse with
   the real reason (the launcher's image-lane Mamad8 gate is the canonical
   pattern). Content-neutral, no filters/gating on WHAT users make.
   Local-first: nothing phones out except user-initiated fetch actions.
6. **Diagnostics are PII-scrubbed BY DESIGN** — failure path + reason
   (node/pin/stage), never prompt semantics.

## 3. The surface inventory — what should exist NOW, per surface

Sources: the perfect-state walk's fitness verdicts (2026-09-27) + the
spec status lines. Verdict column = the walk's standing call; the auditor
verifies BEHAVIOR, not the verdict.

| Surface | Code home | Spec / contract | Walk verdict | The auditor verifies |
|---|---|---|---|---|
| Canvas + substrate (default route) | `src/canvas/` | canvas-ui-v1 (BLESSED §1–10) + canvas-document-model (SHIPPED schema) | KEEP → v2-absorbed later | boot → render → recovery → trash round-trip; take lifecycle; document model integrity; the e2e canvas suite passing for real |
| Launcher (spawn bar + resume cards) | `src/canvas/` (spawn) | canvas-ui-v1 | KEEP | lane toggle, resume cards, honest gates fire with the true reason |
| Radar (titlebar status) | titlebar | post-W17 contract: appears only when it has something to say | KEEP | no phantom warnings; aggregate matches store state |
| Settings dock | `src/components/… SettingsView` | interim by design (three-group IA, R-15) | KEEP-interim; REWORK scheduled later | three groups render; nothing claims Control-Center scope; sweep fixes held (footer clearance, picker classes) |
| Properties panel (chain inspector) | per-family component(s), ~1,300 lines | settled DESIGN (node dials, chain>global>auto) | REFACTOR (design right, code monolith) | the dial layering actually applies in that precedence; the walk's W-fixes held (tier row, seed a11y, audio link) |
| Images workbench v1 (`?images=1`) | `src/images/` | image-workbench-v1 (BLESSED+BUILT) | REWORK = v2 replaces it; **do not audit v1 for v2 features** | everything v1's own spec promises still works: packet/T=1/directed modes, R2I, six edit families, mask painter, tiered resolutions to 8MP, refine pairing, burst lane, the 1F machinery row |
| Image Workbench v2 | NOT YET BUILT (Phase A cleared, not dispatched) | image-workbench-v2 (BLESSED, blind-audited r1) | future | **absence is correct** — flag any premature v2 fragments welded into v1 |
| Datasets surface (`?datasets=1`) | `src/datasets/` | dataset-manager-v1 (BLESSED) | KEEP | full cycle incl. trash UX; three prior audits passed — verify still green |
| Setup wizard | settings/onboarding | walk-verified | KEEP | 4/4 steps, survives connection loss, reopens on demand, probe-list honesty |
| Pose rig (`?poserig=1`) | `src/poserig/` | own suite + benchmark | KEEP | palette discipline, handoff inbox feeds workbench pose refs |
| Surface switcher | `src/surfaces/registry.ts` | registry contract | KEEP | Alt+N cycles; a surface registering appears; dev routes (`?proto=`) NEVER appear |
| Trash/export (index overlay) | canvas index | W13 cycle | KEEP | tombstone → restore → the ONE gated empty; archive export works |
| Structured-prompt editor | `src/components/StructuredPromptEditor.tsx` + `src/lib/structuredPrompt.ts` | structured-prompt-editor (SHIPPED) | KEEP | contract preview + parse round-trips (unit-pinned — verify suite green) |
| Camera editor | `src/components/CameraPathEditor.tsx` + `src/lib/camera/` | compiler port suite + benchmark | KEEP (unexercised recently) | **exercise it** — the one major surface no recent walk touched |
| Music 3 / audio dock | audio lane | 2026-09-28 ruling | **PAUSED-BY-FLAG (correct state)** | the dock is disabled at the UI WITH the honest reason visible; code+suites still compile green; H3 joint-AV audio is LIVE and must NOT be affected |

## 4. What must NOT exist (audit for ghosts)

- **Removed in Phase 0 (PR #33): LTX lanes, Z-Image, the five asset
  studios, the mobile companion.** Any surviving UI entry point, button,
  route, or doc link referencing them is a finding.
- **Slated for v2 retirement (still legal today, do NOT flag as bugs):**
  v1 workbench lane-parity rails, the canvas-as-shell role. They retire
  when v2 Phase B lands — flag only NEW work built on them.
- **Dev-only routes** (`?proto=`, `?poserig=1` outside its dev framing)
  leaking into the surface switcher or user-facing navigation.
- Any second accent color, decorative color, or non-SHIBUI styling
  introduced outside the design-language doc's token plan.

## 5. Cross-cutting wiring invariants (attack each)

1. **Build/type/test health is table stakes**: `pnpm typecheck`, `pnpm lint`
   (0 warnings), `pnpm test` (vitest, one parallel run), `pnpm test:e2e`
   (Playwright, builds first) — all green on a clean tree, or the
   deviation is Finding #1.
2. **The UI↔server contract**: every UI action that claims to do something
   reaches a real server route (`server/`); no dead buttons, no actions
   that optimistically succeed while the request fails silently. The
   silent-failure class (error returned as data, empty counted as done) is
   the highest-severity category in this audit.
3. **Truth surfaces**: stack report derives from the resolution the graphs
   actually use; inventory refreshes on engine recovery; override
   attribution visible; TE-dimension guard fires (PRs #52–55).
4. **Honest gates**: every gated/refusing surface states the true reason.
5. **Recovery paths**: engine loss → the UI recovers state (not a blank);
  failed generations surface failure taxonomy (node/pin/stage), never
  prompt text.
6. **Surface isolation**: killing/disabling one surface must not break
   another (the modularity contract's practical test).
7. **Console hygiene under normal use**: no unhandled promise rejections
   or error spew in happy-path flows.

## 6. Known findings already on record (verify HELD; do not re-report as new)

The 2026-09-27 walk's 31 findings + the perfect-state sweep (PR series to
#63) — the sweep claims these zeroed: workbench dialog semantics
(W1/W5/W6/W8/W11), the properties-panel leaks (tier row, seed a11y, audio
link), settings footer/pickers, copy fixes (C11), the trash cycle (W13).
The standing tail at walk time: findings 14, 15, 17, 18, 19, 21 (see the
walk doc) — check their current state explicitly and report
held/regressed/fixed. Prior audit docs (`docs/audit/*`, esp.
`wiring-check-2026-09-26.md`, `docs-vs-app-conformance.md`) list further
claims worth re-attacking.

## 7. Adversarial protocol

1. **Read first**: this charter → ROADMAP → the blessed specs for each
   surface you attack → the surface's code. The spec is the contract; the
   walk verdicts are context, not gospel.
2. **Attack by doing**: run the app (`pnpm dev` — it builds web + starts
   server; use the fake-engine fixtures from `e2e/fakeEngineInfo.ts`
   and the Playwright suites as the pattern for driving flows without a
   real engine). Attempt the failure: empty states, race the recovery
   path, break a generation mid-flight (fake engine offers this), toggle
   surfaces mid-operation, resize/zoom boundaries, keyboard-only
   navigation for every primary flow (a11y is part of UX), rapid
   re-clicks/double-submits.
3. **Attack the claims**: for each §3 row and §5 invariant, write the
   strongest case AGAINST it surviving contact with reality, then run that
   case. A finding with no reproduction attempt is not a finding.
4. **Severity**: **S1** broken contract/silent failure/data loss or UI
   shows false success; **S2** spec violation or degraded core flow with
   a visible error; **S3** UX friction/a11y gap/copy dishonesty;
   **S4** polish. Label each: **REGRESSION** (was fixed, broke again),
   **STANDING** (known, still open — cite the prior finding), or **NEW**.
5. **Evidence bar**: every finding cites file:line (or repro steps +
   observed output) AND the charter/spec clause it violates. No style
   opinions outside the SHIBUI contract; no feature proposals — this is
   an audit of what IS against what was DECIDED.

## 8. Output format (the deliverable)

A single markdown report: (1) an executive verdict per surface
(PASS / PASS-WITH-FINDINGS / FAIL) with the strongest evidence; (2) the
findings table (id, severity, class REGRESSION/STANDING/NEW, surface,
claim attacked, evidence, spec clause); (3) the health commands' actual
results; (4) the standing-tail status list; (5) the three findings you
would fix first and why. Do not modify any file except to add your report
if instructed to leave it in-repo (default: return the report as text).

## 9. Constraints

Read-mostly audit: no code changes, no dependency changes, no engine/GPU
contact, no external network beyond what running the dev app locally
requires (it shouldn't require any). Respect the deletion policy
(destructive commands are hook-blocked). The settled directives in §2 are
not up for debate — audit AGAINST them, not around them.
