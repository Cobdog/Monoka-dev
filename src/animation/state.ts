/**
 * The animation module's state adapter (task 7, k2q0n9s — plan P07): the
 * zustand document store + the `useAnimationDocument` hook. The ONLY module
 * in `src/animation/` that calls `animationApi`, `subscribeAnimationEvents`,
 * or any other API surface — components take props; this adapter owns
 * connections (the shell and the binding panel stay presentational).
 *
 * What it absorbs from the task-6 shell (wholesale, same contracts):
 *   - the DURABLE recovery read (§7.2.1) — `open` re-reads through the typed
 *     client, never callback-chained; a missing id lands the recoverable
 *     selection state, a failed read the named error state;
 *   - the fabric subscription — attempt-state envelopes drive the seeded
 *     attribute; document-changed / attempt-ready / resync re-run the read;
 *     a failed silent refresh keeps the last good document and names it;
 *   - the OPEN RACE GUARD (task 6 review Minor-2): every async action holds
 *     an open ticket and drops its result when a newer `open` started — a
 *     slow read for a previous document can never clobber the live one.
 *
 * What task 7 adds: the COMMAND surface. Every command carries the current
 * revision (the store reads it at call time — always the freshest known); a
 * 409 sets `conflict` and re-reads (the rebase surface — the UI shows a
 * reload notice, NEVER a silent lost update); other failures land in
 * `commandError` for the calling surface to name.
 *
 * What task 8 adds: the TIMELINE's commands — `seedInitialKey` (the bound
 * initial key materializes the first key slot through add-candidate + the
 * explicit selection, only on an empty timeline, never a silent no-op),
 * `toggleKeyLock` (the lock chip's server-enforced toggle), and
 * `createEmptyDocument` (the selection state's creation arm, task 7's
 * Minor-2). The shared failure arm is extracted as `failCommand` — one
 * idiom, three-plus commands.
 *
 * What task 9 adds: the SPAN INSPECTOR's surface — `deriveTweenPreview`
 * (the LIVE PREVIEW SELECTOR: the server's tween draft resolution mirrored
 * client-side, so the inspector's "View caption" compiles exactly what
 * submission freezes — the ACTUAL current rolling reference, §6.4) plus the
 * commands `updateSpanIntent` (the debounced durable draft), `setKeyFacing`
 * (§5.1: facing follows the candidate — a corrected facing is a cloned
 * alternative + the explicit selection, the seed command's two-command
 * idiom; no update-candidate route exists), and `submitTweenStep` (flushes
 * the intent, resolves the target step slot from the live document, submits
 * the tween draft with a fresh idempotency key per deliberate click).
 *
 * What task 10 adds: the REVIEW surface — `subscribeAnimationEvents` now
 * drives the §7.3 status vocabulary LIVE (an attempt-state envelope patches
 * the view's own attempt row in place — execution + progress — instead of
 * waiting for the next full read; an envelope naming an attempt the view has
 * never seen triggers the durable re-read, never a synthesized partial row),
 * `submitTweenStep` refreshes on success so the new attempt row reaches the
 * view, and the commands the review panel wires: `selectReferenceFrame`
 * (§7.2.1 command 2 — non-proposed frames ride on-demand extraction first,
 * §7.2.2's path 2), `continueChain` (the §7.1 continuation: appends the next
 * step slot — the F1 command — then submits the next step against it),
 * `rerollStep` (a fresh take for the SAME step — an alternative, never a
 * replacement), and `retryPreparation` (F3's recovery action; the outcome
 * rides the next read — preparation detail events stay server-internal by
 * design, so the command's own durable read IS the recovery surface).
 *
 * What task 11 adds: the HERO surface — `deriveHeroPreview` (the live
 * preview selector for the hero caption: ONE reference, the current key's
 * selected image — the submit route's hero resolution mirrored), plus the
 * commands `submitHero` (§5.2: targets a FRESH PROPOSED key slot, never the
 * source — hero generates the NEXT key), `acceptHeroFrame` (the explicit
 * frame selection: on-demand extraction, then the accepted image becomes a
 * NEW candidate of the proposed slot + the explicit selection,
 * lock-guarded), `rerollHero` (a fresh take for the SAME proposed slot,
 * resubmitting the frozen source key + arc), and `openSpanIntoKey` (the
 * accepted key becomes the incoming tween span's far reference — the span
 * creation seeded from the hero arc).
 *
 * What task 12 adds: the SEQUENCE surface — `deriveSequencePreview` (the
 * live preview selector for the window's two endpoint references — the
 * submit route's sequence resolution mirrored; the window END is an
 * authoring choice, so the resolver takes it as an argument and the panel
 * calls it with its own picked end) plus the commands `submitSequence`
 * (§5.2/§11.2: the attempt targets the SELECTED KEY WINDOW — targetId is
 * the window's start key, the draft names the end key, the ordered beats,
 * and the preservation) and `rerollSequence` (a fresh take for the SAME
 * window, resubmitting the frozen window draft — a sequence draft owns no
 * span, so the frozen attempt is its only durable home).
 *
 * What task 13 adds: the EDITORIAL surface (§9) — `contributeClip` (the
 * §7.2.1 third selection: a landed clip's portion [inFrame, outFrame) plus
 * its hold in output frames; tween clips ride their span, sequence windows
 * ride the spanless lane), `reorderContributions` (the ordered list IS the
 * assembled sequence's order), and `removeContribution` — plus two carried
 * fixes: the debounced intent persist now PARKS behind a busy store instead
 * of dropping (task 9's Minor-2), and `rerollSequence` gains the
 * one-render-per-window guard `submitSequence` already had (task 12's
 * Minor-1).
 *
 * What task 14 adds: the EXPORT surface (§11.3) — `exportSequence`
 * (assembles and downloads the review ZIP: sequence.mp4 + manifest.json).
 * It owns its own phase, deliberately not `busy`: the server FREEZES the
 * document truth before assembly, so authoring during an export is safe by
 * design. A stale-but-usable sequence answers with the acknowledgment
 * prompt (`exportStale` — each stale selection named); retrying with the
 * acknowledgment exports and records the staleness in the manifest.
 *
 * What wave 2a adds (the live review's #4, §6.4's ruling): the promoted
 * frame's pose/facing — `deriveTweenPreview` reads the selection pointer's
 * ANNOTATION where it hardcoded nulls (the server's tween resolution
 * mirrored exactly), and `annotateRollingReference` lands the authoring
 * edit: a partial patch merged over the live pointer, parked behind a busy
 * store, so the inspector's debounced pose settle and the facing chips both
 * serialize instead of clobbering each other.
 *
 * What wave 2b adds (Fix 1, §5.3/§7.2.1): the key-candidates strip's
 * commands — `importKeyCandidate` (the bound key's "Import candidate…":
 * an ingested image lands as an ALTERNATIVE candidate of an existing or
 * fresh key, never touching the selection — the add half of the two-command
 * idiom) and `selectKeyCandidate` (the explicit choice, lock-guarded
 * client-side, a genuine no-op on the already-selected candidate).
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import { animationApi, animationHref, AnimationConflict, AnimationHttpError, type AnimationDocumentView, type AnimationExportStalePrompt } from './client'
import { subscribeAnimationEvents } from './fabric'
import { documentsApi } from '../canvas/api'
import { ANIMATION_MEDIA, type AssetReference, type AttemptContinuationView, type AttemptExecutionState, type BindingInput, type FacingTerm, type KeyCandidate, type MediumString, type Span } from '../../shared/animation/types'
import type { PoseRef, SessionOverrideInput } from '../../shared/animation/compiler'

/** The states whose engine-side truth is not settled — the seeded attribute
 *  prefers the newest of these over an older terminal one, so a reopening
 *  editor sees live work first (§7.3's during-the-wait surface). */
const IN_FLIGHT: ReadonlySet<AttemptExecutionState> = new Set(['queued', 'rendering', 'preparing', 'reconciling'])

/** The seeded attempt state from the recovery read: the newest in-flight
 *  attempt, else the newest attempt's terminal state, else null. */
function seedAttemptState(attempts: AnimationDocumentView['attempts']): AttemptExecutionState | null {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (IN_FLIGHT.has(attempts[index].execution)) return attempts[index].execution
  }
  return attempts.length > 0 ? attempts[attempts.length - 1].execution : null
}

/** The continuation ledger (Task 6 review I-1, closed by the lane's Task 7):
 *  the NEWEST continuation envelope per attempt. Registration settlement is
 *  ONE-SHOT — the envelope is the only thing that ever emits it — so a
 *  document read whose server side predates the registration write (the
 *  attempt-ready refresh racing the settlement; its response landing after
 *  the patch) must never be allowed to revert a row the client already saw:
 *  the gate would wait on an already-landed registration until some
 *  unrelated refresh healed it. Every document set reconciles against this
 *  ledger (the store subscription below is the one interception point —
 *  every landing site routes through it). */
const continuationLedger = new Map<string, AttemptContinuationView>()

const sameContinuation = (a: AttemptContinuationView, b: AttemptContinuationView): boolean =>
  a.state === b.state
  && a.error === b.error
  && a.artifact?.digest === b.artifact?.digest

/** True when the FETCHED retryable state is fresher than the ledger's
 *  envelope — the M-7 staleness tiebreaker. The stamp is the settlement
 *  generation (the attempt row's own_revision at the write): every
 *  continuation write bumps it, so a fetched stamp strictly greater than the
 *  ledger's means a settlement happened AFTER the envelope this client
 *  handled — fetched truth wins, and the lost-envelope corner (an old E1
 *  overlaying fetched E2 indefinitely, no envelope left in flight to heal
 *  it) self-heals on this very resync. Ordering is only decidable when BOTH
 *  sides carry stamps; anything else keeps the pre-M-7 overlay precedence
 *  (the I-1 race guard stands unchanged for legacy shapes). */
const fetchedRetryableIsNewer = (fetched: AttemptContinuationView, seen: AttemptContinuationView): boolean =>
  typeof fetched.stamp === 'number' && typeof seen.stamp === 'number' && fetched.stamp > seen.stamp

/** Re-applies the ledger over a freshly landed document view. Three safety
 *  properties make the re-apply honest, not just optimistic:
 *  - a landed row already at `unavailable` is NEVER overwritten — that state
 *    is derived server-side at checks and emits no envelope, so a ledger
 *    entry can never legitimately move it backward;
 *  - a landed row already TERMINAL for registration (`ready` /
 *    `not-produced`) is never overwritten either — settlement is one-shot
 *    and never regresses, so fetched terminal truth is never stale (Task 7
 *    review I-1R: the corner a LOST settling envelope opens — the ledger's
 *    retryable `registering`+error entry would otherwise re-revert the
 *    settled row on every resync refresh, with no envelope left in flight
 *    to heal it). The ledger is SUPERSEDED with the settled truth so later
 *    reconciles no-op;
 *  - inside the RETRYABLE window the stamps order the two truths (M-7): a
 *    fetched retryable state whose settlement generation is NEWER than the
 *    ledger's envelope wins and supersedes the ledger — the corner a LOST
 *    RETRYABLE envelope opens (the server retried registration past what
 *    this client observed; that envelope never arrived) would otherwise
 *    overlay the fetched newer truth backward forever, with no envelope
 *    left in flight to heal it. The older-or-unknowable fetched row is
 *    still overlaid (the I-1 race: a read that predates the envelope's
 *    write), and any brief revert of a newer landed truth stays
 *    self-healing by construction — the envelope carrying that truth either
 *    already updated the ledger or is still in flight and patches the row
 *    when it arrives. Returns the SAME object when nothing applies (no
 *    re-render, no loop). Exported for the unit family's M-7 pin (the
 *    E1-shown/E2-truth/lost-envelope reproduction) — pure over its two
 *    arguments. */
