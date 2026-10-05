/**
 * GalleryApp — the component gallery surface (component vocabulary task 23,
 * Flux k2q0n9s): the kit's STATE MATRICES exhibited as DATA. The matrices
 * live in the react-free ./matrices.ts (node-tested); this component only
 * RENDERS them — one renderer arm per section id, no hardcoded cell lists —
 * so a cell can never silently disappear from the gallery without the data
 * (and its suite) noticing.
 *
 * What the surface is:
 *   - a registered SURFACE (?gallery=1, the registry append) with the shared
 *     titlebar chrome (SurfaceSwitcher) like datasets and the workbench;
 *   - a COMPOSER, not a store: every demo holds its own local useState and
 *     feeds the kit components REAL props (P07's pure-props doctrine — the
 *     gallery adds no store, no persistence, no engine, no fetches);
 *   - an EXHIBIT of the existing recipes ONLY: the geometry classes here are
 *     this surface's own (P06), while the exhibited components render in
 *     their real skin — including canvas.css's retained geometry (toast
 *     items, dock headers, the menu backdrop), imported below for exactly
 *     that purpose. No new colors, fonts, or shared recipes.
 *
 * The e2e contract (e2e/gallery.spec.ts): every declared cell is reachable
 * at [data-gallery-cell="{section}.{cell}"]; N/A cells render their reason
 * (data-gallery-na); the hover/focus cells (data-gallery-driver) are driven
 * by the suite's REAL hover()/keyboard focus — this app never toggles a
 * synthetic class.
 */
import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { Command, LayoutGrid } from 'lucide-react'
import { SurfaceSwitcher } from '../surfaces/SurfaceSwitcher'
import { GALLERY_SECTIONS, galleryCounts, type GalleryCell, type GalleryRenderCell, type GallerySection } from './matrices'
import { Button, type ButtonVariant } from '../ui/Button'
import { Chip, ChipGroup, type ChipTone } from '../ui/Chip'
import { ProgressBar, type ProgressTone } from '../ui/ProgressBar'
import { ToastHost, type ToastEntry, type ToastPlacement, type ToastTone } from '../ui/ToastHost'
import { NoticeBanner, type NoticeRole, type NoticeTone } from '../ui/NoticeBanner'
import { SaveStatus, type SaveState } from '../ui/SaveStatus'
import { Refusal, type RefusalSatisfy } from '../ui/Refusal'
import { HandoffResult, type HandoffRefreshState, type HandoffStep, type HandoffWriteState } from '../ui/HandoffResult'
import { EffectiveSettingRow } from '../ui/EffectiveSettingRow'
import type { EffectiveRowAttempt, EffectiveRowOrigin } from '../ui/effectiveRowClasses'
import { Field } from '../ui/Field'
import { StudioSelect } from '../ui/StudioSelect'
import { PopoverMenu } from '../ui/PopoverMenu'
import { StudioDock } from '../ui/StudioDock'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { PromptDialog } from '../ui/PromptDialog'
// The exhibited recipes' real skin: the toast item vocabulary, the dock
// header chrome, and the menu backdrop rules live in the canvas sheet — the
// gallery shows the components as the app styles them, never a re-derivation.
import '../canvas/canvas.css'
import './gallery.css'

// ---- section renderers (one arm per section id; missing arms throw) ------

function ButtonCell({ cell }: { cell: GalleryRenderCell }) {
  const variant = cell.axes.variant as ButtonVariant
  const state = cell.axes.state
  if (variant === 'icon') {
    return (
      <Button variant="icon" className="gallery-btn" aria-label="Open the index" icon={<Command size={13} />} busy={state === 'busy'} disabled={state === 'disabled'} />
    )
  }
  return (
    <Button variant={variant} className="gallery-btn" busy={state === 'busy'} disabled={state === 'disabled'}>
      {state === 'busy' ? 'Checking…' : `Run ${variant}`}
    </Button>
  )
}

function ChipCell({ cell }: { cell: GalleryRenderCell }) {
  const tone = cell.axes.tone as ChipTone
  const state = cell.axes.state
  return (
    <Chip tone={tone} selected={state === 'selected'} busy={state === 'busy'} className="gallery-chip">
      {tone}
    </Chip>
  )
}

