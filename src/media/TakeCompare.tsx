/**
 * TakeCompare (foelihc T6, spec §6.1) — the side-by-side take comparison:
 * the stage splits into two letterboxed panes (side-by-side; stacked for
 * portrait aspects), each a pooled video lease in the pool's
 * `exclusive: false` mode (the explicitly supported coexisting-inspectors
 * case), under ONE shared transport — the playhead seeks both panes to the
 * same seconds, play/pause/speed/loop drive both, and when durations
 * differ the shorter pane HOLDS its last frame with the on-strip note.
 *
 * THIN SHELL over src/media/takeCompareModel.ts (the wave's pure-spine
 * discipline): the model owns every decision a unit suite can pin — the
 * command fan-out, the hold rule + its note, the clock master, the wrap,
 * the focus contract, the aspect split. This file binds those decisions to
 * the DOM: the two leases, the per-pane strips (the scrub rides the SAME
 * transport intents the core's strip rides), the transport row, the focus
 * clicks.
 *
 * MOUNT DISCIPLINE: the panes are CONSTANT per mount — the overlay keys
 * this component by the pane pair (`${take.id}:${secondPaneId}`), so a
 * pane swap is a fresh mount (fresh leases, fresh clock), never an in-place
 * re-resolution. The keymap is the viewer's own scoped map (T2's model); it
 * binds here because the single core is UNMOUNTED while compare is live
 * (the overlay's mount swap) — one map, one stage at a time.
 *
 * CANVAS-AGNOSTIC by D2's letter: media math, the pool, and the viewer's
 * own models — never src/canvas (the candidate picker is the overlay's).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsLeft, ChevronsRight, Crosshair, Pause, Play, Repeat, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { usePooledVideo } from './usePooledVideo'
import { TakeFilmstrip } from './TakeFilmstrip'
import { frameCountFromDuration } from './takeMath'
import {
  MISSING_FILE_BODY, MISSING_FILE_TITLE, SPEED_STEPS,
  bindViewerKeymap, initialMediaResolution, initialTransport, mediaResolutionAfterError, stripPreviewPath, transportCommand,
  type TransportCommand, type ViewerAction, type ViewerMediaSource,
} from './takeViewerModel'
import {
  clockMasterId, compareLayout, compareUseFrame, fanOutCommand, focusedPane, holdNote, initialFocusId,
  paneDisplayTime, paneHolds, paneMuted, paneTimecode, wrapCommand,
} from './takeCompareModel'
import './takecompare.css'

export type ComparePaneView = {
  /** The pane identity (the overlay's candidate key — stable per mount). */
  id: string
  /** The fork-flow target when U fires on this pane (§6.1: U applies to
   *  the FOCUSED pane — the winner's own chain + take). */
  chainId: string
  takeId: string
  /** The pane's name in the ladder vocabulary: `take n` / a chain title. */
  title: string
  sources: ViewerMediaSource[]
  meta: { duration: number; width: number; height: number }
  filmstrip?: { previewPath: string | null }
  label: string
}

export type TakeCompareProps = {
  /** Exactly two panes (the >2-pane shape is deferred, §6.1): pane A the
   *  watched take, pane B the picked candidate. Constant per mount. */
  panes: [ComparePaneView, ComparePaneView]
  /** §6.1's focused-pane handoff: the FOCUSED pane + its clamped frame
   *  anchor (frames — T5's seam contract unchanged). */
  onUseFrame?: (pane: ComparePaneView, frameIndex: number) => void
  className?: string
}

