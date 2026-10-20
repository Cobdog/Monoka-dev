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
import { useContext, useEffect, useMemo, useState } from 'react'
import { Check, HardDrive, RefreshCw, Sparkles, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { dbg } from '../lib/dbg'
import { h3StackReport } from '../lib/h3Stack'
import { useSessionStore } from '../state/sessionStore'
import { useCanvasStore } from './store'
import { CanvasSessionContext } from './sessionContext'
import { WIZARD_REOPEN_EVENT } from './FirstRunNotice'
import {
  WALK_STEPS,
  emptyWalkCandidate,
  lanGate,
  markEngineVerified,
  modelsGate,
  packsGate,
  promptGate,
  setCandidateUrl,
  shouldPresent,
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
  const engineInfo = useSessionStore((state) => state.info)
  const submitPrompt = useCanvasStore((state) => state.submitPrompt)
  const setSettingsDock = useCanvasStore((state) => state.setSettingsDock)
  const setLibraryDock = useCanvasStore((state) => state.setLibraryDock)

  const [state, setState] = useState<WizardState>(() => ({ ...readWizard() }))
  // The walk's candidate state (spec §3): born from the settings prefill the
  // moment there are settings to prefill from, then held in memory for the
  // whole walk — NEVER a settings write (the exit's one motion is task 8's;
  // skip persists nothing, D3).
  const [walk, setWalk] = useState<WalkCandidate | null>(null)
  useEffect(() => {
    if (settings !== null && walk === null) setWalk(emptyWalkCandidate(settings.comfyUrl))
  }, [settings, walk])
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
  // whether the instance actually serves the H3 core node classes.
  const stack = useMemo(() => (settings ? h3StackReport(models, settings.modelOverrides?.monoka, engineInfo) : null), [models, settings, engineInfo])

  // The present decision rides the spine's predicate: the local latch rules
  // until the server requests setup (spec §4) — task 9 wires that flag in;
  // until then `false` is exactly today's behavior, through the seam.
  const presenting = shouldPresent({ latchDone: state.done, latchSkipped: state.skipped, serverSetupRequested: false })
  // The session machinery (scan/check callbacks) rides the canvas session
  // context — the wizard lives on the canvas route where EngineHost provides
  if (!context || !sawScan || scanning || !presenting || !settings || !walk) return null
  const { scanModels, checkConnection } = context.session

  const close = () => patch({ done: true })
  const step = Math.min(state.step, STEP_TITLES.length - 1)

  const body = (() => {
    if (step === 0) return <EngineStep candidate={walk} onCandidate={updateWalk} checkConnection={checkConnection} />
    if (step === 1) return <RegistryStep models={models} scanning={scanning} stack={stack} gate={modelsGate(walk)} onRefresh={() => void scanModels(settings, { refresh: true })} />
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

/** Step 2 — the registry readout + stack verdict (post-directive: NO path
 *  entry). The gate line rides above the content: with no verified engine
 *  the §2.1 honesty replaces the stack verdict (never an invented one).
 *  Task 5 reworks this slot to named per-component truth. */
function RegistryStep(props: { models: ReturnType<typeof useSessionStore.getState>['models']; scanning: boolean; stack: ReturnType<typeof h3StackReport> | null; gate: StepGate; onRefresh(): void }) {
  const { models, scanning, stack, gate, onRefresh } = props
  const counts = useMemo(() => {
    const byKind = new Map<string, number>()
    for (const model of models) byKind.set(model.kind, (byKind.get(model.kind) ?? 0) + 1)
    return [...byKind.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [models])
  return <div className="canvas-wizard-step" data-wizard-registry>
    <p className="canvas-wizard-lede">The connected engine's own model registry — everything it can see, nothing it can't. Add weights where the engine reads them, then refresh.</p>
    <GateLine gate={gate} />
    {counts.length === 0
      ? <p className="canvas-wizard-warn" data-wizard-no-models><HardDrive size={13} /> The engine lists no models yet. You can fetch the validated stack through the library (next-next step's packs, or Settings), or place weights where the engine reads them and refresh.</p>
      : <ul className="canvas-wizard-models" data-wizard-model-kinds>
        {counts.map(([kind, count]) => <li key={kind} data-wizard-model-kind={kind}><strong>{kind.replace(/_/g, ' ')}</strong><span>{count}</span></li>)}
      </ul>}
    {gate.verdict === 'verified' && stack && <p className={`canvas-wizard-${stack.validated || stack.ready ? 'ok' : 'warn'}`} data-wizard-stack={stack.validated ? 'validated' : stack.ready ? 'custom' : 'incomplete'}>
      {stack.validated
        ? <><Check size={13} /> The validated official H3 stack is complete.</>
        : stack.nodes.missing.length > 0
          ? `The engine does not serve the studio's core render nodes (${stack.nodes.missing.map((item) => item.className).join(', ')}) — weights cannot fix this. Update ComfyUI (or install the missing node packs), restart the engine, then refresh.`
          : stack.ready
            ? 'Custom stack detected — every component the graphs load is present; output may differ from the validated set.'
            : stack.rows.some((row) => row.refusal)
              ? 'A component was found but refused (wrong class) — the row names the reason. Clear or fix the pick in Settings → Model overrides.'
              : 'The H3 stack is incomplete — make the missing components visible to the engine (any name shape the pickers recognize resolves), then refresh.'}
    </p>}
    <div className="canvas-wizard-row">
      <Button variant="ghost" className="chip canvas-chip" size={12} data-wizard-refresh busy={scanning} icon={<RefreshCw size={12} />} onClick={onRefresh}>
        Refresh from the engine
      </Button>
    </div>
  </div>
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
