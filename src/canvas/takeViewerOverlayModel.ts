/**
 * The take viewer overlay's pure model (foelihc T4, spec §2 + §6.2) — the
 * open contract (the affordance gate every open path consults), the header
 * fields, the used-by chips (§6.2's reverse view), and the take chips, as
 * ONE VM-testable spine. The wizardWalk shape (the repo has no
 * React-executing unit harness): src/canvas/TakeViewerOverlay.tsx is a thin
 * shell over this module — tests/takevieweroverlay.test.js pins these
 * contracts through the VM harness plus the canvas suite's source grep-pins
 * for the shell wiring; the rendered behavior is e2e-owned (T7's legs).
 *
 * Spec: docs/specs/2026-10-17-take-viewer.md §2 (open paths + the honest
 * absence ladder), §3 (the take-switching row), §6.1 (the compare
 * candidates the picker offers), §6.2 (the used-by v1 minimal), §8 D5
 * (one transport — the bar's play chip becomes `review`).
 *
 * CANVAS-side but store-free: derive.ts's projections in, decisions out.
 */
import { chainTitle, compareCandidates, takeNumberOf, usedBy, type CanvasDocument, type CompareCandidate, type DocumentChain, type DocumentTake } from './derive'

// ---------------------------------------------------------- the open contract

/** What one tile's review affordance renders. The three shapes map to the
 *  spec's §2 ladder:
 *    enabled — a reviewable canonical take exists; every open path fires.
 *    gated   — takeless: the BAR's chip renders disabled WITH ITS REASON
 *              (the R-22 gate idiom — enforce + teach); the tile-side
 *              affordances render nothing (no dead click).
 *    absent  — no affordance at all, anywhere: a gone (tombstoned) chain,
 *              or an audio take (§7's honest absence — no viewer in v1). */
export type ReviewGate =
  | { state: 'enabled'; takeId: string }
  | { state: 'gated'; reason: string }
  | { state: 'absent' }

/** The bar's takeless reason: states the fact, points forward. */
export const REVIEW_REASON_TAKELESS: string = 'No take to review yet — this object has nothing to watch.'

/** The mid-render takeless reason (audit T-M4: the two mid-render shapes
 *  read consistently — WITH a prior take the chip is enabled, without it the
 *  chip says why). */
export const REVIEW_REASON_GENERATING: string = 'Still generating — no take to review yet.'

/** The gate's input — the Tile fields the decision reads (structural, so
 *  the suite builds plain objects and the bar/tile pass their tile). Null =
 *  no tile at all (the chain is gone — tombstoned between renders). */
export type ReviewGateInput = {
  canonical: { id: string } | null
  mediaKind: 'image' | 'video' | 'audio' | null
  status: string
} | null

/** The ONE open gate every path consults (spec §2: "the affordance exists
 *  exactly where a reviewable canonical take exists"). Deliberately
 *  band-free — R2 probed review gestures at 400 % zoom and the double-click
 *  must not be gated by semantic zoom. A landing-errored take IS enabled:
 *  it opens, on its humanized verdict (the verdictOnly surface). */
export function reviewAffordance(tile: ReviewGateInput): ReviewGate {
  if (!tile) return { state: 'absent' }
  if (tile.canonical && tile.mediaKind === 'audio') return { state: 'absent' }
  if (tile.canonical) return { state: 'enabled', takeId: tile.canonical.id }
  const midRender = tile.status === 'running' || tile.status === 'queued-gpu'
  return { state: 'gated', reason: midRender ? REVIEW_REASON_GENERATING : REVIEW_REASON_TAKELESS }
}

/** The tile-side rule (double-click, hover affordance): ONLY an enabled
 *  gate opens — a gated or absent gate is not a dead click, nothing fires. */
export function opensViewer(gate: ReviewGate): boolean {
  return gate.state === 'enabled'
}

// ------------------------------------------------------------- the header row

/** The viewer header's derived fields (spec §2: chainTitle · take n of N ·
 *  duration · resolution — the used-by line is the chips below). Absent
 *  metrics render null fields, never invented ones. */
export type ViewerHeader = {
  title: string
  takeLabel: string
  durationLabel: string | null
  resolutionLabel: string | null
}

function metricNumber(metrics: DocumentTake['metrics'], key: string): number {
  const raw = metrics?.[key]
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : Number.NaN
}

export function viewerHeader(input: { document: Pick<CanvasDocument, 'chains'>; chain: DocumentChain; takes: DocumentTake[]; take: DocumentTake }): ViewerHeader {
  const duration = metricNumber(input.take.metrics, 'duration')
  const width = metricNumber(input.take.metrics, 'width')
  const height = metricNumber(input.take.metrics, 'height')
  return {
    // The W9 one-convention ruling: chains are named by chainTitle, takes by
    // takeNumberOf — the same vocabulary the tiles and the bar carry.
    title: chainTitle(input.document, input.chain),
    takeLabel: `take ${takeNumberOf(input.takes, input.take)} of ${input.takes.length}`,
    durationLabel: duration > 0 ? `${duration.toFixed(1)}s` : null,
    resolutionLabel: width > 0 && height > 0 ? `${width}×${height}` : null,
  }
}

