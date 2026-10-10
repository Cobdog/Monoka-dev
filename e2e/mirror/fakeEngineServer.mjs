#!/usr/bin/env node
/**
 * The standing FAKE ENGINE for experience-first walks (reality audit
 * 2026-09-25, task jf53fb8). A profile-driven stand-in ComfyUI that speaks
 * the studio's FULL engine contract — /system_stats, /object_info (+ the
 * targeted per-class form), /models (+per-folder), /prompt, /history,
 * /queue, /view, /upload/image, /interrupt, /free — plus the /ws WebSocket
 * event stream (status/execution_start/progress/executed/execution_success/
 * execution_error/interrupted and binary PNG preview frames).
 *
 * Stock class schemas are the REAL captured fixture
 * (scripts/fixtures/engine-object-info.json — contract truth, never
 * hand-written shapes); a profile adds PACK classes as extras, exactly the
 * way e2e/fakeEngineInfo.ts layers them.
 *
 * Profiles are JSON next to this file under profiles/:
 *   stock-h3.json           — the official H3 stack, no packs (Phase 1)
 *   maintainer-instance.json — the maintainer's real inventory approximated
 *                              from their session evidence (Phase 2 mirror)
 *
 * Usage: node e2e/mirror/fakeEngineServer.mjs --port 7341 \
 *          --profile e2e/mirror/profiles/stock-h3.json
 *
 * Live control (for break-it-on-purpose legs, no restart):
 *   POST /__control {"failMode":"validation"|"error"|"hang"|null,
 *                    "steps":n,"stepDelayMs":n,
 *                    "hideHistoryFor":"<promptId>"|null,
 *                    "videoOnly":true|false,
 *                    "underdeliverFrames":n,
 *                    "loaderEnumerations":{unet,clip,vae,lora}|null,
 *                    "hangObjectInfo":true|false,
 *                    "omitCarrySave":true|false}
 *   GET  /__control — current state
 *
 * "loaderEnumerations" (wave 1) overrides the profile's loader combo lists
 * at runtime — the enumeration the studio resolves animation model slots
 * against. Tests use it for the dead-slot refusals (a list lacking a slot),
 * the defaults-verbatim leg (the pinned names served exactly), and the
 * enumeration-change repair leg (flip it and re-roll) without an engine
 * restart; null restores the profile's boot value.
 *
 * "hideHistoryFor" masks ONE job's history record from every /history answer
 * while set (a transient engine-side truth gap — an engine mid-restart whose
 * index has not loaded that record yet). The record itself is untouched:
 * clearing the knob restores it, so a preparation/recovery leg can fail
 * against the gap, then succeed once it closes.
 *
 * "videoOnly" (default false) switches the animation lane's video jobs to
 * the REAL engine's output shape: the clip and nothing else — no decoded
 * frame images beside it — so the studio's frame-resolution seam exercises
 * its ffmpeg extraction path (decode-the-frame-from-the-registered-clip)
 * exactly as it must against a real ComfyUI save tail.
 *
 * History records carry the REAL tuple (docs/devdocs/comfyui-api §3):
 * [number, prompt_id, prompt_graph, extra_data, outputs_to_execute].
 *
 * The cancellation contract is the REAL one (Codex batch A's
 * mirror-truth corrections): /interrupt answers an EMPTY 200 and only
 * interrupts a CURRENTLY-RUNNING prompt_id (a pending id is a deliberate
 * no-op — server.py:1160-1198); an interrupted run lands in history as
 * status_str "error" + completed false + the ("execution_interrupted",
 * {...}) message pair (main.py:375-379, execution.py:693-699 — never an
 * invented "interrupted" status_str); POST /queue {"delete":[id]} dequeues
 * a pending id (server.py:1146-1158); and prompts submitted while another
 * renders WAIT in queue_pending behind the single slot.
 *
 * Video jobs (the animation lane) list the clip FIRST and then one output
 * IMAGE per conditioning frame — the frame-addressed listing the studio's
 * frame preparer/extractor contract consumes (see graphClipLength).
 *
 * The carry save model (the extension lane's Task 1, spec 2026-10-08 §7):
 * a graph containing the pack's MiniMaxH3MotionContextSaveLatent gets the
 * REAL engine's in-graph save behavior modeled — at render completion the
 * engine writes a synthetic safetensors-shaped carry file at the node's own
 * path under a DISK-BACKED output directory (the pack's path math: prefix
 * folder + the clip_index fixed-slot suffix), served through /view by
 * (subfolder, filename) exactly like a real output-folder file. The file
 * NEVER enters the history outputs listing — the node returns its path as
 * an execution output with no history-UI receipt, which is the gap the
 * studio's deterministic-path receipt contract closes. The output dir is
 * derived from (profile, port) so it SURVIVES a restart, like a real
 * engine's output folder on disk.
 *
 * NEVER point this at anything GPU-adjacent: it is a plain node HTTP+ws
 * server, and the studio that talks to it must run with an ISOLATED home.
 */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2)
