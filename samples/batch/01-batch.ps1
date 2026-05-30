# batch/01-batch.ps1 — render a directory of JSON files in parallel (v1.0.0)
#
# Demonstrates the `batch` command: every *.json in --input-dir is rendered to
# --output-dir/<name>.pdf, reusing the full render pipeline.
#
# Usage:
#   pwsh samples/batch/01-batch.ps1

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Resolve-Path (Join-Path $ScriptDir '..')
$InDir     = Join-Path $RootDir 'render\document'
$OutDir    = Join-Path $RootDir 'output\batch'

Write-Host '-> Batch-rendering every *.json in:'
Write-Host "  $InDir"
Write-Host ''
pdfnative batch `
  --input-dir   $InDir `
  --output-dir  $OutDir `
  --concurrency 4 `
  --compress `
  --format      json

Write-Host ''
Write-Host "  OK PDFs written to $OutDir (exit code is 1 if any file fails)."
