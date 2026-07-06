#!/usr/bin/env bash
# merge/01-merge.sh — concatenate several PDFs into one (pdfnative 1.5.0 page-tree)
#
# Renders three standalone documents, then merges them into a single PDF while
# preserving each source's pages in order. `merge` accepts source PDFs as
# positional arguments (or repeated --input) and writes the combined file to
# --output.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/merge/01-merge.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/merge"

mkdir -p "$OUTPUT_DIR"

echo "→ [1/2] Rendering three source documents…"
pdfnative render --input "$ROOT_DIR/samples/render/document/01-minimal.json"       --output "$OUTPUT_DIR/part-a.pdf"
pdfnative render --input "$ROOT_DIR/samples/render/document/02-report.json"        --output "$OUTPUT_DIR/part-b.pdf"
pdfnative render --input "$ROOT_DIR/samples/render/document/04-invoice.json"       --output "$OUTPUT_DIR/part-c.pdf"

echo "→ [2/2] Merging into one PDF…"
pdfnative merge \
  "$OUTPUT_DIR/part-a.pdf" \
  "$OUTPUT_DIR/part-b.pdf" \
  "$OUTPUT_DIR/part-c.pdf" \
  --output "$OUTPUT_DIR/01-merged.pdf"

echo "  ✓ Output: $OUTPUT_DIR/01-merged.pdf"
echo "→ Page count of the merged document:"
pdfnative inspect --input "$OUTPUT_DIR/01-merged.pdf" --summary
