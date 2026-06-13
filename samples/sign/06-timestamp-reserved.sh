#!/usr/bin/env bash
# sign/06-timestamp-reserved.sh — the reserved --timestamp flag (PAdES-T)
#
# Sign-side RFC 3161 timestamping is intentionally NOT yet available: embedding
# a timestamp token at signing time needs upstream support in pdfnative. The
# CLI surfaces the flag so the contract is discoverable, but it fails fast with
# a clear message and exit code 2 (E_UNSUPPORTED) rather than silently dropping
# the timestamp. Timestamp VALIDATION is already supported by `pdfnative verify`.
#
# This sample asserts that contract — it expects the command to FAIL.
#
# Usage:
#   bash samples/sign/06-timestamp-reserved.sh

set -uo pipefail   # note: not -e; we expect a non-zero exit below

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "→ Attempting sign --timestamp (expected to fail)…"
set +e
pdfnative sign \
  --input     "$ROOT_DIR/samples/render/document/01-minimal.json" \
  --timestamp "http://timestamp.example/tsa" \
  --json 2>/tmp/pdfnative-ts.err
STATUS=$?
set -e

echo "  exit code: $STATUS (expected 2)"
echo "  stderr envelope:"
sed 's/^/    /' /tmp/pdfnative-ts.err

if [ "$STATUS" -eq 2 ]; then
  echo "  ✓ PASS — reserved flag rejected as documented."
else
  echo "  ✗ UNEXPECTED — flag did not fail with exit 2."
  exit 1
fi
