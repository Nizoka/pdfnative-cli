# verify/04-cms-ecdsa.ps1 — verify CMS ECDSA-SHA256 signature value (v0.3.0)
#
# Prerequisites:
#   - samples\sign\03-ecdsa.ps1 has produced an ECDSA-signed PDF
#
# Usage:
#   pwsh -File samples\verify\04-cms-ecdsa.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$SignedPdf = Join-Path $RootDir 'samples\output\sign\03-ecdsa-signed.pdf'
$TrustCert = Join-Path $RootDir 'samples\output\sign\keys\ecdsa.crt'

if (-not (Test-Path $SignedPdf)) {
    Write-Host "  ✗ ECDSA-signed PDF not found. Run samples\sign\03-ecdsa.ps1 first."
    exit 1
}

Write-Host "→ Verifying CMS ECDSA-SHA256 signature value of:"
Write-Host "  $SignedPdf"
Write-Host ''
& pdfnative verify `
    --input  $SignedPdf `
    --trust  $TrustCert `
    --format json

Write-Host ''
Write-Host 'Look for:'
Write-Host '  signatureAlgorithm: "ecdsa-sha256"'
Write-Host '  signatureValid:     true'
