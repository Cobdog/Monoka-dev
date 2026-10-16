/**
 * Failure taxonomy: maps a structural failure reason (node id/class + the
 * SANITIZED exception text that already passed through logSanitize) to a
 * human cause bucket. The doctrine is "we care that it failed on a node
 * because of a comma — not what they asked for"; this module adds the last
 * mile: which KNOWN cause class that node/reason pair belongs to, so the
 * Queue and the diagnostic report can say "GPU memory exhausted — see the
 * VRAM tier guidance", not just a traceback.
 *
 * Pure and dependency-free by design (loads in the repo's VM-transpiled
 * unit-test harness). Matching is case-insensitive over the structural
 * fragments the sanitizer keeps (class names, error kinds, numbers) — never
 * over free-form prose, which is already [redacted] by the time it arrives.
 */

/** Stable bucket ids — the report's failure histogram counts by these. */
export type FailureBucketId =
  | 'out-of-memory'
  | 'engine-unreachable'
  | 'timeout'
  | 'node-missing'
  | 'validation'
  | 'output-missing'
  | 'cancelled'
  | 'unknown'

export type FailureBucket = {
  id: FailureBucketId
  /** Short label for the histogram + queue rows. */
  label: string
  /** The human cause — what to DO about this class of failure. */
  cause: string
}

export const FAILURE_BUCKETS: Record<FailureBucketId, FailureBucket> = {
  'out-of-memory': {
    id: 'out-of-memory',
    label: 'GPU memory exhausted',
    cause: 'The engine ran out of VRAM mid-render. Lower resolution or duration, use a smaller quant of the diffusion model, or let the automatic engine-reset + tiled-VAE retry absorb it.',
  },
  'engine-unreachable': {
    id: 'engine-unreachable',
    label: 'Engine unreachable',
    cause: 'The generation engine was not reachable. Verify ComfyUI is running (or the managed engine started) and re-check the connection in Settings.',
  },
  timeout: {
    id: 'timeout',
    label: 'Timed out or hit the deadline',
    cause: 'The render exceeded its time budget — the engine may have stalled or is queueing behind other work. Check the engine queue before retrying.',
  },
  'node-missing': {
    id: 'node-missing',
    label: 'Custom node missing',
    cause: 'A node class this graph needs is not installed on this engine. Install or refresh the pack that provides it (Settings → Node packs); if the missing class is a stock ComfyUI node, the engine itself is older than the graph — update ComfyUI. The submit-time preflight names the exact class and its pack before this can happen.',
  },
  validation: {
    id: 'validation',
    label: 'Graph validation rejected',
    cause: 'The engine rejected the graph before rendering — typically a sampler/model value this engine build does not offer, or an updated node changed its inputs (the error type says which: value_not_in_list, required_input_missing, return_type_mismatch). The Graph compatibility row in Settings explains version drift.',
  },
  'output-missing': {
    id: 'output-missing',
    label: 'Output never appeared',
    cause: 'The render reported completion but its file never landed in the output directory — a slow disk or an output-path mismatch, not a generation failure.',
  },
  cancelled: {
    id: 'cancelled',
    label: 'Cancelled',
    cause: 'The generation was cancelled by request.',
  },
  unknown: {
    id: 'unknown',
    label: 'Unclassified',
    cause: 'No known cause class matched. The structural reason above is what the engine reported.',
  },
}

/** Ordered matchers over SANITIZED structural text. First match wins; the
 *  most specific classes sit above their generic parents (a CUDA OOM is an
 *  out-of-memory failure, not a generic runtime error). */
const MATCHERS: Array<{ id: FailureBucketId; pattern: RegExp }> = [
  { id: 'out-of-memory', pattern: /\b(oom|outofmemoryerror|memoryerror|out of memory|cuda out of memory|allocat\w* (?:memory|vram)|vram)\b/i },
  { id: 'engine-unreachable', pattern: /\b(econnrefused|connection refused|fetch failed|not reachable|unreachable|offline|econnreset|socket hang up)\b/i },
  { id: 'timeout', pattern: /\b(timeout|timed out|deadline|still rendering after)\b/i },
  // node-missing stays ABOVE validation: the structured type tokens are the
  // ComfyUI builders' own (execution.py: missing_node_type; server.py:
  // invalid_prompt for unknown ids) and survive sanitization by construction
  // (snake_case = sanitizer rule 7). The prose phrases need the R-03 KEYWORDS
  // tokens (type/not/found/registered/module/named) to survive.
  { id: 'node-missing', pattern: /\b(returned type missing|missing_node_type|missing node|node_not_found|is not a registered|node type not found|cannot find module|no module named|importerror|modulenotfounderror)\b/i },
  { id: 'validation', pattern: /\b(validation|value_not_in_list|value not in list|required_input_missing|required input|return_type_mismatch|prompt_outputs_failed_validation|invalid (?:value|prompt)|node errors|returned error)\b/i },
  { id: 'output-missing', pattern: /\b(output file never appeared|no output|completed but)\b/i },
  { id: 'cancelled', pattern: /\b(cancelled|canceled|interrupted|aborted)\b/i },
]

