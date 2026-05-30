#!/usr/bin/env bash
# render/table-smart/01-smart-invoice.sh — smart tables via CLI flags (v1.0.0)
#
# Demonstrates pdfnative 1.2.0 smart-table flags. These fill any TableBlock
# fields left unset in the JSON (block-level JSON always wins). Here we feed a
# plain table and apply the smarts entirely from the command line.
#
# Usage:
#   bash samples/render/table-smart/01-smart-invoice.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
INPUT="$SCRIPT_DIR/01-smart-invoice.json"
OUT_DIR="$ROOT_DIR/samples/output/table-smart"
mkdir -p "$OUT_DIR"

echo "→ Rendering with smart-table flags (--zebra --repeat-header --table-wrap auto)…"
pdfnative render \
  --input          "$INPUT" \
  --output         "$OUT_DIR/01-smart-invoice.pdf" \
  --table-wrap     auto \
  --repeat-header \
  --zebra \
  --min-row-height 20 \
  --cell-padding   6

echo "  ✓ $OUT_DIR/01-smart-invoice.pdf"
