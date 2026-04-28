#!/usr/bin/env bash
# inspect/04-check-pdfa.sh — assertion-style check; exits non-zero if PDF/A is missing
#
# Useful in CI: pipe the PDF through inspect --check pdfa and let the script bubble up.
#
# Usage:
#   bash samples/inspect/04-check-pdfa.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output"
PDFA_PDF="$OUTPUT_DIR/pdfa/02-pdfa-2b.pdf"

if [ ! -f "$PDFA_PDF" ]; then
  mkdir -p "$OUTPUT_DIR/pdfa"
  pdfnative render \
    --input  "$ROOT_DIR/samples/render/pdfa/02-pdfa-2b.json" \
    --output "$PDFA_PDF"
fi

echo "→ Asserting PDF/A conformance on $PDFA_PDF"
if pdfnative inspect --input "$PDFA_PDF" --check pdfa --format text; then
  echo "  ✓ PASS — document declares PDF/A conformance."
else
  echo "  ✗ FAIL — document does not declare PDF/A conformance."
  exit 1
fi
