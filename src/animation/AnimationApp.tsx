/**
 * AnimationApp — the animation module's shell (task 6, k2q0n9s, spec
 * 2026-10-06-animation-authoring-module-design.md §11.1 the route decision):
 * a Workbench SUBVIEW at /?images=1&view=animation&project=<id>&document=<id>,
 * lazy-loaded by the Workbench host branch — NOT a registry entry (the
 * images id and its bookmarks stay; the registry is untouched).
 *
 * The shell owns three things; Phase B's surfaces mount inside it:
 *   - DOCUMENT LOAD through the typed client — the durable recovery read
 *     (§7.2.1), never callback-chained state. A missing or invalid document
 *     id renders the RECOVERABLE document-selection state (§11.1): a named
 *     heading, the stale id named, the project's other animation documents
 *     as pick rows, and a back-to-workbench link — never a crash, never a
 *     blank, never a silently created replacement.
 *   - THE FABRIC SUBSCRIPTION (fabric.ts): attempt-state envelopes for the
 *     open document drive the shell's data-attempt-state (the e2e pin);
 *     document-changed / attempt-ready (landing mutates the body without a
 *     revision bump) and the resync notice re-run the durable read. A failed
 *     silent refresh is SURFACED, never dropped — the shell keeps the last
 *     good document and names the refresh failure.
 *   - THE HANDOFF TARGET: the URL identifies the document and the payload
 *     lives in the shared store (§11.1) — the Workbench exit creates the
 *     document through animationApi.createDocument and points here; nothing
 *     here reads localStorage.
 */
import { useCallback, useEffect, useState } from 'react'
import { Clapperboard, LoaderCircle } from 'lucide-react'
import { SurfaceSwitcher } from '../surfaces/SurfaceSwitcher'
import { animationApi, AnimationHttpError, type AnimationDocumentView } from './client'
import { subscribeAnimationEvents } from './fabric'
import type { AttemptExecutionState } from '../../shared/animation/types'
import './animation.css'

/** The states whose engine-side truth is not settled — the shell's seeded
 *  attribute prefers the newest of these over an older terminal one, so a
 *  reopening editor sees live work first (§7.3's during-the-wait surface). */
const IN_FLIGHT: ReadonlySet<AttemptExecutionState> = new Set(['queued', 'rendering', 'preparing', 'reconciling'])

/** The shell's seeded attempt state from the recovery read: the newest
 *  in-flight attempt, else the newest attempt's terminal state, else null. */
function seedAttemptState(attempts: AnimationDocumentView['attempts']): AttemptExecutionState | null {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (IN_FLIGHT.has(attempts[index].execution)) return attempts[index].execution
  }
  return attempts.length > 0 ? attempts[attempts.length - 1].execution : null
}

/** The module's URL (§11.1's route): one helper, so every internal
 *  navigation lands the exact shape the host branch matches. Module-local
 *  until a second consumer exists (the fast-refresh rule keeps component
 *  files component-only). */
function animationHref(projectId: string, documentId: string): string {
  return `/?images=1&view=animation&project=${encodeURIComponent(projectId)}&document=${encodeURIComponent(documentId)}`
}

/** The discriminated shell state — 'ready' always carries the document. */
type ShellState =
  | { phase: 'loading' }
  | { phase: 'missing' }
  | { phase: 'error'; detail: string }
  | { phase: 'ready'; document: AnimationDocumentView }

/** The selection state's document list: null = never fetched (no project
 *  named), 'failed' = the listing itself failed (named, never silent). */
type DocumentList = Array<{ id: string; name: string; updatedAt: number }> | 'failed' | null

