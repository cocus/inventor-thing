"""Build a small ISO 9660 image from some folders of the game, for testing
the web app's CD-image loader without the full 500 MB image.

usage: python make_test_iso.py GAME_DIR OUT.iso FOLDER [FOLDER ...]
  e.g. python make_test_iso.py ../invention test.iso 40 60 100 104

Only what the loader needs is written: a primary volume descriptor, the root
directory, one level of subdirectories and the files (names get ";1").
"""
import os
import struct
import sys

SECTOR = 2048


def both16(v):
    return struct.pack("<H", v) + struct.pack(">H", v)


def both32(v):
    return struct.pack("<I", v) + struct.pack(">I", v)


def record(name, lba, size, is_dir):
    n = len(name)
    rec = bytes([0, 0]) + both32(lba) + both32(size) + bytes(7) + bytes([2 if is_dir else 0, 0, 0]) + both16(1)
    rec += bytes([n]) + name
    if len(rec) % 2:
        rec += b"\0"
    return bytes([len(rec)]) + rec[1:]


def directory(entries, self_lba, parent_lba, size):
    data = record(b"\0", self_lba, size, True) + record(b"\x01", parent_lba, size, True)
    for e in entries:
        if (len(data) % SECTOR) + len(e) > SECTOR:
            data += bytes(SECTOR - len(data) % SECTOR)
        data += e
    return data


def build(game, out, folders):
    lba = 18  # 16 = PVD, 17 = terminator
    dirs = []
    for folder in folders:
        files = sorted(f for f in os.listdir(os.path.join(game, folder)) if os.path.isfile(os.path.join(game, folder, f)))
        dirs.append((folder, files))
    # Directory extents (sized generously), then file extents.
    dir_sectors = {folder: 1 + (len(files) * 48) // SECTOR + 1 for folder, files in dirs}
    root_lba = lba
    lba += 1
    dir_lba = {}
    for folder, _ in dirs:
        dir_lba[folder] = lba
        lba += dir_sectors[folder]
    file_lba = {}
    for folder, files in dirs:
        for f in files:
            size = os.path.getsize(os.path.join(game, folder, f))
            file_lba[(folder, f)] = (lba, size)
            lba += (size + SECTOR - 1) // SECTOR or 1
    image = bytearray(lba * SECTOR)
    root_entries = [record(folder.encode(), dir_lba[folder], dir_sectors[folder] * SECTOR, True) for folder, _ in dirs]
    image[root_lba * SECTOR:(root_lba + 1) * SECTOR] = directory(root_entries, root_lba, root_lba, SECTOR).ljust(SECTOR, b"\0")
    for folder, files in dirs:
        entries = [record((f + ";1").encode(), *file_lba[(folder, f)], False) for f in files]
        start = dir_lba[folder] * SECTOR
        data = directory(entries, dir_lba[folder], root_lba, dir_sectors[folder] * SECTOR)
        image[start:start + len(data)] = data
        for f in files:
            flba, size = file_lba[(folder, f)]
            image[flba * SECTOR:flba * SECTOR + size] = open(os.path.join(game, folder, f), "rb").read()
    pvd = bytearray(SECTOR)
    pvd[0:6] = b"\x01CD001"
    pvd[6] = 1
    pvd[40:72] = b"TEST".ljust(32)
    pvd[80:88] = both32(lba)
    pvd[128:132] = both16(SECTOR)
    pvd[156:190] = record(b"\0", root_lba, SECTOR, True)
    image[16 * SECTOR:17 * SECTOR] = pvd
    image[17 * SECTOR:17 * SECTOR + 7] = b"\xffCD001\x01"
    with open(out, "wb") as f:
        f.write(image)
    print("wrote", out, len(image), "bytes")


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2], sys.argv[3:])
