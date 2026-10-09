// Design model, power network and mouse simulation.
'use strict';

const nCells = () => GRID_COLS * GRID_ROWS;
const inGrid = (r, c) => r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS;
const cellIndex = (r, c) => r * GRID_COLS + c;

// Cells covered by a part: [{r, c, code, flags}].
function partCells(p) {
  const out = [];
  if (p.type === T_SPECIAL) {
    const s = SPECIALS[p.v];
    for (let i = 0; i < s.rows; i++) {
      for (let j = 0; j < s.cols; j++) {
        const m = s.mask[i][j];
        if (!m) continue;
        let flags = 0;
        if (i === s.A[0] && j === s.A[1]) flags |= F_ENTRY | F_NEEDS_POWER;
        if (i === s.B[0] && j === s.B[1]) flags |= F_EXIT | F_NEEDS_POWER;
        out.push({ r: p.r + i, c: p.c + j, code: 80 + m, flags });
      }
    }
  } else if (p.type === T_ELEVATOR) {
    const codes = TILE_CODES[T_ELEVATOR][p.v];
    for (let i = 0; i < 3; i++) {
      out.push({ r: p.r + i, c: p.c, code: codes[i], flags: (codes[i] === 4 || codes[i] === 6) ? F_NEEDS_POWER : 0 });
    }
  } else {
    const code = TILE_CODES[p.type][p.v];
    const needs = (code === 1 || code === 2 || code === 31) ? F_NEEDS_POWER : 0;
    out.push({ r: p.r, c: p.c, code, flags: needs });
  }
  return out;
}

function partSize(type, v) {
  if (type === T_SPECIAL) return { cols: SPECIALS[v].cols, rows: SPECIALS[v].rows };
  return { cols: 1, rows: TYPES[type].rows };
}

class Design {
  constructor(parts) {
    this.parts = parts || [];
  }

  // owner[n] = index of the part covering cell n, or -1.
  owners() {
    const owner = new Int16Array(nCells()).fill(-1);
    this.parts.forEach((p, i) => {
      for (const cell of partCells(p)) {
        if (inGrid(cell.r, cell.c)) owner[cellIndex(cell.r, cell.c)] = i;
      }
    });
    return owner;
  }

  // Whether part p fits at its (r, c), ignoring part index `skip`.
  canPlace(p, skip) {
    const { cols, rows } = partSize(p.type, p.v);
    if (p.r < 0 || p.c < 0 || p.r + rows > GRID_ROWS || p.c + cols > GRID_COLS) return false;
    const owner = this.owners();
    return partCells(p).every((cell) => {
      const o = owner[cellIndex(cell.r, cell.c)];
      return o === -1 || o === skip;
    });
  }

  countType(type) {
    return this.parts.filter((p) => p.type === type).length;
  }

  // Connector and special stock grows with the board area. Batteries and
  // motors stay at 10: the test floor only has 10 numbered battery graphics.
  stock(type) {
    let total = TYPES[type].stock;
    if (type === T_CONNECTOR || type === T_SPECIAL) total *= Math.ceil(GRID_COLS * GRID_ROWS / (STD_COLS * STD_ROWS));
    return total - this.countType(type);
  }

  partAt(r, c) {
    if (!inGrid(r, c)) return -1;
    return this.owners()[cellIndex(r, c)];
  }

  toJSON() {
    return {
      format: 'taller-inventos-maze', version: 2, cols: GRID_COLS, rows: GRID_ROWS,
      parts: this.parts.map((p) => ({ type: p.type, v: p.v, r: p.r, c: p.c })),
    };
  }

  // Loading a design also sets the board size (14x10 when not given).
  static fromJSON(obj) {
    setGridSize((obj && obj.cols) || STD_COLS, (obj && obj.rows) || STD_ROWS);
    const d = new Design();
    for (const p of (obj && obj.parts) || []) {
      const part = { type: p.type | 0, v: p.v | 0, r: p.r | 0, c: p.c | 0 };
      if (part.type < 0 || part.type > 7 || part.v < 0 || part.v >= TYPES[part.type].variants) continue;
      if (d.stock(part.type) <= 0) continue;
      if (d.canPlace(part, -1)) d.parts.push(part);
    }
    return d;
  }
}

// ---------------------------------------------------------------- the grid used by the test floor

class Board {
  constructor(design) {
    this.design = design;
    this.tile = new Int32Array(nCells());
    this.owner = design.owners();
    for (const p of design.parts) {
      for (const cell of partCells(p)) this.tile[cellIndex(cell.r, cell.c)] = cell.code | cell.flags;
    }
    this.computePower();
  }

  code(r, c) { return this.tile[cellIndex(r, c)] & 255; }
  flags(r, c) { return this.tile[cellIndex(r, c)] & ~255; }
  powered(r, c) { return (this.tile[cellIndex(r, c)] & F_POWERED) !== 0; }

