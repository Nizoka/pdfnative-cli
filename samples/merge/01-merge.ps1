# merge/01-merge.ps1 — concatenate several PDFs into one (pdfnative 1.5.0 page-tree)
#
# Renders three standalone documents, then merges them into a single PDF while
# preserving each source's pages in order.
#
# Usage:
#   pwsh -File samples\merge\01-merge.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\merge'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ [1/2] Rendering three source documents…'
& pdfnative render --input (Join-Path $RootDir 'samples\render\document\01-minimal.json') --output (Join-Path $OutputDir 'part-a.pdf')
& pdfnative render --input (Join-Path $RootDir 'samples\render\document\02-report.json')  --output (Join-Path $OutputDir 'part-b.pdf')
& pdfnative render --input (Join-Path $RootDir 'samples\render\document\04-invoice.json') --output (Join-Path $OutputDir 'part-c.pdf')

Write-Host '→ [2/2] Merging into one PDF…'
& pdfnative merge `
  (Join-Path $OutputDir 'part-a.pdf') `
  (Join-Path $OutputDir 'part-b.pdf') `
  (Join-Path $OutputDir 'part-c.pdf') `
  --output (Join-Path $OutputDir '01-merged.pdf')

Write-Host "  ✓ Output: $OutputDir\01-merged.pdf"
Write-Host '→ Page count of the merged document:'
& pdfnative inspect --input (Join-Path $OutputDir '01-merged.pdf') --summary
