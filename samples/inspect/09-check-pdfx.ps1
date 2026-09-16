# inspect/09-check-pdfx.ps1 — assertion-style PDF/X-4 check (v1.5.0)
#
# --check pdfx runs pdfnative's structural ISO 15930-7 validator and sets the
# exit code (0 = the prerequisites hold, 1 = E_CHECK_FAILED). --pdfx adds the
# full { valid, errors, warnings } report; --fields keeps the verdict only.

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output'
$PrintDir  = Join-Path $RootDir 'samples\render\print'
$PdfxPdf   = Join-Path $OutputDir 'print\05-pdfx4.pdf'

if (-not (Test-Path $PdfxPdf)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $PdfxPdf) | Out-Null
    & pdfnative render `
        --input  (Join-Path $PrintDir '05-pdfx4.json') `
        --output $PdfxPdf `
        --pdfx pdfx4 --output-intent-icc (Join-Path $PrintDir 'synthetic-cmyk.icc') `
        --trapped false --font latin --lang latin --strict
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host '→ Token-economy verdict: inspect --pdfx --json --fields pdfxConformance,pdfx.valid'
& pdfnative inspect --input $PdfxPdf --pdfx --json --fields pdfxConformance,pdfx.valid

Write-Host "→ Asserting PDF/X-4 on $PdfxPdf"
& pdfnative inspect --input $PdfxPdf --check pdfx --format text | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host '  ✓ PASS — the file claims PDF/X-4 and the structural prerequisites hold.'
} else {
    Write-Host '  ✗ FAIL — the file is not a valid PDF/X-4 (see inspect --pdfx).'
    exit 1
}
