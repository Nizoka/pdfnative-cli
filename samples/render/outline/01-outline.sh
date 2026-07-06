#!/usr/bin/env bash
# render/outline/01-outline.sh — PDF bookmarks (outline tree), two ways
#
# `--outline` adds a navigable bookmark tree (PDF /Outlines) to the document:
#   • --outline auto           → derive bookmarks from the document's headings
#   • --outline <tree.json>    → supply an explicit OutlineItem[] tree
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/outline/01-outline.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/outline"

mkdir -p "$OUTPUT_DIR"

echo "→ [1/2] Auto bookmarks derived from headings (--outline auto)…"
pdfnative render \
  --input   "$ROOT_DIR/samples/render/outline/01-headings.json" \
  --output  "$OUTPUT_DIR/01-auto.pdf" \
  --outline auto

echo "→ [2/2] Explicit bookmark tree (--outline <tree.json>)…"
pdfnative render \
  --input   "$ROOT_DIR/samples/render/outline/01-headings.json" \
  --output  "$OUTPUT_DIR/02-tree.pdf" \
  --outline "$ROOT_DIR/samples/render/outline/02-outline-tree.json"

echo "  ✓ Output: $OUTPUT_DIR/01-auto.pdf and $OUTPUT_DIR/02-tree.pdf"
