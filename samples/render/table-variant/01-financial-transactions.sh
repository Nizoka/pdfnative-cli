#!/usr/bin/env bash
# render/table-variant/01-financial-transactions.sh — table-centric render via PdfParams
#
# Demonstrates:
#   --variant table   (selects buildPDFBytes / PdfParams shape, not DocumentParams)
#
# Prerequisites:
#   - pdfnative-cli installed globally
#
# Usage:
#   bash samples/render/table-variant/01-financial-transactions.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/table-variant"

mkdir -p "$OUTPUT_DIR"

echo "→ Rendering table-variant ledger…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/table-variant/01-financial-transactions.json" \
  --output "$OUTPUT_DIR/01-financial-transactions.pdf" \
  --variant table

echo "  ✓ Output: $OUTPUT_DIR/01-financial-transactions.pdf"
