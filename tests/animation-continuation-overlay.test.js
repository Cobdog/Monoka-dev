// The continuation overlay's M-7 pin (Codex batch C, the pre-gates audit
// 2026-10-09's M-7 — "the retryable-overlay corner"): the reconciliation
// ledger overlays fetched retryable states with previously observed envelope
// state, and a LOST E2 envelope used to let an old E1 overlay fetched E2
// indefinitely (terminal-success was covered by Task 7's I-1R; the
// retryable-to-retryable corner was not). The fix is stamp-ordered
// precedence — the settlement generation (the attempt row's own_revision)
// rides both the fetched row and the registration envelope, and a fetched
// retryable state with a NEWER stamp wins over the ledger's entry.
//
// This suite pins, against the pure reconcile (src/animation/state.ts) and
// the wire emitter (server/animation/routes.ts' animationFabricEmitter):
//   - THE REPRODUCTION: ledger E1 (shown) + fetched E2 (truth, its envelope
//     lost) → the resync shows E2, and the ledger is superseded so later
//     reconciles no-op;
//   - the I-1 race guard STANDS: a fetched retryable row OLDER than the
//     ledger's envelope is still overlaid (the attempt-ready refresh racing
//     the registration write must not revert a row the client already saw);
//   - legacy unstamped shapes keep the pre-M-7 overlay precedence (an old
//     build's envelope can never be proven stale, so the I-1 guard wins);
//   - the fetched-terminal supersede (Task 7's I-1R) is unchanged;
//   - the registration envelope CARRIES the stamp end-to-end (the emitter
//     forwards it; a stampless payload stays stampless).

import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { reconcileContinuations } from '../src/animation/state'

const require = createRequire(import.meta.url)
const __dirname = require('node:path').dirname(fileURLToPath(import.meta.url))
const REPO = require('node:path').resolve(__dirname, '..')
// The wire emitter lives in the built server (the animation suites' own
// contract: build:server precedes vitest).
const { animationFabricEmitter } = require(require('node:path').join(REPO, 'dist-server', 'server', 'animation', 'routes.js'))

/** One attempt row of a document view — only the fields the reconcile
 *  reads (the real row's other fields are irrelevant to the overlay). */
function row(continuation) {
  return { attemptId: 'a-1', execution: 'ready', continuation }
}

function documentOf(...attempts) {
  return { id: 'd-1', revision: 3, attempts }
}

/** A minimal stamped retryable view — the registering-with-error shape the
 *  bounded retries settle into. */
const retryable = (error, stamp) => ({ state: 'registering', error, stamp })

test('M-7 the lost-envelope corner: fetched E2 truth beats the shown E1 ledger entry, and the ledger is superseded', () => {
  // The client saw E1 (a registration envelope that failed with reason one)
  // and the server moved on to E2 (reason two) — whose envelope was LOST.
  const ledger = new Map([['a-1', retryable('engine unreachable (attempt 1)', 4)]])
  const resync = documentOf(row(retryable('engine unreachable (attempt 2)', 7)))

  const reconciled = reconcileContinuations(resync, ledger)

  // THE PIN: the resync shows E2 — the fetched newer truth, never the stale
  // envelope's E1 overlaid backward.
  assert.equal(reconciled.attempts[0].continuation.error, 'engine unreachable (attempt 2)')
  assert.equal(reconciled.attempts[0].continuation.state, 'registering')
  assert.equal(reconciled.attempts[0].continuation.stamp, 7)
  // The ledger was superseded with the fetched truth — a second reconcile
  // over the same fetch no-ops (returns the SAME object).
  assert.deepEqual(ledger.get('a-1'), retryable('engine unreachable (attempt 2)', 7))
  assert.equal(reconcileContinuations(resync, ledger), resync)
})

