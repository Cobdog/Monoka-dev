/**
 * statusToken — the domain-qualified status→tone-token map (component
 * vocabulary task 4, Flux k2q0n9s). One authority for WHICH token a status
 * paints, replacing the four hand-rolled maps (tile-ring ladder in
 * canvas.css, connection health across the engine chip/bar + health pills,
 * doctor severity, node-pack install chips) that had drifted apart on
 * shared words.
 *
 * Contract:
 *   - `statusToken({ domain, status })` returns CSS custom-property NAMES
 *     (`'--danger'`), never literals or `var()` strings (P02: every color
 *     is an EXISTING token; consumers wrap in `var()` themselves).
 *   - `fg` is the tone (text/border/icon/fill); `bg` is the distinct
 *     background TOKEN where the skin defines one (connection online's
 *     `--accent-soft` tint) and mirrors `fg` otherwise — tinted backgrounds
 *     compose via color-mix ratios that stay in the consuming CSS rule.
 *   - `DomainStatus` is a DISCRIMINATED union (P11): no bare string union,
 *     no shared ladder a domain can silently fall through. Unknown
 *     domain/status throws at runtime.
 *   - HOW a tone is painted (mix ratios, border widths, fills, animations)
 *     stays in the surface's CSS; surfaces receive the token through
 *     inline custom-property bridges (`--tile-tone` and friends — see the
 *     exported *Vars helpers). The surface's state class/attribute stays
 *     on the DOM as the recipe key and the test hook.
 *
 * Normalizations (domains sharing a word read one token):
 *   - connection "online" reads `--color-status-ok` — the PR-1a ghost
 *     token (aliased to the accent in styles.css), not a second accent
 *     spelling; the health pill's older `--accent` online normalized onto
 *     it (value-equal through the alias).
 *   - doctor "ok" and install "ok" both read `--accent`.
 *
 * Intentional divergences — the exhaustive table (preserved, NEVER forced
 * equal; the machine-checked source is the DIVERGENCES array below and
 * tests/statusToken.test.js §e proves this table matches it row for row):
 *
 * | # | surface             | word        | domain map    | surface paints | why                                                                                  |
 * |---|---------------------|-------------|---------------|----------------|--------------------------------------------------------------------------------------|
 * | 1 | timeline strip      | running     | --color-info | --accent       | the strip speaks the PLAN's accent for its active thread; the ring's info says "engine executing" |
 * | 2 | timeline strip      | queued-gpu  | --muted-2    | --accent       | a queued SEGMENT is committed to the plan (accent); the ring's queued is a calm pre-GPU wait |
 * | 3 | timeline strip      | idle        | --text       | --muted-2     | the ring's idle is a barely-there hairline (text @14%); the strip's idle dot is a calm placeholder |
 * | 4 | health pill         | offline     | --muted-2    | --danger      | the pill's offline IS the failure it reports; the engine chip's offline is absence, not failure |
 * | 5 | tile live readout   | queued-gpu  | --muted-2    | --color-info  | the readout paints the whole active window (queued included) in the live-attention tone |
 *
 * Timeline "unseeded" is an extension word (not a TileStatus): the strip's
 * own vocabulary for a segment with no canvas object yet; it paints
 * `--muted-2` like the strip's idle.
 *
 * The tile ring stays its own component (never-shared, spec §1.3) — it
 * consumes this map like every other surface.
 */
import type { CSSProperties } from 'react'
import type { TileStatus } from '../canvas/derive'
import type { TimelineItemStatus } from '../canvas/plan'

export type ConnectionStatus = 'online' | 'degraded' | 'offline'
export type DoctorSeverity = 'ok' | 'warn' | 'fail'
export type InstallStatus = 'ok' | 'warn' | 'info' | 'muted'

/** A tone pair as custom-property names. */
export type StatusToken = { fg: string; bg: string }

/** The domain-qualified status — discriminated per domain (P11). */
export type DomainStatus =
  | { domain: 'tile'; status: TileStatus }
  | { domain: 'connection'; status: ConnectionStatus }
  | { domain: 'doctor'; status: DoctorSeverity }
  | { domain: 'install'; status: InstallStatus }

