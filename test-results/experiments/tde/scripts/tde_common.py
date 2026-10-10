"""tde_common — the imajev judge runner for the TDE (CPU-ONLY).

Loads the official imajev-4b serving path (mohit67890/imajev, Apache-2.0 —
scripts/torch_decision.py + src/vision_decision/*) on plain transformers CPU:

  Qwen3.5-4B @ 851bf6e (pinned, fp32) -> PEFT LoRA merged in fp32
  -> torch dynamic int8 (weight-only, language-model Linears) for CPU speed
  -> trained 256-code decision readout (fp32)
  -> 4 cyclic rotations averaged (combine_rotations, verbatim upstream)
  -> TemperatureCalibrator(calibration-rot4-modality.json), photo-only bucket
     when images are present and the state is empty (the serving config the
     shipped numbers were measured with; RELEASE-SPEC.md).

NO GPU anywhere, and no contact with the maintainer's llama.cpp router.
Model files: /home/agent/models/tde-dl/ (tde-fetch.sh, license-verified).
Run with the CANONICAL venv python (the setA precedent) plus this experiment's
pydeps dir (peft + accelerate, pure-python, installed via uv --no-deps):

  cd "<repo>/test-results/experiments/tde" && \
      /home/agent/comfyui/.venv/bin/python scripts/tde_1_ladder.py <stages>

Registered: docs/research/gpu-batch-ledger.md "THE TDE REGISTERED".
Flux: TDE (7tn1tvp).
"""
import json
import os
import sys
import time

import torch

TDE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DL = "/home/agent/models/tde-dl"
BACKBONE = os.path.join(DL, "Qwen3.5-4B")
ADAPTER = os.path.join(DL, "imajev-4b")
SRC = os.path.join(DL, "imajev-src", "imajev-main", "src")
PYDEPS = os.path.join(TDE, "pydeps")
if os.path.isdir(PYDEPS):
    sys.path.insert(0, PYDEPS)
sys.path.insert(0, SRC)

from vision_decision.scoring import (  # noqa: E402  (upstream, Apache-2.0)
    MAX_READOUT_CODES, cyclic_offsets, readout_codes, rotate, combine_rotations,
    compile_question, verified_label_ids, key as cand_key)
from vision_decision.contracts import BooleanField  # noqa: E402
from vision_decision.calibration import TemperatureCalibrator  # noqa: E402

DECISION_TAIL = "</think>\n\n"


