# render/inspect-layout/01-inspect-layout.ps1 — introspect the computed layout
#
#   • --inspect-layout  → emit a LayoutInspection JSON report instead of a PDF.
#   • --debug-layout    → render a PDF with debug guides (margins/content/cells).
#
# Usage:
#   pwsh -File samples\render\inspect-layout\01-inspect-layout.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\inspect-layout'
$Input     = Join-Path $RootDir 'samples\render\document\03-all-blocks.json'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ [1/2] Emitting the layout inspection report (JSON, no PDF)…'
& pdfnative render `
  --input          $Input `
  --output         (Join-Path $OutputDir '01-layout.json') `
  --inspect-layout

Write-Host "  ✓ Report: $OutputDir\01-layout.json"

Write-Host '→ [2/2] Rendering a PDF with debug guides overlaid…'
& pdfnative render `
  --input        $Input `
  --output       (Join-Path $OutputDir '02-debug.pdf') `
  --debug-layout margins,content,cells

Write-Host "  ✓ Output: $OutputDir\02-debug.pdf"