export function AnimationApp() {
  // Read once per mount: a view or document switch is a full navigation
  // (the registry's own precedent), so the component remounts.
  const [params] = useState(() => new URLSearchParams(window.location.search))
  const projectId = params.get('project') ?? ''
  const documentId = params.get('document') ?? ''
  const [shell, setShell] = useState<ShellState>({ phase: 'loading' })
  const [attemptState, setAttemptState] = useState<AttemptExecutionState | null>(null)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [projectDocuments, setProjectDocuments] = useState<DocumentList>(null)

  const load = useCallback(async (silent: boolean): Promise<void> => {
    if (!silent) setShell({ phase: 'loading' })
    if (documentId) {
      try {
        const view = await animationApi.getDocument(documentId)
        setShell({ phase: 'ready', document: view })
        setRefreshFailed(false)
        setAttemptState(seedAttemptState(view.attempts))
        return
      } catch (error) {
        if (!(error instanceof AnimationHttpError && error.status === 404)) {
          if (silent) {
            // A silent refresh failure never blanks the loaded document: the
            // shell keeps the last good read and names the failure.
            setRefreshFailed(true)
            return
          }
          setShell({ phase: 'error', detail: error instanceof Error ? error.message : String(error) })
          return
        }
        // 404 — the recoverable selection state (a removed document or a
        // stale address), never a silently created replacement.
      }
    }
    setShell({ phase: 'missing' })
    // The selection state's recovery list.
    setProjectDocuments(null)
    if (!projectId) return
    try {
      setProjectDocuments(await animationApi.listDocuments(projectId))
    } catch {
      setProjectDocuments('failed')
    }
  }, [documentId, projectId])

  useEffect(() => {
    void load(false)
  }, [load])

  // The fabric subscription — the shell's realtime half. The unsubscribe on
  // unmount drops the channel when the module is the last listener.
  useEffect(() => {
    return subscribeAnimationEvents((event) => {
      if (event.type === 'attempt-state') {
        if (event.documentId === documentId) setAttemptState(event.execution)
        return
      }
      if (event.type === 'resync') {
        void load(true)
        return
      }
      // document-changed: an authoring command landed elsewhere. attempt-
      // ready: landing appends a candidate WITHOUT a revision bump, so no
      // document-changed follows it — both re-run the durable read.
      // 'reconciliation' rides beside its own attempt-state envelope (the
      // emitter sends both), which already flipped the attribute above.
      if ((event.type === 'document-changed' || event.type === 'attempt-ready') && event.documentId === documentId) void load(true)
    })
  }, [documentId, load])

  if (shell.phase === 'loading') {
    return (
      <div className="anim-root anim-boot" data-anim-root>
        <header className="anim-titlebar"><SurfaceSwitcher /><strong className="anim-brand"><Clapperboard size={14} /> Animation</strong></header>
        <div className="anim-boot-body"><LoaderCircle className="spin" /><span>Opening the animation document…</span></div>
      </div>
    )
  }

  if (shell.phase === 'missing') {
    return (
      <div className="anim-root" data-anim-root>
        <header className="anim-titlebar"><SurfaceSwitcher /><strong className="anim-brand"><Clapperboard size={14} /> Animation</strong></header>
        <main className="anim-body">
          <section className="anim-select" data-anim-select aria-labelledby="anim-select-title">
            <h2 id="anim-select-title">Choose an animation document</h2>
            <p data-anim-select-reason>
              {documentId
                ? <>The document named in this address (<code>{documentId}</code>) does not exist — it may have been removed, or the address is stale.</>
                : 'This address names no animation document.'}
            </p>
            <a className="anim-back" href="/?images=1" data-anim-back>← Back to the image workbench</a>
            {projectDocuments === 'failed' && <p className="anim-note" role="status">This project's animation documents could not be listed — the heading and the way back stand.</p>}
            {Array.isArray(projectDocuments) && projectDocuments.length === 0 && <p className="anim-note">No animation documents in this project yet.</p>}
            {Array.isArray(projectDocuments) && projectDocuments.length > 0 && (
              <ul className="anim-docs" data-anim-docs>
                {projectDocuments.map((row) => (
                  <li key={row.id}>
                    <a href={animationHref(projectId, row.id)} data-anim-pick-document={row.id}>{row.name}</a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    )
  }

  if (shell.phase === 'error') {
    return (
      <div className="anim-root" data-anim-root>
        <header className="anim-titlebar"><SurfaceSwitcher /><strong className="anim-brand"><Clapperboard size={14} /> Animation</strong></header>
        <main className="anim-body">
          <section className="anim-select" data-anim-error aria-labelledby="anim-error-title">
            <h2 id="anim-error-title">This animation document could not be opened</h2>
            <p>{shell.detail} — retrying the read never replaces anything.</p>
            <button type="button" data-anim-retry onClick={() => void load(false)}>Retry the read</button>
            <a className="anim-back" href="/?images=1" data-anim-back>← Back to the image workbench</a>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="anim-root" data-anim-root data-anim-document={shell.document.id} data-attempt-state={attemptState ?? undefined}>
      <header className="anim-titlebar">
        <SurfaceSwitcher />
        <strong className="anim-brand"><Clapperboard size={14} /> Animation</strong>
        <span className="anim-doc-name" data-anim-document-name>{shell.document.name}</span>
        <span className="anim-revision" data-anim-revision title="The authored revision — every command is expectedRevision-gated against it">rev {shell.document.revision}</span>
        <a className="anim-back" href="/?images=1" data-anim-back>workbench</a>
      </header>
      <main className="anim-body">
        {refreshFailed && (
          <p className="anim-note" role="status" data-anim-refresh-failed>This document changed but the fresh read failed — the view may be stale until the next event or reload.</p>
        )}
        {/* Phase B's home: the timeline (keys, spans, step slots) mounts in
            this stage; the shell owns only the document + event plumbing. */}
        <section className="anim-stage" data-anim-stage>
          <p>The animation workspace for this document loads here — key slots, spans, and attempt review land with the module's next task.</p>
        </section>
      </main>
    </div>
  )
}
