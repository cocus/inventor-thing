// Decoders for Invention Studio ("Taller de inventos") data files.
// Port of tools/invstudio.py. Everything is decoded from the original game
// files at run time; nothing is redistributed.
'use strict';

const TAG_BITMAP = 0x20;
const TAG_SPRITE = 0xF315;
const TAG_FRAME = 0xF515;

// ---------------------------------------------------------------- sprites (PFL)

// LZ-style decoder (exe sub_414630). Writes into dst, which already holds the
// previous frame for delta frames.
function lzDecode(src, pos, dst) {
  let o = 0;
  for (;;) {
    const b = src[pos++];
    if (b < 0x80) {
      if (b === 0) return pos;
      let n = b;
      if (b >= 0x40) n = ((b - 0x40) << 6) | (src[pos++] & 0x3F);
      dst.set(src.subarray(pos, pos + n), o);
      pos += n; o += n;
    } else {
      const a = (-b) & 0xFF;
      if (a & 0x80) return pos;
      let n = a;
      if (a >= 0x40) n = ((a - 0x40) << 6) | ((-src[pos++]) & 0x3F);
      let d = src[pos++];
      if (d === 0) { o += n; continue; }
      if (d >= 0x80) d = ((d - 0x80) << 7) | (src[pos++] & 0x7F);
      for (let i = 0; i < n; i++, o++) dst[o] = dst[o - d];
    }
  }
}

function readSprite(bytes, view, pos) {
  const count = bytes[pos + 13];
  pos += 14;
  const palette = [];
  for (let i = 0; i < count; i++, pos += 3) palette.push([bytes[pos], bytes[pos + 1], bytes[pos + 2]]);
  const frames = [];
  let prev = null;
  while (pos + 2 <= bytes.length && view.getUint16(pos, true) === TAG_FRAME) {
    const size = view.getUint16(pos + 2, true);
    const w = view.getUint16(pos + 6, true), h = view.getUint16(pos + 8, true);
    const x = view.getInt16(pos + 10, true), y = view.getInt16(pos + 12, true);
    const body = pos + 15;
    const buf = new Uint8Array(w * h);
    if (prev && prev.length === buf.length) buf.set(prev);
    lzDecode(bytes, body, buf);
    frames.push({ w, h, x, y, pixels: buf, palette, frame: true });
    prev = buf;
    pos = body + size;
  }
  return { sprite: true, palette, frames, end: pos };
}

// ---------------------------------------------------------------- bitmaps (0x20)

// RLE (exe sub_41CC00): 0 end, >=0x80 literal (c-0x7F), else run of c+1.
function rleDecode(src, pos, outSize) {
  const out = new Uint8Array(outSize);
  let o = 0;
  for (;;) {
    const c = src[pos++];
    if (c === 0 || o >= outSize) break;
    if (c >= 0x80) {
      const n = c - 0x7F;
      out.set(src.subarray(pos, pos + n), o);
      pos += n; o += n;
    } else {
      out.fill(src[pos++], o, o + c + 1);
      o += c + 1;
    }
  }
  return out;
}

function readBitmap(bytes, view, pos) {
  const cnt = view.getUint16(pos + 2, true);
  let p = pos + 4;
  const palette = [];
  for (let i = 0; i < cnt; i++, p += 4) palette.push([bytes[p + 2], bytes[p + 1], bytes[p]]);
  const size = view.getUint32(p, true);
  const w = view.getUint16(p + 4, true), h = view.getUint16(p + 6, true);
  const x = view.getInt16(p + 8, true), y = view.getInt16(p + 10, true);
  const kind = view.getUint16(p + 12, true);
  const body = p + 14;
  let bpp, packed;
  if (kind >= 0xACE1) {
    bpp = (kind & 0xFF) - 0xE1;
    packed = rleDecode(bytes, body + 4, view.getUint32(body, true));
  } else {
    bpp = kind;
    packed = bytes.subarray(body, body + size);
  }
  bpp = bpp || 8;
  const stride = Math.ceil(((w + 1) & ~1) * bpp / 8); // rows hold an even pixel count
  const pixels = new Uint8Array(w * h);
  const per = 8 / bpp, mask = (1 << bpp) - 1;
  for (let row = 0; row < h; row++) {
    const lo = row * stride, o = row * w;
    if (bpp === 8) { pixels.set(packed.subarray(lo, lo + w), o); continue; }
    for (let col = 0; col < w; col++) {
      const byte = packed[lo + ((col / per) | 0)] || 0;
      pixels[o + col] = (byte >> (8 - bpp * (col % per + 1))) & mask;
    }
  }
  return { w, h, x, y, kind, palette, pixels, end: body + size };
}

