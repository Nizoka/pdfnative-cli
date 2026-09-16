#!/usr/bin/env bash
# inspect/09-check-pdfx.sh — assertion-style PDF/X-4 check (v1.5.0)
#
# --check pdfx runs pdfnative's structural ISO 15930-7 validator and sets the
# exit code (0 = the prerequisites hold, 1 = E_CHECK_FAILED). --pdfx adds the
# full { valid, errors, warnings } report; --fields keeps the verdict only.
# veraPDF does not cover PDF/X — keep a certified preflight before press.
#
# Usage:
#   bash samples/inspect/09-check-pdfx.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output"
PRINT_DIR="$ROOT_DIR/samples/render/print"
PDFX_PDF="$OUTPUT_DIR/print/05-pdfx4.pdf"

if [ ! -f "$PDFX_PDF" ]; then
  mkdir -p "$OUTPUT_DIR/print"
  pdfnative render \
    --input  "$PRINT_DIR/05-pdfx4.json" \
    --output "$PDFX_PDF" \
    --pdfx pdfx4 --output-intent-icc "$PRINT_DIR/synthetic-cmyk.icc" \
    --trapped false --font latin --lang latin --strict
fi

echo "→ Token-economy verdict: inspect --pdfx --json --fields pdfxConformance,pdfx.valid"
pdfnative inspect --input "$PDFX_PDF" --pdfx --json --fields pdfxConformance,pdfx.valid

echo "→ Asserting PDF/X-4 on $PDFX_PDF"
if pdfnative inspect --input "$PDFX_PDF" --check pdfx --format text >/dev/null; then
  echo "  ✓ PASS — the file claims PDF/X-4 and the structural prerequisites hold."
else
  echo "  ✗ FAIL — the file is not a valid PDF/X-4 (see inspect --pdfx)."
  exit 1
fi
