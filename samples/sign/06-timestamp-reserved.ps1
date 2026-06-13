# sign/06-timestamp-reserved.ps1 — the reserved --timestamp flag (PAdES-T)
#
# Sign-side RFC 3161 timestamping is intentionally NOT yet available. The CLI
# surfaces the flag so the contract is discoverable, but it fails fast with a
# clear message and exit code 2 rather than silently dropping the timestamp.
# This sample asserts that contract — it expects the command to FAIL.
#
# Usage:
#   pwsh -File samples\sign\06-timestamp-reserved.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)

Write-Host '→ Attempting sign --timestamp (expected to fail)…'
& pdfnative sign `
  --input     (Join-Path $RootDir 'samples\render\document\01-minimal.json') `
  --timestamp 'http://timestamp.example/tsa' `
  --json
$status = $LASTEXITCODE

Write-Host "  exit code: $status (expected 2)"
if ($status -eq 2) {
  Write-Host '  ✓ PASS — reserved flag rejected as documented.'
} else {
  Write-Host '  ✗ UNEXPECTED — flag did not fail with exit 2.'
  exit 1
}
