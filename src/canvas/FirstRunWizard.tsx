/**
 * The first-run walk (wizard rework spec §2, task 3p14abm) — five steps, the
 * blessed order ("the footer progress becomes five"):
 *
 *   1. ENGINE     — the connection as a CANDIDATE (spec §2.1): the typed URL
 *                  lives in the walk's candidate state and is NEVER saved
 *                  mid-walk (the old per-keystroke setSettings writes died
 *                  here); Test verifies the candidate through the honest
 *                  candidate-scoped path (task 2's `?url=` seams); the
 *                  consent-gated port probe adopts WITH a test in one click;
 *                  honest connect-later; managed stays a pointer (D2).
 *   2. MODELS     — the engine's inventory readout + stack verdict
 *                  (task 5 reworks the slot to named per-component truth).
 *   3. NODE PACKS — the pack board summary (task 6 reworks the slot).
 *   4. LAN PREP   — the honest keep-current panel (task 7's full
 *                  designation lands here).
 *   5. FIRST PROMPT — one prompt spawns the first canvas chain (task 8
 *                  reworks the slot; today's PromptStep holds it).
 *
 * The CANDIDATE contract (spec §3): everything the walk collects is held in
 * `wizardWalk`'s candidate state — nothing persists mid-walk, skip persists
 * nothing (D3: the notice catches, `--setup` re-opens), and the exit's
 * one-motion write lands in task 8. The FirstRunNotice STAYS as the
 * fallback surface (its latch is keep-listed).
 */
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Check, RefreshCw, Sparkles, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { dbg } from '../lib/dbg'
import { basenameOf } from '../lib/modelSelection'
import { h3StackReport, stackVerdictText, type StackVerdict } from '../lib/h3Stack'
import type { AppSettings, FetchEntryStatus } from '../types'
import { useSessionStore } from '../state/sessionStore'
import { useCanvasStore } from './store'
import { CanvasSessionContext } from './sessionContext'
import { WIZARD_REOPEN_EVENT } from './FirstRunNotice'
import { DesignationField } from './DesignationField'
import { DIGEST_INTERIM_COPY, modelsStepRows, type ComponentFetchView, type ModelsStepRow } from './wizardModels'
import {
  WALK_STEPS,
  emptyWalkCandidate,
  isDesignated,
  lanGate,
  markEngineVerified,
  modelsGate,
  modelsRootPrefill,
  packsGate,
  promptGate,
  setCandidateUrl,
  setDestinationValue,
  shouldPresent,
  type DestinationState,
  type StepGate,
  type WalkCandidate,
} from './wizardWalk'

const WIZARD_KEY = 'monoka.wizard'

/** Fired on every wizard-state write — the FirstRunNotice listens instead of
 *  polling (it shows the moment the wizard stops presenting). */
export const WIZARD_STATE_EVENT = 'monoka:wizard-state'

type WizardState = { step: number; done: boolean; skipped: boolean }

function readWizard(): WizardState {
  try {
    const raw = localStorage.getItem(WIZARD_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WizardState>
      if (typeof parsed.step === 'number') return { step: parsed.step, done: parsed.done === true, skipped: parsed.skipped === true }
    }
  } catch { /* fall through to the fresh state */ }
  return { step: 0, done: false, skipped: false }
}

function writeWizard(state: WizardState): void {
  try { localStorage.setItem(WIZARD_KEY, JSON.stringify(state)) } catch { /* private mode — this session only */ }
  try { window.dispatchEvent(new Event(WIZARD_STATE_EVENT)) } catch { /* no window in tests */ }
}

/** The probe list for the engine step (R-24): 8188 is ComfyUI's canonical
 * port — the shipped default (maintainer ruling 2026-10-15: match the
 * world; supersedes the 2026-10-02 8189 box-specific rail) — and 8189+
 * are the studio/testbed conventions. The probe is EXPLICIT
 * (the button is the consent — nothing probes on its own). */
const COMMON_PORTS = [8188, 8189, 8190, 8191, 8192]

const STEP_TITLES = WALK_STEPS

