#!/usr/bin/env bash
# extract/01-extract.sh — pull selected pages into a new PDF (pdfnative 1.5.0)
#
# Renders a four-page document, then extracts a subset of pages in an arbitrary
# order. --pages is a 1-based list/range; order is preserved and repeats are
# allowed (e.g. "3,1,1-2" keeps page 3, then 1, then 1 and 2 again).
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/extract/01-extract.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/extract"

mkdir -p "$OUTPUT_DIR"

echo "→ [1/2] Rendering a four-page source…"
pdfnative render \
  --input  "$ROOT_DIR/samples/split/multipage.json" \
  --output "$OUTPUT_DIR/source.pdf"

echo "→ [2/2] Extracting pages 4, 1 and 2 (order preserved)…"
pdfnative extract \
  --input  "$OUTPUT_DIR/source.pdf" \
  --output "$OUTPUT_DIR/01-extracted.pdf" \
  --pages  "4,1-2"

echo "  ✓ Output: $OUTPUT_DIR/01-extracted.pdf"
pdfnative inspect --input "$OUTPUT_DIR/01-extracted.pdf" --summary
