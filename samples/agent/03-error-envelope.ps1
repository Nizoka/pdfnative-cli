# agent/03-error-envelope.ps1 — deterministic failures via the JSON error envelope

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host '→ Feeding non-PDF bytes to inspect --json (expect E_PARSE on stderr):'
'not a pdf' | & pdfnative inspect --json
Write-Host "  (exit code: $LASTEXITCODE)"

Write-Host ''
Write-Host '→ Unknown schema subject (expect E_USAGE, exit 2):'
& pdfnative schema bogus --json
Write-Host "  (exit code: $LASTEXITCODE)"
