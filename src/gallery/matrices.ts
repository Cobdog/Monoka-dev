/**
 * galleryMatrices — the component gallery's STATE MATRICES as data
 * (component vocabulary task 23, Flux k2q0n9s). React-free on purpose so
 * the node suite (tests/gallery-matrices.test.js) loads the SAME data the
 * surface renders through the VM harness — the statusToken/chipClasses
 * doctrine: one authority, tested where it lives.
 *
 * Contract:
 *   - THE GALLERY EXHIBITS MATRICES, NOT SCREENSHOTS. Every stateful
 *     component of the kit (src/ui/*) gets a SECTION whose cells are the
 *     CROSS PRODUCT of that component's declared axes — tone × state,
 *     origin × attempt × reset, write × refresh. The cross product is
 *     EXHAUSTIVE by construction and by verification: galleryMatrixProblems()
 *     walks every section and fails loudly on a missing combination, an
 *     unknown axis value, a duplicate id, or an unjustified absence.
 *   - JUSTIFIED N/A CELLS. Where a state/prop combination CANNOT exist at
 *     the component's interface, the data says so — the cell is present,
 *     kind 'na', carrying the REASON (SaveStatus's retry-off-failed,
 *     HandoffResult's refresh-before-a-landed-write, EffectiveSettingRow's
 *     node level with no resolver and reset-on-auto, PopoverMenu's latent
 *     no-backdrop path). A silently skipped cell is exactly the false-green
 *     this gallery exists to prevent.
 *   - DRIVERS ARE REAL. Cells whose state axis reads 'hover' or 'focus'
 *     render AT REST and carry that driver: the e2e suite (and only the
 *     suite — never the app) applies Playwright's real hover() / keyboard
 *     focus to them. No synthetic classes anywhere.
 *   - THE DESIGNED HOMES: PromptDialog's `initial` prop (T15's
 *     interface-faithful, production-unexercised arm) and HandoffResult's
 *     queued-spinner + refresh-busy interface notes (the T22 review's
 *     M2/M3) are exercised HERE — the gallery is their first consumer.
 *   - The RENDERERS live in GalleryApp.tsx keyed by section id; the data
 *     never imports React, and the app never hardcodes a cell list (the
 *     node suite pins both directions).
 *
 * VM-harness discipline (tests/gallery-matrices.test.js loads this module):
 * no iterator spreads, no matchAll; plain ES5 array work throughout.
 */

/** The real interactions the suite drives on a cell (never synthetic classes). */
export type GalleryDriver = 'hover' | 'focus'

/** One cell's axis coordinates, e.g. { variant: 'primary', state: 'busy' }. */
export type GalleryCellAxes = Record<string, string>

export type GalleryRenderCell = {
  kind: 'render'
  id: string
  axes: GalleryCellAxes
  /** The interaction the e2e suite applies to this cell (rendered at rest). */
  driver?: GalleryDriver
  /** Exhibited under the cell — the interface note the cell exists to carry. */
  note?: string
}

export type GalleryNaCell = {
  kind: 'na'
  id: string
  axes: GalleryCellAxes
  /** WHY this combination cannot exist at the interface. Never blank. */
  reason: string
}

export type GalleryCell = GalleryRenderCell | GalleryNaCell

export type GalleryAxis = {
  name: string
  values: string[]
}

export type GallerySection = {
  id: string
  /** The kit component(s) this section exhibits (the inventory the suite pins). */
  component: string
  blurb: string
  axes: GalleryAxis[]
  cells: GalleryCell[]
}

/** The full cross product of an axis set, one record per combination. */
export function galleryAxisCombinations(axes: GalleryAxis[]): GalleryCellAxes[] {
  let combos: GalleryCellAxes[] = [{}]
  for (let axisIndex = 0; axisIndex < axes.length; axisIndex += 1) {
    const axis = axes[axisIndex]
    const next: GalleryCellAxes[] = []
    for (let comboIndex = 0; comboIndex < combos.length; comboIndex += 1) {
      const combo = combos[comboIndex]
      for (let valueIndex = 0; valueIndex < axis.values.length; valueIndex += 1) {
        const entry: GalleryCellAxes = {}
        const keys = Object.keys(combo)
        for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) entry[keys[keyIndex]] = combo[keys[keyIndex]]
        entry[axis.name] = axis.values[valueIndex]
        next.push(entry)
      }
    }
    combos = next
  }
  return combos
}

