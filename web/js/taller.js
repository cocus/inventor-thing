// "El Taller": the machine workshop (section 70, 70/BD7000.PAG).
// Rules: docs/TALLER_RULES.md; data: taller_data.js.
'use strict';

const TP = 7000;          // the workshop page
const T_DIAGRAMS = 7003;  // one blueprint per machine
const T_SMOKE = 7002;     // failure effects, 5 x 8 frames
const POWER = 9;          // power supply component, always pre-placed
const PANEL_DX = 449, PANEL_DY = 366; // the panel slides in from this offset
const ARM_Y = 27, ARM_HOME_X = 94, ARM_HOME_FRAME = 55;
const ARM_PX_PER_S = 200, PART_PX_PER_S = 100; // glide speeds from the script
const ARM_LOWER_MS = 100, ARM_RAISE_MS = 55, CLAW_OPEN_MS = 150, ANIM_FRAME_MS = 100;
// How a part moves on each of the 19 raise steps (seq139).
const PART_STEPS = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, -4],
  [0, -11], [0, -11], [0, -11], [0, -11], [0, -11], [0, -11], [0, -11], [0, -11],
  [20, -6], [18, -16], [12, -30], [6, -32], [5, -37]];

const STR_PENDING = new Set(); // STR texts being fetched
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));

// A value animated over time; read it with .at(now).
class Tween {
  constructor(from) { this.set(from); }
  set(v) { this.a = v; this.b = v; this.t0 = 0; this.dur = 0; }
  to(v, dur, now) { this.a = this.at(now); this.b = v; this.t0 = now; this.dur = dur; }
  at(now) { return this.dur ? lerp(this.a, this.b, (now - this.t0) / this.dur) : this.b; }
  done(now) { return !this.dur || now >= this.t0 + this.dur; }
}

// The build check (BD7000 seq222): 0 ok, 1 wrong parts, 2 incomplete,
// 4 right parts but misplaced, or wrong connections.
function checkMachine(m, comps, links) {
  let res = 0, missing = false, linkWrong = false;
  const placed = new Set(Object.values(comps));
  for (const c of m.components) {
    const v = comps[c.pos];
    if (v === undefined) return 2;
    if (v !== c.id) res = 1;
    if (!placed.has(c.id)) missing = true;
  }
  for (const l of m.links) {
    const v = links[l.idx];
    if (v === undefined) return 2;
    if (v !== l.type) linkWrong = true;
  }
  if (res === 1) return missing ? 1 : 4;
  return linkWrong ? 4 : 0;
}

class TallerScreen {
  constructor(app) {
    this.app = app;
    this.fixedSize = true; // always 640x480
    this.machine = -1;     // chosen machine
    this.completed = Store.get('taller.completed', 0);
    this.comps = {};       // pos -> component id
    this.links = {};       // idx -> connection type
    this.locked = new Set(); // 'c'+pos / 'l'+idx that can't be changed
    this.compSel = 1; this.linkSel = 1; // picker positions (start at 1, as the game)
    this.carry = null;     // {kind: 'c'|'l', id}
    this.mx = 0; this.my = 0;
    this.pressed = null;
    this.busy = false;     // arm/animation running: input disabled
    this.lastResult = 3;   // 3 = panel closed with X (no cleanup on reopen)
    this.lastBuilt = -1;   // machine of the last build (repeat attempts skip the arm)
    this.chooser = { y: new Tween(-450), open: false };
    this.panel = { k: new Tween(1), open: false }; // k: 0 = in place, 1 = off-screen
    this.hint = null;      // {k} while the hint dialog is open
    this.help = null;      // {page} while the help panel is open
    this.arm = { x: new Tween(ARM_HOME_X), frame: ARM_HOME_FRAME, claw: null };
    this.parts = [];       // per part id: {x, y, img, where}
    this.anim = null;      // success animation state
    this.smoke = null;     // failure effects state
    this.howard = new Howard(-115, 283); // the porthole at the bottom left
    this.overrides = {};   // part id -> graphic from the machine's parts page
    this.resetFloor();
  }

