/**
 * Canvas Phase 5 — Diagnostics docked (§8; inventory row 10: "diagnostics
 * ride the radar/engine chip").
 *
 * DiagnosticsView was built for exactly this move (store-fed, zero App-level
 * prop plumbing — its header note says so); the old shell's route died with
 * the shell, and the surface now opens from the titlebar next to Settings.
 * Everything stays on the machine (PII-scrubbed by construction).
 *
 * Task 17: the dock chrome (title bar, raise, close, resize wiring) is the
 * StudioDock shell's; the reactive rank + content boundary ride its props.
 */
import { Stethoscope } from 'lucide-react'
import { DiagnosticsView } from '../views/DiagnosticsView'
import { dockDefaultGeometry } from './dockGeometry'
import { StudioDock } from '../ui/StudioDock'
import { useCanvasStore } from './store'

export function DiagnosticsDock() {
  const open = useCanvasStore((state) => state.diagnosticsDock)
  const setDiagnosticsDock = useCanvasStore((state) => state.setDiagnosticsDock)

  if (!open) return null

  return <StudioDock
    id="diagnostics"
    dockClassName="canvas-settings-dock"
    data-canvas-diagnostics-dock
    title={<><Stethoscope size={13} /> <strong>Diagnostics — docked</strong></>}
    closeLabel="Close diagnostics"
    closeDataAttr="data-canvas-diagnostics-close"
    onClose={() => setDiagnosticsDock(false)}
    errorBoundary="diagnostics"
    geometry={dockDefaultGeometry({ x: 480, y: 192, width: 760, height: Math.min(720, window.innerHeight - 180) })}
    resizePolicy={{ minWidth: 460, minHeight: 300 }}
  >
    <div className="canvas-settings-body" data-canvas-diagnostics-body>
      <DiagnosticsView />
    </div>
  </StudioDock>
}
