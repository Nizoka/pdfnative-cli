# config/01-config.ps1 — .pdfnativerc.json default flags (v1.0.0)
#
# Shows how a config file supplies default flags. We run `render` from this
# directory so the sample .pdfnativerc.json here is discovered. The config
# sets render defaults (letter page size, compression, zebra tables); an
# explicit CLI flag would still override them.
#
# Usage:
#   pwsh samples/config/01-config.ps1

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Resolve-Path (Join-Path $ScriptDir '..\..')
$OutDir    = Join-Path $RootDir 'samples\output\config'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Push-Location $ScriptDir
try {
  Write-Host "-> Rendering from $ScriptDir (its .pdfnativerc.json provides defaults):"
  '{ "blocks": [ { "type": "paragraph", "text": "Rendered with config defaults." } ] }' `
    | pdfnative render --output (Join-Path $OutDir 'with-config.pdf')
  Write-Host "  OK with-config.pdf  (letter size + compression from config)"

  Write-Host ''
  Write-Host '-> Same input with --no-config (built-in defaults, A4):'
  '{ "blocks": [ { "type": "paragraph", "text": "Rendered ignoring config." } ] }' `
    | pdfnative render --no-config --output (Join-Path $OutDir 'no-config.pdf')
  Write-Host "  OK no-config.pdf"
}
finally {
  Pop-Location
}
