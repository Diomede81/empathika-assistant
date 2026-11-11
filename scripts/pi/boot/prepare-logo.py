#!/usr/bin/env python3
"""Makes any picture fit for the boot screen:  prepare-logo.py IN.png OUT.png

The boot screen draws the logo in the first seconds of start-up, with very little memory and a
dark background, on a round 720 px screen. So: the empty margins are cropped (a logo exported on
an A4 page is mostly empty), it is resized to fit, and a logo that is too dark to see on the dark
screen gets a soft white plate behind it. Prints one line saying what it did.
"""
import sys
from PIL import Image, ImageChops, ImageDraw

MAX = 440          # the logo's longest side on the 720 px screen
DARK = 70          # average brightness (0-255) below which it would not show on the dark screen


def content_box(im):
    """Where the picture actually is: the non-transparent part, or the part unlike the corner colour."""
    alpha = im.getchannel('A')
    if alpha.getextrema()[0] < 250:                      # it has transparency
        return alpha.point(lambda a: 255 if a > 12 else 0).getbbox()
    corner = im.getpixel((0, 0))
    diff = ImageChops.difference(im.convert('RGB'), Image.new('RGB', im.size, corner[:3])).convert('L')
    return diff.point(lambda d: 255 if d > 18 else 0).getbbox()


def main(src, dst):
    Image.MAX_IMAGE_PIXELS = 200_000_000
    im = Image.open(src).convert('RGBA')
    did = [f'{im.width}x{im.height}']
    box = content_box(im)
    if box and (box[2] - box[0] < im.width * 0.97 or box[3] - box[1] < im.height * 0.97):
        im = im.crop(box)
        did.append(f'margins cropped to {im.width}x{im.height}')
    if max(im.size) > MAX:
        k = MAX / max(im.size)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        did.append(f'resized to {im.width}x{im.height}')
    # How bright is what will be seen (weighted by how opaque each pixel is)?
    small = im.resize((64, max(1, round(64 * im.height / im.width))))
    raw = small.tobytes()
    px = [raw[i:i + 4] for i in range(0, len(raw), 4)]
    weight = sum(p[3] for p in px) or 1
    bright = sum((0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) * p[3] for p in px) / weight
    if bright < DARK:
        pad = round(max(im.size) * 0.14)
        plate = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
        ImageDraw.Draw(plate).rounded_rectangle([0, 0, plate.width - 1, plate.height - 1], radius=round(min(plate.size) * 0.22), fill=(250, 250, 252, 255))
        plate.alpha_composite(im, (pad, pad))
        im = plate
        if max(im.size) > MAX:
            k = MAX / max(im.size)
            im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        did.append('dark logo: put on a light plate so it shows')
    im.save(dst, 'PNG', optimize=True)
    print('; '.join(did) + f'; saved {im.width}x{im.height}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    try:
        main(sys.argv[1], sys.argv[2])
    except Exception as e:  # the setup falls back to the picture as it is
        sys.exit(f'could not prepare the logo: {e}')