// ---------------------------------------------------------------- PAG walker

// Returns the graphics of a PAG file in order (graphic slot N = item N-1).
function parsePag(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const gfx = [];
  let pos = 0;
  const u16 = (p) => view.getUint16(p, true), u32 = (p) => view.getUint32(p, true);
  while (pos + 2 <= bytes.length) {
    const tag = u16(pos);
    let p = pos + 2;
    if (tag === 0x36 || tag === 0x37) {
      const elem = tag === 0x36 ? 4 : 2;
      p += 2;
      p += 2 + elem * u16(p);
      p += 2 + u16(p);
      p += 2;
    } else if (tag === TAG_BITMAP) {
      const bm = readBitmap(bytes, view, pos);
      gfx.push(bm);
      p = bm.end;
    } else if (tag === TAG_SPRITE) {
      const spr = readSprite(bytes, view, pos);
      gfx.push(spr);
      p = spr.end;
    } else if (tag === TAG_FRAME || tag === 120) {
      p += 2 + u16(p);
    } else if (tag === 0x38) {
      p += 17;
    } else if (tag === 0x39) {
      p += 2 + u16(p);
      p += 4 + u32(p);
    } else if (tag === 0x4D42) {
      p = pos + u32(pos + 2);
    } else if (tag >= 21 && tag <= 24) {
      p = p + u32(p + 2) + ((tag === 22 || tag === 24) ? 4 : 0);
    } else if (tag === 11) {
      p += 8 + u32(p + 4);
    } else if (tag === 50) {
      p += 12 + u32(p + 8);
    } else if (tag === 90) {
      p += 2;
    } else if (tag === 80) {
      p += 6;
    } else if (tag === 15 || tag === 39 || tag === 70) {
      // no payload
    } else {
      break; // 100 / 0x35EF end marker or unknown
    }
    pos = p;
  }
  return gfx;
}

function parsePfl(buffer) {
  const bytes = new Uint8Array(buffer);
  return readSprite(bytes, new DataView(buffer), 0);
}

// ---------------------------------------------------------------- canvases


// Which palette indexes are transparent. The game's transparent blitters
// (exe sub_403BB0 & co.) key on the value of the image's top-left pixel;
// sprite (PFL) frames key on 0.
function transparentSet(img) {
  return new Set([img.frame ? 0 : img.pixels[0]]);
}

// Turn a decoded bitmap/frame into a canvas, with its key colour transparent
// unless opaque is set.
function toCanvas(img, opaque) {
  const c = document.createElement('canvas');
  c.width = img.w; c.height = img.h;
  if (!img.w || !img.h) return c;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(img.w, img.h);
  const d = id.data, pal = img.palette, px = img.pixels;
  const keys = opaque ? new Set() : transparentSet(img);
  for (let i = 0; i < px.length; i++) {
    const v = px[i];
    if (keys.has(v)) continue;
    const col = pal[v];
    if (!col) continue; // index past the image's palette: treated as transparent
    d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

// Game file path for BDnnnn.EXT: files live in a folder named n/100.
function gamePath(num, ext) {
  return `${Math.floor(num / 100)}/BD${num}.${ext}`;
}
