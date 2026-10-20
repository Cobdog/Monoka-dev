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
 *
 * (Task 4, 2026-10-19 — the SPINE lands beside the designations.) The step
 * machine: WALK_STEPS is the blessed five (spec §2); WalkCandidate holds
 * EVERYTHING the walk collects in memory (§3's candidate model — the old
 * per-keystroke setSettings writes die here; the exit's one write is task
 * 8's); shouldPresent routes the present decision (the --setup flag
 * overrides the local latch — §4; task 9 wires the real flag); the per-step
 * gates answer verified | refused-with-reason | unverified-engine (§2.1's
 * honesty: a gate with no verified engine says "unverified engine — nothing
 * to check against", never an invented verdict). The module stays PURE — no
 * React, no settings-writing seam of any kind.
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

// ---------------------------------------------------------------------------
// The walk's spine (task 4, 2026-10-19 — spec §2/§2.1/§3): the step machine,
// the CANDIDATE container, the present gate, and the per-step gates.
// ---------------------------------------------------------------------------

/** The walk's five steps (spec §2 — the blessed order; the footer renders
 *  these verbatim, `data-wizard-step` indexes 0–4). */
export const WALK_STEPS = ['Engine', 'Models', 'Node packs', 'LAN prep', 'First prompt']

/** (Task 5, spec §2.2/W-I6) The component → catalog-entry map behind the
 *  Models step's one-click fetch rows. Keys are the stack report's row
 *  labels; values ARE server/fetchCatalog.ts entry ids. Only the FL2V turbo
 *  tier has a row today (D9, commit c9cc631) — the diffusion lane, the text
 *  encoder, and both VAEs are publisher-direct, so they map to nothing and
 *  their rows state that truth plus the make-visible guidance (never a
 *  fetch promise over an empty catalog — R-19/F10). The view builder in
 *  wizardModels.ts consumes this map beside the SERVED catalog: a mapped id
 *  the catalog does not list offers no fetch either. */
export const COMPONENT_FETCH_ROWS: Record<string, string> = {
  'Turbo 8': 'lightx2v-fl2v-turbo-8',
}

/** The LAN keys the walk collects as CANDIDATES (spec §2.4) — the honest
 *  SECOND store (the launcher config `.start-config.json`, written through
 *  §2.4's route, W-I1): never app settings. Task 7's step fills these;
 *  task 8's exit is the only place they are written. */
export type WalkLanKeys = { host?: string; port?: number; token?: boolean }

/** The walk's CANDIDATE state — everything the walk collects, held in
 *  memory for the whole walk (spec §3: "No keystroke-saves mid-walk … the
 *  wizard holds CANDIDATE state in memory"). A crash or abandon mid-walk
 *  leaves configuration untouched; skip persists nothing (D3); the exit
 *  (task 8's buildExitWrite) is the ONLY place this becomes configuration. */
export type WalkCandidate = {
  /** The engine URL under designation — born from the settings prefill
   *  (W-I5: the field agrees with its placeholder), edited freely, saved
   *  only at the exit. */
  comfyUrl: string
  /** The URL a live Test answered REACHABLE against (§3's gate table:
   *  "a live Test answered reachable … against the candidate URL").
   *  Verification is earned per-URL — a candidate that is not exactly this
   *  string is unverified. */
  verifiedUrl: string | null
  /** The two destination designations (D7 — the machinery above). */
  modelsRoot: DestinationState
  customNodesDir: DestinationState
  /** Model overrides designated during the walk (the Models step's
   *  ambiguous-candidate picks; task 5 writes these). */
  overrides: Record<string, string>
  /** The LAN keys collected as candidates (task 7) — the exit's second
   *  store, never app settings (W-I1/W-M3). */
  lanKeys: WalkLanKeys
}

/** The walk's starting state: the engine URL prefilled from settings, the
 *  designations empty and unverified, nothing verified, nothing designated. */
export function emptyWalkCandidate(comfyUrl: string): WalkCandidate {
  return {
    comfyUrl,
    verifiedUrl: null,
    modelsRoot: emptyDestination(),
    customNodesDir: emptyDestination(),
    overrides: {},
    lanKeys: {},
  }
}

/** A candidate URL edit — the exact seam the old wizard's per-keystroke
 *  `setSettings` rode (this task kills those saves): it returns a NEW
 *  candidate and touches nothing else. This module deliberately offers NO
 *  settings-writing function — the walk state is the only thing an edit
 *  touches (the journey spec's counting window proves the network half:
 *  zero POST /api/lan/settings across the keystrokes). */
export function setCandidateUrl(candidate: WalkCandidate, url: string): WalkCandidate {
  if (url === candidate.comfyUrl) return candidate
  return { ...candidate, comfyUrl: url }
}

/** Record a live Test's outcome (§2.1: "Test verifies, then the walk holds
 *  the URL as a candidate"). Only a REACHABLE answer earns verification —
 *  an unreachable answer is honest readout data but leaves the gate saying
 *  "unverified engine — nothing to check against". */
export function markEngineVerified(candidate: WalkCandidate, url: string, reachable: boolean): WalkCandidate {
  return { ...candidate, verifiedUrl: reachable ? url : null }
}

/** Is the candidate verified? Exact-string truth: the verification belongs
 *  to the URL it was earned against, so any edit re-opens the question. */
export function isEngineVerified(candidate: WalkCandidate): boolean {
  return candidate.verifiedUrl !== null && candidate.verifiedUrl === candidate.comfyUrl
}

/** The present decision (spec §4): neither done nor skipped — UNLESS the
 *  server requested setup (`--setup`): the reset is server-owned and must
 *  work from any terminal, any browser, any profile, so the flag overrides
 *  the LOCAL latch (a shell flag cannot reach into localStorage). Task 9
 *  wires the real flag; this predicate is the spine's single seam for it. */
export function shouldPresent(latch: { latchDone: boolean; latchSkipped: boolean; serverSetupRequested: boolean }): boolean {
  if (latch.serverSetupRequested) return true
  return !latch.latchDone && !latch.latchSkipped
}

/** A step-gate answer (§2: each step ends in a verified state or an honest
 *  refusal — never a silent maybe). `unverified-engine` is §2.1's honesty
 *  class: a gate with no verified engine SAYS SO instead of inventing a
 *  verdict. */
export type StepGate =
  | { verdict: 'verified' }
  | { verdict: 'refused'; reason: string }
  | { verdict: 'unverified-engine'; reason: string }

/** The §2.1 copy, verbatim lead — the gates read this when the walk
 *  continued unverified (the honest connect-later, stated where it bites). */
export const UNVERIFIED_ENGINE_COPY =
  'Unverified engine — nothing to check against. Run Test on the Engine step (continuing unverified stays allowed; this gate just will not invent a verdict).'

/** The Engine step's gate (§3's table: "a live Test answered reachable …
 *  against the candidate URL"). */
export function engineGate(candidate: WalkCandidate): StepGate {
  if (!candidate.comfyUrl.trim()) {
    return { verdict: 'refused', reason: 'No engine address is designated yet — type the engine\'s URL.' }
  }
  if (isEngineVerified(candidate)) return { verdict: 'verified' }
  return { verdict: 'unverified-engine', reason: UNVERIFIED_ENGINE_COPY }
}

/** The floor every engine-dependent gate reads first (§2.1: "the later
 *  steps' verify gates read 'unverified engine — nothing to check against'
 *  instead of inventing verdicts"). */
function engineFloor(candidate: WalkCandidate): StepGate | null {
  if (isEngineVerified(candidate)) return null
  return { verdict: 'unverified-engine', reason: UNVERIFIED_ENGINE_COPY }
}

/** The Models step's gate: the engine floor, and nothing more (task 5's
 *  final shape). The rows' presence truth and the models-root designation
 *  speak through the step's ONE verdict line and the fetch rows' own gate —
 *  §2.2's one-verdict rule means a second gate verdict here would be a
 *  second voice contradicting the first. */
export function modelsGate(candidate: WalkCandidate): StepGate {
  const floor = engineFloor(candidate)
  if (floor) return floor
  return { verdict: 'verified' }
}

/** The Node packs step's gate (task 6 extends: the custom-nodes designation
 *  and the install verifications). */
export function packsGate(candidate: WalkCandidate): StepGate {
  const floor = engineFloor(candidate)
  if (floor) return floor
  return { verdict: 'verified' }
}

/** The LAN prep step's gate. No engine floor by design: the posture is the
 *  STUDIO server's, not the engine's (§3's table gates on the bind probe or
 *  keep-current). Keep-current — no keys collected — is the pass §3 names
 *  ("or the step was left at keep-current"): the fresh-clone path is one
 *  click. Task 7's designation extends this gate with the probe verdict. */
export function lanGate(candidate: WalkCandidate): StepGate {
  void candidate
  return { verdict: 'verified' }
}

/** The First prompt step's gate (task 8 extends: the cost preview's tier
 *  verification the deliberate submit runs against). */
export function promptGate(candidate: WalkCandidate): StepGate {
  const floor = engineFloor(candidate)
  if (floor) return floor
  return { verdict: 'verified' }
}
