# inspect/02-text.ps1 — Render a PDF then inspect it (human-readable text output)
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   pwsh -File samples\inspect\02-text.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir    = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir  = Join-Path $RootDir 'samples\output'
$PdfaPdf    = Join-Path $OutputDir 'pdfa\01-pdfa-1b.pdf'

New-Item -ItemType Directory -Force -Path (Split-Path $PdfaPdf)              | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $OutputDir 'inspect')   | Out-Null

# ── Step 1: render the PDF/A document (if not already rendered) ─────────────
if (-not (Test-Path $PdfaPdf)) {
    Write-Host '→ Rendering PDF/A-1b document…'
    & pdfnative render `
        --input  (Join-Path $RootDir 'samples\render\pdfa\01-pdfa-1b.json') `
        --output $PdfaPdf
    Write-Host "  ✓ Rendered: $PdfaPdf"
}

# ── Step 2: inspect — text report (stdout) ──────────────────────────────────
Write-Host '→ Inspecting PDF (text)…'
Write-Host ''
& pdfnative inspect `
    --input  $PdfaPdf `
    --format text
