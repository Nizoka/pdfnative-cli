# verify/01-self-signed.ps1 — verify a self-signed PDF

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$SignedPdf = Join-Path $RootDir 'samples\output\sign\01-basic-signed.pdf'

if (-not (Test-Path $SignedPdf)) {
    Write-Host '  ✗ Signed PDF not found. Run samples\sign\01-basic.ps1 first.'
    exit 1
}

Write-Host "→ Verifying $SignedPdf"
Write-Host ''
& pdfnative verify --input $SignedPdf --format text

Write-Host ''
Write-Host 'JSON output (machine-readable):'
& pdfnative verify --input $SignedPdf --format json
