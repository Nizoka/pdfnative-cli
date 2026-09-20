# render/font/04-new-scripts-1.8.ps1 — Lao, Tai Tham, New Tai Lue, Tai Le, Cham (v1.5.0)
#
# The five script codes pdfnative 1.8.0 added: --font registers each bundled
# module, --lang embeds them (27 scripts in all; ha, yo, ig, sw alias latin).

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\font'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

& pdfnative render `
    --input  (Join-Path $ScriptDir '04-new-scripts-1.8.json') `
    --output (Join-Path $OutputDir '04-new-scripts-1.8.pdf') `
    --font lo --font nod --font khb --font tdd --font cjm --font latin `
    --lang lo,nod,khb,tdd,cjm,latin
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "✓ Written: $(Join-Path $OutputDir '04-new-scripts-1.8.pdf')"
Write-Host '→ The alias route (Yoruba tone marks on the latin module):'
Set-Content -Path (Join-Path $OutputDir 'yoruba.json') -Value '{"blocks":[{"type":"paragraph","text":"Ẹ káàbọ̀ — Ọ̀tọ̀ ìjọ"}]}' -Encoding utf8
& pdfnative render --input (Join-Path $OutputDir 'yoruba.json') --output (Join-Path $OutputDir 'yoruba.pdf') --font latin --lang yo
Write-Host "✓ Written: $(Join-Path $OutputDir 'yoruba.pdf')"
