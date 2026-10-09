# "Taller de inventos" mouse maze: rules specification

Sources: `BD6000.txt` (blueprint editor, "Mesa de planos"), `BD6010.txt` (test floor, "Probando el invento"), `BD6005.txt` (workshop hub/save slots) and `60\BD600x.STR` (challenge texts).
Citations use `file@token` (token address, which is the number at the start of each listing line) or `Lnnnn`/`seqN`.
`code[a]` means the int32 token at address `a`.
Tables were extracted with `vm/code.py` (`python code.py BD6000.txt ADDR N`).
Confidence markers:
- **[C]**: confirmed from the code.
- **[I]**: inferred.
- **[?]**: uncertain.

Coordinates:
- `r` = row 0..9 (top to bottom).
- `c` = column 0..13 (left to right).
- Cell index `n = r*14 + c`.

---

## 0. Big picture

1. **Editor (BD6000).** The player drags parts onto a 14x10 grid. Every placement writes per-cell *tile codes* into a global grid.
   - "Probar" (test) refuses to continue unless both a start and an end are placed.
   - It saves the globals to `BD32429.GVD` and the part objects to `BD32429.TSK`, then goes to BD6005 (the workshop hub). The hub goes on to BD6010.
2. **Test (BD6010).** Loads `BD32429.GVD` and computes power once (battery → motor → connectors → parts).
   - It draws side-view tiles.
   - On "Inicio" it spawns a mouse at each start tile and walks it cell by cell, following the tile codes.
   - Outcomes: success at the end tile, or failure (blocked path, battery exhausted, challenge requirements unmet).
   - A score screen follows (layout from BD6021, rank graphics from BD6022).

---

## 1. Part catalog

### 1.1 Part types (`g344` = selected type)

Names come from `code[225+type]` and descriptions from `code[code[233+type]+variant]` (BD6000@7482..7500, seq269).

| type | category (name) | variants `code[5197+t]` | initial stock `code[209+t]` | height extra `code[5205+t]` | editor placed icon `code[5181+t]+v` | palette (drag) icon `code[5189+t]+v` | tile-code table `code[5257+t]` |
|---|---|---|---|---|---|---|---|
| 0 | PILAS (battery) "PILA A" | 1 | 10 | 0 | slot 2 | 2 | @5218 → `[40]` |
| 1 | PUNTO DE PARTIDA (start) | 1 | **1** | 0 | 5 | 5 | @5219 → `[50]` |
| 2 | FIN (end) | 1 | **1** | 0 | 3 | 3 | @5220 → `[51]` |
| 3 | MOTORES "MOTOR A" | 1 | 10 | 0 | 4 | 4 | @5221 → `[31]` |
| 4 | CINTAS (conveyors) | 2 | 32000 (unlimited) | 0 | 6+v | 6+v | @5222 → `[1, 2]` |
| 5 | ASCENSORES (elevators) | 4 | 32000 | **2** (3 cells tall) | 8+v (31x90) | 8+v | @5224, 3 codes per variant (top, mid, bottom) |
| 6 | CONECTORES | 11 | 90 | 0 | 12+v | 12+v | @5236 → `[20..30]` |
| 7 | PIEZAS ESPECIALES | 10 | 10 (shared by all 10 gadgets) | (mask) | 36+v (big, multi-cell) | 46+v (small) | @5247 → `[60..69]` |

Raw data, BD6000@5181..5266:

```
5181 placedIcon : [2,5,3,4,6,8,12,36]
5189 paletteIcon: [2,5,3,4,6,8,12,46]
5197 variants   : [1,1,1,1,2,4,11,10]
5205 extraRows  : [0,0,0,0,0,2,0,0]
5213            : [0, 0,0,640,480]   (screengrab rect for photos, unrelated)
5218 tiles      : 40 | 50 | 51 | 31 | 1,2 | 3,88,4, 5,88,4, 5,88,6, 3,88,6 | 20..30 | 60..69
5257 tileTblAddr: [5218,5219,5220,5221,5222,5224,5236,5247]
5265            : 305, 995 (+layer) = position of the "Howard" helper animation (seq12/13)
```

Other BD6000 tables:
- `code[209..216]` = stock `[10,1,1,10,32000,32000,90,10]` [C] (L8025).
- `code[217..224]` = category order for the ◄/► category arrows: `[1,3,0,4,5,7,6,2]`, which is start, motor, battery, conveyor, elevator, special, connector, end (seq252/253) [C].
- `code[225..232]` = name string pointers.
- `code[233..240]` = description base per type: `[243,241,242,261,244,246,250,262]`.
- Description list `code[241..271]`:
  - 538 start, 568 end, 586 battery, 646/668 conveyors.
  - Elevators 694, 775, 722, 749.
  - Connectors 807, 825, 842, 867, 892, 917, 942, 977, 1012, 1047, 1082.
  - Motor 616.
  - Specials 272, 298, 323, 344, 374, 408, 437, 463, 486, 511.
- `code[100..208]` is the same direction/arm data that BD6010 has at 1203..1314. It is decoded in §4.

### 1.2 Variants

**Conveyors (type 4).**
- v0 "DE IZQUIERDA A DERECHA": tile 1.
- v1 "DE DERECHA A IZQUIERDA": tile 2.

**Elevators (type 5).** The part covers rows r (top), r+1, r+2. Codes are listed top/mid/bottom (`code[5224+3v..]`):

