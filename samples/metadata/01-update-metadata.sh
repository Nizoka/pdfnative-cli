#!/usr/bin/env bash
# metadata/01-update-metadata.sh — incremental metadata update (pdfnative 1.7.0)
#
# Renders a document, rewrites its /Info metadata (title + author) with an
# INCREMENTAL save — the original bytes are preserved, so any existing
# signature stays valid for its revision — then inspects the result.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/metadata/01-update-metadata.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/metadata"

mkdir -p "$OUTPUT_DIR"

echo "→ [1/3] Rendering the source document…"
pdfnative render \
  --input  "$ROOT_DIR/samples/metadata/document.json" \
  --output "$OUTPUT_DIR/source.pdf"

echo "→ [2/3] Updating title + author (incremental — original bytes preserved)…"
pdfnative metadata \
  --input  "$OUTPUT_DIR/source.pdf" \
  --output "$OUTPUT_DIR/updated.pdf" \
  --title  "Quarterly Report — FY2026" \
  --author "Finance Team" \
  --mod-date "2026-01-15T00:00:00Z"

echo "→ [3/3] Inspecting the updated document:"
pdfnative inspect --input "$OUTPUT_DIR/updated.pdf" --format text
echo "  ✓ Wrote $OUTPUT_DIR/updated.pdf"
