// Editor + player for the "Taller de inventos" mouse maze.
'use strict';

const SCREEN_W = 640, SCREEN_H = 480;
const GREEN = '#5dff3a';

// ================================================================ files

const Files = {
  base: '../invention/',
  map: null, // Map of upper-case relative path -> File (folder picker)

  async get(rel) {
    if (this.map) {
      const f = this.map.get(rel.toUpperCase());
      if (!f) throw new Error('Falta el archivo ' + rel);
      return f.arrayBuffer();
    }
    const r = await fetch(this.base + rel);
    if (!r.ok) throw new Error('No se pudo leer ' + rel);
    return r.arrayBuffer();
  },

  url(rel) {
    if (this.map) {
      const f = this.map.get(rel.toUpperCase());
      return f ? URL.createObjectURL(f) : null;
    }
    return this.base + rel;
  },

  useFolder(fileList) {
    const map = new Map();
    for (const f of fileList) {
      // webkitRelativePath = "<picked folder>/60/BD6000.PAG"
      const parts = f.webkitRelativePath.split('/');
      for (let i = 1; i < parts.length; i++) map.set(parts.slice(i).join('/').toUpperCase(), f);
    }
    this.map = map;
  },

  // Use the CD image directly: index its ISO 9660 directories and serve each
  // file as a slice of the image (nothing is read until it's needed).
  async useIso(file) {
    const read = async (offset, size) => new Uint8Array(await file.slice(offset, offset + size).arrayBuffer());
    const SECTOR = 2048;
    const pvd = await read(16 * SECTOR, SECTOR);
    if (String.fromCharCode(...pvd.subarray(1, 6)) !== 'CD001') throw new Error('not an ISO 9660 image');
    const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
    const map = new Map();
    const walk = async (lba, size, prefix, depth) => {
      const dir = await read(lba * SECTOR, size);
      const v = dv(dir);
      let p = 0;
      while (p < dir.length) {
        const len = dir[p];
        if (len === 0) { p = (Math.floor(p / SECTOR) + 1) * SECTOR; continue; }
        const extent = v.getUint32(p + 2, true), bytes = v.getUint32(p + 10, true);
        const isDir = (dir[p + 25] & 2) !== 0;
        const nameLen = dir[p + 32];
        const raw = String.fromCharCode(...dir.subarray(p + 33, p + 33 + nameLen));
        p += len;
        if (raw === '\0' || raw === '\x01') continue; // "." and ".."
        const name = raw.replace(/;\d+$/, '').replace(/\.$/, '').toUpperCase();
        if (isDir) { if (depth < 8) await walk(extent, bytes, prefix + name + '/', depth + 1); }
        else map.set(prefix + name, file.slice(extent * SECTOR, extent * SECTOR + bytes));
      }
    };
    const root = pvd.subarray(156, 190);
    await walk(dv(root).getUint32(2, true), dv(root).getUint32(10, true), '', 0);
    this.map = map;
  },
};

// ================================================================ assets

const Assets = {
  pages: new Map(),
  canvases: new Map(),
  pfls: new Map(),
  texts: new Map(),

  async loadPage(num) {
    if (!this.pages.has(num)) this.pages.set(num, parsePag(await Files.get(gamePath(num, 'PAG'))));
    return this.pages.get(num);
  },

  // Graphic `slot` (1-based) of page `num`, as {cv, x, y, w, h}.
  img(num, slot, opaque) {
    const key = num + ':' + slot + (opaque ? 'o' : '');
    let e = this.canvases.get(key);
    if (!e) {
      const g = this.pages.get(num)[slot - 1];
      if (!g || g.sprite) return null;
      e = { cv: toCanvas(g, opaque), x: g.x, y: g.y, w: g.w, h: g.h };
      this.canvases.set(key, e);
    }
    return e;
  },

  async loadPfl(num) {
    if (!this.pfls.has(num)) {
      const spr = parsePfl(await Files.get(gamePath(num, 'PFL')));
      this.pfls.set(num, { frames: spr.frames, canvases: [] });
    }
    return this.pfls.get(num);
  },

  pflFrame(num, i) {
    const p = this.pfls.get(num);
    if (!p) return null;
    if (!p.canvases[i]) p.canvases[i] = toCanvas(p.frames[i], false);
    return p.canvases[i];
  },

  async text(num) {
    if (!this.texts.has(num)) {
      const buf = await Files.get(gamePath(num, 'STR'));
      const text = new TextDecoder('windows-1252').decode(buf);
      // STR records are padded with control characters.
      this.texts.set(num, text.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim());
    }
    return this.texts.get(num);
  },
};

// ================================================================ sound

const Sound = {
  enabled: true,
  urls: new Map(),
  loops: new Map(),

  url(num) {
    if (!this.urls.has(num)) this.urls.set(num, Files.url(gamePath(num, 'WAV')));
    return this.urls.get(num);
  },

  play(num) {
    if (!this.enabled || !num) return null;
    const u = this.url(num);
    if (!u) return null;
    const a = new Audio(u);
    a.play().catch(() => {});
    return a;
  },

  loop(num) {
    if (!this.enabled || this.loops.has(num)) return;
    const u = this.url(num);
    if (!u) return;
    const a = new Audio(u);
    a.loop = true;
    a.play().catch(() => {});
    this.loops.set(num, a);
  },

  stop(num) {
    const a = this.loops.get(num);
    if (a) { a.pause(); this.loops.delete(num); }
  },

  stopAll() {
    for (const n of [...this.loops.keys()]) this.stop(n);
  },

  // Background music: one looping track (channel 7 in the original).
  musicEnabled: true,
  musicNum: 0,
  musicEl: null,

  music(num) {
    if (num === this.musicNum && this.musicEl && !this.musicEl.paused) return;
    if (this.musicEl) { this.musicEl.pause(); this.musicEl = null; }
    this.musicNum = num;
    if (!num || !this.musicEnabled) return;
    const u = this.url(num);
    if (!u) return;
    const a = new Audio(u);
    a.loop = true;
    a.volume = 0.6;
    a.play().catch(() => {}); // blocked until the first user gesture; resume() retries
    this.musicEl = a;
  },

  resume() {
    if (this.musicEl && this.musicEl.paused && this.musicEnabled) this.musicEl.play().catch(() => {});
    else if (!this.musicEl && this.musicNum) this.music(this.musicNum);
  },

  setMusic(on) {
    this.musicEnabled = on;
    if (on) this.music(this.musicNum);
    else if (this.musicEl) { this.musicEl.pause(); this.musicEl = null; }
  },
};

const MUSIC_EDITOR = 4004, MUSIC_TEST = 4005;

// ================================================================ drawing helpers

let ctx;

function draw(num, slot, dx = 0, dy = 0, opaque = false) {
  const e = Assets.img(num, slot, opaque);
  if (e) ctx.drawImage(e.cv, e.x + dx, e.y + dy);
  return e;
}

function drawAt(num, slot, x, y, opaque = false) {
  const e = Assets.img(num, slot, opaque);
  if (e) ctx.drawImage(e.cv, x, y);
  return e;
}

function slotRect(num, slot) {
  const e = Assets.img(num, slot);
  return e ? { x: e.x, y: e.y, w: e.w, h: e.h } : { x: 0, y: 0, w: 0, h: 0 };
}

