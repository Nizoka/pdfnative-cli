# render/print/03-cmyk-colours.ps1 — CMYK colours in every colour option (v1.5.0)
#
# pdfnative 1.8.0 accepts CMYK wherever a colour goes: [c, m, y, k] in percent
# or a "c m y k" operand string (0-1) - text, tables, zebra rows, chart series.
# The second render claims PDF/A-2b with the default sRGB intent: device CMYK
# contradicts it, and the render says so (PDFA_DEVICE_CMYK_CONTENT).
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   pwsh samples/render/print/03-cmyk-colours.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\print'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering the CMYK document'
& pdfnative render --input (Join-Path $ScriptDir '03-cmyk-colours.json') --output (Join-Path $OutputDir '03-cmyk-colours.pdf') --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ The same colours under a PDF/A-2b claim: a warning, not an error'
& pdfnative render --input (Join-Path $ScriptDir '03-cmyk-colours.json') --output (Join-Path $OutputDir '03-cmyk-colours-pdfa.pdf') --tagged pdfa2b --font latin --lang latin --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ --strict turns the warning into a failure (exit 1, E_CHECK_FAILED)'
& pdfnative render --input (Join-Path $ScriptDir '03-cmyk-colours.json') --output (Join-Path $OutputDir '03-cmyk-colours-strict.pdf') --tagged pdfa2b --font latin --lang latin --strict
if ($LASTEXITCODE -eq 0) { Write-Host '  ✗ expected a refusal'; exit 1 }
Write-Host '  ✓ refused, as expected'
Write-Host "✓ Done: $OutputDir"
exit 0