const argOf = (flag) => {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
const port = Number(argOf('--port') ?? 0)
const profilePath = argOf('--profile')
if (!port || !profilePath) {
  console.error('usage: fakeEngineServer.mjs --port N --profile <profile.json>')
  process.exit(2)
}
const profile = JSON.parse(fs.readFileSync(path.resolve(repoRoot, profilePath), 'utf8'))

// The engine's DISK-BACKED output directory — where the carry save model
// writes its files (see the header). Derived from (profile, port) so a
// restart on the same port KEEPS it: a real engine's output folder lives on
// disk and survives the process, and the extension lane's receipt contract
// depends on the saved file outliving the render (a studio crash between
// the engine's write and the owner's registration still finds the file).
const outputDir = path.resolve(os.tmpdir(), `fake-engine-output-${profile.id}-${port}`)
fs.mkdirSync(outputDir, { recursive: true })

// ---------------------------------------------------------------- stock schemas (the REAL capture)
const fixture = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/fixtures/engine-object-info.json'), 'utf8'))
const objectInfo = { ...(fixture.nodes ?? {}) }
for (const [className, schema] of Object.entries(profile.objectInfoExtras ?? {})) objectInfo[className] = schema

/** The loader-class enumeration surface (wave 1 of the animation module's
 *  post-review program): the profile's `loaderEnumerations`
 *  ({ unet, clip, vae, lora }) patch the loader nodes' combo lists — the
 *  exact surface a real ComfyUI serves through /object_info and the studio
 *  resolves its animation model slots against. Runtime-overridable through
 *  POST /__control (tests flip the enumeration without an engine restart —
 *  the dead-slot, defaults-verbatim, and enumeration-change legs). null
 *  serves the captured fixture as-is (the stock empty combos). */
const LOADER_COMBO_FIELDS = [
  ['UNETLoader', 'unet_name', 'unet'],
  ['CLIPLoader', 'clip_name', 'clip'],
  ['VAELoader', 'vae_name', 'vae'],
  ['LoraLoaderModelOnly', 'lora_name', 'lora'],
  ['LoraLoader', 'lora_name', 'lora'],
]
function patchLoaderCombos(enums) {
  const patched = { ...objectInfo }
  for (const [className, fieldName, key] of LOADER_COMBO_FIELDS) {
    const schema = patched[className]
    if (!schema || !Array.isArray(enums[key])) continue
    patched[className] = {
      ...schema,
      input: {
        ...schema.input,
        required: { ...schema.input.required, [fieldName]: [enums[key], {}] },
      },
    }
  }
  return patched
}

// ---------------------------------------------------------------- synthetic PNG (tiny, tinted per job)
const crcTable = []
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c >>> 0
}
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
/** A WxH PNG with a two-tone vertical gradient tinted by `seed` — visually
 *  distinguishable per render, decodable by any viewer. */
function pngGradient(width, height, seed) {
  const r = (seed * 61) % 256, g = (seed * 127) % 256, b = (seed * 193) % 256
  const raw = Buffer.alloc(height * (1 + width * 3))
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3)
    raw[row] = 0 // filter none
    const t = y / Math.max(1, height - 1)
    for (let x = 0; x < width; x += 1) {
      const i = row + 1 + x * 3
      raw[i] = Math.round(r * t + 40 * (1 - t))
      raw[i + 1] = Math.round(g * (1 - t) + 60 * t)
      raw[i + 2] = Math.round(b * t + 80 * (1 - t))
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 2 // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// A real mp4 on disk (the committed e2e fixture) for video outputs.
const sampleMp4 = fs.readFileSync(path.join(repoRoot, 'e2e/fixtures/sample-clip.mp4'))

// ---------------------------------------------------------------- state
const state = {
  failMode: null, // null | 'validation' | 'error' | 'hang'
  steps: profile.render?.steps ?? 8,
  stepDelayMs: profile.render?.stepDelayMs ?? 350,
  outputKind: profile.render?.outputKind ?? 'video', // video | image
  emitBinaryPreviews: profile.render?.emitBinaryPreviews ?? true,
  // Completion-lag injection (task 4 review Minor-3): when > 0, the job's
  // queue slot empties at completion but its HISTORY record appears only
  // after this delay — forcing the torn queue-empty/history-absent window a
  // reconciler must survive before it may answer 'lost'.
  historyLagMs: 0,
  // POST /refresh hit count (truth-surface sweep #2, 68e9k17): the mirror
  // counts engine-side folder re-scan asks so tests can PROVE a client
  // re-pull carried refresh semantics (read it via GET /__control).
  refreshHits: 0,
  // A prompt id whose history record every /history answer OMITS while set
  // (see the header: the transient truth-gap knob — reversible, unlike wipe).
  hideHistoryFor: null,
  // The animation lane's video jobs list ONLY the clip while true — the REAL
  // engine's output shape (see the header: forces the studio's ffmpeg
  // frame-extraction path).
  videoOnly: false,
  // The animation lane's video jobs list this many FEWER frame images than
  // the graph conditions on — an engine under-delivering versus its OWN graph
  // (the final review's M2 shape: the studio's frame-resolution seam must
  // refuse a beyond-listing frame index BY NAME, never clamp to the last
  // image).
  underdeliverFrames: 0,
  // The loader-class enumerations served through /object_info (wave 1 of the
  // animation module's post-review program): the profile's boot value,
  // runtime-overridable via POST /__control
  // { "loaderEnumerations": { unet, clip, vae, lora } | null }. null serves
  // the captured fixture as-is (the stock empty combos).
  loaderEnumerations: profile.loaderEnumerations ?? null,
  // While true, every /object_info answer (full + targeted) is ACCEPTED and
  // NEVER WRITTEN — the hung-enumeration shape (an engine whose object-info
  // surface stalls). The studio's enumeration fetch must be time-bounded or
  // its submit path hangs ahead of persistence (wave 1 fix round M-1's
  // regression knob).
  hangObjectInfo: false,
  // The extension lane's no-file shape (spec 2026-10-08 §7): while true, a
  // CARRYING graph still renders and lands its media normally but the pack's
  // Save node writes NOTHING — the in-graph save failed while the render
  // succeeded, the exact world the studio's named "continuation not-produced"
  // condition settles from (the deterministic receipt path holds no file).
  omitCarrySave: false,
  // The carry-save THROW shape (Codex batch A, audit I-2 — modeled on the
  // canonical executor's VERIFIED semantics). Two values:
  //   true — the CANONICAL scheduling: the carry save is an OUTPUT_NODE
  //     whose only input is the sampler while the media save chain needs the
  //     decode first, so the output-first pick (comfy_execution/graph.py
  //     ux_friendly_pick_node) stages the carry save BEFORE VAEDecode/
  //     SaveVideo can run; its exception aborts the job with NO outputs
  //     (no output node completed before the failure) and the
  //     execution_error message names the Save class. The carry file is
  //     never written (the pack's tmp-then-replace never creates the
  //     destination on a throwing write).
  //   'with-media' — the REORDERED/fault-tolerant engine the pack's upstream
  //     ask would deliver (and the executor's partial-output mechanics
  //     already record): the media save completed BEFORE the carry save
  //     threw, so the failed job's record carries the media output beside
  //     the same named error — the exact partial-output shape the studio's
  //     landed playable+not-produced arm reads.
  // Non-carrying graphs are unaffected either way.
  failCarrySave: false,
  // While >0, every /view read of the DISK-BACKED output tree (the carry
  // receipt fetch — the registration's own read) is delayed this many ms: a
  // deterministic registration-settlement window for the race legs (the
  // attempt-ready refresh's server read then provably predates the
  // registration write). A real engine's /view is not delayed; the knob only
  // widens a window that exists in production.
  carryViewDelayMs: 0,
}
const control = (req, res, url) => {
  if (url.pathname === '/__control' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ profile: profile.id, ...state }))
    return true
  }
  if (url.pathname === '/__control' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      try {
        const patch = JSON.parse(body || '{}')
        // ACTION (not state): simulate an engine restart — the running job is
        // killed without a record, every history record is forgotten, and the
        // PENDING queue dies with the process (a real restart drops it too):
        // the confirmed-lost shape a reconciler must classify as 'lost'.
        if (patch.wipe === true) {
          if (running) { clearTimeout(running.timer); running = null }
          pending.length = 0
          histories.clear()
        }
        for (const key of Object.keys(state)) if (key in patch) state[key] = patch[key]
        // null restores the profile's boot enumerations (the captured
        // fixture only when the profile itself carries none).
        if ('loaderEnumerations' in patch && patch.loaderEnumerations === null) {
          state.loaderEnumerations = profile.loaderEnumerations ?? null
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ profile: profile.id, ...state }))
      } catch {
        res.writeHead(400); res.end()
      }
    })
    return true
  }
  return false
}

