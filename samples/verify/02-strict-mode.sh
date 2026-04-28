#!/usr/bin/env bash
# verify/02-strict-mode.sh — --strict makes verify exit 1 on any failure
#
# In CI, --strict is what you want: the command exits with a non-zero status
# if any signature fails integrity, chain, or trust checks (or if there are
# zero signatures at all).
#
# Usage:
#   bash samples/verify/02-strict-mode.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SIGNED_PDF="$ROOT_DIR/samples/output/sign/01-basic-signed.pdf"
UNSIGNED_PDF="$ROOT_DIR/samples/output/document/02-report.pdf"

if [ ! -f "$SIGNED_PDF" ] || [ ! -f "$UNSIGNED_PDF" ]; then
  echo "  ✗ Required PDFs missing. Run samples/sign/01-basic.sh first."
  exit 1
fi

echo "→ Strict verify on signed PDF (expect exit 0)…"
pdfnative verify --input "$SIGNED_PDF" --strict --format text || {
  echo "  ✗ Unexpected failure on a valid self-signed PDF."
  exit 1
}
echo "  ✓ Pass."
echo ""

echo "→ Strict verify on UNSIGNED PDF (expect exit 1)…"
if pdfnative verify --input "$UNSIGNED_PDF" --strict --format text; then
  echo "  ✗ Strict mode should have failed on an unsigned PDF."
  exit 1
else
  echo "  ✓ Correctly exited non-zero."
fi
