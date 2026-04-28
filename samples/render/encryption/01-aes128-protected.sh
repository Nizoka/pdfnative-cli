#!/usr/bin/env bash
# render/encryption/01-aes128-protected.sh — render an AES-128 encrypted PDF
#
# Demonstrates:
#   - --encrypt-owner-pass / --encrypt-user-pass (env-var precedence)
#   - --encrypt-algorithm aes128 (default)
#   - --encrypt-permissions print
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/encryption/01-aes128-protected.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/encryption"

mkdir -p "$OUTPUT_DIR"

# Secrets via environment (recommended) — fall back to demo values for the sample.
export PDFNATIVE_ENCRYPT_OWNER_PASS="${PDFNATIVE_ENCRYPT_OWNER_PASS:-owner-secret}"
export PDFNATIVE_ENCRYPT_USER_PASS="${PDFNATIVE_ENCRYPT_USER_PASS:-open-sesame}"

echo "→ Rendering AES-128 encrypted PDF…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/encryption/01-aes128-protected.json" \
  --output "$OUTPUT_DIR/01-aes128-protected.pdf" \
  --encrypt-algorithm aes128 \
  --encrypt-permissions "print"

echo "  ✓ Output: $OUTPUT_DIR/01-aes128-protected.pdf"
echo ""
echo "Verify it is encrypted:"
echo "  pdfnative inspect --input \"$OUTPUT_DIR/01-aes128-protected.pdf\" --check encrypted"
