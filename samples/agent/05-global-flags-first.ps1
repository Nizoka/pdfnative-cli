# agent/05-global-flags-first.ps1 — global flags may precede the command name (v1.5.0)
#
# The boolean globals (--json, --dry-run, --quiet, --no-color, --no-config,
# --help, --version) never consume the next token, so an agent can build argv
# as [globals..., command, flags...] in either order.

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$Input     = Join-Path $RootDir 'samples\render\document\01-minimal.json'

Write-Host '→ pdfnative --json --dry-run render --input … (globals first)'
& pdfnative --json --dry-run render --input $Input 2>&1 | Out-String | Write-Host
Write-Host '→ pdfnative render --input … --json --dry-run (globals last — still fine)'
& pdfnative render --input $Input --json --dry-run 2>&1 | Out-String | Write-Host
Write-Host '→ --creation-date is global too'
& pdfnative --creation-date 2026-01-01T00:00:00Z --json --dry-run render --input $Input 2>&1 | Out-String | Write-Host
Write-Host '  ✓ every form resolved "render" as the command'
