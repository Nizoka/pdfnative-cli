#!/usr/bin/env bash
# inspect/02-text.sh — Render a PDF then inspect it (human-readable text output)
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/inspect/02-text.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output"
PDFA_PDF="$OUTPUT_DIR/pdfa/01-pdfa-1b.pdf"
INSPECT_OUT="$OUTPUT_DIR/inspect"

mkdir -p "$INSPECT_OUT" "$OUTPUT_DIR/pdfa"

# ── Step 1: render the PDF/A document (if not already rendered) ────────────
if [ ! -f "$PDFA_PDF" ]; then
  echo "→ Rendering PDF/A-1b document…"
  pdfnative render \
    --input  "$ROOT_DIR/samples/render/pdfa/01-pdfa-1b.json" \
    --output "$PDFA_PDF"
  echo "  ✓ Rendered: $PDFA_PDF"
fi

# ── Step 2: inspect — text report (stdout) ────────────────────────────────
echo "→ Inspecting PDF (text)…"
echo ""
pdfnative inspect \
  --input  "$PDFA_PDF" \
  --format text
