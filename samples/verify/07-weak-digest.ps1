# verify/07-weak-digest.ps1 — RFC 3161 timestamps with a SHA-1 imprint (v1.5.0)
#
# verify reports the messageImprint digest of every timestamp token as
# timestampDigest; a SHA-1 imprint adds a weak-digest note and --strict
# refuses it. Network-gated: needs $env:PDFNATIVE_TSA_URL.

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\verify'
$Fixtures  = Join-Path $RootDir 'tests\fixtures'
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

if (-not $env:PDFNATIVE_TSA_URL) {
    Write-Host 'PDFNATIVE_TSA_URL is not set — skipping the network step.'
    Write-Host 'What verify reports on a timestamped signature:'
    Write-Host '  timestampDigest: "sha256"      — the imprint algorithm of the token'
    Write-Host '  notes: ["weak digest: RFC 3161 messageImprint uses SHA-1 (refused under --strict)"]  — when it is sha1'
    Write-Host '  verify --strict → exit 1 (E_VERIFY_FAILED) on a sha1 imprint'
    exit 0
}

& pdfnative render --input (Join-Path $RootDir 'samples\render\document\01-minimal.json') --output (Join-Path $OutputDir 'doc.pdf')
Write-Host "→ Signing with a timestamp from $env:PDFNATIVE_TSA_URL (sha256 imprint)"
& pdfnative sign --input (Join-Path $OutputDir 'doc.pdf') --output (Join-Path $OutputDir 'timestamped.pdf') `
    --key (Join-Path $Fixtures 'rsa-key.pem') --cert (Join-Path $Fixtures 'rsa-cert.pem') `
    --profile pades --timestamp $env:PDFNATIVE_TSA_URL --timestamp-timeout 15000
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '→ verify: the imprint digest and any weak-digest note'
& pdfnative verify --input (Join-Path $OutputDir 'timestamped.pdf') --json --fields signatures.timestampDigest,signatures.timestampValid,signatures.notes
Write-Host '→ verify --strict (a sha1 imprint would fail here)'
& pdfnative verify --input (Join-Path $OutputDir 'timestamped.pdf') --strict --summary
