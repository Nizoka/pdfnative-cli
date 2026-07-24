#!/usr/bin/env bash
# fill/01-fill.sh — fill and flatten an AcroForm PDF (pdfnative 1.6.0)
#
# Renders an interactive form, lists its fields, fills them from a JSON map,
# then produces a flattened (non-editable) copy. The fill uses an incremental
# update, so an existing signature would stay valid for its revision.
#
# Prerequisites:
#   - pdfnative-cli installed globally: npm install -g pdfnative-cli
#
# Usage:
#   bash samples/fill/01-fill.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/samples/output/fill"

mkdir -p "$OUTPUT_DIR"

echo "→ [1/4] Rendering an interactive form…"
pdfnative render \
  --input  "$ROOT_DIR/samples/fill/form.json" \
  --output "$OUTPUT_DIR/form.pdf"

echo "→ [2/4] Discovering the form fields (and exporting a --data template)…"
pdfnative inspect --input "$OUTPUT_DIR/form.pdf" --form-fields --format text
# --export dumps the current values as a ready-to-edit --data map (read → edit → fill).
pdfnative fill --input "$OUTPUT_DIR/form.pdf" --export --output "$OUTPUT_DIR/template.json"
echo "  ↳ exported template: $OUTPUT_DIR/template.json"

echo "→ [3/4] Filling from form-values.json…"
pdfnative fill \
  --input  "$OUTPUT_DIR/form.pdf" \
  --data   "$ROOT_DIR/samples/fill/form-values.json" \
  --output "$OUTPUT_DIR/filled.pdf"
pdfnative inspect --input "$OUTPUT_DIR/filled.pdf" --form-fields --format text

echo "→ [4/4] Flattening (removes interactive fields)…"
pdfnative fill --input "$OUTPUT_DIR/filled.pdf" --flatten --output "$OUTPUT_DIR/flattened.pdf"
echo "  ✓ Outputs in $OUTPUT_DIR"
