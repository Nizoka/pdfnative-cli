# render/outline/01-outline.ps1 — PDF bookmarks (outline tree), two ways
#
# `--outline auto` derives bookmarks from headings; `--outline <tree.json>`
# supplies an explicit OutlineItem[] tree.
#
# Usage:
#   pwsh -File samples\render\outline\01-outline.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\outline'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ [1/2] Auto bookmarks derived from headings (--outline auto)…'
& pdfnative render `
  --input   (Join-Path $RootDir 'samples\render\outline\01-headings.json') `
  --output  (Join-Path $OutputDir '01-auto.pdf') `
  --outline auto

Write-Host '→ [2/2] Explicit bookmark tree (--outline <tree.json>)…'
& pdfnative render `
  --input   (Join-Path $RootDir 'samples\render\outline\01-headings.json') `
  --output  (Join-Path $OutputDir '02-tree.pdf') `
  --outline (Join-Path $RootDir 'samples\render\outline\02-outline-tree.json')

Write-Host "  ✓ Output: $OutputDir\01-auto.pdf and $OutputDir\02-tree.pdf"
