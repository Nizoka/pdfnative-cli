#!/usr/bin/env bash
# render/headers-footers/01-page-numbers.sh — page templates with {page}/{pages}/{date}/{title}
#
# Demonstrates:
#   --header-left / --header-center / --header-right
#   --footer-left / --footer-center / --footer-right
#   Placeholders: {page}, {pages}, {date}, {title}
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/headers-footers/01-page-numbers.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/headers-footers"

mkdir -p "$OUTPUT_DIR"

echo "→ Rendering with header & footer templates…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/headers-footers/01-page-numbers.json" \
  --output "$OUTPUT_DIR/01-page-numbers.pdf" \
  --header-left   "{title}" \
  --header-right  "{date}" \
  --footer-center "Page {page} of {pages}"

echo "  ✓ Output: $OUTPUT_DIR/01-page-numbers.pdf"
echo ""
echo "Note: --footer-* with {pages} is incompatible with --stream (multi-pass pagination required)."
