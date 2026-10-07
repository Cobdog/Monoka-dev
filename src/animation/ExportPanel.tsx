/**
 * ExportPanel — the animation module's delivery surface (task 14, k2q0n9s,
 * spec 2026-10-06-animation-authoring-module-design.md §9 "Export (in
 * scope)" + §11.3 the export packaging decision): ONE review package, a ZIP
 * carrying `sequence.mp4` (silent H.264, constant 24 fps, the document's
 * output dimensions) and `manifest.json` (the versioned assembly recipe —
 * source ids + hashes, frame ranges, holds, binding history, contributing
 * attempt snapshots + lineage).
 *
 * Integrity as the USER sees it (§11.3): the export FREEZES the document
 * truth before assembly, so editing while an export runs is safe (the
 * button is never blocked by authoring, and authoring is never blocked by
 * it); missing or incompatible selected media fails LOUDLY with the named
 * contribution (the error surface below); a stale-but-usable sequence
 * exports only past the EXPLICIT acknowledgment — the prompt lists every
 * stale selection by name, the checkbox acknowledges, and the manifest
 * records the staleness.
 *
 * Props-only (P07): every connection lives in ./state.ts; the export
 * command owns its phase there (`busy` is deliberately untouched — the
 * frozen snapshot makes concurrent authoring safe by design).
 */
import { useState } from 'react'
import { Button } from '../ui/Button'
import type { AnimationExportStalePrompt } from './client'
import type { AssembledSequence } from './timelineModel'

export type ExportPanelProps = {
  /** The assembled-sequence truth (timelineModel.deriveAssembledSequence) —
   *  the totals the package will carry, and the problems the gate refuses. */
  assembled: AssembledSequence
  exportPhase: 'idle' | 'running' | 'done'
  exportError: string | null
  exportStale: AnimationExportStalePrompt[] | null
  lastExportName: string | null
  /** The export command; `acknowledgeStale` rides the §11.3 acknowledgment. */
  onExport(acknowledgeStale: boolean): void
}

export function ExportPanel({ assembled, exportPhase, exportError, exportStale, lastExportName, onExport }: ExportPanelProps) {
  const [acknowledge, setAcknowledge] = useState(false)
  const running = exportPhase === 'running'
  const empty = assembled.contributions.length === 0
  return (
    <section className="anim-export" data-anim-export aria-labelledby="anim-export-title" data-anim-export-phase={exportPhase}>
      <header className="anim-editorial-header">
        <h3 id="anim-export-title">Export — the review package</h3>
        <span className="anim-editorial-total" data-anim-export-summary>
          {empty ? 'nothing assembled' : `${assembled.totalFrames} frames — ${(assembled.totalFrames / assembled.fps).toFixed(1)} s at ${assembled.fps} fps`}
        </span>
      </header>
      <p className="anim-inspector-lede">
        One ZIP: <code>sequence.mp4</code> (silent H.264, constant 24 fps, the document&rsquo;s output dimensions) plus <code>manifest.json</code> (the versioned assembly recipe with sources, hashes, and lineage). The document is frozen the moment the export starts — edits during assembly cannot change the package.
      </p>

      {empty && (
        <p className="anim-note" data-anim-export-empty>Nothing is assembled yet — contribute landed clips above before exporting.</p>
      )}
      {assembled.problems.length > 0 && (
        <p className="anim-note anim-inspector-error" role="alert" data-anim-export-blocked>
          The assembled sequence has {assembled.problems.length} problem{assembled.problems.length === 1 ? '' : 's'} (listed above) — the export gate refuses them rather than shipping a package that silently drops media.
        </p>
      )}

      {/* The §11.3 acknowledgment prompt: every stale-but-usable selection
          named, the explicit checkbox, the retry that carries it. */}
      {exportStale !== null && exportStale.length > 0 && (
        <div className="anim-export-stale" data-anim-export-stale role="alert">
          <p>
            <strong>{exportStale.length} stale-but-usable selection{exportStale.length === 1 ? '' : 's'}.</strong> They export only past an explicit acknowledgment, and the manifest records them as stale:
          </p>
          <ul className="anim-caption-hints">
            {exportStale.map((entry) => (
              <li key={entry.contributionId} className="anim-caption-hint" data-anim-export-stale-row={entry.contributionId}>
                {entry.label} — stale: {entry.reasons.join(', ')}
              </li>
            ))}
          </ul>
          <label className="anim-export-ack">
            <input
              type="checkbox"
              data-anim-export-ack-check
              checked={acknowledge}
              disabled={running}
              onChange={(event) => setAcknowledge(event.target.checked)}
            />
            <span>I acknowledge: export the stale selections and record them stale in the manifest.</span>
          </label>
        </div>
      )}

      <div className="anim-export-actions">
        <Button
          variant="primary"
          busy={running}
          disabled={running || empty || assembled.problems.length > 0}
          className="anim-export-button"
          data-anim-export-submit
          title="Assemble the review package (sequence.mp4 + manifest.json in one ZIP) and download it"
          onClick={() => onExport(false)}
        >
          Export review package
        </Button>
        {exportStale !== null && exportStale.length > 0 && (
          <Button
            variant="secondary"
            busy={running}
            disabled={running || !acknowledge}
            className="anim-export-button"
            data-anim-export-submit-ack
            title="Export anyway, recording the acknowledged stale selections in the manifest (§11.3)"
            onClick={() => onExport(true)}
          >
            Export with acknowledgment
          </Button>
        )}
      </div>

      {exportPhase === 'done' && lastExportName !== null && (
        <p className="anim-note" role="status" data-anim-export-done>
          Downloaded <code>{lastExportName}</code> — sequence.mp4 + manifest.json.
        </p>
      )}
      {exportError !== null && (
        <p className="anim-note anim-inspector-error" role="alert" data-anim-export-error>The export failed: {exportError}</p>
      )}
    </section>
  )
}
