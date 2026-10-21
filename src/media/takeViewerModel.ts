/**
 * The take viewer's pure model (foelihc T2) — the transport state machine,
 * the scoped keymap, the source-fallback selection, the surface gates, and
 * the stage's zoom/pan math as ONE VM-testable spine. The wizardWalk shape:
 * src/media/TakeViewerCore.tsx is a thin shell over this module (the repo
 * has no React-executing unit harness — tests/takeviewer.test.js pins these
 * contracts through the VM harness, typecheck + scoped lint cover the shell,
 * and the journey e2e lane owns the rendered behavior).
 *
 * Spec: docs/specs/2026-10-17-take-viewer.md §2 (the stage + the honest
 * states) and §3 (the transport table + the viewer-scoped keyboard map).
 *
 * CANVAS-AGNOSTIC by D2's letter: this module and the shell import media
 * math, the UI kit's pure disciplines, and the failure taxonomy — never
 * src/canvas.
 */
import { FILMSTRIP_FPS, clampToFrames, frameIndexFromTime, positionFromFrame } from './takeMath'
import { FAILURE_BUCKETS } from '../lib/failureTaxonomy'
import { isChromeChord, isTypingTarget } from '../ui/overlayBehavior'

export { FILMSTRIP_FPS }

// ---------------------------------------------------------- the honest words

/** The missing-file state's words are the failure taxonomy's OWN
 *  output-missing entry (the closed vocabulary in src/lib/failureTaxonomy.ts)
 *  — reused verbatim, never re-coined here (spec §2: "the failure
 *  vocabulary's words, never a spinner"). */
export const MISSING_FILE_TITLE: string = FAILURE_BUCKETS['output-missing'].label
export const MISSING_FILE_BODY: string = FAILURE_BUCKETS['output-missing'].cause

// ------------------------------------------------- the source fallback order

/** One candidate media source, in the caller's fallback order: the
 *  content-addressed blob first, the engine-side media route second. */
export type ViewerMediaSource = { kind: 'blob' | 'route'; url: string }

export type MediaResolution = {
  state: 'present' | 'missing'
  /** The index of the live candidate (one past the last on missing). */
  index: number
  source: ViewerMediaSource | null
}

/** The initial selection: the first candidate, or the honest missing state
 *  when the list is empty (never a spinner). */
export function initialMediaResolution(sources: ViewerMediaSource[]): MediaResolution {
  if (sources.length > 0) return { state: 'present', index: 0, source: sources[0] }
  return { state: 'missing', index: 0, source: null }
}

/** A load error advances the fallback: the next candidate, or the missing
 *  state once the list is exhausted. */
export function mediaResolutionAfterError(sources: ViewerMediaSource[], current: number): MediaResolution {
  const next = current + 1
  if (next >= 0 && next < sources.length) return { state: 'present', index: next, source: sources[next] }
  return { state: 'missing', index: next, source: null }
}

// ------------------------------------------------------------ the surface gates

export type ViewerKind = 'video' | 'image'

export type ViewerSurface = {
  /** A landing-errored take renders its humanized verdict and NOTHING else. */
  verdictOnly: boolean
  /** No resolvable source renders the honest missing-file state. */
  missing: boolean
  /** The letterboxed stage (media + zoom/pan) renders. */
  stage: boolean
  /** The transport row renders (video takes only — a still has nothing to
   *  scrub; a disabled transport would be the dishonest shape, spec §2). */
  transport: boolean
}

/** Which surfaces a take renders, in precedence order: the landing verdict
 *  wins over everything, missing media gates the stage, and the transport
 *  is video-only. */
export function viewerSurface(input: { kind: ViewerKind; landingError: string | null; media: 'present' | 'missing' }): ViewerSurface {
  if (input.landingError) return { verdictOnly: true, missing: false, stage: false, transport: false }
  if (input.media === 'missing') return { verdictOnly: false, missing: true, stage: false, transport: false }
  if (input.kind === 'image') return { verdictOnly: false, missing: false, stage: true, transport: false }
  return { verdictOnly: false, missing: false, stage: true, transport: true }
}

/** Whether a keymap action does anything on this surface: transport actions
 *  need the transport, `use-frame` needs the stage (an image take is one
 *  pickable frame — T5 owns the handler). */
export function actionEnabled(action: string, surface: ViewerSurface): boolean {
  if (action === 'use-frame') return surface.stage
  return surface.transport
}

// ------------------------------------------------------ the transport machine

/** The four blessed speed steps, in cycle order (spec §3). */
export const SPEED_STEPS = [0.25, 0.5, 1, 2]

export type TransportState = {
  playing: boolean
  loop: boolean
  muted: boolean
  speedIndex: number
}

/** The §3 defaults: the autoplay review posture (muted is what makes it
 *  autoplay-safe — the audio check is deliberate), loop ON ("watch it
 *  again" is the norm), 1×. */
