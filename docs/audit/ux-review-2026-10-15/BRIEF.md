# The adversarial UX review — blind charter (2026-10-15)

## What this app wants to be (the whole context you get)

A local-first personal studio for MiniMax H3 video (and stills) through ComfyUI — one small server on the creator's machine, the app in any browser. The working surface is an INFINITE CANVAS: you describe a shot, it generates, the clip lands on the canvas as a node; you CHAIN from there — continue the clip from its last frame, fork a take to try variations, bind REFERENCE images to control identity and subject; prompts and settings live on each chain. Surfaces: the canvas (the main app), a datasets manager, an images workbench, a gallery. Modularity is a stated value: tools should snap in and out.

The user: a solo technical creator on their own box. Impatient. The bar: fresh clone → connected engine → first real generation back → chained into a second generation, in minutes, without reading anything.

## Your job

An adversarial, first-principles critique of the EXPERIENCE. The current design is not evidence of the right design — maybe the correct flow is three steps and this is eleven; maybe something basic doesn't exist; maybe a default is simply wrong. Judge what SHOULD be, then measure the gap.

Name concretely, with evidence:
- OVERCOMPLICATED — things that should be one gesture and aren't
- MISSING — things a working creator would reach for and not find
- WRONG DEFAULTS / labels / jargon — anything addressed to the machine instead of the human
- DEAD ENDS — flows that strand you, surfaces that promise and don't deliver
- DELIGHT KILLERS — latency without honesty, waits without progress, moments that break flow

## Method

- Drive the REAL app in a real browser (chromium at /usr/bin/chromium; Playwright is installed in the clone; screenshot liberally — your report cites screens).
- The engine is REAL and the GPU is LIVE: generations actually render. Prefer fast tiers when judging UX; do at most 2-3 real renders; RECORD WALL TIMES (they are UX data). The card is shared — be patient if a queue is busy.
- BLIND MEANS BLIND: do NOT read docs/audit/, docs/research/, .superpowers/, CLAUDE.md, or any project history — they carry conclusions you must form yourself. Read code ONLY to verify a behavior you observed.
- Deliverable: a ranked punch list (P0 experience-breakers → P2 polish), each item = what's wrong / why it matters to the user / the evidence (screen or step) / what the simple version would be. Be specific enough that a designer could act without asking you anything.

## The harness (already running — leave it running when you finish)

- YOUR app instance (a fresh, never-configured home): see your dispatch for the URL.
- The real engine (CUDA, renders complete): http://127.0.0.1:17651 — you connect the app to it the way a user would.
- A controllable fake engine (accepts prompts, completes instantly, can be told to fail): http://127.0.0.1:17652 — use only if you deliberately want a failure mode.
- If your app instance dies, restart it exactly: cd /home/agent/tmp-gpu/monoka-fresh && MONOKA_HOME=<your home> MONOKA_LAN_PORT=<your port> MONOKA_NO_HTTPS=1 node dist-server/server/index.js (background, log to a file).
