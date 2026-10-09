# Regenerate the README screenshots in docs/screenshots.
#
# usage: .\make_screenshots.ps1 [-Python path\to\python.exe]
#
# Needs the game files in invention/ and the repo served on port 8765
# (python -m http.server 8765 from the repo root). Each shot is taken with
# screenshot.ps1 and cropped to the game canvas with crop_strip.py.
param([string]$Python = "python")
$tools = $PSScriptRoot
$out = Join-Path (Split-Path $tools) "docs\screenshots"
New-Item -ItemType Directory -Force $out | Out-Null
$tmp = Join-Path $env:TEMP "inventor-thing-shots"
New-Item -ItemType Directory -Force $tmp | Out-Null

function B64($json) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)) }
# Demo designs: a gadget run, and an elevator run.
$demo1 = B64 '{"parts":[{"type":1,"v":0,"r":1,"c":2},{"type":2,"v":0,"r":6,"c":10},{"type":0,"v":0,"r":5,"c":1},{"type":3,"v":0,"r":4,"c":1},{"type":4,"v":0,"r":3,"c":2},{"type":4,"v":0,"r":3,"c":3},{"type":6,"v":6,"r":4,"c":2},{"type":6,"v":6,"r":4,"c":3},{"type":6,"v":6,"r":4,"c":4},{"type":7,"v":0,"r":1,"c":4}]}'
$demo2 = B64 '{"parts":[{"type":1,"v":0,"r":4,"c":0},{"type":2,"v":0,"r":7,"c":3},{"type":0,"v":0,"r":9,"c":5},{"type":3,"v":0,"r":8,"c":5},{"type":4,"v":0,"r":7,"c":0},{"type":5,"v":0,"r":5,"c":1},{"type":4,"v":0,"r":5,"c":2},{"type":6,"v":5,"r":8,"c":0},{"type":6,"v":6,"r":8,"c":1},{"type":6,"v":6,"r":8,"c":2},{"type":6,"v":0,"r":8,"c":3},{"type":6,"v":0,"r":8,"c":4},{"type":6,"v":1,"r":7,"c":2},{"type":6,"v":1,"r":6,"c":2}]}'

# name, query, virtual time, window size, crop box (x y w h)
$shots = @(
  @("maze-editor",       "?lang=en&ch=0&design=$demo1",                  1500,  "1100,1000", 70, 12, 960, 720),
  @("maze-challenge",    "?lang=en&ch=4&design=$demo1",                  1500,  "1100,1000", 70, 12, 960, 720),
  @("maze-run",          "?lang=en&ch=0&design=$demo1&auto=run",         4300,  "1100,1000", 70, 12, 960, 720),
  @("maze-score",        "?lang=en&ch=0&design=$demo1&auto=score",       1500,  "1100,1000", 70, 12, 960, 720),
  @("maze-challenges",   "?lang=en&ch=0&auto=challenges&view=detail&sel=3", 1500, "1100,1000", 70, 12, 960, 720),
  @("maze-large-board",  "?lang=en&ch=0&design=$demo2&size=26x16",       1500,  "1600,1200", 50, 12, 1500, 990),
  @("taller-chooser",    "?lang=en&auto=taller",                          2500,  "1100,1000", 70, 12, 960, 720),
  @("taller-blueprint",  "?lang=en&auto=taller&machine=1&solve=1",        2500,  "1100,1000", 70, 12, 960, 720),
  @("taller-arm",        "?lang=en&auto=taller&machine=1&solve=1&build=1", 5600, "1100,1000", 70, 12, 960, 720),
  @("taller-machine",    "?lang=en&auto=taller&machine=1&solve=1&build=1", 30000, "1100,1000", 70, 12, 960, 720)
)
foreach ($s in $shots) {
  $full = Join-Path $tmp "$($s[0]).png"
  & (Join-Path $tools "screenshot.ps1") -Query ($s[1] + "&tick=timer") -Out $full -Budget $s[2] -Size $s[3] | Out-Null
  & $Python (Join-Path $tools "crop_strip.py") (Join-Path $out "$($s[0]).png") $s[4] $s[5] $s[6] $s[7] $full
  "wrote $($s[0]).png"
}