const inRect = (x, y, r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

function wrapText(text, x, y, maxW, lineH, maxLines, align) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  ctx.textAlign = align || 'left';
  const ax = align === 'center' ? x + maxW / 2 : x;
  lines.slice(0, maxLines || 99).forEach((l, i) => ctx.fillText(l, ax, y + i * lineH));
  ctx.textAlign = 'left';
  return lines.length;
}

function textStyle(size, color, bold) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = color || GREEN;
  ctx.textBaseline = 'top';
}

// ================================================================ layout for larger boards

// Larger boards widen/heighten the screen by whole cells. The 640x480
// backgrounds are stretched by repeating 30-px bands of plain artwork (a grid
// column/row, bamboo, starfield, the empty monitor) at chosen seams.
const Layout = { key: '', dx: 0, dy: 0, W: SCREEN_W, H: SCREEN_H, edBg: null, tfBg: null };

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Insert `dx` pixels of columns. Each region (rows y0..y1) gets its own seam
// `at` and repeats source columns sx..sx+sw (rows taken from the region
// itself, or tiled from sy..sy+sh when given).
function stretchH(src, dx, regions) {
  const out = newCanvas(src.width + dx, src.height), g = out.getContext('2d');
  for (const r of regions) {
    const h = r.y1 - r.y0;
    g.drawImage(src, 0, r.y0, r.at, h, 0, r.y0, r.at, h);
    for (let x = 0; x < dx; x += r.sw) {
      const w = Math.min(r.sw, dx - x);
      if (r.sh) {
        for (let y = 0; y < h; y += r.sh) {
          const th = Math.min(r.sh, h - y);
          g.drawImage(src, r.sx, r.sy, w, th, r.at + x, r.y0 + y, w, th);
        }
      } else {
        g.drawImage(src, r.sx, r.y0, w, h, r.at + x, r.y0, w, h);
      }
    }
    g.drawImage(src, r.at, r.y0, src.width - r.at, h, r.at + dx, r.y0, src.width - r.at, h);
  }
  return out;
}

// Same, inserting `dy` pixels of rows; regions are column ranges x0..x1.
function stretchV(src, dy, regions) {
  const out = newCanvas(src.width, src.height + dy), g = out.getContext('2d');
  for (const r of regions) {
    const w = r.x1 - r.x0;
    g.drawImage(src, r.x0, 0, w, r.at, r.x0, 0, w, r.at);
    for (let y = 0; y < dy; y += r.sh) {
      const h = Math.min(r.sh, dy - y);
      g.drawImage(src, r.x0, r.sy, w, h, r.x0, r.at + y, w, h);
    }
    g.drawImage(src, r.x0, r.at, w, src.height - r.at, r.x0, r.at + dy, w, src.height - r.at);
  }
  return out;
}

function buildEditorBg(dx, dy) {
  let bg = Assets.img(ED, 1, true).cv;
  if (dx) {
    bg = stretchH(bg, dx, [
      { y0: 0, y1: 30, at: 558, sx: 300, sw: 30 },     // top bamboo
      { y0: 30, y1: 340, at: 558, sx: 528, sw: 30 },   // one grid column
      // below the grid, between the buttons and the dial: starfield, then the
      // beige strip that runs under the buttons
      { y0: 340, y1: 386, at: 480, sx: 450, sw: 30, sy: 347, sh: 38 },
      { y0: 386, y1: 480, at: 480, sx: 450, sw: 30, sy: 462, sh: 18 },
    ]);
  }
  if (dy) {
    bg = stretchV(bg, dy, [
      { x0: 0, x1: 165, at: 304, sy: 300, sh: 30 },          // left metal panel
      { x0: 165, x1: bg.width, at: 304, sy: 274, sh: 30 },   // one grid row
    ]);
  }
  return bg;
}

function buildTestBg(dx, dy) {
  let bg = Assets.img(TF, 1, true).cv;
  if (dx) bg = stretchH(bg, dx, [{ y0: 0, y1: 480, at: 560, sx: 530, sw: 30 }]);
  if (dy) {
    bg = stretchV(bg, dy, [
      { x0: 0, x1: 125, at: 480, sy: 128, sh: 20 },          // texture under the left panels
      { x0: 125, x1: bg.width, at: 400, sy: 370, sh: 30 },   // empty monitor
    ]);
  }
  return bg;
}

// Rebuild for the current board size; returns true if the size changed.
function updateLayout() {
  const key = GRID_COLS + 'x' + GRID_ROWS;
  if (Layout.key === key) return false;
  Layout.key = key;
  Layout.dx = (GRID_COLS - STD_COLS) * CELL;
  Layout.dy = (GRID_ROWS - STD_ROWS) * CELL;
  Layout.W = SCREEN_W + Layout.dx;
  Layout.H = SCREEN_H + Layout.dy;
  Layout.edBg = buildEditorBg(Layout.dx, Layout.dy);
  Layout.tfBg = buildTestBg(Layout.dx, Layout.dy);
  return true;
}

const CHALLENGE_TITLES = [
  'El lavabo de los Ratones', 'El Señor Ratón viaja a Los Angeles', 'El destello de Helio del Señor Ratón',
  '¡Destrozar, deslumbrar y lavar!', 'La carrera', 'Larry Aéreo', '¡Buena Despedida!', 'Ratonlandia',
  'Enciende la mecha, Larry', '¡Altos Vuelos!',
];

function challengeSummary(n) {
  const ch = CHALLENGES[n - 1];
  const parts = [T('sumMice', ch.mice), T('sumBat', ch.maxBat)];
  if (ch.minConv) parts.push(T('sumConv', ch.minConv));
  if (ch.minElev) parts.push(T('sumElev', ch.minElev));
  for (const k of Object.keys(ch.req)) {
    parts.push(`${variantInfo(T_SPECIAL, k).title}${ch.req[k] > 1 ? ' ×' + ch.req[k] : ''}`);
  }
  if (ch.flag) parts.push(T('sumFlag'));
  return parts.join(' · ');
}

// Banner naming the active challenge; returns its rect (for clicks).
function drawChallengeBanner(n, x, y, w) {
  const r = { x, y, w, h: 26 };
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#ffe066';
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  textStyle(11, '#ffe066', true);
  ctx.fillText(T('challengeBanner', n, challengeTitle(n)), r.x + 6, r.y + 2);
  textStyle(10, '#c8ffb0');
  wrapText(challengeSummary(n), r.x + 6, r.y + 14, r.w - 12, 11, 1);
  return r;
}

// ================================================================ Howard

// Howard's talking head (104/BD10400.PAG, 76 frames of 141x141 with origin
// (118,36)). Lip sync as in the scripts (BD6010 seq320..326): while a voice
// plays, pick a mouth shape, play its frame range forwards or backwards at
// 30-50 ms per frame, repeat. Idle: an occasional blink (frame 16).
const HOWARD_PAGE = 10400;
const MOUTH = [1, 20, 21, 22, 42, 46, 50, 54, 58, 62, 66, 70, 74]; // code[9988..]
const TALK_SHAPES = [6, 4, 5, 1, 7, 1, 8, 9, 10, 11];             // code[10001..]

class Howard {
  constructor(x, y) {
    this.x = x; this.y = y; // object position; the frames add their own origin
    this.audio = null;
    this.frames = null;     // current mouth frames being played
    this.next = 0;          // time of the next mouth frame
    this.blinkAt = performance.now() + 3000 + Math.random() * 5000;
  }

  say(wav) {
    this.stop();
    this.audio = Sound.play(wav);
  }

