#!/usr/bin/env bash
# config/01-config.sh — .pdfnativerc.json default flags (v1.0.0)
#
# Shows how a config file supplies default flags. We run `render` from this
# directory so the sample .pdfnativerc.json here is discovered. The config
# sets render defaults (letter page size, compression, zebra tables); an
# explicit CLI flag would still override them.
#
# Usage:
#   bash samples/config/01-config.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$ROOT_DIR/samples/output/config"
mkdir -p "$OUT_DIR"

echo "→ Rendering from $SCRIPT_DIR (its .pdfnativerc.json provides defaults):"
echo '{ "blocks": [ { "type": "paragraph", "text": "Rendered with config defaults." } ] }' \
  | (cd "$SCRIPT_DIR" && pdfnative render --output "$OUT_DIR/with-config.pdf")
echo "  ✓ $OUT_DIR/with-config.pdf  (letter size + compression from config)"

echo ""
echo "→ Same input with --no-config (built-in defaults, A4):"
echo '{ "blocks": [ { "type": "paragraph", "text": "Rendered ignoring config." } ] }' \
  | (cd "$SCRIPT_DIR" && pdfnative render --no-config --output "$OUT_DIR/no-config.pdf")
echo "  ✓ $OUT_DIR/no-config.pdf"

echo ""
echo "Compare page sizes:"
pdfnative inspect --input "$OUT_DIR/with-config.pdf" --pages --format json | grep -E 'width|height' | head -2
