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
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import { animationApi, animationHref, AnimationConflict, AnimationHttpError, type AnimationDocumentView } from './client'
import { subscribeAnimationEvents } from './fabric'
import { documentsApi } from '../canvas/api'
import type { AssetReference, AttemptExecutionState, BindingInput, FacingTerm } from '../../shared/animation/types'
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
  projectDocuments: AnimationDocumentList
  assets: AnimationAssetPick[]
  assetsFailed: boolean
  open(documentId: string, projectId: string): Promise<void>
  /** The silent re-read (fabric-driven): keeps the last good document on
   *  failure and names it through `refreshFailed`. */
  refresh(): Promise<void>
  updateBinding(binding: BindingInput): Promise<boolean>
  importImages(files: File[]): Promise<AnimationImportedImage[]>
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
  /** Submits one tween step: flushes the intent, resolves the target step
   *  slot from the live document, submits the draft (a fresh idempotency key
   *  per deliberate click). Null = the failure surface already names it. */
  submitTweenStep(spanId: string, draft: { movement: string; preservation: string; overrides: SessionOverrideInput }): Promise<{ attemptId: string } | null>
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
 *  rolling reference — never a frozen copy of the original endpoint). */
export type TweenRefSource =
  | { kind: 'start-key'; keyId: string; keyOrder: number }
  | { kind: 'promoted-frame'; stepIndex: number; attemptId: string; frameIndex: number }

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
 *  target slot (its pose belongs to the frame, and this build's frames carry
 *  none — the same nulls the server freezes), falling back to the span's
 *  start key's selected candidate (pose follows the image, §5.1); the far
 *  reference is always the destination key's selected candidate. A step
 *  whose selected attempt has NOT landed stops the walk with a named
 *  problem — the server refuses that submission with the same name, and the
 *  preview must never silently skip past an explicit selection. */
export function deriveTweenPreview(document: AnimationDocumentView, spanId: string): TweenPreview {
  const span = document.body.spans.find((entry) => entry.id === spanId) ?? null
  if (span === null) {
    const problem = 'This span no longer exists in the document.'
    return { spanId, stepCount: 0, targetStepSlotId: null, rollingReference: { ok: false, problem }, farReference: { ok: false, problem }, problems: [problem] }
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
  let rolling: TweenRef | null = null
  for (let index = span.stepSlots.length - 2; index >= 0; index -= 1) {
    const selected = span.stepSlots[index]?.selectedRollingReference
    if (!selected) continue
    const attempt = document.attempts.find((entry) => entry.attemptId === selected.attemptId) ?? null
    if (attempt === null || attempt.candidate === null) {
      rolling = { ok: false, problem: `The rolling reference attempt ${selected.attemptId} holds no landed clip yet — step ${index + 1}'s promoted frame is not reviewable.` }
      break
    }
    rolling = {
      ok: true,
      assetReference: attempt.candidate.assetReference,
      pose: { poseDescription: null, facing: null },
      source: { kind: 'promoted-frame', stepIndex: index, attemptId: selected.attemptId, frameIndex: selected.frameIndex },
    }
    break
  }

  const rollingReference = rolling ?? keyRef(span.fromKeyId, 'The start')
  const farReference = keyRef(span.toKeyId, 'The destination')
  const problems: string[] = []
  if (!rollingReference.ok) problems.push(rollingReference.problem)
  if (!farReference.ok) problems.push(farReference.problem)
  const lastSlot = span.stepSlots[span.stepSlots.length - 1] ?? null
  return { spanId, stepCount: span.stepSlots.length, targetStepSlotId: lastSlot === null ? null : lastSlot.id, rollingReference, farReference, problems }
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
  projectDocuments: null,
  assets: [],
  assetsFailed: false,

  open: async (documentId, projectId) => {
    const ticket = ++openTicket
    set({ phase: 'loading', errorDetail: '', document: null, attemptState: null, refreshFailed: false, conflict: null, busy: false, commandError: null, projectDocuments: null, assets: [], assetsFailed: false })
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
    if (!current || get().busy) return false
    const ticket = openTicket
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

  submitTweenStep: async (spanId, draft) => {
    const current = get().document
    if (!current || get().busy) return null
    if (!draft.movement.trim()) {
      set({ commandError: 'The movement step needs text before submission.' })
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
    const preview = deriveTweenPreview(fresh, spanId)
    if (preview.targetStepSlotId === null || !preview.rollingReference.ok || !preview.farReference.ok) {
      set({ commandError: preview.problems.join(' ') || 'The tween references are not resolvable.' })
      return null
    }
    const ticket = openTicket
    set({ busy: true, commandError: null })
    try {
      // A fresh idempotency key per deliberate click — §7.2.2's retry key
      // belongs to a LOST RESPONSE, never to a user's explicit re-roll.
      const submitted = await animationApi.submit({
        documentId: fresh.id,
        tool: 'tween',
        targetId: preview.targetStepSlotId,
        draft: { tool: 'tween', targetStepSlotId: preview.targetStepSlotId, movementStep: draft.movement, overrides: draft.overrides },
      }, `anim-tween-${spanId.slice(0, 8)}-${crypto.randomUUID()}`)
      if (ticket !== openTicket) return null
      // The attempt's state arrives through the fabric (attempt-state
      // envelopes); the document itself did not move (attempt rows carry
      // their own revision, §11.2).
      set({ busy: false })
      return { attemptId: submitted.attemptId }
    } catch (error) {
      await failCommand(error, ticket)
      return null
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
        if (store.document?.id === event.documentId) useAnimationSessionStore.setState({ attemptState: event.execution })
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
      seedInitialKey: session.seedInitialKey,
      toggleKeyLock: session.toggleKeyLock,
      updateSpanIntent: session.updateSpanIntent,
      setKeyFacing: session.setKeyFacing,
      submitTweenStep: session.submitTweenStep,
      createEmptyDocument: session.createEmptyDocument,
      retry: session.retry,
      clearCommandError: session.clearCommandError,
    },
  }
}
