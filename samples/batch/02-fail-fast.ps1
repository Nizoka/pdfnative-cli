# batch/02-fail-fast.ps1 — stop a batch at the first failure (v1.0.0)
#
# With --fail-fast the batch aborts as soon as one render fails — what you want
# in CI. Builds a scratch input dir with one valid + one invalid document, runs
# the batch with --fail-fast, and asserts a non-zero exit.
#
# Usage:
#   pwsh -File samples\batch\02-fail-fast.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent $ScriptDir
$Base      = Join-Path $RootDir 'output\batch-failfast'
$InDir     = Join-Path $Base 'in'
$OutDir    = Join-Path $Base 'out'

if (Test-Path $Base) { Remove-Item -Recurse -Force $Base }
New-Item -ItemType Directory -Force -Path $InDir, $OutDir | Out-Null

Copy-Item (Join-Path $RootDir 'render\document\01-minimal.json') (Join-Path $InDir '01-ok.json')
Set-Content -Path (Join-Path $InDir '02-broken.json') -Value '{ this is not valid json' -NoNewline

Write-Host '→ Batch with --fail-fast over one valid + one invalid input:'
& pdfnative batch `
  --input-dir  $InDir `
  --output-dir $OutDir `
  --fail-fast `
  --format     json
$status = $LASTEXITCODE

Write-Host ''
Write-Host "  exit code: $status (expected non-zero)"
if ($status -ne 0) {
  Write-Host '  ✓ PASS — batch aborted on the first failure.'
} else {
  Write-Host '  ✗ UNEXPECTED — batch did not fail.'
  exit 1
}
