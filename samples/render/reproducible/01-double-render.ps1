# render/reproducible/01-double-render.ps1 — the sample IS the proof (v1.5.0)
#
# Renders the same document twice under two time zones with a pinned
# creation date and compares the SHA-256 hashes: identical bytes on every
# host. A third render without the pin shows the hash moving with the clock.

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ScriptDir))
$OutputDir = Join-Path $RootDir 'samples\output\reproducible'
$Input     = Join-Path $RootDir 'samples\render\reproducible\01-pinned-date.json'
$Pin       = '2026-01-01T00:00:00Z'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function Sha([string]$Path) { (Get-FileHash -Algorithm SHA256 $Path).Hash.ToLowerInvariant() }

Write-Host "→ Render A under TZ=Europe/Paris with --creation-date $Pin"
$env:TZ = 'Europe/Paris'
& pdfnative render --input $Input --output (Join-Path $OutputDir 'a.pdf') --creation-date $Pin --header-right '{date}'
Write-Host '→ Render B under TZ=Pacific/Auckland with the same pin'
$env:TZ = 'Pacific/Auckland'
& pdfnative render --input $Input --output (Join-Path $OutputDir 'b.pdf') --creation-date $Pin --header-right '{date}'
Remove-Item Env:TZ
Write-Host '→ Render C with SOURCE_DATE_EPOCH=1767225600 (the same instant, no flag)'
$env:SOURCE_DATE_EPOCH = '1767225600'
& pdfnative render --input $Input --output (Join-Path $OutputDir 'c.pdf') --header-right '{date}'
Remove-Item Env:SOURCE_DATE_EPOCH

$A = Sha (Join-Path $OutputDir 'a.pdf'); $B = Sha (Join-Path $OutputDir 'b.pdf'); $C = Sha (Join-Path $OutputDir 'c.pdf')
Write-Host "  a.pdf $A"
Write-Host "  b.pdf $B"
Write-Host "  c.pdf $C"
if ($A -eq $B -and $B -eq $C) {
    Write-Host '  ✓ PASS — identical bytes across time zones and pin sources.'
} else {
    Write-Host '  ✗ FAIL — the renders differ.'
    exit 1
}

Write-Host '→ Render D without a pin (wall clock, still UTC): its hash moves with the clock'
& pdfnative render --input $Input --output (Join-Path $OutputDir 'd.pdf') --header-right '{date}'
Write-Host "  d.pdf $(Sha (Join-Path $OutputDir 'd.pdf'))"
