# verify/06-online-revocation.ps1 — opt-in online revocation (OCSP/CRL)
#
# `verify` is OFFLINE by default. With --revocation online it additionally
# fetches OCSP (AIA) and CRL (CDP) endpoints — but only through the SSRF-guarded
# client (scheme allow-list, private/loopback/link-local/CGNAT/multicast
# blocking, no redirects, timeout + size caps). A self-signed demo cert has no
# revocation authority, so this runs OFFLINE and shows the online form as a hint.
#
# Prerequisites: samples\sign\01-basic.ps1 has produced a signed PDF.
#
# Usage:
#   pwsh -File samples\verify\06-online-revocation.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$SignedPdf = Join-Path $RootDir 'samples\output\sign\01-basic-signed.pdf'
$TrustCert = Join-Path $RootDir 'samples\output\sign\keys\signing.crt'

if (-not (Test-Path $SignedPdf)) {
  Write-Host '  ✗ Signed PDF not found. Run samples\sign\01-basic.ps1 first.'
  exit 1
}

Write-Host '→ Offline revocation (default, no network):'
& pdfnative verify `
  --input             $SignedPdf `
  --trust             $TrustCert `
  --revocation        offline `
  --revocation-policy soft-fail `
  --format            json

Write-Host ''
Write-Host 'Online variant (network; SSRF-guarded). Uncomment for a CA-issued'
Write-Host 'cert that publishes OCSP/CRL endpoints:'
Write-Host ''
Write-Host '  pdfnative verify --input <pdf> --trust <root> --revocation online --revocation-policy strict --format json'
Write-Host ''
Write-Host "Policy: soft-fail rejects only an explicit 'revoked'; strict rejects"
Write-Host "        any non-'good' status (including 'unknown')."

# --- Online invocation (disabled by default; requires AIA/CDP endpoints) -----
# & pdfnative verify `
#   --input             $SignedPdf `
#   --trust             $TrustCert `
#   --revocation        online `
#   --revocation-policy strict `
#   --format            json
