# VELA H3 — intake assessment (the house VDN lineage's continuation)

**Provenance:** the maintainer's pointer (2026-10-10,
github.com/Speach1sdef178/ComfyUI-VELA-H3, v1.0.0, Apache-2.0). The
lineage is the house's own: OpenVDN → the ComfyUI VDN-H3 port →
ComfyUI-VDN-H3-24GB (the scratchpad plugin our toolchain record already
tracks) → VELA. Assessed as our-own-work-released, per the doctrine.

## What it is

A **trajectory-aware execution optimization layer for the VDN-H3 path**:
the same VDN checkpoint format and model behavior, with a heterogeneous
production policy over the expensive attention paths — approximate
backends where validation showed acceptable (QKV via comfy-kitchen
INT8/ConvRot; GROUP + most GLOBAL via Sage), exact execution where
timestep/block sensitivity mapping said it matters (the critical GLOBAL
island, blocks 40–49, direct-cuDNN SDPA; ANCHOR exact), anchor-column
removal only in blocks 0 and 36. Core-patch-free (no ComfyUI core
edits); the LongCache hook stays research-disabled; the validated
config internalized (no BAT flags).

## The numbers, read honestly

The full table (no "up to" cherry): **17.6% at 0.4MP/5s, 23.1% at
0.8MP/5s, ~4% at 8–9s, and 2.0% SLOWER at 10s** — explicitly
workload-dependent (the optimized paths' relative cost shifts with
spatial and temporal sequence geometry). The 1344×768 data point
(1.032MP/8s/8steps = 4:40) sits in our animation lane's geometry class.
The quality comparisons are labeled correctly (8-step VDN+VELA vs
20-step raw — "the full timing difference must not be attributed to
VELA alone"; "no claim of pixel-identical quality").

This reporting style IS our doctrine — the honest full table including
the regression.

## What it means for the studio

1. **The `vdn.apply` rung's execution upgrade**: the studio already
   carries VDN first-party (ApplyVDNH3, PR #62). VELA keeps the
   checkpoint format — adopting it means swapping the EXECUTION layer
   under the same rung: no checkpoint change, no graph change, the
   release markers verifying which layer is live. **ADOPT-candidate**
   for the studio's VDN generation paths, validated through our harness
   when a GPU window opens (our stack is 0.39.0 vs their validated
   0.33.0 — the README itself says that's not a guarantee; our numbers
   or none).
2. **Where the benefit lands**: the turbo-tier image/video generation
   paths (short/low-MP where 17–23% lives). The animation lane runs the
   stock ref2va + adapters at 30 steps, NOT VDN — VELA does not touch
   it today; if the lane ever adopts a distilled fast lane (the sprint's
   PDMD world), VELA-class execution policy is the companion question.
3. **The sensitivity-mapping method** is the transferable artifact
   regardless: block/timestep-selective exactness over global backend
   swaps — the same philosophy as our per-lane slot discipline and the
   audit's fail-closed-where-it-matters doctrine.

## Verdict

**ADOPT-candidate** (the studio's VDN rung, harness-validated on our
stack before any default) · **CONFIRM** (the honest-numbers doctrine,
independently practiced) · no license friction (Apache-2.0; the VDN
checkpoint's own terms govern the weights).
