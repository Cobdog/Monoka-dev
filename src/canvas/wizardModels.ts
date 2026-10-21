/**
 * The Models step's derivations (wizard rework task 5, spec §2.2; reshaped
 * by the friction rulings of 2026-10-21) — the pure view builder between
 * the stack report and the step's JSX, kept beside the walk's spine
 * (wizardWalk.ts stays the designations + gates module; the modularity
 * contract: this slot pulls out as one module + one component).
 *
 * Everything the step renders is derived here so the unit suite can pin the
 * EXACT output the JSX renders:
 *
 *   - THE TWO-AXIS ROW GRAMMAR (friction 2026-10-21: "How do I know which
 *     have been detected, which are selected by default") — every row
 *     answers DETECTED vs MISSING first (the engine's own listing), and a
 *     detected row names its SELECTED file (the resolved pick, what
 *     generation will actually use) with its ALTERNATES (detected files of
 *     the same shape that are not the pick) rendered as clearly secondary.
 *   - THE MANUAL DOWNLOAD LINK (friction 2026-10-21: "we at least for now
 *     just give the user the download link, they manually fetch the model
 *     themselves, and are told where to place it") — a MISSING component
 *     the fetch catalog covers renders the direct URL plus the placement
 *     path: ComfyUI-relative for external engines (the instance is the
 *     model management — the studio never guesses an absolute landing
 *     spot), absolute under the studio-owned checkout for managed engines.
 *     NO studio-side download exists on this step — no click, no consent,
 *     no gate. The endgame the ruling names (downloads THROUGH the
 *     ComfyUI instance, into its own correct folders — "more hands off,
 *     more better") replaces this row's pointing finger later; see
 *     COMPONENT_LINK_ROWS in wizardWalk.ts.
 *   - The closed identity vocabulary read from the RESOLVED files' own
 *     payload blocks with the reserved interim word (to7xpa7: per-row
 *     `verifying` first, the whole-step flag as the degraded fallback).
 *   - The merged-pick offer (a hash-confirmed hybrid names itself; the
 *     click sets ONLY the merged override).
 *
 * The verdict line is NOT built here: it is h3Stack's stackVerdictText —
 * the same module that owns the predicate — so there is exactly one place
 * that can voice readiness.
 */
import { basenameOf, MERGED_SLOT_ARTIFACT, identityConfirmsArtifact, slotCandidates, type SelectionSlotKey } from '../lib/modelSelection'
import type { H3StackSlotRow } from '../lib/h3Stack'
import type { FetchEntryStatus, FetchSource, ModelFile } from '../types'
import { COMPONENT_LINK_ROWS } from './wizardWalk'

/** The identity vocabulary is CLOSED (spec §2.2): a present row is
 *  `hash-confirmed` (bytes verified — the catalog wave's digests),
 *  `name-suspected` (identified by name — today's honest fallback for every
 *  row), or `unknown`. No fourth label may appear. */
export const IDENTITY_LABELS = ['hash-confirmed', 'name-suspected', 'unknown'] as const
export type IdentityLabel = (typeof IDENTITY_LABELS)[number]

/** The reserved interim word, spec-verbatim: rendered ONLY while a digest
 *  is in flight, beside a not-yet-confirmed label — "identified by name FOR
 *  NOW" is the honest sentence. Since to7xpa7 the per-row `verifying`
 *  marker drives it; the whole-step boolean remains the degraded fallback
 *  for rows the payload carried no block for. */
export const DIGEST_INTERIM_COPY = 'verifying bytes — identified by name for now'

/** (friction 2026-10-21) The selected chip's words — the row's answer to
 *  "which are selected by default": the named pick IS what generation will
 *  use. */
export const SELECTED_CHIP_COPY = 'Selected — generation uses this file'

/** (friction 2026-10-21) The alternates lead-in — the detected-but-not-
 *  picked files, clearly secondary to the selection above them. */