| v | name | top | mid | bottom | meaning |
|---|---|---|---|---|---|
| 0 | DE IZQUIERDA A DERECHA | 3 | 88 | 4 | enter bottom from the left, exit top to the right |
| 1 | IZQUIERDA A IZQUIERDA | 5 | 88 | 4 | enter from the left, exit to the left |
| 2 | DERECHA A IZQUIERDA | 5 | 88 | 6 | enter from the right, exit to the left |
| 3 | DERECHA A DERECHA | 3 | 88 | 6 | enter from the right, exit to the right |

So:
- 4 = bottom entered while moving right.
- 6 = bottom entered while moving left.
- 3 = top that exits right.
- 5 = top that exits left.
- 88 = shaft. It is handled as a "special" path cell with v=8 (up→up).

**Connectors (type 6).** Tile codes 20..30. Arm bitmask `code[192+code-20]` in BD6010 (= BD6000 `code[1118+...]`, values `[3,12,10,9,5,6,7,11,14,13,15]`).

Bits: 1 = left arm, 2 = right arm, 4 = up arm, 8 = down arm (derived from L12142).

| v | code | name | arms |
|---|---|---|---|
| 0 | 20 | VARILLA 1 (horizontal) | L+R (3) |
| 1 | 21 | VARILLA 2 (vertical) | U+D (12) |
| 2 | 22 | ÁNGULO 1 | R+D (10) |
| 3 | 23 | ÁNGULO 2 | L+D (9) |
| 4 | 24 | ÁNGULO 3 | L+U (5) |
| 5 | 25 | ÁNGULO 4 | R+U (6) |
| 6 | 26 | CONVERSOR 1 | L+R+U (7) |
| 7 | 27 | CONVERSOR 2 | L+R+D (11) |
| 8 | 28 | CONVERSOR 3 | R+U+D (14) |
| 9 | 29 | CONVERSOR 4 | L+U+D (13) |
| 10 | 30 | CONVERSOR 4 PUNTOS | all (15) |

The test-page graphics confirm this: slot 121 is a vertical 10x30 bar for code 21, slot 122 a horizontal bar for code 20, and slot 128 a 20x20 piece in the lower-right quadrant for 22 (R+D).

### 1.3 Special gadgets (type 7, id = 60+v)

Each special has the following fields:
- `cols`, `rows`: bounding box. BD6000 `code[2144+i]`/`code[2154+i]`; BD6010 `code[218+i]`/`code[228+i]`.
- `A`: entry cell, relative (row, col). BD6000 `code[2184+i]`/`code[2194+i]`; BD6010 `code[258+i]`/`code[268+i]`.
- `B`: exit cell. BD6000 `code[2204+i]`/`code[2214+i]`; BD6010 `code[278+i]`/`code[288+i]`.
- `P`: power-input cell. BD6000 `code[2164+i]`/`code[2174+i]`; BD6010 `code[238+i]`/`code[248+i]`.
- An 8x8 row-major occupancy/path mask. Its address is `code[2864+i]` (BD6000) or `code[938+i]` (BD6010).

```json
[
 {"i":0,"id":60,"name":"2-ALISADORA","cols":6,"rows":3,"A":[2,0],"B":[2,5],"P":[2,0],"score":3500,"pfl":"BD6000.PFL","sounds":{"3":6056},
  "mask":[[13,0,13,13,0,0],[13,7,2,2,3,0],[14,1,0,13,10,2]]},
 {"i":1,"id":61,"name":"BAJALABAJA","cols":8,"rows":8,"A":[0,0],"B":[7,0],"P":[7,7],"score":5500,"pfl":"BD6001.PFL","sounds":{"1":6050,"18":6051,"80":6052},
  "mask":[[2,2,2,2,2,2,2,3],[0,0,0,0,0,0,0,11],[0,0,0,0,0,0,0,11],[0,0,0,0,0,0,0,11],[0,0,0,0,0,0,0,11],[0,0,0,0,0,0,0,11],[0,0,0,0,0,0,0,11],[5,5,5,5,5,5,5,19]]},
 {"i":2,"id":62,"name":"PULEMATIC","cols":4,"rows":5,"A":[4,0],"B":[4,3],"P":[4,1],"score":4500,"pfl":"BD6002.PFL","sounds":{"1":6053,"46":6054,"115":6055},
  "mask":[[13,13,13,13],[13,13,13,13],[0,13,13,0],[13,13,13,13],[2,14,2,2]]},
 {"i":3,"id":63,"name":"CORRE QUE TE PILLO (teletransporte)","cols":4,"rows":3,"A":[2,0],"B":[2,3],"P":[2,0],"score":2000,"pfl":"BD6003.PFL","sounds":{"1":6057},
  "mask":[[7,2,2,3],[8,0,0,11],[20,0,0,10]]},
 {"i":4,"id":64,"name":"MIRA QUE TE VEO","cols":5,"rows":3,"A":[2,0],"B":[2,4],"P":[2,2],"score":3750,"pfl":"BD6004.PFL","sounds":{"1":6058},
  "mask":[[13,13,13,13,13],[13,13,13,13,13],[2,2,14,2,2]]},
 {"i":5,"id":65,"name":"ESTACIÓN ROTOELEVADORA","cols":5,"rows":5,"A":[4,4],"B":[0,0],"P":[4,2],"score":3000,"pfl":"BD6005.PFL","sounds":{"1":6059},
  "mask":[[5,9,0,0,0],[0,4,9,0,0],[0,0,4,9,0],[0,0,13,8,13],[0,0,18,4,5]]},
 {"i":6,"id":66,"name":"EL ARTILUGIO DÍ QUE NO (helio)","cols":5,"rows":4,"A":[3,4],"B":[3,0],"P":[3,2],"score":5000,"pfl":"BD6006.PFL","sounds":{"5":6071},
  "mask":[[13,13,13,13,13],[13,13,13,13,13],[13,13,13,13,13],[5,5,15,5,5]]},
 {"i":7,"id":67,"name":"METROMUELLE","cols":2,"rows":5,"A":[2,1],"B":[0,0],"P":[4,1],"score":1650,"pfl":"BD6010.PFL (3/4) or BD6011.PFL (1/4)","sounds":"see 4.7",
  "mask":[[5,9],[0,8],[0,4],[0,13],[13,18]]},
 {"i":8,"id":68,"name":"BARBALISA","cols":4,"rows":5,"A":[4,3],"B":[0,0],"P":[4,1],"score":3000,"pfl":"BD6008.PFL","sounds":{"1":6074},
  "mask":[[5,5,9,0],[0,13,8,0],[0,13,8,0],[0,13,8,0],[0,18,4,5]]},
 {"i":9,"id":69,"name":"SIMULADOR AUTOPISTA L.A.","cols":4,"rows":3,"A":[0,3],"B":[0,0],"P":[2,1],"score":3000,"pfl":"BD6009.PFL","sounds":{"1":6075},
  "mask":[[5,5,5,5],[13,13,13,13],[13,18,13,13]]}
]
```

