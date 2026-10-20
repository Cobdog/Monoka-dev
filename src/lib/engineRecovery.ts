/** The engine-probe CONSEQUENCE flow (truth-surface sweep #2, task 68e9k17
 * — audit M1/C1). What useStudioSession's runEngineCheck did inline lives
 * here, dependency-injected, so the whole transition matrix — what gets
 * pulled, with which options, and when the resync bookkeeping lands — is
 * provable without React or an engine (tests/enginewatch.test.js (a4)
 * drives it with a recording harness; tests/resync.test.js drives it over
 * HTTP against the real server + the environment-mirror fake engine).
 *
 * The flow, per probe (decisions in engineWatch.ts, wiring here):
 *   - probe status; log the junction; publish it.
 *   - CONNECTED:
 *     - boot/manual/recovered pull object_info (A-8: never per steady tick;
 *       a FAILED pull's clear is URL-SCOPED like the lost arm's — a probe
 *       degrades only info its own url earned).
 *     - RECOVERED re-syncs the model inventory WITH REFRESH, then records
 *       the outcome — the toast speaks only after the listing landed (or
 *       names the failure).
 *     - a STEADY tick runs the LIGHT drift check (models-only listing, no
 *       object_info): a registry that changed with connectivity never
 *       dropping — the invisible restart the audit's mirror walk hit, where
 *       the engine came back between two probes and no transition fired —
 *       re-syncs within one cadence.
 *   - DISCONNECTED: clear object_info (URL-SCOPED — a probe clears only
 *     info its own url earned, so the walk's candidate-verified registry
 *     survives the saved url's lost-probe cadence); mark the loss (R-01).
 *
 * Failure honesty: a resync that throws records ok:false and never replaces
 * the store's inventory (an error-shaped return is a failure, not data).
 */
import type { AppSettings, ComfyStatus, ModelFile } from '../types'
import type { ObjectInfo } from './comfyInfo'
import { dbg } from './dbg'
import {
  engineTransition, inventoryDrifted, logEngineProbe, RECOVERY_RESYNC_OPTIONS,
  type InventoryResyncCause, type InventoryResyncRecord, type LightInventory,
} from './engineWatch'

export type EngineProbeSource = 'boot' | 'loop' | 'visibility' | 'manual'

/** The bridge the renderer's DesktopApi provides (the web apiClient's
 *  shapes; every method signature matches window.monoka exactly). */
export type EngineRecoveryBridge = {
  getComfyStatus(url: string): Promise<ComfyStatus>
  getObjectInfo(url: string): Promise<ObjectInfo>
  scanModels(settings: AppSettings, options?: { refresh?: boolean; url?: string }): Promise<ModelFile[]>
  /** The light models-only listing; null when it cannot be judged (route
   *  absent, engine flapped mid-ask). Optional: a bridge without it simply
   *  never drift-checks (the transition path still re-syncs). */
  lightInventory?(settings: AppSettings): Promise<LightInventory | null>
}

/** The store surface the flow needs — the zustand session store's methods,
 *  thin enough to fake in a test. */
export type EngineRecoveryStore = {
  status(): { connected: boolean }
  settings(): AppSettings | null
  models(): ModelFile[]
  setStatus(status: ComfyStatus): void
  /** The url the info was earned against rides the write (§5.2): the store
   *  records which engine the object_info describes. */
  setInfo(info: ObjectInfo, url?: string): void
  /** The url the store's CURRENT info was earned against (null: none — the
   *  initial empty). The lost arm's clear reads it: a probe may only clear
   *  info its own url earned. */
  infoUrl(): string | null
  bumpInfoEpoch(): void
  setModels(models: ModelFile[]): void
  markEngineLost(at: number): void
  markEngineRecovered(at: number): void
  markInventoryResync(record: InventoryResyncRecord): void
}

export type EngineRecoveryDeps = { bridge: EngineRecoveryBridge; store: EngineRecoveryStore }