export function initialTransport(): TransportState {
  return { playing: true, loop: true, muted: true, speedIndex: 2 }
}

/** The frame whose span CONTAINS a playhead position — the step lens. This
 *  is floor, deliberately NOT T1's round: round is the PICK anchor (the
 *  nearest frame, "use this frame"), floor is the frame ON SCREEN (the one
 *  a step must not skip past). Both lens the same 24 fps convention. The
 *  boundary epsilon rides INSIDE the floor too (foelihc T7): a real
 *  container's frame timestamps sit a hair BELOW the model's n/24 doubles
 *  (measured: the mirror clip's frame-71 timestamp reads 2.9583332 <
 *  71/24), so a bare floor framed them one low and → re-sought the same
 *  frame — the forward twin of the stuck-press trap. A playhead within the
 *  slack of a boundary is ON that boundary's frame. */
function containingFrame(currentTime: number, frameCount: number): number {
  if (!Number.isFinite(currentTime) || currentTime <= 0) return 0
  return clampToFrames(Math.floor((currentTime + STEP_BOUNDARY_EPSILON_SECONDS) * FILMSTRIP_FPS), frameCount)
}

/** The boundary rule's alignment epsilon (foelihc T7, the e2e's find): a
 *  REAL element reports its frame timestamps a hair off the model's n/24
 *  doubles — the container's rational timestamps plus the media clock's
 *  tick quantization (measured on the mirror's committed clip: the element
 *  reads frame 71 as a value fractionally BELOW 71/24, so a bare floor
 *  framed it one low and → re-sought the same frame; a bare `>` in the
 *  backward rule is the mirror trap). The slack sits BETWEEN the noise
 *  (µs-class) and a measurable drift (the suite's "just below" pin is
 *  0.1 ms — still a real drift at 50 µs), 800× under one frame. */
export const STEP_BOUNDARY_EPSILON_SECONDS = 0.00005

/** One frame-step's seek target (spec §3): the EXACT boundary n/24, never a
 *  fractional drift. The boundary rule: a playhead drifted past its frame's
 *  start first lands THERE (← from a reading-3.5 s-but-drifted playhead
 *  lands 84/24 exactly); once aligned, each press moves one frame. */
export function frameStepTarget(currentTime: number, frameCount: number, direction: -1 | 1): number {
  const frame = containingFrame(currentTime, frameCount)
  if (direction < 0) {
    const boundary = positionFromFrame(frame)
    if (currentTime > boundary + STEP_BOUNDARY_EPSILON_SECONDS) return boundary
    return positionFromFrame(clampToFrames(frame - 1, frameCount))
  }
  return positionFromFrame(clampToFrames(frame + 1, frameCount))
}

/** Shift+arrow target: one second (FILMSTRIP_FPS frames) each way. */
export function coarseStepTarget(currentTime: number, frameCount: number, direction: -1 | 1): number {
  const frame = containingFrame(currentTime, frameCount)
  return positionFromFrame(clampToFrames(frame + direction * FILMSTRIP_FPS, frameCount))
}

/** Home/End target: frame 0 / frame N−1 (T-M1: never N of N). */
export function endStepTarget(frameCount: number, which: 'first' | 'last'): number {
  return positionFromFrame(which === 'first' ? 0 : clampToFrames(frameCount - 1, frameCount))
}

export type TransportIntent =
  | { type: 'toggle-play' }
  /** The pause-ONLY intent (foelihc T4, the I-1 fix): pause and nothing
   *  else — idempotent (pausing while paused holds), never a seek. Every
   *  pause-shaped gesture dispatches THIS, never toggle-play: the use-frame
   *  handoff (§4 — U while paused must never resume) and the strip's
   *  scrub-start (§5). Resume is reachable only through toggle-play. */
  | { type: 'pause' }
  /** A bare seek (the strip's continuous scrub, §5): moves the playhead and
   *  NOTHING else — playing is never touched. A scrub press is pause + seek
   *  as SEPARATE transactions; the release's resume decision belongs to the
   *  drag's own wasPlaying fact, never to the seek. */
  | { type: 'seek'; time: number }
  | { type: 'step'; direction: -1 | 1; coarse: boolean; currentTime: number; frameCount: number }
  | { type: 'seek-end'; which: 'first' | 'last'; frameCount: number }
  | { type: 'toggle-loop' }
  | { type: 'toggle-mute' }
  | { type: 'cycle-speed' }

/** One transport transaction's full output: the next reactive state plus
 *  the exact seek it implies (null = no seek). The step family — frame
 *  steps, coarse steps, Home/End — PAUSES FIRST, then seeks the boundary
 *  (spec §3); the toggles never seek. */
export type TransportCommand = { state: TransportState; seekTo: number | null }