  // On entry Howard greets and the chooser opens after a second (seq67).
  start() {
    this.say(7101 + Math.floor(Math.random() * 3));
    setTimeout(() => { if (this.app.screen === this && !this.chooser.open && this.machine < 0) this.toggleChooser(); }, 1000);
  }

  // Testing hook: pick machine m and optionally fill in its solution.
  async debugSetup(m, solve, wrong) {
    this.chooser.open = false; this.chooser.y.set(-450);
    await this.chooseMachine(m);
    if (solve || wrong) {
      for (const c of TALLER.machines[m].components) this.comps[c.pos] = c.id;
      for (const l of TALLER.machines[m].links) this.links[l.idx] = l.type;
      if (wrong) {
        const c = TALLER.machines[m].components.find((o) => !this.locked.has('c' + o.pos));
        if (c) this.comps[c.pos] = (c.id + 1) % 32;
      }
    }
    this.openPanel();
  }

  // ------------------------------------------------------------ assets

  static async load() {
    for (const n of [TP, T_DIAGRAMS, T_SMOKE, HOWARD_PAGE]) await Assets.loadPage(n);
  }

  partImg(id) {
    const o = this.overrides[id];
    if (o) return o;
    return Assets.img(TP, 120 + id);
  }

  async loadMachineParts(m) {
    const mm = TALLER.machines[m];
    this.overrides = {};
    try {
      const gfx = await Assets.loadPage(mm.partsPage);
      mm.partsGfx.forEach((id, k) => {
        if (k < gfx.length) this.overrides[id] = Assets.img(mm.partsPage, k + 1);
      });
    } catch (e) { console.warn(e); }
    this.resetFloor();
  }

  // All 35 parts sit on the floor; the ones a machine doesn't use are decoys.
  resetFloor() {
    this.parts = [];
    for (let id = 0; id < 35; id++) {
      const img = this.partImg(id);
      if (!img) continue;
      this.parts[id] = {
        x: img.x + TALLER.floorX[id], y: 380 + ((id * 7) % 11) - 5,
        tx: new Tween(0), ty: new Tween(0), moving: false, where: 'floor',
      };
    }
  }

  partPos(id, now) {
    const p = this.parts[id];
    if (!p) return null;
    if (p.moving) return [p.tx.at(now), p.ty.at(now)];
    if (p.follow) return [p.follow.base + this.arm.x.at(now) - p.follow.arm, p.y];
    return [p.x, p.y];
  }

  // ------------------------------------------------------------ Howard

  say(wav) { this.howard.say(wav); }

  // ------------------------------------------------------------ board

  resetBoard() {
    this.comps = {}; this.links = {}; this.locked = new Set();
    if (this.machine < 0) return;
    const m = TALLER.machines[this.machine];
    this.comps[m.powerPos] = POWER;
    this.locked.add('c' + m.powerPos);
    for (const g of m.given) {
      if (g.kind === 'comp') {
        const pos = g.row * 5 + g.col;
        this.comps[pos] = g.value; this.locked.add('c' + pos);
      } else {
        const idx = g.row * 5 + g.col;
        this.links[idx] = g.value; this.locked.add('l' + idx);
      }
    }
  }

  // After a failed build: keep correct pieces, drop the rest (BD7000 seq209..213).
  cleanupBoard() {
    const m = TALLER.machines[this.machine];
    let fell = false;
    for (const c of m.components) {
      const v = this.comps[c.pos];
      if (v === undefined || v === c.id || this.locked.has('c' + c.pos)) continue;
      const neededElsewhere = m.components.some((o) => o.id === v && this.comps[o.pos] !== o.id);
      if (!neededElsewhere) fell = true;
      delete this.comps[c.pos];
    }
    for (const l of m.links) {
      const v = this.links[l.idx];
      if (v !== undefined && v !== l.type && !this.locked.has('l' + l.idx)) delete this.links[l.idx];
    }
    if (fell) { Sound.play(7033); this.say(7311); }
  }

  // ------------------------------------------------------------ chooser