function ChipGroupRadios({ initial }: { initial: string | null }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <ChipGroup exclusive value={value} onChange={(next) => setValue(String(next))} aria-label="Media type" className="gallery-chip-row" data-gallery-chip-value={value ?? 'none'}>
      <Chip id="video" variant="radio" tone="accent">video</Chip>
      <Chip id="image" variant="radio">image</Chip>
      <Chip id="audio" variant="radio">audio</Chip>
    </ChipGroup>
  )
}

function ChipToggleCell({ pressed }: { pressed: boolean }) {
  const [on, setOn] = useState(pressed)
  return (
    <Chip variant="toggle" selected={on} onClick={() => setOn(!on)} className="gallery-chip" data-gallery-toggle={on ? 'pressed' : 'unpressed'}>
      {`no dialogue · ${on ? 'on' : 'off'}`}
    </Chip>
  )
}

function ChipGroupCell({ cell }: { cell: GalleryRenderCell }) {
  const shape = cell.axes.shape
  if (shape === 'radiogroup-none') return <ChipGroupRadios initial={null} />
  if (shape === 'radiogroup-selected') return <ChipGroupRadios initial="image" />
  return <ChipToggleCell pressed={shape === 'toggle-pressed'} />
}

function ProgressCell({ cell }: { cell: GalleryRenderCell }) {
  const mode = cell.axes.mode
  const tone = (cell.axes.tone === 'local' ? 'local' : 'accent') as ProgressTone
  const style: CSSProperties = tone === 'local' ? ({ '--bar-tone': 'var(--color-info)' } as CSSProperties) : {}
  return (
    <div className="gallery-progress" style={style}>
      <ProgressBar
        aria-label={`${mode} bar, ${cell.axes.size}, ${tone}`}
        value={mode === 'partial' ? 0.35 : mode === 'full' ? 1 : mode === 'empty' ? null : undefined}
        indeterminate={mode === 'indeterminate'}
        compact={cell.axes.size === 'compact'}
        tone={tone}
      />
    </div>
  )
}

const TOAST_TEXT: Record<ToastTone, string> = {
  error: 'Render failed — the engine closed the socket mid-sample',
  success: 'Take landed on the canvas',
  neutral: 'Render queued behind 2 jobs',
}

function ToastCell({ tone, placement }: { tone: ToastTone; placement: ToastPlacement }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([{ id: 1, tone, text: TOAST_TEXT[tone] }])
  return (
    <div className={`gallery-toast-frame${placement === 'bottom-right' ? ' gallery-toast-frame--fixed' : ''}`} data-gallery-toast-frame={placement}>
      <ToastHost toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((entry) => entry.id !== id))} placement={placement} className="gallery-toast-host" />
    </div>
  )
}

const NOTICE_TEXT: Record<NoticeTone, string> = {
  accent: 'Session writes flush every 2 s — the queue drains in order.',
  danger: 'The engine closed the connection mid-sample — the job was cancelled.',
}

function NoticeCell({ tone, role, dismiss }: { tone: NoticeTone; role: NoticeRole; dismiss: string }) {
  const [shown, setShown] = useState(true)
  if (!shown) {
    return <Button variant="ghost" className="gallery-btn" onClick={() => setShown(true)}>restore the banner</Button>
  }
  return (
    <NoticeBanner tone={tone} role={role} onDismiss={dismiss === 'dismissible' ? () => setShown(false) : undefined} className="gallery-notice">
      {NOTICE_TEXT[tone]}
    </NoticeBanner>
  )
}

function SaveCell({ cell }: { cell: GalleryRenderCell }) {
  const state = cell.axes.state as SaveState
  const retry = cell.axes.retry === 'present'
  const [count, setCount] = useState(0)
  return (
    <>
      {count > 0 ? <span className="gallery-count" data-gallery-retry-count={count}>{`retry fired × ${count}`}</span> : null}
      <SaveStatus
        state={state}
        label="draft"
        detail={state === 'failed' ? '422 Unprocessable Entity — resolution not in the family set' : undefined}
        onRetry={retry ? () => setCount((current) => current + 1) : undefined}
      />
    </>
  )
}

