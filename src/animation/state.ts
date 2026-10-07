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
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import { animationApi, AnimationConflict, AnimationHttpError, type AnimationDocumentView } from './client'
import { subscribeAnimationEvents } from './fabric'
import { documentsApi } from '../canvas/api'
import type { AttemptExecutionState, BindingInput } from '../../shared/animation/types'

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

export const useAnimationSessionStore = create<AnimationSessionState>()((set, get) => ({
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
      if (ticket !== openTicket) return false
      if (error instanceof AnimationConflict) {
        // The rebase surface: name the conflict, then re-read the server's
        // current document — the caller decides whether to re-issue on the
        // fresh revision. Never silent, never a blind re-POST.
        set({ conflict: { message: error.message, currentRevision: error.currentRevision }, busy: false })
        await get().refresh()
        return false
      }
      set({ busy: false, commandError: error instanceof Error ? error.message : String(error) })
      return false
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

  retry: async () => {
    const { document, open } = get()
    const params = new URLSearchParams(window.location.search)
    await open(params.get('document') ?? document?.id ?? '', params.get('project') ?? '')
  },

  clearCommandError: () => set({ commandError: null }),
}))

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
      retry: session.retry,
      clearCommandError: session.clearCommandError,
    },
  }
}
