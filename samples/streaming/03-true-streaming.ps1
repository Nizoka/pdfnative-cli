# streaming/03-true-streaming.ps1 — true constant-memory streaming (pdfnative 1.3.0+)
#
# Demonstrates `--stream-true`: a true constant-memory generator that produces
# byte-identical output to the buffered renderer while never holding the whole
# PDF in memory. Same constraints as `--stream` (no TOC blocks, no `{pages}`).
#
# Usage:
#   pwsh -File samples\streaming\03-true-streaming.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\streaming'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ True constant-memory streaming render…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\document\05-technical-spec.json') `
  --output (Join-Path $OutputDir '03-true-streaming.pdf') `
  --stream-true `
  --compress

Write-Host "  ✓ Output: $OutputDir\03-true-streaming.pdf"
