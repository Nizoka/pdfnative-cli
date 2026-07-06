#!/usr/bin/env bash
# render/math/01-math.sh — mathematical & technical symbols (pdfnative 1.5.0)
#
# Registers the bundled math font alongside Latin so that operators, Greek
# letters, set relations and blackboard-bold code points render as real glyphs
# instead of .notdef tofu. pdfnative auto-routes each code point to the font
# whose cmap covers it, so just registering `--font math` is enough.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/math/01-math.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/math"

mkdir -p "$OUTPUT_DIR"

echo "→ Rendering with the math font registered…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/math/01-math.json" \
  --output "$OUTPUT_DIR/01-math.pdf" \
  --font   latin \
  --font   math

echo "  ✓ Output: $OUTPUT_DIR/01-math.pdf"
