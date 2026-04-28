# render/encryption/01-aes128-protected.ps1 — render an AES-128 encrypted PDF
#
# Usage:
#   pwsh -File samples\render\encryption\01-aes128-protected.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\encryption'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

if (-not $env:PDFNATIVE_ENCRYPT_OWNER_PASS) { $env:PDFNATIVE_ENCRYPT_OWNER_PASS = 'owner-secret' }
if (-not $env:PDFNATIVE_ENCRYPT_USER_PASS)  { $env:PDFNATIVE_ENCRYPT_USER_PASS  = 'open-sesame' }

Write-Host '→ Rendering AES-128 encrypted PDF…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\encryption\01-aes128-protected.json') `
  --output (Join-Path $OutputDir '01-aes128-protected.pdf') `
  --encrypt-algorithm aes128 `
  --encrypt-permissions 'print'

Write-Host "  ✓ Output: $OutputDir\01-aes128-protected.pdf"
Write-Host ''
Write-Host 'Verify it is encrypted:'
Write-Host "  pdfnative inspect --input `"$OutputDir\01-aes128-protected.pdf`" --check encrypted"
