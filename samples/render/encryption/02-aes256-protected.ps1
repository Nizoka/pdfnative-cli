# render/encryption/02-aes256-protected.ps1 — render an AES-256 encrypted PDF
#
# Usage:
#   pwsh -File samples\render\encryption\02-aes256-protected.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\encryption'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

if (-not $env:PDFNATIVE_ENCRYPT_OWNER_PASS) { $env:PDFNATIVE_ENCRYPT_OWNER_PASS = 'owner-secret' }
if (-not $env:PDFNATIVE_ENCRYPT_USER_PASS)  { $env:PDFNATIVE_ENCRYPT_USER_PASS  = 'open-sesame' }

Write-Host '→ Rendering AES-256 encrypted PDF…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\encryption\02-aes256-protected.json') `
  --output (Join-Path $OutputDir '02-aes256-protected.pdf') `
  --encrypt-algorithm aes256 `
  --encrypt-permissions 'print'

Write-Host "  ✓ Output: $OutputDir\02-aes256-protected.pdf"
Write-Host ''
Write-Host 'Verify it is encrypted:'
Write-Host "  pdfnative inspect --input `"$OutputDir\02-aes256-protected.pdf`" --check encrypted"
