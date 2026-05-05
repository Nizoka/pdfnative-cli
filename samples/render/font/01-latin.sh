#!/usr/bin/env bash
# render/font/01-latin.sh — Use --font latin shortcut (v0.3.0)
#
# Demonstrates the v0.3.0 `--font latin` flag, which registers the bundled
# Noto Sans Latin font module without requiring a programmatic font loader.
#
# Usage: bash samples/render/font/01-latin.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="$ROOT_DIR/samples/output/font"

mkdir -p "$OUT_DIR"

pdfnative render \
  --input  "$SCRIPT_DIR/01-latin.json" \
  --output "$OUT_DIR/01-latin.pdf" \
  --font   latin \
  --lang   latin

echo "✓ Rendered: $OUT_DIR/01-latin.pdf"
