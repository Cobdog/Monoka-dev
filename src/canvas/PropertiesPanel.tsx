/**
 * Canvas Phase 2 — the properties panel (the absorption surface for
 * CreateView's binding model; spec §4 properties entry, §2 identity payload).
 *
 * Per-chain settings (the unwound workspace singleton, persisted in the
 * document store): SmartPromptEditor as the universal prompt field, engine
 * params (tier off/4/8 + turbo family through the optimization registry,
 * with detection state and install guidance), the reference binding model
 * (ordered canvas-output refs + character/location library binding +
 * clothing policy), the identity payload (verbatim subject text + the
 * strength dial with its stiffness↔drift labels), and keyframe guides as
 * chain settings. The generate row validates honestly before submit.
 *
 * Phase 4 adds CreateView's remaining unique capabilities so its retirement
 * is genuine: the prompt library (PromptLibraryBrowser insert — L11's
 * properties-insert side), the local-LLM prompt tools (enhance / shot
 * timeline / audio pass with the streaming preview + suggestion flow), and
 * vision captioning of bound reference pictures — plus the global asset
 * store in the reference bindings (§2 asset, consent-gated first bind) and
 * the engine readouts for the audio engine-ops (§5.4).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import { Captions, Clock3, Dices, LoaderCircle, Play, Sparkles, Square, Star, Volume2, WandSparkles, X } from 'lucide-react'
import { SmartPromptEditor, type SmartPromptEditorHandle } from '../components/SmartPromptEditor'
import { StructuredPromptEditor } from '../components/StructuredPromptEditor'
import { PromptLibraryBrowser } from '../components/PromptLibraryBrowser'
import { detectOptimizations, engineFamilyForChain, vdnAvailability } from '../lib/graph'
// Direct from the exporting module — re-exporting turboFetchPlan through
// graph/index.ts wedges index↔turbo into mutual chunk dependencies (the
// Rollup circular-chunk warning's own suggested fix).
import { turboFetchPlan } from '../lib/graph/turbo'
import { inferredOverrideSlotFile, migrateLegacyModelOverrideSlots, modelClassHint, modelFamilyInfo, overrideLayerCounts, overrideLayerSummary, overridePickOutcome, SLOT_LABELS, type ModelFamilyId, type ModelOverrideSlotName } from '../lib/modelOverrides'
import { guideFrameWarning } from '../lib/workflow'
import { ASPECT_RATIOS, optimalResolutionFor, parseResolution, ratioKeyOf, resolutionsForRatio, snapResolutionDim, tieredResolutionGroups } from '../lib/aspectResolutions'
import type { ImageMachinery } from '../lib/aspectResolutions'
import { buildPromptAssistantContext } from '../lib/promptComposer'
import { composeStructuredPrompt, mergeStructuredDraft, parseFlowRows, parseStructuredPrompt, type StructuredPromptDraft } from '../lib/structuredPrompt'
import { useLlmStream } from '../lib/useLlmStream'
import type { ModelOverrideSlots } from '../types'
import { useSessionStore } from '../state/sessionStore'
import { STATUS_LABEL } from './derive'
import { effectiveMode, modeLabelFor, readChainSettings, type CanvasChainSettings } from './generation'
import { AUDIO_LANE_PAUSED, AUDIO_LANE_PAUSED_REASON } from './options'
import {
  compileLoraTimeline, DEFAULT_TRANSITION_WINDOW, LORA_COMBINED_COLLAPSE_RISK, LORA_COMBINED_HEALTHY_MAX, LORA_SLOTS,
  newLoraRange, newLoraTimelineDoc, snapRangeBoundary,
  type LoraStackEntry, type LoraTimelineDoc,
} from './loraTimeline'
import { GAP_KINDS, GAP_LABEL, type PlanGapKind } from './plan'
import { useCanvasStore } from './store'
import { documentsApi } from './api'
import type { DocumentChain } from './derive'

/** AR-first resolution picking (ruling 2026-09-26): the ratio drives the
 *  list; every option is derived from the model's grid constraints with the
 *  OPTIMAL pick marked per the measured envelope. */

const TIERS: Array<{ value: CanvasChainSettings['turbo']; label: string; note: string }> = [
  { value: 'off', label: 'Quality', note: 'full-step native' },
  { value: '4', label: 'Fast · 4-step', note: 'turbo LoRA' },
  { value: '8', label: 'Fast · 8-step', note: 'turbo LoRA' },
]

/** The VDN acceleration rungs (task 9up52mj — adopted first-party): XOR
 *  with the tier — the stage's own distilled adapter IS the turbo
 *  acceleration, so selecting a rung turns the tier off (and vice versa,
 *  enforced in the tier chips' onClick). */
const VDN_RUNGS: Array<{ value: CanvasChainSettings['vdn']; label: string; note: string }> = [
  { value: 'off', label: 'Off', note: 'no VDN' },
  { value: 'dmd-8', label: 'VDN · 8-step', note: 'stage-dmd, distilled' },
  { value: 'stage-b-50', label: 'VDN · 50-step', note: 'stage-b, full steps' },
]

/** Debounced persistence for panel edits: typing never hammers the document
 *  store; a chain switch (the resetKey) or an unmount FLUSHES the unsaved
 *  commit — the cleanup used to cancel the timer, silently discarding the
 *  draft (audit A04). The commit is captured at schedule time so a late
 *  flush can never land on the wrong chain. */
function useDebouncedCommit<T>(value: T, skip: boolean, commit: (value: T) => void, resetKey: unknown, delay = 500) {
  const commitRef = useRef(commit)
  commitRef.current = commit
  const pending = useRef<{ value: T; commit: (value: T) => void } | null>(null)
  const timer = useRef<number | null>(null)
  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }
  useEffect(() => {
    if (skip) return undefined
    pending.current = { value, commit: commitRef.current }
    clearTimer()
    timer.current = window.setTimeout(() => {
      timer.current = null
      const entry = pending.current
      pending.current = null
      entry?.commit(entry.value)
    }, delay)
    // An ordinary value change only reschedules; the flush lives on the
    // resetKey effect below (its cleanup runs after this one, so the pending
    // entry is still there when a chain switch or unmount needs it).
    return clearTimer
  }, [value, skip, delay])
  useEffect(() => () => {
    clearTimer()
    const entry = pending.current
    pending.current = null
    entry?.commit(entry.value)
  }, [resetKey])
}

/** The free-ratio resolution inputs (AR-first picking): raw typing is kept
 *  local; the value commits SNAPPED to the 32 grid on blur/Enter — never
 *  mid-keystroke (an on-change snap would rewrite the field while typing). */
function FreeResolutionInput(props: { value: string; onCommit(resolution: string): void }) {
  const parsed = parseResolution(props.value)
  const [draft, setDraft] = useState(`${parsed?.width ?? 1344}x${parsed?.height ?? 768}`)
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setDraft(`${parsed?.width ?? 1344}x${parsed?.height ?? 768}`) }, [props.value, focused, parsed?.width, parsed?.height])
  const commit = () => {
    const [rawWidth, rawHeight] = draft.split('x').map(Number)
    const next = `${snapResolutionDim(rawWidth)}x${snapResolutionDim(rawHeight)}`
    setDraft(next)
    if (next !== props.value) props.onCommit(next)
  }
  const split = (side: 'w' | 'h', raw: string) => {
    const [width, height] = draft.split('x')
    setDraft(side === 'w' ? `${raw}x${height ?? ''}` : `${width ?? ''}x${raw}`)
  }
  const [width, height] = draft.split('x')
  return <span className="canvas-properties-free-res" data-canvas-resolution-free>
    <input data-canvas-resolution-w type="number" min={32} max={16384} step={32} aria-label="width (32px grid)" value={width ?? ''}
      onFocus={() => setFocused(true)}
      onChange={(event) => split('w', event.target.value)}
      onBlur={() => { setFocused(false); commit() }}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit() } }} />
    <span aria-hidden>×</span>
    <input data-canvas-resolution-h type="number" min={32} max={16384} step={32} aria-label="height (32px grid)" value={height ?? ''}
      onFocus={() => setFocused(true)}
      onChange={(event) => split('h', event.target.value)}
      onBlur={() => { setFocused(false); commit() }}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit() } }} />
  </span>
}

// ---- the LoRA timeline section (7twfk6o; surface decision 2026-09-19: a
// SEPARATE properties-panel section — the ranges edit ONE chain's temporal
// LoRA application, the panel already hosts the chain's LoRA seam, and grid
// snapping makes legal boundary positions discrete enough for an inline
// rail. The compiled result is a Director Suite plan document, so the
// timeline projection (V) renders it for free.) -------------------------------

const LORA_RAIL = { pad: 6, width: 308, paintedY: 6, paintedH: 18, layoutY: 38, layoutH: 12, labelsY: 62 }

