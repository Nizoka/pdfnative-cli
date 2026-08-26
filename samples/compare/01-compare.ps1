# compare/01-compare.ps1 — text/structure diff of two PDFs (pdfnative-cli 1.4.0)
#
# Renders two near-identical contracts (one clause changed), then compares
# them. `compare` exits 1 (E_CHECK_FAILED) when differences are found — that
# non-zero exit is the FEATURE (CI-friendly), so this script checks
# $LASTEXITCODE explicitly. A visual/pixel diff is out of scope: compare works
# on text and structure, never rendered pixels.
#
# Usage:
#   pwsh -File samples\compare\01-compare.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\compare'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ [1/4] Rendering version A…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\compare\document-a.json') `
  --output (Join-Path $OutputDir 'contract-a.pdf')

Write-Host '→ [2/4] Rendering version B (one clause changed)…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\compare\document-b.json') `
  --output (Join-Path $OutputDir 'contract-b.pdf')

Write-Host '→ [3/4] Comparing A vs B (differences expected — exit 1 is the signal):'
& pdfnative compare (Join-Path $OutputDir 'contract-a.pdf') (Join-Path $OutputDir 'contract-b.pdf')
if ($LASTEXITCODE -ne 0) {
  Write-Host "  ✓ compare exited $LASTEXITCODE — differences detected, as expected for CI gating"
} else {
  Write-Host '  ✗ unexpected: the documents were reported identical'
  exit 1
}

Write-Host '→ [4/4] Comparing A vs A (identical — exit 0):'
& pdfnative compare (Join-Path $OutputDir 'contract-a.pdf') (Join-Path $OutputDir 'contract-a.pdf')
if ($LASTEXITCODE -ne 0) {
  Write-Host "  ✗ unexpected: identical documents exited $LASTEXITCODE"
  exit 1
}
Write-Host '  ✓ identical documents exit 0'
