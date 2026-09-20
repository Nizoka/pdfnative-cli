#!/usr/bin/env bash
# extract-text/02-actualtext.sh — tagged output returns the source text of shaped scripts (v1.5.0)
#
# Shaping reorders and merges glyphs (reph, pre-base vowel signs, conjuncts), so the
# glyph order of a page is not its reading order. Under --tagged pdfnative 1.8.0
# writes /ActualText with the source string and extract-text honours it.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/extract-text/02-actualtext.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/extract-text"
RENDER_DIR="$ROOT_DIR/samples/render"
mkdir -p "$OUTPUT_DIR"

echo "→ Rendering Hindi, Bengali and Tamil as tagged PDF/A-2b"
pdfnative render --input "$RENDER_DIR/multilang/10-indic.json" --output "$OUTPUT_DIR/02-indic-tagged.pdf" --tagged pdfa2b --font hi --font bn --font ta --font latin --lang "hi,bn,ta,latin" --creation-date 2026-01-01T00:00:00Z
echo "→ Untagged, for comparison"
pdfnative render --input "$RENDER_DIR/multilang/10-indic.json" --output "$OUTPUT_DIR/02-indic-untagged.pdf" --font hi --font bn --font ta --font latin --lang "hi,bn,ta,latin" --creation-date 2026-01-01T00:00:00Z
echo "→ Tagged: the logical order comes back"
pdfnative extract-text --input "$OUTPUT_DIR/02-indic-tagged.pdf" --pages 1
echo "→ Untagged: every letter is there, in glyph order"
pdfnative extract-text --input "$OUTPUT_DIR/02-indic-untagged.pdf" --pages 1
echo "✓ Done: $OUTPUT_DIR"
