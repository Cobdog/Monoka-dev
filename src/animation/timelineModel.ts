/**
 * The timeline model (task 8, k2q0n9s — spec §5 the key-slot model, §6 span
 * authoring, §7.4 the review position): the PURE, node-testable derivation
 * behind Timeline.tsx (tests/animation-timeline-model.test.js owns it; every
 * browser behavior is e2e/animation.spec.ts's). No React, no APIs, no
 * environment — the same discipline as shared/animation, kept here because
 * the shapes are view-shaped (the component's row/column math consumes them
 * verbatim).
 *
 * What it derives:
 *   - keys in TIMELINE order (sorted by `order` — the body's array order is
 *     storage order, never render order);
 *   - per key, the SELECTED candidate (null when the slot has no selection)
 *     and the ORIGIN BADGE that follows it (§5.1: origin is per-candidate —
 *     swapping the selection swaps the badge; a slot never owns one);
 *   - per span, its endpoints' orders VERBATIM (fromOrder/toOrder — a
 *     backward span shows fromOrder > toOrder; connectivity truth, not a
 *     normalized range) and `nesting`: the LANE its bar renders in. Adjacent
 *     spans share lane 0; a span whose key-order interval overlaps a span
 *     already placed in a lane stacks one lane up — deterministic (document
 *     order breaks ties), and step-slot content never moves a lane (steps
 *     nest INSIDE the bar, not beside it);
 *   - the REVIEW POSITION for the playhead (§7.4, finalized in task 10):
 *     the newest READY attempt whose review decision is still OPEN (a tween
 *     step slot with no rolling-reference selection; a hero key slot with
 *     no candidate selection), else the newest attempt still in flight —
 *     hero and sequence target key slots, tween targets a step slot and
 *     resolves to the span OWNING it. Nothing awaiting the user ⇒ null
 *     (the marker is absent, never a lying position).
 *
 * Input contract: a PARSED AnimationDocumentBody (parseAnimationDocumentBody
 * enforces the pointer integrity these derivations lean on — span endpoints
 * exist, selections point inside their own slot). The functions stay total
 * anyway: an unexpected dangling id degrades to a defensible value rather
 * than crashing the render.
 */
import type { AnimationDocumentBody, AnimationTool, AttemptContinuationView, AttemptExecutionState, ChainMismatch, ExtensionChain, FacingTerm, KeyCandidate, KeySlot, Span, WindowSlot } from '../../shared/animation/types'
import { chainMismatch } from '../../shared/animation/types'
import { assemblyDocumentProblems, assemblyEntryVerdict } from '../../shared/animation/assembly'
import { CONTINUATION_OVERLAP_RECIPE, continuationWindowPlan, type ContinuationWindowPlan } from '../../shared/animation/graphs'

/** Where a key's chosen image came from (the closed §5.1 vocabulary). */
export type KeyOrigin = KeyCandidate['origin']

/** One key as the timeline renders it: the slot verbatim plus its selected
 *  candidate and the origin badge that follows the selection. */
export type TimelineKey = KeySlot & { candidate: KeyCandidate | null; badge: KeyOrigin | null }

/** One span as the timeline renders it: the span verbatim plus endpoint
 *  orders (raw) and the lane its bar nests in. */
export type TimelineSpan = Span & { fromOrder: number; toOrder: number; nesting: number }

export type TimelineModel = { keys: TimelineKey[]; spans: TimelineSpan[] }

/** The playhead's position: a key slot or the span owning the reviewed step. */
export type TimelineReviewPosition = { kind: 'key' | 'span'; id: string } | null

/** The attempt facts the review position derives from — the recovery read's
 *  AttemptStateView satisfies this structurally (the newest is the LAST:
 *  the store serves attempts oldest-first). Task 10 finalized the shape:
 *  the position is chosen by OUTCOME (what awaits the user), so the
 *  execution state rides along. Task 11 adds `sourceKeyId` (hero rows): an
 *  in-flight hero render whose PROPOSED target slot has not materialized
 *  yet marks its SOURCE key — the next-key render attaches to where it
 *  starts. */
export type TimelineAttemptSummary = { attemptId: string; tool: AnimationTool; targetId: string; sourceKeyId?: string; execution: AttemptExecutionState }

/** The states whose engine-side truth is not settled (the state adapter's
 *  own set, mirrored — the review position treats them all as "running"). */
const IN_FLIGHT: ReadonlySet<AttemptExecutionState> = new Set(['queued', 'rendering', 'preparing', 'reconciling'])

