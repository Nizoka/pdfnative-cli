#!/usr/bin/env bash
# render/print/04-colour-bars.sh — crop marks, registration targets and colour control bars (v1.5.0)
#
# print.marks.colourBars draws CMYK solids and tints outside the trimmed page,
# in a 5 mm bleed; the marks use the registration colour (the All separation).
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/print/04-colour-bars.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/print"
mkdir -p "$OUTPUT_DIR"

echo "→ Rendering with colour bars"
pdfnative render --input "$SCRIPT_DIR/04-colour-bars.json" --output "$OUTPUT_DIR/04-colour-bars.pdf" --creation-date 2026-01-01T00:00:00Z
echo "→ Page boxes"
pdfnative inspect --input "$OUTPUT_DIR/04-colour-bars.pdf" --pages --fields pages
echo "✓ Done: $OUTPUT_DIR"
