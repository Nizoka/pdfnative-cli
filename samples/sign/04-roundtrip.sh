#!/usr/bin/env bash
# sign/04-roundtrip.sh — Full render → sign → verify pipeline
#
# Generates a self-signed RSA cert, renders an invoice, signs it, and asserts
# the resulting CMS signature is cryptographically valid (signatureValid: true).
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl, jq available on your PATH
#
# Usage:
#   bash samples/sign/04-roundtrip.sh
#
# Output: samples/output/sign/04-roundtrip-signed.pdf
# Exit code: 0 if signatureValid: true, 1 otherwise.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output"
SIGN_OUT="$OUTPUT_DIR/sign"
KEYS_DIR="$SIGN_OUT/keys"

mkdir -p "$SIGN_OUT" "$KEYS_DIR"

UNSIGNED_PDF="$SIGN_OUT/04-roundtrip-unsigned.pdf"
SIGNED_PDF="$SIGN_OUT/04-roundtrip-signed.pdf"
KEY_FILE="$KEYS_DIR/roundtrip.key"
CERT_FILE="$KEYS_DIR/roundtrip.crt"
REPORT_JSON="$SIGN_OUT/04-roundtrip-report.json"

# ── Step 1: render ─────────────────────────────────────────────────────────
echo "→ [1/3] Rendering invoice…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/document/04-invoice.json" \
  --output "$UNSIGNED_PDF"

# ── Step 2: keys + sign ────────────────────────────────────────────────────
if [ ! -f "$KEY_FILE" ] || [ ! -f "$CERT_FILE" ]; then
  openssl req -x509 -newkey rsa:2048 -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -days 365 -nodes \
    -subj "/CN=pdfnative Roundtrip Demo/O=pdfnative/C=US" 2>/dev/null
fi

echo "→ [2/3] Signing…"
pdfnative sign \
  --input  "$UNSIGNED_PDF" \
  --output "$SIGNED_PDF" \
  --key    "$KEY_FILE" \
  --cert   "$CERT_FILE" \
  --reason 'Roundtrip demo'

# ── Step 3: verify ─────────────────────────────────────────────────────────
echo "→ [3/3] Verifying…"
pdfnative verify \
  --input  "$SIGNED_PDF" \
  --trust  "$CERT_FILE" \
  --format json > "$REPORT_JSON"

cat "$REPORT_JSON"

# Assert signatureValid: true
if command -v jq >/dev/null 2>&1; then
  VALID=$(jq -r '.signatures[0].signatureValid' "$REPORT_JSON")
  if [ "$VALID" != "true" ]; then
    echo ""
    echo "✗ FAILED: signatureValid is '$VALID' (expected 'true')"
    exit 1
  fi
  echo ""
  echo "✓ Roundtrip OK: signatureValid=true"
else
  echo "(install jq to assert signatureValid programmatically)"
fi
