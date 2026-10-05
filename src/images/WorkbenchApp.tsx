/**
 * H3 Image Workbench — the dedicated surface (task k9vu6t0, spec §2:
 * the ?datasets=1 precedent). Own lazy route at ?images=1: the mode rail
 * (Generate packet/T=1/directed, Compose, the six Edit families, Refine,
 * Burst gated, Exit), the preview canvas, the 9-slot reference strip with
 * roles + auto-per-role transports + expert override, the Keep dial with
 * per-picture overrides, 2 LoRA slots (form-adapter first, guidance), the
 * TAKE STRIP as the pick surface (frame artifacts of one take; the
 * first-party scorer's verdict; manual pick = the canonical frame pointer),
 * the always-opt-in one-tap Refine affordance with engine pairing, the
 * consent-gated canvas handoffs both ways, and the start-frame exit.
 *
 * The session is a canvas chain of kind 'h3img' in the ACTIVE project (the
 * document-store object, spec §2) — generations land as packet takes
 * through the shared landing loop; nothing here re-implements queueing.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ImagePlus, Layers, LoaderCircle, Lock, Send, Settings, Sparkles, Wand2, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { StudioSelect } from '../ui/StudioSelect'
import { NoticeBanner } from '../ui/NoticeBanner'
import { SaveStatus, type SaveState } from '../ui/SaveStatus'
import { StudioDialogLayered } from '../ui/StudioDialogLayered'
import { CanvasToastAdapter } from '../canvas/toastAdapter'
import { useStudioSession } from '../hooks/useStudioSession'
import { useGenerationQueue } from '../hooks/useGenerationQueue'
import { useLivePreview } from '../lib/useLivePreview'
import { useSessionStore } from '../state/sessionStore'
import { submitH3DiagnosticPair } from '../lib/h3Diagnostics'
import { SettingsDock } from '../canvas/SettingsDock'
import { LibraryDock } from '../components/LibraryDock'
import { RemediationDock } from '../canvas/RemediationDock'
import { CanvasSessionContext } from '../canvas/sessionContext'
import { useJobsStore } from '../state/jobsStore'
import { useCanvasStore, engineBridge } from '../canvas/store'
import { documentsApi } from '../canvas/api'
import { ASPECT_RATIOS, ratioKeyOf, snapResolutionDim, tieredResolutionGroups } from '../lib/aspectResolutions'
import type { ImageMachinery } from '../lib/aspectResolutions'
import { chainTitle } from '../canvas/derive'
import type { DocumentChain, DocumentTake } from '../canvas/derive'
import type { MediaFile } from '../types'
import { submitWorkbenchGeneration, workbenchAvailability, t1MachineryOf } from './submit'
import type { ResolvedRef } from './submit'
import { burstFuse } from '../lib/h3imageOps'
import { createStageExecutor } from '../lib/h3imageStaging'
import { H3IMG_OP_TONE_LOCK, canonicalFrameIndex, frameUrl, isWorkbenchChain, readSessionSettings, sessionContract, takeFrames, takeProvenance } from './session'
import type { SessionRefSlot, WorkbenchSessionSettings } from './session'
import { BEYOND_NINE_GUIDANCE, keepDialHint } from '../lib/h3imageContract'
import { H3IMG_RECIPE_PINS, STOCK_SAMPLED_FRAMES, TRANSPORT_FOR_ROLE, findH3ImgFamily, h3ImageStudioPackPresent, packetTierLabel, FIZGIG_H3_STILL_PACK_NAME, fizgigH3StillPackPresent } from '../lib/graph/h3image'
import type { H3ImgRefRole, H3ImgT1Settings } from '../lib/graph/h3image'
import { mediaForOutput, buildOutputIndex } from '../canvas/generation'
import { chainSettingsDefaults } from '../canvas/generation'
import { CANVAS_EDIT_HANDOFF_KEY, H3_ONE_FRAME_FAMILY, handoffPreviewUrl, pinRegenerationNotice } from '../canvas/stillIntent'
import { SurfaceSwitcher } from '../surfaces/SurfaceSwitcher'
import './workbench.css'

const ROLES: H3ImgRefRole[] = ['subject', 'pose', 'style', 'lighting', 'background', 'freeform']

/** The E-IW2 experiment gate (burst lane) — off until the experiment
 * promotes defaults; a localStorage opt-in exists for the experiment run. */
export const IW_EXPERIMENTS_KEY = 'h3img-experiments'

function experimentsEnabled(): boolean {
  try {
    return window.localStorage.getItem(IW_EXPERIMENTS_KEY) === 'on'
  } catch {
    return false
  }
}

/** The engine/session host for the workbench route (the CanvasEngineHost
 * pattern: the shared hooks keep one queue, one engine session — mounted
 * outside the canvas shell). (R-21, Wave 3) the host PROVIDES the session
 * context so the docked Settings + Library surfaces mount HERE too —
 * opening settings from the workbench no longer replaces the view. */
function WorkbenchEngineHost({ children }: { children: ReactNode }) {
  const toast = useCanvasStore((state) => state.toast)
  const notify = useCallback((tone: 'error' | 'success' | 'neutral', text: string) => toast(tone, text), [toast])
  const session = useStudioSession()
  const queue = useGenerationQueue({ settings: session.settings, connected: session.status.connected, notify })
  const live = useLivePreview(session.settings?.comfyUrl, true, queue.onLiveProgress)
  engineBridge.clientId = live.clientId
  engineBridge.cancellationRequests = queue.cancellationRequests
  engineBridge.cancelJob = (job) => void queue.cancelJob(job)
  const runDiagnostics = async () => {
    const state = useSessionStore.getState()
    if (!state.settings) return 'Studio settings are still loading.'
    return submitH3DiagnosticPair(
      { settings: state.settings, connected: state.status.connected, models: state.models, info: state.info, clientId: engineBridge.clientId },
      {
        notify: (tone2, text) => useCanvasStore.getState().toast(tone2, text),
        setJobs: (update) => useJobsStore.getState().setJobs(update),
      },
    )
  }
  return <CanvasSessionContext.Provider value={{ session, runDiagnostics }}>
    {children}
    <SettingsDock />
    <LibraryDock />
    <RemediationDock />
  </CanvasSessionContext.Provider>
}

const MODE_GROUPS: Array<{ mode: string; label: string; families: string[] }> = [
  { mode: 'generate', label: 'Generate', families: ['h3img.generate.packet', 'h3img.generate.packet.directed', 'h3img.generate.t1', 'h3img.generate.sharp'] },
  { mode: 'compose', label: 'Compose', families: ['h3img.r2i.refs', 'h3img.compose.refs'] },
  { mode: 'edit', label: 'Edit', families: ['h3img.edit.instruct', 'h3img.edit.inpaint', 'h3img.edit.identity', 'h3img.edit.background', 'h3img.edit.outfit', 'h3img.edit.lighting', 'h3img.edit.pose', 'h3img.edit.freeform'] },
  { mode: 'refine', label: 'Refine', families: ['h3img.refine.krea2', 'h3img.refine.klein'] },
  { mode: 'burst', label: 'Burst', families: ['h3img.burst.fuse', 'h3img.burst.seedvr2'] },
  { mode: 'exit', label: 'Exit', families: ['h3img.exit.anchor'] },
]

/** (W5) The sub-lane row's own vocabulary — short, unambiguous lane names.
 *  The video-settle lane says "video" (it lives under Generate, but its old
 *  "Directed edit" label made the word "Edit" span a video lane AND the
 *  still Edit lanes — the walk's own tooling twice landed on the wrong
 *  one); the still lanes keep their "Edit — …" shape. Tooltips carry the
 *  full family labels + descriptions. */
const MODE_LANE_LABELS: Record<string, string> = {
  'h3img.generate.packet': 'Frame packet',
  'h3img.generate.packet.directed': 'Directed video edit (39-frame settle)',
  'h3img.generate.t1': 'T=1 Fast',
  'h3img.generate.sharp': 'Fast-sharp slice',
  'h3img.r2i.refs': 'Reference → image (single frame)',
  'h3img.compose.refs': 'Compose (9 references)',
}

/** The T=1 machinery choices (the 1F full image stack, 2026-09-26): the
 *  honest dev/experimental affordance over the settings flag. Defaults and
 *  wordings are DOC-VERIFIED against the pack's own README + example
 *  workflows (docs/research/fizgig-h3-still-assessment.md's settings-
 *  exposure matrix). */
const T1_MACHINERY_CHOICES: Array<{ value: H3ImgT1Settings; label: string; title: string }> = [
  { value: 'image-studio', label: 'Image Studio (default)', title: 'The landed 1F lane: the Image Studio pack\'s conditioning latent + the Mamad8 image-VAE decode (hybrid b25-49, turbo @0.75 + detail @0.5, 8 steps). The native ~1 MP envelope is its documented sweet spot.' },
  { value: 'fizgig', label: 'Fizgig (experimental)', title: 'The author\'s shipped stills recipe: plain FL2VA, turbo @0.38, 20 steps, er_sde/simple — the Fizgig latent + the group-replicate video-VAE decode keeping frame 3. No Mamad8, no extra weights. Best from 2.5 MP up (their words: "best from 3 MP up").' },
  { value: 'fizgig-max', label: 'Fizgig max quality (experimental)', title: 'The author\'s highest-quality point (their 8 MP demonstration): the same Fizgig machinery with the Turbo loader at 0 and 50 steps — roughly double the render time, for the top of the image ladder.' },
]

/** (W6, perfect-state sweep 2026-09-27) The machinery set behind the T=1
 *  badge: when the SELECTED machinery is unavailable the badge names how
 *  many machineries DO render the lane — "unavailable" only when none can.
 *  A user who never opens the tab must still learn a working path exists. */
const T1_MACHINERIES: H3ImgT1Settings[] = ['image-studio', 'fizgig', 'fizgig-max']
const T1_MACHINERY_SHORT: Record<H3ImgT1Settings, string> = { 'image-studio': 'Image Studio', fizgig: 'Fizgig', 'fizgig-max': 'Fizgig max quality' }

export function WorkbenchApp() {
  return (
    <WorkbenchEngineHost>
      <WorkbenchSurface />
    </WorkbenchEngineHost>
  )
}

/** A session-settings patch: a plain partial (scalar fields fold per-key), or
 *  a FUNCTION of the fresh base the flush reads at write time — mandatory for
 *  collection-valued fields (refs/loras/framePicks), whose whole-array values
 *  must be derived from current durable state, never a render-scope snapshot
 *  (fix round 1, review F1: snapshot-derived arrays re-introduced the A03
 *  erase for collections inside the write-latency window). A function may
 *  return null to DECLINE when a fresh-state precondition fails (the 9-slot
 *  budget): the op is skipped — the write is not a failure — and the function
 *  owns the user feedback for declining. */
type SessionSettingsPatch = Partial<WorkbenchSessionSettings> | ((current: WorkbenchSessionSettings) => Partial<WorkbenchSessionSettings> | null)

/** Collision-proof ref-slot ids (fix round 2): two appends inside one clock
 *  millisecond — exactly the write-latency window — used to collide, both as
 *  durable identities and as React keys. The counter makes ids unique within
 *  a session; the timestamp keeps them unique across reloads. */