/** The pill's binary vocabulary (it has no degraded state). */
export type PillStatus = 'online' | 'offline'

/** The live readout's active window (what job phases render it). */
export type LiveReadoutStatus = 'running' | 'queued-gpu'

// ---- the domain maps (the pre-migration skins, verbatim) ------------------

/** Tile ladder — the ring's canvas.css rules, unchanged tones. */
const TILE_TOKENS: Record<TileStatus, StatusToken> = {
  idle: { fg: '--text', bg: '--text' },
  'queued-gpu': { fg: '--muted-2', bg: '--muted-2' },
  running: { fg: '--color-info', bg: '--color-info' },
  stale: { fg: '--warning', bg: '--warning' },
  failed: { fg: '--danger', bg: '--danger' },
}

/** Connection health — the engine chip/bar ladder (PR-1a's token online). */
const CONNECTION_TOKENS: Record<ConnectionStatus, StatusToken> = {
  online: { fg: '--color-status-ok', bg: '--accent-soft' },
  degraded: { fg: '--warning', bg: '--warning' },
  offline: { fg: '--muted-2', bg: '--muted-2' },
}

/** Doctor severity — the .doctor-check rules' tones. */
const DOCTOR_TOKENS: Record<DoctorSeverity, StatusToken> = {
  ok: { fg: '--accent', bg: '--accent' },
  warn: { fg: '--warning', bg: '--warning' },
  fail: { fg: '--danger', bg: '--danger' },
}

/** Install state — the node-pack chip tones (warn is deliberately sharp). */
const INSTALL_TOKENS: Record<InstallStatus, StatusToken> = {
  ok: { fg: '--accent', bg: '--accent' },
  warn: { fg: '--danger', bg: '--danger' },
  info: { fg: '--warning', bg: '--warning' },
  muted: { fg: '--muted', bg: '--muted' },
}

/** THE map. Domain-qualified in, token pair out; unknown input throws. */
export function statusToken(status: DomainStatus): StatusToken {
  switch (status.domain) {
    case 'tile': {
      const tone = TILE_TOKENS[status.status]
      if (tone) return tone
      break
    }
    case 'connection': {
      const tone = CONNECTION_TOKENS[status.status]
      if (tone) return tone
      break
    }
    case 'doctor': {
      const tone = DOCTOR_TOKENS[status.status]
      if (tone) return tone
      break
    }
    case 'install': {
      const tone = INSTALL_TOKENS[status.status]
      if (tone) return tone
      break
    }
    default:
      break
  }
  throw new Error(`statusToken: unknown ${String((status as { domain?: unknown }).domain)} status "${String((status as { status?: unknown }).status)}"`)
}

// ---- surface adapters (documented divergences only) -----------------------

/** Timeline strip adapter — the projection's own tone ladder (rows 1–3). */
export const TIMELINE_TONE: Record<TimelineItemStatus, StatusToken> = {
  idle: { fg: '--muted-2', bg: '--muted-2' },
  'queued-gpu': { fg: '--accent', bg: '--accent' },
  running: { fg: '--accent', bg: '--accent' },
  stale: TILE_TOKENS.stale,
  failed: TILE_TOKENS.failed,
  unseeded: { fg: '--muted-2', bg: '--muted-2' },
}

/** Health-pill adapter — offline is the reported failure (row 4). */
export const HEALTH_PILL_TONE: Record<PillStatus, StatusToken> = {
  online: CONNECTION_TOKENS.online,
  offline: { fg: '--danger', bg: '--danger' },
}

/** Live-readout adapter — one info tone for the whole active window (row 5). */
export const LIVE_READOUT_TONE: Record<LiveReadoutStatus, StatusToken> = {
  running: TILE_TOKENS.running,
  'queued-gpu': TILE_TOKENS.running,
}