// ------------------------------------------------------- the used-by line (§6.2)

/** The header's `used by →` chips: derive.ts's walk (T1), named for the
 *  viewer — the re-export is the seam (one inverse, two homes: the bar's
 *  counts and these chips render ONE walk). */
export const usedByChips = usedBy

/** One used-by chip's click contract (spec §6.2 v1 minimal): close the
 *  viewer + select the consuming chain + camera fly to its tile. Pure data
 *  the shell issues verbatim — the fly request is assertable at the model
 *  level. */
export function usedByChipAction(chainId: string): { close: boolean; select: string; camera: { kind: 'fly'; tileId: string } } {
  return { close: true, select: chainId, camera: { kind: 'fly', tileId: chainId } }
}

// ------------------------------------------------------------ the take chips

/** The ForkMenu's L28 drift guidance, verbatim — the SAME sentence its
 *  earlier-take rows carry (spec §3: the guidance "rides the chip tooltips,
 *  not new chrome"; one note, two homes, byte-pinned to both). */
export const TAKE_CHIP_DRIFT_NOTE: string = 'forking from an earlier take re-anchors an identity that has drifted'

/** One take chip: the takeNumberOf ladder, the canonical star, and which
 *  take the stage is currently watching (switching swaps the lease). */
export type ViewerTakeChip = { id: string; number: number; canonical: boolean; active: boolean }

/** The header's take chips (spec §3): the chain's takes, OLDEST-first (the
 *  numbering ladder's own order), canonical starred (supersededBy === null,
 *  deriveTiles' own rule), the watched take marked active. */
export function viewerTakeChips(takes: DocumentTake[], activeTakeId: string | null): ViewerTakeChip[] {
  const ordered = [...takes].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return ordered.map((take) => ({
    id: take.id,
    number: takeNumberOf(takes, take),
    canonical: take.supersededBy === null,
    active: take.id === activeTakeId,
  }))
}

// ------------------------------------------- §6.1's compare (foelihc T6)

/** The pane one compare candidate resolves to (spec §6.1): a take
 *  candidate IS that take; a chain candidate (parent/fork) is its
 *  CANONICAL take — the first supersededBy-null take across its outputs,
 *  deriveTiles' own rule (one rule, two homes). Null when nothing
 *  reviewable resolves — the caller DROPS the candidate, never renders an
 *  empty pane. */
export function candidatePaneTake(document: Pick<CanvasDocument, 'chains'>, candidate: CompareCandidate): DocumentTake | null {
  if (candidate.kind === 'take') {
    for (const chain of document.chains) {
      for (const output of chain.outputs) {
        for (const take of output.takes) {
          if (take.id === candidate.takeId) return take
        }
      }
    }
    return null
  }
  const chain = document.chains.find((entry) => entry.id === candidate.id)
  if (!chain) return null
  for (const output of chain.outputs) {
    for (const take of output.takes) {
      if (take.supersededBy === null) return take
    }
  }
  return null
}

function takeIsVideo(take: DocumentTake | null): boolean {
  return take !== null && take.metrics?.kind === 'video'
}

/** The picker's honest list (spec §6.1: "Candidates list this chain's
 *  other takes first, then the fork neighborhood"): T1's
 *  compareCandidates output — THE walk, never re-walked — filtered to
 *  candidates that can actually fill a compare pane. The honest drops: a
 *  takeless or image-canonical chain is not a candidate (an empty pane is
 *  not a comparison), and v1's compare is the VIDEO A/B surface — the
 *  shared transport is meaningless over a still (§2's own image rule). */
export function pickableCompareCandidates(document: Pick<CanvasDocument, 'chains'>, chain: DocumentChain, currentTakeId?: string | null): CompareCandidate[] {
  const candidates = compareCandidates(document, chain, currentTakeId)
  return candidates.filter((candidate) => takeIsVideo(candidatePaneTake(document, candidate)))
}

/** The pane identity a mount keys on: take:<id> / chain:<id> — stable,
 *  unique within a pair (the watched take is excluded from the list). */
export function candidateKey(candidate: CompareCandidate): string {
  return candidate.kind === 'take' ? `take:${candidate.takeId}` : `chain:${candidate.id}`
}

export function findCandidate(candidates: CompareCandidate[], key: string | null): CompareCandidate | null {
  if (!key) return null
  for (const candidate of candidates) {
    if (candidateKey(candidate) === key) return candidate
  }
  return null
}

/** The compare chip's gate (the honest-state discipline): the chip exists
 *  ONLY where a second candidate exists AND the watched take is video (an
 *  image has no transport to share). No dead chip, anywhere. */
export function compareGate(input: { watchedKind: 'video' | 'image'; candidates: CompareCandidate[] }): boolean {
  return input.watchedKind === 'video' && input.candidates.length > 0
}

/** Entering compare auto-picks the FIRST candidate: this chain's other
 *  takes lead T1's list, so the A/B fork case — the comparison the chip
 *  promises — is one click, with the picker row offering the rest. */
export function enterComparePick(candidates: CompareCandidate[]): string | null {
  return candidates.length > 0 ? candidateKey(candidates[0]) : null
}
