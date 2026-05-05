# verify/03-cms-rsa.ps1 — verify CMS RSA-SHA256 signature value (v0.3.0)
#
# Demonstrates the v0.3.0 `signatureValid` / `signatureAlgorithm` fields in
# `pdfnative verify --format json` output.
#
# Prerequisites:
#   - samples\sign\01-basic.ps1 has produced a signed PDF (RSA-SHA256)
#
# Usage:
#   pwsh -File samples\verify\03-cms-rsa.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$SignedPdf = Join-Path $RootDir 'samples\output\sign\01-basic-signed.pdf'
$TrustCert = Join-Path $RootDir 'samples\output\sign\keys\signing.crt'

if (-not (Test-Path $SignedPdf)) {
    Write-Host "  ✗ Signed PDF not found. Run samples\sign\01-basic.ps1 first."
    exit 1
}

Write-Host "→ Verifying CMS RSA-SHA256 signature value of:"
Write-Host "  $SignedPdf"
Write-Host ''
& pdfnative verify `
    --input  $SignedPdf `
    --trust  $TrustCert `
    --format json

Write-Host ''
Write-Host 'Look for:'
Write-Host '  signatureAlgorithm: "rsa-sha256"'
Write-Host '  signatureValid:     true'