function RefusalCell({ cell }: { cell: GalleryRenderCell }) {
  const withSatisfy = cell.axes.satisfy === 'present'
  const [count, setCount] = useState(0)
  const satisfy: RefusalSatisfy | undefined = withSatisfy
    ? { label: 'Open settings — engine connection', action: () => setCount((current) => current + 1) }
    : undefined
  return (
    <div data-gallery-satisfy-count={count}>
      <Refusal
        title="Generate (T=1 Fast) is not available"
        reason={withSatisfy ? 'The image engine reports no checkpoint loaded for the T=1 lane.' : 'No local LLM is connected — the distill and enhance assists cannot run, and none can be started from here.'}
        satisfy={satisfy}
      />
    </div>
  )
}

function HandoffCell({ cell }: { cell: GalleryRenderCell }) {
  const write = cell.axes.write as HandoffWriteState
  const refresh = cell.axes.refresh as HandoffRefreshState
  const [count, setCount] = useState(0)
  const detail = write === 'failed'
    ? '500 Internal Server Error — the documents route rejected the chain'
    : refresh === 'stale'
      ? 'the canvas rehydrated before the write landed'
      : refresh === 'failed'
        ? 'the reload request errored (timeout)'
        : undefined
  const steps: HandoffStep[] = [{ id: 'seed', label: 'Seed the video chain', write, refresh, detail }]
  return (
    <div data-gallery-retry-count={count}>
      <HandoffResult steps={steps} onRetry={() => setCount((current) => current + 1)} />
    </div>
  )
}

const EFFECTIVE_VALUE: Record<string, string> = {
  auto: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
  chain: 'TenStrip_10Eros-Max_beta5_int8.safetensors',
  'chain-attempt': 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
  global: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
  'global-attempt': 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
}

function EffectiveRowCell({ cell }: { cell: GalleryRenderCell }) {
  const originKey = cell.axes.origin
  const attemptKind = cell.axes.attempt
  const hasAttempt = attemptKind !== 'none'
  const origin: EffectiveRowOrigin = originKey === 'auto'
    ? { kind: 'auto' }
    : { kind: 'override', level: originKey as 'chain' | 'global' }
  // The attempt names the level that HOLDS the refused/degraded pick: a
  // chain row's attempt is the chain pick; an auto row's attempt is a
  // refused global pick with nothing standing beneath it.
  const attempt: EffectiveRowAttempt | undefined = hasAttempt
    ? { level: originKey === 'chain' ? 'chain' : 'global', outcome: attemptKind as 'refused' | 'degraded' }
    : undefined
  const valueKey = hasAttempt ? `${originKey === 'auto' ? 'global' : originKey}-attempt` : originKey
  const [count, setCount] = useState(0)
  return (
    <div data-gallery-reset-count={count}>
      <EffectiveSettingRow
        label="FL2VA checkpoint"
        value={EFFECTIVE_VALUE[valueKey] ?? ''}
        origin={origin}
        attempt={attempt}
        onReset={cell.axes.reset === 'present' ? () => setCount((current) => current + 1) : undefined}
      />
    </div>
  )
}

function FieldCell({ cell }: { cell: GalleryRenderCell }) {
  const hasError = cell.axes.error === 'present'
  const hasHint = cell.axes.hint === 'present'
  return (
    <Field
      label="Trigger token"
      htmlFor={`gallery-field-${cell.id}`}
      error={hasError ? 'the token must start with a letter (a–z) — digits are reserved for layers' : undefined}
      hint={hasHint ? 'the token the dataset watcher keys captions on' : undefined}
    >
      <input className="gallery-input" defaultValue="ph0t0r34l" />
    </Field>
  )
}

const LONG_OPTION = 'res_multistep-sde-dpmpp-3m-sde-karras-ancestral (a very long sampler name)'

