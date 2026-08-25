#!/usr/bin/env bash
# compare/01-compare.sh — text/structure diff of two PDFs (pdfnative-cli 1.4.0)
#
# Renders two near-identical contracts (one clause changed), then compares
# them. `compare` exits 1 (E_CHECK_FAILED) when differences are found — that
# non-zero exit is the FEATURE (CI-friendly), so this script handles it
# explicitly instead of letting `set -e` abort. A visual/pixel diff is out of
# scope: compare works on text and structure, never rendered pixels.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/compare/01-compare.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/compare"

mkdir -p "$OUTPUT_DIR"

echo "→ [1/4] Rendering version A…"
pdfnative render \
  --input  "$ROOT_DIR/samples/compare/document-a.json" \
  --output "$OUTPUT_DIR/contract-a.pdf"

echo "→ [2/4] Rendering version B (one clause changed)…"
pdfnative render \
  --input  "$ROOT_DIR/samples/compare/document-b.json" \
  --output "$OUTPUT_DIR/contract-b.pdf"

echo "→ [3/4] Comparing A vs B (differences expected — exit 1 is the signal):"
if pdfnative compare "$OUTPUT_DIR/contract-a.pdf" "$OUTPUT_DIR/contract-b.pdf"; then
  echo "  ✗ unexpected: the documents were reported identical"
  exit 1
else
  echo "  ✓ compare exited $? — differences detected, as expected for CI gating"
fi

echo "→ [4/4] Comparing A vs A (identical — exit 0):"
pdfnative compare "$OUTPUT_DIR/contract-a.pdf" "$OUTPUT_DIR/contract-a.pdf"
echo "  ✓ identical documents exit 0"