  toggleChooser() {
    const now = performance.now();
    const c = this.chooser;
    c.open = !c.open;
    c.y.to(c.open ? 0 : -450, 350, now);
    Sound.play(c.open ? 7030 : 7031);
    if (c.open) { this.say(7135); return; }
    // Closing with a machine chosen opens its blueprint.
    if (this.machine >= 0) setTimeout(() => this.openPanel(), 380);
  }

  async chooseMachine(m) {
    this.click();
    this.machine = m;
    this.lastResult = 3;
    this.anim = null; this.smoke = null;
    this.resetBoard();
    this.say(TALLER.machines[m].intro);
    await this.loadMachineParts(m);
    this.preloadAnim(m);
  }

  // ------------------------------------------------------------ panel

  openPanel() {
    if (this.machine < 0 || this.panel.open) { if (this.machine < 0) Sound.play(10016); return; }
    const now = performance.now();
    this.panel.open = true;
    this.panel.k.to(0, 400, now);
    this.carry = null;
    if (this.lastResult !== 3 && this.lastResult !== 2) this.cleanupBoard();
    // Floor parts go back to the floor when the panel opens.
    this.anim = null; this.smoke = null;
    this.resetFloor();
  }

  closePanel(result) {
    this.panel.open = false;
    this.panel.k.to(1, 400, performance.now());
    this.carry = null;
    this.lastResult = result;
  }

  panelOffset(now) {
    const k = this.panel.k.at(now);
    return [PANEL_DX * k, PANEL_DY * k];
  }

  compAt(x, y) {
    const c = Math.floor((x - 187) / 80), r = Math.floor((y - 115) / 80);
    if (c < 0 || c > 4 || r < 0 || r > 2) return -1;
    return r * 5 + c;
  }

  // Link spot nearest the point, among this machine's link spots.
  linkAt(x, y) {
    const m = TALLER.machines[this.machine];
    for (const l of m.links) {
      if (x >= l.x - 6 && x < l.x + 29 && y >= l.y - 6 && y < l.y + 29) return l.idx;
    }
    return -1;
  }

  build() {
    const m = TALLER.machines[this.machine];
    const res = checkMachine(m, this.comps, this.links);
    this.click();
    if (res === 2) { Sound.play(10016); return; }
    const repeat = this.lastBuilt === this.machine;
    this.lastBuilt = this.machine;
    this.closePanel(res);
    this.run(res, repeat);
  }

  // ------------------------------------------------------------ arm + results

  async run(res, repeat) {
    this.busy = true;
    const m = TALLER.machines[this.machine];
    let order;
    if (res === 1) {
      order = m.components.map((c) => this.comps[c.pos]).filter((v) => v !== undefined);
    } else {
      order = m.components.map((c) => c.id);
    }
    // The speaker comes with its second box; some machines have extra pieces.
    const seq = [];
    for (const id of order) { if (id === 12) seq.push(32); seq.push(id); }
    if (res !== 1) for (const id of m.partsGfx) if (id >= 32 && !seq.includes(id)) seq.push(id);
    await sleep(450);
    for (const id of seq) {
      if (!this.parts[id]) continue;
      const where = res === 1 ? 'heap' : 'machine';
      if (repeat) {
        // Repeat attempts skip the arm: the parts glide straight in.
        const p = this.parts[id], [tx, ty] = this.target(id, where);
        this.placePart(id, where, this.glideMs(p.x, p.y, tx, ty));
      } else {
        await this.carryPart(id, where);
      }
    }
    await this.armHome();
    if (res === 0) await this.success();
    else await this.failure();
    this.busy = false;
  }

  target(id, where) {
    const img = this.partImg(id);
    if (where === 'machine') return [img.x, img.y];
    return [300 + ((id * 13) % 60) - 30, 338 - img.h];
  }

