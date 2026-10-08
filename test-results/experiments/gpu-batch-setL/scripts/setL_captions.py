"""setL_captions — the Set L caption battery, authored per the H3 dialect.

Shape reference: shared/animation/compiler.ts (the module's three caption
templates) — tween's five sections SCENE / FIRST FRAME (Reference 1) /
TARGET END FRAME (Reference 2) / MOVEMENT / STATIC, newline-joined, the
medium byte-identical, frame sections numbered by attachment order, facing
rendered only as vocabulary terms (toward camera / back to camera /
screen-left / screen-right). The compiler's v2 STATIC appends authored
preservation after the fixed hold phrase. The `landing <progress>` token is
NOT emitted (Set K measured the dial dead; compiler v2 dropped it).

THE MOTION BATTERY (designed NOT to complete in one 22f window — the beat
Set K saturated in one clip, stretched to need ~3 windows of new motion):
the elf woman's head goes screen-right -> toward camera -> screen-left ->
back toward camera (three direction changes) while both arms rise
overhead; through the final phase the left arm lowers. Delivered arc =
66f @ 24fps = 2.75 s; phase boundaries at 22f / 44f.

Dialect discipline: positive tokens only (no negation anywhere — the
checkpoints are CFG-distilled); no character names; no comparative
destination language; MOVEMENT opens on the window's first-frame pose;
TARGET phrased as a destination.

WINDOW/ARM map (byte-identical SCENE/STATIC/TARGET across every caption):
  TWEEN[1..3]   arms 1+3 window captions (arm 3 rides the same material —
                matched caption-content by construction, the setK rule)
  SINGLE        arm 2's one 73f window (soft phase pacing; the last 7
                sampled frames are the settle — delivery trims to 66f)
  MCTX_W1/W2    arm 4; W2 follows the node's documented prompt-time
                convention: times refer to the SAMPLED window, the pinned
                head occupies its first 22f (0.92 s)
  HERO          the arc-end key author (single-ref contract; the C key)
"""
import re

MEDIUM = "clean line on white"

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

# the arc-end pose (the C key the hero adapter authors; byte-identical
# TARGET everywhere)
TARGET_C = ("TARGET END FRAME (Reference 2): her head turned three-quarter "
            "toward the camera from the screen-left side, her gaze returning "
            "toward the lens, her right arm held overhead, her left arm "
            "lowered to shoulder height, the curls of her high bun settled "
            "from the reverse turn, facing toward camera")

FIRSTS = {
    1: ("FIRST FRAME (Reference 1): her head turned three-quarter toward "
        "screen-right, her gaze off-frame screen-right, her arms low at her "
        "sides, her mouth closed and level, facing screen-right"),
    2: ("FIRST FRAME (Reference 1): her head frontal to the camera, her eyes "
        "on the lens, both arms held overhead, facing toward camera"),
    3: ("FIRST FRAME (Reference 1): her head turned three-quarter toward "
        "screen-left, her gaze off-frame screen-left, both arms held "
        "overhead, facing screen-left"),
}

MOVES = {
    1: ("from her head turned three-quarter toward screen-right and her gaze "
        "off-frame screen-right, she turns her head toward the camera, her "
        "eyes leading the sweep to the lens, while both arms rise overhead "
        "through the frame, the curls of her high bun dragging behind the turn"),
    2: ("from her head frontal to the camera and both arms overhead, the "
        "head carries its turn on toward screen-left, her gaze crossing the "
        "lens toward the screen-left frame, both arms holding their overhead reach"),
    3: ("from her head turned three-quarter toward screen-left and both arms "
        "overhead, her head turns back toward the camera, her eyes sweeping "
        "back toward the lens, as her left arm lowers to shoulder height "
        "while her right arm holds its overhead reach, the curls settling "
        "with the reverse turn"),
}


def _tween(k):
    return "\n".join([SCENE_S, FIRSTS[k], TARGET_C, "MOVEMENT: " + MOVES[k], STATIC_S])


TWEEN = {k: _tween(k) for k in (1, 2, 3)}

