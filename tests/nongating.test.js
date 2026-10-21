// The NON-GATING suite (task to7xpa7, spec docs/specs/2026-10-17-hash-catalog.md
// §5 N1/N2 — the wave's prime directive as tests).
//
// The hash catalog must WIDEN what the app can verify and never gate: N1 —
// over ONE fake inventory run twice (null catalog vs a primed fixture), every
// accepted submission and legal pick survives (monotone non-decreasing),
// refusals flip ONLY through the hash-confirmed path, uncataloged files are
// bit-identical, and the fetch suggestion is one-directionally REMOVABLE
// (never added, never mandated); N2 — a catalog with NO verifiable bytes is
// behaviorally the null world, string for string.
//
// The two arms share the exact same inventory (tests/lib/hashfixture.cjs
// nongatingWorld — the §7 quartet + the soup as small synthetic files). The
// primed arm's identity blocks come from the REAL identity engine
// (createModelIdentityEngine over the fixture catalog through the REAL
// loader) — never hand-authored blocks (no second truth). The client seams
// (modelSelection / modelOverrides / h3Stack / wizardModels / h3Submit) run
// through the VM harness, so cross-realm arrays compare via .join('|') /
// JSON.stringify.
//
// Arms (each a named failing-first test):
//   1. N1 picks/acceptances are monotone non-decreasing
//   2. N1 refusals flip only via the hash-confirmed path (added set EMPTY)
//   3. N1 the uncataloged file is bit-identical
//   4. N1 fetch suggestions are one-directionally removable
//   5. N2 with bytes ABSENT (unconfigured roots) the catalog is behaviorally null
//   6. H-I3's cap — the designation dependency caps, never violates
//
// (task CT7) The AC section below runs the spec §7 headline criteria over a
// SECOND world — quartetSoupWorld: the quartet under renamed needle-free
// names, the alias soup with its T=1-named liar, and the orphaned rows from
// CT6's review rider. These legs are AC PINS: the machinery landed in
// T3–T5, so the unit legs assert the AC sentences against it (the wiring
// gap they exposed — the wizard's identify ask never covering a
// name-invisible file — is driven RED/GREEN by the e2e leg, the only
// harness that runs the real component).
import { test, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { loadHashCatalog } from '../server/hashCatalog'
import { createModelIdentityEngine } from '../server/modelIdentity'

const require = createRequire(import.meta.url)
const path = require('node:path')
const assert = require('node:assert/strict')

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { makeScratchDir, removeAllScratchDirs } = require(path.join(REPO, 'tests', 'lib', 'scratch.cjs'))
const { nongatingWorld, quartetSoupWorld } = require(path.join(REPO, 'tests', 'lib', 'hashfixture.cjs'))
const { loadTs } = require(path.join(REPO, 'scripts', 'lib', 'ts-vm.cjs'))

afterAll(async () => {
  await removeAllScratchDirs()
})

const eq = (actual, expected, label) => assert.deepEqual(actual, expected, label)
const ok = (cond, label) => assert.ok(cond, label)

// ---------------------------------------------------------------------------
// harness: the shared inventory, the three identity arms, the VM seams
// ---------------------------------------------------------------------------

let scratch
let world
let nullFiles // the inventory raw — no identity blocks anywhere (the null catalog)
let primedFiles // the same inventory through the REAL engine with designated roots
let capFiles // the same inventory, primed catalog, UNCONFIGURED roots (H-I3's cap)
let selection
let overrides
let h3StackVm
let wizardModelsVm
let h3SubmitVm

// The AC world (task CT7): the §7 quartet + soup inventory — the spec's own
// headline fixtures — through the same three arms. `acWorld.orphans` are the
// no-file catalog rows the CT6-review rider surveys.
let acScratch
let acWorld
let acNull
let acPrimed
let acCap

const FOREIGN_NAME = 'foreign_repack_9000.safetensors'
const MASTER_ALPHA = 'masters/master_alpha.safetensors'
const MASTER_BETA = 'masters/master_beta.safetensors'
const MASTER_GAMMA = 'masters/master_gamma.safetensors'
const MASTER_DELTA = 'masters/master_delta.safetensors'
const TE_OFFICIAL = 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'
const TE_WRONGCLASS = 'qwen3vl_4b_vision_pack.safetensors'
const TE_LIAR = 'qwen3vl_4b_liar_master.safetensors'
const VVAE_OFFICIAL = 'minimax_h3_video_vae_fp16.safetensors'
const VVAE_ALIAS = 'minimax_h3_video_vae_fp16__cmb_alias.safetensors'
const VVAE_Q8 = 'minimax_h3_video_vae_q8.safetensors'
const AVAE = 'minimax_h3_audio_vae_fp32.safetensors'
const T1VAE = 'minimax_h3_t1_image_vae_fp16.safetensors'
const TAEH3 = 'taeh3_decoder.safetensors'
const TURBO8_OFFICIAL = 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'
const TURBO8_RENAMED = 'renamed_speed_rider.safetensors'

// The AC world's names (quartetSoupWorld): the §7 quartet under needle-free
// renamed basenames, the soup's byte-identical alias copies + q8 variant,
// and the T=1-NAMED file whose bytes are the video VAE's. QS_ = the
// quartet-soup world (distinct from the nongating world's names above).
const QS_AURORA = 'renamed/aurora_master.safetensors' // official FL2VA, renamed
const QS_BOREALIS = 'renamed/borealis_master.safetensors' // official Ref2VA, renamed
const QS_CASCADE = 'renamed/cascade_motion.safetensors' // the Viggle-Animate build, renamed
const QS_DELTA = 'renamed/dualstream_merge.safetensors' // the smhfacct hybrid, renamed
const QS_TE = 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'
const QS_VVAE = 'minimax_h3_video_vae_fp16.safetensors'
const QS_ALIAS2 = 'minimax_h3_video_vae_fp16__setCMBalias2.safetensors'
const QS_ALIAS3 = 'minimax_h3_video_vae_fp16__alias3.safetensors'
const QS_VVAE_Q8 = 'minimax_h3_video_vae_q8.safetensors'
const QS_AVAE = 'minimax_h3_audio_vae_fp32.safetensors'
const QS_T1_LIAR = 'minimax_h3_t1_image_vae_fp16.safetensors' // bytes = the video VAE fp16's
const QS_TAEH3 = 'taeh3_decoder.safetensors'

const ALL_SLOTS = ['fl2va', 'ref2va', 'textEncoder', 'videoVae', 'audioVae', 'previewVae', 'fl2vLora', 'ref2vLora']
const ALL_TIERS = ['off', '4', '8']

function settingsFor(roots) {
  return {
    modelRoot: '',
    paths: {
      diffusion_models: roots.diffusion_models ?? '',
      text_encoders: roots.text_encoders ?? '',
      vae: roots.vae ?? '',
      loras: roots.loras ?? '',
      vae_approx: roots.vae_approx ?? '',
      clip_vision: '',
    },
  }
}

/** Runs the inventory through the REAL engine at the given roots: the lazy
 *  identify trigger enqueues the digests (the size pre-filter admits every
 *  fixture file — each row's sizeBytes IS the file's length), drain settles
 *  them, then the populate helper consults the settled cache. Returns the
 *  payloads the wire would carry (ModelFile.identity blocks). */
async function identify(files, catalogPath, hashCachePath, roots) {
  const engine = createModelIdentityEngine({
    catalog: loadHashCatalog({ MONOKA_HASH_CATALOG: catalogPath }),
    hashCachePath,
  })
  const settings = settingsFor(roots)
  engine.requestIdentification(files.map(({ name, kind }) => ({ kind, name })), settings)
  await engine.drain()
  return engine.attachIdentities(files, settings)
}

beforeAll(async () => {
  scratch = makeScratchDir(path.join(require('node:os').tmpdir(), 'monoka-nongating-'))
  world = nongatingWorld(scratch)
  nullFiles = world.files.map(({ name, kind, bytes }) => ({ name, kind, bytes }))
  primedFiles = await identify(nullFiles, world.catalogPath, path.join(scratch, 'cache', 'hash-cache.json'), world.roots)
  capFiles = await identify(nullFiles, world.catalogPath, path.join(scratch, 'cache', 'hash-cache-cap.json'), {})

  // ANTI-VACUITY: the primed arm must actually carry hash-confirmed bytes —
  // every rowed file EXCEPT the two rowless ones confirms. Without this the
  // arms below could pass green while proving nothing (an engine that
  // silently answered unknown everywhere would satisfy "nothing changed").
  const confirmed = primedFiles.filter((file) => file.identity && file.identity.verdict === 'hash-confirmed').map((file) => file.name).sort()
  eq(confirmed, [
    MASTER_ALPHA, MASTER_BETA, MASTER_DELTA, MASTER_GAMMA,
    AVAE, TE_LIAR, TE_OFFICIAL, TAEH3, TURBO8_OFFICIAL, TURBO8_RENAMED,
    T1VAE, VVAE_ALIAS, VVAE_OFFICIAL, VVAE_Q8,
  ].sort(), 'primed: every cataloged file hash-confirms through the real engine (the rowless two do not)')
  ok(nullFiles.every((file) => file.identity === undefined), 'null: no file carries an identity block')
  ok(capFiles.every((file) => file.identity && file.identity.verdict !== 'hash-confirmed'), 'cap: zero hash-confirmed verdicts')

  selection = loadTs(path.join(REPO, 'src/lib/modelSelection.ts'))
  overrides = loadTs(path.join(REPO, 'src/lib/modelOverrides.ts'))
  h3StackVm = loadTs(path.join(REPO, 'src/lib/h3Stack.ts'))
  wizardModelsVm = loadTs(path.join(REPO, 'src/canvas/wizardModels.ts'), { window: { monoka: {} } })
  h3SubmitVm = loadTs(path.join(REPO, 'src/lib/h3Submit.ts'), {
    localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    window: { monoka: {} },
  })

  // The AC world's three arms — same discipline, same anti-vacuity: the
  // primed arm must actually carry the quartet + the whole soup confirmed,
  // and the cap arm must carry zero confirmations.
  acScratch = makeScratchDir(path.join(require('node:os').tmpdir(), 'monoka-nongating-ac-'))
  acWorld = quartetSoupWorld(acScratch)
  acNull = acWorld.files.map(({ name, kind, bytes }) => ({ name, kind, bytes }))
  acPrimed = await identify(acNull, acWorld.catalogPath, path.join(acScratch, 'cache', 'hash-cache.json'), acWorld.roots)
  acCap = await identify(acNull, acWorld.catalogPath, path.join(acScratch, 'cache', 'hash-cache-cap.json'), {})
  const acConfirmed = acPrimed.filter((file) => file.identity && file.identity.verdict === 'hash-confirmed').map((file) => file.name).sort()
  eq(acConfirmed, [
    QS_AURORA, QS_BOREALIS, QS_CASCADE, QS_DELTA, QS_TE,
    QS_VVAE, QS_ALIAS2, QS_ALIAS3, QS_VVAE_Q8, QS_AVAE, QS_T1_LIAR, QS_TAEH3, TURBO8_OFFICIAL,
  ].sort(), 'AC anti-vacuity: the whole quartet AND the whole soup (aliases + q8 + the liar) hash-confirm through the real engine')
  ok(acNull.every((file) => file.identity === undefined), 'AC null: no file carries an identity block')
  ok(acCap.every((file) => file.identity && file.identity.verdict !== 'hash-confirmed'), 'AC cap: zero hash-confirmed verdicts')
})

// ---------------------------------------------------------------------------
// shared drivers
// ---------------------------------------------------------------------------

const candidatesKey = (files, slot, tier) => {
  const set = selection.slotCandidates(files, slot, tier)
  return `${set.picked || '(none)'}#${set.basis || '-'}#[${set.names.join('|')}]`
}

const template = {
  mode: 'text', prompt: 'a lone drummer', width: 1344, height: 768, duration: 6, seed: 1, steps: 30,
  turbo: 'off', turboLoader: 'auto', experimentalSampling: false, loraStrength: 1, sampler: 'res_multistep', scheduler: 'simple',
  refImageSize: 'match', upscale: { mode: 'off', model: '', vae: '', lbhModel: '', missingNodes: [] }, rtxModel: '',
  firstFrame: null, lastFrame: null, referenceImages: [], referenceVideos: [], referenceAudios: [], timelineGuides: [],
  livePreview: { enabled: false, mode: 'standard' },
}
const renderRequest = (over = {}) => ({ ...template, ...over })

/** Every refusal-shaped string the validate seam can emit for the arm's
 *  selections: the mode × tier grid at the DERIVED modelReady (the honest
 *  engine-chip state — h3StackReady over the arm's own selection). Forced
 *  factitious states are deliberately NOT sampled: `modelReady: false`
 *  beside a COMPLETE selection is a state only the primed arm can reach
 *  (its hash rung completes the stack), so forcing it would manufacture a
 *  generic-fallback refusal the null world can never emit — a sampler
 *  artifact, not an N1 violation. */
function renderRefusals(files) {
  const strings = new Set()
  for (const tier of ALL_TIERS) {
    const inferred = selection.inferSelections(files, tier)
    for (const mode of ['text', 'reference']) {
      const modelReady = h3StackVm.h3StackReady({ selection: inferred, mode, turbo: tier === 'off' ? 'off' : tier })
      const over = tier === 'off' ? {} : { turbo: tier, steps: tier === '8' ? 8 : 4 }
      if (mode === 'reference') over.referenceImages = [{ name: 'r.png', path: '/r.png', kind: 'image' }]
      const refusal = h3SubmitVm.validateH3Render(renderRequest({ mode, ...over }), {
        connected: true, modelReady, selection: inferred, h3PreviewOverrideNode: undefined,
      })
      if (refusal) strings.add(refusal)
    }
  }
  return strings
}

/** Every refusal the override seam can emit: each file consciously picked
 *  into each slot (the exhaustive pick survey — the Settings rows' verdict
 *  and the submission's refusal source, one function). */
function overrideRefusals(files) {
  const strings = new Set()
  for (const slot of overrides.OVERRIDE_SLOTS) {
    for (const file of files) {
      const outcome = overrides.overridePickOutcome('monoka', slot, file.name, files)
      if (outcome.state === 'refused') strings.add(outcome.reason)
    }
  }
  return strings
}

function teClassRefusals(files) {
  const strings = new Set()
  for (const file of files) {
    const refusal = selection.teDimClassRefusal('monoka', file.name, file.identity)
    if (refusal) strings.add(refusal)
  }
  return strings
}

function allRefusals(files) {
  const strings = renderRefusals(files)
  for (const string of overrideRefusals(files)) strings.add(string)
  for (const string of teClassRefusals(files)) strings.add(string)
  for (const row of h3StackVm.h3StackReport(files).rows) if (row.refusal) strings.add(row.refusal)
  strings.add(h3StackVm.turboTierRefusal('4', 'text'))
  strings.add(h3StackVm.turboTierRefusal('8', 'reference'))
  return strings
}

const REPORT = 'lightx2v-fl2v-turbo-8'
function servedCatalog() {
  return [{
    id: REPORT,
    name: 'LightX2V FL2V Turbo 8-step',
    licenseSpdx: 'Apache-2.0',
    licenseNote: 'Apache-2.0',
    sizeClass: 'medium',
    source: { kind: 'hf', repo: 'lightx2v/Minimax-h3-Turbo', revision: { kind: 'sha', value: '9bc1f3c0407805b00da9f762639cb435c644b2dc' } },
    destination: { kind: 'model-root', root: 'loras' },
    files: [{ path: 'minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors' }],
    state: 'absent',
    inFlight: false,
  }]
}

/** The wizard Models step's download-LINK view ids under the arm's files
 *  (the served catalog carries the one mapped row). Spread into a host
 *  array — the rows are built in the VM realm and their map/filter chain
 *  stays there, which deepEqual would otherwise reject on Array prototype
 *  alone. */
function linkViews(files) {
  const report = h3StackVm.h3StackReport(files)
  return [...wizardModelsVm.modelsStepRows(files, report, servedCatalog())
    .map((row) => row.link && row.link.entryId).filter(Boolean)]
}

// ---------------------------------------------------------------------------
// arm 1 — N1: picks/acceptances are monotone non-decreasing
// ---------------------------------------------------------------------------

test('N1 arm 1: every null-catalog pick survives primed, and the hash rung only adds', () => {
  for (const slot of ALL_SLOTS) {
    for (const tier of ALL_TIERS) {
      const nullSet = selection.slotCandidates(nullFiles, slot, tier)
      const primedSet = selection.slotCandidates(primedFiles, slot, tier)
      if (nullSet.picked) {
        eq(primedSet.picked, nullSet.picked, `monotone: ${slot}@${tier} keeps the null pick under primed`)
        ok(primedSet.names.indexOf(nullSet.picked) !== -1, `monotone: ${slot}@${tier} null pick stays enumerated`)
      }
      // The basis may only climb (anchored/fallback → hash), never demote.
      if (nullSet.basis === 'hash') eq(primedSet.basis, 'hash', `monotone: ${slot}@${tier} a hash basis never demotes`)
    }
  }

  // The named cases (the brief's element-wise list).
  const fl2vaNull = selection.slotCandidates(nullFiles, 'fl2va', 'off')
  const fl2vaPrimed = selection.slotCandidates(primedFiles, 'fl2va', 'off')
  eq(fl2vaNull.picked, '', 'renamed quartet: the needle-free fl2va master resolves NOTHING under null')
  eq([fl2vaPrimed.picked, fl2vaPrimed.basis], [MASTER_ALPHA, 'hash'], 'renamed quartet: primed resolves it through the hash rung (a gain, never a loss)')

  const ref2vaNull = selection.slotCandidates(nullFiles, 'ref2va', 'off')
  const ref2vaPrimed = selection.slotCandidates(primedFiles, 'ref2va', 'off')
  eq(ref2vaNull.picked, '', 'renamed quartet: ref2va empty under null')
  eq([ref2vaPrimed.picked, ref2vaPrimed.basis], [MASTER_BETA, 'hash'], 'renamed quartet: ref2va hash-resolves under primed')

  const vvaeNull = selection.slotCandidates(nullFiles, 'videoVae', 'off')
  const vvaePrimed = selection.slotCandidates(primedFiles, 'videoVae', 'off')
  eq(vvaeNull.picked, VVAE_OFFICIAL, 'soup: null anchors the official fp16 name')
  eq(vvaePrimed.picked, VVAE_OFFICIAL, 'soup: the H-M2 tie-break keeps the official under the hash pool')
  eq(vvaePrimed.basis, 'hash', 'soup: the pick now rides byte evidence')
  ok(vvaeNull.names.join('|').indexOf(VVAE_ALIAS) !== -1 && vvaeNull.names.join('|').indexOf(VVAE_Q8) !== -1, 'soup: null enumerates the byte-identical alias and the q8 variant')
  ok(vvaePrimed.names.join('|').indexOf(VVAE_ALIAS) !== -1 && vvaePrimed.names.join('|').indexOf(VVAE_Q8) !== -1, 'soup: primed enumerates them too')

  const lora8Null = selection.slotCandidates(nullFiles, 'fl2vLora', '8')
  const lora8Primed = selection.slotCandidates(primedFiles, 'fl2vLora', '8')
  eq(lora8Null.picked, TURBO8_OFFICIAL, 'turbo tier 8: null anchors the official name')
  eq(lora8Primed.picked, TURBO8_OFFICIAL, 'turbo tier 8: H-M2 keeps the official over the renamed turbo-8 (its basename is in no alias bucket)')
  ok(lora8Null.names.indexOf(TURBO8_RENAMED) === -1, 'turbo tier 8: the renamed LoRA is invisible to the null name ladder')
  ok(lora8Primed.names.indexOf(TURBO8_RENAMED) !== -1, 'turbo tier 8: primed enumerates it (names only grow)')
  eq(selection.slotCandidates(nullFiles, 'fl2vLora', '4').picked, '', 'turbo tier 4: empty under null (no 4-step bytes)')
  eq(selection.slotCandidates(primedFiles, 'fl2vLora', '4').picked, '', 'turbo tier 4: STILL empty under primed (turbo-8 bytes never confirm a turbo-4 slot)')

  // The never-picks: hash evidence for artifacts that map to NO slot is
  // behaviorally inert (the viggle master), the merged slot never
  // auto-infers (the hybrid master), and the uncataloged extra is invisible.
  for (const slot of ALL_SLOTS) {
    for (const tier of ALL_TIERS) {
      const names = selection.slotCandidates(primedFiles, slot, tier).names.join('|')
      ok(names.indexOf(MASTER_GAMMA) === -1, `inert: the viggle master enters no ${slot}@${tier} candidates (unmapped artifact)`)
      ok(names.indexOf(MASTER_DELTA) === -1, `merged: the hybrid master enters no ${slot}@${tier} candidates (override-only slot)`)
      ok(names.indexOf(FOREIGN_NAME) === -1, `uncataloged: the foreign file enters no ${slot}@${tier} candidates`)
    }
  }

  // Conscious picks: every null-'applied' override outcome stays applied
  // with the same file under primed (the legal-pick set is monotone too).
  for (const slot of overrides.OVERRIDE_SLOTS) {
    for (const file of nullFiles) {
      const nullOutcome = overrides.overridePickOutcome('monoka', slot, file.name, nullFiles)
      if (nullOutcome.state !== 'applied') continue
      const primedOutcome = overrides.overridePickOutcome('monoka', slot, file.name, primedFiles)
      eq(primedOutcome.state, 'applied', `picks: ${file.name} @ ${slot} applied under null stays applied primed`)
      eq(primedOutcome.file, nullOutcome.file, `picks: ${file.name} @ ${slot} keeps its file`)
    }
  }

  // Accepted submissions: the null world DOES grant one full-stack journey —
  // a user who consciously picks the renamed fl2va master through the
  // override seam (which never gated on names) completes the stack, and
  // validate accepts the render. That exact request must stay accepted under
  // primed; and primed must ALSO accept it WITHOUT the pick (the hash rung
  // adding acceptance is the monotone GAIN direction).
  const overrideSelection = (files) =>
    overrides.resolveModels('monoka', selection.inferSelections(files, 'off'), files, { fl2va: MASTER_ALPHA }).selection
  const nullOverridden = overrideSelection(nullFiles)
  const primedOverridden = overrideSelection(primedFiles)
  eq(nullOverridden.fl2va, MASTER_ALPHA, 'acceptances: the override pick carries the renamed master into the null stack')
  ok(h3StackVm.h3StackReady({ selection: nullOverridden, mode: 'text', turbo: 'off' }), 'acceptances: the override-completed null stack is ready (the null world accepted this render)')
  eq(
    h3SubmitVm.validateH3Render(renderRequest(), {
      connected: true, modelReady: true, selection: nullOverridden, h3PreviewOverrideNode: undefined,
    }),
    null,
    'acceptances: the null-accepted submission is accepted',
  )
  eq(
    h3SubmitVm.validateH3Render(renderRequest(), {
      connected: true, modelReady: true, selection: primedOverridden, h3PreviewOverrideNode: undefined,
    }),
    null,
    'acceptances: the SAME submission stays accepted under primed',
  )
  eq(
    h3SubmitVm.validateH3Render(renderRequest(), {
      connected: true, modelReady: h3StackVm.h3StackReady({ selection: selection.inferSelections(primedFiles, 'off'), mode: 'text', turbo: 'off' }),
      selection: selection.inferSelections(primedFiles, 'off'), h3PreviewOverrideNode: undefined,
    }),
    null,
    'acceptances: primed accepts the render WITHOUT the pick — the hash rung only adds (the gain direction)',
  )
})

// ---------------------------------------------------------------------------
// arm 2 — N1: refusals flip only via the hash-confirmed path
// ---------------------------------------------------------------------------

test('N1 arm 2: zero new refusal strings; every disappearing refusal is hash-justified', () => {
  const nullStrings = allRefusals(nullFiles)
  const primedStrings = allRefusals(primedFiles)

  const added = [...primedStrings].filter((string) => !nullStrings.has(string))
  eq(added, [], 'N1: NO refusal string appears under primed that was absent under null')

  const removed = [...nullStrings].filter((string) => !primedStrings.has(string))
  ok(removed.length > 0, 'N1: the flip actually happens in this fixture (non-empty removed set)')

  // Every removed refusal must correspond to hash-confirmed evidence:
  //   - the liar TE's class refusal (its bytes hash-confirm the 32B text
  //     encoder its lying 4B name denies) — the byte-evidence-corrects-a-
  //     lying-name arm;
  //   - the membership rung's missing-stack strings (the FL2VA/Ref2VA the
  //     null catalog could not see) — the renamed-quartet arm.
  const liarJustified = selection.identityConfirmsArtifact(
    primedFiles.find((file) => file.name === TE_LIAR),
    [selection.GUARD_SLOT_ARTIFACT.textEncoder],
  )
  ok(liarJustified, 'justification: the liar TE hash-confirms the text-encoder artifact under primed')
  const alphaJustified = selection.identityConfirmsArtifact(
    primedFiles.find((file) => file.name === MASTER_ALPHA),
    selection.slotArtifacts('fl2va', 'off'),
  )
  const betaJustified = selection.identityConfirmsArtifact(
    primedFiles.find((file) => file.name === MASTER_BETA),
    selection.slotArtifacts('ref2va', 'off'),
  )
  ok(alphaJustified && betaJustified, 'justification: the renamed quartet masters hash-confirm their slots under primed')

  const unjustified = removed.filter((string) => {
    const liarClass = string === selection.teDimClassRefusal('monoka', TE_LIAR)
    const membership = string.indexOf('The H3 stack is incomplete') !== -1
    return !(liarClass || membership)
  })
  eq(unjustified, [], `N1: every removed refusal rides the hash-confirmed path (unjustified: ${JSON.stringify(unjustified)})`)
  ok(removed.indexOf(selection.teDimClassRefusal('monoka', TE_LIAR)) !== -1, 'named case: the liar TE\'s class refusal disappears under primed')

  // The wrong-class picks refuse IDENTICALLY when no row confirms the slot's
  // artifact — the guards never gain a refusal and never lose one wrongly.
  for (const [slot, name] of [['textEncoder', TE_WRONGCLASS], ['videoVae', T1VAE], ['videoVae', AVAE], ['audioVae', VVAE_OFFICIAL], ['imageVae', VVAE_OFFICIAL], ['textEncoder', FOREIGN_NAME]]) {
    const nullOutcome = overrides.overridePickOutcome('monoka', slot, name, nullFiles)
    const primedOutcome = overrides.overridePickOutcome('monoka', slot, name, primedFiles)
    eq(primedOutcome.state, nullOutcome.state, `wrong-class: ${name} @ ${slot} keeps its null verdict under primed`)
    eq(primedOutcome.reason || '', nullOutcome.reason || '', `wrong-class: ${name} @ ${slot} refusal string identical`)
  }

  // The TE rung at validate is identity-blind today (the selection carries a
  // NAME) — the liar resolving the slot would not flip the submit rung; pin
  // that shape so a future identity-aware rung shows up as a conscious act.
  const liarSelection = { ...selection.inferSelections(primedFiles, 'off'), textEncoder: TE_LIAR }
  const submitRefusal = h3SubmitVm.validateH3Render(renderRequest(), {
    connected: true, modelReady: true, selection: liarSelection, h3PreviewOverrideNode: undefined,
  })
  ok(submitRefusal !== null && submitRefusal.indexOf('4B-class') !== -1, 'pin: the validate TE rung still refuses the resolved liar by NAME (identity-blind at this seam — the 32B bytes would pass, the 4B name refuses)')
})

// ---------------------------------------------------------------------------
// arm 3 — N1: the uncataloged file is bit-identical
// ---------------------------------------------------------------------------

test('N1 arm 3: the uncataloged file\'s outputs are deep-equal under both catalogs', () => {
  // The primed block for the foreign file is EXACTLY the honest unknown.
  const foreign = primedFiles.find((file) => file.name === FOREIGN_NAME)
  eq(foreign.identity, { verdict: 'unknown' }, 'uncataloged: the primed block is exactly { verdict: unknown } — never name-suspected, never verifying')

  for (const slot of overrides.OVERRIDE_SLOTS) {
    const nullOutcome = overrides.overridePickOutcome('monoka', slot, FOREIGN_NAME, nullFiles)
    const primedOutcome = overrides.overridePickOutcome('monoka', slot, FOREIGN_NAME, primedFiles)
    eq(JSON.stringify(primedOutcome), JSON.stringify(nullOutcome), `uncataloged: ${slot} override verdict bit-identical`)
  }

  // The class hint (the choice-point signal) says the same thing about it —
  // the honest 'VAE (unclassified)' fallback, never an invented class.
  eq(overrides.modelClassHint('diffusion_models', FOREIGN_NAME, foreign.identity), overrides.modelClassHint('diffusion_models', FOREIGN_NAME, undefined), 'uncataloged: the diffusion class hint is identical')
  eq(overrides.modelClassHint('vae', FOREIGN_NAME, foreign.identity), overrides.modelClassHint('vae', FOREIGN_NAME, undefined), 'uncataloged: the VAE class hint is identical')
  eq(overrides.modelClassHint('vae', FOREIGN_NAME, undefined), 'VAE (unclassified)', 'uncataloged: no decoder class is invented for an unmarked name')

  // Stack treatment: it is never selected, never refused, never narrated.
  for (const files of [nullFiles, primedFiles]) {
    const report = h3StackVm.h3StackReport(files)
    const reportJson = JSON.stringify(report)
    ok(reportJson.indexOf(FOREIGN_NAME) === -1, 'uncataloged: the stack report never names the foreign file')
    const verdict = h3StackVm.stackVerdictText(report, 'text').text
    ok(verdict.indexOf(FOREIGN_NAME) === -1, 'uncataloged: the verdict text never names the foreign file')
    const renderJson = JSON.stringify([...renderRefusals(files)])
    ok(renderJson.indexOf(FOREIGN_NAME) === -1, 'uncataloged: no render-refusal string names the foreign file (identity never spontaneously flags it)')
  }
})

// ---------------------------------------------------------------------------
// arm 4 — N1: the download-link surface is one-directional
// (friction 2026-10-21: the fetch suggestions DIED with the studio-side
// download — the mapped row now renders a manual download LINK, and only a
// MISSING component renders one. Presence — at any evidence — retires it.)
// ---------------------------------------------------------------------------

test('N1 arm 4: every arm offers nothing (presence retires the link); a missing component is the only link; nothing is mandated', () => {
  // All three worlds LIST a turbo-shaped file (name-suspected at the
  // weakest) — detection is the whole truth now, so no arm offers a link.
  const nullViews = linkViews(nullFiles)
  const primedViews = linkViews(primedFiles)
  const capViews = linkViews(capFiles)
  eq(nullViews, [], 'null: the detected turbo renders NO download link (presence retires the offer at name-only evidence)')
  eq(primedViews, [], 'one-directional stands: primed offers nothing (hash-confirmed presence)')
  eq(capViews, [], 'the cap arm offers nothing either — the three arms stay equal, nothing added')

  // The positive control (the link's whole reason): a MISSING component —
  // an engine that lists nothing — renders the one manual link, pointed at
  // the pinned source. This is the surface's floor and its ceiling: one
  // link per missing mapped component, no click, no consent, no gate.
  const emptyRows = wizardModelsVm.modelsStepRows([], h3StackVm.h3StackReport([]), servedCatalog(), { engineMode: 'external' })
  const emptyLinks = [...emptyRows.map((row) => row.link && row.link.entryId).filter(Boolean)]
  eq(emptyLinks, [REPORT], 'a missing mapped component renders exactly the one manual download link')
  const emptyLink = emptyRows.find((row) => row.link).link
  ok(emptyLink.files[0].url.indexOf('https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/') === 0, 'the link points at the pinned source (the user fetches it themselves)')
  ok(emptyLink.files[0].placeAt === 'models/loras/minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors', 'the placement spells the ComfyUI-relative path')
  ok(!('gated' in emptyLink), 'the link view carries no gate — there is no studio-side download to gate')

  // The turbo remediation strings: tier 4 has no bytes in EITHER arm — the
  // same single truthful remediation, naming the fetch row it has always
  // named (the LIBRARY's consent-gated fetch — a different surface, alive).
  // Tier 8 resolves in both. Equal, added nothing, mandated nothing.
  const nullTiers = h3StackVm.turboTierStates(nullFiles, 'text')
  const primedTiers = h3StackVm.turboTierStates(primedFiles, 'text')
  eq(JSON.stringify(primedTiers), JSON.stringify(nullTiers), 'turbo remediations: byte-identical between the arms')
  ok(nullTiers['4'].remediation.indexOf('fetch lightx2v-fl2v-turbo-4 through the library (consent-gated)') !== -1, 'nothing mandated: the tier-4 remediation keeps its consent-gated fetch naming')

  // The sanctioned OFFER surface (not a download): the hash-confirmed
  // hybrid names itself on the fl2va row — click-gated, never auto-applied;
  // and under the cap (bytes unknowable) the offer is absent.
  const primedRows = wizardModelsVm.modelsStepRows(primedFiles, h3StackVm.h3StackReport(primedFiles), servedCatalog())
  const fl2vaRow = primedRows.find((row) => row.slot === 'fl2va')
  eq(fl2vaRow.mergedPickOffer && fl2vaRow.mergedPickOffer.name, MASTER_DELTA, 'sanctioned offer: the hash-confirmed hybrid names itself on the fl2va row (primed only)')
  const capRows = wizardModelsVm.modelsStepRows(capFiles, h3StackVm.h3StackReport(capFiles), servedCatalog())
  eq(capRows.find((row) => row.slot === 'fl2va').mergedPickOffer, undefined, 'sanctioned offer: absent under the cap — no bytes, no offer')
})

// ---------------------------------------------------------------------------
// arm 5 — N2: with bytes ABSENT the primed catalog is behaviorally null
// ---------------------------------------------------------------------------

test('N2 arm 5: unconfigured roots — every verdict degrades honestly and the string surface equals null', () => {
  // The cap's vocabulary: name-suspected ONLY for the aliased basenames
  // (the name index still answers — that is the honest fallback), unknown
  // for everything else, `verifying` nowhere.
  const nameSuspected = capFiles.filter((file) => file.identity.verdict === 'name-suspected').map((file) => file.name).sort()
  eq(nameSuspected, [AVAE, TE_OFFICIAL, TAEH3, T1VAE, TURBO8_OFFICIAL, VVAE_ALIAS, VVAE_OFFICIAL, VVAE_Q8].sort(), 'cap: exactly the aliased basenames read name-suspected (the renamed copies do not)')
  ok(capFiles.every((file) => file.identity.verifying === undefined), 'cap: verifying is nowhere (no digest is even enqueued without bytes)')

  // String-set equality with the null world across every narrator:
  // verdict text, the rows' copy (projected past the identity BLOCK itself —
  // the label it renders is compared), the tier states, the fetch views.
  for (const mode of ['text', 'reference']) {
    const nullVerdict = h3StackVm.stackVerdictText(h3StackVm.h3StackReport(nullFiles), mode)
    const capVerdict = h3StackVm.stackVerdictText(h3StackVm.h3StackReport(capFiles), mode)
    eq(capVerdict, nullVerdict, `N2: the ${mode} verdict text is byte-identical`)
  }

  const projectRow = (row) => ({
    label: row.label, selectedName: row.selectedName, present: row.present, source: row.source,
    canonical: row.canonical, isCanonical: row.isCanonical, refusal: row.refusal ?? '',
    makeVisible: row.makeVisible, identity: row.identity, interim: row.interim,
    narration: row.narration, overrideSlot: row.overrideSlot,
    alternates: row.alternates.map((alt) => alt.name),
    link: row.link ? { entryId: row.link.entryId, placeKind: row.link.placeKind } : null,
    mergedPickOffer: row.mergedPickOffer ?? null,
  })
  const nullProjected = wizardModelsVm.modelsStepRows(nullFiles, h3StackVm.h3StackReport(nullFiles), servedCatalog()).map(projectRow)
  const capProjected = wizardModelsVm.modelsStepRows(capFiles, h3StackVm.h3StackReport(capFiles), servedCatalog()).map(projectRow)
  // The rendered identity LABEL: a present row reads name-suspected either
  // way — via the block under the cap, via the no-block fallback under null
  // (the two roads, one label — the N2 equivalence the e2e A/B also rides).
  eq(capProjected, nullProjected, 'N2: the Models step\'s rendered rows are identical (labels included)')

  eq(JSON.stringify(h3StackVm.turboTierStates(capFiles, 'text')), JSON.stringify(h3StackVm.turboTierStates(nullFiles, 'text')), 'N2: the tier states and remediations are byte-identical')
  eq(JSON.stringify(h3StackVm.turboTierStates(capFiles, 'reference')), JSON.stringify(h3StackVm.turboTierStates(nullFiles, 'reference')), 'N2: the reference lane\'s tier states too')

  const nullStrings = allRefusals(nullFiles)
  const capStrings = allRefusals(capFiles)
  const added = [...capStrings].filter((string) => !nullStrings.has(string))
  const removed = [...nullStrings].filter((string) => !capStrings.has(string))
  eq(added, [], 'N2: zero new refusal strings under the capped catalog')
  eq(removed, [], 'N2: zero disappeared refusal strings under the capped catalog')

  // The candidates agree too (the cap's hash pools are empty by definition —
  // arm 6 asserts this exhaustively; here the picks through resolveModels).
  eq(JSON.stringify(selection.inferSelections(capFiles, 'off')), JSON.stringify(selection.inferSelections(nullFiles, 'off')), 'N2: the tier-off selections are identical')
  eq(JSON.stringify(selection.inferSelections(capFiles, '8')), JSON.stringify(selection.inferSelections(nullFiles, '8')), 'N2: the tier-8 selections are identical')
})

// ---------------------------------------------------------------------------
// arm 6 — H-I3's cap: the designation dependency caps, never violates
// ---------------------------------------------------------------------------

test('H-I3 arm 6: the whole resolution surface under unconfigured roots equals the null world', () => {
  for (const slot of ALL_SLOTS) {
    for (const tier of ALL_TIERS) {
      eq(candidatesKey(capFiles, slot, tier), candidatesKey(nullFiles, slot, tier), `cap: ${slot}@${tier} candidates bit-identical to null`)
    }
  }

  // The foreign file's bit-identity driver, re-run against the cap arm.
  for (const slot of overrides.OVERRIDE_SLOTS) {
    eq(
      JSON.stringify(overrides.overridePickOutcome('monoka', slot, FOREIGN_NAME, capFiles)),
      JSON.stringify(overrides.overridePickOutcome('monoka', slot, FOREIGN_NAME, nullFiles)),
      `cap: the foreign file's ${slot} verdict equals null`,
    )
  }

  // The fetch views: equal to null (the arm-4 negative control, asserted as
  // full equality here so the cap cannot silently shrink the affordance).
  eq(linkViews(capFiles), linkViews(nullFiles), 'cap: the download-link surface survives the designation cap unchanged (both empty — presence retires links)')

  // And the refusal string surface: equal both directions (no flip at all).
  const nullStrings = allRefusals(nullFiles)
  const capStrings = allRefusals(capFiles)
  eq([...capStrings].filter((string) => !nullStrings.has(string)), [], 'cap: zero new refusals')
  eq([...nullStrings].filter((string) => !capStrings.has(string)), [], 'cap: zero disappeared refusals')
})

// ---------------------------------------------------------------------------
// task CT7 — the spec's headline acceptance criteria, asserted as sentences
// over the AC world (§7 quartet + soup; the fixtures flow through the same
// landed machinery, these legs pin the ACs' own words against it)
// ---------------------------------------------------------------------------

/** The identity block of a named file in an arm. */
const acBlock = (files, name) => {
  const file = files.find((candidate) => candidate.name === name)
  ok(file, `AC: ${name} is in the inventory`)
  return file.identity
}

test('AC-1: the quartet resolves by hash — named verdicts, both lanes live, the hybrid offered not loaded, no fetch suggestion for any present file', () => {
  // Each verdict is hash-confirmed and NAMES the identity: family + variant
  // + quant all carried (the human sentence's substance).
  const named = [
    [QS_AURORA, 'fl2va', 'pruned-int8-convrot', 'int8'],
    [QS_BOREALIS, 'ref2va', 'pruned-int8-convrot', 'int8'],
    [QS_CASCADE, 'viggle', 'drbaph-int8-convrot', 'int8'],
    [QS_DELTA, 'hybrid', 'smhfacct-b25-49', 'int8'],
  ]
  for (const [name, artifact, variant, quant] of named) {
    const block = acBlock(acPrimed, name)
    eq([block.verdict, block.family, block.artifact, block.variant, block.quant], ['hash-confirmed', 'minimax-h3', artifact, variant, quant], `AC-1: ${name} is hash-confirmed and NAMED`)
  }

  // The lanes resolve: the stack is ready at BOTH lanes over the primed
  // selection — no false "stack incomplete" about bytes it is serving.
  const primedSelection = selection.inferSelections(acPrimed, 'off')
  eq(primedSelection.fl2va, QS_AURORA, 'AC-1: the renamed FL2VA resolves the first-frame lane through the hash rung')
  eq(primedSelection.ref2va, QS_BOREALIS, 'AC-1: the renamed Ref2VA resolves the reference lane')
  ok(h3StackVm.h3StackReady({ selection: primedSelection, mode: 'text', turbo: 'off' }), 'AC-1: the text lane is ready (no false stack-incomplete)')
  ok(h3StackVm.h3StackReady({ selection: primedSelection, mode: 'reference', turbo: 'off' }), 'AC-1: the reference lane is ready too')
  eq(h3StackVm.stackVerdictText(h3StackVm.h3StackReport(acPrimed), 'text').text, 'Ready to render.', 'AC-1: the verdict line reads Ready')
  // The contrast that makes it a flip, not a tautology: under the null
  // catalog the SAME inventory is name-invisible — the verdict says
  // incomplete and NAMES FL2VA missing.
  const nullVerdict = h3StackVm.stackVerdictText(h3StackVm.h3StackReport(acNull), 'text')
  ok(!nullVerdict.ready && nullVerdict.text.indexOf('FL2VA') !== -1, 'AC-1 contrast: the null catalog cannot see the renamed quartet (the verdict names FL2VA missing)')

  // The hybrid is NAMED with the merged-pick affordance and is NOT the
  // resolved lane checkpoint — never silently loaded.
  const fl2vaRow = wizardModelsVm.modelsStepRows(acPrimed, h3StackVm.h3StackReport(acPrimed), servedCatalog())
    .find((row) => row.slot === 'fl2va')
  eq(JSON.stringify(fl2vaRow.mergedPickOffer), JSON.stringify({ name: QS_DELTA, summary: 'minimax-h3 · hybrid · smhfacct-b25-49 · int8' }), 'AC-1: the hybrid names itself on the fl2va row — family + artifact + variant + quant, one sentence')
  ok(fl2vaRow.selectedName === QS_AURORA && fl2vaRow.selectedName !== QS_DELTA, 'AC-1: the lane checkpoint stays the FL2VA master, never the hybrid')
  eq(wizardModelsVm.modelsStepRows(acNull, h3StackVm.h3StackReport(acNull), servedCatalog())
    .find((row) => row.slot === 'fl2va').mergedPickOffer, undefined, 'AC-1 contrast: no bytes, no offer (the null catalog cannot name the hybrid)')

  // No fetch suggestion for any present file: with every component present
  // and byte-confirmed the step offers NOTHING — the one mapped row
  // (turbo-8) is suppressed by hash-confirmed presence, and the null world
  // still offers it (removal rides byte evidence only).
  eq(linkViews(acPrimed), [], 'AC-1: zero download links — no "download X" about present files')
  eq(linkViews(acNull), [], 'AC-1 contrast: the null world lists a turbo-shaped file too — name-only presence retires the link the same way')
})

test('AC-2: the soup collapses — one named identity across identical shas, decoder classes from identity rows, the T=1-named liar named as the video VAE', () => {
  // Identical shas group under ONE named identity: every soup file — the
  // official, both byte-identical aliases, the q8 variant, and the liar —
  // carries the video VAE's named identity block, and the one row's
  // publisher basenames ride every byte-identical copy's block.
  const soup = [QS_VVAE, QS_ALIAS2, QS_ALIAS3, QS_VVAE_Q8, QS_T1_LIAR]
  for (const name of soup) {
    const block = acBlock(acPrimed, name)
    eq([block.verdict, block.family, block.artifact], ['hash-confirmed', 'minimax-h3', 'video-vae'], `AC-2: ${name} groups under the video-VAE identity`)
  }
  eq(acBlock(acPrimed, QS_VVAE).variant, 'fp16', 'AC-2: the fp16 cut is named')
  eq(acBlock(acPrimed, QS_VVAE_Q8).variant, 'q8', 'AC-2: the distinct-sha q8 keeps its own variant name')
  const rowAliases = acBlock(acPrimed, QS_ALIAS2).aliases || []
  for (const base of [QS_VVAE, QS_ALIAS2, QS_ALIAS3]) {
    ok(rowAliases.indexOf(base) !== -1, `AC-2: the byte-identical copies share ONE row — its aliases name ${base}`)
  }

  // The report/candidates present them as ONE artifact's candidates: the
  // video-VAE pool IS the soup (five files, one pick, the official wins the
  // H-M2 tie-break), and the wizard row narrates the duplicates.
  const set = selection.slotCandidates(acPrimed, 'videoVae', 'off')
  eq([set.basis, set.picked], ['hash', QS_VVAE], 'AC-2: the soup resolves on byte evidence with the official basename winning the tie-break')
  eq(set.names.slice().sort().join('|'), soup.slice().sort().join('|'), "AC-2: the candidates are exactly the soup — one artifact's candidate list, not five artifacts")
  const vvaeRow = wizardModelsVm.modelsStepRows(acPrimed, h3StackVm.h3StackReport(acPrimed), servedCatalog())
    .find((row) => row.slot === 'videoVae')
  eq(vvaeRow.narration, 'picked', 'AC-2: the row narrates the duplicate candidates (picked among several)')
  eq(vvaeRow.candidates.others.length, 4, "AC-2: all four other soup files render as this row's other candidates")

  // Decoder-class verdicts come from identity rows: the T=1-NAMED file
  // hashing to the video VAE labels as a VIDEO decoder — the name's lie
  // corrected by bytes (the same name with no byte evidence keeps the lie).
  eq(overrides.modelClassHint('vae', QS_T1_LIAR, acBlock(acPrimed, QS_T1_LIAR)), 'video decoder', 'AC-2: the liar labels as a video decoder from its bytes')
  eq(overrides.modelClassHint('vae', QS_T1_LIAR, undefined), 'T=1 image decoder', 'AC-2 contrast: the NAME alone still says T=1 (the fallback keeps its documented limits)')
  eq(overrides.modelClassHint('vae', QS_VVAE, acBlock(acPrimed, QS_VVAE)), 'video decoder', 'AC-2: the official labels from its bytes too')

  // The name's lie is corrected END TO END: the videoVae override accepts
  // the liar under primed (the guard reads the artifact) and refuses it
  // under null (the T=1 name marker — today's behavior, unchanged).
  eq(overrides.overridePickOutcome('monoka', 'videoVae', QS_T1_LIAR, acPrimed).state, 'applied', 'AC-2: the liar picks the video-VAE slot clean — the bytes are the class')
  eq(overrides.overridePickOutcome('monoka', 'videoVae', QS_T1_LIAR, acNull).state, 'refused', 'AC-2 contrast: name-only evidence still refuses the T=1 name at the video slot')
})

test('AC-4: remote honesty — unconfigured roots cap every verdict at name-suspected and nothing anywhere claims hash-confirmed', () => {
  // The cap's vocabulary over the AC world: name-suspected exactly for the
  // aliased basenames, unknown for everything else (the renamed quartet and
  // the liar — its basename is in no alias bucket), verifying nowhere.
  const nameSuspected = acCap.filter((file) => file.identity.verdict === 'name-suspected').map((file) => file.name).sort()
  eq(nameSuspected, [QS_AVAE, QS_TE, QS_TAEH3, TURBO8_OFFICIAL, QS_ALIAS2, QS_ALIAS3, QS_VVAE, QS_VVAE_Q8].sort(), 'AC-4: exactly the aliased basenames read name-suspected — the renamed quartet and the liar read unknown')
  ok(acCap.every((file) => file.identity.verifying === undefined), 'AC-4: verifying is nowhere — no digest even enqueues without readable bytes')

  // Nothing anywhere claims hash-confirmed: the whole payload, the stack
  // report, the wizard rows, and the tier states carry no such string.
  for (const [label, serialized] of [
    ['the payload blocks', JSON.stringify(acCap)],
    ['the stack report', JSON.stringify(h3StackVm.h3StackReport(acCap))],
    ['the wizard rows', JSON.stringify(wizardModelsVm.modelsStepRows(acCap, h3StackVm.h3StackReport(acCap), servedCatalog()))],
    ['the tier states', JSON.stringify(h3StackVm.turboTierStates(acCap, 'text'))],
  ]) {
    eq(serialized.indexOf('hash-confirmed'), -1, `AC-4: ${label} never claims hash-confirmed`)
  }

  // The route arm: the identify trigger itself, asked over UNCONFIGURED
  // roots, answers the same honest vocabulary — no block claims bytes it
  // never read and no marker promises a digest that cannot start.
  const routeEngine = createModelIdentityEngine({
    catalog: loadHashCatalog({ MONOKA_HASH_CATALOG: acWorld.catalogPath }),
    hashCachePath: path.join(acScratch, 'cache', 'hash-cache-route.json'),
  })
  const answer = routeEngine.requestIdentification(acWorld.files.map(({ name, kind }) => ({ kind, name })), settingsFor({}))
  ok(answer.results.every((result) => result.identity.verdict === 'name-suspected' || result.identity.verdict === 'unknown'), 'AC-4 route: every answer is name-suspected or unknown')
  ok(answer.results.every((result) => result.identity.verifying === undefined), 'AC-4 route: no verifying marker without readable bytes')
  eq(JSON.stringify(answer).indexOf('hash-confirmed'), -1, 'AC-4 route: the answer payload never claims hash-confirmed')
})

test('N2 rider (CT6 review Important-2): an orphaned catalog row obligates nothing anywhere, under either catalog', () => {
  // The corner CT6's string-diff could not see: a catalog row with NO file
  // in the inventory (the row is orphaned — the file-uncataloged direction
  // was CT6's; this is the reverse). No surface may nag a fetch for it: not
  // the wizard rows, not the stack verdict text, not the remediation
  // strings — under the null catalog (no rows at all) or the primed one
  // (the orphan rows present).
  const orphanAliases = acWorld.orphans.flatMap((orphan) => orphan.aliases)
  eq(orphanAliases.length, 2, 'rider: the fixture carries the two orphan rows (turbo-4 + viggle-bf16)')
  const stackReportOf = (files) => h3StackVm.h3StackReport(files)
  const surfaced = (files) => {
    const strings = allRefusals(files)
    strings.add(h3StackVm.stackVerdictText(stackReportOf(files), 'text').text)
    strings.add(h3StackVm.stackVerdictText(stackReportOf(files), 'reference').text)
    for (const tier of ['4', '8']) strings.add(h3StackVm.turboTierStates(files, 'text')[tier].remediation)
    strings.add(JSON.stringify(wizardModelsVm.modelsStepRows(files, stackReportOf(files), servedCatalog())))
    strings.add(JSON.stringify(linkViews(files)))
    return strings
  }
  for (const [label, files] of [['null', acNull], ['primed', acPrimed], ['cap', acCap]]) {
    const strings = surfaced(files)
    for (const alias of orphanAliases) {
      const hit = [...strings].filter((string) => string.indexOf(alias) !== -1)
      eq(hit, [], `rider: no ${label}-catalog surface names the orphaned row's alias ${alias}`)
    }
  }

  // The sharp case pinned: tier 4's remediation is byte-identical between
  // the arms — the orphaned turbo-4 row adds nothing to (and removes
  // nothing from) the one truthful remediation the null world already
  // voiced, and that remediation names the FETCH catalog's consent-gated
  // row, never the hash row's alias.
  eq(h3StackVm.turboTierStates(acPrimed, 'text')['4'].remediation, h3StackVm.turboTierStates(acNull, 'text')['4'].remediation, 'rider: the tier-4 remediation is unchanged by the orphaned turbo-4 row')
  ok(h3StackVm.turboTierStates(acNull, 'text')['4'].remediation.indexOf('fetch lightx2v-fl2v-turbo-4 through the library (consent-gated)') !== -1, "rider: the remediation names the fetch row it always named (the orphan's alias never joins it)")

  // And the download links: the orphan never adds one under any arm — all
  // three worlds DETECT a turbo-shaped file, and presence retires the link
  // (friction 2026-10-21); the orphan's alias joins nothing.
  eq(linkViews(acPrimed), [], 'rider: primed offers no download link (everything is detected)')
  eq(linkViews(acNull), [], 'rider: null offers no link either — its turbo-shaped listing retires the mapped row (the orphan adds nothing)')
  eq(linkViews(acCap), [], 'rider: the cap arm equals null (the orphan adds nothing there either)')

  // The whole refusal surface stays flip-only-via-hash for the AC world
  // too: zero ADDED strings primed-over-null (the removed set is the
  // sanctioned direction — the renamed-quartet membership refusals and the
  // liar's class refusal, both hash-justified).
  const acNullStrings = allRefusals(acNull)
  const acPrimedStrings = allRefusals(acPrimed)
  eq([...acPrimedStrings].filter((string) => !acNullStrings.has(string)), [], 'rider: zero new refusal strings primed-over-null over the AC world')
})

// ---------------------------------------------------------------------------
// task CT8 — the AC-6 guard section: the spec's grep-able invariants as
// executable tests (one derivation, no second sha table, no raw rows on the
// wire). Static scans + import-graph assertions, each with a CANARY arm
// (anti-vacuity: a scanner that cannot catch a PLANTED violation proves
// nothing about the tree — the same discipline as the arms above).
// ---------------------------------------------------------------------------

/** The CT8 scan helpers: source-tree walks with repo-relative reporting so a
 *  failure names its file. Scope is deliberately the SOURCE trees (src/,
 *  server/) — never dist/ or node_modules (build output mirrors whatever it
 *  was built from; the invariant is about what is authored). */
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs'])

function listSourceFiles(dir) {
  const fs = require('node:fs')
  const found = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) found.push(full)
    }
  }
  walk(dir)
  return found
}