Notes on the specials:
- A nonzero mask value `v` becomes tile code `80+v` (L8619/L8739) [C]. Zero mask cells are **not** occupied: other parts can be placed there. For example, the inside of BAJALABAJA's big "C" shape is free.
- The editor placement image is slot 36+i. Its size is `cols*30+2` x `rows*30+1`, so the mask bitmaps the caller suspected in slots 46..55 are only the small palette icons. The masks are tables, not bitmaps.
- Test-page gadget image: slot 111+i. It is drawn by the tile object at the **entry cell A**. Extra offset: (+5,0) for i=4 and (+4,-2) for i=9 (BD6010@6693..6729). Layer `code[6855+i]` = `[1010,1010,999,999,999,999,1010,1010,1010,1010]`. The mouse is on layer 1000, so specials 2..5 draw behind the mouse.
- The PFL animation file is `BD(5999+i+1).PFL` (BD6010@10732). METROMUELLE is the exception: `random(0,3)==0` picks BD6011.PFL, otherwise BD6010.PFL.
- The sound key is the animation frame counter at which the WAV plays (seq337).
- The "score" field is `code[2976+i]` (BD6010), the points per use.

### 1.4 Tile-code reference (cell values in `g[141+n] & 255`)

| code | part |
|---|---|
| 0 | empty |
| 1 / 2 | conveyor L→R / R→L |
| 3 / 5 | elevator top, exit R / exit L |
| 4 / 6 | elevator bottom, enter from L / enter from R |
| 20..30 | connectors |
| 31 | motor |
| 40 | battery |
| 50 | start |
| 51 | end |
| 80+v (81..100) | special gadget path/body cells, plus 88 = elevator shaft |

Flags (high bits, BD6000 L8851/L8768 and BD6010):

| flag | meaning | set by |
|---|---|---|
| 256 | powered | editor sets it on the battery; BD6010 clears all and recomputes |
| 512 | is connector/motor | editor (codes 20..31) |
| 1024 | needs power | editor: codes 1, 2, 4, 6, 31, special A/B cells. `@2080 {93..99}` is listed but never applied because of the L8739 bug |
| 4096 | temporary "visited" during load counting | BD6010 |
| 8192 | visited by a mouse | BD6010 L11488 |
| 16384 | special entry cell A | editor |
| 32768 | special exit cell B | editor |

---

## 2. Editor rules (BD6000)

### 2.1 Grid and placement

- Grid: 14 columns x 10 rows of 30 px cells. The top-left is at screen (168,35) (L6640, L6725).
- The cell for a dropped object at (x,y) is `c = (x-168+15) div 30` and `r = (y-35+15) div 30` (rounds to the nearest cell). The object then snaps to `(168+30c, 35+30r)` (6615).
- **Removal.** Any of these returns the part to stock (`g[354+t]++`), plays WAV 6038 and deletes the object (L6640..6784):
  - Off the left or top: snapped `x < 168` or `y < 35`.
  - Off the right or bottom: `x >= 588`, or `y + extraRows*30 >= 335` (i.e. `r + extraRows > 9`).
  - This is the only way to delete one part.
- A valid drop plays 6037. Picking up a part from the palette plays 6039 (6472).
- **Bounds for specials** (L8489): `0 <= r <= 10-rows` and `0 <= c <= 14-cols`.
- **Overlap rules.**
  - Normal parts: the target cell's owner `g[r*14+c]` must be 0. For elevators, rows r+1 and r+2 must be free as well (6576..6612).
  - Specials: every nonzero mask cell must have tile code 0 (L8489 via L9024).
  - On an invalid drop the part **stays attached to the cursor** (`goto L6524` re-enters drag) until it is dropped somewhere valid or off-grid.