export function reconcileContinuations(document: AnimationDocumentView, ledger: Map<string, AttemptContinuationView> = continuationLedger): AnimationDocumentView {
  let changed = false
  const attempts = document.attempts.map((entry) => {
    const seen = ledger.get(entry.attemptId)
    if (seen === undefined || sameContinuation(seen, entry.continuation)) return entry
    // Fetched states that can never be stale (registration is one-shot):
    // the settled pair and the derived miss stand over any ledger entry.
    if (entry.continuation.state === 'ready' || entry.continuation.state === 'not-produced') {
      ledger.set(entry.attemptId, entry.continuation)
      return entry
    }
    if (entry.continuation.state === 'unavailable') return entry
    // M-7: the retryable window is stamp-ordered — a fetched retryable row
    // NEWER than the ledger's envelope is the truth (the lost-envelope
    // corner heals here); it supersedes the ledger so later reconciles
    // no-op.
    if (fetchedRetryableIsNewer(entry.continuation, seen)) {
      ledger.set(entry.attemptId, entry.continuation)
      return entry
    }
    changed = true
    return { ...entry, continuation: seen }
  })
  return changed ? { ...document, attempts } : document
}

/** One prepared character from the global asset store (§4.1's "existing
 *  project assets"): the curated reference set is the prepared image pool,
 *  `description` is the locked character description retained verbatim.
 *  `assetId` is the blob relPath — the stable, content-addressed handle the
 *  binding's reference ids and the preview URL both resolve through. */
export type AnimationAssetPick = {
  id: string
  name: string
  description: string
  images: Array<{ assetId: string; relPath: string }>
}

/** One imported image (the file half of the picker): the ingested blob's
 *  relPath as the stable handle. */
export type AnimationImportedImage = { assetId: string; relPath: string }

/** The selection state's document list: null = never fetched (no project
 *  named), 'failed' = the listing itself failed (named, never silent). */
export type AnimationDocumentList = Array<{ id: string; name: string; updatedAt: number }> | 'failed' | null

/** The rebase surface: what a 409 carries — the server's message and its
 *  current revision, shown as a reload notice until the next command lands. */
export type AnimationConflictNotice = { message: string; currentRevision: number }

type AnimationSessionState = {
  phase: 'loading' | 'missing' | 'error' | 'ready'
  errorDetail: string
  document: AnimationDocumentView | null
  attemptState: AttemptExecutionState | null
  refreshFailed: boolean
  conflict: AnimationConflictNotice | null
  busy: boolean
  commandError: string | null
  /** Task 14 — the export surface's own phase (never `busy`: the frozen
   *  snapshot makes concurrent authoring safe by design, §11.3). */
  exportPhase: 'idle' | 'running' | 'done'
  exportError: string | null
  /** The stale acknowledgment prompt (§11.3): the export's 428 answer — the
   *  stale-but-usable selections, each named; cleared by the next attempt. */
  exportStale: AnimationExportStalePrompt[] | null
  lastExportName: string | null
  projectDocuments: AnimationDocumentList
  assets: AnimationAssetPick[]
  assetsFailed: boolean
  open(documentId: string, projectId: string): Promise<void>
  /** The silent re-read (fabric-driven): keeps the last good document on
   *  failure and names it through `refreshFailed`. */
  refresh(): Promise<void>
  updateBinding(binding: BindingInput): Promise<boolean>
  importImages(files: File[]): Promise<AnimationImportedImage[]>
  /** Wave 2b (Fix 1) — the bound key's "Import candidate…" action: ingests
   *  an image into a KEY SLOT as an ALTERNATIVE (§5.3's add half — it never
   *  selects; choosing the candidate is the explicit selectKeyCandidate
   *  command). The destination keyId is resolved by the CALLER — one import
   *  action mints one id for its whole batch (the 2b review's I-1: N files
   *  "as a new key" land as N candidates of ONE key, never N singleton
   *  keys); the store materializes unknown ids (order max+1, selection
   *  null). `origin` names where the image came from; the provenance
   *  carries the asset id. */
  importKeyCandidate(destination: { keyId: string }, image: AnimationImportedImage, origin: 'import' | 'project-asset'): Promise<boolean>
  /** Wave 2b (Fix 1) — the explicit candidate choice (§7.2.1's select
   *  command through the key-candidates strip). Lock-guarded client-side
   *  (the server enforces it regardless); re-selecting the already-selected
   *  candidate is a genuine no-op (true, no write). */
  selectKeyCandidate(keyId: string, candidateId: string): Promise<boolean>
  /** Task 8 — the timeline's commands. */
  /** Materializes the initial key slot from the active binding's
   *  initialKeyAssetId (add-candidate, then the explicit selection — two
   *  revision-gated commands; the binding alone creates no slot). Only an
   *  EMPTY timeline seeds; anything else is a named refusal, never a silent
   *  no-op. */
  seedInitialKey(): Promise<boolean>
  /** The lock chip's toggle — the server owns the enforcement (§7.2.1). */
  toggleKeyLock(keyId: string, locked: boolean): Promise<boolean>
  /** Task 9 — the span inspector's commands. */
  /** The durable span intent (the debounced draft persist — §7.4's "edit
   *  future motion drafts"). */
  updateSpanIntent(spanId: string, intent: { movement: string; preservation: string }): Promise<boolean>
  /** A corrected facing for a key's selected image (§5.1: facing follows the
   *  candidate — the clone-and-select authoring path, lock-guarded). */
  setKeyFacing(keyId: string, facing: FacingTerm | null): Promise<boolean>
  /** Submits one tween step: SERIALIZES behind any command in flight (the
   *  intent persist's park doctrine — review I-1: never a silent
   *  busy-refusal of the primary action), flushes the intent, resolves the
   *  target step slot from the live document (the named slot when
   *  `targetStepSlotId` is given, else the span's last), submits the draft
   *  (a fresh idempotency key per deliberate click). Null = the failure
   *  surface already names it (or the session moved on — the open-race
   *  ticket guard). */
  submitTweenStep(spanId: string, draft: { movement: string; preservation: string; overrides: SessionOverrideInput; carry?: boolean }, targetStepSlotId?: string): Promise<{ attemptId: string } | null>
  /** Task 10 — the review panel's commands. */
  /** The EXPLICIT reference-frame selection (§7.2.1 command 2). A frame
   *  other than the prepared proposal rides §7.2.2's on-demand extraction
   *  first; an extraction failure names itself and stops — the selection is
   *  never written against a frame that could not be resolved. */
  selectReferenceFrame(spanId: string, attemptId: string, frameIndex: number): Promise<boolean>
  /** Wave 2a (§6.4's inspectable-and-correctable ruling): the image-bound
   *  annotation for a step slot's SELECTED rolling reference. A PARTIAL
   *  patch — the unspecified field keeps the live pointer's truth, so a
   *  facing flip never clobbers a settling pose draft and vice versa. The
   *  settled pose persist PARKS behind a busy store (the intent draft's
   *  Minor-2 doctrine): parked persists serialize instead of dropping. */
  annotateRollingReference(spanId: string, stepSlotId: string, patch: { poseDescription?: string | null; facing?: FacingTerm | null }): Promise<boolean>
  /** The §7.1 continuation — ONE step, always a user action: submits the
   *  next step from the span's durable intent, into the span's trailing
   *  EMPTY slot when one stands (a continuation whose submission was
   *  refused or interrupted left exactly that), else appending the next
   *  step slot (the F1 command) first. The gate is the CHAIN's current
   *  rolling reference — the nearest promoted selection at or before the
   *  target, the server's own backward walk — never the last slot's own
   *  selection (task 10's Important-1: the panel reviews the frontier
   *  step; an empty trailing slot must not strand that review). */
  continueChain(spanId: string): Promise<{ attemptId: string } | null>
  /** The re-roll — a fresh take for the step slot UNDER REVIEW (a new
   *  idempotency key: a deliberate roll, never §7.2.2's retry key). Lands
   *  as an alternative beside the previous takes; the selection never
   *  moves (§8.2). Without `stepSlotId` the span's last slot is the
   *  target (the inspector's arm). */
  rerollStep(spanId: string, stepSlotId?: string): Promise<{ attemptId: string } | null>
  /** F3's recovery action: re-prepares the proposed frame of a LANDED clip
   *  without re-rendering. The outcome rides the command's own durable
   *  read (preparation detail events stay server-internal). */
  retryPreparation(attemptId: string): Promise<boolean>
  /** Task 11 — the hero tool's commands. */
  /** §5.2's hero generation: describes the movement FROM the named current
   *  key and targets a FRESH PROPOSED key slot (minted here) — the hero
   *  generates the NEXT key, never a re-roll of the source. Null = the
   *  failure surface already names it. */
  submitHero(keyId: string, draft: { movementArc: string; overrides: SessionOverrideInput }): Promise<{ attemptId: string; keyId: string } | null>
  /** The explicit frame acceptance (§5.2/§7.2.1): on-demand extraction,
   *  then the accepted image becomes a NEW candidate of the hero's proposed
   *  key slot and the EXPLICIT selection follows — the slot's selection is
   *  the user's act, lock-guarded (§7.2.1). */
  acceptHeroFrame(keyId: string, attemptId: string, frameIndex: number): Promise<boolean>
  /** A fresh hero take for the SAME proposed slot (a new idempotency key),
   *  resubmitting the newest take's frozen source key + arc — an
   *  alternative that never replaces the selection (§8.2). */
  rerollHero(keyId: string): Promise<{ attemptId: string } | null>
  /** The accepted hero key becomes the incoming tween span's fixed far
   *  reference (§5.2): creates the span source→key (idempotent — an
   *  existing span between the pair is the answer) seeded with the hero
   *  arc as the movement draft. Returns the span id for the shell to
   *  select. */
  openSpanIntoKey(fromKeyId: string, toKeyId: string, seedMovement: string): Promise<string | null>
  /** Task 12 — the sequence tool's commands. */
  /** §5.2/§11.2's window render: the attempt targets the SELECTED KEY WINDOW
   *  — targetId is the window's start key, the draft names the end key, the
   *  ordered beats, and the preservation. One render per window at a time.
   *  Null = the failure surface already names it. */
  submitSequence(windowStartKeyId: string, windowEndKeyId: string, draft: { orderedActions: string[]; preservation: string; overrides: SessionOverrideInput }): Promise<{ attemptId: string } | null>
  /** A fresh take for the SAME window (a new idempotency key): resubmits
   *  the newest take's frozen window draft — endpoint keys, beats,
   *  preservation, overrides — byte-identically, so only the seed varies.
   *  `windowEndKeyId` names WHICH window (task 12's Important-1: an older
   *  window's review re-rolls ITSELF, never the start key's newest take of
   *  another window); omitted = the start key's newest sequence take. */
  rerollSequence(windowStartKeyId: string, windowEndKeyId?: string): Promise<{ attemptId: string } | null>
  /** Task 13 — the editorial surface's commands (§9). */
  /** The §7.2.1 third selection: a landed clip's PORTION (inFrame..outFrame,
   *  start-inclusive/end-exclusive integer frames) plus its hold in output
   *  frames. Tween clips ride their owning span; sequence window takes ride
   *  the spanless lane (spanId null). One contribution per (span, attempt) —
   *  re-choosing updates in place. */
  contributeClip(spanId: string | null, attemptId: string, inFrame: number, outFrame: number, holdDuration: number, windowSlotId?: string | null): Promise<boolean>
  /** Task 14 — the export surface (§11.3): assembles and downloads the
   *  review ZIP (sequence.mp4 + manifest.json). Deliberately NOT
   *  busy-gated: the server FREEZES the document truth before assembly, so
   *  authoring during an export is safe by design — the export tracks its
   *  own phase instead. True = the package downloaded. */
  exportSequence(acknowledgeStale: boolean): Promise<boolean>
  // Extension lane (Task 6, spec §4/§5) — the Extend interaction's commands.
  /** The deliberate Extend: submits a continuation window conditioned on the
   *  named landed take's carried tail. Resolves the window FIRST — the
   *  chain's trailing EMPTY window for this source when one stands (a
   *  refused or interrupted submission left exactly that), else a freshly
   *  minted one (the root/selected append, the unselected branch) — then
   *  POSTs the extend. The IDEMPOTENCY KEY is the CALLER's (the ExtendPanel
   *  mints it and holds the submission for §4's Retry — the lost-response
   *  re-POST needs the SAME key and the SAME window, so its identity must
   *  outlive this call). */
  extendTake(sourceAttemptId: string, draft: { targetLength: number; movement: string; preservation: string; overrides: SessionOverrideInput; anchors?: Array<{ reference: 'rolling-near' | 'fixed-far'; frame: number }> }, idempotencyKey: string): Promise<ExtensionOutcome>
  /** §4's RETRY half — the identical submission (§7.2.2: a lost response,
   *  never a new take): the SAME idempotency key, inputs, and WINDOW
   *  re-POSTed. The server answers the row its dispatch already gated
   *  ({ created: false }) when the take exists, or dispatches it when the
   *  request never arrived. */
  retryExtendSubmission(submission: ExtensionSubmission): Promise<{ attemptId: string; created: boolean; windowSlotId: string } | null>
  /** §4's NEW-ALTERNATIVE half — a deliberate, explicitly-changed seed (a
   *  fresh key + an explicit fresh seed; the frozen draft resubmitted
   *  byte-identically, so only the seed varies). Lands as a retained
   *  alternative of the window; the slot's selection never moves. */
  rerollExtension(attemptId: string): Promise<{ attemptId: string } | null>
  /** The window slot's EXPLICIT selection (§4 — never implicit in landing);
   *  lock-guarded client-side, a genuine no-op on the already-selected take. */
  selectWindowCandidate(windowSlotId: string, attemptId: string): Promise<boolean>
  /** The window lock (the key lock's own class). */
  toggleWindowLock(windowSlotId: string, locked: boolean): Promise<boolean>
  /** The explicit binding change (§5 ruling 3) — the mismatch banner's
   *  second resolution: re-points the window's RECORDED source to the named
   *  in-chain attempt; the next submission into the slot freezes it. */
  rebindWindow(windowSlotId: string, sourceAttemptId: string): Promise<boolean>
  /** The assembled sequence's order (§9): the FULL new order, a permutation
   *  of the current contribution ids. */
  reorderContributions(orderedIds: string[]): Promise<boolean>
  /** Drops one contribution — the list is an authored document, never an
   *  append-only ledger. */
  removeContribution(contributionId: string): Promise<boolean>
  /** The selection state's creation arm (task 7's Minor-2): creates the
   *  pre-binding document in the named project and navigates to it. */
  createEmptyDocument(projectId: string): Promise<boolean>
  retry(): Promise<void>
  clearCommandError(): void
}

