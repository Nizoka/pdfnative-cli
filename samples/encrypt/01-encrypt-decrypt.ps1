# encrypt/01-encrypt-decrypt.ps1 — re-secure and unlock a PDF (pdfnative 1.6.0)
#
# Encrypts a document with AES-256 (owner + user passwords), confirms the
# scheme with `inspect --encryption`, then decrypts it back to plaintext.
# Passwords are read from environment variables (winning over flags).
#
# NOTE: encrypt/decrypt rebuild the page tree (like `merge`), so signatures and
# form fields are dropped. Requires a Web Crypto CSPRNG (Node >= 20).
#
# Usage:
#   pwsh -File samples\encrypt\01-encrypt-decrypt.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\encrypt'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ [1/4] Rendering a source document…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\extract-text\document.json') `
  --output (Join-Path $OutputDir 'source.pdf')

# Set the encryption passwords AFTER rendering — `render` itself would encrypt
# its output if these were set beforehand.
$env:PDFNATIVE_ENCRYPT_OWNER_PASS = 'owner-secret'
$env:PDFNATIVE_ENCRYPT_USER_PASS  = 'open-sesame'

Write-Host '→ [2/4] Encrypting with AES-256 (passwords from env)…'
& pdfnative encrypt `
  --input      (Join-Path $OutputDir 'source.pdf') `
  --output     (Join-Path $OutputDir 'encrypted.pdf') `
  --algorithm  aes-256 `
  --permissions print

Write-Host '→ [3/4] Confirming the encryption scheme…'
& pdfnative inspect --input (Join-Path $OutputDir 'encrypted.pdf') `
  --encryption --password $env:PDFNATIVE_ENCRYPT_USER_PASS --format text

Write-Host '→ [4/4] Decrypting back to plaintext…'
& pdfnative decrypt `
  --input    (Join-Path $OutputDir 'encrypted.pdf') `
  --output   (Join-Path $OutputDir 'decrypted.pdf') `
  --password $env:PDFNATIVE_ENCRYPT_USER_PASS
& pdfnative inspect --input (Join-Path $OutputDir 'decrypted.pdf') --encryption --format text
Write-Host "  ✓ Outputs in $OutputDir"

# Tip: add --stream (with an optional --chunk-size N) to encrypt/decrypt a large
# PDF at constant memory, e.g.:
#   pdfnative encrypt --input big.pdf --owner-password $env:PDFNATIVE_ENCRYPT_OWNER_PASS `
#     --algorithm aes-256 --stream --output big.enc.pdf