- **Moving a placed part.** Clicking it clears its cells (L6968 / L8397), so it can be dragged and re-placed.
- No rotation. The variants are the "orientations".
- The palette part sits at (73,183). After each placement a new palette instance is spawned (L7023 allocates an instance id 0..140, tracked in the bitset g316..).
- When stock is 0, sign slot 23 is shown at (41,172) and clicking it plays error 10016/10017 (seq249).
- **Only one start / one end** is enforced purely by stock = 1. A multi-start design is impossible in the editor, though BD6010 would launch a mouse from every 50 tile.

### 2.2 Buttons

The bottom and side buttons are seq102 with `l0 = 0..11`. Normal frame is `24+l0`, the spawned sequence is `code[6186+l0]`.

| l0 | slot (pos) | action |
|---|---|---|
| 1 | 25 (11,256) | variant ◄ (seq255) |
| 2 | 26 (111,256) | variant ► (seq254) |
| 5 | 29 (362,402) | **Borrar todo / clear**: confirm dialog BD4007 (slot 882 = yes, 883 = no). Then wipes g0..g499 and restarts the page (seq266 → seq77 l0=1) |
| 6 | 30 (244,402) | **Probar / test** (seq260), see below |
| 7 | 31 (303,402) | **Imprimir / print** the grid area (165,31)-(589,335) (seq257, screengrab 0x3480) |
| 8 | 32 (421,402) | **Desafíos / challenge scroll** (seq94): 10 challenge buttons (`860+i`); a solved mark appears if `g661` bit i is set. Choosing one sets `g666 = i+1`, shows the text (BD600i.STR) and picture (BD6006.PAG chunk i); "free mode" sets g666 = 0 |
| 10 | 34 (11,79) | category ◄ (seq253) |
| 11 | 35 (103,79) | category ► (seq252) |
| 0, 3, 4, 9 | 24, 27, 28, 33 | inert / decoration |

Top-left buttons:
- seq285, slot 66: main navigation menu.
- seq286, slot 69: help. Offers "A. Normas para diseñar artilugios" (rules A1..A6 at code 1137..1343) or "B. El paso a paso de Howard", which goes to BD6020.
- seq289, slot 68: leave to BD6005. It asks to save if `g395` (dirty) is set.

**Test (seq260).**
1. If no tile is set (L8363) it plays an error sound.
2. If the start or end is still in stock (`g355 == 1 || g356 == 1`) it plays an error plus voice 6097.
3. Otherwise it saves (seq258: `save_globals g0..g336 → BD32429.GVD` and `objsave TSK 32429`) and goes to BD6005.
4. BD6005 then goes to BD6010 (BD6005@8080).

### 2.3 Editor globals

These matter for saves.

| global | content |
|---|---|
| g0..g139 | owner grid: sequence number of the part object covering cell n (0 = free) |
| g141..g280 | tile grid: `code | flags` per cell n (`g[141+r*14+c]`) |
| g281..g315 | special index+1 nibbles: cell n sits in `g[281+n/4]`, nibble `n%4` (L9036, read back by L12719) |
| g316..g324 | bitset of the 141 part-object instances in use |
| g336 | next instance id |
| g344 | selected type |
| g345..g352 | variant per type |
| g353 | save slot |
| g354..g361 | remaining stock per type |
| g362..g365 | text pointers |
| g389 | category index |
| g395 | design changed |
| g666 | current challenge (0 = free) |
| g661 | bitset of solved challenges |

**Save format.**
- `BDnnnnn.GVD` is a raw little-endian **int16** array of `g[first..last]`, sign-extended on load (sub_413F90/sub_414040 → sub_4109E0/sub_410970). There is no header.
- `BD32429.GVD` holds g0..g336, i.e. 337 int16 = 674 bytes. Because of the int16 truncation, a tile with flag 32768 reloads as a negative number. Code masks with `&255` / bit tests, so it still works.
- The TSK companion holds the part objects (seqs in seq251). On reload every part object re-runs its sequence head, which decrements stock again (6405..6429). Stock is not saved; it is recomputed.
- **Named save slots** (BD6005@8281..8326): `BD(32440+slot).GVD` (g0..g336), `.TSK`, `.STR` (the name) and `.PAG` (a thumbnail), for slot 0..5. `g[652+slot]` holds status bits: 16 = saved, 32 = tested, 64 = worked (BD6010@7099, @8892).
- A web version can just save `{type, variant, row, col}` per part and re-derive the tile grid with the rules in §1.

---

## 3. Power model (BD6010 L11964, L12142, L12311, L11330)

Power is computed **once** when the test page loads (seq252). It never changes during the run.

1. **Reset.** Clear flag 256 on all cells (L11928).
2. **Find batteries.** Scan cells in row-major order. For every **battery (40)**, increment `g376` (battery count; battery index = scan order).
3. **Motor above the battery.** Only if the cell **directly above** the battery is a **motor (31)**:
   - flood from the motor's right neighbour `(r-1, c+1)` with incoming side "from left" (1);
   - flood from its left neighbour `(r-1, c-1)` with incoming side "from right" (2).

   A motor elsewhere, or a battery without a motor above it, does nothing.
4. **Flood `F(cell, in)`.** It stops if the cell is already powered. Otherwise the cell is accepted if either:
   - it is a connector (20..30) whose arm mask contains `in` (in: 1 = from left, needs the L arm; 2 = from right, needs R; 4 = from above, needs U; 8 = from below, needs D); or
   - it is a **load** in set `@1290` (see below) and `in == 8`, i.e. **power only enters a part from a connector directly beneath it whose UP arm points at it**.

   An accepted cell gets flag 256.
