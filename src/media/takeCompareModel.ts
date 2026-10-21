/**
 * The side-by-side take comparison's pure model (foelihc T6, spec §6.1 —
 * D3's blessed cutline) — the ONE shared clock as pure logic: the command
 * fan-out (one transport transaction, both panes), THE HOLD RULE (the
 * shorter pane holds its last frame while the clock runs on; with loop ON
 * the hold governs across the wrap — audit T-M2: no pane ever runs its own
 * clock), the clock master, the focus contract (U reads the FOCUSED
 * pane's clock), and the aspect split rule. ONE VM-testable spine in the
 * wave's discipline: src/media/TakeCompare.tsx is a thin shell over this
 * module (the repo has no React-executing unit harness —
 * tests/takecompare.test.js pins these contracts through the VM harness,
 * typecheck + scoped lint cover the shell, and the journey e2e lane owns
 * the rendered behavior).
 *
 * The transport itself is NOT re-built here: the shared clock drives both
 * panes through T2's own command seam — takeViewerModel's TransportState
 * and transportCommand intents, applied per pane by the fan-out below.
 *
 * CANVAS-AGNOSTIC by D2's letter: media math and the viewer's own model,
 * never src/canvas (the candidates walk lives canvas-side in
 * takeViewerOverlayModel.ts, over derive.ts).
 */
import { SPEED_STEPS, frameHandoff, initialTransport, type TransportCommand, type TransportState } from './takeViewerModel'
import { clampToFrames, frameCountFromDuration, frameIndexFromTime, timecodeLabel } from './takeMath'

export { SPEED_STEPS, initialTransport }

// ------------------------------------------------------ the pane clock facts

/** The pane facts the pure clock decisions read (the shell's richer view
 *  shape — sources, meta, strip — projects onto this). */
export type ComparePaneClock = { id: string; title: string; duration: number }

/** One pane's slice of a shared transport command — everything its element
 *  needs, nothing more. `loop` is FALSE at the element by construction
 *  (T-M2): the wrap is the shared clock's decision (wrapCommand), never a
 *  pane's own — a looping element would run its own clock. */
export type PaneCommand = {
  id: string
  playing: boolean
  muted: boolean
  playbackRate: number
  loop: false
  seekTo: number | null
}

// ------------------------------------------------------------- the hold rule

/** The time a pane DISPLAYS at a clock position: the clock itself while
 *  the clock is inside the pane's span, the pane's own duration once the
 *  clock runs past it (the pane HOLDS its last frame — spec §6.1: "the
 *  clock is the truth, not a pretense of sync"). Degenerate durations
 *  (unprobed) and NaN clocks answer 0, never NaN. */
export function paneDisplayTime(clockTime: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  if (!Number.isFinite(clockTime) || clockTime <= 0) return 0
  return Math.min(clockTime, duration)
}

/** Whether a pane is HOLDING at a clock position — the on-strip note's
 *  predicate. Strictly PAST the end (AT the duration is the end itself,
 *  not yet a hold); unprobed durations never hold. */
export function paneHolds(clockTime: number, duration: number): boolean {
  return Number.isFinite(duration) && duration > 0 && Number.isFinite(clockTime) && clockTime > duration
}

/** The on-strip hold note, byte-exact per spec §6.1's own sentence
 *  ("take 2 ended — holding its last frame") — the pane's title (a take's
 *  ladder name, or a chain pane's chain title) in the one template. */
export function holdNote(title: string): string {
  return `${title} ended — holding its last frame`
}

// ------------------------------------------------------------ the clock rule

/** Which pane's own timeline IS the clock: the LONGEST duration — the
 *  playhead must keep moving after every shorter pane has ended. Ties go
 *  to the first pane (the watched take — deterministic). */
export function clockMasterId(panes: ComparePaneClock[]): string | null {
  let master: ComparePaneClock | null = null
  for (const pane of panes) {
    if (!master || pane.duration > master.duration) master = pane
  }
  return master?.id ?? null
}

/** The audio rule (§6.1 leaves mute unowned; this fills it honestly): the
 *  FOCUSED pane's sound follows the shared mute state; the other pane is
 *  always muted — two playing videos under one soundscape would be a
 *  lie. */
