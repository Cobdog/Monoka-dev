/**
 * Dataset manager — the caption editor (spec §4): per-LAYER captions with
 * live trigger-token validation, authorship + history, the stale flow, and
 * the VLM modal carrying the four automation modes (single caption/recaption,
 * free-form discussion; batch modes live on the layer list).
 *
 * Component vocabulary task 13 (k2q0n9s): the panel and its VLM modal are
 * StudioDialogLayered — Base UI owns the focus trap/restore and outside
 * press, and the §0.2 layer registry routes Escape topmost-only. This pair
 * is the app's GENUINE two-dialog stack: the VLM dialog registers ABOVE the
 * caption dialog, so one Escape closes only the VLM, the next the caption
 * (the retired hand-rolled window listener's VLM-first ownership is the
 * registry's push order now). C1's uniform busy guard: every dismissal path
 * — the routed Escape, Base UI's outside-press, the Close/× affordances —
 * funnels through one guarded close per dialog; declining while that
 * dialog's own protected action is in flight simply closes nothing (the
 * registry's documented contract — the save's outcome belongs on screen).
 *
 * Component vocabulary task 18 (k2q0n9s): both textareas are Field — the
 * general form tier owning label association + the error > hint > silent
 * description slot wired through aria-describedby (see the two Field sites
 * below; the validation/announcement semantics ride the slots' content).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { History, MessageSquareText, ShieldAlert, Sparkles, X } from 'lucide-react'
import { datasetsApi, type LibraryLayer, type TriggerVerdict } from './api'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { StudioDialogLayered } from '../ui/StudioDialogLayered'

type Props = {
  layer: LibraryLayer
  onClose(): void
  onChanged(): void
}

type HistoryEntry = { text: string; author: string; authorModel: string | null; recordedAt: number }

export function CaptionPanel({ layer, onClose, onChanged }: Props) {
  const [text, setText] = useState(layer.caption?.text ?? '')
  const [validation, setValidation] = useState<TriggerVerdict | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // VLM modal state
  const [vlmOpen, setVlmOpen] = useState(false)
  const [vlmInstruction, setVlmInstruction] = useState('')
  const [vlmBusy, setVlmBusy] = useState(false)
  const [vlmError, setVlmError] = useState<string | null>(null)
  // Free-form discussion state (mode d)
  const [chat, setChat] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const debounce = useRef<number | null>(null)

  // Live trigger validation (debounced; the same rule the export gate runs).
  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => {
      datasetsApi.validateCaption(text).then(setValidation).catch(() => setValidation(null))
    }, 300)
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current)
    }
  }, [text])

  // C1's guarded closes: the caption save / the VLM recaption run are the
  // protected actions; every dismissal path above lands here. The VLM also
  // declines while a chat reply is pending — dropping it mid-flight is the
  // silent-loss class the guard exists to prevent.
  const closeCaption = () => {
    if (busy) return
    onClose()
  }
  const closeVlm = () => {
    if (vlmBusy || chatBusy) return
    setVlmOpen(false)
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await datasetsApi.setCaption(layer.id, text)
      setSavedAt(Date.now())
      onChanged()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setBusy(false)
    }
  }

  const runVlm = async () => {
    setVlmBusy(true)
    setVlmError(null)
    try {
      const result = await datasetsApi.vlmCaption(layer.id, vlmInstruction.trim() || undefined)
      setText(result.caption)
      onChanged()
    } catch (vlmError) {
      setVlmError(vlmError instanceof Error ? vlmError.message : String(vlmError))
    } finally {
      setVlmBusy(false)
    }
  }

  const sendChat = async () => {
    if (!chatInput.trim()) return
    const message = chatInput
    setChatInput('')
    setChatBusy(true)
    setChat((current) => [...current, { role: 'user', content: message }])
    try {
      const result = await datasetsApi.vlmDiscuss(layer.id, message, chat.slice(-12))
      setChat((current) => [...current, { role: 'assistant', content: result.reply }])
    } catch (chatError) {
      setChat((current) => [...current, { role: 'assistant', content: chatError instanceof Error ? chatError.message : String(chatError) }])
    } finally {
      setChatBusy(false)
    }
  }

  const loadHistory = async () => {
    if (history) {
      setHistory(null)
      return
    }
    try {
      const result = await datasetsApi.captionHistory(layer.id)
      setHistory(result.history)
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : String(historyError))
    }
  }

  const stale = layer.caption?.stale
  const authorLabel = useMemo(() => {
    if (!layer.caption) return 'uncaptioned'
    return layer.caption.author === 'hand' ? 'hand-written' : `VLM (${layer.caption.author})`
  }, [layer.caption])

  return <StudioDialogLayered
    layerId="ds-caption"
    open
    onClose={closeCaption}
    backdropClassName="ds-caption-backdrop"
    centerClassName="ds-caption-center"
    popupClassName="ds-caption-panel"
    labelledBy="ds-caption-title"
  >
    {/* .ds-dialog-flow is the surface's test-hook wrapper (display:contents —
        the popup's own flex flow passes straight through; see datasets.css). */}
    <div className="ds-dialog-flow" data-ds-caption>
      <header className="ds-caption-head">
        <div>
          <h3 id="ds-caption-title">Caption — {layer.name || `layer ${layer.id.slice(0, 8)}`}</h3>
          <p className="ds-sub">{authorLabel}{layer.caption?.reviewState === 'queued' ? ' · review queued' : ''}{stale ? ' · STALE' : ''}</p>
        </div>
        <div className="ds-caption-actions">
          <Button variant="ghost" className="ds-btn" onClick={() => setVlmOpen((open) => !open)}><Sparkles size={13} /> VLM</Button>
          <Button variant="ghost" className="ds-btn" onClick={loadHistory}><History size={13} /> {history ? 'Hide history' : 'History'}</Button>
          <Button variant="ghost" className="ds-btn" onClick={closeCaption}>Close</Button>
        </div>
      </header>
      {stale && <p className="ds-stale-note" data-ds-stale><ShieldAlert size={13} /> {layer.caption?.stale ? 'This caption is STALE — the layer\'s view changed after captioning. Recaption (or accept explicitly at export).' : ''}</p>}
      {/* Task 18 (k2q0n9s): the trigger control is a Field — the textarea
          was placeholder-as-label with a validation list nothing referenced.
          The live verdict is now the field's ONE description slot: the
          issues list through the error tone when the verdict fails, the OK
          confirmation through the hint tone when it passes, NOTHING while a
          verdict is pending (the honest-pending change: the old ternary
          pre-announced "OK" before any verdict existed). The T13 hooks
          (data-ds-validation/-ok) ride the content; the foot keeps the
          SAVE outcome (operation status, not a field description). */}
      <Field
        label="Caption"
        htmlFor="ds-caption-textarea"
        error={validation && !validation.ok
          ? <ul className="ds-validation" data-ds-validation>
              {validation.issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          : undefined}
        hint={validation?.ok
          ? <span data-ds-validation-ok>Trigger format OK — single rare token, exactly once, first.</span>
          : undefined}
      >
        <textarea
          id="ds-caption-textarea"
          className="ds-caption-textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={6}
          placeholder="One flowing paragraph, natural language only. Trigger token first, exactly once."
          data-ds-caption-textarea
        />
      </Field>
      <div className="ds-caption-foot">
        {error && <p className="ds-error">{error}</p>}
        {savedAt && !busy && !error && <p className="ds-status">Saved (hand-written; batch VLM will never silently overwrite it).</p>}
        <Button variant="primary" className="ds-btn" size={13} busy={busy} onClick={save} data-ds-save-caption>
          Save caption
        </Button>
      </div>
      {history && history.length > 0 && <div className="ds-history" data-ds-history>
        {history.map((entry, index) => (
          <div key={index} className="ds-history-entry">
            <span className="ds-history-meta">{entry.author === 'hand' ? 'hand' : `VLM${entry.authorModel ? ` · ${entry.authorModel}` : ''}`} · {new Date(entry.recordedAt).toLocaleString()}</span>
            <p>{entry.text}</p>
          </div>
        ))}
      </div>}
      {vlmOpen && <StudioDialogLayered
        layerId="ds-caption-vlm"
        open
        onClose={closeVlm}
        backdropClassName="ds-vlm-backdrop"
        centerClassName="ds-vlm-center"
        popupClassName="ds-vlm-box"
        labelledBy="ds-vlm-title"
      >
        <div className="ds-dialog-flow" data-ds-vlm>
          <header>
            <h3 id="ds-vlm-title"><MessageSquareText size={14} /> Local VLM — caption this clip, or discuss it</h3>
            <Button variant="icon" className="ds-vlm-close" aria-label="Close the VLM dialog" onClick={closeVlm} disabled={vlmBusy || chatBusy}><X size={14} /></Button>
          </header>
          <section>
            <h4>Caption / recaption (dense → condense, on the llama.cpp router)</h4>
            <p className="ds-hint">Pass 1 describes the frames densely; pass 2 condenses into the class template — both local.</p>
            {/* The task-18 second in-file consumer: a STANDING hint (the
                guidance, hoisted from the retired placeholder — visible
                while typing now, not only when empty) with the run failure
                as the live error. Both present → only the error describes
                the control (Field's precedence, pinned in e2e). */}
            <Field
              label="Instruction"
              htmlFor="ds-vlm-instruction"
              hint="Optional instruction — e.g. 'mention the lighting and the camera push-in'"
              error={vlmError ?? undefined}
            >
              <textarea id="ds-vlm-instruction" value={vlmInstruction} onChange={(event) => setVlmInstruction(event.target.value)} rows={3} />
            </Field>
            <Button variant="primary" className="ds-btn" size={13} busy={vlmBusy} onClick={runVlm} data-ds-vlm-caption>
              Caption this clip
            </Button>
          </section>
          <section className="ds-chat">
            <h4>Free-form discussion (no caption write)</h4>
            <div className="ds-chat-log">
              {chat.map((turn, index) => <p key={index} className={turn.role}>{turn.content}</p>)}
              {chatBusy && <p className="assistant pending">thinking…</p>}
            </div>
            <div className="ds-chat-row">
              <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask about this clip…" onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendChat()
                }
              }} />
              <Button variant="secondary" className="ds-btn" onClick={sendChat} disabled={chatBusy}>Ask</Button>
            </div>
          </section>
        </div>
      </StudioDialogLayered>}
    </div>
  </StudioDialogLayered>
}
