# sign/11-ltv-offline.ps1 — LTV from material you already hold, no network (v1.6.0)
#
# `ltv embed` takes the validation material straight from files (pdfnative ≥ 1.9.0
# composeLtvData): certificate chains (PEM or DER), OCSP responses and CRLs (DER),
# attributed to the document's signatures with --match all (every item from every
# VRI, the Adobe-tolerant superset) or --match chain (each VRI references only what
# validates that signature). Nothing here opens a socket — an air-gapped host can
# embed the material a connected host saved.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   pwsh samples/sign/11-ltv-offline.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\sign'
$Fixtures  = Join-Path $RootDir 'tests\fixtures'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host "→ [1/4] Rendering and signing with the repository's test key pair (demo only)"
& pdfnative render --input (Join-Path $RootDir 'samples\render\document\01-minimal.json') --output (Join-Path $OutputDir '11-source.pdf') --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& pdfnative sign --input (Join-Path $OutputDir '11-source.pdf') --output (Join-Path $OutputDir '11-signed.pdf') `
    --key (Join-Path $Fixtures 'rsa-key.pem') --cert (Join-Path $Fixtures 'rsa-cert.pem') --signing-time 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '→ [2/4] --dry-run composes the material and reports the counts, writes nothing'
& pdfnative ltv embed --input (Join-Path $OutputDir '11-signed.pdf') --output (Join-Path $OutputDir 'never.pdf') `
    --cert (Join-Path $Fixtures 'rsa-cert.pem') --match chain --dry-run --json
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '→ [3/4] Embedding the certificate as /DSS material (--match chain)'
& pdfnative ltv embed --input (Join-Path $OutputDir '11-signed.pdf') --output (Join-Path $OutputDir '11-ltv-offline.pdf') `
    --cert (Join-Path $Fixtures 'rsa-cert.pem') --match chain --json
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '→ [4/4] The signature inventory still verifies; add --ocsp <der> / --crl <der> for revocation material'
& pdfnative inspect --input (Join-Path $OutputDir '11-ltv-offline.pdf') --signatures --format json --fields signatures --pretty
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "✓ Done: $OutputDir"