5. **Spread through connectors.** Only connectors propagate:
   - L arm: `F(r, c-1, 2)`
   - R arm: `F(r, c+1, 1)`
   - U arm: `F(r-1, c, 8)`
   - D arm: `F(r+1, c, 4)`

   Grid edges are respected. Loads, the motor and everything else do not propagate.
6. **Load set `@1290`.** Count 27: `{1,2,3,4,5,6, 93..100}` plus junk `{10, 90, 32000}` that the over-long count accidentally includes [C].
   - In practice: conveyors, elevator top and bottom cells, special cells 93..100 (and 90).
   - The ones that *need* power are conveyors 1/2, elevator bottoms 4/6, and the special's P cell.
   - Note (checked against BD6010@1263..1316): the flood's load test (BD6010@12188) uses `@1290`, which contains 100. So CORRE QUE TE PILLO, whose P cell is code 100, *can* be powered. Only the load counter's entry test (BD6010@12363) uses `@1263` = `{1..6, 80..99}`. As a result a teleporter's P cell is powered but never counted as battery load.
7. **Battery drain.** The per-battery load `g[366+i]` is computed by L12311, which runs the same flood without stopping at already-powered cells.
   - It uses a visited flag (4096) that is cleared between the right side and the left side, so a load reachable from both sides counts twice [C quirk].
   - It counts each reached cell in @1290.
   - Its entry test for loads uses `@1263` = `{1..6, 80..99}`.
8. **Specials.** A special is powered if its **P cell** got flag 256. Then every nonzero mask cell of the special gets 256 (L11330, run after all batteries).
9. **Charge and drain per step.** Every battery starts at charge 1000 (`g377+i`, L12594).
   - At **every mouse step**, including invisible steps inside a gadget and "waiting" steps, each battery loses its load count: `g377+i -= g366+i` (L12536, BD6010@8366).
   - If any battery reaches ≤ 0, the run fails with "battery exhausted" (§5, panel l0=3).
   - Charges are reset only by Reiniciar, by page reload, or when a challenge is completed (L7851). They carry over between mice. This is the "efficiency" rule A6.
10. **Battery limit.** Max 10 batteries and 10 motors (stock). Challenges impose stricter limits (§5.3).

Practical consequences:
- **Every** conveyor cell needs its own connector right below it with an up arm. Chains of CONVERSOR 1 (L+R+U) under a belt are the typical solution.
- An elevator needs a connector under its bottom cell.
- A gadget needs a connector under its P cell.
- Motor graphics: the motor cell never receives flag 256 (it is never flooded), so it is always drawn with the "unpowered" table entry, slot 143 [? probably intended; slots 109/110 exist but appear unreachable].

---

## 4. Simulation (BD6010)

### 4.1 Movement directions

The direction computed at the mouse's current cell is L11488. Directions: 0 = left (c-1), 1 = right (c+1), 2 = up (r-1), 3 = down/fall (r+1), 4 = stay (wait), 5 = finished.

| current tile | direction |
|---|---|
| 0 (empty) | 3 (fall) |
| 1..6 | `code[1203+t-1]` = `[1,0,1,2,0,2]` (1 → right, 2 → left, 3 → right, 4 → up, 5 → left, 6 → up). If the tile has flag 1024 (needs power) and lacks 256, the direction is **4** (the mouse waits on an unpowered belt or elevator) |
| 80+v (special cells, incl. 88) | `dirOut[v] = code[133+v]`. For v in 13..19 (codes 93..99, `@154`), unpowered → 4 |
| 51 (end) | 5 |
| anything else (start 50, battery 40, and also connectors/motor if the mouse were on one) | 3 (fall) |

`dirOut[v]` for v = 1..20: `[2,1,3,2,0,3,1,2,0,1,3,0,4,1,0,2,1,4,0,2]`.

### 4.2 Entry check

L11645 decides whether the mouse may enter the target cell, moving in direction d.

1. Off-grid (`r == 10`, `r < 0`, `c == 14`, `c < 0`): **blocked**.
2. Empty: allowed.
3. Connector or motor (`@167` = 20..31): **blocked**.
4. Code 1..6 (`code[1209+t-1]` = `[5,6,8,1,8,2]`) or special cell 81..99 (`code[1215+v-1]`): allowed if `mask & bit(d)`, where moving left needs bit 2, right needs bit 1, up needs bit 8, down needs bit 4. With d = 4 (stay) any nonzero mask passes.
   - Conveyor 1 accepts the mouse moving right or falling onto it.
   - Conveyor 2 accepts moving left or falling.
   - Elevator top 3/5 accepts moving up only.
   - Elevator bottom 4 accepts moving right only; bottom 6 accepts moving left only.
5. Everything else (40 battery, 50 start, 51 end, 100): allowed from any side. A battery or start is "transparent": the mouse falls through it.

Special-cell entry masks, v = 1..20: `[1,1,1,2,2,2,8,8,8,4,4,4,16,1,2,2,4,16,4,1]`. 16 means it can never be entered.

