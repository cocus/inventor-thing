# Invention Studio (USINV3R.EXE) script VM notes

Tool: `tools/pagvm.py FILE.PAG [-o out.txt]`. Outputs for section 60: `BD6000.txt`, `BD6005.txt`, `BD6010.txt`, `BD6020.txt`, all in this directory. All four decode with no errors. Every relative and absolute jump target lands on a decoded statement.
Handler addresses below are in USINV3R.EXE (image base 0x400000).

## 1. Containers

| tag | content |
|---|---|
| 0x36 | **The program the Win32 exe runs.** `u16 start_seq, u16 n, n x u32 seq_table, u16 nbytes, nbytes of int32 tokens, u16 0x36`. Loaded by sub_419AE0: the table goes to dword_44BE80[1..n], the code to dword_43DC20[] (max 0x36AE tokens), and `start_seq` to dword_44C4FC. After the page loads, sub_41A3B0/sub_40A3E0 spawn one object running `start_seq`. |
| 0x37 | The same program with 16-bit tokens. Strings use one char per token instead of packed bytes, so the token count differs. The Win32 loader skips it (sub_419700(55)). |
| 0x38 | 17-byte hotspot record (sub_419B80) |
| 0x39 | help data |
| 0x0B | RIFF blob (palette), sub_41B080 |
| 80 | include: `u16 page, u16 skip, u16 count`. Pulls `count` graphic chunks from BD<page>.PAG into the next slots. |
| 90 | `u16 seq`: spawn a sequence while the page loads |
| 39 | empty graphic slot (takes a slot number) |

`seq_table[i]` is a token index into the code. Several sequences can share one entry; for example seq105..seq247 in BD6000 are the placed-part objects. The first ~1400 tokens of a page are a library of subroutines, data tables and packed strings.

## 2. Execution model

Each running "sequence" is an **object** (sprite/thread record of 0xB4 bytes, allocated from a pool). It has its own PC, call stack, position, current frame (graphic slot), layer and 8 locals. The scheduler is sub_4177C0. Objects sit in a layer-sorted list (dword_44C6B0). Each object runs statements until one of these happens:
- it reaches a **frame statement**: any token that isn't an opcode is an expression whose value is a graphic slot. The object draws it (0 = no image), applies its velocity, and sleeps `delay` ticks;
- it hits `sleep`, `wait_signal`, `yield`, etc.

Object fields reachable as locals: `l[k]` sits at object+116+4k. The disassembler uses these names:

| local | name | meaning |
|---|---|---|
| l-29 | next | |
| l-28 | parent | |
| l-26 | seqno | sequence id |
| l-25 / l-24 | x / y | |
| l-23 / l-22 | vx / vy | |
| l-21..l-18 | clipL/T/R/B | clip/hit rect; also used as the object's bounding box |
| l-17 | layer | |
| l-16 | frame | |
| l-15 | delay | |
| l-14 | time | |
| l-13 | mark | |
| l-12 | pc | |
| l-5 | hotspot | |
| l-3 | res | result register for many natives |
| l0..l7 | (locals proper) | |
| l8 | ink | |
| l10 | sigcount | |
| l11 | onframe | |
| l12 | dragflags | |
| l13 | htable | handler table |

Shared state:

| name | storage | notes |
|---|---|---|
| g0..g999 | dword_43C710 | globals. Can be saved/loaded to BDnnnn.GVD. |
| s0..s49 | dword_43DC0C | string registers, 100 bytes each |
| sem 0..79 | bits at dword_44B6E0 | semaphores |
| slots 1..1599 | dword_437AC0 | graphic slots |

## 3. Token encoding (int32 tokens)

| range | meaning |
|---|---|
| -32169 .. -32001 | statement opcodes (only at statement start) |
| -32000 | no-op (statement), or a prefix in expressions that resets the context to self |
| -32537..-32500, -32436..-32400, -32160, -32159 | expression operators/functions (prefix / Polish notation, recursive, sub_406530) |
| -31999 .. -31000 | global `g[tok+31999]` |
| -30199 .. -30001 | local `l[tok+30100]` (-99..99) |
| anything else | literal value. `-32400 X` escapes a literal that collides with the ranges above. |
| inline strings | bytes packed 4 per token, NUL-terminated, followed by a full 0 token |
| some natives | read raw inline tokens or a 32-bit constant as two tokens (lo16, hi16) |

