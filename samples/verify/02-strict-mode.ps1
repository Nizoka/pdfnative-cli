# verify/02-strict-mode.ps1 — --strict CI assertion mode

$ErrorActionPreference = 'Stop'

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir     = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$SignedPdf   = Join-Path $RootDir 'samples\output\sign\01-basic-signed.pdf'
$UnsignedPdf = Join-Path $RootDir 'samples\output\document\02-report.pdf'

if (-not (Test-Path $SignedPdf) -or -not (Test-Path $UnsignedPdf)) {
    Write-Host '  ✗ Required PDFs missing. Run samples\sign\01-basic.ps1 first.'
    exit 1
}

Write-Host '→ Strict verify on signed PDF (expect exit 0)…'
& pdfnative verify --input $SignedPdf --strict --format text
if ($LASTEXITCODE -ne 0) {
    Write-Host '  ✗ Unexpected failure on a valid self-signed PDF.'
    exit 1
}
Write-Host '  ✓ Pass.'
Write-Host ''

Write-Host '→ Strict verify on UNSIGNED PDF (expect exit 1)…'
$ErrorActionPreference = 'Continue'
& pdfnative verify --input $UnsignedPdf --strict --format text
if ($LASTEXITCODE -eq 0) {
    Write-Host '  ✗ Strict mode should have failed on an unsigned PDF.'
    exit 1
} else {
    Write-Host '  ✓ Correctly exited non-zero.'
}
