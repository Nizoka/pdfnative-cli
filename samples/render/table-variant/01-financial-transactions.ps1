# render/table-variant/01-financial-transactions.ps1 — table-variant render
#
# Usage:
#   pwsh -File samples\render\table-variant\01-financial-transactions.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\table-variant'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering table-variant ledger…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\table-variant\01-financial-transactions.json') `
  --output (Join-Path $OutputDir '01-financial-transactions.pdf') `
  --variant table

Write-Host "  ✓ Output: $OutputDir\01-financial-transactions.pdf"
