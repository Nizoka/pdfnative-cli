# render/print/04-colour-bars.ps1 — crop marks, registration targets and colour control bars (v1.5.0)
#
# print.marks.colourBars draws CMYK solids and tints outside the trimmed page,
# in a 5 mm bleed; the marks use the registration colour (the All separation).
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   pwsh samples/render/print/04-colour-bars.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\print'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering with colour bars'
& pdfnative render --input (Join-Path $ScriptDir '04-colour-bars.json') --output (Join-Path $OutputDir '04-colour-bars.pdf') --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ Page boxes'
& pdfnative inspect --input (Join-Path $OutputDir '04-colour-bars.pdf') --pages --fields pages
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "✓ Done: $OutputDir"