  placePart(id, where, dur) {
    const p = this.parts[id], now = performance.now();
    const [tx, ty] = this.target(id, where);
    if (!dur) { p.x = tx; p.y = ty; p.moving = false; p.where = where; return; }
    p.tx.set(p.x); p.ty.set(p.y);
    p.tx.to(tx, dur, now); p.ty.to(ty, dur, now);
    p.moving = true;
    setTimeout(() => { p.x = tx; p.y = ty; p.moving = false; p.where = where; }, dur);
  }

  // Durations scale with the toolbar speed. The script's glides use
  // "speed=-N", which is N pixels per second (exe sub_4115A0).
  ms(t) { return t / (this.app.speed || 1); }

  async armTo(x) {
    const now = performance.now();
    this.arm.frame = ARM_HOME_FRAME; // travels folded up (seq146: glide_to; frame 55)
    const from = this.arm.x.at(now);
    const dur = this.ms(Math.max(150, Math.abs(x - from) / ARM_PX_PER_S * 1000));
    this.arm.x.to(x, dur, now);
    if (Math.abs(x - from) > 4) Sound.play(7003);
    await sleep(dur);
  }


  // One part, as BD7000 seq146/147 + seq163..167 + seq139..142 do it:
  // glide over the part, lower (frames 55..34, 100 ms each), the claw shows
  // up, then 19 lockstep steps raise the arm (frames 33..51) while the claw
  // closes (57..75) and the part follows its scripted path; everything then
  // glides sideways until the part is at its machine x, the claw opens
  // (76..78) and the part glides to its place (or to the heap).
  async carryPart(id, where) {
    const p = this.parts[id];
    const img = this.partImg(id);
    await this.armTo(p.x + img.w / 2);
    Sound.play(7011);
    for (let f = ARM_HOME_FRAME; f >= 34; f--) { this.arm.frame = f; await sleep(this.ms(ARM_LOWER_MS)); }
    await sleep(this.ms(50));
    this.arm.claw = 56;
    await sleep(this.ms(100));
    Sound.play(7012);
    for (let i = 0; i < PART_STEPS.length; i++) {
      this.arm.frame = 33 + i;
      p.x += PART_STEPS[i][0]; p.y += PART_STEPS[i][1];
      this.arm.claw = 57 + i;
      await sleep(this.ms(ARM_RAISE_MS));
    }
    // sideways, arm, claw and part together, to the part's machine x
    p.follow = { base: p.x, arm: this.arm.x.at(performance.now()) };
    await this.armBy(img.x - p.x);
    p.x = img.x;
    p.follow = null;
    await sleep(this.ms(250));
    Sound.play(Math.random() < 0.5 ? 7013 : 7014);
    for (let f = 76; f <= 78; f++) { this.arm.claw = f; await sleep(this.ms(CLAW_OPEN_MS)); }
    await sleep(this.ms(200));
    this.arm.claw = null;
    const [tx, ty] = this.target(id, where);
    const dur = this.glideMs(p.x, p.y, tx, ty);
    this.placePart(id, where, dur);
    Sound.play(where === 'machine' ? 7001 + Math.floor(Math.random() * 2) : 7002);
    await sleep(dur);
  }

  glideMs(x0, y0, x1, y1) {
    return this.ms(Math.max(120, Math.hypot(x1 - x0, y1 - y0) / PART_PX_PER_S * 1000));
  }

  async armBy(dx) {
    const now = performance.now();
    const from = this.arm.x.at(now);
    const dur = this.ms(Math.max(120, Math.abs(dx) / ARM_PX_PER_S * 1000));
    this.arm.x.to(from + dx, dur, now);
    await sleep(dur);
  }

  async armHome() {
    this.arm.frame = ARM_HOME_FRAME;
    await this.armTo(ARM_HOME_X);
  }

  preloadAnim(m) {
    const mm = TALLER.machines[m];
    if (mm.anim) Assets.loadPage(mm.anim).catch((e) => console.warn(e));
  }

