// Rules data for the mouse-maze activity, transcribed from the game scripts
// (60/BD6000.PAG editor, 60/BD6010.PAG test floor). See docs/MAZE_RULES.md.
'use strict';

const CELL = 30;
const STD_COLS = 14, STD_ROWS = 10;  // the original blueprint size
const MAX_COLS = 40, MAX_ROWS = 30;
// Current board size. Larger boards are an extension; challenges use 14x10.
let GRID_COLS = STD_COLS, GRID_ROWS = STD_ROWS;
function setGridSize(cols, rows) {
  GRID_COLS = Math.max(STD_COLS, Math.min(MAX_COLS, cols | 0));
  GRID_ROWS = Math.max(STD_ROWS, Math.min(MAX_ROWS, rows | 0));
}
const isStdSize = () => GRID_COLS === STD_COLS && GRID_ROWS === STD_ROWS;
const ED_X = 168, ED_Y = 35;          // editor grid origin (BD6000)
const TEST_X = 175, TEST_Y = 134;     // test-floor grid origin (BD6010)
const TILE_REF_X = 305, TILE_REF_Y = 225; // test tiles are authored for this cell

// Part types (g344).
const T_BATTERY = 0, T_START = 1, T_END = 2, T_MOTOR = 3, T_CONVEYOR = 4,
      T_ELEVATOR = 5, T_CONNECTOR = 6, T_SPECIAL = 7;

const TYPES = [
  { name: 'PILAS', variants: 1, stock: 10, rows: 1, placedIcon: 2, paletteIcon: 2 },
  { name: 'PUNTO DE PARTIDA', variants: 1, stock: 1, rows: 1, placedIcon: 5, paletteIcon: 5 },
  { name: 'FIN', variants: 1, stock: 1, rows: 1, placedIcon: 3, paletteIcon: 3 },
  { name: 'MOTORES', variants: 1, stock: 10, rows: 1, placedIcon: 4, paletteIcon: 4 },
  { name: 'CINTAS', variants: 2, stock: Infinity, rows: 1, placedIcon: 6, paletteIcon: 6 },
  { name: 'ASCENSORES', variants: 4, stock: Infinity, rows: 3, placedIcon: 8, paletteIcon: 8 },
  { name: 'CONECTORES', variants: 11, stock: 90, rows: 1, placedIcon: 12, paletteIcon: 12 },
  { name: 'PIEZAS ESPECIALES', variants: 10, stock: 10, rows: 0, placedIcon: 36, paletteIcon: 46 },
];
// Order of the category arrows (code[217..224]).
const CATEGORY_ORDER = [1, 3, 0, 4, 5, 7, 6, 2];

