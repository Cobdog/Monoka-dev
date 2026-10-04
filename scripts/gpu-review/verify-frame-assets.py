#!/usr/bin/env python3
"""Verify every generated strip pixel against sequential FFmpeg RGB decode."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path
root = Path(sys.argv[1])
manifest = json.loads((root / 'pairs-frames.js').read_text().split('window.REVIEW_FRAMES = ', 1)[1].rstrip(';\n'))
for pid, pair in manifest['pairs'].items():
    counts = {}
    for side in ('L', 'R'):
        process = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', str(root / 'pairs' / f'{pid}_{side}.mp4'), '-an', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-fps_mode', 'passthrough', '-'], stdout=subprocess.PIPE)
        size = pair['width'] * pair['height'] * 4
        n = 0
        hashes = []
        for path in pair[side]:
            strip = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(root / path), '-f', 'rawvideo', '-pix_fmt', 'bgra', '-'])
            for row in range(min(manifest['strip'], pair['count']-n)):
                expected = process.stdout.read(size)
                actual = strip[row*size:(row+1)*size]
                assert len(expected) == size and actual == expected, (pid, side, n)
                hashes.append(hashlib.sha256(actual).hexdigest())
                n += 1
        assert not process.stdout.read(1) and process.wait() == 0
        assert n == pair['count']
        counts[side] = hashes
    differences = [i for i, (l,r) in enumerate(zip(counts['L'], counts['R'])) if l != r]
    if pid == 'p07':
        assert not differences, 'p07 must be a pixel-identical null'
    print(f'{pid}: {pair["count"]} frames/side pixel-exact; {len(differences)} L/R differences', flush=True)