export function paneMuted(state: TransportState, isFocused: boolean): boolean {
  return isFocused ? state.muted : true
}

/** ONE shared transport command fanned out to every pane: the seek rides
 *  the hold lens (each pane lands at min(seek, its own duration)), and a
 *  pane PAST its own end never receives play() — the element would seek
 *  back to 0 on its own (T-M2). A command carrying a seek uses the seek
 *  as the effective clock (the seek IS the new clock position). */
export function fanOutCommand(command: TransportCommand, panes: ComparePaneClock[], focusId: string | null, clockTime: number): PaneCommand[] {
  const effectiveClock = command.seekTo !== null ? command.seekTo : clockTime
  return panes.map((pane) => ({
    id: pane.id,
    playing: command.state.playing && !paneHolds(effectiveClock, pane.duration),
    muted: paneMuted(command.state, pane.id === focusId),
    playbackRate: SPEED_STEPS[command.state.speedIndex],
    loop: false as const,
    seekTo: command.seekTo !== null ? paneDisplayTime(command.seekTo, pane.duration) : null,
  }))
}

/** The clock master's 'ended' decision: with loop ON the clock WRAPS —
 *  seek both panes to 0 and keep playing (the shorter pane RE-JOINS when
 *  the clock comes back under its duration); with loop OFF the clock
 *  stops at the master's end. */
export function wrapCommand(state: TransportState): TransportCommand {
  if (state.loop) return { state: { ...state, playing: true }, seekTo: 0 }
  return { state: { ...state, playing: false }, seekTo: null }
}

// ------------------------------------------------------------ the focus rule

/** Focus starts on pane A — the watched take (the compare question is
 *  "which one do I keep chaining from"; the answer starts on the take the
 *  viewer was already watching). Structural in the ids only, so the shell
 *  passes its richer pane views directly. */
export function initialFocusId(panes: Array<{ id: string }>): string | null {
  return panes.length > 0 ? panes[0].id : null
}

/** The focused pane, with pane A as the honest fallback — a stale focus
 *  id never blanks the U path mid-compare. */
export function focusedPane(panes: ComparePaneClock[], focusId: string | null): ComparePaneClock | null {
  for (const pane of panes) {
    if (pane.id === focusId) return pane
  }
  return panes.length > 0 ? panes[0] : null
}

/** §4's handoff in compare (§6.1: "Use this frame applies to the focused
 *  pane"): the SAME combined transaction (pause-only command + the ROUND
 *  pick lens, T5's model, never re-derived) computed from the FOCUSED
 *  pane's clock — the held pane reads through the hold lens, so the
 *  anchor is its own last frame, never the other pane's grid. */
export function compareUseFrame(state: TransportState, clockTime: number, focusedDuration: number): { command: TransportCommand; frameIndex: number } {
  return frameHandoff(state, paneDisplayTime(clockTime, focusedDuration), frameCountFromDuration(focusedDuration))
}

/** The transport's timecode on the FOCUSED pane's frame grid — the number
 *  the U anchor will name (§3's S.FF · frame n of N shape). */
export function paneTimecode(clockTime: number, duration: number): string {
  const frameCount = frameCountFromDuration(duration)
  const frame = clampToFrames(frameIndexFromTime(paneDisplayTime(clockTime, duration)), frameCount)
  return timecodeLabel(frame, frameCount)
}

// ------------------------------------------------------------ the split rule

/** The split direction (spec §6.1: "side-by-side; stacked for portrait
 *  aspects"). The rule, stated: the FOCUSED pane's media aspect decides —
 *  portrait media (height > width) STACKS the panes vertically so each
 *  pane gets the tall box portrait video needs; landscape and UNPROBED
 *  metrics go side-by-side (the default posture — a layout must never
 *  flip on missing metadata). */
export type CompareLayout = 'side-by-side' | 'stacked'

export function compareLayout(focused: { width: number; height: number }): CompareLayout {
  const width = Number.isFinite(focused.width) ? focused.width : 0
  const height = Number.isFinite(focused.height) ? focused.height : 0
  return width > 0 && height > width ? 'stacked' : 'side-by-side'
}