  async success() {
    const m = TALLER.machines[this.machine];
    this.completed |= 1 << this.machine;
    Store.set('taller.completed', this.completed);
    let gfx = [];
    try { gfx = await Assets.loadPage(m.anim); } catch (e) { console.warn(e); }
    const n = gfx.length;
    if (this.machine === 9) {
      // Robot D.J.: wind-up once, then the DJ music and a loop of frames 2..32.
      this.anim = { page: m.anim, base: 1, frame: 0 };
      await sleep(1000);
      for (let f = Math.min(64, n); f >= 35; f--) { this.anim.frame = f; await sleep(this.ms(ANIM_FRAME_MS)); }
      Sound.play(7000);
      this.anim.loop = true;
      this.djLoop();
    } else {
      this.anim = { page: m.anim, base: 1, frame: 0 };
      const cues = new Map(m.cues.map(([k, w]) => [k, w]));
      for (let k = 1; k < n; k++) {
        this.anim.frame = k + 1;
        if (cues.has(k)) Sound.play(cues.get(k));
        await sleep(this.ms(ANIM_FRAME_MS));
      }
    }
    this.say(this.completed === 1023 ? 7140 : 7123);
  }

  async djLoop() {
    const a = this.anim;
    while (this.anim === a && a.loop) {
      for (let f = 2; f <= 32 && this.anim === a; f++) { a.frame = f; await sleep(this.ms(ANIM_FRAME_MS)); }
      a.frame = 0;
      await sleep(this.ms(ANIM_FRAME_MS));
    }
  }

  async failure() {
    const m = TALLER.machines[this.machine];
    await sleep(1000);
    Sound.play(7005 + Math.floor(Math.random() * 6));
    this.smoke = { t0: performance.now() };
    await sleep(8 * 150 * 3);
    this.smoke = null;
    // Howard's hint plays in full before the blueprint re-opens (seq153 waits
    // for the speech), so the cleanup line can't cut it off.
    this.say(m.fail);
    await this.untilQuiet();
    await sleep(this.ms(300));
    this.openPanel();
  }

  // Resolves when Howard stops talking (or after 30 s, in case audio is off
  // or blocked and never reports an end).
  async untilQuiet() {
    await sleep(100); // let the clip start
    const limit = performance.now() + 30000;
    while (this.howard.talking && performance.now() < limit) await sleep(100);
  }

  // ------------------------------------------------------------ input

  click() { Sound.play(Math.random() < 0.5 ? 1022 : 1016); }

  buttonRects() {
    const r = (slot) => slotRect(TP, slot);
    return {
      camera: r(156), map: r(157), help: r(158), exit: r(159),
      green: { x: 587, y: 440, w: 43, h: 43 },
      porthole: { x: 0, y: 296, w: 150, h: 169 },
    };
  }

  onMove(x, y) { this.mx = x; this.my = y; }

  onDown(x, y) {
    this.mx = x; this.my = y;
    const now = performance.now();
    if (this.help) return this.helpDown(x, y);
    if (this.hint) return this.hintDown(x, y);
    if (this.busy) return;
    // the chooser (scroll button is always reachable)
    const cy = this.chooser.y.at(now);
    const scroll = slotRect(TP, 176);
    if (!this.panel.open && inRect(x, y, { x: scroll.x, y: scroll.y + cy, w: scroll.w, h: scroll.h })) { this.toggleChooser(); return; }
    if (this.chooser.open) {
      if (inRect(x, y, slotRect(TP, 175))) { this.toggleChooser(); return; }
      for (let m = 0; m < 10; m++) {
        if (inRect(x, y, slotRect(TP, 180 + m))) { this.chooseMachine(m); return; }
      }
      return;
    }
    if (this.panel.open) return this.panelDown(x, y);
    const b = this.buttonRects();
    for (const k of ['camera', 'map', 'help', 'exit']) {
      if (inRect(x, y, b[k])) { this.pressed = k; return; }
    }
    if (inRect(x, y, b.green)) { this.click(); this.openPanel(); return; }
    if (inRect(x, y, b.porthole)) this.howardHelp();
  }

  // The wheel cycles the picker under the mouse (top half: connections,
  // bottom half: components). Returns true when it was used.
  onWheel(x, y, dir) {
    if (!this.panel.open || this.busy || this.hint || this.help || !dir) return false;
    if (y < 240) this.linkSel = (this.linkSel + 7 + dir) % 7;
    else this.compSel = (this.compSel + 32 + dir) % 32;
    this.click();
    return true;
  }

