# The Animation Extension Lane — Design Spec

> **Status**: draft for maintainer review (the nod of 2026-10-08 covers
> sections 2–6 with three amendments, now incorporated; §4's interaction
> is presented here for the first time — the complete spec returns before
> any plan or code).
> **Derived from**: Set L's eye verdict (Motion Context 9/9 —
> docs/research/gpu-batch-setL-results.md), the strategic review
> (docs/research/latent-continuation-strategic-review-2026-10-08.md), the
> feasibility audit
> (docs/research/latent-continuation-feasibility-audit-2026-10-08.md), and
> the maintainer's rulings of 2026-10-08.
> **Provisional**: recipe values and acceptance claims remain provisional
> until the queued probes (join tuning; single-lane ending) land — the
> spec's shape is decided, its numbers are not.

---

## 1. Purpose

The animation module's clips stop at their generated length. The extension
lane lets motion **continue into new time**: on a landed clip, an explicit
Extend action conditions a fresh generation window on the clip's carried
tail (Motion Context tail conditioning — the mechanism that won Set L's
blind comparison on motion advancement, 9/9 across all seeds), reviewed
exactly like any render. Identity continues to come from image references;
the tail supplies the motion.

This is an **experimental v1**: the carried state is an owned,
content-addressed artifact persisted by the source render and registered
at landing (§7 — cross-submission by construction, the engine cache
never the source of truth). Because v1 depends on saved artifacts,
**Save/Load parity, receipt discovery, and continuation after a
completed-source restart gate v1 itself** (§7's acceptance); v1.1 adds
the broader mid-render restart recovery hardening, with explicit failure
behavior.

## 2. Architectural identity

An increment on the animation-authoring module's standing architecture —
no second system. Inherited unchanged: the document/attempt store with
expectedRevision-gated commands, server-owned execution and completion
landing, frozen attempts, explicit selection as the only selection truth,
and the kit-component UI. Added: a typed continuation lane over those
contracts. Image references are untouched — the audit's seam table governs
where the lane attaches (a discriminated binding, not a widened reference).

## 3. Scope

**In (v1):** the Extend action on landed tween-lane clips; the continuation
binding (§5); the owned carry artifact with the named unavailable
condition (§7); the two-readiness lifecycle (§8); preflight compatibility
and collision refusals (§10); the join recipe from the tuning probe (§9);
the adapter scope is the tween lane only (Set L's tested conditioning —
hero/sequence need adapter-specific probes first, per the audit).

**Out (v1):** mid-render restart recovery hardening (v1.1, with explicit
failure behavior — the completed-source restart case is IN v1, §7);
Set-K-style re-noising as a variation feature (its
own named lane if ever); frame-specific latent continuation (blocked
pending a temporal-slicing probe); auto-chaining (every extension is an
explicit user action); audio in delivered output.

## 4. The Extend interaction

**Where it lives:** the review surface of a landed, playable tween-lane
take, beside the standing actions — never a timeline drag, never automatic.

**What it shows before submission:**
- **The overlap math, in both clocks** — generated frames (the new window's
  full length, on the 17k+5 grid) and delivered frames (generated minus
  the trimmed pinned head), so the user sees exactly what new time the
  extension buys and what it re-covers.
- **The carry preview** — which tail window of the source is pinned (its
  frame range, in source coordinates), and the prompt-time shift that
  follows the sampled window (the strategic review's finding: prompt times
  refer to the sampled window; delivery times shift after trimming).
- **The preflight verdicts** — compatibility (§6) and collisions (§10),
  each a named pass or refusal with its reason.

**The submission** is a continuation attempt: it freezes the full record
(§5) and dispatches like any attempt. **The review** lands the extension
as a new take on the chain's window slot. Nothing auto-selects; the
assembled view is a preview, not an editorial truth (editorial
contributions remain the §9 assembly layer's own commands).

**The document model (windows, branching, selection):**
- **Extend creates a window slot** on the extension chain rooted at the
  source attempt. The chain record owns an ordered window-slot list; each
  slot holds attempt alternatives and its own selected-candidate pointer —
  the key-slot pattern applied to windows (one selection truth per slot,
  server-enforced, lockable by the same lock class).
- **Selection** is a new explicit command in the module's selection family
  (`selectWindowCandidate`, expectedRevision-gated, lock-guarded) — never
  implicit in landing.
- **Ancestor changes never rebind descendants — and alternatives never
  invalidate anyone.** Descendants are bound to their frozen source
  ATTEMPTS, which a sibling alternative cannot touch: adding an
  unselected alternative to an ancestor slot marks nothing stale. A
  descendant goes stale only when its relevant SELECTED ancestry changes
  or its own authored inputs change — the module's §5.3/§8.3 separation
  (alternatives vs selection) extended to chains. Nothing silently
  follows a moved ancestor; prior takes are always preserved.
- **Branches are explicit and legal.** Extending an unselected alternative
  creates a branch rooted at that alternative's attempt — the re-roll
  shape applied to chains.
- **Assembled-preview traversal follows explicit source-attempt edges.**
  Each window's recorded frozen source defines the path, not slot
  selections alone: the preview walks window slots in order, following
  each window's own recorded source attempt backward. If a slot's
  current selection is NOT the attempt its selected descendant was
  conditioned on (B extends A1; the ancestor slot now selects A2), the
  path is a **named stale/mismatch state** — surfaced, never silently
  assembled from unrelated ancestry. The resolution is the explicit
  binding change (§5): reselect the compatible ancestry, or explicitly
  rebind the descendant (its own revision-gated mutation, with staleness
  propagated). Locks protect selections exactly as elsewhere; a lock
  never hides a mismatch — the state is named regardless.
- **Motion authoring for the new time**: the extension draft owns the new
  window's motion intent — movement + preservation text authored against
  the window's time base, compiled through the tween dialect with the
  prompt-time shift the carry preview discloses. The compiled caption
  freezes into the attempt (compiler version frozen with it, as ever).

**Re-rolls are two distinct actions, never conflated:**
- **Retry** — the identical attempt, every frozen field including the
  seed; the §7.2.2 idempotency semantics (a lost response, not a new
  take).
- **New alternative** — an explicitly changed, newly frozen seed (and
  optionally other re-authored draft fields); a deliberate action the UI
  names as such. The seed change is part of the alternative-creation
  command, never an implicit re-roll behavior.

## 5. The continuation binding (the frozen record)

Every continuation attempt freezes, verbatim:

- **The source attempt** (its id — the landed render whose tail is carried).
- **The window coordinates and phase** — the pinned tail's frame range in
  source coordinates, the source's own window geometry, and the temporal
  phase the conditioning requires (the node contract's alignment).
- **The artifact identity** — the carried state's content-addressed
  identity and digest (its availability is tracked separately, §7).
- **The recipe and version** — the continuation mode, overlap sizing,
  schedule, steps, seed, and the recipe's version string; recipe changes
  are version changes.
- **The resolved model content identities** — not filenames: the
  content-addressed identities (digests) of the exact weights the window
  will run on — base, adapter, VAE, encoder. Filenames alias; weights
  replaced under an unchanged name must fail the check. Where digest
  evidence is unavailable for a resolved artifact, that absence is a
  **named refusal** (identity evidence missing), never a name-only pass.
- **The conditioning inputs** — the image references in force (unchanged
  §2 contracts) and the caption as compiled for the sampled window.

**Binding semantics (ruling 3):** selecting a different source — or
changing any frozen field — is an **explicit binding change**, a distinct
document mutation with its own revision bump and descendant staleness.
**Editorial trims never modify the binding**: trimming what the timeline
delivers does not move what the continuation extends. **Binding metadata
is distinct from artifact availability**: the persisted record stays
truthful even when the carried state it names is gone (§7).

## 6. Compatibility (ruling 1: source fingerprint ≠ target length)

Two separate checks, deliberately unequal:

- **The source fingerprint** — fail-closed over the SOURCE window's
  layout, geometry, and length, plus the resolved model content
  identities, the latent/state convention (terminal-zero), and the
  adapter identity.
- **The target-execution comparison** — the check that matters at
  dispatch: the TARGET's freshly resolved execution configuration (its
  own content identities, layout, and state convention) must MATCH the
  binding's frozen source identities and the recipe's requirements.
  Checking only that the source matches its own record is insufficient —
  a source rendered under weights since replaced must refuse here, by
  name, naming the drifted artifact.
- **The target length** — validated against the **overlap recipe**, not
  against the source's length: the target window must be a legal 17k+5
  length that satisfies the recipe's overlap and phase requirements (the
  node contract: context strictly shorter than generation; the pinned
  head trimmed on delivery). Extending a 22-frame clip with a 56-frame
  window is legal whenever the recipe's constraints hold — requiring
  identical lengths would prevent exactly the extension this lane exists
  for.

**Both frame counts freeze at submission, with the full coordinate
mapping**: the attempt records the GENERATED coordinates (the raw
window's frame range on the 17k+5 grid), the HEAD-TRIM count, and the
DELIVERED coordinates, plus their explicit mapping (delivered frame d ↔
generated frame d + trim). Subsequent extensions refer to the **raw
latent's geometry and phase** (generated coordinates — the latent's own
world) while the UI shows the corresponding **delivered-tail range**
(the user's world). Editorial trims live entirely outside this mapping —
they cut delivered time and never touch generated coordinates, the trim
count, or the binding. Recovery and replay use the frozen mapping, never
recomputed geometry. **Acceptance requires a second extension from an
extension** — the chained handoff (generated → trim → delivered → next
window's generated reference) proven twice, not only the first handoff.

## 7. The carried state — the cross-submission contract

Set L proved the carry inside ONE graph (a direct connection that
explicitly bypassed the pack's Save/Load). The lane's normal flow is
**separate submissions**: render, review, extend later. The carry must
therefore be an explicit, owned artifact — never an engine-cache
assumption.

**The contract:**
- **Engine production — inside the source graph.** The Save node needs
  the sampler's live AV tensor, so it executes INSIDE the source render
  graph: the engine writes the carry file during the source render
  itself. The completion owner does NOT materialize the carry post-hoc.
- **Server registration — after the render.** The completion owner
  subsequently DISCOVERS the saved file, VERIFIES it (digest), and
  REGISTERS it in the studio's blob store as the continuation artifact.
- **The receipt mechanism is a required v1 contract.** The Save node
  returns its path as an execution output without a history-UI receipt —
  exactly the gap the audit flagged. v1 ships a receipt path that makes
  the saved file discoverable by the studio (the probe's accepted
  mechanism), or the lane does not ship.
- **Independent readiness at landing**: media landing establishes
  **playable** readiness; artifact registration establishes
  **continuation** readiness. A carry failure never holds the playable
  clip hostage. Two retry shapes: when the FILE EXISTS but registration
  failed, preparation retries verification/registration (no re-render —
  the frame-preparation pattern); when NO FILE was produced (the in-graph
  Save failed), continuation-readiness is unreachable for that attempt —
  the named condition, the clip playable, a new alternative (explicitly
  re-rolled) the user's path.
- **The carry handle**: the binding's artifact identity (§5) — the
  content-addressed digest handle. Opaque: no engine slot paths, no cache
  keys, nothing the engine's internal lifecycle can invalidate.
- **Consumer**: the Extend submission's graph loads the registered
  artifact (the pack's Load path) and conditions on it. The engine cache
  may serve as a read-through optimization, never as the source of truth.
- **Ownership and retention**: the artifact belongs to the source
  attempt; **live bindings pin it** — retention never collects a
  continuation artifact referenced by a live (non-replaced) binding.
- **Availability check**: at preflight AND again at dispatch, the
  artifact must resolve by digest. **A miss refuses** — the named
  **continuation unavailable** condition — and never, under any
  circumstance, executes the source graph again to regenerate the carry.

**The unavailable condition's contract** (unchanged in spirit, now
reachable only by genuine artifact loss — disk loss, manual removal):
- The clip **stays playable** — editorial and export never regress.
- The binding **stays preserved** — the frozen record remains truthful
  history (§5's metadata-vs-availability separation).
- **Never** silently reconstruct state, substitute another source or
  window, or re-render to regenerate the carry. The user's explicit
  options are to re-land the source chain or accept the v1.1 recovery
  behavior when it lands.

**v1 acceptance gates the seam itself**: Save/Load parity (the saved
artifact reloaded into a second submission reproduces the carry the
in-graph connection gave Set L, within the probe's tolerance);
**receipt discovery** (the studio finds and registers the saved file
through the accepted receipt mechanism — the audit's probe);
**continuation after a completed-source restart** (engine and studio
restarted between the source's landing and the Extend submission — the
carry still works from the registered artifact). Broader mid-render
recovery (an engine death DURING a continuation attempt) is v1.1, with
explicit failure behavior specified there. The handoff test stands:
render → review → a SEPARATE Extend submission, including the eviction
case (the artifact removed between preflight and dispatch — the dispatch
refuses by name, the clip playable throughout).

## 8. The two-readiness lifecycle

A landed extension attempt carries two independent readiness flags:
**playable/reviewable** (the delivered video exists and review works —
the standing lifecycle) and **continuation-ready** (the carried state is
present and fingerprint-valid — this lane's addition). A clip can be
playable and not continuation-ready (§7's condition); it cannot be
continuation-ready without being playable (the carry comes from a landed
render). The completion owner lands the pair; preparation of the carry
retries without re-rendering, exactly like frame preparation.

## 9. The join recipe and the operating point (provisional)

**The operating point** is Set L's measured one: the Set-K point on the
base (ref2va int8 + tween adapter, euler/simple, no CFG, shift 12/3,
1344×768) plus the installed pack's conditioning nodes per their
documented conventions (22f tail context, prompt-time shift, 24 fps).

**The join recipe** — **provisional until the tuning probe lands, with
the candidates correctly attributed**: the node Set L used
(ComfyUI-H3-Motion-Context) exposes context lengths and accepts carried
LATENT or PIXEL context — its tuning axes are context-length sweeps and
the latent-vs-pixel conditioning choice. The `five_frame_anchor` /
`latent_overlap` modes named in the prior draft belong to
**ComfyUI-Viggle-Animate-H3's chunked sampler**, a different pack: testing
its five-frame pixel anchoring against Motion Context's latent-tail
conditioning is a legitimate RECIPE comparison (different graphs, pack
versions recorded), not a dropdown change on the tested node. The probe
identifies its candidate graphs and pack versions explicitly. Set L
measured a near-stop just after each join (alongside dE ~1.7 seams); the
probe's measured target is the least post-join speed dip at acceptable
seam and cost.

**The release gate is an explicit maintainer acceptance, not a shipped
measurement**: after the tuning probe, the maintainer accepts or rejects
the tuned recipe on named axes — motion advancement, join stall,
identity/style hold, endpoint limitations, and cost — and v1 ships what
was accepted, with the measured record attached. "Ship the measured
stall" means ship the stall the maintainer accepted, no more.

**The single-generation lane** stays out of this spec (a recorded
cheap-motion finding with a known ending limitation; the ending probe's
answer lands in the research record either way).

## 10. Preflight collisions and refusals

Compatibility failures, collision failures (user-authored anchors that
would be dropped inside the pinned region — the node drops them with a
log line; this lane makes that a **preflight refusal** naming the anchor),
overlap-recipe violations, and unavailable carried state are all named
refusals before dispatch — the module's no-silent-drop doctrine. Nothing
in this lane degrades into a log line.

## 11. Resolved decisions

| Decision | Ruling |
|---|---|
| Mechanism | Motion Context tail conditioning (Set L, 9/9 — three seeds, one character/arc, motion-advancement judged; long-chain quality, endpoint arrival, and cadence unestablished) |
| The carry | Produced by the in-graph Save (the engine, during the source render); discovered, verified, and registered by the completion owner (§7) — an owned content-addressed artifact; the engine cache is never the source of truth; playable and continuation readiness land independently |
| Durability | Save/Load parity + receipt discovery + continuation-after-completed-source-restart GATE v1; mid-render restart recovery hardening is v1.1 with explicit failure behavior |
| The join | Probe + tune (correctly-attributed candidates, §9); SHIP ONLY ON the maintainer's explicit acceptance over the named axes |
| Selection semantics | The source is an attempt/window, never a frame; trims don't move it; window slots hold their own selection truth; alternatives never invalidate; ancestors never silently rebind descendants; preview traversal follows source-attempt edges with the named mismatch state; branches are explicit |
| Re-rolls | Retry (identical, idempotent) ≠ new alternative (explicitly changed, newly frozen seed) |
| Source vs target length | Separate checks (§6): the source fingerprint fail-closed; the target validated against the overlap recipe; the full generated/trim/delivered coordinate mapping frozen; second-extension acceptance required |
| Model identity | Content identities (digests), not filenames; missing identity evidence is a named refusal; the target's resolved configuration is compared against the binding's frozen identities |
| Adapter scope | Tween lane only, pending adapter-specific probes |
| Single-lane | Out of the spec; its ending probe is research follow-up |
| Set-K re-noising | Out; a possible separately-named variation feature |

## 12. Development strategy

Spec-first (this document), then the writing-plans flow on approval. The
two probes run as research now and feed the plan's recipe values; the
implementation inherits the module's subagent-driven discipline (fresh
implementer per task, blind review, the whole-branch review at the end).
The v1.1 durability increment gets its own probe-gated cycle when called.

## 13. Constraints from the evidence base

| Finding | Consequence |
|---|---|
| mctx wins 9/9 on motion advancement (Set L) | The lane's mechanism |
| Near-stop after joins; dE ~1.7 seams; 1.9× per-frame cost (Set L) | The join probe's target; cost recorded in the UI's overlap math |
| The hold basin on tween chains (Set L, eye-confirmed) | Why extension exists — more tween steps do not buy advancement |
| Motion Context's cache does not survive restarts | The carry is never the cache (the registered artifact is); restart-after-completed-source is v1-gated; mid-render deaths are v1.1's explicit failure behavior |
| Prompt times refer to the sampled window (strategic review) | The carry preview's time-shift disclosure |
| The node drops pinned-region anchors silently (strategic review) | §10's preflight refusal |
| Context must be shorter than generation; the head is trimmed | §6's target-length validation; the delivered-count freeze |
| Identity drift on re-entry (community, untested here) | Recorded risk; the lane's review surface makes drift visible per window |