class ImajevJudge:
    """The served decision function, verbatim semantics, CPU int8 arithmetic."""

    def __init__(self, rotations=4, calibrate=True, verbose=True):
        from transformers import AutoTokenizer, Qwen3_5ForConditionalGeneration
        t0 = time.time()
        self.rotations = rotations
        self.calibrate = calibrate
        self.device = "cpu"
        torch.set_num_threads(max(1, os.cpu_count() or 1))
        self.tokenizer = AutoTokenizer.from_pretrained(BACKBONE, local_files_only=True)
        if verbose:
            print(f"[load] tokenizer {time.time()-t0:.1f}s", flush=True)
        t1 = time.time()
        model = Qwen3_5ForConditionalGeneration.from_pretrained(
            BACKBONE, local_files_only=True, dtype=torch.float32)
        if verbose:
            print(f"[load] backbone fp32 {time.time()-t1:.1f}s", flush=True)
        t2 = time.time()
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, ADAPTER).merge_and_unload().eval()
        if verbose:
            print(f"[load] lora merged (fp32, rank64/a128) {time.time()-t2:.1f}s", flush=True)
        t3 = time.time()
        # int8: the TDE's CPU budget. Weight-only dynamic quant on the language
        # model's Linears; the vision tower + final norm + readout stay fp32.
        from torch.ao.quantization import quantize_dynamic
        lm = getattr(model.model, "language_model", None)
        if lm is not None:
            model.model.language_model = quantize_dynamic(lm, {torch.nn.Linear}, dtype=torch.qint8)
        else:  # structural fallback — quantize the whole multimodal stack
            model = quantize_dynamic(model, {torch.nn.Linear}, dtype=torch.qint8)
        self.model = model.eval()
        if verbose:
            print(f"[load] int8 dynamic quant {time.time()-t3:.1f}s", flush=True)
        t4 = time.time()
        self._enable_readout()
        self.calibrator = (TemperatureCalibrator.load(os.path.join(ADAPTER, "calibration-rot4-modality.json"))
                           if calibrate else None)
        if verbose:
            print(f"[load] readout+calibration {time.time()-t4:.1f}s "
                  f"(codes={self.codes}, calibration={bool(self.calibrator)})", flush=True)

    # -------------------------------------------------- readout (upstream logic)
    def _render(self, prompt, n_images):
        messages = [dict(role="user",
                         content=[dict(type="image")] * n_images + [dict(type="text", text=prompt)])]
        rendered = self.tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, tokenize=False, enable_thinking=False)
        if not rendered.endswith("<think>\n\n</think>\n\n"):
            raise ValueError("Unexpected Qwen non-thinking template boundary")
        return rendered

    def _enable_readout(self):
        from safetensors.torch import load_file
        readout = load_file(os.path.join(ADAPTER, "decision_readout.safetensors"))["weight"].float()
        manifest = json.load(open(os.path.join(ADAPTER, "decision_readout.json"), encoding="utf-8"))
        rows = readout.shape[0]
        self.codes = rows if rows in (255, 256) else MAX_READOUT_CODES
        codebook = readout_codes(self.tokenizer, self._render("", 0), self.codes, limit=self.codes)
        actual = [{"code": c, "token_id": i} for c, i in codebook]
        bound = manifest.get("codes")
        if (manifest.get("version") != 1 or not isinstance(bound, list) or len(bound) != rows
                or bound != actual[:rows] or len(actual) != self.codes):
            raise ValueError("Decision readout code/token binding does not match this tokenizer")
        self.codebook = codebook
        self.readout = torch.nn.Linear(readout.shape[1], self.codes, bias=False, dtype=torch.float32)
        self.readout.weight.data.copy_(readout)

    def _labels(self, count):
        if count > self.codes:
            raise ValueError(f"{count} candidates exceed the {self.codes}-code readout")
        return [c for c, _ in self.codebook[:count]]

    # ---------------------------------------------------------------- decide()
    @torch.inference_mode()
    def decide(self, images, question, yes_description=None, no_description=None,
               state=None, field=None):
        """images: [] | [PIL] | [PIL, PIL].  question: the noul statement.
        -> dict(raw_logits, scores, p_true, p_unknown, abstained, value,
                rotation_winners, rotation_agreement, seconds)

        Mirrors the server: compile -> rotations -> last-position hidden ->
        readout rows -> combine -> temperature-calibrate. The decision value is
        the combined-raw-logit argmax (tie -> lowest vocabulary id), exactly
        result_from_logits/combine_rotations upstream.
        """
        state = {} if state is None else state
        t0 = time.time()
        f = field or BooleanField(id="q", type="boolean", question=question,
                                  yes_description=yes_description, no_description=no_description)
        header, choices, texts = compile_question(f, state)
        n = len(choices)
        labels = self._labels(n)
        lookup = {tok: i for i, (_, tok) in enumerate(self.codebook)}
        offsets = cyclic_offsets(n, self.rotations)
        rendered_list, token_ids = [], None
        for off in offsets:
            lines = "\n".join(f"{lab}: {txt}" for lab, txt in zip(labels, rotate(texts, off)))
            rendered = self._render(header + lines, len(images))
            ids = verified_label_ids(self.tokenizer, rendered, labels)
            if token_ids is None:
                token_ids = ids
            rendered_list.append(rendered)
        from transformers import AutoProcessor
        if not hasattr(self, "_processor"):
            self._processor = AutoProcessor.from_pretrained(BACKBONE, local_files_only=True)
        proc = self._processor
        proc.tokenizer.padding_side = "left"
        inputs = proc(text=rendered_list, images=[images] * len(rendered_list) if images else None,
                      return_tensors="pt", padding=True)
        suffix = self.tokenizer.encode(DECISION_TAIL, add_special_tokens=False)
        rows = inputs["input_ids"]
        if not all(r[-len(suffix):].tolist() == suffix for r in rows):
            raise ValueError("Left padding did not align the decision positions")
        if rows.shape[-1] > 4096:
            raise ValueError(f"Request is {rows.shape[-1]} tokens (max 4096)")
        t1 = time.time()
        hidden = self.model.model(**inputs).last_hidden_state[:, -1].float()
        indices = [lookup[t] for t in token_ids]
        logits_rows = self.readout(hidden)[:, indices].tolist()
        passes = list(zip(offsets, logits_rows))
        result = combine_rotations(choices, passes)
        # candidate-index winners per rotation, original candidate order
        # (backend.score_questions' formula; n = options + unknown)
        winners = [(max(range(n), key=l.__getitem__) + off) % n for off, l in passes]
        final = max(range(n), key=lambda i: list(result.raw_logits.values())[i])
        cand_keys = [cand_key(c[0]) for c in choices]
        answer = {
            "question": question,
            "raw_logits": dict(result.raw_logits),
            "abstained": result.status == "abstained",
            "value": result.value,
            "rotation_winners": [cand_keys[w] for w in winners],
            "rotation_agreement": sum(w == final for w in winners) / len(winners),
            "forward_seconds": round(time.time() - t1, 2),
            "total_seconds": round(time.time() - t0, 2),
        }
        if self.calibrator:
            cal = self.calibrator.calibrate_result(
                result, "boolean", n - 1, image=bool(images),
                photo_only=bool(images) and not state)
            answer["scores"] = dict(cal.scores)
            answer["p_true"] = cal.scores.get("true")
            answer["p_unknown"] = cal.scores.get("__unknown__")
            answer["calibration_version"] = cal.calibration_version
        else:
            answer["scores"] = dict(result.scores)
            answer["p_true"] = result.scores.get("true")
            answer["p_unknown"] = result.scores.get("__unknown__")
        answer["selected_key"] = cand_keys[final]
        return answer
