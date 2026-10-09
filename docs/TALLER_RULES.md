# "El Taller" (machine workshop, section 70): rules and UX specification

Sources:
- `s70/BD7000.txt`: the only scripted page of section 70.
- `s70/BD70xx.txt`: chunk listings of the graphics-only pages.
- `71\BD7100-7131.STR`: component descriptions.
- `72\BD7200-7206.STR`: connection descriptions.
- `73\BD7300-7319.STR`: two hints per machine.
- `taller_machines.json`: every machine table, extracted from the code by `machines.py`. This is the data to ship.
- Sections 75 and 76 (vehicle test track) are a different activity. They have their own part at the end (§9).

Conventions (the same as `MAZE_RULES.md`):
- `@addr` is a token address in `BD7000.txt`. `code[a]` is the int32 token at `a`.
- `seqN` is a sequence, `gN` a global and `lN` a local.
- Confidence: **[C]** confirmed from code, **[I]** inferred, **[?]** uncertain.
- Drawing rule (verified in section 60): an object at (x,y) that shows slot S draws the bitmap at `(x + S.x, y + S.y)`, where S.x,S.y is the bitmap's stored origin from the slot map. "Native position" means the object is at (0,0).
- "Ticks" are the VM delay units. They are probably milliseconds [I].
- Sounds are played through the library helpers:
  - `L4673(wav, vol)` / `L4645(wav, vol)`: one-shot.
  - `L4701(wav, vol)`: looped.
  - `L4811/L4827(wav, vol, x)`: one-shot that returns its channel in `res`.
  - `L4785(ch)`: stop that channel.
  - The second argument is the **volume**, not the channel. Channels are allocated dynamically by L4998.
- Howard's lip-synced speech is `gosub_seq seq40 (wav)`. It uses the library talking head (slots 600..675 streamed from BD10400, drawn at offset (-115,283), layer 5000; `code[3649..3651]` @4436).

---

## 0. What the activity is

1. The player enters a dark rock room with a big glass **capsule**. Howard sits in a porthole at the bottom left.
2. A pull-down **machine chooser** (the scroll at the top) lists 10 machines, called "pruebas", in 3 difficulty rows.
3. After the player chooses one, the green round button opens a **blueprint panel**. It shows a fixed wiring diagram for that machine: blank squares are component slots and blank circles are connection slots.
4. The player drags components into the squares and connection types into the circles. Each comes from its own picker:
   - components: a carousel of 32 square icons;
   - connections: a carousel of 7 circular icons.
5. "Construir" (the running-man button) checks the diagram against a fixed **recipe**:
   - **Incomplete:** a buzz, and the panel stays open.
   - **Otherwise:** the panel closes and a ceiling **robot arm** picks the parts from the pile on the floor and drops them into the capsule.
     - **Correct:** the parts assemble into the machine and a **frame animation** of the machine working plays, with sounds. The machine gets a check mark in the chooser.
     - **Wrong:** sparks and smoke, Howard says a hint, and the panel re-opens. Parts that are placed wrong but needed elsewhere are set aside. Unneeded parts fall away.
6. There is no score [C]. Progress is a bitmask of completed machines (`g603`).
7. The first visit offers a guided tutorial ("El paso a paso de Howard"). In it Howard builds a lamp (machine 10, which is not in the chooser).

---

## 1. Page map and flow

| page | role | how it is used |
|---|---|---|
| **BD7000** | the whole activity (script + 208 graphic slots) | entered from the hub BD3030 (the "metal door on the left", BD3030 seq68 @3056 with sound 9003) or from the navigation map (12th destination, `code[1243+11]=7000`) [C] |
| BD7001 | Robot DJ working animation, 64 frames | loadgfx → slots 201.. (seq150 ~@6655) |
| BD7002 | failure sparks/smoke, 40 frames = 5 anims x 8 | loadgfx → slots 265..304 (seq149 @6578) |
| BD7003 | 11 diagram backgrounds 400x269 (one per machine, chunk 1+g45) | loadgfx → slot 200 (seq196 @8127) |
| BD7004 / 7008 / 7009 / 7013 / 7012 / 7010 / 7005 / 7007 / 7011 / 7006 | working animations for fan / train / vacuum / robot arm / bell / dryer / toaster / alarm / heat indicator / lamp | §5.4 |
| BD7049..BD7059 | per-machine **assembled part graphics** (the parts drawn at their in-capsule positions) | pagstream into slots 120+partId (seq257) |

Exits [C]:
- Exit button (fist icon, slot 159) → `gotopage BD3030` with `g630=7000` (seq242 @10482). BD3030 fades in specially when `g630==7000`.
- Navigation map (hand icon, slot 157) → library seq5 menu with 12 destinations: `code[1243..1254] = 1010 1100 2000 2020 2041 2100 3040 3202 4000 5092 6005 7000`. The current page (7000) is hidden; 4000 goes to BD6500 with start seq 1.
- Help → "2. El paso a paso de Howard" reloads BD7000 with `g632.bit1` set (the tutorial is forced) (seq269 @11523).

