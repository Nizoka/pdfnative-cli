# sign/07-native-crypto.ps1 — native (node:crypto) vs pure-JS signing
#
# As of pdfnative-cli 1.2.0, `sign` uses Node's built-in node:crypto for the
# RSA/ECDSA signature by DEFAULT (constant-time). `--pure-crypto` forces the
# portable pure-JS bignum path. Both produce a valid CMS signature.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH
#
# Usage:
#   pwsh -File samples\sign\07-native-crypto.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$SignOut   = Join-Path $RootDir 'samples\output\sign'
$KeysDir   = Join-Path $SignOut 'keys'

New-Item -ItemType Directory -Force -Path $SignOut, $KeysDir | Out-Null

$Unsigned = Join-Path $SignOut '07-unsigned.pdf'
$Native   = Join-Path $SignOut '07-native-signed.pdf'
$Pure     = Join-Path $SignOut '07-pure-signed.pdf'
$KeyFile  = Join-Path $KeysDir 'native.key'
$CertFile = Join-Path $KeysDir 'native.crt'

Write-Host '→ [1/4] Rendering + key material…'
& pdfnative render --input (Join-Path $RootDir 'samples\render\document\02-report.json') --output $Unsigned
if (-not (Test-Path $KeyFile) -or -not (Test-Path $CertFile)) {
    & openssl req -x509 -newkey rsa:2048 -keyout $KeyFile -out $CertFile `
        -days 365 -nodes -subj '/CN=pdfnative Native Crypto Demo/O=pdfnative/C=US' 2>$null
}

Write-Host '→ [2/4] Signing with native node:crypto (default)…'
& pdfnative sign --input $Unsigned --output $Native --key $KeyFile --cert $CertFile

Write-Host '→ [3/4] Signing with pure-JS crypto (--pure-crypto)…'
& pdfnative sign --input $Unsigned --output $Pure --key $KeyFile --cert $CertFile --pure-crypto

Write-Host '→ [4/4] Verifying both signatures…'
& pdfnative verify --input $Native --trust $CertFile --summary
& pdfnative verify --input $Pure   --trust $CertFile --summary

Write-Host "  ✓ Native: $Native"
Write-Host "  ✓ Pure:   $Pure"
