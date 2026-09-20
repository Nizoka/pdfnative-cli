# extract-text/02-actualtext.ps1 — tagged output returns the source text of shaped scripts (v1.5.0)
#
# Shaping reorders and merges glyphs (reph, pre-base vowel signs, conjuncts), so the
# glyph order of a page is not its reading order. Under --tagged pdfnative 1.8.0
# writes /ActualText with the source string and extract-text honours it.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   pwsh samples/extract-text/02-actualtext.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\extract-text'
$RenderDir = Join-Path $RootDir 'samples\render'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering Hindi, Bengali and Tamil as tagged PDF/A-2b'
& pdfnative render --input (Join-Path $RenderDir 'multilang\10-indic.json') --output (Join-Path $OutputDir '02-indic-tagged.pdf') --tagged pdfa2b --font hi --font bn --font ta --font latin --lang 'hi,bn,ta,latin' --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ Untagged, for comparison'
& pdfnative render --input (Join-Path $RenderDir 'multilang\10-indic.json') --output (Join-Path $OutputDir '02-indic-untagged.pdf') --font hi --font bn --font ta --font latin --lang 'hi,bn,ta,latin' --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ Tagged: the logical order comes back'
& pdfnative extract-text --input (Join-Path $OutputDir '02-indic-tagged.pdf') --pages 1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ Untagged: every letter is there, in glyph order'
& pdfnative extract-text --input (Join-Path $OutputDir '02-indic-untagged.pdf') --pages 1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "✓ Done: $OutputDir"