/** One re-sync: full inventory pull with refresh semantics, store update,
 *  outcome recorded. The read rides the PROBED url (spec §5.2 — the record
 *  describes the engine this probe just verified, so a candidate typed over
 *  a stale saved default can never settle a 0-file record); a failure keeps
 *  the current inventory and records ok:false — the surfaces' wording
 *  follows the record, never the attempt. */
async function resyncInventory(deps: EngineRecoveryDeps, cause: InventoryResyncCause, settings: AppSettings, url: string): Promise<void> {
  try {
    const found = await deps.bridge.scanModels(settings, { ...RECOVERY_RESYNC_OPTIONS, url })
    deps.store.setModels(found)
    // (A-DBG) The re-sync junction: what the registry answered, and why we
    // asked — the drift/recovery split is the triage transcript's spine.
    dbg('inventory.resync', { cause, refresh: true, files: found.length })
    deps.store.markInventoryResync({ at: Date.now(), ok: true, files: found.length, cause })
  } catch (error) {
    dbg('inventory.resync', { cause, refresh: true, failed: String(error) })
    deps.store.markInventoryResync({ at: Date.now(), ok: false, files: 0, cause })
  }
}

/** One engine probe + its transition bookkeeping (R-01's flow, extracted;
 *  see the module header for the contract). */
export async function runEngineCheck(deps: EngineRecoveryDeps, url: string, source: EngineProbeSource): Promise<ComfyStatus> {
  const { bridge, store } = deps
  const wasConnected = source === 'boot' ? undefined : store.status().connected
  const nextStatus = await bridge.getComfyStatus(url)
  const transition = engineTransition(wasConnected, nextStatus.connected)
  logEngineProbe(source, url, transition, nextStatus.connected, nextStatus.latencyMs ?? 0)
  store.setStatus(nextStatus)
  if (nextStatus.connected) {
    const shouldPullInfo = transition === 'recovered' || source === 'boot' || source === 'manual'
    if (shouldPullInfo) {
      try {
        store.setInfo(await bridge.getObjectInfo(url), url)
        store.bumpInfoEpoch()
      } catch {
        // (zo22z6o r2) URL-scoped like the lost arm: a failed pull of url X
        // may only degrade info X earned — a boot/manual/recovered pull of
        // the SAVED url that throws must not wipe the walk's
        // candidate-earned registry either.
        if (store.infoUrl() === url) store.setInfo({}, url)
      }
    }
    if (transition === 'recovered') {
      // The restart-watch payload: object_info AND the model inventory
      // (the instance's own registry listing — R-12) re-pulled together,
      // with refresh semantics, and the outcome RECORDED before any
      // surface claims it.
      const settings = store.settings() ?? ({} as AppSettings)
      await resyncInventory(deps, 'recovery', settings, url)
      store.markEngineRecovered(Date.now())
    } else if (transition === 'steady' && source !== 'boot') {
      // The invisible-restart guard: the light, models-only listing (no
      // object_info — A-8's megabytes stay out of the cadence) against the
      // store's inventory. Drift re-syncs; agreement costs six tiny GETs.
      const settings = store.settings() ?? ({} as AppSettings)
      const light = bridge.lightInventory ? await bridge.lightInventory(settings).catch(() => null) : null
      if (inventoryDrifted(store.models(), light)) {
        await resyncInventory(deps, 'drift', settings, url)
      }
    }
  } else {
    // (§5 residual, zo22z6o) The clear is URL-SCOPED: a probe may only
    // degrade info its own url earned. The walk's candidate-verified
    // object_info (a manual check of the typed candidate) must survive the
    // SAVED url's down-cadence probes — on a virgin home the saved default
    // being dead says nothing about the candidate the walk just verified.
    if (store.infoUrl() === url) store.setInfo({}, url)
    if (transition === 'lost') store.markEngineLost(Date.now())
  }
  return nextStatus
}