### Expression operators (sub_406530)

| tok | hex | op | | tok | hex | op |
|---|---|---|---|---|---|---|
| -32435 | 814D | a<<b | | -32416 | 8160 | a==b |
| -32434 | 814E | (u16)a>>b | | -32415 | 8161 | a<=b |
| -32433 | 814F | a>>b | | -32414 | 8162 | abs(a) |
| -32432 | 8150 | evalat(a): evaluate the expression stored at code[a] | | -32413 | 8163 | a\|b |
| -32431 | 8151 | l[a+b] | | -32412 | 8164 | a&b |
| -32430 | 8152 | g[a+b] | | -32411 | 8165 | **arg**: the next expression from the caller's stream (gosub parameter) |
| -32429 | 8153 | strlen(s[a]) | | -32410 | 8166 | random(a,b) inclusive |
| -32428 | 8154 | fileexists(num,type) (type indexes the extension table below; +0x1000 deletes) | | -32409 | 8167 | a<b |
| -32427 | 8155 | nth free slot | | -32408 | 8168 | parent.<expr> (context switch) |
| -32426 | 8156 | slotloaded(a) | | -32407..-32403 | 8169..816D | % / * - + |
| -32425 | 8157 | && | | -32402 | 816E | l[a] |
| -32424 | 8158 | \|\| | | -32401 | 816F | g[a] |
| -32423 | 8159 | ^ | | -32400 | 8170 | escaped literal (next raw token) |
| -32422 | 815A | != | | -32436 | 814C | soundlevel(ch) |
| -32421 | 815B | >= | | -32160 | | hset(i,v): set handler-table entry, return the old value |
| -32420 | 815C | > | | -32159 | | hsel(addr): select handler table |
| -32419 | 815D | neg | | -32418 | 815E | code[a+b] (data-table read) |
| -32417 | 815F | obj(id).<expr> (context = object found by id/target code) | | | | |

Low block:

| tok | op |
|---|---|
| -32537 | keydown |
| -32536 | palindex(r,g,b) |
| -32535 | muldiv(a,b,c) |
| -32534 | videoflags |
| -32533 | dist(x1,y1,x2,y2) |
| -32532 | pixel(slot,x,y) |
| -32531 | free objects |
| -32530 | inrect(x1,y1,x2,y2) (own x,y) |
| -32529 | bitscan |
| -32528 | testbit(gidx,bit) (bit n of g[gidx + n>>4]) |
| -32527 | ! |
| -32526 | ~ |
| -32508 | indexof(v, table@addr) (table = count, entries) |
| -32507 / -32506 | scrolly / scrollx |
| -32505 | sem(n) |
| -32503 | dword_44BC64 |
| -32502 | date |
| -32501 / -32500 | mousey / mousex |

## 4. Statements (sub_4177C0)

Operands are expressions unless noted. "fl" means the operand is a flags word, and the following operands depend on its value. The decoder needs that value to be constant; when the flags are given as `K + var`, it uses K and adds a `; GUESS` comment.

