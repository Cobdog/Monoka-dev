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
 * overrides the local latch — §4) with owesSetupAck its terminal-state
 * counter (the ack fires on done AND skip); the per-step
 * gates answer verified | refused-with-reason | unverified-engine (§2.1's
 * honesty: a gate with no verified engine says "unverified engine — nothing
 * to check against", never an invented verdict). The module stays PURE — no
 * React, no settings-writing seam of any kind.
 */
import { findNodePack, packPresence } from '../lib/nodePackRegistry'
import type { MissingNodeClass } from '../lib/preflight'
import type { NodePackStatus } from '../types'

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

/** The absolute-path shape the walk accepts (review 2026-10-20, j63snid):
 *  POSIX `/`-prefixed OR a Windows drive path (`C:\…`, `C:/…`) — the same
 *  class node's path.isAbsolute answers (the settings POST's shape check
 *  already accepts drive paths; the app supports Windows: the CI legs, the
 *  C:\FFMPEG probe). A relative path stays refused — it would silently
 *  resolve against the SERVER's working directory, not the engine's disk. */
const DRIVE_PATH = /^[a-zA-Z]:[\\/]/

function isAbsoluteShape(path: string): boolean {
  return path.startsWith('/') || DRIVE_PATH.test(path)
}

/** The separator a path names for joining/prefixing: the drive root's own
 *  slash when it is a drive path, backslash when one appears, else the
 *  POSIX slash. Cosmetic only — both spellings are legal on Windows. */
function separatorOf(path: string): string {
  const drive = path.match(/^[a-zA-Z]:([\\/])/)
  if (drive) return drive[1]
  return path.includes('\\') ? '\\' : '/'
}

/** Existence-verify a destination path: non-empty, absolute (either
 *  platform's shape), then a stat through the fs/check route. The oracle is
 *  only asked for paths that pass the cheap checks (it answers for exactly
 *  one disk — see the header). */
export async function verifyDesignation(path: string): Promise<DestinationVerdict> {
  const trimmed = path.trim()
  if (!trimmed) {
    return { designated: false, exists: false, reason: 'No path is designated yet.' }
  }
  if (!isAbsoluteShape(trimmed)) {
    return { designated: false, exists: false, reason: 'The path must be absolute (like /models or C:\\models) so it names the same place on the engine\'s disk.' }
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

/** Join a path segment with the directory's OWN separator (destination
 *  roots are absolute by the verify gate above — POSIX or a Windows drive
 *  path; the joined result reads like the path that was typed). */
function joinPath(directory: string, segment: string): string {
  const trimmed = directory.replace(/[\\/]+$/, '')
  if (!trimmed) return segment
  return `${trimmed}${separatorOf(trimmed)}${segment}`
}

/** The models-root prefill (D7 / plan decision 7). `modelRootIsDefault` is
 *  the settings GET's sibling flag — the server's word on fresh-default vs
 *  user-set; the client never guesses. Returns '' when nothing is honestly
 *  prefillable; the step renders its "where should fetched weights land?"
 *  question instead (never the studio-home default as engine-visible). */
export function modelsRootPrefill(settings: DesignationSettings, modelRootIsDefault: boolean): string {
  if (settings.engine.mode === 'managed') {
    const checkout = settings.engine.checkoutPath.trim()
    if (checkout && isAbsoluteShape(checkout)) return joinPath(checkout, 'models')
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

/** (friction 2026-10-21) The component → catalog-entry map behind the
 *  Models step's MANUAL DOWNLOAD LINK rows — the studio-side one-click
 *  fetch is DEAD (the maintainer's ruling: "we at least for now just give
 *  the user the download link, they manually fetch the model themselves,
 *  and are told where to place it"). Keys are the stack report's row
 *  labels; values ARE server/fetchCatalog.ts entry ids. Only the FL2V
 *  turbo tier has a row today (D9, commit c9cc631) — the diffusion lane,
 *  the text encoder, and both VAEs are publisher-direct, so they map to
 *  nothing and their rows state that truth plus the make-visible guidance
 *  (never a link promise over an empty catalog — R-19/F10). The view
 *  builder in wizardModels.ts consumes this map beside the SERVED catalog:
 *  a mapped id the catalog does not list offers no link either.
 *
 *  THE FUTURE the ruling names: downloads route THROUGH the ComfyUI
 *  instance (its own model machinery fetches into its own correct folders)
 *  — "more hands off, more better". When that lands, this map points the
 *  row at the instance's download path instead of a manual URL; until then
 *  the link row is the honest now. */
export const COMPONENT_LINK_ROWS: Record<string, string> = {
  'Turbo 8': 'lightx2v-fl2v-turbo-8',
}

/** The LAN keys the walk collects as CANDIDATES (spec §2.4) — the honest
 *  SECOND store (the launcher config `.start-config.json`, written through
 *  §2.4's route, W-I1): never app settings. Task 7's step fills these;
 *  task 8's exit is the only place they are written. */
export type WalkLanKeys = { host?: string; port?: number; token?: boolean }

/** The step's two host choices (plan ruling 6 — the probe route refuses
 *  anything else, so the walk's vocabulary matches). */
export type LanHostChoice = '127.0.0.1' | '0.0.0.0'

/** A bind probe verdict — earned for EXACTLY one host:port (the same
 *  per-value discipline as the engine URL's per-URL verification). */
export type LanProbeVerdict = {
  host: LanHostChoice
  port: number
  claimable: boolean
  reason?: string
}

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
  /** The bind-probe verdict for the LAN keys — earned for exactly one
   *  host:port; any host/port edit clears it (null until then). */
  lanProbe: LanProbeVerdict | null
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
    lanProbe: null,
  }
}

/** A candidate URL edit — the exact seam the old wizard's per-keystroke
 *  `setSettings` store writes rode (those were pure store writes, no
 *  network — but each one re-armed EngineHost's probe loop against the
 *  half-typed url; the kill here is structural: the wizard carries no
 *  settings subscription at all, and the candidate-purity unit test pins
 *  the pure update). It returns a NEW candidate and touches nothing else.
 *  This module deliberately offers NO settings-writing function — the walk
 *  state is the only thing an edit touches. The journey spec's counting
 *  window PINS the network half of the new behavior: zero settings POSTs
 *  and zero engine probes aimed at the typed host across the keystrokes. */
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
 *  the LOCAL latch (a shell flag cannot reach into localStorage). The flag
 *  is the boot read (sessionStore.setupRequested); this predicate is the
 *  spine's single seam for it. */
export function shouldPresent(latch: { latchDone: boolean; latchSkipped: boolean; serverSetupRequested: boolean }): boolean {
  if (latch.serverSetupRequested) return true
  return !latch.latchDone && !latch.latchSkipped
}

/** The ack decision (spec §4, task 9): the walk owes the server a
 *  setup-ack exactly when its request still stands AND the walk has reached
 *  a TERMINAL state — done AND skip both count (once the reopened walk was
 *  acted on, the request is satisfied; `--setup` re-arms on the next boot).
 *  An open walk owes NOTHING: a background tab that merely shows the walk
 *  must not eat the request. */
export function owesSetupAck(state: { done: boolean; skipped: boolean; serverSetupRequested: boolean }): boolean {
  if (!state.serverSetupRequested) return false
  return state.done === true || state.skipped === true
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
 *  speak through the step's ONE verdict line and the rows' own affordances —
 *  §2.2's one-verdict rule means a second gate verdict here would be a
 *  second voice contradicting the first. (friction 2026-10-21, pinned) The
 *  gate NEVER consulted the models-root designation — the engine's own
 *  registry is the step's verdict, and the designation is fetch-target-only
 *  (managed engines), so exiting the step owes nothing to it. */
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

// ---------------------------------------------------------------------------
// The LAN prep step's pure block (task 7, spec §2.4): the designation state,
// the D8 default, the probe-before-acceptance gate, and the exit seam task
// 8's one-motion write reads. The launcher config is the SECOND store —
// nothing here writes anything; the candidate keys are the whole story.
// ---------------------------------------------------------------------------

/** The host choice in world terms (§2.4): what each bind MEANS on the
 *  network, not the socket spelling. */
export const LAN_HOST_LAN_COPY = 'Any device on this network can open the studio.'
export const LAN_HOST_LOCAL_COPY = 'This machine only — nothing else on the network can reach the studio.'

/** The D8 truth, stated plainly: the printed URL invites a phone onto a
 *  studio that today needs no token. Keeping the network open offers
 *  enforcement ON (protection that asks the host nothing); turning it off
 *  is one click away, and so are show/copy/reset. */
export const LAN_TOKEN_TRUTH_COPY =
  'The printed URL invites a phone onto a studio that today needs no token. Keeping the network open turns the access token on by default — show, copy, or reset it right here, or turn it off.'

/** The restart honesty (§2.4): applies next start, never mid-session. */
export const LAN_RESTART_COPY = 'Applies the next time the studio starts — the wizard never restarts the server.'

/** The acceptance rule: claimability is answered BEFORE the designation is
 *  accepted (§2.4 — "the step answers claimability before it accepts"). */
export const LAN_PROBE_FIRST_COPY = 'Probe the port first — the designation is accepted once the bind answers claimable for exactly this address.'

/** The launcher's own port rule (start.sh): integer 1024–65535. */
export const LAN_PORT_RANGE_COPY = 'The port must be an integer between 1024 and 65535.'

/** The override honesty (review fix round, 3p14abm): the launcher MARKS its
 *  own network exports (MONOKA_LAUNCHER_EXPORTED), so what this step reports
 *  as overrides is only what the USER set by hand — the precedence stated
 *  precisely, neither overclaiming nor softening. */
export const LAN_OVERRIDES_COPY = 'Environment you set yourself wins over anything saved here; the saved choices apply otherwise.'

/** The D8 default (ruling D8): keeping the studio LAN-reachable offers
 *  token enforcement ON — protection that asks the host nothing. Narrowing
 *  to loopback offers OFF (nothing can reach it anyway). */
export function lanTokenEnforcementDefault(host: LanHostChoice): boolean {
  return host === '0.0.0.0'
}

/** A host choice. The D8 default RIDES the choice (the offer IS the token
 *  key's candidate state — the step's toggle renders from it, and switching
 *  addresses re-derives the offer rather than dragging the old answer
 *  along). Clears the probe verdict: it belonged to the previous bind. */
export function setLanHost(candidate: WalkCandidate, host: LanHostChoice): WalkCandidate {
  return { ...candidate, lanProbe: null, lanKeys: { ...candidate.lanKeys, host, token: lanTokenEnforcementDefault(host) } }
}

/** A port edit. Clears the probe verdict (earned per host:port). */
export function setLanPort(candidate: WalkCandidate, port: number | undefined): WalkCandidate {
  return { ...candidate, lanProbe: null, lanKeys: { ...candidate.lanKeys, port } }
}

/** A token designation. NOT a bind edit — the probe verdict survives. */
export function setLanToken(candidate: WalkCandidate, token: boolean): WalkCandidate {
  return { ...candidate, lanKeys: { ...candidate.lanKeys, token } }
}

/** Keep-current: the DEFAULT and the one-click undo. Everything designated
 *  and the verdict clear — nothing is written at the exit. */
export function keepLanPosture(candidate: WalkCandidate): WalkCandidate {
  return { ...candidate, lanKeys: {}, lanProbe: null }
}

/** Record a probe answer for EXACTLY the host:port asked — and complete the
 *  designation with that bind: a probe IS the claim on a port, so the answer
 *  designates what it answers for (the exit seam carries it only once the
 *  gate verifies). An edit afterwards clears the verdict, the same as any
 *  bind edit. */
export function recordLanProbe(candidate: WalkCandidate, host: LanHostChoice, port: number, answer: { claimable: boolean; reason?: string }): WalkCandidate {
  return { ...candidate, lanKeys: { ...candidate.lanKeys, host, port }, lanProbe: { host, port, claimable: answer.claimable, reason: answer.reason } }
}

/** The LAN prep step's gate (§3's table: "the designated host:port answered
 *  the bind probe … or the step was left at keep-current"). No engine floor
 *  by design: the posture is the STUDIO server's, not the engine's.
 *  - Keep-current — no keys collected — is the pass §3 names: the
 *    fresh-clone path is one click.
 *  - A token-only designation changes no bind: verified, no probe owed.
 *  - A designation of EXACTLY the live posture (the wizard is served BY the
 *    listener itself — probing it would always answer EADDRINUSE) is the
 *    status quo confirming itself: verified without a probe.
 *  - Any other bind designation needs the port rule satisfied and a
 *    claimable verdict for EXACTLY that host:port — anything else refuses
 *    by name, with the studio's own listener translated honestly. */
export function lanGate(candidate: WalkCandidate, live?: { host: string; port: number }): StepGate {
  const keys = candidate.lanKeys
  const designatesBind = keys.host !== undefined || keys.port !== undefined
  if (!designatesBind) return { verdict: 'verified' }
  if (keys.host !== '127.0.0.1' && keys.host !== '0.0.0.0') {
    return { verdict: 'refused', reason: 'The host must be this machine only (127.0.0.1) or the whole network (0.0.0.0).' }
  }
  // An ABSENT port is an incomplete designation — probe-first territory (the
  // recordLanProbe claim supplies it); the range rule names itself only when
  // a port is present and breaks it.
  if (keys.port !== undefined && (typeof keys.port !== 'number' || !Number.isInteger(keys.port) || keys.port < 1024 || keys.port > 65535)) {
    return { verdict: 'refused', reason: LAN_PORT_RANGE_COPY }
  }
  // The live equivalence (review fix round, 3p14abm): designating exactly
  // what already runs changes nothing at the next start — the status quo is
  // its own verification, no claimability question exists for a bind that
  // already holds.
  if (live !== undefined && keys.host === live.host && keys.port === live.port) return { verdict: 'verified' }
  const probe = candidate.lanProbe
  if (!probe || probe.host !== keys.host || probe.port !== keys.port) {
    return { verdict: 'refused', reason: LAN_PROBE_FIRST_COPY }
  }
  if (!probe.claimable) {
    if (live !== undefined && probe.port === live.port) {
      return { verdict: 'refused', reason: 'That port is held by this studio\'s running server — it frees at the next start. Keep this address, or pick another port and probe again.' }
    }
    return { verdict: 'refused', reason: probe.reason ? `That port is not claimable (${probe.reason}). Try another port, then probe again.` : 'That port is not claimable. Try another port, then probe again.' }
  }
  return { verdict: 'verified' }
}

/** The exit seam task 8's one-motion write reads: the launcher-config keys
 *  this walk EARNED — null when the step was left at keep-current (nothing
 *  written) and null when the gate refuses (an unprobed designation has
 *  nothing verified to write). Pass the live posture through when the step
 *  has it — the live equivalence is part of the gate's verdict. This is
 *  where §3's write contract ("the designated host:port answered the bind
 *  probe, or keep-current") is enforced for the exit; the exit motion
 *  itself is task 8's. */
export function lanKeysForExit(candidate: WalkCandidate, live?: { host: string; port: number }): WalkLanKeys | null {
  if (lanGate(candidate, live).verdict !== 'verified') return null
  const keys = candidate.lanKeys
  if (keys.host === undefined && keys.port === undefined && keys.token === undefined) return null
  return { ...(keys.host !== undefined ? { host: keys.host } : {}), ...(keys.port !== undefined ? { port: keys.port } : {}), ...(keys.token !== undefined ? { token: keys.token } : {}) }
}

/** The First prompt step's gate (task 8 extends: the cost preview's tier
 *  verification the deliberate submit runs against). */
export function promptGate(candidate: WalkCandidate): StepGate {
  const floor = engineFloor(candidate)
  if (floor) return floor
  return { verdict: 'verified' }
}

// ---------------------------------------------------------------------------
// The exit contract (task 8, spec §3): the ONE-MOTION write's pure block.
// buildExitWrite derives the whole exit from VERIFIED state only — each key
// present exactly when its step verified, the default tier resolved by the
// plan's ruling, the LAN keys earned through lanKeysForExit (the live
// posture passed through when the step has it); applyExitWrite merges the
// patch over saved settings; exitWriteSummary speaks what will and will not
// be written (the silent drop named, T7's carried review; the unverified
// voice, T5's); placementDisclosure names where pre-exit fetches landed
// (§3's honest exception — installs/fetches are facts, but not invisible
// ones). Still PURE: no writes here; the wizard's exit motion consumes it.
// ---------------------------------------------------------------------------

/** Narrow structural view of the tier states — h3Stack's turboTierStates
 *  output satisfies it (the ONE seam: the properties panel, the submit
 *  refusal, and this exit all read the same derivation). */
export type ExitTierStates = { '4': { available: boolean }; '8': { available: boolean } }

/** The five patch keys, verbatim (spec §3's write contract): each present
 *  ONLY when its step verified. generationDefaults is the exception that is
 *  always present — the tier rule always resolves (never a tier that would
 *  refuse), and 'off' is itself the honest answer. */
export type ExitSettingsPatch = {
  comfyUrl?: string
  modelRoot?: string
  engine?: { externalCustomNodesDir?: string }
  modelOverrides?: { monoka: Record<string, string> }
  generationDefaults?: { turbo: 'off' | '4' | '8' }
}

/** One line of the exit summary: what WILL be written (carried, with its
 *  value) and what will NOT (with the honest reason — keep-current by
 *  choice, a refused designation by the gate, an unverified engine by the
 *  absence of a verdict). */
export type ExitWriteItem = {
  key: 'comfyUrl' | 'modelRoot' | 'customNodesDir' | 'modelOverrides' | 'lanKeys' | 'tier'
  label: string
  carried: boolean
  value?: string
  reason?: string
  note?: string
}

export type ExitWrite = {
  settingsPatch: ExitSettingsPatch
  /** The second store's keys (W-I1/W-M3) — null when keep-current or a
   *  refused designation: NOTHING is written for the LAN posture then. */
  launcherKeys: WalkLanKeys | null
  /** True when no fast tier verified and the written tier is 'off' — the
   *  cost preview says "quality, the full step count" instead. */
  tierFallback: boolean
  items: ExitWriteItem[]
}

/** The tier→steps mapping the preview reads. 'off' is quality: the full
 *  step count (the settings' steps default, 30 in the shipped defaults). */
export function tierStepCount(turbo: 'off' | '4' | '8', steps: number | undefined): number {
  if (turbo === '4') return 4
  if (turbo === '8') return 8
  return steps ?? 30
}

/** The wait stated as a CLASS (spec §2.5 — no invented minute counts). */
export const TIER_WAIT_FAST_COPY = 'the wait is minutes-class'
export const TIER_WAIT_QUALITY_COPY = 'the wait is the ~20-minute class'

export function tierWaitCopy(turbo: 'off' | '4' | '8'): string {
  return turbo === 'off' ? TIER_WAIT_QUALITY_COPY : TIER_WAIT_FAST_COPY
}

/** The cost preview line: the tier, the steps, the resolution/duration the
 *  submit will run, the wait as a class. The tier the caller passes is the
 *  EXIT's tier (what the saved settings will hold when the submit runs) —
 *  not the stale saved value. */
export function promptCostPreview(args: { turbo: 'off' | '4' | '8'; steps: number; resolution: string; duration: number }): string {
  const label = args.turbo === '8' ? 'Fast · 8-step' : args.turbo === '4' ? 'Fast · 4-step' : 'Quality'
  if (args.turbo === 'off') {
    return `First clip: ${label} — will run ${args.steps} steps at quality, ${args.resolution}, ${args.duration}s · ${tierWaitCopy(args.turbo)}.`
  }
  return `First clip: ${label} — ${args.steps} steps at ${args.resolution}, ${args.duration}s · ${tierWaitCopy(args.turbo)}.`
}

/** The exit write (§3): everything VERIFIED in one motion, nothing else.
 *  - comfyUrl only when a live Test answered reachable against the current
 *    candidate (isEngineVerified's exact-string rule).
 *  - modelRoot / engine.externalCustomNodesDir only when existence-verified.
 *  - modelOverrides.monoka only when the walk named a pick.
 *  - generationDefaults.turbo ALWAYS, by the plan's ruling: '8' when the
 *    8-step lane verified, else '4', else 'off' + tierFallback (never a
 *    tier that would refuse at submit).
 *  - launcherKeys through lanKeysForExit — pass the live posture through
 *    when the step has it: the live equivalence is part of the gate's
 *    verdict, and without it a status-quo designation the step verified
 *    would silently drop its keys (the D8 token offer with them). */
export function buildExitWrite(
  candidate: WalkCandidate,
  tierStates: ExitTierStates,
  live?: { host: string; port: number },
  options?: { steps?: number },
): ExitWrite {
  const engineVerified = isEngineVerified(candidate)
  const modelsRoot = isDesignated(candidate.modelsRoot)
  const nodesDir = isDesignated(candidate.customNodesDir)
  const overrides = Object.keys(candidate.overrides)
  const tier: 'off' | '4' | '8' = tierStates['8'].available ? '8' : tierStates['4'].available ? '4' : 'off'
  const tierFallback = tier === 'off'
  const steps = tierStepCount(tier, options?.steps)

  const items: ExitWriteItem[] = [
    {
      key: 'comfyUrl',
      label: 'Engine address',
      carried: engineVerified,
      ...(engineVerified ? { value: candidate.comfyUrl } : {}),
      ...(!engineVerified ? { reason: 'The address was never verified with Test — the saved address stays.' } : {}),
    },
    {
      key: 'modelRoot',
      label: 'Models root',
      carried: modelsRoot,
      ...(modelsRoot ? { value: candidate.modelsRoot.value } : {}),
      ...(!modelsRoot ? { reason: 'No models root was verified — the configured root stays.' } : {}),
    },
    {
      key: 'customNodesDir',
      label: 'External custom-nodes folder',
      carried: nodesDir,
      ...(nodesDir ? { value: candidate.customNodesDir.value } : {}),
      ...(!nodesDir ? { reason: 'No custom-nodes folder was verified — the configured folder stays.' } : {}),
    },
    {
      key: 'modelOverrides',
      label: 'Named model picks',
      carried: overrides.length > 0,
      ...(overrides.length > 0 ? { value: overrides.map((slot) => `${slot}: ${candidate.overrides[slot]}`).join(', ') } : {}),
      ...(!(overrides.length > 0) ? { reason: 'No ambiguous model was named — inference decides.' } : {}),
    },
  ]

  // The LAN item's voice distinguishes the two not-carried shapes: a chosen
  // keep-current (nothing designated) and a gate-refused designation (the
  // silent drop, T7's surface — it must speak).
  const lanKeys = candidate.lanKeys
  const lanTouched = lanKeys.host !== undefined || lanKeys.port !== undefined || lanKeys.token !== undefined
  const launcherKeys = lanKeysForExit(candidate, live)
  items.push({
    key: 'lanKeys',
    label: 'LAN posture',
    carried: launcherKeys !== null,
    ...(launcherKeys !== null
      ? { value: [
          ...(launcherKeys.host !== undefined ? [`host ${launcherKeys.host}`] : []),
          ...(launcherKeys.port !== undefined ? [`port ${launcherKeys.port}`] : []),
          ...(launcherKeys.token !== undefined ? [`token ${launcherKeys.token ? 'on' : 'off'}`] : []),
        ].join(', ') }
      : {}),
    ...(!launcherKeys && !lanTouched ? { reason: 'Keep-current — nothing is written for the LAN posture.' } : {}),
    ...(!launcherKeys && lanTouched ? { reason: 'The designation was not verified (the probe never answered claimable) — nothing is written for it.' } : {}),
  })

  items.push({
    key: 'tier',
    label: 'First-clip default tier',
    carried: true,
    value: tier === 'off' ? `Quality — ${steps} steps` : `Fast · ${tier}-step — ${steps} steps`,
    ...(tierFallback ? { note: 'No fast tier is installed — the first clip runs at quality (the full step count).' } : {}),
  })

  return {
    settingsPatch: {
      ...(engineVerified ? { comfyUrl: candidate.comfyUrl } : {}),
      ...(modelsRoot ? { modelRoot: candidate.modelsRoot.value } : {}),
      ...(nodesDir ? { engine: { externalCustomNodesDir: candidate.customNodesDir.value } } : {}),
      ...(overrides.length > 0 ? { modelOverrides: { monoka: { ...candidate.overrides } } } : {}),
      // The tier rule ALWAYS resolves — 'off' is itself the honest answer.
      generationDefaults: { turbo: tier },
    },
    launcherKeys,
    tierFallback,
    items,
  }
}

/** The exit summary's one voice: the headline names the nothing when the
 *  walk verified no designation at all (the T7 silent-drop surface raised to
 *  the headline); the items are the per-key truth. */
export function exitWriteSummary(write: ExitWrite): { headline: string; items: ExitWriteItem[] } {
  const nothingDesignated = write.items
    .filter((item) => item.key !== 'tier')
    .every((item) => !item.carried)
  return {
    headline: nothingDesignated
      ? 'Nothing you designated will be written — the walk verified no designation.'
      : 'One motion at the exit — this is what the walk writes:',
    items: write.items,
  }
}

/** Merge an exit write over saved settings — pure, non-mutating: engine keys
 *  spread over the saved engine config, the monoka overrides merge per
 *  family, the tier merges into the saved generation defaults. Only the
 *  patch's keys change; everything unrelated survives verbatim. */
export function applyExitWrite<T extends {
  comfyUrl: string
  modelRoot: string
  engine: Record<string, unknown>
  modelOverrides?: Record<string, Record<string, string>>
  generationDefaults: Record<string, unknown>
}>(settings: T, write: ExitWrite): T {
  const patch = write.settingsPatch
  return {
    ...settings,
    ...(patch.comfyUrl !== undefined ? { comfyUrl: patch.comfyUrl } : {}),
    ...(patch.modelRoot !== undefined ? { modelRoot: patch.modelRoot } : {}),
    ...(patch.engine ? { engine: { ...settings.engine, ...patch.engine } } : {}),
    ...(patch.modelOverrides
      ? { modelOverrides: { ...settings.modelOverrides, monoka: { ...settings.modelOverrides?.monoka, ...patch.modelOverrides.monoka } } }
      : {}),
    ...(patch.generationDefaults
      ? { generationDefaults: { ...settings.generationDefaults, ...patch.generationDefaults } }
      : {}),
  }
}

/** The placement seam's disclosure (T5's carried review): fetches during the
 *  walk land in the CONFIGURED models root (the fetcher reads live settings;
 *  the designation becomes the root only at the exit). When the designation
 *  differs, the exit names the folder and the files that landed there — the
 *  user can move them or re-designate; never silent invisible weights.
 *  null when there is nothing to disclose: no designation, the same root,
 *  or nothing placed pre-exit. */
export type PlacementDisclosure = { folder: string; files: string[] }

export function placementDisclosure(args: { placedPaths: string[]; configuredRoot: string; designatedRoot: string }): PlacementDisclosure | null {
  const stripTrailing = (value: string) => value.trim().replace(/[\\/]+$/, '')
  const configured = stripTrailing(args.configuredRoot)
  const designated = stripTrailing(args.designatedRoot)
  if (!configured || !designated) return null
  // The same drive root in either spelling is the same root (the ledger may
  // normalize slashes); POSIX roots compare exactly, as before.
  if (configured === designated || (DRIVE_PATH.test(configured) && DRIVE_PATH.test(designated) && configured.replace(/\\/g, '/') === designated.replace(/\\/g, '/'))) return null
  const sep = separatorOf(configured)
  // A drive root matches its files in either separator spelling; a POSIX
  // root keeps the exact single-prefix test (`\` is a legal FILENAME byte
  // there — accepting it would read files that were never placed inside).
  const prefixes = DRIVE_PATH.test(configured)
    ? [`${configured}${sep}`, `${configured}${sep === '/' ? '\\' : '/'}`]
    : [`${configured}${sep}`]
  const files = args.placedPaths.filter((file) => prefixes.some((prefix) => file.startsWith(prefix)))
  if (files.length === 0) return null
  return { folder: configured, files }
}

// ---------------------------------------------------------------------------
// The Node packs step's pure block (task 6, spec §2.3): the curated rows,
// their live states, the install routes, the via labels. Everything the
// step's JSX renders derives here so the unit suite pins the exact output —
// the same view-builder discipline the Models step's wizardModels.ts holds.
// ---------------------------------------------------------------------------

/** The two families the walk curates beyond the preflight misses (spec
 *  §2.3): the fast first-clip tier's loader pair and the live-preview
 *  repair. Ids ARE nodePackRegistry ids. */
export const WIZARD_PACK_FAMILIES: readonly string[] = ['minimax-h3-turbo', 'h3-preview-override']

/** The studio's own tooling pack — curated when THIS install proves its
 *  payload ships (the board's `vendored` verdict): the one install that
 *  needs neither network nor Manager. */
export const WIZARD_STUDIO_TOOLING_PACK = 'lora-form-adapter'

/** The plan's verbatim interim copy (the between-state ruling, 2026-10-19):
 *  the spec fixes the flip condition, not the between-state — this names it
 *  honestly, and the step offers the re-verify beside it. */
export const PACKS_AWAITING_RESTART_COPY = 'installed — restart the engine to activate; this row verifies when it serves the classes.'

/** The D7 refusal the step renders beside every gated install click (W-C1/
 *  R3 P1-8): the walk's gate is STRICTER than resolveNodePackTarget's
 *  legacy checkout fallback — the walk installs only into a designated,
 *  existence-verified folder; the fallback stays Settings' business. */
export const PACKS_INSTALL_REFUSAL = 'Designate and verify the engine\'s external custom-nodes folder above first — installs need an existing directory on the engine\'s disk.'

export type CuratedPackState = 'active' | 'awaiting-restart' | 'missing' | 'unknown'

export type CuratedPackRow = {
  packId: string
  name: string
  /** The registry description's first sentence — the row's one human
   *  sentence; the deep-read essays stay on the board (spec §2.3). */
  sentence: string
  licenseSpdx: string
  featureGroup: string
  /** The live board row when the board listed the id (null otherwise —
   *  an unlisted pack can still curate off a preflight miss). */
  status: NodePackStatus | null
  state: CuratedPackState
  /** Why the row is curated: a preflight miss mapped to it, a curated
   *  family, or the studio's own shipping tooling payload. */
  reason: 'preflight' | 'family' | 'studio-tooling'
}

/** The registry description's first sentence — the row's one human
 *  sentence (single-sourced: hand-written row copy would drift from the
 *  registry the Settings board renders). */
export function packRowSentence(description: string): string {
  const cut = description.indexOf('. ')
  const sentence = cut === -1 ? description : description.slice(0, cut + 1)
  return sentence.trim()
}

/** Whether the pack is live on the engine. Freshness order: the board's
 *  own targeted verdict first (the A-8 per-class pulls the poll just ran —
 *  it asked LAST); a served object_info snapshot answers only when the
 *  board could not ask (no row, or the tri-state 'unknown'), read through
 *  packPresence — the ONE presence rule, never a re-encoded match. */
function curatedPackActive(packId: string, status: NodePackStatus | null, info: Record<string, unknown> | null): boolean {
  if (status && status.instanceState === 'active') return true
  if (status && status.instanceState !== 'unknown') return false
  return info !== null && packPresence(info, packId)
}

/** The walk's curated pack rows (spec §2.3): the preflight-mapped misses
 *  first, then the fast-tier and preview families, then the studio's own
 *  tooling pack when the board proves its payload ships. The 14-pack long
 *  tail never renders here — the board is the board's home. An ACTIVE pack
 *  stays curated and renders its active state — the spec's flip is the
 *  install's verification payoff ("the row flips to active only after the
 *  pack's claimed node classes appear in a fresh targeted object_info
 *  read"); the brief's "when not already active" gloss yields to it, and
 *  the can-I-generate line stays the step's "nothing to do here" voice. */
export function curatedWizardPacks(args: {
  packs: NodePackStatus[]
  missingClasses: MissingNodeClass[]
  /** The engine's object_info snapshot as the walk holds it (the session
   *  store's info) — the FALLBACK activity source; null/empty when the
   *  walk holds no snapshot. */
  info?: Record<string, unknown> | null
}): CuratedPackRow[] {
  const info = args.info && typeof args.info === 'object' && Object.keys(args.info).length > 0 ? args.info : null
  const byId: Record<string, NodePackStatus> = {}
  for (const status of args.packs) byId[status.id] = status

  const curated: CuratedPackRow[] = []
  const seen: Record<string, boolean> = {}
  const push = (packId: string, reason: CuratedPackRow['reason']) => {
    if (seen[packId]) return
    const status = byId[packId] ?? null
    const definition = status ?? findNodePack(packId)
    if (!definition) return
    seen[packId] = true
    let state: CuratedPackState
    if (curatedPackActive(packId, status, info)) state = 'active'
    else if (status === null) state = 'unknown'
    else if (status.installed === true || status.folderState === 'foreign') state = 'awaiting-restart'
    else if (status.instanceState === 'unknown') state = 'unknown'
    else state = 'missing'
    curated.push({
      packId,
      name: definition.name,
      sentence: packRowSentence(definition.description),
      licenseSpdx: definition.licenseSpdx,
      featureGroup: definition.featureGroup,
      status,
      state,
      reason,
    })
  }

  for (const item of args.missingClasses) {
    if (item.packId) push(item.packId, 'preflight')
  }
  for (const family of WIZARD_PACK_FAMILIES) push(family, 'family')
  const tooling = byId[WIZARD_STUDIO_TOOLING_PACK]
  if (tooling && tooling.vendored === true) push(WIZARD_STUDIO_TOOLING_PACK, 'studio-tooling')
  return curated
}

/** The route a consented install click takes, read from the board row's
 *  own decorations (the server's Manager-first verdict, the payload
 *  availability, the fetch catalog's network entry) — the JSX renders
 *  exactly this decision. null means no one-click path exists; the row
 *  offers the manual way instead of a dead button. */
export type PackInstallPath = 'route-manager' | 'route-studio' | 'fetcher'

export function packInstallPath(status: NodePackStatus | null): PackInstallPath | null {
  if (!status) return null
  if (status.managerInstallable === true) return 'route-manager'
  if (status.availability === 'ready') return 'route-studio'
  if (status.hasNetworkSource === true) return 'fetcher'
  return null
}

/** The via label — how an install actually went through, stated on the row
 *  (Manager-first or studio fallback, never silent). */
export function packViaLabel(via: 'manager' | 'studio' | undefined): string {
  if (via === 'manager') return 'installed through ComfyUI-Manager'
  if (via === 'studio') return 'installed through the studio'
  return ''
}

/** The packs step's install gate (W-C1/R3 P1-8): installs need the
 *  custom-nodes designation, existence-verified — the same isDesignated
 *  gate the designations accept. Undesignated answers the reason string
 *  the row renders beside its disabled click. */
export function packsInstallRefusal(customNodesDir: DestinationState): string | null {
  return isDesignated(customNodesDir) ? null : PACKS_INSTALL_REFUSAL
}

/** The fetcher arm's interim copy (review round, 3p14abm): startFetch only
 *  ENQUEUES — the answer is {started}, the job runs in the background, and
 *  its failure lands in the fetch ledger, never in that promise. Until the
 *  board confirms the folder, the row admits the fetch and claims nothing. */
export const PACKS_FETCH_UNDERWAY_COPY = 'fetch started — the studio is placing the pack; the row verifies when the engine serves the classes.'

/** The fetcher arm's post-click phase (review round, 3p14abm), read the
 *  Models step's way: the ledger's placement is `landed`, its failure is
 *  `failed` (the message rides the row), everything between the enqueue and
 *  a verdict is `underway` — never "installed". Precedence is the ledger's
 *  own timeline: a landed placement outranks everything (the failure it
 *  answered is gone within a poll), an in-flight retry outranks the stale
 *  failure it answers, and the failure outranks the click's started bridge
 *  (the bridge only covers the ≤1-poll window before the catalog speaks). */
export type PackFetchPhase = 'idle' | 'underway' | 'landed' | 'failed'

export function packFetchPhase(args: { landed: boolean; inFlight: boolean; started: boolean; failure: string }): PackFetchPhase {
  if (args.landed) return 'landed'
  if (args.inFlight) return 'underway'
  if (args.failure) return 'failed'
  if (args.started) return 'underway'
  return 'idle'
}

/** The foreign-folder copy (review round, 3p14abm): a folder the studio did
 *  not install is on-disk truth, but "installed — restart" is false advice
 *  there — the engine still does not serve the classes, and a restart may
 *  not change that. The row says whose copy it is. */
export const PACKS_FOREIGN_FOLDER_COPY = 'a folder with this pack\'s name sits in the target, but the studio did not install it — the engine does not serve the classes, and a restart may not change that. Inspect it in Settings → Node packs.'

/** The awaiting-restart row's words: the plan's verbatim interim for a
 *  studio-placed folder, the foreign honesty for one the studio does not
 *  own. One seam so the JSX cannot mix them. */
export function packAwaitingCopy(status: NodePackStatus | null): string {
  return status?.folderState === 'foreign' ? PACKS_FOREIGN_FOLDER_COPY : PACKS_AWAITING_RESTART_COPY
}

/** The target-less gate (review round, 3p14abm): the walk's designation
 *  becomes the configured target at the walk's EXIT — until then installs
 *  ride the saved settings target, and with nothing configured the click
 *  would fail server-side (or land in the resolve fallback the walk never
 *  designated). The row pre-disables and says why. */
export const PACKS_NO_TARGET_COPY = 'No install target is configured yet — the designation becomes the walk\'s exit write, and until then an install has nowhere to land. Set the engine\'s external custom-nodes folder in Settings first.'
