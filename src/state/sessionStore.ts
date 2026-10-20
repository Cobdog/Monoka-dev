/** The studio-session store (wave 2a): settings, model scan, engine
 *  connection status/object-info, Ollama model list, and GPU telemetry — the
 *  state `useStudioSession` held as React state. The hook keeps its boot-load
 *  and telemetry effects; only where the values live changed. */
import { create } from 'zustand'
import type { AppSettings, ComfyStatus, ExternalEngineFacts, GpuTelemetry, LlmModelsResult, ManagedEngineStatus, ModelFile, ModelFileIdentity, ModelIdentityResult, OllamaModel } from '../types'
import type { ObjectInfo } from '../lib/comfyInfo'
import type { InventoryResyncRecord } from '../lib/engineWatch'

export type SessionState = {
  settings: AppSettings | null
  /** (task 5, D7) The settings GET's server-computed flag — fresh-default vs
   *  user-set modelRoot. Initial TRUE fails safe: until the server's word
   *  arrives the walk prefills EMPTY (never the studio-home default as
   *  engine-visible — W-C1). */
  modelRootIsDefault: boolean
  /** (task 9, spec §4) The --setup reset's in-memory server request — the
   *  walk re-opens over any local latch while it stands. Initial FALSE
   *  fails safe: until the server's word arrives the latch rules (never a
   *  surprise re-open; the flag is the server's word, not a client guess). */
  setupRequested: boolean
  models: ModelFile[]
  scanning: boolean
  status: ComfyStatus
  checking: boolean
  gpu: GpuTelemetry | null
  info: ObjectInfo
  /** (§5.2, zo22z6o) The url the CURRENT info was earned against — null when
   *  none. engineRecovery's lost arm reads it: a probe clears only info its
   *  own url earned, so the walk's candidate-verified registry survives the
   *  saved url's down-cadence probes. */
  infoUrl: string | null
  ollamaModels: OllamaModel[]
  /** Active LLM provider descriptor (router or Ollama fallback) from
   *  /api/lan/llm/models — drives assistant availability + model labels. */
  llm: LlmModelsResult | null
  /** Self-managed engine runtime snapshot — null unless managed mode is
   *  active (external mode never polls, so it stays null there). */
  engineRuntime: ManagedEngineStatus | null
  /** (R-31, audit C F9) The honest external readout (R-30's per-mode status
   *  route): latency, version, queue depth from the engine itself — polled
   *  only while external mode is active; null otherwise. */
  externalEngine: ExternalEngineFacts | null
  /** (Wave 1 R-01) The engine-watch bookkeeping the re-check loop writes:
   *  lostAt/recoveredAt timestamp the connectivity TRANSITIONS (consumers
   *  toast + fail active jobs honestly), infoEpoch counts successful
   *  object_info pulls (the pack board re-resolves its live chips on each).
   *  resync (sweep #2, 68e9k17) records the LAST inventory re-sync OUTCOME —
   *  the toast speaks from this record, never from the attempt: an
   *  inventory that did not land is never claimed as re-synced. */
  engineWatch: { lostAt: number | null; recoveredAt: number | null; infoEpoch: number; resync: InventoryResyncRecord | null }
  setSettings(settings: AppSettings | null): void
  setModelRootIsDefault(modelRootIsDefault: boolean): void
  setSetupRequested(setupRequested: boolean): void
  setModels(models: ModelFile[]): void
  /** (to7xpa7) The settle upgrade (the wizard's D6 contract): merges
   *  identity blocks into the stored models by (kind, name) so
   *  h3StackReport re-renders verdicts with no second fetch. Only REAL
   *  changes publish a fresh array — the standing cadence re-delivering the
   *  same settled blocks is a no-op, and identity-absent results (the
   *  degraded light listing's shape) touch nothing. */
  mergeModelIdentities(results: ModelIdentityResult[]): void
  setScanning(scanning: boolean): void
  setStatus(status: ComfyStatus): void
  setChecking(checking: boolean): void
  setGpu(gpu: GpuTelemetry | null): void
  setInfo(info: ObjectInfo, url?: string): void
  setOllamaModels(ollamaModels: OllamaModel[]): void
  setLlm(llm: LlmModelsResult | null): void
  setEngineRuntime(engineRuntime: ManagedEngineStatus | null): void
  setExternalEngine(externalEngine: ExternalEngineFacts | null): void
  markEngineLost(at: number): void
  markEngineRecovered(at: number): void
  bumpInfoEpoch(): void
  markInventoryResync(record: InventoryResyncRecord): void
}

