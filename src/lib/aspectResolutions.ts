/**
 * AR-first resolution picking (maintainer ruling 2026-09-26, directive
 * 1e363ec0 item 4): "the list should be tied to an aspect ratio — each
 * aspect ratio has a list of supported or optimal resolutions."
 *
 * The lists are DERIVED from the model's grid constraints, not hand-typed.
 * Source of truth: the inference research library's capture of the stock
 * nodes (docs/library/comfyui-minimax-h3-overview.md; the engine contract
 * fixture carries the same widget schemas):
 *   - width/height ride the 32-px grid (INT widgets, step 32, min 32);
 *   - the native canvas is a 768px short edge — 1344x768 at ~16:9;
 *   - the pixel-area cap is 768x1344 = 1,032,192 px (the resolution
 *     selector's 1.0 MP step, 1376x768, sits ABOVE it and degrades).
 *
 * Derivation (pure, unit-asserted): for a ratio, the long edge is the
 * 32-grid snap of short x ratio; a rung survives only when its area stays
 * at/below the cap. The OPTIMAL pick is the native 768 short edge honoring
 * the area cap — for ultra-wide ratios the cap pulls the short edge down
 * (21:9 → 1504x640), which is the honest pick, not a silent 1792x768 that
 * the model never trained for. 'free' keeps arbitrary on-grid WxH.
 *
 * ─── THE IMAGE TIERS (maintainer directive 2026-09-26, the full H3 image
 * stack): the image lanes get a CATEGORIZED list — video-locked (exact
 * AR+resolution pairs matching supported video gens), image-focus (a ladder
 * up to the community/author-tested ceiling), starter-frame (the handoff
 * picks + prep rules), custom (free WxH, unchanged). Evidence trail (full
 * version + the settings-exposure matrix in the dated 2026-09-26 addendum
 * of docs/research/fizgig-h3-still-assessment.md):
 *   - The H3 1F image path quality-holds FAR above the video envelope.
 *     The Fizgig README (read at 10d5171, 2026-09-26) demonstrates an 8 MP
 *     still (3872x2176, no Turbo @0, 50 steps, er_sde — their
 *     8MP-NoTurboVersion example workflow) and states results are "best
 *     from 3 MP up; small images come out noticeably weaker" [COMM —
 *     author-demonstrated, one published sample; NOT our-measured — the
 *     GPU verification arm stays queued with E-FS0/E-FS1].
 *   - Counter-evidence for the OTHER 1F decode leg (the Image Studio
 *     pack's own README): "Four-megapixel generation and editing were also
 *     tested, but cost more and do not guarantee better composition or
 *     detail"; "A 2 MP canvas increases memory and runtime and is not a
 *     general quality upgrade." So the image-focus OPTIMAL is
 *     machinery-aware: the Image Studio/Mamad8 leg optimal stays the
 *     native ~1 MP envelope; the Fizgig/video-VAE-group-decode leg optimal
 *     is the author's shipped 2.5 MP default with the >=3 MP note.
 *   - Per-dimension schema bound: FizgigH3StillLatent caps width/height at
 *     4096 (served schema, the engine-contract fixture) — every image-focus
 *     rung stays <= 4096 per dim so ONE list serves every lane honestly
 *     (21:9 tops out at its 6 MP rung, 3744x1600 — the 8 MP target's long
 *     edge exceeds 4096). Custom override remains free beyond; the
 *     contract layer refuses per-lane there.
 */

/** The stock node's width/height widget grid (step 32, min 32). */
export const H3_GRID = 32
/** The native canvas's short edge (the trained envelope). */
export const H3_SHORT_EDGE_NATIVE = 768
/** The native pixel-area cap: 768x1344. Above it the model degrades. */
export const H3_NATIVE_AREA_CAP = H3_SHORT_EDGE_NATIVE * 1344

export type AspectRatioId = '16:9' | '9:16' | '4:3' | '3:4' | '1:1' | '21:9' | 'free'

