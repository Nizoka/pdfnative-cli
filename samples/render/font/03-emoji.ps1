# render/font/03-emoji.ps1 — monochrome emoji via the --font emoji shortcut
#
# Registers the bundled Noto Emoji (monochrome) font. Emoji render as single-
# colour glyphs that inherit the surrounding text colour.
#
# Usage: pwsh -File samples\render\font\03-emoji.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutDir    = Join-Path $RootDir 'samples\output\font'

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

& pdfnative render `
  --input  (Join-Path $ScriptDir '03-emoji.json') `
  --output (Join-Path $OutDir '03-emoji.pdf') `
  --font emoji `
  --lang emoji

Write-Host "✓ Rendered: $OutDir\03-emoji.pdf"
