// Language support (Spanish / English).
//
// The game files are the Spanish release, so the original graphics with text
// in them and Howard's voice stay in Spanish. Everything the app draws as text
// (part names and descriptions, help, messages, workshop texts) and the page
// controls follow the selected language. English game texts are translations
// of the Spanish originals.
'use strict';

let LANG = (() => {
  try {
    const v = JSON.parse(localStorage.getItem('maze.lang'));
    if (v === 'es' || v === 'en') return v;
  } catch (e) { /* storage unavailable */ }
  return (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en';
})();

function setLang(lang) {
  LANG = lang === 'en' ? 'en' : 'es';
  try { localStorage.setItem('maze.lang', JSON.stringify(LANG)); } catch (e) { /* ignore */ }
  document.documentElement.lang = LANG;
}

const plural = (n, one, many) => (n === 1 ? one : many);

const I18N = {
  es: {
    titleMaze: 'Laberinto de Larry',
    titleTaller: 'Taller de máquinas',
    available: (n) => `Disponibles: ${n}`,
    clearAll: '¿Quieres borrar todo el plano?',
    newDesign: '¿Empezar un plano nuevo?',
    needStartEnd: 'Necesitas un punto de partida y un final para probar el invento.',
    challengesStd: 'Las pruebas usan el plano original de 14 × 10.',
    maxBatteries: (n) => `Esta prueba permite como máximo ${n} ${plural(n, 'pila', 'pilas')}.`,
    mouseDone: (k, n) => `Ratón ${k} de ${n} completado`,
    pause: 'PAUSA',
    currentChallenge: (n) => `Prueba actual: ${n}`,
    seeSolution: 'Ver una solución',
    rulesTitle: 'Normas para diseñar artilugios',
    clickToClose: 'Haz clic para cerrar.',
    challengeBanner: (n, t) => `PRUEBA ${n}: ${t}`,
    sumMice: (n) => `${n} ${plural(n, 'ratón', 'ratones')}`,
    sumBat: (n) => `máx. ${n} ${plural(n, 'pila', 'pilas')}`,
    sumConv: (n) => `${n}+ cintas`,
    sumElev: (n) => `${n}+ ascensores`,
    sumFlag: 'ROTOELEVADORA o BARBALISA',
    hint: (k) => `Pista ${k} / 2`,
    // page controls
    roomMaze: 'Laberinto de Larry',
    roomTaller: 'Taller de máquinas',
    new: 'Nuevo',
    saves: 'Guardar / Abrir…',
    png: 'Imagen PNG',
    rules: 'Normas',
    board: (c, r) => `Plano ${c} × ${r}`,
    boardOriginal: (c, r) => `Plano ${c} × ${r} (original)`,
    sound: 'Sonido',
    music: 'Música',
    slow: 'Lento', normal: 'Normal', fast: 'Rápido', faster: 'Muy rápido',
    speedTitle: 'Velocidad', zoomTitle: 'Zoom', boardTitle: 'Tamaño del plano', roomTitle: 'Sala', langTitle: 'Idioma',
    hintText: 'Arrastra las piezas desde el visor de la izquierda hasta el plano (o haz clic para tomarlas y otra vez para soltarlas). ' +
      'Arrastra una pieza fuera del plano (o clic derecho) para quitarla. La rueda del ratón cambia de pieza. ' +
      'Las pruebas usan el plano original de 14 × 10; los planos más grandes son para el modo libre.',
    loading: 'Cargando los archivos del juego…',
    noFiles: 'Elige tu copia de «Taller de inventos»: la carpeta del CD (o una copia de ella) o la imagen del CD (.iso).',
    badFiles: (e) => `No pude leer los archivos del juego (${e}). Prueba con otra carpeta o imagen.`,
    pickFolder: 'Elegir la carpeta del juego',
    pickIso: 'Elegir la imagen del CD (.iso)',
    pickNote: 'Los archivos se leen en tu navegador; no se suben a ningún sitio.',
    savesTitle: 'Guardar y abrir planos',
    slot: (i) => `Hueco ${i} (vacío)`,
    saveHere: 'Guardar aquí', overwrite: '¿Sobrescribir?', open: 'Abrir', delete: 'Borrar',
    download: 'Descargar archivo .json', openFile: 'Abrir archivo .json…', close: 'Cerrar',
    savedIn: (i) => `Guardado en el hueco ${i}.`,
    downloading: 'Descargando artilugio.json…',
    opened: (n) => `Plano abierto: ${n}`,
    cantRead: (e) => `No se pudo leer el plano: ${e}`,
    removedParts: (n) => `Se quitaron ${n} pieza(s) que no cabían.`,
    partsDontFit: 'Algunas piezas no caben en el plano más pequeño. ¿Quitarlas?',
    slotInfo: (p, c, r, d) => `${p} piezas · ${c} × ${r} · ${d}`,
    statusFree: 'Modo libre',
    statusChallenge: (n, t) => `Prueba ${n}: ${t}`,
    statusParts: (n) => `${n} ${plural(n, 'pieza', 'piezas')}`,
    statusTaller: (n) => `Taller de máquinas · ${n} de 10 máquinas construidas`,
  },
  en: {
    titleMaze: "Larry's Maze",
    titleTaller: 'Machine Workshop',
    available: (n) => `Available: ${n}`,
    clearAll: 'Erase the whole blueprint?',
    newDesign: 'Start a new blueprint?',
    needStartEnd: 'You need a start point and an end to test the invention.',
    challengesStd: 'Challenges use the original 14 × 10 blueprint.',
    maxBatteries: (n) => `This challenge allows at most ${n} ${plural(n, 'battery', 'batteries')}.`,
    mouseDone: (k, n) => `Mouse ${k} of ${n} done`,
    pause: 'PAUSED',
    currentChallenge: (n) => `Current challenge: ${n}`,
    seeSolution: 'See a solution',
    rulesTitle: 'Rules for designing contraptions',
    clickToClose: 'Click to close.',
    challengeBanner: (n, t) => `CHALLENGE ${n}: ${t}`,
    sumMice: (n) => `${n} ${plural(n, 'mouse', 'mice')}`,
    sumBat: (n) => `max. ${n} ${plural(n, 'battery', 'batteries')}`,
    sumConv: (n) => `${n}+ conveyor steps`,
    sumElev: (n) => `${n}+ elevator rides`,
    sumFlag: 'ROTO-ELEVATOR or SMOOTH SHAVER',
    hint: (k) => `Hint ${k} / 2`,
    roomMaze: "Larry's Maze",
    roomTaller: 'Machine Workshop',
    new: 'New',
    saves: 'Save / Open…',
    png: 'PNG image',
    rules: 'Rules',
    board: (c, r) => `Board ${c} × ${r}`,
    boardOriginal: (c, r) => `Board ${c} × ${r} (original)`,
    sound: 'Sound',
    music: 'Music',
    slow: 'Slow', normal: 'Normal', fast: 'Fast', faster: 'Very fast',
    speedTitle: 'Speed', zoomTitle: 'Zoom', boardTitle: 'Board size', roomTitle: 'Room', langTitle: 'Language',
    hintText: 'Drag parts from the viewer on the left onto the blueprint (or click to pick one up and click again to drop it). ' +
      'Drag a part off the blueprint (or right-click it) to remove it. The mouse wheel changes the part. ' +
      'Challenges use the original 14 × 10 blueprint; larger boards are for free play.',
    loading: 'Loading the game files…',
    noFiles: 'Choose your copy of "Taller de inventos": the CD folder (or a copy of it) or the CD image (.iso).',
    badFiles: (e) => `Couldn't read the game files (${e}). Try another folder or image.`,
    pickFolder: 'Choose the game folder',
    pickIso: 'Choose the CD image (.iso)',
    pickNote: 'The files are read in your browser; nothing is uploaded.',
    savesTitle: 'Save and open blueprints',
    slot: (i) => `Slot ${i} (empty)`,
    saveHere: 'Save here', overwrite: 'Overwrite?', open: 'Open', delete: 'Delete',
    download: 'Download .json file', openFile: 'Open .json file…', close: 'Close',
    savedIn: (i) => `Saved in slot ${i}.`,
    downloading: 'Downloading artilugio.json…',
    opened: (n) => `Opened: ${n}`,
    cantRead: (e) => `Couldn't read the blueprint: ${e}`,
    removedParts: (n) => `Removed ${n} part(s) that didn't fit.`,
    partsDontFit: "Some parts don't fit on the smaller board. Remove them?",
    slotInfo: (p, c, r, d) => `${p} parts · ${c} × ${r} · ${d}`,
    statusFree: 'Free play',
    statusChallenge: (n, t) => `Challenge ${n}: ${t}`,
    statusParts: (n) => `${n} ${plural(n, 'part', 'parts')}`,
    statusTaller: (n) => `Machine Workshop · ${n} of 10 machines built`,
  },
};

function T(key, ...args) {
  const s = I18N[LANG][key] !== undefined ? I18N[LANG][key] : I18N.es[key];
  if (s === undefined) return key;
  return typeof s === 'function' ? s(...args) : s;
}

// ---------------------------------------------------------------- English game texts

const EN = {
  typeNames: ['BATTERIES', 'START POINT', 'END', 'MOTORS', 'CONVEYORS', 'ELEVATORS', 'SPECIAL PARTS', 'CONNECTORS'],
  variants: [
    [{ title: 'BATTERY A', text: 'Connect this battery to a motor to power the parts connected to it.' }],
    [{ title: 'START POINT', text: 'This is where a mouse starts. You can only have one start point.' }],
    [{ title: 'END', text: 'This is where the mouse will try to get to.' }],
    [{ title: 'MOTOR A', text: 'Connect this motor to a battery to power the parts connected to it.' }],
    [
      { title: 'LEFT TO RIGHT', text: 'This conveyor carries the mouse from left to right.' },
      { title: 'RIGHT TO LEFT', text: 'This conveyor carries the mouse from right to left.' },
    ],
    [
      { title: 'LEFT TO RIGHT', text: 'This elevator lifts the mouse to a higher level, from left to right.' },
      { title: 'LEFT TO LEFT', text: 'This elevator lifts the mouse to a higher level, from left to left.' },
      { title: 'RIGHT TO LEFT', text: 'This elevator lifts the mouse to a higher level, from right to left.' },
      { title: 'RIGHT TO RIGHT', text: 'This elevator lifts the mouse to a higher level, from right to right.' },
    ],
    [
      { title: 'ROD 1', text: 'Carries mechanical power along a horizontal shaft.' },
      { title: 'ROD 2', text: 'Carries mechanical power along a vertical shaft.' },
      { title: 'ANGLE 1', text: 'A gear in this part turns mechanical power through a 90 degree angle.' },
      { title: 'ANGLE 2', text: 'A gear in this part turns mechanical power through a 90 degree angle.' },
      { title: 'ANGLE 3', text: 'A gear in this part turns mechanical power through a 90 degree angle.' },
      { title: 'ANGLE 4', text: 'A gear in this part turns mechanical power through a 90 degree angle.' },
      { title: 'CONVERTER 1', text: 'This part uses three gears to pass mechanical power from one rod to two more rods.' },
      { title: 'CONVERTER 2', text: 'This part uses three gears to pass mechanical power from one rod to two more rods.' },
      { title: 'CONVERTER 3', text: 'This part uses three gears to pass mechanical power from one rod to two more rods.' },
      { title: 'CONVERTER 4', text: 'This part uses three gears to pass mechanical power from one rod to two more rods.' },
      { title: '4-WAY CONVERTER', text: 'This part uses three gears to pass mechanical power from one rod to three more rods.' },
    ],
    [
      { title: '2-SMOOTHER', text: 'Anything you put into this gadget comes out with a smooth bottom.' },
      { title: 'DOWN-DOWN SLIDE', text: 'Designed for efficient transport, this gadget gives you a fast way down.' },
      { title: 'POLISH-O-MATIC', text: 'Use this machine to gently clean a contraption.' },
      { title: 'CATCH ME IF YOU CAN', text: "This high-tech gadget tests an object's potential for teleportation." },
      { title: 'I CAN SEE YOU', text: 'Deploy this high-tech inspection station to examine the object all the way around.' },
      { title: 'ROTO-ELEVATOR STATION', text: 'This gadget takes you up a level while mixing its contents.' },
      { title: 'THE SAY-NO GADGET', text: 'When a mouse swallows helium, it ends up with a very funny voice.' },
      { title: 'SPRING-O-METER', text: 'This gadget tests the courage of the mice that go through it.' },
      { title: 'SMOOTH SHAVER', text: 'It looks painful, but this gadget gives mice a close shave.' },
      { title: 'L.A. FREEWAY SIMULATOR', text: "Simulates a traffic jam. Tests the mouse's patience." },
    ],
  ],
  help: [
    'A1. You need a start point and an end. Once the path between them is complete, the mouse is carried from the start to the end.',
    'A2. To complete a path, connect conveyors, elevators and gadgets following their arrows.',
    'A3. The mouse falls through empty spaces in the path... (handy for taking it down a level).',
    'A4. Every part of your contraption needs power from a motor. Connect the parts to a motor with connectors, then connect the motor to a battery for electricity.',
    'A5. You can use up to ten motors and batteries in your contraption.',
    'A6. Efficiency first! If you connect every part to one battery, it will run out. An efficient machine finishes the job before the battery runs out.',
    'Hint: the motor goes right above the battery; power leaves through the sides of the motor and only reaches a part through a connector placed right below it.',
  ],
  challengeTitles: [
    "The Mice's Washroom", 'Mr. Mouse Goes to Los Angeles', "Mr. Mouse's Helium Flash",
    'Smash, Dazzle and Wash!', 'The Race', 'Airborne Larry', 'A Good Send-off!', 'Mouseland',
    'Light the Fuse, Larry', 'High Flying!',
  ],
  taller: {
    components: [
      'phonograph needle', 'robot power unit', 'computer processor', 'transformer', 'microphone',
      'robot arm', 'hydraulic generator', 'fan blades', 'turntable', 'power supply', 'small motor',
      'amplifier', 'speaker', 'medium motor', 'bag', 'tube', 'thermostat', 'electric switch',
      'automatic electric switch', 'heating element', 'tube', 'support tray', 'spring',
      'electromagnet', 'latch', 'wheels', 'magnet', 'electric circuit', 'hammer', 'bell',
      'electric train track', 'light bulb',
    ],
    connections: [
      'data transfer', 'mechanical force', 'hydraulic force', 'magnetism',
      'variable electric signal', 'electric current', 'suction',
    ],
    machines: [
      'Heat indicator', 'Fan', 'Electric train', 'Vacuum cleaner', 'Robot arm', 'Electromagnetic bell',
      'Hair dryer', 'Toaster', 'Burglar alarm', 'Robot D.J.', 'Lamp',
    ],
    help: [
      'A1. Press the button at the top of the screen to build a machine. Then press one of the names to begin.',
      'A2. The blueprint has two steps:\n\n1. Choose the parts for the machine from the square pictures.\n\n2. Check how the parts work together using the round pictures.',
      'A3. Drag the pictures to the spaces where you want them to complete the blueprint. If you change your mind, drag them somewhere else. Use the arrows at the bottom of the screen to see all the parts.',
      'A4. The round pictures connect the parts. Read the name and description at the top of the window for each one. The flow of the lines in the blueprint shows the type of connection.',
      'A5. When you are done, press the Build button. Remember to fill in every blank space.',
    ],
    // translations of 71/BD71xx.STR, 72/BD72xx.STR and 73/BD73xx.STR
    str: {
      7100: 'The phonograph needle vibrates against the grooves of the record. This creates weak electric signals that become sound once they are amplified.',
      7101: 'The robot power unit sends electricity to a hydraulic generator after receiving instructions from the computer.',
      7102: 'The computer processor can be programmed to respond to signals from input devices such as keyboards or microphones, and to send digital instructions to the hardware the computer controls.',
      7103: 'A transformer lowers the voltage of an electric current. Some machines only work at low voltage, while others run at different speeds depending on the voltage.',
      7104: 'Microphones turn sound vibrations into electric signals. These are then turned into louder sounds by an amplifier, a recorder or a computer.',
      7105: 'A robot arm has joints that are moved by hydraulic force.',
      7106: 'The hydraulic generator pressurizes fluids. They are connected to machines through tubes, and the generator can drive different components by raising and lowering the pressure.',
      7107: 'When a motor turns them, fan blades take in air on one side and push it out the other.',
      7108: 'The turntable is a round platter that spins a record, powered by a small motor.',
      7109: 'Every machine that uses electric current must be connected to the power supply.',
      7110: 'This motor runs on electric current and is ideal for small appliances.',
      7111: 'An amplifier raises the voltage of weak electric signals from a microphone, a recorder or a phonograph needle and sends the amplified signal to a speaker to make sound.',
      7112: 'Speakers use a small electromagnet to vibrate a diaphragm, which makes sound waves when the electromagnet receives electric signals from an amplifier.',
      7113: 'This electric motor is ideal for small appliances, but it is too big for very small machines.',
      7114: 'If you are building a vacuum cleaner, you need a bag to collect the dust. The bag has tiny holes that only let air through.',
      7115: 'A tube can be flexible.',
      7116: 'This thermostat completes an electric circuit with a metal strip. The strip is made of two metals that expand and contract, moving toward or away from a contact as the temperature changes.',
      7117: 'This electric switch works by hand and lets you turn the machine on or off.',
      7118: 'Use this for any electric switch that is turned on or off by other parts of a machine (not by hand).',
      7119: 'When electric current flows through a heating element, the metal atoms inside it vibrate and create heat.',
      7120: 'A tube channels the air when suction draws it through.',
      7121: 'If you are building a toaster, you need a support tray. This is the tray that moves against a spring, holding the toast close to the heating elements.',
      7122: 'A spring is a coiled piece of metal that can stretch or compress and always returns to its original shape once the pressure stops.',
      7123: 'When electric current flows through the solenoid, it creates a magnetic force that pulls nearby metal objects, which in turn complete an electric circuit.',
      7124: 'The latch is useful in machines with a spring. When the lever is pushed against the spring part, the latch holds it in place.',
      7125: 'This is one of the oldest inventions! If you want something to roll, use wheels.',
      7126: 'A magnet is a piece of metal whose ends have opposite charges and can attract or repel other metal pieces. Iron is especially sensitive to magnetic force.',
      7127: 'The iron is pulled toward a magnet, breaking the electric circuit. When the magnet lets go of the iron, the spring returns the contacts to their original position and the circuit is completed.',
      7128: 'If you are building a gadget that rings a bell on its own, attach this hammer to a spring armature and the hammer strikes the bell as the armature moves.',
      7129: 'This curved piece of metal rings when a hammer strikes it.',
      7130: 'The electric train track does two things: the train wheels run along it, and it carries electricity to the motor.',
      7131: 'Light bulbs have a wire filament that heats up and glows when electric current flows through it.',
      7200: 'The complex communication used by computers is based on a fast sequence of coded numbers.',
      7201: 'When one part hits, pushes, turns, holds, rubs or makes any other simple physical contact with another part.',
      7202: 'Used for machines that need liquid under pressure to do their job.',
      7203: 'The force that comes from a natural magnet or an electromagnet, which attracts metal or repels other magnets.',
      7204: 'What machines produce when they change one form of energy into another, such as sound waves or friction into electricity.',
      7205: 'A steady flow of electrons through a wire that powers machines that run on electricity.',
      7206: 'The force made by a fan or a pump that uses changes in pressure to move air or water.',
      7300: 'Heat indicator: 1. The heat indicator uses electricity to turn on a light when it gets hot. The key is a special part that works like a switch when it heats up.',
      7301: 'Heat indicator: 2. Electricity flows in a circuit through the parts of a machine. Some parts, such as the spring armature or the bimetal thermostat, break or complete the circuit, so the machine turns on or off depending on magnetism or heat.',
      7302: 'Three-speed fan: 1. Use a special part that gives the motor different amounts of power so the fan can spin at different speeds.',
      7303: 'Three-speed fan: 2. Motors turn electric energy into mechanical force to move the parts connected to them.',
      7304: 'Electric train: 1. The electric train has to run at different speeds, so remember which part lets you do that.',
      7305: 'Electric train: 2. Electric trains get their power from the track itself!',
      7306: 'Vacuum cleaner: 1. The vacuum cleaner has a fan that creates suction, which pulls in dirt and stores it in a chamber or a bag.',
      7307: "Vacuum cleaner: 2. Vacuum cleaners need a powerful motor to create enough suction, or they won't work.",
      7308: 'Robot arm: 1. The robot arm uses a computer to control the power sent to the arm\'s hydraulic systems. The computer program remembers every movement the arm makes and decides how to use them.',
      7309: 'Robot arm: 2. The robot arm works with a hydraulic system. Electric energy pressurizes the hydraulic fluid, which flows through the arm in tubes and moves it by pushing on the pistons.',
      7310: 'Electromagnetic bell: 1. When it is turned on, the electromagnetic bell rings continuously. It has a hammer attached to a part that moves back and forth, so the hammer can strike the bell.',
      7311: 'Electromagnetic bell: 2. This bell has a spring armature, a bit like a switch. Power flows through the armature to an electromagnet. When the power reaches the electromagnet, it pulls the armature and breaks the circuit, which turns the magnet off. This loop lets the armature move back and forth.',
      7312: 'Hair dryer: 1. Hair dryers have a safety switch that detects when the dryer gets too hot and cuts the power to prevent a fire.',
      7313: 'Hair dryer: 2. Suction can be used two ways: it can pull air into the machine or blow it out.',
      7314: 'Toaster: 1. When you turn the toaster on, you press a lever that compresses a spring.',
      7315: 'Toaster: 2. To make the toast pop up once it is hot, the toaster has a thermostat that sets off a chain reaction of a magnet, a latch, the lever and the spring.',
      7316: 'Burglar alarm: 1. To build a burglar alarm, use the electromagnetic bell with another set of parts that has a magnet, to check whether a window has been opened.',
      7317: 'Burglar alarm: 2. The magnet pulls a part that stops electricity from reaching the bell. When the magnet moves, the electricity flows and the bell rings.',
      7318: 'Robot DJ: 1. The Robot DJ needs several parts working together: use the robot arm with a phonograph and a stereo to get sound.',
      7319: 'Robot DJ: 2. The computer must be able to listen to the music and decide which song to play next.',
    },
  },
};

// ---------------------------------------------------------------- accessors

const typeName = (t) => (LANG === 'en' ? EN.typeNames[t] : TYPES[t].name);
const variantInfo = (t, v) => (LANG === 'en' ? EN.variants[t][v] : VARIANT_INFO[t][v]);
const mazeHelp = () => (LANG === 'en' ? EN.help : HELP);
const challengeTitle = (n) => (LANG === 'en' ? EN.challengeTitles : CHALLENGE_TITLES)[n - 1];
const tallerComp = (id) => (LANG === 'en' ? EN.taller.components[id] : TALLER.components[id]);
const tallerConn = (t) => (LANG === 'en' ? EN.taller.connections[t] : TALLER.connections[t]);
const tallerMachine = (m) => (LANG === 'en' ? EN.taller.machines[m] : TALLER.machines[m].name.trim());
const tallerHelp = () => (LANG === 'en' ? EN.taller.help : TALLER.help);
// English text for an STR record, or null to use the game's Spanish file.
const strOverride = (num) => (LANG === 'en' && EN.taller.str[num]) || null;