let refSlotSeq = 0
const nextRefSlotId = () => `ref-${Date.now()}-${(refSlotSeq += 1)}`

function WorkbenchSurface() {
  const boot = useCanvasStore((state) => state.boot)
  const phase = useCanvasStore((state) => state.phase)
  const activeProjectId = useCanvasStore((state) => state.activeProjectId)
  const documents = useCanvasStore((state) => state.documents)
  const sessionState = useSessionStore()
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sourceFile, setSourceFile] = useState<{ path: string; name: string; preview?: string; masked?: boolean; width?: number; height?: number } | null>(null)
  const [refineInstruction, setRefineInstruction] = useState('')
  const [exitOpen, setExitOpen] = useState(false)
  const [canvasPickerOpen, setCanvasPickerOpen] = useState(false)
  // (W8) The picker's consumer: a reference slot (the original) or the
  // anchored/masked SOURCE — the lane that needs a canvas take most.
  const [canvasPickerMode, setCanvasPickerMode] = useState<'ref' | 'source'>('ref')
  const [maskPainterOpen, setMaskPainterOpen] = useState(false)
  const [freeRatio, setFreeRatio] = useState(false)
  const [experiments, setExperiments] = useState(experimentsEnabled())
  const fileInput = useRef<HTMLInputElement | null>(null)
  const sourceInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void boot()
  }, [boot])
  // jobsStore ticks drive the shared landing loop + tile recompute.
  useEffect(() => useJobsStore.subscribe(() => useCanvasStore.getState().recompute()), [])

  const doc = activeProjectId ? documents[activeProjectId] ?? null : null
  const sessionChain = useMemo(() => doc?.chains.find((chain) => isWorkbenchChain(chain)) ?? null, [doc])

  // Session bootstrap: the workbench session is a chain of kind 'h3img' in
  // the active project — created on first open (the user's explicit act of
  // opening the workbench in this project).
  const ensureSession = useCallback(async () => {
    if (!doc) return null
    const existing = doc.chains.find((chain) => isWorkbenchChain(chain))
    if (existing) return existing
    try {
      const chain = await documentsApi.createChain({
        projectId: doc.project.id,
        kind: 'h3img',
        settings: { family: 'h3img.generate.packet', intent: '', tier: 5, keepDial: 0.55, seed: Math.floor(Math.random() * 1_000_000_000), resolution: '1344x768', loras: [], refs: [], semanticOverflow: false, framePicks: {}, refineEngine: '', poserigInbox: null } as unknown as Record<string, unknown>,
      })
      await useCanvasStore.getState().reloadActiveDocument()
      return chain
    } catch (error) {
      setNotice(`The workbench session could not be created: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }, [doc])

  useEffect(() => {
    if (phase === 'ready' && doc && !sessionChain) void ensureSession()
  }, [phase, doc, sessionChain, ensureSession])

  // No open canvas: opening the workbench IS the consent to create its home
  // canvas (the seedChain precedent — a surface that needs a project makes
  // one rather than dead-ending on a spinner).
  useEffect(() => {
    if (phase === 'ready' && !doc) void useCanvasStore.getState().createCanvas()
  }, [phase, doc])

  const settings = useMemo(() => readSessionSettings(sessionChain?.settings), [sessionChain])
  // The session's T=1 machinery (the 1F full image stack): one source of
  // truth read from AppSettings — detection, the resolution tiers' optimal
  // markers, and the submit seam all key on this value.
  const t1Machinery = t1MachineryOf(sessionState.settings)
  const setT1Machinery = useCallback(async (value: H3ImgT1Settings) => {
    const current = sessionState.settings
    if (!current) {
      setNotice('Studio settings are still loading.')
      return
    }
    const next = { ...current, experimentalT1Decode: value }
    try {
      sessionState.setSettings(next)
      const saved = await window.minimax.saveSettings(next)
      sessionState.setSettings(saved.settings)
    } catch (error) {
      setNotice(`The T=1 machinery choice could not be saved: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [sessionState])
  const availability = useMemo(() => (sessionState.models.length || sessionState.status.connected ? workbenchAvailability({ info: sessionState.info, models: sessionState.models, t1Machinery }) : []), [sessionState.models, sessionState.info, sessionState.status.connected, t1Machinery])
  const detectionOf = useCallback((familyId: string) => availability.find((entry) => entry.family.id === familyId)?.detection ?? null, [availability])
  // The pack-present branch (afvlbk4): with the H3 Image Studio pack served,
  // packet tiers ride its EXACT latent ladder (the labels drop the honest
  // "samples 22 on stock nodes" cost note) and T=1/fast-sharp render.
  const studioPackOnEngine = useMemo(() => h3ImageStudioPackPresent(sessionState.info), [sessionState.info])
  const fizgigPackOnEngine = useMemo(() => fizgigH3StillPackPresent(sessionState.info), [sessionState.info])

  // Session writes are SERIALIZED (audit A03): each patch joins one pending
  // queue and a queued flush reads the chain FRESH from the store at write
  // time — the closure chain is stale across awaits, and two rapid edits used
  // to build two complete settings objects from the same snapshot, the second
  // erasing the first's field with both requests succeeding. (Fix round 1,
  // review F1) COLLECTION-valued fields patch as functions of that fresh
  // base: a whole-array value derived from the render-scope `settings` memo
  // re-created the same erase inside the write-latency window, because the
  // second array was built before the first write's reload landed.
  const pendingPatchesRef = useRef<SessionSettingsPatch[]>([])
  const writeQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))
  // (Task 20, k2q0n9s) The session writes' save fate, beside Generate — the
  // shared SaveStatus tier. Failures previously surfaced as a vanishing
  // NoticeBanner line; the inline tier owns them now (the server reason
  // verbatim + retry). The FAILED ops are RETAINED until they land — the
  // inspector's F02 ackedRef doctrine applied to this queue: a later flush
  // re-composes the retained ops over the fresh base FIRST (never silently
  // abandoning an unlanded edit), and the retry re-runs the same flush, so
  // it can never revert a newer edit either.
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveDetail, setSaveDetail] = useState<string | null>(null)
  const failedPatchesRef = useRef<SessionSettingsPatch[] | null>(null)
  const flushSessionWrites = useCallback(async (): Promise<boolean> => {
    const retained = failedPatchesRef.current ?? []
    const pending = pendingPatchesRef.current
    if (!retained.length && !pending.length) return true
    pendingPatchesRef.current = []
    failedPatchesRef.current = null
    const ops = [...retained, ...pending]
    const state = useCanvasStore.getState()
    const projectId = state.activeProjectId
    const freshChain = (projectId ? state.documents[projectId] ?? null : null)?.chains.find((chain) => isWorkbenchChain(chain)) ?? null
    if (!freshChain) {
      setSaveState('failed')
      setSaveDetail('the workbench session is gone')
      failedPatchesRef.current = ops
      return false
    }
    try {
      setSaveState('saving')
      setSaveDetail(null)
      // The queued ops compose IN ORDER over the fresh base: plain
      // partials overlay per-key (the original fold semantics); functions
      // re-derive their collections from a base that already carries every
      // earlier op — and a straddling flush starts from the previous
      // write's durable result. Retained (previously failed) ops compose
      // first, so retry and later writes re-apply them without clobbering
      // anything newer.
      let next = readSessionSettings(freshChain.settings)
      for (const op of ops) {
        const partial = typeof op === 'function' ? op(next) : op
        if (partial) next = { ...next, ...partial }
      }
      await documentsApi.updateChain({ id: freshChain.id, settings: next as unknown as Record<string, unknown> })
      await state.reloadActiveDocument()
      setSaveState('saved')
      return true
    } catch (error) {
      setSaveState('failed')
      setSaveDetail(error instanceof Error ? error.message : String(error))
      failedPatchesRef.current = ops
      return false
    }
  }, [])
  const patchSettings = useCallback((patch: SessionSettingsPatch): Promise<boolean> => {
    pendingPatchesRef.current = [...pendingPatchesRef.current, patch]
    const write = writeQueueRef.current.then(flushSessionWrites)
    writeQueueRef.current = write.catch(() => false)
    return write
  }, [flushSessionWrites])
  // The SaveStatus retry: the SAME queue, the SAME flush — the retained ops
  // are still held, so the click re-attempts exactly the unlanded edits.
  const retrySessionSave = useCallback((): void => {
    const write = writeQueueRef.current.then(flushSessionWrites)
    writeQueueRef.current = write.catch(() => false)
    void write
  }, [flushSessionWrites])

  // The takes of the session (the pick surface), newest-first.
  const takes = useMemo(() => {
    if (!sessionChain) return [] as DocumentTake[]
    return sessionChain.outputs.flatMap((output) => output.takes).sort((a, b) => b.createdAt - a.createdAt)
  }, [sessionChain])
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null)
  const selectedTake = useMemo(() => takes.find((take) => take.id === selectedTakeId) ?? takes.find((take) => take.supersededBy === null) ?? takes[0] ?? null, [takes, selectedTakeId])
  const selectedProvenance = takeProvenance(selectedTake)
  const frames = useMemo(() => takeFrames(selectedTake), [selectedTake])
  const effectivePick = canonicalFrameIndex(selectedTake, settings.framePicks)
  const family = findH3ImgFamily(settings.family)

  // (W6) T=1-profile readiness across ALL machineries (badge + note data):
  // the selected machinery gates Generate as before, but the lane's own
  // state reflects the best-available machinery — and the unavailable note
  // points at the working switch instead of dead-ending.
  const t1ReadyMachineries = useMemo(() => {
    if (!family || family.profile !== 't1') return [] as H3ImgT1Settings[]
    return T1_MACHINERIES.filter((machinery) => family.detect(sessionState.info, sessionState.models, { t1Machinery: machinery }).available)
  }, [family, sessionState.info, sessionState.models])
  const t1BadgeText = useCallback((familyId: string, detection: { available: boolean } | null | undefined): string => {
    if (detection?.available) return ''
    const target = findH3ImgFamily(familyId)
    if (!target || target.profile !== 't1') return 'unavailable'
    const ready = T1_MACHINERIES.filter((machinery) => target.detect(sessionState.info, sessionState.models, { t1Machinery: machinery }).available)
    return ready.length ? `${ready.length} of ${T1_MACHINERIES.length} machineries ready` : 'unavailable'
  }, [sessionState.info, sessionState.models])

  // The composer preview (generated, read-only — never hand-written).
  const contract = useMemo(() => sessionContract(settings, { sourceAnchored: Boolean(sourceFile) && (family?.kind === 'edit' || family?.kind === 'generate-directed') }), [settings, sourceFile, family])

  // Ref slot management -------------------------------------------------------
  const addFileRef = useCallback((file: File) => {
    const preview = URL.createObjectURL(file)
    void (async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        let binary = ''
        const chunk = 0x8000
        for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
        const ingested = await documentsApi.ingestBlob({ dataBase64: btoa(binary), name: file.name, kind: 'image' })
        const slot: SessionRefSlot = {
          id: nextRefSlotId(),
          // Smart default from the source: poserig renders default to pose.
          role: /poserig|pose/i.test(file.name) ? 'pose' : 'subject',
          transport: null,
          keepOverride: null,
          note: '',
          source: { kind: 'file', path: ingested.path, name: file.name, preview },
        }
        // The append is a FUNCTION of the fresh base — the 9-slot budget is
        // re-checked at write time, so a ref that raced another append can
        // never land as the tenth slot.
        await patchSettings((current) => {
          if (current.refs.length >= 9) {
            setNotice(BEYOND_NINE_GUIDANCE)
            return null
          }
          return { refs: [...current.refs, slot] }
        })
      } catch (error) {
        setNotice(`The reference could not be added: ${error instanceof Error ? error.message : String(error)}`)
      }
    })()
  }, [patchSettings])

  // The anchored source: bytes land through the blob ingest so the path is
  // uploadable (an object URL is not a filesystem path).
  const pickSource = useCallback(async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      const chunk = 0x8000
      for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
      const ingested = await documentsApi.ingestBlob({ dataBase64: btoa(binary), name: file.name, kind: 'image' })
      setSourceFile({ path: ingested.path, name: file.name, preview: `/api/lan/documents/blobs/file?path=${encodeURIComponent(ingested.blob.relPath)}` })
    } catch (error) {
      setNotice(`The source image could not be added: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  // The canvas → source pick (W8): resolve the picked take through the same
  // output index the reference slots use — the source gets the same in-app
  // affordance the references always had (the OS dialog was the only path).
  const pickCanvasSource = useCallback(async (outputId: string, takeId: string | null, previewUrl: string | null) => {
    if (!doc) return
    const entry = buildOutputIndex(doc).get(outputId)
    const resolved = mediaForOutput(entry, takeId)
    if (!resolved) {
      setNotice('That canvas take could not be resolved to a media file — its artifacts may have been evicted.')
      return
    }
    setSourceFile({ path: resolved.media.path, name: resolved.media.name, preview: previewUrl ?? resolved.media.preview })
  }, [doc])

  // Poserig handoff inbox (the rig surface stashes a render for the
  // workbench). (Audit A11) a cold navigation used to consume the inbox
  // BEFORE the session chain existed — patchSettings early-returned on
  // !sessionChain and the delivered reference vanished. The inbox is left in
  // place until a session exists to receive it; the key is taken when the
  // write starts (a re-render mid-write cannot append the slot twice) and
  // put BACK if the save fails — consumed for good only once the reference
  // is durably saved.
  useEffect(() => {
    if (!sessionChain) return
    try {
      const raw = window.localStorage.getItem('h3img-poserig-handoff')
      if (!raw) return
      const parsed = JSON.parse(raw) as { path: string; name: string }
      window.localStorage.removeItem('h3img-poserig-handoff')
      // The append derives from the FRESH base at write time: the 9-slot
      // budget is re-checked there (a full session declines with the
      // guidance and the key stays consumed — nothing could land), and the
      // slot rides a refs array that carries every edit that landed while
      // the handoff was in flight.
      void patchSettings((current) => {
        if (current.refs.length >= 9) {
          setNotice(BEYOND_NINE_GUIDANCE)
          return null
        }
        return { refs: [...current.refs, { id: nextRefSlotId(), role: 'pose', transport: null, keepOverride: null, note: 'poserig render', source: { kind: 'poserig', path: parsed.path, name: parsed.name } }] }
      }).then((saved) => {
        if (!saved) window.localStorage.setItem('h3img-poserig-handoff', raw)
      })
    } catch {
      /* a malformed handoff is dropped silently — it is a convenience key */
    }
  }, [sessionChain, patchSettings])

  // Canvas image+control handoff (34afx79, dated decision 2026-09-19): the
  // canvas's stills intent with a BOUND image routes HERE — the Edit surface
  // with the image anchored as the source (Picture 1). The canvas ships no
  // control-stills graph; reference/canny-style image work is this surface's
  // job (the ControlNet-Union-on-Z-Image path retired with Z-Image). Unlike
  // the poserig inbox, this consumes ONLY once the session chain exists — a
  // first-open handoff survives the session bootstrap instead of being read
  // and dropped before it can land.
  useEffect(() => {
    if (!sessionChain) return
    try {
      const raw = window.localStorage.getItem(CANVAS_EDIT_HANDOFF_KEY)
      if (!raw) return
      window.localStorage.removeItem(CANVAS_EDIT_HANDOFF_KEY)
      const parsed = JSON.parse(raw) as { path: string; name: string; intent: string }
      if (typeof parsed.path !== 'string' || !parsed.path) return
      setSourceFile({ path: parsed.path, name: typeof parsed.name === 'string' && parsed.name ? parsed.name : parsed.path.split('/').pop() ?? 'source.png', preview: handoffPreviewUrl(parsed.path) })
      void patchSettings({ family: 'h3img.edit.freeform', intent: typeof parsed.intent === 'string' ? parsed.intent : '' })
      setNotice('Canvas handoff: the bound image is anchored as the Edit source (Picture 1) — name the change in the intent box, then generate.')
    } catch {
      /* a malformed handoff is dropped silently — it is a convenience key */
    }
  }, [sessionChain, patchSettings])

  // The resolved refs for submission (canvas slots resolve through the
  // document's output index; file/poserig slots carry their paths).
  const resolveRefs = useCallback((): ResolvedRef[] => {
    if (!doc) return []
    const index = buildOutputIndex(doc)
    return settings.refs.flatMap((slot) => {
      if (slot.source.kind === 'canvas') {
        const entry = index.get(slot.source.outputId)
        const resolved = mediaForOutput(entry, slot.source.takeId)
        if (!resolved) return []
        return [{ media: resolved.media, role: slot.role, transport: slot.transport ?? TRANSPORT_FOR_ROLE[slot.role], note: slot.note }]
      }
      if (slot.source.kind === 'refmod') return [] // read-only in v1 — never submitted
      return [{ media: { path: slot.source.path, name: slot.source.name, kind: 'image' }, role: slot.role, transport: slot.transport ?? TRANSPORT_FOR_ROLE[slot.role], note: slot.note }]
    })
  }, [doc, settings.refs])

  // Generation ----------------------------------------------------------------
  const generate = useCallback(async () => {
    if (!sessionChain || !sessionState.settings) {
      if (!sessionState.settings) setNotice('Studio settings are still loading.')
      return
    }
    setBusy(true)
    try {
      await submitWorkbenchGeneration(
        {
          chainId: sessionChain.id,
          settings,
          refs: resolveRefs(),
          source: sourceFile ? { path: sourceFile.path, name: sourceFile.name, kind: 'image', ...(sourceFile.preview ? { preview: sourceFile.preview } : {}) } : null,
          // The inpaint lane's masked source (the 1F full image stack): the
          // alpha channel is the mask and the canvas pins to its snapped
          // dims — validated at the submit seam.
          sourceMask: sourceFile?.masked || undefined,
          sourceDims: sourceFile?.width && sourceFile?.height ? { width: sourceFile.width, height: sourceFile.height } : undefined,
        },
        {
          settings: sessionState.settings!,
          connected: sessionState.status.connected,
          models: sessionState.models,
          info: sessionState.info,
          clientId: engineBridge.clientId,
        },
        {
          notify: (tone, text) => useCanvasStore.getState().toast(tone, text),
          setJobs: (update) => useJobsStore.getState().setJobs(update),
          cancellationRequests: engineBridge.cancellationRequests,
        },
      )
    } finally {
      setBusy(false)
    }
  }, [sessionChain, settings, resolveRefs, sourceFile, sessionState])

  // Refine (always opt-in) ----------------------------------------------------
  const refine = useCallback(async (engine: 'klein' | 'krea2') => {
    if (!sessionChain || !selectedTake) return
    const frame = frames[effectivePick]
    const framePath = frame?.path ?? frame?.blob
    if (!framePath) {
      setNotice('The picked frame has no landed artifact to refine yet.')
      return
    }
    // An output-contained path uploads by path; a blob-only artifact (its
    // absolute copy may be gone) uploads as bytes through the image-data
    // route — either way the engine sees the exact frame.
    let uploadable: MediaFile
    if (frame?.path) {
      uploadable = { path: frame.path, name: `frame-${effectivePick}.png`, kind: 'image' }
    } else {
      const blobUrl = `/api/lan/documents/blobs/file?path=${encodeURIComponent(framePath)}`
      const blob = await (await fetch(blobUrl)).blob()
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.readAsDataURL(blob)
      })
      uploadable = { path: dataUrl, name: `frame-${effectivePick}.png`, kind: 'image', preview: dataUrl }
    }
    if (!refineInstruction.trim()) {
      setNotice('Name the defect to refine (e.g. "sharpen the hair, keep everything else").')
      return
    }
    if (!sessionState.settings) {
      setNotice('Studio settings are still loading.')
      return
    }
    setBusy(true)
    try {
      // VRAM staging (spec §4): the refine stage frees the generation
      // engine first — Generate → /free → Refine.
      const executor = createStageExecutor(() => window.minimax.freeComfyMemory(sessionState.settings?.comfyUrl ?? ''))
      await executor.run(
        [{ familyId: settings.family, label: 'generate' }, { familyId: engine === 'krea2' ? 'h3img.refine.krea2' : 'h3img.refine.klein', label: 'refine' }],
        async (stage) => {
          if (stage.familyId !== 'h3img.refine.krea2' && stage.familyId !== 'h3img.refine.klein') return null
          await submitWorkbenchGeneration(
            {
              chainId: sessionChain.id,
              settings: { ...settings, family: stage.familyId },
              refs: [],
              source: uploadable,
              refine: { engine, instruction: refineInstruction.trim(), frame: uploadable, parentTakeId: selectedTake.id },
            },
            {
              settings: sessionState.settings!,
              connected: sessionState.status.connected,
              models: sessionState.models,
              info: sessionState.info,
              clientId: engineBridge.clientId,
            },
            {
              notify: (tone, text) => useCanvasStore.getState().toast(tone, text),
              setJobs: (update) => useJobsStore.getState().setJobs(update),
              cancellationRequests: engineBridge.cancellationRequests,
            },
          )
          return null
        },
      )
    } finally {
      setBusy(false)
    }
  }, [sessionChain, selectedTake, frames, effectivePick, refineInstruction, settings, sessionState])

  // Burst-fuse (app-side, gated) ----------------------------------------------
  const runBurstFuse = useCallback(async () => {
    if (!experiments) {
      setNotice('The burst lane is gated behind the E-IW2 experiment (off by default; defaults only if the experiment proves them).')
      return
    }
    if (!sessionChain || !selectedTake) return
    const provenance = takeProvenance(selectedTake)
    if (!provenance || provenance.frames < 2) {
      setNotice('Burst-fuse needs a packet take with at least two frames (the T=1 path has no neighbors).')
      return
    }
    setBusy(true)
    try {
      const decode = async (url: string) => {
        const blob = await (await fetch(url)).blob()
        const bitmap = await createImageBitmap(blob)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('no 2d context')
        context.drawImage(bitmap, 0, 0)
        const data = context.getImageData(0, 0, bitmap.width, bitmap.height)
        return { image: { width: bitmap.width, height: bitmap.height, data: data.data }, canvas }
      }
      const targetIndex = effectivePick
      const decodedFrames = [] as Array<{ image: { width: number; height: number; data: ImageData['data'] }; canvas: HTMLCanvasElement }>
      for (const frame of frames) {
        const url = frameUrl(frame, new URLSearchParams(window.location.search).get('token'))
        if (!url) continue
        decodedFrames.push(await decode(url))
      }
      if (decodedFrames.length < 2) {
        setNotice('The packet frames could not be decoded for the fuse.')
        return
      }
      const fused = burstFuse(decodedFrames[targetIndex]?.image ?? decodedFrames[0].image, decodedFrames.map((entry) => entry.image).filter((_entry, index) => index !== targetIndex))
      if (fused.report.fallback) {
        setNotice(`Never-worse fallback fired (coverage ${(fused.report.coverage * 100).toFixed(0)}% under the gate) — the picked frame is unchanged, nothing was fused.`)
        return
      }
      // Encode + land as a new take (provenance-linked to the packet take).
      const out = document.createElement('canvas')
      out.width = fused.image.width
      out.height = fused.image.height
      out.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(fused.image.data as Uint8ClampedArray), fused.image.width, fused.image.height), 0, 0)
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('the fused frame could not be encoded')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ''
      const chunk = 0x8000
      for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
      const ingested = await documentsApi.ingestBlob({ dataBase64: btoa(binary), name: `burst-fused-${Date.now()}.png`, kind: 'image' })
      let outputId = sessionChain.outputs[0]?.id ?? null
      if (!outputId) outputId = (await documentsApi.createOutput({ chainId: sessionChain.id, substrates: ['decoded'] })).id
      await documentsApi.appendTake({
        outputId,
        artifacts: [ingested.path],
        metrics: {
          kind: 'image',
          sourcePath: ingested.path,
          h3img: {
            family: 'h3img.burst.fuse',
            profile: 'packet',
            tier: 1,
            frames: 1,
            prompt: provenance.prompt,
            refs: [],
            loras: [],
            seed: provenance.seed,
            resolution: provenance.resolution,
            hybrid: false,
            canonicalFrameIndex: 0,
            scorer: null,
            parentTakeId: selectedTake.id,
            op: 'burst-fuse',
            engine: 'app',
            fuseReport: fused.report,
          },
        },
      })
      await useCanvasStore.getState().reloadActiveDocument()
      useCanvasStore.getState().toast('success', `Burst-fused (coverage ${(fused.report.coverage * 100).toFixed(0)}%) — the fused frame landed as a new take.`)
    } catch (error) {
      setNotice(`Burst-fuse failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }, [experiments, sessionChain, selectedTake, frames, effectivePick])

  // Canvas handoffs (consent-gated) --------------------------------------------
  const pinFrameToCanvas = useCallback(async (): Promise<string | null> => {
    if (!doc || !selectedTake) return null
    const frame = frames[effectivePick]
    // The landed frame may be an output-contained path OR its registered
    // content-addressed blob (appendTake swaps in-scope artifacts to blob
    // rel paths) — both are real, servable artifacts.
    const framePath = frame?.path ?? frame?.blob ?? null
    if (!framePath) {
      setNotice('The picked frame has no landed artifact yet.')
      return null
    }
    try {
      const chain = await documentsApi.createChain({
        projectId: doc.project.id,
        kind: 'media',
        inputSpec: { fresh: { media: { name: `workbench-frame-${effectivePick}.png`, kind: 'image', path: framePath } } },
        settings: { name: `workbench frame (${family?.label ?? 'workbench'})`, mediaType: 'image' },
      })
      const output = await documentsApi.createOutput({ chainId: chain.id, substrates: ['decoded'] })
      await documentsApi.appendTake({ outputId: output.id, artifacts: [framePath], metrics: { kind: 'image', name: `workbench-frame-${effectivePick}.png`, sourcePath: framePath } })
      await useCanvasStore.getState().reloadActiveDocument()
      // Journey sweep #4b (audit F8/M5): the regeneration gate is named AT
      // PIN TIME, not generate time — the T=1 family's own detection drives
      // the text (models lead, so the Mamad8 VAE file is first).
      const t1Detection = detectionOf(H3_ONE_FRAME_FAMILY)
      useCanvasStore.getState().toast('success', pinRegenerationNotice(Boolean(t1Detection?.available), [...(t1Detection?.missingModels ?? []), ...(t1Detection?.missingNodes ?? [])]))
      return output.id
    } catch (error) {
      setNotice(`The frame could not be pinned: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }, [doc, selectedTake, frames, effectivePick, family, detectionOf])

  // The start-frame exit: consent-gated, created-never-submitted.
  const [exitPlan, setExitPlan] = useState<'anchor' | 'anchor-plus-refs' | null>(null)
  const runExit = useCallback(async () => {
    if (!doc || !exitPlan) return
    setBusy(true)
    try {
      const pinnedOutputId = await pinFrameToCanvas()
      if (!pinnedOutputId) return
      const defaults = chainSettingsDefaults(sessionState.settings)
      const nextSettings = {
        ...defaults,
        prompt: contract,
        duration: defaults.duration,
        // The frame rides FIRST_FRAME (the FL2VA frame-latent anchor — the
        // measured strongest concrete anchor). anchor-plus-refs rides the
        // reference slots too: hybrid both-at-once when available, else the
        // stock first-frame-or-refs limitation is named.
        firstFrameOutputId: pinnedOutputId,
        ...(exitPlan === 'anchor-plus-refs' ? { referenceOutputIds: settings.refs.flatMap((slot) => slot.source.kind === 'canvas' ? [slot.source.outputId] : []) } : {}),
      }
      try {
        await documentsApi.createChain({ projectId: doc.project.id, kind: 'generate', settings: nextSettings as unknown as Record<string, unknown> })
        await useCanvasStore.getState().reloadActiveDocument()
      } catch (error) {
        // (Audit A05) the exit's second step fails LOUDLY and names both
        // steps — the pin completed, the chain creation did not — never an
        // unhandled rejection with the dialog frozen on a cleared spinner.
        setNotice(`The frame was pinned to the canvas, but the video chain could not be created: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
      useCanvasStore.getState().toast('success', 'The video chain is seeded from this frame — created and selected, never submitted. Open the canvas to direct it.')
      setExitOpen(false)
      setExitPlan(null)
    } finally {
      setBusy(false)
    }
  }, [doc, exitPlan, pinFrameToCanvas, sessionState.settings, contract, settings.refs])

  const hybridAvailable = detectionOf('h3img.exit.anchor')?.hybrid ?? false
  // The image tiers' machinery key (the decode-leg-aware optimal markers):
  // both fizgig values share the Fizgig leg's documented preference.
  const imageTierMachinery: ImageMachinery = t1Machinery === 'image-studio' ? 'image-studio' : 'fizgig'

  // Render ---------------------------------------------------------------------
  if (phase !== 'ready' || !doc) {
    return <div className="iw-root iw-boot" data-iw-root><LoaderCircle className="spin" /><span>Opening the workbench…</span></div>
  }
  if (!sessionChain) {
    return <div className="iw-root iw-boot" data-iw-root><LoaderCircle className="spin" /><span>Creating the workbench session…</span></div>
  }

  const token = new URLSearchParams(window.location.search).get('token')
  const t1Take = selectedProvenance?.profile === 't1'
  const kleinDetection = detectionOf('h3img.refine.klein')
  const krea2Detection = detectionOf('h3img.refine.krea2')
  const suggestedEngine: 'klein' | 'krea2' = kleinDetection?.available ? 'klein' : 'krea2'
  const combinedLoraStrength = settings.loras.reduce((acc, lora) => acc + lora.strength, 0)

  return (
    <div className="iw-root" data-iw-root data-iw-family={settings.family}>
      <header className="iw-header">
        {/* Both review waves (union): the registry-driven surface switcher
            (d6iy68r M1 — Alt+1..9 live, one way to reach a surface) PLUS
            the settings deep-link (g5x37k8 M2 — this surface has its own
            session host but no docked settings panel; one click opens the
            dock on the canvas). */}
        <SurfaceSwitcher />
        <button type="button" className="iw-back" data-iw-settings-button onClick={() => useCanvasStore.getState().setSettingsDock(true)} title="Settings — docked right here (R-21: opening it never leaves this surface)"><Settings size={14} /> settings</button>
        <strong>H3 Image Workbench</strong>
        <span className={`iw-engine ${sessionState.status.connected ? 'ok' : 'warn'}`} data-iw-engine={sessionState.status.connected ? 'on' : 'off'}>
          {sessionState.status.connected ? 'engine online' : 'engine offline'}
        </span>
        <span className="iw-mode-note" data-iw-mode-note>{family?.label}</span>
      </header>

      <nav className="iw-mode-rail" aria-label="Workbench modes" data-iw-mode-rail>
        {MODE_GROUPS.map((group) => (
          <div key={group.mode} className={`iw-mode ${group.families.includes(settings.family) ? 'active' : ''}`} data-iw-mode={group.mode}>
            <button type="button" onClick={() => void patchSettings({ family: group.families[0] })}>{group.label}</button>
          </div>
        ))}
      </nav>
      {/* (W5, perfect-state sweep 2026-09-27) ONE stable sub-lane row: the
          active group's families always render HERE — never a per-group
          dropdown that churns the rail's shape between three layouts in one
          session. Lane labels use the nav's own short vocabulary (the video
          settle lane says "video" so the still "Edit" lanes never collide
          with it); the buttons' tooltips keep the full family descriptions. */}
      {(() => {
        const group = MODE_GROUPS.find((entry) => entry.families.includes(settings.family))
        if (!group || group.families.length < 2) return null
        return (
          <nav className="iw-mode-subrail" aria-label={`${group.label} lanes`} data-iw-mode-subrail>
            {group.families.map((familyId) => {
              const entry = findH3ImgFamily(familyId)
              const detection = detectionOf(familyId)
              const gated = familyId === 'h3img.burst.seedvr2' || familyId === 'h3img.burst.fuse'
              return (
                <button
                  key={familyId}
                  type="button"
                  className={`iw-family ${settings.family === familyId ? 'active' : ''} ${detection?.available ? '' : 'unavailable'}`}
                  data-iw-family-button={familyId}
                  title={detection?.available ? entry?.ui.description : [detection?.missingModels.join('; '), detection?.missingNodes.join('; '), entry?.ui.installHint].filter(Boolean).join(' — ')}
                  onClick={() => void patchSettings({ family: familyId })}
                >
                  {MODE_LANE_LABELS[familyId] ?? entry?.label ?? familyId}
                  {gated && <em className="iw-gated">E-IW2</em>}
                  {!detection?.available && <em className="iw-unavailable" data-iw-unavailable-badge>{t1BadgeText(familyId, detection) || 'unavailable'}</em>}
                </button>
              )
            })}
          </nav>
        )
      })()}

      <main className="iw-main">
        <section className="iw-preview" data-iw-preview>
          {selectedTake ? (
            <>
              <figure className="iw-canvas">
                {(() => {
                  const url = frameUrl(frames[effectivePick] ?? null, token)
                  return url ? <img src={url} alt={`Picked frame ${effectivePick + 1}`} data-iw-preview-image /> : <span className="iw-empty-frame">The picked frame is not resident (evicted or not yet landed).</span>
                })()}
                <figcaption data-iw-preview-caption>
                  {/* (W7) Lane-aware caption vocabulary: single-frame lanes
                      never read as packets, refine/fuse takes say so. */}
                  {selectedProvenance
                    ? `${selectedProvenance.family} · ${selectedProvenance.profile === 't1' ? 'T=1 fast' : selectedProvenance.frames === 1 ? 'single frame' : `${selectedProvenance.tier}-frame packet`}${selectedProvenance.op === 'refine' ? ' · refine' : selectedProvenance.op === 'burst-fuse' ? ' · burst-fused' : ''} · frame ${effectivePick + 1}/${selectedProvenance.frames}${selectedProvenance.hybrid ? ' · hybrid' : ''}`
                    : 'take'}
                  {selectedProvenance?.scorer && <em className="iw-scorer" data-iw-scorer title={selectedProvenance.scorer.reason}>scorer pick: {selectedProvenance.scorer.bestIndex + 1} — {selectedProvenance.scorer.reason}</em>}
                  {selectedProvenance?.scorer === null && selectedProvenance.frames > 1 && <em className="iw-scorer none" data-iw-scorer-none title="The scorer could not run at landing">unscored — pick by eye</em>}
                </figcaption>
              </figure>
              {/* Refine is ALWAYS opt-in (decision-6 amendment) — a prominent
                  one-tap affordance on T=1 outputs, present on every take. */}
              <div className="iw-affordances" data-iw-affordances>
                <div className="iw-refine" data-iw-refine>
                  <label className="iw-refine-input">
                    <Wand2 size={13} />
                    <input
                      value={refineInstruction}
                      onChange={(event) => setRefineInstruction(event.target.value)}
                      placeholder={t1Take ? 'Fast draft landed — name a defect to refine (opt-in, never automatic)' : 'Name a defect to refine (opt-in)'}
                      data-iw-refine-instruction
                    />
                  </label>
                  <div className="iw-refine-engines">
                    <button type="button" className="iw-refine-tap" data-iw-refine-tap="klein" disabled={busy || !kleinDetection?.available} title={kleinDetection?.available ? 'klein — the fast tier (4-step distilled, ~seconds at 1MP)' : (kleinDetection?.missingModels.join('; ') || 'unavailable')} onClick={() => void refine('klein')}>
                      <Sparkles size={12} /> Refine — klein (fast){suggestedEngine === 'klein' ? ' · suggested' : ''}
                    </button>
                    <button type="button" className="iw-refine-tap quality" data-iw-refine-tap="krea2" disabled={busy || !krea2Detection?.available} title={krea2Detection?.available ? 'Krea 2 Identity Edit — the quality engine (measured 6× preservation)' : (krea2Detection?.missingModels.join('; ') || 'unavailable')} onClick={() => void refine('krea2')}>
                      <Sparkles size={12} /> Refine — Krea 2 (quality)
                    </button>
                    {t1Take && <em className="iw-t1-note" data-iw-t1-note>T=1 output — structurally soft by profile; refining is your call.</em>}
                    {(!kleinDetection?.available || !krea2Detection?.available) && <em className="iw-engine-note">{!kleinDetection?.available && 'klein unavailable. '}{!krea2Detection?.available && 'Krea 2 unavailable.'} The affordance says so — never a silent skip.</em>}
                  </div>
                </div>
                <div className="iw-burst-row" data-iw-burst>
                  <button type="button" className={`iw-burst ${experiments ? '' : 'gated'}`} data-iw-burst-fuse disabled={busy || !experiments} title={experiments ? 'Robust frequency merge of the packet neighbors — never-worse-than-target fallback' : 'Gated behind the E-IW2 experiment (defaults only if it proves them)'} onClick={() => void runBurstFuse()}>
                    <Layers size={12} /> Burst-fuse from packet {experiments ? '' : '(E-IW2 gated)'}
                  </button>
                  <button type="button" className="iw-tone-lock" data-iw-tone-lock title="Add the tone-lock op to the session's op stack — the source keeps tone, the refine output contributes detail" onClick={() => void addToneLockOp(sessionChain)}>
                    <Lock size={12} /> tone-lock op
                  </button>
                  {!experiments && (
                    <button type="button" className="iw-experiments-toggle" data-iw-experiments-toggle title="Enable the E-IW2 experiment lane (off by default; defaults only if the experiment proves them)" onClick={() => {
                      try { window.localStorage.setItem(IW_EXPERIMENTS_KEY, 'on') } catch { /* the lane stays off without storage */ }
                      setExperiments(true)
                    }}>enable experiments</button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="iw-preview-empty" data-iw-preview-empty>
              <ImagePlus size={28} />
              <span>No generation yet — describe what you want and generate. The packet lands here as ONE take; its frames line up on the take strip below.</span>
            </div>
          )}
        </section>

        <aside className="iw-controls">
          <label className="iw-intent">
            <span>Intent</span>
            <textarea
              value={settings.intent}
              onChange={(event) => void patchSettings({ intent: event.target.value })}
              placeholder={family?.ui.promptGuidance ?? 'Describe the whole resulting image…'}
              data-iw-intent
            />
          </label>

          <details className="iw-contract" data-iw-contract open={false}>
            <summary>Ownership contract (generated — never hand-written)</summary>
            <pre data-iw-contract-text>{contract}</pre>
          </details>

          {family?.ui.warning && <p className="iw-warning" data-iw-family-warning>{family.ui.warning}</p>}
          {!detectionOf(settings.family)?.available && (
            <div className="iw-unavailable-note" data-iw-unavailable>
              {/* (W10, perfect-state sweep 2026-09-27) The missing pieces are
                  named ONCE: models AND nodes both list (the old `||` dropped
                  the node rows whenever a model was missing), and the install
                  hint rides only when the rows list nothing — it repeats the
                  same filenames the rows already name. */}
              <p data-iw-unavailable-rows>
                {[...(detectionOf(settings.family)?.missingModels ?? []), ...(detectionOf(settings.family)?.missingNodes ?? [])].join('; ') || 'unavailable'}
              </p>
              {/* (W6) A ready ALTERNATIVE machinery is the lane's own remedy —
                  named here, one scroll from the switch that unlocks it. */}
              {family?.profile === 't1' && t1ReadyMachineries.length > 0 && (
                <p data-iw-unavailable-alternative>
                  A working machinery {t1ReadyMachineries.length === 1 ? 'is' : 'may be'} installed — {t1ReadyMachineries.length === 1
                    ? `${T1_MACHINERY_SHORT[t1ReadyMachineries[0]!]} renders this lane`
                    : `${t1ReadyMachineries.slice(0, -1).map((machinery) => T1_MACHINERY_SHORT[machinery]).join(' and ')} and ${T1_MACHINERY_SHORT[t1ReadyMachineries[t1ReadyMachineries.length - 1]!]} render this lane`}. Pick it under “T=1 machinery” below.
                </p>
              )}
              {!(detectionOf(settings.family)?.missingModels ?? []).length && !(detectionOf(settings.family)?.missingNodes ?? []).length && family?.ui.installHint && <p>{family.ui.installHint}</p>}
              {/* (R-19) The unavailable family is never a dead end at the
                  choice point: the Library is one click away (weights and
                  node packs, license verdicts on every row). */}
              <button type="button" className="chip canvas-chip" data-iw-open-library
                title="Open the library — the missing weights and packs are fetchable there with consent"
                onClick={() => useCanvasStore.getState().setLibraryDock(true)}>
                Get the missing pieces…
              </button>
            </div>
          )}

          {(family?.kind === 'edit' || family?.kind === 'generate-directed') && (
            <div className="iw-source" data-iw-source data-iw-source-inpaint={family.id === 'h3img.edit.inpaint' ? 'true' : undefined}>
              <span>{family.id === 'h3img.edit.inpaint' ? 'Masked source (Picture 1 — painted region regenerates)' : 'Anchored source (Picture 1)'}</span>
              {sourceFile ? (
                <figure>
                  {sourceFile.preview ? <img src={sourceFile.preview} alt="source" /> : <span>{sourceFile.name}</span>}
                  <figcaption data-iw-source-name>
                    {sourceFile.name}
                    {family.id === 'h3img.edit.inpaint' && !sourceFile.masked && <em className="iw-mask-needed" data-iw-mask-needed> mask needed</em>}
                    {' '}
                    <button type="button" onClick={() => setSourceFile(null)}>remove</button>
                  </figcaption>
                  {family.id === 'h3img.edit.inpaint' && (
                    <div className="iw-mask-actions">
                      <button type="button" data-iw-paint-mask onClick={() => setMaskPainterOpen(true)}>
                        {sourceFile.masked ? 'repaint the region' : 'paint the region'}
                      </button>
                      {sourceFile.masked && sourceFile.width && sourceFile.height && (
                        <em data-iw-mask-dims>canvas pinned: {snapResolutionDim(sourceFile.width)}x{snapResolutionDim(sourceFile.height)}</em>
                      )}
                    </div>
                  )}
                </figure>
              ) : (
                <div className="iw-source-actions">
                  {/* (W8) The source gets the same in-app affordance the
                      references always had — the OS dialog is one of two
                      paths now, not the only one. */}
                  <button type="button" onClick={() => sourceInput.current?.click()} data-iw-source-pick>Choose a file…</button>
                  <button type="button" onClick={() => { setCanvasPickerMode('source'); setCanvasPickerOpen(true) }} data-iw-source-pick-canvas title="Pick a canvas take as the source — the pinned frame from minutes ago is one click away">from canvas…</button>
                </div>
              )}
            </div>
          )}

          {maskPainterOpen && sourceFile && (
            <MaskPainterDialog
              file={sourceFile}
              onCancel={() => setMaskPainterOpen(false)}
              onUse={async (masked) => {
                setSourceFile(masked)
                setMaskPainterOpen(false)
                // The canvas pins to the masked source's 32-snapped dims
                // (the author's edit-workflow pattern): the graph-side
                // prefill/restore composites align without resampling.
                await patchSettings({ resolution: `${snapResolutionDim(masked.width ?? 0)}x${snapResolutionDim(masked.height ?? 0)}` })
              }}
            />
          )}

          <div className="iw-refs" data-iw-refs>
            <header>
              <strong>References</strong>
              <span className="iw-ref-count" data-iw-ref-count>{settings.refs.length}/9</span>
            </header>
            <p className="iw-refs-note">{BEYOND_NINE_GUIDANCE}</p>
            <div className="iw-ref-strip" data-iw-ref-strip>
              {settings.refs.map((slot, index) => (
                <div className="iw-ref-slot" key={slot.id} data-iw-ref-slot={index}>
                  <div className="iw-ref-thumb">
                    {slot.source.kind === 'canvas' ? <span className="iw-canvas-tag" title="canvas reference"><Layers size={14} /></span> : slot.source.kind === 'refmod' ? <span className="iw-refmod-tag">RefMod</span> : slot.source.kind === 'poserig' ? <span className="iw-poserig-tag">rig</span> : null}
                  </div>
                  <StudioSelect value={slot.role} data-iw-ref-role={index} onChange={(event) => {
                    // The choice is captured EAGERLY: a functional patch runs
                    // at flush time, after React has restored the controlled
                    // select to its (pre-write) prop value — dereferencing
                    // event.target there would read the stale DOM value back.
                    // The op targets the slot by ID, never by strip index: a
                    // render-time index can point at the WRONG slot once
                    // earlier queued ops reshaped the fresh array (fix round
                    // 2: remove b then c used to delete the untouched d).
                    const value = event.target.value as H3ImgRefRole
                    void patchSettings((current) => ({ refs: current.refs.map((entry) => entry.id === slot.id ? { ...entry, role: value } : entry) }))
                  }} aria-label={`Reference ${index + 1} role`}>
                    {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                  </StudioSelect>
                  <StudioSelect value={slot.transport ?? 'auto'} data-iw-ref-transport={index} onChange={(event) => {
                    const value = event.target.value
                    void patchSettings((current) => ({ refs: current.refs.map((entry) => entry.id === slot.id ? { ...entry, transport: value === 'auto' ? null : value as 'native' | 'semantic', transportOverride: value !== 'auto' } : entry) }))
                  }} aria-label={`Reference ${index + 1} transport`}>
                    <option value="auto">auto ({TRANSPORT_FOR_ROLE[slot.role]})</option>
                    <option value="native">native</option>
                    <option value="semantic">semantic</option>
                  </StudioSelect>
                  <input
                    className="iw-ref-keep"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={slot.keepOverride ?? ''}
                    placeholder="keep"
                    data-iw-ref-keep={index}
                    title="Per-picture Keep override (empty = the global dial)"
                    onChange={(event) => {
                      const value = event.target.value
                      void patchSettings((current) => ({ refs: current.refs.map((entry) => entry.id === slot.id ? { ...entry, keepOverride: value === '' ? null : Number(value) } : entry) }))
                    }}
                  />
                  <button type="button" className="iw-ref-remove" aria-label={`Remove reference ${index + 1}`} onClick={() => void patchSettings((current) => ({ refs: current.refs.filter((entry) => entry.id !== slot.id) }))}>×</button>
                </div>
              ))}
              {settings.refs.length < 9 && (
                <div className="iw-ref-add">
                  <button type="button" onClick={() => fileInput.current?.click()} data-iw-ref-add-file>add image</button>
                  <button type="button" onClick={() => { setCanvasPickerMode('ref'); setCanvasPickerOpen(true) }} data-iw-ref-add-canvas>from canvas</button>
                  <a href="?poserig=1&send=iw" data-iw-ref-add-poserig title="Open the pose rig; its export sends the render back here as a pose reference">from pose rig</a>
                </div>
              )}
            </div>
          </div>

          <label className="iw-keep" data-iw-keep>
            <span>Keep unspecified traits <em data-iw-keep-value>{settings.keepDial.toFixed(2)}</em></span>
            <input type="range" min={0} max={1} step={0.01} value={settings.keepDial} data-iw-keep-dial onChange={(event) => void patchSettings({ keepDial: Number(event.target.value) })} />
            <small data-iw-keep-hint>{keepDialHint(settings.keepDial)}</small>
          </label>

          <div className="iw-loras" data-iw-loras>
            <header><strong>LoRA slots</strong><span className="iw-lora-note" data-iw-lora-guidance title={`Combined ${combinedLoraStrength.toFixed(2)} — healthy ≤ ~${H3IMG_RECIPE_PINS.lora.healthyCombinedMax}; collapse risk ≥ ~${H3IMG_RECIPE_PINS.lora.collapseRisk}`}>combined {combinedLoraStrength.toFixed(2)} {combinedLoraStrength >= H3IMG_RECIPE_PINS.lora.collapseRisk ? '· collapse risk' : combinedLoraStrength > H3IMG_RECIPE_PINS.lora.healthyCombinedMax ? '· above the healthy band' : '· healthy'}</span></header>
            <small data-iw-lora-crossform>Slot 1 rides the form adapter first (cross-form safety) when its node pack is installed.</small>
            {settings.loras.map((lora, index) => (
              <div className="iw-lora-slot" key={index} data-iw-lora-slot={index}>
                <StudioSelect value={lora.name} data-iw-lora-name={index} onChange={(event) => {
                  const value = event.target.value
                  void patchSettings((current) => ({ loras: current.loras.map((entry, i) => i === index ? { ...entry, name: value } : entry) }))
                }} aria-label={`LoRA ${index + 1}`}>
                  <option value="">— none —</option>
                  {sessionState.models.filter((model) => model.kind === 'loras').map((model) => <option key={model.name} value={model.name}>{model.name}</option>)}
                </StudioSelect>
                <input type="number" min={0} max={2} step={0.05} value={lora.strength} data-iw-lora-strength={index} onChange={(event) => {
                  const value = event.target.value
                  void patchSettings((current) => ({ loras: current.loras.map((entry, i) => i === index ? { ...entry, strength: Number(value) } : entry) }))
                }} aria-label={`LoRA ${index + 1} strength`} />
              </div>
            ))}
            {settings.loras.length < 2 && <button type="button" data-iw-lora-add onClick={() => void patchSettings((current) => ({ loras: [...current.loras, { name: '', strength: 1 }] }))}>+ LoRA slot</button>}
          </div>

          <div className="iw-row">
            {(family?.profile === 'packet' || family?.profile === 'sharp') && family.kind !== 'generate-directed' && (
              <label className="iw-tier" data-iw-tier>
                <span>{family?.profile === 'sharp' ? 'Context tier' : 'Packet tier'}</span>
                <StudioSelect value={settings.tier} title={family?.profile === 'sharp'
                  ? 'The fast-sharp profile samples this many frames for temporal context, then decodes ONE latent slice through the T=1 image VAE.'
                  : (STOCK_SAMPLED_FRAMES[settings.tier] !== undefined && STOCK_SAMPLED_FRAMES[settings.tier] !== settings.tier
                    ? (studioPackOnEngine
                      ? `The H3 Image Studio pack's latent ladder samples this tier exactly.`
                      : `Stock nodes snap this tier to a ${STOCK_SAMPLED_FRAMES[settings.tier]}-frame sample (the engine’s 5/22/39… frame grid) — only 5 and 39 are native grid points. Exact 9/13 needs the H3 Image Studio pack's latent ladder.`)
                    : undefined)} onChange={(event) => void patchSettings({ tier: Number(event.target.value) as 5 | 9 | 13 | 39 })}>
                  {[5, 9, 13].map((tier) => <option key={tier} value={tier}>{packetTierLabel(tier, studioPackOnEngine)}</option>)}
                </StudioSelect>
              </label>
            )}
            <label className="iw-resolution" data-iw-resolution>
              <span>Resolution</span>
              {family?.id === 'h3img.edit.inpaint' && sourceFile?.masked ? (
                <StudioSelect value={settings.resolution} disabled data-iw-resolution-locked title="The inpaint canvas follows the masked source's own 32-grid dimensions — the prefill/restore composites align without resampling. Re-add or repaint the source to change it.">
                  <option value={settings.resolution}>{settings.resolution} · pinned to the masked source</option>
                </StudioSelect>
              ) : freeRatio || ratioKeyOf(settings.resolution) === 'free' ? (
                <span className="iw-free-resolution" data-iw-free-resolution>
                  <FreeResolutionFields key={settings.resolution} value={settings.resolution} onCommit={(resolution) => void patchSettings({ resolution })} />
                </span>
              ) : (
                <TieredResolutionPicker
                  resolution={settings.resolution}
                  machinery={imageTierMachinery}
                  onRatio={(ratio) => {
                    if (ratio === 'free') {
                      setFreeRatio(true)
                      return
                    }
                    const groups = tieredResolutionGroups(ratio as (typeof ASPECT_RATIOS)[number]['id'], { machinery: imageTierMachinery })
                    const imageFocus = groups.find((group) => group.tier.id === 'image-focus')
                    const land = imageFocus?.options.find((option) => option.optimal) ?? groups[0]?.options[0]
                    if (land) void patchSettings({ resolution: land.value })
                  }}
                  onPick={(resolution) => void patchSettings({ resolution })}
                />
              )}
            </label>
            <label className="iw-seed" data-iw-seed>
              <span>Seed</span>
              {/* (seed a11y, perfect-state sweep 2026-09-27) The spinbutton
                  exposes its real range — 0 to the dice roll's 999,999,999. */}
              <input type="number" min={0} max={999_999_999} value={settings.seed} onChange={(event) => void patchSettings({ seed: Number(event.target.value) })} />
            </label>
          </div>

          {family?.profile === 't1' && (
            <div className="iw-machinery" data-iw-machinery>
              <label className="iw-machinery-select" title="Which machinery renders this single frame — the E-FS1 experiment axis, now a real choice (the default stays Image Studio until the bake-off reports)">
                <span>T=1 machinery <em>experimental</em></span>
                <StudioSelect value={t1Machinery} data-iw-machinery-value onChange={(event) => void setT1Machinery(event.target.value as H3ImgT1Settings)}>
                  {T1_MACHINERY_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                </StudioSelect>
              </label>
              <p className="iw-machinery-note" data-iw-machinery-note>
                {t1Machinery === 'image-studio'
                  ? 'The landed 1F lane (Image Studio conditioning + the Mamad8 image-VAE decode). Its documented sweet spot is the native ~1 MP envelope.'
                  : `${FIZGIG_H3_STILL_PACK_NAME} ${t1Machinery === 'fizgig-max' ? 'max-quality point (no Turbo, 50 steps)' : 'author recipe (plain FL2VA, turbo @0.38, 20 steps)'} — the video-VAE group decode; best from 2.5 MP up.`}
                {!fizgigPackOnEngine && t1Machinery !== 'image-studio' && (
                  <>
                    {' '}The pack is not served by this engine — <button type="button" className="chip canvas-chip" data-iw-machinery-fetch onClick={() => useCanvasStore.getState().setLibraryDock(true)}>fetch it from the Library…</button> (the lane refuses honestly until then, never a silent stock decode).
                  </>
                )}
              </p>
            </div>
          )}

          <label className="iw-overflow" data-iw-overflow title="Semantic-only overflow beyond 9 — expert-experimental, off by default (demoted per decision 4)">
            <input type="checkbox" checked={settings.semanticOverflow} onChange={(event) => void patchSettings({ semanticOverflow: event.target.checked })} />
            <span>semantic overflow <em>experimental</em></span>
          </label>

          <Button
            variant="primary"
            size={13}
            className="iw-generate"
            data-iw-generate
            busy={busy}
            disabled={!detectionOf(settings.family)?.available}
            title={detectionOf(settings.family)?.available ? 'Generate' : (detectionOf(settings.family)?.missingModels.join('; ') || detectionOf(settings.family)?.missingNodes.join('; ') || 'unavailable')}
            icon={<Sparkles size={13} />}
            onClick={() => void generate()}
          >
            Generate {family?.profile === 't1' ? '(T=1 fast — structurally soft)' : family?.profile === 'sharp' ? `(fast-sharp — ${settings.tier}-frame context, one slice)` : `(${family?.kind === 'generate-directed' ? '39-frame packet' : packetTierLabel(settings.tier, studioPackOnEngine)})`}
          </Button>
          {/* (Task 20, k2q0n9s) The session writes' save state beside the
              action — the shared SaveStatus tier: idle silent, the busy
              idiom while the serialized queue flushes, the muted
              confirmation when it lands, and failures INLINE with the
              server reason verbatim + retry (the retired vanishing notice
              line is gone). */}
          <SaveStatus
            state={saveState}
            label="session"
            detail={saveDetail ?? undefined}
            onRetry={saveState === 'failed' ? retrySessionSave : undefined}
          />
          <p className="iw-staging-note" data-iw-staging>Staging: Generate → free → Refine/Burst → free → Exit (24 GB discipline — stages never run concurrently).</p>

          <div className="iw-handoffs" data-iw-handoffs>
            <button type="button" className="iw-pin" data-iw-pin disabled={!selectedTake} onClick={() => void pinFrameToCanvas()} title="Pin the picked frame to the canvas as a media object (consent-gated: this explicit action)">
              <Send size={12} /> Pin frame to canvas
            </button>
            <button type="button" className="iw-exit" data-iw-exit disabled={!selectedTake} onClick={() => setExitOpen(true)} title="Seed a video chain anchored on this frame (created, never submitted)">
              <Send size={12} /> Start-frame exit →
            </button>
          </div>
        </aside>
      </main>

      <footer className="iw-take-strip" data-iw-take-strip aria-label="Takes — the pick surface">
        {takes.length === 0 && <span className="iw-takes-empty">No takes yet.</span>}
        {takes.map((take) => {
          const provenance = takeProvenance(take)
          const takeFramesList = takeFrames(take)
          const pick = canonicalFrameIndex(take, settings.framePicks)
          const isRefineTake = provenance?.op === 'refine'
          const isFuseTake = provenance?.op === 'burst-fuse'
          return (
            <div key={take.id} className={`iw-take ${take.id === selectedTake?.id ? 'selected' : ''} ${take.supersededBy === null ? 'canonical' : 'prior'}`} data-iw-take={take.id} data-iw-take-kind={isRefineTake ? 'refine' : isFuseTake ? 'burst-fuse' : provenance?.profile === 't1' ? 't1' : 'packet'}>
              <header>
                <button type="button" className="iw-take-select" onClick={() => setSelectedTakeId(take.id)} title="Show this take in the preview">
                  {isRefineTake ? 'refine' : isFuseTake ? 'burst-fused' : provenance?.profile === 't1' ? 'T=1' : `${provenance?.tier ?? '?'}-frame`}
                </button>
                {provenance?.parentTakeId && <em className="iw-lineage" title={`Provenance-linked to take ${provenance.parentTakeId}`}>↳ linked</em>}
                {take.supersededBy === null ? <em className="iw-canonical-marker">canonical</em> : <em className="iw-prior-marker">prior</em>}
              </header>
              <div className="iw-frames" data-iw-frames>
                {takeFramesList.map((frame) => {
                  const url = frameUrl(frame, token)
                  return (
                    <button
                      type="button"
                      key={`${take.id}-${frame.index}`}
                      className={`iw-frame ${frame.index === pick ? 'picked' : ''} ${provenance?.scorer && provenance.scorer.bestIndex === frame.index ? 'scorer' : ''}`}
                      data-iw-frame={frame.index}
                      title={provenance?.scorer && provenance.scorer.bestIndex === frame.index ? `Scorer pick — ${provenance.scorer.reason}` : `Frame ${frame.index + 1} — click to pick`}
                      onClick={() => void patchSettings((current) => ({ framePicks: { ...current.framePicks, [take.id]: frame.index } })).then(() => setSelectedTakeId(take.id))}
                    >
                      {url ? <img src={url} alt={`Frame ${frame.index + 1}`} /> : <span className="iw-frame-evicted">evicted</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </footer>

      {canvasPickerOpen && (
        <CanvasRefPicker
          doc={doc}
          title={canvasPickerMode === 'source' ? 'Use a canvas image as the source' : 'Use a canvas image as a reference'}
          body={canvasPickerMode === 'source'
            ? 'The pick is the consent: the take becomes this lane\'s anchored source (its bytes never move).'
            : 'The pick is the consent: the take becomes a reference slot (its bytes never move).'}
          onClose={() => setCanvasPickerOpen(false)}
          onPick={async (outputId, takeId, preview) => {
            if (canvasPickerMode === 'source') {
              await pickCanvasSource(outputId, takeId, preview)
              setCanvasPickerOpen(false)
              return
            }
            // The full-strip fast path keeps the picker open (the flush
            // re-checks the budget against fresh state — the structural
            // guard lives there, not here).
            if (readSessionSettings(sessionChain.settings).refs.length >= 9) {
              setNotice(BEYOND_NINE_GUIDANCE)
              return
            }
            await patchSettings((current) => {
              if (current.refs.length >= 9) {
                setNotice(BEYOND_NINE_GUIDANCE)
                return null
              }
              return { refs: [...current.refs, { id: nextRefSlotId(), role: 'subject', transport: null, keepOverride: null, note: 'canvas take', source: { kind: 'canvas', outputId, takeId } }] }
            })
            setCanvasPickerOpen(false)
          }}
        />
      )}

      {exitOpen && (
        /* Component vocabulary task 12 (k2q0n9s): the hand-rolled local
           dialog wrapper is deleted — the workbench's three dialogs are
           StudioDialogLayered (Base UI portal
           + the §0.2 layer registry: Escape routes to the TOPMOST registered
           layer, one dismissal path — the hand-rolled Tab wrap, node-level
           Escape listener, and focus-restore ref the W1 sweep backported all
           retire into the shared wrapper). The × owns its handler (the retired
           markup had no close button; pointer dismissal leaned on the
           backdrop's target-identity check); the geometry classes sit on the
           portal's backdrop/center/popup slots per CV13 (see workbench.css). */
        <StudioDialogLayered
          layerId="iw-exit"
          open
          onClose={() => { setExitOpen(false); setExitPlan(null) }}
          backdropClassName="iw-dialog-backdrop"
          centerClassName="iw-dialog-center"
          popupClassName="iw-dialog"
          labelledBy="iw-exit-title"
        >
          <div className="iw-dialog-head">
            <h3 id="iw-exit-title">Start-frame exit</h3>
            <Button variant="icon" className="iw-dialog-close" aria-label="Close the start-frame exit" onClick={() => { setExitOpen(false); setExitPlan(null) }}><X size={14} /></Button>
          </div>
          <p>Seed a video chain from the picked frame — <strong>created and selected, never submitted</strong>. The frame rides the FL2VA first-frame anchor (the measured strongest concrete anchor).</p>
          <div className="iw-exit-choices">
            <button type="button" data-iw-exit-choice="anchor" onClick={() => setExitPlan('anchor')} disabled={busy}>Anchor only (first frame)</button>
            <button type="button" data-iw-exit-choice="anchor-plus-refs" onClick={() => setExitPlan('anchor-plus-refs')} disabled={busy}>Anchor + canvas references</button>
          </div>
          <p className={`iw-exit-note ${hybridAvailable ? '' : 'warn'}`} data-iw-exit-hybrid>
            {hybridAvailable
              ? 'The hybrid profile is available: first frame AND references ride one model (both-at-once).'
              : 'Stock checkpoints silently drop one of (first frame | references) — the exit anchors the FRAME and names the limitation; install the hybrid loader (Settings → Fetchable items) for both-at-once.'}
          </p>
          <footer>
            <button type="button" className="secondary" onClick={() => { setExitOpen(false); setExitPlan(null) }}>Cancel</button>
            <button type="button" className="primary" data-iw-exit-confirm disabled={!exitPlan || busy} onClick={() => void runExit()}><Send size={12} /> Seed the chain</button>
          </footer>
        </StudioDialogLayered>
      )}

      {notice && (
        // Component vocabulary task 9 (k2q0n9s): the notice is NoticeBanner —
        // the × OWNS the dismiss handler; the retired hand-rolled banner's
        // banner-click dismissal died with it. The surface class carries the
        // banner's local EDGE geometry (top border, split to longhands per
        // the C1 discipline); tone and announcements ride the recipes.
        <NoticeBanner tone="accent" role="status" className="iw-note" data-iw-note onDismiss={() => setNotice(null)}>
          <span>{notice}</span>
        </NoticeBanner>
      )}
      {/* Same task: the inline toast-strip copy is DELETED — this surface
          mounts the shared adapter (the canvas store's toasts, timeouts,
          and dismissal) placed bottom-right by the placement prop. */}
      <CanvasToastAdapter placement="bottom-right" />

      <input ref={fileInput} type="file" accept="image/*" className="iw-file-input" onChange={(event) => { const file = event.target.files?.[0]; if (file) addFileRef(file); event.target.value = '' }} />
      <input ref={sourceInput} type="file" accept="image/*" className="iw-file-input" onChange={(event) => { const file = event.target.files?.[0]; if (file) void pickSource(file); event.target.value = '' }} />
    </div>
  )
}

/** Adds the tone-lock op to the session chain's stack (the app-side op). */
async function addToneLockOp(chain: DocumentChain): Promise<void> {
  try {
    await documentsApi.addOp(chain.id, H3IMG_OP_TONE_LOCK)
    useCanvasStore.getState().toast('success', 'tone-lock op added to the session stack — it applies at export/handoff.')
  } catch (error) {
    useCanvasStore.getState().toast('error', `The tone-lock op could not be added: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** The canvas → workbench picker (consent = the explicit pick). One picker,
 *  two consumers (W8): reference slots AND the anchored source. Labels use
 *  the canvas's own naming convention — kind + ordinal (W9/W11) — with the
 *  filename and prompt riding as the tooltip (the hash only on demand);
 *  the old raw-filename captions were 64-char hashes that collided across
 *  cards. */
function CanvasRefPicker({ doc, onClose, onPick, title, body }: {
  doc: { chains: DocumentChain[] }
  onClose: () => void
  onPick: (outputId: string, takeId: string | null, previewUrl: string | null) => void
  title: string
  body: string
}) {
  const entries = useMemo(() => {
    const index = buildOutputIndex(doc)
    return Array.from(index.entries()).flatMap(([outputId, entry]) => {
      const resolved = mediaForOutput(entry)
      if (!resolved || resolved.media.kind !== 'image') return []
      const blob = entry.take?.artifacts.find((artifact) => artifact.startsWith('canvas-blobs/')) ?? null
      const preview = blob ? `/api/lan/documents/blobs/file?path=${encodeURIComponent(blob)}` : resolved.media.preview ?? null
      return [{ outputId, takeId: entry.take?.id ?? null, label: chainTitle(doc, entry.chain), fileName: resolved.media.name, preview, chainPrompt: chainPromptOf(entry.chain) }]
    })
  }, [doc])
  return (
    /* Task 12 (k2q0n9s): the picker is the registry's nested case — a layer
       above it owns Escape until it closes (unwinds topmost-first). */
    <StudioDialogLayered
      layerId="iw-canvas-picker"
      open
      onClose={onClose}
      backdropClassName="iw-dialog-backdrop"
      centerClassName="iw-dialog-center"
      popupClassName="iw-dialog"
      labelledBy="iw-canvas-picker-title"
    >
      <div className="iw-dialog-head">
        <h3 id="iw-canvas-picker-title">{title}</h3>
        <Button variant="icon" className="iw-dialog-close" aria-label="Close the canvas picker" onClick={onClose}><X size={14} /></Button>
      </div>
      <p>{body}</p>
      <div className="iw-canvas-refs">
        {entries.length === 0 && <span className="iw-takes-empty">No image takes on this canvas yet.</span>}
        {entries.map((entry) => (
          <button key={entry.outputId} type="button" className="iw-canvas-ref" data-iw-canvas-ref={entry.outputId} title={`${entry.fileName} — ${entry.chainPrompt}`} onClick={() => onPick(entry.outputId, entry.takeId, entry.preview)}>
            {entry.preview ? <img src={entry.preview} alt={entry.label} /> : <span className="iw-frame-evicted">no preview</span>}
            <span>{entry.label}</span>
          </button>
        ))}
      </div>
      <footer>
        <button type="button" className="secondary" onClick={onClose}>Cancel</button>
      </footer>
    </StudioDialogLayered>
  )
}

/** The tier-grouped resolution picker (the 1F full image stack): the ratio
 *  select + the categorized resolution select — starter-frame / image-focus
 *  / video-locked groups, the optimal marker machinery-aware, custom free
 *  W/H beside them. */
function TieredResolutionPicker({ resolution, machinery, onRatio, onPick }: {
  resolution: string
  machinery: ImageMachinery
  onRatio(ratio: string): void
  onPick(resolution: string): void
}) {
  const ratio = ratioKeyOf(resolution)
  const groups = tieredResolutionGroups(ratio, { machinery })
  const offered = new Set(groups.flatMap((group) => group.options.map((option) => option.value)))
  return (
    <span className="iw-tiered-resolution" data-iw-tiered-resolution>
      <StudioSelect value={ratio} aria-label="Aspect ratio" data-iw-ratio onChange={(event) => onRatio(event.target.value)}>
        {ASPECT_RATIOS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
        <option value="free">free</option>
      </StudioSelect>
      <StudioSelect value={resolution} aria-label="Resolution" data-iw-resolution-select title={groups.map((group) => `${group.tier.label}: ${group.tier.hint}`).join('\n\n')} onChange={(event) => onPick(event.target.value)}>
        {!offered.has(resolution) && <option value={resolution}>{resolution} · custom</option>}
        {groups.map((group) => (
          <optgroup key={group.tier.id} label={group.tier.label}>
            {group.options.map((option) => (
              <option key={option.value} value={option.value}>{option.value}{option.optimal ? ' — optimal' : ''}</option>
            ))}
          </optgroup>
        ))}
      </StudioSelect>
    </span>
  )
}

/** The custom-override fields: free grid-snapped W/H (kept from the AR
 *  picker's free mode, now inside the categorized UI). */
function FreeResolutionFields({ value, onCommit }: { value: string; onCommit(resolution: string): void }) {
  const [width, height] = value.split('x').map(Number)
  const [rawWidth, setRawWidth] = useState(String(Number.isFinite(width) ? width : 1344))
  const [rawHeight, setRawHeight] = useState(String(Number.isFinite(height) ? height : 768))
  const commit = () => onCommit(`${snapResolutionDim(Number(rawWidth) || 32)}x${snapResolutionDim(Number(rawHeight) || 32)}`)
  return (
    <span className="iw-free-fields" data-iw-free-fields>
      <input type="number" min={32} max={16384} step={32} value={rawWidth} aria-label="Width" data-iw-free-width onChange={(event) => setRawWidth(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') commit() }} />
      <span>x</span>
      <input type="number" min={32} max={16384} step={32} value={rawHeight} aria-label="Height" data-iw-free-height onChange={(event) => setRawHeight(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') commit() }} />
    </span>
  )
}

/** The inpaint mask painter (the 1F full image stack): paint the region to
 *  regenerate on the chosen source; "use mask" knocks the painted region's
 *  alpha out (transparent = painted, the ComfyUI Mask-Editor convention the
 *  engine's LoadImage reads as output 1) and lands the masked file through
 *  the blob ingest. The canvas pins to the source's own snapped dims. */
function MaskPainterDialog({ file, onCancel, onUse }: {
  file: { path: string; name: string; preview?: string }
  onCancel(): void
  onUse(masked: { path: string; name: string; preview: string; masked: true; width: number; height: number }): Promise<void> | void
}) {
  const [brush, setBrush] = useState(48)
  const [erase, setErase] = useState(false)
  const [painted, setPainted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const paintRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)

  // Draw-loop bookkeeping: the paint canvas keeps the source's NATURAL
  // pixel geometry so the mask aligns exactly; the displayed bitmap is a
  // CSS-scaled view of it. (Task 12R, k2q0n9s) The bind rides CALLBACK REFS,
  // not a mount effect: Base UI's portal gates its content on an internal
  // `mounted` flag that flips a commit AFTER this component mounts, so the
  // old []-effect ran against null refs and never re-ran (the canvas stayed
  // at the browser's 300x150 default — dead since the StudioDialogLayered
  // move; the CropEditor wheel fix is the same shape). The callback refs
  // fire when the nodes actually appear; React attaches them in tree order,
  // so the img's ref finds no canvas yet and the LAST-attaching ref performs
  // the one bind (both-present guard — order never assumed).
  const bindPaintSize = useCallback((img: HTMLImageElement, paint: HTMLCanvasElement) => {
    const redraw = () => {
      paint.width = img.naturalWidth
      paint.height = img.naturalHeight
      setPainted(false)
    }
    if (img.complete) redraw()
    else img.addEventListener('load', redraw, { once: true })
  }, [])
  const setImgNode = useCallback((node: HTMLImageElement | null) => {
    imgRef.current = node
    if (node && paintRef.current) bindPaintSize(node, paintRef.current)
  }, [bindPaintSize])
  const setPaintNode = useCallback((node: HTMLCanvasElement | null) => {
    paintRef.current = node
    if (node && imgRef.current) bindPaintSize(imgRef.current, node)
  }, [bindPaintSize])

  const paintAt = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const paint = paintRef.current
    if (!paint || !drawing.current) return
    const rect = paint.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * paint.width
    const y = ((event.clientY - rect.top) / rect.height) * paint.height
    const ctx = paint.getContext('2d')!
    if (erase) ctx.globalCompositeOperation = 'destination-out'
    else ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = 'rgba(255, 60, 60, 0.55)'
    ctx.beginPath()
    ctx.arc(x, y, (brush / 2) * (paint.width / rect.width), 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    setPainted(true)
  }

  const applyMask = async () => {
    const paint = paintRef.current
    const img = imgRef.current
    if (!paint || !img) return
    if (!painted) {
      setError('Paint the region to regenerate first — an empty mask makes the lane a no-op edit.')
      return
    }
    setBusy(true)
    try {
      // The masked file: the source with the painted region's alpha knocked
      // out (destination-out), stretched to its own 32-snapped dims — the
      // sub-grid stretch prepareMaskedImage also applies at submit, so the
      // mask and pixels resample together.
      const out = document.createElement('canvas')
      const snap = (value: number) => Math.round(value / 32) * 32
      out.width = snap(img.naturalWidth)
      out.height = snap(img.naturalHeight)
      const ctx = out.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, out.width, out.height)
      const scaledPaint = document.createElement('canvas')
      scaledPaint.width = out.width
      scaledPaint.height = out.height
      const sctx = scaledPaint.getContext('2d')!
      sctx.imageSmoothingQuality = 'high'
      sctx.drawImage(paint, 0, 0, paint.width, paint.height, 0, 0, out.width, out.height)
      ctx.globalCompositeOperation = 'destination-out'
      ctx.drawImage(scaledPaint, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('the masked source could not be encoded')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ''
      const chunk = 0x8000
      for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
      const ingested = await documentsApi.ingestBlob({ dataBase64: btoa(binary), name: `inpainted-source-${Date.now()}.png`, kind: 'image' })
      const preview = `/api/lan/documents/blobs/file?path=${encodeURIComponent(ingested.blob.relPath)}`
      await onUse({ path: ingested.path, name: file.name, preview, masked: true, width: img.naturalWidth, height: img.naturalHeight })
    } catch (paintError) {
      setError(paintError instanceof Error ? paintError.message : String(paintError))
    } finally {
      setBusy(false)
    }
  }

  return (
    /* Task 12 (k2q0n9s): StudioDialogLayered — the painter's Escape is the
       registry's while it is topmost; .iw-mask-dialog keeps its width. */
    <StudioDialogLayered
      layerId="iw-mask-painter"
      open
      onClose={onCancel}
      backdropClassName="iw-dialog-backdrop"
      centerClassName="iw-dialog-center"
      popupClassName="iw-dialog iw-mask-dialog"
      labelledBy="iw-mask-painter-title"
    >
      <div className="iw-dialog-head">
        <h3 id="iw-mask-painter-title">Paint the region to regenerate</h3>
        <Button variant="icon" className="iw-dialog-close" aria-label="Close the mask painter" onClick={onCancel}><X size={14} /></Button>
      </div>
      <p>Everything you paint regenerates from the instruction; the rest of the image is restored pixel-exactly after the render. Transparent pixels ARE the mask (the Mask-Editor convention).</p>
      <div className="iw-mask-stage">
        {file.preview ? <img ref={setImgNode} src={file.preview} alt="source" className="iw-mask-under" /> : <span className="iw-frame-evicted">no preview</span>}
        <canvas
          ref={setPaintNode}
          className="iw-mask-paint"
          data-iw-mask-canvas
          onPointerDown={(event) => { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); paintAt(event) }}
          onPointerMove={paintAt}
          onPointerUp={() => { drawing.current = false }}
          onPointerLeave={() => { drawing.current = false }}
        />
      </div>
      <div className="iw-mask-tools">
        <label>brush <input type="range" min={4} max={200} value={brush} data-iw-mask-brush onChange={(event) => setBrush(Number(event.target.value))} /> {brush}px</label>
        <button type="button" data-iw-mask-erase className={erase ? 'active' : ''} onClick={() => setErase(!erase)}>{erase ? 'erasing' : 'erase mode'}</button>
        <button type="button" data-iw-mask-clear onClick={() => { const paint = paintRef.current; if (paint) paint.getContext('2d')!.clearRect(0, 0, paint.width, paint.height); setPainted(false) }}>clear</button>
      </div>
      {error && <p className="iw-mask-error" role="alert">{error}</p>}
      <footer>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="primary" data-iw-mask-use disabled={busy} onClick={() => void applyMask()}>Use the masked source</button>
      </footer>
    </StudioDialogLayered>
  )
}

function chainPromptOf(chain: { inputSpec: Record<string, unknown>; settings: Record<string, unknown> }): string {
  const fresh = chain.inputSpec && typeof chain.inputSpec.fresh === 'object' ? (chain.inputSpec.fresh as Record<string, unknown>) : null
  if (fresh && typeof fresh.prompt === 'string' && fresh.prompt) return fresh.prompt
  if (typeof chain.settings.prompt === 'string') return chain.settings.prompt
  return 'canvas take'
}
