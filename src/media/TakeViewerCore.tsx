/**
 * TakeViewerCore (foelihc T2, spec §2/§3) — the take viewer's stage +
 * transport: the ONE shared component every mount renders (the canvas
 * overlay in v1; the library cards and the images workbench adopt it after
 * v1, per D2). CANVAS-AGNOSTIC by D2's letter — no src/canvas imports; the
 * overlay wrapper (T4) owns dismissal, the header, and the take chips.
 *
 * THIN SHELL over src/media/takeViewerModel.ts (the wizardWalk shape): the
 * model owns every decision a unit suite can pin — the transport machine,
 * the scoped keymap with the T-M3 focusable-chrome guard, the source
 * fallback, the surface gates, the zoom/pan math. This file only binds
 * those decisions to the DOM: the pool lease, the pointer gestures, the
 * non-passive wheel (the crop editor's callback-ref idiom — the wheel
 * contract lives INSIDE the stage), and the transport row's chrome.
 *
 * Video plays through the pool EXCLUSIVE lease with controls: false — the
 * viewer renders its own chrome, never the browser's. Image takes render
 * the still + zoom/pan with NO transport (the dishonest shape §2 names).
 * A landing-errored take renders its humanized verdict and nothing else;
 * missing media renders the failure vocabulary's own words.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsLeft, ChevronsRight, Pause, Play, Repeat, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { usePooledVideo } from './usePooledVideo'
import { clampToFrames, frameCountFromDuration, frameIndexFromTime, timecodeLabel } from './takeMath'
import {
  MISSING_FILE_BODY, MISSING_FILE_TITLE, SPEED_STEPS,
  actionEnabled, bindViewerKeymap, clampViewerPan, isPanGesture, initialMediaResolution, initialTransport,
  mediaResolutionAfterError, transportCommand, viewerSurface, viewerZoomAfterWheel,
  type TransportCommand, type ViewerAction, type ViewerMediaSource,
} from './takeViewerModel'
import './takeviewer.css'

export type TakeViewerCoreProps = {
  /** The take's media sources in fallback order: the content-addressed blob
   *  first, the engine-side media route second, none last (the caller
   *  computes the URLs — the core stays canvas-agnostic). */
  sources: ViewerMediaSource[]
  kind: 'video' | 'image'
  meta: { duration: number; width: number; height: number }
  /** The humanized landing verdict — the same string the status ring
   *  carries. When set, the viewer renders it and nothing else. */
  landingError?: string | null
  /** The take's name, for the accessible labels. */
  label: string
  /** §4's handoff (the key is bound now; T5 wires the fork path). Receives
   *  the clamped frame anchor in FRAMES. */
  onUseFrame?: (frameIndex: number) => void
  className?: string
}