export function transportCommand(state: TransportState, intent: TransportIntent): TransportCommand {
  if (intent.type === 'toggle-play') {
    return { state: { ...state, playing: !state.playing }, seekTo: null }
  }
  if (intent.type === 'pause') {
    return { state: { ...state, playing: false }, seekTo: null }
  }
  if (intent.type === 'seek') {
    return { state, seekTo: intent.time }
  }
  if (intent.type === 'step') {
    const seekTo = intent.coarse
      ? coarseStepTarget(intent.currentTime, intent.frameCount, intent.direction)
      : frameStepTarget(intent.currentTime, intent.frameCount, intent.direction)
    return { state: { ...state, playing: false }, seekTo }
  }
  if (intent.type === 'seek-end') {
    return { state: { ...state, playing: false }, seekTo: endStepTarget(intent.frameCount, intent.which) }
  }
  if (intent.type === 'toggle-loop') return { state: { ...state, loop: !state.loop }, seekTo: null }
  if (intent.type === 'toggle-mute') return { state: { ...state, muted: !state.muted }, seekTo: null }
  return { state: { ...state, speedIndex: (state.speedIndex + 1) % SPEED_STEPS.length }, seekTo: null }
}

/** §4's "use this frame" transaction (foelihc T5): ONE decision covering
 *  both halves of the handoff — the pause-first command (the pause-ONLY
 *  intent: U while paused holds, never resumes — the T4/I-1 fix) and the
 *  clamped frame anchor handed up. The PICK lens is ROUND (the spec §4
 *  literal, round(currentTime × 24) — the NEAREST frame), deliberately NOT
 *  the step lens's floor (containingFrame — the frame whose span CONTAINS
 *  the playhead): picking answers "which frame is nearest what I see",
 *  stepping answers "which frame am I inside"; each lens breaks the other's
 *  contract if unified (the T2-review ruling). (Pure model fn — NOT a hook,
 *  despite the gesture's name.) */
export function frameHandoff(state: TransportState, currentTime: number, frameCount: number): { command: TransportCommand; frameIndex: number } {
  return {
    command: transportCommand(state, { type: 'pause' }),
    frameIndex: clampToFrames(frameIndexFromTime(currentTime), frameCount),
  }
}

// ------------------------------------------------- the strip's resolved inputs

/** T3-review M-1: the strip's preview path, resolved against the take's OWN
 *  duration. The duration is maybe-metadata — unprobed takes carry 0 (or
 *  NaN), the filmstrip loader never fetches for duration <= 0, and the
 *  route samples duration×24 frames — so an unresolved duration can never
 *  grow a sheet. It must read as sheet-IMPOSSIBLE (the plain honest state),
 *  never a second door into forever-generating. */
export function stripPreviewPath(previewPath: string | null, duration: number): string | null {
  if (!previewPath) return null
  if (!Number.isFinite(duration) || !(duration > 0)) return null
  return previewPath
}

// --------------------------------------------------------- the scoped keymap

export type ViewerKeySeed = {
  key: string
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}

/** The dispatch vocabulary: §3's keymap actions (`use-frame` is §4's key —
 *  T5 wires its handler) plus `cycle-speed`, the speed CHIP's own click
 *  action — §3's table binds speed to click only, so no key ever emits it. */
export type ViewerAction =
  | 'toggle-play'
  | 'step-back'
  | 'step-forward'
  | 'coarse-back'
  | 'coarse-forward'
  | 'seek-first'
  | 'seek-last'
  | 'toggle-loop'
  | 'toggle-mute'
  | 'cycle-speed'
  | 'use-frame'

/** The focusable-chrome guard (audit T-M3): an event targeted at one of the
 *  viewer's OWN buttons/chips belongs to that control — Space on a focused
 *  transport chip activates the CHIP once, never the map too. Membership is
 *  the [data-take-viewer-chrome] mark (every transport control carries it;
 *  the overlay's header chips mark themselves the same way). */
export function isViewerChrome(target: unknown): boolean {
  const element = target as { closest?: unknown } | null
  if (!element || typeof element.closest !== 'function') return false
  return element.closest('[data-take-viewer-chrome]') != null
}

/** The map's decision for one keydown: the §3 action, or null when the key
 *  is not the viewer's — chrome chords pass through to the app chrome above
 *  every layer (isChromeChord), text-entry targets keep their keys
 *  (isTypingTarget, the menus' discipline), the viewer's own focusable
 *  chrome keeps its keys (T-M3), and Escape is NEVER the map's (the layer
 *  registry owns Escape-class dismissal — the CORE is not a layer). */