// outputs served at /view: name -> {bytes, mime}
const viewFiles = new Map()
let jobCounter = 0
const histories = new Map() // promptId -> history record
// The single execution slot + the PENDING queue behind it (the real
// engine's queue_running/queue_pending split): a prompt submitted while
// another renders WAITS, exactly as a real ComfyUI queues it — which is
// what makes the target-sensitive /interrupt and the /queue deletion op
// exercisable (a pending id is immune to interrupt by design; deleting it
// is the only way to depose it).
const pending = [] // { promptId, graph, extraData, queueNumber }
let running = null // { promptId, graph, extraData, queueNumber, outputsToExecute, timer, interrupted }

// ---------------------------------------------------------------- ws broadcast
const server = http.createServer((req, res) => { void handle(req, res) })
const wss = new WebSocketServer({ server })
const send = (obj) => { const s = JSON.stringify(obj); for (const c of wss.clients) if (c.readyState === 1) c.send(s) }
const sendPreview = (seed, step) => {
  const png = pngGradient(192, 108, seed + step)
  // ComfyUI's modern binary preview: [u32 version=1][u32 type (2=png)][image
  // at offset 8] — the exact frame server/realtime.ts parseUpstreamBinary
  // decodes.
  const header = Buffer.alloc(8)
  header.writeUInt32BE(1, 0)
  header.writeUInt32BE(2, 4)
  const frame = Buffer.concat([header, png])
  for (const c of wss.clients) if (c.readyState === 1) c.send(frame)
}

// ---------------------------------------------------------------- scripted execution

/** The SAMPLED clip length a video graph conditions on — the conditioning
 * node's `length` input. The carry file's tensor shapes ride this (the
 * sampler's live AV latent is the RAW window — pre-trim). */
function sampledClipLength(graph) {
  for (const node of Object.values(graph ?? {})) {
    if (!node || typeof node !== 'object') continue
    if (node.class_type === 'MiniMaxH3ImageToVideo' || node.class_type === 'MiniMaxH3ReferenceToVideo') {
      const length = node.inputs?.length
      if (typeof length === 'number' && Number.isInteger(length) && length > 0) return length
    }
  }
  return 22
}

/** The DELIVERED clip length a video graph produces — the conditioning
 * node's `length` input (the studio port's frameCountOf reads the same
 * fact), MINUS the head trim an extension graph's Motion Context node
 * reports (its context_length input): the pack's Trim node drops the
 * pinned head off the decoded clip before the save tail, so an extension
 * graph's output listing holds the TRIMMED window's frames, exactly what
 * the real node chain delivers. The animation lane's per-frame output
 * listing below lists exactly this many frame images beside the clip. */
