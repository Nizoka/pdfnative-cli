# render/font/06-color-emoji-sequences.ps1 — colour emoji: skin tones, ZWJ sequences, flags (v1.5.0)
#
# --font color-emoji draws COLRv1 glyphs as vector forms. pdfnative 1.8.0 bundles
# 20 gestures and 10 people in all five skin tones: each toned form is one glyph.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   pwsh samples/render/font/06-color-emoji-sequences.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\font'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering'
& pdfnative render --input (Join-Path $ScriptDir '06-color-emoji-sequences.json') --output (Join-Path $OutputDir '06-color-emoji-sequences.pdf') --font color-emoji --font latin --lang 'color-emoji,latin' --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "✓ Done: $OutputDir"
