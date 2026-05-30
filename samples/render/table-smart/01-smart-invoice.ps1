# render/table-smart/01-smart-invoice.ps1 — smart tables via CLI flags (v1.0.0)
#
# Demonstrates pdfnative 1.2.0 smart-table flags. These fill any TableBlock
# fields left unset in the JSON (block-level JSON always wins).
#
# Usage:
#   pwsh samples/render/table-smart/01-smart-invoice.ps1

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Resolve-Path (Join-Path $ScriptDir '..\..\..')
$Input     = Join-Path $ScriptDir '01-smart-invoice.json'
$OutDir    = Join-Path $RootDir 'samples\output\table-smart'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host '-> Rendering with smart-table flags (--zebra --repeat-header --table-wrap auto)...'
pdfnative render `
  --input          $Input `
  --output         (Join-Path $OutDir '01-smart-invoice.pdf') `
  --table-wrap     auto `
  --repeat-header `
  --zebra `
  --min-row-height 20 `
  --cell-padding   6

Write-Host "  OK $OutDir\01-smart-invoice.pdf"
