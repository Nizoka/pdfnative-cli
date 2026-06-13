# render/watermark/03-cli-flags.ps1 — apply a watermark purely from the CLI
#
# Demonstrates the full --watermark-* flag surface. The input JSON contains no
# watermark of its own; the diagonal stamp is layered on from the command line.
#
# Usage:
#   pwsh -File samples\render\watermark\03-cli-flags.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\watermark'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering with a CLI-driven watermark…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\watermark\03-cli-flags.json') `
  --output (Join-Path $OutputDir '03-cli-flags.pdf') `
  --watermark-text      'CONFIDENTIAL' `
  --watermark-opacity   0.15 `
  --watermark-angle     45 `
  --watermark-color     '#FF3B30' `
  --watermark-font-size 64 `
  --watermark-position  background

Write-Host "  ✓ Output: $OutputDir\03-cli-flags.pdf"
