# render/print/09-dual-pdfa2b-pdfx4.ps1 — PDF/A-2b and PDF/X-4 in one file (v1.6.0)
#
# pdfnative ≥ 1.9.0 claims PDF/A-2b (or 2u) and PDF/X-4 together: pdfaid and
# pdfxid in the XMP, two OutputIntents on one CMYK profile. inspect --check
# pdfa,pdfx asserts both; the PDF/A-1b pairing is refused by the engine (E_INPUT).
#
# Usage:
#   pwsh samples/render/print/09-dual-pdfa2b-pdfx4.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\print'
$PrintDir  = Join-Path $RootDir 'samples\render\print'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering PDF/A-2b + PDF/X-4'
& pdfnative render `
    --input  (Join-Path $PrintDir '09-dual-pdfa2b-pdfx4.json') `
    --output (Join-Path $OutputDir '09-dual-pdfa2b-pdfx4.pdf') `
    --pdfx pdfx4 `
    --tagged pdfa2b `
    --output-intent-icc (Join-Path $PrintDir 'synthetic-cmyk.icc') `
    --output-intent-id 'Synthetic CMYK (pdfnative test profile)' `
    --trapped false `
    --font latin --lang latin `
    --strict `
    --json `
    --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '→ Both claims, one exit code'
& pdfnative inspect --input (Join-Path $OutputDir '09-dual-pdfa2b-pdfx4.pdf') --check pdfa,pdfx --json --summary
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '→ PDF/A-1b with PDF/X-4 is refused by the engine (E_INPUT), shown with --dry-run'
& pdfnative render --input (Join-Path $PrintDir '09-dual-pdfa2b-pdfx4.json') --output (Join-Path $OutputDir 'never.pdf') --dry-run --json `
    --pdfx pdfx4 --tagged pdfa1b --output-intent-icc (Join-Path $PrintDir 'synthetic-cmyk.icc') --trapped false --font latin --lang latin 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host '  ✗ unexpected: PDF/A-1b + PDF/X-4 was accepted'
    exit 1
} else {
    Write-Host '  ✓ expected: refused (E_INPUT)'
}
Write-Host "✓ Done: $OutputDir"
