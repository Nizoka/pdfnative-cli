#!/usr/bin/env bash
# sign/11-ltv-offline.sh — LTV from material you already hold, no network (v1.6.0)
#
# `ltv embed` takes the validation material straight from files (pdfnative ≥ 1.9.0
# composeLtvData): certificate chains (PEM or DER), OCSP responses and CRLs (DER),
# attributed to the document's signatures with --match all (every item from every
# VRI, the Adobe-tolerant superset) or --match chain (each VRI references only what
# validates that signature). Nothing here opens a socket — an air-gapped host can
# embed the material a connected host saved.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/sign/11-ltv-offline.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/sign"
FIXTURES="$ROOT_DIR/tests/fixtures"
mkdir -p "$OUTPUT_DIR"

echo "→ [1/4] Rendering and signing with the repository's test key pair (demo only)"
pdfnative render --input "$ROOT_DIR/samples/render/document/01-minimal.json" --output "$OUTPUT_DIR/11-source.pdf" --creation-date 2026-01-01T00:00:00Z
pdfnative sign --input "$OUTPUT_DIR/11-source.pdf" --output "$OUTPUT_DIR/11-signed.pdf" \
  --key "$FIXTURES/rsa-key.pem" --cert "$FIXTURES/rsa-cert.pem" --signing-time 2026-01-01T00:00:00Z

echo "→ [2/4] --dry-run composes the material and reports the counts, writes nothing"
pdfnative ltv embed --input "$OUTPUT_DIR/11-signed.pdf" --output "$OUTPUT_DIR/never.pdf" \
  --cert "$FIXTURES/rsa-cert.pem" --match chain --dry-run --json

echo "→ [3/4] Embedding the certificate as /DSS material (--match chain)"
pdfnative ltv embed --input "$OUTPUT_DIR/11-signed.pdf" --output "$OUTPUT_DIR/11-ltv-offline.pdf" \
  --cert "$FIXTURES/rsa-cert.pem" --match chain --json

echo "→ [4/4] The signature inventory still verifies; add --ocsp <der> / --crl <der> for revocation material"
pdfnative inspect --input "$OUTPUT_DIR/11-ltv-offline.pdf" --signatures --format json --fields signatures --pretty
echo "✓ Done: $OUTPUT_DIR"
