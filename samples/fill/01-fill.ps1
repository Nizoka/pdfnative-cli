# fill/01-fill.ps1 — fill and flatten an AcroForm PDF (pdfnative 1.6.0)
#
# Renders an interactive form, lists its fields, fills them from a JSON map,
# then produces a flattened (non-editable) copy. The fill uses an incremental
# update, so an existing signature would stay valid for its revision.
#
# Usage:
#   pwsh -File samples\fill\01-fill.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\fill'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host '→ [1/4] Rendering an interactive form…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\fill\form.json') `
  --output (Join-Path $OutputDir 'form.pdf')

Write-Host '→ [2/4] Discovering the form fields (and exporting a --data template)…'
& pdfnative inspect --input (Join-Path $OutputDir 'form.pdf') --form-fields --format text
# --export dumps the current values as a ready-to-edit --data map (read → edit → fill).
& pdfnative fill --input (Join-Path $OutputDir 'form.pdf') --export --output (Join-Path $OutputDir 'template.json')
Write-Host "  ↳ exported template: $OutputDir\template.json"

Write-Host '→ [3/4] Filling from form-values.json…'
& pdfnative fill `
  --input  (Join-Path $OutputDir 'form.pdf') `
  --data   (Join-Path $RootDir 'samples\fill\form-values.json') `
  --output (Join-Path $OutputDir 'filled.pdf')
& pdfnative inspect --input (Join-Path $OutputDir 'filled.pdf') --form-fields --format text

Write-Host '→ [4/4] Flattening (removes interactive fields)…'
& pdfnative fill --input (Join-Path $OutputDir 'filled.pdf') --flatten --output (Join-Path $OutputDir 'flattened.pdf')
Write-Host "  ✓ Outputs in $OutputDir"
