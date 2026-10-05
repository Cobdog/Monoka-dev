# H3 Keyframe Animation Adapters — assessment, limits map, and the feature program (2026-10-05)

> Source: alvdansen/h3-keyframe-animation (gated:auto; assessed with the
> maintainer's auth). Companion paper: *Animating on Twos* (Carlson & Bielec,
> Alvdansen Labs, 2026-08; CC BY 4.0 text, MIT code repo).
> **Maintainer ruling 2026-10-05: this is a PRIME FEATURE** — the program is
> (1) measure the limits, (2) effective-use doctrine, (3) an intuitive UI/UX
> to drive it. This doc is the input; the eval (ledger Set K) measures; the
> spec rounds design the surface when called.

## 1. The three conditioning contracts (the intellectual core)

Same architecture (rank-64/alpha-64 LoRA, 12k steps, ref-conditioning path —
NOT the FL2VA hard-endpoint path), differing only in what references MEAN:

| Adapter | Refs | The act | The contract's insight |
|---|---|---|---|
| **hero** | 1 (current key) | draw the NEXT hero key | *no destination shown* — showing the model where the action goes is showing it the answer |
| **tween** | 2 (rolling current + the beat's FIXED distant end extreme) | draw the next inbetween, one small step | the far ref is CONTEXT-that-leans, never a target; chain by feeding each result back as the near ref while the far never moves |
| **sequence** | 2 (window first + window's natural end) | surface a held sequence | teaching vs SURFACING: hand-drawn held animation exists in the base distribution; this makes it consistent (converges early) |

**The tween chain is a reference-space chaining methodology** — the chain
lives in conditioning, not latents: no m-scalar, no latent validity question,
no cross-schedule state (Set E's entire problem class absent by construction).
The complementary lane to latent chaining.

## 2. The caption dialect (prompting-packet-grade — the inference interface)

- **hero/early-tween, 3 sections**: `SCENE` (framing+subject-type+medium+props) /
  `MOVEMENT` (a full ARC for hero: start, path, end) / `STATIC` (what holds,
  ending with framing+ground).
- **tween, 5 sections**: + `FIRST FRAME` (near-ref pose) / `TARGET END FRAME`
  (far-ref pose, **phrased as a destination, NEVER comparative** — the rolling
  ref changes under the fixed far ref; comparisons go stale) / `MOVEMENT` =
  one step only, ending `landing <progress>` — **the step-size lever**, from
  a fixed vocabulary (fractional advances + hold/anticipation/overshoot/
  arrival).
- **Facing discipline**: FIRST/TARGET each state the facing (toward camera /
  back to camera / screen-left / screen-right); large moves name the facing
  change; directions frame-relative; MOVEMENT opens on the first-frame pose
  (a mid-action open pulls the clip toward the far ref).
- **sequence**: alignment line first (Picture N at the X-second mark),
  `Subject` carries "animated on twos", Action in beat order, `Preserve`
  lists the no-drift axes + the rhythm.
- **Training-dialect conventions**: no negations (CFG-distilled — every token
  positive); no character/franchise names (identity rides the references);
  byte-identical medium strings from a small fixed set (`clean line on
  white` / `flat black-and-white animatic` / `flat cel colour on white`);
  `Camera` carries a reason clause.

## 3. Operating point (the paper's figures, read from render code)

Full (unpruned-equivalent) ref2va int8 convrot base — **NOT any step-distill**;
`MiniMaxH3ReferenceToVideo`; `ref_image_size: max`; LoRA model-only @ 1.0
(trained strength — do not walk back; alpha==rank so scale is exactly 1.0);
euler/simple; **30–100 steps** (paper grids at 25/50); BasicGuider, NO CFG;
shift 12/3; 1344×768; **22 frames** (17n+5, n=1 — 11 drawings held two frames
each); 24fps; qwen3vl int8 TE; untiled VAEs.
**Traps documented by the authors**: (a) raw PEFT = zero-key silent no-op
against fused qkv_proj (our Set P trap — their converted files are safe; our
NOT-LOADED guard is the runtime defense); (b) cache-encode length ≠ render
length (trained 5-frame freeze, rendered 22 — conflating them crashes); (c)
Turbo/distill bases lose the linework — **this lane and our PDMD fast lane
never mix**.

## 4. CONFIRMS (independent, third-party)

The fused-qkv conversion math (stacked-A / block-diagonal-B — matches the
PDMD v6 card exactly, including the emit-alpha-only-when-≠-rank rule); the
zero-key no-op class; the H3 base-license reading (their NOTICE restates our
§5a row clause by clause: excluded territories, personal grants, §IV.1
revenue trigger, §V.3 no-cross-training).

## 5. License (the adoption gate)

PolyForm-Small-Business derivative: **free/unlimited for individuals,
researchers, nonprofits, and orgs under $2M revenue+capital** (90-day grace
on crossing); paid commercial above (minta@promptcrafted.com); no competing
product; notices ride. Non-waivable H3 base terms on top. **The maintainer
is eligible; Monoka ships these through the user-driven fetch-consent
catalog with eligibility surfaced per row** (the §5a family's standing
doctrine). Registry rows land with the fetch.

## 6. THE LIMITS MAP (what Set K must measure — "figure out what the limits are")

Unknowns, ranked by feature impact:
1. **Chain length / drift**: how far does a tween chain hold identity and
   cadence? (The far ref is fixed context — does 50-step drift accumulate?
   The paper shows short chains; the UI needs the practical ceiling.)
2. **Step-size vocabulary resolution**: do the landing-progress fractions
   actually control step size monotonically? (The UI's core dial if yes.)
3. **Style breadth**: trained on 17k frames of ONE artist's hand-drawn
   corpus with three fixed medium strings — does it hold on other 2D styles?
   Cel/limited/painterly? (The prime-feature audience is broader than one
   hand.)
4. **Live-action/3D source keys**: do the contracts work when the reference
   drawings are frames from rendered or filmed material (the recast lane's
   natural composition with this)?
5. **Resolution/length envelope**: trained 1344×768 @ 22f — behavior at 544p
   (our cheap lane), at 39f/43f (longer beats), at other aspect ratios.
6. **Sequence window bounds**: the surfacing adapter's window limits (how
   long a held sequence before it degrades?).
7. **Base sensitivity**: pruned-vs-unpruned ref2va, int8 convrot (their spec
   says unpruned; our local default is pruned — they claim pruned works;
   measure).
8. **Step count floor**: 30–100 stated — does 20 hold? (Interacts with our
   wall-clock budget for an interactive UI.)

## 7. UI/UX directions (pre-spec starter analysis — the brainstorming round's input)

The contracts map surprisingly well onto timeline idioms:
- **The tween chain IS a timeline**: near ref = the playhead's last output;
  the fixed far ref = the beat's endpoint marker. The UI drives itself —
  the user places beats (far refs), the chain fills between, the
  `landing <progress>` vocabulary becomes an intention control (how far
  this step advances toward the beat), not a prompt fragment.
- **Hero = the "next pose" button** at the playhead; sequence = a
  span-select fill. Three tools, one timeline.
- **The caption dialect wants structured authoring**, not a free textarea:
  FIRST/TARGET facing pickers, a MOVEMENT arc editor, medium as a fixed
  chip set (byte-identity is a constraint the UI enforces for free). The
  never-comparative rule is a lint, not a hope.
- **The prime-feature risk**: the effective-setting/handoff vocabulary this
  repo just built (origin/outcome, write/refresh) is exactly the state
  language a chain UI needs (each tween step: a write; each re-roll: a
  refresh of one step with the surgical invalidation we adopted from the
  Extender). The pieces compose.
- The full surface design goes through the spec rounds (the workshop's
  lane) when the maintainer calls it — this section is the input, not the
  design.

## 8. Program sequence

1. **Fetch + registry** (done with this doc — adapters staged, license
   flagged per §5).
2. **Set K** (the ledger registration): the three-way methodology comparison
   (tween-chain vs FL2VA-guide vs latent-chain on matched beats) + the
   limits map above as the measurement agenda.
3. **The prompting-packet entry**: the dialect joins the H3 packet as the
   keyframe-animation section once Set K validates the load-bearing rules.
4. **The spec rounds** (UI/UX) when called — §7 is the input brief.
