#!/usr/bin/env bash
# render/font/03-emoji.sh — monochrome emoji via the --font emoji shortcut
#
# Registers the bundled Noto Emoji (monochrome) font. Emoji render as single-
# colour glyphs that inherit the surrounding text colour — the complement to
# 02-new-scripts.sh, which uses --font color-emoji for full-colour COLRv1.
#
# Usage: bash samples/render/font/03-emoji.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="$ROOT_DIR/samples/output/font"

mkdir -p "$OUT_DIR"

pdfnative render \
  --input  "$SCRIPT_DIR/03-emoji.json" \
  --output "$OUT_DIR/03-emoji.pdf" \
  --font emoji \
  --lang emoji

echo "✓ Rendered: $OUT_DIR/03-emoji.pdf"