function graphClipLength(graph) {
  let frames = 22
  let found = false
  for (const node of Object.values(graph ?? {})) {
    if (!node || typeof node !== 'object') continue
    if (node.class_type === 'MiniMaxH3ImageToVideo' || node.class_type === 'MiniMaxH3ReferenceToVideo') {
      const length = node.inputs?.length
      if (typeof length === 'number' && Number.isInteger(length) && length > 0) { frames = length; found = true }
    }
    if (node.class_type === 'MiniMaxH3MotionContext') {
      const trim = Number(node.inputs?.context_length)
      if (Number.isInteger(trim) && trim > 0) { frames -= trim; found = true }
    }
  }
  return found ? Math.max(0, frames) : 22
}

/** The engine's queue-depth truth for status broadcasts: the running job
 *  plus everything waiting behind it (the real engine's queue_updated). */
const queueRemaining = () => (running ? 1 : 0) + pending.length

/** The save-tail node ids a graph will execute — the engine's own
 *  outputs_to_execute, carried by BOTH the queue tuples and the history
 *  tuple (docs/devdocs/comfyui-api §2/§3). The pack's carry Save node is an
 *  OUTPUT_NODE like any save tail (the captured fixture says so), so a
 *  carrying graph lists it here too. */
const outputsToExecuteOf = (graph) => Object.entries(graph ?? {})
  .filter(([, node]) => node && typeof node === 'object'
    && (node.class_type === 'SaveVideo' || node.class_type === 'SaveImage' || node.class_type === 'MiniMaxH3MotionContextSaveLatent'))
  .map(([id]) => id)

/** A synthetic carry file in the pack's REAL container shape — STRUCTURALLY
 *  VALID (Codex batch B, audit M-6): safetensors framing (u64 LE header
 *  length + JSON header + payload) whose metadata carries the pack's
 *  save-format id and whose video/audio tensor entries are sized BY THE
 *  DECLARED SHAPES (F16 video [length,16,48,84] + F16 audio [2,max(3,length)]
 *  — a 22-frame window allocates its full 2,838,616 declared bytes; a
 *  56-frame extension window ~7.2 MB), so the declared shapes and the
 *  payload bytes AGREE and the file passes the pack's own deserialization
 *  contract (the real Load node's video/audio requirement + safetensors'
 *  offset discipline; the studio's strict reader stands in for it
 *  server-side). The pre-fix mirror partitioned a fixed 6 KB payload under
 *  2.8 MB shapes — registration proved plumbing, never loadability. Nothing
 *  loads the tensors — the studio digests bytes — but the container is now
 *  the true shape throughout. */
function syntheticCarryBytes(graph, jobNumber) {
  // The carried latent is the SAMPLER's raw window — pre-trim (the pack's
  // Save node sits on the sampler output, beside the decode/trim chain).
  const length = sampledClipLength(graph)
  const elementBytes = 2 // F16
  const videoShape = [length, 16, 48, 84]
  const audioShape = [2, Math.max(3, length)]
  const videoBytes = videoShape.reduce((product, dimension) => product * dimension, 1) * elementBytes
  const audioBytes = audioShape.reduce((product, dimension) => product * dimension, 1) * elementBytes
  const payloadBytes = videoBytes + audioBytes
  const payload = Buffer.alloc(payloadBytes)
  for (let i = 0; i < payloadBytes; i += 1) payload[i] = (i * 31 + jobNumber * 7) & 0xff
  const header = {
    __metadata__: { format: profile.carryFile?.format ?? 'h3_motion_context_av_v1' },
    video: { dtype: 'F16', shape: videoShape, data_offsets: [0, videoBytes] },
    audio: { dtype: 'F16', shape: audioShape, data_offsets: [videoBytes, payloadBytes] },
  }
  const headerBuf = Buffer.from(JSON.stringify(header), 'utf8')
  const framed = Buffer.alloc(8 + headerBuf.length + payloadBytes)
  framed.writeBigUInt64LE(BigInt(headerBuf.length), 0)
  headerBuf.copy(framed, 8)
  payload.copy(framed, 8 + headerBuf.length)
  return framed
}

/** The in-graph carry save, modeled (spec §7): when the submitted graph
 *  contains the pack's Save node, the engine writes the carry file AT RENDER
 *  COMPLETION to the node's own path — the pack's path math mirrored
 *  (filename_prefix folders under the output dir; clip_index > 0 is the
 *  fixed slot <name>_<%05d>.safetensors, index 0 the run-numbered old
 *  behaviour with its trailing underscore). Called ONLY on the success path:
 *  an errored, hung, or interrupted run writes nothing (the no-file shape —
 *  the named "continuation not produced" condition downstream). */
function writeCarryArtifact(graph, jobNumber) {
  let saveNode = null
  for (const entry of Object.values(graph ?? {})) {
    if (entry && typeof entry === 'object' && entry.class_type === 'MiniMaxH3MotionContextSaveLatent') { saveNode = entry; break }
  }
  if (!saveNode) return
  const inputs = saveNode.inputs ?? {}
  const prefix = typeof inputs.filename_prefix === 'string' && inputs.filename_prefix.length > 0
    ? inputs.filename_prefix
    : 'h3_context/clip'
  const clipIndex = Number.isInteger(inputs.clip_index) ? inputs.clip_index : 1
  const parts = prefix.split('/').filter(Boolean)
  const name = parts.pop() ?? 'clip'
  const slot = clipIndex > 0
    ? `${name}_${String(clipIndex).padStart(5, '0')}.safetensors`
    : `${name}_${String(jobNumber).padStart(5, '0')}_.safetensors`
  const folder = parts.join('/')
  const target = folder ? path.join(outputDir, folder, slot) : path.join(outputDir, slot)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, syntheticCarryBytes(graph, jobNumber))
}

