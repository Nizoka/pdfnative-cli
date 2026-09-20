# annotate/02-link.ps1 — link annotations on an existing PDF (v1.5.0)
#
# The `link` type adds a /Link annotation with a URI action over a click
# rectangle. Only http:, https: and mailto: URLs pass pdfnative's validateURL.

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\annotate'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

& pdfnative render `
    --input  (Join-Path $RootDir 'samples\render\document\02-report.json') `
    --output (Join-Path $OutputDir 'report.pdf')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '→ Adding two links (and a CMYK highlight) from 02-links.json'
& pdfnative annotate `
    --input  (Join-Path $OutputDir 'report.pdf') `
    --output (Join-Path $OutputDir 'report-linked.pdf') `
    --annotations (Join-Path $ScriptDir '02-links.json') --json
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '→ Listing them back'
& pdfnative inspect --input (Join-Path $OutputDir 'report-linked.pdf') --annotations --json --fields annotations

Write-Host '→ A blocked scheme is refused before anything is written'
Set-Content -Path (Join-Path $OutputDir 'bad-link.json') -Value '[{"page":1,"type":"link","rect":[72,600,300,620],"url":"javascript:alert(1)"}]'
& pdfnative annotate --input (Join-Path $OutputDir 'report.pdf') --output (Join-Path $OutputDir 'never.pdf') --annotations (Join-Path $OutputDir 'bad-link.json') --json 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host '  ✗ unexpected: the javascript: link was accepted'; exit 1
} else {
    Write-Host '  ✓ expected: E_INPUT (exit 1), nothing written'
}
