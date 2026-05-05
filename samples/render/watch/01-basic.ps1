# render/watch/01-basic.ps1 — Live re-render on input change (v0.3.0)
#
# Demonstrates `pdfnative render --watch`. INTERACTIVE: launch this script,
# then edit samples\output\watch\source.json in another window to trigger
# re-renders. Press Ctrl+C to stop.
#
# This sample is intentionally NOT included in samples\run-all.js.
#
# Usage: pwsh -File samples\render\watch\01-basic.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutDir    = Join-Path $RootDir 'samples\output\watch'
$SrcJson   = Join-Path $OutDir  'source.json'
$OutPdf    = Join-Path $OutDir  '01-basic.pdf'

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

@'
{
    "title": "Live document",
    "blocks": [
        { "type": "heading", "text": "Edit me!", "level": 1 },
        { "type": "paragraph", "text": "Save this file to trigger a re-render." }
    ]
}
'@ | Set-Content -Path $SrcJson -Encoding utf8

Write-Host "→ Watching $SrcJson"
Write-Host '  Edit it in another window, then save — the PDF re-renders automatically.'
Write-Host "  Output: $OutPdf"
Write-Host '  Press Ctrl+C to stop.'
Write-Host ''

& pdfnative render `
    --input  $SrcJson `
    --output $OutPdf `
    --watch