So `v` encodes an (in, out) pair: 1 = R→U, 2 = R→R, 3 = R→D, 4 = L→U, 5 = L→L, 6 = L→D, 7 = U→R, 8 = U→U, 9 = U→L, 10 = D→R, 11 = D→D, 12 = D→L, 13 = solid, 14 = R→R (action, needs power), 15 = L→L (action, power), 16 = L→U (power), 17 = D→R (power), 18 = solid, 19 = D→L (power), 20 = R→U.

### 4.3 Run loop

seq255 handles free mode; seq279 handles challenge mode.

**Pressing Inicio:**
1. Every tile 50 spawns a mouse (seq281); `g387` += number of mice.
2. Sound 6060 loops. The start tile plays frames 95..100, WAV 6064, then frames 101, 102 (hatch).
3. The mouse sprite (seq282) appears on the start cell.

**Each step** (BD6010@8357..8851):
1. If there are batteries: drain them (§3.9). If one is dead: voice 6031 (one mouse) or 6032, panel 3, stop.
2. `d = dir(current)`. If `d == 5`: the end is reached (see 4.6).
3. Move the target cell by `d`. If `entry(target, d)` is false:
   - voice 6030 (seq343);
   - panel **2** if the target has flag 1024 without 256 (an unpowered part blocks the way), otherwise panel **5**;
   - the mouse gets the fail pose (seq286, frame 103); stop.
4. Effects of the target tile:
   - Elevator bottom (4/6): the three elevator cell objects start the lift animation (top tile frames 77..87, WAV 6062, pause 200, WAV 6063, frames 86..76).
   - Conveyor 1/2: `g399 += 1` (conveyor cell-steps, also counted while waiting on one).
   - Elevator shaft 88 entered from 4/6: `g398 += 1` (elevator rides).
   - Special A cell (flag 16384): mark "entering".
   - The next cell after A (inside the gadget): `g[400+i] += 1` (uses of special i). The gadget's static image hides and its PFL animation starts (seq337, only if the gadget is powered). The mouse sprite is hidden (seq285). It then walks the internal path invisibly, one cell per step.
   - Special B cell (flag 32768): wait until the animation reports done. The mouse reappears at B (seq284) and continues.
5. The mouse glides to the target cell (seq283: `glide_to(-130+30c, -91+30r)`, delay 100). If its horizontal direction changed it first plays a turn: frames 107, 106, 105, 104 to face right, or 104..107 to face left. Frame 103 faces right and 108 faces left; the mouse starts facing left (108).

Waiting (d = 4, unpowered part) does not end the run. The mouse stays put while batteries drain. With no batteries at all, nothing is powered and the mouse waits forever until Stop or Reiniciar [C, observed from code].

### 4.4 Test-page buttons

seq86, `l0 = 0..6`, frames `25+l0` / pressed `42+l0`, actions `code[6098+l0]`:
- 0: Inicio (seq255; in challenge mode seq279).
- 1: Stop (pause toggle, seq55/57).
- 2: Reiniciar (reload the page, seq56).
- 3: camera / photo album (seq62).
- 4: navigation menu (seq87).
- 5: help (seq292: "A. Probando tu artilugio" / "B. ¿Qué hago si no funciona bien?").
- 6: exit to BD3202.

### 4.5 Rendering the test floor

- Cell (r,c) top-left on screen = **(175+30c, 134+30r)**.
- The tile object sits at `(-130+30c, -91+30r)`. Every tile graphic stores its absolute position as if the cell were at **(305,225)**. So draw slot S at `(S.x - 305 + 175 + 30c, S.y - 225 + 134 + 30r)`.
- The background is grabbed from rect (157,125)-(605,440).
- Layers: tiles 1010, mouse 1000. Palette cycling of indexes 50..53 every 150 ticks animates belts and gears (seq254).

The tile slot is chosen per code (BD6010@6734..6822):
- **Powered:** use table `948 + code` if `(r+c)` is even, otherwise table `1028 + code` (checkerboard).
- **Unpowered:** use table `1082 + code`.

| code | powered even | powered odd | unpowered | notes |
|---|---|---|---|---|
| 1, 2 | 72 | 72 | 72 | powered: animates 72..75. Step `code[1186+code]`: +1 for code 1, +3 (i.e. -1) for code 2, mod 4 |
| 3, 5 | 76 | 76 | 76 | 29x92 elevator body drawn from the top cell (spans 3 cells); lift animation 76..87 |
| 4, 6, 88 | none | none | none | |
| 20 | 122 | 133 | 145 | |
| 21 | 121 | 132 | 144 | |
| 22 | 128 | 139 | 151 | |
| 23 | 129 | 140 | 152 | |
| 24 | 130 | 141 | 153 | |
| 25 | 127 | 138 | 150 | |
| 26 | 123 | 134 | 146 | |
| 27 | 125 | 136 | 148 | |
| 28 | 124 | 135 | 147 | |
| 29 | 126 | 137 | 149 | |
| 30 | 131 | 142 | 154 | |
| 31 (motor) | 109 | 110 | 143 | see the §3 quirk: effectively always 143 |
| 40 (battery) | 71 | 71 | 71 | replaced by slot `61 + k` for the k-th battery in scan order (numbered 1..10) |
| 50 (start) | 94 | 94 | 94 | hatch animation 95..102 when a mouse starts |
| 51 (end) | 155 | 155 | 155 | arrival animation 155..199 (45 frames) |
| special A cell | slot 111+i | | | the whole gadget image; other gadget cells draw nothing |