export function TakeCompare({ panes, onUseFrame, className = '' }: TakeCompareProps) {
  const [paneA, paneB] = panes
  const [transport, setTransport] = useState(initialTransport)
  const [clock, setClock] = useState(0)
  const [focusId, setFocusId] = useState(() => initialFocusId(panes))
  const [resolutionA, setResolutionA] = useState(() => initialMediaResolution(paneA.sources))
  const [resolutionB, setResolutionB] = useState(() => initialMediaResolution(paneB.sources))

  // Ref mirrors for the bind-once listeners and the lease-time callbacks —
  // identity churn never re-binds (the core's own discipline).
  const transportRef = useRef(transport)
  useEffect(() => { transportRef.current = transport })
  const clockRef = useRef(clock)
  useEffect(() => { clockRef.current = clock })
  const focusRef = useRef(focusId)
  useEffect(() => { focusRef.current = focusId })
  const applyCommandRef = useRef<(command: TransportCommand) => void>(() => undefined)

  // The clock facts the model decides over (the views projected onto the
  // model's ComparePaneClock shape): the master is the LONGEST pane (its
  // timeline is the clock), the focused view drives the timecode, the
  // steps, and U.
  const paneClocks = useMemo(() => panes.map((pane) => ({ id: pane.id, title: pane.title, duration: pane.meta.duration })), [panes])
  const clocksRef = useRef(paneClocks)
  useEffect(() => { clocksRef.current = paneClocks })
  const masterId = useMemo(() => clockMasterId(paneClocks), [paneClocks])
  const focusedView = useMemo(() => {
    const focused = focusedPane(paneClocks, focusId)
    return panes.find((pane) => pane.id === focused?.id) ?? panes[0]
  }, [panes, paneClocks, focusId])
  const layout = compareLayout(focusedView.meta)

  const activeA = resolutionA.state === 'present'
  const activeB = resolutionB.state === 'present'
  // A re-lease after a preemption needs the clock re-applied (the fresh
  // element starts at 0) — armed by onPreempted, consumed by the sync
  // effect on the live flip.
  const freshA = useRef(false)
  const freshB = useRef(false)

  const leaseA = usePooledVideo({
    src: activeA && resolutionA.source ? resolutionA.source.url : '',
    active: activeA,
    controls: false,
    muted: true,
    loop: false,
    autoPlay: true,
    exclusive: false,
    onError: () => setResolutionA((current) => mediaResolutionAfterError(paneA.sources, current.index)),
    onLoadedMetadata: (video) => { if (masterId === paneA.id) setClock(video.currentTime) },
    onTimeUpdate: (video) => { if (masterId === paneA.id) setClock(video.currentTime) },
    onEnded: () => { if (masterId === paneA.id) applyCommandRef.current(wrapCommand(transportRef.current)) },
    onPreempted: () => { freshA.current = true },
  })
  const leaseB = usePooledVideo({
    src: activeB && resolutionB.source ? resolutionB.source.url : '',
    active: activeB,
    controls: false,
    muted: true,
    loop: false,
    autoPlay: true,
    exclusive: false,
    onError: () => setResolutionB((current) => mediaResolutionAfterError(paneB.sources, current.index)),
    onLoadedMetadata: (video) => { if (masterId === paneB.id) setClock(video.currentTime) },
    onTimeUpdate: (video) => { if (masterId === paneB.id) setClock(video.currentTime) },
    onEnded: () => { if (masterId === paneB.id) applyCommandRef.current(wrapCommand(transportRef.current)) },
    onPreempted: () => { freshB.current = true },
  })

  const videoFor = useCallback((id: string): HTMLVideoElement | null => {
    const container = id === paneA.id ? leaseA.containerRef.current : leaseB.containerRef.current
    return container?.querySelector('video') ?? null
  }, [leaseA.containerRef, leaseB.containerRef, paneA.id])
  const resumeA = leaseA.resume
  const resumeB = leaseB.resume
  const resumeFor = useCallback((id: string) => {
    if (id === paneA.id) resumeA()
    else resumeB()
  }, [resumeA, resumeB, paneA.id])

  /** ONE shared transport transaction → both panes, through the model's
   *  fan-out (the seek rides the hold lens; a pane past its own end never
   *  receives play() — the element would restart on its own, T-M2). */
  const applyCommand = useCallback((command: TransportCommand) => {
    setTransport(command.state)
    if (command.seekTo !== null) {
      clockRef.current = command.seekTo
      setClock(command.seekTo)
    }
    const effects = fanOutCommand(command, clocksRef.current, focusRef.current, clockRef.current)
    for (const effect of effects) {
      const video = videoFor(effect.id)
      if (!video) {
        // A preempted/idle-released lease re-leases on the next intent
        // that needs the element (the pool serves instantly from the same
        // elements); the sync effect re-applies the clock to the fresh
        // element.
        if (command.state.playing || command.seekTo !== null) resumeFor(effect.id)
        continue
      }
      video.loop = false
      video.playbackRate = effect.playbackRate
      video.muted = effect.muted
      if (effect.seekTo !== null) video.currentTime = effect.seekTo
      if (effect.playing) void video.play().catch(() => undefined)
      else video.pause()
    }
  }, [resumeFor, videoFor])
  useEffect(() => { applyCommandRef.current = applyCommand })

  // A fresh (or re-leased) element follows the shared transport it missed
  // — the core's fresh-lease discipline, applied per pane; on a RE-lease
  // the pane also re-seeks to the clock (the fresh element starts at 0).
  useEffect(() => {
    if (!leaseA.live) return
    const video = videoFor(paneA.id)
    if (!video) return
    video.loop = false
    video.playbackRate = SPEED_STEPS[transport.speedIndex]
    video.muted = paneMuted(transport, focusId === paneA.id)
    if (freshA.current) {
      freshA.current = false
      video.currentTime = paneDisplayTime(clockRef.current, paneA.meta.duration)
    }
    if (transport.playing && !paneHolds(clockRef.current, paneA.meta.duration)) void video.play().catch(() => undefined)
    else video.pause()
  }, [leaseA.live, transport, focusId, paneA, videoFor])
  useEffect(() => {
    if (!leaseB.live) return
    const video = videoFor(paneB.id)
    if (!video) return
    video.loop = false
    video.playbackRate = SPEED_STEPS[transport.speedIndex]
    video.muted = paneMuted(transport, focusId === paneB.id)
    if (freshB.current) {
      freshB.current = false
      video.currentTime = paneDisplayTime(clockRef.current, paneB.meta.duration)
    }
    if (transport.playing && !paneHolds(clockRef.current, paneB.meta.duration)) void video.play().catch(() => undefined)
    else video.pause()
  }, [leaseB.live, transport, focusId, paneB, videoFor])

  const dispatch = useCallback((action: ViewerAction) => {
    const focusedDuration = focusedView.meta.duration
    const count = frameCountFromDuration(focusedDuration)
    if (action === 'use-frame') {
      // §6.1: U applies to the FOCUSED pane — the model's combined
      // pause+anchor transaction on the focused pane's clock, handed up
      // with the pane itself (the shell never re-derives the anchor).
      const handoff = compareUseFrame(transportRef.current, clockRef.current, focusedDuration)
      applyCommand(handoff.command)
      onUseFrame?.(focusedView, handoff.frameIndex)
      return
    }
    const currentTime = clockRef.current
    if (action === 'toggle-play') applyCommand(transportCommand(transportRef.current, { type: 'toggle-play' }))
    else if (action === 'step-back') applyCommand(transportCommand(transportRef.current, { type: 'step', direction: -1, coarse: false, currentTime, frameCount: count }))
    else if (action === 'step-forward') applyCommand(transportCommand(transportRef.current, { type: 'step', direction: 1, coarse: false, currentTime, frameCount: count }))
    else if (action === 'coarse-back') applyCommand(transportCommand(transportRef.current, { type: 'step', direction: -1, coarse: true, currentTime, frameCount: count }))
    else if (action === 'coarse-forward') applyCommand(transportCommand(transportRef.current, { type: 'step', direction: 1, coarse: true, currentTime, frameCount: count }))
    else if (action === 'seek-first') applyCommand(transportCommand(transportRef.current, { type: 'seek-end', which: 'first', frameCount: count }))
    else if (action === 'seek-last') applyCommand(transportCommand(transportRef.current, { type: 'seek-end', which: 'last', frameCount: count }))
    else if (action === 'toggle-loop') applyCommand(transportCommand(transportRef.current, { type: 'toggle-loop' }))
    else if (action === 'toggle-mute') applyCommand(transportCommand(transportRef.current, { type: 'toggle-mute' }))
    else if (action === 'cycle-speed') applyCommand(transportCommand(transportRef.current, { type: 'cycle-speed' }))
  }, [applyCommand, focusedView, onUseFrame])

  // The viewer-scoped keymap (§3): compare binds the SAME map — Space,
  // arrows, U drive the shared clock. Binds on mount, releases on unmount.
  const dispatchRef = useRef(dispatch)
  useEffect(() => { dispatchRef.current = dispatch })
  useEffect(() => bindViewerKeymap(window, (action) => dispatchRef.current(action)), [])

  return <div className={`take-compare ${layout === 'stacked' ? 'take-compare-stacked' : ''} ${className}`.trim()} data-take-compare={layout}>
    <div className="take-compare-split">
      {panes.map((pane, index) => {
        const lease = index === 0 ? leaseA : leaseB
        const resolution = index === 0 ? resolutionA : resolutionB
        const isFocused = pane.id === focusId
        return (
          <div
            key={pane.id}
            className={`take-compare-pane ${isFocused ? 'focused' : ''}`}
            data-take-compare-pane={pane.id}
            data-take-compare-focused={isFocused}
            onPointerDown={(event) => { if (event.button === 0) setFocusId(pane.id) }}
          >
            <div className="take-compare-stage" aria-label={pane.label}>
              {resolution.state === 'present'
                ? <div className="take-compare-video" ref={lease.containerRef} />
                : <div className="take-compare-missing" data-take-compare-missing>
                  <p className="take-compare-missing-title">{MISSING_FILE_TITLE}</p>
                  <p className="take-compare-missing-body">{MISSING_FILE_BODY}</p>
                </div>}
            </div>
            {resolution.state === 'present' && (
              <div className="take-compare-strip">
                <TakeFilmstrip
                  previewPath={stripPreviewPath(pane.filmstrip?.previewPath ?? null, pane.meta.duration)}
                  duration={pane.meta.duration}
                  currentTime={clock}
                  playing={transport.playing}
                  mediaPresent
                  onScrubStart={() => applyCommand(transportCommand(transportRef.current, { type: 'pause' }))}
                  onScrub={(time) => applyCommand(transportCommand(transportRef.current, { type: 'seek', time }))}
                  onScrubEnd={(resume) => {
                    if (resume) applyCommand(transportCommand(transportRef.current, { type: 'toggle-play' }))
                  }}
                  label={pane.label}
                />
                {paneHolds(clock, pane.meta.duration) && (
                  <div className="take-compare-hold" data-take-compare-hold>{holdNote(pane.title)}</div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
    {/* ONE shared transport (§6.1): every control drives both panes through
        the fan-out; the timecode reads the FOCUSED pane's grid (the number
        the U anchor will name); sound follows focus (the model's rule). */}
    <div className="take-compare-transport" data-take-viewer-transport>
      <Button variant="icon" className="take-compare-btn" data-take-viewer-chrome aria-label={transport.playing ? `Pause ${focusedView.title}` : `Play ${focusedView.title}`} onClick={() => dispatch('toggle-play')}>
        {transport.playing ? <Pause size={16} /> : <Play size={16} />}
      </Button>
      <Button variant="icon" className="take-compare-btn" data-take-viewer-chrome aria-label="Step back one frame" onClick={() => dispatch('step-back')}><SkipBack size={14} /></Button>
      <Button variant="icon" className="take-compare-btn" data-take-viewer-chrome aria-label="Step forward one frame" onClick={() => dispatch('step-forward')}><SkipForward size={14} /></Button>
      <Button variant="icon" className="take-compare-btn" data-take-viewer-chrome aria-label="First frame" onClick={() => dispatch('seek-first')}><ChevronsLeft size={14} /></Button>
      <Button variant="icon" className="take-compare-btn" data-take-viewer-chrome aria-label="Last frame" onClick={() => dispatch('seek-last')}><ChevronsRight size={14} /></Button>
      <span className="take-compare-timecode" data-take-viewer-timecode title={`the focused pane — ${focusedView.title}`}>
        {paneTimecode(clock, focusedView.meta.duration)}
      </span>
      <Chip variant="toggle" selected={transport.loop} className="take-compare-chip" data-take-viewer-chrome aria-label={transport.loop ? 'Loop on' : 'Loop off'} onClick={() => dispatch('toggle-loop')}><Repeat size={12} /></Chip>
      <Chip variant="toggle" selected={!transport.muted} className="take-compare-chip" data-take-viewer-chrome aria-label={transport.muted ? 'Sound off' : 'Sound on'} title="Sound follows the focused pane" onClick={() => dispatch('toggle-mute')}>
        {transport.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
      </Chip>
      <Chip variant="toggle" selected={transport.speedIndex !== 2} className="take-compare-chip" data-take-viewer-chrome aria-label="Playback speed" onClick={() => dispatch('cycle-speed')}>
        {SPEED_STEPS[transport.speedIndex]}×
      </Chip>
      {onUseFrame && <Button variant="icon" className="take-compare-btn" data-take-viewer-chrome aria-label={`Use this frame — fork from ${focusedView.title}'s paused frame (U)`} title="Use this frame — the focused pane's paused frame (U)" onClick={() => dispatch('use-frame')}>
        <Crosshair size={14} />
      </Button>}
    </div>
  </div>
}