/** Two spans overlap when their key-order intervals share more than an
 *  endpoint: a bar ends where the next key's card sits, so [0,1) and [1,2)
 *  merely touch. Half-open semantics over integer orders express that. */
function overlaps(a: { lo: number; hi: number }, b: { lo: number; hi: number }): boolean {
  return a.lo < b.hi && b.lo < a.hi
}

export function deriveTimeline(body: AnimationDocumentBody): TimelineModel {
  const keys: TimelineKey[] = [...body.keys]
    .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id < b.id ? -1 : 1))
    .map((slot) => {
      const candidate = slot.candidates.find((entry) => entry.id === slot.selectedCandidateId) ?? null
      return { ...slot, candidate, badge: candidate !== null ? candidate.origin : null }
    })

  const orderByKey = new Map(body.keys.map((slot) => [slot.id, slot.order]))
  const placed = body.spans.map((span, index) => {
    const fromOrder = orderByKey.get(span.fromKeyId) ?? 0
    const toOrder = orderByKey.get(span.toKeyId) ?? 0
    return { id: span.id, index, fromOrder, toOrder, lo: Math.min(fromOrder, toOrder), hi: Math.max(fromOrder, toOrder) }
  })
  // Lane packing, deterministic: leftmost-longest first, document order
  // breaking ties; each span takes the lowest lane whose intervals it does
  // not overlap. Duplicate-interval spans stack (0, 1, 2, …) in order.
  placed.sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.index - b.index)
  const lanes: Array<Array<{ lo: number; hi: number }>> = []
  const nesting = new Map<string, number>()
  for (const entry of placed) {
    const interval = { lo: entry.lo, hi: entry.hi }
    let lane = 0
    while (lane < lanes.length && lanes[lane]!.some((other) => overlaps(interval, other))) lane += 1
    if (lane === lanes.length) lanes.push([])
    lanes[lane]!.push(interval)
    nesting.set(entry.id, lane)
  }

  const spans: TimelineSpan[] = body.spans.map((span) => ({
    ...span,
    fromOrder: orderByKey.get(span.fromKeyId) ?? 0,
    toOrder: orderByKey.get(span.toKeyId) ?? 0,
    nesting: nesting.get(span.id) ?? 0,
  }))
  return { keys, spans }
}

/** The review position (§7.4), FINALIZED in task 10 (task 8's newest-
 *  attempt rule was supersedeable): the position is what awaits the user,
 *  not merely what happened last —
 *    rule 1 — the newest READY attempt whose review decision is still OPEN
 *    (a tween whose step slot has no rolling-reference selection; a hero
 *    whose key slot has no candidate selection; a sequence window take with
 *    NO editorial contribution naming it — task 13, the lane's reviewed
 *    marker): "On return, the editor
 *    restores the session and highlights 'Ready to review'." A slot that
 *    HAS a selection is resolved — the chain can continue from it, and a
 *    later re-roll landing beside it is an alternative, not a blocker;
 *    rule 2 — else the newest attempt still IN FLIGHT: "the timeline …
 *    attaches the running attempt to the relevant span";
 *    rule 3 — else null (the marker is absent, never a lying position).
 *  Completion advancing the marker is NOT automatic progress: rule 1 marks
 *  what the USER must decide, and the user's own selection dissolves it.
 *
 *  T10-M4 (wave 2b) adds rule 0 for the EXPLICIT position: when the caller
 *  holds one (the shell's selection) and the span it names owns a tween
 *  step slot holding MORE THAN ONE take — the document-truth signature of
 *  a re-roll landing there, whatever the new take's outcome — the position
 *  STICKS instead of re-resolving over the landing (which, for a step
 *  whose decision was already made, dissolves to null: the position the
 *  reviewer held evaporates under them, failed re-roll included). Key-
 *  grain positions need no rule — a hero/sequence re-roll targets the SAME
 *  key, so §7.4 already resolves to the same id or dissolves without ever
 *  moving an existing selection. Nothing explicit ⇒ rules 1–3 stand
 *  untouched: every two-argument call behaves exactly as before. */
