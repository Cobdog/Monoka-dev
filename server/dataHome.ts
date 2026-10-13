/** The one-time data-home move (rename-sweep T2, 2026-10-12): the app's data
 *  home moved `~/.minimax-studio` → `~/.monoka` with ZERO back-compat. The
 *  move is a single rename(2) on the same filesystem — it either happens
 *  whole or not at all, so a crash mid-move is structurally impossible.
 *
 *  Ruling R5: when the target already exists while the legacy home is still
 *  present, the boot REFUSES LOUDLY naming both paths — never merge, never
 *  overwrite; resolution is a manual act. A fresh install (no legacy home)
 *  and an explicit custom home (MONOKA_HOME pointed anywhere other than the
 *  default) move nothing: the operator's path stands.
 *
 *  Standalone module (no server imports) so the rename suite can drive it
 *  against scratch homes without booting the server. */

import { existsSync, renameSync } from 'node:fs'

export type DataHomeMoveInput = {
  /** The home this boot will use (env-resolved, may be the default). */
  home: string
  /** The default home (~/.monoka) — the move engages only when `home` equals it. */
  defaultHome: string
  /** The legacy default home (~/.minimax-studio) — what moves. */
  legacyHome: string
  /** Injectable for tests; defaults to the real rename(2). */
  rename?: (from: string, to: string) => void
}

function refusal(legacyHome: string, home: string, why: string): Error {
  return new Error(
    `Monoka: refusing to start — the one-time data-home move cannot happen (${why}).\n` +
    `  legacy home: ${legacyHome}\n` +
    `  target home: ${home}\n` +
    `The move never merges or overwrites: resolve the two directories manually ` +
    `(remove, rename, or merge by hand), then start again.`,
  )
}

/** Performs the one-time move when it applies; a refusal throws (the boot
 *  boundary prints it and exits non-zero — no start, no merge). */
export function moveDataHome({ home, defaultHome, legacyHome, rename = renameSync }: DataHomeMoveInput): void {
  if (home !== defaultHome) return // explicit MONOKA_HOME: the operator's path stands
  if (!existsSync(legacyHome)) return // fresh install, or the move already happened
  if (existsSync(home)) throw refusal(legacyHome, home, 'the target already exists')
  try {
    rename(legacyHome, home)
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as NodeJS.ErrnoException).code) : 'unknown error'
    throw refusal(legacyHome, home, `rename failed: ${code}`)
  }
  console.log(`Monoka: data home moved (one-time): ${legacyHome} -> ${home}`)
}