  stop() {
    if (this.audio) { this.audio.pause(); this.audio = null; }
    this.frames = null;
  }

  get talking() {
    const a = this.audio;
    return !!a && !a.paused && !a.ended;
  }

  update(now) {
    if (now < this.next) return;
    if (this.frames && this.frames.length) {
      this.frame = this.frames.shift();
      this.next = now + (this.frame === 16 ? 250 : 30 + Math.random() * 20);
      return;
    }
    this.frame = null;
    if (this.talking) {
      const s = TALK_SHAPES[Math.floor(Math.random() * TALK_SHAPES.length)];
      const f = [];
      for (let n = MOUTH[s]; n < MOUTH[s + 1]; n++) f.push(n);
      this.frames = Math.random() < 0.5 ? f : f.reverse();
      this.next = now;
    } else if (now >= this.blinkAt) {
      this.frames = [16];
      this.blinkAt = now + 3000 + Math.random() * 5000;
      this.next = now;
    } else {
      this.next = now + 50;
    }
  }

  draw(now, dx = 0, dy = 0) {
    this.update(now);
    draw(HOWARD_PAGE, 1, this.x + dx, this.y + dy);
    if (this.frame) draw(HOWARD_PAGE, 1 + this.frame, this.x + dx, this.y + dy);
  }
}

// ================================================================ persistence

