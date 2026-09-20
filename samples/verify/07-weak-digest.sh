#!/usr/bin/env bash
# verify/07-weak-digest.sh — RFC 3161 timestamps with a SHA-1 imprint (v1.5.0)
#
# verify reports the messageImprint digest of every timestamp token as
# timestampDigest. A SHA-1 imprint (some legacy TSAs still issue them) adds
# the note "weak digest: RFC 3161 messageImprint uses SHA-1 (refused under
# --strict)"; --strict then exits 1 with E_VERIFY_FAILED. The CLI's own
# sign --timestamp never requests SHA-1 (sha256 | sha384 | sha512 only).
#
# Network-gated: needs a TSA URL in PDFNATIVE_TSA_URL to produce a real
# timestamped signature; without it the script explains and exits 0.
#
# Usage:
#   PDFNATIVE_TSA_URL=https://freetsa.org/tsr bash samples/verify/07-weak-digest.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/verify"
FIXTURES="$ROOT_DIR/tests/fixtures"
mkdir -p "$OUTPUT_DIR"

if [ -z "${PDFNATIVE_TSA_URL:-}" ]; then
  echo "PDFNATIVE_TSA_URL is not set — skipping the network step."
  echo "What verify reports on a timestamped signature:"
  echo "  timestampDigest: \"sha256\"      — the imprint algorithm of the token"
  echo "  notes: [\"weak digest: RFC 3161 messageImprint uses SHA-1 (refused under --strict)\"]  — when it is sha1"
  echo "  verify --strict → exit 1 (E_VERIFY_FAILED) on a sha1 imprint"
  exit 0
fi

pdfnative render --input "$ROOT_DIR/samples/render/document/01-minimal.json" --output "$OUTPUT_DIR/doc.pdf"
echo "→ Signing with a timestamp from $PDFNATIVE_TSA_URL (sha256 imprint)"
pdfnative sign --input "$OUTPUT_DIR/doc.pdf" --output "$OUTPUT_DIR/timestamped.pdf" \
  --key "$FIXTURES/rsa-key.pem" --cert "$FIXTURES/rsa-cert.pem" \
  --profile pades --timestamp "$PDFNATIVE_TSA_URL" --timestamp-timeout 15000
echo "→ verify: the imprint digest and any weak-digest note"
pdfnative verify --input "$OUTPUT_DIR/timestamped.pdf" --json --fields signatures.timestampDigest,signatures.timestampValid,signatures.notes
echo "→ verify --strict (a sha1 imprint would fail here)"
pdfnative verify --input "$OUTPUT_DIR/timestamped.pdf" --strict --summary
