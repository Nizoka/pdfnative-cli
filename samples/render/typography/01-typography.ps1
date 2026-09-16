# render/typography/01-typography.ps1 — the four typography samples (v1.5.0, pdfnative 1.8.0)
#
# Renders 01–04 with the bundled Latin font (kerning, OpenType features and
# the French narrow no-break space need a registered font), then layers the
# high-frequency flags on top of layout.typography.

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\typography'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

foreach ($f in @('01-paragraph-breaking', '02-justify-optical-hyphenation', '03-french-spacing-units-short-words', '04-kerning-features-metrics')) {
    Write-Host "→ Rendering $f"
    & pdfnative render --input (Join-Path $ScriptDir "$f.json") --output (Join-Path $OutputDir "$f.pdf") --font latin --lang latin
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host '→ Flags layer on top of layout.typography (one level deep): --kerning --font-features onum,smcp'
& pdfnative render --input (Join-Path $ScriptDir '02-justify-optical-hyphenation.json') --output (Join-Path $OutputDir '02-with-flags.pdf') `
    --font latin --lang latin --kerning --font-features onum,smcp

Write-Host '→ Pagination of 01 (no PDF produced): --inspect-layout'
$report = & pdfnative render --input (Join-Path $ScriptDir '01-paragraph-breaking.json') --font latin --lang latin --split-paragraphs --inspect-layout | ConvertFrom-Json
Write-Host "   pages: $($report.pageCount)"
Write-Host "✓ Output: $OutputDir"
