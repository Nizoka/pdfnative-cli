# sign/09-multiple-signatures.ps1 — two signatures on one PDF (--allow-multiple)
#
# pdfnative-cli 1.4.0 — by default `sign` is idempotent and refuses to sign an
# already-signed PDF; `--allow-multiple` appends a second signature field as an
# incremental revision, keeping the first signature's bytes intact. Each
# signature gets its own form field via --field-name. 100% offline.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH
#
# Usage:
#   pwsh -File samples\sign\09-multiple-signatures.ps1
#
# Output: samples\output\sign\09-multi-signed-twice.pdf

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output'
$SignOut   = Join-Path $OutputDir 'sign'
$KeysDir   = Join-Path $SignOut 'keys\multi'

New-Item -ItemType Directory -Force -Path $SignOut, $KeysDir | Out-Null

$UnsignedPdf = Join-Path $SignOut '09-multi-source.pdf'
$OncePdf     = Join-Path $SignOut '09-multi-signed-once.pdf'
$TwicePdf    = Join-Path $SignOut '09-multi-signed-twice.pdf'
$Key1  = Join-Path $KeysDir 'approver1.key'
$Cert1 = Join-Path $KeysDir 'approver1.crt'
$Key2  = Join-Path $KeysDir 'approver2.key'
$Cert2 = Join-Path $KeysDir 'approver2.crt'

# ── Step 1: render the source document ─────────────────────────────────────
Write-Host '→ [1/5] Rendering source document…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\document\04-invoice.json') `
  --output $UnsignedPdf
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "  ✓ Rendered: $UnsignedPdf"

# ── Step 2: generate two demo signer identities ────────────────────────────
if (-not (Test-Path $Cert1) -or -not (Test-Path $Cert2)) {
  Write-Host '→ [2/5] Generating two self-signed certificates (demo)…'
  & openssl req -x509 -newkey rsa:2048 -keyout $Key1 -out $Cert1 `
    -days 365 -nodes `
    -subj '/CN=pdfnative Demo Approver 1/O=pdfnative/C=US' 2>$null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & openssl req -x509 -newkey rsa:2048 -keyout $Key2 -out $Cert2 `
    -days 365 -nodes `
    -subj '/CN=pdfnative Demo Approver 2/O=pdfnative/C=US' 2>$null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "  ✓ Approver 1: $Cert1"
  Write-Host "  ✓ Approver 2: $Cert2"
} else {
  Write-Host "→ [2/5] Reusing demo certificates in $KeysDir"
}

# ── Step 3: first signature (field Approval1) ──────────────────────────────
Write-Host '→ [3/5] First signature (--field-name Approval1)…'
& pdfnative sign `
  --input      $UnsignedPdf `
  --output     $OncePdf `
  --key        $Key1 `
  --cert       $Cert1 `
  --field-name Approval1 `
  --reason     'First approval'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "  ✓ Signed once: $OncePdf"

# ── Step 4: second signature (--allow-multiple, field Approval2) ───────────
Write-Host '→ [4/5] Second signature (--allow-multiple --field-name Approval2)…'
& pdfnative sign `
  --input          $OncePdf `
  --output         $TwicePdf `
  --key            $Key2 `
  --cert           $Cert2 `
  --allow-multiple `
  --field-name     Approval2 `
  --reason         'Second approval'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "  ✓ Signed twice: $TwicePdf"

# ── Step 5: inventory + verify both signatures ─────────────────────────────
Write-Host '→ [5/5] inspect --signatures — expect two entries (Approval1, Approval2):'
& pdfnative inspect `
  --input $TwicePdf `
  --signatures `
  --format json `
  --fields signatures `
  --pretty
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host '→ verify — expect both signatures to validate:'
& pdfnative verify `
  --input  $TwicePdf `
  --format text
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Expect: two signature fields, and verify reports both as valid — the'
Write-Host "second revision did not break the first signature's byte range."
