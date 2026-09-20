# render/multilang/08-language-families.ps1 — the script families of pdfnative 1.8.0 (v1.5.0)
#
# Four documents load the 14 script modules no other sample uses: Greek, Cyrillic,
# Georgian, Armenian, Polish, Turkish, Vietnamese (08); Arabic and Hebrew (09);
# Hindi, Bengali and Tamil (10); Chinese and Korean (11). With the other samples
# every one of the 27 script codes is rendered by the corpus.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   pwsh samples/render/multilang/08-language-families.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\multilang'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ European and Caucasian alphabets'
& pdfnative render --input (Join-Path $ScriptDir '08-european-caucasian.json') --output (Join-Path $OutputDir '08-european-caucasian.pdf') --font el --font ru --font ka --font hy --font pl --font tr --font vi --font latin --lang 'el,ru,ka,hy,pl,tr,vi,latin' --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ Right-to-left'
& pdfnative render --input (Join-Path $ScriptDir '09-rtl.json') --output (Join-Path $OutputDir '09-rtl.pdf') --font ar --font he --font latin --lang 'ar,he,latin' --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ Indic'
& pdfnative render --input (Join-Path $ScriptDir '10-indic.json') --output (Join-Path $OutputDir '10-indic.pdf') --font hi --font bn --font ta --font latin --lang 'hi,bn,ta,latin' --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ Chinese and Korean'
& pdfnative render --input (Join-Path $ScriptDir '11-cjk.json') --output (Join-Path $OutputDir '11-cjk.pdf') --font zh --font ko --font latin --lang 'zh,ko,latin' --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "✓ Done: $OutputDir"
