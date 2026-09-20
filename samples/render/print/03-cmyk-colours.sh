#!/usr/bin/env bash
# render/print/03-cmyk-colours.sh — CMYK colours in every colour option (v1.5.0)
#
# pdfnative 1.8.0 accepts CMYK wherever a colour goes: [c, m, y, k] in percent
# or a "c m y k" operand string (0-1) - text, tables, zebra rows, chart series.
# The second render claims PDF/A-2b with the default sRGB intent: device CMYK
# contradicts it, and the render says so (PDFA_DEVICE_CMYK_CONTENT).
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/print/03-cmyk-colours.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/print"
mkdir -p "$OUTPUT_DIR"

echo "→ Rendering the CMYK document"
pdfnative render --input "$SCRIPT_DIR/03-cmyk-colours.json" --output "$OUTPUT_DIR/03-cmyk-colours.pdf" --creation-date 2026-01-01T00:00:00Z
echo "→ The same colours under a PDF/A-2b claim: a warning, not an error"
pdfnative render --input "$SCRIPT_DIR/03-cmyk-colours.json" --output "$OUTPUT_DIR/03-cmyk-colours-pdfa.pdf" --tagged pdfa2b --font latin --lang latin --creation-date 2026-01-01T00:00:00Z
echo "→ --strict turns the warning into a failure (exit 1, E_CHECK_FAILED)"
if pdfnative render --input "$SCRIPT_DIR/03-cmyk-colours.json" --output "$OUTPUT_DIR/03-cmyk-colours-strict.pdf" --tagged pdfa2b --font latin --lang latin --strict; then
  echo "  ✗ expected a refusal"
  exit 1
else
  echo "  ✓ refused, as expected"
fi
echo "✓ Done: $OUTPUT_DIR"
