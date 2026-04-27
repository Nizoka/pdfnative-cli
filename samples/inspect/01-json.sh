#!/usr/bin/env bash
# inspect/01-json.sh — Render a PDF then inspect it (JSON output)
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/inspect/01-json.sh
#
# Output: samples/output/inspect/01-report-metadata.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output"
PDF="$OUTPUT_DIR/document/02-report.pdf"
INSPECT_OUT="$OUTPUT_DIR/inspect"

mkdir -p "$INSPECT_OUT"

# ── Step 1: render the source document (if not already rendered) ───────────
if [ ! -f "$PDF" ]; then
  echo "→ Rendering source document…"
  mkdir -p "$OUTPUT_DIR/document"
  pdfnative render \
    --input  "$ROOT_DIR/samples/render/document/02-report.json" \
    --output "$PDF"
  echo "  ✓ Rendered: $PDF"
fi

# ── Step 2: inspect — JSON report ─────────────────────────────────────────
echo "→ Inspecting PDF (JSON)…"
pdfnative inspect \
  --input  "$PDF" \
  --format json \
  --output "$INSPECT_OUT/01-report-metadata.json"

echo "  ✓ Report: $INSPECT_OUT/01-report-metadata.json"
echo ""
echo "Preview:"
cat "$INSPECT_OUT/01-report-metadata.json"
