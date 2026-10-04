#!/usr/bin/env python3
"""Build blind, lossless presentation-frame strips for a file:// review set.
Requires local ffmpeg/ffprobe, never contacts an engine or reads pairs/.key.
Run after writing pairs: python3 scripts/gpu-review/extract-review-frames.py gpu-review/setA
"""
import argparse
import hashlib
import json
import subprocess
import tempfile
from fractions import Fraction
from pathlib import Path

STRIP = 12


def probe(path):
    result = subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_streams', '-show_frames', '-show_entries',
        'stream=width,height,avg_frame_rate:frame=best_effort_timestamp_time',
        '-of', 'json', str(path)], text=True)
    data = json.loads(result)
    stream = data['streams'][0]
    pts = [float(f['best_effort_timestamp_time']) for f in data['frames']]
    fps = float(Fraction(stream['avg_frame_rate']))
    if not pts or fps <= 0:
        raise ValueError(f'{path}: missing presentation timestamps')
    pts = [t - pts[0] for t in pts]
    if any(abs(t - i / fps) > .00001 for i, t in enumerate(pts)):
        raise ValueError(f'{path}: variable frame rate is not supported; do not resample silently')
    return stream['width'], stream['height'], fps, pts


def generate(root):
    manifest = {'version': 1, 'strip': STRIP, 'pairs': {}}
    output = root / 'frames'
    output.mkdir(exist_ok=True)
    for left in sorted((root / 'pairs').glob('p[0-9][0-9]_L.mp4')):
        pid = left.stem[:-2]
        right = left.with_name(pid + '_R.mp4')
        info = [probe(p) for p in (left, right)]
        if info[0] != info[1]:
            raise ValueError(f'{pid}: sides must have equal dimensions, FPS, count and PTS')
        width, height, fps, pts = info[0]
        pair = {'width': width, 'height': height, 'fps': fps, 'count': len(pts), 'pts': pts}
        for side, path in zip(('L', 'R'), (left, right)):
            with tempfile.TemporaryDirectory(prefix='review-frames-') as tmp:
                # Decode in presentation order; no input seeking, FPS conversion or lossy encoding.
                subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-an',
                                '-vf', f'format=bgra,tile=1x{STRIP}', '-fps_mode', 'passthrough',
                                '-c:v', 'libwebp', '-lossless', '1', '-compression_level', '4',
                                '-start_number', '0', str(Path(tmp) / '%06d.webp')], check=True)
                files = sorted(Path(tmp).glob('*.webp'))
                if len(files) != (len(pts) + STRIP - 1) // STRIP:
                    raise ValueError(f'{path}: unexpected strip count')
                paths = []
                for file in files:
                    blob = file.read_bytes()
                    name = hashlib.sha256(blob).hexdigest() + '.webp'
                    target = output / name
                    if not target.exists():
                        target.write_bytes(blob)
                    paths.append('frames/' + name)
                pair[side] = paths
        manifest['pairs'][pid] = pair
        print(f'{pid}: {len(pts)} matched frames, {fps:g} fps', flush=True)
    # Replace manifest only after every pair passes validation; old assets are retained.
    text = '// Generated lossless frame strips; blind L/R only.\nwindow.REVIEW_FRAMES = ' + json.dumps(manifest, separators=(',', ':')) + ';\n'
    (root / 'pairs-frames.js').write_text(text)
    print(f'{root}: {sum(p.stat().st_size for p in output.glob("*.webp")) / 1048576:.1f} MiB of deduplicated lossless strips')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('set_directory', type=Path)
    generate(parser.parse_args().set_directory)
