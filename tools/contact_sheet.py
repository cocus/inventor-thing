"""Draw every bitmap of a PAG file on one PNG, labelled with chunk numbers.

usage: python contact_sheet.py GAME_DIR PAGE OUT.png [MAX_SIZE]
  e.g. python contact_sheet.py ../invention 60/BD6000.PAG sheet.png 300

Images larger than MAX_SIZE (default 200) in either dimension are skipped.
The number above each image is its chunk index; the graphic slot used by the
scripts is the image's position among the page's graphic chunks.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from invstudio import read_bitmap, walk_pag, write_png  # noqa: E402

DIGITS = {"0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
          "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001001001001",
          "8": "111101111101111", "9": "111101111001111"}


def sheet(game, page, out, maxdim=200, width=1100):
    data = open(os.path.join(game, page), "rb").read()
    items = []
    for idx, (tag, s, e) in enumerate(walk_pag(data)):
        if tag != 0x20:
            continue
        bm = read_bitmap(data, s)
        if 0 < bm.width <= maxdim and 0 < bm.height <= maxdim:
            items.append((idx, bm))
    x = y = rowh = 0
    pos = []
    for _, bm in items:
        if x + bm.width + 8 > width:
            x, y, rowh = 0, y + rowh + 14, 0
        pos.append((x, y))
        x += bm.width + 8
        rowh = max(rowh, bm.height)
    height = y + rowh + 14
    img = bytearray(b"\xff\x80\xff\xff" * (width * height))

    def put(px, py, rgb):
        if 0 <= px < width and 0 <= py < height:
            o = (py * width + px) * 4
            img[o:o + 4] = bytes(rgb) + b"\xff"

    for (idx, bm), (px, py) in zip(items, pos):
        for j in range(bm.height):
            for i in range(bm.width):
                p = bm.pixels[j * bm.width + i]
                put(px + i, py + 12 + j, bm.palette[p] if p < len(bm.palette) else (255, 0, 255))
        for k, ch in enumerate(str(idx)):
            for b in range(15):
                if DIGITS[ch][b] == "1":
                    for dy in range(2):
                        for dx in range(2):
                            put(px + k * 8 + (b % 3) * 2 + dx, py + (b // 3) * 2 + dy, (0, 0, 0))
    write_png(out, width, height, img)
    for idx, bm in items:
        print(idx, bm.width, bm.height, bm.x, bm.y, hex(bm.kind), len(bm.palette))


if __name__ == "__main__":
    sheet(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 200)