| tok | name in listing | operands / semantics | handler |
|---|---|---|---|
| (none) | frame E | show slot E, step motion, sleep `delay` | inline |
| -32000 | nop | | |
| -32001 | mark | set the resume point for `wait_signal` | inline |
| -32002 | wait_signal [0] | if sigcount>0 continue (a trailing 0 means consume all); otherwise go to mark, or re-wait | sub_411730 |
| -32003 | end | pop frame: return from gosub / loop back / restore state. Keeps unwinding; with no frame it kills the object. | inline |
| -32004 | delay n | ticks per frame | |
| -32005 | goto_seq n | | sub_40A320 |
| -32006 | move dx,dy | | |
| -32007 | delay_add n | | |
| -32011 | gosub_seq n | | sub_40A320 |
| -32012 | repeat n | loop block closed by next/end | sub_40A250 |
| -32013 | next | close a repeat/save_state block (falls through when done); with no block it returns | |
| -32014 | setpos x,y | | |
| -32015 | spawn E | child object running seq (E&0x3FF). 0x400 = on top. 0x800 = pass (E>>12)+1 args: the next expressions become the child's l0.. | sub_40A3E0 |
| -32019 | detach_owner | | |
| -32020 / -32021 | rnd_gosub/goto_seq n, tbl... | | |
| -32022 / -32023 | attach_parent / attach_none | position follows parent (flags at +93) | |
| -32024 / -32114 | layer n / layer_top n | re-sort in the layer list | |
| -32025 | hide | | sub_404CA0 |
| -32026 | nowait | | |
| -32027 | pagstream BDn.PAG, fl ... | background PAG streamer; loads `count` graphic chunks into slots from `first` (e.g. BD10400.PAG -> slots 600..675) | sub_41FDB0 |
| -32028 | delay_add n | | |
| -32029 | hotspot id, msg | make this object clickable; msg is sent on click (see §5) | |
| -32030 | hotspot_remove | | |
| -32031 / -32032 | hotspot_enable/disable id | | sub_4116D0 |
| -32033 | velocity vx,vy | | |
| -32034 | signal_all_others msg | | sub_410D10 |
| -32035 | gotopage BDn.PAG | | sub_41A3B0 |
| -32037 | set_user4 | | |
| -32041 | sprintf fl, fmt, args... | into s[fl&~0x6000]; fmt per §6 | sub_40FF30 |
| -32042 | signal target, msg | §5 | sub_40AED0 |
| -32045 / -32046 / -32047 | page stack: drop / callpage / retpage | | |
| -32048 | pop_frame | break out of a loop | |
| -32050 | nextpage_start_seq n | | |
| -32051 | clip_rect x1,y1,x2,y2 (or <0 = off) | | sub_417770 |
| -32052 | slots_* sub,... | slot flags/free/swap/origin | sub_41C770 |
| -32053 | filecopy fl,... | | sub_40D6C0 |
| -32054 | fillscreen r,g,b | | sub_410A90 |
| -32055 | screengrab fl,... | | sub_408270 |
| -32056 / -32057 [0] | drawmode on / off(+refresh) | | |
| -32058 | wait_slot n | | |
| -32059 | draw_now slot | | sub_411690 |
| -32060 | frame_again | | |
| -32061 | sleep n | | |
| -32062 / -32091 | eval e | | |
| -32063 / -32064 | glide_to / glide_by x,y,speed,steps | | sub_4115A0 |
| -32065 | path_set/path_check/... fl, str... | path ops | sub_403000 |
| -32067 / -32123 / -32124 | gN = / += / -= e | | |
| -32068 / -32121 / -32122 | lN = / += / -= e | | |
| -32125 / -32126 | g[a+b]=c / l[a+b]=c | | |
| -32103 / -32104 / -32105 | setbit / clrbit / togglebit g[idx+(b>>4)].bit(b&15) | | |
| -32071 | if (c) goto rel | target = pc after operands + off | sub_411520 |
| -32096 | if !(c) goto rel | same | sub_411520 |
| -32095 | goto rel | | sub_411520 |
| -32070 | poke_rel | | |
| -32148 / -32149 | gosub / goto ABS (token index) | callee reads its params with `arg` | sub_40A280 |
| -32166 / -32167 | call / goto handler[i] | via the table selected with hsel | sub_40A2E0 |
| -32127 | return e | sets the global result | |
| -32073 | bgcolor r,g,b | | sub_411490 |
| -32074 | ink n | | |
| -32077 | scroll ... | | sub_4176D0 |
| -32078 | yield | | |
| -32079 | msgfilter | | sub_4113D0 |
| -32080 | clip fl,... | | sub_41C340 |
| -32083 | loadgfx page,chunk,count,slot | copy graphic chunks of BD<page>.PAG into slots | sub_411090 |
| -32084 | flag10 0/1 | | sub_4143D0 |
| -32087 | wait_slot_loaded | | sub_4140E0 |
| -32088 | cursor n / cursor -4,n | | sub_413CC0 |
| -32089 | pal_* op,... | palette fades/tints | sub_41E0A0 |
| -32090 | save_state mask | push a copy of the object; the matching next/end restores the fields in mask | sub_414400 |
| -32093 | switch_seq e, n, seq... | | sub_410E70 |
| -32094 | speed | | |
| -32099 | save_globals first,last,file | BDfile.GVD | sub_413F90 |
| -32100 | load_globals first,file | | sub_414040 |
| -32101 / -32098 / -32102 / -32111 / -32143 | slot image ops: scale / stretch / mask / dither / copy | | |
| -32107 | tracemode | | sub_417640 |
| -32108 | onframe_seq | | |
| -32118 | objsave/objload fl,file,... | REC/TSK files | sub_4193B0 |
| -32119 | string ops on s[fl&0x7F] | kind=(fl>>8)&0xF: 1 clear, 2 chop, 3/4 save/load .STR, 5 measure, 6 textstyle, 7 strcpy, 9 move, 10 strcmp, 11 fit, 12 drawtext | sub_40F280 |
| -32128 | pflanim fl,[slot],file | load/stream a BDnnnn.PFL sprite into a slot | sub_414AA0 |
| -32129 | edit_* fl,... | Win32 EDIT control | sub_40E490 |
| -32130 | invalidate x1,y1,x2,y2 [0,grow] | | sub_4094E0 |
| -32138 | nop2 a,b | | sub_4018B0 |
| -32141 | objmisc sub,... | 4 = res_set e, 5 = step_towards | sub_401AF0 |
| -32151 | sound ch, fl... | WAV channel: 0x400 play BDn.WAV, 0x100 start, 0x10 loops, 8 vol, -x ops | sub_412E90 |
| -32152 | soundctl fl... | | sub_413880 |
| -32154 | aim x1,y1,x2,y2,ndirs | sets direction l7 and distance res | sub_406380 |
| -32161..-32164 | sem_wait_clr / sem_set / sem_wait_set / sem_clr n | | |
| -32165 | hotspot_param id, kind, ... | | sub_41BFA0 |
| -32168 | set_4339E8_E4 a,b | | sub_41B0B0 |