// Tile codes written to the grid, per type and variant.
// Elevators list [top, shaft, bottom].
const TILE_CODES = [
  [40], [50], [51], [31], [1, 2],
  [[3, 88, 4], [5, 88, 4], [5, 88, 6], [3, 88, 6]],
  [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
  [60, 61, 62, 63, 64, 65, 66, 67, 68, 69],
];

// Connector arm masks: 1 left, 2 right, 4 up, 8 down (code 20..30).
const ARMS = [3, 12, 10, 9, 5, 6, 7, 11, 14, 13, 15];

const VARIANT_INFO = [
  [{ title: 'PILA A', text: 'Conecta esta pila eléctrica a un motor para ofrecer potencia a las piezas conectadas a éste.' }],
  [{ title: 'PUNTO DE PARTIDA', text: 'Éste es el lugar de partida de un ratón. Sólo puedes disponer de un punto de partida.' }],
  [{ title: 'FIN', text: 'Éste es el lugar al que intentará llegar el ratón.' }],
  [{ title: 'MOTOR A', text: 'Conecta este motor a una pila eléctrica para ofrecer potencia a las piezas conectadas a éste.' }],
  [
    { title: 'DE IZQUIERDA A DERECHA', text: 'Esta cinta transportará al ratón de izquierda a derecha.' },
    { title: 'DE DERECHA A IZQUIERDA', text: 'Esta cinta transportará al ratón de derecha a izquierda.' },
  ],
  [
    { title: 'DE IZQUIERDA A DERECHA', text: 'Este ascensor transportará al ratón a un nivel superior de izquierda a derecha.' },
    { title: 'IZQUIERDA A IZQUIERDA', text: 'Este ascensor transportará al ratón a un nivel superior de izquierda a izquierda.' },
    { title: 'DERECHA A IZQUIERDA', text: 'Este ascensor transportará al ratón a un nivel superior de derecha a izquierda.' },
    { title: 'DERECHA A DERECHA', text: 'Este ascensor transportará al ratón a un nivel superior de derecha a derecha.' },
  ],
  [
    { title: 'VARILLA 1', text: 'Transfiere la potencia mecánica por un eje horizontal.' },
    { title: 'VARILLA 2', text: 'Transfiere la potencia mecánica por un eje vertical.' },
    { title: 'ÁNGULO 1', text: 'Un engranaje en esta pieza canaliza la potencia mecánica en un ángulo de 90 grados.' },
    { title: 'ÁNGULO 2', text: 'Un engranaje en esta pieza canaliza la potencia mecánica en un ángulo de 90 grados.' },
    { title: 'ÁNGULO 3', text: 'Un engranaje en esta pieza canaliza la potencia mecánica en un ángulo de 90 grados.' },
    { title: 'ÁNGULO 4', text: 'Un engranaje en esta pieza canaliza la potencia mecánica en un ángulo de 90 grados.' },
    { title: 'CONVERSOR 1', text: 'Esta pieza recurre a tres engranajes para transferir la energía mecánica desde una varilla a dos varillas adicionales.' },
    { title: 'CONVERSOR 2', text: 'Esta pieza recurre a tres engranajes para transferir la energía mecánica desde una varilla a dos varillas adicionales.' },
    { title: 'CONVERSOR 3', text: 'Esta pieza recurre a tres engranajes para transferir la energía mecánica desde una varilla a dos varillas adicionales.' },
    { title: 'CONVERSOR 4', text: 'Esta pieza recurre a tres engranajes para transferir la energía mecánica desde una varilla a dos varillas adicionales.' },
    { title: 'CONVERSOR 4 PUNTOS', text: 'Esta pieza recurre a tres engranajes para transferir la energía mecánica desde una varilla a tres varillas adicionales.' },
  ],
  [
    { title: '2-ALISADORA', text: 'Los objetos que insertes en este artilugio saldrán con su parte inferior suave.' },
    { title: 'BAJALABAJA', text: 'Ideado para un transporte eficaz, este artilugio te ofrece un rápido descenso.' },
    { title: 'PULEMATIC', text: 'Recurre a esta máquina para limpiar un artilugio con suavidad.' },
    { title: 'CORRE QUE TE PILLO', text: 'Este artilugio de alta tecnología comprueba el potencial teletransportador de un objeto.' },
    { title: 'MIRA QUE TE VEO', text: 'Despliega esta estación de inspección de alta tecnología para examinar el objeto en torno a los 360 grados.' },
    { title: 'ESTACIÓN ROTOELEVADORA', text: 'Este artilugio te transportará a un nivel superior mientras mezcla su contenido.' },
    { title: 'EL ARTILUGIO DÍ QUE NO', text: 'Cuando un ratón ingiere helio, acabará con una voz más que graciosa.' },
    { title: 'METROMUELLE', text: 'Este artilugio verifica el coraje de los ratones que lo atraviesan.' },
    { title: 'BARBALISA', text: 'Aunque parece que duele, este artilugio les da un buen afeitado a los ratones.' },
    { title: 'SIMULADOR AUTOPISTA L.A.', text: 'Simula un atasco. Comprueba la paciencia del ratón.' },
  ],
];

// Special gadgets: entry A, exit B, power input P as [row, col] relative to
// the top-left; mask values v become tile code 80+v (0 = cell not occupied).
const SPECIALS = [
  { cols: 6, rows: 3, A: [2, 0], B: [2, 5], P: [2, 0], score: 3500, pfl: [6000], sounds: { 3: 6056 },
    mask: [[13, 0, 13, 13, 0, 0], [13, 7, 2, 2, 3, 0], [14, 1, 0, 13, 10, 2]] },
  { cols: 8, rows: 8, A: [0, 0], B: [7, 0], P: [7, 7], score: 5500, pfl: [6001], sounds: { 1: 6050, 18: 6051, 80: 6052 },
    mask: [[2, 2, 2, 2, 2, 2, 2, 3], [0, 0, 0, 0, 0, 0, 0, 11], [0, 0, 0, 0, 0, 0, 0, 11], [0, 0, 0, 0, 0, 0, 0, 11],
           [0, 0, 0, 0, 0, 0, 0, 11], [0, 0, 0, 0, 0, 0, 0, 11], [0, 0, 0, 0, 0, 0, 0, 11], [5, 5, 5, 5, 5, 5, 5, 19]] },
  { cols: 4, rows: 5, A: [4, 0], B: [4, 3], P: [4, 1], score: 4500, pfl: [6002], sounds: { 1: 6053, 46: 6054, 115: 6055 }, doneAt: 100,
    mask: [[13, 13, 13, 13], [13, 13, 13, 13], [0, 13, 13, 0], [13, 13, 13, 13], [2, 14, 2, 2]] },
  { cols: 4, rows: 3, A: [2, 0], B: [2, 3], P: [2, 0], score: 2000, pfl: [6003], sounds: { 1: 6057 },
    mask: [[7, 2, 2, 3], [8, 0, 0, 11], [20, 0, 0, 10]] },
  { cols: 5, rows: 3, A: [2, 0], B: [2, 4], P: [2, 2], score: 3750, pfl: [6004], sounds: { 1: 6058 }, offset: [5, 0],
    mask: [[13, 13, 13, 13, 13], [13, 13, 13, 13, 13], [2, 2, 14, 2, 2]] },
  { cols: 5, rows: 5, A: [4, 4], B: [0, 0], P: [4, 2], score: 3000, pfl: [6005], sounds: { 1: 6059 },
    mask: [[5, 9, 0, 0, 0], [0, 4, 9, 0, 0], [0, 0, 4, 9, 0], [0, 0, 13, 8, 13], [0, 0, 18, 4, 5]] },
  { cols: 5, rows: 4, A: [3, 4], B: [3, 0], P: [3, 2], score: 5000, pfl: [6006], sounds: { 5: 6071 },
    mask: [[13, 13, 13, 13, 13], [13, 13, 13, 13, 13], [13, 13, 13, 13, 13], [5, 5, 15, 5, 5]] },
  { cols: 2, rows: 5, A: [2, 1], B: [0, 0], P: [4, 1], score: 1650, pfl: [6010, 6010, 6010, 6011],
    sounds: { 3: 6072, 22: 6072 }, sounds6011: { 3: 6072, 15: 6073, 75: 6072, 94: 6072 },
    mask: [[5, 9], [0, 8], [0, 4], [0, 13], [13, 18]] },
  { cols: 4, rows: 5, A: [4, 3], B: [0, 0], P: [4, 1], score: 3000, pfl: [6008], sounds: { 1: 6074 },
    mask: [[5, 5, 9, 0], [0, 13, 8, 0], [0, 13, 8, 0], [0, 13, 8, 0], [0, 18, 4, 5]] },
  { cols: 4, rows: 3, A: [0, 3], B: [0, 0], P: [2, 1], score: 3000, pfl: [6009], sounds: { 1: 6075 }, offset: [4, -2],
    mask: [[5, 5, 5, 5], [13, 13, 13, 13], [13, 18, 13, 13]] },
];
// Specials 2..5 are drawn behind the mouse, the rest in front.
const SPECIAL_BEHIND = [false, false, true, true, true, true, false, false, false, false];

// Movement directions.
const D_LEFT = 0, D_RIGHT = 1, D_UP = 2, D_DOWN = 3, D_STAY = 4, D_DONE = 5;
const DIR_DC = [-1, 1, 0, 0, 0], DIR_DR = [0, 0, -1, 1, 0];
const DIR_BIT = [2, 1, 8, 4]; // entry-mask bit needed when moving in direction d

// Direction out of tiles 1..6 and special cells 81..100 (v = code-80).
const TILE_DIR = [1, 0, 1, 2, 0, 2];
const TILE_ENTRY = [5, 6, 8, 1, 8, 2];
const SPECIAL_DIR = [2, 1, 3, 2, 0, 3, 1, 2, 0, 1, 3, 0, 4, 1, 0, 2, 1, 4, 0, 2];
const SPECIAL_ENTRY = [1, 1, 1, 2, 2, 2, 8, 8, 8, 4, 4, 4, 16, 1, 2, 2, 4, 16, 4, 1];

// Tile flags (high bits of the grid value).
const F_POWERED = 256, F_NEEDS_POWER = 1024, F_ENTRY = 16384, F_EXIT = 32768;

// Load sets used by the power model. @1290 (power flood entry and load
// counting) has an over-long count that also picks up 10, 90 and 32000;
// @1263 is the entry test of the load counter.
const isPowerLoad = (t) => (t >= 1 && t <= 6) || t === 10 || t === 90 || (t >= 93 && t <= 100);
const isLoadEntry = (t) => (t >= 1 && t <= 6) || (t >= 80 && t <= 99);

// Test-floor graphic slot per tile code: [powered even, powered odd, unpowered].
const TEST_TILES = {
  1: [72, 72, 72], 2: [72, 72, 72], 3: [76, 76, 76], 5: [76, 76, 76],
  20: [122, 133, 145], 21: [121, 132, 144], 22: [128, 139, 151], 23: [129, 140, 152],
  24: [130, 141, 153], 25: [127, 138, 150], 26: [123, 134, 146], 27: [125, 136, 148],
  28: [124, 135, 147], 29: [126, 137, 149], 30: [131, 142, 154],
  31: [143, 143, 143], 40: [71, 71, 71], 50: [94, 94, 94], 51: [155, 155, 155],
};

const SCORE = { battery: -300, conveyor: 200, elevator: 500, connector: -35 };
const RANKS = [3000, 5600]; // < 3000 PENSANTE, < 5600 INVENTOR JUNIOR, else MAESTRO

// Challenges (BD6010 @7192). req = minimum uses per special index.
const CHALLENGES = [
  { mice: 5, maxBat: 1, minElev: 0, minConv: 4, flag: 0, req: { 2: 1 } },
  { mice: 2, maxBat: 1, minElev: 0, minConv: 0, flag: 0, req: { 4: 1, 9: 1 } },
  { mice: 1, maxBat: 1, minElev: 0, minConv: 0, flag: 0, req: { 4: 1, 6: 1, 7: 1, 8: 1 } },
  { mice: 1, maxBat: 10, minElev: 2, minConv: 0, flag: 0, req: { 1: 1, 2: 1, 3: 1 } },
  { mice: 1, maxBat: 2, minElev: 0, minConv: 0, flag: 0, req: { 0: 1, 3: 1, 4: 1, 9: 1 } },
  { mice: 3, maxBat: 2, minElev: 1, minConv: 0, flag: 1, req: { 6: 1, 7: 1 } },
  { mice: 1, maxBat: 2, minElev: 2, minConv: 3, flag: 0, req: { 1: 1, 7: 3 } },
  { mice: 1, maxBat: 1, minElev: 0, minConv: 0, flag: 1, req: { 0: 1, 3: 1, 9: 1 } },
  { mice: 1, maxBat: 3, minElev: 0, minConv: 0, flag: 0, req: { 3: 6 } },
  { mice: 1, maxBat: 3, minElev: 12, minConv: 0, flag: 0, req: {} },
];

// Sounds (WAV numbers).
const SND = {
  pick: 6039, drop: 6037, remove: 6038, error: 10016, missing: 6097,
  run: 6060, hatch: 6064, arrive: 6065, liftUp: 6062, liftDown: 6063,
  blocked: 6030, batteryDead: 6031, success: [6033, 6034, 6035],
  tooManyBatteries: 6193, chFail: 6199, chElev: 6194, chConv: 6195, chParts: 6196,
  chDone: 6198, chAllDone: 6197, scoreOpen: 10090, fanfare: [10080, 10081, 10082],
  panelIn: 7030, panelOut: 7031,
};
