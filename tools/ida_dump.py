# IDAPython (IDA 6.8, Python 2.7) script: dump the Hex-Rays pseudocode (or the
# disassembly when Hex-Rays is unavailable), strings and imports of the loaded
# executable, for grepping outside IDA.
#
# usage (headless, from PowerShell):
#   & "C:\Program Files (x86)\IDA 6.8\idaq.exe" -A -S"ida_dump.py OUTDIR" -Llog.txt USINV3R.EXE
#
# Writes OUTDIR\pseudo.c, OUTDIR\strings.txt and OUTDIR\imports.txt.
import idaapi
import idautils
import idc
import os

idaapi.autoWait()
out_dir = idc.ARGV[1] if len(idc.ARGV) > 1 else "."
idaapi.load_plugin("hexrays")  # batch mode doesn't load it on its own
hexrays = idaapi.init_hexrays_plugin()

with open(os.path.join(out_dir, "pseudo.c"), "w") as f:
    for ea in idautils.Functions():
        f.write("\n// ===== %s @ %08X\n" % (idc.GetFunctionName(ea), ea))
        text = None
        if hexrays:
            try:
                text = str(idaapi.decompile(ea))
            except Exception:
                text = None
        if text is None:
            for h in idautils.FuncItems(ea):
                f.write("%08X  %s\n" % (h, idc.GetDisasm(h)))
        else:
            f.write(text + "\n")

with open(os.path.join(out_dir, "strings.txt"), "w") as f:
    for s in idautils.Strings():
        refs = [x.frm for x in idautils.XrefsTo(s.ea)]
        f.write("%08X %s  <- %s\n" % (s.ea, repr(str(s)), ",".join("%08X" % x for x in refs)))

with open(os.path.join(out_dir, "imports.txt"), "w") as f:
    for i in range(idaapi.get_import_module_qty()):
        mod = idaapi.get_import_module_name(i)

        def cb(ea, name, ordinal):
            f.write("%08X %s!%s\n" % (ea, mod, name))
            return True
        idaapi.enum_import_names(i, cb)

idc.Exit(0)