Left-side battery list: slot `32+i` (seq288) plus the charge text `g377+i` drawn at (55, 173+25i) (seq347+i).

### 4.6 End reached

- `g397 += 1` (mice arrived), WAV 6065, end-tile animation.
- **Free mode:** only the first mouse of the session gets the result screen (`g387 == 1 && g397 == 1`). It plays a random voice from 6033/6034/6035 (`code[2856..]`), then shows the score screen with panel **0**.
- **Challenge mode:** see §5.3.

### 4.7 Gadget sounds

The sounds play at PFL frame counts (seq337):

| gadget | frames → WAV |
|---|---|
| ALISADORA | f3 → 6056 |
| BAJALABAJA | f1 → 6050, f18 → 6051, f80 → 6052 |
| PULEMATIC | f1 → 6053, f46 → 6054, f115 → 6055; done early at f100 |
| CORRE QUE TE PILLO | f1 → 6057 |
| MIRA QUE TE VEO | f1 → 6058 |
| ROTOELEVADORA | f1 → 6059 |
| DÍ QUE NO | f5 → 6071 |
| METROMUELLE, BD6011.PFL variant | f3 → 6072, f15 → 6073, f75 → 6072, f94 → 6072-alt |
| METROMUELLE, BD6010.PFL variant | f3 → 6072, f22 → 6072-alt |
| BARBALISA | f1 → 6074 |
| SIMULADOR | f1 → 6075 |

The METROMUELLE "6072-alt" entries use sound descriptor 10657 or 10663 (6072 with different parameters).

---

## 5. Evaluation, scoring, challenges

### 5.1 Result panels

The score screen's AYUDA panel shows BD6010 slot `19+l0` (`l0` = the seq16 argument). The texts below are as rendered in the bitmaps; panels 2..5 are lightly reconstructed from scrolling crops.

| l0 | trigger | text |
|---|---|---|
| 0 | free mode, first mouse reached the end | "¡Premio! ¡¡Tu artilugio funciona bien!! Puedes llevarlo a la Oficina de Patentes" |
| 1 | challenge completed | "¡Bien hecho! ¡Has completado la prueba! Vuelve al laboratorio e intenta inventar algo usando tus propios medios" |
| 2 | blocked by an unpowered part | "Invento incompleto. Una o varias piezas no reciben corriente eléctrica. Comprueba tu diseño en la Mesa de Planos" |
| 3 | battery exhausted | "Invento incompleto. El artilugio no recibe suficiente corriente eléctrica. Verifica el diseño en la Mesa de Planos" |
| 4 | challenge requirements not met | "Invento incompleto. El vehículo funciona correctamente. Faltan piezas específicas de la Prueba…" |
| 5 | path blocked / fell off grid / wrong direction | "Invento incompleto. El invento tiene una línea incompleta. Verifica el diseño en la Mesa de Planos" |

Other messages:
- "Probando el invento" (slot 3) is the page title.
- "Prueba completada" (slot 4) is the stamp when a challenge is solved.

### 5.2 Score

L3017, shown by seq16 using the BD6021 layout:

```
score = -300*batteries(g376) + 200*conveyorSteps(g399) + 500*elevatorRides(g398)
        - 35*connectorCells(g411) + Σ_i specialUses[i](g400+i) * [3500,5500,4500,2000,3750,3000,5000,1650,3000,3000][i]
score = max(score, 0);  score = 0 if the last mouse failed (g412 == 0)
```

- Rank `g415`: score < 3000 → **PENSANTE**; < 5600 → **INVENTOR JUNIOR**; otherwise **MAESTRO SR. INVENTOR** (L2989).
- The rank graphic is BD6021 chunk 46+rank. The rank animation is BD6022 chunks `rank*8+1..+8`. The fanfare is WAV `10080+rank`, played only for panels 0 and 1.

Displayed fields (seq24..29: digit graphics are BD6021 chunk 1+d; coordinates `code[3422..]`):
- BATERÍAS g376 at (130,65)
- TRANSPORTADORA g399 at (130,127)
- ASCENSORES g398 at (130,193)
- PIEZAS ESPECIALES g410 (= Σ uses) at (130,254)
- ENLACES g411 (connector cells on the board) at (130,322)
- PUNTUACIÓN TOTAL g414 at (330,414)

The INFORMACIÓN panel alternates "TOTAL" and "CLASIFICACIÓN"+rank every 3 s. AYUDA shows the result panel.

Score-screen buttons (`code[3547]`):
- print (seq34)
- RÉCORDS: top-5 table, `g417..g421` in BD32502.GVD/.STR (names from BD32430.STR)
- close
- Oficina de Patentes (BD3040; it blinks on success)
- back to the Mesa de planos (BD6000)

### 5.3 Challenges

`g666 = 1..10`. Data at BD6010@7192.., duplicated at BD6000@5413.

**Flow (seq279):**
1. If `batteries > maxBat`: voice 6193 and nothing runs.
2. Counters g398, g399 and g400.. are reset per run.
3. The mice run as in free mode.
4. After a successful mouse, L7998 checks, in order:
   - `elevRides >= minElev`, otherwise result 2 (voice 6194);
   - `convSteps >= minConv`, otherwise result 1 (voice 6195);
   - `uses[i] >= req[i]` for all i, otherwise result 3 (voice 6196).
