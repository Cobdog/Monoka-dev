/**
 * EditorialPanel — the animation module's editorial timing surface (task 13,
 * k2q0n9s, spec 2026-10-06-animation-authoring-module-design.md §9 editorial
 * timing and export + §11.3 the export conventions): the ASSEMBLY layer,
 * where the user decides which portions of generated clips contribute to the
 * sequence, how long the held frames last, and in what order the
 * contributions assemble. Every write is an assembly decision — no
 * generation-time promises, nothing marks stale (§9).
 *
 * Three surfaces in one panel:
 *   - the AVAILABLE CLIPS — every landed tween step (through its span) and
 *     every landed sequence window take (spanless), each with its own
 *     in/out/hold fields and an "Add" action. Older windows' takes live here
 *     too (task 12's Important-1: they were unreachable from the review
 *     surface; the editorial lane is their durable home);
 *   - the ORDERED CONTRIBUTION LIST — the document's editorial list in
 *     order, each row naming its clip source, its selected range
 *     ([inFrame, outFrame) — start-inclusive, end-exclusive, integer frames),
 *     its hold in OUTPUT frames, its computed span within the assembled
 *     sequence, and the reorder / remove / re-choose actions;
 *   - the ASSEMBLED-SEQUENCE PREVIEW — the frame-indexed strip: one block
 *     per contribution, sized by its output frames, in list order, with the
 *     whole sequence's frame total and duration at the document's constant
 *     frame rate (§11.3: the UI may display seconds).
 *
 * A degenerate range (outFrame ≤ inFrame) is legal and meaningful — it
 * contributes no clip frames, only the hold: a held drawing (§11.3's drawing
 * holds; the schema's header states the ordering is deliberately unchecked).
 * The row names it instead of hiding it. An out-of-range selection or an
 * unlanded clip is a NAMED problem (§11.3 rejects rather than silently
 * dropping), never a silent clamp.
 *
 * Props-only (P07): every connection lives in ./state.ts; the derivations
 * (clips, assembled) are timelineModel.ts's pure functions.
 */
import { useState } from 'react'
import { Button } from '../ui/Button'
import type { AssembledContribution, AssembledSequence, ContributableClip } from './timelineModel'

/** One in/out/hold field triple (the range editors share it): strings while
 *  being typed, parsed to non-negative integers on commit — a half-typed
 *  "-3" is an INVALID draft that disables the action, never a coerced 0. */
type FramesDraft = { inFrame: string; outFrame: string; holdDuration: string }

const draftOf = (draft: FramesDraft | undefined, fallback: FramesDraft): FramesDraft => draft ?? fallback

