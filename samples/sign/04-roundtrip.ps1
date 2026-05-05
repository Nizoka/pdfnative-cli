# sign/04-roundtrip.ps1 — Full render → sign → verify pipeline
#
# Generates a self-signed RSA cert, renders an invoice, signs it, and asserts
# the resulting CMS signature is cryptographically valid.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH (Git for Windows / OpenSSL for Windows)
#
# Usage:
#   pwsh -File samples\sign\04-roundtrip.ps1
#
# Output: samples\output\sign\04-roundtrip-signed.pdf
# Exit code: 0 if signatureValid is true, 1 otherwise.

$ErrorActionPreference = 'Stop'

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir    = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir  = Join-Path $RootDir 'samples\output'
$SignOut    = Join-Path $OutputDir 'sign'
$KeysDir    = Join-Path $SignOut 'keys'

New-Item -ItemType Directory -Force -Path $SignOut | Out-Null
New-Item -ItemType Directory -Force -Path $KeysDir | Out-Null

$UnsignedPdf = Join-Path $SignOut '04-roundtrip-unsigned.pdf'
$SignedPdf   = Join-Path $SignOut '04-roundtrip-signed.pdf'
$KeyFile     = Join-Path $KeysDir 'roundtrip.key'
$CertFile    = Join-Path $KeysDir 'roundtrip.crt'
$ReportJson  = Join-Path $SignOut '04-roundtrip-report.json'

Write-Host '→ [1/3] Rendering invoice…'
& pdfnative render `
    --input  (Join-Path $RootDir 'samples\render\document\04-invoice.json') `
    --output $UnsignedPdf

if (-not (Test-Path $KeyFile) -or -not (Test-Path $CertFile)) {
    & openssl req -x509 -newkey rsa:2048 -keyout $KeyFile -out $CertFile `
        -days 365 -nodes `
        -subj '/CN=pdfnative Roundtrip Demo/O=pdfnative/C=US' 2>$null
}

Write-Host '→ [2/3] Signing…'
& pdfnative sign `
    --input  $UnsignedPdf `
    --output $SignedPdf `
    --key    $KeyFile `
    --cert   $CertFile `
    --reason 'Roundtrip demo'

Write-Host '→ [3/3] Verifying…'
& pdfnative verify `
    --input  $SignedPdf `
    --trust  $CertFile `
    --format json | Out-File -FilePath $ReportJson -Encoding utf8

Get-Content $ReportJson

$report = Get-Content $ReportJson -Raw | ConvertFrom-Json
$valid  = $report.signatures[0].signatureValid
if ($valid -ne $true) {
    Write-Host ''
    Write-Host "✗ FAILED: signatureValid is '$valid' (expected 'True')"
    exit 1
}
Write-Host ''
Write-Host '✓ Roundtrip OK: signatureValid=true'