export type AspectRatio = { id: AspectRatioId; label: string; w: number; h: number }

/** The common ratios the picker offers, in rail order. */
export const ASPECT_RATIOS: AspectRatio[] = [
  { id: '16:9', label: '16:9', w: 16, h: 9 },
  { id: '9:16', label: '9:16', w: 9, h: 16 },
  { id: '4:3', label: '4:3', w: 4, h: 3 },
  { id: '3:4', label: '3:4', w: 3, h: 4 },
  { id: '1:1', label: '1:1', w: 1, h: 1 },
  { id: '21:9', label: '21:9', w: 21, h: 9 },
]

const snapRound = (value: number) => Math.round(value / H3_GRID) * H3_GRID
const snapFloor = (value: number) => Math.floor(value / H3_GRID) * H3_GRID

function resolutionAtShortEdge(ratio: AspectRatio, shortEdge: number): string | null {
  const target = Math.max(ratio.w, ratio.h) / Math.min(ratio.w, ratio.h)
  const landscape = ratio.w >= ratio.h
  // Round-to-nearest first; when that overshoots the area cap, floor —
  // 16:9 at the native short edge lands 1365→1376 (over cap)→1344, the
  // official pick, exactly.
  let long = snapRound(shortEdge * target)
  if (long * shortEdge > H3_NATIVE_AREA_CAP) long = snapFloor(shortEdge * target)
  if (long < H3_GRID || long * shortEdge > H3_NATIVE_AREA_CAP) return null
  return landscape ? `${long}x${shortEdge}` : `${shortEdge}x${long}`
}

/** The OPTIMAL resolution for a ratio: the native 768 short edge honoring
 *  the area cap. Ultra-wide ratios step the short edge down by grid rungs
 *  until the cap holds (21:9 → 640 → 1504x640) — never a silent over-cap
 *  value. Returns null for 'free' (no ratio to optimize). */
export function optimalResolutionFor(ratioId: AspectRatioId): string | null {
  if (ratioId === 'free') return null
  const ratio = ASPECT_RATIOS.find((entry) => entry.id === ratioId)!
  for (let shortEdge = H3_SHORT_EDGE_NATIVE; shortEdge >= H3_GRID; shortEdge -= H3_GRID) {
    const candidate = resolutionAtShortEdge(ratio, shortEdge)
    if (candidate) return candidate
  }
  return null
}

export type ResolutionOption = { value: string; optimal: boolean }

/** The supported list for a ratio: the short-edge ladder (largest area
 *  first), every rung on the 32-grid and at/below the area cap, the
 *  OPTIMAL pick flagged. Empty for 'free'. */
export function resolutionsForRatio(ratioId: AspectRatioId): ResolutionOption[] {
  if (ratioId === 'free') return []
  const ratio = ASPECT_RATIOS.find((entry) => entry.id === ratioId)!
  const optimal = optimalResolutionFor(ratioId)
  const list: ResolutionOption[] = []
  for (let shortEdge = H3_SHORT_EDGE_NATIVE; shortEdge >= 448; shortEdge -= H3_GRID) {
    const candidate = resolutionAtShortEdge(ratio, shortEdge)
    if (candidate) list.push({ value: candidate, optimal: candidate === optimal })
  }
  return list
}

/** Every supported value across the ratios, deduped, ascending by area —
 *  the flat fallback surfaces (Settings defaults, the workbench) source
 *  their options here so no hand-typed list can drift from the derivation.
 *  VIDEO-envelope only (the cap-honoring derivation above): the image
 *  lanes' tiered ladder lives below. */
export function allSupportedResolutions(): string[] {
  const seen = new Set<string>()
  for (const ratio of ASPECT_RATIOS) for (const option of resolutionsForRatio(ratio.id)) seen.add(option.value)
  return [...seen].sort((a, b) => {
    const [aw, ah] = a.split('x').map(Number)
    const [bw, bh] = b.split('x').map(Number)
    return aw * ah - bw * bh
  })
}

