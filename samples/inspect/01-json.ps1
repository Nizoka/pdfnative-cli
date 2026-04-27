# inspect/01-json.ps1 — Render a PDF then inspect it (JSON output)
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   pwsh -File samples\inspect\01-json.ps1
#
# Output: samples\output\inspect\01-report-metadata.json

$ErrorActionPreference = 'Stop'

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir    = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir  = Join-Path $RootDir 'samples\output'
$Pdf        = Join-Path $OutputDir 'document\02-report.pdf'
$InspectOut = Join-Path $OutputDir 'inspect'

New-Item -ItemType Directory -Force -Path $InspectOut | Out-Null

# ── Step 1: render the source document (if not already rendered) ────────────
if (-not (Test-Path $Pdf)) {
    Write-Host '→ Rendering source document…'
    New-Item -ItemType Directory -Force -Path (Split-Path $Pdf) | Out-Null
    & pdfnative render `
        --input  (Join-Path $RootDir 'samples\render\document\02-report.json') `
        --output $Pdf
    Write-Host "  ✓ Rendered: $Pdf"
}

# ── Step 2: inspect — JSON report ───────────────────────────────────────────
$ReportFile = Join-Path $InspectOut '01-report-metadata.json'

Write-Host '→ Inspecting PDF (JSON)…'
& pdfnative inspect `
    --input  $Pdf `
    --format json `
    --output $ReportFile

Write-Host "  ✓ Report: $ReportFile"
Write-Host ''
Write-Host 'Preview:'
Get-Content $ReportFile
