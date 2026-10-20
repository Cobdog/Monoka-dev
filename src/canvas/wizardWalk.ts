/**
 * The first-run walk's pure module — begins with the destination designations
 * (wizard rework spec §2.2/§2.3, audit W-C1, ruling D7: "the walk's spine,
 * not a follow-up"). The walk collects the two engine-side destinations its
 * one-click actions require — the MODELS ROOT (where fetched weights land so
 * the engine sees them) and the EXTERNAL CUSTOM-NODES FOLDER (where pack
 * installs go) — each existence-verified before acceptance and persisted at
 * the walk's exit as ordinary app settings (`settings.modelRoot`,
 * `settings.engine.externalCustomNodesDir`; the fetcher's destinations and
 * `resolveNodePackTarget`'s install target already consume both).
 *
 * HONEST LIMIT (stated, per D7's prefill rule): existence is verified through
 * `window.monoka.checkPath` — the server's /api/lan/fs/check — which can only
 * stat the disk THE STUDIO runs on. Same-machine or shared-storage setups
 * only; a remote engine's disks are beyond what the studio can see. This is
 * the same limit the Settings surface's path check has today, and it is
 * rendered, never hidden: a verdict speaks for the disk the studio can stat.
 *
 * The engine's own configured dirs are not API-discoverable on external
 * engines, so prefill is honest-or-empty (plan decision 7, 2026-10-19):
 *   - models root: managed checkout → `<checkoutPath>/models`; a user-set
 *     non-default `settings.modelRoot` → itself (re-running --setup must not
 *     blank a working designation); the shipped studio-home default → EMPTY.
 *     The studio-home default NEVER prefills as engine-visible — that is
 *     W-C1's dead end (fetched weights landing where an external engine
 *     never reads). Fresh-default vs user-set arrives as the settings GET's
 *     `modelRootIsDefault` sibling flag; the client cannot compute it (the
 *     default lives in server paths).
 *   - custom nodes: the configured `engine.externalCustomNodesDir` when set,
 *     else EMPTY (R3 P1-8: `resolveNodePackTarget` answers `none` without it
 *     — the install rows refuse honestly until it is designated).
 */

/** Narrow structural view of AppSettings — the fields a designation reads.
 *  AppSettings satisfies this; tests pass minimal fixtures. */
export type DesignationSettings = {
  modelRoot: string
  engine: { mode: string; checkoutPath: string; externalCustomNodesDir?: string }
}

/** The verdict `verifyDesignation` answers. `designated` is the gate: true
 *  only for an existing directory on a stat-reachable disk. `reason` always
 *  names WHY a refusal happened — never a silent maybe (spec §2: each step
 *  ends in a verified state or an honest refusal). */
export type DestinationVerdict = {
  designated: boolean
  exists: boolean
  reason?: string
}

/** The walk's per-destination state: the current value plus the verdict for
 *  the value it was earned against (null until verified — a value without a
 *  verdict is UNVERIFIED, never presumed fine). */
export type DestinationState = {
  value: string
  verdict: DestinationVerdict | null
}

/** The walk's starting state per destination. */
export function emptyDestination(): DestinationState {
  return { value: '', verdict: null }
}

/** A value edit. Deliberately clears the verdict: it belonged to the
 *  previous path, and a stale "exists" beside a new path would be a lie. */
export function setDestinationValue(state: DestinationState, value: string): DestinationState {
  if (value === state.value) return state
  return { value, verdict: null }
}

/** The acceptance gate the steps read: fetch/install rows stay refused until
 *  this is true (D7's honest downgrade — "no destination designated", never
 *  fake remediation). */
export function isDesignated(state: DestinationState): boolean {
  return state.verdict?.designated === true
}

/** Existence-verify a destination path: non-empty, absolute, then a stat
 *  through the fs/check route. The oracle is only asked for paths that pass
 *  the cheap checks (it answers for exactly one disk — see the header). */
export async function verifyDesignation(path: string): Promise<DestinationVerdict> {
  const trimmed = path.trim()
  if (!trimmed) {
    return { designated: false, exists: false, reason: 'No path is designated yet.' }
  }
  // Absolute-only, matching the Settings surface's check: a relative path
  // would silently resolve against the SERVER's working directory, not the
  // engine's disk — refuse rather than guess.
  if (!trimmed.startsWith('/')) {
    return { designated: false, exists: false, reason: 'The path must be absolute (starting with /) so it names the same place on the engine\'s disk.' }
  }
  try {
    const answer = await window.monoka.checkPath(trimmed)
    if (answer.error) {
      return { designated: false, exists: false, reason: answer.error }
    }
    if (!answer.exists) {
      return { designated: false, exists: false, reason: 'That directory does not exist on the disk the studio can see (same machine or shared storage). Create it — or mount it — then verify again.' }
    }
    if (!answer.directory) {
      return { designated: false, exists: true, reason: 'That path is a file, not a directory.' }
    }
    return { designated: true, exists: true }
  } catch (error) {
    return { designated: false, exists: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/** Verify a destination STATE: the convenience seam the DesignationField
 *  calls — verdict earned for exactly the state's current value. */
export async function verifyDestination(state: DestinationState): Promise<DestinationState> {
  const verdict = await verifyDesignation(state.value)
  return { value: state.value, verdict }
}

/** Join a path segment POSIX-style (destination roots are absolute POSIX
 *  paths by the verify gate above). */
function joinPath(directory: string, segment: string): string {
  return `${directory.replace(/\/+$/, '')}/${segment}`
}

/** The models-root prefill (D7 / plan decision 7). `modelRootIsDefault` is
 *  the settings GET's sibling flag — the server's word on fresh-default vs
 *  user-set; the client never guesses. Returns '' when nothing is honestly
 *  prefillable; the step renders its "where should fetched weights land?"
 *  question instead (never the studio-home default as engine-visible). */
export function modelsRootPrefill(settings: DesignationSettings, modelRootIsDefault: boolean): string {
  if (settings.engine.mode === 'managed') {
    const checkout = settings.engine.checkoutPath.trim()
    if (checkout && checkout.startsWith('/')) return joinPath(checkout, 'models')
    return ''
  }
  const current = settings.modelRoot.trim()
  if (!modelRootIsDefault && current) return current
  return ''
}

/** The external custom-nodes folder prefill: the configured folder when set,
 *  else EMPTY — without it `resolveNodePackTarget` answers `none` and every
 *  install row refuses honestly (R3 P1-8). */
export function customNodesPrefill(settings: DesignationSettings): string {
  const configured = (settings.engine.externalCustomNodesDir ?? '').trim()
  return configured || ''
}