/** The stable cell hook: `${sectionId}.${cellId}` (the DOM's data-gallery-cell). */
export function galleryCellKey(sectionId: string, cellId: string): string {
  return `${sectionId}.${cellId}`
}

type MatrixSpec = {
  axes: GalleryAxis[]
  /** combination key (axis values joined by ' · ') → the N/A reason. Every
   *  other combination renders. */
  na?: Record<string, string>
  /** combination key → an exhibited interface note. */
  notes?: Record<string, string>
}

function matrixCells(spec: MatrixSpec): GalleryCell[] {
  const combos = galleryAxisCombinations(spec.axes)
  const cells: GalleryCell[] = []
  for (let index = 0; index < combos.length; index += 1) {
    const axes = combos[index]
    const values = spec.axes.map((axis) => axes[axis.name])
    const key = values.join(' · ')
    const cell: GalleryCell = { kind: 'render', id: values.join('-'), axes }
    const reason = spec.na !== undefined ? spec.na[key] : undefined
    if (reason !== undefined) {
      cells.push({ kind: 'na', id: values.join('-'), axes, reason })
      continue
    }
    const note = spec.notes !== undefined ? spec.notes[key] : undefined
    if (note !== undefined) (cell as GalleryRenderCell).note = note
    // Driver inference: a state axis that READS hover/focus is the suite's
    // drive instruction — the cell itself renders at rest.
    for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
      const value = values[valueIndex]
      if (value === 'hover' || value === 'focus') (cell as GalleryRenderCell).driver = value
    }
    cells.push(cell)
  }
  return cells
}

/** Every problem found walking the sections (empty = the matrices are
 *  complete and justified — the node suite's core assertion). */
export function galleryMatrixProblems(): string[] {
  const problems: string[] = []
  const sectionIds: string[] = []
  for (let sectionIndex = 0; sectionIndex < GALLERY_SECTIONS.length; sectionIndex += 1) {
    const section = GALLERY_SECTIONS[sectionIndex]
    if (!section.id || !section.id.trim()) {
      problems.push('a section with a blank id')
      continue
    }
    if (sectionIds.indexOf(section.id) !== -1) problems.push(`a duplicate section id "${section.id}"`)
    sectionIds.push(section.id)
    if (!section.axes.length) problems.push(`section "${section.id}" declares no axes`)
    const axisNames: string[] = []
    for (let axisIndex = 0; axisIndex < section.axes.length; axisIndex += 1) {
      const axis = section.axes[axisIndex]
      if (axisNames.indexOf(axis.name) !== -1) problems.push(`section "${section.id}" repeats axis "${axis.name}"`)
      axisNames.push(axis.name)
      if (!axis.values.length) problems.push(`section "${section.id}" axis "${axis.name}" has no values`)
      for (let valueIndex = 0; valueIndex < axis.values.length; valueIndex += 1) {
        if (section.axes[axisIndex].values.indexOf(axis.values[valueIndex], valueIndex + 1) !== -1) {
          problems.push(`section "${section.id}" axis "${axis.name}" repeats value "${axis.values[valueIndex]}"`)
        }
      }
    }
    const seen: Record<string, boolean> = {}
    const cellIds: string[] = []
    for (let cellIndex = 0; cellIndex < section.cells.length; cellIndex += 1) {
      const cell = section.cells[cellIndex]
      if (!cell.id || !cell.id.trim()) problems.push(`section "${section.id}" has a blank cell id`)
      else if (cellIds.indexOf(cell.id) !== -1) problems.push(`section "${section.id}" repeats cell id "${cell.id}"`)
      cellIds.push(cell.id)
      const keys = Object.keys(cell.axes)
      for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        const name = keys[keyIndex]
        const axis = section.axes.find((entry) => entry.name === name)
        if (!axis) problems.push(`cell "${section.id}.${cell.id}" carries an undeclared axis "${name}"`)
        else if (axis.values.indexOf(cell.axes[name]) === -1) problems.push(`cell "${section.id}.${cell.id}" axis "${name}" value "${cell.axes[name]}" is outside the declared alphabet`)
      }
      for (let nameIndex = 0; nameIndex < axisNames.length; nameIndex += 1) {
        if (cell.axes[axisNames[nameIndex]] === undefined) problems.push(`cell "${section.id}.${cell.id}" misses axis "${axisNames[nameIndex]}"`)
      }
      const combination = axisNames.map((name) => cell.axes[name]).join(' · ')
      if (seen[combination]) problems.push(`section "${section.id}" repeats combination "${combination}"`)
      seen[combination] = true
      if (cell.kind === 'na') {
        if (!cell.reason || !cell.reason.trim()) problems.push(`N/A cell "${section.id}.${cell.id}" carries no reason`)
      } else if (cell.driver !== undefined && cell.driver !== 'hover' && cell.driver !== 'focus') {
        problems.push(`cell "${section.id}.${cell.id}" carries an unknown driver "${String(cell.driver)}"`)
      }
    }
    const expected = galleryAxisCombinations(section.axes)
    if (expected.length !== section.cells.length) {
      problems.push(`section "${section.id}" carries ${section.cells.length} cells for ${expected.length} combinations`)
    } else {
      for (let index = 0; index < expected.length; index += 1) {
        const combination = section.axes.map((axis) => expected[index][axis.name]).join(' · ')
        if (!seen[combination]) problems.push(`section "${section.id}" silently skips combination "${combination}"`)
      }
    }
  }
  return problems
}

