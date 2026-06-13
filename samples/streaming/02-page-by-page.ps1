# streaming/02-page-by-page.ps1 — page-by-page streaming (pdfnative 1.2.0+)
#
# Demonstrates `--stream-page-by-page`: the PDF is emitted one page at a time,
# keeping peak memory bounded by a single page rather than the whole document.
# Unlike `--stream`, this mode reflows across page boundaries (it does NOT
# support TOC blocks, which require multi-pass pagination).
#
# Usage:
#   pwsh -File samples\streaming\02-page-by-page.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\streaming'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Page-by-page streaming render…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\document\05-technical-spec.json') `
  --output (Join-Path $OutputDir '02-page-by-page.pdf') `
  --stream-page-by-page `
  --compress

Write-Host "  ✓ Output: $OutputDir\02-page-by-page.pdf"
