# sign/02-with-metadata.ps1 — Sign with reason / name / location / contact / signing-time

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output'
$SignOut   = Join-Path $OutputDir 'sign'
$KeysDir   = Join-Path $SignOut 'keys'
New-Item -ItemType Directory -Force -Path $SignOut | Out-Null

$UnsignedPdf = Join-Path $OutputDir 'document\02-report.pdf'
$SignedPdf   = Join-Path $SignOut   '02-with-metadata-signed.pdf'
$KeyFile     = Join-Path $KeysDir   'signing.key'
$CertFile    = Join-Path $KeysDir   'signing.crt'

if (-not (Test-Path $KeyFile) -or -not (Test-Path $CertFile)) {
    Write-Host '  ✗ Key or certificate missing. Run samples\sign\01-basic.ps1 first.'
    exit 1
}

if (-not (Test-Path $UnsignedPdf)) {
    Write-Host '→ Rendering source document…'
    New-Item -ItemType Directory -Force -Path (Split-Path $UnsignedPdf) | Out-Null
    & pdfnative render `
        --input  (Join-Path $RootDir 'samples\render\document\02-report.json') `
        --output $UnsignedPdf
}

Write-Host '→ Signing PDF with full metadata…'
& pdfnative sign `
    --input        $UnsignedPdf `
    --output       $SignedPdf `
    --key          $KeyFile `
    --cert         $CertFile `
    --reason       'Approved for distribution' `
    --name         'Jane Doe' `
    --location     'Paris, FR' `
    --contact      'compliance@example.com' `
    --signing-time '2026-04-28T10:00:00Z'

Write-Host "  ✓ Signed: $SignedPdf"
