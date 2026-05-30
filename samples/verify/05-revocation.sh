#!/usr/bin/env bash
# verify/05-revocation.sh — timestamp + OCSP/CRL revocation reporting (v1.0.0)
#
# Demonstrates the LTV-aware verify report. By default revocation is checked
# OFFLINE (embedded /DSS only); for a self-signed test certificate there is no
# revocation authority, so `revocationStatus` is reported as "unknown" with an
# explanatory note. The flags below show the full surface.
#
# Prerequisites:
#   - samples/sign/01-basic.sh has produced a signed PDF (RSA-SHA256)
#
# Usage:
#   bash samples/verify/05-revocation.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SIGNED_PDF="$ROOT_DIR/samples/output/sign/01-basic-signed.pdf"
TRUST_CERT="$ROOT_DIR/samples/output/sign/keys/signing.crt"

if [ ! -f "$SIGNED_PDF" ]; then
  echo "  ✗ Signed PDF not found. Run samples/sign/01-basic.sh first."
  exit 1
fi

echo "→ Offline revocation (embedded /DSS only — the default):"
pdfnative verify \
  --input       "$SIGNED_PDF" \
  --trust       "$TRUST_CERT" \
  --revocation  offline \
  --format      json

echo ""
echo "Report fields to look for:"
echo "  timestampValid       — true once the PDF carries a valid RFC 3161 token"
echo "  revocationChecked    — false here (self-signed has no authority)"
echo "  revocationStatus     — good | revoked | unknown"
echo "  revocationSource     — embedded | online | none"
echo ""
echo "Note: '--revocation online' additionally fetches OCSP (AIA) and CRL (CDP)"
echo "      through the SSRF-guarded client. '--revocation-policy strict' fails"
echo "      the signature on any non-'good' status."
