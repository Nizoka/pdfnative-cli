#!/usr/bin/env bash
# sign/03-ecdsa.sh — Sign a rendered PDF with an ECDSA-SHA256 (P-256) certificate
#
# Demonstrates the v0.3.0 --algorithm ecdsa-sha256 flag.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH
#
# Usage:
#   bash samples/sign/03-ecdsa.sh
#
# Output: samples/output/sign/03-ecdsa-signed.pdf

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output"
SIGN_OUT="$OUTPUT_DIR/sign"
KEYS_DIR="$SIGN_OUT/keys"

mkdir -p "$SIGN_OUT" "$KEYS_DIR"

UNSIGNED_PDF="$OUTPUT_DIR/document/02-report.pdf"
SIGNED_PDF="$SIGN_OUT/03-ecdsa-signed.pdf"
KEY_FILE="$KEYS_DIR/ecdsa.key"
CERT_FILE="$KEYS_DIR/ecdsa.crt"

# ── Step 1: render the source document (if not already rendered) ───────────
if [ ! -f "$UNSIGNED_PDF" ]; then
  echo "→ Rendering source document…"
  mkdir -p "$OUTPUT_DIR/document"
  pdfnative render \
    --input  "$ROOT_DIR/samples/render/document/02-report.json" \
    --output "$UNSIGNED_PDF"
  echo "  ✓ Rendered: $UNSIGNED_PDF"
fi

# ── Step 2: generate self-signed P-256 certificate (demo only) ─────────────
if [ ! -f "$KEY_FILE" ] || [ ! -f "$CERT_FILE" ]; then
  echo "→ Generating self-signed P-256 certificate (demo)…"
  openssl ecparam -name prime256v1 -genkey -noout -out "$KEY_FILE" 2>/dev/null
  openssl req -new -x509 -key "$KEY_FILE" -out "$CERT_FILE" \
    -days 365 -sha256 \
    -subj "/CN=pdfnative ECDSA Demo/O=pdfnative/C=US" 2>/dev/null
  echo "  ✓ Key:  $KEY_FILE"
  echo "  ✓ Cert: $CERT_FILE"
fi

# ── Step 3: sign with ECDSA-SHA256 ─────────────────────────────────────────
echo "→ Signing PDF with ECDSA-SHA256…"
pdfnative sign \
  --input     "$UNSIGNED_PDF" \
  --output    "$SIGNED_PDF" \
  --key       "$KEY_FILE" \
  --cert      "$CERT_FILE" \
  --algorithm ecdsa-sha256

echo "  ✓ Signed: $SIGNED_PDF"
echo ""
echo "Verify with:"
echo "  pdfnative verify --input \"$SIGNED_PDF\" --format json"
