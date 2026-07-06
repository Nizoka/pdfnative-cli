# extract/01-extract.ps1 — pull selected pages into a new PDF (pdfnative 1.5.0)
#
# Renders a four-page document, then extracts a subset of pages in an arbitrary
# order. --pages is a 1-based list/range; order is preserved and repeats allowed.
#
# Usage:
#   pwsh -File samples\extract\01-extract.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\extract'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ [1/2] Rendering a four-page source…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\split\multipage.json') `
  --output (Join-Path $OutputDir 'source.pdf')

Write-Host '→ [2/2] Extracting pages 4, 1 and 2 (order preserved)…'
& pdfnative extract `
  --input  (Join-Path $OutputDir 'source.pdf') `
  --output (Join-Path $OutputDir '01-extracted.pdf') `
  --pages  '4,1-2'

Write-Host "  ✓ Output: $OutputDir\01-extracted.pdf"
& pdfnative inspect --input (Join-Path $OutputDir '01-extracted.pdf') --summary