Start-up, seq67 @4353 [C]:
1. Clear `g1..g100`, set `g53=-1`.
2. If `g632.bit1` is clear, spawn seq66, the intro **metal shutter**: slot 2 (640x480) glides from y=0 to -480 with WAV 3030 (@4333..4339).
3. Spawn the room objects (§2).
4. Spawn the 35 floor parts: `seq100+i`, frames `120+i`, i=0..34.
5. Spawn the blueprint panel object (seq206) and Howard (seq50).
6. **First visit** (`g631.bit7` clear): set the bit.
   - If `g632.bit1` is set → tutorial (seq81).
   - Otherwise ask with the yes/no dialog (L5834: BD10000 slots 676..678, Yes sets `g686=1`). Yes → tutorial.
7. **Later visits / no tutorial:** Howard says a random greeting **7101..7103** (@4505..4515).
8. Spawn seq202: palette cycle of indexes 224..228 every 100 ticks (blinking lights), unless `videoflags&4`.
9. Reset the board (seq96).
10. Spawn the chooser (seq246) and **open it automatically** after 1000 ticks (`signal seq251` = virtual click, @4529..4544). With the tutorial, this waits until the tutorial ends.
11. Spawn seq79, the looping room ambience **BD7032.WAV** at volume 6 (`L4701(7032,6)`, @5140). This is the "music" loop.

Flow:

```
BD3030 / map ──► BD7000: shutter ─► (tutorial?) ─► chooser opens
chooser: click machine (selects, Howard intro) ─► close (scroll or X)
        ─► machine chosen?  no: green button only buzzes (10016)
                            yes: blueprint panel opens automatically
panel: drag parts/connectors ─► Construir
   incomplete ─► buzz 10016, stay
   else ─► panel closes ─► arm assembles ─► success animation  (check mark, Howard)
                                       └► failure smoke ─► Howard hint ─► panel re-opens (wrong pieces ejected)
panel X ─► close without building (green button re-opens it)
scroll ─► chooser again (pick another machine)
```

---

## 2. Screen layouts (BD7000)

### 2.1 Main room [C unless marked]

| element | slot(s) | position (object pos → drawn) | layer | behaviour |
|---|---|---|---|---|
| background (rock room + capsule) | 1 | native (0,0) | 0 (seq200) | |
| floor parts pile | 120..154 | x=`code[4125+i]` offset (+bitmap x), top y≈380±5 | 60 | §5.3 |
| robot arm (home) | 55 | object (94,27) → bitmap at (50,31) | 99 (seq144) | arm frames 33..55, claw frames 56..78 |
| bottom console (porthole frame, text box) | 6 | native (0,296) | 100 (seq201) | |
| foreground gears / junk | 3 | native (0,257) | 1000 (seq99) | |
| Howard in the porthole | 600.. (BD10400) | (-115,283) offset | 5000 | library talking head |
| machine name text (bottom black box) | text slot 376 | (384,449) | 101 (seq258) | `code[1229+g45]`: TNR 16, green on black |
| green round "go to blueprint" button | 10 (43x43 @257,209) | object (330,231) → (587,440) | 5003 (seq219), hotspot id 10500 | §3.3 |
| top-left corner of the closed blueprint panel | 9 | object (449,366) → (571,417) | 5002 | the panel waits off-screen |
| camera (snapshot) | 156 (copied to 816) | native (0,89) | 32000 | library seq15/seq23 photo album (shared feature) |
| map / "go to" hand | 157 (pressed 161) | native (0,127) | 32000 (seq241), hotspot 300 | library navigation menu |
| help "?" | 158 (pressed 162) | native (0,161) | 32000 (seq244), hotspot 244 | help panel §2.5 |
| exit fist | 159 (pressed 163) | native (0,193) | 32000 (seq242), hotspot 300 | → BD3030 |
| chooser scroll button | 176 (56x41 @298,445) | object (0,-450) → (298,-5) | seq251 | toggles the chooser |

Hotspot records in the page (0x38 chunks; fields are rect x1,y1,x2,y2, then id, then seq) [C for the fields, I for the purpose]:
- `(0,296)-(149,464)`, id 400 → **seq276: click Howard's porthole** for contextual help (@11739):
  - chooser open (`g54&1`): cycles WAV 7104/7105/7106;
  - blueprint open (`g46==1`): cycles 7117..7121;
  - machine chosen but the panel is closed (`g55==1`): BD21226.WAV;
  - arm busy (`g54&2`): 7122;
  - after a run (`g54&8 && g54&4`): WAV 10082 + 7123.