/** Parses a WxH resolution string; null when malformed. */
export function parseResolution(value: string): { width: number; height: number } | null {
  const match = /^(\d+)x(\d+)$/.exec(value.trim())
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  return width > 0 && height > 0 ? { width, height } : null
}

/** Snaps one free-mode dimension onto the grid (the free inputs' commit). */
export function snapResolutionDim(value: number): number {
  if (!Number.isFinite(value)) return H3_GRID
  return Math.min(16384, Math.max(H3_GRID, Math.round(value / H3_GRID) * H3_GRID))
}

/** A renderable resolution for the stock nodes: WxH, both dims on the 32
 *  grid, within the widgets' min/max (32..16384). The area cap is NOT
 *  enforced here — an over-cap pick is the user's explicit free choice
 *  (the picker warns; the sanitizer must not silently rewrite a stored
 *  chain). */
export function isRenderableResolution(value: string): boolean {
  const parsed = parseResolution(value)
  if (!parsed) return false
  return [parsed.width, parsed.height].every((dim) => dim >= H3_GRID && dim <= 16384 && dim % H3_GRID === 0)
}

/** Which ratio's supported list contains this resolution ('free' when none
 *  does — custom or legacy values like the turbo fast presets). */
export function ratioKeyOf(value: string): AspectRatioId {
  for (const ratio of ASPECT_RATIOS) {
    if (resolutionsForRatio(ratio.id).some((option) => option.value === value)) return ratio.id
  }
  return 'free'
}

// ---------------------------------------------------------------------------
// The image tiers (maintainer directive 2026-09-26 — the full H3 image
// stack). The video derivation above is UNTOUCHED and remains the
// video-locked tier; everything below derives the image lanes' categories.
// The evidence trail and the settings-exposure matrix live in the dated
// 2026-09-26 addendum of docs/research/fizgig-h3-still-assessment.md.
// ---------------------------------------------------------------------------

/** The 1F image path's author-demonstrated ceiling (8 MP — the Fizgig
 *  8MP-NoTurbo example; the maintainer's 2026-09-26 correction of the 5 MP
 *  community figure). COMMUNITY/AUTHOR-TESTED, not our-measured. */
export const H3_IMAGE_CEILING_MP = 8

/** Every image-focus rung's per-dimension bound: the FizgigH3StillLatent
 *  served schema caps width/height at 4096 (the stock conditioning nodes
 *  accept 16384 — custom override territory). Keeping every offered rung
 *  within the STRICTER bound means one list serves both 1F machineries. */
export const H3_IMAGE_DIM_MAX = 4096

/** The image-focus megapixel ladder ABOVE the native envelope (targets,
 *  snapped to the 32-grid per ratio): the author's 2.5 MP shipped default,
 *  their "best from 3 MP up" band, and the 4/6/8 MP upper rungs (8 MP =
 *  the author's no-Turbo demonstration point). The native ~1 MP envelope
 *  itself seeds the ladder as rung zero (optimalResolutionFor — the video
 *  derivation), not an MP target: a 1.0 MP target snaps to 1312x736 where
 *  the trained envelope IS 1344x768. */
export const H3_IMAGE_LADDER_MP: readonly number[] = [1.5, 2, 2.5, 3, 4, 6, 8]

/** The image-focus optimal per 1F machinery — the decode-leg-aware pick
 *  (the two pack authors' documented positions DIVERGE exactly along the
 *  decode leg; see the module header's evidence trail). */
export type ImageMachinery = 'image-studio' | 'fizgig'

/** Image-focus optimal: the Image Studio leg stays at the NATIVE envelope
 *  (astropuzzo: a 2 MP canvas "is not a general quality upgrade"); the
 *  Fizgig leg rides the author's shipped 2.5 MP default (their edit lane's
 *  documented best size; their t2i example renders 2.5 MP, with "best from
 *  3 MP up" as the ceiling-side note). */
