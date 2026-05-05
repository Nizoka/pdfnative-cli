#!/usr/bin/env bash
# verify/03-cms-rsa.sh — verify CMS RSA-SHA256 signature value (v0.3.0)
#
# Demonstrates:
#   pdfnative verify --format json → reports `signatureValid` for the CMS
#   PKCS#7 SignerInfo with RSA-SHA256, alongside the v0.2.0 integrity / chain
#   / trust outputs.
#
# Prerequisites:
#   - samples/sign/01-basic.sh has produced a signed PDF (RSA-SHA256)
#
# Usage:
#   bash samples/verify/03-cms-rsa.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SIGNED_PDF="$ROOT_DIR/samples/output/sign/01-basic-signed.pdf"
TRUST_CERT="$ROOT_DIR/samples/output/sign/keys/signing.crt"

if [ ! -f "$SIGNED_PDF" ]; then
  echo "  ✗ Signed PDF not found. Run samples/sign/01-basic.sh first."
  exit 1
fi

echo "→ Verifying CMS RSA-SHA256 signature value of:"
echo "  $SIGNED_PDF"
echo ""
pdfnative verify \
  --input  "$SIGNED_PDF" \
  --trust  "$TRUST_CERT" \
  --format json

echo ""
echo "Look for:"
echo "  signatureAlgorithm: \"rsa-sha256\""
echo "  signatureValid:     true"