  onUp(x, y) {
    // Releasing after dragging a piece drops it there; a plain click keeps
    // carrying it until the next click (as in the original).
    const c = this.carry;
    if (c && c.fresh) {
      c.fresh = false;
      if (Math.hypot(x - c.sx, y - c.sy) > 6) { this.drop(x, y); return; }
    }
    const k = this.pressed;
    this.pressed = null;
    if (!k || !inRect(x, y, this.buttonRects()[k] || this.panelButtons()[k] || { x: 0, y: 0, w: 0, h: 0 })) return;
    this.click();
    switch (k) {
      case 'camera': this.app.snapshot(); break;
      case 'map': case 'exit': this.leave(); break;
      case 'help': this.help = { page: 0 }; Sound.play(1090); break;
      case 'build': this.build(); break;
      case 'hints': this.hint = { k: 0 }; break;
    }
  }

  leave() {
    this.howard.stop();
    this.anim = null;
    this.app.showEditor();
  }

  howardHelp() {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    if (this.machine < 0) this.say(pick([7104, 7105, 7106]));
    else this.say(21226);
  }

  panelButtons() {
    return {
      build: slotRect(TP, 22), hints: slotRect(TP, 23),
      close: { x: 137, y: 77, w: 40, h: 37 },
      linkPrev: slotRect(TP, 25), linkNext: slotRect(TP, 26),
      compPrev: slotRect(TP, 29), compNext: slotRect(TP, 30),
      linkPick: { x: 380, y: 88, w: 23, h: 23 },
      compPick: { x: 371, y: 355, w: 31, h: 30 },
    };
  }

  panelDown(x, y) {
    if (!this.panel.k.done(performance.now())) return;
    const b = this.panelButtons();
    const m = TALLER.machines[this.machine];
    if (this.carry) {
      this.drop(x, y);
      return;
    }
    if (inRect(x, y, b.build)) { this.pressed = 'build'; return; }
    if (inRect(x, y, b.hints)) { this.pressed = 'hints'; return; }
    if (inRect(x, y, b.close)) { this.click(); this.closePanel(3); return; }
    if (inRect(x, y, b.linkPrev)) { this.click(); this.linkSel = (this.linkSel + 6) % 7; return; }
    if (inRect(x, y, b.linkNext)) { this.click(); this.linkSel = (this.linkSel + 1) % 7; return; }
    if (inRect(x, y, b.compPrev)) { this.click(); this.compSel = (this.compSel + 31) % 32; return; }
    if (inRect(x, y, b.compNext)) { this.click(); this.compSel = (this.compSel + 1) % 32; return; }
    const pick = (kind, id) => { this.carry = { kind, id, sx: x, sy: y, fresh: true }; Sound.play(6037); };
    if (inRect(x, y, b.linkPick)) { pick('l', this.linkSel); return; }
    if (inRect(x, y, b.compPick)) { pick('c', this.compSel); return; }
    // pick up a placed piece
    const li = this.linkAt(x, y);
    if (li >= 0 && this.links[li] !== undefined && !this.locked.has('l' + li)) {
      pick('l', this.links[li]);
      delete this.links[li];
      return;
    }
    const pos = this.compAt(x, y);
    const c = m.components.find((o) => o.pos === pos);
    if (c && this.comps[pos] !== undefined && !this.locked.has('c' + pos) &&
        inRect(x, y, { x: c.x - 4, y: c.y - 4, w: 40, h: 38 })) {
      pick('c', this.comps[pos]);
      delete this.comps[pos];
    }
  }