function SelectCell({ cell }: { cell: GalleryRenderCell }) {
  const form = cell.axes.wrap === 'form'
  const long = cell.axes.content === 'long'
  return (
    <StudioSelect
      wrapClassName={form ? 'select-wrap' : undefined}
      chevronSize={form ? 15 : 13}
      className="gallery-select"
      aria-label="Sampler"
      data-gallery-select={`${cell.axes.wrap}-${cell.axes.content}`}
    >
      <option value="euler">euler</option>
      {long ? <option value="long">{LONG_OPTION}</option> : <option value="dpmpp">dpmpp_2m</option>}
    </StudioSelect>
  )
}

function PopoverCell() {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: 120, top: 120 })
  return (
    <div className="gallery-stack">
      <Button
        variant="secondary"
        className="gallery-btn"
        data-gallery-open-menu
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setPosition({ left: Math.round(rect.left), top: Math.round(rect.bottom + 6) })
          setOpen(true)
        }}
      >
        open the anchored menu
      </Button>
      <PopoverMenu
        layerId="gallery-popover"
        open={open}
        onClose={() => setOpen(false)}
        position={position}
        backdrop
        className="gallery-menu"
        role="menu"
        aria-label="Gallery demo menu"
        data-gallery-menu
      >
        <header><strong>Produce into — extensions</strong></header>
        <button type="button" className="gallery-menu-row" onClick={() => setOpen(false)}>video · extend the chain</button>
        <button type="button" className="gallery-menu-row" onClick={() => setOpen(false)}>image · last frame</button>
        <button type="button" className="gallery-menu-row" disabled>audio · lane paused</button>
        <button type="button" className="gallery-menu-row" onClick={() => setOpen(false)}>fork the substrate</button>
      </PopoverMenu>
    </div>
  )
}

function DockArenaCell({ band }: { band: 'solo' | 'stacked-pair' }) {
  // Closed state per dock — closing one leaves the other standing (the
  // band compresses over the survivor), exactly like the real surfaces.
  const [closed, setClosed] = useState<string | null>(null)
  const restore = <Button variant="ghost" className="gallery-btn" onClick={() => setClosed(null)}>restore the closed dock</Button>
  return (
    <div className="gallery-dock-arena" data-gallery-dock-arena>
      {closed !== null ? restore : null}
      {closed !== 'a' && (
        <StudioDock
          id="gallery-dock-a"
          title={<strong>Demo dock — settings shape</strong>}
          closeLabel="Close the demo dock"
          onClose={() => setClosed('a')}
          geometry={{ x: 20, y: 16, width: 420, height: 280 }}
          dockClassName="gallery-dock"
          errorBoundary="gallery demo dock a"
          data-gallery-dock="a"
        >
          <div className="gallery-dock-body">drag the header to move · resize from the bottom/right edges · a grab anywhere raises the dock</div>
        </StudioDock>
      )}
      {band === 'stacked-pair' && closed !== 'b' && (
        <StudioDock
          id="gallery-dock-b"
          title={<strong>Demo dock — diagnostics shape</strong>}
          closeLabel="Close the second demo dock"
          onClose={() => setClosed('b')}
          geometry={{ x: 150, y: 150, width: 420, height: 280 }}
          dockClassName="gallery-dock"
          errorBoundary="gallery demo dock b"
          data-gallery-dock="b"
        >
          <div className="gallery-dock-body">two docks share the band: z = calc(var(--z-dock-base) + rank), consecutive and renormalized</div>
        </StudioDock>
      )}
    </div>
  )
}

function ConfirmCell({ danger }: { danger: boolean }) {
  const [open, setOpen] = useState(false)
  const [resolved, setResolved] = useState('(unresolved)')
  return (
    <div className="gallery-stack">
      <Button variant="secondary" className="gallery-btn" data-gallery-open-dialog onClick={() => setOpen(true)}>
        {danger ? 'open the destructive ask' : 'open the confirm'}
      </Button>
      <span className="gallery-readout">last resolve: <span data-gallery-resolve>{resolved}</span></span>
      {open ? (
        <ConfirmDialog
          layerId="gallery-confirm"
          danger={danger}
          title={danger ? 'Delete the dataset layer?' : 'Re-run the caption pass?'}
          body={danger
            ? 'This deletes the layer and its 4 crops. The source file stays on disk. There is no undo.'
            : 'The caption pass rewrites drafts for the 12 selected items. Completed captions are not touched.'}
          onResolve={(ok) => { setOpen(false); setResolved(ok ? 'true' : 'false') }}
        />
      ) : null}
    </div>
  )
}

