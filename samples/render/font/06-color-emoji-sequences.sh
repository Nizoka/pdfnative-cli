#!/usr/bin/env bash
# render/font/06-color-emoji-sequences.sh — colour emoji: skin tones, ZWJ sequences, flags (v1.5.0)
#
# --font color-emoji draws COLRv1 glyphs as vector forms. pdfnative 1.8.0 bundles
# 20 gestures and 10 people in all five skin tones: each toned form is one glyph.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/font/06-color-emoji-sequences.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/font"
mkdir -p "$OUTPUT_DIR"

echo "→ Rendering"
pdfnative render --input "$SCRIPT_DIR/06-color-emoji-sequences.json" --output "$OUTPUT_DIR/06-color-emoji-sequences.pdf" --font color-emoji --font latin --lang "color-emoji,latin" --creation-date 2026-01-01T00:00:00Z
echo "✓ Done: $OUTPUT_DIR"
