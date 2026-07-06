# govern/02-verify-issue.ps1 — gate an issue/PR draft against the HITL policy
#
# `govern verify-issue <draft.md>` PASSES a compliant draft (exit 0) and BLOCKS
# a non-compliant one (exit 1, error code E_POLICY). A passing check is
# necessary but NOT sufficient: a human must still review and submit.
#
# Usage:
#   pwsh -File samples\govern\02-verify-issue.ps1

$ErrorActionPreference = 'Continue'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host '→ [1/2] Verifying a COMPLIANT draft (expect PASS / exit 0)…'
& pdfnative govern verify-issue (Join-Path $ScriptDir 'draft-good.md')
if ($LASTEXITCODE -eq 0) {
    Write-Host '  ✓ draft-good.md passed.'
} else {
    Write-Warning '  ✗ Unexpected failure on draft-good.md'
}

Write-Host ''
Write-Host '→ [2/2] Verifying a NON-COMPLIANT draft (expect BLOCK / exit 1)…'
& pdfnative govern verify-issue (Join-Path $ScriptDir 'draft-bad.md')
if ($LASTEXITCODE -ne 0) {
    Write-Host '  ✓ draft-bad.md was correctly blocked (E_POLICY).'
} else {
    Write-Warning '  ✗ draft-bad.md unexpectedly passed'
}
