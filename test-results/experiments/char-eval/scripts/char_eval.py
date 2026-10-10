"""char_eval — the CHAR-eval round-trip: build .char files from OUR reference
assets via the Apache-2.0 omnichar-sdk, decode them back through the H3
numbered-slot wiring + the batch form, and verify what survives. CPU-ONLY:
no engine, no card, no GPU contact (the optional testbed render leg is a
separate GPU-window decision, out of scope here by registration).

Registered in docs/research/gpu-batch-ledger.md ("THE CHAR EVAL REGISTERED",
2026-10-05); brief = docs/research/omnichar-assessment.md section 5.1.
Flux: CHAR eval (gu92clr). Run with THIS venv's python:

  cd "/home/agent/work/VS Proj/MINIMAX-DESKTOP/test-results/experiments/char-eval" \\
      && ./.venv/bin/python scripts/char_eval.py

The characters (our corpus, no fabricated assets):
  - Quickstart Elf  — setK's own corpus: A_key (the authored bust key,
    FACE), B_key (the hero-authored pose-B key, BODY), t10_last (the
    tween-chain terminal take, CLOTH — a genuinely-used chain reference;
    the setK corpus is bust-crop-centric, so body/cloth are the
    best-fitting assets, not true full-body/flat-wardrobe plates).
  - Donor B        — setM's authored second character (the setM premise
    correction: the corpus HAD no second character, so one was authored via
    the H3 image lane): B_ref (FACE), B_view_side (BODY), B_view_threeq
    (CLOTH).

Locked descriptions are the sets' own character fragments (byte-verbatim;
gate G-PROV asserts each is a substring of the live caption modules).

Phases (each a gate; every result lands in out/summary.json):
  G-PROV  assets exist + dims + sha256 recorded; descriptions provenance-checked
  G-ENC   encode_character both characters; write; container shape
          (signature at byte 0, manifest-first, version 1, member layout)
  G-ORDER role order round-trip: encode order -> manifest refs -> payload
          files -> get_references, BOTH layers (originals + minimax-h3)
  G-BYTES originals byte-level: refs/ members == our inputs re-encoded the
          way the SDK stores them; description member byte-verbatim
  G-H3    the numbered-slot wiring: payload dims conform to the SDK's H3
          policy (short_edge 2048 / 32-grid / aspect<=4) — measured against
          OUR cap-semantics convention (ref_image_size max = up to 2048,
          only shrink) — plus content-match matrix (no reorder/swap)
  G-SLOTS the repo's wiring table: ref_images.ref_image_N dotted keys (the
          setK harness finding) <-> <Picture N+1> ordinals, single char,
          lead-image shift, and the two-character multi-trap case
  G-PROMPT prompt-numbering stability: style=token text, description
          carried, reserved-label non-repetition (role lines), first_position
  G-VOICE the H3-only voice lane: set_voice (stdlib WAV), <Audio 1> binding,
          the wanted() send rule (auto = only with dialogue)
  G-BATCH the batch form: common_size + fit(pad) -> one image, order kept,
          cell numbering == prompt numbering; numbered reference sheet
  G-DET   determinism: two encodes -> members identical, manifest differs
          only in char_id/created_at/modified_at; stale-handle + corrupt
          container rejection
  G-CLI   the language-agnostic CLI surface: inspect --json + prompt
"""
import io
import json
import math
import re
import struct
import subprocess
import sys
import wave
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent          # .../char-eval
OUT = HERE / "out"
OUT.mkdir(parents=True, exist_ok=True)
REPO = Path("/home/agent/work/VS Proj/MINIMAX-DESKTOP")
SETK = Path("/home/agent/comfyui/input/setK")
SETM = Path("/home/agent/comfyui/input/setM")

import omnichar_sdk as S
from omnichar_sdk import Character

RESULTS = {}
FAILED = []


def gate(name, ok, note=""):
    RESULTS.setdefault(name, {})["pass"] = bool(ok)
    print(f"[char-eval] {name}: {'PASS' if ok else 'FAIL'}{(' — ' + note) if note else ''}",
          flush=True)
    if not ok:
        FAILED.append(name)
    return bool(ok)


