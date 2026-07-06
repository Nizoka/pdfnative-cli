# render/math/01-math.ps1 — mathematical & technical symbols (pdfnative 1.5.0)
#
# Registers the bundled math font alongside Latin so operators, Greek letters,
# set relations and blackboard-bold code points render as real glyphs.
#
# Usage:
#   pwsh -File samples\render\math\01-math.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\math'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering with the math font registered…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\math\01-math.json') `
  --output (Join-Path $OutputDir '01-math.pdf') `
  --font   latin `
  --font   math

Write-Host "  ✓ Output: $OutputDir\01-math.pdf"
