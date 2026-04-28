# render/attachments/01-pdfa3-with-xml.ps1 — PDF/A-3 with embedded XML
#
# Usage:
#   pwsh -File samples\render\attachments\01-pdfa3-with-xml.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\attachments'
$XmlPath   = Join-Path $RootDir 'samples\render\attachments\invoice.xml'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ Rendering PDF/A-3b with embedded invoice.xml…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\attachments\01-pdfa3-with-xml.json') `
  --output (Join-Path $OutputDir '01-pdfa3-with-xml.pdf') `
  --tagged pdfa3b `
  --attachment "${XmlPath}:application/xml:Source:Structured invoice payload"

Write-Host "  ✓ Output: $OutputDir\01-pdfa3-with-xml.pdf"
