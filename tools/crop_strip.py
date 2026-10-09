"""Crop the same box out of several PNG screenshots and tile them side by side.
usage: python crop_strip.py out.png x y w h in1.png in2.png ...
"""
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from invstudio import write_png  # noqa: E402


def read_png(path):
    data = open(path, "rb").read()
    pos = 8
    idat = b""
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            w, h, depth, ctype = struct.unpack(">IIBB", body[:10])
        elif kind == b"IDAT":
            idat += body
        pos += 12 + n
    bpp = {6: 4, 2: 3}[ctype]
    raw = zlib.decompress(idat)
    stride = w * bpp
    rows = []
    prev = bytearray(stride)
    p = 0
    for _ in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        rows.append(line)
        prev = line
    return w, h, bpp, rows


def main():
    out, x, y, w, h = sys.argv[1], *map(int, sys.argv[2:6])
    files = sys.argv[6:]
    W = (w + 4) * len(files)
    img = bytearray(W * h * 4)
    for k, f in enumerate(files):
        _, _, bpp, rows = read_png(f)
        for j in range(h):
            row = rows[y + j]
            for i in range(w):
                px = row[(x + i) * bpp:(x + i) * bpp + 3]
                o = (j * W + k * (w + 4) + i) * 4
                img[o:o + 4] = bytes(px) + b"\xff"
    write_png(out, W, h, img)


main()
