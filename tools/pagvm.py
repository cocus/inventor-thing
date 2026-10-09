"""Disassembler for the script VM of Invention Studio (USINV3R.EXE) PAG files.

The Win32 engine executes the tag 0x36 chunk (32-bit tokens).  Tag 0x37 is the
same program with 16-bit tokens (and one char per token in strings) and is
skipped by the 32-bit loader.

Usage:  python pagvm.py FILE.PAG [-o out.txt]

See docs/VM_NOTES.md for the encoding.  Handler addresses refer to
USINV3R.EXE.
"""
import struct
import sys

# ------------------------------------------------------------------ loading


def load_script(data):
    """Return (start_seq, table, code) from the 0x36 chunk of a PAG file.
    table[i] (i = 1..n) is the code index (in tokens) of sequence i, 0 = none.
    code is a list of signed int32 tokens."""
    pos = 0
    while pos + 2 <= len(data):
        tag = struct.unpack_from("<H", data, pos)[0]
        if tag in (0x36, 0x37):
            el = 4 if tag == 0x36 else 2
            a, n = struct.unpack_from("<HH", data, pos + 2)
            p = pos + 6
            tbl = list(struct.unpack_from("<%d%s" % (n, "i" if el == 4 else "h"), data, p))
            p += el * n
            m = struct.unpack_from("<H", data, p)[0]
            if tag == 0x36:
                code = list(struct.unpack_from("<%di" % (m // 4), data, p + 2))
                return a, [0] + tbl, code
            pos = p + 2 + m + 2
        elif tag == 0x38:
            pos += 19
        else:
            break
    raise ValueError("no 0x36 chunk found")


GFX_TAGS = (0x20, 21, 22, 23, 24, 0x4D42, 0x4952, 0xF315, 0xF515, 39)


def slot_map(data):
    """Graphic slot numbers as assigned by the page loader (sub_419CD0):
    every graphic chunk takes the next slot, starting at 1.  Returns a list of
    (slot, chunk_index, tag, description)."""
    try:
        import invstudio
    except ImportError:
        return []
    out = []
    slot = 0
    for i, (tag, s, e) in enumerate(invstudio.walk_pag(data)):
        if tag not in GFX_TAGS:
            continue
        slot += 1
        desc = ""
        try:
            if tag == 0x20:
                bm = invstudio.read_bitmap(data, s)
                desc = "bitmap %dx%d at (%d,%d)" % (bm.width, bm.height, bm.x, bm.y)
            elif tag == 0xF315:
                pal, frames, _, _ = invstudio.read_sprite(data, s)
                f = frames[0] if frames else None
                desc = "sprite %d frames" % len(frames) + (
                    ", %dx%d at (%d,%d)" % (f.width, f.height, f.x, f.y) if f else "")
            elif tag == 39:
                desc = "empty slot"
            else:
                desc = "tag 0x%x" % tag
        except Exception as ex:
            desc = "tag 0x%x (%s)" % (tag, ex)
        out.append((slot, i, tag, desc))
    return out


# ------------------------------------------------------------------ naming

GLOBAL_BASE = -31999      # g[tok - GLOBAL_BASE], tok in -31999..-31000
LOCAL_BASE = -30100       # l[tok - LOCAL_BASE],  tok in -30199..-30001

# Object (sprite/thread, 0xB4 bytes) fields reachable as "locals":
# l[k] lives at object + 116 + 4*k.
FIELD = {
    -29: "next", -28: "parent", -27: "ownerp", -26: "seqno", -25: "x", -24: "y",
    -23: "vx", -22: "vy", -21: "clipL", -20: "clipT", -19: "clipR", -18: "clipB",
    -17: "layer", -16: "frame", -15: "delay", -14: "time", -13: "mark", -12: "pc",
    -11: "stack", -5: "hotspot", -4: "user4", -3: "res", -2: "fracx", -1: "fracy",
    8: "ink", 10: "sigcount", 11: "onframe", 12: "dragflags", 13: "htable",
}

FILETYPES = ["PAG", "WAV", "MSF", "BMP", "GVD", "EXE", "DLL", "REC", "TSK", "STR",
             "PAG", "PFL", "AVI", "CWV", "WAV"]


def lname(k):
    if 0 <= k <= 7:
        return "l%d" % k
    return FIELD.get(k, "l[%d]" % k)


class E:
    """Decoded expression: text + literal value (None if not constant)."""
    __slots__ = ("s", "v", "prec", "k")

    def __init__(self, s, v=None, prec=100):
        self.s, self.v, self.prec = s, v, prec
        self.k = v if v is not None else 0   # constant part (flags guess)

    def __str__(self):
        return self.s


BINOPS = {
    -32435: ("<<", 7), -32434: (">>u", 7), -32433: (">>", 7),
    -32425: ("&&", 2), -32424: ("||", 1), -32423: ("^", 4),
    -32422: ("!=", 5), -32421: (">=", 6), -32420: (">", 6), -32416: ("==", 5),
    -32415: ("<=", 6), -32409: ("<", 6), -32413: ("|", 3), -32412: ("&", 3),
    -32407: ("%", 9), -32406: ("/", 9), -32405: ("*", 9), -32404: ("-", 8),
    -32403: ("+", 8),
}
# name, number of sub-expressions
FUNCS = {
    -32537: ("keydown", 1), -32536: ("palindex_rgb", 3), -32535: ("muldiv", 3),
    -32534: ("videoflags", 0), -32533: ("dist", 4), -32532: ("pixel", 3),
    -32531: ("freeobjs", 0), -32530: ("inrect", 4), -32529: ("bitscan", 2),
    -32528: ("testbit", 2), -32508: ("indexof", 2), -32507: ("scrolly", 0),
    -32506: ("scrollx", 0), -32505: ("sem", 1), -32503: ("dword_44BC64", 0),
    -32502: ("date", 0), -32501: ("mousey", 0), -32500: ("mousex", 0),
    -32436: ("soundlevel", 1), -32429: ("strlen", 1), -32428: ("fileexists", 2),
    -32427: ("freeslot", 1), -32426: ("slotloaded", 1), -32418: ("data", 2),
    -32410: ("random", 2), -32160: ("hset", 2), -32159: ("hsel", 1),
}


def qstr(b):
    s = b.decode("cp1252", errors="replace")
    s = s.replace("\\", "\\\\").replace('"', '\\"').replace("\r", "\\r").replace("\n", "\\n")
    return '"%s"' % s


DATAREFS = set()     # code indices referenced as data (tables, strings)


class DecodeError(Exception):
    pass


class DataHit(DecodeError):
    """Statement decodes to something that is certainly data."""


class Reader:
    def __init__(self, code, pos):
        self.code = code
        self.pos = pos
        self.args_used = 0       # number of 'arg' tokens seen (gosub params)
        self.calls = []          # (kind, target) found while decoding

    def raw(self):
        if self.pos >= len(self.code):
            raise DecodeError("read past end")
        t = self.code[self.pos]
        self.pos += 1
        return t

    def peek(self):
        return self.code[self.pos] if self.pos < len(self.code) else None

    # ---------------------------------------------------- expressions
    def expr(self, depth=0):
        if depth > 60:
            raise DecodeError("expression too deep")
        t = self.raw()
        X = lambda: self.expr(depth + 1)
        if t == -32000:                       # no-op prefix (resets context)
            return X()
        if t in BINOPS:
            op, pr = BINOPS[t]
            a = X(); b = X()
            sa = a.s if a.prec > pr else "(%s)" % a.s
            sb = b.s if b.prec > pr else "(%s)" % b.s
            v = None
            if a.v is not None and b.v is not None:
                try:
                    v = int(eval("%d %s %d" % (a.v, {"&&": "and", "||": "or", "/": "//", ">>u": ">>"}.get(op, op), b.v)))
                except Exception:
                    v = None
            r_ = E("%s %s %s" % (sa, op, sb), v, pr)
            if v is None and op in ("+", "|"):
                r_.k = a.k + b.k
            return r_
        if t in FUNCS:
            name, n = FUNCS[t]
            args = [X() for _ in range(n)]
            if t == -32418:
                if args[0].v is not None:
                    DATAREFS.add(args[0].v + (args[1].v or 0))
                if args[0].v is not None and args[1].v is not None:
                    return E("code[%d]" % (args[0].v + args[1].v))
                return E("code[%s + %s]" % (args[0], args[1]))
            return E("%s(%s)" % (name, ", ".join(a.s for a in args)))
        if t == -32419:
            a = X(); return E("-" + (a.s if a.prec >= 100 else "(%s)" % a.s), None if a.v is None else -a.v, 11)
        if t == -32527:
            a = X(); return E("!" + (a.s if a.prec >= 100 else "(%s)" % a.s), None, 11)
        if t == -32526:
            a = X(); return E("~" + (a.s if a.prec >= 100 else "(%s)" % a.s), None, 11)
        if t == -32414:
            a = X(); return E("abs(%s)" % a)
        if t == -32432:                      # evaluate expression stored at code[a]
            a = X()
            inner = "?"
            if a.v is not None and 0 <= a.v < len(self.code):
                DATAREFS.add(a.v)
                sub = Reader(self.code, a.v)
                try:
                    inner = sub.expr(depth + 1).s
                except DecodeError:
                    pass
            return E("evalat(%s){%s}" % (a, inner))
        if t == -32431:
            a = X(); b = X(); return E("l[%s + %s]" % (a, b))
        if t == -32430:
            a = X(); b = X()
            if a.v is not None and b.v is not None:
                return E("g%d" % (a.v + b.v))
            return E("g[%s + %s]" % (a, b))
        if t == -32402:
            a = X()
            return E(lname(a.v) if a.v is not None else "l[%s]" % a)
        if t == -32401:
            a = X()
            return E("g%d" % a.v if a.v is not None else "g[%s]" % a)
        if t == -32400:                      # escaped literal
            v = self.raw(); return E(str(v), v)
        if t == -32417:                      # context switch: obj(e).<expr>
            a = X(); b = X(); return E("obj(%s).%s" % (a, b))
        if t == -32408:
            b = X(); return E("parent.%s" % b)
        if t == -32411:                      # next argument from caller's stream
            self.args_used += 1
            return E("arg")
        if -31999 <= t <= -31000:
            return E("g%d" % (t - GLOBAL_BASE))
        if -30199 <= t <= -30001:
            return E(lname(t - LOCAL_BASE))
        if t <= -32000 and t >= -32600:
            # unknown operator token; evaluator treats unknown as literal
            return E("?tok%d" % t, t)
        return E(str(t), t)

    def string(self):
        """Inline string: packed bytes in tokens up to a 0 token."""
        b = bytearray()
        while True:
            t = self.raw()
            if t == 0:
                break
            b += struct.pack("<i", t)
        return qstr(b.split(b"\0")[0])

    def strarg(self, flags):
        """sub_40E090: string operand selected by flags & 0x6000."""
        f = flags & 0x6000
        if f == 0x2000:
            a = self.expr()
            if a.v is not None and 0 <= a.v < len(self.code):
                DATAREFS.add(a.v)
                return "str@%d%s" % (a.v, Reader(self.code, a.v).string())
            return "str@[%s]" % a
        if f == 0x4000:
            return "s[%s]" % self.expr()
        return self.string()

    def redirect(self, flags, dynamic_ok=False):
        """sub_40E0E0: if flags & 0x80, operands follow at code[expr]."""
        if flags & 0x80:
            a = self.expr()
            if a.v is None:
                if dynamic_ok:
                    return a, None
                raise DecodeError("indirect operand block at non-constant address")
            DATAREFS.add(a.v)
            return a, Reader(self.code, a.v)
        return None, self


# ------------------------------------------------------------------ statements
# Each handler returns (text, flow) where flow is a dict:
#   term: True if execution does not fall through
#   jumps: list of absolute code indices that are jump targets
#   calls: list of absolute code indices that are called (gosub)
#   seqjump/seqcall: sequence numbers


def flagged(r, f, bits):
    """read one expr for each bit in bits present in f (in order)."""
    out = []
    for b, n, name in bits:
        if f & b:
            out.append("%s=(%s)" % (name, ", ".join(str(r.expr()) for _ in range(n))))
    return out


def bd(e):
    """Format a file number operand as BDnnnn."""
    if e.v is not None:
        return "BD%04d" % e.v
    return "BD(%s)" % e


def need(e, what):
    if e.v is None:
        raise DecodeError("%s is not a constant (%s)" % (what, e.s))
    return e.v


GUESSES = []


def needf(e, what):
    """Flags operand: constant, or constant part of 'K + var' (var assumed to
    only fill the low register-number bits)."""
    if e.v is not None:
        return e.v
    GUESSES.append("%s=(%s) assumed 0x%x+var" % (what, e.s, e.k))
    return e.k


def h_expr_n(name, n):
    def h(r, op):
        return "%s %s" % (name, ", ".join(str(r.expr()) for _ in range(n))), {}
    return h


def h_assign_l(r, op):
    k = r.expr(); v = r.expr()
    dst = lname(k.v) if k.v is not None else "l[%s]" % k
    sym = {-32068: "=", -32121: "+=", -32122: "-="}[op]
    return "%s %s %s" % (dst, sym, v), {}


def h_assign_g(r, op):
    k = r.expr(); v = r.expr()
    dst = "g%d" % k.v if k.v is not None else "g[%s]" % k
    sym = {-32067: "=", -32123: "+=", -32124: "-="}[op]
    return "%s %s %s" % (dst, sym, v), {}


def h_assign_idx(r, op):
    a = r.expr(); b = r.expr(); v = r.expr()
    if op == -32125:
        dst = "g%d" % (a.v + b.v) if a.v is not None and b.v is not None else "g[%s + %s]" % (a, b)
    else:
        dst = lname(a.v + b.v) if a.v is not None and b.v is not None else "l[%s + %s]" % (a, b)
    return "%s = %s" % (dst, v), {}


def h_bit(r, op):
    a = r.expr(); b = r.expr()
    name = {-32105: "togglebit", -32104: "clrbit", -32103: "setbit"}[op]
    if a.v is not None and b.v is not None:
        return "%s g%d.bit%d" % (name, a.v + (b.v >> 4), b.v & 15), {}
    return "%s g[%s], %s" % (name, a, b), {}


def h_jz(r, op):
    c = r.expr(); off = r.expr()
    tgt = r.pos + need(off, "jump offset")
    if op == -32096:
        return "if !(%s) goto L%d" % (c, tgt), {"jumps": [tgt]}
    return "if (%s) goto L%d" % (c, tgt), {"jumps": [tgt]}


def h_jmp(r, op):
    off = r.expr()
    tgt = r.pos + need(off, "jump offset")
    return "goto L%d" % tgt, {"jumps": [tgt], "term": True}


def h_goto_abs(r, op):
    a = r.expr()
    if a.v is None:
        return ("goto @[%s]" if op == -32149 else "gosub @[%s]") % a, {"term": op == -32149}
    if op == -32149:
        return "goto L%d" % a.v, {"jumps": [a.v], "term": True}
    return "gosub L%d" % a.v, {"calls": [a.v]}


def h_seq(r, op):
    a = r.expr()
    name = {-32005: "goto_seq", -32011: "gosub_seq", -32015: "spawn"}[op]
    fl = {}
    if a.v is not None:
        n = a.v & 0x3FF if op == -32015 else a.v
        if op == -32005:
            fl = {"seqjump": [n], "term": True}
        elif op == -32011:
            fl = {"seqcall": [n]}
        else:
            fl = {"seqspawn": [n]}
        extra = ""
        if op == -32015 and a.v & 0x800:
            nargs = (a.v >> 12) + 1
            extra = " (%s)" % ", ".join("l%d=%s" % (i, r.expr()) for i in range(nargs))
        if op == -32015 and a.v & 0x400:
            extra += " on_top"
        return "%s seq%d%s" % (name, n, extra), fl
    return "%s %s" % (name, a), {"term": op == -32005}


def h_return(r, op):
    if op == -32013:
        return "next", {"close": True}
    return "end", {"term": True}


def h_retval(r, op):
    return "return %s" % r.expr(), {"term": True}


def h_signal(r, op):
    t = r.expr(); m = r.expr()
    return "signal %s, %s" % (target_name(t), msg_name(m)), {}


def target_name(t):
    v = t.v
    if v is None:
        return str(t)
    names = {-1: "self", -2: "parent", -3: "all_others", -4: "others_nonflag4",
             -5: "others_flag8", -6: "others_noflag8", -7: "children", -8: "next_obj",
             -9: "prev_obj", -10: "hit_at_me", -11: "hit_at_me2", 0: "none"}
    if v in names:
        return names[v]
    if 0 < v < 1000:
        return "seq%d" % v
    if 1000 <= v < 2000:
        return "child_seq%d" % (v - 1000)
    if 2000 <= v < 10000:
        return "group%d" % (v - 2000)
    if v >= 10000:
        return "in_seq%d" % (v - 10000)
    return str(v)


def msg_name(m):
    v = m.v
    if v is None:
        return str(m)
    special = {9000: "set_flag4", 9001: "clr_flag4", 9002: "set_flag8", 9003: "clr_flag8",
               9006: "release_hotspots", 9007: "adopt", 9008: "fast", 9009: "unfast",
               9010: "capture", 19999: "QUIT_APP"}
    if v in special:
        return special[v]
    if v in (9004, 9005, 9011, 9012, 9013, 9014):
        return "hotspot_msg(%d)" % v
    if v >= 16000:
        return "spawn(seq%d)" % (v - 16000)
    if v >= 15000:
        return "xorflags(0x%x)" % (v - 15000)
    if v >= 14000:
        return "clrflags(0x%x)" % (v - 14000)
    if v >= 13000:
        return "setflags(0x%x)" % (v - 13000)
    if v >= 10000:
        return "call(seq%d)" % (v - 10000)
    if v >= 8000:
        return "jump(seq%d)" % (v - 8000)
    if 7500 <= v < 8000:
        return "ink(%d)" % (v - 7500)
    if 7000 <= v < 7500:
        return "group(%d)" % (v - 7000)
    if 6100 <= v < 7000:
        return "jump_handler(%d)" % (v - 6100)
    if 6000 <= v < 6100:
        return "call_handler(%d)" % (v - 6000)
    bits = []
    for b, n in ((8, "kill"), (1, "wake"), (2, "detach"), (4, "now"), (0x10, "erase"),
                 (0x20, "drop_hotspot"), (0x40, "clearstack"), (0x80, "noframe"),
                 (0x100, "hide"), (0x200, "show")):
        if v & b:
            bits.append(n)
    return "%d<%s>" % (v, "|".join(bits))


def h_wait(r, op):
    if r.peek() == 0:
        r.raw()
        return "wait_signal_all", {}
    # Heuristic: a long run of plain literals after a wait is a data table,
    # not code (the object idles here; signals redirect it).
    i = r.pos
    while i < len(r.code) and 0 <= r.code[i] < 32000:
        i += 1
    if i - r.pos >= 24:
        return "wait_signal", {"term": True}
    return "wait_signal", {}


def h_refresh(r, op):
    if r.peek() == 0:
        r.raw()
        return "drawmode_off 0", {}
    return "drawmode_off_refresh", {}


def h_repeat(r, op):
    return "repeat %s" % r.expr(), {"open": True}


def h_layer(r, op):
    return "%s %s" % ("layer_top" if op == -32114 else "layer", r.expr()), {}


def h_glide(r, op):
    a = r.expr(); b = r.expr(); sp = r.expr(); st = r.expr()
    name = "glide_by" if op == -32064 else "glide_to"
    return "%s (%s, %s) speed=%s steps=%s" % (name, a, b, sp, st), {}


def h_invalidate(r, op):
    a = [r.expr() for _ in range(4)]
    s = "invalidate (%s, %s)-(%s, %s)" % tuple(a)
    if r.peek() == 0:
        r.raw()
        s += " grow=%s" % r.expr()
    return s, {}


def h_text_reg(r, op):          # -32119 sub_40F280
    fe = r.expr()
    f = needf(fe, "string op flags")
    reg = f & 0x7F
    kind = (f >> 8) & 0xF
    if kind == 12:
        txt = r.strarg(f)
        o = r.expr()
        parts = ["text=%s" % txt, "opts=%s" % o]
        if f & 0x80:
            a, rr = r.redirect(0x80)
            parts.append("font@%s" % a)
        w = None
        if f & 7:
            w = r.expr(); parts.append("w=%s" % w)
        if f & 0x60:
            wneg = (w is None and not (o.v is not None and o.v & 0x800)) or (w is not None and w.v is not None and w.v < 0)
            if wneg:
                parts.append("w=%s" % r.expr())
            parts.append("h=%s" % r.expr())
        return "drawtext flags=0x%x %s" % (f, " ".join(parts)), {}
    sr = "s%d" % reg if fe.v is not None else "s[(%s) & 0x7f]" % fe
    if kind == 1:
        return "strclear %s" % sr, {}
    if kind == 2:
        return "strchop %s  ; res=last char" % sr, {}
    if kind in (3, 4):
        n = r.expr(); file = bd(r.expr()); rec = r.expr()
        return "%s %s, count=%s, file=%s.STR, rec=%s" % (
            "strsave" if kind == 3 else "strload", sr, n, file, rec), {}
    if kind == 5:
        return "strmeasure %s, %s" % (sr, r.expr()), {}
    if kind == 6:
        a = [str(r.expr()) for _ in range(6)]
        addr, rr = r.redirect(f, dynamic_ok=True)
        if rr is None:
            return "textstyle %s rgb=(%s) bg=(%s) font/face operands @[%s] (runtime address)" % (
                sr, ",".join(a[:3]), ",".join(a[3:]), addr), {}
        b = [str(rr.expr()) for _ in range(5)]
        s = rr.strarg(f)
        return "textstyle %s rgb=(%s) bg=(%s) font=(%s,%s,%s) %s %s face=%s%s" % (
            sr, ",".join(a[:3]), ",".join(a[3:]), b[0], b[1], b[2], b[3], b[4], s,
            "" if addr is None else "  ; @%s" % addr), {}
    if kind == 7:
        return "strcpy %s, %s" % (sr, r.strarg(f)), {}
    if kind == 9:
        n = r.expr(); dst = r.expr()
        return "strmove %s -> s[%s] count=%s" % (sr, dst, n), {}
    if kind == 10:
        return "strcmp%s %s, %s  ; res" % ("i" if f & 0x1000 else "", sr, r.strarg(f)), {}
    if kind == 11:
        addr, rr = r.redirect(f)
        sz = rr.expr()
        fp = []
        if sz.v is None or sz.v >= 1:
            fp = [str(rr.expr()) for _ in range(4)] + [rr.string()]
        a = [str(r.expr()) for _ in range(3)] if (sz.v is None or sz.v >= 1) else []
        return "strfit %s font=(%s %s) %s  ; res" % (sr, sz, " ".join(fp), ", ".join(a)), {}
    if kind in (0, 8):
        return "strnop%d %s  ; no-op in sub_40F280 (no operands)" % (kind, sr), {}
    return "strop%d %s ; ???" % (kind, sr), {}


def h_sprintf(r, op):           # -32041 sub_40FF30
    f = needf(r.expr(), "sprintf flags")
    reg = f & ~0x6000
    fmt = r.strarg(f)
    args = []
    if not fmt.startswith('"') and "\"" not in fmt:
        return "sprintf s%d, %s, ...?" % (reg, fmt), {}
    s = fmt[fmt.index('"') + 1:fmt.rindex('"')]
    i = 0
    while i < len(s):
        if s[i] != "%":
            i += 1; continue
        i += 1
        width = 1
        while i < len(s):
            c = s[i]; i += 1
            if c == "%":
                break
            if c in "#-.0":
                continue
            if c == "S":
                args.append("code@%s" % r.expr()); break
            if c in "Xdiux":
                if width == 2:
                    lo = r.expr(); hi = r.expr(); args.append("long(%s,%s)" % (lo, hi))
                else:
                    args.append(str(r.expr()))
                break
            if c == "c":
                args.append(str(r.expr())); break
            if c == "l":
                width = 2; continue
            if c == "s":
                args.append("s[%s]" % r.expr()); break
            if c.isdigit():
                continue
            break
    return "sprintf s%d, %s%s" % (reg, fmt, "".join(", " + a for a in args)), {}


def h_file_ops(r, op):          # -32065 sub_403000
    f = needf(r.expr(), "file op flags")
    k = f & 0xF
    parts = []
    if k in (2, 3, 4) and f & 0x100:
        parts.append("dir=%s" % r.strarg(16 * f))
    if k in (1, 2, 3, 4):
        parts.append(r.strarg(f))
    if k == 2 and f & 0x40:
        parts.append("s[%s]" % r.expr())
    name = {1: "path_set", 2: "path_check", 3: "dir_remove", 4: "file_check",
            6: "path_nop", 7: "path_parent"}.get(k, "fileop%d" % k)
    return "%s 0x%x %s" % (name, f, " ".join(parts)), {}


def h_sound(r, op):             # -32151 sub_412E90 (WAV channel control)
    ch = r.expr()
    parts = []
    while True:
        v = needf(r.expr(), "sound flags")
        e = v & ~1
        if e < 0 and e >= -22:
            names = {-22: "stop_range", -20: "isplaying", -18: "rewind", -16: "volume",
                     -14: "unmute", -12: "mute", -10: "free", -8: "used", -6: "close",
                     -4: "free_ch", -2: "used_ch"}
            p = names.get(e, str(e))
            if e in (-22, -16):
                p += "(%s)" % r.expr()
            parts.append(p)
            if v & 1:
                continue
            break
        if ((v >> 8) & 0x90) == 0x90:
            p = ["q0x%x" % v]
            p += flagged(r, v, [(0x2000, 1, "a"), (0x800, 1, "b"), (0x400, 1, "c"), (0x200, 1, "d")])
            k = v & 0xF
            if k == 3:
                p.append("inline(%d,%d,%d,%d)" % (r.raw(), r.raw(), r.raw(), r.raw()))
            elif k in (4, 6, 7, 8):
                p.append(str(r.expr()))
            elif k == 0xB:
                p.append("%s,%s" % (r.expr(), r.expr()))
            if v & 0x40:
                p.append("x=(%s,%s)" % (r.expr(), r.expr()))
            parts.append(" ".join(p))
            if v & 0x10:
                continue
            break
        p = ["0x%x" % v]
        if v & 0x400:
            p.append("play=%s.WAV" % bd(r.expr()))
        if v & 0x4000:
            p.append("inline(%d,%d,%d,%d)" % (r.raw(), r.raw(), r.raw(), r.raw()))
        p += flagged(r, v, [(0x2000, 1, "data@"), (8, 1, "vol"), (0x10, 1, "loops"), (0x800, 2, "pos")])
        parts.append(" ".join(p))
        if v & 1:
            continue
        break
    return "sound ch=%s %s" % (ch, "; ".join(parts)), {}


def h_sound2(r, op):            # -32152 sub_413880
    parts = []
    while True:
        v = needf(r.expr(), "sound2 flags")
        p = ["0x%x" % v]
        if v & 0x400 and v & 0x200:
            p.append("mode=%s" % r.expr())
        if v & 0x6000:
            p.append("ch=%s" % r.expr())
            if v & 0x4000:
                p.append("vol=%s" % r.expr())
            if v & 0x2000:
                p.append("pan=%s" % r.expr())
        if v & 0x800:
            p.append("x=(%s,%s)" % (r.expr(), r.expr()))
        if v & 0x100:
            p.append("y=%s" % r.expr())
        parts.append(" ".join(p))
        if not v & 0x1000:
            break
    return "soundctl %s" % "; ".join(parts), {}


PFL_MODE = [2]


def h_pfl(r, op):               # -32128 sub_414AA0 (PFL animation stream)
    f = needf(r.expr(), "pfl flags")
    parts = []
    if f & 0x80:
        PFL_MODE[0] = 2 if f & 0x40 else 1
    if f & 0x100:
        if PFL_MODE[0] != 1:
            parts.append("slot=%s" % r.expr())
        parts.append("file=%s.PFL" % bd(r.expr()))
    return "pflanim 0x%x %s" % (f, " ".join(parts)), {}


def h_obj_save(r, op):          # -32118 sub_4193B0
    f = needf(r.expr(), "save flags")
    k = f & 0xFF00
    if k == 0x400:
        file = r.expr(); seqs = []
        while True:
            e = r.expr()
            if e.v == 0:
                break
            seqs.append(str(e))
            if e.v is None and len(seqs) > 50:
                raise DecodeError("objsave list")
        return "objsave %s file=%s seqs=[%s]" % ("REC" if f & 7 else "TSK", file, ", ".join(seqs)), {}
    if k == 0x800:
        return "objload %s file=%s" % ("REC" if f & 7 else "TSK", r.expr()), {}
    return "objsave? 0x%x" % f, {}


def h_palette(r, op):           # -32089 sub_41E0A0
    v = needf(r.expr(), "palette op")
    simple = {17: "pal_freeze", 18: "pal_unfreeze", 19: "pal_apply", 22: "pal_swap_saved",
              23: "pal_flag2", 4: "pal_save", 8196: "pal_save", 8214: "pal_swap_saved",
              6: "pal_drop_saved", 9: "pal_swap_banks", 2054: "pal_free"}
    if v in simple:
        return "%s (%d)" % (simple[v], v), {}
    if v == 20:
        return "pal_fade %s" % r.expr(), {}
    if v == 21:
        return "pal_dissolve %s" % ", ".join(str(r.expr()) for _ in range(5)), {}
    lo = r.expr(); hi = r.expr()
    k = v & ~0x3800
    args = []
    if k == 0:
        args = [r.expr() for _ in range(6)]; nm = "pal_tint"
    elif k in (2, 3):
        nm = "pal_rotate_" + ("down" if k == 2 else "up")
    elif k == 5:
        args = [r.expr() for _ in range(3)]; nm = "pal_blend_saved"
    elif k in (0xA, 0xB):
        nm = "pal_swapchan%d" % k
    elif k in (0xC, 0xD, 0xF):
        args = [r.expr()]; nm = {0xC: "pal_saturate", 0xD: "pal_bright", 0xF: "pal_xchg"}[k]
    elif k == 0xE:
        if lo.v is None or hi.v is None:
            raise DecodeError("pal_set with variable range")
        args = [r.expr() for _ in range(3 * (hi.v + 1 - lo.v))]; nm = "pal_set"
    elif k == 0x10:
        args = [r.expr() for _ in range(2)]; nm = "pal_contrast"
    else:
        nm = "pal_op%d" % k
    s = "%s 0x%x [%s..%s] %s" % (nm, v, lo, hi, ", ".join(str(a) for a in args))
    if v & 0x800:
        s += " steps=%s" % r.expr()
    return s, {}


def h_cursor(r, op):            # -32088 sub_413CC0
    v = r.expr()
    if v.v == -4:
        return "cursor_set %s" % r.expr(), {}
    return "cursor %s" % v, {}


def h_cliprect(r, op):          # -32080 sub_41C340
    f = needf(r.expr(), "clip flags")
    p = flagged(r, f, [(1, 4, "rect"), (4, 2, "grow"), (0x10, 2, "move"), (0x20, 2, "moveto")])
    return "clip 0x%x %s" % (f, " ".join(p)), {}


def h_grab(r, op):              # -32055 sub_408270
    f = needf(r.expr(), "grab flags")
    p = []
    if f & 0x6000 and f & 0x1000:
        p.append("rect=(%s)" % ", ".join(str(r.expr()) for _ in range(4)))
    p += flagged(r, f, [(0x800, 1, "toslot"), (0x200, 1, "tofile")])
    return "screengrab 0x%x %s" % (f, " ".join(p)), {}


def h_filecopy(r, op):          # -32053 sub_40D6C0
    f = needf(r.expr(), "filecopy flags")
    p = []
    if f & 0x400:
        pass
    elif f & 0x80:
        p = [str(r.expr()), str(r.expr())]
    elif f == 4128:
        p = ["bufK=%s" % r.expr()]
    else:
        p += flagged(r, f, [(0x800, 2, "progress"), (0x1000, 1, "bufsize")])
        if f & 0x6000 or f & 0x200:
            p.append("%s, %s" % (r.expr(), r.expr()))
            if f & 0x6000 and f & 0x100:
                p.append(str(r.expr()))
    return "filecopy 0x%x %s" % (f, " ".join(p)), {}


def h_slots(r, op):             # -32052 sub_41C770
    s = need(r.expr(), "slot op")
    names = {1: "slots_flag2_set", 2: "slots_flag2_clr", 3: "slots_free", 4: "slots_op4",
             5: "slots_swap", 6: "slots_setorigin", 7: "slots_flag10"}
    if s in (1, 2, 3, 4):
        a = [r.expr() for _ in range(2)]
    elif s in (5, 7):
        a = [r.expr() for _ in range(3)]
    elif s == 6:
        v = r.expr(); a = [v]
        vv = need(v, "slot origin flags")
        rel = vv > 4000; vv -= 4000 if rel else 0
        add = vv > 2000; vv -= 2000 if add else 0
        fromslot = vv > 1000
        a += [r.expr(), r.expr()]
        if fromslot:
            a.append(r.expr())
        if rel:
            a.append(r.expr())
    else:
        a = []
    return "%s %s" % (names.get(s, "slots%d" % s), ", ".join(str(x) for x in a)), {}


def h_clip2(r, op):             # -32051 sub_417770
    v = r.expr()
    if v.v is not None and v.v < 0:
        return "clip_off", {}
    return "clip_rect %s, %s, %s, %s" % (v, r.expr(), r.expr(), r.expr()), {}


def h_sprgroup(r, op):          # -32027 sub_41FDB0
    a = r.expr(); f = needf(r.expr(), "group flags")
    p = []
    if not f & 0x800:
        if f & 1 and f & 2:
            p.append("set=%s" % r.expr())
        if f & 4:
            p.append("timer=(%s,%s)" % (r.expr(), r.expr()))
        if f & 8 and not f & 0x10:
            p.append("onend=(%s,%s)" % (r.expr(), r.expr()))
        if f & 0x600:
            p.append("x600=%s" % r.expr())
        if f & 0x80:
            p.append("first=%s" % r.expr())
        if f & 0x40:
            p.append("count=%s" % r.expr())
    return "pagstream %s.PAG, 0x%x %s" % (bd(a), f, " ".join(p)), {}


def h_textedit(r, op):          # -32129 sub_40E490
    f = needf(r.expr(), "textedit flags")
    k = f & 0xF000
    p = []
    if k == 0x1000:
        p.append("rect=(%s)" % ", ".join(str(r.expr()) for _ in range(4)))
        if not f & 4:
            p.append("reg=%s maxlen=%s" % (r.expr(), r.expr()))
        nm = "edit_create"
    elif k == 0x2000:
        addr, rr = r.redirect(f)
        sz = rr.expr()
        p.append("size=%s" % sz)
        if sz.v is None or sz.v >= 1:
            p.append(", ".join(str(rr.expr()) for _ in range(4)))
            p.append(rr.string())
        nm = "edit_font"
    elif k == 0x3000:
        p.append("fg=(%s) bg=(%s)" % (", ".join(str(r.expr()) for _ in range(3)),
                                       ", ".join(str(r.expr()) for _ in range(3))))
        nm = "edit_colors"
    else:
        nm = {0x4000: "edit_focus", 0x5000: "edit_selall", 0x6000: "edit_unfocus",
              0x7000: "edit_destroy"}.get(k, "edit_update")
    return "%s 0x%x %s" % (nm, f, " ".join(p)), {}


def h_obj4(r, op):              # -32141 sub_401AF0
    s = need(r.expr(), "sub op")
    n = {0: 3, 1: 1, 2: 2, 3: 1, 4: 1, 5: 4}.get(s, 0)
    nm = {0: "center_on_slot", 1: "res_slot_height", 2: "hitlist_select", 3: "hitlist_test",
          4: "res_set", 5: "step_towards"}.get(s, "op%d" % s)
    return "objmisc.%s %s" % (nm, ", ".join(str(r.expr()) for _ in range(n))), {}


def h_hotparam(r, op):          # -32165 sub_41BFA0
    hid = r.expr(); v = r.expr()
    n = {9015: 1, 9016: 2, 9018: 2, 9019: 4, 9017: 2}.get(v.v, 0)
    return "hotspot_param %s, %s %s" % (hid, v, ", ".join(str(r.expr()) for _ in range(n))), {}


def h_flagged_opt(r, op):       # -32130 sub_4094E0
    a = [r.expr() for _ in range(4)]
    s = "invalidate (%s, %s)-(%s, %s)" % tuple(a)
    if r.peek() == 0:
        r.raw(); s += " grow=%s" % r.expr()
    return s, {}


def h_switch(r, op):            # -32093 sub_410E70
    e = r.expr(); n = r.raw()
    ents = [r.raw() for _ in range(n)]
    return "switch_seq %s [%s]" % (e, ", ".join("seq%d" % x for x in ents)), {"seqjump": ents}


def h_rndseq(r, op):            # -32021/-32020
    n = r.expr()
    nn = need(n, "random table size")
    ents = [r.raw() for _ in range(nn)] if op == -32020 else []
    return "%s %s [%s]" % ("rnd_gosub_seq" if op == -32020 else "rnd_goto_seq?", n,
                            ", ".join("seq%d" % x for x in ents)), {"seqcall": ents}


def h_strlist(r, op):           # -32120 sub_4101E0
    s = r.string(); n = r.expr()
    a = [r.expr() for _ in range(need(n, "count"))]
    return "op_4101E0 %s, %s" % (s, ", ".join(str(x) for x in a)), {}


def h_skipstr(r, op):           # -32085 sub_414140
    s = r.string()
    return "op_414140 %s, %s" % (s, r.expr()), {}


def h_raw2(name):
    def h(r, op):
        a = r.raw(); b = r.raw()
        return "%s %d" % (name, (a & 0xFFFF) | ((b & 0xFFFF) << 16)), {}
    return h


def h_misc6(r, op):             # -32077 sub_4176D0
    v = r.expr()
    if v.v == -6:
        return "scrollmode -6, %s" % r.expr(), {}
    if v.v is not None and -5 <= v.v <= -1:
        return "scrollmode %s" % v, {}
    return "scroll_to %s, %s" % (v, r.expr()), {}


def h_pixel(r, op):             # -32112 sub_41EF70
    v = r.expr()
    if v.v is not None and v.v & 0x4000:
        raise DecodeError("setpixel 0x4000 variant unknown")
    return "setpixel slot=%s (%s, %s) = %s" % (v, r.expr(), r.expr(), r.expr()), {}


def h_simple(name, n=0, term=False):
    def h(r, op):
        args = ", ".join(str(r.expr()) for _ in range(n))
        return (name + (" " + args if args else "")), ({"term": True} if term else {})
    return h


def h_loadgfx(r, op):           # -32083 sub_411090
    page = r.expr(); first = r.expr(); cnt = r.expr(); slot = r.expr()
    return "loadgfx page=%s.PAG chunk=%s count=%s -> slot %s" % (bd(page), first, cnt, slot), {}


def h_gfile(name):
    def h(r, op):
        a = [r.expr() for _ in range(3 if op == -32099 else 2)]
        if op == -32099:
            return "save_globals g%s..g%s -> %s.GVD" % (a[0], a[1], bd(a[2])), {}
        return "load_globals g%s.. <- %s.GVD" % (a[0], bd(a[1])), {}
    return h


def h_gotopage(r, op):
    return "gotopage %s.PAG" % bd(r.expr()), {"term": True}


def h_spawnflags(r, op):
    return "nextpage_start_seq %s" % r.expr(), {}


OPS = {
    -32169: h_simple("op_4139B0", 1),
    -32168: h_simple("set_4339E8_E4", 2),
    -32167: h_simple("goto_handler", 1, True),
    -32166: h_simple("call_handler", 1),
    -32165: h_hotparam,
    -32164: h_simple("sem_clr", 1),
    -32163: h_simple("sem_wait_set", 1),
    -32162: h_simple("sem_set", 1),
    -32161: h_simple("sem_wait_clr", 1),
    -32160: h_simple("hset", 2),
    -32159: h_simple("hsel", 1),
    -32154: h_simple("aim (dx dy from x1,y1,x2,y2) dirs=", 5),
    -32153: h_simple("nop_32153"),
    -32152: h_sound2,
    -32151: h_sound,
    -32150: h_simple("clr_l10"),
    -32149: h_goto_abs,
    -32148: h_goto_abs,
    -32147: h_simple("nop_32147"),
    -32146: h_simple("nop_32146"),
    -32145: h_simple("nop_32145"),
    -32144: h_raw2("check_cd_space"),
    -32143: h_simple("copyslots src,count,dst", 3),
    -32141: h_obj4,
    -32138: h_simple("nop2", 2),
    -32137: h_simple("set_42FCA8", 1),
    -32136: h_simple("set_42FCA4_AC", 2),
    -32134: h_simple("nop_32134"),
    -32133: h_simple("nop_32133"),
    -32130: h_flagged_opt,
    -32129: h_textedit,
    -32128: h_pfl,
    -32127: h_retval,
    -32126: h_assign_idx,
    -32125: h_assign_idx,
    -32124: h_assign_g,
    -32123: h_assign_g,
    -32122: h_assign_l,
    -32121: h_assign_l,
    -32120: h_strlist,
    -32119: h_text_reg,
    -32118: h_obj_save,
    -32117: h_simple("nop_32117", 1),
    -32116: h_simple("midi_op", 2),
    -32115: h_simple("set_44D360", 1),
    -32114: h_layer,
    -32113: h_simple("grab_to_slot slot,x1,y1,x2,y2", 5),
    -32112: h_pixel,
    -32111: h_simple("dither_slot", 1),
    -32110: h_raw2("set_42E390"),
    -32109: h_simple("slots_op_420430 first,count", 2),
    -32108: h_simple("onframe_seq", 1),
    -32107: h_simple("tracemode", 1),
    -32106: h_simple("set_43DC08", 1),
    -32105: h_bit, -32104: h_bit, -32103: h_bit,
    -32102: h_simple("mask_slot src,dst", 2),
    -32101: h_simple("scale_slot", 6),
    -32100: h_gfile("load"),
    -32099: h_gfile("save"),
    -32098: h_simple("stretch_slot src,w%,h%,dst", 4),
    -32096: h_jz,
    -32095: h_jmp,
    -32094: h_simple("speed", 1),
    -32093: h_switch,
    -32092: h_simple("nop_32092", 1),
    -32091: h_simple("eval", 1),
    -32090: lambda r, op: ("save_state mask=0x%x" % needf(r.expr(), "mask"), {"open": True}),
    -32089: h_palette,
    -32088: h_cursor,
    -32087: h_simple("wait_slot_loaded", 1),
    -32086: h_simple("op_414350", 2),
    -32085: h_skipstr,
    -32084: h_simple("flag10", 1),
    -32083: h_loadgfx,
    -32082: h_simple("op_410F30 a,b", 2),
    -32080: h_cliprect,
    -32079: h_simple("msgfilter id,seq", 2),
    -32078: h_simple("yield"),
    -32077: h_misc6,
    -32076: h_simple("attach_mode_10"),
    -32075: h_simple("op_4205F0", 3),
    -32074: h_simple("ink", 1),
    -32073: h_simple("bgcolor r,g,b", 3),
    -32071: h_jz,
    -32070: h_simple("poke_rel val,off", 2),
    -32068: h_assign_l,
    -32067: h_assign_g,
    -32065: h_file_ops,
    -32064: h_glide,
    -32063: h_glide,
    -32062: h_simple("eval", 1),
    -32061: h_simple("sleep", 1),
    -32060: h_simple("frame_again"),
    -32059: h_simple("draw_now", 1),
    -32058: h_simple("wait_slot", 1),
    -32057: h_refresh,
    -32056: h_simple("drawmode_on"),
    -32055: h_grab,
    -32054: h_simple("fillscreen r,g,b", 3),
    -32053: h_filecopy,
    -32052: h_slots,
    -32051: h_clip2,
    -32050: h_spawnflags,
    -32048: h_simple("pop_frame"),
    -32047: h_simple("retpage", 0, True),
    -32046: h_simple("callpage", 1, True),
    -32045: h_simple("drop_pagestack"),
    -32042: h_signal,
    -32041: h_sprintf,
    -32037: h_simple("set_user4", 1),
    -32035: h_gotopage,
    -32034: h_simple("signal_all_others", 1),
    -32033: h_simple("velocity", 2),
    -32032: h_simple("hotspot_disable", 1),
    -32031: h_simple("hotspot_enable", 1),
    -32030: h_simple("hotspot_remove"),
    -32029: lambda r, op: ("hotspot id=%s, onclick=%s" % (r.expr(), msg_name(r.expr())), {}),
    -32028: h_simple("delay_add", 1),
    -32027: h_sprgroup,
    -32026: h_simple("nowait"),
    -32025: h_simple("hide"),
    -32024: h_layer,
    -32023: h_simple("attach_none"),
    -32022: h_simple("attach_parent"),
    -32021: h_rndseq,
    -32020: h_rndseq,
    -32019: h_simple("detach_owner"),
    -32015: h_seq,
    -32014: h_simple("setpos", 2),
    -32013: h_return,
    -32012: h_repeat,
    -32011: h_seq,
    -32007: h_simple("delay_add2", 1),
    -32006: h_simple("move", 2),
    -32005: h_seq,
    -32004: h_simple("delay", 1),
    -32003: h_return,
    -32002: h_wait,
    -32001: h_simple("mark"),
    -32000: h_simple("nop"),
}


def decode_stmt(r):
    op = r.raw()
    if op in OPS:
        return OPS[op](r, op)
    if -32169 <= op <= -32000:
        raise DecodeError("unknown statement opcode %d" % op)
    r.pos -= 1
    e = r.expr()
    if e.v is not None and not 0 <= e.v < 1600:
        raise DataHit("frame %d out of slot range" % e.v)
    return "frame %s" % e, {}


# ------------------------------------------------------------------ program


def disassemble(data, out=None):
    start, table, code = load_script(data)
    w = (out or sys.stdout).write
    seq_at = {}
    for i, ofs in enumerate(table):
        if i and ofs:
            seq_at.setdefault(ofs, []).append(i)

    insns = {}          # pos -> (end, text, args_used, term)
    errors = []
    todo = [ofs for ofs in seq_at]
    labels = set()
    call_args = {}

    def decode_at(p):
        r = Reader(code, p)
        del GUESSES[:]
        text, fl = decode_stmt(r)
        # gosub argument passing: args follow the call in the caller stream
        tg = fl.get("calls", []) + [table[s] for s in fl.get("seqcall", []) if 0 < s < len(table)]
        for t in tg:
            n = call_args.get(t, 0)
            if n:
                args = [str(r.expr()) for _ in range(n)]
                text += " (" + ", ".join(args) + ")"
        if GUESSES:
            text += "    ; GUESS: " + "; ".join(GUESSES)
        return r, text, fl

    def explore(datarefs):
        seen = set()
        work = list(todo)
        while work:
            p = work.pop()
            first = True
            depth = 0
            while 0 <= p < len(code) and p not in seen:
                if not first and p in datarefs and p not in labels and p not in seq_at and code[p] not in OPS:
                    break          # falls into a data table
                first = False
                seen.add(p)
                try:
                    r, text, fl = decode_at(p)
                except DataHit:
                    break
                except DecodeError as e:
                    errors.append((p, str(e)))
                    insns[p] = (p + 1, "??? %d  ; %s" % (code[p], e), 0, True)
                    break
                if fl.get("open"):
                    depth += 1
                if fl.get("close"):
                    if depth > 0:
                        depth -= 1
                    else:
                        text = "next/return"
                        fl["term"] = True
                insns[p] = (r.pos, text, r.args_used, bool(fl.get("term")))
                for j in fl.get("jumps", []) + fl.get("calls", []):
                    labels.add(j)
                    work.append(j)
                for s in fl.get("seqjump", []) + fl.get("seqcall", []) + fl.get("seqspawn", []):
                    if 0 < s < len(table) and table[s]:
                        work.append(table[s])
                if fl.get("term"):
                    break
                p = r.pos

    # Compute argument counts of gosub targets (fixpoint).
    prev_refs = set()
    for _ in range(8):
        insns.clear(); del errors[:]
        PFL_MODE[0] = 2
        DATAREFS.clear()
        explore(prev_refs)
        refs_now = set(DATAREFS)
        new = {}
        for t in labels | set(seq_at):
            c = count_args(code, t, insns)
            if c:
                new[t] = c
        if new == call_args and refs_now == prev_refs:
            break
        call_args = new
        prev_refs = refs_now
    PFL_MODE[0] = 2

    w("; start sequence: %d   sequences: %d   code tokens: %d\n" % (start, len(table) - 1, len(code)))
    if call_args:
        w("; subroutines taking inline arguments: %s\n" % ", ".join(
            "L%d(%d)" % kv for kv in sorted(call_args.items())))
    if errors:
        w("; DECODE ERRORS: %d\n" % len(errors))
        for p, e in errors:
            w(";   at %d: %s\n" % (p, e))
    sm = slot_map(data)
    if sm:
        w(";\n; graphic slots (frame N / slot N refer to these; loadgfx can replace them):\n")
        for slot, i, tag, desc in sm:
            w(";   slot %4d = chunk #%d  %s\n" % (slot, i, desc))
        w(";\n")
    w("; lines marked '~' are not reachable from the sequence table (speculative decode)\n\n")
    p = 0
    n = len(code)
    while p < n:
        if p in seq_at:
            w("\nseq%s:\n" % ",seq".join(str(s) for s in seq_at[p]))
        if p in labels:
            w("L%d:\n" % p)
        if p in insns:
            end, text = insns[p][:2]
            w("  %5d: %s\n" % (p, text))
            p = end
            continue
        q = p
        while q < n and q not in insns and q not in seq_at and (q == p or q not in labels):
            q += 1
        # speculative decode of unreached code
        i = p
        dstart = p
        while i < q:
            chain = []
            s = i
            while s < q and code[s] in OPS and code[s] != -32000 and (s == i or s not in prev_refs):
                try:
                    r, text, fl = decode_at(s)
                except (DecodeError, IndexError, KeyError, ValueError, TypeError, ZeroDivisionError):
                    break
                if r.pos > q:
                    break
                chain.append((s, text))
                s = r.pos
                if fl.get("term"):
                    break
            if len(chain) >= 2 or (chain and s == q):
                for line in render_data(code, dstart, i):
                    w(line)
                for pos, text in chain:
                    w(" ~%5d: %s\n" % (pos, text))
                i = dstart = s
            else:
                i += 1
        for line in render_data(code, dstart, q):
            w(line)
        p = q
    return errors


def render_data(code, p, q):
    """Format a run of non-code tokens: packed strings and numbers."""
    out = []
    nums = []
    start = p

    def flush(at):
        for k in range(0, len(nums), 16):
            out.append("  %5d: .data %s\n" % (at + k, " ".join(str(x) for x in nums[k:k + 16])))
        del nums[:]

    i = p
    while i < q:
        # try a string: >=2 tokens of printable bytes ending in a token with a 0 byte
        j = i
        b = bytearray()
        ok = False
        while j < q:
            t = code[j]
            bb = struct.pack("<i", t)
            b += bb
            j += 1
            if 0 in bb:
                txt = b.split(b"\0")[0]
                if len(txt) >= 4 and all(c >= 32 or c in (9, 10, 13) for c in txt) and \
                        all(c == 0 for c in b[len(txt):]):
                    ok = True
                break
            if not all(c >= 32 or c in (9, 10, 13) for c in bb):
                break
        if ok:
            flush(start)
            out.append("  %5d: .str %s\n" % (i, qstr(txt)))
            i = j
            start = i
            continue
        if not nums:
            start = i
        nums.append(code[i])
        i += 1
    flush(start)
    return out
def count_args(code, start, insns):
    """Number of 'arg' tokens a subroutine at start consumes (first linear path,
    stopping at end/return/goto)."""
    p = start
    total = 0
    seen = set()
    while p in insns and p not in seen:
        seen.add(p)
        end, _, used, term = insns[p]
        total += used
        if term:
            break
        p = end
    return total


def main(argv):
    path = argv[1]
    out = None
    if len(argv) > 3 and argv[2] == "-o":
        out = open(argv[3], "w", encoding="utf-8")
    data = open(path, "rb").read()
    errs = disassemble(data, out)
    if out:
        out.close()
    print("%s: %d decode errors" % (path, len(errs)))


if __name__ == "__main__":
    main(sys.argv)
