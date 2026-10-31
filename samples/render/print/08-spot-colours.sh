#!/usr/bin/env bash
# render/print/08-spot-colours.sh — spot colours under PDF/X-4 (v1.6.0)
#
# 1. render --pdfx pdfx4 the spot-colour brochure: the inks are declared in
#    layout.print.spotColours, the colours { spot } / { inks } paint through
#    /Separation and /DeviceN spaces, and a chart paints each bar in its plate's
#    ink (ChartSeries.colors, pdfnative ≥ 1.9.0);
# 2. inspect --check pdfx asserts the ISO 15930-7 prerequisites still hold;
# 3. an undeclared ink is refused before anything is written — shown with --dry-run.
#
# Usage:
#   bash samples/render/print/08-spot-colours.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/print"
PRINT_DIR="$ROOT_DIR/samples/render/print"
mkdir -p "$OUTPUT_DIR"

echo "→ Rendering the spot-colour brochure as PDF/X-4"
pdfnative render \
  --input  "$PRINT_DIR/08-spot-colours.json" \
  --output "$OUTPUT_DIR/08-spot-colours.pdf" \
  --pdfx pdfx4 \
  --output-intent-icc "$PRINT_DIR/synthetic-cmyk.icc" \
  --output-intent-id "Synthetic CMYK (pdfnative test profile)" \
  --trapped false \
  --font latin --lang latin \
  --strict \
  --creation-date 2026-01-01T00:00:00Z

echo "→ Asserting the PDF/X-4 claim (CI-style)"
pdfnative inspect --input "$OUTPUT_DIR/08-spot-colours.pdf" --check pdfx --json --summary

echo "→ An undeclared ink is E_INPUT, before any byte is written (--dry-run)"
printf '%s' '{"title":"Undeclared","blocks":[{"type":"paragraph","text":"x","color":{"spot":"PANTONE 7 C"}}],"layout":{"print":{"bleed":8.5,"spotColours":[{"name":"PANTONE 300 C","alternate":[100,44,0,0]}]}}}' > "$OUTPUT_DIR/08-undeclared.json"
if pdfnative render --input "$OUTPUT_DIR/08-undeclared.json" --output "$OUTPUT_DIR/never.pdf" --dry-run --json --font latin --lang latin 2>"$OUTPUT_DIR/08-undeclared.err"; then
  echo "  ✗ unexpected: the undeclared ink was accepted"
  exit 1
else
  echo "  ✓ expected: refused — $(tr -d '\n' < "$OUTPUT_DIR/08-undeclared.err" | cut -c1-120)"
fi
echo "✓ Done: $OUTPUT_DIR"
