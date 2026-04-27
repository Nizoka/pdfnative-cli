# sign/01-basic.ps1 — Sign a rendered PDF with a self-signed certificate
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH (ships with Git for Windows / OpenSSL for Windows)
#
# Usage:
#   pwsh -File samples\sign\01-basic.ps1
#
# Output: samples\output\sign\01-basic-signed.pdf

$ErrorActionPreference = 'Stop'

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir    = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir  = Join-Path $RootDir 'samples\output'
$SignOut    = Join-Path $OutputDir 'sign'
$KeysDir   = Join-Path $SignOut 'keys'

New-Item -ItemType Directory -Force -Path $SignOut  | Out-Null
New-Item -ItemType Directory -Force -Path $KeysDir  | Out-Null

$UnsignedPdf = Join-Path $OutputDir 'document\02-report.pdf'
$SignedPdf   = Join-Path $SignOut   '01-basic-signed.pdf'
$KeyFile     = Join-Path $KeysDir  'signing.key'
$CertFile    = Join-Path $KeysDir  'signing.crt'

# ── Step 1: render the source document (if not already rendered) ────────────
if (-not (Test-Path $UnsignedPdf)) {
    Write-Host '→ Rendering source document…'
    New-Item -ItemType Directory -Force -Path (Split-Path $UnsignedPdf) | Out-Null
    & pdfnative render `
        --input  (Join-Path $RootDir 'samples\render\document\02-report.json') `
        --output $UnsignedPdf
    Write-Host "  ✓ Rendered: $UnsignedPdf"
}

# ── Step 2: generate self-signed certificate (for demo only) ────────────────
if (-not (Test-Path $KeyFile) -or -not (Test-Path $CertFile)) {
    Write-Host '→ Generating self-signed certificate (demo)…'
    & openssl req -x509 -newkey rsa:2048 `
        -keyout $KeyFile -out $CertFile `
        -days 365 -nodes `
        -subj '/CN=pdfnative Demo/O=pdfnative/C=US' 2>$null
    Write-Host "  ✓ Key:  $KeyFile"
    Write-Host "  ✓ Cert: $CertFile"
}

# ── Step 3: sign the PDF ────────────────────────────────────────────────────
Write-Host '→ Signing PDF…'
& pdfnative sign `
    --input  $UnsignedPdf `
    --output $SignedPdf `
    --key    $KeyFile `
    --cert   $CertFile

Write-Host "  ✓ Signed: $SignedPdf"
Write-Host ''
Write-Host 'Done. Verify the signature with:'
Write-Host "  pdfnative inspect --input `"$SignedPdf`" --format json | Select-String -Pattern 'sign'"
