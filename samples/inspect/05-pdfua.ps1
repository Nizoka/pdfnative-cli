# inspect/05-pdfua.ps1 — PDF/UA (ISO 14289-1) structural validation (pdfnative 1.3.0)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output'
$UaPdf     = Join-Path $OutputDir 'inspect\05-tagged.pdf'

New-Item -ItemType Directory -Force -Path (Split-Path $UaPdf) | Out-Null
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\document\01-minimal.json') `
  --output $UaPdf `
  --tagged pdfa2b

Write-Host '→ PDF/UA structural report (JSON):'
& pdfnative inspect --input $UaPdf --pdfua --format json

Write-Host '→ PDF/UA accessibility gate (--check pdfua):'
& pdfnative inspect --input $UaPdf --check pdfua --format text
if ($LASTEXITCODE -eq 0) {
    Write-Host '  ✓ PASS — structural prerequisites satisfied.'
} else {
    Write-Host '  ✗ FAIL — PDF/UA structural prerequisites not met (exit 1).'
}
