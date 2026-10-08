"""setM_captions — Set M's authored text: the driving-arc beat captions,
character B's spec, and the repaint/view edit instructions.

Set M — the Viggle-Animate swap battery (setM-brief.md). Two text families:

  1. THE DRIVING ARC (3x22f setk-style latent chain, seed 421337): Set L's
     PROVEN arc texts with one designed delta — a there-and-back FIGURE
     DISPLACEMENT (beat 2 drifts the whole figure toward screen-right, beat
     3 settles back toward center). The brief's exit/reentry beat is judged
     not achievable at the tween lane's measured motion magnitude (Set L:
     ~10-40 px sustained travel per window vs the ~600 px needed to leave a
     1344 px frame) — the displacement is the honest drift probe that
     survives: distance from the still's canonical layout, then return.
     SCENE/STATIC byte-identical to Set L's (the same subject, canvas, and
     dialect); TARGET byte-identical (the C key stays the arc-end anchor);
     FIRSTS/MOVES carry the displacement language.

  2. THE IMAGE-LANE INSTRUCTIONS (H3ReferenceEditPrepare contracts, the
     studio's ownership-contract style — source is always <Picture 1>,
     donor rides <Picture 2>): character B's T2I spec, the control/face/
     outfit repaint instructions, and the two sheet-view instructions.

PREMISE CORRECTION (recorded in the results doc): setK/B_key.png is the
SAME elf-girl (the hero-authored pose-B key of Set K's quickstart), not a
second character — the corpus carries no distinct donor. Character B is
AUTHORED here via the same H3 image lane the brief sanctions for the sheet
views, in-family (clean line on white, bust crop) and palette-separated
from A (black bob + mustard cardigan vs cream-blonde high bun + light blue
overshirt), gated offline (setM_0's palette gate + setM_1's G-B).

Dialect discipline (Set K/L): positive tokens only; no comparatives; facing
as closed vocabulary; MOVEMENT opens on the window's first-frame pose;
TARGET phrased as a destination.
"""
import re

MEDIUM = "clean line on white"

# ------------------------------------------------------------------ driving arc
# byte-identical to setL_captions (the same subject + dialect)
SCENE_S = ("SCENE: clean line on white; a bust shot of a young elf woman with "
           "a high bun of cream-blonde curls, long pointed ears, and a single "
           "gold hoop earring, her dark turtleneck and white collar layered "
           "under a light blue overshirt.")

STATIC_HOLD = ("STATIC: identity, wardrobe, and proportions stay consistent; "
               "framing and ground plane stay fixed.")
PRESERVE = ("The white ground, the gold hoop earring, the turtleneck and "
            "collar layers, and the bust framing hold, the figure floating "
            "on the plain white ground.")
STATIC_S = STATIC_HOLD + " " + PRESERVE

TARGET_C = ("TARGET END FRAME (Reference 2): her head turned three-quarter "
            "toward the camera from the screen-left side, her gaze returning "
            "toward the lens, her right arm held overhead, her left arm "
            "lowered to shoulder height, the curls of her high bun settled "
            "from the reverse turn, facing toward camera")

FIRSTS = {
    1: ("FIRST FRAME (Reference 1): her head turned three-quarter toward "
        "screen-right, her gaze off-frame screen-right, her arms low at her "
        "sides, her figure centered in the frame, her mouth closed and "
        "level, facing screen-right"),
    2: ("FIRST FRAME (Reference 1): her head frontal to the camera, her eyes "
        "on the lens, both arms held overhead, her figure centered in the "
        "frame, facing toward camera"),
    3: ("FIRST FRAME (Reference 1): her head turned three-quarter toward "
        "screen-left, her gaze off-frame screen-left, both arms held "
        "overhead, her figure shifted toward the screen-right side of the "
        "frame, facing screen-left"),
}

MOVES = {
    1: ("from her head turned three-quarter toward screen-right and her gaze "
        "off-frame screen-right, she turns her head toward the camera, her "
        "eyes leading the sweep to the lens, while both arms rise overhead "
        "through the frame, the curls of her high bun dragging behind the turn"),
    2: ("from her head frontal to the camera and both arms overhead, the "
        "head carries its turn on toward screen-left, her gaze crossing the "
        "lens toward the screen-left frame, both arms holding their overhead "
        "reach, her whole figure drifting toward the screen-right side of "
        "the frame through the window"),
    3: ("from her head turned three-quarter toward screen-left, both arms "
        "overhead, and her figure shifted toward screen-right, her head "
        "turns back toward the camera, her eyes sweeping back toward the "
        "lens, as her left arm lowers to shoulder height while her right "
        "arm holds its overhead reach, her figure settling back toward the "
        "frame center, the curls settling with the reverse turn"),
}


def _beat(k):
    return "\n".join([SCENE_S, FIRSTS[k], TARGET_C, "MOVEMENT: " + MOVES[k], STATIC_S])


DRIVE = {k: _beat(k) for k in (1, 2, 3)}

# ------------------------------------------------------------- character B spec
# The authored donor: in-family line art, distinctly different identity.
B_SCENE = ("SCENE: clean line on white; a bust shot of a young human woman "
           "with a chin-length black bob and straight full bangs, her round "
           "ears covered by her hair, warm brown eyes, a small silver stud "
           "earring on her left ear, a mustard-yellow cardigan open over a "
           "charcoal-grey t-shirt.")

B_T2I = "\n".join([
    B_SCENE,
    "Reference 1: the character sheet anchor - she faces the camera head-on, "
    "her eyes meeting the lens, her shoulders relaxed, facing toward camera",
    "MOVEMENT: she holds the head-on pose steady, the bangs and bob framing "
    "the face cleanly, the cardigan lying flat over the t-shirt",
    STATIC_HOLD,
])

