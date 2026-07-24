# doctor/01-doctor.ps1 — environment / capability preflight (pdfnative-cli 1.3.0)
#
# `doctor` reports the CLI version, Node version, Web Crypto (CSPRNG)
# availability (required by `encrypt`), the resolved pdfnative version, and the
# registered command count. Fully offline. Exit code 0 when all checks pass, 1
# otherwise — ideal as an agent pre-flight before attempting `encrypt`.
#
# Usage:
#   pwsh -File samples\doctor\01-doctor.ps1

$ErrorActionPreference = 'Stop'

Write-Host '→ [1/2] Human-readable report:'
& pdfnative doctor

Write-Host '→ [2/2] Machine-readable report (agent pre-flight):'
& pdfnative doctor --format json
Write-Host "  (exit code $LASTEXITCODE — 0 means all capabilities are available)"
