#!/usr/bin/env bash
# render/print/07-tight-bleed-marks.sh — printer marks in a 3 mm bleed (v1.5.0)
#
# pdfnative 1.8.0 re-centres and shrinks the marks to the bleed strip and keeps
# their strokes inside the MediaBox; below 6.6 pt the registration targets are dropped.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/print/07-tight-bleed-marks.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/print"
mkdir -p "$OUTPUT_DIR"

echo "→ Rendering with an 8.5 pt bleed"
pdfnative render --input "$SCRIPT_DIR/07-tight-bleed-marks.json" --output "$OUTPUT_DIR/07-tight-bleed-marks.pdf" --creation-date 2026-01-01T00:00:00Z
echo "→ Page boxes"
pdfnative inspect --input "$OUTPUT_DIR/07-tight-bleed-marks.pdf" --pages --fields pages
echo "✓ Done: $OUTPUT_DIR"