- `(0,470)-(10,480)` id 10063 → seq63 (easter egg: 3 clicks show a Howard gag, seq64/65, WAV 10097). This is optional.
- `(0,0)-(10,10)` id 278 → seq278 (easter egg: 5 clicks set `g675=1`, so Howard's bust, slot 199, appears in the lamp tutorial). This is optional.

Generic button click sound: `code[3584+random(0,1)]` = **BD1022 / BD1016** (used everywhere below as "click").

### 2.2 Machine chooser (seq246..256) [C]

- **Panel:** slot 174 (531x495 @55,-8). It is stored with the object at (0,-450), so only the scroll button (slot 176) peeks in at the top.
  - Open: glide to (0,0) at speed 20, WAV **7030**.
  - Close: glide back, WAV **7031**.
  - While it is open, the left buttons, the camera and the map are disabled (seq249/250).
- **Close X:** slot 175 (23x22 @558,28), seq252.
- **Row headers:** slots 177/178/179 at native positions: "Pruebas Fáciles", "Pruebas Medias", "Pruebas Difíciles".
- **Machine buttons:** `slot 180+m`, m=0..9, at native positions (89x105 each). Hotspot 256.
  - Row 1: m0..2 at y=38.
  - Row 2: m3..6 at y=186.
  - Row 3: m7..9 at y=332.
- **Check mark:** slot 190 (29x53), drawn at `(button.left+31, button.top+19)` when `g603` bit m is set (seq256 @10879).
- On open, Howard says **7135** (@10636).
- **Clicking machine m:**
  1. click sound;
  2. `g55=1`, `g45=m`;
  3. reset the board (seq96);
  4. kill any placed pieces;
  5. show the name in the bottom box (seq258);
  6. Howard plays the machine intro `code[4195+m]` = `[7137, 7107, 7109, 7108, 7138, 7139, 7110, 7111, 7112, 7113]`.
- **Closing** (scroll or X):
  - if a machine was chosen (`g55==1`), the green button is "pressed" automatically, so the blueprint opens;
  - otherwise a dummy green button (seq248) answers clicks with the buzz **10016** (seq247 ~@10660..10683).

### 2.3 Blueprint panel (seq206 and children) [C]

The panel object waits at (449,366) and slides in with `glide_by(-449,-366)` at speed 10. Every child uses `move 449,366`, so it rides along. All coordinates below are the **final on-screen positions**.

| element | slot | final position | notes |
|---|---|---|---|
| panel frame (red X at top-left, "CONECTORES" tab top-right, "PIEZAS DE LAS MÁQUINAS" bottom-right) | 9 | native (122,51) | layer 5002 |
| diagram background for machine g45 | BD7003 chunk 1+g45 → slot 200 | (187,116), 400x269 | seq196, layer 5001 |
| top description box | 7 | native (162,-16) | seq217, layer 5000, catches clicks |
| bottom description box | 8 | native (159,391) | seq216, layer 5000 |
| **Construir** (build) button | 22 normal / 21 pressed (54x54) | native (128,153) | seq221, hotspot 10100 |
| **Pistas** (hints) button | 23 / 24 pressed (54x54) | native (129,220) | seq232 |
| **close X** | frames 10..18 animate the green button into the X, then 19 (pressed) / 18 | over the red X printed on slot 9, about (137,77)-(176,113) [I]; the object uses setpos (159,94) relative to the attached parent (@9935) | seq223: sets `g44=3` and closes |
| connection picker icon | `111+l6` (23x23), l6=0..6 | (380,88) | seq184; arrows: slots 25/26 (pressed 27/28) at native (328,75)/(430,74), seq193/194 |
| connection name label | text slot `358+l6` | (387,63) | seq189 |
| connection description | `BD(7200+l6).STR` → text slot 306, box 390x65 | (191,5) | seq231; white/green TNR 15 bold |
| component picker icon | `79+l6` (31x30), l6=0..31 | (371,355) | seq171; arrows: slots 29/30 (pressed 31/32) at native (321,357)/(433,352), seq182/183 |
| component name label | text slot `307+l6` | (387,401) | seq178 |
| component description | `BD(7100+l6).STR` → text slot 305, box 390x65 | (191,419) | seq228; green TNR 15 bold |
| machine name (panel) | text slot 377 | (235,374) | seq259 |
| empty-connection blinkers | 118 / 119 alternating every 100 ticks | link spot −3 px (§4.2) | seq198, one per recipe link spot |

Picker arrows [C]:
- Left/right cycle `l6` with wrap-around: components mod 32, connections mod 7.
- They play the click sound and refresh the label and the description.
- Initial `l6` = 1 for both pickers (@8640).

Panel sounds [C]:
- open: 1090 (seq5), but the panel itself plays only clicks;
- the Construir and Pistas buttons and the X play **1022**;
- placing or picking up a piece plays **6037**.

### 2.4 Hint dialog (seq232 → seq235/236) [C]

- Modal. A full-screen catcher (seq233) blocks other clicks.
- Dialog: slot 192 (341x200) at (229,136).
- Text: `BD(7300 + 2*g45 + k).STR`, k=0/1, drawn in a 260x120 box at (252,161) (TNR 15 bold black).
- Arrows: slots 193/194 (pressed 195/196) toggle k.
- Close: X slot 197 (pressed 198).
- The text says "Pistas: N" but only **2 hints** exist per machine [C].

### 2.5 Help panel (seq266..275) [C]

- Panel: slot 164 (354x253 @201,71). Close X: slot 172 (@524,78). Open sound 1090, close sound 1091.
- Menu: two text buttons at (281,154) "1. Cómo jugar" and (281,192) "2. El paso a paso de Howard".
- "Cómo jugar" shows 5 pages. Page p (l0=2p) is the concatenation of the strings at `code[101+l0]` and `code[102+l0]`:
  - A1 (@111+@139)
  - A2 (@146+@170)
  - A3 (@200+@230)
  - A4 (@258+@288)
  - A5 (@316+@340)
- Text: 269x102 at (241,115).
- Navigation: next/prev slots 167/166 and 170/169; back to menu: slot 168/165.
- On the first open (`g631` bit 38 = `g633.bit6` clear), it also plays WAV **6070** (seq264).
- "El paso a paso de Howard" sets `g632.bit1`, clears `g631.bit7` and reloads BD7000, which forces the tutorial.

---

## 3. Board model, pickers and placement

### 3.1 State [C]

| global | meaning |
|---|---|
| `g45` | current machine 0..9; 10 = lamp (tutorial only) |
| `g1+pos` (pos 0..14) | component in square `pos = r*5+c` (r 0..2, c 0..4); -1 = empty |
| `g16+idx` (idx 0..24) | connection type 0..6 at link spot `idx = l5*5+l7`; -1 = empty |
| `g57+pos` / `g72+idx` | "satisfied/locked" flags used when re-opening after a failed build |
| `g44` | result of the last build: 0 ok, 1 wrong parts, 2 incomplete, 3 closed with X, 4 right parts but wrong arrangement or links |
| `g52` | 1 if this is a repeat attempt on the same machine (`g53==g45`), so the arm animation is skipped |
| `g603` | bitmask of completed machines (bit m). Never written to a GVD here [?] |
| `g55` | a machine was chosen in the chooser |
| `g46` | blueprint panel open |
| `g54` | UI state bits: 1 chooser, 2 arm busy, 4 success, 8 run finished |
| `g631.bit7` | tutorial offered already |
| `g632.bit1` | force the tutorial |

`seq96` (reset, @5926):
- every square and link → -1;
- then the **power supply (component 9)** is pre-placed at `pos = code[3828+g45]` = `[14,14,5,11,14,0,1,10,0,14,9]`.

### 3.2 Grid geometry [C]

Components:
- 5 columns x 3 rows, 80 px pitch, origin (187,115).
- Component icon at `(211+80c, 141+80r)` (31x30).
- Drop hit-test with mouse (x,y): `c=(x-187)/80`, `r=(y-115)/80` (seq175 @7448).

Links:
- Rows `l5 = (y-135)/40`, 0..4.
- **Even** `l5` (0,2,4) are horizontal spots between columns c and c+1 of component row `l5/2`: `l7=(x-227)/80`, icon at `(256+80*l7, 143+40*l5)`.
- **Odd** `l5` (1,3) are vertical spots in column `l7=(x-187)/80`, between component rows (l5-1)/2 and (l5+1)/2: icon at `(216+80*l7, 143+40*l5)`.
- Link icons are 23x23.

Drop area: `(187,116)-(587,356)` (inrect of the diagram object +400,+240).

Link spots are **positions on the drawn lines** of the BD7003 diagram. They are not logical "between these two parts" edges. The heat indicator's lines run diagonally, so its spot (l5=1,l7=1) sits on the line from square (0,0) to square (1,2). There is no graph semantics anywhere in the code: the check is purely per-position [C].

### 3.3 Interaction [C]

Picking and placing (seq171/172/175 for components, seq184/185/186 for connections):
1. Clicking the picker icon detaches it as the carried piece, and a fresh picker icon respawns. Supply is unlimited.
2. The carried piece follows the mouse (drag flags 0x4|0x1). Pieces are **click to pick, click to drop**, not press-and-hold. Sound 6037 on both clicks.
3. On drop, inside the drop area:
   - The target square or spot must be a **recipe position** (`code[recipe+pos] != -1`), so only the blanks of the diagram accept pieces. Otherwise the piece disappears.
   - If the target is occupied by a **fixed** piece (the pre-placed power supply or a "given" piece, §4.3), the dropped piece disappears (seq174 check, `g103`).
   - If it holds a normal piece, that piece is removed (seq173) and replaced.
   - The piece snaps to the slot, and `g[1+pos]` or `g[16+idx]` is set to its id.
4. A drop outside the area removes the piece and clears its slot.
5. Clicking a placed (non-fixed) piece picks it up again and clears its slot.

The green button (seq219 → seq220):
- Plays the click sound, stops Howard, computes `g52`.
- If `g45>9`, it does nothing.
- Otherwise it streams the machine's part graphics (seq257, §5.3) and opens the panel.

Opening the panel (seq206 @8591..):
1. Spawn the widgets, the diagram, the pickers, the power supply (seq203) and the "given" pieces (§4.3).
2. Slide in.
3. **If the previous exit was a build (`g44 != 3`), clean the board (seq209..213):**
   - pieces already correct at their position are marked satisfied;
   - a wrong piece whose id is needed at another not-yet-satisfied recipe position glides to x≈590 (a parking column on the right of the panel; the player can re-place it) and its slot is cleared;
   - a wrong piece that is needed nowhere falls off the screen (gravity, WAV **7033**) and sets `g51`;
   - connections get the same treatment, without `g51`.
4. If `g51` is set, Howard says **7311** [I: "I removed the parts you don't need"].

---

## 4. Catalog

### 4.1 Components (32 usable; picker ids 0..31) [C]

- Name: `code[1098+id]`, rendered into text slot 307+id by seq91.
- Description: `71\BD(7100+id).STR`.
- Picker icon: slot `79+id`.
- Floor/capsule part graphic: slot `120+id`.

| id | name (Spanish) | English |
|---|---|---|
| 0 | aguja del fonógrafo | phonograph needle |
| 1 | unidad de potencia del robot | robot power unit |
| 2 | procesador de la computadora | computer processor |
| 3 | transformador | transformer |
| 4 | micrófono | microphone |
| 5 | brazo de robot | robot arm |
| 6 | generador hidráulico | hydraulic generator |
| 7 | palas de ventilador | fan blades |
| 8 | tocadiscos | turntable |
| 9 | fuente de alimentación | power supply (always pre-placed) |
| 10 | motor pequeño | small motor |
| 11 | amplificador | amplifier |
| 12 | altavoz | speaker (the arm also moves part 32, the 2nd speaker box) |
| 13 | motor tamaño medio | medium motor |
| 14 | bolsa | bag |
| 15 | tubo | tube (vacuum) |
| 16 | termostato | thermostat |
| 17 | interruptor eléctrico | manual switch |
| 18 | interruptor eléctrico automático | automatic switch |
| 19 | sistema de calefacción | heating element |
| 20 | tubo | tube (air duct) |
| 21 | elemento de soporte | bread carrier |
| 22 | muelle | spring |
| 23 | electroimán | electromagnet |
| 24 | enganche | latch |
| 25 | ruedas | wheels |
| 26 | imán | magnet |
| 27 | circuito eléctrico | spring armature / circuit |
| 28 | martillo | hammer |
| 29 | campana | bell |
| 30 | vía de tren eléctrico | train track |
| 31 | bombilla | light bulb |

- Name index 32 ("bombilla") exists but is not reachable from the picker.
- Part graphics 32..35 are extra pieces: a second speaker, a lamp shade, toaster pieces.
- Components carry **no typed ports**. Whether a connection is right is decided only by the recipe [C].

### 4.2 Connection types (7) [C]

- Name: `code[1172+t]` (text slot 358+t).
- Description: `72\BD(7200+t).STR`.
- Icon: slot `111+t`.

| t | name | icon |
|---|---|---|
| 0 | transferencia de datos | "0101" |
| 1 | fuerza mecánica | gear |
| 2 | fuerza hidráulica | piston |
| 3 | magnetismo | horseshoe magnet |
| 4 | señal eléctrica variable | spark/star (energy output, BD7204) |
| 5 | corriente de energía eléctrica | wave |
| 6 | succión | air flow |

### 4.3 Machines (recipes) [C]

The full data is in `taller_machines.json`. The tables behind it:
- recipe components: `code[code[3817+m]+pos]` (15 per machine);
- recipe links: `code[code[4114+m]+idx]` (25 per machine);
- "given" pre-placed pieces: `code[8439+m]` → `n, (kind,row,col,value)*n`, where kind 1 = component at (r,c) and kind 2 = link at (l5,l7);
- names: `code[1229+m]`;
- chooser intro: `code[4195+m]`;
- failure line: `code[3601+m]`.

Notation:
- `(r,c)=id` for squares.
- `L(l5,l7)=t` for links.
- Pieces marked * are pre-placed and fixed.
- The power supply (9) is always pre-placed.

| m | machine | components | links | fail WAV |
|---|---|---|---|---|
| 0 | Indicador de calor | (0,0)=31 bulb\*, (1,2)=16 thermostat, (2,4)=9 | L(1,1)=5, L(3,3)=5 | 7300 |
| 1 | Ventilador (3 velocidades) | (0,2)=10 small motor, (1,0)=7 fan blades, (1,2)=3 transformer, (2,4)=9 | L(1,1)=1\*, L(1,2)=5, L(3,3)=5 | 7301 |
| 2 | Tren eléctrico | (0,2)=30 track, (0,4)=25 wheels, (1,0)=9, (1,2)=3 transformer, (2,3)=10 small motor | L(0,3)=1\*, L(1,2)=5, L(2,0)=5, L(2,2)=5\*, L(2,3)=1 | 7303 |
| 3 | Aspiradora | (0,2)=7 blades\*, (1,0)=13 med. motor, (1,2)=14 bag, (2,1)=9, (2,4)=15 tube | L(1,1)=1, L(1,2)=6, L(3,3)=6, L(4,0)=5 | 7302 |
| 4 | Brazo del robot | (1,0)=5 robot arm, (1,2)=6 hydraulic gen., (1,3)=1 power unit\*, (1,4)=2 computer, (2,4)=9 | L(2,1)=2, L(2,2)=5, L(2,3)=0\*, L(3,3)=5, L(3,4)=5 | 7304 |
| 5 | Campana electromagnética | (0,0)=9, (0,1)=17 switch\*, (0,2)=27 armature\*, (0,3)=23 electromagnet, (2,2)=28 hammer, (2,4)=29 bell | L(0,0)=5, L(0,1)=5, L(0,2)=5, L(1,2)=1, L(2,2)=3, L(4,2)=1 | 7305 |
| 6 | Secadora (hair dryer) | (0,1)=9, (0,3)=16 thermostat, (1,1)=10 small motor, (1,2)=17 switch\*, (1,3)=18 auto switch, (2,0)=20 tube, (2,1)=7 blades\*, (2,3)=19 heater | L(0,2)=5, L(1,3)=5, L(2,1)=5, L(2,2)=5, L(3,1)=1, L(4,0)=6, L(4,2)=5 | 7306 |
| 7 | Tostadora | (0,1)=16 thermostat\*, (0,3)=23 electromagnet, (1,2)=19 heater, (1,4)=24 latch\*, (2,0)=9, (2,2)=18 auto switch\*, (2,3)=21 carrier, (2,4)=22 spring\* | L(0,2)=5, L(1,4)=3, L(2,0)=5, L(3,2)=5, L(3,3)=1, L(4,0)=5, L(4,2)=1, L(4,3)=1 | 7307 |
| 8 | Alarma antirrobo | (0,0)=9, (0,2)=26 magnet\*, (1,1)=18 auto switch, (1,2)=27 armature, (1,3)=28 hammer, (1,4)=29 bell\*, (2,1)=22 spring\*, (2,3)=23 electromagnet | L(0,0)=5, L(0,1)=3, L(2,1)=5, L(2,2)=1, L(2,3)=1, L(3,1)=1, L(3,3)=3, L(4,2)=5 | 7308 |
| 9 | Robot D.J. | (0,0)=8 turntable, (0,1)=10 small motor, (0,2)=5 robot arm, (0,3)=6 hydraulic, (0,4)=4 microphone, (1,0)=0 needle, (1,3)=1 power unit, (1,4)=2 computer, (2,0)=12 speaker, (2,1)=11 amplifier, (2,4)=9 | L(0,0)=1, L(0,2)=2\*, L(1,0)=1\*, L(1,3)=5, L(1,4)=4\*, L(2,0)=4\*, L(2,3)=0\*, L(3,2)=5, L(3,3)=5, L(3,4)=5, L(4,0)=5, L(4,2)=5 | 7309 |
| 10 | Lámpara (tutorial) | (1,0)=31 bulb, (1,2)=17 switch, (1,4)=9 | L(2,1)=5, L(2,2)=5 | none |

The 73\ STR hints are `BD(7300+2m)` and `BD(7301+2m)`. The fail WAVs (73\BD7300..7309) are a different numbering: the WAVs for m2 and m3 are swapped relative to m (`code[3601..3610]`).

Some recipe squares are shared by text and gameplay. For example, the heat indicator's bulb is given, so the player places only the thermostat and two links.

---

## 5. The check, the arm, and what is shown

### 5.1 Build check (seq222 @9684) [C]

```
res = 0; missingType = 4
for pos in 0..14 where R[pos] != -1:
    if board[pos] == -1: return 2                       // incomplete
    if board[pos] != R[pos]: res = 1
    if R[pos] not anywhere on board: missingType = 7    // a needed part is absent
linkWrong = 0
for idx in 0..24 where RL[idx] != -1:
    if links[idx] == -1: return 2                       // incomplete
    if links[idx] != RL[idx]: linkWrong = 1
if res == 1 and missingType == 4: return 4              // all parts present, misplaced
if res == 1 and missingType == 7: return 1              // wrong/missing parts
if res == 0 and linkWrong:        return 4              // parts right, connections wrong
return 0                                                // perfect
```

Construir (seq221):
- **2:** buzz **10016**, panel stays open, `g44=2`.
- **0/1/4:**
  1. set `g44` and close the panel;
  2. the arm runs: 0 → seq148, 4 → seq147 (same code), 1 → seq146;
  3. `g43=338` (the drop floor line in the capsule).

### 5.2 Arm and parts animation [C]

- The arm is seq144 at (94,27).
- For each recipe square in pos order (seq147/148), or for each filled square of the player's board (seq146):
  1. pick part `l1 = componentId`;
  2. if `l1==12` (speaker), first carry part 32;
  3. the arm glides horizontally to the part's center at speed 200 (sound **7003**);
  4. lowers: frames 55→34, sound **7011**;
  5. the part rises with the claw while the arm raises: frames 33..51, sound **7012**;
  6. the arm translates until the part's x equals its native x;
  7. the claw opens: frames 56..78, sound **7013/7014**;
  8. the part drops.
- Correct path (seq141): the part glides to **(0,0)**, its native position, so the parts assemble into the machine at the positions baked into the BD705x graphics. Sound **7001/7002**.
- Wrong-parts path (seq142): the part glides to a heap at left=300, bottom=338.
- If `g52` is set (repeat attempt), the arm steps are skipped and the parts jump straight in.
- Extras after the loop:
  - m9 also carries part 33;
  - m10 carries part 32 (+ Howard's bust part 156 if `g675`).

### 5.3 Floor parts and per-machine graphics [C]

- All 35 floor parts (ids 0..34) are always on the floor; the ones not in the recipe are decoys.
- Floor x offset for part i: `code[4125+i]` = `[-40,138,-114,-141,209,103,-142,33,37,68,-85,155,-77,157,113,12,81,-50,-83,138,-50,75,-180,-10,-48,-75,-220,-3,-4,238,-173,40,52,52,52]`. It is added to the bitmap's own x.
- The top edge is at y=380±5 (random).
- When a machine opens, seq257 streams the next chunks of page `code[10940+m]` into slots `120+partId`. Each machine's list (`code[11044+m]`, count `code[10951+m]`) replaces the default graphics with versions whose stored origin is the **assembled position**:

| m | page | part ids |
|---|---|---|
| 0 | BD7050 | 16, 9, 31 |
| 1 | BD7051 | 3, 7, 9, 10 |
| 2 | BD7053 | 3, 9, 30, 25, 10, 32 |
| 3 | BD7052 | 9, 13, 7, 14, 15, 32 |
| 4 | BD7054 | 9, 1, 6, 5, 2 |
| 5 | BD7055 | 9, 17, 23, 28, 29, 27 |
| 6 | BD7056 | 9, 16, 18, 17, 10, 7, 19, 20 |
| 7 | BD7057 | 16, 9, 22, 19, 21, 24, 18, 23, 32, 33, 34, 35 |
| 8 | BD7058 | 9, 26, 23, 28, 29, 27 (count 6; the list continues with 18, 22, 32 and the page has 9 chunks) [?] |
| 9 | BD7059 | 12, 9, 11, 10, 8, 0, 6, 1, 5, 4, 2, 32, 33 |
| 10 | BD7049 | 9, 17, 31, 32 |

- Recommendation: load all listed entries that the page has. The original's count for m8 looks like a bug.
- When the panel re-opens, the floor parts are reset to the floor (`signal in_seq138, jump(seq137)`).

### 5.4 Success (g44 == 0) [C]

1. `setbit g603.bit(m)`; this drives the chooser check mark.
2. seq150 loads the animation page into slots 201.. and spawns seq158:
   - **slot 201 = base picture**, shown persistently (layer 99);
   - child seq159 shows overlay frames `201+k`, k=1..n-1, every **100 ticks**;
   - when k is in the cue list, it plays the paired WAV (`indexof(k, code[4295+m])` → `code[code[4309+m]+i]`).

| m | page | n | cues frame→WAV |
|---|---|---|---|
| 0 | BD7011 | 59 | 1→7402, 18→7401, 22→7400 |
| 1 | BD7004 | 66 | 1→7423, 2→7421, 10→7423, 19→7423, 29→7423 |
| 2 | BD7008 | 58 | 1→7405, 6→7403, 55→7404 |
| 3 | BD7009 | 60 | 1→7406, 3→7407, 5→7408, 10→7409 |
| 4 | BD7013 | 59 | 1→7411, 35→7410, 46→7412 |
| 5 | BD7012 | 59 | 1→7417, 36→7418, 37→7415 |
| 6 | BD7010 | 60 | 31→7419, 2→7423, 5→7422, 14→7423, 30→7423, 45→7423 |
| 7 | BD7005 | 56 | 5→7425, 29→7426, 32→7424, 51→7427 |
| 8 | BD7007 | 58 | 1→7417, 20→7413, 34→7418, 38→7415, 40→7416, 54→7414 |
| 9 | BD7001 | special | seq160/161: base 201, after 1000 ticks frames 264→235 once, play **BD7000.WAV** (DJ music), then loop frames 202..232 forever, hiding for 100 ticks between loops |
| 10 | BD7006 | 39 | 1→7429, 10→7428 (played by the tutorial) |

3. Then the arm returns (seq145). Howard says:
   - **7140** if `g603 == 1023` (all 10 done);
   - otherwise WAV 10082 + `code[3590+m]` = **7123** [? exact wording].
4. The assembled machine and the final frame stay in the capsule until the next panel opening.

Unclear: seq157 spawns a button (slots 4/5) at object (247,443). Clicking it re-runs seq150, i.e. replays the animation. With the slot origins (597,445) it would be off-screen [?]. Treat it as an optional "replay" button near the green button.

### 5.5 Failure (g44 == 1 or 4) [C]

1. seq149: wait 1000 ticks, load BD7002 (40 frames) into slots 265..304, play a random WAV **7005..7010**.
2. Spawn 5 effects. Effect i is at offset (`code[6821+i]`, `code[6826+i]`) = (336,218), (374,181), (316,144), (290,186), (265,194), shows frames `265+8i .. +7`, loops 3 times, 150 ticks per frame.
3. The arm goes home.
4. seq145: Howard says the machine's failure line `code[3601+m]` (73\BD7300..7309, see the table).
5. The green button is "pressed", so **the panel re-opens automatically**, with the cleanup from §3.3. Repeat attempts skip the arm animation (`g52`).

There is no penalty or counter [C].

---

## 6. Tutorial "El paso a paso de Howard" (seq81, machine 10 = lamp) [C]

- While it runs, a full-screen click catcher (seq80, hotspot 80) skips the tutorial on any click (seq80 @5168..5249). Music during the tutorial: **BD10018.WAV** looped at volume 5.
- Script, in order:
  1. Howard 7100.
  2. The floor parts reset.
  3. Howard 7125.
  4. Ambience 10018 starts.
  5. The panel opens with machine 10 (seq214).
  6. Howard 7126.
  7. Picker arrow demos.
  8. A ghost **bulb** icon (slot 110) glides from (371,354) to (212,221), with its label (slot 338).
  9. Howard 7127; a random 6130..6136 sound; click 6037.
  10. Howard 7128.
  11. A ghost **switch** (slot 96) glides to (371,221), with its label 324.
  12. Howard 7129, then 7130.
  13. The connection arrow demos.
  14. Two ghost **electric-current** links (slot 116) glide to (416,225) and (336,225).
  15. Howard 7131.
  16. The board is set to the lamp solution (seq98).
  17. The arm builds it, the BD7006 animation plays, then Howard 7133 and 7134.
- Afterwards `g45` returns to `g49` (0), and the normal start continues: the chooser opens.

---

## 7. Save / load / state [C]

- BD7000 saves nothing activity-specific.
- `g603` (completed machines) and the `g631/g632/g633` flag words live in the high global range. That range survives page changes but is not saved by this page [?: another page may persist it; for the web app, persist it in localStorage].
- Library saves still happen:
  - photo album: `BD32010+g612` / `BD32060+g612` PAG screenshots, index in `BD32551.GVD` (g611..g612);
  - user path: `BD32430.STR` / `BD32470.GVD` (g636..g658).
- There is no scoring [C].

---

## 8. Web implementation outline

### 8.1 Assets per screen

- BD7000 slots (listed above).
- BD7003 chunks 1..11.
- BD7002 (40).
- The animation pages BD7001/4/5/6/7/8/9/10/11/12/13.
- BD7049..7059.
- Library: Howard head (BD10400 600..675), click sounds BD1016/1022, dialog BD10000 676..678.
- WAVs:
  - 70\ BD7000..7033 (SFX, ambience 7032);
  - 71\ BD7100..7140 (Howard);
  - 73\ BD7300..7311 (failure lines);
  - 74\ BD7400..7429 (machine SFX);
  - 100\ BD10016/10018/10082/10097;
  - 212\ BD21226.
- Text: 71\ STR (component descriptions), 72\ STR (connection descriptions), 73\ STR (hints). The names and help strings are in the `components`/`connections` arrays of `taller_machines.json`, plus §2.5.
- Transparency: a sprite keys on its own top-left pixel, as in section 60.

### 8.2 Data to ship (JSON)

```jsonc
{
 "components": ["aguja del fonógrafo", ...32],      // icon slot 79+id, part slot 120+id, desc 71/BD(7100+id).STR
 "connections": ["transferencia de datos", ...7],   // icon slot 111+t, desc 72/BD(7200+t).STR
 "machines": [ { "id":0, "name":"Indicador de calor", "intro":7137, "fail":7300,
     "powerPos":14, "partsPage":7050, "partsGfx":[16,9,31],
     "anim":"BD7011", "animFrames":59, "cues":[[1,7402],[18,7401],[22,7400]],
     "components":[{"pos":0,"r":0,"c":0,"iconX":211,"iconY":141,"id":31}, ...],
     "links":[{"idx":6,"l5":1,"l7":1,"kind":"v","iconX":296,"iconY":183,"type":5}, ...],
     "given":[{"kind":"comp","row":0,"col":0,"value":31}] }, ... ],
 "floorX": [-40,138,...],                        // code[4125..4159]
 "failFx": [[336,218],[374,181],[316,144],[290,186],[265,194]],
 "chooser": {"buttonSlot":180, "rows":[[0,1,2],[3,4,5,6],[7,8,9]]},
 "help": ["A1 ...", "A2 ...", "A3 ...", "A4 ...", "A5 ..."]
}
```

`vm/taller_machines.json` already contains `components`, `connections` and `machines` exactly as decoded.

### 8.3 Screens and behaviours

1. **Room** (always underneath):
   - draw order: bg 1 → floor parts → arm 55 at (94,27) → console 6 → foreground 3 → Howard;
   - left buttons: camera (optional), map (→ app navigation), help, exit (→ hub);
   - bottom box: machine name;
   - ambience 7032 looped;
   - porthole click → contextual Howard line (seq276 table).
2. **Chooser overlay:** slides from y-450 to 0 (about 0.3 s). 10 machine tiles with check marks from completed[]. Click → select, Howard intro, name in the bottom box. Close (scroll or X) → auto-open the blueprint if a machine was selected.
3. **Blueprint overlay:**
   - slides in from (+449,+366);
   - BD7003 diagram for the machine;
   - pre-placed power supply and given pieces (locked);
   - blinking red markers on empty link spots;
   - two carousels with labels and description boxes;
   - click-pick / click-drop placement following §3.3;
   - Construir runs §5.1; Pistas opens the hint dialog; X closes.
4. **Run sequence** (non-interactive; disable inputs):
   - arm tween per part (optionally simplified to a part tween plus claw frames);
   - success: frame animation with cues, mark completed, Howard;
   - failure: smoke effects, Howard fail line, re-open the editor with the cleanup.
5. **Help overlay:** 5 text pages + "Howard step-by-step" (the tutorial).
6. **Tutorial:** scripted timeline (§6). Skippable by click.
7. **Persistence:** localStorage keys `taller.completed` (bitmask) and `taller.tutorialSeen`.

---

## 9. Sections 75/76 (vehicle test track)

NOT YET WRITTEN: a separate analysis of BD7500/BD7600 was still running when this file was handed back. These pages are **not** part of the machine workshop: they are the vehicle "Campo de pruebas" reached from the vehicle workshops (BD4001 → 75, BD4201 → 76). 85\ and 86\ hold the Buddy (test pilot) animations they play.

---

## 10. Gaps and uncertainties (section 70)

- The exact wording of the Howard WAVs (7123, 7311, 7122, 7135, 21226...). The meanings above are inferred from context [I].
- The seq157 replay button position (§5.4) [?].
- Whether `g603` / tutorial flags are persisted by another page [?].
- The m8 part-graphics count (6 of 9) [?].
- The exact pixel positions of the X close button after its morph animation, and of the name labels (text slot origins are generated at run time) [I].
- Ticks are assumed to be ms.
