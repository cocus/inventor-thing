"""List the chunks of a PAG file (useful for graphics-only pages).

usage: python list_chunks.py FILE.PAG [out.txt]

Each graphic chunk gets its slot number: graphic slot N is the N-th graphic
chunk of the page, which is how the page scripts refer to images.
"""
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from invstudio import read_bitmap, walk_pag  # noqa: E402

GRAPHIC = {0x20, 21, 22, 23, 24, 39, 80}


def listing(path):
    data = open(path, "rb").read()
    lines = ["; %s: chunk listing" % path, ";"]
    slot = 0
    for idx, (tag, s, e) in enumerate(walk_pag(data)):
        if tag == 0x20:
            slot += 1
            bm = read_bitmap(data, s)
            desc = "slot %4d  bitmap %dx%d at (%d,%d) pal=%d" % (slot, bm.width, bm.height, bm.x, bm.y, len(bm.palette))
        elif tag == 80:
            page, skip, cnt = struct.unpack_from("<HHH", data, s)
            desc = "include BD%d.PAG skip=%d count=%d -> slots %d..%d" % (page, skip, cnt, slot + 1, slot + cnt)
            slot += cnt
        elif tag in GRAPHIC or tag == 0xF315:
            slot += 1
            desc = "slot %4d  graphic tag 0x%x (%d bytes)" % (slot, tag, (e or s) - s)
        elif tag == 0x38:
            desc = "hotspot record " + data[s:e].hex()
        elif tag in (0x36, 0x37):
            desc = "script (%d bytes)" % (e - s)
        else:
            desc = "tag 0x%x, %d bytes" % (tag, (e or s) - s)
        lines.append("chunk #%-3d %s" % (idx, desc))
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    text = listing(sys.argv[1])
    if len(sys.argv) > 2:
        open(sys.argv[2], "w").write(text)
    else:
        sys.stdout.write(text)
