"""Thumbnail the first full-screen (640x480) background of every PAG file.

usage: python page_thumbnails.py GAME_DIR OUT.png

Handy for finding which page is which screen. Each thumbnail is labelled with
the page number (BDnnnn).
"""
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contact_sheet import DIGITS  # noqa: E402
from invstudio import read_bitmap, walk_pag, write_png  # noqa: E402


def thumbnails(game, out, scale=5, cols=8):
    thumbs = []
    pages = sorted(glob.glob(os.path.join(game, "*", "*.PAG")), key=lambda p: int(os.path.basename(p)[2:-4]))
    for path in pages:
        data = open(path, "rb").read()
        for tag, s, e in walk_pag(data):
            if tag == 0x20:
                bm = read_bitmap(data, s)
                if (bm.width, bm.height) == (640, 480):
                    thumbs.append((os.path.basename(path)[2:-4], bm))
                    break
    tw, th = 640 // scale, 480 // scale
    rows = (len(thumbs) + cols - 1) // cols
    width, height = cols * (tw + 4), rows * (th + 14)
    img = bytearray(width * height * 4)
    for k, (name, bm) in enumerate(thumbs):
        x0, y0 = (k % cols) * (tw + 4), (k // cols) * (th + 14)
        for j in range(th):
            for i in range(tw):
                c = bm.palette[bm.pixels[(j * scale) * 640 + i * scale]]
                o = ((y0 + 12 + j) * width + x0 + i) * 4
                img[o:o + 4] = bytes(c) + b"\xff"
        for n, ch in enumerate(name):
            for t in range(15):
                if DIGITS[ch][t] == "1":
                    o = ((y0 + (t // 3) * 2) * width + x0 + n * 8 + (t % 3) * 2) * 4
                    for d in (0, 4, width * 4, width * 4 + 4):
                        img[o + d:o + d + 4] = b"\xff\xff\x40\xff"
    write_png(out, width, height, img)
    print(len(thumbs), "pages:", " ".join(n for n, _ in thumbs))


if __name__ == "__main__":
    thumbnails(sys.argv[1], sys.argv[2])