# ---------------------------------------------------------------- the corpus
# Byte-verbatim character fragments: setK SCENE_S / setM B_SCENE (after the
# framing prefixes). G-PROV asserts substring provenance against the live
# caption modules, so these cannot silently drift from the corpus.
ELF_DESC = ("a young elf woman with a high bun of cream-blonde curls, long "
            "pointed ears, and a single gold hoop earring, clean line on "
            "white, her dark turtleneck and white collar layered under a "
            "light blue overshirt.")
DONOR_DESC = ("a young human woman with a chin-length black bob and straight "
              "full bangs, her round ears covered by her hair, warm brown "
              "eyes, a small silver stud earring on her left ear, a "
              "mustard-yellow cardigan open over a charcoal-grey t-shirt.")

CHARS = {
    "elf": {
        "name": "Quickstart Elf",
        "description": ELF_DESC,
        "assets": [  # (path, role) — role-sorted on encode; order asserted later
            (SETK / "A_key.png", "face"),
            (SETK / "B_key.png", "body"),
            (SETK / "t10_last.png", "cloth"),
        ],
    },
    "donor": {
        "name": "Donor B",
        "description": DONOR_DESC,
        "assets": [
            (SETM / "B_ref.png", "face"),
            (SETM / "B_view_side.png", "body"),
            (SETM / "B_view_threeq.png", "cloth"),
        ],
    },
}


def png_dims(path):
    d = Path(path).read_bytes()[:24]
    assert d.startswith(b"\x89PNG\r\n\x1a\n"), f"{path} is not a PNG"
    return struct.unpack(">II", d[16:24])


def sha(path):
    import hashlib
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


# =============================================================== G-PROV
def g_provenance():
    res = {}
    for key, spec in CHARS.items():
        entries = []
        for path, role in spec["assets"]:
            w, h = png_dims(path)
            entries.append({"file": path.name, "role": role, "w": w, "h": h,
                            "sha256": sha(path)})
        res[key] = {"name": spec["name"], "assets": entries}
    # description provenance: each fragment must be byte-inside its caption
    # module's EVALUATED constants (the source text splits them across lines)
    sys.path.insert(0, str(REPO / "test-results/experiments/gpu-batch-setK/scripts"))
    sys.path.insert(0, str(REPO / "test-results/experiments/gpu-batch-setM/scripts"))
    import setK_captions as KC
    import setM_captions as MC
    ok_desc = ELF_DESC in KC.SCENE_S and DONOR_DESC in MC.B_SCENE
    gate("G-PROV", ok_desc and all(len(v["assets"]) == 3 for v in res.values()),
         f"6 assets, fragments byte-verbatim from setK/setM caption modules")
    RESULTS["G-PROV"].update(res)
    return res


# =============================================================== G-ENC
def g_encode():
    from PIL import Image
    docs, paths = {}, {}
    for key, spec in CHARS.items():
        pairs = [(Image.open(p).convert("RGB"), role) for p, role in spec["assets"]]
        doc = S.encode_character(spec["name"], spec["description"], pairs)
        target = OUT / f"{key}.char"
        S.write(target, doc)
        docs[key], paths[key] = doc, target
    res = {}
    for key, path in paths.items():
        raw = path.read_bytes()
        char = Character.open(path)
        info = char.get_info()
        member_names = sorted(doc_member_names(path))
        res[key] = {
            "bytes": len(raw),
            "format_version": info.format_version,
            "ref_count": info.ref_count,
            "ref_archs": info.ref_archs,
            "members": member_names,
            "signature_byte0": S.looks_like_char(
                zipfile.ZipFile(path).open("manifest.json").read(64)),
        }
    ok = all(
        r["format_version"] == 1 and r["ref_count"] == 3
        and r["signature_byte0"]
        and set(r["ref_archs"]) == {"flux2-klein", "minimax-h3"}
        for r in res.values())
    # manifest is the FIRST member (front-of-stream identification)
    first_ok = all(
        zipfile.ZipFile(p).infolist()[0].filename == "manifest.json" for p in paths.values())
    gate("G-ENC", ok and first_ok,
         f"{ {k: (r['bytes'], r['ref_archs']) for k, r in res.items()} } manifest-first={first_ok}")
    RESULTS["G-ENC"].update(res)
    return docs, paths