/** Starts the next PENDING job the moment the slot frees (completion,
 *  error, interrupt) — the queue semantics a real ComfyUI serves. */
function startNextPending() {
  if (running || pending.length === 0) return
  runPrompt(pending.shift())
}

/** One video job's output listing, written into /view: a graph whose save
 *  tail is SaveImage nodes (the image workbench's packet ladder) receives
 *  one PNG per SaveImage node; a video job lists its clip FIRST (the
 *  primary artifact the studio's landing consumes), then — unless videoOnly
 *  — the decoded frames as output IMAGES (the frame-addressed listing of an
 *  image-sequence-capable engine; videoOnly strips them: the REAL engine's
 *  save-tail shape, where the studio's preparer/extractor must DECODE
 *  frames out of the registered clip through ffmpeg). Shared by the success
 *  path and the carry-throw knob's 'with-media' variant (audit I-2 — the
 *  media output a reordered engine records before the carry save throws). */
function videoJobOutputs(n, graph) {
  const graphNodes = Object.values(graph ?? {})
  const saveImageCount = graphNodes.filter((node) => node && typeof node === 'object' && node.class_type === 'SaveImage').length
  const wantImages = state.outputKind === 'image' || saveImageCount > 0
  const images = []
  if (wantImages) {
    const count = Math.max(1, saveImageCount)
    for (let i = 0; i < count; i += 1) {
      const filename = `ComfyUI_${String(n).padStart(5, '0')}_${i}.png`
      viewFiles.set(filename, { bytes: pngGradient(768, 432, n * 7 + i * 31), mime: 'image/png' })
      images.push({ filename, subfolder: '', type: 'output' })
    }
    return images
  }
  const length = graphClipLength(graph)
  const filename = `ComfyUI_${String(n).padStart(5, '0')}_.mp4`
  viewFiles.set(filename, { bytes: sampleMp4, mime: 'video/mp4' })
  images.push({ filename, subfolder: '', type: 'output' })
  if (!state.videoOnly) {
    const listedFrames = Math.max(0, length - (state.underdeliverFrames | 0))
    for (let frame = 0; frame < listedFrames; frame += 1) {
      const frameName = `ComfyUI_${String(n).padStart(5, '0')}_frame${String(frame).padStart(3, '0')}.png`
      viewFiles.set(frameName, { bytes: pngGradient(768, 432, n * 7 + frame * 31), mime: 'image/png' })
      images.push({ filename: frameName, subfolder: '', type: 'output' })
    }
  }
  return images
}

