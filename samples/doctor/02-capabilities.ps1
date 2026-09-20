# doctor/02-capabilities.ps1 — the v1.5.0 capability checks as an agent gate
#
# doctor reports the bundled font inventory (31 modules / 27 scripts, each
# probed on disk), the Unicode version of the shaping engine and the
# conformance targets of --tagged and --pdfx.

$ErrorActionPreference = 'Stop'

Write-Host '→ pdfnative doctor --json --fields ok,checks'
& pdfnative doctor --json --fields ok,checks

Write-Host '→ Gate: is the Lao font (lo) available and is pdfx4 a supported target?'
$report = & pdfnative doctor --format json | ConvertFrom-Json
$fonts = $report.checks | Where-Object { $_.name -eq 'fonts' }
$conf  = $report.checks | Where-Object { $_.name -eq 'conformance' }
$uni   = $report.checks | Where-Object { $_.name -eq 'unicode' }
$fontsOk = ($fonts.status -eq 'ok') -and ($fonts.detail -like '*lo*')
$pdfxOk  = ($conf.value -split ',') -contains 'pdfx4'
Write-Host "   fonts: $($fonts.value) ($(if ($fontsOk) { 'lo available' } else { 'lo MISSING' }))"
Write-Host "   unicode: $($uni.value)"
Write-Host "   pdfx4 target: $(if ($pdfxOk) { 'yes' } else { 'no' })"
if (-not ($fontsOk -and $pdfxOk)) { exit 1 }
Write-Host '  ✓ PASS — the environment can render Lao and claim PDF/X-4.'
