# govern/01-rules.ps1 — surface pdfnative's AI-governance / HITL contract
#
# Agents act as *draftsmen*: they may draft an issue/PR locally, but a HUMAN
# must review and submit it. Nothing here touches the network or GitHub.
#
# Usage:
#   pwsh -File samples\govern\01-rules.ps1

$ErrorActionPreference = 'Stop'

Write-Host '→ Human/agent protocol (govern rules):'
& pdfnative govern rules

Write-Host ''
Write-Host '→ Machine-readable policy (govern policy):'
& pdfnative govern policy --pretty