# ------------------------------------------------------- the repaint instructions
# Source (Picture 1) = the driving clip's frame 0 (A's pose/framing).
# Donor (Picture 2) per arm. Uniform pipeline; only the contract differs.

REP_CONTROL = (
    "<Picture 1> is the pose, framing, camera, and lighting anchor. "
    "<Picture 2> is the character reference. Render the same young elf "
    "woman from <Picture 2> - the high bun of cream-blonde curls, the long "
    "pointed ears, the single gold hoop earring, the lavender eyes, the "
    "dark turtleneck with white collar layered under the light blue "
    "overshirt - in exactly the pose, framing, camera, lighting, and plain "
    "white ground of <Picture 1>. The output is the same character in the "
    "same frame, redrawn."
)

REP_FACE = (
    "<Picture 1> is the pose, framing, camera, lighting, and wardrobe "
    "anchor. <Picture 2> is the identity anchor. Keep from <Picture 1> the "
    "pose, the framing, the camera, the lighting, the plain white ground, "
    "and the full wardrobe - the dark turtleneck with white collar layered "
    "under the light blue overshirt. Transfer onto her the identity of "
    "<Picture 2>: the chin-length black bob with straight full bangs, the "
    "warm brown eyes, the small silver stud earring, and the rounded human "
    "ears in place of the pointed elf ears and the cream-blonde high bun. "
    "The black bob and bangs render in the same loose line and flat fills "
    "as the rest of the drawing. Her face becomes the woman of <Picture 2>; "
    "her outfit and pose stay exactly as <Picture 1>."
)

REP_OUTFIT = (
    "<Picture 1> is the pose, framing, camera, lighting, and identity "
    "anchor. <Picture 2> is the wardrobe anchor. Keep from <Picture 1> the "
    "pose, the framing, the camera, the lighting, the plain white ground, "
    "and the full identity - the high bun of cream-blonde curls, the long "
    "pointed ears, the single gold hoop earring, the lavender eyes, and her "
    "face. Transfer onto her the wardrobe of <Picture 2>: the mustard-yellow "
    "cardigan open over the charcoal-grey t-shirt in place of the dark "
    "turtleneck, white collar, and light blue overshirt. The cardigan "
    "renders in the same loose line and flat fills as the rest of the "
    "drawing. Her outfit becomes the cardigan and t-shirt of <Picture 2>; "
    "her face and pose stay exactly as <Picture 1>."
)

# ----------------------------------------------------------- the sheet views
# Two additional views of B for the 3-view character sheet (the brief's
# arm 4): authored as edits of the B portrait (same character, new facing).

VIEW_SIDE = (
    "<Picture 1> is the character anchor. Render the same young human "
    "woman - the chin-length black bob with straight full bangs, the warm "
    "brown eyes, the small silver stud earring, the mustard-yellow cardigan "
    "open over the charcoal-grey t-shirt - turned to a strict side profile "
    "facing screen-left, bust shot, clean line on white, the same "
    "proportions, wardrobe, and style, the bob and bangs seen edge-on."
)

VIEW_THREEQ = (
    "<Picture 1> is the character anchor. Render the same young human "
    "woman - the chin-length black bob with straight full bangs, the warm "
    "brown eyes, the small silver stud earring, the mustard-yellow cardigan "
    "open over the charcoal-grey t-shirt - turned three-quarter toward "
    "screen-right, bust shot, clean line on white, the same proportions, "
    "wardrobe, and style, the bangs crossing the forehead at the angle."
)

ALL = {**{f"DRIVE{k}": DRIVE[k] for k in DRIVE},
       "B_T2I": B_T2I, "REP_CONTROL": REP_CONTROL, "REP_FACE": REP_FACE,
       "REP_OUTFIT": REP_OUTFIT, "VIEW_SIDE": VIEW_SIDE, "VIEW_THREEQ": VIEW_THREEQ}

NEG_RE = re.compile(r"\b(not|no|never|without|unchanged|still the same)\b", re.I)
CMP_RE = re.compile(r"\b(more than|farther|further|than)\b", re.I)
FACING_TERMS = ("toward camera", "back to camera", "screen-left", "screen-right")


def lint():
    bad = []
    for name, txt in ALL.items():
        if NEG_RE.search(txt):
            bad.append((name, "negation"))
        if CMP_RE.search(txt):
            bad.append((name, "comparative"))
        if "{" in txt or "}" in txt:
            bad.append((name, "unexpanded placeholder"))
    # byte-uniformity across the driving beats (the setk chain rule)
    scenes = {DRIVE[k].splitlines()[0] for k in DRIVE}
    statics = {DRIVE[k].splitlines()[-1] for k in DRIVE}
    targets = {DRIVE[k].splitlines()[2] for k in DRIVE}
    byte_ok = len(scenes) == 1 and len(statics) == 1 and len(targets) == 1
    # every image-lane instruction names both pictures it uses
    pic_ok = all("<Picture 1>" in ALL[k] for k in ("REP_CONTROL", "REP_FACE", "REP_OUTFIT",
                                                  "VIEW_SIDE", "VIEW_THREEQ"))
    return {"bad": bad, "scene_uniform": len(scenes) == 1,
            "static_uniform": len(statics) == 1, "target_uniform": len(targets) == 1,
            "pictures_named": pic_ok,
            "pass": not bad and byte_ok and pic_ok}


if __name__ == "__main__":
    res = lint()
    for name, txt in ALL.items():
        print(f"--- {name} ({len(txt)} chars)")
        print(txt)
        print()
    print("LINT:", res)
