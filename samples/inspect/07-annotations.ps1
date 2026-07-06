# inspect/07-annotations.ps1 — list a PDF's markup & link annotations
#
# `inspect --annotations` enumerates markup annotations (highlight, text note,
# square, …) and link annotations. Page labels are reported automatically when
# present.
#
# Usage:
#   pwsh -File samples\inspect\07-annotations.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\inspect'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ [1/3] Rendering a base document…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\document\02-report.json') `
  --output (Join-Path $OutputDir '07-base.pdf')

Write-Host '→ [2/3] Attaching markup annotations…'
& pdfnative annotate `
  --input       (Join-Path $OutputDir '07-base.pdf') `
  --output      (Join-Path $OutputDir '07-annotated.pdf') `
  --annotations (Join-Path $RootDir 'samples\annotate\01-annotations.json')

Write-Host '→ [3/3] Listing the annotations (JSON)…'
& pdfnative inspect `
  --input       (Join-Path $OutputDir '07-annotated.pdf') `
  --annotations `
  --format json