def doc_member_names(path):
    import zipfile
    with zipfile.ZipFile(path) as z:
        return [i.filename for i in z.infolist() if not i.is_dir()]


# =============================================================== G-ORDER
def g_order(paths):
    res = {}
    for key, path in paths.items():
        char = Character.open(path)
        want = [role for _, role in CHARS[key]["assets"]]
        # the SDK sorts face -> body -> cloth on encode ("position is what a
        # prompt names"); our assets were supplied already role-sorted
        sorted_want = sorted(want, key=lambda r: S.ROLES.index(r))
        manifest_roles = [S.charfile.role_of(r) for r in char.manifest.refs]
        originals = char.get_references()                      # refs/ layer
        payload = char.get_references(arch=S.MINIMAX_H3_ARCH)  # compiled layer
        res[key] = {
            "supplied": want,
            "manifest_roles": manifest_roles,
            "originals_roles": [r.role for r in originals],
            "payload_roles": [r.role for r in payload],
            "manifest_paths": [r["path"] for r in char.manifest.refs],
            "payload_paths": [r.path for r in payload],
            "order_ok": manifest_roles == sorted_want
            and [r.role for r in originals] == sorted_want
            and [r.role for r in payload] == sorted_want,
        }
    gate("G-ORDER", all(r["order_ok"] for r in res.values()),
         "role order survives encode -> manifest -> payload -> decode, both layers")
    RESULTS["G-ORDER"].update(res)


# =============================================================== G-BYTES
def g_bytes(docs):
    """Originals byte-level + the locked description byte-verbatim."""
    import hashlib
    from PIL import Image
    res = {}
    for key, doc in docs.items():
        spec = CHARS[key]
        # the SDK stores PNG re-encodes of image.convert("RGB"); replicate
        orig_ok, hashes = True, []
        for i, (path, _) in enumerate(
                sorted(spec["assets"], key=lambda pr: S.ROLES.index(pr[1]))):
            buf = io.BytesIO()
            Image.open(path).convert("RGB").save(buf, format="PNG")
            stored = doc.members[f"refs/{i:03d}.png"]
            match = hashlib.sha256(buf.getvalue()).hexdigest() == \
                hashlib.sha256(stored).hexdigest()
            orig_ok = orig_ok and match
            hashes.append(match)
        # description: the text member byte-verbatim, and the manifest agrees
        desc_bytes = spec["description"].encode("utf-8")
        member = doc.manifest.text["path"]
        desc_ok = (doc.members[member] == desc_bytes
                   and doc.manifest.text["sha256"] ==
                   hashlib.sha256(desc_bytes).hexdigest())
        res[key] = {"originals_reencoded_ok": hashes, "description_member_ok": desc_ok}
    gate("G-BYTES", all(r["originals_reencoded_ok"] and r["description_member_ok"]
                        for r in res.values()),
         "refs/ members byte-identical to our inputs (RGB-PNG), description member byte-verbatim")
    RESULTS["G-BYTES"].update(res)


