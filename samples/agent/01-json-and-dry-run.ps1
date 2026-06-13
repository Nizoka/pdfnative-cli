# agent/01-json-and-dry-run.ps1 — agent mode: --json status envelope + --dry-run

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent $ScriptDir
$Input     = Join-Path $RootDir 'render\document\01-minimal.json'

Write-Host '→ Dry-run validation (no file written); status envelope on stderr:'
& pdfnative render --input $Input --dry-run --json | Out-Null

Write-Host ''
Write-Host '→ Real render to a file; success envelope on stderr:'
$OutDir = Join-Path $RootDir 'output\agent'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
& pdfnative render --input $Input --output (Join-Path $OutDir '01-minimal.pdf') --json
Write-Host '  (envelope above carries { ok, command, output, bytes })'
