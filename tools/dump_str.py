"""Print STR text records (cp1252) as "number|text", one per line.

usage: python dump_str.py GAME_DIR FIRST LAST

STR files live in the folder number/100, e.g. 71/BD7100.STR. Their padding
control characters are stripped.
"""
import os
import re
import sys


def read_str(game, num):
    path = os.path.join(game, str(num // 100), "BD%d.STR" % num)
    if not os.path.exists(path):
        return None
    text = open(path, "rb").read().decode("cp1252")
    return re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f]+", " ", text)).strip()


if __name__ == "__main__":
    game, first, last = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    for n in range(first, last + 1):
        t = read_str(game, n)
        if t is not None:
            print("%d|%s" % (n, t))
