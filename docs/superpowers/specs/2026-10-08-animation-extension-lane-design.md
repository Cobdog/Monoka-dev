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

This is an **experimental v1**, session-scoped by ruling: it ships the
creative value first; restart durability is v1.1's increment, gated by the
audit's adapted probes.

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
binding (§5); session-scoped carried state with the named unavailable
condition (§7); the two-readiness lifecycle (§8); preflight compatibility
and collision refusals (§10); the join recipe from the tuning probe (§9);
the adapter scope is the tween lane only (Set L's tested conditioning —
hero/sequence need adapter-specific probes first, per the audit).

**Out (v1):** restart-durable continuation (v1.1: the checkpoint binding +
the two adapted probes — carried-latent persistence and receipt/recovery —
gate that increment); Set-K-style re-noising as a variation feature (its
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
as a new take on the same chain — the timeline presents the chain's window
sequence (source, extensions in order), each window reviewable, the
assembled delivery previewable. Nothing auto-selects; the assembled view
is a preview, not an editorial truth (editorial contributions remain the
§9 assembly layer's own commands).

**Re-rolling an extension** re-rolls that window under the same frozen
recipe (a new alternative on the window's slot, §5.3 semantics) — it never
silently re-picks the source.

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
- **The resolved model fingerprints** — the exact resolved base, adapter,
  VAE, and encoder names the window will run on (the module's wave-1
  resolution machinery supplies them).
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
  layout, geometry, and length, plus the resolved model fingerprints, the
  latent/state convention (terminal-zero), and the adapter identity. A
  source that does not match its own recorded fingerprint is not
  extendable (the named refusal says what drifted).
- **The target length** — validated against the **overlap recipe**, not
  against the source's length: the target window must be a legal 17k+5
  length that satisfies the recipe's overlap and phase requirements (the
  node contract: context strictly shorter than generation; the pinned
  head trimmed on delivery). Extending a 22-frame clip with a 56-frame
  window is legal whenever the recipe's constraints hold — requiring
  identical lengths would prevent exactly the extension this lane exists
  for.

**Both frame counts freeze at submission**: the generated count and the
delivered count (after trim) are recorded on the attempt; recovery and
replay use the frozen pair, never recomputed geometry.

## 7. Session-scoped carried state — the named unavailable condition (ruling 2)

v1's carried state lives in the session: the engine's cache and the
studio's in-memory continuation state. **When that state is lost** — an
engine restart, a studio restart, cache eviction — the affected bindings
enter a named condition: **continuation unavailable**.

The condition's contract:
- The clip **stays playable** — editorial and export never regress.
- The binding **stays preserved** — the frozen record remains truthful
  history (§5's metadata-vs-availability separation).
- **Never** silently reconstruct state, substitute another source or
  window, or re-render to regenerate the carry. The unavailable state is
  surfaced, not papered over; the user's explicit options are to re-land
  the source chain or wait for v1.1's durable checkpoint binding.

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

**The join recipe** — continuation mode (five_frame_anchor default vs
latent_overlap), overlap sizing, and any stall-mitigation the probe finds
— is **provisional until the tuning probe lands**. Set L measured a
near-stop just after each join (alongside dE ~1.7 seams); the probe's
measured target is the least post-join speed dip at acceptable seam and
cost. v1 ships the honestly tuned recipe with its measured stall
documented; the spec's acceptance claims over the join wait for the
probe's numbers.

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
| Mechanism | Motion Context tail conditioning (Set L, 9/9) |
| v1 durability | Session-scoped; the named unavailable condition (§7); durable checkpoints are v1.1, probe-gated |
| The join | Probe + tune in v1; ship the measured, documented stall |
| Selection semantics | The source is an attempt/window, never a frame; trims don't move it |
| Source vs target length | Separate checks (§6); both counts frozen |
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
| Motion Context's cache does not survive restarts | §7's named condition; v1.1's reason |
| Prompt times refer to the sampled window (strategic review) | The carry preview's time-shift disclosure |
| The node drops pinned-region anchors silently (strategic review) | §10's preflight refusal |
| Context must be shorter than generation; the head is trimmed | §6's target-length validation; the delivered-count freeze |
| Identity drift on re-entry (community, untested here) | Recorded risk; the lane's review surface makes drift visible per window |
