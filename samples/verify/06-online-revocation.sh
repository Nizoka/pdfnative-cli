#!/usr/bin/env bash
# verify/06-online-revocation.sh — opt-in online revocation (OCSP/CRL)
#
# `verify` is OFFLINE by default. With --revocation online it additionally
# fetches OCSP responders (from the certificate AIA extension) and CRLs (from
# CDP) — but ONLY through the SSRF-guarded HTTP(S) client: scheme allow-list,
# private/loopback/link-local/CGNAT/multicast blocking, no redirects, plus
# timeout and size caps. CRL/OCSP/TSA signatures are always verified; data that
# cannot be verified yields "unknown", never "good".
#
# A self-signed demo certificate has no revocation authority, so this script
# runs OFFLINE by default and shows the online invocation as a commented hint
# — uncomment it only against a certificate that publishes AIA/CDP endpoints.
#
# Prerequisites:
#   - samples/sign/01-basic.sh has produced a signed PDF
#
# Usage:
#   bash samples/verify/06-online-revocation.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SIGNED_PDF="$ROOT_DIR/samples/output/sign/01-basic-signed.pdf"
TRUST_CERT="$ROOT_DIR/samples/output/sign/keys/signing.crt"

if [ ! -f "$SIGNED_PDF" ]; then
  echo "  ✗ Signed PDF not found. Run samples/sign/01-basic.sh first."
  exit 1
fi

echo "→ Offline revocation (default, no network):"
pdfnative verify \
  --input             "$SIGNED_PDF" \
  --trust             "$TRUST_CERT" \
  --revocation        offline \
  --revocation-policy soft-fail \
  --format            json

echo ""
echo "Online variant (network; SSRF-guarded). Uncomment for a CA-issued cert"
echo "that publishes OCSP/CRL endpoints:"
echo ""
echo "  pdfnative verify \\"
echo "    --input \"$SIGNED_PDF\" \\"
echo "    --trust \"$TRUST_CERT\" \\"
echo "    --revocation online \\"
echo "    --revocation-policy strict \\"
echo "    --format json"
echo ""
echo "Policy: soft-fail rejects only an explicit 'revoked'; strict rejects any"
echo "        non-'good' status (including 'unknown')."

# --- Online invocation (disabled by default; requires AIA/CDP endpoints) -----
# pdfnative verify \
#   --input             "$SIGNED_PDF" \
#   --trust             "$TRUST_CERT" \
#   --revocation        online \
#   --revocation-policy strict \
#   --format            json
