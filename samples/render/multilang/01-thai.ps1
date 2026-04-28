# render/multilang/01-thai.ps1 — render real Thai and multilingual PDFs
#
# The --lang flag in the pdfnative CLI activates a registered font loader.
# Because the CLI starts a fresh process each time, font loaders must be
# registered programmatically via registerFonts() BEFORE the render call.
# These two Node.js driver scripts do exactly that, using the Noto font data
# bundled inside pdfnative (no external font files required).
#
# Usage:
#   pwsh -File samples\render\multilang\01-thai.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))

Write-Host '→ Rendering Thai sample (Noto Sans Thai, bundled with pdfnative)…'
node (Join-Path $ScriptDir '03-thai.js')

Write-Host ''
Write-Host '→ Rendering multilingual sample (Thai + Japanese + Arabic + Russian)…'
node (Join-Path $ScriptDir '04-multilingual.js')

Write-Host ''
Write-Host "Done. Output: $(Join-Path $RootDir 'samples\output\multilang\')"
