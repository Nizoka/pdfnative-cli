# split/01-split.ps1 — split one PDF into several (pdfnative 1.5.0 page-tree)
#
# Renders a four-page document, then splits it two ways: one PDF per page
# (default) and one PDF per --pages range.
#
# Usage:
#   pwsh -File samples\split\01-split.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\split'

New-Item -ItemType Directory -Force -Path (Join-Path $OutputDir 'per-page')  | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $OutputDir 'per-range') | Out-Null

Write-Host '→ [1/3] Rendering a four-page source…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\split\multipage.json') `
  --output (Join-Path $OutputDir 'source.pdf')

Write-Host '→ [2/3] Splitting one PDF per page (default)…'
& pdfnative split `
  --input      (Join-Path $OutputDir 'source.pdf') `
  --output-dir (Join-Path $OutputDir 'per-page') `
  --prefix     page

Write-Host '→ [3/3] Splitting into two ranges via --pages 1-2,3-4…'
& pdfnative split `
  --input      (Join-Path $OutputDir 'source.pdf') `
  --output-dir (Join-Path $OutputDir 'per-range') `
  --pages      '1-2,3-4' `
  --prefix     section

Write-Host "  ✓ Per-page:  $OutputDir\per-page\"
Write-Host "  ✓ Per-range: $OutputDir\per-range\"
Get-ChildItem (Join-Path $OutputDir 'per-page'), (Join-Path $OutputDir 'per-range') -Name