# =============================================================== G-H3
def g_h3(paths):
    """Payload conformance to the H3 policy + the content-match matrix +
    the target-vs-cap divergence measurement against OUR conventions."""
    from PIL import Image
    policy = S.REFERENCE_POLICIES[S.MINIMAX_H3_ARCH]
    res = {"policy": policy}
    ok_dims = True
    matrix = {}
    for key, path in paths.items():
        char = Character.open(path)
        refs = char.get_references(arch=S.MINIMAX_H3_ARCH)
        originals = CHARS[key]["assets"]
        rows = []
        for ref, (src, role) in zip(refs, sorted(originals, key=lambda pr: S.ROLES.index(pr[1]))):
            w, h = ref.width, ref.height
            sw, sh = png_dims(src)
            conf = (min(w, h) == policy["short_edge"] and w % policy["multiple_of"] == 0
                    and h % policy["multiple_of"] == 0
                    and max(w / h, h / w) <= policy["max_aspect"])
            ok_dims = ok_dims and conf
            rows.append({"role": role, "src": f"{sw}x{sh}", "payload": f"{w}x{h}",
                         "policy_conformant": conf,
                         # our reading (packet §2): ref_image_size max = keep UP
                         # TO 2048 short edge — a cap, shrink-only. The SDK
                         # normalizes ONTO 2048 (a target, up-or-down).
                         "divergence": "upscaled" if min(sw, sh) < 2048 else
                         ("kept" if min(sw, sh) == 2048 else "downscaled"),
                         "factor": round(2048 / min(sw, sh), 3)})
        matrix[key] = rows
        # content-match: thumb(payload) must be closest to thumb(own original)
        thumbs_o = {src.name: _thumb(src) for src, _ in originals}
        assigned = []
        for ref, (src, _) in zip(refs, sorted(originals, key=lambda pr: S.ROLES.index(pr[1]))):
            tp = _thumb_bytes(ref.bytes())
            best = min(thumbs_o, key=lambda n: _mse(tp, thumbs_o[n]))
            assigned.append({"payload_role": ref.role, "closest_original": best,
                             "match": best == src.name})
        matrix[key] = {"dims": rows, "content_match": assigned}
        if not all(a["match"] for a in assigned):
            ok_dims = False
    gate("G-H3", ok_dims,
         "payload dims conform (2048/32/aspect4); content-match no reorder; "
         "target-vs-cap divergence measured")
    RESULTS["G-H3"] = {"policy": policy, "per_char": matrix,
                       "pass": RESULTS.setdefault("G-H3", {}).get("pass", True)}


def _thumb(path_or_bytes, size=64):
    from PIL import Image
    if isinstance(path_or_bytes, (bytes, bytearray)):
        im = Image.open(io.BytesIO(path_or_bytes)).convert("RGB")
    else:
        im = Image.open(path_or_bytes).convert("RGB")
    return list(im.resize((size, size)).getdata())


def _thumb_bytes(data):
    return _thumb(bytes(data))


