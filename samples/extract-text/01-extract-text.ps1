# extract-text/01-extract-text.ps1 — extract reading-order text (pdfnative 1.6.0)
#
# Renders a two-page document, then extracts its text as plain text, JSON, and
# NDJSON (one JSON object per line) — the NDJSON form streams cleanly into an
# agent / RAG pipeline.
#
# Usage:
#   pwsh -File samples\extract-text\01-extract-text.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\extract-text'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ [1/4] Rendering a two-page source…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\extract-text\document.json') `
  --output (Join-Path $OutputDir 'source.pdf')

Write-Host '→ [2/4] Plain text:'
& pdfnative extract-text --input (Join-Path $OutputDir 'source.pdf') |
  Tee-Object -FilePath (Join-Path $OutputDir 'text.txt')

Write-Host '→ [3/4] JSON (page 2 only):'
& pdfnative extract-text --input (Join-Path $OutputDir 'source.pdf') --format json --pages 2 --pretty

Write-Host '→ [4/4] NDJSON (all pages, with positioned runs):'
& pdfnative extract-text --input (Join-Path $OutputDir 'source.pdf') --format ndjson --runs |
  Set-Content -Path (Join-Path $OutputDir 'pages.ndjson')
Write-Host "  ✓ Wrote $OutputDir\pages.ndjson"