export function deriveReviewPosition(body: AnimationDocumentBody, attempts: ReadonlyArray<TimelineAttemptSummary>, explicit?: TimelineReviewPosition): TimelineReviewPosition {
  // Rule 0 — T10-M4: a re-roll landing does not steal the explicit position.
  if (explicit !== undefined && explicit !== null && explicit.kind === 'span'
    && body.spans.some((span) => span.id === explicit.id
      && span.stepSlots.some((slot) => slot.attempts.length > 1))) {
    return explicit
  }
  // Rule 1 — the open review decision (§7.4's return-and-highlight).
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index]!
    if (attempt.execution !== 'ready') continue
    if (attempt.tool === 'tween') {
      // A tween attempt targets a step slot — the reviewable position is
      // the span that owns it (the bar the step chips nest inside).
      const span = body.spans.find((entry) => entry.stepSlots.some((slot) => slot.id === attempt.targetId && slot.selectedRollingReference === null))
      if (span) return { kind: 'span', id: span.id }
      continue
    }
    if (attempt.tool === 'sequence') {
      // Task 13: the sequence lane's review decision IS the editorial
      // contribution (§9 — task 12's named gap: the window-start key holds a
      // selection by construction, so nothing about the BODY was open). A
      // landed window take with NO contribution naming it is an OPEN decision
      // — the playhead marks the window start; contributing resolves it.
      if (!body.editorial.some((entry) => entry.attemptId === attempt.attemptId)
        && body.keys.some((entry) => entry.id === attempt.targetId)) {
        return { kind: 'key', id: attempt.targetId }
      }
      continue
    }
    // Hero targets a key slot (the PROPOSED slot the landing mints a
    // candidate into — open until the explicit selection exists).
    const key = body.keys.find((entry) => entry.id === attempt.targetId)
    if (key && key.selectedCandidateId === null) return { kind: 'key', id: key.id }
  }
  // Rule 2 — the running attempt (§7.4's during-the-wait attachment).
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index]!
    if (!IN_FLIGHT.has(attempt.execution)) continue
    if (attempt.tool === 'tween') {
      const span = body.spans.find((entry) => entry.stepSlots.some((slot) => slot.id === attempt.targetId))
      if (span) return { kind: 'span', id: span.id }
      continue
    }
    if (body.keys.some((entry) => entry.id === attempt.targetId)) return { kind: 'key', id: attempt.targetId }
    // An in-flight hero render targets a PROPOSED slot that materializes
    // only at landing — before that, the render attaches to its SOURCE key
    // (§5.2: the next key grows out of the current one).
    if (attempt.tool === 'hero' && attempt.sourceKeyId !== undefined && body.keys.some((entry) => entry.id === attempt.sourceKeyId)) {
      return { kind: 'key', id: attempt.sourceKeyId }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Task 13 — the editorial derivations (§9 editorial timing, §11.3 the export
// conventions): which landed clips can contribute to the assembled sequence
// (and through which lane), and what the ordered contribution list assembles
// to. Pure like the rest of this module; the EditorialPanel renders them,
// e2e/animation.spec.ts pins the rendered behavior.
// ---------------------------------------------------------------------------

/** The attempt facts the editorial derivations read — the recovery read's
 *  AttemptStateView satisfies this structurally (oldest-first, like every
 *  attempt list the store serves). */
export type EditorialAttemptSummary = {
  attemptId: string
  tool: AnimationTool
  targetId: string
  /** SEQUENCE rows: the frozen window's end key (the label's second half). */
  windowEndKeyId?: string
  /** The landed clip's frame count — null until the take has landed. */
  candidate: { frameCount: number } | null
}

/** One landed clip the picker offers: a TWEEN take rides its owning span
 *  (spanId names it, stepIndex is the 1-based slot position), a SEQUENCE
 *  window take is spanless (spanId null, §11.2). `contributionId` names the
 *  existing contribution when this clip is already in the list. Hero takes
 *  never appear — their product is a key drawing (§5.2), and the store
 *  refuses the lane; the picker never offers a doomed command. */
export type ContributableClip = {
  attemptId: string
  spanId: string | null
  stepIndex: number | null
  label: string
  detail: string
  frameCount: number
  contributionId: string | null
}

/** The landed, contributable clips of a document in attempt order (oldest
 *  first — the arrival order the review surfaces share). */
export function deriveContributableClips(body: AnimationDocumentBody, attempts: ReadonlyArray<EditorialAttemptSummary>): ContributableClip[] {
  const orderOf = (keyId: string): number | null => body.keys.find((entry) => entry.id === keyId)?.order ?? null
  const clips: ContributableClip[] = []
  for (const attempt of attempts) {
    if (attempt.candidate === null) continue
    if (attempt.tool === 'tween') {
      const span = body.spans.find((entry) => entry.stepSlots.some((slot) => slot.id === attempt.targetId))
      if (!span) continue // orphaned (its span left) — the store would refuse
      const stepIndex = span.stepSlots.findIndex((slot) => slot.id === attempt.targetId) + 1
      clips.push({
        attemptId: attempt.attemptId,
        spanId: span.id,
        stepIndex,
        label: `Tween step ${stepIndex} — key #${orderOf(span.fromKeyId) ?? '?'} → key #${orderOf(span.toKeyId) ?? '?'}`,
        detail: span.intent.movement,
        frameCount: attempt.candidate.frameCount,
        contributionId: body.editorial.find((entry) => entry.spanId === span.id && entry.attemptId === attempt.attemptId)?.id ?? null,
      })
      continue
    }
    if (attempt.tool === 'sequence') {
      clips.push({
        attemptId: attempt.attemptId,
        spanId: null,
        stepIndex: null,
        label: `Sequence window — key #${orderOf(attempt.targetId) ?? '?'} → key #${attempt.windowEndKeyId === undefined ? '?' : orderOf(attempt.windowEndKeyId) ?? '?'}`,
        detail: '',
        frameCount: attempt.candidate.frameCount,
        contributionId: body.editorial.find((entry) => entry.spanId === null && entry.attemptId === attempt.attemptId)?.id ?? null,
      })
    }
  }
  return clips
}

/** One contribution as the assembled sequence reads it: the portion
 *  ([inFrame, outFrame), start-inclusive/end-exclusive integer frames), the
 *  hold in OUTPUT frames (§11.3), and where the entry sits in the assembled
 *  whole. A degenerate range (outFrame ≤ inFrame) contributes no clip frames
 *  — a held drawing; the length/edge semantics ARE the shared assembly
 *  derivation (task 15a): the preview and the export gate read one verdict,
 *  and this derivation computes and NAMES, never clamps. */
export type AssembledContribution = {
  contributionId: string
  attemptId: string
  spanId: string | null
  label: string
  detail: string
  inFrame: number
  outFrame: number
  holdDuration: number
  clipFrames: number
  outputFrames: number
  outputStart: number
  /** The landed clip's frame count when resolvable (null names itself in
   *  `problem`). */
  frameCount: number | null
  problem: string | null
}

export type AssembledSequence = {
  fps: number
  totalFrames: number
  contributions: AssembledContribution[]
  /** Every named problem, in list order — empty when the assembly is clean. */
  problems: string[]
}

/** What the ordered editorial list assembles to (§9): the contributions in
 *  document order — the list order IS the assembled order — each with its
 *  computed output span, plus the whole sequence's frame total at the
 *  document's constant frame rate. Per entry, the SHARED assembly verdict
 *  (task 15a — the gate's own refusal classes and arithmetic, so the panel
 *  foreshadows exactly what the export refuses); the unlanded class keeps
 *  its softer preview copy (the shared verdict answers problem:null for
 *  it). The document-level verdicts (empty, odd dimensions, the ceiling)
 *  append to the problems list — §11.3's reject-don't-drop rule, previewed;
 *  the entry still renders, never silently skipped. */
export function deriveAssembledSequence(body: AnimationDocumentBody, attempts: ReadonlyArray<EditorialAttemptSummary>): AssembledSequence {
  const clipOf = new Map<string, ContributableClip>()
  for (const clip of deriveContributableClips(body, attempts)) clipOf.set(clip.attemptId, clip)

  const problems: string[] = []
  const contributions: AssembledContribution[] = []
  let outputStart = 0
  for (const entry of body.editorial) {
    const clip = clipOf.get(entry.attemptId) ?? null
    const label = clip?.label ?? `Unlanded clip (${entry.attemptId.slice(0, 8)})`
    const verdict = assemblyEntryVerdict(
      { contributionId: entry.id, inFrame: entry.inFrame, outFrame: entry.outFrame, holdDuration: entry.holdDuration, frameCount: clip?.frameCount ?? null },
      label,
    )
    const problem = verdict.problem ?? (clip === null
      ? `The clip for this contribution has not landed (attempt ${entry.attemptId}) — it contributes nothing until its take lands.`
      : null)
    if (problem !== null) problems.push(problem)
    contributions.push({
      contributionId: entry.id,
      attemptId: entry.attemptId,
      spanId: entry.spanId,
      label,
      detail: clip?.detail ?? '',
      inFrame: entry.inFrame,
      outFrame: entry.outFrame,
      holdDuration: entry.holdDuration,
      clipFrames: verdict.clipFrames,
      outputFrames: verdict.outputFrames,
      outputStart,
      frameCount: clip?.frameCount ?? null,
      problem,
    })
    outputStart += verdict.outputFrames
  }
  // The document-level verdicts append (task 15a): the empty list, odd
  // dimensions, the export ceiling — classes the gate refuses that the
  // preview used to render silently.
  problems.push(...assemblyDocumentProblems(body.settings, outputStart, body.editorial.length === 0))
  return { fps: body.settings.fps, totalFrames: outputStart, contributions, problems }
}

// ---------------------------------------------------------------------------
// The extension lane (spec 2026-10-08-animation-extension-lane-design.md,
// Task 6) — the chain surface (§4's window slots, the source-attempt-edge
// traversal, the derived mismatch, the assembled preview) and the Extend
// preview (§4's carry math + preflight verdicts + §6's two clocks). Pure
// like the rest of this module; the Timeline/ExtendPanel/WindowReview
// components render these, tests/animation-timeline-model.test.js pins
// them, e2e/animation.spec.ts pins the rendered behavior.
// ---------------------------------------------------------------------------

/** The extension-lane attempt facts these derivations read — the recovery
 *  read's AttemptStateView satisfies this structurally (oldest-first). */
export type ExtensionAttemptFacts = {
  attemptId: string
  targetId: string
  execution: AttemptExecutionState
  /** The frozen binding's source (extension rows only) — the edge truth the
   *  mismatch walk resolves through. */
  extension?: {
    sourceAttemptId: string
    targetLength: number
    movement: string
    preservation: string
    overrides: { medium: string; scene?: string; camera?: { description: string; reason: string } }
    anchors: Array<{ reference: 'rolling-near' | 'fixed-far'; frame: number }>
  }
  continuation: AttemptContinuationView
  modelIdentitiesStamped?: boolean
  referenceAssetIds?: string[]
  candidate: { frameCount: number } | null
}

/** The shared `sourceOf` over the attempt list: an extension row resolves to
 *  ITS binding's frozen source; a plain take (or a row the older build froze
 *  without the view's extension block) resolves to null — chainMismatch
 *  treats that as consistent (the derivation is best-effort at the client;
 *  the server's own walk refuses loudly where it matters). */
function extensionSourceOf(attempts: ReadonlyArray<ExtensionAttemptFacts>): (attemptId: string) => string | null {
  return (attemptId) => attempts.find((entry) => entry.attemptId === attemptId)?.extension?.sourceAttemptId ?? null
}

/** One window as the chain surface renders it. */
export type ChainWindowView = {
  slot: WindowSlot
  /** The slot's landed take rows in landing order — `landed` false while a
   *  take renders (the strip shows the in-flight count honestly). */
  takes: Array<{ attemptId: string; landed: boolean; deliveredFrames: number | null }>
  /** The slot's SELECTED take's row facts (null until the explicit
   *  selection). */
  selected: ExtensionAttemptFacts | null
  /** True when a LANDED take awaits the slot's first selection — the
   *  window's own review-decision marker. */
  reviewPending: boolean
}

/** One chain as the surface renders it: the root, the ordered windows, the
 *  DERIVED mismatch (§4 — surfaced, never silently assembled past), and the
 *  assembled preview ALONG THE SELECTED PATH when the walk is consistent. */
export type ChainView = {
  chain: ExtensionChain
  /** The root attempt's row facts (null when the row left the document —
   *  named by `rootProblem`). */
  root: ExtensionAttemptFacts | null
  rootProblem: string | null
  windows: ChainWindowView[]
  mismatch: ChainMismatch | null
  /** The assembled preview (§4): delivered frames along the ONE selected
   *  path — null while the mismatch stands (the banner replaces it; never a
   *  silent assembly from unrelated ancestry). */
  assembled: { windows: number; deliveredFrames: number } | null
}

export type ChainSurface = { chains: ChainView[] }

/** §4's chain surface: every chain in body order, each window in `order`
 *  sequence with its takes strip facts and its own selection truth, the
 *  derived mismatch through the shared walk (source-attempt edges — each
 *  window's selected take's frozen source, never slot lists alone), and the
 *  assembled preview that honors exactly one selected path. */
export function deriveChainSurface(body: AnimationDocumentBody, attempts: ReadonlyArray<ExtensionAttemptFacts>): ChainSurface {
  const rowOf = (attemptId: string): ExtensionAttemptFacts | null => attempts.find((entry) => entry.attemptId === attemptId) ?? null
  const sourceOf = extensionSourceOf(attempts)
  const chains: ChainView[] = []
  // `chains` reads as [] on bodies the older build wrote (the parse
  // contract) — tolerate its absence the same way rather than crashing.
  for (const chain of body.chains ?? []) {
    const root = rowOf(chain.rootAttemptId)
    const windows: ChainWindowView[] = [...chain.windows]
      .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id < b.id ? -1 : 1))
      .map((slot) => {
        const takes = slot.attempts.map((attemptId) => {
          const row = rowOf(attemptId)
          return {
            attemptId,
            landed: row !== null && row.execution === 'ready' && row.candidate !== null,
            deliveredFrames: row !== null && row.execution === 'ready' && row.candidate !== null ? row.candidate.frameCount : null,
          }
        })
        return {
          slot,
          takes,
          selected: slot.selectedCandidateId === null ? null : rowOf(slot.selectedCandidateId),
          reviewPending: slot.selectedCandidateId === null && takes.some((take) => take.landed),
        }
      })
    chains.push({
      chain,
      root,
      rootProblem: root === null ? `The chain's root take (${chain.rootAttemptId}) is not among this document's attempts.` : null,
      windows,
      mismatch: chainMismatch(chain, sourceOf),
      assembled: null,
    })
  }
  // The assembled preview per chain (only when the walk is consistent): the
  // selected path's delivered frames — root clip + every window's SELECTED
  // take, the exact path the next extension conditions on.
  for (const view of chains) {
    if (view.mismatch !== null || view.root === null || view.root.candidate === null) continue
    let deliveredFrames = view.root.candidate.frameCount
    let selectedWindows = 0
    for (const window of view.windows) {
      if (window.slot.selectedCandidateId === null) continue
      if (window.selected === null || window.selected.candidate === null) {
        deliveredFrames = 0
        selectedWindows = -1
        break
      }
      deliveredFrames += window.selected.candidate.frameCount
      selectedWindows += 1
    }
    if (selectedWindows >= 0) view.assembled = { windows: selectedWindows, deliveredFrames }
  }
  return { chains }
}