/** Classifies one structural failure into a bucket. `text` is the already
 *  sanitized reason (or the job's error message); unknown text lands in
 *  'unknown' — never a crash, never a guess beyond the ordered matchers. */
export function classifyFailure(text: string): FailureBucket {
  if (typeof text === 'string' && text.length > 0) {
    for (let index = 0; index < MATCHERS.length; index += 1) {
      if (MATCHERS[index].pattern.test(text)) return FAILURE_BUCKETS[MATCHERS[index].id]
    }
  }
  return FAILURE_BUCKETS.unknown
}

/** (ewtobuh, vfhcu5r) Classifies a job record: the STRUCTURED failureKind
 *  written at settlement wins; legacy rows (pre-field) still classify from
 *  the record's sanitized error prose. Diagnostics' counting and the canvas
 *  verdict both read through this, so one record cannot classify two ways. */
export function bucketForJob(input: { failureKind?: string; error?: string }): FailureBucket {
  const structured = typeof input.failureKind === 'string' && input.failureKind in FAILURE_BUCKETS
    ? FAILURE_BUCKETS[input.failureKind as FailureBucketId]
    : undefined
  return structured ?? classifyFailure(input.error ?? '')
}

/** The canvas verdict's per-bucket vocabulary: what happened, what to do.
 *  Composed sentences only — engine text never enters these strings. */
const VERDICTS: Record<FailureBucketId, { situation: string; recovery: string }> = {
  'out-of-memory': { situation: 'the engine ran out of memory', recovery: 'lower the resolution or duration and retry' },
  'engine-unreachable': { situation: 'the engine could not be reached', recovery: 'check the engine connection and retry' },
  timeout: { situation: 'the render ran too long and was abandoned', recovery: 'check the engine queue, then retry' },
  'node-missing': { situation: 'this workflow needs a node the engine does not have', recovery: 'install the missing node pack and retry' },
  validation: { situation: 'the engine rejected this render’s inputs', recovery: 'adjust the settings and retry' },
  'output-missing': { situation: 'the render finished but its output never appeared', recovery: 'retry the render' },
  cancelled: { situation: 'the render was cancelled', recovery: 're-run it when ready' },
  unknown: { situation: 'the engine reported an error the studio could not classify', recovery: 'retry the render' },
}

/** (ewtobuh, R3 P0-4 tail) The humanized verdict a TILE carries: one human
 *  sentence (the classified cause), the recovery path, and the pointer to
 *  the technical record. Composed ONLY from this module's vocabulary — never
 *  from engine text — so a tile can never carry a [redacted] marker, a raw
 *  exception, or an internal node id. The node CLASS may be named (it is the
 *  human-recognizable actor); the node id never leaves Diagnostics. */
export function failureVerdict(input: { error?: string; failureKind?: string; failureNodeType?: string }): string {
  const bucket = bucketForJob(input)
  const at = typeof input.failureNodeType === 'string' && input.failureNodeType ? ` (at ${input.failureNodeType})` : ''
  const copy = VERDICTS[bucket.id]
  return `This render failed — ${copy.situation}${at}. ${copy.recovery}; the technical record is in Diagnostics.`
}

/** Ordered stage matchers over the engine's node classes (1v844wk): the
 *  human words for where a render is — never the internal node status
 *  verbatim. First match wins; decode sorts above the sampler family so
 *  VAEDecode never reads as sampling. */
const STAGE_MATCHERS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /vaedecode/i, label: 'Decoding video…' },
  { pattern: /vaeencode/i, label: 'Preparing the latent…' },
  { pattern: /videocombine|savevideo|saveimage|imagecombine/i, label: 'Saving the output…' },
  { pattern: /sampler/i, label: 'Sampling…' },
  { pattern: /textencode|clipencode|conditioning/i, label: 'Reading the prompt…' },
  { pattern: /loadimage|loadvideo|loadaudio|loadlatent|upload/i, label: 'Loading inputs…' },
]

/** The human stage word for one engine node class. An unreadable class
 *  falls back to the honest default — the render is simply rendering. */
export function humanStageLabel(nodeClass: string | null | undefined): string {
  if (typeof nodeClass === 'string' && nodeClass.length > 0) {
    for (let index = 0; index < STAGE_MATCHERS.length; index += 1) {
      if (STAGE_MATCHERS[index].pattern.test(nodeClass)) return STAGE_MATCHERS[index].label
    }
  }
  return 'Rendering…'
}

/** Resolves the stage word from the event's node id against the job's
 *  submit graph (node id → class_type). Everything unreadable — no id, no
 *  graph, no node — falls back to the honest default. */
export function liveStageLabel(nodeId: string | null | undefined, graph: unknown): string {
  if (typeof nodeId !== 'string' || !nodeId || !graph || typeof graph !== 'object' || Array.isArray(graph)) return humanStageLabel(undefined)
  const node = (graph as Record<string, unknown>)[nodeId]
  const nodeClass = node && typeof node === 'object' && typeof (node as { class_type?: unknown }).class_type === 'string'
    ? (node as { class_type: string }).class_type
    : undefined
  return humanStageLabel(nodeClass)
}