export function FirstRunWizard() {
  const context = useContext(CanvasSessionContext)
  const models = useSessionStore((state) => state.models)
  const scanning = useSessionStore((state) => state.scanning)
  const settings = useSessionStore((state) => state.settings)
  const modelRootIsDefault = useSessionStore((state) => state.modelRootIsDefault)
  const engineInfo = useSessionStore((state) => state.info)
  const submitPrompt = useCanvasStore((state) => state.submitPrompt)
  const setSettingsDock = useCanvasStore((state) => state.setSettingsDock)
  const setLibraryDock = useCanvasStore((state) => state.setLibraryDock)

  const [state, setState] = useState<WizardState>(() => ({ ...readWizard() }))
  // The walk's candidate state (spec §3): born from the settings prefill the
  // moment there are settings to prefill from, then held in memory for the
  // whole walk — NEVER a settings write (the exit's one motion is task 8's;
  // skip persists nothing, D3). The models root prefill is honest-or-empty
  // on the SERVER'S flag (D7/W-C1): the shipped studio-home default never
  // prefills as engine-visible.
  const [walk, setWalk] = useState<WalkCandidate | null>(null)
  useEffect(() => {
    if (settings !== null && walk === null) {
      const fresh = emptyWalkCandidate(settings.comfyUrl)
      const prefill = modelsRootPrefill(settings, modelRootIsDefault)
      setWalk(prefill ? { ...fresh, modelsRoot: setDestinationValue(fresh.modelsRoot, prefill) } : fresh)
    }
  }, [settings, walk, modelRootIsDefault])
  const [sawScan, setSawScan] = useState(false)
  useEffect(() => { if (scanning) setSawScan(true) }, [scanning])

  // (R-16) The step-3 pack summary: the board's own listing, summarized.
  const [packSummary, setPackSummary] = useState<{ active: number; total: number } | null>(null)
  useEffect(() => {
    if (state.step !== 2) return
    let cancelled = false
    void window.monoka.listEngineNodePacks().then((result) => {
      if (cancelled) return
      const packs = result.packs
      setPackSummary({ active: packs.filter((pack) => pack.instanceState === 'active').length, total: packs.length })
    }).catch(() => setPackSummary(null))
    return () => { cancelled = true }
  }, [state.step])

  // (dispatch B, k2q0n9s — the setState-in-render race, fixed) writeWizard
  // dispatches a SYNCHRONOUS window event the FirstRunNotice answers with
  // its own setState, so it must never run inside a setState updater body:
  // React invokes updaters during the OWNER'S render pass whenever the
  // fiber has pending lanes (a store-driven scanning/status flip landing
  // near the click — the load-shaped flake), which updated the notice
  // mid-wizard-render. Both writers below run in event context only — the
  // updaters are gone entirely; patch reads the render-scope state its own
  // click closures captured (fresh by construction: any state change
  // re-renders and re-creates them), and reopen overwrites every field.
  const patch = (part: Partial<WizardState>) => {
    const next: WizardState = { ...state, ...part }
    writeWizard(next)
    setState(next)
  }

  // The candidate updates ride a functional setWalk so a late Test
  // resolution can never clobber a keystroke that landed while it was in
  // flight (the update sees the walk state as it IS, not as the click's
  // render captured it).
  const updateWalk = (move: (candidate: WalkCandidate) => WalkCandidate) => {
    setWalk((candidate) => (candidate === null ? candidate : move(candidate)))
  }

  // The notice's "Resume setup" CTA (the fallback surface reopening the
  // journey): reset skipped/done and present from the engine step, with the
  // candidate re-prefilled from the saved settings (the walk restarts).
  useEffect(() => {
    const reopen = () => {
      const next: WizardState = { step: 0, done: false, skipped: false }
      writeWizard(next)
      setState(next)
      setWalk(null)
    }
    window.addEventListener(WIZARD_REOPEN_EVENT, reopen)
    return () => window.removeEventListener(WIZARD_REOPEN_EVENT, reopen)
  }, [])

  // (R-29) The stack verdict folds the ENGINE side too: object_info says
  // whether the instance actually serves the H3 core node classes. The
  // walk's OWN ambiguous picks (walk.overrides, the Models step's one-click
  // designations) merge over the settings layer so a pick re-resolves the
  // row in place — they become configuration only at the exit (task 8).
  const stack = useMemo(() => (settings ? h3StackReport(models, { ...settings.modelOverrides?.monoka, ...walk?.overrides }, engineInfo) : null), [models, settings, engineInfo, walk])

  // The present decision rides the spine's predicate: the local latch rules
  // until the server requests setup (spec §4) — task 9 wires that flag in;
  // until then `false` is exactly today's behavior, through the seam.
  const presenting = shouldPresent({ latchDone: state.done, latchSkipped: state.skipped, serverSetupRequested: false })
  // (§2.2, task 5) While the walk PRESENTS, the engine pills go quiet — the
  // wizard owns the verdict voice. The flag mirrors the rendered truth (the
  // same guard the body uses), so a mid-walk scan — which unrenders the
  // walk — unquiets the pills too.
  const showsDialog = Boolean(context && sawScan && !scanning && presenting && settings && walk)
  useEffect(() => {
    useCanvasStore.getState().setWizardPresenting(showsDialog)
    return () => useCanvasStore.getState().setWizardPresenting(false)
  }, [showsDialog])
  // The session machinery (scan/check callbacks) rides the canvas session
  // context — the wizard lives on the canvas route where EngineHost provides
  if (!context || !sawScan || scanning || !presenting || !settings || !walk) return null
  const { scanModels, checkConnection } = context.session

  const close = () => patch({ done: true })
  const step = Math.min(state.step, STEP_TITLES.length - 1)

  // The Models step's ambiguous pick: one click designates through the
  // candidate's override slots — held in the WALK (nothing persists
  // mid-walk, §3); the exit's write makes it configuration.
  const pickOverride = (slot: string, name: string) => {
    updateWalk((current) => ({ ...current, overrides: { ...current.overrides, [slot]: name } }))
  }

  const body = (() => {
    if (step === 0) return <EngineStep candidate={walk} onCandidate={updateWalk} checkConnection={checkConnection} />
    if (step === 1) return <ModelsStep
      models={models}
      scanning={scanning}
      stack={stack}
      gate={modelsGate(walk)}
      settings={settings}
      modelRootIsDefault={modelRootIsDefault}
      modelsRoot={walk.modelsRoot}
      onModelsRoot={(next) => updateWalk((current) => ({ ...current, modelsRoot: next }))}
      onOverridePick={pickOverride}
      onRefresh={() => void scanModels(settings, { refresh: true })}
    />
    if (step === 2) return <PacksStep summary={packSummary} gate={packsGate(walk)} onOpenPacks={() => setSettingsDock(true)} onOpenLibrary={() => setLibraryDock(true)} />
    if (step === 3) return <LanStep gate={lanGate(walk)} />
    return <PromptStep gate={promptGate(walk)} onDone={(prompt) => { patch({ done: true }); if (prompt.trim()) void submitPrompt(prompt, 'video') }} />
  })()

  return <div className="canvas-wizard" role="dialog" aria-label="First-run setup wizard" data-canvas-wizard data-wizard-step={step}>
    <header className="canvas-wizard-header">
      <strong>Set up the studio <span className="canvas-wizard-step">{step + 1} of {STEP_TITLES.length} — {STEP_TITLES[step]}</span></strong>
      <button type="button" className="canvas-wizard-skip" data-wizard-skip onClick={() => patch({ skipped: true })}>Skip for now</button>
      <button type="button" className="canvas-wizard-close" aria-label="Close the setup wizard" data-wizard-close onClick={close}><X size={14} /></button>
    </header>
    <div className="canvas-wizard-body">{body}</div>
    <footer className="canvas-wizard-footer">
      <ol className="canvas-wizard-progress" aria-label="Wizard progress">
        {STEP_TITLES.map((title, index) => (
          <li key={title} className={index === step ? 'current' : index < step ? 'past' : ''} data-wizard-progress={index}>{title}</li>
        ))}
      </ol>
      <div className="canvas-wizard-actions">
        {step > 0 && <button type="button" className="chip canvas-chip" data-wizard-back onClick={() => patch({ step: step - 1 })}>Back</button>}
        {step < STEP_TITLES.length - 1 && <button type="button" className="chip chip--accent canvas-chip" data-wizard-next onClick={() => patch({ step: step + 1 })}>Next — {STEP_TITLES[step + 1]}</button>}
      </div>
    </footer>
  </div>
}

