# batch/03-manifest.ps1 — run a declarative multi-command pipeline (v1.4.0)
#
# Demonstrates `batch --manifest`: a tasks.json declares an ordered pipeline
# (render → encrypt → inspect) where "@id" values reference the output of an
# earlier task. Fully offline — network-reaching flags in a manifest are
# refused unless batch is invoked with --allow-network.
#
# Usage:
#   pwsh samples/batch/03-manifest.ps1

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Manifest  = Join-Path $ScriptDir 'manifest\tasks.json'
# Manifest-relative paths get the same traversal check as direct CLI flags, so
# the pipeline writes below the manifest's own directory (git-ignored).
$OutDir    = Join-Path $ScriptDir 'manifest\out'

Write-Host '-> Previewing the pipeline (nothing is executed):'
pdfnative batch --manifest $Manifest --dry-run
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host '-> Running the manifest pipeline (render -> encrypt -> inspect):'
pdfnative batch --manifest $Manifest --format json
if ($LASTEXITCODE -ne 0) {
  Write-Host "  X pipeline failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Host ''
Write-Host "  OK PDFs written to $OutDir (exit code is 1 if any task fails)."
