# agent/02-schema.ps1 — discover input/output shapes via the schema command

$ErrorActionPreference = 'Stop'

Write-Host '→ Available schema subjects:'
& pdfnative schema list

Write-Host ''
Write-Host '→ render input schema (default subject):'
& pdfnative schema render

Write-Host ''
Write-Host '→ inspect output schema:'
& pdfnative schema inspect
