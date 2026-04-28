# render/headers-footers/01-page-numbers.ps1 — page templates demo
#
# Usage:
#   pwsh -File samples\render\headers-footers\01-page-numbers.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\headers-footers'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering with header & footer templates…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\headers-footers\01-page-numbers.json') `
  --output (Join-Path $OutputDir '01-page-numbers.pdf') `
  --header-left   '{title}' `
  --header-right  '{date}' `
  --footer-center 'Page {page} of {pages}'

Write-Host "  ✓ Output: $OutputDir\01-page-numbers.pdf"
