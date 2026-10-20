/**
 * The launcher-config seam (wizard rework task 7, spec §2.4, W-I1) —
 * isolated from core.ts on purpose: a Settings-scale seam any surface may
 * use. The launcher's `.start-config.json` is the walk's SECOND store, never
 * app settings (W-I1/W-M3): writes here are READ-MODIFY-WRITE with the
 * launcher's own `--set` semantics — every pre-existing key survives
 * verbatim (including keys this module does not know), validation mirrors
 * the launcher's own rules, and a MISSING file is an honest refusal, never
 * a seed (the launcher seeds on ITS first run; a wizard write must not
 * invent one).
 *
 * The rest of the walk's posture truths live here too: the host+port bind
 * probe (generalized from runtime.ts's port probe), the env-override read
 * (the launcher exported MONOKA_LAN_* at boot — the server can read that
 * truth and SAY when the file it just wrote will lose to it), and the
 * loopback-peer test that gates the token routes (plan ruling 2: with
 * enforcement off by default, any LAN peer could otherwise read or rotate
 * the token; the wizard runs on the host machine — loopback works, the LAN
 * does not).
 */
import { createServer as createTcpServer } from 'node:net'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The keys a walk/Surface may write — the launcher's posture keys. The
 *  launcher's remaining keys (dataDir, engineUrl, logLevel, …) are RMW-
 *  preserved on every write but never written from here. */
export type LauncherConfigPatch = {
  port?: number
  host?: string
  https?: boolean
  token?: boolean
  qrPrint?: boolean
}

/** The launcher config as read: the posture keys typed, every launcher key
 *  (and anything else the file carries) preserved as-is. */
export type LauncherConfigRead = {
  port?: number
  host?: string
  https?: boolean
  token?: boolean
  qrPrint?: boolean
  [key: string]: unknown
}

/** The typed refusals the routes translate into honest answers. `missing`
 *  is the no-file case (never a seed), `invalid` a bad file or bad keys,
 *  `unwritable` a failed write. */
export class LauncherConfigError extends Error {
  code: 'missing' | 'invalid' | 'unwritable'

  constructor(code: 'missing' | 'invalid' | 'unwritable', message: string) {
    super(message)
    this.code = code
    this.name = 'LauncherConfigError'
  }
}

const LAUNCHER_CONFIG_NAME = '.start-config.json'

/** Where the launcher config lives: `MONOKA_START_CONFIG` wins verbatim when
 *  set (pointing it nowhere is legitimate — the routes refuse honestly on
 *  the missing file), else the repo root, found by walking up from this
 *  module's build output (dist-server/server → repo root, the same walk
 *  engineNodes.ts does) with start.sh as the marker — the config file
 *  itself cannot be the marker, because its absence is exactly the case
 *  this resolution must still answer for. Null when no repo context exists
 *  (a packaged build without start.sh) — the routes refuse honestly. */
export function resolveLauncherConfigPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const override = env.MONOKA_START_CONFIG
  if (typeof override === 'string' && override.trim()) return override
  let directory = __dirname
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(directory, 'start.sh'))) return join(directory, LAUNCHER_CONFIG_NAME)
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return null
}

/** Read the launcher config raw. Throws LauncherConfigError('missing') when
 *  the file is absent — the caller refuses, never seeds. */
export function readLauncherConfig(filePath: string): LauncherConfigRead {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    throw new LauncherConfigError(
      'missing',
      code === 'ENOENT'
        ? 'No launcher config exists yet — the launcher seeds it on its first run; this write refuses rather than invent one.'
        : `The launcher config could not be read (${code ?? 'unknown error'}).`,
    )
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    return parsed as LauncherConfigRead
  } catch {
    throw new LauncherConfigError('invalid', 'The launcher config is not valid JSON — repair it with start.sh --set (see start.sh) before writing keys.')
  }
}

/** The launcher's own validation rules, mirrored (start.sh): port integer
 *  1024–65535, host a plain hostname/IP, the booleans boolean. Returns the
 *  problem strings; empty means the patch validates. */
