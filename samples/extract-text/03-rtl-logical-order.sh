#!/usr/bin/env bash
# extract-text/03-rtl-logical-order.sh — untagged right-to-left text extracts as typed (v1.6.0)
#
# pdfnative ≥ 1.9.0 writes every untagged right-to-left run (and every shaped run
# whose glyph order differs from its text) as /Span /ActualText, so extract-text
# returns the logical string without --tagged. --actual-text false restores the
# bare 1.8.0 runs, for comparison: the letters come back in visual order.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/extract-text/03-rtl-logical-order.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/extract-text"
RENDER_DIR="$ROOT_DIR/samples/render"
FONTS=(--font ar --font he --font latin --lang "ar,he,latin")
mkdir -p "$OUTPUT_DIR"

echo "→ Rendering Arabic and Hebrew paragraphs under --direction auto (untagged)"
pdfnative render --input "$RENDER_DIR/multilang/13-rtl-direction.json" --output "$OUTPUT_DIR/03-rtl.pdf" --direction auto "${FONTS[@]}" --creation-date 2026-01-01T00:00:00Z
echo "→ The same document with --actual-text false (the bare 1.8.0 runs)"
pdfnative render --input "$RENDER_DIR/multilang/13-rtl-direction.json" --output "$OUTPUT_DIR/03-rtl-bare.pdf" --direction auto --actual-text false "${FONTS[@]}" --creation-date 2026-01-01T00:00:00Z
echo "→ Logical order, as typed"
pdfnative extract-text --input "$OUTPUT_DIR/03-rtl.pdf" --pages 1
echo "→ Bare runs: every letter is there, in visual order"
pdfnative extract-text --input "$OUTPUT_DIR/03-rtl-bare.pdf" --pages 1
echo "✓ Done: $OUTPUT_DIR"
