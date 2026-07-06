#!/usr/bin/env bash
# render/inspect-layout/01-inspect-layout.sh — introspect the computed layout
#
# Two related render-time layout tools land in pdfnative 1.5.0:
#   • --inspect-layout  → instead of a PDF, emit a LayoutInspection JSON report
#                         describing every page's blocks, positions and sizes.
#   • --debug-layout    → render a normal PDF but overlay debug guides
#                         (margins, content boxes, table cells).
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/render/inspect-layout/01-inspect-layout.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/inspect-layout"
INPUT="$ROOT_DIR/samples/render/document/03-all-blocks.json"

mkdir -p "$OUTPUT_DIR"

echo "→ [1/2] Emitting the layout inspection report (JSON, no PDF)…"
pdfnative render \
  --input          "$INPUT" \
  --output         "$OUTPUT_DIR/01-layout.json" \
  --inspect-layout

echo "  ✓ Report: $OUTPUT_DIR/01-layout.json"

echo "→ [2/2] Rendering a PDF with debug guides overlaid…"
pdfnative render \
  --input        "$INPUT" \
  --output       "$OUTPUT_DIR/02-debug.pdf" \
  --debug-layout margins,content,cells

echo "  ✓ Output: $OUTPUT_DIR/02-debug.pdf"
