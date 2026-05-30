# verify/05-revocation.ps1 — timestamp + OCSP/CRL revocation reporting (v1.0.0)
#
# Demonstrates the LTV-aware verify report. By default revocation is checked
# OFFLINE (embedded /DSS only); for a self-signed test certificate there is no
# revocation authority, so `revocationStatus` is reported as "unknown".
#
# Prerequisites:
#   - samples/sign/01-basic.ps1 has produced a signed PDF (RSA-SHA256)
#
# Usage:
#   pwsh samples/verify/05-revocation.ps1

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Resolve-Path (Join-Path $ScriptDir '..\..')
$SignedPdf = Join-Path $RootDir 'samples\output\sign\01-basic-signed.pdf'
$TrustCert = Join-Path $RootDir 'samples\output\sign\keys\signing.crt'

if (-not (Test-Path $SignedPdf)) {
  Write-Host '  x Signed PDF not found. Run samples/sign/01-basic.ps1 first.'
  exit 1
}

Write-Host '-> Offline revocation (embedded /DSS only - the default):'
pdfnative verify `
  --input       $SignedPdf `
  --trust       $TrustCert `
  --revocation  offline `
  --format      json

Write-Host ''
Write-Host 'Report fields to look for:'
Write-Host '  timestampValid    - true once the PDF carries a valid RFC 3161 token'
Write-Host '  revocationChecked - false here (self-signed has no authority)'
Write-Host '  revocationStatus  - good | revoked | unknown'
Write-Host ''
Write-Host "Note: '--revocation online' additionally fetches OCSP (AIA) and CRL (CDP)"
Write-Host "      through the SSRF-guarded client. '--revocation-policy strict' fails"
Write-Host "      the signature on any non-'good' status."