/** One named preflight verdict (§4 — "each a named pass or refusal with its
 *  reason"). Advisory verdicts (the identity-discontinuity hint, Task 5's
 *  ruling b) are NOT failures: `advisory` carries the named hint while
 *  `pass` stays true. */
export type ExtendVerdict = { name: string; pass: boolean; detail: string; advisory?: boolean }

/** The identity references the extension compiles against (the ROOT SPAN's
 *  selected keys — the route's own resolution, mirrored): null when they do
 *  not resolve, with the named problem in `referencesProblem`. */
export type ExtendIdentityReferences = {
  near: { assetId: string; poseDescription: string | null; facing: FacingTerm | null }
  far: { assetId: string; poseDescription: string | null; facing: FacingTerm | null }
} | null

/** §4's Extend preview: the carry math in BOTH clocks, the pinned tail's
 *  frame range in source coordinates (generated + delivered via the ONE
 *  mapping), the preflight verdicts, and the identity-discontinuity
 *  advisory. Everything the panel shows before submission; the server
 *  re-derives authoritatively and its refusals carry the same names. */
export type ExtendPreview = {
  source: ExtensionAttemptFacts | null
  sourceProblem: string | null
  /** The source's frozen GENERATED length — the pinned-tail math's base. */
  sourceLength: number | null
  plan: ContinuationWindowPlan | null
  /** The recipe's named refusal when the plan does not compute (the same
   *  message the route answers with). */
  recipeProblem: string | null
  /** The pinned tail in BOTH coordinate systems: the raw latent's world
   *  (generated) and the user's (delivered, through the ONE mapping —
   *  `continuationGeneratedFrame`). Null delivered when the source's own
   *  trim cannot be resolved (the take has not landed). */
  pinnedTail: { generated: { start: number; end: number }; delivered: { start: number; end: number } | null } | null
  /** The two clocks (§4): the generated window's full length and the
   *  delivered count after the pinned head is trimmed. */
  clocks: { generated: number; delivered: number } | null
  verdicts: ExtendVerdict[]
  references: ExtendIdentityReferences
  referencesProblem: string | null
  /** True when every non-advisory verdict passes and the references resolve
   *  — the panel's submit gate (the text inputs gate themselves). */
  ready: boolean
}

