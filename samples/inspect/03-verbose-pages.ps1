# inspect/03-verbose-pages.ps1 — deep inspection with --verbose and --pages

$ErrorActionPreference = 'Stop'

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir     = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir   = Join-Path $RootDir 'samples\output'
$Pdf         = Join-Path $OutputDir 'document\03-all-blocks.pdf'
$InspectOut  = Join-Path $OutputDir 'inspect'

New-Item -ItemType Directory -Force -Path $InspectOut | Out-Null

if (-not (Test-Path $Pdf)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $Pdf) | Out-Null
    & pdfnative render `
        --input  (Join-Path $RootDir 'samples\render\document\03-all-blocks.json') `
        --output $Pdf
}

Write-Host '→ Inspecting (verbose + pages)…'
& pdfnative inspect `
    --input   $Pdf `
    --format  json `
    --verbose `
    --pages `
    --output  (Join-Path $InspectOut '03-verbose-pages.json')

Write-Host "  ✓ Report: $InspectOut\03-verbose-pages.json"