  // Click-to-drop: only the blanks of the diagram accept pieces; anything
  // else makes the carried piece disappear.
  drop(x, y) {
    const m = TALLER.machines[this.machine];
    const piece = this.carry;
    this.carry = null;
    Sound.play(6037);
    if (piece.kind === 'c') {
      const pos = this.compAt(x, y);
      if (pos < 0 || !m.components.some((c) => c.pos === pos) || this.locked.has('c' + pos)) return;
      this.comps[pos] = piece.id;
    } else {
      const idx = this.linkAt(x, y);
      if (idx < 0 || this.locked.has('l' + idx)) return;
      this.links[idx] = piece.id;
    }
  }

  hintDown(x, y) {
    const r = (slot) => { const s = slotRect(TP, slot); return { x: s.x + 229, y: s.y + 136, w: s.w, h: s.h }; };
    if (inRect(x, y, r(193)) || inRect(x, y, r(194))) { this.click(); this.hint.k ^= 1; return; }
    if (inRect(x, y, r(197))) { this.click(); this.hint = null; }
  }

  helpDown(x, y) {
    const r = (slot) => slotRect(TP, slot);
    if (inRect(x, y, r(172))) { Sound.play(1091); this.help = null; return; }
    if (inRect(x, y, r(166))) { this.click(); this.help.page = Math.min(4, this.help.page + 1); return; }
    if (inRect(x, y, r(169))) { this.click(); this.help.page = Math.max(0, this.help.page - 1); }
  }

  // ------------------------------------------------------------ drawing

  draw(now) {
    drawAt(TP, 1, 0, 0, true);
    const ax = Math.round(this.arm.x.at(now));
    // the claw is behind the parts (layer 50 vs 60)
    if (this.arm.claw) draw(TP, this.arm.claw, ax, ARM_Y);
    // the assembled machine / floor pile
    for (let id = 0; id < this.parts.length; id++) {
      if (!this.parts[id]) continue;
      const img = this.partImg(id), [x, y] = this.partPos(id, now);
      ctx.drawImage(img.cv, Math.round(x), Math.round(y));
    }
    if (this.anim) {
      draw(this.anim.page, this.anim.base);
      if (this.anim.frame) draw(this.anim.page, this.anim.frame);
    }
    if (this.smoke) this.drawSmoke(now);
    // the robot arm
    draw(TP, this.arm.frame, ax, ARM_Y);
    draw(TP, 6);
    draw(TP, 3);
    this.howard.draw(now);
    // machine name in the bottom box
    if (this.machine >= 0) {
      ctx.font = 'bold 16px "Times New Roman", serif';
      ctx.fillStyle = GREEN; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
      ctx.fillText(tallerMachine(this.machine), 430, 449);
      ctx.textAlign = 'left';
    }
    draw(TP, 10, 330, 231);
    // left button column
    const press = { camera: 160, map: 161, help: 162, exit: 163 };
    const norm = { camera: 156, map: 157, help: 158, exit: 159 };
    for (const k of Object.keys(norm)) draw(TP, this.pressed === k ? press[k] : norm[k]);
    if (this.panel.open || !this.panel.k.done(now)) this.drawPanel(now);
    this.drawChooser(now);
    if (this.hint) this.drawHint();
    if (this.help) this.drawHelp();
  }

  drawSmoke(now) {
    const f = Math.floor((now - this.smoke.t0) / 150) % 8;
    TALLER.failFx.forEach(([x, y], i) => draw(T_SMOKE, 1 + 8 * i + f, x, y));
  }

  drawChooser(now) {
    const cy = Math.round(this.chooser.y.at(now));
    if (cy > -450) {
      draw(TP, 174, 0, cy);
      draw(TP, 175, 0, cy);
      for (const s of [177, 178, 179]) draw(TP, s, 0, cy);
      for (let m = 0; m < 10; m++) {
        const r = draw(TP, 180 + m, 0, cy);
        if (this.completed & (1 << m)) draw(TP, 190, r.x + 31, r.y + 19 + cy);
        if (m === this.machine) {
          ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2;
          ctx.strokeRect(r.x - 2, r.y - 2 + cy, r.w + 4, r.h + 4);
          ctx.lineWidth = 1;
        }
      }
    }
    // The scroll button is hidden behind the blueprint panel while it's open.
    if (!this.panel.open && this.panel.k.done(now)) draw(TP, 176, 0, cy);
  }

