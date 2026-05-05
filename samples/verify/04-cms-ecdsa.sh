#!/usr/bin/env bash
# verify/04-cms-ecdsa.sh — verify CMS ECDSA-SHA256 signature value (v0.3.0)
#
# Prerequisites:
#   - samples/sign/03-ecdsa.sh has produced an ECDSA-signed PDF
#
# Usage:
#   bash samples/verify/04-cms-ecdsa.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SIGNED_PDF="$ROOT_DIR/samples/output/sign/03-ecdsa-signed.pdf"
TRUST_CERT="$ROOT_DIR/samples/output/sign/keys/ecdsa.crt"

if [ ! -f "$SIGNED_PDF" ]; then
  echo "  ✗ ECDSA-signed PDF not found. Run samples/sign/03-ecdsa.sh first."
  exit 1
fi

echo "→ Verifying CMS ECDSA-SHA256 signature value of:"
echo "  $SIGNED_PDF"
echo ""
pdfnative verify \
  --input  "$SIGNED_PDF" \
  --trust  "$TRUST_CERT" \
  --format json

echo ""
echo "Look for:"
echo "  signatureAlgorithm: \"ecdsa-sha256\""
echo "  signatureValid:     true"
