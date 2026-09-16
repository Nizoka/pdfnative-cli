#!/usr/bin/env bash
# sign/10-timestamp-timeout.sh — a per-request TSA timeout (v1.5.0)
#
# --timestamp-timeout <ms> bounds the single guarded HTTP request to the
# time-stamp authority (default 10000 ms, like ltv --timeout and
# doc-timestamp --timeout). A timeout aborts the command with E_NETWORK —
# never a silent untimestamped signature. Network-gated: needs a TSA URL in
# PDFNATIVE_TSA_URL; --dry-run below never contacts it.
#
# Usage:
#   PDFNATIVE_TSA_URL=https://freetsa.org/tsr bash samples/sign/10-timestamp-timeout.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/sign"
FIXTURES="$ROOT_DIR/tests/fixtures"
mkdir -p "$OUTPUT_DIR"
TSA_URL="${PDFNATIVE_TSA_URL:-https://tsa.example.invalid/tsr}"

pdfnative render --input "$ROOT_DIR/samples/render/document/01-minimal.json" --output "$OUTPUT_DIR/doc.pdf"

echo "→ --dry-run validates the flags (URL, digest, timeout) and never opens a socket"
pdfnative sign --input "$OUTPUT_DIR/doc.pdf" --output "$OUTPUT_DIR/never.pdf" \
  --key "$FIXTURES/rsa-key.pem" --cert "$FIXTURES/rsa-cert.pem" \
  --timestamp "$TSA_URL" --timestamp-timeout 3000 --dry-run --json

if [ -z "${PDFNATIVE_TSA_URL:-}" ]; then
  echo "PDFNATIVE_TSA_URL is not set — skipping the real request."
  exit 0
fi
echo "→ Signing with a 15 s budget for the TSA round trip"
pdfnative sign --input "$OUTPUT_DIR/doc.pdf" --output "$OUTPUT_DIR/timestamped.pdf" \
  --key "$FIXTURES/rsa-key.pem" --cert "$FIXTURES/rsa-cert.pem" \
  --profile pades --timestamp "$PDFNATIVE_TSA_URL" --timestamp-timeout 15000 --json