  drawPanel(now) {
    const [ox, oy] = this.panelOffset(now).map(Math.round);
    const m = TALLER.machines[this.machine];
    ctx.save();
    ctx.translate(ox, oy);
    draw(TP, 7);
    draw(TP, 8);
    drawAt(T_DIAGRAMS, 1 + this.machine, 187, 116, true);
    draw(TP, 9);
    draw(TP, this.pressed === 'build' ? 21 : 22);
    draw(TP, this.pressed === 'hints' ? 24 : 23);
    // blinking markers on empty connection spots
    const blink = Math.floor(now / 100) % 2 ? 118 : 119;
    for (const l of m.links) {
      const v = this.links[l.idx];
      if (v === undefined) drawAt(TP, blink, l.x + 3, l.y + 3);
      else drawAt(TP, 111 + v, l.x, l.y);
    }
    for (const c of m.components) {
      const v = this.comps[c.pos];
      if (v !== undefined) drawAt(TP, 79 + v, c.x, c.y);
    }
    // pickers with names and descriptions
    draw(TP, 25); draw(TP, 26); draw(TP, 29); draw(TP, 30);
    drawAt(TP, 111 + this.linkSel, 380, 88);
    drawAt(TP, 79 + this.compSel, 371, 355);
    ctx.textBaseline = 'top';
    ctx.font = 'bold 13px "Times New Roman", serif';
    ctx.fillStyle = GREEN;
    ctx.textAlign = 'center';
    ctx.fillText(tallerConn(this.linkSel), 391, 60);
    ctx.fillText(tallerComp(this.compSel), 386, 390);
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px "Times New Roman", serif';
    ctx.fillStyle = '#d8ffd0';
    ctx.textAlign = 'center';
    ctx.fillText(tallerMachine(this.machine), 230, 369);
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px "Times New Roman", serif';
    ctx.fillStyle = GREEN;
    this.drawStr(7200 + this.linkSel, 191, 5, 390, 4);
    this.drawStr(7100 + this.compSel, 191, 410, 390, 4);
    ctx.restore();
    // the piece in hand follows the mouse
    if (this.carry) {
      const slot = this.carry.kind === 'c' ? 79 + this.carry.id : 111 + this.carry.id;
      const img = Assets.img(TP, slot);
      ctx.drawImage(img.cv, this.mx - img.w / 2, this.my - img.h / 2);
    }
  }

  drawStr(num, x, y, w, lines) {
    const t = strOverride(num) || Assets.texts.get(num);
    if (t === undefined) {
      if (!STR_PENDING.has(num)) {
        STR_PENDING.add(num);
        Assets.text(num).catch(() => Assets.texts.set(num, ''));
      }
      return;
    }
    wrapText(t, x, y, w, 14, lines);
  }

  drawHint() {
    const m = this.machine;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    draw(TP, 192, 229, 136);
    draw(TP, 193, 229, 136); draw(TP, 194, 229, 136); draw(TP, 197, 229, 136);
    ctx.font = 'bold 15px "Times New Roman", serif';
    ctx.fillStyle = GREEN; ctx.textBaseline = 'top';
    this.drawStr(7300 + 2 * m + this.hint.k, 252, 161, 260, 7);
    ctx.font = 'bold 12px "Times New Roman", serif';
    ctx.fillStyle = '#ffe066';
    ctx.fillText(T('hint', this.hint.k + 1), 252, 272);
  }

  drawHelp() {
    draw(TP, 164);
    draw(TP, 172);
    draw(TP, 166); draw(TP, 169);
    ctx.font = 'bold 13px "Times New Roman", serif';
    ctx.fillStyle = GREEN; ctx.textBaseline = 'top';
    const text = tallerHelp()[this.help.page];
    let y = 108;
    for (const para of text.split('\n')) {
      y += wrapText(para, 241, y, 269, 15, 8) * 15 || 8;
    }
  }
}

if (typeof module !== 'undefined') module.exports = { checkMachine };
