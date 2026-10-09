# Take a headless screenshot of the web app with Microsoft Edge.
#
# usage:
#   .\screenshot.ps1 -Query "?auto=taller&tick=timer" -Out shot.png [-Budget 3000] [-Size 1100,1000]
#
# Serve the repository first (python -m http.server 8765 from the repo root).
# -Budget is the virtual time in milliseconds the page runs before the shot.
# Use tick=timer in the query: headless Edge doesn't fire animation frames.
param(
  [string]$Query = "",
  [string]$Out = "shot.png",
  [int]$Budget = 3000,
  [string]$Size = "1100,1000",
  [string]$Base = "http://127.0.0.1:8765/web/index.html"
)
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path $env:TEMP "inventor-thing-edge-profile"
# A fresh profile each time: no cached scripts and no saved settings.
if (Test-Path $profile) { Remove-Item -Recurse -Force $profile -Confirm:$false }
$outPath = [IO.Path]::GetFullPath($Out)
& $edge --headless=new --disable-gpu --no-first-run --user-data-dir="$profile" --mute-audio `
  --autoplay-policy=no-user-gesture-required --window-size=$Size --virtual-time-budget=$Budget `
  --screenshot="$outPath" --enable-logging=stderr --v=0 ($Base + $Query) 2>&1 |
  Select-String -Pattern "Uncaught|TypeError|ReferenceError" | ForEach-Object { $_.Line }
"saved $outPath"