function PromptCell({ prefilled }: { prefilled: boolean }) {
  const [open, setOpen] = useState(false)
  const [resolved, setResolved] = useState('(unresolved)')
  return (
    <div className="gallery-stack">
      <Button variant="secondary" className="gallery-btn" data-gallery-open-dialog onClick={() => setOpen(true)}>
        {prefilled ? 'open the prefilled prompt' : 'open the empty prompt'}
      </Button>
      <span className="gallery-readout">last resolve: <span data-gallery-resolve>{resolved}</span></span>
      {open ? (
        <PromptDialog
          layerId="gallery-prompt"
          title="Rename the layer"
          label="Layer name — the name the export stamps on every crop"
          initial={prefilled ? 'vision-clip — layered' : ''}
          onResolve={(value) => { setOpen(false); setResolved(value === null ? 'null' : `"${value}"`) }}
        />
      ) : null}
    </div>
  )
}

function DialogCell({ cell }: { cell: GalleryRenderCell }) {
  const shape = cell.axes.shape
  if (shape === 'confirm-neutral') return <ConfirmCell danger={false} />
  if (shape === 'confirm-danger') return <ConfirmCell danger />
  return <PromptCell prefilled={shape === 'prompt-prefilled'} />
}

function LayerStackCell({ cell }: { cell: GalleryRenderCell }) {
  const stack = cell.axes.stack
  const [lower, setLower] = useState(false)
  const [upper, setUpper] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number }>({ left: 200, top: 200 })
  const openUpperDialog = () => setUpper(true)
  const openUpperMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setMenuPosition({ left: Math.round(rect.left), top: Math.round(rect.bottom + 6) })
    setUpper(true)
  }
  return (
    <div className="gallery-stack">
      <Button variant="secondary" className="gallery-btn" data-gallery-open-stack onClick={() => setLower(true)}>
        {stack === 'dialog-over-dialog' ? 'open the lower ask, then the upper' : 'open the ask, then a menu over it'}
      </Button>
      <span className="gallery-readout">one Escape unwinds exactly the topmost layer — press it twice and watch the order.</span>
      {lower ? (
        <ConfirmDialog
          layerId="gallery-layers-lower"
          title="Merge the reference lanes?"
          body={(
            <>
              <p>The merge folds the pose and lighting references into one identity payload.</p>
              <Button variant="ghost" className="gallery-btn" data-gallery-open-upper onClick={stack === 'dialog-over-dialog' ? openUpperDialog : openUpperMenu}>
                {stack === 'dialog-over-dialog' ? 'open the upper ask…' : 'open a menu over this ask…'}
              </Button>
            </>
          )}
          onResolve={() => setLower(false)}
        />
      ) : null}
      {lower && upper && stack === 'dialog-over-dialog' ? (
        <ConfirmDialog
          layerId="gallery-layers-upper"
          danger
          title="Discard the lighting lane?"
          body="The lighting reference leaves the payload. The pose lane is untouched."
          onResolve={() => setUpper(false)}
        />
      ) : null}
      {lower && upper && stack === 'popover-over-dialog' ? (
        <PopoverMenu
          layerId="gallery-layers-menu"
          open
          onClose={() => setUpper(false)}
          position={menuPosition}
          backdrop
          className="gallery-menu"
          role="menu"
          aria-label="Gallery stack menu"
          data-gallery-stack-menu
        >
          <header><strong>Transport</strong></header>
          <button type="button" className="gallery-menu-row" onClick={() => setUpper(false)}>keep both lanes</button>
          <button type="button" className="gallery-menu-row" onClick={() => setUpper(false)}>pose only</button>
        </PopoverMenu>
      ) : null}
    </div>
  )
}

