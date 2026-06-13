# inspect/06-check-signed-encrypted.ps1 — CI gates for --check signed / encrypted
#
# `inspect --check <property>` exits non-zero when the assertion fails, so it
# can gate a pipeline. Exercises --check encrypted (PASS), --check signed on an
# unsigned PDF (FAIL → exit 1), and --check signed on a signed PDF if present.
#
# Usage:
#   pwsh -File samples\inspect\06-check-signed-encrypted.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\inspect'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$PlainPdf  = Join-Path $OutputDir '06-plain.pdf'
$EncPdf    = Join-Path $OutputDir '06-encrypted.pdf'
$SignedPdf = Join-Path $RootDir 'samples\output\sign\01-basic-signed.pdf'
$Minimal   = Join-Path $RootDir 'samples\render\document\01-minimal.json'

& pdfnative render --input $Minimal --output $PlainPdf

if (-not $env:PDFNATIVE_ENCRYPT_OWNER_PASS) { $env:PDFNATIVE_ENCRYPT_OWNER_PASS = 'owner-secret' }
if (-not $env:PDFNATIVE_ENCRYPT_USER_PASS)  { $env:PDFNATIVE_ENCRYPT_USER_PASS  = 'open-sesame' }
& pdfnative render --input $Minimal --output $EncPdf --encrypt-algorithm aes128

Write-Host '→ --check encrypted on the encrypted PDF:'
& pdfnative inspect --input $EncPdf --check encrypted --format text | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host '  ✓ PASS — document is encrypted.' }
else { Write-Host '  ✗ FAIL — expected encrypted.'; exit 1 }

Write-Host '→ --check signed on the unsigned PDF (expected to fail):'
& pdfnative inspect --input $PlainPdf --check signed --format text | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host '  ✓ PASS — gate correctly rejected the unsigned document (exit 1).' }
else { Write-Host '  ✗ UNEXPECTED — unsigned document passed --check signed.'; exit 1 }

if (Test-Path $SignedPdf) {
  Write-Host "→ --check signed on $SignedPdf :"
  & pdfnative inspect --input $SignedPdf --check signed --format text | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host '  ✓ PASS — document is signed.' }
  else { Write-Host '  ✗ FAIL — expected signed.'; exit 1 }
} else {
  Write-Host '→ (skip) run samples\sign\01-basic.ps1 to also exercise --check signed PASS.'
}