/** Field-identity compare for two identity blocks (explicit, dependency-free
 *  — aliases flatten to a join so array identity never reads as change). An
 *  undefined old block is always a change. */
function sameIdentity(a: ModelFileIdentity | undefined, b: ModelFileIdentity): boolean {
  if (!a) return false
  if (a.verdict !== b.verdict || a.verifying !== b.verifying) return false
  if (a.family !== b.family || a.artifact !== b.artifact || a.variant !== b.variant || a.quant !== b.quant || a.dtype !== b.dtype) return false
  const aAliases = a.aliases ? a.aliases.join('|') : undefined
  const bAliases = b.aliases ? b.aliases.join('|') : undefined
  return aAliases === bAliases
}

export const useSessionStore = create<SessionState>()((set) => ({
  settings: null,
  modelRootIsDefault: true,
  setupRequested: false,
  models: [],
  scanning: false,
  status: { connected: false, latencyMs: 0 },
  checking: false,
  gpu: null,
  info: {},
  infoUrl: null,
  ollamaModels: [],
  llm: null,
  engineRuntime: null,
  externalEngine: null,
  engineWatch: { lostAt: null, recoveredAt: null, infoEpoch: 0, resync: null },
  setSettings: (settings) => set({ settings }),
  setModelRootIsDefault: (modelRootIsDefault) => set({ modelRootIsDefault }),
  setSetupRequested: (setupRequested) => set({ setupRequested }),
  setModels: (models) => set({ models }),
  mergeModelIdentities: (results) => set((state) => {
    if (!Array.isArray(results) || results.length === 0) return state
    const byKey: Record<string, ModelIdentityResult> = {}
    for (const result of results) {
      if (!result || typeof result.name !== 'string' || !result.identity) continue
      byKey[`${result.kind}\u0000${result.name}`] = result
    }
    let changed = false
    const models = state.models.map((model) => {
      const next = byKey[`${model.kind}\u0000${model.name}`]
      if (!next || !next.identity) return model
      if (sameIdentity(model.identity, next.identity)) return model
      changed = true
      return { ...model, identity: next.identity }
    })
    return changed ? { models } : state
  }),
  setScanning: (scanning) => set({ scanning }),
  setStatus: (status) => set({ status }),
  setChecking: (checking) => set({ checking }),
  setGpu: (gpu) => set({ gpu }),
  setInfo: (info, url) => set({ info, infoUrl: url ?? null }),
  setOllamaModels: (ollamaModels) => set({ ollamaModels }),
  setLlm: (llm) => set({ llm }),
  setEngineRuntime: (engineRuntime) => set({ engineRuntime }),
  setExternalEngine: (externalEngine) => set({ externalEngine }),
  markEngineLost: (at) => set((state) => ({ engineWatch: { ...state.engineWatch, lostAt: at, recoveredAt: null } })),
  markEngineRecovered: (at) => set((state) => ({ engineWatch: { ...state.engineWatch, lostAt: null, recoveredAt: at } })),
  bumpInfoEpoch: () => set((state) => ({ engineWatch: { ...state.engineWatch, infoEpoch: state.engineWatch.infoEpoch + 1 } })),
  markInventoryResync: (record) => set((state) => ({ engineWatch: { ...state.engineWatch, resync: record } })),
}))
