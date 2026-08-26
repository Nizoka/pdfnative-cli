# inspect/08-list-signatures.ps1 — signature inventory + "signatures>=N" gates
#
# pdfnative-cli 1.4.0 — `inspect --signatures` lists every signature form
# field (fieldName, subFilter, byteRange, isDocTimestamp, isPlaceholder —
# never the signature bytes), and `--check "signatures>=N"` turns the count
# into a CI gate (exit 0 when satisfied, exit 1 otherwise). 100% offline.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH
#
# Usage:
#   pwsh -File samples\inspect\08-list-signatures.ps1
#
# Output: samples\output\inspect\08-signed.pdf

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$OutputDir = Join-Path $RootDir 'samples\output\inspect'
$KeysDir   = Join-Path $OutputDir 'keys'

New-Item -ItemType Directory -Force -Path $OutputDir, $KeysDir | Out-Null

$PlainPdf  = Join-Path $OutputDir '08-plain.pdf'
$SignedPdf = Join-Path $OutputDir '08-signed.pdf'
$KeyFile   = Join-Path $KeysDir '08-signing.key'
$CertFile  = Join-Path $KeysDir '08-signing.crt'

# ── Step 1: render a document ──────────────────────────────────────────────
Write-Host '→ [1/4] Rendering source document…'
& pdfnative render `
  --input  (Join-Path $RootDir 'samples\render\document\01-minimal.json') `
  --output $PlainPdf
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "  ✓ Rendered: $PlainPdf"

# ── Step 2: sign it with a throwaway self-signed certificate ───────────────
Write-Host '→ [2/4] Signing with a self-signed demo certificate…'
if (-not (Test-Path $KeyFile) -or -not (Test-Path $CertFile)) {
  & openssl req -x509 -newkey rsa:2048 -keyout $KeyFile -out $CertFile `
    -days 365 -nodes `
    -subj '/CN=pdfnative Demo/O=pdfnative/C=US' 2>$null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& pdfnative sign `
  --input  $PlainPdf `
  --output $SignedPdf `
  --key    $KeyFile `
  --cert   $CertFile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "  ✓ Signed: $SignedPdf"

# ── Step 3: list the signature fields (JSON inventory) ─────────────────────
Write-Host '→ [3/4] inspect --signatures (JSON inventory):'
& pdfnative inspect `
  --input $SignedPdf `
  --signatures `
  --format json `
  --fields signatures `
  --pretty
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# ── Step 4: count gates — signatures>=1 passes, signatures>=2 fails ────────
Write-Host '→ [4/4] --check "signatures>=1" (expected PASS):'
& pdfnative inspect --input $SignedPdf --check 'signatures>=1' --format text | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host '  ✗ UNEXPECTED — gate failed.'; exit 1 }
Write-Host "  ✓ exit code $LASTEXITCODE — the document carries at least one signature."

Write-Host '→ --check "signatures>=2" (expected FAIL — shown pedagogically):'
& pdfnative inspect --input $SignedPdf --check 'signatures>=2' --format text | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host '  ✓ the gate exits 1 when the count is not reached — the failure is'
  Write-Host '    absorbed here for the demo; in CI you would let it fail the job.'
} else {
  Write-Host '  ✗ UNEXPECTED — the >=2 gate passed on a once-signed document.'; exit 1
}

Write-Host ''
Write-Host 'Expect: one signature entry in the inventory; the >=1 gate passes (exit 0)'
Write-Host 'and the >=2 gate fails cleanly (exit 1).'