export function validateLauncherKeys(keys: LauncherConfigPatch): string[] {
  const problems: string[] = []
  if (keys.port !== undefined && (typeof keys.port !== 'number' || !Number.isInteger(keys.port) || keys.port < 1024 || keys.port > 65535)) {
    problems.push('port must be an integer between 1024 and 65535')
  }
  if (keys.host !== undefined && !/^[A-Za-z0-9._:-]{1,255}$/.test(keys.host)) {
    problems.push('host must be a plain hostname or IP (letters, digits, dots, dashes, underscores, colons)')
  }
  for (const key of ['https', 'token', 'qrPrint'] as const) {
    if (keys[key] !== undefined && typeof keys[key] !== 'boolean') {
      problems.push(`${key} must be true or false`)
    }
  }
  return problems
}

/** READ-MODIFY-WRITE (the launcher's `--set` semantics): every pre-existing
 *  key survives verbatim — known launcher keys, and anything else the file
 *  carries. Only the provided patch keys change. A missing file throws
 *  LauncherConfigError('missing') — the honest refusal, never a seed. */
export function writeLauncherConfig(filePath: string, keys: LauncherConfigPatch): { written: string[]; config: LauncherConfigRead } {
  const current = readLauncherConfig(filePath)
  const problems = validateLauncherKeys(keys)
  if (problems.length > 0) throw new LauncherConfigError('invalid', problems.join('; '))
  const patch = keys as Record<string, unknown>
  const written = Object.keys(patch).filter((key) => patch[key] !== undefined)
  const merged: Record<string, unknown> = { ...current }
  for (const key of written) merged[key] = patch[key]
  try {
    writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    throw new LauncherConfigError('unwritable', `The launcher config could not be written (${code ?? 'unknown error'}).`)
  }
  return { written, config: merged as LauncherConfigRead }
}

/** The bind probe, generalized from runtime.ts's port probe to host+port:
 *  listen on the exact address; an error settles not-claimable with the
 *  bind error's code (EADDRINUSE and friends), success settles claimable.
 *  The listener always closes. */
export function probeBind(host: string, port: number): Promise<{ claimable: boolean; reason?: string }> {
  return new Promise((resolveProbe) => {
    const probe = createTcpServer()
    const settle = (claimable: boolean, reason?: string) => {
      probe.close(() => undefined)
      resolveProbe(claimable ? { claimable: true } : { claimable: false, reason })
    }
    probe.once('error', (error) => {
      const code = (error as NodeJS.ErrnoException).code
      settle(false, code ?? String(error))
    })
    probe.listen(port, host, () => settle(true))
  })
}

/** The launcher env keys the walk's copy names (W-I1's honesty): when any of
 *  these is set in the server's own process env, the launcher exported it at
 *  boot and it WINS over the config file at the next boot — a wizard write
 *  of that key lands in the file and loses at boot, so the confirmation
 *  says so. Only non-empty values count (an empty var is not an override). */
const LAUNCHER_ENV_KEYS = ['MONOKA_LAN_PORT', 'MONOKA_LAN_HOST', 'MONOKA_LAN_TOKEN'] as const

export function launcherEnvOverrides(env: NodeJS.ProcessEnv = process.env): string[] {
  return LAUNCHER_ENV_KEYS.filter((key) => typeof env[key] === 'string' && env[key].length > 0)
}

/** The token-route gate (plan ruling 2): loopback peers pass — the wizard
 *  runs on the host machine — and every LAN address, IPv4-mapped form, and
 *  unknown/absent peer fails. 127/8 whole is loopback (::1 and the
 *  ::ffff:-mapped forms included); nothing else is. */
export function isLoopbackPeer(remoteAddress: string | null | undefined): boolean {
  if (!remoteAddress) return false
  const address = remoteAddress.toLowerCase()
  if (address === '::1') return true
  if (address.startsWith('127.')) return true
  if (address.startsWith('::ffff:127.')) return true
  return false
}