export const IMAGE_FOCUS_OPTIMAL_MP: Record<ImageMachinery, number> = {
  'image-studio': 1,
  fizgig: 2.5,
}

export type ResolutionTierId = 'starter-frame' | 'image-focus' | 'video-locked'

export type ResolutionTier = {
  id: ResolutionTierId
  label: string
  /** The one-line story the grouped UI shows with the group. */
  hint: string
}

/** The tier metadata (the grouped picker's groups; the custom override is
 *  the free inputs beside these, not a group). */
export const RESOLUTION_TIERS: readonly ResolutionTier[] = [
  {
    id: 'starter-frame',
    label: 'Starter frame',
    hint: 'The exact video-gen resolution for this ratio — generate here and the start-frame exit hands off with no resample. Prep rules: stay on the 32-px grid, match the target chain\'s resolution exactly, keep the subject clear of the frame edge (video motion pulls inward), and let the exit pin the frame as the FL2VA first-frame anchor.',
  },
  {
    id: 'image-focus',
    label: 'Image focus',
    hint: 'The stills ladder up to the author-demonstrated 8 MP ceiling (community-tested, not our-measured). The optimal marker follows the T=1 machinery: Image Studio decode keeps the native ~1 MP envelope; Fizgig decode prefers 2.5 MP and up.',
  },
  {
    id: 'video-locked',
    label: 'Video-locked',
    hint: 'Every resolution video generation supports at this ratio — for images that must match a video gen exactly when the native pick is not the right size.',
  },
]

function resolutionAtMegapixels(ratio: AspectRatio, megapixels: number): string | null {
  const target = Math.max(ratio.w, ratio.h) / Math.min(ratio.w, ratio.h)
  const landscape = ratio.w >= ratio.h
  // long = short x target and long x short = MP ⇒ short = sqrt(MP/target).
  // Snap BOTH dims to the grid; a rung survives when the snapped area stays
  // within +6% of the target (snapping two dims can inflate area by a few
  // percent — the MP targets are themselves approximate: the author's
  // "2.5 MP" example workflow is 2144x1216 = 2.6 MP), both dims stay
  // inside the 4096 schema bound, and nothing degenerates below the floor.
  const shortExact = Math.sqrt((megapixels * 1_000_000) / target)
  const shortEdge = snapRound(shortExact)
  const long = snapRound(shortEdge * target)
  if (long > H3_IMAGE_DIM_MAX || shortEdge > H3_IMAGE_DIM_MAX) return null
  if (shortEdge < H3_GRID || long < H3_GRID) return null
  if (long * shortEdge > megapixels * 1_000_000 * 1.06) return null
  return landscape ? `${long}x${shortEdge}` : `${shortEdge}x${long}`
}

function areaOf(value: string): number {
  const parsed = parseResolution(value)
  return parsed ? parsed.width * parsed.height : 0
}

/** The ladder's rung nearest the machinery's optimal target (the ladder
 *  itself only carries the shipped MP targets). */
function ladderRungNear(target: number): number {
  return H3_IMAGE_LADDER_MP.reduce((best, mp) => (Math.abs(mp - target) < Math.abs(best - target) ? mp : best), H3_IMAGE_LADDER_MP[0])
}

/** The image-focus ladder for a ratio: the NATIVE envelope as rung zero
 *  (the video derivation's optimal — the trained ~1 MP canvas), then every
 *  MP rung that lands on the 32-grid within the 8 MP ceiling and the 4096
 *  per-dim schema bound. The OPTIMAL pick is flagged for the given 1F
 *  machinery (default: the Image Studio leg — the app default machinery):
 *  image-studio marks rung zero, fizgig marks the 2.5 MP rung. Ascending
 *  by area. Empty for 'free'. */
