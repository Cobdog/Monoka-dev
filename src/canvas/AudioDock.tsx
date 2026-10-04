/**
 * Canvas Phase 4 — the audio engine dock (§5.4 engines-as-ops: Music 3
 * arrives as a typed-hole selection; no per-engine destination views).
 *
 * A react-rnd floating panel (the pose-rig-dock pattern) opened from the
 * produce menu. It creates an audio CHAIN in the document store carrying
 * the engine + its request options (rerun-stable settings), then
 * submitChain executes through the shared core (lib/music3Submit.ts). The
 * finished track lands as a take on its chain, searchable in the library
 * projection like every output. (The ACE-Step dock arm was removed with
 * the engine, 2026-09-21 — nn5ld47.)
 */
import { useEffect, useState } from 'react'
import { Rnd } from 'react-rnd'
import { AudioLines, Play, X } from 'lucide-react'
import { useCanvasStore } from './store'
import { AUDIO_LANE_PAUSED, AUDIO_LANE_PAUSED_REASON } from './options'

export function AudioDock() {
  const dock = useCanvasStore((state) => state.audioDock)
  const setAudioDock = useCanvasStore((state) => state.setAudioDock)
  const createAudioChain = useCanvasStore((state) => state.createAudioChain)
  const setChainSettings = useCanvasStore((state) => state.setChainSettings)
  const submitChain = useCanvasStore((state) => state.submitChain)
  const validateChain = useCanvasStore((state) => state.validateChain)
  const validateAudioDraft = useCanvasStore((state) => state.validateAudioDraft)
  const selection = useCanvasStore((state) => state.selection)
  const documents = useCanvasStore((state) => state.documents)
  const activeProjectId = useCanvasStore((state) => state.activeProjectId)
  const raiseDock = useCanvasStore((state) => state.raiseDock)

  const [caption, setCaption] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [duration, setDuration] = useState(60)
  const [submitting, setSubmitting] = useState(false)
  // Dock stacking (review M11): this dock's own z, raised on open and on any
  // pointer grab — independent of the other docks' z values. The stranded
  // z-55 CSS pin is retired; the store owns ordering.
  const [dockZ, setDockZ] = useState(60)
  useEffect(() => { if (dock) setDockZ(raiseDock()) }, [dock, raiseDock])

  if (!dock) return null
  const engine = dock.engine
  // The dock adopts the SELECTED chain only when it is already an audio
  // chain (never silently convert a video/image chain); otherwise the submit
  // creates a fresh chain — the typed-hole selection.
  const selectedChainId = selection.tileIds.length === 1 ? selection.tileIds[0] : null
  const selectedIsAudio = (() => {
    if (!selectedChainId || !activeProjectId) return false
    const chain = documents[activeProjectId]?.chains.find((entry) => entry.id === selectedChainId)
    return chain?.settings?.mediaType === 'audio'
  })()
  const targetChainId = dock.chainId ?? (selectedIsAudio ? selectedChainId : null)
  // A selected audio chain validates through its persisted settings; a fresh
  // draft through the same ladders submitChain will run (honest inline).
  const validation = targetChainId ? validateChain(targetChainId) : validateAudioDraft(engine, caption)

  const submit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      let chainId = targetChainId
      if (!chainId) {
        chainId = await createAudioChain(engine, caption.trim())
        if (!chainId) return
      }
      // (A02) The same gate as the properties panel's Generate: a failed
      // settings save aborts the submission — the previously persisted
      // caption never renders as if the user had authored it.
      if (!(await setChainSettings(chainId, {
        prompt: caption.trim(),
        mediaType: 'audio',
        audio: { engine, caption: caption.trim(), lyrics, duration, seed: Math.floor(Math.random() * 1_000_000_000) },
      })).ok) return
      const result = await submitChain(chainId)
      if (result.ok) setAudioDock(null)
    } finally {
      setSubmitting(false)
    }
  }

  // (Maintainer ruling 2026-09-28 — the audio-lane pause, nn5ld47's
  // extension) While the lane is paused the dock is a NOTICE, not an
  // authoring surface: every entry point is gated with the same reason, and
  // the dock itself renders the notice for any path that still reaches it
  // (a stale chain link, a re-enabled flag catching a mounted panel). The
  // form below stays compiled — one flag flip restores the lane whole.
  if (AUDIO_LANE_PAUSED) {
    return <Rnd
      className="canvas-audio-dock"
      data-canvas-audio-dock
      data-canvas-audio-engine={engine}
      data-canvas-audio-paused="true"
      style={{ zIndex: dockZ }}
      onPointerDownCapture={() => setDockZ(raiseDock())}
      default={{ x: 96, y: 120, width: 400, height: 560 }}
      minWidth={320}
      minHeight={300}
      bounds="parent"
      dragHandleClassName="canvas-inspector-header"
      enableResizing={{ bottom: true, bottomRight: true, right: true, bottomLeft: false, topLeft: false, topRight: false, left: false, top: false }}
    >
      <header className="canvas-inspector-header">
        <AudioLines size={13} />
        <strong>Music 3 — complete song</strong>
        <button type="button" aria-label="Close audio dock" data-canvas-audio-close onClick={() => setAudioDock(null)}><X size={13} /></button>
      </header>
      <div className="canvas-inspector-body">
        <p className="canvas-properties-note" data-canvas-audio-paused-note role="status">{AUDIO_LANE_PAUSED_REASON}</p>
        <p className="canvas-properties-note">Existing audio chains stay on their objects and keep playing — only new authoring is paused.</p>
      </div>
    </Rnd>
  }

  return <Rnd
    className="canvas-audio-dock"
    data-canvas-audio-dock
    data-canvas-audio-engine={engine}
    style={{ zIndex: dockZ }}
    onPointerDownCapture={() => setDockZ(raiseDock())}
    default={{ x: 96, y: 120, width: 400, height: 560 }}
    minWidth={320}
    minHeight={300}
    bounds="parent"
    dragHandleClassName="canvas-inspector-header"
    enableResizing={{ bottom: true, bottomRight: true, right: true, bottomLeft: false, topLeft: false, topRight: false, left: false, top: false }}
  >
    <header className="canvas-inspector-header">
      <AudioLines size={13} />
      <strong>Music 3 — complete song</strong>
      <button type="button" aria-label="Close audio dock" data-canvas-audio-close onClick={() => setAudioDock(null)}><X size={13} /></button>
    </header>
    <div className="canvas-inspector-body">
      <section className="canvas-properties-section">
        <label>Caption sections</label>
        <textarea
          data-canvas-audio-caption
          rows={2}
          value={caption}
          placeholder="genre, mood, instrumentation, structure…"
          onChange={(event) => setCaption(event.target.value)}
        />
      </section>
      <section className="canvas-properties-section">
        <label>Lyrics</label>
        <textarea
          data-canvas-audio-lyrics
          rows={2}
          value={lyrics}
          placeholder="lyric sections (optional)…"
          onChange={(event) => setLyrics(event.target.value)}
        />
      </section>
      <section className="canvas-properties-section">
        <div className="canvas-properties-row">
          <label htmlFor="canvas-audio-duration">seconds</label>
          <input id="canvas-audio-duration" data-canvas-audio-duration type="number" min={10} max={300} step={5} value={duration} onChange={(event) => setDuration(Math.max(10, Math.min(300, Number(event.target.value) || 60)))} />
        </div>
      </section>
      {validation && <p className="canvas-properties-warning" data-canvas-audio-validation role="alert">{validation}</p>}
      <p className="canvas-properties-note">
        The track lands as its own object — a take you can fork, reference, and find in the library (V).
      </p>
    </div>
    <footer className="canvas-properties-submit">
      <button type="button" className="canvas-properties-generate" data-canvas-audio-submit onClick={() => void submit()} disabled={submitting || Boolean(validation)}>
        <Play size={12} /> generate song
      </button>
    </footer>
  </Rnd>
}