/** The root-span walk (the route's own `rootTakeOf`, mirrored): the source's
 *  binding edges back to the PLAIN take the chain roots on. */
function extensionRootAttempt(attempts: ReadonlyArray<ExtensionAttemptFacts>, sourceAttemptId: string): ExtensionAttemptFacts | null {
  const seen = new Set<string>()
  let current = sourceAttemptId
  for (;;) {
    if (seen.has(current)) return null // a corrupt cycle degrades to "no root"
    seen.add(current)
    const row = attempts.find((entry) => entry.attemptId === current) ?? null
    if (row === null) return null
    const next = row.extension?.sourceAttemptId
    if (next === undefined) return row
    current = next
  }
}

export function deriveExtendPreview(
  body: AnimationDocumentBody,
  attempts: ReadonlyArray<ExtensionAttemptFacts>,
  sourceAttemptId: string,
  targetLength: number,
  anchors: ReadonlyArray<{ reference: 'rolling-near' | 'fixed-far'; frame: number }>,
): ExtendPreview {
  const source = attempts.find((entry) => entry.attemptId === sourceAttemptId) ?? null
  const verdicts: ExtendVerdict[] = []
  const none: ExtendPreview = {
    source, sourceProblem: source === null ? 'That take is no longer among this document\'s attempts — reload picked up a change.' : null,
    sourceLength: null, plan: null, recipeProblem: null, pinnedTail: null, clocks: null, verdicts, references: null, referencesProblem: null, ready: false,
  }
  if (source === null) return { ...none, verdicts: [{ name: 'Source take', pass: false, detail: none.sourceProblem! }] }

  // ---- the carry availability verdict (§7/§8) ----------------------------
  const continuation = source.continuation.state
  if (continuation === 'ready') {
    verdicts.push({ name: 'Carry', pass: true, detail: 'The registered carry resolves by digest — the pinned tail is available.' })
  } else if (continuation === 'absent') {
    verdicts.push({ name: 'Carry', pass: false, detail: 'This take carried no tail (a plain render) — only renders submitted with the carry flag hold one to extend.' })
  } else if (continuation === 'registering') {
    verdicts.push({ name: 'Carry', pass: false, detail: `The carried tail is still registering${source.continuation.error !== undefined ? ` (last error: ${source.continuation.error})` : ''} — the Extend action opens once registration lands.` })
  } else if (continuation === 'not-produced') {
    verdicts.push({ name: 'Carry', pass: false, detail: 'This take\'s in-graph save never completed (not produced) — it can never seed an extension; a new take of the step is the path.' })
  } else {
    verdicts.push({ name: 'Carry', pass: false, detail: 'The registered carry no longer resolves (continuation unavailable) — re-land the source chain; the clip itself stays playable.' })
  }

  // ---- the identity-evidence verdict (Task 3's named condition) ----------
  if (continuation === 'ready' && source.modelIdentitiesStamped !== true) {
    verdicts.push({
      name: 'Identity evidence',
      pass: false,
      detail: 'Continuation identity evidence is missing — this take rendered without resolved model digests, so it can never seed a continuation binding (never a name-only pass). Re-land the source on the current weights and extend that take.',
    })
  } else if (continuation === 'ready') {
    verdicts.push({ name: 'Identity evidence', pass: true, detail: 'The frozen model identities are present — the submission re-verifies them against the engine\'s current weights before spending anything.' })
  }

  // ---- the root span's references (the route's resolution, mirrored) -----
  const root = extensionRootAttempt(attempts, sourceAttemptId)
  const rootSpan = root === null ? null : body.spans.find((span) => span.stepSlots.some((slot) => slot.id === root.targetId)) ?? null
  const selectedOf = (keyId: string): KeyCandidate | null => {
    const slot = body.keys.find((entry) => entry.id === keyId) ?? null
    if (slot === null || slot.selectedCandidateId === null) return null
    return slot.candidates.find((entry) => entry.id === slot.selectedCandidateId) ?? null
  }
  let references: ExtendIdentityReferences = null
  let referencesProblem: string | null = null
  if (rootSpan === null) {
    referencesProblem = root === null
      ? 'The chain\'s root take cannot be resolved from this document — the window\'s identity references do not resolve.'
      : `The chain's root take targets a step slot no span owns — the window's identity references cannot be resolved.`
  } else {
    const near = selectedOf(rootSpan.fromKeyId)
    const far = selectedOf(rootSpan.toKeyId)
    if (near === null || far === null) {
      referencesProblem = 'The chain\'s root span has a key with no selected image — the caption needs both poses.'
    } else {
      references = {
        near: { assetId: near.assetReference.assetId, poseDescription: near.poseDescription, facing: near.facing },
        far: { assetId: far.assetReference.assetId, poseDescription: far.poseDescription, facing: far.facing },
      }
    }
  }

  // ---- the overlap-recipe math (§6 — the shared plan, both clocks) -------
  const sourceLength = source.extension?.targetLength
    ?? (source.candidate !== null && source.execution === 'ready' ? source.candidate.frameCount : null)
  let plan: ContinuationWindowPlan | null = null
  let recipeProblem: string | null = null
  if (sourceLength === null) {
    recipeProblem = 'The source take holds no readable window length (it has not landed) — the pinned tail\'s coordinates cannot be computed.'
  } else {
    try {
      plan = continuationWindowPlan({ sourceLength, targetLength, contextLength: CONTINUATION_OVERLAP_RECIPE.contextLength })
    } catch (failure) {
      recipeProblem = failure instanceof Error ? failure.message : String(failure)
    }
  }
  if (plan !== null) {
    verdicts.push({
      name: 'Overlap recipe',
      pass: true,
      detail: `A ${targetLength}-frame window pins the source's last ${plan.headTrim} frames: ${targetLength} generated, ${plan.deliveredRange.end} delivered after the pinned head is trimmed.`,
    })
  } else {
    verdicts.push({ name: 'Overlap recipe', pass: false, detail: recipeProblem ?? 'The window does not satisfy the overlap recipe.' })
  }

  // ---- the collision verdict (§10 — the anchors vs the pinned head) ------
  const malformedAnchor = anchors.find((anchor) => !Number.isInteger(anchor.frame) || anchor.frame < 0)
  if (malformedAnchor !== undefined) {
    verdicts.push({ name: 'Anchors', pass: false, detail: `The ${malformedAnchor.reference} anchor's frame must be a non-negative whole number of the sampled window's frames.` })
  } else if (anchors.length === 0) {
    verdicts.push({ name: 'Anchors', pass: true, detail: 'No reference anchors — nothing can fall inside the pinned head.' })
  } else if (plan !== null) {
    const collision = anchors.find((anchor) => anchor.frame < plan!.headTrim)
    if (collision !== undefined) {
      verdicts.push({ name: 'Anchors', pass: false, detail: `The ${collision.reference} anchor at sampled frame ${collision.frame} falls inside the pinned head (frames 0-${plan.headTrim - 1}) — the conditioning node would silently drop it there; the lane refuses instead, naming the anchor. Move it past the pinned head or drop it.` })
    } else {
      const outside = anchors.find((anchor) => anchor.frame >= targetLength)
      verdicts.push(outside !== undefined
        ? { name: 'Anchors', pass: false, detail: `The ${outside.reference} anchor at frame ${outside.frame} is outside the sampled window (0-${targetLength - 1}).` }
        : { name: 'Anchors', pass: true, detail: 'Every anchor sits past the pinned head — the conditioning keeps them all.' })
    }
  }

  // ---- the identity-discontinuity advisory (Task 5's ruling b) -----------
  if (references !== null && rootSpan !== null && source.referenceAssetIds !== undefined && source.referenceAssetIds.length >= 2) {
    const [frozenNear, frozenFar] = source.referenceAssetIds
    if (frozenNear !== references.near.assetId || frozenFar !== references.far.assetId) {
      verdicts.push({
        name: 'Identity continuity',
        pass: true,
        advisory: true,
        detail: 'The chain\'s keys changed since this take rendered — the extension will condition on the CURRENT selected key images, which differ from the ones this take was generated under (identity may shift at the join). The frozen binding stays truthful either way.',
      })
    }
  }

  const pinnedTail = plan === null || sourceLength === null ? null : (() => {
    const { generatedStart, generatedEnd } = plan!.windowCoordinates
    // The delivered-tail display derives through the ONE mapping's inverse
    // (continuationGeneratedFrame defines d + trim = g, so d = g − trim): a
    // plain root delivers its whole window (trim 0); an extension source's
    // trim is its frozen generated length minus its landed delivered count.
    const trim = source.extension !== undefined && source.candidate !== null && source.execution === 'ready'
      ? source.extension.targetLength - source.candidate.frameCount
      : 0
    const delivered = trim > 0
      ? { start: generatedStart - trim, end: generatedEnd - trim }
      : { start: generatedStart, end: generatedEnd }
    return { generated: { start: generatedStart, end: generatedEnd }, delivered }
  })()

  const ready = verdicts.every((verdict) => verdict.pass) && references !== null && plan !== null
  return {
    source,
    sourceProblem: null,
    sourceLength,
    plan,
    recipeProblem,
    pinnedTail,
    clocks: plan === null ? null : { generated: targetLength, delivered: plan.deliveredRange.end },
    verdicts,
    references,
    referencesProblem,
    ready,
  }
}