/** The open ticket — the race guard (see the module header). Module-level:
 *  one session store, one live document per navigation (the shell remounts
 *  on every view/document switch, the registry's own precedent). */
let openTicket = 0

async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  // Chunked btoa (String.fromCharCode spreads overflow on large files) —
  // the pose-rig ingest's own idiom.
  let binary = ''
  for (let offset = 0; offset < buffer.length; offset += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

/** True when a binding asset id is a STORE PATH (ingest paths carry '/') —
 *  the preview/relPath heuristic the seed command and the seed card share.
 *  A bare canvas output id is opaque (task 7's concern) and never rides a
 *  URL. */
const isPathLikeHandle = (assetId: string): boolean => assetId.includes('/')

// ---------------------------------------------------------------------------
// deriveTweenPreview — the live preview selector (task 9, §6.4)
// ---------------------------------------------------------------------------

/** Where a tween reference's pose came from — the §6.4 distinction the
 *  inspector labels on the FIRST FRAME card: the span's start key's selected
 *  image, or a frame PROMOTED from a landed step (the chain's actual current
 *  rolling reference — never a frozen copy of the original endpoint). The
 *  promoted frame's source carries its OWN step slot id: the frame's pose
 *  annotation is bound to that slot's selection pointer (wave 2a), and the
 *  annotation editor addresses its command through it. It also carries the
 *  frame's OWN extracted image (Codex I11): the selection pointer's recorded
 *  frameAsset — the actual conditioning image the card renders beside the
 *  annotation editor, exactly what a later submission freezes as the
 *  rolling-near reference. Null is the pre-widening pointer (the card falls
 *  back to the honest placeholder until its frame is re-selected). */
export type TweenRefSource =
  | { kind: 'start-key'; keyId: string; keyOrder: number }
  | { kind: 'promoted-frame'; stepIndex: number; stepSlotId: string; attemptId: string; frameIndex: number; frameAsset: AssetReference | null }

/** One resolved tween reference (the rolling-near or the fixed-far): ok
 *  carries the asset + pose the compile consumes; not-ok the NAMED problem
 *  (the same name the server's submission refusal would carry). */
export type TweenRef =
  | { ok: true; assetReference: AssetReference; pose: PoseRef; source: TweenRefSource }
  | { ok: false; problem: string }

/** The tween compile context's client-side resolution — the input the
 *  inspector compiles its live preview from and the submit command targets. */
export type TweenPreview = {
  spanId: string
  /** The chain's step slots in order — the LAST is the next submission's
   *  target (the append-step-slot contract: the minted slot is the one the
   *  next step submits against). */
  stepCount: number
  targetStepSlotId: string | null
  rollingReference: TweenRef
  farReference: TweenRef
  /** Every named problem (either reference, a vanished span) — empty when
   *  the context compiles. */
  problems: string[]
}

/** The pure mirror of the submit route's tween draft resolution
 *  (server/animation/routes.ts' resolveDraft tween arm): the ACTUAL current
 *  rolling reference — the promoted frame of the last landed step BEFORE the
 *  target slot, whose pose is the selection pointer's ANNOTATION (wave 2a,
 *  §6.4: authored after the frame's promotion, nulls until then — the same
 *  truth the server freezes), falling back to the span's start key's
 *  selected candidate (pose follows the image, §5.1); the far reference is
 *  always the destination key's selected candidate. A step whose selected
 *  attempt has NOT landed stops the walk with a named problem — the server
 *  refuses that submission with the same name, and the preview must never
 *  silently skip past an explicit selection.
 *
 *  `targetStepSlotId` (optional) pins the submission target to a NAMED step
 *  slot instead of the span's last — the re-roll's arm (a re-roll targets
 *  the step UNDER REVIEW; with a trailing empty slot in the span, the last
 *  slot is NOT it — task 10's Important-1). The walk then starts from that
 *  slot's own position, exactly as the server's resolution does for the
 *  submitted targetId. */
export function deriveTweenPreview(document: AnimationDocumentView, spanId: string, targetStepSlotId?: string): TweenPreview {
  const span = document.body.spans.find((entry) => entry.id === spanId) ?? null
  if (span === null) {
    const problem = 'This span no longer exists in the document.'
    return { spanId, stepCount: 0, targetStepSlotId: null, rollingReference: { ok: false, problem }, farReference: { ok: false, problem }, problems: [problem] }
  }
  const targetIndex = targetStepSlotId !== undefined
    ? span.stepSlots.findIndex((slot) => slot.id === targetStepSlotId)
    : span.stepSlots.length - 1
  if (targetIndex < 0) {
    const problem = 'The named step slot no longer exists in this span.'
    return { spanId, stepCount: span.stepSlots.length, targetStepSlotId: null, rollingReference: { ok: false, problem }, farReference: { ok: false, problem }, problems: [problem] }
  }

  const keyRef = (keyId: string, label: string): TweenRef => {
    const slot = document.body.keys.find((entry) => entry.id === keyId) ?? null
    const candidate = slot === null || slot.selectedCandidateId === null
      ? null
      : slot.candidates.find((entry) => entry.id === slot.selectedCandidateId) ?? null
    if (slot === null || candidate === null) {
      return { ok: false, problem: `${label} key has no selected image — the caption needs its pose.` }
    }
    return { ok: true, assetReference: candidate.assetReference, pose: { poseDescription: candidate.poseDescription, facing: candidate.facing }, source: { kind: 'start-key', keyId, keyOrder: slot.order } }
  }

  // The backward walk over EARLIER steps, the server's loop verbatim: skip
  // steps with no promoted selection, stop at the first one — landed or not.
  // The promoted frame's pose is the pointer's ANNOTATION (wave 2a, §6.4) —
  // the same truth the server's submission resolves, nulls until authored.
  let rolling: TweenRef | null = null
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const slot = span.stepSlots[index]
    const selected = slot?.selectedRollingReference
    if (!selected || slot === undefined) continue
    const attempt = document.attempts.find((entry) => entry.attemptId === selected.attemptId) ?? null
    if (attempt === null || attempt.candidate === null) {
      rolling = { ok: false, problem: `The rolling reference attempt ${selected.attemptId} holds no landed clip yet — step ${index + 1}'s promoted frame is not reviewable.` }
      break
    }
    rolling = {
      ok: true,
      assetReference: attempt.candidate.assetReference,
      pose: { poseDescription: selected.poseDescription, facing: selected.facing },
      source: { kind: 'promoted-frame', stepIndex: index, stepSlotId: slot.id, attemptId: selected.attemptId, frameIndex: selected.frameIndex, frameAsset: selected.frameAsset },
    }
    break
  }

  const rollingReference = rolling ?? keyRef(span.fromKeyId, 'The start')
  const farReference = keyRef(span.toKeyId, 'The destination')
  const problems: string[] = []
  if (!rollingReference.ok) problems.push(rollingReference.problem)
  if (!farReference.ok) problems.push(farReference.problem)
  const lastSlot = span.stepSlots[targetIndex] ?? null
  return { spanId, stepCount: span.stepSlots.length, targetStepSlotId: lastSlot === null ? null : lastSlot.id, rollingReference, farReference, problems }
}

// ---------------------------------------------------------------------------
// deriveHeroPreview — the hero live preview selector (task 11, §5.2/§6.2)
// ---------------------------------------------------------------------------

/** The hero compile context's client-side resolution: ONE reference — the
 *  current key's SELECTED candidate (pose follows the image, §5.1). The
 *  problem string is the same name the server's submission refusal would
 *  carry (a key with no selection cannot source a hero render). */
export type HeroPreview = {
  keyId: string
  currentKey: { ok: true; assetReference: AssetReference; pose: PoseRef; keyOrder: number } | { ok: false; problem: string }
}

/** The pure mirror of the submit route's hero draft resolution
 *  (server/animation/routes.ts' resolveDraft hero arm): the current key's
 *  selected candidate is the caption's single reference line and the
 *  submission's 'current-key' frozen reference. No destination exists by
 *  design (§5.2 — showing where the action goes is showing the answer). */
