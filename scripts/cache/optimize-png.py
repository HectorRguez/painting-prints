"""Losslessly compact monochrome PNG previews (optional; requires Pillow).

python scripts/cache/optimize-png.py cityscapes buildings
"""
import sys
from pathlib import Path
from PIL import Image, ImageChops

root = Path(__file__).resolve().parents[2] / 'public' / 'cache'
for style in sys.argv[1:]:
    if not style.isalpha():
        raise ValueError('Expected a generator directory name')
    for path in sorted((root / style).glob('*.png')):
        original = Image.open(path).convert('RGBA')
        gray = original.convert('LA')
        if ImageChops.difference(original, gray.convert('RGBA')).getbbox(alpha_only=False):
            raise ValueError(f'{path} contains colour; leaving it intact')
        temporary = path.with_suffix('.optimized.png')
        gray.save(temporary, optimize=True)
        if Image.open(temporary).convert('RGBA').tobytes() != original.tobytes():
            temporary.unlink()
            raise ValueError(f'{path}: PNG round trip changed pixels')
        if temporary.stat().st_size < path.stat().st_size:
            temporary.replace(path)
        else:
            temporary.unlink()
    print(style, flush=True)
