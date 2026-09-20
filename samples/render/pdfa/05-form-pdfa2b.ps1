# render/pdfa/05-form-pdfa2b.ps1 — an AcroForm under a PDF/A-2b claim (v1.5.0)
#
# pdfnative 1.8.0 gives the form fields the embedded Latin font as their default
# resources, so a PDF/A document may carry an interactive form. --strict proves
# that no diagnostic is raised; without --font the render reports
# PDFA_UNEMBEDDED_FORM_FONT.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   pwsh samples/render/pdfa/05-form-pdfa2b.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\pdfa'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering the archivable form'
& pdfnative render --input (Join-Path $ScriptDir '05-form-pdfa2b.json') --output (Join-Path $OutputDir '05-form-pdfa2b.pdf') --font latin --lang latin --strict --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ The claim, and the fields a filler sees'
& pdfnative inspect --input (Join-Path $OutputDir '05-form-pdfa2b.pdf') --check pdfa
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& pdfnative fill --input (Join-Path $OutputDir '05-form-pdfa2b.pdf') --export
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "✓ Done: $OutputDir"