function runPrompt(job) {
  const { promptId, graph, extraData, queueNumber, outputsToExecute } = job
  const my = { ...job, timer: null, interrupted: false }
  running = my
  const tick = (fn, delay) => { my.timer = setTimeout(fn, delay) }
  // The REAL completion statuses (main.py:375-379 + execution.py:682/712/
  // 824): completed follows success — an ERROR record is completed:false —
  // and the status messages carry the (event, data) pairs add_message
  // appended: execution_start, then execution_success | execution_error.
  // (The interrupt path writes its own canonical record — see
  // interruptRunning.)
  const finishRecord = (images, status, errorOverride) => {
    const messages = [['execution_start', { prompt_id: promptId }]]
    if (status === 'success') messages.push(['execution_success', { prompt_id: promptId }])
    else messages.push(['execution_error', {
      prompt_id: promptId,
      node_id: 'sampler',
      node_type: 'MiniMaxH3ImageToVideo',
      executed: [],
      exception_type: 'OOM',
      exception_message: 'CUDA out of memory. Tried to allocate 2.34 GiB (GPU 0; 23.99 GiB total capacity)',
      traceback: 'fake traceback',
      current_inputs: {},
      current_outputs: [],
      ...(errorOverride ?? {}),
    }])
    const write = () => histories.set(promptId, {
      prompt: [queueNumber, promptId, graph, extraData, outputsToExecute],
      outputs: { final: { images } },
      status: { status_str: status, completed: status === 'success', messages },
    })
    if (state.historyLagMs > 0) setTimeout(write, state.historyLagMs)
    else write()
  }
  send({ type: 'status', data: { status: { exec_info: { queue_remaining: queueRemaining() } } } })
  send({ type: 'execution_start', data: { prompt_id: promptId } })
  if (state.failMode === 'hang') return // nothing more — the hang leg
  const total = state.steps
  let step = 0
  const seed = jobCounter
  const advance = () => {
    if (my.interrupted) return
    step += 1
    if (state.failMode === 'error' && step === 3) {
      send({ type: 'executing', data: { prompt_id: promptId, node: 'KSamplerSelect' } })
      send({
        type: 'execution_error',
        data: {
          prompt_id: promptId,
          node_type: 'MiniMaxH3ImageToVideo',
          node_id: 'sampler',
          exception_type: 'OOM',
          exception_message: 'CUDA out of memory. Tried to allocate 2.34 GiB (GPU 0; 23.99 GiB total capacity)',
          traceback: 'fake traceback',
          current_inputs: {},
        },
      })
      finishRecord([], 'error')
      send({ type: 'status', data: { status: { exec_info: { queue_remaining: queueRemaining() } } } })
      running = null
      startNextPending()
      return
    }
    send({ type: 'progress', data: { prompt_id: promptId, value: step, max: total } })
    if (state.emitBinaryPreviews && step % 2 === 0) sendPreview(seed, step)
    if (step < total) {
      tick(advance, state.stepDelayMs)
      return
    }
    // The carry-save THROW (audit I-2): the pack's Save node throws at the
    // sampler's completion. Under the CANONICAL scheduling (true) it is
    // staged BEFORE the decode/media chain can run (the output-first pick),
    // so the abort records NO outputs; under 'with-media' the reorder the
    // pack's upstream ask would deliver let the media save complete first,
    // so the failed job's record carries the media output. The carry file is
    // never written either way (the pack's tmp-then-replace never creates
    // the destination on a throwing write).
    const carrySaveId = Object.keys(graph ?? {}).find((id) => graph[id] && typeof graph[id] === 'object' && graph[id].class_type === 'MiniMaxH3MotionContextSaveLatent') ?? null
    if (state.failCarrySave && carrySaveId !== null) {
      const n = jobCounter
      const carryError = {
        node_id: carrySaveId,
        node_type: 'MiniMaxH3MotionContextSaveLatent',
        exception_type: 'OSError',
        exception_message: '[Errno 28] No space left on device during the carry safetensors write',
      }
      const images = state.failCarrySave === 'with-media' ? videoJobOutputs(n, graph) : []
      send({ type: 'executing', data: { prompt_id: promptId, node: carrySaveId } })
      send({ type: 'execution_error', data: { prompt_id: promptId, ...carryError, traceback: 'fake traceback', current_inputs: {} } })
      finishRecord(images, 'error', carryError)
      send({ type: 'status', data: { status: { exec_info: { queue_remaining: queueRemaining() } } } })
      running = null
      startNextPending()
      return
    }
    // done — emit output(s) and close the job. Graph-aware: a graph whose
    // save tail is SaveImage nodes (the image workbench's packet ladder)
    // receives one PNG per SaveImage node; a video graph receives the mp4.
    const n = jobCounter
    const images = videoJobOutputs(n, graph)
    // The in-graph carry save (extension lane §7): the pack's Save node
    // executes with the render — a carrying graph writes its carry file at
    // completion, before the executed/success events close the job. The
    // omitCarrySave knob suppresses ONLY this write (media still lands) —
    // the no-file shape the not-produced condition names.
    if (!state.omitCarrySave) writeCarryArtifact(graph, n)
    send({ type: 'executing', data: { prompt_id: promptId, node: 'MiniMaxH3ImageToVideo' } })
    send({ type: 'executed', data: { prompt_id: promptId, node: 'save', output: { images } } })
    send({ type: 'execution_success', data: { prompt_id: promptId } })
    send({ type: 'status', data: { status: { exec_info: { queue_remaining: queueRemaining() } } } })
    finishRecord(images, 'success')
    running = null
    startNextPending()
  }
  tick(advance, state.stepDelayMs)
}

/** Interrupts the RUNNING job the way the canonical engine does
 *  (server.py:1185 + execution.py:693-699 + main.py:375-379): the run dies
 *  mid-flight, the queue moves on, and the history record carries the REAL
 *  interrupted shape — status_str 'error', completed false, and the
 *  ('execution_interrupted', {...}) message pair. There is NO 'interrupted'
 *  status_str in a real ComfyUI; the pre-Codex mirror invented one and hid
 *  the port's misclassification (Codex I4).
 */
function interruptRunning() {
  const killed = running
  running = null
  clearTimeout(killed.timer)
  killed.interrupted = true
  histories.set(killed.promptId, {
    prompt: [killed.queueNumber, killed.promptId, killed.graph, killed.extraData, killed.outputsToExecute],
    outputs: {},
    status: {
      status_str: 'error',
      completed: false,
      messages: [
        ['execution_interrupted', { prompt_id: killed.promptId, node_id: 'sampler', node_type: 'MiniMaxH3ImageToVideo', executed: [] }],
      ],
    },
  })
  send({ type: 'execution_interrupted', data: { prompt_id: killed.promptId, node_id: 'sampler' } })
  send({ type: 'status', data: { status: { exec_info: { queue_remaining: queueRemaining() } } } })
  startNextPending()
}

// ---------------------------------------------------------------- http
const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}
const readBody = (req) => new Promise((resolve) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => resolve(Buffer.concat(chunks)))
})

