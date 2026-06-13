# render/document/06-max-blocks.ps1 — cap document blocks with --max-blocks
#
# --max-blocks <n> exposes pdfnative's layout.maxBlocks ceiling (default 100000)
# so a very large or runaway document fails fast instead of exhausting memory.
# This sample renders the same 5-block input twice: once with a generous cap
# (succeeds) and once with a cap below the block count (pdfnative aborts).
#
# Usage:
#   pwsh -File samples\render\document\06-max-blocks.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$Input     = Join-Path $RootDir 'samples\render\document\06-max-blocks.json'
$OutputDir = Join-Path $RootDir 'samples\output\document'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering with a generous cap (--max-blocks 10000)…'
& pdfnative render `
  --input  $Input `
  --output (Join-Path $OutputDir '06-max-blocks.pdf') `
  --max-blocks 10000
Write-Host "  ✓ Output: $OutputDir\06-max-blocks.pdf"

Write-Host '→ Re-rendering with a deliberately low cap (--max-blocks 3) — expected to fail…'
& pdfnative render --input $Input --output (Join-Path $env:TEMP 'max-blocks-overflow.pdf') --max-blocks 3 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Error '  ✗ Unexpected success — the guard should have tripped.'
    exit 1
}
Write-Host '  ✓ Guard tripped as expected (non-zero exit).'
