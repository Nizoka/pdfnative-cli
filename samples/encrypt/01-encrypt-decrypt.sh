#!/usr/bin/env bash
# encrypt/01-encrypt-decrypt.sh — re-secure and unlock a PDF (pdfnative 1.6.0)
#
# Encrypts a document with AES-256 (owner + user passwords), confirms the
# scheme with `inspect --encryption`, then decrypts it back to plaintext.
# Passwords are read from environment variables (winning over flags) and are
# never logged.
#
# NOTE: encrypt/decrypt rebuild the page tree (like `merge`), so signatures and
# form fields are dropped. Requires a Web Crypto CSPRNG (Node >= 20).
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/encrypt/01-encrypt-decrypt.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/encrypt"

mkdir -p "$OUTPUT_DIR"

echo "→ [1/4] Rendering a source document…"
pdfnative render \
  --input  "$ROOT_DIR/samples/extract-text/document.json" \
  --output "$OUTPUT_DIR/source.pdf"

# Set the encryption passwords AFTER rendering — `render` itself would encrypt
# its output if these were set beforehand.
export PDFNATIVE_ENCRYPT_OWNER_PASS="owner-secret"
export PDFNATIVE_ENCRYPT_USER_PASS="open-sesame"

echo "→ [2/4] Encrypting with AES-256 (passwords from env)…"
pdfnative encrypt \
  --input     "$OUTPUT_DIR/source.pdf" \
  --output    "$OUTPUT_DIR/encrypted.pdf" \
  --algorithm aes-256 \
  --permissions print

echo "→ [3/4] Confirming the encryption scheme…"
pdfnative inspect --input "$OUTPUT_DIR/encrypted.pdf" \
  --encryption --password "$PDFNATIVE_ENCRYPT_USER_PASS" --format text

echo "→ [4/4] Decrypting back to plaintext…"
pdfnative decrypt \
  --input    "$OUTPUT_DIR/encrypted.pdf" \
  --output   "$OUTPUT_DIR/decrypted.pdf" \
  --password "$PDFNATIVE_ENCRYPT_USER_PASS"
pdfnative inspect --input "$OUTPUT_DIR/decrypted.pdf" --encryption --format text
echo "  ✓ Outputs in $OUTPUT_DIR"

# Tip: add --stream (with an optional --chunk-size N) to encrypt/decrypt a large
# PDF at constant memory, e.g.:
#   pdfnative encrypt --input big.pdf --owner-password "$PDFNATIVE_ENCRYPT_OWNER_PASS" \
#     --algorithm aes-256 --stream --output big.enc.pdf
