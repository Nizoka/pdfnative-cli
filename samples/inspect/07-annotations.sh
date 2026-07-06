#!/usr/bin/env bash
# inspect/07-annotations.sh — list a PDF's markup & link annotations
#
# `inspect --annotations` enumerates the markup annotations (highlight, text
# note, square, …) and link annotations present in a document — handy for a CI
# gate that asserts a review PDF still carries its reviewer notes. Page labels
# (/PageLabels) are reported automatically when present.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/inspect/07-annotations.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/inspect"

mkdir -p "$OUTPUT_DIR"

echo "→ [1/3] Rendering a base document…"
pdfnative render \
  --input  "$ROOT_DIR/samples/render/document/02-report.json" \
  --output "$OUTPUT_DIR/07-base.pdf"

echo "→ [2/3] Attaching markup annotations…"
pdfnative annotate \
  --input       "$OUTPUT_DIR/07-base.pdf" \
  --output      "$OUTPUT_DIR/07-annotated.pdf" \
  --annotations "$ROOT_DIR/samples/annotate/01-annotations.json"

echo "→ [3/3] Listing the annotations (JSON)…"
pdfnative inspect \
  --input       "$OUTPUT_DIR/07-annotated.pdf" \
  --annotations \
  --format json
