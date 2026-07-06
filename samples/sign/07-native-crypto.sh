#!/usr/bin/env bash
# sign/07-native-crypto.sh — native (node:crypto) vs pure-JS signing
#
# As of pdfnative-cli 1.2.0, `sign` uses Node's built-in node:crypto for the
# RSA/ECDSA signature by DEFAULT — a constant-time, side-channel-resistant path.
# Pass `--pure-crypto` to force pdfnative's portable pure-JS bignum math instead
# (useful on runtimes without a native crypto backend). Both produce a valid
# CMS signature; this sample signs the same document both ways and verifies each.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#   - openssl available on your PATH
#
# Usage:
#   bash samples/sign/07-native-crypto.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SIGN_OUT="$ROOT_DIR/samples/output/sign"
KEYS_DIR="$SIGN_OUT/keys"

mkdir -p "$SIGN_OUT" "$KEYS_DIR"

UNSIGNED_PDF="$SIGN_OUT/07-unsigned.pdf"
NATIVE_PDF="$SIGN_OUT/07-native-signed.pdf"
PURE_PDF="$SIGN_OUT/07-pure-signed.pdf"
KEY_FILE="$KEYS_DIR/native.key"
CERT_FILE="$KEYS_DIR/native.crt"

echo "→ [1/4] Rendering + key material…"
pdfnative render --input "$ROOT_DIR/samples/render/document/02-report.json" --output "$UNSIGNED_PDF"
if [ ! -f "$KEY_FILE" ] || [ ! -f "$CERT_FILE" ]; then
  openssl req -x509 -newkey rsa:2048 -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -days 365 -nodes -subj "/CN=pdfnative Native Crypto Demo/O=pdfnative/C=US" 2>/dev/null
fi

echo "→ [2/4] Signing with native node:crypto (default)…"
pdfnative sign --input "$UNSIGNED_PDF" --output "$NATIVE_PDF" --key "$KEY_FILE" --cert "$CERT_FILE"

echo "→ [3/4] Signing with pure-JS crypto (--pure-crypto)…"
pdfnative sign --input "$UNSIGNED_PDF" --output "$PURE_PDF" --key "$KEY_FILE" --cert "$CERT_FILE" --pure-crypto

echo "→ [4/4] Verifying both signatures…"
pdfnative verify --input "$NATIVE_PDF" --trust "$CERT_FILE" --summary
pdfnative verify --input "$PURE_PDF"   --trust "$CERT_FILE" --summary

echo "  ✓ Native: $NATIVE_PDF"
echo "  ✓ Pure:   $PURE_PDF"