  // Power is computed once (BD6010 L11964/L12142/L12311/L11330).
  computePower() {
    for (let n = 0; n < this.tile.length; n++) this.tile[n] &= ~F_POWERED;
    this.batteries = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.code(r, c) === 40) this.batteries.push({ r, c, load: 0, charge: 1000 });
      }
    }
    for (const b of this.batteries) {
      if (b.r > 0 && this.code(b.r - 1, b.c) === 31) {
        this.flood(b.r - 1, b.c + 1, 1);
        this.flood(b.r - 1, b.c - 1, 2);
      }
    }
    // A special is powered when its P cell is; then all its cells are.
    this.design.parts.forEach((p) => {
      if (p.type !== T_SPECIAL) return;
      const s = SPECIALS[p.v];
      if (!this.powered(p.r + s.P[0], p.c + s.P[1])) return;
      for (const cell of partCells(p)) this.tile[cellIndex(cell.r, cell.c)] |= F_POWERED;
    });
    // Load per battery; the visited set is reset between the two sides, so a
    // load reachable from both sides counts twice (as in the original).
    for (const b of this.batteries) {
      if (!(b.r > 0 && this.code(b.r - 1, b.c) === 31)) continue;
      b.load = this.countLoad(b.r - 1, b.c + 1, 1, new Set()) + this.countLoad(b.r - 1, b.c - 1, 2, new Set());
    }
  }

  flood(r, c, from) {
    if (!inGrid(r, c)) return;
    const n = cellIndex(r, c);
    if (this.tile[n] & F_POWERED) return;
    const code = this.tile[n] & 255;
    if (code >= 20 && code <= 30) {
      const arms = ARMS[code - 20];
      if (!(arms & from)) return;
      this.tile[n] |= F_POWERED;
      if (arms & 1) this.flood(r, c - 1, 2);
      if (arms & 2) this.flood(r, c + 1, 1);
      if (arms & 4) this.flood(r - 1, c, 8);
      if (arms & 8) this.flood(r + 1, c, 4);
    } else if (isPowerLoad(code) && from === 8) {
      this.tile[n] |= F_POWERED;
    }
  }

  countLoad(r, c, from, seen) {
    if (!inGrid(r, c)) return 0;
    const n = cellIndex(r, c);
    if (seen.has(n)) return 0;
    const code = this.tile[n] & 255;
    if (code >= 20 && code <= 30) {
      const arms = ARMS[code - 20];
      if (!(arms & from)) return 0;
      seen.add(n);
      let k = 0;
      if (arms & 1) k += this.countLoad(r, c - 1, 2, seen);
      if (arms & 2) k += this.countLoad(r, c + 1, 1, seen);
      if (arms & 4) k += this.countLoad(r - 1, c, 8, seen);
      if (arms & 8) k += this.countLoad(r + 1, c, 4, seen);
      return k;
    }
    if (isLoadEntry(code) && from === 8) {
      seen.add(n);
      return isPowerLoad(code) ? 1 : 0;
    }
    return 0;
  }

  connectorCount() {
    let k = 0;
    for (let n = 0; n < this.tile.length; n++) {
      const code = this.tile[n] & 255;
      if (code >= 20 && code <= 30) k++;
    }
    return k;
  }

  // Direction the mouse takes from cell (r, c) (BD6010 L11488).
  direction(r, c) {
    const t = this.tile[cellIndex(r, c)];
    const code = t & 255;
    const unpowered = (t & F_NEEDS_POWER) && !(t & F_POWERED);
    if (code === 0) return D_DOWN;
    if (code >= 1 && code <= 6) return unpowered ? D_STAY : TILE_DIR[code - 1];
    if (code >= 81 && code <= 100) {
      const v = code - 80;
      if (v >= 13 && v <= 19 && !(t & F_POWERED)) return D_STAY;
      return SPECIAL_DIR[v - 1];
    }
    if (code === 51) return D_DONE;
    return D_DOWN;
  }

  // Whether the mouse may enter (r, c) moving in direction d (L11645).
  canEnter(r, c, d) {
    if (!inGrid(r, c)) return false;
    const code = this.code(r, c);
    if (code === 0) return true;
    if (code >= 20 && code <= 31) return false;
    let mask = -1;
    if (code >= 1 && code <= 6) mask = TILE_ENTRY[code - 1];
    else if (code >= 81 && code <= 99) mask = SPECIAL_ENTRY[code - 81];
    if (mask === -1) return true;
    return d === D_STAY ? mask !== 0 : (mask & DIR_BIT[d]) !== 0;
  }

  specialAt(r, c) {
    const o = this.owner[cellIndex(r, c)];
    return o >= 0 && this.design.parts[o].type === T_SPECIAL ? o : -1;
  }
}

