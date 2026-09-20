# render/base14/01-exact-metrics.ps1 — layout.typography.metrics "exact" on the base-14 path (v1.5.0)
#
# No --font flag on purpose: metrics "exact" measures Helvetica with the Adobe
# Core 14 widths and is inert once a registered font measures the text - the
# second render shows it.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   pwsh samples/render/base14/01-exact-metrics.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\base14'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering with exact metrics'
& pdfnative render --input (Join-Path $ScriptDir '01-exact-metrics.json') --output (Join-Path $OutputDir '01-exact-metrics.pdf') --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ The same document with a registered font: the option no longer acts'
& pdfnative render --input (Join-Path $ScriptDir '01-exact-metrics.json') --output (Join-Path $OutputDir '01-exact-metrics-latin.pdf') --font latin --lang latin --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "✓ Done: $OutputDir"
