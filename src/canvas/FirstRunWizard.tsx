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
 *   3. NODE PACKS — can-I-generate, the curated rows, the designated
 *                  install target, installs that verify in place (task 6).
 *   4. LAN PREP   — the posture as a designation (task 7): host choice in
 *                  world terms, port + bind probe before acceptance, the
 *                  token offer with its D8 default, the printed URL —
 *                  keep-current is the default; keys are candidates until
 *                  the exit.
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
import { h3StackReport, canGenerateAnswer, stackVerdictText, turboTierStates, type StackVerdict } from '../lib/h3Stack'
import type { ObjectInfo } from '../lib/comfyInfo'
import type { AppSettings, FetchEntryStatus, LanStatusRead, LanTokenRead, NodePackStatus } from '../types'
import { useSessionStore } from '../state/sessionStore'
import { useCanvasStore } from './store'
import { CanvasSessionContext } from './sessionContext'
import { WIZARD_REOPEN_EVENT } from './FirstRunNotice'
import { DesignationField } from './DesignationField'
import { chainSettingsDefaults } from './generation'
import { DIGEST_INTERIM_COPY, fetchLanded, modelsStepRows, type ComponentFetchView, type ModelsStepRow } from './wizardModels'
import {
  LAN_HOST_LAN_COPY,
  LAN_HOST_LOCAL_COPY,
  LAN_OVERRIDES_COPY,
  LAN_PORT_RANGE_COPY,
  LAN_RESTART_COPY,
  LAN_TOKEN_TRUTH_COPY,
  PACKS_FETCH_UNDERWAY_COPY,
  PACKS_NO_TARGET_COPY,
  WALK_STEPS,
  applyExitWrite,
  buildExitWrite,
  curatedWizardPacks,
  customNodesPrefill,
  emptyWalkCandidate,
  exitWriteSummary,
  isDesignated,
  keepLanPosture,
  lanGate,
  markEngineVerified,
  modelsGate,
  modelsRootPrefill,
  owesSetupAck,
  packAwaitingCopy,
  packFetchPhase,
  packInstallPath,
  packViaLabel,
  packsGate,
  packsInstallRefusal,
  placementDisclosure,
  promptCostPreview,
  promptGate,
  recordLanProbe,
  setCandidateUrl,
  setDestinationValue,
  setLanHost,
  setLanPort,
  setLanToken,
  shouldPresent,
  tierStepCount,
  type CuratedPackRow,
  type DestinationState,
  type LanHostChoice,
  type PackFetchPhase,
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
  // (task 9, spec §4) The --setup reset's request + its clearer — the walk
  // re-opens over any local latch while the server asks, and the terminal
  // states hand the request back.
  const setupRequested = useSessionStore((state) => state.setupRequested)
  const setSetupRequested = useSessionStore((state) => state.setSetupRequested)
  const engineInfo = useSessionStore((state) => state.info)
  const setSettingsDock = useCanvasStore((state) => state.setSettingsDock)

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
      const modelsPrefill = modelsRootPrefill(settings, modelRootIsDefault)
      const nodesPrefill = customNodesPrefill(settings)
      setWalk({
        ...fresh,
        ...(modelsPrefill ? { modelsRoot: setDestinationValue(fresh.modelsRoot, modelsPrefill) } : {}),
        ...(nodesPrefill ? { customNodesDir: setDestinationValue(fresh.customNodesDir, nodesPrefill) } : {}),
      })
    }
  }, [settings, walk, modelRootIsDefault])
  const [sawScan, setSawScan] = useState(false)
  useEffect(() => { if (scanning) setSawScan(true) }, [scanning])

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
  // until the server requests setup (spec §4) — the store carries the boot
  // read, so the reset re-opens the walk over any latch until it is acked.
  const presenting = shouldPresent({ latchDone: state.done, latchSkipped: state.skipped, serverSetupRequested: setupRequested })
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

  // A terminal walk state (done AND skip alike) consumes the --setup reset's
  // request: the store flag clears SYNCHRONOUSLY with the patch (presenting
  // consults it — a stale-true flag would re-present the walk forever), then
  // the ack POST tells the server. Fire-and-forget with both outcomes logged;
  // a failed ack leaves the flag standing honestly (it dies with the boot
  // anyway, and `--setup` re-arms).
  const finish = (part: Partial<WizardState>) => {
    if (owesSetupAck({ done: part.done === true, skipped: part.skipped === true, serverSetupRequested: setupRequested })) {
      setSetupRequested(false)
      window.monoka.ackSetupRequested().then(
        (answer) => dbg('wizard.setupAck', { cleared: answer.setupRequested }),
        (error: unknown) => dbg('wizard.setupAck', { error: error instanceof Error ? error.message : String(error) }),
      )
    }
    patch(part)
  }
  const close = () => finish({ done: true })
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
    if (step === 2) return <PacksStep
      gate={packsGate(walk)}
      stack={stack}
      info={engineInfo}
      customNodesDir={walk.customNodesDir}
      onCustomNodes={(next) => updateWalk((current) => ({ ...current, customNodesDir: next }))}
      configuredDir={settings.engine.externalCustomNodesDir ?? ''}
      onOpenPacks={() => setSettingsDock(true)}
    />
    if (step === 3) return <LanStep candidate={walk} onUpdateWalk={updateWalk} />
    return <PromptStep gate={promptGate(walk)} walk={walk} settings={settings} models={models} onLatchDone={() => finish({ done: true })} />
  })()

  return <div className="canvas-wizard" role="dialog" aria-label="First-run setup wizard" data-canvas-wizard data-wizard-step={step}>
    <header className="canvas-wizard-header">
      <strong>Set up the studio <span className="canvas-wizard-step">{step + 1} of {STEP_TITLES.length} — {STEP_TITLES[step]}</span></strong>
      <button type="button" className="canvas-wizard-skip" data-wizard-skip onClick={() => finish({ skipped: true })}>Skip for now</button>
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
  const [tested, setTested] = useState<{ url: string; connected: boolean; device?: string; latencyMs?: number; error?: string } | null>(null)

  // Test → checkConnection(candidate) — the candidate-scoped status +
  // object-info pull (task 2's seams) — then the walk records the verdict
  // against EXACTLY the URL that answered (verification is earned per-URL;
  // an unreachable answer earns none).
  const test = async (url: string) => {
    setTesting(true)
    try {
      const status = await checkConnection(url)
      setTested({ url, connected: status.connected === true, device: status.stats?.devices?.[0]?.name, latencyMs: status.latencyMs, error: status.error })
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
      ? <p className="canvas-wizard-ok" data-wizard-connected><Check size={13} /> Engine reachable{tested.device ? ` — ${tested.device}` : ''}{typeof tested.latencyMs === 'number' ? ` · ${tested.latencyMs} ms` : ''}.</p>
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
  // The post-click truth derives from the CATALOG (fetchLanded: placed/
  // present), not component memory — a mid-walk scan remounts this step and
  // destroys `started`, but the catalog state survives and the re-scan/
  // restart truth with it (review F1). `started` only bridges the ≤2s gap
  // between the click and the next catalog poll.
  const fetched = row.fetch !== null && (started || fetchLanded(row.fetch))
  return <li className="canvas-wizard-component" data-wizard-model-row={row.label} data-row-present={row.present ? 'true' : 'false'} data-row-narration={row.narration}>
    <strong>{row.label}</strong>
    {row.present
      ? <span data-wizard-row-name>{basenameOf(row.name)}{row.source === 'override' ? ' — your pick' : ''}</span>
      : <span className="canvas-wizard-warn" data-wizard-row-guide>{row.makeVisible}.</span>}
    {row.present && <span className="canvas-wizard-hint" data-wizard-row-identity>{row.identity}{row.interim ? ` — ${DIGEST_INTERIM_COPY}` : ''}</span>}
    {row.refusal && <p className="canvas-wizard-warn" data-wizard-row-refusal>{row.refusal}</p>}
    {row.narration === 'picked' && <span className="canvas-wizard-hint" data-wizard-row-narration>Resolved to {basenameOf(row.name)} — {row.candidates.others.length} other candidate{row.candidates.others.length === 1 ? '' : 's'} matched{row.overrideSlot ? '; override in Settings if wrong.' : '.'}</span>}
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
        {!fetched && <button type="button" className="chip chip--accent canvas-chip" data-wizard-fetch-start disabled={row.fetch.gated || row.fetch.inFlight} onClick={props.onFetch}>
          {row.fetch.inFlight ? 'Fetching…' : 'Fetch and place — one click'}
        </button>}
        {row.fetch.gated && <span className="canvas-wizard-warn" data-wizard-fetch-gated-copy>Verify a models root above first — fetches need a verified destination.</span>}
        {fetched && !row.present && <span className="canvas-wizard-hint" data-wizard-fetch-settling>The fetch is underway or landed — weights place into {studioRoot}{row.fetch.destRoot ? `/${row.fetch.destRoot}` : ''}. The engine lists new weights only after its own folder re-scan or a restart (v0.34.0 serves no /refresh); refresh here once it sees the file.</span>}
        {fetched && designated && modelsRootValue !== studioRoot && <span className="canvas-wizard-hint">Your designation ({modelsRootValue}) becomes the studio's models root when the walk completes — until then fetched weights land in the configured root.</span>}
        {fetchError && <span className="canvas-wizard-warn" data-wizard-fetch-error>{fetchError}</span>}
      </div>
      : !row.present && <span className="canvas-wizard-hint" data-wizard-row-direct>No catalog row delivers this component — place it from its publisher where the engine reads it, then refresh.</span>}
  </li>
}

/** Step 3 — the Node packs step (task 6, spec §2.3): can-I-generate first
 *  (h3Stack's one predicate — one voice with the Models step's verdict),
 *  then the curated rows: the preflight-mapped packs, the fast-tier and
 *  preview families, the studio's own shipping tooling payload. Each row
 *  carries its live state and ONE consented install click (W-I6: the click
 *  is the consent); the custom-nodes designation gates them (W-C1/R3 P1-8)
 *  with the refusal rendered inline — an affordance to finish, never a dead
 *  end. Between install and restart the row reads the honest interim; only
 *  a fresh active verdict from the board's targeted re-ask flips it. */
function PacksStep(props: {
  gate: StepGate
  stack: ReturnType<typeof h3StackReport> | null
  info: ObjectInfo
  customNodesDir: DestinationState
  onCustomNodes(next: DestinationState): void
  /** The engine settings' configured custom-nodes folder — the install
   *  target that holds UNTIL the walk's exit (spec §3's one exception:
   *  installs are facts, not configuration). The step says so when the
   *  walk's designation differs. */
  configuredDir: string
  onOpenPacks(): void
}) {
  const { gate, stack, info, customNodesDir, onCustomNodes, configuredDir, onOpenPacks } = props
  // The live board, polled while the step shows. Once an install owes a
  // verdict the poll rides refresh:true — the server's fresh targeted
  // object_info asks are how a row flips; the explicit re-verify sits
  // beside the rows (never a silent maybe). The fetch catalog rides the
  // same cadence: the fetcher arm's post-click truth — landed AND failed —
  // reads the LEDGER the way the Models step's does (review round,
  // 3p14abm); the catalog status carries each entry's lastFailure, so a
  // failed fetch renders on the row within a poll, never a silent maybe.
  const [packs, setPacks] = useState<NodePackStatus[] | null>(null)
  const [catalog, setCatalog] = useState<FetchEntryStatus[] | null>(null)
  const [owesVerdict, setOwesVerdict] = useState(false)
  const [via, setVia] = useState<Record<string, 'manager' | 'studio' | undefined>>({})
  const [installErrors, setInstallErrors] = useState<Record<string, string>>({})
  const [fetchStarted, setFetchStarted] = useState<Record<string, boolean>>({})
  const [installNotes, setInstallNotes] = useState<Record<string, string[]>>({})
  const refreshRef = useRef(false)
  useEffect(() => { refreshRef.current = owesVerdict })
  useEffect(() => {
    let cancelled = false
    const poll = () => {
      window.monoka.listEngineNodePacks({ refresh: refreshRef.current }).then((result) => {
        if (cancelled) return
        setPacks(result.packs)
      }).catch(() => { if (!cancelled) setPacks(null) })
      window.monoka.listFetchCatalog().then((list) => {
        if (cancelled) return
        setCatalog(list.entries)
      }).catch(() => { if (!cancelled) setCatalog(null) })
    }
    void poll()
    const timer = window.setInterval(poll, 3000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  const designated = isDesignated(customNodesDir)
  const refusal = packsInstallRefusal(customNodesDir)
  const rows = useMemo(
    () => curatedWizardPacks({ packs: packs ?? [], missingClasses: stack ? stack.nodes.missing : [], info }),
    [packs, stack, info],
  )
  const generate = stack ? canGenerateAnswer(stack.selection, info) : null

  // A fetcher placement owes the board a fresh targeted verdict: once the
  // ledger proves the folder for a pack this step enqueued, the next poll
  // rides refresh (review round, 3p14abm — the flip must not wait for a
  // click).
  useEffect(() => {
    if (catalog === null || owesVerdict) return
    for (const row of rows) {
      if (fetchStarted[row.packId] !== true) continue
      const entry = catalog.find((candidate) => candidate.id === `pack:${row.packId}` && !candidate.removedAt)
      if (entry && fetchLanded({ catalogState: entry.state })) {
        setOwesVerdict(true)
        break
      }
    }
  }, [catalog, rows, fetchStarted, owesVerdict])

  // W-I6: ONE click = the consent ledger record (whenever the path touches
  // the network — a Manager install fetches the repo too) + the install.
  // Failures render on the row — never a silent success. The synchronous
  // routes (Manager, studio placement) answer with the folder on disk, so
  // their via is stated at once and the server's install notes ride the
  // row; the fetcher route only ENQUEUES — no via, no "installed", just the
  // ledger-derived phase (review round, 3p14abm).
  const installPack = async (row: CuratedPackRow) => {
    const path = packInstallPath(row.status)
    if (!path) return
    setInstallErrors((current) => ({ ...current, [row.packId]: '' }))
    try {
      if (path === 'route-manager' || path === 'route-studio') {
        if (row.status && row.status.hasNetworkSource === true && row.status.fetchConsented !== true) {
          await window.monoka.setFetchConsent(`pack:${row.packId}`, true)
        }
        const placed = await window.monoka.installEngineNodePack(row.packId)
        setVia((current) => ({ ...current, [row.packId]: placed.via ?? 'studio' }))
        if (placed.notes && placed.notes.length > 0) setInstallNotes((current) => ({ ...current, [row.packId]: placed.notes ?? [] }))
      } else {
        await window.monoka.setFetchConsent(`pack:${row.packId}`, true)
        const answer = await window.monoka.startFetch(`pack:${row.packId}`)
        if (!answer.started) throw new Error('The fetch could not be started.')
        setFetchStarted((current) => ({ ...current, [row.packId]: true }))
      }
      if (path !== 'fetcher') setOwesVerdict(true)
      dbg('wizard.packs.install', { pack: row.packId, via: path })
    } catch (error) {
      setInstallErrors((current) => ({ ...current, [row.packId]: error instanceof Error ? error.message : String(error) }))
    }
  }

  return <div className="canvas-wizard-step" data-wizard-packs>
    <p className="canvas-wizard-lede">The packs your first render needs, live-checked against the engine. Each row installs with one consented click once the custom-nodes folder is designated.</p>
    <GateLine gate={gate} />
    {generate && <p className={`canvas-wizard-${generate.ready ? 'ok' : 'warn'}`} data-wizard-can-generate={generate.ready ? 'yes' : 'no'} data-ready={String(generate.ready)}>
      {generate.ready ? <Check size={13} /> : null} {generate.text}
    </p>}
    <DesignationField
      id="wizard-custom-nodes"
      label="External custom-nodes folder"
      question="Where should pack installs land so your engine loads them?"
      hint={customNodesDir.value
        ? 'Prefilled from the engine settings — verify it, or type the folder your engine actually reads.'
        : 'Type the absolute path to the custom_nodes folder your engine reads — the studio can verify only disks it can see (same machine or shared storage).'}
      state={customNodesDir}
      onChange={onCustomNodes}
    />
    {packs === null
      ? <p className="canvas-wizard-warn" data-wizard-packs-unknown>The pack board could not be listed (the engine is offline or still loading) — it stays available in Settings → Setup → Node packs.</p>
      : <ul className="canvas-wizard-packs" data-wizard-pack-rows>
        {rows.map((row) => {
          const entry = catalog?.find((candidate) => candidate.id === `pack:${row.packId}` && !candidate.removedAt) ?? null
          const ledgerFailure = entry?.lastFailure ?? ''
          const phase = packFetchPhase({
            landed: entry !== null && fetchLanded({ catalogState: entry.state }),
            inFlight: entry?.inFlight === true,
            started: fetchStarted[row.packId] === true,
            failure: ledgerFailure,
          })
          // The via is stated only when it is TRUE (review F2): the
          // synchronous routes answered with the folder on disk; the
          // fetcher route earns the words when the ledger proves the
          // placement — at enqueue it renders nothing.
          const viaLabel = packViaLabel(via[row.packId]) || (phase === 'landed' && packInstallPath(row.status) === 'fetcher' ? packViaLabel('studio') : '')
          return <PackRow
            key={row.packId}
            row={row}
            designated={designated}
            refusal={refusal}
            fetchPhase={phase}
            fetchFailure={ledgerFailure}
            viaLabel={viaLabel}
            error={installErrors[row.packId] ?? ''}
            notes={installNotes[row.packId] ?? []}
            noConfiguredTarget={configuredDir === ''}
            disagreement={designated && customNodesDir.value !== configuredDir}
            configuredDir={configuredDir}
            onInstall={() => { void installPack(row) }}
          />
        })}
      </ul>}
    <div className="canvas-wizard-row">
      <Button variant="ghost" className="chip canvas-chip" size={12} data-wizard-packs-verify icon={<RefreshCw size={12} />} onClick={() => { void window.monoka.listEngineNodePacks({ refresh: true }).then((result) => setPacks(result.packs)).catch(() => setPacks(null)) }}>
        Re-verify against the engine
      </Button>
      <button type="button" className="chip canvas-chip" data-wizard-open-packs onClick={onOpenPacks}>Open the full pack board (Settings)</button>
    </div>
    <p className="canvas-wizard-note">The studio never restarts your engine — after an install, restart it yourself; this step re-verifies while it is open. The board's long tail stays in Settings → Setup → Node packs; the walk curates only what the first render path needs.</p>
  </div>
}

/** One curated pack row: the registry's name and first sentence, the live
 *  state (active / awaiting-restart / missing / unknown), the ONE consented
 *  install click with its route, and the via stated only after the folder
 *  is true (review round, 3p14abm): synchronous routes at once, the fetcher
 *  when the ledger lands. A foreign folder reads its own words — the
 *  studio-install interim would be false advice there. */
function PackRow(props: {
  row: CuratedPackRow
  designated: boolean
  refusal: string | null
  fetchPhase: PackFetchPhase
  /** The fetch ledger's failure for this entry — rendered only while the
   *  phase reads failed (an in-flight retry outranks the stale failure). */
  fetchFailure: string
  viaLabel: string
  error: string
  notes: string[]
  noConfiguredTarget: boolean
  disagreement: boolean
  configuredDir: string
  onInstall(): void
}) {
  const { row, designated, refusal, fetchPhase, fetchFailure, viaLabel, error, notes, noConfiguredTarget, disagreement, configuredDir } = props
  const path = packInstallPath(row.status)
  // An enqueued or landed fetch owns the row's click: re-clicking would
  // re-consent and re-enqueue behind a job that is already running (or
  // already placed).
  const fetchOwnsTheClick = fetchPhase === 'underway' || fetchPhase === 'landed'
  return <li className="canvas-wizard-pack" data-wizard-pack-row={row.packId} data-pack-state={row.state}>
    <strong>{row.name}</strong>
    <span className="canvas-wizard-hint" data-wizard-pack-sentence>{row.sentence}</span>
    {row.reason === 'preflight' && <span className="canvas-wizard-hint">curated: your engine is missing a node this pack provides.</span>}
    {row.reason === 'studio-tooling' && <span className="canvas-wizard-hint">curated: the studio's own tooling — it ships with this install.</span>}
    {row.state === 'active' && <span className="canvas-wizard-ok" data-wizard-pack-active><Check size={13} /> Active on the engine.</span>}
    {row.state === 'awaiting-restart' && (row.status?.folderState === 'foreign'
      ? <span className="canvas-wizard-hint" data-wizard-pack-foreign={row.packId}>{packAwaitingCopy(row.status)}</span>
      : <span className="canvas-wizard-hint" data-wizard-pack-awaiting={row.packId}>{packAwaitingCopy(row.status)}</span>)}
    {row.state === 'unknown' && <span className="canvas-wizard-hint" data-wizard-pack-unknown-state>The engine's answer for this pack is unknown right now (unreachable or still loading) — re-verify below.</span>}
    {row.state === 'missing' && <>
      {path && !fetchOwnsTheClick && <button type="button" className="chip chip--accent canvas-chip" data-wizard-pack-install={row.packId} disabled={!designated || noConfiguredTarget} onClick={props.onInstall}>
        {path === 'fetcher' ? 'Fetch and install — one click' : 'Install — one click'}
      </button>}
      {fetchPhase === 'underway' && <span className="canvas-wizard-hint" data-wizard-pack-fetch={row.packId}>{PACKS_FETCH_UNDERWAY_COPY}</span>}
      {!path && <span className="canvas-wizard-hint" data-wizard-pack-manual>No one-click install path — a local copy through Settings → Node packs is the way.</span>}
      {!designated && <span className="canvas-wizard-warn" data-wizard-pack-gated>{refusal}</span>}
      {designated && noConfiguredTarget && <span className="canvas-wizard-warn" data-wizard-pack-no-target>{PACKS_NO_TARGET_COPY}</span>}
      {row.status && row.status.hasNetworkSource === true && <span className="canvas-wizard-hint" data-wizard-pack-license>License {row.licenseSpdx}.</span>}
    </>}
    {disagreement && <span className="canvas-wizard-hint" data-wizard-pack-disagreement>Your designation becomes the studio's install target when the walk completes — until then installs land in the configured folder{configuredDir ? '' : ', and an install before the walk\'s exit is refused: no target is configured yet'}.</span>}
    {viaLabel && <span className="canvas-wizard-hint" data-wizard-pack-via={row.packId}>{viaLabel} — the row verifies when the engine serves the classes.</span>}
    {notes.length > 0 && <span className="canvas-wizard-hint" data-wizard-pack-notes={row.packId}>{notes.join(' ')}</span>}
    {fetchPhase === 'failed' && fetchFailure && <span className="canvas-wizard-warn" data-wizard-pack-fetch-error={row.packId}>{fetchFailure}</span>}
    {error && <span className="canvas-wizard-warn" data-wizard-pack-error={row.packId}>{error}</span>}
  </li>
}

/** Step 4 — LAN prep (task 7, spec §2.4). The posture becomes a DESIGNATION:
 *  host choice in world terms, port with the bind probe answered BEFORE
 *  acceptance, the token offer with its D8 default, the printed URL with its
 *  cert note. Restart honesty everywhere — keys are CANDIDATES (walk state);
 *  they become launcher-config writes only at the exit (task 8), and the
 *  wizard never restarts the server. Keep-current is the DEFAULT: the
 *  fresh-clone path passes in one click (§3's named pass). No in-app QR (plan
 *  ruling 3): the launcher's boot QR is the QR path; this step prints the
 *  copyable URL. */
function LanStep(props: { candidate: WalkCandidate; onUpdateWalk(move: (candidate: WalkCandidate) => WalkCandidate): void }) {
  const { candidate, onUpdateWalk } = props
  // The live posture: read once on mount (the wizard never mutates it —
  // the walk designates for the NEXT boot; the wizard never restarts).
  const [read, setRead] = useState<LanStatusRead | null>(null)
  const [readError, setReadError] = useState('')
  const [probing, setProbing] = useState(false)
  const [probeError, setProbeError] = useState('')
  const [tokenState, setTokenState] = useState<LanTokenRead | null>(null)
  const [tokenBusy, setTokenBusy] = useState(false)
  const [tokenError, setTokenError] = useState('')
  const [copied, setCopied] = useState('')
  useEffect(() => {
    let cancelled = false
    window.monoka.getLanStatus().then((answer) => { if (!cancelled) setRead(answer) }).catch((error: unknown) => { if (!cancelled) setReadError(error instanceof Error ? error.message : String(error)) })
    return () => { cancelled = true }
  }, [])

  const keys = candidate.lanKeys
  const touchesBind = keys.host !== undefined || keys.port !== undefined
  const touchesAnything = touchesBind || keys.token !== undefined
  const overrides = read?.envOverrides ?? []
  // The live posture, narrowed to the two choices the gate knows — the
  // equivalence arm (the wizard is served by the listener itself) needs it,
  // so the gate computes HERE where the read lives, not at the step wiring.
  const livePosture = read !== null && (read.posture.host === '127.0.0.1' || read.posture.host === '0.0.0.0')
    ? { host: read.posture.host, port: read.posture.port }
    : undefined
  const gate = lanGate(candidate, livePosture)

  // A host choice designates — port prefills from the LIVE posture (moving
  // a custom-port boot by accident would be a silent lie; the 4178 default
  // is what a fresh clone sees anyway), and the D8 default rides the choice.
  const chooseHost = (host: LanHostChoice) => {
    const port = keys.port ?? read?.posture.port ?? 4178
    onUpdateWalk((current) => setLanHost(setLanPort(current, port), host))
  }

  const runProbe = async () => {
    const host = keys.host
    const port = keys.port
    if ((host !== '127.0.0.1' && host !== '0.0.0.0') || typeof port !== 'number') {
      setProbeError('Designate a host and a port first.')
      return
    }
    setProbing(true)
    setProbeError('')
    try {
      const answer = await window.monoka.probeLanBind(host, port)
      onUpdateWalk((current) => recordLanProbe(current, host, port, answer))
    } catch (error) {
      setProbeError(error instanceof Error ? error.message : String(error))
    } finally {
      setProbing(false)
    }
  }

  const showToken = () => {
    setTokenBusy(true)
    setTokenError('')
    window.monoka.getLanToken().then((answer) => setTokenState(answer)).catch((error: unknown) => setTokenError(error instanceof Error ? error.message : String(error))).finally(() => setTokenBusy(false))
  }
  const resetToken = () => {
    setTokenBusy(true)
    setTokenError('')
    window.monoka.rotateLanToken().then((answer) => { setTokenState({ token: answer.token, enforced: answer.enforced }) }).catch((error: unknown) => setTokenError(error instanceof Error ? error.message : String(error))).finally(() => setTokenBusy(false))
  }
  const copy = (label: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => setCopied(label)).catch(() => setCopied(''))
  }

  const url = read?.status.url ?? ''
  const secure = read?.status.secure ?? read?.posture.secure ?? false
  const fingerprint = read?.status.certificateFingerprint
  const probe = candidate.lanProbe

  return <div className="canvas-wizard-step" data-wizard-lan>
    <p className="canvas-wizard-lede">Who can open the studio? It is serving right now at the address below — keep that, narrow it to this machine, or keep the network and add a token.</p>
    <GateLine gate={gate} />

    {readError && <p className="canvas-wizard-warn" data-wizard-lan-read-error>The studio's live posture could not be read ({readError}) — the designation below still works; the printed URL will appear next boot.</p>}
    {read && <div className="canvas-wizard-note" data-wizard-lan-live>
      {url && <div className="canvas-wizard-row">
        <span data-wizard-lan-url>{url}</span>
        <button type="button" className="chip canvas-chip" data-wizard-lan-copy-url onClick={() => copy('url', url)}>{copied === 'url' ? 'Copied.' : 'Copy link'}</button>
      </div>}
      <span>{secure
        ? <>HTTPS with a self-signed certificate — a phone will ask you to confirm once. Fingerprint {fingerprint ?? 'unavailable'}.</>
        : 'Plain HTTP right now — no certificate is being served.'}</span>
      {overrides.length > 0 && <span data-wizard-lan-overrides>{overrides.join(', ')} come from environment you set yourself — those win over these choices.</span>}
    </div>}

    {/* The keep-current card — the DEFAULT. Chosen while nothing at all is
        designated; the one-click undo for every designation. */}
    <div className={`canvas-wizard-pick${touchesAnything ? '' : ' current'}`} data-wizard-lan-keep data-chosen={String(!touchesAnything)}>
      <button type="button" className="chip canvas-chip" data-wizard-lan-keep-click onClick={() => onUpdateWalk(keepLanPosture)}>Keep the current posture</button>
      <span className="canvas-wizard-hint">Change nothing. {touchesAnything ? 'Everything designated above is cleared.' : 'The studio stays exactly as it is — nothing is written.'}</span>
    </div>

    {/* The host choice, in world terms (§2.4). */}
    <div className="canvas-wizard-picks" data-wizard-lan-hosts>
      <div className={`canvas-wizard-pick${keys.host === '0.0.0.0' ? ' current' : ''}`} data-wizard-lan-host="0.0.0.0">
        <button type="button" className="chip chip--accent canvas-chip" onClick={() => chooseHost('0.0.0.0')}>Open to the network</button>
        <span className="canvas-wizard-hint">{LAN_HOST_LAN_COPY}</span>
      </div>
      <div className={`canvas-wizard-pick${keys.host === '127.0.0.1' ? ' current' : ''}`} data-wizard-lan-host="127.0.0.1">
        <button type="button" className="chip canvas-chip" onClick={() => chooseHost('127.0.0.1')}>This machine only</button>
        <span className="canvas-wizard-hint">{LAN_HOST_LOCAL_COPY}</span>
      </div>
    </div>

    {/* The port + bind probe — only within a designation, and the verdict is
        earned BEFORE the gate accepts (claimability before acceptance). */}
    {touchesBind && <div className="canvas-wizard-row" data-wizard-lan-bind>
      <label htmlFor="wizard-lan-port">Port</label>
      <input
        id="wizard-lan-port"
        type="number"
        min={1024}
        max={65535}
        value={keys.port ?? ''}
        data-wizard-lan-port
        onChange={(event) => {
          const text = event.target.value
          if (text === '') { onUpdateWalk((current) => setLanPort(current, undefined)); return }
          const parsed = Number(text)
          if (Number.isInteger(parsed)) onUpdateWalk((current) => setLanPort(current, parsed))
        }}
      />
      <button type="button" className="chip canvas-chip" data-wizard-lan-probe disabled={probing} onClick={() => { void runProbe() }}>{probing ? 'Probing…' : 'Probe this port'}</button>
      <span className="canvas-wizard-hint">{LAN_PORT_RANGE_COPY}</span>
      {probe && probe.claimable && <span className="canvas-wizard-ok" data-wizard-lan-probe-ok><Check size={13} /> This port is free on {probe.host} — the designation can be accepted.</span>}
      {probe && !probe.claimable && <span className="canvas-wizard-warn" data-wizard-lan-probe-busy>{probe.reason ? `Not claimable: ${probe.reason}.` : 'Not claimable.'} Pick another port and probe again.</span>}
      {probeError && <span className="canvas-wizard-warn" data-wizard-lan-probe-error>{probeError}</span>}
    </div>}

    {/* The token offer: STATE shown, the D8 truth stated plainly, and
        show/copy/reset one click away (D8). The toggle designates for the
        EXIT write; Reset is the one immediate fact (old links die), stated. */}
    <div className="canvas-wizard-pick" data-wizard-lan-token>
      <button
        type="button"
        className={`chip canvas-chip${keys.token === true ? ' chip--accent' : ''}`}
        data-wizard-lan-token-toggle
        data-chosen={String(keys.token === true)}
        onClick={() => onUpdateWalk((current) => setLanToken(current, current.lanKeys.token !== true))}
      >
        {keys.token === true ? 'Access token: on at next start' : keys.token === false ? 'Access token: off' : 'Access token: not designated'}
      </button>
      <span className="canvas-wizard-hint">{keys.token === true
        ? 'Links will need the token — the launcher prints the ready-to-open link at boot.'
        : keys.token === false
          ? 'The studio will serve without requiring a token.'
          : LAN_TOKEN_TRUTH_COPY}</span>
      <div className="canvas-wizard-row">
        {!tokenState && <button type="button" className="chip canvas-chip" data-wizard-lan-token-show disabled={tokenBusy} onClick={showToken}>Show token</button>}
        {tokenState && <>
          <code data-wizard-lan-token-value>{tokenState.token}</code>
          <button type="button" className="chip canvas-chip" data-wizard-lan-token-copy onClick={() => copy('token', tokenState.token)}>{copied === 'token' ? 'Copied.' : 'Copy'}</button>
          <button type="button" className="chip canvas-chip" data-wizard-lan-token-reset disabled={tokenBusy} onClick={resetToken}>Reset token</button>
          <span className="canvas-wizard-hint">Reset replaces the token now — printed links carrying the old one stop working.</span>
        </>}
        {tokenBusy && <span className="canvas-wizard-hint">working…</span>}
        {tokenError && <span className="canvas-wizard-warn" data-wizard-lan-token-error>{tokenError}</span>}
      </div>
      {read && <span className="canvas-wizard-hint" data-wizard-lan-token-state>{read.posture.tokenEnforced
        ? 'The token is enforced right now — links need it.'
        : read.posture.tokenConfigured
          ? 'A token exists; the studio currently serves without requiring it.'
          : 'No token exists yet.'}</span>}
    </div>

    <p className="canvas-wizard-note">{LAN_RESTART_COPY}{keys.host || keys.port !== undefined ? ' Your designation lands in the launcher\'s config (not the studio settings) — the launcher reads it at every boot.' : ''} {overrides.length > 0 ? `${overrides.join(', ')} stay set in your environment and win over the saved choices.` : LAN_OVERRIDES_COPY}</p>
  </div>
}

/** Step 5 — the first prompt: the deliberate submit (task 8, spec §2.5/§3).
 *  Enter NEVER submits (it inserts a newline — a prompt is prose, never a
 *  keystroke away from a job); the cost preview reads the SAME seam the
 *  properties panel and the submit refusal read (turboTierStates → the exit
 *  write's tier) plus the resolution/duration the submit will run
 *  (chainSettingsDefaults), the wait stated as a class. The exit summary
 *  speaks what the one-motion write WILL and WON'T carry — the silent drop
 *  named (T7's carried review), the unverified walk's honest voice (T5's) —
 *  and the placement disclosure names where pre-exit fetches landed when the
 *  designation differs (§3's exception: installs/fetches are facts, but not
 *  invisible ones). The buttons run the exit motion: ONE saveSettings with
 *  the five verified keys + the launcher-config write when LAN keys were
 *  earned (the live posture passed through — the equivalence arm is part of
 *  the verdict) + the latch; a FAILED write surfaces and the wizard does NOT
 *  latch done (a close that claims done on a failed write is a silent drop).
 *  "Generate my first clip" submits AFTER the write — the saved tier is what
 *  the submit runs; "Just create the chain" places the unsubmitted chain. */
function PromptStep(props: {
  gate: StepGate
  walk: WalkCandidate
  settings: AppSettings
  models: ReturnType<typeof useSessionStore.getState>['models']
  onLatchDone(): void
}) {
  const { gate, walk, settings, models } = props
  const submitPrompt = useCanvasStore((state) => state.submitPrompt)
  const placePromptChain = useCanvasStore((state) => state.placePromptChain)
  const [prompt, setPrompt] = useState('')
  const [exiting, setExiting] = useState(false)
  const [exitError, setExitError] = useState('')
  // The live posture: read once on mount, narrowed to the two host choices
  // the gate knows — the exit wiring MUST pass it into the gate seam, or a
  // status-quo LAN designation the step verified (the live equivalence)
  // silently drops its keys at the exit, the D8 token offer with them.
  const [livePosture, setLivePosture] = useState<{ host: LanHostChoice; port: number } | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    window.monoka.getLanStatus().then((answer) => {
      if (cancelled) return
      if (answer.posture.host === '127.0.0.1' || answer.posture.host === '0.0.0.0') setLivePosture({ host: answer.posture.host, port: answer.posture.port })
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])
  // The placement seam's ledger: fetches during the walk land at the
  // CONFIGURED models root (the fetcher reads live settings; the designation
  // becomes the root only at the exit). Polled like the other steps' boards.
  const [placedPaths, setPlacedPaths] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    const poll = () => window.monoka.listFetchCatalog().then((answer) => {
      if (cancelled) return
      const paths: string[] = []
      for (const entry of answer.entries) {
        if (entry.state === 'placed' && entry.placedPaths) paths.push(...entry.placedPaths)
      }
      setPlacedPaths(paths)
    }).catch(() => undefined)
    void poll()
    const timer = window.setInterval(poll, 3000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  // The exit write derives ONCE per state change and both the display and
  // the click consume the SAME object — displayed == executed, structurally.
  const tierStates = useMemo(() => turboTierStates(models, 'text'), [models])
  const write = useMemo(
    () => buildExitWrite(walk, tierStates, livePosture, { steps: settings.generationDefaults?.steps }),
    [walk, tierStates, livePosture, settings],
  )
  const summary = useMemo(() => exitWriteSummary(write), [write])
  const disclosure = useMemo(
    () => placementDisclosure({
      placedPaths,
      configuredRoot: settings.modelRoot,
      designatedRoot: isDesignated(walk.modelsRoot) ? walk.modelsRoot.value : '',
    }),
    [placedPaths, settings, walk],
  )
  const preview = useMemo(() => {
    const defaults = chainSettingsDefaults(settings)
    const turbo = write.settingsPatch.generationDefaults?.turbo ?? defaults.turbo
    return promptCostPreview({
      turbo,
      steps: tierStepCount(turbo, settings.generationDefaults?.steps),
      resolution: defaults.resolution,
      duration: defaults.duration,
    })
  }, [write, settings])

  const runExit = async (mode: 'generate' | 'chain') => {
    if (!prompt.trim() || exiting) return
    setExiting(true)
    setExitError('')
    try {
      const next = applyExitWrite(settings, write)
      const saved = await window.monoka.saveSettings(next)
      // The session store learns the saved settings BEFORE anything submits —
      // the submit reads chainSettingsDefaults from the store, so the saved
      // tier is what the submit runs.
      useSessionStore.getState().setSettings(saved.settings)
      if (write.launcherKeys) await window.monoka.writeLauncherConfig(write.launcherKeys)
      props.onLatchDone()
      if (mode === 'generate') await submitPrompt(prompt, 'video')
      else await placePromptChain(prompt, 'video')
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      setExitError(text)
      useCanvasStore.getState().toast('error', `The exit write did not land: ${text}`)
    } finally {
      setExiting(false)
    }
  }

  return <div className="canvas-wizard-step" data-wizard-prompt>
    <p className="canvas-wizard-lede">Describe one shot. The chain lands on the canvas; generate when you're ready — a refused engine says so honestly. Enter makes a newline; only a button writes or submits.</p>
    <GateLine gate={gate} />
    <textarea
      data-wizard-prompt-input
      rows={3}
      value={prompt}
      placeholder="A lighthouse over a black sea, slow push-in, no dialogue"
      onChange={(event) => setPrompt(event.target.value)}
    />
    <p className="canvas-wizard-hint" data-wizard-cost-preview>{preview}</p>
    <div className="canvas-wizard-exit" data-wizard-exit-summary>
      <p>{summary.headline}</p>
      <ul>
        {summary.items.map((item) => (
          <li key={item.key} data-wizard-exit-item={item.key} data-carried={String(item.carried)}>
            <strong>{item.label}</strong>
            {item.carried
              ? <span> — {item.value}{item.note ? ` — ${item.note}` : ''}</span>
              : <span className="canvas-wizard-hint"> — {item.reason}</span>}
          </li>
        ))}
      </ul>
      {disclosure && <p className="canvas-wizard-hint" data-wizard-placement-disclosure>
        Fetched weights landed in {disclosure.folder} — your designation takes over as the models root at the exit. Move them there or re-designate; the studio will not move them silently ({disclosure.files.length} file{disclosure.files.length === 1 ? '' : 's'}).
      </p>}
      <p className="canvas-wizard-note">Installs and fetches that already happened are facts — they stay. A button below writes the configuration once; nothing is saved as you type.</p>
    </div>
    {exitError && <p className="canvas-wizard-warn" data-wizard-exit-error>{exitError}</p>}
    <div className="canvas-wizard-row">
      <button type="button" className="chip chip--accent canvas-chip" data-wizard-generate disabled={!prompt.trim() || exiting} onClick={() => { void runExit('generate') }}>
        <Sparkles size={12} /> Generate my first clip
      </button>
      <button type="button" className="chip canvas-chip" data-wizard-just-chain disabled={!prompt.trim() || exiting} onClick={() => { void runExit('chain') }}>
        Just create the chain
      </button>
      {exiting && <span className="canvas-wizard-hint">writing…</span>}
    </div>
  </div>
}