export function viewerKeyAction(seed: ViewerKeySeed, target: unknown): ViewerAction | null {
  if (isChromeChord(seed)) return null
  if (isTypingTarget(target)) return null
  if (isViewerChrome(target)) return null
  const key = seed.key === 'Space' ? ' ' : seed.key
  if (key === ' ') return 'toggle-play'
  if (key === 'ArrowLeft') return seed.shiftKey ? 'coarse-back' : 'step-back'
  if (key === 'ArrowRight') return seed.shiftKey ? 'coarse-forward' : 'step-forward'
  if (key === 'Home') return 'seek-first'
  if (key === 'End') return 'seek-last'
  if (key === 'l' || key === 'L') return 'toggle-loop'
  if (key === 'm' || key === 'M') return 'toggle-mute'
  if (key === 'u' || key === 'U') return 'use-frame'
  return null
}

/** An event-target-like the map can bind to (the shell passes window; the
 *  suite passes a fake — the scope contract is testable without a DOM). */
export type KeymapTarget = {
  addEventListener(type: string, listener: (event: ViewerKeyEvent) => void): unknown
  removeEventListener(type: string, listener: (event: ViewerKeyEvent) => void): unknown
}

export type ViewerKeyEvent = ViewerKeySeed & {
  target?: unknown
  preventDefault(): unknown
}

/** Binds the viewer-scoped map: one keydown listener that dispatches the
 *  map's actions and consumes them (preventDefault — Space never scrolls).
 *  Returns the detach; the shell calls it as the effect's cleanup, so the
 *  map binds on mount and releases on unmount. */
export function bindViewerKeymap(target: KeymapTarget, dispatch: (action: ViewerAction) => void): () => void {
  const listener = (event: ViewerKeyEvent) => {
    const action = viewerKeyAction(event, event.target)
    if (action === null) return
    event.preventDefault()
    dispatch(action)
  }
  target.addEventListener('keydown', listener)
  return () => target.removeEventListener('keydown', listener)
}

// -------------------------------------------------------------- the stage math

export const VIEWER_ZOOM_MIN = 1
export const VIEWER_ZOOM_MAX = 4
/** Multiplicative wheel step (the crop editor's resize idiom, sized for the
 *  1×–4× range: ~24 ticks edge to edge). */
const WHEEL_ZOOM_FACTOR = 1.12

export function clampViewerZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return VIEWER_ZOOM_MIN
  return Math.min(VIEWER_ZOOM_MAX, Math.max(VIEWER_ZOOM_MIN, zoom))
}

/** Wheel over the stage: negative deltaY zooms in, positive zooms out,
 *  always clamped to the blessed 1×–4× (INSIDE the stage only — the binding
 *  is the shell's non-passive callback-ref, the crop editor's audit-clean
 *  precedent). */
export function viewerZoomAfterWheel(zoom: number, deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return clampViewerZoom(zoom)
  const next = deltaY < 0 ? zoom * WHEEL_ZOOM_FACTOR : zoom / WHEEL_ZOOM_FACTOR
  return clampViewerZoom(next)
}

/** Fit-to-view letterbox: the largest source-true box inside the stage
 *  (contain). Degenerate inputs still yield a drawable box, never NaN. */
export function fittedMediaSize(mediaWidth: number, mediaHeight: number, stageWidth: number, stageHeight: number): { w: number; h: number } {
  const mw = Number.isFinite(mediaWidth) && mediaWidth > 0 ? mediaWidth : 1
  const mh = Number.isFinite(mediaHeight) && mediaHeight > 0 ? mediaHeight : 1
  const sw = Number.isFinite(stageWidth) && stageWidth > 0 ? stageWidth : 1
  const sh = Number.isFinite(stageHeight) && stageHeight > 0 ? stageHeight : 1
  const scale = Math.min(sw / mw, sh / mh)
  return { w: mw * scale, h: mh * scale }
}

/** Drag-pan clamp while zoomed: the pannable slack is (zoom − 1) × the
 *  fitted box per axis, so the media always covers the stage — and at fit
 *  (1×) pan is dead (the letterbox centers). */
export function clampViewerPan(x: number, y: number, zoom: number, fittedWidth: number, fittedHeight: number): { x: number; y: number } {
  const slackX = Math.max(0, (zoom - 1) * fittedWidth) / 2
  const slackY = Math.max(0, (zoom - 1) * fittedHeight) / 2
  const clean = (value: number, slack: number) => {
    if (!Number.isFinite(value)) return 0
    return Math.min(slack, Math.max(-slack, value))
  }
  return { x: clean(x, slackX), y: clean(y, slackY) }
}

/** Click-vs-pan disambiguation (spec §2): a press that moves at least this
 *  many CSS px is a pan; anything less is a click (the stage click toggles
 *  play on video takes). */
export const CLICK_VS_PAN_THRESHOLD_PX = 4

export function isPanGesture(dx: number, dy: number): boolean {
  return Math.sqrt(dx * dx + dy * dy) >= CLICK_VS_PAN_THRESHOLD_PX
}