export const ALTERNATES_LEAD_COPY = 'Also detected (not selected):'

/** (friction 2026-10-21) The one-click an alternate offers through the
 *  existing override seam (rendered only where the slot has a seam). */
export const ALTERNATE_SELECT_COPY = 'Select instead'

/** (friction 2026-10-21) The missing-row lead-in: DETECTION is the axis —
 *  the engine's own listing answers it, nothing else. */
export const MISSING_LEAD_COPY = 'Not detected — '

/** (friction 2026-10-21) The link row's truth line: the studio does not
 *  download; the engine instance is the model management; the engine lists
 *  the file only after its own folder re-scan or a restart. */
export const LINK_ROW_NOTE_COPY = 'The studio does not download models — your engine instance manages them. The engine lists the file after its own folder re-scan or a restart.'

/** (friction 2026-10-21) The placement labels: external engines get the
 *  ComfyUI-relative path (never a guessed absolute landing spot); managed
 *  engines get the absolute path under the checkout the studio owns. */
export const LINK_PLACE_RELATIVE_COPY = 'place it at (relative to your ComfyUI folder):'
export const LINK_PLACE_ABSOLUTE_COPY = 'place it at:'

/** One file of a manual download link: the direct URL the user opens
 *  themselves and the path the fetched file must land at so the ENGINE
 *  reads it. No click state, no consent, no gate — the studio-side
 *  download is gone, not disabled (friction 2026-10-21). */
export type ComponentLinkFile = {
  name: string
  url: string
  placeAt: string
}

export type ComponentLinkView = {
  entryId: string
  /** Which placement spelling `placeAt` carries — the JSX renders the
   *  matching label. */
  placeKind: 'comfy-relative' | 'absolute'
  files: ComponentLinkFile[]
  licenseSpdx: string
  licenseNote?: string
  licenseUrl?: string
  sizeClass?: string
}

export type ModelsStepRow = {
  label: string
  slot: H3StackSlotRow['slot']
  tier: H3StackSlotRow['tier']
  kind: ModelFile['kind']
  /** Axis (a) — DETECTED: the engine's own registry lists a file the slot
   *  can use. Presence is the whole truth for the link row too: a detected
   *  component never renders a download at any evidence level. */
  present: boolean
  /** Axis (b) — SELECTED: the resolved pick verbatim ('' when nothing
   *  resolves) — the file generation will actually use. */
  selectedName: string
  /** Axis (b) — ALTERNATES: detected files of the slot's shape that are
   *  NOT the pick, rendered clearly secondary (each may offer the
   *  select-instead click where the slot has an override seam). */
  alternates: Array<{ name: string; basename: string }>
  /** 'override' | 'inferred' | '' — which layer produced the pick. */
  source: string
  /** Display guidance: the official artifact + what naming resolves. */
  canonical: string
  isCanonical: boolean
  refusal: string
  makeVisible: string
  /** The closed-vocabulary label — the RESOLVED file's own block when the
   *  payload carries one (to7xpa7), else the name-only fallback for a
   *  present row; '' when nothing is present to identify. */
  identity: IdentityLabel | ''
  /** The interim word rides a per-row `verifying` marker FIRST (to7xpa7),
   *  falling back to the whole-step `digestInFlight` option only where the
   *  payload carries no block at all (degraded mode). */
  interim: boolean
  /** clean = one anchored candidate; picked = the resolution chose among
   *  several; ambiguous = the fallback needle chose loosely (the row names
   *  its candidates and offers the override seam); missing = nothing. */
  narration: 'clean' | 'picked' | 'ambiguous' | 'missing'
  candidates: { names: string[]; picked: string; others: string[]; basis: 'hash' | 'anchored' | 'fallback' | '' }
  /** The override slot the select-instead click designates through; '' when
   *  the slot has no override seam (the turbo rows). */
  overrideSlot: string
  /** The manual download link (missing rows the catalog covers). */
  link: ComponentLinkView | null
  /** (to7xpa7) The one-click merged-pick affordance on the fl2va row: a
   *  hash-confirmed `hybrid` anywhere in the registry NAMES itself here —
   *  the merged slot never auto-infers, so the offer (through the existing
   *  merged override slot) is the only road in. Never a silent load. */
  mergedPickOffer?: { name: string; summary: string }
}

