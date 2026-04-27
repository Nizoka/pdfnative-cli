#!/usr/bin/env bash
# sign/01-basic.sh — Sign a rendered PDF with a self-signed certificate
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH
#
# Usage:
#   bash samples/sign/01-basic.sh
#
# Output: samples/output/sign/01-basic-signed.pdf

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output"
SIGN_OUT="$OUTPUT_DIR/sign"
KEYS_DIR="$SIGN_OUT/keys"

mkdir -p "$SIGN_OUT" "$KEYS_DIR"

UNSIGNED_PDF="$OUTPUT_DIR/document/02-report.pdf"
SIGNED_PDF="$SIGN_OUT/01-basic-signed.pdf"
KEY_FILE="$KEYS_DIR/signing.key"
CERT_FILE="$KEYS_DIR/signing.crt"

# ── Step 1: render the source document (if not already rendered) ───────────
if [ ! -f "$UNSIGNED_PDF" ]; then
  echo "→ Rendering source document…"
  mkdir -p "$OUTPUT_DIR/document"
  pdfnative render \
    --input  "$ROOT_DIR/samples/render/document/02-report.json" \
    --output "$UNSIGNED_PDF"
  echo "  ✓ Rendered: $UNSIGNED_PDF"
fi

# ── Step 2: generate self-signed certificate (for demo only) ───────────────
if [ ! -f "$KEY_FILE" ] || [ ! -f "$CERT_FILE" ]; then
  echo "→ Generating self-signed certificate (demo)…"
  openssl req -x509 -newkey rsa:2048 -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -days 365 -nodes \
    -subj "/CN=pdfnative Demo/O=pdfnative/C=US" 2>/dev/null
  echo "  ✓ Key:  $KEY_FILE"
  echo "  ✓ Cert: $CERT_FILE"
fi

# ── Step 3: sign the PDF ───────────────────────────────────────────────────
echo "→ Signing PDF…"
pdfnative sign \
  --input  "$UNSIGNED_PDF" \
  --output "$SIGNED_PDF" \
  --key    "$KEY_FILE" \
  --cert   "$CERT_FILE"

echo "  ✓ Signed: $SIGNED_PDF"
echo ""
echo "Done. Verify the signature with:"
echo "  pdfnative inspect --input \"$SIGNED_PDF\" --format json | grep -i sign"
