# inspect/04-check-pdfa.ps1 — assertion-style check (CI-friendly exit code)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output'
$PdfaPdf   = Join-Path $OutputDir 'pdfa\02-pdfa-2b.pdf'

if (-not (Test-Path $PdfaPdf)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $PdfaPdf) | Out-Null
    & pdfnative render `
        --input  (Join-Path $RootDir 'samples\render\pdfa\02-pdfa-2b.json') `
        --output $PdfaPdf
}

Write-Host "→ Asserting PDF/A conformance on $PdfaPdf"
& pdfnative inspect --input $PdfaPdf --check pdfa --format text
if ($LASTEXITCODE -eq 0) {
    Write-Host '  ✓ PASS — document declares PDF/A conformance.'
} else {
    Write-Host '  ✗ FAIL — document does not declare PDF/A conformance.'
    exit 1
}
