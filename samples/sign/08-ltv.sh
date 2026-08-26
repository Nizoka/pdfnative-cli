#!/usr/bin/env bash
# sign/08-ltv.sh — the full PAdES ladder: B-B → B-T → B-LT → B-LTA
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
#   bash samples/sign/08-ltv.sh
#   PDFNATIVE_TSA_URL=http://timestamp.digicert.com bash samples/sign/08-ltv.sh
#
# Output: samples/output/sign/08-ltv-pades-b.pdf
#         samples/output/sign/08-ltv-pades-t.pdf, -pades-lta.pdf (network mode)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output"
SIGN_OUT="$OUTPUT_DIR/sign"
KEYS_DIR="$SIGN_OUT/keys"

mkdir -p "$SIGN_OUT" "$KEYS_DIR"

UNSIGNED_PDF="$SIGN_OUT/08-ltv-source.pdf"
PADES_B_PDF="$SIGN_OUT/08-ltv-pades-b.pdf"
PADES_T_PDF="$SIGN_OUT/08-ltv-pades-t.pdf"
PADES_LTA_PDF="$SIGN_OUT/08-ltv-pades-lta.pdf"
KEY_FILE="$KEYS_DIR/signing.key"
CERT_FILE="$KEYS_DIR/signing.crt"

# ── Step 1: render + sign a PAdES B-B baseline (always offline) ────────────
echo "→ [1/4] Rendering and signing a PAdES B-B baseline (offline)…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/document/02-report.json" \
  --output "$UNSIGNED_PDF"
if [ ! -f "$KEY_FILE" ] || [ ! -f "$CERT_FILE" ]; then
  openssl req -x509 -newkey rsa:2048 -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -days 365 -nodes \
    -subj "/CN=pdfnative Demo/O=pdfnative/C=US" 2>/dev/null
fi
pdfnative sign \
  --input   "$UNSIGNED_PDF" \
  --output  "$PADES_B_PDF" \
  --key     "$KEY_FILE" \
  --cert    "$CERT_FILE" \
  --profile pades \
  --reason  "PAdES B-B baseline for the LTV ladder"
echo "  ✓ Signed (B-B): $PADES_B_PDF"

# ── Step 2: the full ladder, pedagogically ─────────────────────────────────
echo "→ [2/4] The complete PAdES ladder (each rung is an incremental revision):"
echo "    B-T   pdfnative sign --timestamp <tsa-url> --profile pades"
echo "    B-LT  pdfnative ltv add --online          # OCSP/CRL → /DSS + /VRI"
echo "    B-LTA pdfnative doc-timestamp --url <tsa-url>"
echo "    …     pdfnative ltv add --online          # LTV for the doc-timestamp"
echo "  Air-gapped variant: 'ltv collect --online' on a connected machine,"
echo "  then 'ltv embed --data ltv.json' offline (embed never touches the network)."

# ── Step 3: run the network rungs when a TSA is configured ─────────────────
if [ -n "${PDFNATIVE_TSA_URL:-}" ]; then
  echo "→ [3/4] B-T: signing with --timestamp against $PDFNATIVE_TSA_URL…"
  pdfnative sign \
    --input     "$UNSIGNED_PDF" \
    --output    "$PADES_T_PDF" \
    --key       "$KEY_FILE" \
    --cert      "$CERT_FILE" \
    --profile   pades \
    --timestamp "$PDFNATIVE_TSA_URL" \
    --reason    "PAdES B-T for the LTV ladder"
  echo "  ✓ B-T: $PADES_T_PDF"

  echo "  B-LT (ltv add --online) is not run here: the demo certificate is"
  echo "  self-signed and carries no OCSP/CRL endpoints (AIA/CDP), so there is"
  echo "  no revocation data to collect. With a CA-issued certificate you would run:"
  echo "    pdfnative ltv add --input \"$PADES_T_PDF\" --online --output out-lt.pdf"

  echo "  B-LTA: appending an RFC 3161 document timestamp…"
  pdfnative doc-timestamp \
    --input  "$PADES_T_PDF" \
    --url    "$PDFNATIVE_TSA_URL" \
    --output "$PADES_LTA_PDF"
  echo "  ✓ B-LTA: $PADES_LTA_PDF"
  INSPECT_PDF="$PADES_LTA_PDF"
else
  echo "→ [3/4] [skipped] network step — set PDFNATIVE_TSA_URL to run against a real TSA (e.g. http://timestamp.digicert.com)"
  echo "  Commands that would run:"
  echo "    pdfnative sign --input \"$UNSIGNED_PDF\" --output \"$PADES_T_PDF\" \\"
  echo "      --key \"$KEY_FILE\" --cert \"$CERT_FILE\" \\"
  echo "      --profile pades --timestamp \"\$PDFNATIVE_TSA_URL\""
  echo "    pdfnative doc-timestamp --input \"$PADES_T_PDF\" --url \"\$PDFNATIVE_TSA_URL\" \\"
  echo "      --output \"$PADES_LTA_PDF\""
  echo "  ('ltv add --online' additionally needs a CA-issued certificate with"
  echo "   real OCSP/CRL endpoints — see step 2.)"
  INSPECT_PDF="$PADES_B_PDF"
fi

# ── Step 4: inventory the signature fields ─────────────────────────────────
echo "→ [4/4] inspect --signatures on $INSPECT_PDF:"
pdfnative inspect \
  --input "$INSPECT_PDF" \
  --signatures \
  --format json \
  --fields signatures \
  --pretty

echo ""
echo "Expect: the B-B baseline lists one signature field; after the network"
echo "rungs the inventory also shows a /DocTimeStamp entry (isDocTimestamp: true)."