const Store = {
  get(key, def) {
    try { const v = localStorage.getItem('maze.' + key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
  },
  set(key, v) {
    try { localStorage.setItem('maze.' + key, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
  },
};

// ================================================================ editor (BD6000)

const ED = 6000;
const ARROW_SLOTS = [25, 26, 34, 35];
const CHW_X = -242, CHW_Y = 333; // challenge widget object position

// Pressed look: shift a button down-right by a pixel. With no drawFn the
// button is part of the background and is copied from it.
function nudge(bg, r, drawFn) {
  ctx.save();
  if (!drawFn) {
    ctx.drawImage(bg, r.x, r.y, r.w + 1, r.h + 1, r.x, r.y, r.w + 1, r.h + 1);
    ctx.translate(1, 1);
    ctx.drawImage(bg, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  } else {
    ctx.translate(1, 1);
    drawFn();
  }
  ctx.restore();
}

class EditorScreen {
  constructor(app) {
    this.app = app;
    this.catIdx = 0;
    this.variant = new Array(8).fill(0);
    this.drag = null;
    this.pressed = null;
    this.hover = -1;
    this.mx = 0; this.my = 0;
    this.flash = null;
    this.buttons = [
      { id: 'catPrev', slot: 34 }, { id: 'catNext', slot: 35 },
      { id: 'varPrev', slot: 25 }, { id: 'varNext', slot: 26 },
      { id: 'clear', slot: 29 }, { id: 'test', slot: 30 },
      { id: 'print', slot: 31 }, { id: 'challenge', slot: 32 },
    ].map((b) => Object.assign(b, slotRect(ED, b.slot), { low: b.slot >= 29 && b.slot <= 32 })); // bottom row
    this.banner = null;
    this.peek = false; // challenge solution shown while its button is held
    this.previewBox = { x: 12, y: 113, w: 123, h: 132 };
  }

  // The buttons below the grid move down on taller boards.
  rectOf(b) { return b.low ? { x: b.x, y: b.y + Layout.dy, w: b.w, h: b.h } : b; }

  get design() { return this.app.design; }
  get type() { return CATEGORY_ORDER[this.catIdx]; }

  partIcon(type, v) { return TYPES[type].placedIcon + v; }

  draw(now) {
    ctx.drawImage(Layout.edBg, 0, 0);
    const dy = Layout.dy;
    // while the challenge button is held, the solution replaces the parts
    if (this.peek) draw(6006, this.app.challenge, 0, 0, true);
    // placed parts
    this.design.parts.forEach((p, i) => {
      if (this.peek || (this.drag && this.drag.index === i)) return;
      drawAt(ED, this.partIcon(p.type, p.v), ED_X + CELL * p.c, ED_Y + CELL * p.r);
    });
    if (this.hover >= 0 && !this.drag) {
      const p = this.design.parts[this.hover];
      const { cols, rows } = partSize(p.type, p.v);
      ctx.strokeStyle = 'rgba(255,255,120,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ED_X + CELL * p.c + 0.5, ED_Y + CELL * p.r + 0.5, cols * CELL + 1, rows * CELL);
    }
    // category name
    const t = this.type, v = this.variant[t];
    textStyle(12, GREEN, true);
    wrapText(typeName(t), 8, 54, 124, 13, 1, 'center');
    // palette preview
    const stock = this.design.stock(t);
    const pal = Assets.img(ED, TYPES[t].paletteIcon + v);
    if (stock <= 0) draw(ED, 23, 41, 172); // keyed: dark text on the black viewer
    else if (pal) ctx.drawImage(pal.cv, Math.round(73 - pal.w / 2), Math.round(179 - pal.h / 2));
    // variant counter + stock
    textStyle(10, GREEN);
    ctx.textAlign = 'center';
    ctx.fillText(`${v + 1} / ${TYPES[t].variants}`, 73, 232);
    ctx.textAlign = 'left';
    // description: hovered part, or the current palette part
    let info = variantInfo(t, v), infoStock = stock;
    if (this.hover >= 0 && !this.drag) {
      const p = this.design.parts[this.hover];
      info = variantInfo(p.type, p.v); infoStock = null;
    }
    textStyle(12, GREEN, true);
    wrapText(info.title, 14, 348 + dy, 212, 14, 2);
    textStyle(11, GREEN);
    const n = wrapText(info.text, 14, 366 + dy, 212, 13, 6);
    if (infoStock != null && isFinite(TYPES[t].stock)) {
      textStyle(11, '#c8ffb0', true);
      ctx.fillText(T('available', Math.max(0, infoStock)), 14, Math.min(366 + n * 13 + 4, 452) + dy);
    }
    // pressed button. The arrows' own pressed images are dithered highlights
    // that look broken in true colour, so they get nudged by a pixel instead.
    if (this.pressed) {
      const b = this.pressed;
      if (ARROW_SLOTS.includes(b.slot)) nudge(Layout.edBg, b);
      else draw(ED, b.slot, 0, b.low ? dy : 0);
    }
    if (this.app.challenge) this.drawChallengeWidget();
    this.app.howard.draw(now, Layout.dx, Layout.dy);
    // active challenge (click to see its card)
    this.banner = this.app.challenge ? drawChallengeBanner(this.app.challenge, 168, 3, 422 + Layout.dx) : null;
    // drag ghost
    if (this.drag) this.drawDrag();
    if (this.flash && now < this.flash.until) {
      const fw = 420 + Layout.dx, fy = 300 + dy;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(170, fy, fw, 32);
      textStyle(13, '#ffdf4a', true);
      wrapText(this.flash.text, 176, fy + 9, fw - 12, 15, 1, 'center');
    }
  }

  // Active-challenge widget under the grid (BD6000 seq95/96/98/99): panel,
  // label, challenge number and a button that shows the solution blueprint
  // (BD6006) while held. The objects sit at (-242, 333) + each slot's position.
  drawChallengeWidget() {
    const ox = CHW_X, oy = CHW_Y + Layout.dy;
    draw(ED, 74, ox, oy);
    draw(ED, 75, ox, oy);
    draw(ED, 78 + this.app.challenge, ox, oy);
    const btn = this.peekRect();
    if (this.peek) nudge(Layout.edBg, btn, () => draw(ED, 77, ox, oy));
    else draw(ED, 77, ox, oy);
  }

  peekRect() {
    const r = slotRect(ED, 77);
    return { x: r.x + CHW_X, y: r.y + CHW_Y + Layout.dy, w: r.w, h: r.h };
  }

  drawDrag() {
    const d = this.drag;
    const gx = this.mx - d.offX, gy = this.my - d.offY;
    const cell = this.cellFor(gx, gy);
    const part = { type: d.type, v: d.v, r: cell.r, c: cell.c };
    const { cols, rows } = partSize(d.type, d.v);
    if (cell.r >= 0 && cell.c >= 0 && cell.r < GRID_ROWS && cell.c < GRID_COLS) {
      const ok = this.design.canPlace(part, -1);
      ctx.fillStyle = ok ? 'rgba(80,255,80,0.25)' : 'rgba(255,60,60,0.3)';
      for (const pc of partCells(part)) {
        if (inGrid(pc.r, pc.c)) ctx.fillRect(ED_X + CELL * pc.c + 2, ED_Y + CELL * pc.r + 1, CELL - 2, CELL - 2);
      }
    }
    ctx.globalAlpha = 0.85;
    drawAt(ED, this.partIcon(d.type, d.v), gx, gy);
    ctx.globalAlpha = 1;
    void cols; void rows;
  }

  cellFor(gx, gy) {
    return { c: Math.floor((gx - ED_X + 15) / CELL), r: Math.floor((gy - ED_Y + 15) / CELL) };
  }

  onMove(x, y) {
    this.mx = x; this.my = y;
    if (this.drag) return;
    const r = Math.floor((y - ED_Y) / CELL), c = Math.floor((x - ED_X) / CELL);
    this.hover = inGrid(r, c) ? this.design.partAt(r, c) : -1;
  }

  // Wheel over the left panel: top part cycles categories, the rest variants.
  onWheel(x, y, dir) {
    if (x > 160 || !dir || this.drag) return false;
    const t = this.type;
    if (y < 110) this.catIdx = (this.catIdx + 8 + dir) % 8;
    else this.variant[t] = (this.variant[t] + TYPES[t].variants + dir) % TYPES[t].variants;
    Sound.play(1022);
    return true;
  }

  onDown(x, y, button) {
    this.mx = x; this.my = y;
    // Howard greets on the first click (audio can't start before one):
    // 6994 on the very first visit, then one of 6000..6003.
    if (!this.greeted) {
      this.greeted = true;
      const first = !Store.get('greeted', false);
      Store.set('greeted', true);
      this.app.howard.say(first ? 6994 : 6000 + Math.floor(Math.random() * 4));
    }
    // A part picked up with a plain click is dropped with the next click.
    if (this.drag) { this.dropDrag(x, y); return; }
    if (this.app.challenge && inRect(x, y, this.peekRect())) { this.peek = true; Sound.play(1022); return; }
    for (const b of this.buttons) {
      if (inRect(x, y, this.rectOf(b))) { this.pressed = b; return; }
    }
    if (this.banner && inRect(x, y, this.banner)) { this.app.openChallenges(this.app.challenge); return; }
    const r = Math.floor((y - ED_Y) / CELL), c = Math.floor((x - ED_X) / CELL);
    if (inGrid(r, c)) {
      const i = this.design.partAt(r, c);
      if (i < 0) return;
      const p = this.design.parts[i];
      if (button === 2) { // right click deletes
        this.design.parts.splice(i, 1);
        Sound.play(SND.remove);
        this.hover = -1;
        this.app.changed();
        return;
      }
      this.drag = { index: i, type: p.type, v: p.v, offX: x - (ED_X + CELL * p.c), offY: y - (ED_Y + CELL * p.r), sx: x, sy: y, fresh: true };
      Sound.play(SND.pick);
      return;
    }
    if (inRect(x, y, this.previewBox)) {
      const t = this.type;
      if (this.design.stock(t) <= 0) { Sound.play(SND.error); return; }
      const icon = Assets.img(ED, this.partIcon(t, this.variant[t]));
      this.drag = { index: -1, type: t, v: this.variant[t], offX: Math.min(15, icon.w / 2), offY: Math.min(15, icon.h / 2), sx: x, sy: y, fresh: true };
      Sound.play(SND.pick);
    }
  }

  onUp(x, y) {
    this.mx = x; this.my = y;
    if (this.peek) { this.peek = false; return; }
    if (this.pressed) {
      const b = this.pressed;
      this.pressed = null;
      if (inRect(x, y, this.rectOf(b))) this.click(b.id);
      return;
    }
    if (!this.drag) return;
    // Press-drag-release drops here; a click without moving keeps carrying.
    const d = this.drag;
    if (d.fresh) {
      d.fresh = false;
      if (Math.hypot(x - d.sx, y - d.sy) < 5) return;
    } else {
      return;
    }
    this.dropDrag(x, y);
  }

  dropDrag(x, y) {
    const d = this.drag;
    this.drag = null;
    const cell = this.cellFor(x - d.offX, y - d.offY);
    const part = { type: d.type, v: d.v, r: cell.r, c: cell.c };
    const { cols, rows } = partSize(d.type, d.v);
    const outside = cell.c < 0 || cell.r < 0 || cell.c + cols > GRID_COLS || cell.r + rows > GRID_ROWS;
    if (outside) {
      // Dropping off the board removes the part (returns it to stock).
      if (d.index >= 0) {
        this.design.parts.splice(d.index, 1);
        Sound.play(SND.remove);
        this.app.changed();
      }
      this.onMove(x, y);
      return;
    }
    if (this.design.canPlace(part, d.index)) {
      if (d.index >= 0) this.design.parts[d.index] = part; else this.design.parts.push(part);
      Sound.play(SND.drop);
      this.app.changed();
    } else {
      Sound.play(SND.error);
    }
    this.onMove(x, y);
  }

  click(id) {
    const t = this.type;
    switch (id) {
      case 'catPrev': this.catIdx = (this.catIdx + 7) % 8; break;
      case 'catNext': this.catIdx = (this.catIdx + 1) % 8; break;
      case 'varPrev': this.variant[t] = (this.variant[t] + TYPES[t].variants - 1) % TYPES[t].variants; break;
      case 'varNext': this.variant[t] = (this.variant[t] + 1) % TYPES[t].variants; break;
      case 'clear':
        this.app.confirm(T('clearAll'), () => {
          this.design.parts.length = 0;
          this.app.changed();
        });
        break;
      case 'test':
        if (!this.design.countType(T_START) || !this.design.countType(T_END)) {
          Sound.play(SND.error);
          this.app.howard.say(SND.missing);
          this.message(T('needStartEnd'));
          return;
        }
        this.app.showTest();
        break;
      case 'print': this.app.openSaves(); break;
      case 'challenge':
        if (!isStdSize()) {
          Sound.play(SND.error);
          this.message(T('challengesStd'));
          return;
        }
        this.app.openChallenges();
        break;
    }
    Sound.play(1022);
  }

  message(text) {
    this.flash = { text, until: performance.now() + 3500 };
  }
}

// ================================================================ test floor (BD6010)

const TF = 6010;

const tileX = (img, c) => img.x - TILE_REF_X + TEST_X + CELL * c;
const tileY = (img, r) => img.y - TILE_REF_Y + TEST_Y + CELL * r;

class TestScreen {
  constructor(app) {
    this.app = app;
    this.design = new Design(app.design.parts.map((p) => Object.assign({}, p)));
    this.buttons = [0, 1, 2, 3, 4, 5, 6].map((i) => Object.assign({ id: i, slot: 25 + i }, slotRect(TF, 25 + i)));
    this.pressed = null;
    this.howard = new Howard(-118, -30); // the top-left porthole (BD6010 code[2885])
    this.reset();
    this.preload();
  }

  async preload() {
    const nums = new Set();
    for (const p of this.design.parts) if (p.type === T_SPECIAL) SPECIALS[p.v].pfl.forEach((n) => nums.add(n));
    for (const n of nums) {
      try { await Assets.loadPfl(n); } catch (e) { console.warn(e); }
    }
  }

  reset() {
    Sound.stopAll();
    this.board = new Board(this.design);
    this.state = 'idle';
    this.paused = false;
    this.mouse = null;
    this.run = null;
    this.pending = null;
    this.waitUntil = 0;
    this.lifts = new Map();
    this.gadgetAnim = null;
    this.hatch = null;
    this.endAnim = null;
    this.successes = 0;
    this.waits = 0;
    this.message = null;
    this.challengeDone = false;
  }

  get stepMs() { return this.app.stepMs; }

  // ------------------------------------------------------------ control

  start() {
    if (this.state !== 'idle') return;
    const ch = this.app.challenge ? CHALLENGES[this.app.challenge - 1] : null;
    if (ch && this.board.batteries.length > ch.maxBat) {
      this.howard.say(SND.tooManyBatteries);
      this.message = T('maxBatteries', ch.maxBat);
      return;
    }
    this.state = 'running';
    Sound.loop(SND.run);
    this.launchMouse();
  }

  launchMouse() {
    this.stats = newStats();
    this.run = new MouseRun(this.board, this.stats);
    this.waits = 0;
    this.endAnim = null;
    this.mouse = null;
    this.hatch = { t0: performance.now() };
    Sound.play(SND.hatch);
    this.schedule(8 * 90, () => {
      this.mouse = { r: this.run.r, c: this.run.c, from: [this.run.r, this.run.c], t0: 0, dur: 0, frame: 108, visible: true };
      this.schedule(this.stepMs, () => this.doStep());
    });
  }

  schedule(ms, fn) {
    this.waitUntil = performance.now() + ms;
    this.pending = fn;
  }

  doStep() {
    const ev = this.run.step();
    const m = this.mouse;
    const now = performance.now();
    switch (ev.type) {
      case 'wait': {
        this.waits++;
        // Nothing drains when no battery feeds anything: the original would
        // wait forever; report the missing power instead.
        const totalLoad = this.board.batteries.reduce((s, b) => s + b.load, 0);
        if (totalLoad === 0 && this.waits > 6) { this.fail(2); return; }
        this.schedule(this.stepMs / 4, () => this.doStep());
        return;
      }
      case 'fail':
        this.howard.say(ev.panel === 3 ? SND.batteryDead : SND.blocked);
        this.fail(ev.panel);
        return;
      case 'arrive':
        m.visible = false;
        this.endAnim = { r: ev.r, c: ev.c, t0: now };
        Sound.play(SND.arrive);
        this.schedule(45 * 70 + 300, () => this.arrived());
        return;
    }
    // move
    let delay = 0;
    if (ev.turn !== null) {
      m.turn = { t0: now, to: ev.turn };
      delay = 4 * 70;
    }
    if (ev.lift !== undefined) {
      const lift = { t0: now + delay, up: 2 * this.stepMs };
      this.lifts.set(ev.lift, lift);
      Sound.play(SND.liftUp);
      setTimeout(() => { if (this.lifts.get(ev.lift) === lift) Sound.play(SND.liftDown); }, delay + 2 * lift.up);
    }
    if (ev.gadgetStart !== undefined && ev.gadgetPowered) this.startGadget(ev.gadgetStart);
    this.waits = 0;
    m.from = [m.r, m.c];
    m.r = ev.to[0]; m.c = ev.to[1];
    m.t0 = now + delay; m.dur = this.stepMs;
    m.visible = !ev.hidden;
    if (ev.gadgetExit !== undefined) {
      this.schedule(delay + this.stepMs, () => this.waitGadget());
    } else {
      this.schedule(delay + this.stepMs, () => this.doStep());
    }
  }

  startGadget(index) {
    const p = this.design.parts[index];
    const s = SPECIALS[p.v];
    const num = s.pfl[Math.floor(Math.random() * s.pfl.length)];
    const pfl = Assets.pfls.get(num);
    if (!pfl) return;
    const sounds = num === 6011 ? s.sounds6011 : s.sounds;
    const total = s.doneAt ? Math.min(s.doneAt, pfl.frames.length) : pfl.frames.length;
    this.gadgetAnim = { index, num, t0: performance.now(), frames: pfl.frames.length, doneAt: total, sounds: sounds || {}, played: new Set(), frameMs: 70 };
  }

  waitGadget() {
    const g = this.gadgetAnim;
    if (g && performance.now() < g.t0 + g.doneAt * g.frameMs) {
      this.schedule(50, () => this.waitGadget());
      return;
    }
    this.mouse.visible = true;
    this.mouse.from = [this.mouse.r, this.mouse.c];
    this.mouse.dur = 0;
    this.schedule(this.stepMs / 2, () => this.doStep());
  }

  fail(panel) {
    this.state = 'over';
    // The mouse takes its fail pose in front of the tiles (BD6010 seq286).
    if (this.mouse) { this.mouse.failPose = true; this.mouse.visible = true; }
    Sound.stop(SND.run);
    this.schedule(1600, () => this.app.showScore({ panel, ok: false, board: this.board, stats: this.stats }));
  }

  arrived() {
    const ch = this.app.challenge ? CHALLENGES[this.app.challenge - 1] : null;
    if (!ch) {
      this.state = 'over';
      Sound.stop(SND.run);
      this.howard.say(SND.success[Math.floor(Math.random() * 3)]);
      this.app.showScore({ panel: 0, ok: true, board: this.board, stats: this.stats });
      return;
    }
    const why = checkChallenge(ch, this.stats);
    if (why) {
      this.state = 'over';
      Sound.stop(SND.run);
      this.howard.say(SND.chFail);
      this.schedule(1500, () => this.howard.say([0, SND.chConv, SND.chElev, SND.chParts][why]));
      this.app.showScore({ panel: 4, ok: true, board: this.board, stats: this.stats, why });
      return;
    }
    this.successes++;
    if (this.successes < ch.mice) {
      this.message = T('mouseDone', this.successes, ch.mice);
      this.schedule(800, () => this.launchMouse());
      return;
    }
    this.state = 'over';
    Sound.stop(SND.run);
    this.challengeDone = true;
    const solved = Store.get('solved', []);
    if (!solved.includes(this.app.challenge)) solved.push(this.app.challenge);
    Store.set('solved', solved);
    for (const b of this.board.batteries) b.charge = 1000;
    this.howard.say(solved.length >= 10 ? SND.chAllDone : SND.chDone);
    this.app.showScore({ panel: 1, ok: true, board: this.board, stats: this.stats });
  }

  update(now) {
    if (this.paused) return;
    if (this.pending && now >= this.waitUntil) {
      const f = this.pending;
      this.pending = null;
      f();
    }
    const g = this.gadgetAnim;
    if (g) {
      const f = Math.floor((now - g.t0) / g.frameMs);
      for (const k of Object.keys(g.sounds)) {
        if (f >= k && !g.played.has(k)) { g.played.add(k); Sound.play(g.sounds[k]); }
      }
      if (f >= g.frames) this.gadgetAnim = null;
    }
  }

  // ------------------------------------------------------------ input

  onMove() {}

  // Buttons 3..6 sit in the top-right corner and move right on wider boards.
  rectOf(b) { return b.id >= 3 ? { x: b.x + Layout.dx, y: b.y, w: b.w, h: b.h } : b; }

  onDown(x, y) {
    for (const b of this.buttons) {
      if (inRect(x, y, this.rectOf(b))) { this.pressed = b; return; }
    }
  }

  onUp(x, y) {
    const b = this.pressed;
    this.pressed = null;
    if (!b || !inRect(x, y, this.rectOf(b))) return;
    Sound.play(1022);
    switch (b.id) {
      case 0: this.start(); break;
      case 1:
        if (this.state === 'running') {
          this.paused = !this.paused;
          if (this.paused) { this.pauseAt = performance.now(); Sound.stop(SND.run); } else {
            const dt = performance.now() - this.pauseAt;
            this.waitUntil += dt;
            if (this.mouse) this.mouse.t0 += dt;
            if (this.gadgetAnim) this.gadgetAnim.t0 += dt;
            for (const v of this.lifts.values()) v.t0 += dt;
            Sound.loop(SND.run);
          }
        }
        break;
      case 2: this.reset(); break;
      case 3: this.app.snapshot(); break;
      case 4: case 6: Sound.stopAll(); this.app.showEditor(); break;
      case 5: this.app.showHelp(); break;
    }
  }

  // ------------------------------------------------------------ drawing

  draw(now) {
    const t = this.paused ? this.pauseAt : now;
    const dx = Layout.dx, dy = Layout.dy;
    ctx.drawImage(Layout.tfBg, 0, 0);
    draw(TF, 2, dx);
    draw(TF, this.challengeDone ? 4 : 3, dx);
    for (const b of this.buttons) draw(TF, this.pressed === b ? 42 + b.id : b.slot, b.id >= 3 ? dx : 0);
    this.howard.draw(now);
    if (this.app.challenge) drawChallengeBanner(this.app.challenge, 150, 104, 455 + dx);
    // battery list
    this.board.batteries.forEach((bat, i) => {
      draw(TF, 32 + i);
      textStyle(11, bat.charge > 250 ? GREEN : '#ff5050', true);
      ctx.fillText(String(Math.max(0, bat.charge)), 55, 175 + 25 * i);
    });
    // specials behind the mouse
    this.design.parts.forEach((p, i) => { if (p.type === T_SPECIAL && SPECIAL_BEHIND[p.v]) this.drawSpecial(p, i, t); });
    const failPose = this.mouse && this.mouse.failPose;
    if (!failPose) this.drawMouse(t);
    for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) this.drawTile(r, c, t);
    this.design.parts.forEach((p, i) => { if (p.type === T_SPECIAL && !SPECIAL_BEHIND[p.v]) this.drawSpecial(p, i, t); });
    if (failPose) this.drawMouse(t);
    if (this.message) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(176, 440 + dy, 420 + dx, 24);
      textStyle(12, '#ffdf4a', true);
      wrapText(this.message, 180, 446 + dy, 412 + dx, 14, 1, 'center');
    }
    if (this.paused) {
      textStyle(16, '#ffdf4a', true);
      ctx.fillText(T('pause'), 360 + dx / 2, 100);
    }
  }

  tileSlot(r, c, t) {
    const b = this.board;
    const code = b.code(r, c);
    const powered = b.powered(r, c);
    if (code === 40) {
      const k = b.batteries.findIndex((x) => x.r === r && x.c === c);
      return 61 + k;
    }
    if (code === 50) {
      if (!this.hatch) return 94;
      const f = Math.floor((t - this.hatch.t0) / 90);
      return 95 + Math.min(f, 7);
    }
    if (code === 51) {
      const e = this.endAnim;
      if (!e || e.r !== r || e.c !== c) return 155;
      return 155 + Math.min(44, Math.floor((t - e.t0) / 70));
    }
    if (code === 1 || code === 2) {
      if (!powered || this.state !== 'running' || this.paused) return 72;
      const phase = Math.floor(t / 150) + r + c;
      return 72 + (code === 1 ? phase % 4 : 3 - (phase % 4));
    }
    if (code === 3 || code === 5) {
      // Cab frames 76 (bottom) .. 87 (top): it rises two cells while the
      // mouse glides bottom -> shaft -> top, waits, then goes back down.
      const lift = this.lifts.get(b.owner[cellIndex(r, c)]);
      if (lift === undefined || t < lift.t0) return 76;
      const e = t - lift.t0, up = lift.up, hold = lift.up;
      if (e < up) return 76 + Math.min(11, Math.floor(e / up * 12));
      if (e < up + hold) return 87;
      if (e < 2 * up + hold) return 87 - Math.min(11, Math.floor((e - up - hold) / up * 12));
      return 76;
    }
    const row = TEST_TILES[code];
    if (!row) return 0;
    return powered ? row[(r + c) % 2] : row[2];
  }

  drawTile(r, c, t) {
    const code = this.board.code(r, c);
    if (!code || code === 4 || code === 6 || code >= 80) return;
    const slot = this.tileSlot(r, c, t);
    const img = slot && Assets.img(TF, slot);
    if (img) ctx.drawImage(img.cv, tileX(img, c), tileY(img, r));
  }

  drawSpecial(p, index, t) {
    const s = SPECIALS[p.v];
    const ar = p.r + s.A[0], ac = p.c + s.A[1];
    const img = Assets.img(TF, 111 + p.v);
    const off = s.offset || [0, 0];
    const x = tileX(img, ac) + off[0], y = tileY(img, ar) + off[1];
    const g = this.gadgetAnim;
    if (g && g.index === index) {
      const f = Math.min(g.frames - 1, Math.floor((t - g.t0) / g.frameMs));
      const cv = Assets.pflFrame(g.num, f);
      if (cv) { ctx.drawImage(cv, x, y); return; }
    }
    ctx.drawImage(img.cv, x, y);
  }

  drawMouse(t) {
    const m = this.mouse;
    if (!m || !m.visible) return;
    let k = m.dur > 0 ? (t - m.t0) / m.dur : 1;
    k = Math.max(0, Math.min(1, k));
    const r = m.from[0] + (m.r - m.from[0]) * k;
    const c = m.from[1] + (m.c - m.from[1]) * k;
    let frame = this.run && this.run.facing === D_RIGHT ? 103 : 108;
    if (m.failPose) frame = 103; else if (m.turn) {
      const f = Math.floor((t - m.turn.t0) / 70);
      if (f < 4) frame = m.turn.to === D_RIGHT ? 107 - f : 104 + f;
      else m.turn = null;
    }
    const img = Assets.img(TF, frame);
    if (img) ctx.drawImage(img.cv, Math.round(tileX(img, c)), Math.round(tileY(img, r)));
  }
}

// ================================================================ score (BD6021)

const SC = 6021;

class ScoreOverlay {
  constructor(app, result) {
    this.app = app;
    const { board, stats, ok } = result;
    this.result = result;
    this.values = [
      board.batteries.length, stats.conveyor, stats.elevator,
      stats.uses.reduce((a, b) => a + b, 0), board.connectorCount(),
    ];
    this.score = computeScore(board, stats, ok);
    this.rank = rankOf(this.score);
    this.t0 = performance.now();
    this.close = slotRect(SC, 40);
    Sound.play(SND.scoreOpen);
    if (result.panel <= 1) setTimeout(() => Sound.play(SND.fanfare[this.rank]), 900);
  }

  drawNumber(n, x, y) {
    for (const ch of String(n)) {
      const e = drawAt(SC, 2 + Number(ch), x, y);
      x += e ? e.w + 1 : 14;
    }
  }

  draw(now) {
    drawAt(SC, 1, 0, 0, true);
    draw(SC, 12);
    const ys = [65, 127, 193, 254, 322];
    this.values.forEach((v, i) => this.drawNumber(v, 130, ys[i] - 8));
    draw(SC, 29);
    const showRank = Math.floor((now - this.t0) / 3000) % 2 === 1;
    if (showRank) {
      draw(SC, 46);
      draw(SC, 47 + this.rank);
    } else {
      // The TOTAL graphic has a "0" baked in; draw just the label.
      const e = Assets.img(SC, 45);
      ctx.drawImage(e.cv, 0, 0, 90, e.h, e.x, e.y, 90, e.h);
      this.drawNumber(this.score, 330, 409);
    }
    draw(SC, 32);
    // result text (AYUDA panel)
    draw(TF, 19 + this.result.panel);
  }

  onMove() {}
  onDown() {}
  onUp(x, y) {
    if (inRect(x, y, this.close)) {
      Sound.play(10091);
      this.app.closeOverlay();
      this.app.screen.reset();
    }
  }
}

// ================================================================ challenges (BD6011/BD6012)

const CH = 6011;

class ChallengeOverlay {
  // `show` (1..10) opens straight on that challenge's card.
  constructor(app, show) {
    this.app = app;
    this.view = show ? 'detail' : app.challenge ? 'current' : 'list';
    this.sel = show ? show - 1 : 0;
    this.titles = [];
    for (let i = 0; i < 10; i++) this.titles.push(slotRect(CH, 5 + i));
    this.closeR = slotRect(CH, 2);
    this.yes = slotRect(CH, 18);
    this.no = slotRect(CH, 19);
    this.viewR = slotRect(CH, 16);
    this.backR = slotRect(CH, 15);
    this.solutionR = { x: 330, y: 379, w: 150, h: 60 };
    this.text = '';
    Sound.play(SND.panelIn);
  }

  draw() {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    draw(CH, 1);
    draw(CH, 2);
    if (this.view === 'list') {
      draw(CH, 3);
      draw(CH, 4);
      const solved = Store.get('solved', []);
      for (let i = 0; i < 10; i++) {
        const r = draw(CH, 5 + i);
        if (solved.includes(i + 1)) drawAt(CH, 21, r.x - 32, r.y + r.h / 2 - 26);
      }
    } else if (this.view === 'current') {
      draw(CH, 17);
      draw(CH, 18);
      draw(CH, 19);
      textStyle(13, '#ffe066', true);
      ctx.fillText(T('currentChallenge', this.app.challenge), 120, 340);
    } else if (this.view === 'detail') {
      draw(6012, this.sel + 1, 0, 0, true);
      draw(CH, 16);
      ctx.fillStyle = '#000';
      ctx.fillRect(this.solutionR.x, this.solutionR.y, this.solutionR.w, this.solutionR.h);
      ctx.strokeStyle = GREEN;
      ctx.strokeRect(this.solutionR.x + 4.5, this.solutionR.y + 4.5, this.solutionR.w - 9, this.solutionR.h - 9);
      textStyle(16, GREEN);
      wrapText(T('seeSolution'), this.solutionR.x + 8, this.solutionR.y + 12, this.solutionR.w - 16, 18, 2, 'center');
      draw(CH, 15);
    } else if (this.view === 'solution') {
      draw(6006, this.sel + 1, 0, 0, true);
      draw(CH, 15);
    }
  }

  onMove() {}
  onDown() {}

  onUp(x, y) {
    if (inRect(x, y, this.closeR)) { this.closeAll(); return; }
    if (this.view === 'list') {
      const i = this.titles.findIndex((r) => inRect(x, y, r));
      if (i >= 0) { this.sel = i; this.view = 'detail'; Sound.play(1022); }
    } else if (this.view === 'current') {
      if (inRect(x, y, this.yes)) { this.app.setChallenge(0); this.view = 'list'; Sound.play(1022); }
      if (inRect(x, y, this.no)) this.closeAll();
    } else if (this.view === 'detail') {
      if (inRect(x, y, this.viewR)) { this.app.setChallenge(this.sel + 1); this.closeAll(); }
      else if (inRect(x, y, this.solutionR)) { this.view = 'solution'; Sound.play(1022); }
      else if (inRect(x, y, this.backR)) { this.view = 'list'; Sound.play(1022); }
    } else if (this.view === 'solution') {
      this.view = 'detail';
    }
  }

  closeAll() {
    Sound.play(SND.panelOut);
    this.app.closeOverlay();
  }
}

// ================================================================ simple dialogs

// Yes/no dialog built from the game's own confirm box (40/BD4007.PAG); its
// baked-in question is covered with ours.
const DLG = 4007;

class ConfirmOverlay {
  constructor(app, text, onYes) {
    this.app = app; this.text = text; this.onYes = onYes;
    this.yes = slotRect(DLG, 2);
    this.no = slotRect(DLG, 3);
  }
  draw() {
    draw(DLG, 1);
    ctx.fillStyle = '#000';
    ctx.fillRect(240, 99, 272, 112);
    textStyle(20, GREEN, true);
    wrapText(this.text, 248, 120, 256, 24, 4, 'center');
    draw(DLG, 2, 0, 0, true);
    draw(DLG, 3, 0, 0, true);
  }
  onMove() {}
  onDown() {}
  onUp(x, y) {
    if (inRect(x, y, this.yes)) { this.app.closeOverlay(); this.onYes(); }
    else if (inRect(x, y, this.no)) this.app.closeOverlay();
  }
}

const HELP = [
  'A1. Deberás disponer de un punto de inicio y un final. De haber completado la trayectoria entre éstos, el ratón será transportado del punto de partida al final.',
  'A2. Para completar una trayectoria, conecta las cintas transportadoras, los ascensores y los artilugios guiándote por sus flechas.',
  'A3. El ratón se caerá en los espacios vacíos de la trayectoria... (ideal para llevarle a un nivel inferior).',
  'A4. Todas las piezas de tu artilugio requerirán potencia procedente de un motor. Conecta las piezas a un motor mediante un conector. Ahora conecta el motor a una pila para disponer de suministro eléctrico.',
  'A5. Puedes usar hasta un total de diez motores y pilas para tu artilugio.',
  'A6. ¡La eficacia ante todo! Si se conectan todas las piezas a una pila, se agotará. Si la máquina es eficaz, podrá completar la tarea antes de que se agote la pila.',
  'Pista: el motor va justo encima de la pila; la corriente sale por los lados del motor y sólo llega a una pieza a través de un conector colocado justo debajo de ella.',
];

class HelpOverlay {
  constructor(app) { this.app = app; }
  draw() {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(40, 30, 560, 420);
    ctx.strokeStyle = GREEN;
    ctx.strokeRect(44.5, 34.5, 551, 411);
    textStyle(16, GREEN, true);
    ctx.fillText(T('rulesTitle'), 60, 48);
    textStyle(13, GREEN);
    let y = 78;
    for (const p of mazeHelp()) y += wrapText(p, 60, y, 520, 16, 8) * 16 + 10;
    textStyle(11, '#ffe066');
    ctx.fillText(T('clickToClose'), 60, 425);
  }
  onMove() {}
  onDown() {}
  onUp() { this.app.closeOverlay(); }
}

// ================================================================ app

class App {
  constructor(canvas) {
    this.canvas = canvas;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    this.design = Design.fromJSON(Store.get('design', null));
    this.challenge = Store.get('challenge', 0);
    this.overlay = null;
    this.speed = 1;
    this.onOpenSaves = null; // set by the page: opens the save/load dialog
    this.bindInput();
  }

  get stepMs() { return 380 / this.speed; }

  async init() {
    for (const n of [6000, 6010, 6011, 6012, 6006, 6021, 4007, HOWARD_PAGE]) await Assets.loadPage(n);
    this.howard = new Howard(380, 305); // the dial at the editor's bottom right (code[5265])
    this.editor = new EditorScreen(this);
    this.screen = this.editor;
    Sound.music(MUSIC_EDITOR);
    // Timer-driven loop for headless testing, where animation frames don't fire.
    if (this.timerLoop) setInterval(() => this.frame(), 16);
    else requestAnimationFrame(() => this.loop());
  }

  loop() {
    this.frame();
    requestAnimationFrame(() => this.loop());
  }

  // 640x480 overlays are centred on larger screens.
  get overlayOffset() {
    return this.screen && this.screen.fixedSize ? [0, 0] : [Layout.dx / 2, Layout.dy / 2];
  }

  // Screen size: the board screens grow with the board; the workshop is 640x480.
  get size() {
    return this.screen && this.screen.fixedSize ? [SCREEN_W, SCREEN_H] : [Layout.W, Layout.H];
  }

  frame() {
    updateLayout();
    const [w, h] = this.size;
    if (this.canvas.width !== w || this.canvas.height !== h) this.resize();
    const now = performance.now();
    if (this.screen.update) this.screen.update(now);
    ctx.clearRect(0, 0, w, h);
    this.screen.draw(now);
    if (this.overlay) {
      const [ox, oy] = this.overlayOffset;
      if (ox || oy) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, Layout.W, Layout.H);
      }
      ctx.save();
      ctx.translate(ox, oy);
      this.overlay.draw(now);
      ctx.restore();
    }
  }

  resize() {
    [this.canvas.width, this.canvas.height] = this.size;
    ctx.imageSmoothingEnabled = false;
    this.applyScale();
  }

  applyScale() {
    const s = this.scale || 1.5;
    const [w, h] = this.size;
    this.canvas.style.width = Math.round(w * s) + 'px';
    this.canvas.style.aspectRatio = `${w} / ${h}`;
  }

  bindInput() {
    const pos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      let x = Math.floor((e.clientX - r.left) * this.canvas.width / r.width);
      let y = Math.floor((e.clientY - r.top) * this.canvas.height / r.height);
      if (this.overlay) { const [ox, oy] = this.overlayOffset; x -= ox; y -= oy; }
      return [x, y];
    };
    const target = () => this.overlay || this.screen;
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.screen) return;
      Sound.resume();
      this.canvas.setPointerCapture(e.pointerId);
      target().onDown(...pos(e), e.button);
    });
    this.canvas.addEventListener('pointermove', (e) => { if (this.screen) target().onMove(...pos(e)); });
    this.canvas.addEventListener('pointerup', (e) => { if (this.screen) target().onUp(...pos(e), e.button); });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Scroll wheel cycles the part pickers.
    this.canvas.addEventListener('wheel', (e) => {
      const t = this.screen && target();
      if (!t || !t.onWheel) return;
      if (t.onWheel(...pos(e), Math.sign(e.deltaY || e.deltaX))) e.preventDefault();
    }, { passive: false });
  }

  changed() {
    Store.set('design', this.design.toJSON());
  }

  setChallenge(n) {
    this.challenge = n;
    Store.set('challenge', n);
  }

  // Only one Howard talks at a time; switching screens silences him.
  quietHoward() {
    if (this.howard) this.howard.stop();
    if (this.screen && this.screen.howard) this.screen.howard.stop();
  }

  showEditor() {
    this.quietHoward();
    this.overlay = null; this.screen = this.editor;
    Sound.music(MUSIC_EDITOR);
    this.setRoom('maze');
  }

  showTest() {
    this.quietHoward();
    this.overlay = null; this.screen = new TestScreen(this);
    Sound.music(MUSIC_TEST);
  }

  // The current game is remembered and named in the page title.
  setRoom(room) {
    Store.set('room', room);
    this.room = room;
    document.title = T(room === 'taller' ? 'titleTaller' : 'titleMaze');
  }
  async showTaller() {
    this.quietHoward();
    this.overlay = null;
    Sound.stopAll();
    await TallerScreen.load();
    this.screen = new TallerScreen(this);
    this.setRoom('taller');
    Sound.music(7032); // the workshop's room ambience loop
    this.screen.start();
  }

  showScore(result) { this.overlay = new ScoreOverlay(this, result); }
  showHelp() { this.overlay = new HelpOverlay(this); }
  openChallenges(show) { this.overlay = new ChallengeOverlay(this, show); }
  openSaves() { if (this.onOpenSaves) this.onOpenSaves(); }
  confirm(text, onYes) { this.overlay = new ConfirmOverlay(this, text, onYes); }
  closeOverlay() { this.overlay = null; }

  newDesign() {
    this.design.parts.length = 0;
    this.changed();
    this.showEditor();
  }

  exportDesign() {
    const blob = new Blob([JSON.stringify(this.design.toJSON(), null, 1)], { type: 'application/json' });
    download(blob, 'artilugio.json');
  }

  importDesign(obj) {
    this.design = Design.fromJSON(obj);
    this.changed();
    this.showEditor();
  }

  snapshot() {
    this.canvas.toBlob((b) => download(b, 'artilugio.png'));
    Sound.play(10000);
  }

  // Resize the board. Parts that no longer fit are dropped; challenges only
  // exist on the original 14x10 board.
  setBoardSize(cols, rows) {
    const obj = this.design.toJSON();
    obj.cols = cols; obj.rows = rows;
    const d = Design.fromJSON(obj);
    const lost = this.design.parts.length - d.parts.length;
    this.design = d;
    if (!isStdSize() && this.challenge) this.setChallenge(0);
    this.changed();
    this.showEditor();
    return lost;
  }

  // ---- in-browser save slots
  slots() { return Store.get('slots', []); }

  saveSlot(i, name) {
    const slots = this.slots();
    slots[i] = { name: name || `Plano ${i + 1}`, date: new Date().toISOString(), design: this.design.toJSON() };
    Store.set('slots', slots);
  }

  loadSlot(i) {
    const s = this.slots()[i];
    if (s) this.importDesign(s.design);
  }

  deleteSlot(i) {
    const slots = this.slots();
    slots[i] = null;
    Store.set('slots', slots);
  }
}

// Save a file. The link has to be in the document for some browsers.
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
