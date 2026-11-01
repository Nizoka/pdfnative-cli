# render/print/08-spot-colours.ps1 — spot colours under PDF/X-4 (v1.6.0)
#
# 1. render --pdfx pdfx4 the spot-colour brochure: the inks are declared in
#    layout.print.spotColours, the colours { spot } / { inks } paint through
#    /Separation and /DeviceN spaces, and a chart paints each bar in its plate's
#    ink (ChartSeries.colors, pdfnative ≥ 1.9.0);
# 2. inspect --check pdfx asserts the ISO 15930-7 prerequisites still hold;
# 3. an undeclared ink is refused before anything is written — shown with --dry-run.
#
# Usage:
#   pwsh samples/render/print/08-spot-colours.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\print'
$PrintDir  = Join-Path $RootDir 'samples\render\print'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering the spot-colour brochure as PDF/X-4'
& pdfnative render `
    --input  (Join-Path $PrintDir '08-spot-colours.json') `
    --output (Join-Path $OutputDir '08-spot-colours.pdf') `
    --pdfx pdfx4 `
    --output-intent-icc (Join-Path $PrintDir 'synthetic-cmyk.icc') `
    --output-intent-id 'Synthetic CMYK (pdfnative test profile)' `
    --trapped false `
    --font latin --lang latin `
    --strict `
    --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '→ Asserting the PDF/X-4 claim (CI-style)'
& pdfnative inspect --input (Join-Path $OutputDir '08-spot-colours.pdf') --check pdfx --json --summary
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '→ An undeclared ink is E_INPUT, before any byte is written (--dry-run)'
$undeclared = Join-Path $OutputDir '08-undeclared.json'
Set-Content -Path $undeclared -Value '{"title":"Undeclared","blocks":[{"type":"paragraph","text":"x","color":{"spot":"PANTONE 7 C"}}],"layout":{"print":{"bleed":8.5,"spotColours":[{"name":"PANTONE 300 C","alternate":[100,44,0,0]}]}}}' -NoNewline
& pdfnative render --input $undeclared --output (Join-Path $OutputDir 'never.pdf') --dry-run --json --font latin --lang latin 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host '  ✗ unexpected: the undeclared ink was accepted'
    exit 1
} else {
    Write-Host '  ✓ expected: refused (E_INPUT)'
}
Write-Host "✓ Done: $OutputDir"