const rel = (file) => path.relative(REPO, file)

/** Every 64-hex substring (a sha256 literal in code or comment — either is a
 *  second truth table's seed). */
function scanHexLiterals(files) {
  const fs = require('node:fs')
  const hits = []
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      const match = line.match(/[0-9a-fA-F]{64}/)
      if (match) hits.push({ file: rel(file), line: index + 1, text: line.trim().slice(0, 100) })
    })
  }
  return hits
}

/** Every quoted specifier naming server/hashCatalog (the client-ban: any
 *  form — relative, aliased, dynamic, multiline-split, re-export). No
 *  keyword gate: the specifier string is the contract, not the statement
 *  shape it arrives in.) */
function scanCatalogImports(files) {
  const fs = require('node:fs')
  const hits = []
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      const specifiers = [...line.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1])
      if (specifiers.some((specifier) => specifier.includes('server/hashCatalog'))) {
        hits.push({ file: rel(file), line: index + 1, text: line.trim().slice(0, 100) })
      }
    })
  }
  return hits
}

/** AC-6's wire clause, as a walk (T4's guard, re-asserted here as the clause
 *  of record): no payload ever carries the raw catalog rows' keys. Returns
 *  the offending trails (empty = clean). */
function wireKeyTrails(value) {
  const forbidden = ['sha256', 'source', 'repo', 'revision']
  const hits = []
  const visit = (node, trail) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${trail}[${index}]`))
      return
    }
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        if (forbidden.includes(key)) hits.push(`${trail}.${key}`)
        else visit(node[key], `${trail}.${key}`)
      }
    }
  }
  visit(value, '$')
  return hits
}

/** The files whose import/require graph names the LOCAL module (relative
 *  specifiers only — the within-server graph). */
function importersOf(files, moduleName) {
  const fs = require('node:fs')
  const importers = []
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    const specifiers = [...text.matchAll(/['"](\.[^'"]+)['"]/g)].map((match) => match[1])
    if (specifiers.some((specifier) => specifier === `./${moduleName}` || specifier === `../${moduleName}` || specifier.endsWith(`/${moduleName}`))) {
      importers.push(rel(file))
    }
  }
  return importers.sort()
}

/** The files containing a literal substring (repo-relative, sorted). */
function filesContaining(files, literal) {
  const fs = require('node:fs')
  return files.filter((file) => fs.readFileSync(file, 'utf8').includes(literal)).map(rel).sort()
}

test('AC-6 guard: no surface re-encodes a sha→name table — the client carries no shas and never imports the catalog', () => {
  // The canary first: a planted 64-hex literal and a planted catalog import
  // in a scratch source file MUST both be caught.
  const canaryDir = makeScratchDir(path.join(require('node:os').tmpdir(), 'monoka-nongating-canary-'))
  require('node:fs').writeFileSync(path.join(canaryDir, 'canary.ts'), [
    "import { loadHashCatalog } from '../../server/hashCatalog'",
    'import {',
    '  bySha,',
    '  byAlias,',
    "  knownSizes,",
    "} from '../../server/hashCatalog'",
    "export { bySha } from '../../server/hashCatalog'",
    "export const PINNED = 'a629cfea8d89a071b140c6e1935dc9a23e72de6badc18975a2bb9e6d1423d76d'",
    '',
  ].join('\n'))
  const canaryFiles = listSourceFiles(canaryDir)
  eq(scanHexLiterals(canaryFiles).length, 1, 'canary: the scanner catches a planted 64-hex literal')
  eq(scanCatalogImports(canaryFiles).length, 3, 'canary: the scanner catches single-line, prettier-split multiline, and re-export imports of server/hashCatalog')

  // The real assertion over the client tree: a hardcoded sha anywhere in
  // src/ is a second truth table's seed (h3Stack's dead parallel table, the
  // module-head doctrine's own evidence), and an import of the catalog would
  // route raw rows past the one seam.
  const clientFiles = listSourceFiles(path.join(REPO, 'src'))
  ok(clientFiles.length > 100, 'sanity: the client scan actually walked src/ (the guard is not scanning an empty tree)')
  eq(scanHexLiterals(clientFiles), [], 'AC-6: src/ carries zero 64-hex literals — the client holds no shas at all (no second sha→name table\'s seed)')
  eq(scanCatalogImports(clientFiles), [], 'AC-6: src/ never imports server/hashCatalog — the client-ban on the module-head doctrine, executable')
})

test('AC-6 guard: the only client transport is ModelFile.identity — no raw-row keys ride any payload, and every server identity decision flows through server/modelIdentity.ts', async () => {
  // The wire clause of record (T4's guard re-asserted here as AC-6's): deep-
  // walk every identity-bearing payload this suite can build for the raw row
  // keys. The walker's canary: a planted source.repo MUST be caught.
  eq(wireKeyTrails({ identity: { verdict: 'hash-confirmed', source: { repo: 'x/y' } } }), ['$.identity.source'], 'canary: the walker catches a planted raw-row key')

  const engine = createModelIdentityEngine({
    catalog: loadHashCatalog({ MONOKA_HASH_CATALOG: acWorld.catalogPath }),
    hashCachePath: path.join(acScratch, 'cache', 'hash-cache-guard.json'),
  })
  const settings = settingsFor(acWorld.roots)
  const routeAnswer = engine.requestIdentification(acWorld.files.map(({ name, kind }) => ({ kind, name })), settings)
  await engine.drain()
  const bootstrapPayload = await engine.attachIdentities(acWorld.files, settings)
  for (const [label, payload] of [
    ['the nongating primed payloads', primedFiles],
    ['the nongating cap payloads', capFiles],
    ['the AC primed payloads', acPrimed],
    ['the AC cap payloads', acCap],
    ['the identify route answer (designated roots)', routeAnswer.results],
    ['the bootstrap payload (post-settle)', bootstrapPayload],
  ]) {
    eq(wireKeyTrails(payload), [], `AC-6 wire: ${label} carries no sha256/source/repo/revision key`)
    ok(!/[0-9a-f]{64}/.test(JSON.stringify(payload)), `AC-6 wire: ${label} carries no sha VALUE anywhere either (aliases are basenames, verdicts are words)`)
  }

  // The one-derivation import graph, enumerated: the catalog's server
  // importers are exactly the seam plus the fetcher's B3 install-record
  // stamp; the seam's consumers are exactly core's routes and the animation
  // delegation; the verdict vocabulary is CONSTRUCTED in one module alone.
  const serverFiles = listSourceFiles(path.join(REPO, 'server'))
  ok(serverFiles.length > 20, 'sanity: the server scan actually walked server/')
  eq(importersOf(serverFiles, 'hashCatalog'), ['server/fetcher.ts', 'server/modelIdentity.ts'], 'AC-6 seam: the catalog is opened by exactly the identity seam + the fetcher\'s install-record stamp (B3) — nothing else')
  eq(importersOf(serverFiles, 'modelIdentity'), ['server/animation/models.ts', 'server/core.ts'], 'AC-6 seam: every server consumer of the identity seam is enumerated (core\'s routes + the animation delegation) — every identity decision flows through server/modelIdentity.ts')
  eq(filesContaining(serverFiles, "'hash-confirmed'"), ['server/modelIdentity.ts'], 'AC-6 one derivation: the verdict vocabulary is constructed in exactly one server module')
})
