# render/typography/05-spacing-and-keep-rules.ps1 — fr-CA spacing, custom rules, soft hyphens, keep rules (v1.5.0)
#
# Three documents: the Canadian French preset (05), an explicit
# PunctuationSpacingRule[] (06), and soft hyphens with the per-block
# keepWithNext / splittable keys (07). All need a registered font for the
# narrow no-break space, hence --font latin --lang latin.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   pwsh samples/render/typography/05-spacing-and-keep-rules.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\typography'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering'
& pdfnative render --input (Join-Path $ScriptDir '05-french-canadian-spacing.json') --output (Join-Path $OutputDir '05-french-canadian-spacing.pdf') --font latin --lang latin --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& pdfnative render --input (Join-Path $ScriptDir '06-custom-spacing-rules.json') --output (Join-Path $OutputDir '06-custom-spacing-rules.pdf') --font latin --lang latin --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& pdfnative render --input (Join-Path $ScriptDir '07-soft-hyphen-keep-with-next.json') --output (Join-Path $OutputDir '07-soft-hyphen-keep-with-next.pdf') --font latin --lang latin --creation-date 2026-01-01T00:00:00Z
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ The no-break spaces are in the file: extract-text returns U+00A0 and U+202F'
& pdfnative extract-text --input (Join-Path $OutputDir '05-french-canadian-spacing.pdf') --format json --fields text
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ The page map of the keep rules, without writing a PDF'
& pdfnative render --input (Join-Path $ScriptDir '07-soft-hyphen-keep-with-next.json') --font latin --lang latin --inspect-layout --output (Join-Path $OutputDir '07-layout.json')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "✓ Done: $OutputDir"