test('M-7 the I-1 race guard stands: a fetched retryable row OLDER than the ledger envelope is still overlaid', () => {
  // The attempt-ready refresh raced the registration write: its response was
  // read BEFORE the envelope's write landed (stamp 3 predates stamp 4), so
  // the ledger's truth must patch the row — the pre-M-7 behavior, unchanged.
  const ledger = new Map([['a-1', retryable('engine unreachable (attempt 1)', 4)]])
  const staleFetch = documentOf(row(retryable('the first failure', 3)))

  const reconciled = reconcileContinuations(staleFetch, ledger)

  assert.equal(reconciled.attempts[0].continuation.error, 'engine unreachable (attempt 1)')
  assert.equal(reconciled.attempts[0].continuation.stamp, 4)
  assert.notEqual(reconciled, staleFetch, 'the overlay changed the document')
})

test('M-7 legacy unstamped shapes keep the overlay precedence — an old build\'s envelope is never assumed stale', () => {
  // A pre-stamp envelope (no stamp on the ledger entry) cannot be ordered
  // against a stamped fetch: the I-1 guard wins, exactly as before M-7.
  const legacyLedger = new Map([['a-1', { state: 'registering', error: 'old build envelope' }]])
  const fetched = documentOf(row(retryable('newer server truth', 9)))
  const reconciledLegacyLedger = reconcileContinuations(fetched, legacyLedger)
  assert.equal(reconciledLegacyLedger.attempts[0].continuation.error, 'old build envelope')

  // The mirror shape: a stamped envelope over a pre-stamp (old-row) fetch.
  const stampedLedger = new Map([['a-1', retryable('stamped envelope', 6)]])
  const legacyFetch = documentOf(row({ state: 'registering', error: 'old row fetch' }))
  const reconciledLegacyFetch = reconcileContinuations(legacyFetch, stampedLedger)
  assert.equal(reconciledLegacyFetch.attempts[0].continuation.error, 'stamped envelope')
})

test('M-7 the fetched-terminal supersede is unchanged (Task 7 review I-1R)', () => {
  // A fetched ready/not-produced row stands over ANY ledger entry —
  // settlement is one-shot and never regresses; the ledger is superseded so
  // later reconciles no-op.
  const ledger = new Map([['a-1', retryable('still registering', 9)]])
  const settled = { state: 'ready', artifact: { artifactId: 'art-1', digest: 'd'.repeat(64) }, stamp: 8 }
  const reconciled = reconcileContinuations(documentOf(row(settled)), ledger)
  assert.equal(reconciled.attempts[0].continuation.state, 'ready')
  assert.deepEqual(ledger.get('a-1'), settled)
  // not-produced (terminal) supersedes too — even at an older stamp.
  const terminal = { state: 'not-produced', stamp: 2 }
  const reconciledTerminal = reconcileContinuations(documentOf(row(terminal)), ledger)
  assert.equal(reconciledTerminal.attempts[0].continuation.state, 'not-produced')
})

test('M-7 the wire carries the stamp: registration envelopes forward the settlement generation', () => {
  const envelopes = []
  const emit = animationFabricEmitter((type, payload) => envelopes.push({ type, payload }))

  emit('animation.attempt.continuation-registration-failed', {
    attemptId: 'a-1', documentId: 'd-1', error: 'engine unreachable', stamp: 7,
  })
  emit('animation.attempt.continuation-ready', {
    attemptId: 'a-2', documentId: 'd-1',
    artifact: { artifactId: 'art-2', digest: 'e'.repeat(64) },
    stamp: 12,
  })
  emit('animation.attempt.continuation-not-produced', {
    attemptId: 'a-3', documentId: 'd-1',
  })

  assert.equal(envelopes.length, 3)
  assert.deepEqual(
    envelopes.map((entry) => entry.type),
    ['continuation-state', 'continuation-state', 'continuation-state'],
  )
  assert.equal(envelopes[0].payload.stamp, 7, 'the retryable envelope carries the settlement generation')
  assert.equal(envelopes[0].payload.error, 'engine unreachable')
  assert.equal(envelopes[1].payload.stamp, 12, 'the ready envelope carries it too')
  assert.equal(envelopes[1].payload.state, 'ready')
  assert.equal(envelopes[2].payload.state, 'not-produced')
  assert.equal('stamp' in envelopes[2].payload, false, 'a stampless payload (a bookend-failure emit) stays stampless — never a guessed zero')
})
