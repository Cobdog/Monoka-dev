/** The canvas image intent as engine ops (task 34afx79, 2026-09-19) — the
 * pure seam between chain settings and the image engines. Z-Image is
 * RETIRED here (lib/zImageSubmit.ts deleted): the stills intent renders
 * through the H3 image workbench's own machinery — the h3image Generate-T=1
 * family (one latent frame, the Mamad8 T=1 VAE, the pinned Fast recipe)
 * submitted through the SHARED workbench core (src/images/submit.ts), so a
 * canvas still lands takes exactly like any chain (the packet-aware landing
 * branch). Nothing here touches a store or the DOM's render tree — every
 * fact arrives as data, which is what makes the seam VM-harness testable.
 *
 * Two dated decisions live in this file:
 *
 *  1. THE TWO-SLOT ENGINE SEAM — the intent's engine is chain state
 *     (`imageEngine`): 'h3-1f' wired today; 'krea2' is the typed hole for
 *     the Krea 2 stills engine (mf3wfq6, queued) — it docks into
 *     submitChain's switch without another rewire. Until it lands the hole
 *     refuses HONESTLY (never silently falls back).
 *  2. THE EDIT HANDOFF (2026-09-19 → retired in the gfv5h0g fix round,
 *     2026-10-15) — image-with-reference work is the workbench Edit
 *     surface's job, not a canvas graph. The old handoff (stash the bound
 *     image + intent, then full-navigate to ?images=1 FROM GENERATE) died
 *     in the blind-review fix: generate never switches surfaces, and the
 *     navigation's session bootstrap minted empty h3img objects as a side
 *     effect. The lane is reached by opening the workbench and anchoring
 *     the source from its canvas picker — an explicit act, never a
 *     generate side effect.
 */
import { engineFamilyForChain } from '../lib/graph/engineFamilies'
import type { CanvasChainSettings } from './generation'
import type { WorkbenchGenerationRequest } from '../images/submit'

/** The h3image family the H3-1F engine renders (the Generate-T=1 Fast
 * profile — H3IMG_RECIPE_PINS.t1 is the pinned recipe). */
export const H3_ONE_FRAME_FAMILY = 'h3img.generate.t1'

/** The honest refusal for a queued engine slot (the typed hole's other half
 *  — the switch case exists, the engine does not yet). Registry-driven
 *  (A-3): the refusal copy lives on the engine-family ENTRY, so docking the
 *  engine is one entry edit, not a stillIntent change. */
export function queuedImageEngineRefusal(engine: 'h3-1f' | 'krea2'): string | null {
  return engineFamilyForChain({ mediaType: 'image', imageEngine: engine })?.queuedRefusal ?? null
}

/** The canvas chain settings as one H3-1F workbench generation — the same
 * request shape the workbench surface builds, so validation, the graph, the
 * manifest, and the landing are ONE code path. The tier is PROFILE-DERIVED
 * (the submit core pins T=1 to its single frame); seed and resolution ride
 * the chain settings exactly like an H3 video render. */
export function canvasH3OneFrameRequest(chainId: string, settings: Pick<CanvasChainSettings, 'prompt' | 'seed' | 'resolution'>): WorkbenchGenerationRequest {
  return {
    chainId,
    settings: {
      family: H3_ONE_FRAME_FAMILY,
      intent: settings.prompt,
      tier: 5,
      keepDial: 0.55,
      seed: settings.seed,
      resolution: settings.resolution,
      loras: [],
      refs: [],
      semanticOverflow: false,
      framePicks: {},
      refineEngine: '',
      poserigInbox: null,
    },
    refs: [],
    source: null,
  }
}

/** The pin-time honesty text (journey sweep #4b, reality audit 2026-09-25
 *  F8/M5): pinning a workbench frame lands a PLAIN MEDIA OBJECT (usable as
 *  a reference anywhere) — but its only regeneration lane is the T=1 Fast
 *  family, and when that lane is unavailable the audit found the dead end
 *  surfacing only at GENERATE time (a chain that can never render, on the
 *  exact inventory where the gate is a single missing file). The pin toast
 *  names the gate WHEN THE PIN LANDS: the pin is a success (never framed as
 *  a failure), with the regeneration requirement stated beside it. The
 *  `missing` list is the family detection's own (models first — the Mamad8
 *  VAE file leads). Pure — the surface passes the detection through. */
export function pinRegenerationNotice(available: boolean, missing: string[]): string {
  if (available) return 'The picked frame is pinned on the canvas as a media object — reference it anywhere, or generate on it (the T=1 Fast lane is ready).'
  const gate = missing.length ? ` It needs: ${missing.join('; ')}.` : ''
  return `The picked frame is pinned on the canvas as a media object — reference it anywhere. Regenerating it as a still needs the T=1 Fast lane, which this engine does not serve yet.${gate}`
}
