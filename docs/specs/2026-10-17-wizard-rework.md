# The first-run wizard rework — the designate · test · verify onboarding (spec)

> **Status**: DRAFTED → BLESSED — decision-ready draft for the maintainer
> (First-run wizard rework (3p14abm), 2026-10-17). The judgment calls this
> draft made are collected in §7 for the blessing; everything else restates
> landed rulings or reads the tree.

**Inputs:** the blind-review synthesis [docs/audit/ux-review-2026-10-15.md](../audit/ux-review-2026-10-15.md) (themes 2/3/5 are this spec's spine) and R1's launch leg [r1-report.md](../audit/ux-review-2026-10-15/r1-report.md) (the wizard's current shape, the timings, every finding); the landed fixes this builds on — the preview gate (r3q1o49, 51ac1d2), tier honesty's one-derivation seam (g1girm8, 7823f62), server-owned jobs (gfv5h0g, cd27c84…dcb8185), honest states (ewtobuh, 5a8b495+dcb8185); the primed hash catalog (to7xpa7) as the detection backbone; the direction-audit constraints [remediation-plan.md §6](../audit/remediation-plan.md) (A-1 landed, A-2 surfaces-as-views); the current wizard `src/canvas/FirstRunWizard.tsx` + `FirstRunNotice.tsx`.

**The maintainer's ruling words (2026-10-15):** *"The setup for external ComfyUI should be a part of the initial wizard. The initial wizard should also prep the webapp to be run over LAN, specify ports, etc. The setup wizard should likely be a first-run wizard. Where everything is designated, selected, tested, and verified before a default configuration is created. A start flag can reset this at any time."* Plus the standing bars: **one-click** is the bar for every install/fetch action; **hash-backed named verdicts** (to7xpa7's catalog) are the detection backbone; and the whole point — *"dead simple to clone a fresh repo and get working in no time at all."*

---

## 1. Purpose and frame

The wizard becomes the true first-run surface: the one place where the
studio's inputs are **designated, selected, tested, and verified before any
default configuration is written**. Today's wizard presents four thin steps
whose heavy machinery lives behind Settings detours — the fresh-clone
walkthrough (R1) measured the result: a Models step that names nothing
(counts only), a Packs step that renders no rows (a count and two exit
links), a silent HTTP 500 at the exact Test moment, contradictory
re-sync toasts, and a final button that starts an 18-minute GPU job its own
copy says the user will trigger later. The rework moves the actions INTO
the walk, verifies each in place, and writes the configuration once, at the
exit, from verified state.

Two constraints govern every decision below:

- **A-2, surfaces-as-views (direction audit §6):** the wizard is a VIEW over
  server truth. It reads the server's settings, inventory, pack board, and
  job state; it triggers server-owned actions; it never owns jobs (A-1 /
  gfv5h0g landed — the first clip's render survives the wizard and the tab)
  and never keeps a second copy of a truth the server already holds.
- **The honest-states vocabulary (ewtobuh):** every verdict the wizard
  renders — engine, stack, packs, queue — speaks the taxonomy's closed
  vocabulary (`hash-confirmed` / `name-suspected` / `unknown` for identity
  once to7xpa7 lands; the failure/queue/stage words everywhere else). The
  wizard never invents a status word, and two surfaces never contradict
  each other on one screen.

**Scope vs the "thin wizard" ruling (A-4):** the remediation plan's
"R-16's wizard stays thin" is superseded by the 2026-10-15 directive in one
dimension only — the wizard gains the verify machinery (pack rows, fetch
rows, LAN prep) that first run actually needs. The discipline stands: no
gold-plating steps the workbench absorbs; license essays, provenance,
diagnostics depth, and daily-use IA stay in Settings / the library /
Diagnostics (§6).

## 2. The walk — five steps

The footer progress becomes five: **Engine → Models → Node packs → LAN prep
→ First prompt**. Each step ends in a *verified state or an honest refusal*
— never a silent maybe. Back/Next navigation is unchanged (resumable,
localStorage); the difference is what each step now does.

### 2.1 Step 1 — Engine: connect, verify, and the probe

- Empty address field, placeholder `http://127.0.0.1:8188 — ComfyUI's
  default port` (landed sr7fdym/f370ec8 — inherited, not re-specced).
- **Test verifies, then the walk holds the URL as a candidate** — the live
  readout ("cuda:0 RTX 3090, latency") plus the registry read that
  follows. The candidate is *scoped* into the dependent polls (§5) rather
  than saved keystroke-by-keystroke; the save happens at the exit (§3).
- The consent-gated **Probe common ports** button stays as is (click =
  consent; the found ports adopt-with-test in one click). The probe's
  per-port verdicts already ride the A-DBG junction.
- **Managed engine stays a pointer this round** (§7 D2): the step's note
  points at Settings → Setup → Managed engine. The walk is external-first
  per the directive; the managed runtime (checkout nomination, profiles,
  patch consent) is a Settings-scale surface that would double the wizard.
- Honest "connect later": the step allows continuing unverified, and the
  walk *says so* — the later steps' verify gates read "unverified engine —
  nothing to check against" instead of inventing verdicts.

### 2.2 Step 2 — Models: named per-component truth, one verdict

- The `h3StackReport` rows render **in the wizard** — per component
  (FL2VA, text encoder, video VAE, audio VAE, the turbo LoRA): the
  RESOLVED file name verbatim, its source layer, presence truth, the
  canonical-artifact hint, refusal reasons where a pick refuses, and the
  inference-shaped guidance when nothing resolves. Counts alone never
  render again (R1 P1-4).
- **One verdict, computed once, in one voice**: "Ready to render" or
  "Missing X, Y — here's where they go," with the missing components
  NAMED. When the engine can render, no incomplete-warning appears
  anywhere on the screen — the header pills either read the same
  `h3StackReport` seam or go quiet while the wizard presents (the R1
  "H3 engine ready" beside "The H3 stack is incomplete" contradiction
  dies at the seam, not by copy-tuning).
- **Identity labels ride the hash catalog (to7xpa7)** — this spec defines
  the presentation contract, the catalog fills it: each resolved component
  renders `hash-confirmed` ("this IS ref2va_pruned_int8 — hash-matched"),
  `name-suspected` (honestly labeled — the engine's listing matched, the
  bytes weren't verified), or `unknown`. Until the catalog lands the rows
  render name-suspected honestly (§7 D6); the non-gating rule is absolute
  either way (to7xpa7 pifbc5b): an unrecognized model never blocks and
  never forces a download.
- **Multi-candidate cases get an explicit presentation** (the
  ref2va/fl2va/viggle/hybrid quartet, the VAE alias soup): the picker
  resolves one and the row says *picked* ("resolved to X — 2 other
  candidates matched; override in Settings if wrong") or *ambiguous* (the
  candidates named, one click to designate the pick through the existing
  override seam). Never a silent choice, never a dead end.
- **One-click fetch where a fetch entry exists**: a missing component with
  a catalog row gets an in-wizard consented fetch row (the
  library's fetch/consent/start seam — one click, verified result
  in-place: the file lands, the registry re-reads, the row flips to
  named-and-present). Where no fetch entry exists the row states the
  truth (publisher-direct) and the `makeVisible` guidance (what shape of
  name resolves, where weights go) — the honest fallback, not a fake
  remediation.
- The **0-vs-89 re-sync toasts collapse into one truthful inventory
  event** (den7itd): one toast per inventory settle, its file count read
  from the same record the step renders — never a pre-connect "0 files"
  followed by a contradicting count.

### 2.3 Step 3 — Node packs: the rows render in-wizard, installs verify in place

- The step answers the first-timer's only question first — **"Can I
  generate right now? Yes/No"** — then shows the rows (R1 P1-6). Nothing
  installed and renderable = "Yes — nothing to do here," not a detour.
- **The missing-pack rows render in the wizard**: each row names the pack,
  one human sentence on what it unlocks (e.g. the preview-override pack —
  "restores live previews on engines with the fragile stock-preview crash
  class", the r3q1o49 context; the turbo family — "unlocks the fast
  first-clip tier"), and one **consented Install click**. The 100-word
  license/provenance essays stay in Settings/Diagnostics.
- **Install → verify against live object_info**: the install rides the
  existing `installEngineNodePack` seam (the answer's `via` — Manager-first
  or studio fallback — is stated on the row, never silent), and the row
  flips to active only after the pack's claimed node classes appear in a
  fresh targeted object_info read (A-8's per-node pulls, not a full
  re-fetch). Verified in place, no Settings detour, no dead-end step —
  one-click is the bar.
- **Curation**: the rows shown are the packs the studio's graphs need
  (the preflight core classes) plus the families that unlock the fast
  tier and previews. The long tail of the board (14 today) stays on the
  Settings board; the wizard is not the board's new home.

### 2.4 Step 4 — LAN prep (NEW)

The studio's own server already binds `0.0.0.0:4178` with HTTPS and a LAN
token by default (`startLanServer`, server/core.ts:3864-3916) — the LAN
story today is *invisible truth*. The step makes it a designation:

- **Host choice**: keep LAN-reachable (today's default) or narrow to
  loopback-only — an explicit choice, stated in world terms ("any device
  on this network can open the studio" vs "this machine only").
- **Port selection with a bind probe**: the server probes the candidate
  host:port for claimability (the runtime's port-probe pattern,
  generalized to host+port) BEFORE the designation is accepted — an
  in-use port answers honestly at designation time, not as a boot failure
  later. The default stays 4178.
- **Token offer**: the access token exists (lanToken); the step shows its
  state and offers show/reset. The security posture (HTTPS-by-default,
  self-signed cert with its fingerprint stated) is presented, not hidden.
- **The printed LAN URL**: the step prints the reachable URL
  (`lanStatus`-shaped: scheme://address:port, the cert-fingerprint note,
  the QR where the launcher's qr-print supports it) — the thing a phone
  on the same network can actually open.
- **Restart honesty**: port/host/token bind at boot (launcher env →
  `start.sh` config). The step writes the launcher config keys through
  the existing `--set` seam and states plainly "applies the next time the
  studio starts" — the wizard never restarts the server under the user
  mid-walk (their session must survive; thanks to gfv5h0g the jobs do
  regardless). **The default is keep-current** (already LAN-serving), so
  the fresh-clone path can pass this step in one click — and the printed
  URL still teaches them the studio is LAN-alive.
- **Placement**: after packs, before the first prompt (§7 D1) — the walk
  ends on the app's whole point (the first clip), with every
  infrastructure designation already verified behind it.

### 2.5 Step 5 — First prompt: the deliberate submit

- **Cost preview before any submit** (R1 P0-2/P0-3): the tier that will
  actually run, derived from the SAME seam the properties panel and the
  submit refusal read (`turboTierStates` → `inferSelections`, g1girm8's
  one-derivation rule — the wizard never derives availability in
  parallel), the resolution/duration it will run at, and the honest
  fallback text where the fast tier is unavailable ("will run 30 steps at
  quality"). Expected wait is stated as a *class* (minutes-class vs
  ~20-minute-class) — no invented minute counts; measured elapsed+ETA is
  the progress-surface work (synthesis 2.1's other half), not the
  wizard's.
- **The fast tier is the first-run default** (synthesis 2.1's first-run
  piece, moved here per jxb34l0's iwzyz4p): the exit writes it as the
  default configuration *only when verified available* — tier honesty
  both ways: never a default that will refuse, never "Fast · 4-step"
  that submits 30.
- **NEVER an auto-submit.** The button is labeled for what it does —
  **"Generate my first clip"** with the cost preview inline — and it
  fires on a deliberate click only. Enter in the textarea inserts a
  newline (today's Enter-submits handler goes away), and the button
  never both creates a chain and starts a job its copy disclaims. The
  alternative path — **"Just create the chain"** — lands the chain
  unsubmitted and exits to the canvas, where the tile's generate remains
  the single submit gesture. Both paths close the wizard honestly
  (§7 D5).
- The submit rides the server-owned job machinery (gfv5h0g): the wait is
  narrated in ewtobuh's vocabulary (queued truth, human stage words,
  taxonomy-verdict failures), and the landing survives the tab. The
  duplicate-prompt-surface question (wizard box vs canvas bar) resolves
  by the wizard overlaying the canvas during the walk — the canvas bar
  is the post-walk home of the same action, not a rival.

## 3. Verify-before-default-config — the exit contract

Nothing the walk designates persists as *configuration* until its step
verifies:

| Step | The verification gate |
|---|---|
| Engine | a live Test answered reachable (device readout + registry read) against the candidate URL |
| Models | every component row renders named truth — resolved-and-present, refused-with-reason, or missing-with-remediation; the verdict is one of the closed set |
| Node packs | every install the user consented to verified against live object_info; "can I generate" answers Yes honestly |
| LAN prep | the designated host:port answered the bind probe (or the step was left at keep-current) |
| First prompt | the cost preview reflects a verified tier; the submit (if chosen) is deliberate |

**The exit writes the configuration in one motion**: a single settings
save carrying the verified engine URL, the override picks designated
during the walk, the default tier, and the LAN config keys — plus the
wizard latch. No keystroke-saves mid-walk (today the address input saves
on every character): the wizard holds CANDIDATE state in memory, and the
dependent polls are scoped to the candidate server-side (§5) so
verification never needs a premature save. A crash or abandon mid-walk
leaves configuration untouched; the notice catches the path
(FirstRunNotice stays the fallback surface, latch keep-listed), and
`--setup` (§4) is the way back in.

**The one honest exception — installs are facts, not configuration:**
pack installs and model fetches are engine-side side effects (files on
the engine's disk); they persist the moment they verify, exactly as if
performed from Settings, and the walk re-reads them as truth on resume.
The exit's one-motion write covers *app configuration*; it does not
pretend engine-side files are transactional.

## 4. The `--setup` reset flag

- `start.sh` gains **`--setup`**: boot with the setup designation reset.
  The launcher passes a flag/env through; the server surfaces
  `setupRequested` on its bootstrap/settings read, and the app opens the
  wizard **regardless of the browser's localStorage latch** — the reset
  is server-owned so it works from any terminal, any browser, any
  profile (a shell flag cannot reach into localStorage; the server flag
  is the only honest mechanism).
- **Resets designated state, never user data**: the wizard latch
  (done/skipped) and everything the walk itself writes (engine URL,
  walk-designated overrides, default tier, LAN keys) are re-designatable.
  Canvas documents, takes, job history, libraries, datasets, and any
  setting the user made outside the walk are untouchable. Engine-side
  files installed during a prior walk are re-VERIFIED (re-read, re-rowed)
  on the new walk — never uninstalled.
- The in-app affordances stay and are the zero-terminal path: Settings →
  Setup → Reopen the wizard (exists), the notice's Resume (exists).
  `--setup` is the "at any time" guarantee the directive asked for.

## 5. The API honesty fixes riding

These are prerequisites of the walk's honesty — small, server-side, and
landed with this effort (card AC 7sgk6gw + den7itd's tail):

1. **`/api/lan/object-info` stops answering 500.** The route gains the
   comfy-status pattern (server/core.ts:3533 today: an unguarded
   `comfyFetch` that throws to a raw 500 at the exact Test moment, R1
   P2-11): engine-unreachable answers `{ connected: false, error }` with
   the reason — an honest failure shape, never a status code the client
   swallows silently.
2. **Save-or-scope before dependent polls.** The Test path's dependent
   reads (object_info, inventory) carry the CANDIDATE url (the
   `?url=`-scope pattern comfy-status already uses) or run after an
   explicit save — `runEngineCheck`'s manual-source object-info pull
   never fires against the stale saved default while the user's typed
   URL differs (§3's candidate model rides this).
3. **One truthful inventory event.** The contradictory re-sync toasts
   (R1: "node registry and model inventory re-synced (0 files on the
   engine)" against an 89-file engine) collapse to one event per
   inventory settle, its count read from the settle's own record — the
   same number the Models step renders.

## 6. What this spec does NOT do

- **The take viewer** (foelihc) — scrub/timecode/frame-step; separate
  design item, unaffected.
- **The gallery rename / outputs promotion and the standing IA**
  (jxb34l0 rows: R3 P0-1/F9, P1-9, P2-11/12/13/14) — the wizard becomes
  the *first-run* storefront (fetch rows in-wizard, §2.2); where
  get-models lives day-to-day is the standing-IA question and stays with
  jxb34l0 / the Control Center round.
- **The hash catalog itself** (to7xpa7) — specified there; this spec
  consumes its verdict vocabulary and non-gating rule, and sequences
  against it per §7 D6.
- **Elapsed/ETA telemetry** (synthesis 2.1's second half) — measured
  s/step, live ETA, humanized plateau copy belong to the progress
  surface; the wizard sets the default tier and previews the cost class
  only.
- **The control-room properties panel** (R1 P2-8, progressive
  disclosure) — jxb34l0's row; the wizard's only claim on it is that the
  first submit carries verified, sensible defaults.
- **Managed-engine setup** — pointer only this round (§7 D2).

## 7. The blessing decision points

Where this draft made judgment calls the maintainer should confirm:

- **D1 — LAN step placement.** Rec: step 4 of 5, after packs, before the
  first prompt — the walk ends on the payoff (the clip), with all
  infrastructure designated behind it. The alternative (LAN directly
  after Engine) groups the "plumbing" steps but buries the model/pack
  truth one screen deeper.
- **D2 — managed engine in the wizard.** Rec: stays a pointer this
  round (external-first per the directive; the managed runtime's
  checkout/profile/patch surface would double the walk). The cost:
  a managed-mode user runs the walk, then a Settings detour.
- **D3 — skip semantics.** Rec: skip = nothing persists, the notice
  catches, Resume/`--setup` reopens — identical to today's latch
  behavior, now under the verify contract (the app runs on session
  defaults until a walk completes). The alternative — skip inherits the
  walk's candidate state as config — would violate §3.
- **D4 — the reset mechanism.** Rec: server-side `setupRequested` flag
  surfaced through the bootstrap read (works from any browser/profile;
  the only mechanism a shell flag can honestly reach). The alternative
  (localStorage-only reset) cannot honor "a start flag can reset this at
  any time."
- **D5 — the first-prompt submit gesture.** Rec: the deliberate
  in-wizard "Generate my first clip" (cost preview inline) PLUS the
  "Just create the chain" alternative — both honest exits. The
  alternative (the wizard never submits; the canvas tile is the only
  submit gesture) is purer but pays one more gesture + a context switch
  at the exact moment of maximum motivation.
- **D6 — sequencing vs the hash catalog (to7xpa7).** Rec: this spec
  lands FIRST, its identity labels rendering `name-suspected` honestly;
  the catalog upgrades the labels in place (the presentation contract in
  §2.2 is designed for its vocabulary now). The alternative — blocking
  the wizard on the catalog — couples two shippable efforts and delays
  the onboarding fix the maintainer called "very terrible."

## 8. Acceptance criteria — the verify shape

The card's ACs (3p14abm) carry forward verbatim as the contract; this
section fixes the *evidence shape*:

1. **The fresh-clone walkthrough, reproduced** (card a8pxd9q): fresh
   clone, fresh home, fresh ComfyUI 0.41.0 — R1's method, wizard-only,
   zero settings-API shortcuts — timed end to end, screenshots at every
   step's settled state. Success is the friction ledger's after-column
   below, measured, not asserted.
2. **The friction ledger, before → after:**

| # | Before (R1, 2026-10-15, measured) | After (this spec's target) |
|---|---|---|
| 1 | Models step: counts only (11/22/6/45/5), nothing named; "incomplete" beside "H3 engine ready" | every component named (resolved file verbatim) with identity label; ONE verdict in one voice; pills agree or are quiet |
| 2 | Packs step: "0 of 14 packs active," no rows, two exit links | "Can I generate right now? Yes/No" + curated rows; consented installs verify against live object_info in place |
| 3 | `/api/lan/object-info` → HTTP 500 at the Test moment, swallowed | honest `{connected:false, error}` (comfy-status shape); dependent polls scoped to the candidate URL |
| 4 | Re-sync toasts contradict (0 files vs 89) | one inventory event per settle, count from the record both surfaces read |
| 5 | "Create the first chain" starts an 18-min job; copy disclaims it; Enter auto-fires | deliberate "Generate my first clip" with cost preview; Enter never submits; "Just create the chain" exits without a job |
| 6 | First clip inherits the slowest tier, no cost signal | fast tier verified and defaulted; honest fallback text where unavailable; wait stated as a class |
| 7 | LAN serving invisible (0.0.0.0:4178 HTTPS + token, never told) | host/port designated with a bind probe, token offered, the LAN URL printed |
| 8 | No reset: wizard latch is browser-local forever | `./start.sh --setup` re-runs the walk from any terminal; user data untouched |
| 9 | Launch → submit 3m02s; submit → clip 20m32s (30-step default + crash detour) | launch → submit ≤ 2 min interactive; submit → clip = the fast tier's render (minutes-class on the R1 rig), no crash detour (r3q1o49 landed) |

3. **Unit + e2e homes** per [docs/agent/testing.md](../agent/testing.md):
   the wizard's step gates, the exit's one-motion write, the candidate
   scoping, and the `--setup` flag get vitest coverage; the journey e2e
   lane drives the walk end-to-end against the fake engine (the real
   CUDA reproduction is the walkthrough in (1), maintainer-authorized
   window only).
4. **The modularity test** (every architectural decision): the wizard
   remains one removable surface — it reads server seams that exist
   without it (stack report, pack board, fetch catalog, lanStatus) and
   writes only through them. Pulling the wizard leaves every other
   surface whole; that is the acceptance question for review.

---

*Drafted 2026-10-17 against `main` @ 7314add (the uxfix batch, CI green
both legs). Corrections arrive as dated addenda per convention; the
blessing ruling flips the status line to BLESSED and settles §7.*