Not used in section 60, so not implemented (the decoder reports them): -32131 sub_4091A0, -32135 sub_401010, -32140 sub_401E40, -32155..-32158, -32043, -32044, -32072 sub_41D350, -32097, -32132, -32142, and setpixel 0x4000.

## 5. signal / hotspot messages (sub_40AA90 + sub_40A600)

**Target:**

| value | meaning |
|---|---|
| -1 | self |
| -2 | parent |
| -3 | all others |
| -4..-9 | filtered sets |
| -10 / -11 | object under me |
| n<1000 | every object running seq n |
| 1000+n | my children running seq n |
| 2000+k | group k |
| >=10000 | every object whose PC is inside the code of seq (n-10000) |

**Message:**

| value | meaning |
|---|---|
| >=16000 | spawn seq |
| 15000+ / 14000+ / 13000+ | xor / clear / set drag flags |
| 10000+n | the target does gosub seq n (event handler, returns to where it was) |
| 9000..9014 | flag / hotspot specials (9007 = adopt) |
| 8000+n | goto seq n |
| 7500+ | ink |
| 7000+ | group |
| 6100+i / 6000+i | goto / gosub handler[i] |
| <6000 | bit set |

Bits of a <6000 message:

| bit | effect |
|---|---|
| 1 | wake (sigcount++) |
| 2 | detach |
| 4 | run now |
| 8 | kill (also kills children) |
| 0x10 | erase |
| 0x20 | drop hotspot |
| 0x40 | clear stack |
| 0x80 | no frame |
| 0x100 / 0x200 | hide / show |

19999 = quit app. A target of 0 with msg >= 16000 or < 2000 spawns a sequence without a parent.

## 6. Strings, files, resources

**String operands** (sub_40E090), selected by fl&0x6000:

| fl&0x6000 | operand |
|---|---|
| 0x2000 | packed string at code[expr] |
| 0x4000 | register s[expr] |
| 0 | inline packed string |

fl&0x80 (sub_40E0E0) means a block of operands is read from code[expr] and then the PC is restored.

**File numbers.** sub_40CF80 formats them as `BD%d.EXT` (the files are named BDnnnn), using the type table at 0x42E398:

| type | ext | | type | ext |
|---|---|---|---|---|
| 0 | PAG | | 8 | TSK |
| 1 | WAV | | 9 | STR |
| 2 | MSF | | 10 | PAG |
| 3 | BMP | | 11 | PFL |
| 4 | GVD | | 12 | AVI |
| 5 | EXE | | 13 | CWV |
| 6 | DLL | | 14 | WAV |
| 7 | REC | | | |

Numbers >= 32000 go to the user's save directory (e.g. BD32470.GVD holds saved globals g636..g658; BD32060+g612 is a saved PAG).

**Graphic slots.** "frame N" and every slot argument index dword_437AC0. At page load the table is cleared, except slots flagged "keep" via slots_flag2_set. The loader then gives every graphic chunk (0x20 bitmap, 21..24 DIB, 'BM', 'RI', 0xF315 sprite, 0xF515, 39 placeholder, and tag-80 includes) the next slot, **starting at 1, in file order**. In section 60 every graphic is a 0x20 bitmap, so slot k = k-th 0x20 chunk; the disassembler prints the map in the file header. Loading streams in the background, and `wait_slot` / `wait_slot_loaded` block until a slot is present. Other slots are filled at run time:
- `pagstream 10400` puts the maze **part graphics in slots 600..675** (from 104/BD10400.PAG; kept across pages);
- `loadgfx` loads BD10200.PAG into slots 816.. and BD6012 into 877;
- `pflanim` loads BD60xx.PFL sprites into slots.

**Sounds.** Played by WAV number via the subroutine at L2999 in BD6000 (`gosub L2999 (6039, 6)` plays BD6039.WAV), which wraps the `sound ch, 0x400 play=...` and `soundctl` natives.

## 7. Things noticed about the maze (BD6000, the blueprint editor)

- Grid placement in seq105..247 (part objects): snap with `l1 = (x-168+15)/30`, `l2 = (y-35+15)/30`, `setpos 168+l1*30, 35+l2*30`.
- A part is rejected when `x >= 588` or `y + height*30 >= 335`, which gives a **14 x 10 grid of 30 px cells with origin (168,35)**.
- Part type tables at BD6000 code[5181..5265]:
  - code[5181+type] and code[5189+type]: frame bases;
  - code[5205+type]: part height in cells;
  - code[5247+..], code[5257+type]: more per-type data.
- g344 = selected part type; g345+type = variant; g354+type = remaining stock of that type; g316.. = bitset of used part instances.
- Inline strings at the start of BD6000 hold the Spanish part names/descriptions: start point, end, batteries, motors, belts, elevators, and the gadgets ALISADORA, BAJALABAJA, ...
- Subroutines that take inline arguments are listed in each file's header, e.g. L8987(row,col), which looks like a cell-occupied test (returns res).

## 8. Confidence / gaps

- **High:** the token encoding, the expression operators, and the operand counts of every opcode used in these 4 files.
  - 0 decode errors.
  - All jump/call targets coincide with decoded statement starts. This is a strong cross-check: the relative jumps only line up if every operand count is right.
  - Gosub argument counts come from counting `arg` tokens in each callee (fixpoint). This can be wrong if a callee reads args only on some paths. It held for every call site here: no bad targets.
- **Medium:** mnemonic names of rarely used natives (sound flags, palette sub-ops, file ops, text/edit ops, pagstream flags).
- **Heuristics:**
  - Code vs data is decided by reachability from the sequence table plus explicit jumps.
  - Fallthrough stops at a `frame` literal >= 1600, at a known data-table address, or after `wait_signal` followed by >= 24 plain literals.
  - Code reached only indirectly (handler tables, `evalat`, `goto @[expr]`, message targets) is decoded speculatively and marked `~`.
  - Statements whose flags are `K+var` are decoded assuming var only fills the low bits (marked `; GUESS`).
  - `pflanim` without 0x80 depends on a runtime mode; the decoder assumes mode 2 (the slot operand is present).
- Not decoded:
  - the 0x37 (16-bit) chunk;
  - opcodes not used in section 60 (other sections hit -32140, -32131, -32158, -32043 ...; run pagvm on them to see).
