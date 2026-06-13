# agent/04-token-economy.ps1 — shrink agent output ~90% with --summary / --fields
#
# The JSON that inspect/verify/batch write to stdout is the bulk of an agent's
# token cost. Three composable levers cut it dramatically:
#   1. compact JSON — automatic under --json (--pretty opts back in)
#   2. --summary    — a canonical minimal verdict
#   3. --fields a,b — keep only named dot-paths

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$Input = Join-Path $RootDir 'render/document/01-minimal.json'

$OutDir = Join-Path $RootDir 'output/agent'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Pdf = Join-Path $OutDir '04-token-economy.pdf'
& pdfnative render --input $Input --output $Pdf | Out-Null

Write-Host '→ Full inspect report (pretty, human form):'
(& pdfnative inspect --input $Pdf | Out-String).Substring(0, 400) + '…'

Write-Host ''
Write-Host '→ Same probe, agent summary (compact, minimal verdict):'
& pdfnative inspect --input $Pdf --json --summary

Write-Host ''
Write-Host '→ Just the two fields an agent needs:'
& pdfnative inspect --input $Pdf --json --fields pageCount,signatures

Write-Host ''
Write-Host '→ verify minimal verdict:'
& pdfnative verify --input $Pdf --json --summary
