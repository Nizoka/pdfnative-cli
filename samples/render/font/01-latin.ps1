# render/font/01-latin.ps1 — Use --font latin shortcut (v0.3.0)
#
# Demonstrates the v0.3.0 `--font latin` flag.
#
# Usage: pwsh -File samples\render\font\01-latin.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutDir    = Join-Path $RootDir 'samples\output\font'

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

& pdfnative render `
    --input  (Join-Path $ScriptDir '01-latin.json') `
    --output (Join-Path $OutDir   '01-latin.pdf') `
    --font   latin `
    --lang   latin

Write-Host "✓ Rendered: $(Join-Path $OutDir '01-latin.pdf')"
