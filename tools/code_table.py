"""Print the data tokens of a disassembly listing by token address.

usage: python code_table.py LISTING.txt ADDRESS COUNT [WIDTH]

The listings written by pagvm.py show data as ".data" lines; this collects
them so a table such as code[5181..5265] can be read directly.
"""
import re
import sys


def load(path):
    tokens = {}
    for line in open(path, encoding="utf-8", errors="replace"):
        m = re.match(r"\s*~?\s*(\d+): \.data (.*)$", line)
        if m:
            addr = int(m.group(1))
            for i, v in enumerate(m.group(2).split()):
                tokens[addr + i] = int(v)
    return tokens


if __name__ == "__main__":
    d = load(sys.argv[1])
    a, n = int(sys.argv[2]), int(sys.argv[3])
    w = int(sys.argv[4]) if len(sys.argv) > 4 else 16
    for r in range(a, a + n, w):
        print(r, [d.get(i) for i in range(r, min(r + w, a + n))])