export type ModelsStepRowOptions = {
  /** The to7xpa7 catalog contract's seam — nothing drives it today. */
  digestInFlight?: boolean
  /** (friction 2026-10-21) The engine mode + the walk's models-root value —
   *  the link row's placement derives from them: external engines get the
   *  ComfyUI-relative path (the instance is the model management; no
   *  guessed landing spots), managed engines the absolute path under the
   *  checkout the studio owns. */
  engineMode?: string
  modelsRoot?: string
}

/** The merged-pick offer's identity summary — the catalog fields a human
 *  needs to recognize the artifact, one join, no prose invention. */
function identitySummaryOf(file: ModelFile): string {
  const identity = file.identity
  if (!identity) return ''
  return [identity.family, identity.artifact, identity.variant, identity.quant].filter(Boolean).join(' · ')
}

/** The direct download URL for one catalog file — the same URL shape the
 *  fetcher itself downloads from (server/fetcher.ts): the pinned revision's
 *  HF resolve URL (dataset repos under /datasets), or the git source's own
 *  URL. A branch pin resolves at HEAD when the user opens it — a moving
 *  link for a moving pin, stated by its nature. */
function catalogDownloadUrl(source: FetchSource, path: string): string {
  if (source.kind === 'git') return source.url
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `https://huggingface.co/${source.dataset ? 'datasets/' : ''}${source.repo}/resolve/${source.revision.value}/${encoded}`
}

const trimTrailingSeparators = (value: string) => value.replace(/[\\/]+$/, '')

/** Build the manual download link for a MISSING component the catalog
 *  covers — the ruling's "give the user the download link, tell them where
 *  to place it". null when the entry cannot spell a per-file link (a
 *  whole-tree git entry, a non-model-root destination): the row then keeps
 *  its publisher-direct copy instead of a half-promise. */
function buildLinkView(entry: FetchEntryStatus, options: ModelsStepRowOptions): ComponentLinkView | null {
  const destination = entry.destination
  if (destination.kind !== 'model-root') return null
  const files = entry.files ?? []
  if (files.length === 0) return null
  const managed = options?.engineMode === 'managed'
  const root = (options?.modelsRoot ?? '').trim()
  const absolute = managed && root !== ''
  return {
    entryId: entry.id,
    placeKind: absolute ? 'absolute' : 'comfy-relative',
    files: files.map((file) => ({
      name: file.path,
      url: catalogDownloadUrl(entry.source, file.path),
      placeAt: absolute
        ? `${trimTrailingSeparators(root)}/${destination.root}/${file.path}`
        : `models/${destination.root}/${file.path}`,
    })),
    licenseSpdx: entry.licenseSpdx,
    ...(entry.licenseNote ? { licenseNote: entry.licenseNote } : {}),
    ...(entry.licenseUrl ? { licenseUrl: entry.licenseUrl } : {}),
    ...(entry.sizeClass ? { sizeClass: entry.sizeClass } : {}),
  }
}

/** Build the step's rows. `report` is h3StackReport's output (its rows
 *  carry slot/tier/overrideSlot); `catalog` is the served fetch catalog as
 *  FetchEntryStatus[]; `models` feeds the candidate enumeration AND the
 *  identity labels — each row reads the RESOLVED file's own identity block
 *  (to7xpa7), falling back to the name-only labels where the payload
 *  carries none (degraded mode, bit-identical to the pre-catalog output). */
