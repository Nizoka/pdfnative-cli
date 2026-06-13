# sign/05-cert-chain.ps1 — sign with an intermediate certificate chain
#
# Builds a tiny two-level PKI (root CA → signer), signs a PDF with the signer
# certificate, embeds the CA via --cert-chain, and verifies against the root.
#
# Prerequisites: openssl on PATH.
#
# Usage:
#   pwsh -File samples\sign\05-cert-chain.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir    = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir  = Join-Path $RootDir 'samples\output'
$SignOut    = Join-Path $OutputDir 'sign'
$KeysDir    = Join-Path $SignOut 'keys\chain'

New-Item -ItemType Directory -Force -Path $SignOut, $KeysDir | Out-Null

$UnsignedPdf = Join-Path $OutputDir 'document\04-invoice.pdf'
$SignedPdf   = Join-Path $SignOut '05-cert-chain-signed.pdf'
$CaKey   = Join-Path $KeysDir 'ca.key'
$CaCert  = Join-Path $KeysDir 'ca.crt'
$LeafKey = Join-Path $KeysDir 'signer.key'
$LeafCsr = Join-Path $KeysDir 'signer.csr'
$LeafCert= Join-Path $KeysDir 'signer.crt'

if (-not (Test-Path $UnsignedPdf)) {
  Write-Host '→ Rendering source document…'
  New-Item -ItemType Directory -Force -Path (Join-Path $OutputDir 'document') | Out-Null
  & pdfnative render `
    --input  (Join-Path $RootDir 'samples\render\document\04-invoice.json') `
    --output $UnsignedPdf
}

if (-not (Test-Path $LeafCert)) {
  Write-Host '→ Building demo PKI (root CA → signer)…'
  & openssl req -x509 -newkey rsa:2048 -keyout $CaKey -out $CaCert `
    -days 3650 -nodes -subj '/CN=pdfnative Demo Root CA/O=pdfnative/C=US' `
    -addext 'basicConstraints=critical,CA:TRUE' 2>$null
  & openssl req -newkey rsa:2048 -keyout $LeafKey -out $LeafCsr `
    -nodes -subj '/CN=pdfnative Demo Signer/O=pdfnative/C=US' 2>$null
  & openssl x509 -req -in $LeafCsr -CA $CaCert -CAkey $CaKey `
    -CAcreateserial -out $LeafCert -days 825 -sha256 2>$null
  Write-Host "  ✓ Root CA: $CaCert"
  Write-Host "  ✓ Signer:  $LeafCert"
}

Write-Host '→ Signing with --cert-chain…'
& pdfnative sign `
  --input      $UnsignedPdf `
  --output     $SignedPdf `
  --key        $LeafKey `
  --cert       $LeafCert `
  --cert-chain $CaCert `
  --reason     'Issued under demo root CA'

Write-Host "  ✓ Signed: $SignedPdf"

Write-Host '→ Verifying against the root CA…'
& pdfnative verify `
  --input  $SignedPdf `
  --trust  $CaCert `
  --format text

Write-Host ''
Write-Host 'Expect: chain builds to the trusted root and the signature is valid.'
