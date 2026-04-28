#!/usr/bin/env bash
# inspect/03-verbose-pages.sh — deep inspection with --verbose and --pages
#
# Prerequisites:
#   - pdfnative-cli installed globally
#
# Usage:
#   bash samples/inspect/03-verbose-pages.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output"
PDF="$OUTPUT_DIR/document/03-all-blocks.pdf"
INSPECT_OUT="$OUTPUT_DIR/inspect"

mkdir -p "$INSPECT_OUT"

if [ ! -f "$PDF" ]; then
  echo "→ Rendering source document…"
  mkdir -p "$OUTPUT_DIR/document"
  pdfnative render \
    --input  "$ROOT_DIR/samples/render/document/03-all-blocks.json" \
    --output "$PDF"
fi

echo "→ Inspecting (verbose + pages)…"
pdfnative inspect \
  --input   "$PDF" \
  --format  json \
  --verbose \
  --pages \
  --output  "$INSPECT_OUT/03-verbose-pages.json"

echo "  ✓ Report: $INSPECT_OUT/03-verbose-pages.json"
