# H3 RefMods Lab — intake assessment + the unified-pack direction

**Provenance:** the maintainer's pick (2026-10-09,
github.com/entert-ai/ComfyUI-H3-RefMods-Lab, v0.1.2, MIT) assessed per the
fresh-release doctrine (mechanism vs code; community metrics dropped at this
age), then EXTENDED by the maintainer's direction the same day: go further —
a pack that can also be TRAINED ON DEMAND.

## The assessment (the verdict menu)

- **ADOPT — the token-budget math**: DiT tokens `(w/32)×(h/32)` per frame,
  temporal tokens per step, ~80 tokens/sec audio; budgets reject before
  encoding. A ready-made cost model for every reference surface we run.
- **ADOPT — the pre-encoded reference pack pattern**: exact VAE latents (no
  pooling) persisted once with lossy presentation copies for Qwen
  (quality-95 JPEGs — the VLM sees thumbnails, diffusion sees exact
  latents); GPU-verified: the saved latent byte-matches the native node's
  encoding and round-trips exactly.
- **ADOPT — the retention vocabulary**: fully_preserved /
  partially_preserved / attribute_transfer / weak_reference per source,
  subject-grouped, auto-assembled into prompt sections — compiler-ready.
- **ADJUST — our roadmap's refmod framing**: the community word now covers
  BOTH reference packs (this repo) and trained modifiers (our concept);
  ours disambiguates or renames. The pack pattern is the natural INPUT
  container for our refmod-creation system.
- **CORRECT**: per-generation reference encoding is not unavoidable —
  encode-once economics are real and verified here.
- **CONFIRM**: the extension lane's carry artifact independently arrived
  at their pack-persistence shape (exact bytes, digest-verified, registered
  at production, presentation split from conditioning). Their
  honest-limitation posture (strengths "experimental, not retention
  percentages"; checks "do not establish identity quality") mirrors ours.
- **Cautions**: format v2 explicitly non-interchangeable — we adopt the
  PATTERN into our own artifact store, not a dependency on their format;
  a node pack, not a library (studied patterns; MIT clean if a port ever
  earns a license row); quality claims go through OUR harness.

## THE DIRECTION (the maintainer, 2026-10-09): the unified pack

Go further: a pack that can also be **trained on demand** — training is
fast enough that bundling + activating on demand is the natural shape.
One artifact, two activation modes:

1. **References now** — the Lab pattern: pre-encoded latents + retention
   metadata, applied per generation.
2. **A trained modifier on demand** — a refmod derivation (the
   optimization-expansion concept; VDN is the first-party candidate
   engine) trained FROM the same bundled material when requested, quickly,
   then activatable alongside or instead of the raw references.

The unified pack merges three threads the project already holds: the
reference-pack pattern (this assessment), the deferred refmod-creation
system (the toolchain's standing "our own version" interest), and the
first-party VDN integration (`vdn.apply`). Design work proceeds per the
architectural path — context research first, then the dialogue, then the
spec for the maintainer's review.
