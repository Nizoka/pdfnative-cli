# metadata/01-update-metadata.ps1 — incremental metadata update (pdfnative 1.7.0)
#
# Renders a document, rewrites its /Info metadata (title + author) with an
# INCREMENTAL save — the original bytes are preserved, so any existing
# signature stays valid for its revision — then inspects the result.
#
# Usage:
#   pwsh -File samples\metadata\01-update-metadata.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\metadata'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ [1/3] Rendering the source document…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\metadata\document.json') `
  --output (Join-Path $OutputDir 'source.pdf')

Write-Host '→ [2/3] Updating title + author (incremental — original bytes preserved)…'
& pdfnative metadata `
  --input  (Join-Path $OutputDir 'source.pdf') `
  --output (Join-Path $OutputDir 'updated.pdf') `
  --title  'Quarterly Report — FY2026' `
  --author 'Finance Team' `
  --mod-date '2026-01-15T00:00:00Z'

Write-Host '→ [3/3] Inspecting the updated document:'
& pdfnative inspect --input (Join-Path $OutputDir 'updated.pdf') --format text
Write-Host "  ✓ Wrote $OutputDir\updated.pdf"