function LoraTimelineSection(props: {
  chainId: string
  duration: number
  doc: LoraTimelineDoc | null
  loraNames: string[]
  formAdapterInstalled: boolean
  onChange(next: LoraTimelineDoc | null): void
  /** Persist the panel's full draft before Apply compiles (the compiler reads
   *  the persisted chain — the generate() precedent). False = the save
   *  failed; the caller must not compile what was never written. */
  flush(): Promise<boolean>
}) {
  const { chainId, duration, doc, loraNames, formAdapterInstalled, onChange, flush } = props
  const [dragRange, setDragRange] = useState<number | null>(null) // the RIGHT range's sorted index whose start is dragged
  const [applying, setApplying] = useState(false)
  const [failure, setFailure] = useState<string[]>([])
  const railRef = useRef<SVGSVGElement | null>(null)

  const timeline = doc ?? newLoraTimelineDoc()
  const clip = Math.max(2, Math.min(15, duration))
  const compile = useMemo(() => compileLoraTimeline(timeline, clip), [timeline, clip])
  const sorted = useMemo(() => timeline.ranges.slice().sort((a, b) => a.start - b.start), [timeline.ranges])

  const xOf = (seconds: number) => LORA_RAIL.pad + (Math.max(0, Math.min(clip, seconds)) / clip) * LORA_RAIL.width
  const secondsFromClientX = (clientX: number) => {
    const rail = railRef.current
    if (!rail) return 0
    const rect = rail.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)))
    return ratio * clip
  }

  const paintRange = () => {
    // The largest uncovered span gets a fresh 3s range (clamped to the span).
    const spans: Array<{ start: number; end: number }> = []
    let cursor = 0
    for (const range of sorted) {
      if (range.start > cursor + 1e-9) spans.push({ start: cursor, end: range.start })
      cursor = Math.max(cursor, range.end)
    }
    if (cursor < clip - 1e-9) spans.push({ start: cursor, end: clip })
    spans.sort((a, b) => b.end - b.start - (a.end - a.start))
    const target = spans[0]
    if (!target || target.end - target.start < 2) {
      useCanvasStore.getState().toast('neutral', 'No uncovered span is long enough to paint — drag an existing boundary instead.')
      return
    }
    const start = Number(target.start.toFixed(3))
    const end = Number(Math.min(target.end, start + 3).toFixed(3))
    const base = doc ?? newLoraTimelineDoc()
    onChange({ ...base, ranges: [...base.ranges, newLoraRange(base.ranges.length, start, end)] })
  }

  const patchRange = (id: string, part: Partial<{ start: number; end: number; loras: LoraStackEntry[] }>) =>
    onChange({ ...timeline, ranges: timeline.ranges.map((range) => range.id === id ? { ...range, ...part } : range) })

  const dragBoundaryTo = (rightIndex: number, seconds: number) => {
    const left = sorted[rightIndex - 1]
    const right = sorted[rightIndex]
    if (!left || !right) return
    const snapped = snapRangeBoundary(seconds, left.start, right.end)
    if (snapped === null) return
    const position = Number(snapped.toFixed(3))
    onChange({
      ...timeline,
      ranges: timeline.ranges.map((range) => {
        if (range.id === left.id) return { ...range, end: position }
        if (range.id === right.id) return { ...range, start: position }
        return range
      }),
    })
  }

  const setGap = (afterRangeId: string, kind: string, widthSeconds: number) => {
    const next = timeline.transitions.filter((entry) => entry.afterRangeId !== afterRangeId)
    if (kind !== 'cut') next.push({ afterRangeId, kind: kind as PlanGapKind, widthSeconds })
    onChange({ ...timeline, transitions: next })
  }

  const apply = async () => {
    if (!compile.ok || applying) return
    setApplying(true)
    setFailure([])
    try {
      // (A02) Compiling reads the PERSISTED chain — a failed save must not
      // compile what was never written.
      if (!await flush()) {
        setFailure(['The draft could not be saved — nothing was compiled. Retry once the save failure is resolved.'])
        return
      }
      const result = await useCanvasStore.getState().applyLoraTimeline(chainId)
      if (!result.ok && result.reasons) setFailure(result.reasons)
    } finally {
      setApplying(false)
    }
  }

  const loraOptions = [''].concat(loraNames)

  return <section className="canvas-properties-section canvas-lora-timeline" data-canvas-section="lora-timeline">
    <label>LoRA timeline <span className="canvas-properties-hint">paint ranges · engine frame grid (5/22/39…)</span></label>

    {/* The rail: painted ranges above, the compiled segment layout + transition
        windows below — the projection IS the review gate. */}
    <svg
      className="canvas-lora-rail" data-canvas-lora-rail viewBox="0 0 320 68" role="img"
      aria-label="LoRA timeline rail — painted ranges and the compiled segment layout"
      ref={railRef}
      onPointerMove={(event) => { if (dragRange !== null) dragBoundaryTo(dragRange, secondsFromClientX(event.clientX)) }}
      onPointerUp={() => setDragRange(null)}
      onPointerLeave={() => setDragRange(null)}
    >
      <rect x={LORA_RAIL.pad} y={LORA_RAIL.paintedY} width={LORA_RAIL.width} height={LORA_RAIL.paintedH} rx={3} className="canvas-lora-rail-base" />
      {sorted.map((range, index) => {
        const x = xOf(range.start)
        const width = Math.max(2, xOf(range.end) - x)
        return <g key={range.id} data-canvas-lora-block={index} className={range.loras.length ? 'canvas-lora-block painted' : 'canvas-lora-block empty'}>
          <rect x={x} y={LORA_RAIL.paintedY} width={width} height={LORA_RAIL.paintedH} rx={2} />
          {width > 34 && <text x={x + 4} y={LORA_RAIL.paintedY + 12}>{range.loras.length ? range.loras.map((lora) => lora.name.split('/').pop()?.replace(/\.safetensors$/i, '')).join('+') : 'base'}</text>}
          {index > 0 && <rect
            className="canvas-lora-handle"
            data-canvas-lora-handle={index}
            x={x - 3} y={LORA_RAIL.paintedY - 2} width={6} height={LORA_RAIL.paintedH + 4} rx={2}
            style={{ cursor: 'ew-resize' }}
            onPointerDown={(event) => {
              event.preventDefault()
              setDragRange(index)
              try { (event.currentTarget as SVGRectElement).setPointerCapture?.(event.pointerId) } catch { /* best-effort capture */ }
            }}
          />}
        </g>
      })}
      {compile.ok && <>
        {compile.segments.map((segment, index) => {
          const x = xOf(segment.startSeconds)
          const width = Math.max(1.5, xOf(segment.endSeconds) - x)
          return <rect key={segment.id} data-canvas-lora-seg={index} className={`canvas-lora-seg${segment.loras.length ? ' painted' : ''}`} x={x} y={LORA_RAIL.layoutY} width={width} height={LORA_RAIL.layoutH} rx={2}>
            <title>{`${segment.title} · ${segment.durationSeconds.toFixed(2)}s · ${segment.frames} frames`}</title>
          </rect>
        })}
        {compile.segments.map((segment, index) => {
          if (!segment.gapAfter || segment.gapAfter.widthSeconds <= 0) return null
          const center = xOf(segment.endSeconds)
          const halfWidth = Math.max(1.5, (segment.gapAfter.widthSeconds / clip) * LORA_RAIL.width / 2)
          return <rect key={`${segment.id}-window`} data-canvas-lora-window={index} className="canvas-lora-window" x={center - halfWidth} y={LORA_RAIL.layoutY - 2} width={halfWidth * 2} height={LORA_RAIL.layoutH + 4} rx={2}>
            <title>{`${GAP_LABEL[segment.gapAfter.kind]} window · ${segment.gapAfter.widthSeconds.toFixed(2)}s`}</title>
          </rect>
        })}
        <text x={LORA_RAIL.pad} y={LORA_RAIL.labelsY} className="canvas-lora-rail-label">0s</text>
        <text x={LORA_RAIL.pad + LORA_RAIL.width / 2} y={LORA_RAIL.labelsY} textAnchor="middle" className="canvas-lora-rail-label">{(clip / 2).toFixed(1)}s</text>
        <text x={LORA_RAIL.pad + LORA_RAIL.width} y={LORA_RAIL.labelsY} textAnchor="end" className="canvas-lora-rail-label">{clip.toFixed(1)}s</text>
      </>}
    </svg>
    <p className="canvas-properties-note">painted ranges above · compiled segments + transition windows below · drag boundaries (grid-snapped){formAdapterInstalled ? ' · slot 1 rides the form adapter' : ''}</p>

    {/* Range rows: the LoRA set + strength per painted range. */}
    <div className="canvas-lora-ranges" data-canvas-lora-ranges>
      {sorted.map((range, index) => {
        const combined = range.loras.reduce((sum, lora) => sum + lora.strength, 0)
        return <div className="canvas-lora-range" data-canvas-lora-range={index} key={range.id}>
          <div className="canvas-lora-range-slots">
            {Array.from({ length: LORA_SLOTS }, (_, slot) => {
              const entry = range.loras[slot]
              const disabled = slot > 0 && !range.loras[slot - 1]
              return <span className="canvas-lora-slot" key={slot}>
                <select
                  data-canvas-lora-name={slot}
                  aria-label={`Range ${index + 1} LoRA ${slot + 1}`}
                  value={entry?.name ?? ''}
                  disabled={disabled}
                  onChange={(event) => {
                    const name = event.target.value
                    const loras = range.loras.slice(0, LORA_SLOTS)
                    if (!name) loras.splice(slot, 1)
                    else if (slot < loras.length) loras[slot] = { name, strength: loras[slot].strength }
                    else loras.push({ name, strength: 1 })
                    patchRange(range.id, { loras })
                  }}
                >
                  {loraOptions.map((name) => <option key={name || 'none'} value={name}>{name || `LoRA ${slot + 1}…`}</option>)}
                </select>
                {entry && <input
                  type="number" min={0} max={2} step={0.05}
                  data-canvas-lora-strength={slot}
                  aria-label={`Range ${index + 1} LoRA ${slot + 1} strength`}
                  value={entry.strength}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (!Number.isFinite(value)) return
                    const loras = range.loras.slice(0, LORA_SLOTS)
                    loras[slot] = { name: entry.name, strength: Math.min(2, Math.max(0, value)) }
                    patchRange(range.id, { loras })
                  }}
                />}
              </span>
            })}
          </div>
          <div className="canvas-lora-range-span">
            <input type="number" min={0} max={clip} step={0.25} data-canvas-lora-start aria-label={`Range ${index + 1} start seconds`} value={range.start}
              onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) patchRange(range.id, { start: Math.min(clip, Math.max(0, value)) }) }} />
            <span>→</span>
            <input type="number" min={0} max={clip} step={0.25} data-canvas-lora-end aria-label={`Range ${index + 1} end seconds`} value={range.end}
              onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) patchRange(range.id, { end: Math.min(clip, Math.max(0, value)) }) }} />
            <span className="canvas-lora-range-note">{(range.end - range.start).toFixed(2)}s</span>
            <button type="button" className="icon-button" aria-label={`Remove range ${index + 1}`} data-canvas-lora-remove onClick={() => onChange({ ...timeline, ranges: timeline.ranges.filter((entry) => entry.id !== range.id), transitions: timeline.transitions.filter((entry) => entry.afterRangeId !== range.id) })}><X size={11} /></button>
          </div>
          {range.loras.length === LORA_SLOTS && <p className={`canvas-lora-combined${combined >= LORA_COMBINED_COLLAPSE_RISK ? ' risk' : combined > LORA_COMBINED_HEALTHY_MAX ? ' warn' : ''}`}>combined strength {combined.toFixed(2)} {combined >= LORA_COMBINED_COLLAPSE_RISK ? '· collapse-risk band' : combined > LORA_COMBINED_HEALTHY_MAX ? '· above the healthy band' : '· healthy'}</p>}
        </div>
      })}
      <div className="canvas-lora-toolbar">
        <button type="button" className="canvas-chip" data-canvas-lora-paint onClick={paintRange}>+ paint range</button>
        {doc && <button type="button" className="canvas-chip" data-canvas-lora-clear onClick={() => onChange(null)}>clear</button>}
      </div>
    </div>

    {/* Boundary transitions: the measured gap kinds + user-settable windows.
        Only non-cut choices persist (a missing record IS the cut default). */}
    {compile.ok && compile.segments.length > 1 && <div className="canvas-lora-gaps" data-canvas-lora-gaps>
      {compile.segments.slice(0, -1).map((segment, index) => {
        const gap = segment.gapAfter!
        return <div className="canvas-lora-gap" data-canvas-lora-gap={index} key={segment.id}>
          <span className="canvas-lora-gap-label" title={`${segment.title} → ${compile.segments[index + 1].title}`}>{segment.title} →</span>
          <select data-canvas-lora-gap-kind aria-label={`Transition after segment ${index + 1}`} value={gap.kind}
            onChange={(event) => setGap(segment.rangeId, event.target.value, Math.round(DEFAULT_TRANSITION_WINDOW[event.target.value as keyof typeof DEFAULT_TRANSITION_WINDOW] * 100) / 100)}>
            {GAP_KINDS.map((kind) => <option key={kind} value={kind}>{GAP_LABEL[kind]}</option>)}
          </select>
          <input type="number" min={0} max={3} step={0.05} data-canvas-lora-gap-width aria-label={`Transition window seconds after segment ${index + 1}`}
            value={gap.widthSeconds} disabled={gap.kind === 'cut'}
            onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0) setGap(segment.rangeId, gap.kind, Math.min(3, value)) }} />
          <span className="canvas-lora-gap-note">s window</span>
        </div>
      })}
    </div>}

    {/* The live compile — the review gate. An unpainted clip shows the intro
        note (not an error — the user has not authored anything yet); once a
        range exists, every refusal reason surfaces. */}
    {compile.ok
      ? <p className="canvas-properties-note" data-canvas-lora-compile>{compile.segments.length} segment{compile.segments.length === 1 ? '' : 's'} · {compile.totalSeconds.toFixed(2)}s planned (grid-conformed){compile.warnings.length ? ` · ${compile.warnings.length} note${compile.warnings.length === 1 ? '' : 's'}` : ''}</p>
      : doc
        ? <ul className="canvas-properties-warning" data-canvas-lora-errors role="alert">{compile.reasons.map((reason, index) => <li key={index} data-canvas-lora-error={index}>{reason}</li>)}</ul>
        : <p className="canvas-properties-note">Paint LoRA ranges over this clip — the compiler generates one chain per range, grid-conformed (the engine’s 5/22/39… frame ladder) and joined by measured transitions. Nothing submits until you generate.</p>}
    {compile.ok && compile.warnings.length > 0 && <ul className="canvas-lora-warnings" data-canvas-lora-warnings>{compile.warnings.map((warning, index) => <li key={index} data-canvas-lora-warning={index}>{warning}</li>)}</ul>}
    {failure.length > 0 && <ul className="canvas-properties-warning" role="alert">{failure.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
    <div className="canvas-lora-actions">
      <button type="button" className="canvas-chip primary" data-canvas-lora-apply disabled={!compile.ok || applying} title="Compile the ranges into a Director Suite plan and seed one chain per segment (nothing auto-submits)"
        onClick={() => void apply()}>{applying ? 'compiling…' : `compile → ${compile.ok ? compile.segments.length : '—'} segments`}</button>
    </div>
  </section>
}

export function PropertiesPanel() {
  const open = useCanvasStore((state) => state.inspectorOpen)
  const setInspectorOpen = useCanvasStore((state) => state.setInspectorOpen)
  const selection = useCanvasStore((state) => state.selection)
  const documents = useCanvasStore((state) => state.documents)
  const activeProjectId = useCanvasStore((state) => state.activeProjectId)
  const tiles = useCanvasStore((state) => state.tiles)
  const libraries = useCanvasStore((state) => state.libraries)
  const assets = useCanvasStore((state) => state.assets)
  const bindGlobalAsset = useCanvasStore((state) => state.bindGlobalAsset)
  const chainBindings = useCanvasStore((state) => state.chainBindings)
  const setChainSettings = useCanvasStore((state) => state.setChainSettings)
  const setChainIdentity = useCanvasStore((state) => state.setChainIdentity)
  const submitChain = useCanvasStore((state) => state.submitChain)
  const validateChain = useCanvasStore((state) => state.validateChain)
  const cancelChainJob = useCanvasStore((state) => state.cancelChainJob)
  const raiseDock = useCanvasStore((state) => state.raiseDock)
  // Dock stacking (review M11): this dock's own z, raised on open and on any
  // pointer grab — independent of the other docks' z values. The stranded
  // z-40 CSS pin is retired; the store owns ordering.
  const [dockZ, setDockZ] = useState(60)
  useEffect(() => { if (open) setDockZ(raiseDock()) }, [open, raiseDock])

  const models = useSessionStore((state) => state.models)
  const info = useSessionStore((state) => state.info)
  const ollamaModels = useSessionStore((state) => state.ollamaModels)
  // The image tiers' machinery key (the 1F full image stack): the session's
  // T=1 machinery decides which rung the optimal marker sits on.
  const settingsMachinery = useSessionStore((state) => state.settings?.experimentalT1Decode)
  const imageTierMachinery: ImageMachinery = settingsMachinery === 'fizgig' || settingsMachinery === 'fizgig-max' ? 'fizgig' : 'image-studio'
  // (sweep #8, audit F5 — task 68e9k17) The global override layer is read
  // REACTIVELY: a Settings change (a pick set or cleared elsewhere) must
  // re-render this panel's chip and slot rows with no remount. The old
  // getState() read captured the value at render time and went stale until
  // some OTHER state happened to re-render the panel.
  const modelOverridesByFamily = useSessionStore((state) => state.settings?.modelOverrides)

  const chainId = selection.tileIds.length === 1 ? selection.tileIds[0] : null
  const doc = activeProjectId ? documents[activeProjectId] : null
  const chain: DocumentChain | null = chainId && doc ? doc.chains.find((entry) => entry.id === chainId) ?? null : null
  const tile = chainId ? tiles.find((entry) => entry.id === chainId) ?? null : null

  const [draft, setDraft] = useState<CanvasChainSettings | null>(null)
  // AR-first picking: 'free' is an EDIT MODE, not a derived state — the
  // ratio select's value derives from the resolution, so choosing free
  // (which keeps the current dims) must hold locally until a ratio is
  // picked again or the chain switches.
  const [freeRatio, setFreeRatio] = useState(false)
  const [subjectText, setSubjectText] = useState('')
  const [strength, setStrength] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  // (A02) The draft's save fate, beside the Generate action: null = nothing
  // in flight since the last look, otherwise the last save attempt's state.
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'failed' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Phase 4: the CreateView capabilities this panel absorbs.
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [promptingTool, setPromptingTool] = useState<'enhance' | 'timeline' | 'audio' | null>(null)
  const [promptSuggestion, setPromptSuggestion] = useState('')
  const [captioningIndex, setCaptioningIndex] = useState<number | null>(null)
  const [captionNotice, setCaptionNotice] = useState<string | null>(null)
  const promptStreamTarget = useRef<HTMLDivElement>(null)
  const promptRef = useRef<SmartPromptEditorHandle>(null)
  const llmStream = useLlmStream()

  // The last server state THIS panel adopted or committed. A concurrent
  // document reload (a take landing, another surface editing, an identity
  // commit) must never wipe in-flight local edits: the server value is
  // adopted ONLY when it differs from what we last knew — and never while
  // the draft has moved past it.
  // (N03, round 5) `rawSettings` is the RAW persisted record's JSON — the
  // server truth the change detection compares. The effective read
  // (readChainSettings) fills a MISSING seed with a RANDOM fallback, so
  // comparing effective reads saw a phantom "server changed" on every
  // render and the full-adoption branch overwrote freshly typed edits.
  const knownRef = useRef<{ chainId: string; settings: string; rawSettings: string; subjectText: string; strength: number } | null>(null)
  // (F02, followup audit 2026-10-03) The last ACKNOWLEDGED persistence, held
  // separately from the draft and from in-flight attempts. knownRef advances
  // OPTIMISTICALLY at enqueue (it drives outside-edit adoption), so it can
  // never gate the unload flush: a navigate-while-in-flight or a navigate-
  // after-failed-save used to diff against the claimed-saved state, skip the
  // keepalive write, and lose the draft. ackedRef advances ONLY when the
  // server confirms (or when we adopt server state, which is confirmed by
  // definition) — a failed save leaves it behind, so every later flush
  // retries until the write lands. A duplicate identical write is harmless.
  const ackedRef = useRef<{ chainId: string; settings?: string; subjectText?: string; strength?: number } | null>(null)
  // (F01) The panel's write queue: debounced autosaves used to fire
  // UNSEQUENCED, so a slow older write could land after a fast newer one and
  // overwrite it while the UI said "Draft saved." One chained promise per
  // panel (the WorkbenchApp session-write pattern); each write runs after
  // the previous settles and composes from the FRESHEST draft at write time.
  // (R2, scoped re-review 2026-10-03) The identity commits ride the SAME
  // queue — the two setChainIdentity debounces were the last unsequenced
  // writes on this seam.
  const writeQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))
  const freshestRef = useRef<{ chainId: string | null; settings: CanvasChainSettings | null; subjectText: string; strength: number }>({ chainId, settings: draft, subjectText, strength })
  freshestRef.current = { chainId, settings: draft, subjectText, strength }
  // (R1, round 3; C-1, fix round) Per-chain, PER-KIND write revisions:
  // every write this panel sends — queued OR keepalive — stamps a strictly
  // increasing revision from its OWN kind's counter, so the SERVER can
  // discard stale arrivals per kind (the fire-and-forget keepalive leg
  // cannot be sequenced client-side). The kinds must not share a counter:
  // their payloads are disjoint, and a shared gate discarded a settings
  // draft merely because an identity arrival carried a higher stamp. The
  // counters seed from the adopted chain's stored columns and only move up.
  const revisionRef = useRef<{ settings: Record<string, number>; identity: Record<string, number> }>({ settings: {}, identity: {} })
  const nextRevision = (id: string, kind: 'settings' | 'identity'): number => {
    const current = revisionRef.current[kind]
    current[id] = (current[id] ?? 0) + 1
    return current[id]
  }
  // (R3, round 3) Chains with UNACKNOWLEDGED local truth: the deselect/
  // chain-switch flush rides a normal fetch that dies at unload, and the
  // keepalive used to cover only the CURRENTLY-open chain. Entries hold the
  // last unacked snapshot per touched chain (bounded to this session); they
  // are set at every enqueue and cleared when the chain's local truth is
  // fully acknowledged.
  const dirtyChainsRef = useRef<Map<string, { settings?: CanvasChainSettings; subjectText?: string; strength?: number }>>(new Map())
  const markDirty = (id: string, patch: { settings?: CanvasChainSettings; subjectText?: string; strength?: number }) => {
    const existing = dirtyChainsRef.current.get(id)
    dirtyChainsRef.current.set(id, { ...existing, ...patch })
  }
  const settleDirty = (id: string) => {
    const entry = dirtyChainsRef.current.get(id)
    const acked = ackedRef.current
    if (!entry || !acked || acked.chainId !== id) return
    const settingsSettled = entry.settings === undefined || acked.settings === JSON.stringify(entry.settings)
    const subjectSettled = entry.subjectText === undefined || acked.subjectText === entry.subjectText
    const strengthSettled = entry.strength === undefined || (acked.strength !== undefined && Math.abs(acked.strength - entry.strength) < 1e-9)
    if (settingsSettled && subjectSettled && strengthSettled) dirtyChainsRef.current.delete(id)
  }
  useEffect(() => {
    if (!chain) {
      setDraft(null)
      knownRef.current = null
      ackedRef.current = null
      return
    }
    const settings = readChainSettings(chain.settings, useSessionStore.getState().settings)
    const incomingSubject = chain.identity?.subjectText ?? ''
    const incomingStrength = chain.identity?.strength ?? 1
    // (R1/C-1) Seed BOTH kind counters from the stored columns — this
    // panel must never stamp below what the server already holds.
    revisionRef.current.settings[chain.id] = Math.max(revisionRef.current.settings[chain.id] ?? 0, chain.settingsRevision ?? 0)
    revisionRef.current.identity[chain.id] = Math.max(revisionRef.current.identity[chain.id] ?? 0, chain.identityRevision ?? 0)
    const known = knownRef.current
    const serverSettings = JSON.stringify(settings)
    const rawServerSettings = JSON.stringify(chain.settings)
    const chainSwitched = !known || known.chainId !== chain.id
    // Outside edits (another surface changed this chain): adopt when the
    // server state moved away from what we last committed/adopted AND the
    // local draft hasn't diverged past it (a diverged draft is the user's
    // newer truth; its own commit lands momentarily). The moved-away check
    // compares the RAW persisted record — the effective read's random seed
    // fallback must never register as a server-side change (N03).
    const settingsChanged = !chainSwitched && known.rawSettings !== rawServerSettings && JSON.stringify(draft) === known.settings
    if (chainSwitched || settingsChanged) {
      knownRef.current = { chainId: chain.id, settings: serverSettings, rawSettings: rawServerSettings, subjectText: incomingSubject, strength: incomingStrength }
      // What we just adopted IS the server's persisted truth — acknowledged.
      ackedRef.current = { chainId: chain.id, settings: serverSettings, subjectText: incomingSubject, strength: incomingStrength }
      setDraft(settings)
      setFreeRatio(false)
      // (I-R5, round 6) The identity adoption is gated on NON-DIVERGENCE —
      // the else-if branch's own guard, mirrored here. The panel's OWN
      // settings commit changes the persisted raw (the raw comparison above
      // sees it on the post-save reload), and an unguarded rollback used to
      // wipe a mid-debounce identity edit whose eventual commit then
      // no-op'd at the acked gate — a silent drop. A diverging local
      // identity draft is the user's newer truth; its own commit lands
      // momentarily. A chain SWITCH still resets unconditionally (the
      // locals belong to the previous chain).
      if (chainSwitched || !known || known.subjectText === subjectText) setSubjectText(incomingSubject)
      if (chainSwitched || !known || Math.abs(known.strength - strength) < 1e-9) setStrength(incomingStrength)
    } else if (known && (known.subjectText !== incomingSubject || Math.abs(known.strength - incomingStrength) > 1e-9) && known.subjectText === subjectText) {
      knownRef.current = { chainId: chain.id, settings: known.settings, rawSettings: rawServerSettings, subjectText: incomingSubject, strength: incomingStrength }
      ackedRef.current = { chainId: chain.id, ...(ackedRef.current?.chainId === chain.id ? ackedRef.current : {}), subjectText: incomingSubject, strength: incomingStrength }
      setSubjectText(incomingSubject)
      setStrength(incomingStrength)
    }
  }, [chain, draft, subjectText, strength])

  // (A02) The draft's save seam: every save reports saving/saved/failed
  // beside Generate, and a FAILED save returns false so no caller submits
  // the older persisted settings as if the user had authored them.
  // Deliberately no knownRef short-circuit here — a debounced save may have
  // just failed, so Generate must re-attempt the write (the store's own
  // no-op gate keeps an already-saved draft write-free).
  // (F01) The write joins the panel's queue: it runs after any earlier save
  // settles, and it carries the FRESHEST draft at write time — while this
  // write waited, the user kept typing, and the newest truth is what must
  // reach the wire (never a stale enqueue-time snapshot).
  const saveDraft = (id: string, value: CanvasChainSettings): Promise<boolean> => {
    const write = writeQueueRef.current.then(async () => {
      const freshest = freshestRef.current
      const toWrite = freshest.chainId === id && freshest.settings ? freshest.settings : value
      setSaveState('saving')
      setSaveError(null)
      // (R1) The queued write stamps a strictly increasing revision; the
      // counter already accounts for every earlier stamp, keepalive or not.
      const save = await setChainSettings(id, toWrite, { settingsRevision: nextRevision(id, 'settings') })
      setSaveState(save.ok ? 'saved' : 'failed')
      if (!save.ok) setSaveError(save.error ?? 'the save failed')
      if (save.ok) {
        ackedRef.current = { chainId: id, ...(ackedRef.current?.chainId === id ? ackedRef.current : {}), settings: JSON.stringify(toWrite) }
        settleDirty(id)
      }
      return save.ok
    })
    writeQueueRef.current = write.catch(() => false)
    return write
  }

  // (R2) The identity commits join the same queue: identity fields are
  // scalars, so a plain enqueue with freshest-at-write-time composition
  // suffices — no functional-patch machinery. The ack (F02) rides the
  // result with the values that actually reached the wire.
  // (R1/3b; C-1 fix) Identity writes stamp the identity kind's OWN
  // counter — the server gates each endpoint on its own column, so within
  // each kind arrivals are totally ordered and across kinds they never
  // interact.
  const saveIdentity = (id: string, patch: { subjectText?: string; strength?: number }): Promise<boolean> => {
    const write = writeQueueRef.current.then(async () => {
      const freshest = freshestRef.current
      const toWrite = freshest.chainId === id
        ? {
          ...(patch.subjectText !== undefined ? { subjectText: freshest.subjectText } : {}),
          ...(patch.strength !== undefined ? { strength: freshest.strength } : {}),
        }
        : patch
      const result = await setChainIdentity(id, toWrite, { identityRevision: nextRevision(id, 'identity') })
      if (result.ok && (toWrite.subjectText !== undefined || toWrite.strength !== undefined)) {
        ackedRef.current = {
          chainId: id,
          ...(ackedRef.current?.chainId === id ? ackedRef.current : {}),
          ...(toWrite.subjectText !== undefined ? { subjectText: toWrite.subjectText } : {}),
          ...(toWrite.strength !== undefined ? { strength: toWrite.strength } : {}),
        }
        settleDirty(id)
      }
      return result.ok
    })
    writeQueueRef.current = write.catch(() => false)
    return write
  }

  // The no-op gates read the ACKNOWLEDGED state (F02): knownRef's optimistic
  // advance would swallow a retry after a failed save of the same value.
  useDebouncedCommit(draft, !draft || !chainId, (value) => {
    if (!chainId || !value) return
    const acked = ackedRef.current
    if (acked && acked.chainId === chainId && acked.settings === JSON.stringify(value)) return // already acknowledged: never write for nothing
    const known = knownRef.current
    if (known && known.chainId === chainId) knownRef.current = { ...known, settings: JSON.stringify(value) }
    // (R3; M-1) The enqueue point: this chain now has unacked local
    // truth — SETTINGS only. Identity fields join the snapshot ONLY at
    // identity enqueues (genuinely dirty), so a settings-only edit never
    // flushes a phantom identity row.
    markDirty(chainId, { settings: value })
    void saveDraft(chainId, value)
  }, chainId)
  useDebouncedCommit(subjectText, !chain, (value) => {
    if (!chainId) return
    const acked = ackedRef.current
    if (acked && acked.chainId === chainId && acked.subjectText === value) return
    const known = knownRef.current
    if (known && known.chainId === chainId) knownRef.current = { ...known, subjectText: value }
    markDirty(chainId, { subjectText: value, strength })
    void saveIdentity(chainId, { subjectText: value })
  }, chainId, 700)
  useDebouncedCommit(strength, !chain, (value) => {
    if (!chainId) return
    const acked = ackedRef.current
    if (acked && acked.chainId === chainId && Math.abs((acked.strength ?? Number.NaN) - value) < 1e-9) return
    const known = knownRef.current
    if (known && known.chainId === chainId) knownRef.current = { ...known, strength: value }
    markDirty(chainId, { strength: value, subjectText })
    void saveIdentity(chainId, { strength: value })
  }, chainId, 300)

  // (A04) A surface switch is a full page load — React cleanups never run
  // across it, so whatever the debounces have not sent yet rides
  // pagehide/beforeunload as keepalive fetches (the useDebouncedPersist
  // close-flush contract, async-transport edition). The write carries the
  // full panel draft, which is what the debounced commit would have sent; a
  // server key another surface added after adoption is the accepted
  // residual — losing the authored draft is the worse harm.
  // (F02) The diff is against last-ACKNOWLEDGED persistence, never knownRef:
  // a draft whose save is still in flight, or whose save FAILED, is
  // unacknowledged — the keepalive fires, erring toward writing (a
  // duplicate identical write is harmless; a lost draft is not).
  const unloadRef = useRef({ chainId, draft, subjectText, strength, acked: ackedRef.current })
  unloadRef.current = { chainId, draft, subjectText, strength, acked: ackedRef.current }
  useEffect(() => {
    const flushForUnload = () => {
      const state = unloadRef.current
      const dirty = dirtyChainsRef.current
      // (N01) The dirty set is the truth: an entry exists ⇔ something is
      // unacked, and entries are IMMORTAL to adoption — a reselect adopts
      // the STALE server state while the entry's write is still in flight,
      // and that adopted state must never satisfy the current-chain
      // divergence check. When the freshest state matches acked but a dirty
      // entry exists, the entry's snapshot is what still needs to land.
      const currentEntry = state.chainId ? dirty.get(state.chainId) : undefined
      if (state.chainId && state.draft) {
        const acked = state.acked?.chainId === state.chainId ? state.acked : null
        if (acked?.settings !== JSON.stringify(state.draft)) {
          // (R1) The keepalive stamps a revision HIGHER than any in-flight
          // write (the counter already counts them) — late arrivals lose.
          void documentsApi.updateChain({ id: state.chainId, settings: state.draft as unknown as Record<string, unknown>, settingsRevision: nextRevision(state.chainId, 'settings') }, { keepalive: true })
            .catch(() => { /* nothing can surface during unload */ })
        } else if (currentEntry?.settings !== undefined) {
          // (N01) Post-reselect: the adopted draft equals the adopted acked
          // state — the entry is the only witness of the unacked truth.
          void documentsApi.updateChain({ id: state.chainId, settings: currentEntry.settings as unknown as Record<string, unknown>, settingsRevision: nextRevision(state.chainId, 'settings') }, { keepalive: true })
            .catch(() => { /* nothing can surface during unload */ })
        }
        if (acked?.subjectText !== state.subjectText || acked?.strength === undefined || Math.abs(acked.strength - state.strength) > 1e-9) {
          void documentsApi.upsertIdentity({ chainId: state.chainId, subjectText: state.subjectText, strength: state.strength, identityRevision: nextRevision(state.chainId, 'identity') }, { keepalive: true })
            .catch(() => { /* nothing can surface during unload */ })
        } else if (currentEntry && (currentEntry.subjectText !== undefined || currentEntry.strength !== undefined)) {
          void documentsApi.upsertIdentity({
            chainId: state.chainId,
            ...(currentEntry.subjectText !== undefined ? { subjectText: currentEntry.subjectText } : {}),
            ...(currentEntry.strength !== undefined ? { strength: currentEntry.strength } : {}),
            identityRevision: nextRevision(state.chainId, 'identity'),
          }, { keepalive: true })
            .catch(() => { /* nothing can surface during unload */ })
        }
      }
      // (R3) Every chain with unacked local truth gets its keepalive too:
      // the deselect/chain-switch flush rode a normal fetch that died at
      // unload. Multiple fire-and-forget writes are safe — each kind's
      // gate DISCARDS its own stale arrivals server-side (the gate does not
      // ORDER arrivals; within a kind the newest stamp wins whichever way
      // they interleave, and across kinds the columns never interact).
      for (const [id, entry] of dirty) {
        if (id === state.chainId) continue // handled above: freshest-or-entry
        if (entry.settings) {
          void documentsApi.updateChain({ id, settings: entry.settings as unknown as Record<string, unknown>, settingsRevision: nextRevision(id, 'settings') }, { keepalive: true })
            .catch(() => { /* nothing can surface during unload */ })
        }
        // (M-1) The identity keepalive fires only on GENUINE identity
        // dirtiness — the snapshot's identity fields exist only if an
        // identity commit enqueued them.
        if (entry.subjectText !== undefined || entry.strength !== undefined) {
          void documentsApi.upsertIdentity({
            chainId: id,
            ...(entry.subjectText !== undefined ? { subjectText: entry.subjectText } : {}),
            ...(entry.strength !== undefined ? { strength: entry.strength } : {}),
            identityRevision: nextRevision(id, 'identity'),
          }, { keepalive: true })
            .catch(() => { /* nothing can surface during unload */ })
        }
      }
    }
    window.addEventListener('pagehide', flushForUnload)
    window.addEventListener('beforeunload', flushForUnload)
    return () => {
      window.removeEventListener('pagehide', flushForUnload)
      window.removeEventListener('beforeunload', flushForUnload)
    }
  }, [])

  // Structured mode (fh94g76): a duration change re-clips the flow ranges —
  // recompose the concat once per duration change (never on box edits, which
  // compose inline in applyStructured).
  const lastComposedDuration = useRef<number | null>(null)
  useEffect(() => {
    if (!draft || !chainId) return
    if (draft.promptMode !== 'structured' || !draft.structured) {
      lastComposedDuration.current = null
      return
    }
    if (lastComposedDuration.current === draft.duration) return
    lastComposedDuration.current = draft.duration
    const composed = composeStructuredPrompt(draft.structured, { duration: draft.duration })
    setDraft((current) => current && current.prompt !== composed ? { ...current, prompt: composed } : current)
  }, [draft, chainId])

  // Structured mode with a missing/malformed persisted draft (legacy data):
  // the no-loss parse stands in — memoized so the parse (and its generated
  // ids) stay stable across renders while the prompt is unchanged.
  const structuredDraft = useMemo(
    () => (draft && draft.promptMode === 'structured') ? (draft.structured ?? parseStructuredPrompt(draft.prompt)) : null,
    [draft],
  )

  const turboFamilies = useMemo(() => detectOptimizations(info, models).filter((entry) => entry.entry.kind === 'turbo'), [info, models])
  // Journey sweep #7 (audit F10/C6): the fetch affordance's truth source.
  // The catalog is pulled lazily — only when a turbo family is actually
  // missing — and the plan counts only families its rows can deliver. The
  // missing-key dep keeps one pull per missing-set (not per render).
  const turboMissing = useMemo(() => turboFamilies.filter(({ detection }) => !detection.available), [turboFamilies])
  const turboMissingKey = turboMissing.map(({ entry }) => entry.id).join('|')
  const [turboCatalogRows, setTurboCatalogRows] = useState<Array<{ id: string; files?: Array<{ path: string }> }> | null>(null)
  useEffect(() => {
    if (!turboMissingKey) return
    let cancelled = false
    void window.minimax.listFetchCatalog()
      .then((result) => { if (!cancelled) setTurboCatalogRows(result.entries) })
      .catch(() => { if (!cancelled) setTurboCatalogRows([]) })
    return () => { cancelled = true }
  }, [turboMissingKey])
  const turboFetchAffordance = useMemo(
    () => turboFetchPlan(turboMissing.map(({ entry }) => entry), turboCatalogRows ?? []),
    [turboMissing, turboCatalogRows],
  )
  // Bindings + validation recompute per render on purpose: validation reads
  // the PERSISTED settings (which lag the draft by the debounce), so the
  // message updates as commits land. Both are cheap single-chain walks.
  const bindings = chainId ? chainBindings(chainId) : []
  const validation = chainId ? validateChain(chainId) : null

  if (!open || !chain || !draft || !tile) return null

  const patch = (part: Partial<CanvasChainSettings>) => setDraft((current) => current ? { ...current, ...part } : current)
  const mode = effectiveMode(draft)
  // ---- The engine-family registry (A-3, directive c250ab36) ----
  // The chain's engine — label, model-override family, and which sections
  // exist — is DATA on the registry entry; this panel renders from it instead
  // of growing a ternary per engine. The fallback covers a malformed settings
  // object (readChainSettings always sets mediaType; belt-and-braces).
  const engineFamily = engineFamilyForChain(draft) ?? engineFamilyForChain({ mediaType: draft.mediaType })!
  // ---- Chain-level model overrides (task euxwdva) ----
  // Picks are registry-anchored and ride chain.settings (settings-vs-results
  // separation: the RESOLVED files ride the take's manifest). Resolution
  // order: this pick > the global Settings pick > auto (inference).
  const modelFamilyId: ModelFamilyId = engineFamily.modelFamilyId
  const modelFamily = modelFamilyInfo(modelFamilyId)!
  // The global layer for THIS family, from the reactive subscription above.
  const globalSlots = modelOverridesByFamily?.[modelFamilyId]
  // Legacy chains may still store a single 'checkpoint' pick — the migrated
  // view keeps it VISIBLE on its new lanes (the resolution seam applies the
  // same migration at submit time).
  const chainSlots = migrateLegacyModelOverrideSlots(modelFamilyId, draft.modelOverrides ?? {})
  const setChainModelOverride = (slot: ModelOverrideSlotName, value: string) => {
    const next: ModelOverrideSlots = { ...(draft.modelOverrides ?? {}) }
    if (value) next[slot] = value
    else delete next[slot]
    patch({ modelOverrides: next })
  }
  const referenceSlots = bindings.length
  const guideWarnings = draft.timelineGuides.map((guide) => guideFrameWarning(guide.seconds, draft.duration)).filter(Boolean) as string[]

  const generate = async () => {
    if (!chainId || submitting) return
    setSubmitting(true)
    try {
      // Commit the draft immediately — submit reads the persisted settings.
      // (A02) A FAILED save aborts here: the previously persisted prompt is
      // never submitted as if the user had authored it.
      if (!await saveDraft(chainId, draft)) return
      await submitChain(chainId)
    } finally {
      setSubmitting(false)
    }
  }

  // Control-track delete (§2.1): the blast radius stated up front — the row
  // and its GC protection go now, the referenced media only at the next
  // store sweep, and nothing else consumes a track today (the pose
  // conditioning lane is parked).
  const deleteControlTrack = async (track: { id: string; kind: string; maskRef: string | null }) => {
    if (!window.confirm(`Delete this ${track.kind} control track?\n\nThe stored row leaves this scene and its media stops being protected from the store's garbage collector (collected only by the next sweep, and only if nothing else references it). No graph consumes a track yet — this does not affect any existing take.`)) return
    const deleted = await useCanvasStore.getState().deleteControlTrack(track.id)
    if (deleted) useCanvasStore.getState().toast('success', 'Control track deleted.')
    else useCanvasStore.getState().toast('error', 'Nothing was deleted — the track was already gone (the panel refreshes).')
  }

  // ---- The structured ⇄ freeform toggle (fh94g76, spec §4) ----
  // `prompt` stays the engine's single source of truth: in structured mode
  // every box edit composes into it; toggling never rewrites it (AC 1 — the
  // string only changes when a box changes).
  const setPromptMode = (next: 'freeform' | 'structured') => {
    if (!draft || draft.promptMode === next) return
    if (next === 'structured') {
      // Switching to structured starts from the parse — deterministic, never
      // lossy. When the stored draft is still the concat of the current
      // string (no freeform edits since), it restores the exact boxes.
      const stored = draft.structured
      const inSync = stored && composeStructuredPrompt(stored, { duration: draft.duration }) === draft.prompt
      patch({ promptMode: 'structured', structured: inSync ? stored : parseStructuredPrompt(draft.prompt) })
    } else {
      // Switching back yields the concat (spec §4): while structured, prompt
      // IS compose(structured) — every box edit recomposes, so the freeform
      // surface shows exactly that string.
      patch({ promptMode: 'freeform' })
    }
  }

  /** Every structured edit re-composes: the submitted string is byte-what-
   *  the-freeform-path-would-send (the concat contract). */
  const applyStructured = (next: StructuredPromptDraft) => {
    patch({ structured: next, prompt: composeStructuredPrompt(next, { duration: draft?.duration ?? 6 }) })
  }

  // ---- Phase 4: the local-LLM prompt tools (the CreateView absorption) ----
  const llmDescriptor = useSessionStore.getState().llm
  const llmAvailable = llmDescriptor ? llmDescriptor.connected && Boolean(llmDescriptor.model) : ollamaModels.length > 0

  const runPromptTool = async (tool: 'enhance' | 'timeline' | 'audio') => {
    if (!chainId || !draft || promptingTool) return
    if (!llmAvailable) {
      setCaptionNotice(null)
      useCanvasStore.getState().toast('error', 'No local text model is available. Connect the llama.cpp router or Ollama in Settings.')
      return
    }
    if (!draft.prompt.trim()) {
      useCanvasStore.getState().toast('error', 'Write a rough prompt first, then ask the local assistant to refine it.')
      return
    }
    // 2026-09-18 retirement (spec AC 4): the timeline tool no longer appends
    // prose to the prompt — it fills the Flow box of the structured editor.
    // The switch below runs the deterministic no-loss parse; the suggestion
    // panel's "fill Flow box" appends the parsed timed rows.
    if (tool === 'timeline' && draft.promptMode !== 'structured') setPromptMode('structured')
    const referenceMap = bindings.length
      ? bindings.map((binding, index) => `<Picture ${index + 1}> = ${binding.label}`)
      : undefined
    setPromptingTool(tool)
    setPromptSuggestion('')
    try {
      await new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)))
      const full = await llmStream.stream({
        task: tool,
        targetEngine: 'minimax-h3',
        length: 'standard',
        instructions: buildPromptAssistantContext(tool, { duration: draft.duration, mode, referenceMap, noDialogue: draft.noDialogue }),
        draft: draft.prompt,
        target: promptStreamTarget.current,
      })
      setPromptSuggestion(full.trim())
    } catch (error) {
      useCanvasStore.getState().toast('error', error instanceof Error ? error.message : String(error))
    } finally {
      setPromptingTool(null)
    }
  }

  /** The retired timeline tool's landing: the suggestion's timed-shot text
   *  parses into flow rows (same grammar compose emits) and appends to the
   *  Flow box; the prompt recomposes. Reads state through setDraft so a
   *  concurrent box edit can never be clobbered. */
  const fillFlowFromSuggestion = () => {
    if (!promptSuggestion) return
    setDraft((current) => {
      if (!current) return current
      const base = current.promptMode === 'structured' && current.structured ? current.structured : parseStructuredPrompt(current.prompt)
      const next: StructuredPromptDraft = { ...base, flow: [...base.flow, ...parseFlowRows(promptSuggestion)] }
      return { ...current, promptMode: 'structured', structured: next, prompt: composeStructuredPrompt(next, { duration: current.duration }) }
    })
    setPromptSuggestion('')
  }

  // Vision captioning of a bound reference picture (the local vision model
  // describes it; the description inserts as a <Picture N> line).
  const captionReference = async (index: number) => {
    const binding = bindings[index]
    if (!binding || captioningIndex !== null) return
    setCaptioningIndex(index)
    setCaptionNotice(null)
    try {
      const dataUrl = await window.minimax.fileDataUrl(binding.file.path)
      const { caption, model } = await window.minimax.llmCaptionImage(dataUrl)
      promptRef.current?.insert(`<Picture ${index + 1}> ${caption}`)
      setCaptionNotice(`Described Picture ${index + 1} with ${model} — inserted into the prompt.`)
    } catch (error) {
      setCaptionNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setCaptioningIndex(null)
    }
  }

  return <Rnd
    className="canvas-inspector canvas-properties"
    data-canvas-inspector
    data-canvas-properties
    style={{ zIndex: dockZ }}
    onPointerDownCapture={() => setDockZ(raiseDock())}
    default={{ x: window.innerWidth - 396, y: 64, width: 356, height: Math.min(760, window.innerHeight - 140) }}
    minWidth={300}
    minHeight={240}
    bounds="parent"
    dragHandleClassName="canvas-inspector-header"
    enableResizing={{ bottom: true, bottomRight: true, right: true, bottomLeft: false, topLeft: false, topRight: false, left: false, top: false }}
  >
    <header className="canvas-inspector-header">
      <strong>{tile.title}</strong>
      <span className="canvas-properties-mode" data-canvas-mode={mode}>{modeLabelFor(draft)}</span>
      <button type="button" aria-label="Close properties" onClick={() => setInspectorOpen(false)}><X size={13} /></button>
    </header>
    {/* (R-23) The mode RULE at choice time — the mode is derived from what
        the chain binds; the audit's finding was that the rule was stated
        nowhere. One line, mode-specific. */}
    <p className="canvas-properties-mode-hint" data-canvas-mode-hint>
      {mode === 'text' ? 'Text-only shot — bind a picture to switch to reference mode; set both end frames for first + last frame mode.'
        : mode === 'image' ? 'First-frame anchored — the bound image starts the shot.'
        : mode === 'frames' ? 'First + last frame anchored — the shot travels between your two frames.'
        : 'Reference-anchored — every bound picture rides the ordered reference set (≤9).'}
    </p>
    <div className="canvas-inspector-body canvas-properties-body">
      <section className="canvas-properties-section" data-canvas-section="prompt">
        <label>Prompt <span className="canvas-properties-hint">// presets</span></label>
        {/* The structured ⇄ freeform toggle (fh94g76): a first-class co-equal
            mode — same submit path, the concat contract keeps the engine
            string identical. */}
        <div className="canvas-properties-promptmode" role="radiogroup" aria-label="Prompt mode" data-canvas-prompt-mode={draft.promptMode}>
          <button type="button" role="radio" aria-checked={draft.promptMode === 'freeform'} data-canvas-prompt-mode-toggle="freeform" className={draft.promptMode === 'freeform' ? 'active' : ''} onClick={() => setPromptMode('freeform')}>freeform</button>
          <button type="button" role="radio" aria-checked={draft.promptMode === 'structured'} data-canvas-prompt-mode-toggle="structured" className={draft.promptMode === 'structured' ? 'active' : ''} onClick={() => setPromptMode('structured')}>structured</button>
        </div>
        {draft.promptMode === 'structured' ? (
          <StructuredPromptEditor
            draft={structuredDraft!}
            duration={draft.duration}
            mode={mode}
            noDialogue={draft.noDialogue}
            composed={draft.prompt}
            llmAvailable={llmAvailable}
            llmStream={llmStream}
            referenceImageShape={(() => {
              // The camera compiler's loop-closure contract needs a connected
              // reference image; text chains have none. The shape is all the
              // pure compiler reads (imageAspect) — derive it from the chain
              // resolution for the image-bearing modes.
              if (mode === 'text') return null
              const [width, height] = (draft.resolution || '1344x768').split('x').map(Number)
              return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { shape: [1, height, width, 3] } : null
            })()}
            pinSources={{
              characters: libraries.characters.map((character) => ({ id: character.id, name: character.name })),
              assets: assets.map((asset) => ({ id: asset.id, label: asset.label, kind: asset.kind })),
              identitySubjectText: chain.identity?.subjectText ?? '',
            }}
            notify={(tone, text) => useCanvasStore.getState().toast(tone, text)}
            onChange={applyStructured}
          />
        ) : (
          <SmartPromptEditor
            ref={promptRef}
            id={`canvas-prompt-${chain.id}`}
            value={draft.prompt}
            onChange={(prompt) => patch({ prompt })}
            placeholder="Describe the shot… type // for production presets"
            ariaLabel="Chain prompt"
          />
        )}
        {/* Phase 4 (§5.5 + L11): the prompt surfaces CreateView carried — the
            local-LLM tools and the community prompt library, properties-side.
            In structured mode the boxes own their content (per-box assists
            replace the whole-prompt tools); the timeline tool is retired into
            the Flow box everywhere (2026-09-18, spec AC 4). */}
        <div className="canvas-properties-prompttools" data-canvas-prompt-tools>
          {/* (R-19) A disabled tool is never a dead end: when no local text
              model is reachable, the Connect action opens Settings docked AT
              the LLM section — one click from the point of need. */}
          {!llmAvailable && (
            <button type="button" className="canvas-chip" data-canvas-llm-connect
              title="Connect a local text model — the llama.cpp router or Ollama, docked at the LLM section (nothing leaves this workstation)"
              onClick={() => useCanvasStore.getState().setSettingsDock(true, 'llm')}>
              Connect a text model…
            </button>
          )}
          {draft.promptMode === 'freeform' && (
            <>
              <button type="button" data-canvas-prompt-tool="enhance" disabled={!llmAvailable || Boolean(promptingTool)} title={!llmAvailable ? 'Connect a local text model (llama.cpp router or Ollama) in Settings — nothing leaves this workstation' : 'Rewrite the prompt for stronger MiniMax video direction'} onClick={() => void runPromptTool('enhance')}>
                {promptingTool === 'enhance' ? <LoaderCircle size={12} className="spin" /> : <WandSparkles size={12} />} enhance
              </button>
              <button type="button" data-canvas-prompt-tool="audio" disabled={!llmAvailable || Boolean(promptingTool)} title={!llmAvailable ? 'Connect a local text model in Settings' : 'Improve ambience, dialogue, and sound cues'} onClick={() => void runPromptTool('audio')}>
                {promptingTool === 'audio' ? <LoaderCircle size={12} className="spin" /> : <Volume2 size={12} />} audio pass
              </button>
            </>
          )}
          <button type="button" data-canvas-prompt-tool="timeline" disabled={!llmAvailable || Boolean(promptingTool)} title={!llmAvailable ? 'Connect a local text model in Settings' : 'Retired 2026-09-18: fills the structured editor\'s Flow box with timed beats (no longer appends prompt text)'} onClick={() => void runPromptTool('timeline')}>
            {promptingTool === 'timeline' ? <LoaderCircle size={12} className="spin" /> : <Clock3 size={12} />} timeline → Flow
          </button>
          <button type="button" data-canvas-prompt-library title="Search public Civitai generation metadata for reusable prompts" onClick={() => setLibraryOpen(true)}>
            <Sparkles size={12} /> library
          </button>
        </div>
        {promptingTool && <div className="canvas-llm-stream" ref={promptStreamTarget} role="status" aria-label="Local assistant streaming" data-canvas-llm-stream />}
        {promptSuggestion && (
          <div className="canvas-prompt-suggestion" data-canvas-prompt-suggestion role="status">
            <span className="canvas-prompt-suggestion-label">Local suggestion</span>
            <textarea aria-label="Local prompt suggestion" value={promptSuggestion} readOnly rows={3} />
            <div className="canvas-prompt-suggestion-actions">
              <button type="button" onClick={() => setPromptSuggestion('')}>dismiss</button>
              {promptingTool === 'timeline' || draft.promptMode === 'structured' ? (
                <button type="button" className="primary" data-canvas-prompt-suggestion-flow onClick={fillFlowFromSuggestion}>fill Flow box</button>
              ) : (
                <button type="button" className="primary" onClick={() => { patch({ prompt: promptSuggestion }); setPromptSuggestion('') }}>use suggestion</button>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="canvas-properties-section" data-canvas-section="engine">
        <label>Engine — {engineFamily.label}</label>
        {draft.mediaType === 'image' && (
          <p className="canvas-properties-note" data-canvas-image-engine-note>
            {engineFamily.note} The image intent renders one H3-1F still per take; image-with-reference hands off to the workbench's Edit surface.
          </p>
        )}
        {engineFamily.panel.audioDock && draft.audio.engine === 'music3' && (
          <div className="canvas-properties-row">
            {/* (2026-09-28 audio-lane pause) The dock link gates with the
                pause reason — an existing audio chain keeps its identity and
                settings; only new authoring is paused. */}
            <button type="button" className="canvas-chip" data-canvas-open-audio-dock disabled={AUDIO_LANE_PAUSED} title={AUDIO_LANE_PAUSED ? AUDIO_LANE_PAUSED_REASON : undefined} onClick={() => useCanvasStore.getState().setAudioDock({ engine: 'music3', chainId: chain.id })}>
              edit in the audio dock…
            </button>
            {AUDIO_LANE_PAUSED && <span className="canvas-properties-hint" data-canvas-audio-paused-hint>{AUDIO_LANE_PAUSED_REASON}</span>}
          </div>
        )}
        {engineFamily.panel.tier && (
          <div className="canvas-properties-row">
            <span>tier</span>
            <div className="canvas-properties-tiers" role="radiogroup" aria-label="Speed tier">
              {TIERS.map((tier) => (
                <button
                  type="button"
                  key={tier.value}
                  role="radio"
                  aria-checked={draft.turbo === tier.value}
                  className={`canvas-chip ${draft.turbo === tier.value ? 'active' : ''}`}
                  data-canvas-tier={tier.value}
                  /* (V1, perfect-state sweep 2026-09-27) The note rides the
                     tooltip: on the chip it made the third tier wrap alone
                     under the row and read as a stray duplicate. */
                  title={tier.note}
                  onClick={() => patch({ turbo: tier.value, ...(tier.value !== 'off' ? { vdn: 'off' as const } : {}) })}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {engineFamily.panel.tier && (
          <div className="canvas-properties-row">
            <span>VDN</span>
            <div className="canvas-properties-tiers" role="radiogroup" aria-label="VDN acceleration">
              {VDN_RUNGS.map((rung) => (
                <button
                  type="button"
                  key={rung.value}
                  role="radio"
                  aria-checked={draft.vdn === rung.value}
                  className={`canvas-chip ${draft.vdn === rung.value ? 'active' : ''}`}
                  data-canvas-vdn={rung.value}
                  onClick={() => patch({ vdn: rung.value, turbo: 'off' })}
                >
                  {rung.label} <small>{rung.note}</small>
                </button>
              ))}
            </div>
            {/* Presence truth, never a dead end: the pack row names the
                install path; a served pack without stages deep-links the
                Library at the exact fetch rows (the engine's own
                vdn_checkpoint enumeration is the stage truth). */}
            {info && (() => {
              const availability = vdnAvailability(info)
              if (!availability.packPresent) {
                return <p className="canvas-properties-note" data-canvas-vdn-note role="note">VDN pack not served by the engine — install vdn-h3 from the Packs board, then refresh the engine.</p>
              }
              const missingStages = [
                ...(availability.dmd ? [] : ['vdn-stage-dmd-250']),
                ...(availability.stageB ? [] : ['vdn-stage-b-2000']),
              ]
              if (missingStages.length) {
                return (
                  <button type="button" className="canvas-chip" data-canvas-vdn-fetch
                    title="Open the library at the model catalog — the VDN stage rows fetch there with consent"
                    onClick={() => useCanvasStore.getState().setLibraryDock(true, missingStages)}>
                    fetch stage{missingStages.length > 1 ? 's' : ''} ({missingStages.length})
                  </button>
                )
              }
              return null
            })()}
          </div>
        )}
        {engineFamily.panel.turboFamily && (
          <div className="canvas-properties-row">
            <label htmlFor="canvas-turbo-family">turbo family</label>
            <select id="canvas-turbo-family" data-canvas-family value={draft.turboFamily} onChange={(event) => patch({ turboFamily: event.target.value })}>
              <option value="">auto — registry-ranked</option>
              {turboFamilies.map(({ entry, detection }) => (
                <option key={entry.id} value={entry.id}>{entry.label}{detection.available ? '' : ' (not installed)'}</option>
              ))}
            </select>
            {/* (R-19 → journey sweep #7, audit F10) "not installed" is never
                a dead end at the choice point — and never a false promise
                either: the affordance counts only families the fetch catalog
                can actually deliver (deep-linking their rows), and says the
                truth when the catalog carries none of them. */}
            {turboFamilies.some(({ detection }) => !detection.available) && turboCatalogRows !== null && (
              turboFetchAffordance.fetchable.length > 0
                ? <button type="button" className="canvas-chip" data-canvas-turbo-fetch
                    title="Open the library at the model catalog — the cataloged turbo LoRAs fetch there with consent"
                    onClick={() => useCanvasStore.getState().setLibraryDock(true, turboFetchAffordance.fetchable.flatMap((entry) => entry.catalogEntryIds))}>
                    fetch missing ({turboFetchAffordance.fetchable.length})
                  </button>
                : <p className="canvas-properties-note" data-canvas-turbo-fetch-note role="note">{turboFetchAffordance.note}</p>
            )}
          </div>
        )}
        {/* Model overrides (euxwdva): collapsed by default — 'auto' (with
            what auto currently resolves to) is the honest default state.
            The section's existence is ENGINE DATA (A-3): image chains render
            through the image workbench, whose model selection is the h3image
            GLOBAL picks (chain-level slots here would be dead controls on
            that path). */}
        {engineFamily.panel.models && <details className="canvas-properties-models" data-canvas-section="models">
          <summary>models <span className="canvas-properties-hint" data-canvas-models-summary>{modelFamily.label} · {overrideLayerSummary(overrideLayerCounts(modelFamily.slots, chainSlots, globalSlots))}</span></summary>
          {modelFamily.slots.map((slot) => {
            const value = chainSlots[slot] ?? ''
            const kind = modelFamily.slotKinds[slot] ?? 'diffusion_models'
            const candidates = models.filter((model) => model.kind === kind)
            const globalPick = globalSlots?.[slot]
            const autoFile = inferredOverrideSlotFile(modelFamilyId, slot, models)
            // (tmz8vh7): the verdict runs on the EFFECTIVE pick — the chain's
            // own, else the global Settings one. Verdicting only the chain's
            // pick rendered a refusing GLOBAL pick as an innocent "auto —
            // global: X" label while every submit refused with no pointer to
            // where the pick lives (audit P1-1's UX wedge).
            const layer: 'chain' | 'global' | null = value ? 'chain' : globalPick ? 'global' : null
            const outcome = (value || globalPick) ? overridePickOutcome(modelFamilyId, slot, value || globalPick || '', models) : null
            return <div className="canvas-properties-row" key={slot} data-canvas-model-override={slot}>
              <label htmlFor={`canvas-model-${slot}`}>{SLOT_LABELS[slot]}</label>
              <select id={`canvas-model-${slot}`} data-canvas-model-override-select={slot} value={value} onChange={(event) => setChainModelOverride(slot, event.target.value)}>
                <option value="">{globalPick ? `auto — global: ${globalPick}` : autoFile ? `auto — ${autoFile}` : 'auto — nothing detected'}</option>
                {/* (M3, perfect-state sweep 2026-09-27) Options carry their
                    CLASS at the choice point — same heuristics the
                    validate-time guards use, before the pick. */}
                {candidates.map((model) => {
                  const hint = modelClassHint(kind, model.name)
                  return <option key={model.name} value={model.name}>{hint ? `${model.name} · ${hint}` : model.name}</option>
                })}
              </select>
              {outcome?.state === 'refused' && <p className="canvas-properties-warning" data-canvas-model-override-problem role="alert">Refused {layer === 'global' ? '(the global Settings pick — clear it in Settings → Model overrides)' : '(this chain\'s pick — clear it to render on auto)'} — {outcome.reason}</p>}
              {outcome?.state === 'degraded' && <p className="canvas-properties-warning" data-canvas-model-override-problem role="status">{layer === 'global' ? 'The global Settings pick ' : 'This chain\'s pick '}{outcome.warning}</p>}
              {outcome?.state === 'applied' && outcome.warning && <p className="canvas-properties-warning" data-canvas-model-override-problem role="status">{layer === 'global' ? 'The global Settings pick ' : 'This chain\'s pick '}{outcome.warning}</p>}
            </div>
          })}
          <p className="canvas-properties-note">A pick here beats the global Settings pick, which beats auto inference. Picks are exact scanned filenames; the resolved files ride the take's manifest. The H3 lanes pin FL2VA / Ref2VA separately; the merged pick is one pre-merged checkpoint for both and wins when set. The VAE picks are decoder-specific (video / audio) — the image decoder is workbench-only.</p>
        </details>}
        {(engineFamily.panel.duration || engineFamily.panel.resolution) && (
          <div className="canvas-properties-row">
            {engineFamily.panel.duration && (<>
              <label htmlFor="canvas-duration">seconds</label>
              <input id="canvas-duration" data-canvas-duration type="number" min={2} max={15} step={1} value={draft.duration} onChange={(event) => patch({ duration: Math.max(2, Math.min(15, Number(event.target.value) || 6)) })} />
            </>)}
            {engineFamily.panel.resolution && (<>
              <label htmlFor="canvas-aspect">ratio</label>
              <select id="canvas-aspect" data-canvas-aspect value={freeRatio ? 'free' : ratioKeyOf(draft.resolution)} onChange={(event) => {
                const next = event.target.value as ReturnType<typeof ratioKeyOf>
                setFreeRatio(next === 'free')
                // Switching ratio lands on ITS optimal pick (the natural
                // gesture: pick the shape, the measured best size follows,
                // then adjust within the ratio's supported list). Free keeps
                // the current dims — the inputs take over from there.
                const optimal = optimalResolutionFor(next)
                if (optimal) patch({ resolution: optimal })
              }}>
                {ASPECT_RATIOS.map((ratio) => <option key={ratio.id} value={ratio.id}>{ratio.label}</option>)}
                <option value="free">free</option>
              </select>
            </>)}
            {engineFamily.panel.resolution && (freeRatio || ratioKeyOf(draft.resolution) === 'free' ? (
              <FreeResolutionInput value={draft.resolution} onCommit={(resolution) => patch({ resolution })} />
            ) : engineFamily.mediaType === 'image' ? (
              // The image lanes' CATEGORIZED list (the 1F full image stack,
              // 2026-09-26): starter-frame / image-focus / video-locked
              // groups, the optimal marker following the session's T=1
              // machinery — canvas images most often feed video chains as
              // starter frames or references, so the starter-frame group
              // leads here.
              <select id="canvas-resolution" data-canvas-resolution value={draft.resolution} onChange={(event) => patch({ resolution: event.target.value })}>
                {tieredResolutionGroups(ratioKeyOf(draft.resolution), { machinery: imageTierMachinery }).flatMap((group) => group.options.map((option) => (
                  <option key={option.value} value={option.value}>{`${group.tier.label} · ${option.value.replace('x', ' × ')}${option.optimal ? ' — optimal' : ''}`}</option>
                )))}
              </select>
            ) : (
              <select id="canvas-resolution" data-canvas-resolution value={draft.resolution} onChange={(event) => patch({ resolution: event.target.value })}>
                {resolutionsForRatio(ratioKeyOf(draft.resolution)).map((option) => <option key={option.value} value={option.value}>{option.value.replace('x', ' × ')}{option.optimal ? ' — optimal' : ''}</option>)}
              </select>
            ))}
          </div>
        )}
        {engineFamily.panel.seed && (
          <div className="canvas-properties-row">
            <label htmlFor="canvas-seed">seed</label>
            <input id="canvas-seed" data-canvas-seed type="number" min={0} max={999_999_999} value={draft.seed} aria-label="Seed" title="Seed (0 to 999,999,999 — the dice rolls this range)" onChange={(event) => patch({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} />
            <button type="button" className="canvas-chip" aria-label="Randomize seed" onClick={() => patch({ seed: Math.floor(Math.random() * 1_000_000_000) })}><Dices size={12} /></button>
          </div>
        )}
      </section>

      {/* The LoRA timeline (7twfk6o) — its OWN section (dated decision
          2026-09-19), disjoint from every other lane's panel work. Video
          chains only (engine data, A-3): painting ranges over the clip's
          duration. */}
      {engineFamily.panel.loraTimeline && models.filter((file) => file.kind === 'loras').length > 0 && (
        <LoraTimelineSection
          chainId={chain.id}
          duration={draft.duration}
          doc={draft.loraTimeline}
          loraNames={models.filter((file) => file.kind === 'loras').map((file) => file.name)}
          formAdapterInstalled={Boolean(info && (info as Record<string, unknown>)['MiniMaxH3LoraFormLoader'] !== undefined)}
          onChange={(loraTimeline) => patch({ loraTimeline })}
          flush={() => saveDraft(chain.id, draft)}
        />
      )}

      <section className="canvas-properties-section" data-canvas-section="references">
        <label>References <span className="canvas-properties-hint">{referenceSlots} of 9 slots</span></label>
        <ol className="canvas-properties-refs" data-canvas-reference-list>
          {bindings.map((binding, index) => (
            <li key={`${binding.file.path}-${index}`} data-canvas-reference={index}>
              <span className="canvas-properties-ref-tag">&lt;Picture {index + 1}&gt;</span>
              <span className="canvas-properties-ref-label">{binding.label}</span>
              {binding.file.kind === 'image' && (
                <button
                  type="button"
                  className="canvas-properties-ref-caption"
                  data-canvas-reference-caption={index}
                  disabled={captioningIndex !== null}
                  title={captioningIndex === index ? 'Describing with the local vision model…' : 'Describe this picture with the local vision model; the description inserts into the prompt'}
                  aria-label={`Caption ${binding.label}`}
                  onClick={() => void captionReference(index)}
                >
                  {captioningIndex === index ? <LoaderCircle size={11} className="spin" /> : <Captions size={11} />}
                </button>
              )}
            </li>
          ))}
          {!bindings.length && <li className="canvas-properties-empty">No references — the chain renders from its prompt{draft.firstFrameOutputId ? ' + first frame' : ''}.</li>}
        </ol>
        {captionNotice && <p className="canvas-properties-note" data-canvas-caption-notice role="status">{captionNotice}</p>}
        {draft.referenceOutputIds.length > 0 && (
          <div className="canvas-properties-row">
            <button
              type="button"
              className="canvas-chip"
              data-canvas-clear-refs
              onClick={() => patch({ referenceOutputIds: [] })}
            >
              clear canvas refs ({draft.referenceOutputIds.length})
            </button>
          </div>
        )}
        {libraries.characters.length > 0 && (
          <div className="canvas-properties-row">
            <label htmlFor="canvas-ref-character">character library</label>
            <select
              id="canvas-ref-character"
              data-canvas-ref-character
              value=""
              onChange={(event) => { if (event.target.value) patch({ referenceCharacterIds: draft.referenceCharacterIds.includes(event.target.value) ? draft.referenceCharacterIds.filter((id) => id !== event.target.value) : [...draft.referenceCharacterIds, event.target.value] }) }}
            >
              <option value="">bind / unbind…</option>
              {libraries.characters.map((character) => (
                <option key={character.id} value={character.id}>{character.name}{draft.referenceCharacterIds.includes(character.id) ? ' ✓' : ''}</option>
              ))}
            </select>
          </div>
        )}
        {libraries.locations.length > 0 && (
          <div className="canvas-properties-row">
            <label htmlFor="canvas-ref-location">location library</label>
            <select
              id="canvas-ref-location"
              data-canvas-ref-location
              value=""
              onChange={(event) => { if (event.target.value) patch({ referenceLocationIds: draft.referenceLocationIds.includes(event.target.value) ? draft.referenceLocationIds.filter((id) => id !== event.target.value) : [...draft.referenceLocationIds, event.target.value] }) }}
            >
              <option value="">bind / unbind…</option>
              {libraries.locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}{draft.referenceLocationIds.includes(location.id) ? ' ✓' : ''}</option>
              ))}
            </select>
          </div>
        )}
        {/* Phase 4 (§2 asset, F3): the GLOBAL asset store — the first bind of
            an asset into this project records the consent-gated fork (lineage
            home), then its curated reference set rides the picture budget. */}
        {assets.length > 0 && (
          <div className="canvas-properties-row">
            <label htmlFor="canvas-ref-asset">global assets</label>
            <select
              id="canvas-ref-asset"
              data-canvas-ref-asset
              value=""
              title="Global store (above projects) — binding forks the asset into this project with lineage, once, on first use"
              onChange={(event) => { const assetId = event.target.value; if (assetId && chainId) void bindGlobalAsset(chainId, assetId) }}
            >
              <option value="">bind / unbind…</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>{asset.kind === 'location' ? 'Location' : 'Character'} · {asset.label}{draft.referenceAssetIds.includes(asset.id) ? ' ✓' : ''}</option>
              ))}
            </select>
          </div>
        )}
        {draft.referenceAssetIds.length > 0 && (
          <div className="canvas-properties-row">
            <button type="button" className="canvas-chip" data-canvas-clear-assets onClick={() => patch({ referenceAssetIds: [] })}>
              clear asset refs ({draft.referenceAssetIds.length})
            </button>
          </div>
        )}
        <div className="canvas-properties-row">
          <label htmlFor="canvas-clothing">clothing policy</label>
          <select id="canvas-clothing" data-canvas-clothing value={draft.clothingPolicy} onChange={(event) => patch({ clothingPolicy: event.target.value as CanvasChainSettings['clothingPolicy'] })}>
            <option value="wardrobe">assigned wardrobe</option>
            <option value="underwear">identity underwear</option>
            <option value="unrestricted">scene prompt decides</option>
          </select>
        </div>
      </section>

      {/* (R-18) Contextual disclosure: identity rides REFERENCES — with no
          reference set and no payload authored, the section is expert
          jargon for a first prompt. Authored content never hides (the
          section stays while subjectText is non-empty). */}
      {(bindings.length > 0 || subjectText.trim() !== '') && <section className="canvas-properties-section" data-canvas-section="identity">
        <label>Identity payload <span className="canvas-properties-hint">re-injected every window</span></label>
        <p className="canvas-properties-anchor" data-canvas-identity-anchor>
          anchor · {referenceSlots ? `${referenceSlots} bound picture${referenceSlots === 1 ? '' : 's'}` : 'no reference set'}
          {chain?.identity?.refAssetIds?.length ? ` · ${chain.identity.refAssetIds.length} asset ref${chain.identity.refAssetIds.length === 1 ? '' : 's'}` : ''}
          {chain?.identity?.refmodIds?.length ? ` · ${chain.identity.refmodIds.length} RefMod${chain.identity.refmodIds.length === 1 ? '' : 's'}` : ''}
        </p>
        <textarea
          data-canvas-identity-subject
          rows={2}
          placeholder="Verbatim subject text — the anchor phrases that keep this chain’s identity stable"
          value={subjectText}
          onChange={(event) => setSubjectText(event.target.value)}
        />
        <div className="canvas-properties-dial" data-canvas-identity-strength={strength}>
          <span className="canvas-properties-dial-label stiff">stiff</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={strength}
            aria-label="Identity strength"
            onChange={(event) => setStrength(Number(event.target.value))}
          />
          <span className="canvas-properties-dial-label drift">drift</span>
          <span className="canvas-properties-dial-value">{strength.toFixed(2)}</span>
        </div>
        <p className="canvas-properties-note">
          Stiff preserves the reference identity exactly; loose lets the take
          drift with the prompt. Re-anchor by forking an earlier take (B).
        </p>
      </section>}

      {/* (R-18) Guides + takes behind disclosure: expert surfaces with
          counts in the summary — present when authored, folded when not. */}
      <details className="canvas-properties-section canvas-properties-disclosure" data-canvas-section="guides" data-guides-count={draft.timelineGuides.length}>
        <summary>Keyframe guides <span className="canvas-properties-hint">{draft.timelineGuides.length ? `${draft.timelineGuides.length} guide${draft.timelineGuides.length === 1 ? '' : 's'} · AddGuide frames` : 'AddGuide frames'}</span></summary>
        {draft.timelineGuides.map((guide, index) => (
          <div className="canvas-properties-row" key={`${guide.file.path}-${index}`} data-canvas-guide={index}>
            <span className="canvas-properties-ref-tag">@</span>
            <input
              type="number"
              min={-draft.duration}
              max={draft.duration}
              step={0.5}
              value={guide.seconds}
              aria-label={`Guide ${index + 1} seconds`}
              onChange={(event) => patch({ timelineGuides: draft.timelineGuides.map((entry, guideIndex) => guideIndex === index ? { ...entry, seconds: Number(event.target.value) } : entry) })}
            />
            <span className="canvas-properties-ref-label">{guide.file.name}</span>
            <button type="button" aria-label={`Remove guide ${index + 1}`} onClick={() => patch({ timelineGuides: draft.timelineGuides.filter((_, guideIndex) => guideIndex !== index) })}><X size={11} /></button>
          </div>
        ))}
        {guideWarnings.map((warning) => <p key={warning} className="canvas-properties-warning" role="alert">{warning}</p>)}
        <div className="canvas-properties-row">
          <button
            type="button"
            className="canvas-chip"
            data-canvas-add-guide
            onClick={async () => {
              const picked = await window.minimax.chooseMedia('image')
              if (!picked) return
              patch({ timelineGuides: [...draft.timelineGuides, { file: { ...picked, kind: 'image' }, seconds: Math.min(draft.duration - 1, 1) }] })
            }}
          >
            + guide image
          </button>
        </div>
      </details>

      <details className="canvas-properties-section canvas-properties-disclosure" data-canvas-section="takes" data-takes-count={tile.takes.length} open={tile.takes.length > 0}>
        <summary>Takes <span className="canvas-properties-hint">{tile.priors} prior{tile.priors === 1 ? '' : 's'}{tile.canonical ? ' · 1 canonical' : ' · none yet'}</span></summary>
        <ul className="canvas-properties-takes" data-canvas-takes>
          {tile.takes.slice(0, 5).map((take) => (
            <li key={take.id} data-canvas-take={take.id} className={take.supersededBy ? 'prior' : 'canonical'}>
              <span>{take.id.slice(0, 8)}</span>
              {take.supersededBy
                ? <button type="button" data-canvas-take-restore={take.id} title="Make this take canonical — nothing is deleted; unlocked downstream forks go stale" onClick={() => { void useCanvasStore.getState().switchCanonical(chain.id, take.id) }}>restore</button>
                : <span className="canvas-properties-canonical"><Star size={10} fill="currentColor" /> canonical</span>}
            </li>
          ))}
          {!tile.takes.length && <li className="canvas-properties-empty">No takes yet.</li>}
        </ul>
      </details>

      {/* Control tracks (§2.1 rows — written by the pose rig dock's export).
          Present only when authored, per the R-18 disclosure discipline. */}
      {(chain?.controlTracks?.length ?? 0) > 0 && <details className="canvas-properties-section canvas-properties-disclosure" data-canvas-section="control-tracks" data-control-tracks-count={chain!.controlTracks!.length}>
        <summary>Control tracks <span className="canvas-properties-hint">{chain!.controlTracks!.length} stored · {chain!.controlTracks!.every((track) => track.kind === chain!.controlTracks![0]!.kind) ? chain!.controlTracks![0]!.kind : 'mixed'}</span></summary>
        {chain!.controlTracks!.map((track) => (
          <div className="canvas-properties-row" key={track.id} data-canvas-control-track={track.id}>
            <span className="canvas-properties-ref-tag">§</span>
            <span className="canvas-properties-ref-label">{track.kind}{track.maskRef ? ' · mask' : ''}</span>
            <button
              type="button"
              aria-label={`Delete control track ${track.kind}`}
              data-canvas-control-track-delete={track.id}
              title="Delete this control track — the stored row and its GC protection go; the media itself is only collected by the next store sweep"
              onClick={() => { void deleteControlTrack(track) }}
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <p className="canvas-properties-note">
          Pose/control data stored for this scene. No graph lane consumes a
          track yet — the conditioning consumer is the parked pose lane.
        </p>
      </details>}

    </div>
      {libraryOpen && <PromptLibraryBrowser onClose={() => setLibraryOpen(false)} onInsert={(prompt) => {
        // AC 5: in structured mode a library entry loads as a BOX-SET — the
        // same best-effort parse the round-trip uses, append-merged so an
        // insert can never drop existing box content.
        if (draft.promptMode === 'structured' && draft.structured) {
          applyStructured(mergeStructuredDraft(draft.structured, parseStructuredPrompt(prompt)))
          useCanvasStore.getState().toast('neutral', 'Library entry parsed into the boxes — best-effort, nothing replaced.')
        } else {
          promptRef.current?.insert(prompt)
        }
      }} />}
      <footer className="canvas-properties-submit">
        <div className="canvas-properties-state">
          <span className="canvas-tile-ring" data-status={tile.status} /> {STATUS_LABEL[tile.status]}
        </div>
        {validation && <p className="canvas-properties-warning" data-canvas-validation role="alert">{validation}</p>}
        {/* (A02) Save state beside the action — a failed save blocks
            submission, so it must be readable here, not only in a vanishing
            toast. Existing notice classes, no new tokens. */}
        {saveState && <p
          className={saveState === 'failed' ? 'canvas-properties-warning' : 'canvas-properties-note'}
          data-canvas-save-state={saveState}
          role={saveState === 'failed' ? 'alert' : 'status'}
        >
          {saveState === 'saving' ? 'Saving draft…'
            : saveState === 'saved' ? 'Draft saved.'
            : `Draft not saved — ${saveError ?? 'the save failed'}. Generate retries the save before submitting.`}
        </p>}
        {tile.jobId && (tile.status === 'running' || tile.status === 'queued-gpu')
          ? <button type="button" className="canvas-properties-generate" data-canvas-cancel onClick={() => void cancelChainJob(chain.id)}><Square size={12} /> stop</button>
          : <button type="button" className="canvas-properties-generate" data-canvas-generate onClick={() => void generate()} disabled={submitting}>
            <Play size={12} /> generate · {modeLabelFor(draft)}
          </button>}
      </footer>
  </Rnd>
}