/** The step's gate line (§2: verified or honestly refused — never a silent
 *  maybe). Verified renders nothing: the step's own content carries the
 *  good news. */
function GateLine({ gate }: { gate: StepGate }) {
  if (gate.verdict === 'verified') return null
  return <p className="canvas-wizard-warn" data-wizard-gate={gate.verdict}>{gate.reason}</p>
}

/** Step 1 — the engine connection as a CANDIDATE (spec §2.1). Editing the
 *  address updates the walk's candidate ONLY — the shared session store's
 *  saved settings are never touched mid-walk, so EngineHost's loop keeps
 *  probing the SAVED url (correct scoping now that typing cannot mutate it).
 *  Test verifies the candidate; the readout renders against exactly the URL
 *  that answered. */
function EngineStep(props: {
  candidate: WalkCandidate
  onCandidate(move: (candidate: WalkCandidate) => WalkCandidate): void
  checkConnection(url: string): Promise<{ connected: boolean; latencyMs?: number; stats?: { devices?: Array<{ name?: string }> }; error?: string }>
}) {
  const { candidate, onCandidate, checkConnection } = props
  const [probing, setProbing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [reachable, setReachable] = useState<Array<{ port: number; latencyMs: number }>>([])
  // The Test readout: kept step-local (not the store's status — the boot
  // probe and the watch loop write that), gated to the URL it was earned
  // against (a later edit hides it, honestly).
  const [tested, setTested] = useState<{ url: string; connected: boolean; device?: string; error?: string } | null>(null)

  // Test → checkConnection(candidate) — the candidate-scoped status +
  // object-info pull (task 2's seams) — then the walk records the verdict
  // against EXACTLY the URL that answered (verification is earned per-URL;
  // an unreachable answer earns none).
  const test = async (url: string) => {
    setTesting(true)
    try {
      const status = await checkConnection(url)
      setTested({ url, connected: status.connected === true, device: status.stats?.devices?.[0]?.name, error: status.error })
      onCandidate((current) => markEngineVerified(current, url, status.connected === true))
    } finally {
      setTesting(false)
    }
  }

  const probe = async () => {
    setProbing(true)
    setReachable([])
    try {
      const found: Array<{ port: number; latencyMs: number }> = []
      for (const port of COMMON_PORTS) {
        const url = `http://127.0.0.1:${port}`
        try {
          const probeStatus = await window.monoka.getComfyStatus(url)
          if (probeStatus.connected) found.push({ port, latencyMs: probeStatus.latencyMs ?? 0 })
          // (A-DBG) The probe verdict per port — click-consented, one burst
          // per Test press; the connected case is summarized below.
          dbg('wizard.probe', { port, connected: probeStatus.connected, latencyMs: probeStatus.latencyMs })
        } catch (error) {
          dbg('wizard.probe', { port, connected: false, error: error instanceof Error ? error.message : String(error) })
        }
      }
      // (A-DBG) The burst summary: what the wizard will offer as one-click.
      dbg('wizard', { step: 'engine', reachable: found.map((entry) => entry.port) })
      setReachable(found)
    } finally {
      setProbing(false)
    }
  }

  // Adopt-with-test (§2.1): one click sets the candidate AND tests it.
  const adopt = (port: number) => {
    const url = `http://127.0.0.1:${port}`
    onCandidate((current) => setCandidateUrl(current, url))
    void test(url)
  }

  return <div className="canvas-wizard-step" data-wizard-engine>
    <p className="canvas-wizard-lede">Point the studio at a ComfyUI engine. Nothing is saved as you type — Test verifies the address you see, and the walk holds it as its working candidate until the exit.</p>
    <div className="canvas-wizard-row">
      <label htmlFor="wizard-comfy-url">Engine address</label>
      <input
        id="wizard-comfy-url"
        data-wizard-comfy-url
        value={candidate.comfyUrl}
        placeholder="http://127.0.0.1:8188 — ComfyUI's default port"
        onChange={(event) => onCandidate((current) => setCandidateUrl(current, event.target.value))}
      />
      <Button variant="ghost" className="chip canvas-chip" size={12} data-wizard-test busy={testing} icon={<RefreshCw size={12} />} onClick={() => void test(candidate.comfyUrl)}>
        Test
      </Button>
    </div>
    {tested && tested.url === candidate.comfyUrl && (tested.connected
      ? <p className="canvas-wizard-ok" data-wizard-connected><Check size={13} /> Engine reachable{tested.device ? ` — ${tested.device}` : ''}.</p>
      : <p className="canvas-wizard-warn" data-wizard-unreachable>Not reachable at {tested.url}{tested.error ? ` — ${tested.error}` : ''}. Start the engine and test again, or continue and connect later.</p>)}
    <div className="canvas-wizard-row">
      <span className="canvas-wizard-hint">Not sure of the port? The probe asks each common port for a heartbeat — you click, it asks; nothing probes on its own.</span>
      <Button variant="ghost" className="chip canvas-chip" size={12} data-wizard-probe busy={probing} onClick={() => void probe()}>
        Probe common ports
      </Button>
    </div>
    {reachable.length > 0 && (
      <ul className="canvas-wizard-ports" data-wizard-ports>
        {reachable.map(({ port, latencyMs }) => (
          <li key={port}>
            <button type="button" className="chip canvas-chip" data-wizard-port={port} onClick={() => adopt(port)}>
              <Check size={12} /> :{port} <small>{latencyMs} ms{port === 8188 ? ' · ComfyUI’s default port — adopt it only if it is your own instance' : ''}</small>
            </button>
          </li>
        ))}
      </ul>
    )}
    <p className="canvas-wizard-note">Prefer the studio to launch its own engine? That lives in Settings → Setup → Managed engine — this walk is external-first; the managed runtime stays a pointer this round.</p>
  </div>
}

/** Step 2 — the Models step (spec §2.2, task 5). The bare counts are dead:
 *  every component renders NAMED truth (the resolved file verbatim, its
 *  source layer, presence, the canonical hint, any refusal, the make-visible
 *  guidance), the step carries ONE verdict in one voice (h3Stack's
 *  stackVerdictText — the same predicate the engine chip reads, at the text
 *  lane; the pills themselves are quiet while this step speaks), the
 *  models-root designation rides Task 3's DesignationField seam, and a
 *  component the fetch catalog can deliver renders a ONE-CLICK fetch row —
 *  license verdict ON the row, the click IS the consent (W-I6). Identity
 *  labels come from the closed vocabulary; the interim word waits for the
 *  catalog wave's digests (always false today). */
function ModelsStep(props: {
  models: ReturnType<typeof useSessionStore.getState>['models']
  scanning: boolean
  stack: ReturnType<typeof h3StackReport> | null
  gate: StepGate
  settings: AppSettings
  modelRootIsDefault: boolean
  modelsRoot: DestinationState
  onModelsRoot(next: DestinationState): void
  onOverridePick(slot: string, name: string): void
  onRefresh(): void
}) {
  const { models, scanning, stack, gate, settings, modelRootIsDefault, modelsRoot, onModelsRoot, onOverridePick, onRefresh } = props
  // The served fetch catalog, polled while the step shows — the rows read
  // live state (license, in-flight, present). OUR clicks are tracked
  // separately: the fetched-but-not-yet-listed copy rides that truth.
  const [catalog, setCatalog] = useState<FetchEntryStatus[] | null>(null)
  const [started, setStarted] = useState<Record<string, boolean>>({})
  const [fetchErrors, setFetchErrors] = useState<Record<string, string>>({})
  const seenInFlight = useRef<Record<string, boolean>>({})
  const settled = useRef<Record<string, boolean>>({})
  const refreshRef = useRef(onRefresh)
  useEffect(() => { refreshRef.current = onRefresh })
  useEffect(() => {
    let cancelled = false
    const poll = () => window.monoka.listFetchCatalog().then((answer) => {
      if (cancelled) return
      setCatalog(answer.entries)
      // The settled flip: an in-flight entry that stopped being in-flight
      // has landed (or failed) — ONE engine re-scan so the row can flip
      // named-and-present. Bounded once per entry; the refresh itself
      // unmounts this step (the scanning guard) and the poll dies with it.
      for (const entry of answer.entries) {
        if (seenInFlight.current[entry.id] && entry.inFlight !== true && !settled.current[entry.id]) {
          settled.current[entry.id] = true
          refreshRef.current()
        }
        seenInFlight.current[entry.id] = entry.inFlight === true
      }
    }).catch(() => { if (!cancelled) setCatalog(null) })
    void poll()
    const timer = window.setInterval(() => { void poll() }, 2000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  const designated = isDesignated(modelsRoot)
  const rows = useMemo(
    () => (stack ? modelsStepRows(models, stack, catalog ?? [], { designated, digestInFlight: false }) : []),
    [models, stack, catalog, designated],
  )

  // W-I6: ONE click = the consent ledger record (the same ledger the
  // library writes) + the start. Failures render on the row — never a
  // silent success.
  const startFetch = async (view: ComponentFetchView) => {
    setFetchErrors((current) => ({ ...current, [view.entryId]: '' }))
    try {
      await window.monoka.setFetchConsent(view.entryId, true)
      const answer = await window.monoka.startFetch(view.entryId)
      if (!answer.started) throw new Error('The fetch could not be started.')
      setStarted((current) => ({ ...current, [view.entryId]: true }))
      dbg('wizard.models.fetch', { id: view.entryId, started: true })
    } catch (error) {
      setFetchErrors((current) => ({ ...current, [view.entryId]: error instanceof Error ? error.message : String(error) }))
    }
  }

  const designationHint = modelsRoot.value
    ? 'Prefilled from the walk\'s honest sources — verify it, or type the path your engine actually reads.'
    : settings.engine.mode === 'managed'
      ? 'No discoverable checkout — type the absolute path to the models directory the managed engine reads.'
      : modelRootIsDefault
        ? 'The shipped models root is the studio-home default, and it never prefills as engine-visible — fetched weights would land where an external engine never reads. Type the absolute path your engine reads; the studio verifies only disks it can see.'
        : 'Type the absolute path to the models directory your engine reads — the studio can verify only disks it can see (same machine or shared storage).'

  return <div className="canvas-wizard-step" data-wizard-registry>
    <p className="canvas-wizard-lede">The engine's own inventory, named per component. Every row states what is present, what is missing, and the one fix — the step carries one verdict.</p>
    <GateLine gate={gate} />
    {gate.verdict === 'verified' && stack && <VerdictLine verdict={stackVerdictText(stack)} />}
    <DesignationField
      id="wizard-models-root"
      label="Models root"
      question="Where should fetched weights land so your engine sees them?"
      hint={designationHint}
      state={modelsRoot}
      onChange={onModelsRoot}
    />
    <ul className="canvas-wizard-components" data-wizard-components>
      {rows.map((row) => (
        <ComponentRow key={row.label} row={row} started={started[row.fetch?.entryId ?? ''] === true} fetchError={row.fetch ? fetchErrors[row.fetch.entryId] : ''} designated={designated} modelsRootValue={modelsRoot.value} studioRoot={settings.modelRoot} onPick={onOverridePick} onFetch={() => { if (row.fetch) void startFetch(row.fetch) }} />
      ))}
    </ul>
    <div className="canvas-wizard-row">
      <Button variant="ghost" className="chip canvas-chip" size={12} data-wizard-refresh busy={scanning} icon={<RefreshCw size={12} />} onClick={onRefresh}>
        Refresh from the engine
      </Button>
    </div>
  </div>
}

/** The step's ONE verdict line — the text is h3Stack's narrator, the class
 *  is its boolean. No second verdict is allowed on this step. */
function VerdictLine({ verdict }: { verdict: StackVerdict }) {
  return <p className={`canvas-wizard-${verdict.ready ? 'ok' : 'warn'}`} data-wizard-verdict={verdict.ready ? 'ready' : 'blocked'} data-ready={String(verdict.ready)}>
    {verdict.ready ? <Check size={13} /> : null} {verdict.text}
  </p>
}

/** One component row: the named truth, the identity label, the picked/
 *  ambiguous narration with the one-click designate, and (when the catalog
 *  delivers the component) the one-click fetch row. */
function ComponentRow(props: {
  row: ModelsStepRow
  started: boolean
  fetchError: string
  designated: boolean
  modelsRootValue: string
  studioRoot: string
  onPick(slot: string, name: string): void
  onFetch(): void
}) {
  const { row, started, fetchError, designated, modelsRootValue, studioRoot } = props
  return <li className="canvas-wizard-component" data-wizard-model-row={row.label} data-row-present={row.present ? 'true' : 'false'} data-row-narration={row.narration}>
    <strong>{row.label}</strong>
    {row.present
      ? <span data-wizard-row-name>{basenameOf(row.name)}{row.source === 'override' ? ' — your pick' : ''}</span>
      : <span className="canvas-wizard-warn" data-wizard-row-guide>{row.makeVisible}.</span>}
    {row.present && <span className="canvas-wizard-hint" data-wizard-row-identity>{row.identity}{row.interim ? ` — ${DIGEST_INTERIM_COPY}` : ''}</span>}
    {row.refusal && <p className="canvas-wizard-warn" data-wizard-row-refusal>{row.refusal}</p>}
    {row.narration === 'picked' && <span className="canvas-wizard-hint" data-wizard-row-narration>Resolved to {basenameOf(row.name)} — {row.candidates.others.length} other candidate{row.candidates.others.length === 1 ? '' : 's'} matched; override in Settings if wrong.</span>}
    {row.narration === 'ambiguous' && row.overrideSlot && <div data-wizard-row-picks>
      <span className="canvas-wizard-hint">Several files match loosely — the studio picked {basenameOf(row.candidates.picked)}. Name the right one; the walk holds the pick and the exit persists it:</span>
      <div className="canvas-wizard-picks">
        {row.candidates.names.map((name) => (
          <button key={name} type="button" className="chip canvas-chip" data-wizard-pick={name} disabled={name === row.candidates.picked} onClick={() => props.onPick(row.overrideSlot, name)}>{basenameOf(name)}</button>
        ))}
      </div>
    </div>}
    {row.fetch
      ? <div className="canvas-wizard-fetch" data-wizard-fetch={row.fetch.entryId} data-fetch-gated={row.fetch.gated ? 'true' : 'false'}>
        <span className="canvas-wizard-hint" data-wizard-fetch-license>License {row.fetch.licenseSpdx}{row.fetch.licenseNote ? ` — ${row.fetch.licenseNote}` : ''}{row.fetch.sizeClass ? ` · ${row.fetch.sizeClass} download` : ''}.</span>
        <button type="button" className="chip chip--accent canvas-chip" data-wizard-fetch-start disabled={row.fetch.gated || row.fetch.inFlight} onClick={props.onFetch}>
          {row.fetch.inFlight ? 'Fetching…' : 'Fetch and place — one click'}
        </button>
        {row.fetch.gated && <span className="canvas-wizard-warn" data-wizard-fetch-gated-copy>Verify a models root above first — fetches need a verified destination.</span>}
        {started && !row.present && <span className="canvas-wizard-hint" data-wizard-fetch-settling>The fetch is underway or landed — weights place into {studioRoot}{row.fetch.destRoot ? `/${row.fetch.destRoot}` : ''}. The engine lists new weights only after its own folder re-scan or a restart (v0.34.0 serves no /refresh); refresh here once it sees the file.</span>}
        {started && designated && modelsRootValue !== studioRoot && <span className="canvas-wizard-hint">Your designation ({modelsRootValue}) becomes the studio's models root when the walk completes — until then fetched weights land in the configured root.</span>}
        {fetchError && <span className="canvas-wizard-warn" data-wizard-fetch-error>{fetchError}</span>}
      </div>
      : !row.present && <span className="canvas-wizard-hint" data-wizard-row-direct>No catalog row delivers this component — place it from its publisher where the engine reads it, then refresh.</span>}
  </li>
}

/** Step 3 — the pack board summary (pre-validated chips; remediation is one click deep). Task 6 reworks this slot. */
function PacksStep(props: { summary: { active: number; total: number } | null; gate: StepGate; onOpenPacks(): void; onOpenLibrary(): void }) {
  const { summary, gate, onOpenPacks, onOpenLibrary } = props
  return <div className="canvas-wizard-step" data-wizard-packs>
    <p className="canvas-wizard-lede">Node packs the studio can place for you — detection always reads the connected engine's live registry, and each row installs with one consented click.</p>
    <GateLine gate={gate} />
    {summary === null
      ? <p className="canvas-wizard-warn" data-wizard-packs-unknown>The pack board could not be listed (the engine is offline or still loading) — it stays available in Settings → Setup → Node packs.</p>
      : <p className="canvas-wizard-ok" data-wizard-packs-summary>{summary.active} of {summary.total} packs active on the engine{summary.active < summary.total ? ' — the missing ones can be fetched or installed from their rows.' : '.'}</p>}
    <div className="canvas-wizard-row">
      <button type="button" className="chip canvas-chip" data-wizard-open-packs onClick={onOpenPacks}>Open the pack board (Settings)</button>
      <button type="button" className="chip canvas-chip" data-wizard-open-library onClick={onOpenLibrary}>Open the library — get models</button>
    </div>
  </div>
}

/** Step 4 — LAN prep. PLACEHOLDER SHELL — task 7 lands the full designation
 *  (host choice, port with the bind probe, the token offer with its D8
 *  default, the printed URL). What renders today is the honest keep-current
 *  panel: nothing is designated in this step yet, so no network setting can
 *  change — the walk writes configuration once, at the exit, and only what
 *  a step designates (§3). Keep-current is §2.4's default; the fresh-clone
 *  path passes in one click. */
function LanStep(props: { gate: StepGate }) {
  return <div className="canvas-wizard-step" data-wizard-lan>
    <p className="canvas-wizard-lede">LAN access — the studio serves its UI over the network posture it booted with. Keeping it is the default and changes nothing.</p>
    <GateLine gate={props.gate} />
    <p className="canvas-wizard-note">Nothing is designated in this step yet, so no network setting will change. The full designation — host reachability, port, the access token, the printable LAN URL — is this step's work; none of it is required to continue.</p>
  </div>
}

/** Step 5 — the first prompt: the whole point. Task 8 reworks this slot to
 *  the deliberate submit (cost preview, Enter-never-submits, the
 *  Just-create alternative, the exit write). */
function PromptStep(props: { gate: StepGate; onDone(prompt: string): void }) {
  const [prompt, setPrompt] = useState('')
  return <div className="canvas-wizard-step" data-wizard-prompt>
    <p className="canvas-wizard-lede">Describe one shot. The chain lands on the canvas; generate when you're ready — a refused engine says so honestly.</p>
    <GateLine gate={props.gate} />
    <textarea
      data-wizard-prompt-input
      rows={3}
      value={prompt}
      placeholder="A lighthouse over a black sea, slow push-in, no dialogue"
      onChange={(event) => setPrompt(event.target.value)}
      onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); props.onDone(prompt) } }}
    />
    <div className="canvas-wizard-row">
      <button type="button" className="chip chip--accent canvas-chip" data-wizard-finish disabled={!prompt.trim()} onClick={() => props.onDone(prompt)}>
        <Sparkles size={12} /> Create the first chain
      </button>
    </div>
  </div>
}