def _mse(a, b):
    n = len(a)
    tot = 0
    for (r1, g1, b1), (r2, g2, b2) in zip(a, b):
        tot += (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2
    return tot / (n * 3)


# =============================================================== G-SLOTS
# The repo's own wiring (src/lib/workflow.ts mode==='reference'): images ride
# dotted keys ref_images.ref_image_${index}, index 0-based; <Picture N> is the
# 1-based ordinal of the image at index N-1 (packet §2: wiring order binds).
def slot_table(ref_lists):
    """ref_lists: ordered [(char_key, [refs...])] as they would be wired.
    Returns the conditioning-input dict + the ordinal mapping."""
    inputs, mapping, idx = {}, [], 0
    for key, refs in ref_lists:
        for ref in refs:
            inputs[f"ref_images.ref_image_{idx}"] = f"<LoadImage {idx}>"
            mapping.append({"slot": f"ref_image_{idx}", "ordinal": idx + 1,
                            "char": key, "role": ref.role})
            idx += 1
    return inputs, mapping


def g_slots(paths):
    chars = {k: Character.open(p) for k, p in paths.items()}
    refs = {k: chars[k].get_references(arch=S.MINIMAX_H3_ARCH) for k in paths}

    # single character, refs first: ordinals 1..3 == slots 0..2
    inputs, m1 = slot_table([("elf", refs["elf"])])
    ok1 = ([x["ordinal"] for x in m1] == [1, 2, 3]
           and all(x["slot"] == f"ref_image_{x['ordinal'] - 1}" for x in m1)
           and all(k.startswith("ref_images.ref_image_") for k in inputs))

    # lead scene image ahead of the character: the character must be told it
    # starts at <Picture 2> (first_position shift)
    _, m2 = slot_table([("scene", refs["elf"][:1]), ("elf", refs["elf"])])
    ok2 = ([x["ordinal"] for x in m2] == [1, 2, 3, 4]
           and [x["ordinal"] for x in m2 if x["char"] == "elf"] == [2, 3, 4])
    elf_shift = chars["elf"].get_prompt(style="token", first_position=2)
    ok2 = ok2 and _tokens(elf_shift) == [2, 3, 4]

    # the multi-character trap (our #1): elf slots 0-2, donor slots 3-5
    inputs3, m3 = slot_table([("elf", refs["elf"]), ("donor", refs["donor"])])
    ok3 = ([x["ordinal"] for x in m3] == [1, 2, 3, 4, 5, 6]
           and [x["ordinal"] for x in m3 if x["char"] == "donor"] == [4, 5, 6]
           and len(inputs3) == 6)
    donor_p = chars["donor"].get_prompt(style="token", first_position=4)
    elf_p = chars["elf"].get_prompt(style="token", first_position=1)
    ok3 = ok3 and _tokens(donor_p) == [4, 5, 6] and _tokens(elf_p) == [1, 2, 3]
    combined = sorted(_tokens(elf_p) + _tokens(donor_p))
    ok3 = ok3 and combined == [1, 2, 3, 4, 5, 6]

    gate("G-SLOTS", ok1 and ok2 and ok3,
         "dotted-key slots <-> ordinals 1:1; lead-image shift first_position=2; "
         "two-character wiring contiguous 1..6, no gaps/dupes")
    RESULTS["G-SLOTS"] = {"single": m1, "lead_shift": m2, "two_char": m3,
                          "pass": ok1 and ok2 and ok3}


def _tokens(prompt_text):
    return [int(n) for n in re.findall(r"<Picture (\d+)>", prompt_text)]


# =============================================================== G-PROMPT
def g_prompt(paths):
    char = Character.open(paths["elf"])
    p = char.get_prompt(style="token", first_position=1, role_lines=True)
    # the bind line: every position declared exactly once
    head = p.split(".")[0] + "."
    decl_ok = head == ("<Picture 1> <Picture 2> <Picture 3> show Quickstart Elf, "
                       "the same character in every image.")
    # reserved-label non-repetition: role lines refer back in prose, never a
    # second <Picture N> (the SDK's own H3 golden: a repeated reserved label
    # replays the references)
    n_decl = len(re.findall(r"<Picture \d+>", p))
    role_prose = re.search(r"Pictures? [0-9, and]+ show", p) is not None
    # description carried verbatim (single-line fragment: the SDK's
    # whitespace-collapse is the identity on it — assert that too)
    collapse_is_identity = ELF_DESC == " ".join(ELF_DESC.split())
    desc_ok = ELF_DESC in p and collapse_is_identity
    # our packet's addressing table: token == <Picture N> is the H3 form;
    # at-image (Seedance) and ordinal (FLUX.2 prose) differ
    p_at = char.get_prompt(style="at-image")
    p_ord = char.get_prompt(style="ordinal")
    forms_ok = ("@Image1" in p_at and "@Image2" in p_at
                and "Images 1, 2 and 3 show" in p_ord)
    gate("G-PROMPT", decl_ok and n_decl == 3 and role_prose and desc_ok and forms_ok,
         f"decl once ({n_decl}), role prose not tokens, description verbatim, "
         f"per-family forms present")
    RESULTS["G-PROMPT"] = {"token_prompt": p, "at_image_head": p_at[:80],
                           "ordinal_head": p_ord[:80],
                           "pass": decl_ok and n_decl == 3 and role_prose
                           and desc_ok and forms_ok}
    return p


# =============================================================== G-VOICE
def _wav(seconds=4.0, rate=22050):
    """A quiet tone, 16-bit mono PCM — stdlib only."""
    n = int(seconds * rate)
    frames = b"".join(
        struct.pack("<h", int(6000 * math.sin(2 * math.pi * 220 * i / rate)))
        for i in range(n))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(frames)
    return buf.getvalue()


def g_voice(docs, paths):
    sample = _wav()
    doc = docs["elf"]
    S.set_voice(doc, sample, sample, source_name="elf_tone.wav")
    voiced = OUT / "elf_voiced.char"
    S.write(voiced, doc)
    char = Character.open(voiced)
    v = char.get_voice()
    v_ok = v is not None and 3.9 < v.seconds < 4.1 and v.channels == 1
    p = char.get_prompt(style="token", first_position=1, voice_position=1)
    audio_ok = ("<Audio 1> is Quickstart Elf's voice. Quickstart Elf speaks in "
                "this voice, lips moving in sync with every word." in p)
    # the send rule: auto = only when the prompt has dialogue (their rule;
    # our packet has no voice lane yet — recorded as their convention)
    dial = 'The woman (S1) says: <d>[English] Hello there.</d>'
    nodial = "A wide shot of the harbor at dawn, gulls circling."
    rule_ok = (S.wanted("auto", dial) and not S.wanted("auto", nodial)
               and S.wanted("always", nodial) and not S.wanted("never", dial))
    # per-modality ordinals hold: pictures unchanged, audio counted separately
    tok_ok = _tokens(p) == [1, 2, 3] and p.count("<Audio ") == 1
    gate("G-VOICE", v_ok and audio_ok and rule_ok and tok_ok,
         "voice stored/read, <Audio 1> binds, auto-rule == dialogue-only, "
         "audio ordinals per-modality")
    RESULTS["G-VOICE"] = {"seconds": v.seconds if v else None,
                          "sample_rate": v.sample_rate if v else None,
                          "pass": v_ok and audio_ok and rule_ok and tok_ok}


# =============================================================== G-BATCH
def g_batch(paths):
    char = Character.open(paths["elf"])
    refs = char.get_references(arch=S.MINIMAX_H3_ARCH)
    size = S.common_size(refs, policy="first")     # the batch is built at one size
    cells = [r.fit(size, "pad") for r in refs]     # pad = letterbox
    from PIL import Image
    sheet_w = size[0] * len(cells)
    batch = Image.new("RGB", (sheet_w, size[1]))
    order = []
    for i, cell in enumerate(cells):
        batch.paste(cell, (i * size[0], 0))
        order.append({"batch_pos": i, "ordinal": i + 1, "role": refs[i].role})
    batch_target = OUT / "elf_batch.png"
    batch.save(batch_target)
    numbered = char.save_reference_sheet(OUT / "elf_sheet.png", arch=S.MINIMAX_H3_ARCH,
                                         first_position=1)
    p = char.get_prompt(style="token", first_position=1)
    ok = (all(c.size == size for c in cells)
          and all(o["batch_pos"] == o["ordinal"] - 1 for o in order)
          and _tokens(p) == [o["ordinal"] for o in order]
          and batch_target.exists() and numbered.exists())
    # the ratio trim at a tight limit (1 face / 1 body / 1 cloth, cap 2):
    # face + body survive, wardrobe is what the ratio costs
    trimmed = char.get_references(arch=S.MINIMAX_H3_ARCH, limit=2)
    trim_roles = [r.role for r in trimmed]
    gate("G-BATCH", ok and trim_roles == ["face", "body"],
         f"batch {size} x{len(cells)} order==prompt; limit=2 keeps "
         f"{trim_roles} (ratio 2:1:1 costs the wardrobe slot at cap 2)")
    RESULTS["G-BATCH"] = {"common_size": size, "order": order,
                          "limit2_kept": trim_roles,
                          "batch_png": str(batch_target),
                          "sheet_png": str(numbered),
                          "pass": ok and trim_roles == ["face", "body"]}


# =============================================================== G-DET
def g_determinism():
    from PIL import Image
    pairs = [(Image.open(p).convert("RGB"), role) for p, role in CHARS["elf"]["assets"]]
    d1 = S.encode_character(CHARS["elf"]["name"], CHARS["elf"]["description"], pairs)
    d2 = S.encode_character(CHARS["elf"]["name"], CHARS["elf"]["description"], pairs)
    members_ok = d1.members == d2.members
    j1, j2 = d1.manifest.to_json(), d2.manifest.to_json()
    diff = sorted(k for k in set(j1) | set(j2) if j1.get(k) != j2.get(k))
    volatile_ok = set(diff) <= {"char_id", "created_at", "modified_at"}
    # key order fixed -> serialised manifest bytes identical modulo the volatiles
    s1, s2 = S.charfile.dumps_manifest(d1.manifest), S.charfile.dumps_manifest(d2.manifest)
    stable_order = list(json.loads(s1)) == list(S.charfile._KEY_ORDER)
    # stale handle: replace the file under an open character -> CharChanged
    target = OUT / "det.char"
    S.write(target, d1)
    c = Character.open(target)
    d2.manifest.name = "Someone Else"
    S.write(target, d2)
    stale_raised = False
    try:
        c.get_description()
    except S.CharError as e:
        stale_raised = type(e).__name__ == "CharChanged" or "replaced" in str(e)
    # corrupt containers rejected honestly
    trunc = OUT / "truncated.char"
    trunc.write_bytes(target.read_bytes()[: len(target.read_bytes()) // 2])
    import zipfile
    badzip_ok = False
    try:
        Character.open(trunc)
    except S.CharError:
        badzip_ok = True
    no_manifest = OUT / "nomanifest.char"
    with zipfile.ZipFile(no_manifest, "w") as z:
        z.writestr("refs/000.png", b"not really")
    nomanifest_ok = False
    try:
        Character.open(no_manifest)
    except S.CharError as e:
        nomanifest_ok = "manifest" in str(e)
    gate("G-DET", members_ok and volatile_ok and stale_raised and badzip_ok
         and nomanifest_ok and stable_order,
         f"members identical; manifest delta == {diff}; stale+corrupt refused")
    RESULTS["G-DET"] = {"members_identical": members_ok, "manifest_delta": diff,
                        "stale_refused": stale_raised, "truncated_refused": badzip_ok,
                        "no_manifest_refused": nomanifest_ok,
                        "fixed_key_order": stable_order,
                        "pass": members_ok and volatile_ok and stale_raised
                        and badzip_ok and nomanifest_ok and stable_order}


# =============================================================== G-CLI
def g_cli():
    exe = HERE / ".venv" / "bin" / "omnichar-sdk"
    if not exe.exists():
        exe = Path(sys.executable).parent / "omnichar-sdk"
    inspect = subprocess.run([str(exe), "inspect", str(OUT / "elf.char"), "--json"],
                             capture_output=True, text=True)
    prompt = subprocess.run([str(exe), "prompt", str(OUT / "elf.char"),
                             "--style", "token"], capture_output=True, text=True)
    ok = inspect.returncode == 0 and prompt.returncode == 0
    rec = json.loads(inspect.stdout) if ok else {}
    lib = Character.open(OUT / "elf.char")
    ok = ok and rec.get("name") == "Quickstart Elf" \
        and rec.get("description") == lib.get_description() \
        and "<Picture 1>" in prompt.stdout
    gate("G-CLI", ok, "inspect --json round-trips the record; prompt matches "
                      "the library text (the any-language boundary)")
    RESULTS["G-CLI"] = {"inspect_name": rec.get("name"),
                        "prompt_head": prompt.stdout[:80] if ok else None,
                        "pass": ok}


# ================================================================== main
def main():
    print(f"[char-eval] omnichar-sdk {S.__version__} — CPU-only round-trip", flush=True)
    g_provenance()
    docs, paths = g_encode()
    g_order(paths)
    g_bytes(docs)
    g_h3(paths)
    g_slots(paths)
    g_prompt(paths)
    g_voice(docs, paths)
    g_batch(paths)
    g_determinism()
    g_cli()
    summary = {"sdk_version": S.__version__, "gates": RESULTS,
               "failed": FAILED, "all_pass": not FAILED}
    (OUT / "summary.json").write_text(json.dumps(summary, indent=1, default=str))
    print(f"[char-eval] {'ALL GATES PASS' if not FAILED else 'FAILED: ' + ', '.join(FAILED)}",
          flush=True)
    print(f"[char-eval] summary: {OUT / 'summary.json'}", flush=True)
    return 0 if not FAILED else 1


if __name__ == "__main__":
    sys.exit(main())
