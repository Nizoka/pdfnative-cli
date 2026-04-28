#!/usr/bin/env bash
# verify/01-self-signed.sh — verify a PDF signed with a self-signed certificate
#
# Demonstrates:
#   pdfnative verify --input signed.pdf
#
# Scope reminder (v0.2.0):
#   verify checks INTEGRITY (byte-range digest) + CHAIN (cert signatures) +
#   TRUST (--trust roots, or self-signed acceptance). Full CMS-signature-value
#   verification, OCSP/CRL revocation, and RFC 3161 timestamps are out of
#   scope until pdfnative exposes the corresponding primitives.
#
# Prerequisites:
#   - samples/sign/01-basic.sh has produced a signed PDF
#
# Usage:
#   bash samples/verify/01-self-signed.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SIGNED_PDF="$ROOT_DIR/samples/output/sign/01-basic-signed.pdf"

if [ ! -f "$SIGNED_PDF" ]; then
  echo "  ✗ Signed PDF not found. Run samples/sign/01-basic.sh first."
  exit 1
fi

echo "→ Verifying $SIGNED_PDF"
echo ""
pdfnative verify --input "$SIGNED_PDF" --format text

echo ""
echo "JSON output (machine-readable):"
pdfnative verify --input "$SIGNED_PDF" --format json