export function TakeViewerCore({ sources, kind, meta, landingError = null, label, onUseFrame, className = '' }: TakeViewerCoreProps) {
  const frameCount = useMemo(() => frameCountFromDuration(meta.duration), [meta.duration])

  const [resolution, setResolution] = useState(() => initialMediaResolution(sources))
  const [transport, setTransport] = useState(initialTransport)
  const [frame, setFrame] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  // Ref mirrors for the bind-once listeners (the keymap, the wheel) — the
  // crop editor's wheelRef discipline: identity churn never re-binds.
  const transportRef = useRef(transport)
  useEffect(() => { transportRef.current = transport })
  const zoomRef = useRef(zoom)
  useEffect(() => { zoomRef.current = zoom })
  const panRef = useRef(pan)
  useEffect(() => { panRef.current = pan })

  const liveSurface = useMemo(() => viewerSurface({ kind, landingError, media: resolution.state }), [kind, landingError, resolution.state])
  const videoActive = liveSurface.stage && kind === 'video' && resolution.source !== null
  const activeSrc = videoActive && resolution.source ? resolution.source.url : ''

  const advanceAfterError = useCallback(() => {
    setResolution((current) => mediaResolutionAfterError(sources, current.index))
  }, [sources])

  const { containerRef, live, resume } = usePooledVideo({
    src: activeSrc,
    active: videoActive,
    controls: false,
    muted: true,
    loop: true,
    autoPlay: true,
    onError: advanceAfterError,
    onLoadedMetadata: (video) => { setFrame(frameIndexFromTime(video.currentTime)) },
    onTimeUpdate: (video) => { setFrame(frameIndexFromTime(video.currentTime)) },
    onPlay: () => { setTransport((current) => (current.playing ? current : { ...current, playing: true })) },
    onPreempted: () => { setTransport((current) => (current.playing ? { ...current, playing: false } : current)) },
  })

  const mediaRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; pan: { x: number; y: number }; moved: boolean } | null>(null)

  const videoElement = useCallback(() => containerRef.current?.querySelector('video') ?? null, [containerRef])

  /** The fitted (letterboxed) media box, measured from the transformed
   *  element itself: the rect is in scaled px, so fitted = rect / zoom. */
  const fittedBox = useCallback(() => {
    const rect = mediaRef.current?.getBoundingClientRect()
    const scale = zoomRef.current
    if (!rect || !(scale > 0)) return { w: 0, h: 0 }
    return { w: rect.width / scale, h: rect.height / scale }
  }, [])

  const applyCommand = useCallback((command: TransportCommand) => {
    setTransport(command.state)
    const video = videoElement()
    if (!video) return
    video.loop = command.state.loop
    video.muted = command.state.muted
    video.playbackRate = SPEED_STEPS[command.state.speedIndex]
    if (command.seekTo !== null) {
      video.currentTime = command.seekTo
      setFrame(clampToFrames(frameIndexFromTime(command.seekTo), frameCount))
    }
    if (command.state.playing) void video.play().catch(() => undefined)
    else video.pause()
  }, [frameCount, videoElement])

  // A fresh lease re-creates the element with lease-time defaults — the
  // element then follows whatever the transport has drifted to (unmuted,
  // speed, paused). Idempotent, so riding every transport change is free.
  useEffect(() => {
    if (!live) return
    const video = videoElement()
    if (!video) return
    video.loop = transport.loop
    video.muted = transport.muted
    video.playbackRate = SPEED_STEPS[transport.speedIndex]
    if (!transport.playing) video.pause()
  }, [live, transport, videoElement])

  const dispatch = useCallback((action: ViewerAction) => {
    if (!actionEnabled(action, liveSurface)) return
    if (action === 'use-frame') {
      // §4: the handoff pauses first, then hands the clamped frame anchor.
      applyCommand(transportCommand(transportRef.current, { type: 'toggle-play' }))
      const currentTime = videoElement()?.currentTime ?? 0
      onUseFrame?.(clampToFrames(frameIndexFromTime(currentTime), frameCount))
      return
    }
    if (action === 'toggle-play' && !live && videoActive) {
      // A preempted lease re-leases on the next play intent (the pool's
      // resume path — same elements, instant).
      setTransport((current) => ({ ...current, playing: true }))
      resume()
      return
    }
    const currentTime = videoElement()?.currentTime ?? 0
    if (action === 'toggle-play') applyCommand(transportCommand(transportRef.current, { type: 'toggle-play' }))
    else if (action === 'step-back') applyCommand(transportCommand(transportRef.current, { type: 'step', direction: -1, coarse: false, currentTime, frameCount }))
    else if (action === 'step-forward') applyCommand(transportCommand(transportRef.current, { type: 'step', direction: 1, coarse: false, currentTime, frameCount }))
    else if (action === 'coarse-back') applyCommand(transportCommand(transportRef.current, { type: 'step', direction: -1, coarse: true, currentTime, frameCount }))
    else if (action === 'coarse-forward') applyCommand(transportCommand(transportRef.current, { type: 'step', direction: 1, coarse: true, currentTime, frameCount }))
    else if (action === 'seek-first') applyCommand(transportCommand(transportRef.current, { type: 'seek-end', which: 'first', frameCount }))
    else if (action === 'seek-last') applyCommand(transportCommand(transportRef.current, { type: 'seek-end', which: 'last', frameCount }))
    else if (action === 'toggle-loop') applyCommand(transportCommand(transportRef.current, { type: 'toggle-loop' }))
    else if (action === 'toggle-mute') applyCommand(transportCommand(transportRef.current, { type: 'toggle-mute' }))
    else if (action === 'cycle-speed') applyCommand(transportCommand(transportRef.current, { type: 'cycle-speed' }))
  }, [applyCommand, frameCount, live, liveSurface, onUseFrame, resume, videoActive, videoElement])

  // The keymap binds on mount and releases on unmount (the scope contract);
  // the dispatch rides a ref so its identity churn never re-binds.
  const dispatchRef = useRef(dispatch)
  useEffect(() => { dispatchRef.current = dispatch })
  useEffect(() => bindViewerKeymap(window, (action) => dispatchRef.current(action)), [])

  // The wheel contract (spec §2): zoom 1×–4× INSIDE the stage only, bound
  // through a NON-PASSIVE callback ref (Base UI's portal gates effect-time
  // refs; React's synthetic onWheel is passive at the root and cannot
  // preventDefault) — the crop editor's audit-clean idiom.
  const onWheel = useCallback((event: WheelEvent) => {
    event.preventDefault()
    const next = viewerZoomAfterWheel(zoomRef.current, event.deltaY)
    if (next === zoomRef.current) return
    const fitted = fittedBox()
    zoomRef.current = next
    setZoom(next)
    setPan((current) => clampViewerPan(current.x, current.y, next, fitted.w, fitted.h))
  }, [fittedBox])
  const wheelRef = useRef(onWheel)
  useEffect(() => { wheelRef.current = onWheel })
  const stageWheel = useCallback((event: WheelEvent) => wheelRef.current(event), [])
  const setStageNode = useCallback((node: HTMLDivElement | null) => {
    const previous = stageRef.current
    if (previous === node) return
    if (previous) previous.removeEventListener('wheel', stageWheel)
    stageRef.current = node
    if (node) node.addEventListener('wheel', stageWheel, { passive: false })
  }, [stageWheel])

  // Click-vs-pan (spec §2): a press that moves past the threshold pans
  // (while zoomed — the clamp kills pan at fit); anything less is a click,
  // and a click toggles play on video takes.
  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return
    dragRef.current = { x: event.clientX, y: event.clientY, pan: { x: panRef.current.x, y: panRef.current.y }, moved: false }
    ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
  }, [])
  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && !isPanGesture(dx, dy)) return
    drag.moved = true
    const fitted = fittedBox()
    setPan(clampViewerPan(drag.pan.x + dx, drag.pan.y + dy, zoomRef.current, fitted.w, fitted.h))
  }, [fittedBox])
  const onPointerUp = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag && !drag.moved && kind === 'video') dispatchRef.current('toggle-play')
  }, [kind])
  // A canceled press is not a click (T2 review M-1): the browser aborted the
  // gesture — only clear the drag, never toggle play off it.
  const onPointerCancel = useCallback(() => {
    dragRef.current = null
  }, [])

  // A landing-errored take: the humanized verdict, nothing else.
  if (liveSurface.verdictOnly) {
    return <div className={`take-viewer-core take-viewer-verdict ${className}`.trim()} data-take-viewer="verdict">
      <p>{landingError}</p>
    </div>
  }

  // No resolvable source: the failure vocabulary's words, never a spinner.
  if (liveSurface.missing) {
    return <div className={`take-viewer-core take-viewer-missing ${className}`.trim()} data-take-viewer="missing">
      <p className="take-viewer-missing-title">{MISSING_FILE_TITLE}</p>
      <p className="take-viewer-missing-body">{MISSING_FILE_BODY}</p>
    </div>
  }

  return <div className={`take-viewer-core ${className}`.trim()} data-take-viewer={kind}>
    <div
      ref={setStageNode}
      className={`take-viewer-stage ${zoom > 1 ? 'zoomed' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      data-take-viewer-stage
    >
      <div
        ref={mediaRef}
        className="take-viewer-media"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        data-take-viewer-media
      >
        {kind === 'video'
          ? <div className="take-viewer-video" ref={containerRef} aria-label={label} />
          : resolution.source && <img className="take-viewer-image" src={resolution.source.url} alt={label} draggable={false} onError={advanceAfterError} />}
      </div>
    </div>
    {liveSurface.transport && <div className="take-viewer-transport" data-take-viewer-transport>
      <Button variant="icon" className="take-viewer-btn" data-take-viewer-chrome aria-label={transport.playing ? `Pause ${label}` : `Play ${label}`} onClick={() => dispatch('toggle-play')}>
        {transport.playing ? <Pause size={16} /> : <Play size={16} />}
      </Button>
      <Button variant="icon" className="take-viewer-btn" data-take-viewer-chrome aria-label="Step back one frame" onClick={() => dispatch('step-back')}><SkipBack size={14} /></Button>
      <Button variant="icon" className="take-viewer-btn" data-take-viewer-chrome aria-label="Step forward one frame" onClick={() => dispatch('step-forward')}><SkipForward size={14} /></Button>
      <Button variant="icon" className="take-viewer-btn" data-take-viewer-chrome aria-label="First frame" onClick={() => dispatch('seek-first')}><ChevronsLeft size={14} /></Button>
      <Button variant="icon" className="take-viewer-btn" data-take-viewer-chrome aria-label="Last frame" onClick={() => dispatch('seek-last')}><ChevronsRight size={14} /></Button>
      <span className="take-viewer-timecode" data-take-viewer-timecode title="fps is the registered approximation until real probing lands">
        {timecodeLabel(frame, frameCount)}
      </span>
      <Chip variant="toggle" selected={transport.loop} className="take-viewer-chip" data-take-viewer-chrome aria-label={transport.loop ? 'Loop on' : 'Loop off'} onClick={() => dispatch('toggle-loop')}><Repeat size={12} /></Chip>
      <Chip variant="toggle" selected={!transport.muted} className="take-viewer-chip" data-take-viewer-chrome aria-label={transport.muted ? 'Sound off' : 'Sound on'} onClick={() => dispatch('toggle-mute')}>
        {transport.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
      </Chip>
      <Chip variant="toggle" selected={transport.speedIndex !== 2} className="take-viewer-chip" data-take-viewer-chrome aria-label="Playback speed" onClick={() => dispatch('cycle-speed')}>
        {SPEED_STEPS[transport.speedIndex]}×
      </Chip>
    </div>}
  </div>
}