export function imageFocusResolutionsFor(ratioId: AspectRatioId, machinery: ImageMachinery = 'image-studio'): ResolutionOption[] {
  if (ratioId === 'free') return []
  const ratio = ASPECT_RATIOS.find((entry) => entry.id === ratioId)!
  const optimalMp = ladderRungNear(IMAGE_FOCUS_OPTIMAL_MP[machinery])
  const list: ResolutionOption[] = []
  const native = optimalResolutionFor(ratioId)
  if (native) list.push({ value: native, optimal: machinery === 'image-studio' })
  for (const megapixels of H3_IMAGE_LADDER_MP) {
    const candidate = resolutionAtMegapixels(ratio, megapixels)
    if (candidate && !list.some((option) => option.value === candidate)) {
      list.push({ value: candidate, optimal: machinery === 'fizgig' && megapixels === optimalMp })
    }
  }
  // Exactly one optimal, always: when the fizgig 2.5 MP rung's snap
  // collided with a neighbor and vanished (cannot happen for the shipped
  // ratios — the suite asserts one marker per machinery), the nearest
  // surviving rung takes the marker.
  if (list.length && !list.some((option) => option.optimal)) {
    const nearest = list.reduce((best, option) => (
      Math.abs(areaOf(option.value) - optimalMp * 1_000_000) < Math.abs(areaOf(best.value) - optimalMp * 1_000_000) ? option : best
    ), list[0])
    nearest.optimal = true
  }
  return list
}

/** The starter-frame pick for a ratio: the native video-gen resolution —
 *  what a video chain with this ratio renders at, so the exit's first-frame
 *  anchor needs no resample. Null for 'free'. */
export function starterFrameResolutionFor(ratioId: AspectRatioId): ResolutionOption | null {
  const optimal = optimalResolutionFor(ratioId)
  return optimal ? { value: optimal, optimal: true } : null
}

/** The video-locked tier: the cap-honoring supported list (the unchanged
 *  derivation — exactly what video generation accepts at this ratio). */
export function videoLockedResolutionsFor(ratioId: AspectRatioId): ResolutionOption[] {
  return resolutionsForRatio(ratioId)
}

/** The tiered groups for the image-lane pickers, in display order:
 *  starter-frame first (the maintainer's "starter-frame tier prominent
 *  when the output feeds video" — the workbench's signature exit is the
 *  start-frame handoff, so the handoff pick leads and its group states
 *  the prep rules), then the image-focus ladder (machinery-aware
 *  optimal), then the full video-locked list. Rungs already offered by an
 *  earlier group are omitted from later ones so no value appears twice
 *  (the starter-frame pick IS the image-focus native rung — the ladder
 *  simply starts one rung higher). The custom override is the UI's free
 *  inputs beside these groups, not a group here. */
export function tieredResolutionGroups(
  ratioId: AspectRatioId,
  options: { machinery?: ImageMachinery } = {},
): Array<{ tier: ResolutionTier; options: ResolutionOption[] }> {
  const machinery = options.machinery ?? 'image-studio'
  const starter = starterFrameResolutionFor(ratioId)
  const groups: Array<{ tier: ResolutionTier; options: ResolutionOption[] }> = []
  const seen = new Set<string>()
  const push = (tier: ResolutionTier, list: ResolutionOption[]) => {
    const fresh = list.filter((option) => !seen.has(option.value))
    for (const option of fresh) seen.add(option.value)
    if (fresh.length) groups.push({ tier, options: fresh })
  }
  const order: ResolutionTierId[] = ['starter-frame', 'image-focus', 'video-locked']
  for (const id of order) {
    const tier = RESOLUTION_TIERS.find((entry) => entry.id === id)!
    if (id === 'starter-frame') {
      if (starter) push(tier, [starter])
    } else if (id === 'image-focus') {
      push(tier, imageFocusResolutionsFor(ratioId, machinery))
    } else {
      push(tier, videoLockedResolutionsFor(ratioId))
    }
  }
  return groups
}
