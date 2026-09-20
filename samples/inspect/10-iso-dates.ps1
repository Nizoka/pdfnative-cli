# inspect/10-iso-dates.ps1 — ISO 8601 dates instead of the raw PDF date string (v1.5.0)
#
# --iso-dates normalises metadata.creationDate (D:YYYYMMDDHHmmSS+HH'mm') to
# ISO 8601; the raw form stays the default.

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\inspect'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$Pdf = Join-Path $OutputDir 'dated.pdf'

& pdfnative render `
    --input  (Join-Path $RootDir 'samples\render\document\01-minimal.json') `
    --output $Pdf `
    --creation-date 2026-06-15T12:30:45Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '→ Raw PDF date string (default):'
& pdfnative inspect --input $Pdf --fields metadata.creationDate
Write-Host '→ ISO 8601 (--iso-dates):'
& pdfnative inspect --input $Pdf --iso-dates --fields metadata.creationDate
