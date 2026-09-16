# sign/10-timestamp-timeout.ps1 — a per-request TSA timeout (v1.5.0)
#
# --timestamp-timeout <ms> bounds the guarded HTTP request to the time-stamp
# authority (default 10000). A timeout aborts with E_NETWORK — never a silent
# untimestamped signature. --dry-run never contacts the TSA.

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\sign'
$Fixtures  = Join-Path $RootDir 'tests\fixtures'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$TsaUrl = if ($env:PDFNATIVE_TSA_URL) { $env:PDFNATIVE_TSA_URL } else { 'https://tsa.example.invalid/tsr' }

& pdfnative render --input (Join-Path $RootDir 'samples\render\document\01-minimal.json') --output (Join-Path $OutputDir 'doc.pdf')

Write-Host '→ --dry-run validates the flags (URL, digest, timeout) and never opens a socket'
& pdfnative sign --input (Join-Path $OutputDir 'doc.pdf') --output (Join-Path $OutputDir 'never.pdf') `
    --key (Join-Path $Fixtures 'rsa-key.pem') --cert (Join-Path $Fixtures 'rsa-cert.pem') `
    --timestamp $TsaUrl --timestamp-timeout 3000 --dry-run --json

if (-not $env:PDFNATIVE_TSA_URL) {
    Write-Host 'PDFNATIVE_TSA_URL is not set — skipping the real request.'
    exit 0
}
Write-Host '→ Signing with a 15 s budget for the TSA round trip'
& pdfnative sign --input (Join-Path $OutputDir 'doc.pdf') --output (Join-Path $OutputDir 'timestamped.pdf') `
    --key (Join-Path $Fixtures 'rsa-key.pem') --cert (Join-Path $Fixtures 'rsa-cert.pem') `
    --profile pades --timestamp $env:PDFNATIVE_TSA_URL --timestamp-timeout 15000 --json