/** One row per intentional adapter-vs-map divergence — the checked table. */
export type StatusDivergence = {
  surface: 'timeline strip' | 'health pill' | 'tile live readout'
  domain: 'tile' | 'connection'
  status: string
  mapFg: string
  surfaceFg: string
  why: string
}

export const DIVERGENCES: StatusDivergence[] = [
  {
    surface: 'timeline strip',
    domain: 'tile',
    status: 'running',
    mapFg: '--color-info',
    surfaceFg: '--accent',
    why: 'the strip speaks the plan\'s accent for its active thread; the ring\'s info says the engine is executing — two different statements.',
  },
  {
    surface: 'timeline strip',
    domain: 'tile',
    status: 'queued-gpu',
    mapFg: '--muted-2',
    surfaceFg: '--accent',
    why: 'a queued segment is committed to the plan (accent); the ring\'s queued is the calm pre-GPU wait.',
  },
  {
    surface: 'timeline strip',
    domain: 'tile',
    status: 'idle',
    mapFg: '--text',
    surfaceFg: '--muted-2',
    why: 'the ring\'s idle is a barely-there hairline (text at 14%); the strip\'s idle dot is a calm placeholder.',
  },
  {
    surface: 'health pill',
    domain: 'connection',
    status: 'offline',
    mapFg: '--muted-2',
    surfaceFg: '--danger',
    why: 'the pill\'s offline IS the failure it reports (danger); the engine chip\'s offline is absence, not failure (muted-2).',
  },
  {
    surface: 'tile live readout',
    domain: 'tile',
    status: 'queued-gpu',
    mapFg: '--muted-2',
    surfaceFg: '--color-info',
    why: 'the readout paints the whole active window — queued included — in the live-attention info tone; the ring distinguishes the wait.',
  },
]

// ---- custom-property bridges ----------------------------------------------
//
// Each helper returns the inline style a surface spreads onto the element
// that owns its tone scope; the CSS keeps every ratio/geometry rule and
// consumes the bridged property. No literal colors ever appear here.

function toneVar(name: string, token: string): CSSProperties {
  const style: Record<string, string> = {}
  style[name] = `var(${token})`
  return style as CSSProperties
}

/** The status ring / progress / failure block scope (`.canvas-tile-media`
 *  or a bare ring span in the bar + inspector). */
export function tileToneVars(status: TileStatus): CSSProperties {
  return toneVar('--tile-tone', statusToken({ domain: 'tile', status }).fg)
}

/** The generating tile's live readout (job phases, not tile statuses). */
export function liveReadoutVars(jobStatus: 'running' | 'queued'): CSSProperties {
  const status: LiveReadoutStatus = jobStatus === 'running' ? 'running' : 'queued-gpu'
  return toneVar('--live-tone', LIVE_READOUT_TONE[status].fg)
}

/** The engine chip + bar scope (Radar chip, BottomBar engine chip). */
export function engineToneVars(status: ConnectionStatus): CSSProperties {
  return toneVar('--engine-tone', statusToken({ domain: 'connection', status }).fg)
}

/** The health pill (drives fg always; bg on the online recipe rule). */
export function healthPillVars(status: PillStatus): CSSProperties {
  const tone = HEALTH_PILL_TONE[status]
  const style: Record<string, string> = {}
  style['--pill-fg'] = `var(${tone.fg})`
  style['--pill-bg'] = `var(${tone.bg})`
  return style as CSSProperties
}

/** A doctor-check row (the icon span's tone). */
export function doctorCheckVars(severity: DoctorSeverity): CSSProperties {
  return toneVar('--check-fg', statusToken({ domain: 'doctor', status: severity }).fg)
}

/** A node-pack row's two install tones: the status chip + the license badge. */
export function nodePackRowVars(chip: InstallStatus, license: InstallStatus): CSSProperties {
  const style: Record<string, string> = {}
  style['--pack-fg'] = `var(${statusToken({ domain: 'install', status: chip }).fg})`
  style['--license-fg'] = `var(${statusToken({ domain: 'install', status: license }).fg})`
  return style as CSSProperties
}
