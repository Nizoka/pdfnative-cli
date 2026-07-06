# annotate/01-annotate.ps1 — attach markup annotations to an existing PDF
#
# Renders a document, then layers three markup annotations onto page 1. The
# change is written with an incremental save, so the original bytes — and any
# existing signature — stay intact.
#
# Usage:
#   pwsh -File samples\annotate\01-annotate.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\annotate'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ [1/2] Rendering the base document…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\document\02-report.json') `
  --output (Join-Path $OutputDir 'base.pdf')

Write-Host '→ [2/2] Attaching markup annotations…'
& pdfnative annotate `
  --input       (Join-Path $OutputDir 'base.pdf') `
  --output      (Join-Path $OutputDir '01-annotated.pdf') `
  --annotations (Join-Path $RootDir 'samples\annotate\01-annotations.json')

Write-Host "  ✓ Output: $OutputDir\01-annotated.pdf"
Write-Host '→ Listing the annotations back out with inspect --annotations:'
& pdfnative inspect --input (Join-Path $OutputDir '01-annotated.pdf') --annotations --format text
