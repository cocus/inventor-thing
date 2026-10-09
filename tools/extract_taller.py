"""Extract the machine workshop tables from 70/BD7000.PAG.

usage: python extract_taller.py 70/BD7000.PAG taller_machines.json

Writes component/connection names and, per machine, the recipe (component
squares and connection spots), pre-placed pieces, sounds, parts graphics page
and working animation. Table addresses are documented in docs/TALLER_RULES.md.
Feed the result to gen_taller_data.py to build web/js/taller_data.js.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pagvm import Reader, load_script  # noqa: E402

# Working animation page and frame count per machine (seq150, BD7000@6628..).
ANIM = {0: ("BD7011", 59), 1: ("BD7004", 66), 2: ("BD7008", 58), 3: ("BD7009", 60), 4: ("BD7013", 59),
        5: ("BD7012", 59), 6: ("BD7010", 60), 7: ("BD7005", 56), 8: ("BD7007", 58), 9: ("BD7001", 64),
        10: ("BD7006", 39)}


def extract(path):
    data = open(path, "rb").read()
    _, _, code = load_script(data)

    def s(a):
        return Reader(code, a).string().strip('"')

    comp = [s(code[1098 + i]) for i in range(33)]
    conn = [s(code[1172 + i]) for i in range(7)]
    mach = [s(code[1229 + i]) for i in range(11)]
    out = []
    for m in range(11):
        ca, la = code[3817 + m], code[4114 + m]
        comps = [{"pos": i, "r": i // 5, "c": i % 5, "iconX": 211 + 80 * (i % 5), "iconY": 141 + 80 * (i // 5),
                  "id": code[ca + i], "name": comp[code[ca + i]]} for i in range(15) if code[ca + i] != -1]
        links = []
        for i in range(25):
            v = code[la + i]
            if v == -1:
                continue
            l5, l7 = i // 5, i % 5
            kind = "h" if l5 % 2 == 0 else "v"
            links.append({"idx": i, "l5": l5, "l7": l7, "kind": kind,
                          "iconX": (256 if kind == "h" else 216) + 80 * l7, "iconY": 143 + 40 * l5,
                          "type": v, "typeName": conn[v]})
        given = []
        pp = code[8439 + m]
        if pp:
            for k in range(code[pp]):
                t, a, b, v = code[pp + 1 + 4 * k:pp + 5 + 4 * k]
                given.append({"kind": "comp" if t == 1 else "link", "row": a, "col": b, "value": v})
        cue, snd = code[4295 + m], code[4309 + m]
        cues = [[code[cue + 1 + k], code[snd + k]] for k in range(code[cue])]
        pl, pc = code[11044 + m], code[10951 + m]
        out.append({"id": m, "name": mach[m], "intro": code[4195 + m] if m < 10 else None,
                    "fail": code[3601 + m], "powerPos": code[3828 + m],
                    "partsPage": code[10940 + m], "partsGfx": [code[pl + k] for k in range(pc)],
                    "anim": ANIM[m][0], "animFrames": ANIM[m][1], "cues": cues,
                    "components": comps, "links": links, "given": given})
    return {"components": comp, "connections": conn, "machines": out}


if __name__ == "__main__":
    result = extract(sys.argv[1])
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    for o in result["machines"]:
        print(o["id"], o["name"], len(o["components"]), "components,", len(o["links"]), "links")
