# sign/06-timestamp.ps1 — PAdES B-T: sign with an RFC 3161 trusted timestamp
#
# pdfnative-cli 1.4.0 — `sign --timestamp <url>` embeds a verified RFC 3161
# timestamp token in the CMS unsigned attributes at signing time; combined
# with `--profile pades` this produces a PAdES B-T signature.
#
# Network is strictly OPT-IN. The offline part (render → PAdES B-B sign) always
# runs; the TSA request only happens when PDFNATIVE_TSA_URL is set.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH
#   - optional: PDFNATIVE_TSA_URL (e.g. http://timestamp.digicert.com)
#
# Usage:
#   pwsh -File samples\sign\06-timestamp.ps1
#   $env:PDFNATIVE_TSA_URL='http://timestamp.digicert.com'; pwsh -File samples\sign\06-timestamp.ps1
#
# Output: samples\output\sign\06-timestamp-pades-b.pdf
#         samples\output\sign\06-timestamp-pades-t.pdf (network mode only)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output'
$SignOut   = Join-Path $OutputDir 'sign'
$KeysDir   = Join-Path $SignOut 'keys'

New-Item -ItemType Directory -Force -Path $SignOut, $KeysDir | Out-Null

$UnsignedPdf = Join-Path $SignOut '06-timestamp-source.pdf'
$PadesBPdf   = Join-Path $SignOut '06-timestamp-pades-b.pdf'
$PadesTPdf   = Join-Path $SignOut '06-timestamp-pades-t.pdf'
$KeyFile     = Join-Path $KeysDir 'signing.key'
$CertFile    = Join-Path $KeysDir 'signing.crt'

# ── Step 1: render the source document ─────────────────────────────────────
Write-Host '→ [1/4] Rendering source document…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\document\01-minimal.json') `
  --output $UnsignedPdf
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "  ✓ Rendered: $UnsignedPdf"

# ── Step 2: generate self-signed certificate (for demo only) ───────────────
if (-not (Test-Path $KeyFile) -or -not (Test-Path $CertFile)) {
  Write-Host '→ [2/4] Generating self-signed certificate (demo)…'
  & openssl req -x509 -newkey rsa:2048 -keyout $KeyFile -out $CertFile `
    -days 365 -nodes `
    -subj '/CN=pdfnative Demo/O=pdfnative/C=US' 2>$null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "  ✓ Key:  $KeyFile"
  Write-Host "  ✓ Cert: $CertFile"
} else {
  Write-Host "→ [2/4] Reusing demo certificate: $CertFile"
}

# ── Step 3: offline PAdES B-B signature (no network) ───────────────────────
Write-Host '→ [3/4] Signing offline with --profile pades (PAdES B-B)…'
& pdfnative sign `
  --input   $UnsignedPdf `
  --output  $PadesBPdf `
  --key     $KeyFile `
  --cert    $CertFile `
  --profile pades `
  --reason  'PAdES B-B baseline signature'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "  ✓ Signed: $PadesBPdf"

# ── Step 4: PAdES B-T — add an RFC 3161 timestamp (opt-in network) ─────────
if ($env:PDFNATIVE_TSA_URL) {
  Write-Host "→ [4/4] Signing with --timestamp against $($env:PDFNATIVE_TSA_URL) (PAdES B-T)…"
  & pdfnative sign `
    --input     $UnsignedPdf `
    --output    $PadesTPdf `
    --key       $KeyFile `
    --cert      $CertFile `
    --profile   pades `
    --timestamp $env:PDFNATIVE_TSA_URL `
    --reason    'PAdES B-T timestamped signature'
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "  ✓ Signed with timestamp: $PadesTPdf"

  Write-Host '→ Verifying — look for the RFC 3161 timestamp (timestampPresent)…'
  & pdfnative verify `
    --input  $PadesTPdf `
    --format text
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host '→ [4/4] [skipped] network step — set PDFNATIVE_TSA_URL to run against a real TSA (e.g. http://timestamp.digicert.com)'
  Write-Host '  Command that would run:'
  Write-Host "    pdfnative sign ``"
  Write-Host "      --input     `"$UnsignedPdf`" ``"
  Write-Host "      --output    `"$PadesTPdf`" ``"
  Write-Host "      --key       `"$KeyFile`" ``"
  Write-Host "      --cert      `"$CertFile`" ``"
  Write-Host "      --profile   pades ``"
  Write-Host '      --timestamp $env:PDFNATIVE_TSA_URL'
  Write-Host "  Then: pdfnative verify --input `"$PadesTPdf`" --format text"
}

Write-Host ''
Write-Host 'Expect: the offline PAdES B-B signature always verifies; with a TSA the'
Write-Host 'B-T output additionally reports a validated RFC 3161 timestamp token.'