/** One renderer arm per section id — the node suite pins this key set against the data. */
const SECTION_RENDERERS: Record<string, (cell: GalleryRenderCell) => ReactNode> = {
  'button': (cell) => <ButtonCell cell={cell} />,
  'chip': (cell) => <ChipCell cell={cell} />,
  'chip-group': (cell) => <ChipGroupCell cell={cell} />,
  'progress': (cell) => <ProgressCell cell={cell} />,
  'toast': (cell) => <ToastCell tone={cell.axes.tone as ToastTone} placement={cell.axes.placement as ToastPlacement} />,
  'notice': (cell) => <NoticeCell tone={cell.axes.tone as NoticeTone} role={cell.axes.role as NoticeRole} dismiss={cell.axes.dismiss} />,
  'save-status': (cell) => <SaveCell cell={cell} />,
  'refusal': (cell) => <RefusalCell cell={cell} />,
  'handoff': (cell) => <HandoffCell cell={cell} />,
  'effective-row': (cell) => <EffectiveRowCell cell={cell} />,
  'field': (cell) => <FieldCell cell={cell} />,
  'select': (cell) => <SelectCell cell={cell} />,
  'popover': () => <PopoverCell />,
  'dock': (cell) => <DockArenaCell band={cell.axes.band as 'solo' | 'stacked-pair'} />,
  'dialogs': (cell) => <DialogCell cell={cell} />,
  'layers': (cell) => <LayerStackCell cell={cell} />,
}

function cellLabel(section: GallerySection, cell: GalleryCell): string {
  return section.axes.map((axis) => cell.axes[axis.name]).join(' · ')
}

export function GalleryApp() {
  const counts = galleryCounts()
  return (
    <div className="gallery-root" data-gallery-root>
      <header className="gallery-titlebar">
        <div className="gallery-brand"><LayoutGrid size={16} /> Component gallery</div>
        {/* The shared registry-driven chrome every registered surface carries. */}
        <SurfaceSwitcher />
        <div className="gallery-titlebar-right">
          <span
            className="gallery-counter"
            data-gallery-counts
            data-sections={counts.sections}
            data-cells={counts.cells}
            data-rendered={counts.rendered}
            data-na={counts.na}
          >
            {`${counts.sections} components · ${counts.rendered} cells · ${counts.na} justified N/A`}
          </span>
        </div>
      </header>
      <main className="gallery-body">
        {GALLERY_SECTIONS.map((section) => {
          const rendered = section.cells.filter((cell) => cell.kind === 'render').length
          return (
            <section key={section.id} className="gallery-section" data-gallery-section={section.id} data-cells={section.cells.length} data-rendered={rendered} data-na={section.cells.length - rendered}>
              <header className="gallery-section-header">
                <h2>{section.component}</h2>
                <p>{section.blurb}</p>
                <span className="gallery-section-axes">{section.axes.map((axis) => `${axis.name}: ${axis.values.join(' · ')}`).join('  ×  ')}</span>
              </header>
              <div className="gallery-cells">
                {section.cells.map((cell) => {
                  const key = `${section.id}.${cell.id}`
                  if (cell.kind === 'na') {
                    return (
                      <div key={cell.id} className="gallery-cell gallery-cell--na" data-gallery-cell={key} data-gallery-na>
                        <span className="gallery-cell-label">{cellLabel(section, cell)}</span>
                        <p className="gallery-na">N/A — {cell.reason}</p>
                      </div>
                    )
                  }
                  const renderer = SECTION_RENDERERS[section.id]
                  if (!renderer) throw new Error(`gallery: no renderer arm for section "${section.id}"`)
                  return (
                    <div key={cell.id} className="gallery-cell" data-gallery-cell={key} data-gallery-driver={cell.driver}>
                      <span className="gallery-cell-label">{cellLabel(section, cell)}</span>
                      <div className="gallery-cell-stage" data-gallery-stage>{renderer(cell)}</div>
                      {cell.note ? <p className="gallery-note" data-gallery-note>{cell.note}</p> : null}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </main>
    </div>
  )
}
