# render/print/07-tight-bleed-marks.ps1 — printer marks in a 3 mm bleed (v1.5.0)
#
# pdfnative 1.8.0 re-centres and shrinks the marks to the bleed strip and keeps
# their strokes inside the MediaBox; below 6.6 pt the registration targets are dropped.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   pwsh samples/render/print/07-tight-bleed-marks.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\print'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering with an 8.5 pt bleed'
& pdfnative render --input (Join-Path $ScriptDir '07-tight-bleed-marks.json') --output (Join-Path $OutputDir '07-tight-bleed-marks.pdf') --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ Page boxes'
& pdfnative inspect --input (Join-Path $OutputDir '07-tight-bleed-marks.pdf') --pages --fields pages
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "✓ Done: $OutputDir"
