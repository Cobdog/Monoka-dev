/**
 * The Models step's derivations (wizard rework task 5, spec §2.2) — the
 * pure view builder between the stack report and the step's JSX, kept beside
 * the walk's spine (wizardWalk.ts stays the designations + gates module; the
 * modularity contract: this slot pulls out as one module + one component).
 *
 * Everything the step renders is derived here so the unit suite can pin the
 * EXACT output the JSX renders: the five named per-component rows (resolved
 * name verbatim, source layer, presence, canonical hint, refusal,
 * make-visible guidance — the bare counts died with this task), the closed
 * identity vocabulary with the reserved interim word (the to7xpa7 catalog
 * contract drives the digest flag; always false until that wave), the
 * picked/ambiguous candidate narration (through slotCandidates — the same
 * ladders the picker reads, no second truth), and the one-click fetch views
 * (COMPONENT_FETCH_ROWS ∩ the served catalog, license verdict riding the
 * row, gated on the walk's models-root designation per D7).
 *
 * The verdict line is NOT built here: it is h3Stack's stackVerdictText —
 * the same module that owns the predicate — so there is exactly one place
 * that can voice readiness.
 */
import { slotCandidates, type SelectionSlotKey } from '../lib/modelSelection'
import type { H3StackSlotRow } from '../lib/h3Stack'
import type { FetchEntryStatus, ModelFile } from '../types'
import { COMPONENT_FETCH_ROWS } from './wizardWalk'

/** The identity vocabulary is CLOSED (spec §2.2): a present row is
 *  `hash-confirmed` (bytes verified — the catalog wave's digests),
 *  `name-suspected` (identified by name — today's honest fallback for every
 *  row), or `unknown`. No fourth label may appear. */
export const IDENTITY_LABELS = ['hash-confirmed', 'name-suspected', 'unknown'] as const
export type IdentityLabel = (typeof IDENTITY_LABELS)[number]

/** The reserved interim word, spec-verbatim: rendered ONLY while a digest
 *  is in flight, beside the name-suspected label — "identified by name FOR
 *  NOW" is the honest sentence. The boolean is the to7xpa7 catalog
 *  contract's seam; nothing drives it today, so it is always false. */
export const DIGEST_INTERIM_COPY = 'verifying bytes — identified by name for now'

/** One row's fetch view: the catalog entry the click would consent to and
 *  start (W-I6 — the click IS the consent), with the license verdict ON the
 *  row. `gated` is D7's honest downgrade: true until the walk's models root
 *  verifies, and the row says why instead of offering the click. */
export type ComponentFetchView = {
  entryId: string
  licenseSpdx: string
  licenseNote?: string
  licenseUrl?: string
  sizeClass?: string
  /** The catalog's own state for the entry; '' never happens on a rendered
   *  view (a mapped id absent from the served catalog renders NO view). */
  catalogState: FetchEntryStatus['state']
  inFlight: boolean
  /** The destination root the fetcher places into (model-root entries). */
  destRoot: string
  gated: boolean
}

export type ModelsStepRow = {
  label: string
  slot: H3StackSlotRow['slot']
  tier: H3StackSlotRow['tier']
  kind: ModelFile['kind']
  /** The RESOLVED registry name verbatim ('' when nothing resolves). */
  name: string
  present: boolean
  /** 'override' | 'inferred' | '' — which layer produced the name. */
  source: string
  /** Display guidance: the official artifact + what naming resolves. */
  canonical: string
  isCanonical: boolean
  refusal: string
  makeVisible: string
  /** The closed-vocabulary label; '' when nothing is present to identify. */
  identity: IdentityLabel | ''
  /** The interim word rides only a digest in flight (to7xpa7; false today). */
  interim: boolean
  /** clean = one anchored candidate; picked = the ladder chose among
   *  several; ambiguous = the fallback needle chose loosely (the row names
   *  its candidates and offers the override seam); missing = nothing. */
  narration: 'clean' | 'picked' | 'ambiguous' | 'missing'
  candidates: { names: string[]; picked: string; others: string[]; basis: 'anchored' | 'fallback' | '' }
  /** The override slot the ambiguous pick designates through; '' when the
   *  slot has no override seam (the turbo rows). */
  overrideSlot: string
  fetch: ComponentFetchView | null
}

export type ModelsStepRowOptions = {
  /** The to7xpa7 catalog contract's seam — nothing drives it today. */
  digestInFlight?: boolean
  /** The walk's models-root designation verdict (isDesignated). Defaults
   *  FALSE: a caller that forgets the option gets the gated row, never an
   *  ungated fetch (D7 fails safe). */
  designated?: boolean
}

/** Build the step's rows. `report` is h3StackReport's output (its rows
 *  carry slot/tier/overrideSlot); `catalog` is the served fetch catalog as
 *  FetchEntryStatus[]; `models` feeds the candidate enumeration. */
export function modelsStepRows(models: ModelFile[], report: { rows: H3StackSlotRow[] }, catalog: FetchEntryStatus[], options?: ModelsStepRowOptions): ModelsStepRow[] {
  const digestInFlight = options?.digestInFlight === true
  const designated = options?.designated === true
  return report.rows.map((row) => {
    const candidateSet = slotCandidates(models, row.slot as SelectionSlotKey, row.tier)
    const narration: ModelsStepRow['narration'] = !candidateSet.picked
      ? 'missing'
      : candidateSet.basis === 'fallback'
        ? 'ambiguous'
        : candidateSet.names.length > 1 ? 'picked' : 'clean'
    const mappedId = COMPONENT_FETCH_ROWS[row.label]
    const entry = mappedId
      ? catalog.find((candidate) => candidate.id === mappedId && !candidate.removedAt)
      : undefined
    const fetch: ComponentFetchView | null = mappedId && entry
      ? {
        entryId: entry.id,
        licenseSpdx: entry.licenseSpdx,
        ...(entry.licenseNote ? { licenseNote: entry.licenseNote } : {}),
        ...(entry.licenseUrl ? { licenseUrl: entry.licenseUrl } : {}),
        sizeClass: entry.sizeClass,
        catalogState: entry.state,
        inFlight: entry.inFlight === true,
        destRoot: entry.destination && entry.destination.kind === 'model-root' ? entry.destination.root : '',
        gated: !designated,
      }
      : null
    return {
      label: row.label,
      slot: row.slot,
      tier: row.tier,
      kind: row.kind,
      name: row.selected,
      present: row.present,
      source: row.source,
      canonical: row.canonical,
      isCanonical: row.isCanonical,
      refusal: row.refusal ?? '',
      makeVisible: row.makeVisible,
      identity: row.present ? 'name-suspected' : '',
      interim: row.present && digestInFlight,
      narration,
      candidates: {
        names: candidateSet.names,
        picked: candidateSet.picked,
        others: candidateSet.names.filter((name) => name !== candidateSet.picked),
        basis: candidateSet.basis,
      },
      overrideSlot: row.overrideSlot ?? '',
      fetch,
    }
  })
}

/** Whether the entry's fetch has landed, read from the CATALOG's own state
 *  (review F1): 'placed' is the fetcher's install record, 'present' is
 *  matching files already at the destination. This survives the mid-walk
 *  scan's remount by construction — component-local `started` memory does
 *  not — so the post-click render derives from here; `started` only bridges
 *  the ≤2s gap between the click and the next catalog poll. */
export function fetchLanded(view: ComponentFetchView): boolean {
  return view.catalogState === 'placed' || view.catalogState === 'present'
}
