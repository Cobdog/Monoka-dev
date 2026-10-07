/**
 * AnimationApp — the animation module's shell (task 6, k2q0n9s, spec
 * 2026-10-06-animation-authoring-module-design.md §11.1 the route decision):
 * a Workbench SUBVIEW at /?images=1&view=animation&project=<id>&document=<id>,
 * lazy-loaded by the Workbench host branch — NOT a registry entry (the
 * images id and its bookmarks stay; the registry is untouched).
 *
 * Since task 7 the shell is PRESENTATIONAL (P07): every connection — the
 * durable recovery read, the fabric subscription, the command surface —
 * lives in ./state.ts's `useAnimationDocument`; this file renders what the
 * adapter hands it:
 *   - the loading / recoverable-selection / error arms around the document
 *     read (§11.1: a named heading, the stale id named, the project's other
 *     animation documents as pick rows, a back-to-workbench link — never a
 *     crash, never a blank, never a silently created replacement);
 *   - an UNBOUND document renders the session binding panel (§4.1) in the
 *     workspace — the missing inputs inline, the rest of the shell standing;
 *   - a BOUND document renders the versioned binding summary (§4.2, the
 *     description VERBATIM) above the timeline stage — Task 8's mount point;
 *   - the conflict rebase notice (a 409 is never silent) and the failed
 *     silent-refresh notice, both role=status.
 */
import { useState } from 'react'
import { Clapperboard, LoaderCircle } from 'lucide-react'
import { SurfaceSwitcher } from '../surfaces/SurfaceSwitcher'
import { animationHref } from './client'
import { BindingPanel } from './BindingPanel'
import { useAnimationDocument } from './state'
import './animation.css'

export function AnimationApp() {
  // Read once per mount: a view or document switch is a full navigation
  // (the registry's own precedent), so the component remounts.
  const [params] = useState(() => {
    const search = new URLSearchParams(window.location.search)
    return { documentId: search.get('document') ?? '', projectId: search.get('project') ?? '' }
  })
  const session = useAnimationDocument(params.documentId, params.projectId)
  const { phase, errorDetail, document, projectDocuments, assets, assetsFailed, conflict, busy, commandError, refreshFailed } = session

  const activeBinding = document
    ? (document.body.bindingHistory.find((entry) => entry.version === document.body.activeBindingVersion) ?? null)
    : null

  if (phase === 'loading') {
    return (
      <div className="anim-root anim-boot" data-anim-root>
        <header className="anim-titlebar"><SurfaceSwitcher /><strong className="anim-brand"><Clapperboard size={14} /> Animation</strong></header>
        <div className="anim-boot-body"><LoaderCircle className="spin" /><span>Opening the animation document…</span></div>
      </div>
    )
  }

  if (phase === 'missing') {
    return (
      <div className="anim-root" data-anim-root>
        <header className="anim-titlebar"><SurfaceSwitcher /><strong className="anim-brand"><Clapperboard size={14} /> Animation</strong></header>
        <main className="anim-body">
          <section className="anim-select" data-anim-select aria-labelledby="anim-select-title">
            <h2 id="anim-select-title">Choose an animation document</h2>
            <p data-anim-select-reason>
              {params.documentId
                ? <>The document named in this address (<code>{params.documentId}</code>) does not exist — it may have been removed, or the address is stale.</>
                : 'This address names no animation document.'}
            </p>
            <a className="anim-back" href="/?images=1" data-anim-back>← Back to the image workbench</a>
            {projectDocuments === 'failed' && <p className="anim-note" role="status">This project's animation documents could not be listed — the heading and the way back stand.</p>}
            {Array.isArray(projectDocuments) && projectDocuments.length === 0 && <p className="anim-note">No animation documents in this project yet.</p>}
            {Array.isArray(projectDocuments) && projectDocuments.length > 0 && (
              <ul className="anim-docs" data-anim-docs>
                {projectDocuments.map((row) => (
                  <li key={row.id}>
                    <a href={animationHref(params.projectId, row.id)} data-anim-pick-document={row.id}>{row.name}</a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="anim-root" data-anim-root>
        <header className="anim-titlebar"><SurfaceSwitcher /><strong className="anim-brand"><Clapperboard size={14} /> Animation</strong></header>
        <main className="anim-body">
          <section className="anim-select" data-anim-error aria-labelledby="anim-error-title">
            <h2 id="anim-error-title">This animation document could not be opened</h2>
            <p>{errorDetail} — retrying the read never replaces anything.</p>
            <button type="button" data-anim-retry onClick={() => void session.commands.retry()}>Retry the read</button>
            <a className="anim-back" href="/?images=1" data-anim-back>← Back to the image workbench</a>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="anim-root" data-anim-root data-anim-document={document!.id} data-attempt-state={session.attemptState ?? undefined}>
      <header className="anim-titlebar">
        <SurfaceSwitcher />
        <strong className="anim-brand"><Clapperboard size={14} /> Animation</strong>
        <span className="anim-doc-name" data-anim-document-name>{document!.name}</span>
        <span className="anim-revision" data-anim-revision title="The authored revision — every command is expectedRevision-gated against it">rev {document!.revision}</span>
        <a className="anim-back" href="/?images=1" data-anim-back>workbench</a>
      </header>
      <main className="anim-body">
        {refreshFailed && (
          <p className="anim-note" role="status" data-anim-refresh-failed>This document changed but the fresh read failed — the view may be stale until the next event or reload.</p>
        )}
        {conflict && (
          <p className="anim-note anim-conflict" role="status" data-anim-conflict>
            This document changed while the binding was being written (the server is now at revision {conflict.currentRevision}) — the fresh copy is loaded; submit again if the binding is still wanted. {conflict.message}
          </p>
        )}
        {activeBinding ? (
          <>
            {/* The versioned binding summary (§4.2): the description is
                retained VERBATIM — editing the source character later never
                silently changes a bound session. */}
            <section className="anim-bound" data-anim-bound-version data-anim-bound-version-n={activeBinding.version} aria-label="The bound session">
              <header>
                <strong>Bound — version {activeBinding.version}</strong>
                <span>{activeBinding.medium}</span>
                <span>{activeBinding.referenceAssetIds.length} {activeBinding.referenceAssetIds.length === 1 ? 'reference' : 'references'}</span>
              </header>
              <p data-anim-bound-description>{activeBinding.characterDescription}</p>
            </section>
            {/* Phase B's home: the timeline (keys, spans, step slots) mounts in
                this stage; the shell owns only the document + event plumbing. */}
            <section className="anim-stage" data-anim-stage>
              <p>The animation workspace for this document loads here — key slots, spans, and attempt review land with the module's next task.</p>
            </section>
          </>
        ) : (
          <BindingPanel
            document={document!}
            assets={assets}
            assetsFailed={assetsFailed}
            onImportFiles={session.commands.importImages}
            onSubmitBinding={session.commands.updateBinding}
            busy={busy}
            errors={commandError ? { submit: commandError } : undefined}
          />
        )}
      </main>
    </div>
  )
}