// ---------------------------------------------------------------- simulation

// One mouse walking the board. step() advances one cell and returns an event
// describing what happened, for the renderer to animate.
class MouseRun {
  constructor(board, stats) {
    this.board = board;
    this.stats = stats; // shared counters for the run
    const start = this.findStart();
    this.r = start.r; this.c = start.c;
    this.facing = D_LEFT;
    this.hidden = false;
    this.inGadget = -1;
    this.waitGadget = false;
    this.done = false;
  }

  findStart() {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.board.code(r, c) === 50) return { r, c };
      }
    }
    return { r: 0, c: 0 };
  }

  drainBatteries() {
    let dead = false;
    for (const b of this.board.batteries) {
      b.charge -= b.load;
      if (b.charge <= 0) { b.charge = 0; dead = true; }
    }
    return dead;
  }

  fail(panel, extra) {
    this.done = true;
    return Object.assign({ type: 'fail', panel, r: this.r, c: this.c }, extra || {});
  }

  step() {
    const b = this.board;
    if (b.batteries.length && this.drainBatteries()) return this.fail(3);
    const d = b.direction(this.r, this.c);
    const curCode = b.code(this.r, this.c);
    if (d === D_DONE) {
      this.done = true;
      return { type: 'arrive', r: this.r, c: this.c };
    }
    if (d === D_STAY) {
      if (curCode === 1 || curCode === 2) this.stats.conveyor++;
      return { type: 'wait', r: this.r, c: this.c, starved: !b.batteries.length };
    }
    const tr = this.r + DIR_DR[d], tc = this.c + DIR_DC[d];
    if (!b.canEnter(tr, tc, d)) {
      const t = inGrid(tr, tc) ? b.tile[cellIndex(tr, tc)] : 0;
      const unpowered = (t & F_NEEDS_POWER) && !(t & F_POWERED);
      return this.fail(unpowered ? 2 : 5, { tr, tc, d });
    }
    const ev = { type: 'move', from: [this.r, this.c], to: [tr, tc], d, turn: null };
    const tcode = b.code(tr, tc), tflags = b.flags(tr, tc);
    if (tcode === 1 || tcode === 2) this.stats.conveyor++;
    // Stepping from the bottom into the shaft starts the cab (BD6010@8692).
    if (tcode === 88 && (curCode === 4 || curCode === 6)) {
      this.stats.elevator++;
      ev.lift = b.owner[cellIndex(tr, tc)];
    }

    // Leaving a gadget's entry cell: the gadget takes over the mouse.
    if (b.flags(this.r, this.c) & F_ENTRY) {
      const g = b.specialAt(this.r, this.c);
      this.inGadget = g;
      this.stats.uses[b.design.parts[g].v]++;
      this.hidden = true;
      ev.gadgetStart = g;
      ev.gadgetPowered = b.powered(this.r, this.c);
    }
    if (tflags & F_EXIT && this.inGadget >= 0) {
      ev.gadgetExit = this.inGadget;
      this.inGadget = -1;
    }
    if ((d === D_LEFT || d === D_RIGHT) && d !== this.facing) {
      ev.turn = d;
      this.facing = d;
    }
    ev.hidden = this.hidden;
    if (ev.gadgetExit !== undefined) this.hidden = false;
    this.r = tr; this.c = tc;
    return ev;
  }
}

function newStats() {
  return { conveyor: 0, elevator: 0, uses: new Array(10).fill(0) };
}

function computeScore(board, stats, ok) {
  let s = SCORE.battery * board.batteries.length + SCORE.conveyor * stats.conveyor +
          SCORE.elevator * stats.elevator + SCORE.connector * board.connectorCount();
  stats.uses.forEach((u, i) => { s += u * SPECIALS[i].score; });
  if (!ok) s = 0;
  return Math.max(0, s);
}

function rankOf(score) {
  return score < RANKS[0] ? 0 : score < RANKS[1] ? 1 : 2;
}

// Challenge check after a successful mouse (BD6010 L7998). Returns 0 if met,
// otherwise the failure kind: 1 conveyors, 2 elevators, 3 parts.
function checkChallenge(ch, stats) {
  if (stats.elevator < ch.minElev) return 2;
  if (stats.conveyor < ch.minConv) return 1;
  for (const k of Object.keys(ch.req)) {
    if (stats.uses[k] < ch.req[k]) return 3;
  }
  if (ch.flag && !(stats.uses[5] > 0 || stats.uses[8] > 0)) return 3;
  return 0;
}

if (typeof module !== 'undefined') {
  module.exports = { Design, Board, MouseRun, newStats, computeScore, rankOf, checkChallenge, partCells };
}