export function deriveHeroPreview(document: AnimationDocumentView, keyId: string): HeroPreview {
  const slot = document.body.keys.find((entry) => entry.id === keyId) ?? null
  const candidate = slot === null || slot.selectedCandidateId === null
    ? null
    : slot.candidates.find((entry) => entry.id === slot.selectedCandidateId) ?? null
  if (slot === null) {
    return { keyId, currentKey: { ok: false, problem: 'That key slot no longer exists in the document.' } }
  }
  if (candidate === null) {
    return { keyId, currentKey: { ok: false, problem: `Key ${slot.order} has no selected image — the hero caption needs the current key's pose. Accept a frame from its review first, or select a candidate.` } }
  }
  return {
    keyId,
    currentKey: {
      ok: true,
      assetReference: candidate.assetReference,
      pose: { poseDescription: candidate.poseDescription, facing: candidate.facing },
      keyOrder: slot.order,
    },
  }
}

// ---------------------------------------------------------------------------
// deriveSequencePreview — the sequence live preview selector (task 12,
// §5.2/§6.2/§11.2)
// ---------------------------------------------------------------------------

/** The key shape the window resolver reads — the document's own key slots
 *  AND the timeline model's keys (whose `candidate` is the already-resolved
 *  selection) both satisfy it structurally, so the panel resolves its chosen
 *  end locally while the submit command re-resolves from the live document
 *  through the same function. */
export type SequenceKeyish = { id: string; order: number; selectedCandidateId: string | null; candidates: KeyCandidate[] }

/** One window endpoint (the start or the end): ok carries the selected
 *  candidate's asset + pose; not-ok the NAMED problem (the same name the
 *  server's submission refusal would carry). */
export type SequenceWindowRef =
  | { ok: true; assetReference: AssetReference; pose: PoseRef; keyId: string; keyOrder: number }
  | { ok: false; problem: string }

/** The sequence compile context's client-side resolution: the window's two
 *  endpoint references. `windowEndKeyId` is the authoring CHOICE (null =
 *  not picked yet — the honest not-chosen problem, never a guessed end). */
export type SequencePreview = {
  windowStartKeyId: string
  windowEndKeyId: string | null
  windowStart: SequenceWindowRef
  windowEnd: SequenceWindowRef
  /** Every named problem — empty when the window compiles. */
  problems: string[]
}

/** The pure mirror of the submit route's sequence draft resolution
 *  (server/animation/routes.ts' resolveDraft sequence arm): each endpoint is
 *  that key's SELECTED candidate (pose follows the image, §5.1) — a key with
 *  no selection cannot bound a window and the problem names it the same way
 *  the server's refusal would. */
export function deriveSequencePreview(keys: ReadonlyArray<SequenceKeyish>, windowStartKeyId: string, windowEndKeyId: string | null): SequencePreview {
  const refOf = (keyId: string, label: string): SequenceWindowRef => {
    const slot = keys.find((entry) => entry.id === keyId) ?? null
    const candidate = slot === null || slot.selectedCandidateId === null
      ? null
      : slot.candidates.find((entry) => entry.id === slot.selectedCandidateId) ?? null
    if (slot === null) return { ok: false, problem: `The ${label} key no longer exists in the document.` }
    if (candidate === null) return { ok: false, problem: `The ${label} key (#${slot.order}) has no selected image — the caption needs its pose. Accept a frame or select a candidate first.` }
    return { ok: true, assetReference: candidate.assetReference, pose: { poseDescription: candidate.poseDescription, facing: candidate.facing }, keyId, keyOrder: slot.order }
  }
  const notChosen: SequenceWindowRef = { ok: false, problem: 'No window end chosen yet — pick the key whose selected drawing is the window\'s own natural end.' }
  const windowStart = refOf(windowStartKeyId, 'window start')
  const windowEnd = windowEndKeyId === null ? notChosen : refOf(windowEndKeyId, 'window end')
  const problems: string[] = []
  if (!windowStart.ok) problems.push(windowStart.problem)
  if (!windowEnd.ok) problems.push(windowEnd.problem)
  return { windowStartKeyId, windowEndKeyId, windowStart, windowEnd, problems }
}

/** The continuation / re-roll draft (task 10), resolved from DURABLE truth:
 *  the span's persisted intent — the inspector's live typing is the
 *  authoring surface, the chain's actions submit what stands — and the
 *  effective medium (the span's own override when it has one, else the
 *  active binding's). `spanHint` lets a caller reuse an already-found span
 *  from the same document read. */
function reviewDraftOf(document: AnimationDocumentView, spanId: string, spanHint?: Span): { movement: string; preservation: string; overrides: SessionOverrideInput } {
  const span = spanHint ?? document.body.spans.find((entry) => entry.id === spanId) ?? null
  const binding = document.body.bindingHistory.find((entry) => entry.version === document.body.activeBindingVersion) ?? null
  const medium: MediumString = span?.overrides.medium ?? binding?.medium ?? ANIMATION_MEDIA[0]!
  return { movement: span?.intent.movement ?? '', preservation: span?.intent.preservation ?? '', overrides: { medium } }
}

/** One Extend submission's wire truth — the record the ExtendPanel holds for
 *  §4's Retry (the SAME key + identical inputs re-POSTed; §7.2.2's lost-
 *  response semantics, never a new take). */
export type ExtensionSubmission = {
  windowSlotId: string
  sourceAttemptId: string
  targetLength: number
  draft: { movement: string; preservation: string; overrides: SessionOverrideInput; anchors?: Array<{ reference: 'rolling-near' | 'fixed-far'; frame: number }> }
  idempotencyKey: string
}

/** The Extend command's answer: either the submitted take, or the failure —
 *  `submission` NON-null only for the UNSETTLED POST (the window resolved,
 *  the request fired, the response never arrived — the submission record
 *  rides out so the panel's Retry re-POSTs the same key against the same
 *  window, §7.2.2's lost response), or null when the POST never fired or the
 *  server ANSWERED it (a named 400 refusal or a 409 already on the
 *  command-error/conflict surfaces; a retry would repeat it — Task 6 review
 *  M-1: the settled/unsettled distinction the store's doc comment always
 *  claimed, now implemented). */
export type ExtensionOutcome =
  | { ok: true; attemptId: string; windowSlotId: string }
  | { ok: false; submission: ExtensionSubmission | null }

/** The named disable reason for the Extend action on a landed take (§4 —
 *  "disabled with named reasons when not continuation-ready"): null = the
 *  action opens. ONE table so the review panel, the window review, and the
 *  adapter's pre-gate name the same conditions the same way. */
export function extendGateReason(attempt: { continuation: { state: string; error?: string }; modelIdentitiesStamped?: boolean }): string | null {
  const state = attempt.continuation.state
  if (state === 'ready') {
    return attempt.modelIdentitiesStamped === true
      ? null
      : 'Continuation identity evidence is missing — this take rendered without resolved model digests, so it can never seed an extension. Re-land the source on the current weights and extend that take.'
  }
  if (state === 'absent') return 'This take carried no tail (a plain render) — only renders submitted with the carry flag hold one to extend.'
  if (state === 'registering') return `The carried tail is still registering${attempt.continuation.error !== undefined ? ` (last error: ${attempt.continuation.error})` : ''} — Extend opens once registration lands.`
  if (state === 'not-produced') return 'This take\'s in-graph save never completed (not produced) — it can never seed an extension; generate a new take of the step instead.'
  return 'The registered carry no longer resolves (continuation unavailable) — re-land the source chain; the clip itself stays playable.'
}

