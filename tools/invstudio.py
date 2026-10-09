"""Asset decoders for Discovery Channel's Invention Studio ("Taller de inventos").

File types:
  BDnnnn.PFL  - a single sprite/animation chunk (tag 0xF315)
  BDnnnn.PAG  - a stream of tagged chunks (bytecode, palettes, bitmaps, sprites)
  BDnnnn.STR  - plain cp1252 text
"""
import struct
import zlib

TAG_SPRITE = 0xF315
TAG_FRAME = 0xF515


# ---------------------------------------------------------------- PNG output

def write_png(path, width, height, rgba_rows):
    """rgba_rows: bytes of width*height*4."""
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw += rgba_rows[y * stride:(y + 1) * stride]

    def chunk(kind, data):
        c = struct.pack(">I", len(data)) + kind + data
        return c + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def indexed_to_rgba(pixels, palette, transparent=0):
    out = bytearray(len(pixels) * 4)
    for i, p in enumerate(pixels):
        if p == transparent:
            continue
        r, g, b = palette[p] if p < len(palette) else (255, 0, 255)
        out[i * 4:i * 4 + 4] = bytes((r, g, b, 255))
    return out


# ---------------------------------------------------------------- sprites

def lz_decode(src, pos, dst):
    """Port of sub_414630. Decodes into dst (bytearray, pre-filled with the
    previous frame for delta frames). Returns position after terminator."""
    o = 0
    n_src = len(src)
    while pos < n_src:
        b = src[pos]; pos += 1
        if b < 0x80:
            if b == 0:
                return pos
            n = b
            if b >= 0x40:
                n = ((b - 0x40) << 6) | (src[pos] & 0x3F); pos += 1
            dst[o:o + n] = src[pos:pos + n]
            pos += n
            o += n
        else:
            a = (-b) & 0xFF
            if a & 0x80:  # b == 0x80
                return pos
            n = a
            if a >= 0x40:
                n = ((a - 0x40) << 6) | ((-src[pos]) & 0x3F); pos += 1
            d = src[pos]; pos += 1
            if d == 0:
                o += n  # skip: keep what is already there
                continue
            if d >= 0x80:
                d = ((d - 0x80) << 7) | (src[pos] & 0x7F); pos += 1
            for _ in range(n):  # overlapping copy, byte by byte
                dst[o] = dst[o - d]
                o += 1
    return pos


class Frame:
    def __init__(self, width, height, x, y, flags, pixels):
        self.width, self.height, self.x, self.y = width, height, x, y
        self.flags = flags
        self.pixels = pixels


def read_sprite(data, pos=0):
    """Parse a 0xF315 sprite starting at pos (pointing at the tag).
    Returns (palette, frames, end_pos)."""
    tag, = struct.unpack_from("<H", data, pos)
    assert tag == TAG_SPRITE, hex(tag)
    hdr = data[pos + 2:pos + 14]
    count = hdr[11]
    pos += 14
    palette = []  # pixel value = palette index, 0 is transparent
    for i in range(count):
        palette.append(tuple(data[pos:pos + 3]))
        pos += 3
    frames = []
    prev = None
    while pos + 2 <= len(data) and struct.unpack_from("<H", data, pos)[0] == TAG_FRAME:
        size, w, h, x, y, flags = struct.unpack_from("<IHHhhB", data, pos + 2)
        size &= 0xFFFF
        body = pos + 2 + 13
        buf = bytearray(w * h)
        if prev is not None and len(prev) == len(buf):
            buf[:] = prev
        lz_decode(data, body, buf)
        frames.append(Frame(w, h, x, y, flags, bytes(buf)))
        prev = buf
        pos = body + size
    return palette, frames, pos, hdr


# ---------------------------------------------------------------- PAG chunks

def u16(data, pos):
    return struct.unpack_from("<H", data, pos)[0]


def u32(data, pos):
    return struct.unpack_from("<I", data, pos)[0]


def rle_decode(src, pos):
    """Port of sub_41CC00: 0=end, >=0x80 literal (c-0x7F), else run (c+1)."""
    out = bytearray()
    while True:
        c = src[pos]; pos += 1
        if c == 0:
            return bytes(out)
        if c >= 0x80:
            n = c - 0x7F
            out += src[pos:pos + n]; pos += n
        else:
            out += bytes((src[pos],)) * (c + 1); pos += 1


class Bitmap:
    def __init__(self, width, height, x, y, kind, palette, pixels):
        self.width, self.height, self.x, self.y = width, height, x, y
        self.kind = kind
        self.palette = palette  # list of (r, g, b)
        self.pixels = pixels    # one palette index per pixel, row-major


def read_bitmap(data, pos):
    """Parse a 0x20 chunk at pos (pointing at the tag)."""
    assert u16(data, pos) == 0x20
    cnt = u16(data, pos + 2)
    p = pos + 4
    palette = []
    for i in range(cnt):
        b, g, r, _ = data[p:p + 4]
        palette.append((r, g, b))
        p += 4
    size, w, h, x, y, kind = struct.unpack_from("<IHHhhH", data, p)
    body = p + 14
    if kind >= 0xACE1:
        bpp = (kind & 0xFF) - 0xE1
        packed = rle_decode(data, body + 4)
    else:
        bpp = kind
        packed = data[body:body + size]
    bpp = bpp or 8
    stride = (((w + 1) & ~1) * bpp + 7) // 8  # rows hold an even pixel count
    pixels = bytearray(w * h)
    per = 8 // bpp
    mask = (1 << bpp) - 1
    for row in range(h):
        line = packed[row * stride:(row + 1) * stride]
        o = row * w
        if bpp == 8:
            pixels[o:o + w] = line[:w].ljust(w, b"\0")
            continue
        for col in range(w):
            byte = line[col // per] if col // per < len(line) else 0
            shift = 8 - bpp * (col % per + 1)
            pixels[o + col] = (byte >> shift) & mask
    return Bitmap(w, h, x, y, kind, palette, bytes(pixels))


def walk_pag(data):
    """Yield (tag, start, end) for every chunk; mirrors sub_419700/sub_419CD0."""
    pos = 0
    n = len(data)
    while pos + 2 <= n:
        tag = u16(data, pos)
        start = pos
        p = pos + 2
        if tag in (0x36, 0x37):
            elem = 4 if tag == 0x36 else 2
            p += 2
            cnt = u16(data, p); p += 2 + elem * cnt
            m = u16(data, p); p += 2 + m
            p += 2
        elif tag == 0x20:
            cnt = u16(data, p); p += 2 + 4 * cnt
            size = u32(data, p); p += 14 + size
        elif tag == TAG_SPRITE:
            _, _, p, _ = read_sprite(data, pos)
        elif tag in (TAG_FRAME, 120):
            p += 2 + u16(data, p)
        elif tag == 0x38:
            p += 17
        elif tag == 0x39:
            m = u16(data, p); p += 2 + m
            p += 4 + u32(data, p)
        elif tag == 0x4D42:  # 'BM'
            p = pos + u32(data, pos + 2)
        elif tag in (21, 22, 23, 24):
            p = p + u32(data, p + 2) + (4 if tag in (22, 24) else 0)
        elif tag == 11:
            p += 8 + u32(data, p + 4)
        elif tag == 50:
            p += 12 + u32(data, p + 8)
        elif tag == 90:
            p += 2
        elif tag == 80:
            p += 6
        elif tag in (15, 39, 70):
            pass
        elif tag in (100, 13807, 0):
            yield tag, start, p
            return
        else:
            yield tag, start, None
            return
        yield tag, start, p
        pos = p
