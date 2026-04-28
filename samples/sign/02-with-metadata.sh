#!/usr/bin/env bash
# sign/02-with-metadata.sh — Sign with reason / name / location / contact / signing-time
#
# Demonstrates:
#   --reason / --name / --location / --contact / --signing-time
#
# Prerequisites:
#   - 01-basic.sh has been run once (re-uses generated key/cert)
#
# Usage:
#   bash samples/sign/02-with-metadata.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output"
SIGN_OUT="$OUTPUT_DIR/sign"
KEYS_DIR="$SIGN_OUT/keys"

mkdir -p "$SIGN_OUT"

UNSIGNED_PDF="$OUTPUT_DIR/document/02-report.pdf"
SIGNED_PDF="$SIGN_OUT/02-with-metadata-signed.pdf"
KEY_FILE="$KEYS_DIR/signing.key"
CERT_FILE="$KEYS_DIR/signing.crt"

if [ ! -f "$KEY_FILE" ] || [ ! -f "$CERT_FILE" ]; then
  echo "  ✗ Key or certificate missing. Run samples/sign/01-basic.sh first."
  exit 1
fi

if [ ! -f "$UNSIGNED_PDF" ]; then
  echo "→ Rendering source document…"
  mkdir -p "$OUTPUT_DIR/document"
  pdfnative render \
    --input  "$ROOT_DIR/samples/render/document/02-report.json" \
    --output "$UNSIGNED_PDF"
fi

echo "→ Signing PDF with full metadata…"
pdfnative sign \
  --input         "$UNSIGNED_PDF" \
  --output        "$SIGNED_PDF" \
  --key           "$KEY_FILE" \
  --cert          "$CERT_FILE" \
  --reason        "Approved for distribution" \
  --name          "Jane Doe" \
  --location      "Paris, FR" \
  --contact       "compliance@example.com" \
  --signing-time  "2026-04-28T10:00:00Z"

echo "  ✓ Signed: $SIGNED_PDF"
echo ""
echo "Inspect signature metadata:"
echo "  pdfnative verify --input \"$SIGNED_PDF\" --format text"
