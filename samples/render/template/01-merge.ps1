# render/template/01-merge.ps1 — Deep-merge template + override (v0.3.0)
#
# Demonstrates `--template base.json` + `--input override.json`.
#
# Usage: pwsh -File samples\render\template\01-merge.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutDir    = Join-Path $RootDir 'samples\output\template'

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

& pdfnative render `
    --template (Join-Path $ScriptDir 'base.json') `
    --input    (Join-Path $ScriptDir 'override.json') `
    --output   (Join-Path $OutDir   '01-merge.pdf')

Write-Host "✓ Rendered: $(Join-Path $OutDir '01-merge.pdf')"
Write-Host "  Inspect metadata: pdfnative inspect --input `"$(Join-Path $OutDir '01-merge.pdf')`" --format text"
