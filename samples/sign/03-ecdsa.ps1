# sign/03-ecdsa.ps1 — Sign a rendered PDF with an ECDSA-SHA256 (P-256) certificate
#
# Demonstrates the v0.3.0 --algorithm ecdsa-sha256 flag.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH (Git for Windows / OpenSSL for Windows)
#
# Usage:
#   pwsh -File samples\sign\03-ecdsa.ps1
#
# Output: samples\output\sign\03-ecdsa-signed.pdf

$ErrorActionPreference = 'Stop'

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir    = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir  = Join-Path $RootDir 'samples\output'
$SignOut    = Join-Path $OutputDir 'sign'
$KeysDir    = Join-Path $SignOut 'keys'

New-Item -ItemType Directory -Force -Path $SignOut | Out-Null
New-Item -ItemType Directory -Force -Path $KeysDir | Out-Null

$UnsignedPdf = Join-Path $OutputDir 'document\02-report.pdf'
$SignedPdf   = Join-Path $SignOut   '03-ecdsa-signed.pdf'
$KeyFile     = Join-Path $KeysDir   'ecdsa.key'
$CertFile    = Join-Path $KeysDir   'ecdsa.crt'

if (-not (Test-Path $UnsignedPdf)) {
    Write-Host '→ Rendering source document…'
    New-Item -ItemType Directory -Force -Path (Split-Path $UnsignedPdf) | Out-Null
    & pdfnative render `
        --input  (Join-Path $RootDir 'samples\render\document\02-report.json') `
        --output $UnsignedPdf
    Write-Host "  ✓ Rendered: $UnsignedPdf"
}

if (-not (Test-Path $KeyFile) -or -not (Test-Path $CertFile)) {
    Write-Host '→ Generating self-signed P-256 certificate (demo)…'
    & openssl ecparam -name prime256v1 -genkey -noout -out $KeyFile 2>$null
    & openssl req -new -x509 -key $KeyFile -out $CertFile `
        -days 365 -sha256 `
        -subj '/CN=pdfnative ECDSA Demo/O=pdfnative/C=US' 2>$null
    Write-Host "  ✓ Key:  $KeyFile"
    Write-Host "  ✓ Cert: $CertFile"
}

Write-Host '→ Signing PDF with ECDSA-SHA256…'
& pdfnative sign `
    --input     $UnsignedPdf `
    --output    $SignedPdf `
    --key       $KeyFile `
    --cert      $CertFile `
    --algorithm ecdsa-sha256

Write-Host "  ✓ Signed: $SignedPdf"
Write-Host ''
Write-Host 'Verify with:'
Write-Host "  pdfnative verify --input `"$SignedPdf`" --format json"