5. Any failed check plays voice 6199 plus the specific voice above, and shows panel 4.
6. On a pass, `g413 += 1` (successful mice). While `g413 < miceNeeded`, the **next mouse is launched automatically**. Battery charge is **not** reset between these mice.
7. When the count is reached:
   - set bit `g661[ch-1]`;
   - show the "Prueba completada" stamp;
   - reset the batteries;
   - play voice 6198 (6197 if all 10 are solved);
   - show panel 1.

There is also a code path after the requirement loop (BD6010@8046) that the disassembler marked unreachable, but `next` falls through when a loop completes [I]. If `flag[ch]` is set, it additionally requires `uses[5] > 0 || uses[8] > 0` (ROTOELEVADORA or BARBALISA), otherwise result 3.

```json
[
 {"ch":1,"mice":5,"maxBat":1,"minElev":0,"minConv":4,"flag":0,"req":{"PULEMATIC":1},"text":"lavar… cuatro cintas… UNA batería… cinco ratones"},
 {"ch":2,"mice":2,"maxBat":1,"minElev":0,"minConv":0,"flag":0,"req":{"MIRA QUE TE VEO":1,"SIMULADOR":1}},
 {"ch":3,"mice":1,"maxBat":1,"minElev":0,"minConv":0,"flag":0,"req":{"MIRA QUE TE VEO":1,"DI QUE NO":1,"METROMUELLE":1,"BARBALISA":1}},
 {"ch":4,"mice":1,"maxBat":10,"minElev":2,"minConv":0,"flag":0,"req":{"BAJALABAJA":1,"PULEMATIC":1,"CORRE QUE TE PILLO":1}},
 {"ch":5,"mice":1,"maxBat":2,"minElev":0,"minConv":0,"flag":0,"req":{"ALISADORA":1,"CORRE QUE TE PILLO":1,"MIRA QUE TE VEO":1,"SIMULADOR":1}},
 {"ch":6,"mice":3,"maxBat":2,"minElev":1,"minConv":0,"flag":1,"req":{"DI QUE NO":1,"METROMUELLE":1},"plus":"ROTOELEVADORA or BARBALISA [I]"},
 {"ch":7,"mice":1,"maxBat":2,"minElev":2,"minConv":3,"flag":0,"req":{"BAJALABAJA":1,"METROMUELLE":3}},
 {"ch":8,"mice":1,"maxBat":1,"minElev":0,"minConv":0,"flag":1,"req":{"ALISADORA":1,"CORRE QUE TE PILLO":1,"SIMULADOR":1},"plus":"ROTOELEVADORA or BARBALISA [I]"},
 {"ch":9,"mice":1,"maxBat":3,"minElev":0,"minConv":0,"flag":0,"req":{"CORRE QUE TE PILLO":6}},
 {"ch":10,"mice":1,"maxBat":3,"minElev":12,"minConv":0,"flag":0,"req":{},"note":"text says 'lánzale al menos cuatro veces' but table says 1 mouse"}
]
```

Raw table data:
- mice `[5,2,1,1,1,3,1,1,1,1]`
- maxBat `[1,1,1,10,2,2,2,1,3,3]`
- minElev `[0,0,0,2,0,1,2,0,0,12]`
- minConv `[4,0,0,0,0,0,3,0,0,0]`
- flag `[0,0,0,0,0,1,0,1,0,0]`
- req array addresses `[7252,7264,7277,7292,7306,7321,7334,7348,7362,7379]`. Each array is 10 values, followed by an unreferenced `count, ids…` list of suggested gadgets; for ch7 that list (66,66,61) disagrees with the req array.
- Texts are in `60\BD6000.STR`..`BD6009.STR` (challenge k → BD(5999+k).STR).

Note: "uses" counts gadget *entries*, and "elevRides" counts entries into an elevator shaft. Both are per run.

---

## 6. Sounds and misc

| context | WAVs |
|---|---|
| Editor | 6039 pick up; 6037 drop OK; 6038 part removed; 10016/10017 error; 1022/1016 button clicks; 6097 "missing start/end"; 4004 ambience loop; voices 6994 (first visit), 6000..6003 (greetings), 6004..6010 (hints, cycling through g390), 6092 (challenge panel), 7030/7031 (panel slide in/out), 1090/1091 (menu open/close), 6070 (help) |
| Test | 4005 ambience; 6060 run loop; 6064 start hatch; 6065 arrival; 6062/6063 elevator up/down; gadget sounds (§4.7); 6030 blocked; 6031/6032 battery dead; 6033..6035 success; 6018 (empty design, then exits to BD6500); 6019..6021/6120 intro; 6096 challenge intro; 6193..6199 challenge messages; 10090/10091 score screen open/close; 10080..10082 rank fanfare; 10000 camera |

- Sound channel helpers: `L2999(wav, ch)` / `L4244`.
- Profile and progress globals g636..g658 live in BD32470.GVD. g639 = current player. g652+k = save-slot status bits.
- **Timing [I].**
  - Tile and mouse objects use `delay 100`, so one step (one 30 px glide) is about 100 ticks; ticks are probably ms.
  - The elevator lift runs 11 frames up, pauses 200, then 11 frames down.
  - The end animation is 45 frames.
- **Uncertain items [?].**
  - Motor powered graphics (109/110) look unreachable.
  - The exact ms per tick.
  - The ch6/ch8 extra requirement (§5.3).
  - The junk members of load set @1290 (10, 90, 32000). They only affect battery-drain counts, which go through code 90 (v = 10) cells.
