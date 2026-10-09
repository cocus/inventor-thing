"""Export the maze-activity graphics to PNG + a JSON manifest.

usage: python export_assets.py <game_dir> <out_dir>
"""
import json
import os
import sys

from invstudio import (TAG_SPRITE, indexed_to_rgba, read_bitmap, read_sprite,
                       walk_pag, write_png)

PAGES = ["60/BD6000.PAG", "60/BD6010.PAG", "60/BD6021.PAG", "104/BD10400.PAG"]
SPRITES = ["60/BD6020.PFL"]


def bitmap_rgba(bm, transparent):
    out = bytearray(bm.width * bm.height * 4)
    for i, p in enumerate(bm.pixels):
        if transparent is not None and p == transparent:
            continue
        r, g, b = bm.palette[p] if p < len(bm.palette) else (255, 0, 255)
        out[i * 4:i * 4 + 4] = bytes((r, g, b, 255))
    return out


def main(game, out):
    os.makedirs(out, exist_ok=True)
    manifest = {}
    for page in PAGES:
        data = open(os.path.join(game, page), "rb").read()
        name = os.path.basename(page)[:-4]
        items = []
        for idx, (tag, s, e) in enumerate(walk_pag(data)):
            if tag == 0x20:
                bm = read_bitmap(data, s)
                if bm.width * bm.height == 0:
                    continue
                fn = "%s_%03d.png" % (name, idx)
                # Opaque version and a version keyed on palette index 0.
                write_png(os.path.join(out, fn), bm.width, bm.height, bitmap_rgba(bm, None))
                write_png(os.path.join(out, "t_" + fn), bm.width, bm.height, bitmap_rgba(bm, 0))
                items.append({"chunk": idx, "file": fn, "w": bm.width, "h": bm.height,
                              "x": bm.x, "y": bm.y, "kind": bm.kind,
                              "key0": bm.palette[0] if bm.palette else None})
            elif tag == TAG_SPRITE:
                pal, frames, _, _ = read_sprite(data, s)
                files = []
                for fi, f in enumerate(frames):
                    fn = "%s_%03d_%03d.png" % (name, idx, fi)
                    write_png(os.path.join(out, fn), f.width, f.height, indexed_to_rgba(f.pixels, pal))
                    files.append(fn)
                items.append({"chunk": idx, "sprite": files, "w": frames[0].width, "h": frames[0].height})
        manifest[name] = items
    for spr in SPRITES:
        data = open(os.path.join(game, spr), "rb").read()
        name = os.path.basename(spr)[:-4]
        pal, frames, _, _ = read_sprite(data)
        files = []
        for fi, f in enumerate(frames):
            fn = "%s_%03d.png" % (name, fi)
            write_png(os.path.join(out, fn), f.width, f.height, indexed_to_rgba(f.pixels, pal))
            files.append(fn)
        manifest[name] = {"frames": files, "w": frames[0].width, "h": frames[0].height}
    with open(os.path.join(out, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