const parseFrames = (value: string): number | null => {
  if (!/^\d+$/.test(value.trim())) return null
  const parsed = Number.parseInt(value.trim(), 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}

const validDraft = (draft: FramesDraft): { inFrame: number; outFrame: number; holdDuration: number } | null => {
  const inFrame = parseFrames(draft.inFrame)
  const outFrame = parseFrames(draft.outFrame)
  const holdDuration = parseFrames(draft.holdDuration)
  if (inFrame === null || outFrame === null || holdDuration === null) return null
  return { inFrame, outFrame, holdDuration }
}

/** The three number inputs (in / out / hold). Static data attributes — the
 *  caller's container locator scopes them (a row or an available clip). */
function FramesFields({ draft, onChange, disabled }: {
  draft: FramesDraft
  onChange(next: FramesDraft): void
  disabled: boolean
}) {
  return (
    <>
      <label className="anim-editorial-field">
        <span>in</span>
        <input
          className="anim-editorial-num"
          data-anim-editorial-in
          type="number"
          min={0}
          step={1}
          disabled={disabled}
          value={draft.inFrame}
          onChange={(event) => onChange({ ...draft, inFrame: event.target.value })}
        />
      </label>
      <label className="anim-editorial-field">
        <span>out</span>
        <input
          className="anim-editorial-num"
          data-anim-editorial-out
          type="number"
          min={0}
          step={1}
          disabled={disabled}
          value={draft.outFrame}
          onChange={(event) => onChange({ ...draft, outFrame: event.target.value })}
        />
      </label>
      <label className="anim-editorial-field">
        <span>hold</span>
        <input
          className="anim-editorial-num"
          data-anim-editorial-hold
          type="number"
          min={0}
          step={1}
          disabled={disabled}
          value={draft.holdDuration}
          onChange={(event) => onChange({ ...draft, holdDuration: event.target.value })}
        />
      </label>
    </>
  )
}

export type EditorialPanelProps = {
  /** The landed, contributable clips (timelineModel.deriveContributableClips). */
  clips: ContributableClip[]
  /** The assembled sequence (timelineModel.deriveAssembledSequence). */
  assembled: AssembledSequence
  busy: boolean
  /** The §9 selection: a clip's portion + hold rides the document (the
   *  tween lane names its span; the sequence lane is spanless). */
  onContribute(spanId: string | null, attemptId: string, inFrame: number, outFrame: number, holdDuration: number): void
  /** The §9 reorder — the full new order. */
  onReorder(orderedIds: string[]): void
  /** The removal — the list is an authored document, never append-only. */
  onRemove(contributionId: string): void
}

export function EditorialPanel({ clips, assembled, busy, onContribute, onReorder, onRemove }: EditorialPanelProps) {
  // Per-row and per-clip draft inputs — seeded lazily from the durable truth,
  // keyed by contribution id / attempt id so document refreshes never clobber
  // typing.
  const [rowDrafts, setRowDrafts] = useState<Record<string, FramesDraft>>({})
  const [addDrafts, setAddDrafts] = useState<Record<string, FramesDraft>>({})

  const move = (from: number, to: number) => {
    if (to < 0 || to >= assembled.contributions.length) return
    const ids = assembled.contributions.map((entry) => entry.contributionId)
    const moved = ids.splice(from, 1)[0]!
    ids.splice(to, 0, moved)
    onReorder(ids)
  }

  return (
    <section className="anim-editorial" data-anim-editorial aria-labelledby="anim-editorial-title">
      <header className="anim-editorial-header">
        <h3 id="anim-editorial-title">Editorial timing — the assembled sequence</h3>
        <span className="anim-editorial-total" data-anim-editorial-total>
          {assembled.contributions.length === 0
            ? 'empty'
            : `${assembled.totalFrames} frames — ${(assembled.totalFrames / assembled.fps).toFixed(1)} s at ${assembled.fps} fps`}
        </span>
      </header>
      <p className="anim-inspector-lede">
        Which portions of the landed clips contribute, how long each hold lasts, and the order they assemble in — assembly decisions only (§9): nothing here re-renders or marks anything stale.
      </p>

      {/* The assembled-sequence preview: one block per contribution, sized by
          its output frames, in list order. */}
      {assembled.contributions.length > 0 ? (
        <div className="anim-editorial-strip" data-anim-editorial-strip role="img" aria-label="The assembled sequence, one block per contribution, sized by output frames">
          {assembled.contributions.map((entry, index) => (
            <div
              key={entry.contributionId}
              className="anim-editorial-block"
              data-anim-editorial-block={index}
              data-anim-block-frames={entry.outputFrames}
              data-anim-block-problem={entry.problem !== null ? 'true' : 'false'}
              style={{ flexGrow: Math.max(entry.outputFrames, 1) }}
              title={`${index + 1}. ${entry.label} — ${entry.outputFrames} output frames (${entry.outputStart}–${entry.outputStart + entry.outputFrames})`}
            >
              <span>{index + 1}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="anim-note" data-anim-editorial-empty>No contributions yet — add a portion of a landed clip below.</p>
      )}
      {assembled.problems.length > 0 && (
        <ul className="anim-caption-hints" data-anim-editorial-problems aria-label="Assembly problems">
          {assembled.problems.map((problem, index) => (
            <li key={index} className="anim-caption-hint" data-anim-editorial-problem>{problem}</li>
          ))}
        </ul>
      )}

      {/* The ordered contribution list — the assembled sequence's order. */}
      {assembled.contributions.length > 0 && (
        <ol className="anim-editorial-rows" data-anim-editorial-rows>
          {assembled.contributions.map((entry, index) => (
            <EditorialRow
              key={entry.contributionId}
              entry={entry}
              index={index}
              count={assembled.contributions.length}
              busy={busy}
              draft={draftOf(rowDrafts[entry.contributionId], { inFrame: String(entry.inFrame), outFrame: String(entry.outFrame), holdDuration: String(entry.holdDuration) })}
              onDraft={(next) => setRowDrafts((current) => ({ ...current, [entry.contributionId]: next }))}
              onApply={() => {
                const parsed = validDraft(draftOf(rowDrafts[entry.contributionId], { inFrame: String(entry.inFrame), outFrame: String(entry.outFrame), holdDuration: String(entry.holdDuration) }))
                if (parsed === null) return
                onContribute(entry.spanId, entry.attemptId, parsed.inFrame, parsed.outFrame, parsed.holdDuration)
              }}
              onMoveUp={() => move(index, index - 1)}
              onMoveDown={() => move(index, index + 1)}
              onRemove={() => onRemove(entry.contributionId)}
            />
          ))}
        </ol>
      )}

      {/* The available clips — every landed tween step and sequence window,
          including older windows' takes (their durable home, task 12's
          Important-1). */}
      <div className="anim-editorial-clips">
        <h4>Available clips</h4>
        {clips.length === 0 && (
          <p className="anim-note" data-anim-editorial-no-clips>No landed clips yet — render a tween step or a sequence window; every landed take becomes a contribution source here.</p>
        )}
        {clips.map((clip) => {
          const draft = draftOf(addDrafts[clip.attemptId], { inFrame: '0', outFrame: String(clip.frameCount), holdDuration: '0' })
          const parsed = validDraft(draft)
          const setDraft = (next: FramesDraft) => setAddDrafts((current) => ({ ...current, [clip.attemptId]: next }))
          return (
            <div key={clip.attemptId} className="anim-editorial-clip" data-anim-editorial-clip={clip.attemptId} data-anim-clip-contributed={clip.contributionId !== null ? 'true' : 'false'}>
              <div className="anim-editorial-clip-source">
                <strong>{clip.label}</strong>
                {clip.detail !== '' && <span className="anim-frame-source"> {clip.detail}</span>}
                <span className="anim-frame-source"> {clip.frameCount} frames</span>
                {clip.contributionId !== null && <span className="anim-frame-source"> — already in the list above (editing the row re-chooses it)</span>}
              </div>
              <div className="anim-editorial-clip-fields">
                <FramesFields draft={draft} onChange={setDraft} disabled={busy} />
                <Button
                  variant="secondary"
                  busy={busy}
                  disabled={busy || parsed === null}
                  className="anim-editorial-add"
                  data-anim-editorial-add={clip.attemptId}
                  title={clip.contributionId !== null
                    ? 'Re-choose this clip\'s portion (the existing row updates)'
                    : 'Contribute this portion to the assembled sequence'}
                  onClick={() => { if (parsed !== null) onContribute(clip.spanId, clip.attemptId, parsed.inFrame, parsed.outFrame, parsed.holdDuration) }}
                >
                  {clip.contributionId !== null ? 'Update portion' : 'Add to sequence'}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** One ordered contribution row: the source label, the range + hold editors
 *  (an explicit Apply — every change is a revision-gated document command),
 *  the computed output span, and the reorder / remove actions. */
function EditorialRow({ entry, index, count, busy, draft, onDraft, onApply, onMoveUp, onMoveDown, onRemove }: {
  entry: AssembledContribution
  index: number
  count: number
  busy: boolean
  draft: FramesDraft
  onDraft(next: FramesDraft): void
  onApply(): void
  onMoveUp(): void
  onMoveDown(): void
  onRemove(): void
}) {
  const parsed = validDraft(draft)
  const differs = parsed !== null
    && (parsed.inFrame !== entry.inFrame || parsed.outFrame !== entry.outFrame || parsed.holdDuration !== entry.holdDuration)
  const degenerate = parsed !== null && parsed.outFrame <= parsed.inFrame
  return (
    <li className="anim-editorial-row" data-anim-editorial-row={entry.contributionId} data-anim-editorial-index={index}>
      <div className="anim-editorial-row-source">
        <strong>{index + 1}. {entry.label}</strong>
        {entry.detail !== '' && <span className="anim-frame-source"> {entry.detail}</span>}
        <span className="anim-frame-source" data-anim-editorial-span>
          {' '}assembles frames {entry.outputStart}–{entry.outputStart + entry.outputFrames}
          {entry.clipFrames > 0 ? ` (${entry.clipFrames} clip + ${entry.holdDuration} hold)` : ` (hold only, ${entry.holdDuration} frames)`}
          {entry.frameCount !== null ? ` of a ${entry.frameCount}-frame clip` : ''}
        </span>
      </div>
      {entry.problem !== null && <p className="anim-note anim-inspector-error" role="alert" data-anim-editorial-row-problem>{entry.problem}</p>}
      <div className="anim-editorial-row-fields">
        <FramesFields draft={draft} onChange={onDraft} disabled={busy} />
        <Button
          variant="primary"
          busy={busy}
          disabled={busy || parsed === null || !differs}
          data-anim-editorial-apply={entry.contributionId}
          title="Re-choose this contribution's portion and hold (one revision-gated document command)"
          onClick={onApply}
        >
          Apply
        </Button>
        <div className="anim-editorial-row-actions">
          <button type="button" className="anim-review-take" data-anim-editorial-up={entry.contributionId} disabled={busy || index === 0} title="Move earlier in the assembled sequence" onClick={onMoveUp}>↑</button>
          <button type="button" className="anim-review-take" data-anim-editorial-down={entry.contributionId} disabled={busy || index === count - 1} title="Move later in the assembled sequence" onClick={onMoveDown}>↓</button>
          <button type="button" className="anim-review-take" data-anim-editorial-remove={entry.contributionId} disabled={busy} title="Remove this contribution from the assembled sequence" onClick={onRemove}>✕</button>
        </div>
      </div>
      {degenerate && (
        <p className="anim-note" role="status" data-anim-editorial-degenerate>
          A degenerate range (out ≤ in) contributes no clip frames — only the hold: a held drawing (§11.3).
        </p>
      )}
    </li>
  )
}