/** Totals for the surface header and the e2e's DOM-truth walk. */
export function galleryCounts(): { sections: number; cells: number; rendered: number; na: number } {
  let cells = 0
  let rendered = 0
  let na = 0
  for (let index = 0; index < GALLERY_SECTIONS.length; index += 1) {
    const section = GALLERY_SECTIONS[index]
    cells += section.cells.length
    for (let cellIndex = 0; cellIndex < section.cells.length; cellIndex += 1) {
      if (section.cells[cellIndex].kind === 'na') na += 1
      else rendered += 1
    }
  }
  return { sections: GALLERY_SECTIONS.length, cells, rendered, na }
}

export const GALLERY_SECTIONS: GallerySection[] = [
  {
    id: 'button',
    component: 'Button',
    blurb: 'The button API — the closed variant matrix × the machine states. busy = LoaderCircle + aria-busy + disabled (an in-flight action is never also clickable). The hover/focus cells render at rest and are DRIVEN by the suite with the real pointer/keyboard — never a synthetic class.',
    axes: [
      { name: 'variant', values: ['primary', 'secondary', 'ghost', 'danger', 'icon'] },
      { name: 'state', values: ['rest', 'hover', 'focus', 'busy', 'disabled'] },
    ],
    cells: matrixCells({
      axes: [
        { name: 'variant', values: ['primary', 'secondary', 'ghost', 'danger', 'icon'] },
        { name: 'state', values: ['rest', 'hover', 'focus', 'busy', 'disabled'] },
      ],
      notes: {
        'primary · busy': 'busy composes with every variant — the spinner replaces the icon, the geometry stays the surface\'s.',
        'icon · rest': 'icon-only buttons REQUIRE an aria-label — the accessible name is the icon otherwise (buttonWarnFor, dev-time).',
      },
    }),
  },
  {
    id: 'chip',
    component: 'Chip',
    blurb: 'The chip system — tone is what a chip IS (the closed census fold), state is what the user did. selected renders the chip--selected recipe; busy renders aria-busy + the busy recipe.',
    axes: [
      { name: 'tone', values: ['neutral', 'accent', 'danger', 'warning', 'muted'] },
      { name: 'state', values: ['rest', 'selected', 'busy'] },
    ],
    cells: matrixCells({
      axes: [
        { name: 'tone', values: ['neutral', 'accent', 'danger', 'warning', 'muted'] },
        { name: 'state', values: ['rest', 'selected', 'busy'] },
      ],
    }),
  },
  {
    id: 'chip-group',
    component: 'Chip (ChipGroup)',
    blurb: 'The selection semantics — exclusive groups carry the radiogroup contract (controlled value, roving tabindex: the selected chip — or the first — is the group\'s single tab stop; arrows move selection AND focus, wrapping), independent toggles are PRESSED BUTTONS (aria-pressed, never aria-checked). Drive these with clicks and arrow keys.',
    axes: [{ name: 'shape', values: ['radiogroup-none', 'radiogroup-selected', 'toggle-unpressed', 'toggle-pressed'] }],
    cells: matrixCells({
      axes: [{ name: 'shape', values: ['radiogroup-none', 'radiogroup-selected', 'toggle-unpressed', 'toggle-pressed'] }],
      notes: {
        'radiogroup-none': 'nothing selected — the FIRST chip is still the group\'s tab stop (roving tabindex).',
        'toggle-pressed': 'aria-pressed, flipped by the button\'s own Space/Enter activation — never aria-checked (the r3 correction).',
      },
    }),
  },
  {
    id: 'progress',
    component: 'ProgressBar',
    blurb: 'The scalar bar — determinate (the retired fetch width math verbatim: Math.round of the fraction\'s percent) × the compact size step × the tone recipes. Indeterminate is one class-toggle that WINS over value (no width, no aria-value triple). The local tone reads the surface\'s --bar-tone bridge.',
    axes: [
      { name: 'mode', values: ['empty', 'partial', 'full', 'indeterminate'] },
      { name: 'size', values: ['default', 'compact'] },
      { name: 'tone', values: ['accent', 'local'] },
    ],
    cells: matrixCells({
      axes: [
        { name: 'mode', values: ['empty', 'partial', 'full', 'indeterminate'] },
        { name: 'size', values: ['default', 'compact'] },
        { name: 'tone', values: ['accent', 'local'] },
      ],
      notes: {
        'empty · default · accent': 'a missing value renders an empty bar — the role stays, the value triple does not.',
        'indeterminate · default · accent': 'the sweep class suppresses value, width, and aria-value — the census fold of the two retired dialects.',
        'partial · default · local': 'the local fill + track tint read --bar-tone (set here to the info token) — never :root.',
      },
    }),
  },
  {
    id: 'toast',
    component: 'ToastHost',
    blurb: 'The toast strip — PURE PROPS (P07: the adapter owns the store, the timeouts, the window). Each tone announces through its own role (error → alert/assertive; everything else → status/polite), the retained canvas-toast vocabulary renders the item, and the × owns dismissal. The two placements position the host; the fixed one is contained here by the frame\'s transform.',
    axes: [
      { name: 'tone', values: ['error', 'success', 'neutral'] },
      { name: 'placement', values: ['bottom-left', 'bottom-right'] },
    ],
    cells: matrixCells({
      axes: [
        { name: 'tone', values: ['error', 'success', 'neutral'] },
        { name: 'placement', values: ['bottom-left', 'bottom-right'] },
      ],
    }),
  },
  {
    id: 'notice',
    component: 'NoticeBanner',
    blurb: 'The inline banner — the closed tone × role × dismiss matrices. The role renders WITH the aria-live it implies (status→polite, alert→assertive) so the pair can never disagree; the × renders only when onDismiss is supplied and OWNS the one dismiss contract.',
    axes: [
      { name: 'tone', values: ['accent', 'danger'] },
      { name: 'role', values: ['status', 'alert'] },
      { name: 'dismiss', values: ['persistent', 'dismissible'] },
    ],
    cells: matrixCells({
      axes: [
        { name: 'tone', values: ['accent', 'danger'] },
        { name: 'role', values: ['status', 'alert'] },
        { name: 'dismiss', values: ['persistent', 'dismissible'] },
      ],
    }),
  },
  {
    id: 'save-status',
    component: 'SaveStatus',
    blurb: 'The save-state tier — the CLOSED four-state machine. idle is SILENT (renders nothing); saving is the busy idiom; saved the muted confirmation; failed the danger tone at the ≥11px floor with the SERVER REASON verbatim and the retry affordance when onRetry is supplied.',
    axes: [
      { name: 'state', values: ['idle', 'saving', 'saved', 'failed'] },
      { name: 'retry', values: ['absent', 'present'] },
    ],
    cells: matrixCells({
      axes: [
        { name: 'state', values: ['idle', 'saving', 'saved', 'failed'] },
        { name: 'retry', values: ['absent', 'present'] },
      ],
      na: {
        'idle · present': 'the retry affordance renders only on the failed state — onRetry supplied while idle would be silently dropped (saveStatusWarnFor flags it).',
        'saving · present': 'the retry affordance renders only on the failed state — nothing has failed while a save is in flight.',
        'saved · present': 'the retry affordance renders only on the failed state — a landed save has nothing to retry.',
      },
      notes: {
        'idle · absent': 'SILENT by contract: the component renders nothing at rest — the empty stage under this label IS the exhibit.',
        'failed · present': 'detail is the SERVER REASON, rendered verbatim; retry re-runs the caller\'s seam.',
      },
    }),
  },
  {
    id: 'refusal',
    component: 'Refusal',
    blurb: 'The honest-no tier — a PRECONDITION gate, facts plainly: title (WHAT is refused), reason (WHY), and the optional satisfy escape hatch. The warning tone, never danger: a refusal is a state, not a failure. A satisfy-less refusal stands on its reason — never a fabricated affordance.',
    axes: [{ name: 'satisfy', values: ['absent', 'present'] }],
    cells: matrixCells({
      axes: [{ name: 'satisfy', values: ['absent', 'present'] }],
      notes: {
        'absent': 'no remedy exists here — the refusal stands on its reason (the caller\'s honest call).',
        'present': 'the satisfy action is caller-supplied: the component states the refusal, it never resolves it.',
      },
    }),
  },
  {
    id: 'handoff',
    component: 'HandoffResult',
    blurb: 'The write ≠ refresh tier — the FULL 3×4 write×refresh matrix. The two facts are INDEPENDENT per step: a failed refresh after a landed write renders DONE-WITH-STALE-MARKER (warning tone inside a polite row), never failed; the danger tone, the alert, and the retry belong to a failed fact alone.',
    axes: [
      { name: 'write', values: ['pending', 'done', 'failed'] },
      { name: 'refresh', values: ['pending', 'fresh', 'stale', 'failed'] },
    ],
    cells: matrixCells({
      axes: [
        { name: 'write', values: ['pending', 'done', 'failed'] },
        { name: 'refresh', values: ['pending', 'fresh', 'stale', 'failed'] },
      ],
      na: {
        'pending · fresh': 'the refresh is the write\'s companion fact — it never resolves before the write lands (handoffRefreshText renders no marker beside an unlanded write).',
        'pending · stale': 'the refresh is the write\'s companion fact — an unresolved write has no staleness claim to make.',
        'pending · failed': 'the refresh is the write\'s companion fact — the refresh attempt only runs after its write lands.',
        'failed · fresh': 'a failed write\'s refresh never ran — the step carries only its write failure and the retry.',
        'failed · stale': 'a failed write\'s refresh never ran — there is no landed write for the view to be stale about.',
        'failed · failed': 'write and refresh failures are mutually exclusive at real states — the refresh only runs after its write lands.',
      },
      notes: {
        'pending · pending': 'the spinner is the pending write\'s whole idiom — this interface has no queued-versus-busy distinction (the T22 review\'s queued-spinner note: \'pending\' covers both).',
        'done · pending': 'an in-flight refresh renders as this silent cell — the interface has no refresh-busy idiom of its own (the T22 review\'s refresh-busy note; a future spinner arm would live on the refresh fact).',
        'done · stale': 'the standing condition: the view is known not to reflect the landed write. No retry — the caller failed nothing.',
        'done · failed': 'the failed ATTEMPT: \'not refreshed\' + the refresh affordance — the cheaper act that never re-runs the landed write.',
      },
    }),
  },
  {
    id: 'effective-row',
    component: 'EffectiveSettingRow',
    blurb: 'The origin ≠ outcome display tier — WHERE the effective value comes from × the tried-but-not-in-force ATTEMPT × the reset affordance. An override renders its level as a chip; auto renders the plain auto/default text and NEVER a fabricated level; a refused/degraded pick rides its own chip (danger/warning) without rewriting the effective value.',
    axes: [
      { name: 'origin', values: ['auto', 'node', 'chain', 'global'] },
      { name: 'attempt', values: ['none', 'refused', 'degraded'] },
      { name: 'reset', values: ['absent', 'present'] },
    ],
    cells: matrixCells({
      axes: [
        { name: 'origin', values: ['auto', 'node', 'chain', 'global'] },
        { name: 'attempt', values: ['none', 'refused', 'degraded'] },
        { name: 'reset', values: ['absent', 'present'] },
      ],
      na: {
        'node · none · absent': 'the node level exists in the row\'s vocabulary for a future per-node seam — no resolver emits one today (the T19 ruling); exhibiting a fabricated node pick would lie.',
        'node · none · present': 'the node level has no resolver (the T19 ruling) — there is no honest node pick to exhibit, with or without a reset.',
        'node · refused · absent': 'no resolver emits node-level picks, so no node-level refusal can exist either.',
        'node · refused · present': 'no resolver emits node-level picks — the entire node column is vocabulary, not states.',
        'node · degraded · absent': 'no resolver emits node-level picks — the entire node column is vocabulary, not states.',
        'node · degraded · present': 'no resolver emits node-level picks — the entire node column is vocabulary, not states.',
        'auto · none · present': 'the row owns no override to reset — onReset against an auto origin would render an affordance with nothing to reset (effectiveRowWarnFor flags it).',
        'auto · refused · present': 'the row owns no override to reset — the refused ATTEMPT is carried as a chip, but resetting happens at the level that holds the pick, never here.',
        'auto · degraded · present': 'the row owns no override to reset — the degraded attempt is a chip on this row, not a pick this row can clear.',
      },
      notes: {
        'auto · refused · absent': 'origin ≠ outcome in one cell: the pick was REFUSED, so the effective value fell back to auto — the attempt rides its own chip beside it.',
        'chain · none · present': 'the reset reveals the layer beneath (the standing global pick, or auto) and deletes nothing upstream.',
        'global · degraded · absent': 'environmental drift: rendering proceeds on the degraded pick\'s fallback — the warning chip, never danger.',
      },
    }),
  },
  {
    id: 'field',
    component: 'Field',
    blurb: 'The form-field association tier — the precedence matrix error > hint > silent as ONE description slot. The wiring is real: the label\'s htmlFor and the control\'s aria-describedby both resolve through the cloned control\'s id; silent carries NO aria-describedby at all (never a dangling ref).',
    axes: [
      { name: 'error', values: ['absent', 'present'] },
      { name: 'hint', values: ['absent', 'present'] },
    ],
    cells: matrixCells({
      axes: [
        { name: 'error', values: ['absent', 'present'] },
        { name: 'hint', values: ['absent', 'present'] },
      ],
      notes: {
        'absent · absent': 'SILENT: the control carries no aria-describedby at all — absence is the contract, not a missing wire.',
        'present · present': 'precedence: the error alone describes the control — the hint element leaves the DOM entirely.',
      },
    }),
  },
  {
    id: 'select',
    component: 'StudioSelect',
    blurb: 'The one styled NATIVE select — the platform semantics (dropdown, typeahead, EAGER value capture) with the affordances the bare select never had: the chevron over the retired platform arrow, ellipsis overflow for long option text, visible focus. The form tier rides the retained .select-wrap geometry.',
    axes: [
      { name: 'wrap', values: ['bare', 'form'] },
      { name: 'content', values: ['short', 'long'] },
    ],
    cells: matrixCells({
      axes: [
        { name: 'wrap', values: ['bare', 'form'] },
        { name: 'content', values: ['short', 'long'] },
      ],
      notes: {
        'bare · long': 'long option text truncates with an ellipsis — never spills the control.',
        'form · short': 'wrapClassName="select-wrap": the retained 38px house form row, block-level like the div it replaced.',
      },
    }),
  },
  {
    id: 'popover',
    component: 'PopoverMenu',
    blurb: 'The ONE dismissal idiom for anchored menus — a routed Escape closes exactly the TOPMOST registered layer (Base UI\'s own document-level Escape never sees the routed keystroke), outside-press lands in the same onClose, and the local arrows walk the enabled rows (disabled rows cannot hold focus). The F8 clamp keeps the whole menu inside the viewport.',
    axes: [{ name: 'backdrop', values: ['absent', 'present'] }],
    cells: matrixCells({
      axes: [{ name: 'backdrop', values: ['absent', 'present'] }],
      na: {
        'absent': 'the no-backdrop path is LATENT (no consumer): the popup portals with neither the fixed anchor wrapper nor stacking — an in-panel consumer needs the portal-container extension first. There is no honest demo of it yet.',
      },
      notes: {
        'present': 'the canvas idiom: the dimmed backdrop (Base UI owns the click-close) + the fixed anchor wrapper the component clamps.',
      },
    }),
  },
  {
    id: 'dock',
    component: 'StudioDock',
    blurb: 'The dock shell — the Rnd, the reactive rank (registration rides the mount; a grab anywhere re-raises), the shared header recipe (the drag handle IS the header), the close affordance, and the resize wiring per policy (the common gate grows down/right only, so a resize can never drag the title bar off the viewport). Drag the headers; grab raises.',
    axes: [{ name: 'band', values: ['solo', 'stacked-pair'] }],
    cells: matrixCells({
      axes: [{ name: 'band', values: ['solo', 'stacked-pair'] }],
      notes: {
        'solo': 'one dock in the arena — drag the header, resize from the bottom/right edges, close and restore it.',
        'stacked-pair': 'two docks share the band: z = calc(var(--z-dock-base) + rank), consecutive and renormalized — grab either header and watch it raise.',
      },
    }),
  },
  {
    id: 'dialogs',
    component: 'ConfirmDialog + PromptDialog',
    blurb: 'The shared asks — behavior entirely the dialog stack\'s (Base UI focus trap/restore + outside-press, the registry routing Escape topmost-only). ConfirmDialog resolves true ONLY from the confirm action (danger swaps the Button recipe, nothing else). PromptDialog\'s outcome contract is hard: null = cancelled, \'\' = submitted-empty — never coalesce them.',
    axes: [{ name: 'shape', values: ['confirm-neutral', 'confirm-danger', 'prompt-empty', 'prompt-prefilled'] }],
    cells: matrixCells({
      axes: [{ name: 'shape', values: ['confirm-neutral', 'confirm-danger', 'prompt-empty', 'prompt-prefilled'] }],
      notes: {
        'confirm-danger': 'the destructive frame: the confirm action renders the danger Button recipe — the only thing danger changes.',
        'prompt-empty': 'press OK on the empty field and the readout shows "" — the caller APPLIES the empty value (the retired ?? \'\' ran the default batch on cancel instead).',
        'prompt-prefilled': 'the initial prop — T15 shipped it interface-faithful with no production consumer exercising it; this gallery is that arm\'s first exercised home.',
      },
    }),
  },
  {
    id: 'layers',
    component: 'The layer registry (stacking demos)',
    blurb: 'The layer registry stacking demos — layers register in open order and one routed Escape closes exactly the TOPMOST. Open the lower ask, then the upper surface from inside it: the first Escape unwinds only the top layer; everything beneath survives the press.',
    axes: [{ name: 'stack', values: ['dialog-over-dialog', 'popover-over-dialog'] }],
    cells: matrixCells({
      axes: [{ name: 'stack', values: ['dialog-over-dialog', 'popover-over-dialog'] }],
      notes: {
        'dialog-over-dialog': 'two modal asks: the upper registers after the lower, so it IS the topmost — one Escape, one dismissal.',
        'popover-over-dialog': 'an anchored menu over a modal ask: the menu registered later, so the Escape is its — the dialog survives the press.',
      },
    }),
  },
]
