# render/font/02-new-scripts.ps1 — six new scripts + colour emoji (pdfnative 1.3.0)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutDir    = Join-Path $RootDir 'samples\output\font'

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

& pdfnative render `
  --input  (Join-Path $ScriptDir '02-new-scripts.json') `
  --output (Join-Path $OutDir '02-new-scripts.pdf') `
  --font te --font si --font km --font my --font bo --font am `
  --font color-emoji `
  --lang  te,si,km,my,bo,am,color-emoji

Write-Host "✓ Rendered: $(Join-Path $OutDir '02-new-scripts.pdf')"