SINGLE = "\n".join([
    SCENE_S,
    FIRSTS[1],
    TARGET_C,
    "MOVEMENT: from her head turned three-quarter toward screen-right and "
    "her arms low at her sides, she turns her head toward the camera while "
    "both arms rise overhead, her eyes leading the sweep to the lens; "
    "through the middle of the shot the head carries its turn on toward "
    "screen-left, her gaze crossing the lens toward the screen-left frame, "
    "both arms holding their overhead reach; through the final stretch her "
    "head turns back toward the camera as her left arm lowers to shoulder "
    "height while her right arm holds its overhead reach, the curls "
    "settling with the reverse turn, the pose holding at the end",
    STATIC_S,
])

# arm 4. W1 (39f sampled = 1.63 s): phase 1 (through 0.92 s) + the opening
# stretch of phase 2. W2 (56f sampled = 2.33 s): the pinned head occupies
# the first 0.92 s (window-1's tail — phase-1 arrival into phase 2); new
# motion from the 1.0-second mark per the node's timecode-budget convention.
MCTX_W1 = "\n".join([
    SCENE_S,
    FIRSTS[1],
    TARGET_C,
    "MOVEMENT: from her head turned three-quarter toward screen-right and "
    "her gaze off-frame screen-right, she turns her head toward the camera, "
    "her eyes leading the sweep to the lens, while both arms rise overhead "
    "through the frame; as the arms settle into their overhead hold the "
    "head carries its turn on toward screen-left, her gaze crossing the "
    "lens toward the screen-left frame",
    STATIC_S,
])

MCTX_W2 = "\n".join([
    SCENE_S,
    "FIRST FRAME (Reference 1): her head arriving frontal to the camera "
    "with both arms rising to their overhead hold, the head already "
    "carrying its turn on toward screen-left, facing toward camera",
    TARGET_C,
    "MOVEMENT: the opening second of this window holds the turn toward "
    "screen-left with both arms settling overhead; from the 1.0-second mark "
    "the turn toward screen-left completes, then her head turns back toward "
    "the camera, her eyes sweeping back toward the lens, as her left arm "
    "lowers to shoulder height while her right arm holds its overhead "
    "reach, the curls settling with the reverse turn",
    STATIC_S,
])

# the arc-end key author (hero adapter, single ref = A; the whole arc in
# one bridge — the compiler's hero shape: reference line, full-arc
# MOVEMENT, STATIC hold alone)
HERO = "\n".join([
    SCENE_S,
    "Reference 1: the current key — her head turned three-quarter toward "
    "screen-right, her gaze off-frame screen-right, her arms low at her "
    "sides, facing screen-right",
    "MOVEMENT: from her head turned three-quarter toward screen-right and "
    "her arms at her sides, she turns her head toward the camera while both "
    "arms rise overhead, her eyes leading the sweep to the lens; the head "
    "then carries its turn on toward screen-left with the arms holding "
    "their overhead reach; through the final stretch her head turns back "
    "toward the camera as her left arm lowers to shoulder height while her "
    "right arm holds its overhead reach, the curls settling with the "
    "reverse turn",
    STATIC_HOLD,
])

ALL = {**{"HERO": HERO, "SINGLE": SINGLE, "MCTX_W1": MCTX_W1, "MCTX_W2": MCTX_W2},
       **{f"TWEEN{k}": TWEEN[k] for k in TWEEN}}

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
        for ln in txt.splitlines():
            if ", facing " in ln and not any(t in ln.split(", facing ")[-1] for t in FACING_TERMS):
                bad.append((name, f"non-vocabulary facing: {ln[-60:]}"))
    scenes = {txt.splitlines()[0] for txt in ALL.values()}
    # byte-uniformity is required across the TWEEN-SHAPED captions (the setK
    # chain rule); HERO rides the compiler's hero template whose STATIC is
    # the hold alone (no preservation field) — exempt by design
    tween_shaped = [TWEEN[k] for k in TWEEN] + [SINGLE, MCTX_W1, MCTX_W2]
    statics = {txt.splitlines()[-1] for txt in tween_shaped}
    targets = {TWEEN[k].splitlines()[2] for k in TWEEN}
    byte_ok = len(scenes) == 1 and len(statics) == 1 and len(targets) == 1
    return {"bad": bad, "scene_uniform": len(scenes) == 1,
            "static_uniform": len(statics) == 1, "target_uniform": len(targets) == 1,
            "pass": not bad and byte_ok}


if __name__ == "__main__":
    res = lint()
    for name, txt in ALL.items():
        print(f"--- {name} ({len(txt)} chars)")
        print(txt)
        print()
    print("LINT:", res)
