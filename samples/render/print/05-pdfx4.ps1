# render/print/05-pdfx4.ps1 — a PDF/X-4 press file, checked, then broken on purpose (v1.5.0)
#
# 1. render --pdfx pdfx4 with the synthetic CMYK output profile, fonts embedded,
#    trapping state known, --strict so a conformance diagnostic fails the render;
# 2. inspect --pdfx prints the structural ISO 15930-7 report and --check pdfx
#    turns it into an exit code (0 = the prerequisites hold);
# 3. annotate a link onto the file: PDF/X forbids annotations in the print
#    area, so the same check now fails (exit 1, E_CHECK_FAILED under --json).

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\print'
$PrintDir  = Join-Path $RootDir 'samples\render\print'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering PDF/X-4'
& pdfnative render `
    --input  (Join-Path $PrintDir '05-pdfx4.json') `
    --output (Join-Path $OutputDir '05-pdfx4.pdf') `
    --pdfx pdfx4 `
    --output-intent-icc (Join-Path $PrintDir 'synthetic-cmyk.icc') `
    --output-intent-id 'Synthetic CMYK (pdfnative test profile)' `
    --trapped false `
    --font latin --lang latin `
    --strict `
    --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '→ Structural PDF/X-4 report'
& pdfnative inspect --input (Join-Path $OutputDir '05-pdfx4.pdf') --pdfx --format text | Select-String '^PDF/X'

Write-Host '→ Asserting the claim (CI-style)'
& pdfnative inspect --input (Join-Path $OutputDir '05-pdfx4.pdf') --check pdfx --json --summary
if ($LASTEXITCODE -eq 0) {
    Write-Host '  ✓ PASS — the ISO 15930-7 prerequisites hold.'
} else {
    Write-Host '  ✗ FAIL — see the report above.'
    exit 1
}

Write-Host '→ Breaking it: a link annotation inside the print area'
& pdfnative annotate `
    --input  (Join-Path $OutputDir '05-pdfx4.pdf') `
    --output (Join-Path $OutputDir '05-pdfx4-annotated.pdf') `
    --annotations (Join-Path $RootDir 'samples\annotate\02-links.json')
& pdfnative inspect --input (Join-Path $OutputDir '05-pdfx4-annotated.pdf') --check pdfx --json --fields pdfxConformance 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host '  ✗ unexpected: the annotated file still passes'
    exit 1
} else {
    Write-Host '  ✓ expected: the annotated file fails --check pdfx (exit 1)'
}