export const useAnimationSessionStore = create<AnimationSessionState>()((set, get) => {
  /** The command failure surface every authoring command shares (extracted
   *  when task 8 added the timeline's): a 409 lands the conflict + re-reads
   *  (the rebase surface — never a silent lost update, never a blind
   *  re-POST), anything else lands commandError for the surface to name.
   *  Ticket-guarded: a superseded command reports nothing. */
  const failCommand = async (error: unknown, ticket: number): Promise<boolean> => {
    if (ticket !== openTicket) return false
    if (error instanceof AnimationConflict) {
      set({ conflict: { message: error.message, currentRevision: error.currentRevision }, busy: false })
      await get().refresh()
      return false
    }
    set({ busy: false, commandError: error instanceof Error ? error.message : String(error) })
    return false
  }

  return {
  phase: 'loading',
  errorDetail: '',
  document: null,
  attemptState: null,
  refreshFailed: false,
  conflict: null,
  busy: false,
  commandError: null,
  exportPhase: 'idle',
  exportError: null,
  exportStale: null,
  lastExportName: null,
  projectDocuments: null,
  assets: [],
  assetsFailed: false,

  open: async (documentId, projectId) => {
    const ticket = ++openTicket
    set({ phase: 'loading', errorDetail: '', document: null, attemptState: null, refreshFailed: false, conflict: null, busy: false, commandError: null, projectDocuments: null, assets: [], assetsFailed: false, exportPhase: 'idle', exportError: null, exportStale: null, lastExportName: null })
    if (documentId) {
      try {
        const view = await animationApi.getDocument(documentId)
        if (ticket !== openTicket) return
        set({ phase: 'ready', document: view, attemptState: seedAttemptState(view.attempts) })
        // The prepared-character rows ride beside the ready document — a
        // failed load degrades the picker's character half, never the shell.
        void (async () => {
          try {
            const rows = await documentsApi.listAssets()
            if (ticket !== openTicket) return
            const picks: AnimationAssetPick[] = []
            for (const row of rows) {
              if (row.kind !== 'character') continue
              const images = (row.canonicalReferenceSet ?? [])
                .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
                .map((relPath) => ({ assetId: relPath, relPath }))
              if (!images.length) continue
              const name = typeof row.fields.name === 'string' && row.fields.name ? row.fields.name : `character ${row.id.slice(0, 8)}`
              const description = typeof row.fields.description === 'string' ? row.fields.description : ''
              picks.push({ id: row.id, name, description, images })
            }
            set({ assets: picks, assetsFailed: false })
          } catch {
            if (ticket !== openTicket) return
            set({ assets: [], assetsFailed: true })
          }
        })()
        return
      } catch (error) {
        if (ticket !== openTicket) return
        if (!(error instanceof AnimationHttpError && error.status === 404)) {
          set({ phase: 'error', errorDetail: error instanceof Error ? error.message : String(error) })
          return
        }
        // 404 — the recoverable selection state (a removed document or a
        // stale address), never a silently created replacement.
      }
    }
    set({ phase: 'missing', projectDocuments: null })
    if (!projectId) return
    try {
      const documents = await animationApi.listDocuments(projectId)
      if (ticket !== openTicket) return
      set({ projectDocuments: documents })
    } catch {
      if (ticket !== openTicket) return
      set({ projectDocuments: 'failed' })
    }
  },

  refresh: async () => {
    const current = get().document
    if (!current) return
    const ticket = openTicket
    try {
      const view = await animationApi.getDocument(current.id)
      if (ticket !== openTicket) return
      set({ document: view, refreshFailed: false, attemptState: seedAttemptState(view.attempts) })
    } catch {
      if (ticket !== openTicket) return
      // A silent refresh failure never blanks the loaded document: the shell
      // keeps the last good read and names the failure.
      set({ refreshFailed: true })
    }
  },

  updateBinding: async (binding) => {
    const current = get().document
    if (!current || get().busy) return false
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      // The revision rides the command (§7.2's gate) — read at call time
      // from the live store, the freshest this client knows.
      const view = await animationApi.updateBinding(current.id, binding, get().document?.revision ?? 0)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  importImages: async (files) => {
    const imported: AnimationImportedImage[] = []
    for (const file of files) {
      const dataBase64 = await fileToBase64(file)
      const ingested = await documentsApi.ingestBlob({ dataBase64, name: file.name, kind: 'image' })
      imported.push({ assetId: ingested.blob.relPath, relPath: ingested.blob.relPath })
    }
    return imported
  },

  importKeyCandidate: async (destination, image, origin) => {
    const current = get().document
    if (!current || get().busy) return false
    // The keyId was resolved by the caller (one minted id per import
    // action, I-1); the store materializes unknown slots (order max+1,
    // selection null), so "into key #N" and "as a new key" ride the same
    // add-candidate command (§5.3: membership grows, selection stays null).
    const keyId = destination.keyId
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      // The add half ONLY — the selection is never touched here (§5.3's
      // two-command split; choosing the candidate is selectKeyCandidate).
      const view = await animationApi.keyCommand(current.id, 'add-candidate', {
        keyId,
        candidate: {
          id: crypto.randomUUID(),
          assetReference: { assetId: image.assetId, relPath: isPathLikeHandle(image.assetId) ? image.relPath : null, kind: 'image' },
          origin,
          provenance: { assetId: image.assetId },
          poseDescription: null,
          facing: null,
        },
      }, get().document?.revision ?? 0)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  selectKeyCandidate: async (keyId, candidateId) => {
    const current = get().document
    if (!current || get().busy) return false
    const slot = current.body.keys.find((entry) => entry.id === keyId) ?? null
    if (slot === null) {
      set({ commandError: 'That key slot no longer exists — reload picked up a change.' })
      return false
    }
    if (!slot.candidates.some((entry) => entry.id === candidateId)) {
      set({ commandError: `That candidate is no longer part of key ${slot.order} — reload picked up a change.` })
      return false
    }
    // The server enforces the same refusals (§7.2.1) — naming them here
    // keeps the strip's affordance honest instead of firing a doomed command.
    if (slot.lock) {
      set({ commandError: `Key ${slot.order} is locked — unlock it before changing its selection.` })
      return false
    }
    const candidate = slot.candidates.find((entry) => entry.id === candidateId) ?? null
    if (candidate !== null && candidate.assetReference.kind !== 'image') {
      // Codex I12: a landed hero CLIP is a retained alternative, never a
      // selectable drawing — the frame promotes through review (§5.2). The
      // strip does not offer the action; this guard keeps a stale click
      // honest (the server refuses it regardless).
      set({ commandError: `A key slot selects an image — promote a frame from the clip through review (§5.2), never the clip itself.` })
      return false
    }
    if (slot.selectedCandidateId === candidateId) return true
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      const view = await animationApi.selectKeyCandidate(current.id, keyId, candidateId, get().document?.revision ?? 0)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  seedInitialKey: async () => {
    const current = get().document
    if (!current || get().busy) return false
    const binding = current.body.bindingHistory.find((entry) => entry.version === current.body.activeBindingVersion) ?? null
    if (binding === null) {
      set({ commandError: 'The session has no active binding to seed the initial key from.' })
      return false
    }
    if (current.body.keys.length > 0) {
      // A named refusal, never a silent no-op — the seed button can be one
      // refresh behind a concurrent write that already added keys.
      set({ commandError: 'The timeline already holds keys — the initial key seeds only an empty timeline.' })
      return false
    }
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      // The seed: the bound image becomes the slot's first candidate, then
      // the explicit selection follows (§5.3 — the slot materializes with
      // selection null, choosing is its own act). relPath rides only a
      // path-like handle; the origin is the §5.2 prepared-image pick.
      const keyId = crypto.randomUUID()
      const candidateId = crypto.randomUUID()
      const added = await animationApi.keyCommand(current.id, 'add-candidate', {
        keyId,
        candidate: {
          id: candidateId,
          assetReference: { assetId: binding.initialKeyAssetId, relPath: isPathLikeHandle(binding.initialKeyAssetId) ? binding.initialKeyAssetId : null, kind: 'image' },
          origin: 'project-asset',
          provenance: { assetId: binding.initialKeyAssetId },
          poseDescription: null,
          facing: null,
        },
      }, get().document?.revision ?? 0)
      const selected = await animationApi.selectKeyCandidate(current.id, keyId, candidateId, added.revision)
      if (ticket !== openTicket) return false
      set({ document: selected, conflict: null, busy: false, attemptState: seedAttemptState(selected.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  toggleKeyLock: async (keyId, locked) => {
    const current = get().document
    if (!current || get().busy) return false
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      const view = await animationApi.keyCommand(current.id, locked ? 'lock' : 'unlock', { keyId }, get().document?.revision ?? 0)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  updateSpanIntent: async (spanId, intent) => {
    const current = get().document
    if (!current) return false
    const ticket = openTicket
    // Task 9's Minor-2, fixed in task 13: the debounced draft persist PARKS
    // behind a command already in flight instead of returning false and
    // silently dropping the settled text. Each loop iteration re-observes
    // `busy` after waking, so two parked persists serialize (the first holds
    // busy through its own write; the second re-waits) instead of racing
    // into each other's revision.
    while (get().busy && ticket === openTicket) await whenIdle()
    if (ticket !== openTicket || !get().document) return false
    set({ busy: true, commandError: null })
    try {
      const { document: view } = await animationApi.spanCommand(current.id, 'update-intent', { spanId, intent }, get().document?.revision ?? 0)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  setKeyFacing: async (keyId, facing) => {
    const current = get().document
    if (!current || get().busy) return false
    const slot = current.body.keys.find((entry) => entry.id === keyId) ?? null
    if (slot === null) {
      set({ commandError: 'That key slot no longer exists — reload picked up a change.' })
      return false
    }
    if (slot.lock) {
      // The server enforces the same refusal (§7.2.1) — naming it here keeps
      // the picker's affordance honest instead of firing a doomed command.
      set({ commandError: `Key ${slot.order} is locked — unlock it before changing its facing.` })
      return false
    }
    const selected = slot.selectedCandidateId === null ? null : slot.candidates.find((entry) => entry.id === slot.selectedCandidateId) ?? null
    if (selected === null) {
      set({ commandError: `Key ${slot.order} has no selected image to carry the facing.` })
      return false
    }
    if (selected.facing === facing) return true
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      // §5.1: facing follows the CANDIDATE, and candidates are immutable on
      // the wire — a corrected facing for the same image is a cloned
      // alternative plus the explicit selection (§5.3's append-then-select,
      // the seed command's own two-command idiom). The selection change
      // marks dependent spans stale 'pose' server-side, exactly as it should.
      const candidateId = crypto.randomUUID()
      const added = await animationApi.keyCommand(current.id, 'add-candidate', {
        keyId,
        candidate: { ...selected, id: candidateId, facing },
      }, get().document?.revision ?? 0)
      const view = await animationApi.selectKeyCandidate(current.id, keyId, candidateId, added.revision)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  submitTweenStep: async (spanId, draft, targetStepSlotId) => {
    const ticket = openTicket
    if (!draft.movement.trim()) {
      set({ commandError: 'The movement step needs text before submission.' })
      return null
    }
    // The click SERIALIZES behind any command in flight — the intent
    // persist's own park doctrine, never a silent busy-refusal (review I-1):
    // the I10 pose flush leaves an await between the click and this entry,
    // and the movement settle timer's PARKED persist can wake in the
    // microtask gap between the flush annotate's busy-clear and this call,
    // grab busy, and turn the old `get().busy` guard into a silent null —
    // pose and intent persisted, the primary action dropped with no named
    // error anywhere. Parking means the submit runs once the chain drains
    // (the wire order annotate → intent-persist → submit, each awaited);
    // a superseded ticket (the session moved on) still reports nothing,
    // and a submit that cannot run after draining answers a NAMED error.
    while (get().busy && ticket === openTicket) await whenIdle()
    if (ticket !== openTicket) return null
    const current = get().document
    if (current === null) {
      set({ commandError: 'The animation document is no longer open — the submission stopped. Reopen it and submit again.' })
      return null
    }
    // The flush: the span's DURABLE intent catches up to the submitted draft
    // first, so the frozen caption's movement and the document's span label
    // can never disagree. A failed flush (conflict, refusal) stops the
    // submission — the surface already names it.
    const span = current.body.spans.find((entry) => entry.id === spanId) ?? null
    if (span !== null && (span.intent.movement !== draft.movement || span.intent.preservation !== draft.preservation)) {
      const persisted = await get().updateSpanIntent(spanId, { movement: draft.movement, preservation: draft.preservation })
      if (!persisted) return null
    }
    const fresh = get().document
    if (!fresh) return null
    const preview = deriveTweenPreview(fresh, spanId, targetStepSlotId)
    if (preview.targetStepSlotId === null || !preview.rollingReference.ok || !preview.farReference.ok) {
      set({ commandError: preview.problems.join(' ') || 'The tween references are not resolvable.' })
      return null
    }
    set({ busy: true, commandError: null })
    try {
      // A fresh idempotency key per deliberate click — §7.2.2's retry key
      // belongs to a LOST RESPONSE, never to a user's explicit re-roll. The
      // CARRY flag rides the draft (Task 6 review I-2, closed Task 7: the
      // inspector's toggle is the authoring surface; the route's freeze()
      // settings merge is the one door it enters through). Review-surface
      // re-rolls submit plain — the toggle is a per-submission authoring act,
      // and the Extend gate names the plain-render condition honestly.
      const submitted = await animationApi.submit({
        documentId: fresh.id,
        tool: 'tween',
        targetId: preview.targetStepSlotId,
        draft: { tool: 'tween', targetStepSlotId: preview.targetStepSlotId, movementStep: draft.movement, overrides: draft.overrides, carry: draft.carry === true },
      }, `anim-tween-${spanId.slice(0, 8)}-${crypto.randomUUID()}`)
      if (ticket !== openTicket) return null
      // The attempt's state arrives through the fabric (attempt-state
      // envelopes); the document itself did not move (attempt rows carry
      // their own revision, §11.2) — but its VIEW must gain the attempt row
      // for the review panel to mount, so the durable read follows the
      // submit (the recovery-read contract, not a callback chain).
      set({ busy: false })
      void get().refresh()
      return { attemptId: submitted.attemptId }
    } catch (error) {
      await failCommand(error, ticket)
      return null
    }
  },

  selectReferenceFrame: async (spanId, attemptId, frameIndex) => {
    const current = get().document
    if (!current || get().busy) return false
    const attempt = current.attempts.find((entry) => entry.attemptId === attemptId) ?? null
    if (attempt === null) {
      set({ commandError: 'That attempt is no longer part of this document — reload picked up a change.' })
      return false
    }
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      // §7.2.2's two frame paths: the PROPOSED frame is already prepared;
      // any other frame rides ON-DEMAND EXTRACTION first. A failed
      // extraction names itself and stops here — the durable selection is
      // never written against a frame that could not be resolved.
      if (attempt.preparation.proposedFrameIndex !== frameIndex) {
        await animationApi.extractFrame(attemptId, frameIndex)
      }
      const view = await animationApi.selectRollingReference(current.id, spanId, attemptId, frameIndex, get().document?.revision ?? 0)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  annotateRollingReference: async (spanId, stepSlotId, patch) => {
    const current = get().document
    if (!current) return false
    const pointerOf = (doc: AnimationDocumentView) =>
      doc.body.spans.find((entry) => entry.id === spanId)?.stepSlots.find((step) => step.id === stepSlotId)?.selectedRollingReference ?? null
    // The pointer identity captured at ENTRY (the fix round's M-4): the patch
    // was authored against THIS frame. A park that outlives another surface's
    // re-selection must never land the old frame's pose on the new one — the
    // new selection's pose is unknown until authored (§6.4).
    const entryPointer = pointerOf(current)
    if (entryPointer === null) {
      set({ commandError: 'That rolling reference is no longer selected — reload picked up a change.' })
      return false
    }
    const ticket = openTicket
    // The intent draft's park doctrine (task 9's Minor-2, fixed in task 13):
    // the debounced pose settle waits out a command in flight instead of
    // returning false and silently dropping the settled text. The facing
    // arm's chips disable while busy, so the park in practice serves the
    // settle; both serialize safely either way.
    while (get().busy && ticket === openTicket) await whenIdle()
    if (ticket !== openTicket || !get().document) return false
    const fresh = get().document!
    const pointer = pointerOf(fresh)
    if (pointer === null || pointer.attemptId !== entryPointer.attemptId || pointer.frameIndex !== entryPointer.frameIndex) {
      // A NAMED drop, never a silent one: the selection moved while the
      // settle waited — the typed pose belongs to the frame it was typed
      // for, and the editor has already re-seeded onto the new pointer.
      console.warn(
        `[animation] dropped a rolling-reference annotation settle: the selection moved from ${entryPointer.attemptId}#${entryPointer.frameIndex} to ${pointer === null ? 'none' : `${pointer.attemptId}#${pointer.frameIndex}`} while the command waited — the new frame starts unannotated (§6.4).`,
      )
      return false
    }
    // The patch merges over the LIVE pointer: the command always carries the
    // full annotation the wire contract wants, and a one-field edit never
    // reverts the other field's just-persisted truth.
    const annotation = {
      poseDescription: patch.poseDescription !== undefined ? patch.poseDescription : pointer.poseDescription,
      facing: patch.facing !== undefined ? patch.facing : pointer.facing,
    }
    if (annotation.poseDescription === pointer.poseDescription && annotation.facing === pointer.facing) return true
    set({ busy: true, commandError: null })
    try {
      const view = await animationApi.annotateRollingReference(fresh.id, spanId, stepSlotId, annotation, get().document?.revision ?? 0)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  continueChain: async (spanId) => {
    const current = get().document
    if (!current || get().busy) return null
    const span = current.body.spans.find((entry) => entry.id === spanId) ?? null
    if (span === null) {
      set({ commandError: 'That span no longer exists in the document.' })
      return null
    }
    // §7.1's gate at the command, keyed to the CHAIN's truth (task 10's
    // Important-1 closed): the next step needs the span's current rolling
    // reference — the nearest promoted selection walking back over the
    // slots, exactly the resolution the server performs for the submission's
    // target. NOT the LAST slot's own selection: a span whose trailing slot
    // is still EMPTY (a continuation whose submission was refused or
    // interrupted) continues INTO that slot from the PREVIOUS step's
    // selection — the review panel models the frontier step, and this guard
    // must agree with it.
    const holdsPromotedReference = (() => {
      for (let index = span.stepSlots.length - 1; index >= 0; index -= 1) {
        const selected = span.stepSlots[index]?.selectedRollingReference
        if (!selected) continue
        const attempt = current.attempts.find((entry) => entry.attemptId === selected.attemptId) ?? null
        return attempt !== null && attempt.candidate !== null
      }
      return false
    })()
    if (!holdsPromotedReference) {
      // The panel disables the action — this guard keeps a stale click
      // honest, never a silent no-op.
      set({ commandError: 'Choose a reference frame from a landed step before continuing — the next step needs its near reference.' })
      return null
    }
    const lastSlot = span.stepSlots[span.stepSlots.length - 1] ?? null
    if (lastSlot === null) {
      set({ commandError: 'That span holds no step slots to continue into.' })
      return null
    }
    const ticket = openTicket
    set({ busy: true, commandError: null })
    let documentForSubmit = current
    if (lastSlot.attempts.length > 0) {
      // The chain's frontier holds a step: the continuation APPENDS the next
      // slot (the F1 command) — the minted slot is the submission's target.
      let appended: Awaited<ReturnType<typeof animationApi.appendStepSlot>>
      try {
        appended = await animationApi.appendStepSlot(current.id, spanId, get().document?.revision ?? 0)
      } catch (error) {
        await failCommand(error, ticket)
        return null
      }
      if (ticket !== openTicket) return null
      // The append is a completed authoring command (busy clears; the submit
      // that follows owns its own busy window) — and the minted slot is now
      // the span's LAST, exactly what submitTweenStep targets.
      set({ document: appended.document, conflict: null, busy: false, attemptState: seedAttemptState(appended.document.attempts) })
      documentForSubmit = appended.document
    }
    // A trailing EMPTY slot is the continuation's own target already —
    // submitting into it advances the chain WITHOUT minting another hole.
    set({ busy: false })
    return get().submitTweenStep(spanId, reviewDraftOf(documentForSubmit, spanId))
  },

  rerollStep: async (spanId, stepSlotId) => {
    const current = get().document
    if (!current) return null
    // A re-roll targets the step UNDER REVIEW (the named slot — the panel's
    // subject), never the span's last slot by default: with a trailing empty
    // slot in the span, the last slot would capture a "re-roll" as the NEXT
    // step instead of an alternative for the reviewed one (task 10's
    // Important-1, the re-roll arm).
    return get().submitTweenStep(spanId, reviewDraftOf(current, spanId), stepSlotId)
  },

  retryPreparation: async (attemptId) => {
    const current = get().document
    if (!current || get().busy) return false
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      await animationApi.retryPreparation(attemptId)
      // The fabric does not carry preparation detail events (server-internal
      // by design) — the command's own durable read IS the recovery surface.
      const view = await animationApi.getDocument(current.id)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  submitHero: async (keyId, draft) => {
    const current = get().document
    if (!current || get().busy) return null
    if (!draft.movementArc.trim()) {
      set({ commandError: 'The movement arc needs text before submission.' })
      return null
    }
    const preview = deriveHeroPreview(current, keyId)
    if (!preview.currentKey.ok) {
      set({ commandError: preview.currentKey.problem })
      return null
    }
    // One next-key render per source at a time (the button disables; this
    // guard keeps a stale click honest, never a silent parallel render).
    const inFlight = current.attempts.find((entry) => entry.tool === 'hero' && entry.sourceKeyId === keyId && IN_FLIGHT.has(entry.execution))
    if (inFlight) {
      set({ commandError: 'A next-key render from this key is already in flight — review its landing before generating another.' })
      return null
    }
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      // §5.2: the attempt targets a FRESH PROPOSED key slot (minted here);
      // the source key is the draft's — hero generates the NEXT key, never
      // a re-roll of the current one. A fresh idempotency key per
      // deliberate click (§7.2.2's retry key belongs to a lost response).
      const proposedKeyId = crypto.randomUUID()
      const submitted = await animationApi.submit({
        documentId: current.id,
        tool: 'hero',
        targetId: proposedKeyId,
        draft: { tool: 'hero', sourceKeyId: keyId, movementArc: draft.movementArc, overrides: draft.overrides },
      }, `anim-hero-${keyId.slice(0, 8)}-${crypto.randomUUID()}`)
      if (ticket !== openTicket) return null
      // The attempt row reaches the view through the durable read (the
      // document itself did not move — the review follows the fabric).
      set({ busy: false })
      void get().refresh()
      return { attemptId: submitted.attemptId, keyId: proposedKeyId }
    } catch (error) {
      await failCommand(error, ticket)
      return null
    }
  },

  acceptHeroFrame: async (keyId, attemptId, frameIndex) => {
    const current = get().document
    if (!current || get().busy) return false
    const attempt = current.attempts.find((entry) => entry.attemptId === attemptId) ?? null
    if (attempt === null || attempt.tool !== 'hero' || attempt.targetId !== keyId) {
      set({ commandError: 'That hero take no longer targets this key — reload picked up a change.' })
      return false
    }
    if (attempt.candidate === null || !Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= attempt.candidate.frameCount) {
      set({ commandError: 'That frame is not part of the landed clip.' })
      return false
    }
    const slot = current.body.keys.find((entry) => entry.id === keyId) ?? null
    if (slot === null) {
      set({ commandError: 'That key slot no longer exists — reload picked up a change.' })
      return false
    }
    // The server enforces the same refusal (§7.2.1) — naming it here keeps
    // the strip's affordance honest instead of firing a doomed selection.
    if (slot.lock) {
      set({ commandError: `Key ${slot.order} is locked — unlock it before changing its selection.` })
      return false
    }
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      // §7.2.2's on-demand extraction — ALWAYS for hero acceptance: the
      // accepted frame MINTS a key candidate, so the frame's asset must
      // resolve (the tween lane's proposal skip does not apply — that
      // selection stores only {attemptId, frameIndex} metadata, this one
      // needs the image itself).
      const extracted = await animationApi.extractFrame(attemptId, frameIndex)
      // §5.2: the accepted image becomes the key — a NEW candidate of the
      // PROPOSED slot (origin 'hero', the frame's provenance naming the
      // take and frame), then the EXPLICIT selection (§5.3's
      // append-then-select, the seed command's two-command idiom). The
      // landed clip candidates stay beside it as retained alternatives.
      const candidateId = crypto.randomUUID()
      const added = await animationApi.keyCommand(current.id, 'add-candidate', {
        keyId,
        candidate: {
          id: candidateId,
          assetReference: extracted,
          origin: 'hero',
          provenance: {
            assetId: extracted.assetId,
            sourceTake: attemptId,
            sourceFrame: frameIndex,
            generatingOp: attemptId,
            inputRevisions: { document: `r${current.revision}` },
          },
          poseDescription: null,
          facing: null,
        },
      }, get().document?.revision ?? 0)
      const view = await animationApi.selectKeyCandidate(current.id, keyId, candidateId, added.revision)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  rerollHero: async (keyId) => {
    const current = get().document
    if (!current) return null
    // The durable re-roll truth: the newest hero take of this slot carries
    // the frozen draft (§8.1) — source key, arc, and resolved overrides —
    // and the re-roll resubmits them UNCHANGED against the SAME proposed
    // slot, so only the seed varies between takes.
    const takes = current.attempts.filter((entry) => entry.tool === 'hero' && entry.targetId === keyId)
    const newest = takes[takes.length - 1] ?? null
    if (newest === null || newest.sourceKeyId === undefined || newest.movementArc === undefined || newest.heroOverrides === undefined) {
      set({ commandError: 'That key has no hero take to re-roll from.' })
      return null
    }
    const sourceKeyId = newest.sourceKeyId
    const movementArc = newest.movementArc
    const overrides = newest.heroOverrides
    const preview = deriveHeroPreview(current, sourceKeyId)
    if (!preview.currentKey.ok) {
      set({ commandError: preview.currentKey.problem })
      return null
    }
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      const submitted = await animationApi.submit({
        documentId: current.id,
        tool: 'hero',
        targetId: keyId,
        draft: { tool: 'hero', sourceKeyId, movementArc, overrides },
      }, `anim-hero-${keyId.slice(0, 8)}-${crypto.randomUUID()}`)
      if (ticket !== openTicket) return null
      set({ busy: false })
      void get().refresh()
      return { attemptId: submitted.attemptId }
    } catch (error) {
      await failCommand(error, ticket)
      return null
    }
  },

  openSpanIntoKey: async (fromKeyId, toKeyId, seedMovement) => {
    const current = get().document
    if (!current || get().busy) return null
    // Idempotent: a span between the pair already IS the binding — select it.
    const existing = current.body.spans.find((span) => span.fromKeyId === fromKeyId && span.toKeyId === toKeyId) ?? null
    if (existing !== null) return existing.id
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      const inserted = await animationApi.spanCommand(current.id, 'insert', {
        fromKeyId,
        toKeyId,
        // The hero arc IS the span's motion draft (§5.2: the accepted key
        // serves as the far reference of the span leading into it);
        // preservation authors in the inspector — the insert only seeds.
        intent: { movement: seedMovement, preservation: '' },
      }, get().document?.revision ?? 0)
      if (ticket !== openTicket) return null
      set({ document: inserted.document, conflict: null, busy: false, attemptState: seedAttemptState(inserted.document.attempts) })
      return inserted.spanId ?? null
    } catch (error) {
      await failCommand(error, ticket)
      return null
    }
  },

  submitSequence: async (windowStartKeyId, windowEndKeyId, draft) => {
    const current = get().document
    if (!current || get().busy) return null
    if (draft.orderedActions.length === 0) {
      set({ commandError: 'The ordered actions need at least one beat before submission.' })
      return null
    }
    if (!draft.preservation.trim()) {
      set({ commandError: 'The preservation text needs content before submission.' })
      return null
    }
    // The same resolver the panel previews through, over the LIVE document —
    // the server re-resolves authoritatively, this guard names the problem
    // before a doomed command fires.
    const preview = deriveSequencePreview(current.body.keys, windowStartKeyId, windowEndKeyId)
    if (preview.problems.length > 0) {
      set({ commandError: preview.problems.join(' ') })
      return null
    }
    // One render per WINDOW at a time (the button disables per chosen end;
    // this guard keys off the frozen pair, never the start key alone — two
    // different windows from one start are independent renders).
    const inFlight = current.attempts.find((entry) => entry.tool === 'sequence' && entry.targetId === windowStartKeyId
      && entry.windowEndKeyId === windowEndKeyId && IN_FLIGHT.has(entry.execution))
    if (inFlight) {
      set({ commandError: 'A render of this window is already in flight — review its landing before generating another.' })
      return null
    }
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      // §11.2: the attempt targets the selected key window — targetId is the
      // window's START key (the playhead's in-flight rule marks it), the
      // draft names the end. A fresh idempotency key per deliberate click.
      const submitted = await animationApi.submit({
        documentId: current.id,
        tool: 'sequence',
        targetId: windowStartKeyId,
        draft: { tool: 'sequence', windowStartKeyId, windowEndKeyId, orderedActions: draft.orderedActions, preservation: draft.preservation, overrides: draft.overrides },
      }, `anim-seq-${windowStartKeyId.slice(0, 8)}-${crypto.randomUUID()}`)
      if (ticket !== openTicket) return null
      // The attempt row reaches the view through the durable read (the
      // document itself did not move — sequence landings change no body).
      set({ busy: false })
      void get().refresh()
      return { attemptId: submitted.attemptId }
    } catch (error) {
      await failCommand(error, ticket)
      return null
    }
  },

  rerollSequence: async (windowStartKeyId, windowEndKeyId) => {
    const current = get().document
    if (!current) return null
    // The durable re-roll truth: the newest sequence take of this window
    // start carries the frozen draft (§8.1) — endpoint keys, beats,
    // preservation, overrides — and the re-roll resubmits them UNCHANGED
    // against the SAME window, so only the seed varies between takes. The
    // end key names WHICH window (an older window's review re-rolls itself).
    const takes = current.attempts.filter((entry) => entry.tool === 'sequence' && entry.targetId === windowStartKeyId
      && (windowEndKeyId === undefined || entry.windowEndKeyId === windowEndKeyId))
    const newest = takes[takes.length - 1] ?? null
    if (newest === null || newest.windowEndKeyId === undefined || newest.sequenceActions === undefined
      || newest.sequencePreservation === undefined || newest.sequenceOverrides === undefined) {
      set({ commandError: 'This key has no sequence take with a frozen window to re-roll from.' })
      return null
    }
    const preview = deriveSequencePreview(current.body.keys, windowStartKeyId, newest.windowEndKeyId)
    if (preview.problems.length > 0) {
      set({ commandError: preview.problems.join(' ') })
      return null
    }
    // Task 12's Minor-1, fixed in task 13: the same one-render-per-window
    // guard `submitSequence` carries — keyed off the frozen start+end pair,
    // never the start key alone (two windows from one start are independent
    // renders; a re-roll of THIS window waits for its own landing).
    const inFlight = current.attempts.find((entry) => entry.tool === 'sequence' && entry.targetId === windowStartKeyId
      && entry.windowEndKeyId === newest.windowEndKeyId && IN_FLIGHT.has(entry.execution))
    if (inFlight) {
      set({ commandError: 'A render of this window is already in flight — review its landing before generating another.' })
      return null
    }
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      const submitted = await animationApi.submit({
        documentId: current.id,
        tool: 'sequence',
        targetId: windowStartKeyId,
        draft: {
          tool: 'sequence',
          windowStartKeyId,
          windowEndKeyId: newest.windowEndKeyId,
          orderedActions: newest.sequenceActions,
          preservation: newest.sequencePreservation,
          overrides: newest.sequenceOverrides,
        },
      }, `anim-seq-${windowStartKeyId.slice(0, 8)}-${crypto.randomUUID()}`)
      if (ticket !== openTicket) return null
      set({ busy: false })
      void get().refresh()
      return { attemptId: submitted.attemptId }
    } catch (error) {
      await failCommand(error, ticket)
      return null
    }
  },

  contributeClip: async (spanId, attemptId, inFrame, outFrame, holdDuration, windowSlotId) => {
    const current = get().document
    if (!current || get().busy) return false
    // The shape the store enforces anyway — naming it here keeps the panel's
    // affordance honest instead of firing a doomed command.
    for (const [name, value] of [['inFrame', inFrame], ['outFrame', outFrame], ['holdDuration', holdDuration]] as const) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        set({ commandError: `${name} must be a non-negative whole number of frames.` })
        return false
      }
    }
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      // Editorial timing is an assembly decision (§9) — no staleness, no
      // generation promises; the upsert lands the portion and the hold.
      const view = await animationApi.selectClipContribution(current.id, spanId, attemptId, inFrame, outFrame, holdDuration, get().document?.revision ?? 0, windowSlotId ?? null)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  reorderContributions: async (orderedIds) => {
    const current = get().document
    if (!current || get().busy) return false
    if (!Array.isArray(orderedIds) || orderedIds.length !== current.body.editorial.length) {
      set({ commandError: 'The new order must name every contribution exactly once.' })
      return false
    }
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      const view = await animationApi.editorialCommand(current.id, 'reorder', { orderedIds }, get().document?.revision ?? 0)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  removeContribution: async (contributionId) => {
    const current = get().document
    if (!current || get().busy) return false
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      const view = await animationApi.editorialCommand(current.id, 'remove', { contributionId }, get().document?.revision ?? 0)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  exportSequence: async (acknowledgeStale) => {
    const current = get().document
    if (!current) return false
    if (get().exportPhase === 'running') return false
    set({ exportPhase: 'running', exportError: null, exportStale: null })
    try {
      const result = await animationApi.exportSequence(current.id, acknowledgeStale)
      if (result.ok) {
        // The delivery: the archive lands in the browser's download stream
        // (a programmatic anchor click — the only sanctioned way to hand a
        // fetched blob to the user's disk).
        const url = URL.createObjectURL(result.archive)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = result.fileName
        document.body.append(anchor)
        anchor.click()
        anchor.remove()
        URL.revokeObjectURL(url)
        set({ exportPhase: 'done', lastExportName: result.fileName, exportStale: null, exportError: null })
        return true
      }
      set({
        exportPhase: 'idle',
        exportError: result.error,
        exportStale: result.stale !== null && result.stale.length > 0 ? result.stale : null,
      })
      return false
    } catch (error) {
      set({ exportPhase: 'idle', exportError: error instanceof Error ? error.message : String(error), exportStale: null })
      return false
    }
  },

  // ---- the extension lane's commands (Task 6, spec §4/§5) ------------------

  extendTake: async (sourceAttemptId, draft, idempotencyKey) => {
    const ticket = openTicket
    // The click SERIALIZES behind any command in flight (the intent persist's
    // park doctrine — never a silent busy-refusal of the primary action).
    const nothingFired: ExtensionOutcome = { ok: false, submission: null }
    while (get().busy && ticket === openTicket) await whenIdle()
    if (ticket !== openTicket) return nothingFired
    const current = get().document
    if (current === null) {
      set({ commandError: 'The animation document is no longer open — the submission stopped. Reopen it and submit again.' })
      return nothingFired
    }
    const source = current.attempts.find((entry) => entry.attemptId === sourceAttemptId) ?? null
    if (source === null) {
      set({ commandError: 'That take is no longer among this document\'s attempts — reload picked up a change.' })
      return nothingFired
    }
    if (!draft.movement.trim()) {
      set({ commandError: 'The extension\'s movement text needs content before submission.' })
      return nothingFired
    }
    if (!draft.preservation.trim()) {
      set({ commandError: 'The extension\'s preservation text needs content before submission.' })
      return nothingFired
    }
    if (!idempotencyKey.trim() || idempotencyKey.length > 400) {
      set({ commandError: 'The submission needs its idempotency key.' })
      return nothingFired
    }
    // The named gate — the same conditions the button's disable names (the
    // module's honest-affordance idiom: a stale click fires a named refusal,
    // never a doomed command).
    const gate = extendGateReason(source)
    if (gate !== null) {
      set({ commandError: gate })
      return nothingFired
    }
    set({ busy: true, commandError: null })
    // The submission record, hoisted so the FAILURE arm can hand the panel
    // the exact window its POST named (§4's Retry re-POSTs the SAME key
    // against the SAME window — re-resolving could mint a different one and
    // 409 the key).
    let submission: ExtensionSubmission | null = null
    try {
      // The window resolution — the chain's trailing EMPTY window for this
      // source when one stands (a refused/interrupted submission left exactly
      // that; the continueChain doctrine applied to chains), else a freshly
      // minted one (the server's root/selected append, the unselected branch).
      let windowSlotId: string | null = null
      for (const chain of current.body.chains) {
        const empty = chain.windows.find((window) => window.sourceAttemptId === sourceAttemptId && window.attempts.length === 0)
        if (empty !== undefined) { windowSlotId = empty.id; break }
      }
      if (windowSlotId === null) {
        const created = await animationApi.chainsCommand(current.id, 'create-window', { sourceAttemptId }, get().document?.revision ?? 0)
        if (ticket !== openTicket) return nothingFired
        windowSlotId = created.windowSlotId ?? null
        if (windowSlotId === null) {
          set({ busy: false, commandError: 'The window creation answer carried no minted slot id — nothing was submitted.' })
          return nothingFired
        }
        // The mint's document lands (the rebase surface stays honest), then
        // the submission owns its own busy window — the continueChain idiom.
        set({ document: created.document, conflict: null, attemptState: seedAttemptState(created.document.attempts) })
      }
      submission = {
        windowSlotId,
        sourceAttemptId,
        targetLength: draft.targetLength,
        draft: { movement: draft.movement, preservation: draft.preservation, overrides: draft.overrides, ...(draft.anchors !== undefined && draft.anchors.length > 0 ? { anchors: draft.anchors } : {}) },
        // The CALLER's key (the ExtendPanel minted it — the same key must
        // ride the panel's lost-response Retry, so it outlives this call).
        idempotencyKey,
      }
      const submitted = await animationApi.extend(
        { documentId: current.id, windowSlotId, sourceAttemptId, targetLength: draft.targetLength, draft: submission.draft },
        idempotencyKey,
      )
      if (ticket !== openTicket) return nothingFired
      // The attempt row reaches the view through the durable read (the
      // document body moved only when a window minted — already adopted).
      set({ busy: false })
      void get().refresh()
      return { ok: true, attemptId: submitted.attemptId, windowSlotId }
    } catch (error) {
      await failCommand(error, ticket)
      // Only the UNSETTLED POST holds a Retry (Task 6 review M-1, closed
      // Task 7): a failure carrying an HTTP status SETTLED — the server
      // answered (a named 400 refusal, a 409 on the conflict surface), and
      // re-POSTing the same key would repeat exactly that answer. The
      // retryable shape is the network failure after the window resolved —
      // the response never arrived (§7.2.2's lost response), so the record
      // rides out and the panel's Retry re-POSTs the SAME key against the
      // SAME window.
      const unsettled = !(error instanceof AnimationHttpError)
      return { ok: false, submission: unsettled ? submission : null }
    }
  },

  retryExtendSubmission: async (submission) => {
    const current = get().document
    if (!current || get().busy) return null
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      // §4's Retry: the IDENTICAL request — same key, same inputs — so the
      // server's idempotency answers the row its dispatch already gated
      // (created: false) or dispatches the one that never arrived. A fresh
      // key here would mint a duplicate take: exactly the conflation §4
      // forbids.
      const submitted = await animationApi.extend(
        { documentId: current.id, windowSlotId: submission.windowSlotId, sourceAttemptId: submission.sourceAttemptId, targetLength: submission.targetLength, draft: submission.draft },
        submission.idempotencyKey,
      )
      if (ticket !== openTicket) return null
      set({ busy: false })
      void get().refresh()
      return { attemptId: submitted.attemptId, created: submitted.created, windowSlotId: submission.windowSlotId }
    } catch (error) {
      await failCommand(error, ticket)
      return null
    }
  },

  rerollExtension: async (attemptId) => {
    const current = get().document
    if (!current) return null
    const row = current.attempts.find((entry) => entry.attemptId === attemptId) ?? null
    if (row === null || row.extension === undefined) {
      set({ commandError: 'That extension take carries no frozen draft to re-roll from (a row the older build froze) — author a fresh Extend instead.' })
      return null
    }
    // The one-render-per-window guard (the sequence lane's own): a re-roll of
    // THIS window waits for its own landing.
    const inFlight = current.attempts.find((entry) => entry.tool === 'tween' && entry.targetId === row.targetId && IN_FLIGHT.has(entry.execution))
    if (inFlight !== undefined) {
      set({ commandError: 'A take of this window is already in flight — review its landing before generating another.' })
      return null
    }
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      // §4's New alternative: the frozen draft resubmitted BYTE-IDENTICALLY,
      // a fresh key, and an EXPLICIT changed seed — the seed change is part
      // of THIS command, never an implicit re-roll behavior.
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]!
      const submitted = await animationApi.extend(
        {
          documentId: current.id,
          windowSlotId: row.targetId,
          sourceAttemptId: row.extension.sourceAttemptId,
          targetLength: row.extension.targetLength,
          draft: { movement: row.extension.movement, preservation: row.extension.preservation, overrides: row.extension.overrides, ...(row.extension.anchors.length > 0 ? { anchors: row.extension.anchors } : {}) },
        },
        `anim-ext-${row.extension.sourceAttemptId.slice(0, 8)}-${crypto.randomUUID()}`,
        { seed },
      )
      if (ticket !== openTicket) return null
      set({ busy: false })
      void get().refresh()
      return { attemptId: submitted.attemptId, windowSlotId: row.targetId }
    } catch (error) {
      await failCommand(error, ticket)
      return null
    }
  },

  selectWindowCandidate: async (windowSlotId, attemptId) => {
    const current = get().document
    if (!current || get().busy) return false
    const slot = current.body.chains.flatMap((chain) => chain.windows).find((window) => window.id === windowSlotId) ?? null
    if (slot === null) {
      set({ commandError: 'That window slot no longer exists in the document — reload picked up a change.' })
      return false
    }
    if (!slot.attempts.includes(attemptId)) {
      set({ commandError: 'That take is not an alternative of this window — reload picked up a change.' })
      return false
    }
    if (slot.lock) {
      set({ commandError: 'This window is locked — unlock it before changing its selection.' })
      return false
    }
    if (slot.selectedCandidateId === attemptId) return true
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      const view = await animationApi.selectWindowCandidate(current.id, windowSlotId, attemptId, get().document?.revision ?? 0)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  toggleWindowLock: async (windowSlotId, locked) => {
    const current = get().document
    if (!current || get().busy) return false
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      const { document: view } = await animationApi.chainsCommand(current.id, locked ? 'lock' : 'unlock', { windowSlotId }, get().document?.revision ?? 0)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  rebindWindow: async (windowSlotId, sourceAttemptId) => {
    const current = get().document
    if (!current || get().busy) return false
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      // §5 ruling 3: the explicit binding change — a distinct document
      // mutation with its own revision bump and descendant staleness; the
      // NEXT submission into the slot freezes the re-pointed source.
      const { document: view } = await animationApi.chainsCommand(current.id, 'rebind', { windowSlotId, sourceAttemptId }, get().document?.revision ?? 0)
      if (ticket !== openTicket) return false
      set({ document: view, conflict: null, busy: false, attemptState: seedAttemptState(view.attempts) })
      return true
    } catch (error) {
      return failCommand(error, ticket)
    }
  },

  createEmptyDocument: async (projectId) => {
    if (get().busy) return false
    set({ busy: true, commandError: null })
    try {
      const view = await animationApi.createDocument({ projectId, name: 'Untitled animation' })
      // The durable handoff is the address (the workbench arm's own
      // precedent): a full navigation opens the empty session's panel.
      window.location.assign(animationHref(view.projectId || projectId, view.id))
      return true
    } catch (error) {
      set({ busy: false, commandError: error instanceof Error ? error.message : String(error) })
      return false
    }
  },

  retry: async () => {
    const { document, open } = get()
    const params = new URLSearchParams(window.location.search)
    await open(params.get('document') ?? document?.id ?? '', params.get('project') ?? '')
  },

  clearCommandError: () => set({ commandError: null }),
  }
})

/** Resolves once the store stops being busy — task 9's Minor-2 park helper
 *  (fixed in task 13): the debounced intent persist waits here instead of
 *  dropping when another command is mid-flight. Every command clears `busy`
 *  on each outcome path (the shared failCommand arm included), so the wait
 *  is bounded by one command's round trip. */
function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      if (useAnimationSessionStore.getState().busy) return
      unsubscribe()
      resolve()
    }
    const unsubscribe = useAnimationSessionStore.subscribe(finish)
    finish()
  })
}

/** THE CONTINUATION RECONCILE SUBSCRIPTION (Task 6 review I-1): every
 *  document set — open, refresh, every command's landed view — passes
 *  through here, and any attempt row whose ledger entry (a registration
 *  envelope this client already handled) disagrees with the fetched truth is
 *  re-patched in place. This is the narrow one-shot-settlement race's fix:
 *  the attempt-ready refresh that raced the registration write can no longer
 *  revert a `ready` row to `registering` for want of anything that would
 *  re-emit it. Idempotent by construction (the reconciled document satisfies
 *  the ledger, so the re-fired subscription is a no-op). */
useAnimationSessionStore.subscribe((state, previous) => {
  if (state.document === previous.document || state.document === null) return
  const reconciled = reconcileContinuations(state.document)
  if (reconciled !== state.document) useAnimationSessionStore.setState({ document: reconciled })
})

/** The shell's store connection (P07): opens the named document, owns the
 *  fabric subscription for as long as the caller is mounted, and hands back
 *  the document state + the command bag. A view/document switch is a full
 *  navigation (the component remounts), so one open per mount is the
 *  contract — the ticket guard makes even a violated assumption safe. */
export function useAnimationDocument(documentId: string, projectId = '') {
  const session = useAnimationSessionStore()
  useEffect(() => {
    void useAnimationSessionStore.getState().open(documentId, projectId)
  }, [documentId, projectId])
  useEffect(() => {
    return subscribeAnimationEvents((event) => {
      const store = useAnimationSessionStore.getState()
      if (event.type === 'attempt-state') {
        if (store.document?.id === event.documentId) {
          useAnimationSessionStore.setState({ attemptState: event.execution })
          // Task 10 — the status vocabulary drives LIVE: the envelope
          // patches the view's own attempt row in place (execution +
          // progress). An envelope naming an attempt the view has never
          // seen (a submit from another surface) triggers the durable
          // re-read instead — a partial synthesized row would lie about
          // everything but the state.
          const document = store.document
          const known = document.attempts.some((entry) => entry.attemptId === event.attemptId)
          if (known) {
            useAnimationSessionStore.setState({
              document: {
                ...document,
                attempts: document.attempts.map((entry) => entry.attemptId === event.attemptId
                  ? { ...entry, execution: event.execution, ...(event.progress !== undefined ? { progress: event.progress } : {}) }
                  : entry),
              },
            })
          } else {
            void store.refresh()
          }
        }
        return
      }
      if (event.type === 'continuation-state') {
        // The ledger FIRST (Task 6 review I-1): whatever this handler does
        // below, the document-set reconcile must know the newest envelope
        // truth — a racing refresh response (read before the registration
        // write) landing after this patch would otherwise revert the row.
        continuationLedger.set(event.attemptId, event.continuation)
        if (store.document?.id === event.documentId) {
          // The registration envelope patches the row's continuation IN PLACE
          // (the attempt-state patch's own idiom — registration completes
          // after attempt-ready, so nothing else would re-read the row); an
          // unknown attempt triggers the durable re-read instead, never a
          // synthesized partial row.
          const document = store.document
          const known = document.attempts.some((entry) => entry.attemptId === event.attemptId)
          if (known) {
            useAnimationSessionStore.setState({
              document: {
                ...document,
                attempts: document.attempts.map((entry) => entry.attemptId === event.attemptId
                  ? { ...entry, continuation: event.continuation }
                  : entry),
              },
            })
          } else {
            void store.refresh()
          }
        }
        return
      }
      if (event.type === 'resync') {
        void store.refresh()
        return
      }
      // document-changed: an authoring command landed elsewhere. attempt-
      // ready: landing appends a candidate WITHOUT a revision bump, so no
      // document-changed follows it — both re-run the durable read.
      // 'reconciliation' rides beside its own attempt-state envelope (the
      // emitter sends both), which already flipped the attribute above.
      if ((event.type === 'document-changed' || event.type === 'attempt-ready') && store.document?.id === event.documentId) void store.refresh()
    })
  }, [])
  return {
    ...session,
    revision: session.document?.revision ?? 0,
    commands: {
      updateBinding: session.updateBinding,
      importImages: session.importImages,
      importKeyCandidate: session.importKeyCandidate,
      selectKeyCandidate: session.selectKeyCandidate,
      seedInitialKey: session.seedInitialKey,
      toggleKeyLock: session.toggleKeyLock,
      updateSpanIntent: session.updateSpanIntent,
      setKeyFacing: session.setKeyFacing,
      submitTweenStep: session.submitTweenStep,
      selectReferenceFrame: session.selectReferenceFrame,
      annotateRollingReference: session.annotateRollingReference,
      continueChain: session.continueChain,
      rerollStep: session.rerollStep,
      retryPreparation: session.retryPreparation,
      submitHero: session.submitHero,
      acceptHeroFrame: session.acceptHeroFrame,
      rerollHero: session.rerollHero,
      openSpanIntoKey: session.openSpanIntoKey,
      submitSequence: session.submitSequence,
      rerollSequence: session.rerollSequence,
      contributeClip: session.contributeClip,
      reorderContributions: session.reorderContributions,
      removeContribution: session.removeContribution,
      exportSequence: session.exportSequence,
      extendTake: session.extendTake,
      retryExtendSubmission: session.retryExtendSubmission,
      rerollExtension: session.rerollExtension,
      selectWindowCandidate: session.selectWindowCandidate,
      toggleWindowLock: session.toggleWindowLock,
      rebindWindow: session.rebindWindow,
      createEmptyDocument: session.createEmptyDocument,
      retry: session.retry,
      clearCommandError: session.clearCommandError,
    },
  }
}
