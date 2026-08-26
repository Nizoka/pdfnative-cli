# sign/08-ltv.ps1 — the full PAdES ladder: B-B → B-T → B-LT → B-LTA
#
# pdfnative-cli 1.4.0 — walks the long-term-validation ladder:
#   sign --timestamp <tsa> --profile pades   →  B-T   (trusted signing time)
#   ltv add --online                         →  B-LT  (OCSP/CRL into /DSS)
#   doc-timestamp --url <tsa>                →  B-LTA (RFC 3161 doc timestamp)
#   ltv add --online                         →  LTV for the doc-timestamp itself
#
# Network is strictly OPT-IN. Offline, the sample signs a PAdES B-B baseline
# and prints the ladder pedagogically; when PDFNATIVE_TSA_URL is set it really
# runs `sign --timestamp` and `doc-timestamp --url`. The `ltv add --online`
# rungs need the signer certificate to expose real OCSP/CRL endpoints (AIA /
# CDP extensions), which a throwaway demo certificate does not have — those
# rungs stay as echoed commands with an explanation.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH
#   - optional: PDFNATIVE_TSA_URL (e.g. http://timestamp.digicert.com)
#
# Usage:
#   pwsh -File samples\sign\08-ltv.ps1
#   $env:PDFNATIVE_TSA_URL='http://timestamp.digicert.com'; pwsh -File samples\sign\08-ltv.ps1
#
# Output: samples\output\sign\08-ltv-pades-b.pdf
#         samples\output\sign\08-ltv-pades-t.pdf, -pades-lta.pdf (network mode)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output'
$SignOut   = Join-Path $OutputDir 'sign'
$KeysDir   = Join-Path $SignOut 'keys'

New-Item -ItemType Directory -Force -Path $SignOut, $KeysDir | Out-Null

$UnsignedPdf  = Join-Path $SignOut '08-ltv-source.pdf'
$PadesBPdf    = Join-Path $SignOut '08-ltv-pades-b.pdf'
$PadesTPdf    = Join-Path $SignOut '08-ltv-pades-t.pdf'
$PadesLtaPdf  = Join-Path $SignOut '08-ltv-pades-lta.pdf'
$KeyFile      = Join-Path $KeysDir 'signing.key'
$CertFile     = Join-Path $KeysDir 'signing.crt'

# ── Step 1: render + sign a PAdES B-B baseline (always offline) ────────────
Write-Host '→ [1/4] Rendering and signing a PAdES B-B baseline (offline)…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\document\02-report.json') `
  --output $UnsignedPdf
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not (Test-Path $KeyFile) -or -not (Test-Path $CertFile)) {
  & openssl req -x509 -newkey rsa:2048 -keyout $KeyFile -out $CertFile `
    -days 365 -nodes `
    -subj '/CN=pdfnative Demo/O=pdfnative/C=US' 2>$null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& pdfnative sign `
  --input   $UnsignedPdf `
  --output  $PadesBPdf `
  --key     $KeyFile `
  --cert    $CertFile `
  --profile pades `
  --reason  'PAdES B-B baseline for the LTV ladder'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "  ✓ Signed (B-B): $PadesBPdf"

# ── Step 2: the full ladder, pedagogically ─────────────────────────────────
Write-Host '→ [2/4] The complete PAdES ladder (each rung is an incremental revision):'
Write-Host '    B-T   pdfnative sign --timestamp <tsa-url> --profile pades'
Write-Host '    B-LT  pdfnative ltv add --online          # OCSP/CRL → /DSS + /VRI'
Write-Host '    B-LTA pdfnative doc-timestamp --url <tsa-url>'
Write-Host '    …     pdfnative ltv add --online          # LTV for the doc-timestamp'
Write-Host "  Air-gapped variant: 'ltv collect --online' on a connected machine,"
Write-Host "  then 'ltv embed --data ltv.json' offline (embed never touches the network)."

# ── Step 3: run the network rungs when a TSA is configured ─────────────────
if ($env:PDFNATIVE_TSA_URL) {
  Write-Host "→ [3/4] B-T: signing with --timestamp against $($env:PDFNATIVE_TSA_URL)…"
  & pdfnative sign `
    --input     $UnsignedPdf `
    --output    $PadesTPdf `
    --key       $KeyFile `
    --cert      $CertFile `
    --profile   pades `
    --timestamp $env:PDFNATIVE_TSA_URL `
    --reason    'PAdES B-T for the LTV ladder'
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "  ✓ B-T: $PadesTPdf"

  Write-Host '  B-LT (ltv add --online) is not run here: the demo certificate is'
  Write-Host '  self-signed and carries no OCSP/CRL endpoints (AIA/CDP), so there is'
  Write-Host '  no revocation data to collect. With a CA-issued certificate you would run:'
  Write-Host "    pdfnative ltv add --input `"$PadesTPdf`" --online --output out-lt.pdf"

  Write-Host '  B-LTA: appending an RFC 3161 document timestamp…'
  & pdfnative doc-timestamp `
    --input  $PadesTPdf `
    --url    $env:PDFNATIVE_TSA_URL `
    --output $PadesLtaPdf
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "  ✓ B-LTA: $PadesLtaPdf"
  $InspectPdf = $PadesLtaPdf
} else {
  Write-Host '→ [3/4] [skipped] network step — set PDFNATIVE_TSA_URL to run against a real TSA (e.g. http://timestamp.digicert.com)'
  Write-Host '  Commands that would run:'
  Write-Host "    pdfnative sign --input `"$UnsignedPdf`" --output `"$PadesTPdf`" ``"
  Write-Host "      --key `"$KeyFile`" --cert `"$CertFile`" ``"
  Write-Host '      --profile pades --timestamp $env:PDFNATIVE_TSA_URL'
  Write-Host "    pdfnative doc-timestamp --input `"$PadesTPdf`" --url `$env:PDFNATIVE_TSA_URL ``"
  Write-Host "      --output `"$PadesLtaPdf`""
  Write-Host "  ('ltv add --online' additionally needs a CA-issued certificate with"
  Write-Host '   real OCSP/CRL endpoints — see step 2.)'
  $InspectPdf = $PadesBPdf
}

# ── Step 4: inventory the signature fields ─────────────────────────────────
Write-Host "→ [4/4] inspect --signatures on $InspectPdf :"
& pdfnative inspect `
  --input $InspectPdf `
  --signatures `
  --format json `
  --fields signatures `
  --pretty
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Expect: the B-B baseline lists one signature field; after the network'
Write-Host 'rungs the inventory also shows a /DocTimeStamp entry (isDocTimestamp: true).'
