/** The generation job queue: persistence, the server-owned landing reader,
 *  and cancellation.
 *
 *  Wave 1: durable storage lives in the server's SQLite database (POST
 *  /api/lan/jobs per-job upserts).
 *
 *  Wave 2a: `jobs` and `cancellingIds` live in `useJobsStore` (zustand) —
 *  every setJobs call site kept its exact value/updater form, and the store
 *  actions are stable references (safe for flows to capture).
 *
 *  SERVER-OWNED JOBS (gfv5h0g, 2026-10-15): the ComfyUI history poll loop,
 *  the offline deadline sweep, and the engine-loss grace path are RETIRED —
 *  the server's job watcher owns observation, terminal writes, and take
 *  landing; this hook APPLIES the watcher's `landing` envelopes (and the
 *  boot/resync server reads). The localStorage jobs mirror is now a READ
 *  CACHE (the boot paint + the degraded boot when the API is unreachable);
 *  nothing writes it anymore — the server store is the only truth. What
 *  stays client-owned: submission (the in-memory graph), the one crash
 *  retry (the graph lives nowhere else), cancellation, and the debounced
 *  persist that delivers NEW job records to the server. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings, GenerationJob } from '../types'
import { isPreviewCrashSignature, isTerminalStatus } from '../lib/jobReducer'
import { extractOutputFile, withTiledVideoDecode } from '../lib/workflow'
import { extractAutomatedReferenceSet, hydrateLoadedJobs, recordCharacterSheetImages, recordCharacterTurntable, recordLocationWalkthrough, recordMovieOutput } from '../lib/jobRecords'
import { fetchServerJobs, saveServerJobs, serverStorageMigrationDone } from '../lib/serverStorage'
import { dbg } from '../lib/dbg'
import type { LiveProgress } from '../lib/useLivePreview'
import { subscribe } from '../lib/useRealtime'
import { useJobsStore } from '../state/jobsStore'
import { useDebouncedPersist } from './useDebouncedPersist'

export type NoticeTone = 'error' | 'success' | 'neutral'

export function useGenerationQueue(options: {
  settings: AppSettings | null
  connected: boolean
  notify(tone: NoticeTone, text: string): void
}) {
  const { settings, notify } = options
  const jobs = useJobsStore((state) => state.jobs)
  const cancellingIds = useJobsStore((state) => state.cancellingIds)
  // Stable store actions — captured once, never go stale.
  const { setJobs, setCancellingIds } = useJobsStore.getState()
  const [storageBootDone, setStorageBootDone] = useState(false)
  const cancellationRequests = useRef(new Set<string>())
  const jobsRef = useRef(jobs)
  useEffect(() => useJobsStore.subscribe((state) => { jobsRef.current = state.jobs }), [])

  // Boot load: the server store is authoritative. The localStorage snapshot
  // (already in state) paints instantly for a pre-migration first boot; the
  // server answer then replaces it. An empty server answer only clears the
  // list when the migration marker proves the copy already happened —
  // otherwise the local list stands until the migration POSTs land. A fetch
  // failure (server down) keeps the local list so the app keeps working.
  useEffect(() => {
    let disposed = false
    const failSafe = window.setTimeout(() => { if (!disposed) setStorageBootDone(true) }, 3000)
    void fetchServerJobs()
      .then((loaded) => {
        if (disposed) return
        if (loaded.length > 0) setJobs(hydrateLoadedJobs(loaded))
        else if (serverStorageMigrationDone()) setJobs([])
      })
      .catch(() => undefined)
      .finally(() => { if (!disposed) setStorageBootDone(true) })
    return () => { disposed = true; window.clearTimeout(failSafe) }
  }, [setJobs])

  const onLiveProgress = useCallback((id: string, update: LiveProgress) => {
    if (!id) return
    // The fabric's LiveProgress speaks `label`; the job record's field is
    // `progressLabel` — mapping explicitly (a bare spread dropped the label,
    // freezing tiles at "Waiting for ComfyUI to start" while progress ticked;
    // caught by the F6 live-progress e2e).
    setJobs((current) => current.map((j) => j.promptId === id && ['running', 'queued'].includes(j.status) ? {
      ...j,
      progress: update.progress ?? j.progress,
      progressLabel: update.label || j.progressLabel,
      currentStep: update.currentStep ?? j.currentStep,
      totalSteps: update.totalSteps ?? j.totalSteps,
      status: 'running',
    } : j))
  }, [setJobs])

  // Persistence is debounced (1 s trailing): during a live render the poll
  // loop and progress events update `jobs` several times per second. The
  // write reads jobsRef.current at flush time, so it always persists the
  // latest complete job list (never a partially-built one), and the debounce
  // hook flushes on pagehide/beforeunload/unmount so a normal close loses
  // nothing. Writes wait for the boot load so a stale local snapshot cannot
  // overwrite the server's newer state before we have read it.
  //
  // Multi-tab model: per-job upsert, latest-write-wins PER JOB ID at the
  // server — two tabs POST overlapping sets and each job keeps whichever
  // write landed last (the whole-list replace of the localStorage era is
  // gone, so one tab can no longer erase another tab's jobs). True
  // cross-tab live sync arrives with the realtime fabric.
  const persistJobs = useDebouncedPersist(1000)
  useEffect(() => {
    if (!storageBootDone) return
    persistJobs(() => {
      // The submit graph is for in-memory retry only — never persisted.
      const persistable = jobsRef.current.slice(0, 100).map((job) => { const rest = { ...job }; delete rest.graph; return rest })
      // Empty-jobs guard (both review waves found this independently — g5x37k8
      // M13 + d6iy68r m2, 2026-09-19): the boot transition used to POST
      // {"jobs":[]} on every fresh boot; the server rejects empty batches
      // with a 400. An empty list has nothing to persist.
      if (!persistable.length) return
      // (gfv5h0g) No localStorage fallback write anymore: the mirror is a
      // read cache (boot paint + degraded boot), and a failed POST retries
      // on the next debounce — the server store is the only landing truth,
      // and the watcher reads IT, never this tab's copy.
      void saveServerJobs(persistable).catch(() => {
        dbg('queue', { verdict: 'persist-deferred', count: persistable.length })
      })
    })
  }, [jobs, persistJobs, storageBootDone])

  // SERVER-OWNED LANDING (gfv5h0g — the R2 fix, 2026-10-15): the poll-and-
  // write loop is RETIRED. The server's job watcher observes engine
  // completion (its own history poll + the fabric's shared upstream), settles
  // job rows through the same jobReducer, lands takes through the document
  // store, and announces every settlement as a `landing` envelope on the
  // job channel. This surface is a READER: it applies settled records
  // (terminal-guarded — a stale envelope can neither resurrect nor duplicate
  // a settlement) and re-fetches server truth on a fabric sequence gap (the
  // resync path's new shape; the local history sweep is gone with the poll).
  // What remains client-owned: submission (the in-memory graph), the one
  // crash retry below (the graph lives nowhere else), cancellation, and the
  // debounced persist that delivers new job records TO the server.
  useEffect(() => subscribe('job', (envelope) => {
    if (envelope.type === 'resync') {
      void fetchServerJobs()
        .then((loaded) => {
          if (!loaded.length) return
          setJobs((current) => {
            const byId = new Map(loaded.map((job) => [job.id, job]))
            const merged = current.map((job) => {
              const settled = byId.get(job.id)
              return settled && !isTerminalStatus(job.status) ? { ...job, ...settled, graph: job.graph } : job
            })
            const known = new Set(merged.map((job) => job.id))
            for (const job of loaded) if (!known.has(job.id)) merged.push(hydrateLoadedJobs([job])[0] ?? job)
            return merged
          })
        })
        .catch(() => undefined)
      return
    }
    if (envelope.type !== 'landing') return
    const payload = envelope.payload as { outcome?: string; jobId?: string; failureKind?: string; job?: GenerationJob } | null
    if (!payload || typeof payload.jobId !== 'string' || !payload.job || typeof payload.job !== 'object') return
    const settled = payload.job
    const applySettled = () => {
      setJobs((current) => current.map((item) => item.id === payload.jobId && !isTerminalStatus(item.status) ? { ...item, ...settled, graph: item.graph } : item))
    }
    if (payload.outcome === 'completed' && settings) {
      dbg('landing', { jobId: payload.jobId, verdict: 'completed', serverOwned: true })
      recordMovieOutput(settled.movieLink, settled.outputUrl ?? '')
      // The character/location reference lanes stay client-owned (their
      // extraction libs orchestrate server routes from here): a completed
      // settlement for one of those jobs runs the same recording the retired
      // poll loop ran, against the settled record's paths.
      const candidate = jobsRef.current.find((item) => item.id === payload.jobId)
      if (candidate && (candidate.characterProjectId || candidate.locationProjectId)) {
        void (async () => {
          const mediaType = candidate.mediaType ?? 'video'
          const promptId = settled.promptId ?? candidate.promptId ?? ''
          const history = promptId ? await window.monoka.getHistory(settings.comfyUrl, promptId).catch(() => ({}) as Record<string, unknown>) : {}
          const local = settled.localOutputPath ?? candidate.localOutputPath
          const remote = settled.outputUrl ?? ''
          let extractionError: string | null = null
          const imageDescriptor = mediaType === 'image' ? extractOutputFile(history, promptId, mediaType) : undefined
          if (candidate.characterProjectId && imageDescriptor) {
            extractionError = await recordCharacterSheetImages(candidate.characterProjectId, imageDescriptor, settings)
          } else if (candidate.characterProjectId) {
            recordCharacterTurntable(candidate.characterProjectId, local ?? remote)
            if (local) extractionError = await extractAutomatedReferenceSet('character', candidate.characterProjectId, local, candidate.duration, settings)
          } else if (candidate.locationProjectId) {
            recordLocationWalkthrough(candidate.locationProjectId, local ?? remote)
            if (local) extractionError = await extractAutomatedReferenceSet('location', candidate.locationProjectId, local, candidate.duration, settings)
          }
          if (extractionError) notify('error', `The video rendered, but its reference frames could not be extracted: ${extractionError}`)
        })()
      }
    }
    if (payload.outcome === 'failed') {
      dbg('queue', { jobId: payload.jobId, verdict: 'failed', reason: (settled.error ?? '').slice(0, 160) })
      // The r3q1o49 crash-retry, preserved where the graph lives: a failed
      // MiniMax render gets ONE automatic engine-reset + tiled-VAE retry
      // before the error stands — most H3 failures on 16 GB cards are VRAM
      // fragmentation a /free soft-reset clears, and the stock-preview crash
      // (r3q1o49's null-previewer class) specifically recovers WITHOUT
      // previews on the resubmission. The retry is never a silent flash:
      // the notice and the tile label name what happened, and the retry
      // submits with NO preview request (the take lands preview-less and
      // the record says so). Only the surface holding the in-memory submit
      // graph can do this — a closed tab's failure stands as settled.
      const candidate = jobsRef.current.find((item) => item.id === payload.jobId)
      const previewCrash = isPreviewCrashSignature({ kind: 'executionError', reason: settled.error ?? '', nodeType: '' })
      if (settings && candidate && !isTerminalStatus(candidate.status) && !candidate.retriedOnce
        && (candidate.provider ?? 'monoka') === 'monoka' && candidate.graph && payload.failureKind === 'executionError') {
        void (async () => {
          try {
            await window.monoka.freeComfyMemory(settings.comfyUrl)
            const retryGraph = withTiledVideoDecode(candidate.graph as Record<string, { class_type: string; inputs: Record<string, unknown> }>)
            const resubmitted = await window.monoka.submitPrompt(settings.comfyUrl, retryGraph)
            setJobs((current) => current.map((item) => item.id === candidate.id
              ? {
                  ...item,
                  promptId: resubmitted.prompt_id,
                  status: 'queued',
                  progress: 2,
                  progressLabel: previewCrash ? 'Preview unavailable on this engine — retrying without previews' : 'Auto-retrying after engine reset (tiled VAE)',
                  error: undefined,
                  retriedOnce: true,
                  ...(previewCrash ? { previewUnavailable: true } : {}),
                }
              : item))
            notify('neutral', previewCrash
              ? 'Preview unavailable on this engine — retrying without previews.'
              : 'A render failed — the engine was reset and the job re-queued once with tiled VAE decoding.')
          } catch {
            applySettled()
          }
        })()
        return
      }
    }
    applySettled()
  }), [notify, settings, setJobs])

  const cancelJob = useCallback(async (job: GenerationJob) => {
    if (!settings) return
    if (!['queued', 'running'].includes(job.status) || cancellingIds.has(job.id)) return
    cancellationRequests.current.add(job.id)
    setCancellingIds((current) => new Set(current).add(job.id))
    if (!job.promptId) {
      setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: 'cancelled', error: undefined } : item))
      notify('neutral', 'Cancelling input preparation…')
      return
    }
    try {
      const result = await window.monoka.cancelPrompt(settings.comfyUrl, job.promptId)
      if (result.cancelled) {
        setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: 'cancelled', error: undefined } : item))
        notify('success', result.state === 'pending' ? 'Queued generation removed.' : 'Running generation stopped.')
      } else {
        notify('neutral', result.state === 'finished' ? 'That generation already finished.' : 'That generation is no longer in the ComfyUI queue.')
      }
    } catch (error) {
      cancellationRequests.current.delete(job.id)
      notify('error', `Could not stop generation: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setCancellingIds((current) => { const next = new Set(current); next.delete(job.id); return next })
    }
  }, [cancellingIds, notify, setCancellingIds, setJobs, settings])

  return { jobs, setJobs, jobsRef, cancellingIds, setCancellingIds, cancellationRequests, cancelJob, onLiveProgress }
}

export type GenerationQueue = ReturnType<typeof useGenerationQueue>
