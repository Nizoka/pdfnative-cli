#!/usr/bin/env bash
# extract-text/01-extract-text.sh — extract reading-order text (pdfnative 1.6.0)
#
# Renders a two-page document, then extracts its text three ways:
#   - plain text (pages separated by a form-feed)
#   - JSON array (one object per page)
#   - NDJSON (one JSON object per line) — ideal for streaming into an agent/RAG
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/extract-text/01-extract-text.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/extract-text"

mkdir -p "$OUTPUT_DIR"

echo "→ [1/4] Rendering a two-page source…"
pdfnative render \
  --input  "$ROOT_DIR/samples/extract-text/document.json" \
  --output "$OUTPUT_DIR/source.pdf"

echo "→ [2/4] Plain text:"
pdfnative extract-text --input "$OUTPUT_DIR/source.pdf" | tee "$OUTPUT_DIR/text.txt"

echo "→ [3/4] JSON (page 2 only):"
pdfnative extract-text --input "$OUTPUT_DIR/source.pdf" --format json --pages 2 --pretty

echo "→ [4/4] NDJSON (all pages, with positioned runs):"
pdfnative extract-text --input "$OUTPUT_DIR/source.pdf" --format ndjson --runs \
  > "$OUTPUT_DIR/pages.ndjson"
echo "  ✓ Wrote $OUTPUT_DIR/pages.ndjson"
