#!/usr/bin/env bash
# split/01-split.sh — split one PDF into several (pdfnative 1.5.0 page-tree)
#
# Renders a four-page document, then splits it. Two modes are shown:
#   1. Default — one output PDF per page.
#   2. --pages "1-2,3-4" — one output PDF per comma-separated range.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/split/01-split.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/split"

mkdir -p "$OUTPUT_DIR/per-page" "$OUTPUT_DIR/per-range"

echo "→ [1/3] Rendering a four-page source…"
pdfnative render \
  --input  "$ROOT_DIR/samples/split/multipage.json" \
  --output "$OUTPUT_DIR/source.pdf"

echo "→ [2/3] Splitting one PDF per page (default)…"
pdfnative split \
  --input      "$OUTPUT_DIR/source.pdf" \
  --output-dir "$OUTPUT_DIR/per-page" \
  --prefix     page

echo "→ [3/3] Splitting into two ranges via --pages 1-2,3-4…"
pdfnative split \
  --input      "$OUTPUT_DIR/source.pdf" \
  --output-dir "$OUTPUT_DIR/per-range" \
  --pages      "1-2,3-4" \
  --prefix     section

echo "  ✓ Per-page:  $OUTPUT_DIR/per-page/"
echo "  ✓ Per-range: $OUTPUT_DIR/per-range/"
ls -1 "$OUTPUT_DIR/per-page" "$OUTPUT_DIR/per-range"
