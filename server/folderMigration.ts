/** The one-time folder move (rename-sweep T3, 2026-10-12): the app-owned
 *  folders that carry the product's OLD name on existing installs rename(2)
 *  to the monoka names — the engine input tree's upload subfolders and the
 *  output directory's display folders. Zero back-compat (ruling R6): the
 *  code now writes ONLY the new names, so the move is the data following
 *  forward, exactly like the T2 data-home move it mirrors.
 *
 *  The move is IDLE-SAFE (plan review focus 3): a queued or running
 *  generation job may reference the legacy input subfolders, so a busy job
 *  queue defers the whole move to the next idle boot — nothing renames
 *  mid-queue and no marker is written. When it runs, each move is a single
 *  rename(2) on the same filesystem (atomic — no half-copied tree), the
 *  collision scan runs BEFORE the first rename (a refused boot moves
 *  nothing), and a dated marker records completion so the decision is
 *  settled once and never revisited.
 *
 *  Ruling R5's shape for collisions: legacy AND target both present is an
 *  ambiguity no code may resolve on the user's behalf — refuse loudly naming
 *  both paths; resolution is a manual act.
 *
 *  Standalone module (no server imports) so the rename suite can drive it
 *  against scratch trees without booting the server. */

import { existsSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** The engine input tree's upload subfolders (ComfyUI <checkout>/input/...).
 *  The db values referencing them were rewritten by migration 009; this move
 *  makes the disk agree. */
export const ENGINE_INPUT_FOLDER_MOVES: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'minimax-desktop', to: 'monoka-desktop' },
  { from: 'minimax-mobile', to: 'monoka-mobile' },
  { from: 'minimax-mobile-references', to: 'monoka-mobile-references' },
]

/** The output directory's display folders the studio itself creates. */
export const OUTPUT_DISPLAY_FOLDER_MOVES: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'MiniMax Studio Frames', to: 'Monoka Studio Frames' },
  { from: 'MiniMax Studio Reference Clips', to: 'Monoka Studio Reference Clips' },
  { from: 'MiniMax Character References', to: 'Monoka Character References' },
]

export type FolderMove = { from: string; to: string }
export type FolderMoveStatus = 'moved' | 'idle-deferred' | 'already-done' | 'nothing-to-do'
export type FolderMoveResult = { status: FolderMoveStatus; moved: FolderMove[]; activeJobs?: number }

export type FolderMoveInput = {
  /** The configured output directory (the display folders' root). */
  outputDirectory: string
  /** The nominated engine checkout, when known — its input tree hosts the
   *  upload subfolders. Empty or without an input tree: that arm skips. */
  engineCheckoutPath: string
  /** The completion marker (in the studio home). Present ⇒ already done. */
  markerFile: string
  /** Jobs with status queued|running — the idle check. */
  activeJobs: number
  /** Injectable for tests; defaults to the real rename(2). */
  rename?: (from: string, to: string) => void
  /** Injectable for tests; defaults to Date.now. */
  now?: () => number
}

function refusal(from: string, to: string): Error {
  return new Error(
    `Monoka: refusing to start — the one-time folder move found BOTH the legacy and the new folder.\n` +
    `  legacy folder: ${from}\n` +
    `  target folder: ${to}\n` +
    `The move never merges or overwrites: resolve the two directories manually ` +
    `(remove, rename, or merge by hand), then start again.`,
  )
}

function moveFailure(from: string, to: string, error: unknown): Error {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as NodeJS.ErrnoException).code) : 'unknown error'
  return new Error(
    `Monoka: the one-time folder move failed (${code}).\n` +
    `  from: ${from}\n` +
    `  to:   ${to}\n` +
    `Nothing was migrated past this point; resolve the failure and start again.`,
  )
}

/** Performs the one-time move when it applies. A collision refusal throws
 *  (the boot boundary prints it and refuses to start — no merge, no
 *  overwrite); a busy queue defers silently-but-visibly (the caller logs the
 *  result) and the next idle boot retries. */
export function migrateStudioFolders({ outputDirectory, engineCheckoutPath, markerFile, activeJobs, rename = renameSync, now = Date.now }: FolderMoveInput): FolderMoveResult {
  if (existsSync(markerFile)) return { status: 'already-done', moved: [] }
  if (activeJobs > 0) return { status: 'idle-deferred', moved: [], activeJobs }

  const roots: Array<{ root: string; moves: typeof ENGINE_INPUT_FOLDER_MOVES }> = [
    { root: resolve(outputDirectory), moves: OUTPUT_DISPLAY_FOLDER_MOVES },
  ]
  const checkout = engineCheckoutPath.trim()
  const engineInputRoot = checkout ? resolve(checkout, 'input') : ''
  if (engineInputRoot && existsSync(engineInputRoot)) roots.push({ root: engineInputRoot, moves: ENGINE_INPUT_FOLDER_MOVES })

  // Collect the concrete moves, refusing on ANY collision before the FIRST
  // rename — a refused boot leaves the tree exactly as it found it.
  const planned: FolderMove[] = []
  for (const { root, moves } of roots) {
    for (const move of moves) {
      const from = resolve(root, move.from)
      const to = resolve(root, move.to)
      if (!existsSync(from)) continue
      if (existsSync(to)) throw refusal(from, to)
      planned.push({ from, to })
    }
  }
  for (const { from, to } of planned) {
    try {
      rename(from, to)
    } catch (error) {
      throw moveFailure(from, to, error)
    }
  }
  // The marker settles the decision even when nothing needed moving (a
  // fresh install) — one-time means one-time, not re-checked forever.
  writeFileSync(markerFile, `${JSON.stringify({ completedAt: new Date(now()).toISOString(), moves: planned }, null, 2)}\n`)
  return { status: planned.length > 0 ? 'moved' : 'nothing-to-do', moved: planned }
}