export function modelsStepRows(models: ModelFile[], report: { rows: H3StackSlotRow[] }, catalog: FetchEntryStatus[], options?: ModelsStepRowOptions): ModelsStepRow[] {
  const digestInFlight = options?.digestInFlight === true
  // (to7xpa7) The one-click merged-pick offer: a hash-confirmed hybrid
  // ANYWHERE in the registry names itself on the fl2va row. The merged slot
  // never auto-infers (the deliberate exception); the offer — through the
  // existing merged override slot, rq0lsax's seam — is the only road in.
  const hybrid = models.find((model) => identityConfirmsArtifact(model, [MERGED_SLOT_ARTIFACT]))
  const mergedPickOffer = hybrid ? { name: hybrid.name, summary: identitySummaryOf(hybrid) } : undefined
  return report.rows.map((row) => {
    const candidateSet = slotCandidates(models, row.slot as SelectionSlotKey, row.tier)
    const narration: ModelsStepRow['narration'] = !candidateSet.picked
      ? 'missing'
      : candidateSet.basis === 'fallback'
        ? 'ambiguous'
        : candidateSet.names.length > 1 ? 'picked' : 'clean'
    const resolvedFile = row.present && row.selected ? models.find((model) => model.name === row.selected) : undefined
    const block = resolvedFile ? resolvedFile.identity : undefined
    const identity: ModelsStepRow['identity'] = block && IDENTITY_LABELS.indexOf(block.verdict) !== -1
      ? block.verdict
      : row.present ? 'name-suspected' : ''
    // Per-row `verifying` wins; the whole-step boolean covers only rows the
    // payload carried NO block for (a settled block — any verdict — never
    // wears "verifying" again).
    const interim = row.present && (block ? block.verifying === true : digestInFlight)
    const mappedId = COMPONENT_LINK_ROWS[row.label]
    const entry = mappedId
      ? catalog.find((candidate) => candidate.id === mappedId && !candidate.removedAt)
      : undefined
    // (friction 2026-10-21) The manual download link renders ONLY on a
    // MISSING row — the engine's own listing answers detection, and a
    // detected component (name-suspected or hash-confirmed alike) never
    // gets download pressure beside it.
    const link: ComponentLinkView | null = mappedId && entry && !row.present
      ? buildLinkView(entry, options ?? {})
      : null
    return {
      label: row.label,
      slot: row.slot,
      tier: row.tier,
      kind: row.kind,
      present: row.present,
      selectedName: row.selected,
      alternates: candidateSet.names
        .filter((name) => name !== candidateSet.picked)
        .map((name) => ({ name, basename: basenameOf(name) })),
      source: row.source,
      canonical: row.canonical,
      isCanonical: row.isCanonical,
      refusal: row.refusal ?? '',
      makeVisible: row.makeVisible,
      identity,
      interim,
      narration,
      candidates: {
        names: candidateSet.names,
        picked: candidateSet.picked,
        others: candidateSet.names.filter((name) => name !== candidateSet.picked),
        basis: candidateSet.basis,
      },
      overrideSlot: row.overrideSlot ?? '',
      link,
      ...(mergedPickOffer && row.slot === 'fl2va' ? { mergedPickOffer } : {}),
    }
  })
}

/** Whether the entry's fetch has landed, read from the CATALOG's own state
 *  (review F1): 'placed' is the fetcher's install record, 'present' is
 *  matching files already at the destination. This survives the mid-walk
 *  scan's remount by construction — component-local `started` memory does
 *  not — so the post-click render derives from here; `started` only bridges
 *  the ≤2s gap between the click and the next catalog poll. The parameter
 *  is the structural minimum so the packs step's bare catalog entries read
 *  the SAME rule (review round, 3p14abm) — never a re-encoding beside it.
 *  (friction 2026-10-21: the Models step no longer consumes this — the
 *  packs step's fetcher arm is the rule's one home now.) */
export function fetchLanded(view: { catalogState: FetchEntryStatus['state'] }): boolean {
  return view.catalogState === 'placed' || view.catalogState === 'present'
}
