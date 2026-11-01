# extract-text/03-rtl-logical-order.ps1 — untagged right-to-left text extracts as typed (v1.6.0)
#
# pdfnative ≥ 1.9.0 writes every untagged right-to-left run (and every shaped run
# whose glyph order differs from its text) as /Span /ActualText, so extract-text
# returns the logical string without --tagged. --actual-text false restores the
# bare 1.8.0 runs, for comparison: the letters come back in visual order.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   pwsh samples/extract-text/03-rtl-logical-order.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\extract-text'
$RenderDir = Join-Path $RootDir 'samples\render'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering Arabic and Hebrew paragraphs under --direction auto (untagged)'
& pdfnative render --input (Join-Path $RenderDir 'multilang\13-rtl-direction.json') --output (Join-Path $OutputDir '03-rtl.pdf') --direction auto --font ar --font he --font latin --lang 'ar,he,latin' --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ The same document with --actual-text false (the bare 1.8.0 runs)'
& pdfnative render --input (Join-Path $RenderDir 'multilang\13-rtl-direction.json') --output (Join-Path $OutputDir '03-rtl-bare.pdf') --direction auto --actual-text false --font ar --font he --font latin --lang 'ar,he,latin' --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ Logical order, as typed'
& pdfnative extract-text --input (Join-Path $OutputDir '03-rtl.pdf') --pages 1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ Bare runs: every letter is there, in visual order'
& pdfnative extract-text --input (Join-Path $OutputDir '03-rtl-bare.pdf') --pages 1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "✓ Done: $OutputDir"