async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://engine.local')
  try {
    if (control(req, res, url)) return

    if (url.pathname === '/system_stats') {
      return json(res, 200, profile.systemStats ?? {
        system: { comfyui_version: 'v0.34.0', python_version: '3.12.3', os: 'linux' },
        devices: [{ name: 'NVIDIA GeForce RTX 4090', type: 'cuda', index: 0, vram_total: 25757220864, vram_free: 24000000000, torch_version: '2.8.0+cu128' }],
      })
    }

    if (url.pathname === '/object_info') {
      if (state.hangObjectInfo) return true // accepted, never answered — the hung-enumeration shape
      return json(res, 200, state.loaderEnumerations ? patchLoaderCombos(state.loaderEnumerations) : objectInfo)
    }
    const targeted = /^\/object_info\/(.+)$/.exec(url.pathname)
    if (targeted) {
      if (state.hangObjectInfo) return true
      const className = decodeURIComponent(targeted[1])
      const source = state.loaderEnumerations ? patchLoaderCombos(state.loaderEnumerations) : objectInfo
      return json(res, 200, className in source ? { [className]: source[className] } : {})
    }

    if (url.pathname === '/models') return json(res, 200, Object.keys(profile.modelListings ?? {}))
    const folder = /^\/models\/(.+)$/.exec(url.pathname)
    if (folder) {
      const kind = decodeURIComponent(folder[1])
      const listing = (profile.modelListings ?? {})[kind]
      if (!listing) { res.writeHead(404); res.end(); return }
      return json(res, 200, listing)
    }

    if (url.pathname === '/prompt' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString('utf8'))
      jobCounter += 1
      const promptId = `fake-${Date.now().toString(36)}-${jobCounter}`
      if (state.failMode === 'validation') {
        return json(res, 400, {
          error: 'Prompt outputs failed validation',
          node_errors: {
            sampler: {
              errors: [{
                type: 'value_smaller_than_min',
                message: 'Value 1 in field: length is smaller than the minimum of 5',
                details: '17 >= 5',
                extra_info: { input_name: ['length', 1], message: 'Value 1 in field: length is smaller than the minimum of 5' },
              }],
              class_type: 'MiniMaxH3ImageToVideo',
              dependent_outputs: [],
              errors_by_input: { length: 0 },
            },
          },
        })
      }
      // A prompt submitted while another renders QUEUES (the real engine's
      // queue_pending) — the single execution slot frees at completion,
      // error, or interrupt.
      const job = {
        promptId,
        graph: body.prompt ?? {},
        extraData: body.extra_data ?? '',
        queueNumber: jobCounter,
        outputsToExecute: outputsToExecuteOf(body.prompt ?? {}),
      }
      if (running) pending.push(job)
      else runPrompt(job)
      return json(res, 200, { prompt_id: promptId, number: jobCounter, node_errors: {} })
    }

    if (url.pathname === '/queue' && req.method === 'GET') {
      // The REAL shape (server.py:1072-1078, devdocs §2): both lists carry
      // the item TUPLES [number, prompt_id, prompt, extra_data,
      // outputs_to_execute] (sensitive keys stripped — only auth/api keys
      // ever are; attempt_id rides). Never bare ids — a flattened form here
      // once left the production tuple branch CI-dead (review I-A).
      const queueItem = (job) => [job.queueNumber, job.promptId, job.graph, job.extraData, job.outputsToExecute]
      return json(res, 200, {
        queue_running: running ? [queueItem(running)] : [],
        queue_pending: pending.map(queueItem),
      })
    }
    if (url.pathname === '/queue' && req.method === 'POST') {
      // The REAL queue-management op (server.py:1146-1158): {"clear":true}
      // wipes pending; {"delete":[id,...]} dequeues by id — and the answer
      // is an EMPTY 200 always. delete_queue_item walks the PENDING heap
      // only, so a running (or unknown) id is a documented no-op.
      let patch = {}
      try { patch = JSON.parse((await readBody(req)).toString('utf8') || '{}') } catch { patch = {} }
      if (patch.clear === true) pending.length = 0
      if (Array.isArray(patch.delete)) {
        for (const id of patch.delete) {
          const index = pending.findIndex((job) => job.promptId === id)
          if (index >= 0) pending.splice(index, 1)
        }
        send({ type: 'status', data: { status: { exec_info: { queue_remaining: queueRemaining() } } } })
      }
      res.writeHead(200)
      res.end()
      return
    }
    if (url.pathname === '/history') {
      const visible = Object.fromEntries(histories)
      if (state.hideHistoryFor) delete visible[state.hideHistoryFor]
      return json(res, 200, visible)
    }
    const hist = /^\/history\/(.+)$/.exec(url.pathname)
    if (hist) {
      const id = decodeURIComponent(hist[1])
      if (id === state.hideHistoryFor) return json(res, 200, {})
      return json(res, 200, histories.has(id) ? { [id]: histories.get(id) } : {})
    }

    if (url.pathname === '/view') {
      const filename = url.searchParams.get('filename') ?? ''
      const subfolder = url.searchParams.get('subfolder') ?? ''
      const type = url.searchParams.get('type') ?? 'output'
      const file = viewFiles.get(filename)
      if (!file && type === 'output' && filename) {
        // The disk-backed output folder (the carry save model): the real
        // engine serves saved output files by (subfolder, filename) off its
        // output directory — the receipt fetch's addressing. Containment-
        // checked: a request may never walk out of the output tree.
        const resolved = path.resolve(outputDir, subfolder, filename)
        if (resolved.startsWith(outputDir + path.sep) && fs.existsSync(resolved)) {
          const serve = () => {
            const bytes = fs.readFileSync(resolved)
            res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) })
            res.end(req.method === 'HEAD' ? undefined : bytes)
          }
          if (state.carryViewDelayMs > 0) setTimeout(serve, state.carryViewDelayMs)
          else serve()
          return
        }
      }
      if (!file) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'content-type': file.mime, 'content-length': String(file.bytes.length) })
      res.end(req.method === 'HEAD' ? undefined : file.bytes)
      return
    }

    if (url.pathname === '/upload/image' && req.method === 'POST') {
      // The REAL contract (server.py:400-447): the multipart `type` FIELD
      // routes the write — get_dir_by_type maps input/temp/output onto the
      // engine's own folders (an unknown value crashes the real handler with
      // an unbound local → 500, modeled honestly here). `output` writes into
      // the DISK-BACKED output tree under (subfolder, filename),
      // containment-checked exactly like the real commonpath guard, with the
      // real collision semantics: overwrite=true writes the exact name;
      // otherwise a byte-identical duplicate is a no-op and a DIFFERENT file
      // forks to "name (1).ext" — the fork the studio's stage-back must never
      // rely on happening (it sends overwrite=true). `input` keeps the
      // mirror's in-memory viewFiles behavior (the reference-upload path).
      const body = await readBody(req)
      const contentType = req.headers['content-type'] ?? ''
      const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
      if (!boundaryMatch) { res.writeHead(400); res.end(); return }
      const boundary = Buffer.from(`--${boundaryMatch[1] ?? boundaryMatch[2]}`)
      let start = body.indexOf(boundary)
      const fields = new Map()
      const files = []
      while (start >= 0) {
        const next = body.indexOf(boundary, start + boundary.length)
        if (next < 0) break
        const part = body.subarray(start + boundary.length + 2, next - 2) // strip CRLF around
        const headerEnd = part.indexOf('\r\n\r\n')
        if (headerEnd >= 0) {
          const header = part.subarray(0, headerEnd).toString('utf8')
          const nameMatch = /name="([^"]*)"/.exec(header)
          if (nameMatch) {
            const fieldName = nameMatch[1]
            const fileMatch = /filename="([^"]*)"/.exec(header)
            if (fileMatch && fileMatch[1]) files.push({ fieldName, filename: fileMatch[1], bytes: part.subarray(headerEnd + 4) })
            else fields.set(fieldName, part.subarray(headerEnd + 4).toString('utf8'))
          }
        }
        start = next
      }
      const uploadType = fields.has('type') ? fields.get('type') : 'input'
      if (uploadType !== 'input' && uploadType !== 'temp' && uploadType !== 'output') {
        res.writeHead(500)
        res.end()
        return
      }
      const file = files.find((entry) => entry.fieldName === 'image') ?? files[0]
      if (!file) { res.writeHead(400); res.end(); return }
      if (uploadType === 'output') {
        const subfolder = fields.get('subfolder') ?? ''
        const overwrite = fields.get('overwrite') === 'true' || fields.get('overwrite') === '1'
        const fullOutputFolder = path.resolve(outputDir, path.normalize(subfolder))
        let filepath = path.resolve(fullOutputFolder, file.filename)
        if (!(filepath === outputDir || filepath.startsWith(outputDir + path.sep))) { res.writeHead(400); res.end(); return }
        if (!fs.existsSync(fullOutputFolder)) fs.mkdirSync(fullOutputFolder, { recursive: true })
        let name = file.filename
        if (!overwrite) {
          let index = 1
          while (fs.existsSync(filepath)) {
            if (fs.existsSync(filepath) && fs.statSync(filepath).size === file.bytes.length && file.bytes.equals(fs.readFileSync(filepath))) break // the real duplicate-hash no-op
            const split = path.extname(file.filename)
            name = `${file.filename.slice(0, file.filename.length - split.length)} (${index})${split}`
            filepath = path.join(fullOutputFolder, name)
            index += 1
          }
        }
        fs.writeFileSync(filepath, file.bytes)
        return json(res, 200, { name, subfolder, type: uploadType })
      }
      viewFiles.set(file.filename, { bytes: file.bytes, mime: file.filename.endsWith('.png') ? 'image/png' : file.filename.match(/\.mp4$|\.webm$/) ? 'video/mp4' : 'application/octet-stream' })
      return json(res, 200, { name: file.filename, subfolder: '', type: 'input' })
    }

    if (url.pathname === '/interrupt' && req.method === 'POST') {
      // The REAL contract (server.py:1160-1198): an unparseable/absent body
      // is {} (the JSONDecodeError catch); a prompt_id interrupts ONLY if
      // that id is CURRENTLY RUNNING — a pending id is a deliberate no-op
      // (dequeue through POST /queue is the pending half); no prompt_id is
      // a global interrupt. The answer is an EMPTY 200 — never JSON (the
      // pre-Codex mirror's {} body hid the port's parse-the-empty-body
      // defect, Codex I2).
      let body = {}
      try { body = JSON.parse((await readBody(req)).toString('utf8')) } catch { body = {} }
      const promptId = body?.prompt_id
      if (promptId) {
        if (running && running.promptId === promptId) interruptRunning()
      } else if (running) {
        interruptRunning()
      }
      res.writeHead(200)
      res.end()
      return
    }
    if (url.pathname === '/free' && req.method === 'POST') return json(res, 200, {})
    if (url.pathname === '/refresh' && req.method === 'POST') {
      state.refreshHits += 1
      return json(res, 200, {})
    }

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: `fake engine has no ${url.pathname}` }))
  } catch (failure) {
    console.error('[fake-engine] handler failure', failure)
    if (!res.headersSent) { res.writeHead(500); res.end() }
  }
}

server.listen(port, '127.0.0.1', () => {
  console.log(`[fake-engine] profile=${profile.id} listening on http://127.0.0.1:${port}`)
  console.log(`[fake-engine] object_info classes=${Object.keys(objectInfo).length} model folders=${Object.keys(profile.modelListings ?? {}).join(', ')}`)
  console.log(`[fake-engine] customNodeDirs=${(profile.customNodeDirs ?? []).join(', ') || '(none)'}`)
})
