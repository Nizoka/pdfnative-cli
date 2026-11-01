#!/usr/bin/env bash
# render/print/09-dual-pdfa2b-pdfx4.sh — PDF/A-2b and PDF/X-4 in one file (v1.6.0)
#
# pdfnative ≥ 1.9.0 claims PDF/A-2b (or 2u) and PDF/X-4 together: pdfaid and
# pdfxid in the XMP, two OutputIntents on one CMYK profile. inspect --check
# pdfa,pdfx asserts both; the PDF/A-1b pairing is refused by the engine (E_INPUT).
#
# Usage:
#   bash samples/render/print/09-dual-pdfa2b-pdfx4.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/print"
PRINT_DIR="$ROOT_DIR/samples/render/print"
mkdir -p "$OUTPUT_DIR"

echo "→ Rendering PDF/A-2b + PDF/X-4"
pdfnative render \
  --input  "$PRINT_DIR/09-dual-pdfa2b-pdfx4.json" \
  --output "$OUTPUT_DIR/09-dual-pdfa2b-pdfx4.pdf" \
  --pdfx pdfx4 \
  --tagged pdfa2b \
  --output-intent-icc "$PRINT_DIR/synthetic-cmyk.icc" \
  --output-intent-id "Synthetic CMYK (pdfnative test profile)" \
  --trapped false \
  --font latin --lang latin \
  --strict \
  --json \
  --creation-date 2026-01-01T00:00:00Z

echo "→ Both claims, one exit code"
pdfnative inspect --input "$OUTPUT_DIR/09-dual-pdfa2b-pdfx4.pdf" --check pdfa,pdfx --json --summary

echo "→ PDF/A-1b with PDF/X-4 is refused by the engine (E_INPUT), shown with --dry-run"
if pdfnative render --input "$PRINT_DIR/09-dual-pdfa2b-pdfx4.json" --output "$OUTPUT_DIR/never.pdf" --dry-run --json \
     --pdfx pdfx4 --tagged pdfa1b --output-intent-icc "$PRINT_DIR/synthetic-cmyk.icc" --trapped false --font latin --lang latin 2>"$OUTPUT_DIR/09-pdfa1b.err"; then
  echo "  ✗ unexpected: PDF/A-1b + PDF/X-4 was accepted"
  exit 1
else
  echo "  ✓ expected: refused — $(tr -d '\n' < "$OUTPUT_DIR/09-pdfa1b.err" | cut -c1-120)"
fi
echo "✓ Done: $OUTPUT_DIR"
